import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

export default function My() {
  const { dataUserId } = useImpersonation();
  const [assessments, setAssessments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pdp, setPdp] = useState(null);
  const [pastPlans, setPastPlans] = useState([]);
  const [pastPlansOpen, setPastPlansOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!dataUserId || !supabase) {
          setLoading(false);
          return;
        }
        const [aRes, sRes, pRes] = await Promise.all([
          supabase.from('skill_assessments').select('id, meeting_title, meeting_date, competency, skill_scores, overall_score, created_at').eq('user_id', dataUserId).order('created_at', { ascending: false }).limit(50),
          supabase.from('coaching_sessions').select('id, session_date, session_summary, audio_url, coaching_notes, assessment_id').eq('user_id', dataUserId).order('session_date', { ascending: false }).limit(20),
          supabase.from('development_plans').select('*').eq('user_id', dataUserId).eq('status', 'active').limit(1)
        ]);
        setAssessments(aRes?.data ?? []);
        setSessions(sRes?.data ?? []);
        setPdp(pRes?.data?.[0] ?? null);
        // Fetch past plans separately
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const hRes = await fetch(`${WORKER_URL}/pdp/history?sellerId=${encodeURIComponent(dataUserId)}`, {
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
          });
          if (hRes.ok) {
            const h = await hRes.json().catch(() => []);
            setPastPlans(Array.isArray(h) ? h : []);
          }
        } catch { /* silently ignore past plans error */ }
      } catch (e) {
        setAssessments([]);
        setSessions([]);
        setPdp(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUserId]);

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading your dashboard…</div>;

  const safeScores = (a) => (a && typeof a.skill_scores === 'object' && !Array.isArray(a.skill_scores) ? a.skill_scores : {});
  const avgScores = assessments.length
    ? Object.entries(
        assessments.reduce((acc, a) => {
          const scores = safeScores(a);
          Object.entries(scores).forEach(([k, v]) => {
            const num = typeof v === 'number' ? v : Number(v);
            if (!Number.isNaN(num)) acc[k] = (acc[k] || []).concat(num);
          });
          return acc;
        }, {})
      ).map(([skill, vals]) => ({ skill, avg: (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) }))
    : [];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>My Dashboard</h2>

      <section style={{ marginBottom: '32px' }}>
        <h3>Skills trend (Problem Discovery)</h3>
        {avgScores.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {avgScores.map(({ skill, avg }) => (
              <li key={skill} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                <span>{skill}</span>
                <strong>{avg}/5</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b' }}>No assessments yet. Run an assessment from the extension on a Highspot meeting.</p>
        )}
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h3>Assessment history</h3>
        {assessments.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {assessments.map((a) => (
              <li key={a.id} style={{ padding: '12px', background: 'white', borderRadius: '6px', marginBottom: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <Link to={`/my/assessment/${a.id}`} style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}>
                  {a.meeting_title || 'Untitled meeting'}
                </Link>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '4px' }}>
                  {new Date(a.created_at).toLocaleDateString()} · {a.competency} · Avg {a.overall_score != null ? Number(a.overall_score).toFixed(1) : '—'}/5
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b' }}>No assessments yet.</p>
        )}
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h3>Coaching sessions</h3>
        {sessions.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {sessions.map((s) => (
              <li key={s.id} style={{ padding: '12px', background: 'white', borderRadius: '6px', marginBottom: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <Link to={`/my/session/${s.id}`} style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}>
                  {new Date(s.session_date).toLocaleString()}
                </Link>
                {s.session_summary && <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#475569' }}>{s.session_summary}</p>}
                {s.audio_url && (
                  <audio controls src={s.audio_url} style={{ marginTop: '8px', width: '100%' }} />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b' }}>No coaching sessions yet.</p>
        )}
      </section>

      <section>
        <h3>Personal development plan</h3>
        {pdp ? (
          <div style={{ padding: '16px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {pdp.last_updated && (
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 0, marginBottom: '12px' }}>
                Last updated {new Date(pdp.last_updated).toLocaleString()}. Plan set by your manager.
              </p>
            )}
            {pdp.manager_notes && (
              <p style={{ marginBottom: '16px', fontSize: '0.9rem', padding: '10px', background: '#f8fafc', borderRadius: '6px', borderLeft: '4px solid #e2e8f0' }}>
                <strong>Manager notes:</strong> {pdp.manager_notes}
              </p>
            )}
            {pdp.focus_areas && pdp.focus_areas.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pdp.focus_areas.map((area, i) => {
                  if (typeof area === 'string' || (area && !area.skill && !area.goal)) {
                    return (
                      <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                        {typeof area === 'string' ? area : (area?.name || JSON.stringify(area))}
                      </div>
                    );
                  }
                  return (
                  <div
                    key={area.id || i}
                    style={{
                      padding: '16px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      borderLeftWidth: '4px',
                      borderLeftColor: area.priority === 'high' ? '#dc2626' : area.priority === 'medium' ? '#ca8a04' : '#64748b'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: area.priority === 'high' ? '#fef2f2' : area.priority === 'medium' ? '#fefce8' : '#f1f5f9',
                          color: area.priority === 'high' ? '#991b1b' : area.priority === 'medium' ? '#854d0e' : '#475569'
                        }}
                      >
                        {area.priority || 'focus'}
                      </span>
                      <strong style={{ fontSize: '1rem' }}>{area.skill || area.name || `Focus ${i + 1}`}</strong>
                      {area.milestones?.length > 0 && area.milestones.every((m) => m.status === 'completed') && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px' }}>
                          Section complete
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>{area.goal}</p>
                    {area.why && <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>{area.why}</p>}
                    {area.milestones && area.milestones.length > 0 && (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {area.milestones.map((milestone, j) => {
                          const isCompleted = milestone.status === 'completed';
                          const toggleMilestone = async () => {
                            const now = new Date().toISOString();
                            const nextFocusAreas = pdp.focus_areas.map((fa, fi) => {
                              if (fi !== i) return fa;
                              const nextMilestones = (fa.milestones || []).map((m, mj) =>
                                mj === j
                                  ? { ...m, status: isCompleted ? 'open' : 'completed', completed_at: isCompleted ? null : now }
                                  : m
                              );
                              return { ...fa, milestones: nextMilestones };
                            });
                            // Optimistically update UI immediately
                            setPdp((prev) => (prev ? { ...prev, focus_areas: nextFocusAreas, last_updated: now } : null));
                            // #region agent log
                            fetch('http://127.0.0.1:7340/ingest/528854f9-5e48-4287-b84d-996ef26e259f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f002a3'},body:JSON.stringify({sessionId:'f002a3',location:'My.jsx:toggleMilestone',message:'toggle via worker API',data:{pdpId:pdp?.id,dataUserId,milestoneJ:j,focusAreaI:i,toStatus:isCompleted?'open':'completed'},hypothesisId:'A',runId:'post-fix',timestamp:Date.now()})}).catch(()=>{});
                            // #endregion
                            try {
                              const { data: { session } } = await supabase.auth.getSession();
                              const token = session?.access_token;
                              const res = await fetch(`${WORKER_URL}/pdp/seller-update`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                                body: JSON.stringify({ sellerId: dataUserId, focusAreas: nextFocusAreas })
                              });
                              // #region agent log
                              fetch('http://127.0.0.1:7340/ingest/528854f9-5e48-4287-b84d-996ef26e259f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f002a3'},body:JSON.stringify({sessionId:'f002a3',location:'My.jsx:toggleMilestone-result',message:'worker API result',data:{status:res.status,ok:res.ok},hypothesisId:'A',runId:'post-fix',timestamp:Date.now()})}).catch(()=>{});
                              // #endregion
                              if (!res.ok) {
                                // Revert optimistic update on failure
                                setPdp((prev) => (prev ? { ...prev, focus_areas: pdp.focus_areas, last_updated: pdp.last_updated } : null));
                              }
                            } catch {
                              // Revert on network error
                              setPdp((prev) => (prev ? { ...prev, focus_areas: pdp.focus_areas, last_updated: pdp.last_updated } : null));
                            }
                          };
                          return (
                            <li key={milestone.id || j} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                              <input
                                type="checkbox"
                                checked={isCompleted}
                                onChange={toggleMilestone}
                                style={{ marginTop: '4px', width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                              <span style={{ textDecoration: isCompleted ? 'line-through' : 'none', color: isCompleted ? '#64748b' : 'inherit', fontSize: '0.9rem' }}>
                                {milestone.text}
                                {milestone.due_date && <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px' }}>(by {milestone.due_date})</span>}
                                {isCompleted && milestone.completed_at && (
                                  <span style={{ fontSize: '0.8rem', color: '#16a34a', marginLeft: '8px' }}>
                                    — Completed {(() => {
                                      try {
                                        const d = new Date(milestone.completed_at);
                                        return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                                      } catch { return ''; }
                                    })()}
                                  </span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div style={{ marginTop: '12px' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Your updates / reflections
                      </label>
                      <textarea
                        value={area.seller_notes || ''}
                        onChange={(e) => {
                          setPdp((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              focus_areas: prev.focus_areas.map((fa, fi) =>
                                fi === i ? { ...fa, seller_notes: e.target.value } : fa
                              )
                            };
                          });
                        }}
                        onBlur={async (e) => {
                          const value = (e.target.value || '').trim();
                          const nextFocusAreas = pdp.focus_areas.map((fa, fi) =>
                            fi === i ? { ...fa, seller_notes: value } : fa
                          );
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
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                );
                })}
              </div>
            ) : null}
            {(!pdp.focus_areas || pdp.focus_areas.length === 0) && !pdp.manager_notes && (
              <p style={{ color: '#64748b', margin: 0 }}>No PDP yet. Complete assessments and coaching sessions so your manager can build your plan.</p>
            )}
          </div>
        ) : (
          <p style={{ color: '#64748b' }}>No development plan yet. Complete assessments and coaching to see focus areas here.</p>
        )}
      </section>

      {(pastPlans.length > 0) && (
        <section style={{ marginBottom: '32px' }}>
          <button
            type="button"
            onClick={() => setPastPlansOpen((o) => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '1rem', fontWeight: 700, color: '#334155' }}
          >
            <span>{pastPlansOpen ? '▾' : '▸'}</span>
            <h3 style={{ margin: 0, fontWeight: 700 }}>Past development plans ({pastPlans.length})</h3>
          </button>
          {pastPlansOpen && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {pastPlans.map((plan, pi) => {
                const completedDate = plan.completed_at
                  ? (() => { try { const d = new Date(plan.completed_at); return isNaN(d.getTime()) ? 'unknown' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return 'unknown'; } })()
                  : 'unknown';
                return (
                  <div key={plan.id || pi} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                      <strong style={{ fontSize: '0.875rem' }}>Plan completed {completedDate}</strong>
                      {plan.completion_notes && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: '#475569', padding: '8px 10px', background: '#e0f2fe', borderRadius: '6px', borderLeft: '3px solid #0ea5e9' }}>
                          <strong>Manager reflection:</strong> {plan.completion_notes}
                        </p>
                      )}
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {Array.isArray(plan.focus_areas) && plan.focus_areas.map((area, ai) => {
                        if (typeof area === 'string') return <div key={ai} style={{ fontSize: '0.9rem', color: '#475569' }}>{area}</div>;
                        const milestones = area.milestones || [];
                        const allDone = milestones.length > 0 && milestones.every((m) => m.status === 'completed');
                        return (
                          <div key={area.id || ai} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '0.9rem' }}>{area.skill || area.name || `Focus ${ai + 1}`}</strong>
                              {allDone && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>Completed</span>}
                            </div>
                            {area.goal && <p style={{ margin: '0 0 6px', fontSize: '0.875rem', color: '#475569' }}>{area.goal}</p>}
                            {milestones.length > 0 && (
                              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {milestones.map((m, mi) => {
                                  const done = m.status === 'completed';
                                  const cDate = m.completed_at ? (() => { try { const d = new Date(m.completed_at); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } })() : '';
                                  return (
                                    <li key={m.id || mi} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px', fontSize: '0.875rem' }}>
                                      <span style={{ color: done ? '#16a34a' : '#94a3b8', flexShrink: 0 }}>{done ? '✓' : '○'}</span>
                                      <span style={{ textDecoration: done ? 'line-through' : 'none', color: done ? '#64748b' : 'inherit' }}>
                                        {m.text}
                                        {done && cDate && <span style={{ fontSize: '0.8rem', color: '#16a34a', marginLeft: '6px' }}>— {cDate}</span>}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            {area.seller_notes?.trim() && (
                              <div style={{ marginTop: '8px', padding: '8px 10px', background: 'white', borderRadius: '4px', borderLeft: '3px solid #94a3b8', fontSize: '0.85rem', color: '#475569' }}>
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
        </section>
      )}
    </div>
  );
}
