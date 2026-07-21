const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function createDriver(req, res) {
  const { name, mobile, vehicleNumber, vehicleType, route, loginId, password } = req.body;

  if (!name || !mobile || !vehicleNumber || !vehicleType || !route || !loginId || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const existing = await prisma.user.findUnique({ where: { loginId } });
  if (existing) {
    return res.status(409).json({ error: 'loginId already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const driver = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, mobile, role: 'DRIVER', loginId, passwordHash },
    });
    return tx.driver.create({
      data: { userId: user.id, vehicleNumber, vehicleType, route },
      include: { user: { select: { id: true, name: true, mobile: true, loginId: true, role: true } } },
    });
  });

  res.status(201).json(driver);
}

async function listDrivers(req, res) {
  const drivers = await prisma.driver.findMany({
    include: {
      user: { select: { id: true, name: true, mobile: true, loginId: true, role: true, createdAt: true } },
      _count: { select: { clients: { where: { isActive: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(drivers);
}

async function getDriver(req, res) {
  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, mobile: true, loginId: true, role: true, createdAt: true } },
      clients: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  res.json(driver);
}

async function updateDriver(req, res) {
  const { name, mobile, vehicleNumber, vehicleType, route } = req.body;

  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true },
  });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const updated = await prisma.$transaction(async (tx) => {
    if (name || mobile) {
      await tx.user.update({
        where: { id: driver.userId },
        data: {
          ...(name && { name }),
          ...(mobile && { mobile }),
        },
      });
    }
    return tx.driver.update({
      where: { id: driver.id },
      data: {
        ...(vehicleNumber && { vehicleNumber }),
        ...(vehicleType && { vehicleType }),
        ...(route && { route }),
      },
      include: {
        user: { select: { id: true, name: true, mobile: true, loginId: true, role: true } },
      },
    });
  });

  res.json(updated);
}

async function deleteDriver(req, res) {
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  await prisma.driver.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ message: 'Driver deactivated' });
}

module.exports = { createDriver, listDrivers, getDriver, updateDriver, deleteDriver };
