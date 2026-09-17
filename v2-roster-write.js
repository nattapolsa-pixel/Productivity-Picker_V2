/* v2-roster-write.js — เติมข้อมูลทะเบียนพนักงานจากหน้าเว็บเข้าไปในชีต 2ND
   ผ่าน Apps Script web app ที่ผู้ใช้ Deploy เอง (ดู apps-script-roster-write.gs)

   ทำไมเขียนแค่ชีต 2ND
     Results Master คอลัมน์ AG–AK เป็นสูตร XLOOKUP ที่ดึงจาก 2ND
     เขียนทับคอลัมน์เหล่านั้นจะทำให้สูตรหายถาวร จึงเติมที่ 2ND แล้วให้สูตรอัปเดตเอง

   ต้องเตือนผู้ใช้
     AF AVERAGE = IF(AK="ช่วยงานส่วนอื่น","Not Count", IF(AND(G>3,F<1000),F,"Not Count"))
     การเติม Pick Type มีผลต่อ AK จึงมีผลต่อ AF และค่า Productivity ได้

   ค่าปลายทาง (URL + โทเคน) เก็บใน localStorage ของเครื่องผู้ใช้เท่านั้น ไม่อยู่ในไฟล์ repo
   ถ้ายังไม่ตั้งค่า หน้าเว็บยังใช้งานได้ปกติแบบอ่านอย่างเดียว และจะแสดงวิธีตั้งค่าให้ */
