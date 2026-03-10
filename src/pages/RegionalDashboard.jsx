import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useImpersonation } from '../context/ImpersonationContext';
import MeetingIntelligencePanel from '../components/MeetingIntelligencePanel';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

function StatCard({ label, value, sub, color = '#1e293b', bg = '#f8fafc' }) {
  return (
    <div style={{
      background: bg, border: '1px solid #e2e8f0', borderRadius: '10px',
      padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

export default function RegionalDashboard() {
  const navigate = useNavigate();
  const { viewProfile, dataUserId } = useImpersonation();
  const myRole = viewProfile?.role || 'rep';
  const isSeniorLeader = myRole === 'senior_leader';
  const canSeeAll = ['executive', 'admin', 'superadmin'].includes(myRole);

  const [token, setToken] = useState(null);
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [selectedSubRegionId, setSelectedSubRegionId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [regionsLoading, setRegionsLoading] = useState(true);
  const [regionsError, setRegionsError] = useState(null);

  // Fetch auth token once
  useEffect(() => {
    supabase?.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token || null);
    });
  }, []);

  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {};
  }, []);

  // Load regions available to this user
  useEffect(() => {
    if (!token) return;
    (async () => {
      setRegionsLoading(true); setRegionsError(null);
      try {
        const authH = await getAuthHeaders();
        const res = await fetch(`${WORKER_URL}/regions/mine`, {
          headers: { 'Content-Type': 'application/json', ...authH },
        });
        if (!res.ok) { setRegionsError(`Failed to load regions (${res.status})`); return; }
        const d = await res.json();
        const list = d.regions || [];
        setRegions(list);
        if (list.length > 0 && !selectedRegionId) setSelectedRegionId(list[0].id);
      } catch (e) {
        setRegionsError(e.message || 'Failed to load regions.');
      } finally {
        setRegionsLoading(false);
      }
    })();
  }, [token]);

  // Load summary whenever selected region changes
  useEffect(() => {
    if (!selectedRegionId || !token) return;
    (async () => {
      setSummaryLoading(true); setSummaryError(null); setSummary(null);
      try {
        const authH = await getAuthHeaders();
        const res = await fetch(`${WORKER_URL}/regions/${encodeURIComponent(selectedRegionId)}/summary`, {
          headers: { 'Content-Type': 'application/json', ...authH },
        });
        if (!res.ok) { setSummaryError(`Failed to load region summary (${res.status})`); return; }
        setSummary(await res.json());
      } catch (e) {
        setSummaryError(e.message || 'Failed to load region summary.');
      } finally {
        setSummaryLoading(false);
      }
    })();
    // Reset sub-region filter when region changes
    setSelectedSubRegionId(null);
  }, [selectedRegionId, token]);

  // Derived data
  const activeRegion = regions.find((r) => r.id === selectedRegionId);
  const subRegions = summary?.sub_regions || [];
  const teamsToShow = selectedSubRegionId
    ? (summary?.teams || []).filter((t) => t.sub_region_id === selectedSubRegionId)
    : (summary?.teams || []);

  if (regionsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '10px', color: '#64748b' }}>
        <div className="spinner" style={{ width: '18px', height: '18px' }} /> Loading regional data…
      </div>
    );
  }

  if (regionsError) {
    return (
      <div className="alert alert-error" style={{ margin: '24px' }}>{regionsError}</div>
    );
  }

  if (regions.length === 0) {
    return (
      <div style={{ padding: '32px', maxWidth: '600px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginTop: 0 }}>Regional Dashboard</h1>
        <div style={{ padding: '20px', background: '#fef9c3', border: '1px solid #fcd34d', borderRadius: '10px', color: '#92400e', fontSize: '0.9rem' }}>
          {isSeniorLeader
            ? 'No regions are currently assigned to you. Contact a superadmin to assign a region.'
            : 'No regions have been set up yet. Visit the Admin panel to create regions.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', marginTop: 0, marginBottom: '4px' }}>Regional Dashboard</h1>
          {activeRegion?.rvp && (
            <div style={{ fontSize: '0.8375rem', color: '#64748b' }}>
              RVP: <strong style={{ color: '#4338ca' }}>{activeRegion.rvp.full_name || activeRegion.rvp.email}</strong>
            </div>
          )}
        </div>

        {/* Region + sub-region selectors */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Region selector — always shown; for RVPs with one region it still renders for clarity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Region</label>
            <select
              className="form-select"
              style={{ minWidth: '160px' }}
              value={selectedRegionId || ''}
              onChange={(e) => setSelectedRegionId(e.target.value || null)}
            >
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Sub-region filter */}
          {subRegions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sub-region</label>
              <select
                className="form-select"
                style={{ minWidth: '160px' }}
                value={selectedSubRegionId || ''}
                onChange={(e) => setSelectedSubRegionId(e.target.value || null)}
              >
                <option value="">All sub-regions</option>
                {subRegions.map((sr) => <option key={sr.id} value={sr.id}>{sr.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {summaryLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.875rem', marginBottom: '24px' }}>
          <div className="spinner" style={{ width: '16px', height: '16px' }} /> Loading region data…
        </div>
      )}

      {summaryError && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>{summaryError}</div>
      )}

      {summary && (
        <>
          {/* ── Summary cards ──────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <StatCard
              label="Teams"
              value={selectedSubRegionId
                ? teamsToShow.length
                : summary.team_count}
              sub={selectedSubRegionId ? 'in sub-region' : 'in region'}
              color="#7c3aed"
              bg="#ede9fe"
            />
            <StatCard
              label="Reps"
              value={summary.rep_count}
              sub="active"
              color="#2563eb"
              bg="#eff6ff"
            />
            <StatCard
              label="Managers"
              value={summary.manager_count}
              color="#0f766e"
              bg="#ccfbf1"
            />
            <StatCard
              label="Sub-regions"
              value={summary.sub_region_count}
              color="#b45309"
              bg="#fef3c7"
            />
          </div>

          {/* ── Meeting Intelligence ────────────────────────────────────── */}
          <MeetingIntelligencePanel
            mode="org"
            token={token}
            regionId={selectedRegionId}
          />

          {/* ── Teams in this region ────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header">
              <h2 className="card-title">
                Teams{selectedSubRegionId
                  ? ` — ${subRegions.find((sr) => sr.id === selectedSubRegionId)?.name || ''}`
                  : ` in ${activeRegion?.name || 'region'}`}
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {teamsToShow.length} team{teamsToShow.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {teamsToShow.length === 0 ? (
                <div style={{ padding: '20px', color: '#94a3b8', fontSize: '0.875rem' }}>
                  No teams in {selectedSubRegionId ? 'this sub-region' : 'this region'} yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8375rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['Team', 'Manager', 'Sub-region', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teamsToShow.map((team) => (
                      <tr
                        key={team.id}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                        onClick={() => team.manager_id && navigate(`/team/view/${team.manager_id}`)}
                      >
                        <td style={{ padding: '11px 16px', fontWeight: 600, color: '#1e293b' }}>{team.name}</td>
                        <td style={{ padding: '11px 16px', color: '#64748b' }}>{team.manager?.full_name || team.manager?.email || '—'}</td>
                        <td style={{ padding: '11px 16px' }}>
                          {team.sub_region_name
                            ? <span style={{ fontSize: '0.75rem', background: '#ede9fe', color: '#7c3aed', borderRadius: '99px', padding: '2px 8px', fontWeight: 600 }}>{team.sub_region_name}</span>
                            : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 16px' }}>
                          {team.manager_id && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                              onClick={(e) => { e.stopPropagation(); navigate(`/team/view/${team.manager_id}`); }}
                            >
                              View team →
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
