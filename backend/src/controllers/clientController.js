const prisma = require('../lib/prisma');

const MAX_PLAUSIBLE_BOTTLES = 1000;

function isValidRate(rate) {
  return !isNaN(parseFloat(rate)) && parseFloat(rate) > 0;
}

async function createClient(req, res) {
  const { name, mobile, email, address, assignedDriverId, tempoNumber, route, ratePerBottle } = req.body;

  if (!name || !mobile || !address || !assignedDriverId || !tempoNumber || !route) {
    return res.status(400).json({ error: 'name, mobile, address, assignedDriverId, tempoNumber, and route are required' });
  }
  if (ratePerBottle !== undefined && !isValidRate(ratePerBottle)) {
    return res.status(400).json({ error: 'ratePerBottle must be a positive number' });
  }

  const driver = await prisma.driver.findUnique({ where: { id: assignedDriverId } });
  if (!driver) return res.status(404).json({ error: 'Assigned driver not found' });
  if (!driver.isActive) return res.status(400).json({ error: 'Assigned driver is inactive' });

  const client = await prisma.client.create({
    data: {
      name, mobile, email, address, assignedDriverId, tempoNumber, route,
      ...(ratePerBottle !== undefined && { ratePerBottle }),
    },
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
    },
  });

  res.status(201).json(client);
}

async function listClients(req, res) {
  const { driverId, route, search } = req.query;

  const where = {
    isActive: true,
    ...(driverId && { assignedDriverId: driverId }),
    ...(route && { route }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { mobile: { contains: search } },
        { address: { contains: search } },
      ],
    }),
  };

  const clients = await prisma.client.findMany({
    where,
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
      _count: { select: { deliveries: true, invoices: true } },
    },
    orderBy: { name: 'asc' },
  });

  res.json(clients);
}

async function getClient(req, res) {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
      deliveries: {
        orderBy: { deliveryDate: 'desc' },
        take: 50,
        include: {
          driver: { include: { user: { select: { name: true } } } },
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
}

async function updateClient(req, res) {
  const { name, mobile, email, address, assignedDriverId, tempoNumber, route, ratePerBottle } = req.body;

  if (ratePerBottle !== undefined && !isValidRate(ratePerBottle)) {
    return res.status(400).json({ error: 'ratePerBottle must be a positive number' });
  }

  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (assignedDriverId && assignedDriverId !== client.assignedDriverId) {
    const driver = await prisma.driver.findUnique({ where: { id: assignedDriverId } });
    if (!driver) return res.status(404).json({ error: 'Assigned driver not found' });
    if (!driver.isActive) return res.status(400).json({ error: 'Assigned driver is inactive' });
  }

  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(mobile && { mobile }),
      ...(email !== undefined && { email }),
      ...(address && { address }),
      ...(assignedDriverId && { assignedDriverId }),
      ...(tempoNumber && { tempoNumber }),
      ...(route && { route }),
      ...(ratePerBottle !== undefined && { ratePerBottle }),
    },
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
    },
  });

  res.json(updated);
}

async function deleteClient(req, res) {
  const clientId = req.params.id;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const hard = req.query.hard === 'true';
  if (!hard) {
    await prisma.client.update({
      where: { id: clientId },
      data: { isActive: false },
    });
    return res.json({ message: 'Client deactivated' });
  }

  const outstandingBalance = Number(client.outstandingBalance);
  if (outstandingBalance > 0) {
    const [deliveryCount, invoiceCount] = await Promise.all([
      prisma.delivery.count({ where: { clientId } }),
      prisma.invoice.count({ where: { clientId } }),
    ]);
    return res.status(409).json({
      error: `This client has ${deliveryCount} deliveries and ₹${outstandingBalance.toFixed(2)} outstanding. Clear the balance before deleting.`,
      deliveryCount,
      invoiceCount,
      outstandingBalance,
    });
  }

  // Balance is clear — cascade delete every record tied to this client in one
  // transaction so a partial failure can never leave orphaned deliveries/invoices.
  await prisma.$transaction([
    prisma.paymentHistory.deleteMany({ where: { clientId } }),
    prisma.invoice.deleteMany({ where: { clientId } }),
    prisma.monthlyBill.deleteMany({ where: { clientId } }),
    prisma.delivery.deleteMany({ where: { clientId } }),
    prisma.client.delete({ where: { id: clientId } }),
  ]);

  res.json({ message: 'Client permanently deleted' });
}

