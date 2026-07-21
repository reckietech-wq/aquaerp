const { getInventory, adjustInventory } = require('../services/inventoryService');
const prisma = require('../lib/prisma');

const LOW_STOCK_THRESHOLD = 50;

// GET /api/inventory  (both roles)
async function getInventoryHandler(req, res) {
  const inv = await getInventory();
  res.json({
    ...inv,
    lowStock: inv.totalFilledBottles < LOW_STOCK_THRESHOLD,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  });
}

// GET /api/inventory/logs  (admin only)
async function getLogs(req, res) {
  const { type, from, to } = req.query;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10)));
  const page  = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const skip  = (page - 1) * limit;

  const where = {};
  if (type) where.type = type;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const d = new Date(to); d.setHours(23, 59, 59, 999);
      where.createdAt.lte = d;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.inventoryLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.inventoryLog.count({ where }),
  ]);

  res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
}

// POST /api/inventory/restock  (admin only)
async function adminRestock(req, res) {
  const { filledBottlesToAdd, note } = req.body;
  const qty = parseInt(filledBottlesToAdd, 10);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'filledBottlesToAdd must be a positive integer' });

  const inv = await adjustInventory({
    filledChange: +qty,
    emptyChange:  0,
    type:         'ADMIN_RESTOCK',
    note:         note ?? null,
    createdBy:    req.user.loginId ?? req.user.id,
  });

  res.json({ message: `Restocked ${qty} filled bottles`, inventory: inv });
}

// POST /api/inventory/dispatch-empties  (admin only)
async function adminDispatchEmpties(req, res) {
  const { emptyBottlesToDispatch, note } = req.body;
  const qty = parseInt(emptyBottlesToDispatch, 10);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'emptyBottlesToDispatch must be a positive integer' });

  const inv = await adjustInventory({
    filledChange: 0,
    emptyChange:  -qty,
    type:         'ADMIN_EMPTY_DISPATCH',
    note:         note ?? null,
    createdBy:    req.user.loginId ?? req.user.id,
  });

  res.json({ message: `Dispatched ${qty} empty bottles for refilling`, inventory: inv });
}

// POST /api/inventory/adjust  (admin only)
async function manualAdjustment(req, res) {
  const { filledChange, emptyChange, note } = req.body;
  const fc = parseInt(filledChange ?? 0, 10);
  const ec = parseInt(emptyChange  ?? 0, 10);

  if (fc === 0 && ec === 0) {
    return res.status(400).json({ error: 'filledChange and/or emptyChange must be non-zero' });
  }

  const inv = await adjustInventory({
    filledChange: fc,
    emptyChange:  ec,
    type:         'MANUAL_ADJUSTMENT',
    note:         note ?? null,
    createdBy:    req.user.loginId ?? req.user.id,
  });

  res.json({ message: 'Manual adjustment applied', inventory: inv });
}

module.exports = { getInventoryHandler, getLogs, adminRestock, adminDispatchEmpties, manualAdjustment };
