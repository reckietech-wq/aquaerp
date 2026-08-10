const { Router } = require('express');
const {
  createClient, listClients, getClient, updateClient, deleteClient, getClientPayments, deletePayment,
  addHistoricalRecord, getClientHistoricalRecords, deleteHistoricalRecord, getClientSummary,
} = require('../controllers/clientController');
const { getClientStatement } = require('../controllers/invoiceController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

// Consolidated statement — admin or the client's assigned driver (ownership
// check happens inside the controller), so this must skip requireAdmin.
router.get('/:clientId/statement', getClientStatement);

router.use(requireAdmin);

router.post('/', createClient);
router.get('/', listClients);
router.get('/:id', getClient);
router.get('/:id/payments', getClientPayments);
router.delete('/:id/payments/:paymentId', deletePayment);
router.get('/:clientId/summary', getClientSummary);
router.post('/:clientId/historical-record', addHistoricalRecord);
router.get('/:clientId/historical-record', getClientHistoricalRecords);
router.delete('/:clientId/historical-record/:invoiceId', deleteHistoricalRecord);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;
