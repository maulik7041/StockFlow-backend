require('dotenv').config()
const mongoose = require('mongoose')
const connectDB = require('./config/db')

const Organization = require('./models/Organization')
const User = require('./models/User')
const Item = require('./models/Item')
const Inventory = require('./models/Inventory')
const Vendor = require('./models/Vendor')
const Customer = require('./models/Customer')

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
  let admin = await User.findOne({ email: 'admin@stockflow.com' })
  if (!admin) {
    admin = await User.create({ name: 'Admin User', email: 'admin@stockflow.com', password: 'admin123', role: 'admin', organization: org._id })
    org.owner = admin._id
    await org.save()
    console.log('✅ Admin: admin@stockflow.com / admin123')
  }

  // Manager user
  if (!(await User.findOne({ email: 'manager@stockflow.com' }))) {
    await User.create({ name: 'Store Manager', email: 'manager@stockflow.com', password: 'manager123', role: 'manager', organization: org._id })
    console.log('✅ Manager: manager@stockflow.com / manager123')
  }

  // Items
  const itemsData = [
    { name: 'Laptop Stand', sku: 'ELEC-001', category: 'Electronics', unit: 'pcs', purchasePrice: 1200, sellingPrice: 1800, reorderLevel: 5 },
    { name: 'USB-C Cable', sku: 'ELEC-002', category: 'Electronics', unit: 'pcs', purchasePrice: 150, sellingPrice: 299, reorderLevel: 20 },
    { name: 'Wireless Mouse', sku: 'ELEC-003', category: 'Electronics', unit: 'pcs', purchasePrice: 500, sellingPrice: 899, reorderLevel: 10 },
    { name: 'Office Chair', sku: 'FURN-001', category: 'Furniture', unit: 'nos', purchasePrice: 4500, sellingPrice: 7500, reorderLevel: 2 },
    { name: 'A4 Paper Ream', sku: 'STAT-001', category: 'Stationery', unit: 'box', purchasePrice: 280, sellingPrice: 350, reorderLevel: 15 },
    { name: 'Printer Ink (Black)', sku: 'STAT-002', category: 'Stationery', unit: 'pcs', purchasePrice: 400, sellingPrice: 650, reorderLevel: 8 },
    { name: 'Industrial Cleaner', sku: 'CHEM-001', category: 'Chemicals', unit: 'litre', purchasePrice: 120, sellingPrice: 220, reorderLevel: 25 },
    { name: 'Safety Gloves', sku: 'SAFE-001', category: 'Safety', unit: 'set', purchasePrice: 80, sellingPrice: 150, reorderLevel: 30 },
  ]

  for (const itemData of itemsData) {
    const exists = await Item.findOne({ sku: itemData.sku, organization: org._id })
    if (!exists) {
      const item = await Item.create({ ...itemData, organization: org._id })
      await Inventory.create({ item: item._id, organization: org._id, currentStock: Math.floor(Math.random() * 50) + 10 })
    }
  }
  console.log('✅ Sample items + inventory created')

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

  console.log('\n🎉 Seed complete!')
  console.log('   📧 admin@stockflow.com  🔑 admin123')
  console.log('   📧 manager@stockflow.com  🔑 manager123\n')

  await mongoose.connection.close()
  process.exit(0)
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1) })
