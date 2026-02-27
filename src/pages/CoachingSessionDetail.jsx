import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

// ── Insight metadata ──────────────────────────────────────────────────────────
const INSIGHT_META = {
  action:          { emoji: '🎯', label: 'Action step',      bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  insight:         { emoji: '💡', label: 'Insight',          bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
  challenge:       { emoji: '❓', label: 'Reflect',          bg: '#fdf4ff', border: '#d8b4fe', text: '#6b21a8' },
  growth:          { emoji: '📈', label: 'Growth',           bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  takeaway:        { emoji: '✅', label: 'Takeaway',         bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  strength:        { emoji: '💪', label: 'Strength',         bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  breakthrough:    { emoji: '⚡', label: 'Breakthrough',     bg: '#fefce8', border: '#fde047', text: '#854d0e' },
  coaching_moment: { emoji: '🔍', label: 'Coaching moment',  bg: '#faf5ff', border: '#c4b5fd', text: '#5b21b6' },
};

// ── Bubble component (iMessage style) ────────────────────────────────────────
function Bubble({ role, text, timestamp }) {
  const isCoach = role === 'coach';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isCoach ? 'flex-start' : 'flex-end',
      marginBottom: '4px',
    }}>
      <div style={{
        maxWidth: '72%',
        padding: '10px 14px',
        borderRadius: isCoach ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
        background: isCoach ? '#f1f5f9' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
        color: isCoach ? '#1e293b' : 'white',
        fontSize: '0.9rem',
        lineHeight: '1.55',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }}>
        {text}
      </div>
      {timestamp && (
        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '3px', paddingLeft: isCoach ? '4px' : 0, paddingRight: isCoach ? 0 : '4px' }}>
          {(() => { try { return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })()}
        </div>
      )}
    </div>
  );
}

// ── Role separator label ──────────────────────────────────────────────────────
function RoleLabel({ role }) {
  const isCoach = role === 'coach';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isCoach ? 'flex-start' : 'flex-end',
      marginBottom: '6px',
      marginTop: '14px',
    }}>
      <span style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: '#94a3b8',
        padding: '2px 8px',
        background: '#f1f5f9',
        borderRadius: '99px',
      }}>
        {isCoach ? '🤖 Coach' : '🧑 Seller'}
      </span>
    </div>
  );
}

// ── Inline insight card ───────────────────────────────────────────────────────
function InsightCard({ item, index }) {
  if (!item?.type) return null;
  const meta = INSIGHT_META[item.type] || INSIGHT_META.insight;

  return (
    <div style={{
      margin: '12px auto',
      maxWidth: '85%',
      padding: '12px 14px',
      background: meta.bg,
      border: `1px solid ${meta.border}`,
      borderRadius: '10px',
      position: 'relative',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: meta.text, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {meta.emoji} {meta.label}
      </div>
      {item.type === 'coaching_moment' ? (
        <>
          <p style={{ margin: '0 0 6px', fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5 }}>{item.gap}</p>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: meta.text, marginBottom: '4px' }}>→ Try this</div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5 }}>{item.fix}</p>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.text}</p>
      )}
    </div>
  );
}

// ── Date/time separator ───────────────────────────────────────────────────────
function TimeSeparator({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0 10px' }}>
      <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
    </div>
  );
}

