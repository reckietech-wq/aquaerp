const prisma = require('../lib/prisma');

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseRange(query) {
  const now = new Date();

  if (query.from && query.to) {
    return {
      start: new Date(query.from + 'T00:00:00.000Z'),
      end:   new Date(query.to   + 'T23:59:59.999Z'),
    };
  }

  // Default: current calendar month
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

// ─── getSummary ───────────────────────────────────────────────────────────────

async function getSummary(req, res) {
  const { start, end } = parseRange(req.query);

  const deliveryWhere = { deliveryDate: { gte: start, lte: end }, status: 'COMPLETED' };
  const invoiceWhere  = { createdAt:    { gte: start, lte: end } };

  // ── Top-level stats ──────────────────────────────────────────────────────
  // "Collected" is SUM(amountPaid) across every invoice in the period, not
  // SUM(totalAmount) restricted to isPaid:true — the latter silently drops
  // partially-paid invoices' collected amount entirely (undercounting cash
  // actually taken) and double-counts their full total as "outstanding".
  // paidInvoiceCount (a count, not a money figure) still legitimately means
  // "invoices fully closed" and is fetched separately.
  const [totalDeliveries, bottleAgg, revenueAgg, paidInvoiceCount, clientCount] =
    await Promise.all([
      prisma.delivery.count({ where: deliveryWhere }),
      prisma.delivery.aggregate({
        where: deliveryWhere,
        _sum: { filledBottlesDelivered: true, emptyBottlesCollected: true },
      }),
      prisma.invoice.aggregate({
        where: invoiceWhere,
        _sum: { totalAmount: true, amountPaid: true },
        _count: { id: true },
      }),
      prisma.invoice.count({ where: { ...invoiceWhere, isPaid: true } }),
      prisma.delivery.findMany({
        where: deliveryWhere,
        select: { clientId: true },
        distinct: ['clientId'],
      }).then(r => r.length),
    ]);

  const totalBottles  = bottleAgg._sum.filledBottlesDelivered ?? 0;
  const totalRevenue  = parseFloat(revenueAgg._sum.totalAmount  ?? 0);
  const paidRevenue   = parseFloat(revenueAgg._sum.amountPaid   ?? 0);
  const totalInvoices = revenueAgg._count.id;
  const paidInvoices  = paidInvoiceCount;

  // ── Driver breakdown ─────────────────────────────────────────────────────
  // Group deliveries by driverId
  const driverDeliveries = await prisma.delivery.groupBy({
    by:    ['driverId'],
    where: deliveryWhere,
    _sum:  { filledBottlesDelivered: true, emptyBottlesCollected: true },
    _count: { id: true },
  });

  // Fetch driver details for the IDs we got
  const driverIds = driverDeliveries.map(d => d.driverId);
  const drivers = await prisma.driver.findMany({
    where:  { id: { in: driverIds } },
    select: {
      id:    true,
      route: true,
      user:  { select: { name: true } },
      clients: {
        where:  { isActive: true },
        select: { id: true },
      },
    },
  });
  const driverMap = Object.fromEntries(drivers.map(d => [d.id, d]));

  // Fetch paid/total invoice amounts per driver
  const driverInvoices = await prisma.invoice.groupBy({
    by:    ['clientId'],
    where: invoiceWhere,
    _sum:  { totalAmount: true },
  });
  // map clientId → driver via Client table
  const clientDriverMap = await prisma.client.findMany({
    where:  { id: { in: driverInvoices.map(i => i.clientId) } },
    select: { id: true, assignedDriverId: true },
  }).then(rows => Object.fromEntries(rows.map(r => [r.id, r.assignedDriverId])));

  // Aggregate revenue per driver
  const driverRevMap = {};
  for (const inv of driverInvoices) {
    const dId = clientDriverMap[inv.clientId];
    if (!dId) continue;
    driverRevMap[dId] = (driverRevMap[dId] ?? 0) + parseFloat(inv._sum.totalAmount ?? 0);
  }

  const driverBreakdown = driverDeliveries
    .map(row => {
      const info    = driverMap[row.driverId];
      const bottles = row._sum.filledBottlesDelivered ?? 0;
      const revenue = driverRevMap[row.driverId]       ?? 0;
      return {
        driverId:         row.driverId,
        driverName:       info?.user?.name ?? 'Unknown',
        route:            info?.route      ?? '—',
        totalClients:     info?.clients?.length ?? 0,
        deliveryCount:    row._count.id,
        bottlesDelivered: bottles,
        revenue,
        collectionRate:   totalBottles > 0 ? Math.round((bottles / totalBottles) * 100) : 0,
      };
    })
    .sort((a, b) => b.bottlesDelivered - a.bottlesDelivered);

  // Most active driver (by bottles)
  const mostActiveDriver = driverBreakdown[0] ?? null;

  // ── Client breakdown ─────────────────────────────────────────────────────
  const clientDeliveries = await prisma.delivery.groupBy({
    by:    ['clientId'],
    where: deliveryWhere,
    _sum:  { filledBottlesDelivered: true },
    _count: { id: true },
  });

  const clientIds = clientDeliveries.map(c => c.clientId);
  const clientInfos = await prisma.client.findMany({
    where:  { id: { in: clientIds } },
    select: {
      id:             true,
      name:           true,
      route:          true,
      assignedDriver: { select: { route: true, user: { select: { name: true } } } },
    },
  });
  const clientMap = Object.fromEntries(clientInfos.map(c => [c.id, c]));

  // Invoice totals per client in period. "Paid" is SUM(amountPaid) across ALL
  // of that client's invoices in the period (captures partial payments) —
  // paidCount (a count of fully-closed invoices) is fetched separately since
  // it's a genuinely different, isPaid-based metric.
  const clientInvoices = await prisma.invoice.groupBy({
    by:    ['clientId'],
    where: invoiceWhere,
    _sum:  { totalAmount: true, amountPaid: true },
    _count: { id: true },
  });
  const clientPaidInvoices = await prisma.invoice.groupBy({
    by:    ['clientId'],
    where: { ...invoiceWhere, isPaid: true },
    _count: { id: true },
  });
  const clientInvMap     = Object.fromEntries(clientInvoices.map(r => [r.clientId, r]));
  const clientPaidInvMap = Object.fromEntries(clientPaidInvoices.map(r => [r.clientId, r]));

  const clientBreakdown = clientDeliveries
    .map(row => {
      const info         = clientMap[row.clientId];
      const invTotal     = parseFloat(clientInvMap[row.clientId]?._sum?.totalAmount ?? 0);
      const paidTotal    = parseFloat(clientInvMap[row.clientId]?._sum?.amountPaid  ?? 0);
      const invCount     = clientInvMap[row.clientId]?._count?.id     ?? 0;
      const paidCount    = clientPaidInvMap[row.clientId]?._count?.id ?? 0;
      const outstanding  = invTotal - paidTotal;
      return {
        clientId:      row.clientId,
        clientName:    info?.name ?? 'Unknown',
        route:         info?.route ?? '—',
        driverName:    info?.assignedDriver?.user?.name ?? '—',
        deliveryCount: row._count.id,
        totalBottles:  row._sum.filledBottlesDelivered ?? 0,
        totalBilled:   invTotal,
        totalPaid:     paidTotal,
        outstanding,
        invoiceCount:  invCount,
        paidCount,
        hasUnpaid:     outstanding > 0,
      };
    })
    .sort((a, b) => b.totalBottles - a.totalBottles);

  // Highest value client
  const highestValueClient = [...clientBreakdown].sort((a, b) => b.totalBilled - a.totalBilled)[0] ?? null;

  // ── Monthly trend (last 6 calendar months ending at `end`) ───────────────
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const mEnd   = new Date(end.getFullYear(), end.getMonth() - i + 1, 0, 23, 59, 59, 999);

    const [mDeliveries, mBottles, mRevenue, mClients] = await Promise.all([
      prisma.delivery.count({
        where: { deliveryDate: { gte: mStart, lte: mEnd }, status: 'COMPLETED' },
      }),
      prisma.delivery.aggregate({
        where: { deliveryDate: { gte: mStart, lte: mEnd }, status: 'COMPLETED' },
        _sum:  { filledBottlesDelivered: true },
      }),
      prisma.invoice.aggregate({
        where: { createdAt: { gte: mStart, lte: mEnd } },
        _sum:  { amountPaid: true },
      }),
      prisma.delivery.findMany({
        where:  { deliveryDate: { gte: mStart, lte: mEnd }, status: 'COMPLETED' },
        select: { clientId: true },
        distinct: ['clientId'],
      }).then(r => r.length),
    ]);

    monthlyTrend.push({
      month:        mStart.getMonth() + 1,
      year:         mStart.getFullYear(),
      deliveries:   mDeliveries,
      bottles:      mBottles._sum.filledBottlesDelivered ?? 0,
      revenue:      parseFloat(mRevenue._sum.amountPaid ?? 0),
      clientsServed: mClients,
    });
  }

  res.json({
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      totalDeliveries,
      totalBottles,
      totalRevenue,
      paidRevenue,
      outstanding:    totalRevenue - paidRevenue,
      totalInvoices,
      paidInvoices,
      clientsServed:  clientCount,
      collectionRate: totalInvoices > 0 ? Math.round((paidInvoices / totalInvoices) * 100) : 0,
    },
    mostActiveDriver,
    highestValueClient,
    driverBreakdown,
    clientBreakdown,
    monthlyTrend,
  });
}

