import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="avatar avatar-lg">{initials}</div>;
}

function ScoreBar({ score, max = 5 }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const color = score >= 4 ? '#16a34a' : score >= 3 ? '#7c3aed' : score >= 2 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '99px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color, minWidth: '28px', textAlign: 'right' }}>{Number(score).toFixed(1)}</span>
    </div>
  );
}

function SpiderChart({ skills, max = 5 }) {
  if (!skills || skills.length < 2) return null;

  // Radar needs ≥3 axes — pad with a phantom if only 2 skills
  const skills3 = skills.length === 2
    ? [...skills, { skill: '', avg: 0, phantom: true }]
    : skills;

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 95;
  const levels = 5;
  const n = skills3.length;

  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i, r) => ({
    x: cx + r * Math.cos(angleFor(i)),
    y: cy + r * Math.sin(angleFor(i)),
  });
  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';

  const rings = Array.from({ length: levels }, (_, l) => {
    const r = (radius * (l + 1)) / levels;
    return toPath(Array.from({ length: n }, (__, i) => pointFor(i, r)));
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const o = pointFor(i, radius);
    return `M${cx},${cy} L${o.x.toFixed(2)},${o.y.toFixed(2)}`;
  });

  const dataPoints = skills3.map(({ avg }, i) => pointFor(i, (Math.min(avg, max) / max) * radius));
  const dataPath = toPath(dataPoints);

  const labelPad = 28;
  const labels = skills3.map(({ skill, avg, phantom }, i) => {
    const pt = pointFor(i, radius + labelPad);
    const cos = Math.cos(angleFor(i));
    const anchor = Math.abs(cos) < 0.12 ? 'middle' : cos > 0 ? 'start' : 'end';
    return { x: pt.x, y: pt.y, skill, avg, anchor, phantom };
  });

  // Score colour matching dashboard palette
  const scoreColor = (v) => v >= 4 ? '#16a34a' : v >= 3 ? '#7c3aed' : v >= 2 ? '#d97706' : '#dc2626';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: '100%', maxWidth: '280px', height: 'auto', overflow: 'visible', display: 'block', margin: '0 auto' }}
    >
      {/* Alternating filled rings */}
      {rings.map((d, i) => (
        <path key={i} d={d}
          fill={i % 2 === 0 ? 'rgba(241,245,249,0.8)' : 'rgba(248,250,252,0.4)'}
          stroke="#e2e8f0" strokeWidth="1"
        />
      ))}
      {/* Axis spokes */}
      {axes.map((d, i) => (
        <path key={i} d={d} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
      ))}
      {/* Ring level numbers on rightmost axis */}
      {Array.from({ length: levels }, (_, l) => {
        const r = (radius * (l + 1)) / levels;
        const pt = pointFor(0, r);
        return (
          <text key={l} x={pt.x + 5} y={pt.y} fontSize="8.5" fill="#94a3b8" dominantBaseline="middle">
            {l + 1}
          </text>
        );
      })}
      {/* Data fill */}
      <path d={dataPath} fill="rgba(124,58,237,0.12)" stroke="none" />
      {/* Data stroke */}
      <path d={dataPath} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinejoin="round" />
      {/* Vertex dots — skip phantom */}
      {dataPoints.map((p, i) =>
        skills3[i].phantom ? null : (
          <circle key={i} cx={p.x} cy={p.y} r="5"
            fill={scoreColor(skills3[i].avg)} stroke="white" strokeWidth="2"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' }}
          />
        )
      )}
      {/* Labels — skip phantom */}
      {labels.map(({ x, y, skill, avg, anchor, phantom }, i) =>
        phantom ? null : (
          <g key={i}>
            <text x={x} y={y - 6} fontSize="10.5" fontWeight="600" fill="#334155"
              textAnchor={anchor} dominantBaseline="middle"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif' }}
            >
              {skill.length > 20 ? skill.slice(0, 18) + '…' : skill}
            </text>
            <text x={x} y={y + 9} fontSize="11" fontWeight="700"
              fill={scoreColor(avg)} textAnchor={anchor} dominantBaseline="middle"
            >
              {avg.toFixed(1)}<tspan fontSize="8.5" fontWeight="500" fill="#94a3b8">/5</tspan>
            </text>
          </g>
        )
      )}
    </svg>
  );
}

