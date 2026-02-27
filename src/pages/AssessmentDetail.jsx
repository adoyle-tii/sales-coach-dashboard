import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

function ScoreRing({ score, max = 5 }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = score >= 4 ? '#16a34a' : score >= 3 ? '#7c3aed' : score >= 2 ? '#d97706' : '#dc2626';
  const r = 22, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ position: 'relative', width: 60, height: 60, flexShrink: 0 }}>
      <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="30" cy="30" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle cx="30" cy="30" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '1rem', fontWeight: 700, color, lineHeight: 1 }}>{Number(score).toFixed(1)}</span>
        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>/{max}</span>
      </div>
    </div>
  );
}

export default function AssessmentDetail() {
  const { id, userId: memberUserId } = useParams();
  const { dataUserId } = useImpersonation();
  const targetUserId = memberUserId || dataUserId;
  const backLink = memberUserId ? `/team/${memberUserId}` : '/my';
  const backLabel = memberUserId ? '← Back to team member' : '← Back to My Dashboard';
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !targetUserId || !supabase) { setLoading(false); return; }
    supabase.from('skill_assessments').select('*').eq('id', id).eq('user_id', targetUserId).single()
      .then(({ data, error: e }) => { if (e) setError(e.message); else setAssessment(data); })
      .finally(() => setLoading(false));
  }, [id, targetUserId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading assessment…</div>;

  if (error || !assessment) {
    return (
      <div>
        <Link to={backLink} className="back-link">{backLabel}</Link>
        <div className="alert alert-error">{error || 'Assessment not found.'}</div>
      </div>
    );
  }

  const raw = Array.isArray(assessment.assessment_raw) ? assessment.assessment_raw : [];
  const meetingDate = assessment.meeting_date || assessment.created_at;

  return (
    <div style={{ maxWidth: '800px' }}>
      <Link to={backLink} className="back-link">{backLabel}</Link>

      {/* Header */}
      <div className="card section">
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            {assessment.overall_score != null && <ScoreRing score={Number(assessment.overall_score)} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                {assessment.meeting_title || 'Untitled meeting'}
              </h1>
              <div style={{ fontSize: '0.875rem', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {meetingDate && <span>{new Date(meetingDate).toLocaleString()}</span>}
                {assessment.competency && <span className="badge badge-purple">{assessment.competency}</span>}
                {assessment.meeting_type && <span className="badge badge-slate">{assessment.meeting_type}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fallback: no raw breakdown */}
      {raw.length === 0 && (
        <div className="card section">
          <div className="card-header"><h2 className="card-title">Skill scores</h2></div>
          <div className="card-body-tight">
            {Object.entries(assessment.skill_scores || {}).map(([skill, score]) => {
              const s = Number(score);
              const color = s >= 4 ? '#16a34a' : s >= 3 ? '#7c3aed' : s >= 2 ? '#d97706' : '#dc2626';
              return (
                <div key={skill} className="list-item">
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>{skill}</span>
                  <span style={{ fontWeight: 700, color }}>{s.toFixed(1)}/5</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-skill cards */}
      {raw.map((a, index) => {
        const skillName = a.skill || a.skillName || `Skill ${index + 1}`;
        const rating = a.rating != null ? Number(a.rating) : null;
        const strengths = a.strengths || [];
        const improvementTitle = a.improvement_title || 'Areas for improvement';
        const improvements = a.improvements || [];
        const coachingTips = a.coaching_tips || [];
        const levelChecks = a.level_checks || [];

        return (
          <div key={index} className="card section">
            <div className="card-header">
              <h2 className="card-title" style={{ fontSize: '1.0625rem' }}>{skillName}</h2>
              {rating != null && <ScoreRing score={rating} />}
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* Level checks */}
              {levelChecks.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6d28d9', marginBottom: '10px', paddingBottom: '6px', borderBottom: '2px solid #e9d5ff' }}>Level checks</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[...levelChecks].sort((x, y) => (x.level || 0) - (y.level || 0)).map((lc, i) => (
                      <details key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                        <summary style={{ padding: '10px 14px', cursor: 'pointer', background: '#f8fafc', fontWeight: 500, fontSize: '0.875rem' }}>
                          Level {lc.level ?? ''}: {lc.name || `Level ${lc.level}`}
                        </summary>
                        <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>
                          {(lc.checks || []).map((c, j) => (
                            <div key={j} style={{ marginBottom: '10px', fontSize: '0.875rem' }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{c.characteristic}</span>
                              {c.reason && <div style={{ color: '#64748b', marginTop: '3px', lineHeight: 1.5 }}>{c.reason}</div>}
                              {c.evidence?.length > 0 && (
                                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: '#475569' }}>
                                  {c.evidence.map((ev, k) => <li key={k} style={{ marginBottom: '3px' }}>{typeof ev === 'string' ? ev : JSON.stringify(ev)}</li>)}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#16a34a', marginBottom: '10px', paddingBottom: '6px', borderBottom: '2px solid #bbf7d0' }}>Strengths exhibited</div>
                {strengths.length ? (
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.875rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                ) : <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>None identified.</p>}
              </div>

              {/* Improvements */}
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#d97706', marginBottom: '10px', paddingBottom: '6px', borderBottom: '2px solid #fde68a' }}>{improvementTitle}</div>
                {improvements.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {improvements.map((imp, i) => (
                      <div key={i}>
                        <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.875rem', color: '#334155' }}>{imp.point || 'General improvement'}</p>
                        {imp.example && (imp.example.instead_of || imp.example.try_this) && (
                          <div style={{ marginLeft: '10px', padding: '10px 14px', background: '#f8fafc', borderLeft: '4px solid #e2e8f0', borderRadius: '0 8px 8px 0', fontSize: '0.8125rem', color: '#475569' }}>
                            {imp.example.instead_of && <p style={{ margin: '0 0 6px' }}><strong style={{ color: '#dc2626' }}>Instead of:</strong> {imp.example.instead_of}</p>}
                            {imp.example.try_this && <p style={{ margin: 0 }}><strong style={{ color: '#16a34a' }}>Try this:</strong> {imp.example.try_this}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p style={{ margin: 0, fontSize: '0.875rem', color: '#94a3b8' }}>None identified.</p>}
              </div>

              {/* Coaching tips */}
              {coachingTips.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#2563eb', marginBottom: '10px', paddingBottom: '6px', borderBottom: '2px solid #bfdbfe' }}>Coaching tips</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.875rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {coachingTips.map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
