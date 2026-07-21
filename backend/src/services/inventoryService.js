const prisma = require('../lib/prisma');

const INVENTORY_ID = 1;

async function getInventory() {
  return prisma.bottleInventory.upsert({
    where:  { id: INVENTORY_ID },
    create: { id: INVENTORY_ID, totalFilledBottles: 0, totalEmptyBottles: 0, updatedBy: 'system', lastUpdatedAt: new Date() },
    update: {},
  });
}

async function adjustInventory({ filledChange, emptyChange, type, referenceId = null, note = null, createdBy }) {
  const current = await getInventory();

  const newFilled = current.totalFilledBottles + filledChange;
  const newEmpty  = current.totalEmptyBottles  + emptyChange;

  if (newFilled < 0) throw new Error('Insufficient filled bottles in stock');
  if (newEmpty  < 0) throw new Error('Empty bottle count cannot go negative');

  const [updated] = await prisma.$transaction([
    prisma.bottleInventory.update({
      where: { id: INVENTORY_ID },
      data: {
        totalFilledBottles: newFilled,
        totalEmptyBottles:  newEmpty,
        lastUpdatedAt:      new Date(),
        updatedBy:          createdBy,
      },
    }),
    prisma.inventoryLog.create({
      data: {
        type,
        filledChange,
        emptyChange,
        filledBalanceAfter: newFilled,
        emptyBalanceAfter:  newEmpty,
        referenceId,
        note,
        createdBy,
      },
    }),
  ]);

  return updated;
}

module.exports = { getInventory, adjustInventory };
