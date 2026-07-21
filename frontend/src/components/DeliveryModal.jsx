import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X, Phone, MapPin, Truck, PackageCheck,
  CheckCircle2, Minus, Plus, ReceiptText,
  Loader2, AlertCircle, ArrowRight, Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';
import InvoiceView from './InvoiceView';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return null;
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Step dots ───────────────────────────────────────────────────────────────

const STEPS = ['info', 'delivery', 'invoice', 'view'];

function StepDots({ current, skipped }) {
  const currentIdx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {STEPS.map((s, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        const isSkip  = skipped && s === 'delivery';
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`transition-all duration-300 rounded-full flex items-center justify-center
                ${active  ? 'w-6 h-6 bg-blue-900 ring-2 ring-blue-900/30' : ''}
                ${done    ? 'w-5 h-5 bg-blue-900' : ''}
                ${!active && !done ? 'w-3 h-3 bg-slate-200' : ''}
                ${isSkip  ? 'opacity-40' : ''}
              `}
            >
              {done && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {active && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 rounded-full transition-colors duration-300 ${i < currentIdx ? 'bg-blue-900' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Stock bar ────────────────────────────────────────────────────────────────

function StockBar({ inventory, updated }) {
  if (!inventory) return null;

  const filled = updated
    ? (inventory.totalFilled  ?? inventory.totalFilledBottles ?? 0)
    : (inventory.totalFilledBottles ?? 0);
  const empty  = updated
    ? (inventory.totalEmpty   ?? inventory.totalEmptyBottles  ?? 0)
    : (inventory.totalEmptyBottles  ?? 0);

  const isLow      = filled < 50 && filled >= 20;
  const isCritical = filled < 20;

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center justify-center gap-4 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors duration-500 ${
        updated
          ? 'bg-green-50 border border-green-200 text-green-700'
          : isCritical
            ? 'bg-red-50 border border-red-200 text-red-700'
            : isLow
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-slate-50 border border-slate-200 text-slate-600'
      }`}>
        {updated ? (
          <span className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
            Stock updated: <span className="font-bold">{filled} filled</span>
            <span className="text-slate-300">|</span>
            <span className="font-bold">{empty} empty</span>
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <Package size={13} />
              <span className="font-bold tabular-nums">{filled}</span>
              <span className="font-normal opacity-70">filled</span>
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              🔄
              <span className="font-bold tabular-nums">{empty}</span>
              <span className="font-normal opacity-70">empty</span>
            </span>
          </>
        )}
      </div>

      {!updated && isCritical && (
        <p className="text-center text-xs text-red-500 font-semibold">
          🔴 Only {filled} filled bottles left in stock
        </p>
      )}
      {!updated && isLow && (
        <p className="text-center text-xs text-amber-600 font-semibold">
          ⚠️ Only {filled} filled bottles left in stock
        </p>
      )}
    </div>
  );
}

// ─── Stepper input ────────────────────────────────────────────────────────────

function Stepper({ label, emoji, value, onChange, max }) {
  const atMax = max !== undefined && max !== null && value >= max;
  const overMax = max !== undefined && max !== null && value > max;

  function handleChange(raw) {
    const v = Math.max(0, parseInt(raw) || 0);
    // clamp to max only if max is set and positive
    onChange(max != null && max >= 0 ? Math.min(v, max) : v);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">
        {label} {emoji}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-14 h-14 rounded-2xl border-2 border-slate-200 flex items-center justify-center text-slate-600 hover:border-blue-900 hover:text-blue-900 active:scale-95 transition-all shrink-0"
        >
          <Minus size={20} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          max={max}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className={`flex-1 text-center text-4xl font-bold py-3 border-2 rounded-2xl focus:outline-none transition-colors text-slate-800 ${
            overMax
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-200 focus:border-blue-900'
          }`}
        />
        <button
          type="button"
          onClick={() => { if (!atMax) onChange(value + 1); }}
          disabled={atMax}
          className="w-14 h-14 rounded-2xl border-2 border-slate-200 flex items-center justify-center text-slate-600 hover:border-blue-900 hover:text-blue-900 active:scale-95 transition-all shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={20} />
        </button>
      </div>
      {atMax && max > 0 && (
        <p className="text-center text-xs text-red-500 font-semibold">
          Only {max} bottles available in stock
        </p>
      )}
    </div>
  );
}

// ─── STEP 1: Client Info ──────────────────────────────────────────────────────

function ClientInfoStep({ client, alreadyDelivered, onProceed }) {
  return (
    <div className="space-y-4">
      {alreadyDelivered && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Already delivered today</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {client.todayDelivery?.filledBottlesDelivered ?? 0} bottles delivered ·{' '}
              {client.todayDelivery?.emptyBottlesCollected ?? 0} empty collected
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold text-slate-800 leading-tight">{client.name}</h2>
        <a
          href={`tel:${client.mobile}`}
          className="inline-flex items-center gap-1.5 text-blue-700 font-semibold text-sm mt-1.5"
        >
          <Phone size={14} /> {client.mobile}
        </a>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <span className="leading-relaxed">{client.address}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
            <MapPin size={10} /> {client.route}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold">
            <Truck size={10} /> {client.tempoNumber}
          </span>
        </div>
      </div>

      {client.lastDeliveryDate && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-100 rounded-2xl text-sm">
          <CheckCircle2 size={14} className="text-green-500 shrink-0" />
          <span className="text-slate-600">
            Last delivery:{' '}
            <span className="font-semibold text-slate-800">{fmtDate(client.lastDeliveryDate)}</span>
            {client.lastDeliveryBottles != null && (
              <> — <span className="font-semibold text-slate-800">{client.lastDeliveryBottles} bottles</span></>
            )}
          </span>
        </div>
      )}

      <button
        onClick={onProceed}
        className="w-full flex items-center justify-center gap-2 py-4 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-2xl text-base active:scale-[0.98] transition-all"
      >
        {alreadyDelivered ? (
          <><ReceiptText size={18} /> Go to Invoice</>
        ) : (
          <><ArrowRight size={18} /> Record Delivery</>
        )}
      </button>
    </div>
  );
}

// ─── STEP 2: Delivery Entry ───────────────────────────────────────────────────

function DeliveryStep({ client, inventory, onRecorded }) {
  const [filled, setFilled]         = useState(0);
  const [empty, setEmpty]           = useState(0);
  const [saving, setSaving]         = useState(false);
  const [stockAfter, setStockAfter] = useState(null); // {totalFilled, totalEmpty}
  const timerRef = useRef(null);

  const maxFilled = inventory?.totalFilledBottles ?? null;

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (filled === 0 && empty === 0) {
      toast.error('Enter at least one bottle count');
      return;
    }
    if (maxFilled !== null && filled > maxFilled) {
      toast.error(`Only ${maxFilled} filled bottles available in stock`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/api/deliveries', {
        clientId: client.id,
        filledBottlesDelivered: filled,
        emptyBottlesCollected: empty,
        deliveryDate: new Date().toISOString(),
        status: 'COMPLETED',
      });
      toast.success('Delivery recorded!');

      const updatedInv = res.data.inventory ?? null;
      if (updatedInv) {
        setStockAfter(updatedInv);
        // Show green flash for 1.5 s, then proceed
        timerRef.current = setTimeout(() => {
          onRecorded(res.data);
        }, 1500);
      } else {
        onRecorded(res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to record delivery');
      setSaving(false);
    }
  }

  // Use flash inventory for the bar if available, otherwise live inventory
  const barInventory = stockAfter
    ? { totalFilledBottles: stockAfter.totalFilled, totalEmptyBottles: stockAfter.totalEmpty }
    : inventory;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Live stock bar */}
      <StockBar inventory={barInventory} updated={!!stockAfter} />

      <Stepper
        label="Filled Bottles Delivered"
        emoji="🫙"
        value={filled}
        onChange={setFilled}
        max={maxFilled}
      />
      <Stepper
        label="Empty Bottles Collected"
        emoji="♻️"
        value={empty}
        onChange={setEmpty}
      />
      <button
        type="submit"
        disabled={saving || !!stockAfter}
        className="w-full flex items-center justify-center gap-2 py-4 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold rounded-2xl text-base active:scale-[0.98] transition-all"
      >
        {saving || stockAfter ? (
          <><Loader2 size={18} className="animate-spin" /> {stockAfter ? 'Recorded…' : 'Recording…'}</>
        ) : (
          <><PackageCheck size={18} /> Record Delivery</>
        )}
      </button>
    </form>
  );
}

// ─── STEP 3: Invoice Generation ───────────────────────────────────────────────

function InvoiceStep({ client, delivery, alreadyDelivered, onInvoiceGenerated, onSkip }) {
  const [history, setHistory]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [rate, setRate]             = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get(`/api/invoices/client/${client.id}`)
      .then((r) => {
        setHistory(r.data);
        setRate(String(r.data.suggestedRate));
      })
      .catch(() => {
        setHistory({ bottlesSinceLastPaid: 0, deliveryCount: 0, suggestedRate: 50 });
        setRate('50');
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rateN = parseFloat(rate) || 0;
  const total = history ? history.bottlesSinceLastPaid * rateN : 0;

  async function handleGenerate() {
    if (!rateN || rateN <= 0) { toast.error('Enter a valid rate per bottle'); return; }
    setGenerating(true);
    try {
      const res = await api.post('/api/invoices/generate', {
        deliveryId: delivery.id,
        amountPerBottle: rateN,
      });
      onInvoiceGenerated(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${
        alreadyDelivered
          ? 'bg-amber-50 border border-amber-200'
          : 'bg-green-50 border border-green-200'
      }`}>
        {alreadyDelivered
          ? <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          : <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
        }
        <div>
          <p className={`font-semibold text-sm ${alreadyDelivered ? 'text-amber-800' : 'text-green-800'}`}>
            {alreadyDelivered ? 'Already delivered today' : '✅ Delivery recorded!'}
          </p>
          <p className={`text-xs mt-0.5 ${alreadyDelivered ? 'text-amber-600' : 'text-green-600'}`}>
            {delivery.filledBottlesDelivered} bottles delivered ·{' '}
            {delivery.emptyBottlesCollected} empty collected
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={26} className="animate-spin text-blue-900" />
        </div>
      ) : (
        <div className="bg-slate-50 rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <ReceiptText size={16} className="text-slate-400" />
            <p className="font-semibold text-slate-700 text-sm">Generate Invoice</p>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Bottles since last payment</span>
            <span className="font-bold text-slate-800 text-lg">{history.bottlesSinceLastPaid}</span>
          </div>

          {history.lastPaidAt && (
            <p className="text-xs text-slate-400">
              Last paid: {fmtDate(history.lastPaidAt)}
            </p>
          )}

          <div className="flex items-center gap-3">
            <span className="text-slate-500 text-sm shrink-0">Rate per bottle</span>
            <div className="flex-1 flex items-center border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-900 transition-colors bg-white">
              <span className="px-3 text-slate-400 font-semibold select-none">₹</span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.5"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="flex-1 py-2.5 pr-3 text-sm font-bold text-slate-800 focus:outline-none bg-transparent"
              />
            </div>
          </div>

          {rateN > 0 && (
            <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-3">
              <span className="font-semibold text-slate-600">Total Amount</span>
              <span className="font-bold text-blue-900 text-xl">
                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !rateN || loading}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-white font-bold text-sm active:scale-[0.98] transition-all"
        >
          {generating ? (
            <><Loader2 size={16} className="animate-spin" /> Generating…</>
          ) : (
            <><ReceiptText size={16} /> Generate Invoice</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const STEP_TITLES = {
  info:     'Client Info',
  delivery: 'Record Delivery',
  invoice:  'Invoice',
  view:     'Invoice',
};

export default function DeliveryModal({ client, onClose, onDelivered }) {
  const alreadyDelivered = !!(client.todayDelivery && client.deliveredToday);

  const [step, setStep]         = useState('info');
  const [delivery, setDelivery] = useState(alreadyDelivered ? client.todayDelivery : null);
  const [invoice, setInvoice]   = useState(null);
  const [inventory, setInventory] = useState(null);

  // Fetch live inventory when modal opens
  useEffect(() => {
    api.get('/api/inventory')
      .then(r => setInventory(r.data))
      .catch(() => {}); // non-critical — modal still works without it
  }, []);

  function handleProceedFromInfo() {
    setStep(alreadyDelivered ? 'invoice' : 'delivery');
  }

  function handleRecorded(data) {
    // data is { delivery, inventory } from the updated API
    const deliveryObj = data.delivery ?? data;
    setDelivery(deliveryObj);

    // Sync inventory state with what the server returned
    if (data.inventory) {
      setInventory(prev => prev ? {
        ...prev,
        totalFilledBottles: data.inventory.totalFilled,
        totalEmptyBottles:  data.inventory.totalEmpty,
      } : null);
    }

    onDelivered?.();
    setStep('invoice');
  }

  function handleInvoiceGenerated(inv) {
    setInvoice(inv);
    setStep('view');
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content
          className="fixed z-50 inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl max-h-[94vh] flex flex-col
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom
            duration-300 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:w-full md:max-w-md md:rounded-3xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Drag handle (mobile only) */}
          <div className="flex justify-center pt-3 shrink-0 md:hidden">
            <div className="w-10 h-1 bg-slate-200 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <Dialog.Title className="font-bold text-slate-800 text-base">
              {STEP_TITLES[step]}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          {/* Step dots */}
          <StepDots current={step} skipped={alreadyDelivered} />

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 pb-8 pt-2 space-y-5">
            {step === 'info' && (
              <ClientInfoStep
                client={client}
                alreadyDelivered={alreadyDelivered}
                onProceed={handleProceedFromInfo}
              />
            )}

            {step === 'delivery' && (
              <DeliveryStep
                client={client}
                inventory={inventory}
                onRecorded={handleRecorded}
              />
            )}

            {step === 'invoice' && delivery && (
              <InvoiceStep
                client={client}
                delivery={delivery}
                alreadyDelivered={alreadyDelivered}
                onInvoiceGenerated={handleInvoiceGenerated}
                onSkip={onClose}
              />
            )}

            {step === 'view' && invoice && (
              <InvoiceView invoice={invoice} onClose={onClose} />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
