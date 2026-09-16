const fs     = require('fs');
const path   = require('path');
const prisma = require('../lib/prisma');
const {
  monthRange, currentMonthYear, getClientMonthBilling, listMonthBilling,
} = require('../services/billingService');
const { generateClientMonthPDF } = require('../services/pdfService');
const { buildWhatsAppMessage, buildWhatsAppURL } = require('../services/whatsappService');

function resolveMonthYear(query) {
  let { month, year } = query;
  if (!month || !year) {
    const cur = currentMonthYear();
    return cur;
  }
  return { month: parseInt(month, 10), year: parseInt(year, 10) };
}

// ─── GET /api/billing?month=&year=  (ADMIN only) ──────────────────────────────
// Defaults to the current calendar month. Every figure is computed live from
// Invoice + Delivery records (via billingService) — no MonthlyBill table
// involved, so paid/unpaid/partial here always matches Invoices/Statement.
async function getBilling(req, res) {
  const { month, year } = resolveMonthYear(req.query);
  if (month < 1 || month > 12) return res.status(400).json({ error: 'month must be 1–12' });

  const { driverId, search, status } = req.query;
  const rows = await listMonthBilling({ month, year, driverId, search, status });

  const totalBilled      = rows.reduce((s, r) => s + r.totalBilled, 0);
  const totalPaid        = rows.reduce((s, r) => s + r.totalPaid, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  res.json({
    month,
    year,
    clients: rows,
    stats: {
      totalClients:   rows.length,
      totalBilled,
      totalPaid,
      totalOutstanding,
      paidCount:    rows.filter((r) => r.status === 'PAID').length,
      partialCount: rows.filter((r) => r.status === 'PARTIAL').length,
      unpaidCount:  rows.filter((r) => r.status === 'UNPAID').length,
    },
  });
}

// ─── GET /api/billing/:clientId?month=&year=  (ADMIN only) ────────────────────
// Full line-item detail for one client's month — same shape as a row in the
// list above, used to populate the expand/detail view without recomputing
// client-side.
async function getClientBilling(req, res) {
  const { clientId } = req.params;
  const { month, year } = resolveMonthYear(req.query);

  const billing = await getClientMonthBilling(clientId, month, year);
  if (!billing) return res.status(404).json({ error: 'Client not found' });

  res.json(billing);
}

// ─── GET /api/billing/:clientId/pdf?month=&year=  (ADMIN only) ────────────────
async function getBillingPDF(req, res) {
  const { clientId } = req.params;
  const { month, year } = resolveMonthYear(req.query);

  const filePath = await generateClientMonthPDF(clientId, month, year);
  const fileName = path.basename(filePath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  fs.createReadStream(filePath).pipe(res);
}

// ─── GET /api/billing/:clientId/whatsapp-link?month=&year=  (ADMIN only) ──────
async function getBillingWhatsAppLink(req, res) {
  const { clientId } = req.params;
  const { month, year } = resolveMonthYear(req.query);

  const billing = await getClientMonthBilling(clientId, month, year);
  if (!billing) return res.status(404).json({ error: 'Client not found' });

  const message = buildWhatsAppMessage(billing);
  const url     = buildWhatsAppURL(billing.mobile, message);

  res.json({
    url,
    message,
    clientName: billing.clientName,
    mobile:     billing.mobile,
    clientId,
    month,
    year,
  });
}

// ─── POST /api/billing/bulk-whatsapp-links  (ADMIN only) ──────────────────────
// Body: { clientIds: string[], month, year }
async function bulkBillingWhatsAppLinks(req, res) {
  const { clientIds, month, year } = req.body ?? {};
  if (!Array.isArray(clientIds) || clientIds.length === 0 || !month || !year) {
    return res.status(400).json({ error: 'clientIds[], month and year are required' });
  }
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);

  const results = [];
  for (const clientId of clientIds) {
    const billing = await getClientMonthBilling(clientId, m, y);
    if (!billing) continue;
    const message = buildWhatsAppMessage(billing);
    const url     = buildWhatsAppURL(billing.mobile, message);
    results.push({
      clientId,
      clientName:  billing.clientName,
      mobile:      billing.mobile,
      status:      billing.status,
      totalBilled: billing.totalBilled,
      url,
      message,
    });
  }

  res.json({ count: results.length, links: results });
}

// ─── PUT /api/billing/:clientId/mark-paid  (ADMIN only) ───────────────────────
// Body: { month, year, paymentMethod? }
// Marks every unpaid invoice for this client in that month as fully paid,
// through the SAME Invoice/PaymentHistory/Client.outstandingBalance fields
// everything else reads from — there's no separate "bill status" to drift
// out of sync anymore.
async function markMonthPaid(req, res) {
  const { clientId } = req.params;
  const { paymentMethod } = req.body ?? {};
  const { month, year } = resolveMonthYear(req.body ?? {});
  if (!month || !year) return res.status(400).json({ error: 'month and year are required' });

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const { start, end } = monthRange(month, year);
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { clientId, isPaid: false, delivery: { deliveryDate: { gte: start, lt: end } } },
  });

  if (unpaidInvoices.length === 0) {
    return res.json({ message: 'No unpaid invoices for this month', amountApplied: 0 });
  }

  const method = paymentMethod || 'CASH';
  let totalRemaining = 0;
  const invoiceUpdates = unpaidInvoices.map((inv) => {
    const remaining = Number(inv.totalAmount) - Number(inv.amountPaid);
    totalRemaining = parseFloat((totalRemaining + remaining).toFixed(2));
    return prisma.invoice.update({
      where: { id: inv.id },
      data: { isPaid: true, amountPaid: inv.totalAmount, paidAt: new Date(), paymentMethod: method },
    });
  });

  const balanceBefore = Number(client.outstandingBalance);
  const balanceAfter  = parseFloat((balanceBefore - totalRemaining).toFixed(2));

  await prisma.$transaction([
    ...invoiceUpdates,
    prisma.client.update({ where: { id: clientId }, data: { outstandingBalance: balanceAfter } }),
    prisma.paymentHistory.create({
      data: {
        clientId,
        amountPaid: totalRemaining,
        paymentMethod: method,
        balanceBefore,
        balanceAfter,
        recordedBy: req.user.loginId ?? req.user.id,
        note: `Billing: ${month}/${year} marked paid in full (${unpaidInvoices.length} invoice(s))`,
      },
    }),
  ]);

  res.json({ message: 'Month marked as paid', amountApplied: totalRemaining, newBalance: balanceAfter });
}

module.exports = {
  getBilling,
  getClientBilling,
  getBillingPDF,
  getBillingWhatsAppLink,
  bulkBillingWhatsAppLinks,
  markMonthPaid,
};
