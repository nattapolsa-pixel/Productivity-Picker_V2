/* v2-individual.js — หน้า "เจาะลึกรายบุคคล"
   ลอกลำดับองค์ประกอบมาจากหน้า individual ของ V2
     renderIndividualPage (app.js:6391) · individualCompareHtml (app.js:6421)
     individualScorecardHtml (app.js:6542) · drawIndividualTrendChart (app.js:6668)
   แต่คิดเลขใหม่ด้วยข้อมูลและสูตรของ V1 ทั้งหมด

   ── สูตรที่ใช้ (ห้ามเปลี่ยน) ─────────────────────────────────────────────
   Productivity ของคนหนึ่งคน = ผลรวมคอลัมน์ AF (ดัชนี 31) ของแถวที่ AF > 0
                               ÷ จำนวนแถวนั้น   ← รวม sum/count ครั้งเดียว
                               ไม่ใช่การเอาค่าเฉลี่ยรายวันมาเฉลี่ยซ้ำ
   Total Pick ของคนหนึ่งคน    = ผลรวมคอลัมน์ E (ดัชนี 4) ของทุกแถวที่มีวันที่
                               รวมแถวที่ AF เขียนว่า Not Count ด้วย
   ชั่วโมง                    = ผลรวมคอลัมน์ G (ดัชนี 6) ตามที่ Sheet บันทึก
                               ไม่ลบ 7 ชั่วโมง ไม่คิด Active Hours ใหม่
   ผ่าน/ไม่ผ่าน               = ค่าเฉลี่ย >= Target ของโซน ถือว่าผ่าน
                               (เท่ากับเป้านับว่าผ่าน · ไม่ถึงเป้า = น้อยกว่าเป้า)
   คนที่ไม่มีแถวเข้าเฉลี่ยเลย (count = 0) ไม่ตัดสินผ่าน/ไม่ผ่าน แต่ยังแสดงในตาราง
   โซนหลักของคน               = โซนที่มีแถวเข้าเฉลี่ยมากที่สุด ตอนเสมอเทียบ zone.key
                               (ฟังก์ชัน mainZoneStat · กฎเดียวกับ insights.js ของหน้า "ไม่ถึงเป้า")
   Target ที่ใช้เทียบ          = ภาพรวมรายคน (การ์ด Productivity/% Eff และตารางเทียบทุกคน) ใช้ Target ของโซนหลัก
                               รายวันและรายแถว (การ์ด "วันที่ถึงเป้าโซน" · ตารางรายวัน · เส้นประบนกราฟเทรน)
                               ใช้ Target ของโซนที่ทำในวันนั้น/แถวนั้น — เกณฑ์เดียวกันทั้งสามที่
                               กอง Not Found (คอลัมน์ AH ไม่ตรงกฎโซนของ V1) ใช้ TARGETS.overall และบอกไว้ในโน้ต
   วันที่ยึดคอลัมน์ C ตรง ๆ ไม่ย้ายยอดหลังเที่ยงคืน และไม่ใช้สูตร UOM ของ V2

   ── ของ V2 ที่ตัดออกเพราะไม่มีข้อมูล (อธิบายให้ผู้ใช้เห็นในโน้ตใต้การ์ดด้วย) ──
   Lines / pcs / SKU / ชื่อสินค้า / Owner / Location ระดับช่อง  → ไม่มีในต้นทาง
   OT รายชั่วโมง และเวลาเริ่ม-จบระดับนาที                      → ใช้ช่วงชั่วโมงจาก H–AE แทน
   Active Hours และเกณฑ์ "Active > 3 ชม. · Prod < 1000"        → ใช้เกณฑ์ที่ใช้ คือ AF > 0
   blendedTarget (Target ผสมตามสัดส่วนโซน)                     → ภาพรวมรายคนใช้ Target ของโซนหลัก
                                                                 รายวัน/รายแถวใช้ Target ของโซนในวันนั้น (ไม่ผสมสัดส่วน)
   โซนที่หยิบจริงรายรายการ (โซนประจำ / ไปช่วย)                 → คอลัมน์ AH เป็นโซนสังกัด 1 แถวต่อคนต่อวัน
                                                                 จึงเทียบกับ Zone ในทะเบียนพนักงาน คอลัมน์ J แทน

   ── ของที่ V3 ทำได้แต่ V2 ทำไม่ได้ ─────────────────────────────────────
   กราฟรูปแบบการทำงานรายชั่วโมงของคนนั้น จากคอลัมน์ H–AE (24 ช่อง)
   V2 ไม่มียอดรายชั่วโมงแยกรายคน จึงทำหน้านี้ไม่ได้ */
