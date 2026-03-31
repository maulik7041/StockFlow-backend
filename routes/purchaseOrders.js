const express = require('express');
const router = express.Router();
const { getPOs, getPO, createPO, updatePO, cancelPO } = require('../controllers/purchaseOrderController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getPOs).post(authorize('admin', 'manager'), createPO);
router.route('/:id').get(getPO).put(authorize('admin', 'manager'), updatePO);
router.patch('/:id/cancel', authorize('admin', 'manager'), cancelPO);

module.exports = router;
