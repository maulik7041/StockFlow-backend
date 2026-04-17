// backend/utils/filter.js
const mongoose = require('mongoose');

/**
 * Parses advanced frontend table filters into a mongoose query object
 * Expected format of query._filters: JSON stringified object
 * { "fieldName": { "type": "text", "val": "abc" }, "amount": { "type": "number", "min": 10 } }
 */
const getAdvancedFilter = (query) => {
  if (!query._filters) return {};
  
  try {
    const parsed = JSON.parse(query._filters);
    const filter = {};
    
    for (const [key, config] of Object.entries(parsed)) {
      if (!config) continue;
      
      if (config.type === 'text' && config.val) {
        filter[key] = { $regex: config.val, $options: 'i' };
      } 
      else if (config.type === 'options' && config.val && config.val.length > 0) {
        filter[key] = { $in: config.val };
      }
      else if (config.type === 'number') {
        filter[key] = {};
        if (config.min !== undefined && config.min !== '') filter[key].$gte = Number(config.min);
        if (config.max !== undefined && config.max !== '') filter[key].$lte = Number(config.max);
        if (Object.keys(filter[key]).length === 0) delete filter[key];
      } 
      else if (config.type === 'date') {
        filter[key] = {};
        if (config.start) filter[key].$gte = new Date(config.start);
        if (config.end) {
          const d = new Date(config.end);
          d.setHours(23, 59, 59, 999);
          filter[key].$lte = d;
        }
        if (Object.keys(filter[key]).length === 0) delete filter[key];
      }
      else if (config.type === 'exact' && config.val) {
        filter[key] = config.val;
      }
      else if (config.type === 'financialYear' && Array.isArray(config.val) && config.val.length > 0) {
        const ranges = config.val.map(fy => {
          const startYear = parseInt(fy.split('-')[0]);
          const start = new Date(startYear, 3, 1, 0, 0, 0, 0);
          const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
          return { [key]: { $gte: start, $lte: end } };
        });
        
        if (ranges.length === 1) {
          filter[key] = Object.values(ranges[0])[0];
        } else {
          if (!filter.$and) filter.$and = [];
          filter.$and.push({ $or: ranges });
        }
      }
    }
    
    return filter;
  } catch (error) {
    console.warn('Failed to parse advanced filters', error);
    return {};
  }
};

module.exports = { getAdvancedFilter };
