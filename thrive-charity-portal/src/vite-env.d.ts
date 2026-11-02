/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Supabase project identifier. Safe to ship; overridden per env. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Edge Function base, e.g. https://<ref>.supabase.co/functions/v1/api */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
