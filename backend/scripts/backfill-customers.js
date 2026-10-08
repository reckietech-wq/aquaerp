// PHASE 2a backfill: give every existing Client its own 1:1 Customer,
// copying balances up. Idempotent — clients that already have a customerId
// are skipped, so this is safe to re-run.
const prisma = require('../src/lib/prisma');

async function main() {
  const clients = await prisma.client.findMany({
    where: { customerId: null },
    select: { id: true, name: true, outstandingBalance: true, creditBalance: true },
  });

  let migrated = 0;
  const mismatches = [];

  for (const client of clients) {
    const { customer } = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction in case a concurrent run already linked it.
      const fresh = await tx.client.findUnique({
        where: { id: client.id },
        select: { customerId: true },
      });
      if (fresh.customerId) return { customer: null };

      const customer = await tx.customer.create({
        data: {
          name: client.name,
          outstandingBalance: client.outstandingBalance,
          creditBalance: client.creditBalance,
        },
      });
      await tx.client.update({
        where: { id: client.id },
        data: { customerId: customer.id },
      });
      return { customer };
    });

    if (!customer) continue;
    migrated++;

    const clientOutstanding = Number(client.outstandingBalance);
    const clientCredit = Number(client.creditBalance);
    const customerOutstanding = Number(customer.outstandingBalance);
    const customerCredit = Number(customer.creditBalance);
    const ok = clientOutstanding === customerOutstanding && clientCredit === customerCredit;
    console.log(
      `${ok ? 'OK' : 'MISMATCH'}  client=${client.id} (${client.name})  ` +
      `outstanding ${clientOutstanding} vs ${customerOutstanding}  ` +
      `credit ${clientCredit} vs ${customerCredit}`
    );
    if (!ok) mismatches.push(client.id);
  }

  const totalClients = await prisma.client.count();
  const totalCustomers = await prisma.customer.count();

  console.log('\n--- Summary ---');
  console.log(`Clients migrated this run: ${migrated}`);
  console.log(`Total clients: ${totalClients}, total customers: ${totalCustomers}`);
  console.log(`Reconciliation mismatches: ${mismatches.length}${mismatches.length ? ' -> ' + mismatches.join(', ') : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
