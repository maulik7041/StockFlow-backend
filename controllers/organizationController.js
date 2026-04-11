const Organization = require('../models/Organization');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/response');

// @desc  Get current organization
// @route GET /api/organization
exports.getOrg = async (req, res, next) => {
  try {
    const org = await Organization.findById(req.organizationId).populate('owner', 'name email');
    if (!org) return sendError(res, 'Organization not found', 404);
    return sendSuccess(res, org);
  } catch (err) {
    next(err);
  }
};

// @desc  Update organization settings
// @route PUT /api/organization
exports.updateOrg = async (req, res, next) => {
  try {
    const allowed = ['name', 'settings'];
    const updates = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const org = await Organization.findByIdAndUpdate(req.organizationId, { ...updates, updatedAt: Date.now() }, { new: true, runValidators: true });
    if (!org) return sendError(res, 'Organization not found', 404);
    return sendSuccess(res, org, 'Organization updated');
  } catch (err) {
    next(err);
  }
};

// @desc  List all members of the organization
// @route GET /api/organization/members
exports.getMembers = async (req, res, next) => {
  try {
    const members = await User.find({ organization: req.organizationId })
      .select('-password')
      .sort({ createdAt: 1 });
    return sendSuccess(res, members, 'Members fetched');
  } catch (err) {
    next(err);
  }
};

// @desc  Invite (create) a new user in the same organization
// @route POST /api/organization/invite
exports.inviteUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return sendError(res, 'name, email and password are required', 400);

    const exists = await User.findOne({ email });
    if (exists) return sendError(res, 'Email already registered', 400);

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'viewer',
      organization: req.organizationId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return sendSuccess(res, { id: user._id, name: user.name, email: user.email, role: user.role }, 'User invited', 201);
  } catch (err) {
    next(err);
  }
};

// @desc  Update member role or active status
// @route PUT /api/organization/members/:id
exports.updateMember = async (req, res, next) => {
  try {
    const member = await User.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!member) return sendError(res, 'Member not found', 404);

    // Prevent demoting/deactivating yourself
    if (member._id.equals(req.user._id)) return sendError(res, 'Cannot modify your own account this way', 400);

    if (req.body.role) member.role = req.body.role;
    if (req.body.isActive !== undefined) member.isActive = req.body.isActive;
    member.updatedAt = Date.now();
    await member.save();

    return sendSuccess(res, { id: member._id, name: member.name, role: member.role, isActive: member.isActive }, 'Member updated');
  } catch (err) {
    next(err);
  }
};
