import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, errorMessage } from '../supabase.js';
import { Alert, StatusBadge, Empty } from '../components/ui.jsx';
import { fmtTime, fmtDay, fmtDate, groupByDay, localTimeZone } from '../format.js';

function AddSlots({ session, onAdded }) {
  const [date, setDate] = useState(session.start_date);
  const [time, setTime] = useState('10:00');
  const [hours, setHours] = useState(1);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const start = new Date(`${date}T${time}:00`); // local time
    const rows = Array.from({ length: Number(hours) }, (_, i) => ({
      session_id: session.id,
      starts_at: new Date(start.getTime() + i * 3600_000).toISOString(),
    }));
    const { error } = await supabase.from('slots').insert(rows);
    setBusy(false);
    if (error) {
      const text = error.message.includes('slots_no_overlap')
        ? 'This overlaps one of your existing slots.' : errorMessage(error);
      return setMsg({ kind: 'error', text });
    }
    setMsg({ kind: 'success', text: `Added ${rows.length} slot${rows.length > 1 ? 's' : ''}.` });
    onAdded();
  };

  return (
    <form className="card stack" onSubmit={add}>
      <h3>Add availability</h3>
      <p className="muted small">
        Each 1-hour slot holds 10 interviews of 5 minutes, followed by a 10-minute buffer.
        Times are in your time zone ({localTimeZone}).
      </p>
      <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>
      <div className="row">
        <label>Date<input type="date" required value={date} min={session.start_date} max={session.end_date}
          onChange={(e) => setDate(e.target.value)} /></label>
        <label>Start<input type="time" required step={300} value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label>Hours
          <select value={hours} onChange={(e) => setHours(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
      </div>
      <button className="btn btn-primary" disabled={busy || session.status === 'closed'}>
        {busy ? 'Adding…' : 'Add slots'}
      </button>
    </form>
  );
}

function SlotCard({ subslots, onChange, setMsg }) {
  const first = subslots[0];
  const booked = subslots.filter((r) => r.booking_id).length;
  const end = new Date(new Date(first.slot_starts_at).getTime() + 3600_000).toISOString();

  const toggle = async () => {
    const { error } = await supabase.from('slots').update({ published: !first.published }).eq('id', first.slot_id);
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    onChange();
  };
  const remove = async () => {
    if (!confirm('Delete this 1-hour slot?')) return;
    const { error } = await supabase.from('slots').delete().eq('id', first.slot_id);
    if (error) setMsg({ kind: 'error', text: booked ? 'Students already booked this slot, so it cannot be deleted. Ask an administrator.' : errorMessage(error) });
    onChange();
  };

  return (
    <div className={`card slot ${first.published ? '' : 'unpublished'}`}>
      <div className="row-between">
        <h4>{fmtTime(first.slot_starts_at)}–{fmtTime(end)} <span className="muted small">{booked}/10 booked</span></h4>
        <div className="actions">
          <button className="btn btn-small" onClick={toggle}>{first.published ? 'Hide' : 'Publish'}</button>
          <button className="btn btn-small btn-danger" onClick={remove} disabled={booked > 0}>Delete</button>
        </div>
      </div>
      {!first.published && <p className="warn small">Hidden: students can't book this slot.</p>}
      <ol className="subslots">
        {subslots.map((r) => (
          <li key={r.subslot_id} className={r.booking_id ? 'taken' : ''}>
            <span className="time">{fmtTime(r.starts_at)}</span>
            {r.booking_id ? (
              <span>
                {r.student_name || r.student_email}
                {r.student_name && <span className="muted small"> · {r.student_email}</span>}
              </span>
            ) : <span className="muted">free</span>}
          </li>
        ))}
        <li className="buffer"><span className="time">{fmtTime(subslots[9].ends_at)}</span><span className="muted">buffer (10 min)</span></li>
      </ol>
    </div>
  );
}

export default function TeacherSession() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).single(),
      supabase.rpc('session_schedule', { p_session: id, p_all: false }),
    ]);
    const err = a.error || b.error;
    if (err) setMsg({ kind: 'error', text: errorMessage(err) });
    setSession(a.data);
    setRows(b.data || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!session) return <><p><Link to="/">← Back</Link></p><Alert>{msg?.text}</Alert></>;

  const bySlot = new Map();
  for (const r of rows) {
    if (!bySlot.has(r.slot_id)) bySlot.set(r.slot_id, []);
    bySlot.get(r.slot_id).push(r);
  }
  const slots = [...bySlot.values()];
  const total = rows.filter((r) => r.booking_id).length;

  return (
    <div>
      <p><Link to="/">← Back</Link></p>
      <h1>{session.title} <StatusBadge status={session.status} /></h1>
      <p className="muted">{fmtDate(session.start_date)} – {fmtDate(session.end_date)} · {slots.length} slots · {total} students booked</p>
      {session.description && <p>{session.description}</p>}
      <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>

      <div className="grid">
        <AddSlots session={session} onAdded={load} />
        <div className="card">
          <h3>How it works</h3>
          <ul className="small">
            <li>Students see only free 5-minute times, never your name.</li>
            <li>Each student books one time and may change it once.</li>
            <li>Hide a slot to stop new bookings; delete works only while it is empty.</li>
            <li>Refresh this page to see the latest bookings.</li>
          </ul>
          <button className="btn btn-small" onClick={load}>Refresh</button>
        </div>
      </div>

      <h2>Your slots</h2>
      {slots.length === 0 ? <Empty>No slots yet.</Empty> : (
        groupByDay(slots.map((s) => ({ starts_at: s[0].slot_starts_at, s })), 'starts_at').map(([day, items]) => (
          <section key={day}>
            <h3>{fmtDay(items[0].starts_at)}</h3>
            <div className="grid">
              {items.map(({ s }) => <SlotCard key={s[0].slot_id} subslots={s} onChange={load} setMsg={setMsg} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
