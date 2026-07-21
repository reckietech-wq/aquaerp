const { Router } = require('express');
const { createDelivery } = require('../controllers/deliveryController');
const { verifyToken } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

router.post('/', createDelivery);

module.exports = router;
