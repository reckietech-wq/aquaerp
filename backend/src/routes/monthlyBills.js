const { Router } = require('express');
const {
  generateMonthlyBills,
  getMonthlyBills,
  getSingleBill,
  markAsSent,
  markAsPaid,
  bulkMarkSent,
} = require('../controllers/monthlyBillController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

// bulk-mark-sent must come before /:id to avoid route ambiguity
router.put('/bulk-mark-sent', bulkMarkSent);

router.post('/generate',         generateMonthlyBills);
router.get('/',                  getMonthlyBills);
router.get('/:id',               getSingleBill);
router.put('/:id/mark-sent',     markAsSent);
router.put('/:id/mark-paid',     markAsPaid);

module.exports = router;
