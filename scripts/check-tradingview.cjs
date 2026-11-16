/*
 * Uji regresi view “TradingView” (sidebar, tepat di bawah Compile MSI).
 *
 * Cakupan:
 *  • view terdaftar di package.json SETELAH Compile MSI + perintah + 8 pengaturan tradingAi,
 *  • src/extension.ts mendaftarkan provider; src/tradingViewView.ts memakai data + sinyal + AI,
 *  • media/tradingview-view.js: chart mini TradingView, kartu sinyal, chat terstruktur,
 *    console sendiri, perintah terminal, pencarian simbol,
 *  • src/tradingData.ts: pemetaan simbol Yahoo, indikator, sinyal mesin, brief prompt,
 *  • otak trading terpisah: nama terminal & output channel sendiri, port beda, prompt tegas.
 * Jalankan: npm run check:tradingview
 */
const fs = require('fs');
const path = require('path');
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

// ── 0. data & indikator (src/tradingData.ts dibundel sebentar) ───────────────
const built = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/tradingData.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const dataMod = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(dataMod, dataMod.exports, require);
const D = dataMod.exports;

eq('IDX:BBCA → BBCA.JK', D.toYahoo('IDX:BBCA'), 'BBCA.JK');
eq('NASDAQ:TSLA → TSLA', D.toYahoo('NASDAQ:TSLA'), 'TSLA');
eq('FX_IDC:USDIDR → IDR=X', D.toYahoo('FX_IDC:USDIDR'), 'IDR=X');
eq('BINANCE:BTCUSDT → BTC-USD', D.toYahoo('BINANCE:BTCUSDT'), 'BTC-USD');
eq('BBCA.JK → IDX:BBCA', D.fromYahoo('BBCA.JK'), 'IDX:BBCA');
eq('SMA 5 dari 1..20', D.sma([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 5), 18);
// ticker yang disebut di pertanyaan → konteks data ikut pindah
check('ticker IDX:TLKM dikenali', D.tickerInText('analisa IDX:TLKM dong') === 'IDX:TLKM', D.tickerInText('analisa IDX:TLKM dong'));
check('ticker TLKM.JK dikenali', D.tickerInText('bagaimana TLKM.JK?') === 'IDX:TLKM', D.tickerInText('bagaimana TLKM.JK?'));
check('ticker setelah kata “saham” dikenali', D.tickerInText('saham BRIS aman?') === 'IDX:BRIS', D.tickerInText('saham BRIS aman?'));
check('kalimat biasa tidak dianggap ticker', D.tickerInText('aman buy sekarang?') === undefined, D.tickerInText('aman buy sekarang?'));

// dedupe jawaban (bug kalimat support/resistance diulang berkali-kali)
const textBuilt = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/textTools.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const textMod = { exports: {} };
new Function('module', 'exports', 'require', textBuilt.outputFiles[0].text)(textMod, textMod.exports, require);
const TT = textMod.exports;
const repeatedLine = 'Selain itu, Anda juga bisa mempertimbangkan untuk memperpanjang periode waktu untuk menunggu harga kembali ke area support atau resistance yang lebih rendah.';
const clean = TT.dedupeReply('JAWABAN: Cutloss adalah kondisi harga menembus level support atau resistance.\n' + Array(6).fill(repeatedLine).join('\n'));
check('dedupe membuang kalimat berulang', (clean.match(/memperpanjang periode waktu/g) || []).length === 1, clean.slice(0, 180));
check('dedupe mempertahankan inti jawaban', /Cutloss adalah/.test(clean), clean.slice(0, 120));
eq('JSON berpagar dibaca', TT.extractJsonObject('```json\n{"action":"BUY","sl":1.2}\n```').action, 'BUY');

// Jawaban berantakan seperti screenshot: label FORMAT/Penjelasan + paragraf mirip berulang
const messy = [
    'FORMAT B (penjelasan/analisa)',
    'JAWABAN:',
    'Penjelasan:',
    'Dalam analisis teknikal dan fundamental pasar IDX:BBCA, entry dilakukan di bawah SMA20 5.126,5 yang mengindikasikan tren turun jangka panjang.',
    'Penjelasan:',
    'Dalam analisis teknikal dan fundamental pasar IDX:BBCA, entry dilakukan di bawah SMA20 5.126,5 dan mengindikasikan tren turun jangka panjang.',
    'Analisis:',
    'Dalam analisis teknikal dan fundamental pasar IDX:BBCA, entry dilakukan di bawah SMA20 5.126,5 yang mengindikasikan tren turun jangka panjang.',
].join('\n');
const cleanMessy = TT.dedupeReply(messy);
check('label FORMAT/Penjelasan dibuang', !/FORMAT/i.test(cleanMessy) && !/^Penjelasan:/m.test(cleanMessy), cleanMessy.slice(0, 180));
check('paragraf mirip tidak diulang', (cleanMessy.match(/Dalam analisis teknikal/g) || []).length === 1, cleanMessy.slice(0, 220));

// Pemilihan gaya jawaban sesuai pertanyaan
const aiBuilt = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/tradingAi.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
    alias: { vscode: path.join(root, 'scripts', 'vscode-stub.cjs') },
});
const aiMod = { exports: {} };
new Function('module', 'exports', 'require', aiBuilt.outputFiles[0].text)(aiMod, aiMod.exports, require);
const AI = aiMod.exports;
eq('“apa itu trading” → mode umum', AI.chatModeFor('apa itu trading'), 'general');
eq('“aman buy sekarang?” → mode keputusan', AI.chatModeFor('aman buy sekarang?'), 'decision');
eq('“kenapa RSI overbought?” → mode umum', AI.chatModeFor('kenapa RSI overbought?'), 'general');
eq('“analisa TLKM” → mode analisa', AI.chatModeFor('analisa TLKM'), 'analysis');
check('prompt umum melarang memaksa analisa simbol', /JANGAN memaksakan analisa simbol/.test(AI.TRADING_GENERAL_PROMPT));
check('prompt utama melarang label FORMAT', /Jangan menulis label "FORMAT"/.test(AI.TRADING_SYSTEM_PROMPT));

