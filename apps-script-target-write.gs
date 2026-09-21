/**
 * apps-script-target-write.gs — ตัวรับคำสั่งบันทึก Target ของทีมจากหน้าเว็บ V3
 *
 * ทำไมต้องมีไฟล์นี้
 *   เว็บ V3 เป็นไฟล์นิ่ง ๆ (static) และอ่าน Google Sheets แบบอ่านอย่างเดียว
 *   จึงไม่มีที่เก็บค่ากลางให้ "กดบันทึกแล้วทุกคนเห็น" ได้เอง
 *   สคริปต์นี้เป็นปลายทางเขียนตัวเดียวของเรื่อง Target โดยเฉพาะ
 *
 * เก็บค่าไว้ที่ไหน
 *   แท็บ 'V3 Target' ในสเปรดชีตเดียวกับ Results Master (สคริปต์สร้างแท็บให้เองครั้งแรก)
 *   คอลัมน์ A คีย์ · B ค่า · C อัปเดตเมื่อ · D โดย
 *   หน้าเว็บอ่านแท็บนี้ตรง ๆ แบบอ่านอย่างเดียวเหมือนที่อ่านแท็บอื่น
 *   ถ้าสคริปต์นี้พังหรือถูกลบ หน้าเว็บยังอ่าน Target ได้ตามปกติ (แค่บันทึกใหม่ไม่ได้)
 *
 * สิ่งที่สคริปต์นี้ทำไม่ได้ตามที่ออกแบบไว้
 *   - ไม่แตะแท็บ Results Master / 2ND / Update name / Zone_V2 เลย
 *   - ไม่ลบแถวและไม่ลบแท็บ เขียนเฉพาะ 'V3 Target' กับแท็บ log
 *   - รับได้เฉพาะ 20 คีย์ที่กำหนดไว้ และค่าต้องเป็นจำนวนเต็ม 1-1000
 *     คีย์แปลกปลอมหรือค่านอกช่วงถูกปฏิเสธทั้งคำขอ ไม่เขียนบางส่วน
 *
 * ขั้นตอนติดตั้ง (ทำครั้งเดียว ต้องทำในบัญชี Google ที่แก้ Sheet ได้)
 *   1. เปิด Google Sheet ของ Results Master → เมนู ส่วนขยาย (Extensions) → Apps Script
 *      ควรสร้างเป็นโปรเจกต์แยกจาก apps-script-roster-write.gs เพื่อลบของเดิมได้อิสระ
 *   2. วางไฟล์นี้ทั้งไฟล์ แล้วแก้ WRITE_TOKEN ให้เป็นข้อความสุ่มของคุณเอง
 *   3. บันทึก → Deploy → New deployment → เลือก Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. คัดลอก URL ที่ได้ (.../exec) กับโทเคน ส่งให้ผู้ดูแลใส่ใน data/targets.json
 *      ช่อง write.url และ write.token แล้ว push — ปุ่มบันทึกในหน้าเว็บจะใช้งานได้ทุกเครื่อง
 *
 * ข้อควรรู้เรื่องความปลอดภัย
 *   URL กับโทเคนถูก commit ลง repo เพื่อให้ทุกคนกดบันทึกได้โดยไม่ต้องตั้งค่าเอง
 *   ใครที่เปิดเว็บหรือเปิด repo ได้ จึงเปลี่ยน Target ได้ด้วย
 *   ตัวกันความเสียหายคือขอบเขตที่แคบ (เขียนได้แค่แท็บ Target) บวกกับ log ทุกการเปลี่ยนแปลง
 *   และ version history ของ Google Sheet ซึ่งย้อนกลับได้
 *   ถ้าไม่ยอมรับความเสี่ยงนี้ ให้ย้าย url/token ไปเก็บใน localStorage ของแต่ละเครื่องแทน
 */

var SPREADSHEET_ID = '1PMnlyYHswnV0nE73Alxh-ocIFtTipB9LMzACdNM9GFs';
var TARGET_SHEET = 'V3 Target';
var LOG_SHEET = 'V3 Target Log';

/** เปลี่ยนเป็นข้อความสุ่มของคุณเองก่อน Deploy */
var WRITE_TOKEN = 'CHANGE-ME-ตั้งโทเคนของคุณเอง';

var MIN_TARGET = 1;
var MAX_TARGET = 1000;

/** 20 คีย์ที่อนุญาต ต้องตรงกับ DEFAULT_TARGETS ใน script.js และช่องในหน้าต่างตั้งค่า */
var TARGET_KEYS = [
  'overall', 'fullRack', 'halfRack', 'ea', 'pickToSort', 'mezzanine', 'training',
  'fullRackAhAi', 'fullRackAlBlBmAm',
  'halfRackAjAk', 'halfRackAnCaBnDa', 'halfRackBgBh', 'halfRackBiBk',
  'halfRackCbDbDcCc', 'halfRackCdCe', 'halfRackDdDe', 'halfRackCfDf',
  'microEa', 'microFa', 'pickToSortBe'
];

