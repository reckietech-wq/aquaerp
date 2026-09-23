const prisma = require('../lib/prisma');
const { istDayStart, istDayEnd, istMonthStart, currentIstYearMonth } = require('../lib/dateUtils');

// All boundaries computed in IST — the business's timezone — regardless of
// the server process's own timezone, so a delivery late in the IST evening
// never gets bucketed into the wrong day/month.
function getRangeStart(filter) {
  if (filter === 'month') {
    const { year, month } = currentIstYearMonth();
    return istMonthStart(year, month);
  }
  if (filter === 'year') {
    const { year } = currentIstYearMonth();
    return istMonthStart(year, 1);
  }
  // default: today (IST)
  return istDayStart();
}

async function getStats(req, res) {
  const { filter, clientId } = req.query;
  const rangeStart = getRangeStart(filter);
  const rangeEnd = istDayEnd();

  // Only COMPLETED deliveries count as "delivered" — a PENDING delivery
  // hasn't actually moved any bottles yet, and this must stay consistent
  // with driverDashController's getSummary/getMyClients so the dashboard
  // and driver app never disagree on the same day's delivery count.
  const deliveryWhere = {
    deliveryDate: { gte: rangeStart, lte: rangeEnd },
    status: 'COMPLETED',
    ...(clientId && { clientId }),
  };
  // "Revenue" here means cash actually collected in the period — SUM(amountPaid)
  // across every invoice created in range, not SUM(totalAmount) restricted to
  // isPaid:true (which would ignore partially-paid invoices' collected amount
  // entirely).
  const invoiceWhere = {
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
      _sum: { amountPaid: true },
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
    totalRevenue: totalRevenue._sum.amountPaid ?? 0,
  });
}

async function getRecentDeliveries(req, res) {
  const { filter, clientId } = req.query;
  const rangeStart = getRangeStart(filter);
  const rangeEnd = istDayEnd();

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
