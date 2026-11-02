import { createClient } from '@supabase/supabase-js';
import config from './config.js';

const url = import.meta.env.VITE_SUPABASE_URL || config.supabaseUrl;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || config.supabaseKey;

export const configured = Boolean(url && anonKey);

export const supabase = configured
  ? createClient(url, anonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    })
  : null;

export const providers = (import.meta.env.VITE_AUTH_PROVIDERS || config.authProviders)
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

export const azureLabel = import.meta.env.VITE_AZURE_LABEL || config.azureLabel;

// Where OAuth / magic links return: the app root, without the hash route.
export const redirectTo = () => window.location.origin + window.location.pathname;

export function errorMessage(err) {
  if (!err) return '';
  return err.message || err.error_description || String(err);
}

// Providers actually enabled in the Supabase project (so disabled buttons are hidden).
export async function enabledProviders() {
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    const ext = (await res.json()).external || {};
    return providers.filter((p) => ext[p]);
  } catch {
    return providers;
  }
}
