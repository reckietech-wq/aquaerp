import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Package, IndianRupee, Clock, CheckCircle2, Download,
  ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, Search,
  Calendar, Truck, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// ─── constants ────────────────────────────────────────────────────────────────

const MONTH_FULL = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ROUTE_OPTIONS = [
  'Route 1', 'Route 2', 'Route 3', 'Route 4', 'Route 5',
  'Route 6', 'Route 7', 'Route 8', 'Route 9', 'Route 10',
];

function fmtRupee(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n) {
  return Number(n ?? 0).toLocaleString('en-IN');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function getQuickRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (key === 'today') {
    const today = new Date(y, m, d);
    return { from: toISO(today), to: toISO(today) };
  }
  if (key === 'week') {
    const day = now.getDay();
    const monday = new Date(y, m, d - ((day + 6) % 7));
    return { from: toISO(monday), to: toISO(now) };
  }
  if (key === 'month') {
    return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) };
  }
  if (key === 'year') {
    return { from: toISO(new Date(y, 0, 1)), to: toISO(new Date(y, 11, 31)) };
  }
  return { from: toISO(new Date(y, m, 1)), to: toISO(now) };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(rows, columns, filename) {
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = String(c.value(row)).replace(/,/g, ' ');
      return v.includes('"') ? `"${v}"` : v;
    }).join(',')
  ).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    setSort((s) => ({ field, asc: s.field === field ? !s.asc : false }));
  }

  return { sorted, sort, onSort };
}