(() => {
  'use strict';

  const M = window.V3Metrics;
  const $ = (id) => document.getElementById(id);
  const HOST = 'v3Individual';
  const PANEL = 'tab-individual';

  /* V3Shared มาจาก insights.js ซึ่งโหลดก่อนไฟล์นี้ แต่อ่านแบบ lazy ไว้กันลำดับสลับ */
  const S = () => window.V3Shared;
  const esc = (v) => (S() ? S().esc(v) : String(v ?? ''));
  const fmt = (v, d = 0) => (S() ? S().fmt(v, d) : String(v ?? ''));
  const signed = (v, d = 1) => (v === null || v === undefined ? '—' : (Number(v) >= 0 ? '+' : '') + fmt(v, d));
  const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank));
  const UNKNOWN_ZONE = { key: 'unknown', label: 'Not Found', group: '' };

  /* สถานะของหน้า — โหมดเทียบทุกคน (selected ว่าง) หรือ Scorecard รายคน */
  let selected = '';
  let chartSide = 'top';   // กราฟเทียบ: 20 คนบนสุด หรือ 20 คนล่างสุด
  let trendDays = 90;      // หน้าต่างกราฟเทรนรายวัน (0 = ทั้งช่วง)

  /* ── ตัวช่วยวาดกราฟ: ต้องทำลายกราฟเดิมก่อน ไม่งั้น canvas เดิมค้าง ── */
  function draw(id, config) {
    const el = $(id);
    if (!el || typeof Chart === 'undefined') return;
    const old = Chart.getChart(id);
    if (old) old.destroy();
    new Chart(el, config);
  }

  /* Remark แดงสำหรับคนที่ออกแล้ว — แยกว่ามาจากชีต Resigned หรือ Operation กรอกในเว็บ */
  function resignedInfo(id, resignedMap) {
    const sheet = resignedMap.get(id) || null;
    if (sheet) return sheet;
    return (window.V3RosterWrite && window.V3RosterWrite.resignedDraft)
      ? window.V3RosterWrite.resignedDraft(id) : null;
  }
  function resignedBadge(info) {
    if (!info) return '';
    const web = info.source === 'web';
    const when = info.date ? dmy(info.date) : 'ไม่ทราบวันที่';
    return `<span class="staff-resigned${web ? ' is-web' : ''}" title="${web ? 'กรอกในเว็บ ยังไม่ได้ใส่ในรายชื่อที่ลาออก' : 'อยู่ในรายชื่อที่ลาออก'}">`
      + `⛔ ออกแล้ว ${esc(when)}${web ? ' · กรอกในเว็บ' : ''}</span>`;
  }

  /* เหตุผลที่แถวนั้นไม่เข้าค่าเฉลี่ย — อ่านค่าดิบในคอลัมน์ AF ไม่เดา */
  function excludeReason(row) {
    const raw = String(row[31] ?? '').trim();
    if (!raw) return 'ไม่มีค่าเฉลี่ย/ชม. ในแถวนี้';
    if (/^not\s?count$/i.test(raw)) return 'ต้นทางเขียนว่า Not Count';
    const n = M.number(row[31]);
    if (n === 0) return 'ค่าเฉลี่ย/ชม. เป็น 0';
    if (n < 0) return 'ค่าเฉลี่ย/ชม. ติดลบ (' + raw + ')';
    return '';
  }

  /* ── โซนหลักจากตาราง zoneStat (คีย์ = zone.key · ค่า = { zone, rows, count }) ──
     ใช้กฎเดียวกับหน้า "ไม่ถึงเป้า" (insights.js buildBelowTarget)
       แถวเข้าเฉลี่ย (AF > 0) มาก → น้อย  แล้วตอนเสมอเทียบด้วย zone.key
     เดิมไฟล์นี้ตอนเสมอเทียบจำนวนแถวทั้งหมดแล้วเทียบ zone.label ซึ่งให้คนละคำตอบกับ
     หน้า "ไม่ถึงเป้า" ได้ถ้าข้อมูลเปลี่ยนจนมีคนที่สองโซนเข้าเฉลี่ยเท่ากัน
     ถ้าไม่มีแถวเข้าเฉลี่ยเลย จึงถอยไปใช้โซนที่มีแถวมากที่สุด เพื่อยังบอกได้ว่าเขาทำงานที่ไหน
     (กรณีนี้หน้า "ไม่ถึงเป้า" ตัดคนออกไปแล้ว จึงไม่มีตัวเลขของสองหน้าให้ขัดกัน)
     ฟังก์ชันเดียวนี้ใช้ทั้งโซนหลักรายคนและโซนของแต่ละวันใน Scorecard */
  function mainZoneStat(zoneStat) {
    const byKey = (a, b) => String(a.zone.key).localeCompare(String(b.zone.key));
    const all = [...zoneStat.values()];
    const withCount = all.filter((z) => z.count > 0);
    const pick = withCount.length
      ? withCount.sort((a, b) => (b.count - a.count) || byKey(a, b))[0]
      : all.sort((a, b) => (b.rows - a.rows) || byKey(a, b))[0];
    return pick || { zone: UNKNOWN_ZONE, count: 0, rows: 0 };
  }

  /* ══════════════════════════════════════════════════════════════════════
     รวมยอดรายคนจากแถวต้นทาง — ใช้ชุดข้อมูลเดียวกับทุกหน้า (V3Shared.visible())
     ซึ่งกรองวันที่ + ระบบ + กะ ให้แล้ว
     ══════════════════════════════════════════════════════════════════════ */
  function build() {
    const Sh = S();
    const data = Sh.visible();
    const roster = Sh.roster;
    const sheets = Sh.source.sheets;
    const resignedMap = M.resignedMap(sheets['Resigned']);
    const startMap = M.startDateMap(sheets);
    const seenMap = M.firstSeenMap(Sh.rows);
    const hourLabels = M.hourLabels(sheets['Results Master'].headers);

    let anchor = '';                                  // วันล่าสุดที่มีข้อมูลในช่วงที่เลือก (ใช้คิดอายุงาน)
    const people = new Map();
    data.forEach((r) => {
      const id = M.userId(r);
      if (!id) return;                                // ไม่มี User ID เจาะรายคนไม่ได้ (ไปดูที่หน้าตรวจข้อมูล)
      const d = M.date(r[2]);
      if (d > anchor) anchor = d;
      let p = people.get(id);
      if (!p) {
        p = {
          id, name: M.personName(r, roster), nick: M.personNickname(r, roster),
          master: roster.get(id) || null, rows: [], days: new Set(),
          sum: 0, count: 0, total: 0, hours: 0,
          zoneStat: new Map(), shifts: new Map(),
          hourly: new Array(24).fill(0), lastDate: ''
        };
        people.set(id, p);
      }
      p.rows.push(r);
      p.total += M.number(r[4]);                      // Total Pick = คอลัมน์ E ทุกแถวที่มีวันที่
      p.hours += M.number(r[6]);                      // ชั่วโมงตามคอลัมน์ G
      if (d) { p.days.add(d); if (d > p.lastDate) p.lastDate = d; }
      const values = M.hourValues(r);                 // H–AE 24 ช่อง
      for (let i = 0; i < 24; i++) p.hourly[i] += values[i];
      const sk = M.shiftKey(r);
      p.shifts.set(sk, (p.shifts.get(sk) || 0) + 1);

      const z = Sh.zone(r) || UNKNOWN_ZONE;
      let zs = p.zoneStat.get(z.key);
      if (!zs) { zs = { zone: z, total: 0, rows: 0, sum: 0, count: 0 }; p.zoneStat.set(z.key, zs); }
      zs.total += M.number(r[4]);
      zs.rows += 1;

      const af = M.number(r[31]);
      if (af > 0) {                                   // เข้าเฉลี่ยเฉพาะ AF > 0 
        p.sum += af; p.count += 1;
        zs.sum += af; zs.count += 1;
      }
    });

    const list = [];
    people.forEach((p) => {
      const main = mainZoneStat(p.zoneStat);     // โซนหลัก = กฎเดียวกับหน้า "ไม่ถึงเป้า"
      const zone = main.zone || UNKNOWN_ZONE;
      const target = S().zoneTargetOf(zone);
      const average = p.count ? p.sum / p.count : null;
      const shift = [...p.shifts.entries()].sort((a, b) => b[1] - a[1])[0];
      const startDate = M.tenureStart(p.id, startMap, seenMap);
      list.push({
        ...p,
        zone, zoneRowCount: main.count, zoneCount: p.zoneStat.size,
        target, average,
        counted: p.count > 0,
        gap: average === null ? null : average - target,
        eff: average === null ? null : (target > 0 ? average / target * 100 : 0),
        below: average !== null && average < target,          // เท่ากับเป้านับว่าผ่าน
        workDays: p.days.size,
        shift: shift ? shift[0] : 'Not Found',
        startDate,
        tenure: M.daysBetween(startDate, anchor),
        resigned: resignedInfo(p.id, resignedMap)
      });
    });

    /* อันดับใช้ % Efficiency มาก→น้อย แล้ว Total Pick มาก→น้อย เหมือน V2
       คนที่ไม่มีแถวเข้าเฉลี่ยไม่ได้อันดับ (rank = null) */
    const counted = list.filter((x) => x.counted).sort((a, b) => (b.eff - a.eff) || (b.total - a.total));
    counted.forEach((x, i) => { x.rank = i + 1; });
    list.filter((x) => !x.counted).forEach((x) => { x.rank = null; });

    const group = M.aggregate(data);                  // ค่าเฉลี่ยกลุ่มครั้งเดียว
    return { data, list, counted, group, anchor, hourLabels, roster };
  }

  /* เปอร์เซ็นไทล์ = จำนวนคนที่ค่านั้นน้อยกว่าเขา ÷ จำนวนคนในกลุ่มที่เทียบ × 100
     แยกสองมุมเพราะให้คำตอบต่างกันได้จริง
       ตาม Productivity ดิบ (หยิบ/ชม.) — เทียบตัวเลขเปล่า ๆ ไม่สนว่าโซนไหนเป้าสูงกว่า
       ตาม % Efficiency        — เทียบว่าเข้าใกล้ Target ของโซนตัวเองแค่ไหน (โซนเป้า 200 เสียเปรียบเมื่อดูเลขดิบ)
     ตัวอย่างจริง: คนที่โซน Half Rack ได้ 120 หยิบ/ชม. อยู่เหนือค่ากลางของเลขดิบ
     แต่ % Eff ยังอยู่ท้ายตาราง เพราะ Target โซนเขาคือ 200 */
  function percentileOf(values, mine) {
    if (!values.length || mine === null || mine === undefined) return null;
    return values.filter((v) => v < mine).length / values.length * 100;
  }

  /* ══════════════════════════════════════════════════════════════════════
     โหมด (ก) เทียบทุกคน
     ══════════════════════════════════════════════════════════════════════ */
  function renderCompare(ctx) {
    const host = $(HOST);
    const { list, counted } = ctx;
    const hit = counted.filter((x) => !x.below);
    const below = counted.filter((x) => x.below);
    const avgEff = counted.length ? counted.reduce((a, x) => a + x.eff, 0) / counted.length : null;
    const effColor = avgEff === null ? '#64748b' : avgEff >= 100 ? '#16a34a' : avgEff >= 80 ? '#ea580c' : '#e11d48';
    /* คนที่โซนหลักเป็น Not Found ถูกตัดสินด้วย Target รวม ต้องบอกผู้ใช้เหมือนหน้า "ไม่ถึงเป้า" */
    const unknownZone = list.filter((x) => x.zone.key === 'unknown');
    const unknownCounted = unknownZone.filter((x) => x.counted);
    const unknownTarget = S().zoneTargetOf(UNKNOWN_ZONE);

    host.innerHTML = S().statCards([
      ['👥 พนักงานทั้งหมด', fmt(list.length), 'คน',
        `มีแถวในช่วงที่เลือก · นับ Productivity ได้ ${fmt(counted.length)} คน`, '#6366f1'],
      ['✅ ถึง Target', fmt(hit.length), 'คน',
        counted.length ? `${fmt(hit.length / counted.length * 100, 1)}% ของคนที่นับได้ · เท่ากับเป้านับว่าผ่าน` : 'ยังไม่มีคนที่นับได้', '#16a34a'],
      ['⚠️ ต่ำกว่า Target', fmt(below.length), 'คน', 'ดูรายละเอียดต่อที่เมนู “ไม่ถึงเป้า”', '#e11d48'],
      ['📊 Efficiency เฉลี่ย', avgEff === null ? '—' : fmt(avgEff, 1) + '%', '',
        'เฉลี่ยของ % รายคน เทียบ Target โซนหลักที่ทำจริง · ไม่ถ่วงน้ำหนักด้วยจำนวนแถว '
        + '(คนที่มีแถวเข้าเฉลี่ยแถวเดียวมีน้ำหนักเท่าคนที่มี 200 แถว)', effColor],
      ['➖ ไม่ตัดสินผ่าน/ไม่ผ่าน', fmt(list.length - counted.length), 'คน',
        'ไม่มีแถวที่นับได้เลย จึงไม่มีค่าเฉลี่ย', '#64748b']
    ])
    + `<div class="card wide">
        <h3>👤 ภาพรวมรายบุคคล — เทียบทุกคน</h3>
        <div class="sub">เทียบ Productivity รายคนกับ Target ของโซนหลัก (โซนที่มีแถวเข้าเฉลี่ยมากที่สุด)
          · กดชื่อหรือปุ่ม Scorecard ในตารางเพื่อเจาะลึกรายคน</div>
        <div class="seg" style="margin-bottom:10px;">
          <button type="button" data-ind-side="top"${chartSide === 'top' ? ' class="active"' : ''}>20 คนสูงสุด</button>
          <button type="button" data-ind-side="bottom"${chartSide === 'bottom' ? ' class="active"' : ''}>20 คนต่ำสุด</button>
        </div>
        <div class="chartbox" style="height:${Math.max(320, Math.min(20, counted.length) * 28 + 90)}px;">
          <canvas id="v3IndCompareChart"></canvas>
        </div>
        <div class="note v3-notice">ตัวเลขทุกค่าคิดจากแถวของคนนั้นในข้อมูลผลงาน
          · Productivity = ผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น (รวมครั้งเดียว ไม่เอาค่าเฉลี่ยมาเฉลี่ยซ้ำ)
          · Total Pick = ผลรวมยอดหยิบของทุกแถวที่มีวันที่ รวมแถวที่ไม่เข้าเฉลี่ยด้วย
          · ชั่วโมงทำงานตามที่ Sheet บันทึก ไม่ลบ 7 ชั่วโมง
          <br>การ์ด “Efficiency เฉลี่ย” เป็นค่าเฉลี่ยของ % รายคนแบบ<b>ไม่ถ่วงน้ำหนัก</b> (คนละเรื่องกับสูตรที่ใช้ ที่รวมครั้งเดียว)
          ส่วน Productivity ของกลุ่มทั้งหมดที่คิดจาก <b>${fmt(ctx.group.average, 1)}</b> หยิบ/ชม.
          จาก ${fmt(ctx.group.count)} แถวที่เข้าเฉลี่ย
          ${unknownZone.length ? `<br><b>กอง Not Found ไม่ใช่โซนจริง</b> — มี ${fmt(unknownZone.length)} คนในช่วงที่เลือกที่โซนหลักเป็น Not Found
            (โซนในต้นทางไม่ตรงกฎโซนของ V1) นับ Productivity ได้ ${fmt(unknownCounted.length)} คน
            กลุ่มนี้เทียบกับ <b>Target รวม ${fmt(unknownTarget)}</b> เพราะไม่รู้ประเภทงาน
            ต้องเติม Zone ให้ถูกก่อนจะเชื่อเลขของกลุ่มนี้ได้ (เหมือนที่เมนู “ไม่ถึงเป้า” เตือนไว้)` : ''}
          <br><b>ไม่มีในต้นทาง จึงไม่มีในหน้านี้</b> — จำนวนบรรทัด (Lines) · จำนวนชิ้นดิบ (pcs) · SKU และชื่อสินค้า · Owner
          · Location ระดับช่อง · เวลาเริ่ม-จบระดับนาที · ชั่วโมง OT · Target ผสมตามสัดส่วนโซน (blendedTarget)
          ของ V2 จึงไม่ถูกนำมาแสดง และโซนในต้นทางคือ<b>โซนสังกัด 1 แถวต่อคนต่อวัน</b> ไม่ใช่โซนที่หยิบจริงรายรายการ
          · ช่องค้นหาอยู่บนตารางด้านล่าง</div>
      </div>
      <h2 class="staff-table-title">ตารางเทียบผลงานรายบุคคล</h2>
      <p class="panel-desc">เรียงตาม % Efficiency มาก→น้อย เป็นค่าตั้งต้น · กดหัวคอลัมน์เพื่อเรียงใหม่
        · คนที่ไม่มีแถวเข้าเฉลี่ยจะไม่มีอันดับและไม่ตัดสินผ่าน/ไม่ผ่าน</p>
      <div id="v3IndCompareTable"></div>`;

    drawCompareChart(counted);

    /* เรียงตั้งต้น: คนที่นับได้ตามอันดับ แล้วต่อด้วยคนที่ไม่มีค่าเฉลี่ย (Total Pick มาก→น้อย) */
    const ordered = [
      ...counted,
      ...list.filter((x) => !x.counted).sort((a, b) => b.total - a.total)
    ];

    S().table($('v3IndCompareTable'), 'individual-compare', ordered, [
      { title: 'อันดับ', value: (x) => (x.rank === null ? '' : x.rank), num: true, sortValue: (x) => x.rank,
        html: (x) => (x.rank === null ? '—' : `<span class="rank">${medal(x.rank)}</span>`) },
      { title: 'รหัสพนักงาน', value: (x) => x.id,
        html: (x) => `<button type="button" data-individual="${esc(x.id)}" title="เปิด Scorecard">${esc(x.id)}</button>` },
      { title: 'ชื่อ', value: (x) => x.name,
        html: (x) => `<button type="button" data-individual="${esc(x.id)}" title="เปิด Scorecard">${esc(x.name)}</button>`
          + resignedBadge(x.resigned)
          + (x.nick || !x.master ? `<span class="sub">${[x.nick ? 'ชื่อเล่น ' + esc(x.nick) : '', x.master ? '' : 'ไม่พบในทะเบียน'].filter(Boolean).join(' · ')}</span>` : '') },
      { title: 'สังกัด', value: (x) => (x.master ? x.master[4] : '') || x.rows[x.rows.length - 1][34] || 'Not Found' },
      { title: 'กะ', value: (x) => x.shift,
        html: (x) => esc(x.shift) + (x.master && x.master[12] && String(x.master[12]).trim() !== x.shift
          ? `<span class="sub">ทะเบียน: ${esc(x.master[12])}</span>` : '') },
      { title: 'โซนหลัก', value: (x) => x.zone.label,
        html: (x) => `${esc(x.zone.label)}<span class="sub">${esc(S().zoneLabels[x.zone.group] || 'ไม่พบโซน')}`
          + ` · ${fmt(x.zoneRowCount)} แถวเข้าเฉลี่ย${x.zoneCount > 1 ? ' · ทำ ' + fmt(x.zoneCount) + ' โซน' : ''}</span>` },
      { title: 'Productivity', value: (x) => (x.average === null ? '' : x.average), num: true, sortValue: (x) => x.average,
        html: (x) => (x.average === null
          ? '<span class="sub">ไม่มีแถวเข้าเฉลี่ย</span>'
          : `<b style="color:${x.below ? '#b91c1c' : '#059669'}">${fmt(x.average, 1)}</b><span class="sub">${fmt(x.count)} แถวเข้าเฉลี่ย</span>`) },
      { title: 'Target โซน', value: (x) => x.target, num: true },
      { title: 'Gap', value: (x) => (x.gap === null ? '' : x.gap), num: true, sortValue: (x) => x.gap,
        html: (x) => (x.gap === null ? '—' : `<span class="${x.gap >= 0 ? 'staff-up' : 'staff-down'}">${signed(x.gap)}</span>`) },
      { title: '% Eff', value: (x) => (x.eff === null ? '' : x.eff), num: true, sortValue: (x) => x.eff,
        html: (x) => (x.eff === null ? '—' : fmt(x.eff, 1) + '%') },
      { title: 'Total Pick', value: (x) => x.total, num: true, html: (x) => fmt(x.total) },
      { title: 'ชั่วโมงทำงาน', value: (x) => x.hours, num: true, html: (x) => fmt(x.hours, 1) },
      { title: 'วันที่มีงาน', value: (x) => x.workDays, num: true },
      { title: 'สถานะ', value: (x) => (!x.counted ? 'ไม่ตัดสิน' : x.below ? 'ต่ำกว่าเป้า' : 'ถึงเป้า'),
        html: (x) => (!x.counted
          ? '<span class="badge-status">ไม่ตัดสิน</span>'
          : x.below ? '<span class="badge-status fail">ต่ำกว่าเป้า</span>' : '<span class="badge-status pass">ถึงเป้า</span>') },
      /* value คืนค่าว่าง เพราะเป็นคอลัมน์ปุ่ม ไม่ใช่ข้อมูล
         ถ้าคืน 'Scorecard' ทุกแถว ช่องค้นหาจะแมตช์ทุกแถวเมื่อพิมพ์ card/score และ CSV จะได้คอลัมน์ค่าซ้ำเปล่า ๆ */
      { title: 'เจาะลึก', value: () => '',
        html: (x) => `<button type="button" data-individual="${esc(x.id)}">Scorecard</button>` }
    ]);
  }

  /* กราฟแท่งนอนเทียบ Prod จริง vs Target ของโซน — รูปแบบเดียวกับ drawIndividualCompareChart ของ V2 */
  function drawCompareChart(counted) {
    if (!counted.length) return;
    const pick = chartSide === 'bottom'
      ? counted.slice(-20).reverse()      // ล่างสุด 20 คน เอาคนแย่สุดขึ้นก่อน
      : counted.slice(0, 20);
    const labels = pick.map((x) => `${x.id} ${x.name !== x.id ? x.name : ''}`.trim());
    const prods = pick.map((x) => Math.round(x.average));
    const targets = pick.map((x) => Math.round(x.target));
    const max = Math.max(...prods, ...targets, 1);

    draw('v3IndCompareChart', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Productivity จริง', data: prods, borderRadius: 6,
            backgroundColor: pick.map((x) => (x.below ? '#f43f5e' : '#10b981')) },
          { label: 'Target ของโซน', data: targets, backgroundColor: '#c7d2fe', borderRadius: 6 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 70 } },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
          datalabels: {
            anchor: 'end', align: 'right', clip: false, clamp: true,
            font: { weight: 700, size: 10 }, color: '#334155',
            display: (c) => c.datasetIndex === 0 && Number(c.dataset.data[c.dataIndex]) > 0,
            formatter: (v) => fmt(Math.round(Number(v)))
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              afterBody: (items) => {
                const x = pick[items[0].dataIndex];
                return [`โซนหลัก: ${x.zone.label}`, `% Eff: ${fmt(x.eff, 1)}%`,
                  `แถวเข้าเฉลี่ย: ${fmt(x.count)} · Total Pick ${fmt(x.total)}`];
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true, suggestedMax: Math.ceil(max * 1.3), grid: { color: 'rgba(148,163,184,.25)' },
            title: { display: true, text: 'หยิบ/ชม.', font: { size: 10.5 } } },
          y: { grid: { display: false }, ticks: { font: { size: 10.5 } } }
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     โหมด (ข) Scorecard รายคน
     ══════════════════════════════════════════════════════════════════════ */
  function renderScorecard(ctx, person) {
    const host = $(HOST);
    const Sh = S();

    /* รายวัน: กลุ่มตามวันที่ (ปกติ 1 แถวต่อคนต่อวัน แต่ต้นทางมีวันซ้ำได้)
       ค่าเฉลี่ยของวันนั้นใช้สูตรเดียวกัน คือ sum AF ÷ count AF>0 ของวันนั้น
       Target ของวันนั้นยึด "โซนที่ทำในวันนั้น" (กฎ mainZoneStat ตัวเดียวกับโซนหลักรายคน)
       ไม่ใช่ Target ของโซนหลัก เพื่อให้การ์ด "วันที่ถึงเป้าโซน" ตัดสินด้วยเกณฑ์เดียวกับ
       ตารางรายวันด้านล่างที่เทียบ AF ของแถวกับ Target ของโซนในแถวนั้น */
    const byDate = new Map();
    person.rows.forEach((r) => {
      const d = M.date(r[2]);
      let g = byDate.get(d);
      if (!g) { g = { date: d, rows: [], total: 0, hours: 0, sum: 0, count: 0, zoneStat: new Map() }; byDate.set(d, g); }
      g.rows.push(r);
      g.total += M.number(r[4]);
      g.hours += M.number(r[6]);
      const z = Sh.zone(r) || UNKNOWN_ZONE;
      let zs = g.zoneStat.get(z.key);
      if (!zs) { zs = { zone: z, rows: 0, count: 0 }; g.zoneStat.set(z.key, zs); }
      zs.rows += 1;
      const af = M.number(r[31]);
      if (af > 0) { g.sum += af; g.count += 1; zs.count += 1; }
    });
    const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
      .map((g) => {
        const zone = mainZoneStat(g.zoneStat).zone || UNKNOWN_ZONE;
        return { ...g, zone, target: Sh.zoneTargetOf(zone), average: g.count ? g.sum / g.count : null };
      });
    const countedDays = daily.filter((d) => d.average !== null);
    const best = countedDays.length ? countedDays.reduce((a, b) => (b.average > a.average ? b : a)) : null;
    const worst = countedDays.length ? countedDays.reduce((a, b) => (b.average < a.average ? b : a)) : null;
    const passDays = countedDays.filter((d) => d.average >= d.target).length;   // เทียบ Target ของโซนที่ทำในวันนั้น
    const offZoneDays = countedDays.filter((d) => d.target !== person.target).length;
    const unknownDays = daily.filter((d) => d.zone.key === 'unknown').length;
    /* เส้นประบนกราฟเทรนวาดทุกวันในหน้าต่างที่เลือก ไม่ใช่แค่วันที่นับได้
       จึงนับ "วันที่ Target ต่างจากโซนหลัก" ด้วยช่วงเดียวกับที่ drawTrendChart ตัด (daily.slice(-trendDays)) */
    const trendUse = trendDays > 0 ? daily.slice(-trendDays) : daily;
    const offTargetDays = trendUse.filter((d) => d.target !== person.target).length;

    const pctProd = percentileOf(ctx.counted.map((x) => x.average), person.average);
    const pctEff = percentileOf(ctx.counted.map((x) => x.eff), person.eff);
    const sameZone = ctx.counted.filter((x) => x.zone.key === person.zone.key);
    const pctZone = sameZone.length > 1 ? percentileOf(sameZone.map((x) => x.average), person.average) : null;
    const groupAvg = ctx.group.average;
    const master = person.master;
    const hourly = person.hourly;
    const hourSum = hourly.reduce((a, b) => a + b, 0);
    const activeHours = hourly.map((v, i) => ({ v, i })).filter((h) => h.v > 0);
    const peak = activeHours.length ? activeHours.reduce((a, b) => (b.v > a.v ? b : a)) : null;

    /* ── แถบทะเบียนจากชีต 2ND ── */
    const pills = [];
    pills.push(`<span class="pill" style="background:#e0f2fe;color:#0369a1;">โซนหลัก ${esc(person.zone.label)}</span>`);
    pills.push(`<span class="pill">${esc(Sh.zoneLabels[person.zone.group] || 'ไม่พบโซน')}</span>`);
    pills.push(`<span class="pill" style="background:#f1f5f9;color:#475569;">กะ ${esc(person.shift)}</span>`);
    if (person.nick) pills.push(`<span class="pill" style="background:#f1f5f9;color:#475569;">ชื่อเล่น ${esc(person.nick)}</span>`);
    if (master) {
      const aff = String(master[4] || '').trim();
      const duty = String(master[5] || '').trim();       // 2ND คอลัมน์ F หน้าที่รับผิดชอบ
      const ready = String(master[8] || '').trim();      // 2ND คอลัมน์ I Ready / Training
      const rosterZone = String(master[9] || '').trim(); // 2ND คอลัมน์ J Zone
      const rosterShift = String(master[12] || '').trim();
      if (aff) pills.push(`<span class="pill" style="background:#f1f5f9;color:#475569;">สังกัด ${esc(aff)}</span>`);
      if (duty) pills.push(`<span class="pill" style="background:#f1f5f9;color:#475569;">หน้าที่ ${esc(duty)}</span>`);
      if (ready) pills.push(`<span class="pill" style="background:${/ready/i.test(ready) ? '#dcfce7;color:#15803d' : '#ffedd5;color:#c2410c'};">${esc(ready)}</span>`);
      if (rosterZone) pills.push(`<span class="pill" style="background:#f1f5f9;color:#475569;">Zone ในทะเบียน ${esc(rosterZone)}</span>`);
      if (rosterShift && rosterShift !== person.shift) pills.push(`<span class="pill" style="background:#fef3c7;color:#92400e;">ทะเบียนระบุกะ ${esc(rosterShift)}</span>`);
    } else {
      pills.push('<span class="pill" style="background:#fef3c7;color:#92400e;">ไม่พบรหัสนี้ในทะเบียนพนักงาน</span>');
    }
    if (person.startDate) {
      const years = person.tenure === null ? null : person.tenure / 365;
      pills.push(`<span class="pill" style="background:#f5f3ff;color:#6d28d9;">เริ่มงาน ${esc(dmy(person.startDate))}`
        + (person.tenure === null ? '' : ` · อายุงาน ${fmt(person.tenure)} วัน${years >= 1 ? ` (~${fmt(years, 1)} ปี)` : ''}`) + '</span>');
    }

    /* ── การ์ด 5 ใบ ตามลำดับของ V2 (individualScorecardHtml) ── */
    const cards = Sh.statCards([
      ['⚡ Productivity', person.average === null ? '—' : fmt(person.average, 1), 'หยิบ/ชม.',
        person.average === null ? 'ไม่มีแถวที่นับได้ จึงไม่ตัดสิน'
          : `Target ${fmt(person.target)} · ${person.gap >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'} ${fmt(Math.abs(person.gap), 1)} · ${fmt(person.count)} แถวเข้าเฉลี่ย`,
        person.average === null ? '#64748b' : person.below ? '#e11d48' : '#16a34a'],
      ['🎯 % Efficiency', person.eff === null ? '—' : fmt(person.eff, 1), '%',
        `เทียบ Target โซน ${person.zone.label} ที่ ${fmt(person.target)} หยิบ/ชม.`,
        person.eff === null ? '#64748b' : person.eff >= 100 ? '#16a34a' : '#ea580c'],
      ['📦 Total Pick', fmt(person.total), 'หน่วย',
        `${fmt(person.workDays)} วันที่มีงาน · ${fmt(person.rows.length)} แถวต้นทาง (รวมแถวที่ไม่เข้าเฉลี่ย)`, '#0ea5e9'],
      ['⏱️ ชั่วโมงทำงาน', fmt(person.hours, 1), 'ชม.',
        person.workDays ? `เฉลี่ย ${fmt(person.hours / person.workDays, 1)} ชม./วันที่มีงาน · ไม่มีข้อมูล OT ในต้นทาง` : 'ไม่มีข้อมูล OT ในต้นทาง', '#7c3aed'],
      ['📈 วันดีที่สุด / แย่ที่สุด', best ? fmt(best.average, 1) : '—', 'หยิบ/ชม.',
        best ? `${dmy(best.date)} · ต่ำสุด ${fmt(worst.average, 1)} (${dmy(worst.date)})` : 'ยังไม่มีวันที่นับได้', '#0891b2']
    ]);

    /* ── การ์ดอธิบาย: เทียบกับค่าเฉลี่ยกลุ่ม และเปอร์เซ็นไทล์ ── */
    const insights = [];
    if (person.average !== null && groupAvg !== null) {
      const d = person.average - groupAvg;
      insights.push(insightCard(d >= 0 ? 'good' : 'warn', 'เทียบค่าเฉลี่ยของกลุ่ม',
        `คนนี้ <b>${fmt(person.average, 1)}</b> หยิบ/ชม. · กลุ่มทั้งหมด <b>${fmt(groupAvg, 1)}</b> หยิบ/ชม.`
        + ` ${d >= 0 ? 'สูงกว่า' : 'ต่ำกว่า'} <b>${fmt(Math.abs(d), 1)}</b>`
        + `<br>ค่าเฉลี่ยกลุ่มคิดจากทุกแถวที่นับได้ในช่วงที่เลือก (${fmt(ctx.group.count)} แถว) รวมครั้งเดียวไม่เฉลี่ยซ้ำ`));
    }
    if (pctEff !== null) {
      insights.push(insightCard(pctEff >= 50 ? 'good' : 'warn', 'เปอร์เซ็นไทล์ในกลุ่ม',
        `เทียบกับคนที่นับ Productivity ได้ <b>${fmt(ctx.counted.length)}</b> คนในช่วงที่เลือก`
        + `<br>• ตาม <b>% Efficiency</b> อยู่เปอร์เซ็นไทล์ <b>${fmt(pctEff, 1)}</b> · อันดับที่ <b>${fmt(person.rank)}</b>`
        + `<br>• ตาม <b>Productivity ดิบ (หยิบ/ชม.)</b> อยู่เปอร์เซ็นไทล์ <b>${fmt(pctProd, 1)}</b>`
        + (pctZone === null
          ? `<br>• ในโซน ${esc(person.zone.label)} มีคนที่นับได้คนเดียว จึงเทียบในโซนไม่ได้`
          : `<br>• เทียบเฉพาะคนในโซน <b>${esc(person.zone.label)}</b> (${fmt(sameZone.length)} คน) อยู่เปอร์เซ็นไทล์ <b>${fmt(pctZone, 1)}</b>`)
        + `<br>สองมุมนี้ต่างกันได้ เพราะ Target แต่ละโซนไม่เท่ากัน คนที่โซนเป้า 200 จะเสียเปรียบเมื่อดูเลขดิบเทียบทั้งกลุ่ม`
        + ` · เปอร์เซ็นไทล์ = จำนวนคนที่ค่านั้นน้อยกว่าเขา ÷ จำนวนคนในกลุ่มที่เทียบ`));
    }
    if (countedDays.length) {
      const multi = daily.filter((d) => d.rows.length > 1).length;   // วันที่ต้นทางมีหลายแถว
      insights.push(insightCard(passDays * 2 >= countedDays.length ? 'good' : 'warn', 'วันที่ถึงเป้าโซน',
        `ถึงเป้า <b>${fmt(passDays)}</b> จาก <b>${fmt(countedDays.length)}</b> วันที่นับได้`
        + ` (<b>${fmt(passDays / countedDays.length * 100, 1)}%</b>) · เท่ากับเป้านับว่าผ่าน`
        + `<br>แต่ละวันเทียบกับ <b>Target ของโซนที่ทำในวันนั้น</b> เกณฑ์เดียวกับตารางรายวันด้านล่าง`
        + (offZoneDays
          ? ` · มี ${fmt(offZoneDays)} วันที่ Target ต่างจากโซนหลัก (${esc(person.zone.label)} ที่ ${fmt(person.target)} หยิบ/ชม.)`
          : ` · ทุกวันใช้ Target เดียวกับโซนหลัก (${fmt(person.target)} หยิบ/ชม.)`)
        + `<br>อีก ${fmt(daily.length - countedDays.length)} วันไม่เข้าเฉลี่ยเพราะค่าเฉลี่ยต่อชั่วโมงไม่มากกว่า 0`
        + (multi
          ? `<br>ค่านี้<b>นับต่อวัน</b> — มี ${fmt(multi)} วันที่ต้นทางมีหลายแถว จึงรวมเป็นวันเดียวก่อนเทียบเป้า`
            + ` ทำให้จำนวนผ่าน/ไม่ผ่านต่างจากตารางรายวันที่นับต่อแถวได้`
          : '')));
    }
    insights.push(insightCard(person.zoneCount > 1 ? 'warn' : 'good', 'โซนที่ทำงาน',
      `ทำ <b>${fmt(person.zoneCount)}</b> โซนในช่วงที่เลือก · โซนหลักคือ <b>${esc(person.zone.label)}</b>`
      + ` (มีแถวเข้าเฉลี่ย ${fmt(person.zoneRowCount)} แถว มากที่สุด)`
      + `<br>โซนในต้นทางเป็นโซนสังกัดรายวัน ไม่ใช่โซนที่หยิบจริงรายรายการ`));
    if (peak) {
      insights.push(insightCard('good', 'ช่วงเวลาที่ทำงาน',
        `มียอดใน <b>${fmt(activeHours.length)}</b> จาก 24 ช่วง · ช่วงแรก <b>${esc(ctx.hourLabels[activeHours[0].i])}</b>`
        + ` · ช่วงสุดท้าย <b>${esc(ctx.hourLabels[activeHours[activeHours.length - 1].i])}</b>`
        + ` · หยิบมากสุดช่วง <b>${esc(ctx.hourLabels[peak.i])}</b> ที่ ${fmt(peak.v)} หน่วย`
        + `<br>มาจากข้อมูลรายชั่วโมงที่ Sheet บันทึกยอดต่อชั่วโมงไว้แล้ว ไม่ใช่เวลาเข้า-ออกงาน`));
    }
    if (person.resigned) {
      insights.push(insightCard('warn', 'พ้นสภาพแล้ว',
        `รหัสนี้อยู่ใน${person.resigned.source === 'web' ? 'รายการที่กรอกในเว็บ (ยังไม่เข้ารายชื่อที่ลาออก)' : 'รายชื่อที่ลาออก'}`
        + ` · พ้นสภาพ <b>${esc(person.resigned.date ? dmy(person.resigned.date) : 'ไม่ทราบวันที่')}</b>`
        + `<br>ผลงานย้อนหลังยังคงไว้ ไม่ลบทิ้ง`));
    }

    host.innerHTML = `
      <div class="card wide">
        <div class="staff-card-head">
          <div>
            <h3>👤 ${esc(person.id)} · ${esc(person.name)} ${resignedBadge(person.resigned)}</h3>
            <div class="sub" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;">${pills.join('')}</div>
          </div>
          <div class="seg"><button type="button" class="active" data-ind-back>← กลับตารางเทียบทุกคน</button></div>
        </div>
        ${cards}
        <div class="staff-insight-grid">${insights.join('')}</div>
        <div class="note v3-notice">ทุกค่าในหน้านี้คิดจากแถวของคนนี้ในข้อมูลผลงาน
          · Productivity = ผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น · Total Pick = ผลรวมยอดหยิบทุกแถวที่มีวันที่
          · ชั่วโมงทำงานตามที่ Sheet บันทึก ไม่ลบ 7 ชั่วโมง · เท่ากับเป้านับว่าผ่าน
          <br><b>Target ที่ใช้ในหน้านี้</b> — การ์ด Productivity และ % Efficiency ตัดสิน<b>ภาพรวมของคนนี้</b>
          ด้วย Target ของโซนหลัก (${esc(person.zone.label)} ที่ ${fmt(person.target)} หยิบ/ชม.) เหมือนตารางเทียบทุกคนและเมนู “ไม่ถึงเป้า”
          · ส่วนการ์ด “วันที่ถึงเป้าโซน” ตารางรายวัน และเส้นประบนกราฟเทรน ตัดสิน<b>รายวัน/รายแถว</b>
          ด้วย Target ของโซนที่ทำในวันนั้น${offZoneDays ? ` (มี ${fmt(offZoneDays)} วันที่นับได้ซึ่ง Target ต่างจากโซนหลัก)` : ''}
          ${person.zone.key === 'unknown'
            ? `<br><b>โซนหลักของคนนี้เป็น Not Found</b> — โซนในต้นทางไม่ตรงกฎโซนของ V1 จึงเทียบกับ
               Target รวม ${fmt(person.target)} เพราะไม่รู้ประเภทงาน ต้องเติม Zone ให้ถูกก่อนจะเชื่อเลขของคนนี้ได้`
            : unknownDays
              ? `<br><b>มี ${fmt(unknownDays)} วันที่โซนเป็น Not Found</b> (โซนในต้นทางไม่ตรงกฎโซนของ V1)
                 วันเหล่านั้นเทียบกับ Target รวม ${fmt(Sh.zoneTargetOf(UNKNOWN_ZONE))} เพราะไม่รู้ประเภทงาน`
              : ''}
          <br><b>ไม่มีในต้นทาง จึงไม่มีในหน้านี้</b> — Lines · pcs · SKU และชื่อสินค้า · Owner · Location ระดับช่อง
          · เวลาเริ่ม-จบระดับนาที · ชั่วโมง OT · Target ผสมตามสัดส่วนโซน (blendedTarget) · โซนที่หยิบจริงรายรายการ
          ที่ V2 เคยแสดง จึงถูกตัดออก · แทนที่ด้วยช่วงเวลาจากข้อมูลรายชั่วโมง, ชั่วโมงทำงาน,
          Target ของโซนหลัก และการเทียบโซนสังกัดกับ Zone ในทะเบียนพนักงาน</div>
      </div>

      <div class="card wide" style="margin-top:16px;">
        <h3>📉 เทรน Productivity รายวันของคนนี้</h3>
        <div class="sub">แท่ง = Total Pick ของวันนั้น · เส้น = ค่าเฉลี่ยต่อชั่วโมงของวันนั้น
          · เส้นประ = <b>Target ของโซนที่ทำในวันนั้น</b>
          ${offTargetDays
            ? `(โซนหลัก ${esc(person.zone.label)} ที่ ${fmt(person.target)} หยิบ/ชม. · ในช่วงที่กราฟแสดงมี ${fmt(offTargetDays)} วันที่ใช้ค่าอื่น เส้นจึงขยับ)`
            : `(ในช่วงที่กราฟแสดงทุกวันเท่ากับโซนหลัก ${esc(person.zone.label)} ที่ ${fmt(person.target)} หยิบ/ชม. เส้นจึงแบน)`}
          · มีข้อมูล ${fmt(daily.length)} วัน (นับเฉพาะวันที่มีแถวในต้นทาง ไม่เติมวันที่ไม่มีแถวให้เป็น 0)</div>
        <div class="seg" style="margin-bottom:10px;">
          <button type="button" data-ind-trend="30"${trendDays === 30 ? ' class="active"' : ''}>30 วันที่มีงานล่าสุด</button>
          <button type="button" data-ind-trend="90"${trendDays === 90 ? ' class="active"' : ''}>90 วันที่มีงานล่าสุด</button>
          <button type="button" data-ind-trend="0"${trendDays === 0 ? ' class="active"' : ''}>ทุกวันที่มีงาน</button>
        </div>
        <div class="chartbox tall"><canvas id="v3IndTrendChart"></canvas></div>
        <div class="note v3-notice">วันที่ยึดวันที่ในต้นทางตรง ๆ ไม่ย้ายยอดหลังเที่ยงคืน
          · วันที่ค่าเฉลี่ยต่อชั่วโมงไม่มากกว่า 0 จะไม่มีจุดบนเส้น Productivity แต่ยังมีแท่ง Total Pick เพราะยอดหยิบยังนับ
          · ไม่มีข้อมูล Lines และ OT ในต้นทาง จึงไม่มีสองเส้นนั้นเหมือน V2</div>
      </div>

      <div class="card wide" style="margin-top:16px;">
        <h3>🕒 รูปแบบการทำงานรายชั่วโมงของคนนี้</h3>
        <div class="sub">ผลรวมยอดหยิบของแต่ละช่วงเวลาจากทุกวันในช่วงที่เลือก
          · ผลรวม 24 ช่อง ${fmt(hourSum)} เทียบ Total Pick ${fmt(person.total)}
          ${hourSum === person.total ? '(ตรงกันพอดี)' : `(ต่าง ${signed(hourSum - person.total, 0)})`}</div>
        <div class="chartbox"><canvas id="v3IndHourChart"></canvas></div>
        <div class="note v3-notice"><b>หน้านี้ V2 ทำไม่ได้</b> — V2 ไม่มียอดรายชั่วโมงแยกรายคน
          ส่วน V3 อ่านจากข้อมูลรายชั่วโมงที่ Sheet บันทึกไว้ครบ 24 ช่องต่อแถว
          · ช่วงที่เป็น 0 คือ Sheet ไม่มียอดในช่องนั้น ไม่ได้แปลว่าคนนี้ไม่ได้อยู่ในคลัง
          · ช่วงเวลาเริ่ม ${esc(ctx.hourLabels[0] || '')} ถึง ${esc(ctx.hourLabels[23] || '')}</div>
      </div>

      <h2 class="staff-table-title">📍 โซนที่ทำ และ Target ของแต่ละโซน</h2>
      <p class="panel-desc">ค่าเฉลี่ยของแต่ละโซนคิดแยกด้วยสูตรเดิม (ผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวในโซนนั้นที่นับได้ ÷ จำนวนแถวนั้น)
       · “โซนประจำ” คือโซนที่ตรงกับ Zone ในทะเบียนพนักงาน</p>
      <div id="v3IndZoneTable"></div>

      <h2 class="staff-table-title">🗓️ ผลงานรายวันของคนนี้</h2>
      <p class="panel-desc">หนึ่งบรรทัดต่อหนึ่งแถวในข้อมูลผลงาน (ใหม่ → เก่า)
        · แถวที่ค่าเฉลี่ยต่อชั่วโมงไม่มากกว่า 0 จะไม่เข้าเฉลี่ยและมีเหตุผลกำกับไว้
        · ตารางนี้เทียบค่าเฉลี่ยต่อชั่วโมงของแถวกับ <b>Target ของโซนในแถวนั้น</b> เกณฑ์เดียวกับการ์ด “วันที่ถึงเป้าโซน” ด้านบน
        ต่างกันแค่ตารางนี้<b>นับต่อแถว</b> ส่วนการ์ดนับต่อวัน ถ้าวันเดียวมีหลายแถวในต้นทาง
        จำนวนผ่าน/ไม่ผ่านของสองที่จึงต่างกันได้ (คนนี้มี ${fmt(daily.filter((d) => d.rows.length > 1).length)} วันที่มีหลายแถว)</p>
      <div id="v3IndDailyTable"></div>`;

    drawTrendChart(person, daily);
    drawHourChart(person, ctx.hourLabels);

    /* ── ตารางโซนที่ทำ ── */
    const homeZoneText = master ? String(master[9] || '').trim() : '';
    const homeZone = homeZoneText ? Sh.zone({ 33: homeZoneText }) : null;
    const zoneRows = [...person.zoneStat.values()].sort((a, b) => b.total - a.total).map((z, i) => ({
      ...z,
      order: i + 1,
      target: Sh.zoneTargetOf(z.zone),
      average: z.count ? z.sum / z.count : null,
      share: person.total ? z.total / person.total * 100 : 0,
      isHome: homeZone ? homeZone.key === z.zone.key : null
    }));
    Sh.table($('v3IndZoneTable'), 'individual-zones', zoneRows, [
      { title: '#', value: (z) => z.order, num: true, html: (z) => `<span class="rank">${z.order}</span>` },
      { title: 'โซน', value: (z) => z.zone.label,
        html: (z) => `<b>${esc(z.zone.label)}</b>`
          + (z.isHome === true ? ' <span class="pill" style="background:#dcfce7;color:#15803d;">โซนประจำ</span>'
            : z.isHome === false ? ' <span class="pill" style="background:#ffedd5;color:#c2410c;">ไม่ใช่โซนในทะเบียน</span>' : '')
          + `<span class="sub">${esc(Sh.zoneLabels[z.zone.group] || 'ไม่พบโซน')}</span>` },
      { title: 'Total Pick', value: (z) => z.total, num: true, html: (z) => fmt(z.total) },
      { title: 'สัดส่วน', value: (z) => z.share, num: true, html: (z) => fmt(z.share, 1) + '%' },
      { title: 'แถวทั้งหมด', value: (z) => z.rows, num: true },
      { title: 'แถวเข้าเฉลี่ย', value: (z) => z.count, num: true },
      { title: 'Productivity ในโซนนี้', value: (z) => (z.average === null ? '' : z.average), num: true, sortValue: (z) => z.average,
        html: (z) => (z.average === null ? '<span class="sub">ไม่มีแถวเข้าเฉลี่ย</span>' : fmt(z.average, 1)) },
      { title: 'Target โซน', value: (z) => z.target, num: true },
      { title: 'เทียบเป้าโซนนี้', value: (z) => (z.average === null ? 'ไม่ตัดสิน' : z.average >= z.target ? 'ถึงเป้า' : 'ต่ำกว่าเป้า'),
        html: (z) => (z.average === null
          ? '<span class="badge-status">ไม่ตัดสิน</span>'
          : z.average >= z.target
            ? '<span class="badge-status pass">ถึงเป้าโซนนี้</span>'
            : '<span class="badge-status fail">ต่ำกว่าเป้าโซนนี้</span>') }
    ]);

    /* ── ตารางรายวัน (หนึ่งบรรทัดต่อหนึ่งแถวต้นทาง) ── */
    const rowItems = [...person.rows].sort((a, b) => M.date(b[2]).localeCompare(M.date(a[2]))).map((r) => {
      const af = M.number(r[31]);
      const z = Sh.zone(r) || UNKNOWN_ZONE;
      return { row: r, date: M.date(r[2]), shift: M.shiftKey(r), zone: z,
        target: Sh.zoneTargetOf(z), total: M.number(r[4]), hours: M.number(r[6]),
        af: af > 0 ? af : null, counted: af > 0, reason: excludeReason(r), raw: String(r[31] ?? '').trim() };
    });
    Sh.table($('v3IndDailyTable'), 'individual-daily', rowItems, [
      { title: 'วันที่', value: (d) => d.date, html: (d) => `<b>${esc(dmy(d.date))}</b><span class="sub">${esc(d.date)}</span>` },
      { title: 'กะ', value: (d) => d.shift },
      { title: 'โซน', value: (d) => d.zone.label,
        html: (d) => esc(d.zone.label) + `<span class="sub">${esc(String(d.row[33] || 'Not Found'))}</span>` },
      { title: 'Total Pick', value: (d) => d.total, num: true, html: (d) => fmt(d.total) },
      { title: 'ชั่วโมงทำงาน', value: (d) => d.hours, num: true, html: (d) => fmt(d.hours, 1) },
      { title: 'ค่าเฉลี่ย/ชม.', value: (d) => (d.af === null ? '' : d.af), num: true, sortValue: (d) => d.af,
        html: (d) => (d.af === null ? `<span class="sub">${esc(d.raw || 'ว่าง')}</span>` : fmt(d.af, 1)) },
      { title: 'Target โซน', value: (d) => d.target, num: true },
      { title: 'เทียบเป้า', value: (d) => (!d.counted ? 'ไม่เข้าเฉลี่ย' : d.af >= d.target ? 'ผ่าน' : 'ไม่ผ่าน'),
        html: (d) => (!d.counted
          ? '<span class="badge-status">ไม่เข้าเฉลี่ย</span>'
          : d.af >= d.target ? '<span class="badge-status pass">ผ่าน</span>' : '<span class="badge-status fail">ไม่ผ่าน</span>') },
      { title: 'เหตุผลที่ไม่เข้าเฉลี่ย', value: (d) => d.reason || '', html: (d) => (d.reason ? esc(d.reason) : '—') }
    ], { valid: (d) => d.counted });
  }

  function insightCard(tone, title, body) {
    return `<article class="staff-insight is-${tone}"><h4>${esc(title)}</h4><p>${body}</p></article>`;
  }

  /* กราฟเทรนรายวัน — รูปแบบเดียวกับ drawIndividualTrendChart ของ V2
     แท่ง Total Pick + เส้น Productivity + เส้นประ Target ของโซน */
  function drawTrendChart(person, daily) {
    const use = trendDays > 0 ? daily.slice(-trendDays) : daily;
    if (!use.length) return;
    const labels = use.map((d) => d.date.slice(5));
    const totals = use.map((d) => Math.round(d.total));
    const prods = use.map((d) => (d.average === null ? null : Number(d.average.toFixed(1))));
    /* เส้นประใช้ Target ของโซนที่ทำในวันนั้น (เกณฑ์เดียวกับการ์ดและตารางรายวัน)
       ถ้าคนนี้ทำโซนเดียวตลอด ค่าจะเท่ากันทุกวันและเส้นจะแบนเหมือนเดิม */
    const targets = use.map((d) => d.target);
    const sameTarget = targets.every((t) => t === person.target);
    const maxTotal = Math.max(...totals, 1);
    const maxProd = Math.max(...prods.filter((v) => v !== null), ...targets, 1);

    draw('v3IndTrendChart', {
      data: {
        labels,
        datasets: [
          { type: 'bar', label: 'Total Pick', data: totals, backgroundColor: '#818cf8',
            borderRadius: 5, yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Productivity (ค่าเฉลี่ย/ชม.)', data: prods, spanGaps: true,
            borderColor: '#059669', backgroundColor: '#059669', borderWidth: 2.5, tension: .3,
            pointRadius: use.length > 40 ? 0 : 3.5, pointBackgroundColor: '#fff', pointBorderWidth: 2,
            yAxisID: 'y1', order: 1 },
          { type: 'line',
            label: sameTarget
              ? `Target โซน ${person.zone.label} (${fmt(person.target)})`
              : `Target ของโซนที่ทำในวันนั้น (โซนหลัก ${person.zone.label} = ${fmt(person.target)})`,
            data: targets, stepped: !sameTarget,
            borderColor: '#f43f5e', borderWidth: 2, borderDash: [6, 5], pointRadius: 0,
            yAxisID: 'y1', order: 0, datalabels: { display: false } }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 } } },
          datalabels: {
            clip: false, clamp: true, font: { weight: 700, size: 9.5 }, align: 'top', anchor: 'end',
            color: (c) => (c.dataset.type === 'line' ? '#047857' : '#4338ca'),
            display: (c) => labels.length <= 16 && Number(c.dataset.data[c.dataIndex]) > 0,
            formatter: (v) => fmt(Math.round(Number(v)))
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              afterBody: (items) => {
                const d = use[items[0].dataIndex];
                if (!d) return [];
                const note = d.average === null ? 'วันนี้ไม่เข้าเฉลี่ย (ค่าเฉลี่ย/ชม. ไม่มากกว่า 0)'
                  : d.average >= d.target ? 'ผ่านเป้าโซน' : 'ต่ำกว่าเป้าโซน';
                return [`ชั่วโมงทำงาน: ${fmt(d.hours, 1)}`, `แถวต้นทาง: ${fmt(d.rows.length)}`,
                  `Target วันนั้น: ${fmt(d.target)} (โซน ${d.zone.label})`, note];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 24, maxRotation: labels.length > 14 ? 90 : 0, font: { size: 10 } } },
          y: { beginAtZero: true, position: 'left', suggestedMax: Math.ceil(maxTotal * 1.3),
            grid: { color: 'rgba(148,163,184,.25)' }, title: { display: true, text: 'Total Pick', font: { size: 10.5 } } },
          y1: { beginAtZero: true, position: 'right', suggestedMax: Math.ceil(maxProd * 1.3),
            grid: { display: false }, title: { display: true, text: 'หยิบ/ชม.', font: { size: 10.5 } } }
        }
      }
    });
  }

  /* กราฟรายชั่วโมงของคนนี้ — ของใหม่ที่ V2 ทำไม่ได้ (ไม่มียอดรายชั่วโมงแยกรายคน) */
  function drawHourChart(person, hourLabels) {
    const values = person.hourly.map((v) => Math.round(v));
    const max = Math.max(...values, 1);
    const peakIndex = values.indexOf(max);
    draw('v3IndHourChart', {
      type: 'bar',
      data: {
        labels: hourLabels,
        datasets: [{
          label: 'ยอดหยิบรวมในช่วงเวลานั้น', data: values, borderRadius: 5,
          backgroundColor: values.map((v, i) => (v === 0 ? '#e2e8f0' : i === peakIndex ? '#4338ca' : '#818cf8'))
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end', align: 'top', clip: false, clamp: true, color: '#4338ca',
            font: { size: 9, weight: 700 }, display: (c) => Number(c.dataset.data[c.dataIndex]) > 0,
            formatter: (v) => fmt(Math.round(Number(v)))
          },
          tooltip: {
            backgroundColor: 'rgba(15,23,42,.92)', padding: 10, cornerRadius: 8,
            callbacks: {
              afterBody: (items) => {
                const v = values[items[0].dataIndex];
                const sum = values.reduce((a, b) => a + b, 0);
                return [sum ? `สัดส่วน ${fmt(v / sum * 100, 1)}% ของยอดรวม 24 ช่อง` : 'ยังไม่มียอดในช่วงที่เลือก'];
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 90, minRotation: 45, font: { size: 9.5 } } },
          y: { beginAtZero: true, suggestedMax: Math.ceil(max * 1.25), grid: { color: 'rgba(148,163,184,.25)' },
            title: { display: true, text: 'ยอดหยิบ', font: { size: 10.5 } } }
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     ตัวควบคุมการเรนเดอร์
     .tab-panel เป็น display:none ตอนไม่ได้เลือก กราฟที่วาดตอนซ่อนจะได้ canvas สูง 0
     จึงเรนเดอร์เฉพาะตอน panel มีคลาส active
     ══════════════════════════════════════════════════════════════════════ */
  function isActive() {
    const panel = $(PANEL);
    return Boolean(panel && panel.classList.contains('active'));
  }

  function render() {
    const host = $(HOST);
    if (!host || !isActive()) return;
    const Sh = S();
    if (!Sh || !Sh.source || !window.V3Data || !window.V3Data.current) {
      host.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">กำลังอ่านข้อมูลจาก Google Sheets…</div></div>';
      return;
    }
    /* ทิ้งกราฟเดิมก่อนเขียน innerHTML ทับ ไม่ให้ instance เก่าค้างอยู่กับ canvas ที่ถูกลบแล้ว */
    if (typeof Chart !== 'undefined') {
      ['v3IndCompareChart', 'v3IndTrendChart', 'v3IndHourChart'].forEach((id) => {
        const old = Chart.getChart(id);
        if (old) old.destroy();
      });
    }
    try {
      const ctx = build();
      if (!ctx.list.length) {
        host.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">'
          + 'ยังไม่มีพนักงานที่มีแถวในช่วงวันที่ + ระบบ + กะ ที่เลือกไว้ · ลองขยายช่วงวันที่หรือเลือก “ทุกระบบ / ทุกกะ”</div></div>';
        return;
      }
      const person = selected ? ctx.list.find((x) => x.id === selected) : null;
      if (selected && !person) selected = '';       // คนที่เลือกไว้หายไปจากตัวกรอง จึงกลับโหมดเทียบทุกคน
      if (person) renderScorecard(ctx, person);
      else renderCompare(ctx);
    } catch (e) {
      console.error('V3 individual:', e);
      const h = $(HOST);
      if (h) h.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">'
        + 'หน้านี้คำนวณไม่สำเร็จ · ดูรายละเอียดที่ Console (V3 individual)</div></div>';
    }
  }

  let scheduled = null;
  function schedule(delay) {
    clearTimeout(scheduled);
    scheduled = setTimeout(render, delay || 140);
  }

  /* Event delegation ที่ host — ตารางวาด tbody ใหม่ทุกครั้งที่เปลี่ยนหน้า/ค้นหา/เรียง
     ผูกที่ปุ่มตรง ๆ จะหลุดทันทีที่ตารางวาดใหม่ (เคยเป็นบั๊กจริงในโปรเจกต์นี้) */
  const host = $(HOST);
  if (host) {
    host.addEventListener('click', (e) => {
      const open = e.target.closest('[data-individual]');
      if (open) { selected = open.dataset.individual; render(); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
      if (e.target.closest('[data-ind-back]')) { selected = ''; render(); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
      const side = e.target.closest('[data-ind-side]');
      if (side) { chartSide = side.dataset.indSide; render(); return; }
      const trend = e.target.closest('[data-ind-trend]');
      if (trend) { trendDays = Number(trend.dataset.indTrend); render(); return; }
    });
    if (!host.innerHTML) {
      host.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">กำลังอ่านข้อมูลจาก Google Sheets…</div></div>';
    }
  }

  /* ผูก 3 ทางตามแบบแผนของโปรเจกต์
       1) ได้ข้อมูลชุดใหม่หรือเปลี่ยนตัวกรองระบบ/กะ
       2) shell สั่งเรนเดอร์ใหม่ (เปลี่ยนช่วงวันที่ / เปลี่ยน Target)
       3) กดปุ่มเมนูของหน้านี้ — หน่วงให้ shell ใส่คลาส active ก่อนวาดกราฟ */
  if (window.V3Data) window.V3Data.subscribe(() => schedule());
  document.addEventListener('v3-render', () => schedule());
  document.querySelectorAll('.nav-item[data-tab="individual"]')
    .forEach((btn) => btn.addEventListener('click', () => schedule(60)));
})();
