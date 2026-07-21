const prisma = require('../lib/prisma');

// ─── POST /api/invoices/generate  (DRIVER only) ───────────────────────────────
async function generateInvoice(req, res) {
  const { deliveryId, amountPerBottle } = req.body;

  if (!deliveryId) return res.status(400).json({ error: 'deliveryId is required' });
  if (amountPerBottle === undefined || amountPerBottle === null) {
    return res.status(400).json({ error: 'amountPerBottle is required' });
  }
  const rate = parseFloat(amountPerBottle);
  if (isNaN(rate) || rate <= 0) {
    return res.status(400).json({ error: 'amountPerBottle must be a positive number' });
  }

  // Fetch delivery with client + driver
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      client: { select: { id: true, name: true, mobile: true, address: true } },
      driver: { include: { user: { select: { id: true } } } },
    },
  });
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

  // Verify delivery belongs to this driver
  if (delivery.driver.user.id !== req.user.id) {
    return res.status(403).json({ error: 'This delivery does not belong to you' });
  }

  // Return existing invoice if one already exists for this delivery
  const existing = await prisma.invoice.findUnique({
    where: { deliveryId },
    include: {
      client: { select: { id: true, name: true, mobile: true, address: true } },
      delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
    },
  });
  if (existing) return res.json({ ...existing, alreadyExisted: true });

  const clientId = delivery.clientId;

  // Bottles accumulated since last paid invoice
  const lastPaid = await prisma.invoice.findFirst({
    where: { clientId, isPaid: true },
    orderBy: { paidAt: 'desc' },
  });
  const since = lastPaid?.paidAt ?? new Date(0);

  const deliveries = await prisma.delivery.findMany({
    where: { clientId, status: 'COMPLETED', deliveryDate: { gt: since } },
    select: { filledBottlesDelivered: true },
  });

  const bottlesTakenSinceLastPaid = deliveries.reduce((s, d) => s + d.filledBottlesDelivered, 0);
  const totalAmount = parseFloat((bottlesTakenSinceLastPaid * rate).toFixed(2));

  const invoiceNumber = `INV-${Date.now()}-${clientId}`;

  const upiId      = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || '';
  const bizName    = process.env.BUSINESS_NAME || 'AquaERP';
  const paymentQrData = upiId
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(bizName)}&am=${totalAmount}&tn=${invoiceNumber}`
    : '';

  const invoice = await prisma.invoice.create({
    data: {
      clientId,
      deliveryId,
      invoiceNumber,
      bottlesTakenSinceLastPaid,
      amountPerBottle: rate,
      totalAmount,
      paymentQrData,
    },
    include: {
      client: { select: { id: true, name: true, mobile: true, address: true } },
      delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
    },
  });

  res.status(201).json(invoice);
}

// ─── GET /api/invoices/:invoiceId  (any authenticated user) ──────────────────
async function getInvoiceById(req, res) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: {
      client: {
        select: { id: true, name: true, mobile: true, address: true },
      },
      delivery: {
        select: {
          id: true,
          deliveryDate: true,
          filledBottlesDelivered: true,
          emptyBottlesCollected: true,
          driver: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
}

// ─── GET /api/invoices/client/:clientId  (any authenticated user) ─────────────
async function getClientInvoices(req, res) {
  const { clientId } = req.params;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Last paid invoice + outstanding bottles — useful for the driver app pre-fill
  const lastPaid = await prisma.invoice.findFirst({
    where: { clientId, isPaid: true },
    orderBy: { paidAt: 'desc' },
  });
  const since = lastPaid?.paidAt ?? new Date(0);

  const outstandingDeliveries = await prisma.delivery.findMany({
    where: { clientId, status: 'COMPLETED', deliveryDate: { gt: since } },
    select: { filledBottlesDelivered: true },
  });
  const bottlesSinceLastPaid = outstandingDeliveries.reduce((s, d) => s + d.filledBottlesDelivered, 0);

  const lastInvoice = await prisma.invoice.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { amountPerBottle: true },
  });

  const invoices = await prisma.invoice.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      delivery: { select: { deliveryDate: true, filledBottlesDelivered: true } },
    },
  });

  res.json({
    bottlesSinceLastPaid,
    deliveryCount: outstandingDeliveries.length,
    lastPaidAt: lastPaid?.paidAt ?? null,
    suggestedRate: lastInvoice ? Number(lastInvoice.amountPerBottle) : 50,
    invoices,
  });
}

// ─── PUT /api/invoices/:invoiceId/mark-paid  (ADMIN only) ────────────────────
async function markInvoicePaid(req, res) {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.invoiceId } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.isPaid) return res.status(409).json({ error: 'Invoice is already marked as paid' });

  const updated = await prisma.invoice.update({
    where: { id: req.params.invoiceId },
    data: { isPaid: true, paidAt: new Date() },
    include: {
      client: { select: { id: true, name: true, mobile: true } },
    },
  });
  res.json(updated);
}

// ─── GET /api/invoices  (ADMIN only) ─────────────────────────────────────────
async function getAllInvoices(req, res) {
  const { isPaid, clientId, from, to, search } = req.query;
  const page  = Math.max(1, parseInt(req.query.page  ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));
  const skip  = (page - 1) * limit;

  const where = {};

  if (isPaid !== undefined) where.isPaid = isPaid === 'true';
  if (clientId) where.clientId = clientId;

  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { client: { name: { contains: search, mode: 'insensitive' } } },
      { client: { mobile: { contains: search } } },
    ];
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            mobile: true,
            assignedDriver: { select: { user: { select: { name: true } } } },
          },
        },
        delivery: { select: { deliveryDate: true, filledBottlesDelivered: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.invoice.count({ where }),
  ]);

  res.json({
    invoices,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

// ─── GET /api/invoices/stats  (ADMIN only) ───────────────────────────────────
async function getInvoiceStats(req, res) {
  const [total, unpaidAgg] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.aggregate({
      where: { isPaid: false },
      _count: { id: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const unpaid      = unpaidAgg._count.id;
  const paid        = total - unpaid;
  const outstanding = Number(unpaidAgg._sum.totalAmount ?? 0);

  res.json({ total, paid, unpaid, outstanding });
}

module.exports = { generateInvoice, getInvoiceById, getClientInvoices, markInvoicePaid, getAllInvoices, getInvoiceStats };
