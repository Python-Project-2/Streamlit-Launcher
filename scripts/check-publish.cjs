/**
 * Pemeriksaan fitur Publish + catatan obrolan lokal, tanpa VS Code:
 *
 *   npm run check:publish
 *
 *  1. Validasi artikel (judul, ringkasan, isi, tautan tujuan, sampul) & pesan galat akun.
 *  2. Bentuk field artikel yang dikirim ke database.
 *  3. `data/data.txt`: pesan ditulis, dibaca kembali utuh (termasuk baris lanjutan), lalu
 *     diekspor sebagai JSON — tidak ada pesan yang hilang.
 *  4. View Publish: HTML memuat publish.css, publish.js berjalan di jsdom, halaman artikel
 *     tampil gaya ensiklopedia (judul, infobox, sampul, tautan tujuan).
 *  5. Tampilan Publish terdaftar di sidebar tepat di bawah Pet Skin, dan tidak ada nama
 *     penyedia database di teks yang dilihat pengguna.
 */
const fs = require('fs');
const http = require('http');
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

async function loadLib() {
    const outDir = path.join(root, '.tmp-check');
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `publish-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { PublishViewProvider, validateArticle, articleFields, authErrorMessage, isHttpUrl, databaseStatusMessage, firestoreErrorInfo, networkMessage } from './src/publishView';",
                "export { setChatLogFallback, appendChatLog, flushChatLog, readChatLogEntries, chatLogJson, chatLogFile } from './src/chatLog';",
                "export { databaseKey, databaseProjectId, DEFAULT_DATABASE_KEY } from './src/community';",
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

/** Folder sementara untuk catatan obrolan (dipakai bersama melalui stub). */
function tempWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-chat-'));
    const folders = vscode.workspace.workspaceFolders;
    folders.length = 0;
    folders.push({ uri: vscode.Uri.file(dir), name: 'tmp', index: 0 });
    return dir;
}

function resetWorkspace() {
    vscode.workspace.workspaceFolders.length = 0;
}

async function checkChatLog(lib) {
    console.log('\n[Catatan obrolan data/data.txt]');
    const dir = tempWorkspace();
    lib.setChatLogFallback(undefined);

    lib.appendChatLog('komunitas', 'Rina Kusuma', 'stok kritis 12 SKU di gudang Bandung.', 'lokal · ID', 'KOMUNITAS #umum');
    lib.appendChatLog('diskusi', 'Spider AI', 'Poin utama: margin turun.\n\n    • Angka: 12,4%\n    • Aksi: audit harga', 'jawaban');
    lib.appendChatLog('komunitas', 'Chen Wei', 'Halo, saya cek ulang datanya.', 'lokal · ZH', 'KOMUNITAS #bantuan');
    await lib.flushChatLog();

    const file = lib.chatLogFile();
    ok(file === path.join(dir, 'data', 'data.txt'), 'lokasi catatan = data/data.txt', file);
    ok(fs.existsSync(file), 'berkas catatan dibuat otomatis');

    const raw = fs.readFileSync(file, 'utf8');
    ok(/# Date Skunder/.test(raw), 'kepala format tertulis');

    const entries = await lib.readChatLogEntries();
    ok(entries.length === 3, 'seluruh pesan terbaca kembali', String(entries.length));
    ok(entries[1].text.includes('Angka: 12,4%'), 'baris lanjutan pesan digabung utuh', JSON.stringify(entries[1]?.text));
    ok(entries[1].text.split('\n').length >= 4, 'jeda paragraf tidak hilang');
    ok(entries[0].room === 'komunitas' && entries[0].channel === 'umum', 'ruang komunitas + kanal terbaca');
    ok(entries[2].channel === 'bantuan', 'kanal kedua terbaca');

    const doc = await lib.chatLogJson();
    ok(doc.total === 3 && doc.messages.length === 3, 'JSON unduhan memuat semua pesan', String(doc.total));
    ok(doc.messages[0].name === 'Rina Kusuma', 'nama penulis ikut di JSON');
    ok(doc.messages[1].kind === 'answer', 'jenis jawaban dikenali dari tag');
    ok(doc.rooms.diskusi === 1 && doc.rooms.komunitas === 2, 'ringkasan per ruang benar', JSON.stringify(doc.rooms));
    ok(doc.messages.every((m) => m.at && m.timestamp > 0), 'setiap pesan punya waktu & timestamp');

    // Berkas yang tumbuh (sesi berikutnya) tetap terbaca penuh setelah "refresh".
    lib.appendChatLog('komunitas', 'Yuki Tanaka', 'Catatan baru setelah view dimuat ulang.', 'lokal · JA', 'KOMUNITAS #ide');
    await lib.flushChatLog();
    const after = await lib.readChatLogEntries();
    ok(after.length === 4, 'pesan baru ikut terbaca tanpa menghapus yang lama', String(after.length));
    ok(after[0].text === entries[0].text, 'pesan lama tetap utuh setelah berkas bertambah');

    resetWorkspace();
    fs.rmSync(dir, { recursive: true, force: true });
}

function checkValidation(lib) {
    console.log('\n[Validasi artikel]');
    const good = {
        title: 'Analisis Kualitas Data Supermarket',
        lead: 'Ringkasan pembuka yang menjelaskan isi artikel dan mengapa penting.',
        body: 'Paragraf pertama.\n\nParagraf kedua.',
        link: 'https://contoh.com/artikel',
        cover: 'https://contoh.com/sampul.jpg',
        authorName: 'Rina',
    };
    ok(lib.validateArticle(good) === undefined, 'artikel lengkap lolos validasi', lib.validateArticle(good));
    ok(/Judul/.test(lib.validateArticle({ ...good, title: 'ab' })), 'judul terlalu pendek ditolak');
    ok(/Ringkasan/.test(lib.validateArticle({ ...good, lead: 'pendek' })), 'ringkasan terlalu pendek ditolak');
    ok(/Tautan tujuan wajib/.test(lib.validateArticle({ ...good, link: '' })), 'tautan tujuan wajib');
    ok(/Tautan tujuan harus/.test(lib.validateArticle({ ...good, link: 'contoh.com' })), 'tautan tujuan harus http(s)');
    ok(/Tautan sampul/.test(lib.validateArticle({ ...good, cover: 'gambar.jpg' })), 'sampul harus tautan web');
    ok(/Isi artikel maksimal/.test(lib.validateArticle({ ...good, body: 'x'.repeat(12001) })), 'isi dibatasi 12.000 karakter');
    ok(lib.isHttpUrl('https://a.id/b') && !lib.isHttpUrl('javascript:alert(1)'), 'hanya http/https yang sah');

    // Session akun: articleFields hanya membaca email + localId.
    const session = { email: 'rina@contoh.com', localId: 'uid1', expiresAt: 0 };
    const fields = lib.articleFields(good, session);
    ok(fields.title.stringValue.startsWith('Analisis'), 'judul dikirim sebagai stringValue');
    ok(fields.link.stringValue === good.link && fields.cover.stringValue === good.cover, 'tautan tujuan & sampul ikut dikirim');
    ok(fields.authorEmail.stringValue === 'rina@contoh.com', 'email penulis ikut dikirim');
    ok(typeof fields.createdAt.integerValue === 'string', 'waktu terbit dikirim sebagai integerValue');

    console.log('\n[Pesan akun database]');
    ok(/sudah terdaftar/.test(lib.authErrorMessage('EMAIL_EXISTS')), 'EMAIL_EXISTS → arahkan ke tab Masuk');
    ok(/belum terdaftar/.test(lib.authErrorMessage('EMAIL_NOT_FOUND')), 'EMAIL_NOT_FOUND → arahkan ke tab Daftar');
    ok(/salah/.test(lib.authErrorMessage('INVALID_LOGIN_CREDENTIALS')), 'kredensial salah dijelaskan');
    ok(/belum diaktifkan/.test(lib.authErrorMessage('OPERATION_NOT_ALLOWED')), 'masuk email belum aktif dijelaskan');

    // Pesan galat yang dipetakan tidak boleh membawa nama penyedia database.
    const kode = ['EMAIL_EXISTS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'WEAK_PASSWORD', 'TOO_MANY_ATTEMPTS_TRY_LATER', 'USER_DISABLED'];
    const pesanGalat = kode.map((k) => lib.authErrorMessage(k, 'Error (auth/network-request-failed).')).join(' | ');
    ok(!/firebase|firestore/i.test(pesanGalat), 'nama penyedia tidak muncul di pesan galat akun', pesanGalat.slice(0, 120));
    ok(new Set(kode.map((k) => lib.authErrorMessage(k))).size >= 6, 'setiap kode galat punya kalimat berbeda');

    console.log('\n[Status koneksi database]');
    const denied = [{ error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } }];
    ok(lib.firestoreErrorInfo(denied).code === 'PERMISSION_DENIED', 'galat berbentuk array terbaca', JSON.stringify(lib.firestoreErrorInfo(denied)));
    ok(lib.firestoreErrorInfo(denied).status === 403, 'kode HTTP dari array terbaca');
    ok(/Masuk dulu/.test(lib.databaseStatusMessage(403, denied, false)), 'tanpa sesi → arahkan masuk', lib.databaseStatusMessage(403, denied, false));
    ok(/aturan koleksi/.test(lib.databaseStatusMessage(403, denied, true)), 'dengan sesi → jelaskan aturan koleksi');
    ok(!/Gagal menghubungi database/.test(lib.databaseStatusMessage(403, denied, false)), 'tidak ada pesan generik untuk 403');
    ok(/masuk lagi/i.test(lib.databaseStatusMessage(401, { error: { message: 'UNAUTHENTICATED' } }, true)), '401 → sesi berakhir');
    ok(/Kunci database/.test(lib.databaseStatusMessage(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, true)), 'kunci tidak valid dijelaskan');
    ok(/Kuota/.test(lib.databaseStatusMessage(429, {}, true)), 'kuota penuh dijelaskan');
    ok(/internet/i.test(lib.networkMessage({ code: 'ENOTFOUND' })), 'galat jaringan dijelaskan', lib.networkMessage({ code: 'ENOTFOUND' }));
    ok(/403/.test(lib.authErrorMessage('HTTP 403')) && !/Gagal menghubungi database\.$/.test(lib.authErrorMessage('HTTP 403')), 'HTTP 403 tidak lagi jatuh ke pesan generik', lib.authErrorMessage('HTTP 403'));
}

/** Webview tiruan untuk memanggil provider.html(). */
function fakeWebview() {
    return { cspSource: 'vscode-resource:', asWebviewUri: (u) => u };
}

function checkViewHtml(lib) {
    console.log('\n[View Publish]');
    const ctx = {
        extensionUri: vscode.Uri.file(root),
        globalState: { get: () => undefined, update: async () => undefined },
        secrets: {
            get: async () => undefined,
            store: async () => undefined,
            delete: async () => undefined,
        },
    };
    const provider = new lib.PublishViewProvider(ctx);
    const html = provider.html(fakeWebview());
    ok(/publish\.css/.test(html), 'HTML memuat publish.css');
    ok(/publish\.js/.test(html), 'HTML memuat publish.js');
    ok(/img-src [^;]*https:/.test(html), 'sampul dari tautan web diizinkan CSP');
    ok(!/connect-src/.test(html), 'webview tidak menghubungi jaringan sendiri');
    ok(/id="pub-db"/.test(html), 'baris status koneksi database tampil');
    ok(/Uji koneksi/.test(html), 'tombol uji koneksi database tampil');
    ok(fs.existsSync(path.join(root, 'media', 'publish.css')), 'berkas media/publish.css ada');

    const css = fs.readFileSync(path.join(root, 'media', 'publish.css'), 'utf8');
    ['pub-infobox', 'pub-art-head', 'pub-lead', 'pub-card', 'pub-auth', 'pub-preview', 'pub-db'].forEach((cls) => {
        ok(css.includes(`.${cls}`), `gaya .${cls} tersedia`);
    });
    return html;
}

async function checkRender(html) {
    console.log('\n[Render halaman artikel]');
    const posted = [];
    // publish.js dimuat sebagai skrip sebaris: jsdom tidak mengambil berkas dari disk.
    const script = fs.readFileSync(path.join(root, 'media', 'publish.js'), 'utf8');
    const inline = html.replace(
        /<script nonce="[^"]*" src="[^"]*publish\.js"><\/script>/,
        () => `<script>${script}</script>`,
    );
    ok(inline !== html, 'publish.js disisipkan untuk pengujian');

    const dom = new JSDOM(inline, {
        runScripts: 'dangerously',
        url: 'https://example.test/',
        beforeParse(window) {
            window.acquireVsCodeApi = () => ({
                postMessage: (m) => posted.push(m),
                getState: () => ({}),
                setState: () => undefined,
            });
        },
    });
    const { window } = dom;
    ok(posted.some((m) => m.type === 'ready'), 'publish.js siap dan minta status', JSON.stringify(posted));

    const article = {
        id: 'art-1',
        title: 'Analisis Kualitas Data Supermarket',
        lead: 'Data supermarket diperiksa dari 1000 baris dan tujuh kolom.',
        body: 'Paragraf pertama isi artikel.\n\nParagraf kedua berisi tindakan lanjutan.',
        link: 'https://contoh.com/sumber-lengkap',
        cover: 'https://contoh.com/sampul.jpg',
        authorName: 'Rina Kusuma',
        authorEmail: 'rina@contoh.com',
        authorUid: 'uid-1',
        createdAt: Date.now(),
    };
    window.postMessage({
        type: 'publishState',
        signedIn: true,
        email: 'rina@contoh.com',
        localId: 'uid-1',
        articles: [article],
        draft: null,
    }, '*');
    // jsdom mengirim event “message” pada tugas berikutnya; tunggu satu putaran.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const doc = window.document;
    ok(doc.getElementById('pub-auth').hidden === true, 'form masuk disembunyikan setelah login');
    ok(doc.querySelector('#pub-who-email').textContent === 'rina@contoh.com', 'email penulis tampil di kepala');
    ok(/1 artikel/.test(doc.getElementById('pub-count').textContent), 'jumlah artikel tampil', doc.getElementById('pub-count').textContent);

    // Buka artikel dari daftar.
    const card = doc.querySelector('[data-open="art-1"]');
    ok(!!card, 'kartu artikel muncul di daftar');
    card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    const art = doc.getElementById('pub-article');
    ok(art.hidden === false, 'halaman artikel terbuka');
    ok(art.querySelector('h1').textContent === article.title, 'judul artikel tampil sebagai h1');
    ok(!!art.querySelector('.pub-infobox'), 'infobox gaya ensiklopedia tampil');
    ok(art.querySelector('.pub-infobox img[data-cover]').getAttribute('src') === article.cover, 'sampul dari tautan web tampil');
    ok(/sumber-lengkap/.test(art.querySelector('.pub-source a').getAttribute('href')), 'tautan tujuan tampil di akhir artikel');
    ok(art.querySelectorAll('.pub-art-body p').length >= 3, 'paragraf pembuka & isi terpisah');
    ok(/Rina Kusuma/.test(art.querySelector('.pub-byline').textContent), 'nama penulis tampil di byline');
    ok(/Diterbitkan/.test(art.querySelector('.pub-infobox-table').textContent), 'infobox memuat tanggal terbit');

    // Pratinjau saat menulis.
    const titleEl = doc.getElementById('pub-title');
    titleEl.value = 'Judul Pratinjau';
    titleEl.dispatchEvent(new window.Event('input', { bubbles: true }));
    ok(/Judul Pratinjau/.test(doc.getElementById('pub-preview').textContent), 'pratinjau ikut berubah saat menulis');

    // Status koneksi database: aturan ditolak → online → uji koneksi → offline (tanpa pesan di formulir).
    window.postMessage({ type: 'publishDb', db: { state: 'rules', ok: false, message: 'Database menolak akun ini.', projectId: 'demo', collection: 'articles', signedIn: true, at: Date.now() } }, '*');
    await new Promise((resolve) => setTimeout(resolve, 10));
    ok(doc.getElementById('pub-db').dataset.state === 'rules', 'status database: akses ditolak tampil');
    ok(/akses ditolak/i.test(doc.getElementById('pub-db-text').textContent), 'teks akses ditolak tampil', doc.getElementById('pub-db-text').textContent);

    window.postMessage({ type: 'publishDb', db: { state: 'online', ok: true, message: 'Database terhubung.', projectId: 'demo', collection: 'articles', signedIn: true, at: Date.now() } }, '*');
    await new Promise((resolve) => setTimeout(resolve, 10));
    ok(doc.getElementById('pub-db').dataset.state === 'online', 'status database: terhubung tampil');
    ok(/terhubung/i.test(doc.getElementById('pub-db-text').textContent), 'teks terhubung tampil');

    posted.length = 0;
    doc.getElementById('pub-db-check').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    ok(posted.some((m) => m.type === 'checkDatabase'), 'tombol uji koneksi meminta status');
    ok(doc.getElementById('pub-db').dataset.state === 'checking', 'status memeriksa saat uji koneksi');

    window.postMessage({ type: 'publishArticles', articles: [article], offline: true, needsAuth: false, message: 'Tidak bisa menjangkau database.', signedIn: true, db: { state: 'offline', ok: false, message: 'Tidak bisa menjangkau database.', projectId: 'demo', collection: 'articles', signedIn: true, at: Date.now() } }, '*');
    await new Promise((resolve) => setTimeout(resolve, 10));
    ok(doc.getElementById('pub-msg').hidden === true, 'galat koneksi tidak menumpuk di formulir');
    ok(/cadangan lokal/.test(doc.getElementById('pub-count').textContent), 'jumlah artikel menjelaskan cadangan', doc.getElementById('pub-count').textContent);

    // Gagal terbit tanpa isi: pesan kesalahan tampil, tidak ada pesan publish terkirim.
    posted.length = 0;
    doc.getElementById('pub-publish').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    ok(!posted.some((m) => m.type === 'publish'), 'artikel tidak dikirim bila belum lengkap');
    ok(doc.getElementById('pub-msg').hidden === false, 'pesan kesalahan validasi tampil');

    dom.window.close();
}

function checkWiring() {
    console.log('\n[Pendaftaran view & penamaan]');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const views = pkg.contributes.views.dateSkunderAi.map((v) => v.id);
    ok(views.includes('dateSkunder.publishView'), 'view Publish terdaftar di sidebar');
    ok(views.indexOf('dateSkunder.publishView') > views.indexOf('dateSkunder.petView'), 'Publish berada di bawah Pet Skin', views.join(' > '));
    ok(pkg.activationEvents.includes('onView:dateSkunder.publishView'), 'aktivasi saat view Publish dibuka');
    ok(pkg.contributes.commands.some((c) => c.command === 'date-skunder.publish.open'), 'perintah buka Publish tersedia');
    ok(pkg.contributes.menus.commandPalette.some((c) => c.command === 'date-skunder.publish.open'), 'perintah Publish muncul di command palette');
    ok(pkg.contributes.commands.some((c) => c.command === 'date-skunder.community.apiTerminal'), 'perintah terminal API JSON tersedia');
    ok('dateSkunder.community.apiTerminal' in pkg.contributes.configuration.properties, 'pengaturan terminal API JSON tersedia');

    const ext = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
    ok(/registerPublishView\(context\)/.test(ext), 'registerPublishView dipanggil saat activate');
    ok(/attachApiTerminal/.test(ext) && /ChatApiTerminal/.test(ext), 'terminal API JSON terhubung ke view Community');

    const props = pkg.contributes.configuration.properties;
    ok('dateSkunder.publish.project' in props && 'dateSkunder.publish.webKey' in props, 'pengaturan database Publish tersedia');
    ok(props['dateSkunder.community.webKey'].default === '', 'kunci bawaan tidak tertimpa placeholder');

    const visible = [
        JSON.stringify(props['dateSkunder.publish.project']),
        JSON.stringify(props['dateSkunder.publish.webKey']),
        fs.readFileSync(path.join(root, 'media', 'publish.js'), 'utf8'),
        fs.readFileSync(path.join(root, 'media', 'publish.css'), 'utf8'),
    ].join('\n');
    ok(!/firebase|firestore/i.test(visible), 'nama penyedia database tidak muncul di teks Publish');
    const communityUi = fs.readFileSync(path.join(root, 'media', 'community.js'), 'utf8');
    ok(/database/.test(communityUi) && /cw-json-fb/.test(communityUi), 'ruang Komunitas menampilkan status database + tombol JSON database');
}


/**
 * Status database + simpan artikel saat aturan koleksi utama menolak akun.
 * Server tiruan: `articles` selalu 403, `community_artikel` menerima â€” persis seperti
 * keadaan database yang membuat status berbunyi "akses ditolak" tanpa jalan keluar.
 */
async function checkDatabaseFallback(lib) {
    console.log('\n[Koleksi artikel cadangan]');
    const calls = [];
    let mode = 'fallback';
    const deny = { error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } };
    const server = http.createServer((req, res) => {
        const pathname = String(req.url || '').split('?')[0];
        calls.push(`${req.method} ${pathname}`);
        const send = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        const cadangan = pathname.startsWith('/community_artikel');
        if (mode === 'deny-all' || !cadangan) { send(403, deny); return; }
        if (req.method === 'DELETE') { send(200, {}); return; }
        if (req.method === 'POST') {
            send(200, { name: 'projects/p/databases/(default)/documents/community_artikel/art-9' });
            return;
        }
        send(200, {
            documents: [{
                name: 'projects/p/databases/(default)/documents/community_artikel/art-9',
                fields: {
                    title: { stringValue: 'Judul Uji' },
                    lead: { stringValue: 'Ringkasan uji yang cukup panjang.' },
                    createdAt: { integerValue: '1700000000000' },
                    authorName: { stringValue: 'Rina' },
                },
            }],
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const previous = process.env.DATASKUNDER_FIRESTORE_BASE;
    process.env.DATASKUNDER_FIRESTORE_BASE = base;

    const makeProvider = () => {
        const store = new Map();
        const session = { idToken: 'tok', refreshToken: 'ref', email: 'rina@contoh.com', localId: 'uid-1', expiresAt: Date.now() + 3600000 };
        return new lib.PublishViewProvider({
            extensionUri: vscode.Uri.file(root),
            globalState: { get: (k, d) => (store.has(k) ? store.get(k) : d), update: async (k, v) => { store.set(k, v); } },
            secrets: {
                get: async () => JSON.stringify(session),
                store: async () => undefined,
                delete: async () => undefined,
            },
        });
    };

    try {
        const provider = makeProvider();
        const db = await provider.checkDatabase();
        ok(db.state === 'online', 'status tetap terhubung walau "articles" menolak akun', JSON.stringify(db));
        ok(db.collection === 'community_artikel', 'koleksi cadangan dipakai otomatis', db.collection);
        ok(calls[0] === 'GET /articles', 'koleksi utama tetap dicoba lebih dulu', calls.join(' | '));
        ok(/community_artikel/.test(db.message), 'pesan status menyebut koleksi yang dipakai', db.message);

        calls.length = 0;
        const ulang = await provider.checkDatabase();
        ok(ulang.collection === 'community_artikel' && calls.length === 1 && calls[0] === 'GET /community_artikel',
            'koleksi cadangan langsung dipakai pada pemeriksaan berikutnya', calls.join(' | '));

        const artikel = await provider.publish({
            title: 'Judul Uji',
            lead: 'Ringkasan uji yang cukup panjang.',
            body: 'Isi artikel uji.',
            link: 'https://contoh.com/artikel',
            cover: '',
            authorName: 'Rina',
        });
        ok(artikel.id === 'art-9', 'artikel tersimpan di database', artikel.id);
        ok(calls.some((c) => c === 'POST /community_artikel'), 'artikel dikirim ke koleksi cadangan', calls.join(' | '));

        const daftar = await provider.listArticles();
        ok(daftar.articles.length === 1 && daftar.articles[0].title === 'Judul Uji', 'daftar artikel terbaca dari koleksi cadangan', JSON.stringify(daftar.articles.map((a) => a.title)));
        ok(daftar.db.collection === 'community_artikel' && daftar.db.state === 'online', 'status daftar artikel memakai koleksi cadangan');

        calls.length = 0;
        try {
            await provider.deleteArticle('art-9');
            ok(calls.some((c) => c === 'DELETE /community_artikel/art-9'), 'hapus artikel memakai koleksi cadangan', calls.join(' | '));
        } catch (e) {
            ok(false, 'hapus artikel memakai koleksi cadangan', e && e.message);
        }

        // Semua koleksi menolak: status kembali "akses ditolak" dengan pesan aturan yang jelas.
        mode = 'deny-all';
        const ditolak = await makeProvider().checkDatabase();
        ok(ditolak.state === 'rules', 'semua koleksi menolak -> status akses ditolak', JSON.stringify(ditolak));
        ok(/aturan koleksi/.test(ditolak.message), 'pesan menyarankan memeriksa aturan koleksi', ditolak.message);
        ok(/community_artikel/.test(ditolak.message), 'pesan menyebut koleksi cadangan', ditolak.message);
    } finally {
        if (previous === undefined) { delete process.env.DATASKUNDER_FIRESTORE_BASE; }
        else { process.env.DATASKUNDER_FIRESTORE_BASE = previous; }
        await new Promise((resolve) => server.close(resolve));
    }
}

(async () => {
    const lib = await loadLib();
    console.log('[Kunci database]');
    ok(lib.databaseKey() === lib.DEFAULT_DATABASE_KEY, 'kunci bawaan dipakai saat pengaturan kosong', lib.databaseKey().slice(0, 6));
    ok(lib.databaseProjectId() === 'streamlit-launcher-vscode', 'proyek database bawaan dipakai');

    checkValidation(lib);
    await checkDatabaseFallback(lib);
    await checkChatLog(lib);
    const html = checkViewHtml(lib);
    await checkRender(html);
    checkWiring();

    console.log(`\n${pass} ok, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
