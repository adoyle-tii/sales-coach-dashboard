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

const CONTENT_STATUS_CONFIG = {
  complete:    { label: 'Complete',    color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  not_started: { label: 'Not Started', color: '#94a3b8', bg: '#f1f5f9', border: '#e2e8f0' },
};

const SA_STATUS_CONFIG = {
  passed:         { label: 'Passed',         color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
  failed:         { label: 'Failed',         color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
  pending_review: { label: 'Pending Review', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  not_submitted:  { label: 'Not Submitted',  color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
};

function ContentBadge({ status }) {
  const cfg = CONTENT_STATUS_CONFIG[status] || CONTENT_STATUS_CONFIG.not_started;
  return <span style={{ fontSize: '0.72rem', fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '99px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{cfg.label}</span>;
}

function SaBadge({ status }) {
  if (!status) return <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>;
  const cfg = SA_STATUS_CONFIG[status] || {};
  return <span style={{ fontSize: '0.72rem', fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '99px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{cfg.label}</span>;
}

function LessonBar({ pct, contentStatus }) {
  const cfg = CONTENT_STATUS_CONFIG[contentStatus] || CONTENT_STATUS_CONFIG.not_started;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, borderRadius: '3px', transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.color, minWidth: '34px', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function GroupCard({ group, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const pct = group.content_pct ?? 0;
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
            <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 600 }}>{group.content_complete} content complete</span>
            {group.content_in_progress > 0 && <span style={{ fontSize: '0.72rem', color: '#2563eb' }}>{group.content_in_progress} in progress</span>}
            {group.content_not_started > 0 && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{group.content_not_started} not started</span>}
            {group.sa_passed > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#16a34a', background: '#dcfce7', borderRadius: '99px', padding: '1px 7px' }}>{group.sa_passed} SA passed</span>}
            {group.sa_failed > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', background: '#fee2e2', borderRadius: '99px', padding: '1px 7px' }}>{group.sa_failed} SA failed</span>}
            {group.sa_pending_review > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', borderRadius: '99px', padding: '1px 7px' }}>{group.sa_pending_review} pending review</span>}
            {group.sa_avg_score != null && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: group.sa_avg_score >= 3.0 ? '#16a34a' : '#dc2626', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '99px', padding: '1px 7px' }}>
                SA avg {group.sa_avg_score.toFixed(1)}/5
              </span>
            )}
          </div>
        </div>

        {/* Completion bar */}
        <div style={{ width: '140px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{group.content_complete}/{group.rep_count}</span>
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
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Content progress</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Content</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lessons</th>
                {group.reps.some((r) => r.sa_total > 0) && (
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SA status</th>
                )}
                {group.reps.some((r) => r.sa_total > 0) && (
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SA score</th>
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
                    <LessonBar pct={rep.lesson_pct} contentStatus={rep.content_status} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <ContentBadge status={rep.content_status} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                    {rep.lessons_complete}/{rep.lessons_total}
                  </td>
                  {group.reps.some((r) => r.sa_total > 0) && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <SaBadge status={rep.sa_status} />
                    </td>
                  )}
                  {group.reps.some((r) => r.sa_total > 0) && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {rep.sa_avg_score != null ? (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: rep.sa_avg_score >= 3.0 ? '#16a34a' : '#dc2626' }}>
                          {rep.sa_avg_score.toFixed(1)}/5
                        </span>
                      ) : rep.sa_total > 0 ? (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{rep.sa_reviewed}/{rep.sa_total}</span>
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

  const {
    course, total_reps,
    total_content_complete, total_in_progress, total_not_started, content_pct,
    total_sa_passed, total_sa_failed, total_sa_pending_review, total_sa_not_submitted, sa_pct,
    groups,
  } = data;
  const contentBarColor = content_pct === 100 ? '#16a34a' : content_pct >= 50 ? '#2563eb' : '#d97706';
  const saBarColor = (sa_pct ?? 0) === 100 ? '#16a34a' : (sa_pct ?? 0) >= 50 ? '#2563eb' : '#d97706';
  const hasSaData = (total_sa_passed + total_sa_failed + total_sa_pending_review + total_sa_not_submitted) > 0;

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

      {/* Content completion tiles */}
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Content Completion</div>
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: contentBarColor }}>{content_pct ?? 0}%</div>
          <div className="stat-label">Complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{total_content_complete ?? 0}</div>
          <div className="stat-label">Lessons complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{total_in_progress ?? 0}</div>
          <div className="stat-label">In progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#94a3b8' }}>{total_not_started ?? 0}</div>
          <div className="stat-label">Not started</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{total_reps ?? 0}</div>
          <div className="stat-label">Total reps</div>
        </div>
      </div>

      {/* Content progress bar */}
      <div className="card" style={{ marginBottom: hasSaData ? '24px' : '24px' }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, height: '10px', borderRadius: '5px', background: '#e2e8f0', overflow: 'hidden' }}>
              <div style={{ width: `${content_pct ?? 0}%`, height: '100%', background: contentBarColor, borderRadius: '5px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: contentBarColor, minWidth: '50px' }}>{content_pct ?? 0}%</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{total_content_complete ?? 0} / {total_reps ?? 0} reps with all lessons complete</span>
          </div>
        </div>
      </div>

      {/* SA outcomes tiles */}
      {hasSaData && (<>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '8px' }}>Skills Assessment Outcomes</div>
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: saBarColor }}>{sa_pct ?? 0}%</div>
            <div className="stat-label">SA pass rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#16a34a' }}>{total_sa_passed ?? 0}</div>
            <div className="stat-label">SA passed</div>
          </div>
          {(total_sa_failed ?? 0) > 0 && (
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#dc2626' }}>{total_sa_failed}</div>
              <div className="stat-label">SA failed</div>
            </div>
          )}
          {(total_sa_pending_review ?? 0) > 0 && (
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#7c3aed' }}>{total_sa_pending_review}</div>
              <div className="stat-label">Pending review</div>
            </div>
          )}
          {(total_sa_not_submitted ?? 0) > 0 && (
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#d97706' }}>{total_sa_not_submitted}</div>
              <div className="stat-label">Not submitted</div>
            </div>
          )}
        </div>
      </>)}

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
