import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

const cardStyle = { padding: '16px', background: 'white', borderRadius: '8px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
const sectionHeading = { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' };

const priorityBg = (p) => p === 'high' ? '#fef2f2' : p === 'medium' ? '#fefce8' : '#f1f5f9';
const priorityColor = (p) => p === 'high' ? '#991b1b' : p === 'medium' ? '#854d0e' : '#475569';
const priorityBorder = (p) => p === 'high' ? '#dc2626' : p === 'medium' ? '#ca8a04' : '#64748b';

function formatDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return null; }
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Read-only view of a single focus area (used in idle + past plans)
function FocusAreaCard({ area, readonly = false }) {
  const milestones = area.milestones || [];
  const allComplete = milestones.length > 0 && milestones.every((m) => m.status === 'completed');
  return (
    <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', borderLeftWidth: '4px', borderLeftColor: priorityBorder(area.priority) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: priorityBg(area.priority), color: priorityColor(area.priority) }}>
          {area.priority || 'focus'}
        </span>
        <strong style={{ fontSize: '1rem' }}>{area.skill || area.name || 'Focus area'}</strong>
        {allComplete && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px' }}>Section complete</span>}
      </div>
      {area.goal && <p style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>{area.goal}</p>}
      {area.why && <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>{area.why}</p>}
      {milestones.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {milestones.map((m, j) => {
            const done = m.status === 'completed';
            return (
              <li key={m.id || j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '0.9rem' }}>
                <span style={{ color: done ? '#16a34a' : '#94a3b8', flexShrink: 0 }}>{done ? '✓' : '○'}</span>
                <span style={{ textDecoration: done ? 'line-through' : 'none', color: done ? '#64748b' : 'inherit' }}>
                  {m.text}
                  {m.due_date && <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px' }}>(due {m.due_date})</span>}
                  {done && m.completed_at && <span style={{ fontSize: '0.8rem', color: '#16a34a', marginLeft: '8px' }}>— Completed {formatDate(m.completed_at)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {area.seller_notes?.trim() && (
        <div style={{ marginTop: '12px', padding: '10px 12px', background: 'white', borderRadius: '6px', borderLeft: '3px solid #94a3b8', fontSize: '0.85rem', color: '#475569' }}>
          <strong>Seller notes:</strong> {area.seller_notes.trim()}
        </div>
      )}
    </div>
  );
}

// Collapsible past plans section
function PastPlansSection({ pastPlans }) {
  const [open, setOpen] = useState(false);
  if (!pastPlans || pastPlans.length === 0) return null;
  return (
    <div style={{ marginTop: '24px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569' }}
      >
        <span>{open ? '▾' : '▸'}</span> Past plans ({pastPlans.length})
      </button>
      {open && (
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {pastPlans.map((plan, pi) => (
            <div key={plan.id || pi} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.875rem' }}>Plan completed {formatDate(plan.completed_at) || 'unknown date'}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>v{plan.plan_version || 1}</span>
                </div>
                {plan.completion_notes && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#475569' }}>
                    <strong>Manager reflection:</strong> {plan.completion_notes}
                  </p>
                )}
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.isArray(plan.focus_areas) && plan.focus_areas.map((area, ai) => (
                  <FocusAreaCard key={area.id || ai} area={area} readonly />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PdpChatPanel({ userId, memberName, pdp, onPlanSaved }) {
  const [state, setState] = useState('idle'); // idle | chatting | editing | completing
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedPlan, setSuggestedPlan] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [editAreas, setEditAreas] = useState(null);
  const [editManagerNotes, setEditManagerNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completeSaving, setCompleteSaving] = useState(false);
  const [pastPlans, setPastPlans] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
    return headers;
  }, []);

  // Fetch past plans on mount
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${WORKER_URL}/pdp/history?sellerId=${encodeURIComponent(userId)}`, { headers });
        if (res.ok) {
          const data = await res.json().catch(() => []);
          setPastPlans(Array.isArray(data) ? data : []);
        }
      } catch { /* silently ignore */ }
    })();
  }, [userId, getAuthHeaders]);

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
        body: JSON.stringify({ sellerId: userId, messages: [...messages, userMessage].map((m) => ({ role: m.role, content: m.content })) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${data.error || data.message || res.status}` }]);
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.message || '' }]);
      if (data.suggestedPlan?.focus_areas) setSuggestedPlan(data.suggestedPlan);
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
        body: JSON.stringify({ sellerId: userId, focusAreas: suggestedPlan.focus_areas || [], managerNotes: suggestedPlan.manager_notes ?? null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setSaveStatus('error'); return; }
      setSaveStatus('saved');
      setSuggestedPlan(null);
      setState('idle');
      if (onPlanSaved) onPlanSaved(data);
    } catch { setSaveStatus('error'); }
  };

  // Edit mode helpers
  const startEdit = () => {
    if (!pdp?.focus_areas) return;
    setEditAreas(JSON.parse(JSON.stringify(pdp.focus_areas)));
    setEditManagerNotes(pdp.manager_notes || '');
    setState('editing');
  };

  const saveEdit = async () => {
    if (editSaving) return;
    setEditSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${WORKER_URL}/pdp/edit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sellerId: userId, focusAreas: editAreas, managerNotes: editManagerNotes })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(`Save failed: ${data.error || res.status}`); return; }
      setState('idle');
      if (onPlanSaved) onPlanSaved(data);
    } catch (e) { alert(`Save failed: ${e.message}`); }
    finally { setEditSaving(false); }
  };

  const updateArea = (i, field, value) => {
    setEditAreas((prev) => prev.map((a, ai) => ai === i ? { ...a, [field]: value } : a));
  };
  const updateMilestone = (ai, mi, field, value) => {
    setEditAreas((prev) => prev.map((a, idx) => idx !== ai ? a : {
      ...a, milestones: (a.milestones || []).map((m, mj) => mj !== mi ? m : { ...m, [field]: value })
    }));
  };
  const addMilestone = (ai) => {
    setEditAreas((prev) => prev.map((a, idx) => idx !== ai ? a : {
      ...a, milestones: [...(a.milestones || []), { id: generateId(), text: '', status: 'open', due_date: '' }]
    }));
  };
  const removeMilestone = (ai, mi) => {
    setEditAreas((prev) => prev.map((a, idx) => idx !== ai ? a : {
      ...a, milestones: (a.milestones || []).filter((_, mj) => mj !== mi)
    }));
  };
  const addArea = () => {
    setEditAreas((prev) => [...(prev || []), { id: generateId(), skill: '', goal: '', why: '', priority: 'medium', milestones: [] }]);
  };
  const removeArea = (i) => {
    if (window.confirm('Remove this focus area?')) {
      setEditAreas((prev) => prev.filter((_, ai) => ai !== i));
    }
  };

  // Complete plan
  const completePlan = async () => {
    if (completeSaving) return;
    setCompleteSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${WORKER_URL}/pdp/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sellerId: userId, completionNotes })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(`Failed: ${data.error || res.status}`); return; }
      setState('idle');
      setCompletionNotes('');
      // Refresh past plans
      const hRes = await fetch(`${WORKER_URL}/pdp/history?sellerId=${encodeURIComponent(userId)}`, { headers });
      if (hRes.ok) { const h = await hRes.json().catch(() => []); setPastPlans(Array.isArray(h) ? h : []); }
      if (onPlanSaved) onPlanSaved(null);
    } catch (e) { alert(`Failed: ${e.message}`); }
    finally { setCompleteSaving(false); }
  };

  const allMilestonesComplete = pdp?.focus_areas?.length > 0 &&
    pdp.focus_areas.every((a) => (a.milestones || []).length > 0 && (a.milestones || []).every((m) => m.status === 'completed'));

  const hasActivePlan = pdp && pdp.focus_areas?.length > 0;

  // ---- EDIT MODE ----
  if (state === 'editing') {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={sectionHeading}>Edit development plan</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setState('idle')} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
            <button type="button" onClick={saveEdit} disabled={editSaving} style={{ padding: '6px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}>{editSaving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Manager notes</label>
          <textarea value={editManagerNotes} onChange={(e) => setEditManagerNotes(e.target.value)} rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        {(editAreas || []).map((area, ai) => (
          <div key={area.id || ai} style={{ marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', borderLeftWidth: '4px', borderLeftColor: priorityBorder(area.priority) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                <select value={area.priority || 'medium'} onChange={(e) => updateArea(ai, 'priority', e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 700, background: priorityBg(area.priority), color: priorityColor(area.priority) }}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input value={area.skill || ''} onChange={(e) => updateArea(ai, 'skill', e.target.value)} placeholder="Skill / focus area name"
                  style={{ flex: 1, minWidth: '140px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 600 }} />
              </div>
              <button type="button" onClick={() => removeArea(ai)} style={{ padding: '4px 10px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>Remove</button>
            </div>
            <input value={area.goal || ''} onChange={(e) => updateArea(ai, 'goal', e.target.value)} placeholder="Goal (one sentence)"
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '6px', boxSizing: 'border-box' }} />
            <input value={area.why || ''} onChange={(e) => updateArea(ai, 'why', e.target.value)} placeholder="Why this matters (optional)"
              style={{ width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '12px', boxSizing: 'border-box' }} />

            <div style={{ ...sectionHeading, fontSize: '0.7rem', marginBottom: '8px' }}>Milestones</div>
            {(area.milestones || []).map((m, mi) => (
              <div key={m.id || mi} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={m.text || ''} onChange={(e) => updateMilestone(ai, mi, 'text', e.target.value)} placeholder="Milestone description"
                  style={{ flex: 2, minWidth: '160px', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem' }} />
                <input type="date" value={m.due_date || ''} onChange={(e) => updateMilestone(ai, mi, 'due_date', e.target.value)}
                  style={{ flex: '0 0 130px', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem' }} />
                <button type="button" onClick={() => removeMilestone(ai, mi)} style={{ padding: '4px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => addMilestone(ai)} style={{ marginTop: '4px', padding: '4px 12px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>+ Add milestone</button>
          </div>
        ))}
        <button type="button" onClick={addArea} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#475569', width: '100%' }}>+ Add focus area</button>
      </div>
    );
  }

  // ---- COMPLETING MODE ----
  if (state === 'completing') {
    return (
      <div style={cardStyle}>
        <div style={{ ...sectionHeading, marginBottom: '12px' }}>Mark plan as complete</div>
        <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '16px' }}>
          All milestones are complete. Add reflection notes for {memberName || 'this seller'} — they will be able to read these once the plan is closed.
        </p>
        <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)}
          placeholder="Manager reflection notes (e.g. great progress on discovery skills, recommend focusing on negotiation next quarter)…"
          rows={4}
          style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box', marginBottom: '16px' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setState('idle')} style={{ flex: 1, padding: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button type="button" onClick={completePlan} disabled={completeSaving}
            style={{ flex: 2, padding: '10px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: completeSaving ? 'not-allowed' : 'pointer' }}>
            {completeSaving ? 'Closing plan…' : 'Close & archive plan'}
          </button>
        </div>
      </div>
    );
  }

  // ---- CHAT MODE ----
  if (state === 'chatting') {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={sectionHeading}>Development plan — chat with AI</div>
          <button type="button" onClick={() => setState('idle')} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>Close</button>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '16px' }}>Building a plan for {memberName || 'this seller'}. The AI has access to their assessments, coaching sessions, open action items, and past plans.</p>
        <div style={{ display: 'grid', gridTemplateColumns: suggestedPlan?.focus_areas?.length ? '1fr 320px' : '1fr', gap: '24px' }}>
          <div>
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', marginBottom: '12px', background: '#f8fafc' }}>
              {messages.length === 0 && (
                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Send a message to start (e.g. &quot;Let&apos;s build a development plan for this quarter&quot;).</p>
              )}
              {messages.map((m, i) => {
                const isUser = m.role === 'user';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                    <div style={{ maxWidth: '85%', padding: '10px 14px', borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isUser ? '#007AFF' : '#e5e7eb', color: isUser ? '#fff' : '#1e293b', whiteSpace: 'pre-wrap', fontSize: '0.9rem', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                      <strong style={{ fontSize: '0.7rem', opacity: 0.9 }}>{isUser ? 'You' : 'AI'}</strong>
                      <div style={{ marginTop: '4px' }}>{m.content}</div>
                    </div>
                  </div>
                );
              })}
              {loading && <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Thinking…</div>}
              <div ref={messagesEndRef} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a message…" style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }} disabled={loading} />
              <button type="button" onClick={sendMessage} disabled={loading} style={{ padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>Send</button>
            </div>
          </div>
          {suggestedPlan?.focus_areas?.length > 0 && (
            <div>
              <div style={{ ...sectionHeading, marginBottom: '8px' }}>Proposed plan</div>
              <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {suggestedPlan.focus_areas.map((area, i) => (
                  <div key={area.id || i} style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      {area.priority && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: priorityBg(area.priority), color: priorityColor(area.priority) }}>{area.priority}</span>
                      )}
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{area.skill || `Focus ${i + 1}`}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '6px' }}>{area.goal}</div>
                    {area.why && <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px' }}>{area.why}</div>}
                    {area.milestones?.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.8rem' }}>
                        {area.milestones.map((ms, j) => (
                          <li key={ms.id || j}>{ms.text} {ms.due_date ? `(by ${ms.due_date})` : ''}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={savePlan} disabled={saveStatus === 'saving'}
                style={{ marginTop: '12px', width: '100%', padding: '10px', background: saveStatus === 'saved' ? '#16a34a' : '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer' }}>
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save plan'}
              </button>
              {saveStatus === 'error' && <p style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '8px', marginBottom: 0 }}>Failed to save. Try again.</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- IDLE MODE ----
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={sectionHeading}>Development plan</div>
        {hasActivePlan && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button type="button" onClick={startEdit} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Edit plan</button>
            {allMilestonesComplete && (
              <button type="button" onClick={() => setState('completing')} style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: '#16a34a' }}>Mark complete</button>
            )}
          </div>
        )}
      </div>

      {hasActivePlan ? (
        <>
          {pdp.manager_notes && (
            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', padding: '10px', background: '#f8fafc', borderRadius: '6px', borderLeft: '4px solid #e2e8f0' }}>
              <strong>Manager notes:</strong> {pdp.manager_notes}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pdp.focus_areas.map((f, i) => {
              const area = typeof f === 'object' && f !== null ? f : null;
              if (typeof f === 'string' || (!area?.skill && !area?.goal)) {
                return <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem' }}>{typeof f === 'string' ? f : (area?.name || JSON.stringify(f))}</div>;
              }
              return <FocusAreaCard key={area.id || i} area={area} />;
            })}
          </div>
          {pdp.last_updated && <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px', marginBottom: 0 }}>Last updated {new Date(pdp.last_updated).toLocaleString()}</p>}
          <button type="button" onClick={() => { setState('chatting'); setMessages([]); setSuggestedPlan(null); setSaveStatus(null); }}
            style={{ marginTop: '16px', padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Update plan with AI
          </button>
        </>
      ) : (
        <>
          <p style={{ color: '#64748b', margin: '0 0 16px' }}>No active development plan.</p>
          <button type="button" onClick={() => { setState('chatting'); setMessages([]); setSuggestedPlan(null); setSaveStatus(null); }}
            style={{ padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Generate plan with AI
          </button>
        </>
      )}

      <PastPlansSection pastPlans={pastPlans} />
    </div>
  );
}
