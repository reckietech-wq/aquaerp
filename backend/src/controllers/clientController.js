const prisma = require('../lib/prisma');

async function createClient(req, res) {
  const { name, mobile, email, address, assignedDriverId, tempoNumber, route } = req.body;

  if (!name || !mobile || !address || !assignedDriverId || !tempoNumber || !route) {
    return res.status(400).json({ error: 'name, mobile, address, assignedDriverId, tempoNumber, and route are required' });
  }

  const driver = await prisma.driver.findUnique({ where: { id: assignedDriverId } });
  if (!driver) return res.status(404).json({ error: 'Assigned driver not found' });
  if (!driver.isActive) return res.status(400).json({ error: 'Assigned driver is inactive' });

  const client = await prisma.client.create({
    data: { name, mobile, email, address, assignedDriverId, tempoNumber, route },
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
    },
  });

  res.status(201).json(client);
}

async function listClients(req, res) {
  const { driverId, route, search } = req.query;

  const where = {
    isActive: true,
    ...(driverId && { assignedDriverId: driverId }),
    ...(route && { route }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const clients = await prisma.client.findMany({
    where,
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
      _count: { select: { deliveries: true, invoices: true } },
    },
    orderBy: { name: 'asc' },
  });

  res.json(clients);
}

async function getClient(req, res) {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
      deliveries: {
        orderBy: { deliveryDate: 'desc' },
        take: 50,
        include: {
          driver: { include: { user: { select: { name: true } } } },
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
}

async function updateClient(req, res) {
  const { name, mobile, email, address, assignedDriverId, tempoNumber, route } = req.body;

  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  if (assignedDriverId && assignedDriverId !== client.assignedDriverId) {
    const driver = await prisma.driver.findUnique({ where: { id: assignedDriverId } });
    if (!driver) return res.status(404).json({ error: 'Assigned driver not found' });
    if (!driver.isActive) return res.status(400).json({ error: 'Assigned driver is inactive' });
  }

  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(mobile && { mobile }),
      ...(email !== undefined && { email }),
      ...(address && { address }),
      ...(assignedDriverId && { assignedDriverId }),
      ...(tempoNumber && { tempoNumber }),
      ...(route && { route }),
    },
    include: {
      assignedDriver: {
        include: { user: { select: { id: true, name: true, mobile: true } } },
      },
    },
  });

  res.json(updated);
}

async function deleteClient(req, res) {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  await prisma.client.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ message: 'Client deactivated' });
}

module.exports = { createClient, listClients, getClient, updateClient, deleteClient };
