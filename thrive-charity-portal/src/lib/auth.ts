// Charity portal auth wraps the same /auth/signup + /auth/login endpoints the
// donor app uses. The backend signs a custom JWT with JWT_SECRET; we store it
// in localStorage and add it to every API request via the api.ts interceptor.

import axios from 'axios';

// Defaults match the donor-app + admin-panel — the anon key is a public Supabase
// project identifier (safe to ship). Vercel env vars override if set.
const DEFAULT_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kcWduZHloemxud29qdHVib3VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5NjE3MTksImV4cCI6MjA3NzUzNzcxOX0.EtIyUJ3kFILYV6bAIETAk6RE-ra7sEDd14bDG7PDVfg';
const DEFAULT_BASE_URL = 'https://mdqgndyhzlnwojtubouh.supabase.co/functions/v1/api';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
const BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;
const TOKEN_KEY = 'thrive_charity_jwt';
const USER_KEY = 'thrive_charity_user';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

const authClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  },
});

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function persistSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function signUp(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}): Promise<{ token: string; user: AuthUser }> {
  const res = await authClient.post('/auth/signup', {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
    firstName: payload.firstName,
    lastName: payload.lastName || '',
    role: 'charityAdmin',
  });
  // Backend may return { token, user } or { authToken, user } depending on flow.
  const token = res.data?.token || res.data?.authToken;
  const user = res.data?.user || res.data;
  if (!token) throw new Error('Signup succeeded but no token returned');
  persistSession(token, user);
  return { token, user };
}

export async function signIn(payload: { email: string; password: string }): Promise<{ token: string; user: AuthUser }> {
  const res = await authClient.post('/auth/login', {
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
  });
  const token = res.data?.token || res.data?.authToken;
  const user = res.data?.user || res.data;
  if (!token) throw new Error('Login response missing token');
  persistSession(token, user);
  return { token, user };
}

export async function signOut() {
  clearSession();
}

export async function forgotPassword(email: string): Promise<void> {
  await authClient.post('/auth/forgot-password', {
    email: email.trim().toLowerCase(),
    portal: 'vendor',
  });
}

export async function resetPassword(payload: {
  token: string;
  email: string;
  newPassword: string;
}): Promise<void> {
  await authClient.post('/auth/reset-password', {
    token: payload.token,
    email: payload.email.trim().toLowerCase(),
    newPassword: payload.newPassword,
  });
}

// Authenticated password change — vendor must be signed in. The api.ts
// request interceptor attaches the JWT, so no token plumbing is needed here.
export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const token = getStoredToken();
  await axios.post(
    `${BASE_URL}/auth/change-password`,
    {
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: token ? `Bearer ${token}` : `Bearer ${ANON_KEY}`,
      },
    },
  );
}
