import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const cardStyle = { padding: '20px', background: 'white', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const sectionHeading = { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' };

export default function CoachingSessionDetail() {
  const { id, userId: memberUserId } = useParams();
  const { dataUserId } = useImpersonation();
  // When navigated from a team member page (/team/:userId/session/:id), use the member's
  // userId directly; otherwise fall back to the impersonation-aware dataUserId.
  const targetUserId = memberUserId || dataUserId;
  const backLink = memberUserId ? `/team/${memberUserId}` : '/my';
  const backLabel = memberUserId ? '← Back to team member' : '← Back to My Dashboard';
  const [session, setSession] = useState(null);
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !targetUserId || !supabase) {
      setLoading(false);
      return;
    }
    Promise.all([
      supabase.from('coaching_sessions').select('*').eq('id', id).eq('user_id', targetUserId).single(),
      supabase.from('action_items').select('*').eq('session_id', id).order('created_at', { ascending: true })
    ]).then(([sRes, aRes]) => {
      if (sRes.error) setError(sRes.error.message);
      else setSession(sRes.data);
      setActionItems(aRes?.data ?? []);
    }).finally(() => setLoading(false));
  }, [id, targetUserId]);

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading session…</div>;
  if (error || !session) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <Link to={backLink} style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>{backLabel}</Link>
        <p style={{ color: '#991b1b' }}>{error || 'Session not found.'}</p>
      </div>
    );
  }

  const notes = session.coaching_notes && typeof session.coaching_notes === 'object' ? session.coaching_notes : {};
  const agreedSteps = Array.isArray(notes.agreedSteps) ? notes.agreedSteps : [];
  const insights = Array.isArray(notes.insights) ? notes.insights : [];
  const coachSummary = notes.coachSummary ?? session.session_summary ?? '';

  const rawTranscript = Array.isArray(session.session_transcript) ? session.session_transcript : [];
  const hasRoleInTranscript = rawTranscript.length > 0 && rawTranscript.some((m) => m && m.role != null);
  const sessionTranscript = hasRoleInTranscript
    ? rawTranscript
    : [];
  const rawUserMessages = Array.isArray(notes.userMessages) ? notes.userMessages : [];
  const sellerOnlyLog = rawUserMessages.length > 0
    ? rawUserMessages
    : rawTranscript.filter((m) => m && (m.text != null || m.message != null)).map((m) => ({ text: m.text ?? m.message, timestamp: m.timestamp }));

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Link to={backLink} style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>{backLabel}</Link>

      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h2 style={{ marginTop: 0, marginBottom: '8px' }}>Coaching session</h2>
        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
          {session.session_date && new Date(session.session_date).toLocaleString()}
        </div>
        {coachSummary && (
          <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '0.95rem' }}>{coachSummary}</p>
        )}
      </div>

      {session.audio_url && (
        <div style={cardStyle}>
          <div style={{ ...sectionHeading, color: '#0d9488' }}>Session audio</div>
          <audio controls src={session.audio_url} style={{ width: '100%', marginTop: '8px' }} />
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '8px', marginBottom: 0 }}>
            Future: playback with transcript sync and ElevenLabs call replay (by call ID) can be added here.
          </p>
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ ...sectionHeading, color: '#059669' }}>Agreed action items</div>
        {actionItems.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {actionItems.map((item) => (
              <li key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span>{item.description}</span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: item.status === 'completed' ? '#dcfce7' : item.status === 'exhibited' ? '#fef9c3' : '#fef3c7',
                  color: item.status === 'completed' ? '#166534' : item.status === 'exhibited' ? '#854d0e' : '#92400e'
                }}>
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        ) : agreedSteps.length > 0 ? (
          <ul style={{ listStyle: 'disc', paddingLeft: '20px', margin: 0 }}>
            {agreedSteps.map((step, i) => (
              <li key={i} style={{ marginBottom: '6px' }}>{typeof step === 'string' ? step : step.description || step.text || JSON.stringify(step)}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b', margin: 0 }}>No action items recorded for this session.</p>
        )}
      </div>

      {insights.length > 0 && (
        <div style={cardStyle}>
          <div style={{ ...sectionHeading, color: '#7c3aed' }}>Coaching notes</div>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '16px', marginTop: 0 }}>
            Same format as the live session: moments captured by the coach (LLM) during the session.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {insights.map((item, i) => {
              if (!item || !item.type) return null;
              // Match extension renderNoteCard meta exactly (emoji + label)
              const insightMeta = {
                action: { emoji: '🎯', label: 'Action' },
                insight: { emoji: '💡', label: 'Insight' },
                challenge: { emoji: '❓', label: 'Reflect' },
                growth: { emoji: '📈', label: 'Growth' },
                takeaway: { emoji: '✅', label: 'Takeaway' },
                strength: { emoji: '💪', label: 'Strength' },
                breakthrough: { emoji: '⚡', label: 'Breakthrough' },
                coaching_moment: { emoji: '🔍', label: 'Coaching Moment' },
              };
              const meta = insightMeta[item.type] || insightMeta.insight;

              if (item.type === 'coaching_moment' && (item.gap || item.fix)) {
                return (
                  <div key={i} style={{ padding: '14px', background: '#faf5ff', borderRadius: '8px', borderLeft: '4px solid #7c3aed' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6d28d9', marginBottom: '8px' }}>{meta.emoji} {meta.label}</div>
                    <p style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>{item.gap}</p>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7c3aed', marginBottom: '6px' }}>→ Try this</div>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>{item.fix}</p>
                  </div>
                );
              }
              return (
                <div key={i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', borderLeft: '4px solid #64748b' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>{meta.emoji} {meta.label}</div>
                  <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{item.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ ...sectionHeading, color: '#4f46e5' }}>Session transcript</div>
        {sessionTranscript.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sessionTranscript.map((turn, i) => (
              <div
                key={i}
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  borderLeft: '4px solid',
                  background: turn.role === 'coach' ? '#eff6ff' : '#f8fafc',
                  borderLeftColor: turn.role === 'coach' ? '#3b82f6' : '#4f46e5'
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  {turn.role === 'coach' ? 'Coach' : 'Seller'}
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{turn.text}</p>
                {turn.timestamp && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                    {new Date(turn.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : sellerOnlyLog.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '8px', marginTop: 0 }}>
              Seller messages only (full coach + seller transcript not yet captured for this session).
            </p>
            {sellerOnlyLog.map((msg, i) => (
              <div key={i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', borderLeft: '4px solid #4f46e5' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>Seller</div>
                <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                {msg.timestamp && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', margin: 0 }}>No transcript captured for this session.</p>
        )}
      </div>
    </div>
  );
}
