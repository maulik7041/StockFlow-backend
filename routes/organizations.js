const express = require('express');
const router = express.Router();
const { getOrg, updateOrg, getMembers, inviteUser, updateMember } = require('../controllers/organizationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.route('/').get(getOrg).put(authorize('admin'), updateOrg);
router.route('/members').get(getMembers).post(authorize('admin'), inviteUser);
router.route('/members/:id').put(authorize('admin'), updateMember);

module.exports = router;
