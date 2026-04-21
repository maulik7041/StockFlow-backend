const express = require('express');
const router = express.Router();
const { getPurchaseBills, getPurchaseBill, createPurchaseBill, updatePurchaseBill, cancelPurchaseBill } = require('../controllers/purchaseBillController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getPurchaseBills).post(authorize('admin', 'manager'), createPurchaseBill);
router.route('/:id').get(getPurchaseBill).put(authorize('admin', 'manager'), updatePurchaseBill);
router.patch('/:id/cancel', authorize('admin', 'manager'), cancelPurchaseBill);

module.exports = router;
