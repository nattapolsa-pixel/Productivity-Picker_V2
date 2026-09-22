/* คู่มือการใช้เว็บ — เขียนสั้น กระชับ ภาษาคน
   ขอบเขตของหน้านี้คือ "ใช้เว็บยังไง" เท่านั้น 4 หัวข้อ
     เริ่มใช้งาน · แถบด้านบน · ศัพท์ที่ต้องรู้ · เมนูไหนไว้ดูอะไร
   ผู้ใช้สั่ง 22/09/2569 ให้ตัดหัวข้อกับดัก / Target ของทีม / ข้อมูลไม่ครบ /
   ถามบ่อย / ทำไม่ได้ ออก เพราะไม่เกี่ยวกับการใช้เว็บ
   แล้วสั่งเพิ่มว่าให้ใส่ "เงื่อนไขและวิธีคิดเลขของแต่ละเมนู" กลับมา
   จึงย้ายไปอยู่ในการ์ดของเมนูนั้น ๆ (บรรทัด "คิดยังไง") ไม่แยกเป็นหัวข้อของตัวเอง
   ส่วนกฎที่ทุกเมนูใช้เหมือนกันเขียนไว้ครั้งเดียวบนสุดของหัวข้อเมนู

   ไม่คิดเลขเอง อ่านค่าจริงจาก window.TARGETS / V3Data มาเติมในข้อความ
   เพื่อไม่ให้คู่มือกับหน้าเว็บพูดไม่ตรงกันตอนใครเปลี่ยน Target หรือข้อมูลเดินหน้าไป
   หน้านี้ไม่มีกราฟ จึงไม่ต้องกัน canvas สูง 0 เหมือนหน้าอื่น แต่ยังเช็ค active
   เพื่อไม่ให้เสียรอบเรนเดอร์ตอนผู้ใช้อยู่หน้าอื่น */
