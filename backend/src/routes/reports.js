const { Router } = require('express');
const { getSummary } = require('../controllers/reportsController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.get('/summary', getSummary);

module.exports = router;
