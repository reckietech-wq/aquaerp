const prisma = require('../lib/prisma');
const { adjustInventory } = require('../services/inventoryService');

const MAX_PLAUSIBLE_BOTTLES = 1000;

async function createDelivery(req, res) {
  const { clientId, filledBottlesDelivered, emptyBottlesCollected, deliveryDate, notes, status } = req.body;

  if (!clientId || filledBottlesDelivered == null || emptyBottlesCollected == null) {
    return res.status(400).json({ error: 'clientId, filledBottlesDelivered, and emptyBottlesCollected are required' });
  }

  const filled = parseInt(filledBottlesDelivered, 10);
  const empty  = parseInt(emptyBottlesCollected,  10);

  if (isNaN(filled) || filled < 0 || isNaN(empty) || empty < 0) {
    return res.status(400).json({ error: 'filledBottlesDelivered and emptyBottlesCollected must be non-negative numbers' });
  }
  if (filled > MAX_PLAUSIBLE_BOTTLES || empty > MAX_PLAUSIBLE_BOTTLES) {
    return res.status(400).json({ error: 'Bottle count seems too high, please verify' });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Resolve driverId: drivers use their own profile, admins use the client's assigned driver
  let driverId;
  if (req.user.role === 'DRIVER') {
    const driverProfile = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driverProfile) return res.status(404).json({ error: 'Driver profile not found' });
    if (!driverProfile.isActive) return res.status(401).json({ error: 'Account deactivated' });
    if (client.assignedDriverId !== driverProfile.id) {
      return res.status(403).json({ error: 'This client is not assigned to you' });
    }
    driverId = driverProfile.id;
  } else {
    driverId = client.assignedDriverId;
  }

  // Check stock BEFORE creating delivery
  if (filled > 0) {
    try {
      // Dry-run check: just read the inventory
      const inv = await prisma.bottleInventory.findUnique({ where: { id: 1 } });
      if (inv && inv.totalFilledBottles < filled) {
        return res.status(400).json({
          error: `Insufficient filled bottles in stock. Available: ${inv.totalFilledBottles}, requested: ${filled}`,
        });
      }
    } catch { /* if no inventory row yet, skip pre-check */ }
  }

  // Delivery creation and the inventory adjustment it triggers are wrapped in
  // one transaction: if stock would go negative, adjustInventory throws,
  // which rolls back the delivery too — a failed stock check can no longer
  // leave a delivery row with no matching inventory movement.
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const d = await tx.delivery.create({
        data: {
          clientId,
          driverId,
          userId:                req.user.id,
          deliveryDate:          deliveryDate ? new Date(deliveryDate) : new Date(),
          filledBottlesDelivered: filled,
          emptyBottlesCollected:  empty,
          status:                status ?? 'COMPLETED',
          notes:                 notes ?? null,
        },
      });

      const inv = await adjustInventory({
        filledChange: -filled,
        emptyChange:  +empty,
        type:         'DELIVERY_OUT',
        referenceId:  d.id,
        note:         `Delivery to ${client.name}`,
        createdBy:    req.user.loginId ?? req.user.id,
        tx,
      });

      return { delivery: d, inventory: inv };
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to record delivery' });
  }

  res.status(201).json({
    delivery: result.delivery,
    inventory: { totalFilled: result.inventory.totalFilledBottles, totalEmpty: result.inventory.totalEmptyBottles },
  });
}

// ─── GET /api/deliveries  (ADMIN only) ────────────────────────────────────────
async function listDeliveries(req, res) {
  const { clientId, driverId, from, to, search } = req.query;
  const page  = Math.max(1, parseInt(req.query.page  ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));
  const skip  = (page - 1) * limit;

  const where = {};
  if (clientId) where.clientId = clientId;
  if (driverId) where.driverId = driverId;
  if (from || to) {
    where.deliveryDate = {};
    if (from) where.deliveryDate.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.deliveryDate.lte = toDate;
    }
  }
  if (search) {
    where.client = {
      OR: [
        { name: { contains: search } },
        { mobile: { contains: search } },
      ],
    };
  }

  const [deliveries, total] = await Promise.all([
    prisma.delivery.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, mobile: true } },
        driver: { include: { user: { select: { name: true } } } },
        invoice: { select: { id: true, invoiceNumber: true, totalAmount: true, isPaid: true, amountPaid: true } },
      },
      orderBy: { deliveryDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.delivery.count({ where }),
  ]);

  res.json({ deliveries, total, page, totalPages: Math.ceil(total / limit) });
}

