const Contact = require('../models/Contact');
const { buildGoogleSheetPayload, normalizeSheetName, postToGoogleSheets } = require('../utils/googleSheets');

const createContact = async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('📥 Incoming payload:', payload);

    const name = payload?.name != null ? String(payload.name).trim() : '';
    const email = payload?.email != null ? String(payload.email).trim() : '';
    const rawPhone = payload?.phone ?? payload?.mobile ?? '';
    const phone = String(rawPhone).trim();
    const message = payload?.message != null ? String(payload.message).trim() : '';
    const propertyDetails = payload?.propertyDetails != null ? String(payload.propertyDetails).trim() : '';
    const date = payload?.date != null ? String(payload.date).trim() : '';
    const time = payload?.time != null ? String(payload.time).trim() : '';
    const requestedSheetName = payload?.sheetName != null ? String(payload.sheetName).trim() : '';
    const targetSheet = normalizeSheetName(requestedSheetName);

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

    let googleSheetsSynced = false;
    let googleSheetsError = null;

    // 📊 SEND TO GOOGLE SHEETS
    try {
      const googlePayload = buildGoogleSheetPayload(
        {
          sheetName: targetSheet,
          name,
          phone: cleanPhone,
          email,
          message,
          date,
          time,
          propertyDetails,
        },
        targetSheet,
        contact.createdAt
      );

      await postToGoogleSheets({
        payload: googlePayload,
        context: `createContact/${targetSheet}`,
      });

      googleSheetsSynced = true;
      console.log('✅ Contact saved to Google Sheet');
    } catch (err) {
      googleSheetsError = err?.response?.data || err.message;
      console.error('❌ Google Sheet Error:', {
        message: err.message,
        status: err?.response?.status,
        data: err?.response?.data,
      });
    }

    res.status(201).json({
      success: true,
      id: contact._id,
      googleSheets: {
        synced: googleSheetsSynced,
        error: googleSheetsError,
      },
    });
  } catch (error) {
    console.error('❌ Contact creation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { createContact };
