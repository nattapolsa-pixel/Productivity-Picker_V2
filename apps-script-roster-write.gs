/**
 * apps-script-roster-write.gs — ตัวรับคำสั่งเติมข้อมูลทะเบียนพนักงานจากหน้าเว็บ V3
 *
 * ทำไมต้องเขียนที่ชีต 2ND เท่านั้น
 *   คอลัมน์ AG–AK ของ Results Master เป็นสูตร XLOOKUP ที่ดึงจาก 2ND
 *     AG กะ        = XLOOKUP(D, '2ND'!B:B, '2ND'!M:M, "Not Found Data")
 *     AH Zone      = XLOOKUP(D, '2ND'!B:B, '2ND'!J:J, "Not Found Data")
 *     AI สังกัด     = IFS(..., LEFT(D,6)="40HOUR","รายวัน", XLOOKUP(D,'2ND'!B:B,'2ND'!E:E,"Not Found Data"))
 *     AJ BU        = XLOOKUP(D, '2ND'!B:B, '2ND'!L:L, "Not Found Data")
 *     AK Pick Type = XLOOKUP(D, '2ND'!B:B, '2ND'!K:K, "Not Found Data")
 *   ถ้าเขียนค่าทับคอลัมน์เหล่านั้นสูตรจะหายถาวร จึงเติมที่ 2ND แล้วให้สูตรอัปเดตเอง
 *
 * คำเตือนเรื่อง Productivity
 *   AF AVERAGE = IF(AK="ช่วยงานส่วนอื่น","Not Count", IF(AND(G>3,F<1000),F,"Not Count"))
 *   การเติม Pick Type (2ND คอลัมน์ K) มีผลต่อ AK จึงมีผลต่อ AF และค่า Productivity ได้
 *   สคริปต์นี้จะบันทึกทุกการเปลี่ยนแปลงไว้ในชีต log เพื่อย้อนตรวจได้
 *
 * ขั้นตอนติดตั้ง (ทำครั้งเดียว ต้องทำในบัญชี Google ที่แก้ Sheet ได้)
 *   1. เปิด Google Sheet ปลายทาง → เมนู ส่วนขยาย (Extensions) → Apps Script
 *   2. วางไฟล์นี้ทั้งไฟล์ แล้วแก้ค่า WRITE_TOKEN ให้เป็นข้อความสุ่มของคุณเอง
 *   3. บันทึก → Deploy → New deployment → เลือก Web app
 *        Execute as: Me
 *        Who has access: Anyone   (โทเคนใน WRITE_TOKEN เป็นตัวกันคนอื่นเขียน)
 *   4. คัดลอก URL ที่ได้ (.../exec) ไปใส่ในหน้าเว็บ V3 ที่การ์ด "รหัสที่ต้องตามข้อมูล"
 *      พร้อมโทเคนเดียวกัน ค่านี้เก็บไว้ในเครื่องผู้ใช้ (localStorage) ไม่ถูก commit ลง repo
 *
 * สิ่งที่สคริปต์นี้ทำไม่ได้ตามที่ออกแบบไว้
 *   - ไม่เขียนชีตอื่นนอกจาก 2ND และชีต log
 *   - ไม่ลบแถวหรือล้างค่าใด ๆ
 *   - ไม่ทับค่าที่มีอยู่แล้ว ยกเว้นผู้ใช้ส่ง overwrite:true มาอย่างชัดเจน
 */

var SPREADSHEET_ID = '1PMnlyYHswnV0nE73Alxh-ocIFtTipB9LMzACdNM9GFs';
var ROSTER_SHEET = '2ND';
var LOG_SHEET = 'V3 Write Log';

/** เปลี่ยนเป็นข้อความสุ่มของคุณเองก่อน Deploy */
var WRITE_TOKEN = 'CHANGE-ME-ตั้งโทเคนของคุณเอง';

/** คอลัมน์ที่อนุญาตให้เขียนในชีต 2ND (1-based ตามหัวตารางจริง) */
var FIELDS = {
  userId:      { col: 2,  label: 'รหัสพนักงาน' },
  name:        { col: 3,  label: 'ชื่อ-นามสกุล (ไทย)' },
  nickname:    { col: 4,  label: 'ชื่อเล่น' },
  affiliation: { col: 5,  label: 'สังกัด' },
  role:        { col: 6,  label: 'หน้าที่รับผิดชอบ' },
  startDate:   { col: 7,  label: 'วันที่เริ่มทำงาน' },
  statusWork:  { col: 8,  label: 'Status Work' },
  trainingEnd: { col: 9,  label: 'วันที่จบการ Training' },
  zone:        { col: 10, label: 'Zone' },
  pickType:    { col: 11, label: 'Pick Type' },
  bu:          { col: 12, label: 'BU' },
  shift:       { col: 13, label: 'Ship กะ' }
};

