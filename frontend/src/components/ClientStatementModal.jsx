import { useEffect, useState, useRef, useMemo } from 'react';
import { X, Droplets, Printer, IndianRupee, CheckCircle, Clock, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import InvoiceDetailModal from './InvoiceDetailModal';

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function DeliveryStatusBadge({ isPaid, amountPaid, amount }) {
  if (isPaid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
        <CheckCircle size={11} /> Paid
      </span>
    );
  }
  if (Number(amountPaid) > 0) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold whitespace-nowrap">
          <Clock size={11} /> Partial
        </span>
        <span className="text-[10px] text-slate-400">Paid ₹{fmt(amountPaid)} of ₹{fmt(amount)}</span>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold whitespace-nowrap">
      <Clock size={11} /> Unpaid
    </span>
  );
}

export default function ClientStatementModal({ clientId, onClose }) {
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [paying, setPaying] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState(null);
  const overlayRef = useRef(null);

  async function fetchStatement() {
    try {
      const { data } = await api.get(`/api/clients/${clientId}/statement`);
      setStatement(data);
      setAmount(String(Number(data.summary.grandTotalDue).toFixed(2)));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const oldestUnpaidInvoiceId = useMemo(() => {
    if (!statement?.unpaidDeliveries?.length) return null;
    // unpaidDeliveries is newest-first — the last entry is the oldest.
    return statement.unpaidDeliveries[statement.unpaidDeliveries.length - 1].invoiceId;
  }, [statement]);

  const remainingAfterPayment = useMemo(() => {
    if (!statement) return 0;
    const paid = parseFloat(amount) || 0;
    return Number(statement.summary.grandTotalDue) - paid;
  }, [amount, statement]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleRecordPayment() {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (!oldestUnpaidInvoiceId) {
      toast.error('No unpaid invoices to pay against');
      return;
    }
    setPaying(true);
    try {
      await api.put(`/api/invoices/${oldestUnpaidInvoiceId}/record-payment`, {
        amountPaid: value,
        paymentMethod: method,
      });
      toast.success('Payment recorded');
      await fetchStatement();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to record payment');
    } finally {
      setPaying(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:bg-white print:p-0 print:static"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col print:max-w-full print:max-h-none print:shadow-none print:rounded-none">

        {/* Modal header (hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 print:hidden">
          <h2 className="text-lg font-bold text-slate-800">Client Statement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div id="statement-print-area" className="flex-1 overflow-y-auto p-6 print:p-0">
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !statement ? (
            <p className="text-center text-slate-500 py-8">Statement not found.</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden font-sans print:border-none print:rounded-none">

              {/* Header */}
              <div className="bg-blue-900 text-white px-6 py-5 flex items-center justify-between print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center print:hidden">
                    <Droplets size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-lg leading-none">Gajanan Aqua</p>
                    <p className="text-blue-300 text-xs mt-1 print:text-slate-500">Water Can Supply</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-300 uppercase tracking-wider font-semibold print:text-slate-500">Statement</p>
                  <p className="text-blue-300 text-xs mt-1 print:text-slate-500">Date: {fmtDate(new Date())}</p>
                </div>
              </div>

              {/* Client info */}
              <div className="px-6 py-4 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Statement For</p>
                <p className="font-semibold text-slate-800 text-base">{statement.client.name}</p>
                <p className="text-sm text-slate-600 mt-0.5">{statement.client.address}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  Route {statement.client.route} · Rate ₹{fmt(statement.client.ratePerBottle)}/bottle
                </p>
              </div>

              {/* Deliveries table */}
              <div className="px-6 py-4 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Unpaid Deliveries</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Date</th>
                        <th className="pb-2 pr-3 font-medium">Time</th>
                        <th className="pb-2 pr-3 font-medium">Description</th>
                        <th className="pb-2 pr-3 font-medium text-right">Qty</th>
                        <th className="pb-2 pr-3 font-medium text-right">Rate</th>
                        <th className="pb-2 pr-3 font-medium text-right">Amount</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        <th className="pb-2 font-medium print:hidden">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.unpaidDeliveries.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-400">
                            No unpaid deliveries — all clear!
                          </td>
                        </tr>
                      ) : (
                        statement.unpaidDeliveries.map((d) => (
                          <tr key={d.invoiceId} className="border-b border-slate-100 last:border-0">
                            <td className="py-2.5 pr-3 text-slate-700 whitespace-nowrap">{fmtDate(d.date)}</td>
                            <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">{fmtTime(d.date)}</td>
                            <td className="py-2.5 pr-3 text-slate-700">Water Cans</td>
                            <td className="py-2.5 pr-3 text-right text-slate-800 font-medium">{d.filledBottles}</td>
                            <td className="py-2.5 pr-3 text-right text-slate-600">₹{fmt(d.rate)}</td>
                            <td className="py-2.5 pr-3 text-right text-slate-800 font-semibold">₹{fmt(d.amount)}</td>
                            <td className="py-2.5 pr-3">
                              <DeliveryStatusBadge isPaid={d.isPaid} amountPaid={d.amountPaid} amount={d.amount} />
                            </td>
                            <td className="py-2.5 print:hidden">
                              <button
                                onClick={() => setDetailInvoiceId(d.invoiceId)}
                                title="View invoice detail"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Eye size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary */}
              <div className="px-6 py-4 border-b border-slate-200 flex justify-end">
                <div className="w-full sm:w-72 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Previous Outstanding</span>
                    <span className="text-slate-700 font-medium">₹{fmt(statement.summary.previousOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Today's Deliveries</span>
                    <span className="text-slate-700 font-medium">₹{fmt(statement.summary.todaysTotal)}</span>
                  </div>
                  <div className="border-t border-slate-200 my-1" />
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total Unpaid</span>
                    <span className="text-slate-700 font-medium">₹{fmt(statement.summary.totalUnpaid)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-slate-800 font-bold">GRAND TOTAL DUE</span>
                    <span className="text-blue-900 font-bold text-xl">₹{fmt(statement.summary.grandTotalDue)}</span>
                  </div>
                </div>
              </div>

              {/* Payment section (hidden on print) */}
              <div className="px-6 py-4 bg-slate-50 print:hidden">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <IndianRupee size={13} /> Record Payment
                </p>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="block text-xs text-slate-500 mb-1">Amount</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Method</label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
                      {['CASH', 'ONLINE'].map((m) => (
                        <button
                          key={m}
                          onClick={() => setMethod(m)}
                          className={`px-3.5 py-2 capitalize transition-colors ${
                            method === m ? 'bg-blue-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {m === 'CASH' ? 'Cash' : 'Online'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleRecordPayment}
                    disabled={paying || !oldestUnpaidInvoiceId}
                    className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {paying ? 'Recording…' : 'Record Payment'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Remaining after payment:{' '}
                  <span className={`font-semibold ${remainingAfterPayment > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ₹{fmt(Math.max(remainingAfterPayment, 0))}
                  </span>
                </p>
              </div>

              <div className="px-6 py-4 text-center text-xs text-slate-400 print:block hidden">
                Thank you for your business! 🙏
              </div>
            </div>
          )}
        </div>

        {/* Modal footer (hidden on print) */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 print:hidden">
          <button
            onClick={handlePrint}
            disabled={loading || !statement}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Printer size={15} /> Print Statement
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onChanged={fetchStatement}
        />
      )}
    </div>
  );
}
