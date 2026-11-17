/*
 * Uji regresi “MetaTrader AI”.
 *
 * Cakupan:
 *  • view metaTrader terdaftar terpisah setelah TradingView + perintah + pengaturan,
 *  • otak LLM sendiri (port 8147, prompt JSON ketat, dedupe, model sendiri),
 *  • validasi entry (anti-halusinasi): HOLD, keyakinan, R:R, SL, tren, lot risiko,
 *  • klien jembatan HTTP (token, health, simbol, order, close),
 *  • jembatan Python benar-benar berjalan (mode simulasi) & bisa order/close,
 *  • UI view (HTML + media/mt-view.js) menerima quote/plan/posisi dan mengirim aksi.
 *
 * Jalankan: npm run check:mt
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const fails = [];
const ok = [];
function check(name, cond, extra) {
    if (cond) { ok.push(name); return; }
    fails.push(name + (extra ? ' — ' + extra : ''));
}
function eq(name, actual, expected) {
    check(name, actual === expected, 'dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
}

// ── 0. validasi rencana & brief ──────────────────────────────────────────────
const built = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/mtTrade.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const tradeMod = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(tradeMod, tradeMod.exports, require);
const T = tradeMod.exports;

const symbol = {
    name: 'EURUSD', bid: 1.08490, ask: 1.08500, spread: 12, digits: 5, point: 0.00001,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, contractSize: 100000, tradeAllowed: true, time: 1763000000,
};
const account = { equity: 10000, balance: 10000, currency: 'USD', leverage: 100 };
const baseCtx = { symbol, account, atr: 0.0012, ema20: 1.0860, ema50: 1.0830, rsi: 58 };
const risk = { riskPercent: 1, minRR: 1.5, maxLot: 1, minConfidence: 65 };

const good = T.validatePlan({ action: 'BUY', slDistance: 0.0012, tpDistance: 0.0024, confidence: 75, reason: 'EMA searah', risk: 'batalkan di bawah SL' }, baseCtx, risk);
check('rencana BUY yang sehat lolos', good.ok, JSON.stringify(good.reasons));
eq('entry memakai ask nyata', good.entry, 1.08500);
eq('SL di bawah entry', Number(good.sl.toFixed(5)), 1.08380);
eq('TP di atas entry', Number(good.tp.toFixed(5)), 1.08740);
check('lot dihitung dari risiko 1%', Math.abs(good.lot - 0.83) < 0.02, String(good.lot));
check('risiko uang <= 1% ekuitas', good.riskMoney <= 100.5 && good.riskMoney > 90, String(good.riskMoney));
eq('R:R sesuai jarak', good.rr, 2);

const hold = T.validatePlan({ action: 'HOLD', slDistance: 0.001, tpDistance: 0.002, confidence: 90 }, baseCtx, risk);
check('HOLD selalu ditolak', !hold.ok && /HOLD/.test(hold.reasons.join(' ')), JSON.stringify(hold.reasons));
check('keyakinan rendah ditolak', !T.validatePlan({ action: 'BUY', slDistance: 0.0012, tpDistance: 0.0024, confidence: 50 }, baseCtx, risk).ok);
check('R:R kurang ditolak', !T.validatePlan({ action: 'BUY', slDistance: 0.0012, tpDistance: 0.0014, confidence: 80 }, baseCtx, risk).ok);
check('SL terlalu dekat ditolak', !T.validatePlan({ action: 'BUY', slDistance: 0.00005, tpDistance: 0.0001, confidence: 80 }, baseCtx, risk).ok);
check('SL terlalu lebar ditolak', !T.validatePlan({ action: 'BUY', slDistance: 0.02, tpDistance: 0.05, confidence: 80 }, baseCtx, risk).ok);
check('BUY saat EMA20 < EMA50 ditolak', !T.validatePlan(
    { action: 'BUY', slDistance: 0.0012, tpDistance: 0.0024, confidence: 80 },
    { ...baseCtx, ema20: 1.0800, ema50: 1.0850 }, risk,
).ok);
check('RSI overbought menolak BUY', !T.validatePlan(
    { action: 'BUY', slDistance: 0.0012, tpDistance: 0.0024, confidence: 80 },
    { ...baseCtx, rsi: 85 }, risk,
).ok);
check('modal kecil → lot minimum ditolak', !T.validatePlan(
    { action: 'BUY', slDistance: 0.0012, tpDistance: 0.0024, confidence: 80 },
    { ...baseCtx, account: { equity: 50, currency: 'USD' } }, risk,
).ok);
check('simbol tidak bisa ditradingkan ditolak', !T.validatePlan(
    { action: 'BUY', slDistance: 0.0012, tpDistance: 0.0024, confidence: 80 },
    { ...baseCtx, symbol: { ...symbol, tradeAllowed: false } }, risk,
).ok);

// ── 0d. mesin setup host: LLM hanya bias, level dari ATR + struktur ─────────
function ramp(start, step, count, vol) {
    const out = [];
    let price = start;
    for (let i = 0; i < count; i += 1) {
        const o = price;
        price += step + Math.sin(i / 7) * vol * 0.4;
        const c = price;
        out.push({ t: 1763000000 + i * 900, o, h: Math.max(o, c) + vol * 0.3, l: Math.min(o, c) - vol * 0.3, c, v: 100 });
    }
    return out;
}

const btcBars = ramp(63200, 45, 80, 260);
const btcSymbol = {
    name: 'BTCUSD', bid: 64717.43, ask: 64717.93, spread: 50, digits: 2, point: 0.01,
    minLot: 0.01, maxLot: 5, lotStep: 0.01, contractSize: 1, tradeAllowed: true, time: 1763000000, stopsLevel: 30,
};
const btcCtx = {
    symbol: btcSymbol,
    account: { equity: 124550.94, balance: 124550.94, currency: 'USD', leverage: 2000000000 },
    atr: 450, ema20: 64600, ema50: 64100, rsi: 61,
};
const junkModel = { action: 'HOLD', slDistance: 0, tpDistance: 128521654.93, confidence: 72, reason: 'ragu', risk: '-' };
const setup = T.buildSetup({ ctx: btcCtx, cfg: risk, bars: btcBars, model: junkModel });
check('model HOLD + angka ngawur tetap menghasilkan entry host', setup.action === 'BUY' && setup.blockers.length === 0, JSON.stringify(setup.blockers));
const hostPlan = T.validatePlan(setup.plan, btcCtx, risk);
check('setup host lolos validasi risiko', hostPlan.ok, JSON.stringify(hostPlan.reasons));
check('TP wajar (bukan 128 juta)', hostPlan.tp > hostPlan.entry && hostPlan.tp < hostPlan.entry * 1.2, String(hostPlan.tp));
check('R:R setup host minimal 1.5', hostPlan.rr >= 1.5, String(hostPlan.rr));
check('lot dari risiko bukan 0', hostPlan.lot > 0 && hostPlan.riskPct <= 1.01, JSON.stringify({ lot: hostPlan.lot, pct: hostPlan.riskPct }));
check('SL di balik swing, bukan sama dengan entry', hostPlan.sl < hostPlan.entry - 100 * btcSymbol.point, String(hostPlan.sl));

const flatSetup = T.buildSetup({ ctx: { ...btcCtx, ema20: 64700, ema50: 64702, rsi: 50 }, cfg: risk, bars: ramp(64700, 0, 80, 200) });
check('pasar datar tetap HOLD (tidak ngacok)', flatSetup.action === 'HOLD' && flatSetup.blockers.length > 0, JSON.stringify(flatSetup.blockers));

check('stops level broker menaikkan SL minimum', !T.validatePlan(
    { action: 'BUY', slDistance: 0.0002, tpDistance: 0.0004, confidence: 80 },
    { ...baseCtx, symbol: { ...symbol, stopsLevel: 60 } }, risk,
).ok);

const smallEquity = T.validatePlan(
    { action: 'BUY', slDistance: 0.0005, tpDistance: 0.001, confidence: 80 },
    { ...baseCtx, account: { equity: 30, currency: 'USD' } }, risk,
);
check('modal kecil: lot minimum dipakai bila risiko masih wajar', smallEquity.ok && smallEquity.lot === 0.01, JSON.stringify({ lot: smallEquity.lot, reasons: smallEquity.reasons }));

const brief = T.buildMtBrief({
    symbol, bars: Array.from({ length: 60 }, (_, i) => ({
        t: 1763000000 + i * 900, o: 1.08 + i * 0.0001, h: 1.081 + i * 0.0001,
        l: 1.0795 + i * 0.0001, c: 1.0805 + i * 0.0001, v: 100 + i,
    })),
    timeframe: 'M15', atr: 0.0012, ema20: 1.086, ema50: 1.083, rsi: 58, account, mode: 'sim',
});
check('brief memuat bid/ask/ATR/akun', /Bid/.test(brief) && /Ask/.test(brief) && /ATR\(14\)/.test(brief) && /ekuitas/.test(brief));
check('brief menegaskan angka dari terminal', /berasal langsung dari terminal/i.test(brief));

// ── 0b. pencocokan simbol antar-broker (ETHUSD → ETHUSDm) ────────────────────
const symBuilt = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/mtSymbols.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const symMod = { exports: {} };
new Function('module', 'exports', 'require', symBuilt.outputFiles[0].text)(symMod, symMod.exports, require);
const S = symMod.exports;

const brokerCatalog = [
    { name: 'EURUSDm', base: 'EURUSD', group: 'Forex', visible: false, tradeAllowed: true },
    { name: 'ETHUSDm', base: 'ETHUSD', group: 'Crypto', visible: true, tradeAllowed: true },
    { name: 'XAUUSDm', base: 'XAUUSD', group: 'Metals', visible: true, tradeAllowed: true },
    { name: 'BTCUSDm', base: 'BTCUSD', group: 'Crypto', visible: true, tradeAllowed: true },
    { name: 'EURUSD.raw', base: 'EURUSD', group: 'Forex', visible: true, tradeAllowed: true },
    { name: 'US30.cash', base: 'US30', group: 'Indices', visible: true, tradeAllowed: true },
    { name: 'USDJPYm', base: 'USDJPY', group: 'Forex', visible: true, tradeAllowed: true },
];

['ETHUSDm', 'ETHUSD.raw', 'ETHUSD_i', 'ETHUSD#', 'XAUUSDc', 'US30.cash', 'EURUSD', 'BTCUSDm'].forEach((raw) => {
    const base = S.symbolBase(raw);
    check(`base ${raw} → ${base}`, base === 'ETHUSD' || base === 'XAUUSD' || base === 'US30' || base === 'EURUSD' || base === 'BTCUSD', base);
});
eq('USDT tidak dipotong jadi USD', S.symbolBase('BTCUSDT'), 'BTCUSDT');
eq('ETHUSDm → ETHUSD', S.symbolBase('ETHUSDm'), 'ETHUSD');
eq('XAUUSDc → XAUUSD', S.symbolBase('XAUUSDc'), 'XAUUSD');
eq('US30.cash → US30', S.symbolBase('US30.cash'), 'US30');
eq('EURUSD.raw → EURUSD', S.symbolBase('EURUSD.raw'), 'EURUSD');
eq('grup dari path', S.symbolGroup('Crypto\\Major'), 'Crypto');

const pickEth = S.pickSymbol(brokerCatalog, 'ETHUSD');
eq('ETHUSD menemukan nama broker ETHUSDm', pickEth && pickEth.name, 'ETHUSDm');
const pickEur = S.pickSymbol(brokerCatalog, 'EURUSD');
check('EURUSD memilih kandidat terlihat lebih dulu', pickEur && pickEur.name === 'EURUSD.raw', pickEur && pickEur.name);
check('simbol tidak dikenal tidak dipaksakan', S.pickSymbol(brokerCatalog, 'ZZZUSD') === undefined);
const favs = S.popularSymbols(brokerCatalog, ['ETHUSD', 'XAUUSD', 'ZZZUSD']);
check('favorit hanya yang ada di broker', favs.length === 2 && favs[0].name === 'ETHUSDm' && favs[1].name === 'XAUUSDm', JSON.stringify(favs.map((f) => f.name)));
eq('preset bawaan dipakai bila kosong', S.parsePresets('').length > 4, true);
check('preset kustom dipakai bila diisi', S.parsePresets('ethusd, xauusd').join(',') === 'ETHUSD,XAUUSD');

// ── 0c. niat entry dari chat (LLM) ─────────────────────────────────────
check('perintah entry dikenali', T.mtEntryIntent('beli ETHUSDm sekarang') && T.mtEntryIntent('entry sekarang') && T.mtEntryIntent('open posisi XAUUSD'));
check('pertanyaan biasa bukan entry', !T.mtEntryIntent('kenapa tadi ditolak?') && !T.mtEntryIntent('jelaskan risiko lot 0.1') && !T.mtEntryIntent('setup ini aman?'));

// ── 1. otak LLM MetaTrader (statis) ─────────────────────────────────────────
const ai = fs.readFileSync(path.join(root, 'src/mtAi.ts'), 'utf8');
check('MetaTrader punya llama-server sendiri', /new LlamaServer\(/.test(ai) && /mtAi\.port', 8147/.test(ai));
check('output channel & terminal sendiri', /createOutputChannel\('Date Skunder MetaTrader AI'\)/.test(ai) && /name: 'MetaTrader AI'/.test(ai) && /name: 'MetaTrader LLAMA Server'/.test(ai));
check('prompt rencana JSON ketat', /slDistance/.test(ai) && /tpDistance/.test(ai) && /Balas HANYA satu objek JSON/.test(ai));
check('entry bukan wewenang model', /TIDAK menentukan harga entry/.test(ai));
check('anti-halusinasi & tanpa janji menang', /Jangan mengarang harga/.test(ai) && /pasti menang/.test(ai));
check('JSON diperbaiki & divalidasi ulang', /extractJsonObject/.test(ai) && /parsePlan/.test(ai) && /dedupeReply/.test(ai));
check('pemilihan model sendiri', /dateSkunder\.mtModel/.test(ai) && /mtAi\.modelPath/.test(ai));

// ── 2. klien jembatan HTTP ──────────────────────────────────────────────────
const bridgeBuilt = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/mtBridge.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const bridgeMod = { exports: {} };
new Function('module', 'exports', 'require', bridgeBuilt.outputFiles[0].text)(bridgeMod, bridgeMod.exports, require);
const { MtBridge } = bridgeMod.exports;

function startMock() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                const send = (obj, status = 200) => {
                    const raw = JSON.stringify(obj);
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(raw);
                };
                if (req.headers['x-bridge-token'] !== 'tok') { return send({ ok: false, error: 'token tidak valid' }, 401); }
                if (req.url.startsWith('/health')) { return send({ ok: true, mode: 'sim', platform: 'mt5', connected: true, account: { equity: 10000, currency: 'USD' } }); }
                if (req.url.startsWith('/symbol')) { return send({ ok: true, symbol }); }
                if (req.url.startsWith('/rates')) { return send({ ok: true, bars: [] }); }
                if (req.url.startsWith('/positions')) { return send({ ok: true, positions: [] }); }
                if (req.url.startsWith('/login')) { return send({ ok: true, account: { login: 123, currency: 'USD', server: 'Demo' }, mode: 'live' }); }
                if (req.url.startsWith('/order')) { return send({ ok: true, ticket: 1, price: 1.085, retcode: 10009, message: 'done' }); }
                if (req.url.startsWith('/close')) { return send({ ok: true, ticket: 1, retcode: 10009, message: 'closed' }); }
                return send({ ok: false, error: 'tidak dikenal' }, 404);
            });
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

(async () => {
    const mock = await startMock();
    const client = new MtBridge(mock.port, 'tok');
    const health = await client.health();
    eq('klien membaca health', health.mode, 'sim');
    const sym = await client.symbol('EURUSD');
    eq('klien membaca simbol', sym.name, 'EURUSD');
    const order = await client.order({ symbol: 'EURUSD', side: 'buy', lot: 0.1 });
    check('klien mengirim order', order.ok && order.ticket === 1);
    const acc = await client.login({ login: 123, password: 'x', server: 'Demo' });
    check('klien login akun nyata', acc.login === 123 && acc.server === 'Demo');
    check('token salah ditolak', await clientWithWrongToken(mock.port));
    mock.server.close();

    // ── 3. view HTML + media/mt-view.js ────────────────────────────────────
    const viewTs = fs.readFileSync(path.join(root, 'src/mtView.ts'), 'utf8');
    const start = viewTs.indexOf('<body class="mt-body">');
    const end = viewTs.indexOf('</body>', start);
    check('HTML view MetaTrader ada', start > 0 && end > start);
    const bodyHtml = viewTs.slice(start, end).replace(/<script[\s\S]*?<\/script>/g, '');
    const dom = new JSDOM('<!doctype html><html><body>' + bodyHtml.slice('<body class="mt-body">'.length) + '</body></html>', {
        runScripts: 'outside-only', url: 'https://skunder.test/',
    });
    const w = dom.window;
    const posts = [];
    w.acquireVsCodeApi = () => ({ postMessage: (m) => posts.push(m), getState: () => ({}), setState: () => { } });
    // JSDOM tidak punya canvas 2D; chart diuji lewat keberadaan elemen & tidak error.
    if (w.HTMLCanvasElement) { w.HTMLCanvasElement.prototype.getContext = function () { return null; }; }
    w.eval(fs.readFileSync(path.join(root, 'media/mt-view.js'), 'utf8'));
    const doc = w.document;
    check('view mengirim ready', posts.some((p) => p.type === 'ready'), JSON.stringify(posts.slice(0, 2)));
    const send = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));

    send({ type: 'init', symbol: 'XAUUSD', timeframe: 'M15', settings: { riskPercent: 1, minRR: 1.5, minConfidence: 65, autoTrade: false, platform: 'mt5', mode: 'auto' }, ai: { state: 'stopped', port: 8147, model: 'qwen.gguf', ready: false, models: [{ path: 'D:/m/qwen.gguf', name: 'qwen.gguf', size: '4 GB' }] } });
    eq('simbol dari init tampil', doc.getElementById('mt-symbol').value, 'XAUUSD');
    check('daftar model tampil', doc.getElementById('mt-model').options.length === 1 && doc.getElementById('mt-model').value === 'D:/m/qwen.gguf', doc.getElementById('mt-model').innerHTML);
    check('risiko & syarat tampil di catatan', /Risiko 1,0%/.test(doc.getElementById('mt-analyze-note').textContent), doc.getElementById('mt-analyze-note').textContent);

    send({ type: 'bridge', state: 'connected', health: { mode: 'sim', account: { login: 1, currency: 'USD', balance: 10000, equity: 10050, freeMargin: 9000, leverage: 100, name: 'Demo' } }, target: '127.0.0.1:8770' });
    check('status bridge tersambung', /tersambung/.test(doc.getElementById('mt-bridge').textContent) && /SIM/.test(doc.getElementById('mt-mode').textContent), doc.getElementById('mt-bridge').textContent);
    check('akun tampil', /10\.050/.test(doc.getElementById('mt-account').textContent), doc.getElementById('mt-account').textContent);

    check('tombol Auto & info HP ada', !!doc.getElementById('mt-auto') && !!doc.getElementById('mt-remote'));
    check('form akun nyata ada', !!doc.getElementById('mt-server') && !!doc.getElementById('mt-login') && !!doc.getElementById('mt-password') && !!doc.getElementById('mt-login-btn'));
    check('chart canvas ada', !!doc.getElementById('mt-chart'));
    check('tombol cari terminal MT5 ada', !!doc.getElementById('mt-find-terminal'));

    // ── dropdown simbol akun/broker (dipakai dari HP) ───────────────────────
    const sel = doc.getElementById('mt-symbol');
    check('kontrol simbol berupa dropdown', sel && sel.tagName === 'SELECT', sel && sel.tagName);
    posts.length = 0;
    send({
        type: 'catalog',
        symbols: [
            { n: 'ETHUSDm', b: 'ETHUSD', g: 'Crypto', d: 2 },
            { n: 'XAUUSDm', b: 'XAUUSD', g: 'Metals', d: 2 },
            { n: 'EURUSDm', b: 'EURUSD', g: 'Forex', d: 5 },
        ],
        favorites: ['ETHUSDm', 'XAUUSDm'],
        active: 'XAUUSDm',
        count: 3,
    });
    const optionValues = Array.from(sel.options).map((o) => o.value);
    check('dropdown berisi nama asli broker', optionValues.indexOf('ETHUSDm') >= 0 && optionValues.indexOf('EURUSDm') >= 0, optionValues.join(','));
    eq('simbol aktif terpilih dari katalog', sel.value, 'XAUUSDm');
    check('jumlah simbol & asal-broker tampil', /3 simbol/.test(doc.getElementById('mt-symbol-count').textContent), doc.getElementById('mt-symbol-count').textContent);
    check('label ETHUSDm menjelaskan ETHUSD', /ETHUSDm · ETHUSD/.test(sel.innerHTML), sel.innerHTML.slice(0, 160));
    posts.length = 0;
    sel.value = 'ETHUSDm';
    sel.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('pilih dropdown mengirim simbol broker', posts.some((p) => p.type === 'symbol' && p.symbol === 'ETHUSDm'), JSON.stringify(posts));

    // Pencarian simbol menyaring daftar (dipakai di HP karena daftar broker panjang).
    const search = doc.getElementById('mt-symbol-search');
    search.value = 'eth';
    search.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 220));
    const filtered = Array.from(sel.options).map((o) => o.value);
    check('pencarian menyaring dropdown', filtered.indexOf('ETHUSDm') >= 0 && filtered.indexOf('EURUSDm') < 0, filtered.join(','));
    check('info pencarian tampil', /cocok/i.test(doc.getElementById('mt-symbol-info').textContent), doc.getElementById('mt-symbol-info').textContent);
    posts.length = 0;
    doc.getElementById('mt-symbol-scan').click();
    check('tombol ⟳ Simbol meminta katalog ulang', posts.some((p) => p.type === 'catalog'), JSON.stringify(posts));
    posts.length = 0;
    doc.getElementById('mt-find-terminal').click();
    check('tombol cari terminal meminta daftar', posts.some((p) => p.type === 'findTerminals'), JSON.stringify(posts));
    doc.getElementById('mt-server').value = 'MetaQuotes-Demo';
    doc.getElementById('mt-login').value = '123456';
    doc.getElementById('mt-password').value = 'rahasia';
    posts.length = 0;
    doc.getElementById('mt-login-btn').click();
    check('login mengirim kredensial', posts.some((p) => p.type === 'login' && p.server === 'MetaQuotes-Demo' && p.login === 123456 && p.password === 'rahasia'), JSON.stringify(posts));
    posts.length = 0;
    doc.getElementById('mt-auto').click();
    check('tombol Auto mengirim auto on', posts.some((p) => p.type === 'auto' && p.on === true), JSON.stringify(posts));
    send({ type: 'auto', on: true, settings: { riskPercent: 1, minRR: 1.5, minConfidence: 65, autoPilot: true, autoScanSeconds: 60, platform: 'mt5', mode: 'auto' } });
    check('status Auto ON tampil', /ON/.test(doc.getElementById('mt-auto').textContent), doc.getElementById('mt-auto').textContent);
    send({ type: 'bridge', state: 'connected', target: '0.0.0.0:8770', remote: { url: 'http://192.168.1.4:8770', token: 'sk-uji' }, health: { mode: 'sim', account: { login: 1, currency: 'USD', balance: 10000, equity: 10000, freeMargin: 9000, leverage: 100, name: 'Demo' } } });
    check('info akses HP tampil', /192\.168\.1\.4/.test(doc.getElementById('mt-remote').textContent) && /sk-uji/.test(doc.getElementById('mt-remote').textContent), doc.getElementById('mt-remote').textContent);
    posts.length = 0;
    doc.querySelector('#mt-remote button').click();
    check('tombol salin info HP', posts.some((p) => p.type === 'copyRemote'), JSON.stringify(posts));

    send({ type: 'market', symbol: 'XAUUSD', timeframe: 'M15', quote: { name: 'XAUUSD', bid: 2350.1, ask: 2350.5, spread: 40, digits: 2, point: 0.01, minLot: 0.01, maxLot: 100, lotStep: 0.01, contractSize: 100, tradeAllowed: true, time: 1 }, atr: 3.2, ema20: 2352, ema50: 2344, rsi: 57.3, bars: 320 });
    check('quote bid/ask tampil', /2350\.10/.test(doc.getElementById('mt-quote').textContent) && /2350\.50/.test(doc.getElementById('mt-quote').textContent), doc.getElementById('mt-quote').textContent);
    check('indikator tampil', /ATR/.test(doc.getElementById('mt-ind').textContent) && /57,3/.test(doc.getElementById('mt-ind').textContent));

    const plan = { ok: true, action: 'BUY', entry: 2350.5, sl: 2347.3, tp: 2356.9, lot: 0.31, rr: 2, riskMoney: 99.2, riskPct: 0.99, confidence: 74, slDistance: 3.2, tpDistance: 6.4, reason: 'EMA20 di atas EMA50, RSI sehat.', risk: 'Batalkan bila tutup di bawah SL.', reasons: [] };
    send({ type: 'plan', plan });
    check('kartu rencana terbuka', doc.getElementById('mt-plan-card').hidden === false);
    check('badge BUY & lolos syarat', /BUY/.test(doc.getElementById('mt-action').textContent) && /LOLOS/.test(doc.getElementById('mt-verdict').textContent));
    check('level & lot tampil', /2350\.50/.test(doc.getElementById('mt-entry').textContent) && /0,31/.test(doc.getElementById('mt-lot').textContent), doc.getElementById('mt-entry').textContent);
    check('tombol eksekusi aktif untuk rencana lolos', doc.getElementById('mt-execute').disabled === false);
    check('alasan tampil', /EMA20 di atas EMA50/.test(doc.getElementById('mt-reasons').textContent));

    const rejected = { ...plan, ok: false, action: 'HOLD', reasons: ['R:R 1.20 di bawah syarat 1.50.'] };
    send({ type: 'plan', plan: rejected });
    check('rencana ditolak tampil & eksekusi mati', /DITOLAK/.test(doc.getElementById('mt-verdict').textContent) && doc.getElementById('mt-execute').disabled === true);

    send({ type: 'positions', positions: [{ ticket: 500001, symbol: 'XAUUSD', type: 'buy', volume: 0.2, price: 2350.5, sl: 2347.3, tp: 2356.9, profit: 12.4, current: 2351.1 }] });
    check('posisi tampil', /#500001/.test(doc.getElementById('mt-positions').textContent) && /\+12,40/.test(doc.getElementById('mt-positions').textContent), doc.getElementById('mt-positions').textContent);
    posts.length = 0;
    doc.querySelector('#mt-positions button').click();
    check('tombol tutup posisi mengirim tiket', posts.some((p) => p.type === 'closePosition' && p.ticket === 500001), JSON.stringify(posts));

    // ── snapshot: pindah fitur lalu kembali tidak boleh kosong ───────────────
    send({ type: 'plan', plan });
    send({
        type: 'state',
        symbol: 'ETHUSDm',
        timeframe: 'M15',
        connected: true,
        health: { mode: 'live', account: { login: 9, server: 'ICMarkets-Live', currency: 'USD', balance: 5000, equity: 5050, freeMargin: 4000, leverage: 500 } },
        account: { login: 9, server: 'ICMarkets-Live', currency: 'USD', balance: 5000, equity: 5050, freeMargin: 4000, leverage: 500 },
        quote: { name: 'ETHUSDm', bid: 2450.1, ask: 2450.9, spread: 8, digits: 2, point: 0.01, minLot: 0.01, maxLot: 50, lotStep: 0.01, contractSize: 1, tradeAllowed: true, time: 1 },
        candles: [{ t: 1, o: 2440, h: 2460, l: 2435, c: 2450, v: 10 }],
        atr: 6.1,
        ema20: 2451,
        ema50: 2440,
        rsi: 55,
        bars: 1,
        plan,
        positions: [{ ticket: 777, symbol: 'ETHUSDm', type: 'buy', volume: 0.5, price: 2450.9, sl: 2444, tp: 2465, profit: 3.5, current: 2451.5 }],
        chat: [{ role: 'user', content: 'entry ETHUSDm sekarang' }, { role: 'assistant', content: 'ARAH: NAIK\nSINYAL: BUY\nLOT: 0.31' }],
        settings: { riskPercent: 1, minRR: 1.5, minConfidence: 65, platform: 'mt5', mode: 'live', autoConnect: true, llmEntry: true },
        auto: { on: false },
    });
    eq('snapshot memulihkan simbol broker', doc.getElementById('mt-symbol').value, 'ETHUSDm');
    check('snapshot memulihkan status akun', /ICMarkets-Live/.test(doc.getElementById('mt-account').textContent), doc.getElementById('mt-account').textContent.slice(0, 90));
    check('snapshot memulihkan chart/quote', /2450\.10/.test(doc.getElementById('mt-quote').textContent), doc.getElementById('mt-quote').textContent);
    check('snapshot memulihkan rencana', doc.getElementById('mt-plan-card').hidden === false && /BUY/.test(doc.getElementById('mt-action').textContent));
    check('snapshot memulihkan posisi', /#777/.test(doc.getElementById('mt-positions').textContent), doc.getElementById('mt-positions').textContent);
    check('snapshot memulihkan chat', /entry ETHUSDm sekarang/.test(doc.getElementById('mt-chat').textContent), doc.getElementById('mt-chat').textContent.slice(0, 120));
    check('catatan menandai sambung otomatis & LLM entry', /sambung otomatis/i.test(doc.getElementById('mt-analyze-note').textContent) && /LLM entry aktif/.test(doc.getElementById('mt-analyze-note').textContent), doc.getElementById('mt-analyze-note').textContent);

    // ── ganti akun → seluruh tampilan reset ─────────────────────────────────
    send({ type: 'reset', reason: 'account' });
    check('ganti akun menutup rencana lama', doc.getElementById('mt-plan-card').hidden === true);
    check('ganti akun mengosongkan posisi', /Belum ada posisi/.test(doc.getElementById('mt-positions').textContent), doc.getElementById('mt-positions').textContent);
    check('ganti akun membersihkan chat', doc.getElementById('mt-chat').textContent.trim() === '', doc.getElementById('mt-chat').textContent.slice(0, 60));

    // ── sambung ulang otomatis ditampilkan di chip ─────────────────────────
    send({ type: 'bridge', state: 'retrying', attempts: 3, inMs: 9800, text: 'Menyambung otomatis dalam 10 dtk…' });
    check('status sambung-ulang tampil', /menyambung ulang/i.test(doc.getElementById('mt-bridge').textContent), doc.getElementById('mt-bridge').textContent);

    send({ type: 'answerStart' });
    send({ type: 'answer', text: 'ARAH: NAIK\nSINYAL: BUY\nENTRY: 2350.5\nSTOP LOSS: 2347.3\nTP: 2356.9\nLOT: 0.31\nR:R: 1:2\nKEYAKINAN: 74%\nSTATUS: LOLOS SYARAT\nALASAN:\n- EMA searah\nRISIKO:\n- Batalkan di bawah SL' });
    check('jawaban terstruktur tampil', /LOLOS SYARAT/.test(doc.getElementById('mt-chat').textContent) && /0\.31/.test(doc.getElementById('mt-chat').textContent), doc.getElementById('mt-chat').textContent.slice(0, 120));

    // ── riwayat chat MetaTrader (database/mt-chat.txt) ──────────────────
    check('tombol riwayat chat MT ada', !!doc.getElementById('mt-history-btn') && !!doc.getElementById('mt-history') && !!doc.getElementById('mt-new-chat'));
    posts.length = 0;
    doc.getElementById('mt-history-btn').click();
    check('minta daftar riwayat chat MT', posts.some((p) => p.type === 'chatHistory'), JSON.stringify(posts));
    send({ type: 'chatSessions', sessions: [{ id: 'm1', title: 'Entry BTC tadi', at: Date.now(), count: 2, symbol: 'BTCUSDm' }] });
    check('riwayat chat MT tampil', /Entry BTC tadi/.test(doc.getElementById('mt-history').textContent), doc.getElementById('mt-history').textContent.slice(0, 120));
    posts.length = 0;
    doc.querySelector('#mt-history .mt-hist-item').click();
    check('klik riwayat MT memuat sesi', posts.some((p) => p.type === 'loadChat' && p.id === 'm1'), JSON.stringify(posts));
    send({ type: 'chatLoaded', messages: [{ role: 'user', content: 'entry BTC?' }, { role: 'assistant', content: 'ARAH: NAIK' }] });
    check('riwayat MT masuk chat', /entry BTC/.test(doc.getElementById('mt-chat').textContent), doc.getElementById('mt-chat').textContent.slice(0, 120));
    posts.length = 0;
    doc.getElementById('mt-new-chat').click();
    check('tombol baru MT meminta sesi baru', posts.some((p) => p.type === 'newChat'), JSON.stringify(posts));

    posts.length = 0;
    doc.getElementById('mt-analyze').click();
    check('tombol analisa mengirim analyze', posts.some((p) => p.type === 'analyze'), JSON.stringify(posts));
    send({ type: 'plan', plan });
    posts.length = 0;
    doc.getElementById('mt-execute').click();
    check('tombol eksekusi mengirim execute + konfirmasi HP', posts.some((p) => p.type === 'execute' && p.confirm === true), JSON.stringify(posts));
    posts.length = 0;
    doc.getElementById('mt-entry-llm').click();
    check('tombol ⌁ Entry meminta entry LLM', posts.some((p) => p.type === 'entry'), JSON.stringify(posts));
    posts.length = 0;
    doc.getElementById('mt-load').click();
    check('tombol Muat memuat simbol+timeframe sekali jalan', posts.some((p) => p.type === 'load' && p.timeframe), JSON.stringify(posts));
    posts.length = 0;
    doc.getElementById('mt-ask').value = 'setup ini aman?';
    doc.getElementById('mt-send').click();
    check('chat mengirim pertanyaan', posts.some((p) => p.type === 'ask' && p.text === 'setup ini aman?'), JSON.stringify(posts));
    posts.length = 0;
    const cmd = doc.getElementById('mt-term-cmd');
    cmd.value = 'status';
    cmd.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('konsol mengirim perintah', posts.some((p) => p.type === 'terminalCmd' && p.line === 'status'), JSON.stringify(posts));
    w.close();

    // ── 4. package.json & extension wiring ────────────────────────────────
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const views = pkg.contributes.views.dateSkunderAi.map((v) => v.id);
    const iTrading = views.indexOf('dateSkunder.tradingView');
    const iMt = views.indexOf('dateSkunder.mtView');
    check('view MetaTrader terdaftar', iMt >= 0, JSON.stringify(views));
    check('MetaTrader di bawah TradingView', iMt > iTrading, `trading=${iTrading}, mt=${iMt}`);
    eq('nama view MetaTrader', pkg.contributes.views.dateSkunderAi[iMt].name, 'MetaTrader AI');
    check('perintah MT terdaftar', ['open', 'connect', 'analyze', 'models', 'serverTerminal', 'bridgeTerminal', 'closeAll']
        .every((k) => pkg.contributes.commands.some((c) => c.command === 'date-skunder.mt.' + k)));
    check('aktivasi view MT', pkg.activationEvents.includes('onView:dateSkunder.mtView'));
    const props = pkg.contributes.configuration.properties;
    eq('8 pengaturan mtAi', Object.keys(props).filter((k) => k.indexOf('dateSkunder.mtAi.') === 0).length, 8);
    eq('36 pengaturan mt', Object.keys(props).filter((k) => k.indexOf('dateSkunder.mt.') === 0).length, 36);
    eq('mode demo agresif bawaan aktif', props['dateSkunder.mt.demoAggressive'].default, true);
    eq('batas demo agresif 25%', props['dateSkunder.mt.demoRiskCapPct'].default, 25);
    eq('auto-TP bawaan aktif', props['dateSkunder.mt.autoProfitClose'].default, true);
    eq('target auto-TP 0,8R', props['dateSkunder.mt.profitCloseR'].default, 0.8);
    eq('jeda entry ulang 45 dtk', props['dateSkunder.mt.reentryCooldown'].default, 45);
    eq('batas 30 entry/hari', props['dateSkunder.mt.maxTradesPerDay'].default, 30);
    eq('batas rugi harian 3%', props['dateSkunder.mt.maxDailyLossPct'].default, 3);
    eq('sambung otomatis bawaan MATI (manual)', props['dateSkunder.mt.autoConnect'].default, false);
    eq('LLM entry bawaan aktif', props['dateSkunder.mt.llmEntry'].default, true);
    eq('tick realtime bawaan 2000ms', props['dateSkunder.mt.tickMs'].default, 2000);
    check('preset simbol bawaan memuat ETHUSD', /ETHUSD/.test(props['dateSkunder.mt.symbolPresets'].default));
    eq('margin level minimum 200%', props['dateSkunder.mt.minMarginLevel'].default, 200);
    eq('max margin usage 50%', props['dateSkunder.mt.maxMarginUsage'].default, 50);
    eq('notifikasi sinyal bawaan aktif', props['dateSkunder.mt.notifySignals'].default, true);
    eq('auto scan bawaan 30 detik', props['dateSkunder.mt.autoScanSeconds'].default, 30);
    eq('login akun nyata bawaan kosong', props['dateSkunder.mt.login'].default, 0);
    eq('server akun nyata bawaan kosong', props['dateSkunder.mt.server'].default, '');
    eq('auto-pilot bawaan mati', props['dateSkunder.mt.autoPilot'].default, false);
    eq('bridge host lokal', props['dateSkunder.mt.bridgeHost'].default, '127.0.0.1');
    eq('port mtAi terpisah (8147)', props['dateSkunder.mtAi.port'].default, 8147);
    eq('auto-trade bawaan mati', props['dateSkunder.mt.autoTrade'].default, false);
    const ext = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
    check('extension mendaftarkan view MT', /registerMtView\(context\)/.test(ext) && /from '\.\/mtView'/.test(ext));
    check('view memuat media mt-view', /joinPath\(media, 'mt-view\.js'\)/.test(viewTs) && /joinPath\(media, 'mt-view\.css'\)/.test(viewTs));
    check('view memuat perender Markdown', /joinPath\(media, 'md\.js'\)/.test(viewTs));
    check('otak MetaTrader punya auto-pilot', /autoTick/.test(viewTs) && /maybeAutoExecute/.test(viewTs) && /toggleAuto/.test(viewTs));
    check('auto-TP lalu entry lagi + pagar MC', /autoProfitClose/.test(viewTs) && /scheduleReentry/.test(viewTs) && /emergencyCloseAll/.test(viewTs) && /maxDailyLossPct/.test(viewTs));
    check('mode demo agresif untuk akun kecil', /demoAggressive/.test(viewTs) && /demoRiskCapPct/.test(viewTs) && /Mode demo agresif/.test(viewTs));
    check('auto pindah simbol bila lot minimum tidak muat', /findAffordableSymbol/.test(viewTs) && /terlalu besar untuk ekuitas/.test(viewTs));
    check('login akun nyata memakai SecretStorage', /secrets\.store|savedPassword/.test(viewTs) && /loginAccount/.test(viewTs));
    check('login tidak jatuh ke simulasi saat gagal', /Mode simulasi tidak dipakai/.test(viewTs));
    check('notifikasi sinyal BUY/SELL lengkap SL/TP', /notifySignal/.test(viewTs) && /showInformationMessage\(`Sinyal/.test(viewTs));
    check('deteksi terminal MT5 dari bridge', /findTerminals/.test(viewTs) && /terminalPath/.test(viewTs));
    check('simbol mengikuti broker & chart candles', /autoPickSymbol/.test(viewTs) && /candles/.test(viewTs));
    const mtCss = fs.readFileSync(path.join(root, 'media/mt-view.css'), 'utf8');
    check('label kartu AI kecil (8,5px)', /\.mt-grid span \{[^}]*font-size: 8\.5px/s.test(mtCss), 'label masih besar');
    check('nilai kartu AI ringkas (11,5px)', /\.mt-grid b \{[^}]*font-size: 11\.5px/s.test(mtCss), 'nilai terlalu besar');
    check('akun rapat 2 kolom (gaya tradingview)', /\.mt-acc-nums \{[^}]*grid-template-columns: 1fr 1fr/s.test(mtCss), mtCss.slice(0, 0));
    check('input HP ringkas (28px)', /min-height: 28px/.test(mtCss));
    check('posisi menampilkan harga kini', /p\.current/.test(fs.readFileSync(path.join(root, 'media/mt-view.js'), 'utf8')));
    check('riwayat chat MT memakai ChatStore + mt-chat.txt', /ChatStore/.test(viewTs) && /mt-chat\.txt/.test(viewTs) && /postChatSessions/.test(viewTs) && /loadChatSession/.test(viewTs));
    check('katalog simbol broker dimuat & dipetakan', /loadCatalog/.test(viewTs) && /pickSymbol/.test(viewTs) && /\.catalog\(\)/.test(viewTs));
    check('realtime tanpa tombol (sambung sendiri)', /ensureConnected/.test(viewTs) && /startWatchdog/.test(viewTs) && /scheduleReconnect/.test(viewTs));
    check('akun berganti → reset sesi', /applyAccount/.test(viewTs) && /resetSession/.test(viewTs));
    check('ganti akun menghapus chat akun lama', /reason === 'account'\) \{[\s\S]{0,160}this\.chat = \[\]/.test(viewTs));
    check('snapshot keadaan untuk view yang dibuka lagi', /postState\(\)/.test(viewTs) && /onDidChangeVisibility/.test(viewTs));
    check('entry lewat LLM dari chat/tombol', /askEntry/.test(viewTs) && /mtEntryIntent/.test(viewTs) && /type === 'entry'/.test(viewTs));
    check('tombol eksekusi HP = konfirmasi eksplisit', /execute\(false, m\.confirm === true\)/.test(viewTs));
    check('UI punya dropdown + pencarian simbol', /id="mt-symbol"/.test(viewTs) && /id="mt-symbol-search"/.test(viewTs) && /id="mt-entry-llm"/.test(viewTs));
    check('pagar anti-MC', /minMarginLevel/.test(viewTs) && /maxMarginUsage/.test(viewTs));

    // ── 5. jembatan Python: sintaks + jalankan mode simulasi ──────────────
    const py = path.join(root, 'python', 'mt_bridge.py');
    check('berkas jembatan Python ada', fs.existsSync(py));
    const pySrc = fs.readFileSync(py, 'utf8');
    check('jembatan Python punya katalog simbol', /\/symbols/.test(pySrc) && /def mt5_symbols_catalog/.test(pySrc) && /def symbol_base/.test(pySrc));
    check('bridge auto menyambung nyata, bukan akun palsu', /def ensure_mt5/.test(pySrc) && /TANPA akun simulasi/.test(pySrc) && /"simulated": True/.test(pySrc));
    check('bridge memakai spec broker (stops level & filling)', /trade_stops_level/.test(pySrc) && /filling_mode/.test(pySrc) && /def filling_candidates/.test(pySrc));
    check('bridge bisa pindah SL ke break-even', /def mt5_modify/.test(pySrc) && /\/modify/.test(pySrc) && /TRADE_ACTION_SLTP/.test(pySrc));
    check('lot dihitung kalkulator broker (konversi IDR/USD)', /def mt5_size/.test(pySrc) && /order_calc_profit/.test(pySrc) && /\/size/.test(pySrc));
    check('riwayat deal untuk batas rugi harian', /def mt5_history/.test(pySrc) && /history_deals_get/.test(pySrc) && /\/history/.test(pySrc));
    check('jembatan Python menyelesaikan nama broker', /\/resolve/.test(pySrc) && /def resolve_symbol/.test(pySrc) && /def resolve_payload/.test(pySrc));
    check('cache simbol direset saat akun berganti', /CATALOG_CACHE\["at"\] = 0\.0/.test(pySrc) && /SYMBOL_CACHE\["at"\] = 0\.0/.test(pySrc));
    const compiled = spawnSync('python', ['-m', 'py_compile', py], { cwd: root, encoding: 'utf8' });
    check('jembatan Python lolos py_compile', compiled.status === 0, (compiled.stderr || '').slice(0, 220));
    const noToken = spawnSync('python', [py, '--host', '0.0.0.0', '--port', '8898', '--mode', 'sim'], { cwd: root, encoding: 'utf8', timeout: 8000 });
    check('bridge menolak LAN tanpa token', noToken.status !== 0, 'status=' + noToken.status);

    const pyOk = await runPythonBridge(py);
    check('jembatan Python simulasi: health + order + close', pyOk, 'lihat log di atas bila gagal');

    // ── 4. penyimpanan riwayat chat ───────────────────────────────────────
    const chatBuilt = esbuild.buildSync({
        entryPoints: [path.join(root, 'src/chatStore.ts')],
        bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
        alias: { vscode: path.join(root, 'scripts', 'vscode-stub.cjs') },
    });
    const chatMod = { exports: {} };
    new Function('module', 'exports', 'require', chatBuilt.outputFiles[0].text)(chatMod, chatMod.exports, require);
    const { ChatStore } = chatMod.exports;
    const chatTmp = path.join(root, '.tmp-check', 'chat-store-test');
    fs.rmSync(chatTmp, { recursive: true, force: true });
    const store = new ChatStore({ globalStorageUri: { fsPath: chatTmp } }, 'database-test.txt');
    await store.append({ at: 1, scope: 'trading', session: 's1', symbol: 'IDX:BBCA', role: 'user', content: 'Analisa **BBCA**?' });
    await store.append({ at: 2, scope: 'trading', session: 's1', symbol: 'IDX:BBCA', role: 'assistant', content: 'Harga di atas SMA20.' });
    await store.append({ at: 3, scope: 'trading', session: 's2', symbol: 'IDX:TLKM', role: 'user', content: 'Analisa TLKM?' });
    const chatFile = path.join(chatTmp, 'database', 'database-test.txt');
    const sessions = await store.list('trading');
    check('riwayat tersimpan di database/database.txt', fs.existsSync(chatFile), chatFile);
    eq('dua sesi tersimpan', sessions.length, 2);
    eq('sesi terbaru lebih dulu', sessions[0].id, 's2');
    check('judul sesi dari pesan user', /Analisa BBCA/.test(sessions.find((x) => x.id === 's1').title), JSON.stringify(sessions));
    const turns = await store.load('trading', 's1');
    eq('muat sesi: 2 pesan', turns.length, 2);
    eq('urutan pesan benar', turns[0].role, 'user');
    fs.appendFileSync(chatFile, 'bukan json\n');
    const again = await store.list('trading');
    eq('baris korup diabaikan', again.length, 2);
    fs.rmSync(chatTmp, { recursive: true, force: true });

    // ── hasil ────────────────────────────────────────────────────────────
    if (fails.length) {
        console.error('\n✗ MetaTrader: ' + fails.length + ' uji gagal\n');
        fails.forEach((f) => console.error('  - ' + f));
        process.exit(1);
    }
    console.log('✓ MetaTrader: ' + ok.length + ' uji lolos (validasi entry, bridge Python, view, model & server terpisah)');
})();

async function clientWithWrongToken(port) {
    const bad = new MtBridge(port, 'salah');
    try { await bad.health(); return false; } catch { return true; }
}

function waitHealth(port, token, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
        const tick = () => {
            if (Date.now() > deadline) { resolve(false); return; }
            const req = http.request({ host: '127.0.0.1', port, path: '/health', headers: { 'X-Bridge-Token': token }, timeout: 1000 }, (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode === 200));
            });
            req.on('error', () => setTimeout(tick, 400));
            req.on('timeout', () => { req.destroy(); setTimeout(tick, 400); });
            req.end();
        };
        tick();
    });
}

function api(port, token, method, p, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = http.request({
            host: '127.0.0.1', port, path: p, method,
            headers: Object.assign({ 'X-Bridge-Token': token }, payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            timeout: 8000,
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { raw += c; });
            res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        if (payload) { req.write(payload); }
        req.end();
    });
}

async function runPythonBridge(py) {
    const net = require('net');
    const port = await new Promise((resolve) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
        s.on('error', () => resolve(8900 + Math.floor(Math.random() * 80)));
    });
    const token = 'uji-token';
    const child = spawn('python', [py, '--port', String(port), '--mode', 'sim', '--token', token], { cwd: root, stdio: 'ignore' });
    try {
        const up = await waitHealth(port, token, 15000);
        if (!up) { console.error('[mt-test] health timeout'); return false; }
        const health = await api(port, token, 'GET', '/health');
        if (!health.ok || health.mode !== 'sim') { console.error('[mt-test] health', JSON.stringify(health)); return false; }
        if (!health.diag || typeof health.diag.windows !== 'boolean') { console.error('[mt-test] diag', JSON.stringify(health.diag)); return false; }
        const diag = await api(port, token, 'GET', '/terminals');
        if (!diag.ok || !Array.isArray(diag.terminals)) { console.error('[mt-test] terminals', JSON.stringify(diag).slice(0, 160)); return false; }
        const eth = await api(port, token, 'GET', '/symbol?symbol=ETHUSD');
        if (!eth.ok || eth.symbol.name !== 'ETHUSD') { console.error('[mt-test] ethusd', JSON.stringify(eth).slice(0, 160)); return false; }
        const specs = await api(port, token, 'GET', '/specs');
        if (!specs.ok || !specs.symbols.includes('ETHUSD')) { console.error('[mt-test] specs', JSON.stringify(specs).slice(0, 160)); return false; }
        // Katalog simbol broker + pencocokan nama (ETHUSD → ETHUSDm di akun nyata).
        const cat = await api(port, token, 'GET', '/symbols');
        if (!cat.ok || !cat.symbols.some((x) => x.name === 'ETHUSD' && x.base === 'ETHUSD' && x.digits > 0)) {
            console.error('[mt-test] symbols', JSON.stringify(cat).slice(0, 200)); return false;
        }
        const rsv = await api(port, token, 'GET', '/resolve?symbol=ETHUSD');
        if (!rsv.ok || rsv.name !== 'ETHUSD' || rsv.found !== true) {
            console.error('[mt-test] resolve', JSON.stringify(rsv).slice(0, 200)); return false;
        }
        const badLogin = await api(port, token, 'POST', '/login', {});
        if (badLogin.ok) { console.error('[mt-test] login kosong seharusnya gagal', JSON.stringify(badLogin)); return false; }
        const sym = await api(port, token, 'GET', '/symbol?symbol=EURUSD');
        if (!sym.ok || !(sym.symbol.ask > sym.symbol.bid)) { console.error('[mt-test] symbol', JSON.stringify(sym)); return false; }
        const q = sym.symbol;
        if (q.stopsLevel === undefined || q.fillingMode === undefined) {
            console.error('[mt-test] spec broker tidak lengkap', JSON.stringify(q)); return false;
        }
        const buySl = Number((q.ask - 300 * q.point).toFixed(5));
        const buyTp = Number((q.ask + 600 * q.point).toFixed(5));
        const bars = await api(port, token, 'GET', '/rates?symbol=EURUSD&timeframe=M15&count=60');
        if (!bars.ok || bars.bars.length !== 60) { console.error('[mt-test] bars', JSON.stringify(bars).slice(0, 160)); return false; }
        const sized = await api(port, token, 'POST', '/size', { symbol: 'EURUSD', side: 'buy', entry: q.ask, sl: buySl, riskPercent: 1 });
        if (!sized.ok || !(sized.lot > 0) || !(sized.riskMoney > 0) || sized.currency !== 'USD') {
            console.error('[mt-test] size', JSON.stringify(sized).slice(0, 220)); return false;
        }
        const hist = await api(port, token, 'POST', '/history', { days: 1, magic: 111 });
        if (!hist.ok || typeof hist.total !== 'number') {
            console.error('[mt-test] history', JSON.stringify(hist).slice(0, 200)); return false;
        }
        const order = await api(port, token, 'POST', '/order', { symbol: 'EURUSD', side: 'buy', lot: 0.1, sl: buySl, tp: buyTp, comment: 'uji', magic: 111 });
        if (!order.ok) { console.error('[mt-test] order1', JSON.stringify(order), 'q=', q.ask, buySl, buyTp); return false; }
        // Break-even: SL posisi terbuka harus bisa dipindah ke harga entry.
        const be = await api(port, token, 'POST', '/modify', { ticket: order.ticket, sl: Number((order.price - 500 * q.point).toFixed(5)) });
        if (!be.ok) { console.error('[mt-test] modify', JSON.stringify(be)); return false; }
        const sym2 = await api(port, token, 'GET', '/symbol?symbol=EURUSD');
        const q2 = sym2.symbol;
        const sellSl = Number((q2.bid + 300 * q2.point).toFixed(5));
        const sellTp = Number((q2.bid - 600 * q2.point).toFixed(5));
        const order2 = await api(port, token, 'POST', '/order', { symbol: 'EURUSD', side: 'sell', lot: 0.1, sl: sellSl, tp: sellTp, comment: 'uji2', magic: 222 });
        if (!order2.ok) { console.error('[mt-test] order2', JSON.stringify(order2), 'q=', q2.bid, sellSl, sellTp); return false; }
        const positions = await api(port, token, 'GET', '/positions');
        if (!positions.ok || !positions.positions.some((p) => p.ticket === order.ticket && Number(p.current) > 0)) { console.error('[mt-test] positions', JSON.stringify(positions).slice(0, 160)); return false; }
        // Tutup hanya posisi milik AI (magic 111) — posisi manual (222) harus tetap ada.
        const closedAi = await api(port, token, 'POST', '/close_all', { magic: 111 });
        if (!closedAi.ok || closedAi.closed.length !== 1) { console.error('[mt-test] close_all', JSON.stringify(closedAi)); return false; }
        const left = await api(port, token, 'GET', '/positions');
        if (left.positions.length !== 1 || Number(left.positions[0].magic) !== 222) { console.error('[mt-test] left', JSON.stringify(left)); return false; }
        const closed = await api(port, token, 'POST', '/close', { ticket: order2.ticket });
        if (!closed.ok) { console.error('[mt-test] close', JSON.stringify(closed)); return false; }
        const after = await api(port, token, 'GET', '/positions');
        return after.positions.length === 0;
    } catch {
        return false;
    } finally {
        try { child.kill(); } catch { /* sudah mati */ }
        try { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* bukan windows */ }
    }
}
