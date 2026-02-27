import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="avatar">{initials}</div>;
}

function MiniProgress({ completed, total }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: '99px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: pct === 100 ? '#16a34a' : '#7c3aed', minWidth: '32px' }}>{pct}%</span>
    </div>
  );
}

export default function Team() {
  const { dataUserId, viewProfile } = useImpersonation();
  const [members, setMembers] = useState([]);
  const [plansByUser, setPlansByUser] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!dataUserId || !supabase) { setLoading(false); return; }
        const teamId = viewProfile?.team_id;
        if (!teamId) { setMembers([]); setPlansByUser({}); setLoading(false); return; }
        const { data: users } = await supabase.from('users').select('id, full_name, email, role').eq('team_id', teamId).eq('role', 'rep');
        const list = users ?? [];
        setMembers(list);
        if (list.length === 0) { setPlansByUser({}); setLoading(false); return; }
        const { data: plans } = await supabase.from('development_plans').select('user_id, focus_areas, last_updated, status').in('user_id', list.map((m) => m.id)).eq('status', 'active');
        const byUser = {};
        (plans ?? []).forEach((p) => { byUser[p.user_id] = p; });
        setPlansByUser(byUser);
      } catch { setMembers([]); setPlansByUser({}); }
      finally { setLoading(false); }
    })();
  }, [dataUserId, viewProfile?.team_id]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading team…</div>;

  function planProgress(plan) {
    if (!plan?.focus_areas?.length) return { total: 0, completed: 0, sectionsTotal: 0, sectionsComplete: 0 };
    let total = 0, completed = 0, sectionsComplete = 0;
    plan.focus_areas.forEach((area) => {
      const ms = (area && area.milestones) || [];
      total += ms.length;
      const c = ms.filter((m) => m.status === 'completed').length;
      completed += c;
      if (ms.length > 0 && c === ms.length) sectionsComplete += 1;
    });
    return { total, completed, sectionsTotal: plan.focus_areas.length, sectionsComplete };
  }

  const withPlan = members.filter((m) => plansByUser[m.id]);
  const noPlan = members.filter((m) => !plansByUser[m.id]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Team overview</h1>
        <p className="page-subtitle">View your reps' development plans and progress.</p>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-value">{members.length}</div>
          <div className="stat-label">Team members</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{withPlan.length}</div>
          <div className="stat-label">Active plans</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>
            {members.filter((m) => {
              const p = planProgress(plansByUser[m.id]);
              return p.total > 0 && p.completed === p.total;
            }).length}
          </div>
          <div className="stat-label">Plans complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#94a3b8' }}>{noPlan.length}</div>
          <div className="stat-label">No plan yet</div>
        </div>
      </div>

      {members.length > 0 ? (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Team members</h2>
          </div>
          <div className="card-body-tight">
            {members.map((m) => {
              const plan = plansByUser[m.id];
              const progress = planProgress(plan);
              const allDone = progress.total > 0 && progress.completed === progress.total;
              return (
                <div key={m.id} className="list-item" style={{ padding: '14px 20px' }}>
                  <Avatar name={m.full_name || m.email} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                      <Link to={`/team/${m.id}`} className="text-link" style={{ fontSize: '0.9375rem' }}>
                        {m.full_name || m.email}
                      </Link>
                      {allDone && <span className="badge badge-green">All complete ✓</span>}
                      {plan && !allDone && <span className="badge badge-purple">Active plan</span>}
                      {!plan && <span className="badge badge-slate">No plan</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: progress.total > 0 ? '8px' : 0 }}>{m.email}</div>
                    {progress.total > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '320px' }}>
                        <MiniProgress completed={progress.completed} total={progress.total} />
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {progress.completed}/{progress.total} milestones · {progress.sectionsComplete}/{progress.sectionsTotal} sections
                        </span>
                      </div>
                    )}
                  </div>
                  <Link to={`/team/${m.id}`} className="btn btn-ghost btn-sm">
                    View →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <div>No team members found.</div>
              <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>Ensure your user has a team_id and reps are assigned to your team.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
