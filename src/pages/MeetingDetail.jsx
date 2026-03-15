import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

// Parse transcript lines in "Speaker: text" format; return [{ speaker, text }]
function parseTranscriptLines(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      result.push({ speaker: line.slice(0, colonIdx).trim(), text: line.slice(colonIdx + 1).trim() });
    } else if (line) {
      result.push({ speaker: '', text: line });
    }
  }
  return result;
}

// Chat-style bubble for transcript (internal vs external)
function TranscriptBubble({ speaker, text, isInternal }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isInternal ? 'flex-start' : 'flex-end',
      marginBottom: '8px',
    }}>
      {speaker && (
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--slate-500)',
          marginBottom: '2px',
          paddingLeft: isInternal ? '4px' : 0,
          paddingRight: isInternal ? 0 : '4px',
        }}>
          {speaker} {isInternal ? '(internal)' : '(external)'}
        </span>
      )}
      <div style={{
        maxWidth: '78%',
        padding: '10px 14px',
        borderRadius: isInternal ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
        background: isInternal ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : '#f1f5f9',
        color: isInternal ? 'white' : '#1e293b',
        fontSize: '0.9rem',
        lineHeight: '1.55',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }}>
        {text}
      </div>
    </div>
  );
}

export default function MeetingDetail() {
  const { meetingId, userId: memberUserId } = useParams();
  const { dataUserId } = useImpersonation();
  const targetUserId = memberUserId || dataUserId;
  const backLink = memberUserId ? `/team/${memberUserId}` : '/my';
  const backLabel = memberUserId ? '← Back to team member' : '← Back to My Dashboard';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    if (!meetingId || !targetUserId || !supabase) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
        const res = await fetch(
          `${WORKER_URL}/hs/meeting-intelligence/meeting/${encodeURIComponent(meetingId)}?userId=${encodeURIComponent(targetUserId)}`,
          { headers }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Request failed: ${res.status}`);
        }
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [meetingId, targetUserId]);

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading meeting…</div>;

  if (error || !data) {
    return (
      <div>
        <Link to={backLink} className="back-link">{backLabel}</Link>
        <div className="alert alert-error">{error || 'Meeting not found.'}</div>
      </div>
    );
  }

  const { meeting, attendees, my_attendee, my_talk_ratio } = data;
  const talkRatios = Array.isArray(meeting.talk_ratios) ? meeting.talk_ratios : [];
  const topics = Array.isArray(meeting.topics) ? meeting.topics : [];
  const deliveryInsights = Array.isArray(my_attendee?.delivery_insights) ? my_attendee.delivery_insights : [];
  const transcript = meeting.transcript && String(meeting.transcript).trim();

  // Only show attendees who attended (attended !== false; legacy rows may have null)
  const attendedOnly = (attendees || []).filter((a) => a.attended !== false);

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const date = new Date(d);
      return isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      <Link to={backLink} className="back-link">{backLabel}</Link>

      {/* Header */}
      <div className="card section">
        <div className="card-body">
          <h1 style={{ margin: '0 0 8px', fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
            {meeting.meeting_name || `Meeting ${meeting.hs_meeting_id}`}
          </h1>
          <div style={{ fontSize: '0.875rem', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            {meeting.account_name && <span>{meeting.account_name}</span>}
            {meeting.meeting_date && <span>{formatDate(meeting.meeting_date)}</span>}
            {meeting.scraped_host_name && (
              <span className="badge badge-slate">Host: {meeting.scraped_host_name}</span>
            )}
          </div>
        </div>
      </div>

      {/* Attendees (only those who attended) */}
      <div className="card section">
        <div className="card-header">
          <h2 className="card-title">Attendees</h2>
        </div>
        <div className="card-body-tight">
          {attendedOnly.length === 0 ? (
            <div className="empty-state" style={{ padding: '16px 0' }}>No attendees recorded.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--slate-200)', background: 'var(--slate-50)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Badges</th>
                </tr>
              </thead>
              <tbody>
                {attendedOnly.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--slate-200)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{a.display_name || a.email || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--slate-600)' }}>{a.email || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {a.is_conference_call_host && (
                          <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: '#dbeafe', color: '#1d4ed8', fontWeight: 500 }}>Host</span>
                        )}
                        {a.attended !== false && (
                          <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '4px', background: '#dcfce7', color: '#16a34a', fontWeight: 500 }}>Attended</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">Topics</h2>
          </div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {topics.map((t, i) => (
                <li key={i} style={{ fontSize: '0.875rem', color: 'var(--slate-700)' }}>
                  {typeof t === 'string' ? t : (t?.name || t?.topic || JSON.stringify(t))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Speaking time breakdown */}
      {talkRatios.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">Speaking time</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {talkRatios.map((r, i) => {
                const pct = typeof r.percentage === 'number' ? r.percentage : 0;
                const isRep = my_talk_ratio && r.name === my_talk_ratio.name;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.875rem' }}>
                      <span style={{ fontWeight: 500, color: 'var(--slate-700)' }}>
                        {r.name || 'Unknown'}
                        {r.isInternal && <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: 'var(--slate-500)' }}>(internal)</span>}
                        {isRep && <span style={{ marginLeft: '6px', fontSize: '0.72rem', padding: '1px 4px', borderRadius: '4px', background: 'var(--brand-light)', color: 'var(--brand)' }}>You</span>}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--slate-600)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--slate-200)', borderRadius: '99px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, pct)}%`,
                          background: isRep ? 'linear-gradient(90deg, var(--brand), #a855f7)' : 'var(--slate-400)',
                          borderRadius: '99px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delivery insights (for the rep) */}
      {deliveryInsights.length > 0 && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">Your delivery insights</h2>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
              {deliveryInsights.map((insight, i) => (
                <div
                  key={i}
                  style={{
                    padding: '14px',
                    background: 'var(--slate-50)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--slate-200)',
                  }}
                >
                  {insight.metric && (
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                      {insight.metric}
                    </div>
                  )}
                  {insight.value != null && (
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--slate-800)', marginBottom: '4px' }}>
                      {insight.value}
                    </div>
                  )}
                  {insight.insight_text && (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--slate-600)', lineHeight: 1.4 }}>
                      {insight.insight_text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transcript (chat format: internal vs external) */}
      {transcript && (
        <div className="card section">
          <button
            type="button"
            onClick={() => setTranscriptOpen((o) => !o)}
            className="card-header"
            style={{ width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
          >
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{transcriptOpen ? '▾' : '▸'}</span>
              Transcript
            </h2>
          </button>
          {transcriptOpen && (
            <div className="card-body" style={{ maxHeight: '500px', overflowY: 'auto', padding: '16px 20px' }}>
              {(() => {
                const turns = parseTranscriptLines(transcript);
                const speakerToInternal = new Map();
                for (const r of talkRatios) {
                  const key = (r.name || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
                  if (key) speakerToInternal.set(key, !!r.isInternal);
                }
                const isInternalSpeaker = (name) => {
                  const key = (name || '').replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
                  if (speakerToInternal.has(key)) return speakerToInternal.get(key);
                  if (key) {
                    for (const [k, v] of speakerToInternal) {
                      if (k.includes(key) || key.includes(k)) return v;
                    }
                  }
                  return false;
                };
                return turns.length > 0 ? (
                  turns.map((t, i) => (
                    <TranscriptBubble
                      key={i}
                      speaker={t.speaker}
                      text={t.text}
                      isInternal={isInternalSpeaker(t.speaker)}
                    />
                  ))
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8125rem', color: 'var(--slate-700)', lineHeight: 1.6, fontFamily: 'inherit' }}>
                    {transcript}
                  </pre>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
