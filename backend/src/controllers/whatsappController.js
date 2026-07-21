const prisma    = require('../lib/prisma');
const { buildWhatsAppMessage, buildWhatsAppURL } = require('../services/whatsappService');
const { generateMonthlyInvoicePDF }              = require('../services/pdfService');
const fs = require('fs');

const CLIENT_SELECT = {
  id:      true,
  name:    true,
  mobile:  true,
  address: true,
  route:   true,
  assignedDriver: {
    select: { user: { select: { name: true } } },
  },
};

// ─── getWhatsAppLink ──────────────────────────────────────────────────────────

async function getWhatsAppLink(req, res) {
  const { id } = req.params;

  const bill = await prisma.monthlyBill.findUnique({
    where:   { id },
    include: { client: { select: CLIENT_SELECT } },
  });

  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  // Kick off PDF generation in background if not already on disk
  if (!bill.pdfPath || !fs.existsSync(bill.pdfPath)) {
    generateMonthlyInvoicePDF(id).catch((err) =>
      console.error(`[whatsapp] PDF gen failed for bill ${id}:`, err.message),
    );
  }

  const message     = buildWhatsAppMessage(bill);
  const url         = buildWhatsAppURL(bill.client.mobile, message);
  const previewText = message.replace(/\*/g, '').split('\n').slice(0, 6).join('\n');

  res.json({
    url,
    message,
    previewText,
    clientName: bill.client.name,
    mobile:     bill.client.mobile,
    billId:     bill.id,
    month:      bill.month,
    year:       bill.year,
  });
}

// ─── bulkWhatsAppLinks ────────────────────────────────────────────────────────

async function bulkWhatsAppLinks(req, res) {
  const { ids, month, year } = req.body ?? {};

  let bills;

  if (Array.isArray(ids) && ids.length > 0) {
    bills = await prisma.monthlyBill.findMany({
      where:   { id: { in: ids } },
      include: { client: { select: CLIENT_SELECT } },
      orderBy: { client: { name: 'asc' } },
    });
  } else if (month && year) {
    bills = await prisma.monthlyBill.findMany({
      where:   { month: parseInt(month), year: parseInt(year) },
      include: { client: { select: CLIENT_SELECT } },
      orderBy: { client: { name: 'asc' } },
    });
  } else {
    return res.status(400).json({
      error: 'Provide either ids[] or month+year',
    });
  }

  const results = bills.map((bill) => {
    const message = buildWhatsAppMessage(bill);
    const url     = buildWhatsAppURL(bill.client.mobile, message);
    return {
      billId:     bill.id,
      clientName: bill.client.name,
      mobile:     bill.client.mobile,
      status:     bill.status,
      url,
      message,
    };
  });

  res.json({ count: results.length, links: results });
}

module.exports = { getWhatsAppLink, bulkWhatsAppLinks };