// ─── PUT /api/deliveries/:id  (ADMIN only) ────────────────────────────────────
// Corrects bottle counts on an existing delivery. If the delivery already has
// an invoice, the invoice's totalAmount is recalculated at its own rate and
// the client's outstandingBalance is adjusted by exactly the difference, so
// invariant (outstandingBalance == sum of unpaid invoice remainders) holds.
// Inventory is reversed for the old counts and reapplied for the new ones.
async function updateDelivery(req, res) {
  const { id } = req.params;
  const { filledBottlesDelivered, emptyBottlesCollected, deliveryDate, notes } = req.body;

  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: { invoice: true, client: { select: { name: true } } },
  });
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

  const newFilled = filledBottlesDelivered != null ? parseInt(filledBottlesDelivered, 10) : delivery.filledBottlesDelivered;
  const newEmpty  = emptyBottlesCollected  != null ? parseInt(emptyBottlesCollected, 10)  : delivery.emptyBottlesCollected;
  if (isNaN(newFilled) || newFilled < 0 || isNaN(newEmpty) || newEmpty < 0) {
    return res.status(400).json({ error: 'filledBottlesDelivered and emptyBottlesCollected must be non-negative numbers' });
  }
  if (newFilled > MAX_PLAUSIBLE_BOTTLES || newEmpty > MAX_PLAUSIBLE_BOTTLES) {
    return res.status(400).json({ error: 'Bottle count seems too high, please verify' });
  }

  const filledDelta = newFilled - delivery.filledBottlesDelivered;
  const emptyDelta  = newEmpty  - delivery.emptyBottlesCollected;

  const operations = [
    prisma.delivery.update({
      where: { id },
      data: {
        filledBottlesDelivered: newFilled,
        emptyBottlesCollected:  newEmpty,
        ...(deliveryDate && { deliveryDate: new Date(deliveryDate) }),
        ...(notes !== undefined && { notes }),
      },
    }),
  ];

  if (delivery.invoice && filledDelta !== 0) {
    const rate = Number(delivery.invoice.amountPerBottle);
    const newTotalAmount = parseFloat((newFilled * rate).toFixed(2));
    const amountDelta = newTotalAmount - Number(delivery.invoice.totalAmount);

    operations.push(
      prisma.invoice.update({
        where: { id: delivery.invoice.id },
        data: {
          bottlesTakenSinceLastPaid: newFilled,
          totalAmount: newTotalAmount,
        },
      }),
      prisma.client.update({
        where: { id: delivery.clientId },
        data: { outstandingBalance: { increment: amountDelta } },
      }),
    );
  }

  await prisma.$transaction(operations);

  // Inventory reversal/reapplication happens outside the main transaction
  // (adjustInventory manages its own), mirroring createDelivery's pattern.
  if (filledDelta !== 0 || emptyDelta !== 0) {
    try {
      await adjustInventory({
        filledChange: -filledDelta,
        emptyChange:  +emptyDelta,
        type:         'MANUAL_ADJUSTMENT',
        referenceId:  id,
        note:         `Correction for delivery to ${delivery.client.name}`,
        createdBy:    req.user.loginId ?? req.user.id,
      });
    } catch (err) {
      console.error('[inventory] adjustment failed after delivery update:', err.message);
    }
  }

  const updated = await prisma.delivery.findUnique({
    where: { id },
    include: { invoice: true },
  });
  res.json(updated);
}

// ─── DELETE /api/deliveries/:id  (ADMIN only) ─────────────────────────────────
// Removes the delivery and its linked invoice (if any), reverses the invoice's
// remaining contribution to outstandingBalance, and reverses the inventory
// adjustment that was applied when the delivery was created.
async function deleteDelivery(req, res) {
  const { id } = req.params;

  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: { invoice: true, client: { select: { name: true } } },
  });
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

  const operations = [];
  if (delivery.invoice) {
    const remainingUnpaid = Number(delivery.invoice.totalAmount) - Number(delivery.invoice.amountPaid);
    operations.push(
      // PaymentHistory.invoiceId has no DB-level FK, so it wouldn't error on
      // its own if left dangling — clean it up explicitly to keep the
      // payment ledger from referencing a deleted invoice.
      prisma.paymentHistory.deleteMany({ where: { invoiceId: delivery.invoice.id } }),
      prisma.invoice.delete({ where: { id: delivery.invoice.id } }),
    );
    if (remainingUnpaid !== 0) {
      operations.push(
        prisma.client.update({
          where: { id: delivery.clientId },
          data: { outstandingBalance: { decrement: remainingUnpaid } },
        }),
      );
    }
  }
  operations.push(prisma.delivery.delete({ where: { id } }));

  await prisma.$transaction(operations);

  try {
    await adjustInventory({
      filledChange: +delivery.filledBottlesDelivered,
      emptyChange:  -delivery.emptyBottlesCollected,
      type:         'MANUAL_ADJUSTMENT',
      referenceId:  id,
      note:         `Reversal for deleted delivery to ${delivery.client.name}`,
      createdBy:    req.user.loginId ?? req.user.id,
    });
  } catch (err) {
    console.error('[inventory] reversal failed after delivery delete:', err.message);
  }

  res.json({ message: 'Delivery deleted' });
}

module.exports = { createDelivery, listDeliveries, updateDelivery, deleteDelivery };
