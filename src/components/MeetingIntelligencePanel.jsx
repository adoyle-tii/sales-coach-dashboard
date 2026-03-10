import { useEffect, useState } from 'react';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';


// ── Mini bar sparkline (6-month trend) ──────────────────────────────────────

function SparkBar({ data, valueKey, color = '#7c3aed', maxOverride }) {
  if (!data || data.length === 0) return null;
  const values = data.map((d) => d[valueKey] ?? 0);
  const max = maxOverride ?? Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '32px' }}>
      {values.map((v, i) => (
        <div
          key={i}
          title={`${data[i].month}: ${v}`}
          style={{
            flex: 1,
            background: i === values.length - 1 ? color : `${color}66`,
            height: `${Math.max(4, Math.round((v / max) * 32))}px`,
            borderRadius: '2px 2px 0 0',
            transition: 'height 0.3s',
          }}
        />
      ))}
    </div>
  );
}

// ── Talk ratio color coding ──────────────────────────────────────────────────
// Ideal internal talk ratio: 40–60%

function talkRatioColor(pct) {
  if (pct == null) return '#94a3b8';
  if (pct >= 40 && pct <= 60) return '#16a34a';
  if (pct >= 30 && pct < 40)  return '#d97706';
  if (pct > 60 && pct <= 70)  return '#d97706';
  return '#dc2626';
}

