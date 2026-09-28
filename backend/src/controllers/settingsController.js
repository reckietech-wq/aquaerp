const fs   = require('fs');
const path = require('path');
const prisma = require('../lib/prisma');

const ASSETS_DIR = path.join(__dirname, '../../assets');

function publicPath(filename) {
  return `/assets/${filename}`;
}

// Cache-busting query string appended to the URL a client reads — the
// filename is fixed per kind (re-uploading replaces it in place), so without
// this the browser would keep showing a stale cached image after a replace.
function withVersion(value, updatedAt) {
  return value ? `${value}?v=${new Date(updatedAt).getTime()}` : null;
}

async function getSettings(req, res) {
  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } });
  res.json({
    signaturePath: withVersion(settings?.signaturePath, settings?.updatedAt),
    stampPath: withVersion(settings?.stampPath, settings?.updatedAt),
  });
}

// Shared by the signature/stamp upload endpoints — saves the uploaded file
// under backend/assets/ (fixed filename per kind, so re-uploading replaces
// the old one in place) and upserts the single settings row.
async function saveUpload(req, res, { kind, field }) {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });

  const ext = path.extname(req.file.originalname) || '.png';
  const filename = `${kind}${ext}`;
  const destPath = path.join(ASSETS_DIR, filename);

  fs.writeFileSync(destPath, req.file.buffer);

  const value = publicPath(filename);
  const settings = await prisma.businessSettings.upsert({
    where: { id: 1 },
    create: { id: 1, [field]: value, updatedBy: req.user.loginId ?? req.user.id },
    update: { [field]: value, updatedBy: req.user.loginId ?? req.user.id },
  });

  res.json({ message: `${kind} uploaded`, [field]: withVersion(settings[field], settings.updatedAt) });
}

async function uploadSignature(req, res) {
  await saveUpload(req, res, { kind: 'signature', field: 'signaturePath' });
}

async function uploadStamp(req, res) {
  await saveUpload(req, res, { kind: 'stamp', field: 'stampPath' });
}

module.exports = { getSettings, uploadSignature, uploadStamp };
