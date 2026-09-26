import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY_URL = 'biznexco_supabase_url';
const STORAGE_KEY_ANON = 'biznexco_supabase_anon_key';

// In-memory fallback if localStorage is unavailable (Node.js runtime)
const memoryStore: Record<string, string> = {};

function safeGetStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function safeSetStorage(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStore[key] = val;
}

function safeRemoveStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {}
  delete memoryStore[key];
}

export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  // Check localStorage first (user customized via UI), then process/Vite environment variables
  const envUrl =
    (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_URL : undefined) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_URL : undefined) ||
    '';

  const envAnonKey =
    (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_ANON_KEY : undefined) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env.VITE_SUPABASE_ANON_KEY : undefined) ||
    '';

  const url = safeGetStorage(STORAGE_KEY_URL) || envUrl;
  const anonKey = safeGetStorage(STORAGE_KEY_ANON) || envAnonKey;

  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('https://') &&
    url.includes('supabase.co') &&
    anonKey.length > 20
  );

  return { url, anonKey, isConfigured };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  safeSetStorage(STORAGE_KEY_URL, url.trim());
  safeSetStorage(STORAGE_KEY_ANON, anonKey.trim());
  // Invalidate cached client
  cachedClient = null;
}

export function clearSupabaseConfig(): void {
  safeRemoveStorage(STORAGE_KEY_URL);
  safeRemoveStorage(STORAGE_KEY_ANON);
  cachedClient = null;
}


let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}
