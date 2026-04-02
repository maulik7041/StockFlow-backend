const Vendor = require('../models/Vendor');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getVendors = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };
    if (req.query.search) filter.$or = [{ name: { $regex: req.query.search, $options: 'i' } }, { email: { $regex: req.query.search, $options: 'i' } }];
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    const [vendors, total] = await Promise.all([Vendor.find(filter).sort(getSort(req.query, 'name', 1)).skip(skip).limit(limit), Vendor.countDocuments(filter)]);
    return sendPaginated(res, vendors, total, page, limit);
  } catch (err) { next(err); }
};

exports.getVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!vendor) return sendError(res, 'Vendor not found', 404);
    return sendSuccess(res, vendor);
  } catch (err) { next(err); }
};

exports.createVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.create({ ...req.body, organization: req.organizationId });
    return sendSuccess(res, vendor, 'Vendor created', 201);
  } catch (err) { next(err); }
};

exports.updateVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOneAndUpdate({ _id: req.params.id, organization: req.organizationId }, req.body, { new: true, runValidators: true });
    if (!vendor) return sendError(res, 'Vendor not found', 404);
    return sendSuccess(res, vendor, 'Vendor updated');
  } catch (err) { next(err); }
};

exports.deleteVendor = async (req, res, next) => {
  try {
    const vendor = await Vendor.findOneAndUpdate({ _id: req.params.id, organization: req.organizationId }, { isActive: false }, { new: true });
    if (!vendor) return sendError(res, 'Vendor not found', 404);
    return sendSuccess(res, null, 'Vendor deactivated');
  } catch (err) { next(err); }
};
