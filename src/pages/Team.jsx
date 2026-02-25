import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useImpersonation } from '../context/ImpersonationContext';

export default function Team() {
  const { dataUserId, viewProfile } = useImpersonation();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!dataUserId || !supabase) {
          setLoading(false);
          return;
        }
        const teamId = viewProfile?.team_id;
        if (!teamId) {
          setMembers([]);
          setLoading(false);
          return;
        }
        const { data } = await supabase.from('users').select('id, full_name, email, role').eq('team_id', teamId).eq('role', 'rep');
        setMembers(data ?? []);
      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUserId, viewProfile?.team_id]);

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading team…</div>;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>Team overview</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>View your team members. Click a rep to see their assessments, coaching sessions, and development plan.</p>
      {members.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {members.map((m) => (
            <li key={m.id} style={{ padding: '16px', background: 'white', borderRadius: '6px', marginBottom: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <Link to={`/team/${m.id}`} style={{ fontWeight: 600, color: '#4f46e5', textDecoration: 'none' }}>
                {m.full_name || m.email}
              </Link>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>{m.email}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: '#64748b' }}>No team members found. Ensure your user has a team_id and reps are assigned to your team.</p>
      )}
    </div>
  );
}
