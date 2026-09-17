/* v2-roster-write.js — หน้าต่างกรอกข้อมูลพนักงานที่ยังไม่มีทะเบียน
   ตอนนี้ยังไม่ส่งข้อมูลออกไปที่ Google Sheet ตามที่ผู้ใช้สั่ง
   กรอกแล้วเก็บไว้ในเครื่องนี้ (localStorage) และ Export CSV ไปกรอกใน Sheet เองได้
   ไม่มีการเรียก Apps Script และไม่มีกล่องตั้งค่า URL/โทเคนในหน้าเว็บ

   ไฟล์ apps-script-roster-write.gs ยังอยู่ในโปรเจกต์เผื่อเปิดใช้ทีหลัง
   ถ้าจะต่อของจริง ให้เพิ่มการยิง POST ในฟังก์ชัน submitForm() เท่านั้น ที่เหลือใช้ได้เลย */
(() => {
  'use strict';

  const DRAFT_KEY = 'pickProductivityRosterDraft:v1';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

  /* ช่องที่ให้กรอก พร้อมบอกว่าปลายทางคือคอลัมน์ไหนของชีต 2ND */
  const FIELDS = [
    { key: 'name', label: 'ชื่อ-นามสกุล (ไทย)', col: '2ND C' },
    { key: 'nickname', label: 'ชื่อเล่น', col: '2ND D' },
    { key: 'affiliation', label: 'สังกัด', col: '2ND E' },
    { key: 'role', label: 'หน้าที่รับผิดชอบ', col: '2ND F' },
    { key: 'startDate', label: 'วันที่เริ่มทำงาน', col: '2ND G', placeholder: 'เช่น 20/03/2026' },
    { key: 'statusWork', label: 'Status Work', col: '2ND H', placeholder: 'เช่น Work' },
    { key: 'zone', label: 'Zone', col: '2ND J' },
    { key: 'pickType', label: 'Pick Type', col: '2ND K', note: 'ค่านี้มีผลต่อสูตร AF และ Productivity' },
    { key: 'bu', label: 'BU', col: '2ND L' },
    { key: 'shift', label: 'Ship กะ', col: '2ND M', placeholder: 'เช่น A / B / C' }
  ];

  function loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }
  function saveDrafts(all) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(all)); return true; }
    catch (e) { return false; }
  }
  function draftCount() { return Object.keys(loadDrafts()).length; }

  function exportDrafts() {
    const all = loadDrafts();
    const ids = Object.keys(all);
    if (!ids.length) return;
    const cols = ['รหัสพนักงาน', ...FIELDS.map((f) => f.label + ' (' + f.col + ')'), 'กรอกเมื่อ'];
    const rows = ids.map((id) => [id, ...FIELDS.map((f) => all[id].fields[f.key] || ''), all[id].savedAt || '']);
    const csv = [cols, ...rows]
      .map((row) => row.map((v) => {
        let t = String(v ?? '');
        if (/^[=+@\-\t\r]/.test(t)) t = "'" + t;
        return '"' + t.replace(/"/g, '""') + '"';
      }).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'V3-ข้อมูลที่กรอกรอใส่ใน-2ND.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── ฟอร์มกรอกรายคน ── */
  function formHtml(person) {
    // คนที่ออกแล้วไม่ต้องกรอกเยอะ ขอแค่ระบุว่ารหัสนี้คือใคร
    const resigned = Boolean(person.resigned);
    const list = resigned ? FIELDS.filter((f) => f.key === 'name' || f.key === 'nickname') : FIELDS;
    const draft = loadDrafts()[person.id];
    const val = (k) => (draft && draft.fields && draft.fields[k]) || '';
    return `<div class="rw-panel" data-rw-form data-rw-id="${esc(person.id)}">
      <h4>${resigned ? 'ระบุชื่อของ' : 'กรอกข้อมูลของ'} ${esc(person.id)}</h4>
      <p>${resigned
        ? `รหัสนี้อยู่ในชีต <b>Resigned</b>${person.resigned.date ? ' (พ้นสภาพ ' + person.resigned.date.split('-').reverse().join('/') + ')' : ''} จึงขอแค่ชื่อไว้อ้างอิงประวัติ ไม่ต้องกรอกกะ โซน หรือสังกัด`
        : 'กรอกเท่าที่ทราบ เว้นช่องที่ไม่รู้ไว้ได้'}
        <br><b>ยังไม่ส่งเข้า Google Sheet</b> — บันทึกไว้ในเครื่องนี้ก่อน แล้ว Export CSV ไปกรอกใน 2ND เอง</p>
      <div class="rw-grid">
        ${list.map((f) => `<label>${esc(f.label)} <span class="rw-col">${esc(f.col)}</span>
          <input type="text" data-rw-field="${f.key}" placeholder="${esc(f.placeholder || '')}" value="${esc(val(f.key))}">
          ${f.note ? `<em class="rw-warn">${esc(f.note)}</em>` : ''}
        </label>`).join('')}
      </div>
      <div class="rw-actions">
        <button type="button" data-rw-submit class="rw-btn rw-btn-primary">บันทึกไว้ในเครื่อง</button>
        ${draft ? '<button type="button" data-rw-delete class="rw-btn rw-btn-ghost">ลบที่กรอกไว้</button>' : ''}
        <button type="button" data-rw-cancel class="rw-btn">ปิด</button>
      </div>
      <div class="rw-msg" data-rw-msg></div>
    </div>`;
  }

  function bindForm(panel, person, close, onRerender) {
    const msg = panel.querySelector('[data-rw-msg]');
    const say = (text, tone) => { msg.className = 'rw-msg' + (tone ? ' is-' + tone : ''); msg.innerHTML = text; };

    panel.querySelector('[data-rw-submit]').addEventListener('click', () => {
      const fields = {};
      panel.querySelectorAll('[data-rw-field]').forEach((el) => {
        const v = el.value.trim();
        if (v) fields[el.dataset.rwField] = v;
      });
      if (!Object.keys(fields).length) { say('ยังไม่ได้กรอกช่องใดเลย', 'warn'); return; }
      const all = loadDrafts();
      all[person.id] = { fields, savedAt: new Date().toLocaleString('th-TH') };
      if (!saveDrafts(all)) { say('บันทึกไม่สำเร็จ เบราว์เซอร์ปิด localStorage อยู่', 'warn'); return; }
      say(`บันทึกไว้ในเครื่องแล้ว ${Object.keys(fields).length} ช่อง · กด <b>Export CSV ที่กรอกไว้</b> ด้านบนเพื่อเอาไปใส่ใน Sheet`, 'good');
      if (onRerender) setTimeout(onRerender, 700);
    });

    const del = panel.querySelector('[data-rw-delete]');
    if (del) del.addEventListener('click', () => {
      const all = loadDrafts();
      delete all[person.id];
      saveDrafts(all);
      say('ลบที่กรอกไว้แล้ว', 'good');
      if (onRerender) setTimeout(onRerender, 500);
    });

    panel.querySelector('[data-rw-cancel]').addEventListener('click', close);
  }

  /* ── จุดเชื่อมที่ v2-staff.js และ insights.js เรียกใช้ ── */
  window.V3RosterWrite = {
    /** ยังไม่ต่อ Apps Script จึงถือว่าพร้อมกรอกเสมอ */
    isConfigured() { return true; },

    buttonHtml(person) {
      const has = Boolean(loadDrafts()[person.id]);
      return `<button type="button" class="rw-open${has ? ' has-draft' : ''}" data-rw-open="${esc(person.id)}">`
        + (has ? '✅ กรอกแล้ว' : '✏️ เติมข้อมูล') + '</button>';
    },

    statusHtml() {
      const n = draftCount();
      return `<span class="rw-status">📝 กรอกแล้วเก็บไว้ในเครื่องนี้ ยังไม่ส่งเข้า Sheet`
        + (n ? ` · <b>${fmt(n)}</b> รหัส <button type="button" class="rw-link" data-rw-export>Export CSV ที่กรอกไว้</button>` : '')
        + '</span>';
    },

    bind(container, getPerson, onRerender) {
      if (!container) return;
      let host = container.querySelector('[data-rw-host]');
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-rw-host', '');
        container.appendChild(host);
      }
      const close = () => { host.innerHTML = ''; };

      container.querySelectorAll('[data-rw-export]').forEach((b) => {
        b.addEventListener('click', exportDrafts);
      });

      container.querySelectorAll('[data-rw-open]').forEach((b) => {
        b.addEventListener('click', () => {
          const person = getPerson(b.dataset.rwOpen);
          if (!person) return;
          host.innerHTML = formHtml(person);
          bindForm(host.querySelector('[data-rw-form]'), person, close, onRerender);
          host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
    }
  };
})();
