const express = require('express');
const { getIssues, getIssue, createIssue } = require('../controllers/stockIssueController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getIssues)
  .post(createIssue);

router.route('/:id')
  .get(getIssue);

router.route('/:id/cancel').patch(require('../controllers/stockIssueController').cancelStockIssue);

module.exports = router;
