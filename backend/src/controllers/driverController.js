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
  const { name, mobile, vehicleNumber, vehicleType, route, isActive } = req.body;

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
        ...(typeof isActive === 'boolean' && { isActive }),
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

  const hard = req.query.hard === 'true';
  if (!hard) {
    await prisma.driver.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    return res.json({ message: 'Driver deactivated' });
  }

  // Hard delete: permanently removes the driver AND their user login.
  // Blocked (not cascaded) if they still have assigned clients — Client.assignedDriverId
  // is a required field in the schema, so clients must be reassigned first rather than
  // silently nulled out. Also blocked if they have any delivery history, since
  // Delivery.driverId is required and deleting it would orphan invoices/inventory logs
  // tied to those deliveries.
  const [assignedClientCount, deliveryCount] = await Promise.all([
    prisma.client.count({ where: { assignedDriverId: driver.id, isActive: true } }),
    prisma.delivery.count({ where: { driverId: driver.id } }),
  ]);

  if (assignedClientCount > 0) {
    return res.status(409).json({
      error: `This driver has ${assignedClientCount} assigned client(s). Reassign clients first.`,
      assignedClientCount,
    });
  }
  if (deliveryCount > 0) {
    return res.status(409).json({
      error: `This driver has ${deliveryCount} delivery record(s) in history. Deactivate instead of deleting to preserve records.`,
      deliveryCount,
    });
  }

  await prisma.$transaction([
    prisma.driver.delete({ where: { id: driver.id } }),
    prisma.user.delete({ where: { id: driver.userId } }),
  ]);

  res.json({ message: 'Driver permanently deleted' });
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
      clients: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
      },
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
    clients: driver.clients,
  });
}

async function updateDriverCredentials(req, res) {
  const driverId = req.params.id;
  const { name, mobile, vehicleNumber, vehicleType, route, isActive, loginId, newPassword } = req.body;

  console.log('Updating driver credentials:', { driverId, loginId, hasNewPassword: !!newPassword });

  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    include: { user: true },
  });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  if (loginId && loginId !== driver.user.loginId) {
    const existing = await prisma.user.findUnique({ where: { loginId } });
    if (existing && existing.id !== driver.userId) {
      return res.status(409).json({ error: 'Login ID already taken' });
    }
  }

  const userUpdate = {
    ...(name && { name }),
    ...(mobile && { mobile }),
    ...(loginId && { loginId }),
  };

  if (newPassword && newPassword.trim() !== '') {
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    userUpdate.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: driver.userId },
      data: userUpdate,
    }),
    prisma.driver.update({
      where: { id: driverId },
      data: {
        ...(vehicleNumber && { vehicleNumber }),
        ...(vehicleType && { vehicleType }),
        ...(route && { route }),
        ...(typeof isActive === 'boolean' && { isActive }),
      },
    }),
  ]);

  const updated = await prisma.driver.findUnique({
    where: { id: driverId },
    include: {
      user: { select: { id: true, name: true, loginId: true, mobile: true, role: true } },
      clients: true,
    },
  });

  res.json({ driver: updated });
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
