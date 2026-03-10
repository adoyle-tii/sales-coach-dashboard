import { useEffect, useState } from 'react';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';
// v5 — rep list drill-down on engagement panels

// ── Expandable rep name list ─────────────────────────────────────────────────
function RepListDrawer({ list, label, color, emptyText }) {
  const [open, setOpen] = useState(false);
  if (!list || list.length === 0) return null;
  return (
    <div style={{ marginTop: '4px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: '0.65rem', fontWeight: 600, color, background: 'none', border: 'none',
          padding: '0', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px',
        }}
      >
        {open ? '▲ hide' : `▼ show ${list.length} rep${list.length !== 1 ? 's' : ''}`}
      </button>
      {open && (
        <div style={{
          marginTop: '6px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
          padding: '8px 10px', maxHeight: '180px', overflowY: 'auto',
        }}>
          {list.length === 0
            ? <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{emptyText || 'None'}</span>
            : list.map((r) => (
              <div key={r.email} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '0.72rem', color: '#1e293b', fontWeight: 500 }}>{r.name}</span>
                {r.count != null && (
                  <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                    {r.count} mtg{r.count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Mini bar sparkline (6-month trend) ──────────────────────────────────────

// labelFn(dataPoint, index) → string|null — shown above each bar in tiny text.
// Pass null/undefined for no labels.
function SparkBar({ data, valueKey, color = '#7c3aed', maxOverride, labelFn }) {
  if (!data || data.length === 0) return null;
  const values = data.map((d) => d[valueKey] ?? 0);
  const max = maxOverride ?? Math.max(...values, 1);
  const n = values.length;
  const hasLabels = typeof labelFn === 'function';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: '3px' }}>
      {values.map((v, i) => {
        const isLast = i === n - 1;
        const label = hasLabels ? labelFn(data[i], i) : null;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Bar label — tiny text above the bar */}
            {label != null ? (
              <div style={{
                fontSize: '0.52rem',
                fontWeight: isLast ? 700 : 500,
                color: isLast ? color : '#94a3b8',
                lineHeight: 1.1,
                textAlign: 'center',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </div>
            ) : (
              hasLabels && <div style={{ height: '0.52rem', marginBottom: '2px' }} />
            )}
            {/* The bar itself */}
            <div
              title={`${data[i].month}: ${v}`}
              style={{
                width: '100%',
                background: isLast ? color : `${color}66`,
                height: `${Math.max(4, Math.round((v / max) * 32))}px`,
                borderRadius: '2px 2px 0 0',
                transition: 'height 0.3s',
                alignSelf: 'flex-end',
              }}
            />
          </div>
        );
      })}
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

  // All three KPIs use MTD vs same period last month — apples to apples.
  const rateArr  = data.active_rep_rate_by_month || [];
  const talkArr  = data.avg_talk_ratio_by_month || [];
  const mtgArr   = data.meetings_by_month || [];

  // 5 bars: drop oldest month for more breathing room; last bar = current (MTD)
  const recentMonths = mtgArr.slice(-5);
  const recentRates  = rateArr.slice(-5);
  const recentTalk   = talkArr.slice(-5);

  // MTD values — all like-for-like (same day range this month vs last month)
  const mtdThis     = data.mtd_this_month          ?? null;
  const mtdLast     = data.mtd_last_month          ?? null;
  const rateThis    = data.mtd_rep_rate_this_month ?? null;
  const rateLast    = data.mtd_rep_rate_last_month ?? null;
  const talkThis    = data.mtd_talk_ratio_this_month ?? null;
  const talkLast    = data.mtd_talk_ratio_last_month ?? null;

  // Human-readable period labels e.g. "Mar 1–10" vs "Feb 1–10"
  const now = new Date();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const thisMonthName = monthNames[now.getUTCMonth()];
  const lastMonthName = monthNames[now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1];
  const dayOfMonth = now.getUTCDate();
  const thisPeriod = `${thisMonthName} 1–${dayOfMonth}`;
  const lastPeriod = `${lastMonthName} 1–${dayOfMonth}`;

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

  const mtgDelta  = delta(mtdThis, mtdLast);
  const rateDelta = delta(rateThis, rateLast);
  const talkDelta = delta(talkThis, talkLast);

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
          {/* Reusable MTD comparison tile layout */}
          {[
            {
              label: 'Meetings recorded',
              thisVal: mtdThis != null ? String(mtdThis) : '—',
              lastVal: mtdLast != null ? String(mtdLast) : '—',
              delta: mtgDelta, deltaSuffix: '',
              color: '#1e293b', spark: recentMonths, sparkKey: 'count', sparkColor: '#7c3aed',
              subLabel: null,
              labelFn: (d) => d.count != null ? String(d.count) : null,
            },
            {
              label: 'Reps actively recording (2+ meetings)',
              thisVal: rateThis != null ? `${rateThis}%` : '—',
              lastVal: rateLast != null ? `${rateLast}%` : '—',
              delta: rateDelta, deltaSuffix: '%',
              color: '#1e293b', spark: recentRates, sparkKey: 'pct', sparkColor: '#2563eb',
              subLabel: null,
              labelFn: (d) => d.active_reps != null && d.pct != null ? `${d.active_reps} · ${d.pct}%` : null,
            },
            {
              label: 'Avg internal talk ratio',
              thisVal: talkThis != null ? `${talkThis}%` : '—',
              lastVal: talkLast != null ? `${talkLast}%` : '—',
              delta: talkDelta, deltaSuffix: '%',
              color: talkRatioColor(talkThis), spark: recentTalk, sparkKey: 'avg_internal_talk_pct', sparkColor: talkRatioColor(talkThis),
              subLabel: 'Target: 40–60% · available after scraping',
              labelFn: null,
            },
          ].map(({ label, thisVal, lastVal, delta: d, deltaSuffix, color, spark, sparkKey, sparkColor, subLabel, labelFn }) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              {/* Title */}
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>{label}</div>
              {/* Label/value row — same 5-column grid as the sparkbar for pixel-perfect alignment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', marginBottom: '6px' }}>
                {/* Prior period: spans cols 1-4, right-aligned to sit above bar 4 */}
                <div style={{ gridColumn: '1 / 5', textAlign: 'right', paddingRight: '2px' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#94a3b8', marginBottom: '1px', whiteSpace: 'nowrap' }}>{lastPeriod}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#cbd5e1', lineHeight: 1.1 }}>{lastVal}</div>
                </div>
                {/* Current period: col 5, right-aligned above the current (last) bar */}
                <div style={{ gridColumn: '5 / 6', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', marginBottom: '1px', whiteSpace: 'nowrap' }}>{thisPeriod}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1.1 }}>{thisVal}</div>
                  <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'flex-end' }}><DeltaBadge value={d} suffix={deltaSuffix} /></div>
                </div>
              </div>
              {subLabel && <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'right', marginBottom: '4px' }}>{subLabel}</div>}
              {/* Sparkbar fills the full width — prior bars align under prior value, current bar under current value */}
              <SparkBar data={spark} valueKey={sparkKey} color={sparkColor} maxOverride={sparkKey === 'pct' || sparkKey === 'avg_internal_talk_pct' ? 100 : undefined} labelFn={labelFn} />
            </div>
          ))}
        </div>

        {/* Rep engagement panels — MTD breakdown + YTD */}
        {(data.total_team_reps != null) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>

            {/* Panel 1 — This month (MTD) breakdown */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#15803d', marginBottom: '10px' }}>
                Rep activity — {thisPeriod}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{data.mtd_active_reps ?? 0}</span>
                    <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>active<br/>(2+ meetings)</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 8px', fontWeight: 600 }}>of {data.total_team_reps}</span>
                </div>
                <RepListDrawer list={data.mtd_active_rep_list} color="#16a34a" />
                <div style={{ height: '1px', background: '#bbf7d0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#d97706', lineHeight: 1 }}>{data.mtd_low_reps ?? 0}</span>
                  <span style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 500 }}>low activity<br/>(1 meeting)</span>
                </div>
                <RepListDrawer list={data.mtd_low_rep_list} color="#d97706" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#dc2626', lineHeight: 1 }}>{data.mtd_inactive_reps ?? 0}</span>
                  <span style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 500 }}>no meetings<br/>recorded</span>
                </div>
                <RepListDrawer list={data.mtd_inactive_rep_list} color="#dc2626" />
              </div>
            </div>

            {/* Panel 2 — YTD rep engagement */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1d4ed8', marginBottom: '10px' }}>
                Rep engagement — YTD {data.current_year ?? new Date().getFullYear()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>{data.reps_with_meetings_ytd ?? '—'}</span>
                    <span style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600 }}>hosting<br/>meetings YTD</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 8px', fontWeight: 600 }}>of {data.total_team_reps}</span>
                </div>
              {data.total_team_reps > 0 && data.reps_with_meetings_ytd != null && (
                <div style={{ height: '6px', borderRadius: '3px', background: '#bfdbfe', overflow: 'hidden', margin: '2px 0' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px', background: '#2563eb',
                    width: `${Math.round((data.reps_with_meetings_ytd / data.total_team_reps) * 100)}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              )}
              <div style={{ height: '1px', background: '#bfdbfe' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: (data.reps_no_meetings_ytd ?? 0) > 0 ? '#dc2626' : '#94a3b8', lineHeight: 1 }}>{data.reps_no_meetings_ytd ?? '—'}</span>
                <span style={{ fontSize: '0.72rem', color: (data.reps_no_meetings_ytd ?? 0) > 0 ? '#991b1b' : '#94a3b8', fontWeight: 500 }}>not hosted<br/>a meeting {data.current_year ?? ''}</span>
              </div>
              <RepListDrawer list={data.reps_no_meetings_ytd_list} color="#dc2626" />
              </div>
            </div>

          </div>
        )}

        {/* YTD total + quarterly breakdown */}
        {(data.ytd_meetings != null || data.meetings_by_quarter?.length > 0) && (
          <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0', alignItems: 'stretch' }}>
              {/* YTD stat */}
              <div style={{ paddingRight: '20px', marginRight: '20px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', marginBottom: '4px' }}>
                  Year to Date ({data.current_year ?? new Date().getFullYear()})
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                  {data.ytd_meetings?.toLocaleString() ?? '—'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px' }}>meetings recorded</div>
              </div>
              {/* Quarterly breakdown */}
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '8px' }}>
                  Quarterly Breakdown
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(data.meetings_by_quarter || []).map((q) => (
                    <div
                      key={q.quarter_key ?? q.quarter}
                      style={{
                        flex: '1', minWidth: '64px', padding: '8px 10px',
                        background: q.is_current ? '#ede9fe' : '#fff',
                        border: `1px solid ${q.is_current ? '#7c3aed' : '#e2e8f0'}`,
                        borderRadius: '6px', textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: q.count > 0 ? (q.is_current ? '#7c3aed' : '#1e293b') : '#cbd5e1' }}>
                        {q.count > 0 ? q.count.toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: q.is_current ? '#7c3aed' : '#94a3b8', marginTop: '2px' }}>
                        {q.quarter}{q.is_current ? ' ✦' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

  const now = new Date();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const thisMonthName = monthNames[now.getUTCMonth()];
  const lastMonthName = monthNames[now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1];
  const dayOfMonth = now.getUTCDate();
  const thisPeriod = `${thisMonthName} 1–${dayOfMonth}`;
  const lastPeriod  = `${lastMonthName} 1–${dayOfMonth}`;

  function TeamDeltaBadge({ value, suffix = '' }) {
    if (value == null) return null;
    const up = value > 0, zero = value === 0;
    return (
      <span style={{
        fontSize: '0.7rem', fontWeight: 700, padding: '1px 5px', borderRadius: '99px',
        background: zero ? '#f1f5f9' : up ? '#dcfce7' : '#fee2e2',
        color: zero ? '#94a3b8' : up ? '#16a34a' : '#dc2626',
      }}>
        {zero ? '–' : `${up ? '+' : ''}${typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}${suffix}`}
      </span>
    );
  }

  const recentMonths = (s.meetings_by_month || []).slice(-5);
  const recentRates  = (s.active_rep_rate_by_month || []).slice(-5);
  const recentTalk   = (s.avg_talk_ratio_by_month || []).slice(-5);

  const teamTiles = [
    {
      label: 'Team meetings recorded',
      thisVal: s.mtd_this_month != null ? String(s.mtd_this_month) : '—',
      lastVal: s.mtd_last_month != null ? String(s.mtd_last_month) : '—',
      delta: s.mtd_this_month != null && s.mtd_last_month != null ? s.mtd_this_month - s.mtd_last_month : null,
      suffix: '', color: '#1e293b',
      spark: recentMonths, sparkKey: 'count', sparkColor: '#7c3aed',
      labelFn: (d) => d.count != null ? String(d.count) : null,
    },
    {
      label: 'Reps actively recording (2+)',
      thisVal: s.mtd_rep_rate_this_month != null ? `${s.mtd_rep_rate_this_month}%` : '—',
      lastVal: s.mtd_rep_rate_last_month != null ? `${s.mtd_rep_rate_last_month}%` : '—',
      delta: s.mtd_rep_rate_this_month != null && s.mtd_rep_rate_last_month != null ? Math.round((s.mtd_rep_rate_this_month - s.mtd_rep_rate_last_month) * 10) / 10 : null,
      suffix: '%', color: '#1e293b',
      spark: recentRates, sparkKey: 'pct', sparkColor: '#2563eb',
      labelFn: (d) => d.active_reps != null && d.pct != null ? `${d.active_reps} · ${d.pct}%` : null,
    },
    {
      label: 'Avg internal talk ratio',
      thisVal: s.mtd_talk_ratio_this_month != null ? `${s.mtd_talk_ratio_this_month}%` : '—',
      lastVal: s.mtd_talk_ratio_last_month != null ? `${s.mtd_talk_ratio_last_month}%` : '—',
      delta: s.mtd_talk_ratio_this_month != null && s.mtd_talk_ratio_last_month != null ? Math.round((s.mtd_talk_ratio_this_month - s.mtd_talk_ratio_last_month) * 10) / 10 : null,
      suffix: '%', color: talkRatioColor(s.mtd_talk_ratio_this_month),
      subLabel: 'Target: 40–60% · available after scraping',
      spark: recentTalk, sparkKey: 'avg_internal_talk_pct', sparkColor: talkRatioColor(s.mtd_talk_ratio_this_month),
      labelFn: null,
    },
  ];

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-header">
        <h2 className="card-title">Meeting Intelligence</h2>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{thisPeriod} vs {lastPeriod}</span>
      </div>
      <div className="card-body">
        {/* MTD comparison tiles — same grid layout as org view */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
          {teamTiles.map(({ label, thisVal, lastVal, delta, suffix, color, subLabel, spark, sparkKey, sparkColor, labelFn }) => (
            <div key={label} style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>{label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', marginBottom: '6px' }}>
                <div style={{ gridColumn: '1 / 5', textAlign: 'right', paddingRight: '2px' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#94a3b8', marginBottom: '1px', whiteSpace: 'nowrap' }}>{lastPeriod}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#cbd5e1', lineHeight: 1.1 }}>{lastVal}</div>
                </div>
                <div style={{ gridColumn: '5 / 6', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', marginBottom: '1px', whiteSpace: 'nowrap' }}>{thisPeriod}</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1.1 }}>{thisVal}</div>
                  <div style={{ marginTop: '3px', display: 'flex', justifyContent: 'flex-end' }}><TeamDeltaBadge value={delta} suffix={suffix} /></div>
                </div>
              </div>
              {subLabel && <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'right', marginBottom: '4px' }}>{subLabel}</div>}
              <SparkBar data={spark} valueKey={sparkKey} color={sparkColor} maxOverride={sparkKey === 'pct' || sparkKey === 'avg_internal_talk_pct' ? 100 : undefined} labelFn={labelFn} />
            </div>
          ))}
        </div>

        {/* Rep engagement panels — MTD breakdown + YTD */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>

          {/* Panel 1 — This month (MTD) breakdown */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#15803d', marginBottom: '10px' }}>
              Rep activity — {thisPeriod}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {/* 2+ meetings */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>
                    {s.mtd_active_reps ?? s.active_reps ?? 0}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>active<br/>(2+ meetings)</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 8px', fontWeight: 600 }}>
                  of {s.total_team_reps ?? '—'}
                </span>
              </div>
              <RepListDrawer list={s.mtd_active_rep_list} color="#16a34a" />
              {/* Divider */}
              <div style={{ height: '1px', background: '#bbf7d0' }} />
              {/* 1 meeting */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#d97706', lineHeight: 1 }}>
                  {s.mtd_low_reps ?? 0}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 500 }}>low activity<br/>(1 meeting)</span>
              </div>
              <RepListDrawer list={s.mtd_low_rep_list} color="#d97706" />
              {/* 0 meetings */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#dc2626', lineHeight: 1 }}>
                  {s.mtd_inactive_reps ?? s.inactive_reps ?? 0}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#991b1b', fontWeight: 500 }}>no meetings<br/>recorded</span>
              </div>
              <RepListDrawer list={s.mtd_inactive_rep_list} color="#dc2626" />
            </div>
          </div>

          {/* Panel 2 — YTD rep engagement */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1d4ed8', marginBottom: '10px' }}>
              Rep engagement — YTD {s.current_year ?? new Date().getFullYear()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {/* Reps with any meeting YTD */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb', lineHeight: 1 }}>
                    {s.reps_with_meetings_ytd ?? '—'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600 }}>hosting<br/>meetings YTD</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '99px', padding: '2px 8px', fontWeight: 600 }}>
                  of {s.total_team_reps ?? '—'}
                </span>
              </div>
              {/* Progress bar */}
              {s.total_team_reps > 0 && s.reps_with_meetings_ytd != null && (
                <div style={{ height: '6px', borderRadius: '3px', background: '#bfdbfe', overflow: 'hidden', margin: '2px 0' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px', background: '#2563eb',
                    width: `${Math.round((s.reps_with_meetings_ytd / s.total_team_reps) * 100)}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              )}
              <div style={{ height: '1px', background: '#bfdbfe' }} />
              {/* Reps with zero meetings YTD */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: s.reps_no_meetings_ytd > 0 ? '#dc2626' : '#94a3b8', lineHeight: 1 }}>
                  {s.reps_no_meetings_ytd ?? '—'}
                </span>
                <span style={{ fontSize: '0.72rem', color: s.reps_no_meetings_ytd > 0 ? '#991b1b' : '#94a3b8', fontWeight: 500 }}>
                  not hosted<br/>a meeting {s.current_year ?? ''}
                </span>
              </div>
              <RepListDrawer list={s.reps_no_meetings_ytd_list} color="#dc2626" />
            </div>
          </div>

        </div>

        {/* YTD total + quarterly breakdown */}
        {(s.ytd_meetings != null || s.meetings_by_quarter?.length > 0) && (
          <div style={{ padding: '14px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0', alignItems: 'stretch' }}>
              <div style={{ paddingRight: '20px', marginRight: '20px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#7c3aed', marginBottom: '4px' }}>
                  Year to Date ({s.current_year ?? new Date().getFullYear()})
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>
                  {s.ytd_meetings?.toLocaleString() ?? '—'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px' }}>team meetings recorded</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '8px' }}>
                  Quarterly Breakdown
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(s.meetings_by_quarter || []).map((q) => (
                    <div
                      key={q.quarter_key ?? q.quarter}
                      style={{
                        flex: '1', minWidth: '64px', padding: '8px 10px',
                        background: q.is_current ? '#ede9fe' : '#fff',
                        border: `1px solid ${q.is_current ? '#7c3aed' : '#e2e8f0'}`,
                        borderRadius: '6px', textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: q.count > 0 ? (q.is_current ? '#7c3aed' : '#1e293b') : '#cbd5e1' }}>
                        {q.count > 0 ? q.count.toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: q.is_current ? '#7c3aed' : '#94a3b8', marginTop: '2px' }}>
                        {q.quarter}{q.is_current ? ' ✦' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
