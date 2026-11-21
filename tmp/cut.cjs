// Scratch helper: delete lines from startMarker up to (not including) endMarker.
const fs = require('fs');

const [, , file, startMarker, endMarker] = process.argv;
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.replace(/\r\n/g, '\n').split('\n');
const start = lines.findIndex((l) => l.includes(startMarker));
const end = lines.findIndex((l, i) => i > start && l.includes(endMarker));
if (start < 0 || end < 0) { console.error('marker not found', start, end); process.exit(1); }
const out = [...lines.slice(0, start), ...lines.slice(end)];
fs.writeFileSync(file, crlf ? out.join('\r\n') : out.join('\n'), 'utf8');
console.log(`deleted lines ${start + 1}-${end} (${end - start} lines)`);
