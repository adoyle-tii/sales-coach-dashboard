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

function RoleBadge({ role }) {
  const map = { superadmin: 'badge-amber', admin: 'badge-purple', manager: 'badge-blue', rep: 'badge-slate' };
  return <span className={`badge ${map[role] || 'badge-slate'}`}>{role}</span>;
}

export default function Admin() {
  const navigate = useNavigate();
  const { setImpersonatingUserId, realProfile } = useImpersonation();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRole, setCreateRole] = useState('rep');
  const [createTeamId, setCreateTeamId] = useState('');
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamManagerId, setNewTeamManagerId] = useState('');
  const [createTeamLoading, setCreateTeamLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [impersonateId, setImpersonateId] = useState('');

  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id)); }, []);
  useEffect(() => { load(); }, []);

  async function load() {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setError(null);
    try {
      const [uRes, tRes] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role, team_id, can_impersonate').order('email'),
        supabase.from('teams').select('id, name, manager_id').order('name'),
      ]);
      if (uRes?.error) setError(uRes.error.message || 'Failed to load users.');
      else if (tRes?.error) setError(tRes.error.message || 'Failed to load teams.');
      setUsers(uRes?.data ?? []);
      setTeams(tRes?.data ?? []);
    } catch (e) { setError(e?.message || 'Failed to load.'); }
    finally { setLoading(false); }
  }

  async function updateRole(userId, newRole) {
    setSaving(userId); setMessage(null);
    const { error } = await supabase.from('users').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', userId);
    setSaving(null);
    if (error) { setMessage({ type: 'error', text: error.message }); return; }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    setMessage({ type: 'success', text: 'Role updated.' });
  }

  async function updateTeam(userId, teamId) {
    setSaving(userId); setMessage(null);
    const { error } = await supabase.from('users').update({ team_id: teamId || null, updated_at: new Date().toISOString() }).eq('id', userId);
    setSaving(null);
    if (error) { setMessage({ type: 'error', text: error.message }); return; }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, team_id: teamId || null } : u)));
    setMessage({ type: 'success', text: 'Team updated.' });
  }

  async function updateCanImpersonate(userId, canImpersonate) {
    setSaving(userId); setMessage(null);
    const { error } = await supabase.from('users').update({ can_impersonate: !!canImpersonate, updated_at: new Date().toISOString() }).eq('id', userId);
    setSaving(null);
    if (error) { setMessage({ type: 'error', text: error.message }); return; }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, can_impersonate: !!canImpersonate } : u)));
    setMessage({ type: 'success', text: canImpersonate ? 'Impersonation granted.' : 'Impersonation revoked.' });
  }

  async function promoteByEmail() {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    setPromoteLoading(true); setMessage(null);
    const user = users.find((u) => u.email?.toLowerCase() === email);
    if (!user) { setMessage({ type: 'error', text: 'No user with that email found. They must sign in at least once.' }); setPromoteLoading(false); return; }
    if (user.role === 'superadmin') { setMessage({ type: 'info', text: 'That user is already a superadmin.' }); setPromoteLoading(false); return; }
    const { error } = await supabase.from('users').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', user.id);
    if (error) { setMessage({ type: 'error', text: error.message }); setPromoteLoading(false); return; }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: 'admin' } : u)));
    setMessage({ type: 'success', text: `${email} is now an admin.` });
    setNewAdminEmail(''); setPromoteLoading(false);
  }

  async function createUser() {
    const email = createEmail.trim().toLowerCase();
    const full_name = createFullName.trim() || email;
    if (!email) { setMessage({ type: 'error', text: 'Email is required.' }); return; }
    setCreateUserLoading(true); setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: 'error', text: 'Not signed in.' }); setCreateUserLoading(false); return; }
      const res = await fetch(`${WORKER_URL}/admin/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, full_name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ type: 'error', text: json.error || json.message || 'Failed to create user.' }); setCreateUserLoading(false); return; }
      const id = json.id;
      if (createRole !== 'rep' || createTeamId) {
        await new Promise((r) => setTimeout(r, 500));
        const update = { updated_at: new Date().toISOString() };
        if (createRole !== 'rep') update.role = createRole;
        if (createTeamId) update.team_id = createTeamId;
        const { error: updateErr } = await supabase.from('users').update(update).eq('id', id);
        if (updateErr) setMessage({ type: 'info', text: `User created. Role/team update failed: ${updateErr.message}` });
      }
      setMessage({ type: 'success', text: `User created: ${email}` });
      setCreateEmail(''); setCreateFullName(''); setCreateRole('rep'); setCreateTeamId('');
      load();
    } catch (e) { setMessage({ type: 'error', text: e?.message || 'Failed to create user.' }); }
    setCreateUserLoading(false);
  }

  async function createTeam() {
    const name = newTeamName.trim();
    if (!name) { setMessage({ type: 'error', text: 'Team name is required.' }); return; }
    setCreateTeamLoading(true); setMessage(null);
    const { data, error: err } = await supabase.from('teams').insert({ name, manager_id: newTeamManagerId || null }).select('id').single();
    if (err) { setCreateTeamLoading(false); setMessage({ type: 'error', text: err.message || 'Failed to create team.' }); return; }
    if (data?.id && newTeamManagerId) {
      await supabase.from('users').update({ team_id: data.id, updated_at: new Date().toISOString() }).eq('id', newTeamManagerId);
    }
    setCreateTeamLoading(false);
    setMessage({ type: 'success', text: `Team "${name}" created.` });
    setNewTeamName(''); setNewTeamManagerId('');
    load();
  }

  function startImpersonating(userId) {
    setImpersonatingUserId(userId);
    navigate('/my');
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /> Loading admin…</div>;

  if (error) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Admin</h1></div>
        <div className="alert alert-error">{error}</div>
        <button className="btn btn-ghost" onClick={() => { setError(null); setLoading(true); load(); }}>Retry</button>
      </div>
    );
  }

  const userList = users || [];
  const teamList = teams || [];
  const teamName = (id) => teamList.find((t) => t.id === id)?.name || '—';
  const isSuperadmin = realProfile?.role === 'superadmin';
  const canImpersonate = isSuperadmin || realProfile?.can_impersonate;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Admin</h1>
        <p className="page-subtitle">
          {isSuperadmin
            ? 'Manage users, roles, teams, and permissions.'
            : 'View the dashboard as another user by impersonating.'}
        </p>
      </div>

      {message && (
        <div className={`alert ${message.type === 'error' ? 'alert-error' : message.type === 'success' ? 'alert-success' : 'alert-info'}`}>
          {message.text}
        </div>
      )}

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-value">{userList.length}</div>
          <div className="stat-label">Total users</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{teamList.length}</div>
          <div className="stat-label">Teams</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{userList.filter((u) => u.role === 'manager').length}</div>
          <div className="stat-label">Managers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{userList.filter((u) => u.role === 'rep').length}</div>
          <div className="stat-label">Reps</div>
        </div>
      </div>

      {/* Impersonate quick-select */}
      {canImpersonate && (
        <div className="card section">
          <div className="card-header">
            <h2 className="card-title">👁 Impersonate user</h2>
          </div>
          <div className="card-body">
            <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#64748b' }}>
              View the dashboard exactly as another user sees it. Use "Exit impersonation" in the banner to return.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
                <label className="form-label">Select user</label>
                <select className="form-select" value={impersonateId} onChange={(e) => setImpersonateId(e.target.value)}>
                  <option value="">Choose a user…</option>
                  {userList.filter((u) => u.id !== currentUserId).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email} ({u.role})</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-impersonate"
                disabled={!impersonateId}
                onClick={() => { if (impersonateId) startImpersonating(impersonateId); }}
              >
                Impersonate →
              </button>
            </div>
          </div>
        </div>
      )}

      {isSuperadmin && (
        <div className="two-col" style={{ marginBottom: '24px' }}>
          {/* Add admin */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Promote to admin</h2></div>
            <div className="card-body">
              <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#64748b' }}>
                User must have signed in at least once. Enter their email to promote them.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  className="form-input"
                  type="email"
                  placeholder="user@company.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && promoteByEmail()}
                  style={{ flex: 1, minWidth: '180px' }}
                />
                <button type="button" className="btn btn-primary" onClick={promoteByEmail} disabled={promoteLoading || !newAdminEmail.trim()}>
                  {promoteLoading ? 'Updating…' : 'Promote'}
                </button>
              </div>
            </div>
          </div>

          {/* Create team */}
          <div className="card">
            <div className="card-header"><h2 className="card-title">Create team</h2></div>
            <div className="card-body">
              <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#64748b' }}>
                Add a new team and optionally assign a manager.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Team name</label>
                  <input className="form-input" placeholder="e.g. West Sales" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Manager (optional)</label>
                  <select className="form-select" value={newTeamManagerId} onChange={(e) => setNewTeamManagerId(e.target.value)}>
                    <option value="">No manager</option>
                    {userList.filter((u) => u.role === 'manager' || u.role === 'admin' || u.role === 'superadmin').map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                </div>
                <button type="button" className="btn btn-success" onClick={createTeam} disabled={createTeamLoading || !newTeamName.trim()}>
                  {createTeamLoading ? 'Creating…' : 'Create team'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create user */}
      {isSuperadmin && (
        <div className="card section">
          <div className="card-header"><h2 className="card-title">Create user</h2></div>
          <div className="card-body">
            <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#64748b' }}>
              Creates a user account. They can sign in via magic link or Google. Share the dashboard URL with them.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 2, minWidth: '180px' }}>
                <label className="form-label">Email</label>
                <input className="form-input" type="email" placeholder="user@company.com" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 2, minWidth: '150px' }}>
                <label className="form-label">Full name</label>
                <input className="form-input" type="text" placeholder="Optional" value={createFullName} onChange={(e) => setCreateFullName(e.target.value)} />
              </div>
              <div className="form-group" style={{ minWidth: '110px' }}>
                <label className="form-label">Role</label>
                <select className="form-select" value={createRole} onChange={(e) => setCreateRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: '140px' }}>
                <label className="form-label">Team</label>
                <select className="form-select" value={createTeamId} onChange={(e) => setCreateTeamId(e.target.value)}>
                  <option value="">No team</option>
                  {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button type="button" className="btn btn-success" onClick={createUser} disabled={createUserLoading || !createEmail.trim()}>
                {createUserLoading ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="card section">
        <div className="card-header">
          <h2 className="card-title">All users</h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{userList.length} total</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Team</th>
                {isSuperadmin && <th>Can impersonate</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="avatar avatar-sm" style={{ fontSize: '0.65rem' }}>
                        {(u.full_name || u.email || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 500 }}>{u.full_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ color: '#64748b' }}>{u.email || '—'}</td>
                  <td>
                    {u.role === 'superadmin' ? (
                      <RoleBadge role="superadmin" />
                    ) : isSuperadmin ? (
                      <select
                        className="form-select"
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value)}
                        disabled={saving === u.id}
                        style={{ padding: '4px 8px', fontSize: '0.8125rem', minWidth: '90px' }}
                      >
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                  <td>
                    {isSuperadmin ? (
                      <select
                        className="form-select"
                        value={u.team_id || ''}
                        onChange={(e) => updateTeam(u.id, e.target.value || null)}
                        disabled={saving === u.id || u.role === 'superadmin'}
                        style={{ padding: '4px 8px', fontSize: '0.8125rem', minWidth: '120px' }}
                      >
                        <option value="">No team</option>
                        {teamList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '0.875rem', color: '#64748b' }}>{teamName(u.team_id)}</span>
                    )}
                  </td>
                  {isSuperadmin && (
                    <td>
                      {u.role === 'admin' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
                          <input
                            type="checkbox"
                            checked={!!u.can_impersonate}
                            onChange={(e) => updateCanImpersonate(u.id, e.target.checked)}
                            disabled={saving === u.id}
                            style={{ accentColor: '#7c3aed' }}
                          />
                          Allow
                        </label>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '0.875rem' }}>—</span>
                      )}
                    </td>
                  )}
                  <td>
                    {canImpersonate && u.id !== currentUserId && (
                      <button
                        type="button"
                        className="btn btn-impersonate btn-xs"
                        onClick={() => startImpersonating(u.id)}
                      >
                        View as
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {userList.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">👤</div>
              <div>No users yet. Users appear after they sign in.</div>
            </div>
          )}
        </div>
      </div>

      {/* Role legend */}
      <div className="card section" style={{ background: '#f8fafc' }}>
        <div className="card-header"><h2 className="card-title" style={{ fontSize: '0.875rem', color: '#64748b' }}>Role guide</h2></div>
        <div className="card-body">
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8125rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong style={{ color: '#475569' }}>Rep</strong> — Own dashboard only (My Dashboard).</li>
            <li><strong style={{ color: '#475569' }}>Manager</strong> — Team view; can manage development plans for their reps.</li>
            <li><strong style={{ color: '#475569' }}>Admin</strong> — Manager access plus cross-team read. Superadmins can grant impersonation.</li>
            <li><strong style={{ color: '#475569' }}>Superadmin</strong> — Full access: manage roles, teams, grant/revoke permissions. Set via Supabase SQL.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
