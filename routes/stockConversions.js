const express = require('express');
const router = express.Router();
const stockConversionController = require('../controllers/stockConversionController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', stockConversionController.getConversions);
router.get('/:id', stockConversionController.getConversion);
router.post('/', stockConversionController.createConversion);
router.patch('/:id/cancel', stockConversionController.cancelConversion);

module.exports = router;
