/* v2-staff.js — หน้าพนักงานใหม่ / พนักงานเก่า
   เกณฑ์อายุงานใช้กฎเดียวกับ V1 (buildTenuredPickerBenchmark ใน script.js):
     anchor = วันล่าสุดที่มีข้อมูล  ·  cutoff = anchor ลบ 90 วัน
     พนักงานใหม่ = วันเริ่มงาน > cutoff   ·   พนักงานเก่า = วันเริ่มงาน <= cutoff
   วันเริ่มงานยึดทะเบียนก่อน (Update name คอลัมน์ H เหมือน V1 และเพิ่ม 2ND คอลัมน์ G ที่ V1 ไม่ได้อ่าน
   เพื่อให้ครอบคลุมคนมากขึ้น) ถ้าไม่มีทั้งสองที่จึงใช้วันแรกที่พบผลงานใน Results Master เหมือน firstSeen ของ V1

   ตัวเลขทุกค่าคำนวณด้วย V3Metrics ซึ่งเป็นสูตร V1:
     Total Pick   = ผลรวมคอลัมน์ E ของแถวที่มีวันที่
     Productivity = ผลรวมคอลัมน์ AF ของแถวที่ AF > 0 ÷ จำนวนแถวนั้น (รวม sum/count ครั้งเดียว)
   ชื่อยึดทะเบียน 2ND · คนที่อยู่ในชีต Resigned ขึ้น Remark สีแดงว่าออกแล้ว */