// Markdown chat: * dan ** dirapikan jadi bold/italic/daftar
const mdDom = new JSDOM('<!doctype html><html><body><div id="mdbox"></div></body></html>', { runScripts: 'outside-only' });
mdDom.window.eval(fs.readFileSync(path.join(root, 'media', 'md.js'), 'utf8'));
const mdBox = mdDom.window.document.getElementById('mdbox');
mdDom.window.SkunderMd.block(mdBox, '**Tebal** dan *miring* serta `kode`\n- satu\n- dua\n## Judul');
check('Markdown **bold** jadi <strong>', mdBox.querySelectorAll('strong').length === 1 && /Tebal/.test(mdBox.textContent));
check('Markdown *italic* & kode', mdBox.querySelectorAll('em').length === 1 && mdBox.querySelectorAll('code').length === 1);
check('Markdown daftar jadi <ul><li>', mdBox.querySelectorAll('ul li').length === 2);
check('Markdown judul jadi blok', mdBox.querySelectorAll('.md-h').length === 1);
mdDom.window.close();

// deret naik realistis (tren naik + pullback berkala) → RSI sehat, sinyal BUY
const naik = (() => {
    const out = [];
    for (let i = 0; i < 250; i++) { out.push(1000 + i * 1.6 + (i % 6 === 5 ? -10 : 0)); }
    return out;
})();
check('RSI deret naik > 50', D.rsi(naik) > 50, String(D.rsi(naik)));
const md = D.macd(naik);
check('MACD deret naik positif', md && md.hist > 0, JSON.stringify(md));

