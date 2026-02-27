import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const cardStyle = { padding: '20px', background: 'white', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const sectionHeading = { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' };

export default function AssessmentDetail() {
  const { id, userId: memberUserId } = useParams();
  const { dataUserId } = useImpersonation();
  // When navigated from a team member page (/team/:userId/assessment/:id), use the member's
  // userId directly; otherwise fall back to the impersonation-aware dataUserId.
  const targetUserId = memberUserId || dataUserId;
  const backLink = memberUserId ? `/team/${memberUserId}` : '/my';
  const backLabel = memberUserId ? '← Back to team member' : '← Back to My Dashboard';
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !targetUserId || !supabase) {
      setLoading(false);
      return;
    }
    supabase.from('skill_assessments').select('*').eq('id', id).eq('user_id', targetUserId).single()
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setAssessment(data);
      })
      .finally(() => setLoading(false));
  }, [id, targetUserId]);

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading assessment…</div>;
  if (error || !assessment) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <Link to={backLink} style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>{backLabel}</Link>
        <p style={{ color: '#991b1b' }}>{error || 'Assessment not found.'}</p>
      </div>
    );
  }

  const raw = Array.isArray(assessment.assessment_raw) ? assessment.assessment_raw : [];
  const meetingDate = assessment.meeting_date || assessment.created_at;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Link to={backLink} style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>{backLabel}</Link>

      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '8px' }}>{assessment.meeting_title || 'Untitled meeting'}</h2>
        <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '4px' }}>
          {meetingDate && new Date(meetingDate).toLocaleString()} · {assessment.competency || 'Problem discovery'}
          {assessment.meeting_type && ` · ${assessment.meeting_type}`}
        </div>
        <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
          Overall score: {assessment.overall_score != null ? Number(assessment.overall_score).toFixed(1) : '—'}/5
        </div>
      </div>

      {raw.length === 0 && (
        <div style={cardStyle}>
          <p style={{ color: '#64748b' }}>No detailed breakdown saved. Skill scores:</p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {Object.entries(assessment.skill_scores || {}).map(([skill, score]) => (
              <li key={skill}>{skill}: {Number(score).toFixed(1)}/5</li>
            ))}
          </ul>
        </div>
      )}

      {raw.map((a, index) => {
        const skillName = a.skill || a.skillName || `Skill ${index + 1}`;
        const rating = a.rating != null ? Number(a.rating) : null;
        const ratingColor = rating >= 4 ? '#16a34a' : rating >= 3 ? '#ca8a04' : '#dc2626';
        const strengths = a.strengths || [];
        const improvementTitle = a.improvement_title || 'Areas for Improvement';
        const improvements = a.improvements || [];
        const coachingTips = a.coaching_tips || [];
        const levelChecks = a.level_checks || [];

        return (
          <div key={index} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{skillName}</h3>
              {rating != null && (
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: ratingColor }}>{rating}/5</span>
              )}
            </div>

            {levelChecks.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ ...sectionHeading, color: '#6d28d9', borderBottomColor: '#e9d5ff' }}>Level checks</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[...levelChecks].sort((x, y) => (x.level || 0) - (y.level || 0)).map((lc, i) => (
                    <details key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                      <summary style={{ padding: '12px', cursor: 'pointer', background: '#f8fafc', fontWeight: 500 }}>
                        Level {lc.level ?? ''}: {lc.name || `Level ${lc.level}`}
                      </summary>
                      <div style={{ padding: '12px', borderTop: '1px solid #e2e8f0' }}>
                        {(lc.checks || []).map((c, j) => (
                          <div key={j} style={{ marginBottom: '8px', fontSize: '0.875rem' }}>
                            <span style={{ fontWeight: 500 }}>{c.characteristic}</span>
                            {c.reason && <div style={{ color: '#64748b', marginTop: '2px' }}>{c.reason}</div>}
                            {c.evidence && c.evidence.length > 0 && (
                              <ul style={{ margin: '4px 0 0', paddingLeft: '20px', color: '#475569' }}>
                                {c.evidence.map((ev, k) => <li key={k}>{typeof ev === 'string' ? ev : JSON.stringify(ev)}</li>)}
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

            <div style={{ marginBottom: '20px' }}>
              <div style={{ ...sectionHeading, color: '#16a34a', borderBottomColor: '#bbf7d0' }}>Strengths exhibited</div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                {strengths.length ? strengths.map((s, i) => <li key={i}>{s}</li>) : <li style={{ color: '#64748b' }}>None identified.</li>}
              </ul>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ ...sectionHeading, color: '#ca8a04', borderBottomColor: '#fde68a' }}>{improvementTitle}</div>
              <div style={{ fontSize: '0.9rem' }}>
                {improvements.length ? (
                  improvements.map((imp, i) => (
                    <div key={i} style={{ marginBottom: '12px', paddingTop: i ? '12px' : 0, borderTop: i ? '1px solid #e2e8f0' : 'none' }}>
                      <p style={{ margin: '0 0 6px', fontWeight: 500 }}>{imp.point || 'General improvement'}</p>
                      {imp.example && (imp.example.instead_of || imp.example.try_this) && (
                        <div style={{ marginLeft: '12px', paddingLeft: '12px', borderLeft: '4px solid #e2e8f0', color: '#64748b', fontStyle: 'italic' }}>
                          {imp.example.instead_of && <p style={{ margin: '0 0 4px' }}><strong>Instead of:</strong> {imp.example.instead_of}</p>}
                          {imp.example.try_this && <p style={{ margin: 0 }}><strong>Try this:</strong> {imp.example.try_this}</p>}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: '#64748b', margin: 0 }}>None identified.</p>
                )}
              </div>
            </div>

            <div>
              <div style={{ ...sectionHeading, color: '#1d4ed8', borderBottomColor: '#bfdbfe' }}>Coaching tips</div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
                {coachingTips.length ? coachingTips.map((tip, i) => <li key={i}>{tip}</li>) : <li style={{ color: '#64748b' }}>None identified.</li>}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