// ── Build merged timeline ─────────────────────────────────────────────────────
// Strategy:
//  - Each transcript turn becomes a { kind:'turn', ... } item
//  - Insights are distributed evenly across the transcript at natural break points
//    (after every ~3 turns), since the DB doesn't store turnIndex on insights.
//  - If transcript is empty, insights are shown as a standalone list.
function buildTimeline(transcriptTurns, insights) {
  if (transcriptTurns.length === 0) {
    return insights.map((ins, i) => ({ kind: 'insight', item: ins, key: `ins-${i}` }));
  }

  const items = [];
  // Spread N insights across T turns — place one insight roughly every (T/N) turns
  const insightCount = insights.length;
  const turnCount = transcriptTurns.length;
  // Build a map: after which turn index should we inject an insight?
  const injectionPoints = new Set();
  if (insightCount > 0) {
    for (let i = 0; i < insightCount; i++) {
      // Space them out: after turn at position Math.floor((i + 1) * turnCount / (insightCount + 1))
      // Clamp so last insight appears after second-to-last turn at minimum
      const pos = Math.min(
        Math.floor(((i + 1) * turnCount) / (insightCount + 1)),
        turnCount - 1
      );
      injectionPoints.set(pos, (injectionPoints.get(pos) || []).concat(i));
    }
  }

  let prevRole = null;
  transcriptTurns.forEach((turn, idx) => {
    // Role label — only when role changes
    if (turn.role !== prevRole) {
      items.push({ kind: 'role-label', role: turn.role, key: `rl-${idx}` });
      prevRole = turn.role;
    }
    items.push({ kind: 'turn', turn, key: `turn-${idx}` });
    // Inject insights after this turn
    const insightIdxs = injectionPoints.get(idx);
    if (insightIdxs) {
      insightIdxs.forEach((ii) => {
        items.push({ kind: 'insight', item: insights[ii], key: `ins-${ii}` });
      });
    }
  });

  return items;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CoachingSessionDetail() {
  const { id, userId: memberUserId } = useParams();
  const { dataUserId } = useImpersonation();
  const targetUserId = memberUserId || dataUserId;
  const backLink = memberUserId ? `/team/${memberUserId}` : '/my';
  const backLabel = memberUserId ? '← Back to team member' : '← Back to My Dashboard';
  const [session, setSession] = useState(null);
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !targetUserId || !supabase) { setLoading(false); return; }
    Promise.all([
      supabase.from('coaching_sessions').select('*').eq('id', id).eq('user_id', targetUserId).single(),
      supabase.from('action_items').select('*').eq('session_id', id).order('created_at', { ascending: true })
    ]).then(([sRes, aRes]) => {
      if (sRes.error) setError(sRes.error.message);
      else setSession(sRes.data);
      setActionItems(aRes?.data ?? []);
    }).finally(() => setLoading(false));
  }, [id, targetUserId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading session…</div>;

  if (error || !session) {
    return (
      <div>
        <Link to={backLink} className="back-link">{backLabel}</Link>
        <div className="alert alert-error">{error || 'Session not found.'}</div>
      </div>
    );
  }

  const notes = session.coaching_notes && typeof session.coaching_notes === 'object' ? session.coaching_notes : {};
  const agreedSteps = Array.isArray(notes.agreedSteps) ? notes.agreedSteps : [];
  const insights = Array.isArray(notes.insights) ? notes.insights : [];
  const coachSummary = notes.coachSummary ?? session.session_summary ?? '';

  const rawTranscript = Array.isArray(session.session_transcript) ? session.session_transcript : [];
  const hasRoles = rawTranscript.some((m) => m?.role != null);
  // Full transcript with roles (preferred) or seller-only fallback
  const transcriptTurns = hasRoles
    ? rawTranscript.filter((m) => m?.text || m?.message).map((m) => ({ role: m.role, text: m.text ?? m.message, timestamp: m.timestamp }))
    : (Array.isArray(notes.userMessages) ? notes.userMessages : [])
        .filter((m) => m?.text)
        .map((m) => ({ role: 'user', text: m.text, timestamp: m.timestamp }));

  const timeline = buildTimeline(transcriptTurns, insights);
  const hasContent = timeline.length > 0;

  const sessionDateStr = session.session_date
    ? new Date(session.session_date).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{ maxWidth: '760px' }}>
      <Link to={backLink} className="back-link">{backLabel}</Link>

      {/* Session header card */}
      <div className="card section">
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Coaching session</h1>
              {sessionDateStr && <div style={{ fontSize: '0.875rem', color: '#64748b' }}>{sessionDateStr}</div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {insights.length > 0 && <span className="badge badge-purple">{insights.length} insights</span>}
              {actionItems.length > 0 && <span className="badge badge-green">{actionItems.length} actions</span>}
              {transcriptTurns.length > 0 && <span className="badge badge-slate">{transcriptTurns.length} turns</span>}
            </div>
          </div>
          {coachSummary && (
            <div style={{ marginTop: '14px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #7c3aed', fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7c3aed', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Session summary</div>
              {coachSummary}
            </div>
          )}
        </div>
      </div>

      {/* Audio */}
      {session.audio_url && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">🎧 Session recording</h2>
          </div>
          <div className="card-body">
            <audio controls src={session.audio_url} style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Action items */}
      {(actionItems.length > 0 || agreedSteps.length > 0) && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">✅ Agreed action items</h2>
            {actionItems.length > 0 && <span className="badge badge-green">{actionItems.length}</span>}
          </div>
          <div className="card-body-tight">
            {actionItems.length > 0
              ? actionItems.map((item) => (
                  <div key={item.id} className="list-item">
                    <span style={{ flex: 1, fontSize: '0.9rem' }}>{item.description}</span>
                    <span className={`badge ${item.status === 'exhibited' ? 'badge-green' : item.status === 'completed' ? 'badge-slate' : 'badge-amber'}`}>
                      {item.status}
                    </span>
                  </div>
                ))
              : agreedSteps.map((step, i) => (
                  <div key={i} className="list-item">
                    <span style={{ fontSize: '0.9rem' }}>{typeof step === 'string' ? step : step.description || step.text || JSON.stringify(step)}</span>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* Merged timeline */}
      <div className="card section">
        <div className="card-header">
          <h2 className="card-title">💬 Session timeline</h2>
          {!hasRoles && transcriptTurns.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Seller messages only</span>
          )}
        </div>

        {hasContent ? (
          <div style={{ padding: '16px 20px' }}>
            {sessionDateStr && <TimeSeparator label={sessionDateStr} />}

            {timeline.map((item) => {
              if (item.kind === 'role-label') {
                return <RoleLabel key={item.key} role={item.role} />;
              }
              if (item.kind === 'turn') {
                return <Bubble key={item.key} role={item.turn.role} text={item.turn.text} timestamp={item.turn.timestamp} />;
              }
              if (item.kind === 'insight') {
                return <InsightCard key={item.key} item={item.item} />;
              }
              return null;
            })}

            {/* If transcript was empty but insights exist, show a note */}
            {transcriptTurns.length === 0 && insights.length > 0 && (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', marginBottom: '16px' }}>
                No transcript captured — showing coaching notes only.
              </p>
            )}
          </div>
        ) : (
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <div>No transcript or coaching notes captured for this session.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
