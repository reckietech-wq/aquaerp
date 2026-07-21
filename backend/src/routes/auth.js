const { Router } = require('express');
const { login, getMe } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

const router = Router();

router.post('/login', login);
router.get('/me', verifyToken, getMe);

module.exports = router;
