const Contact = require('../models/Contact');
const Property = require('../models/Property');
const axios = require('axios');
const { buildGoogleSheetPayload } = require('../utils/sheetSchema');

const createContact = async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('📥 Incoming payload:', payload);

    const name = payload?.name != null ? String(payload.name).trim() : '';
    const email = payload?.email != null ? String(payload.email).trim() : '';
    const rawPhone = payload?.phone ?? payload?.mobile ?? '';
    const phone = String(rawPhone).trim();
    const message = payload?.message != null ? String(payload.message).trim() : '';
    const date = payload?.date != null ? String(payload.date).trim() : '';
    const time = payload?.time != null ? String(payload.time).trim() : '';
    const requestedSheetName = payload?.sheetName != null ? String(payload.sheetName).trim() : '';

    // Determine target sheet
    const targetSheet =
      requestedSheetName === 'Schedule a visit'
        ? 'Schedule a visit'
        : requestedSheetName === 'Sell Your Property'
          ? 'Sell Your Property'
          : requestedSheetName === 'Brochure Leads'
            ? 'Brochure Leads'
            : 'Contact';

    console.log(`📌 Target sheet: "${targetSheet}"`);

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (!/^\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // 💾 Save in DB
    const dbPayload = {
      name,
      email: email ? email.toLowerCase() : undefined,
      phone: cleanPhone,
      message: message || undefined,
      date: date || undefined,
      time: time || undefined,
    };

    console.log('💾 Saving to MongoDB:', dbPayload);

    const contact = await Contact.create(dbPayload);

    // 📊 SEND TO GOOGLE SHEETS
    try {
      if (!process.env.GOOGLE_SCRIPT_URL) {
        throw new Error('GOOGLE_SCRIPT_URL is not configured');
      }

      // Build clean payload for Google Sheets using schema validation
      const googlePayload = {
        name,
        phone: cleanPhone,
        email: email || undefined,
        message: message || undefined,
        date: date || undefined,
        time: time || undefined,
        sheetName: targetSheet,
      };

      console.log('🔧 Building Google Sheets payload for:', targetSheet);
      const cleanedPayload = buildGoogleSheetPayload(googlePayload, targetSheet);

      console.log('📤 Sending to Google Sheets:', cleanedPayload);

      const response = await axios.post(
        process.env.GOOGLE_SCRIPT_URL,
        cleanedPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      console.log('✅ Contact saved to Google Sheet:', response.status);
    } catch (err) {
      console.error('❌ Google Sheet Error:', err.response?.data || err.message);
      // Don't fail the request if Google Sheets fails - user data is safe in DB
    }

    res.status(201).json({ success: true, id: contact._id });
  } catch (error) {
    console.error('❌ Contact creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createContact };
