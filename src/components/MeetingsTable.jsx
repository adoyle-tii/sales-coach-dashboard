import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://sales-skills-assessment-engine.salesenablement.workers.dev';

const PRESETS = [
  { value: '', label: 'All time' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'current_quarter', label: 'Current quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
];

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (newest)' },
  { value: 'date_asc', label: 'Date (oldest)' },
  { value: 'meeting_name', label: 'Meeting name' },
  { value: 'account_name', label: 'Account' },
];

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

export default function MeetingsTable({ userId, basePath = '/my', compact = false }) {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(0);
  const limit = 25;

  const debouncedSearch = useDebounce(search, 300);

  const fetchMeetings = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      params.set('sort', sort);
      if (preset) params.set('preset', preset);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = session?.access_token;
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

      const res = await fetch(
        `${WORKER_URL}/hs/meeting-intelligence/rep/${encodeURIComponent(userId)}?${params}`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setMeetings(data.meetings || []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e.message);
      setMeetings([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [userId, page, sort, preset, from, to, debouncedSearch]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const meetingDetailPath = (meetingId) => {
    if (basePath === '/my') return `/my/meeting/${meetingId}`;
    const teamUserId = basePath.replace('/team/', '').replace(/\/?$/, '');
    return `/team/${teamUserId}/meeting/${meetingId}`;
  };

  const formatDate = (d) => {
    if (!d) return '—';
    try {
      const date = new Date(d);
      return isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  const talkPctColor = (pct) => {
    if (pct == null) return '#94a3b8';
    if (pct >= 40 && pct <= 60) return '#16a34a';
    if (pct >= 30 && pct < 40) return '#d97706';
    if (pct > 60 && pct <= 70) return '#d97706';
    return '#dc2626';
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="card section">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <h2 className="card-title">Meetings</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select
            value={preset}
            onChange={(e) => { setPreset(e.target.value); setPage(0); }}
            style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--slate-200)' }}
          >
            {PRESETS.map((p) => (
              <option key={p.value || 'all'} value={p.value}>{p.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPreset(''); setPage(0); }}
            style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--slate-200)' }}
            placeholder="From"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPreset(''); setPage(0); }}
            style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--slate-200)' }}
            placeholder="To"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search meeting, account, host…"
            style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--slate-200)', minWidth: '180px' }}
          />
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(0); }}
            style={{ fontSize: '0.8rem', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--slate-200)' }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', borderLeft: '4px solid #dc2626', borderRadius: '0 8px 8px 0', margin: '0 16px 12px', fontSize: '0.875rem', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="card-body">
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-icon">📅</div>
            <div>No meetings found.</div>
            <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>Meetings you attend will appear here once data is imported and scraped.</div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--slate-200)', background: 'var(--slate-50)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Meeting</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Account</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Host</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Talk %</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--slate-600)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr
                    key={m.hs_meeting_id}
                    style={{ borderBottom: '1px solid var(--slate-200)', cursor: 'pointer' }}
                    onClick={() => navigate(meetingDetailPath(m.hs_meeting_id))}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--slate-600)', whiteSpace: 'nowrap' }}>{formatDate(m.meeting_date)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <Link to={meetingDetailPath(m.hs_meeting_id)} className="text-link" onClick={(e) => e.stopPropagation()} style={{ fontWeight: 500 }}>
                        {m.meeting_name || `Meeting ${m.hs_meeting_id}`}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--slate-600)' }}>{m.account_name || '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--slate-600)' }}>{m.scraped_host_name || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {m.talk_pct != null ? (
                        <span style={{ fontWeight: 600, color: talkPctColor(m.talk_pct) }}>{m.talk_pct}%</span>
                      ) : (
                        <span style={{ color: 'var(--slate-400)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: m.scrape_status === 'completed' ? '#dcfce7' : '#fef3c7',
                        color: m.scrape_status === 'completed' ? '#16a34a' : '#d97706',
                        fontWeight: 500,
                      }}>
                        {m.scrape_status === 'completed' ? 'Scraped' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--slate-200)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                {total} meeting{total !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--slate-200)', background: 'white', cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}
                >
                  Previous
                </button>
                <span style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--slate-600)' }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid var(--slate-200)', background: 'white', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', opacity: page >= totalPages - 1 ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
