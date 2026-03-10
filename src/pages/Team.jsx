import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';
import SpiderChart, { ScoreBar, scoreColor } from '../components/SpiderChart';
import MeetingIntelligencePanel, { TeamMeetingIntelligenceSummary, TalkPctBadge, talkRatioColor } from '../components/MeetingIntelligencePanel';

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
  const [teamCoursesError, setTeamCoursesError] = useState(null);

  // Meeting intelligence data (fetched in parallel with course completion)
  const [meetingIntel, setMeetingIntel] = useState(null);
  const [authToken, setAuthToken]       = useState(null);

  const handleSort = useCallback((col) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); return col; }
      setSortDir(col === 'member' ? 'asc' : 'desc');
      return col;
    });
  }, []);

  useEffect(() => {
    // Wait until effectiveProfile is resolved before running.
    // Both /team/view/:viewAsId and impersonation-via-sessionStorage fetch profiles async,
    // so myRole can be undefined or wrong on the first render. Running early causes the wrong
    // branch (manager vs hierarchy) to fire with stale data.
    if (!effectiveProfile) return;

    (async () => {
      try {
        if (!effectiveUserId || !supabase) { setLoading(false); return; }

        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token;
        const authHeaders = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
        setAuthToken(token || null);

        // Fetch meeting intelligence in parallel with everything else.
        // - Top-level org view (isHierarchy, no viewAsId) → org endpoint (org-wide stats)
        // - Drilling into a sub-leader's org (isHierarchy + viewAsId) → team endpoint for that person
        // - Manager view → team endpoint for the manager
        (async () => {
          try {
            const miUrl = (isHierarchy && !viewAsId)
              ? `${WORKER_URL}/hs/meeting-intelligence/org?months=12`
              : `${WORKER_URL}/hs/meeting-intelligence/team/${encodeURIComponent(effectiveUserId)}?months=6`;
            const miRes = await fetch(miUrl, { headers: authHeaders });
            if (miRes.ok) setMeetingIntel(await miRes.json());
          } catch { /* non-critical */ }
        })();

        if (isHierarchy) {
          // ── Hierarchy view: load direct reports (active only) ──
          const { data: reports } = await supabase
            .from('users')
            .select('id, full_name, email, role, sub_role, team_id')
            .eq('reports_to', effectiveUserId)
            .eq('status', 'active');
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
          setTeamCoursesError(null);
          try {
            const cRes = await fetch(`${WORKER_URL}/hs/team-completion/${encodeURIComponent(effectiveUserId)}`, { headers: authHeaders });
            const rawText = await cRes.text();
            console.log('[Team] overall rollup status:', cRes.status, 'body:', rawText.slice(0, 500));
            if (cRes.ok) {
              const d = JSON.parse(rawText);
              console.log('[Team] overall rollup courses count:', d.courses?.length, 'memberCount:', d.memberCount);
              setTeamCourses(d.courses || []);
              if (!d.courses?.length) setTeamCoursesError(`Worker returned 0 courses (memberCount: ${d.memberCount ?? '?'})`);
            } else {
              const errMsg = `Worker error ${cRes.status}: ${rawText.slice(0, 200)}`;
              console.warn('[Team] overall rollup failed:', errMsg);
              setTeamCoursesError(errMsg);
            }
          } catch (err) {
            console.warn('[Team] overall rollup error:', err);
            setTeamCoursesError(String(err));
          } finally { setTeamCoursesLoading(false); }

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
          setTeamCoursesError(null);
          try {
            const cRes = await fetch(`${WORKER_URL}/hs/team-completion/${encodeURIComponent(effectiveUserId)}`, { headers: authHeaders });
            const rawText = await cRes.text();
            console.log('[Team] manager rollup status:', cRes.status, 'body:', rawText.slice(0, 300));
            if (cRes.ok) { const d = JSON.parse(rawText); setTeamCourses(d.courses || []); }
            else setTeamCoursesError(`Worker error ${cRes.status}: ${rawText.slice(0, 200)}`);
          } catch (err) {
            console.warn('[Team] manager rollup error:', err);
            setTeamCoursesError(String(err));
          } finally { setTeamCoursesLoading(false); }
        }

      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [effectiveUserId, isHierarchy, effectiveProfile]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading team…</div>;

  // When viewAsId is set but profile hasn't loaded yet, show loading
  if (viewAsId && !viewAsProfile) return <div className="loading-screen"><div className="spinner" /> Loading team…</div>;

  // ── Derived data ──────────────────────────────────────────────────────────

  // Build a quick lookup of meeting intelligence per rep from the team intel data
  const repMeetingIntelById = {};
  if (meetingIntel?.reps) {
    for (const r of meetingIntel.reps) {
      if (r.user_id) repMeetingIntelById[r.user_id] = r;
    }
  }

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
      meetingIntel: repMeetingIntelById[m.id] || null,
    };
  });

  const SORT_COLS = {
    member:             (r) => (r.member.full_name || r.member.email || '').toLowerCase(),
    overallAvg:         (r) => r.overallAvg ?? -Infinity,
    trend:              (r) => r.trend ?? -Infinity,
    meetingsThisMonth:  (r) => r.meetingIntel?.meetings_this_month ?? -1,
    avgTalkPct:         (r) => r.meetingIntel?.avg_talk_pct ?? -1,
    assessmentCount:    (r) => r.assessmentCount,
    sessionCount:       (r) => r.sessionCount,
    openActions:        (r) => r.openActions,
    pdp:                (r) => r.planProgress.total > 0 ? r.planProgress.completed / r.planProgress.total : -1,
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
    meetingsThisMonth: 'Meetings', avgTalkPct: 'Talk %',
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

        {/* Meeting Intelligence — org-wide at top level, team-scoped when drilled in */}
        {viewAsId
          ? (meetingIntel && <TeamMeetingIntelligenceSummary teamIntel={meetingIntel} />)
          : <MeetingIntelligencePanel mode="org" token={authToken} />
        }

        {/* Overall course completion rollup */}
        {teamCoursesError && (
          <div className="alert alert-error" style={{ marginBottom: '16px', fontSize: '0.8rem' }}>
            Course summary unavailable: {teamCoursesError}
          </div>
        )}
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
                  const pct = course.content_pct ?? course.completion_pct ?? 0;
                  const passPct = course.pass_pct ?? 0;
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
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{course.content_complete ?? course.completed} / {course.member_count}</span>
                        {(course.passed > 0) && <span style={{ fontSize: '0.72rem', color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 5px' }}>{course.passed} passed</span>}
                        {(course.pending_review > 0) && <span style={{ fontSize: '0.72rem', color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '4px', padding: '1px 5px' }}>{course.pending_review} pending review</span>}
                        {(course.sa_required > 0) && <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px' }}>{course.sa_required} SA required</span>}
                        {(course.in_progress > 0) && <span style={{ fontSize: '0.72rem', color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px' }}>{course.in_progress} in progress</span>}
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden', marginBottom: '4px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                      {course.sa_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: '#ede9fe', overflow: 'hidden' }}>
                            <div style={{ width: `${passPct}%`, height: '100%', background: '#16a34a', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '0.7rem', color: '#7c3aed' }}>{passPct}% SA</span>
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

        {/* Direct reports breakdown — split reps (flat table) from managers/leaders (cards) */}
        {(() => {
          const directRepReports = directReports.filter((r) => r.role === 'rep');
          const teamReports = directReports.filter((r) => r.role !== 'rep');
          const fromPath = viewAsId ? `/team/view/${viewAsId}` : '/team';
          const fromLabel = viewAsId ? `${effectiveProfile?.full_name || 'Team'}'s overview` : 'Org overview';

          // Reusable course mini-bar row for team report cards
          const CourseMiniBar = ({ course, reportId }) => {
            const pct = course.content_pct ?? course.completion_pct ?? 0;
            const passPct = course.pass_pct ?? 0;
            const barColor = pct === 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
            return (
              <Link
                key={course.hs_item_id}
                to={`/team/course/${encodeURIComponent(reportId)}/${encodeURIComponent(course.hs_item_id)}`}
                state={{ from: fromPath, fromLabel }}
                style={{ display: 'block', textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ flex: 1, fontSize: '0.8125rem', color: '#334155', fontWeight: 500 }}>{course.name}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: barColor }}>{pct}%</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{course.content_complete ?? course.completed}/{course.member_count}</span>
                  {(course.passed > 0) && <span style={{ fontSize: '0.68rem', color: '#16a34a', background: '#dcfce7', borderRadius: '4px', padding: '0px 4px' }}>{course.passed} passed</span>}
                  {(course.pending_review > 0) && <span style={{ fontSize: '0.68rem', color: '#7c3aed', background: '#f5f3ff', borderRadius: '4px', padding: '0px 4px' }}>{course.pending_review} pending</span>}
                  {(course.sa_required > 0) && <span style={{ fontSize: '0.68rem', color: '#b45309', background: '#fffbeb', borderRadius: '4px', padding: '0px 4px' }}>{course.sa_required} SA req</span>}
                </div>
                <div style={{ height: '6px', borderRadius: '3px', background: '#e2e8f0', overflow: 'hidden', marginBottom: course.sa_count > 0 ? '3px' : 0 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                </div>
                {course.sa_count > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ height: '4px', flex: 1, borderRadius: '2px', background: '#ede9fe', overflow: 'hidden' }}>
                      <div style={{ width: `${passPct}%`, height: '100%', background: '#16a34a', borderRadius: '2px' }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#7c3aed' }}>{passPct}% SA</span>
                    {course.sa_avg_score != null && <span style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 600 }}>avg {course.sa_avg_score.toFixed(1)}/5</span>}
                  </div>
                )}
              </Link>
            );
          };

          return (
            <>
              {directReports.length === 0 && (
                <div className="card" style={{ marginBottom: '24px' }}>
                  <div className="card-body">
                    <div className="empty-state"><div className="empty-icon">👥</div><div>No direct reports found.</div></div>
                  </div>
                </div>
              )}

              {/* Direct rep reports — flat table (no "View team", no course bars) */}
              {directRepReports.length > 0 && (
                <div className="card" style={{ marginBottom: '24px' }}>
                  <div className="card-header">
                    <h2 className="card-title">Direct rep reports</h2>
                    <span className="badge badge-slate">{directRepReports.length} rep{directRepReports.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Rep</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {directRepReports.map((rep) => (
                          <tr key={rep.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Avatar name={rep.full_name || rep.email} />
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>{rep.full_name || rep.email}</div>
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
                                    <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>Rep</span>
                                    {rep.sub_role && <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>{rep.sub_role}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <Link to={`/team/${rep.id}`} className="btn btn-ghost btn-sm">View →</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Team/manager/leader direct reports — course cards */}
              {teamReports.length > 0 && (
                <div className="card" style={{ marginBottom: '24px' }}>
                  <div className="card-header">
                    <h2 className="card-title">Breakdown by {tierLabel}</h2>
                    <span className="badge badge-slate">{teamReports.length} direct report{teamReports.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {teamReports.map((report) => {
                      const stats = reportStats[report.id] || { courses: [], memberCount: 0, directReportCount: 0 };
                      const repLabel = stats.memberCount > 0 ? `${stats.memberCount} rep${stats.memberCount !== 1 ? 's' : ''} in downstream` : 'No reps yet';
                      return (
                        <div key={report.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ padding: '14px 18px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #e2e8f0' }}>
                            <Avatar name={report.full_name || report.email} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#1e293b' }}>{report.full_name || report.email}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>
                                  {roleLabelMap[report.role] || report.role}
                                </span>
                                {stats.directReportCount > 0 && <span>{stats.directReportCount} direct report{stats.directReportCount !== 1 ? 's' : ''}</span>}
                                {stats.memberCount > 0 && <span style={{ color: '#7c3aed', fontWeight: 600 }}>· {repLabel}</span>}
                              </div>
                            </div>
                            <Link
                              to={['manager','leader','senior_leader','executive'].includes(report.role) ? `/team/view/${report.id}` : `/team/${report.id}`}
                              className="btn btn-ghost btn-sm"
                            >View team →</Link>
                          </div>
                          {stats.courses.length > 0 ? (
                            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {stats.courses.map((course) => (
                                <CourseMiniBar key={course.hs_item_id} course={course} reportId={report.id} />
                              ))}
                            </div>
                          ) : (
                            <div style={{ padding: '10px 18px', color: '#94a3b8', fontSize: '0.8rem' }}>No course completion data yet.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          {viewAsId ? `${effectiveProfile?.full_name || 'Team'}'s Team` : 'Team overview'}
        </h1>
        <p className="page-subtitle">
          {viewAsId
            ? <><Link to="/team" className="text-link">← Back to your overview</Link> &nbsp;·&nbsp; Skills performance and coaching activity for {effectiveProfile?.full_name || 'this manager'}'s team.</>
            : 'Skills performance and coaching activity across your team.'
          }
        </p>
      </div>

      {/* Meeting Intelligence summary card */}
      {meetingIntel && <TeamMeetingIntelligenceSummary teamIntel={meetingIntel} />}

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>        <div className="stat-card">
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
                    { col: 'member',             label: 'Rep',          align: 'left',   extraStyle: { paddingLeft: '16px' } },
                    { col: 'overallAvg',          label: 'Avg score',    align: 'center', extraStyle: {} },
                    { col: 'trend',               label: 'Trend',        align: 'center', extraStyle: {} },
                    { col: 'meetingsThisMonth',   label: 'Meetings',     align: 'center', extraStyle: {} },
                    { col: 'avgTalkPct',          label: 'Talk %',       align: 'center', extraStyle: {} },
                    { col: 'assessmentCount',     label: 'Assessments',  align: 'center', extraStyle: {} },
                    { col: 'sessionCount',        label: 'Sessions',     align: 'center', extraStyle: {} },
                    { col: 'openActions',         label: 'Open actions', align: 'center', extraStyle: {} },
                    { col: 'pdp',                 label: 'PDP progress', align: 'left',   extraStyle: { minWidth: '120px' } },
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
                {sortedRows.map(({ member, assessmentCount, sessionCount, openActions, overallAvg, planProgress: progress, trend, lastActivity, meetingIntel: repMI }) => {
                  const allDone = progress.total > 0 && progress.completed === progress.total;
                  const noMeetings = repMI && repMI.meetings_this_month === 0;
                  return (
                    <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9', background: noMeetings ? '#fffbeb' : undefined }}>
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
                            {noMeetings && (
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 700, padding: '1px 5px',
                                borderRadius: '99px', background: '#fef3c7', color: '#b45309',
                                border: '1px solid #fde68a', marginTop: '2px', display: 'inline-block',
                              }}>No meetings</span>
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
                      {/* Meetings this month */}
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {repMI ? (
                          <div>
                            <span style={{ fontWeight: 700, color: repMI.meetings_this_month > 0 ? '#7c3aed' : '#d97706' }}>
                              {repMI.meetings_this_month}
                            </span>
                            {repMI.meetings_last_month != null && (
                              <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                                {repMI.meetings_last_month} last mo
                              </div>
                            )}
                          </div>
                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>}
                      </td>
                      {/* Avg talk % */}
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <TalkPctBadge pct={repMI?.avg_talk_pct ?? null} />
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
                  const pct = course.content_pct ?? course.completion_pct ?? 0;
                  const passPct = course.pass_pct ?? 0;
                  const barColor = pct === 100 ? '#16a34a' : pct >= 50 ? '#2563eb' : '#d97706';
                  const saAvg = course.sa_avg_score;
                  const saAvgColor = saAvg == null ? '#7c3aed' : saAvg >= 4 ? '#16a34a' : saAvg >= 3 ? '#d97706' : '#dc2626';
                  const courseUrl = `/team/course/${encodeURIComponent(effectiveUserId)}/${encodeURIComponent(course.hs_item_id)}`;
                  return (
                    <Link
                      key={course.hs_item_id}
                      to={courseUrl}
                      state={{ from: '/team', fromLabel: 'Team overview' }}
                      className="course-row-link"
                      style={{ display: 'block', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9', textDecoration: 'none', borderRadius: '4px' }}
                    >
                      {/* Course name + competency tag */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', flex: 1 }}>{course.name}</span>
                        {course.competency && (
                          <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '1px 6px', fontWeight: 500 }}>
                            {course.competency}
                          </span>
                        )}
                      </div>
                      {/* Content completion bar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: barColor, minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>{course.content_complete ?? course.completed} / {course.member_count} complete</span>
                        {(course.passed > 0) && <span style={{ fontSize: '0.72rem', color: '#16a34a', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' }}>{course.passed} passed</span>}
                        {(course.pending_review > 0) && <span style={{ fontSize: '0.72rem', color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' }}>{course.pending_review} pending review</span>}
                        {(course.sa_required > 0) && <span style={{ fontSize: '0.72rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' }}>{course.sa_required} SA required</span>}
                        {(course.in_progress > 0) && <span style={{ fontSize: '0.72rem', color: '#d97706', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', padding: '1px 5px', whiteSpace: 'nowrap' }}>{course.in_progress} in progress</span>}
                      </div>
                      {/* SA pass rate row */}
                      {course.sa_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                          <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#ede9fe', overflow: 'hidden' }}>
                            <div style={{ width: `${passPct}%`, height: '100%', background: '#16a34a', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', minWidth: '36px', textAlign: 'right' }}>{passPct}%</span>
                          <span style={{ fontSize: '0.72rem', color: '#7c3aed', whiteSpace: 'nowrap' }}>
                            {course.passed} / {course.member_count} SA passed
                          </span>
                          {saAvg != null && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: saAvgColor, whiteSpace: 'nowrap', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '1px 7px' }}>
                              avg {saAvg.toFixed(1)} / 5
                            </span>
                          )}
                        </div>
                      )}
                    </Link>
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