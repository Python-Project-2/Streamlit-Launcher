/**
 * Uji UI Join Room memakai jsdom (tanpa membuka VS Code):
 *  1. Panel Pet Skin: keadaan server, daftar perangkat, tabel CSV, pratinjau, dan kirim perubahan.
 *  2. Overlay halaman analisis: kursor peserta lain + nama + spider sesuai skin, badge, dan peringatan.
 *
 * Jalankan: node scripts/check-room-ui.cjs
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const vscode = require('./vscode-stub.cjs');
globalThis.__SK_VSCODE__ = vscode;

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPetProvider() {
    const out = path.join(root, '.tmp-check', `pet-view-${process.pid}.cjs`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'src', 'petView.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        outfile: out,
        logLevel: 'warning',
        plugins: [{
            name: 'vscode-global',
            setup(build) {
                build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'stub' }));
                build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'module.exports = globalThis.__SK_VSCODE__;',
                    loader: 'js',
                }));
            },
        }],
    });
    const mod = require(out);
    fs.rmSync(out, { force: true });
    return mod.PetViewProvider;
}

function makeCtx() {
    const state = new Map();
    return {
        subscriptions: [],
        workspaceState: { get: (k, d) => (state.has(k) ? state.get(k) : d), update: async (k, v) => { state.set(k, v); } },
        globalState: { get: (k, d) => (state.has(k) ? state.get(k) : d), update: async (k, v) => { state.set(k, v); } },
    };
}

function bootstrap(html, scriptFile) {
    const script = fs.readFileSync(path.join(root, 'media', scriptFile), 'utf8');
    let page = html;
    if (scriptFile === 'pet.js') {
        const css = fs.readFileSync(path.join(root, 'media', 'pet.css'), 'utf8');
        page = page.replace(/<link href="[^"]*pet\.css[^"]*" rel="stylesheet">/, `<style>${css}</style>`);
        page = page.replace(/<script nonce="[^"]*" src="[^"]*pet\.js"><\/script>/, `<script>${script}</script>`);
    } else {
        page = `<html><head><meta charset="utf-8"></head><body><script>${script}</script></body></html>`;
    }
    const posted = [];
    const dom = new JSDOM(page, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(window) {
            window.acquireVsCodeApi = () => ({
                postMessage: (m) => { posted.push(m); },
                getState: () => undefined,
                setState: () => undefined,
            });
        },
    });
    dom.window.addEventListener('error', (e) => {
        fail += 1;
        console.log(`  FAIL galat skrip: ${e.message}`);
    });
    return { dom, posted };
}

function roomStatePayload() {
    return {
        server: { running: true, host: '0.0.0.0', port: 47900, lan: ['192.168.1.7:47900'], rooms: [{ room: 'riset', file: 'data.csv', members: 2, names: ['Budi', 'Sari'] }] },
        session: { room: 'riset', name: 'Budi', fileName: 'data.csv', host: '127.0.0.1', port: 47900 },
        connection: { connected: true, reconnecting: false, attempt: 0 },
        members: [
            { id: 'a', name: 'Budi', device: 'LAPTOP-A', platform: 'win32', color: '#38bdf8', self: true, latency: 12, skin: { id: 'baja', name: 'Baja Klasik', colors: {}, accessorySvg: '' }, cursor: { x: 0.2, y: 0.3, at: Date.now() } },
            { id: 'b', name: 'Sari', device: 'LAPTOP-B', platform: 'darwin', color: '#f97316', self: false, skin: { id: 'emas', name: 'Emas Royal', colors: {}, accessorySvg: '' }, cursor: { x: 0.7, y: 0.4, at: Date.now() } },
        ],
        csv: {
            fileName: 'data.csv',
            editable: true,
            columns: ['Nama', 'Total'],
            rows: [['Nama', 'Total'], ['Toko A', '1200'], ['Toko B', '900']],
            totalRows: 2,
            totalCols: 2,
            revision: 3,
            truncated: false,
        },
        files: [{ label: 'data.csv', name: 'data.csv', path: 'C:\\kerja\\data.csv', editable: true }],
        preview: {
            kind: 'local',
            from: 'Kamu',
            summary: '1 sel di baris 1 diubah · Total',
            changed: [{ r: 1, c: 1, label: 'Total', before: '1200', after: '1500' }],
            count: 1,
            at: Date.now(),
            auto: false,
            pending: true,
        },
        lastApplied: { from: 'Sari', summary: '1 sel diubah', at: Date.now() - 60000 },
        note: 'Bergabung di room “riset”.',
        defaults: { room: 'riset', name: 'Budi', host: '192.168.1.7:47900' },
        device: 'LAPTOP-A',
        platform: 'win32 x64',
    };
}

async function testPetPanel() {
    console.log('\nPanel Pet Skin');
    const PetViewProvider = await loadPetProvider();
    const provider = new PetViewProvider(
        { extensionUri: vscode.Uri.file(root), bindPetView() {}, broadcastSpiderConfig() {} },
        makeCtx(),
        () => ({ running: false, port: 0, endpoints: {} }),
        undefined,
    );
    const html = provider.html({ cspSource: 'vscode-resource:', asWebviewUri: (u) => u });
    const { dom, posted } = bootstrap(html, 'pet.js');
    await wait(80);
    const doc = dom.window.document;

    ok(posted.some((m) => m.type === 'ready'), 'skrip panel siap dan mengirim ready');
    ok(!!doc.getElementById('room-file'), 'bagian Join Room ada di bawah Pet Skin');
    const ids = ['room-state', 'room-devices', 'room-csv-table', 'room-csv-preview'];
    ok(ids.every((id) => !!doc.getElementById(id)), 'elemen Join Room lengkap', ids.filter((id) => !doc.getElementById(id)).join(','));

    dom.window.postMessage({ type: 'petRoomState', room: roomStatePayload() }, '*');
    await wait(60);

    ok(/🟢 riset/.test(doc.getElementById('room-state').textContent), 'status terhubung tampil', doc.getElementById('room-state').textContent);
    ok(doc.getElementById('room-host').value === '192.168.1.7:47900', 'alamat server terisi otomatis', doc.getElementById('room-host').value);
    ok(doc.getElementById('room-name').value === 'riset' && doc.getElementById('room-user').value === 'Budi', 'nama room & user terisi otomatis', doc.getElementById('room-name').value + '/' + doc.getElementById('room-user').value);
    ok(/47900/.test(doc.getElementById('room-server-info').textContent), 'alamat server tampil', doc.getElementById('room-server-info').textContent);
    ok(doc.querySelectorAll('.pet-room-device').length === 2, 'dua perangkat tampil', String(doc.querySelectorAll('.pet-room-device').length));
    ok(doc.querySelectorAll('.pet-room-map-cursor').length === 1, 'peta kursor hanya menampilkan peserta lain', String(doc.querySelectorAll('.pet-room-map-cursor').length));
    dom.window.postMessage({ type: 'petRoomCursor', id: 'b', x: 0.8, y: 0.2 }, '*');
    await wait(20);
    const mapDot = doc.querySelector('.pet-room-map-cursor');
    ok(mapDot && mapDot.style.left === '80%' && mapDot.style.top === '20%', 'peta kursor bergerak realtime', mapDot ? mapDot.style.left + '/' + mapDot.style.top : '-');
    ok(doc.querySelector('.pet-room-device[data-id="b"] .pet-room-device-meta').textContent.includes('80%,20%'), 'angka kursor perangkat ikut realtime');
    const diam = roomStatePayload();
    diam.members[1].cursor = { x: 0, y: 0, at: 0 };
    dom.window.postMessage({ type: 'petRoomState', room: diam }, '*');
    await wait(30);
    ok(doc.querySelectorAll('.pet-room-map-cursor').length === 0, 'peta kosong saat peserta belum bergerak');
    dom.window.postMessage({ type: 'petRoomCursor', id: 'b', x: 0.6, y: 0.4 }, '*');
    await wait(30);
    ok(doc.querySelectorAll('.pet-room-map-cursor').length === 1, 'titik muncul begitu peserta mulai bergerak');
    ok(/Sari/.test(doc.getElementById('room-devices').textContent), 'nama peserta lain tampil');
    ok(doc.querySelectorAll('#room-csv-table input.cell').length === 4, 'tabel CSV dapat diedit', String(doc.querySelectorAll('#room-csv-table input.cell').length));
    ok(/1500/.test(doc.getElementById('room-csv-preview').textContent), 'pratinjau perubahan tampil');
    ok(/Sari/.test(doc.getElementById('room-last-applied').textContent), 'riwayat penerapan tampil');
    ok(doc.getElementById('room-join').hidden === true, 'tombol Join disembunyikan saat sudah di room');

    const cell = doc.querySelector('#room-csv-table input.cell');
    cell.value = '1500';
    cell.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await wait(560);
    const previewMsg = posted.filter((m) => m.type === 'roomCsvPreview').pop();
    ok(!!previewMsg && previewMsg.changes.length === 1 && previewMsg.changes[0].value === '1500', 'perubahan sel dikirim sebagai pratinjau', JSON.stringify(previewMsg));
    ok(cell.classList.contains('dirty'), 'sel yang diubah ditandai');

    doc.getElementById('room-csv-apply').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    doc.getElementById('room-csv-apply').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const applyMsg = posted.filter((m) => m.type === 'roomCsvApply').pop();
    ok(!!applyMsg && applyMsg.changes.length === 1, 'tombol terapkan mengirim perubahan', JSON.stringify(applyMsg));

    // Peringatan berkas berbeda + tombol keluar room.
    const blocked = roomStatePayload();
    blocked.session = null;
    blocked.members = [];
    blocked.note = 'Room “riset” sudah memakai berkas “data.csv”. Keluar dari room itu dulu.';
    dom.window.postMessage({ type: 'petRoomState', room: blocked }, '*');
    await wait(40);
    const reconnect = roomStatePayload();
    reconnect.connection = { connected: false, reconnecting: true, attempt: 3 };
    dom.window.postMessage({ type: 'petRoomState', room: reconnect }, '*');
    await wait(30);
    ok(/menyambung ulang/.test(doc.getElementById('room-state').textContent), 'status menyambung ulang tampil', doc.getElementById('room-state').textContent);
    dom.window.postMessage({ type: 'petRoomState', room: blocked }, '*');
    await wait(30);
    ok(/keluar/i.test(doc.getElementById('room-hint').textContent), 'alasan keluar room tampil di panel', doc.getElementById('room-hint').textContent);

    // ── Pratinjau CSV: tombol melayang (tanpa blok kuning) ──
    const chip = doc.getElementById('room-preview-chip');
    ok(!!chip && chip.hidden === false, 'tombol pratinjau melayang tampil saat ada perubahan', chip ? String(chip.hidden) : '-');
    if (chip) { chip.dispatchEvent(new dom.window.Event('click', { bubbles: true })); }
    await wait(20);
    ok(doc.getElementById('room-preview-float').hidden === false, 'klik tombol pratinjau membuka panel melayang');
    doc.getElementById('room-preview-close').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await wait(20);
    ok(doc.getElementById('room-preview-float').hidden === true, 'panel pratinjau bisa ditutup');

    // ── Kirim file & tombol Download di laptop penerima ──
    const withFiles = roomStatePayload();
    withFiles.incomingFiles = [{ id: 'f1', name: 'laporan.pdf', sizeLabel: '12 KB', from: 'Sari', at: Date.now(), savedPath: '' }];
    dom.window.postMessage({ type: 'petRoomState', room: withFiles }, '*');
    await wait(40);
    ok(doc.getElementById('room-files-card').hidden === false, 'kartu kirim file tampil saat di room');
    const unduh = doc.querySelector('#room-incoming .pet-room-download');
    ok(!!unduh && /Download/.test(unduh.textContent), 'file masuk punya tombol Download', unduh ? unduh.textContent : '-');
    if (unduh) { unduh.dispatchEvent(new dom.window.Event('click', { bubbles: true })); }
    ok(posted.some((m) => m.type === 'roomDownloadFile' && m.id === 'f1'), 'klik Download mengirim roomDownloadFile');
    doc.getElementById('room-send-file').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    ok(posted.some((m) => m.type === 'roomSendFile'), 'tombol kirim file mengirim roomSendFile');

    // ── Create Room: mode, berkas, dan nama room ikut terkirim ──
    const kosong = roomStatePayload();
    kosong.session = null;
    kosong.members = [];
    kosong.csv = null;
    kosong.preview = null;
    kosong.incomingFiles = [];
    dom.window.postMessage({ type: 'petRoomState', room: kosong }, '*');
    await wait(40);
    ok(doc.getElementById('room-host-row').hidden === true, 'mode Create menyembunyikan alamat server');
    ok(doc.getElementById('room-create').hidden === false, 'tombol Create Room tampil');
    doc.getElementById('room-create').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await wait(20);
    const createMsg = posted.filter((m) => m.type === 'roomCreate').pop();
    ok(!!createMsg && createMsg.room === 'riset' && /data\.csv$/.test(createMsg.filePath || ''), 'Create Room mengirim nama room + berkas', JSON.stringify(createMsg));
    doc.querySelector('#room-mode [data-mode="join"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await wait(20);
    ok(doc.getElementById('room-host-row').hidden === false && doc.getElementById('room-join').hidden === false, 'mode Join menampilkan alamat server + tombol Join');

    dom.window.close();
}

async function testOverlay() {
    console.log('\nOverlay halaman analisis');
    const { dom, posted } = bootstrap('<html><body></body></html>', 'room.js');
    await wait(60);
    const doc = dom.window.document;

    ok(posted.some((m) => m.type === 'roomReady'), 'overlay mengirim roomReady');
    dom.window.postMessage({
        type: 'roomState',
        room: {
            enabled: true,
            inRoom: true,
            room: 'riset',
            file: 'data.csv',
            selfId: 'a',
            showCursors: true,
            blocked: null,
            members: [
                { id: 'a', name: 'Budi', color: '#38bdf8', self: true, skin: { id: 'baja', name: 'Baja Klasik', colors: {}, accessorySvg: '' }, cursor: { x: 0.2, y: 0.3, at: Date.now() } },
                { id: 'b', name: 'Sari', color: '#f97316', self: false, skin: { id: 'emas', name: 'Emas Royal', colors: { body: '#d4af37', accent: '#fff3c4' }, accessorySvg: '<path class="sp-acc" d="M51 31 L51 20 Z" />' }, cursor: { x: 0.5, y: 0.5, at: Date.now() } },
                { id: 'c', name: 'Andi', color: '#22c55e', self: false, skin: { id: 'zamrud', name: 'Zamrud Rimba', colors: { body: '#1f7a4d' }, accessorySvg: '' }, cursor: { x: 0.2, y: 0.8, at: Date.now() } },
            ],
        },
    }, '*');
    await wait(40);

    const cursors = doc.querySelectorAll('.sk-room-cursor');
    ok(cursors.length === 2, 'dua kursor peserta lain digambar (dua spider)', String(cursors.length));
    ok(/Andi/.test(cursors[1].textContent), 'nama peserta kedua tampil', cursors[1].textContent);
    ok(/Sari/.test(cursors[0].textContent), 'nama peserta tampil di kursor', cursors[0].textContent);
    ok(!!cursors[0].querySelector('.sk-room-spider'), 'spider mini memakai skin peserta');
    ok(!!cursors[0].querySelector('.sk-room-spider .sp-acc'), 'aksesori skin lain ikut tampil');
    ok(/Room: riset/.test(doc.querySelector('.sk-room-badge').textContent), 'badge room tampil', doc.querySelector('.sk-room-badge').textContent);

    dom.window.postMessage({ type: 'roomCursor', id: 'b', x: 0.25, y: 0.75 }, '*');
    await wait(30);
    const targetMember = dom.window.SkunderRoom.state().members.find((m) => m.id === 'b');
    ok(Math.abs(targetMember.cursor.x - 0.25) < 0.001, 'posisi target kursor tersimpan', JSON.stringify(targetMember.cursor));
    await wait(420);
    const tf = /translate3d\((-?\d+)px, (-?\d+)px/.exec(cursors[0].style.transform);
    ok(!!tf && Math.abs(Number(tf[1]) - 256) < 40 && Math.abs(Number(tf[2]) - 576) < 40, 'kursor meluncur halus ke target (interpolasi)', cursors[0].style.transform);

    dom.window.postMessage({ type: 'roomCursor', id: 'b', x: 0.97, y: 0.97 }, '*');
    await wait(460);
    ok(cursors[0].classList.contains('flip-x') && cursors[0].classList.contains('flip-y'), 'chip nama pindah sisi di tepi layar', cursors[0].className);

    // 120 peristiwa cepat → rAF menggabungkan frame, posisi akhir tetap tepat.
    for (let i = 0; i < 120; i++) {
        dom.window.postMessage({ type: 'roomCursor', id: 'c', x: 0.1 + i * 0.005, y: 0.2 + i * 0.004 }, '*');
    }
    await wait(600);
    const stress = /translate3d\((-?\d+)px, (-?\d+)px/.exec(cursors[1].style.transform);
    ok(!!stress && Math.abs(Number(stress[1]) - 0.695 * 1024) < 30 && Math.abs(Number(stress[2]) - 0.676 * 768) < 30, '120 peristiwa kursor tetap halus & tepat', cursors[1].style.transform);

    dom.window.postMessage({ type: 'roomToast', text: 'CSV diganti Sari', kind: 'ok' }, '*');
    await wait(20);
    ok(/CSV diganti Sari/.test(doc.querySelector('.sk-room-toast').textContent), 'toast perubahan CSV tampil');

    dom.window.postMessage({
        type: 'roomState',
        room: {
            enabled: true, inRoom: true, room: 'riset', file: 'lain.csv', selfId: 'a', showCursors: true,
            blocked: { message: 'Halaman ini membuka “lain.csv”, sedangkan room memakai “data.csv”. Keluar dari room dulu.', roomFile: 'data.csv' },
            members: [],
        },
    }, '*');
    await wait(30);
    const banner = doc.querySelector('.sk-room-banner');
    ok(banner && banner.hidden === false, 'peringatan berkas berbeda tampil');
    ok(/Keluar dari room dulu/.test(banner.textContent), 'pesan menyarankan keluar room', banner.textContent);

    // Elemen melayang memakai [hidden]; `display` di kelasnya tidak boleh menimpanya,
    // kalau tidak banner kosong tampil sebagai pil hitam di atas halaman analisis.
    const roomCss = fs.readFileSync(path.join(root, 'media', 'room.css'), 'utf8');
    ok(/\.sk-room-banner\[hidden\][^{]*\{[^}]*display:\s*none/.test(roomCss), 'banner hilang total saat [hidden]');
    ok(/\.sk-room-toast\[hidden\][^{]*\{[^}]*display:\s*none/.test(roomCss), 'toast hilang total saat [hidden]');
    ok(/\.sk-room-badge\[hidden\][^{]*\{[^}]*display:\s*none/.test(roomCss), 'badge hilang total saat [hidden]');

    dom.window.close();
}

(async () => {
    try {
        await testPetPanel();
        await testOverlay();
    } catch (e) {
        fail += 1;
        console.error('\nGagal:', e && e.stack ? e.stack : e);
    }
    console.log(`\n${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})();
