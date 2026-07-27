import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, X, Droplets, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function fmtRupee(n) {
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceView({ invoice, onClose }) {
  const printRef = useRef(null);

  const {
    invoiceNumber,
    createdAt,
    bottlesTakenSinceLastPaid,
    amountPerBottle,
    totalAmount,
    paymentQrData,
    client,
  } = invoice;

  // Extract UPI ID from the QR string for display
  const upiId = paymentQrData?.match(/pa=([^&]+)/)?.[1] ?? '';

  async function handleShare() {
    const text =
      `🧾 Invoice ${invoiceNumber}\n` +
      `Client: ${client.name}\n` +
      `Bottles: ${bottlesTakenSinceLastPaid} × ${fmtRupee(amountPerBottle)}\n` +
      `Total: ${fmtRupee(totalAmount)}\n` +
      `Date: ${fmtDate(createdAt)}\n\n` +
      `Pay via UPI: ${upiId}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${invoiceNumber}`, text });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Invoice details copied to clipboard!');
    }
  }

  return (
    <div className="space-y-4">
      {/* Invoice card — this is what looks "print-friendly" */}
      <div ref={printRef} className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden print:border-0">

        {/* Invoice header */}
        <div className="bg-blue-900 px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets size={20} className="text-blue-300" />
              <span className="font-bold text-lg tracking-tight">AquaERP</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-300 font-semibold uppercase tracking-widest">Tax Invoice</p>
              <p className="text-sm font-bold mt-0.5">{invoiceNumber}</p>
            </div>
          </div>
          <div className="mt-3 text-blue-200 text-xs">
            Date: {fmtDate(createdAt)}
          </div>
        </div>

        {/* Client info */}
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Bill To</p>
          <p className="font-bold text-slate-800 text-base">{client.name}</p>
          <p className="text-slate-500 text-sm mt-0.5 leading-relaxed">{client.address}</p>
        </div>

        {/* Line items table */}
        <div className="px-5 py-4 border-b border-slate-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="pb-2 font-semibold">Description</th>
                <th className="pb-2 text-center font-semibold">Qty</th>
                <th className="pb-2 text-right font-semibold">Rate</th>
                <th className="pb-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-dashed border-slate-100">
                <td className="py-3 text-slate-700">
                  <p className="font-medium">Water Cans Delivered</p>
                  <p className="text-xs text-slate-400 mt-0.5">Since last payment</p>
                </td>
                <td className="py-3 text-center font-semibold text-slate-800">
                  {bottlesTakenSinceLastPaid}
                </td>
                <td className="py-3 text-right text-slate-600">{fmtRupee(amountPerBottle)}</td>
                <td className="py-3 text-right font-semibold text-slate-800">{fmtRupee(totalAmount)}</td>
              </tr>
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span>{fmtRupee(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-2 mt-2">
              <span>Total Due</span>
              <span className="text-blue-900">{fmtRupee(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* QR payment section */}
        {paymentQrData && (
          <div className="px-5 py-5 flex flex-col items-center gap-3 bg-slate-50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Scan to Pay
            </p>
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
              <QRCodeSVG
                value={paymentQrData}
                size={200}
                level="M"
                includeMargin={false}
                className="block"
              />
            </div>
            <p className="text-xs text-slate-500 font-medium">{upiId}</p>
            <p className="text-xs text-slate-400 text-center">
              Open any UPI app and scan to pay {fmtRupee(totalAmount)}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 text-center">
          <div className="flex items-center justify-center gap-2 text-green-600 mb-1">
            <CheckCircle2 size={14} />
            <span className="text-xs font-semibold">Thank you for your business!</span>
          </div>
          <p className="text-xs text-slate-400">AquaERP · Water Can Delivery Management</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          <X size={16} /> Close
        </button>
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-900 hover:bg-blue-800 text-sm font-semibold text-white active:scale-[0.98] transition-all"
        >
          <Share2 size={16} /> Share Invoice
        </button>
      </div>
    </div>
  );
}
