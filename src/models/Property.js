const mongoose = require('mongoose');

const nearbyLandmarkSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    distance: { type: String, default: '', trim: true },
    icon: { type: String, default: 'mdi:map-marker-outline', trim: true },
  },
  { _id: false },
);

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    minPrice: {
      type: Number,
      default: null,
    },
    maxPrice: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    paymentPlan: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    addressLine: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
    },
    images: {
      type: [String],
      required: true,
    },
    bedrooms: {
      type: Number,
      default: null,
    },
    bathrooms: {
      type: Number,
      default: null,
    },
    area: {
      type: Number,
      default: null,
    },
    areaSqftMin: {
      type: Number,
      default: null,
    },
    areaSqftMax: {
      type: Number,
      default: null,
    },
    type: {
      type: String,
      default: '',
    },
    builder: {
      type: String,
      default: '',
      trim: true,
    },
    unitsCount: {
      type: Number,
      default: null,
    },
    pricePerSqftMin: {
      type: Number,
      default: null,
    },
    pricePerSqftMax: {
      type: Number,
      default: null,
    },
    structure: {
      type: String,
      default: '',
      trim: true,
    },
    towerCount: {
      type: Number,
      default: null,
    },
    deliveryDate: {
      type: Date,
      default: null,
    },
    isNewDevelopment: {
      type: Boolean,
      default: false,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    launchStatus: {
      type: String,
      default: '',
      trim: true,
    },
    cashbackEligible: {
      type: Boolean,
      default: false,
    },
    amenities: {
      type: [String],
      default: [],
    },
    nearbyLandmarks: {
      type: [nearbyLandmarkSchema],
      default: [],
    },
    floorPlans: {
      type: [String],
      default: [],
    },
    floorPlanNote: {
      type: String,
      default: '',
    },
    brochureUrl: {
      type: String,
      default: '',
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    mapUrl: {
      type: String,
      default: '',
      trim: true,
    },
    youtubeUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Property', propertySchema);
