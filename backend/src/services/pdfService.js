const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const fs          = require('fs');
const path        = require('path');
const { getClientMonthBilling } = require('./billingService');

// ─── constants ────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../uploads/invoices');
const FALLBACK_QR_PATH = path.join(__dirname, '../../assets/payment-qr.png');
const LOGO_PATH = path.join(__dirname, '../../assets/logo.png');
const BRAND_BLUE  = '#1e3a5f';
const BRAND_LIGHT = '#e8f0fe';
const GRAY        = '#64748b';
const DARK        = '#1e293b';
const BORDER      = '#cbd5e1';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABEL = { PAID: 'PAID', PARTIAL: 'PARTIALLY PAID', UNPAID: 'UNPAID' };
const STATUS_COLOR = { PAID: '#86efac', PARTIAL: '#fde68a', UNPAID: '#fca5a5' };

function fmtRupee(n) {
  return `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// dd/mm/yyyy — consistent with the web UI's invoice/statement views
function fmtDate(d) {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── generateClientMonthPDF ───────────────────────────────────────────────────
// Builds a monthly invoice PDF straight from live Invoice + Delivery data
// (via billingService) — no MonthlyBill row involved, so the PDF's status and
// totals can never drift from what Invoices/Statement show.

async function generateClientMonthPDF(clientId, month, year) {
  ensureDir();

  const billing = await getClientMonthBilling(clientId, month, year);
  if (!billing) throw new Error(`Client ${clientId} not found`);

  const invoiceNo = `BILL-${year}-${String(month).padStart(2, '0')}-${clientId.slice(-6).toUpperCase()}`;
  const upiId     = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || 'yourbusiness@upi';
  const payeeName = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const bizName   = process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const remaining = parseFloat((billing.totalBilled - billing.totalPaid).toFixed(2));
  const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${Math.max(remaining, 0).toFixed(2)}&cu=INR&tn=${invoiceNo}`;

  // ── Generate QR buffer ──────────────────────────────────────────────────────
  let qrBuffer;
  try {
    qrBuffer = await QRCode.toBuffer(upiString, {
      type:  'png',
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('[pdfService] QR generation failed, using fallback image:', err.message);
    qrBuffer = fs.existsSync(FALLBACK_QR_PATH) ? fs.readFileSync(FALLBACK_QR_PATH) : null;
  }

  // ── Build PDF ───────────────────────────────────────────────────────────────
  const outPath = path.join(UPLOADS_DIR, `billing-${clientId}-${year}-${String(month).padStart(2, '0')}.pdf`);
  const doc     = new PDFDocument({ size: 'A4', margin: 50 });
  const stream  = fs.createWriteStream(outPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error',  reject);

    const W = doc.page.width;

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, 90).fill(BRAND_BLUE);

    // Logo (falls back gracefully — text-only header — if the asset is missing)
    let textX = 50;
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, 50, 20, { width: 48, height: 48 });
        textX = 108;
      } catch (err) {
        console.error('[pdfService] logo embed failed:', err.message);
      }
    }

    doc.fillColor('#ffffff')
       .fontSize(22).font('Helvetica-Bold')
       .text(bizName, textX, 22);
    doc.fontSize(10).font('Helvetica')
       .fillColor('#93c5fd')
       .text('Water Can Delivery Management', textX, 48);

    // fillOpacity must be set BEFORE the fill it applies to, not after — the
    // previous ordering filled this badge fully opaque, then drew white text
    // at 15% opacity, rendering as an invisible white-on-white box.
    doc.fillOpacity(0.15).rect(textX, 64, 130, 18).fill('#ffffff');
    doc.fillOpacity(1);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('MONTHLY INVOICE', textX + 5, 68);

    const boxX = W - 220;
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica')
       .text(`Invoice No:`, boxX, 18, { continued: true })
       .font('Helvetica-Bold').text(`  ${invoiceNo}`)
       .font('Helvetica').text(`Month:`, boxX, 36, { continued: true })
       .font('Helvetica-Bold').text(`  ${MONTH_NAMES[month]} ${year}`)
       .font('Helvetica').text(`Generated:`, boxX, 54, { continued: true })
       .font('Helvetica-Bold').text(`  ${fmtDate(new Date())}`)
       .font('Helvetica').text(`Status:`, boxX, 72, { continued: true })
       .font('Helvetica-Bold').fillColor(STATUS_COLOR[billing.status])
       .text(`  ${STATUS_LABEL[billing.status]}`);

    doc.fillOpacity(1).fillColor(DARK);

    // ── CLIENT INFO BOX ───────────────────────────────────────────────────────
    const infoY = 110;
    doc.rect(50, infoY, 240, 60).fill(BRAND_LIGHT).stroke('#c7d2fe');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('BILL TO', 62, infoY + 10);
    doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
       .text(billing.clientName, 62, infoY + 22);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text(billing.address, 62, infoY + 38, { width: 216 });

    const periodX = W - 240;
    doc.rect(periodX, infoY, 190, 100).fill(BRAND_LIGHT).stroke('#c7d2fe');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('BILLING PERIOD', periodX + 12, infoY + 10);
    doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
       .text(`${MONTH_NAMES[month]} ${year}`, periodX + 12, infoY + 24);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text(`Deliveries: ${billing.deliveries.length}`, periodX + 12, infoY + 50)
       .text(`Total Bottles: ${billing.totalBottles}`, periodX + 12, infoY + 64)
       .text(`Driver: ${billing.driverName}`, periodX + 12, infoY + 78);

    // ── DELIVERY / INVOICE TABLE ───────────────────────────────────────────────
    // Columns are given explicit x/width so numeric columns can be properly
    // right-aligned rather than left-anchored text at a fixed x.
    const tableY   = infoY + 118;
    const tableL   = 50;
    const tableR   = W - 50;
    const col = {
      date:    { x: tableL,       w: 130 },
      bottles: { x: tableL + 130, w: 80  },
      rate:    { x: tableL + 210, w: 90  },
      amount:  { x: tableL + 300, w: 100 },
      status:  { x: tableL + 400, w: tableR - (tableL + 400) },
    };

    doc.rect(tableL, tableY, tableR - tableL, 22).fill(BRAND_BLUE);
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
       .text('DATE',    col.date.x    + 8, tableY + 7)
       .text('BOTTLES', col.bottles.x,     tableY + 7, { width: col.bottles.w - 8, align: 'right' })
       .text('RATE',    col.rate.x,        tableY + 7, { width: col.rate.w    - 8, align: 'right' })
       .text('AMOUNT',  col.amount.x,      tableY + 7, { width: col.amount.w  - 8, align: 'right' })
       .text('STATUS',  col.status.x,      tableY + 7, { width: col.status.w, align: 'center' });

    let rowY = tableY + 22;

    billing.deliveries.forEach((d, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(tableL, rowY, tableR - tableL, 20).fill(bg)
         .rect(tableL, rowY, tableR - tableL, 20).stroke(BORDER);

      doc.fillColor(DARK).fontSize(8).font('Helvetica')
         .text(fmtDate(d.date), col.date.x + 8, rowY + 6)
         .text(String(d.bottles),           col.bottles.x, rowY + 6, { width: col.bottles.w - 8, align: 'right' })
         .text(`Rs.${d.rate.toFixed(0)}`,   col.rate.x,    rowY + 6, { width: col.rate.w    - 8, align: 'right' })
         .text(`Rs.${d.amount.toFixed(2)}`, col.amount.x,  rowY + 6, { width: col.amount.w  - 8, align: 'right' })
         .fillColor(d.isPaid ? '#16a34a' : Number(d.amountPaid) > 0 ? '#d97706' : '#dc2626')
         .font('Helvetica-Bold')
         .text(d.isPaid ? 'Paid' : Number(d.amountPaid) > 0 ? 'Partial' : 'Unpaid', col.status.x, rowY + 6, { width: col.status.w, align: 'center' });

      rowY += 20;

      if (rowY > doc.page.height - 230) {
        doc.addPage();
        rowY = 50;
      }
    });

    // Subtotal row
    doc.rect(tableL, rowY, tableR - tableL, 22).fill('#e2e8f0')
       .rect(tableL, rowY, tableR - tableL, 22).stroke(BORDER);
    doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
       .text('SUBTOTAL', col.date.x + 8, rowY + 7)
       .text(String(billing.totalBottles), col.bottles.x, rowY + 7, { width: col.bottles.w - 8, align: 'right' })
       .text(`Rs.${billing.totalBilled.toFixed(2)}`, col.amount.x, rowY + 7, { width: col.amount.w - 8, align: 'right' });
    rowY += 22;

    doc.moveTo(tableL, rowY + 8).lineTo(tableR, rowY + 8).stroke(BORDER);
    rowY += 20;

    // ── BILLING SUMMARY ───────────────────────────────────────────────────────
    const summaryX = W - 250;
    doc.rect(summaryX, rowY, 200, 128).fill(BRAND_LIGHT).stroke('#c7d2fe');

    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Total Billed (this month):', summaryX + 12, rowY + 14, { continued: true })
       .font('Helvetica-Bold').fillColor(DARK)
       .text(`  ${fmtRupee(billing.totalBilled)}`, { align: 'right', width: 170 });

    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Paid (this month):', summaryX + 12, rowY + 30, { continued: true })
       .font('Helvetica-Bold').fillColor('#16a34a')
       .text(`  ${fmtRupee(billing.totalPaid)}`, { align: 'right', width: 170 });

    // Divider
    doc.moveTo(summaryX + 12, rowY + 50).lineTo(summaryX + 188, rowY + 50)
       .lineWidth(1.5).stroke(BRAND_BLUE);

    doc.fillColor(BRAND_BLUE).fontSize(11).font('Helvetica-Bold')
       .text('CLIENT OUTSTANDING', summaryX + 12, rowY + 58);
    doc.fontSize(14).fillColor(billing.outstanding > 0 ? '#dc2626' : '#16a34a')
       .text(fmtRupee(billing.outstanding), summaryX + 12, rowY + 76,
             { align: 'right', width: 176 });
    doc.fontSize(7).fillColor(GRAY).font('Helvetica')
       .text('(client\'s total running balance, not just this month)', summaryX + 12, rowY + 96, { width: 176 });

    // ── PAYMENT QR ────────────────────────────────────────────────────────────
    const qrAreaX = 50;
    const qrAreaY = rowY;

    doc.rect(qrAreaX, qrAreaY, 180, 128).fill(BRAND_LIGHT).stroke('#c7d2fe');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('SCAN TO PAY', qrAreaX + 55, qrAreaY + 8);

    if (qrBuffer) {
      doc.image(qrBuffer, qrAreaX + 40, qrAreaY + 18, { width: 80, height: 80 });
    }

    doc.fillColor(DARK).fontSize(7).font('Helvetica-Bold')
       .text(`UPI: ${upiId}`, qrAreaX + 12, qrAreaY + 100, { width: 156, align: 'center' });
    doc.fillColor(GRAY).fontSize(6).font('Helvetica')
       .text(payeeName, qrAreaX + 12, qrAreaY + 112, { width: 156, align: 'center' });

    rowY += 138;

    // ── FOOTER ────────────────────────────────────────────────────────────────
    // The footer band deliberately sits in the page's bottom margin area, so
    // PDFKit's automatic pagination (which checks new text against
    // page.margins.bottom) would otherwise silently insert 1-2 blank pages
    // here — temporarily zero the bottom margin while drawing it.
    const footerY = Math.max(rowY + 20, doc.page.height - 60);
    const savedBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.rect(0, footerY, W, 50).fill(BRAND_BLUE);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('Thank you for your business!', 0, footerY + 10, { align: 'center', width: W, lineBreak: false });
    doc.fontSize(7).font('Helvetica').fillColor('#93c5fd')
       .text(`${bizName} · Water Can Delivery Management`, 0, footerY + 26,
             { align: 'center', width: W, lineBreak: false });

    doc.page.margins.bottom = savedBottomMargin;

    doc.end();
  });

  return outPath;
}

module.exports = { generateClientMonthPDF };