function TalkPctBadge({ pct }) {
  if (pct == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const color = talkRatioColor(pct);
  return (
    <span style={{
      fontWeight: 700,
      color,
      fontSize: '0.875rem',
    }}>
      {pct}%
    </span>
  );
}

// ── Org-wide panel (CRO / executive / senior_leader) ────────────────────────

function OrgMeetingIntelligence({ token }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${WORKER_URL}/hs/meeting-intelligence/org?months=12`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.875rem' }}>
        <div className="spinner" style={{ width: '16px', height: '16px' }} /> Loading meeting intelligence…
      </div>
    </div>
  );

  if (error) return (
    <div className="alert alert-error" style={{ marginBottom: '16px', fontSize: '0.8rem' }}>
      Meeting intelligence unavailable: {error}
    </div>
  );

  if (!data) return null;

  // Most recent month stats
  const lastMtg  = data.meetings_by_month?.[data.meetings_by_month.length - 1];
  const lastRate  = data.active_rep_rate_by_month?.[data.active_rep_rate_by_month.length - 1];
  const lastTalk  = data.avg_talk_ratio_by_month?.[data.avg_talk_ratio_by_month.length - 1];
  const recentMonths = (data.meetings_by_month || []).slice(-6);
  const recentRates  = (data.active_rep_rate_by_month || []).slice(-6);
  const recentTalk   = (data.avg_talk_ratio_by_month || []).slice(-6);

  // Month-over-month delta helpers
  function prevValue(arr, key) {
    if (!arr || arr.length < 2) return null;
    return arr[arr.length - 2]?.[key] ?? null;
  }
  function delta(curr, prev) {
    if (curr == null || prev == null) return null;
    return curr - prev;
  }
  function DeltaBadge({ value, suffix = '' }) {
    if (value == null) return null;
    const up = value > 0;
    const zero = value === 0;
    return (
      <span style={{
        fontSize: '0.7rem', fontWeight: 700, padding: '1px 5px', borderRadius: '99px', marginLeft: '6px',
        background: zero ? '#f1f5f9' : up ? '#dcfce7' : '#fee2e2',
        color: zero ? '#94a3b8' : up ? '#16a34a' : '#dc2626',
      }}>
        {zero ? '–' : `${up ? '+' : ''}${typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}${suffix}`}
      </span>
    );
  }

  const mtgDelta  = delta(lastMtg?.count, prevValue(data.meetings_by_month, 'count'));
  const rateDelta = delta(lastRate?.pct,  prevValue(data.active_rep_rate_by_month, 'pct'));
  const talkDelta = delta(lastTalk?.avg_internal_talk_pct, prevValue(data.avg_talk_ratio_by_month, 'avg_internal_talk_pct'));

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-header">
        <h2 className="card-title">Meeting Intelligence</h2>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {data.total_meetings_scraped?.toLocaleString()} meetings analysed
          {data.total_meetings_pending > 0 && (
            <span style={{ marginLeft: '8px', color: '#d97706' }}>
              ({data.total_meetings_pending?.toLocaleString()} pending)
            </span>
          )}
        </span>
      </div>
      <div className="card-body">
        {/* KPI stat row — top 3 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          {/* Meetings this month */}
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
              {lastMtg?.count ?? '—'}
              <DeltaBadge value={mtgDelta} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Meetings recorded (this month)</div>
            <div style={{ marginTop: '10px' }}>
              <SparkBar data={recentMonths} valueKey="count" color="#7c3aed" />
            </div>
          </div>

          {/* Active reps */}
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
              {lastRate?.pct != null ? `${lastRate.pct}%` : '—'}
              <DeltaBadge value={rateDelta} suffix="%" />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>
              Reps actively recording (2+ meetings/month)
            </div>
            {lastRate && (
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                {lastRate.active_reps} of {lastRate.total_reps} reps
              </div>
            )}
            <div style={{ marginTop: '10px' }}>
              <SparkBar data={recentRates} valueKey="pct" color="#2563eb" maxOverride={100} />
            </div>
          </div>

          {/* Avg talk ratio */}
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, color: talkRatioColor(lastTalk?.avg_internal_talk_pct) }}>
              {lastTalk?.avg_internal_talk_pct != null ? `${lastTalk.avg_internal_talk_pct}%` : '—'}
              <DeltaBadge value={talkDelta} suffix="%" />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>
              Avg internal talk ratio
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
              Target: 40–60% (customer-led conversations)
            </div>
            <div style={{ marginTop: '10px' }}>
              <SparkBar data={recentTalk} valueKey="avg_internal_talk_pct" color={talkRatioColor(lastTalk?.avg_internal_talk_pct)} maxOverride={100} />
            </div>
          </div>
        </div>

        {/* Yearly total + quarterly breakdown */}
        {(data.meetings_this_year != null || data.meetings_by_quarter?.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '16px', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            {/* Yearly total */}
            <div style={{ paddingRight: '16px', borderRight: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                {data.meetings_this_year?.toLocaleString() ?? '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                Total meetings {data.meetings_by_quarter?.[data.meetings_by_quarter.length - 1]?.quarter?.slice(-4) ?? new Date().getFullYear()}
              </div>
            </div>
            {/* Quarterly breakdown */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {(data.meetings_by_quarter || []).map((q) => (
                <div key={q.quarter} style={{ minWidth: '60px' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: q.count > 0 ? '#1e293b' : '#cbd5e1' }}>
                    {q.count > 0 ? q.count.toLocaleString() : '—'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{q.quarter}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team-level summary card (manager view) ───────────────────────────────────

export function TeamMeetingIntelligenceSummary({ teamIntel }) {
  if (!teamIntel?.team_summary) return null;
  const s = teamIntel.team_summary;

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-header">
        <h2 className="card-title">Meeting Intelligence</h2>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>this month vs last month</span>
      </div>
      <div className="card-body">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#7c3aed' }}>{s.meetings_this_month}</div>
            <div className="stat-label">
              Team meetings
              {s.meetings_last_month > 0 && (
                <span style={{
                  fontSize: '0.68rem', marginLeft: '4px', fontWeight: 600,
                  color: s.meetings_this_month >= s.meetings_last_month ? '#16a34a' : '#d97706',
                }}>
                  (was {s.meetings_last_month})
                </span>
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: talkRatioColor(s.avg_internal_talk_pct) }}>
              {s.avg_internal_talk_pct != null ? `${s.avg_internal_talk_pct}%` : '—'}
            </div>
            <div className="stat-label">Avg talk ratio</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#16a34a' }}>{s.active_reps}</div>
            <div className="stat-label">Active reps (2+ meetings)</div>
          </div>
          <div className="stat-card">
            <div
              className="stat-value"
              style={{ color: s.inactive_reps > 0 ? '#d97706' : '#94a3b8' }}
            >
              {s.inactive_reps}
            </div>
            <div className="stat-label" style={{ color: s.inactive_reps > 0 ? '#d97706' : undefined }}>
              {s.inactive_reps > 0 ? 'No meetings recorded' : 'Inactive reps'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Default export: smart wrapper that picks org vs team mode ────────────────

/**
 * MeetingIntelligencePanel
 *
 * Props:
 *   mode       'org' | 'team'
 *   token      Supabase access_token (string)
 *   teamIntel  Pre-fetched team intel data (for 'team' mode — avoids double fetch)
 */
export default function MeetingIntelligencePanel({ mode, token, teamIntel }) {
  if (mode === 'org') {
    return <OrgMeetingIntelligence token={token} />;
  }
  // 'team' mode uses pre-fetched data passed from Team.jsx
  return <TeamMeetingIntelligenceSummary teamIntel={teamIntel} />;
}

// ── Named exports for use in the rep performance table ──────────────────────
export { TalkPctBadge, talkRatioColor };
