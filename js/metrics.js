(function(root){
  function number(v){if(typeof v==='number')return Number.isFinite(v)?v:0;const text=String(v??'').trim();if(!text||/^not\s?count$/i.test(text))return 0;const cleaned=text.replace(/[,％%]/g,'').trim();const direct=Number(cleaned);if(Number.isFinite(direct))return direct;const match=cleaned.match(/-?\d+(?:\.\d+)?/);return match?Number(match[0]):0;}
  function date(v){const m=String(v||'').match(/^Date\((\d+),(\d+),(\d+)/);return m?`${m[1]}-${String(+m[2]+1).padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';}
  function dashboardDate(v){const text=String(v??'').trim(),m=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);if(!m)return '';return `${m[3]}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;}
  function sortDashboardSummary(sheets){
    const rows=(sheets&&sheets.Dashboard&&sheets.Dashboard.rows)||[];
    for(const row of rows){
      const reportDate=dashboardDate(row&&row[0]),productivity=number(row&&row[16]);
      if(!reportDate||productivity<=0)continue;
      return {date:reportDate,total:number(row[5]),people:number(row[11]),productivity};
    }
    return null;
  }
  function sortHeader(value){return String(value??'').toLowerCase().replace(/[\s_\-()]+/g,'').trim();}
  function sortColumn(headers,names){
    for(const name of names||[]){const exact=String(name??'').toLowerCase().trim();const i=(headers||[]).findIndex(h=>String(h??'').toLowerCase().trim()===exact);if(i>=0)return i;}
    const normalized=(headers||[]).map(sortHeader);for(const name of names||[]){const needle=sortHeader(name);const i=normalized.findIndex(h=>h===needle||h.includes(needle));if(i>=0)return i;}
    return -1;
  }
  function sortDateTime(value){
    if(value instanceof Date&&!Number.isNaN(value.getTime()))return new Date(value.getTime());
    const m=String(value??'').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);if(!m)return null;
    let y=+m[3];if(y<100)y+=2000;if(y>2400)y-=543;const d=new Date(y,+m[2]-1,+m[1],+m[4],+m[5],+(m[6]||0));return Number.isNaN(d.getTime())?null:d;
  }
  function sortDate(value){
    const numeric=Number(value);
    if(Number.isFinite(numeric)&&numeric>20000&&numeric<70000){const d=new Date(Date.UTC(1899,11,30)+numeric*86400000);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);}
    const iso=String(value??'').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);if(iso)return `${iso[1]}-${String(+iso[2]).padStart(2,'0')}-${String(+iso[3]).padStart(2,'0')}`;
    const m=String(value??'').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);if(!m)return '';let y=+m[3];if(y<100)y+=2000;if(y>2400)y-=543;return `${y}-${String(+m[2]).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`;
  }
  function historyDate(value){return sortDate(value)||dashboardDate(value);}
  function sortDateTimeAt(date,hour,minute,offset){const [y,m,d]=date.split('-').map(Number);const out=new Date(y,m-1,d,hour,minute||0);out.setDate(out.getDate()+Number(offset||0));return out;}
  function sortHours(person){
    const night=String(person.shift??'').toLowerCase().includes('night'),ranges=night?[[sortDateTimeAt(person.date,19,0),sortDateTimeAt(person.date,22,50)],[sortDateTimeAt(person.date,0,0,1),sortDateTimeAt(person.date,4,0,1)],[sortDateTimeAt(person.date,4,30,1),sortDateTimeAt(person.date,7,0,1)]]:[[sortDateTimeAt(person.date,7,0),sortDateTimeAt(person.date,10,50)],[sortDateTimeAt(person.date,12,0),sortDateTimeAt(person.date,16,0)],[sortDateTimeAt(person.date,16,30),sortDateTimeAt(person.date,19,0)]];
    return ranges.reduce((sum,[start,end])=>sum+Math.max(0,(Math.min(person.last,end)-Math.max(person.first,start))/3600000),0);
  }
  function sortPeopleSummary(sheets){
    const sheet=sheets&&sheets.Sort_Data;if(!sheet||!sheet.rows||!sheet.rows.length)return {};
    const headers=sheet.headers||[],c={uom:sortColumn(headers,['UOM Qty','UOM']),dateTime:sortColumn(headers,['Sort DateTime','DateTime']),shift:sortColumn(headers,['Shift']),shiftDate:sortColumn(headers,['Shift Date']),id:sortColumn(headers,['Sorter ID','User ID'])};
    if(Object.values(c).some(i=>i<0))return {};
    /* Sort_Data ไม่มีคอลัมน์ Owner จึงผูก Owner จาก Results Master ด้วย Date + User ID
       เพื่อให้การกรอง Mart / Punthai / GFA ไม่เอายอด BE ของทุก Owner มาปนกัน */
    const ownerByPersonDate=new Map();
    for(const row of (sheets['Results Master']?.rows||[])){
      const rowDate=date(row[2])||sortDate(row[2])||dashboardDate(row[2]),id=String(row[3]??'').trim();
      if(rowDate&&id)ownerByPersonDate.set(`${rowDate}|${id}`,ownerKey(row[35]));
    }
    const groups={};
    for(const row of sheet.rows){const date=sortDate(row[c.shiftDate]),dt=sortDateTime(row[c.dateTime]),id=String(row[c.id]??'').trim();if(!date||!dt||!id)continue;if(!groups[date])groups[date]={date,peopleById:{}};const p=groups[date].peopleById[id]||(groups[date].peopleById[id]={userId:id,shift:row[c.shift],total:0,first:dt,last:dt});p.total+=number(row[c.uom]);if(dt<p.first)p.first=dt;if(dt>p.last)p.last=dt;}
    for(const group of Object.values(groups)){const entries=Object.values(group.peopleById).map(p=>{p.owner=ownerByPersonDate.get(`${group.date}|${p.userId}`)||'UNKNOWN';p.hours=sortHours({...p,date:group.date});p.productivity=p.hours>0?p.total/p.hours:0;p.valid=p.hours>3&&p.productivity>0&&p.productivity<1000;return p;});const valid=entries.filter(p=>p.valid);group.people=entries;group.total=entries.reduce((sum,p)=>sum+p.total,0);group.sum=valid.reduce((sum,p)=>sum+p.productivity,0);group.count=valid.length;group.average=group.count?group.sum/group.count:null;group.excluded=entries.length-group.count;delete group.peopleById;}
    return groups;
  }
  function sortTimeSummary(sheets){
    const sheet=sheets&&sheets.Sort_Data;if(!sheet||!sheet.rows||!sheet.rows.length)return {};
    const headers=sheet.headers||[],c={dateTime:sortColumn(headers,['Sort DateTime','DateTime']),slot:sortColumn(headers,['Time Slot']),date:sortColumn(headers,['Shift Date']),uom:sortColumn(headers,['UOM Qty','UOM']),id:sortColumn(headers,['Sorter ID','User ID'])};
    if(Object.values(c).some(i=>i<0))return {};
    const groups={};
    for(const row of sheet.rows){
      const date=historyDate(row[c.date]),dateTime=String(row[c.dateTime]??'').trim(),slot=String(row[c.slot]??'').trim(),id=String(row[c.id]??'').trim();
      if(!date||!dateTime||!slot||!id||!/^\d{1,2}:\d{2}\-\d{1,2}:\d{2}$/.test(slot))continue;
      const group=groups[date]||(groups[date]={date,total:0,lines:0,peopleById:new Set(),slots:{}}),value=number(row[c.uom]);
      group.total+=value;group.lines+=1;group.peopleById.add(id);
      const bucket=group.slots[slot]||(group.slots[slot]={total:0,lines:0,peopleById:new Set()});bucket.total+=value;bucket.lines+=1;bucket.peopleById.add(id);
    }
    Object.values(groups).forEach(group=>{group.people=group.peopleById.size;delete group.peopleById;Object.values(group.slots).forEach(bucket=>{bucket.people=bucket.peopleById.size;delete bucket.peopleById;});});
    return groups;
  }
  function type(v){const t=String(v||'').toLowerCase().trim();if(t.includes('sort'))return 'pickToSort';if(t.includes('full'))return 'fullRack';if(t.includes('half')||t.includes('haft'))return 'halfRack';if(t.includes('micro')||t.includes('ea'))return 'ea';if(t.includes('mezz'))return 'mezzanine';return '';}
  function system(row){const t=type(row[36]);return t==='pickToSort'?'BPS':t?'PTT':'Not Found';}
  /* Owner ของเว็บอ่านจาก Results Master คอลัมน์ AJ (Bu)
     ต้นทางใช้ชื่อ Max Mart แต่หน้าเว็บใช้ป้ายสั้นว่า Mart เพื่อให้เลือกง่ายและสื่อสารตรงกันทุกหน้า */
  function ownerKey(value){
    const text=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
    if(!text||/^not\s?found(\s*data)?$/i.test(text)||/^#n\/a$/i.test(text)||text==='-')return 'UNKNOWN';
    if(text==='punthai')return 'Punthai';
    if(text==='gfa')return 'GFA';
    if(text==='mart'||text==='max mart'||text.includes('max mart'))return 'Mart';
    return 'UNKNOWN';
  }
  function ownerLabel(value){const key=ownerKey(value);return key==='Mart'?'Mart':key==='Punthai'?'Punthai':key==='GFA'?'GFA':'ไม่ระบุ Owner';}
  /* กะที่ใช้กรอง/จับกลุ่ม อ่านจากคอลัมน์ AG ตามที่ Sheet บันทึกไว้ ไม่คาดเดาจากเวลา
     ค่าที่แปลว่า "ไม่รู้กะ" มีได้หลายแบบในต้นทาง จึงรวมเป็นถังเดียวชื่อ Not Found
       - เซลล์ว่าง (ไม่มีการกรอกกะ)
       - ข้อความ Not Found / Not Found Data ที่ Sheet เขียนไว้เอง
       - #N/A จากสูตรที่หาไม่เจอ และขีด -
     ค่าดิบยังแสดงตามต้นทางในตารางรายการ จึงตรวจย้อนได้ว่าแถวนั้นว่างหรือเป็นข้อความแบบใด */
  function shiftKey(row){const text=String((row&&row[32])??'').trim();if(!text)return 'Not Found';if(/^not\s?found(\s*data)?$/i.test(text))return 'Not Found';if(/^#n\/a$/i.test(text)||text==='-')return 'Not Found';return text;}
  function matches(row,filters={}){
    const filterOwner=String(filters.owner??'').trim();
    const ownerOk=!filterOwner||filterOwner==='ALL'||ownerKey(row&&row[35])===ownerKey(filterOwner);
    return (!filters.system||filters.system==='ALL'||(system(row)===filters.system&&(filters.system!=='BPS'||date(row[2])>='2026-06-08'))) && (!filters.shift||filters.shift==='ALL'||shiftKey(row)===filters.shift) && ownerOk;
  }
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

  /* ── อายุงาน: ใช้กฎเดียวกับ V1 (buildTenuredPickerBenchmark ใน script.js)
        เส้นแบ่งคือ anchor ลบ 90 วัน ไม่ใช่ 3 เดือนปฏิทิน
        สัญญาณอายุงานใช้วันเริ่มงานในทะเบียนก่อน ถ้าไม่มีจึงใช้วันแรกที่พบใน Results Master
        เหมือนที่ V1 ดูทั้ง rosterItem.startDate และ firstSeen ── */
  const TENURE_DAYS=90;
  function addDays(iso,days){const d=new Date(iso+'T00:00:00');if(Number.isNaN(d.getTime()))return '';d.setDate(d.getDate()+days);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function tenureCutoff(anchorIso,days){return anchorIso?addDays(anchorIso,-(days||TENURE_DAYS)):'';}
  function daysBetween(fromIso,toIso){if(!fromIso||!toIso)return null;
    const a=new Date(fromIso+'T00:00:00'),b=new Date(toIso+'T00:00:00');
    if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return null;
    return Math.round((b-a)/86400000);}
  /* วันเริ่มงาน: Update name คอลัมน์ H (ดัชนี 7) และ 2ND คอลัมน์ G (ดัชนี 6) โดย 2ND เป็นทะเบียนปัจจุบันจึงทับได้ */
  function startDateMap(sheets){
    const map=new Map();
    /* Update name คอลัมน์ H เป็นแหล่งที่ V1 ใช้ จึงให้มาก่อน
       2ND คอลัมน์ G เป็นตัวสำรองสำหรับคนที่ไม่มีใน Update name (V1 ไม่ได้อ่านคอลัมน์นี้)
       ไม่ให้ 2ND ทับค่าของ Update name เพราะพบว่าบางแถวใน 2ND เขียนปีไม่ตรงกัน */
    ((sheets&&sheets['Update name']&&sheets['Update name'].rows)||[]).forEach(r=>{
      const id=String(r[1]??'').trim(), d=date(r[7]); if(id&&d&&!map.has(id))map.set(id,d);});
    ((sheets&&sheets['2ND']&&sheets['2ND'].rows)||[]).forEach(r=>{
      const id=String(r[1]??'').trim(), d=date(r[6]); if(id&&d&&!map.has(id))map.set(id,d);});
    return map;
  }
  /* วันแรกที่พบผลงานของแต่ละคน ใช้ทุกแถวที่มีวันที่ ไม่จำกัดช่วงวันที่ที่เลือก */
  function firstSeenMap(rows){
    const map=new Map();
    for(const r of rows||[]){const d=date(r[2]);if(!d)continue;const id=userId(r);if(!id)continue;
      if(!map.has(id)||d<map.get(id))map.set(id,d);}
    return map;
  }
  function tenureStart(id,startMap,seenMap){
    return (startMap&&startMap.get&&startMap.get(id))||(seenMap&&seenMap.get&&seenMap.get(id))||'';
  }
  function tenureGroup(id,startMap,seenMap,cutoff){
    const s=tenureStart(id,startMap,seenMap);
    if(!s||!cutoff)return 'old';
    return s>cutoff?'new':'old';
  }

  /* ── ทะเบียนพนักงานที่พ้นสภาพ (ชีต Resigned อีกไฟล์)
        A รหัสพนักงาน, B ชื่อ-นามสกุล, C ชื่อเล่น, D สังกัด, E หน้าที่, F โซน, G Team, H พ้นสภาพ ── */
  function resignedMap(sheetResigned){
    const map=new Map();
    ((sheetResigned&&sheetResigned.rows)||[]).forEach(r=>{
      const id=String(r[0]??'').trim(); if(!id)return;
      const entry={id,name:String(r[1]??'').trim(),nickname:String(r[2]??'').trim(),
        affiliation:String(r[3]??'').trim(),role:String(r[4]??'').trim(),
        zone:String(r[5]??'').trim(),team:String(r[6]??'').trim(),date:date(r[7])};
      const prev=map.get(id);
      if(!prev||(entry.date&&(!prev.date||entry.date>prev.date)))map.set(id,entry);
    });
    return map;
  }

  root.V3Metrics={number,date,dashboardDate,sortDate,historyDate,sortDashboardSummary,sortPeopleSummary,sortTimeSummary,type,system,ownerKey,ownerLabel,shiftKey,matches,aggregate,
    TENURE_DAYS,addDays,tenureCutoff,daysBetween,startDateMap,firstSeenMap,tenureStart,tenureGroup,resignedMap,
    HOUR_FIRST,HOUR_COUNT,hourIndexes,hourLabels,hourValues,hourTotals,
    rosterMap,userId,personName,personNickname,inRoster,isPlaceholder};
})(globalThis);