function doGet() {
  return jsonOut({
    ok: true,
    service: 'V3 roster write',
    version: 1,
    target: ROSTER_SHEET,
    writableFields: Object.keys(FIELDS)
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return jsonOut({ ok: false, error: 'มีคำสั่งอื่นกำลังเขียนอยู่ กรุณาลองใหม่' });
  }
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!WRITE_TOKEN || WRITE_TOKEN.indexOf('CHANGE-ME') === 0) {
      return jsonOut({ ok: false, error: 'ยังไม่ได้ตั้ง WRITE_TOKEN ในสคริปต์' });
    }
    if (body.token !== WRITE_TOKEN) {
      return jsonOut({ ok: false, error: 'โทเคนไม่ถูกต้อง' });
    }
    var entries = body.rows;
    if (!entries || !entries.length) return jsonOut({ ok: false, error: 'ไม่มีรายการที่จะเติม' });
    if (entries.length > 200) return jsonOut({ ok: false, error: 'ส่งได้ไม่เกิน 200 รายการต่อครั้ง' });

    var book = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = book.getSheetByName(ROSTER_SHEET);
    if (!sheet) return jsonOut({ ok: false, error: 'ไม่พบชีต ' + ROSTER_SHEET });

    var lastRow = Math.max(sheet.getLastRow(), 1);
    var idColumn = lastRow > 1
      ? sheet.getRange(2, FIELDS.userId.col, lastRow - 1, 1).getDisplayValues()
      : [];
    var index = {};
    for (var i = 0; i < idColumn.length; i++) {
      var key = normalizeId(idColumn[i][0]);
      if (key && !(key in index)) index[key] = i + 2;
    }

    var applied = [], created = [], skipped = [], logRows = [];
    var actor = (Session.getActiveUser && Session.getActiveUser().getEmail()) || 'anonymous';
    var stamp = new Date();

    for (var n = 0; n < entries.length; n++) {
      var entry = entries[n] || {};
      var id = normalizeId(entry.userId);
      if (!id) { skipped.push({ userId: entry.userId, reason: 'ไม่มีรหัสพนักงาน' }); continue; }

      var row = index[id];
      var isNew = false;
      if (!row) {
        row = Math.max(sheet.getLastRow(), 1) + 1;
        sheet.getRange(row, FIELDS.userId.col).setValue(String(entry.userId).trim());
        index[id] = row;
        isNew = true;
        created.push(id);
        logRows.push([stamp, actor, id, FIELDS.userId.label, '', String(entry.userId).trim(), 'เพิ่มแถวใหม่']);
      }

      var fields = entry.fields || {};
      var changed = [];
      for (var name in fields) {
        if (!FIELDS.hasOwnProperty(name) || name === 'userId') {
          skipped.push({ userId: id, reason: 'ช่อง ' + name + ' ไม่อยู่ในรายการที่อนุญาต' });
          continue;
        }
        var value = fields[name];
        if (value === null || value === undefined) continue;
        value = String(value).trim();
        if (!value) continue;

        var cell = sheet.getRange(row, FIELDS[name].col);
        var before = String(cell.getDisplayValue() || '').trim();
        if (before && !isPlaceholder(before) && !entry.overwrite) {
          skipped.push({ userId: id, reason: 'ช่อง ' + FIELDS[name].label + ' มีค่าอยู่แล้ว (' + before + ')' });
          continue;
        }
        cell.setValue(value);
        changed.push(FIELDS[name].label);
        logRows.push([stamp, actor, id, FIELDS[name].label, before, value, isNew ? 'แถวใหม่' : 'เติมข้อมูล']);
      }
      if (changed.length) applied.push({ userId: id, row: row, fields: changed });
    }

    if (logRows.length) writeLog(book, logRows);
    SpreadsheetApp.flush();

    return jsonOut({
      ok: true,
      applied: applied,
      created: created,
      skipped: skipped,
      note: 'AF AVERAGE ขึ้นกับ Pick Type จึงอาจทำให้ค่า Productivity เปลี่ยน ตรวจได้จากชีต ' + LOG_SHEET
    });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function writeLog(book, rows) {
  var log = book.getSheetByName(LOG_SHEET);
  if (!log) {
    log = book.insertSheet(LOG_SHEET);
    log.appendRow(['เวลา', 'ผู้ใช้', 'รหัสพนักงาน', 'ช่อง', 'ค่าเดิม', 'ค่าใหม่', 'ประเภท']);
    log.setFrozenRows(1);
  }
  log.getRange(log.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

/** ให้ตรงกับ normalizeUserId_ ของ V1 เพื่อจับรหัสแบบเดียวกัน */
function normalizeId(value) {
  var text = String(value === null || value === undefined ? '' : value)
    .replace(/[​-‍﻿]/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/,/g, '')
    .replace(/[\s ]+/g, '')
    .trim();
  if (!text) return '';
  return text.replace(/\.0+$/, '').toUpperCase();
}

function isPlaceholder(text) {
  var t = String(text || '').trim();
  return !t || /^not\s?found(\s*data)?$/i.test(t) || /^#n\/a$/i.test(t) || t === '-';
}

function jsonOut(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
