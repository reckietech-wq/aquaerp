const { Router } = require('express');
const {
  getInventoryHandler,
  getLogs,
  adminRestock,
  adminDispatchEmpties,
  manualAdjustment,
} = require('../controllers/inventoryController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken);

// Static paths before any dynamic ones
router.get('/',                   getInventoryHandler);      // both roles
router.get('/logs',               requireAdmin, getLogs);
router.post('/restock',           requireAdmin, adminRestock);
router.post('/dispatch-empties',  requireAdmin, adminDispatchEmpties);
router.post('/adjust',            requireAdmin, manualAdjustment);

module.exports = router;
