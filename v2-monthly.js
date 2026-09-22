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
  /* ค่า Pick/Hr แสดงเป็นจำนวนเต็ม ปัด .5 ขี้น ตามที่ผู้ใช้สั่ง 21/09/2569
     ปัดตอนแสดงผลเท่านั้น เกณฑ์สีและการตัดสินผ่าน/ไม่ผ่านยังคิดจากค่าไม่ปัดตามกฎเดิม
     fmt1 คงไว้สำหรับ % และชั่วโมงที่ยังต้องการทสนิยม */
  const prod = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }));

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

  /* มุมมอง: แยกกราฟย่อยประเภทละใบ (ตั้งต้น) หรือรวมทุกประเภทในกราฟเดียว
     ตั้งต้นเป็นแบบแยก เพราะกราฟเดียวที่แบกทุกประเภทพร้อมกันมีตัวเลขเยอะจนอ่านยาก */
  const VIEW_KEY = 'pickProductivityMonthlyView:v3';
  let view = (() => {
    try { return localStorage.getItem(VIEW_KEY) === 'combined' ? 'combined' : 'split'; }
    catch (e) { return 'split'; }
  })();

  /* วาดเส้นเป้าและเส้นค่าเฉลี่ยรวมเองหลังแท่งวาดเสร็จ เพื่อให้เส้นอยู่บนแท่งแน่นอน
     (Chart.js วาดชุดข้อมูลย้อนลำดับ order จึงคุมยาก ปลั๊กอินนี้ตัดปัญหาไปเลย) */
  const OVERLAY = {
    id: 'v3MonthlyOverlay',
    afterDatasetsDraw(chart) {
      const o = chart.options.plugins && chart.options.plugins.v3MonthlyOverlay;
      if (!o) return;
      const ctx = chart.ctx;
      const xs = chart.scales.x;
      const ys = chart.scales[o.axis || 'y'];
      if (!ctx || !xs || !ys) return;
      ctx.save();
      if (o.target !== null && o.target !== undefined) {
        const y = ys.getPixelForValue(o.target);
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(245,158,11,.95)';
        ctx.beginPath();
        ctx.moveTo(xs.left, y);
        ctx.lineTo(xs.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const pts = [];
      (o.values || []).forEach((v, i) => {
        if (v === null || v === undefined || !Number.isFinite(Number(v))) return;
        pts.push({ x: xs.getPixelForValue(i), y: ys.getPixelForValue(Number(v)) });
      });
      if (pts.length) {
        ctx.lineWidth = o.width || 3.5;
        ctx.strokeStyle = o.color || '#f43f5e';
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        pts.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, o.point || 5.5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.lineWidth = o.pointWidth || 3;
          ctx.strokeStyle = o.color || '#f43f5e';
          ctx.stroke();
        });
      }
      ctx.restore();
    }
  };

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
            borderRadius: 8, maxBarThickness: 62, yAxisID: 'y', order: 1,   // แท่งวาดก่อน เส้นจะได้ทับบนแท่ง
            datalabels: {
              // ป้ายยอดหยิบวางที่ "โคนแท่ง" ไม่ใช่ยอดแท่ง
              // เพราะแกนซ้าย (ยอดหยิบ) กับแกนขวา (ค่าเฉลี่ย) บรรจบกันแถวยอดแท่งพอดี
              // เส้นแดงจึงวิ่งผ่านป้ายที่ยอดแท่งทุกเดือน ย้ายลงโคนแท่งแล้วไม่มีทางชนกันอีก
              anchor: 'start', align: 'end', offset: 8, clamp: true, clip: true,
              color: '#fff', font: { size: 12, weight: '800' },
              backgroundColor: 'rgba(30,41,59,.82)', borderRadius: 6,
              padding: { top: 3, bottom: 3, left: 6, right: 6 },
              display: (ctx) => {
                const arr = ctx.dataset.data;
                const v = arr[ctx.dataIndex];
                const top = Math.max(...arr.map((x) => Number(x) || 0));
                return typeof v === 'number' && top > 0 && v >= top * 0.12;
              },
              formatter: (v) => fmt(v)
            }
          },
          {
            type: 'line', label: 'ค่าเฉลี่ยต่อชั่วโมงของเดือน', data: months.map((m) => Number(m.average) || 0),
            borderColor: '#f43f5e', backgroundColor: '#fff',
            borderWidth: 0, pointRadius: 0, showLine: false,   // ปลั๊กอิน OVERLAY วาดเส้นจริงทับบนแท่ง
            tension: .32, fill: false, yAxisID: 'y1', order: 3,   // เส้นค่าเฉลี่ยวาดท้ายสุด อยู่บนสุด
            datalabels: {
              // ตัวเลขลอยเหนือจุดเสมอ มีขอบขาวรอบตัวอักษร จึงไม่จมกับเส้นหรือแท่ง
              align: 'top', anchor: 'end', offset: 11, clamp: true, clip: false,
              color: '#be123c', font: { size: 13, weight: '800' },
              textStrokeColor: '#fff', textStrokeWidth: 5,
              formatter: (v) => prod(v)
            }
          },
          {
            type: 'line', label: 'เป้า ' + fmt(t), data: months.map(() => t),
            borderColor: 'rgba(245,158,11,.95)', borderWidth: 2, borderDash: [7, 5],
            pointRadius: 0, fill: false, yAxisID: 'y1', order: 2,   // เส้นเป้าอยู่เหนือแท่งแต่ใต้เส้นค่าเฉลี่ย
            datalabels: { display: false }
          }
        ]
      },
      plugins: [OVERLAY],
      options: {
        maintainAspectRatio: false,
        // เว้นที่ด้านบนให้ตัวเลขของเส้นมีที่ยืน ไม่ต้องเบียดกับขอบกราฟ
        layout: { padding: { top: 44, right: 16, bottom: 4, left: 4 } },
        plugins: {
          v3MonthlyOverlay: {
            axis: 'y1', target: t, color: '#f43f5e', width: 3.5, point: 5.5, pointWidth: 3,
            values: months.map((m) => Number(m.average) || 0)
          },
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
                  'เทียบเป้า ' + (gap >= 0 ? '+' : '') + prod(gap) + ' หยิบ/ชม.',
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
          order: 1,                         // แท่งวาดก่อนเส้น
          // มุมมองรวมไม่ใส่ป้ายในแท่ง เพราะป้ายสองชั้นในกรอบเดียวชนกันแน่
          // เมื่อค่าเฉลี่ยรวมของเดือนใกล้ยอดแท่ง (เคยเจอ 133.3 ของเส้นชนกับ 156 ของแท่ง)
          // ตัวเลขรายประเภทอ่านได้ที่มุมมอง "แยกทีละประเภท" ที่ตารางท้ายการ์ด และที่ tooltip
          datalabels: { display: false }
        })).concat([
          {
            // เส้นค่าเฉลี่ยรวมของเดือน ให้เห็นแนวโน้มทั้งเดือนคู่กับแท่งรายประเภท
            type: 'line', label: 'ค่าเฉลี่ยรวมของเดือน',
            data: months.map((m) => Number(m.average) || 0),
            borderColor: '#f43f5e', backgroundColor: '#fff',
            borderWidth: 0, pointRadius: 0, showLine: false,   // ปลั๊กอิน OVERLAY วาดเส้นจริงทับบนแท่ง
            tension: .3, fill: false, order: 3,   // ทับบนแท่ง
            datalabels: {
              // ชิปพื้นขาวขอบแดง อ่านออกแม้พาดอยู่บนแท่งสีเข้ม และเป็นป้ายชั้นเดียวในกราฟนี้
              align: 'top', anchor: 'end', offset: 12, clamp: true, clip: false,
              color: '#be123c', font: { size: 13, weight: '800' },
              backgroundColor: 'rgba(255,255,255,.94)', borderColor: '#f43f5e',
              borderWidth: 1.5, borderRadius: 8,
              padding: { top: 3, bottom: 3, left: 7, right: 7 },
              formatter: (v) => prod(v)
            }
          },
          {
            type: 'line', label: 'เป้า ' + fmt(t), data: months.map(() => t),
            borderColor: 'rgba(245,158,11,.95)', borderWidth: 2, borderDash: [7, 5],
            pointRadius: 0, fill: false, order: 2, datalabels: { display: false }
          }
        ])
      },
      plugins: [OVERLAY],
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 40, right: 16, bottom: 4, left: 4 } },
        plugins: {
          v3MonthlyOverlay: {
            axis: 'y', target: t, color: '#f43f5e', width: 3.5, point: 5.5, pointWidth: 3,
            values: months.map((m) => Number(m.average) || 0)
          },
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 9, padding: 14, font: { size: 11.5 } } },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.94)', padding: 11, cornerRadius: 10,
            callbacks: {
              title: (items) => months[items[0].dataIndex].labelThai || months[items[0].dataIndex].monthKey,
              label: (item) => item.dataset.label + ': ' + (item.raw === null ? 'ไม่มีข้อมูล' : prod(item.raw) + ' หยิบ/ชม.')
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' } } },
          y: {
            beginAtZero: true, grace: '18%',
            grid: { color: 'rgba(148,163,184,.22)' },
            ticks: { font: { size: 11 } },
            title: { display: true, text: 'หยิบ/ชม.', font: { size: 11, weight: '600' } }
          }
        }
      }
    });
    return names;
  }

  /* ── กราฟย่อยประเภทละใบ ──
     แต่ละใบมีตัวเลขแค่ชุดเดียว (แท่งของประเภทนั้น) จึงอ่านออกชัดและเทียบรูปทรงกันได้ง่าย
     เส้นแดงบางคือค่าเฉลี่ยรวมของเดือน ไว้ดูว่าประเภทนี้อยู่เหนือหรือใต้ค่าเฉลี่ยรวม (ไม่ติดตัวเลข กันรกตา) */
  function drawSmall(canvasId, months, key, name, color) {
    const t = target();
    const series = months.map((m) => {
      const hit = (m[key] || []).find((it) => it.name === name);
      return hit ? Number(hit.average) || 0 : null;
    });
    const top = Math.max(t, ...series.map((v) => Number(v) || 0));
    draw(canvasId, {
      type: 'bar',
      data: {
        labels: months.map((m) => m.labelThaiShort || m.monthKey),
        datasets: [
          {
            type: 'bar', label: name, data: series,
            backgroundColor: series.map((v) => (v === null ? 'rgba(148,163,184,.25)' : (v >= t ? color : 'rgba(244,63,94,.55)'))),
            borderRadius: 6, maxBarThickness: 46, order: 1,   // แท่งวาดก่อน เส้นจะได้ทับบนแท่ง
            datalabels: {
              // ป้ายวางที่โคนแท่ง เพราะเส้นค่าเฉลี่ยรวมใช้แกนเดียวกับแท่ง
              // ถ้าวางที่ยอดแท่งจะชนเส้นทุกครั้งที่ค่าของประเภทนี้ใกล้ค่าเฉลี่ยรวม
              anchor: 'start', align: 'end', offset: 8, clamp: true, clip: true,
              color: '#fff', font: { size: 13, weight: '800' },
              backgroundColor: 'rgba(15,23,42,.82)', borderRadius: 6,
              padding: { top: 3, bottom: 3, left: 6, right: 6 },
              display: (ctx) => {
                const v = ctx.dataset.data[ctx.dataIndex];
                return typeof v === 'number' && top > 0 && v >= top * 0.12;
              },
              formatter: (v) => fmt(v)
            }
          },
          {
            type: 'line', label: 'ค่าเฉลี่ยรวมของเดือน', data: months.map((m) => Number(m.average) || 0),
            borderColor: '#f43f5e',
            borderWidth: 0, pointRadius: 0, showLine: false,   // ปลั๊กอิน OVERLAY วาดเส้นจริงทับบนแท่ง
            tension: .3, fill: false, order: 3, datalabels: { display: false }   // เส้นค่าเฉลี่ยอยู่บนสุด
          },
          {
            type: 'line', label: 'เป้า ' + fmt(t), data: months.map(() => t),
            borderColor: 'rgba(245,158,11,.9)', borderWidth: 2, borderDash: [6, 4],
            pointRadius: 0, fill: false, order: 2, datalabels: { display: false }
          }
        ]
      },
      plugins: [OVERLAY],
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 16, right: 10, bottom: 2, left: 2 } },
        plugins: {
          v3MonthlyOverlay: {
            axis: 'y', target: t, color: '#f43f5e', width: 2.5, point: 3.5, pointWidth: 2,
            values: months.map((m) => Number(m.average) || 0)
          },
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.94)', padding: 10, cornerRadius: 9,
            callbacks: {
              title: (items) => months[items[0].dataIndex].labelThai || months[items[0].dataIndex].monthKey,
              label: (item) => item.dataset.label + ': ' + (item.raw === null ? 'ไม่มีข้อมูล' : prod(item.raw) + ' หยิบ/ชม.')
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10.5, weight: '600' } } },
          y: { beginAtZero: true, grace: '14%', grid: { color: 'rgba(148,163,184,.2)' }, ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  /* หัวการ์ดของกราฟย่อย บอกค่าเฉลี่ยรวมของประเภทนั้นและจำนวนเดือนที่ถึงเป้า */
  function smallHead(months, key, name, color, idx) {
    const t = target();
    let sum = 0, count = 0, hit = 0, has = 0;
    months.forEach((m) => {
      const it = (m[key] || []).find((x) => x.name === name);
      if (!it) return;
      const c = Number(it.count) || 0;
      sum += (Number(it.rawAverage) || Number(it.average) || 0) * c;
      count += c;
      has += 1;
      if ((Number(it.average) || 0) >= t) hit += 1;
    });
    const avg = count ? sum / count : null;
    const pillClass = avg !== null && avg >= t ? 'good' : 'warn';
    return '<div class="staff-card-head" style="margin-bottom:8px;">'
      + '<div><h3 style="font-size:14px; display:flex; align-items:center; gap:8px;">'
      + '<span style="width:12px; height:12px; border-radius:4px; background:' + color + '; flex-shrink:0;"></span>'
      + esc(name) + '</h3>'
      + '<div class="sub">เฉลี่ยรวม ' + (avg === null ? '—' : prod(avg)) + ' หยิบ/ชม. · ถึงเป้า ' + fmt(hit) + ' / ' + fmt(has) + ' เดือน</div></div>'
      + '<span class="v3-pill ' + pillClass + '">' + (avg === null ? 'ไม่มีข้อมูล' : (avg >= t ? 'ถึงเป้า' : 'ต่ำกว่าเป้า ' + prod(t - avg))) + '</span></div>';
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
        return '<td class="num"><b style="color:' + color + '">' + prod(v) + '</b>'
          + '<span class="metric-sub">' + fmt(hit.count) + ' แถว</span></td>';
      }).join('');
      const avg = Number(m.average) || 0;
      return '<tr><td><b>' + esc(m.labelThai || m.monthKey) + '</b></td>' + cells
        + '<td class="num"><b>' + prod(avg) + '</b>'
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
        ['เดือนล่าสุด', prod(last.average), 'หยิบ/ชม.', esc(last.labelThai || ''), Number(last.average) >= t ? '#16a34a' : '#e11d48'],
        ['เทียบเดือนก่อน', delta === null ? '—' : (delta >= 0 ? '▲ ' : '▼ ') + prod(Math.abs(delta)), delta === null ? '' : 'หยิบ/ชม.',
          prev ? 'เทียบกับ ' + esc(prev.labelThai || '') : 'ไม่มีเดือนก่อนให้เทียบ',
          delta === null ? '#64748b' : (delta >= 0 ? '#16a34a' : '#e11d48')],
        ['เดือนที่ดีที่สุด', best ? prod(best.average) : '—', 'หยิบ/ชม.', best ? esc(best.labelThai || '') : '', '#7c3aed'],
        ['เดือนที่ต่ำสุด', worst ? prod(worst.average) : '—', 'หยิบ/ชม.', worst ? esc(worst.labelThai || '') : '', '#ea580c'],
        ['เดือนที่ถึงเป้า', fmt(hit) + ' / ' + fmt(withAvg.length), 'เดือน', 'เป้า ' + fmt(t) + ' หยิบ/ชม.', hit === withAvg.length ? '#16a34a' : '#0ea5e9']
      ].map(([label, value, unit, detail, color]) =>
        '<div class="zone-stat"><div class="zone-stat-label">' + label + '</div>'
        + '<div class="zone-stat-value" style="color:' + color + '">' + value + (unit ? '<span> ' + unit + '</span>' : '') + '</div>'
        + '<div class="zone-stat-detail">' + detail + '</div></div>').join('')
      + '</div>'
      + card('📊 ภาพรวมทุกเดือน',
        'แท่ง = ยอดหยิบรวมของเดือน (แกนซ้าย) · เส้นแดง = ค่าเฉลี่ยต่อชั่วโมง (แกนขวา) · เส้นประ = เป้า'
        + ' · ตัวเลขของเส้นอยู่ด้านบน ส่วนยอดหยิบเป็นป้ายที่โคนแท่ง จึงอยู่คนละระดับ ไม่ทับกัน',
        'v3MonthlyOverviewChart', true)
      + '<section class="card wide" style="margin-bottom:18px;">'
        + '<div class="staff-card-head"><div><h3>🔍 เทียบรายเดือนทีละประเภท</h3>'
        + '<div class="sub">เลือกว่าจะดูแยกทีละประเภทหรือรวมในกราฟเดียว'
        + ' · <b>แยกทีละประเภท</b> มีตัวเลขในแท่งของประเภทนั้น · <b>รวมในกราฟเดียว</b> มีเฉพาะตัวเลขของเส้น'
        + ' เพื่อไม่ให้ป้ายสองชั้นชนกัน (ตัวเลขรายประเภทดูที่ตารางท้ายการ์ดหรือชี้ที่แท่ง)'
        + ' · เส้นแดง = ค่าเฉลี่ยรวมของเดือน วาดทับบนแท่ง · เส้นประส้ม = เป้า</div></div>'
        + '<div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">'
        + '<div class="seg" id="v3MonthlyModeTog">'
        + MODES.map((m) => '<button type="button" data-mmode="' + m.key + '"'
          + (mode === m.key ? ' class="active"' : '') + '>' + m.label + '</button>').join('')
        + '</div>'
        + '<div class="seg" id="v3MonthlyViewTog">'
        + '<button type="button" data-mview="split"' + (view === 'split' ? ' class="active"' : '') + '>🔎 แยกทีละประเภท</button>'
        + '<button type="button" data-mview="combined"' + (view === 'combined' ? ' class="active"' : '') + '>📊 รวมในกราฟเดียว</button>'
        + '</div></div></div>'
        + '<div id="v3MonthlyBreakdownArea"></div>'
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

    host.querySelectorAll('#v3MonthlyViewTog button[data-mview]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.mview === view) return;
        view = b.dataset.mview;
        try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
        host.querySelectorAll('#v3MonthlyViewTog button[data-mview]').forEach((x) => {
          x.classList.toggle('active', x.dataset.mview === view);
        });
        paintBreakdown(host, months);
      });
    });
  }

  /* กราฟของการ์ดนี้ถูกสร้าง-ทำลายบ่อยตอนสลับมุมมอง จึงจดชื่อไว้เพื่อเก็บให้หมด */
  const breakdownIds = [];
  function destroyBreakdownCharts() {
    breakdownIds.forEach((id) => {
      const c = charts.get(id);
      if (c) { try { c.destroy(); } catch (e) { /* ข้าม */ } charts.delete(id); }
    });
    breakdownIds.length = 0;
  }

  function paintBreakdown(host, months) {
    const area = $('v3MonthlyBreakdownArea');
    if (!area) return;
    destroyBreakdownCharts();
    const names = namesOf(months, mode);
    if (!names.length) {
      area.innerHTML = '<div class="staff-miss-ok">ยังไม่มีข้อมูลของประเภทนี้</div>';
    } else if (view === 'combined') {
      area.innerHTML = '<div class="chartbox tall" style="height:440px;"><canvas id="v3MonthlyBreakdownChart"></canvas></div>';
      drawBreakdown(months, mode);
      breakdownIds.push('v3MonthlyBreakdownChart');
    } else {
      // แยกกราฟย่อยประเภทละใบ สองใบต่อแถวบนจอกว้าง ใบเดียวต่อแถวบนมือถือ
      area.innerHTML = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(330px, 1fr)); gap:14px;">'
        + names.map((name, i) =>
          '<div style="border:1px solid #e2e8f0; border-radius:14px; padding:12px 14px; background:#fff;">'
          + smallHead(months, mode, name, SERIES[i % SERIES.length], i)
          + '<div class="chartbox" style="height:230px;"><canvas id="v3MonthlySmall' + i + '"></canvas></div>'
          + '</div>').join('')
        + '</div>';
      names.forEach((name, i) => {
        drawSmall('v3MonthlySmall' + i, months, mode, name, SERIES[i % SERIES.length]);
        breakdownIds.push('v3MonthlySmall' + i);
      });
    }
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
