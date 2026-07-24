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

async function resetPassword(req, res) {
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'newPassword and confirmPassword are required' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: driver.userId },
    data: { passwordHash },
  });

  res.json({ success: true, message: 'Password updated' });
}

async function getDriverWithCredentials(req, res) {
  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, loginId: true, name: true, email: true, mobile: true } },
    },
  });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  res.json({
    id: driver.id,
    name: driver.user.name,
    mobile: driver.user.mobile,
    vehicleNumber: driver.vehicleNumber,
    vehicleType: driver.vehicleType,
    route: driver.route,
    isActive: driver.isActive,
    user: driver.user,
  });
}

async function updateDriverCredentials(req, res) {
  const { name, mobile, vehicleNumber, vehicleType, route, isActive, loginId, newPassword } = req.body;

  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    select: { id: true, userId: true },
  });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  if (loginId) {
    const existing = await prisma.user.findUnique({ where: { loginId } });
    if (existing && existing.id !== driver.userId) {
      return res.status(409).json({ error: 'loginId already taken' });
    }
  }

  let passwordHash;
  if (newPassword) {
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: driver.userId },
      data: {
        ...(name && { name }),
        ...(mobile && { mobile }),
        ...(loginId && { loginId }),
        ...(passwordHash && { passwordHash }),
      },
    });
    return tx.driver.update({
      where: { id: driver.id },
      data: {
        ...(vehicleNumber && { vehicleNumber }),
        ...(vehicleType && { vehicleType }),
        ...(route && { route }),
        ...(typeof isActive === 'boolean' && { isActive }),
      },
      include: {
        user: { select: { id: true, loginId: true, name: true, email: true, mobile: true } },
      },
    });
  });

  res.json(updated);
}

module.exports = {
  createDriver,
  listDrivers,
  getDriver,
  updateDriver,
  deleteDriver,
  resetPassword,
  getDriverWithCredentials,
  updateDriverCredentials,
};
