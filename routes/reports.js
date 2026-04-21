const express = require('express');
const router = express.Router();
const { stockReport, purchaseReport, salesReport, profitReport, dashboardStats, getOutstandingReport } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/dashboard', dashboardStats);
router.get('/stock', stockReport);
router.get('/purchases', purchaseReport);
router.get('/sales', salesReport);
router.get('/profit', profitReport);
router.get('/outstanding', getOutstandingReport);

module.exports = router;
