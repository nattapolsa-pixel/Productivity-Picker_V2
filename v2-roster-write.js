/* v2-roster-write.js — หน้าต่างกรอกข้อมูลพนักงานที่ยังไม่มีทะเบียน
   ตอนนี้ยังไม่ส่งข้อมูลออกไปที่ Google Sheet ตามที่ผู้ใช้สั่ง
   กรอกแล้วเก็บไว้ในเครื่องนี้ (localStorage) และ Export CSV ไปกรอกใน Sheet เองได้
   ไม่มีการเรียก Apps Script และไม่มีกล่องตั้งค่า URL/โทเคนในหน้าเว็บ

   สถานะการจ้างเลือกได้ 2 แบบ ปลายทางต่างกัน
     ยังทำงานอยู่ → ชีต 2ND คอลัมน์ C–M (ทะเบียนพนักงาน)
     ลาออกแล้ว    → รายชื่อที่ลาออก คอลัมน์ A รหัส, B ชื่อ, H วันพ้นสภาพ
   คนที่เลือกว่าลาออกแล้วจะขึ้น Remark แดงทันทีและถูกซ่อนตามปุ่ม "ซ่อนคนที่ออกแล้ว" เหมือนคนที่ยืนยันแล้วว่าลาออก

   ไฟล์ apps-script-roster-write.gs ยังอยู่ในโปรเจกต์เผื่อเปิดใช้ทีหลัง
   ถ้าจะต่อของจริง ให้เพิ่มการยิง POST ในฟังก์ชัน saveDraft() เท่านั้น ที่เหลือใช้ได้เลย */
