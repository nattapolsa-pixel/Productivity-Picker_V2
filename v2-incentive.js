/* v2-incentive.js — หน้า Incentive (ประมาณการเบี้ยขยัน)
   ลอกลำดับองค์ประกอบจากหน้า incentive ของ V2 (app.js:9619 renderIncentivePage,
   9806 drawIncentiveCharts, 9906 drawIncentiveTable, 9996 exportIncentiveCsv)
     แผงตั้งค่าเกณฑ์ → การ์ด 4 Tier → การ์ดสรุป → โดนัท Tier + แท่งงบตามสังกัด → โน้ตที่มาของตัวเลข → ตารางรายคน
   ปุ่ม Export CSV ของ V2 ไม่ต้องทำซ้ำ เพราะ V3Shared.table มีปุ่ม Export CSV ให้ในแถบเครื่องมือของตารางแล้ว

   ── สูตรทั้งหมดเป็นของ V1 ──
   Productivity รายคน = ผลรวมคอลัมน์ AF ของแถวที่ AF > 0 ÷ จำนวนแถวนั้น
                        (รวม sum/count ครั้งเดียว ไม่เอาค่าเฉลี่ยมาเฉลี่ยซ้ำ)
   Total Pick รายคน   = ผลรวมคอลัมน์ E ของทุกแถวที่มีวันที่ (รวมแถวที่ AF เป็น Not Count)
   % ของเป้า          = Productivity ÷ Target ของโซนหลัก × 100
   โซนหลัก            = โซนที่มีแถวเข้าเฉลี่ยมากที่สุด (กฎเดียวกับหน้า below-target ใน insights.js)
   เท่ากับเป้านับว่าผ่าน · คนที่ไม่มีแถวเข้าเฉลี่ยเลย (count = 0) ไม่ตัดสินผ่าน/ไม่ผ่าน จึงไม่เข้าหน้านี้
   ไม่ลบ 7 ชั่วโมง ไม่ย้ายยอดหลังเที่ยงคืน ไม่ใช้สูตร UOM ของ V2

   ── ที่ตัดออกจาก V2 เพราะ V3 ไม่มีข้อมูล (เขียนบอกไว้ในโน้ตใต้การ์ดด้วย) ──
   โหมดหน่วยเป็น "ชิ้น" (pcs/UOM), Cycle Time ต่อหน่วย, blendedTarget และโซนที่หยิบจริงรายรายการ */
