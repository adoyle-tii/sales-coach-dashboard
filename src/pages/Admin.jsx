import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

const ROLES = [
  { value: 'rep', label: 'Rep' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export default function Admin() {
  const navigate = useNavigate();
  const { setImpersonatingUserId } = useImpersonation();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);

  // Create user form
  const [createEmail, setCreateEmail] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRole, setCreateRole] = useState('rep');
  const [createTeamId, setCreateTeamId] = useState('');
  const [createUserLoading, setCreateUserLoading] = useState(false);

  // Create team form
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamManagerId, setNewTeamManagerId] = useState('');
  const [createTeamLoading, setCreateTeamLoading] = useState(false);

  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id));
  }, []);

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

  async function createUser() {
    const email = createEmail.trim().toLowerCase();
    const full_name = createFullName.trim() || email;
    if (!email) {
      setMessage({ type: 'error', text: 'Email is required.' });
      return;
    }
    setCreateUserLoading(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'Not signed in.' });
        setCreateUserLoading(false);
        return;
      }
      const res = await fetch(`${WORKER_URL}/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, full_name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || json.message || 'Failed to create user.' });
        setCreateUserLoading(false);
        return;
      }
      const id = json.id;
      if (createRole !== 'rep' || createTeamId) {
        await new Promise((r) => setTimeout(r, 500));
        const update = { updated_at: new Date().toISOString() };
        if (createRole !== 'rep') update.role = createRole;
        if (createTeamId) update.team_id = createTeamId;
        const { error: updateErr } = await supabase.from('users').update(update).eq('id', id);
        if (updateErr) setMessage({ type: 'info', text: `User created. Role/team update failed: ${updateErr.message}` });
      }
      setMessage({ type: 'success', text: `User created: ${email}. They can sign in with that email (magic link or Google if configured).` });
      setCreateEmail('');
      setCreateFullName('');
      setCreateRole('rep');
      setCreateTeamId('');
      load();
    } catch (e) {
      setMessage({ type: 'error', text: e?.message || 'Failed to create user.' });
    }
    setCreateUserLoading(false);
  }

  async function createTeam() {
    const name = newTeamName.trim();
    if (!name) {
      setMessage({ type: 'error', text: 'Team name is required.' });
      return;
    }
    setCreateTeamLoading(true);
    setMessage(null);
    const { data, error: err } = await supabase.from('teams').insert({ name, manager_id: newTeamManagerId || null }).select('id').single();
    if (err) {
      setCreateTeamLoading(false);
      setMessage({ type: 'error', text: err.message || 'Failed to create team.' });
      return;
    }
    if (data?.id && newTeamManagerId) {
      await supabase.from('users').update({ team_id: data.id, updated_at: new Date().toISOString() }).eq('id', newTeamManagerId);
    }
    setCreateTeamLoading(false);
    setMessage({ type: 'success', text: `Team "${name}" created.` });
    setNewTeamName('');
    setNewTeamManagerId('');
    load();
  }

  function startImpersonating(userId) {
    setImpersonatingUserId(userId);
    navigate('/my');
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

      <section style={{ marginBottom: '32px', padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Create user</h3>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '12px' }}>
          Create a new user by email. They will receive no email; share the dashboard URL and they can sign in with this email (magic link or Google if configured). Optionally set role and team below.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Email</label>
            <input
              type="email"
              placeholder="user@company.com"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              style={{ padding: '8px 12px', minWidth: '200px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Full name</label>
            <input
              type="text"
              placeholder="Optional"
              value={createFullName}
              onChange={(e) => setCreateFullName(e.target.value)}
              style={{ padding: '8px 12px', minWidth: '160px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Role</label>
            <select value={createRole} onChange={(e) => setCreateRole(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Team</label>
            <select value={createTeamId} onChange={(e) => setCreateTeamId(e.target.value)} style={{ padding: '8px 12px', minWidth: '140px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              <option value="">No team</option>
              {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={createUser}
            disabled={createUserLoading || !createEmail.trim()}
            style={{ padding: '8px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: createUserLoading ? 'wait' : 'pointer' }}
          >
            {createUserLoading ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '32px', padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Create team</h3>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '12px' }}>
          Add a new team. Optionally assign a manager (they must already exist as a user).
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Team name</label>
            <input
              type="text"
              placeholder="e.g. West Sales"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              style={{ padding: '8px 12px', minWidth: '180px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Manager</label>
            <select value={newTeamManagerId} onChange={(e) => setNewTeamManagerId(e.target.value)} style={{ padding: '8px 12px', minWidth: '200px', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
              <option value="">No manager</option>
              {userList.filter((u) => u.role === 'manager' || u.role === 'admin' || u.role === 'superadmin').map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={createTeam}
            disabled={createTeamLoading || !newTeamName.trim()}
            style={{ padding: '8px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: createTeamLoading ? 'wait' : 'pointer' }}
          >
            {createTeamLoading ? 'Creating…' : 'Create team'}
          </button>
        </div>
      </section>

      <section style={{ marginBottom: '32px', padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h3 style={{ marginTop: 0 }}>Impersonate user</h3>
        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '12px' }}>
          View the dashboard exactly as another user sees it. Select a user and click Impersonate; use &quot;Exit impersonation&quot; in the banner to return.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select
            id="impersonate-select"
            style={{ padding: '8px 12px', minWidth: '220px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          >
            <option value="">Select user to impersonate…</option>
            {userList.filter((u) => u.id !== currentUserId).map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.role})</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const sel = document.getElementById('impersonate-select');
              const id = sel?.value;
              if (id) startImpersonating(id);
            }}
            style={{ padding: '8px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Impersonate
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
              <th style={{ padding: '12px 16px', fontWeight: 600 }}></th>
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
                <td style={{ padding: '12px 16px' }}>
                  {u.id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => startImpersonating(u.id)}
                      style={{ padding: '4px 10px', fontSize: '0.8125rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Impersonate
                    </button>
                  )}
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
