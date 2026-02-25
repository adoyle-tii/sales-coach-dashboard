import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';

export default function Layout({ user, profile, onSignOut }) {
  const navigate = useNavigate();
  const { viewProfile, isImpersonating, exitImpersonation, realProfile } = useImpersonation();
  const displayProfile = viewProfile ?? profile;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {isImpersonating && (
        <div style={{ padding: '8px 24px', background: '#fef3c7', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
          <span>Impersonating: <strong>{displayProfile?.full_name || 'Unknown user'}</strong></span>
          <button type="button" onClick={() => { exitImpersonation(); navigate('/admin'); }} style={{ padding: '4px 12px', cursor: 'pointer', background: '#fcd34d', border: 'none', borderRadius: '4px', fontWeight: 600 }}>
            Exit impersonation
          </button>
        </div>
      )}
      <header style={{ padding: '12px 24px', background: '#1e293b', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Sales Coach</h1>
        <nav style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <Link to="/my" style={{ color: 'white', textDecoration: 'none' }}>My Dashboard</Link>
          {displayProfile?.role === 'manager' && (
            <Link to="/team" style={{ color: 'white', textDecoration: 'none' }}>Team</Link>
          )}
          {realProfile?.role === 'superadmin' && (
            <Link to="/admin" style={{ color: '#fcd34d', textDecoration: 'none', fontWeight: 600 }}>Admin</Link>
          )}
          <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>{displayProfile?.full_name || user?.email}</span>
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
