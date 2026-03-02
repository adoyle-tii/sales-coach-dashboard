import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PdpChatPanel from '../components/PdpChatPanel';
import SpiderChart, { ScoreBar } from '../components/SpiderChart';
import CourseCompletionPanel from '../components/CourseCompletionPanel';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="avatar avatar-lg">{initials}</div>;
}

function safeScores(a) {
  return a && typeof a.skill_scores === 'object' && !Array.isArray(a.skill_scores)
    ? a.skill_scores
    : {};
}

export default function TeamMember() {
  const { userId } = useParams();
  const [member, setMember] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pdp, setPdp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [courseCompletions, setCourseCompletions] = useState([]);
  const [courseLoading, setCourseLoading] = useState(false);

  useEffect(() => {
    if (!userId || !supabase) { setLoading(false); return; }
    (async () => {
      const [uRes, aRes, sRes, pRes] = await Promise.all([
        supabase.from('users').select('id, full_name, email').eq('id', userId).single(),
        supabase.from('skill_assessments').select('id, meeting_title, meeting_date, competency, skill_scores, overall_score, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('coaching_sessions').select('id, session_date, session_summary, audio_url, coaching_notes, assessment_id').eq('user_id', userId).order('session_date', { ascending: false }).limit(20),
        supabase.from('development_plans').select('*').eq('user_id', userId).eq('status', 'active').limit(1),
      ]);
      setMember(uRes?.data || null);
      setAssessments(aRes?.data || []);
      setSessions(sRes?.data || []);
      setPdp(pRes?.data?.[0] || null);
      setLoading(false);

      // Fetch course completions for this member
      setCourseLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const cRes = await fetch(`${WORKER_URL}/hs/completion/${encodeURIComponent(userId)}`, {
          headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
        });
        if (cRes.ok) {
          const cData = await cRes.json().catch(() => ({}));
          setCourseCompletions(cData.courses || []);
        }
      } catch { /* ignore — may not be configured yet */ } finally {
        setCourseLoading(false);
      }
    })();
  }, [userId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading…</div>;
  if (!member) return <div className="page-content"><div className="alert alert-error">Member not found.</div></div>;

  // ── Derived data ──────────────────────────────────────────────────────────
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

  return (
    <div>
      <Link to="/team" className="back-link">← Back to team</Link>

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
        <Avatar name={member.full_name || member.email} />
        <div>
          <h1 className="page-title" style={{ marginBottom: '2px' }}>{member.full_name || member.email}</h1>
          <p className="page-subtitle">{member.email}</p>
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

      {/* Skills overview + Coaching sessions */}
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
                <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>Assessments appear once this rep is evaluated.</div>
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
                    <Link to={`/team/${userId}/session/${s.id}`} className="text-link" style={{ fontSize: '0.875rem', display: 'block', marginBottom: '2px' }}>
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
                  <Link to={`/team/${userId}/assessment/${a.id}`} className="text-link" style={{ fontSize: '0.875rem' }}>
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

      {/* PDP Chat Panel — owns the full plan view, edit, AI chat, mark complete, and past plans */}
      <div className="section">
        <PdpChatPanel
          userId={userId}
          memberName={member.full_name || member.email}
          pdp={pdp}
          onPlanSaved={async () => {
            const { data } = await supabase.from('development_plans').select('*').eq('user_id', userId).eq('status', 'active').limit(1);
            setPdp(data?.[0] || null);
          }}
        />

        {/* Core Curriculum / Course Completion */}
        <CourseCompletionPanel
          completions={courseCompletions}
          loading={courseLoading}
          error={null}
        />
      </div>
    </div>
  );
}
