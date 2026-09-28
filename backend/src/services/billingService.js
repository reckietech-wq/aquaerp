const prisma = require('../lib/prisma');
const { istMonthStart, currentIstYearMonth, istDayStart, istDayEnd } = require('../lib/dateUtils');

// Live billing aggregation, sourced directly from Invoice + Delivery records
// — no MonthlyBill table involved. This is the single source of truth: paid/
// unpaid/partial status here is always exactly what Invoices/Statement show,
// because it's computed from the same Invoice.amountPaid/isPaid fields.

// Bounds of an IST calendar month, so a delivery made late in the IST
// evening on the last day of the month is still billed into that month.
// `end` is the exclusive start of the next IST month (matches the original
// `lt: end` usage below).
function monthRange(month, year) {
  const start = istMonthStart(year, month);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;
  const end = istMonthStart(nextYear, nextMonth);
  return { start, end };
}

function currentMonthYear() {
  return currentIstYearMonth();
}

// Inclusive [start, end] bounds for a custom "from"/"to" (yyyy-mm-dd) range,
// interpreted as IST calendar days — a delivery made late in the IST evening
// on the "to" day still counts.
function customRange(from, to) {
  return { start: istDayStart(from), end: istDayEnd(to) };
}

// Shared core: one client's billing for an arbitrary [start, end] delivery-
// date window (inclusive of end — callers pass either an exclusive month
// boundary via `lt` semantics or an inclusive day boundary via `lte`, so this
// takes the already-resolved Prisma comparator to stay correct either way).
async function getClientBillingCore(clientId, dateWhere) {
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

  const invoices = await prisma.invoice.findMany({
    where: { clientId, delivery: { deliveryDate: dateWhere } },
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
  };
}

// One client's billing for a calendar month — every invoiced delivery
// (live or historical) whose delivery date falls in that month, as
// individual line items plus month totals. `outstanding` is the client's
// current running balance (Client.outstandingBalance), not scoped to the
// month, per spec — it's the single source of truth for "what they owe now."
async function getClientMonthBilling(clientId, month, year) {
  const { start, end } = monthRange(month, year);
  const billing = await getClientBillingCore(clientId, { gte: start, lt: end });
  if (!billing) return null;
  return { ...billing, month, year };
}

// One client's billing for an arbitrary custom date range (inclusive IST
// days) — same shape as getClientMonthBilling, with `from`/`to` (yyyy-mm-dd)
// instead of `month`/`year`.
async function getClientRangeBilling(clientId, from, to) {
  const { start, end } = customRange(from, to);
  const billing = await getClientBillingCore(clientId, { gte: start, lte: end });
  if (!billing) return null;
  return { ...billing, from, to };
}

// All clients with at least one invoice in that month, aggregated the same
// way as getClientMonthBilling (one row per client).
async function listMonthBilling({ month, year, driverId, search, status }) {
  const { start, end } = monthRange(month, year);
  const clientWhere = buildClientWhere({ driverId, search, dateWhere: { gte: start, lt: end } });

  const matchingClients = await prisma.client.findMany({
    where: clientWhere,
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  let rows = await Promise.all(
    matchingClients.map((c) => getClientMonthBilling(c.id, month, year)),
  );
  rows = rows.filter(Boolean);
  return filterByStatus(rows, status);
}

// All clients with at least one invoice in the custom range, same shape as
// listMonthBilling.
async function listRangeBilling({ from, to, driverId, search, status }) {
  const { start, end } = customRange(from, to);
  const clientWhere = buildClientWhere({ driverId, search, dateWhere: { gte: start, lte: end } });

  const matchingClients = await prisma.client.findMany({
    where: clientWhere,
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  let rows = await Promise.all(
    matchingClients.map((c) => getClientRangeBilling(c.id, from, to)),
  );
  rows = rows.filter(Boolean);
  return filterByStatus(rows, status);
}

function buildClientWhere({ driverId, search, dateWhere }) {
  return {
    isActive: true,
    ...(driverId && { assignedDriverId: driverId }),
    ...(search && {
      OR: [
        { name:   { contains: search } },
        { mobile: { contains: search } },
      ],
    }),
    invoices: { some: { delivery: { deliveryDate: dateWhere } } },
  };
}

function filterByStatus(rows, status) {
  if (status === 'paid')   return rows.filter((r) => r.status === 'PAID');
  if (status === 'unpaid') return rows.filter((r) => r.status === 'UNPAID' || r.status === 'PARTIAL');
  return rows;
}

module.exports = {
  monthRange, currentMonthYear, customRange,
  getClientMonthBilling, listMonthBilling,
  getClientRangeBilling, listRangeBilling,
};
