const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const fs          = require('fs');
const path        = require('path');
const { getClientMonthBilling } = require('./billingService');

// ─── constants ────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../uploads/invoices');
const FALLBACK_QR_PATH = path.join(__dirname, '../../assets/payment-qr.png');
const BRAND_BLUE  = '#1e3a5f';
const BRAND_LIGHT = '#e8f0fe';
const GRAY        = '#64748b';
const DARK        = '#1e293b';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_LABEL = { PAID: 'PAID', PARTIAL: 'PARTIALLY PAID', UNPAID: 'UNPAID' };
const STATUS_COLOR = { PAID: '#86efac', PARTIAL: '#fde68a', UNPAID: '#fca5a5' };

function fmtRupee(n) {
  return `Rs. ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
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

    doc.fillColor('#ffffff')
       .fontSize(22).font('Helvetica-Bold')
       .text(bizName, 50, 22);
    doc.fontSize(10).font('Helvetica')
       .fillColor('#93c5fd')
       .text('Water Can Delivery Management', 50, 48);

    doc.rect(50, 64, 130, 18).fill('#ffffff').fillOpacity(0.15);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('MONTHLY INVOICE', 55, 68);
    doc.fillOpacity(1);

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
    const tableY = infoY + 118;
    const col    = { date: 50, bottles: 210, rate: 300, amount: 390, status: 470 };

    doc.rect(50, tableY, W - 100, 22).fill(BRAND_BLUE);
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
       .text('DATE',    col.date,    tableY + 7)
       .text('BOTTLES', col.bottles, tableY + 7)
       .text('RATE',    col.rate,    tableY + 7)
       .text('AMOUNT',  col.amount,  tableY + 7)
       .text('STATUS',  col.status,  tableY + 7);

    let rowY = tableY + 22;

    billing.deliveries.forEach((d, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(50, rowY, W - 100, 20).fill(bg);

      doc.fillColor(DARK).fontSize(8).font('Helvetica')
         .text(fmtDate(d.date),              col.date,    rowY + 6)
         .text(String(d.bottles),            col.bottles, rowY + 6)
         .text(`Rs.${d.rate.toFixed(0)}`,    col.rate,    rowY + 6)
         .text(`Rs.${d.amount.toFixed(2)}`,  col.amount,  rowY + 6)
         .fillColor(d.isPaid ? '#16a34a' : Number(d.amountPaid) > 0 ? '#d97706' : '#dc2626')
         .font('Helvetica-Bold')
         .text(d.isPaid ? 'Paid' : Number(d.amountPaid) > 0 ? 'Partial' : 'Unpaid', col.status, rowY + 6);

      rowY += 20;

      if (rowY > doc.page.height - 230) {
        doc.addPage();
        rowY = 50;
      }
    });

    // Subtotal row
    doc.rect(50, rowY, W - 100, 22).fill('#e2e8f0');
    doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
       .text('SUBTOTAL', col.date, rowY + 7)
       .text(String(billing.totalBottles), col.bottles, rowY + 7)
       .text('', col.rate, rowY + 7)
       .text(`Rs.${billing.totalBilled.toFixed(2)}`, col.amount, rowY + 7);
    rowY += 22;

    doc.moveTo(50, rowY + 8).lineTo(W - 50, rowY + 8).stroke('#e2e8f0');
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
    const footerY = Math.max(rowY + 20, doc.page.height - 60);
    doc.rect(0, footerY, W, 50).fill(BRAND_BLUE);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('Thank you for your business!', 0, footerY + 10, { align: 'center', width: W });
    doc.fontSize(7).font('Helvetica').fillColor('#93c5fd')
       .text(`${bizName} · Water Can Delivery Management`, 0, footerY + 26,
             { align: 'center', width: W });

    doc.end();
  });

  return outPath;
}

module.exports = { generateClientMonthPDF };
