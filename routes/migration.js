const router = require('express').Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const mc = require('../controllers/migrationController');

// Multer in-memory storage (max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
    }
  },
});

router.use(protect);

router.get('/templates/:entity', mc.downloadTemplate);
router.post('/validate', upload.single('file'), mc.validate);
router.post('/execute', upload.single('file'), mc.execute);
router.get('/status/:batchId', mc.getStatus);
router.post('/rollback/:batchId', mc.rollback);
router.get('/history', mc.getHistory);

module.exports = router;
