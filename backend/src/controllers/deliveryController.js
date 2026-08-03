const prisma = require('../lib/prisma');
const { adjustInventory } = require('../services/inventoryService');

async function createDelivery(req, res) {
  const { clientId, filledBottlesDelivered, emptyBottlesCollected, deliveryDate, notes, status } = req.body;

  if (!clientId || filledBottlesDelivered == null || emptyBottlesCollected == null) {
    return res.status(400).json({ error: 'clientId, filledBottlesDelivered, and emptyBottlesCollected are required' });
  }

  const filled = parseInt(filledBottlesDelivered, 10);
  const empty  = parseInt(emptyBottlesCollected,  10);

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Resolve driverId: drivers use their own profile, admins use the client's assigned driver
  let driverId;
  if (req.user.role === 'DRIVER') {
    const driverProfile = await prisma.driver.findUnique({ where: { userId: req.user.id } });
    if (!driverProfile) return res.status(404).json({ error: 'Driver profile not found' });
    if (!driverProfile.isActive) return res.status(401).json({ error: 'Account deactivated' });
    if (client.assignedDriverId !== driverProfile.id) {
      return res.status(403).json({ error: 'This client is not assigned to you' });
    }
    driverId = driverProfile.id;
  } else {
    driverId = client.assignedDriverId;
  }

  // Check stock BEFORE creating delivery
  if (filled > 0) {
    try {
      // Dry-run check: just read the inventory
      const inv = await prisma.bottleInventory.findUnique({ where: { id: 1 } });
      if (inv && inv.totalFilledBottles < filled) {
        return res.status(400).json({
          error: `Insufficient filled bottles in stock. Available: ${inv.totalFilledBottles}, requested: ${filled}`,
        });
      }
    } catch { /* if no inventory row yet, skip pre-check */ }
  }

  const delivery = await prisma.delivery.create({
    data: {
      clientId,
      driverId,
      userId:                req.user.id,
      deliveryDate:          deliveryDate ? new Date(deliveryDate) : new Date(),
      filledBottlesDelivered: filled,
      emptyBottlesCollected:  empty,
      status:                status ?? 'COMPLETED',
      notes:                 notes ?? null,
    },
  });

  // Update inventory — filled go out, empties come in
  let inventory = null;
  try {
    inventory = await adjustInventory({
      filledChange: -filled,
      emptyChange:  +empty,
      type:         'DELIVERY_OUT',
      referenceId:  delivery.id,
      note:         `Delivery to ${client.name}`,
      createdBy:    req.user.loginId ?? req.user.id,
    });
  } catch (err) {
    // Inventory update failed — delivery is already created, log and continue
    console.error('[inventory] adjustment failed after delivery create:', err.message);
  }

  res.status(201).json({
    delivery,
    inventory: inventory
      ? { totalFilled: inventory.totalFilledBottles, totalEmpty: inventory.totalEmptyBottles }
      : null,
  });
}

module.exports = { createDelivery };