(() => {
  'use strict';

  const host = document.getElementById('v3Incentive');
  if (!host) return;

  const M = window.V3Metrics;
  if (!M) {
    console.warn('V3 incentive: ไม่พบ V3Metrics จึงไม่เรนเดอร์หน้านี้');
    return;
  }
  const $ = (id) => document.getElementById(id);
  const shared = () => window.V3Shared;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(Number(v))
    ? '—' : Number(v).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d }));
  /* เงินแสดงเป็นจำนวนเต็มบาทเสมอ ปัดด้วย Math.round ตรงที่คำนวณ ไม่ปัดตอนแสดงผลอย่างเดียว */
  const baht = (v) => '฿' + fmt(Math.round(Number(v) || 0));
  const dmy = (iso) => (iso ? String(iso).split('-').reverse().join('/') : 'ไม่ทราบวันที่');

  /* ══════════ 1) เกณฑ์ที่ตั้งได้บนหน้าเว็บ ══════════
     ค่าตั้งต้นยึดของ V2 (app.js:9627 window._incentiveConfig)
       minHours 3 · tier1Rate 50 · tier2Rate 100 · tier3Rate 160 · tier4Rate 250 · unitRate 0.80 · calcMode tier_fixed
     เพิ่ม minDays ที่ V2 ไม่มี เพราะแถวที่เข้าเฉลี่ย (AF > 0) ไม่มีแถวไหนที่ชั่วโมง G < 4
     (แถวชั่วโมงสั้นในต้นทางเป็น Not Count ทั้งหมด จึงไม่เข้าค่าเฉลี่ยและไม่เข้าเกณฑ์ชั่วโมงของหน้านี้)
     เกณฑ์ชั่วโมงอย่างเดียวจึงตัดใครไม่ได้เลย ตัวเลขที่เหวี่ยงจริงมาจากคนที่มีวันเข้าเฉลี่ยน้อย
     (ตรวจกับ snapshot: มีคน 1 วัน Productivity 327 = 192% ของเป้า ซึ่งจะได้ Platinum ถ้าไม่มีเกณฑ์วัน)
     เกณฑ์วันนี้ห้ามถอดออก แต่ตัวกรองเริ่มต้นของเว็บเป็น "วันล่าสุดวันเดียว" (script.js initializeDefaultDateFilter)
     ถ้าใช้ค่าที่ตั้งไว้ตรง ๆ จะตัดทุกคนและหน้าเปิดมาเป็น ฿0 ทุกช่อง
     จึงลดเกณฑ์ลงเท่าจำนวนวันที่มีข้อมูลจริงในช่วงที่เลือก แล้วขึ้นแถบเตือนบอกเหตุผลทุกครั้ง (effMinDays / dayLimitNotice) */
  const KEY = 'pickProductivityIncentiveConfig:v3';
  const DEFAULTS = Object.freeze({
    mode: 'tier_fixed',
    minHours: 3,
    minDays: 3,
    tier1Rate: 50,
    tier2Rate: 100,
    tier3Rate: 160,
    tier4Rate: 250,
    unitRate: 0.8,
    hideResigned: false
  });

  const TIERS = [
    { key: 'BRONZE', icon: '🥉', name: 'Bronze', cls: 'bronze', band: '100% – 114%', min: 100, rate: 'tier1Rate', color: '#c2410c', chart: '#fb923c' },
    { key: 'SILVER', icon: '🥈', name: 'Silver', cls: 'silver', band: '115% – 129%', min: 115, rate: 'tier2Rate', color: '#475569', chart: '#94a3b8' },
    { key: 'GOLD', icon: '🥇', name: 'Gold', cls: 'gold', band: '130% – 149%', min: 130, rate: 'tier3Rate', color: '#ca8a04', chart: '#facc15' },
    { key: 'PLATINUM', icon: '💎', name: 'Platinum', cls: 'platinum', band: '≥ 150%', min: 150, rate: 'tier4Rate', color: '#7c3aed', chart: '#a855f7' }
  ];

  let storageNote = '';   // ข้อความเตือนเรื่อง localStorage ต้องขึ้นให้ผู้ใช้เห็น ไม่เงียบ
  let storageOk = true;

  function clampNumber(value, min, max, fallback, integer) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    const v = Math.min(max, Math.max(min, n));
    return integer ? Math.round(v) : v;
  }

  function sanitize(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      mode: src.mode === 'over_unit' ? 'over_unit' : 'tier_fixed',
      minHours: clampNumber(src.minHours, 0, 24, DEFAULTS.minHours),
      minDays: clampNumber(src.minDays, 1, 400, DEFAULTS.minDays, true),
      tier1Rate: clampNumber(src.tier1Rate, 0, 100000, DEFAULTS.tier1Rate),
      tier2Rate: clampNumber(src.tier2Rate, 0, 100000, DEFAULTS.tier2Rate),
      tier3Rate: clampNumber(src.tier3Rate, 0, 100000, DEFAULTS.tier3Rate),
      tier4Rate: clampNumber(src.tier4Rate, 0, 100000, DEFAULTS.tier4Rate),
      unitRate: clampNumber(src.unitRate, 0, 1000, DEFAULTS.unitRate),
      hideResigned: src.hideResigned === true
    };
  }

  /* อ่าน/เขียน localStorage ต้อง try/catch ทุกครั้ง (โหมดส่วนตัวหรือปิดคุกกี้ไว้จะ throw)
     และถ้าทำไม่สำเร็จต้องบอกบนหน้า ไม่ใช่เงียบ ๆ */
  function loadConfig() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return sanitize(null);
      return sanitize(JSON.parse(raw));
    } catch (e) {
      storageOk = false;
      storageNote = 'อ่านเกณฑ์ที่เคยบันทึกไว้ในเครื่องไม่ได้ (' + (e && e.message ? e.message : 'localStorage ใช้ไม่ได้') + ') หน้านี้จึงใช้ค่าเริ่มต้น';
      return sanitize(null);
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
      storageOk = true;
      storageNote = '';
      return true;
    } catch (e) {
      storageOk = false;
      storageNote = 'บันทึกเกณฑ์ลงเครื่องไม่สำเร็จ (' + (e && e.message ? e.message : 'localStorage ใช้ไม่ได้')
        + ') ค่าที่แก้ยังใช้ได้ในหน้านี้ แต่จะหายเมื่อรีเฟรชหรือปิดหน้า';
      return false;
    }
  }

  let cfg = loadConfig();

  /* ══════════ เกณฑ์วันขั้นต่ำที่ใช้จริง + ข้อเท็จจริงเรื่องชั่วโมงของช่วงที่เลือก ══════════
     rangeDays  = จำนวนวันไม่ซ้ำที่มีแถวผ่านตัวกรอง (วันที่ + ระบบ + กะ)
     effMinDays = เกณฑ์วันที่ใช้ตัดสินจริงในรอบเรนเดอร์นี้ = min(cfg.minDays, rangeDays)
                  ไม่ถอดเกณฑ์ออก ช่วงที่ยาวพอยังใช้ค่าที่ตั้งไว้เต็ม แต่ช่วงสั้นกว่าเกณฑ์จะลดลงมา
                  แล้วขึ้นแถบเตือน (dayLimitNotice) บอกว่าลดเพราะอะไร ไม่ปล่อยให้เห็น ฿0 เฉย ๆ
     hoursFacts = นับแถวชั่วโมงสั้นแยกว่าเข้าเฉลี่ยหรือเป็น Not Count เพื่อเขียนโน้ตให้ตรงข้อมูลจริง
                  (ห้ามเขียนตัวเลขตายตัวในโน้ต เพราะข้อมูลเปลี่ยนได้) */
  const SHORT_HOURS = 4;
  let rangeDays = 0;
  let effMinDays = cfg.minDays;
  let hoursFacts = { shortCounted: 0, shortNotCount: 0, minCountedHours: null };

  /* ══════════ 2) รวมยอดรายคนตามสูตร V1 ══════════ */
  function affiliationOf(person, roster) {
    const master = roster && roster.get ? roster.get(person.id) : null;
    const fromRoster = master ? String(master[4] ?? '').trim() : '';   // 2ND คอลัมน์ E สังกัด
    if (fromRoster && !M.isPlaceholder(fromRoster)) return fromRoster;
    // ไม่มีในทะเบียนจึงใช้คอลัมน์ AI ของ Results Master ค่าที่พบบ่อยที่สุดของคนนั้น
    let best = '', bestCount = 0;
    person.affCount.forEach((count, name) => {
      if (count > bestCount && !M.isPlaceholder(name)) { best = name; bestCount = count; }
    });
    return best || 'Not Found';
  }

  function buildPeople() {
    const S = shared();
    const data = S.visible();                                   // แถวที่ผ่านตัวกรองวันที่ + ระบบ + กะ
    const roster = S.roster;
    const resigned = M.resignedMap(S.source.sheets['Resigned']);  // ชีต Resigned อยู่อีกไฟล์ อ่านไม่ได้ก็ได้ Map ว่าง
    const byId = new Map();
    const rangeDaySet = new Set();
    hoursFacts = { shortCounted: 0, shortNotCount: 0, minCountedHours: null };

    data.forEach((r) => {
      /* นับวันและชั่วโมงสั้นจากทุกแถวที่ผ่านตัวกรอง (รวมแถวที่ไม่มีรหัสพนักงาน)
         เพราะเป็นข้อเท็จจริงของ "ช่วงที่เลือก" ไม่ใช่ของคนใดคนหนึ่ง */
      const day = M.date(r[2]);
      if (day) rangeDaySet.add(day);
      const gHours = M.number(r[6]);
      const afValue = M.number(r[31]);
      if (afValue > 0) {
        if (hoursFacts.minCountedHours === null || gHours < hoursFacts.minCountedHours) hoursFacts.minCountedHours = gHours;
        if (gHours < SHORT_HOURS) hoursFacts.shortCounted += 1;
      } else if (gHours > 0 && gHours < SHORT_HOURS) hoursFacts.shortNotCount += 1;

      const id = M.userId(r);
      if (!id) return;
      let p = byId.get(id);
      if (!p) {
        p = {
          id, name: M.personName(r, roster), nick: M.personNickname(r, roster),
          total: 0, hours: 0, sum: 0, count: 0, countedHours: 0,
          days: new Set(), zoneRows: new Map(), affCount: new Map(), countedRows: []
        };
        byId.set(id, p);
      }
      p.total += M.number(r[4]);        // Total Pick นับทุกแถวที่มีวันที่ รวมแถว Not Count
      p.hours += gHours;                // ชั่วโมงรวมคอลัมน์ G ทุกแถว (แสดงในตารางแบบเดียวกับ V2)
      const aff = String(r[34] ?? '').trim();
      if (aff) p.affCount.set(aff, (p.affCount.get(aff) || 0) + 1);

      if (afValue > 0) {                // เข้าเฉลี่ย Productivity เฉพาะแถวที่ AF > 0
        p.sum += afValue;
        p.count += 1;
        p.countedHours += gHours;
        p.days.add(day);
        p.countedRows.push(r);
        const z = S.zone(r);
        const key = z ? z.key : 'unknown';
        p.zoneRows.set(key, (p.zoneRows.get(key) || 0) + 1);
      }
    });

    /* เกณฑ์วันขั้นต่ำที่ใช้จริงของรอบนี้ — ลดลงเท่าจำนวนวันที่มีข้อมูลในช่วงที่เลือก ถ้าช่วงสั้นกว่าเกณฑ์
       (ช่วงวันเดียวจึงยังคิดเงินได้ ไม่ใช่ ฿0 ทั้งหน้า) และ dayLimitNotice() จะบอกผู้ใช้ว่าลดให้เพราะอะไร */
    rangeDays = rangeDaySet.size;
    effMinDays = rangeDays > 0 ? Math.max(1, Math.min(cfg.minDays, rangeDays)) : cfg.minDays;

    const zoneByKey = new Map(S.zones.map((z) => [z.key, z]));
    zoneByKey.set('unknown', { key: 'unknown', label: 'Not Found', group: '' });

    const list = [];
    byId.forEach((p) => {
      if (!p.count) return;             // ไม่มีแถวเข้าเฉลี่ย ไม่ตัดสิน (กฎ V1)
      const main = [...p.zoneRows.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
      const zone = zoneByKey.get(main[0]) || zoneByKey.get('unknown');
      const target = S.zoneTargetOf(zone);
      const average = p.sum / p.count;                       // สูตร V1
      const payDays = p.days.size;                           // วันที่มีแถวเข้าเฉลี่ย (ไม่ใช่จำนวนแถว)
      /* ชั่วโมงเฉลี่ย "ต่อวัน" ต้องหารด้วยจำนวนวัน ไม่ใช่จำนวนแถว
         หนึ่งวันมีได้หลายแถว (กะคร่อมวัน/หลายประเภทงาน) ถ้าหารด้วยแถวจะได้เลขต่ำกว่าจริงและเกณฑ์ชั่วโมงจะตัดเกิน */
      const avgHours = payDays ? p.countedHours / payDays : 0;
      /* หน่วยที่หยิบเกินเป้า คิดรายแถวที่เข้าเฉลี่ย: max(0, Total Pick ของแถว − ชั่วโมง G × Target โซน)
         คิดรายแถวเพื่อไม่ให้วันที่ต่ำกว่าเป้ามาหักล้างวันที่เกินเป้า (V2 คิดรวมทั้งช่วงจึงหักล้างกันได้) */
      let overUnits = 0;
      p.countedRows.forEach((r) => {
        overUnits += Math.max(0, M.number(r[4]) - M.number(r[6]) * target);
      });
      const res = resigned.get(p.id)
        || (window.V3RosterWrite && window.V3RosterWrite.resignedDraft ? window.V3RosterWrite.resignedDraft(p.id) : null);

      list.push({
        id: p.id, name: p.name, nick: p.nick,
        aff: affiliationOf(p, roster),
        zone, target, average, payDays, avgHours, overUnits,
        rowsCounted: p.count, zoneRowCount: main[1], zoneCount: p.zoneRows.size,
        total: p.total, hours: p.hours, countedHours: p.countedHours,
        ach: target > 0 ? average / target * 100 : 0,
        resigned: res || null
      });
    });

    /* ประเมินเกณฑ์และคิดเงิน
       ลำดับการบอกสาเหตุ: ไม่ถึงเป้าโซนมาก่อน แล้วจึงเกณฑ์ชั่วโมง แล้วเกณฑ์วัน
       เพราะคนที่ไม่ถึงเป้าโซนอยู่แล้วไม่มีเงินให้เกณฑ์ขั้นต่ำตัด ถ้าติดป้าย "ตัดเพราะเกณฑ์วัน"
       จะทำให้ผลของเกณฑ์ดูใหญ่กว่าจริงและบอกสาเหตุผิดคน (เหตุผลรองยังขึ้นในช่อง Remark ครบ)
       สิทธิ์รับเงินไม่เปลี่ยน: ต้องผ่านทั้งเป้าโซน เกณฑ์ชั่วโมง และเกณฑ์วัน จึงจะ block = '' */
    list.forEach((x) => {
      x.meetsTarget = x.average >= x.target;                   // เท่ากับเป้านับว่าผ่าน
      x.shortHours = x.avgHours < cfg.minHours;
      x.shortDays = x.payDays < effMinDays;
      x.block = !x.meetsTarget ? 'below' : (x.shortHours ? 'hours' : (x.shortDays ? 'days' : ''));
      x.tier = x.block ? -1 : tierIndexOf(x.ach);
      x.excludedResigned = Boolean(cfg.hideResigned && x.resigned);
      x.reward = rewardOf(x, x.tier);
      x.budget = x.excludedResigned ? 0 : x.reward;            // ยอดที่นับเข้างบจริง
      /* เงินที่จะได้ถ้าไม่มีเกณฑ์ขั้นต่ำ ใช้บอกว่าเกณฑ์ขั้นต่ำทำให้เสียเงินจริงเท่าไร
         คนที่ไม่ถึงเป้าโซนได้ 0 เพราะไม่มีสิทธิ์รับเงินอยู่แล้ว */
      x.potential = rewardOf(x, x.meetsTarget ? tierIndexOf(x.ach) : -1);
      x.cutByMin = x.block === 'hours' || x.block === 'days' ? x.potential : 0;
    });

    return list;
  }

  /* เงินรางวัลของระดับ Tier ที่ระบุ — ใช้ทั้งเงินจริงและเงินที่จะได้ถ้าไม่ติดเกณฑ์ขั้นต่ำ
     โหมด tier_fixed จ่ายเป็นบาทต่อวันที่เข้าเฉลี่ย → คูณจำนวนวันจริง
     โหมด over_unit จ่ายตามหน่วยที่หยิบเกินเป้า × อัตราต่อหน่วย (อัตราเดียวทุก Tier เหมือน V2) */
  function rewardOf(x, tier) {
    if (tier < 0) return 0;
    return cfg.mode === 'tier_fixed'
      ? Math.round(Number(cfg[TIERS[tier].rate]) * x.payDays)
      : Math.round(x.overUnits * Number(cfg.unitRate));
  }

  function tierIndexOf(ach) {
    for (let i = TIERS.length - 1; i >= 0; i--) if (ach >= TIERS[i].min) return i;
    return 0;
  }

  /* ══════════ 3) แผงตั้งค่าเกณฑ์ ══════════ */
  function numberField(id, label, value, step, min, max, hint, disabled) {
    return `<label style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:600;color:#475569;">
      <span>${esc(label)}</span>
      <input type="number" id="${id}" value="${esc(value)}" step="${esc(step)}" min="${esc(min)}" max="${esc(max)}"
        ${disabled ? 'disabled' : ''}
        style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:9px;font-size:13px;font-family:inherit;font-weight:700;color:#0f172a;background:${disabled ? '#f1f5f9' : '#fff'};">
      <span style="font-size:10.5px;font-weight:500;color:#94a3b8;">${esc(hint)}</span>
    </label>`;
  }

  function configPanel() {
    const fixed = cfg.mode === 'tier_fixed';
    const status = storageOk
      ? 'เกณฑ์ที่ตั้งไว้ถูกบันทึกในเครื่องนี้เท่านั้น (localStorage คีย์ ' + KEY + ') ไม่ส่งออกไปที่ไหนและไม่เขียนกลับ Google Sheet'
      : storageNote;

    return `<div class="card wide" style="margin-bottom:18px;background:linear-gradient(135deg,#f8fafc,#eff6ff);border:1px solid #dbeafe;padding:16px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:700;color:#1e3a8a;">⚙️ กำหนดเกณฑ์และอัตราเงินรางวัล</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:12px;color:#475569;font-weight:600;">รูปแบบการจ่าย</span>
          <select id="v3IncMode" style="padding:5px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-family:inherit;background:#fff;font-weight:600;">
            <option value="tier_fixed" ${fixed ? 'selected' : ''}>อัตราคงที่ตามระดับ Tier (บาท/วันที่เข้าเฉลี่ย)</option>
            <option value="over_unit" ${fixed ? '' : 'selected'}>จ่ายตามหน่วยหยิบเกินเป้า (บาท/หน่วย)</option>
          </select>
          <button type="button" id="v3IncReset" style="border:1px solid #cbd5e1;background:#fff;color:#334155;padding:6px 14px;border-radius:9px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">↺ คืนค่าเริ่มต้น</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;">
        ${numberField('v3IncMinHours', 'ชั่วโมงเฉลี่ยขั้นต่ำ/วัน', cfg.minHours, '0.5', '0', '24', 'ชั่วโมง (คอลัมน์ G) เฉลี่ยต่อวันที่เข้าเฉลี่ย', false)}
        ${numberField('v3IncMinDays', 'วันที่เข้าเฉลี่ยขั้นต่ำ', cfg.minDays, '1', '1', '400',
          effMinDays < cfg.minDays
            ? 'ช่วงที่เลือกมี ' + fmt(rangeDays) + ' วัน จึงใช้เกณฑ์ ' + fmt(effMinDays) + ' วันในรอบนี้'
            : 'กันคนที่มีไม่กี่วันแล้วค่าเฉลี่ยเหวี่ยง', false)}
        ${numberField('v3IncTier1', '🥉 Bronze (บาท/วัน)', cfg.tier1Rate, '10', '0', '100000', '100% – 114% ของเป้าโซน', !fixed)}
        ${numberField('v3IncTier2', '🥈 Silver (บาท/วัน)', cfg.tier2Rate, '10', '0', '100000', '115% – 129% ของเป้าโซน', !fixed)}
        ${numberField('v3IncTier3', '🥇 Gold (บาท/วัน)', cfg.tier3Rate, '10', '0', '100000', '130% – 149% ของเป้าโซน', !fixed)}
        ${numberField('v3IncTier4', '💎 Platinum (บาท/วัน)', cfg.tier4Rate, '10', '0', '100000', '150% ของเป้าโซนขึ้นไป', !fixed)}
        ${numberField('v3IncUnitRate', 'อัตราต่อหน่วยเกินเป้า (บาท)', cfg.unitRate, '0.05', '0', '1000', 'ใช้เฉพาะโหมดจ่ายตามหน่วยหยิบเกินเป้า', fixed)}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px;">
        <label style="display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#334155;cursor:pointer;">
          <input type="checkbox" id="v3IncHideResigned" ${cfg.hideResigned ? 'checked' : ''}>
          ไม่นับคนที่ออกแล้วในงบ (ยังแสดงในตารางพร้อม Remark แดง)
        </label>
        <div class="metric-sub" id="v3IncStatus" style="font-size:11px;color:${storageOk ? '#64748b' : '#b91c1c'};font-weight:${storageOk ? '500' : '700'};max-width:640px;text-align:right;">${esc(status)}</div>
      </div>
    </div>`;
  }

  /* ══════════ แถบเตือนเมื่อช่วงวันที่ที่เลือกสั้นกว่าเกณฑ์วันขั้นต่ำ ══════════
     ตัวกรองเริ่มต้นของเว็บเป็นวันล่าสุดวันเดียว ถ้าเงียบไว้ผู้ใช้จะเห็น ฿0 ทุกช่องแล้วคิดว่าหน้าเสีย
     จึงต้องบอกตรง ๆ ว่าเกณฑ์ถูกลดลงเพราะช่วงสั้น และเตือนว่าค่าเฉลี่ยของช่วงสั้นเหวี่ยงสูง */
  function dayLimitNotice() {
    if (!rangeDays || effMinDays >= cfg.minDays) return '';
    return `<div class="card wide" style="margin:-6px 0 18px;background:#fffbeb;border:1px solid #fcd34d;padding:13px 17px;">
      <div style="font-size:13px;font-weight:800;color:#92400e;">⚠️ ช่วงวันที่ที่เลือกสั้นกว่าเกณฑ์วันขั้นต่ำ หน้านี้จึงลดเกณฑ์ให้เฉพาะช่วงนี้</div>
      <div style="font-size:12px;color:#78350f;line-height:1.65;margin-top:5px;">
        ช่วงที่เลือกมีข้อมูลจริง <b>${esc(fmt(rangeDays))} วัน</b> แต่เกณฑ์ “วันที่เข้าเฉลี่ยขั้นต่ำ” ที่ตั้งไว้คือ <b>${esc(fmt(cfg.minDays))} วัน</b>
        ถ้าใช้ ${esc(fmt(cfg.minDays))} วันตรง ๆ จะไม่มีใครผ่านเกณฑ์เลยและงบจะเป็น ฿0 ทั้งหน้า
        หน้านี้จึงตัดสินด้วยเกณฑ์ <b>${esc(fmt(effMinDays))} วัน</b> ในรอบนี้ (ค่าที่ตั้งไว้ยังเป็น ${esc(fmt(cfg.minDays))} วัน
        และจะกลับมาใช้เต็มเมื่อเลือกช่วงที่ยาวพอ)<br>
        คนที่มีข้อมูลไม่กี่วันมีค่าเฉลี่ยเหวี่ยงสูง ตัวเลขชุดนี้จึงดูแนวโน้มได้ แต่ยังไม่ควรใช้ตัดสินจ่ายเงิน —
        <b>ขยายช่วงวันที่บนแถบตัวกรองด้านบนให้ครบ ${esc(fmt(cfg.minDays))} วันก่อน</b> หรือจะลดเกณฑ์ในแผงด้านบนให้ตรงกับช่วงที่ใช้จริงก็ได้
      </div>
    </div>`;
  }

  /* ══════════ แถบอธิบายเมื่อไม่มีใครผ่านเกณฑ์เลย ══════════
     ฿0 ทั้งหน้าต้องมีคำอธิบายกำกับเสมอว่าติดอะไร ไม่ปล่อยให้ผู้ใช้เดา */
  function noEligibleNotice(counts) {
    return `<div class="card wide" style="margin:-6px 0 18px;background:#fef2f2;border:1px solid #fecaca;padding:13px 17px;">
      <div style="font-size:13px;font-weight:800;color:#991b1b;">ℹ️ ยังไม่มีใครผ่านเกณฑ์รับสิทธิ์ในช่วงที่เลือก จึงเป็น ฿0 ทุกช่อง</div>
      <div style="font-size:12px;color:#7f1d1d;line-height:1.65;margin-top:5px;">
        คนที่นับ Productivity ได้ในช่วงนี้ ${esc(fmt(counts.people))} คน แยกเป็น
        ไม่ถึงเป้าโซน <b>${esc(fmt(counts.below))} คน</b>
        · ชั่วโมงเฉลี่ย/วันไม่ถึงเกณฑ์ ${esc(fmt(cfg.minHours, 1))} ชม. <b>${esc(fmt(counts.hours))} คน</b>
        · วันที่เข้าเฉลี่ยไม่ถึงเกณฑ์ ${esc(fmt(effMinDays))} วัน <b>${esc(fmt(counts.days))} คน</b>
        ${counts.resigned ? '· ถูกตัดเพราะออกแล้ว <b>' + esc(fmt(counts.resigned)) + ' คน</b>' : ''}<br>
        แก้ได้สองทาง: ขยายช่วงวันที่บนแถบตัวกรองด้านบน หรือปรับเกณฑ์ในแผงตั้งค่าด้านบนให้ตรงกับช่วงที่ใช้จริง
      </div>
    </div>`;
  }

  function bindConfig() {
    const commit = (changed) => {
      if (changed) saveConfig();
      /* ต้องเรียกตัวที่มี try/catch เหมือนทางอื่น ไม่เรียก renderPage() ตรง ๆ
         ไม่งั้นถ้าคิดพลาดจะเหลือหน้าค้างครึ่งเดียวโดยไม่มีข้อความบอก */
      renderSafe();
    };
    const numeric = [
      ['v3IncMinHours', 'minHours', 0, 24, false],
      ['v3IncMinDays', 'minDays', 1, 400, true],
      ['v3IncTier1', 'tier1Rate', 0, 100000, false],
      ['v3IncTier2', 'tier2Rate', 0, 100000, false],
      ['v3IncTier3', 'tier3Rate', 0, 100000, false],
      ['v3IncTier4', 'tier4Rate', 0, 100000, false],
      ['v3IncUnitRate', 'unitRate', 0, 1000, false]
    ];
    numeric.forEach(([id, key, min, max, integer]) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => {
        // ปล่อยช่องว่างไว้ไม่ควรกลายเป็น 0 ให้คืนค่าเดิมแทน
        if (String(el.value).trim() === '') { el.value = cfg[key]; return; }
        const next = clampNumber(el.value, min, max, cfg[key], integer);
        if (next === cfg[key]) { el.value = cfg[key]; return; }
        cfg[key] = next;
        commit(true);
      });
    });
    const mode = $('v3IncMode');
    if (mode) mode.addEventListener('change', () => { cfg.mode = mode.value === 'over_unit' ? 'over_unit' : 'tier_fixed'; commit(true); });
    const hide = $('v3IncHideResigned');
    if (hide) hide.addEventListener('change', () => { cfg.hideResigned = hide.checked; commit(true); });
    const reset = $('v3IncReset');
    if (reset) reset.addEventListener('click', () => { cfg = sanitize(null); commit(true); });
  }

  /* ══════════ 4) การ์ด 4 Tier (เหมือน V2) ══════════ */
  function tierCards() {
    const fixed = cfg.mode === 'tier_fixed';
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px;">
      ${TIERS.map((t) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;border-top:3px solid ${t.chart};">
        <div><span class="badge-status ${t.cls}">${t.icon} ${t.name}</span></div>
        <div style="font-size:11.5px;color:#64748b;font-weight:600;margin-top:6px;">${esc(t.band)} ของ Target โซน</div>
        <div style="font-size:17px;font-weight:800;color:${t.color};margin-top:3px;">
          ${fixed ? baht(cfg[t.rate]) + ' / วันที่เข้าเฉลี่ย' : '฿' + fmt(cfg.unitRate, 2) + ' / หน่วยที่เกินเป้า'}
        </div>
      </div>`).join('')}
    </div>
    ${fixed ? '' : `<div class="sub" style="margin:-8px 0 16px;">โหมดจ่ายตามหน่วยหยิบเกินเป้าใช้อัตราเดียวกันทุก Tier (เหมือน V2) ระดับ Tier จึงเป็นแค่ป้ายบอกระดับ
      · เงินรางวัล = ผลรวม<b>รายแถวที่เข้าเฉลี่ย (AF &gt; 0)</b> ของ max(0, Total Pick ของแถวนั้น − ชั่วโมง G ของแถวนั้น × Target โซน) × ${esc(fmt(cfg.unitRate, 2))} บาท
      · แถวที่ AF เป็น Not Count ไม่เข้าสูตรนี้ ทั้งที่คอลัมน์ Total Pick ในตารางรวมแถวเหล่านั้นไว้ด้วย
      จึงไล่เลขจากคอลัมน์ Total Pick ตรง ๆ ไม่ได้ ให้ดูคอลัมน์ “หน่วยที่เกินเป้า” ซึ่งเป็นตัวที่เอาไปคูณอัตราจริง</div>`}`;
  }

  /* ══════════ 5) กราฟ ══════════ */
  function drawCharts(list) {
    if (typeof Chart === 'undefined') return;

    /* โดนัท: สัดส่วนพนักงานตามระดับ Tier — ทุกคนอยู่ถังเดียวเท่านั้น */
    const donut = $('v3IncentiveTierChart');
    if (donut) {
      Chart.getChart('v3IncentiveTierChart')?.destroy();
      const slices = TIERS.map((t, i) => ({
        name: `${t.icon} ${t.name} (${t.band})`,
        count: list.filter((x) => x.tier === i && !x.excludedResigned).length,
        color: t.chart
      }));
      /* คนที่ไม่ถึงเป้าโซนลงถัง "ไม่ถึงเป้าโซน" ก่อน แม้จะมีวัน/ชั่วโมงไม่ถึงเกณฑ์ด้วย
         เพราะไม่มีเงินให้เกณฑ์ขั้นต่ำตัด ถังเกณฑ์ขั้นต่ำจึงเหลือเฉพาะคนที่ถึงเป้าโซนแล้วแต่ติดเกณฑ์ */
      slices.push({ name: 'ไม่ถึงเป้าโซน', count: list.filter((x) => x.block === 'below' && !x.excludedResigned).length, color: '#cbd5e1' });
      slices.push({ name: 'ถึงเป้าโซนแต่ติดเกณฑ์ขั้นต่ำ', count: list.filter((x) => (x.block === 'hours' || x.block === 'days') && !x.excludedResigned).length, color: '#fecdd3' });
      if (cfg.hideResigned) slices.push({ name: 'ออกแล้ว (ไม่นับในงบ)', count: list.filter((x) => x.excludedResigned).length, color: '#fca5a5' });
      const shown = slices.filter((s) => s.count > 0);
      const denom = shown.reduce((a, s) => a + s.count, 0) || 1;
      new Chart(donut, {
        type: 'doughnut',
        data: {
          labels: shown.map((s) => s.name),
          datasets: [{ data: shown.map((s) => s.count), backgroundColor: shown.map((s) => s.color), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12, font: { size: 11 } } },
            datalabels: { color: '#0f172a', font: { size: 11, weight: '700' }, formatter: (v) => (v > 0 ? fmt(v) : '') },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmt(ctx.parsed)} คน (${fmt(ctx.parsed / denom * 100, 1)}%)` } }
          }
        }
      });
    }

    /* แท่ง: งบ Incentive แยกตามสังกัด (คอลัมน์ AI / 2ND คอลัมน์ E) */
    const bar = $('v3IncentiveAffChart');
    if (bar) {
      Chart.getChart('v3IncentiveAffChart')?.destroy();
      /* ใส่ทุกสังกัดที่มีคนอยู่ในตาราง สังกัดที่ยังไม่มีใครได้เงินก็ขึ้นแท่งค่า 0 (เหมือน V2 app.js:9849)
         ไม่ตัดออก เพื่อให้เห็นว่าสังกัดนั้นมีคนแต่ยังไม่มีใครผ่านเกณฑ์ ไม่ใช่ไม่มีคนเลย */
      const byAff = new Map();
      list.forEach((x) => { if (!byAff.has(x.aff)) byAff.set(x.aff, 0); if (x.budget > 0) byAff.set(x.aff, byAff.get(x.aff) + x.budget); });
      const labels = [...byAff.keys()].sort((a, b) => byAff.get(b) - byAff.get(a) || String(a).localeCompare(String(b)));
      const amounts = labels.map((l) => byAff.get(l));
      const palette = ['rgba(37,99,235,.85)', 'rgba(16,185,129,.85)', 'rgba(245,158,11,.85)', 'rgba(124,58,237,.85)', 'rgba(244,63,94,.85)', 'rgba(8,145,178,.85)'];
      // ถ้าไม่มีสังกัดเลย (ตารางว่าง) ต้องยังส่ง labels/data/สี ให้ยาวเท่ากัน ไม่ใช่สีเป็น array ว่าง
      const barLabels = labels.length ? labels : ['ยังไม่มีใครได้รับสิทธิ์'];
      const barData = labels.length ? amounts : [0];
      new Chart(bar, {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [{
            label: 'งบประมาณ Incentive (บาท)',
            data: barData,
            backgroundColor: barData.map((v, i) => palette[i % palette.length]),
            borderRadius: 7,
            datalabels: { display: true, anchor: 'end', align: 'top', clamp: true, color: '#0f172a', font: { weight: '700', size: 10.5 }, formatter: (v) => (v > 0 ? baht(v) : '') }
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` งบรวม: ${baht(ctx.parsed.y)} บาท` } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
            y: { beginAtZero: true, suggestedMax: Math.max(...amounts, 1000) * 1.25, ticks: { callback: (v) => baht(v), font: { size: 10.5 } }, grid: { color: 'rgba(148,163,184,.25)' } }
          }
        }
      });
    }
  }

  /* ══════════ 6) ตารางรายคน ══════════ */
  function tierBadge(x) {
    if (x.tier >= 0) {
      const t = TIERS[x.tier];
      return `<span class="badge-status ${t.cls}">${t.icon} ${t.name}</span>`;
    }
    if (x.block === 'hours') return `<span class="badge-status fail">ชม.เฉลี่ย/วัน &lt; ${esc(fmt(cfg.minHours, 1))}</span>`;
    if (x.block === 'days') return `<span class="badge-status fail">วันเข้าเฉลี่ย &lt; ${esc(fmt(effMinDays))}</span>`;
    return '<span class="badge-status fail">ต่ำกว่าเป้าโซน</span>';
  }

  function tierName(x) {
    if (x.tier >= 0) return TIERS[x.tier].name;
    if (x.block === 'hours') return 'ชั่วโมงเฉลี่ยต่อวันไม่ถึงเกณฑ์';
    if (x.block === 'days') return 'วันที่เข้าเฉลี่ยไม่ถึงเกณฑ์';
    return 'ไม่ถึงเป้าโซน';
  }

  /* เหตุผลอื่น ๆ ที่ต้องบอกในช่อง Remark (แยกจากสถานะออกแล้ว เพื่อให้ Remark แดงอยู่คนละก้อน) */
  function remarkReasons(x) {
    const parts = [];
    /* บอกเหตุผลที่เข้าเงื่อนไขทุกข้อ ไม่ใช่แค่ข้อที่ถูกใช้เป็นป้ายสถานะ
       คนที่ไม่ถึงเป้าโซนอยู่แล้วต้องเห็นด้วยว่าเกณฑ์ขั้นต่ำไม่ใช่สาเหตุที่ทำให้เสียเงิน */
    if (x.shortHours) parts.push('ชั่วโมงเฉลี่ย ' + fmt(x.avgHours, 1) + ' ชม./วัน ต่ำกว่าเกณฑ์ ' + fmt(cfg.minHours, 1));
    if (x.shortDays) parts.push('เข้าเฉลี่ย ' + fmt(x.payDays) + ' วัน ต่ำกว่าเกณฑ์ ' + fmt(effMinDays) + ' วัน');
    if (x.block === 'below' && (x.shortHours || x.shortDays)) parts.push('ไม่ถึงเป้าโซนอยู่แล้ว เกณฑ์ขั้นต่ำจึงไม่ได้ตัดเงินของคนนี้');
    if (x.zoneCount > 1) parts.push('ทำ ' + fmt(x.zoneCount) + ' โซน');
    if (x.zone.key === 'unknown') parts.push('คอลัมน์ AH ไม่ตรงกฎโซนของ V1 จึงเทียบ Target รวม');
    return parts;
  }

  function resignedText(x) {
    if (!x.resigned) return '';
    return 'ออกแล้ว ' + dmy(x.resigned.date)
      + (x.resigned.source === 'web' ? ' (กรอกในเว็บ ยังไม่เข้าชีต)' : '')
      + (x.excludedResigned ? ' · ไม่นับในงบ' : '');
  }

  function remarkText(x) {
    return [resignedText(x), ...remarkReasons(x)].filter(Boolean).join(' · ');
  }

  function remarkHtml(x) {
    const bits = [];
    if (x.resigned) bits.push(`<span class="staff-resigned">⛔ ${esc(resignedText(x))}</span>`);
    const rest = remarkReasons(x);
    if (rest.length) bits.push(`<span class="sub">${esc(rest.join(' · '))}</span>`);
    return bits.join('') || '<span style="color:#94a3b8">—</span>';
  }

  function personColumns() {
    return [
      { title: '#', value: (x) => x.rank, num: true, html: (x) => `<span class="rank">${fmt(x.rank)}</span>` },
      { title: 'รหัสพนักงาน', value: (x) => x.id },
      {
        title: 'ชื่อ (2ND)', value: (x) => x.name,
        html: (x) => esc(x.name) + (x.nick ? `<span class="sub">ชื่อเล่น ${esc(x.nick)}</span>` : '')
      },
      { title: 'สังกัด', value: (x) => x.aff },
      {
        title: 'โซนหลัก', value: (x) => x.zone.label,
        html: (x) => `${esc(x.zone.label)}<span class="sub">${fmt(x.zoneRowCount)} แถวในโซนนี้</span>`
      },
      { title: 'วันที่เข้าเฉลี่ย', value: (x) => x.payDays, num: true, html: (x) => `${fmt(x.payDays)}<span class="sub">${fmt(x.rowsCounted)} แถวเข้าเฉลี่ย</span>` },
      {
        // ชั่วโมงรวม 0 แปลว่าไม่มีชั่วโมงบันทึกไว้ ไม่ใช่ทำงาน 0 ชม. จึงส่ง sortValue null ให้ไปท้ายตาราง
        // ค่านี้คือ ชั่วโมง G ของแถวที่เข้าเฉลี่ย ÷ จำนวนวันที่เข้าเฉลี่ย จึงเป็น "ต่อวัน" ตรงตามป้ายและตรงกับเกณฑ์
        title: 'ชม.เฉลี่ย/วัน', value: (x) => (x.avgHours > 0 ? Number(x.avgHours.toFixed(2)) : 0), num: true,
        sortValue: (x) => (x.avgHours > 0 ? x.avgHours : null),
        html: (x) => (x.avgHours > 0
          ? fmt(x.avgHours, 1) + `<span class="sub">เข้าเฉลี่ย ${fmt(x.countedHours, 1)} ชม. ÷ ${fmt(x.payDays)} วัน · ทุกแถวรวม ${fmt(x.hours, 1)} ชม.</span>`
          : '—')
      },
      { title: 'Total Pick', value: (x) => x.total, num: true, html: (x) => fmt(x.total) },
      {
        title: 'Productivity', value: (x) => Number(x.average.toFixed(2)), num: true,
        html: (x) => `<b style="color:${x.average >= x.target ? '#047857' : '#b91c1c'}">${fmt(x.average, 1)}</b><span class="sub">หยิบ/ชม.</span>`
      },
      { title: 'Target โซน', value: (x) => x.target, num: true },
      {
        title: '% เทียบเป้า', value: (x) => Number(x.ach.toFixed(1)), num: true,
        html: (x) => `<b style="color:${x.ach >= 100 ? '#059669' : '#d97706'}">${fmt(x.ach, 1)}%</b>`
      },
      { title: 'หน่วยที่เกินเป้า', value: (x) => Math.round(x.overUnits), num: true, html: (x) => fmt(Math.round(x.overUnits)) },
      { title: 'ระดับ Tier', value: (x) => tierName(x), html: (x) => tierBadge(x) },
      {
        /* value ต้องเท่ากับเลขที่ตาเห็น เพราะ V3Shared.table ใช้ value() ทั้งตอน Export CSV และตอนค้นหา
           คนที่ออกแล้วและถูกตัดออกจากงบจึงต้องได้เลขเงินรางวัลจริงใน CSV ไม่ใช่ 0
           ส่วนยอดที่นับเข้างบแยกเป็นคอลัมน์ถัดไป เพื่อให้ผลรวมของ CSV ตรงกับการ์ดงบรวม */
        title: 'เงินรางวัล (บาท)', value: (x) => x.reward, num: true,
        html: (x) => (x.budget > 0
          ? `<b style="color:#059669;font-size:14px;">${baht(x.budget)}</b>`
          : (x.reward > 0 ? `<span class="sub" style="color:#b91c1c">${baht(x.reward)} ไม่นับในงบ</span>` : '<span style="color:#94a3b8">—</span>'))
      },
      {
        title: 'นับเข้างบ (บาท)', value: (x) => x.budget, num: true,
        html: (x) => (x.budget > 0
          ? fmt(x.budget)
          : (x.reward > 0 ? '<span class="sub" style="color:#b91c1c">ไม่นับ (ออกแล้ว)</span>' : '<span style="color:#94a3b8">—</span>'))
      },
      { title: 'Remark', value: (x) => remarkText(x), html: (x) => remarkHtml(x) }
    ];
  }

  /* ══════════ 7) ประกอบหน้า ══════════ */
  function renderPage() {
    const S = shared();
    if (!S || !S.source) return;

    const list = buildPeople();
    const fixed = cfg.mode === 'tier_fixed';
    const modeText = fixed
      ? 'อัตราคงที่ตามระดับ Tier × จำนวนวันที่เข้าเฉลี่ย'
      : 'หน่วยที่หยิบเกินเป้า × ' + fmt(cfg.unitRate, 2) + ' บาท/หน่วย';

    if (!list.length) {
      host.innerHTML = configPanel() + dayLimitNotice()
        + '<div class="card v3-card"><div class="staff-miss-ok">ยังไม่มีพนักงานที่นับ Productivity ได้ในช่วงที่เลือก (ต้องมีแถวที่คอลัมน์ AF > 0 อย่างน้อยหนึ่งแถว)</div></div>';
      bindConfig();
      return;
    }

    const paid = list.filter((x) => x.budget > 0);
    const eligible = list.filter((x) => x.tier >= 0);
    const totalBudget = paid.reduce((a, x) => a + x.budget, 0);
    const avgReward = paid.length ? totalBudget / paid.length : 0;
    const top = [...paid].sort((a, b) => b.budget - a.budget)[0] || null;
    /* cutHours/cutDays = คนที่ถึงเป้าโซนแล้วแต่ติดเกณฑ์ขั้นต่ำ คือคนที่เกณฑ์ทำให้เสียเงินจริง
       shortHoursAll/shortDaysAll = คนที่เข้าเงื่อนไขชั่วโมง/วันน้อยทั้งหมด (ส่วนใหญ่ไม่ถึงเป้าโซนอยู่แล้ว)
       แยกสองชุดเพื่อไม่ให้ผลของเกณฑ์ดูใหญ่กว่าจริงบนการ์ดและในโน้ต */
    const cutHoursList = list.filter((x) => x.block === 'hours');
    const cutDaysList = list.filter((x) => x.block === 'days');
    const cutHours = cutHoursList.length;
    const cutDays = cutDaysList.length;
    const cutMinBaht = cutHoursList.concat(cutDaysList).reduce((a, x) => a + x.cutByMin, 0);
    const shortHoursAll = list.filter((x) => x.shortHours).length;
    const shortDaysAll = list.filter((x) => x.shortDays).length;
    // คนที่ชั่วโมง/วันน้อย แต่ไม่ถึงเป้าโซนอยู่แล้ว (นับหัวคนไม่ซ้ำ ไม่เอาสองเกณฑ์มาบวกกัน)
    const shortButBelow = list.filter((x) => (x.shortHours || x.shortDays) && x.block === 'below').length;
    const belowTarget = list.filter((x) => x.block === 'below').length;
    const cutResigned = list.filter((x) => x.excludedResigned && x.reward > 0);
    const cutResignedBaht = cutResigned.reduce((a, x) => a + x.reward, 0);
    const resignedAll = list.filter((x) => x.resigned).length;
    const eligiblePct = list.length ? eligible.length / list.length * 100 : 0;
    const unknownZone = list.filter((x) => x.zone.key === 'unknown').length;
    /* ประโยคเรื่องชั่วโมงสั้นต้องคิดจากข้อมูลจริงของช่วงที่เลือกทุกครั้ง ไม่เขียนตัวเลขตายตัว */
    const hoursFactText = 'เกณฑ์ชั่วโมงมองเฉพาะแถวที่เข้าเฉลี่ย (AF > 0) '
      + (hoursFacts.shortCounted
        ? `ช่วงนี้มีแถวเข้าเฉลี่ยที่ชั่วโมง G ต่ำกว่า ${fmt(SHORT_HOURS)} ชม. ${fmt(hoursFacts.shortCounted)} แถว`
        : `ช่วงนี้ไม่มีแถวเข้าเฉลี่ยไหนที่ชั่วโมง G ต่ำกว่า ${fmt(SHORT_HOURS)} ชม.`)
      + (hoursFacts.minCountedHours !== null ? ` (ต่ำสุด ${fmt(hoursFacts.minCountedHours, 1)} ชม.)` : '')
      + (hoursFacts.shortNotCount
        ? ` ส่วนแถวชั่วโมงสั้นที่ AF เป็น Not Count มี ${fmt(hoursFacts.shortNotCount)} แถว ซึ่งไม่เข้าค่าเฉลี่ยและไม่เข้าเกณฑ์ชั่วโมงของหน้านี้`
        : '')
      + ' เกณฑ์ชั่วโมงจึงมักตัดไม่ได้ ตัวที่ได้ผลจริงคือเกณฑ์จำนวนวัน';

    list.sort((a, b) => (b.budget - a.budget) || (b.ach - a.ach) || String(a.id).localeCompare(String(b.id)));
    list.forEach((x, i) => { x.rank = i + 1; });

    host.innerHTML = configPanel()
      + dayLimitNotice()
      + (eligible.length ? '' : noEligibleNotice({
        people: list.length, below: belowTarget, hours: cutHours, days: cutDays, resigned: cutResigned.length
      }))
      + tierCards()
      + S.statCards([
        ['💰 ประมาณการ Incentive รวม', baht(totalBudget), 'บาท', 'ตามช่วงวันที่ ระบบ และกะ ที่เลือกบนแถบตัวกรอง · ' + modeText, '#059669'],
        ['👥 พนักงานที่ผ่านเกณฑ์รับสิทธิ์', fmt(eligible.length) + ' / ' + fmt(list.length), 'คน',
          fmt(eligiblePct, 1) + '% ของคนที่นับ Productivity ได้ในช่วงนี้'
          + (eligible.length !== paid.length ? ' · นับเข้างบจริง ' + fmt(paid.length) + ' คน' : ''), '#2563eb'],
        ['🏆 เงินรางวัลสูงสุดรายบุคคล', top ? baht(top.budget) : baht(0), 'บาท',
          top ? `${top.name} (${top.id}) · ${fmt(top.average, 1)} หยิบ/ชม. = ${fmt(top.ach, 1)}% ของเป้า · ${fmt(top.payDays)} วัน` : 'ยังไม่มีใครผ่านเกณฑ์', '#7c3aed'],
        ['📊 เฉลี่ยต่อผู้ได้รับสิทธิ์', baht(avgReward), 'บาท/คน', 'เฉลี่ยจากผู้ได้รับเงิน ' + fmt(paid.length) + ' คน', '#0891b2'],
        /* นับเฉพาะคนที่ "เสียเงินจริง" คือถึงเป้าโซนแล้วแต่ติดเกณฑ์ขั้นต่ำ หรือถูกตัดเพราะออกแล้ว
           คนที่ไม่ถึงเป้าโซนอยู่แล้วไม่มีเงินให้ตัด จึงไม่นับในการ์ดนี้ แต่บอกจำนวนไว้ในคำอธิบาย */
        ['🚫 ถูกตัดออกจากงบ', fmt(cutHours + cutDays + cutResigned.length), 'คน',
          `เฉพาะคนที่ถึงเป้าโซนแล้วแต่ติดเกณฑ์ขั้นต่ำ: ชม.เฉลี่ย/วันไม่ถึง ${fmt(cfg.minHours, 1)} ชม. ${fmt(cutHours)} คน`
          + ` · วันเข้าเฉลี่ยไม่ถึง ${fmt(effMinDays)} วัน ${fmt(cutDays)} คน = เสียเงินจริง ${baht(cutMinBaht)}`
          + (cfg.hideResigned ? ` · ออกแล้ว ${fmt(cutResigned.length)} คน (${baht(cutResignedBaht)})` : '')
          + ` · อีก ${fmt(shortButBelow)} คนที่ชั่วโมง/วันน้อยไม่ถึงเป้าโซนอยู่แล้ว จึงนับอยู่ในถังไม่ถึงเป้า`, '#be123c']
      ])
      + `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:18px;margin:18px 0;">
        <div class="card wide" style="margin:0;">
          <h3>🎖️ สัดส่วนพนักงานตามระดับ Tier</h3>
          <div class="sub">แต่ละคนอยู่ถังเดียวเท่านั้น: Bronze / Silver / Gold / Platinum / ไม่ถึงเป้าโซน / ถึงเป้าโซนแต่ติดเกณฑ์ขั้นต่ำ
            · คนที่ไม่ถึงเป้าโซนอยู่ถัง “ไม่ถึงเป้าโซน” แม้จะมีวันหรือชั่วโมงไม่ถึงเกณฑ์ด้วย เพราะไม่มีเงินให้เกณฑ์ขั้นต่ำตัด</div>
          <div class="chartbox"><canvas id="v3IncentiveTierChart"></canvas></div>
        </div>
        <div class="card wide" style="margin:0;">
          <h3>🏢 งบประมาณ Incentive แยกตามสังกัด</h3>
          <div class="sub">สังกัดยึดทะเบียน 2ND คอลัมน์ E ถ้าไม่มีจึงใช้คอลัมน์ AI ของ Results Master ที่พบบ่อยที่สุดของคนนั้น</div>
          <div class="chartbox"><canvas id="v3IncentiveAffChart"></canvas></div>
        </div>
      </div>

      <div class="note v3-notice">
        <b>ตัวเลขบนหน้านี้เป็นการประมาณการบนหน้าเว็บเท่านั้น ไม่ผูกกับระบบจ่ายเงินจริง ไม่ใช่การอนุมัติ และไม่เขียนกลับ Google Sheet</b><br>
        <b>ที่มาของตัวเลข</b> · Productivity รายคน = ผลรวมคอลัมน์ AF ของแถวที่ AF &gt; 0 ÷ จำนวนแถวนั้น (รวมครั้งเดียว ไม่เอาค่าเฉลี่ยมาเฉลี่ยซ้ำ)
        · % ของเป้า = Productivity ÷ Target ของโซนหลัก × 100 โดยโซนหลักคือโซนที่มีแถวเข้าเฉลี่ยมากที่สุด
        · <b>เท่ากับเป้านับว่าผ่าน</b> · Total Pick = ผลรวมคอลัมน์ E ของทุกแถวที่มีวันที่ รวมแถวที่ AF เป็น Not Count
        · คนที่ไม่มีแถวเข้าเฉลี่ยเลย (AF &gt; 0 = 0 แถว) ไม่ถูกตัดสินผ่าน/ไม่ผ่าน จึงไม่อยู่ในหน้านี้
        · ไม่ลบ 7 ชั่วโมง ไม่ย้ายยอดหลังเที่ยงคืน ไม่ใช้สูตร UOM ของ V2<br>
        <b>สูตรเงินรางวัลของโหมดที่เลือกอยู่</b> · ${fixed
          ? 'อัตราคงที่ของ Tier × จำนวนวันที่เข้าเฉลี่ยของคนนั้น (ปัดเป็นจำนวนเต็มบาทตอนคำนวณ)'
          : `ผลรวม<b>รายแถวที่เข้าเฉลี่ย (AF &gt; 0)</b> ของ max(0, Total Pick ของแถวนั้น − ชั่วโมง G ของแถวนั้น × Target โซน) แล้วคูณ ${esc(fmt(cfg.unitRate, 2))} บาท/หน่วย
            · คิดรายแถวเพื่อไม่ให้แถวที่ต่ำกว่าเป้ามาหักล้างแถวที่เกินเป้า (V2 คิดรวมทั้งช่วงจึงหักล้างกันได้)
            · <b>แถวที่ AF เป็น Not Count ไม่เข้าสูตรนี้</b> ทั้งที่คอลัมน์ Total Pick ในตารางรวมแถวเหล่านั้นไว้
            จึงเอาคอลัมน์ Total Pick มาไล่เลขตรง ๆ ไม่ได้ ให้ดูคอลัมน์ “หน่วยที่เกินเป้า” ซึ่งเป็นตัวที่เอาไปคูณอัตราจริง`}
        · คอลัมน์ “เงินรางวัล” คือเงินของคนนั้น ส่วนคอลัมน์ “นับเข้างบ” คือยอดที่เอาไปรวมเป็นงบ
        (ต่างกันเฉพาะคนที่ถูกตัดเพราะออกแล้ว) ทั้งสองคอลัมน์ออก CSV ตรงกับที่แสดงบนหน้า<br>
        <b>เกณฑ์กันตัวเลขหลอก</b> · คนที่ทำไม่กี่วันหรือชั่วโมงสั้น ๆ จะมี Productivity เหวี่ยงขึ้นสูงแล้วได้ Tier เกินจริง
        จึงตัดด้วยชั่วโมงเฉลี่ยต่อวันขั้นต่ำ (${esc(fmt(cfg.minHours, 1))} ชม.) และวันที่เข้าเฉลี่ยขั้นต่ำ (${esc(fmt(effMinDays))} วัน) — แก้เกณฑ์ได้ที่แผงด้านบน
        · ชั่วโมงเฉลี่ย/วัน = ชั่วโมงคอลัมน์ G ของแถวที่เข้าเฉลี่ย ÷ จำนวนวันที่เข้าเฉลี่ย (หนึ่งวันมีได้หลายแถว จึงไม่หารด้วยจำนวนแถว)
        · เกณฑ์สองตัวนี้ทำให้เสียเงินจริงเฉพาะกับคนที่ถึงเป้าโซนอยู่แล้ว ซึ่งในช่วงนี้มี ${esc(fmt(cutHours))} คน (ชั่วโมง)
        และ ${esc(fmt(cutDays))} คน (วัน) รวมเป็นเงิน ${esc(baht(cutMinBaht))}
        ส่วนคนที่ชั่วโมงหรือวันน้อยแต่ไม่ถึงเป้าโซนอยู่แล้วอีก ${esc(fmt(shortButBelow))} คน ถูกนับในถัง “ไม่ถึงเป้าโซน”
        (ทั้งช่วงนี้มีคนชั่วโมงเฉลี่ยต่ำกว่าเกณฑ์ ${esc(fmt(shortHoursAll))} คน และวันน้อยกว่าเกณฑ์ ${esc(fmt(shortDaysAll))} คน)
        ${effMinDays < cfg.minDays
          ? `· <b>ช่วงที่เลือกมี ${esc(fmt(rangeDays))} วัน สั้นกว่าเกณฑ์ที่ตั้งไว้ ${esc(fmt(cfg.minDays))} วัน หน้านี้จึงใช้เกณฑ์ ${esc(fmt(effMinDays))} วันในรอบนี้ ไม่อย่างนั้นจะตัดทุกคนและงบเป็น ฿0 ทั้งหน้า</b>`
          : ''}
        · ${esc(hoursFactText)}<br>
        <b>คนที่ออกแล้ว</b> · ${esc(fmt(resignedAll))} คนในตารางอยู่ในชีต Resigned หรือถูกกรอกในเว็บ ขึ้น Remark แดงไว้
        ${cfg.hideResigned
          ? `· ตอนนี้ตัดออกจากงบแล้ว ${esc(fmt(cutResigned.length))} คน คิดเป็น ${esc(baht(cutResignedBaht))} บาท`
          : '· ตอนนี้ยังนับรวมในงบ ติ๊ก “ไม่นับคนที่ออกแล้วในงบ” ด้านบนเพื่อตัดออก'}
        ${unknownZone ? `<br><b>โซน Not Found</b> · ${esc(fmt(unknownZone))} คนมีคอลัมน์ AH ไม่ตรงกฎโซนของ V1 จึงเทียบกับ Target รวม ${esc(fmt(S.zoneTargetOf({ key: 'unknown', group: '' })))} หยิบ/ชม. ต้องเติม Zone ให้ถูกก่อนจะเชื่อเงินของกลุ่มนี้ได้` : ''}<br>
        <b>ที่ทำไม่ได้เพราะ V3 ไม่มีข้อมูล</b> · หน้านี้ของ V2 มีโหมดคิดเป็น “ชิ้น” (pcs/UOM) และคอลัมน์ Cycle Time ต่อหน่วย
        ซึ่งต้องใช้จำนวนชิ้นดิบ จำนวนบรรทัด และเวลาเริ่ม-จบระดับนาที — Results Master ไม่มีสามอย่างนี้ จึงคิดเป็น “หน่วยหยิบ” (คอลัมน์ E) เท่านั้น
        · ไม่มี blendedTarget จึงใช้ Target ของโซนตามกฎ V1 ตรง ๆ · ไม่มีโซนที่หยิบจริงรายรายการ (AH คือโซนสังกัด 1 แถวต่อคนต่อวัน)
        · V2 ติดป้ายว่า “บาท/วัน” แต่จ่ายครั้งเดียวต่อคนต่อช่วงวันที่ หน้านี้คูณด้วยจำนวนวันที่เข้าเฉลี่ยจริงเพื่อให้ตรงกับป้าย
      </div>

      <h2 class="staff-table-title">ตารางสรุปเงินรางวัล Incentive รายบุคคล</h2>
      <p class="panel-desc">เรียงเงินรางวัลมากไปน้อย · ค้นหาด้วยรหัส ชื่อ สังกัด หรือโซนได้ · กดหัวคอลัมน์เพื่อเรียงใหม่ · ปุ่ม Export CSV อยู่ในแถบเครื่องมือของตาราง</p>
      <div id="v3IncentiveTable"></div>`;

    bindConfig();
    /* กราฟกับตารางแยก try/catch กันคนละก้อน ถ้ากราฟพัง (Chart.js) ตารางต้องยังขึ้น
       และบอกผู้ใช้ตรงจุดที่พัง ไม่ใช่เหลือหน้าค้างครึ่งเดียวเงียบ ๆ */
    try {
      drawCharts(list);
    } catch (e) {
      console.error('V3 incentive (กราฟ):', e);
      const box = $('v3IncentiveTierChart');
      if (box && box.parentNode) box.parentNode.innerHTML = '<div class="sub" style="color:#b91c1c">วาดกราฟไม่สำเร็จ: ' + esc(e && e.message ? e.message : e) + ' ตัวเลขในการ์ดและตารางยังใช้ได้</div>';
    }
    S.table($('v3IncentiveTable'), 'incentive-people', list, personColumns());
  }

  /* ══════════ 8) ผูกการเรนเดอร์ ══════════
     .tab-panel ที่ไม่ได้เลือกเป็น display:none กราฟที่วาดตอนซ่อนจะได้ canvas สูง 0
     จึงเรนเดอร์เฉพาะตอน panel นี้ active และผูก 3 ทาง: subscribe / v3-render / คลิกปุ่มเมนู */
  const panel = document.getElementById('tab-incentive');
  let timer = null;

  function isActive() {
    return Boolean(panel && panel.classList.contains('active'));
  }

  /* เรนเดอร์ที่มี try/catch เสมอ — ทุกทางที่เรนเดอร์หน้านี้ (รวมการแก้ค่าในแผงตั้งค่า) ต้องผ่านตัวนี้ */
  function renderSafe() {
    try {
      renderPage();
    } catch (e) {
      console.error('V3 incentive:', e);
      host.innerHTML = '<div class="card v3-card"><div class="note v3-notice">หน้านี้คำนวณไม่สำเร็จ: '
        + esc(e && e.message ? e.message : e) + ' — เปิด Console ดูรายละเอียดได้ ตัวเลขหน้าอื่นไม่กระทบ</div></div>';
    }
  }

  /* เว็บรีเฟรชเองทุก 60 วินาที (script.js setInterval → v3-render) ถ้าเรนเดอร์ทับตอนผู้ใช้กำลังพิมพ์
     ในแผงตั้งค่า ค่าที่พิมพ์แต่ยังไม่ blur/Enter จะหายเงียบ ๆ จึงเลื่อนการเรนเดอร์ไว้ก่อน
     แล้วเรนเดอร์ทันทีที่ช่องนั้นหลุดโฟกัส (แบบเดียวกับที่ v2-shell.js กันช่อง Target) */
  let deferred = false;

  function editingConfig() {
    const el = document.activeElement;
    if (!el || !el.id || !/^v3Inc/.test(String(el.id))) return false;
    return host.contains ? host.contains(el) : true;
  }

  function render() {
    if (!isActive()) return;
    if (!window.V3Data || !window.V3Data.current) return;
    if (editingConfig()) { deferred = true; return; }
    deferred = false;
    renderSafe();
  }

  if (host && typeof host.addEventListener === 'function') {
    host.addEventListener('focusout', () => { if (deferred) schedule(150); });
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(render, delay || 0);
  }

  if (host && !host.innerHTML) {
    host.innerHTML = '<div class="card v3-card"><div class="staff-miss-ok">กำลังเตรียมหน้านี้…</div></div>';
  }

  if (window.V3Data && window.V3Data.subscribe) window.V3Data.subscribe(() => schedule(0));
  document.addEventListener('v3-render', () => schedule(0));
  // shell ใส่คลาส active ให้ panel ตอนคลิก จึงหน่วงไว้ราว 60ms ให้ panel แสดงก่อนแล้วค่อยวาด
  document.querySelectorAll('.nav-item[data-tab="incentive"]').forEach((btn) => btn.addEventListener('click', () => schedule(60)));
  schedule(60);
})();
