import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, errorMessage } from '../supabase.js';
import { useAuth } from '../auth.jsx';
import { Alert, StatusBadge, Empty } from '../components/ui.jsx';
import { fmtTime, fmtDay, fmtDate, fmtDateTime, groupByDay, localTimeZone } from '../format.js';

export default function StudentSession() {
  const { id } = useParams();
  const { profile } = useAuth();
  const [session, setSession] = useState(null);
  const [free, setFree] = useState([]);
  const [booking, setBooking] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).single(),
      supabase.rpc('available_subslots', { p_session: id }),
      supabase.rpc('my_bookings'),
    ]);
    if (a.error) setMsg({ kind: 'error', text: errorMessage(a.error) });
    else if (b.error) setMsg({ kind: 'error', text: errorMessage(b.error) });
    setSession(a.data);
    setFree(b.data || []);
    setBooking((c.data || []).find((r) => r.session_id === id) || null);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!session) return <><p><Link to="/">← Back</Link></p><Alert>{msg?.text}</Alert></>;

  // Several teachers may offer the same time: show each time once and book a random free subslot.
  const times = [];
  for (const t of free) {
    const last = times[times.length - 1];
    if (last && last.starts_at === t.starts_at) last.ids.push(t.subslot_id);
    else times.push({ starts_at: t.starts_at, ends_at: t.ends_at, ids: [t.subslot_id] });
  }

  const canChange = booking && booking.changes_left > 0 && new Date(booking.starts_at) > new Date();
  const open = session.status === 'open';
  const showPicker = open && (!booking || (canChange && changing));

  const book = async (slot) => {
    const warn = booking
      ? `Change your interview to ${fmtDateTime(slot.starts_at)}?\n\nThis is your only change. After it, your slot is final.`
      : `Book ${fmtDateTime(slot.starts_at)}?\n\nYou can change it only once afterwards.`;
    if (!confirm(warn)) return;
    setBusy(true);
    const pick = slot.ids[Math.floor(Math.random() * slot.ids.length)];
    const { error } = await supabase.rpc('book_subslot', { p_subslot: pick });
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: errorMessage(error) });
    else {
      setMsg({ kind: 'success', text: `Booked: ${fmtDateTime(slot.starts_at)}.` });
      setChanging(false);
    }
    load();
  };

  return (
    <div>
      <p><Link to="/">← Back</Link></p>
      <h1>{session.title} <StatusBadge status={session.status} /></h1>
      <p className="muted">{fmtDate(session.start_date)} – {fmtDate(session.end_date)}</p>
      {session.description && <p>{session.description}</p>}
      <Alert kind={msg?.kind} onClose={() => setMsg(null)}>{msg?.text}</Alert>

      {!profile?.full_name && (
        <Alert kind="info">Add your full name in <Link to="/profile">your profile</Link> so your interviewer knows who you are.</Alert>
      )}

      {booking ? (
        <div className="card highlight">
          <h3>Your interview</h3>
          <p className="big">{fmtDay(booking.starts_at)}<br />{fmtTime(booking.starts_at)}–{fmtTime(booking.ends_at)}</p>
          <p className="muted small">
            {booking.changes_left > 0 ? 'You can change this slot once.' : 'You have used your one change; this slot is final.'}
          </p>
          {canChange && open && !changing && (
            <button className="btn" onClick={() => setChanging(true)}>Change my slot</button>
          )}
          {changing && <button className="btn" onClick={() => setChanging(false)}>Keep my current slot</button>}
        </div>
      ) : !open ? (
        <Empty>Booking is not open right now.</Empty>
      ) : null}

      {showPicker && (
        <section>
          <h2>{booking ? 'Pick a new time' : 'Pick a time'}</h2>
          <p className="muted small">Each interview lasts 5 minutes. Times are in {localTimeZone}.</p>
          {times.length === 0 ? <Empty>No free times left. Check back later.</Empty> : (
            groupByDay(times).map(([day, items]) => (
              <div key={day} className="card">
                <h3>{fmtDay(items[0].starts_at)} <span className="muted small">{items.length} free</span></h3>
                <div className="times">
                  {items.map((t) => (
                    <button key={t.starts_at} className="time-btn" disabled={busy} onClick={() => book(t)}>
                      {fmtTime(t.starts_at)}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
