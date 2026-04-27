const express = require('express');
const router = express.Router();
const { recordPayment, recordBulkPayment, getPayments, getUnpaidDocuments, deletePayment } = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getPayments).post(authorize('admin', 'manager'), recordPayment);
router.route('/bulk').post(authorize('admin', 'manager'), recordBulkPayment);
router.route('/unpaid-documents').get(getUnpaidDocuments);
router.route('/:id').delete(authorize('admin', 'manager'), deletePayment);

module.exports = router;
