// Scratch helper: replace an inclusive line range between markers with a new block.
const fs = require('fs');

const [, , file, startMarker, endMarker, blockFile] = process.argv;
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.replace(/\r\n/g, '\n').split('\n');
const start = lines.findIndex((l) => l.includes(startMarker));
if (start < 0) { console.error('start marker not found'); process.exit(1); }
let end = -1;
for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === endMarker) { end = i; break; }
}
if (end < 0) { console.error('end marker not found'); process.exit(1); }
const block = fs.readFileSync(blockFile, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
const out = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end + 1)];
fs.writeFileSync(file, (crlf ? out.join('\r\n') : out.join('\n')), 'utf8');
console.log(`replaced lines ${start + 1}-${end + 1} with ${block.split('\n').length} lines`);
