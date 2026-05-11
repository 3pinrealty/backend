const fs = require('fs');
const util = require('util');
const crypto = require('crypto');
const Property = require('../models/Property');
const BrochureLead = require('../models/BrochureLead');
const cloudinary = require('../config/cloudinary');
const { buildGoogleSheetPayload, postToGoogleSheets } = require('../utils/googleSheets');
const { isValidPhone, trimPhone, PHONE_VALIDATION_MESSAGE } = require('../utils/phoneValidation');

const unlinkFile = util.promisify(fs.unlink);

const toNum = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toPositiveNum = (v) => {
  const n = toNum(v);
  return n != null && n > 0 ? n : null;
};

const parsePriceNumeric = (priceStr) => {
  if (!priceStr || typeof priceStr !== 'string') return null;

  const cleaned = priceStr.trim().toUpperCase();

  let num = parseFloat(
    cleaned.replace(/,/g, '').match(/[\d.]+/)?.[0]
  );

  if (!Number.isFinite(num)) return null;

  if (/\b(CRORE|CR)\b/.test(cleaned)) {
    num *= 10000000;
  }
  else if (/\b(LAKH|LK)\b/.test(cleaned)) {
    num *= 100000;
  }
  else if (/(THOUSAND|K)\b/.test(cleaned)) {
    num *= 1000;
  }

  return Math.round(num);
};

const normalizeBudgetValue = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Pure numeric strings from query params / DB should be treated directly.
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    return parsePriceNumeric(trimmed);
  }
  return null;
};

const derivePropertyBudgetRange = (property) => {
  const minRange = normalizeBudgetValue(property?.minPrice);
  const maxRange = normalizeBudgetValue(property?.maxPrice);
  const numericPrice = normalizeBudgetValue(property?.priceNumeric);
  const overall = normalizeBudgetValue(property?.price);

  // Priority 1: priceNumeric (authoritative numeric value for list/overall price).
  if (Number.isFinite(numericPrice)) {
    return { low: numericPrice, high: numericPrice };
  }

  // Use explicit authored range only when both ends are available.
  if (Number.isFinite(minRange) && Number.isFinite(maxRange)) {
    return {
      low: Math.min(minRange, maxRange),
      high: Math.max(minRange, maxRange),
    };
  }

  // If explicit range is incomplete, fall back to parsable list price text.
  if (Number.isFinite(overall)) {
    return { low: overall, high: overall };
  }

  // Last resort when only one side exists and list price is unavailable.
  if (Number.isFinite(minRange) || Number.isFinite(maxRange)) {
    const single = Number.isFinite(minRange) ? minRange : maxRange;
    return { low: single, high: single };
  }

  return null;
};

const toPriceText = (v) => {
  if (v == null) return '';
  return String(v).trim();
};

const isValidPriceText = (v) => {
  if (!v) return false;
  return /\d/.test(v) && /[a-zA-Z]/.test(v);
};

const toBool = (v) => v === true || v === 'true' || v === '1' || v === 'on';

const parseMultilineList = (s) => {
  if (!s || typeof s !== 'string') return [];
  return s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
};

const parseLandmarksText = (s) => {
  if (!s || typeof s !== 'string') return [];
  return s
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split('|').map((x) => x.trim());
      if (!parts[0]) return null;
      return {
        name: parts[0],
        distance: parts[1] || '',
        icon: parts[2] || 'mdi:map-marker-outline',
      };
    })
    .filter(Boolean);
};

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseImageOrder = (value) => {
  if (typeof value === 'undefined') return null;
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((x) => String(x).trim()).filter(Boolean);
  } catch (_err) {
    return null;
  }
};

const extractGoogleDriveFileId = (url) => {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  // Common patterns:
  // - https://drive.google.com/file/d/<id>/view?...
  // - https://drive.google.com/open?id=<id>
  // - https://drive.google.com/uc?id=<id>&export=download
  // - https://docs.google.com/uc?id=<id>&export=download
  let m = u.match(/\/file\/d\/([^/]+)/i);
  if (m?.[1]) return m[1];
  m = u.match(/[?&]id=([^&]+)/i);
  if (m?.[1]) return m[1];
  return null;
};

