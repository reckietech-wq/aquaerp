const { Router } = require('express');
const multer = require('multer');
const { getSettings, uploadSignature, uploadStamp } = require('../controllers/settingsController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// multer's own errors (oversized file, bad type) don't carry a `.status`,
// which would otherwise fall through errorHandler's 500 branch and hide the
// real reason — surface them as 400s here instead.
function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    next();
  });
}

const router = Router();
router.use(verifyToken);

router.get('/', getSettings); // both roles — used to render the PDF/UI

router.use(requireAdmin);
router.post('/signature', uploadImage, uploadSignature);
router.post('/stamp',     uploadImage, uploadStamp);

module.exports = router;