const bars = naik.map((c, i) => ({ t: 1700000000 + i * 86400, o: c - 0.6, h: c + 0.8, l: c - 0.8, c, v: 1000 + (i % 5) * 40 }));
const quote = { symbol: 'IDX:BBRI', yahoo: 'BBRI.JK', currency: 'IDR', last: bars[bars.length - 1].c, prevClose: bars[bars.length - 2].c, change: 1.5, changePct: 0.7, time: bars[bars.length - 1].t, bars };
const t = D.analisa(quote);
eq('sinyal mesin pada tren naik = BUY', t.sinyal, 'BUY');
eq('arah mesin pada tren naik = NAIK', t.arah, 'NAIK');
check('entry/stop/tp dihitung', t.entry > 0 && t.stop > 0 && t.tp1 > 0 && t.tp2 > 0, JSON.stringify([t.entry, t.stop, t.tp1, t.tp2]));
check('stop di bawah entry untuk BUY', t.stop < t.entry, `${t.stop} < ${t.entry}`);
check('R:R minimal 1', t.rr >= 1, String(t.rr));
check('alasan berisi angka pendukung', t.alasan.length >= 3 && /SMA20/.test(t.alasan.join('|')), t.alasan.join(' | ').slice(0, 120));
check('brief memuat bagian penting', /RSI\(14\)/.test(D.buildBrief(t)) && /Sinyal mesin/.test(D.buildBrief(t)) && /Resistance 20h/.test(D.buildBrief(t)));
check('brief memuat waktu data + sesi bursa', /Data harga/.test(D.buildBrief(t)) && /WIB/.test(D.buildBrief(t)) && /sesi bursa/.test(D.buildBrief(t)), D.buildBrief(t).slice(0, 220));
check('brief memuat level mesin (anti level karangan)', /Level mesin/.test(D.buildBrief(t)) && /entry/.test(D.buildBrief(t)) && /TP2/.test(D.buildBrief(t)));
check('sesi IDX dikenali', /Sesi|Tutup|Istirahat|Pra-pembukaan|Pasca/.test(D.sesiIdx(new Date('2026-11-13T03:00:00Z'))), D.sesiIdx(new Date('2026-11-13T03:00:00Z')));

// ── 1. berkas media: UI view ─────────────────────────────────────────────────
const viewTs = fs.readFileSync(path.join(root, 'src/tradingViewView.ts'), 'utf8');
const htmlStart = viewTs.indexOf('<body class="tv-body">');
const htmlEnd = viewTs.indexOf('</body>', htmlStart);
check('HTML view memuat body tv-body', htmlStart > 0 && htmlEnd > htmlStart);
const bodyHtml = viewTs.slice(htmlStart, htmlEnd).replace(/<script[\s\S]*?<\/script>/g, '');

const dom = new JSDOM('<!doctype html><html><body>' + bodyHtml.slice('<body class="tv-body">'.length) + '</body></html>', {
    runScripts: 'outside-only',
    url: 'https://skunder.test/',
});
const { window } = dom;
const doc = window.document;
window.document.body.className = 'tv-body';

const posts = [];
window.acquireVsCodeApi = () => ({ postMessage: (m) => posts.push(m), getState: () => ({}), setState: () => { } });
window.SkunderSaham = {
    cari: (q) => (String(q || '').toUpperCase().indexOf('BR') >= 0
        ? [['IDX:BBRI', 'Bank Rakyat Indonesia', 'Financials'], ['IDX:BRIS', 'Bank Syariah Indonesia', 'Financials']]
        : [['IDX:BBCA', 'Bank Central Asia', 'Financials']]),
    byCode: () => null,
};

