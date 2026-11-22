/**
 * Uji fitur baru tanpa membuka VS Code:
 *  - editor grid Excel (baca → ubah → tulis ke sheet yang sama),
 *  - penyimpanan VBA di sheet tersembunyi `_SK_VBA` (simpan, baca, hapus),
 *  - SQLite: riwayat pratinjau, draf auto-save, modul VBA, pengaturan, dan persistensi.
 *
 * Jalankan: node scripts/check-excel-vba.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '.tmp-check');
fs.mkdirSync(outDir, { recursive: true });

function loadModule(name) {
    const outfile = path.join(outDir, name + '.cjs');
    esbuild.buildSync({
        entryPoints: [path.join(root, 'src', name + '.ts')],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        outfile,
        logLevel: 'warning',
        external: ['vscode'],
    });
    return require(outfile);
}

const { readGrid, writeGrid } = loadModule('excelGrid');
const { readVba, writeVba, VBA_SHEET } = loadModule('vbaStudio');
const { SkunderDatabase } = loadModule('sqliteStore');
const { analyzeWorkbook } = loadModule('analysis');

let gagal = 0;
const ok = (label, cond, extra) => {
    if (cond) {
        console.log('ok   ' + label + (extra ? ' — ' + extra : ''));
        return;
    }
    gagal++;
    console.error('GAGAL ' + label + (extra ? ' — ' + extra : ''));
};

function makeWorkbook() {
    const wb = XLSX.utils.book_new();
    const data = XLSX.utils.aoa_to_sheet([
        ['Kode', 'Nama', 'Harga', 'Tanggal'],
        ['A1', 'Apel', 12000, new Date(2026, 0, 5)],
        ['B2', 'Jeruk', 8000, new Date(2026, 0, 6)],
    ]);
    data['!ref'] = 'A1:D3';
    XLSX.utils.book_append_sheet(wb, data, 'Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Total'], [{ t: 'n', f: 'SUM(Data!C2:C3)' }]]), 'Hitung');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

(async () => {
    // ── 1. editor grid Excel ─────────────────────────────────────────────
    const original = makeWorkbook();
    const grid = readGrid(new Uint8Array(original), 'contoh.xlsx');
    ok('grid Excel dibaca', grid.sheet === 'Data' && grid.rows.length === 3 && grid.rows[1][1] === 'Apel', `${grid.rows.length}×${grid.rows[0].length}`);
    ok('daftar sheet', grid.sheets.join(',') === 'Data,Hitung');

    const rows = grid.rows.map((r) => r.slice());
    rows[1][2] = '15500';
    rows.push(['C3', 'Mangga', '9000', '']);
    const written = writeGrid(new Uint8Array(original), 'contoh.xlsx', 'Data', rows);
    ok('hanya sel berubah yang ditulis', written.changed >= 2, `${written.changed} sel`);

    const back = XLSX.read(written.data, { type: 'array', cellDates: true, cellStyles: true });
    ok('angka baru bertipe angka', back.Sheets['Data'].C2.v === 15500 && back.Sheets['Data'].C2.t === 'n');
    ok('baris baru tersimpan', back.Sheets['Data'].B4 && back.Sheets['Data'].B4.v === 'Mangga');
    ok('sheet lain utuh', back.SheetNames.join(',') === 'Data,Hitung');
    ok('rumus sheet lain utuh', !!back.Sheets['Hitung'].A2.f, back.Sheets['Hitung'].A2.f);
    ok('tanggal tidak berubah jadi teks', back.Sheets['Data'].D2.t === 'd' || back.Sheets['Data'].D2.v instanceof Date);

    // ── 2. VBA di berkas asli ───────────────────────────────────────────
    const withVba = writeVba(new Uint8Array(original), 'contoh.xlsx', [
        { name: 'Module1', source: 'Sub Halo()\n    MsgBox "Hai"\nEnd Sub' },
        { name: 'Cek_Data', source: 'Sub Cek()\nEnd Sub' },
    ]);
    const info = await readVba(new Uint8Array(withVba), 'contoh.xlsx');
    ok('modul VBA terbaca dari berkas', info.modules.length === 2 && info.modules.some((m) => m.name === 'Module1'));
    const hidden = XLSX.read(withVba, { type: 'array' }).Workbook.Sheets.find((s) => s.name === VBA_SHEET);
    ok('sheet VBA tersembunyi', !!hidden && hidden.Hidden === 1);
    ok('sheet VBA tidak ikut analisis', !analyzeWorkbook(new Uint8Array(withVba), 'contoh.xlsx').sheets.some((s) => s.name === VBA_SHEET));
    ok('sheet VBA tidak muncul di editor', !readGrid(new Uint8Array(withVba), 'contoh.xlsx').sheets.includes(VBA_SHEET));

    const cleared = writeVba(new Uint8Array(withVba), 'contoh.xlsx', []);
    ok('hapus semua modul menghapus sheet', !XLSX.read(cleared, { type: 'array' }).SheetNames.includes(VBA_SHEET));
    ok('berkas asli tetap punya data', XLSX.read(cleared, { type: 'array' }).SheetNames.join(',') === 'Data,Hitung');

    // ── 3. SQLite ───────────────────────────────────────────────────────
    const dir = path.join(outDir, 'db');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const dbFile = path.join(dir, 'skunder.sqlite');
    const db = new SkunderDatabase(dbFile);
    await db.ready();

    const p1 = await db.touchPreview({ path: 'C:\\data\\satu.csv', name: 'satu.csv', ext: '.csv', size: 10, mtime: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const p2 = await db.touchPreview({ path: 'C:\\data\\dua.xlsx', name: 'dua.xlsx', ext: '.xlsx', size: 20, mtime: 2 });
    const recent = await db.recent(10);
    ok('riwayat pratinjau tersimpan', recent.length === 2 && recent[0].id === p2.id, recent.map((r) => r.name).join(' > '));
    const next = await db.neighbour('C:\\data\\dua.xlsx', 1);
    ok('pindah pratinjau melingkar', next && next.id === p1.id);
    const prev = await db.neighbour('C:\\data\\dua.xlsx', -1);
    ok('pindah pratinjau ke belakang', prev && prev.id === p1.id);

    await db.saveDraft({ previewId: p2.id, sheet: 'Data', kind: 'grid', payload: '{"rows":[["a","b"]]}' });
    ok('draf auto-save tersimpan', !!(await db.getDraft(p2.id, 'Data')));
    await db.saveVba(p2.id, 'Module1', 'Sub X()\nEnd Sub');
    ok('modul VBA tersimpan di SQLite', (await db.listVba(p2.id)).length === 1);
    await db.deleteVba(p2.id, 'Module1');
    ok('modul VBA bisa dihapus', (await db.listVba(p2.id)).length === 0);
    await db.setSetting('theme', { id: 'gelap' });
    ok('pengaturan tersimpan', (await db.getSetting('theme', null)).id === 'gelap');
    await db.setPreviewSheet('C:\\data\\dua.xlsx', 'Hitung');
    await db.flushNow();
    db.dispose();

    ok('berkas SQLite asli', fs.readFileSync(dbFile).slice(0, 15).toString('utf8') === 'SQLite format 3');

    const db2 = new SkunderDatabase(dbFile);
    await db2.ready();
    const recent2 = await db2.recent(10);
    ok('riwayat bertahan setelah dibuka ulang', recent2.length === 2 && recent2[0].sheet === 'Hitung');
    ok('draf bertahan setelah dibuka ulang', !!(await db2.getDraft(p2.id, 'Data')));
    ok('pengaturan bertahan setelah dibuka ulang', (await db2.getSetting('theme', null)).id === 'gelap');
    await db2.flushNow();
    db2.dispose();

    console.log(gagal ? `\n${gagal} UJI GAGAL` : '\nSEMUA UJI EXCEL & VBA LULUS');
    process.exit(gagal ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
