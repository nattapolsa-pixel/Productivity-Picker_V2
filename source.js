/* Read-only Google Sheets transport. Shared by Worker and snapshot refresh tool. */
(function(root) {
  const spreadsheetId = '1PMnlyYHswnV0nE73Alxh-ocIFtTipB9LMzACdNM9GFs';
  // ทะเบียนพนักงานที่พ้นสภาพอยู่อีกไฟล์ (ตารางบันทึกเวลาทำงาน DC วังน้อย)
  const resignedSpreadsheetId = '1AWOeqhCqmBlSfGI5FWJVU4F77lDGNWBUH-TYpJeiYnI';
  const tabs = [
    {name: 'Results Master', gid: 0, query: 'select *', headers: ['Name','Date','User ID','Total pick','AVERAGE']},
    {name: 'Update name', gid: 1715298723, query: 'select *', headers: ['รหัสพนักงาน']},
    {name: '2ND', gid: 185723535, query: 'select *', headers: ['รหัสพนักงาน']},
    {name: 'Zone_V2', gid: 375021866, query: 'select *', headers: ['Zone']},
    // คนละไฟล์กับด้านบน และคอลัมน์ "พ้นสภาพ" เขียนแบบเดือน/วัน/ปี ต่างจากไฟล์หลักที่เป็นวัน-เดือนไทย-ปี
    {name: 'Resigned', sheetId: resignedSpreadsheetId, gid: 1175783248, query: 'select *',
     headers: ['รหัสพนักงาน','พ้นสภาพ'], monthFirstDateColumns: [7], optional: true}
  ];
  function parse(text, tab) {
    const match = text.match(/setResponse\(([\s\S]*)\);?\s*$/);
    if (!match) throw new Error('อ่าน Google Sheet ไม่ได้: ' + tab.name);
    const payload = JSON.parse(match[1]);
    if (payload.status !== 'ok' || !payload.table) throw new Error('Google Sheet: ' + (payload.errors?.[0]?.detailed_message || tab.name));
    const headers = payload.table.cols.map(c => c.label);
    for (const expected of tab.headers) if (!headers.includes(expected)) throw new Error('โครงสร้าง ' + tab.name + ' เปลี่ยน: ไม่พบ ' + expected);
    const rows = payload.table.rows.map(row => payload.table.cols.map((col, i) => row.c?.[i]?.v ?? null));
    return {headers, rows: rows.filter(row => row.some(v => v !== null && v !== ''))};
  }
  function csv(text) {
    const rows=[]; let row=[], field='', quoted=false;
    for(let i=0;i<text.length;i++) {
      const ch=text[i];
      if(ch==='"') {if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(ch===',' && !quoted){row.push(field);field='';}
      else if((ch==='\n'||ch==='\r') && !quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
      else field+=ch;
    }
    if(quoted)throw new Error('CSV ไม่สมบูรณ์');
    if(field || row.length){row.push(field);rows.push(row);}
    return rows;
  }
  /* ไฟล์หลักเขียนวันที่เป็น 20-มี.ค.-23 หรือ วัน/เดือน/ปี
     แต่แท็บ Resigned เป็น เดือน/วัน/ปี (ตรวจจากข้อมูลจริง: ส่วนที่สองมีค่าถึง 31)
     จึงต้องสลับลำดับเฉพาะแท็บนั้น และถ้าส่วนแรกมากกว่า 12 ให้ถือว่าเป็นวันตามเดิม */
  function dateValueMonthFirst(value) {
    const text=String(value||'').trim();
    const m=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if(!m)return dateValue(value);
    const first=+m[1], second=+m[2];
    if(first>12)return dateValue(value);
    return dateValue(second+'/'+first+'/'+m[3]);
  }
  function dateValue(value) {
    const text=String(value||'').trim();
    const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    let m=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/), day,month,year;
    if(m){day=+m[1];month=+m[2]-1;year=+m[3];}
    else {m=text.match(/^(\d{1,2})-(.+)-(\d{2,4})$/);if(m){day=+m[1];month=months.indexOf(m[2]);year=+m[3];}}
    /* ปีสองหลักกำกวม: "24" อาจเป็น ค.ศ. 2024 หรือ พ.ศ. 2567
       เลือกแบบ ค.ศ. ก่อน ถ้าได้ปีอนาคตเกินหนึ่งปีจึงถือว่าเป็น พ.ศ. สองหลัก (2500+Y-543)
       ตรวจกับข้อมูลจริง: 67 -> 2024 (2567), 24 -> 2024, 26 -> 2026, 17 -> 2017 */
    if(year<100){
      const gregorian=year+2000, buddhistShort=year+1957;
      year = gregorian > new Date().getFullYear()+1 ? buddhistShort : gregorian;
    }
    if(year>2400)year-=543;
    const d=new Date(year,month,day);
    return Number.isFinite(year)&&month>=0&&d.getFullYear()===year&&d.getMonth()===month&&d.getDate()===day ? `Date(${year},${month},${day})` : value;
  }
  function parseCsv(text, tab) {
    const values=csv(text.replace(/^\uFEFF/,''));
    const headers=values.shift()||[];
    for(const expected of tab.headers)if(!headers.includes(expected))throw new Error('โครงสร้าง '+tab.name+' เปลี่ยน: ไม่พบ '+expected);
    const dateColumns=tab.name==='Results Master'?[2]:tab.name==='Update name'?[7,12]:tab.name==='2ND'?[6,8]:[];
    const monthFirst=tab.monthFirstDateColumns||[];
    return {headers,rows:values.map(row=>row.map((v,i)=>
      monthFirst.includes(i)?dateValueMonthFirst(v):dateColumns.includes(i)?dateValue(v):v))};
  }
  async function read(tab) {
    // CSV export includes filtered-out rows and preserves mixed number/text IDs and AF "Not Count".
    const url = `https://docs.google.com/spreadsheets/d/${tab.sheetId||spreadsheetId}/export?format=csv&gid=${tab.gid}`;
    let error;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {signal: AbortSignal.timeout(60000), cache:'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return parseCsv(await response.text(), tab);
      } catch(e) { error = e; }
    }
    throw new Error(tab.name + ': ' + error.message);
  }
  async function download() {
    const warnings = [];
    // แท็บที่ตั้ง optional ไว้ (Resigned อยู่อีกไฟล์ สิทธิ์แชร์อาจต่างกัน) ถ้าอ่านไม่ได้ต้องไม่ทำให้ทั้งหน้าล่ม
    const values = await Promise.all(tabs.map(async tab => {
      try { return await read(tab); }
      catch (e) {
        if (!tab.optional) throw e;
        warnings.push(tab.name + ': ' + e.message);
        return {headers: tab.headers.slice(), rows: []};
      }
    }));
    const sheets = Object.fromEntries(tabs.map((tab, i) => [tab.name, values[i]]));
    if (!sheets['Results Master'].rows.length) throw new Error('Results Master ไม่มีข้อมูล จึงยังไม่แทนข้อมูลเดิม');
    return {schema:'v3-sheet-v1', fetchedAt:new Date().toISOString(), spreadsheetId, sheets, warnings};
  }
  root.V3Source = {spreadsheetId, resignedSpreadsheetId, tabs, parse, parseCsv, csv, dateValue, dateValueMonthFirst, download};
})(globalThis);
