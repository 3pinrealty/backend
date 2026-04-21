const Contact = require('../models/Contact');
const Property = require('../models/Property');
const axios = require('axios');

const createContact = async (req, res) => {
  try {
    const payload = req.body || {};
    const name = payload?.name != null ? String(payload.name).trim() : '';
    const email = payload?.email != null ? String(payload.email).trim() : '';
    const rawPhone = payload?.phone ?? payload?.mobile ?? '';
    const phone = String(rawPhone).trim();
    const message = payload?.message != null ? String(payload.message).trim() : '';
    const date = payload?.date != null ? String(payload.date).trim() : '';
    const time = payload?.time != null ? String(payload.time).trim() : '';
    const leadType = payload?.leadType != null ? String(payload.leadType).trim() : '';
    const propertyId = payload?.propertyId != null ? String(payload.propertyId).trim() : '';
    const propertyTitle = payload?.propertyTitle != null ? String(payload.propertyTitle).trim() : '';
    const requestedSheetName = payload?.sheetName != null ? String(payload.sheetName).trim() : '';
    const targetSheet =
      leadType === 'schedule_visit' || requestedSheetName === 'Schedule a visit'
        ? 'Schedule a visit'
        : leadType === 'sell_property' || requestedSheetName === 'Sell Your Property'
          ? 'Sell Your Property'
          : 'Contact';
    const isScheduleVisit = targetSheet === 'Schedule a visit';

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (!/^\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    // 💾 Save in DB
    const contact = await Contact.create({
      name,
      email: email ? email.toLowerCase() : undefined,
      phone: cleanPhone,
      message: message || undefined,
      date: date || undefined,
      time: time || undefined,
    });

    // 📊 SEND TO GOOGLE SHEET (same pattern as brochure)
    try {
      if (!process.env.GOOGLE_SCRIPT_URL) {
        throw new Error('GOOGLE_SCRIPT_URL is not configured');
      }

      let resolvedPropertyId = '';
      let resolvedPropertyTitle = '';
      let resolvedPropertyLocation = '';
      let resolvedPropertyUrl = '';

      if (isScheduleVisit && propertyId) {
        try {
          const property = await Property.findById(propertyId).select('_id title location');
          if (property) {
            resolvedPropertyId = String(property._id);
            resolvedPropertyTitle = String(property.title || '').trim();
            resolvedPropertyLocation = String(property.location || '').trim();
          }
        } catch (propErr) {
          console.error('⚠️ Property lookup failed for schedule lead:', propErr.message);
        }
      }

      const frontendBaseUrl = String(
        process.env.FRONTEND_BASE_URL ||
        process.env.FRONTEND_URL ||
        process.env.WEBSITE_URL ||
        ''
      ).trim();

      if (resolvedPropertyId && frontendBaseUrl) {
        resolvedPropertyUrl = `${frontendBaseUrl.replace(/\/+$/, '')}/property/${encodeURIComponent(resolvedPropertyId)}`;
      }

      const response = await axios.post(
        process.env.GOOGLE_SCRIPT_URL,
        {
          name,
          phone: cleanPhone,
          mobile: cleanPhone,
          email,
          emailId: email,
          mail: email,
          message,
          propertyDetails: message,
          details: message,
          notes: message,
          date: date || '',
          time: time || '',
          leadType: leadType || undefined,
          propertyId: resolvedPropertyId || propertyId || undefined,
          property: resolvedPropertyTitle || propertyTitle || undefined,
          propertyTitle: resolvedPropertyTitle || propertyTitle || undefined,
          propertyLocation: resolvedPropertyLocation || undefined,
          propertyUrl: resolvedPropertyUrl || undefined,
          sheetName: targetSheet,
        },
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
    }

    res.status(201).json({ success: true, id: contact._id });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createContact };