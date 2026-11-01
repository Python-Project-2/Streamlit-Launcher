/**
 * Pemeriksaan EasyCast + bahasa antarmuka (tanpa VS Code).
 *
 *   npm run check:easycast
 *
 * Yang diperiksa:
 *  1. PDF dasbor EasyCast (16:9, satu slide per bagian) benar-benar terbentuk.
 *  2. Berkas .html mandiri memuat data, konfigurasi bahasa, dan tidak bisa memutus tag <script>.
 *  3. `exportReport('html' | 'easycastPdf')` menulis berkas (perintah yang dulu “not found”).
 *  4. `printEasyCast` membuka browser dengan akhiran #print.
 *  5. Halaman analisis (media/main.js asli) menjadi Mandarin, isi data tetap apa adanya, dan
 *     kembali ke bahasa sumber saat pengguna memilih Bahasa Indonesia.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const vscode = require('./vscode-stub.cjs');

let pass = 0;
let fail = 0;
const ok = (cond, label, extra) => {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
};

/** Bundel src/ dengan stub `vscode` supaya bisa di-require di Node. */
async function loadLib() {
    // Ditulis di dalam proyek supaya `require('pdf-lib')`/`jsdom` tetap bisa ditemukan.
    const outDir = path.join(root, '.tmp-check');
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `check-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { analyzeWorkbook } from './src/analysis';",
                "export { buildEasyCastHtml } from './src/Easycasthtml';",
                "export { renderEasyCastPdf } from './src/easycastPdf';",
                "export { i18nConfig, I18N_CLIENT } from './src/i18n';",
                "export { exportReport, printEasyCast } from './src/exporter';",
                "export { EASYCAST_CLIENT } from './src/Easycastclient';",
            ].join('\n'),
            resolveDir: root,
            loader: 'ts',
        },
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile,
        external: ['jsdom', 'pdf-lib'],
        logLevel: 'warning',
        plugins: [{
            name: 'vscode-stub',
            setup(build) {
                build.onResolve({ filter: /^vscode$/ }, () => ({ path: path.join(__dirname, 'vscode-stub.cjs') }));
            },
        }],
    });
    const lib = require(outfile);
    fs.rmSync(outfile, { force: true });
    try { fs.rmdirSync(outDir); } catch (e) { /* folder dipakai proses lain */ }
    return lib;
}

function sampleWorkbook(lib) {
    const head = ['Date', 'Item', 'Category', 'Region', 'Customer', 'Order', 'Qty', 'Price', 'Cost', 'Revenue'];
    const items = ['Kopi Arabika', 'Teh Hijau', 'Gula Aren', 'Susu UHT', 'Cokelat Bubuk'];
    const cats = ['Minuman', 'Bahan', 'Kemasan'];
    const regions = ['Jakarta', 'Bandung', 'Surabaya'];
    const rows = [head.join(',')];
    for (let i = 0; i < 90; i += 1) {
        const qty = 5 + ((i * 7) % 40);
        const price = 12000 + ((i * 311) % 9000);
        const revenue = qty * price;
        rows.push([
            `2024-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
            items[i % items.length], cats[i % cats.length], regions[i % regions.length],
            `Cust-${1 + (i % 17)}`, `INV-${1000 + i}`, qty, price, Math.round(revenue * 0.62), revenue,
        ].join(','));
    }
    const csvPath = path.join(os.tmpdir(), `date-skunder-check-${process.pid}.csv`);
    fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');
    return { csvPath, wb: lib.analyzeWorkbook(fs.readFileSync(csvPath), 'sales.csv', {}) };
}

