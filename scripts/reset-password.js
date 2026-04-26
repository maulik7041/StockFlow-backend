const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../models/User');
const Organization = require('../models/Organization');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const resetPassword = async () => {
  const args = process.argv.slice(2);
  const params = {};

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key && value) {
      params[key.replace('--', '')] = value;
    }
  });

  const { email, org, password } = params;

  if (!email || !org || !password) {
    console.log('\x1b[31m%s\x1b[0m', '❌ Error: Missing required arguments.');
    console.log('Usage: node scripts/reset-password.js --email=user@example.com --org="Org Name or Slug" --password=newpassword123');
    console.log('\nNote: If the organization name has spaces, wrap it in quotes.');
    process.exit(1);
  }

  try {
    // Connect to DB
    console.log(`Connecting to database...`);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find Organization
    console.log(`Finding organization: ${org}...`);
    const organization = await Organization.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${org}$`, 'i') } },
        { slug: org.toLowerCase() }
      ]
    });

    if (!organization) {
      console.log('\x1b[31m%s\x1b[0m', `❌ Error: Organization "${org}" not found.`);
      process.exit(1);
    }

    // Find User in Organization
    console.log(`Finding user: ${email} in organization: ${organization.name}...`);
    const user = await User.findOne({
      email: email.toLowerCase(),
      organization: organization._id
    });

    if (!user) {
      console.log('\x1b[31m%s\x1b[0m', `❌ Error: User "${email}" not found in organization "${organization.name}".`);
      process.exit(1);
    }

    // Update Password
    console.log(`Updating password...`);
    user.password = password;
    await user.save();

    console.log('\x1b[32m%s\x1b[0m', `✅ Success: Password for user "${email}" in organization "${organization.name}" has been reset.`);

  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Error:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(0);
  }
};

resetPassword();
