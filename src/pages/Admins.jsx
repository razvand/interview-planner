import { useEffect, useState, useCallback } from 'react';
import { supabase, errorMessage } from '../supabase.js';
import { useAuth } from '../auth.jsx';
import { Alert } from '../components/ui.jsx';
import { parseEmails } from '../format.js';

export default function Admins() {
  const { email: me } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('admin_emails').select('*').order('email');
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    setAdmins(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    const emails = parseEmails(text);
    if (!emails.length) return;
    const { error } = await supabase.from('admin_emails').upsert(emails.map((email) => ({ email })));
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    setText('');
    load();
  };

  const remove = async (email) => {
    if (email === me) return setMsg({ kind: 'error', text: "You can't remove yourself." });
    if (!confirm(`Remove administrator ${email}?`)) return;
    const { error } = await supabase.from('admin_emails').delete().eq('email', email);
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    load();
  };

  return (
    <div className="narrow">
      <h1>Administrators</h1>
      <div className="card stack">
        <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>
        <ul className="list compact">
          {admins.map((a) => (
            <li key={a.email} className="row-between">
              <span>{a.email}</span>
              {a.email !== me && <button className="link danger" onClick={() => remove(a.email)}>Remove</button>}
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="stack">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="new.admin@upb.ro" />
          <button className="btn">Add administrator</button>
        </form>
      </div>
    </div>
  );
}
