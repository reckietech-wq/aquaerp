const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const fs          = require('fs');
const path        = require('path');
const { getClientMonthBilling, getClientRangeBilling } = require('./billingService');
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

const SIGNATURE_BLOCK_H = 90;

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

const FOOTER_RESERVE = 40;

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

// ─── signature & stamp block ────────────────────────────────────────────────
// Bottom-right, above the footer's "Thank you" line. Renders only whichever
// of the two images is actually uploaded — with neither, the block is
// skipped entirely (caller checks before reserving space for it).
function drawSignatureBlock(doc, y, { signaturePath, stampPath }) {
  const blockW = 200;
  const blockX = CONTENT_R - blockW;

  if (stampPath) {
    try {
      // Drawn first (so it sits "behind" the signature in z-order) and
      // faded slightly so it reads as a stamp impression, not a sticker.
      doc.save();
      doc.opacity(0.8);
      doc.image(stampPath, blockX, y, { fit: [75, 75] });
      doc.restore();
    } catch (err) {
      console.error('[pdfService] stamp embed failed:', err.message);
    }
  }

  if (signaturePath) {
    try {
      doc.image(signaturePath, blockX + 75, y + 8, { fit: [110, 40], align: 'center' });
    } catch (err) {
      console.error('[pdfService] signature embed failed:', err.message);
    }
    const lineY = y + 58;
    doc.moveTo(blockX + 75, lineY).lineTo(blockX + blockW, lineY)
       .lineWidth(0.5).strokeColor(COLOR.border).stroke();
    doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(8)
       .text('Authorized Signatory', blockX + 75, lineY + 5, { width: blockW - 75, align: 'center' });
  }

  return y + SIGNATURE_BLOCK_H;
}

// ─── footer ─────────────────────────────────────────────────────────────────
function drawFooter(doc, bizName) {
  // The footer sits inside the page's bottom margin band, so PDFKit's
  // automatic pagination (which checks new text against page.margins.bottom)
  // would otherwise silently insert a blank page here — zero the bottom
  // margin only while drawing it.
  const savedBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const y = PAGE_H - MARGIN - 26;
  doc.moveTo(CONTENT_X, y).lineTo(CONTENT_R, y).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  doc.fillColor(COLOR.gray).font(FONT.regular).fontSize(9)
     .text('Thank you for your business!', CONTENT_X, y + 8, { width: CONTENT_W, align: 'center', lineBreak: false });
  doc.fillColor(COLOR.grayLite).font(FONT.regular).fontSize(7)
     .text(bizName, CONTENT_X, y + 20, { width: CONTENT_W, align: 'center', lineBreak: false });

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
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${Math.max(remaining, 0).toFixed(2)}&cu=INR&tn=${invoiceNo}`;

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
  const docLabel = isSingle ? 'TAX INVOICE' : 'STATEMENT';

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

    y += blockH + 16;

    // ── signature & stamp ────────────────────────────────────────────────
    if (signaturePath || stampPath) {
      y = ensureSpace(doc, y, SIGNATURE_BLOCK_H, startNewPage);
      drawSignatureBlock(doc, y, { signaturePath, stampPath });
    }

    drawFooter(doc, bizName);
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

module.exports = { generateClientMonthPDF, generateClientRangePDF };
