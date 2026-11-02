const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const localTimeZone = tz;

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function fmtDateTime(iso) {
  return `${fmtDay(iso)}, ${fmtTime(iso)}`;
}

export function fmtDate(d) {
  // d is 'YYYY-MM-DD'
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function groupByDay(items, key = 'starts_at') {
  const groups = new Map();
  for (const it of items) {
    const k = dayKey(it[key]);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.entries()];
}

export function parseEmails(text) {
  return [...new Set(
    text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),
  )];
}

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
