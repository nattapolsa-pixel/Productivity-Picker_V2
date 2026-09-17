/* One source snapshot for every page; calculations run off the UI thread. */
window.V3Data = (() => {
  let current = null, pending = null, lastAttempt = 0, sequence = 0;
  let filters = {system:'ALL',shift:'ALL'}, filterRevision=0;
  const listeners = new Set();
  function process(source) {
    return new Promise((resolve,reject) => {
      const worker = new Worker('data-worker.js');
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
