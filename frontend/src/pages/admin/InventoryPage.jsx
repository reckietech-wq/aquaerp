import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, Plus, Truck, Wrench, TrendingUp, TrendingDown,
  RefreshCw, X, Loader2, ChevronLeft, ChevronRight,
  AlertTriangle, AlertCircle, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_TYPES = {
  DELIVERY_OUT:       { label: 'Delivery',   emoji: '📦', color: 'bg-blue-100 text-blue-700'   },
  COLLECTION_IN:      { label: 'Collection', emoji: '🔄', color: 'bg-teal-100 text-teal-700'   },
  ADMIN_RESTOCK:      { label: 'Restock',    emoji: '➕', color: 'bg-green-100 text-green-700' },
  ADMIN_EMPTY_DISPATCH:{ label:'Dispatched', emoji: '🚚', color: 'bg-orange-100 text-orange-700'},
  MANUAL_ADJUSTMENT:  { label: 'Adjustment', emoji: '✏️', color: 'bg-slate-100 text-slate-700' },
};

const FILTER_OPTIONS = [
  { value: '',                    label: 'All Types'    },
  { value: 'DELIVERY_OUT',        label: '📦 Deliveries' },
  { value: 'ADMIN_RESTOCK',       label: '➕ Restock'   },
  { value: 'ADMIN_EMPTY_DISPATCH',label: '🚚 Dispatched' },
  { value: 'MANUAL_ADJUSTMENT',   label: '✏️ Adjustment' },
];

function fmtDT(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── Change cell ─────────────────────────────────────────────────────────────

function ChangeCell({ value }) {
  if (value === 0) return <span className="text-slate-400 text-sm">—</span>;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {positive ? '+' : ''}{value}
    </span>
  );
}

// ─── Type badge ──────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const cfg = LOG_TYPES[type] ?? { label: type, emoji: '?', color: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

// ─── Modal wrapper ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Restock modal ───────────────────────────────────────────────────────────

function RestockModal({ onClose, onSuccess }) {
  const [qty, setQty]   = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const n = parseInt(qty, 10);
    if (!n || n < 1) { toast.error('Enter a valid quantity (min 1)'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/inventory/restock', { filledBottlesToAdd: n, note: note || null });
      setResult(data.inventory.totalFilledBottles);
      onSuccess();
      toast.success(`Restocked ${n} bottles`);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Restock failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Restock Filled Bottles" onClose={onClose}>
      {result !== null ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">✅</div>
          <div className="text-center">
            <p className="font-bold text-slate-800 text-lg">Stock updated</p>
            <p className="text-slate-500 mt-1">New total: <span className="font-bold text-blue-900">{result} filled bottles</span></p>
          </div>
          <button onClick={onClose}
            className="w-full py-2.5 bg-blue-900 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              How many filled bottles received?
            </label>
            <input
              type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              placeholder="e.g. 100"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Note <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Supplier delivery"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors mt-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Filled Stock
          </button>
        </form>
      )}
    </Modal>
  );
}

// ─── Dispatch empties modal ───────────────────────────────────────────────────

function DispatchModal({ totalEmpty, onClose, onSuccess }) {
  const [qty, setQty]   = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const n = parseInt(qty, 10);
    if (!n || n < 1) { toast.error('Enter a valid quantity'); return; }
    if (n > totalEmpty) { toast.error(`Only ${totalEmpty} empties available`); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/api/inventory/dispatch-empties', { emptyBottlesToDispatch: n, note: note || null });
      setResult({ dispatched: n, remaining: data.inventory.totalEmptyBottles });
      onSuccess();
      toast.success(`${n} empties dispatched for refilling`);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Dispatch failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Send Empty Bottles for Refilling" onClose={onClose}>
      {result !== null ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl">🚚</div>
          <div className="text-center">
            <p className="font-bold text-slate-800 text-lg">Dispatched!</p>
            <p className="text-slate-500 mt-1">
              <span className="font-bold text-orange-600">{result.dispatched}</span> empties dispatched.
              Remaining: <span className="font-bold">{result.remaining}</span>
            </p>
          </div>
          <button onClick={onClose}
            className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl">
            <Info size={16} className="text-orange-500 shrink-0" />
            <p className="text-sm text-orange-700">
              Currently <span className="font-bold">{totalEmpty}</span> empties available to dispatch
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              How many to dispatch? <span className="text-slate-400 font-normal">(max {totalEmpty})</span>
            </label>
            <input
              type="number" min="1" max={totalEmpty} value={qty} onChange={e => setQty(e.target.value)}
              placeholder={`e.g. ${Math.min(totalEmpty, 50)}`}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Note <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Sent to refilling plant"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <button type="submit" disabled={loading || totalEmpty === 0}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors mt-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
            Dispatch Empties
          </button>
        </form>
      )}
    </Modal>
  );
}

