const express = require('express');
const router = express.Router();
const { recordPayment, getPayments } = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getPayments).post(authorize('admin', 'manager'), recordPayment);

module.exports = router;
