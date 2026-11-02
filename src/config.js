// Public client configuration. The publishable (anon) key is safe to ship:
// all data access is protected by row-level security in the database.
// Build-time VITE_* variables override these values.
export default {
  supabaseUrl: 'https://boxuxselwovsqfwpcdpx.supabase.co',
  supabaseKey: 'sb_publishable_yRkAnNhEyzfCHKhcSfly9A_HLYlGcfC',
  authProviders: 'azure,google,email',
  azureLabel: 'UPB Microsoft account',
};
