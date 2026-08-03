const { Router } = require('express');
const { createClient, listClients, getClient, updateClient, deleteClient, getClientPayments } = require('../controllers/clientController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.post('/', createClient);
router.get('/', listClients);
router.get('/:id', getClient);
router.get('/:id/payments', getClientPayments);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;
