const express = require('express');
const router = express.Router();
const { getDebitNotes, getDebitNote, createDebitNote, updateDebitNote, getReferenceDocumentItems } = require('../controllers/debitNoteController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getDebitNotes).post(authorize('admin', 'manager'), createDebitNote);
router.route('/ref-items').get(getReferenceDocumentItems);
router.route('/:id').get(getDebitNote).put(authorize('admin', 'manager'), updateDebitNote);
router.route('/:id/cancel').patch(authorize('admin', 'manager'), require('../controllers/debitNoteController').cancelDebitNote);

module.exports = router;
