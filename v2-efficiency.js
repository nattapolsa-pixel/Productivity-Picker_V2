/* v2-efficiency.js — หน้า Efficiency (ทำได้กี่ % ของเป้า)
   ลอกองค์ประกอบมาจากหน้า efficiency ของ V2 (app.js renderEfficiencyPage / drawEfficiencyCharts / drawEfficiencyTables)
     การ์ดสรุป 4 ใบ → กราฟเส้น % รายวันเทียบ Baseline 100% → กราฟแท่งแยกกะและระบบ → ตารางรายวัน → ตารางอันดับรายโซน
   แต่ตัวเลขทุกค่าคิดใหม่ ทั้งหมด

   สูตรที่ใช้ (ห้ามเปลี่ยน)
     Productivity   = ผลรวมคอลัมน์ AF ของแถวที่ AF > 0 ÷ จำนวนแถวนั้น  (รวม sum/count ครั้งเดียว
                      ไม่เอาค่าเฉลี่ยของวัน/ของคนมาเฉลี่ยซ้ำ — ใช้ M.aggregate() ที่รวมให้ทีเดียว)
     Total Pick     = ผลรวมคอลัมน์ E ของทุกแถวที่มีวันที่ รวมแถวที่ AF เป็น Not Count
     % Efficiency   = Productivity ÷ Target × 100
                      ระดับวัน/กะ/ระบบ/ประเภทการจ้าง ใช้ Target รวม (TARGETS.overall)
                      ระดับโซน ใช้ Target ของโซนนั้นผ่าน V3Shared.zoneTargetOf()
     เท่ากับเป้านับว่าผ่าน  (ไม่ถึงเป้า = น้อยกว่าเป้า)
     กลุ่มที่ไม่มีแถวเข้าเฉลี่ยเลย (count = 0) ไม่ตัดสินผ่าน/ไม่ผ่าน และไม่นับเข้าตัวหาร

   ที่ตัดออกจาก V2 เพราะข้อมูลจริงไม่มี (อธิบายไว้ในโน้ตใต้การ์ดบนหน้าเว็บด้วย)
     - โหมดหน่วย ชิ้น/ชม. (unitMode = 'pcs') → ไม่มีจำนวนชิ้นดิบในข้อมูลผลงาน จึงเหลือหน่วย หยิบ/ชม. เดียว
     - Lines / SKU / Cycle time ระดับนาที → ไม่มีในข้อมูล จึงไม่มีคอลัมน์เหล่านี้ในตาราง
     - ปุ่ม ⚙️ ตั้งค่า Target ของหน้านี้ → V3 มีปุ่มเดียวกันอยู่บนแถบตัวกรองด้านบนแล้ว จึงอ้างถึงปุ่มนั้นแทน
   ที่เพิ่มจาก V2 เพราะข้อมูลมีจริง
     - แยกตามประเภทการจ้าง คอลัมน์ AQ (รายวัน / รายเดือน) ทั้งกราฟและตาราง
     - ถังระบบ "ไม่ระบุประเภทงาน" (M.system = Not Found) ที่ V2 ไม่ได้แสดง */
