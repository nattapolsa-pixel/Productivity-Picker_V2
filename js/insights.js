/* Source-backed drilldowns. Main V1 KPI calculations remain in script.js/v1-engine.js. */
(() => {
  const $=id=>document.getElementById(id), M=V3Metrics;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=0)=>v===null||v===undefined?'—':Number(v).toLocaleString('th-TH',{maximumFractionDigits:d,minimumFractionDigits:d});
  let source=null,rows=[],roster=new Map(),active='overview',payload=null,tableState={},selectedStaff='';
  const labels={fullRack:'Full Rack',halfRack:'Half Rack',ea:'Micro Rack',pickToSort:'Pick to Sort',mezzanine:'Mezzanine'};
  const zones=ZONE_GROUPS.flatMap(g=>g.zones.map(z=>({...z,group:g.key})));
  const zoneCache=new Map();
  function zone(row){const text=String(row[33]||'').toUpperCase().trim();if(zoneCache.has(text))return zoneCache.get(text);
    let found=null;
    for(const z of zones){const codes=z.label.split('-');if(z.label==='AA-AF')codes.push('AB','AC','AD','AE');if(z.label==='BI-BK')codes.push('BJ');if(codes.some(code=>new RegExp(`(?:^|[^A-Z])${code}(?:$|[^A-Z0-9]|\\d)`,'i').test(text))){found=z;break;}}
    zoneCache.set(text,found);return found;
  }
  function visible(){const start=$('startDate').value,end=$('endDate').value;return rows.filter(r=>{const d=M.date(r[2]);return d&&(!start||d>=start)&&(!end||d<=end)&&M.matches(r,V3Data.filters);});}
  function cards(list){return `<div class="kpis v3-kpis">${list.map(([title,value,note])=>`<article class="kpi v3-kpi"><span>${esc(title)}</span><strong>${value}</strong><small>${esc(note||'')}</small></article>`).join('')}</div>`;}
  function stats(records){const s=M.aggregate(records);return cards([['Total Pick',fmt(s.total),'รวมทุกแถวในช่วงที่เลือก'],['Productivity',fmt(s.average,0),'Pick/ชม. · เฉลี่ยจากแถวที่นับได้'],['แถวที่นำไปเฉลี่ย',fmt(s.count),`${fmt(s.excluded)} แถวไม่เข้าเฉลี่ย`],['พนักงานที่มีรายการ',fmt(s.people),`${fmt(s.rows)} แถวต้นทาง`]]);}
  function csvExport(items,columns,name){const csv=[columns.map(c=>c.title),...items.map(item=>columns.map(c=>c.value(item)))].map(row=>row.map(value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  /* กดหัวคอลัมน์เพื่อเรียง ครั้งแรกมาก -> น้อย ครั้งที่สองน้อย -> มาก ครั้งที่สามกลับลำดับตั้งต้น
     ต้องเก็บลำดับตั้งต้นไว้ได้ เพราะบางตารางจัดลำดับมาก่อนแล้ว
     (การ์ด Not Found ดันคนที่ออกแล้วไปท้าย, ตารางพนักงานเก่าเรียงตาม Productivity) */
  const SORT_ARROW={desc:'\u2193',asc:'\u2191'};
  function sortValue(column,item){
    let raw;
    try{raw=column.sortValue?column.sortValue(item):column.value(item);}catch(e){return null;}
    if(raw===null||raw===undefined||raw==='')return null;
    if(typeof raw==='number')return Number.isFinite(raw)?raw:null;
    const text=String(raw).trim();
    if(!text||text==='\u2014')return null;
    if(column.num){const n=Number(text.replace(/[,\s]/g,''));return Number.isFinite(n)?n:null;}
    return text;
  }
  function sortItems(list,column,dir){
    const sign=dir==='asc'?1:-1;
    return list.map((item,i)=>({item,i,v:sortValue(column,item)})).sort((a,b)=>{
      // ค่าว่างไปท้ายรายการเสมอไม่ว่าจะเรียงทางไหน เพื่อไม่ให้ช่องว่างบังของจริง
      if(a.v===null&&b.v===null)return a.i-b.i;
      if(a.v===null)return 1;
      if(b.v===null)return -1;
      if(typeof a.v==='number'&&typeof b.v==='number')return (a.v-b.v)*sign||(a.i-b.i);
      return String(a.v).localeCompare(String(b.v),'th')*sign||(a.i-b.i);
    }).map(x=>x.item);
  }
  function table(container,key,items,columns,options={}){
    const state=tableState[key]||(tableState[key]={q:'',page:1,mode:'all',sortCol:null,sortDir:'desc'});
    if(state.sortCol!==null&&state.sortCol!==undefined&&state.sortCol>=columns.length)state.sortCol=null;
    container.innerHTML=`<div class="card v3-card"><div class="v3-toolbar"><input aria-label="ค้นหา ${esc(key)}" placeholder="ค้นหารหัส ชื่อ โซน สังกัด…" value="${esc(state.q)}"><select aria-label="สถานะรายการ"><option value="all">ทั้งหมด</option><option value="valid">เข้าเฉลี่ย Productivity</option><option value="excluded">ไม่เข้าเฉลี่ย Productivity</option></select><button type="button" data-export>Export CSV</button><span data-count></span><span class="v3-sorthint" data-sorthint></span></div><div class="v3-table-wrap"><table class="affiliation-table v3-table"><thead><tr>${columns.map((c,i)=>`<th class="${c.num?'num ':''}v3-th-sort" data-sort-col="${i}" role="button" tabindex="0" title="กดเพื่อเรียงจากมากไปน้อย กดซ้ำเพื่อสลับ">${esc(c.title)}<span class="v3-sortmark is-off">\u21c5</span></th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="v3-pager"><button data-prev>← ก่อนหน้า</button><span data-page></span><button data-next>ถัดไป →</button></div></div>`;
    const input=container.querySelector('input'),select=container.querySelector('select');select.value=state.mode;if(!options.valid)select.hidden=true;
    let filtered=[];
    function paint(){const q=state.q.toLowerCase();filtered=items.filter(item=>(!q||columns.some(c=>String(c.value(item)??'').toLowerCase().includes(q)))&&(!options.valid||state.mode==='all'||(state.mode==='valid'?options.valid(item):!options.valid(item))));
      if(state.sortCol!==null&&state.sortCol!==undefined&&columns[state.sortCol])filtered=sortItems(filtered,columns[state.sortCol],state.sortDir);
      const pages=Math.max(1,Math.ceil(filtered.length/50));state.page=Math.min(state.page,pages);
      container.querySelector('tbody').innerHTML=filtered.slice((state.page-1)*50,state.page*50).map(item=>`<tr>${columns.map(c=>`<td class="${c.num?'num':''}">${c.html?c.html(item):esc(c.value(item))}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length}">ไม่มีรายการตามตัวกรอง</td></tr>`;
      container.querySelector('[data-page]').textContent=`หน้า ${state.page} / ${pages}`;container.querySelector('[data-count]').textContent=`${fmt(filtered.length)} รายการ`;
      container.querySelector('[data-prev]').disabled=state.page<=1;container.querySelector('[data-next]').disabled=state.page>=pages;
      const on=state.sortCol!==null&&state.sortCol!==undefined&&columns[state.sortCol];
      const hint=container.querySelector('[data-sorthint]');
      if(hint)hint.textContent=on?`เรียงตาม ${columns[state.sortCol].title} ${state.sortDir==='desc'?'มาก \u2192 น้อย':'น้อย \u2192 มาก'}`:'กดหัวคอลัมน์เพื่อเรียง';
      container.querySelectorAll('[data-sort-col]').forEach(cell=>{
        const i=Number(cell.dataset.sortCol),active=on&&state.sortCol===i;
        cell.classList.toggle('is-on',Boolean(active));
        cell.setAttribute('aria-sort',active?(state.sortDir==='asc'?'ascending':'descending'):'none');
        const mark=cell.querySelector('.v3-sortmark');
        if(mark){mark.textContent=active?SORT_ARROW[state.sortDir]:'\u21c5';mark.classList.toggle('is-off',!active);}
      });
    }
    function toggleSort(i){
      if(state.sortCol!==i){state.sortCol=i;state.sortDir='desc';}   // ครั้งแรก มาก -> น้อย
      else if(state.sortDir==='desc')state.sortDir='asc';            // ครั้งที่สอง น้อย -> มาก
      else{state.sortCol=null;state.sortDir='desc';}                 // ครั้งที่สาม กลับลำดับตั้งต้น
      state.page=1;paint();
    }
    const head=container.querySelector('thead');
    head.addEventListener('click',e=>{const cell=e.target.closest('[data-sort-col]');if(cell)toggleSort(Number(cell.dataset.sortCol));});
    head.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const cell=e.target.closest('[data-sort-col]');if(cell){e.preventDefault();toggleSort(Number(cell.dataset.sortCol));}});
    input.oninput=()=>{state.q=input.value;state.page=1;paint();};select.onchange=()=>{state.mode=select.value;state.page=1;paint();};
    container.querySelector('[data-prev]').onclick=()=>{state.page--;paint();};container.querySelector('[data-next]').onclick=()=>{state.page++;paint();};container.querySelector('[data-export]').onclick=()=>csvExport(filtered,columns,'V3-'+key);paint();
  }
  const recordColumns=[
    {title:'วันที่',value:r=>M.date(r[2])},
    {title:'User ID',value:r=>r[3]||'Not Found'}, {title:'ชื่อพนักงาน',value:r=>M.personName(r,roster),html:r=>{const nd=M.personName(r,roster);const raw=String(r[1]||'').trim();const nick=M.personNickname(r,roster);const extra=[nick?'ชื่อเล่น '+esc(nick):'',(raw&&raw!==nd)?'ในข้อมูลผลงาน: '+esc(raw):'',M.inRoster(r,roster)?'':'ไม่พบในทะเบียน'].filter(Boolean).join(' · ');return esc(nd)+(extra?`<span class="sub">${extra}</span>`:'');}},
    {title:'ระบบ',value:r=>M.system(r)}, {title:'กะ',value:r=>r[32]||'Not Found'},
    {title:'Zone',value:r=>r[33]||'Not Found'}, {title:'สังกัด',value:r=>r[34]||'Not Found'},
    {title:'BU',value:r=>r[35]||'Not Found'}, {title:'Type Pick',value:r=>r[36]||'Not Found'},
    {title:'Total Pick',value:r=>M.number(r[4]),num:true,html:r=>fmt(M.number(r[4]))},
    {title:'ชั่วโมงทำงาน',value:r=>M.number(r[6]),num:true,html:r=>fmt(M.number(r[6]),1)},
    {title:'ค่าเฉลี่ย/ชม.',value:r=>r[31]||'ว่าง',num:true},
    {title:'สถานะ',value:r=>M.number(r[31])>0?'เข้าเฉลี่ย':'ไม่เข้าเฉลี่ย',html:r=>`<span class="pill v3-pill ${M.number(r[31])>0?'good':'warn'}">${M.number(r[31])>0?'เข้าเฉลี่ย':'ไม่เข้าเฉลี่ย'}</span>`}
  ];
  function recordsPage(){if(!$('v3Records'))return;const data=visible();$('v3Records').innerHTML=stats(data)+'<div id="v3RecordsTable"></div>';table($('v3RecordsTable'),'records',data,recordColumns,{valid:r=>M.number(r[31])>0});}
  function zonePage(){if(!$('v3ZoneMap')||!$('v3ZoneTable'))return;const data=visible();const buckets=new Map(zones.map(z=>[z.key,[]]));const unknown=[];
    data.forEach(r=>{const z=zone(r);(z?buckets.get(z.key):unknown).push(r);});
    const groups=zones.map(z=>({...z,stats:M.aggregate(buckets.get(z.key))}));if(unknown.length)groups.push({key:'unknown',label:'Not Found',group:'',stats:M.aggregate(unknown)});
    const max=Math.max(1,...groups.map(z=>z.stats.total));
    $('v3ZoneMap').innerHTML=groups.sort((a,b)=>b.stats.total-a.stats.total).map(z=>{const intensity=z.stats.total/max;const target=z.key==='unknown'?TARGETS.overall:getZoneTarget(z.key,z.group);return `<button class="tile v3-zone" data-zone="${esc(z.label)}" style="background:hsl(245 72% ${94-intensity*43}%);color:${intensity>.57?'white':'#303c63'}"><strong>${esc(z.label)}</strong><small>${esc(labels[z.group]||'ไม่พบโซน')}</small><span>${fmt(z.stats.total)} Total Pick</span><b>${fmt(z.stats.average,0)} <small style="display:inline">Pick/ชม.</small></b><small>Target ${fmt(target)} · ${fmt(z.stats.count)} แถวเข้าเฉลี่ย · ${fmt(z.stats.people)} คน</small></button>`;}).join('');
    $('v3ZoneMap').querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
      const selected=groups.find(z=>z.label===btn.dataset.zone);
      const detail=data.filter(r=>(zone(r)?.key||'unknown')===selected.key);
      let panel=$('v3ZoneDetail');if(!panel){panel=document.createElement('div');panel.id='v3ZoneDetail';$('v3ZoneTable').after(panel);}
      panel.innerHTML=`<h2>รายการของ Zone ${esc(selected.label)}</h2>`+stats(detail)+'<div id="v3ZoneDetailRows"></div>';
      table($('v3ZoneDetailRows'),'zone-detail',detail,recordColumns,{valid:r=>M.number(r[31])>0});
      panel.scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('v3ZoneDetail')?.remove();
    table($('v3ZoneTable'),'zones',groups,[{title:'Zone',value:z=>z.label},{title:'ประเภทงาน',value:z=>labels[z.group]||'Not Found'},{title:'Total Pick',value:z=>z.stats.total,num:true},{title:'Productivity',value:z=>z.stats.average===null?'—':fmt(z.stats.average,0),num:true},{title:'แถวเข้าเฉลี่ย',value:z=>z.stats.count,num:true},{title:'ไม่เข้าเฉลี่ย',value:z=>z.stats.excluded,num:true},{title:'พนักงาน',value:z=>z.stats.people,num:true}]);
  }
  /* ══════════ หน้าไม่ถึงเป้า (แยกตามโซน) ══════════
     ลอกองค์ประกอบจาก V2 app.js renderBelowTargetPage()/drawBelowTargetChart()
       การ์ดสรุป 5 ใบ (.zone-summary/.zone-stat) → กราฟแท่งซ้อนต่อโซน → โน้ตเกณฑ์ → ตารางโซน → ตารางรายคน
     กฎที่ใช้เป็นของ V1 ทั้งหมด
       ค่าเฉลี่ยรายคน = ผลรวมคอลัมน์ AF เฉพาะค่า > 0 ÷ จำนวนแถวนั้น (v1-engine.js:1752)
       ไม่ถึงเป้า = ค่าเฉลี่ย < Target ของโซน  (เท่ากับเป้านับว่าผ่าน v1-engine.js:2111)
       คนหนึ่งคนนับครั้งเดียว โดยยึดโซนหลัก = โซนที่มีแถวเข้าเฉลี่ยมากที่สุด เหมือน V2 ที่เทียบรายคนกับโซนหลัก */
  function statCards(list){
    return `<div class="zone-summary">${list.map(([label,value,unit,detail,color])=>
      `<div class="zone-stat"><div class="zone-stat-label">${esc(label)}</div>`
      + `<div class="zone-stat-value" style="color:${color||'#1e293b'}">${value}${unit?`<span> ${esc(unit)}</span>`:''}</div>`
      + `<div class="zone-stat-detail">${esc(detail||'')}</div></div>`).join('')}</div>`;
  }

  function zoneTargetOf(z){
    return z.key==='unknown'
      ? (Number(window.TARGETS&&window.TARGETS.overall)||170)
      : Number(getZoneTarget(z.key,z.group))||170;
  }

  /* จับกลุ่มรายคน แล้วหาโซนหลักของแต่ละคนจากจำนวนแถวที่เข้าเฉลี่ย */
  function buildBelowTarget(data){
    const people=new Map();
    data.forEach(r=>{
      const id=M.userId(r); if(!id)return;
      let p=people.get(id);
      if(!p){p={id,name:M.personName(r,roster),rows:[],sum:0,count:0,total:0,hours:0,zoneRows:new Map()};people.set(id,p);}
      p.rows.push(r);
      p.total+=M.number(r[4]);
      p.hours+=M.number(r[6]);
      const af=M.number(r[31]);
      if(af>0){
        p.sum+=af;p.count+=1;
        const z=zone(r);
        const key=z?z.key:'unknown';
        p.zoneRows.set(key,(p.zoneRows.get(key)||0)+1);
      }
    });
    const zoneByKey=new Map(zones.map(z=>[z.key,z]));
    zoneByKey.set('unknown',{key:'unknown',label:'Not Found',group:''});
    const list=[];
    people.forEach(p=>{
      if(!p.count)return;                                   // ไม่มีแถวเข้าเฉลี่ย ไม่ตัดสิน
      const main=[...p.zoneRows.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))[0];
      const z=zoneByKey.get(main[0])||zoneByKey.get('unknown');
      const average=p.sum/p.count;
      const target=zoneTargetOf(z);
      list.push({...p,zone:z,zoneRowCount:main[1],average,target,
        gap:average-target,eff:target>0?average/target*100:0,
        below:average<target,zoneCount:p.zoneRows.size});
    });
    const groups=[];
    zoneByKey.forEach(z=>{
      const all=list.filter(x=>x.zone.key===z.key);
      if(!all.length)return;
      const below=all.filter(x=>x.below);
      const rowsOfZone=all.reduce((a,x)=>a+x.count,0);
      groups.push({zone:z,target:zoneTargetOf(z),all,below,
        average:all.reduce((a,x)=>a+x.sum,0)/Math.max(1,rowsOfZone),
        total:all.reduce((a,x)=>a+x.total,0),
        avgGap:below.length?below.reduce((a,x)=>a+Math.abs(x.gap),0)/below.length:0});
    });
    // แย่สุดขึ้นก่อน เหมือน V2 (จำนวนคนตกเป้ามาก→น้อย แล้วคนทั้งหมดมาก→น้อย แล้วชื่อโซน)
    groups.sort((a,b)=>(b.below.length-a.below.length)||(b.all.length-a.all.length)||a.zone.label.localeCompare(b.zone.label));
    return {list,groups};
  }

  // เก็บอินสแตนซ์กราฟไว้เอง เพราะ host.innerHTML สร้าง canvas ใบใหม่ก่อนจะวาด
  // ทำให้ Chart.getChart('id') หาอินสแตนซ์เดิมไม่เจอ แล้วกราฟเก่าค้างสะสมทุกครั้งที่เรนเดอร์
  let belowTargetChart=null;
  function destroyBelowTargetChart(){
    if(belowTargetChart){try{belowTargetChart.destroy();}catch(e){}belowTargetChart=null;}
  }
  function drawBelowTargetChart(groups){
    const el=$('v3BelowTargetChart');
    if(!el||typeof Chart==='undefined')return;
    destroyBelowTargetChart();
    const old=Chart.getChart(el); if(old)old.destroy();
    const list=groups.slice(0,20);
    const maxTotal=Math.max(1,...list.map(z=>z.all.length));
    belowTargetChart=new Chart(el,{
      type:'bar',
      data:{labels:list.map(z=>z.zone.label),datasets:[
        {label:'ไม่ถึงเป้า (คน)',data:list.map(z=>z.below.length),backgroundColor:'#f43f5e',borderRadius:6,stack:'s'},
        {label:'ถึงเป้า (คน)',data:list.map(z=>z.all.length-z.below.length),backgroundColor:'#10b981',borderRadius:6,stack:'s'}
      ]},
      options:{maintainAspectRatio:false,
        plugins:{legend:{position:'top',labels:{usePointStyle:true,boxWidth:8,padding:14,font:{size:11}}},
          datalabels:{color:'#fff',font:{size:10,weight:'700'},formatter:v=>v>0?v:''},
          tooltip:{backgroundColor:'rgba(15,23,42,.92)',padding:10,cornerRadius:8,callbacks:{afterBody:items=>{
            const z=list[items[0].dataIndex];
            return [`Target โซน: ${fmt(z.target)} หยิบ/ชม.`,`ประเภท: ${labels[z.zone.group]||'ไม่พบโซน'}`,
              `ค่าเฉลี่ยโซน: ${fmt(z.average,0)} หยิบ/ชม.`];
          }}}},
        scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:10.5}}},
          y:{stacked:true,beginAtZero:true,suggestedMax:Math.ceil(maxTotal*1.35),
            ticks:{precision:0,font:{size:10.5}},grid:{color:'rgba(148,163,184,.25)'},
            title:{display:true,text:'จำนวนคน',font:{size:10.5}}}}}
    });
  }

  function belowTargetPage(){
    const host=$('v3BelowTarget'); if(!host)return;
    const data=visible();
    const {list,groups}=buildBelowTarget(data);
    if(!list.length){
      destroyBelowTargetChart();
      host.innerHTML='<div class="card v3-card"><div class="staff-miss-ok">ยังไม่มีพนักงานที่นับ Productivity ได้ในช่วงที่เลือก</div></div>';
      return;
    }
    const below=list.filter(x=>x.below);
    const withMiss=groups.filter(z=>z.below.length);
    const missPct=list.length?below.length/list.length*100:0;
    const avgGap=below.length?below.reduce((a,x)=>a+Math.abs(x.gap),0)/below.length:0;
    // "โซนที่ต้องดูก่อน" ต้องเป็นโซนจริง กอง Not Found ไม่ใช่โซน จึงรายงานแยกในโน้ตด้านล่าง
    const worst=withMiss.find(z=>z.zone.key!=='unknown')||withMiss[0]||null;
    const unknownGroup=groups.find(z=>z.zone.key==='unknown')||null;
    const colorPct=missPct>=50?'#e11d48':missPct>=25?'#ea580c':'#16a34a';
    const typeMeta={fullRack:{icon:'▦',title:'Full Rack',tone:'blue'},halfRack:{icon:'▥',title:'Half Rack',tone:'violet'},ea:{icon:'▤',title:'Micro Rack',tone:'teal'},pickToSort:{icon:'⇥',title:'Pick to Sort',tone:'orange'},mezzanine:{icon:'⌂',title:'Mezzanine',tone:'slate'}};
    const typeRows=Object.keys(typeMeta).map((key)=>{
      const items=groups.filter((g)=>g.zone.group===key);
      const all=items.reduce((n,g)=>n+g.all.length,0), miss=items.reduce((n,g)=>n+g.below.length,0);
      return {...typeMeta[key],key,all,miss,share:all?miss/all*100:0,zoneCount:items.length};
    }).filter((x)=>x.all>0).sort((a,b)=>b.miss-a.miss||b.all-a.all);
    const typeCards=`<div class="v3-type-zone-grid">${typeRows.map((x)=>`<div class="v3-type-zone-card ${x.tone}">
      <div class="v3-type-zone-icon">${x.icon}</div><div class="v3-type-zone-main"><div class="v3-type-zone-title">${x.title}</div>
      <div class="v3-type-zone-meta">${fmt(x.zoneCount)} โซน · ${fmt(x.all)} คน</div></div>
      <div class="v3-type-zone-score"><strong>${fmt(x.miss)}</strong><span>คนไม่ถึงเป้า</span></div>
      <div class="v3-type-zone-track"><i style="width:${Math.min(100,x.share)}%"></i></div><div class="v3-type-zone-percent">${fmt(x.share,1)}%</div>
    </div>`).join('')}</div>`;

    destroyBelowTargetChart();
    host.innerHTML=statCards([
      ['ไม่ถึงเป้า',fmt(below.length),'คน',`จากทั้งหมด ${fmt(list.length)} คนที่นับได้`,below.length?'#e11d48':'#16a34a'],
      ['สัดส่วนที่ไม่ถึงเป้า',fmt(missPct,1)+'%','',`ถึงเป้า ${fmt(list.length-below.length)} คน`,colorPct],
      ['ช่องว่างเฉลี่ย',fmt(avgGap,0),'หยิบ/ชม.','ต่ำกว่า Target ของโซนเฉลี่ย','#ea580c'],
      ['โซนที่ต้องดูก่อน',worst?esc(worst.zone.label):'—','',
        worst?`ไม่ถึงเป้า ${fmt(worst.below.length)} / ${fmt(worst.all.length)} คน`:'ทุกโซนถึงเป้า','#be123c'],
      ['โซนที่มีคนไม่ถึงเป้า',fmt(withMiss.length),`/ ${fmt(groups.length)} โซน`,'นับจากโซนหลักที่ทำงานจริง','#7c3aed']
    ])
    +`<div class="card wide"><h3>⚠️ พนักงานที่ยังไม่ถึง Target ของโซน</h3>
      <div class="sub">เทียบ Productivity รายคนกับ Target ของโซนหลักที่ทำแถวมากที่สุด · โซนไหนตั้ง Target เองไว้จะใช้ค่านั้นก่อน Target ตามประเภทงาน</div>
      <div class="v3-type-zone-heading"><span>ภาพรวมตามประเภทงาน</span><small>ดูว่ากลุ่มงานใดมีคนต่ำกว่าเป้ามากที่สุด</small></div>${typeCards}
      <div class="chartbox tall"><canvas id="v3BelowTargetChart"></canvas></div>
      <div class="note v3-notice">นับเฉพาะคนที่มีแถวเข้าเฉลี่ย · ค่าเฉลี่ยรายคนคือผลรวมค่าเฉลี่ยต่อชั่วโมงของแถวที่นับได้ ÷ จำนวนแถวนั้น ไม่ได้เฉลี่ยค่าเฉลี่ยซ้ำ · เท่ากับเป้านับว่าผ่าน · คนหนึ่งคนนับครั้งเดียวที่โซนหลัก
        ${unknownGroup?`<br><b>กอง Not Found ไม่ใช่โซนจริง</b> — มี ${fmt(unknownGroup.all.length)} คนที่ข้อมูลโซนไม่ตรงกฎโซนของ V1 (ไม่ถึงเป้า ${fmt(unknownGroup.below.length)} คน) กองนี้เทียบกับ Target รวม ${fmt(unknownGroup.target)} เพราะไม่รู้ประเภทงาน ต้องเติม Zone ให้ถูกก่อนจะเชื่อเลขของกองนี้ได้`:''}</div></div>
    <h2 class="staff-table-title">โซนที่มีคนไม่ถึงเป้า</h2>
    <p class="panel-desc">เรียงโซนที่มีคนตกเป้ามากที่สุดขึ้นก่อน · กดหัวคอลัมน์เพื่อเรียงใหม่ได้</p>
    <div id="v3BelowTargetZones"></div>
    <h2 class="staff-table-title">รายคนที่ไม่ถึงเป้า</h2>
    <p class="panel-desc">เรียงคนที่ห่างจากเป้ามากที่สุดขึ้นก่อน · Gap ติดลบคือยังขาดอีกกี่หยิบ/ชม.</p>
    <div id="v3BelowTargetPeople"></div>`;

    drawBelowTargetChart(groups);

    table($('v3BelowTargetZones'),'below-zones',groups,[
      {title:'โซน',value:z=>z.zone.label,html:z=>`<b>${esc(z.zone.label)}</b><span class="sub">${esc(labels[z.zone.group]||'ไม่พบโซน')}</span>`},
      {title:'ไม่ถึงเป้า (คน)',value:z=>z.below.length,num:true,
        html:z=>z.below.length?`<span class="v3-pill warn">${fmt(z.below.length)} คน</span>`:`<span class="v3-pill good">ครบทุกคน</span>`},
      {title:'คนทั้งหมดในโซน',value:z=>z.all.length,num:true},
      {title:'สัดส่วนที่ไม่ถึงเป้า',value:z=>z.all.length?z.below.length/z.all.length*100:0,num:true,
        html:z=>fmt(z.all.length?z.below.length/z.all.length*100:0,1)+'%'},
      {title:'ค่าเฉลี่ยโซน',value:z=>z.average,num:true,html:z=>fmt(z.average,0)},
      {title:'Target โซน',value:z=>z.target,num:true},
      {title:'ช่องว่างเฉลี่ยของคนที่ตกเป้า',value:z=>z.avgGap,num:true,sortValue:z=>z.below.length?z.avgGap:null,
        html:z=>z.below.length?`<span class="staff-down">-${fmt(z.avgGap,0)}</span>`:'—'},
      {title:'Total Pick',value:z=>z.total,num:true,html:z=>fmt(z.total)}
    ]);

    const ranked=[...below].sort((a,b)=>a.gap-b.gap);
    table($('v3BelowTargetPeople'),'below-people',ranked,[
      {title:'#',value:x=>ranked.indexOf(x)+1,num:true,html:x=>`<span class="rank">${ranked.indexOf(x)+1}</span>`},
      {title:'รหัสพนักงาน',value:x=>x.id},
      {title:'ชื่อ',value:x=>x.name,html:x=>esc(x.name)+(x.zoneCount>1?`<span class="sub">ทำ ${fmt(x.zoneCount)} โซน</span>`:'')},
      {title:'โซนหลัก',value:x=>x.zone.label,html:x=>`${esc(x.zone.label)}<span class="sub">${fmt(x.zoneRowCount)} แถวในโซนนี้</span>`},
      {title:'Productivity',value:x=>x.average,num:true,html:x=>`<b style="color:#b91c1c">${fmt(x.average,0)}</b><span class="sub">${fmt(x.count)} แถวเข้าเฉลี่ย</span>`},
      {title:'Target โซน',value:x=>x.target,num:true},
      {title:'Gap',value:x=>x.gap,num:true,html:x=>`<span class="staff-down">${fmt(x.gap,0)}</span>`},
      {title:'% Efficiency',value:x=>x.eff,num:true,html:x=>fmt(x.eff,1)+'%'},
      {title:'ชั่วโมงทำงาน',value:x=>x.hours,num:true,html:x=>fmt(x.hours,1)},
      {title:'Total Pick',value:x=>x.total,num:true,html:x=>fmt(x.total)}
    ]);
  }

  function staffPage(){if(!$('v3Staff'))return;const data=visible(),activity=new Map();data.forEach(r=>{const id=String(r[3]||'Not Found').trim();if(!activity.has(id))activity.set(id,[]);activity.get(id).push(r);});
    const keys=new Set([...roster.keys(),...activity.keys()]);let items=[...keys].map(id=>{const master=roster.get(id),work=activity.get(id)||[],s=M.aggregate(work);return {id,master,work,s,name:master?.[2]||work[0]?.[1]||'Not Found',shift:master?.[12]||'Not Found',aff:master?.[4]||'Not Found',status:master?.[7]||'Not Found'};});
    if(V3Data.filters.shift!=='ALL')items=items.filter(i=>i.work.length||i.shift===V3Data.filters.shift);
    if(V3Data.filters.system!=='ALL')items=items.filter(i=>i.work.length||(i.master&&M.system({36:i.master[10]})===V3Data.filters.system));
    items.sort((a,b)=>b.s.total-a.s.total);
    $('v3Staff').innerHTML=cards([['พนักงานในมุมมอง',fmt(items.length),'ทะเบียน + คนที่พบในผลงาน'],['มีผลงานในช่วงนี้',fmt(items.filter(i=>i.work.length).length),'นับ User ID ไม่ซ้ำ'],['ไม่มีผลงานช่วงนี้',fmt(items.filter(i=>!i.work.length).length),'ไม่ใช่ข้อสรุปว่าขาดงาน'],['ไม่มีทะเบียน',fmt(items.filter(i=>!i.master).length),'คงยอดย้อนหลังไว้']])+'<div id="v3StaffTable"></div><div id="v3StaffDetail"></div>';
    table($('v3StaffTable'),'staff',items,[{title:'User ID',value:i=>i.id,html:i=>`<button data-staff="${esc(i.id)}">${esc(i.id)}</button>`},{title:'ชื่อ',value:i=>i.name},{title:'สังกัดปัจจุบัน',value:i=>i.aff},{title:'กะปัจจุบัน',value:i=>i.shift},{title:'สถานะทะเบียน',value:i=>i.status},{title:'Zone ปัจจุบัน',value:i=>i.master?.[9]||'Not Found'},{title:'Total Pick',value:i=>i.s.total,num:true},{title:'Productivity',value:i=>fmt(i.s.average,0),num:true},{title:'วันมีงาน',value:i=>new Set(i.work.map(r=>M.date(r[2]))).size,num:true},{title:'แถวเข้าเฉลี่ย',value:i=>i.s.count,num:true}]);
    $('v3StaffTable').onclick=e=>{const btn=e.target.closest('[data-staff]');if(btn){selectedStaff=btn.dataset.staff;detail();}};
    function detail(){if(!selectedStaff)return;const item=items.find(i=>i.id===selectedStaff);if(!item)return;$('v3StaffDetail').innerHTML=`<h2 style="margin-top:25px">${esc(item.id)} · ${esc(item.name)}</h2>`+stats(item.work)+'<div id="v3PersonRows"></div>';table($('v3PersonRows'),'person',item.work,recordColumns,{valid:r=>M.number(r[31])>0});}detail();
  }
  /* หน้าช่วงเวลา — ใช้คอลัมน์ H–AE ที่ Sheet บันทึกยอดต่อชั่วโมงไว้แล้วครบ 24 ช่อง
     ผลรวม 24 ช่องเท่ากับ Total Pick คอลัมน์ E จึงเจาะได้ทั้งรายชั่วโมงและรายคน
     ชื่อพนักงานยึดทะเบียนพนักงาน */
  function hoursPage(){
    if(!$('v3Hours'))return;
    const data=visible(),total=M.aggregate(data);
    const headers=source.sheets['Results Master'].headers;
    const labels=M.hourLabels(headers);
    const totals=M.hourTotals(data);
    const hourlySum=totals.reduce((a,b)=>a+b,0);
    const peoplePerHour=Array.from({length:24},()=>new Set());
    const topPerHour=Array.from({length:24},()=>({name:'',value:0}));
    const perPerson=new Map();
    data.forEach(r=>{
      const id=M.userId(r)||'Not Found';
      let p=perPerson.get(id);
      if(!p){p={id,name:M.personName(r,roster),nick:M.personNickname(r,roster),inRoster:M.inRoster(r,roster),shift:M.shiftKey(r),rows:[],hours:new Array(24).fill(0)};perPerson.set(id,p);}
      p.rows.push(r);
      const values=M.hourValues(r);
      for(let i=0;i<24;i++){
        const v=values[i];
        if(v>0){
          p.hours[i]+=v;
          peoplePerHour[i].add(id);
          if(v>topPerHour[i].value)topPerHour[i]={name:p.name,value:v};
        }
      }
    });
    const peakIndex=totals.indexOf(Math.max(...totals));
    const activeHours=totals.filter(v=>v>0).length;
    const people=[...perPerson.values()].map(p=>{
      const s=M.aggregate(p.rows);
      const active=p.hours.map((v,i)=>({v,i})).filter(x=>x.v>0);
      return {...p,stats:s,hourCount:active.length,
        firstHour:active.length?labels[active[0].i]:'',
        lastHour:active.length?labels[active[active.length-1].i]:'',
        peakHour:active.length?labels[active.reduce((a,b)=>b.v>a.v?b:a).i]:'',
        hourSum:p.hours.reduce((a,b)=>a+b,0)};
    }).sort((a,b)=>b.hourSum-a.hourSum);

    const diff=total.total-hourlySum;
    $('v3Hours').innerHTML=cards([
      ['Total Pick',fmt(total.total),'ยอดหลัก'],
      ['ผลรวม 24 ช่องเวลา',fmt(hourlySum),diff===0?'ตรงกับ Total Pick พอดี':'ต่างจาก Total Pick '+fmt(diff)],
      ['ชั่วโมงที่หยิบมากสุด',peakIndex>=0&&totals[peakIndex]>0?esc(labels[peakIndex]):'—',totals[peakIndex]>0?fmt(totals[peakIndex])+' ชิ้น · มีงาน '+fmt(activeHours)+' จาก 24 ช่วง':'ยังไม่มียอดในช่วงที่เลือก'],
      ['พนักงานที่มีงาน',fmt(total.people),fmt(total.count)+' แถวเข้าเฉลี่ย · Productivity '+fmt(total.average,0)+' หยิบ/ชม.']
    ])
    +`<div class="card wide v3-card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:4px;"><h2 style="margin:0;">🕒 ยอดหยิบตามช่วงเวลา (Hourly Activity)</h2><span class="pill" style="background:#f0fdf4;color:#15803d;font-weight:700;">24 ช่วง · ข้อมูลรายชั่วโมง</span></div><div class="sub" style="margin-bottom:12px;">ยอดตามหัวตารางของ Sheet เริ่ม ${esc(labels[0]||'')} ถึง ${esc(labels[23]||'')} · ยึดวันที่ตามที่บันทึกไว้ ไม่ปรับเวลาและไม่ย้ายยอดหลังเที่ยงคืน · ช่วงที่เป็น 0 คือ Sheet ยังไม่มียอดในช่องนั้น</div><div class="chartbox tall"><canvas id="hoursChart"></canvas></div></div>`
    +`<div id="v3HoursTable"></div>`
    +`<h2 style="font-size:17px;font-weight:700;color:#0f172a;margin:22px 0 4px;">รายคนในแต่ละช่วงเวลา</h2><p class="panel-desc">ชื่อจากทะเบียนพนักงาน · ชั่วโมงที่มีงานนับเฉพาะช่องที่มียอดมากกว่า 0 · Productivity ยังใช้ค่าเฉลี่ยต่อชั่วโมงของแต่ละแถวที่นับได้ </p><div id="v3HoursPeople"></div>`;

    table($('v3HoursTable'),'hours',labels.map((label,i)=>({label,index:i,total:totals[i],people:peoplePerHour[i].size,top:topPerHour[i]})),[
      {title:'ช่วงเวลา',value:h=>h.label},
      {title:'Total Pick',value:h=>h.total,num:true,html:h=>fmt(h.total)},
      {title:'สัดส่วนใน 24 ช่อง',value:h=>hourlySum?h.total/hourlySum*100:0,num:true,html:h=>hourlySum?fmt(h.total/hourlySum*100,1)+'%':'—'},
      {title:'พนักงานที่มียอด',value:h=>h.people,num:true},
      {title:'คนที่หยิบมากสุดในช่วงนี้',value:h=>h.top.name||'—',html:h=>h.top.name?esc(h.top.name)+`<span class="sub">${fmt(h.top.value)} ชิ้น</span>`:'—'}
    ]);

    table($('v3HoursPeople'),'hours-people',people,[
      {title:'User ID',value:p=>p.id},
      {title:'ชื่อ',value:p=>p.name,html:p=>esc(p.name)+(p.nick||!p.inRoster?`<span class="sub">${[p.nick?'ชื่อเล่น '+esc(p.nick):'',p.inRoster?'':'ไม่พบในทะเบียน'].filter(Boolean).join(' · ')}</span>`:'')},
      {title:'กะ',value:p=>p.shift},
      {title:'ชั่วโมงที่มีงาน',value:p=>p.hourCount,num:true,html:p=>fmt(p.hourCount)+' / 24'},
      {title:'ช่วงแรก',value:p=>p.firstHour||'—'},
      {title:'ช่วงสุดท้าย',value:p=>p.lastHour||'—'},
      {title:'ช่วงที่หยิบมากสุด',value:p=>p.peakHour||'—'},
      {title:'Total Pick',value:p=>p.stats.total,num:true,html:p=>fmt(p.stats.total)},
      {title:'ผลรวม 24 ช่อง',value:p=>p.hourSum,num:true,html:p=>fmt(p.hourSum)},
      {title:'Productivity',value:p=>p.stats.average===null?0:p.stats.average,num:true,html:p=>fmt(p.stats.average,0)},
      {title:'ชั่วโมงทำงาน',value:p=>p.stats.hours,num:true,html:p=>fmt(p.stats.hours,1)}
    ]);

    // ให้ v2-views.js วาดกราฟ Chart.js ลงใน #hoursChart ที่เพิ่งสร้าง
    document.dispatchEvent(new CustomEvent('v3-hours-rendered',{detail:{labels,totals,peoplePerHour:peoplePerHour.map(s=>s.size)}}));
  }
  function issues(r){const list=[];const id=String(r[3]||'').trim();if(!id)list.push('ไม่มี User ID');else if(!roster.has(id))list.push('ไม่พบรหัสพนักงานในทะเบียน');if(M.isPlaceholder(r[1]))list.push('ช่องชื่อในข้อมูลผลงาน ไม่ใช่ชื่อคน');if(!String(r[32]||'').trim()||/not found|#n\/a/i.test(String(r[32])))list.push('ไม่พบกะ');if(!zone(r))list.push('ไม่พบ Zone');if(!M.type(r[36]))list.push('ไม่พบ Type Pick ที่ใช้วิเคราะห์');if(!String(r[34]||'').trim()||/not found|#n\/a/i.test(String(r[34])))list.push('ไม่พบสังกัด');return list;}
  /* รายการรายคน: เห็นแค่รหัสกับสถานะ แล้วกดเติมข้อมูลในหน้านี้เลย
     ตัวเติมอยู่ใน v2-roster-write.js ซึ่งเขียนเฉพาะชีต 2ND */
  const draftStatus=(id)=>(window.V3RosterWrite&&window.V3RosterWrite.draftStatus?window.V3RosterWrite.draftStatus(id):null);
  function renderQualityPeople(data){
    if(!$('v3QualityPeople'))return;
    const M2=M, resigned=M2.resignedMap(source.sheets['Resigned']);
    const byId=new Map();
    data.forEach(r=>{const id=M2.userId(r);if(!id)return;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(r);});
    const items=[...byId.entries()]
      .filter(([id])=>!roster.has(id))
      .map(([id,rs])=>{
        const st=M2.aggregate(rs);
        const sheetRes=resigned.get(id);
        const res=sheetRes?{...sheetRes,source:'sheet'}
          :(window.V3RosterWrite&&window.V3RosterWrite.resignedDraft?window.V3RosterWrite.resignedDraft(id):null);
        const dates=[...new Set(rs.map(r=>M2.date(r[2])))].sort();
        return {id,stats:st,resigned:res,rows:rs,
          name:M2.personName(rs[0],roster),
          firstDate:dates[0]||'',lastDate:dates[dates.length-1]||'',
          missKeys:res?['name']:['roster','name','start','shift','aff','bu','type','zone']};
      })
      .sort((a,b)=>(Number(Boolean(a.resigned))-Number(Boolean(b.resigned)))||(b.stats.total-a.stats.total));

    const writer=window.V3RosterWrite;
    const active=items.filter(x=>!x.resigned).length;
    const webOut=items.filter(x=>x.resigned&&x.resigned.source==='web').length;
    if($('v3QualityWriteBar')){
      $('v3QualityWriteBar').innerHTML=(writer?`<span class="rw-status-wrap">${writer.statusHtml()}</span>`:'')
        +`<span class="staff-miss-pill">ยังไม่มีทะเบียน <b>${fmt(items.length)}</b> รหัส</span>`
        +`<span class="staff-miss-pill">ยังทำงานอยู่ <b>${fmt(active)}</b> รหัส</span>`
        +`<span class="staff-miss-pill is-out">⛔ ออกแล้ว <b>${fmt(items.length-active)}</b> รหัส</span>`
        +(webOut?`<span class="staff-miss-pill is-out">กรอกในเว็บว่าออกแล้ว <b>${fmt(webOut)}</b> รหัส</span>`:'')
        +`<span class="staff-miss-hint">สืบมาแล้วพบว่าลาออกไปแล้ว → กด <b>เติมข้อมูล</b> แล้วเลือก <b>⛔ ลาออกแล้ว</b> กรอกแค่ชื่อกับวันที่ออก</span>`;
      if(writer)writer.bind($('v3QualityWriteBar'),id=>items.find(x=>x.id===id),()=>qualityPage());
    }

    table($('v3QualityPeople'),'quality-people',items,[
      {title:'รหัสพนักงาน',value:x=>x.id,html:x=>`<b>${esc(x.id)}</b>`},
      {title:'สถานะ',value:x=>x.resigned?(x.resigned.source==='web'?'ออกแล้ว (กรอกในเว็บ)':'ออกแล้ว (ยืนยันแล้ว)'):(draftStatus(x.id)==='active'?'กรอกแล้ว รอใส่ใน Sheet':'Not Found'),
        html:x=>{
          if(x.resigned){const web=x.resigned.source==='web';const d=x.resigned.date?String(x.resigned.date).split('-').reverse().join('/'):'ไม่ทราบวันที่';
            return `<span class="staff-resigned${web?' is-web':''}" title="${web?'กรอกในเว็บ ยังไม่ได้ใส่ในรายชื่อที่ลาออก':'อยู่ในรายชื่อที่ลาออก'}">⛔ ออกแล้ว ${d}${web?' · กรอกในเว็บ':''}</span>`;}
          return draftStatus(x.id)==='active'
            ?`<span class="v3-pill good">กรอกแล้ว รอใส่ใน Sheet</span>`
            :`<span class="v3-pill warn">Not Found — ยังไม่มีทะเบียน</span>`;}},
      {title:'Total Pick',value:x=>x.stats.total,num:true,html:x=>fmt(x.stats.total)},
      {title:'ช่วงที่พบผลงาน',value:x=>x.firstDate,
        html:x=>`${x.firstDate?x.firstDate.split('-').reverse().join('/'):'—'}<span class="sub">ถึง ${x.lastDate?x.lastDate.split('-').reverse().join('/'):'—'}</span>`},
      {title:'ระบุว่าใคร',value:x=>x.resigned?'ออกแล้ว':'เติมได้',
        html:x=>(window.V3RosterWrite?window.V3RosterWrite.buttonHtml(x):'—')}
    ]);
    if(window.V3RosterWrite){
      window.V3RosterWrite.bind($('v3QualityPeople'),id=>items.find(x=>x.id===id),()=>qualityPage());
    }
  }

  function qualityPage(){if(!$('v3Quality'))return;const data=visible(),problem=data.filter(r=>issues(r).length);const noMaster=data.filter(r=>!roster.has(String(r[3]||'').trim()));const invalid=rows.filter(r=>!M.date(r[2]));
    $('v3Quality').innerHTML=cards([['แถวที่ต้องตรวจ',fmt(problem.length),'ไม่ตัดจากยอดอัตโนมัติ'],['Total Pick ของแถวที่ต้องตรวจ',fmt(M.aggregate(problem).total),'นับแต่ละแถวครั้งเดียว'],['ยอดที่ไม่มีทะเบียน',fmt(M.aggregate(noMaster).total),'อาจเป็นพนักงานเก่าหรือรหัสไม่ตรง'],['แถวไม่มีวันที่ทั้งไฟล์',fmt(invalid.length),'รวมแถวสูตรท้าย Sheet ไม่เข้าในวันรายงาน']])+`<div class="note v3-notice">Productivity อ้างอิงค่าเฉลี่ยต่อชั่วโมงที่ชีตบันทึกไว้จริง ไม่แก้ค่าเองเมื่อพบ Not Found ส่วนทะเบียนพนักงาน เป็นข้อมูลปัจจุบัน การไม่พบทะเบียนไม่ได้ยืนยันว่าพนักงานลาออก</div>`
      +`<h2 class="staff-table-title">รหัสพนักงานที่ยังไม่มีทะเบียน</h2><p class="panel-desc">เห็นรหัสแล้วกดปุ่มเติมข้อมูลเพื่อระบุว่ารหัสนี้คือใคร แก้ได้ในหน้านี้เลย · ถ้าสืบมาแล้วพบว่า<b>ลาออกไปแล้ว</b> ให้เลือกปุ่ม ⛔ ลาออกแล้ว ในฟอร์ม กรอกแค่ชื่อกับวันที่ออกพอ ปลายทางคือรายชื่อที่ลาออก ไม่ใช่ทะเบียนพนักงาน</p><div class="staff-miss-summary" id="v3QualityWriteBar"></div><div id="v3QualityPeople"></div>`
      +`<h2 class="staff-table-title">รายการแถวที่ต้องตรวจ</h2><p class="panel-desc">รายละเอียดระดับแถวสำหรับคนที่อยากไล่ดูต้นทาง</p><div id="v3QualityTable"></div>`;
    renderQualityPeople(data);
    table($('v3QualityTable'),'quality',problem,recordColumns.filter(c=>c.title!=='วันที่'),{valid:r=>M.number(r[31])>0});
  }
  /* ป้ายตัวเลขบนเมนู "ไม่ถึงเป้า" ให้เห็นทันทีว่าต้องตามกี่คน โดยไม่ต้องเปิดหน้านั้นก่อน */
  function updateBelowTargetBadge(){
    const badge=$('navBelowTargetBadge'); if(!badge)return;
    try{
      const {list}=buildBelowTarget(visible());
      const below=list.filter(x=>x.below).length;
      badge.textContent=fmt(below);
      badge.hidden=!below;
      badge.title=`ไม่ถึงเป้า ${fmt(below)} คน จากทั้งหมด ${fmt(list.length)} คนที่นับ Productivity ได้ในช่วงที่เลือก`;
    }catch(e){badge.hidden=true;}
  }

  function render(){if(!source)return;try{updateBelowTargetBadge();if(active==='zone-map')zonePage();if(active==='records')recordsPage();if(active==='staff')staffPage();if(active==='hours')hoursPage();if(active==='quality')qualityPage();if(active==='below-target')belowTargetPage();}catch(e){console.error('V3 insights:',e);}}
  V3Data.subscribe(value=>{source=value.source;rows=source.sheets['Results Master'].rows.map((row,i)=>Object.assign([...row],{_row:i+2}));roster=new Map(source.sheets['2ND'].rows.filter(r=>r[1]).map(r=>[String(r[1]).trim(),r]));
    const shifts=[...new Set(rows.filter(r=>M.date(r[2])).map(r=>M.shiftKey(r)))].sort();$('v3Shift').innerHTML='<option value="ALL">ทุกกะ</option>'+shifts.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('v3Shift').value=V3Data.filters.shift;
    const warn=(source.warnings||[]);
    $('v3SourceStatus').innerHTML=esc(`${value.index.cacheStatus==='sheet-live'?'Google Sheets ล่าสุด':'ข้อมูลสำรองจาก Google Sheets'} • อ่านเมื่อ ${new Date(source.fetchedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})} • ${fmt(value.index.totalRows)} แถวมีวันที่`)
      +(warn.length?` • <span class="v3-loadwarn" title="${esc(warn.join(' · '))}">⚠️ อ่านบางชีตไม่ได้ สถานะออกแล้วอาจหาย</span>`:'');
    render();
  });
  document.addEventListener('v3-render',e=>{payload=e.detail;render();});
  // หน่วงเล็กน้อยให้ v2-shell.js ใส่คลาส active ก่อน ไม่งั้นกราฟถูกวาดตอน .tab-panel ยัง display:none
  // แล้วได้ canvas สูง 0 ซึ่ง Chart.js ไม่วัดใหม่ให้เอง (insights.js ผูก listener ก่อน v2-shell.js ตามลำดับ script)
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.tab;setTimeout(render,60);window.scrollTo({top:0,behavior:'instant'});}));
  async function applyFilter(){const system=$('v3System').value,shift=$('v3Shift').value;$('v3FilterStatus').textContent='กำลังรวมยอดจากข้อมูลในเครื่อง…';try{await V3Data.setFilters({system,shift});$('v3FilterStatus').textContent=system==='BPS'?'BPS เริ่มนับ 08/06/2026 ':'กรองแล้ว • ทุกหน้าใช้ข้อมูลชุดเดียวกัน';}catch(e){$('v3FilterStatus').textContent=e.message;}}
  // เปิด table(), cards() และตัวช่วยจัดรูปแบบให้ v2-staff.js ใช้ร่วมกัน ไม่ต้องเขียนตารางซ้ำ
  root_V3Shared();
  function root_V3Shared(){
    globalThis.V3Shared={table,cards,esc,fmt,csvExport,
      // เปิดกฎโซนและตัวกรองร่วมให้หน้าที่แยกไฟล์ใช้ ไม่ต้องคัดลอกกฎ V1 ไปเขียนซ้ำ
      zone,zones,zoneLabels:labels,visible,statCards,zoneTargetOf,
      get roster(){return roster;},
      get rows(){return rows;},
      get source(){return source;}};
  }

  if($('v3System'))$('v3System').onchange=applyFilter;
  if($('v3Shift'))$('v3Shift').onchange=applyFilter;
  if($('v3Print'))$('v3Print').onclick=()=>window.print();
})();
