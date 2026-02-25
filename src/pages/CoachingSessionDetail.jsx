import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const cardStyle = { padding: '20px', background: 'white', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const sectionHeading = { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' };

export default function CoachingSessionDetail() {
  const { id } = useParams();
  const { dataUserId } = useImpersonation();
  const [session, setSession] = useState(null);
  const [actionItems, setActionItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !dataUserId || !supabase) {
      setLoading(false);
      return;
    }
    Promise.all([
      supabase.from('coaching_sessions').select('*').eq('id', id).eq('user_id', dataUserId).single(),
      supabase.from('action_items').select('*').eq('session_id', id).order('created_at', { ascending: true })
    ]).then(([sRes, aRes]) => {
      if (sRes.error) setError(sRes.error.message);
      else setSession(sRes.data);
      setActionItems(aRes?.data ?? []);
    }).finally(() => setLoading(false));
  }, [id, dataUserId]);

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading session…</div>;
  if (error || !session) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <Link to="/my" style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>← Back to My Dashboard</Link>
        <p style={{ color: '#991b1b' }}>{error || 'Session not found.'}</p>
      </div>
    );
  }

  const notes = session.coaching_notes && typeof session.coaching_notes === 'object' ? session.coaching_notes : {};
  const agreedSteps = Array.isArray(notes.agreedSteps) ? notes.agreedSteps : [];
  const userMessages = Array.isArray(notes.userMessages) ? notes.userMessages : [];
  const coachSummary = notes.coachSummary || session.session_summary || '';

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Link to="/my" style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>← Back to My Dashboard</Link>

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

      <div style={cardStyle}>
        <div style={{ ...sectionHeading, color: '#4f46e5' }}>Session log (seller messages)</div>
        {userMessages.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {userMessages.map((msg, i) => (
              <div key={i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', borderLeft: '4px solid #4f46e5' }}>
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
          <p style={{ color: '#64748b', margin: 0 }}>No message log captured for this session.</p>
        )}
      </div>

      {Object.keys(notes).length > 0 && (
        <div style={cardStyle}>
          <div style={{ ...sectionHeading, color: '#64748b' }}>Full coaching notes (raw)</div>
          <pre style={{ margin: 0, fontSize: '0.8125rem', overflow: 'auto', maxHeight: '400px', padding: '12px', background: '#f1f5f9', borderRadius: '6px' }}>
            {JSON.stringify(notes, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
