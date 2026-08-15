import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  Search, X, ChevronLeft, ChevronRight,
  CheckCircle, Clock, FileText, IndianRupee, Users, ReceiptText,
} from 'lucide-react';
import ClientStatementModal from '../../components/ClientStatementModal';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
    green:  'bg-green-50 text-green-700 border-green-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${colors[color]}`}>
      <div className="p-2 rounded-lg bg-white/60">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium opacity-70">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────────

function ClientStatusBadge({ status }) {
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
        <CheckCircle size={12} /> Paid
      </span>
    );
  }
  if (status === 'PARTIAL') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold whitespace-nowrap">
        <Clock size={12} /> Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold whitespace-nowrap">
      <Clock size={12} /> Unpaid
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const LIMIT = 20;

export default function InvoicesPage() {
  const [rows, setRows]             = useState([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);

  // filters
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('all');   // 'all' | 'paid' | 'unpaid'
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');
  const [clientFilter, setClientFilter] = useState('');

  // modal
  const [statementClientId, setStatementClientId] = useState(null);

  // stats (from full unfiltered data — fetched separately once)
  const [stats, setStats] = useState({ clientsWithInvoices: 0, totalOutstanding: 0, totalCollected: 0, total: 0 });

  // clients for the filter dropdown
  const [clients, setClients] = useState([]);
  useEffect(() => {
    api.get('/api/clients').then((r) => setClients(r.data)).catch(() => {});
  }, []);

  // debounce search
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (status !== 'all') params.set('status', status);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (clientFilter) params.set('clientId', clientFilter);

      const { data } = await api.get(`/api/invoices/by-client?${params}`);
      setRows(data.clients);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, from, to, clientFilter]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Stats: single dedicated endpoint — accurate aggregates from the DB
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/invoices/stats');
      setStats(data);
    } catch {
      toast.error('Failed to load invoice stats');
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function refreshAll() {
    fetchRows();
    fetchStats();
  }

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('all');
    setFrom('');
    setTo('');
    setClientFilter('');
    setPage(1);
  }

  const hasFilters = search || status !== 'all' || from || to || clientFilter;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        <p className="text-sm text-slate-500 mt-0.5">One row per client — drill into a statement for full invoice detail</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Clients with Invoices" value={stats.clientsWithInvoices}       icon={Users}       color="blue"  />
        <StatCard label="Total Outstanding (₹)"  value={`₹${fmt(stats.totalOutstanding)}`} icon={IndianRupee} color="amber" />
        <StatCard label="Total Collected (₹)"    value={`₹${fmt(stats.totalCollected)}`}   icon={CheckCircle} color="green" />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search client name…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Client filter */}
        <select
          value={clientFilter}
          onChange={e => { setClientFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-700 min-w-[160px]"
        >
          <option value="">All Clients</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Status filter */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
          {['all', 'paid', 'unpaid'].map(s => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3 py-2 capitalize transition-colors ${
                status === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(e.target.value); setPage(1); }}
            className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setPage(1); }}
            className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Client', 'Driver', 'Invoices', 'Bottles', 'Total Billed', 'Total Paid', 'Outstanding', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    No clients with invoices found
                  </td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.clientId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.clientName}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.driverName}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium text-center">{r.invoiceCount}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium text-center">{r.totalBottles}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                    ₹{fmt(r.totalBilled)}
                  </td>
                  <td className="px-4 py-3 text-green-700 whitespace-nowrap">
                    ₹{fmt(r.totalPaid)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-semibold ${r.outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ₹{fmt(r.outstandingBalance)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ClientStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setStatementClientId(r.clientId)}
                      title="View statement"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 border border-slate-200 hover:text-purple-700 hover:bg-purple-50 hover:border-purple-200 transition-colors text-xs font-medium whitespace-nowrap"
                    >
                      <ReceiptText size={14} /> View Statement
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} clients
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-slate-700 px-1">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Consolidated client statement modal — all per-invoice detail lives here */}
      {statementClientId && (
        <ClientStatementModal
          clientId={statementClientId}
          onClose={() => { setStatementClientId(null); refreshAll(); }}
        />
      )}
    </div>
  );
}
