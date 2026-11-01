/**
 * Uji fitur Join Room tanpa membuka VS Code:
 *  - util CSV (kutip, pemisah, pratinjau sel),
 *  - server Socket.IO: join, kunci satu-berkas-per-room, kursor, dan siaran CSV.
 *
 * Jalankan: node scripts/check-room.cjs
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const outDir = path.join(root, '.tmp-check');
fs.mkdirSync(outDir, { recursive: true });

const bundle = path.join(outDir, 'room-mod.cjs');
esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'roomServer.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: bundle,
    logLevel: 'warning',
});
esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'roomCsv.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: path.join(outDir, 'csv-mod.cjs'),
    logLevel: 'warning',
});

const { RoomServer } = require(bundle);
const csv = require(path.join(outDir, 'csv-mod.cjs'));
const { io } = require(path.join(root, 'node_modules', 'socket.io-client'));

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
    if (condition) {
        pass++;
        console.log(`  \u2713 ${name}`);
    } else {
        fail++;
        console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
    }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connect(port) {
    return new Promise((resolve, reject) => {
        const socket = io(`http://127.0.0.1:${port}`, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
            timeout: 4000,
        });
        const timer = setTimeout(() => reject(new Error('timeout connect')), 5000);
        socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
        socket.once('connect_error', (e) => { clearTimeout(timer); reject(e); });
    });
}

function hello(socket, payload) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout hello')), 5000);
        socket.emit('room:hello', payload, (result) => { clearTimeout(timer); resolve(result); });
    });
}

function once(socket, event, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
    });
}

function testCsv() {
    console.log('\nCSV');
    const text = 'Nama;Kota;Total\r\n"Toko, A";Bandung;1200\r\nToko B;Jakarta;900\r\n';
    const table = csv.readCsv(text, true);
    ok('deteksi titik koma', table.delimiter === ';', table.delimiter);
    ok('header terbaca', table.columns.join('|') === 'Nama|Kota|Total', table.columns.join('|'));
    ok('kutip berisi pemisah utuh', table.rows[1][0] === 'Toko, A', table.rows[1][0]);
    ok('jumlah baris data', table.totalRows === 2, String(table.totalRows));

    const rows = csv.applyCellChanges(table.rows, [{ r: 1, c: 2, value: '1500' }], table.totalCols);
    const diff = csv.diffCells(table.rows, rows, table.columns);
    ok('perubahan terdeteksi', diff.count === 1 && diff.changed[0].after === '1500', JSON.stringify(diff.changed));
    const out = csv.toCsv(rows, table.delimiter, table.eol);
    ok('tulis ulang tidak mengubah isi sel', out.includes('Toko, A'), out);
    const quoted = csv.toCsv([['a', 'b'], ['x;y', 'z']], ';');
    ok('kutip ditambahkan saat sel memuat pemisah', quoted.includes('"x;y"'), quoted);
    const quotedQuote = csv.toCsv([['a'], ['kata "kutip"']], ',');
    ok('kutip ganda di-escape', quotedQuote.includes('"kata ""kutip"""'), quotedQuote);

    const multi = csv.readCsv('A,B\r\n"baris\ndua",2\r\n', true);
    ok('sel multi-baris', multi.rows[1][0] === 'baris\ndua', JSON.stringify(multi.rows[1][0]));

    const empty = csv.readCsv('', true);
    ok('berkas kosong tidak melempar', Array.isArray(empty.rows), String(empty.rows.length));

    const windowed = csv.tableWindow(multi, 10, 1);
    ok('jendela tabel membatasi kolom', windowed.rows[0].length === 1, JSON.stringify(windowed.rows[0]));
}

async function testRooms() {
    console.log('\nSocket.IO room');
    const server = new RoomServer({ host: '127.0.0.1', log: () => undefined });
    const port = await server.start(0);
    ok('server menyala di port bebas', port > 0, String(port));

    const a = await connect(port);
    // Pemilik room: Create Room mengirim data berkas sekali di awal.
    const isi = Buffer.from('Nama,Kota,Total\r\nToko A,Bandung,1200\r\nToko B,Jakarta,900\r\n', 'utf8');
    const dataset = {
        name: 'data.csv',
        size: isi.byteLength,
        hash: createHash('sha1').update(isi).digest('hex'),
        data: isi.toString('base64'),
    };
    const joinA = await hello(a, { room: 'riset', name: 'Budi', device: 'LAPTOP-A', platform: 'win32', skin: { id: 'baja', name: 'Baja Klasik', colors: {}, accessorySvg: '' }, file: 'data.csv', create: true, dataset });
    ok('A membuat room', joinA.ok === true && joinA.snapshot.members.length === 1, JSON.stringify(joinA));

    const b = await connect(port);
    const joinB = await hello(b, { room: 'RISET', name: 'Sari', device: 'LAPTOP-B', platform: 'darwin', skin: { id: 'emas', name: 'Emas Royal', colors: { body: '#d4af37' }, accessorySvg: '<path class="sp-acc" d="M0 0" />' }, file: 'data.csv' });
    ok('B bergabung dengan berkas yang sama', joinB.ok === true && joinB.snapshot.members.length === 2, JSON.stringify(joinB));
    ok('nama room mengikuti pendaftar pertama', joinB.ok && joinB.snapshot.room === 'riset', joinB.ok ? joinB.snapshot.room : '');

    const c = await connect(port);
    const joinC = await hello(c, { room: 'riset', name: 'Andi', file: 'lain.csv' });
    ok('berkas berbeda ditolak', joinC.ok === false && joinC.code === 'file-locked', JSON.stringify(joinC));
    ok('pesan menyarankan keluar room', /keluar/i.test(joinC.message || ''), joinC.message);

    const cursorA = once(a, 'room:cursor');
    b.emit('room:cursor', { x: 0.42, y: 0.18 });
    const cursorPayload = await cursorA;
    ok('kursor B terlihat oleh A', cursorPayload && Math.abs(cursorPayload.x - 0.42) < 0.001 && cursorPayload.id === b.id, JSON.stringify(cursorPayload));

    const previewB = once(b, 'room:csv:preview');
    a.emit('room:csv:preview', { summary: '1 sel diubah', changes: [{ r: 1, c: 2, label: 'Total', before: '1200', after: '1500' }] });
    const preview = await previewB;
    ok('pratinjau CSV sampai ke B', preview && preview.from.name === 'Budi' && preview.changes.length === 1, JSON.stringify(preview));

    const appliedB = once(b, 'room:csv:applied', 5000);
    const echoA = once(a, 'room:csv:applied', 700);
    const ack = await new Promise((resolve) => a.emit('room:csv:apply', { text: 'Nama,Total\r\nA,1500\r\n', summary: '1 sel diubah' }, resolve));
    const applied = await appliedB;
    ok('CSV diterapkan disiarkan', ack && ack.ok === true && applied && applied.text.includes('1500'), JSON.stringify(ack));
    ok('pengirim tidak menerima siaran sendiri', (await echoA) === null);

    const stateAfterLeave = once(a, 'room:state');
    b.emit('room:leave');
    const after = await stateAfterLeave;
    ok('B keluar → A melihat 1 perangkat', after && after.members.length === 1, JSON.stringify(after && after.members.length));

    const rooms = server.listRooms();
    ok('ringkasan room tersedia', rooms.length === 1 && rooms[0].file === 'data.csv', JSON.stringify(rooms));

    c.disconnect();
    a.disconnect();
    await wait(120);
    await server.stop();
    ok('server berhenti', server.running === false, String(server.running));
}

(async () => {
    try {
        testCsv();
        await testRooms();
    } catch (e) {
        fail++;
        console.error('\nGagal:', e && e.stack ? e.stack : e);
    }
    console.log(`\n${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})();
