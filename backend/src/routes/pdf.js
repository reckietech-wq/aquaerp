const { Router }   = require('express');
const fs            = require('fs');
const path          = require('path');
const prisma        = require('../lib/prisma');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { generateMonthlyInvoicePDF } = require('../services/pdfService');

const router = Router();
router.use(verifyToken, requireAdmin);

router.get('/monthly-bills/:id/pdf', async (req, res) => {
  const { id } = req.params;

  const bill = await prisma.monthlyBill.findUnique({
    where:  { id },
    select: { id: true, pdfPath: true, clientId: true, month: true, year: true },
  });

  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  // Serve cached file if it exists on disk
  let filePath = bill.pdfPath;
  if (!filePath || !fs.existsSync(filePath)) {
    filePath = await generateMonthlyInvoicePDF(id);
  }

  const fileName = path.basename(filePath);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