(() => {
  'use strict';
  if (typeof Chart === 'undefined') {
    console.warn('V3 staff: ไม่พบ Chart.js จึงข้ามการวาดกราฟหน้าพนักงาน');
    return;
  }

  const M = window.V3Metrics;
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const fmt1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const signed = (v) => (v === null || v === undefined ? '—' : (Number(v) >= 0 ? '+' : '') + fmt1(v));
  const THAI_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const monthLabel = (key) => {
    if (!key) return '—';
    const p = key.split('-').map(Number);
    return THAI_MONTH[p[1] - 1] + ' ' + (p[0] + 543);
  };
  const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');

  let rows = [];
  let roster = new Map();
  let resigned = new Map();
  let startMap = new Map();
  let seenMap = new Map();
  let hideResigned = false;
  let loadWarnings = [];

  const webResigned = (id) => (window.V3RosterWrite && window.V3RosterWrite.resignedDraft
    ? window.V3RosterWrite.resignedDraft(id) : null);
  const draftStatus = (id) => (window.V3RosterWrite && window.V3RosterWrite.draftStatus
    ? window.V3RosterWrite.draftStatus(id) : null);
  /* Remark แดง — แยกให้เห็นว่ามาจากชีต Resigned หรือ Operation กรอกในเว็บ (ยังไม่เข้าชีต) */
  function resignedBadge(res) {
    if (!res) return '';
    const web = res.source === 'web';
    const when = res.date ? dmy(res.date) : 'ไม่ทราบวันที่';
    return `<span class="staff-resigned${web ? ' is-web' : ''}" title="${web ? 'กรอกในเว็บ ยังไม่ได้ใส่ในชีต Resigned' : 'อยู่ในชีต Resigned'}">`
      + `⛔ ออกแล้ว ${when}${web ? ' · กรอกในเว็บ' : ''}</span>`;
  }

  function target() {
    return (window.TARGETS && Number(window.TARGETS.overall)) || 170;
  }

  function draw(id, config) {
    const el = $(id);
    if (!el) return;
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
    new Chart(el, config);
  }

  /* ── สร้างข้อมูลรายคนจากแถวต้นทาง ── */
  function buildPeople() {
    const filters = window.V3Data ? window.V3Data.filters : {};
    const dated = rows.filter((r) => M.date(r[2]) && M.matches(r, filters));
    let anchor = '';
    dated.forEach((r) => { const d = M.date(r[2]); if (d > anchor) anchor = d; });
    const cutoff = M.tenureCutoff(anchor);

    const byId = new Map();
    dated.forEach((r) => {
      const id = M.userId(r);
      if (!id) return;
      let p = byId.get(id);
      if (!p) {
        p = { id, name: M.personName(r, roster), nick: M.personNickname(r, roster), rows: [], shift: M.shiftKey(r) };
        byId.set(id, p);
      }
      p.rows.push(r);
    });

    const people = [...byId.values()].map((p) => {
      const stats = M.aggregate(p.rows);
      const start = M.tenureStart(p.id, startMap, seenMap);
      const firstSeen = seenMap.get(p.id) || '';
      const hasRosterStart = startMap.has(p.id);
      // สถานะออกแล้ว มาจากชีต Resigned ก่อน ถ้าไม่มีจึงดูที่ Operation กรอกไว้ในเว็บ
      const sheetRes = resigned.get(p.id);
      const res = sheetRes ? { ...sheetRes, source: 'sheet' } : webResigned(p.id);
      const days = M.daysBetween(start, anchor);
      const group = start && cutoff ? (start > cutoff ? 'new' : 'old') : 'old';
      const dates = [...new Set(p.rows.map((r) => M.date(r[2])))].sort();
      // ผลงานรายเดือน ใช้ sum/count ของ AF ตามสูตร V1 ไม่เฉลี่ยค่าเฉลี่ยรายเดือนซ้ำ
      const monthly = new Map();
      p.rows.forEach((r) => {
        const key = M.date(r[2]).slice(0, 7);
        let m = monthly.get(key);
        if (!m) { m = { key, sum: 0, count: 0, total: 0 }; monthly.set(key, m); }
        const a = M.number(r[31]);
        if (a > 0) { m.sum += a; m.count += 1; }
        m.total += M.number(r[4]);
      });
      const months = [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key))
        .map((m) => ({ ...m, average: m.count ? m.sum / m.count : null }));
      const withAvg = months.filter((m) => m.average !== null);
      const lastMonth = withAvg[withAvg.length - 1] || null;
      const prevMonth = withAvg[withAvg.length - 2] || null;
      const monthDelta = lastMonth && prevMonth ? lastMonth.average - prevMonth.average : null;
      // สัปดาห์นับจากวันแรกที่มีผลงาน ใช้ทำเส้นการพัฒนา
      const weeks = new Map();
      if (firstSeen) {
        p.rows.forEach((r) => {
          const a = M.number(r[31]);
          if (a <= 0) return;
          const gap = M.daysBetween(firstSeen, M.date(r[2]));
          if (gap === null || gap < 0) return;
          const w = Math.floor(gap / 7) + 1;
          let bucket = weeks.get(w);
          if (!bucket) { bucket = { sum: 0, count: 0 }; weeks.set(w, bucket); }
          bucket.sum += a; bucket.count += 1;
        });
      }
      const weekKeys = [...weeks.keys()].sort((a, b) => a - b);
      const firstWeek = weekKeys.length ? weeks.get(weekKeys[0]) : null;
      const lastWeek = weekKeys.length ? weeks.get(weekKeys[weekKeys.length - 1]) : null;
      const weekDelta = firstWeek && lastWeek && weekKeys.length > 1
        ? (lastWeek.sum / lastWeek.count) - (firstWeek.sum / firstWeek.count)
        : null;
      return {
        ...p, stats, start, firstSeen, hasRosterStart, resigned: res, days, group, zone: zoneOf(p.rows),
        workDays: dates.length, firstDate: dates[0] || '', lastDate: dates[dates.length - 1] || '',
        months, lastMonth, prevMonth, monthDelta, weeks, weekDelta,
        firstWeekAvg: firstWeek ? firstWeek.sum / firstWeek.count : null,
        lastWeekAvg: lastWeek ? lastWeek.sum / lastWeek.count : null
      };
    });

    return { people, anchor, cutoff };
  }

  /* โซนของคนคนหนึ่งมาจากคอลัมน์ AH ของแถวตัวเอง ถ้าทำหลายโซนให้เอาโซนที่มีแถวมากที่สุดขึ้นก่อน */
  function zoneOf(rows) {
    const counts = new Map();
    rows.forEach((r) => {
      const raw = String(r[33] ?? '').trim();
      const key = M.isPlaceholder(raw) ? 'Not Found' : raw;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const label = sorted.length ? sorted[0][0] : 'Not Found';
    // นับเฉพาะโซนจริง แถวที่ไม่มีโซนไม่ใช่ "โซนอื่น"
    const others = sorted.filter(([key]) => key !== 'Not Found' && key !== label).length;
    return { label, others };
  }

  function groupStats(people) {
    let sum = 0, count = 0, total = 0;
    people.forEach((p) => { sum += p.stats.sum; count += p.stats.count; total += p.stats.total; });
    return { people: people.length, total, count, average: count ? sum / count : null };
  }

  /* ── แถบหมายเหตุ + ปุ่มซ่อนคนที่ออกแล้ว ── */
  function renderNote(id, ctx, all, shown) {
    const el = $(id);
    if (!el) return;
    const res = all.filter((p) => p.resigned).length;
    const resWeb = all.filter((p) => p.resigned && p.resigned.source === 'web').length;
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; background:#10b981; color:#fff; border-radius:8px; font-size:14px; flex-shrink:0;">👥</span>
        <div>
          <span class="active-date-eyebrow">เกณฑ์อายุงาน 90 วันตามกฎ V1</span>
          <strong>วันล่าสุดที่มีข้อมูล ${dmy(ctx.anchor)} · เส้นแบ่ง ${dmy(ctx.cutoff)}</strong>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="active-date-hint">แสดง ${fmt(shown.length)} คน จากทั้งกลุ่ม ${fmt(all.length)} คน${res ? ` · ออกแล้ว ${fmt(res)} คน${resWeb ? ` (กรอกในเว็บ ${fmt(resWeb)} คน)` : ''}` : ''}</span>
        <div class="systog" data-staff-toggle>
          <button type="button" data-hide="0"${hideResigned ? '' : ' class="active"'}>แสดงทุกคน</button>
          <button type="button" data-hide="1"${hideResigned ? ' class="active"' : ''}>⛔ ซ่อนคนที่ออกแล้ว</button>
        </div>
      </div>`;
    el.querySelectorAll('[data-staff-toggle] button').forEach((b) => {
      b.addEventListener('click', () => {
        const next = b.dataset.hide === '1';
        if (next === hideResigned) return;
        hideResigned = next;
        renderAll();
      });
    });
  }

  function kpiCard(bar, label, value, unit, note) {
    return `<div class="kpi"><div class="bar" style="background:${bar}"></div>
      <div class="lbl">${label}</div>
      <div class="val">${value}<span class="unit">${unit}</span></div>
      <div class="kpi-note">${note}</div></div>`;
  }

  function nameCell(p) {
    const mark = resignedBadge(p.resigned);
    const extra = [p.nick ? 'ชื่อเล่น ' + esc(p.nick) : '', p.hasRosterStart ? '' : 'ไม่มีวันเริ่มงานในทะเบียน ใช้วันแรกที่พบผลงาน']
      .filter(Boolean).join(' · ');
    return `<span class="${p.resigned ? 'staff-name-resigned' : ''}">${esc(p.name)}</span>${mark}${extra ? `<span class="sub">${extra}</span>` : ''}`;
  }

  function statusPill(average) {
    const t = target();
    if (average === null) return '<span class="v3-pill">ไม่มีค่าเฉลี่ย</span>';
    return average >= t
      ? `<span class="v3-pill good">ถึง Target</span>`
      : `<span class="v3-pill warn">ต่ำกว่า ${fmt1(t - average)}</span>`;
  }


  /* ── ตรวจว่าแต่ละคนขาดข้อมูลอะไร และต้องไปเติมที่ไหน ──
     ผลงานของคนเหล่านี้ไม่ถูกตัดออกจากยอดใด ๆ ตามกฎ V1
     แต่ KPI ที่ต้องใช้ข้อมูลนั้น (กะ, สังกัด, BU, ประเภทงาน, โซน, อายุงาน) จะเชื่อถือไม่ได้
     ดัชนีคอลัมน์ Results Master: 32 AG กะ, 33 AH Position/Zone, 34 AI สังกัด, 35 AJ BU, 36 AK Pick Type */
  const MISS_RULES = [
    { key: 'roster', label: 'ไม่มีใน 2ND', where: 'เพิ่มแถวในชีต 2ND (B รหัส, C ชื่อ)',
      test: (p) => !M.inRoster(p.rows[0], roster) },
    { key: 'name', label: 'ไม่มีชื่อ', where: '2ND คอลัมน์ C ชื่อ-นามสกุล',
      test: (p) => p.name === 'Not Found' },
    { key: 'start', label: 'ไม่มีวันเริ่มงาน', where: 'Update name คอลัมน์ H (หรือ 2ND คอลัมน์ G)',
      test: (p) => !p.hasRosterStart },
    { key: 'shift', label: 'กะ Not Found', where: 'Results Master คอลัมน์ AG',
      count: (p) => p.rows.filter((r) => M.shiftKey(r) === 'Not Found').length },
    { key: 'aff', label: 'สังกัดว่าง', where: 'Results Master คอลัมน์ AI',
      count: (p) => p.rows.filter((r) => M.isPlaceholder(r[34])).length },
    { key: 'bu', label: 'BU ว่าง', where: 'Results Master คอลัมน์ AJ',
      count: (p) => p.rows.filter((r) => M.isPlaceholder(r[35])).length },
    { key: 'type', label: 'Type Pick ว่าง', where: 'Results Master คอลัมน์ AK',
      count: (p) => p.rows.filter((r) => !M.type(r[36])).length },
    { key: 'zone', label: 'Zone ว่าง', where: 'Results Master คอลัมน์ AH (Position)',
      count: (p) => p.rows.filter((r) => M.isPlaceholder(r[33])).length }
  ];

  function missingFor(p) {
    // คนที่ออกแล้วไม่ต้องตามกะ โซน สังกัด อายุงาน ขอแค่รู้ว่ารหัสนี้คือใคร
    if (p.resigned) {
      const out = [];
      if (p.resigned.source === 'web') {
        // กรอกในเว็บแล้วแต่ยังไม่ได้ใส่ในชีต Resigned จึงยังถือเป็นงานค้าง ให้ค้างในการ์ดไว้ตรวจและ Export ได้
        out.push({ key: 'resigned-web', label: 'กรอกในเว็บว่าออกแล้ว รอใส่ใน Sheet',
          where: 'ชีต Resigned: A รหัส · B ชื่อ · H วันพ้นสภาพ', rows: null });
      }
      if (p.name === 'Not Found') {
        const rule = MISS_RULES.find((r) => r.key === 'name');
        out.push({ ...rule, where: p.resigned.source === 'web' ? 'กรอกชื่อในเว็บได้เลย' : 'Resigned คอลัมน์ B ชื่อ', rows: null });
      }
      return out;
    }
    const out = [];
    MISS_RULES.forEach((rule) => {
      if (rule.test) {
        if (rule.test(p)) out.push({ ...rule, rows: null });
      } else {
        const n = rule.count(p);
        if (n > 0) out.push({ ...rule, rows: n });
      }
    });
    return out;
  }

  function renderMissing(prefix, list) {
    const pill = $(prefix + 'MissPill');
    const summary = $(prefix + 'MissSummary');
    const table = $(prefix + 'MissTable');
    if (!summary || !table) return;

    // การ์ดนี้แสดงทุกคนเสมอ ไม่ตัดตามปุ่มซ่อนคนที่ออกแล้ว เพราะเป็นรายการที่ต้องตามข้อมูล
    // คนที่ยังไม่รู้สถานะขึ้นก่อน คนที่ออกแล้วไปท้ายรายการ
    const items = list.map((p) => {
      const miss = missingFor(p);
      p.missKeys = miss.map((m) => m.key);
      return { p, miss };
    }).filter((x) => x.miss.length)
      .sort((a, b) => (Number(Boolean(a.p.resigned)) - Number(Boolean(b.p.resigned))) || (b.p.stats.total - a.p.stats.total));
    const todo = items.filter((x) => !x.p.resigned);
    const out = items.filter((x) => x.p.resigned);
    const outWeb = out.filter((x) => x.p.resigned.source === 'web');
    const affected = todo.reduce((a, x) => a + x.p.stats.total, 0);
    const counts = new Map();
    todo.forEach((x) => x.miss.forEach((m) => counts.set(m.label, (counts.get(m.label) || 0) + 1)));

    if (pill) {
      pill.textContent = items.length
        ? `${fmt(todo.length)} คนต้องตามข้อมูล · กระทบ Total Pick ${fmt(affected)} ชิ้น`
          + (out.length ? ` · ออกแล้ว ${fmt(out.length)} คน ไม่ต้องตาม` : '')
          + (outWeb.length ? ` · กรอกในเว็บรอใส่ใน Sheet ${fmt(outWeb.length)} คน` : '')
        : 'ข้อมูลครบทุกคนในมุมมองนี้';
    }

    const writer = window.V3RosterWrite;
    summary.innerHTML = (writer ? `<span class="rw-status-wrap">${writer.statusHtml()}</span>` : '')
      + (todo.length
      ? [...counts.entries()].sort((a, b) => b[1] - a[1])
        .map(([label, n]) => {
          const rule = MISS_RULES.find((r) => r.label === label);
          return `<span class="staff-miss-pill" title="${esc(rule ? rule.where : '')}">${esc(label)} <b>${fmt(n)}</b> คน</span>`;
        }).join('')
      : `<span class="staff-miss-ok">✓ ไม่มีใครต้องตามข้อมูลเพิ่มในมุมมองนี้${out.length ? ' (เหลือแต่คนที่ออกแล้ว)' : ''}</span>`)
      + (out.length ? `<span class="staff-miss-pill is-out" title="ไม่ต้องตามข้อมูลแล้ว ขอแค่ชื่อ">⛔ ออกแล้ว <b>${fmt(out.length)}</b> คน</span>` : '')
      + (outWeb.length ? `<span class="staff-miss-pill is-out" title="กรอกในเว็บแล้ว เหลือเอาไปใส่ในชีต Resigned">กรอกในเว็บรอใส่ใน Sheet <b>${fmt(outWeb.length)}</b> คน</span>` : '')
      + '<span class="staff-miss-hint">สืบมาว่ารหัสนี้คือใคร → กดที่ <b>รหัสพนักงาน</b> ในตารางเพื่อเปิดฟอร์ม · ถ้าลาออกไปแล้วให้เลือก <b>⛔ ลาออกแล้ว</b> กรอกแค่ชื่อกับวันที่ออก</span>'
      + (loadWarnings.length
        ? `<span class="staff-miss-warn">⚠️ อ่านข้อมูลบางชีตไม่ได้รอบนี้ (${esc(loadWarnings.join(' · '))}) สถานะ “ออกแล้ว” จากชีต Resigned จึงอาจหายไปทั้งหมด</span>`
        : '');
    if (writer) writer.bind(summary, (id) => items.find((x) => x.p.id === id)?.p, renderAll);

    if (!window.V3Shared) return;
    // เห็นแค่รหัสกับสถานะพอ รายละเอียดที่ขาดอยู่ในฟอร์มเติมข้อมูลและใน Export CSV แล้ว
    window.V3Shared.table(table, prefix + '-missing', items, [
      // กดที่รหัสเพื่อเปิดฟอร์มระบุว่าคนนี้คือใคร (เดิมเป็นคอลัมน์ "ระบุว่าใคร" ที่ถอดออกไปแล้ว)
      { title: 'รหัสพนักงาน', value: (x) => x.p.id,
        html: (x) => `<button type="button" class="staff-id-open" data-rw-open="${esc(x.p.id)}" title="กดเพื่อระบุว่ารหัสนี้คือใคร">${esc(x.p.id)}</button>` },
      {
        title: 'สถานะ',
        value: (x) => (x.p.resigned
          ? (x.p.resigned.source === 'web' ? 'ออกแล้ว (กรอกในเว็บ)' : 'ออกแล้ว (ชีต Resigned)')
          : (draftStatus(x.p.id) === 'active' ? 'กรอกแล้ว รอใส่ใน Sheet' : 'Not Found')),
        html: (x) => (x.p.resigned
          ? resignedBadge(x.p.resigned)
          : (draftStatus(x.p.id) === 'active'
            ? '<span class="v3-pill good">กรอกแล้ว รอใส่ใน Sheet</span>'
            : '<span class="v3-pill warn">Not Found — ข้อมูลไม่ครบ</span>'))
      },
      { title: 'ชื่อที่พบ', value: (x) => x.p.name, html: (x) => (x.p.name === 'Not Found' ? '<span class="staff-miss-none">ไม่พบชื่อ</span>' : esc(x.p.name)) },
      { title: 'ยอดหยิบทั้งหมด', value: (x) => x.p.stats.total, num: true, html: (x) => fmt(x.p.stats.total) },
      { title: 'Productivity', value: (x) => (x.p.stats.average === null ? 0 : x.p.stats.average), num: true,
        html: (x) => fmt1(x.p.stats.average) + `<span class="sub">${fmt(x.p.stats.count)} แถวเข้าเฉลี่ย</span>` },
      { title: 'Zone', value: (x) => x.p.zone.label,
        html: (x) => (x.p.zone.label === 'Not Found'
          ? '<span class="staff-miss-none">Not Found</span>'
          : esc(x.p.zone.label)) + (x.p.zone.others ? `<span class="sub">+${fmt(x.p.zone.others)} โซนอื่น</span>` : '') }
    ]);
    if (window.V3RosterWrite) {
      window.V3RosterWrite.bind(table, (id) => items.find((x) => x.p.id === id)?.p, renderAll);
    }
  }

  /* ════════ หน้าพนักงานใหม่ ════════ */
  function renderNewStaff(ctx, newAll, oldAll) {
    const shown = hideResigned ? newAll.filter((p) => !p.resigned) : newAll;
    renderNote('newStaffNote', ctx, newAll, shown);

    const g = groupStats(shown);
    const gOld = groupStats(hideResigned ? oldAll.filter((p) => !p.resigned) : oldAll);
    const t = target();
    const pass = shown.filter((p) => p.stats.average !== null && p.stats.average >= t).length;
    const gap = g.average !== null && gOld.average !== null ? g.average - gOld.average : null;
    const resCount = newAll.filter((p) => p.resigned).length;

    if ($('newStaffKpis')) {
      $('newStaffKpis').innerHTML = [
        kpiCard('linear-gradient(90deg,#3b82f6,#6366f1)', 'พนักงานใหม่ที่แสดง', fmt(g.people), 'คน',
          `จากทั้งกลุ่ม ${fmt(newAll.length)} คน · ออกแล้ว ${fmt(resCount)} คน`),
        kpiCard('linear-gradient(90deg,#10b981,#059669)', 'Productivity เฉลี่ยกลุ่มใหม่ ⚡', fmt1(g.average), 'หยิบ/ชม.',
          `${fmt(g.count)} แถวเข้าเฉลี่ย · Target ${fmt(t)}`),
        kpiCard('linear-gradient(90deg,#f43f5e,#ec4899)', 'ส่วนต่างจากพนักงานเก่า', signed(gap), 'หยิบ/ชม.',
          gOld.average !== null ? `กลุ่มเก่าเฉลี่ย ${fmt1(gOld.average)} หยิบ/ชม.` : 'ยังไม่มีข้อมูลกลุ่มเก่า'),
        kpiCard('linear-gradient(90deg,#f59e0b,#f97316)', 'ถึง Target แล้ว', fmt(pass), 'คน',
          g.people ? `คิดเป็น ${fmt1(pass / g.people * 100)}% ของคนที่แสดง` : 'ยังไม่มีคนในกลุ่มนี้'),
        kpiCard('linear-gradient(90deg,#8b5cf6,#6366f1)', 'ยอดหยิบรวมกลุ่มใหม่', fmt(g.total), 'ชิ้น',
          'ผลรวมคอลัมน์ E ของกลุ่มนี้')
      ].join('');
    }

    // เส้นการพัฒนา: รวม sum/count ของทุกคนในแต่ละสัปดาห์ ไม่เฉลี่ยค่าเฉลี่ยรายคนซ้ำ
    const maxWeek = Math.min(13, Math.max(4, ...shown.flatMap((p) => [...p.weeks.keys()])));
    const curve = [];
    for (let w = 1; w <= maxWeek; w++) {
      let sum = 0, count = 0, ppl = 0;
      shown.forEach((p) => { const b = p.weeks.get(w); if (b && b.count) { sum += b.sum; count += b.count; ppl += 1; } });
      curve.push({ week: w, average: count ? sum / count : null, count, people: ppl });
    }
    if ($('newStaffCurvePill')) {
      const first = curve.find((c) => c.average !== null);
      const last = [...curve].reverse().find((c) => c.average !== null);
      $('newStaffCurvePill').textContent = first && last && first !== last
        ? `สัปดาห์ ${first.week} ${fmt1(first.average)} → สัปดาห์ ${last.week} ${fmt1(last.average)} (${signed(last.average - first.average)})`
        : 'ข้อมูลยังไม่พอทำเส้นพัฒนา';
    }
    draw('newStaffCurveChart', {
      data: {
        labels: curve.map((c) => 'สัปดาห์ ' + c.week),
        datasets: [
          {
            type: 'line', label: 'Productivity เฉลี่ยกลุ่มใหม่', data: curve.map((c) => (c.average === null ? null : Number(c.average.toFixed(1)))),
            borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.12)', fill: true, tension: 0.35,
            borderWidth: 3, pointRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: '#6366f1', pointBorderWidth: 2,
            spanGaps: true, yAxisID: 'y',
            datalabels: {
              display: (c) => c.dataset.data[c.dataIndex] !== null, anchor: 'end', align: 'top', offset: 6,
              color: '#3730a3', backgroundColor: 'rgba(255,255,255,.96)', borderColor: 'rgba(99,102,241,.3)',
              borderWidth: 1, borderRadius: 4, padding: { top: 2, right: 5, bottom: 2, left: 5 },
              font: { weight: '700', size: 10.5 }, formatter: (v) => fmt1(v)
            }
          },
          {
            type: 'line', label: `Target ${fmt(t)}`, data: curve.map(() => t),
            borderColor: 'rgba(245,158,11,.9)', borderWidth: 2, borderDash: [6, 5], pointRadius: 0, fill: false,
            yAxisID: 'y', datalabels: { display: false }
          },
          {
            type: 'line', label: 'ค่าเฉลี่ยพนักงานเก่า', data: curve.map(() => (gOld.average === null ? null : Number(gOld.average.toFixed(1)))),
            borderColor: 'rgba(20,184,166,.9)', borderWidth: 2, borderDash: [3, 3], pointRadius: 0, fill: false,
            yAxisID: 'y', datalabels: { display: false }
          },
          {
            type: 'bar', label: 'จำนวนคนที่มีข้อมูลในสัปดาห์นั้น (คน)', data: curve.map((c) => c.people),
            backgroundColor: 'rgba(148,163,184,.35)', borderRadius: 5, yAxisID: 'y1',
            datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 34, right: 14, bottom: 6, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              afterBody: (items) => {
                const c = curve[items[0].dataIndex];
                return `${fmt(c.count)} แถวเข้าเฉลี่ย · ${fmt(c.people)} คน`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) }, title: { display: true, text: 'หยิบ/ชม.' } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => fmt(v) }, suggestedMax: Math.max(4, ...curve.map((c) => c.people)) + 2 }
        }
      }
    });

    renderPersonBar('newStaffBarChart', 'newStaffBarBox', 'newStaffBarPill', shown, t, shown.length);
    renderNewInsights(shown, newAll, g, gOld, pass, t);
    renderMissing('newStaff', newAll);

    if (window.V3Shared && $('newStaffTable')) {
      window.V3Shared.table($('newStaffTable'), 'new-staff', [...shown].sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999)), [
        { title: 'User ID', value: (p) => p.id },
        { title: 'ชื่อ (2ND)', value: (p) => p.name + (p.resigned ? ' [ออกแล้ว]' : ''), html: nameCell },
        { title: 'กะ', value: (p) => p.shift },
        { title: 'วันเริ่มงาน', value: (p) => p.start || '', html: (p) => dmy(p.start) + `<span class="sub">${p.hasRosterStart ? 'จากทะเบียน' : 'วันแรกที่พบผลงาน'}</span>` },
        { title: 'อายุงาน (วัน)', value: (p) => p.days ?? 0, num: true },
        { title: 'วันที่มีงาน', value: (p) => p.workDays, num: true },
        { title: 'Total Pick', value: (p) => p.stats.total, num: true, html: (p) => fmt(p.stats.total) },
        { title: 'Productivity', value: (p) => (p.stats.average === null ? 0 : p.stats.average), num: true, html: (p) => fmt1(p.stats.average) },
        { title: 'เทียบ Target', value: (p) => (p.stats.average === null ? '' : (p.stats.average >= t ? 'ถึง' : 'ต่ำกว่า')), html: (p) => statusPill(p.stats.average) },
        { title: 'สัปดาห์แรก → ล่าสุด', value: (p) => (p.weekDelta === null ? 0 : p.weekDelta), num: true, html: (p) => (p.weekDelta === null ? '—' : `${signed(p.weekDelta)}<span class="sub">${fmt1(p.firstWeekAvg)} → ${fmt1(p.lastWeekAvg)}</span>`) },
        { title: 'แถวเข้าเฉลี่ย', value: (p) => p.stats.count, num: true }
      ]);
    }
  }

  function renderPersonBar(canvasId, boxId, pillId, list, t, limit) {
    const items = [...list].filter((p) => p.stats.average !== null)
      .sort((a, b) => b.stats.average - a.stats.average).slice(0, limit);
    const box = $(boxId);
    if (box) box.style.height = Math.max(300, items.length * 26 + 96) + 'px';
    if ($(pillId)) $(pillId).textContent = `${fmt(items.length)} คนที่มีค่าเฉลี่ย · ถึง Target ${fmt(items.filter((p) => p.stats.average >= t).length)} คน`;
    draw(canvasId, {
      type: 'bar',
      data: {
        labels: items.map((p) => (p.resigned ? '⛔ ' : '') + (p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name)),
        datasets: [{
          label: 'Productivity (เฉลี่ย AF)',
          data: items.map((p) => Number(p.stats.average.toFixed(1))),
          backgroundColor: items.map((p) => (p.stats.average >= t ? '#10b981' : '#f43f5e')),
          borderRadius: 6, barThickness: 16
        }]
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        layout: { padding: { top: 8, right: 66, bottom: 8, left: 6 } },
        plugins: {
          legend: { display: false },
          datalabels: { anchor: 'end', align: 'end', color: '#334155', font: { weight: '700', size: 10.5 }, formatter: (v) => fmt1(v) },
          tooltip: {
            callbacks: {
              title: (c) => items[c[0].dataIndex].name,
              label: (ctx) => {
                const p = items[ctx.dataIndex];
                return [' User ID: ' + p.id,
                  ' Productivity: ' + fmt1(p.stats.average) + ' หยิบ/ชม.',
                  ' Total Pick: ' + fmt(p.stats.total) + ' ชิ้น',
                  ' อายุงาน: ' + (p.days === null ? '—' : fmt(p.days) + ' วัน'),
                  p.resigned ? ' พ้นสภาพ ' + dmy(p.resigned.date) : ' ยังทำงานอยู่'];
              }
            }
          },
          annotation: undefined
        },
        scales: {
          x: { grid: { color: '#f1f5f9' }, suggestedMax: Math.ceil(t * 1.25), ticks: { callback: (v) => fmt(v) } },
          y: { grid: { display: false }, ticks: { font: { weight: '600', size: 10.5 } } }
        }
      }
    });
  }

  function insightCard(tone, title, body) {
    return `<article class="staff-insight is-${tone}"><h4>${title}</h4><p>${body}</p></article>`;
  }

  function renderNewInsights(shown, all, g, gOld, pass, t) {
    if (!$('newStaffInsights')) return;
    const withAvg = shown.filter((p) => p.stats.average !== null);
    const weakest = [...withAvg].sort((a, b) => a.stats.average - b.stats.average).slice(0, 3);
    const improvers = shown.filter((p) => p.weekDelta !== null).sort((a, b) => b.weekDelta - a.weekDelta).slice(0, 3);
    const resCount = all.filter((p) => p.resigned).length;
    const cards = [];

    if (g.average !== null && gOld.average !== null) {
      const gap = gOld.average - g.average;
      cards.push(insightCard(gap > 0 ? 'warn' : 'good',
        gap > 0 ? 'คนใหม่ยังตามคนเก่าอยู่' : 'คนใหม่ทำได้ดีกว่าคนเก่าแล้ว',
        `กลุ่มใหม่เฉลี่ย <b>${fmt1(g.average)}</b> หยิบ/ชม. กลุ่มเก่า <b>${fmt1(gOld.average)}</b> ต่างกัน <b>${fmt1(Math.abs(gap))}</b> หยิบ/ชม. ${gap > 0 ? 'ช่องว่างนี้คือเป้าของการโค้ช' : 'รักษาระดับนี้ไว้และถอดบทเรียนไปใช้กับรุ่นถัดไป'}`));
    }

    cards.push(insightCard(pass >= Math.ceil(withAvg.length / 2) ? 'good' : 'warn', 'ความคืบหน้าเทียบ Target',
      withAvg.length
        ? `ถึง Target ${fmt(t)} แล้ว <b>${fmt(pass)}</b> จาก <b>${fmt(withAvg.length)}</b> คน (${fmt1(pass / withAvg.length * 100)}%) ${pass < withAvg.length ? `ที่เหลือ ${fmt(withAvg.length - pass)} คนยังต้องติดตาม` : 'ครบทุกคนแล้ว'}`
        : 'ยังไม่มีคนใหม่ที่มีค่าเฉลี่ยในช่วงนี้'));

    if (weakest.length) {
      cards.push(insightCard('warn', 'ควรโค้ชก่อน',
        weakest.map((p) => `<b>${esc(p.name)}</b> ${fmt1(p.stats.average)} หยิบ/ชม. (อายุงาน ${p.days === null ? '—' : fmt(p.days)} วัน${p.resigned ? ' · ออกแล้ว' : ''})`).join('<br>')));
    }

    if (improvers.length && improvers[0].weekDelta > 0) {
      cards.push(insightCard('good', 'พัฒนาเร็วที่สุด',
        improvers.filter((p) => p.weekDelta > 0).map((p) => `<b>${esc(p.name)}</b> ${signed(p.weekDelta)} หยิบ/ชม. (${fmt1(p.firstWeekAvg)} → ${fmt1(p.lastWeekAvg)})`).join('<br>')));
    }

    if (resCount) {
      cards.push(insightCard('warn', 'อัตราออกของคนใหม่',
        `ในกลุ่มคนใหม่ <b>${fmt(all.length)}</b> คน มี <b>${fmt(resCount)}</b> คนที่พ้นสภาพแล้ว (${fmt1(resCount / all.length * 100)}%) ข้อมูลจากชีต Resigned กด “ซ่อนคนที่ออกแล้ว” เพื่อดูเฉพาะคนที่ยังอยู่`));
    }

    $('newStaffInsights').innerHTML = cards.join('');
  }

  /* ════════ หน้าพนักงานเก่า ════════ */
  function renderOldStaff(ctx, oldAll, newAll) {
    const shown = hideResigned ? oldAll.filter((p) => !p.resigned) : oldAll;
    renderNote('oldStaffNote', ctx, oldAll, shown);

    const g = groupStats(shown);
    const gNew = groupStats(hideResigned ? newAll.filter((p) => !p.resigned) : newAll);
    const t = target();
    const withAvg = shown.filter((p) => p.stats.average !== null);
    const pass = withAvg.filter((p) => p.stats.average >= t).length;
    const below = withAvg.length - pass;
    const resCount = oldAll.filter((p) => p.resigned).length;
    const improved = shown.filter((p) => p.monthDelta !== null && p.monthDelta > 0).length;
    const dropped = shown.filter((p) => p.monthDelta !== null && p.monthDelta < 0).length;

    if ($('oldStaffKpis')) {
      $('oldStaffKpis').innerHTML = [
        kpiCard('linear-gradient(90deg,#3b82f6,#6366f1)', 'พนักงานเก่าที่แสดง', fmt(g.people), 'คน',
          `จากทั้งกลุ่ม ${fmt(oldAll.length)} คน · ออกแล้ว ${fmt(resCount)} คน`),
        kpiCard('linear-gradient(90deg,#10b981,#059669)', 'Productivity เฉลี่ยกลุ่มเก่า ⚡', fmt1(g.average), 'หยิบ/ชม.',
          `${fmt(g.count)} แถวเข้าเฉลี่ย · Target ${fmt(t)}`),
        kpiCard('linear-gradient(90deg,#f43f5e,#ec4899)', 'ต่ำกว่า Target', fmt(below), 'คน',
          withAvg.length ? `คิดเป็น ${fmt1(below / withAvg.length * 100)}% ของคนที่มีค่าเฉลี่ย` : 'ยังไม่มีค่าเฉลี่ย'),
        kpiCard('linear-gradient(90deg,#f59e0b,#f97316)', 'เทียบเดือนก่อน', `${fmt(improved)}/${fmt(dropped)}`, 'ดีขึ้น/แย่ลง',
          'เทียบค่าเฉลี่ยเดือนล่าสุดกับเดือนก่อนของแต่ละคน'),
        kpiCard('linear-gradient(90deg,#8b5cf6,#6366f1)', 'ยอดหยิบรวมกลุ่มเก่า', fmt(g.total), 'ชิ้น',
          gNew.total ? `กลุ่มใหม่ ${fmt(gNew.total)} ชิ้น` : 'ผลรวมคอลัมน์ E ของกลุ่มนี้')
      ].join('');
    }

    // แนวโน้มรายเดือนของกลุ่ม รวม sum/count ของทุกคนในเดือนนั้น
    const monthMap = new Map();
    shown.forEach((p) => p.months.forEach((m) => {
      let b = monthMap.get(m.key);
      if (!b) { b = { key: m.key, sum: 0, count: 0, total: 0, people: new Set() }; monthMap.set(m.key, b); }
      b.sum += m.sum; b.count += m.count; b.total += m.total;
      if (m.count) b.people.add(p.id);
    }));
    const months = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key))
      .map((m) => ({ ...m, average: m.count ? m.sum / m.count : null, peopleCount: m.people.size }));

    if ($('oldStaffTrendPill')) {
      const withM = months.filter((m) => m.average !== null);
      const f = withM[0], l = withM[withM.length - 1];
      $('oldStaffTrendPill').textContent = f && l && f !== l
        ? `${monthLabel(f.key)} ${fmt1(f.average)} → ${monthLabel(l.key)} ${fmt1(l.average)} (${signed(l.average - f.average)})`
        : `${fmt(months.length)} เดือน`;
    }

    draw('oldStaffTrendChart', {
      data: {
        labels: months.map((m) => monthLabel(m.key)),
        datasets: [
          {
            type: 'bar', label: 'Total Pick', data: months.map((m) => m.total),
            backgroundColor: 'rgba(99,102,241,.85)', borderRadius: 6, yAxisID: 'y',
            datalabels: {
              anchor: 'center', align: 'center', rotation: months.length > 8 ? -90 : 0,
              color: '#fff', backgroundColor: 'rgba(15,23,42,.45)', borderRadius: 4,
              padding: { top: 2, right: 4, bottom: 2, left: 4 },
              font: { weight: '700', size: 10 }, formatter: (v) => (Number(v) > 0 ? fmt(v) : '')
            }
          },
          {
            type: 'line', label: 'Productivity (เฉลี่ย AF)', data: months.map((m) => (m.average === null ? null : Number(m.average.toFixed(1)))),
            borderColor: '#f43f5e', backgroundColor: '#f43f5e', tension: 0.35, borderWidth: 3,
            pointRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: '#f43f5e', pointBorderWidth: 2,
            spanGaps: true, yAxisID: 'y1',
            datalabels: {
              display: (c) => c.dataset.data[c.dataIndex] !== null, anchor: 'end', align: 'top', offset: 8,
              color: '#e11d48', backgroundColor: 'rgba(255,255,255,.98)', borderColor: 'rgba(244,63,94,.4)',
              borderWidth: 1.5, borderRadius: 5, padding: { top: 2, right: 5, bottom: 2, left: 5 },
              font: { weight: '700', size: 10.5 }, formatter: (v) => fmt1(v)
            }
          },
          {
            type: 'line', label: `Target ${fmt(t)}`, data: months.map(() => t),
            borderColor: 'rgba(245,158,11,.9)', borderWidth: 2, borderDash: [6, 5], pointRadius: 0,
            fill: false, yAxisID: 'y1', datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 38, right: 14, bottom: 6, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              afterBody: (items) => {
                const m = months[items[0].dataIndex];
                return `${fmt(m.peopleCount)} คน · ${fmt(m.count)} แถวเข้าเฉลี่ย`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => Number(v).toFixed(0) }, suggestedMax: Math.ceil(t * 1.4) }
        }
      }
    });

    // กราฟ 10 อันดับสูงสุด + 10 อันดับต่ำสุด
    const ranked = [...withAvg].sort((a, b) => b.stats.average - a.stats.average);
    const picks = ranked.length > 20 ? [...ranked.slice(0, 10), ...ranked.slice(-10)] : ranked;
    renderPersonBar('oldStaffBarChart', 'oldStaffBarBox', 'oldStaffBarPill', picks, t, picks.length);

    renderOldInsights(shown, oldAll, g, gNew, below, improved, dropped, t, months);
    renderMissing('oldStaff', oldAll);

    if (window.V3Shared && $('oldStaffTable')) {
      window.V3Shared.table($('oldStaffTable'), 'old-staff',
        [...shown].sort((a, b) => (b.stats.average ?? -1) - (a.stats.average ?? -1)), [
        { title: 'User ID', value: (p) => p.id },
        { title: 'ชื่อ (2ND)', value: (p) => p.name + (p.resigned ? ' [ออกแล้ว]' : ''), html: nameCell },
        { title: 'กะ', value: (p) => p.shift },
        { title: 'วันเริ่มงาน', value: (p) => p.start || '', html: (p) => dmy(p.start) + `<span class="sub">${p.hasRosterStart ? 'จากทะเบียน' : 'วันแรกที่พบผลงาน'}</span>` },
        { title: 'อายุงาน (วัน)', value: (p) => p.days ?? 0, num: true },
        { title: 'วันที่มีงาน', value: (p) => p.workDays, num: true },
        { title: 'Total Pick', value: (p) => p.stats.total, num: true, html: (p) => fmt(p.stats.total) },
        { title: 'Productivity', value: (p) => (p.stats.average === null ? 0 : p.stats.average), num: true, html: (p) => fmt1(p.stats.average) },
        { title: 'เทียบ Target', value: (p) => (p.stats.average === null ? '' : (p.stats.average >= t ? 'ถึง' : 'ต่ำกว่า')), html: (p) => statusPill(p.stats.average) },
        { title: 'เทียบเดือนก่อน', value: (p) => (p.monthDelta === null ? 0 : p.monthDelta), num: true, html: (p) => (p.monthDelta === null ? '—' : `<span class="${p.monthDelta >= 0 ? 'staff-up' : 'staff-down'}">${signed(p.monthDelta)}</span><span class="sub">${monthLabel(p.prevMonth.key)} ${fmt1(p.prevMonth.average)} → ${monthLabel(p.lastMonth.key)} ${fmt1(p.lastMonth.average)}</span>`) },
        { title: 'แถวเข้าเฉลี่ย', value: (p) => p.stats.count, num: true }
      ]);
    }
  }

  function renderOldInsights(shown, all, g, gNew, below, improved, dropped, t, months) {
    if (!$('oldStaffInsights')) return;
    const withAvg = shown.filter((p) => p.stats.average !== null);
    const ranked = [...withAvg].sort((a, b) => b.stats.average - a.stats.average);
    const worst = ranked.slice(-3).reverse();
    const best = ranked.slice(0, 3);
    const withM = months.filter((m) => m.average !== null);
    const cards = [];

    cards.push(insightCard(g.average !== null && g.average >= t ? 'good' : 'warn', 'ภาพรวมกลุ่มเทียบ Target',
      g.average === null ? 'ยังไม่มีค่าเฉลี่ยในช่วงนี้'
        : `เฉลี่ย <b>${fmt1(g.average)}</b> หยิบ/ชม. เทียบ Target <b>${fmt(t)}</b> ${g.average >= t ? `สูงกว่า <b>${fmt1(g.average - t)}</b>` : `ต่ำกว่า <b>${fmt1(t - g.average)}</b>`} · ต่ำกว่า Target <b>${fmt(below)}</b> คน`));

    if (withM.length > 1) {
      const f = withM[0], l = withM[withM.length - 1];
      const d = l.average - f.average;
      cards.push(insightCard(d >= 0 ? 'good' : 'warn', 'แนวโน้มตั้งแต่เดือนแรกที่มีข้อมูล',
        `${monthLabel(f.key)} <b>${fmt1(f.average)}</b> → ${monthLabel(l.key)} <b>${fmt1(l.average)}</b> เปลี่ยน <b>${signed(d)}</b> หยิบ/ชม. ${d >= 0 ? 'ทิศทางดีขึ้น' : 'ต้องหาสาเหตุที่ทำให้ลดลง'}`));
    }

    cards.push(insightCard(improved >= dropped ? 'good' : 'warn', 'เทียบเดือนล่าสุดกับเดือนก่อน',
      `ดีขึ้น <b>${fmt(improved)}</b> คน · แย่ลง <b>${fmt(dropped)}</b> คน ${improved >= dropped ? 'ภาพรวมยังไปทางบวก' : 'คนที่แย่ลงมากกว่า ควรเปิดตารางเรียงคอลัมน์ “เทียบเดือนก่อน” เพื่อไล่รายคน'}`));

    if (best.length) {
      cards.push(insightCard('good', 'ทำได้ดีที่สุดในกลุ่ม',
        best.map((p) => `<b>${esc(p.name)}</b> ${fmt1(p.stats.average)} หยิบ/ชม. (${fmt(p.workDays)} วันที่มีงาน)`).join('<br>')));
    }
    if (worst.length) {
      cards.push(insightCard('warn', 'ควรดูก่อน',
        worst.map((p) => `<b>${esc(p.name)}</b> ${fmt1(p.stats.average)} หยิบ/ชม.${p.resigned ? ' · ออกแล้ว' : ''} (${fmt(p.workDays)} วันที่มีงาน)`).join('<br>')));
    }

    $('oldStaffInsights').innerHTML = cards.join('');
  }

  /* ── ตัวควบคุมการเรนเดอร์ ── */
  let scheduled = null;
  function renderAll() {
    if (!rows.length || !window.V3Data || !window.V3Data.current) return;
    const activeNew = document.getElementById('tab-newstaff');
    const activeOld = document.getElementById('tab-oldstaff');
    if (!activeNew && !activeOld) return;
    try {
      const ctx = buildPeople();
      const newAll = ctx.people.filter((p) => p.group === 'new');
      const oldAll = ctx.people.filter((p) => p.group === 'old');
      if (activeNew) renderNewStaff(ctx, newAll, oldAll);
      if (activeOld) renderOldStaff(ctx, oldAll, newAll);
    } catch (e) {
      console.error('V3 staff:', e);
    }
  }
  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(renderAll, 140);
  }

  window.V3Data.subscribe((value) => {
    rows = value.source.sheets['Results Master'].rows;
    roster = M.rosterMap(value.source.sheets['2ND']);
    resigned = M.resignedMap(value.source.sheets['Resigned']);
    loadWarnings = (value.source.warnings || []).slice();
    startMap = M.startDateMap(value.source.sheets);
    seenMap = M.firstSeenMap(rows);
    schedule();
  });
  document.addEventListener('v3-render', schedule);
  document.querySelectorAll('.nav-item[data-tab="newstaff"], .nav-item[data-tab="oldstaff"]')
    .forEach((b) => b.addEventListener('click', schedule));
})();
