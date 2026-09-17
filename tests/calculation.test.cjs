const assert=require('node:assert/strict');
require('../source.js');require('../v1-engine.js');require('../metrics.js');
const source=require('../data/snapshot.json'), M=V3Metrics;
const rows=source.sheets['Results Master'].rows.filter(r=>M.date(r[2]));
const index=V1Engine.buildIndex(source.sheets);
const raw=M.aggregate(rows);
assert.equal(index.totalRows,rows.length);
assert.equal(index.totalPick,raw.total);
let sum=0,count=0;
for(const day of Object.values(index.dates)){sum+=day.overall.sum;count+=day.overall.count;}
assert.equal(count,raw.count);assert.ok(Math.abs(sum-raw.sum)<1e-7);
const days=[index.dateKeys[0],index.dateKeys[Math.floor(index.dateKeys.length/2)],index.dateKeys.at(-2),index.dateKeys.at(-1)];
const reconciliation=[];
for(const day of days){const filtered=rows.filter(r=>M.date(r[2])===day);const expected=M.aggregate(filtered);const actual=V1Engine.buildRange(source.sheets,day,day);assert.equal(actual.totalPick,expected.total);assert.equal(actual.overall.count,expected.count);assert.equal(actual.overall.average,Math.round((expected.average||0)*10)/10);reconciliation.push({date:day,totalPick:actual.totalPick,productivity:actual.overall.average,validRows:actual.overall.count});}
const sample=(date,total,af,type='Full Rack',shift='A')=>{const r=Array(43).fill('');r[2]=date;r[3]='00123';r[4]=total;r[31]=af;r[32]=shift;r[36]=type;return r;};
const fixture=[sample('Date(2026,8,1)',100,100),sample('Date(2026,8,1)',500,'Not Count'),sample('Date(2026,8,2)',300,300),sample('Date(2026,8,2)',200,200)];
assert.equal(M.aggregate(fixture).total,1100);assert.equal(M.aggregate(fixture).average,200);
assert.equal(M.matches(sample('Date(2026,5,7)',1,50,'Pick to Sort'),{system:'BPS'}),false);
assert.equal(M.matches(sample('Date(2026,5,8)',1,50,'Pick to Sort'),{system:'BPS'}),true);
assert.equal(M.matches(sample('Date(2026,5,8)',1,50,'Full Rack','C'),{shift:'C'}),true);
assert.equal(M.system(sample('Date(2026,5,8)',1,50,'ช่วยงานส่วนอื่น')),'Not Found');
assert.equal(V3Source.dateValue('02/01/2026 '),'Date(2026,0,2)');
assert.equal(V3Source.dateValue('16-ก.ย.-26'),'Date(2026,8,16)');
assert.equal(V3Source.dateValue('31/02/2026'),'31/02/2026');
assert.deepEqual(V3Source.csv('a,b\r\n"MP001","a,""b""\nc"'),[['a','b'],['MP001','a,"b"\nc']]);
const parsed=V3Source.parseCsv('Name,Date,User ID,Total pick,AVERAGE\r\nx,02/01/2026,MP001,20,Not Count',{name:'fixture',headers:['User ID']});
assert.equal(parsed.rows[0][2],'MP001');assert.equal(parsed.rows[0][4],'Not Count');
assert.ok(source.sheets['Update name'].rows.length>1,'Read all roster rows, not only filtered visible row');
for(const system of ['PTT','BPS','Not Found']){const selected=rows.filter(r=>M.matches(r,{system}));const sheets={...source.sheets,'Results Master':{...source.sheets['Results Master'],rows:selected}};const p=V1Engine.buildIndex(sheets);assert.equal(p.totalPick,M.aggregate(selected).total);}
console.log('PASS: V1 formula, all/day parity, Not Count totals, BPS cutoff, calendar dates, shift C, mixed IDs, CSV, full roster');
console.table(reconciliation);