(() => {
  'use strict';

  const DRAFT_KEY = 'pickProductivityRosterDraft:v1';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  /* ช่องที่ให้กรอกเมื่อคนนั้นยังทำงานอยู่ ปลายทางคือชีต 2ND */
  const FIELDS = [
    { key: 'name', label: 'ชื่อ-นามสกุล (ไทย)', col: '2ND C' },
    { key: 'nickname', label: 'ชื่อเล่น', col: '2ND D' },
    { key: 'affiliation', label: 'สังกัด', col: '2ND E' },
    { key: 'role', label: 'หน้าที่รับผิดชอบ', col: '2ND F' },
    { key: 'startDate', label: 'วันที่เริ่มทำงาน', col: '2ND G', placeholder: 'เช่น 20/03/2026' },
    { key: 'statusWork', label: 'Status Work', col: '2ND H', placeholder: 'เช่น Work' },
    { key: 'zone', label: 'Zone', col: '2ND J' },
    { key: 'pickType', label: 'Pick Type', col: '2ND K', note: 'ค่านี้มีผลต่อค่าเฉลี่ยต่อชั่วโมงและ Productivity' },
    { key: 'bu', label: 'BU', col: '2ND L' },
    { key: 'shift', label: 'Ship กะ', col: '2ND M', placeholder: 'เช่น A / B / C' }
  ];

  /* ช่องที่ให้กรอกเมื่อคนนั้นลาออกแล้ว ปลายทางคือชีต Resigned ไม่ต้องกรอกกะ โซน สังกัด */
  const RESIGNED_FIELDS = [
    { key: 'name', label: 'ชื่อ-นามสกุล (ไทย)', col: 'Resigned B' },
    { key: 'resignedDate', label: 'วันที่พ้นสภาพ (ส่งออกเป็น ปี ค.ศ.)', col: 'Resigned H', placeholder: 'เช่น 31/08/2026 (ไม่รู้วันก็เว้นไว้ได้)' },
    { key: 'note', label: 'หมายเหตุ / ใครให้ข้อมูล', col: '—' }
  ];

  const fieldsFor = (status) => (status === 'resigned' ? RESIGNED_FIELDS : FIELDS);

  /* ── เก็บร่างไว้ในเครื่อง ── */
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
  function draftOf(id) {
    const d = loadDrafts()[id];
    if (!d) return null;
    // ร่างรุ่นก่อนไม่มีฟิลด์ status ให้ถือว่ายังทำงานอยู่
    const date = typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '';
    const fields = d.fields && typeof d.fields === 'object' && !Array.isArray(d.fields) ? d.fields : {};
    return { status: d.status === 'resigned' ? 'resigned' : 'active', fields, date, savedAt: String(d.savedAt ?? '') };
  }
  function draftList() {
    const all = loadDrafts();
    return Object.keys(all).map((id) => ({ id, ...draftOf(id) }));
  }

  /* วันที่พิมพ์เป็น 31/08/2026 หรือ 31/08/2569 หรือ 2026-08-31 ก็รับได้ เก็บเป็น ISO เพื่อให้หน้าอื่นใช้ต่อ */
  function toIso(text) {
    const t = String(text ?? '').trim();
    if (!t) return '';
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    let year, month, day;
    if (m) { year = +m[1]; month = +m[2]; day = +m[3]; }
    else {
      m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(t);
      if (!m) return '';
      day = +m[1]; month = +m[2]; year = +m[3];
      if (year < 100) {
        // ปีสองหลักกำกวม ลองทั้งแบบ ค.ศ. และ พ.ศ. สองหลัก เอาที่ตกในช่วงที่สมเหตุสมผล
        // ถ้าคลุมเครือทั้งคู่ให้ปฏิเสธไปเลย ดีกว่าเก็บปีที่เดาผิด (เช่น 1/1/28 เคยได้ 1985)
        const now = new Date().getFullYear();
        const inWindow = (y) => y >= now - 30 && y <= now + 1;
        const gregorian = year + 2000, buddhistShort = year + 1957;
        if (inWindow(gregorian)) year = gregorian;
        else if (inWindow(buddhistShort)) year = buddhistShort;
        else return '';
      }
    }
    if (year > 2400) year -= 543;
    if (year < 1990 || year > 2100) return '';   // กันปีพิมพ์พลาดอย่าง 9/9/9999
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    // new Date('2026-02-31') ไม่เป็น Invalid Date แต่เลื่อนไป 3 มี.ค. จึงต้องแปลงกลับมาเทียบว่าตรงวันเดิม
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function exportDrafts() {
    const list = draftList();
    if (!list.length) return;
    // ช่องเดียวกันที่ใช้ทั้งสองสถานะ (ชื่อ) รวมเป็นคอลัมน์เดียว แต่บอกปลายทางทั้งสองที่
    const keys = [];
    [...FIELDS, ...RESIGNED_FIELDS].forEach((f) => {
      const exist = keys.find((k) => k.key === f.key);
      if (exist) { if (!exist.cols.includes(f.col)) exist.cols.push(f.col); return; }
      keys.push({ key: f.key, label: f.label, cols: [f.col] });
    });
    const cols = ['รหัสพนักงาน', 'สถานะ', 'ปลายทางที่ต้องไปกรอก',
      ...keys.map((k) => k.label + ' (' + k.cols.join(' / ') + ')'), 'กรอกเมื่อ'];
    const rows = list.map((d) => [
      d.id,
      d.status === 'resigned' ? 'ลาออกแล้ว' : 'ยังทำงานอยู่',
      d.status === 'resigned' ? 'รายชื่อที่ลาออก (A รหัส, B ชื่อ, H วันพ้นสภาพ)' : 'ชีต 2ND (C–M)',
      // ส่งออกทุกค่าที่เก็บไว้ ไม่ตัดตามสถานะ เพื่อไม่ให้ที่กรอกไว้หายเงียบ ๆ
      // วันที่พ้นสภาพส่งออกเป็น yyyy-mm-dd ปี ค.ศ. เพื่อให้วางลงชีตแล้วไม่เพี้ยนตามรูปแบบวันที่
      ...keys.map((k) => (k.key === 'resignedDate' ? (d.date || toIso(d.fields[k.key]) || '') : (d.fields[k.key] || ''))),
      d.savedAt || ''
    ]);
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
    a.download = 'V3-ข้อมูลที่กรอกรอใส่ใน-Sheet.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── ฟอร์มกรอกรายคน ──
     ป้ายช่องปลายทางในชีต (f.col) ไม่แสดงในหน้าเว็บแล้ว แต่ยังใช้ทำหัวคอลัมน์ใน Export CSV
     เพราะคนที่เอา CSV ไปวางต้องรู้ว่าวางช่องไหน */
  function panelHtml(person, state) {
    const inSheet = Boolean(person.resigned && person.resigned.source !== 'web');
    const resigned = state.status === 'resigned';
    const list = fieldsFor(state.status);
    const val = (k) => state.values[k] || '';
    const head = inSheet
      ? `รหัสนี้อยู่ใน<b>รายชื่อที่ลาออก</b>อยู่แล้ว${person.resigned.date ? ' (พ้นสภาพ ' + dmy(person.resigned.date) + ')' : ''} จึงขอแค่ชื่อไว้อ้างอิงประวัติ`
      : 'สืบมาได้แค่ไหนกรอกเท่านั้น เว้นช่องที่ไม่รู้ไว้ได้ · ถ้าคนนี้ลาออกไปแล้วให้กดปุ่ม “ลาออกแล้ว” ข้างล่าง แล้วกรอกแค่ชื่อกับวันที่ออก';
    return `<div class="rw-panel" data-rw-form data-rw-id="${esc(person.id)}">
      <h4>ระบุว่ารหัส ${esc(person.id)} คือใคร</h4>
      <p>${head}
        <br><b>ยังไม่ส่งเข้า Google Sheet</b> — บันทึกไว้ในเครื่องนี้ก่อน แล้ว Export CSV ไปกรอกใน Sheet เอง</p>
      <div class="rw-statusrow">
        <span class="rw-statuslabel">สถานะการจ้าง</span>
        <div class="rw-seg" role="group" aria-label="สถานะการจ้าง">
          <button type="button" data-rw-status="active"${resigned ? '' : ' class="active"'}>ยังทำงานอยู่</button>
          <button type="button" data-rw-status="resigned"${resigned ? ' class="active is-out"' : ''}>⛔ ลาออกแล้ว</button>
        </div>
        <span class="rw-seghint">${resigned
          ? 'ปลายทาง: <b>รายชื่อที่ลาออก</b> — รหัสพนักงาน · ชื่อ · วันพ้นสภาพ'
          : (inSheet
            ? 'ปลายทาง: <b>ทะเบียนพนักงาน</b> · <b>หมายเหตุ</b> รหัสนี้ถูกบันทึกว่าลาออกแล้ว หน้าเว็บจะยังขึ้นว่าออกแล้วจนกว่าจะแก้ที่รายชื่อผู้ลาออก'
            : 'ปลายทาง: <b>ทะเบียนพนักงาน</b>')}</span>
      </div>
      <div class="rw-grid">
        ${list.map((f) => `<label>${esc(f.label)}
          <input type="text" data-rw-field="${f.key}" placeholder="${esc(f.placeholder || '')}" value="${esc(val(f.key))}">
          ${f.note ? `<em class="rw-warn">${esc(f.note)}</em>` : ''}
        </label>`).join('')}
      </div>
      <div class="rw-actions">
        <button type="button" data-rw-submit class="rw-btn rw-btn-primary">${resigned ? 'บันทึกว่าออกแล้ว' : 'บันทึกไว้ในเครื่อง'}</button>
        ${state.hasDraft ? '<button type="button" data-rw-delete class="rw-btn rw-btn-ghost">ลบที่กรอกไว้</button>' : ''}
        <button type="button" data-rw-cancel class="rw-btn">ปิด</button>
      </div>
      <div class="rw-msg" data-rw-msg>${esc(state.message || '')}</div>
    </div>`;
  }

  function readValues(panel, state) {
    panel.querySelectorAll('[data-rw-field]').forEach((el) => {
      state.values[el.dataset.rwField] = el.value;
    });
    return state.values;
  }

  function openPanel(host, person, state, onRerender) {
    host.innerHTML = panelHtml(person, state);
    const panel = host.querySelector('[data-rw-form]');
    const msg = panel.querySelector('[data-rw-msg]');
    const say = (text, tone) => { msg.className = 'rw-msg' + (tone ? ' is-' + tone : ''); msg.innerHTML = text; };
    const close = () => { host.innerHTML = ''; };

    panel.querySelectorAll('[data-rw-status]').forEach((b) => {
      b.addEventListener('click', () => {
        const next = b.dataset.rwStatus;
        if (next === state.status) return;
        readValues(panel, state);
        state.status = next;
        state.message = '';
        openPanel(host, person, state, onRerender);
      });
    });

    panel.querySelector('[data-rw-submit]').addEventListener('click', () => {
      readValues(panel, state);
      const own = fieldsFor(state.status).map((f) => f.key);
      const fields = {};
      // ค่าที่กรอกไว้ของอีกสถานะเก็บไว้ด้วย ไม่ให้หายเพราะสลับปุ่ม
      const prev = draftOf(person.id);
      if (prev) Object.keys(prev.fields).forEach((k) => { if (!own.includes(k)) fields[k] = prev.fields[k]; });
      own.forEach((k) => { const v = String(state.values[k] ?? '').trim(); if (v) fields[k] = v; });

      if (state.status === 'resigned') {
        const iso = toIso(fields.resignedDate);
        if (fields.resignedDate && !iso) {
          say('อ่านวันที่พ้นสภาพไม่ออก กรอกแบบ <b>31/08/2026</b> หรือ <b>2026-08-31</b> (เว้นว่างก็ได้)', 'warn');
          return;
        }
        const all = loadDrafts();
        if (iso) fields.resignedDate = dmy(iso);   // เก็บให้ตรงกับ date ที่แปลงแล้ว
        all[person.id] = { status: 'resigned', fields, date: iso, savedAt: new Date().toLocaleString('th-TH') };
        if (!saveDrafts(all)) { say('บันทึกไม่สำเร็จ เบราว์เซอร์ปิด localStorage อยู่', 'warn'); return; }
        say(`บันทึกว่ารหัสนี้ <b>ออกแล้ว</b>${iso ? ' (พ้นสภาพ ' + dmy(iso) + ')' : ''} · จะขึ้น Remark แดงและถูกซ่อนตามปุ่มซ่อนคนที่ออกแล้ว`, 'good');
        if (onRerender) setTimeout(onRerender, 700);
        return;
      }

      if (!own.some((k) => fields[k])) { say('ยังไม่ได้กรอกช่องใดเลย', 'warn'); return; }
      const all = loadDrafts();
      // กลับมาเป็น "ยังทำงานอยู่" แล้วต้องไม่มีวันพ้นสภาพค้างอยู่ ไม่งั้น CSV จะได้แถวที่ขัดกันเอง
      delete fields.resignedDate;
      all[person.id] = { status: 'active', fields, date: '', savedAt: new Date().toLocaleString('th-TH') };
      if (!saveDrafts(all)) { say('บันทึกไม่สำเร็จ เบราว์เซอร์ปิด localStorage อยู่', 'warn'); return; }
      say(`บันทึกไว้ในเครื่องแล้ว ${own.filter((k) => fields[k]).length} ช่อง · กด <b>Export CSV ที่กรอกไว้</b> ด้านบนเพื่อเอาไปใส่ใน Sheet`, 'good');
      if (onRerender) setTimeout(onRerender, 700);
    });

    const del = panel.querySelector('[data-rw-delete]');
    if (del) del.addEventListener('click', () => {
      const all = loadDrafts();
      delete all[person.id];
      if (!saveDrafts(all)) { say('ลบไม่สำเร็จ เบราว์เซอร์เขียน localStorage ไม่ได้', 'warn'); return; }
      say('ลบที่กรอกไว้แล้ว', 'good');
      if (onRerender) setTimeout(onRerender, 500);
    });

    panel.querySelector('[data-rw-cancel]').addEventListener('click', close);
    host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function initialState(person) {
    const draft = draftOf(person.id);
    if (draft) {
      return { status: draft.status, values: { ...draft.fields, resignedDate: draft.fields.resignedDate || dmy(draft.date) }, hasDraft: true, message: '' };
    }
    const inSheet = Boolean(person.resigned && person.resigned.source !== 'web');
    return { status: inSheet ? 'resigned' : 'active', values: {}, hasDraft: false, message: '' };
  }

  /* ── จุดเชื่อมที่ v2-staff.js และ insights.js เรียกใช้ ── */
  window.V3RosterWrite = {
    /** ยังไม่ต่อ Apps Script จึงถือว่าพร้อมกรอกเสมอ */
    isConfigured() { return true; },

    /** ให้หน้าอื่นรู้ว่ารหัสนี้ถูกกรอกในเว็บว่าออกแล้ว — ใช้ทำ Remark แดงและปุ่มซ่อน */
    resignedDraft(id) {
      const d = draftOf(id);
      if (!d || d.status !== 'resigned') return null;
      return { id, name: d.fields.name || '', date: d.date || '', note: d.fields.note || '', source: 'web', savedAt: d.savedAt };
    },

    /** null = ยังไม่ได้กรอก · 'active' = กรอกว่ายังทำงานอยู่ · 'resigned' = กรอกว่าออกแล้ว */
    draftStatus(id) {
      const d = draftOf(id);
      return d ? d.status : null;
    },

    buttonHtml(person) {
      const d = draftOf(person.id);
      const cls = d ? (d.status === 'resigned' ? ' has-draft is-out' : ' has-draft') : '';
      const label = d ? (d.status === 'resigned' ? '⛔ ระบุว่าออกแล้ว' : '✅ กรอกแล้ว') : '✏️ เติมข้อมูล';
      return `<button type="button" class="rw-open${cls}" data-rw-open="${esc(person.id)}">${label}</button>`;
    },

    statusHtml() {
      const list = draftList();
      const out = list.filter((d) => d.status === 'resigned').length;
      return `<span class="rw-status">📝 กรอกแล้วเก็บไว้ในเครื่องนี้ ยังไม่ส่งเข้า Sheet`
        + (list.length
          ? ` · <b>${fmt(list.length)}</b> รหัส (ระบุว่าออกแล้ว <b>${fmt(out)}</b>)`
            + ` <button type="button" class="rw-link" data-rw-export>Export CSV ที่กรอกไว้</button>`
          : '')
        + '</span>';
    },

    /* ผูกด้วย event delegation ที่ตัว container ตัวเดียว
       เพราะตาราง (V3Shared.table) เขียน tbody.innerHTML ใหม่ทุกครั้งที่เปลี่ยนหน้า ค้นหา หรือเรียงใหม่
       ถ้าไปผูกทีละปุ่ม ปุ่มชุดใหม่จะไม่มี listener แล้วกดไม่ติด (เคยเป็นบั๊กจริงตั้งแต่หน้า 2 ขึ้นไป) */
    bind(container, getPerson, onRerender) {
      if (!container) return;
      let host = container.querySelector('[data-rw-host]');
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-rw-host', '');
        container.appendChild(host);
      }
      // เก็บตัวอ่านข้อมูลล่าสุดไว้บน element เพื่อให้ listener เดิมใช้ค่าใหม่หลังเรนเดอร์ซ้ำ
      container._rwGetPerson = getPerson;
      container._rwRerender = onRerender;
      if (container._rwBound) return;
      container._rwBound = true;

      container.addEventListener('click', (e) => {
        const exportBtn = e.target.closest('[data-rw-export]');
        if (exportBtn && container.contains(exportBtn)) { exportDrafts(); return; }
        const openBtn = e.target.closest('[data-rw-open]');
        if (!openBtn || !container.contains(openBtn)) return;
        const fresh = container.querySelector('[data-rw-host]') || host;
        const person = (container._rwGetPerson || getPerson)(openBtn.dataset.rwOpen);
        if (!person) return;
        openPanel(fresh, person, initialState(person), () => {
          const fn = container._rwRerender || onRerender;
          if (fn) fn();
        });
      });
    }
  };
})();