const makeBrochureDownloadUrl = (brochureUrl) => {
  if (!brochureUrl || typeof brochureUrl !== 'string') return null;
  const trimmed = brochureUrl.trim();
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`;
  return trimmed;
};

const extractCloudinaryRawPublicIdAndFormat = (url) => {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!/res\.cloudinary\.com/i.test(u)) return null;
  // Match: https://res.cloudinary.com/<cloud>/raw/<type>/v123/<public_id>.<ext>
  // Note: For raw files, Cloudinary public_id can include the extension.
  const m = u.match(/\/raw\/(upload|authenticated|private)\/v\d+\/(.+)\.([a-z0-9]+)(?:\?.*)?$/i);
  if (!m) return null;
  const type = String(m[1]).toLowerCase();
  const publicIdWithExt = m[2] && m[3] ? `${m[2]}.${m[3]}` : null;
  const format = String(m[3]).toLowerCase();
  if (!publicIdWithExt) return null;
  return { type, publicId: publicIdWithExt, format };
};

const uploadFilesToCloudinary = async (files = [], opts = {}) => {
  if (!files.length) return [];

  const folder = opts.folder || 'properties';
  const uploadPromises = files.map(async (file) => {
    try {
      const isPdf = file.mimetype === 'application/pdf';
      const result = await cloudinary.uploader.upload(file.path, {
        folder,
        resource_type: isPdf ? 'raw' : 'image',
      });

      await unlinkFile(file.path).catch(() => { });

      return result.secure_url;
    } catch (error) {
      await unlinkFile(file.path).catch(() => { });
      const cloudinaryMessage =
        error?.message ||
        error?.error?.message ||
        error?.error?.name ||
        'File upload failed';
      const wrapped = new Error(`Image upload failed: ${cloudinaryMessage}`);
      wrapped.statusCode = error?.http_code ? Number(error.http_code) : 502;
      throw wrapped;
    }
  });

  return Promise.all(uploadPromises);
};

const uploadSingleToCloudinary = async (file, opts = {}) => {
  if (!file) return null;
  const [url] = await uploadFilesToCloudinary([file], opts);
  return url || null;
};

const bodyPayloadFromReq = (body) => ({
  title: body.title != null ? String(body.title).trim() : '',
  price: toPriceText(body.price),
  priceNumeric: parsePriceNumeric(body.price),
  minPrice: toPriceText(body.minPrice),
  maxPrice: toPriceText(body.maxPrice),
  currency: typeof body.currency === 'string' && body.currency.trim() ? body.currency.trim() : 'INR',
  paymentPlan: body.paymentPlan != null ? String(body.paymentPlan).trim() : '',
  location: body.location != null ? String(body.location).trim() : '',
  addressLine: body.addressLine != null ? String(body.addressLine).trim() : '',
  description: body.description != null ? String(body.description) : '',
  bedrooms: toNum(body.bedrooms),
  bathrooms: toNum(body.bathrooms),
  area: body.area != null ? String(body.area).trim() : '',
  areaSqftMin: toPositiveNum(body.areaSqftMin),
  areaSqftMax: toPositiveNum(body.areaSqftMax),
  landAreaAcres: toNum(body.landAreaAcres),
  type: body.type != null ? String(body.type).trim() : '',
  builder: body.builder != null ? String(body.builder).trim() : '',
  unitsCount: toNum(body.unitsCount),
  pricePerSqftMin: toPositiveNum(body.pricePerSqftMin),
  pricePerSqftMax: toPositiveNum(body.pricePerSqftMax),
  structure: body.structure != null ? String(body.structure).trim() : '',
  towerCount: toNum(body.towerCount),
  deliveryDate: parseDate(body.deliveryDate),
  isNewDevelopment: toBool(body.isNewDevelopment),
  featured: toBool(body.featured),
  launchStatus: body.launchStatus != null ? String(body.launchStatus).trim() : '',
  propertyVisibility: body.propertyVisibility != null ? String(body.propertyVisibility).trim() : '',
  cashbackEligible: toBool(body.cashbackEligible),
  amenities: parseMultilineList(body.amenitiesText),
  nearbyLandmarks: parseLandmarksText(body.landmarksText),
  floorPlanNote: body.floorPlanNote != null ? String(body.floorPlanNote).trim() : '',
  brochureUrl: body.brochureUrl != null ? String(body.brochureUrl).trim() : '',
  latitude: toNum(body.latitude),
  longitude: toNum(body.longitude),
  mapUrl: body.mapUrl != null ? String(body.mapUrl).trim() : '',
  youtubeUrl: body.youtubeUrl != null ? String(body.youtubeUrl).trim() : '',
});

const createProperty = async (req, res, next) => {
  try {
    const base = bodyPayloadFromReq(req.body);

    if (!base.title || !isValidPriceText(base.price)) {
      const error = new Error('Title and a valid list price are required (example: 80 Lakhs)');
      error.statusCode = 400;
      throw error;
    }

    if (!base.location) {
      const error = new Error('Location is required');
      error.statusCode = 400;
      throw error;
    }

    const imageFiles = req.files?.images || [];
    if (!imageFiles.length) {
      const error = new Error('At least one image is required');
      error.statusCode = 400;
      throw error;
    }

    const imageUrls = await uploadFilesToCloudinary(imageFiles, { folder: 'properties' });
    if (!imageUrls.length) {
      const error = new Error('At least one image is required');
      error.statusCode = 400;
      throw error;
    }
    const floorPlanUrls = await uploadFilesToCloudinary(req.files?.floorPlans || [], { folder: 'floor-plans' });
    const brochureFile = req.files?.brochure?.[0];
    const brochureUrl = await uploadSingleToCloudinary(brochureFile, { folder: 'brochures' });

    const property = await Property.create({
      ...base,
      images: imageUrls,
      floorPlans: floorPlanUrls,
      brochureUrl: brochureUrl || base.brochureUrl,
    });

    res.status(201).json({
      success: true,
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

const getAllProperties = async (req, res, next) => {
  try {
    const {
      location,
      minBudget,
      maxBudget,
      type,
      status,
      bedrooms,
      completionYear,
    } = req.query;

    const filter = {};

    // location — case-insensitive partial match
    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    // type — exact match
    if (type) {
      filter.type = type;
    }

    const minNum = normalizeBudgetValue(minBudget);
    const maxNum = normalizeBudgetValue(maxBudget);
    const maxBudgetOpen = String(req.query?.maxBudgetOpen || '').trim() === '1';

    // status — "Ready to Move" (isNewDevelopment=false) | "Under Construction" (isNewDevelopment=true)
    if (status) {
      const list = status.split(',').map((s) => s.trim()).filter(Boolean);
      const statusConditions = [];
      if (list.includes('Ready to Move')) statusConditions.push({ isNewDevelopment: false });
      if (list.includes('Under Construction')) statusConditions.push({ isNewDevelopment: true });
      if (statusConditions.length > 0) {
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: statusConditions });
      }
    }

    // bedrooms — numeric match
    if (bedrooms) {
      const nums = bedrooms.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      if (nums.length) filter.bedrooms = { $in: nums };
    }

    // completionYear — extract year from deliveryDate
    if (completionYear) {
      const years = completionYear.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      if (years.length) {
        const dateConditions = years.map((year) => ({
          deliveryDate: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59.999`),
          },
        }));
        filter.$and = filter.$and || [];
        filter.$and.push({ $or: dateConditions });
      }
    }

    console.log('[Property Filter] filter:', JSON.stringify(filter, null, 2));

    let properties = await Property.find(filter).sort({ createdAt: -1 });

    if (minNum != null || maxNum != null) {
      let lower = Number.isFinite(minNum) ? minNum : null;
      let upper = Number.isFinite(maxNum) ? maxNum : null;

      // "5 Cr+" as max means open-ended upper bound.
      if (maxBudgetOpen) {
        if (lower == null && upper != null) lower = upper;
        upper = null;
      }

      if (lower != null && upper != null && lower > upper) {
        const tmp = lower;
        lower = upper;
        upper = tmp;
      }

      properties = properties.filter((p) => {
        const range = derivePropertyBudgetRange(p);
        if (!range) return false;

        if (lower != null && upper != null) {
          // Overlap with requested range.
          return range.high >= lower && range.low <= upper;
        }
        if (lower != null) return range.high >= lower;
        if (upper != null) return range.low <= upper;
        return true;
      });
    }

    res.json({
      success: true,
      data: properties,
    });
  } catch (error) {
    next(error);
  }
};

const getPropertyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id);

    if (!property) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      data: property,
    });
  } catch (error) {
    next(error);
  }
};

const updateProperty = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await Property.findById(id);
    if (!existing) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }

    const incoming = bodyPayloadFromReq(req.body);

    let newImageUrls = [];
    if (req.files?.images && req.files.images.length > 0) {
      newImageUrls = await uploadFilesToCloudinary(req.files.images, { folder: 'properties' });
    }

    let newFloorPlanUrls = [];
    if (req.files?.floorPlans && req.files.floorPlans.length > 0) {
      newFloorPlanUrls = await uploadFilesToCloudinary(req.files.floorPlans, { folder: 'floor-plans' });
    }

    const brochureFile = req.files?.brochure?.[0];
    const newBrochureUrl = brochureFile ? await uploadSingleToCloudinary(brochureFile, { folder: 'brochures' }) : null;
    const requestedImageOrder = parseImageOrder(req.body?.imageOrder);

    if (requestedImageOrder !== null) {
      const existingImageSet = new Set((existing.images || []).map((u) => String(u)));
      const dedupedOrdered = [];
      requestedImageOrder.forEach((url) => {
        const normalized = String(url);
        if (!existingImageSet.has(normalized)) return;
        if (dedupedOrdered.includes(normalized)) return;
        dedupedOrdered.push(normalized);
      });

      if (dedupedOrdered.length > 0) {
        const remaining = (existing.images || []).filter((u) => !dedupedOrdered.includes(String(u)));
        existing.images = [...dedupedOrdered, ...remaining];
      }
    }

    if (typeof req.body.title !== 'undefined') existing.title = incoming.title;
    // if (typeof req.body.price !== 'undefined') existing.price = incoming.price;
    if (typeof req.body.price !== 'undefined') {
      existing.price = incoming.price;
      existing.priceNumeric = parsePriceNumeric(incoming.price);
    }
    if (typeof req.body.minPrice !== 'undefined') existing.minPrice = incoming.minPrice;
    if (typeof req.body.maxPrice !== 'undefined') existing.maxPrice = incoming.maxPrice;
    if (typeof req.body.currency !== 'undefined') existing.currency = incoming.currency;
    if (typeof req.body.paymentPlan !== 'undefined') existing.paymentPlan = incoming.paymentPlan;
    if (typeof req.body.location !== 'undefined') existing.location = incoming.location;
    if (typeof req.body.addressLine !== 'undefined') existing.addressLine = incoming.addressLine;
    if (typeof req.body.description !== 'undefined') existing.description = incoming.description;
    if (newImageUrls.length > 0) {
      existing.images = [...existing.images, ...newImageUrls];
    }
    if (typeof req.body.bedrooms !== 'undefined') existing.bedrooms = incoming.bedrooms;
    if (typeof req.body.bathrooms !== 'undefined') existing.bathrooms = incoming.bathrooms;
    if (typeof req.body.area !== 'undefined') existing.area = incoming.area;
    if (typeof req.body.areaSqftMin !== 'undefined') existing.areaSqftMin = incoming.areaSqftMin;
    if (typeof req.body.areaSqftMax !== 'undefined') existing.areaSqftMax = incoming.areaSqftMax;
    if (typeof req.body.landAreaAcres !== 'undefined') existing.landAreaAcres = incoming.landAreaAcres;
    if (typeof req.body.type !== 'undefined') existing.type = incoming.type;
    if (typeof req.body.builder !== 'undefined') existing.builder = incoming.builder;
    if (typeof req.body.unitsCount !== 'undefined') existing.unitsCount = incoming.unitsCount;
    if (typeof req.body.pricePerSqftMin !== 'undefined') existing.pricePerSqftMin = incoming.pricePerSqftMin;
    if (typeof req.body.pricePerSqftMax !== 'undefined') existing.pricePerSqftMax = incoming.pricePerSqftMax;
    if (typeof req.body.structure !== 'undefined') existing.structure = incoming.structure;
    if (typeof req.body.towerCount !== 'undefined') existing.towerCount = incoming.towerCount;
    if (typeof req.body.deliveryDate !== 'undefined') existing.deliveryDate = incoming.deliveryDate;
    if (typeof req.body.isNewDevelopment !== 'undefined') existing.isNewDevelopment = incoming.isNewDevelopment;
    if (typeof req.body.featured !== 'undefined') existing.featured = incoming.featured;
    if (typeof req.body.launchStatus !== 'undefined') existing.launchStatus = incoming.launchStatus;
    if (typeof req.body.propertyVisibility !== 'undefined') existing.propertyVisibility = incoming.propertyVisibility;
    if (typeof req.body.cashbackEligible !== 'undefined') existing.cashbackEligible = incoming.cashbackEligible;
    if (typeof req.body.amenitiesText !== 'undefined') existing.amenities = incoming.amenities;
    if (typeof req.body.landmarksText !== 'undefined') existing.nearbyLandmarks = incoming.nearbyLandmarks;
    if (newFloorPlanUrls.length > 0) {
      existing.floorPlans = [...existing.floorPlans, ...newFloorPlanUrls];
    }
    if (typeof req.body.floorPlanNote !== 'undefined') existing.floorPlanNote = incoming.floorPlanNote;
    // Prefer uploaded brochure file (if provided)
    if (newBrochureUrl) existing.brochureUrl = newBrochureUrl;
    else if (typeof req.body.brochureUrl !== 'undefined') existing.brochureUrl = incoming.brochureUrl;
    if (typeof req.body.latitude !== 'undefined') existing.latitude = incoming.latitude;
    if (typeof req.body.longitude !== 'undefined') existing.longitude = incoming.longitude;
    if (typeof req.body.mapUrl !== 'undefined') existing.mapUrl = incoming.mapUrl;
    if (typeof req.body.youtubeUrl !== 'undefined') existing.youtubeUrl = incoming.youtubeUrl;

    if (!String(existing.title || '').trim()) {
      const error = new Error('Title is required');
      error.statusCode = 400;
      throw error;
    }
    if (!isValidPriceText(String(existing.price || '').trim())) {
      const error = new Error('A valid list price is required (example: 80 Lakhs)');
      error.statusCode = 400;
      throw error;
    }
    if (!String(existing.location || '').trim()) {
      const error = new Error('Location is required');
      error.statusCode = 400;
      throw error;
    }
    if (!Array.isArray(existing.images) || existing.images.length === 0) {
      const error = new Error('At least one image is required');
      error.statusCode = 400;
      throw error;
    }

    const updated = await existing.save();

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

