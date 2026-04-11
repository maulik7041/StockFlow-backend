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
    const { orgName, name, email, password } = req.body;
    if (!orgName) return sendError(res, 'Organization name is required', 400);

    // Check email is not taken
    const exists = await User.findOne({ email });
    if (exists) return sendError(res, 'Email already registered', 400);

    // Create organization
    const org = await Organization.create({ name: orgName, createdAt: Date.now(), updatedAt: Date.now() });

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
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        org: { id: org._id, name: org.name, slug: org.slug, plan: org.plan },
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
    const { email, password } = req.body;
    if (!email || !password) return sendError(res, 'Please provide email and password', 400);

    const user = await User.findOne({ email }).select('+password').populate('organization', 'name slug plan isActive');
    if (!user || !(await user.matchPassword(password))) {
      return sendError(res, 'Invalid credentials', 401);
    }
    if (!user.isActive) return sendError(res, 'Account deactivated', 403);
    if (!user.organization?.isActive) return sendError(res, 'Organization is inactive', 403);

    const token = generateToken(user._id, user.organization._id);
    return sendSuccess(res, {
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      org: {
        id: user.organization._id,
        name: user.organization.name,
        slug: user.organization.slug,
        plan: user.organization.plan,
      },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// @desc  Get current user
// @route GET /api/auth/me
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id).populate('organization', 'name slug plan settings');
  return sendSuccess(res, {
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
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
