import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, ChevronLeft, ChevronRight, Pencil, Trash2,
  Droplets, CheckCircle, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function EditDeliveryModal({ delivery, onClose, onSaved }) {
  const [filled, setFilled] = useState(String(delivery.filledBottlesDelivered));
  const [empty, setEmpty] = useState(String(delivery.emptyBottlesCollected));
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef(null);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleSave() {
    const f = parseInt(filled, 10);
    const e = parseInt(empty, 10);
    if (isNaN(f) || f < 0 || isNaN(e) || e < 0) {
      toast.error('Enter valid non-negative bottle counts');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/deliveries/${delivery.id}`, {
        filledBottlesDelivered: f,
        emptyBottlesCollected: e,
      });
      toast.success('Delivery updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update delivery');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={overlayRef} onClick={handleOverlayClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Edit Delivery</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            {delivery.client?.name} · {fmtDate(delivery.deliveryDate)}
          </p>
          {delivery.invoice && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This delivery has an invoice (₹{fmt(delivery.invoice.totalAmount)}). Changing the filled count will
              recalculate the invoice amount and adjust the client's outstanding balance by the difference.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Filled Bottles</label>
              <input
                type="number" min="0" value={filled} onChange={(e) => setFilled(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Empty Bottles</label>
              <input
                type="number" min="0" value={empty} onChange={(e) => setEmpty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const LIMIT = 20;

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editDelivery, setEditDelivery] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const { data } = await api.get(`/api/deliveries?${params}`);
      setDeliveries(data.deliveries);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  async function handleDelete(d) {
    const invoiceLine = d.invoice
      ? `\n\nThis will also delete its invoice (${d.invoice.invoiceNumber}, ₹${fmt(d.invoice.totalAmount)}) and reverse the client's outstanding balance and inventory.`
      : '\n\nThis will also reverse the inventory adjustment it made.';
    if (!confirm(`Delete this delivery to ${d.client?.name} on ${fmtDate(d.deliveryDate)}?${invoiceLine}`)) return;
    setDeletingId(d.id);
    try {
      await api.delete(`/api/deliveries/${d.id}`);
      toast.success('Delivery deleted');
      fetchDeliveries();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete delivery');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Deliveries</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage every delivery record — {total} total</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name or mobile…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Date', 'Client', 'Driver', 'Filled', 'Empty', 'Invoice', 'Status', 'Actions'].map((h) => (
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
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : deliveries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <Droplets size={32} className="mx-auto mb-2 opacity-30" />
                    No deliveries found
                  </td>
                </tr>
              ) : deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(d.deliveryDate)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{d.client?.name}</p>
                    <p className="text-xs text-slate-400">{d.client?.mobile}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{d.driver?.user?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium text-center">{d.filledBottlesDelivered}</td>
                  <td className="px-4 py-3 text-slate-600 text-center">{d.emptyBottlesCollected}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {d.invoice ? (
                      <span className="text-slate-600 text-xs">₹{fmt(d.invoice.totalAmount)}</span>
                    ) : (
                      <span className="text-slate-300 text-xs">No invoice</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!d.invoice ? (
                      <span className="text-slate-300 text-xs">—</span>
                    ) : d.invoice.isPaid ? (
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
                        onClick={() => setEditDelivery(d)}
                        title="Edit delivery"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(d)}
                        disabled={deletingId === d.id}
                        title="Delete delivery"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-500">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} deliveries
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-slate-700 px-1">Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {editDelivery && (
        <EditDeliveryModal
          delivery={editDelivery}
          onClose={() => setEditDelivery(null)}
          onSaved={() => { setEditDelivery(null); fetchDeliveries(); }}
        />
      )}
    </div>
  );
}
