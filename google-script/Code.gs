/**
 * Chemical Set Record - sync backend (Google Apps Script).
 * Keeps one row per item in the "SYNC" tab of this Google Sheet:
 *   key | value (JSON text) | rev
 * The web page sends its changes and receives everything that changed since its last visit.
 */

// >>> CHANGE THIS to your own secret access code (letters and numbers), then Deploy. <<<
var ACCESS_CODE = 'CHANGE-ME';

var TAB = 'SYNC';

function doGet() {
  return ContentService.createTextOutput('Chemical Set Record sync is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (ACCESS_CODE === 'CHANGE-ME') out = { ok: false, error: 'SETUP', message: 'Set ACCESS_CODE in the script first.' };
    else if (req.code !== ACCESS_CODE) out = { ok: false, error: 'AUTH', message: 'Wrong access code.' };
    else if (req.action === 'ping') out = { ok: true, rev: currentRev_() };
    else if (req.action === 'sync') out = sync_(req);
    else out = { ok: false, error: 'UNKNOWN', message: 'Unknown action.' };
  } catch (err) {
    out = { ok: false, error: 'SERVER', message: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function currentRev_() {
  return Number(PropertiesService.getScriptProperties().getProperty('rev') || 0);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TAB);
  if (!sh) {
    sh = ss.insertSheet(TAB);
    sh.getRange(1, 1, 1, 3).setValues([['key', 'value', 'rev']]);
    sh.getRange('A:B').setNumberFormat('@');   // plain text, so Sheets never reformats keys or JSON
    sh.setFrozenRows(1);
  }
  return sh;
}

function sync_(req) {
  var since = Number(req.since || 0);
  var changes = req.changes || [];
  // nothing to send and nothing new: answer at once without opening the sheet
  if (!changes.length && since === currentRev_()) return { ok: true, rev: since, changes: [] };

  for (var i = 0; i < changes.length; i++) {
    if (typeof changes[i].key !== 'string' || !changes[i].key) return { ok: false, error: 'BAD', message: 'Change without a key.' };
    if (changes[i].value != null && String(changes[i].value).length > 49000) return { ok: false, error: 'TOO_BIG', message: 'Item too large: ' + changes[i].key };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var props = PropertiesService.getScriptProperties();
    var rev = Number(props.getProperty('rev') || 0);
    var sh = sheet_();
    var n = sh.getLastRow() - 1;
    var values = n > 0 ? sh.getRange(2, 1, n, 3).getValues() : [];
    if (changes.length) {
      var index = {};
      for (var r = 0; r < values.length; r++) index[String(values[r][0])] = r;
      rev++;
      changes.forEach(function (c) {
        var v = c.value == null ? '' : String(c.value);   // '' = deleted (kept so other devices learn about it)
        if (index.hasOwnProperty(c.key)) { values[index[c.key]][1] = v; values[index[c.key]][2] = rev; }
        else { index[c.key] = values.length; values.push([c.key, v, rev]); }
      });
      sh.getRange(2, 1, values.length, 3).setValues(values);
      props.setProperty('rev', String(rev));
    }
    var out = [];
    for (var k = 0; k < values.length; k++) {
      if (Number(values[k][2]) > since) out.push({ key: String(values[k][0]), value: values[k][1] === '' ? null : String(values[k][1]) });
    }
    return { ok: true, rev: rev, changes: out };
  } finally {
    lock.releaseLock();
  }
}
