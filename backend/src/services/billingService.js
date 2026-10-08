const dayjs = require('dayjs');
const prisma = require('../lib/prisma');
const { IST, istMonthStart, currentIstYearMonth, istDayStart, istDayEnd } = require('../lib/dateUtils');

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

// Shared core: billing for an arbitrary [start, end] delivery-date window
// (inclusive of end — callers pass either an exclusive month boundary via
// `lt` semantics or an inclusive day boundary via `lte`, so this takes the
// already-resolved Prisma comparator to stay correct either way).
//
// PHASE 3: a customer may have multiple locations (Clients) sharing one
// balance — this is called with ONE location's clientId (whichever the
// caller was browsing), but the billing itself spans every location under
// that same customer, since invoices/outstanding are customer-wide as of
// phase 2b. `deliveries` carries a locationId/locationName per line so a
// single-location customer renders identically to before, while a
// multi-location one shows every location's deliveries combined.
async function getClientBillingCore(clientId, dateWhere) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, address: true, mobile: true, route: true,
      ratePerBottle: true, outstandingBalance: true, customerId: true,
      customer: { select: { outstandingBalance: true } },
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
    where: {
      client: client.customerId ? { customerId: client.customerId } : { id: clientId },
      delivery: { deliveryDate: dateWhere },
    },
    orderBy: { delivery: { deliveryDate: 'asc' } },
    include: {
      delivery: { select: { deliveryDate: true, filledBottlesDelivered: true } },
      client: { select: { id: true, name: true } },
    },
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
    locationId:     inv.client.id,
    locationName:   inv.client.name,
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
    customerId:    client.customerId,
    deliveries,
    totalBottles,
    totalBilled,
    totalPaid,
    // PHASE 2b: Customer is the balance's source of truth; fall back to the
    // mirrored Client column only if this client somehow still lacks one.
    outstanding: Number(client.customer?.outstandingBalance ?? client.outstandingBalance),
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
// way as getClientMonthBilling (one row per client) — PHASE 3: deduped by
// customerId afterward, since getClientBillingCore now returns the full
// combined-customer total for every location row; without dedup a
// multi-location customer would show the same combined total once per
// location, which reads as duplicated rows rather than one customer.
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
  rows = dedupeByCustomer(rows.filter(Boolean));
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
  rows = dedupeByCustomer(rows.filter(Boolean));
  return filterByStatus(rows, status);
}

// Keeps the first row per customerId (locations are already orderBy name:
// 'asc', so this is deterministic) — a client with no customerId (shouldn't
// happen post phase-2a/2b, but defensively) is never deduped against anything.
function dedupeByCustomer(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (!r.customerId) return true;
    if (seen.has(r.customerId)) return false;
    seen.add(r.customerId);
    return true;
  });
}

// One row per IST calendar month touched by [from, to] (inclusive) that
// actually has deliveries — used by the monthly-summary invoice PDF. Months
// with zero deliveries are omitted entirely rather than shown as a zero row.
async function getClientMonthlySummary(clientId, from, to) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true, name: true, address: true, mobile: true, route: true,
      ratePerBottle: true, outstandingBalance: true, customerId: true,
      customer: { select: { outstandingBalance: true } },
      assignedDriver: {
        select: {
          route: true, vehicleNumber: true, vehicleType: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!client) return null;

  // PHASE 3: spans every location under the same customer, same as
  // getClientBillingCore above.
  const invoiceClientWhere = client.customerId ? { customerId: client.customerId } : { id: clientId };

  const fromIst = dayjs.tz(from, IST);
  const toIst   = dayjs.tz(to, IST);

  let cy = fromIst.year(), cm = fromIst.month() + 1;
  const ey = toIst.year(), em = toIst.month() + 1;

  const months = [];
  while (cy < ey || (cy === ey && cm <= em)) {
    const { start, end } = monthRange(cm, cy);
    const invoices = await prisma.invoice.findMany({
      where: { client: invoiceClientWhere, delivery: { deliveryDate: { gte: start, lt: end } } },
      include: { delivery: { select: { filledBottlesDelivered: true } } },
    });
    if (invoices.length > 0) {
      months.push({
        year: cy,
        month: cm,
        spanStart: start,
        spanEnd: new Date(end.getTime() - 1),
        bottles: invoices.reduce((s, i) => s + i.delivery.filledBottlesDelivered, 0),
        bill: invoices.reduce((s, i) => s + Number(i.totalAmount), 0),
      });
    }
    cm += 1;
    if (cm > 12) { cm = 1; cy += 1; }
  }

  const totalBill = parseFloat(months.reduce((s, m) => s + m.bill, 0).toFixed(2));

  return {
    clientId:      client.id,
    clientName:    client.name,
    address:       client.address,
    mobile:        client.mobile,
    route:         client.route,
    driverName:    client.assignedDriver?.user?.name ?? '—',
    driverVehicle: client.assignedDriver?.vehicleNumber ?? null,
    ratePerBottle: Number(client.ratePerBottle),
    months,
    totalBill,
    outstanding: Number(client.customer?.outstandingBalance ?? client.outstandingBalance),
    from,
    to,
  };
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
  getClientMonthlySummary,
};
