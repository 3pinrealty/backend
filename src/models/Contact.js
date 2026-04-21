const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    date: { type: String },
    time: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contact', contactSchema);