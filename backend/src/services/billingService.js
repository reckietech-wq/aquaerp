const prisma = require('../lib/prisma');

// Live billing aggregation, sourced directly from Invoice + Delivery records
// — no MonthlyBill table involved. This is the single source of truth: paid/
// unpaid/partial status here is always exactly what Invoices/Statement show,
// because it's computed from the same Invoice.amountPaid/isPaid fields.

function monthRange(month, year) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 1); // exclusive upper bound
  return { start, end };
}

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// One client's billing for a calendar month — every invoiced delivery
// (live or historical) whose delivery date falls in [start, end) that month,
// as individual line items plus month totals. `outstanding` is the client's
// current running balance (Client.outstandingBalance), not scoped to the
// month, per spec — it's the single source of truth for "what they owe now."
async function getClientMonthBilling(clientId, month, year) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, address: true, mobile: true, route: true,
      ratePerBottle: true, outstandingBalance: true,
      assignedDriver: {
        select: {
          route: true, vehicleNumber: true, vehicleType: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!client) return null;

  const { start, end } = monthRange(month, year);

  const invoices = await prisma.invoice.findMany({
    where: { clientId, delivery: { deliveryDate: { gte: start, lt: end } } },
    orderBy: { delivery: { deliveryDate: 'asc' } },
    include: { delivery: { select: { deliveryDate: true, filledBottlesDelivered: true } } },
  });

  const deliveries = invoices.map((inv) => ({
    date:           inv.delivery.deliveryDate,
    bottles:        inv.delivery.filledBottlesDelivered,
    rate:           Number(inv.amountPerBottle),
    amount:         Number(inv.totalAmount),
    amountPaid:     Number(inv.amountPaid),
    isPaid:         inv.isPaid,
    paymentMethod:  inv.paymentMethod,
    invoiceNumber:  inv.invoiceNumber,
    invoiceId:      inv.id,
  }));

  const totalBottles = deliveries.reduce((s, d) => s + d.bottles, 0);
  const totalBilled  = deliveries.reduce((s, d) => s + d.amount, 0);
  const totalPaid    = deliveries.reduce((s, d) => s + d.amountPaid, 0);

  let status;
  if (deliveries.length === 0)         status = 'UNPAID';
  else if (totalPaid >= totalBilled)   status = 'PAID';
  else if (totalPaid > 0)              status = 'PARTIAL';
  else                                 status = 'UNPAID';

  return {
    clientId:      client.id,
    clientName:    client.name,
    address:       client.address,
    mobile:        client.mobile,
    route:         client.route,
    driverName:    client.assignedDriver?.user?.name ?? '—',
    driverVehicle: client.assignedDriver?.vehicleNumber ?? null,
    driverRoute:   client.assignedDriver?.route ?? null,
    ratePerBottle: Number(client.ratePerBottle),
    deliveries,
    totalBottles,
    totalBilled,
    totalPaid,
    outstanding: Number(client.outstandingBalance),
    status,
    month,
    year,
  };
}

// All clients with at least one invoice in that month, aggregated the same
// way as getClientMonthBilling (one row per client).
async function listMonthBilling({ month, year, driverId, search, status }) {
  const { start, end } = monthRange(month, year);

  const clientWhere = {
    isActive: true,
    ...(driverId && { assignedDriverId: driverId }),
    ...(search && {
      OR: [
        { name:   { contains: search } },
        { mobile: { contains: search } },
      ],
    }),
    invoices: { some: { delivery: { deliveryDate: { gte: start, lt: end } } } },
  };

  const matchingClients = await prisma.client.findMany({
    where: clientWhere,
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  let rows = await Promise.all(
    matchingClients.map((c) => getClientMonthBilling(c.id, month, year)),
  );
  rows = rows.filter(Boolean);

  if (status === 'paid')   rows = rows.filter((r) => r.status === 'PAID');
  if (status === 'unpaid') rows = rows.filter((r) => r.status === 'UNPAID' || r.status === 'PARTIAL');

  return rows;
}

module.exports = { monthRange, currentMonthYear, getClientMonthBilling, listMonthBilling };
