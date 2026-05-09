const axios = require('axios');

const SHEET_NAME_MAP = {
  contact: 'Contact',
  'schedule a visit': 'Schedule a visit',
  'sell your property': 'Sell Your Property',
  'brochure leads': 'Brochure Leads',
};

const SHEET_FIELDS = {
  Contact: ['name', 'phone', 'email', 'message', 'createdAt'],
  'Schedule a visit': [
    'name',
    'email',
    'phone',
    'message',
    'date',
    'time',
    'propertyName',
    'propertyLocation',
    'propertyType',
    'createdAt',
  ],
  'Sell Your Property': ['name', 'email', 'phone', 'propertyDetails', 'createdAt'],
  'Brochure Leads': ['name', 'phone', 'propertyName', 'propertyLocation', 'propertyType', 'createdAt'],
};

const normalizeSheetName = (sheetName) => {
  const key = String(sheetName || '').trim().toLowerCase();
  return SHEET_NAME_MAP[key] || 'Contact';
};

const sanitizeValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  return value;
};

const buildGoogleSheetPayload = (rawPayload, requestedSheetName, createdAtValue) => {
  const sheetName = normalizeSheetName(requestedSheetName || rawPayload?.sheetName);
  const allowedFields = SHEET_FIELDS[sheetName] || SHEET_FIELDS.Contact;
  const createdAt =
    createdAtValue != null
      ? new Date(createdAtValue).toISOString()
      : new Date().toISOString();

  const basePayload = {
    ...rawPayload,
    createdAt,
  };

  const payload = { sheetName };
  allowedFields.forEach((field) => {
    payload[field] = sanitizeValue(basePayload[field]);
  });

  return payload;
};

const postToGoogleSheets = async ({ payload, context }) => {
  if (!process.env.GOOGLE_SCRIPT_URL) {
    throw new Error('GOOGLE_SCRIPT_URL is not configured');
  }

  console.log(`[Sheets] ${context} -> request payload:`, payload);

  const response = await axios.post(process.env.GOOGLE_SCRIPT_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  console.log(`[Sheets] ${context} -> response:`, {
    status: response.status,
    data: response.data,
  });

  return response;
};

module.exports = {
  buildGoogleSheetPayload,
  normalizeSheetName,
  postToGoogleSheets,
};
