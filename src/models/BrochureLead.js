const mongoose = require('mongoose');

const brochureLeadSchema = new mongoose.Schema(
  {
    propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, trim: true },
    token: { type: String, required: true, unique: true, index: true },
    tokenExpiresAt: { type: Date, required: true, index: true },
    userAgent: { type: String, default: '', trim: true },
    ip: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('BrochureLead', brochureLeadSchema);

