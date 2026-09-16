const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtAmount(n) {
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Strip to 10-digit local number, then prepend 91
function normalizeMobile(raw) {
  let digits = String(raw).replace(/\D/g, '');          // remove non-digits
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0')  && digits.length === 11)  digits = digits.slice(1);
  return `91${digits}`;                                  // always 12 digits
}

// `billing` is a live billing summary from billingService.getClientMonthBilling
// — status/amounts here are always exactly what Invoices/Statement show,
// since they're computed from the same Invoice records, not a separately
// tracked MonthlyBill.status.
function buildWhatsAppMessage(billing) {
  const upiId      = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || 'yourbusiness@upi';
  const bizName    = process.env.BUSINESS_NAME   || 'Gajanan Aqua';
  const monthName  = MONTH_NAMES[billing.month];
  const clientName = billing.clientName ?? 'Customer';
  const rate       = fmtAmount(billing.ratePerBottle);
  const totalBilled = fmtAmount(billing.totalBilled);
  const remaining    = fmtAmount(billing.totalBilled - billing.totalPaid);

  const statusLine =
    billing.status === 'PAID'    ? '✅ Fully Paid — thank you!' :
    billing.status === 'PARTIAL' ? `⏳ Partially Paid — ₹${remaining} remaining` :
                                    '⏳ Payment Pending';

  const message = [
    `\u{1F4A7} *${bizName} - Monthly Invoice*`,
    ``,
    `Dear ${clientName},`,
    ``,
    `Your water can delivery bill for *${monthName} ${billing.year}* is ready.`,
    ``,
    `\u{1F4E6} Total Bottles Delivered: *${billing.totalBottles}*`,
    `\u{1F4B0} Rate per Bottle: ₹${rate}`,
    `━━━━━━━━━━━━━━━━`,
    `\u{1F4B5} *Total Amount: ₹${totalBilled}*`,
    `Status: ${statusLine}`,
    ``,
    `Please make the payment at your earliest convenience.`,
    ``,
    `For payment, you can use the QR code or UPI:`,
    `UPI ID: ${upiId}`,
    ``,
    `Thank you for being our valued customer! \u{1F64F}`,
    ``,
    `- ${bizName} Team`,
  ].join('\n');

  return message;
}

function buildWhatsAppURL(mobileNumber, message) {
  const e164      = normalizeMobile(mobileNumber);
  const encoded   = encodeURIComponent(message);
  return `https://wa.me/${e164}?text=${encoded}`;
}

module.exports = { buildWhatsAppMessage, buildWhatsAppURL, normalizeMobile };
