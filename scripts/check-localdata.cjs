/**
 * Uji LocalData tanpa membuka VS Code:
 *  - berkas benar-benar disimpan ke SQLite di `<folder>/sql/localdata.sqlite`,
 *  - daftar, baca ulang isi (byte-per-byte), statistik kuota, dan hapus,
 *  - setelah dihapus, berkas bisa diunggah lagi (id baru) dan ruang kuota kembali,
 *  - pratinjau: teks, gambar, PDF, Word (.docx), Excel, PowerPoint, arsip, dan jenis lain,
 *  - cache pratinjau dibersihkan untuk berkas yang sudah tidak ada di SQLite.
 *
 * Jalankan: node scripts/check-localdata.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '.tmp-check');
fs.mkdirSync(outDir, { recursive: true });

function bundle(entry, name) {
    const outfile = path.join(outDir, name);
    esbuild.buildSync({
        entryPoints: [path.join(root, 'src', entry)],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        outfile,
        logLevel: 'warning',
    });
    return require(outfile);
}

const store = bundle('localDataStore.ts', 'localdata-store.cjs');
const preview = bundle('localDataPreview.ts', 'localdata-preview.cjs');

let gagal = 0;
const ok = (label, cond, extra) => {
    if (cond) {
        console.log('ok   ' + label + (extra ? ' — ' + extra : ''));
        return;
    }
    gagal++;
    console.error('GAGAL ' + label + (extra ? ' — ' + extra : ''));
};

const bytesOf = (text) => new Uint8Array(Buffer.from(text, 'utf8'));
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

(async () => {
    const tmp = path.join(os.tmpdir(), 'localdata-check-' + crypto.randomBytes(4).toString('hex'));
    const dbFile = path.join(tmp, 'sql', 'localdata.sqlite');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });

    const db = new store.LocalDataStore(dbFile);
    await db.ready();

    ok('basis data dibuat di folder sql/ saat siap', fs.existsSync(dbFile), dbFile);
    ok('berkas bernama localdata.sqlite', path.basename(dbFile) === 'localdata.sqlite');

    let stats = await db.stats();
    ok('mulai kosong', stats.count === 0 && stats.bytes === 0);
    ok('stats.file menunjuk berkas SQLite', stats.file === dbFile);

    // ── unggah teks ──────────────────────────────────────────────────────
    const teks = 'Halo LocalData!\nBaris kedua — ünïcode ✓\n';
    const metaTeks = await db.add({ name: 'catatan.txt', data: bytesOf(teks), sourcePath: 'C:\\contoh\\catatan.txt' });
    ok('berkas teks tersimpan', !!metaTeks.id && metaTeks.kind === 'text', metaTeks.kind);
    ok('mime teks', metaTeks.mime === 'text/plain', metaTeks.mime);
    ok('ukuran metadata = isi', metaTeks.size === Buffer.byteLength(teks), String(metaTeks.size));

    const fullTeks = await db.get(metaTeks.id);
    ok('isi teks utuh', !!fullTeks && Buffer.from(fullTeks.data).toString('utf8') === teks);

    // ── unggah biner 2 MB (byte acak) ────────────────────────────────────
    const biner = new Uint8Array(crypto.randomBytes(2 * 1024 * 1024));
    const metaPng = await db.add({ name: 'foto.png', data: biner });
    ok('gambar terdeteksi sebagai image/png', metaPng.kind === 'image' && metaPng.mime === 'image/png');

    const fullPng = await db.get(metaPng.id);
    ok('isi biner 2 MB utuh setelah dibaca ulang', !!fullPng && same(fullPng.data, biner), fullPng ? fullPng.data.length + ' byte' : 'kosong');

    let list = await db.list();
    ok('daftar berisi 2 berkas', list.length === 2, String(list.length));
    ok('diurutkan dari yang terbaru', list[0].id === metaPng.id);

    stats = await db.stats();
    const totalHarap = metaTeks.size + metaPng.size;
    ok('statistik kuota menjumlah ukuran', stats.count === 2 && stats.bytes === totalHarap, stats.bytes + ' byte');
    await db.flushNow();
    ok('ukuran berkas .sqlite di disk wajar', fs.statSync(dbFile).size > biner.length, String(fs.statSync(dbFile).size));

    await db.touch(metaTeks.id);
    const setelahTouch = await db.getMeta(metaTeks.id);
    ok('touch memperbarui opened_at', !!setelahTouch && setelahTouch.openedAt >= metaTeks.openedAt);

    // ── hapus dari SQLite ────────────────────────────────────────────────
    const dihapus = await db.remove(metaPng.id);
    ok('hapus mengembalikan metadata', !!dihapus && dihapus.name === 'foto.png');
    ok('baris hilang dari SQLite', (await db.get(metaPng.id)) === undefined);
    ok('hapus id yang sama dua kali aman', (await db.remove(metaPng.id)) === undefined);

    stats = await db.stats();
    ok('kuota kembali setelah hapus', stats.count === 1 && stats.bytes === metaTeks.size, stats.bytes + ' byte');

    await db.flushNow();
    ok('berkas .sqlite menyusut setelah hapus', fs.statSync(dbFile).size < biner.length, String(fs.statSync(dbFile).size) + ' byte');
    const sisaList = await db.list();
    ok('daftar setelah hapus', sisaList.length === 1 && sisaList[0].id === metaTeks.id);

    // ── unggah ulang setelah dihapus ─────────────────────────────────────
    const metaUlang = await db.add({ name: 'foto.png', data: biner.slice(0, 4096) });
    ok('berkas bisa diunggah kembali setelah dihapus', metaUlang.id !== metaPng.id && metaUlang.size === 4096);
    ok('nama sama tetap boleh (id baru)', metaUlang.name === 'foto.png');

    // ── pratinjau ────────────────────────────────────────────────────────
    const cacheDir = path.join(tmp, 'cache');
    const toUri = (file) => 'file:///' + file.replace(/\\/g, '/');

    const recTeks = await db.get(metaTeks.id);
    const pTeks = await preview.buildPreview(recTeks, cacheDir, toUri);
    ok('pratinjau teks berisi isi berkas', pTeks.text === teks && pTeks.kind === 'text');

    const recPng = await db.get(metaUlang.id);
    const pPng = await preview.buildPreview(recPng, cacheDir, toUri);
    const cachePng = preview.cachePathFor(recPng, cacheDir);
    ok('pratinjau gambar memakai cache webview', !!pPng.uri && fs.existsSync(cachePng), pPng.uri);
    ok('isi cache gambar sama dengan SQLite', fs.readFileSync(cachePng).equals(Buffer.from(biner.slice(0, 4096))));

    const pdfAsli = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'utf8');
    const metaPdf = await db.add({ name: 'dokumen.pdf', data: new Uint8Array(pdfAsli) });
    const pPdf = await preview.buildPreview(await db.get(metaPdf.id), cacheDir, toUri);
    const dariB64 = Buffer.from(pPdf.dataB64 || '', 'base64');
    ok('pratinjau PDF menyiapkan data base64', pPdf.kind === 'pdf' && dariB64.equals(pdfAsli));

    // Word (.docx) dibuat dengan pustaka docx, lalu dibaca kembali sebagai HTML.
    const docx = require('docx');
    const docBuffer = await docx.Packer.toBuffer(new docx.Document({
        sections: [{
            children: [
                new docx.Paragraph({ text: 'Judul Laporan', heading: docx.HeadingLevel.HEADING_1 }),
                new docx.Paragraph('Isi paragraf pertama untuk pratinjau Word.'),
            ],
        }],
    }));
    const metaDocx = await db.add({ name: 'laporan.docx', data: new Uint8Array(docBuffer) });
    const pDocx = await preview.buildPreview(await db.get(metaDocx.id), cacheDir, toUri);
    ok('pratinjau Word menghasilkan HTML', pDocx.kind === 'docx' && /Judul Laporan/.test(pDocx.html || '') && /paragraf pertama/.test(pDocx.html || ''));
    ok('HTML Word memakai tag judul', /<h[1-6]>Judul Laporan<\/h[1-6]>/.test(pDocx.html || ''));

    // Excel (.xlsx)
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tanggal', 'Produk', 'Jumlah'], ['2026-01-05', 'Apel', 10]]), 'Penjualan');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const metaXlsx = await db.add({ name: 'penjualan.xlsx', data: new Uint8Array(xlsxBuffer) });
    const pXlsx = await preview.buildPreview(await db.get(metaXlsx.id), cacheDir, toUri);
    ok('pratinjau Excel menghasilkan tabel', pXlsx.kind === 'sheet' && /<table>/.test(pXlsx.html || '') && /Penjualan/.test(pXlsx.html || ''));
    ok('sel Excel ikut tampil', /Apel/.test(pXlsx.html || '') && /Tanggal/.test(pXlsx.html || ''));

    // PowerPoint (.pptx)
    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    slide.addText('Ringkasan Kuartal', { x: 1, y: 1, w: 6, h: 1 });
    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
    const metaPptx = await db.add({ name: 'ringkasan.pptx', data: new Uint8Array(pptxBuffer) });
    const pPptx = await preview.buildPreview(await db.get(metaPptx.id), cacheDir, toUri);
    ok('pratinjau PowerPoint membaca teks slide', pPptx.kind === 'pptx' && /Slide 1/.test(pPptx.text || '') && /Ringkasan Kuartal/.test(pPptx.text || ''));

    // Arsip dan jenis tak dikenal hanya menampilkan catatan.
    const metaZip = await db.add({ name: 'paket.zip', data: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) });
    const pZip = await preview.buildPreview(await db.get(metaZip.id), cacheDir, toUri);
    ok('arsip memberi catatan, bukan pratinjau', pZip.kind === 'archive' && !!pZip.note);

    const metaBin = await db.add({ name: 'data.bin', data: new Uint8Array(crypto.randomBytes(64)) });
    const pBin = await preview.buildPreview(await db.get(metaBin.id), cacheDir, toUri);
    ok('jenis lain tetap punya catatan', pBin.kind === 'other' && !!pBin.note);

    // ── pembersihan cache ────────────────────────────────────────────────
    const yatim = path.join(cacheDir, 'berkas-lama.png');
    fs.writeFileSync(yatim, 'x');
    const ids = new Set((await db.list()).map((f) => f.id));
    const dibersihkan = await preview.pruneCache(cacheDir, ids);
    ok('cache yatim dibersihkan', dibersihkan >= 1 && !fs.existsSync(yatim), String(dibersihkan));
    ok('cache berkas aktif dipertahankan', fs.existsSync(cachePng));

    // ── pemetaan jenis & ukuran ──────────────────────────────────────────
    ok('detectKind: video', store.detectKind('klip.MP4') === 'video');
    ok('detectKind: docx', store.detectKind('surat.docx') === 'docx');
    ok('detectKind: pdf', store.detectKind('a.pdf') === 'pdf');
    ok('formatBytes KB', store.formatBytes(1536) === '1.5 KB');
    ok('formatBytes MB', store.formatBytes(5 * 1024 * 1024) === '5.00 MB');

    // Batas ukuran: per berkas dan total kuota.
    ok('berkas dalam batas diterima', store.uploadRejection(1024, 0, 2048, 4096) === undefined);
    ok('berkas melebihi batas per berkas ditolak', store.uploadRejection(2049, 0, 2048, 4096) === 'too-big');
    ok('berkas melebihi sisa kuota ditolak', store.uploadRejection(1024, 3500, 2048, 4096) === 'full');
    ok('tepat di batas total masih diterima', store.uploadRejection(596, 3500, 2048, 4096) === undefined);
    ok('tepat di batas per berkas masih diterima', store.uploadRejection(2048, 0, 2048, 4096) === undefined);
    ok('ukuran negatif/kosong aman', store.uploadRejection(-1, 0, 2048, 4096) === undefined);

    // ── dashboard webview (jsdom) ────────────────────────────────────────
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body data-logo="" data-pdf=""><div id="ld-app"></div></body></html>', {
        runScripts: 'outside-only',
        url: 'https://localdata.test/',
    });
    const w = dom.window;
    const sent = [];
    w.acquireVsCodeApi = () => ({ postMessage: (m) => sent.push(m) });
    w.eval(fs.readFileSync(path.join(root, 'media', 'localdata.js'), 'utf8'));

    const doc = w.document;
    ok('dashboard menggambar judul LocalData', !!doc.querySelector('h1') && /LocalData/.test(doc.querySelector('h1').textContent));
    ok('dashboard meminta daftar saat siap', sent.some((m) => m.type === 'ready'));

    const tombolUnggah = doc.querySelector('#ld-upload');
    ok('tombol Unggah tersedia', !!tombolUnggah);
    tombolUnggah.click();
    ok('tombol Unggah mengirim pesan upload', sent.some((m) => m.type === 'upload'));

    const berkasContoh = [
        { id: 'a1', name: 'catatan.txt', ext: 'txt', mime: 'text/plain', kind: 'text', size: 46, sourcePath: 'C:\\docs\\catatan.txt', note: '', createdAt: Date.now(), openedAt: Date.now() },
        { id: 'b2', name: 'foto.png', ext: 'png', mime: 'image/png', kind: 'image', size: 4096, sourcePath: '', note: '', createdAt: Date.now() - 1000, openedAt: Date.now() },
    ];
    const kirim = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));
    kirim({ type: 'localFiles', files: berkasContoh, stats: { count: 2, bytes: 4142, file: 'C:\\proyek\\sql\\localdata.sqlite' }, limits: { maxFileMB: 32, maxTotalMB: 256 } });

    ok('dua berkas tampil di tabel', doc.querySelectorAll('tr[data-id]').length === 2, String(doc.querySelectorAll('tr[data-id]').length));
    ok('kuota menampilkan batas KB per berkas', /32\.768 KB/.test(doc.querySelector('#ld-quota').textContent), doc.querySelector('#ld-quota').textContent.replace(/\s+/g, ' ').trim());
    ok('lokasi basis data ditampilkan', /localdata\.sqlite/.test(doc.querySelector('#ld-db').textContent));

    // Hapus berkas yang punya berkas asli: dua pilihan (SQLite saja / ikut berkas asli).
    const barisPertama = doc.querySelectorAll('tr[data-id]')[0];
    barisPertama.querySelector('button[data-act="delete"]').click();
    const konfirmasi = [...doc.querySelectorAll('#ld-preview button[data-x]')].map((b) => b.dataset.x);
    ok('dialog hapus menawarkan hapus + berkas asli', konfirmasi.includes('db') && konfirmasi.includes('all') && konfirmasi.includes('cancel'), konfirmasi.join(','));
    doc.querySelector('#ld-preview button[data-x="all"]').click();
    const pesanHapus = sent.filter((m) => m.type === 'delete').pop();
    ok('hapus mengirim id + deleteSource', !!pesanHapus && pesanHapus.id === 'a1' && pesanHapus.deleteSource === true);

    // Berkas kedua tanpa sourcePath: hanya satu tombol hapus.
    const barisKedua = doc.querySelectorAll('tr[data-id]')[1];
    barisKedua.querySelector('button[data-act="delete"]').click();
    const konfirmasi2 = [...doc.querySelectorAll('#ld-preview button[data-x]')].map((b) => b.dataset.x);
    ok('berkas tanpa jalur asli tidak menawarkan hapus berkas asli', !konfirmasi2.includes('all') && konfirmasi2.includes('db'));

    // Pratinjau teks dan gambar.
    kirim({ type: 'localPreview', id: 'a1', preview: { kind: 'text', name: 'catatan.txt', size: 46, mime: 'text/plain', text: 'Halo dari SQLite' } });
    ok('pratinjau teks tampil di panel', /Halo dari SQLite/.test((doc.querySelector('.ld-text') || {}).textContent || ''));
    ok('tombol aksi pratinjau lengkap', ['save', 'external', 'editor', 'delete'].every((a) => !!doc.querySelector('button[data-p="' + a + '"]')));

    kirim({ type: 'localPreview', id: 'b2', preview: { kind: 'image', name: 'foto.png', size: 4096, mime: 'image/png', uri: 'vscode-webview://x/foto.png' } });
    const img = doc.querySelector('.ld-media img');
    ok('pratinjau gambar memakai tag img', !!img && /foto\.png$/.test(img.getAttribute('src') || ''));

    kirim({ type: 'localDeleted', id: 'b2' });
    ok('pesan setelah hapus tampil', /Unggah kembali/.test(doc.querySelector('#ld-preview').textContent));
    dom.window.close();

    // ── sambungan ke ekstensi ────────────────────────────────────────────
    const pkg = require(path.join(root, 'package.json'));
    ok('perintah LocalData terdaftar', pkg.contributes.commands.some((c) => c.command === 'date-skunder.localData.open'));
    ok('perintah LocalData ada di palet', pkg.contributes.menus.commandPalette.some((m) => m.command === 'date-skunder.localData.open'));
    ok('batas ukuran bisa diatur', ['dateSkunder.localData.maxFileMB', 'dateSkunder.localData.maxTotalMB'].every((k) => !!pkg.contributes.configuration.properties[k]));

    const mainJs = fs.readFileSync(path.join(root, 'media', 'main.js'), 'utf8');
    ok('tombol LocalData ada di halaman pratinjau', /btn-localdata/.test(mainJs) && /openLocalData/.test(mainJs));
    const extTs = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    ok('ekstensi menangani klik tombol LocalData', /m\.type === 'openLocalData'/.test(extTs));
    ok('perintah membuka dashboard', /registerCommand\('date-skunder\.localData\.open'/.test(extTs));
    ok('aset dashboard tersedia', ['localdata.js', 'localdata.css', 'pdf.min.js', 'pdf.worker.min.js'].every((f) => fs.existsSync(path.join(root, 'media', f))));
    ok('WASM SQLite ikut di dist', fs.existsSync(path.join(root, 'dist', 'sql-wasm.wasm')));

    db.dispose();
    await new Promise((r) => setTimeout(r, 120));

    // Dipindah ke folder sementara supaya tidak mengotori folder kerja.
    if (!gagal) {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* biarkan */ }
    } else {
        console.error('\nBerkas uji disimpan di: ' + tmp);
    }

    console.log('\n' + (gagal ? `${gagal} pemeriksaan GAGAL` : 'Semua pemeriksaan LocalData lolos'));
    process.exit(gagal ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
