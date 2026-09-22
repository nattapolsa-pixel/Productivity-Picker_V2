// Regenerate the read-only preview data directly from the configured Google Sheet.
const fs = require('node:fs');
const path = require('node:path');
require('../js/source.js');
(async () => {
  const source = await V3Source.download();
  const output = path.join(__dirname,'../data/snapshot.json');
  fs.writeFileSync(output, JSON.stringify(source));
  console.log(JSON.stringify({fetchedAt:source.fetchedAt,rows:Object.fromEntries(Object.entries(source.sheets).map(([name,sheet])=>[name,sheet.rows.length])),bytes:fs.statSync(output).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
