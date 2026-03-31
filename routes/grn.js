const express = require('express');
const router = express.Router();
const { getGRNs, getGRN, createGRN } = require('../controllers/grnController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getGRNs).post(authorize('admin', 'manager'), createGRN);
router.route('/:id').get(getGRN);

module.exports = router;
