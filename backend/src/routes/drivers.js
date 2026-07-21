const { Router } = require('express');
const { createDriver, listDrivers, getDriver, updateDriver, deleteDriver } = require('../controllers/driverController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.post('/', createDriver);
router.get('/', listDrivers);
router.get('/:id', getDriver);
router.put('/:id', updateDriver);
router.delete('/:id', deleteDriver);

module.exports = router;
