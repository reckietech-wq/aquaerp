const { Router } = require('express');
const {
  createDriver,
  listDrivers,
  getDriver,
  updateDriver,
  deleteDriver,
  resetPassword,
  getDriverWithCredentials,
  updateDriverCredentials,
} = require('../controllers/driverController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

router.post('/', createDriver);
router.get('/', listDrivers);
router.get('/:id', getDriver);
router.put('/:id', updateDriver);
router.put('/:id/reset-password', resetPassword);
router.get('/:id/credentials', getDriverWithCredentials);
router.put('/:id/credentials', updateDriverCredentials);
router.delete('/:id', deleteDriver);

module.exports = router;
