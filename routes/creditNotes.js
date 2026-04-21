const express = require('express');
const router = express.Router();
const { getCreditNotes, getCreditNote, createCreditNote, updateCreditNote, getReferenceDocumentItems } = require('../controllers/creditNoteController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getCreditNotes).post(authorize('admin', 'manager'), createCreditNote);
router.route('/ref-items').get(getReferenceDocumentItems);
router.route('/:id').get(getCreditNote).put(authorize('admin', 'manager'), updateCreditNote);
router.route('/:id/cancel').patch(authorize('admin', 'manager'), require('../controllers/creditNoteController').cancelCreditNote);

module.exports = router;
