import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { getStoredToken, clearSession } from './auth';

// Edge Function gateway: `apikey` always carries the anon key (gateway-level
// project identification). `Authorization` carries the charity's custom JWT
// once logged in, falling back to the anon key before then.
//
// Mirrors thrive-vendor-portal/src/lib/api.ts. The anon key is a public
// Supabase project identifier and is safe to ship; Vercel env vars override.
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcWduZHloemxud29qdHVib3VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5NjE3MTksImV4cCI6MjA3NzUzNzcxOX0.EtIyUJ3kFILYV6bAIETAk6RE-ra7sEDd14bDG7PDVfg';
const DEFAULT_BASE_URL = 'https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
const BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
});

client.interceptors.request.use((config) => {
  const token = getStoredToken();
  config.headers.Authorization = token ? `Bearer ${token}` : `Bearer ${ANON_KEY}`;
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    // 401 means the JWT is invalid or expired. Clear it and let the router
    // send them back to sign in.
    if (err.response?.status === 401) clearSession();
    return Promise.reject(err);
  },
);

/** Pull the server's own sentence out of an axios error, if it sent one. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as AxiosError<{ error?: string; message?: string }>;
  return e?.response?.data?.error || e?.response?.data?.message || fallback;
}

/** The server's machine-readable code, used to branch on known cases. */
export function apiErrorCode(err: unknown): string | null {
  const e = err as AxiosError<{ code?: string }>;
  return e?.response?.data?.code ?? null;
}

async function get<T>(path: string, config?: AxiosRequestConfig) {
  return (await client.get<T>(path, config)).data;
}
async function post<T>(path: string, body?: unknown, config?: AxiosRequestConfig) {
  return (await client.post<T>(path, body, config)).data;
}
async function put<T>(path: string, body?: unknown, config?: AxiosRequestConfig) {
  return (await client.put<T>(path, body, config)).data;
}

export type ImageRole = 'logo' | 'highlight' | 'cover';

export interface CharityMe {
  id: number;
  name: string;
  category: string | null;
  about: string | null;
  description: string | null;
  ein: string | null;
  website: string | null;
  phone: string | null;
  location: string | null;
  contactName: string | null;
  logoUrl: string | null;
  highlightUrl: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  videoUrl: string | null;
  isActive: boolean;
  isPendingVerification: boolean;
}

export interface ReviewState {
  liveToDonors: boolean;
  pendingVerification: boolean;
  awaitingProfile: boolean;
  rejectedAt: string | null;
  rejectedReason: string | null;
  /** Never submitted: still theirs to edit, not in front of a reviewer. */
  isDraft: boolean;
  submittedAt: string | null;
  /** Advisory list of what still looks unfinished. Never blocks submitting. */
  missing: string[];
}

export interface AccessRequest {
  id: number;
  kind: 'signup' | 'claim';
  status: 'pending' | 'approved' | 'rejected';
  domainVerified: boolean;
  rejectionReason: string | null;
  charity: { id: number; name: string } | null;
}

export interface LookupMatch {
  id: number;
  name: string;
  ein: string | null;
  location: string | null;
  website: string | null;
  logoUrl: string | null;
  /** Someone already manages it. Who, deliberately, is not exposed. */
  alreadyClaimed: boolean;
  isYours: boolean;
}

/**
 * Upload an already-cropped image for one of the three roles.
 *
 * Multipart, so the browser sets its own boundary header. The JWT still
 * arrives via the request interceptor. The file must come from the cropper:
 * the server stores what it is handed and cannot check the aspect ratio.
 */
async function uploadImage(
  role: ImageRole,
  file: File,
): Promise<{ charity: CharityMe; role: ImageRole; url: string }> {
  const fd = new FormData();
  fd.append('image', file);
  const res = await client.post(`/charity/me/image/${role}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export const charityAPI = {
  /** Is this charity already on THRIVE? Drives both signup dedupe and claim. */
  lookup: (params: { ein?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params.ein) qs.set('ein', params.ein);
    if (params.q) qs.set('q', params.q);
    return get<{ matches: LookupMatch[]; searchedEin: string | null }>(
      `/charity/lookup?${qs.toString()}`,
    );
  },
  signup: (payload: Record<string, unknown>) =>
    post<{ charity: CharityMe }>('/charity/signup', payload),
  claim: (payload: Record<string, unknown>) =>
    post<{ request: AccessRequest; message: string }>('/charity/claim', payload),
  me: () =>
    get<{ charity: CharityMe | null; review?: ReviewState; request?: AccessRequest | null }>(
      '/charity/me',
    ),
  updateMe: (payload: Record<string, unknown>) =>
    put<{ charity: CharityMe }>('/charity/me', payload),
  /** First submission and re-submission after a rejection are the same call. */
  submitForReview: () =>
    post<{ success: boolean; message: string; alreadyLive?: boolean }>(
      '/charity/me/submit',
    ),
  uploadImage,
};
