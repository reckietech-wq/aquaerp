const prisma = require('../lib/prisma');
const { istDayStart, istDayEnd } = require('../lib/dateUtils');
const { ensureCustomer, applyCustomerBalance } = require('../lib/customerBalance');

// PHASE 1 (multi-location): any authenticated driver may act on any client's
// invoices — Client.assignedDriverId is no longer an access restriction here,
// only informational (admin "assigned driver" view/reports). Deliveries still
// attribute to whichever driver actually recorded them.

// ─── POST /api/invoices/generate  (DRIVER only) ───────────────────────────────
async function generateInvoice(req, res) {
  const { deliveryId, amountPerBottle } = req.body;

  if (!deliveryId) return res.status(400).json({ error: 'deliveryId is required' });

  // Fetch delivery with client + driver
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: {
      client: {
        select: {
          id: true, name: true, mobile: true, address: true, ratePerBottle: true,
          outstandingBalance: true, creditBalance: true, customerId: true,
        },
      },
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
      client: { select: { id: true, name: true, mobile: true, address: true, outstandingBalance: true, creditBalance: true } },
      delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
    },
  });
  if (existing) {
    const amountDue = parseFloat((parseFloat(existing.totalAmount) - parseFloat(existing.amountPaid)).toFixed(2));
    return res.json({ ...existing, amountDue, alreadyExisted: true });
  }

  const clientId = delivery.clientId;

  // Customer (not Client) is the balance's source of truth as of phase 2b —
  // ensureCustomer lazily links one if this client somehow still lacks it.
  const customer = await ensureCustomer(delivery.client);

  // Each invoice is scoped to exactly this delivery's own bottles — no
  // summing across other deliveries. Multiple same-day deliveries each get
  // their own independent invoice; the consolidated view lives in
  // getClientStatement.
  const bottlesForThisInvoice = delivery.filledBottlesDelivered;
  const totalAmount = parseFloat((bottlesForThisInvoice * rate).toFixed(2));

  const invoiceNumber = `INV-${Date.now()}-${clientId}`;

  const upiId      = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || '';
  const payeeName  = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';

  // After this invoice's total is added to outstandingBalance, any existing
  // credit balance (from a prior overpayment/advance) is auto-applied against
  // it immediately, down to 0 — so a client who's paid ahead never sees a new
  // delivery show up as newly "owed" while they still have credit sitting idle.
  const outstandingAfterInvoice = parseFloat(customer.outstandingBalance) + totalAmount;
  const creditAvailable = parseFloat(customer.creditBalance);
  const creditApplied = Math.min(creditAvailable, outstandingAfterInvoice);
  const finalOutstanding = parseFloat((outstandingAfterInvoice - creditApplied).toFixed(2));
  const finalCredit = parseFloat((creditAvailable - creditApplied).toFixed(2));

  // The QR must encode the client's GRAND TOTAL DUE (every past unpaid
  // invoice plus this one, net of credit) — not just this invoice's own
  // amount — otherwise a customer scanning it underpays by whatever they
  // already owed before this delivery.
  const paymentQrData = upiId
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${Math.max(finalOutstanding, 0).toFixed(2)}&cu=INR&tn=${invoiceNumber}`
    : '';

  // The portion of creditApplied that actually belongs to THIS invoice (never
  // more than its own totalAmount — any excess credit beyond that is paying
  // down older outstanding balance, not this invoice). This keeps the
  // invoice's own amountPaid/isPaid ledger truthful instead of leaving it
  // permanently "unpaid" while outstandingBalance already reflects the credit
  // — the single source of the double-apply bug: the app was independently
  // re-subtracting the same credit the server had already applied here.
  const amountPaidFromCredit = Math.min(creditApplied, totalAmount);
  const invoiceIsFullyPaid = amountPaidFromCredit >= totalAmount;
  const amountDue = parseFloat((totalAmount - amountPaidFromCredit).toFixed(2));

  // Create the invoice and add its total to the client's running balance in
  // one transaction, so outstandingBalance is always accurate the moment a
  // delivery is billed — payments only ever subtract from it afterward.
  const operations = [
    prisma.invoice.create({
      data: {
        clientId,
        deliveryId,
        invoiceNumber,
        bottlesTakenSinceLastPaid: bottlesForThisInvoice,
        amountPerBottle: rate,
        totalAmount,
        paymentQrData,
        ...(amountPaidFromCredit > 0 && {
          amountPaid: amountPaidFromCredit,
          paymentMethod: 'CREDIT_APPLIED',
          ...(invoiceIsFullyPaid && { isPaid: true, paidAt: new Date() }),
        }),
      },
      include: {
        client: { select: { id: true, name: true, mobile: true, address: true, outstandingBalance: true, creditBalance: true } },
        delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
      },
    }),
    ...applyCustomerBalance(prisma, customer.id, { outstandingBalance: finalOutstanding, creditBalance: finalCredit }),
  ];

  if (creditApplied > 0) {
    operations.push(
      prisma.paymentHistory.create({
        data: {
          clientId,
          customerId: customer.id,
          amountPaid: creditApplied,
          paymentMethod: 'CREDIT_APPLIED',
          balanceBefore: outstandingAfterInvoice,
          balanceAfter: finalOutstanding,
          recordedBy: req.user.loginId ?? req.user.id,
          note: `Auto-applied from credit balance against invoice ${invoiceNumber}`,
        },
      }),
    );
  }

  const [invoice] = await prisma.$transaction(operations);

  // invoice.client was nested-included from the invoice.create() call, which
  // runs BEFORE the client.update() in this same transaction array — so it
  // reflects pre-update balances. Overwrite with the values we just computed
  // (the actual post-update truth) rather than the stale nested read.
  //
  // Authoritative numbers the app needs so it never has to compute credit
  // itself — amountDue is the real cash to collect for THIS invoice, already
  // net of any credit auto-applied above.
  res.status(201).json({
    ...invoice,
    client: { ...invoice.client, outstandingBalance: finalOutstanding, creditBalance: finalCredit },
    creditApplied: amountPaidFromCredit,
    amountDue,
  });
}

// ─── GET /api/invoices/:invoiceId  (any authenticated user) ──────────────────
async function getInvoiceById(req, res) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: {
      client: {
        select: { id: true, name: true, mobile: true, address: true, outstandingBalance: true, creditBalance: true, ratePerBottle: true },
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

// ─── PUT /api/invoices/:invoiceId/mark-paid  (ADMIN or DRIVER) ───────────────
async function markInvoicePaid(req, res) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.invoiceId },
    include: { client: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.isPaid) return res.json({ message: 'Invoice already paid' });

  const paymentMethod = req.body?.paymentMethod || 'CASH';
  const totalAmount = parseFloat(invoice.totalAmount);
  const alreadyPaid = parseFloat(invoice.amountPaid);
  // The invoice's totalAmount was already added to outstandingBalance at
  // creation time, so paying it off only subtracts the remaining unpaid
  // portion — it must never add totalAmount again.
  const remainingUnpaid = totalAmount - alreadyPaid;

  // Customer (not Client) is the balance's source of truth as of phase 2b.
  const customer = await ensureCustomer(invoice.client);
  const balanceBefore = parseFloat(customer.outstandingBalance);

  // Optional caller-supplied amountPaid lets this cover more than exactly
  // what's due (e.g. an admin recording a round-number cash payment) — any
  // amount beyond remainingUnpaid becomes credit instead of ever pushing
  // outstandingBalance negative.
  const bodyAmount = req.body?.amountPaid != null ? parseFloat(req.body.amountPaid) : null;
  const paidNow = bodyAmount != null && !isNaN(bodyAmount) && bodyAmount > 0 ? bodyAmount : remainingUnpaid;
  const appliedToInvoice = Math.max(0, Math.min(paidNow, Math.max(remainingUnpaid, 0)));
  const excess = Math.max(0, paidNow - Math.max(remainingUnpaid, 0));

  const balanceAfter = appliedToInvoice > 0 ? balanceBefore - appliedToInvoice : balanceBefore;
  const creditBefore = parseFloat(customer.creditBalance);
  const creditAfter = creditBefore + excess;

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

  if (appliedToInvoice > 0 || excess > 0) {
    operations.push(
      ...applyCustomerBalance(prisma, customer.id, { outstandingBalance: balanceAfter, creditBalance: creditAfter }),
      prisma.paymentHistory.create({
        data: {
          clientId: invoice.clientId,
          customerId: customer.id,
          invoiceId: invoice.id,
          amountPaid: appliedToInvoice > 0 ? appliedToInvoice : excess,
          paymentMethod,
          balanceBefore,
          balanceAfter,
          recordedBy: req.user.loginId,
          note: excess > 0 ? `Rs.${excess.toFixed(2)} overpayment added to credit balance` : null,
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

  // Customer (not Client) is the balance's source of truth as of phase 2b.
  // outstandingBalance already includes every unpaid invoice's totalAmount
  // (added at invoice-creation time), so a payment only ever subtracts the
  // amount ACTUALLY applied to an invoice — it must never re-add any invoice
  // total, and must never subtract more than the FIFO loop below actually
  // consumes (that was the phantom-credit bug: a resubmitted/late payment
  // with no unpaid invoice left to absorb it used to decrement the balance
  // by the full requested amount anyway).
  const customer = await ensureCustomer(invoice.client);
  const balanceBefore = parseFloat(customer.outstandingBalance);

  // A single payment can cover more than the anchor invoice (e.g. a client
  // clearing several same-day deliveries' invoices at once). Apply the
  // payment across the CUSTOMER's unpaid invoices oldest-first (queried via
  // client.customerId rather than clientId directly, so this is already
  // phase-3-ready for a customer with multiple linked clients — today that
  // set is identical since each customer has exactly one client), starting
  // with the anchor invoice, marking each fully covered invoice paid and
  // leaving any remainder applied as a partial payment on the next one.
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { client: { customerId: customer.id }, isPaid: false },
    orderBy: { createdAt: 'asc' },
  });
  const ordered = [
    invoice,
    ...unpaidInvoices.filter((i) => i.id !== invoice.id),
  ].filter((i) => !i.isPaid || i.id === invoice.id);

  let remaining = amount;
  let actualApplied = 0;
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
    actualApplied += applied;
  }

  // Anything left over after every unpaid invoice is fully covered (amount >
  // total owed, or there were no unpaid invoices to begin with) becomes
  // credit rather than being dropped or pushing outstandingBalance negative.
  const excess = amount - actualApplied;
  const creditBefore = parseFloat(customer.creditBalance);
  const creditAfter = creditBefore + excess;

  if (actualApplied === 0 && excess === 0) {
    // Nothing was applied and there's no excess to credit either (amount was 0).
    return res.json({ message: 'No outstanding invoices to apply payment to' });
  }

  const newBalance = balanceBefore - actualApplied;

  const [updatedCustomer, , payment, ...updatedInvoices] = await prisma.$transaction([
    ...applyCustomerBalance(prisma, customer.id, { outstandingBalance: newBalance, creditBalance: creditAfter }),
    prisma.paymentHistory.create({
      data: {
        clientId: invoice.clientId,
        customerId: customer.id,
        invoiceId: actualApplied > 0 ? invoice.id : null,
        amountPaid: amount,
        paymentMethod,
        balanceBefore,
        balanceAfter: newBalance,
        recordedBy: req.user.loginId,
        note: excess > 0
          ? (actualApplied > 0
              ? `Rs.${excess.toFixed(2)} overpayment added to credit balance`
              : `No unpaid invoices — full amount credited as advance payment`)
          : null,
      },
    }),
    ...invoiceUpdates,
  ]);

  const updatedInvoice = updatedInvoices.find((i) => i.id === invoiceId) ?? updatedInvoices[0];

  res.json({
    invoice: updatedInvoice,
    invoicesUpdated: updatedInvoices,
    client: { outstandingBalance: updatedCustomer.outstandingBalance, creditBalance: updatedCustomer.creditBalance },
    payment,
    message: 'Payment recorded successfully',
  });
}

// ─── GET /api/invoices/client/:clientId/statement  (ADMIN or assigned DRIVER) ─
async function getClientStatement(req, res) {
  const { clientId } = req.params;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, address: true, route: true, ratePerBottle: true, outstandingBalance: true,
      creditBalance: true, bottlesOut: true, totalBottlesDelivered: true, totalBottlesCollected: true,
      customerId: true,
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Customer (not Client) is the balance's source of truth as of phase 2b —
  // the response's `client.outstandingBalance`/`creditBalance` fields are
  // overwritten from it below so the app sees the identical field paths.
  const customer = await ensureCustomer(client);

  // PHASE 3: a customer may have multiple locations (Clients) — the
  // statement is customer-wide, so it's queried by customerId rather than
  // this one clientId, and spans every unpaid invoice across all of the
  // customer's locations, not just the one requested.
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { client: { customerId: customer.id }, isPaid: false },
    orderBy: { createdAt: 'desc' },
    include: {
      delivery: { select: { id: true, deliveryDate: true, filledBottlesDelivered: true } },
      client: { select: { id: true, name: true, address: true } },
    },
  });

  const locationsList = await prisma.client.findMany({
    where: { customerId: customer.id },
    select: { id: true, name: true, address: true, route: true },
    orderBy: { createdAt: 'asc' },
  });

  const { start, end } = { start: istDayStart(), end: istDayEnd() };

  const unpaidDeliveries = unpaidInvoices.map((inv) => ({
    deliveryId: inv.deliveryId,
    invoiceId: inv.id,
    date: inv.delivery.deliveryDate,
    filledBottles: inv.delivery.filledBottlesDelivered,
    rate: Number(inv.amountPerBottle),
    amount: Number(inv.totalAmount),
    isPaid: inv.isPaid,
    amountPaid: Number(inv.amountPaid),
    // Which of the customer's locations this delivery belongs to — only
    // meaningful once a customer has more than one (phase 3).
    locationId: inv.client.id,
    locationName: inv.client.name,
    locationAddress: inv.client.address,
  }));

  const todaysUnpaid = unpaidDeliveries.filter((d) => d.date >= start && d.date <= end);
  const todaysTotal = todaysUnpaid.reduce((s, d) => s + d.amount, 0);
  const totalUnpaid = unpaidDeliveries.reduce((s, d) => s + (d.amount - d.amountPaid), 0);
  const grandTotalDue = Number(customer.outstandingBalance);
  const previousOutstanding = grandTotalDue - todaysTotal;

  const upiId     = process.env.BUSINESS_UPI_ID || process.env.UPI_ID || '';
  const payeeName = process.env.BUSINESS_UPI_NAME || process.env.BUSINESS_NAME || 'Gajanan Aqua';
  const statementQrData = upiId && grandTotalDue > 0
    ? `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${grandTotalDue}&cu=INR&tn=STMT-${clientId}`
    : '';

  res.json({
    client: { ...client, outstandingBalance: customer.outstandingBalance, creditBalance: customer.creditBalance },
    unpaidDeliveries,
    // PHASE 3: per-location breakdown of what's unpaid, within the one
    // combined customer statement above.
    locations: locationsList.map((loc) => {
      const own = unpaidDeliveries.filter((d) => d.locationId === loc.id);
      return {
        clientId: loc.id,
        name: loc.name,
        address: loc.address,
        route: loc.route,
        unpaidCount: own.length,
        unpaidAmount: own.reduce((s, d) => s + (d.amount - d.amountPaid), 0),
      };
    }),
    summary: {
      previousOutstanding,
      todaysTotal,
      totalUnpaid,
      grandTotalDue,
      creditBalance: Number(customer.creditBalance),
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
  const customer = await ensureCustomer(invoice.client);
  const balanceBefore = parseFloat(customer.outstandingBalance);

  if (isPaid && !invoice.isPaid) {
    const remainingUnpaid = totalAmount - amountPaid;
    const balanceAfter = balanceBefore - remainingUnpaid;
    const [updated] = await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { isPaid: true, paidAt: new Date(), amountPaid: totalAmount },
        include: { client: { select: { id: true, name: true, mobile: true, outstandingBalance: true } } },
      }),
      ...applyCustomerBalance(prisma, customer.id, { outstandingBalance: balanceAfter }),
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
      ...applyCustomerBalance(prisma, customer.id, { outstandingBalance: balanceAfter }),
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

  const operations = [
    // PaymentHistory.invoiceId has no DB-level FK, so it wouldn't error on
    // its own if left dangling — clean it up explicitly to keep the payment
    // ledger from referencing a deleted invoice.
    prisma.paymentHistory.deleteMany({ where: { invoiceId } }),
    prisma.invoice.delete({ where: { id: invoiceId } }),
  ];
  if (remainingUnpaid !== 0) {
    const customer = await ensureCustomer(invoice.client);
    operations.push(...applyCustomerBalance(prisma, customer.id, { outstandingBalance: { decrement: remainingUnpaid } }));
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
    if (from) where.createdAt.gte = istDayStart(from);
    if (to) where.createdAt.lte = istDayEnd(to);
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

// ─── GET /api/invoices/by-client  (ADMIN only) ────────────────────────────────
// Consolidated view: one row per client with aggregated invoice totals,
// instead of one row per invoice. outstandingBalance is always read straight
// off the linked Customer (the single source of truth as of phase 2b) —
// never summed from invoices, so it can't drift out of sync or get
// double-counted across rows.
async function getInvoicesByClient(req, res) {
  const { status, from, to, search, clientId } = req.query;
  const page  = Math.max(1, parseInt(req.query.page  ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10)));

  const invoiceWhere = {};
  if (from || to) {
    invoiceWhere.createdAt = {};
    if (from) invoiceWhere.createdAt.gte = istDayStart(from);
    if (to) invoiceWhere.createdAt.lte = istDayEnd(to);
  }

  const clientWhere = {
    ...(clientId && { id: clientId }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { mobile: { contains: search } },
      ],
    }),
    invoices: { some: invoiceWhere },
  };

  const clients = await prisma.client.findMany({
    where: clientWhere,
    include: {
      assignedDriver: { select: { user: { select: { name: true } } } },
      customer: { select: { outstandingBalance: true } },
      invoices: {
        where: invoiceWhere,
        select: {
          id: true,
          totalAmount: true,
          amountPaid: true,
          delivery: { select: { filledBottlesDelivered: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  let rows = clients.map((c) => {
    const invoiceCount = c.invoices.length;
    const totalBottles = c.invoices.reduce((s, i) => s + (i.delivery?.filledBottlesDelivered ?? 0), 0);
    const totalBilled  = c.invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalPaid    = c.invoices.reduce((s, i) => s + Number(i.amountPaid), 0);
    const outstandingBalance = Number(c.customer?.outstandingBalance ?? c.outstandingBalance);

    let rowStatus;
    if (outstandingBalance <= 0) rowStatus = 'PAID';
    else if (totalPaid > 0) rowStatus = 'PARTIAL';
    else rowStatus = 'UNPAID';

    return {
      clientId: c.id,
      clientName: c.name,
      driverName: c.assignedDriver?.user?.name ?? '—',
      invoiceCount,
      totalBottles,
      totalBilled,
      totalPaid,
      outstandingBalance,
      status: rowStatus,
    };
  });

  if (status === 'paid') rows = rows.filter((r) => r.status === 'PAID');
  if (status === 'unpaid') rows = rows.filter((r) => r.status === 'UNPAID' || r.status === 'PARTIAL');

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const skip = (page - 1) * limit;
  const paged = rows.slice(skip, skip + limit);

  res.json({ clients: paged, total, page, totalPages });
}

// ─── GET /api/invoices/stats  (ADMIN only) ───────────────────────────────────
async function getInvoiceStats(req, res) {
  const [total, unpaidAgg, paidAgg, clientsWithInvoices, outstandingAgg] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.aggregate({
      where: { isPaid: false },
      _count: { id: true },
      _sum: { totalAmount: true },
    }),
    prisma.invoice.aggregate({
      _sum: { amountPaid: true },
    }),
    prisma.client.count({ where: { invoices: { some: {} } } }),
    // outstandingBalance lives on Customer (phase 2b) — sum it once per
    // customer linked to a client that actually has invoices, rather than
    // summing unpaid invoice totals, which would double-count nothing here
    // but drift from the authoritative Customer.outstandingBalance ledger.
    prisma.customer.aggregate({
      where: { clients: { some: { invoices: { some: {} } } } },
      _sum: { outstandingBalance: true },
    }),
  ]);

  const unpaid      = unpaidAgg._count.id;
  const paid        = total - unpaid;
  const outstanding = Number(unpaidAgg._sum.totalAmount ?? 0);
  const totalCollected = Number(paidAgg._sum.amountPaid ?? 0);
  const totalOutstanding = Number(outstandingAgg._sum.outstandingBalance ?? 0);

  res.json({
    total,
    paid,
    unpaid,
    outstanding,
    clientsWithInvoices,
    totalOutstanding,
    totalCollected,
  });
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
  getInvoicesByClient,
  getInvoiceStats,
};
