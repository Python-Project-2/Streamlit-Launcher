/**
 * Pemeriksaan fitur “Compile MSI” (website → installer) tanpa VS Code:
 *
 *   npm run check:compile
 *
 *  1. Token & kuota: 5 compile per 5 jam, blokir token baru saat jeda, reset otomatis.
 *  2. Validasi form aplikasi (link, nama, pengembang, versi, folder, icon) + pembuatan aset.
 *  3. Sumber WiX: metadata produk, folder instalasi, shortcut, ikon ARP.
 *  4. Server token: halaman api/token.html, generate/status/info, 429 saat jeda, origin.
 *  5. Integrasi view + UI webview (jsdom).
 */
const fs = require('fs');
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
    const tmp = path.join(root, '.tmp-check');
    fs.mkdirSync(tmp, { recursive: true });
    const outfile = path.join(tmp, `compile-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { MsiTokens, newToken, canonicalToken, hashToken, maskToken, tokenId, normalizeRules, humanDuration, TOKEN_KEY, QUOTA_KEY } from './src/msiToken';",
                "export { TokenServer, DEFAULT_TOKEN_PORT } from './src/tokenServer';",
                "export {",
                "  WebsiteMsiBuilder, BUILD_STEPS, normalizeSpec, pngToIco, slug, msiVersion, stableGuid,",
                "  xmlEscape, asciiOnly, stripAnsi, formatDuration, launcherSource, internetShortcut,",
                "  buildWixSource, listAssets, prepareAssets, findWixTools, findCsc, csLiteral, WIX_DOWNLOAD_URL,",
                "} from './src/websiteMsi';",
                "export { registerCompileView } from './src/compileView';",
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

function memStore() {
    const map = new Map();
    return {
        map,
        get: (key, fallback) => (map.has(key) ? map.get(key) : fallback),
        update: (key, value) => {
            if (value === undefined) { map.delete(key); } else { map.set(key, value); }
        },
    };
}

/** PNG minimal (hanya header + IHDR) untuk menguji pembungkus ICO. */
function fakePng(width, height) {
    const buf = Buffer.alloc(33);
    buf.writeUInt32BE(0x89504E47, 0);
    buf.writeUInt32BE(0x0D0A1A0A, 4);
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 'ascii');
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    return buf;
}

(async () => {
    const lib = await loadLib();

    console.log('\n[Token & kuota]');
    const pattern = /^SLM(-[2-9A-HJ-NP-Z]{4}){3}$/;
    ok(pattern.test(lib.newToken()), 'bentuk token SLM-XXXX-XXXX-XXXX');
    ok(lib.canonicalToken(' slm-abcd-efgh-jklm ') === 'SLM-ABCD-EFGH-JKLM', 'token dirapikan');
    ok(lib.canonicalToken('SLM-ABCD-EFGH') === '', 'token kurang panjang ditolak');
    ok(lib.maskToken('SLM-ABCD-EFGH-JKLM') === 'SLM-ABCD-••••', 'token bisa ditampilkan tersamar');
    const rules = lib.normalizeRules({});
    ok(rules.attempts === 5, 'bawaan 5 compile', String(rules.attempts));
    ok(rules.cooldownHours === 5, 'bawaan jeda 5 jam', String(rules.cooldownHours));
    ok(lib.normalizeRules({ attempts: 99, cooldownHours: 99 }).attempts === 12, 'kuota dibatasi maksimal 12');
    ok(lib.normalizeRules({ cooldownHours: 0 }).cooldownHours === 1, 'jeda minimal 1 jam');
    ok(/4 jam 59 menit/.test(lib.humanDuration(5 * 3600000 - 60000)), 'durasi jeda diformat', lib.humanDuration(5 * 3600000 - 60000));

    let clock = Date.now();
    const store = memStore();
    const tokens = new lib.MsiTokens(store, () => ({ attempts: 5, minutes: 1440, cooldownHours: 5 }), () => clock);

    ok(tokens.quota().left === 5, 'kuota awal 5');
    const dibuat = tokens.generate();
    ok(dibuat.ok && dibuat.status.attemptsLeft === 5, 'token baru membawa 5 percobaan');
    ok(tokens.check(dibuat.token).valid, 'token baru sah');
    ok(Object.keys(store.map.get(lib.TOKEN_KEY)).every((k) => /^[0-9a-f]{64}$/.test(k)), 'penyimpanan hanya hash');
    ok(!JSON.stringify(store.map.get(lib.TOKEN_KEY)).includes(dibuat.token), 'teks token tidak disimpan');

    const pakai = [];
    for (let i = 0; i < 5; i += 1) { pakai.push(tokens.consume(dibuat.token)); }
    ok(pakai[0].ok && pakai[0].quota.left === 4, 'compile pertama memotong kuota');
    ok(pakai[3].quota.left === 1 && pakai[3].valid, 'compile ke-4 masih sah');
    ok(pakai[4].ok && pakai[4].quota.left === 0, 'compile ke-5 menghabiskan kuota');
    ok(pakai[4].reason === 'cooldown' && /5 jam/.test(pakai[4].message), 'pesan menyebut jeda 5 jam', pakai[4].message);
    ok(pakai[4].quota.blockedUntil > clock, 'waktu blokir tercatat');

    const pakai6 = tokens.consume(dibuat.token);
    ok(!pakai6.ok && pakai6.reason === 'cooldown', 'compile ke-6 ditolak saat jeda');
    ok(!tokens.check(dibuat.token).valid, 'token tidak sah selama jeda');

    const generateSaatJeda = tokens.generate();
    ok(!generateSaatJeda.ok, 'token baru tidak bisa dibuat selama jeda');
    ok(/Tunggu/i.test(generateSaatJeda.message), 'pesan generate menyebut waktu tunggu', generateSaatJeda.message);

    clock += 5 * 3600000 + 1000;
    const setelahJeda = tokens.quota();
    ok(setelahJeda.left === 5 && setelahJeda.retryAfterMs === 0, 'kuota reset otomatis setelah 5 jam', JSON.stringify(setelahJeda));
    const baru = tokens.generate();
    ok(baru.ok && baru.status.attemptsLeft === 5, 'token baru bisa dibuat setelah jeda');

    const salah = tokens.check('SLM-ZZZZ-ZZZZ-ZZZZ');
    ok(!salah.ok && salah.reason === 'unknown', 'token asing ditolak');
    ok(tokens.check('bukan-token').reason === 'format', 'teks bukan token ditolak');
    ok(tokens.quota().left === 5, 'salah ketik tidak memotong kuota');

    const habisToken = tokens.generate();
    for (let i = 0; i < 5; i += 1) { tokens.consume(habisToken.token); }
    clock += 5 * 3600000 + 1000;
    const sisaKuota = tokens.quota().left;
    ok(sisaKuota === 5, 'token lama tidak bisa melewati kuota setelah reset', String(sisaKuota));

    const kedaluwarsa = tokens.generate();
    clock += 25 * 3600000;
    ok(tokens.check(kedaluwarsa.token).reason === 'expired', 'token kedaluwarsa setelah 24 jam');

    const dibatalkan = tokens.generate();
    ok(tokens.revoke(dibatalkan.token) === true, 'token bisa dibatalkan');
    ok(tokens.check(dibatalkan.token).reason === 'unknown', 'token batal tidak dikenal');

    const persisten = new lib.MsiTokens(store, () => ({ attempts: 5, minutes: 1440, cooldownHours: 5 }), () => clock);
    const lain = tokens.generate();
    tokens.consume(lain.token);
    ok(persisten.check(lain.token).quota.left === 4, 'kuota tidak kembali setelah dibuat ulang', String(persisten.check(lain.token).quota.left));

    console.log('\n[Data aplikasi]');
    const specDasar = {
        url: 'https://contoh.com/aplikasi',
        name: 'Toko Online',
        publisher: 'PT Contoh',
        version: '2.3.1',
        description: 'Aplikasi toko',
        scope: 'user',
        width: 1400,
        height: 900,
    };
    const spec = lib.normalizeSpec(specDasar);
    ok(spec.url === specDasar.url && spec.name === 'Toko Online', 'data aplikasi diterima');
    ok(spec.folder === 'Toko Online', 'folder instalasi default = nama aplikasi');
    ok(spec.version === '2.3.1' && spec.scope === 'user', 'versi & scope terbaca');
    ok(spec.width === 1400 && spec.height === 900, 'ukuran jendela terbaca');
    ok(lib.normalizeSpec({ ...specDasar, folder: '..\\evil' }).folder === 'evil', 'folder instalasi tidak bisa keluar dari Program Files', lib.normalizeSpec({ ...specDasar, folder: '..\\evil' }).folder);
    ok(lib.normalizeSpec({ ...specDasar, folder: 'con' }).folder === '_con', 'nama perangkat Windows diamankan');

    const tolak = (patch, pola, label) => {
        try {
            lib.normalizeSpec({ ...specDasar, ...patch });
            ok(false, label, 'tidak melempar');
        } catch (e) {
            ok(pola.test(e.message), label, e.message);
        }
    };
    tolak({ url: '' }, /wajib diisi/i, 'link kosong ditolak');
    tolak({ url: 'contoh.com' }, /tidak valid/i, 'link tanpa http ditolak');
    tolak({ url: 'ftp://contoh.com' }, /http/i, 'protokol selain http ditolak');
    tolak({ name: '' }, /nama aplikasi/i, 'nama aplikasi kosong ditolak');
    tolak({ iconPath: path.join(root, 'tidak-ada.ico') }, /icon/i, 'icon hilang ditolak');
    tolak({ iconPath: path.join(root, 'README.md') }, /ico atau \.png/i, 'icon selain ico/png ditolak');

    const ico = lib.pngToIco(fakePng(120, 120));
    ok(ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 1, 'ICO berisi satu gambar');
    ok(ico.readUInt8(6) === 120 && ico.readUInt8(7) === 120, 'ukuran ICO mengikuti PNG', `${ico.readUInt8(6)}x${ico.readUInt8(7)}`);
    ok(ico.readUInt32LE(18) === 22, 'data PNG ditempel setelah header');
    let pngError = '';
    try { lib.pngToIco(Buffer.from('bukan png')); } catch (e) { pngError = e.message; }
    ok(/PNG tidak valid/i.test(pngError), 'PNG rusak ditolak', pngError);

    ok(lib.msiVersion('2.3.1-beta') === '2.3.1', 'versi MSI dibersihkan');
    ok(lib.msiVersion('3.1') === '3.1.0', 'versi dua angka dilengkapi');
    ok(lib.slug('Toko Online!') === 'toko-online', 'slug aman', lib.slug('Toko Online!'));
    ok(lib.stripAnsi('\u001b[31mmerah\u001b[0m') === 'merah', 'ANSI dibuang');
    ok(lib.asciiOnly('Toko — 中文') === 'Toko -', 'teks non-ASCII dibersihkan', lib.asciiOnly('Toko — 中文'));
    const guid = lib.stableGuid('toko/online');
    ok(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-8[0-9A-F]{3}-[0-9A-F]{12}$/.test(guid), 'GUID valid', guid);
    ok(guid === lib.stableGuid('toko/online'), 'GUID stabil');
    ok(lib.xmlEscape('<a "b">') === '&lt;a &quot;b&quot;&gt;', 'xmlEscape benar');
    ok(lib.BUILD_STEPS.length === 3, 'tiga langkah build');
    ok(typeof lib.findWixTools(path.join(root, '.tmp-check', 'tidak-ada')) === 'undefined', 'pencarian WiX tidak melempar');

    const launcher = lib.launcherSource(spec);
    ok(launcher.includes(spec.url) && launcher.includes('Toko Online'), 'launcher memuat link + nama');
    ok(launcher.includes('WinWidth = 1400') && launcher.includes('WinHeight = 900'), 'launcher memuat ukuran jendela');
    ok(launcher.includes('--app=') && launcher.includes('msedge.exe'), 'launcher memakai jendela aplikasi Edge');
    ok(lib.launcherSource({ ...spec, appMode: false }).includes('const bool AppMode = false'), 'mode browser biasa bisa dipilih');
    ok(lib.csLiteral('a"b\\c').startsWith('"a\\"b\\\\c"'), 'string C# di-escape', lib.csLiteral('a"b\\c'));
    ok(lib.internetShortcut(spec).includes(`URL=${spec.url}`), 'berkas .url memuat link');

    const assets = [
        { rel: 'app.ico', abs: 'x', size: 10 },
        { rel: 'app.exe', abs: 'x', size: 20 },
        { rel: 'Buka Website.url', abs: 'x', size: 5 },
    ];
    const wxs = lib.buildWixSource(spec, assets, { appFolder: 'assets' });
    ok(new RegExp(`<Product[^>]*Name="Toko Online"[^>]*Version="2\\.3\\.1"`).test(wxs), 'WiX memuat nama + versi');
    ok(/Manufacturer="PT Contoh"/.test(wxs), 'WiX memuat nama pengembang');
    ok(/LocalAppDataFolder/.test(wxs) && /ProgramsFolder/.test(wxs), 'pemasangan per pengguna');
    ok(/<Directory Id="INSTALLFOLDER" Name="Toko Online">/.test(wxs), 'folder instalasi memakai nama aplikasi');
    ok(/Shortcut Id="StartMenuShortcut"/.test(wxs) && /Shortcut Id="DesktopShortcut"/.test(wxs), 'shortcut Start Menu + Desktop');
    ok(/Icon Id="AppIcon"/.test(wxs) && /ARPPRODUCTICON/.test(wxs), 'icon produk terdaftar');
    ok(/ARPHELPLINK" Value="https:\/\/contoh\.com\/aplikasi"/.test(wxs), 'tentang aplikasi menunjuk ke website');
    ok((wxs.match(/<Component /g) || []).length === 4, 'tiga berkas + komponen shortcut');
    ok(/\$\(var\.SrcDir\)\\app\.exe/.test(wxs), 'sumber berkas memakai $(var.SrcDir)');
    const wxsMesin = lib.buildWixSource({ ...spec, scope: 'machine' }, assets, { appFolder: 'assets' });
    ok(/ProgramFiles64Folder/.test(wxsMesin) && /InstallScope="perMachine"/.test(wxsMesin), 'mode semua pengguna memakai Program Files');
    const wxsTanpaDesktop = lib.buildWixSource({ ...spec, desktopShortcut: false }, assets, { appFolder: 'assets' });
    ok(!/Shortcut Id="DesktopShortcut"/.test(wxsTanpaDesktop), 'shortcut desktop bisa dimatikan');

    console.log('\n[Aset installer]');
    const assetsDir = path.join(root, '.tmp-check', `aset-${process.pid}`);
    const acara = [];
    const siap = await lib.prepareAssets({
        spec: { ...spec, iconPath: '' },
        outDir: path.dirname(assetsDir),
        wixCacheDir: path.join(root, '.tmp-check', 'wix'),
        allowWixDownload: false,
        defaultIconPath: path.join(root, 'icon', 'logo.png'),
        timeoutMs: 120000,
    }, assetsDir, (e) => { if (e.type === 'line') { acara.push(e.text); } });
    ok(siap.icon, 'icon bawaan dikonversi ke ICO');
    ok(fs.existsSync(path.join(assetsDir, 'app.ico')), 'app.ico dibuat');
    ok(fs.existsSync(path.join(assetsDir, 'Buka Website.url')), 'berkas .url dibuat');
    ok(siap.files.some((f) => f.rel === 'app.ico'), 'aset terdaftar');
    const exeAda = fs.existsSync(path.join(assetsDir, 'app.exe'));
    ok(exeAda === siap.launcher, 'status launcher sesuai hasil kompilasi', String(exeAda));
    if (siap.launcher) {
        const ukuran = fs.statSync(path.join(assetsDir, 'app.exe')).size;
        ok(ukuran > 1024, 'app.exe launcher terbentuk', `${ukuran} byte`);
    }
    ok(acara.some((t) => /Icon/i.test(t)), 'log menyebut pemrosesan icon');
    fs.rmSync(assetsDir, { recursive: true, force: true });

    console.log('\n[Server token]');
    let serverClock = Date.now();
    const serverTokens = new lib.MsiTokens(memStore(), () => ({ attempts: 5, minutes: 1440, cooldownHours: 5 }), () => serverClock);
    const server = new lib.TokenServer({ apiRoot: path.join(root, 'api'), tokens: serverTokens, product: 'Date Skunder', version: '2.9.8', log: () => undefined });
    const port = await server.start(0);
    const base = `http://127.0.0.1:${port}`;

    const halaman = await fetch(`${base}/token.html`);
    const html = await halaman.text();
    ok(halaman.status === 200, 'token.html disajikan');
    ok(/Generate token/.test(html) && /5 jam/.test(html), 'website memuat aturan 5 jam');
    ok(halaman.headers.get('access-control-allow-origin') === '*', 'CORS terbuka');
    ok(halaman.headers.get('access-control-allow-private-network') === 'true', 'izin Private Network ada');

    const info = await (await fetch(`${base}/api/token/info`)).json();
    ok(info.ok && info.quota.left === 5 && info.cooldownHours === 5, 'info memuat kuota awal');
    ok(Array.isArray(info.tokens), 'info memuat daftar token');

    const dibuatWeb = await (await fetch(`${base}/api/token/generate`, { method: 'POST', body: '{}' })).json();
    ok(dibuatWeb.ok && /^SLM-/.test(dibuatWeb.token), 'generate mengembalikan token');
    ok(dibuatWeb.status.quota.left === 5, 'token baru membawa kuota penuh');

    const statusWeb = await (await fetch(`${base}/api/token/status`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: dibuatWeb.token }),
    })).json();
    ok(statusWeb.status.valid && statusWeb.status.quota.left === 5, 'status token sah');

    for (let i = 0; i < 5; i += 1) { serverTokens.consume(dibuatWeb.token); }
    const infoJeda = await (await fetch(`${base}/api/token/info`)).json();
    ok(infoJeda.quota.left === 0 && infoJeda.quota.blockedUntil > Date.now(), 'info menunjukkan jeda aktif');

    const generate429 = await fetch(`${base}/api/token/generate`, { method: 'POST', body: '{}' });
    const isi429 = await generate429.json();
    ok(generate429.status === 429 && isi429.ok === false, 'generate saat jeda dijawab 429', String(generate429.status));
    ok(isi429.quota && isi429.quota.left === 0, '429 memuat kuota tersisa');

    const originAsing = await fetch(`${base}/api/token/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://situs-asing.example' },
        body: '{}',
    });
    ok(originAsing.status === 403, 'origin asing ditolak');
    const originLokal = await fetch(`${base}/api/token/info`, { headers: { origin: 'null' } });
    ok(originLokal.status === 200, 'origin null (berkas lokal) diterima');

    const takAda = await fetch(`${base}/file-tidak-ada.html`);
    ok(takAda.status === 404, 'berkas tak dikenal 404');
    const traversal = await fetch(`${base}/..%2Fpackage.json`);
    ok(traversal.status === 403 || traversal.status === 404, 'path traversal ditolak');
    await server.stop();
    ok(!server.running, 'server bisa dihentikan');

    console.log('\n[Build MSI gagal-awal]');
    const builder = new lib.WebsiteMsiBuilder();
    const peristiwa = [];
    const gagal = await builder.run({
        spec: { ...specDasar, url: '' },
        outDir: path.join(root, '.tmp-check', `msi-${process.pid}`),
        wixCacheDir: path.join(root, '.tmp-check', 'wix'),
        allowWixDownload: false,
        defaultIconPath: path.join(root, 'icon', 'logo.png'),
        timeoutMs: 5000,
    }, (e) => peristiwa.push(e));
    ok(!gagal.ok && /link website/i.test(gagal.message), 'data tidak lengkap ditolak di preflight', gagal.message);
    ok(peristiwa.some((e) => e.type === 'step' && e.id === 'preflight' && e.state === 'fail'), 'langkah preflight gagal');
    ok(peristiwa.some((e) => e.type === 'done' && e.ok === false), 'event done dikirim');
    ok(builder.cancel() === false, 'cancel saat diam = false');

    console.log('\n[Integrasi view]');
    const vscodeStub = require(path.join(__dirname, 'vscode-stub.cjs'));
    globalThis.__SK_CONFIG__ = globalThis.__SK_CONFIG__ || {};
    globalThis.__SK_CONFIG__['compile.tokenPort'] = 47839;
    const storage = path.join(root, '.tmp-check', `storage-${process.pid}`);
    const reg = lib.registerCompileView({
        extensionUri: vscodeStub.Uri.file(root),
        globalStorageUri: vscodeStub.Uri.file(storage),
        globalState: memStore(),
        secrets: {
            nilai: new Map(),
            get: async function (k) { return this.nilai.get(k); },
            store: async function (k, v) { this.nilai.set(k, v); },
            delete: async function (k) { this.nilai.delete(k); },
        },
        subscriptions: [],
    });
    const perintah = Object.keys(globalThis.__SK_COMMANDS__ || {}).filter((c) => c.startsWith('date-skunder.compile.'));
    ok(perintah.length >= 4, 'perintah Compile MSI terdaftar', perintah.join(', '));
    ok(typeof reg.provider.startBuild === 'function' && typeof reg.provider.openWebsite === 'function', 'provider punya aksi build + website');
    let siapServer = false;
    for (let i = 0; i < 40 && !siapServer; i += 1) {
        if (reg.server.running) { siapServer = true; break; }
        await new Promise((r) => setTimeout(r, 100));
    }
    ok(siapServer, 'server token menyala bersama view');
    const halamanAsli = await fetch(reg.server.website);
    ok(halamanAsli.status === 200, 'website token bisa dibuka dari server view');
    await reg.server.stop();
    fs.rmSync(storage, { recursive: true, force: true });

    console.log('\n[UI Compile MSI (jsdom)]');
    const { JSDOM } = require('jsdom');
    const html2 = `<!DOCTYPE html><html><body>
        <div id="cp-note" hidden></div>
        <span id="cp-state"></span>
        <input id="cp-url" type="text">
        <input id="cp-name" type="text">
        <input id="cp-publisher" type="text">
        <input id="cp-version" type="text">
        <input id="cp-folder" type="text">
        <input id="cp-desc" type="text">
        <select id="cp-scope"><option value="user">user</option><option value="machine">machine</option></select>
        <input id="cp-width" type="number">
        <input id="cp-height" type="number">
        <input id="cp-appmode" type="checkbox">
        <input id="cp-desktop" type="checkbox">
        <img id="cp-icon-preview" hidden>
        <div id="cp-icon-name"></div>
        <button id="cp-icon-pick"></button>
        <button id="cp-icon-clear"></button>
        <input id="cp-token" type="text">
        <span id="cp-dots"></span>
        <span id="cp-token-note"></span>
        <div id="cp-cooldown" hidden></div>
        <div id="cp-plan"></div>
        <div id="cp-steps"></div>
        <div id="cp-bar"></div>
        <pre id="cp-term"></pre>
        <span id="cp-term-state"></span>
        <input id="cp-cmd" type="text">
        <button id="cp-run"></button>
        <button id="cp-stop"></button>
        <button id="cp-verify"></button>
        <button id="cp-site"></button>
        <button id="cp-result"></button>
        <button id="cp-term-open"></button>
        <button id="cp-clear"></button>
        <button id="cp-copy"></button>
        <button id="cp-revoke"></button>
    </body></html>`;
    const dom = new JSDOM(html2, { runScripts: 'outside-only', url: 'https://example.test' });
    const posted = [];
    dom.window.acquireVsCodeApi = () => ({ postMessage: (m) => posted.push(m), setState() { }, getState() { } });
    dom.window.eval(fs.readFileSync(path.join(root, 'media', 'compile.js'), 'utf8'));
    const doc = dom.window.document;
    const kirim = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const pesan = (data) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data }));

    ok(posted[0] && posted[0].type === 'ready', 'webview mengirim ready');

    const langkah = lib.BUILD_STEPS.map((s, i) => ({ ...s, state: i === 0 ? 'ok' : (i === 1 ? 'start' : 'pending') }));
    const kuotaPenuh = { limit: 5, used: 0, left: 5, blockedUntil: 0, retryAfterMs: 0, cooldownMs: 18000000 };
    pesan({
        type: 'compileState',
        running: false,
        steps: langkah,
        attempts: 5,
        cooldownHours: 5,
        quota: kuotaPenuh,
        spec: {
            url: 'https://contoh.com', name: 'Toko Online', publisher: 'PT Contoh', version: '2.3.1',
            folder: 'Toko Online', description: '', scope: 'user', width: 1400, height: 900,
            appMode: true, desktopShortcut: true,
        },
        plan: { outDir: 'C:/proyek/build/msi' },
        server: { running: true, port: 47833 },
        lines: [{ text: 'pemanasan', kind: 'info' }],
    });
    ok(doc.getElementById('cp-url').value === 'https://contoh.com', 'link terisi dari state');
    ok(doc.getElementById('cp-name').value === 'Toko Online', 'nama aplikasi terisi');
    ok(doc.getElementById('cp-publisher').value === 'PT Contoh', 'pengembang terisi');
    ok(doc.getElementById('cp-version').value === '2.3.1', 'versi terisi');
    ok(doc.getElementById('cp-width').value === '1400' && doc.getElementById('cp-height').value === '900', 'ukuran jendela terisi');
    ok(doc.querySelectorAll('#cp-steps .cp-step').length === 3, 'tiga langkah tampil');
    ok(/pemanasan/.test(doc.getElementById('cp-term').textContent), 'log awal dipulihkan');
    ok(doc.querySelectorAll('#cp-dots .cp-dot.on').length === 5, 'lima titik kuota menyala');

    pesan({
        type: 'compileToken',
        token: 'SLM-ABCD-EFGH-JKLM',
        status: { ok: true, valid: true, reason: 'ok', attemptsLeft: 5, total: 5, expiresAt: Date.now() + 3600000, quota: kuotaPenuh, message: 'ok' },
        attempts: 5,
        cooldownHours: 5,
    });
    ok(doc.getElementById('cp-token').value === 'SLM-ABCD-EFGH-JKLM', 'token tampil di kolom');
    ok(/Token sah/.test(doc.getElementById('cp-token-note').textContent), 'catatan token tampil');

    kirim(doc.getElementById('cp-run'));
    const dikirim = posted[posted.length - 1];
    ok(dikirim.type === 'compile', 'tombol Compile mengirim compile');
    ok(dikirim.token === 'SLM-ABCD-EFGH-JKLM', 'token ikut dikirim');
    ok(dikirim.spec && dikirim.spec.url === 'https://contoh.com' && dikirim.spec.name === 'Toko Online', 'data aplikasi ikut dikirim', JSON.stringify(dikirim.spec));
    ok(dikirim.spec.scope === 'user' && dikirim.spec.appMode === true, 'scope & mode aplikasi ikut');

    pesan({ type: 'compileBusy', running: true });
    ok(doc.getElementById('cp-run').disabled && !doc.getElementById('cp-stop').disabled, 'saat build: Compile mati, Stop hidup');
    kirim(doc.getElementById('cp-stop'));
    ok(posted[posted.length - 1].type === 'cancel', 'tombol Stop mengirim cancel');

    pesan({ type: 'compileLog', lines: [{ text: '> candle.exe', kind: 'cmd' }, { text: 'gagal kecil', kind: 'err' }] });
    ok(/candle\.exe/.test(doc.getElementById('cp-term').textContent), 'log masuk terminal');
    ok(doc.querySelector('#cp-term .cp-line.err') !== null, 'baris error diberi kelas');

    pesan({ type: 'compileProgress', pct: 66 });
    ok(doc.getElementById('cp-bar').style.width === '66%', 'progres tampil');

    pesan({ type: 'compileIcon', path: 'C:/icon/toko.png', name: 'toko.png', size: 4096, dataUrl: 'data:image/png;base64,AAA' });
    ok(/toko\.png/.test(doc.getElementById('cp-icon-name').textContent), 'nama icon tampil');
    ok(!doc.getElementById('cp-icon-preview').hidden, 'pratinjau icon tampil');

    pesan({ type: 'compileFocus', kind: 'url' });
    ok(doc.activeElement === doc.getElementById('cp-url'), 'fokus pindah ke link');
    pesan({ type: 'compileField', field: 'url', value: 'https://baru.example' });
    ok(doc.getElementById('cp-url').value === 'https://baru.example', 'perintah url mengisi kolom');

    const kuotaJeda = { limit: 5, used: 5, left: 0, blockedUntil: Date.now() + 5 * 3600000, retryAfterMs: 5 * 3600000, cooldownMs: 18000000 };
    pesan({ type: 'compileToken', token: 'SLM-ABCD-EFGH-JKLM', status: { ok: false, valid: false, reason: 'cooldown', attemptsLeft: 0, total: 5, expiresAt: 0, quota: kuotaJeda, message: 'Kuota habis' }, attempts: 5, cooldownHours: 5 });
    ok(doc.getElementById('cp-run').disabled, 'compile dinonaktifkan saat jeda');
    // Detik pertama bisa masih 5:00:00 bila timer belum sempat berdetak (mis. saat seluruh suite dijalankan).
    ok(!doc.getElementById('cp-cooldown').hidden && /(4:59|5:00:00)/.test(doc.getElementById('cp-cooldown').textContent), 'hitung mundur jeda tampil', doc.getElementById('cp-cooldown').textContent);
    ok(doc.querySelectorAll('#cp-dots .cp-dot.on').length === 0, 'titik kuota habis');

    const cmd = doc.getElementById('cp-cmd');
    cmd.value = 'status';
    cmd.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok(posted[posted.length - 1].type === 'command' && posted[posted.length - 1].line === 'status', 'perintah terminal dikirim');

    pesan({ type: 'compileClear' });
    ok(doc.getElementById('cp-term').childElementCount === 0, 'bersihkan terminal');

    pesan({ type: 'compileDone', ok: true, message: 'Installer siap: toko-online-2.3.1.msi', artifacts: { folder: 'C:/proyek/build/msi' }, ms: 8000 });
    ok(!doc.getElementById('cp-note').hidden && /Installer siap/.test(doc.getElementById('cp-note').textContent), 'hasil akhir diberitahukan');
    dom.window.close();

    console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('Pemeriksaan gagal:', e);
    process.exit(1);
});
