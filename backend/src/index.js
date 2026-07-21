require('express-async-errors');
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Security headers
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Rate limit login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const authRoutes     = require('./routes/auth');
const driverRoutes   = require('./routes/drivers');
const clientRoutes   = require('./routes/clients');
const dashboardRoutes = require('./routes/dashboard');
const driverAppRoutes = require('./routes/driver');
const deliveryRoutes     = require('./routes/deliveries');
const invoiceRoutes      = require('./routes/invoices');
const monthlyBillRoutes  = require('./routes/monthlyBills');
const pdfRoutes          = require('./routes/pdf');
const whatsappRoutes     = require('./routes/whatsapp');
const reportRoutes       = require('./routes/reports');
const inventoryRoutes    = require('./routes/inventory');

const { startBillingScheduler } = require('./jobs/billingScheduler');

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',      authRoutes);
app.use('/api/drivers',   driverRoutes);
app.use('/api/clients',   clientRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/driver',    driverAppRoutes);
app.use('/api/deliveries',     deliveryRoutes);
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/monthly-bills', monthlyBillRoutes);
app.use('/api/monthly-bills', whatsappRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/inventory',     inventoryRoutes);
app.use('/api',               pdfRoutes);

// Serve generated PDFs as static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler â€” must be last
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startBillingScheduler();
});
