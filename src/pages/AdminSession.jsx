import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase, errorMessage } from '../supabase.js';
import { Alert, StatusBadge, Empty } from '../components/ui.jsx';
import { fmtTime, fmtDay, fmtDateTime, groupByDay, parseEmails, downloadCsv } from '../format.js';

function Members({ sessionId, role, members, onChange }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const list = members.filter((m) => m.role === role);

  const add = async (e) => {
    e.preventDefault();
    const emails = parseEmails(text);
    if (!emails.length) return setMsg({ kind: 'error', text: 'No valid email addresses found.' });
    const { error } = await supabase.from('session_members')
      .upsert(emails.map((email) => ({ session_id: sessionId, email, role })), { onConflict: 'session_id,email' });
    if (error) return setMsg({ kind: 'error', text: errorMessage(error) });
    setText('');
    setMsg({ kind: 'success', text: `Added ${emails.length} ${role}${emails.length > 1 ? 's' : ''}.` });
    onChange();
  };

  const remove = async (email) => {
    if (!confirm(`Remove ${email}?`)) return;
    const { error } = await supabase.from('session_members').delete().eq('session_id', sessionId).eq('email', email);
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    onChange();
  };

  return (
    <div className="card stack">
      <h3>{role === 'teacher' ? 'Teachers' : 'Invited students'} ({list.length})</h3>
      <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>
      <form onSubmit={add} className="stack">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Paste emails, separated by commas, spaces or new lines" />
        <button className="btn">Add {role}s</button>
      </form>
      {list.length === 0 ? <Empty>None yet.</Empty> : (
        <ul className="list compact scroll">
          {list.map((m) => (
            <li key={m.email} className="row-between">
              <span>{m.email}</span>
              <button className="link danger" onClick={() => remove(m.email)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminSession() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).single(),
      supabase.from('session_members').select('*').eq('session_id', id).order('email'),
      supabase.rpc('session_schedule', { p_session: id, p_all: true }),
    ]);
    const err = a.error || b.error || c.error;
    if (err) setMsg({ kind: 'error', text: errorMessage(err) });
    setS(a.data);
    setMembers(b.data || []);
    setRows(c.data || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!s) return <p className="muted">Loading…</p>;
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('sessions').update({
      title: s.title, description: s.description || null, start_date: s.start_date, end_date: s.end_date,
      status: s.status, student_access: s.student_access,
      allowed_domain: s.allowed_domain?.trim().toLowerCase() || null,
    }).eq('id', id);
    setMsg(error ? { kind: 'error', text: errorMessage(error) } : { kind: 'success', text: 'Session saved.' });
  };

  const del = async () => {
    if (!confirm('Delete this session with all its slots and bookings? This cannot be undone.')) return;
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) return setMsg({ kind: 'error', text: errorMessage(error) });
    nav('/');
  };

  const cancelBooking = async (bookingId, who) => {
    if (!confirm(`Cancel the booking of ${who}? They will be able to book a new slot.`)) return;
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    load();
  };

  const slots = new Set(rows.map((r) => r.slot_id)).size;
  const booked = rows.filter((r) => r.booking_id).length;
  const teachersWithSlots = new Set(rows.map((r) => r.teacher_id)).size;

  const exportCsv = () => downloadCsv(`${s.title.replace(/\W+/g, '_')}_schedule.csv`, [
    ['start', 'end', 'teacher_email', 'teacher_name', 'student_email', 'student_name', 'changed'],
    ...rows.map((r) => [r.starts_at, r.ends_at, r.teacher_email, r.teacher_name,
      r.student_email || '', r.student_name || '', r.booking_id ? (r.change_count ? 'yes' : 'no') : '']),
  ]);

  return (
    <div>
      <p><Link to="/">← All sessions</Link></p>
      <h1>{s.title} <StatusBadge status={s.status} /></h1>
      <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>

      <div className="stats">
        <div><strong>{members.filter((m) => m.role === 'teacher').length}</strong><span>teachers invited</span></div>
        <div><strong>{teachersWithSlots}</strong><span>teachers with slots</span></div>
        <div><strong>{slots}</strong><span>1-hour slots</span></div>
        <div><strong>{booked} / {slots * 10}</strong><span>subslots booked</span></div>
      </div>

      <div className="grid">
        <form className="card stack" onSubmit={save}>
          <h3>Session settings</h3>
          <label>Title<input required value={s.title} onChange={set('title')} /></label>
          <label>Description<textarea rows={2} value={s.description || ''} onChange={set('description')} /></label>
          <div className="row">
            <label>Start date<input type="date" required value={s.start_date} onChange={set('start_date')} /></label>
            <label>End date<input type="date" required min={s.start_date} value={s.end_date} onChange={set('end_date')} /></label>
          </div>
          <label>Status
            <select value={s.status} onChange={set('status')}>
              <option value="draft">Draft: teachers add slots, students can't see it</option>
              <option value="open">Open: students can book</option>
              <option value="closed">Closed: read-only</option>
            </select>
          </label>
          <label>Who can book
            <select value={s.student_access} onChange={set('student_access')}>
              <option value="invited">Only invited students</option>
              <option value="open">Any signed-in user (optionally limited by domain)</option>
            </select>
          </label>
          {s.student_access === 'open' && (
            <label>Allowed email domain (optional)
              <input value={s.allowed_domain || ''} onChange={set('allowed_domain')} placeholder="upb.ro" />
              <span className="muted small">Subdomains are included (e.g. stud.acs.upb.ro).</span>
            </label>
          )}
          <div className="row-between">
            <button className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-danger" onClick={del}>Delete session</button>
          </div>
        </form>

        <Members sessionId={id} role="teacher" members={members} onChange={load} />
        {s.student_access === 'invited' && <Members sessionId={id} role="student" members={members} onChange={load} />}
      </div>

      <section>
        <div className="row-between">
          <h2>Schedule</h2>
          {rows.length > 0 && <button className="btn btn-small" onClick={exportCsv}>Export CSV</button>}
        </div>
        {rows.length === 0 ? <Empty>No slots yet. Teachers add them from their session page.</Empty> : (
          groupByDay(rows, 'slot_starts_at').map(([day, dayRows]) => (
            <div key={day} className="card">
              <h3>{fmtDay(dayRows[0].slot_starts_at)}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Time</th><th>Teacher</th><th>Student</th><th></th></tr></thead>
                  <tbody>
                    {dayRows.map((r) => (
                      <tr key={r.subslot_id} className={r.booking_id ? '' : 'free'}>
                        <td>{fmtTime(r.starts_at)}–{fmtTime(r.ends_at)}</td>
                        <td>{r.teacher_name || r.teacher_email}{!r.published && <span className="badge">hidden</span>}</td>
                        <td>{r.booking_id ? <>{r.student_name || r.student_email}{r.student_name && <div className="muted small">{r.student_email}</div>}</> : <span className="muted">free</span>}</td>
                        <td>{r.booking_id && (
                          <button className="link danger" onClick={() => cancelBooking(r.booking_id, r.student_email)}>Cancel</button>
                        )}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
        <p className="muted small">Times shown in your local time zone. Last updated {fmtDateTime(new Date().toISOString())}.</p>
      </section>
    </div>
  );
}
