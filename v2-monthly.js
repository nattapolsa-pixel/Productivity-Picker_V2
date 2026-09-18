/* v2-monthly.js — หน้าแนวโน้มรายเดือน วาดด้วย Chart.js แทนกราฟ SVG เขียนมือของเดิม
   เหตุผลที่รื้อ: ของเดิมวาด SVG เอง ตัวเลขกำกับจุดทับเส้นและทับกันเองจนอ่านไม่ออก
                 และยัดทุกประเภท (สังกัด / ประเภทงาน / BU) ไว้ในกราฟใบเดียวโดยสลับด้วยปุ่ม

   หลักที่ใช้กันตัวเลขทับกัน
     1. การ์ดภาพรวม: ตัวเลขติดเฉพาะเส้น Productivity ไม่ติดบนแท่ง และเว้นที่ด้านบนกราฟไว้ 44px
        พร้อมขอบขาวรอบตัวอักษร (textStrokeColor) ให้อ่านออกแม้ทับเส้น
     2. การ์ดแยกประเภท: รวมสามมุมมองเป็นกราฟเดียว สลับด้วยปุ่ม เพื่อไม่ให้หน้ายาวเกิน
        ตัวเลขวางไว้ในแท่งแต่ละอัน ตั้งตัวอักษรตรง จึงไม่ทับเส้นเป้าและไม่ทับแท่งข้างเคียง
        แท่งที่เตี้ยเกินกว่าจะใส่ตัวเลขได้จะซ่อนไว้ แล้วอ่านจากตารางที่พับเก็บไว้ท้ายการ์ด

   ตัวเลขทุกค่ามาจาก getMonthlyAggregates() ตัวเดิมใน script.js ไม่ได้คิดใหม่
   ค่าเฉลี่ยของเดือน = ผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น รวมครั้งเดียว */
