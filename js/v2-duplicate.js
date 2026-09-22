/* v2-duplicate.js — การ์ดตรวจแถวที่อาจบันทึกซ้ำ (อยู่บนหน้า Not Found & คุณภาพข้อมูล)
   ทำไมต้องมี: สูตรที่ใช้นับทุกแถวหนึ่งครั้ง ถ้าต้นทางบันทึกวันเดียวกันของคนเดียวกันสองแถว
               ยอดหยิบจะเกินจริงและค่าเฉลี่ยจะเพี้ยนตาม โดยไม่มีอะไรบนเว็บบอกเลย

   การ์ดนี้ไม่ตัดยอดและไม่แก้สูตรใด ๆ หน้าที่คือเอาหลักฐานมาวางให้เจ้าของข้อมูลตัดสิน

   สิ่งที่วัดได้จากข้อมูลจริงและเป็นตัวกำหนดหน้าตาการ์ดนี้
   1) ธงซ้ำที่ต้นทางติดไว้ = "แถวนี้มีรหัสพนักงานกับวันที่ตรงกับแถวอื่น" เป๊ะ ๆ
      ตรวจเทียบกับการจับคู่ของเว็บแล้วไม่ต่างกันแม้แถวเดียว และตัวเลขบนธงคือจำนวนแถวในกลุ่ม
      ธงจึงบอกแค่ว่า "ซ้ำคีย์" ไม่ได้บอกว่า "ซ้ำของจริง" — ยังต้องมีคนตัดสิน
   2) กะ โซน ประเภทงาน สังกัด BU ใช้เป็นตัวตัดสินไม่ได้เลย เพราะทุกช่องดึงมาจากทะเบียน
      ด้วยรหัสพนักงาน แถวของคนเดียวกันจึงได้ค่าเหมือนกันโดยปริยาย (วัดแล้วไม่ต่างกันสักกลุ่ม)
   3) ตัวตัดสินที่ใช้ได้จริงคือ "ชั่วโมงที่ทับกัน" เพราะยอดรายชั่วโมงเป็นค่าของแถวนั้นเอง
      คนหนึ่งคนหยิบของในชั่วโมงเดียวกันสองรายการไม่ได้ ถ้าชั่วโมงทับกันคือน่าสงสัย
      ถ้าไม่ทับกันเลยคือการแยกบันทึกวันเดียวกันเป็นสองรอบ ซึ่งชอบธรรม

   สแกนทุกแถวที่มีวันที่ทั้งชุด ไม่ขึ้นกับตัวกรองด้านบน เพราะเป็นการตรวจคุณภาพข้อมูล
   ไม่ใช่การรายงานผลงานของช่วงใดช่วงหนึ่ง */
