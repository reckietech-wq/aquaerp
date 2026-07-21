import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, TrendingUp, Package, Truck, Users, Download,
  ChevronUp, ChevronDown, ChevronsUpDown, Loader2, AlertCircle,
  IndianRupee, CheckCircle2, Clock, Search, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// ─── constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_FULL = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtRupee(n) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n) {
  return Number(n).toLocaleString('en-IN');
}

function toLocalDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── date range helpers ───────────────────────────────────────────────────────

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function getPresets() {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();

  const thisMonthStart = new Date(y, m, 1);
  const thisMonthEnd   = new Date(y, m + 1, 0);

  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd   = new Date(y, m, 0);

  const last3Start     = new Date(y, m - 2, 1);

  return [
    { label: 'This Month',    from: toISO(thisMonthStart), to: toISO(thisMonthEnd) },
    { label: 'Last Month',    from: toISO(lastMonthStart), to: toISO(lastMonthEnd) },
    { label: 'Last 3 Months', from: toISO(last3Start),     to: toISO(thisMonthEnd) },
  ];
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows, columns, filename) {
  const header = columns.map(c => c.label).join(',');
  const body   = rows.map(row =>
    columns.map(c => {
      const v = String(c.value(row)).replace(/,/g, ' ');
      return v.includes('"') ? `"${v}"` : v;
    }).join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── SortHeader ───────────────────────────────────────────────────────────────

function SortHeader({ label, field, sort, onSort, align = 'left' }) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-blue-900 transition-colors ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sort.asc ? <ChevronUp size={12} className="text-blue-900" /> : <ChevronDown size={12} className="text-blue-900" />
          : <ChevronsUpDown size={11} className="text-slate-300" />}
      </span>
    </th>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon: Icon, color = 'blue', loading }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-900 text-white',    val: 'text-blue-900' },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-600 text-white',   val: 'text-green-700' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-600 text-white',  val: 'text-purple-700' },
    amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-500 text-white',   val: 'text-amber-700' },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} rounded-2xl p-5 flex items-start gap-4`}>
      <div className={`w-10 h-10 rounded-xl ${c.icon} flex items-center justify-center shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
        {loading ? (
          <div className="h-6 bg-white/60 rounded-lg w-24 mt-1.5 animate-pulse" />
        ) : (
          <p className={`text-xl font-bold mt-0.5 truncate ${c.val}`}>{value}</p>
        )}
        {sub && !loading && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── useSort hook ─────────────────────────────────────────────────────────────

function useSort(data, defaultField, defaultAsc = false) {
  const [sort, setSort] = useState({ field: defaultField, asc: defaultAsc });

  const sorted = useMemo(() => {
    if (!data?.length) return [];
    return [...data].sort((a, b) => {
      const av = a[sort.field] ?? 0;
      const bv = b[sort.field] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sort.asc ? cmp : -cmp;
    });
  }, [data, sort]);

  function onSort(field) {
    setSort(s => ({ field, asc: s.field === field ? !s.asc : false }));
  }

  return { sorted, sort, onSort };
}

// ─── DriverTable ──────────────────────────────────────────────────────────────

function DriverTable({ data, loading }) {
  const { sorted, sort, onSort } = useSort(data, 'bottlesDelivered');

  function handleExport() {
    exportCSV(sorted, [
      { label: 'Driver',           value: r => r.driverName },
      { label: 'Route',            value: r => r.route },
      { label: 'Total Clients',    value: r => r.totalClients },
      { label: 'Deliveries',       value: r => r.deliveryCount },
      { label: 'Bottles',          value: r => r.bottlesDelivered },
      { label: 'Revenue (Rs.)',    value: r => Number(r.revenue).toFixed(2) },
      { label: 'Collection Rate%', value: r => r.collectionRate },
    ], 'driver-report.csv');
    toast.success('Driver report exported');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-blue-900" />
          <h2 className="font-bold text-slate-800">Driver-wise Report</h2>
          {!loading && <span className="text-xs text-slate-400 ml-1">({data?.length ?? 0} drivers)</span>}
        </div>
        <button onClick={handleExport} disabled={!data?.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <SortHeader label="Driver"           field="driverName"       sort={sort} onSort={onSort} />
              <SortHeader label="Route"            field="route"            sort={sort} onSort={onSort} />
              <SortHeader label="Clients"          field="totalClients"     sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Deliveries"       field="deliveryCount"    sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Bottles"          field="bottlesDelivered" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Revenue"          field="revenue"          sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Share %"          field="collectionRate"   sort={sort} onSort={onSort} align="center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-100 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400 text-sm">
                  No driver data for this period
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr key={row.driverId} className={`hover:bg-slate-50/60 transition-colors ${i === 0 ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                        {row.driverName[0]?.toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-800">{row.driverName}</span>
                      {i === 0 && <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">Top</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">Route {row.route}</td>
                  <td className="px-4 py-3 text-center font-medium text-slate-700">{row.totalClients}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{fmtNum(row.deliveryCount)}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-800">{fmtNum(row.bottlesDelivered)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtRupee(row.revenue)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${row.collectionRate}%` }} />
                      </div>
                      <span className="text-xs font-medium text-slate-500">{row.collectionRate}%</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ClientTable ──────────────────────────────────────────────────────────────

function ClientTable({ data, loading }) {
  const [search, setSearch] = useState('');
  const { sorted, sort, onSort } = useSort(data, 'totalBottles');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(r =>
      r.clientName.toLowerCase().includes(q) ||
      r.driverName.toLowerCase().includes(q) ||
      r.route.toLowerCase().includes(q)
    );
  }, [sorted, search]);

  function handleExport() {
    exportCSV(filtered, [
      { label: 'Client',          value: r => r.clientName },
      { label: 'Driver',          value: r => r.driverName },
      { label: 'Route',           value: r => r.route },
      { label: 'Deliveries',      value: r => r.deliveryCount },
      { label: 'Total Bottles',   value: r => r.totalBottles },
      { label: 'Total Billed',    value: r => Number(r.totalBilled).toFixed(2) },
      { label: 'Paid',            value: r => Number(r.totalPaid).toFixed(2) },
      { label: 'Outstanding',     value: r => Number(r.outstanding).toFixed(2) },
    ], 'client-report.csv');
    toast.success('Client report exported');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-blue-900" />
          <h2 className="font-bold text-slate-800">Client-wise Report</h2>
          {!loading && <span className="text-xs text-slate-400 ml-1">({data?.length ?? 0} clients)</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 w-36"
            />
          </div>
          <button onClick={handleExport} disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <SortHeader label="Client"      field="clientName"   sort={sort} onSort={onSort} />
              <SortHeader label="Driver"      field="driverName"   sort={sort} onSort={onSort} />
              <SortHeader label="Route"       field="route"        sort={sort} onSort={onSort} />
              <SortHeader label="Deliveries"  field="deliveryCount" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Bottles"     field="totalBottles" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Billed"      field="totalBilled"  sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Paid"        field="totalPaid"    sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Outstanding" field="outstanding"  sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400 text-sm">
                  {search ? 'No clients match your search' : 'No client data for this period'}
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr key={row.clientId}
                  className={`hover:bg-slate-50/60 transition-colors ${row.hasUnpaid ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.hasUnpaid && (
                        <span title="Has outstanding balance">
                          <AlertCircle size={13} className="text-red-400 shrink-0" />
                        </span>
                      )}
                      <span className={`font-semibold ${row.hasUnpaid ? 'text-red-700' : 'text-slate-800'}`}>
                        {row.clientName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{row.driverName}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{row.route}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{row.deliveryCount}</td>
                  <td className="px-4 py-3 text-center font-semibold text-slate-800">{fmtNum(row.totalBottles)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtRupee(row.totalBilled)}</td>
                  <td className="px-4 py-3 text-right text-green-700 font-medium">{fmtRupee(row.totalPaid)}</td>
                  <td className="px-4 py-3 text-right">
                    {row.outstanding > 0 ? (
                      <span className="font-bold text-red-600">{fmtRupee(row.outstanding)}</span>
                    ) : (
                      <span className="text-green-600 font-medium flex items-center justify-end gap-1">
                        <CheckCircle2 size={12} /> Cleared
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MonthlyTrendTable ────────────────────────────────────────────────────────

function MonthlyTrendTable({ data, loading }) {
  const maxBottles = useMemo(() => Math.max(...(data?.map(r => r.bottles) ?? [1]), 1), [data]);
  const maxRev     = useMemo(() => Math.max(...(data?.map(r => r.revenue) ?? [1]), 1), [data]);

  function handleExport() {
    exportCSV(data, [
      { label: 'Month',          value: r => `${MONTH_FULL[r.month]} ${r.year}` },
      { label: 'Deliveries',     value: r => r.deliveries },
      { label: 'Total Bottles',  value: r => r.bottles },
      { label: 'Revenue (Rs.)',  value: r => Number(r.revenue).toFixed(2) },
      { label: 'Clients Served', value: r => r.clientsServed },
    ], 'monthly-trend.csv');
    toast.success('Trend report exported');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-blue-900" />
          <h2 className="font-bold text-slate-800">Monthly Trend</h2>
          <span className="text-xs text-slate-400 ml-1">(last 6 months)</span>
        </div>
        <button onClick={handleExport} disabled={!data?.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors">
          <Download size={13} /> CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Month</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Deliveries</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ minWidth: 160 }}>Bottles</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ minWidth: 180 }}>Revenue</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Clients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : !data?.length ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">No trend data</td></tr>
            ) : (
              data.map((row, i) => {
                const bottlePct = Math.round((row.bottles / maxBottles) * 100);
                const revPct    = Math.round((row.revenue / maxRev) * 100);
                const isLatest  = i === data.length - 1;
                return (
                  <tr key={`${row.month}-${row.year}`} className={`hover:bg-slate-50/60 ${isLatest ? 'bg-blue-50/20' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">
                        {MONTH_FULL[row.month]} {row.year}
                      </span>
                      {isLatest && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-700">{fmtNum(row.deliveries)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${bottlePct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 w-10 text-right">{fmtNum(row.bottles)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full" style={{ width: `${revPct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 w-20 text-right">{fmtRupee(row.revenue)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">{row.clientsServed}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ReportsPage ──────────────────────────────────────────────────────────────

const PRESETS = getPresets();

export default function ReportsPage() {
  const [preset, setPreset]     = useState(0);             // 0,1,2 = preset; 3 = custom
  const [fromDate, setFromDate] = useState(PRESETS[0].from);
  const [toDate, setToDate]     = useState(PRESETS[0].to);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);

  const activePeriod = useMemo(() => {
    if (preset < 3) return { from: PRESETS[preset].from, to: PRESETS[preset].to };
    return { from: fromDate, to: toDate };
  }, [preset, fromDate, toDate]);

  const fetchReport = useCallback(async () => {
    if (!activePeriod.from || !activePeriod.to) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/reports/summary?from=${activePeriod.from}&to=${activePeriod.to}`);
      setData(res.data);
    } catch {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [activePeriod.from, activePeriod.to]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  function handlePreset(idx) {
    setPreset(idx);
    if (idx < 3) {
      setFromDate(PRESETS[idx].from);
      setToDate(PRESETS[idx].to);
    }
  }

  const s = data?.summary;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {loading ? 'Loading…' : data
              ? `${toLocalDate(data.period.from)} — ${toLocalDate(data.period.to)}`
              : 'Select a period'}
          </p>
        </div>
        <button onClick={fetchReport} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-60 transition-colors">
          <BarChart3 size={15} className={loading ? 'animate-pulse' : ''} /> Refresh
        </button>
      </div>

      {/* ── Date range filter ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <Calendar size={15} className="text-slate-400 shrink-0" />
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => handlePreset(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                preset === i
                  ? 'bg-blue-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPreset(3)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              preset === 3
                ? 'bg-blue-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Custom Range
          </button>
        </div>

        {preset === 3 && (
          <div className="flex items-center gap-2 ml-1">
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
            <span className="text-slate-400 text-sm">to</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={e => setToDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>
        )}
      </div>

      {/* ── Summary stat cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={s ? fmtRupee(s.totalRevenue) : '—'}
          sub={s ? `Collected: ${fmtRupee(s.paidRevenue)}` : undefined}
          icon={IndianRupee}
          color="blue"
          loading={loading}
        />
        <StatCard
          title="Bottles Delivered"
          value={s ? fmtNum(s.totalBottles) : '—'}
          sub={s ? `${s.totalDeliveries} deliveries` : undefined}
          icon={Package}
          color="purple"
          loading={loading}
        />
        <StatCard
          title="Most Active Driver"
          value={data?.mostActiveDriver?.driverName ?? '—'}
          sub={data?.mostActiveDriver ? `${fmtNum(data.mostActiveDriver.bottlesDelivered)} bottles · Route ${data.mostActiveDriver.route}` : undefined}
          icon={Truck}
          color="amber"
          loading={loading}
        />
        <StatCard
          title="Highest Value Client"
          value={data?.highestValueClient?.clientName ?? '—'}
          sub={data?.highestValueClient ? fmtRupee(data.highestValueClient.totalBilled) : undefined}
          icon={Users}
          color="green"
          loading={loading}
        />
      </div>

      {/* ── Secondary stats row ──────────────────────────────────────────── */}
      {(s || loading) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Clients Served',    value: s ? fmtNum(s.clientsServed)    : '—', icon: Users,        color: 'text-blue-700',  bg: 'bg-blue-50'   },
            { label: 'Invoices Raised',   value: s ? fmtNum(s.totalInvoices)    : '—', icon: BarChart3,    color: 'text-slate-700', bg: 'bg-slate-50'  },
            { label: 'Collection Rate',   value: s ? `${s.collectionRate}%`     : '—', icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-50'  },
            { label: 'Outstanding',       value: s ? fmtRupee(s.outstanding)    : '—', icon: Clock,        color: 'text-red-600',   bg: 'bg-red-50'    },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} rounded-xl px-4 py-3 flex items-center gap-3`}>
              <Icon size={16} className={`${color} shrink-0`} />
              <div>
                <p className="text-xs text-slate-400">{label}</p>
                {loading
                  ? <div className="h-4 bg-white/60 rounded w-16 mt-1 animate-pulse" />
                  : <p className={`font-bold text-sm ${color}`}>{value}</p>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Driver table ─────────────────────────────────────────────────── */}
      <DriverTable data={data?.driverBreakdown} loading={loading} />

      {/* ── Client table ─────────────────────────────────────────────────── */}
      <ClientTable data={data?.clientBreakdown} loading={loading} />

      {/* ── Monthly trend ────────────────────────────────────────────────── */}
      <MonthlyTrendTable data={data?.monthlyTrend} loading={loading} />
    </div>
  );
}
