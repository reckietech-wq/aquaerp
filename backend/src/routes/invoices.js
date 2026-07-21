const { Router } = require('express');
const {
  generateInvoice,
  getInvoiceById,
  getClientInvoices,
  markInvoicePaid,
  getAllInvoices,
  getInvoiceStats,
} = require('../controllers/invoiceController');
const { verifyToken, requireAdmin, requireDriver } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

// Static paths first — must come before /:invoiceId
router.get('/',                        requireAdmin,  getAllInvoices);
router.get('/stats',                   requireAdmin,  getInvoiceStats);
router.get('/client/:clientId',                       getClientInvoices);
router.post('/generate',               requireDriver, generateInvoice);

// Dynamic paths last
router.get('/:invoiceId',                             getInvoiceById);
router.put('/:invoiceId/mark-paid',    requireAdmin,  markInvoicePaid);

module.exports = router;