(() => {
  'use strict';

  const HOST = 'v3Guide';
  const PANEL = 'tab-guide';
  const $ = (id) => document.getElementById(id);

  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const num = (value) => (Number.isFinite(Number(value))
    ? Number(value).toLocaleString('th-TH')
    : '—');

  const dmy = (iso) => {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
  };

  /* ค่าจริงที่เอามาเติมในคู่มือ ถ้ายังไม่มีข้อมูลก็ต้องอ่านคู่มือได้ตามปกติ
     จึงคืน '—' แทนการโยน error หรือปล่อยหน้าว่าง */
  function facts() {
    const T = window.TARGETS || {};
    const out = {
      overall: Number(T.overall) || 170,
      firstDate: '', lastDate: '', days: 0, totalPick: null,
    };
    try {
      const index = window.V3Data && window.V3Data.current && window.V3Data.current.index;
      if (index && Array.isArray(index.dateKeys) && index.dateKeys.length) {
        const keys = index.dateKeys.slice().sort();
        out.firstDate = keys[0];
        out.lastDate = keys[keys.length - 1];
        out.days = keys.length;
      }
      if (index) out.totalPick = Number(index.totalPick);
    } catch (error) {
      console.warn('guide facts', error);
    }
    return out;
  }

  const SECTIONS = [
    { id: 'g-start', icon: '🚀', chip: 'เริ่มใช้งาน', title: 'ใช้งาน 3 ขั้น',
      sub: 'เปิดมาแล้วทำอะไรก่อน', accent: 'indigo' },
    { id: 'g-filter', icon: '🎛️', chip: 'แถบด้านบน', title: 'แถบด้านบนทำอะไรได้',
      sub: 'ตัวกรองชุดเดียว มีผลทุกหน้าพร้อมกัน', accent: 'sky' },
    { id: 'g-terms', icon: '📚', chip: 'ศัพท์', title: 'ศัพท์ที่ต้องรู้',
      sub: 'รู้หกคำนี้ก็อ่านทุกหน้าได้', accent: 'teal' },
    { id: 'g-menu', icon: '🗂️', chip: 'เมนู', title: 'เมนูไหนไว้ดูอะไร',
      sub: 'แต่ละเมนูดูอะไร และตัวเลขคิดมาจากอะไร', accent: 'violet' },
  ];

  function card(id, bodyHtml) {
    const meta = SECTIONS.find((s) => s.id === id);
    return '<section class="guide-card" id="' + meta.id + '" data-accent="' + meta.accent + '">'
      + '<header class="guide-head">'
      + '<span class="guide-ico" aria-hidden="true">' + meta.icon + '</span>'
      + '<div><h2>' + esc(meta.title) + '</h2>'
      + '<p class="guide-sub">' + esc(meta.sub) + '</p></div>'
      + '</header>'
      + '<div class="guide-body">' + bodyHtml + '</div>'
      + '</section>';
  }

  // แถวแบบ "หัวข้อ → คำอธิบาย" ใช้ grid ไม่ใช้ <table>
  // เพราะ .affiliation-table ของ V2 ตั้ง min-width 1040px ไว้สำหรับตารางข้อมูล
  const rows = (list, labelHead, valueHead) =>
    '<dl class="guide-rows">'
    + '<div class="guide-row is-head"><dt>' + esc(labelHead) + '</dt><dd>'
    + esc(valueHead) + '</dd></div>'
    + list.map((r) => '<div class="guide-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('')
    + '</dl>';

  /* ── หัวหน้า + แถบข้ามหัวข้อ ── */
  function heroHtml(f) {
    const stats = [
      ['ช่วงข้อมูล', dmy(f.firstDate) + ' – ' + dmy(f.lastDate)],
      ['จำนวนวัน', num(f.days) + ' วัน'],
      ['ยอดหยิบรวม', Number.isFinite(f.totalPick) ? num(f.totalPick) + ' ชิ้น' : '—'],
      ['เป้าที่ใช้อยู่', num(f.overall) + ' หยิบ/ชม.'],
    ];
    return '<header class="guide-hero">'
      + '<div class="guide-hero-text">'
      + '<p class="guide-eyebrow">คู่มือการใช้เว็บ</p>'
      + '<h1>ใช้เว็บนี้ยังไง</h1>'
      + '<p>เลือกช่วงเวลา แล้วกดเมนูที่ตรงกับคำถามของคุณ · อ่านหน้านี้จบใน 2 นาที</p>'
      + '</div>'
      + '<div class="guide-hero-stats">'
      + stats.map((s) => '<div class="guide-stat"><span>' + esc(s[0]) + '</span>'
        + '<strong>' + esc(s[1]) + '</strong></div>').join('')
      + '</div></header>'
      + '<nav class="guide-toc" aria-label="ข้ามไปหัวข้อ">'
      + SECTIONS.map((s) => '<button type="button" data-jump="' + s.id + '">'
        + '<span aria-hidden="true">' + s.icon + '</span>' + esc(s.chip) + '</button>').join('')
      + '</nav>';
  }

  /* ── 1. เริ่มใช้งาน ── */
  function startHtml() {
    const steps = [
      ['เลือกช่วงวันที่', 'เปิดมาครั้งแรกเป็น <b>วันล่าสุดวันเดียว</b>'
        + ' · อยากดูทั้งเดือนกด <b>Monthly</b> · ดูทุกวันกด <b>ทั้งหมด</b>'],
      ['เลือกระบบกับกะ', 'ถ้าต้องการ — ไม่เลือกคือดูรวมทุกอย่าง'],
      ['กดเมนูซ้ายมือ', 'ที่ตรงกับคำถามของคุณ · เมนูที่มี <b>⭐</b> ดูก่อน'],
    ];
    return card('g-start',
      '<ol class="guide-steps">'
      + steps.map((s) => '<li><b>' + esc(s[0]) + '</b> ' + s[1] + '</li>').join('')
      + '</ol>');
  }

  /* ── 2. แถบตัวกรองด้านบน ── */
  function filterHtml(f) {
    const list = [
      ['<b>ระบบ</b><span class="guide-dim">ทั้งหมด / Pick (PTT) / Pick to Sort (BPS)</span>',
        'แยกว่าเป็นงานหยิบแบบไหน · เลือก <b>BPS</b> จะนับตั้งแต่ 08/06/2026 ขึ้นไป'],
      ['<b>กะ</b><span class="guide-dim">ทุกกะ / A / B / C / Not Found / Training / รายวัน</span>',
        'อ่านจากทะเบียนตรง ๆ ไม่เดาจากเวลาเข้างาน · <b>Not Found</b> คือยังไม่รู้ว่ากะอะไร'],
      ['<b>🎯 เป้า Target</b><span class="guide-dim">+ ปุ่ม ⚙️ ตั้งค่า Target</span>',
        'เป้าที่ใช้ตัดสินผ่าน/ไม่ผ่าน ตอนนี้ <b>' + num(f.overall) + ' หยิบ/ชม.</b>'
        + ' · ปรับที่นี่มีผลกับเครื่องนี้เท่านั้น'],
      ['<b>วันที่</b><span class="guide-dim">+ ปุ่ม ทั้งหมด / Weekly / Monthly</span>',
        'เปลี่ยนแล้วโหลดใหม่ทันที · <b>Weekly</b> = จันทร์นี้ถึงวันนี้'
        + ' · <b>Monthly</b> = วันที่ 1 ถึงวันนี้'],
      ['<b>↻ รีเฟรช</b>',
        'ดึงข้อมูลใหม่เดี๋ยวนี้ (ปกติเว็บดึงเองเรื่อย ๆ)'],
    ];
    return card('g-filter', rows(list, 'ตัวกรอง', 'ทำอะไร')
      + '<p class="guide-dim">ตัวกรองชุดนี้มีผลทุกหน้าพร้อมกัน เปลี่ยนที่เดียวเปลี่ยนหมด</p>');
  }

  /* ── 3. ศัพท์ที่ต้องรู้ ── */
  function termsHtml(f) {
    const terms = [
      ['📦', 'ยอดหยิบ', 'จำนวนชิ้นที่หยิบได้'],
      ['⚡', 'Productivity', 'หยิบได้กี่ชิ้นต่อชั่วโมง — ตัวเลขหลักที่ใช้วัดผลงาน'],
      ['🎯', 'Target', 'เป้าที่ควรทำได้ ตอนนี้ ' + num(f.overall) + ' หยิบ/ชม.'],
      ['%', '% Efficiency', 'ทำได้กี่เปอร์เซ็นต์ของเป้า — 100% คือถึงเป้าพอดี'],
      ['✔️', 'แถวเข้าเฉลี่ย', 'แถวที่นำมาคิด Productivity ได้'],
      ['❔', 'Not Found', 'แปลว่ายังไม่รู้ ไม่ได้แปลว่าผิด'],
    ];
    return card('g-terms', '<div class="guide-terms">'
      + terms.map((t) => '<article class="guide-term">'
        + '<span class="guide-term-ico" aria-hidden="true">' + t[0] + '</span>'
        + '<h4>' + esc(t[1]) + '</h4><p>' + esc(t[2]) + '</p></article>').join('')
      + '</div>');
  }

  /* ── 4. เมนูทั้งหมด + วิธีคิดเลขของแต่ละเมนู ──
     ทุกเมนูยืนบนกฎชุดเดียวกัน จึงเขียนกฎร่วมไว้ครั้งเดียวข้างบน
     แล้วในการ์ดบอกแค่ "เมนูนี้ต่างจากกฎร่วมยังไง" ไม่ต้องเขียนซ้ำ 13 รอบ */
  function menuHtml(f) {
    const basis = [
      ['ยอดหยิบ', 'บวกทุกแถวที่มีวันที่ในช่วงที่เลือก ไม่ตัดแถวไหนออก'],
      ['Productivity', 'เอาค่าเฉลี่ย/ชม. ของแถวที่เข้าเฉลี่ยมาบวกกัน แล้วหารด้วยจำนวนแถวนั้น'
        + ' <b>หารครั้งเดียวจบ</b> ไม่เอาค่าเฉลี่ยรายวันมาเฉลี่ยซ้ำ'],
      ['แถวเข้าเฉลี่ย', 'แถวที่ <b>ทำงานเกิน 3 ชั่วโมง</b> และ <b>ไม่ใช่งานช่วยงานส่วนอื่น</b>'
        + ' · แถวที่ไม่เข้าเฉลี่ยยังนับยอดหยิบให้ครบ'],
      ['ผ่าน / ไม่ผ่าน', 'ทำได้ <b>เท่ากับเป้าพอดีนับว่าผ่าน</b>'
        + ' · เลขบนจอปัดเป็นจำนวนเต็ม แต่ตัดสินจากค่าเต็มที่ไม่ปัด'],
    ];
    const groups = [
      ['1', 'ดูก่อน · ภาพรวม', 'indigo', [
        ['ภาพรวมวันนี้', true, 'ตัวเลขสำคัญของช่วงที่เลือกทั้งหมดในหน้าเดียว',
          'รวมทุกแถวในช่วงที่เลือกเป็นก้อนเดียว เทียบเป้ารวม ' + num(f.overall) + ' หยิบ/ชม.',
          'ช่วงนี้เป็นอย่างไรบ้าง'],
        ['แนวโน้มรายเดือน', false, 'เทียบผลเดือนต่อเดือน',
          'รวมเป็นเดือนปฏิทิน · วันที่ไม่มีแถวเข้าเฉลี่ยเลยไม่ถูกนับเป็นวันทำงาน',
          'เดือนนี้ดีขึ้นหรือแย่ลง'],
        ['สรุปผล &amp; Present', false, 'หน้าสำหรับพรินต์หรือนำเสนอ',
          'ใช้ตัวเลขชุดเดียวกับภาพรวม แค่จัดหน้าใหม่ ไม่คิดเลขเพิ่ม',
          'ขอสรุปไปเข้าประชุม'],
        ['เทรน สัปดาห์ / เดือน', false, 'กราฟแนวโน้มยาว ๆ เลือกรายวัน/สัปดาห์/เดือนได้',
          'สัปดาห์เริ่มวันจันทร์ · <b>กางทุกงวดเสมอ ไม่หุบตามตัวกรองวันที่</b>'
          + ' · วันที่มีแถวเข้าเฉลี่ยน้อยกว่า 5 ติด ⚠️ เพราะค่าเฉลี่ยเหวี่ยง',
          'แนวโน้มขึ้นหรือลง'],
      ]],
      ['2', 'เจาะลึก &amp; ตรวจข้อมูล', 'sky', [
        ['แผนผังโซน', true, 'ทุกโซนเรียงเป็นช่อง สีเข้มคือยอดเยอะ',
          'จับโซนจากช่องโซนของแต่ละแถว เทียบเป้าของโซนนั้นเอง'
          + ' · แถวที่อ่านโซนไม่ออกไปกอง <b>Not Found</b> ซึ่งใช้เป้ารวมแทน',
          'โซนไหนงานหนัก'],
        ['ช่วงเวลา', false, 'ยอดหยิบแยกตามชั่วโมง 24 ช่อง',
          'ช่องเวลาเริ่ม 07:00 ถึง 06:00 · ยึดวันที่ที่บันทึกไว้ ไม่ย้ายยอดข้ามเที่ยงคืน'
          + ' · รวม 24 ช่องได้เท่ายอดหยิบของแถวนั้นพอดี',
          'ช่วงไหนของวันงานพีค'],
        ['Efficiency', false, 'คิดเป็น % ของเป้า แยกวัน กะ ระบบ โซน',
          '% = Productivity ÷ เป้า × 100 · ระดับวัน/กะ/ระบบใช้เป้ารวม ระดับโซนใช้เป้าของโซน'
          + ' · สี ตั้งแต่ 100% เขียว · 90–99.9% ส้ม · ต่ำกว่า 90% แดง',
          'ถึงเป้ากี่เปอร์เซ็นต์'],
        ['Not Found &amp; ตรวจข้อมูล', false, 'รวมงานค้างด้านข้อมูลไว้ที่เดียว',
          'ไม่คิดเลขใหม่ แค่นับรายการที่ข้อมูลยังไม่ครบ'
          + ' · การ์ดแถวซ้ำจับคู่ด้วย <b>รหัสพนักงาน + วันที่</b> แล้วดูว่าชั่วโมงทับกันไหม'
          + ' · <b>ไม่ตัดยอดให้</b> ทุกหน้ายังนับทุกแถวหนึ่งครั้ง',
          'ข้อมูลตรงไหนยังไม่ครบ'],
      ]],
      ['3', 'พนักงาน', 'rose', [
        ['ไม่ถึงเป้า', false, 'รายชื่อคนที่ยังต่ำกว่าเป้า เรียงคนที่ห่างมากสุดขึ้นก่อน',
          'ค่าเฉลี่ยของคนนั้น < เป้าของ <b>โซนหลัก</b> (โซนที่ทำบ่อยสุด)'
          + ' · หนึ่งคนนับครั้งเดียว · คนที่ไม่มีแถวเข้าเฉลี่ยเลยไม่ถูกตัดสิน',
          'ต้องไปคุยกับใครก่อน'],
        ['พนักงานใหม่', false, 'คนที่เริ่มงานไม่เกิน 90 วัน พร้อมเส้นการพัฒนา',
          'วันเริ่มงานหลัง (วันล่าสุดที่มีข้อมูล − 90 วัน) · เส้นพัฒนานับสัปดาห์จากวันแรกที่มีผลงาน'
          + ' · ไม่มีวันเริ่มงานในทะเบียนจะใช้วันแรกที่เจอผลงานแทน',
          'คนใหม่พัฒนาทันไหม'],
        ['พนักงานเก่า', false, 'คนที่ทำงานเกิน 90 วัน พร้อม 10 อันดับสูงสุด/ต่ำสุด',
          'วันเริ่มงานก่อนหรือตรงเส้น 90 วัน · คอลัมน์เทียบเดือนก่อนคือเดือนล่าสุดลบเดือนก่อนหน้า',
          'ใครทรงตัว ใครตกลง'],
        ['เจาะลึกรายบุคคล', false, 'เทียบทุกคนในตารางเดียว <b>กดที่ชื่อเพื่อดูใบสรุปรายคน</b>',
          'ตัดสินสองระดับ — <b>รายคน</b> เทียบเป้าโซนหลัก · <b>รายวัน</b> เทียบเป้าโซนที่ทำวันนั้น'
          + ' · กราฟรายชั่วโมงมาจากยอด 24 ช่องของคนนั้น',
          'คนนี้เก่งช่วงไหน ตกช่วงไหน'],
      ]],
      ['4', 'ช่วยเหลือ', 'violet', [
        ['คู่มือการใช้เว็บ', false, 'หน้านี้', 'ไม่มีการคำนวณ', 'เมนูนี้ไว้ดูอะไร'],
      ]],
    ];
    return card('g-menu',
      '<div class="guide-basis"><h4>กฎที่ทุกเมนูใช้ร่วมกัน</h4>'
      /* ห่อคำอธิบายด้วย <span> ด้วย เพราะ .guide-basis p เป็น grid
         ถ้าปล่อยเป็นข้อความเปล่า แท็ก <b> ข้างในจะกลายเป็นช่องตารางแยกบรรทัด */
      + basis.map((b) => '<p><span>' + esc(b[0]) + '</span><span>' + b[1] + '</span></p>').join('')
      + '</div>'
      + groups.map((g) => '<div class="guide-group" data-accent="' + g[2] + '">'
        + '<h3><span class="guide-gnum">' + g[0] + '</span>' + g[1] + '</h3>'
        + '<div class="guide-menu">'
        + g[3].map((m) => '<article class="guide-menu-item">'
          + '<h4>' + m[0] + (m[1] ? ' <span class="guide-pin" title="เมนูแนะนำ">⭐</span>' : '') + '</h4>'
          + '<p>' + m[2] + '</p>'
          + '<p class="guide-calc"><span>คิดยังไง</span>' + m[3] + '</p>'
          + '<p class="guide-q">' + esc(m[4]) + '</p>'
          + '</article>').join('')
        + '</div></div>').join(''));
  }

  function pageHtml(f) {
    return '<div class="guide-wrap">'
      + heroHtml(f)
      + startHtml()
      + filterHtml(f)
      + termsHtml(f)
      + menuHtml(f)
      + '</div>';
  }

  function isActive() {
    const panel = $(PANEL);
    return Boolean(panel && panel.classList.contains('active'));
  }

  function render() {
    const host = $(HOST);
    if (!host) return;
    host.innerHTML = pageHtml(facts());
  }

  function renderIfVisible() {
    if (!isActive()) return;
    render();
  }

  let timer = null;
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(renderIfVisible, delay || 120);
  }

  /* ปุ่มข้ามหัวข้อถูกเขียน innerHTML ใหม่ทุกครั้งที่เรนเดอร์
     จึงผูก listener ที่ host ซึ่งอยู่ถาวรใน index.html ครั้งเดียว */
  const host = $(HOST);
  if (host) {
    host.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-jump]');
      if (!btn) return;
      const target = $(btn.dataset.jump);
      /* ต้องระบุ behavior: 'instant' ถึงจะเลื่อนจริง
         เพราะ styles.css ตั้ง html { scroll-behavior: smooth } ไว้
         และ smooth scroll แบบสั่งจากสคริปต์ไม่ขยับในเบราว์เซอร์บางตัว
         (วัดแล้ว: smooth ขยับ 0px · instant ขยับครบ) ปุ่มข้ามหัวข้อต้องทำงานแน่ ๆ */
      if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  }

  if (window.V3Data && typeof window.V3Data.subscribe === 'function') {
    window.V3Data.subscribe(() => schedule());
  }
  document.addEventListener('v3-render', () => schedule());
  // ค่าของทีมมาถึงก่อนข้อมูลชุดแรก จึงต้องวาดใหม่ด้วย ไม่ให้คู่มือบอกเป้าเก่า
  document.addEventListener('v3-targets', () => schedule(60));
  document.querySelectorAll('.nav-item[data-tab="guide"]').forEach((btn) => {
    btn.addEventListener('click', () => schedule(70));
  });
})();
