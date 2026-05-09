/**
 * Google Apps Script web app endpoint for lead capture.
 * Deploy as: Execute as "Me", Who has access: "Anyone"
 */
const SHEET_FIELDS = {
  'Contact': ['name', 'phone', 'email', 'message', 'createdAt'],
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

const SHEET_NAME_MAP = {
  'contact': 'Contact',
  'schedule a visit': 'Schedule a visit',
  'sell your property': 'Sell Your Property',
  'brochure leads': 'Brochure Leads',
};

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_(400, {
        success: false,
        error: 'Missing POST body',
      });
    }

    const rawBody = e.postData.contents;
    Logger.log('[Sheets] Raw request body: %s', rawBody);

    const payload = JSON.parse(rawBody);
    const normalizedSheet = normalizeSheetName_(payload.sheetName);
    const fields = SHEET_FIELDS[normalizedSheet];

    if (!fields) {
      return jsonResponse_(400, {
        success: false,
        error: 'Invalid sheetName',
        receivedSheetName: payload.sheetName || '',
      });
    }

    const rowData = buildRowData_(payload, fields);
    Logger.log('[Sheets] sheet=%s fields=%s', normalizedSheet, JSON.stringify(fields));
    Logger.log('[Sheets] row=%s', JSON.stringify(rowData));

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(normalizedSheet);
    if (!sheet) {
      return jsonResponse_(404, {
        success: false,
        error: 'Sheet tab not found',
        sheetName: normalizedSheet,
      });
    }

    const expectedHeaders = fields;
    const currentHeaders = getHeaderRow_(sheet, expectedHeaders.length);
    if (!arrayEquals_(expectedHeaders, currentHeaders)) {
      Logger.log(
        '[Sheets] Header mismatch. expected=%s actual=%s',
        JSON.stringify(expectedHeaders),
        JSON.stringify(currentHeaders)
      );
      return jsonResponse_(400, {
        success: false,
        error: 'Header mismatch in sheet',
        sheetName: normalizedSheet,
        expectedHeaders,
        currentHeaders,
      });
    }

    sheet.appendRow(rowData);
    return jsonResponse_(200, { success: true, sheetName: normalizedSheet });
  } catch (error) {
    Logger.log('[Sheets] ERROR: %s', error && error.stack ? error.stack : String(error));
    return jsonResponse_(500, {
      success: false,
      error: error && error.message ? error.message : 'Unknown server error',
    });
  }
}

function normalizeSheetName_(value) {
  const key = String(value || '').trim().toLowerCase();
  return SHEET_NAME_MAP[key] || 'Contact';
}

function buildRowData_(payload, fields) {
  const createdAt = payload.createdAt ? String(payload.createdAt).trim() : new Date().toISOString();
  return fields.map(function (field) {
    if (field === 'createdAt') return createdAt;
    const value = payload[field];
    if (value == null) return '';
    return typeof value === 'string' ? value.trim() : value;
  });
}

function getHeaderRow_(sheet, width) {
  return sheet.getRange(1, 1, 1, width).getValues()[0].map(function (v) {
    return String(v || '').trim();
  });
}

function arrayEquals_(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function jsonResponse_(status, data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
