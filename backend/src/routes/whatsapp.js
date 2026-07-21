const { Router } = require('express');
const { getWhatsAppLink, bulkWhatsAppLinks } = require('../controllers/whatsappController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = Router();
router.use(verifyToken, requireAdmin);

// bulk must come before /:id
router.post('/bulk-whatsapp-links',      bulkWhatsAppLinks);
router.get('/:id/whatsapp-link',         getWhatsAppLink);

module.exports = router;
