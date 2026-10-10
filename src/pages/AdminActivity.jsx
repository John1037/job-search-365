import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import { supabase } from '../supabaseClient';

const ACTION_LABELS = {
  user_signed_up: 'User signed up',
  job_added: 'Job added',
  job_deleted: 'Job deleted',
  event_added: 'Event added',
  document_deleted: 'Document deleted',
  cv_built: 'CV built',
  cover_letter_composed: 'Cover letter composed',
  account_deleted: 'Account deleted',
};

// Fixed assignment, never reordered/cycled dynamically — the ordering
// itself is part of what makes a categorical palette colorblind-safe.
// Colors are the dataviz skill's reference 8-hue categorical palette,
// re-validated (not assumed) against this app's actual surfaces —
// #ffffff light / #16171d dark — via validate_palette.js before use.
// Defined as CSS custom properties (index.css) rather than hardcoded
// hex here, so they theme the same way every other color in this app
// does.
const ACTION_COLOR_VARS = {
  account_deleted: 'var(--chart-1)',
  cover_letter_composed: 'var(--chart-2)',
  cv_built: 'var(--chart-3)',
  document_deleted: 'var(--chart-4)',
  event_added: 'var(--chart-5)',
  job_added: 'var(--chart-6)',
  job_deleted: 'var(--chart-7)',
  user_signed_up: 'var(--chart-8)',
};

const RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function bucketForRange(rangeDays) {
  if (rangeDays === 'all' || rangeDays > 365) return 'month';
  if (rangeDays > 60) return 'week';
  return 'day';
}

function formatBucketLabel(isoString, bucket) {
  const date = new Date(isoString);
  if (bucket === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AdminActivity() {
  const navigate = useNavigate();
  const { permissionLevel } = useOutletContext();

  const [rangeDays, setRangeDays] = useState(30);
  const [actionFilter, setActionFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (permissionLevel && permissionLevel !== 'admin' && permissionLevel !== 'owner') {
      navigate('/main');
    }
  }, [permissionLevel, navigate]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const endDate = new Date();
      const startDate = new Date();
      if (rangeDays === 'all') {
        // activity_log has no meaningful data before this feature existed —
        // 5 years back is just "every row that could possibly exist".
        startDate.setFullYear(startDate.getFullYear() - 5);
      } else {
        startDate.setDate(startDate.getDate() - rangeDays);
      }

      const { data, error: rpcError } = await supabase.rpc('admin_activity_counts', {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        bucket: bucketForRange(rangeDays),
      });

      setLoading(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setRows(data ?? []);
    }

    load();
  }, [rangeDays]);

  const bucket = bucketForRange(rangeDays);

  // Breakdown always reflects every action type, regardless of the current
  // filter — it's the one view whose whole job is comparing types against
  // each other, so narrowing it to a single type would make it meaningless.
  const breakdownData = useMemo(() => {
    const totals = new Map();
    for (const row of rows) {
      totals.set(row.action, (totals.get(row.action) ?? 0) + Number(row.count));
    }
    return [...totals.entries()]
      .map(([action, total]) => ({
        action,
        label: ACTION_LABELS[action] ?? action,
        total,
        color: ACTION_COLOR_VARS[action] ?? 'var(--accent)',
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const filteredRows = useMemo(
    () => (actionFilter === 'all' ? rows : rows.filter((row) => row.action === actionFilter)),
    [rows, actionFilter],
  );

  const statTiles = useMemo(() => {
    if (actionFilter !== 'all') {
      const total = filteredRows.reduce((sum, row) => sum + Number(row.count), 0);
      return [{ label: ACTION_LABELS[actionFilter] ?? actionFilter, total }];
    }
    return breakdownData.map((d) => ({ label: d.label, total: d.total }));
  }, [actionFilter, filteredRows, breakdownData]);

  const grandTotal = statTiles.reduce((sum, tile) => sum + tile.total, 0);

  const timeSeriesData = useMemo(() => {
    const totals = new Map();
    for (const row of filteredRows) {
      const key = row.bucket_start;
      totals.set(key, (totals.get(key) ?? 0) + Number(row.count));
    }
    return [...totals.entries()]
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .map(([bucketStart, count]) => ({
        bucketStart,
        label: formatBucketLabel(bucketStart, bucket),
        count,
      }));
  }, [filteredRows, bucket]);

  const ChartComponent = timeSeriesData.length > 14 ? LineChart : BarChart;
  const SeriesComponent = timeSeriesData.length > 14 ? Line : Bar;

  return (
    <div className="page-content">
      <h1>Activity log</h1>

      <div className="admin-filters-row">
        <select
          className="profile-select"
          value={rangeDays}
          onChange={(e) => {
            const v = e.target.value;
            setRangeDays(v === 'all' ? 'all' : Number(v));
          }}
          aria-label="Time range"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          className="profile-select"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Action type"
        >
          <option value="all">All actions</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="button-outline"
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? 'Hide table' : 'View as table'}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty-list-hint">No activity logged in this range yet.</p>
      ) : (
        <>
          <div className="admin-stat-tiles">
            <div className="admin-stat-tile admin-stat-tile-total">
              <span className="admin-stat-tile-value">{grandTotal}</span>
              <span className="admin-stat-tile-label">
                {actionFilter === 'all' ? 'Total actions' : 'Total'}
              </span>
            </div>
            {actionFilter === 'all' &&
              statTiles.map((tile) => (
                <div key={tile.label} className="admin-stat-tile">
                  <span className="admin-stat-tile-value">{tile.total}</span>
                  <span className="admin-stat-tile-label">{tile.label}</span>
                </div>
              ))}
          </div>

          <section className="admin-chart-section">
            <h2>
              Activity over time
              {actionFilter !== 'all' ? ` — ${ACTION_LABELS[actionFilter]}` : ''}
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <ChartComponent data={timeSeriesData}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'var(--text)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text)',
                  }}
                />
                <SeriesComponent
                  dataKey="count"
                  name="Actions"
                  fill="var(--accent)"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  radius={timeSeriesData.length > 14 ? undefined : [4, 4, 0, 0]}
                  dot={timeSeriesData.length > 14 ? { r: 3, fill: 'var(--accent)' } : undefined}
                />
              </ChartComponent>
            </ResponsiveContainer>
          </section>

          {actionFilter === 'all' && (
            <section className="admin-chart-section">
              <h2>Breakdown by action type</h2>
              <ResponsiveContainer width="100%" height={Math.max(220, breakdownData.length * 36)}>
                <BarChart data={breakdownData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: 'var(--text)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: 'var(--text)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    width={160}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                    }}
                  />
                  <Legend
                    payload={breakdownData.map((d) => ({
                      value: d.label,
                      type: 'square',
                      color: d.color,
                    }))}
                    wrapperStyle={{ fontSize: 12, color: 'var(--text)' }}
                  />
                  <Bar dataKey="total" name="Count" radius={[0, 4, 4, 0]}>
                    {breakdownData.map((d) => (
                      <Cell key={d.action} fill={d.color} />
                    ))}
                    <LabelList
                      dataKey="total"
                      position="right"
                      fill="var(--text)"
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {showTable && (
            <section className="admin-chart-section">
              <h2>Table view</h2>
              <table className="admin-activity-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownData
                    .filter((d) => actionFilter === 'all' || d.action === actionFilter)
                    .map((d) => (
                      <tr key={d.action}>
                        <td>{d.label}</td>
                        <td>{d.total}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default AdminActivity;
