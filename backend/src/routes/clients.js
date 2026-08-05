const { Router } = require('express');
const { createClient, listClients, getClient, updateClient, deleteClient, getClientPayments } = require('../controllers/clientController');
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
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;
