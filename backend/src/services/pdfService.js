const PDFDocument = require('pdfkit');
const QRCode      = require('qrcode');
const fs          = require('fs');
const path        = require('path');
const prisma      = require('../lib/prisma');

// ─── constants ────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '../../uploads/invoices');
const BRAND_BLUE  = '#1e3a5f';
const BRAND_LIGHT = '#e8f0fe';
const GRAY        = '#64748b';
const DARK        = '#1e293b';
const GREEN       = '#16a34a';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

// ─── generateMonthlyInvoicePDF ────────────────────────────────────────────────

async function generateMonthlyInvoicePDF(billId) {
  ensureDir();

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const bill = await prisma.monthlyBill.findUnique({
    where:   { id: billId },
    include: {
      client: {
        select: {
          id:      true,
          name:    true,
          address: true,
        },
      },
    },
  });

  if (!bill) throw new Error(`Bill ${billId} not found`);

  const { start, end } = monthRange(bill.month, bill.year);
  const deliveries = await prisma.delivery.findMany({
    where: {
      clientId:     bill.clientId,
      deliveryDate: { gte: start, lt: end },
      status:       'COMPLETED',
    },
    orderBy: { deliveryDate: 'asc' },
    select:  { deliveryDate: true, filledBottlesDelivered: true, emptyBottlesCollected: true },
  });

  const { client } = bill;
  const invoiceNo  = `BILL-${bill.year}-${String(bill.month).padStart(2, '0')}-${client.id.slice(-6).toUpperCase()}`;
  const upiId      = process.env.UPI_ID || 'yourbusiness@upi';
  const upiString  = `upi://pay?pa=${upiId}&pn=AquaERP&am=${Number(bill.totalAmount).toFixed(2)}&cu=INR&tn=${invoiceNo}`;

  // ── Generate QR buffer ──────────────────────────────────────────────────────
  const qrBuffer = await QRCode.toBuffer(upiString, {
    type:  'png',
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  // ── Build PDF ───────────────────────────────────────────────────────────────
  const outPath = path.join(UPLOADS_DIR, `bill-${billId}.pdf`);
  const doc     = new PDFDocument({ size: 'A4', margin: 50 });
  const stream  = fs.createWriteStream(outPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error',  reject);

    const W = doc.page.width;   // 595
    // const H = doc.page.height;  // 842

    // ── HEADER ────────────────────────────────────────────────────────────────
    // Blue banner
    doc.rect(0, 0, W, 90).fill(BRAND_BLUE);

    // Logo / company name
    doc.fillColor('#ffffff')
       .fontSize(22).font('Helvetica-Bold')
       .text('AquaERP', 50, 22);
    doc.fontSize(10).font('Helvetica')
       .fillColor('#93c5fd')
       .text('Water Can Delivery Management', 50, 48);

    // "MONTHLY INVOICE" badge
    doc.rect(50, 64, 130, 18).fill('#ffffff').fillOpacity(0.15);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('MONTHLY INVOICE', 55, 68);
    doc.fillOpacity(1);

    // Invoice details box (right side of banner)
    const boxX = W - 220;
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica')
       .text(`Invoice No:`, boxX, 18, { continued: true })
       .font('Helvetica-Bold').text(`  ${invoiceNo}`)
       .font('Helvetica').text(`Month:`, boxX, 36, { continued: true })
       .font('Helvetica-Bold').text(`  ${MONTH_NAMES[bill.month]} ${bill.year}`)
       .font('Helvetica').text(`Generated:`, boxX, 54, { continued: true })
       .font('Helvetica-Bold').text(`  ${fmtDate(new Date())}`)
       .font('Helvetica').text(`Status:`, boxX, 72, { continued: true })
       .font('Helvetica-Bold').fillColor(bill.status === 'PAID' ? '#86efac' : '#fde68a')
       .text(`  ${bill.status}`);

    doc.fillOpacity(1).fillColor(DARK);

    // ── CLIENT INFO BOX ───────────────────────────────────────────────────────
    const infoY = 110;
    doc.rect(50, infoY, 240, 60).fill(BRAND_LIGHT).stroke('#c7d2fe');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('BILL TO', 62, infoY + 10);
    doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
       .text(client.name, 62, infoY + 22);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text(client.address, 62, infoY + 38, { width: 216 });

    // Bill period box (right of client info)
    const periodX = W - 240;
    doc.rect(periodX, infoY, 190, 100).fill(BRAND_LIGHT).stroke('#c7d2fe');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('BILLING PERIOD', periodX + 12, infoY + 10);
    doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
       .text(`${MONTH_NAMES[bill.month]} ${bill.year}`, periodX + 12, infoY + 24);
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text(`Deliveries: ${deliveries.length}`, periodX + 12, infoY + 50)
       .text(`Total Bottles: ${bill.totalBottlesDelivered}`, periodX + 12, infoY + 64)
       .text(`Empty Collected: ${bill.totalEmptyCollected}`, periodX + 12, infoY + 78);

    // ── DELIVERY TABLE ────────────────────────────────────────────────────────
    const tableY = infoY + 118;
    const col    = { date: 50, filled: 280, empty: 400, total: 490 };

    // Table header
    doc.rect(50, tableY, W - 100, 22).fill(BRAND_BLUE);
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
       .text('DATE',              col.date   + 6, tableY + 7)
       .text('FILLED DELIVERED',  col.filled - 30, tableY + 7)
       .text('EMPTY COLLECTED',   col.empty  - 20, tableY + 7)
       .text('RUNNING TOTAL',     col.total  - 20, tableY + 7);

    // Table rows
    let rowY       = tableY + 22;
    let runningTotal = 0;

    deliveries.forEach((d, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(50, rowY, W - 100, 20).fill(bg);

      runningTotal += d.filledBottlesDelivered;

      doc.fillColor(DARK).fontSize(8).font('Helvetica')
         .text(fmtDate(d.deliveryDate),        col.date   + 6, rowY + 6)
         .text(String(d.filledBottlesDelivered), col.filled + 30, rowY + 6)
         .text(String(d.emptyBottlesCollected),  col.empty  + 20, rowY + 6)
         .text(String(runningTotal),             col.total  + 10, rowY + 6);

      rowY += 20;

      // Page break if needed (leave room for billing summary ~180px)
      if (rowY > doc.page.height - 230) {
        doc.addPage();
        rowY = 50;
      }
    });

    // Subtotal row
    doc.rect(50, rowY, W - 100, 22).fill('#e2e8f0');
    doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold')
       .text('SUBTOTAL', col.date + 6, rowY + 7)
       .text(String(bill.totalBottlesDelivered), col.filled + 30, rowY + 7)
       .text(String(bill.totalEmptyCollected),   col.empty  + 20, rowY + 7);
    rowY += 22;

    // Thin separator
    doc.moveTo(50, rowY + 8).lineTo(W - 50, rowY + 8).stroke('#e2e8f0');
    rowY += 20;

    // ── BILLING SUMMARY ───────────────────────────────────────────────────────
    const summaryX = W - 250;
    doc.rect(summaryX, rowY, 200, 110).fill(BRAND_LIGHT).stroke('#c7d2fe');

    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Total Bottles Delivered:', summaryX + 12, rowY + 14, { continued: true })
       .font('Helvetica-Bold').fillColor(DARK)
       .text(`  ${bill.totalBottlesDelivered}`, { align: 'right', width: 170 });

    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Rate per Bottle:', summaryX + 12, rowY + 30, { continued: true })
       .font('Helvetica-Bold').fillColor(DARK)
       .text(`  ${fmtRupee(bill.ratePerBottle)}`, { align: 'right', width: 170 });

    // Divider
    doc.moveTo(summaryX + 12, rowY + 50).lineTo(summaryX + 188, rowY + 50)
       .lineWidth(1.5).stroke(BRAND_BLUE);

    doc.fillColor(BRAND_BLUE).fontSize(12).font('Helvetica-Bold')
       .text('TOTAL AMOUNT', summaryX + 12, rowY + 58);
    doc.fontSize(14)
       .text(fmtRupee(bill.totalAmount), summaryX + 12, rowY + 76,
             { align: 'right', width: 176 });

    // ── PAYMENT QR ────────────────────────────────────────────────────────────
    const qrAreaX = 50;
    const qrAreaY = rowY;

    doc.rect(qrAreaX, qrAreaY, 180, 110).fill(BRAND_LIGHT).stroke('#c7d2fe');
    doc.fillColor(GRAY).fontSize(7).font('Helvetica-Bold')
       .text('SCAN TO PAY', qrAreaX + 55, qrAreaY + 8);

    // Embed QR image
    doc.image(qrBuffer, qrAreaX + 40, qrAreaY + 18, { width: 80, height: 80 });

    doc.fillColor(DARK).fontSize(7).font('Helvetica')
       .text(upiId, qrAreaX + 12, qrAreaY + 100, { width: 156, align: 'center' });

    rowY += 120;

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = Math.max(rowY + 20, doc.page.height - 60);
    doc.rect(0, footerY, W, 50).fill(BRAND_BLUE);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
       .text('Thank you for your business!', 0, footerY + 10, { align: 'center', width: W });
    doc.fontSize(7).font('Helvetica').fillColor('#93c5fd')
       .text('AquaERP · Water Can Delivery Management', 0, footerY + 26,
             { align: 'center', width: W });

    doc.end();
  });

  // ── Persist pdfPath ─────────────────────────────────────────────────────────
  await prisma.monthlyBill.update({
    where: { id: billId },
    data:  { pdfPath: outPath },
  });

  return outPath;
}

// ─── shared helpers (duplicated from controller to avoid circular deps) ────────

function monthRange(month, year) {
  return {
    start: new Date(year, month - 1, 1),
    end:   new Date(year, month,     1),
  };
}

module.exports = { generateMonthlyInvoicePDF };
