(function(root){
  function number(v){if(typeof v==='number')return Number.isFinite(v)?v:0;const text=String(v??'').trim();if(!text||/^not\s?count$/i.test(text))return 0;const cleaned=text.replace(/[,％%]/g,'').trim();const direct=Number(cleaned);if(Number.isFinite(direct))return direct;const match=cleaned.match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):0;}
  function date(v){const m=String(v||'').match(/^Date\((\d+),(\d+),(\d+)/);return m?`${m[1]}-${String(+m[2]+1).padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';}
  function type(v){const t=String(v||'').toLowerCase().trim();if(t.includes('sort'))return 'pickToSort';if(t.includes('full'))return 'fullRack';if(t.includes('half')||t.includes('haft'))return 'halfRack';if(t.includes('micro')||t.includes('ea'))return 'ea';if(t.includes('mezz'))return 'mezzanine';return '';}
  function system(row){const t=type(row[36]);return t==='pickToSort'?'BPS':t?'PTT':'Not Found';}
  /* กะที่ใช้กรอง/จับกลุ่ม อ่านจากคอลัมน์ AG ตามที่ Sheet บันทึกไว้ ไม่คาดเดาจากเวลา
     ค่าที่แปลว่า "ไม่รู้กะ" มีได้หลายแบบในต้นทาง จึงรวมเป็นถังเดียวชื่อ Not Found
       - เซลล์ว่าง (ไม่มีการกรอกกะ)
       - ข้อความ Not Found / Not Found Data ที่ Sheet เขียนไว้เอง
       - #N/A จากสูตรที่หาไม่เจอ และขีด -
     ค่าดิบยังแสดงตามต้นทางในตารางรายการ จึงตรวจย้อนได้ว่าแถวนั้นว่างหรือเป็นข้อความแบบใด */
  function shiftKey(row){const text=String((row&&row[32])??'').trim();if(!text)return 'Not Found';if(/^not\s?found(\s*data)?$/i.test(text))return 'Not Found';if(/^#n\/a$/i.test(text)||text==='-')return 'Not Found';return text;}
  function matches(row,filters={}){return (!filters.system||filters.system==='ALL'||(system(row)===filters.system&&(filters.system!=='BPS'||date(row[2])>='2026-06-08'))) && (!filters.shift||filters.shift==='ALL'||shiftKey(row)===filters.shift);}
  function aggregate(rows){let total=0,sum=0,count=0,hours=0;const ids=new Set();for(const r of rows){total+=number(r[4]);hours+=number(r[6]);const a=number(r[31]);if(a>0){sum+=a;count++;}if(r[3])ids.add(String(r[3]).trim());}return {total,sum,count,average:count?sum/count:null,rows:rows.length,hours,people:ids.size,excluded:rows.length-count};}

  /* ── ช่วงเวลา: คอลัมน์ H–AE (ดัชนี 7–30) เป็นยอดหยิบต่อชั่วโมง 24 ช่อง
        หัวตารางจริงใน Sheet เริ่ม "7:00 - 8:00" ไปจนถึง "6:00 - 7:00"
        ผลรวม 24 ช่องเท่ากับ Total Pick คอลัมน์ E ของแถวนั้น จึงใช้เจาะรายชั่วโมงได้ตรง ── */
  const HOUR_FIRST=7, HOUR_COUNT=24;
  function hourIndexes(){return Array.from({length:HOUR_COUNT},(_,i)=>HOUR_FIRST+i);}
  function hourLabels(headers){return hourIndexes().map((c,i)=>{const h=headers&&headers[c]?String(headers[c]).trim():'';return h||String(i);});}
  function hourValues(row){return hourIndexes().map(c=>number(row&&row[c]));}
  function hourTotals(rows,into){const out=into||new Array(HOUR_COUNT).fill(0);for(const r of rows){for(let i=0;i<HOUR_COUNT;i++)out[i]+=number(r[HOUR_FIRST+i]);}return out;}

  /* ── ทะเบียนพนักงาน: ชื่อยึด Sheet 2ND เป็นหลัก
        2ND: B รหัสพนักงาน, C ชื่อ-นามสกุล (ไทย), D ชื่อเล่น, E สังกัด, F หน้าที่,
             G วันที่เริ่มงาน, H Status Work, I วันที่จบ Training, J Zone, K Pick Type, L BU, M Ship กะ
        ถ้า User ID ไม่อยู่ใน 2ND (เช่น พนักงานที่ออกไปแล้ว) จึงใช้ชื่อในคอลัมน์ B ของ Results Master
        ตามกฎ V1 ที่ว่าไม่ลบผลงานย้อนหลังเมื่อไม่พบทะเบียน ── */
  function rosterMap(sheet2nd){const map=new Map();const rows=(sheet2nd&&sheet2nd.rows)||[];for(const r of rows){const id=String(r[1]??'').trim();if(id&&!map.has(id))map.set(id,r);}return map;}
  function userId(row){return String((row&&row[3])??'').trim();}
  /* ข้อความที่ต้นทางใช้แทน "ไม่รู้" — ไม่ใช่ชื่อคนจริง */
  function isPlaceholder(text){const t=String(text??'').trim();return !t||/^not\s?found(\s*data)?$/i.test(t)||/^#n\/a$/i.test(t)||t==='-';}
  function personName(row,roster){
    const master=roster&&roster.get?roster.get(userId(row)):null;
    const fromRoster=master?String(master[2]??'').trim():'';
    if(fromRoster)return fromRoster;
    const fromSheet=String((row&&row[1])??'').trim();
    return isPlaceholder(fromSheet)?'Not Found':fromSheet;
  }
  function personNickname(row,roster){const master=roster&&roster.get?roster.get(userId(row)):null;return master?String(master[3]??'').trim():'';}
  function inRoster(row,roster){return Boolean(roster&&roster.get&&roster.get(userId(row)));}

  root.V3Metrics={number,date,type,system,shiftKey,matches,aggregate,
    HOUR_FIRST,HOUR_COUNT,hourIndexes,hourLabels,hourValues,hourTotals,
    rosterMap,userId,personName,personNickname,inRoster,isPlaceholder};
})(globalThis);
