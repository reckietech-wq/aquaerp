const prisma = require('../lib/prisma');
const { istDayStart, istDayEnd } = require('../lib/dateUtils');

function isValidRate(rate) {
  return !isNaN(parseFloat(rate)) && parseFloat(rate) > 0;
}

// ─── GET /api/customers  (ADMIN only) ─────────────────────────────────────────
// One row per customer — outstandingBalance/creditBalance are the customer's
// own (shared across every location), plus how many locations (Clients) it has.
async function listCustomers(req, res) {
  const { search } = req.query;

  const customers = await prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { clients: { some: { OR: [{ mobile: { contains: search } }, { name: { contains: search } }] } } },
          ],
        }
      : undefined,
    include: { _count: { select: { clients: true } } },
    orderBy: { name: 'asc' },
  });

  res.json(customers.map((c) => ({
    id: c.id,
    name: c.name,
    outstandingBalance: c.outstandingBalance,
    creditBalance: c.creditBalance,
    locationCount: c._count.clients,
  })));
}

// ─── GET /api/customers/:id  (ADMIN only) ─────────────────────────────────────
// The customer's shared balance plus every one of its locations (Clients),
// each with today's deliveries — same "today" boundary used everywhere else
// (IST calendar day).
async function getCustomerDetail(req, res) {
  const { id } = req.params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const start = istDayStart();
  const end = istDayEnd();

  const locations = await prisma.client.findMany({
    where: { customerId: id },
    include: {
      assignedDriver: { select: { user: { select: { name: true } } } },
      deliveries: {
        where: { deliveryDate: { gte: start, lte: end }, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  res.json({
    id: customer.id,
    name: customer.name,
    outstandingBalance: customer.outstandingBalance,
    creditBalance: customer.creditBalance,
    locationCount: locations.length,
    locations: locations.map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.mobile,
      address: c.address,
      route: c.route,
      tempoNumber: c.tempoNumber,
      ratePerBottle: c.ratePerBottle,
      bottlesOut: c.bottlesOut,
      totalBottlesDelivered: c.totalBottlesDelivered,
      totalBottlesCollected: c.totalBottlesCollected,
      isActive: c.isActive,
      assignedDriverName: c.assignedDriver?.user?.name ?? '—',
      todayDeliveries: c.deliveries,
      todayDeliveryCount: c.deliveries.length,
    })),
  });
}

// ─── POST /api/customers/:customerId/locations  (ADMIN only) ─────────────────
// Adds a new Client "location" under an existing Customer. A location is
// purely where deliveries attach and where its own address/route/rate/driver
// live — it never gets its own balance/credit; those stay on the Customer and
// are shared across every location it has (deliberately: this is what makes
// it one customer with multiple locations rather than several customers).
async function addLocation(req, res) {
  const { customerId } = req.params;
  const { name, mobile, address, assignedDriverId, tempoNumber, route, ratePerBottle } = req.body;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  if (!address || !assignedDriverId || !tempoNumber || !route) {
    return res.status(400).json({ error: 'address, assignedDriverId, tempoNumber, and route are required' });
  }
  if (ratePerBottle !== undefined && !isValidRate(ratePerBottle)) {
    return res.status(400).json({ error: 'ratePerBottle must be a positive number' });
  }

  const driver = await prisma.driver.findUnique({ where: { id: assignedDriverId } });
  if (!driver) return res.status(404).json({ error: 'Assigned driver not found' });
  if (!driver.isActive) return res.status(400).json({ error: 'Assigned driver is inactive' });

  // name/mobile fall back to the customer's first existing location so
  // adding a second location doesn't force re-entering the same contact info.
  const [existingLocation, existingCount] = await Promise.all([
    prisma.client.findFirst({ where: { customerId }, orderBy: { createdAt: 'asc' } }),
    prisma.client.count({ where: { customerId } }),
  ]);
  const locationName = name || (existingLocation ? `${customer.name} (Location ${existingCount + 1})` : customer.name);
  const locationMobile = mobile || existingLocation?.mobile;
  if (!locationMobile) {
    return res.status(400).json({ error: 'mobile is required for a customer\'s first location' });
  }

  const location = await prisma.client.create({
    data: {
      name: locationName,
      mobile: locationMobile,
      address,
      assignedDriverId,
      tempoNumber,
      route,
      customerId,
      // Belt-and-suspenders mirror, seeded from the customer's CURRENT
      // shared balance so this new location's column isn't misleadingly 0
      // from creation — it's never read as truth, but should still agree.
      outstandingBalance: customer.outstandingBalance,
      creditBalance: customer.creditBalance,
      ...(ratePerBottle !== undefined && { ratePerBottle }),
    },
    include: {
      assignedDriver: { include: { user: { select: { id: true, name: true, mobile: true } } } },
    },
  });

  res.status(201).json(location);
}

module.exports = { listCustomers, getCustomerDetail, addLocation };
