const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Deactivating a driver should take effect immediately, not just block new
  // logins — re-check on every request (cheap: a single indexed lookup) so a
  // driver deactivated mid-session (e.g. while still holding a 7-day token)
  // loses access right away, including to read-only endpoints like inventory
  // that don't otherwise go through requireDriver.
  if (payload.role === 'DRIVER') {
    try {
      const driver = await prisma.driver.findUnique({ where: { userId: payload.id } });
      if (!driver || !driver.isActive) {
        return res.status(401).json({ error: 'Account deactivated' });
      }
    } catch (err) {
      return next(err);
    }
  }

  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function requireDriver(req, res, next) {
  if (req.user?.role !== 'DRIVER') {
    return res.status(403).json({ error: 'Driver access required' });
  }
  const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
  if (!driver || !driver.isActive) {
    return res.status(401).json({ error: 'Account deactivated' });
  }
  next();
}

module.exports = { verifyToken, requireAdmin, requireDriver };
