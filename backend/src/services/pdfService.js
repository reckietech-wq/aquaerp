const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const fs          = require('fs');
const path        = require('path');
const { getClientMonthBilling, getClientRangeBilling, getClientMonthlySummary } = require('./billingService');
const { formatIstDate } = require('../lib/dateUtils');
const prisma = require('../lib/prisma');

// ─── layout grid ────────────────────────────────────────────────────────────
// Every x/y below is derived from these few constants, so the whole layout
// can be re-tuned from one place instead of chasing ad-hoc coordinates.

const PAGE_SIZE   = 'A4';
const MARGIN      = 40;
const PAGE_W      = 595.28; // A4 pt
const PAGE_H      = 841.89;
const CONTENT_X   = MARGIN;
const CONTENT_W   = PAGE_W - MARGIN * 2;
const CONTENT_R   = MARGIN + CONTENT_W;

const COLOR = {
  brand:     '#1e3a5f',
  brandLite: '#eef2f8',
  gray:      '#64748b',
  grayLite:  '#94a3b8',
  dark:      '#1e293b',
  border:    '#d8dee8',
  headerBg:  '#eef1f6',
  green:     '#16a34a',
  amber:     '#b45309',
  red:       '#dc2626',
};

const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold' };

const UPLOADS_DIR      = path.join(__dirname, '../../uploads/invoices');
const FALLBACK_QR_PATH = path.join(__dirname, '../../assets/payment-qr.png');
const LOGO_PATH        = path.join(__dirname, '../../assets/logo.png');
const ASSETS_DIR       = path.join(__dirname, '../../assets');

const SIGNATURE_BLOCK_H = 66;

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABEL = { PAID: 'PAID', PARTIAL: 'PARTIALLY PAID', UNPAID: 'UNPAID' };
const STATUS_COLOR = { PAID: COLOR.green, PARTIAL: COLOR.amber, UNPAID: COLOR.red };

// ── item table column grid — x positions/widths sum to CONTENT_W ───────────
const COL = (() => {
  const dateW = 85;
  const qtyW  = 60;
  const rateW = 85;
  const amtW  = 100;
  const descW = CONTENT_W - dateW - qtyW - rateW - amtW;
  let x = CONTENT_X;
  const date = { x, w: dateW }; x += dateW;
  const desc = { x, w: descW }; x += descW;
  const qty  = { x, w: qtyW };  x += qtyW;
  const rate = { x, w: rateW }; x += rateW;
  const amt  = { x, w: amtW };
  return { date, desc, qty, rate, amt };
})();

const ROW_H    = 22;
const HEADER_H = 24;

