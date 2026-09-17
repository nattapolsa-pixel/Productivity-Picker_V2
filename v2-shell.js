/* v2-shell.js — เปลือกหน้าเว็บแบบ V2 (sidebar จัดกลุ่ม, pagehead, sysbar)
   ทำหน้าที่เฉพาะการนำทางและการแสดงผล ไม่คำนวณตัวเลขใด ๆ
   ตัวเลขทั้งหมดยังมาจาก v1-engine.js / script.js / insights.js ตามสูตร V1 */
(() => {
  'use strict';

  // ชื่อหน้าบน .pagehead แบบ V2 (V2 ใช้ TITLES map เดียวกัน)
  // คงรายการของหน้าที่ถอดออกชั่วคราวไว้ด้วย (pickers, rack, staff, affiliation, shift, records, method)
  // เพื่อให้นำหน้ากลับได้โดยไม่ต้องแก้ไฟล์นี้ — มาร์กอัปอยู่ที่ parked/sections.html
  const TITLES = {
    overview: 'ภาพรวมวันนี้',
    monthly: 'แนวโน้มรายเดือน',
    present: 'สรุปผล & Present',
    pickers: 'อันดับพนักงาน (Picker)',
    rack: 'ประเภทงาน & โซน',
    'zone-map': 'แผนผังโซน & Productivity',
    staff: 'ทะเบียน & ผลงานรายบุคคล',
    affiliation: 'สังกัด (Affiliation)',
    shift: 'กะ & BU',
    hours: 'ช่วงเวลา (Hourly)',
    records: 'รายการต้นทาง',
    training: 'Training',
    tenured: 'พนักงานเกิน 3 เดือน',
    quality: 'Not Found & ตรวจข้อมูล',
    method: 'สูตร & แหล่งข้อมูล'
  };

  const navButtons = Array.from(document.querySelectorAll('.nav-item[data-tab]'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  const ptitle = document.getElementById('ptitle');
  const daterange = document.getElementById('daterange');
  const startDate = document.getElementById('startDate');
  const endDate = document.getElementById('endDate');
  const systemSelect = document.getElementById('v3System');
  const systemTog = document.getElementById('v3SystemTog');
  const shiftSelect = document.getElementById('v3Shift');
  const shiftTog = document.getElementById('v3ShiftTog');
  const targetInput = document.getElementById('prodTargetInput');
  const applyDateBtn = document.getElementById('applyDateButton');

  const SYSTEM_LABEL = {
    ALL: 'ทุกระบบ',
    PTT: 'Pick (PTT)',
    BPS: 'Pick to Sort (BPS)',
    'Not Found': 'ไม่ระบุประเภทงาน'
  };

  function dmy(value) {
    if (!value) return '';
    const parts = String(value).split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
  }

  // แถบช่วงข้อมูลด้านขวาของหัวเรื่อง — รูปแบบเดียวกับ updateDateHeader() ของ V2
  function updateDateHeader() {
    if (!daterange) return;
    const from = startDate && startDate.value ? dmy(startDate.value) : '';
    const to = endDate && endDate.value ? dmy(endDate.value) : '';
    let text;
    if (from && to && from === to) text = `ช่วงข้อมูล: <b>${from}</b>`;
    else if (from && to) text = `ช่วงข้อมูล: <b>${from}</b> ถึง <b>${to}</b>`;
    else text = 'ช่วงข้อมูล: <b>ทั้งหมดที่มีใน Sheet</b>';

    const sys = systemSelect ? systemSelect.value : 'ALL';
    if (sys && sys !== 'ALL') text += ` · ${SYSTEM_LABEL[sys] || sys}`;
    const shift = shiftSelect ? shiftSelect.value : 'ALL';
    if (shift && shift !== 'ALL') text += ` · กะ ${shift}`;
    daterange.innerHTML = text;
  }

  function setPageTitle(tab) {
    if (!ptitle) return;
    const panel = document.getElementById('tab-' + tab);
    const own = panel && panel.querySelector('.panel-header h1.panel-title');
    ptitle.textContent = TITLES[tab] || (own ? own.textContent.trim() : 'ภาพรวม');
  }

  function activate(tab) {
    navButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
    setPageTitle(tab);
    updateDateHeader();
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activate(btn.dataset.tab);
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });

  /* ── ปุ่มเลือกระบบแบบ .systog ของ V2 → ส่งค่าต่อให้ select เดิมที่ insights.js ใช้ ── */
  if (systemTog && systemSelect) {
    const buttons = Array.from(systemTog.querySelectorAll('button[data-sys]'));
    const syncButtons = () => {
      buttons.forEach((b) => b.classList.toggle('active', b.dataset.sys === systemSelect.value));
    };
    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.sys === systemSelect.value) return;
        systemSelect.value = b.dataset.sys;
        syncButtons();
        systemSelect.dispatchEvent(new Event('change'));
        updateDateHeader();
      });
    });
    syncButtons();
  }

  /* ── ปุ่มกะแบบ .systog.shiftog ของ V2 ──
     ค่ากะมาจากคอลัมน์ AG ของ Sheet ซึ่งมีทั้ง A / B / C / Training / รายวัน / Not Found
     insights.js เติม <option> ให้ก่อน แล้วที่นี่แปลงเป็นปุ่มตามหน้าตาของ V2
     V2 ใช้อีโมจิเฉพาะกะ A/B จึงทำแบบเดียวกัน ค่าอื่นแสดงตามที่ Sheet บันทึกไว้จริง
     เพื่อไม่ให้ปุ่มสองปุ่มมีป้ายซ้ำกัน (เช่น Not Found กับ Not Found Data) */
  const SHIFT_ICON = { A: '🅰️', B: '🅱️' };
  function shiftButtonLabel(value) {
    if (value === 'ALL') return 'ทุกกะ';
    const icon = SHIFT_ICON[String(value).toUpperCase()];
    if (icon) return `${icon} กะ ${value}`;
    if (/not\s?found|#n\/a|^-$/i.test(value)) return `⚠️ ${value}`;
    return `กะ ${value}`;
  }

  function syncShiftToggle() {
    if (!shiftTog || !shiftSelect) return;
    shiftTog.querySelectorAll('button[data-sh]').forEach((b) => {
      b.classList.toggle('active', b.dataset.sh === shiftSelect.value);
    });
  }

  function buildShiftToggle() {
    if (!shiftTog || !shiftSelect) return;
    const values = Array.from(shiftSelect.options).map((o) => o.value);
    const signature = values.join('|');
    if (shiftTog.dataset.signature === signature) {
      syncShiftToggle();
      return;
    }
    shiftTog.dataset.signature = signature;
    shiftTog.innerHTML = values
      .map((v) => `<button type="button" data-sh="${String(v).replace(/"/g, '&quot;')}">${shiftButtonLabel(v)}</button>`)
      .join('');
    shiftTog.querySelectorAll('button[data-sh]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.sh === shiftSelect.value) return;
        shiftSelect.value = b.dataset.sh;
        syncShiftToggle();
        shiftSelect.dispatchEvent(new Event('change'));
        updateDateHeader();
      });
    });
    syncShiftToggle();
  }

  if (shiftSelect) {
    buildShiftToggle();
    // insights.js เขียน <option> ใหม่ทุกครั้งที่ได้ข้อมูล จึงเฝ้าดูแล้วสร้างปุ่มตาม
    new MutationObserver(buildShiftToggle).observe(shiftSelect, { childList: true });
    shiftSelect.addEventListener('change', () => {
      syncShiftToggle();
      updateDateHeader();
    });
  }

  /* ── ช่องกรอกเป้า Target แบบ V2 → ส่งค่าเข้า updateTargets() ของ V1 ── */
  if (targetInput) {
    const currentTarget = () => (window.TARGETS && Number(window.TARGETS.overall)) || 170;
    targetInput.value = currentTarget();
    const commit = () => {
      const value = Number(targetInput.value);
      if (!Number.isFinite(value) || value <= 0) {
        targetInput.value = currentTarget();
        return;
      }
      if (typeof window.updateTargets !== 'function' || !window.TARGETS) return;
      if (Math.round(value) === currentTarget()) return;
      window.updateTargets(
        Object.assign({}, window.TARGETS, { overall: Math.round(value) }),
        'ตั้งเป้า Target จากแถบตัวกรอง'
      );
    };
    targetInput.addEventListener('change', commit);
    targetInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    // ถ้าตั้งค่าจากหน้าต่าง Target ให้ช่องนี้ตามไปด้วย
    document.addEventListener('v3-render', () => {
      if (document.activeElement !== targetInput) targetInput.value = currentTarget();
    });
  }

  /* ── V2 เปลี่ยนวันแล้วโหลดทันที ที่นี่จึงกดปุ่มยืนยันที่ซ่อนไว้ให้เอง ── */
  let applyTimer = null;
  [startDate, endDate].forEach((el) => el && el.addEventListener('change', () => {
    updateDateHeader();
    if (!applyDateBtn) return;
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => applyDateBtn.click(), 250);
  }));
  if (applyDateBtn) applyDateBtn.addEventListener('click', () => setTimeout(updateDateHeader, 0));

  document.querySelectorAll('.sysbar .chip[data-range]').forEach((chip) => {
    chip.addEventListener('click', () => setTimeout(updateDateHeader, 120));
  });
  document.addEventListener('v3-render', () => setTimeout(updateDateHeader, 0));

  const initial = navButtons.find((b) => b.classList.contains('active')) || navButtons[0];
  if (initial) {
    setPageTitle(initial.dataset.tab);
  }
  updateDateHeader();
})();
