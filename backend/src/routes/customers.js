const { Router } = require('express');
const { listCustomers, getCustomerDetail, addLocation } = require('../controllers/customerController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.get('/', listCustomers);
router.get('/:id', getCustomerDetail);
router.post('/:customerId/locations', addLocation);

module.exports = router;
