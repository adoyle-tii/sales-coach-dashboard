import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PdpChatPanel from '../components/PdpChatPanel';

function Avatar({ name, size = '' }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className={`avatar ${size}`}>{initials}</div>;
}

function StatusBadge({ status }) {
  const map = {
    open: 'badge-amber',
    exhibited: 'badge-green',
    completed: 'badge-slate',
  };
  return <span className={`badge ${map[status] || 'badge-slate'}`}>{status}</span>;
}

export default function TeamMember() {
  const { userId } = useParams();
  const [member, setMember] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [pdp, setPdp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !supabase) { setLoading(false); return; }
    (async () => {
      const [uRes, aRes, sRes, aiRes, pRes] = await Promise.all([
        supabase.from('users').select('id, full_name, email').eq('id', userId).single(),
        supabase.from('skill_assessments').select('id, meeting_title, created_at, overall_score, skill_scores').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.from('coaching_sessions').select('id, session_date, session_summary').eq('user_id', userId).order('session_date', { ascending: false }).limit(20),
        supabase.from('action_items').select('id, description, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('development_plans').select('*').eq('user_id', userId).eq('status', 'active').limit(1)
      ]);
      setMember(uRes?.data || null);
      setAssessments(aRes?.data || []);
      setSessions(sRes?.data || []);
      setActionItems(aiRes?.data || []);
      setPdp(pRes?.data?.[0] || null);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading…</div>;
  if (!member) return <div className="page-content"><div className="alert alert-error">Member not found.</div></div>;

  const open = actionItems.filter((a) => a.status === 'open');
  const exhibited = actionItems.filter((a) => a.status === 'exhibited');

  const pdpProgress = (() => {
    if (!pdp?.focus_areas?.length) return null;
    let total = 0, completedM = 0, sectionsComplete = 0;
    pdp.focus_areas.forEach((area) => {
      const ms = (area && area.milestones) || [];
      total += ms.length;
      const c = ms.filter((m) => m.status === 'completed').length;
      completedM += c;
      if (ms.length > 0 && c === ms.length) sectionsComplete += 1;
    });
    return { total, completed: completedM, sectionsTotal: pdp.focus_areas.length, sectionsComplete };
  })();

  const pdpPct = pdpProgress?.total > 0 ? Math.round((pdpProgress.completed / pdpProgress.total) * 100) : 0;

  return (
    <div>
      <Link to="/team" className="back-link">← Back to team</Link>

      {/* Member header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <Avatar name={member.full_name || member.email} size="avatar-lg" />
        <div>
          <h1 className="page-title" style={{ marginBottom: '2px' }}>{member.full_name || member.email}</h1>
          <p className="page-subtitle">{member.email}</p>
        </div>
      </div>

      {/* Stats */}
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
          <div className="stat-value" style={{ color: '#d97706' }}>{open.length}</div>
          <div className="stat-label">Open actions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{exhibited.length}</div>
          <div className="stat-label">Exhibited</div>
        </div>
      </div>

      {/* PDP progress banner */}
      {pdpProgress && pdpProgress.total > 0 && (
        <div className="card section" style={{ borderLeft: '4px solid #7c3aed' }}>
          <div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>Development plan progress</span>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.8125rem', color: '#64748b' }}>
                <span>{pdpProgress.completed}/{pdpProgress.total} milestones</span>
                <span>{pdpProgress.sectionsComplete}/{pdpProgress.sectionsTotal} sections</span>
                {pdpProgress.completed === pdpProgress.total && pdpProgress.total > 0 && (
                  <span className="badge badge-green">All complete ✓</span>
                )}
              </div>
            </div>
            <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pdpPct}%`, background: pdpPct === 100 ? '#16a34a' : 'linear-gradient(90deg, #7c3aed, #a855f7)', borderRadius: '99px', transition: 'width 0.4s' }} />
            </div>
          </div>
        </div>
      )}

      <div className="two-col">
        {/* Assessments */}
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">Assessments</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{assessments.length}</span>
          </div>
          {assessments.length > 0 ? (
            <div className="card-body-tight">
              {assessments.map((a) => (
                <div key={a.id} className="list-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/team/${userId}/assessment/${a.id}`} className="text-link" style={{ fontSize: '0.875rem' }}>
                      {a.meeting_title || 'Untitled'}
                    </Link>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1px' }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569', flexShrink: 0 }}>
                    {a.overall_score != null ? `${Number(a.overall_score).toFixed(1)}/5` : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-body"><div className="empty-state" style={{ padding: '20px 0' }}><div className="empty-icon">🎯</div><div>No assessments yet.</div></div></div>
          )}
        </div>

        {/* Coaching sessions */}
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">Coaching sessions</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{sessions.length}</span>
          </div>
          {sessions.length > 0 ? (
            <div className="card-body-tight">
              {sessions.map((s) => (
                <div key={s.id} className="list-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link to={`/team/${userId}/session/${s.id}`} className="text-link" style={{ fontSize: '0.875rem' }}>
                      {new Date(s.session_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Link>
                    {s.session_summary && (
                      <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.session_summary}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-body"><div className="empty-state" style={{ padding: '20px 0' }}><div className="empty-icon">💬</div><div>No sessions yet.</div></div></div>
          )}
        </div>
      </div>

      {/* Action items */}
      {actionItems.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">Action items</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge badge-amber">{open.length} open</span>
              <span className="badge badge-green">{exhibited.length} exhibited</span>
            </div>
          </div>
          <div className="card-body-tight">
            {actionItems.slice(0, 15).map((a) => (
              <div key={a.id} className="list-item">
                <div style={{ flex: 1, fontSize: '0.875rem', color: '#334155' }}>{a.description}</div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDP Chat Panel */}
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
      </div>
    </div>
  );
}