// ─── getClientSummary ───────────────────────────────────────────────────────

async function getClientSummary(req, res) {
  const { from, to, driverId, vehicleNumber, route, clientId } = req.query;

  const { start, end } = parseRange({ from, to });

  // Resolve driverId from vehicleNumber if given
  let effectiveDriverId = driverId || undefined;
  if (vehicleNumber && !driverId) {
    const driverByVehicle = await prisma.driver.findFirst({ where: { vehicleNumber } });
    effectiveDriverId = driverByVehicle?.id ?? '__none__';
  }

  const clientWhere = {
    isActive: true,
    ...(clientId && { id: clientId }),
    ...(effectiveDriverId && { assignedDriverId: effectiveDriverId }),
    ...(route && { route }),
  };

  const clients = await prisma.client.findMany({
    where: clientWhere,
    select: {
      id: true,
      name: true,
      address: true,
      route: true,
      assignedDriver: {
        select: {
          id: true,
          vehicleNumber: true,
          route: true,
          user: { select: { name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const clientRows = await Promise.all(
    clients.map(async (c) => {
      const deliveryWhere = {
        clientId: c.id,
        deliveryDate: { gte: start, lte: end },
        status: 'COMPLETED',
      };
      const invoiceWhere = { clientId: c.id, createdAt: { gte: start, lte: end } };

      const [deliveries, invAgg, paidAgg, lastDelivery] = await Promise.all([
        prisma.delivery.findMany({
          where: deliveryWhere,
          select: { deliveryDate: true, filledBottlesDelivered: true },
        }),
        prisma.invoice.aggregate({ where: invoiceWhere, _sum: { totalAmount: true } }),
        // Paid = SUM(amountPaid) across ALL of this client's invoices in
        // range, not SUM(totalAmount) restricted to isPaid:true — captures
        // partial payments correctly.
        prisma.invoice.aggregate({ where: invoiceWhere, _sum: { amountPaid: true } }),
        prisma.delivery.findFirst({
          where: { clientId: c.id, status: 'COMPLETED' },
          orderBy: { deliveryDate: 'desc' },
          select: { deliveryDate: true },
        }),
      ]);

      const totalBottles = deliveries.reduce((s, d) => s + d.filledBottlesDelivered, 0);
      const totalBilled = parseFloat(invAgg._sum.totalAmount ?? 0);
      const paid = parseFloat(paidAgg._sum.amountPaid ?? 0);
      const unpaid = totalBilled - paid;

      // Monthly breakdown (bottles + billed, grouped by month/year within range)
      const monthlyMap = {};
      for (const d of deliveries) {
        const dt = new Date(d.deliveryDate);
        const key = `${dt.getFullYear()}-${dt.getMonth() + 1}`;
        if (!monthlyMap[key]) {
          monthlyMap[key] = { year: dt.getFullYear(), month: dt.getMonth() + 1, bottles: 0, deliveries: 0 };
        }
        monthlyMap[key].bottles += d.filledBottlesDelivered;
        monthlyMap[key].deliveries += 1;
      }
      const monthlyBreakdown = Object.values(monthlyMap).sort((a, b) => (a.year - b.year) || (a.month - b.month));

      return {
        clientId: c.id,
        clientName: c.name,
        address: c.address,
        route: c.route,
        driverName: c.assignedDriver?.user?.name ?? '—',
        vehicleNumber: c.assignedDriver?.vehicleNumber ?? '—',
        totalDeliveries: deliveries.length,
        totalBottles,
        lastDelivery: lastDelivery?.deliveryDate ?? null,
        totalBilled,
        paid,
        unpaid,
        outstanding: unpaid,
        monthlyBreakdown,
      };
    })
  );

  // ── Vehicle-wise summary ────────────────────────────────────────────────
  const vehicleMap = {};
  for (const row of clientRows) {
    const key = row.vehicleNumber;
    if (!vehicleMap[key]) {
      vehicleMap[key] = {
        vehicleNumber: row.vehicleNumber,
        driverName: row.driverName,
        route: row.route,
        totalClients: 0,
        totalDeliveries: 0,
        totalBottles: 0,
        totalRevenue: 0,
      };
    }
    vehicleMap[key].totalClients += 1;
    vehicleMap[key].totalDeliveries += row.totalDeliveries;
    vehicleMap[key].totalBottles += row.totalBottles;
    vehicleMap[key].totalRevenue += row.totalBilled;
  }
  const vehicleSummary = Object.values(vehicleMap).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // ── Overall summary ─────────────────────────────────────────────────────
  const totalClients = clientRows.length;
  const totalBottles = clientRows.reduce((s, r) => s + r.totalBottles, 0);
  const totalRevenue = clientRows.reduce((s, r) => s + r.totalBilled, 0);
  const totalPaid = clientRows.reduce((s, r) => s + r.paid, 0);
  const outstanding = clientRows.reduce((s, r) => s + r.outstanding, 0);
  const collectionRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0;

  res.json({
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: { totalClients, totalBottles, totalRevenue, outstanding, collectionRate },
    clients: clientRows,
    vehicleSummary,
  });
}

module.exports = { getSummary, getClientSummary };
