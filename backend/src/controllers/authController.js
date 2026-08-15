const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

async function login(req, res) {
  const { loginId, password } = req.body;
  if (!loginId || !password) {
    return res.status(400).json({ error: 'loginId and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { loginId } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: user.id } });
    if (!driver || !driver.isActive) {
      return res.status(401).json({ error: 'Account deactivated' });
    }
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role, loginId: user.loginId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, user: { id: user.id, name: user.name, role: user.role, loginId: user.loginId } });
}

async function getMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, mobile: true, role: true, loginId: true, createdAt: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}

module.exports = { login, getMe };
