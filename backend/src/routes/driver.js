const { Router } = require('express');
const { getMyClients, getSummary } = require('../controllers/driverDashController');
const { verifyToken, requireDriver } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireDriver);

router.get('/clients', getMyClients);
router.get('/summary', getSummary);

module.exports = router;
