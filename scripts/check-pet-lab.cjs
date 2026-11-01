/**
 * Pemeriksaan Pet Lab tanpa VS Code:
 *
 *   npm run check:pet-lab
 *
 *  1. Header HTTP dibaca dari JSON objek maupun baris `Kunci: nilai`.
 *  2. Test API JSON: balasan JSON, echo POST, 404, pengalihan, URL salah, dan batas waktu.
 *  3. Ringkasan + pratinjau hasil test.
 *  4. Riwayat: urutan terbaru dulu, batas 20 entri, hapus satu, dan hapus semua.
 *  5. Cek kesehatan: laporan berisi skor/RAM/disk, metrik nyata terbaca di mesin ini.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const ok = (cond, label, extra) => {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
};

async function loadLib() {
    const outDir = path.join(root, '.tmp-check');
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `pet-lab-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export {",
                "  parseApiHeaders, runApiTest, apiPresets, apiSummary, apiDetail, formatBytes,",
                "  addLabEntry, labEntries, deleteLabEntry, clearLabEntries, labEntryById, previewEntry, MAX_LAB_ENTRIES,",
                "  healthReport, healthSummary, collectHealth,",
                "} from './src/petLab';",
            ].join('\n'),
            resolveDir: root,
            loader: 'ts',
        },
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile,
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
    return lib;
}

/** Server tiruan API JSON lokal. */
function fakeApi() {
    return new Promise((resolve) => {
        let hits = 0;
        const srv = http.createServer((req, res) => {
            hits += 1;
            const url = new URL(req.url, 'http://127.0.0.1');
            if (url.pathname === '/json') {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, items: [1, 2, 3], room: 'umum' }));
                return;
            }
            if (url.pathname === '/redirect') {
                res.writeHead(302, { Location: '/json' });
                res.end();
                return;
            }
            if (url.pathname === '/missing') {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
            }
            if (url.pathname === '/slow') {
                setTimeout(() => { res.writeHead(200); res.end('terlambat'); }, 2500);
                return;
            }
            if (url.pathname === '/echo') {
                let body = '';
                req.on('data', (c) => { body += c; });
                req.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        method: req.method,
                        body,
                        contentType: req.headers['content-type'] || '',
                        auth: req.headers.authorization || '',
                    }));
                });
                return;
            }
            res.writeHead(500);
            res.end('tak dikenal');
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, hits: () => hits }));
    });
}

function fakeContext() {
    const store = new Map();
    return {
        store,
        globalState: {
            get: (key) => store.get(key),
            update: async (key, value) => { store.set(key, value); },
        },
    };
}

