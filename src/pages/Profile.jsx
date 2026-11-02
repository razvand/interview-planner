import { useState } from 'react';
import { supabase, errorMessage } from '../supabase.js';
import { useAuth } from '../auth.jsx';
import { Alert } from '../components/ui.jsx';

export default function Profile() {
  const { user, profile, refreshProfile, isAdmin } = useAuth();
  const [name, setName] = useState(profile?.full_name || '');
  const [msg, setMsg] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', user.id);
    setMsg(error ? { kind: 'error', text: errorMessage(error) } : { kind: 'success', text: 'Saved.' });
    if (!error) refreshProfile();
  };

  return (
    <div className="narrow">
      <h1>Your profile</h1>
      <div className="card">
        <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>
        <p><strong>Email:</strong> {user.email}{isAdmin && <span className="badge">admin</span>}</p>
        <form onSubmit={save} className="stack">
          <label>
            Full name (shown to your interviewers)
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <button className="btn btn-primary">Save</button>
        </form>
      </div>
    </div>
  );
}
