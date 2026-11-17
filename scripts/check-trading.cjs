/*
 * Uji regresi “Mode Analisis” (media/tradingview.js + media/saham.js) tanpa VS Code:
 * - seksi + tombol pembuka + kotak pencarian muncul di halaman analisis,
 * - overlay penuh memasang widget resmi TradingView sebagai iframe berukuran 100% × 100%,
 * - konfigurasi widget (simbol, interval, tema, zona waktu, indikator) ikut terkirim,
 * - ganti interval/simbol memuat ulang widget dengan nilai baru,
 * - tiap tab memasang widget yang sesuai (teknikal, fundamental, screener, berita),
 * - tab “Cari Saham” memuat katalog lengkap IDX + filter sektor + pilih simbol,
 * - tidak ada lagi Trading Demo / Trading Real / akun broker di mana pun,
 * - Esc menutup lapisan; menu editor/title + CSP frame TradingView ada di berkas ekstensi.
 * Jalankan: npm run check:trading
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM(
    '<!doctype html><html><body data-ec-lang="id"><div id="app"></div></body></html>',
    { pretendToBeVisual: true, runScripts: 'outside-only', url: 'https://skunder.test/' }
);
const { window } = dom;
const doc = window.document;

const fails = [];
const ok = [];
function check(name, cond, extra) {
    if (cond) { ok.push(name); return; }
    fails.push(name + (extra ? ' — ' + extra : ''));
}
function eq(name, actual, expected) {
    check(name, actual === expected, 'dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
}

// ── stub halaman analisis (main.js) ────────────────────────────────────────────
const app = doc.getElementById('app');
const el = (tag, cls, html) => {
    const e = doc.createElement(tag);
    if (cls) { e.className = cls; }
    if (html !== undefined) { e.innerHTML = html; }
    return e;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function section(id, title) {
    const sec = el('section', 'sec');
    sec.id = id;
    sec.appendChild(el('h2', '', title));
    const body = el('div', 'grid');
    sec.appendChild(body);
    app.appendChild(sec);
    return body;
}

const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Ticker'];
const rows = [];
for (let i = 0; i < 30; i++) {
    const base = 9000 + i * 25;
    rows.push([new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), base, base + 40, base - 40, base + 10, 5000 + i, i % 3 ? 'BBCA' : 'BBRI']);
}
const sheet = { name: 'Sheet1', fileName: 'saham.csv', headers, rows, totalRows: rows.length, columns: [], scopes: [] };
const posts = [];
const ctx = {
    app, sheet, state: { fileName: 'saham.csv' },
    vscode: { postMessage: (m) => posts.push(m) },
    /** Hook panel mandiri: dipanggil saat lapisan ditutup (Esc / tombol tutup). */
    onClose: () => posts.push({ type: 'panelClose' }),
    el, esc, fmt: (n) => String(n), cut: (s) => String(s).slice(0, 12), section,
};

