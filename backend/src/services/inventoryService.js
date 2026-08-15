const prisma = require('../lib/prisma');

const INVENTORY_ID = 1;

async function getInventory() {
  return prisma.bottleInventory.upsert({
    where:  { id: INVENTORY_ID },
    create: { id: INVENTORY_ID, totalFilledBottles: 0, totalEmptyBottles: 0, updatedBy: 'system', lastUpdatedAt: new Date() },
    update: {},
  });
}

// Atomic stock adjustment — uses Prisma's `increment` (a single DB-level
// UPDATE ... SET x = x + delta) instead of read-then-write, so concurrent
// callers can't clobber each other's changes: MySQL row-locks the update for
// the duration of the transaction, serializing concurrent adjustments rather
// than losing one silently.
//
// Pass `tx` (a Prisma interactive-transaction client) to run this as part of
// a larger transaction — e.g. delivery creation — so a negative-stock throw
// here rolls back the whole caller transaction, not just the inventory half.
// If `tx` is omitted, the update + log write are wrapped in their own
// transaction so they can't land inconsistently with each other.
async function adjustInventory({ filledChange, emptyChange, type, referenceId = null, note = null, createdBy, tx }) {
  await getInventory(); // ensure the singleton row exists — safe outside any tx (idempotent upsert)

  async function run(db) {
    const updated = await db.bottleInventory.update({
      where: { id: INVENTORY_ID },
      data: {
        totalFilledBottles: { increment: filledChange },
        totalEmptyBottles:  { increment: emptyChange },
        lastUpdatedAt:      new Date(),
        updatedBy:          createdBy,
      },
    });

    if (updated.totalFilledBottles < 0) throw new Error('Insufficient filled bottles in stock');
    if (updated.totalEmptyBottles  < 0) throw new Error('Empty bottle count cannot go negative');

    await db.inventoryLog.create({
      data: {
        type,
        filledChange,
        emptyChange,
        filledBalanceAfter: updated.totalFilledBottles,
        emptyBalanceAfter:  updated.totalEmptyBottles,
        referenceId,
        note,
        createdBy,
      },
    });

    return updated;
  }

  if (tx) return run(tx);
  return prisma.$transaction((txx) => run(txx));
}

module.exports = { getInventory, adjustInventory };