const deleteProperty = async (req, res, next) => {
  try {
    const { id } = req.params;

    const property = await Property.findByIdAndDelete(id);

    if (!property) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'Property deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

const createBrochureLead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🔍 Get property
    const property = await Property.findById(id).select('_id title location type brochureUrl');

    if (!property) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }

    const brochureUrl = property.brochureUrl ? String(property.brochureUrl).trim() : '';

    if (!brochureUrl) {
      const error = new Error('Brochure not available');
      error.statusCode = 404;
      throw error;
    }

    // 🧾 Validate input
    const name = req.body?.name != null ? String(req.body.name).trim() : '';
    const mobile = trimPhone(req.body?.phone ?? req.body?.mobile);

    if (!name) {
      const error = new Error('Name is required');
      error.statusCode = 400;
      throw error;
    }

    if (!isValidPhone(mobile)) {
      const error = new Error(PHONE_VALIDATION_MESSAGE);
      error.statusCode = 400;
      throw error;
    }

    // 🔐 Generate token
    const token = crypto.randomBytes(24).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // 🌐 Get IP
    const ip =
      String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim() ||
      req.socket?.remoteAddress ||
      '';

    console.log("🔥 Step 1: Controller hit");
    // 💾 Save in DB
    await BrochureLead.create({
      propertyId: property._id,
      name,
      mobile,
      token,
      tokenExpiresAt,
      userAgent: String(req.headers['user-agent'] || ''),
      ip: String(ip || ''),
    });

    console.log("🔥 Step 2: After DB save");

    let googleSheetsSynced = false;
    let googleSheetsError = null;

    // 📊 SEND TO GOOGLE SHEET (NON-BLOCKING)
    try {
      const googlePayload = buildGoogleSheetPayload(
        {
          sheetName: 'Brochure Leads',
          name,
          phone: mobile,
          propertyName: property.title || '',
          propertyLocation: property.location || '',
          propertyType: property.type || '',
        },
        'Brochure Leads'
      );

      await postToGoogleSheets({
        payload: googlePayload,
        context: 'createBrochureLead/Brochure Leads',
      });

      googleSheetsSynced = true;
    } catch (err) {
      googleSheetsError = err?.response?.data || err.message;
      console.error('❌ Google Sheet Error:', {
        message: err.message,
        status: err?.response?.status,
        data: err?.response?.data,
      });
    }

    // ✅ Response
    res.json({
      success: true,
      data: {
        token,
        expiresAt: tokenExpiresAt.toISOString(),
        downloadUrl: `/api/property/${property._id}/brochure-download?token=${encodeURIComponent(token)}`,
      },
      googleSheets: {
        synced: googleSheetsSynced,
        error: googleSheetsError,
      },
    });

  } catch (error) {
    next(error);
  }
};

