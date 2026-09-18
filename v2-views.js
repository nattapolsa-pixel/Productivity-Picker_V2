/* v2-views.js — กราฟชุดเดียวกับหน้า overview ของ V2 (Chart.js + datalabels)
   ตัวเลขทุกค่าคำนวณด้วย V3Metrics ซึ่งเป็นสูตรที่ใช้:
     Total Pick   = ผลรวมคอลัมน์ E ของทุกแถวที่มีวันที่ (รวมแถว AF = Not Count)
     Productivity = ผลรวมคอลัมน์ AF ของแถวที่ AF > 0 ÷ จำนวนแถวนั้น (รวม sum/count ครั้งเดียว)
   ไม่มีการเฉลี่ยค่าเฉลี่ยรายวันซ้ำ ไม่ลบ 7 ชั่วโมง ไม่ย้ายยอดหลังเที่ยงคืน
   ค่าคอลัมน์: 1 ชื่อ, 2 วันที่ C, 3 User ID, 4 Total Pick E, 6 Operating time G,
               7–30 ช่วงเวลา H–AE, 31 AF, 32 กะ AG, 33 Zone AH, 34 สังกัด AI, 35 BU AJ, 36 Type Pick AK */
(() => {
  'use strict';
  if (typeof Chart === 'undefined') {
    console.warn('V3 views: ไม่พบ Chart.js จึงข้ามการวาดกราฟหน้าภาพรวม');
    return;
  }

  Chart.register(ChartDataLabels);
  Chart.defaults.font.family = "'Prompt',sans-serif";
  Chart.defaults.color = '#64748b';

  const M = window.V3Metrics;
  const $ = (id) => document.getElementById(id);
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const fmt1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  const TYPE_LABEL = { fullRack: 'Full Rack', halfRack: 'Half Rack', ea: 'Micro Rack', pickToSort: 'Pick to Sort', mezzanine: 'Mezzanine' };
  const TYPE_COLOR = { fullRack: '#6366f1', halfRack: '#8b5cf6', ea: '#14b8a6', pickToSort: '#f59e0b', mezzanine: '#0ea5e9', '': '#94a3b8' };
  // พาเลตเดียวกับ V2
  const SERIES = ['#6366f1', '#14b8a6', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#10b981', '#ec4899'];

  let rows = [];
  let roster = new Map();
  let trendMode = 'day';
  let chartMonth = '';   // 'YYYY-MM' ของกราฟโหมดรายวัน (ว่าง = ตามเดือนของวันที่ที่เลือก)

  function draw(id, config) {
    const el = $(id);
    if (!el) return;
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
    new Chart(el, config);
  }

  function visibleRows() {
    const start = $('startDate') ? $('startDate').value : '';
    const end = $('endDate') ? $('endDate').value : '';
    const filters = window.V3Data ? window.V3Data.filters : {};
    return rows.filter((r) => {
      const d = M.date(r[2]);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return M.matches(r, filters);
    });
  }

  // แถวที่ผ่านตัวกรองระบบ/กะ แต่ไม่จำกัดช่วงวันที่ — ใช้กางกราฟทั้งเดือนแบบ V2
  function filteredRows() {
    const filters = window.V3Data ? window.V3Data.filters : {};
    return rows.filter((r) => M.date(r[2]) && M.matches(r, filters));
  }

  function monthKeysAvailable() {
    const set = new Set();
    filteredRows().forEach((r) => set.add(M.date(r[2]).slice(0, 7)));
    return [...set].sort();
  }

  function activeMonthKey() {
    const months = monthKeysAvailable();
    if (chartMonth && months.includes(chartMonth)) return chartMonth;
    const end = $('endDate') && $('endDate').value ? $('endDate').value : '';
    const start = $('startDate') && $('startDate').value ? $('startDate').value : '';
    const pick = (end || start).slice(0, 7);
    if (pick && months.includes(pick)) return pick;
    return months[months.length - 1] || '';
  }

  function daysInMonth(monthKey) {
    const parts = monthKey.split('-').map(Number);
    const last = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => monthKey + '-' + String(i + 1).padStart(2, '0'));
  }

  const THAI_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function monthLabel(monthKey) {
    if (!monthKey) return '-';
    const parts = monthKey.split('-').map(Number);
    return THAI_MONTH[parts[1] - 1] + ' ' + (parts[0] + 543);
  }

  // แถบเลื่อนเดือนของกราฟ (โหมดรายวันเท่านั้น) แบบเดียวกับ V2
  function renderMonthNav() {
    const wrap = $('trendMonthNav');
    if (!wrap) return;
    if (trendMode !== 'day') { wrap.innerHTML = ''; return; }
    const months = monthKeysAvailable();
    const active = activeMonthKey();
    const i = months.indexOf(active);
    const btn = (dir, label, disabled) => '<button type="button" data-month-step="' + dir + '"' + (disabled ? ' disabled' : '')
      + ' style="border:1px solid ' + (disabled ? '#e2e8f0' : '#cbd5e1') + '; background:' + (disabled ? '#f8fafc' : '#fff')
      + '; color:' + (disabled ? '#cbd5e1' : '#334155') + '; font-family:inherit; font-size:14px; font-weight:700; width:30px; height:30px; border-radius:9px; cursor:'
      + (disabled ? 'not-allowed' : 'pointer') + '; line-height:1;">' + label + '</button>';
    wrap.innerHTML = '<div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">'
      + btn('prev', '\u2039', i <= 0)
      + '<span style="font-size:13px; font-weight:800; color:#0f172a; min-width:96px; text-align:center;">' + monthLabel(active) + '</span>'
      + btn('next', '\u203a', i < 0 || i >= months.length - 1)
      + (chartMonth ? '<button type="button" data-month-step="auto" style="border:1px solid #c7d2fe; background:#eef2ff; color:#4338ca; font-size:11.5px; font-weight:700; padding:6px 10px; border-radius:9px; cursor:pointer;">\u21a9 กลับเดือนของวันที่เลือก</button>' : '')
      + '</div>';
    wrap.querySelectorAll('[data-month-step]').forEach((b) => {
      b.addEventListener('click', () => {
        const step = b.dataset.monthStep;
        if (step === 'auto') {
          chartMonth = '';
        } else {
          const list = monthKeysAvailable();
          const idx = list.indexOf(activeMonthKey());
          const next = list[idx + (step === 'next' ? 1 : -1)];
          if (!next) return;
          chartMonth = next;
        }
        renderMonthNav();
        renderTrend(visibleRows());
      });
    });
  }

  function groupBy(list, keyOf) {
    const map = new Map();
    list.forEach((r) => {
      const k = keyOf(r);
      if (k === null || k === undefined || k === '') return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return map;
  }

  function isoWeekKey(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const day = (d.getUTCDay() + 6) % 7; // จันทร์ = 0
    d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const fd = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fd + 3);
    const week = 1 + Math.round((d - firstThursday) / 604800000);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  /* ══════════ หน้าเทรน สัปดาห์ / เดือน ══════════
     ลอกองค์ประกอบจากหน้า trend ของ V2 (app.js renderTrendPage 6151-6241)
       ตัวสลับ .seg → KPI 5 ใบ (.zone-summary/.zone-stat) → กราฟผสมแท่ง+เส้น → กราฟ % เปลี่ยนแปลง → ตารางเทียบงวด

     ต่างจาก V2 ที่สูตรโดยตั้งใจ
       V2 คิด Productivity ของงวด = เฉลี่ยของค่าเฉลี่ยรายวัน (app.js:6136 mean ของ avg_prod ซึ่งเองก็เป็น mean อีกชั้น)
       V3 ใช้สูตรที่ใช้ = ผลรวมคอลัมน์ AF ของแถวที่ AF > 0 ÷ จำนวนแถวนั้น รวม sum/count ครั้งเดียว
       ตัวเลขจึงไม่ตรงกับ V2 และที่ถูกคือของ V3

     กางทุกงวดที่มีข้อมูลเสมอ ไม่หุบตามตัวกรองวันที่ (เหมือน V2) แต่ไฮไลต์งวดที่อยู่ในช่วงที่เลือกไว้ */
  const TREND_PERIOD_KEY = 'pickProductivityTrendPeriod:v3';
  const TREND_MODES = ['day', 'week', 'month'];
  let trendPeriodMode = (() => {
    try { const v = localStorage.getItem(TREND_PERIOD_KEY); return TREND_MODES.includes(v) ? v : 'week'; }
    catch (e) { return 'week'; }
  })();
  let trendPageMonth = '';      // เดือนที่กราฟโหมดรายวันกำลังกาง ('' = เดือนของวันที่ที่เลือก)
  // วันที่มีแถวเข้าเฉลี่ยน้อย ค่าเฉลี่ยเหวี่ยงง่าย ต้องเตือนไม่ให้ตัดสินใจจากแท่งเดียว
  const THIN_ROWS = 5;

  // สัปดาห์เริ่มวันจันทร์เหมือน V2 คีย์คือวันจันทร์ของสัปดาห์นั้น
  function weekStartKey(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return '';
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  function weekLabel(mondayIso) {
    const a = new Date(mondayIso + 'T00:00:00Z');
    const b = new Date(a.getTime() + 6 * 86400000);
    const f = (d) => d.getUTCDate() + '/' + (d.getUTCMonth() + 1);
    return f(a) + '–' + f(b);
  }

  function dayLabel(iso) {
    const p = iso.split('-');
    return Number(p[2]) + '/' + Number(p[1]);
  }

  // เดือนที่กราฟรายวันกาง ยึดเดือนของวันที่ที่เลือกก่อน แล้วให้เลื่อนเองได้
  function trendActiveMonth() {
    const months = monthKeysAvailable();
    if (trendPageMonth && months.includes(trendPageMonth)) return trendPageMonth;
    const end = $('endDate') && $('endDate').value ? $('endDate').value : '';
    const start = $('startDate') && $('startDate').value ? $('startDate').value : '';
    const pick = (end || start).slice(0, 7);
    if (pick && months.includes(pick)) return pick;
    return months[months.length - 1] || '';
  }

  function trendMonthNavHtml() {
    if (trendPeriodMode !== 'day') return '';
    const months = monthKeysAvailable();
    const active = trendActiveMonth();
    const i = months.indexOf(active);
    const btn = (dir, label, disabled) => `<button type="button" data-trend-month="${dir}"${disabled ? ' disabled' : ''}
      style="border:1px solid ${disabled ? '#e2e8f0' : '#cbd5e1'}; background:${disabled ? '#f8fafc' : '#fff'}; color:${disabled ? '#cbd5e1' : '#334155'};
      font-family:inherit; font-size:14px; font-weight:700; width:30px; height:30px; border-radius:9px; line-height:1;
      cursor:${disabled ? 'not-allowed' : 'pointer'};">${label}</button>`;
    return `<div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
      ${btn('prev', '\u2039', i <= 0)}
      <span style="font-size:13px; font-weight:800; color:#0f172a; min-width:96px; text-align:center;">${monthLabel(active)}</span>
      ${btn('next', '\u203a', i < 0 || i >= months.length - 1)}
      <span style="font-size:11px; color:#64748b;">กราฟกางทีละเดือน · ตารางด้านล่างเห็นทุกวันที่มีข้อมูล</span>
      ${trendPageMonth ? '<button type="button" data-trend-month="auto" style="border:1px solid #c7d2fe; background:#eef2ff; color:#4338ca; font-size:11.5px; font-weight:700; padding:6px 10px; border-radius:9px; cursor:pointer;">\u21a9 กลับเดือนของวันที่เลือก</button>' : ''}
    </div>`;
  }

  function buildTrendPeriods() {
    const list = filteredRows();                   // ทุกวันที่ ผ่านตัวกรองระบบ/กะ
    const start = $('startDate') && $('startDate').value ? $('startDate').value : '';
    const end = $('endDate') && $('endDate').value ? $('endDate').value : '';
    const byPeriod = groupBy(list, (r) => {
      const d = M.date(r[2]);
      if (trendPeriodMode === 'day') return d;
      return trendPeriodMode === 'week' ? weekStartKey(d) : d.slice(0, 7);
    });
    const periods = [...byPeriod.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, rowsOf]) => {
      const s = M.aggregate(rowsOf);               // สูตรที่ใช้ ทั้งก้อน
      const dayMap = new Map();
      rowsOf.forEach((r) => {
        const d = M.date(r[2]);
        if (!dayMap.has(d)) dayMap.set(d, new Set());
        const id = M.userId(r);
        if (id) dayMap.get(d).add(id);
      });
      const days = [...dayMap.keys()].sort();
      const first = days[0] || key;
      const last = days[days.length - 1] || key;
      const inFilter = (!start || last >= start) && (!end || first <= end);
      return {
        key, label: trendPeriodMode === 'day' ? dayLabel(key) : (trendPeriodMode === 'week' ? weekLabel(key) : monthLabel(key)),
        stats: s, days: days.length, firstDate: first, lastDate: last, inFilter,
        perDay: days.length ? s.total / days.length : 0,
        maxPeopleDay: Math.max(0, ...[...dayMap.values()].map((set) => set.size))
      };
    });
    // ส่วนต่างจากงวดก่อนหน้า
    periods.forEach((p, i) => {
      const prev = i > 0 ? periods[i - 1] : null;
      const a = p.stats.average, b = prev ? prev.stats.average : null;
      p.prodDelta = (a !== null && b !== null) ? a - b : null;
      p.prodDeltaPct = (a !== null && b) ? (a - b) / b * 100 : null;
      p.qtyDeltaPct = prev && prev.stats.total ? (p.stats.total - prev.stats.total) / prev.stats.total * 100 : null;
    });
    return periods;
  }

  function trendStatCards(cardList) {
    return `<div class="zone-summary">${cardList.map(([label, value, unit, detail, color]) =>
      `<div class="zone-stat"><div class="zone-stat-label">${label}</div>`
      + `<div class="zone-stat-value" style="color:${color || '#1e293b'}">${value}${unit ? `<span> ${unit}</span>` : ''}</div>`
      + `<div class="zone-stat-detail">${detail || ''}</div></div>`).join('')}</div>`;
  }

  function drawTrendPeriodChart(allPeriods, target) {
    // โหมดรายวันกางทีละเดือน เพราะ 250+ แท่งในใบเดียวอ่านไม่ออก
    const periods = trendPeriodMode === 'day'
      ? allPeriods.filter((p) => p.key.slice(0, 7) === trendActiveMonth())
      : allPeriods;
    const labelsOf = periods.map((p) => p.label);
    draw('v3TrendPeriodChart', {
      type: 'bar',
      data: {
        labels: labelsOf,
        datasets: [
          {
            type: 'bar', label: 'ยอดหยิบรวม', data: periods.map((p) => p.stats.total),
            backgroundColor: periods.map((p) => (p.inFilter ? 'rgba(79,70,229,.95)' : 'rgba(99,102,241,.28)')),
            borderRadius: 6, yAxisID: 'y', order: 2,
            datalabels: { display: false }
          },
          {
            type: 'line', label: 'Productivity (เฉลี่ยต่อชั่วโมง)', data: periods.map((p) => (p.stats.average === null ? null : Number(p.stats.average.toFixed(1)))),
            borderColor: '#f43f5e', backgroundColor: '#f43f5e', borderWidth: 2.5, pointRadius: 3.5,
            tension: .3, fill: false, yAxisID: 'y1', order: 1,
            datalabels: { align: 'top', color: '#be123c', font: { size: 10, weight: '700' }, formatter: (v) => (v === null ? '' : fmt1(v)) }
          },
          {
            type: 'line', label: `Target ${fmt(target)}`, data: periods.map(() => target),
            borderColor: 'rgba(245,158,11,.9)', borderWidth: 2, borderDash: [6, 4], pointRadius: 0,
            fill: false, yAxisID: 'y1', order: 0, datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 26, right: 10, bottom: 4, left: 2 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              afterBody: (items) => {
                const p = periods[items[0].dataIndex];
                const lines = trendPeriodMode === 'day'
                  ? [`${fmt(p.stats.count)} แถวเข้าเฉลี่ย · ${fmt(p.stats.people)} คน`]
                  : [`${fmt(p.days)} วันทำการ · ${fmt(p.stats.count)} แถวเข้าเฉลี่ย`,
                    `เฉลี่ย ${fmt(p.perDay)} หยิบ/วัน · ${fmt(p.stats.people)} คน`];
                if (p.stats.count > 0 && p.stats.count < THIN_ROWS) lines.push('⚠️ แถวเข้าเฉลี่ยน้อย ค่าเฉลี่ยเหวี่ยงง่าย');
                lines.push(p.inFilter ? 'อยู่ในช่วงวันที่ที่เลือก' : 'อยู่นอกช่วงวันที่ที่เลือก');
                return lines;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 }, maxRotation: 0, autoSkipPadding: 12 } },
          y: { position: 'left', beginAtZero: true, grid: { color: 'rgba(148,163,184,.25)' },
            ticks: { font: { size: 10.5 }, callback: (v) => fmt(v) }, title: { display: true, text: 'ยอดหยิบ (ชิ้น)', font: { size: 10.5 } } },
          y1: { position: 'right', beginAtZero: true, grid: { display: false },
            ticks: { font: { size: 10.5 } }, title: { display: true, text: 'หยิบ/ชม.', font: { size: 10.5 } } }
        }
      }
    });
  }

  function drawTrendChangeChart(allPeriods) {
    const scoped = trendPeriodMode === 'day'
      ? allPeriods.filter((p) => p.key.slice(0, 7) === trendActiveMonth())
      : allPeriods;
    const withPrev = scoped.filter((p) => p.prodDeltaPct !== null);
    draw('v3TrendChangeChart', {
      type: 'bar',
      data: {
        labels: withPrev.map((p) => p.label),
        datasets: [{
          label: `เปลี่ยนแปลง Productivity เทียบ${trendPeriodMode === 'day' ? 'วันก่อน' : (trendPeriodMode === 'week' ? 'สัปดาห์ก่อน' : 'เดือนก่อน')} (%)`,
          data: withPrev.map((p) => Number(p.prodDeltaPct.toFixed(1))),
          backgroundColor: withPrev.map((p) => (p.prodDeltaPct >= 0 ? 'rgba(16,185,129,.9)' : 'rgba(244,63,94,.9)')),
          borderRadius: 5,
          datalabels: {
            color: '#334155', font: { size: 10, weight: '700' },
            align: (ctx) => (ctx.dataset.data[ctx.dataIndex] >= 0 ? 'top' : 'bottom'),
            formatter: (v) => (v >= 0 ? '+' : '') + fmt1(v) + '%'
          }
        }]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 22, bottom: 18, right: 8, left: 2 } },
        plugins: { legend: { display: false },
          tooltip: { backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: { afterBody: (items) => {
              const p = withPrev[items[0].dataIndex];
              return [`${fmt1(p.stats.average)} หยิบ/ชม. (เดิม ${fmt1(p.stats.average - p.prodDelta)})`,
                `ยอดหยิบเปลี่ยน ${p.qtyDeltaPct === null ? '—' : (p.qtyDeltaPct >= 0 ? '+' : '') + fmt1(p.qtyDeltaPct) + '%'}`];
            } } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 }, maxRotation: 0, autoSkipPadding: 12 } },
          y: { grid: { color: 'rgba(148,163,184,.25)' }, ticks: { font: { size: 10.5 }, callback: (v) => fmt1(v) + '%' } }
        }
      }
    });
  }

  function renderTrendPage() {
    const host = $('v3Trend');
    if (!host) return;
    const periods = buildTrendPeriods();
    const unit = trendPeriodMode === 'day' ? 'วัน' : (trendPeriodMode === 'week' ? 'สัปดาห์' : 'เดือน');
    const delta = trendPeriodMode === 'day' ? 'DoD' : (trendPeriodMode === 'week' ? 'WoW' : 'MoM');
    const target = Number(window.TARGETS && window.TARGETS.overall) || 170;
    const toggle = `<div class="seg" id="v3TrendPeriodTog" style="margin-bottom:14px;">
      <button type="button" data-tperiod="day"${trendPeriodMode === 'day' ? ' class="active"' : ''}>📆 รายวัน</button>
      <button type="button" data-tperiod="week"${trendPeriodMode === 'week' ? ' class="active"' : ''}>📅 รายสัปดาห์</button>
      <button type="button" data-tperiod="month"${trendPeriodMode === 'month' ? ' class="active"' : ''}>🗓️ รายเดือน</button></div>`;

    if (!periods.length) {
      host.innerHTML = `<div class="card wide"><h3>📈 เทรนผลงาน</h3>${toggle}
        <div class="staff-miss-ok">ยังไม่มีข้อมูลรายวันตามตัวกรองระบบ/กะ ที่เลือกไว้</div></div>`;
      bindTrendPeriodButtons();
      return;
    }

    const latest = periods[periods.length - 1];
    const withAvg = periods.filter((p) => p.stats.average !== null);
    const best = withAvg.length ? withAvg.reduce((a, b) => (b.stats.average > a.stats.average ? b : a)) : null;
    const hit = withAvg.filter((p) => p.stats.average >= target).length;

    host.innerHTML = `<div class="card wide">
      <h3>📈 เทรนผลงานราย${unit}</h3>
      <div class="sub">${trendPeriodMode === 'day'
        ? 'กราฟกางทีละเดือนเพื่อให้อ่านออก (ทั้งชุดมีหลายร้อยวัน) เลื่อนเดือนได้ที่ปุ่มด้านล่าง · ตารางด้านล่างเห็นทุกวันที่มีข้อมูล'
        : `กางทุก${unit}ที่มีข้อมูลเสมอ ไม่หุบตามตัวกรองวันที่`} · แท่งสีเข้มคือ${unit}ที่ครอบช่วงวันที่ที่เลือกไว้ด้านบน
        · ตัวกรองระบบ (BPS/PTT) และกะ ยังมีผลตามปกติ</div>
      ${toggle}
      ${trendMonthNavHtml()}
      ${trendStatCards([
        [`⚡ Productivity ${unit}ล่าสุด`, fmt1(latest.stats.average), 'หยิบ/ชม.',
          latest.label + (latest.stats.count > 0 && latest.stats.count < THIN_ROWS ? ' ⚠️ แถวเข้าเฉลี่ยน้อย' : ''),
          latest.stats.average !== null && latest.stats.average >= target ? '#16a34a' : '#e11d48'],
        [`📊 เปลี่ยนแปลง ${delta}`,
          latest.prodDeltaPct === null ? '—' : (latest.prodDeltaPct >= 0 ? '▲ ' : '▼ ') + fmt1(Math.abs(latest.prodDeltaPct)),
          latest.prodDeltaPct === null ? '' : '%',
          latest.prodDelta === null ? `ไม่มี${unit}ก่อนหน้าให้เทียบ` : `${latest.prodDelta >= 0 ? '+' : ''}${fmt1(latest.prodDelta)} หยิบ/ชม.`,
          latest.prodDeltaPct === null ? '#64748b' : (latest.prodDeltaPct >= 0 ? '#16a34a' : '#e11d48')],
        [`📦 ยอดหยิบ${unit}ล่าสุด`, fmt(latest.stats.total), 'ชิ้น',
          trendPeriodMode === 'day'
            ? `${fmt(latest.stats.count)} แถวเข้าเฉลี่ย · ${fmt(latest.stats.people)} คน`
            : `${fmt(latest.days)} วันทำการ · เฉลี่ย ${fmt(latest.perDay)} ชิ้น/วัน`, '#0ea5e9'],
        [`🏆 ${unit}ที่ดีที่สุด`, best ? fmt1(best.stats.average) : '—', 'หยิบ/ชม.', best ? best.label : 'ยังไม่มีค่าเฉลี่ย', '#7c3aed'],
        [`🎯 ${unit}ที่ถึงเป้า`, `${fmt(hit)} / ${fmt(withAvg.length)}`, unit, `Target ${fmt(target)} หยิบ/ชม.`,
          hit === withAvg.length ? '#16a34a' : '#ea580c']
      ])}
      <div class="chartbox tall" style="margin-top:16px;"><canvas id="v3TrendPeriodChart"></canvas></div>
      <div class="chartbox" style="margin-top:16px;"><canvas id="v3TrendChangeChart"></canvas></div>
      <div class="note v3-notice"><b>สูตรที่ใช้เป็นของ V1</b> — Productivity ของ${unit} = ผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น
        รวมครั้งเดียว ไม่ได้เอาค่าเฉลี่ยรายวันมาเฉลี่ยซ้ำ · ยอดหยิบ = ผลรวมยอดหยิบทุกแถวที่มีวันที่
        ${trendPeriodMode === 'day' ? `<br>วันที่มีแถวเข้าเฉลี่ยน้อยกว่า ${THIN_ROWS} แถวจะขึ้น ⚠️ เพราะค่าเฉลี่ยเหวี่ยงง่าย อย่าตัดสินใจจากวันเดียว` : ''}
        <br>หน้าเดียวกันของ V2 คิดเป็น “เฉลี่ยของค่าเฉลี่ยรายวัน” ตัวเลขจึงอาจไม่ตรงกับหน้านี้
        ยิ่งจำนวนแถวของแต่ละวันในงวดต่างกันมาก ยิ่งต่างกันมาก · ${trendPeriodMode === 'week' ? 'สัปดาห์เริ่มวันจันทร์' : 'เดือนตามปฏิทิน'}</div>
    </div>
    <h2 class="staff-table-title">ตารางเทียบราย${unit} (ใหม่ → เก่า)</h2>
    <p class="panel-desc">กดหัวคอลัมน์เพื่อเรียงใหม่ได้ · งวดที่มีป้าย “ช่วงที่เลือก” คือ${unit}ที่ครอบช่วงวันที่ด้านบน</p>
    <div id="v3TrendTable"></div>`;

    drawTrendPeriodChart(periods, target);
    drawTrendChangeChart(periods);

    const newestFirst = [...periods].reverse();
    if (window.V3Shared && window.V3Shared.table) {
      const signed1 = (v) => (v === null ? '—' : (v >= 0 ? '+' : '') + fmt1(v));
      const cls = (v) => (v === null ? '' : v >= 0 ? 'staff-up' : 'staff-down');
      window.V3Shared.table($('v3TrendTable'), 'trend-' + trendPeriodMode, newestFirst, [
        { title: '#', value: (p) => newestFirst.indexOf(p) + 1, num: true, html: (p) => `<span class="rank">${newestFirst.indexOf(p) + 1}</span>` },
        { title: unit, value: (p) => (trendPeriodMode === 'day' ? p.key : p.label),
          html: (p) => `<b>${p.label}</b>${p.inFilter ? ' <span class="pill" style="background:#4338ca;color:#fff;font-size:10px;">ช่วงที่เลือก</span>' : ''}`
            + `<span class="sub">${trendPeriodMode === 'day' ? monthLabel(p.key.slice(0, 7)) : fmt(p.days) + ' วันทำการ'} · ${fmt(p.stats.count)} แถวเข้าเฉลี่ย`
            + `${p.stats.count > 0 && p.stats.count < THIN_ROWS ? ' ⚠️' : ''}</span>` },
        { title: 'ยอดหยิบรวม', value: (p) => p.stats.total, num: true, html: (p) => fmt(p.stats.total) },
        { title: trendPeriodMode === 'day' ? 'เฉลี่ย/คน' : 'เฉลี่ย/วัน',
          value: (p) => (trendPeriodMode === 'day' ? (p.stats.people ? p.stats.total / p.stats.people : 0) : p.perDay),
          num: true,
          html: (p) => fmt(trendPeriodMode === 'day' ? (p.stats.people ? p.stats.total / p.stats.people : 0) : p.perDay) },
        { title: 'Productivity', value: (p) => (p.stats.average === null ? 0 : p.stats.average), num: true, sortValue: (p) => p.stats.average,
          html: (p) => `<b style="color:${p.stats.average !== null && p.stats.average >= target ? '#059669' : '#b91c1c'}">${fmt1(p.stats.average)}</b>` },
        { title: `Δ Prod ${delta}`, value: (p) => (p.prodDelta === null ? 0 : p.prodDelta), num: true, sortValue: (p) => p.prodDelta,
          html: (p) => `<span class="${cls(p.prodDelta)}">${signed1(p.prodDelta)}</span>`
            + (p.prodDeltaPct === null ? '' : `<span class="sub">${signed1(p.prodDeltaPct)}%</span>`) },
        { title: `Δ ยอดหยิบ ${delta}`, value: (p) => (p.qtyDeltaPct === null ? 0 : p.qtyDeltaPct), num: true, sortValue: (p) => p.qtyDeltaPct,
          html: (p) => `<span class="${cls(p.qtyDeltaPct)}">${signed1(p.qtyDeltaPct)}${p.qtyDeltaPct === null ? '' : '%'}</span>` },
        { title: 'ชั่วโมงทำงาน', value: (p) => p.stats.hours, num: true, html: (p) => fmt1(p.stats.hours) },
        (trendPeriodMode === 'day'
          ? { title: 'คนที่มีผลงาน', value: (p) => p.stats.people, num: true, html: (p) => `${fmt(p.stats.people)}<span class="sub">${fmt(p.stats.excluded)} แถวไม่เข้าเฉลี่ย</span>` }
          : { title: 'คนมากสุด/วัน', value: (p) => p.maxPeopleDay, num: true, html: (p) => `${fmt(p.maxPeopleDay)}<span class="sub">${fmt(p.stats.people)} คนทั้ง${unit}</span>` }),
        { title: 'เทียบ Target', value: (p) => (p.stats.average === null ? 'ไม่มีค่าเฉลี่ย' : p.stats.average >= target ? 'ถึงเป้า' : 'ต่ำกว่าเป้า'),
          html: (p) => (p.stats.average === null ? '<span class="v3-pill">ไม่มีค่าเฉลี่ย</span>'
            : p.stats.average >= target ? '<span class="badge-status pass">ถึงเป้า</span>' : '<span class="badge-status fail">ต่ำกว่าเป้า</span>') }
      ]);
    }
    bindTrendPeriodButtons();
  }

  function bindTrendPeriodButtons() {
    document.querySelectorAll('[data-trend-month]').forEach((b) => {
      b.addEventListener('click', () => {
        const step = b.dataset.trendMonth;
        if (step === 'auto') trendPageMonth = '';
        else {
          const months = monthKeysAvailable();
          const next = months[months.indexOf(trendActiveMonth()) + (step === 'next' ? 1 : -1)];
          if (!next) return;
          trendPageMonth = next;
        }
        renderTrendPage();
      });
    });
    document.querySelectorAll('#v3TrendPeriodTog button[data-tperiod]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.tperiod === trendPeriodMode) return;
        trendPeriodMode = b.dataset.tperiod;
        trendPageMonth = '';
        try { localStorage.setItem(TREND_PERIOD_KEY, trendPeriodMode); } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
        renderTrendPage();
      });
    });
  }

  /* ── 1. แถว KPI ที่ v2-views รับผิดชอบ (ที่เหลือ script.js เติมตามสูตร V1 เดิม) ── */
  function renderKpiExtras(list) {
    const s = M.aggregate(list);
    if ($('kpiTarget')) $('kpiTarget').textContent = fmt((window.TARGETS && window.TARGETS.overall) || 170);
    if ($('kpiPeople')) $('kpiPeople').textContent = fmt(s.people);
    if ($('kpiPeopleNote')) {
      $('kpiPeopleNote').textContent = `${fmt(s.count)} แถวเข้าเฉลี่ย · ${fmt(s.excluded)} แถวไม่เข้าเฉลี่ย · ${fmt(s.rows)} แถวต้นทาง`;
    }
  }

  /* ── 2. กราฟแนวโน้ม: แท่ง = Total Pick, เส้น = Productivity (สองแกนแบบ V2) ── */
  function renderTrend(list) {
    const start = $('startDate') && $('startDate').value ? $('startDate').value : '';
    const end = $('endDate') && $('endDate').value ? $('endDate').value : '';
    let labels, stats, inFilter;

    if (trendMode === 'month') {
      const buckets = groupBy(list, (r) => M.date(r[2]).slice(0, 7));
      labels = [...buckets.keys()].sort();
      stats = labels.map((k) => M.aggregate(buckets.get(k)));
      inFilter = labels.map(() => true);
    } else if (trendMode === 'week') {
      const buckets = groupBy(list, (r) => isoWeekKey(M.date(r[2])));
      labels = [...buckets.keys()].sort();
      stats = labels.map((k) => M.aggregate(buckets.get(k)));
      inFilter = labels.map(() => true);
    } else {
      // แบบ V2: กางทั้งเดือนปฏิทิน แท่งสีเข้ม = วันที่อยู่ในตัวกรอง
      const month = activeMonthKey();
      const monthRows = filteredRows().filter((r) => M.date(r[2]).slice(0, 7) === month);
      const buckets = groupBy(monthRows, (r) => M.date(r[2]));
      labels = month ? daysInMonth(month) : [...buckets.keys()].sort();
      stats = labels.map((k) => M.aggregate(buckets.get(k) || []));
      inFilter = labels.map((d) => (!start || d >= start) && (!end || d <= end));
    }
    const totals = stats.map((s) => s.total);
    const prods = stats.map((s) => (s.average === null ? 0 : Number(s.average.toFixed(1))));
    const manyBars = labels.length > 14;
    const narrow = window.innerWidth < 900;
    const maxTotal = Math.max(1, ...totals);
    const valid = prods.filter((v) => v > 0);
    const minProd = valid.length ? Math.min(...valid) : 0;
    const maxProd = valid.length ? Math.max(...valid) : 100;
    const target = (window.TARGETS && window.TARGETS.overall) || 170;

    if ($('trendRangePill')) {
      const unit = trendMode === 'month' ? 'เดือน' : trendMode === 'week' ? 'สัปดาห์' : 'วัน';
      const shown = totals.reduce((a, b) => a + b, 0);
      const picked = totals.reduce((a, b, i) => a + (inFilter[i] ? b : 0), 0);
      $('trendRangePill').textContent = trendMode === 'day'
        ? 'ทั้งเดือน ' + fmt(shown) + ' \u00b7 ในตัวกรอง ' + fmt(picked) + ' Total Pick'
        : fmt(labels.length) + ' ' + unit + ' \u00b7 ' + fmt(shown) + ' Total Pick';
    }
    if ($('trendSub')) {
      let text = 'แท่ง = Total Pick รวมยอดหยิบทุกแถว (แกนซ้าย) \u00b7 เส้น = Productivity เฉลี่ยต่อชั่วโมงจากแถวที่นับได้ (แกนขวา) \u00b7 รวมครั้งเดียว ไม่เฉลี่ยค่าเฉลี่ยรายวันซ้ำ';
      if (trendMode === 'day') {
        text += '<br><b style="color:#4338ca;">กราฟกางทั้งเดือน ' + monthLabel(activeMonthKey()) + '</b>'
          + ' \u2014 แท่งสีเข้ม = วันที่อยู่ในตัวกรอง' + (start ? ' (' + start + (start === end ? '' : ' \u2013 ' + end) + ')' : '')
          + ' \u00b7 การ์ด KPI และตารางยังเป็นยอดตามตัวกรองเท่านั้น';
      }
      $('trendSub').innerHTML = text;
    }

    draw('trend', {
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Total Pick',
            data: totals,
            backgroundColor: trendMode === 'day'
              ? inFilter.map((on) => (on ? 'rgba(79,70,229,.95)' : 'rgba(99,102,241,.28)'))
              : 'rgba(99,102,241,.85)',
            borderRadius: 6,
            yAxisID: 'y',
            datalabels: {
              display: (ctx) => {
                const v = Number(ctx.dataset.data[ctx.dataIndex] || 0);
                if (narrow && labels.length > 10) return false;
                return v > 0 && (v / maxTotal >= 0.06 || ctx.dataset.data.length <= 4);
              },
              anchor: 'center',
              align: 'center',
              rotation: manyBars ? -90 : 0,
              formatter: (v) => (Number(v) > 0 ? fmt(v) : ''),
              color: '#ffffff',
              backgroundColor: 'rgba(15,23,42,.45)',
              borderRadius: 4,
              padding: { top: 2, right: 4, bottom: 2, left: 4 },
              font: { weight: '700', size: manyBars ? 9.5 : 11 }
            }
          },
          {
            type: 'line',
            label: 'Productivity (เฉลี่ยต่อชั่วโมง)',
            data: prods,
            borderColor: '#f43f5e',
            backgroundColor: '#f43f5e',
            tension: 0.35,
            borderWidth: 3,
            pointRadius: manyBars ? 4 : 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#f43f5e',
            pointBorderWidth: 2,
            yAxisID: 'y1',
            datalabels: {
              display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) > 0
                && (!narrow || ctx.dataIndex % 3 === 0),
              anchor: 'end',
              align: 'top',
              offset: 8,
              color: '#e11d48',
              backgroundColor: 'rgba(255,255,255,.98)',
              borderColor: 'rgba(244,63,94,.4)',
              borderWidth: 1.5,
              borderRadius: 5,
              padding: { top: 2, right: 5, bottom: 2, left: 5 },
              formatter: (v) => fmt1(v),
              font: { weight: '700', size: manyBars ? 9.5 : 11 }
            }
          },
          {
            type: 'line',
            label: `Target ${target}`,
            data: labels.map(() => target),
            borderColor: 'rgba(245,158,11,.9)',
            borderWidth: 2,
            borderDash: [6, 5],
            pointRadius: 0,
            fill: false,
            yAxisID: 'y1',
            datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 40, right: 16, bottom: 12, left: 8 } },
        plugins: {
          legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 16, font: { size: 12, weight: '600' } } },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleFont: { size: 12, weight: '700' },
            bodyFont: { size: 12 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return ` Total Pick: ${fmt(ctx.parsed.y)} ชิ้น`;
                if (ctx.datasetIndex === 1) {
                  const s = stats[ctx.dataIndex];
                  return ` Productivity: ${fmt1(ctx.parsed.y)} หยิบ/ชม. (${fmt(s.count)} แถวเข้าเฉลี่ย)`;
                }
                return ` Target: ${fmt(ctx.parsed.y)}`;
              }
            }
          },
          datalabels: { clip: false, clamp: true }
        },
        scales: {
          y: {
            grid: { color: '#f1f5f9' },
            ticks: { callback: (v) => fmt(v), font: { size: 11 } },
            suggestedMax: Math.ceil((maxTotal * 1.35) / 1000) * 1000
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => Number(v).toFixed(0), font: { size: 11 } },
            suggestedMax: Math.ceil(Math.max(maxProd, target) * 1.15),
            suggestedMin: Math.max(0, Math.floor(minProd * 0.8))
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10.5 },
              maxRotation: trendMode === 'day' ? 0 : (manyBars ? 60 : 0),
              autoSkip: true,
              maxTicksLimit: narrow ? 8 : (trendMode === 'day' ? 31 : (manyBars ? 18 : 12)),
              callback: function (value) {
                const raw = this.getLabelForValue(value);
                return trendMode === 'day' ? String(raw).slice(-2) : raw;
              }
            }
          }
        }
      }
    });
  }

  /* ── 3. ปริมาณงานรายชั่วโมง จากคอลัมน์ H–AE (24 ช่อง ตามหัวตาราง Sheet) ── */
  function renderHourly(list, headers) {
    const hourly = M.hourTotals(list);
    const labels = M.hourLabels(headers).map((h) => h.split(' - ')[0].trim());
    const max = Math.max(1, ...hourly);

    draw('hourlyPeakChart', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total Pick ตามช่วงเวลา',
          data: hourly,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2.8,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#4338ca'
        }]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 32, right: 16, bottom: 8, left: 4 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: (ctx) => {
              const v = ctx.dataset.data[ctx.dataIndex];
              return v > 0 && (v >= max * 0.15 || ctx.dataIndex % 2 === 0);
            },
            anchor: 'end',
            align: 'top',
            offset: 6,
            color: '#3730a3',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: 'rgba(99, 102, 241, 0.3)',
            borderWidth: 1,
            borderRadius: 4,
            padding: { top: 2, right: 5, bottom: 2, left: 5 },
            font: { weight: '700', size: 10.5 },
            formatter: (v) => fmt(v)
          }
        },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { weight: '600', size: 10.5 } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) } }
        }
      }
    });
  }

  /* ── 4. โดนัทสัดส่วนระบบ PTT / BPS + แผงสถิติ (แบบ V2) ── */
  function renderSystemShare(list) {
    const ptt = [], bps = [], other = [];
    list.forEach((r) => {
      const sys = M.system(r);
      if (sys === 'BPS') bps.push(r);
      else if (sys === 'PTT') ptt.push(r);
      else other.push(r);
    });
    const a = M.aggregate(ptt), b = M.aggregate(bps), c = M.aggregate(other);
    const data = [a.total, b.total];
    const total = data.reduce((x, y) => x + y, 0) || 1;
    const pct = (v) => (Number(v) || 0) / total * 100;

    if ($('catTotalBadge')) $('catTotalBadge').textContent = `รวม ${fmt(a.total + b.total + c.total)} ชิ้น`;
    if ($('pttSharePct')) $('pttSharePct').textContent = `${pct(a.total).toFixed(1)}%`;
    if ($('pttVal')) $('pttVal').textContent = `${fmt(a.total)} ชิ้น`;
    if ($('pttSubText')) $('pttSubText').textContent = `${fmt(a.rows)} แถว · Productivity ${fmt1(a.average)} หยิบ/ชม.`;
    if ($('bpsSharePct')) $('bpsSharePct').textContent = `${pct(b.total).toFixed(1)}%`;
    if ($('bpsVal')) $('bpsVal').textContent = `${fmt(b.total)} ชิ้น`;
    if ($('bpsSubText')) $('bpsSubText').textContent = `${fmt(b.rows)} แถว · Productivity ${fmt1(b.average)} หยิบ/ชม.`;

    draw('cat', {
      type: 'doughnut',
      data: {
        labels: ['Pick (PTT)', 'Pick to Sort (BPS)'],
        datasets: [{ data, backgroundColor: ['#6366f1', '#f59e0b'], borderWidth: 3, borderColor: '#fff' }]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: 10 },
        cutout: '68%',
        plugins: {
          legend: { display: false },
          datalabels: {
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) > 0,
            color: '#fff',
            font: { size: 11, weight: '700' },
            formatter: (v) => Math.round(pct(v)) + '%'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const s = ctx.dataIndex === 0 ? a : b;
                return [` ${ctx.label}`, ` Total Pick: ${fmt(s.total)} ชิ้น`, ` Productivity: ${fmt1(s.average)} หยิบ/ชม.`];
              }
            }
          }
        }
      }
    });
  }

  /* ── 5. แท่งนอน: สัดส่วนตามประเภทงาน (Type Pick, Column AK ตามกฎ V1) ── */
  function renderTypeShare(list) {
    const buckets = new Map();
    list.forEach((r) => {
      const key = M.type(r[36]) || '';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    });
    const entries = [...buckets.entries()]
      .map(([k, v]) => ({ key: k, label: TYPE_LABEL[k] || 'ไม่พบ Type Pick', stats: M.aggregate(v) }))
      .sort((x, y) => y.stats.total - x.stats.total);

    draw('storageTypeChart', {
      type: 'bar',
      data: {
        labels: entries.map((e) => e.label),
        datasets: [{
          label: 'Total Pick',
          data: entries.map((e) => e.stats.total),
          backgroundColor: entries.map((e) => TYPE_COLOR[e.key] || '#94a3b8'),
          borderRadius: 6,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        layout: { padding: { top: 8, right: 52, bottom: 8, left: 10 } },
        plugins: {
          legend: { display: false },
          datalabels: { anchor: 'end', align: 'end', color: '#334155', font: { weight: '700', size: 10.5 }, formatter: (v) => fmt(v) },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const e = entries[ctx.dataIndex];
                return [` Total Pick: ${fmt(e.stats.total)} ชิ้น`, ` Productivity: ${fmt1(e.stats.average)} หยิบ/ชม.`, ` ${fmt(e.stats.count)} แถวเข้าเฉลี่ย`];
              }
            }
          }
        },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) } },
          y: { grid: { display: false }, ticks: { font: { weight: '600', size: 11 } } }
        }
      }
    });
  }

  /* ── 6. โดนัท BU (Column AJ) แทนการ์ด Owner Share ของ V2 ที่ต้องใช้ BigQuery ── */
  function renderBuShare(list) {
    const buckets = groupBy(list, (r) => String(r[35] || '').trim() || 'Not Found Data');
    const entries = [...buckets.entries()]
      .map(([k, v]) => ({ label: k, stats: M.aggregate(v) }))
      .sort((x, y) => y.stats.total - x.stats.total);
    const total = entries.reduce((sum, e) => sum + e.stats.total, 0) || 1;

    draw('buShareChart', {
      type: 'doughnut',
      data: {
        labels: entries.map((e) => e.label),
        datasets: [{ data: entries.map((e) => e.stats.total), backgroundColor: entries.map((_, i) => SERIES[i % SERIES.length]), borderWidth: 3, borderColor: '#fff' }]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: 10 },
        cutout: '60%',
        plugins: {
          legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 11 } } },
          datalabels: {
            display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) / total >= 0.05,
            color: '#fff',
            font: { size: 11, weight: '700' },
            formatter: (v) => Math.round((Number(v) || 0) / total * 100) + '%'
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const e = entries[ctx.dataIndex];
                return [` ${e.label}`, ` Total Pick: ${fmt(e.stats.total)} ชิ้น`, ` Productivity: ${fmt1(e.stats.average)} หยิบ/ชม.`];
              }
            }
          }
        }
      }
    });
  }

  /* ── 7. สังกัด (Column AI): ยอดหยิบเทียบจำนวนพนักงาน สองแกนแบบ V2 ── */
  function renderAffiliation(list) {
    const buckets = groupBy(list, (r) => String(r[34] || '').trim() || 'Not Found Data');
    const entries = [...buckets.entries()]
      .map(([k, v]) => ({ label: k, stats: M.aggregate(v) }))
      .sort((x, y) => y.stats.total - x.stats.total);

    draw('macroAffiliationChart', {
      type: 'bar',
      data: {
        labels: entries.map((e) => e.label),
        datasets: [
          { label: 'Total Pick', data: entries.map((e) => e.stats.total), backgroundColor: '#0f766e', borderRadius: 6, yAxisID: 'y' },
          { label: 'จำนวนพนักงาน (คน)', data: entries.map((e) => e.stats.people), backgroundColor: '#f59e0b', borderRadius: 6, yAxisID: 'y1' }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 18, right: 12, bottom: 4, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5 } } },
          datalabels: { anchor: 'end', align: 'end', font: { weight: '700', size: 10 }, formatter: (v) => fmt(v) },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const e = entries[items[0].dataIndex];
                return `Productivity ${fmt1(e.stats.average)} หยิบ/ชม. · ${fmt(e.stats.count)} แถวเข้าเฉลี่ย`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { weight: '600', size: 11 } } },
          y: { position: 'left', grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => fmt(v) } }
        }
      }
    });
  }

  /* ── 8. เทียบกะ (Column AG ตามที่ Sheet บันทึก ไม่คาดเดาจากเวลา) ── */
  function renderShiftCompare(list) {
    const buckets = groupBy(list, (r) => M.shiftKey(r));
    const entries = [...buckets.entries()]
      .map(([k, v]) => ({ label: k, stats: M.aggregate(v) }))
      .sort((x, y) => (x.label === 'Not Found' ? 1 : y.label === 'Not Found' ? -1 : x.label.localeCompare(y.label)));
    const target = (window.TARGETS && window.TARGETS.overall) || 170;

    draw('shiftCompareChart', {
      type: 'bar',
      data: {
        labels: entries.map((e) => (e.label === 'Not Found' ? '⚠️ Not Found' : `กะ ${e.label}`)),
        datasets: [
          {
            label: 'Total Pick',
            data: entries.map((e) => e.stats.total),
            backgroundColor: entries.map((e) => (e.label === 'Not Found' ? '#f97316' : SERIES[entries.indexOf(e) % SERIES.length])),
            borderRadius: 8,
            barThickness: 34,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Productivity (เฉลี่ยต่อชั่วโมง)',
            data: entries.map((e) => (e.stats.average === null ? 0 : Number(e.stats.average.toFixed(1)))),
            borderColor: '#f43f5e',
            backgroundColor: '#fff',
            pointBackgroundColor: '#fff',
            pointBorderColor: '#f43f5e',
            pointBorderWidth: 2,
            pointRadius: 6,
            borderWidth: 3,
            tension: 0.3,
            yAxisID: 'y1',
            datalabels: {
              anchor: 'end',
              align: 'top',
              offset: 6,
              color: '#e11d48',
              backgroundColor: 'rgba(255,255,255,.98)',
              borderColor: 'rgba(244,63,94,.4)',
              borderWidth: 1.5,
              borderRadius: 5,
              padding: { top: 2, right: 5, bottom: 2, left: 5 },
              font: { weight: '700', size: 11 },
              formatter: (v) => fmt1(v)
            }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 30, right: 12, bottom: 4, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5 } } },
          datalabels: { anchor: 'end', align: 'end', offset: 3, color: '#0f172a', font: { weight: '800', size: 11.5 }, formatter: (v) => fmt(v) },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const e = entries[items[0].dataIndex];
                return `${fmt(e.stats.people)} คน · ${fmt(e.stats.count)} แถวเข้าเฉลี่ย · Target ${target}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { weight: '700', size: 11.5 } } },
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, suggestedMax: Math.ceil(target * 1.4), ticks: { callback: (v) => Number(v).toFixed(0) } }
        }
      }
    });
  }

  /* ── 9. อันดับพนักงาน แบบการ์ดกราฟของ V2
        หน้า "อันดับพนักงาน" ถูกถอดออกชั่วคราว ฟังก์ชันนี้จึงไม่ทำงาน (return เมื่อไม่พบ #picker)
        เมื่อนำหน้ากลับจาก parked/sections.html กราฟจะกลับมาเองโดยไม่ต้องแก้โค้ด ── */
  let pickerTop = 12;
  function renderPickers(list) {
    if (!$('picker')) return;
    const buckets = groupBy(list, (r) => String(r[3] || '').trim() || 'Not Found');
    const names = new Map();
    list.forEach((r) => {
      const id = M.userId(r) || 'Not Found';
      if (!names.has(id)) names.set(id, M.personName(r, roster));
    });
    const target = (window.TARGETS && window.TARGETS.overall) || 170;
    const items = [...buckets.entries()]
      .map(([id, rs]) => ({ id, name: names.get(id) || id, stats: M.aggregate(rs) }))
      .filter((x) => x.stats.average !== null)
      .sort((a, b) => b.stats.average - a.stats.average)
      .slice(0, pickerTop);

    const box = $('pickerChartBox');
    if (box) box.style.height = Math.max(320, items.length * 26 + 90) + 'px';

    draw('picker', {
      type: 'bar',
      data: {
        labels: items.map((x) => (x.name.length > 26 ? x.name.slice(0, 25) + '…' : x.name)),
        datasets: [{
          label: 'Productivity (เฉลี่ยต่อชั่วโมง)',
          data: items.map((x) => Number(x.stats.average.toFixed(1))),
          backgroundColor: items.map((x) => (x.stats.average >= target ? '#10b981' : '#f43f5e')),
          borderRadius: 6,
          barThickness: 16
        }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        layout: { padding: { top: 8, right: 62, bottom: 8, left: 6 } },
        plugins: {
          legend: { display: false },
          datalabels: { anchor: 'end', align: 'end', color: '#334155', font: { weight: '700', size: 10.5 }, formatter: (v) => fmt1(v) },
          tooltip: {
            callbacks: {
              title: (c) => items[c[0].dataIndex].name,
              label: (ctx) => {
                const x = items[ctx.dataIndex];
                return [' User ID: ' + x.id, ' Productivity: ' + fmt1(x.stats.average) + ' หยิบ/ชม.', ' Total Pick: ' + fmt(x.stats.total) + ' ชิ้น', ' ' + fmt(x.stats.count) + ' แถวเข้าเฉลี่ย'];
              }
            }
          },
          annotation: undefined
        },
        scales: {
          x: { grid: { color: '#f1f5f9' }, suggestedMax: Math.ceil(target * 1.25), ticks: { callback: (v) => fmt(v) } },
          y: { grid: { display: false }, ticks: { font: { weight: '600', size: 10.5 } } }
        }
      }
    });

    if ($('pickerChartNote')) {
      const pass = items.filter((x) => x.stats.average >= target).length;
      $('pickerChartNote').textContent = 'แสดง ' + fmt(items.length) + ' คนแรกจาก ' + fmt(buckets.size)
        + ' User ID ที่มีรายการ · ถึง Target ' + target + ' แล้ว ' + fmt(pass) + ' คน (เขียว) · ค่าเฉลี่ยรายคนใช้ผลรวม/จำนวนแถวของคนนั้นโดยตรง ไม่เฉลี่ยค่าเฉลี่ยรายวันซ้ำ';
    }
  }

  /* ── 10. กราฟของหน้าช่วงเวลา (insights.js สร้างมาร์กอัปแล้วส่งสัญญาณมา) ── */
  function renderHoursPageChart(labels, totals, peoplePerHour) {
    if (!$('hoursChart')) return;
    const max = Math.max(1, ...totals);
    draw('hoursChart', {
      data: {
        labels: labels.map((h) => String(h).split(' - ')[0].trim()),
        datasets: [
          {
            type: 'bar',
            label: 'Total Pick ในช่วงเวลา',
            data: totals,
            backgroundColor: 'rgba(99,102,241,.85)',
            borderRadius: 6,
            yAxisID: 'y',
            datalabels: {
              display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) >= max * 0.08,
              anchor: 'end',
              align: 'top',
              offset: 4,
              color: '#3730a3',
              backgroundColor: 'rgba(255,255,255,.95)',
              borderColor: 'rgba(99,102,241,.3)',
              borderWidth: 1,
              borderRadius: 4,
              padding: { top: 2, right: 5, bottom: 2, left: 5 },
              font: { weight: '700', size: 10 },
              formatter: (v) => fmt(v)
            }
          },
          {
            type: 'line',
            label: 'พนักงานที่มียอดในช่วงเวลา (คน)',
            data: peoplePerHour,
            borderColor: '#14b8a6',
            backgroundColor: '#fff',
            pointBackgroundColor: '#fff',
            pointBorderColor: '#14b8a6',
            pointBorderWidth: 2,
            pointRadius: 4,
            borderWidth: 2.5,
            tension: 0.3,
            yAxisID: 'y1',
            datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 34, right: 14, bottom: 6, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (c) => labels[c[0].dataIndex],
              label: (ctx) => (ctx.datasetIndex === 0
                ? ` Total Pick: ${fmt(ctx.parsed.y)} ชิ้น`
                : ` พนักงานที่มียอด: ${fmt(ctx.parsed.y)} คน`)
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5 }, autoSkip: true, maxTicksLimit: window.innerWidth < 900 ? 8 : 24 } },
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: (v) => fmt(v) } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: (v) => fmt(v) }, suggestedMax: Math.max(4, ...peoplePerHour) + 2 }
        }
      }
    });
  }

  document.addEventListener('v3-hours-rendered', (e) => {
    const d = e.detail || {};
    renderHoursPageChart(d.labels || [], d.totals || [], d.peoplePerHour || []);
  });

  let scheduled = null;
  function renderAll() {
    if (!rows.length || !window.V3Data || !window.V3Data.current) return;
    const headers = window.V3Data.current.source.sheets['Results Master'].headers;
    const list = visibleRows();
    try {
      renderKpiExtras(list);
      renderMonthNav();
      if ($('tab-trend') && $('tab-trend').classList.contains('active')) renderTrendPage();
      renderTrend(list);
      renderHourly(list, headers);
      renderSystemShare(list);
      renderTypeShare(list);
      renderBuShare(list);
      renderAffiliation(list);
      renderShiftCompare(list);
      renderPickers(list);
    } catch (e) {
      console.error('V3 views:', e);
    }
  }
  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(renderAll, 120);
  }

  window.V3Data.subscribe((value) => {
    rows = value.source.sheets['Results Master'].rows;
    roster = M.rosterMap(value.source.sheets['2ND']);
    schedule();
  });
  document.addEventListener('v3-render', schedule);

  document.querySelectorAll('.nav-item[data-tab="trend"]').forEach((b) => {
    b.addEventListener('click', () => setTimeout(renderTrendPage, 60));
  });

  // กลับเข้าหน้าภาพรวมแล้วต้องวาดกราฟใหม่ ถ้ามีการเปลี่ยนตัวกรองตอนอยู่หน้าอื่น
  // กราฟจะถูกวาดตอนแท็บซ่อนอยู่ ได้ canvas สูง 0 และ Chart.js ไม่วัดใหม่ให้เอง
  document.querySelectorAll('.nav-item[data-tab="overview"]').forEach((b) => {
    b.addEventListener('click', () => setTimeout(renderAll, 70));
  });

  document.querySelectorAll('#seg button[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#seg button[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
      trendMode = b.dataset.mode;
      chartMonth = '';
      renderAll();
    });
  });

  document.querySelectorAll('#pickerCountTog button[data-count]').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#pickerCountTog button[data-count]').forEach((x) => x.classList.toggle('active', x === b));
      pickerTop = Number(b.dataset.count) || 12;
      renderPickers(visibleRows());
    });
  });

  ['startDate', 'endDate'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('change', schedule);
  });
  const apply = $('applyDateButton');
  if (apply) apply.addEventListener('click', schedule);
  document.querySelectorAll('.sysbar .chip[data-range]').forEach((c) => c.addEventListener('click', () => setTimeout(schedule, 200)));
})();