(() => {
  'use strict';

  const CONFIG_KEY = 'pickProductivityRosterWrite:v1';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ช่องที่เติมได้ ต้องตรงกับ FIELDS ใน apps-script-roster-write.gs */
  const FIELDS = [
    { key: 'name', label: 'ชื่อ-นามสกุล (ไทย)', col: '2ND C', missKeys: ['name', 'roster'] },
    { key: 'nickname', label: 'ชื่อเล่น', col: '2ND D', missKeys: ['roster'] },
    { key: 'affiliation', label: 'สังกัด', col: '2ND E', missKeys: ['aff', 'roster'] },
    { key: 'role', label: 'หน้าที่รับผิดชอบ', col: '2ND F', missKeys: ['roster'] },
    { key: 'startDate', label: 'วันที่เริ่มทำงาน', col: '2ND G', missKeys: ['start', 'roster'], placeholder: 'เช่น 20/03/2026' },
    { key: 'statusWork', label: 'Status Work', col: '2ND H', missKeys: ['roster'], placeholder: 'เช่น Work' },
    { key: 'zone', label: 'Zone', col: '2ND J', missKeys: ['zone', 'roster'] },
    { key: 'pickType', label: 'Pick Type', col: '2ND K', missKeys: ['type', 'roster'], warn: true },
    { key: 'bu', label: 'BU', col: '2ND L', missKeys: ['bu', 'roster'] },
    { key: 'shift', label: 'Ship กะ', col: '2ND M', missKeys: ['shift', 'roster'], placeholder: 'เช่น A / B / C' }
  ];

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); return true; }
    catch (e) { return false; }
  }
  function clearConfig() {
    try { localStorage.removeItem(CONFIG_KEY); } catch (e) {}
  }

  function isConfigured() {
    const c = loadConfig();
    return Boolean(c && c.url && c.token);
  }

  /* ── กล่องตั้งค่าปลายทาง ── */
  function settingsHtml() {
    const c = loadConfig() || {};
    return `<div class="rw-panel" data-rw-settings>
      <h4>ตั้งค่าการเขียนกลับชีต 2ND</h4>
      <p>ต้อง Deploy ไฟล์ <code>apps-script-roster-write.gs</code> เป็น Apps Script web app ก่อนหนึ่งครั้ง
        (เปิด Sheet → ส่วนขยาย → Apps Script → วางไฟล์ → Deploy → Web app, Execute as: Me, Who has access: Anyone)
        แล้วนำ URL ที่ลงท้าย <code>/exec</code> กับโทเคนที่ตั้งไว้ในไฟล์มาใส่ที่นี่
        ค่านี้เก็บไว้ในเครื่องนี้เท่านั้น ไม่ถูกส่งไปที่อื่นและไม่อยู่ในโค้ดที่เผยแพร่</p>
      <label>URL ของ Web app
        <input type="url" data-rw-url placeholder="https://script.google.com/macros/s/..../exec" value="${esc(c.url || '')}">
      </label>
      <label>โทเคน (ตรงกับ WRITE_TOKEN ในสคริปต์)
        <input type="password" data-rw-token placeholder="โทเคนของคุณ" value="${esc(c.token || '')}">
      </label>
      <div class="rw-actions">
        <button type="button" data-rw-save class="rw-btn rw-btn-primary">บันทึกค่า</button>
        <button type="button" data-rw-test class="rw-btn">ทดสอบการเชื่อมต่อ</button>
        ${c.url ? '<button type="button" data-rw-forget class="rw-btn rw-btn-ghost">ลบค่าออกจากเครื่องนี้</button>' : ''}
      </div>
      <div class="rw-msg" data-rw-msg></div>
    </div>`;
  }

  function bindSettings(root, onChange) {
    const panel = root.querySelector('[data-rw-settings]');
    if (!panel) return;
    const msg = panel.querySelector('[data-rw-msg]');
    const urlEl = panel.querySelector('[data-rw-url]');
    const tokenEl = panel.querySelector('[data-rw-token]');
    const say = (text, tone) => { msg.className = 'rw-msg' + (tone ? ' is-' + tone : ''); msg.textContent = text; };

    panel.querySelector('[data-rw-save]').addEventListener('click', () => {
      const url = urlEl.value.trim(), token = tokenEl.value.trim();
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url) || !url.endsWith('/exec')) {
        say('URL ต้องเป็นลิงก์ Apps Script web app ที่ลงท้ายด้วย /exec', 'warn');
        return;
      }
      if (!token) { say('ต้องใส่โทเคนให้ตรงกับ WRITE_TOKEN ในสคริปต์', 'warn'); return; }
      if (!saveConfig({ url, token })) { say('บันทึกไม่สำเร็จ เบราว์เซอร์ปิด localStorage อยู่', 'warn'); return; }
      say('บันทึกแล้ว', 'good');
      if (onChange) onChange();
    });

    panel.querySelector('[data-rw-test]').addEventListener('click', async () => {
      const url = urlEl.value.trim();
      if (!url) { say('ใส่ URL ก่อน', 'warn'); return; }
      say('กำลังทดสอบ…');
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        const text = await res.text();
        let payload = null;
        try { payload = JSON.parse(text); } catch (e) {}
        if (payload && payload.ok) say('เชื่อมต่อได้ · ปลายทางคือชีต ' + (payload.target || '2ND'), 'good');
        else say('ตอบกลับไม่ใช่รูปแบบที่คาดไว้ ตรวจว่า Deploy เป็น Web app และตั้ง Who has access เป็น Anyone', 'warn');
      } catch (e) {
        say('เชื่อมต่อไม่ได้: ' + e.message + ' (ถ้าเป็น CORS ให้ตรวจว่า Deploy ใหม่หลังแก้โค้ดแล้ว)', 'warn');
      }
    });

    const forget = panel.querySelector('[data-rw-forget]');
    if (forget) forget.addEventListener('click', () => {
      clearConfig();
      say('ลบค่าออกจากเครื่องนี้แล้ว', 'good');
      if (onChange) onChange();
    });
  }

  /* ── ฟอร์มเติมข้อมูลรายคน ── */
  function formHtml(person, missKeys) {
    const rows = FIELDS.filter((f) => missKeys.some((k) => f.missKeys.includes(k)));
    const list = (rows.length ? rows : FIELDS);
    return `<div class="rw-panel" data-rw-form data-rw-id="${esc(person.id)}">
      <h4>เติมข้อมูลของ ${esc(person.id)}${person.name && person.name !== 'Not Found' ? ' · ' + esc(person.name) : ''}</h4>
      <p>เขียนลงชีต <b>2ND</b> เท่านั้น แล้วสูตร XLOOKUP ใน Results Master จะอัปเดตค่า AG–AK ให้เอง
        · เว้นช่องที่ไม่ทราบไว้ได้ ระบบจะไม่เขียนช่องว่าง</p>
      <div class="rw-grid">
        ${list.map((f) => `<label>${esc(f.label)} <span class="rw-col">${esc(f.col)}</span>
          <input type="text" data-rw-field="${f.key}" placeholder="${esc(f.placeholder || '')}">
          ${f.warn ? '<em class="rw-warn">เติมช่องนี้มีผลต่อ AF และค่า Productivity</em>' : ''}
        </label>`).join('')}
      </div>
      <label class="rw-check"><input type="checkbox" data-rw-overwrite> ทับค่าที่มีอยู่แล้ว (ปกติเติมเฉพาะช่องว่าง)</label>
      <div class="rw-actions">
        <button type="button" data-rw-submit class="rw-btn rw-btn-primary">ส่งเข้า Sheet</button>
        <button type="button" data-rw-cancel class="rw-btn rw-btn-ghost">ปิด</button>
      </div>
      <div class="rw-msg" data-rw-msg></div>
    </div>`;
  }

  async function submitForm(panel, person) {
    const msg = panel.querySelector('[data-rw-msg]');
    const say = (text, tone) => { msg.className = 'rw-msg' + (tone ? ' is-' + tone : ''); msg.innerHTML = text; };
    const cfg = loadConfig();
    if (!cfg) { say('ยังไม่ได้ตั้งค่าปลายทาง', 'warn'); return; }

    const fields = {};
    panel.querySelectorAll('[data-rw-field]').forEach((el) => {
      const v = el.value.trim();
      if (v) fields[el.dataset.rwField] = v;
    });
    if (!Object.keys(fields).length) { say('ยังไม่ได้กรอกช่องใดเลย', 'warn'); return; }

    const overwrite = panel.querySelector('[data-rw-overwrite]').checked;
    if (fields.pickType && !window.confirm(
      'การเติม Pick Type มีผลต่อสูตร AF ของ Results Master จึงทำให้ค่า Productivity เปลี่ยนได้\n\n'
      + 'รหัส ' + person.id + ' → Pick Type = ' + fields.pickType + '\n\nยืนยันส่งเข้า Sheet?')) return;

    say('กำลังส่ง…');
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: cfg.token, rows: [{ userId: person.id, fields, overwrite }] })
      });
      const payload = JSON.parse(await res.text());
      if (!payload.ok) { say('ไม่สำเร็จ: ' + esc(payload.error || 'ไม่ทราบสาเหตุ'), 'warn'); return; }
      const applied = (payload.applied || []).flatMap((a) => a.fields);
      const created = (payload.created || []).length;
      const skipped = payload.skipped || [];
      say([
        applied.length ? '<b>เขียนแล้ว:</b> ' + esc(applied.join(', ')) : 'ไม่มีช่องที่ถูกเขียน',
        created ? 'เพิ่มแถวใหม่ในชีต 2ND' : '',
        skipped.length ? '<b>ข้าม:</b> ' + esc(skipped.map((s) => s.reason).join(' · ')) : '',
        'กด <b>รีเฟรช</b> บนแถบด้านบนเพื่อดึงค่าใหม่จาก Sheet'
      ].filter(Boolean).join('<br>'), applied.length ? 'good' : 'warn');
    } catch (e) {
      say('ส่งไม่สำเร็จ: ' + esc(e.message), 'warn');
    }
  }

  /* ── จุดเชื่อมที่ v2-staff.js เรียกใช้ ── */
  window.V3RosterWrite = {
    isConfigured,
    /** ปุ่มในตาราง Not Found */
    buttonHtml(person) {
      return `<button type="button" class="rw-open" data-rw-open="${esc(person.id)}">✏️ เติมข้อมูล</button>`;
    },
    /** แถบสถานะบนการ์ด Not Found */
    statusHtml() {
      return isConfigured()
        ? `<span class="rw-status is-on">✏️ เติมข้อมูลเข้า Sheet ได้ <button type="button" class="rw-link" data-rw-config>ตั้งค่า</button></span>`
        : `<span class="rw-status">อ่านอย่างเดียว · <button type="button" class="rw-link" data-rw-config>เปิดการเขียนกลับ Sheet</button></span>`;
    },
    /** ผูกปุ่มทั้งหมดในคอนเทนเนอร์ โดยหาคนจาก getPerson(id) */
    bind(container, getPerson, onRerender) {
      if (!container) return;
      let host = container.querySelector('[data-rw-host]');
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-rw-host', '');
        container.appendChild(host);
      }
      const close = () => { host.innerHTML = ''; };

      container.querySelectorAll('[data-rw-config]').forEach((b) => b.addEventListener('click', () => {
        host.innerHTML = settingsHtml();
        bindSettings(host, () => { close(); if (onRerender) onRerender(); });
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));

      container.querySelectorAll('[data-rw-open]').forEach((b) => b.addEventListener('click', () => {
        const person = getPerson(b.dataset.rwOpen);
        if (!person) return;
        if (!isConfigured()) {
          host.innerHTML = settingsHtml();
          bindSettings(host, () => { close(); if (onRerender) onRerender(); });
        } else {
          host.innerHTML = formHtml(person, person.missKeys || []);
          const panel = host.querySelector('[data-rw-form]');
          panel.querySelector('[data-rw-submit]').addEventListener('click', () => submitForm(panel, person));
          panel.querySelector('[data-rw-cancel]').addEventListener('click', close);
        }
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }));
    }
  };
})();
