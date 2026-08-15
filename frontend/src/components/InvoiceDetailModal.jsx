import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, CheckCircle, Clock, Droplets, FileText, CheckCheck, Trash2, RotateCcw,
} from 'lucide-react';

function fmt(n) {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Per-invoice detail + admin actions (mark paid/unpaid, delete). Opened from
// within a client's statement — the consolidated Invoices page only shows
// one row per client, so individual invoice detail lives here.
export default function InvoiceDetailModal({ invoiceId, onClose, onChanged }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update invoice');
    } finally {
      setPaying(false);
    }
  }

  async function handleMarkUnpaid() {
    if (!window.confirm('Reset this invoice to unpaid? This undoes the recorded payment and adds the full amount back to the outstanding balance.')) return;
    setPaying(true);
    try {
      await api.put(`/api/invoices/${invoiceId}/status`, { isPaid: false });
      toast.success('Invoice reset to unpaid');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update invoice');
    } finally {
      setPaying(false);
    }
  }

  async function handleDelete() {
    const warn = invoice?.isPaid ? ' This invoice is already PAID — deleting it will still reverse its balance contribution correctly, but the payment record stays separate.' : '';
    if (!window.confirm(`Permanently delete invoice ${invoice?.invoiceNumber}?${warn}`)) return;
    setDeleting(true);
    try {
      await api.delete(`/api/invoices/${invoiceId}`);
      toast.success('Invoice deleted');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete invoice');
    } finally {
      setDeleting(false);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  const driver = invoice?.delivery?.driver?.user;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
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
                    <p className="font-bold text-lg leading-none">Gajanan Aqua</p>
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
                    <p className="font-semibold text-slate-800">{driver.name}</p>
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
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200">
          {invoice && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-60 transition-colors"
            >
              <Trash2 size={15} />
              {deleting ? 'Deleting…' : 'Delete Invoice'}
            </button>
          )}
          <div className="flex items-center gap-3">
            {invoice && invoice.isPaid && (
              <button
                onClick={handleMarkUnpaid}
                disabled={paying}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-50 disabled:opacity-60 transition-colors"
              >
                <RotateCcw size={15} />
                {paying ? 'Updating…' : 'Reset to Unpaid'}
              </button>
            )}
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
    </div>
  );
}
