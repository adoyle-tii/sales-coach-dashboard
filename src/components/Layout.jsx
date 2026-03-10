import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';

function Avatar({ name, size = '' }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className={`avatar ${size}`}>{initials}</div>;
}

export default function Layout({ user, profile, onSignOut }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { viewProfile, isImpersonating, exitImpersonation, realProfile } = useImpersonation();
  const displayProfile = viewProfile ?? profile;
  // When impersonating, show nav links for the impersonated user's role
  const navProfile = isImpersonating ? displayProfile : realProfile;
  const isAdmin = !isImpersonating && (realProfile?.role === 'superadmin' || (realProfile?.role === 'admin' && realProfile?.can_impersonate));
  const isManager = ['manager', 'leader', 'senior_leader', 'executive', 'admin', 'superadmin'].includes(navProfile?.role);
  const isRegional = ['senior_leader', 'leader', 'executive', 'admin', 'superadmin'].includes(navProfile?.role);

  const active = (path) => location.pathname.startsWith(path) ? 'active' : '';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-icon">🎯</div>
            Sales Coach
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          <Link to="/my" className={active('/my')}>
            <span className="nav-icon">🏠</span> My Dashboard
          </Link>
          {isManager && (
            <Link to="/team" className={active('/team')}>
              <span className="nav-icon">👥</span> Team
            </Link>
          )}
          {isRegional && (
            <Link to="/regional" className={active('/regional')}>
              <span className="nav-icon">🌍</span> {navProfile?.role === 'senior_leader' ? 'My Region' : 'Regional View'}
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className={active('/admin')}>
              <span className="nav-icon">⚙️</span> Admin
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <Avatar name={displayProfile?.full_name || user?.email} size="avatar-sm" />
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">{displayProfile?.full_name || user?.email}</div>
              <div className="sidebar-user-role">{displayProfile?.role || 'rep'}</div>
            </div>
          </div>
          <button
            type="button"
            className="nav-btn"
            onClick={() => { onSignOut(); navigate('/login'); }}
            style={{ marginTop: '4px', color: '#94a3b8' }}
          >
            <span className="nav-icon">↩</span> Sign out
          </button>
        </div>
      </aside>

      <div className="main-content">
        {isImpersonating && (
          <div className="impersonation-banner">
            <span>
              👁 Viewing as <strong>{displayProfile?.full_name || 'user'}</strong>
              {displayProfile?.role && <span style={{ marginLeft: 6, opacity: 0.7 }}>({displayProfile.role})</span>}
            </span>
            <button
              type="button"
              className="btn btn-exit btn-sm"
              onClick={() => { exitImpersonation(); navigate('/admin'); }}
            >
              Exit impersonation
            </button>
          </div>
        )}
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