window.eval(fs.readFileSync(path.join(root, 'media/saham.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'media/tradingview.js'), 'utf8'));

// ── 0. katalog pencarian saham ─────────────────────────────────────────────────
const katalog = window.SkunderSaham;
check('katalog saham termuat', !!katalog);
check('katalog IDX lengkap (>900 emiten)', katalog.jumlah > 900, String(katalog.jumlah));
eq('simbol memakai awalan IDX:', katalog.items[0][0].indexOf('IDX:') === 0, true);
check('entri BBCA ada beserta nama', /Bank Central Asia/.test(katalog.nameOf('IDX:BBCA')), katalog.nameOf('IDX:BBCA'));
check('katalog memuat indeks & saham AS', !!katalog.byCode('IDX:COMPOSITE') && !!katalog.byCode('NASDAQ:TSLA'));
check('pencarian kode: “bbca” → BBCA lebih dulu', katalog.cari('bbca', 5)[0][0] === 'IDX:BBCA', JSON.stringify(katalog.cari('bbca', 3)));
check('pencarian nama: “telkom” menemukan TLKM', katalog.cari('telkom', 20).some((it) => it[0] === 'IDX:TLKM'));
check('pencarian sektor: “financials” banyak hasil', katalog.cari('financials', 0).length > 30, String(katalog.cari('financials', 0).length));
check('filter sektor tersedia', katalog.sectors.length >= 8, JSON.stringify(katalog.sectors));

// ── 1. seksi di halaman analisis ───────────────────────────────────────────────
window.SkunderTrading.init(ctx);
const sec = doc.getElementById('trading');
check('seksi #trading dibuat', !!sec);
check('tombol pembuka ada', !!doc.getElementById('btn-trading-open'));
check('chip simbol cepat ada', !!doc.querySelector('#tv-lchips .tv-lchip'));
check('kotak pencarian saham di seksi ada', !!doc.getElementById('tv-lsearch'));
check('simbol terdeteksi dari kolom Ticker', /IDX:BBCA/.test(sec.textContent), sec.textContent.slice(0, 140));
check('seksi menyebut jumlah emiten', /941|9\d\d/.test(sec.textContent), sec.textContent.slice(0, 200));
check('seksi tidak menjual trading demo/real', !/paper trading|broker|trading real/i.test(sec.textContent));

// ── 2. overlay + widget ────────────────────────────────────────────────────────
doc.getElementById('btn-trading-open').click();
const ov = doc.getElementById('tv-ov');
check('overlay penuh terbuka', !!ov);
check('membuka mode analisis meminta data live simbol', posts.some((p) => p.type === 'tvAiWatch' && p.symbol === 'IDX:BBCA'), JSON.stringify(posts.slice(-4)));
check('z-index lapisan di atas EasyCast', /2147483200/.test(doc.getElementById('sk-tv-css').textContent));
check('berat body dikunci saat terbuka', doc.body.style.overflow === 'hidden');

function frames() { return [...ov.querySelectorAll('.tv-frame')]; }
function srcOf(kind) {
    return frames().map((f) => f.getAttribute('src') || '').filter((s) => s.indexOf('/embed-widget/' + kind + '/') > 0)[0] || '';
}
function configOf(kind) {
    const src = srcOf(kind);
    if (!src) { return null; }
    const hash = src.slice(src.indexOf('#') + 1);
    try { return JSON.parse(decodeURIComponent(hash)); } catch (e) { return null; }
}
function kinds() {
    return frames().map((f) => (f.getAttribute('src') || '').match(/\/embed-widget\/([^/]+)\//)).filter(Boolean).map((m) => m[1]);
}

check('chart memakai iframe widget resmi', /^https:\/\/www\.tradingview-widget\.com\/embed-widget\/advanced-chart\//.test(srcOf('advanced-chart')), srcOf('advanced-chart').slice(0, 90));
check('iframe berukuran penuh (CSS 100% × 100%)', /\.tv-frame\{[^}]*width:100%[^}]*height:100%/.test(doc.getElementById('sk-tv-css').textContent));
check('kotak widget punya penanda memuat', !!ov.querySelector('.tv-wbox .tv-skel'));
check('warna latar kotak widget mengikuti tema', ov.style.getPropertyValue('--tv-bg') === '#131722', ov.style.getPropertyValue('--tv-bg'));

const ac = configOf('advanced-chart');
eq('simbol chart = IDX:BBCA', ac && ac.symbol, 'IDX:BBCA');
eq('interval awal = D', ac && ac.interval, 'D');
eq('tema widget mengikuti tema halaman', ac && ac.theme, 'dark');
eq('zona waktu awal', ac && ac.timezone, 'Asia/Jakarta');
check('chart autosize', ac && ac.autosize === true);
check('toolbar samping aktif', ac && ac.hide_side_toolbar === false);
check('ganti simbol dari chart diizinkan', ac && ac.allow_symbol_change === true);
check('tanpa indikator bawaan (chart paling andal)', Array.isArray(ac && ac.studies) && ac.studies.length === 0, JSON.stringify(ac && ac.studies));

// ── 3. tidak ada trading demo/real ─────────────────────────────────────────────
check('tombol Trading Demo hilang', !ov.querySelector('button.tv-demo, #tv-btn-demo'));
check('tombol Trading Real hilang', !ov.querySelector('button.tv-real, #tv-btn-real'));
check('tidak ada kata “paper trading”/“broker”/“eksekusi”', !/paper trading|broker|eksekusi/i.test(ov.textContent), ov.textContent.slice(0, 120));
check('tab Trading dihapus', ![...ov.querySelectorAll('.tv-tab')].some((b) => b.dataset.tvTab === 'trade'));
check('tab Akun dihapus', ![...ov.querySelectorAll('.tv-tab')].some((b) => b.dataset.tvTab === 'account'));
eq('jumlah tab = 8 (chart, teknikal, fundamental, screener, berita, cari, buku, media)', ov.querySelectorAll('.tv-tab').length, 8);
check('tab Buku tersedia di Mode Analisis', [...ov.querySelectorAll('.tv-tab')].some((b) => b.dataset.tvTab === 'buku'));
check('tab Gambar & Video tersedia di Mode Analisis', [...ov.querySelectorAll('.tv-tab')].some((b) => b.dataset.tvTab === 'media'));

// tab Buku: cari → hasil → Free sample membuka panel pembaca (tanpa keluar aplikasi)
{
    posts.length = 0;
    [...ov.querySelectorAll('.tv-tab')].find((b) => b.dataset.tvTab === 'buku').click();
    const bookQ = doc.getElementById('tv-book-q');
    check('tab Buku punya kolom pencarian', !!bookQ && !!doc.getElementById('tv-book-go'));
    bookQ.value = 'bandarmologi';
    doc.getElementById('tv-book-go').click();
    check('cari buku mengirim tvBookSearch', posts.some((p) => p.type === 'tvBookSearch' && p.q === 'bandarmologi'), JSON.stringify(posts.slice(-2)));
    aiSend({ type: 'tvBookResults', items: [{ id: 'abc123', title: 'Bandarmologi', authors: ['Rina'], viewability: 'PARTIAL' }], info: '1 buku' });
    const sample = doc.querySelector('#tv-book-list .tv-sample');
    check('hasil buku tampil dengan tombol Free sample', !!sample, doc.getElementById('tv-book-list').textContent.slice(0, 90));
    posts.length = 0;
    sample.click();
    check('Free sample meminta panel pembaca', posts.some((p) => p.type === 'tvBookRead' && p.id === 'abc123'), JSON.stringify(posts));
    [...ov.querySelectorAll('.tv-tab')].find((b) => b.dataset.tvTab === 'chart').click();
}

// tab Media (Pexels): cari → grid gambar → pratinjau → unduh → video
{
    posts.length = 0;
    [...ov.querySelectorAll('.tv-tab')].find((b) => b.dataset.tvTab === 'media').click();
    const mediaQ = doc.getElementById('tv-media-q');
    check('tab Media punya pencarian + toggle gambar/video', !!mediaQ && !!doc.getElementById('tv-media-go') && doc.querySelectorAll('.tv-seg').length === 2);
    posts.length = 0;
    mediaQ.value = 'chart';
    doc.getElementById('tv-media-go').click();
    check('cari media mengirim tvMediaSearch', posts.some((p) => p.type === 'tvMediaSearch' && p.kind === 'photo' && p.q === 'chart'), JSON.stringify(posts.slice(-2)));
    aiSend({
        type: 'tvMediaResults', kind: 'photo', total: 50, page: 1, q: 'chart',
        items: [{
            kind: 'photo', id: 1, title: 'Chart saham', thumb: 'https://images.pexels.com/a.jpg',
            preview: 'https://images.pexels.com/a2.jpg', download: 'https://images.pexels.com/a3.jpg',
            page: 'https://www.pexels.com/photo/1/', width: 1200, height: 800, author: 'Rina',
            authorUrl: 'https://www.pexels.com/@rina',
        }],
    });
    check('hasil gambar tampil di grid', doc.querySelectorAll('#tv-media-list .tv-mcard').length === 1, String(doc.querySelectorAll('#tv-media-list .tv-mcard').length));
    posts.length = 0;
    doc.querySelector('#tv-media-list .tv-primary').click();
    check('pratinjau media dikirim ke ekstensi', posts.some((p) => p.type === 'tvMediaPreview' && p.hit && p.hit.id === 1), JSON.stringify(posts));
    posts.length = 0;
    doc.querySelector('#tv-media-list .tv-mdl').click();
    check('unduh media dikirim ke ekstensi', posts.some((p) => p.type === 'tvMediaDownload' && p.hit && p.hit.id === 1), JSON.stringify(posts));
    posts.length = 0;
    [...doc.querySelectorAll('.tv-seg')][1].click();
    check('toggle Video meminta hasil video', posts.some((p) => p.type === 'tvMediaSearch' && p.kind === 'video'), JSON.stringify(posts.slice(-2)));
    [...ov.querySelectorAll('.tv-tab')].find((b) => b.dataset.tvTab === 'chart').click();
}

// ── 4. ganti interval lewat bar atas ──────────────────────────────────────────
const selInt = doc.getElementById('tv-interval');
selInt.value = '60';
selInt.dispatchEvent(new window.Event('change'));
check('interval berubah ke 1 jam', (configOf('advanced-chart') || {}).interval === '60', JSON.stringify(configOf('advanced-chart')));

// ── 5. ganti simbol lewat input + saran otomatis ──────────────────────────────
const inp = doc.getElementById('tv-symbol');
inp.value = 'tlkm';
doc.querySelector('#tv-ov .tv-sym button').click();
check('simbol baru dinormalkan ke IDX:TLKM', (configOf('advanced-chart') || {}).symbol === 'IDX:TLKM');
check('footer ikut simbol baru + namanya', /IDX:TLKM/.test(doc.getElementById('tv-foot').textContent) && /Telkom/.test(doc.getElementById('tv-foot').textContent), doc.getElementById('tv-foot').textContent);

inp.value = 'bank';
inp.dispatchEvent(new window.Event('input'));
const panel = doc.getElementById('tv-symbol-ac');
check('saran otomatis muncul saat mengetik', panel && panel.hidden === false && panel.querySelectorAll('.tv-ac-item').length > 3, panel && panel.innerHTML.slice(0, 80));
check('saran menampilkan nama perusahaan', /Bank/.test(panel.textContent), panel.textContent.slice(0, 120));
const firstSug = panel.querySelector('.tv-ac-item');
const sugSym = firstSug.querySelector('.tv-kode').textContent;
firstSug.click();
check('pilih saran → simbol berganti', inp.value === 'IDX:' + sugSym && (configOf('advanced-chart') || {}).symbol === 'IDX:' + sugSym, inp.value + ' / ' + JSON.stringify((configOf('advanced-chart') || {}).symbol));

// ── 6. tab lain memasang widget yang tepat ────────────────────────────────────
function openTab(name) {
    const btn = [...ov.querySelectorAll('.tv-tab')].filter((b) => b.dataset.tvTab === name)[0];
    btn.click();
}
openTab('tech');
check('tab teknikal: gauge + info simbol + chart', ['technical-analysis', 'symbol-info', 'advanced-chart'].every((k) => kinds().indexOf(k) >= 0), JSON.stringify(kinds()));
openTab('chart');
check('rel kanan terisi gauge + info + berita', ['technical-analysis', 'symbol-info', 'timeline'].every((k) => kinds().indexOf(k) >= 0));
check('widget info simbol membawa simbol di query string', /[?&]symbol=IDX%3A/.test(srcOf('symbol-info')), srcOf('symbol-info').slice(0, 130));
check('gauge teknikal memakai interval yang valid (1h)', (configOf('technical-analysis') || {}).interval === '1h', JSON.stringify(configOf('technical-analysis')));
check('widget berita dipaksa bahasa Inggris', /[?&]locale=en(&|#|$)/.test(srcOf('timeline')), srcOf('timeline').slice(0, 120));
check('widget berita tidak membawa simbol salah', srcOf('timeline').indexOf('AAPL') < 0);
check('ikon memakai svg monokrom (tanpa emoji)', ov.querySelectorAll('.tv-i').length > 6 && !/[📈🧪🏦🔎📰💹🕯️⚙️⛶🔍]/u.test(ov.textContent));
openTab('fund');
check('tab fundamental: laporan + profil simbol', kinds().indexOf('financials') >= 0 && kinds().indexOf('symbol-profile') >= 0, JSON.stringify(kinds()));
check('tab fundamental tidak memakai id widget keliru', kinds().indexOf('company-profile') < 0);
openTab('screen');
check('tab screener: screener + hotlist IDX', kinds().indexOf('screener') >= 0 && kinds().indexOf('hotlists') >= 0);
check('hotlist memakai bursa IDX', (configOf('hotlists') || {}).exchange === 'IDX');
check('screener pasar Indonesia', (configOf('screener') || {}).market === 'indonesia');
openTab('news');
check('tab berita: timeline simbol + kalender ekonomi', kinds().indexOf('timeline') >= 0 && kinds().indexOf('events') >= 0);

// ── 7. tab Cari Saham (katalog lengkap) ───────────────────────────────────────
openTab('cari');
const cari = doc.getElementById('tv-cari');
const list = doc.getElementById('tv-cari-list');
check('tab cari: daftar simbol tampil', !!cari && list.querySelectorAll('.tv-item').length > 50, String(list.querySelectorAll('.tv-item').length));
check('tab cari: info jumlah simbol', /941|9\d\d/.test(doc.getElementById('tv-cari-info').textContent), doc.getElementById('tv-cari-info').textContent);
check('tab cari: baris memuat nama + sektor', /Bank/.test(list.textContent) && /Financials/.test(list.textContent), list.textContent.slice(0, 120));

cari.value = 'telkom';
cari.dispatchEvent(new window.Event('input'));
const items = [...list.querySelectorAll('.tv-item')].map((b) => b.dataset.sym);
check('cari “telkom” menyaring daftar', items.length > 0 && items.every((s) => /TLKM|TELKOM/.test(s)), JSON.stringify(items.slice(0, 5)));

const secSel = doc.getElementById('tv-cari-sector');
secSel.value = 'Financials';
secSel.dispatchEvent(new window.Event('change'));
cari.value = '';
cari.dispatchEvent(new window.Event('input'));
const bankRows = [...list.querySelectorAll('.tv-item')];
check('filter sektor Financials bekerja', bankRows.length > 30 && bankRows.every((b) => /Financials/.test(b.textContent)), String(bankRows.length));

const pick = list.querySelector('.tv-item');
const pickSym = pick.dataset.sym;
pick.click();
check('pilih baris → simbol aktif + pindah ke chart', window.SkunderTrading.cfg.symbol === pickSym && (configOf('advanced-chart') || {}).symbol === pickSym, pickSym + ' / ' + JSON.stringify(window.SkunderTrading.cfg));

// ── 8. setelan: indikator cepat ───────────────────────────────────────────────
openTab('chart');
doc.getElementById('tv-btn-settings').click();
const setBox = doc.getElementById('tv-set');
check('panel setelan terbuka', setBox && setBox.hidden === false);
const rsi = [...setBox.querySelectorAll('.tv-studies label')].filter((l) => /RSI/.test(l.textContent))[0];
rsi.querySelector('input').checked = true;
rsi.querySelector('input').dispatchEvent(new window.Event('change'));
check('indikator RSI ikut terkirim ke chart', ((configOf('advanced-chart') || {}).studies || []).indexOf('STD;RSI') >= 0, JSON.stringify((configOf('advanced-chart') || {}).studies));
check('panel setelan tetap terbuka setelah ganti setelan', doc.getElementById('tv-set').hidden === false);

// ── 8b. chat AI analisa di lapisan (drawer kanan, otak trading terpisah) ───────
const aiBtn = doc.getElementById('tv-btn-ai');
check('tombol Analisa AI ada di bar atas', !!aiBtn);
const drawer = doc.getElementById('tv-ai');
check('drawer AI dibuat dan tersembunyi', !!drawer && drawer.hidden === true);
posts.length = 0;
aiBtn.click();
check('klik tombol membuka drawer AI', drawer.hidden === false);
check('membuka drawer meminta keadaan + daftar model', posts.some((p) => p.type === 'tvAiState') && posts.some((p) => p.type === 'tvAiModels'), JSON.stringify(posts.slice(0, 4)));

function aiSend(data) { window.dispatchEvent(new window.MessageEvent('message', { data })); }
aiSend({
    type: 'tvAiState',
    ai: {
        state: 'running', port: 8137, ready: true, modelPath: 'D:/models/qwen.gguf',
        models: [{ path: 'D:/models/qwen.gguf', name: 'qwen.gguf', size: '4.1 GB' }],
    },
});
const modelSel = doc.getElementById('tv-ai-model');
check('daftar model otak trading terisi', modelSel.options.length === 1 && modelSel.value === 'D:/models/qwen.gguf', modelSel.innerHTML.slice(0, 80));
check('chip status menyebut port otak trading', /8137/.test(doc.getElementById('tv-ai-chip').textContent), doc.getElementById('tv-ai-chip').textContent);
check('tombol server menjadi Hentikan saat siap', /Hentikan/.test(doc.getElementById('tv-ai-start').textContent), doc.getElementById('tv-ai-start').textContent);

posts.length = 0;
modelSel.value = 'D:/models/qwen.gguf';
modelSel.dispatchEvent(new window.Event('change'));
check('ganti model mengirim pilihan ke ekstensi', posts.some((p) => p.type === 'tvAiModel' && p.path === 'D:/models/qwen.gguf'), JSON.stringify(posts));

posts.length = 0;
const aiQ = doc.getElementById('tv-ai-q');
aiQ.value = 'aman buy sekarang?';
doc.getElementById('tv-ai-send').click();
check('pertanyaan AI membawa simbol aktif', posts.some((p) => p.type === 'tvAiAsk' && p.text === 'aman buy sekarang?' && p.symbol === window.SkunderTrading.cfg.symbol), JSON.stringify(posts));
check('gelembung pertanyaan tampil', /aman buy sekarang\?/.test(doc.getElementById('tv-ai-log').textContent));

aiSend({ type: 'tvAiThink' });
aiSend({ type: 'tvAiChunk', text: 'ARAH: NAIK\nSINYAL: BUY\n' });
check('potongan jawaban AI tampil saat streaming', /SINYAL: BUY/.test(doc.getElementById('tv-ai-log').textContent));
aiSend({ type: 'tvAiAnswer', text: 'ARAH: NAIK\nSINYAL: BUY\nENTRY: 4.350' });
check('jawaban AI final tampil', /ENTRY: 4.350/.test(doc.getElementById('tv-ai-log').textContent), doc.getElementById('tv-ai-log').textContent.slice(-90));
aiSend({ type: 'tvAiError', text: 'model belum dipilih' });
check('galat AI tampil di drawer', /model belum dipilih/.test(doc.getElementById('tv-ai-log').textContent));

aiSend({ type: 'tvAiLive', symbol: 'IDX:BBCA', sesi: 'Sesi 1', waktu: '21:05:12 WIB', teknik: { symbol: 'IDX:BBCA', last: 9350, changePct: 1.24 } });
const liveText = doc.getElementById('tv-ai-live').textContent;
check('baris harga live tampil di drawer', /9\.350/.test(liveText) && /\+1,24%/.test(liveText) && /21:05:12 WIB/.test(liveText), liveText);

posts.length = 0;
const liveInput = doc.getElementById('tv-symbol');
liveInput.value = 'TLKM';
liveInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
check('ganti simbol chart meminta data live simbol baru', posts.some((p) => p.type === 'tvAiWatch' && p.symbol === 'IDX:TLKM'), JSON.stringify(posts.slice(0, 4)));

aiSend({ type: 'tvAiInfo', text: 'Konteks data → IDX:TLKM' });
const afterContext = doc.getElementById('tv-ai-log').textContent;
check('catatan konteks data baru tampil', /Konteks data → IDX:TLKM/.test(afterContext) && /aman buy sekarang/.test(afterContext), afterContext.slice(-100));

doc.getElementById('tv-ai-x').click();
check('tombol tutup hanya menutup drawer', doc.getElementById('tv-ai').hidden === true && !!doc.getElementById('tv-ov'));

// ── 9. tombol muat ulang + Esc ────────────────────────────────────────────────
const beforeFrame = frames().filter((f) => (f.getAttribute('src') || '').indexOf('/advanced-chart/') > 0)[0];
doc.getElementById('tv-btn-reload').click();
const afterFrame = frames().filter((f) => (f.getAttribute('src') || '').indexOf('/advanced-chart/') > 0)[0];
check('muat ulang menggambar ulang widget', !!afterFrame && afterFrame !== beforeFrame, 'iframe lama masih dipakai');

window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
check('Esc menutup overlay', !doc.getElementById('tv-ov'));
check('scroll body dipulihkan', doc.body.style.overflow === '');
check('hook tutup dipanggil (panel mandiri bisa menutup jendelanya)', posts.some((p) => p.type === 'panelClose'), JSON.stringify(posts.slice(-3)));

// ── 9b. mode layar penuh tanpa berkas CSV: drawer AI langsung terbuka ─────────
posts.length = 0;
window.SkunderTrading.open({ symbol: 'IDX:TLKM', ai: true });
check('lapisan bisa dibuka tanpa data CSV', !!doc.getElementById('tv-ov') && /IDX:TLKM/.test(doc.getElementById('tv-symbol').value), doc.getElementById('tv-symbol').value);
check('drawer AI langsung terbuka pada mode tanpa CSV', doc.getElementById('tv-ai').hidden === false);
check('membuka lapisan meminta status + model otak trading', posts.some((p) => p.type === 'tvAiState') && posts.some((p) => p.type === 'tvAiModels'), JSON.stringify(posts.slice(0, 3)));
window.SkunderTrading.close();

// ── 9c. panel mandiri (tanpa CSV): init tanpa seksi + chat + hook tutup ──────
{
    const dom2 = new JSDOM('<!doctype html><html><body class="tv-standalone"></body></html>', { runScripts: 'outside-only', url: 'https://skunder.test/panel' });
    const w2 = dom2.window;
    const posts2 = [];
    let closed = 0;
    w2.eval(fs.readFileSync(path.join(root, 'media/saham.js'), 'utf8'));
    w2.eval(fs.readFileSync(path.join(root, 'media/tradingview.js'), 'utf8'));
    w2.SkunderTrading.init({
        vscode: { postMessage: (m) => posts2.push(m) },
        state: { fileName: '' },
        onClose: () => { closed++; posts2.push({ type: 'panelClose' }); },
    });
    check('panel mandiri: init tanpa seksi tidak membuat seksi', !w2.document.getElementById('trading'));
    w2.SkunderTrading.open({ symbol: 'IDX:TLKM', ai: true });
    check('panel mandiri: overlay penuh terbuka tanpa data', !!w2.document.getElementById('tv-ov'));
    check('panel mandiri: drawer AI langsung terbuka', w2.document.getElementById('tv-ai').hidden === false);
    posts2.length = 0;
    w2.document.getElementById('tv-ai-q').value = 'trend naik?';
    w2.document.getElementById('tv-ai-send').click();
    check('panel mandiri: pertanyaan dikirim dengan simbol aktif', posts2.some((p) => p.type === 'tvAiAsk' && p.symbol === 'IDX:TLKM' && p.text === 'trend naik?'), JSON.stringify(posts2.slice(0, 3)));
    w2.document.getElementById('tv-btn-close').click();
    check('panel mandiri: tombol tutup memanggil hook onClose', closed === 1 && !w2.document.getElementById('tv-ov'), String(closed));
    w2.close();
}

// ── 10. berkas ekstensi: menu + CSP + pemuatan skrip ──────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const titleMenus = (pkg.contributes.menus['editor/title'] || []).filter((m) => m.command === 'date-skunder.trading.open');
check('menu editor/title mendaftarkan mode analisis', titleMenus.length === 1);
eq('posisi menu di samping ikon lain', titleMenus[0] && titleMenus[0].group, 'navigation@0.5');
check('perintah punya ikon tradingview.svg', (pkg.contributes.commands || []).some((c) => c.command === 'date-skunder.trading.open' && /tradingview\.svg$/.test(c.icon || '')));
check('judul perintah tidak lagi menyebut demo & real', !/demo|real/i.test(((pkg.contributes.commands || []).filter((c) => c.command === 'date-skunder.trading.open')[0] || {}).title || ''));

const ext = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
check('CSP mengizinkan frame TradingView', /frame-src https:\/\/tradingview\.com[^;]*tradingview-widget\.com/.test(ext));
check('CSP mengizinkan script s3.tradingview.com', /script-src[^;]*https:\/\/s3\.tradingview\.com/.test(ext));
check('halaman memuat media/tradingview.js', /joinPath\(media, 'tradingview\.js'\)/.test(ext));
check('halaman memuat media/saham.js', /joinPath\(media, 'saham\.js'\)/.test(ext));
check('perintah trading.open terdaftar di ekstensi', /registerCommand\('date-skunder\.trading\.open'/.test(ext));

// ── 11. Pexels + grid buku di lapisan ─────────────────────────────────────────
const props = (pkg.contributes.configuration || {}).properties || {};
const pexelsKey = props['dateSkunder.media.pexelsApiKey'];
check('API key Pexels tersimpan di konfigurasi', pexelsKey && /^LH59/.test(pexelsKey.default || ''), pexelsKey && pexelsKey.default);
check('ukuran hasil media bisa diatur', Boolean(props['dateSkunder.media.perPage']));
const tvJs = fs.readFileSync(path.join(root, 'media/tradingview.js'), 'utf8');
check('tab Buku memakai grid + harga', /tv-bgrid/.test(tvJs) && /tv-bprice/.test(tvJs));
check('tab Media punya grid gambar/video', /tv-mgrid/.test(tvJs) && /tv-seg/.test(tvJs));
check('media bisa dipratinjau & diunduh', /tvMediaPreview/.test(tvJs) && /tvMediaDownload/.test(tvJs));

// ── hasil ──────────────────────────────────────────────────────────────────────
window.close();
if (fails.length) {
    console.error('\n✗ Mode Analisis: ' + fails.length + ' uji gagal\n');
    fails.forEach((f) => console.error('  - ' + f));
    process.exit(1);
}
console.log('✓ Mode Analisis: ' + ok.length + ' uji lolos (katalog saham, overlay, widget, tab, pencarian, menu, CSP, drawer AI, panel mandiri)');
