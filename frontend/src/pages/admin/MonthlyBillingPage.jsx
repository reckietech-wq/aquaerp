import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Receipt, Download, MessageCircle, CheckCircle2, Search, X,
  Loader2, Phone, Package, ChevronDown, Check, Square,
  CheckSquare, FileText, MapPin, Send, Calendar, Users,
  RefreshCw, Printer, Droplets, Clock, IndianRupee, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return opts;
}

function fmtRupee(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildWaUrl(mobile, message) {
  const digits = String(mobile).replace(/\D/g, '');
  const num = digits.startsWith('91') && digits.length === 12 ? digits : `91${digits.slice(-10)}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

async function downloadClientPDF(clientId, month, year, filename) {
  const res = await api.get(`/api/billing/${clientId}/pdf?month=${month}&year=${year}`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `invoice-${clientId}-${year}-${month}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function invoiceNumberFor(clientId, month, year) {
  return `BILL-${year}-${String(month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
// Status here comes straight from real Invoice.amountPaid/isPaid via the
// billing API — the same figures Invoices/Statement show, never a
// separately-tracked flag that could drift out of sync.

function StatusBadge({ status }) {
  if (status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
        <CheckCircle2 size={12} /> Paid
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue:  'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${colors[color]}`}>
      <div className="p-2 rounded-lg bg-white/60"><Icon size={20} /></div>
      <div>
        <p className="text-xs font-medium opacity-70">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

// ─── ClientBillingModal — full invoice detail + share actions ─────────────────

function ClientBillingModal({ bill, onClose, onChanged }) {
  const { clientId, month, year } = bill;
  const invoiceNumber = invoiceNumberFor(clientId, month, year);

  const [waLoading, setWaLoading]   = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [marking, setMarking]       = useState(false);

  async function handleWhatsApp() {
    setWaLoading(true);
    try {
      const { data } = await api.get(`/api/billing/${clientId}/whatsapp-link?month=${month}&year=${year}`);
      downloadClientPDF(clientId, month, year, `${invoiceNumber}.pdf`).catch(() => {});
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Failed to open WhatsApp');
    } finally {
      setWaLoading(false);
    }
  }

  async function handleDownloadPDF() {
    setPdfLoading(true);
    try {
      await downloadClientPDF(clientId, month, year, `${invoiceNumber}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setPdfLoading(false);
    }
  }

  function handlePrint() {
    const w = window.open('', '_blank', 'width=800,height=1100');
    const rowsHtml = bill.deliveries.map((d) => `
      <tr>
        <td>${fmtDate(d.date)}</td>
        <td style="text-align:center">${d.bottles}</td>
        <td style="text-align:right">₹${d.rate.toFixed(2)}</td>
        <td style="text-align:right">₹${d.amount.toFixed(2)}</td>
        <td style="text-align:center">${d.isPaid ? 'Paid' : d.amountPaid > 0 ? 'Partial' : 'Unpaid'}</td>
      </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${invoiceNumber}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;padding:28px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #e2e8f0;margin-bottom:16px}
.logo{font-size:20px;font-weight:800;color:#1e3a8a}.sub{color:#64748b;font-size:12px;margin-top:3px}
.inv-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8}
.inv-num{font-weight:700;font-size:15px;margin-top:3px}.inv-date{color:#64748b;font-size:12px;margin-top:3px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;background:#f8fafc;border-radius:8px;padding:14px}
.party-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.1em;margin-bottom:6px}
.party-name{font-weight:700;font-size:14px;margin-bottom:3px}.party-sub{color:#64748b;font-size:12px;line-height:1.5}
table{width:100%;border-collapse:collapse;margin-bottom:14px}
th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border:1px solid #e2e8f0}
td{padding:8px 12px;border:1px solid #e2e8f0}
.total-row{text-align:right;font-size:16px;font-weight:800;color:#1e3a8a;padding:10px 0}
.status{display:inline-flex;align-items:center;padding:5px 14px;border-radius:999px;font-weight:700;font-size:12px}
.paid{background:#dcfce7;color:#15803d}.partial{background:#fef3c7;color:#b45309}.pending{background:#fee2e2;color:#b91c1c}
.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="header">
  <div><div class="logo">💧 Gajanan Aqua</div><div class="sub">Water Can Supply Co.</div></div>
  <div style="text-align:right">
    <div class="inv-label">Invoice</div>
    <div class="inv-num">${invoiceNumber}</div>
    <div class="inv-date">${MONTH_NAMES[month]} ${year}</div>
  </div>
</div>
<div class="parties">
  <div>
    <div class="party-label">Bill To</div>
    <div class="party-name">${bill.clientName ?? ''}</div>
    <div class="party-sub">${bill.address ?? ''}<br>📞 ${bill.mobile ?? ''}</div>
  </div>
  <div>
    <div class="party-label">Delivered By</div>
    <div class="party-name">${bill.driverName ?? '—'}</div>
    <div class="party-sub">${bill.driverVehicle ? bill.driverVehicle : ''}${bill.route ? '<br>Route ' + bill.route : ''}</div>
  </div>
</div>
<table>
  <thead><tr><th>Date</th><th style="text-align:center">Bottles</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th><th style="text-align:center">Status</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="total-row">Total Billed: ₹${bill.totalBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
<div><span class="status ${bill.status === 'PAID' ? 'paid' : bill.status === 'PARTIAL' ? 'partial' : 'pending'}">${bill.status === 'PAID' ? '✅ PAID' : bill.status === 'PARTIAL' ? '⏳ PARTIALLY PAID' : '⏳ PENDING PAYMENT'}</span></div>
<div class="footer">Gajanan Aqua · Water Can Delivery Management · Thank you for your business!</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 350);
  }

  async function handleMarkPaid() {
    if (!window.confirm(`Mark ${bill.clientName}'s ${MONTH_NAMES[month]} ${year} bill fully paid? This records a payment covering the remaining ₹${(bill.totalBilled - bill.totalPaid).toFixed(2)}.`)) return;
    setMarking(true);
    try {
      await api.put(`/api/billing/${clientId}/mark-paid`, { month, year, paymentMethod: 'CASH' });
      toast.success('Marked as paid');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark as paid');
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-bold text-slate-800 text-sm truncate">Invoice #{invoiceNumber}</h2>
            <StatusBadge status={bill.status} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* LEFT: detail */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-blue-900 rounded-xl flex items-center justify-center shrink-0">
                  <Droplets size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-base text-blue-900 leading-tight">Gajanan Aqua</p>
                  <p className="text-slate-400 text-xs">Water Can Supply Co.</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice</p>
                <p className="font-bold text-slate-800 font-mono text-sm mt-0.5">{invoiceNumber}</p>
                <p className="text-slate-400 text-xs mt-0.5">{MONTH_NAMES[month]} {year}</p>
              </div>
            </div>

            <div className="border-t border-slate-200" />

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
                <p className="font-bold text-slate-800">{bill.clientName}</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">{bill.address}</p>
                <p className="text-slate-500 text-xs flex items-center gap-1 mt-1"><Phone size={9} /> {bill.mobile}</p>
                <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5"><MapPin size={9} /> {bill.route}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Delivered By</p>
                <p className="font-bold text-slate-800">{bill.driverName}</p>
                {bill.driverVehicle && <p className="text-slate-500 text-xs mt-1">{bill.driverVehicle}</p>}
              </div>
            </div>

            {/* Line items — full invoice detail, same source as Invoices/Statement */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide">Bottles</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.deliveries.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No invoiced deliveries this month</td></tr>
                  ) : bill.deliveries.map((d) => (
                    <tr key={d.invoiceId} className="border-b border-dashed border-slate-100 last:border-0">
                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{fmtDate(d.date)}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.bottles}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{fmtRupee(d.rate)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">{fmtRupee(d.amount)}</td>
                      <td className="px-3 py-2.5 text-center"><StatusBadge status={d.isPaid ? 'PAID' : d.amountPaid > 0 ? 'PARTIAL' : 'UNPAID'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end items-center gap-4 px-3 py-2.5 bg-slate-50">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Billed</span>
                <span className="font-bold text-blue-900 text-base">{fmtRupee(bill.totalBilled)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Receipt size={11} /> Scan-to-pay UPI QR is included on the downloaded/printed PDF.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">Total Billed</p>
                <p className="font-bold text-slate-800">{fmtRupee(bill.totalBilled)}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-green-500">Paid (this month)</p>
                <p className="font-bold text-green-700">{fmtRupee(bill.totalPaid)}</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${bill.outstanding > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className={`text-xs ${bill.outstanding > 0 ? 'text-red-400' : 'text-green-500'}`}>Client Outstanding</p>
                <p className={`font-bold ${bill.outstanding > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtRupee(bill.outstanding)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 -mt-2">Client Outstanding is their total running balance, not just this month's.</p>
          </div>

          {/* RIGHT: actions */}
          <div className="w-full md:w-[220px] shrink-0 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-100 p-4 flex flex-col gap-3 overflow-y-auto">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Share Invoice</p>

            <button onClick={handleWhatsApp} disabled={waLoading}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 transition-colors text-left">
              <div className="w-8 h-8 rounded-md bg-green-500 flex items-center justify-center shrink-0">
                {waLoading ? <Loader2 size={15} className="animate-spin text-white" /> : <MessageCircle size={15} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">WhatsApp</p>
                <p className="text-xs text-slate-400">Opens WA + downloads PDF</p>
              </div>
            </button>

            <button onClick={handleDownloadPDF} disabled={pdfLoading}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 transition-colors text-left">
              <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
                {pdfLoading ? <Loader2 size={15} className="animate-spin text-white" /> : <Download size={15} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">Download PDF</p>
                <p className="text-xs text-slate-400">Save to device</p>
              </div>
            </button>

            <div className="border-t border-slate-200" />

            <button onClick={handlePrint}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left">
              <div className="w-8 h-8 rounded-md bg-slate-500 flex items-center justify-center shrink-0">
                <Printer size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">Print</p>
                <p className="text-xs text-slate-400">Browser print dialog</p>
              </div>
            </button>

            <div className="border-t border-slate-200" />

            {bill.status !== 'PAID' ? (
              <button onClick={handleMarkPaid} disabled={marking}
                className="mt-auto w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-green-500 text-green-600 font-semibold text-sm hover:bg-green-50 disabled:opacity-60 transition-colors">
                {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Mark Month Paid
              </button>
            ) : (
              <div className="mt-auto flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <span className="text-xs text-green-700 font-semibold">Fully paid</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BatchSendModal ───────────────────────────────────────────────────────────

function BatchSendModal({ bills, month, year, onClose }) {
  const [links, setLinks]     = useState({});
  const [status, setStatus]   = useState(() => Object.fromEntries(bills.map((b) => [b.clientId, 'idle'])));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.post('/api/billing/bulk-whatsapp-links', { clientIds: bills.map((b) => b.clientId), month, year })
      .then(({ data }) => {
        const map = {};
        data.links.forEach((l) => { map[l.clientId] = l; });
        setLinks(map);
      })
      .catch(() => toast.error('Failed to build WhatsApp links'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sendBill(clientId) {
    const link = links[clientId];
    if (!link) return;
    setStatus((s) => ({ ...s, [clientId]: 'sending' }));
    downloadClientPDF(clientId, month, year, `invoice-${link.clientName}.pdf`).catch(() => {});
    window.open(link.url, '_blank', 'noopener,noreferrer');
    setTimeout(() => setStatus((s) => ({ ...s, [clientId]: 'done' })), 800);
  }

  const doneCount = Object.values(status).filter((s) => s === 'done').length;
  const total = bills.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const pending = bills.filter((b) => status[b.clientId] !== 'done');
  const done = bills.filter((b) => status[b.clientId] === 'done');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Batch WhatsApp Send</h2>
            <p className="text-slate-500 text-sm">{doneCount}/{total} sent</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-3 border-b border-slate-50">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-900" /></div>
          ) : (
            <>
              {pending.map((bill) => (
                <div key={bill.clientId} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{bill.clientName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone size={10} /> {bill.mobile}<span className="mx-1">·</span>{fmtRupee(bill.totalBilled)}
                    </p>
                  </div>
                  <button onClick={() => sendBill(bill.clientId)} disabled={status[bill.clientId] === 'sending' || !links[bill.clientId]}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold transition-colors">
                    {status[bill.clientId] === 'sending' ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : <><Send size={12} /> Send</>}
                  </button>
                </div>
              ))}
              {done.length > 0 && (
                <>
                  <div className="px-6 py-2 bg-green-50"><p className="text-xs font-semibold text-green-600 uppercase tracking-wide">✅ Sent ({done.length})</p></div>
                  {done.map((bill) => (
                    <div key={bill.clientId} className="flex items-center gap-4 px-6 py-3 bg-green-50/40">
                      <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-600 text-sm truncate">{bill.clientName}</p>
                        <p className="text-xs text-slate-400">{fmtRupee(bill.totalBilled)}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm transition-colors">
            {doneCount === total ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BillCard (mobile) ────────────────────────────────────────────────────────

function BillCard({ bill, selected, onSelect, onView, onMarkPaid, onDownload }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3 transition-colors ${selected ? 'border-blue-300 bg-blue-50/30' : 'border-slate-100'}`}>
      <div className="flex items-start gap-3">
        <button onClick={() => onSelect(bill.clientId)} className="mt-0.5 shrink-0 text-slate-400 hover:text-blue-700 transition-colors">
          {selected ? <CheckSquare size={16} className="text-blue-700" /> : <Square size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-800 truncate">{bill.clientName}</p>
            <StatusBadge status={bill.status} />
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone size={10} /> {bill.mobile}</p>
        </div>
      </div>
      <div className="flex gap-2 text-sm">
        <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2">
          <p className="text-xs text-slate-400">Bottles</p>
          <p className="font-semibold text-slate-700">{bill.totalBottles}</p>
        </div>
        <div className="flex-1 bg-blue-50 rounded-xl px-3 py-2">
          <p className="text-xs text-blue-400">Billed</p>
          <p className="font-bold text-blue-900">{fmtRupee(bill.totalBilled)}</p>
        </div>
        <div className={`flex-1 rounded-xl px-3 py-2 ${bill.outstanding > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <p className={`text-xs ${bill.outstanding > 0 ? 'text-red-400' : 'text-green-500'}`}>Outstanding</p>
          <p className={`font-bold ${bill.outstanding > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtRupee(bill.outstanding)}</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <button onClick={() => onView(bill)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs font-medium transition-colors">
          <Eye size={13} /> View
        </button>
        <button onClick={() => onDownload(bill)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs font-medium transition-colors">
          <Download size={13} /> PDF
        </button>
        <button onClick={() => onView(bill)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium transition-colors">
          <MessageCircle size={13} /> Share
        </button>
        {bill.status !== 'PAID' && (
          <button onClick={() => onMarkPaid(bill)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-xs font-medium transition-colors">
            <CheckCircle2 size={13} /> Paid
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MONTH_OPTIONS = getMonthOptions();

export default function MonthlyBillingPage() {
  const [selectedIdx, setSelectedIdx] = useState(0); // 0 = current month, live
  const { month, year } = MONTH_OPTIONS[selectedIdx];

  const [bills, setBills]     = useState([]);
  const [stats, setStats]     = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDling, setBulkDling]     = useState(false);

  const [viewBill, setViewBill]     = useState(null);
  const [batchBills, setBatchBills] = useState(null);

  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  useEffect(() => {
    api.get('/api/drivers').then((r) => setDrivers(r.data)).catch(() => {});
  }, []);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month, year });
      if (statusFilter)    params.set('status',   statusFilter);
      if (driverFilter)    params.set('driverId', driverFilter);
      if (debouncedSearch) params.set('search',   debouncedSearch);
      const res = await api.get(`/api/billing?${params}`);
      setBills(res.data.clients);
      setStats(res.data.stats);
    } catch {
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [month, year, statusFilter, driverFilter, debouncedSearch]);

  useEffect(() => { fetchBills(); }, [fetchBills]);
  useEffect(() => { setSelectedIds(new Set()); }, [month, year]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleMarkPaid(bill) {
    if (!confirm(`Mark ${bill.clientName}'s ${MONTH_NAMES[month]} ${year} bill fully paid?`)) return;
    try {
      await api.put(`/api/billing/${bill.clientId}/mark-paid`, { month, year, paymentMethod: 'CASH' });
      toast.success('Marked as paid');
      fetchBills();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  }

  async function handleDownloadSingle(bill) {
    const tid = toast.loading('Generating PDF…');
    try {
      await downloadClientPDF(bill.clientId, month, year, `invoice-${bill.clientName}-${MONTH_NAMES[month]}-${year}.pdf`);
      toast.success('PDF downloaded', { id: tid });
    } catch { toast.error('Download failed', { id: tid }); }
  }

  async function handleBulkDownload() {
    const ids = [...selectedIds];
    setBulkDling(true);
    const tid = toast.loading(`Downloading ${ids.length} PDFs…`);
    let done = 0;
    for (const id of ids) {
      const bill = bills.find((b) => b.clientId === id);
      try {
        await downloadClientPDF(id, month, year, `invoice-${bill?.clientName}-${MONTH_NAMES[month]}-${year}.pdf`);
        done++;
        toast.loading(`${done}/${ids.length} downloaded…`, { id: tid });
        await new Promise((r) => setTimeout(r, 400));
      } catch { /* skip */ }
    }
    toast.success(`${done} PDFs downloaded`, { id: tid });
    setBulkDling(false);
  }

  function openBatchSend() {
    setBatchBills(bills.filter((b) => selectedIds.has(b.clientId)));
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allSelected = bills.length > 0 && bills.every((b) => selectedIds.has(b.clientId));
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(bills.map((b) => b.clientId)));
  }

  const summary = useMemo(() => {
    const paid    = bills.filter((b) => b.status === 'PAID').length;
    const partial = bills.filter((b) => b.status === 'PARTIAL').length;
    const unpaid  = bills.filter((b) => b.status === 'UNPAID').length;
    return { total: bills.length, paid, partial, unpaid };
  }, [bills]);

  const isCurrentMonth = selectedIdx === 0;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">Monthly Billing</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Live from Invoices — always matches what's shown in Invoices &amp; Statements
            {isCurrentMonth && <span className="ml-1.5 inline-flex items-center gap-1 text-blue-600 font-medium">· current month, live</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select value={selectedIdx} onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="pl-8 pr-8 py-2.5 text-sm font-medium border border-slate-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer">
              {MONTH_OPTIONS.map((opt, i) => (
                <option key={i} value={i}>{MONTH_NAMES[opt.month]} {opt.year}{i === 0 ? ' (current)' : ''}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button onClick={fetchBills} disabled={loading}
            className="p-2.5 border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-50 disabled:opacity-60 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Clients Billed"   value={stats.totalClients}            icon={Users}       color="blue"  />
          <StatCard label="Total Billed (₹)" value={fmtRupee(stats.totalBilled)}   icon={Receipt}     color="blue"  />
          <StatCard label="Collected (₹)"    value={fmtRupee(stats.totalPaid)}     icon={IndianRupee} color="green" />
          <StatCard label="Outstanding (₹)"  value={fmtRupee(stats.totalOutstanding)} icon={Clock}    color="amber" />
        </div>
      )}

      {/* ── Summary chips ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total',   value: summary.total,   cls: 'bg-slate-100 text-slate-700' },
          { label: 'Paid',    value: summary.paid,    cls: 'bg-green-100 text-green-700' },
          { label: 'Partial', value: summary.partial, cls: 'bg-orange-100 text-orange-700' },
          { label: 'Unpaid',  value: summary.unpaid,  cls: 'bg-amber-100 text-amber-700' },
        ].map(({ label, value, cls }) => (
          <span key={label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cls}`}>
            {label}: <span className="font-bold">{value}</span>
          </span>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search client…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm font-medium">
          {[{ v: '', l: 'All' }, { v: 'paid', l: 'Paid' }, { v: 'unpaid', l: 'Unpaid' }].map(({ v, l }) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3.5 py-2.5 transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative">
          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}
            className="pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer">
            <option value="">All Drivers</option>
            {drivers.map((d) => (<option key={d.id} value={d.id}>{d.user?.name} · Route {d.route}</option>))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {bills.length > 0 && (
          <button onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3 py-2.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 font-medium text-slate-600 transition-colors">
            {allSelected ? <><CheckSquare size={14} className="text-blue-700" /> Deselect All</> : <><Square size={14} /> Select All</>}
          </button>
        )}
      </div>

      {/* ── Bulk action bar ──────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-900 rounded-2xl text-white">
          <span className="text-sm font-semibold flex items-center gap-2"><Users size={15} /> {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''} selected</span>
          <div className="flex-1" />
          <button onClick={handleBulkDownload} disabled={bulkDling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 text-sm font-semibold transition-colors">
            {bulkDling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download PDFs
          </button>
          <button onClick={openBatchSend}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-sm font-semibold transition-colors">
            <MessageCircle size={13} /> Send WhatsApp ({selectedIds.size})
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"><X size={14} /></button>
        </div>
      )}

      {/* ── Desktop table ─────────────────────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-700 transition-colors">
                    {allSelected ? <CheckSquare size={15} className="text-blue-700" /> : <Square size={15} />}
                  </button>
                </th>
                {['Client', 'Driver', 'Bottles', 'Total Billed', 'Total Paid', 'Outstanding', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>))}
                  </tr>
                ))
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-20 text-slate-400">
                    <Receipt size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No invoiced deliveries for {MONTH_NAMES[month]} {year}</p>
                  </td>
                </tr>
              ) : bills.map((bill) => (
                <tr key={bill.clientId}
                  className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${selectedIds.has(bill.clientId) ? 'bg-blue-50/40' : ''}`}
                  onClick={() => setViewBill(bill)}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleSelect(bill.clientId)} className="text-slate-400 hover:text-blue-700 transition-colors">
                      {selectedIds.has(bill.clientId) ? <CheckSquare size={15} className="text-blue-700" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{bill.clientName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin size={9} /> {bill.route}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{bill.driverName}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-slate-700 font-semibold"><Package size={12} className="text-slate-400" />{bill.totalBottles}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtRupee(bill.totalBilled)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{fmtRupee(bill.totalPaid)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${bill.outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtRupee(bill.outstanding)}</span>
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={bill.status} /></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewBill(bill)} title="View invoice detail"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"><Eye size={14} /></button>
                      <button onClick={() => handleDownloadSingle(bill)} title="Download PDF"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-700 transition-colors"><Download size={14} /></button>
                      <button onClick={() => setViewBill(bill)} title="Send WhatsApp"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600 transition-colors"><MessageCircle size={14} /></button>
                      {bill.status !== 'PAID' && (
                        <button onClick={() => handleMarkPaid(bill)} title="Mark month paid"
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"><CheckCircle2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile cards ──────────────────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 animate-pulse">
              <div className="flex gap-3">
                <div className="w-4 h-4 bg-slate-200 rounded mt-0.5" />
                <div className="flex-1 space-y-2"><div className="h-4 bg-slate-200 rounded w-32" /><div className="h-3 bg-slate-200 rounded w-24" /></div>
              </div>
              <div className="grid grid-cols-3 gap-2"><div className="h-12 bg-slate-100 rounded-xl" /><div className="h-12 bg-slate-100 rounded-xl" /><div className="h-12 bg-slate-100 rounded-xl" /></div>
              <div className="h-9 bg-slate-100 rounded-lg" />
            </div>
          ))
        ) : bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Receipt size={36} className="opacity-30" />
            <p className="text-sm">No invoiced deliveries for {MONTH_NAMES[month]} {year}</p>
          </div>
        ) : bills.map((bill) => (
          <BillCard key={bill.clientId} bill={bill} selected={selectedIds.has(bill.clientId)}
            onSelect={toggleSelect} onView={setViewBill} onMarkPaid={handleMarkPaid} onDownload={handleDownloadSingle} />
        ))}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {viewBill && (
        <ClientBillingModal bill={viewBill} onClose={() => setViewBill(null)} onChanged={fetchBills} />
      )}
      {batchBills && (
        <BatchSendModal bills={batchBills} month={month} year={year} onClose={() => { setBatchBills(null); fetchBills(); }} />
      )}
    </div>
  );
}
