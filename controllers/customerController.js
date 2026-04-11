const Customer = require('../models/Customer');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getCustomers = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.search) filter.$or = [{ name: { $regex: req.query.search, $options: 'i' } }, { email: { $regex: req.query.search, $options: 'i' } }];
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    const [customers, total] = await Promise.all([Customer.find(filter).sort(getSort(req.query, 'name', 1)).skip(skip).limit(limit), Customer.countDocuments(filter)]);
    return sendPaginated(res, customers, total, page, limit);
  } catch (err) { next(err); }
};

exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!customer) return sendError(res, 'Customer not found', 404);
    return sendSuccess(res, customer);
  } catch (err) { next(err); }
};

exports.createCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.create({ ...req.body, organization: req.organizationId, createdAt: Date.now(), updatedAt: Date.now() });
    return sendSuccess(res, customer, 'Customer created', 201);
  } catch (err) { next(err); }
};

exports.updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndUpdate({ _id: req.params.id, organization: req.organizationId }, { ...req.body, updatedAt: Date.now() }, { new: true, runValidators: true });
    if (!customer) return sendError(res, 'Customer not found', 404);
    return sendSuccess(res, customer, 'Customer updated');
  } catch (err) { next(err); }
};

exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndUpdate({ _id: req.params.id, organization: req.organizationId }, { isActive: false, updatedAt: Date.now() }, { new: true });
    if (!customer) return sendError(res, 'Customer not found', 404);
    return sendSuccess(res, null, 'Customer deactivated');
  } catch (err) { next(err); }
};
