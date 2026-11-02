import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));

  const loadUser = useCallback(async (sess) => {
    setSession(sess);
    if (!sess) {
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const [{ data: prof }, { data: admin }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', sess.user.id).maybeSingle(),
      supabase.rpc('is_admin'),
    ]);
    setProfile(prof);
    setIsAdmin(Boolean(admin));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => loadUser(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Defer to avoid calling Supabase inside the auth callback.
      setTimeout(() => loadUser(sess), 0);
      // Clean the ?code= left by the PKCE redirect.
      if (window.location.search.includes('code=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUser]);

  const value = {
    session,
    user: session?.user ?? null,
    email: session?.user?.email?.toLowerCase() ?? '',
    profile,
    isAdmin,
    loading,
    refreshProfile: () => loadUser(session),
    signOut: () => supabase.auth.signOut(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
