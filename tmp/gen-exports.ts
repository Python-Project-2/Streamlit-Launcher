import * as fs from 'fs';
import * as path from 'path';
import { analyzeWorkbook } from '../src/analysis';
import { buildJournal } from '../src/Journal';
import { renderDocx } from '../src/docxGenerator';
import { renderPdf } from '../src/pdfgenerator';
import { renderPptx } from '../src/pptgenerator';
import { renderXlsx } from '../src/excelGenerator';

const SRC = process.argv[2] ?? 'database/SuperMarket Analysis.csv';
const OUT = process.argv[3] ?? 'output';
const NAME = path.basename(SRC);
const bytes = new Uint8Array(fs.readFileSync(SRC));

const wb = analyzeWorkbook(bytes, NAME, {
    maxDepth: 6, testSplit: 0.25, seed: 42, minSamplesLeaf: 2, minGainRatio: 0,
    maxBranches: 20, mergeRare: true, pruning: true, validationSplit: 0.2, cvFolds: 5, cvMaxRows: 2000,
});
const sheet = [...wb.sheets].sort((a, b) => b.totalRows - a.totalRows)[0];
const meta = { author: 'Admin', affiliation: 'Program Studi Sistem Informasi', email: 'admin@example.ac.id' };
const journal = buildJournal(sheet, NAME, meta);
if (process.env.FAKE_LINKS) {
    journal.refLinks = journal.references.map((_, i) => `https://doi.org/10.1000/uji.${i + 1}`);
}

fs.mkdirSync(OUT, { recursive: true });
const base = path.basename(NAME).replace(/\.[^.]+$/, '');
const only = (process.argv[4] ?? 'docx,pdf,pptx,xlsx').split(',');

(async () => {
    if (only.includes('docx')) { fs.writeFileSync(path.join(OUT, `${base}-jurnal.docx`), await renderDocx(journal)); }
    if (only.includes('pdf')) { fs.writeFileSync(path.join(OUT, `${base}-jurnal.pdf`), await renderPdf(journal)); }
    if (only.includes('pptx')) { fs.writeFileSync(path.join(OUT, `${base}-presentasi.pptx`), await renderPptx(sheet, NAME, { author: meta.author, affiliation: meta.affiliation })); }
    if (only.includes('xlsx')) { fs.writeFileSync(path.join(OUT, `${base}-analisis.xlsx`), await renderXlsx(sheet, NAME)); }
    console.log(JSON.stringify({ sheet: sheet.name, rows: sheet.totalRows, refs: journal.references.length, title: journal.title }, null, 2));
})();
