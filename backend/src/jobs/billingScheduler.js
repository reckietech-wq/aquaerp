const cron = require('node-cron');
const prisma = require('../lib/prisma');

function prevMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function monthRange(month, year) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 1);
  return { start, end };
}

async function runBillingJob() {
  const { month, year } = prevMonth();
  console.log(`[billing-job] Generating bills for ${month}/${year}…`);

  const clients = await prisma.client.findMany({
    where:  { isActive: true },
    select: { id: true, ratePerBottle: true },
  });

  let generated = 0;
  let skipped   = 0;

  for (const client of clients) {
    const { start, end } = monthRange(month, year);

    const deliveries = await prisma.delivery.findMany({
      where: {
        clientId:     client.id,
        deliveryDate: { gte: start, lt: end },
        status:       'COMPLETED',
      },
      select: { filledBottlesDelivered: true, emptyBottlesCollected: true },
    });

    if (deliveries.length === 0) { skipped++; continue; }

    const totalBottles = deliveries.reduce((s, d) => s + d.filledBottlesDelivered, 0);
    const totalEmpty   = deliveries.reduce((s, d) => s + d.emptyBottlesCollected,  0);

    const rate        = client.ratePerBottle != null ? parseFloat(client.ratePerBottle) : 50;
    const totalAmount = totalBottles * rate;

    await prisma.monthlyBill.upsert({
      where:  { clientId_month_year: { clientId: client.id, month, year } },
      create: {
        clientId:              client.id,
        month,
        year,
        totalBottlesDelivered: totalBottles,
        totalEmptyCollected:   totalEmpty,
        ratePerBottle:         rate,
        totalAmount,
        status:                'DRAFT',
      },
      update: {
        totalBottlesDelivered: totalBottles,
        totalEmptyCollected:   totalEmpty,
        ratePerBottle:         rate,
        totalAmount,
      },
    });

    generated++;
  }

  console.log(`[billing-job] Done — generated: ${generated}, skipped: ${skipped}`);
}

function startBillingScheduler() {
  // Runs at 06:00 on the 1st of every month
  cron.schedule('0 6 1 * *', runBillingJob, { timezone: 'Asia/Kolkata' });
  console.log('[billing-job] Scheduler registered — runs 1st of every month at 06:00 IST');
}

module.exports = { startBillingScheduler, runBillingJob };
