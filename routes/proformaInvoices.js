const express = require('express');
const router = express.Router();
const {
  getProformaInvoices,
  getProformaInvoice,
  createProformaInvoice,
  updateProformaInvoice,
  convertToSalesInvoice
} = require('../controllers/proformaController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getProformaInvoices).post(authorize('admin', 'manager'), createProformaInvoice);
router.route('/:id').get(getProformaInvoice).put(authorize('admin', 'manager'), updateProformaInvoice);
router.post('/:id/convert', authorize('admin', 'manager'), convertToSalesInvoice);

module.exports = router;
