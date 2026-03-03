import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

const ROLES = [
  { value: 'rep', label: 'Rep' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

const SUB_ROLES = [
  { value: '', label: 'Standard Rep' },
  { value: 'ae', label: 'AE' },
  { value: 'sdr', label: 'SDR' },
  { value: 'csm', label: 'CSM' },
  { value: 'am', label: 'AM' },
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

  // Course Reporting state
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogue, setCatalogue] = useState([]);
  const [catalogueError, setCatalogueError] = useState(null);
  const [trackedCourseIds, setTrackedCourseIds] = useState([]);
  // courseOverrides: { [defaultCourseId]: { sub_role: 'sdr'|'csm'|'ae'|'am', override_course_id: string } }
  const [courseOverrides, setCourseOverrides] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ingestStatus, setIngestStatus] = useState(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestError, setIngestError] = useState(null);
  const [ingestSuccess, setIngestSuccess] = useState(null);
  const [csvFiles, setCsvFiles] = useState({});
  const [courseReportingOpen, setCourseReportingOpen] = useState(false);

  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id)); }, []);
  useEffect(() => { load(); }, []);

  async function load() {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setError(null);
    try {
      const [uRes, tRes] = await Promise.all([
        supabase.from('users').select('id, email, full_name, role, sub_role, team_id, can_impersonate').order('email'),
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

  async function updateSubRole(userId, subRole) {
    setSaving(userId); setMessage(null);
    const { error } = await supabase.from('users').update({ sub_role: subRole || null, updated_at: new Date().toISOString() }).eq('id', userId);
    setSaving(null);
    if (error) { setMessage({ type: 'error', text: error.message }); return; }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, sub_role: subRole || null } : u)));
    setMessage({ type: 'success', text: 'Sub-role updated.' });
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

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {};
  }

  const loadCatalogue = useCallback(async () => {
    setCatalogueLoading(true); setCatalogueError(null);
    try {
      const authH = await getAuthHeaders();
      const [catRes, settingsRes] = await Promise.all([
        fetch(`${WORKER_URL}/hs/catalogue`, { headers: { 'Content-Type': 'application/json', ...authH } }),
        fetch(`${WORKER_URL}/admin/hs-settings`, { headers: { 'Content-Type': 'application/json', ...authH } }),
      ]);
      if (catRes.ok) {
        const json = await catRes.json();
        setCatalogue(json.courses || []);
      } else {
        const j = await catRes.json().catch(() => ({}));
        setCatalogueError(j.error || 'Failed to load catalogue. Ensure HIGHSPOT_API_KEY and HIGHSPOT_API_URL are set in the worker.');
      }
      if (settingsRes.ok) {
        const sj = await settingsRes.json();
        setTrackedCourseIds(sj.trackedCourseIds || []);
        setCourseOverrides(sj.courseOverrides || {});
      }
    } catch (e) {
      setCatalogueError(e.message || 'Network error loading catalogue.');
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  async function loadIngestStatus() {
    try {
      const authH = await getAuthHeaders();
      const res = await fetch(`${WORKER_URL}/admin/hs-ingest-status`, { headers: { 'Content-Type': 'application/json', ...authH } });
      if (res.ok) setIngestStatus(await res.json());
    } catch { /* ignore */ }
  }

  const openCourseReporting = useCallback(() => {
    if (!courseReportingOpen) {
      setCourseReportingOpen(true);
      loadCatalogue();
      loadIngestStatus();
    } else {
      setCourseReportingOpen(false);
    }
  }, [courseReportingOpen, loadCatalogue]);

  async function saveTrackedCourses() {
    setSettingsSaving(true);
    try {
      const authH = await getAuthHeaders();
      const res = await fetch(`${WORKER_URL}/admin/hs-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({ trackedCourseIds, courseOverrides }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ type: 'error', text: json.error || 'Failed to save course settings.' }); }
      else { setMessage({ type: 'success', text: 'Course reporting configuration saved.' }); }
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Failed to save.' });
    } finally {
      setSettingsSaving(false);
    }
  }

  function toggleTrackedCourse(id) {
    setTrackedCourseIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function onCsvFile(key, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setCsvFiles((prev) => ({ ...prev, [key]: e.target.result }));
    reader.readAsText(file);
  }

  async function triggerIngest() {
    setIngestLoading(true); setIngestError(null); setIngestSuccess(null);
    try {
      const authH = await getAuthHeaders();

      // Each CSV is uploaded to its raw staging table as a separate request.
      // No filtering or joining here — that all happens server-side in hs_finalize_ingest().
      const steps = [
        { table: 'items',              csv: csvFiles.items },
        { table: 'course_lessons',     csv: csvFiles.course_lessons },
        { table: 'course_members',     csv: csvFiles.course_members },
        { table: 'lesson_completions', csv: csvFiles.user_course_lesson_completions },
        { table: 'rubric_ratings',     csv: csvFiles.rubric_ratings },
        { table: 'users',              csv: csvFiles.users },
      ];

      for (const step of steps) {
        if (!step.csv) continue;

        const form = new FormData();
        form.append('csv', new Blob([step.csv], { type: 'text/plain' }), 'data.csv');

        const res = await fetch(`${WORKER_URL}/admin/hs-ingest?table=${step.table}`, {
          method: 'POST',
          headers: { ...authH },
          body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setIngestError(`Upload failed on ${step.table}: ${json.error || res.status}`);
          setIngestLoading(false);
          return;
        }
        if (json.errors?.length) console.warn(`${step.table} upload warnings:`, json.errors);
      }

      // Finalize: call hs_finalize_ingest() SQL function which does all joins/filtering
      const finalRes = await fetch(`${WORKER_URL}/admin/hs-ingest?table=finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH },
        body: JSON.stringify({}),
      });
      const finalJson = await finalRes.json().catch(() => ({}));

      if (!finalRes.ok) {
        setIngestError(`Finalize failed: ${finalJson.error || finalRes.status}`);
        setIngestLoading(false);
        return;
      }

      const s = finalJson.stats || {};
      const skipped = s.skipped_users ? ` (${s.skipped_users} Highspot users not matched to system accounts)` : '';
      setIngestSuccess(
        `Ingest complete — ${s.courses ?? 0} courses, ${s.lessons ?? 0} lessons, ` +
        `${s.course_completions ?? 0} course completions, ${s.lesson_completions ?? 0} lesson completions, ` +
        `${s.rubric_ratings ?? 0} rubric ratings.${skipped}`
      );
      loadIngestStatus();
    } catch (e) {
      setIngestError(e.message || 'Ingest failed.');
    } finally {
      setIngestLoading(false);
    }
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
                <th>Sub-role</th>
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
                    {isSuperadmin && (u.role === 'rep') ? (
                      <select
                        className="form-select"
                        value={u.sub_role || ''}
                        onChange={(e) => updateSubRole(u.id, e.target.value || null)}
                        disabled={saving === u.id}
                        style={{ padding: '4px 8px', fontSize: '0.8125rem', minWidth: '100px' }}
                      >
                        {SUB_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '0.875rem', color: '#64748b' }}>{u.sub_role ? u.sub_role.toUpperCase() : '—'}</span>
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

      {/* Course Reporting Configuration — superadmin only */}
      {isSuperadmin && (
        <div className="card section">
          <div
            className="card-header"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={openCourseReporting}
          >
            <h2 className="card-title">Course Reporting</h2>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              {courseReportingOpen ? 'Collapse ▲' : 'Configure Highspot course tracking ▼'}
            </span>
          </div>

          {courseReportingOpen && (
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                Select which Highspot Sales Competency courses to show in seller and manager dashboards.
                Courses are fetched live from the Highspot API. Tick the courses you want to track, then save.
              </p>

              {/* Catalogue picker */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Available courses</h3>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '0.8125rem', padding: '4px 10px' }}
                    onClick={loadCatalogue}
                    disabled={catalogueLoading}
                  >
                    {catalogueLoading ? 'Loading…' : 'Refresh'}
                  </button>
                  {trackedCourseIds.length > 0 && (
                    <span className="badge badge-blue">{trackedCourseIds.length} tracked</span>
                  )}
                </div>

                {catalogueError && (
                  <div className="alert alert-error" style={{ marginBottom: '12px' }}>{catalogueError}</div>
                )}

                {catalogueLoading && (
                  <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Fetching catalogue from Highspot…</div>
                )}

                {!catalogueLoading && catalogue.length === 0 && !catalogueError && (
                  <div className="empty-state" style={{ padding: '20px' }}>
                    <div className="empty-icon">📚</div>
                    <div>No courses found. Click Refresh to load from Highspot API.</div>
                  </div>
                )}

                {catalogue.length > 0 && (() => {
                  const byCompetency = catalogue.reduce((acc, c) => {
                    const key = c.competency || 'Uncategorised';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(c);
                    return acc;
                  }, {});
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {Object.entries(byCompetency).sort(([a], [b]) => a.localeCompare(b)).map(([competency, courses]) => {
                        const hasMultiple = courses.length > 1;
                        return (
                          <div key={competency}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {competency}
                              {hasMultiple && (
                                <span style={{ marginLeft: '8px', fontWeight: 400, textTransform: 'none', fontSize: '0.75rem', color: '#7c3aed' }}>
                                  {courses.length} variants — assign sub-roles below
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {courses.map((c) => {
                                const isTracked = trackedCourseIds.includes(c.hs_item_id);
                                // Find if this course is an override target for another course
                                const overrideEntry = Object.entries(courseOverrides).find(([, v]) => v.override_course_id === c.hs_item_id);
                                const isOverrideTarget = !!overrideEntry;
                                // Find if this course has an override configured
                                const myOverride = courseOverrides[c.hs_item_id];
                                return (
                                  <div key={c.hs_item_id} style={{ borderRadius: '8px', background: isTracked ? '#eff6ff' : '#f8fafc', border: `1px solid ${isTracked ? '#bfdbfe' : '#e2e8f0'}`, padding: '8px 12px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.875rem' }}>
                                      <input
                                        type="checkbox"
                                        checked={isTracked}
                                        onChange={() => toggleTrackedCourse(c.hs_item_id)}
                                        style={{ accentColor: '#2563eb', width: '15px', height: '15px' }}
                                      />
                                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                                      {isOverrideTarget && (
                                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#7c3aed', background: '#f3e8ff', borderRadius: '4px', padding: '2px 6px' }}>
                                          Override for {SUB_ROLES.find(r => r.value === overrideEntry[1].sub_role)?.label || overrideEntry[1].sub_role}
                                        </span>
                                      )}
                                    </label>
                                    {/* Override config: only show on tracked courses when the competency has multiple variants */}
                                    {hasMultiple && isTracked && !isOverrideTarget && (
                                      <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sub-role override:</span>
                                        <select
                                          className="form-select"
                                          style={{ fontSize: '0.75rem', padding: '2px 8px', minWidth: '120px' }}
                                          value={myOverride?.sub_role || ''}
                                          onChange={(e) => {
                                            const subRole = e.target.value;
                                            if (!subRole) {
                                              setCourseOverrides((prev) => { const n = { ...prev }; delete n[c.hs_item_id]; return n; });
                                            } else {
                                              setCourseOverrides((prev) => ({ ...prev, [c.hs_item_id]: { ...prev[c.hs_item_id], sub_role: subRole } }));
                                            }
                                          }}
                                        >
                                          <option value="">Default (all reps)</option>
                                          {SUB_ROLES.filter(r => r.value).map((r) => <option key={r.value} value={r.value}>{r.label} only</option>)}
                                        </select>
                                        {myOverride?.sub_role && (
                                          <>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>replaced by:</span>
                                            <select
                                              className="form-select"
                                              style={{ fontSize: '0.75rem', padding: '2px 8px', minWidth: '180px' }}
                                              value={myOverride?.override_course_id || ''}
                                              onChange={(e) => {
                                                const overrideCourseId = e.target.value;
                                                setCourseOverrides((prev) => ({
                                                  ...prev,
                                                  [c.hs_item_id]: { ...prev[c.hs_item_id], override_course_id: overrideCourseId }
                                                }));
                                              }}
                                            >
                                              <option value="">Select override course…</option>
                                              {courses.filter((oc) => oc.hs_item_id !== c.hs_item_id).map((oc) => (
                                                <option key={oc.hs_item_id} value={oc.hs_item_id}>{oc.name}</option>
                                              ))}
                                            </select>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveTrackedCourses}
                    disabled={settingsSaving}
                  >
                    {settingsSaving ? 'Saving…' : 'Save configuration'}
                  </button>
                </div>
              </div>

              {/* Data ingest panel */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '0.9375rem', fontWeight: 600 }}>Data ingest</h3>
                <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#64748b' }}>
                  Upload nightly Data Lake CSV exports from Highspot to sync completion data.
                  Accepted files: <code>items</code>, <code>course_lessons</code>, <code>course_members</code>,
                  <code>user_course_lesson_completions</code>, <code>rubric_ratings</code>,
                  <code>lists</code>, <code>item_lists</code>.
                </p>

                {ingestStatus?.synced_at && (
                  <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8125rem', color: '#166534' }}>
                    Last sync: {new Date(ingestStatus.synced_at).toLocaleString()}
                    {ingestStatus.stats && (
                      <span style={{ marginLeft: '10px', color: '#4b5563' }}>
                        — {ingestStatus.stats.courses ?? 0} courses · {ingestStatus.stats.lessons ?? 0} lessons · {ingestStatus.stats.course_completions ?? 0} course completions · {ingestStatus.stats.lesson_completions ?? 0} lesson completions
                      </span>
                    )}
                  </div>
                )}

                {[
                  { key: 'items',                          label: 'items.csv' },
                  { key: 'course_lessons',                 label: 'course_lessons.csv' },
                  { key: 'course_members',                 label: 'course_members.csv' },
                  { key: 'user_course_lesson_completions', label: 'user_course_lesson_completions.csv' },
                  { key: 'rubric_ratings',                 label: 'rubric_ratings.csv' },
                  { key: 'users',                          label: 'users.csv (required for user ID matching)' },
                ].map(({ key, label }) => (
                  <div key={key} className="form-group" style={{ marginBottom: '10px' }}>
                    <label className="form-label">{label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        style={{ fontSize: '0.8125rem' }}
                        onChange={(e) => onCsvFile(key, e.target.files?.[0])}
                      />
                      {csvFiles[key] && (
                        <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>✓ loaded</span>
                      )}
                    </div>
                  </div>
                ))}

                {ingestError && (
                  <div className="alert alert-error" style={{ margin: '10px 0' }}>{ingestError}</div>
                )}
                {ingestSuccess && (
                  <div className="alert alert-success" style={{ margin: '10px 0' }}>{ingestSuccess}</div>
                )}

                <button
                  type="button"
                  className="btn btn-success"
                  onClick={triggerIngest}
                  disabled={ingestLoading || Object.keys(csvFiles).length === 0}
                  style={{ marginTop: '8px' }}
                >
                  {ingestLoading ? 'Importing…' : 'Run import'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
