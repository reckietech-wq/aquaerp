const { Router } = require('express');
const { createDelivery, listDeliveries, updateDelivery, deleteDelivery } = require('../controllers/deliveryController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

router.post('/', createDelivery);
router.get('/', requireAdmin, listDeliveries);
router.put('/:id', requireAdmin, updateDelivery);
router.delete('/:id', requireAdmin, deleteDelivery);

module.exports = router;
