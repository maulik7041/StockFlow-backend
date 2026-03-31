const express = require('express');
const router = express.Router();
const { getVendors, getVendor, createVendor, updateVendor, deleteVendor } = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getVendors).post(authorize('admin', 'manager'), createVendor);
router.route('/:id').get(getVendor).put(authorize('admin', 'manager'), updateVendor).delete(authorize('admin'), deleteVendor);

module.exports = router;
