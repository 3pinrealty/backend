/**
 * One-time migration script to add cashbackEligible field to existing properties.
 * Run with: node scripts/add-cashback-field.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('Error: MONGO_URI or MONGODB_URI not set in environment');
  process.exit(1);
}

async function migrate() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.db.collection('properties').updateMany(
      { cashbackEligible: { $exists: false } },
      { $set: { cashbackEligible: false } }
    );

    console.log(`Migration complete. Modified ${result.modifiedCount} documents.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();