export default function My() {
  const { dataUserId } = useImpersonation();
  const [assessments, setAssessments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pdp, setPdp] = useState(null);
  const [pastPlans, setPastPlans] = useState([]);
  const [pastPlansOpen, setPastPlansOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!dataUserId || !supabase) { setLoading(false); return; }
        const [aRes, sRes, pRes, uRes] = await Promise.all([
          supabase.from('skill_assessments').select('id, meeting_title, meeting_date, competency, skill_scores, overall_score, created_at').eq('user_id', dataUserId).order('created_at', { ascending: false }).limit(50),
          supabase.from('coaching_sessions').select('id, session_date, session_summary, audio_url, coaching_notes, assessment_id').eq('user_id', dataUserId).order('session_date', { ascending: false }).limit(20),
          supabase.from('development_plans').select('*').eq('user_id', dataUserId).eq('status', 'active').limit(1),
          supabase.from('users').select('full_name').eq('id', dataUserId).single(),
        ]);
        setAssessments(aRes?.data ?? []);
        setSessions(sRes?.data ?? []);
        setPdp(pRes?.data?.[0] ?? null);
        setUserName(uRes?.data?.full_name || '');
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const hRes = await fetch(`${WORKER_URL}/pdp/history?sellerId=${encodeURIComponent(dataUserId)}`, {
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
          });
          if (hRes.ok) { const h = await hRes.json().catch(() => []); setPastPlans(Array.isArray(h) ? h : []); }
        } catch { /* ignore */ }
      } catch {
        setAssessments([]); setSessions([]); setPdp(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUserId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading your dashboard…</div>;

  const safeScores = (a) => (a && typeof a.skill_scores === 'object' && !Array.isArray(a.skill_scores) ? a.skill_scores : {});
  const avgScores = assessments.length
    ? Object.entries(
        assessments.reduce((acc, a) => {
          Object.entries(safeScores(a)).forEach(([k, v]) => {
            const n = typeof v === 'number' ? v : Number(v);
            if (!Number.isNaN(n)) acc[k] = (acc[k] || []).concat(n);
          });
          return acc;
        }, {})
      ).map(([skill, vals]) => ({ skill, avg: vals.reduce((s, v) => s + v, 0) / vals.length }))
    : [];

  const totalMilestones = pdp?.focus_areas?.reduce((s, a) => s + (a?.milestones?.length || 0), 0) || 0;
  const doneMilestones = pdp?.focus_areas?.reduce((s, a) => s + (a?.milestones?.filter((m) => m.status === 'completed').length || 0), 0) || 0;
  const pdpPct = totalMilestones > 0 ? Math.round((doneMilestones / totalMilestones) * 100) : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <Avatar name={userName} />
        <div>
          <h1 className="page-title">{greeting}{userName ? `, ${userName.split(' ')[0]}` : ''}!</h1>
          <p className="page-subtitle">Here's your coaching progress overview.</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-value">{assessments.length}</div>
          <div className="stat-label">Assessments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sessions.length}</div>
          <div className="stat-label">Coaching sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: pdp ? '#7c3aed' : '#94a3b8' }}>{pdp ? `${pdpPct}%` : '—'}</div>
          <div className="stat-label">PDP progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{doneMilestones}</div>
          <div className="stat-label">Milestones done</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '18px', marginBottom: '24px', alignItems: 'stretch' }}>
        {/* Skills overview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="card-header">
            <h2 className="card-title">Skills overview</h2>
            <span className="badge badge-purple">{assessments.length} assessment{assessments.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {avgScores.length > 0 ? (
              <>
                <SpiderChart skills={avgScores} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  {avgScores.map(({ skill, avg }) => (
                    <div key={skill}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#334155' }}>{skill}</span>
                      </div>
                      <ScoreBar score={avg} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📊</div>
                <div>No assessments yet.</div>
                <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>Run an assessment from the extension on a Highspot meeting.</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent coaching sessions */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="card-header">
            <h2 className="card-title">Coaching sessions</h2>
            <span className="badge badge-slate">{sessions.length} total</span>
          </div>
          {sessions.length > 0 ? (
            <div className="card-body-tight" style={{ flex: 1 }}>
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="list-item">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/my/session/${s.id}`} className="text-link" style={{ fontSize: '0.875rem', display: 'block', marginBottom: '2px' }}>
                      {new Date(s.session_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Link>
                    {s.session_summary && (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.session_summary}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-body" style={{ flex: 1 }}>
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <div className="empty-icon">💬</div>
                <div>No coaching sessions yet.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assessment history */}
      <div className="card section">
        <div className="card-header">
          <h2 className="card-title">Assessment history</h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{assessments.length} total</span>
        </div>
        {assessments.length > 0 ? (
          <div className="card-body-tight">
            {assessments.map((a) => (
              <div key={a.id} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/my/assessment/${a.id}`} className="text-link" style={{ fontSize: '0.875rem' }}>
                    {a.meeting_title || 'Untitled meeting'}
                  </Link>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    {new Date(a.created_at).toLocaleDateString()} · {a.competency}
                  </div>
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                  {a.overall_score != null ? `${Number(a.overall_score).toFixed(1)}/5` : '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-body">
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div className="empty-icon">🎯</div>
              <div>No assessments yet.</div>
            </div>
          </div>
        )}
      </div>

      {/* PDP */}
      <div className="card section">
        <div className="card-header">
          <h2 className="card-title">Personal development plan</h2>
          {pdp && totalMilestones > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{doneMilestones}/{totalMilestones} milestones</span>
              <div style={{ width: 80, height: 6, background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pdpPct}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: '99px' }} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed' }}>{pdpPct}%</span>
            </div>
          )}
        </div>
        {pdp ? (
          <div className="card-body">
            {pdp.last_updated && (
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 16px' }}>
                Last updated {new Date(pdp.last_updated).toLocaleString()} · Plan set by your manager
              </p>
            )}
            {pdp.manager_notes && (
              <div style={{ marginBottom: '20px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #e2e8f0', fontSize: '0.875rem', color: '#475569' }}>
                <strong style={{ color: '#334155' }}>Manager notes:</strong> {pdp.manager_notes}
              </div>
            )}
            {pdp.focus_areas?.length > 0 ? (
              <div>
                {pdp.focus_areas.map((area, i) => {
                  if (typeof area === 'string' || (area && !area.skill && !area.goal)) {
                    return (
                      <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                        {typeof area === 'string' ? area : (area?.name || JSON.stringify(area))}
                      </div>
                    );
                  }
                  const priorityClass = area.priority === 'high' ? 'focus-card-high' : area.priority === 'medium' ? 'focus-card-medium' : 'focus-card-low';
                  const allDone = area.milestones?.length > 0 && area.milestones.every((m) => m.status === 'completed');
                  return (
                    <div key={area.id || i} className={`focus-card ${priorityClass}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span className={`badge ${area.priority === 'high' ? 'badge-red' : area.priority === 'medium' ? 'badge-amber' : 'badge-slate'}`}>
                          {area.priority || 'focus'}
                        </span>
                        <strong style={{ fontSize: '0.9375rem', color: '#1e293b' }}>{area.skill || area.name || `Focus ${i + 1}`}</strong>
                        {allDone && <span className="badge badge-green">Section complete ✓</span>}
                      </div>
                      {area.goal && <p style={{ margin: '0 0 4px', fontSize: '0.875rem', color: '#475569' }}>{area.goal}</p>}
                      {area.why && <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>{area.why}</p>}
                      {area.milestones?.length > 0 && (
                        <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
                          {area.milestones.map((milestone, j) => {
                            const isCompleted = milestone.status === 'completed';
                            const toggleMilestone = async () => {
                              const now = new Date().toISOString();
                              const nextFocusAreas = pdp.focus_areas.map((fa, fi) => {
                                if (fi !== i) return fa;
                                return {
                                  ...fa,
                                  milestones: (fa.milestones || []).map((m, mj) =>
                                    mj === j ? { ...m, status: isCompleted ? 'open' : 'completed', completed_at: isCompleted ? null : now } : m
                                  )
                                };
                              });
                              setPdp((prev) => (prev ? { ...prev, focus_areas: nextFocusAreas, last_updated: now } : null));
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                const token = session?.access_token;
                                const res = await fetch(`${WORKER_URL}/pdp/seller-update`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                                  body: JSON.stringify({ sellerId: dataUserId, focusAreas: nextFocusAreas })
                                });
                                if (!res.ok) setPdp((prev) => (prev ? { ...prev, focus_areas: pdp.focus_areas, last_updated: pdp.last_updated } : null));
                              } catch {
                                setPdp((prev) => (prev ? { ...prev, focus_areas: pdp.focus_areas, last_updated: pdp.last_updated } : null));
                              }
                            };
                            return (
                              <li key={milestone.id || j} className="milestone-item">
                                <input
                                  type="checkbox"
                                  className="milestone-checkbox"
                                  checked={isCompleted}
                                  onChange={toggleMilestone}
                                />
                                <div style={{ flex: 1 }}>
                                  <span style={{ textDecoration: isCompleted ? 'line-through' : 'none', color: isCompleted ? '#94a3b8' : '#334155', fontSize: '0.875rem' }}>
                                    {milestone.text}
                                  </span>
                                  <div style={{ display: 'flex', gap: '12px', marginTop: '2px', flexWrap: 'wrap' }}>
                                    {milestone.due_date && !isCompleted && (
                                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Due {milestone.due_date}</span>
                                    )}
                                    {isCompleted && milestone.completed_at && (
                                      <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 500 }}>
                                        ✓ Completed {(() => { try { const d = new Date(milestone.completed_at); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } })()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div style={{ marginTop: '12px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Your updates / reflections
                        </label>
                        <textarea
                          className="form-textarea"
                          value={area.seller_notes || ''}
                          onChange={(e) => {
                            setPdp((prev) => {
                              if (!prev) return prev;
                              return { ...prev, focus_areas: prev.focus_areas.map((fa, fi) => fi === i ? { ...fa, seller_notes: e.target.value } : fa) };
                            });
                          }}
                          onBlur={async (e) => {
                            const value = (e.target.value || '').trim();
                            const nextFocusAreas = pdp.focus_areas.map((fa, fi) => fi === i ? { ...fa, seller_notes: value } : fa);
                            setPdp((prev) => (prev ? { ...prev, focus_areas: nextFocusAreas, last_updated: new Date().toISOString() } : null));
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              const token = session?.access_token;
                              await fetch(`${WORKER_URL}/pdp/seller-update`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                                body: JSON.stringify({ sellerId: dataUserId, focusAreas: nextFocusAreas })
                              });
                            } catch { /* best-effort */ }
                          }}
                          placeholder="Add notes, progress, or reflections for your manager…"
                          rows={2}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <div>No focus areas set yet.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div>No development plan yet.</div>
              <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>Complete assessments and coaching so your manager can build your plan.</div>
            </div>
          </div>
        )}
      </div>

      {/* Past plans */}
      {pastPlans.length > 0 && (
        <div className="card section">
          <button
            type="button"
            onClick={() => setPastPlansOpen((o) => !o)}
            className="card-header"
            style={{ width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
          >
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{pastPlansOpen ? '▾' : '▸'}</span>
              Past development plans
              <span className="badge badge-slate">{pastPlans.length}</span>
            </h2>
          </button>
          {pastPlansOpen && (
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {pastPlans.map((plan, pi) => {
                const completedDate = plan.completed_at
                  ? (() => { try { const d = new Date(plan.completed_at); return isNaN(d.getTime()) ? 'unknown' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return 'unknown'; } })()
                  : 'unknown';
                return (
                  <div key={plan.id || pi} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                      <strong style={{ fontSize: '0.875rem', color: '#334155' }}>Completed {completedDate}</strong>
                      {plan.completion_notes && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: '#475569', padding: '8px 10px', background: '#e0f2fe', borderRadius: '6px', borderLeft: '3px solid #0ea5e9' }}>
                          <strong>Manager reflection:</strong> {plan.completion_notes}
                        </p>
                      )}
                    </div>
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {Array.isArray(plan.focus_areas) && plan.focus_areas.map((area, ai) => {
                        if (typeof area === 'string') return <div key={ai} style={{ fontSize: '0.875rem', color: '#475569' }}>{area}</div>;
                        const milestones = area.milestones || [];
                        const allDone = milestones.length > 0 && milestones.every((m) => m.status === 'completed');
                        return (
                          <div key={area.id || ai} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.875rem', color: '#334155' }}>{area.skill || area.name || `Focus ${ai + 1}`}</strong>
                              {allDone && <span className="badge badge-green">Completed ✓</span>}
                            </div>
                            {area.goal && <p style={{ margin: '0 0 6px', fontSize: '0.8125rem', color: '#64748b' }}>{area.goal}</p>}
                            {milestones.length > 0 && (
                              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {milestones.map((m, mi) => {
                                  const done = m.status === 'completed';
                                  return (
                                    <li key={m.id || mi} style={{ display: 'flex', gap: '6px', marginBottom: '3px', fontSize: '0.8125rem', color: done ? '#64748b' : '#334155' }}>
                                      <span style={{ color: done ? '#16a34a' : '#94a3b8', flexShrink: 0 }}>{done ? '✓' : '○'}</span>
                                      <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{m.text}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {area.seller_notes?.trim() && (
                              <div style={{ marginTop: '8px', padding: '6px 10px', background: 'white', borderRadius: '4px', borderLeft: '3px solid #94a3b8', fontSize: '0.8125rem', color: '#475569' }}>
                                <strong>Your notes:</strong> {area.seller_notes.trim()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
