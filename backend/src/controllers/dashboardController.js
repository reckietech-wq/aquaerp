const prisma = require('../lib/prisma');

function getRangeStart(filter) {
  const now = new Date();
  if (filter === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (filter === 'year') {
    return new Date(now.getFullYear(), 0, 1);
  }
  // default: today
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

async function getStats(req, res) {
  const { filter, clientId } = req.query;
  const rangeStart = getRangeStart(filter);
  const rangeEnd = new Date();
  rangeEnd.setHours(23, 59, 59, 999);

  const deliveryWhere = {
    deliveryDate: { gte: rangeStart, lte: rangeEnd },
    ...(clientId && { clientId }),
  };
  const invoiceWhere = {
    isPaid: true,
    createdAt: { gte: rangeStart, lte: rangeEnd },
    ...(clientId && { clientId }),
  };
  const pendingInvoiceWhere = {
    isPaid: false,
    ...(clientId && { clientId }),
  };

  const [
    totalClients,
    totalDrivers,
    periodDeliveries,
    pendingInvoices,
    totalRevenue,
    bottlesResult,
  ] = await Promise.all([
    prisma.client.count({ where: { isActive: true, ...(clientId && { id: clientId }) } }),
    prisma.driver.count({ where: { isActive: true } }),
    prisma.delivery.count({ where: deliveryWhere }),
    prisma.invoice.count({ where: pendingInvoiceWhere }),
    prisma.invoice.aggregate({
      where: invoiceWhere,
      _sum: { totalAmount: true },
    }),
    prisma.delivery.aggregate({
      where: deliveryWhere,
      _sum: { filledBottlesDelivered: true },
    }),
  ]);

  res.json({
    totalClients,
    totalDrivers,
    todayDeliveries: periodDeliveries,
    todayBottlesDelivered: bottlesResult._sum.filledBottlesDelivered ?? 0,
    pendingInvoices,
    totalRevenue: totalRevenue._sum.totalAmount ?? 0,
  });
}

async function getRecentDeliveries(req, res) {
  const { filter, clientId } = req.query;
  const rangeStart = getRangeStart(filter);
  const rangeEnd = new Date();
  rangeEnd.setHours(23, 59, 59, 999);

  const deliveries = await prisma.delivery.findMany({
    take: 20,
    where: {
      deliveryDate: { gte: rangeStart, lte: rangeEnd },
      ...(clientId && { clientId }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, address: true, route: true } },
      driver: {
        include: { user: { select: { name: true } } },
      },
    },
  });
  res.json(deliveries);
}

module.exports = { getStats, getRecentDeliveries };