async function getClientPayments(req, res) {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const payments = await prisma.paymentHistory.findMany({
    where: { clientId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json(payments);
}

// ─── DELETE /api/clients/:id/payments/:paymentId  (ADMIN only) ───────────────
// Reverses a recorded payment's effect on the client's outstandingBalance AND
// on whichever invoice(s) it settled — a payment's exact per-invoice FIFO
// breakdown isn't stored, so this un-applies the deleted amount from the
// client's invoices newest-settled-first (paidAt desc, then createdAt desc
// among partials), which is the best-effort mirror of FIFO's oldest-first
// apply order. The balance is always adjusted back up by the full deleted
// amount regardless of how much could be matched to specific invoices.
async function deletePayment(req, res) {
  const { id: clientId, paymentId } = req.params;

  const payment = await prisma.paymentHistory.findUnique({ where: { id: paymentId } });
  if (!payment || payment.clientId !== clientId) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const amountToReverse = Number(payment.amountPaid);

  const candidates = await prisma.invoice.findMany({
    where: { clientId, amountPaid: { gt: 0 } },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  });

  let remaining = amountToReverse;
  const invoiceUpdates = [];
  for (const inv of candidates) {
    if (remaining <= 0) break;
    const currentPaid = Number(inv.amountPaid);
    if (currentPaid <= 0) continue;

    const reduceBy = Math.min(remaining, currentPaid);
    const newAmountPaid = parseFloat((currentPaid - reduceBy).toFixed(2));
    const newIsPaid = newAmountPaid >= Number(inv.totalAmount);

    invoiceUpdates.push(
      prisma.invoice.update({
        where: { id: inv.id },
        data: {
          amountPaid: newAmountPaid,
          isPaid: newIsPaid,
          ...(!newIsPaid && { paidAt: null }),
        },
      }),
    );
    remaining -= reduceBy;
  }

  await prisma.$transaction([
    prisma.client.update({
      where: { id: clientId },
      data: { outstandingBalance: { increment: amountToReverse } },
    }),
    prisma.paymentHistory.delete({ where: { id: paymentId } }),
    ...invoiceUpdates,
  ]);

  res.json({ message: 'Payment entry deleted, balance and invoices reversed' });
}

// ─── POST /api/clients/:clientId/recalculate-balance  (ADMIN only) ───────────
// Safety-net repair endpoint: recomputes outstandingBalance from scratch as
// SUM(totalAmount - amountPaid) across every invoice for this client,
// independent of whatever incremental history led to the current stored
// value. Use after any manual DB correction or a delete sequence that may
// have left the balance out of sync with the invoices themselves.
async function recalculateBalance(req, res) {
  const { clientId } = req.params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const agg = await prisma.invoice.aggregate({
    where: { clientId },
    _sum: { totalAmount: true, amountPaid: true },
  });

  const oldBalance = Number(client.outstandingBalance);
  const newBalance = parseFloat(
    (Number(agg._sum.totalAmount ?? 0) - Number(agg._sum.amountPaid ?? 0)).toFixed(2)
  );

  await prisma.client.update({ where: { id: clientId }, data: { outstandingBalance: newBalance } });

  res.json({ oldBalance, newBalance });
}

// ─── POST /api/clients/:clientId/historical-record  (ADMIN only) ─────────────
// Backdates a delivery + invoice (and optional payment) for data that existed
// before the system went live, so outstanding balances reflect real history.
// Inventory is intentionally untouched — no real stock moved.
async function addHistoricalRecord(req, res) {
  const { clientId } = req.params;
  const { date, bottlesDelivered, ratePerBottle, amountPaid, paymentMethod, note } = req.body;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const bottles = parseInt(bottlesDelivered, 10);
  if (!date || isNaN(bottles) || bottles <= 0) {
    return res.status(400).json({ error: 'date and a positive bottlesDelivered are required' });
  }
  if (bottles > MAX_PLAUSIBLE_BOTTLES) {
    return res.status(400).json({ error: 'Bottle count seems too high, please verify' });
  }
  const rate = ratePerBottle != null ? parseFloat(ratePerBottle) : Number(client.ratePerBottle);
  if (isNaN(rate) || rate <= 0) {
    return res.status(400).json({ error: 'A valid ratePerBottle is required' });
  }
  const paid = amountPaid != null ? parseFloat(amountPaid) : 0;
  if (isNaN(paid) || paid < 0) {
    return res.status(400).json({ error: 'amountPaid must be a non-negative number' });
  }

  const deliveryDate = new Date(date);
  if (deliveryDate.getTime() > Date.now()) {
    return res.status(400).json({ error: 'Date cannot be in the future' });
  }

  const totalAmount = parseFloat((bottles * rate).toFixed(2));
  if (paid > totalAmount) {
    return res.status(400).json({ error: 'Amount paid cannot exceed total' });
  }
  const remaining = parseFloat((totalAmount - paid).toFixed(2));

  const balanceBefore = Number(client.outstandingBalance);
  const balanceAfter = balanceBefore + remaining;

  const invoiceNumber = `HIST-${Date.now()}-${clientId}`;

  // Delivery must exist before the invoice can reference its id, so it's
  // created first in its own transaction, then the invoice + balance +
  // payment history follow in a second.
  const [delivery] = await prisma.$transaction([
    prisma.delivery.create({
      data: {
        clientId,
        driverId: client.assignedDriverId,
        filledBottlesDelivered: bottles,
        emptyBottlesCollected: 0,
        deliveryDate,
        status: 'COMPLETED',
        isHistorical: true,
        notes: note || null,
      },
    }),
  ]);

  const invoiceOps = [
    prisma.invoice.create({
      data: {
        clientId,
        deliveryId: delivery.id,
        invoiceNumber,
        bottlesTakenSinceLastPaid: bottles,
        amountPerBottle: rate,
        totalAmount,
        amountPaid: paid,
        isPaid: remaining <= 0,
        paidAt: remaining <= 0 ? deliveryDate : null,
        paymentMethod: paymentMethod || null,
        isHistorical: true,
        createdAt: deliveryDate,
      },
    }),
    prisma.client.update({
      where: { id: clientId },
      data: { outstandingBalance: balanceAfter },
    }),
  ];

  const [invoice, updatedClient] = await prisma.$transaction(invoiceOps);

  if (paid > 0) {
    await prisma.paymentHistory.create({
      data: {
        clientId,
        invoiceId: invoice.id,
        amountPaid: paid,
        paymentMethod: paymentMethod || 'CASH',
        balanceBefore,
        balanceAfter,
        recordedBy: req.user.loginId ?? req.user.id,
        createdAt: deliveryDate,
        note: `Historical: ${note || 'opening entry'}`,
      },
    });
  }

  res.status(201).json({
    delivery,
    invoice,
    outstandingBalance: updatedClient.outstandingBalance,
  });
}

// ─── GET /api/clients/:clientId/historical-record  (ADMIN only) ──────────────
async function getClientHistoricalRecords(req, res) {
  const { clientId } = req.params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const invoices = await prisma.invoice.findMany({
    where: { clientId, isHistorical: true },
    orderBy: { createdAt: 'desc' },
    include: {
      delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true, notes: true } },
    },
  });

  res.json(invoices);
}

// ─── DELETE /api/clients/:clientId/historical-record/:invoiceId  (ADMIN only) ─
async function deleteHistoricalRecord(req, res) {
  const { clientId, invoiceId } = req.params;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice || invoice.clientId !== clientId || !invoice.isHistorical) {
    return res.status(404).json({ error: 'Historical record not found' });
  }

  const remainingUnpaid = Number(invoice.totalAmount) - Number(invoice.amountPaid);

  await prisma.$transaction([
    prisma.paymentHistory.deleteMany({ where: { clientId, invoiceId: invoice.id } }),
    prisma.invoice.delete({ where: { id: invoiceId } }),
    prisma.delivery.delete({ where: { id: invoice.deliveryId } }),
    prisma.client.update({
      where: { id: clientId },
      data: { outstandingBalance: { decrement: remainingUnpaid } },
    }),
  ]);

  res.json({ message: 'Historical record deleted and balance reversed' });
}