(async () => {
    const lib = await loadLib();

    console.log('\n[Header HTTP]');
    const jsonHeaders = lib.parseApiHeaders('{"Authorization":"Bearer abc","X-Test":"1"}');
    ok(jsonHeaders.Authorization === 'Bearer abc', 'header dari JSON objek');
    const lineHeaders = lib.parseApiHeaders('Content-Type: application/json\nAuthorization: Bearer xyz');
    ok(lineHeaders['Content-Type'] === 'application/json', 'header dari baris');
    ok(lineHeaders.Authorization === 'Bearer xyz', 'header baris kedua');
    ok(Object.keys(lib.parseApiHeaders('')).length === 0, 'header kosong');

    const api = await fakeApi();
    const base = `http://127.0.0.1:${api.port}`;

    console.log('\n[Test API JSON]');
    const sehat = await lib.runApiTest({ url: `${base}/json`, method: 'GET' });
    ok(sehat.ok && sehat.status === 200, 'GET 200 dianggap berhasil', JSON.stringify(sehat.error || sehat.status));
    ok(sehat.json && sehat.json.room === 'umum', 'balasan JSON di-parse', sehat.text.slice(0, 60));
    ok(/"room": "umum"/.test(sehat.text), 'balasan JSON di-pretty-print');
    ok(sehat.bytes > 0 && sehat.ms >= 0, 'ukuran + waktu tercatat');

    const echo = await lib.runApiTest({
        url: `${base}/echo`, method: 'POST', body: '{"message":"halo"}', headers: '{"Authorization":"Bearer token"}',
    });
    ok(echo.ok && echo.json && echo.json.method === 'POST', 'POST terkirim');
    ok(echo.json && echo.json.body === '{"message":"halo"}', 'body JSON terkirim apa adanya', echo.json && echo.json.body);
    ok(echo.json && /application\/json/.test(echo.json.contentType), 'content-type JSON otomatis', echo.json && echo.json.contentType);
    ok(echo.json && echo.json.auth === 'Bearer token', 'header kustom terkirim');

    const getBody = await lib.runApiTest({ url: `${base}/echo`, method: 'GET', body: '{"x":1}' });
    ok(getBody.json && String(getBody.json.body || '') === '', 'GET mengabaikan body');

    const hilang = await lib.runApiTest({ url: `${base}/missing` });
    ok(!hilang.ok && hilang.status === 404, '404 dianggap gagal', String(hilang.status));
    ok(/404/.test(lib.apiSummary(hilang)), 'ringkasan memuat status', lib.apiSummary(hilang));

    const alih = await lib.runApiTest({ url: `${base}/redirect` });
    ok(alih.ok && alih.json && alih.json.ok === true, 'pengalihan 302 diikuti', alih.text.slice(0, 80));

    const salah = await lib.runApiTest({ url: 'bukan url' });
    ok(!salah.ok && /tidak valid/i.test(salah.error || ''), 'URL salah ditolak dengan pesan', salah.error);
    const protokol = await lib.runApiTest({ url: 'ftp://127.0.0.1/berkas' });
    ok(!protokol.ok && /http/i.test(protokol.error || ''), 'protokol selain http ditolak');

    const lambat = await lib.runApiTest({ url: `${base}/slow`, timeoutMs: 900 });
    ok(!lambat.ok && /batas waktu/i.test(lambat.error || ''), 'batas waktu dihormati', lambat.error);

    console.log('\n[Ringkasan & detail]');
    const detail = lib.apiDetail(sehat);
    ok(/GET/.test(detail) && /200/.test(detail) && /"room"/.test(detail), 'detail memuat metode, status, balasan');
    ok(lib.formatBytes(2048) === '2.0 KB', 'format ukuran', lib.formatBytes(2048));
    ok(lib.apiPresets({}, 12345)[0].url === 'http://127.0.0.1:12345/api/health.json', 'preset memakai port pengaturan');
    ok(lib.apiPresets({ health: 'http://x/api/health.json' }, 1)[0].url === 'http://x/api/health.json', 'preset memakai endpoint server');

    console.log('\n[Riwayat]');
    const ctx = fakeContext();
    const satu = await lib.addLabEntry(ctx, { kind: 'api', title: 'GET /a', ok: true, summary: '200', detail: 'hasil a' });
    const dua = await lib.addLabEntry(ctx, { kind: 'health', title: 'Cek Kesehatan', ok: true, summary: '90/100', detail: 'hasil b' });
    const list = lib.labEntries(ctx);
    ok(list.length === 2 && list[0].id === dua.id, 'terbaru di urutan pertama');
    ok(lib.labEntryById(ctx, satu.id).title === 'GET /a', 'cari entri berdasarkan id');
    ok(await lib.deleteLabEntry(ctx, satu.id), 'hapus satu entri');
    ok(lib.labEntries(ctx).length === 1, 'entri terhapus dari riwayat');
    ok(!await lib.deleteLabEntry(ctx, 'tidak-ada'), 'hapus id tak dikenal tidak melempar');

    for (let i = 0; i < lib.MAX_LAB_ENTRIES + 5; i += 1) {
        await lib.addLabEntry(ctx, { kind: 'api', title: `GET /${i}`, ok: true, summary: String(i), detail: `isi ${i}`, at: Date.now() + i });
    }
    ok(lib.labEntries(ctx).length === lib.MAX_LAB_ENTRIES, `riwayat dibatasi ${lib.MAX_LAB_ENTRIES} entri`, String(lib.labEntries(ctx).length));

    const panjang = await lib.addLabEntry(ctx, { kind: 'api', title: 'GET /besar', ok: true, summary: '200', detail: 'x'.repeat(20000) });
    const pratinjau = lib.previewEntry(lib.labEntryById(ctx, panjang.id));
    ok(pratinjau.truncated && pratinjau.detail.length < 20000, 'pratinjau memotong teks panjang');
    ok(/Buka di editor/i.test(pratinjau.detail), 'pratinjau memberi petunjuk buka editor');

    const jumlah = await lib.clearLabEntries(ctx);
    ok(jumlah === lib.MAX_LAB_ENTRIES && lib.labEntries(ctx).length === 0, 'hapus semua mengosongkan riwayat', String(jumlah));

    console.log('\n[UI Pet Lab (jsdom)]');
    const { JSDOM } = require('jsdom');
    const html = `<!DOCTYPE html><html><body>
        <div id="pet-state"></div>
        <div id="pet-grid"></div>
        <div id="pet-missions"></div>
        <div id="pet-note" hidden></div>
        <strong id="pet-lab-state"></strong>
        <select id="lab-endpoint"></select>
        <select id="lab-method"><option>GET</option><option>POST</option></select>
        <input id="lab-url" type="text">
        <textarea id="lab-headers"></textarea>
        <textarea id="lab-body"></textarea>
        <button id="lab-send"></button>
        <button id="lab-copy-url"></button>
        <button id="lab-health"></button>
        <div id="lab-result" hidden></div>
        <span id="lab-count">0</span>
        <div id="lab-history"></div>
        <button id="lab-clear"></button>
        <button id="pet-open-community"></button>
    </body></html>`;
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test' });
    const posted = [];
    dom.window.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m) });
    dom.window.eval(fs.readFileSync(path.join(root, 'media', 'pet.js'), 'utf8'));
    const doc = dom.window.document;
    const kirim = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const pesan = (data) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data }));

    ok(posted[0] && posted[0].type === 'ready', 'webview mengirim pesan ready');

    const entri = [
        { id: 'e1', kind: 'api', title: 'GET /api/health.json', at: Date.now(), ok: true, summary: '200 · 5 ms', detail: '{"ok":true}' },
        { id: 'e2', kind: 'health', title: 'Cek Kesehatan Laptop', at: Date.now(), ok: false, summary: '58/100 Kritis', detail: 'RAM 94%' },
    ];
    pesan({ type: 'petSkinState', active: 'baja', missions: [], skins: [] });
    pesan({
        type: 'petLabState', running: true, port: 47831, entries: entri,
        presets: [{ id: 'health', label: 'health.json', url: 'http://127.0.0.1:47831/api/health.json' }],
    });
    ok(doc.querySelectorAll('#lab-history .pet-lab-entry').length === 2, 'riwayat merender 2 hasil');
    ok(doc.getElementById('lab-count').textContent === '2', 'jumlah riwayat tampil');
    ok(doc.getElementById('lab-url').value === 'http://127.0.0.1:47831/api/health.json', 'URL endpoint terisi otomatis');

    const barisPertama = doc.querySelector('#lab-history .pet-lab-entry');
    kirim(barisPertama.querySelector('button[data-act="preview"]'));
    ok(!barisPertama.querySelector('.pet-lab-entry-preview').hidden, 'tombol 👁 membuka pratinjau');
    ok(/"ok":true/.test(barisPertama.querySelector('.pet-lab-entry-preview').textContent), 'pratinjau memuat isi hasil');

    kirim(barisPertama.querySelector('button[data-act="delete"]'));
    ok(posted[posted.length - 1].type === 'labDelete' && posted[posted.length - 1].id === 'e1', 'tombol 🗑 mengirim labDelete');

    kirim(doc.getElementById('lab-send'));
    const tes = posted[posted.length - 1];
    ok(tes.type === 'labApiTest' && tes.method === 'GET' && /api\/health\.json/.test(tes.url), 'tombol Kirim mengirim labApiTest', JSON.stringify(tes));
    ok(doc.getElementById('lab-send').disabled, 'tombol Kirim nonaktif saat mengirim');

    pesan({ type: 'petLabBusy', busy: '' });
    ok(!doc.getElementById('lab-send').disabled, 'tombol Kirim aktif lagi setelah selesai');
    pesan({ type: 'petLabResult', entry: entri[0], text: '{"ok":true}' });
    ok(!doc.getElementById('lab-result').hidden && /200/.test(doc.getElementById('lab-result').textContent), 'hasil test tampil di kotak hasil');

    kirim(doc.getElementById('lab-health'));
    ok(posted[posted.length - 1].type === 'labHealth', 'tombol 🩺 mengirim labHealth');
    pesan({ type: 'petLabBusy', busy: '' });

    kirim(doc.getElementById('lab-clear'));
    ok(doc.getElementById('lab-clear').textContent.includes('Klik lagi'), 'hapus semua butuh konfirmasi kedua');
    kirim(doc.getElementById('lab-clear'));
    ok(posted[posted.length - 1].type === 'labClear', 'konfirmasi kedua mengirim labClear');
    dom.window.close();

    console.log('\n[Cek kesehatan laptop]');
    const metrik = await lib.collectHealth();
    ok(Number.isFinite(metrik.score) && metrik.score >= 0 && metrik.score <= 100, 'skor 0–100', String(metrik.score));
    ok(['Sehat', 'Perlu perhatian', 'Kritis'].includes(metrik.label), 'label kesehatan dikenal', metrik.label);
    ok(metrik.memTotal > 0 && metrik.memUsedPct >= 0 && metrik.memUsedPct <= 100, 'metrik RAM terbaca', String(metrik.memUsedPct));
    ok(metrik.cores > 0 && metrik.cpuUsage >= 0 && metrik.cpuUsage <= 100, 'metrik CPU terbaca', String(metrik.cpuUsage));
    ok(Array.isArray(metrik.disks) && metrik.disks.length >= 1, 'metrik disk terbaca', String(metrik.disks.length));
    ok(Array.isArray(metrik.apps), 'daftar aplikasi berat berupa array');
    const laporan = lib.healthReport(metrik);
    ok(/CEK KESEHATAN LAPTOP/.test(laporan) && /Skor/.test(laporan), 'laporan memuat judul + skor');
    ok(/RAM/.test(laporan) && /Disk/.test(laporan), 'laporan memuat RAM + disk');
    ok(/Saran:/.test(laporan), 'laporan memuat saran');
    const ringkas = lib.healthSummary(metrik);
    ok(new RegExp(`${metrik.score}/100`).test(ringkas), 'ringkasan memuat skor', ringkas);

    api.srv.close();
    console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('Pemeriksaan gagal:', e);
    process.exit(1);
});