(() => {
  'use strict';

  const M = window.V3Metrics;
  const S = window.V3Shared;
  const $ = (id) => document.getElementById(id);
  const HOST = 'v3Efficiency';
  const PANEL = 'tab-efficiency';

  if (!M || !S) {
    console.error('V3 efficiency: ไม่พบ V3Metrics / V3Shared จึงไม่เรนเดอร์หน้านี้');
    return;
  }

  const host0 = $(HOST);
  if (host0 && !host0.innerHTML) {
    host0.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">กำลังเตรียมหน้านี้…</div></div>';
  }

  /* ── ตัวช่วยจัดรูปแบบ ── */
  const esc = S.esc;
  const fmt = S.fmt;                                   // fmt(null) = '—' อยู่แล้ว
  const pct = (v) => (v === null || v === undefined ? '—' : fmt(v, 1) + '%');
  const signed = (v) => (v === null || v === undefined ? '—' : (v >= 0 ? '+' : '') + fmt(v, 1));
  const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');
  const ddmm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

  /* เกณฑ์สีตามที่ตกลงไว้: ถึงเป้าเขียว · 90–99.9% ส้ม · ต่ำกว่า 90% แดง
     การ์ด "วันที่ผ่านเกณฑ์" และ "พนักงานที่ผ่านเกณฑ์" ยังใช้สีกลางแบบ V2 (ฟ้า/ม่วง)
     เพราะค่านั้นเป็นสัดส่วนจำนวนวัน/จำนวนคน ไม่ใช่ % เทียบเป้า จึงเทียบเกณฑ์เดียวกันไม่ได้ */
  const GREEN = '#16a34a', ORANGE = '#ea580c', RED = '#e11d48', GREY = '#64748b';
  function effColor(eff) {
    if (eff === null || eff === undefined || !Number.isFinite(eff)) return GREY;
    if (eff >= 100) return GREEN;
    if (eff >= 90) return ORANGE;
    return RED;
  }

  function overallTarget() {
    return (window.TARGETS && Number(window.TARGETS.overall)) || 170;
  }
  /* เท่ากับเป้านับว่าผ่าน */
  const passed = (average, target) => average !== null && average >= target;
  const effOf = (average, target) => (average === null || !(target > 0) ? null : average / target * 100);

  /* V3Shared.statCards() ใช้คลาส .zone-summary ที่ตั้งไว้ 5 คอลัมน์ตายตัว
     หน้านี้มีการ์ด 4 ใบเท่า V2 จึงใส่ style ทับให้ยืดเต็มความกว้าง
     แบบเดียวกับที่ V2 เขียน inline ไว้เอง (repeat(auto-fit, minmax(220px,1fr))) */
  function summaryRow(list) {
    return S.statCards(list).replace('class="zone-summary"',
      'class="zone-summary" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))"');
  }

  /* ── สภาพหน้าจอที่ผู้ใช้เลือกเอง (ไม่กระทบตัวเลข) ── */
  /* เดือนที่กราฟรายวันกำลังกาง ('' = เดือนของวันที่ที่เลือกบนแถบตัวกรอง)
     กราฟรายวันไม่หุบตามตัวกรองวันที่ เพราะค่าเริ่มต้นของเว็บเป็นวันล่าสุดวันเดียว
     ถ้าหุบตามจะเห็นจุดเดียว จึงกางทั้งเดือนแบบหน้าภาพรวม แล้วเน้นวันที่อยู่ในตัวกรองไว้ */
  let dailyMonth = '';

  /* ── จัดกลุ่มข้อมูล ──
     ทุกกลุ่มส่งแถวดิบเข้า M.aggregate() ครั้งเดียว จึงได้ sum/count ของกลุ่มตรง */
  function bucket(rows, keyOf) {
    const map = new Map();
    rows.forEach((r) => {
      const k = keyOf(r);
      if (k === null || k === undefined) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return map;
  }

  const PAY_COL = 42;             // AQ รายวัน/รายเดือน
  const payKey = (row) => {
    const text = String(row[PAY_COL] == null ? '' : row[PAY_COL]).trim();
    return text || 'ไม่ระบุ';     // ค่าว่างใน AQ แสดงตามจริง ไม่เดาให้เป็นรายเดือน
  };

  /* กะ: อ่านจากคอลัมน์ AG ผ่าน M.shiftKey (รวมค่าว่าง/Not Found Data/#N/A เป็นถัง Not Found) */
  function shiftRank(key) {
    if (key === 'A') return 0;
    if (key === 'B') return 1;
    if (key === 'Not Found') return 9;
    return 5;
  }
  /* ใส่คำว่า "กะ" นำหน้าเฉพาะค่าที่เป็นรหัสกะตัวเดียว (A / B / C)
     ค่าอื่นที่ Sheet เขียนไว้เอง เช่น Training หรือ รายวัน แสดงตามต้นทางตรง ๆ ไม่เติมคำให้อ่านเพี้ยน */
  const shiftLabel = (key) => {
    if (key === 'Not Found') return 'ไม่ระบุกะ';
    return /^[A-Za-z]$/.test(key) ? 'กะ ' + key : key;
  };

  /* ระบบ: ใช้ M.matches เพื่อให้ BPS เริ่มนับ 08/06/2026 ตามกฎ V1 เหมือนตัวกรองด้านบน */
  const SYSTEM_LABEL = { PTT: 'Pick (PTT)', BPS: 'Pick to Sort (BPS)' };

  /* แถวที่ผ่านตัวกรองระบบและกะ แต่ไม่จำกัดช่วงวันที่ — ใช้กางกราฟรายวันทั้งเดือน */
  function rowsAllDates() {
    const filters = (window.V3Data && window.V3Data.filters) || {};
    return S.rows.filter((r) => M.date(r[2]) && M.matches(r, filters));
  }

  function monthKeysAvailable(rows) {
    const set = new Set();
    rows.forEach((r) => set.add(M.date(r[2]).slice(0, 7)));
    return [...set].sort();
  }

  function activeMonth(rows) {
    const months = monthKeysAvailable(rows);
    if (dailyMonth && months.includes(dailyMonth)) return dailyMonth;
    const end = $('endDate') && $('endDate').value ? $('endDate').value : '';
    const start = $('startDate') && $('startDate').value ? $('startDate').value : '';
    const pick = (end || start).slice(0, 7);
    if (pick && months.includes(pick)) return pick;
    return months[months.length - 1] || '';
  }

  const THAI_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function monthLabel(key) {
    if (!key) return '—';
    const p = key.split('-').map(Number);
    return THAI_MONTH[p[1] - 1] + ' ' + (p[0] + 543);
  }

  /* วันทั้งเดือนตามปฏิทิน พร้อมค่าของแต่ละวัน (วันที่ไม่มีข้อมูลเป็น null เพื่อให้เส้นขาดช่วงตามจริง) */
  function daysOfMonth(monthKey, rows, targetValue) {
    if (!monthKey) return [];
    const parts = monthKey.split('-').map(Number);
    const last = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
    const start = $('startDate') && $('startDate').value ? $('startDate').value : '';
    const end = $('endDate') && $('endDate').value ? $('endDate').value : '';
    const byDate = bucket(rows.filter((r) => M.date(r[2]).slice(0, 7) === monthKey), (r) => M.date(r[2]));
    const out = [];
    for (let d = 1; d <= last; d += 1) {
      const date = monthKey + '-' + String(d).padStart(2, '0');
      const rowsOfDay = byDate.get(date) || [];
      const st = M.aggregate(rowsOfDay);
      out.push({
        date,
        s: st,
        eff: effOf(st.average, targetValue),
        gap: st.average === null ? null : st.average - targetValue,
        pass: passed(st.average, targetValue),
        inFilter: (!start || date >= start) && (!end || date <= end)
      });
    }
    return out;
  }

  function buildModel() {
    const data = S.visible();                          // กรองวันที่ + ระบบ + กะ ชุดเดียวกับทุกหน้า
    const target = overallTarget();
    // กรองแถวที่ไม่จำกัดวันที่ครั้งเดียว แล้วส่งต่อ เพราะแถวต้นทางมีหลายหมื่นแถว
    const allRows = rowsAllDates();
    const monthList = monthKeysAvailable(allRows);
    const monthKey = activeMonth(allRows);
    /* กราฟเปรียบเทียบ (กะ / ระบบ / ประเภทการจ้าง / โซน) ใช้แถวของ "ทั้งเดือน" ที่กางอยู่
       ไม่ใช่ช่วงวันที่ที่กรอง เพราะค่าเริ่มต้นเป็นวันเดียว แท่งส่วนใหญ่จะขึ้น "ไม่ตัดสิน" จนเทียบอะไรไม่ได้
       ส่วนการ์ด KPI ด้านบนและตารางรายวันยังยึดช่วงวันที่ที่กรองตามเดิม */
    const monthRows = monthKey ? allRows.filter((r) => M.date(r[2]).slice(0, 7) === monthKey) : allRows;
    const all = M.aggregate(data);

    /* รายวัน */
    const days = [...bucket(data, (r) => M.date(r[2])).entries()]
      .map(([date, rows]) => {
        const s = M.aggregate(rows);
        return { date, s, eff: effOf(s.average, target), gap: s.average === null ? null : s.average - target, pass: passed(s.average, target) };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const judgedDays = days.filter((d) => d.s.count > 0);
    const hitDays = judgedDays.filter((d) => d.pass);

    /* รายคน — ใช้ตัดสินการ์ด "พนักงานที่ผ่านเกณฑ์" เทียบ Target รวมเหมือน V2
       คนที่ไม่มีแถวเข้าเฉลี่ยเลย (count = 0) ไม่ตัดสิน จึงไม่เข้าตัวหาร */
    const persons = [...bucket(data, (r) => M.userId(r) || 'Not Found').entries()]
      .map(([id, rows]) => ({ id, s: M.aggregate(rows) }));
    const judgedPeople = persons.filter((p) => p.s.count > 0);
    const hitPeople = judgedPeople.filter((p) => passed(p.s.average, target));

    /* กะ (AG) */
    const shifts = [...bucket(monthRows, (r) => M.shiftKey(r)).entries()]
      .map(([key, rows]) => ({ key, label: shiftLabel(key), s: M.aggregate(rows) }))
      .sort((a, b) => shiftRank(a.key) - shiftRank(b.key) || String(a.key).localeCompare(String(b.key), 'th'));

    /* ระบบ */
    const systems = [];
    ['PTT', 'BPS'].forEach((sys) => {
      const rows = monthRows.filter((r) => M.matches(r, { system: sys }));
      if (rows.length) systems.push({ key: sys, label: SYSTEM_LABEL[sys], s: M.aggregate(rows) });
    });
    const sysUnknown = monthRows.filter((r) => M.system(r) === 'Not Found');
    if (sysUnknown.length) systems.push({ key: 'Not Found', label: 'ไม่ระบุประเภทงาน', s: M.aggregate(sysUnknown) });
    /* แถว Pick to Sort ก่อน 08/06/2026 ไม่เข้าถังระบบใดตามกฎ V1 — บอกจำนวนไว้ในโน้ต */
    const bpsEarly = monthRows.filter((r) => M.system(r) === 'BPS' && !M.matches(r, { system: 'BPS' })).length;

    /* ประเภทการจ้าง (AQ) — มิติที่ V2 ไม่มี */
    const payTypes = [...bucket(monthRows, payKey).entries()]
      .map(([key, rows]) => {
        const people = [...bucket(rows, (r) => M.userId(r) || 'Not Found').values()].map((list) => M.aggregate(list));
        const judged = people.filter((p) => p.count > 0);
        /* passPeople = จำนวนคนในประเภทนี้ที่ค่าเฉลี่ยของตัวเองถึง Target
           ตั้งชื่อแยกจาก pass (สถานะของกลุ่มทั้งก้อน) ไม่ให้ทับกันตอนประกอบตาราง */
        return {
          key, s: M.aggregate(rows), people: people.length,
          judged: judged.length, passPeople: judged.filter((p) => passed(p.average, target)).length
        };
      })
      .sort((a, b) => b.s.rows - a.s.rows);

    /* โซน — Target ต่อโซนมาจาก V3Shared.zoneTargetOf() (โซนที่ตั้งเองไว้ใช้ค่านั้นก่อน Target ตามประเภทงาน) */
    const zoneBuckets = new Map(S.zones.map((z) => [z.key, []]));
    const zoneUnknown = [];
    monthRows.forEach((r) => {
      const z = S.zone(r);
      (z ? zoneBuckets.get(z.key) : zoneUnknown).push(r);
    });
    const zones = S.zones
      .map((z) => ({ zone: z, s: M.aggregate(zoneBuckets.get(z.key)) }))
      .concat(zoneUnknown.length ? [{ zone: { key: 'unknown', label: 'Not Found', group: '' }, s: M.aggregate(zoneUnknown) }] : [])
      .filter((x) => x.s.rows > 0)
      .map((x) => {
        const t = S.zoneTargetOf(x.zone);
        return { ...x, target: t, eff: effOf(x.s.average, t), gap: x.s.average === null ? null : x.s.average - t, pass: passed(x.s.average, t) };
      })
      .sort((a, b) => (b.eff === null ? -1 : b.eff) - (a.eff === null ? -1 : a.eff));

    return {
      data, target, all, days, judgedDays, hitDays, judgedPeople, hitPeople, persons,
      allRows, monthKey, monthDays: daysOfMonth(monthKey, allRows, target), monthList,
      shifts, systems, bpsEarly, payTypes, zones,
      eff: effOf(all.average, target)
    };
  }

  /* ── กราฟ ──
     หน้านี้เขียน <canvas> ใหม่ทั้ง 3 ใบทุกครั้งที่ประกอบหน้า (host.innerHTML = pageHtml)
     Chart.getChart(id) จึงหา canvas ใบใหม่ที่ยังไม่มีกราฟผูกอยู่ แล้วคืน undefined เสมอ
     ทำให้กราฟของ canvas ใบเก่าที่หลุดจาก DOM ไปแล้วไม่ถูก destroy และค้างใน registry ของ Chart.js
     จึงเก็บอินสแตนซ์ไว้เองใน Map ของไฟล์ แล้ว destroy จากตัวจริงก่อนทับ innerHTML และก่อนวาดใหม่ */
  const charts = new Map();

  function destroyChart(id) {
    const own = charts.get(id);
    charts.delete(id);
    if (own) {
      try { own.destroy(); } catch (e) { console.error('V3 efficiency: destroy ' + id, e); }
    }
  }

  function destroyCharts() {
    [...charts.keys()].forEach(destroyChart);
  }

  function draw(id, config) {
    const el = $(id);
    if (!el || typeof Chart === 'undefined') return;
    destroyChart(id);
    /* เผื่อกรณี canvas ใบเดิมยังอยู่ใน DOM (เช่น วาดซ้ำโดยไม่ได้ทับ innerHTML) */
    const onCanvas = typeof Chart.getChart === 'function' ? Chart.getChart(el) : null;
    if (onCanvas) onCanvas.destroy();
    charts.set(id, new Chart(el, config));
  }

  /* ปุ่มเลื่อนเดือนของกราฟรายวัน หน้าตาเดียวกับแถบเลื่อนเดือนของหน้าภาพรวม */
  function monthNavHtml(model) {
    const months = model.monthList || [];
    const i = months.indexOf(model.monthKey);
    const btn = (dir, label, disabled) => '<button type="button" data-eff-month="' + dir + '"' + (disabled ? ' disabled' : '')
      + ' style="border:1px solid ' + (disabled ? '#e2e8f0' : '#cbd5e1') + '; background:' + (disabled ? '#f8fafc' : '#fff')
      + '; color:' + (disabled ? '#cbd5e1' : '#334155') + '; font-family:inherit; font-size:14px; font-weight:700;'
      + ' width:30px; height:30px; border-radius:9px; line-height:1; cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';">' + label + '</button>';
    const monthEff = (() => {
      const rows = (model.allRows || []).filter((r) => M.date(r[2]).slice(0, 7) === model.monthKey);
      const st = M.aggregate(rows);
      return effOf(st.average, model.target);
    })();
    return '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">'
      + btn('prev', '\u2039', i <= 0)
      + '<span style="font-size:13px; font-weight:800; color:#0f172a; min-width:96px; text-align:center;">' + monthLabel(model.monthKey) + '</span>'
      + btn('next', '\u203a', i < 0 || i >= months.length - 1)
      + '<span class="pill v3-pill ' + (monthEff !== null && monthEff >= 100 ? 'good' : 'warn') + '">เฉลี่ยทั้งเดือน ' + pct(monthEff) + '</span>'
      + (dailyMonth ? '<button type="button" data-eff-month="auto" style="border:1px solid #c7d2fe; background:#eef2ff; color:#4338ca; font-size:11.5px; font-weight:700; padding:6px 10px; border-radius:9px; cursor:pointer;">\u21a9 กลับเดือนของวันที่เลือก</button>' : '')
      + '</div>';
  }

  function drawDailyChart(model) {
    if (typeof Chart === 'undefined') return;
    const list = model.monthDays;
    if (!list.length) return;
    /* rawEff = ค่าไม่ปัด ใช้ตัดสินสีทุกที่ (จุด + ป้าย) ให้ตรงกับสถานะผ่าน/ไม่ผ่านและสีในตาราง
       effData = ค่าปัดทศนิยม 1 ตำแหน่ง ใช้เฉพาะเป็นตัวเลขที่พล็อตและข้อความบนป้าย
       ถ้าเอาค่าปัดไประบายสี วันที่ได้ 99.96% จะถูกปัดเป็น 100.0 แล้วกลายเป็นสีเขียว
       ขณะที่ทูลทิปกับตารางบอกว่าไม่ถึงเป้า (ขอบ 90% ก็เพี้ยนแบบเดียวกัน) */
    const rawEff = list.map((d) => d.eff);
    const effData = rawEff.map((e) => (e === null ? null : Math.round(e * 10) / 10));
    const showLabels = list.length <= 32;              // จุดเยอะกว่านี้ป้ายทับกันจนอ่านไม่ออก
    // วันที่อยู่ในช่วงวันที่ที่เลือกบนแถบตัวกรอง ทำจุดใหญ่กว่าเพื่อให้เห็นว่ากำลังโฟกัสวันไหน
    draw('v3EffDailyChart', {
      data: {
        labels: list.map((d) => ddmm(d.date)),
        datasets: [
          {
            type: 'line', label: '% Efficiency', data: effData,
            borderColor: '#2563eb', backgroundColor: '#2563eb',
            borderWidth: 2.5, tension: 0.3, spanGaps: true,
            pointRadius: list.map((d) => (d.inFilter ? 6.5 : 4)),
            pointHoverRadius: 7,
            pointBackgroundColor: list.map((d) => effColor(d.eff)),
            pointBorderColor: '#fff', pointBorderWidth: list.length > 90 ? 0.5 : 1.5,
            datalabels: {
              display: showLabels,
              formatter: (v) => (v === null ? '' : fmt(v, 1) + '%'),
              align: 'top', offset: 4,
              color: (ctx) => effColor(rawEff[ctx.dataIndex]),
              font: { weight: '700', size: 10 },
              backgroundColor: 'rgba(255,255,255,.9)', borderRadius: 4,
              padding: { top: 1, bottom: 1, left: 3, right: 3 }
            }
          },
          {
            type: 'line', label: 'Baseline 100% (Target ' + fmt(model.target) + ' หยิบ/ชม.)',
            data: list.map(() => 100),
            borderColor: '#94a3b8', borderWidth: 1.8, borderDash: [5, 5],
            pointRadius: 0, fill: false, datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              title: (items) => dmy(list[items[0].dataIndex].date),
              label: (ctx) => {
                const d = list[ctx.dataIndex];
                if (ctx.datasetIndex !== 0) return ' เป้ามาตรฐาน 100% (' + fmt(model.target) + ' หยิบ/ชม.)';
                if (d.s.count === 0) return ' วันนี้ไม่มีแถวที่นับได้ จึงไม่ตัดสิน';
                return ' Efficiency ' + pct(d.eff) + ' · Productivity ' + fmt(d.s.average, 1)
                  + ' หยิบ/ชม. · ' + (d.pass ? 'ถึงเป้า' : 'ไม่ถึงเป้า');
              },
              afterBody: (items) => {
                const d = list[items[0].dataIndex];
                return ['Total Pick ' + fmt(d.s.total) + ' ชิ้น',
                  'ชั่วโมงทำงาน ' + fmt(d.s.hours, 1),
                  'แถวเข้าเฉลี่ย ' + fmt(d.s.count) + ' · ไม่เข้าเฉลี่ย ' + fmt(d.s.excluded),
                  'พนักงาน ' + fmt(d.s.people) + ' คน'];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 18, font: { size: 10 } } },
          y: {
            beginAtZero: false, suggestedMin: 50, suggestedMax: 150,
            grid: { color: 'rgba(148,163,184,.25)' },
            ticks: { callback: (v) => v + '%', font: { size: 10.5 } },
            title: { display: true, text: '% ที่ทำได้เทียบเป้า', font: { size: 10.5 } }
          }
        }
      }
    });
  }

  /* กราฟแท่งใบเดียวรวมกะ (AG) กับระบบ เหมือน V2 ที่วางกะ A/B และ PTT/BPS ไว้ใบเดียวกัน */
  function drawGroupChart(model) {
    if (typeof Chart === 'undefined') return;
    const cats = model.shifts.map((x) => ({ label: x.label, s: x.s, kind: 'แยกตามกะ' }))
      .concat(model.systems.map((x) => ({ label: x.label, s: x.s, kind: 'แยกตามระบบ (ประเภทงาน)' })));
    if (!cats.length) return;
    /* ระบายสีด้วยค่าไม่ปัด (rawEff) ให้ตรงกับทูลทิปและสถานะในตาราง
       ค่าปัด (values) ใช้เฉพาะเป็นความสูงของแท่งและตัวเลขบนป้าย */
    const rawEff = cats.map((c) => effOf(c.s.average, model.target));
    const values = rawEff.map((e) => (e === null ? null : Math.round(e * 10) / 10));
    draw('v3EffGroupChart', {
      type: 'bar',
      data: {
        labels: cats.map((c) => c.label),
        datasets: [{
          label: '% Efficiency', data: values,
          backgroundColor: rawEff.map((v) => effColor(v)), borderRadius: 7,
          datalabels: {
            anchor: 'end', align: 'top', color: '#0f172a', font: { weight: '700', size: 10 },
            formatter: (v, ctx) => (v === null ? 'ไม่ตัดสิน'
              : fmt(v, 1) + '%\n(' + fmt(cats[ctx.dataIndex].s.average, 1) + ' หยิบ/ชม.)')
          }
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const c = cats[ctx.dataIndex];
                if (c.s.count === 0) return ' ไม่มีแถวที่นับได้ จึงไม่ตัดสิน';
                return ' Efficiency ' + pct(effOf(c.s.average, model.target))
                  + ' · Productivity ' + fmt(c.s.average, 1) + ' หยิบ/ชม.';
              },
              afterBody: (items) => {
                const c = cats[items[0].dataIndex];
                return [c.kind, 'Target ' + fmt(model.target) + ' หยิบ/ชม.',
                  'Total Pick ' + fmt(c.s.total) + ' ชิ้น',
                  'แถวเข้าเฉลี่ย ' + fmt(c.s.count) + ' · พนักงาน ' + fmt(c.s.people) + ' คน'];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
          y: {
            beginAtZero: true, grid: { color: 'rgba(148,163,184,.25)' },
            suggestedMax: Math.max(120, ...values.filter((v) => v !== null)) * 1.25,
            ticks: { callback: (v) => v + '%', font: { size: 10.5 } }
          }
        }
      }
    });
  }

  /* มิติที่ V2 ไม่มี: ประเภทการจ้างจากคอลัมน์ AQ */
  function drawPayChart(model) {
    if (typeof Chart === 'undefined' || !model.payTypes.length) return;
    const cats = model.payTypes;
    /* เหมือนกราฟกะ/ระบบ: สีมาจากค่าไม่ปัด ตัวเลขที่พล็อตมาจากค่าปัด */
    const rawEff = cats.map((c) => effOf(c.s.average, model.target));
    const values = rawEff.map((e) => (e === null ? null : Math.round(e * 10) / 10));
    draw('v3EffPayChart', {
      type: 'bar',
      data: {
        labels: cats.map((c) => c.key),
        datasets: [{
          label: '% Efficiency', data: values,
          backgroundColor: rawEff.map((v) => effColor(v)), borderRadius: 7,
          datalabels: {
            anchor: 'end', align: 'right', clamp: true, color: '#0f172a', font: { weight: '700', size: 10.5 },
            formatter: (v, ctx) => (v === null ? 'ไม่ตัดสิน'
              : fmt(v, 1) + '%  (' + fmt(cats[ctx.dataIndex].s.average, 1) + ' หยิบ/ชม.)')
          }
        }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const c = cats[ctx.dataIndex];
                if (c.s.count === 0) return ' ไม่มีแถวที่นับได้ จึงไม่ตัดสิน';
                return ' Efficiency ' + pct(effOf(c.s.average, model.target))
                  + ' · Productivity ' + fmt(c.s.average, 1) + ' หยิบ/ชม.';
              },
              afterBody: (items) => {
                const c = cats[items[0].dataIndex];
                return ['Target ' + fmt(model.target) + ' หยิบ/ชม.',
                  'Total Pick ' + fmt(c.s.total) + ' ชิ้น · ชั่วโมง ' + fmt(c.s.hours, 1),
                  'แถว ' + fmt(c.s.rows) + ' · เข้าเฉลี่ย ' + fmt(c.s.count),
                  'พนักงาน ' + fmt(c.people) + ' คน · ถึงเป้า ' + fmt(c.passPeople) + ' / ' + fmt(c.judged) + ' คน'];
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true, grid: { color: 'rgba(148,163,184,.25)' },
            suggestedMax: Math.max(120, ...values.filter((v) => v !== null)) * 1.3,
            ticks: { callback: (v) => v + '%', font: { size: 10.5 } }
          },
          y: { grid: { display: false }, ticks: { font: { size: 11.5, weight: '600' } } }
        }
      }
    });
  }

  /* ── ตาราง (ใช้ V3Shared.table เพื่อให้ค้นหา/เรียง/Export CSV ได้ทุกตาราง)
     คอลัมน์ที่แปลง null เป็น 0 หรือเป็นข้อความเพื่อแสดงผล ต้องใส่ sortValue คืน null
     ไม่ให้กลุ่มที่ยังไม่ตัดสินไปแทรกกลางอันดับ ── */
  const statusCell = (item) => (item.s.count === 0
    ? '<span class="v3-pill">ไม่ตัดสิน</span>'
    : (item.pass ? '<span class="badge-status pass">ถึงเป้า</span>' : '<span class="badge-status fail">ไม่ถึงเป้า</span>'));
  const gapCell = (item) => (item.gap === null ? '—'
    : (item.gap >= 0 ? '<span class="staff-up">' + signed(item.gap) + '</span>'
      : '<span class="staff-down">' + signed(item.gap) + '</span>'));

  function dailyTable(model) {
    const container = $('v3EffDailyTable');
    if (!container) return;
    const newestFirst = [...model.days].reverse();     // วันล่าสุดขึ้นก่อน กดหัวคอลัมน์เรียงใหม่ได้
    S.table(container, 'eff-daily', newestFirst, [
      { title: 'วันที่', value: (d) => dmy(d.date), sortValue: (d) => d.date },
      { title: 'Total Pick', value: (d) => d.s.total, num: true, html: (d) => fmt(d.s.total) },
      { title: 'ชั่วโมงทำงาน', value: (d) => d.s.hours, num: true, html: (d) => fmt(d.s.hours, 1) },
      { title: 'Productivity (หยิบ/ชม.)', value: (d) => d.s.average, num: true, html: (d) => '<b>' + fmt(d.s.average, 1) + '</b>' },
      { title: 'Target', value: (d) => model.target, num: true },
      {
        title: '% Efficiency', value: (d) => (d.eff === null ? '—' : d.eff), num: true, sortValue: (d) => d.eff,
        html: (d) => '<b style="color:' + effColor(d.eff) + '">' + pct(d.eff) + '</b>'
      },
      { title: 'Gap (หยิบ/ชม.)', value: (d) => (d.gap === null ? '—' : d.gap), num: true, sortValue: (d) => d.gap, html: gapCell },
      { title: 'แถวเข้าเฉลี่ย', value: (d) => d.s.count, num: true },
      { title: 'แถวไม่เข้าเฉลี่ย', value: (d) => d.s.excluded, num: true },
      { title: 'พนักงาน', value: (d) => d.s.people, num: true },
      { title: 'สถานะ', value: (d) => (d.s.count === 0 ? 'ไม่ตัดสิน' : (d.pass ? 'ถึงเป้า' : 'ไม่ถึงเป้า')), html: statusCell }
    ]);
  }

  function zoneTable(model) {
    const container = $('v3EffZoneTable');
    if (!container) return;
    const ranked = model.zones;                        // เรียง % Efficiency มาก → น้อย มาแล้วจาก buildModel()
    S.table(container, 'eff-zones', ranked, [
      {
        title: 'อันดับ', value: (z) => ranked.indexOf(z) + 1, num: true,
        html: (z) => '<span class="rank">' + (ranked.indexOf(z) + 1) + '</span>'
      },
      {
        title: 'โซน', value: (z) => z.zone.label,
        html: (z) => '<b>' + esc(z.zone.label) + '</b>'
          + '<span class="sub">' + esc(S.zoneLabels[z.zone.group] || 'ไม่พบโซน') + '</span>'
      },
      { title: 'ประเภทงาน', value: (z) => S.zoneLabels[z.zone.group] || 'Not Found' },
      { title: 'Total Pick', value: (z) => z.s.total, num: true, html: (z) => fmt(z.s.total) },
      { title: 'ชั่วโมงทำงาน', value: (z) => z.s.hours, num: true, html: (z) => fmt(z.s.hours, 1) },
      { title: 'Productivity (หยิบ/ชม.)', value: (z) => z.s.average, num: true, html: (z) => '<b>' + fmt(z.s.average, 1) + '</b>' },
      { title: 'Target ของโซน', value: (z) => z.target, num: true },
      {
        title: '% Efficiency', value: (z) => (z.eff === null ? '—' : z.eff), num: true, sortValue: (z) => z.eff,
        html: (z) => '<b style="color:' + effColor(z.eff) + '">' + pct(z.eff) + '</b>'
      },
      { title: 'Gap (หยิบ/ชม.)', value: (z) => (z.gap === null ? '—' : z.gap), num: true, sortValue: (z) => z.gap, html: gapCell },
      { title: 'แถวเข้าเฉลี่ย', value: (z) => z.s.count, num: true },
      { title: 'พนักงาน', value: (z) => z.s.people, num: true },
      { title: 'สถานะ', value: (z) => (z.s.count === 0 ? 'ไม่ตัดสิน' : (z.pass ? 'ถึงเป้า' : 'ไม่ถึงเป้า')), html: statusCell }
    ]);
  }

  function payTable(model) {
    const container = $('v3EffPayTable');
    if (!container) return;
    const list = model.payTypes.map((p) => ({
      ...p, eff: effOf(p.s.average, model.target),
      gap: p.s.average === null ? null : p.s.average - model.target,
      pass: passed(p.s.average, model.target)
    }));
    S.table(container, 'eff-paytype', list, [
      { title: 'ประเภทการจ้าง', value: (p) => p.key, html: (p) => '<b>' + esc(p.key) + '</b>' },
      { title: 'พนักงาน', value: (p) => p.people, num: true },
      { title: 'Total Pick', value: (p) => p.s.total, num: true, html: (p) => fmt(p.s.total) },
      { title: 'ชั่วโมงทำงาน', value: (p) => p.s.hours, num: true, html: (p) => fmt(p.s.hours, 1) },
      { title: 'Productivity (หยิบ/ชม.)', value: (p) => p.s.average, num: true, html: (p) => '<b>' + fmt(p.s.average, 1) + '</b>' },
      { title: 'Target', value: () => model.target, num: true },
      {
        title: '% Efficiency', value: (p) => (p.eff === null ? '—' : p.eff), num: true, sortValue: (p) => p.eff,
        html: (p) => '<b style="color:' + effColor(p.eff) + '">' + pct(p.eff) + '</b>'
      },
      { title: 'Gap (หยิบ/ชม.)', value: (p) => (p.gap === null ? '—' : p.gap), num: true, sortValue: (p) => p.gap, html: gapCell },
      {
        /* V3Shared.table ใช้ value() ทั้งตอนค้นหาและตอน Export CSV จึงต้องคืนค่าที่ตรงกับที่ตาเห็น
           ของเดิมคืน % ทศนิยมยาว ทำให้ CSV ได้ 14.61187214611872 ใต้หัวคอลัมน์ "คนที่ถึงเป้า"
           และพิมพ์ค้นหา 32 หรือ 219 ไม่เจอแถวนี้ · การเรียงยังใช้ % ผ่าน sortValue เหมือนเดิม */
        title: 'คนที่ถึงเป้า',
        value: (p) => (p.judged ? fmt(p.passPeople) + ' / ' + fmt(p.judged) + ' คน' : '—'), num: true,
        sortValue: (p) => (p.judged ? p.passPeople / p.judged * 100 : null),
        html: (p) => (p.judged
          ? fmt(p.passPeople) + ' / ' + fmt(p.judged) + ' คน<span class="sub">' + pct(p.passPeople / p.judged * 100) + '</span>'
          : '—')
      },
      { title: 'แถวทั้งหมด', value: (p) => p.s.rows, num: true },
      { title: 'แถวเข้าเฉลี่ย', value: (p) => p.s.count, num: true },
      { title: 'สถานะ', value: (p) => (p.s.count === 0 ? 'ไม่ตัดสิน' : (p.pass ? 'ถึงเป้า' : 'ไม่ถึงเป้า')), html: statusCell }
    ]);
  }

  /* ── ประกอบหน้า ── */
  function pageHtml(model) {
    const t = model.target;
    const hitDayPct = model.judgedDays.length ? model.hitDays.length / model.judgedDays.length * 100 : null;
    const hitPeoplePct = model.judgedPeople.length ? model.hitPeople.length / model.judgedPeople.length * 100 : null;
    const notJudgedDays = model.days.length - model.judgedDays.length;
    const notJudgedPeople = model.persons.length - model.judgedPeople.length;
    const gap = model.all.average === null ? null : model.all.average - t;
    const isHit = passed(model.all.average, t);
    const zonesJudged = model.zones.filter((z) => z.s.count > 0);
    const zonesPass = zonesJudged.filter((z) => z.pass);
    const payNote = model.payTypes.map((p) => esc(p.key) + ' ' + pct(effOf(p.s.average, t))
      + ' (' + fmt(p.s.average, 1) + ' หยิบ/ชม. · ' + fmt(p.people) + ' คน)').join(' · ');

    /* การ์ด 4 ใบเรียงเหมือน V2: Efficiency เฉลี่ยรวม → สถานะภาพรวม → วันที่ผ่านเกณฑ์ → พนักงานที่ผ่านเกณฑ์ */
    const cards = summaryRow([
      ['🎯 Efficiency เฉลี่ยรวม', pct(model.eff), '',
        'Productivity ' + fmt(model.all.average, 1) + ' หยิบ/ชม. เทียบเป้า ' + fmt(t), effColor(model.eff)],
      ['📊 สถานะภาพรวม', model.all.average === null ? 'ไม่ตัดสิน' : (isHit ? 'ถึงเป้า (Hit)' : 'ไม่ถึงเป้า (Miss)'), '',
        model.all.average === null ? 'ยังไม่มีแถวที่นับได้ในช่วงที่เลือก'
          : (gap >= 0 ? 'เกินเป้า ' + signed(gap) + ' หยิบ/ชม.' : 'ยังขาดอีก ' + fmt(Math.abs(gap), 1) + ' หยิบ/ชม.'),
        model.all.average === null ? GREY : (isHit ? GREEN : RED)],
      ['📅 วันที่ผ่านเกณฑ์ (Hit Rate)', fmt(model.hitDays.length) + ' / ' + fmt(model.judgedDays.length), 'วัน',
        (hitDayPct === null ? 'ยังไม่มีวันที่นับได้' : pct(hitDayPct) + ' ของวันที่นับ Productivity ได้')
        + (notJudgedDays ? ' · อีก ' + fmt(notJudgedDays) + ' วันไม่มีแถวเข้าเฉลี่ย จึงไม่ตัดสิน' : ''), '#2563eb'],
      ['👥 พนักงานที่ผ่านเกณฑ์', fmt(model.hitPeople.length) + ' / ' + fmt(model.judgedPeople.length), 'คน',
        (hitPeoplePct === null ? 'ยังไม่มีคนที่นับได้' : pct(hitPeoplePct) + ' ของคนที่นับ Productivity ได้')
        + (notJudgedPeople ? ' · อีก ' + fmt(notJudgedPeople) + ' คนไม่มีแถวเข้าเฉลี่ย จึงไม่ตัดสิน' : ''), '#7c3aed']
    ]);

    return cards
      /* โน้ตใต้การ์ด — บอกที่มาของตัวเลขและบอกตรง ๆ ว่าอะไรของ V2 ทำไม่ได้เพราะไม่มีข้อมูล */
      + '<div class="note v3-notice">'
      + '<b>ที่มาของตัวเลข</b> · Productivity = ผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น '
      + '(รวมครั้งเดียวทุกระดับ ไม่เอาค่าเฉลี่ยมาเฉลี่ยซ้ำ) · '
      + '% Efficiency = Productivity ÷ Target × 100 · <b>เท่ากับเป้านับว่าผ่าน</b> · '
      + 'Total Pick = ผลรวมยอดหยิบของทุกแถวที่มีวันที่ รวมแถวที่ไม่เข้าเฉลี่ยด้วย · '
      + 'ช่วงนี้มี ' + fmt(model.all.rows) + ' แถว เข้าเฉลี่ย ' + fmt(model.all.count) + ' แถว '
      + 'ไม่เข้าเฉลี่ย ' + fmt(model.all.excluded) + ' แถว · Target รวมตอนนี้ ' + fmt(t) + ' หยิบ/ชม. '
      + 'แก้ได้จากปุ่ม ⚙️ ตั้งค่า Target บนแถบตัวกรองด้านบน (Target รายโซนก็อยู่ในหน้าต่างนั้น)'
      + '<br><b>สิ่งที่หน้านี้ของ V2 มีแต่ V3 ทำไม่ได้</b> — ข้อมูลจริงมีแค่ 1 แถวต่อคนต่อวัน จึง<b>ไม่มี</b> '
      + 'จำนวนชิ้นดิบ (pcs) จำนวนบรรทัด (lines) SKU Owner Location ระดับช่อง และเวลาเริ่ม-จบระดับนาที · '
      + 'หน้านี้จึงมีหน่วยเดียวคือ หยิบ/ชม. ไม่มีโหมด ชิ้น/ชม. และไม่มี Cycle time ต่อบรรทัดแบบ V2 · '
      + 'โซนที่ Sheet บันทึกไว้เป็นโซนสังกัดของคนในวันนั้น ไม่ใช่โซนที่หยิบจริงรายรายการ ตารางรายโซนจึงอ่านได้ว่า '
      + '"ผลงานของคนที่สังกัดโซนนั้น" · ไม่มีแผนงานล่วงหน้าและไม่มี blendedTarget จึงไม่มีการพยากรณ์'
      + (model.bpsEarly ? '<br>Pick to Sort ' + fmt(model.bpsEarly) + ' แถวก่อน 08/06/2026 ไม่เข้าถังระบบใด  ที่ให้ BPS เริ่มนับ 08/06/2026' : '')
      + '</div>'

      + '<div class="card wide v3-card">'
      + '<div class="staff-card-head"><div>'
      + '<h3>📈 แนวโน้ม % Efficiency รายวัน</h3>'
      + '<div class="sub">เส้นทึบคือ % ที่ทำได้ เทียบเส้นประ Baseline 100% (= Target ' + fmt(t) + ' หยิบ/ชม.) · '
      + 'จุดเขียวถึงเป้า · จุดส้ม 90–99.9% · จุดแดงต่ำกว่า 90% · '
      + 'กางทั้งเดือนเสมอ ไม่หุบตามตัวกรองวันที่ · จุดใหญ่คือวันที่อยู่ในช่วงวันที่ที่เลือก</div></div>'
      + '<span class="pill v3-pill ' + (isHit ? 'good' : 'warn') + '">รวมช่วงที่กรอง ' + pct(model.eff) + '</span>'
      + '</div>'
      + monthNavHtml(model)
      + '<div class="chartbox tall"><canvas id="v3EffDailyChart"></canvas></div>'
      + '</div>'

      + '<div class="card wide v3-card">'
      + '<div class="staff-card-head"><div>'
      + '<h3>🅰️🅱️ % Efficiency แยกตามกะ และระบบ</h3>'
      + '<div class="sub">กะอ่านตามที่ Sheet บันทึกไว้ (ไม่เดาจากเวลา) · '
      + 'ระบบแยกจากประเภทงานที่ Sheet บันทึกไว้ · ทุกแท่งเทียบ Target รวม ' + fmt(t) + ' หยิบ/ชม. · '
      + '<b>ใช้ข้อมูลทั้งเดือน ' + monthLabel(model.monthKey) + '</b> เลื่อนเดือนได้ที่การ์ดกราฟรายวันด้านบน</div></div>'
      + '<span class="pill">' + monthLabel(model.monthKey) + '</span>'
      + '</div>'
      + '<div class="chartbox tall"><canvas id="v3EffGroupChart"></canvas></div>'
      + '<div class="note v3-notice">ถัง "ไม่ระบุกะ" คือแถวที่ Sheet เว้นกะไว้ว่าง หรือเป็น Not Found Data / #N/A / ขีด — '
      + 'ไม่ใช่กะจริง ต้องเติมข้อมูลก่อนจะเชื่อเลขของถังนี้ได้ · '
      + 'ถัง "ไม่ระบุประเภทงาน" คือประเภทงานที่ Sheet บันทึกไว้แต่เทียบกับเกณฑ์ที่ใช้ ไม่ได้ (เช่น ช่วยงานส่วนอื่น) จึงไม่รู้ว่าเป็น PTT หรือ BPS</div>'
      + '</div>'

      + '<div class="card wide v3-card">'
      + '<div class="staff-card-head"><div>'
      + '<h3>🧾 % Efficiency แยกตามประเภทการจ้าง</h3>'
      + '<div class="sub">มิติที่หน้า Efficiency ของ V2 ไม่มี — Sheet บันทึกไว้ว่าแถวนั้นเป็นพนักงาน รายวัน หรือ รายเดือน · '
      + '<b>ใช้ข้อมูลทั้งเดือน ' + monthLabel(model.monthKey) + '</b></div></div>'
      + '<span class="pill">' + fmt(model.payTypes.length) + ' ประเภทที่พบจริง</span>'
      + '</div>'
      + '<div class="chartbox"><canvas id="v3EffPayChart"></canvas></div>'
      + '<div class="note v3-notice">แสดงเฉพาะประเภทการจ้างที่มีอยู่จริงในเดือนนี้ ไม่เติมประเภทที่ไม่พบ · '
      + (payNote || 'ยังไม่มีข้อมูลในช่วงที่เลือก')
      + ' · แถวที่ไม่ได้ระบุประเภทการจ้างจัดไว้ในถัง "ไม่ระบุ" ตามค่าจริง ไม่เดาให้เป็นรายเดือน</div>'
      + '</div>'

      + '<h2 class="staff-table-title">ผลงานและ % Efficiency รายวัน</h2>'
      + '<p class="panel-desc">วันล่าสุดขึ้นก่อน · กดหัวคอลัมน์เพื่อเรียงใหม่ · Gap คือ Productivity ลบ Target '
      + '(ติดลบคือยังขาดอีกกี่หยิบ/ชม.) · ชั่วโมงทำงานมาจาก Sheet ตรง ๆ ไม่ลบ 7 ชั่วโมง และไม่ย้ายยอดหลังเที่ยงคืน</p>'
      + '<div id="v3EffDailyTable"></div>'

      + '<h2 class="staff-table-title">อันดับ % Efficiency รายโซน (ทั้งเดือน ' + monthLabel(model.monthKey) + ')</h2>'
      + '<p class="panel-desc">เทียบ Target ของแต่ละโซน (โซนไหนตั้งเองไว้ใช้ค่านั้นก่อน Target ตามประเภทงาน) · '
      + 'ช่วงนี้ถึงเป้า ' + fmt(zonesPass.length) + ' จาก ' + fmt(zonesJudged.length) + ' โซนที่นับได้ · '
      + 'กอง Not Found ไม่ใช่โซนจริง (โซนที่ Sheet บันทึกไว้ไม่ตรงกฎโซนของ V1) จึงเทียบกับ Target รวม ' + fmt(t) + '</p>'
      + '<div id="v3EffZoneTable"></div>'

      + '<h2 class="staff-table-title">ตารางประเภทการจ้าง (รายวัน / รายเดือน)</h2>'
      + '<p class="panel-desc">ตัวเลขชุดเดียวกับกราฟด้านบน กด Export CSV ได้ · '
      + '"คนที่ถึงเป้า" นับเฉพาะคนที่มีแถวเข้าเฉลี่ยในประเภทนั้น · '
      + 'คนหนึ่งคนอาจมีทั้งแถวรายวันและรายเดือนได้ ผลรวมจำนวนคนของทุกประเภทจึงอาจมากกว่าจำนวนคนทั้งหมด</p>'
      + '<div id="v3EffPayTable"></div>';
  }

  function renderPage() {
    const host = $(HOST);
    if (!host) return;
    const model = buildModel();
    /* ทับ innerHTML = canvas ทั้ง 3 ใบหลุดจาก DOM จึงต้องปล่อยกราฟเดิมก่อนทุกทางออก */
    destroyCharts();
    if (!model.data.length) {
      host.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">ยังไม่มีแถวในช่วงวันที่ / ระบบ / กะ ที่เลือก</div></div>';
      return;
    }
    host.innerHTML = pageHtml(model);

    /* ปุ่มเลือกช่วงของกราฟรายวัน — เปลี่ยนแค่มุมมอง ไม่แตะตัวเลข */
    host.querySelectorAll('[data-eff-month]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = btn.dataset.effMonth;
        if (step === 'auto') {
          dailyMonth = '';
        } else {
          const list = model.monthList;
          const next = list[list.indexOf(model.monthKey) + (step === 'next' ? 1 : -1)];
          if (!next) return;
          dailyMonth = next;
        }
        renderAll();
      });
    });

    drawDailyChart(model);
    drawGroupChart(model);
    drawPayChart(model);
    dailyTable(model);
    zoneTable(model);
    payTable(model);
  }

  /* ── ตัวควบคุมการเรนเดอร์ ──
     .tab-panel ที่ไม่ได้เลือกเป็น display:none กราฟที่วาดตอนซ่อนจะได้ canvas สูง 0
     จึงเรนเดอร์เฉพาะตอน panel มีคลาส active และจำไว้ว่าค้างอยู่ถ้าข้อมูลมาตอนซ่อน */
  let scheduled = null;

  function isActive() {
    const panel = $(PANEL);
    return Boolean(panel && panel.classList.contains('active'));
  }

  function renderAll() {
    if (!window.V3Data || !window.V3Data.current) return;
    if (!isActive()) return;              // ซ่อนอยู่ = canvas สูง 0 · จะวาดตอนกดกลับมาหน้านี้
    try {
      renderPage();
    } catch (e) {
      console.error('V3 efficiency:', e);
      const host = $(HOST);
      if (host && !host.querySelector('.v3-table')) {
        destroyCharts();                    // ข้อความแจ้ง error ทับ canvas ทิ้ง จึงปล่อยกราฟก่อน
        host.innerHTML = '<div class="note v3-notice">เรนเดอร์หน้า Efficiency ไม่สำเร็จ · ดูรายละเอียดใน Console</div>';
      }
    }
  }

  function schedule(delay) {
    clearTimeout(scheduled);
    scheduled = setTimeout(renderAll, delay || 120);
  }

  window.V3Data.subscribe(() => schedule(120));
  document.addEventListener('v3-render', () => schedule(120));
  /* กดปุ่มเมนู — หน่วงให้ v2-shell.js ใส่คลาส active ให้ panel ก่อน แล้วค่อยวาด
     วาดใหม่ทุกครั้งที่กลับมาหน้านี้ เพราะ canvas ที่เคยวาดตอนซ่อนจะสูง 0 */
  document.querySelectorAll('.nav-item[data-tab="efficiency"]').forEach((btn) => {
    btn.addEventListener('click', () => schedule(70));
  });
  /* เผื่อ index.html เปิดหน้านี้เป็นหน้าแรก (panel active อยู่แล้วตอนโหลด) */
  if (isActive()) schedule(200);
})();
