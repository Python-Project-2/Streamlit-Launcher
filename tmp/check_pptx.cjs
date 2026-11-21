const fs = require('fs');
const { execSync } = require('child_process');

const file = process.argv[2];
const out = execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${file.replace(/'/g, "''")}'); $z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()"`, { encoding: 'utf8' });
const slides = out.split(/\r?\n/).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
console.log('slides', slides.length);
const JSZip = require('jszip');
JSZip.loadAsync(fs.readFileSync(file)).then(async (zip) => {
    let found = 0;
    for (const s of slides) {
        const xml = await zip.file(s).async('string');
        if (xml.includes('Poin Utama')) { found++; }
    }
    console.log('slides with "Poin Utama"', found);
    const notes = out.split(/\r?\n/).filter((n) => /notesSlide\d+\.xml$/.test(n));
    console.log('notes slides', notes.length);
});
