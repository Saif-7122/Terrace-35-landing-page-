// ============================================================
// Terrace 35 — Lead Capture → Google Sheets
// Sheet ID: 1Ie9UyjYn6MdeFAtkAyWzkv-GFwA2tvBy0E3z2v-J-wQ
//
// DEPLOY INSTRUCTIONS:
//   1. Open https://script.google.com
//   2. Create a New Project → paste this code
//   3. Click Deploy → New Deployment
//   4. Type: Web app
//   5. Execute as: Me
//   6. Who has access: Anyone
//   7. Click Deploy → Copy the Web App URL
//   8. Paste that URL as LEAD_WEBHOOK_URL in assets/js/t35.js
// ============================================================

var SHEET_ID   = '1Ie9UyjYn6MdeFAtkAyWzkv-GFwA2tvBy0E3z2v-J-wQ';
var SHEET_NAME = 'Leads'; // Will auto-create this tab if it doesn't exist

var COLUMNS = [
  'Timestamp', 'Name', 'Phone', 'Interested In', 'Timeline',
  'Buyer Type', 'Budget', 'Source', 'Traffic Source',
  'UTM Campaign', 'UTM Source', 'UTM Medium', 'GCLID', 'FB Click ID',
  'Page', 'Referrer', 'Submitted At'
];

function getSheet() {
  var ss   = SpreadsheetApp.openById(SHEET_ID);
  var sh   = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNS.length)
      .setBackground('#04234A')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
  }
  return sh;
}

function doPost(e) {
  try {
    var p   = e.parameter || {};
    var now = new Date();

    getSheet().appendRow([
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      p.name        || '',
      p.phone       || '',
      p.product     || '',
      p.timeline    || '',
      p.buyer       || '',
      p.budget      || '',
      p.source      || '',
      p.traffic_source || '',
      p.utm_campaign   || '',
      p.utm_source     || '',
      p.utm_medium     || '',
      p.gclid          || '',
      p.fbclid         || '',
      p.page           || '',
      p.referrer       || '',
      p.submitted_at   || now.toISOString()
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test via GET so you can verify the script is live
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Terrace 35 lead webhook is live.' }))
    .setMimeType(ContentService.MimeType.JSON);
}
