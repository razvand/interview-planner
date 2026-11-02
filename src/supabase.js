import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && anonKey);

export const supabase = configured
  ? createClient(url, anonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
    })
  : null;

export const providers = (import.meta.env.VITE_AUTH_PROVIDERS || 'azure,google,email')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

export const azureLabel = import.meta.env.VITE_AZURE_LABEL || 'UPB Microsoft account';

// Where OAuth / magic links return: the app root, without the hash route.
export const redirectTo = () => window.location.origin + window.location.pathname;

export function errorMessage(err) {
  if (!err) return '';
  return err.message || err.error_description || String(err);
}