function SortHeader({ label, field, sort, onSort, align = 'left' }) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-blue-900 transition-colors ${
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

function StatCard({ title, value, icon: Icon, color, loading }) {
  const colors = {
    blue: { bg: 'bg-blue-50', icon: 'bg-blue-900 text-white', val: 'text-blue-900' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-600 text-white', val: 'text-purple-700' },
    green: { bg: 'bg-green-50', icon: 'bg-green-600 text-white', val: 'text-green-700' },
    red: { bg: 'bg-red-50', icon: 'bg-red-600 text-white', val: 'text-red-700' },
    amber: { bg: 'bg-amber-50', icon: 'bg-amber-500 text-white', val: 'text-amber-700' },
  }[color];
  return (
    <div className={`${colors.bg} rounded-2xl p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl ${colors.icon} flex items-center justify-center shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide truncate">{title}</p>
        {loading ? (
          <div className="h-5 bg-white/60 rounded w-16 mt-1 animate-pulse" />
        ) : (
          <p className={`text-lg font-bold mt-0.5 truncate ${colors.val}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Client report row (expandable) ────────────────────────────────────────────

function ClientRow({ row, srNo }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutstanding = row.outstanding > 0;

  return (
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className={`cursor-pointer transition-colors ${hasOutstanding ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}
      >
        <td className="px-3 py-3 text-slate-400">
          <div className="flex items-center gap-1.5">
            <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
            {srNo}
          </div>
        </td>
        <td className="px-3 py-3 font-semibold text-slate-800">{row.clientName}</td>
        <td className="px-3 py-3 text-slate-500 max-w-[160px] truncate" title={row.address}>{row.address}</td>
        <td className="px-3 py-3 text-slate-600">{row.route}</td>
        <td className="px-3 py-3 text-slate-600">{row.driverName}</td>
        <td className="px-3 py-3 text-slate-600 font-mono text-xs">{row.vehicleNumber}</td>
        <td className="px-3 py-3 text-center text-slate-600">{fmtNum(row.totalDeliveries)}</td>
        <td className="px-3 py-3 text-center font-semibold text-slate-800">{fmtNum(row.totalBottles)}</td>
        <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{fmtDate(row.lastDelivery)}</td>
        <td className="px-3 py-3 text-right text-slate-700">{fmtRupee(row.totalBilled)}</td>
        <td className="px-3 py-3 text-right text-green-700 font-medium">{fmtRupee(row.paid)}</td>
        <td className="px-3 py-3 text-right text-amber-700">{fmtRupee(row.unpaid)}</td>
        <td className="px-3 py-3 text-right">
          {hasOutstanding ? (
            <span className="font-bold text-red-600">{fmtRupee(row.outstanding)}</span>
          ) : (
            <span className="text-green-600 font-medium inline-flex items-center gap-1">
              <CheckCircle2 size={12} /> Cleared
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={12} className="bg-slate-50 px-6 py-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Monthly Breakdown</p>
            {row.monthlyBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No deliveries in this period</p>
            ) : (
              <table className="text-sm w-full max-w-md">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase">
                    <th className="text-left py-1 font-semibold">Month</th>
                    <th className="text-center py-1 font-semibold">Deliveries</th>
                    <th className="text-right py-1 font-semibold">Bottles</th>
                  </tr>
                </thead>
                <tbody>
                  {row.monthlyBreakdown.map((m) => (
                    <tr key={`${m.year}-${m.month}`} className="border-t border-slate-200">
                      <td className="py-1.5 text-slate-700">{MONTH_FULL[m.month]} {m.year}</td>
                      <td className="py-1.5 text-center text-slate-600">{m.deliveries}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-800">{m.bottles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Client report table ───────────────────────────────────────────────────────

function ClientReportTable({ data, loading, clientSearch }) {
  const { sorted, sort, onSort } = useSort(data, 'totalBottles');

  const filtered = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((r) => r.clientName.toLowerCase().includes(q));
  }, [sorted, clientSearch]);

  function handleExport() {
    exportCSV(filtered, [
      { label: 'Client Name', value: (r) => r.clientName },
      { label: 'Address', value: (r) => r.address },
      { label: 'Route', value: (r) => r.route },
      { label: 'Driver', value: (r) => r.driverName },
      { label: 'Vehicle', value: (r) => r.vehicleNumber },
      { label: 'Total Deliveries', value: (r) => r.totalDeliveries },
      { label: 'Total Bottles', value: (r) => r.totalBottles },
      { label: 'Last Delivery', value: (r) => fmtDate(r.lastDelivery) },
      { label: 'Total Billed', value: (r) => Number(r.totalBilled).toFixed(2) },
      { label: 'Paid', value: (r) => Number(r.paid).toFixed(2) },
      { label: 'Unpaid', value: (r) => Number(r.unpaid).toFixed(2) },
      { label: 'Outstanding', value: (r) => Number(r.outstanding).toFixed(2) },
    ], 'client-report.csv');
    toast.success('Client report exported');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-blue-900" />
          <h2 className="font-bold text-slate-800">Client Report</h2>
          {!loading && <span className="text-xs text-slate-400 ml-1">({filtered.length} clients)</span>}
        </div>
        <button onClick={handleExport} disabled={!filtered.length}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors">
          <Download size={13} /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Sr.</th>
              <SortHeader label="Client Name" field="clientName" sort={sort} onSort={onSort} />
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</th>
              <SortHeader label="Route" field="route" sort={sort} onSort={onSort} />
              <SortHeader label="Driver" field="driverName" sort={sort} onSort={onSort} />
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Vehicle</th>
              <SortHeader label="Deliveries" field="totalDeliveries" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Bottles" field="totalBottles" sort={sort} onSort={onSort} align="center" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Delivery</th>
              <SortHeader label="Total Billed" field="totalBilled" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Paid" field="paid" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Unpaid" field="unpaid" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="Outstanding" field="outstanding" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 12 }).map((_, j) => (
                    <td key={j} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-10 text-slate-400 text-sm">
                  No client data for this period
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => <ClientRow key={row.clientId} row={row} srNo={i + 1} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Vehicle summary table ──────────────────────────────────────────────────────

function VehicleSummaryTable({ data, loading }) {
  const { sorted, sort, onSort } = useSort(data, 'totalRevenue');

  function handleExport() {
    exportCSV(sorted, [
      { label: 'Vehicle No.', value: (r) => r.vehicleNumber },
      { label: 'Driver Name', value: (r) => r.driverName },
      { label: 'Route', value: (r) => r.route },
      { label: 'Total Clients', value: (r) => r.totalClients },
      { label: 'Total Deliveries', value: (r) => r.totalDeliveries },
      { label: 'Total Bottles', value: (r) => r.totalBottles },
      { label: 'Total Revenue', value: (r) => Number(r.totalRevenue).toFixed(2) },
    ], 'vehicle-summary.csv');
    toast.success('Vehicle summary exported');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Truck size={16} className="text-blue-900" />
          <h2 className="font-bold text-slate-800">Vehicle Wise Summary</h2>
          {!loading && <span className="text-xs text-slate-400 ml-1">({data?.length ?? 0} vehicles)</span>}
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
              <SortHeader label="Vehicle No." field="vehicleNumber" sort={sort} onSort={onSort} />
              <SortHeader label="Driver Name" field="driverName" sort={sort} onSort={onSort} />
              <SortHeader label="Route" field="route" sort={sort} onSort={onSort} />
              <SortHeader label="Total Clients" field="totalClients" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Total Deliveries" field="totalDeliveries" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Total Bottles" field="totalBottles" sort={sort} onSort={onSort} align="center" />
              <SortHeader label="Total Revenue" field="totalRevenue" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-3 py-3"><div className="h-4 bg-slate-100 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : !sorted.length ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400 text-sm">No vehicle data for this period</td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr key={row.vehicleNumber} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 font-mono text-slate-700">{row.vehicleNumber}</td>
                  <td className="px-3 py-3 text-slate-700 font-medium">{row.driverName}</td>
                  <td className="px-3 py-3 text-slate-500">{row.route}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{row.totalClients}</td>
                  <td className="px-3 py-3 text-center text-slate-600">{fmtNum(row.totalDeliveries)}</td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-800">{fmtNum(row.totalBottles)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800">{fmtRupee(row.totalRevenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ReportsPage ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const defaultRange = getQuickRange('month');
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [activeQuick, setActiveQuick] = useState('month');
  const [driverId, setDriverId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [route, setRoute] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/drivers').then((r) => setDrivers(r.data.filter((d) => d.isActive))).catch(() => {});
  }, []);

  const vehicleOptions = useMemo(
    () => [...new Set(drivers.map((d) => d.vehicleNumber))],
    [drivers]
  );

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (driverId) params.set('driverId', driverId);
      if (vehicleNumber) params.set('vehicleNumber', vehicleNumber);
      if (route) params.set('route', route);
      const res = await api.get(`/api/reports/client-summary?${params}`);
      setData(res.data);
    } catch {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, driverId, vehicleNumber, route]);

  useEffect(() => { fetchReport(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQuick(key) {
    setActiveQuick(key);
    const { from, to } = getQuickRange(key);
    setFromDate(from);
    setToDate(to);
  }

  const s = data?.summary;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-slate-500 text-sm mt-0.5">Comprehensive client-wise delivery & billing report</p>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={15} className="text-slate-400 shrink-0" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setActiveQuick(''); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
          />
          <span className="text-slate-400 text-sm">to</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => { setToDate(e.target.value); setActiveQuick(''); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
          />
          {[
            { key: 'today', label: 'Today' },
            { key: 'week', label: 'This Week' },
            { key: 'month', label: 'This Month' },
            { key: 'year', label: 'This Year' },
          ].map((q) => (
            <button
              key={q.key}
              onClick={() => handleQuick(q.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeQuick === q.key ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter size={15} className="text-slate-400 shrink-0" />
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">All Drivers</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.user.name}</option>
            ))}
          </select>
          <select
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">All Vehicles</option>
            {vehicleOptions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="">All Routes</option>
            {ROUTE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search client…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900 w-40"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-900 hover:bg-blue-800 text-white disabled:opacity-60 transition-colors"
          >
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Clients Served" value={s ? fmtNum(s.totalClients) : '—'} icon={Users} color="blue" loading={loading} />
        <StatCard title="Total Bottles Delivered" value={s ? fmtNum(s.totalBottles) : '—'} icon={Package} color="purple" loading={loading} />
        <StatCard title="Total Revenue" value={s ? fmtRupee(s.totalRevenue) : '—'} icon={IndianRupee} color="green" loading={loading} />
        <StatCard title="Outstanding Amount" value={s ? fmtRupee(s.outstanding) : '—'} icon={Clock} color="red" loading={loading} />
        <StatCard title="Collection Rate" value={s ? `${s.collectionRate}%` : '—'} icon={CheckCircle2} color="amber" loading={loading} />
      </div>

      {/* Client report */}
      <ClientReportTable data={data?.clients} loading={loading} clientSearch={clientSearch} />

      {/* Vehicle-wise summary */}
      <VehicleSummaryTable data={data?.vehicleSummary} loading={loading} />
    </div>
  );
}
