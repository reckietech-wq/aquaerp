const { Router } = require('express');
const { getSummary, getClientSummary } = require('../controllers/reportsController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.get('/summary', getSummary);
router.get('/client-summary', getClientSummary);

module.exports = router;
