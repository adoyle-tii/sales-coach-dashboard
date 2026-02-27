import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PdpChatPanel from '../components/PdpChatPanel';

export default function TeamMember() {
  const { userId } = useParams();
  const [member, setMember] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [pdp, setPdp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !supabase) {
      setLoading(false);
      return;
    }
    (async () => {
      const [uRes, aRes, sRes, aiRes, pRes] = await Promise.all([
        supabase.from('users').select('id, full_name, email').eq('id', userId).single(),
        supabase.from('skill_assessments').select('id, meeting_title, created_at, overall_score, skill_scores').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.from('coaching_sessions').select('id, session_date, session_summary').eq('user_id', userId).order('session_date', { ascending: false }).limit(20),
        supabase.from('action_items').select('id, description, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabase.from('development_plans').select('*').eq('user_id', userId).single()
      ]);
      setMember(uRes?.data || null);
      setAssessments(aRes?.data || []);
      setSessions(sRes?.data || []);
      setActionItems(aiRes?.data || []);
      setPdp(pRes?.data || null);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (!member) return <div>Member not found.</div>;

  const open = actionItems.filter((a) => a.status === 'open');
  const exhibited = actionItems.filter((a) => a.status === 'exhibited');
  const completed = actionItems.filter((a) => a.status === 'completed');

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Link to="/team" style={{ display: 'inline-block', marginBottom: '16px', color: '#4f46e5', textDecoration: 'none' }}>← Back to team</Link>
      <h2 style={{ marginTop: 0 }}>{member.full_name || member.email}</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>{member.email}</p>

      <section style={{ marginBottom: '32px' }}>
        <h3>Assessment history</h3>
        {assessments.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {assessments.map((a) => (
              <li key={a.id} style={{ padding: '12px', background: 'white', borderRadius: '6px', marginBottom: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <Link
                  to={`/team/${userId}/assessment/${a.id}`}
                  style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}
                >
                  {a.meeting_title || 'Untitled'}
                </Link>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '2px' }}>
                  {new Date(a.created_at).toLocaleDateString()} · Avg {a.overall_score != null ? Number(a.overall_score).toFixed(1) : '—'}/5
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
                <Link
                  to={`/team/${userId}/session/${s.id}`}
                  style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}
                >
                  {new Date(s.session_date).toLocaleString()}
                </Link>
                {s.session_summary && <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: '#475569' }}>{s.session_summary}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b' }}>No coaching sessions yet.</p>
        )}
      </section>

      <section style={{ marginBottom: '32px' }}>
        <h3>Action items</h3>
        <p><strong>Open:</strong> {open.length} · <strong>Exhibited:</strong> {exhibited.length} · <strong>Completed:</strong> {completed.length}</p>
        {actionItems.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {actionItems.slice(0, 15).map((a) => (
              <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{a.description}</span>
                <span style={{ fontSize: '0.75rem', color: a.status === 'exhibited' ? '#16a34a' : a.status === 'completed' ? '#64748b' : '#ca8a04' }}>{a.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#64748b' }}>No action items yet.</p>
        )}
      </section>

      <section>
        <PdpChatPanel
          userId={userId}
          memberName={member.full_name || member.email}
          pdp={pdp}
          onPlanSaved={async () => {
            const { data } = await supabase.from('development_plans').select('*').eq('user_id', userId).single();
            setPdp(data || null);
          }}
        />
      </section>
    </div>
  );
}
