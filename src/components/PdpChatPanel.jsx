import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

const cardStyle = { padding: '16px', background: 'white', borderRadius: '8px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const sectionHeading = { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' };

export default function PdpChatPanel({ userId, memberName, pdp, onPlanSaved }) {
  const [state, setState] = useState('idle'); // idle | chatting
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedPlan, setSuggestedPlan] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    return headers;
  };

  const sendMessage = async () => {
    const text = (input || '').trim();
    if (!text || loading || !userId) return;
    const userMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${WORKER_URL}/pdp/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerId: userId,
          messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${data.error || data.message || res.status}` }]);
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message || '' }]);
      if (data.suggestedPlan && data.suggestedPlan.focus_areas) {
        setSuggestedPlan(data.suggestedPlan);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const savePlan = async () => {
    if (!suggestedPlan || !userId || saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${WORKER_URL}/pdp/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sellerId: userId,
          focusAreas: suggestedPlan.focus_areas || [],
          managerNotes: suggestedPlan.manager_notes ?? null
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveStatus('error');
        return;
      }
      setSaveStatus('saved');
      setSuggestedPlan(null);
      setState('idle');
      if (onPlanSaved) onPlanSaved(data);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const startChat = () => {
    setState('chatting');
    setMessages([]);
    setSuggestedPlan(null);
    setSaveStatus(null);
  };

  const closeChat = () => {
    setState('idle');
    setMessages([]);
    setSuggestedPlan(null);
  };

  if (state === 'idle') {
    return (
      <div style={cardStyle}>
        <div style={sectionHeading}>Development plan</div>
        {pdp && (pdp.focus_areas?.length > 0 || pdp.manager_notes) ? (
          <>
            {pdp.manager_notes && <p style={{ margin: '0 0 12px', fontSize: '0.9rem' }}><strong>Manager notes:</strong> {pdp.manager_notes}</p>}
            {pdp.focus_areas && pdp.focus_areas.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {pdp.focus_areas.map((f, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>
                    {typeof f === 'string' ? f : (f.skill || f.goal || f.name || JSON.stringify(f))}
                    {typeof f === 'object' && f.milestones?.length > 0 && (
                      <ul style={{ marginTop: '4px', paddingLeft: '16px', fontSize: '0.875rem', color: '#64748b' }}>
                        {f.milestones.map((m, j) => (
                          <li key={j}>{m.text} {m.due_date ? `(by ${m.due_date})` : ''}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {pdp.last_updated && <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px', marginBottom: 0 }}>Last updated {new Date(pdp.last_updated).toLocaleString()}</p>}
          </>
        ) : (
          <p style={{ color: '#64748b', margin: 0 }}>No development plan yet.</p>
        )}
        <button
          type="button"
          onClick={startChat}
          style={{ marginTop: '16px', padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
        >
          {pdp && (pdp.focus_areas?.length > 0 || pdp.manager_notes) ? 'Update plan' : 'Generate plan'}
        </button>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={sectionHeading}>Development plan — chat with AI</div>
        <button type="button" onClick={closeChat} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>Close</button>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '16px' }}>Building a plan for {memberName || 'this seller'}. The AI has access to their assessments, coaching sessions, and open action items.</p>
      <div style={{ display: 'grid', gridTemplateColumns: suggestedPlan?.focus_areas?.length ? '1fr 320px' : '1fr', gap: '24px' }}>
        <div>
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', marginBottom: '12px', background: '#f8fafc' }}>
            {messages.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Send a message to start (e.g. &quot;Let&apos;s build a development plan for this quarter&quot;).</p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: m.role === 'user' ? '#eef2ff' : '#fff',
                  borderLeft: m.role === 'user' ? '4px solid #4f46e5' : '4px solid #94a3b8',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.9rem'
                }}
              >
                <strong style={{ fontSize: '0.7rem', color: '#64748b' }}>{m.role === 'user' ? 'You' : 'AI'}</strong>
                <div style={{ marginTop: '4px' }}>{m.content}</div>
              </div>
            ))}
            {loading && <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Thinking…</div>}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message…"
              style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}
              disabled={loading}
            />
            <button type="button" onClick={sendMessage} disabled={loading} style={{ padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>Send</button>
          </div>
        </div>
        {suggestedPlan?.focus_areas?.length > 0 && (
          <div>
            <div style={{ ...sectionHeading, marginBottom: '8px' }}>Proposed plan</div>
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {suggestedPlan.focus_areas.map((area, i) => (
                <div key={area.id || i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{area.skill || `Focus ${i + 1}`}</div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '6px' }}>{area.goal}</div>
                  {area.why && <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>{area.why}</div>}
                  {area.milestones?.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem' }}>
                      {area.milestones.map((milestone, j) => (
                        <li key={milestone.id || j}>{milestone.text} {milestone.due_date ? `(by ${milestone.due_date})` : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={savePlan}
              disabled={saveStatus === 'saving'}
              style={{ marginTop: '12px', width: '100%', padding: '10px', background: saveStatus === 'saved' ? '#16a34a' : '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer' }}
            >
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save plan'}
            </button>
            {saveStatus === 'error' && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '8px', marginBottom: 0 }}>Failed to save. Try again.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
