import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errorMessage } from '../supabase.js';
import { useAuth } from '../auth.jsx';
import { Alert, StatusBadge, Empty } from '../components/ui.jsx';
import { fmtDate, fmtDateTime } from '../format.js';

function SessionForm({ onCreated }) {
  const [f, setF] = useState({ title: '', description: '', start_date: '', end_date: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const { data, error } = await supabase.from('sessions').insert({
      title: f.title.trim(), description: f.description.trim() || null,
      start_date: f.start_date, end_date: f.end_date,
    }).select().single();
    if (error) return setError(errorMessage(error));
    setF({ title: '', description: '', start_date: '', end_date: '' });
    onCreated(data);
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h3>New interview session</h3>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <label>Title<input required value={f.title} onChange={set('title')} placeholder="SO interviews, January 2027" /></label>
      <label>Description<textarea rows={2} value={f.description} onChange={set('description')} /></label>
      <div className="row">
        <label>Start date<input type="date" required value={f.start_date} onChange={set('start_date')} /></label>
        <label>End date<input type="date" required min={f.start_date} value={f.end_date} onChange={set('end_date')} /></label>
      </div>
      <button className="btn btn-primary">Create session</button>
    </form>
  );
}

export default function Home() {
  const { email, isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [roles, setRoles] = useState({});
  const [bookings, setBookings] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, m, b] = await Promise.all([
      supabase.from('sessions').select('*').order('start_date', { ascending: false }),
      supabase.from('session_members').select('session_id, role').eq('email', email),
      supabase.rpc('my_bookings'),
    ]);
    const err = s.error || m.error || b.error;
    if (err) setError(errorMessage(err));
    setSessions(s.data || []);
    setRoles(Object.fromEntries((m.data || []).map((r) => [r.session_id, r.role])));
    setBookings(Object.fromEntries((b.data || []).map((r) => [r.session_id, r])));
    setLoading(false);
  }, [email]);

  useEffect(() => { load(); }, [load]);

  const teaching = sessions.filter((s) => roles[s.id] === 'teacher');
  const booking = sessions.filter((s) => roles[s.id] !== 'teacher' && s.status !== 'draft');

  return (
    <div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      {loading && <p className="muted">Loading…</p>}

      {isAdmin && (
        <section>
          <h2>Administration</h2>
          <div className="grid">
            <SessionForm onCreated={load} />
            <div className="card">
              <h3>All sessions</h3>
              {sessions.length === 0 ? <Empty>No sessions yet.</Empty> : (
                <ul className="list">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <Link to={`/admin/${s.id}`}>{s.title}</Link> <StatusBadge status={s.status} />
                      <div className="muted small">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {teaching.length > 0 && (
        <section>
          <h2>Sessions you interview in</h2>
          <div className="grid">
            {teaching.map((s) => (
              <Link key={s.id} to={`/teach/${s.id}`} className="card card-link">
                <h3>{s.title} <StatusBadge status={s.status} /></h3>
                <p className="muted small">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</p>
                <span className="btn btn-small">Manage my slots →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(booking.length > 0 || (!loading && !isAdmin && teaching.length === 0)) && (
        <section>
          <h2>Your interviews</h2>
          {booking.length === 0 ? (
            <Empty>No interview session is open for you yet. You will see it here once it opens.</Empty>
          ) : (
            <div className="grid">
              {booking.map((s) => {
                const b = bookings[s.id];
                return (
                  <Link key={s.id} to={`/book/${s.id}`} className="card card-link">
                    <h3>{s.title} <StatusBadge status={s.status} /></h3>
                    <p className="muted small">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</p>
                    {b ? (
                      <p className="booked">✅ {fmtDateTime(b.starts_at)}</p>
                    ) : (
                      <p className="warn">No slot booked yet</p>
                    )}
                    <span className="btn btn-small">{b ? 'View booking →' : 'Book a slot →'}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
