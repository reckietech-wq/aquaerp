const { Router } = require('express');
const { createClient, listClients, getClient, updateClient, deleteClient } = require('../controllers/clientController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.post('/', createClient);
router.get('/', listClients);
router.get('/:id', getClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;