window.eval(fs.readFileSync(path.join(root, 'media', 'md.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'media/tradingview-view.js'), 'utf8'));

check('view mengirim pesan ready', posts.some((p) => p.type === 'ready'), JSON.stringify(posts.slice(0, 2)));

function send(data) { window.dispatchEvent(new window.MessageEvent('message', { data })); }
function q(sel) { return doc.querySelector(sel); }
function qa(sel) { return [...doc.querySelectorAll(sel)]; }

send({ type: 'init', symbol: 'IDX:BBCA', sesi: 'Sesi 1', live: 30, ai: { state: 'stopped', port: 8137, model: 'qwen.gguf', ready: false } });
eq('simbol awal dari init', doc.getElementById('tv-symbol').value, 'IDX:BBCA');
check('sesi bursa tampil', /Sesi 1/.test(doc.getElementById('tv-sesi').textContent));
check('chip penyegaran otomatis tampil', /auto 30s/.test(doc.getElementById('tv-live').textContent), doc.getElementById('tv-live').textContent);
check('status otak AI tampil (port 8137)', /8137/.test(doc.getElementById('tv-ai').textContent), doc.getElementById('tv-ai').textContent);

// riwayat percakapan (Claude-like): tombol baru + daftar sesi
check('tombol percakapan baru & riwayat ada', !!doc.getElementById('tv-new-chat') && !!doc.getElementById('tv-history-btn') && !!doc.getElementById('tv-history'));
posts.length = 0;
doc.getElementById('tv-new-chat').click();
check('tombol ＋ mengirim newChat', posts.some((p) => p.type === 'newChat'), JSON.stringify(posts));
posts.length = 0;
doc.getElementById('tv-history-btn').click();
check('tombol riwayat meminta daftar sesi', posts.some((p) => p.type === 'history'), JSON.stringify(posts));
send({ type: 'question', text: 'Analisa **BBCA**?' });
check('pertanyaan user tampil di chat', /Analisa/.test(doc.getElementById('tv-chat').textContent) && !!doc.querySelector('#tv-chat .msg.user'), doc.getElementById('tv-chat').textContent.slice(0, 80));

send({ type: 'sessions', sessions: [{ id: 's1', title: 'Analisa BBCA', at: Date.now(), count: 2, symbol: 'IDX:BBCA' }] });
check('daftar riwayat tampil', /Analisa BBCA/.test(doc.getElementById('tv-history').textContent), doc.getElementById('tv-history').textContent);
posts.length = 0;
doc.querySelector('#tv-history .tv-hist-item').click();
check('klik riwayat memuat sesi', posts.some((p) => p.type === 'loadSession' && p.id === 's1'), JSON.stringify(posts));
send({ type: 'chatLoaded', session: 's1', symbol: 'IDX:BBCA', messages: [
    { role: 'user', content: 'Analisa **BBCA**?' },
    { role: 'assistant', content: '**JAWABAN:** harga di atas SMA20.' },
] });
check('riwayat dimuat ke chat', /Analisa/.test(doc.getElementById('tv-chat').textContent) && /SMA20/.test(doc.getElementById('tv-chat').textContent));
check('bold di riwayat dirender', doc.querySelectorAll('#tv-chat strong').length >= 1, doc.getElementById('tv-chat').innerHTML.slice(0, 120));

// Community AI: partner acak, sinyal otomatis, chat disimpan di database/comunity.txt
check('kartu Community AI ada', !!doc.getElementById('tv-comm-feed') && !!doc.getElementById('tv-comm-ask')
    && !!doc.getElementById('tv-comm-send') && !!doc.getElementById('tv-comm-refresh'));
send({
    type: 'community',
    messages: [{ at: Date.now(), name: 'Rina', role: 'partner', text: 'Sinyal naik BBCA di 5.000.', signal: 'BUY', symbol: 'IDX:BBCA' }],
    partners: ['Rina', 'Bagas', 'Sinta'],
    file: 'C:/proyek/database/comunity.txt',
});
check('chat komunitas tampil', /Sinyal naik BBCA/.test(doc.getElementById('tv-comm-feed').textContent), doc.getElementById('tv-comm-feed').textContent);
check('nama partner acak tampil', /Rina/.test(doc.getElementById('tv-comm-partners').textContent), doc.getElementById('tv-comm-partners').textContent);
check('berkas penyimpanan ditampilkan', /comunity\.txt/.test(doc.getElementById('tv-comm-state').textContent), doc.getElementById('tv-comm-state').textContent);
posts.length = 0;
doc.getElementById('tv-comm-ask').value = 'aman buy sekarang?';
doc.getElementById('tv-comm-send').click();
check('kirim pesan ke partner', posts.some((p) => p.type === 'communityAsk' && p.text === 'aman buy sekarang?'), JSON.stringify(posts));
send({ type: 'communityAdd', message: { at: Date.now(), name: 'Bagas', role: 'partner', text: 'Aku tunggu konfirmasi volume.', signal: 'HOLD' } });
check('balasan partner masuk feed', /Aku tunggu konfirmasi/.test(doc.getElementById('tv-comm-feed').textContent));

// pemilihan model .gguf otak trading (sebelumnya tidak ada di UI)
send({ type: 'models', models: [{ path: 'C:/models/qwen.gguf', name: 'qwen.gguf', size: '4.1 GB' }], selected: 'C:/models/qwen.gguf' });
const modelSel = doc.getElementById('tv-model');
check('daftar model .gguf tampil di view', modelSel.options.length === 1 && modelSel.value === 'C:/models/qwen.gguf', modelSel.innerHTML.slice(0, 120));
posts.length = 0;
modelSel.dispatchEvent(new window.Event('change'));
check('ganti model mengirim pilihan ke ekstensi', posts.some((p) => p.type === 'model' && p.path === 'C:/models/qwen.gguf'), JSON.stringify(posts));
posts.length = 0;
doc.getElementById('tv-model-scan').click();
check('tombol ⟳ meminta pindai ulang model', posts.some((p) => p.type === 'modelsRefresh'), JSON.stringify(posts));
posts.length = 0;
doc.getElementById('tv-model-pick').click();
check('tombol ⋯ meminta pemilih model', posts.some((p) => p.type === 'modelPick'), JSON.stringify(posts));
const chartSrc = (q('#tv-chart iframe') || {}).src || '';
check('chart mini memakai widget TradingView', chartSrc.indexOf('embed-widget/mini-symbol-overview') > 0, chartSrc.slice(0, 80));
check('chart mini membawa simbol di query', /[?&]symbol=IDX%3ABBCA/.test(chartSrc), chartSrc.slice(0, 120));

send({ type: 'quote', teknik: t, sesi: 'Sesi 2', waktu: '21:05:12 WIB' });
check('waktu data tampil di kartu harga', /21:05:12 WIB/.test(doc.getElementById('tv-quote').textContent), doc.getElementById('tv-quote').textContent);
check('kartu sinyal terbuka', doc.getElementById('tv-signal').hidden === false);
check('badge sinyal BUY tampil hijau', doc.getElementById('tv-sinyal').textContent === 'BUY' && /up/.test(doc.getElementById('tv-sinyal').className));
check('badge arah NAIK', doc.getElementById('tv-arah').textContent === 'ARAH NAIK', doc.getElementById('tv-arah').textContent);
check('level entry/stop/TP terisi angka', /[0-9]/.test(doc.getElementById('tv-entry').textContent) && /[0-9]/.test(doc.getElementById('tv-stop').textContent), doc.getElementById('tv-entry').textContent);
check('R:R tampil', /1 : /.test(doc.getElementById('tv-rr').textContent), doc.getElementById('tv-rr').textContent);
check('alasan sinyal tampil', qa('#tv-alasan div').length >= 3, String(qa('#tv-alasan div').length));

// chat streaming + jawaban terstruktur
send({ type: 'answerStart' });
send({ type: 'chunk', text: 'ARAH: NAIK\nSINYAL: BUY\n' });
check('potongan jawaban tampil saat streaming', /SINYAL: BUY/.test(doc.getElementById('tv-chat').textContent), doc.getElementById('tv-chat').textContent.slice(0, 80));
send({
    type: 'answer', text: [
        'ARAH: NAIK', 'SINYAL: BUY', 'ENTRY: 4.350', 'STOP LOSS: 4.240', 'TP1: 4.570', 'TP2: 4.680',
        'R:R: 1:2.1', 'KEYAKINAN: 72%', 'ALASAN:', '- Harga di atas SMA20 dan SMA50', '- MACD histogram positif',
        'RISIKO:', '- Batalkan bila tutup di bawah 4.240',
    ].join('\n'),
});
const chatText = doc.getElementById('tv-chat').textContent;
check('jawaban diurai menjadi baris kunci', /ENTRY/.test(chatText) && /4\.350/.test(chatText), chatText.slice(0, 120));
check('alasan dan risiko tampil', /Alasan/.test(chatText) && /Risiko/.test(chatText));
check('kelas warna BUY dipakai', qa('#tv-chat .buy').length >= 1);

// jawaban mode penjelasan (FORMAT B) — pertanyaan bukan keputusan beli/jual
send({ type: 'answerStart' });
send({
    type: 'answer',
    text: [
        'JAWABAN: Harga 9.350 masih di atas SMA20 (9.210), jadi struktur naik belum rusak.',
        'KAITAN TRADING: Selama bertahan di atas 9.210, bias beli tetap berlaku.',
        'SINYAL: BUY',
        'CATATAN RISIKO: Batalkan bila tutup di bawah 9.125.',
    ].join('\n'),
});
const explainText = doc.getElementById('tv-chat').textContent;
check('jawaban penjelasan tampil utuh', /KAITAN TRADING/.test(explainText) && /Selama bertahan/.test(explainText), explainText.slice(-120));
check('baris penjelasan memakai blok penuh', qa('#tv-chat .wide').length >= 2, String(qa('#tv-chat .wide').length));

send({ type: 'log', text: 'ini log trading', kind: 'ok' });
check('console menerima log', /ini log trading/.test(doc.getElementById('tv-term-log').textContent));
send({ type: 'error', text: 'otak belum menyala' });
check('galat tampil di chat', /otak belum menyala/.test(doc.getElementById('tv-chat').textContent));

// pencarian simbol: ketik → panel saran → klik
const input = doc.getElementById('tv-symbol');
posts.length = 0;
input.value = 'BR';
input.dispatchEvent(new window.Event('input'));
const acItems = qa('#tv-ac button');
check('panel saran simbol muncul', acItems.length === 2, String(acItems.length));
acItems[1].click();
check('klik saran mengirim simbol', posts.some((p) => p.type === 'symbol' && p.symbol === 'IDX:BRIS'), JSON.stringify(posts));

posts.length = 0;
input.value = 'ANTM';
input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
check('Enter di kotak simbol meminta analisa', posts.some((p) => p.type === 'analyze'), JSON.stringify(posts));

posts.length = 0;
const ask = doc.getElementById('tv-ask');
ask.value = 'aman buy sekarang?';
doc.getElementById('tv-send').click();
check('tombol Kirim mengirim pertanyaan', posts.some((p) => p.type === 'ask' && p.text === 'aman buy sekarang?'), JSON.stringify(posts));

posts.length = 0;
const cmd = doc.getElementById('tv-term-cmd');
cmd.value = 'analisa BRIS';
cmd.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
check('perintah console dikirim ke ekstensi', posts.some((p) => p.type === 'terminalCmd' && p.line === 'analisa BRIS'), JSON.stringify(posts));
check('perintah console tercatat di layar', /analisa BRIS/.test(doc.getElementById('tv-term-log').textContent));

posts.length = 0;
doc.getElementById('tv-ai-toggle').click();
check('tombol Nyalakan mengirim start', posts.some((p) => p.type === 'server' && p.action === 'start'), JSON.stringify(posts));

posts.length = 0;
doc.getElementById('tv-screen').click();
check('tombol layar penuh membuka panel tanpa CSV', posts.some((p) => p.type === 'screen'), JSON.stringify(posts));
posts.length = 0;
doc.getElementById('tv-srv').click();
check('tombol Server membuka terminal server terpisah', posts.some((p) => p.type === 'serverTerminal'), JSON.stringify(posts));
posts.length = 0;
doc.getElementById('tv-term-srv').click();
check('tombol terminal server di console juga bekerja', posts.some((p) => p.type === 'serverTerminal'), JSON.stringify(posts));

// ── 2. otak terpisah (src/tradingAi.ts) ──────────────────────────────────────
const ai = fs.readFileSync(path.join(root, 'src/tradingAi.ts'), 'utf8');
check('otak trading memakai instance LlamaServer sendiri', /new LlamaServer\(/.test(ai));
check('output channel khusus trading', /createOutputChannel\('Date Skunder Trading AI'\)/.test(ai));
check('terminal bernama TradingView AI', /name: 'TradingView AI'/.test(ai));
check('port bawaan terpisah dari LLAMA (8137)', /tradingAi\.port', 8137/.test(ai));
check('model jatuh ke pengaturan LLAMA bila kosong', /llama\.modelPaths/.test(ai));
check('prompt sistem tegas & terformat', /ARAH: NAIK/.test(ai) && /SINYAL: BUY/.test(ai) && /DATA KURANG/.test(ai) && /tanpa basa-basi|tanpa disclaimer/i.test(ai));
check('level jawaban wajib dari level mesin', /Level mesin/.test(ai));
check('pengetahuan AI dibatasi pasar & trading', /hanya membahas pasar dan trading/i.test(ai) && /di luar pasar/i.test(ai), 'aturan scope tidak ada');
check('jawaban menyesuaikan jenis pertanyaan', /JAWABAN:/.test(ai) && /KAITAN TRADING:/.test(ai) && /SARAN:/.test(ai));
check('aset lain dibahas sebagai instrumen trading', /emas, bitcoin, dolar/i.test(ai));
check('harga wajib disertai waktu data', /waktu data \(WIB\)/i.test(ai));
check('streaming lewat chatStream', /chatStream\(\{/.test(ai));

// ── 2b. pemilihan model + terminal server otak trading ───────────────────────
check('otak trading menyimpan pilihan model sendiri', /workspaceState\.update\(MODEL_KEY/.test(ai) && /listModels\(/.test(ai));
check('otak trading mencari .gguf sendiri (folder umum)', /defaultModelRoots\(\)/.test(ai) && /scanGgufModels\(/.test(ai));
check('terminal server llama-server terpisah', /TradingServerTerminal/.test(ai) && /name: 'TradingView LLAMA Server'/.test(ai));
check('terminal server tampil otomatis saat otak trading menyala', /autoServerTerminal/.test(ai) && /showServerTerminal\(\)/.test(ai));
check('otak trading bisa dijalankan di terminal sendiri', /runInTerminal\(/.test(ai) && /name: 'TradingView Server'/.test(ai));
check('deteksi server luar lewat /health', /httpRequest\(port, '\/health'/.test(ai) && /markExternal\(true\)/.test(ai));
check('server yang sedang memuat model tidak di-restart', /waitReady\(/.test(ai));
check('stop menutup terminal server langsung', /closeServerTerminals/.test(ai));

// ── 2c. panel layar penuh tanpa berkas CSV ────────────────────────────────────
const panel = fs.readFileSync(path.join(root, 'src/tradingPanel.ts'), 'utf8');
check('panel layar penuh memakai webview panel sendiri', /createWebviewPanel\(/.test(panel));
check('panel membuka lapisan TradingView langsung', /SkunderTrading\.open\(/.test(panel) && /ai: true/.test(panel));
check('panel memuat saham.js + tradingview.js', /'saham\.js'/.test(panel) && /'tradingview\.js'/.test(panel));
check('panel punya CSP frame TradingView', /frame-src https:\/\/tradingview\.com[^;]*tradingview-widget\.com/.test(panel));
check('panel menutup jendela lewat hook onClose', /onClose/.test(panel) && /panelClose/.test(panel));

// ── 2d. argumen llama-server otak trading (port & model terpisah) ─────────────
const coreBuilt = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/llamaCore.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
});
const coreMod = { exports: {} };
new Function('module', 'exports', 'require', coreBuilt.outputFiles[0].text)(coreMod, coreMod.exports, require);
const L = coreMod.exports;
const srv = new L.LlamaServer({ extensionPath: root, platform: 'win32' });
const args = srv.buildArgs({ modelPath: 'C:\\models\\qwen.gguf', port: 8137, contextSize: 2048 });
check('argumen memuat -m + model otak trading', args[0] === '-m' && args[1] === 'C:\\models\\qwen.gguf', JSON.stringify(args));
check('argumen memakai port otak trading (8137)', args[args.indexOf('--port') + 1] === '8137', JSON.stringify(args));
check('argumen memakai konteks sendiri', args[args.indexOf('-c') + 1] === '2048', JSON.stringify(args));
const srvCmd = srv.buildCommand({ modelPath: 'C:\\models\\qwen.gguf', port: 8137, contextSize: 2048 });
check('perintah terminal memakai biner llama-server platform ini', /llama-server(\.exe)?/i.test(srvCmd), srvCmd.slice(0, 90));
check('path berspasi dikutip untuk terminal', L.quoteArg('C:\\Program Files\\m.gguf', 'win32') === '"C:\\Program Files\\m.gguf"', L.quoteArg('C:\\Program Files\\m.gguf', 'win32'));

// ── 3. provider view (src/tradingViewView.ts) ────────────────────────────────
check('provider mengambil data nyata', /fetchQuote\(/.test(viewText()));
check('provider menghitung sinyal mesin', /analisa\(quote\)/.test(viewText()));
check('provider menyusun brief untuk LLM', /buildBrief\(t\)/.test(viewText()));
check('riwayat chat memakai ChatStore + database', /ChatStore/.test(viewText()) && /database/.test(fs.readFileSync(path.join(root, 'src/chatStore.ts'), 'utf8')));
check('Community AI memakai database/comunity.txt', /TradeCommunity/.test(viewText()) && /comunity\.txt/.test(fs.readFileSync(path.join(root, 'src/tradeCommunity.ts'), 'utf8')));
check('Community AI mengumumkan sinyal & menjawab chat', /announceCommunity/.test(viewText()) && /askCommunity/.test(viewText()));
check('fitur percakapan baru & muat riwayat', /newChat/.test(viewText()) && /loadSession/.test(viewText()) && /postSessions/.test(viewText()));
check('data pasar disegarkan realtime', /liveRefreshSeconds/.test(viewText()) && /refreshLive\(/.test(viewText()) && /LIVE_TTL_MS/.test(viewText()));
check('simbol chart mengirim watch data live ke AI', /tvAiWatch/.test(viewText()) && /tvAiLive/.test(viewText()));
check('ticker di pertanyaan mengganti konteks data', /applyAskedTicker/.test(viewText()) && /tickerInText/.test(viewText()));
check('konteks data baru diberi catatan', /tvAiInfo/.test(viewText()) && /Konteks data/.test(viewText()));
check('perintah console lengkap', /cmd === 'analisa'/.test(viewText()) && /cmd === 'tanya'/.test(viewText()) && /cmd === 'status'/.test(viewText()));
check('view punya CSP frame TradingView', /frame-src https:\/\/tradingview\.com[^;]*tradingview-widget\.com/.test(viewText()));
check('provider mendaftarkan 3 perintah', /tradingview\.open/.test(viewText()) && /tradingview\.analyze/.test(viewText()) && /tradingview\.terminal/.test(viewText()));
function viewText() { return viewTs; }

// ── 4. berkas ekstensi & package.json ────────────────────────────────────────
const ext = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
check('extension.ts mengimpor provider', /from '\.\/tradingViewView'/.test(ext));
check('extension.ts memanggil registerTradingView', /registerTradingView\(context\)/.test(ext));

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const views = (pkg.contributes.views.dateSkunderAi || []).map((v) => v.id);
const iCompile = views.indexOf('dateSkunder.compileView');
const iTrading = views.indexOf('dateSkunder.tradingView');
check('view TradingView terdaftar', iTrading >= 0, JSON.stringify(views));
eq('TradingView tepat di bawah Compile MSI', iTrading, iCompile + 1);
check('tidak digabung ke Compile MSI', !views.some((v) => /compileView2|msiTrading/.test(v)));
check('nama view "TradingView"', (pkg.contributes.views.dateSkunderAi[iTrading] || {}).name === 'TradingView');
check('perintah tradingview terdaftar', ['open', 'analyze', 'terminal'].every((k) => (pkg.contributes.commands || []).some((c) => c.command === 'date-skunder.tradingview.' + k)));
check('aktivasi onView tradingView', (pkg.activationEvents || []).indexOf('onView:dateSkunder.tradingView') >= 0);
const props = pkg.contributes.configuration.properties;
check('9 pengaturan otak trading', Object.keys(props).filter((k) => k.indexOf('dateSkunder.tradingAi.') === 0).length === 9, String(Object.keys(props).filter((k) => k.indexOf('dateSkunder.tradingAi.') === 0).length));
eq('penyegaran realtime bawaan 30 detik', props['dateSkunder.tradingAi.liveRefreshSeconds'].default, 30);
eq('port trading ≠ port llama', props['dateSkunder.tradingAi.port'].default, 8137);
eq('port llama tetap 8081', props['dateSkunder.llama.port'].default, 8081);
check('media view terdaftar di provider', /tradingview-view\.js/.test(viewText()) && /tradingview-view\.css/.test(viewText()));
check('media Markdown dimuat di view', /'md\.js'/.test(viewText()));
check('view menawarkan pemilih model', /id="tv-model"/.test(viewText()) && /modelsRefresh/.test(viewText()));
check('view membuka layar penuh tanpa CSV', /openScreen/.test(viewText()) && /TradingPanel\.open/.test(viewText()));
check('view meneruskan chat lapisan ke otak trading', /handleOverlayMessage/.test(viewText()) && /tvAiAsk/.test(viewText()));
check('view menyediakan terminal server otak trading', /serverTerminal/.test(viewText()) && /runServerInTerminal/.test(viewText()));
check('perintah baru terdaftar di package.json', ['screen', 'models', 'serverTerminal', 'serverRun'].every((k) => (pkg.contributes.commands || []).some((c) => c.command === 'date-skunder.tradingview.' + k)));
check('perintah baru punya activationEvent', ['screen', 'models', 'serverTerminal', 'serverRun'].every((k) => (pkg.activationEvents || []).indexOf('onCommand:date-skunder.tradingview.' + k) >= 0));
check('extension meneruskan pesan chat lapisan ke otak trading', /handleOverlayMessage\(panel\.webview, m\)/.test(ext));
check('extension membuka panel layar penuh tanpa CSV', /openScreen\(\)/.test(ext));

// ── hasil ────────────────────────────────────────────────────────────────────
window.close();
if (fails.length) {
    console.error('\n✗ TradingView: ' + fails.length + ' uji gagal\n');
    fails.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
console.log('✓ TradingView: ' + ok.length + ' uji lolos (view terpisah, model .gguf, chat AI lapisan, terminal server, layar penuh tanpa CSV)');
