import { useEffect, useState, useMemo, useRef } from 'react';
import { X, History, Droplets, IndianRupee, Wallet, Trash2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = {
    blue:  'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red:   'bg-red-50 text-red-700',
    slate: 'bg-slate-50 text-slate-700',
  };
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 ${tones[tone]}`}>
      <div className="p-2 rounded-lg bg-white/60">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-70 truncate">{label}</p>
        <p className="text-lg font-bold truncate">{value}</p>
      </div>
    </div>
  );
}

export default function ClientHistoryModal({ client, onClose }) {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const overlayRef = useRef(null);

  const [date, setDate] = useState(todayISO());
  const [bottles, setBottles] = useState('');
  const [rate, setRate] = useState(String(Number(client.ratePerBottle ?? 50)));
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('NONE');
  const [note, setNote] = useState('');

  async function fetchSummary() {
    try {
      const { data } = await api.get(`/api/clients/${client.id}/summary`);
      setSummary(data);
    } catch {
      toast.error('Failed to load account summary');
    } finally {
      setLoadingSummary(false);
    }
  }

  async function fetchRecords() {
    try {
      const { data } = await api.get(`/api/clients/${client.id}/historical-record`);
      setRecords(data);
    } catch {
      toast.error('Failed to load historical records');
    } finally {
      setLoadingRecords(false);
    }
  }

  useEffect(() => {
    fetchSummary();
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const totalAmount = useMemo(() => {
    const b = parseFloat(bottles) || 0;
    const r = parseFloat(rate) || 0;
    return b * r;
  }, [bottles, rate]);

  const remaining = useMemo(() => {
    const paid = parseFloat(amountPaid) || 0;
    return totalAmount - paid;
  }, [totalAmount, amountPaid]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  function resetForm() {
    setDate(todayISO());
    setBottles('');
    setRate(String(Number(client.ratePerBottle ?? 50)));
    setAmountPaid('0');
    setPaymentMethod('NONE');
    setNote('');
  }

  async function handleAddRecord() {
    const b = parseInt(bottles, 10);
    const r = parseFloat(rate);
    const paid = parseFloat(amountPaid) || 0;
    if (!date) return toast.error('Select a date');
    if (isNaN(b) || b <= 0) return toast.error('Enter a valid bottle count');
    if (isNaN(r) || r <= 0) return toast.error('Enter a valid rate');
    if (paid < 0) return toast.error('Amount paid cannot be negative');

    setSubmitting(true);
    try {
      await api.post(`/api/clients/${client.id}/historical-record`, {
        date,
        bottlesDelivered: b,
        ratePerBottle: r,
        amountPaid: paid,
        paymentMethod: paymentMethod === 'NONE' ? null : paymentMethod,
        note: note || undefined,
      });
      toast.success('Historical record added');
      resetForm();
      fetchSummary();
      fetchRecords();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add record');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(invoiceId) {
    if (!confirm('Delete this historical record? This reverses its effect on the outstanding balance and cannot be undone.')) return;
    setDeletingId(invoiceId);
    try {
      await api.delete(`/api/clients/${client.id}/historical-record/${invoiceId}`);
      toast.success('Record deleted, balance reversed');
      fetchSummary();
      fetchRecords();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete record');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <History size={20} className="text-blue-600" />
            Past Records — {client.name}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Account summary */}
          {loadingSummary ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label="Total Bottles" value={summary.totalBottlesDelivered} icon={Droplets} tone="blue" />
              <SummaryCard label="Total Billed" value={`₹${fmt(summary.totalAmountBilled)}`} icon={IndianRupee} tone="slate" />
              <SummaryCard label="Total Paid" value={`₹${fmt(summary.totalPaid)}`} icon={Wallet} tone="green" />
              <SummaryCard
                label="Outstanding"
                value={`₹${fmt(summary.outstandingBalance)}`}
                icon={IndianRupee}
                tone={summary.outstandingBalance > 0 ? 'red' : 'green'}
              />
            </div>
          )}

          {/* Add past record form */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Plus size={15} /> Add Past Record
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Date</label>
                <input
                  type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Bottles Delivered</label>
                <input
                  type="number" min="1" value={bottles} onChange={(e) => setBottles(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rate per Bottle (₹)</label>
                <input
                  type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Total Amount</label>
                <div className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-600 font-semibold">
                  ₹{fmt(totalAmount)}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Amount Paid (₹)</label>
                <input
                  type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Remaining</label>
                <div className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{fmt(remaining)}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment Method</label>
                <select
                  value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NONE">None</option>
                  <option value="CASH">Cash</option>
                  <option value="ONLINE">Online</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Note (optional)</label>
                <input
                  type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Carried over from paper ledger"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={handleAddRecord}
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add Record'}
            </button>
          </div>

          {/* Historical records table */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Historical Records</p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Date', 'Bottles', 'Rate', 'Total', 'Paid', 'Remaining', 'Method', 'Note', ''].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingRecords ? (
                      [...Array(3)].map((_, i) => (
                        <tr key={i}>
                          {[...Array(9)].map((_, j) => (
                            <td key={j} className="px-3 py-2"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    ) : records.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-slate-400 text-sm">
                          No historical records yet
                        </td>
                      </tr>
                    ) : records.map((r) => {
                      const remainingAmt = Number(r.totalAmount) - Number(r.amountPaid);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap text-xs">{fmtDate(r.delivery?.deliveryDate)}</td>
                          <td className="px-3 py-2 text-slate-700 font-medium text-center">{r.delivery?.filledBottlesDelivered}</td>
                          <td className="px-3 py-2 text-slate-600">₹{fmt(r.amountPerBottle)}</td>
                          <td className="px-3 py-2 text-slate-800 font-semibold whitespace-nowrap">₹{fmt(r.totalAmount)}</td>
                          <td className="px-3 py-2 text-green-700 whitespace-nowrap">₹{fmt(r.amountPaid)}</td>
                          <td className={`px-3 py-2 font-semibold whitespace-nowrap ${remainingAmt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            ₹{fmt(remainingAmt)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.paymentMethod ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.paymentMethod === 'CASH' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                {r.paymentMethod}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate" title={r.delivery?.notes ?? ''}>
                            {r.delivery?.notes ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={deletingId === r.id}
                              title="Delete record"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
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
