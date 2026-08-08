const prisma = require('../lib/prisma');

// Returns true if the requesting user is allowed to act on the given client's
// invoices — admins always pass; drivers must be that client's assigned driver.
async function canAccessClient(req, clientId) {
  if (req.user.role !== 'DRIVER') return true;
  const driverProfile = await prisma.driver.findUnique({ where: { userId: req.user.id } });
  if (!driverProfile || !driverProfile.isActive) return false;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { assignedDriverId: true } });
  return !!client && client.assignedDriverId === driverProfile.id;
}

// ─── POST /api/invoices/generate  (DRIVER only) ───────────────────────────────
async function generateInvoice(req, res) {
  const { deliveryId, amountPerBottle } = req.body;

  if (!deliveryId) return res.status(400).json({ error: 'deliveryId is required' });

  // Fetch delivery with client + driver
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      client: { select: { id: true, name: true, mobile: true, address: true, ratePerBottle: true } },
      driver: { include: { user: { select: { id: true } } } },
    },
  });
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

  // Rate is always sourced from the client's configured rate — never trust the
  // request body, which just carries a suggestion for display purposes.
  const clientRate = delivery.client.ratePerBottle != null ? parseFloat(delivery.client.ratePerBottle) : null;
  const bodyRate = amountPerBottle !== undefined && amountPerBottle !== null ? parseFloat(amountPerBottle) : null;
  const rate = clientRate ?? bodyRate ?? 50;
  if (isNaN(rate) || rate <= 0) {
    return res.status(400).json({ error: 'Client has no valid rate per bottle configured' });
  }

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

  // Each invoice is scoped to exactly this delivery's own bottles — no
  // summing across other deliveries. Multiple same-day deliveries each get
  // their own independent invoice; the consolidated view lives in
  // getClientStatement.
  const bottlesForThisInvoice = delivery.filledBottlesDelivered;
  const totalAmount = parseFloat((bottlesForThisInvoice * rate).toFixed(2));

  const invoiceNumber = `INV-${Date.now()}-${clientId}`;

  const upiId      = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || '';
  const payeeName  = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const paymentQrData = upiId
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${totalAmount}&cu=INR&tn=${invoiceNumber}`
    : '';

  // Create the invoice and add its total to the client's running balance in
  // one transaction, so outstandingBalance is always accurate the moment a
  // delivery is billed — payments only ever subtract from it afterward.
  const [invoice] = await prisma.$transaction([
    prisma.invoice.create({
      data: {
        clientId,
        deliveryId,
        invoiceNumber,
        bottlesTakenSinceLastPaid: bottlesForThisInvoice,
        amountPerBottle: rate,
        totalAmount,
        paymentQrData,
      },
      include: {
        client: { select: { id: true, name: true, mobile: true, address: true } },
        delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
      },
    }),
    prisma.client.update({
      where: { id: clientId },
      data: { outstandingBalance: { increment: totalAmount } },
    }),
  ]);

  res.status(201).json(invoice);
}

// ─── GET /api/invoices/:invoiceId  (any authenticated user) ──────────────────
async function getInvoiceById(req, res) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: {
      client: {
        select: { id: true, name: true, mobile: true, address: true, outstandingBalance: true, ratePerBottle: true },
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
  if (!(await canAccessClient(req, invoice.clientId))) {
    return res.status(403).json({ error: 'Not authorized for this client' });
  }
  res.json(invoice);
}

// ─── GET /api/invoices/client/:clientId  (any authenticated user) ─────────────
async function getClientInvoices(req, res) {
  const { clientId } = req.params;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!(await canAccessClient(req, clientId))) {
    return res.status(403).json({ error: 'Not authorized for this client' });
  }

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

// ─── PUT /api/invoices/:invoiceId/mark-paid  (ADMIN or DRIVER) ───────────────
async function markInvoicePaid(req, res) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: { client: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (!(await canAccessClient(req, invoice.clientId))) {
    return res.status(403).json({ error: 'Not authorized for this client' });
  }
  if (invoice.isPaid) return res.json({ message: 'Invoice already paid' });

  const paymentMethod = req.body?.paymentMethod || 'CASH';
  const totalAmount = parseFloat(invoice.totalAmount);
  const alreadyPaid = parseFloat(invoice.amountPaid);
  // The invoice's totalAmount was already added to outstandingBalance at
  // creation time, so paying it off only subtracts the remaining unpaid
  // portion — it must never add totalAmount again.
  const remainingUnpaid = totalAmount - alreadyPaid;
  const balanceBefore = parseFloat(invoice.client.outstandingBalance);
  const balanceAfter = remainingUnpaid > 0 ? balanceBefore - remainingUnpaid : balanceBefore;

  const operations = [
    prisma.invoice.update({
      where: { id: req.params.invoiceId },
      data: {
        isPaid: true,
        paidAt: new Date(),
        amountPaid: totalAmount,
        paymentMethod,
      },
      include: {
        client: { select: { id: true, name: true, mobile: true } },
      },
    }),
  ];

  if (remainingUnpaid > 0) {
    operations.push(
      prisma.client.update({
        where: { id: invoice.clientId },
        data: { outstandingBalance: balanceAfter },
      }),
      prisma.paymentHistory.create({
        data: {
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          amountPaid: remainingUnpaid,
          paymentMethod,
          balanceBefore,
          balanceAfter,
          recordedBy: req.user.loginId,
        },
      }),
    );
  }

  const [updated] = await prisma.$transaction(operations);

  res.json(updated);
}

// ─── PUT /api/invoices/:invoiceId/record-payment  (ADMIN or DRIVER) ──────────
async function recordPayment(req, res) {
  const { invoiceId } = req.params;
  const { amountPaid, paymentMethod } = req.body;

  if (amountPaid === undefined || amountPaid === null) {
    return res.status(400).json({ error: 'amountPaid is required' });
  }
  const amount = parseFloat(amountPaid);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amountPaid must be a positive number' });
  }
  if (!paymentMethod) {
    return res.status(400).json({ error: 'paymentMethod is required' });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (!(await canAccessClient(req, invoice.clientId))) {
    return res.status(403).json({ error: 'Not authorized for this client' });
  }

  // outstandingBalance already includes every unpaid invoice's totalAmount
  // (added at invoice-creation time), so a payment only ever subtracts the
  // amount actually paid — it must never re-add any invoice total.
  const balanceBefore = parseFloat(invoice.client.outstandingBalance);
  const newBalance = balanceBefore - amount;

  // A single payment can cover more than the anchor invoice (e.g. a client
  // clearing several same-day deliveries' invoices at once). Apply the
  // payment across that client's unpaid invoices oldest-first, starting
  // with the anchor invoice, marking each fully covered invoice paid and
  // leaving any remainder applied as a partial payment on the next one.
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { clientId: invoice.clientId, isPaid: false },
    orderBy: { createdAt: 'asc' },
  });
  const ordered = [
    invoice,
    ...unpaidInvoices.filter((i) => i.id !== invoice.id),
  ].filter((i) => !i.isPaid || i.id === invoice.id);

  let remaining = amount;
  const invoiceUpdates = [];
  for (const inv of ordered) {
    if (remaining <= 0) break;
    const invTotal = parseFloat(inv.totalAmount);
    const invAlreadyPaid = parseFloat(inv.amountPaid);
    const invRemaining = invTotal - invAlreadyPaid;
    if (invRemaining <= 0) continue;

    const applied = Math.min(remaining, invRemaining);
    const newInvAmountPaid = invAlreadyPaid + applied;
    const isFullyPaid = newInvAmountPaid >= invTotal;

    invoiceUpdates.push(
      prisma.invoice.update({
        where: { id: inv.id },
        data: {
          amountPaid: newInvAmountPaid,
          paymentMethod,
          ...(isFullyPaid && { isPaid: true, paidAt: new Date() }),
        },
        include: { client: { select: { id: true, name: true, mobile: true } } },
      }),
    );
    remaining -= applied;
  }

  const [updatedClient, payment, ...updatedInvoices] = await prisma.$transaction([
    prisma.client.update({
      where: { id: invoice.clientId },
      data: { outstandingBalance: newBalance },
    }),
    prisma.paymentHistory.create({
      data: {
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        amountPaid: amount,
        paymentMethod,
        balanceBefore,
        balanceAfter: newBalance,
        recordedBy: req.user.loginId,
      },
    }),
    ...invoiceUpdates,
  ]);

  const updatedInvoice = updatedInvoices.find((i) => i.id === invoiceId) ?? updatedInvoices[0];

  res.json({
    invoice: updatedInvoice,
    invoicesUpdated: updatedInvoices,
    client: { outstandingBalance: updatedClient.outstandingBalance },
    payment,
    message: 'Payment recorded successfully',
  });
}

// ─── GET /api/invoices/client/:clientId/statement  (ADMIN or assigned DRIVER) ─
async function getClientStatement(req, res) {
  const { clientId } = req.params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, address: true, route: true, ratePerBottle: true, outstandingBalance: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!(await canAccessClient(req, clientId))) {
    return res.status(403).json({ error: 'Not authorized for this client' });
  }

  const unpaidInvoices = await prisma.invoice.findMany({
    where: { clientId, isPaid: false },
    orderBy: { createdAt: 'desc' },
    include: {
      delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
    },
  });

  const { start, end } = (() => {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    const e = new Date();
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  })();

  const unpaidDeliveries = unpaidInvoices.map((inv) => ({
    deliveryId: inv.deliveryId,
    invoiceId: inv.id,
    date: inv.delivery.deliveryDate,
    filledBottles: inv.delivery.filledBottlesDelivered,
    rate: Number(inv.amountPerBottle),
    amount: Number(inv.totalAmount),
    isPaid: inv.isPaid,
    amountPaid: Number(inv.amountPaid),
  }));

  const todaysUnpaid = unpaidDeliveries.filter((d) => d.date >= start && d.date <= end);
  const todaysTotal = todaysUnpaid.reduce((s, d) => s + d.amount, 0);
  const totalUnpaid = unpaidDeliveries.reduce((s, d) => s + (d.amount - d.amountPaid), 0);
  const grandTotalDue = Number(client.outstandingBalance);
  const previousOutstanding = grandTotalDue - todaysTotal;

  const upiId     = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || '';
  const payeeName = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const statementQrData = upiId && grandTotalDue > 0
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${grandTotalDue}&cu=INR&tn=STMT-${clientId}`
    : '';

  res.json({
    client,
    unpaidDeliveries,
    summary: {
      previousOutstanding,
      todaysTotal,
      totalUnpaid,
      grandTotalDue,
      statementQrData,
    },
  });
}

