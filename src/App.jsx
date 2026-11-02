import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { configured } from './supabase.js';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import AdminSession from './pages/AdminSession.jsx';
import Admins from './pages/Admins.jsx';
import TeacherSession from './pages/TeacherSession.jsx';
import StudentSession from './pages/StudentSession.jsx';
import Profile from './pages/Profile.jsx';
import NotConfigured from './pages/NotConfigured.jsx';

export default function App() {
  const { user, loading, profile, isAdmin, signOut } = useAuth();
  if (!configured) return <NotConfigured />;

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login />;

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">🗓️ Interview Planner</Link>
        <nav>
          {isAdmin && <Link to="/admins">Admins</Link>}
          <Link to="/profile" title={user.email}>{profile?.full_name || user.email}</Link>
          <button className="link" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/:id" element={isAdmin ? <AdminSession /> : <Navigate to="/" />} />
          <Route path="/admins" element={isAdmin ? <Admins /> : <Navigate to="/" />} />
          <Route path="/teach/:id" element={<TeacherSession />} />
          <Route path="/book/:id" element={<StudentSession />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <footer className="footer muted">
        Open source · <a href="https://github.com/razvand/interview-planner">GitHub</a>
      </footer>
    </>
  );
}
