import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

export default function My() {
  const { dataUserId } = useImpersonation();
  const [assessments, setAssessments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pdp, setPdp] = useState(null);
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
          supabase.from('development_plans').select('*').eq('user_id', dataUserId).single()
        ]);
        setAssessments(aRes?.data ?? []);
        setSessions(sRes?.data ?? []);
        setPdp(pRes?.data ?? null);
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
                <div style={{ fontWeight: 600 }}>{a.meeting_title || 'Untitled meeting'}</div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
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
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>{new Date(s.session_date).toLocaleString()}</div>
                {s.session_summary && <p style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>{s.session_summary}</p>}
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
          <div style={{ padding: '16px', background: 'white', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            {pdp.focus_areas && pdp.focus_areas.length > 0 && (
              <div>
                <strong>Focus areas</strong>
                <ul>{pdp.focus_areas.map((f, i) => <li key={i}>{typeof f === 'string' ? f : f?.name || JSON.stringify(f)}</li>)}</ul>
              </div>
            )}
            {pdp.manager_notes && <p><strong>Manager notes:</strong> {pdp.manager_notes}</p>}
            {(!pdp.focus_areas || pdp.focus_areas.length === 0) && !pdp.manager_notes && (
              <p style={{ color: '#64748b' }}>No PDP yet. Complete assessments and coaching sessions to build your plan.</p>
            )}
          </div>
        ) : (
          <p style={{ color: '#64748b' }}>No development plan yet. Complete assessments and coaching to see focus areas here.</p>
        )}
      </section>
    </div>
  );
}
