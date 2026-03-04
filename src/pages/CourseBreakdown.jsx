import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';
import { ScoreBar, scoreColor } from '../components/SpiderChart';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
    }}>{initials}</div>
  );
}

function StatusBadge({ pct, complete, status }) {
  if (complete) return <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '99px', padding: '2px 8px' }}>Complete</span>;
  if (pct > 0) return <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '99px', padding: '2px 8px' }}>In Progress</span>;
  return <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 8px' }}>Not Started</span>;
}

function LessonBar({ pct, complete }) {
  const color = complete ? '#16a34a' : pct >= 50 ? '#2563eb' : pct > 0 ? '#d97706' : '#e2e8f0';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${complete ? 100 : pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: '34px', textAlign: 'right' }}>{complete ? 100 : pct}%</span>
    </div>
  );
}

function GroupCard({ group, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = group.completion_pct ?? 0;
  const barColor = pct === 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
  const roleLabelMap = { leader: 'Leader', senior_leader: 'Senior Leader', manager: 'Manager', rep: 'Rep' };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}>
      {/* Group header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ padding: '14px 18px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: open ? '1px solid #e2e8f0' : 'none' }}
      >
        <Avatar name={group.full_name || group.email} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{group.full_name || group.email}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>
              {roleLabelMap[group.role] || group.role}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{group.rep_count} rep{group.rep_count !== 1 ? 's' : ''}</span>
            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>{group.completed} complete</span>
            {group.in_progress > 0 && <span style={{ fontSize: '0.75rem', color: '#d97706' }}>{group.in_progress} in progress</span>}
            {group.not_started > 0 && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{group.not_started} not started</span>}
            {group.sa_avg_score != null && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: scoreColor(group.sa_avg_score), background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '99px', padding: '1px 7px' }}>
                SA avg {group.sa_avg_score.toFixed(1)}/5
              </span>
            )}
          </div>
        </div>

        {/* Completion bar */}
        <div style={{ width: '140px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{group.completed}/{group.rep_count}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: barColor }}>{pct}%</span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
        </div>

        <Link
          to={`/team/view/${group.id}`}
          onClick={(e) => e.stopPropagation()}
          className="btn btn-ghost btn-sm"
          style={{ flexShrink: 0 }}
        >View team →</Link>

        <span style={{ color: '#94a3b8', fontSize: '1rem', flexShrink: 0, marginLeft: '4px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Rep rows */}
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rep</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Progress</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lessons</th>
                {group.reps.some((r) => r.sa_total > 0) && (
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SA</th>
                )}
              </tr>
            </thead>
            <tbody>
              {group.reps.map((rep) => (
                <tr key={rep.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Avatar name={rep.full_name || rep.email} />
                      <div>
                        <Link to={`/team/${rep.id}`} className="text-link" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {rep.full_name || rep.email}
                        </Link>
                        {rep.sub_role && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', marginTop: '1px' }}>{rep.sub_role}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', minWidth: '140px' }}>
                    <LessonBar pct={rep.lesson_pct} complete={rep.course_complete} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <StatusBadge pct={rep.lesson_pct} complete={rep.course_complete} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                    {rep.course_complete ? `${rep.lessons_total}/${rep.lessons_total}` : `${rep.lessons_complete}/${rep.lessons_total}`}
                  </td>
                  {group.reps.some((r) => r.sa_total > 0) && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {rep.sa_total > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontSize: '0.75rem', color: rep.sa_completed > 0 ? '#7c3aed' : '#94a3b8', fontWeight: 600 }}>
                            {rep.sa_completed}/{rep.sa_total}
                          </span>
                          {rep.sa_avg_score != null && (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: scoreColor(rep.sa_avg_score) }}>
                              {rep.sa_avg_score.toFixed(1)}/5
                            </span>
                          )}
                        </div>
                      ) : <span style={{ color: '#e2e8f0' }}>—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CourseBreakdown() {
  const { managerId, courseId } = useParams();
  const location = useLocation();
  const { dataUserId } = useImpersonation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Back link — try to infer from location state, fall back to /team
  const backTo = location.state?.from || '/team';
  const backLabel = location.state?.fromLabel || 'Back to overview';

  useEffect(() => {
    if (!managerId || !courseId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(
          `${WORKER_URL}/hs/course-breakdown/${encodeURIComponent(managerId)}/${encodeURIComponent(courseId)}`,
          { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError(e.message || 'Failed to load breakdown.');
      } finally {
        setLoading(false);
      }
    })();
  }, [managerId, courseId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading course breakdown…</div>;
  if (error) return (
    <div className="card" style={{ margin: '24px' }}>
      <div className="card-body">
        <div className="empty-state"><div className="empty-icon">⚠️</div><div>{error}</div></div>
      </div>
    </div>
  );
  if (!data) return null;

  const { course, total_reps, total_complete, completion_pct, groups } = data;
  const barColor = completion_pct === 100 ? '#16a34a' : completion_pct >= 50 ? '#2563eb' : '#d97706';
  const inProgress = groups.reduce((s, g) => s + g.in_progress, 0);
  const notStarted = groups.reduce((s, g) => s + g.not_started, 0);
  const saAvgScores = groups.filter((g) => g.sa_avg_score != null).map((g) => g.sa_avg_score);
  const overallSaAvg = saAvgScores.length > 0
    ? Math.round((saAvgScores.reduce((s, v) => s + v, 0) / saAvgScores.length) * 10) / 10
    : null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ marginBottom: '8px' }}>
          <Link to={backTo} style={{ fontSize: '0.8rem', color: '#7c3aed', textDecoration: 'none', fontWeight: 500 }}>
            ← {backLabel}
          </Link>
        </div>
        <h1 className="page-title">{course?.name || courseId}</h1>
        <p className="page-subtitle">
          Course completion breakdown by reporting line
          {course?.competency && <> · <span style={{ color: '#2563eb' }}>{course.competency}</span></>}
        </p>
      </div>

      {/* Summary tiles */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: barColor }}>{completion_pct}%</div>
          <div className="stat-label">Overall complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{total_complete}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{inProgress}</div>
          <div className="stat-label">In progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#94a3b8' }}>{notStarted}</div>
          <div className="stat-label">Not started</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{total_reps}</div>
          <div className="stat-label">Total reps</div>
        </div>
        {overallSaAvg != null && (
          <div className="stat-card">
            <div className="stat-value" style={{ color: scoreColor(overallSaAvg) }}>{overallSaAvg.toFixed(1)}<span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>/5</span></div>
            <div className="stat-label">SA avg score</div>
          </div>
        )}
      </div>

      {/* Overall progress bar */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '10px', borderRadius: '5px', background: '#e2e8f0', overflow: 'hidden' }}>
              <div style={{ width: `${completion_pct}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: barColor, minWidth: '50px' }}>{completion_pct}%</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{total_complete} / {total_reps} reps complete</span>
          </div>
        </div>
      </div>

      {/* Breakdown by group */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Breakdown by reporting line</h2>
          <span className="badge badge-slate">{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
        </div>
        {groups.length === 0 && (
          <div className="card"><div className="card-body"><div className="empty-state"><div className="empty-icon">👥</div><div>No groups found.</div></div></div></div>
        )}
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </div>
  );
}