// PDFKit's standard 14 fonts (WinAnsi encoding) have no ₹ glyph — it renders
// as a garbled superscript. "Rs." is the safe, always-correct alternative.
function fmtRupee(n) {
  return `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// dd/mm/yyyy in IST — the single date-formatting helper used throughout.
function fmtDate(d) {
  return formatIstDate(d);
}

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// BusinessSettings stores a public URL path like "/assets/signature.png" —
// resolve it to the real file on disk, under backend/assets/.
function resolveAssetPath(publicPath) {
  if (!publicPath) return null;
  const filePath = path.join(ASSETS_DIR, path.basename(publicPath));
  return fs.existsSync(filePath) ? filePath : null;
}

// Right-aligned "label ... value" pair inside a fixed box, used for the
// totals mini-table so every ₹ figure lines up on the same vertical edge.
function totalsLine(doc, x, w, y, label, value, opts = {}) {
  const { bold = false, size = 9, color = COLOR.dark, labelColor = COLOR.gray } = opts;
  const labelW = w * 0.6;
  doc.font(bold ? FONT.bold : FONT.regular).fontSize(size).fillColor(labelColor)
     .text(label, x, y, { width: labelW, align: 'right' });
  doc.font(bold ? FONT.bold : FONT.regular).fontSize(size).fillColor(color)
     .text(value, x + labelW + 8, y, { width: w - labelW - 8, align: 'right' });
}

// ─── header band ────────────────────────────────────────────────────────────
function drawHeader(doc, { invoiceNo, dateLabel, docLabel, bizName }) {
  const y = MARGIN;
  let textX = CONTENT_X;

  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, CONTENT_X, y, { width: 50, height: 50 });
      textX = CONTENT_X + 62;
    } catch (err) {
      console.error('[pdfService] logo embed failed:', err.message);
    }
  }

  doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(18)
     .text(bizName, textX, y + 3, { lineBreak: false });
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
     .text('Water Supply Co.', textX, y + 25, { lineBreak: false });

  // Right-aligned invoice meta block
  const metaW = 220;
  const metaX = CONTENT_R - metaW;
  doc.fillColor(COLOR.brand).font(FONT.bold).fontSize(13)
     .text(docLabel, metaX, y + 2, { width: metaW, align: 'right' });
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
     .text(`Invoice No: ${invoiceNo}`, metaX, y + 21, { width: metaW, align: 'right' })
     .text(`Date: ${dateLabel}`, metaX, y + 34, { width: metaW, align: 'right' });

  const ruleY = y + 58;
  doc.moveTo(CONTENT_X, ruleY).lineTo(CONTENT_R, ruleY).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  return ruleY + 16;
}

// ─── parties row ────────────────────────────────────────────────────────────
function drawParties(doc, y, { clientName, address, route, upiId, payeeName, singleAmount }) {
  const colW = CONTENT_W / 2 - 10;
  const leftX  = CONTENT_X;
  const rightX = CONTENT_X + CONTENT_W / 2 + 10;

  doc.fillColor(COLOR.grayLite).font(FONT.bold).fontSize(8).text('BILL TO', leftX, y);
  doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(11)
     .text(clientName, leftX, y + 13, { width: colW });
  const nameH = doc.heightOfString(clientName, { width: colW, font: FONT.bold, fontSize: 11 });
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
     .text(address, leftX, y + 13 + nameH + 3, { width: colW });
  const addrH = doc.heightOfString(address, { width: colW, font: FONT.regular, fontSize: 9 });
  if (route) {
    doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
       .text(`Route: ${route}`, leftX, y + 13 + nameH + 3 + addrH + 2, { width: colW });
  }

  doc.fillColor(COLOR.grayLite).font(FONT.bold).fontSize(8).text('PAYMENT DETAILS', rightX, y);
  doc.fillColor(COLOR.dark).font(FONT.regular).fontSize(9)
     .text(`UPI ID: ${upiId}`, rightX, y + 13, { width: colW })
     .text(`Payee: ${payeeName}`, rightX, y + 27, { width: colW });
  if (singleAmount != null) {
    doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(9)
       .text(`Amount: ${fmtRupee(singleAmount)}`, rightX, y + 41, { width: colW });
  }

  const leftBottom  = y + 13 + nameH + 3 + addrH + (route ? 14 : 0);
  const rightBottom = y + 13 + 41 + (singleAmount != null ? 14 : 0);
  return Math.max(leftBottom, rightBottom) + 16;
}

// ─── items table ────────────────────────────────────────────────────────────
function drawTableHeader(doc, y) {
  doc.rect(CONTENT_X, y, CONTENT_W, HEADER_H).fill(COLOR.headerBg);
  doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(9);
  const ty = y + HEADER_H / 2 - 4.5;
  doc.text('DATE', COL.date.x + 8, ty, { width: COL.date.w - 8 });
  doc.text('DESCRIPTION', COL.desc.x, ty, { width: COL.desc.w });
  doc.text('QTY', COL.qty.x, ty, { width: COL.qty.w - 8, align: 'right' });
  doc.text('RATE', COL.rate.x, ty, { width: COL.rate.w - 8, align: 'right' });
  doc.text('AMOUNT', COL.amt.x, ty, { width: COL.amt.w - 8, align: 'right' });
  doc.moveTo(CONTENT_X, y + HEADER_H).lineTo(CONTENT_R, y + HEADER_H)
     .lineWidth(0.5).strokeColor(COLOR.border).stroke();
  return y + HEADER_H;
}

function ensureSpace(doc, y, needed, onNewPage) {
  if (y + needed > PAGE_H - MARGIN - FOOTER_RESERVE) {
    doc.addPage();
    return onNewPage(doc);
  }
  return y;
}

const FOOTER_RESERVE = 24;

function drawRow(doc, y, { date, desc, qty, rate, amount }, zebra) {
  if (zebra) doc.rect(CONTENT_X, y, CONTENT_W, ROW_H).fill('#f8fafc');
  const ty = y + ROW_H / 2 - 4.5;
  doc.fillColor(COLOR.dark).font(FONT.regular).fontSize(9);
  doc.text(date, COL.date.x + 8, ty, { width: COL.date.w - 8, height: ROW_H, ellipsis: true });
  doc.text(desc, COL.desc.x, ty, { width: COL.desc.w - 6, height: ROW_H, ellipsis: true });
  doc.text(qty,  COL.qty.x,  ty, { width: COL.qty.w  - 8, align: 'right' });
  doc.text(rate, COL.rate.x, ty, { width: COL.rate.w - 8, align: 'right' });
  doc.text(amount, COL.amt.x, ty, { width: COL.amt.w - 8, align: 'right' });
  doc.moveTo(CONTENT_X, y + ROW_H).lineTo(CONTENT_R, y + ROW_H)
     .lineWidth(0.5).strokeColor(COLOR.border).stroke();
}

// ── monthly-summary table grid — Month | Bottles Delivered | Monthly Bill ──
const COL_MS = (() => {
  const bottlesW = 150;
  const billW    = 150;
  const monthW   = CONTENT_W - bottlesW - billW;
  let x = CONTENT_X;
  const month   = { x, w: monthW };   x += monthW;
  const bottles = { x, w: bottlesW }; x += bottlesW;
  const bill    = { x, w: billW };
  return { month, bottles, bill };
})();

const ROW_H_MS = 32; // taller than ROW_H — the month cell has a two-line label + date span

function drawMonthlyTableHeader(doc, y) {
  doc.rect(CONTENT_X, y, CONTENT_W, HEADER_H).fill(COLOR.headerBg);
  doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(9);
  const ty = y + HEADER_H / 2 - 4.5;
  doc.text('MONTH', COL_MS.month.x + 8, ty, { width: COL_MS.month.w - 8 });
  doc.text('BOTTLES DELIVERED', COL_MS.bottles.x, ty, { width: COL_MS.bottles.w - 8, align: 'right' });
  doc.text('MONTHLY BILL', COL_MS.bill.x, ty, { width: COL_MS.bill.w - 8, align: 'right' });
  doc.moveTo(CONTENT_X, y + HEADER_H).lineTo(CONTENT_R, y + HEADER_H)
     .lineWidth(0.5).strokeColor(COLOR.border).stroke();
  return y + HEADER_H;
}

function drawMonthlyRow(doc, y, { label, span, bottles, bill }, zebra) {
  if (zebra) doc.rect(CONTENT_X, y, CONTENT_W, ROW_H_MS).fill('#f8fafc');
  doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(9.5)
     .text(label, COL_MS.month.x + 8, y + 7, { width: COL_MS.month.w - 8, height: 14, ellipsis: true });
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(7.5)
     .text(span, COL_MS.month.x + 8, y + 19, { width: COL_MS.month.w - 8, height: 12, ellipsis: true });
  const vty = y + ROW_H_MS / 2 - 4.5;
  doc.fillColor(COLOR.dark).font(FONT.regular).fontSize(9)
     .text(bottles, COL_MS.bottles.x, vty, { width: COL_MS.bottles.w - 8, align: 'right' })
     .text(bill, COL_MS.bill.x, vty, { width: COL_MS.bill.w - 8, align: 'right' });
  doc.moveTo(CONTENT_X, y + ROW_H_MS).lineTo(CONTENT_R, y + ROW_H_MS)
     .lineWidth(0.5).strokeColor(COLOR.border).stroke();
}

// ─── signature & stamp block ────────────────────────────────────────────────
// Sits directly under the totals panel, right-aligned to the same x/width so
// it reads as part of that block rather than a separate footer band. Renders
// only whichever of the two images is actually uploaded — with neither, the
// block is skipped entirely (caller checks before reserving space for it).
function drawSignatureBlock(doc, x, w, y, { signaturePath, stampPath }) {
  const sigW = 95;
  const stampW = 55;
  const sigX = x + w - sigW;

  if (stampPath) {
    try {
      // Drawn first (so it sits "behind" the signature in z-order) and
      // faded slightly so it reads as a stamp impression, not a sticker.
      doc.save();
      doc.opacity(0.8);
      doc.image(stampPath, sigX - stampW - 6, y, { fit: [stampW, stampW] });
      doc.restore();
    } catch (err) {
      console.error('[pdfService] stamp embed failed:', err.message);
    }
  }

  if (signaturePath) {
    try {
      doc.image(signaturePath, sigX, y, { fit: [sigW, 32], align: 'center' });
    } catch (err) {
      console.error('[pdfService] signature embed failed:', err.message);
    }
    const lineY = y + 36;
    doc.moveTo(sigX, lineY).lineTo(x + w, lineY)
       .lineWidth(0.5).strokeColor(COLOR.border).stroke();
    doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(7.5)
       .text('Authorized Signatory', sigX, lineY + 4, { width: sigW, align: 'center' });
  }

  return y + SIGNATURE_BLOCK_H;
}

// ─── footer ─────────────────────────────────────────────────────────────────
// A single slim line — the signature/stamp block now carries the visual
// weight that used to live in a taller footer band.
function drawFooter(doc) {
  // The footer sits inside the page's bottom margin band, so PDFKit's
  // automatic pagination (which checks new text against page.margins.bottom)
  // would otherwise silently insert a blank page here — zero the bottom
  // margin only while drawing it.
  const savedBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const y = PAGE_H - MARGIN - 14;
  doc.moveTo(CONTENT_X, y).lineTo(CONTENT_R, y).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8)
     .text('Thank you for your business!', CONTENT_X, y + 4, { width: CONTENT_W, align: 'center', lineBreak: false });

  doc.page.margins.bottom = savedBottomMargin;
}

// ─── shared PDF renderer ────────────────────────────────────────────────────
// Both the monthly and custom-range bills produce the exact same `billing`
// shape (see billingService), so a single renderer builds the actual PDF —
// only the invoiceNo and output filename differ per caller.

async function renderBillingPDF(billing, { invoiceNo, outPath }) {
  ensureDir();

  const upiId     = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || 'yourbusiness@upi';
  const payeeName = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const bizName   = process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const remaining = parseFloat((billing.totalBilled - billing.totalPaid).toFixed(2));
  // The QR must encode the TOTAL DUE shown on the document (previous
  // outstanding + this period), not just this period's remaining amount —
  // otherwise a customer scanning it underpays by whatever was already owed.
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${Math.max(billing.outstanding, 0).toFixed(2)}&cu=INR&tn=${invoiceNo}`;

  let qrBuffer;
  try {
    qrBuffer = await QRCode.toBuffer(upiString, {
      type: 'png', width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('[pdfService] QR generation failed, using fallback image:', err.message);
    qrBuffer = fs.existsSync(FALLBACK_QR_PATH) ? fs.readFileSync(FALLBACK_QR_PATH) : null;
  }

  const isSingle = billing.deliveries.length === 1;
  const docLabel = 'TAX INVOICE';

  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } });
  const signaturePath = resolveAssetPath(settings?.signaturePath);
  const stampPath = resolveAssetPath(settings?.stampPath);

  const doc    = new PDFDocument({ size: PAGE_SIZE, margin: MARGIN });
  const stream = fs.createWriteStream(outPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    // ── page 1 header/parties/table header ────────────────────────────────
    const startNewPage = () => {
      let y = drawHeader(doc, { invoiceNo, dateLabel: fmtDate(new Date()), docLabel, bizName });
      return drawTableHeader(doc, y);
    };

    let y = drawHeader(doc, { invoiceNo, dateLabel: fmtDate(new Date()), docLabel, bizName });
    y = drawParties(doc, y, {
      clientName: billing.clientName,
      address:    billing.address,
      route:      billing.route,
      upiId,
      payeeName,
      singleAmount: isSingle ? billing.deliveries[0].amount : null,
    });
    y = drawTableHeader(doc, y);

    billing.deliveries.forEach((d, i) => {
      y = ensureSpace(doc, y, ROW_H, startNewPage);
      drawRow(doc, y, {
        date:   fmtDate(d.date),
        desc:   'Water can delivery',
        qty:    String(d.bottles),
        rate:   fmtRupee(d.rate),
        amount: fmtRupee(d.amount),
      }, i % 2 === 1);
      y += ROW_H;
    });

    // Subtotal row
    y = ensureSpace(doc, y, ROW_H, startNewPage);
    doc.rect(CONTENT_X, y, CONTENT_W, ROW_H).fill(COLOR.headerBg);
    const sty = y + ROW_H / 2 - 4.5;
    doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(9)
       .text('SUBTOTAL', COL.date.x + 8, sty, { width: COL.desc.w + COL.date.w - 8 })
       .text(String(billing.totalBottles), COL.qty.x, sty, { width: COL.qty.w - 8, align: 'right' })
       .text(fmtRupee(billing.totalBilled), COL.amt.x, sty, { width: COL.amt.w - 8, align: 'right' });
    doc.moveTo(CONTENT_X, y + ROW_H).lineTo(CONTENT_R, y + ROW_H).lineWidth(0.5).strokeColor(COLOR.border).stroke();
    y += ROW_H + 16;

    // ── totals block + QR, side by side ─────────────────────────────────
    const blockH = 130;
    y = ensureSpace(doc, y, blockH, startNewPage);

    const qrX = CONTENT_X;
    const qrW = 190;
    const totW = CONTENT_W - qrW - 20;
    const totX = CONTENT_R - totW;

    // QR panel
    doc.rect(qrX, y, qrW, blockH).fill(COLOR.brandLite).stroke(COLOR.border);
    doc.fillColor(COLOR.grayLite).font(FONT.bold).fontSize(8)
       .text('SCAN TO PAY', qrX, y + 10, { width: qrW, align: 'center' });
    if (qrBuffer) {
      doc.image(qrBuffer, qrX + (qrW - 110) / 2, y + 22, { width: 110, height: 110 - 24 });
    }
    doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(8)
       .text(`UPI: ${upiId}`, qrX, y + blockH - 24, { width: qrW, align: 'center' });
    doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(7)
       .text(payeeName, qrX, y + blockH - 13, { width: qrW, align: 'center' });

    // Totals panel
    doc.rect(totX, y, totW, blockH).fill('#ffffff').stroke(COLOR.border);
    let ty2 = y + 16;
    const prevOutstanding = parseFloat((billing.outstanding - remaining).toFixed(2));
    totalsLine(doc, totX + 14, totW - 28, ty2, 'Previous Outstanding:', fmtRupee(Math.max(prevOutstanding, 0)));
    ty2 += 16;
    totalsLine(doc, totX + 14, totW - 28, ty2, 'This Period:', fmtRupee(billing.totalBilled));
    ty2 += 16;
    if (billing.totalPaid > 0) {
      totalsLine(doc, totX + 14, totW - 28, ty2, 'Amount Paid:', fmtRupee(billing.totalPaid), { color: COLOR.green });
      ty2 += 16;
    }
    doc.moveTo(totX + 14, ty2 + 4).lineTo(totX + totW - 14, ty2 + 4)
       .lineWidth(1).strokeColor(COLOR.brand).stroke();
    ty2 += 14;
    totalsLine(doc, totX + 14, totW - 28, ty2, 'TOTAL DUE:', fmtRupee(Math.max(billing.outstanding, 0)), {
      bold: true, size: 13, color: billing.outstanding > 0 ? COLOR.red : COLOR.green, labelColor: COLOR.dark,
    });
    ty2 += 22;
    doc.fillColor(STATUS_COLOR[billing.status]).font(FONT.bold).fontSize(9)
       .text(STATUS_LABEL[billing.status], totX + 14, ty2, { width: totW - 28, align: 'right' });

    y += blockH + 10;

    // ── signature & stamp — directly below the totals panel, right-aligned
    // to that same panel so it reads as part of the Total Due block ────────
    if (signaturePath || stampPath) {
      y = ensureSpace(doc, y, SIGNATURE_BLOCK_H, startNewPage);
      y = drawSignatureBlock(doc, totX, totW, y, { signaturePath, stampPath });
    }

    drawFooter(doc);
    doc.end();
  });

  return outPath;
}

