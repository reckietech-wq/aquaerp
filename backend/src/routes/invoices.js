const { Router } = require('express');
const {
  generateInvoice,
  getInvoiceById,
  getClientInvoices,
  getClientStatement,
  markInvoicePaid,
  recordPayment,
  setInvoiceStatus,
  deleteInvoice,
  getAllInvoices,
  getInvoicesByClient,
  getInvoiceStats,
} = require('../controllers/invoiceController');
const { verifyToken, requireAdmin, requireDriver } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

// Static paths first — must come before /:invoiceId
router.get('/',                        requireAdmin,  getAllInvoices);
router.get('/by-client',               requireAdmin,  getInvoicesByClient);
router.get('/stats',                   requireAdmin,  getInvoiceStats);
router.get('/client/:clientId',                       getClientInvoices);
router.post('/generate',               requireDriver, generateInvoice);

// Dynamic paths last
router.get('/:invoiceId',                             getInvoiceById);
router.put('/:invoiceId/mark-paid',                   markInvoicePaid);
router.put('/:invoiceId/record-payment',              recordPayment);
router.put('/:invoiceId/status',       requireAdmin,  setInvoiceStatus);
router.delete('/:invoiceId',           requireAdmin,  deleteInvoice);

module.exports = router;
