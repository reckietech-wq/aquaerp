const { Router } = require('express');
const { getStats, getRecentDeliveries } = require('../controllers/dashboardController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.get('/stats', getStats);
router.get('/recent-deliveries', getRecentDeliveries);

module.exports = router;