// ─── PUT /api/invoices/:invoiceId/status  (ADMIN only) ───────────────────────
// Manually corrects an invoice's paid/unpaid state, independent of the normal
// payment flow. Marking paid behaves like markInvoicePaid (subtracts the
// remaining unpaid amount from outstandingBalance). Marking unpaid resets
// amountPaid to 0 and adds the full totalAmount back — a deliberate "undo"
// for correcting mistakes, not a partial-payment operation.
async function setInvoiceStatus(req, res) {
  const { invoiceId } = req.params;
  const { isPaid } = req.body;
  if (typeof isPaid !== 'boolean') {
    return res.status(400).json({ error: 'isPaid (boolean) is required' });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const totalAmount = parseFloat(invoice.totalAmount);
  const amountPaid  = parseFloat(invoice.amountPaid);
  const balanceBefore = parseFloat(invoice.client.outstandingBalance);

  if (isPaid && !invoice.isPaid) {
    const remainingUnpaid = totalAmount - amountPaid;
    const balanceAfter = balanceBefore - remainingUnpaid;
    const [updated] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { isPaid: true, paidAt: new Date(), amountPaid: totalAmount },
        include: { client: { select: { id: true, name: true, mobile: true, outstandingBalance: true } } },
      }),
      prisma.client.update({ where: { id: invoice.clientId }, data: { outstandingBalance: balanceAfter } }),
    ]);
    return res.json(updated);
  }

  if (!isPaid && invoice.isPaid) {
    const balanceAfter = balanceBefore + totalAmount;
    const [updated] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { isPaid: false, paidAt: null, amountPaid: 0 },
        include: { client: { select: { id: true, name: true, mobile: true, outstandingBalance: true } } },
      }),
      prisma.client.update({ where: { id: invoice.clientId }, data: { outstandingBalance: balanceAfter } }),
    ]);
    return res.json(updated);
  }

  // No-op: already in the requested state.
  res.json(invoice);
}

// ─── DELETE /api/invoices/:invoiceId  (ADMIN only) ───────────────────────────
// Reverses this invoice's remaining unpaid contribution to outstandingBalance
// and deletes it. The underlying delivery record is kept — only the invoice
// (billing document) is removed.
async function deleteInvoice(req, res) {
  const { invoiceId } = req.params;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const remainingUnpaid = parseFloat(invoice.totalAmount) - parseFloat(invoice.amountPaid);

  const operations = [prisma.invoice.delete({ where: { id: invoiceId } })];
  if (remainingUnpaid !== 0) {
    operations.push(
      prisma.client.update({
        where: { id: invoice.clientId },
        data: { outstandingBalance: { decrement: remainingUnpaid } },
      }),
    );
  }

  await prisma.$transaction(operations);
  res.json({ message: 'Invoice deleted' });
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
      { invoiceNumber: { contains: search } },
      { client: { name: { contains: search } } },
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
            outstandingBalance: true,
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

module.exports = {
  generateInvoice,
  getInvoiceById,
  getClientInvoices,
  getClientStatement,
  markInvoicePaid,
  recordPayment,
  setInvoiceStatus,
  deleteInvoice,
  getAllInvoices,
  getInvoiceStats,
};