function doGet() {
  try {
    var current = readTargets();
    return jsonOut({
      ok: true,
      service: 'V3 target write',
      version: 1,
      sheet: TARGET_SHEET,
      tokenReady: isTokenReady(),
      updatedAt: current.updatedAt,
      updatedBy: current.updatedBy,
      targets: current.targets
    });
  } catch (err) {
    return jsonOut({ ok: false, error: errText(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOut({ ok: false, error: 'มีคำสั่งอื่นกำลังเขียนอยู่ กรุณาลองใหม่' });
  }
  try {
    if (!isTokenReady()) {
      return jsonOut({ ok: false, error: 'ยังไม่ได้ตั้ง WRITE_TOKEN ในสคริปต์' });
    }
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.token !== WRITE_TOKEN) {
      return jsonOut({ ok: false, error: 'โทเคนไม่ถูกต้อง' });
    }

    /* ตรวจให้ครบก่อนเขียน ถ้ามีช่องไหนผิดให้ปฏิเสธทั้งคำขอ
       ไม่เขียนบางส่วน เพราะ Target ครึ่ง ๆ กลาง ๆ อ่านผิดยิ่งกว่าไม่ได้บันทึกเลย */
    var incoming = body.targets;
    if (!incoming || typeof incoming !== 'object') {
      return jsonOut({ ok: false, error: 'ไม่พบค่า targets ในคำขอ' });
    }
    var clean = {};
    for (var i = 0; i < TARGET_KEYS.length; i++) {
      var key = TARGET_KEYS[i];
      var raw = Number(incoming[key]);
      if (!isFinite(raw) || Math.round(raw) < MIN_TARGET || Math.round(raw) > MAX_TARGET) {
        return jsonOut({
          ok: false,
          error: 'ค่าของ ' + key + ' ต้องเป็นตัวเลข ' + MIN_TARGET + '-' + MAX_TARGET + ' (ได้ ' + incoming[key] + ')'
        });
      }
      clean[key] = Math.round(raw);
    }
    var extra = [];
    for (var k in incoming) {
      if (TARGET_KEYS.indexOf(k) === -1) extra.push(k);
    }
    if (extra.length) {
      return jsonOut({ ok: false, error: 'มีคีย์ที่ไม่รู้จัก: ' + extra.join(', ') });
    }

    var book = SpreadsheetApp.openById(SPREADSHEET_ID);
    var before = readTargets(book).targets;
    var stamp = nowIso();
    var who = String(body.updatedBy || '').trim() || activeUser() || 'หน้าเว็บ V3';

    writeTargets(book, clean, stamp, who);

    /* log เฉพาะช่องที่ค่าเปลี่ยนจริง เพื่อให้ไล่ย้อนได้ว่าใครเปลี่ยนอะไรเมื่อไร */
    var changes = [];
    for (var j = 0; j < TARGET_KEYS.length; j++) {
      var kk = TARGET_KEYS[j];
      var old = before && before[kk] !== undefined ? before[kk] : '';
      if (String(old) !== String(clean[kk])) {
        changes.push([stamp, who, kk, old, clean[kk]]);
      }
    }
    if (changes.length) writeLog(book, changes);

    return jsonOut({
      ok: true,
      updatedAt: stamp,
      updatedBy: who,
      changed: changes.length,
      sheet: TARGET_SHEET,
      targets: clean
    });
  } catch (err) {
    return jsonOut({ ok: false, error: errText(err) });
  } finally {
    lock.releaseLock();
  }
}

/** อ่านค่าที่บันทึกไว้ คืน targets ว่างถ้ายังไม่มีแท็บ (ยังไม่เคยบันทึก) */
function readTargets(book) {
  var out = { targets: null, updatedAt: '', updatedBy: '' };
  var wb = book || SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = wb.getSheetByName(TARGET_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return out;

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  var targets = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key || TARGET_KEYS.indexOf(key) === -1) continue;
    var value = Number(values[i][1]);
    if (!isFinite(value) || value <= 0) continue;
    targets[key] = Math.round(value);
    if (!out.updatedAt && values[i][2]) out.updatedAt = String(values[i][2]);
    if (!out.updatedBy && values[i][3]) out.updatedBy = String(values[i][3]);
  }
  out.targets = targets;
  return out;
}

function writeTargets(book, targets, stamp, who) {
  var sheet = book.getSheetByName(TARGET_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(TARGET_SHEET);
    sheet.appendRow(['key', 'value', 'updatedAt', 'updatedBy']);
    sheet.setFrozenRows(1);
  }
  var rows = [];
  for (var i = 0; i < TARGET_KEYS.length; i++) {
    rows.push([TARGET_KEYS[i], targets[TARGET_KEYS[i]], stamp, who]);
  }
  /* เขียนทับทั้งบล็อกในครั้งเดียว จำนวนแถวคงที่เท่ากับจำนวนคีย์เสมอ
     ไม่ใช้ clear() เพื่อไม่ให้มีจังหวะที่แท็บว่างแล้วหน้าเว็บอ่านไปเจอ */
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  var extraRows = sheet.getLastRow() - (rows.length + 1);
  if (extraRows > 0) {
    sheet.getRange(rows.length + 2, 1, extraRows, 4).clearContent();
  }
}

function writeLog(book, rows) {
  var log = book.getSheetByName(LOG_SHEET);
  if (!log) {
    log = book.insertSheet(LOG_SHEET);
    log.appendRow(['เวลา', 'โดย', 'คีย์', 'ค่าเดิม', 'ค่าใหม่']);
    log.setFrozenRows(1);
  }
  log.getRange(log.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

function isTokenReady() {
  return Boolean(WRITE_TOKEN) && WRITE_TOKEN.indexOf('CHANGE-ME') !== 0;
}

function activeUser() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

function nowIso() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function errText(err) {
  return String(err && err.message ? err.message : err);
}

function jsonOut(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