(async () => {
    const lib = await loadLib();
    const { csvPath, wb } = sampleWorkbook(lib);
    ok(wb.sheets.length === 1 && wb.sheets[0].totalRows === 90, 'analisis CSV contoh');
    ok(!!wb.sheets[0].stockAnalysis?.detected, 'analisis stok terdeteksi');

    console.log('\n[PDF]');
    const { PDFDocument } = require('pdf-lib');
    const pdf = await lib.renderEasyCastPdf(wb, { footer: 'sales.csv - Date Skunder' });
    ok(pdf.length > 8000, 'PDF dasbor dibuat', `${pdf.length} byte`);
    const doc = await PDFDocument.load(pdf);
    ok(doc.getPageCount() >= 6, 'satu slide per bagian', `${doc.getPageCount()} halaman`);
    const size = doc.getPage(0).getSize();
    ok(Math.round(size.width) === 960 && Math.round(size.height) === 540, 'lanskap 16:9', `${size.width}x${size.height}`);

    console.log('\n[HTML & ekspor]');
    const html = lib.buildEasyCastHtml(wb, { lang: 'zh-cn', seconds: 9 });
    ok(html.includes('data-ec-lang="zh-cn"'), 'atribut bahasa disematkan');
    ok(html.includes('window.__SK_I18N__=') && html.includes('window.__EC_DATA__='), 'data + kamus tertanam');
    const start = html.indexOf('__EC_DATA__=');
    ok(!/<\/script/i.test(html.slice(start, html.indexOf('</script>', start))), 'JSON tidak memutus tag script');
    const evil = lib.buildEasyCastHtml({ fileName: '</script><script>x</script>', sheets: wb.sheets }, { lang: 'zh-cn' });
    const evilStart = evil.indexOf('__EC_DATA__=');
    ok(evil.slice(evilStart, evil.indexOf('</script>', evilStart)).includes('\\u003c'), 'nama berkas di-escape');

    const src = vscode.Uri.file(csvPath);
    const htmlOut = await lib.exportReport('html', src);
    ok(!!htmlOut && fs.existsSync(htmlOut.fsPath), 'exportHtml menulis berkas');
    ok(/-easycast\.html$/.test(htmlOut?.fsPath || ''), 'nama berkas -easycast.html');
    const pdfOut = await lib.exportReport('easycastPdf', src);
    ok(!!pdfOut && fs.existsSync(pdfOut.fsPath), 'exportPdf menulis berkas');
    ok(/-easycast\.pdf$/.test(pdfOut?.fsPath || ''), 'nama berkas -easycast.pdf');
    const printOut = await lib.printEasyCast(src);
    ok(!!printOut && fs.existsSync(printOut.fsPath), 'printEasyCast menulis berkas sementara');
    const openedUrls = global.__SK_OPENED__ || [];
    ok(openedUrls.some((u) => u.endsWith('#print')), 'printEasyCast membuka browser dengan #print', openedUrls.join(','));

    console.log('\n[Bahasa antarmuka]');
    const mainJs = fs.readFileSync(path.join(root, 'media', 'main.js'), 'utf8');
    const dom = new JSDOM(`<!DOCTYPE html><html><body data-ec-lang="zh-cn"><div id="app"></div>
<script>window.__SK_I18N__=${lib.i18nConfig('zh-cn')};</script>
<script>${lib.I18N_CLIENT}</script>
<script>
window.acquireVsCodeApi = function () { return { postMessage: function (m) { (window.__posted = window.__posted || []).push(m); }, getState: function () { return {}; }, setState: function () {} }; };
window.matchMedia = function () { return { matches: false, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };
window.Chart = function () { return { destroy: function () {} }; };
window.Chart.defaults = { color: '', borderColor: '', font: { family: '' }, animation: '' };
</script></body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true });

    const w = dom.window;
    const run = (src) => { const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s); };
    run(mainJs);
    run(lib.EASYCAST_CLIENT);
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'data', payload: wb } }));
    await new Promise((r) => setTimeout(r, 600));

    const texts = (sel) => [...w.document.querySelectorAll(sel)].map((e) => (e.textContent || '').trim());
    ok(texts('nav.nav a').some((t) => t === '摘要'), 'nav “Summary” → 摘要', texts('nav.nav a').join(' | '));
    ok(texts('.head-actions button').some((t) => t.includes('导出论文（PDF）')), 'tombol jurnal → 导出论文（PDF）');
    const langBtn = w.document.getElementById('btn-language');
    ok(!!langBtn, 'tombol 🌐 bahasa ada di toolbar halaman analisis');
    ok(!!langBtn && /中文/.test(langBtn.textContent), 'tombol menampilkan bahasa aktif (中文)', langBtn && langBtn.textContent);
    if (langBtn) {
        langBtn.dispatchEvent(new w.Event('click'));
        await new Promise((r) => setTimeout(r, 40));
        ok((w.__posted || []).some((m) => m.type === 'languagePick'), 'klik 🌐 meminta pemilih bahasa', JSON.stringify(w.__posted || []));
    }
    ok(texts('section h2').some((t) => t.includes('库存分析与管理')), 'judul bagian stok → 库存分析与管理');
    ok(texts('table.data:not(.stock-table) th').includes('Date'), 'header data “Date” tidak diterjemahkan');
    ok(texts('table.data:not(.stock-table) tbody tr:first-child td').includes('Kopi Arabika'), 'nilai sel data tetap');
    ok(!!w.document.getElementById('ec-btn'), 'tombol EasyCast tetap disisipkan');

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'easycastOpen' } }));
    await new Promise((r) => setTimeout(r, 300));
    const ov = w.document.getElementById('ec-ov');
    ok(!!ov && (ov.textContent || '').includes('暂停'), 'lapisan EasyCast → 暂停');
    ok(!!ov && ov.querySelector('[data-a="print"]')?.getAttribute('title') === '打印 / 保存 PDF', 'tooltip cetak → 打印 / 保存 PDF');

    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'sk-locale', config: JSON.parse(lib.i18nConfig('id')) } }));
    await new Promise((r) => setTimeout(r, 400));
    ok(texts('nav.nav a').some((t) => t === 'Summary'), 'kembali ke bahasa sumber tanpa reload');
    ok(!/else if \(a === 'print'\) \{ window\.print\(\); \}/.test(lib.EASYCAST_CLIENT), 'window.print() tanpa syarat sudah dihapus');
    ok(lib.EASYCAST_CLIENT.includes('easycastPrintPdf'), 'klien mengirim easycastPrintPdf ke host');

    w.close();
    fs.rmSync(csvPath, { force: true });
    fs.rmSync(path.join(path.dirname(csvPath), 'sales-easycast.html'), { force: true });
    fs.rmSync(path.join(path.dirname(csvPath), 'sales-easycast.pdf'), { force: true });

    console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('Pemeriksaan gagal:', e);
    process.exit(1);
});
