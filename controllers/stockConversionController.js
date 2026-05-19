const mongoose = require('mongoose');
const StockConversion = require('../models/StockConversion');
const Inventory = require('../models/Inventory');
const StockTransaction = require('../models/StockTransaction');
const Item = require('../models/Item');
const { sendSuccess, sendError, sendPaginated } = require('../utils/response');
const { getPagination, getSort } = require('../utils/pagination');
const { getAdvancedFilter } = require('../utils/filter');

exports.getConversions = async (req, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const sort = getSort(req.query);
    const filter = { organization: req.organizationId, ...getAdvancedFilter(req.query) };

    const [conversions, total] = await Promise.all([
      StockConversion.find(filter)
        .populate('inputItems.item', 'name')
        .populate('outputItems.item', 'name')
        .populate('convertedBy', 'name email')
        .sort(sort).skip(skip).limit(limit),
      StockConversion.countDocuments(filter),
    ]);
    return sendPaginated(res, conversions, total, page, limit, 'Stock conversions fetched');
  } catch (err) { next(err); }
};

exports.getConversion = async (req, res, next) => {
  try {
    const conversion = await StockConversion.findOne({ _id: req.params.id, organization: req.organizationId })
      .populate('inputItems.item', 'name unit category')
      .populate('outputItems.item', 'name unit category')
      .populate('convertedBy', 'name');
    if (!conversion) return sendError(res, 'Stock conversion not found', 404);
    return sendSuccess(res, conversion);
  } catch (err) { next(err); }
};

exports.createConversion = async (req, res, next) => {
  try {
    const { inputItems, outputItems, conversionDate, workOrderRef, notes } = req.body;
    
    if (!inputItems || !inputItems.length) return sendError(res, 'Input items required', 400);
    if (!outputItems || !outputItems.length) return sendError(res, 'Output items required', 400);

    // 1. Atomically verify and deduct RM stock (OUT) using $gte guard
    const deductedInputs = [];
    try {
      for (const input of inputItems) {
        const qty = Number(input.quantity);
        const inv = await Inventory.findOneAndUpdate(
          { item: input.item, organization: req.organizationId, currentStock: { $gte: qty } },
          { $inc: { currentStock: -qty }, $set: { updatedAt: Date.now() } },
          { new: true }
        );
        if (!inv) {
          const itemDoc = await Item.findById(input.item).select('name');
          throw new Error(`Insufficient stock for Input Item "${itemDoc?.name || 'Unknown Item'}". Please check available quantity.`);
        }
        deductedInputs.push({ item: input.item, quantity: qty, balanceAfter: inv.currentStock });
      }
    } catch (stockErr) {
      // Rollback any already-deducted items
      for (const d of deductedInputs) {
        await Inventory.findOneAndUpdate(
          { item: d.item, organization: req.organizationId },
          { $inc: { currentStock: d.quantity } }
        );
      }
      return sendError(res, stockErr.message, 400);
    }

    // 2. Add FG stock (IN)
    const addedOutputs = [];
    for (const output of outputItems) {
      const qty = Number(output.quantity);
      const inv = await Inventory.findOneAndUpdate(
        { item: output.item, organization: req.organizationId },
        { $inc: { currentStock: qty }, $set: { updatedAt: Date.now() } },
        { new: true, upsert: true }
      );
      addedOutputs.push({ item: output.item, quantity: qty, balanceAfter: inv.currentStock });
    }

    // 3. Create Stock Conversion document
    const conversion = await StockConversion.create({
      organization: req.organizationId,
      inputItems,
      outputItems,
      conversionDate: conversionDate || Date.now(),
      workOrderRef,
      notes,
      convertedBy: req.user.id,
      status: 'Converted',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // 4. Record stock transactions
    for (const d of deductedInputs) {
      await StockTransaction.create({
        organization: req.organizationId,
        item: d.item,
        type: 'OUT',
        quantity: d.quantity,
        balanceAfter: d.balanceAfter,
        refModel: 'StockConversion',
        refId: conversion._id,
        note: `Stock Conversion (Consumed) - ${conversion.conversionNumber}`,
        createdBy: req.user.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    for (const d of addedOutputs) {
      await StockTransaction.create({
        organization: req.organizationId,
        item: d.item,
        type: 'IN',
        quantity: d.quantity,
        balanceAfter: d.balanceAfter,
        refModel: 'StockConversion',
        refId: conversion._id,
        note: `Stock Conversion (Produced) - ${conversion.conversionNumber}`,
        createdBy: req.user.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return sendSuccess(res, conversion, 'Stock converted successfully', 201);
  } catch (err) {
    return sendError(res, 'Failed to create stock conversion. Please try again.', 400);
  }
};

exports.cancelConversion = async (req, res, next) => {
  try {
    const conversion = await StockConversion.findOne({ _id: req.params.id, organization: req.organizationId });
    if (!conversion) return sendError(res, 'Stock conversion not found', 404);
    if (conversion.status === 'Cancelled') return sendError(res, 'Already cancelled', 400);

    // 1. Verify we can deduct FG stock (must have enough stock to reverse)
    for (const output of conversion.outputItems) {
      const inv = await Inventory.findOne({ item: output.item, organization: req.organizationId });
      if (!inv || inv.currentStock < output.quantity) {
        const itemDoc = await Item.findById(output.item).select('name');
        return sendError(res, `Cannot cancel: Insufficient stock of Output Item "${itemDoc?.name || 'Unknown'}" to reverse this conversion.`, 400);
      }
    }

    // 2. Perform reversals
    if (conversion.status === 'Converted') {
      // Reverse FG (deduct)
      for (const output of conversion.outputItems) {
        let inv = await Inventory.findOneAndUpdate(
          { item: output.item, organization: req.organizationId },
          { $inc: { currentStock: -output.quantity }, $set: { updatedAt: Date.now() } },
          { new: true }
        );

        if (inv) {
          await StockTransaction.create({
            organization: req.organizationId,
            item: output.item,
            type: 'OUT',
            quantity: output.quantity,
            balanceAfter: inv.currentStock,
            refModel: 'StockConversion',
            refId: conversion._id,
            note: `Cancelled Conversion (Reversed FG) ${conversion.conversionNumber}`,
            createdBy: req.user._id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }

      // Reverse RM (add back)
      for (const input of conversion.inputItems) {
        let inv = await Inventory.findOneAndUpdate(
          { item: input.item, organization: req.organizationId },
          { $inc: { currentStock: input.quantity }, $set: { updatedAt: Date.now() } },
          { new: true, upsert: true }
        );

        if (inv) {
          await StockTransaction.create({
            organization: req.organizationId,
            item: input.item,
            type: 'IN',
            quantity: input.quantity,
            balanceAfter: inv.currentStock,
            refModel: 'StockConversion',
            refId: conversion._id,
            note: `Cancelled Conversion (Reversed RM) ${conversion.conversionNumber}`,
            createdBy: req.user._id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    conversion.status = 'Cancelled';
    conversion.updatedAt = Date.now();
    await conversion.save();
    return sendSuccess(res, conversion, 'Stock Conversion Cancelled');
  } catch(err) { next(err); }
};