// ─── GET /api/clients/:clientId/summary  (ADMIN only) ─────────────────────────
async function getClientSummary(req, res) {
  const { clientId } = req.params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const [bottlesAgg, invoiceAgg, historicalCount, liveCount] = await Promise.all([
    prisma.delivery.aggregate({
      where: { clientId },
      _sum: { filledBottlesDelivered: true },
    }),
    prisma.invoice.aggregate({
      where: { clientId },
      _sum: { totalAmount: true, amountPaid: true },
    }),
    prisma.delivery.count({ where: { clientId, isHistorical: true } }),
    prisma.delivery.count({ where: { clientId, isHistorical: false } }),
  ]);

  res.json({
    totalBottlesDelivered: bottlesAgg._sum.filledBottlesDelivered ?? 0,
    totalAmountBilled: Number(invoiceAgg._sum.totalAmount ?? 0),
    totalPaid: Number(invoiceAgg._sum.amountPaid ?? 0),
    outstandingBalance: Number(client.outstandingBalance),
    historicalCount,
    liveCount,
  });
}

module.exports = {
  createClient,
  listClients,
  getClient,
  updateClient,
  deleteClient,
  getClientPayments,
  deletePayment,
  addHistoricalRecord,
  getClientHistoricalRecords,
  deleteHistoricalRecord,
  getClientSummary,
  recalculateBalance,
};
