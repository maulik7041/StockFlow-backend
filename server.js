require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const inventoryRoutes = require('./routes/inventory');
const vendorRoutes = require('./routes/vendors');
const customerRoutes = require('./routes/customers');
const purchaseOrderRoutes = require('./routes/purchaseOrders');
const grnRoutes = require('./routes/grn');
const salesRoutes = require('./routes/sales');
const reportRoutes = require('./routes/reports');
const organizationRoutes = require('./routes/organizations');
const stockIssueRoutes = require('./routes/stockIssueRoutes');
const proformaInvoiceRoutes = require('./routes/proformaInvoices');
const paymentRoutes = require('./routes/payments');
const creditNoteRoutes = require('./routes/creditNotes');
const debitNoteRoutes = require('./routes/debitNotes');
const purchaseBillRoutes = require('./routes/purchaseBills');

// Connect to DB
connectDB();

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/grn', grnRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/stock-issues', stockIssueRoutes);
app.use('/api/proforma-invoices', proformaInvoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/debit-notes', debitNoteRoutes);
app.use('/api/purchase-bills', purchaseBillRoutes);

// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BizzOps API running on http://localhost:${PORT}`);
});

module.exports = app;
