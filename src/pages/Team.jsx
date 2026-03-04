import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';
import SpiderChart, { ScoreBar, scoreColor } from '../components/SpiderChart';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

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

function TrendBadge({ value }) {
  if (value == null || isNaN(value)) return null;
  const up = value > 0;
  const zero = value === 0;
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '99px',
      background: zero ? '#f1f5f9' : up ? '#dcfce7' : '#fee2e2',
      color: zero ? '#94a3b8' : up ? '#16a34a' : '#dc2626',
    }}>
      {zero ? '–' : up ? `+${value.toFixed(1)}` : value.toFixed(1)}
    </span>
  );
}

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

function safeScores(a) {
  return a && typeof a.skill_scores === 'object' && !Array.isArray(a.skill_scores)
    ? a.skill_scores
    : {};
}

const HIERARCHY_ROLES = ['leader', 'senior_leader', 'executive'];

export default function Team() {
  const { dataUserId, viewProfile } = useImpersonation();
  const { viewAsId } = useParams();
  const navigate = useNavigate();

  // When viewing a downstream manager's team (via /team/view/:viewAsId),
  // use their ID and fetch their profile for role-based rendering
  const [viewAsProfile, setViewAsProfile] = useState(null);
  useEffect(() => {
    if (!viewAsId || !supabase) return;
    supabase.from('users').select('id, role, full_name, email, sub_role, team_id').eq('id', viewAsId).single()
      .then(({ data }) => setViewAsProfile(data ?? null));
  }, [viewAsId]);

  const effectiveUserId = viewAsId || dataUserId;
  const effectiveProfile = viewAsId ? viewAsProfile : viewProfile;
  const myRole = effectiveProfile?.role || 'rep';
  const isHierarchy = HIERARCHY_ROLES.includes(myRole);

  // Hierarchy view state (for leaders/senior_leaders/executives)
  const [directReports, setDirectReports] = useState([]); // their direct reports (managers/leaders/RVPs)
  const [reportStats, setReportStats] = useState({});     // per-report rollup stats

  // Standard manager view state
  const [members, setMembers] = useState([]);
  const [plansByUser, setPlansByUser] = useState({});
  const [assessmentsByUser, setAssessmentsByUser] = useState({});
  const [sessionsByUser, setSessionsByUser] = useState({});
  const [actionsByUser, setActionsByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState('overallAvg');
  const [sortDir, setSortDir] = useState('desc');
  const [teamCourses, setTeamCourses] = useState([]);
  const [teamCoursesLoading, setTeamCoursesLoading] = useState(false);

  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir(col === 'member' ? 'asc' : 'desc');
      return col;
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!effectiveUserId || !supabase) { setLoading(false); return; }

        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token;
        const authHeaders = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

        if (isHierarchy) {
          // ── Hierarchy view: load direct reports ──
          const { data: reports } = await supabase
            .from('users')
            .select('id, full_name, email, role, sub_role, team_id')
            .eq('reports_to', effectiveUserId);
          const reportList = (reports ?? []).filter((u) => !['superadmin','admin'].includes(u.role));
          setDirectReports(reportList);

          // For each direct report, fetch their full downstream stats via the worker
          // (worker BFS already computes memberCount = total downstream reps)
          const statsMap = {};
          await Promise.all(reportList.map(async (report) => {
            try {
              const cRes = await fetch(`${WORKER_URL}/hs/team-completion/${encodeURIComponent(report.id)}`, { headers: authHeaders });
              const cData = cRes.ok ? await cRes.json().catch(() => ({})) : {};

              // Count their immediate direct reports (for display context)
              const { count: directCount } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('reports_to', report.id)
                .not('role', 'in', '("superadmin","admin")');

              statsMap[report.id] = {
                courses: cData.courses || [],
                memberCount: cData.memberCount || 0,   // total downstream reps (from BFS)
                directReportCount: directCount || 0,   // immediate direct reports
              };
            } catch { statsMap[report.id] = { courses: [], memberCount: 0, directReportCount: 0 }; }
          }));
          setReportStats(statsMap);

          // Also load overall course rollup for self (full downstream)
          setTeamCoursesLoading(true);
          try {
            const cRes = await fetch(`${WORKER_URL}/hs/team-completion/${encodeURIComponent(effectiveUserId)}`, { headers: authHeaders });
            if (cRes.ok) { const d = await cRes.json().catch(() => ({})); setTeamCourses(d.courses || []); }
          } catch { /* ignore */ } finally { setTeamCoursesLoading(false); }

        } else {
          // ── Standard manager view: load direct rep reports ──
          const { data: users } = await supabase
            .from('users')
            .select('id, full_name, email, role, sub_role')
            .eq('reports_to', effectiveUserId)
            .not('role', 'in', '("superadmin","admin")');
          const list = users ?? [];
          setMembers(list);
          if (list.length === 0) { setLoading(false); return; }

          const ids = list.map((m) => m.id);
          const [plansRes, assessRes, sessRes, actRes] = await Promise.all([
            supabase.from('development_plans').select('user_id, focus_areas, last_updated, status').in('user_id', ids).eq('status', 'active'),
            supabase.from('skill_assessments').select('id, user_id, skill_scores, overall_score, created_at, meeting_date, competency').in('user_id', ids).order('created_at', { ascending: false }).limit(500),
            supabase.from('coaching_sessions').select('id, user_id, session_date').in('user_id', ids).order('session_date', { ascending: false }).limit(500),
            supabase.from('action_items').select('id, user_id, status').in('user_id', ids).limit(1000),
          ]);

          const byUserPlans = {};
          (plansRes.data ?? []).forEach((p) => { byUserPlans[p.user_id] = p; });
          setPlansByUser(byUserPlans);

          const byUserAssess = {};
          (assessRes.data ?? []).forEach((a) => {
            if (!byUserAssess[a.user_id]) byUserAssess[a.user_id] = [];
            byUserAssess[a.user_id].push(a);
          });
          setAssessmentsByUser(byUserAssess);

          const byUserSess = {};
          (sessRes.data ?? []).forEach((s) => {
            if (!byUserSess[s.user_id]) byUserSess[s.user_id] = [];
            byUserSess[s.user_id].push(s);
          });
          setSessionsByUser(byUserSess);

          const byUserActs = {};
          (actRes.data ?? []).forEach((a) => {
            if (!byUserActs[a.user_id]) byUserActs[a.user_id] = [];
            byUserActs[a.user_id].push(a);
          });
          setActionsByUser(byUserActs);

          // Course completion rollup
          setTeamCoursesLoading(true);
          try {
            const cRes = await fetch(`${WORKER_URL}/hs/team-completion/${encodeURIComponent(effectiveUserId)}`, { headers: authHeaders });
            if (cRes.ok) { const d = await cRes.json().catch(() => ({})); setTeamCourses(d.courses || []); }
          } catch { /* ignore */ } finally { setTeamCoursesLoading(false); }
        }

      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [effectiveUserId, isHierarchy]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading team…</div>;

  // When viewAsId is set but profile hasn't loaded yet, show loading
  if (viewAsId && !viewAsProfile) return <div className="loading-screen"><div className="spinner" /> Loading team…</div>;

  // ── Derived data ──────────────────────────────────────────────────────────

  // Per-member avg scores
  const memberAvgScores = {};
  members.forEach((m) => {
    const assessments = assessmentsByUser[m.id] ?? [];
    if (assessments.length === 0) { memberAvgScores[m.id] = null; return; }
    const acc = {};
    assessments.forEach((a) => {
      Object.entries(safeScores(a)).forEach(([k, v]) => {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isNaN(n)) acc[k] = (acc[k] || []).concat(n);
      });
    });
    memberAvgScores[m.id] = Object.fromEntries(
      Object.entries(acc).map(([k, vals]) => [k, vals.reduce((s, v) => s + v, 0) / vals.length])
    );
  });

  // Team-wide avg scores across all members (average of member averages)
  const teamSkillAcc = {};
  Object.values(memberAvgScores).forEach((scores) => {
    if (!scores) return;
    Object.entries(scores).forEach(([k, v]) => {
      teamSkillAcc[k] = (teamSkillAcc[k] || []).concat(v);
    });
  });
  const teamAvgSkills = Object.entries(teamSkillAcc).map(([skill, vals]) => ({
    skill,
    avg: vals.reduce((s, v) => s + v, 0) / vals.length,
  })).sort((a, b) => a.skill.localeCompare(b.skill));

  // Overall team score
  const teamOverallScore = teamAvgSkills.length
    ? teamAvgSkills.reduce((s, x) => s + x.avg, 0) / teamAvgSkills.length
    : null;

  // Trend: compare most-recent half of assessments vs. older half per member
  const memberTrend = {};
  members.forEach((m) => {
    const assessments = (assessmentsByUser[m.id] ?? []).filter((a) => a.overall_score != null);
    if (assessments.length < 2) { memberTrend[m.id] = null; return; }
    const sorted = [...assessments].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const half = Math.ceil(sorted.length / 2);
    const older = sorted.slice(0, half);
    const newer = sorted.slice(half);
    const avg = (arr) => arr.reduce((s, a) => s + Number(a.overall_score), 0) / arr.length;
    memberTrend[m.id] = avg(newer) - avg(older);
  });

  // Weakest skills across the team (lowest avg)
  const weakestSkills = [...teamAvgSkills].sort((a, b) => a.avg - b.avg).slice(0, 3);

  // Summary stats
  const totalAssessments = members.reduce((s, m) => s + (assessmentsByUser[m.id]?.length || 0), 0);
  const totalSessions = members.reduce((s, m) => s + (sessionsByUser[m.id]?.length || 0), 0);
  const totalOpenActions = members.reduce((s, m) => s + (actionsByUser[m.id]?.filter((a) => a.status !== 'exhibited').length || 0), 0);
  const withPlan = members.filter((m) => plansByUser[m.id]);
  const noPlan = members.filter((m) => !plansByUser[m.id]);
  const plansComplete = members.filter((m) => {
    const p = planProgress(plansByUser[m.id]);
    return p.total > 0 && p.completed === p.total;
  });

  // Rep performance table rows
  const repRows = members.map((m) => {
    const assessments = assessmentsByUser[m.id] ?? [];
    const sessions = sessionsByUser[m.id] ?? [];
    const actions = actionsByUser[m.id] ?? [];
    const plan = plansByUser[m.id];
    const progress = planProgress(plan);
    const scores = memberAvgScores[m.id];
    const overallAvg = scores
      ? Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length
      : null;
    return {
      member: m,
      assessmentCount: assessments.length,
      sessionCount: sessions.length,
      openActions: actions.filter((a) => a.status !== 'exhibited').length,
      exhibitedActions: actions.filter((a) => a.status === 'exhibited').length,
      overallAvg,
      planProgress: progress,
      trend: memberTrend[m.id],
      lastActivity: assessments[0]?.created_at || sessions[0]?.session_date || null,
    };
  });

  const SORT_COLS = {
    member:          (r) => (r.member.full_name || r.member.email || '').toLowerCase(),
    overallAvg:      (r) => r.overallAvg ?? -Infinity,
    trend:           (r) => r.trend ?? -Infinity,
    assessmentCount: (r) => r.assessmentCount,
    sessionCount:    (r) => r.sessionCount,
    openActions:     (r) => r.openActions,
    pdp:             (r) => r.planProgress.total > 0 ? r.planProgress.completed / r.planProgress.total : -1,
  };

  const sortedRows = [...repRows].sort((a, b) => {
    const fn = SORT_COLS[sortCol] || SORT_COLS.overallAvg;
    const av = fn(a), bv = fn(b);
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SORT_LABELS = {
    member: 'Rep name', overallAvg: 'Avg score', trend: 'Trend',
    assessmentCount: 'Assessments', sessionCount: 'Sessions',
    openActions: 'Open actions', pdp: 'PDP progress',
  };
  const sortBadgeText = `${SORT_LABELS[sortCol] || sortCol} ${sortDir === 'asc' ? '↑' : '↓'}`;

  const roleLabelMap = { leader: 'Leader', senior_leader: 'Senior Leader', executive: 'Executive', manager: 'Manager', rep: 'Rep' };

  // ── Hierarchy view for leaders / senior leaders / executives ──────────────
  if (isHierarchy) {
    // totalReps comes from worker BFS memberCount per direct report — this is their full downstream
    const totalReps = teamCourses.length > 0
      ? (teamCourses[0]?.member_count ?? Object.values(reportStats).reduce((s, r) => s + r.memberCount, 0))
      : Object.values(reportStats).reduce((s, r) => s + r.memberCount, 0);
    const overallCourses = teamCourses;

    const tierLabel = myRole === 'executive' ? 'Senior Leaders' : myRole === 'senior_leader' ? 'Leaders / Managers' : 'Managers';

    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">
            {viewAsId ? `${effectiveProfile?.full_name || 'Team'}'s Org` : 'Org overview'}
          </h1>
          <p className="page-subtitle">
            {viewAsId
              ? <><Link to="/team" className="text-link">← Back to your overview</Link> &nbsp;·&nbsp; Full downstream breakdown for {effectiveProfile?.full_name || 'this manager'}.</>
              : 'Full downstream breakdown for your reporting line.'
            }
          </p>
        </div>

        {/* Top-level stats */}
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-value">{directReports.length}</div>
            <div className="stat-label">Direct reports</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#7c3aed' }}>{totalReps}</div>
            <div className="stat-label">Total reps in downstream</div>
          </div>
        </div>

        {/* Overall course completion rollup */}
        {(overallCourses.length > 0 || teamCoursesLoading) && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header">
              <h2 className="card-title">Overall core curriculum completion</h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{totalReps} reps across entire downstream</span>
            </div>
            {teamCoursesLoading ? (
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.875rem' }}>
                <div className="spinner" style={{ width: '16px', height: '16px' }} /> Loading…
              </div>
            ) : (
              <div className="card-body">
                {overallCourses.map((course) => {
                  const pct = course.completion_pct ?? 0;
                  const barColor = pct === 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
                  const saPct = course.sa_completion_pct ?? 0;
                  const saBarColor = saPct === 100 ? '#16a34a' : saPct > 0 ? '#7c3aed' : '#e2e8f0';
                  const courseUrl = `/team/course/${encodeURIComponent(effectiveUserId)}/${encodeURIComponent(course.hs_item_id)}`;
                  const fromLabel = viewAsId
                    ? `${effectiveProfile?.full_name || 'Team'}'s overview`
                    : 'Org overview';
                  return (
                    <Link
                      key={course.hs_item_id}
                      to={courseUrl}
                      state={{ from: viewAsId ? `/team/view/${viewAsId}` : '/team', fromLabel }}
                      style={{ display: 'block', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', textDecoration: 'none', borderRadius: '4px' }}
                      className="course-row-link"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', flex: 1 }}>{course.name}</span>
                        {course.competency && (
                          <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px' }}>{course.competency}</span>
                        )}
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: barColor }}>{pct}%</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{course.completed} / {course.member_count}</span>
                        {course.started > course.completed && (
                          <span style={{ fontSize: '0.72rem', color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px' }}>
                            {course.started - course.completed} in progress
                          </span>
                        )}
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden', marginBottom: course.sa_count > 0 ? '4px' : 0 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                      {course.sa_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: '#ede9fe', overflow: 'hidden' }}>
                            <div style={{ width: `${saPct}%`, height: '100%', background: saBarColor, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#7c3aed' }}>{saPct}% SA</span>
                          {course.sa_avg_score != null && <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 600 }}>avg {course.sa_avg_score.toFixed(1)}/5</span>}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Direct reports breakdown */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h2 className="card-title">Breakdown by {tierLabel}</h2>
            <span className="badge badge-slate">{directReports.length} direct report{directReports.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {directReports.length === 0 && (
              <div className="empty-state"><div className="empty-icon">👥</div><div>No direct reports found.</div></div>
            )}
            {directReports.map((report) => {
              const stats = reportStats[report.id] || { courses: [], memberCount: 0, directReportCount: 0 };
              const repLabel = stats.memberCount > 0 ? `${stats.memberCount} rep${stats.memberCount !== 1 ? 's' : ''} in downstream` : 'No reps yet';
              return (
                <div key={report.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  {/* Report header */}
                  <div style={{ padding: '14px 18px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                    <Avatar name={report.full_name || report.email} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b' }}>{report.full_name || report.email}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>
                          {roleLabelMap[report.role] || report.role}
                        </span>
                        {stats.directReportCount > 0 && (
                          <span>{stats.directReportCount} direct report{stats.directReportCount !== 1 ? 's' : ''}</span>
                        )}
                        {stats.memberCount > 0 && (
                          <span style={{ color: '#7c3aed', fontWeight: 600 }}>· {repLabel}</span>
                        )}
                      </div>
                    </div>
                    <Link
                      to={['leader','senior_leader','executive'].includes(report.role) ? `/team/view/${report.id}` : `/team/${report.id}`}
                      className="btn btn-ghost btn-sm"
                    >View team →</Link>
                  </div>

                  {/* Course completion mini-bars — clickable to drill down */}
                  {stats.courses.length > 0 ? (
                    <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {stats.courses.map((course) => {
                        const pct = course.completion_pct ?? 0;
                        const barColor = pct === 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
                        const saPct = course.sa_completion_pct ?? 0;
                        const saBar = saPct === 100 ? '#16a34a' : saPct > 0 ? '#7c3aed' : '#e2e8f0';
                        const drillUrl = `/team/course/${encodeURIComponent(report.id)}/${encodeURIComponent(course.hs_item_id)}`;
                        const fromPath = viewAsId ? `/team/view/${viewAsId}` : '/team';
                        const fromLabel = viewAsId ? `${effectiveProfile?.full_name || 'Team'}'s overview` : 'Org overview';
                        return (
                          <Link
                            key={course.hs_item_id}
                            to={drillUrl}
                            state={{ from: fromPath, fromLabel }}
                            style={{ display: 'block', textDecoration: 'none' }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ flex: 1, fontSize: '0.8125rem', color: '#334155', fontWeight: 500 }}>{course.name}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: barColor }}>{pct}%</span>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{course.completed}/{course.member_count}</span>
                            </div>
                            <div style={{ height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden', marginBottom: course.sa_count > 0 ? '3px' : 0 }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                            </div>
                            {course.sa_count > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ height: '4px', flex: 1, borderRadius: '2px', background: '#ede9fe', overflow: 'hidden' }}>
                                  <div style={{ width: `${saPct}%`, height: '100%', background: saBar, borderRadius: '2px' }} />
                                </div>
                                <span style={{ fontSize: '0.7rem', color: '#7c3aed' }}>{saPct}% SA</span>
                                {course.sa_avg_score != null && <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 600 }}>avg {course.sa_avg_score.toFixed(1)}/5</span>}
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '10px 18px', color: '#94a3b8', fontSize: '0.8rem' }}>No course completion data yet.</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Team overview</h1>
        <p className="page-subtitle">Skills performance and coaching activity across your team.</p>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-value">{members.length}</div>
          <div className="stat-label">Team members</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: teamOverallScore != null ? scoreColor(teamOverallScore) : '#94a3b8' }}>
            {teamOverallScore != null ? teamOverallScore.toFixed(1) : '—'}
          </div>
          <div className="stat-label">Team avg score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{totalAssessments}</div>
          <div className="stat-label">Assessments run</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#0ea5e9' }}>{totalSessions}</div>
          <div className="stat-label">Coaching sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{withPlan.length}</div>
          <div className="stat-label">Active plans</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: plansComplete.length > 0 ? '#16a34a' : '#94a3b8' }}>{plansComplete.length}</div>
          <div className="stat-label">Plans complete</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalOpenActions > 0 ? '#d97706' : '#16a34a' }}>{totalOpenActions}</div>
          <div className="stat-label">Open action items</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#94a3b8' }}>{noPlan.length}</div>
          <div className="stat-label">No plan yet</div>
        </div>
      </div>

      {/* Skills overview + weakest areas */}
      {teamAvgSkills.length >= 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '18px', marginBottom: '24px', alignItems: 'stretch' }}>
          {/* Team spider chart */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div className="card-header">
              <h2 className="card-title">Team skills radar</h2>
              <span className="badge badge-purple">avg across {members.filter((m) => memberAvgScores[m.id]).length} reps</span>
            </div>
            <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <SpiderChart skills={teamAvgSkills} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                {teamAvgSkills.map(({ skill, avg }) => (
                  <div key={skill}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#334155' }}>{skill}</span>
                    </div>
                    <ScoreBar score={avg} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Focus areas: weakest skills + top performers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>
            {/* Weakest skills */}
            {weakestSkills.length > 0 && (
              <div className="card" style={{ flex: '0 0 auto' }}>
                <div className="card-header">
                  <h2 className="card-title">Areas needing focus</h2>
                  <span className="badge badge-amber">lowest team scores</span>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {weakestSkills.map(({ skill, avg }) => (
                    <div key={skill}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>{skill}</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: scoreColor(avg) }}>{avg.toFixed(1)}/5</span>
                      </div>
                      <ScoreBar score={avg} />
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                        {avg < 2 ? 'Critical — immediate coaching recommended' : avg < 3 ? 'Needs improvement' : 'Developing — keep building'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coaching activity summary */}
            <div className="card" style={{ flex: 1 }}>
              <div className="card-header">
                <h2 className="card-title">Coaching activity</h2>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {members.map((m) => {
                  const sessCount = sessionsByUser[m.id]?.length || 0;
                  const assessCount = assessmentsByUser[m.id]?.length || 0;
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={m.full_name || m.email} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.full_name || m.email}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {assessCount} assessment{assessCount !== 1 ? 's' : ''} · {sessCount} session{sessCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <Link to={`/team/${m.id}`} className="btn btn-ghost btn-sm">View →</Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rep performance table */}
      {members.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h2 className="card-title">Rep performance</h2>
            <span className="badge badge-slate">{sortBadgeText}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                  {[
                    { col: 'member',          label: 'Rep',          align: 'left',   extraStyle: { paddingLeft: '16px' } },
                    { col: 'overallAvg',      label: 'Avg score',    align: 'center', extraStyle: {} },
                    { col: 'trend',           label: 'Trend',        align: 'center', extraStyle: {} },
                    { col: 'assessmentCount', label: 'Assessments',  align: 'center', extraStyle: {} },
                    { col: 'sessionCount',    label: 'Sessions',     align: 'center', extraStyle: {} },
                    { col: 'openActions',     label: 'Open actions', align: 'center', extraStyle: {} },
                    { col: 'pdp',             label: 'PDP progress', align: 'left',   extraStyle: { minWidth: '120px' } },
                  ].map(({ col, label, align, extraStyle }) => {
                    const active = sortCol === col;
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '10px 12px', textAlign: align, fontWeight: 600,
                          color: active ? '#7c3aed' : '#64748b',
                          fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em',
                          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                          ...extraStyle,
                        }}
                      >
                        {label}
                        <span style={{ marginLeft: '4px', opacity: active ? 1 : 0.3 }}>
                          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </th>
                    );
                  })}
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ member, assessmentCount, sessionCount, openActions, overallAvg, planProgress: progress, trend, lastActivity }) => {
                  const allDone = progress.total > 0 && progress.completed === progress.total;
                  return (
                    <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar name={member.full_name || member.email} />
                          <div>
                            <Link to={`/team/${member.id}`} className="text-link" style={{ fontSize: '0.875rem' }}>
                              {member.full_name || member.email}
                            </Link>
                            {lastActivity && (
                              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '1px' }}>
                                Last activity {new Date(lastActivity).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {overallAvg != null ? (
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: scoreColor(overallAvg) }}>{overallAvg.toFixed(1)}</span>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <TrendBadge value={trend} />
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 600, color: assessmentCount > 0 ? '#7c3aed' : '#94a3b8' }}>{assessmentCount}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 600, color: sessionCount > 0 ? '#0ea5e9' : '#94a3b8' }}>{sessionCount}</span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 600, color: openActions > 0 ? '#d97706' : '#16a34a' }}>{openActions}</span>
                      </td>
                      <td style={{ padding: '12px', minWidth: '120px' }}>
                        {progress.total > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <MiniProgress completed={progress.completed} total={progress.total} />
                            {allDone && <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>Complete ✓</span>}
                          </div>
                        ) : plansByUser[member.id] ? (
                          <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>Active</span>
                        ) : (
                          <span className="badge badge-slate" style={{ fontSize: '0.7rem' }}>No plan</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <Link to={`/team/${member.id}`} className="btn btn-ghost btn-sm">View →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Course completion summary */}
      {(teamCourses.length > 0 || teamCoursesLoading) && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h2 className="card-title">Core Curriculum completion</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>across {members.length} reps</span>
          </div>
          {teamCoursesLoading ? (
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.875rem' }}>
              <div className="spinner" style={{ width: '16px', height: '16px' }} /> Loading course data…
            </div>
          ) : (
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {teamCourses.map((course) => {
                  const pct = course.completion_pct ?? 0;
                  const barColor = pct === 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
                  const saPct = course.sa_completion_pct ?? 0;
                  const saBarColor = saPct === 100 ? '#16a34a' : saPct > 0 ? '#7c3aed' : '#e2e8f0';
                  const saAvg = course.sa_avg_score;
                  const saAvgColor = saAvg == null ? '#7c3aed' : saAvg >= 4 ? '#16a34a' : saAvg >= 3 ? '#d97706' : '#dc2626';
                  return (
                    <div key={course.hs_item_id} style={{ paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                      {/* Course name + competency tag */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', flex: 1 }}>{course.name}</span>
                        {course.competency && (
                          <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>
                            {course.competency}
                          </span>
                        )}
                      </div>
                      {/* Lesson completion bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: barColor, minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>{course.completed} / {course.member_count} complete</span>
                        {course.started > course.completed && (
                          <span style={{ fontSize: '0.72rem', color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' }}>
                            {course.started - course.completed} in progress
                          </span>
                        )}
                      </div>
                      {/* Skills Assessment rollup row */}
                      {course.sa_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                          <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#ede9fe', overflow: 'hidden' }}>
                            <div style={{ width: `${saPct}%`, height: '100%', background: saBarColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: saBarColor, minWidth: '36px', textAlign: 'right' }}>{saPct}%</span>
                          <span style={{ fontSize: '0.72rem', color: '#7c3aed', whiteSpace: 'nowrap' }}>
                            {course.sa_members_complete} / {course.member_count} have completed assessments
                          </span>
                          {saAvg != null && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: saAvgColor, whiteSpace: 'nowrap', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '1px 7px' }}>
                              avg {saAvg.toFixed(1)} / 5
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No members fallback */}
      {members.length === 0 && (
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
