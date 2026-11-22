/**
 * Uji halaman pratinjau (webview) tanpa membuka VS Code, memakai jsdom:
 *  - halaman analisis tergambar dari data nyata (analyzeWorkbook),
 *  - mode polos menghapus ikon emoji tanpa menyentuh isi data,
 *  - bilah navigasi (tab sheet + tombol pindah pratinjau) terpasang,
 *  - editor Excel: grid tampil, sel bisa diedit, Simpan mengirim sheet + baris,
 *  - draf auto-save ditawarkan, dan panel VBA memuat modul + auto-save.
 *
 * Jalankan: node scripts/check-preview-ui.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '.tmp-check');
fs.mkdirSync(outDir, { recursive: true });

const analysisBundle = path.join(outDir, 'analysis.cjs');
esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'analysis.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: analysisBundle,
    logLevel: 'warning',
});
const { analyzeWorkbook } = require(analysisBundle);

let gagal = 0;
const ok = (label, cond, extra) => {
    if (cond) {
        console.log('ok   ' + label + (extra ? ' — ' + extra : ''));
        return;
    }
    gagal++;
    console.error('GAGAL ' + label + (extra ? ' — ' + extra : ''));
};
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

const csv = [
    'Tanggal,Produk,Kategori,Jumlah,Harga',
    '2026-01-05,Apel,Buah,10,12000',
    '2026-01-06,Jeruk,Buah,7,8000',
    '2026-01-07,Susu,Minuman,3,21000',
    '2026-01-08,Roti,Makanan,5,15000',
].join('\n');

(async () => {
    const dom = new JSDOM('<!doctype html><html><body data-plain="1" data-ec-lang="id" data-video=""><div id="app"></div></body></html>', {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'https://example.test/',
    });
    const w = dom.window;

    w.matchMedia = () => ({ matches: false, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { } });
    class FakeChart {
        constructor(canvas, config) { this.canvas = canvas; this.config = config; }
        destroy() { }
        stop() { }
        update() { }
    }
    FakeChart.defaults = { color: '', borderColor: '', font: {}, animation: {} };
    w.Chart = FakeChart;
    w.HTMLCanvasElement.prototype.getContext = function () { return {}; };

    const posts = [];
    const api = { postMessage: (m) => posts.push(m), getState: () => ({}), setState: () => { } };
    w.acquireVsCodeApi = () => api;

    const errors = [];
    w.addEventListener('error', (e) => errors.push(e.message || String(e.error)));

    for (const file of ['editor.js', 'vba.js', 'nav.js', 'main.js', 'plain.js']) {
        w.eval(fs.readFileSync(path.join(root, 'media', file), 'utf8'));
    }

    const send = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));

    send({ type: 'data', payload: analyzeWorkbook(Buffer.from(csv, 'utf8'), 'contoh.csv') });
    await tick(200);

    const app = w.document.getElementById('app');
    ok('halaman pratinjau digambar', !!app.querySelector('.head h1'));
    ok('bagian analisis lengkap', app.querySelectorAll('section.sec').length > 8, app.querySelectorAll('section.sec').length + ' bagian');
    ok('bilah navigasi terpasang', !!w.document.getElementById('sk-bar'));
    ok('tab sheet tampil', w.document.querySelectorAll('.sk-tab').length === 1);
    ok('tombol pindah pratinjau ada', !!w.document.querySelector('.sk-bar-nav .sk-navbtn'));

    const navText = [...w.document.querySelectorAll('nav.nav a')].map((a) => a.textContent).join(' | ');
    ok('judul bagian polos tanpa emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(navText), navText.slice(0, 70));
    ok('ikon di header hilang', !/[\u{1F300}-\u{1FAFF}]/u.test(w.document.querySelector('.head').textContent));

    // ── editor Excel (grid) ─────────────────────────────────────────────
    send({
        type: 'csvEditData', editable: true, mode: 'grid', fileName: 'contoh.xlsx',
        grid: {
            kind: 'grid', sheet: 'Data', sheets: ['Data', 'Hitung'],
            rows: [['Kode', 'Nama', 'Harga'], ['A1', 'Apel', '12000'], ['B2', 'Jeruk', '8000']],
            totalRows: 3, totalCols: 3, note: 'uji',
        },
        draft: {
            payload: JSON.stringify({ kind: 'grid', sheet: 'Data', rows: [['Kode', 'Nama', 'Harga'], ['A1', 'Apel', '99999']] }),
            updatedAt: Date.now() - 60000,
        },
    });
    await tick(80);

    const card = w.document.querySelector('.ed-card');
    ok('editor grid tampil', !!card && !!card.querySelector('.ed-table'));
    ok('pemilih sheet muncul', !!card.querySelector('select.ed-sheet'));
    ok('draf auto-save ditawarkan', !!card.querySelector('.ed-draft'));

    const cell = card.querySelector('td[data-r="1"][data-c="1"]');
    ok('sel data dirender', !!cell && cell.textContent === 'Apel');
    cell.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    const input = card.querySelector('td[data-r="1"][data-c="1"] input');
    ok('sel bisa diedit', !!input, input ? input.value : 'tidak ada input');
    if (input) {
        input.value = 'Mangga';
        input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        card.querySelector('[data-ed="save"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        const saved = posts.filter((p) => p.type === 'csvSave').pop();
        ok('simpan mengirim grid + sheet', !!saved && saved.sheetName === 'Data' && Array.isArray(saved.rows));
        ok('nilai hasil edit ikut terkirim', !!saved && saved.rows[1][1] === 'Mangga');
    }

    // ── pindah sheet lewat tab ──────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A'], [1]]), 'Satu');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['B'], [2]]), 'Dua');
    send({ type: 'data', payload: analyzeWorkbook(new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })), 'dua.xlsx') });
    await tick(200);
    let tabs = w.document.querySelectorAll('.sk-tab');
    ok('dua tab sheet tampil', tabs.length === 2, tabs.length + ' tab');
    tabs[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await tick(150);
    tabs = w.document.querySelectorAll('.sk-tab');
    ok('pindah sheet lewat tab', tabs[1].classList.contains('active'), tabs[1].textContent);
    ok('halaman tetap utuh setelah pindah sheet', !!w.document.querySelector('.head h1'));

    // ── panel VBA ──────────────────────────────────────────────────────
    send({
        type: 'vbaInfo',
        info: {
            ok: true, supported: true, hasProject: true, ext: 'xlsm', file: 'contoh.xlsm',
            note: 'uji', projectModules: [{ name: 'ThisWorkbook', size: 1024 }],
            modules: [{ name: 'Module1', source: 'Sub Halo()\nEnd Sub', origin: 'sheet' }],
        },
    });
    await tick(80);
    ok('panel VBA terpasang', !!w.document.querySelector('.sk-vba'));
    ok('daftar modul VBA tampil', w.document.querySelectorAll('.sk-vba-item').length === 1);
    ok('proyek biner ditampilkan', w.document.querySelectorAll('.sk-vba-bin').length === 1);

    const code = w.document.querySelector('.sk-vba-code');
    code.value = 'Sub Halo()\n    MsgBox "Hai"\nEnd Sub';
    code.dispatchEvent(new w.Event('input', { bubbles: true }));
    await tick(1200);
    const vbaSave = posts.filter((p) => p.type === 'vbaSave').pop();
    ok('auto-save VBA mengirim modul', !!vbaSave && vbaSave.name === 'Module1' && vbaSave.source.includes('MsgBox'));

    ok('tidak ada error JS di webview', errors.length === 0, errors.join('; '));

    console.log(gagal ? `\n${gagal} UJI GAGAL` : '\nSEMUA UJI HALAMAN PRATINJAU LULUS');
    process.exit(gagal ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