// ─── monthly-summary renderer ──────────────────────────────────────────────
// Same header/BILL TO/QR/signature as the detailed invoice (renderBillingPDF)
// — only the middle table differs: one row per calendar month instead of one
// row per delivery.
async function renderMonthlySummaryPDF(summary, { invoiceNo, outPath }) {
  ensureDir();

  const upiId     = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || 'yourbusiness@upi';
  const payeeName = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const bizName   = process.env.BUSINESS_NAME || 'Gajanan Aqua';
  // Same convention as the detailed invoice: the QR encodes the client's real
  // total due (current running balance), not just the sum of the selected range.
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${Math.max(summary.outstanding, 0).toFixed(2)}&cu=INR&tn=${invoiceNo}`;

  let qrBuffer;
  try {
    qrBuffer = await QRCode.toBuffer(upiString, {
      type: 'png', width: 220, margin: 1, color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('[pdfService] QR generation failed, using fallback image:', err.message);
    qrBuffer = fs.existsSync(FALLBACK_QR_PATH) ? fs.readFileSync(FALLBACK_QR_PATH) : null;
  }

  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } });
  const signaturePath = resolveAssetPath(settings?.signaturePath);
  const stampPath = resolveAssetPath(settings?.stampPath);

  const doc    = new PDFDocument({ size: PAGE_SIZE, margin: MARGIN });
  const stream = fs.createWriteStream(outPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    const startNewPage = () => {
      let y = drawHeader(doc, { invoiceNo, dateLabel: fmtDate(new Date()), docLabel: 'TAX INVOICE', bizName });
      return drawMonthlyTableHeader(doc, y);
    };

    let y = drawHeader(doc, { invoiceNo, dateLabel: fmtDate(new Date()), docLabel: 'TAX INVOICE', bizName });
    y = drawParties(doc, y, {
      clientName: summary.clientName,
      address:    summary.address,
      route:      summary.route,
      upiId,
      payeeName,
      singleAmount: null,
    });
    y = drawMonthlyTableHeader(doc, y);

    summary.months.forEach((m, i) => {
      y = ensureSpace(doc, y, ROW_H_MS, startNewPage);
      drawMonthlyRow(doc, y, {
        label: `${MONTH_NAMES[m.month]} ${m.year}`,
        span:  `${fmtDate(m.spanStart)} - ${fmtDate(m.spanEnd)}`,
        bottles: String(m.bottles),
        bill: fmtRupee(m.bill),
      }, i % 2 === 1);
      y += ROW_H_MS;
    });

    // Total row
    y = ensureSpace(doc, y, ROW_H_MS, startNewPage);
    doc.rect(CONTENT_X, y, CONTENT_W, ROW_H_MS).fill(COLOR.headerBg);
    const totalBottles = summary.months.reduce((s, m) => s + m.bottles, 0);
    const sty = y + ROW_H_MS / 2 - 4.5;
    doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(9)
       .text('TOTAL', COL_MS.month.x + 8, sty, { width: COL_MS.month.w - 8 })
       .text(String(totalBottles), COL_MS.bottles.x, sty, { width: COL_MS.bottles.w - 8, align: 'right' })
       .text(fmtRupee(summary.totalBill), COL_MS.bill.x, sty, { width: COL_MS.bill.w - 8, align: 'right' });
    doc.moveTo(CONTENT_X, y + ROW_H_MS).lineTo(CONTENT_R, y + ROW_H_MS).lineWidth(0.5).strokeColor(COLOR.border).stroke();
    y += ROW_H_MS + 16;

    // ── totals block + QR, side by side (same layout as the detailed invoice) ──
    const blockH = 130;
    y = ensureSpace(doc, y, blockH, startNewPage);

    const qrX = CONTENT_X;
    const qrW = 190;
    const totW = CONTENT_W - qrW - 20;
    const totX = CONTENT_R - totW;

    doc.rect(qrX, y, qrW, blockH).fill(COLOR.brandLite).stroke(COLOR.border);
    doc.fillColor(COLOR.grayLite).font(FONT.bold).fontSize(8)
       .text('SCAN TO PAY', qrX, y + 10, { width: qrW, align: 'center' });
    if (qrBuffer) {
      doc.image(qrBuffer, qrX + (qrW - 110) / 2, y + 22, { width: 110, height: 110 - 24 });
    }
    doc.fillColor(COLOR.dark).font(FONT.bold).fontSize(8)
       .text(`UPI: ${upiId}`, qrX, y + blockH - 24, { width: qrW, align: 'center' });
    doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(7)
       .text(payeeName, qrX, y + blockH - 13, { width: qrW, align: 'center' });

    doc.rect(totX, y, totW, blockH).fill('#ffffff').stroke(COLOR.border);
    let ty2 = y + 16;
    totalsLine(doc, totX + 14, totW - 28, ty2, 'Total Bill (this range):', fmtRupee(summary.totalBill));
    ty2 += 16;
    if (summary.outstanding > 0) {
      totalsLine(doc, totX + 14, totW - 28, ty2, 'Outstanding:', fmtRupee(summary.outstanding), { color: COLOR.red });
      ty2 += 16;
    }
    doc.moveTo(totX + 14, ty2 + 4).lineTo(totX + totW - 14, ty2 + 4)
       .lineWidth(1).strokeColor(COLOR.brand).stroke();
    ty2 += 14;
    totalsLine(doc, totX + 14, totW - 28, ty2, 'TOTAL DUE:', fmtRupee(Math.max(summary.outstanding, 0)), {
      bold: true, size: 13, color: summary.outstanding > 0 ? COLOR.red : COLOR.green, labelColor: COLOR.dark,
    });
    ty2 += 22;
    const status = summary.outstanding > 0 ? 'UNPAID' : 'PAID';
    doc.fillColor(STATUS_COLOR[status]).font(FONT.bold).fontSize(9)
       .text(STATUS_LABEL[status], totX + 14, ty2, { width: totW - 28, align: 'right' });

    y += blockH + 10;

    if (signaturePath || stampPath) {
      y = ensureSpace(doc, y, SIGNATURE_BLOCK_H, startNewPage);
      y = drawSignatureBlock(doc, totX, totW, y, { signaturePath, stampPath });
    }

    drawFooter(doc);
    doc.end();
  });

  return outPath;
}

// ─── generateClientMonthPDF ───────────────────────────────────────────────────
// Builds a monthly invoice/statement PDF straight from live Invoice +
// Delivery data (via billingService) — no MonthlyBill row involved, so the
// PDF's status and totals can never drift from what Invoices/Statement show.
async function generateClientMonthPDF(clientId, month, year) {
  const billing = await getClientMonthBilling(clientId, month, year);
  if (!billing) throw new Error(`Client ${clientId} not found`);

  const invoiceNo = `BILL-${year}-${String(month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;
  const outPath = path.join(UPLOADS_DIR, `billing-${clientId}-${year}-${String(month).padStart(2, '0')}.pdf`);

  return renderBillingPDF(billing, { invoiceNo, outPath });
}

// ─── generateClientRangePDF ───────────────────────────────────────────────────
// Same as generateClientMonthPDF but for an arbitrary custom IST date range
// (yyyy-mm-dd from/to) instead of a calendar month.
async function generateClientRangePDF(clientId, from, to) {
  const billing = await getClientRangeBilling(clientId, from, to);
  if (!billing) throw new Error(`Client ${clientId} not found`);

  const compact = (d) => d.replace(/-/g, '');
  const invoiceNo = `BILL-${compact(from)}-${compact(to)}-${clientId.slice(-6).toUpperCase()}`;
  const outPath = path.join(UPLOADS_DIR, `billing-${clientId}-${compact(from)}-${compact(to)}.pdf`);

  return renderBillingPDF(billing, { invoiceNo, outPath });
}

// ─── generateClientMonthlySummaryPDF ───────────────────────────────────────────
// Option 2 of the billing invoice download: one row per calendar month across
// an arbitrary IST date range (yyyy-mm-dd from/to), instead of a row per
// delivery. Months with no deliveries are simply absent from the table.
async function generateClientMonthlySummaryPDF(clientId, from, to) {
  const summary = await getClientMonthlySummary(clientId, from, to);
  if (!summary) throw new Error(`Client ${clientId} not found`);

  const compact = (d) => d.replace(/-/g, '');
  const invoiceNo = `BILL-MS-${compact(from)}-${compact(to)}-${clientId.slice(-6).toUpperCase()}`;
  const outPath = path.join(UPLOADS_DIR, `billing-monthly-${clientId}-${compact(from)}-${compact(to)}.pdf`);

  return renderMonthlySummaryPDF(summary, { invoiceNo, outPath });
}

module.exports = { generateClientMonthPDF, generateClientRangePDF, generateClientMonthlySummaryPDF };
