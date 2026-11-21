// Scratch helper: apply exact text replacements while preserving CRLF/LF line endings.
const fs = require('fs');

const [, , jobFile] = process.argv;
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
const norm = (s) => s.replace(/\r\n/g, '\n');

for (const entry of job) {
    const raw = fs.readFileSync(entry.file, 'utf8');
    const crlf = raw.includes('\r\n');
    let text = norm(raw);
    for (const e of entry.edits) {
        const oldText = norm(e.old);
        const newText = norm(e.new);
        const parts = text.split(oldText);
        if (parts.length !== 2) {
            console.error(`FAIL ${entry.file}: span found ${parts.length - 1} times -> ${JSON.stringify(oldText.slice(0, 70))}`);
            process.exitCode = 1;
            text = null;
            break;
        }
        text = parts[0] + newText + parts[1];
    }
    if (text === null) { continue; }
    fs.writeFileSync(entry.file, crlf ? text.replace(/\n/g, '\r\n') : text, 'utf8');
    console.log(`OK ${entry.file} (${entry.edits.length} edit)`);
}
