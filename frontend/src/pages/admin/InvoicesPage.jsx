import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import {
  Search, X, ChevronLeft, ChevronRight,
  Eye, CheckCircle, Clock, Droplets,
  FileText, IndianRupee, CheckCheck,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

// ─── Invoice Detail Modal ────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose, onMarkPaid }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    api.get(`/api/invoices/${invoiceId}`)
      .then(r => setInvoice(r.data))
      .catch(() => toast.error('Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  async function handleMarkPaid() {
    if (!window.confirm('Mark this invoice as paid?')) return;
    setPaying(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/mark-paid`);
      toast.success('Invoice marked as paid');
      onMarkPaid();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update invoice');
    } finally {
      setPaying(false);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  const driver = invoice?.delivery?.driver?.user;
  const driverRecord = invoice?.client?.assignedDriver;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText size={20} className="text-blue-600" />
            Invoice Details
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !invoice ? (
            <p className="text-center text-slate-500 py-8">Invoice not found.</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden font-sans">

              {/* Invoice top bar */}
              <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center">
                    <Droplets size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-lg leading-none">AquaERP</p>
                    <p className="text-blue-300 text-xs mt-0.5">Water Can Supply</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-300 uppercase tracking-wider">Tax Invoice</p>
                  <p className="font-mono font-bold text-sm mt-0.5">{invoice.invoiceNumber}</p>
                  <p className="text-blue-300 text-xs mt-0.5">Date: {fmtDate(invoice.createdAt)}</p>
                </div>
              </div>

              {/* Bill To / Delivered By */}
              <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bill To</p>
                  <p className="font-semibold text-slate-800">{invoice.client?.name}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{invoice.client?.address}</p>
                  <p className="text-sm text-slate-600 mt-0.5">📞 {invoice.client?.mobile}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Delivered By</p>
                  {driver ? (
                    <>
                      <p className="font-semibold text-slate-800">{driver.name}</p>
                    </>
                  ) : (
                    <p className="text-slate-500 text-sm">—</p>
                  )}
                  {invoice.delivery?.driver && (
                    <>
                      <p className="text-sm text-slate-600 mt-0.5">
                        Vehicle: {invoice.delivery.driver.vehicleNumber ?? '—'}
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5">
                        Route: {invoice.delivery.driver.route ?? '—'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Line items */}
              <div className="px-5 py-4 border-b border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-slate-500 font-medium pb-2">Description</th>
                      <th className="text-right text-slate-500 font-medium pb-2">Qty</th>
                      <th className="text-right text-slate-500 font-medium pb-2">Rate</th>
                      <th className="text-right text-slate-500 font-medium pb-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-3 text-slate-700">Water Cans Delivered</td>
                      <td className="py-3 text-right text-slate-800 font-medium">
                        {invoice.bottlesTakenSinceLastPaid}
                      </td>
                      <td className="py-3 text-right text-slate-800 font-medium">
                        ₹{fmt(invoice.amountPerBottle)}
                      </td>
                      <td className="py-3 text-right text-slate-800 font-semibold">
                        ₹{fmt(invoice.totalAmount)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300">
                      <td colSpan={3} className="pt-3 text-right font-bold text-slate-700 pr-4">
                        TOTAL
                      </td>
                      <td className="pt-3 text-right font-bold text-blue-900 text-base">
                        ₹{fmt(invoice.totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment / QR */}
              {invoice.paymentQrData ? (
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    💳 Payment Details
                  </p>
                  <div className="flex items-start gap-6">
                    <div className="border-2 border-slate-200 rounded-xl p-2 bg-white shadow-sm">
                      <QRCodeSVG value={invoice.paymentQrData} size={150} />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <p className="text-sm text-slate-600">Scan the QR code to pay via UPI</p>
                      <p className="text-sm font-mono text-slate-700 bg-white border border-slate-200 rounded px-2 py-1 break-all">
                        {invoice.paymentQrData.split('pa=')[1]?.split('&')[0] ?? ''}
                      </p>
                      <p className="text-sm text-slate-500">
                        Amount: <span className="font-semibold text-slate-800">₹{fmt(invoice.totalAmount)}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-2">Scan to pay · Works with any UPI app</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Status footer */}
              <div className="px-5 py-4 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  {invoice.isPaid ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-semibold">
                        <CheckCircle size={14} /> PAID
                      </span>
                      <span className="text-sm text-slate-500">on {fmtDate(invoice.paidAt)}</span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold">
                      <Clock size={14} /> UNPAID
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400">Thank you for your business! 🙏</p>
              </div>

              {/* Payment summary */}
              <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Payment Summary</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment Method</span>
                  <span className="font-medium text-slate-800">
                    {invoice.paymentMethod
                      ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${invoice.paymentMethod === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{invoice.paymentMethod}</span>
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amount Paid</span>
                  <span className="font-medium text-green-700">₹{fmt(invoice.amountPaid ?? 0)} / ₹{fmt(invoice.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Client Outstanding Balance</span>
                  <span className={`font-semibold ${Number(invoice.client?.outstandingBalance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ₹{fmt(invoice.client?.outstandingBalance ?? 0)}
                  </span>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          {invoice && !invoice.isPaid && (
            <button
              onClick={handleMarkPaid}
              disabled={paying}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
            >
              <CheckCheck size={16} />
              {paying ? 'Updating…' : 'Mark as Paid'}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const LIMIT = 20;

export default function InvoicesPage() {
  const [invoices, setInvoices]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);

  // filters
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('all');   // 'all' | 'paid' | 'unpaid'
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');

  // modal
  const [selectedId, setSelectedId] = useState(null);

  // stats (from full unfiltered data — fetched separately once)
  const [stats, setStats] = useState({ total: 0, paid: 0, unpaid: 0, outstanding: 0 });

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

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (status !== 'all') params.set('isPaid', status === 'paid' ? 'true' : 'false');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const { data } = await api.get(`/api/invoices?${params}`);
      setInvoices(data.invoices);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, status, debouncedSearch, from, to]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Stats: single dedicated endpoint — accurate aggregates from the DB
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/api/invoices/stats');
      setStats({ total: data.total, paid: data.paid, unpaid: data.unpaid, outstanding: data.outstanding });
    } catch (e) {
      toast.error('Failed to load invoice stats');
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  function refreshAll() {
    fetchInvoices();
    fetchStats();
  }

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setStatus('all');
    setFrom('');
    setTo('');
    setPage(1);
  }

  const hasFilters = search || status !== 'all' || from || to;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage and track all client invoices</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invoices"  value={stats.total}            icon={FileText}     color="blue"  />
        <StatCard label="Paid"            value={stats.paid}             icon={CheckCircle}  color="green" />
        <StatCard label="Unpaid"          value={stats.unpaid}           icon={Clock}        color="red"   />
        <StatCard label="Outstanding (₹)" value={`₹${fmt(stats.outstanding)}`} icon={IndianRupee} color="amber" />
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search invoice no. or client…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

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
                {['Invoice No', 'Client', 'Driver', 'Bottles', 'Amount', 'Payment Method', 'Amount Paid', 'Outstanding', 'Date', 'Status', 'Actions'].map(h => (
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
                    {[...Array(11)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />
                    No invoices found
                  </td>
                </tr>
              ) : invoices.map(inv => {
                const driverName = inv.client?.assignedDriver?.user?.name ?? '—';
                return (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{inv.client?.name}</p>
                      <p className="text-xs text-slate-400">{inv.client?.mobile}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{driverName}</td>
                    <td className="px-4 py-3 text-slate-700 font-medium text-center">
                      {inv.bottlesTakenSinceLastPaid}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                      ₹{fmt(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.paymentMethod ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${inv.paymentMethod === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {inv.paymentMethod}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      ₹{fmt(inv.amountPaid ?? 0)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${Number(inv.client?.outstandingBalance ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ₹{fmt(inv.client?.outstandingBalance ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {fmtDate(inv.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {inv.isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
                          <CheckCircle size={12} /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold whitespace-nowrap">
                          <Clock size={12} /> Unpaid
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedId(inv.id)}
                          title="View invoice"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        {!inv.isPaid && (
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Mark invoice ${inv.invoiceNumber} as paid?`)) return;
                              try {
                                await api.put(`/api/invoices/${inv.id}/mark-paid`);
                                toast.success('Marked as paid');
                                refreshAll();
                              } catch (e) {
                                toast.error(e.response?.data?.error || 'Failed');
                              }
                            }}
                            title="Mark as paid"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <CheckCheck size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} invoices
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

      {/* Invoice detail modal */}
      {selectedId && (
        <InvoiceDetailModal
          invoiceId={selectedId}
          onClose={() => setSelectedId(null)}
          onMarkPaid={refreshAll}
        />
      )}
    </div>
  );
}
