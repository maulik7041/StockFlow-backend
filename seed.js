require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('./config/db')

const Organization = require('./models/Organization')
const User = require('./models/User')
const Item = require('./models/Item')
const Inventory = require('./models/Inventory')
const Vendor = require('./models/Vendor')
const Customer = require('./models/Customer')
const StockIssue = require('./models/StockIssue')
const StockTransaction = require('./models/StockTransaction')

const seed = async () => {
  await connectDB()
  console.log('🌱 Seeding database...')

  // Create org
  let org = await Organization.findOne({ slug: 'demo-company' })
  if (!org) {
    org = await Organization.create({ name: 'Demo Company', plan: 'pro' })
    console.log('✅ Organization created: Demo Company')
  } else {
    console.log('ℹ️  Organization already exists')
  }

  // Admin user
  let admin = await User.findOne({ email: 'admin@bizzops.com' })
  if (!admin) {
    admin = await User.create({ name: 'Admin User', email: 'admin@bizzops.com', password: 'admin123', role: 'admin', organization: org._id })
    org.owner = admin._id
    await org.save()
    console.log('✅ Admin: admin@bizzops.com / admin123')
  }

  // Manager user
  if (!(await User.findOne({ email: 'manager@bizzops.com' }))) {
    await User.create({ name: 'Store Manager', email: 'manager@bizzops.com', password: 'manager123', role: 'manager', organization: org._id })
    console.log('✅ Manager: manager@bizzops.com / manager123')
  }

  // Items
  const itemsData = [
    { name: 'Laptop Stand', sku: 'ELEC-001', category: 'Electronics', unit: 'pcs', purchasePrice: 1200, sellingPrice: 1800, reorderLevel: 5, itemType: 'trading_item' },
    { name: 'USB-C Cable', sku: 'ELEC-002', category: 'Electronics', unit: 'pcs', purchasePrice: 150, sellingPrice: 299, reorderLevel: 20, itemType: 'trading_item' },
    { name: 'Wireless Mouse', sku: 'ELEC-003', category: 'Electronics', unit: 'pcs', purchasePrice: 500, sellingPrice: 899, reorderLevel: 10, itemType: 'finished_good' },
    { name: 'Metal Base Frame', sku: 'RAW-001', category: 'Hardware', unit: 'pcs', purchasePrice: 450, sellingPrice: 0, reorderLevel: 2, itemType: 'raw_material' },
    { name: 'A4 Paper Ream', sku: 'STAT-001', category: 'Stationery', unit: 'box', purchasePrice: 280, sellingPrice: 350, reorderLevel: 15, itemType: 'trading_item' },
    { name: 'Printer Ink (Black)', sku: 'STAT-002', category: 'Stationery', unit: 'pcs', purchasePrice: 400, sellingPrice: 650, reorderLevel: 8, itemType: 'finished_good' },
    { name: 'Industrial Solvent', sku: 'RAW-CHEM-01', category: 'Chemicals', unit: 'litre', purchasePrice: 120, sellingPrice: 0, reorderLevel: 25, itemType: 'raw_material' },
    { name: 'Safety Gloves', sku: 'SAFE-001', category: 'Safety', unit: 'set', purchasePrice: 80, sellingPrice: 150, reorderLevel: 30, itemType: 'trading_item' },
  ]

  for (const itemData of itemsData) {
    const exists = await Item.findOne({ sku: itemData.sku, organization: org._id })
    if (!exists) {
      const item = await Item.create({ ...itemData, organization: org._id })
      await Inventory.create({ item: item._id, organization: org._id, currentStock: Math.floor(Math.random() * 50) + 10 })
    }
  }

  const currentCount = await Item.countDocuments({ organization: org._id })
  if (currentCount < 100) {
    const cats = ['Electronics', 'Furniture', 'Stationery', 'Chemicals', 'Safety', 'Hardware', 'Auto', 'Plumbing']
    const units = ['pcs', 'nos', 'box', 'litre', 'set', 'kg', 'mtr']
    const types = ['raw_material', 'finished_good', 'trading_item', 'trading_item'] // High bias for trading
    let added = 0;
    while (added + currentCount < 100) {
        const cat = cats[Math.floor(Math.random() * cats.length)];
        const unit = units[Math.floor(Math.random() * units.length)];
        const type = types[Math.floor(Math.random() * types.length)];
        const item = await Item.create({
            name: `Generated Product ${cat} ${added}`,
            sku: `GEN-${cat.substring(0,3).toUpperCase()}-${String(Date.now() + added).slice(-5)}`,
            category: cat,
            itemType: type,
            unit: unit,
            purchasePrice: type === 'finished_good' ? 0 : Math.floor(Math.random() * 800) + 50,
            sellingPrice: type === 'raw_material' ? 0 : Math.floor(Math.random() * 1500) + 900,
            reorderLevel: Math.floor(Math.random() * 20) + 2,
            organization: org._id
        });
        await Inventory.create({ item: item._id, organization: org._id, currentStock: Math.floor(Math.random() * 150) });
        added++;
    }
  }
  console.log('✅ Sample items + inventory created (~100 items minimum)')

  // Vendors
  const vendorsData = [
    { name: 'TechSupply Co.', contactPerson: 'Rahul Mehta', phone: '9876543210', email: 'rahul@techsupply.com', gstin: '27AABCT1234F1Z5' },
    { name: 'Office World', contactPerson: 'Priya Shah', phone: '9765432109', email: 'priya@officeworld.com', gstin: '29AABCO4567G1Z3' },
    { name: 'SafetyFirst Industries', contactPerson: 'Amit Kumar', phone: '9654321098', email: 'amit@safetyfirst.com' },
  ]
  for (const v of vendorsData) {
    if (!(await Vendor.findOne({ email: v.email, organization: org._id }))) {
      await Vendor.create({ ...v, organization: org._id })
    }
  }
  console.log('✅ Sample vendors created')

  // Customers
  const customersData = [
    { name: 'Nexus Technologies', contactPerson: 'Vikram Patel', phone: '9543210987', email: 'vikram@nexus.com', gstin: '27AACNT5678H1Z2' },
    { name: 'Green Solutions Pvt Ltd', contactPerson: 'Anita Joshi', phone: '9432109876', email: 'anita@greensol.com', gstin: '29AACGS6789I1Z1' },
    { name: 'Sunrise Enterprises', contactPerson: 'Deepak Verma', phone: '9321098765', email: 'deepak@sunrise.com' },
  ]
  for (const c of customersData) {
    if (!(await Customer.findOne({ email: c.email, organization: org._id }))) {
      await Customer.create({ ...c, organization: org._id })
    }
  }
  console.log('✅ Sample customers created')

  // Generate Sample Stock Issues
  if (!(await StockIssue.findOne({ organization: org._id }))) {
    const rawMaterials = await Item.find({ organization: org._id, itemType: 'raw_material' }).limit(3);
    if (rawMaterials.length > 0) {
      const issue = await StockIssue.create({
        organization: org._id,
        issueNumber: 'SI-00001',
        department: 'Assembly Line Floor B',
        notes: 'Initial production batch allocation for weekly assembly.',
        issuedBy: admin._id,
        status: 'Issued',
        items: rawMaterials.map(rm => ({ item: rm._id, quantity: Math.floor(Math.random() * 10) + 5 }))
      });
      // Deduct mock stock
      for (const req of issue.items) {
        const inv = await Inventory.findOne({ item: req.item, organization: org._id });
        if(inv) {
          inv.currentStock -= req.quantity;
          await inv.save();
          await StockTransaction.create({
            organization: org._id,
            item: req.item,
            type: 'OUT',
            quantity: req.quantity,
            balanceAfter: inv.currentStock,
            refModel: 'StockIssue',
            refId: issue._id,
            note: 'Seed generation issuance',
            createdBy: admin._id
          });
        }
      }
      console.log('✅ Sample stock issues simulated');
    }
  }

  console.log('\n🎉 Seed complete!')
  console.log('   📧 admin@bizzops.com  🔑 admin123')
  console.log('   📧 manager@bizzops.com  🔑 manager123\n')

  await mongoose.connection.close()
  process.exit(0)
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1) })
