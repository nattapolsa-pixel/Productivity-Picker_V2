importScripts('v1-engine.js?v=20260930-sort-person-1', 'source.js?v=20260930-sort-person-1', 'metrics.js?v=20260930-sort-person-1');
self.onmessage = async ({data}) => {
  try {
    const source = data.source || await V3Source.download();
    if (source.schema !== 'v3-sheet-v1') throw new Error('รูปแบบข้อมูล V3 ไม่ตรงกัน');
    const sheets = {...source.sheets, 'Results Master': {...source.sheets['Results Master'],rows:source.sheets['Results Master'].rows.filter(row=>V3Metrics.matches(row,data.filters))}};
    const index = V1Engine.buildIndex(sheets);
    index.generatedAt = source.fetchedAt;
    self.postMessage({id:data.id, source, index});
  } catch(error) { self.postMessage({id:data.id, error:error.message}); }
};
