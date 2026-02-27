import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';

export default function Team() {
  const { dataUserId, viewProfile } = useImpersonation();
  const [members, setMembers] = useState([]);
  const [plansByUser, setPlansByUser] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!dataUserId || !supabase) {
          setLoading(false);
          return;
        }
        const teamId = viewProfile?.team_id;
        if (!teamId) {
          setMembers([]);
          setPlansByUser({});
          setLoading(false);
          return;
        }
        const { data: users } = await supabase.from('users').select('id, full_name, email, role').eq('team_id', teamId).eq('role', 'rep');
        const list = users ?? [];
        setMembers(list);
        if (list.length === 0) {
          setPlansByUser({});
          setLoading(false);
          return;
        }
        const { data: plans } = await supabase
          .from('development_plans')
          .select('user_id, focus_areas, last_updated, status')
          .in('user_id', list.map((m) => m.id))
          .eq('status', 'active');
        const byUser = {};
        (plans ?? []).forEach((p) => {
          byUser[p.user_id] = p;
        });
        setPlansByUser(byUser);
      } catch {
        setMembers([]);
        setPlansByUser({});
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUserId, viewProfile?.team_id]);

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading team…</div>;

  function planProgress(plan) {
    if (!plan?.focus_areas?.length) return { total: 0, completed: 0, sectionsTotal: 0, sectionsComplete: 0 };
    let total = 0;
    let completed = 0;
    let sectionsComplete = 0;
    plan.focus_areas.forEach((area) => {
      const milestones = (area && area.milestones) || [];
      const n = milestones.length;
      total += n;
      const c = milestones.filter((m) => m.status === 'completed').length;
      completed += c;
      if (n > 0 && c === n) sectionsComplete += 1;
    });
    return { total, completed, sectionsTotal: plan.focus_areas.length, sectionsComplete };
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>Team overview</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>View your team members and their development plan progress. Click a rep to see assessments, coaching sessions, and full plan details.</p>
      {members.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {members.map((m) => {
            const plan = plansByUser[m.id];
            const progress = planProgress(plan);
            return (
              <li key={m.id} style={{ padding: '16px', background: 'white', borderRadius: '8px', marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <Link to={`/team/${m.id}`} style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none', display: 'block', marginBottom: '4px' }}>
                  {m.full_name || m.email}
                </Link>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '8px' }}>{m.email}</div>
                {progress.total > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', fontSize: '0.8rem' }}>
                    <span style={{ color: '#16a34a', fontWeight: 600, background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px' }}>Active plan</span>
                    <span style={{ color: '#475569' }}>
                      <strong>Milestones:</strong> {progress.completed}/{progress.total} complete
                    </span>
                    {progress.sectionsTotal > 0 && (
                      <span style={{ color: '#475569' }}>
                        <strong>Sections:</strong> {progress.sectionsComplete}/{progress.sectionsTotal} complete
                      </span>
                    )}
                    {progress.total === progress.completed && progress.total > 0 && (
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>All complete — ready to close</span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No active development plan</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={{ color: '#64748b' }}>No team members found. Ensure your user has a team_id and reps are assigned to your team.</p>
      )}
    </div>
  );
}
