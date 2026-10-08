const prisma = require('./prisma');

// PHASE 2b: Customer is now the authoritative source of truth for
// outstandingBalance/creditBalance. Every client is linked to its own
// Customer (phase 2a's backfill covers every pre-existing client;
// clientController.createClient creates one eagerly for new clients) — this
// is a lazy fallback for any client that somehow still lacks one, so a
// balance write never has nowhere to land. Not called inside the caller's
// main $transaction (array-form transactions can't branch), but is itself
// atomic: the Customer create and the Client.customerId link happen
// together, so a client can never end up pointing at a half-created
// Customer.
async function ensureCustomer(client) {
  if (client.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: client.customerId } });
    if (customer) return customer;
  }
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: client.name,
        outstandingBalance: client.outstandingBalance ?? 0,
        creditBalance: client.creditBalance ?? 0,
      },
    });
    await tx.client.update({ where: { id: client.id }, data: { customerId: customer.id } });
    return customer;
  });
}

// Resolves straight to a customerId from a clientId, fetching just enough of
// the Client to call ensureCustomer if needed.
async function getCustomerIdForClient(clientId) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, customerId: true, outstandingBalance: true, creditBalance: true },
  });
  if (!client) return null;
  if (client.customerId) return client.customerId;
  const customer = await ensureCustomer(client);
  return customer.id;
}

// Belt-and-suspenders mirror: writes the same new balance values onto the
// client row the Customer is linked through, until phase 3 makes
// Client.outstandingBalance/creditBalance fully legacy. Customer stays
// authoritative — this is purely so nothing reading Client.* directly (and
// nothing else in this codebase should write it for balance purposes) drifts
// out of sync.
function mirrorToClient(tx, clientId, data) {
  return tx.client.update({ where: { id: clientId }, data });
}

module.exports = { ensureCustomer, getCustomerIdForClient, mirrorToClient };
