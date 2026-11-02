export default function NotConfigured() {
  return (
    <main className="container narrow">
      <div className="card">
        <h1>Interview Planner</h1>
        <p>This deployment is not connected to a backend yet.</p>
        <p className="muted">
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (as GitHub repository
          variables for the Pages build, or in <code>.env.local</code> for local development).
          See the README for setup steps.
        </p>
      </div>
    </main>
  );
}
