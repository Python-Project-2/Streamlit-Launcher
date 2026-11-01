/**
 * Pemeriksaan Firebase Community + API JSON percakapan (tanpa VS Code):
 *
 *   npm run check:chat-api
 *
 *  1. Pemetaan dokumen Firestore ↔ pesan view (field lama `username`/`description`/`message`/`timestamp`).
 *  2. Baca/kirim ke server Firestore tiruan (HTTP lokal) — tidak menyentuh database sungguhan.
 *  3. API JSON lokal: /api/chat.json, /api/community.json, /api/diskusi.json, /api/rooms.json,
 *     /api/health.json, /api/raw.txt, /api/firebase.json, 404, CORS, dan unduhan.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
require('./vscode-stub.cjs');

let pass = 0;
let fail = 0;
const ok = (cond, label, extra) => {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
};

async function loadLib() {
    const outDir = path.join(root, '.tmp-check');
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `chat-api-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { ChatApiServer } from './src/chatApi';",
                "export { communityCollectionId, remoteFields, remoteFromDocument, listCommunityMessages, sendCommunityMessage, deleteAllCommunityMessages, firebaseEnabled, discussionCollectionId, listDiscussionMessages } from './src/communityFirebase';",
                "export { setChatLogFallback, appendChatLog, flushChatLog, chatLogFile, readChatLogEntries, parseChatLog, chatLogJson } from './src/chatLog';",
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
    return lib;
}

/** Server Firestore tiruan: runQuery + create + list + delete. */
function fakeFirestore() {
    return new Promise((resolve) => {
        const calls = [];
        const docs = [
            {
                document: {
                    name: 'projects/test/databases/(default)/documents/community_umum/a1',
                    fields: {
                        username: { stringValue: 'Rina Kusuma' },
                        description: { stringValue: 'Kualitas data & statistik' },
                        message: { stringValue: 'Skor kualitas 98/100, 0 sel kosong.' },
                        timestamp: { integerValue: '1792582954641' },
                        lang: { stringValue: 'id' },
                        langTag: { stringValue: 'ID' },
                        kind: { stringValue: 'chat' },
                        channel: { stringValue: 'umum' },
                    },
                },
            },
            {
                document: {
                    name: 'projects/test/databases/(default)/documents/community_umum/a2',
                    fields: {
                        username: { stringValue: 'Chen Wei 陈伟' },
                        description: { stringValue: 'Visualisasi data' },
                        message: { stringValue: 'Grafik stok sudah siap.' },
                        timestamp: { integerValue: '1792582964641' },
                        langTag: { stringValue: '中文' },
                    },
                },
            },
            {
                document: {
                    name: 'projects/test/databases/(default)/documents/diskusi_ai/d1',
                    fields: {
                        username: { stringValue: 'Spider AI' },
                        description: { stringValue: 'Diskusi data' },
                        message: { stringValue: 'Poin utama: margin turun 2,1 poin.' },
                        timestamp: { integerValue: '1792582974641' },
                        lang: { stringValue: 'id' },
                        langTag: { stringValue: 'ID' },
                        kind: { stringValue: 'answer' },
                        channel: { stringValue: '' },
                        room: { stringValue: 'diskusi' },
                    },
                },
            },
        ];
        const collectionPath = /\/(?:community_[a-z0-9_]+|diskusi_ai)\/?$/;
        const srv = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                const url = new URL(req.url, 'http://127.0.0.1');
                calls.push({ method: req.method, path: url.pathname, body });
                if (req.method === 'POST' && url.pathname.endsWith(':runQuery')) {
                    let collection = '';
                    try { collection = JSON.parse(body).structuredQuery.from[0].collectionId; } catch (e) { /* abaikan */ }
                    const rows = collection ? docs.filter((row) => String(row.document.name).includes(`/${collection}/`)) : docs;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(rows));
                    return;
                }
                if (req.method === 'POST' && collectionPath.test(url.pathname)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        name: 'projects/test/databases/(default)/documents/community_umum/doc-123',
                    }));
                    return;
                }
                if (req.method === 'GET' && collectionPath.test(url.pathname)) {
                    const collection = String(url.pathname).split('/').pop();
                    const rows = docs.filter((row) => String(row.document.name).includes(`/${collection}/`));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ documents: rows.map((row) => row.document) }));
                    return;
                }
                if (req.method === 'DELETE' && /\/(?:community_[a-z0-9_]+|diskusi_ai)\/[^/]+$/.test(url.pathname)) {
                    const id = String(url.pathname).split('/').pop();
                    const index = docs.findIndex((row) => String(row.document.name).endsWith(`/${id}`));
                    if (index >= 0) { docs.splice(index, 1); }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{}');
                    return;
                }
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'not found' } }));
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, calls, docs }));
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const lib = await loadLib();
    const tmp = path.join(root, '.tmp-check', `chat-log-${process.pid}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    lib.setChatLogFallback(tmp);

    console.log('\n[Firebase: pemetaan dokumen]');
    const doc = {
        name: 'projects/test/databases/(default)/documents/community_umum/a1',
        fields: {
            username: { stringValue: 'Rina Kusuma' },
            description: { stringValue: 'Kualitas data' },
            message: { stringValue: 'Halo dari Firebase' },
            timestamp: { integerValue: '1792582954641' },
            lang: { stringValue: 'id' },
            langTag: { stringValue: 'ID' },
            kind: { stringValue: 'chat' },
            channel: { stringValue: 'umum' },
        },
    };
    const mapped = lib.remoteFromDocument(doc, 'umum');
    ok(mapped && mapped.name === 'Rina Kusuma', 'nama terbaca dari field username');
    ok(mapped && mapped.text === 'Halo dari Firebase', 'isi terbaca dari field message');
    ok(mapped && mapped.at === 1792582954641, 'timestamp milidetik dipertahankan', String(mapped && mapped.at));
    ok(mapped && mapped.remote === true && mapped.channel === 'umum', 'ditandai remote + channel');
    const seconds = lib.remoteFromDocument({
        name: 'projects/test/databases/(default)/documents/community_umum/a2',
        fields: { username: { stringValue: 'X' }, message: { stringValue: 'detik' }, timestamp: { integerValue: '1792582954' } },
    }, 'umum');
    ok(seconds && seconds.at === 1792582954000, 'timestamp detik dikonversi ke milidetik', String(seconds && seconds.at));
    ok(lib.communityCollectionId('umum') === 'community_umum', 'koleksi ruang umum');
    ok(lib.communityCollectionId('ide & masukan') === 'community_ide_masukan', 'nama ruang disanitasi', lib.communityCollectionId('ide & masukan'));
    const fields = lib.remoteFields({ name: 'Rina', bio: 'analis', text: 'halo', channel: 'umum', at: 1792582954641, lang: 'id', langTag: 'ID' });
    ok(fields.username.stringValue === 'Rina' && fields.message.stringValue === 'halo', 'field tulis sesuai skema lama');
    ok(fields.timestamp.integerValue === '1792582954641', 'timestamp ditulis sebagai integerValue');
    ok(fields.channel.stringValue === 'umum' && fields.room.stringValue === 'komunitas', 'channel + room ikut ditulis');
    const diskusiFields = lib.remoteFields({ name: 'Spider AI', text: 'jawaban', room: 'diskusi', channel: 'umum', at: 1792582954641 });
    ok(diskusiFields.room.stringValue === 'diskusi' && diskusiFields.channel.stringValue === '', 'dokumen Diskusi AI memakai room diskusi tanpa kanal');
    ok(lib.discussionCollectionId() === 'diskusi_ai', 'koleksi Diskusi AI terpisah', lib.discussionCollectionId());

    console.log('\n[Firebase: baca & kirim lewat server tiruan]');
    const fake = await fakeFirestore();
    process.env.DATASKUNDER_FIRESTORE_BASE = `http://127.0.0.1:${fake.port}/v1/projects/test/databases/(default)/documents`;
    const listed = await lib.listCommunityMessages('umum', 40);
    ok(listed.messages.length === 2, 'dua dokumen terbaca', String(listed.messages.length));
    ok(listed.messages[0].name === 'Rina Kusuma' && listed.messages[1].name === 'Chen Wei 陈伟', 'urutan pesan sesuai waktu');
    ok(listed.collection === 'community_umum', 'nama koleksi dikembalikan');
    const queryCall = fake.calls.find((c) => c.path.endsWith(':runQuery'));
    ok(!!queryCall && /"limit":40/.test(queryCall.body), 'permintaan runQuery memuat limit');
    const sent = await lib.sendCommunityMessage({
        name: 'Rina', bio: 'analis', text: 'halo Firebase', channel: 'umum',
        at: 1792582954641, lang: 'id', langTag: 'ID', kind: 'chat',
    });
    ok(sent.id === 'doc-123' && sent.collection === 'community_umum', 'id dokumen hasil kirim terbaca', sent.id);
    const writeCall = fake.calls.find((c) => c.method === 'POST' && c.path.endsWith('/community_umum'));
    ok(!!writeCall && /"username":\{"stringValue":"Rina"\}/.test(writeCall.body), 'permintaan tulis memakai field username');
    ok(!!writeCall && /"message":\{"stringValue":"halo Firebase"\}/.test(writeCall.body), 'permintaan tulis memakai field message');
    const diskusiList = await lib.listDiscussionMessages(300);
    ok(diskusiList.messages.length === 1 && diskusiList.messages[0].room === 'diskusi', 'pesan Diskusi AI terbaca dari koleksinya', String(diskusiList.messages.length));
    ok(diskusiList.messages[0].channel === '' && diskusiList.messages[0].kind === 'answer', 'dokumen Diskusi AI tidak berkanal');
    ok(diskusiList.collection === 'diskusi_ai', 'koleksi Diskusi AI dikembalikan', diskusiList.collection);

    console.log('\n[Arsip data/data.txt]');
    lib.appendChatLog('komunitas', 'Rina Kusuma', 'Halo dunia', 'lokal · ID', 'KOMUNITAS #umum', new Date(2026, 9, 21, 10, 0, 0));
    lib.appendChatLog('diskusi', 'Spider AI', 'Poin utama: stok aman.\n• 12 SKU kritis.', undefined, undefined, new Date(2026, 9, 21, 10, 5, 0));
    lib.appendChatLog('komunitas', 'Maya', 'Pesan Firebase', 'firebase · EN', 'KOMUNITAS #bantuan', new Date(2026, 9, 21, 10, 6, 0));
    await lib.flushChatLog();
    const parsed = lib.parseChatLog(fs.readFileSync(lib.chatLogFile(), 'utf8'));
    ok(parsed.length === 3, 'tiga pesan terbaca kembali', String(parsed.length));
    ok(parsed[0].at === '2026-10-21 10:00:00', 'waktu asli dipakai saat menulis', parsed[0].at);
    ok(parsed[1].text.includes('• 12 SKU kritis.'), 'baris lanjutan tetap utuh');
    ok(parsed[2].channel === 'bantuan' && parsed[2].tag.includes('firebase'), 'label ruang + tag firebase terbaca');

    console.log('\n[API JSON lokal]');
    const api = new lib.ChatApiServer({ log: () => {} });
    const port = await api.start(0);
    const base = `http://127.0.0.1:${port}`;
    const allRes = await fetch(base + '/api/chat.json');
    const all = await allRes.json();
    ok(allRes.status === 200 && all.ok === true, 'GET /api/chat.json 200', String(allRes.status));
    ok(allRes.headers.get('access-control-allow-origin') === null, 'tanpa Origin tidak membuka CORS');
    const localCors = await fetch(base + '/api/chat.json', { headers: { Origin: 'http://localhost:3000' } });
    ok(localCors.headers.get('access-control-allow-origin') === 'http://localhost:3000', 'halaman lokal diizinkan CORS');
    const evilCors = await fetch(base + '/api/chat.json', { headers: { Origin: 'https://contoh-internet.test' } });
    ok(evilCors.headers.get('access-control-allow-origin') === null, 'situs internet tidak diizinkan CORS');
    ok(all.total === 3 && all.messages.length === 3, 'semua pesan tersaji', String(all.total));
    ok(all.messages.some((m) => m.room === 'komunitas') && all.messages.some((m) => m.room === 'diskusi'), 'ruang komunitas + diskusi tersaji', all.messages.map((m) => m.room).join(','));
    ok(all.messages.every((m, i, arr) => i === 0 || (arr[i - 1].timestamp || 0) <= (m.timestamp || 0)), 'pesan urut waktu');
    ok(all.messages.filter((m) => m.room === 'komunitas').every((m) => /firebase/i.test(m.tag)), 'komunitas dibaca dari Firebase');
    ok(typeof all.messages[0].timestamp === 'number' && !!all.messages[0].iso, 'timestamp + iso tersedia');

    const communityRes = await fetch(base + '/api/community.json?channel=umum&limit=1');
    const community = await communityRes.json();
    ok(community.total === 1 && community.messages[0].channel === 'umum', 'filter channel + limit bekerja', JSON.stringify(community.filter));
    const diskusi = await (await fetch(base + '/api/diskusi.json')).json();
    ok(diskusi.total === 1 && diskusi.messages[0].room === 'diskusi', 'ruang Diskusi AI terpisah (dari Firebase)');
    ok(diskusi.messages[0].text.startsWith('Poin utama'), 'isi Diskusi AI dari koleksi diskusi_ai', diskusi.messages[0].text);
    const rooms = await (await fetch(base + '/api/rooms.json')).json();
    ok(rooms.rooms.komunitas === 2 && rooms.rooms.diskusi === 1, 'ringkasan jumlah per ruang', JSON.stringify(rooms.rooms));
    ok(rooms.channels.some((c) => c.id === 'umum') && rooms.channels.some((c) => c.id === 'bantuan'), 'daftar channel tersedia');

    const health = await (await fetch(base + '/api/health.json')).json();
    ok(health.ok === true && health.source.file.endsWith(path.join('data', 'data.txt')), 'health memuat lokasi catatan');
    ok(health.firebase && health.firebase.enabled === true, 'health memuat status Firebase');
    const raw = await (await fetch(base + '/api/raw.txt')).text();
    ok(raw.includes('# Date Skunder') && raw.includes('Halo dunia'), 'raw.txt menyajikan isi asli');
    const download = await fetch(base + '/api/chat.json?download=1');
    ok(/attachment; filename="percakapan-semua-/.test(download.headers.get('content-disposition') || ''), 'download=1 memakai Content-Disposition');
    const missing = await fetch(base + '/api/tidak-ada');
    ok(missing.status === 404, 'endpoint tak dikenal → 404', String(missing.status));
    const page = await (await fetch(base + '/')).text();
    ok(/API JSON Percakapan/.test(page) && /\/api\/chat\.json/.test(page), 'halaman dokumentasi API tampil');

    process.env.DATASKUNDER_FIRESTORE_BASE = `http://127.0.0.1:${fake.port}/v1/projects/test/databases/(default)/documents`;
    const fb = await (await fetch(base + '/api/firebase.json?channel=umum')).json();
    ok(fb.total === 2 && fb.messages[0].remote === true, 'API meneruskan pesan Firebase', String(fb.total));

    const deleted = await lib.deleteAllCommunityMessages('umum');
    ok(deleted.deleted === 2 && deleted.failed === 0, 'semua pesan database dihapus', JSON.stringify(deleted));
    ok(fake.calls.filter((c) => c.method === 'DELETE').length === 2, 'dua permintaan DELETE dikirim', String(fake.calls.filter((c) => c.method === 'DELETE').length));
    delete process.env.DATASKUNDER_FIRESTORE_BASE;
    await api.stop();
    fake.srv.close();
    ok(!api.running, 'server API berhenti dengan rapi');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('Pemeriksaan gagal:', e);
    process.exit(1);
});
