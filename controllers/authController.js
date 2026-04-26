const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { sendSuccess, sendError } = require('../utils/response');

const generateToken = (userId, organizationId) =>
  jwt.sign({ id: userId, organizationId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

// @desc  Register new organization + admin user
// @route POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { orgName, name, email, password, gstNumber, address } = req.body;
    if (!orgName) return sendError(res, 'Organization name is required', 400);



    // Create organization
    const org = await Organization.create({ name: orgName, gstNumber, address, createdAt: Date.now(), updatedAt: Date.now() });

    // Create admin user linked to org
    const user = await User.create({ name, email, password, role: 'admin', organization: org._id, createdAt: Date.now(), updatedAt: Date.now() });

    // Set org owner
    org.owner = user._id;
    org.updatedAt = Date.now();
    await org.save();

    const token = generateToken(user._id, org._id);
    return sendSuccess(
      res,
      {
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, modules: user.modules || [] },
        org: { id: org._id, name: org.name, slug: org.slug, plan: org.plan, gstNumber: org.gstNumber, address: org.address, settings: org.settings },
      },
      'Organization and admin account created',
      201
    );
  } catch (err) {
    next(err);
  }
};

// @desc  Login
// @route POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password, organizationId } = req.body;
    if (!email || !password) return sendError(res, 'Please provide email and password', 400);

    const users = await User.find({ email }).select('+password').populate('organization', 'name slug plan isActive settings gstNumber address');
    if (!users || users.length === 0) return sendError(res, 'Invalid email or password', 401);

    const validUsers = [];
    for (const u of users) {
      if (await u.matchPassword(password)) {
        if (u.isActive && u.organization && u.organization.isActive) {
          validUsers.push(u);
        }
      }
    }

    if (validUsers.length === 0) return sendError(res, 'Invalid email, password, or inactive account', 401);

    let selectedUser;

    if (organizationId) {
      selectedUser = validUsers.find(u => u.organization._id.toString() === organizationId);
      if (!selectedUser) return sendError(res, 'Invalid organization selected', 401);
    } else {
      if (validUsers.length === 1) {
        selectedUser = validUsers[0];
      } else {
        return res.json({
          success: true,
          data: {
            requireOrgSelection: true,
            organizations: validUsers.map(u => ({
              organizationId: u.organization._id,
              organizationName: u.organization.name
            }))
          }
        });
      }
    }

    const token = generateToken(selectedUser._id, selectedUser.organization._id);
    return sendSuccess(res, {
      token,
      user: { id: selectedUser._id, name: selectedUser.name, email: selectedUser.email, role: selectedUser.role, modules: selectedUser.modules || [] },
      org: {
        id: selectedUser.organization._id,
        name: selectedUser.organization.name,
        slug: selectedUser.organization.slug,
        plan: selectedUser.organization.plan,
        gstNumber: selectedUser.organization.gstNumber,
        address: selectedUser.organization.address,
        settings: selectedUser.organization.settings,
      },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// @desc  Get current user
// @route GET /api/auth/me
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id).populate('organization', 'name slug plan settings gstNumber address');
  return sendSuccess(res, {
    user: { id: user._id, name: user.name, email: user.email, role: user.role, modules: user.modules || [] },
    org: user.organization,
  }, 'User fetched');
};

// @desc  Get all users in org (admin only)
// @route GET /api/auth/users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ organization: req.organizationId }).select('-password').sort({ createdAt: -1 });
    return sendSuccess(res, users, 'Users fetched');
  } catch (err) {
    next(err);
  }
};
