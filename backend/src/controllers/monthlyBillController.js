const prisma = require('../lib/prisma');

// ─── helpers ──────────────────────────────────────────────────────────────────

function prevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function monthRange(month, year) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 1);       // exclusive upper bound
  return { start, end };
}

// ─── generateMonthlyBills ─────────────────────────────────────────────────────

async function generateMonthlyBills(req, res) {
  let { month, year } = req.body ?? {};

  if (!month || !year) {
    const prev = prevMonth();
    month = prev.month;
    year  = prev.year;
  }

  month = parseInt(month);
  year  = parseInt(year);

  if (month < 1 || month > 12) return res.status(400).json({ error: 'month must be 1–12' });

  const { start, end } = monthRange(month, year);

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, assignedDriverId: true, ratePerBottle: true },
  });

  let generated = 0;
  let skipped   = 0;
  const bills   = [];

  for (const client of clients) {
    const deliveries = await prisma.delivery.findMany({
      where: {
        clientId:     client.id,
        deliveryDate: { gte: start, lt: end },
        status:       'COMPLETED',
      },
      select: { filledBottlesDelivered: true, emptyBottlesCollected: true },
    });

    if (deliveries.length === 0) { skipped++; continue; }

    const totalBottles  = deliveries.reduce((s, d) => s + d.filledBottlesDelivered, 0);
    const totalEmpty    = deliveries.reduce((s, d) => s + d.emptyBottlesCollected,  0);

    // Rate is always sourced from the client's configured rate, falling back
    // to 50 only if the client has no rate set.
    const rate = client.ratePerBottle != null ? parseFloat(client.ratePerBottle) : 50;

    const totalAmount = totalBottles * rate;

    const bill = await prisma.monthlyBill.upsert({
      where:  { clientId_month_year: { clientId: client.id, month, year } },
      create: {
        clientId:              client.id,
        month,
        year,
        totalBottlesDelivered: totalBottles,
        totalEmptyCollected:   totalEmpty,
        ratePerBottle:         rate,
        totalAmount,
        status:                'DRAFT',
      },
      update: {
        totalBottlesDelivered: totalBottles,
        totalEmptyCollected:   totalEmpty,
        ratePerBottle:         rate,
        totalAmount,
      },
      include: { client: { select: { id: true, name: true, mobile: true } } },
    });

    bills.push(bill);
    generated++;
  }

  res.json({ month, year, generated, skipped, bills });
}

// ─── getMonthlyBills ──────────────────────────────────────────────────────────

async function getMonthlyBills(req, res) {
  const { month, year, status, driverId, search } = req.query;

  const where = {};
  if (month)  where.month  = parseInt(month);
  if (year)   where.year   = parseInt(year);
  if (status) where.status = status;

  if (driverId) {
    where.client = { assignedDriverId: driverId };
  }
  if (search) {
    where.client = {
      ...where.client,
      OR: [
        { name:   { contains: search } },
        { mobile: { contains: search } },
      ],
    };
  }

  const bills = await prisma.monthlyBill.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { client: { name: 'asc' } }],
    include: {
      client: {
        select: {
          id:             true,
          name:           true,
          mobile:         true,
          address:        true,
          route:          true,
          assignedDriver: {
            select: { id: true, route: true, user: { select: { name: true } } },
          },
        },
      },
    },
  });

  const totalAmount = bills.reduce((s, b) => s + parseFloat(b.totalAmount), 0);
  const sentCount   = bills.filter(b => b.status === 'SENT').length;
  const paidCount   = bills.filter(b => b.status === 'PAID').length;

  res.json({
    stats: {
      totalClients: bills.length,
      totalAmount,
      sentCount,
      paidCount,
    },
    bills,
  });
}

// ─── getSingleBill ────────────────────────────────────────────────────────────

async function getSingleBill(req, res) {
  const { id } = req.params;

  const bill = await prisma.monthlyBill.findUnique({
    where:   { id },
    include: {
      client: {
        select: {
          id:             true,
          name:           true,
          mobile:         true,
          address:        true,
          route:          true,
          tempoNumber:    true,
          assignedDriver: {
            select: {
              id: true, route: true, vehicleNumber: true, vehicleType: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const { start, end } = monthRange(bill.month, bill.year);
  const deliveries = await prisma.delivery.findMany({
    where: {
      clientId:     bill.clientId,
      deliveryDate: { gte: start, lt: end },
      status:       'COMPLETED',
    },
    orderBy: { deliveryDate: 'asc' },
    select: {
      id:                    true,
      deliveryDate:          true,
      filledBottlesDelivered: true,
      emptyBottlesCollected:  true,
    },
  });

  const invoiceNumber = `BILL-${bill.year}-${String(bill.month).padStart(2, '0')}-${bill.clientId.slice(-6).toUpperCase()}`;
  const upiId    = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || '';
  const bizName  = process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const paymentQrData = upiId
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(bizName)}&am=${bill.totalAmount}&tn=${invoiceNumber}`
    : '';

  res.json({ ...bill, deliveries, invoiceNumber, paymentQrData });
}

// ─── markAsSent ───────────────────────────────────────────────────────────────

async function markAsSent(req, res) {
  const { id } = req.params;
  const bill = await prisma.monthlyBill.update({
    where:  { id },
    data:   { status: 'SENT', whatsappSentAt: new Date() },
    include: { client: { select: { id: true, name: true, mobile: true } } },
  });
  res.json(bill);
}

// ─── markAsPaid ───────────────────────────────────────────────────────────────

async function markAsPaid(req, res) {
  const { id } = req.params;
  const bill = await prisma.monthlyBill.update({
    where:  { id },
    data:   { status: 'PAID', paidAt: new Date() },
    include: { client: { select: { id: true, name: true, mobile: true } } },
  });
  res.json(bill);
}

// ─── bulkMarkSent ─────────────────────────────────────────────────────────────

async function bulkMarkSent(req, res) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }

  const result = await prisma.monthlyBill.updateMany({
    where: { id: { in: ids }, status: { not: 'PAID' } },
    data:  { status: 'SENT', whatsappSentAt: new Date() },
  });

  res.json({ updated: result.count });
}

module.exports = {
  generateMonthlyBills,
  getMonthlyBills,
  getSingleBill,
  markAsSent,
  markAsPaid,
  bulkMarkSent,
};
