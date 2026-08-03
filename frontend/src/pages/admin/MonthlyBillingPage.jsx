import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { QRCodeSVG } from 'qrcode.react';
import {
  Receipt, Download, MessageCircle, CheckCircle2, Search, X,
  Loader2, Phone, Package, ChevronDown, Check, Square,
  CheckSquare, FileText, MapPin, Send, Calendar, Users,
  RefreshCw, AlertCircle, Zap, Printer, Copy, Droplets,
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
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

async function downloadPDF(billId, filename) {
  const res = await api.get(`/api/monthly-bills/${billId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `invoice-${billId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function computeInvoiceNumber(bill) {
  const clientId = bill.clientId ?? bill.client?.id ?? '';
  return `BILL-${bill.year}-${String(bill.month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cls = {
    DRAFT: 'bg-slate-100 text-slate-600',
    SENT:  'bg-blue-100  text-blue-700',
    PAID:  'bg-green-100 text-green-700',
  }[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ─── InvoiceShareModal ────────────────────────────────────────────────────────

function ShareActionBtn({ iconBg, icon: Icon, label, subtitle, onClick, loading, done, doneLabel }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white
                 hover:bg-slate-50 disabled:opacity-60 transition-colors text-left group"
    >
      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
        {loading ? <Loader2 size={15} className="animate-spin text-white" /> : <Icon size={15} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-tight">
          {done ? (doneLabel ?? label) : label}
        </p>
        <p className="text-xs text-slate-400 leading-tight mt-0.5 truncate">{subtitle}</p>
      </div>
      {done && <Check size={14} className="text-green-500 shrink-0" />}
    </button>
  );
}

function InvoiceShareModal({ bill, onClose, onSent, onPaid }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);

  // per-action states
  const [waLoading, setWaLoading]   = useState(false);
  const [waDone, setWaDone]         = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDone, setPdfDone]       = useState(false);
  const [copied, setCopied]         = useState(false);
  const [marking, setMarking]       = useState(false);

  const invoiceRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/monthly-bills/${bill.id}`)
      .then(r => setDetail(r.data))
      .catch(() => toast.error('Failed to load bill details'))
      .finally(() => setLoading(false));
  }, [bill.id]);

  const d = detail ?? bill;
  const invoiceNumber = detail?.invoiceNumber ?? computeInvoiceNumber(bill);
  const driver = d.client?.assignedDriver;

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleWhatsApp() {
    setWaLoading(true);
    try {
      const clientName   = d.client?.name ?? 'Customer';
      const clientMobile = d.client?.mobile;
      const monthLabel   = `${MONTH_NAMES[d.month]} ${d.year}`;
      const message = [
        `Hi ${clientName},`,
        `Your water can invoice for ${monthLabel} is ready.`,
        `Bottles: ${d.totalBottlesDelivered} × ${fmtRupee(d.ratePerBottle)} = *${fmtRupee(d.totalAmount)}*`,
        `Invoice: ${invoiceNumber}`,
        `Status: ${d.status}`,
        `\nThank you — Gajanan Aqua`,
      ].join('\n');
      const url = buildWaUrl(clientMobile, message);
      // Download PDF + open WA simultaneously
      downloadPDF(bill.id, `${invoiceNumber}.pdf`).catch(() => {});
      window.open(url, '_blank', 'noopener,noreferrer');
      setWaDone(true);
      await api.put(`/api/monthly-bills/${bill.id}/mark-sent`).catch(() => {});
      onSent?.(bill.id);
    } catch {
      toast.error('Failed to open WhatsApp');
    } finally {
      setWaLoading(false);
    }
  }

  async function handleDownloadPDF() {
    setPdfLoading(true);
    try {
      await downloadPDF(bill.id, `${invoiceNumber}.pdf`);
      setPdfDone(true);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setPdfLoading(false);
    }
  }

  function handlePrint() {
    const b = d;
    const w = window.open('', '_blank', 'width=800,height=1100');
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
td{padding:10px 12px;border:1px solid #e2e8f0}
.total-row{text-align:right;font-size:16px;font-weight:800;color:#1e3a8a;padding:10px 0}
.status{display:inline-flex;align-items:center;padding:5px 14px;border-radius:999px;font-weight:700;font-size:12px}
.paid{background:#dcfce7;color:#15803d}.pending{background:#fef3c7;color:#d97706}
.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="header">
  <div><div class="logo">💧 Gajanan Aqua</div><div class="sub">Water Can Supply Co.</div></div>
  <div style="text-align:right">
    <div class="inv-label">Invoice</div>
    <div class="inv-num">${invoiceNumber}</div>
    <div class="inv-date">${MONTH_NAMES[b.month]} ${b.year}</div>
  </div>
</div>
<div class="parties">
  <div>
    <div class="party-label">Bill To</div>
    <div class="party-name">${b.client?.name ?? ''}</div>
    <div class="party-sub">${b.client?.address ?? ''}<br>📞 ${b.client?.mobile ?? ''}</div>
  </div>
  <div>
    <div class="party-label">Delivered By</div>
    <div class="party-name">${driver?.user?.name ?? '—'}</div>
    <div class="party-sub">${driver?.vehicleNumber ? driver.vehicleNumber + ' · ' + (driver.vehicleType ?? '') : ''}${driver?.route ? '<br>Route ' + driver.route : ''}</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Description</th>
    <th style="text-align:center">Qty</th>
    <th style="text-align:right">Rate</th>
    <th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody><tr>
    <td>Water Cans Delivered — ${MONTH_NAMES[b.month]} ${b.year}</td>
    <td style="text-align:center;font-weight:700">${b.totalBottlesDelivered}</td>
    <td style="text-align:right">₹${Number(b.ratePerBottle).toFixed(2)}</td>
    <td style="text-align:right;font-weight:700">₹${Number(b.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
  </tr></tbody>
</table>
<div class="total-row">Total Amount: ₹${Number(b.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
<div><span class="status ${b.status === 'PAID' ? 'paid' : 'pending'}">${b.status === 'PAID' ? '✅ PAID' : '⏳ PENDING PAYMENT'}</span></div>
<div class="footer">Gajanan Aqua · Water Can Delivery Management · Thank you for your business!</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 350);
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/admin/billing`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function handleMarkPaid() {
    if (!window.confirm(`Mark ${d.client?.name} as PAID?`)) return;
    setMarking(true);
    try {
      const res = await api.put(`/api/monthly-bills/${bill.id}/mark-paid`);
      setDetail(prev => prev ? { ...prev, status: 'PAID', paidAt: res.data.paidAt } : prev);
      onPaid?.(bill.id);
      toast.success('Marked as paid');
    } catch {
      toast.error('Failed to mark as paid');
    } finally {
      setMarking(false);
    }
  }

  const isPaid = d.status === 'PAID';

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content
          className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[95vw] max-w-[720px] max-h-[92vh]
                     bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden
                     data-[state=open]:animate-in data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                     data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
                     duration-200"
          onOpenAutoFocus={e => e.preventDefault()}
        >
          {/* ── Title bar ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Dialog.Title className="font-bold text-slate-800 text-sm truncate">
                Invoice #{invoiceNumber}
              </Dialog.Title>
              <StatusBadge status={d.status} />
            </div>
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0 transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* ── Two-column body ─────────────────────────────────────────────── */}
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

            {/* LEFT: Invoice preview */}
            <div className="flex-1 overflow-y-auto p-5" ref={invoiceRef}>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-7 bg-slate-100 rounded animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
                  ))}
                </div>
              ) : (
                <div className="space-y-4 text-sm">

                  {/* Invoice header */}
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
                      <p className="text-slate-400 text-xs mt-0.5">{MONTH_NAMES[d.month]} {d.year}</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-200" />

                  {/* Bill To / Delivered By */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
                      <p className="font-bold text-slate-800">{d.client?.name}</p>
                      <p className="text-slate-500 text-xs mt-1 leading-relaxed">{d.client?.address}</p>
                      <p className="text-slate-500 text-xs flex items-center gap-1 mt-1">
                        <Phone size={9} /> {d.client?.mobile}
                      </p>
                      <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                        <MapPin size={9} /> {d.client?.route}
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3">
                      <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Delivered By</p>
                      <p className="font-bold text-slate-800">{driver?.user?.name ?? '—'}</p>
                      {driver?.vehicleNumber && (
                        <p className="text-slate-500 text-xs mt-1">
                          {driver.vehicleNumber} · {driver.vehicleType}
                        </p>
                      )}
                      {driver?.route && (
                        <p className="text-slate-500 text-xs mt-0.5">Route {driver.route}</p>
                      )}
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-dashed border-slate-100">
                          <td className="px-3 py-2.5 text-slate-700 font-medium">
                            Water Cans Delivered
                            <span className="text-slate-400 ml-1">({MONTH_NAMES[d.month]} {d.year})</span>
                          </td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-800">{d.totalBottlesDelivered}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{fmtRupee(d.ratePerBottle)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800">{fmtRupee(d.totalAmount)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {/* Total row */}
                    <div className="flex justify-end items-center gap-4 px-3 py-2.5 bg-slate-50">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Amount</span>
                      <span className="font-bold text-blue-900 text-base">{fmtRupee(d.totalAmount)}</span>
                    </div>
                  </div>

                  {/* QR payment box */}
                  {detail?.paymentQrData ? (
                    <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="bg-white rounded-lg p-1.5 border border-slate-200 shrink-0">
                        <QRCodeSVG value={detail.paymentQrData} size={64} level="M" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Scan to pay</p>
                        <p className="font-bold text-slate-700 text-xs mt-0.5 font-mono">
                          {detail.paymentQrData.match(/pa=([^&]+)/)?.[1] ?? ''}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">UPI · {fmtRupee(d.totalAmount)}</p>
                      </div>
                    </div>
                  ) : null}

                  {/* Status badge */}
                  <div>
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                        ✅ PAID · {fmtDate(d.paidAt)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                        ⏳ PENDING PAYMENT
                      </span>
                    )}
                  </div>

                  {/* Delivery breakdown (collapsible detail) */}
                  {detail?.deliveries?.length > 0 && (
                    <details className="border border-slate-100 rounded-xl overflow-hidden">
                      <summary className="px-3 py-2 text-xs font-semibold text-slate-500 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                        Delivery Breakdown ({detail.deliveries.length} deliveries)
                      </summary>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="px-3 py-2 text-left font-semibold text-slate-400">Date</th>
                            <th className="px-3 py-2 text-center font-semibold text-slate-400">Filled</th>
                            <th className="px-3 py-2 text-center font-semibold text-slate-400">Empty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {detail.deliveries.map((del, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 text-slate-600">{fmtDate(del.deliveryDate)}</td>
                              <td className="px-3 py-2 text-center font-medium">{del.filledBottlesDelivered}</td>
                              <td className="px-3 py-2 text-center text-slate-400">{del.emptyBottlesCollected}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Share actions panel */}
            <div className="w-full md:w-[220px] shrink-0 bg-slate-50 border-t md:border-t-0 md:border-l border-slate-100 p-4 flex flex-col gap-3 overflow-y-auto">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Share Invoice</p>

              {/* WhatsApp */}
              <ShareActionBtn
                iconBg="bg-green-500"
                icon={MessageCircle}
                label="WhatsApp"
                subtitle="Opens WA + downloads PDF"
                onClick={handleWhatsApp}
                loading={waLoading}
                done={waDone}
                doneLabel="Sent ✅"
              />

              {/* Download PDF */}
              <ShareActionBtn
                iconBg="bg-blue-600"
                icon={Download}
                label="Download PDF"
                subtitle="Save to device"
                onClick={handleDownloadPDF}
                loading={pdfLoading}
                done={pdfDone}
                doneLabel="Downloaded ✅"
              />

              <div className="border-t border-slate-200" />

              {/* Print */}
              <ShareActionBtn
                iconBg="bg-slate-500"
                icon={Printer}
                label="Print"
                subtitle="Browser print dialog"
                onClick={handlePrint}
                loading={false}
                done={false}
              />

              {/* Copy link */}
              <ShareActionBtn
                iconBg="bg-purple-500"
                icon={Copy}
                label="Copy link"
                subtitle="Billing page URL"
                onClick={handleCopyLink}
                loading={false}
                done={copied}
                doneLabel="Copied!"
              />

              <div className="border-t border-slate-200" />

              {/* Sent status */}
              {d.whatsappSentAt ? (
                <div className="flex items-start gap-2 text-xs text-green-600">
                  <Check size={13} className="mt-0.5 shrink-0" />
                  <span>Sent via WhatsApp on {fmtDate(d.whatsappSentAt)}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Not yet shared via WhatsApp</p>
              )}

              {/* Mark Paid */}
              {!isPaid && (
                <button
                  onClick={handleMarkPaid}
                  disabled={marking}
                  className="mt-auto w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg
                             border-2 border-green-500 text-green-600 font-semibold text-sm
                             hover:bg-green-50 disabled:opacity-60 transition-colors"
                >
                  {marking ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Mark as Paid
                </button>
              )}
              {isPaid && (
                <div className="mt-auto flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  <span className="text-xs text-green-700 font-semibold">Paid on {fmtDate(d.paidAt)}</span>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── BatchSendModal ───────────────────────────────────────────────────────────

function BatchSendModal({ bills, onClose, onBatchSent }) {
  const [links, setLinks]   = useState({});
  const [status, setStatus] = useState(() =>
    Object.fromEntries(bills.map(b => [b.id, 'idle']))
  );
  const [linksLoading, setLinksLoading] = useState(true);

  useEffect(() => {
    // Build WA links client-side — no extra API call needed
    const map = {};
    bills.forEach(b => {
      const clientName  = b.client?.name ?? 'Customer';
      const monthLabel  = `${MONTH_NAMES[b.month]} ${b.year}`;
      const invNum      = computeInvoiceNumber(b);
      const message = [
        `Hi ${clientName},`,
        `Your water can invoice for ${monthLabel} is ready.`,
        `Bottles: ${b.totalBottlesDelivered} × ${fmtRupee(b.ratePerBottle)} = *${fmtRupee(b.totalAmount)}*`,
        `Invoice: ${invNum}`,
        `\nThank you — Gajanan Aqua`,
      ].join('\n');
      map[b.id] = { url: buildWaUrl(b.client?.mobile, message) };
    });
    setLinks(map);
    setLinksLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendBill(billId) {
    const bill = bills.find(b => b.id === billId);
    const link = links[billId];
    if (!link) return;
    setStatus(s => ({ ...s, [billId]: 'sending' }));
    try {
      downloadPDF(billId, `invoice-${bill.client?.name}.pdf`).catch(() => {});
      window.open(link.url, '_blank', 'noopener,noreferrer');
      setTimeout(async () => {
        try {
          await api.put(`/api/monthly-bills/${billId}/mark-sent`);
          setStatus(s => ({ ...s, [billId]: 'done' }));
          onBatchSent(billId);
        } catch {
          setStatus(s => ({ ...s, [billId]: 'error' }));
        }
      }, 3000);
    } catch {
      setStatus(s => ({ ...s, [billId]: 'error' }));
    }
  }

  const doneCount    = Object.values(status).filter(s => s === 'done').length;
  const sendingCount = Object.values(status).filter(s => s === 'sending').length;
  const total        = bills.length;
  const pct          = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const pending      = bills.filter(b => status[b.id] === 'idle' || status[b.id] === 'error');
  const done         = bills.filter(b => status[b.id] === 'done');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800">Batch WhatsApp Send</h2>
            <p className="text-slate-500 text-sm">{doneCount}/{total} sent</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-3 border-b border-slate-50">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>{doneCount} sent · {sendingCount > 0 ? `${sendingCount} in progress · ` : ''}{pending.length} pending</span>
            <span className="font-semibold text-blue-900">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
          {linksLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-900" />
            </div>
          ) : (
            <>
              {pending.map(bill => (
                <div key={bill.id} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{bill.client?.name}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone size={10} /> {bill.client?.mobile}
                      <span className="mx-1">·</span>
                      {fmtRupee(bill.totalAmount)}
                    </p>
                  </div>
                  {status[bill.id] === 'error' && (
                    <span className="text-xs text-red-500 font-medium">Failed</span>
                  )}
                  <button
                    onClick={() => sendBill(bill.id)}
                    disabled={status[bill.id] === 'sending' || !links[bill.id]}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-bold transition-colors"
                  >
                    {status[bill.id] === 'sending' ? (
                      <><Loader2 size={12} className="animate-spin" /> Sending…</>
                    ) : (
                      <><Send size={12} /> Send</>
                    )}
                  </button>
                </div>
              ))}
              {done.length > 0 && (
                <>
                  <div className="px-6 py-2 bg-green-50">
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">✅ Sent ({done.length})</p>
                  </div>
                  {done.map(bill => (
                    <div key={bill.id} className="flex items-center gap-4 px-6 py-3 bg-green-50/40">
                      <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-600 text-sm truncate">{bill.client?.name}</p>
                        <p className="text-xs text-slate-400">{fmtRupee(bill.totalAmount)}</p>
                      </div>
                      <StatusBadge status="SENT" />
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-semibold text-sm transition-colors">
            {doneCount === total ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BillCard (mobile) ────────────────────────────────────────────────────────

function BillCard({ bill, selected, onSelect, onShare, onMarkPaid, onDownload }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 space-y-3 transition-colors ${
      selected ? 'border-blue-300 bg-blue-50/30' : 'border-slate-100'}`}>
      <div className="flex items-start gap-3">
        <button onClick={() => onSelect(bill.id)}
          className="mt-0.5 shrink-0 text-slate-400 hover:text-blue-700 transition-colors">
          {selected ? <CheckSquare size={16} className="text-blue-700" /> : <Square size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-800 truncate">{bill.client?.name}</p>
            <StatusBadge status={bill.status} />
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <Phone size={10} /> {bill.client?.mobile}
          </p>
        </div>
      </div>
      <div className="flex gap-2 text-sm">
        <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2">
          <p className="text-xs text-slate-400">Bottles</p>
          <p className="font-semibold text-slate-700">{bill.totalBottlesDelivered}</p>
        </div>
        <div className="flex-1 bg-blue-50 rounded-xl px-3 py-2">
          <p className="text-xs text-blue-400">Amount</p>
          <p className="font-bold text-blue-900">{fmtRupee(bill.totalAmount)}</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <button onClick={() => onShare(bill)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs font-medium transition-colors">
          <FileText size={13} /> View
        </button>
        <button onClick={() => onDownload(bill)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 text-xs font-medium transition-colors">
          <Download size={13} /> PDF
        </button>
        <button onClick={() => onShare(bill)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 text-xs font-medium transition-colors">
          <MessageCircle size={13} /> Share
        </button>
        {bill.status !== 'PAID' && (
          <button onClick={() => onMarkPaid(bill)}
            className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-xs font-medium transition-colors">
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
  const [selectedIdx, setSelectedIdx] = useState(1);
  const { month, year } = MONTH_OPTIONS[selectedIdx];

  const [bills, setBills]       = useState([]);
  const [stats, setStats]       = useState(null);
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);

  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDling, setBulkDling]     = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  // single modal state replaces previewBill + whatsappBill
  const [shareBill, setShareBill]   = useState(null);
  const [batchBills, setBatchBills] = useState(null);

  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  useEffect(() => {
    api.get('/api/drivers').then(r => setDrivers(r.data)).catch(() => {});
  }, []);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month, year });
      if (statusFilter)    params.set('status',   statusFilter);
      if (driverFilter)    params.set('driverId', driverFilter);
      if (debouncedSearch) params.set('search',   debouncedSearch);
      const res = await api.get(`/api/monthly-bills?${params}`);
      setBills(res.data.bills);
      setStats(res.data.stats);
    } catch {
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, [month, year, statusFilter, driverFilter, debouncedSearch]);

  useEffect(() => { fetchBills(); }, [fetchBills]);
  useEffect(() => { setSelectedIds(new Set()); }, [month, year]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await api.post('/api/monthly-bills/generate', { month, year });
      toast.success(`Generated ${res.data.generated} bills (${res.data.skipped} skipped — no deliveries)`);
      fetchBills();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleMarkPaid(bill) {
    if (!confirm(`Mark ${bill.client?.name} as PAID?`)) return;
    try {
      await api.put(`/api/monthly-bills/${bill.id}/mark-paid`);
      toast.success('Marked as paid');
      fetchBills();
    } catch { toast.error('Failed'); }
  }

  async function handleDownloadSingle(bill) {
    const tid = toast.loading('Generating PDF…');
    try {
      await downloadPDF(bill.id, `invoice-${bill.client?.name}-${MONTH_NAMES[month]}-${year}.pdf`);
      toast.success('PDF downloaded', { id: tid });
    } catch { toast.error('Download failed', { id: tid }); }
  }

  async function handleBulkDownload() {
    const ids = [...selectedIds];
    setBulkDling(true);
    const tid = toast.loading(`Downloading ${ids.length} PDFs…`);
    let done = 0;
    for (const id of ids) {
      const bill = bills.find(b => b.id === id);
      try {
        await downloadPDF(id, `invoice-${bill?.client?.name}-${MONTH_NAMES[month]}-${year}.pdf`);
        done++;
        toast.loading(`${done}/${ids.length} downloaded…`, { id: tid });
        await new Promise(r => setTimeout(r, 400));
      } catch { /* skip */ }
    }
    toast.success(`${done} PDFs downloaded`, { id: tid });
    setBulkDling(false);
  }

  async function handleBulkMarkSent() {
    const ids = [...selectedIds];
    setBulkSending(true);
    try {
      const res = await api.put('/api/monthly-bills/bulk-mark-sent', { ids });
      toast.success(`${res.data.updated} bills marked as sent`);
      setSelectedIds(new Set());
      fetchBills();
    } catch { toast.error('Bulk update failed'); }
    finally { setBulkSending(false); }
  }

  function openBatchSend() {
    setBatchBills(bills.filter(b => selectedIds.has(b.id)));
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allSelected = bills.length > 0 && bills.every(b => selectedIds.has(b.id));
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(bills.map(b => b.id)));
  }

  function handleBillSent(billId) {
    setBills(prev => prev.map(b => b.id === billId ? { ...b, status: 'SENT' } : b));
  }

  function handleBillPaid(billId) {
    setBills(prev => prev.map(b => b.id === billId ? { ...b, status: 'PAID' } : b));
  }

  const summary = useMemo(() => {
    const draft   = bills.filter(b => b.status === 'DRAFT').length;
    const sent    = bills.filter(b => b.status === 'SENT').length;
    const paid    = bills.filter(b => b.status === 'PAID').length;
    return { total: bills.length, draft, sent, paid, pending: draft + sent };
  }, [bills]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">Monthly Billing</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generate and send monthly invoices to clients</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={selectedIdx}
              onChange={e => setSelectedIdx(Number(e.target.value))}
              className="pl-8 pr-8 py-2.5 text-sm font-medium border border-slate-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer"
            >
              {MONTH_OPTIONS.map((opt, i) => (
                <option key={i} value={i}>{MONTH_NAMES[opt.month]} {opt.year}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            Generate Bills
          </button>
          <button onClick={fetchBills} disabled={loading}
            className="p-2.5 border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-50 disabled:opacity-60 transition-colors">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Summary chips ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total',   value: summary.total,   cls: 'bg-slate-100 text-slate-700' },
          { label: 'Draft',   value: summary.draft,   cls: 'bg-slate-100 text-slate-600' },
          { label: 'Sent',    value: summary.sent,    cls: 'bg-blue-100  text-blue-700'  },
          { label: 'Paid',    value: summary.paid,    cls: 'bg-green-100 text-green-700' },
          { label: 'Pending', value: summary.pending, cls: 'bg-amber-100 text-amber-700' },
        ].map(({ label, value, cls }) => (
          <span key={label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${cls}`}>
            {label}: <span className="font-bold">{value}</span>
          </span>
        ))}
        {stats && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
            Revenue: <span className="font-bold">{fmtRupee(stats.totalAmount)}</span>
          </span>
        )}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search client…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer">
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="PAID">Paid</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
            className="pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-900 cursor-pointer">
            <option value="">All Drivers</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.user?.name} · Route {d.route}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {bills.length > 0 && (
          <button onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3 py-2.5 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 font-medium text-slate-600 transition-colors">
            {allSelected
              ? <><CheckSquare size={14} className="text-blue-700" /> Deselect All</>
              : <><Square size={14} /> Select All</>}
          </button>
        )}
      </div>

      {/* ── Bulk action bar ──────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-900 rounded-2xl text-white">
          <span className="text-sm font-semibold flex items-center gap-2">
            <Users size={15} /> {selectedIds.size} client{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex-1" />
          <button onClick={handleBulkDownload} disabled={bulkDling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 text-sm font-semibold transition-colors">
            {bulkDling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Download PDFs
          </button>
          <button onClick={openBatchSend}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-sm font-semibold transition-colors">
            <MessageCircle size={13} /> Send WhatsApp ({selectedIds.size})
          </button>
          <button onClick={handleBulkMarkSent} disabled={bulkSending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-60 text-sm font-semibold transition-colors">
            {bulkSending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Mark All Sent
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
            <X size={14} />
          </button>
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
                {['Client','Mobile','Driver','Bottles','Amount','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : bills.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-20 text-slate-400">
                    <Receipt size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No bills found for {MONTH_NAMES[month]} {year}</p>
                    <p className="text-xs mt-1">Click "Generate Bills" to create them</p>
                  </td>
                </tr>
              ) : bills.map(bill => (
                <tr key={bill.id}
                  className={`hover:bg-slate-50/60 transition-colors ${selectedIds.has(bill.id) ? 'bg-blue-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleSelect(bill.id)} className="text-slate-400 hover:text-blue-700 transition-colors">
                      {selectedIds.has(bill.id) ? <CheckSquare size={15} className="text-blue-700" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{bill.client?.name}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin size={9} /> {bill.client?.route}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{bill.client?.mobile}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{bill.client?.assignedDriver?.user?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                      <Package size={12} className="text-slate-400" />{bill.totalBottlesDelivered}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtRupee(bill.totalAmount)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={bill.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {/* View / Share — opens InvoiceShareModal */}
                      <button onClick={() => setShareBill(bill)} title="View & Share Invoice"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                        <FileText size={14} />
                      </button>
                      <button onClick={() => handleDownloadSingle(bill)} title="Download PDF"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-700 transition-colors">
                        <Download size={14} />
                      </button>
                      <button onClick={() => setShareBill(bill)} title="Send WhatsApp"
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600 transition-colors">
                        <MessageCircle size={14} />
                      </button>
                      {bill.status !== 'PAID' && (
                        <button onClick={() => handleMarkPaid(bill)} title="Mark as Paid"
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                          <CheckCircle2 size={14} />
                        </button>
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
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-32" />
                  <div className="h-3 bg-slate-200 rounded w-24" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-12 bg-slate-100 rounded-xl" />
                <div className="h-12 bg-slate-100 rounded-xl" />
              </div>
              <div className="h-9 bg-slate-100 rounded-lg" />
            </div>
          ))
        ) : bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Receipt size={36} className="opacity-30" />
            <p className="text-sm">No bills for {MONTH_NAMES[month]} {year}</p>
            <button onClick={handleGenerate} disabled={generating}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-blue-900 text-white text-sm font-semibold rounded-xl">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Generate Bills
            </button>
          </div>
        ) : bills.map(bill => (
          <BillCard
            key={bill.id}
            bill={bill}
            selected={selectedIds.has(bill.id)}
            onSelect={toggleSelect}
            onShare={setShareBill}
            onMarkPaid={handleMarkPaid}
            onDownload={handleDownloadSingle}
          />
        ))}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {shareBill && (
        <InvoiceShareModal
          bill={shareBill}
          onClose={() => setShareBill(null)}
          onSent={id => { handleBillSent(id); }}
          onPaid={id => { handleBillPaid(id); }}
        />
      )}
      {batchBills && (
        <BatchSendModal
          bills={batchBills}
          onClose={() => { setBatchBills(null); fetchBills(); }}
          onBatchSent={handleBillSent}
        />
      )}
    </div>
  );
}
