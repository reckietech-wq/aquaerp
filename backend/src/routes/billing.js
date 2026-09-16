const { Router } = require('express');
const {
  getBilling,
  getClientBilling,
  getBillingPDF,
  getBillingWhatsAppLink,
  bulkBillingWhatsAppLinks,
  markMonthPaid,
} = require('../controllers/billingController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

// Static paths first — must come before /:clientId
router.get('/',                       getBilling);
router.post('/bulk-whatsapp-links',   bulkBillingWhatsAppLinks);

// Dynamic paths
router.get('/:clientId',              getClientBilling);
router.get('/:clientId/pdf',          getBillingPDF);
router.get('/:clientId/whatsapp-link', getBillingWhatsAppLink);
router.put('/:clientId/mark-paid',    markMonthPaid);

module.exports = router;
