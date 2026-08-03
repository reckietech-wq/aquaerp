const prisma = require('../lib/prisma');

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function getMyClients(req, res) {
  const driver = await prisma.driver.findUnique({
    where: { userId: req.user.id },
  });
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

  const { start, end } = todayRange();

  const clients = await prisma.client.findMany({
    where: { assignedDriverId: driver.id, isActive: true },
    include: {
      deliveries: {
        where: { deliveryDate: { gte: start, lte: end } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      // Most recent past delivery for "last delivery date"
      _count: { select: { deliveries: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Attach last delivery date (outside today) for display
  const clientIds = clients.map((c) => c.id);
  const lastDeliveries = await prisma.delivery.findMany({
    where: {
      clientId: { in: clientIds },
      deliveryDate: { lt: start },
      status: 'COMPLETED',
    },
    orderBy: { deliveryDate: 'desc' },
    distinct: ['clientId'],
    select: { clientId: true, deliveryDate: true, filledBottlesDelivered: true },
  });

  const lastMap = Object.fromEntries(
    lastDeliveries.map((d) => [d.clientId, { date: d.deliveryDate, bottles: d.filledBottlesDelivered }])
  );

  // Fetch today's invoices for any delivery recorded today
  const todayDeliveryIds = clients.map((c) => c.deliveries[0]?.id).filter(Boolean);
  const todayInvoices = todayDeliveryIds.length
    ? await prisma.invoice.findMany({
        where: { deliveryId: { in: todayDeliveryIds } },
        select: { id: true, deliveryId: true, invoiceNumber: true, totalAmount: true, isPaid: true },
      })
    : [];
  const invoiceByDeliveryId = Object.fromEntries(todayInvoices.map((i) => [i.deliveryId, i]));

  const result = clients.map((c) => {
    const todayDelivery = c.deliveries[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      address: c.address,
      route: c.route,
      tempoNumber: c.tempoNumber,
      ratePerBottle: c.ratePerBottle,
      outstandingBalance: c.outstandingBalance,
      totalDeliveries: c._count.deliveries,
      lastDeliveryDate: lastMap[c.id]?.date ?? null,
      lastDeliveryBottles: lastMap[c.id]?.bottles ?? null,
      todayDelivery,
      deliveredToday: todayDelivery !== null && todayDelivery.status === 'COMPLETED',
      todayInvoice: todayDelivery ? (invoiceByDeliveryId[todayDelivery.id] ?? null) : null,
    };
  });

  // Pending first, then completed
  result.sort((a, b) => Number(a.deliveredToday) - Number(b.deliveredToday));

  res.json({ driver, clients: result });
}

async function getSummary(req, res) {
  const driver = await prisma.driver.findUnique({
    where: { userId: req.user.id },
  });
  if (!driver) return res.status(404).json({ error: 'Driver profile not found' });

  const { start, end } = todayRange();

  const [totalClients, todayDeliveries, bottlesResult] = await Promise.all([
    prisma.client.count({ where: { assignedDriverId: driver.id, isActive: true } }),
    prisma.delivery.findMany({
      where: { driverId: driver.id, deliveryDate: { gte: start, lte: end } },
      select: { status: true, filledBottlesDelivered: true },
    }),
    prisma.delivery.aggregate({
      where: { driverId: driver.id, deliveryDate: { gte: start, lte: end }, status: 'COMPLETED' },
      _sum: { filledBottlesDelivered: true },
    }),
  ]);

  const deliveredToday = todayDeliveries.filter((d) => d.status === 'COMPLETED').length;
  const pendingToday   = totalClients - deliveredToday;
  const totalBottlesToday = bottlesResult._sum.filledBottlesDelivered ?? 0;

  res.json({ totalClients, deliveredToday, pendingToday, totalBottlesToday });
}

module.exports = { getMyClients, getSummary };
