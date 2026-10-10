// Helper pembaca JSON untuk script uji: node /tmp/jq.js <file> "<ekspresi d...>"
const fs = require('fs');
const [, , file, expr] = process.argv;
let d;
try {
  d = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`BAD_JSON: ${e.message}`);
  process.exit(2);
}
try {
  const v = eval('d' + expr); // ekspresi terkontrol, hanya untuk uji
  if (v === undefined) console.log('');
  else if (typeof v === 'object' && v !== null) console.log(JSON.stringify(v));
  else console.log(String(v));
} catch (e) {
  console.error(`BAD_EXPR ${expr}: ${e.message}`);
  process.exit(3);
}
