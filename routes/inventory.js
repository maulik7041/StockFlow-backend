const express = require('express');
const router = express.Router();
const { getInventory, adjustStock, getTransactions } = require('../controllers/inventoryController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/', getInventory);
router.get('/transactions', getTransactions);
router.put('/adjust', authorize('admin', 'manager'), adjustStock);

module.exports = router;
