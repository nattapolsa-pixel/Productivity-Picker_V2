/* One source snapshot for every page; calculations run off the UI thread. */
window.V3Data = (() => {
  let current = null, pending = null, lastAttempt = 0, sequence = 0, historyWritePromise = null;
  let filters = {system:'ALL',shift:'ALL'}, filterRevision=0;
  const listeners = new Set();
  function process(source) {
    return new Promise((resolve,reject) => {
      const worker = new Worker('js/data-worker.js?v=20260930-sort-history-2');
      const timer = setTimeout(() => {worker.terminate(); reject(new Error('Google Sheet ตอบกลับช้า กรุณาลองรีเฟรชอีกครั้ง'));}, 150000);
      const finish = () => {clearTimeout(timer); worker.terminate();};
      worker.onerror = e => {finish();reject(new Error(e.message));};
      worker.onmessage = ({data}) => {finish(); data.error ? reject(new Error(data.error)) : resolve(data);};
      worker.postMessage({id:++sequence, source,filters});
    });
  }
  async function processLatest(source) {
    let revision, value;
    do {revision=filterRevision;value=await process(source);source=value.source;} while(revision!==filterRevision);
    return value;
  }
  async function save(source) {try {await idbPut('v3-source',source);} catch(e) {console.warn('V3 cache:',e.message);} }
  function historyEntries(source){
    const sheets=source?.sheets||{},dash=globalThis.V3Metrics?.sortDashboardSummary?.(sheets),people=globalThis.V3Metrics?.sortPeopleSummary?.(sheets)||{},time=globalThis.V3Metrics?.sortTimeSummary?.(sheets)||{},out=[];
    Object.values(time).filter(g=>g?.date&&g.date>='2026-09-29').forEach(g=>{
      const p=people[g.date],isDashboard=dash?.date===g.date,productivity=isDashboard?Number(dash.productivity):Number(p?.average),peopleCount=isDashboard?Number(dash.people):Number(p?.people?.length||p?.people||p?.count||g.people);
      out.push({date:g.date,zone:'BE',totalPick:Number(g.total)||0,productivity:Number.isFinite(productivity)?productivity:0,people:peopleCount,source:isDashboard?'Dashboard + Time_Slot':'Time_Slot',rows:g.lines,timeJson:g.slots,sortLines:g.lines});
    });
    if(dash?.date&&dash.date>='2026-09-29'&&!out.some(x=>x.date===dash.date))out.push({date:dash.date,zone:'BE',totalPick:dash.total,productivity:dash.productivity,people:dash.people,source:'Dashboard'});
    return out;
  }
  async function rememberHistory(source){
    const entries=historyEntries(source);if(!entries.length||historyWritePromise)return;
    historyWritePromise=(async()=>{try{const config=await fetch('data/targets.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null),url=String(config?.write?.url||'');if(!url)return;const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({history:entries}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('HTTP '+response.status);const result=await response.json();if(!result?.ok)throw new Error(result?.error||'history write failed');}catch(e){console.warn('V3 history:',e.message);}})().finally(()=>{historyWritePromise=null;});
    await historyWritePromise;
  }
  function publish(value, label) {
    current = value;
    current.index.cacheStatus = label;
    listeners.forEach(fn => fn(current));
    return current.index;
  }
  async function refresh() {
    if (pending) return pending;
    lastAttempt = Date.now();
    document.getElementById('v3SourceStatus').textContent = 'กำลังตรวจข้อมูลล่าสุดจาก Google Sheets…';
    pending = processLatest().then(async value => {
      const revision=filterRevision;
      await save(value.source);
      if(revision!==filterRevision)value=await processLatest(value.source);
      publish(value,'sheet-live');
      void rememberHistory(value.source);
      if (typeof dailyIndexPayload !== 'undefined') {
        dailyIndexPayload = value.index;
        renderDashboardFromDailyIndex('Google Sheets ล่าสุด');
      }
      return value.index;
    }).catch(error => {
      document.getElementById('v3SourceStatus').textContent = 'อัปเดตไม่สำเร็จ • ใช้ข้อมูลสำรองเดิม • ' + error.message;
      if (!current) throw error;
      return current.index;
    }).finally(() => {pending = null;});
    return pending;
  }
  async function request(options = {}) {
    if (current) {
      if (options.force || Date.now()-lastAttempt > 300000) void refresh();
      return current.index;
    }
    if (pending) return pending;
    pending = (async () => {
      let source;
      try {source = await idbGet('v3-source');} catch(e) {console.warn(e.message);}
      if (!source) {
        try {
          const response = await fetch('data/snapshot.json');
          if (!response.ok) throw new Error('ยังไม่มี snapshot');
          source = await response.json();
        } catch(e) {console.warn(e.message);}
      }
      const value = await processLatest(source);
      publish(value, source ? 'sheet-snapshot' : 'sheet-live');
      return value.index;
    })().finally(() => {pending = null; if(current) setTimeout(() => void refresh(),1500);});
    return pending;
  }
  async function setFilters(next){
    filters={...next}; const revision=++filterRevision;
    if(!current)return;
    const source=current.source;
    let value=await process(source);
    if(revision!==filterRevision)return;
    if(source!==current.source)value=await process(current.source);
    if(revision!==filterRevision)return;
    publish(value,current.index.cacheStatus);
    dailyIndexPayload=value.index;
    renderDashboardFromDailyIndex('กรองระบบ / กะ ตาม Google Sheets');
  }
  return {request,refresh,setFilters,subscribe(fn){listeners.add(fn);if(current)fn(current);},get current(){return current;},get filters(){return filters;}};
})();
