const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendError } = require('../utils/response');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return sendError(res, 'Not authorized — no token', 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return sendError(res, 'User not found', 401);
    if (!req.user.isActive) return sendError(res, 'Account deactivated', 403);

    // Attach organizationId from token (authoritative source)
    req.organizationId = decoded.organizationId;
    next();
  } catch (err) {
    return sendError(res, 'Not authorized — invalid token', 401);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return sendError(res, `Role '${req.user.role}' is not authorized for this action`, 403);
    }
    next();
  };
};

module.exports = { protect, authorize };