const downloadBrochure = async (req, res, next) => {
  try {
    const { id } = req.params;
    const token = req.query?.token != null ? String(req.query.token).trim() : '';

    if (!token) {
      const error = new Error('Missing token');
      error.statusCode = 400;
      throw error;
    }

    const lead = await BrochureLead.findOne({ token, propertyId: id });
    if (!lead) {
      const error = new Error('Invalid token');
      error.statusCode = 401;
      throw error;
    }
    if (lead.tokenExpiresAt && new Date(lead.tokenExpiresAt).getTime() < Date.now()) {
      const error = new Error('Token expired');
      error.statusCode = 401;
      throw error;
    }

    const property = await Property.findById(id).select('brochureUrl title');
    if (!property) {
      const error = new Error('Property not found');
      error.statusCode = 404;
      throw error;
    }
    const brochureUrl = property.brochureUrl ? String(property.brochureUrl).trim() : '';
    if (!brochureUrl) {
      const error = new Error('Brochure not available');
      error.statusCode = 404;
      throw error;
    }

    const target = makeBrochureDownloadUrl(brochureUrl);
    if (!target) {
      const error = new Error('Brochure not available');
      error.statusCode = 404;
      throw error;
    }

    const cloud = extractCloudinaryRawPublicIdAndFormat(target);
    if (cloud) {
      const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60; // 5 minutes
      const signed = cloudinary.utils.private_download_url(cloud.publicId, cloud.format, {
        resource_type: 'raw',
        type: cloud.type || 'upload',
        expires_at: expiresAt,
        attachment: true,
      });
      // Stream the file through our backend so the user doesn't see Cloudinary URL.
      const proto = signed.startsWith('https://') ? require('https') : require('http');
      proto
        .get(signed, (r) => {
          if (r.statusCode && r.statusCode >= 400) {
            const error = new Error(`Failed to download brochure`);
            error.statusCode = r.statusCode;
            r.resume();
            next(error);
            return;
          }

          const safeName = String(property.title || 'brochure')
            .replace(/[^\w\s-]/g, '')
            .trim()
            .replace(/\s+/g, '_')
            .slice(0, 80);
          const filename = `${safeName || 'brochure'}.pdf`;

          res.setHeader('Content-Type', r.headers['content-type'] || 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
          r.pipe(res);
        })
        .on('error', (err) => next(err));
      return;
    }

    // Redirect so browser treats it as a download navigation.
    res.redirect(302, target);
  } catch (error) {
    next(error);
  }
};

const createContactLead = async (req, res, next) => {

  try {
    const name = req.body?.name != null ? String(req.body.name).trim() : '';
    const email = req.body?.email != null ? String(req.body.email).trim() : '';
    const mobile = trimPhone(req.body?.phone);
    const message = req.body?.message != null ? String(req.body.message).trim() : '';
    const date = req.body?.date != null ? String(req.body.date).trim() : '';
    const time = req.body?.time != null ? String(req.body.time).trim() : '';

    if (!name) {
      return res.status(400).json({ message: "Name required" });
    }

    if (!isValidPhone(mobile)) {
      return res.status(400).json({ message: PHONE_VALIDATION_MESSAGE });
    }

    // 🔥 SEND TO GOOGLE SHEET
    try {
      const googlePayload = buildGoogleSheetPayload(
        {
          sheetName: 'Contact',
          name,
          phone: mobile,
          email,
          message,
          date,
          time,
        },
        'Contact'
      );

      await postToGoogleSheets({
        payload: googlePayload,
        context: 'createContactLead/Contact',
      });

      console.log('✅ Contact lead synced to Google Sheet');
    } catch (err) {
      console.error('Google Sheet Error:', {
        message: err.message,
        status: err?.response?.status,
        data: err?.response?.data,
      });
    }

    res.json({ success: true });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  createProperty,
  getAllProperties,
  getPropertyById,
  updateProperty,
  deleteProperty,
  createBrochureLead,
  downloadBrochure,
  createContactLead
};
