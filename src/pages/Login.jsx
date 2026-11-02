import { useState } from 'react';
import { supabase, providers, azureLabel, redirectTo, errorMessage } from '../supabase.js';
import { Alert } from '../components/ui.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const oauth = async (provider) => {
    setError('');
    const options = { redirectTo: redirectTo() };
    if (provider === 'azure') options.scopes = 'email openid profile';
    const { error } = await supabase.auth.signInWithOAuth({ provider, options });
    if (error) setError(errorMessage(error));
  };

  const magicLink = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setSent(true);
  };

  return (
    <main className="container narrow login">
      <div className="card">
        <h1>🗓️ Interview Planner</h1>
        <p className="muted">Sign in to book or manage interview slots.</p>
        <Alert onClose={() => setError('')}>{error}</Alert>

        <div className="stack">
          {providers.includes('azure') && (
            <button className="btn btn-primary btn-block" onClick={() => oauth('azure')}>
              Sign in with {azureLabel}
            </button>
          )}
          {providers.includes('google') && (
            <button className="btn btn-block" onClick={() => oauth('google')}>
              Sign in with Google
            </button>
          )}
        </div>

        {providers.includes('email') && (
          <>
            {(providers.includes('azure') || providers.includes('google')) && (
              <div className="divider"><span>or</span></div>
            )}
            {sent ? (
              <Alert kind="success">Check {email} for a sign-in link. Open it in this browser.</Alert>
            ) : (
              <form onSubmit={magicLink} className="stack">
                <label>
                  Email
                  <input type="email" required value={email} autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)} placeholder="name@stud.acs.upb.ro" />
                </label>
                <button className="btn btn-block" disabled={busy}>
                  {busy ? 'Sending…' : 'Email me a sign-in link'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
