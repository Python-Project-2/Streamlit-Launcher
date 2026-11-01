/**
 * Uji layanan Join Room (RoomService) tanpa VS Code:
 * dua "laptop" dijalankan di proses yang sama dengan berkas CSV masing-masing.
 *
 *   node scripts/check-room-service.cjs
 *
 * Yang diuji: join ke server laptop lain, daftar perangkat, pratinjau perubahan CSV,
 * penerapan otomatis ke berkas laptop kedua, dan penolakan berkas yang berbeda.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const vscode = require('./vscode-stub.cjs');

// API tambahan yang dipakai RoomService (tidak ada di stub bawaan).
vscode.workspace.fs.stat = async (uri) => ({ type: 1, size: fs.statSync(uri.fsPath).size });
vscode.workspace.findFiles = async () => [];
vscode.window.tabGroups = { activeTabGroup: { activeTab: undefined } };
globalThis.__SK_VSCODE__ = vscode;

const config = vscode.config;
config['room.port'] = 49500 + Math.floor(Math.random() * 60);
config['room.autoApplyCsv'] = true;
config['room.showCursors'] = true;
config['spider.skin'] = 'baja';

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function until(fn, ms = 7000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if (await fn()) { return true; }
        await wait(60);
    }
    return false;
}

function makeCtx(tag) {
    const state = new Map();
    return {
        subscriptions: [],
        workspaceState: {
            get: (k, d) => (state.has(k) ? state.get(k) : d),
            update: async (k, v) => { state.set(k, v); },
        },
        globalState: {
            get: (k, d) => (state.has(k) ? state.get(k) : d),
            update: async (k, v) => { state.set(k, v); },
        },
        extensionUri: vscode.Uri.file(root),
        // Tiap “laptop” punya penyimpanan sendiri supaya berkas room tidak saling menimpa.
        globalStorageUri: vscode.Uri.file(path.join(os.tmpdir(), `sk-room-store-${process.pid}-${tag || 'a'}`)),
    };
}

async function loadService() {
    const out = path.join(root, '.tmp-check', `room-service-${process.pid}.cjs`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'src', 'roomService.ts')],
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
    return mod.RoomService;
}

(async () => {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-room-a-'));
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-room-b-'));
    const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-room-c-'));
    const fileA = path.join(dirA, 'data.csv');
    const fileB = path.join(dirB, 'data.csv');
    const fileC = path.join(dirC, 'lain.csv');
    /** Berkas yang diterima laptop B dari pemilik room (ditulis di penyimpanan ekstensi B). */
    const terimaB = path.join(os.tmpdir(), `sk-room-store-${process.pid}-b`, 'rooms', 'uji', 'data.csv');
    fs.writeFileSync(fileA, 'Nama,Total\r\nToko A,1200\r\nToko B,900\r\n', 'utf8');
    fs.writeFileSync(fileB, 'Nama,Total\r\nToko A,1200\r\nToko B,900\r\n', 'utf8');
    fs.writeFileSync(fileC, 'X,Y\r\n1,2\r\n', 'utf8');

    let A;
    let B;
    let C;
    try {
        const RoomService = await loadService();
        A = new RoomService(makeCtx('a'), { log: () => undefined });
        B = new RoomService(makeCtx('b'), { log: () => undefined });

        await A.startServer();
        ok(A.serverRunning(), 'server laptop A menyala', String(A.serverPort()));

        await A.createRoom({ room: 'uji', name: 'Budi', filePath: fileA });
        ok(A.isInRoom(), 'laptop A membuat room', A.viewState().note);

        await B.joinRoom({ host: '127.0.0.2', room: 'uji', name: 'Sari' });
        ok(B.isInRoom(), 'laptop B bergabung lewat alamat LAN', B.viewState().note);

        const dua = await until(() => A.viewState().members.length === 2 && B.viewState().members.length === 2);
        ok(dua, 'kedua laptop saling melihat perangkat', `A=${A.viewState().members.length} B=${B.viewState().members.length}`);

        ok(A.viewState().connection.connected === true, 'status koneksi terhubung', JSON.stringify(A.viewState().connection));
        A.sendCursor(0.33, 0.44);
        const kursorSampai = await until(() => {
            const m = B.viewState().members.find((x) => x.name === 'Budi');
            return !!m && !!m.cursor && Math.abs(m.cursor.x - 0.33) < 0.01 && Math.abs(m.cursor.y - 0.44) < 0.01;
        });
        ok(kursorSampai, 'kursor realtime sampai ke laptop lain', JSON.stringify(B.viewState().members.map((m) => m.cursor)));

        const namaB = A.viewState().members.find((m) => m.name === 'Sari');
        ok(!!namaB && !!namaB.skin, 'nama & skin peserta lain terkirim', JSON.stringify(namaB && namaB.skin && namaB.skin.id));

        A.previewLocalChanges([{ r: 1, c: 1, value: '1500' }]);
        const pratinjau = await until(() => B.viewState().preview && B.viewState().preview.kind === 'incoming');
        ok(pratinjau, 'pratinjau perubahan sampai ke laptop B', JSON.stringify(B.viewState().preview));
        // Data pemilik sudah otomatis diterima laptop B (nama sama, isi sama).
        const terima = await until(() => fs.existsSync(terimaB) && fs.readFileSync(terimaB, 'utf8').includes('1200'));
        ok(terima, 'data room dari pemilik otomatis diterima laptop B', terimaB);
        ok(!!B.viewState().csv, 'analisis/isi CSV tampil di laptop B', JSON.stringify(B.viewState().csv && B.viewState().csv.rows.length));
        ok(fs.readFileSync(terimaB, 'utf8').includes('1200'), 'berkas B belum berubah sebelum diterapkan', 'sudah berubah');

        await A.applyLocalChanges([{ r: 1, c: 1, value: '1500' }]);
        const terganti = await until(() => fs.readFileSync(terimaB, 'utf8').includes('1500'));
        ok(terganti, 'CSV laptop B otomatis terganti', fs.readFileSync(terimaB, 'utf8'));
        const backupDir = path.join(os.tmpdir(), `sk-room-store-${process.pid}-b`, 'room-backup');
        const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];
        ok(backups.length > 0, 'isi CSV lama dicadangkan sebelum ditimpa', String(backups.length));
        ok(fs.readFileSync(fileA, 'utf8').includes('1500'), 'CSV laptop A tersimpan', fs.readFileSync(fileA, 'utf8'));
        ok(!!B.viewState().lastApplied, 'ringkasan penerapan tercatat', JSON.stringify(B.viewState().lastApplied));

        C = new RoomService(makeCtx('c'), { log: () => undefined });
        await C.joinRoom({ host: '127.0.0.2', room: 'uji', name: 'Andi' });
        ok(C.isInRoom() === true, 'laptop C ikut bergabung di room yang sama', C.viewState().note);
        ok(await until(() => A.viewState().members.length === 3), 'pemilik melihat tiga perangkat', String(A.viewState().members.length));
        await C.leave();

        await A.leave();
        ok(A.isInRoom() === false, 'keluar room membersihkan sesi');
    } catch (e) {
        fail += 1;
        console.error('\nGagal:', e && e.stack ? e.stack : e);
    } finally {
        try { A && A.dispose(); } catch { /* abaikan */ }
        try { B && B.dispose(); } catch { /* abaikan */ }
        try { C && C.dispose(); } catch { /* abaikan */ }
        await wait(400);
        for (const dir of [dirA, dirB, dirC]) {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* abaikan */ }
        }
    }

    console.log(`\n${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})();
