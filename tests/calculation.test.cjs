const assert=require('node:assert/strict');
require('../js/source.js');require('../js/v1-engine.js');require('../js/metrics.js');
const source=require('../data/snapshot.json'), M=V3Metrics;
const rows=source.sheets['Results Master'].rows.filter(r=>M.date(r[2]));
const index=V1Engine.buildIndex(source.sheets);
const raw=M.aggregate(rows);
const sortPeople=M.sortPeopleSummary(source.sheets);
const isBe=r=>M.type(r[36])==='pickToSort'&&/(^|[^A-Z0-9])BE([^A-Z0-9]|$)/i.test(String(r[33]||''));
const replacedDates=new Set(Object.keys(sortPeople).filter(d=>rows.some(r=>M.date(r[2])===d&&isBe(r))));
const adjusted=(selected)=>{
  const replaced=selected.filter(r=>replacedDates.has(M.date(r[2]))&&isBe(r));
  const kept=selected.filter(r=>!(replacedDates.has(M.date(r[2]))&&isBe(r)));
  let total=M.aggregate(kept).total,sum=M.aggregate(kept).sum,count=M.aggregate(kept).count,rowsCount=kept.length;
  for(const date of replacedDates){if(!selected.some(r=>M.date(r[2])===date))continue;const g=sortPeople[date];total+=g.total;sum+=g.sum;count+=g.count;rowsCount+=g.people.length;}
  return {total,sum,count,rows:rowsCount,average:count?sum/count:null};
};
const expectedAll=adjusted(rows);
assert.equal(index.totalRows,expectedAll.rows);
assert.equal(index.totalPick,expectedAll.total);
let sum=0,count=0;
for(const day of Object.values(index.dates)){sum+=day.overall.sum;count+=day.overall.count;}
assert.equal(count,expectedAll.count);assert.ok(Math.abs(sum-expectedAll.sum)<1e-7);
const days=[index.dateKeys[0],index.dateKeys[Math.floor(index.dateKeys.length/2)],index.dateKeys.at(-2),index.dateKeys.at(-1)];
const reconciliation=[];
for(const day of days){const filtered=rows.filter(r=>M.date(r[2])===day);const expected=adjusted(filtered);const actual=V1Engine.buildRange(source.sheets,day,day);assert.equal(actual.totalPick,expected.total);assert.equal(actual.overall.count,expected.count);assert.equal(actual.overall.average,Math.round((expected.average||0)*10)/10);reconciliation.push({date:day,totalPick:actual.totalPick,productivity:actual.overall.average,validRows:actual.overall.count});}
const sample=(date,total,af,type='Full Rack',shift='A')=>{const r=Array(43).fill('');r[2]=date;r[3]='00123';r[4]=total;r[31]=af;r[32]=shift;r[33]='AF';r[36]=type;return r;};
const fixture=[sample('Date(2026,8,1)',100,100),sample('Date(2026,8,1)',500,'Not Count'),sample('Date(2026,8,2)',300,300),sample('Date(2026,8,2)',200,200)];
assert.equal(M.aggregate(fixture).total,1100);assert.equal(M.aggregate(fixture).average,200);
const invalidZone=sample('Date(2026,8,3)',900,900);invalidZone[33]='YA';
assert.equal(M.isValidZoneRow(invalidZone),false);assert.equal(M.aggregate([invalidZone]).total,900);assert.equal(M.aggregate([invalidZone]).count,0);assert.equal(M.aggregate([invalidZone]).average,null);
const zoneFixtureSheets={...source.sheets,'Results Master':{...source.sheets['Results Master'],rows:[sample('Date(2026,8,3)',100,100),invalidZone]}};
const zoneFixture=V1Engine.buildRange(zoneFixtureSheets,'2026-09-03','2026-09-03');
assert.equal(zoneFixture.totalPick,1000);assert.equal(zoneFixture.overall.count,1);assert.equal(zoneFixture.overall.average,100);
assert.equal(M.matches(sample('Date(2026,5,7)',1,50,'Pick to Sort'),{system:'BPS'}),false);
assert.equal(M.matches(sample('Date(2026,5,8)',1,50,'Pick to Sort'),{system:'BPS'}),true);
assert.equal(M.matches(sample('Date(2026,5,8)',1,50,'Full Rack','C'),{shift:'C'}),true);
assert.equal(M.system(sample('Date(2026,5,8)',1,50,'ช่วยงานส่วนอื่น')),'Not Found');
const ownerFixture=sample('Date(2026,5,8)',1,50,'Full Rack','C');
ownerFixture[35]='Max Mart';
assert.equal(M.ownerKey(ownerFixture[35]),'Mart');
assert.equal(M.ownerLabel(ownerFixture[35]),'Mart');
assert.equal(M.matches(ownerFixture,{owner:'Mart'}),true);
assert.equal(M.matches(ownerFixture,{owner:'Punthai'}),false);
assert.equal(M.ownerKey('Not Found Data'),'UNKNOWN');
assert.equal(M.matches(ownerFixture,{owner:'ALL'}),true);
for(const owner of ['Mart','Punthai','GFA']){
  const selected=rows.filter(r=>M.matches(r,{owner}));
  assert.ok(selected.length>0,`Owner ${owner} should have rows in snapshot`);
  const sheets={...source.sheets,'Results Master':{...source.sheets['Results Master'],rows:selected}};
  const p=V1Engine.buildIndex(sheets);
  assert.equal(p.totalPick,M.aggregate(selected).total,`Owner ${owner} total should reconcile`);
}
assert.equal(V3Source.dateValue('02/01/2026 '),'Date(2026,0,2)');
assert.equal(V3Source.dateValue('16-ก.ย.-26'),'Date(2026,8,16)');
assert.equal(V3Source.dateValue('31/02/2026'),'31/02/2026');
assert.deepEqual(V3Source.csv('a,b\r\n"MP001","a,""b""\nc"'),[['a','b'],['MP001','a,"b"\nc']]);
const parsed=V3Source.parseCsv('Name,Date,User ID,Total pick,AVERAGE\r\nx,02/01/2026,MP001,20,Not Count',{name:'fixture',headers:['User ID']});
assert.equal(parsed.rows[0][2],'MP001');assert.equal(parsed.rows[0][4],'Not Count');
assert.ok(source.sheets['Update name'].rows.length>1,'Read all roster rows, not only filtered visible row');
assert.equal(sortPeople['2026-09-28'].total,3630);
assert.equal(Math.round(sortPeople['2026-09-28'].average),58);
for(const system of ['PTT','BPS','Not Found']){const selected=rows.filter(r=>M.matches(r,{system}));const sheets={...source.sheets,'Results Master':{...source.sheets['Results Master'],rows:selected}};const p=V1Engine.buildIndex(sheets);assert.equal(p.totalPick,M.aggregate(selected).total);}
const postCutoffRow=(zone,id,total,af,type='Full Rack')=>{const r=Array(43).fill('');r[2]='Date(2026,8,30)';r[3]=id;r[4]=total;r[31]=af;r[32]='A';r[33]=zone;r[34]='PTG';r[35]=zone==='BE'?'Punthai':'Mart';r[36]=type;return r;};
const postCutoffRows=Array.from({length:84},(_,i)=>postCutoffRow('AF','AF'+i,122,122)).concat([postCutoffRow('AF','AF84',168,168),postCutoffRow('BE','BE1',999,400,'Pick to Sort'),postCutoffRow('BE','BE2',888,500,'Pick to Sort')]);
const postCutoffSheets={...source.sheets,'Results Master':{...source.sheets['Results Master'],rows:postCutoffRows},Dashboard:{headers:[],rows:[]},'V3 History':{headers:['date','zone','totalPick','productivity','people','source'],rows:[['2026-09-30','BE',433,195,4,'Dashboard + Time_Slot']]},__filters:{system:'ALL',owner:'ALL',shift:'ALL'}};
const postCutoffDay=V1Engine.buildIndex(postCutoffSheets).dates['2026-09-30'];
assert.equal(postCutoffDay.totalPick,10849);assert.equal(postCutoffDay.overall.count,86);assert.equal(postCutoffDay.overall.sum,10611);assert.equal(Math.round(postCutoffDay.overall.sum/postCutoffDay.overall.count),123);
console.log('PASS: V1 formula, BE history team replacement, Sort_Data pre-cutoff merge, Owner filter, all/day parity, Not Count totals, BPS cutoff, calendar dates, shift C, mixed IDs, CSV, full roster');
console.table(reconciliation);