(() => {
  'use strict';
  if (typeof Chart === 'undefined') {
    console.warn('V3 monthly: ไม่พบ Chart.js จึงคงกราฟเดิมไว้');
    return;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
  const fmt1 = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

  // พาเลตเดียวกับหน้าอื่นของ V3
  const SERIES = ['#6366f1', '#14b8a6', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#10b981', '#ec4899', '#a855f7', '#0891b2'];
  const charts = new Map();

  /* โหมดของการ์ดแยกประเภท จำค่าไว้ในเครื่องเหมือนหน้าเทรน */
  const MODE_KEY = 'pickProductivityMonthlyBreakdown:v3';
  const MODES = [
    { key: 'affiliations', label: '👥 สังกัด', unit: 'สังกัด' },
    { key: 'categories', label: '🏷️ ประเภทงาน', unit: 'ประเภทงาน' },
    { key: 'bu', label: '🏢 BU', unit: 'BU' }
  ];
  let mode = (() => {
    try {
      const v = localStorage.getItem(MODE_KEY);
      return MODES.some((m) => m.key === v) ? v : 'affiliations';
    } catch (e) { return 'affiliations'; }
  })();

  function target() {
    return Number(window.TARGETS && window.TARGETS.overall) || 170;
  }

  function destroyAll() {
    charts.forEach((c) => { try { c.destroy(); } catch (e) { /* ถูกทำลายไปแล้ว */ } });
    charts.clear();
  }

  function draw(id, config) {
    const el = $(id);
    if (!el) return;
    const prev = charts.get(id);
    if (prev) { try { prev.destroy(); } catch (e) { /* ข้าม */ } charts.delete(id); }
    const stray = Chart.getChart(el);
    if (stray) stray.destroy();
    charts.set(id, new Chart(el, config));
  }

  /* ── การ์ดที่ 1: ภาพรวมรายเดือน ── */
  function drawOverview(months) {
    const t = target();
    const labels = months.map((m) => m.labelThaiShort || m.monthKey);
    draw('v3MonthlyOverviewChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar', label: 'ยอดหยิบรวมของเดือน', data: months.map((m) => m.totalPick),
            backgroundColor: 'rgba(99,102,241,.75)', hoverBackgroundColor: 'rgba(79,70,229,.95)',
            borderRadius: 8, maxBarThickness: 62, yAxisID: 'y', order: 3,
            datalabels: { display: false }          // ไม่ติดตัวเลขบนแท่ง กันทับกับเส้นและตัวเลขของเส้น
          },
          {
            type: 'line', label: 'ค่าเฉลี่ยต่อชั่วโมงของเดือน', data: months.map((m) => Number(m.average) || 0),
            borderColor: '#f43f5e', backgroundColor: '#fff', borderWidth: 3,
            pointRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: '#f43f5e', pointBorderWidth: 2.5,
            tension: .32, fill: false, yAxisID: 'y1', order: 1,
            datalabels: {
              // ตัวเลขลอยเหนือจุดเสมอ มีขอบขาวรอบตัวอักษร จึงไม่จมกับเส้นหรือแท่ง
              align: 'top', anchor: 'end', offset: 10, clamp: true, clip: false,
              color: '#be123c', font: { size: 11, weight: '700' },
              textStrokeColor: '#fff', textStrokeWidth: 4,
              formatter: (v) => fmt1(v)
            }
          },
          {
            type: 'line', label: 'เป้า ' + fmt(t), data: months.map(() => t),
            borderColor: 'rgba(245,158,11,.95)', borderWidth: 2, borderDash: [7, 5],
            pointRadius: 0, fill: false, yAxisID: 'y1', order: 2,
            datalabels: { display: false }
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        // เว้นที่ด้านบนให้ตัวเลขของเส้นมีที่ยืน ไม่ต้องเบียดกับขอบกราฟ
        layout: { padding: { top: 44, right: 16, bottom: 4, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 9, padding: 16, font: { size: 11.5 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.94)', padding: 12, cornerRadius: 10, displayColors: true,
            callbacks: {
              title: (items) => months[items[0].dataIndex].labelThai || months[items[0].dataIndex].monthKey,
              afterBody: (items) => {
                const m = months[items[0].dataIndex];
                const gap = (Number(m.average) || 0) - t;
                return [
                  fmt(m.activeDays) + ' วันที่มีงาน · ' + fmt(m.transactions) + ' แถวที่นับได้',
                  'เทียบเป้า ' + (gap >= 0 ? '+' : '') + fmt1(gap) + ' หยิบ/ชม.',
                  'เฉลี่ยวันละ ' + fmt(m.activeDays ? m.totalPick / m.activeDays : 0) + ' ชิ้น'
                ];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11.5, weight: '600' } } },
          y: {
            position: 'left', beginAtZero: true, grace: '12%',
            grid: { color: 'rgba(148,163,184,.22)' },
            ticks: { font: { size: 10.5 }, callback: (v) => fmt(v) },
            title: { display: true, text: 'ยอดหยิบ (ชิ้น)', font: { size: 11, weight: '600' } }
          },
          y1: {
            position: 'right', beginAtZero: true, grace: '28%',
            grid: { display: false },
            ticks: { font: { size: 10.5 } },
            title: { display: true, text: 'หยิบ/ชม.', font: { size: 11, weight: '600' } }
          }
        }
      }
    });
  }

  /* ── การ์ดแยกประเภท: กราฟเดียว สลับด้วยปุ่ม ──
     ตัวเลขวางไว้ "ในแท่ง" ตั้งตรง (rotation -90) สีขาวบนพื้นสีของแท่งเอง
     จึงไม่มีทางทับเส้นเป้า ทับแท่งข้างเคียง หรือทับตัวเลขของเดือนอื่น
     แท่งที่เตี้ยเกินกว่าจะใส่ตัวเลขได้จะซ่อนตัวเลขไว้ แล้วให้อ่านจากตารางใต้กราฟแทน */
  function namesOf(months, key) {
    const names = [];
    months.forEach((m) => (m[key] || []).forEach((it) => {
      if (!names.includes(it.name)) names.push(it.name);
    }));
    return names.sort((a, b) => String(a).localeCompare(String(b), 'th'));
  }

  function drawBreakdown(months, key) {
    const names = namesOf(months, key);
    const t = target();
    const all = [];
    months.forEach((m) => (m[key] || []).forEach((it) => all.push(Number(it.average) || 0)));
    const top = Math.max(t, ...(all.length ? all : [t]));
    const minShow = top * 0.16;            // แท่งเตี้ยกว่านี้ใส่ตัวเลขในแท่งไม่พอ
    draw('v3MonthlyBreakdownChart', {
      type: 'bar',
      data: {
        labels: months.map((m) => m.labelThaiShort || m.monthKey),
        datasets: names.map((name, i) => ({
          label: name,
          data: months.map((m) => {
            const hit = (m[key] || []).find((it) => it.name === name);
            return hit ? Number(hit.average) || 0 : null;
          }),
          backgroundColor: SERIES[i % SERIES.length],
          hoverBackgroundColor: SERIES[i % SERIES.length],
          borderRadius: 5,
          maxBarThickness: 40,
          datalabels: {
            // วางในแท่ง ชิดด้านบนของแท่ง ตั้งตัวอักษรให้ตรงเพื่อไม่กินความกว้าง
            anchor: 'end', align: 'start', offset: 6, rotation: -90, clamp: true, clip: true,
            color: '#fff', font: { size: 10, weight: '700' },
            textStrokeColor: 'rgba(15,23,42,.55)', textStrokeWidth: 2.5,
            display: (ctx) => {
              const v = ctx.dataset.data[ctx.dataIndex];
              return typeof v === 'number' && v >= minShow;
            },
            formatter: (v) => fmt1(v)
          }
        })).concat([{
          type: 'line', label: 'เป้า ' + fmt(t), data: months.map(() => t),
          borderColor: 'rgba(245,158,11,.95)', borderWidth: 2, borderDash: [7, 5],
          pointRadius: 0, fill: false, datalabels: { display: false }
        }])
      },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 14, right: 14, bottom: 4, left: 4 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 9, padding: 14, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.94)', padding: 11, cornerRadius: 10,
            callbacks: {
              title: (items) => months[items[0].dataIndex].labelThai || months[items[0].dataIndex].monthKey,
              label: (item) => item.dataset.label + ': ' + (item.raw === null ? 'ไม่มีข้อมูล' : fmt1(item.raw) + ' หยิบ/ชม.')
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
          y: {
            beginAtZero: true, grace: '8%',
            grid: { color: 'rgba(148,163,184,.22)' },
            ticks: { font: { size: 10.5 } },
            title: { display: true, text: 'หยิบ/ชม.', font: { size: 11, weight: '600' } }
          }
        }
      }
    });
    return names;
  }

  /* ตารางค่าใต้กราฟ — เดือนเป็นแถว ประเภทเป็นคอลัมน์ อ่านได้ครบทุกค่าโดยไม่ต้องแย่งที่กับกราฟ */
  function breakdownTable(months, key, names) {
    if (!names.length) return '<div class="staff-miss-ok">ยังไม่มีข้อมูลของประเภทนี้ในช่วงที่มี</div>';
    const t = target();
    const head = '<tr><th>เดือน</th>' + names.map((n) => '<th class="num">' + esc(n) + '</th>').join('') + '<th class="num">เฉลี่ยรวมเดือน</th></tr>';
    const body = [...months].reverse().map((m) => {
      const cells = names.map((n) => {
        const hit = (m[key] || []).find((it) => it.name === n);
        if (!hit) return '<td class="num"><span class="staff-miss-none">—</span></td>';
        const v = Number(hit.average) || 0;
        const color = v >= t ? '#059669' : '#b91c1c';
        return '<td class="num"><b style="color:' + color + '">' + fmt1(v) + '</b>'
          + '<span class="metric-sub">' + fmt(hit.count) + ' แถว</span></td>';
      }).join('');
      const avg = Number(m.average) || 0;
      return '<tr><td><b>' + esc(m.labelThai || m.monthKey) + '</b></td>' + cells
        + '<td class="num"><b>' + fmt1(avg) + '</b>'
        + '<span class="metric-sub">' + (avg >= t ? 'ถึงเป้า' : 'ต่ำกว่าเป้า') + '</span></td></tr>';
    }).join('');
    return '<div class="zone-breakdown-wrap"><table class="zone-breakdown-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  function card(title, sub, canvasId, tall) {
    return '<section class="card wide" style="margin-bottom:18px;">'
      + '<div class="staff-card-head"><div><h3>' + title + '</h3><div class="sub">' + sub + '</div></div></div>'
      + '<div class="chartbox' + (tall ? ' tall' : '') + '"><canvas id="' + canvasId + '"></canvas></div>'
      + '<div data-after="' + canvasId + '"></div></section>';
  }

  function render() {
    const host = $('v3Monthly');
    if (!host) return;
    if (typeof getMonthlyAggregates !== 'function') return;
    const months = getMonthlyAggregates();
    if (!months || !months.length) {
      destroyAll();
      host.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">ยังไม่มีข้อมูลรายเดือน</div></div>';
      return;
    }
    const t = target();
    const withAvg = months.filter((m) => Number(m.average) > 0);
    const best = withAvg.length ? withAvg.reduce((a, b) => (Number(b.average) > Number(a.average) ? b : a)) : null;
    const worst = withAvg.length ? withAvg.reduce((a, b) => (Number(b.average) < Number(a.average) ? b : a)) : null;
    const hit = withAvg.filter((m) => Number(m.average) >= t).length;
    const last = months[months.length - 1];
    const prev = months.length > 1 ? months[months.length - 2] : null;
    const delta = prev ? (Number(last.average) || 0) - (Number(prev.average) || 0) : null;

    destroyAll();
    host.innerHTML =
      '<div class="zone-summary" style="margin-bottom:18px;">'
      + [
        ['เดือนล่าสุด', fmt1(last.average), 'หยิบ/ชม.', esc(last.labelThai || ''), Number(last.average) >= t ? '#16a34a' : '#e11d48'],
        ['เทียบเดือนก่อน', delta === null ? '—' : (delta >= 0 ? '▲ ' : '▼ ') + fmt1(Math.abs(delta)), delta === null ? '' : 'หยิบ/ชม.',
          prev ? 'เทียบกับ ' + esc(prev.labelThai || '') : 'ไม่มีเดือนก่อนให้เทียบ',
          delta === null ? '#64748b' : (delta >= 0 ? '#16a34a' : '#e11d48')],
        ['เดือนที่ดีที่สุด', best ? fmt1(best.average) : '—', 'หยิบ/ชม.', best ? esc(best.labelThai || '') : '', '#7c3aed'],
        ['เดือนที่ต่ำสุด', worst ? fmt1(worst.average) : '—', 'หยิบ/ชม.', worst ? esc(worst.labelThai || '') : '', '#ea580c'],
        ['เดือนที่ถึงเป้า', fmt(hit) + ' / ' + fmt(withAvg.length), 'เดือน', 'เป้า ' + fmt(t) + ' หยิบ/ชม.', hit === withAvg.length ? '#16a34a' : '#0ea5e9']
      ].map(([label, value, unit, detail, color]) =>
        '<div class="zone-stat"><div class="zone-stat-label">' + label + '</div>'
        + '<div class="zone-stat-value" style="color:' + color + '">' + value + (unit ? '<span> ' + unit + '</span>' : '') + '</div>'
        + '<div class="zone-stat-detail">' + detail + '</div></div>').join('')
      + '</div>'
      + card('📊 ภาพรวมทุกเดือน',
        'แท่ง = ยอดหยิบรวมของเดือน (แกนซ้าย) · เส้นแดง = ค่าเฉลี่ยต่อชั่วโมง (แกนขวา) · เส้นประ = เป้า'
        + ' · ตัวเลขติดเฉพาะบนเส้น มีขอบขาวรอบตัวอักษร จึงไม่จมกับเส้นและไม่ทับแท่ง',
        'v3MonthlyOverviewChart', true)
      + '<section class="card wide" style="margin-bottom:18px;">'
        + '<div class="staff-card-head"><div><h3>🔍 เทียบรายเดือนแยกตามประเภท</h3>'
        + '<div class="sub">กดปุ่มเพื่อสลับมุมมอง · ตัวเลขอยู่ในแท่งแต่ละอัน จึงไม่ทับเส้นเป้าและไม่ทับแท่งข้างเคียง'
        + ' · แท่งที่เตี้ยเกินกว่าจะใส่ตัวเลขได้ให้อ่านจากตารางท้ายการ์ด</div></div>'
        + '<div class="seg" id="v3MonthlyModeTog">'
        + MODES.map((m) => '<button type="button" data-mmode="' + m.key + '"'
          + (mode === m.key ? ' class="active"' : '') + '>' + m.label + '</button>').join('')
        + '</div></div>'
        + '<div class="chartbox tall"><canvas id="v3MonthlyBreakdownChart"></canvas></div>'
        + '<details id="v3MonthlyTableWrap" style="margin-top:14px;">'
        + '<summary style="cursor:pointer; font-size:12px; font-weight:700; color:#4f46e5;">ดูตัวเลขทุกค่าเป็นตาราง</summary>'
        + '<div data-after="v3MonthlyBreakdownChart" style="margin-top:10px;"></div></details>'
        + '</section>'
      + '<div class="note v3-notice">ค่าเฉลี่ยของเดือนคือผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น รวมครั้งเดียว'
      + ' ไม่ได้เอาค่าเฉลี่ยรายวันมาเฉลี่ยซ้ำ · สีเขียวในตารางคือถึงเป้า สีแดงคือยังไม่ถึง'
      + ' · หน้านี้กางทุกเดือนที่มีข้อมูล ไม่หุบตามตัวกรองวันที่ด้านบน</div>';

    drawOverview(months);
    paintBreakdown(host, months);

    host.querySelectorAll('#v3MonthlyModeTog button[data-mmode]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.mmode === mode) return;
        mode = b.dataset.mmode;
        try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
        host.querySelectorAll('#v3MonthlyModeTog button[data-mmode]').forEach((x) => {
          x.classList.toggle('active', x.dataset.mmode === mode);
        });
        paintBreakdown(host, months);       // สลับกราฟในที่เดิม ไม่ต้องวาดหน้าใหม่ทั้งหน้า
      });
    });
  }

  function paintBreakdown(host, months) {
    const names = drawBreakdown(months, mode);
    const slot = host.querySelector('[data-after="v3MonthlyBreakdownChart"]');
    if (slot) slot.innerHTML = breakdownTable(months, mode, names);
  }

  function renderIfVisible() {
    const panel = $('tab-monthly');
    if (!panel || !panel.classList.contains('active')) return;
    try { render(); } catch (e) { console.error('V3 monthly:', e); }
  }

  let scheduled = null;
  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(renderIfVisible, 140);
  }

  if (window.V3Data && window.V3Data.subscribe) window.V3Data.subscribe(schedule);
  document.addEventListener('v3-render', schedule);
  // หน่วงให้ v2-shell.js ใส่คลาส active ก่อน ไม่งั้นกราฟถูกวาดตอนแท็บซ่อนแล้วได้ canvas สูง 0
  document.querySelectorAll('.nav-item[data-tab="monthly"]').forEach((b) => {
    b.addEventListener('click', () => setTimeout(renderIfVisible, 70));
  });
})();
