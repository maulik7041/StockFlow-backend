const getPagination = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const getSort = (query, defaultField = 'createdAt', defaultOrder = -1) => {
  const sortField = query.sortBy || defaultField;
  const sortOrder = query.sortOrder === 'asc' ? 1 : defaultOrder;
  return { [sortField]: sortOrder };
};

module.exports = { getPagination, getSort };