// ─── Manual adjustment modal ─────────────────────────────────────────────────

function AdjustModal({ onClose, onSuccess }) {
  const [filled, setFilled] = useState('');
  const [empty,  setEmpty]  = useState('');
  const [note, setNote]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const fc = parseInt(filled || '0', 10);
    const ec = parseInt(empty  || '0', 10);
    if (fc === 0 && ec === 0) { toast.error('Enter at least one non-zero change'); return; }
    if (!note.trim()) { toast.error('Reason/note is required for audit trail'); return; }
    setLoading(true);
    try {
      await api.post('/api/inventory/adjust', { filledChange: fc, emptyChange: ec, note: note.trim() });
      setDone(true);
      onSuccess();
      toast.success('Manual adjustment applied');
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Adjustment failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Manual Inventory Adjustment" onClose={onClose}>
      {done ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-3xl">✅</div>
          <p className="font-bold text-slate-800">Adjustment applied</p>
          <button onClick={onClose}
            className="w-full py-2.5 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-800 transition-colors">
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">Use for damage, loss, write-offs, or corrections. Negative values reduce stock.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Filled bottles change</label>
              <input
                type="number" value={filled} onChange={e => setFilled(e.target.value)}
                placeholder="e.g. -5 or +10"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">Negative = loss/damage</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Empty bottles change</label>
              <input
                type="number" value={empty} onChange={e => setEmpty(e.target.value)}
                placeholder="e.g. -2 or +5"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <p className="text-xs text-slate-400 mt-1">Negative = write-off</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Reason / Note <span className="text-red-400">*</span>
            </label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. 3 bottles broken during delivery"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors mt-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
            Apply Adjustment
          </button>
        </form>
      )}
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function InventoryPage() {
  const [inventory, setInventory] = useState(null);
  const [invLoading, setInvLoading] = useState(true);

  const [logs, setLogs]           = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage]   = useState(1);
  const [logsLoading, setLogsLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');

  const [modal, setModal] = useState(null); // 'restock' | 'dispatch' | 'adjust'

  const timerRef = useRef(null);

  // ── Fetch inventory ──────────────────────────────────────────────────────────

  const fetchInventory = useCallback(async () => {
    try {
      const { data } = await api.get('/api/inventory');
      setInventory(data);
    } catch {
      // silently fail on auto-refresh
    } finally {
      setInvLoading(false);
    }
  }, []);

  // ── Fetch logs ───────────────────────────────────────────────────────────────

  const fetchLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, page });
      if (typeFilter) params.set('type', typeFilter);
      if (fromDate)   params.set('from', fromDate);
      if (toDate)     params.set('to', toDate);
      const { data } = await api.get(`/api/inventory/logs?${params}`);
      setLogs(data.logs);
      setLogsTotal(data.total);
    } catch {
      toast.error('Failed to load inventory history');
    } finally {
      setLogsLoading(false);
    }
  }, [typeFilter, fromDate, toDate]);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchInventory();
    // Auto-refresh every 30 seconds
    timerRef.current = setInterval(fetchInventory, 30_000);
    return () => clearInterval(timerRef.current);
  }, [fetchInventory]);

  useEffect(() => {
    setLogsPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  function handlePageChange(newPage) {
    setLogsPage(newPage);
    fetchLogs(newPage);
  }

  function handleActionSuccess() {
    fetchInventory();
    fetchLogs(1);
    setLogsPage(1);
  }

  const totalPages = Math.ceil(logsTotal / PAGE_SIZE);
  const filled = inventory?.totalFilledBottles ?? 0;
  const empty  = inventory?.totalEmptyBottles  ?? 0;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bottle Inventory</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track filled and empty bottle stock in real time</p>
        </div>
        <button onClick={fetchInventory}
          className="p-2 border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-50 transition-colors"
          title="Refresh">
          <RefreshCw size={15} className={invLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Filled bottles */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Filled Bottles</p>
                {invLoading ? (
                  <div className="h-14 w-28 bg-slate-100 rounded-xl animate-pulse" />
                ) : (
                  <p className="text-6xl font-black text-blue-900 leading-none tabular-nums">{filled}</p>
                )}
                <p className="text-slate-400 text-sm mt-2 font-medium">Ready to Deliver</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                <Package size={28} className="text-blue-600" />
              </div>
            </div>
          </div>
          {!invLoading && (
            <>
              {filled < 20 && (
                <div className="flex items-center gap-2 px-6 py-3 bg-red-50 border-t border-red-200">
                  <AlertCircle size={15} className="text-red-500 shrink-0" />
                  <span className="text-sm font-semibold text-red-600">🔴 Critical — less than 20 bottles left</span>
                </div>
              )}
              {filled >= 20 && filled < 50 && (
                <div className="flex items-center gap-2 px-6 py-3 bg-amber-50 border-t border-amber-200">
                  <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                  <span className="text-sm font-semibold text-amber-600">⚠️ Low Stock — restock soon</span>
                </div>
              )}
              {filled >= 50 && (
                <div className="flex items-center gap-2 px-6 py-3 bg-blue-50 border-t border-blue-100">
                  <span className="text-sm text-blue-500 font-medium">✅ Stock level healthy</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Empty bottles */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2">Empty Bottles</p>
                {invLoading ? (
                  <div className="h-14 w-28 bg-slate-100 rounded-xl animate-pulse" />
                ) : (
                  <p className="text-6xl font-black text-orange-500 leading-none tabular-nums">{empty}</p>
                )}
                <p className="text-slate-400 text-sm mt-2 font-medium">Collected from Clients</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0">
                <Truck size={28} className="text-orange-400" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-6 py-3 bg-orange-50 border-t border-orange-100">
            <Info size={14} className="text-orange-400 shrink-0" />
            <span className="text-sm text-orange-600">Send for refilling to convert to filled stock</span>
          </div>
        </div>
      </div>

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setModal('restock')}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
          <Plus size={16} /> Add Filled Stock
        </button>
        <button onClick={() => setModal('dispatch')}
          disabled={empty === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
          <Truck size={16} /> Dispatch Empties for Refilling
        </button>
        <button onClick={() => setModal('adjust')}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
          <Wrench size={16} /> Manual Adjustment
        </button>
      </div>

      {/* ── Inventory log table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

        {/* Table header + filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex-1">Inventory History</h2>
          <div className="flex flex-wrap gap-2">
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer">
              {FILTER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900"
              placeholder="From" />
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900"
              placeholder="To" />
            {(typeFilter || fromDate || toDate) && (
              <button onClick={() => { setTypeFilter(''); setFromDate(''); setToDate(''); }}
                className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors">
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Date & Time','Type','Filled Δ','Empty Δ','Filled Balance','Empty Balance','Note','By'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-200 rounded" style={{ width: `${50 + (j * 13) % 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No inventory logs yet</p>
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDT(log.createdAt)}</td>
                  <td className="px-4 py-3"><TypeBadge type={log.type} /></td>
                  <td className="px-4 py-3"><ChangeCell value={log.filledChange} /></td>
                  <td className="px-4 py-3"><ChangeCell value={log.emptyChange} /></td>
                  <td className="px-4 py-3 font-semibold text-slate-700 tabular-nums">{log.filledBalanceAfter}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700 tabular-nums">{log.emptyBalanceAfter}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[180px]">
                    <span className="truncate block" title={log.note ?? ''}>{log.note ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{log.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-slate-50">
          {logsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-32" />
                <div className="h-3 bg-slate-100 rounded w-48" />
              </div>
            ))
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400 gap-2">
              <Package size={32} className="opacity-30" />
              <p className="text-sm">No inventory logs yet</p>
            </div>
          ) : logs.map(log => (
            <div key={log.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <TypeBadge type={log.type} />
                <span className="text-xs text-slate-400">{fmtDT(log.createdAt)}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-slate-500">Filled: <ChangeCell value={log.filledChange} /></span>
                <span className="text-slate-500">Empty: <ChangeCell value={log.emptyChange} /></span>
              </div>
              <div className="flex gap-4 text-xs text-slate-400">
                <span>Balance: <span className="font-semibold text-slate-600">{log.filledBalanceAfter}F / {log.emptyBalanceAfter}E</span></span>
                {log.note && <span className="truncate">{log.note}</span>}
              </div>
              <p className="text-xs text-slate-400">By: {log.createdBy}</p>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              {((logsPage - 1) * PAGE_SIZE) + 1}–{Math.min(logsPage * PAGE_SIZE, logsTotal)} of {logsTotal} entries
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => handlePageChange(logsPage - 1)} disabled={logsPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = totalPages <= 5 ? i + 1 : logsPage <= 3 ? i + 1 : logsPage >= totalPages - 2 ? totalPages - 4 + i : logsPage - 2 + i;
                return (
                  <button key={pg} onClick={() => handlePageChange(pg)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      pg === logsPage ? 'bg-blue-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                    {pg}
                  </button>
                );
              })}
              <button onClick={() => handlePageChange(logsPage + 1)} disabled={logsPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {modal === 'restock' && (
        <RestockModal onClose={() => setModal(null)} onSuccess={handleActionSuccess} />
      )}
      {modal === 'dispatch' && (
        <DispatchModal totalEmpty={empty} onClose={() => setModal(null)} onSuccess={handleActionSuccess} />
      )}
      {modal === 'adjust' && (
        <AdjustModal onClose={() => setModal(null)} onSuccess={handleActionSuccess} />
      )}
    </div>
  );
}
