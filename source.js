/* Read-only Google Sheets transport. Shared by Worker and snapshot refresh tool. */
(function(root) {
  const spreadsheetId = '1PMnlyYHswnV0nE73Alxh-ocIFtTipB9LMzACdNM9GFs';
  const tabs = [
    {name: 'Results Master', gid: 0, query: 'select *', headers: ['Name','Date','User ID','Total pick','AVERAGE']},
    {name: 'Update name', gid: 1715298723, query: 'select *', headers: ['รหัสพนักงาน']},
    {name: '2ND', gid: 185723535, query: 'select *', headers: ['รหัสพนักงาน']},
    {name: 'Zone_V2', gid: 375021866, query: 'select *', headers: ['Zone']}
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
  function dateValue(value) {
    const text=String(value||'').trim();
    const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    let m=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/), day,month,year;
    if(m){day=+m[1];month=+m[2]-1;year=+m[3];}
    else {m=text.match(/^(\d{1,2})-(.+)-(\d{2,4})$/);if(m){day=+m[1];month=months.indexOf(m[2]);year=+m[3];}}
    if(year<100)year+=2000;if(year>2400)year-=543;
    const d=new Date(year,month,day);
    return Number.isFinite(year)&&month>=0&&d.getFullYear()===year&&d.getMonth()===month&&d.getDate()===day ? `Date(${year},${month},${day})` : value;
  }
  function parseCsv(text, tab) {
    const values=csv(text.replace(/^\uFEFF/,''));
    const headers=values.shift()||[];
    for(const expected of tab.headers)if(!headers.includes(expected))throw new Error('โครงสร้าง '+tab.name+' เปลี่ยน: ไม่พบ '+expected);
    const dateColumns=tab.name==='Results Master'?[2]:tab.name==='Update name'?[7,12]:tab.name==='2ND'?[6,8]:[];
    return {headers,rows:values.map(row=>row.map((v,i)=>dateColumns.includes(i)?dateValue(v):v))};
  }
  async function read(tab) {
    // CSV export includes filtered-out rows and preserves mixed number/text IDs and AF "Not Count".
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${tab.gid}`;
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
    const values = await Promise.all(tabs.map(read));
    const sheets = Object.fromEntries(tabs.map((tab, i) => [tab.name, values[i]]));
    if (!sheets['Results Master'].rows.length) throw new Error('Results Master ไม่มีข้อมูล จึงยังไม่แทนข้อมูลเดิม');
    return {schema:'v3-sheet-v1', fetchedAt:new Date().toISOString(), spreadsheetId, sheets};
  }
  root.V3Source = {spreadsheetId, tabs, parse, parseCsv, csv, dateValue, download};
})(globalThis);