(() => {
  'use strict';

  const HOST = 'v3Duplicates';
  const PANEL = 'tab-quality';
  const M = window.V3Metrics;
  const $ = (id) => document.getElementById(id);
  const S = () => window.V3Shared;
  if (!M) return;

  /* ช่องยอดรายชั่วโมง: ช่องแรกคือ 7:00–8:00 ไล่ไปจนครบ 24 ชั่วโมงแล้วข้ามเที่ยงคืนไปจบ 6:00–7:00 */
  const H0 = 7;
  const H1 = 30;
  const hourOf = (i) => i % 24;                       // ช่องที่ 7 → 7 นาฬิกา · ช่องที่ 30 → 6 นาฬิกา

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(Number(v))
    ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
  const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');

  /* ช่วงเวลาแบบย่อ: ช่องติดกันยุบเป็นช่วงเดียว เช่น 13:00–17:00 */
  function ranges(slots) {
    const out = [];
    slots.forEach((i) => {
      const last = out[out.length - 1];
      if (last && last.to === i - 1) last.to = i;
      else out.push({ from: i, to: i });
    });
    return out.map((r) => hourOf(r.from) + ':00–' + hourOf(r.to + 1) + ':00').join(' , ');
  }

  function build() {
    const shared = S();
    if (!shared) return null;
    const rows = shared.rows.filter((r) => M.date(r[2]) && M.userId(r));
    const roster = shared.roster;

    /* จับกลุ่มด้วย รหัสพนักงาน + วันที่ */
    const groups = new Map();
    let allTotal = 0;
    rows.forEach((r) => {
      allTotal += M.number(r[4]);
      const key = M.userId(r) + '|' + M.date(r[2]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    const dup = [];
    groups.forEach((list, key) => {
      if (list.length < 2) return;
      const id = key.slice(0, key.indexOf('|'));
      const date = key.slice(key.indexOf('|') + 1);

      /* ชั่วโมงที่มียอดของแต่ละแถว และชั่วโมงที่มียอดในหลายแถวพร้อมกัน */
      const slotsOf = (r) => { const s = []; for (let i = H0; i <= H1; i += 1) if (M.number(r[i]) > 0) s.push(i); return s; };
      const overlapSlots = [];
      let overlapPicks = 0;
      for (let i = H0; i <= H1; i += 1) {
        const vals = list.map((r) => M.number(r[i])).filter((v) => v > 0);
        if (vals.length > 1) {
          overlapSlots.push(i);
          /* ยอดที่อาจเกินจริงของชั่วโมงนั้น = ยอดรวมทุกแถว ลบแถวที่มากที่สุด
             (เก็บแถวที่มากสุดไว้หนึ่งแถว ไม่ใช่การตัดยอด แค่ประมาณส่วนที่อาจนับซ้ำ) */
          overlapPicks += vals.reduce((a, b) => a + b, 0) - Math.max.apply(null, vals);
        }
      }

      /* เหมือนกันทุกอย่าง = ยอดหยิบเท่ากันและลงชั่วโมงชุดเดียวกันเป๊ะ */
      const sig = list.map((r) => M.number(r[4]) + '@' + slotsOf(r).join(','));
      const identical = new Set(sig).size < sig.length;
      const hoursSum = list.reduce((a, r) => a + M.number(r[6]), 0);

      dup.push({
        id, date, rows: list, count: list.length,
        name: M.personName(list[0], roster),
        total: list.reduce((a, r) => a + M.number(r[4]), 0),
        totals: list.map((r) => M.number(r[4])),
        averages: list.map((r) => M.number(r[31])).filter((v) => v > 0),
        counted: list.filter((r) => M.number(r[31]) > 0).length,
        flags: [...new Set(list.map((r) => String(r[39] ?? '').trim()).filter(Boolean))],
        slots: list.map(slotsOf),
        overlapSlots, overlapPicks, identical, hoursSum,
        risk: identical ? 'สูง' : (overlapSlots.length ? 'กลาง' : 'ต่ำ')
      });
    });

    dup.sort((a, b) => b.overlapPicks - a.overlapPicks
      || (b.identical ? 1 : 0) - (a.identical ? 1 : 0) || b.count - a.count);

    /* ธงของต้นทางกับการจับคู่ของเว็บตรงกันหรือไม่ — ถ้าไม่ตรง ต้องรู้ว่ากี่แถว */
    const isFlag = (r) => { const f = String(r[39] ?? '').trim(); return f !== '' && f !== '1'; };
    const dupKeys = new Set(dup.map((g) => g.id + '|' + g.date));
    const inGroup = (r) => dupKeys.has(M.userId(r) + '|' + M.date(r[2]));
    let flaggedRows = 0;
    let mismatch = 0;
    rows.forEach((r) => {
      const f = isFlag(r);
      if (f) flaggedRows += 1;
      if (f !== inGroup(r)) mismatch += 1;
    });

    return {
      rows, dup, allTotal, flaggedRows, mismatch,
      extraRows: dup.reduce((a, g) => a + g.count - 1, 0),
      overlapPicks: dup.reduce((a, g) => a + g.overlapPicks, 0),
      overlapHours: dup.reduce((a, g) => a + g.overlapSlots.length, 0),
      high: dup.filter((g) => g.risk === 'สูง'),
      mid: dup.filter((g) => g.risk === 'กลาง'),
      low: dup.filter((g) => g.risk === 'ต่ำ'),
      over24: dup.filter((g) => g.hoursSum > 24),
      dupCounted: dup.reduce((a, g) => a + g.counted, 0)
    };
  }

  function riskPill(risk) {
    if (risk === 'สูง') return '<span class="v3-pill warn">สูง</span>';
    if (risk === 'กลาง') return '<span class="v3-pill">กลาง</span>';
    return '<span class="v3-pill good">ต่ำ</span>';
  }

  function headHtml(d) {
    const pctPicks = d.allTotal ? d.overlapPicks / d.allTotal * 100 : 0;
    const suspect = d.high.length + d.mid.length;
    return '<section class="card wide" style="margin-bottom:18px;">'
      + '<div class="staff-card-head"><div><h3>🔁 แถวที่อาจบันทึกซ้ำ</h3>'
      + '<div class="sub">สูตรที่ใช้นับ<b>ทุกแถวหนึ่งครั้ง</b> ถ้าต้นทางบันทึกวันเดียวของคนเดียวสองแถว'
      + ' ยอดหยิบจะเกินจริงและค่าเฉลี่ยจะเพี้ยนตาม'
      + ' · การ์ดนี้<b>ไม่ตัดยอดและไม่แก้สูตรใด ๆ</b> เอาหลักฐานมาวางให้ตัดสินเท่านั้น'
      + ' · สแกนทุกแถวที่มีวันที่ทั้งชุด ' + fmt(d.rows.length) + ' แถว ไม่ขึ้นกับตัวกรองด้านบน</div></div>'
      + '<span class="pill v3-pill ' + (suspect ? 'warn' : 'good') + '">'
      + (suspect ? 'ต้องดู ' + fmt(suspect) + ' กลุ่ม' : 'ไม่มีกลุ่มที่น่าสงสัย') + '</span></div>'

      + S().statCards([
        ['🔁 คู่ที่ซ้ำคีย์ (รหัส + วันที่)', fmt(d.dup.length), 'กลุ่ม',
          'มีแถวเกินมา ' + fmt(d.extraRows) + ' แถว · ธงที่ต้นทางติดไว้ ' + fmt(d.flaggedRows) + ' แถว'
          + ' เทียบกับที่เว็บจับคู่ได้แล้วไม่ตรงกัน ' + fmt(d.mismatch) + ' แถว', '#6366f1'],
        ['⏱️ ชั่วโมงที่ทับกัน', fmt(d.overlapHours), 'ชั่วโมง-คน',
          'ชั่วโมงเดียวกันมียอดอยู่ในหลายแถวพร้อมกัน — คนหนึ่งคนหยิบของสองรายการในชั่วโมงเดียวกันไม่ได้', '#ea580c'],
        ['📦 ยอดที่อาจเกินจริง', fmt(d.overlapPicks), 'ชิ้น',
          'เฉพาะยอดบนชั่วโมงที่ทับกัน หักแถวที่มากสุดไว้หนึ่งแถว · คิดเป็น ' + fmt(pctPicks, 2) + '%'
          + ' ของยอดทั้งชุด ' + fmt(d.allTotal) + ' ชิ้น', pctPicks >= 3 ? '#e11d48' : '#f59e0b'],
        ['⚠️ เหมือนกันทุกอย่าง', fmt(d.high.length), 'กลุ่ม',
          'ยอดหยิบเท่ากันและลงชั่วโมงชุดเดียวกันเป๊ะ — เข้าข่ายบันทึกซ้ำมากที่สุด',
          d.high.length ? '#e11d48' : '#16a34a'],
        ['✅ ไม่ทับชั่วโมงกันเลย', fmt(d.low.length), 'กลุ่ม',
          'คนละช่วงเวลาในวันเดียวกัน เช่นบ่ายรอบหนึ่งกับค่ำอีกรอบ — น่าจะเป็นการแยกบันทึก ไม่ใช่ซ้ำ', '#16a34a'],
        ['🕐 ชั่วโมงรวมเกิน 24', fmt(d.over24.length), 'กลุ่ม',
          'ชั่วโมงทำงานของทุกแถวรวมกันเกินหนึ่งวัน จึงเป็นไปไม่ได้ทั้งหมด',
          d.over24.length ? '#be123c' : '#16a34a'],
        ['🧮 แถวซ้ำที่เข้าเฉลี่ย', fmt(d.dupCounted), 'แถว',
          'แถวพวกนี้มีผลต่อค่าเฉลี่ยต่อชั่วโมงโดยตรง', '#7c3aed']
      ])

      + '<div class="note v3-notice" style="margin-top:14px;">'
      + '<b>ตัดสินจากอะไร</b> — คนหนึ่งคนมีหลายแถวในวันเดียวได้โดยชอบธรรม เช่นแยกบันทึกเป็นรอบบ่ายกับรอบค่ำ'
      + ' ตัวตัดสินจึงเป็น<b>ชั่วโมงที่ทับกัน</b> เพราะยอดรายชั่วโมงเป็นค่าของแถวนั้นเอง'
      + ' ถ้าชั่วโมงไม่ทับกันเลยคือคนละรอบจริง ถ้าทับกันคือมีแถวหนึ่งเกินมา'
      + ' และถ้าขึ้นว่า<b>เหมือนกันทุกอย่าง</b> คือยอดและชั่วโมงตรงกันเป๊ะ เข้าข่ายบันทึกซ้ำมากที่สุด'
      + '<br><b>กะ โซน ประเภทงาน สังกัด BU ใช้ตัดสินไม่ได้</b> เพราะทุกช่องดึงมาจากทะเบียนด้วยรหัสพนักงาน'
      + ' แถวของคนเดียวกันจึงได้ค่าเหมือนกันโดยปริยาย ตรวจแล้วไม่ต่างกันสักกลุ่มเดียว'
      + '<br><b>ธงซ้ำของต้นทางบอกได้แค่ว่าซ้ำคีย์</b> เทียบกับการจับคู่ของเว็บแล้วตรงกันทุกแถว'
      + ' และเลขบนธงคือจำนวนแถวในกลุ่มนั้น จึงไม่ได้แปลว่าต้นทางตรวจแล้วว่าซ้ำของจริง'
      + '<br><b>ยังไม่มีอะไรถูกตัดออกจากยอด</b> ทุกหน้าบนเว็บยังนับแถวพวกนี้อยู่ตามกฎเดิม'
      + ' ถ้ายืนยันว่าซ้ำจริงต้องไปแก้ที่ต้นทาง แล้วเว็บจะอัปเดตตามเอง</div>'
      + '</section>'

      + '<h2 class="staff-table-title">รายการคู่ที่ซ้ำคีย์</h2>'
      + '<p class="panel-desc">เรียงตามยอดที่อาจเกินจริง มาก→น้อย · กดหัวคอลัมน์เพื่อเรียงใหม่'
      + ' · Export CSV เอาไปให้เจ้าของข้อมูลไล่ตรวจได้</p>'
      + '<div id="v3DuplicateTable"></div>';
  }

  const COLUMNS = [
    { title: 'ความน่าสงสัย', value: (g) => g.risk,
      sortValue: (g) => (g.risk === 'สูง' ? 3 : g.risk === 'กลาง' ? 2 : 1),
      html: (g) => riskPill(g.risk) },
    { title: 'รหัส / ชื่อ', value: (g) => g.id + ' ' + g.name,
      html: (g) => '<b>' + esc(g.id) + '</b><span class="sub">' + esc(g.name) + '</span>' },
    { title: 'วันที่', value: (g) => g.date, html: (g) => dmy(g.date) },
    { title: 'จำนวนแถว', value: (g) => g.count, num: true,
      html: (g) => fmt(g.count) + '<span class="sub">เกินมา ' + fmt(g.count - 1) + '</span>' },
    { title: 'ชั่วโมงที่ทับกัน', value: (g) => g.overlapSlots.length, num: true,
      html: (g) => (g.overlapSlots.length
        ? '<b style="color:#b45309">' + fmt(g.overlapSlots.length) + ' ชม.</b>'
          + '<span class="sub">' + esc(ranges(g.overlapSlots)) + '</span>'
        : '<span class="staff-miss-pill">ไม่ทับกัน</span>') },
    { title: 'ยอดที่อาจเกินจริง', value: (g) => g.overlapPicks, num: true,
      html: (g) => (g.overlapPicks ? '<b style="color:#b91c1c">' + fmt(g.overlapPicks) + '</b>' : '0') },
    { title: 'ช่วงเวลาของแต่ละแถว', value: (g) => g.slots.map((s) => ranges(s)).join(' | '),
      html: (g) => g.slots.map((s, i) => '<div style="font-size:11px;">แถว ' + (i + 1) + ': '
        + esc(s.length ? ranges(s) : 'ไม่มียอดรายชั่วโมง') + '</div>').join('') },
    { title: 'ยอดหยิบแต่ละแถว', value: (g) => g.total, num: true,
      html: (g) => fmt(g.total) + '<span class="sub">' + g.totals.map((v) => fmt(v)).join(' + ') + '</span>' },
    { title: 'ชั่วโมงรวม', value: (g) => g.hoursSum, num: true,
      html: (g) => (g.hoursSum > 24
        ? '<b style="color:#b91c1c">' + fmt(g.hoursSum, 1) + ' ชม.</b><span class="sub">เกินหนึ่งวัน</span>'
        : fmt(g.hoursSum, 1) + ' ชม.') },
    { title: 'เข้าเฉลี่ย', value: (g) => g.counted, num: true,
      html: (g) => fmt(g.counted) + ' แถว<span class="sub">'
        + (g.averages.length ? g.averages.map((v) => fmt(v, 1)).join(' · ') : 'ไม่มีแถวที่นับได้') + '</span>' },
    { title: 'ธงจากต้นทาง', value: (g) => g.flags.join(','),
      html: (g) => (g.flags.length
        ? g.flags.map((f) => '<span class="badge-status fail">' + esc(f) + '</span>').join(' ')
        : '<span class="sub">ไม่มีธง</span>') }
  ];

  function render() {
    const host = $(HOST);
    if (!host) return;
    const shared = S();
    if (!shared || !shared.rows || !shared.rows.length) return;
    const d = build();
    if (!d) return;

    if (!d.dup.length) {
      host.innerHTML = '<div class="card wide"><div class="staff-miss-ok">'
        + '✓ ไม่พบแถวที่รหัสพนักงานกับวันที่ซ้ำกันเลย</div></div>';
      return;
    }

    host.innerHTML = headHtml(d);
    shared.table($('v3DuplicateTable'), 'duplicate-rows', d.dup, COLUMNS);
  }

  function renderIfVisible() {
    const panel = $(PANEL);
    if (!panel || !panel.classList.contains('active')) return;
    try { render(); } catch (e) { console.error('V3 duplicate:', e); }
  }

  let scheduled = null;
  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(renderIfVisible, 160);
  }

  if (window.V3Data && window.V3Data.subscribe) window.V3Data.subscribe(schedule);
  document.addEventListener('v3-render', schedule);
  document.querySelectorAll('.nav-item[data-tab="quality"]').forEach((b) => {
    b.addEventListener('click', () => setTimeout(renderIfVisible, 80));
  });
})();
