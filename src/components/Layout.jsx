import { Link, Outlet, useNavigate } from 'react-router-dom';

export default function Layout({ user, profile, onSignOut }) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '12px 24px', background: '#1e293b', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Sales Coach</h1>
        <nav style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link to="/my" style={{ color: 'white', textDecoration: 'none' }}>My Dashboard</Link>
          {profile?.role === 'manager' && (
            <Link to="/team" style={{ color: 'white', textDecoration: 'none' }}>Team</Link>
          )}
          {profile?.role === 'superadmin' && (
            <Link to="/admin" style={{ color: '#fcd34d', textDecoration: 'none', fontWeight: 600 }}>Admin</Link>
          )}
          <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>{profile?.full_name || user?.email}</span>
          <button type="button" onClick={() => { onSignOut(); navigate('/login'); }} style={{ padding: '6px 12px', cursor: 'pointer' }}>
            Sign out
          </button>
        </nav>
      </header>
      <main style={{ flex: 1, padding: '24px' }}>
        <Outlet />
      </main>
    </div>
  );
}
