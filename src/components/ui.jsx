export function Alert({ kind = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button className="link" onClick={onClose} aria-label="Dismiss">✕</button>}
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function Empty({ children }) {
  return <p className="empty muted">{children}</p>;
}
