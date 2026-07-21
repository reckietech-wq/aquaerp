const prisma = require('../lib/prisma');

async function getStats(req, res) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    totalClients,
    totalDrivers,
    todayDeliveries,
    pendingInvoices,
    totalRevenue,
    bottlesResult,
  ] = await Promise.all([
    prisma.client.count({ where: { isActive: true } }),
    prisma.driver.count({ where: { isActive: true } }),
    prisma.delivery.count({
      where: { deliveryDate: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.invoice.count({ where: { isPaid: false } }),
    prisma.invoice.aggregate({
      where: { isPaid: true },
      _sum: { totalAmount: true },
    }),
    prisma.delivery.aggregate({
      where: { deliveryDate: { gte: todayStart, lte: todayEnd } },
      _sum: { filledBottlesDelivered: true },
    }),
  ]);

  res.json({
    totalClients,
    totalDrivers,
    todayDeliveries,
    todayBottlesDelivered: bottlesResult._sum.filledBottlesDelivered ?? 0,
    pendingInvoices,
    totalRevenue: totalRevenue._sum.totalAmount ?? 0,
  });
}

async function getRecentDeliveries(req, res) {
  const deliveries = await prisma.delivery.findMany({
    take: 20,
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
