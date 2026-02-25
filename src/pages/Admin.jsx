import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const ROLES = [
  { value: 'rep', label: 'Rep' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [uRes, tRes] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role, team_id').order('email'),
        supabase.from('teams').select('id, name, manager_id').order('name'),
      ]);
      if (uRes?.error) setError(uRes.error.message || 'Failed to load users.');
      else if (tRes?.error) setError(tRes.error.message || 'Failed to load teams.');
      setUsers(uRes?.data ?? []);
      setTeams(tRes?.data ?? []);
    } catch (e) {
      setError(e?.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(userId, newRole) {
    if (!supabase) return;
    setSaving(userId);
    setMessage(null);
    const { error } = await supabase.from('users').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', userId);
    setSaving(null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    setMessage({ type: 'success', text: 'Role updated.' });
  }

  async function updateTeam(userId, teamId) {
    if (!supabase) return;
    setSaving(userId);
    setMessage(null);
    const { error } = await supabase.from('users').update({ team_id: teamId || null, updated_at: new Date().toISOString() }).eq('id', userId);
    setSaving(null);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, team_id: teamId || null } : u)));
    setMessage({ type: 'success', text: 'Team updated.' });
  }

  async function promoteByEmail() {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    setPromoteLoading(true);
    setMessage(null);
    const user = users.find((u) => u.email && u.email.toLowerCase() === email);
    if (!user) {
      setMessage({ type: 'error', text: 'No user with that email found. They must sign in to the dashboard at least once to appear here.' });
      setPromoteLoading(false);
      return;
    }
    if (user.role === 'superadmin') {
      setMessage({ type: 'info', text: 'That user is already a superadmin.' });
      setPromoteLoading(false);
      return;
    }
    const { error } = await supabase.from('users').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', user.id);
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setPromoteLoading(false);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: 'admin' } : u)));
    setMessage({ type: 'success', text: `${email} is now an admin.` });
    setNewAdminEmail('');
    setPromoteLoading(false);
  }

  if (loading) return <div style={{ padding: '24px', color: '#334155' }}>Loading admin…</div>;

  if (error) {
    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Admin</h2>
        <div style={{ padding: '16px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px' }}>
          {error}
        </div>
        <button type="button" onClick={() => { setError(null); setLoading(true); load(); }} style={{ marginTop: '16px', padding: '8px 16px' }}>
          Retry
        </button>
      </div>
    );
  }

  const userList = users || [];
  const teamList = teams || [];
  const teamName = (id) => teamList.find((t) => t.id === id)?.name || '—';

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>Admin</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Manage users, roles, and teams. Superadmins cannot be changed from this screen.
      </p>

      {message && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '6px',
            background: message.type === 'error' ? '#fef2f2' : message.type === 'success' ? '#f0fdf4' : '#eff6ff',
            color: message.type === 'error' ? '#991b1b' : message.type === 'success' ? '#166534' : '#1e40af',
          }}
        >
          {message.text}
        </div>
      )}

      <section style={{ marginBottom: '32px', padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Add admin by email</h3>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '12px' }}>
          The user must have signed in to the dashboard at least once to appear. Enter their email to promote them to admin.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="email"
            placeholder="user@company.com"
            value={newAdminEmail}
            onChange={(e) => setNewAdminEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && promoteByEmail()}
            style={{ padding: '8px 12px', minWidth: '220px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
          <button
            type="button"
            onClick={promoteByEmail}
            disabled={promoteLoading || !newAdminEmail.trim()}
            style={{ padding: '8px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', cursor: promoteLoading ? 'wait' : 'pointer' }}
          >
            {promoteLoading ? 'Updating…' : 'Promote to admin'}
          </button>
        </div>
      </section>

      <section style={{ overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>All users</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Team</th>
            </tr>
          </thead>
          <tbody>
            {userList.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px 16px' }}>{u.full_name || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: '0.875rem' }}>{u.email || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  {u.role === 'superadmin' ? (
                    <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 8px', borderRadius: '4px', fontSize: '0.875rem' }}>Superadmin</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      disabled={saving === u.id}
                      style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', minWidth: '100px' }}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <select
                    value={u.team_id || ''}
                    onChange={(e) => updateTeam(u.id, e.target.value || null)}
                    disabled={saving === u.id || u.role === 'superadmin'}
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', minWidth: '140px' }}
                  >
                    <option value="">No team</option>
                    {teamList.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {userList.length === 0 && <p style={{ color: '#64748b', padding: '16px' }}>No users yet. Users appear after they sign in to the dashboard.</p>}
      </section>

      <section style={{ marginTop: '32px', padding: '20px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.875rem', color: '#64748b' }}>
        <h3 style={{ marginTop: 0, color: '#475569' }}>Roles</h3>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li><strong>Rep</strong> — Own dashboard only (My Dashboard).</li>
          <li><strong>Manager</strong> — Team view; can see reps in their team and manage development plans.</li>
          <li><strong>Admin</strong> — Same as manager but can see all users/teams (read-only for cross-team).</li>
          <li><strong>Superadmin</strong> — Full admin: manage roles, teams, and all users. Set only via Supabase (e.g. SQL).</li>
        </ul>
      </section>
    </div>
  );
}
