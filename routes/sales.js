const express = require('express');
const router = express.Router();
const { getSales, getSale, createSale, updateSale } = require('../controllers/salesController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getSales).post(authorize('admin', 'manager'), createSale);
router.route('/:id').get(getSale).put(authorize('admin', 'manager'), updateSale);

module.exports = router;
