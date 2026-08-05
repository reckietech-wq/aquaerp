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

  // Fetch today's invoices for every delivery recorded today (not just the
  // latest one) so multiple same-day deliveries each surface their own
  // invoice/payment status.
  const todayDeliveryIds = clients.flatMap((c) => c.deliveries.map((d) => d.id));
  const todayInvoices = todayDeliveryIds.length
    ? await prisma.invoice.findMany({
        where: { deliveryId: { in: todayDeliveryIds } },
        select: { id: true, deliveryId: true, invoiceNumber: true, totalAmount: true, isPaid: true, amountPaid: true },
      })
    : [];
  const invoiceByDeliveryId = Object.fromEntries(todayInvoices.map((i) => [i.deliveryId, i]));

  const result = clients.map((c) => {
    const todayDeliveries = c.deliveries.map((d) => ({
      ...d,
      invoice: invoiceByDeliveryId[d.id] ?? null,
    }));
    const todayFilledBottles = todayDeliveries.reduce((s, d) => s + d.filledBottlesDelivered, 0);
    const todayEmptyBottles = todayDeliveries.reduce((s, d) => s + d.emptyBottlesCollected, 0);
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
      todayDeliveries,
      todayDeliveryCount: todayDeliveries.length,
      todayFilledBottles,
      todayEmptyBottles,
      deliveredToday: todayDeliveries.length > 0,
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
