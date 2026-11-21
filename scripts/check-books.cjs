/*
 * Uji regresi view “Pustaka Trading” (pencarian buku trading & saham).
 *
 * Cakupan:
 *  • bookCatalog: query khusus trading, fallback, normalisasi Google Books, relevansi, paging;
 *  • package.json: view terdaftar di bawah Compile MSI, perintah, API key, aktivasi;
 *  • src/bookView.ts: Google Books API, paging, fallback key, popup;
 *  • media/books.js/css: infinite scroll, popup baca, seluruh metadata ditampilkan.
 *
 * Jalankan: npm run check:books
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

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

function bundle(entry) {
    const built = esbuild.buildSync({
        entryPoints: [path.join(root, entry)],
        bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
    });
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
    return mod.exports;
}

const K = bundle('src/bookCatalog.ts');

// ── query ───────────────────────────────────────────────────────────────────
check('topik trading tersedia', K.BOOK_TOPICS.length >= 8, String(K.BOOK_TOPICS.length));
const qDefault = K.buildQuery('', 'semua');
check('query kosong tetap fokus trading', /trading|saham/i.test(qDefault), qDefault);
const qTopic = K.buildQuery('', 'teknikal');
check('topik teknikal memakai kata kunci teknikal', /analisis teknikal/i.test(qTopic), qTopic);
const qKnown = K.buildQuery('bandarmologi', 'semua');
eq('kata kunci trading tidak ditambah berlebihan', qKnown, 'bandarmologi');
const qUnknown = K.buildQuery('manajemen waktu', 'semua');
check('kata umum diberi konteks trading', /trading saham/.test(qUnknown), qUnknown);
eq('fallback memakai input asli', K.fallbackQuery('manajemen waktu', 'semua'), 'manajemen waktu');
check('fallback tanpa input memakai topik', /pasar modal|trading/i.test(K.fallbackQuery('', 'idx')), K.fallbackQuery('', 'idx'));

// ── normalisasi item Google Books ───────────────────────────────────────────
const item = {
    id: 'abc123',
    volumeInfo: {
        title: 'Trading Saham untuk Pemula',
        subtitle: 'Dari nol sampai disiplin',
        authors: ['Rina', 'Bagas'],
        publisher: 'Penerbit Pasar',
        publishedDate: '2021-05-01',
        description: '<p>Buku <b>saham</b> &amp; trading.</p><br><p>Bab risiko.</p>',
        categories: ['Business & Economics'],
        pageCount: 240,
        language: 'id',
        averageRating: 4.5,
        ratingsCount: 120,
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9786020000001' }],
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc123&edge=curl' },
        previewLink: 'https://books.google.co.id/books?id=abc123',
        infoLink: 'https://books.google.co.id/books?id=abc123',
    },
    accessInfo: {
        viewability: 'PARTIAL',
        embeddable: true,
        epub: { isAvailable: true },
        pdf: { isAvailable: false },
    },
    saleInfo: {
        saleability: 'FOR_SALE',
        listPrice: { amount: 150000, currencyCode: 'IDR' },
        buyLink: 'https://play.google.com/store/books/details?id=abc123',
    },
};
const book = K.normalizeVolume(item);
check('judul terbaca', book && book.title === 'Trading Saham untuk Pemula', book && book.title);
check('penulis terbaca', book && book.authors.join(',') === 'Rina,Bagas', book && book.authors.join(','));
check('deskripsi HTML dibersihkan', book && !/[<>]/.test(book.description) && /saham/.test(book.description), book && book.description);
check('thumbnail dipaksa HTTPS', book && /^https:\/\//.test(book.thumbnail), book && book.thumbnail);
check('ISBN-13 diambil', book && book.isbn === '9786020000001', book && book.isbn);
check('halaman & rating terbaca', book && book.pageCount === 240 && book.rating === 4.5, book && JSON.stringify([book.pageCount, book.rating]));
check('status baca & embed terbaca', book && book.viewability === 'PARTIAL' && book.embeddable === true, book && String(book.viewability));
check('EPUB/PDF terbaca', book && book.epub === true && book.pdf === false, book && String([book.epub, book.pdf]));
check('harga terbaca', book && /150\.000|150000/.test(book.price || ''), book && book.price);
check('buku ditandai relevan trading', book && book.relevant === true, book && String(book.relevance));

const novel = K.normalizeVolume({
    id: 'n1',
    volumeInfo: { title: 'Novel Hujan', authors: ['A'], description: 'Cerita romansa di kota.', categories: ['Fiction'] },
});
check('buku non-trading tetap ditampilkan (tidak dibuang)', novel && novel.title === 'Novel Hujan');
check('buku non-trading ditandai tidak relevan', novel && novel.relevant === false, novel && String(novel.relevance));
eq('item rusak diabaikan', K.normalizeVolume(null), undefined);

const list = K.dedupeVolumes([book, book, novel]);
eq('duplikat id dibuang', list.length, 2);

// ── paging ──────────────────────────────────────────────────────────────────
eq('halaman berikut = 20', K.nextStart(0, 20, 100, 20), 20);
eq('berhenti saat total tercapai', K.nextStart(80, 20, 100, 100), null);
check('ringkasan hasil menyebut total', /100/.test(K.resultSummary('trading', 'semua', 100, 20)), K.resultSummary('trading', 'semua', 100, 20));
check('ringkasan kosong menjelaskan', /Tidak ada hasil/.test(K.resultSummary('zzz', 'semua', 0, 0)));

// ── UI webview (jsdom): kartu, filter, popup baca, infinite scroll ─────────
const html = `<!DOCTYPE html><html><body>
<span id="bk-source"></span>
<input id="bk-q"><button id="bk-go"></button>
<div id="bk-topics"></div><span id="bk-count"></span>
<input id="bk-rel" type="checkbox">
<div id="bk-note" hidden></div><div id="bk-grid"></div>
<div id="bk-status" hidden></div><div id="bk-sentinel"></div>
<div id="bk-modal" hidden><span id="bk-m-title"></span><div id="bk-m-body"></div><button id="bk-m-close"></button></div>
</body></html>`;
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://pustaka.test/' });
const win = dom.window;
const posts = [];
win.acquireVsCodeApi = () => ({ postMessage: (m) => { posts.push(m); } });
win.eval(fs.readFileSync(path.join(root, 'media/books.js'), 'utf8'));
const doc = win.document;
const send = (data) => win.dispatchEvent(new win.MessageEvent('message', { data }));
check('webview mengirim ready', posts.some((p) => p.type === 'ready'));
send({ type: 'init', topics: K.BOOK_TOPICS, hasKey: true, source: 'Google Books API' });
check('pembukaan pertama langsung mencari buku', posts.some((p) => p.type === 'search'), JSON.stringify(posts));
send({ type: 'results', items: [book, novel], total: 100, loaded: 2, nextIndex: 2, summary: '2 dari 100 buku', append: false });
check('semua buku langsung ditampilkan', doc.querySelectorAll('.bk-card').length === 2, String(doc.querySelectorAll('.bk-card').length));
doc.querySelector('.bk-card').click();
check('klik kartu meminta detail buku', posts.some((p) => p.type === 'open' && p.id === book.id));
send({ type: 'book', book: Object.assign({}, book, { description: 'Deskripsi lengkap buku.', embeddable: true, viewability: 'PARTIAL' }) });
check('popup buku terbuka', doc.getElementById('bk-modal').hidden === false);
check('popup memasang pembaca Google Books', Boolean(doc.querySelector('.bk-reader iframe')) && /books\.google\.com/.test(doc.querySelector('.bk-reader iframe').src));
check('popup menampilkan seluruh detail', /ISBN/.test(doc.getElementById('bk-m-body').textContent) && /Deskripsi lengkap buku/.test(doc.getElementById('bk-m-body').textContent));
posts.length = 0;
doc.querySelector('.bk-detail-actions .bk-btn.primary').click();
check('tombol Free sample meminta panel pembaca', posts.some((p) => p.type === 'read' && p.id === book.id), JSON.stringify(posts));
doc.getElementById('bk-m-close').click();
check('popup bisa ditutup', doc.getElementById('bk-modal').hidden === true);
doc.getElementById('bk-rel').checked = true;
doc.getElementById('bk-rel').dispatchEvent(new win.Event('change'));
check('filter opsional menyisakan buku trading saja', doc.querySelectorAll('.bk-card').length === 1, String(doc.querySelectorAll('.bk-card').length));
doc.getElementById('bk-rel').checked = false;
doc.getElementById('bk-rel').dispatchEvent(new win.Event('change'));
check('semua buku tetap bisa ditampilkan', doc.querySelectorAll('.bk-card').length === 2, String(doc.querySelectorAll('.bk-card').length));
posts.length = 0;
win.dispatchEvent(new win.Event('scroll'));
check('scroll bawah memuat halaman berikutnya', posts.some((p) => p.type === 'more' && p.startIndex === 2), JSON.stringify(posts));

// ── manifest ────────────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const views = pkg.contributes.views.dateSkunderAi.map((v) => v.id);
const iCompile = views.indexOf('dateSkunder.compileView');
const iTrading = views.indexOf('dateSkunder.tradingView');
const iBooks = views.indexOf('dateSkunder.booksView');
check('view Pustaka Trading terdaftar', iBooks >= 0, views.join(','));
check('Pustaka Trading berada di bawah Compile MSI', iBooks > iCompile, `compile=${iCompile}, books=${iBooks}`);
check('Pustaka Trading berada di bawah TradingView', iBooks > iTrading, `trading=${iTrading}, books=${iBooks}`);
const viewDef = pkg.contributes.views.dateSkunderAi.find((v) => v.id === 'dateSkunder.booksView');
eq('nama view = Trading Library', viewDef && viewDef.name, 'Trading Library');
check('aktivasi view buku', pkg.activationEvents.includes('onView:dateSkunder.booksView'));
check('perintah buku terdaftar', pkg.contributes.commands.some((c) => c.command === 'date-skunder.books.open'));
check('perintah cari buku terdaftar', pkg.contributes.commands.some((c) => c.command === 'date-skunder.books.search'));
const keyCfg = pkg.contributes.configuration.properties['dateSkunder.books.googleApiKey'];
check('API key Google Books tersimpan di konfigurasi', keyCfg && keyCfg.default === 'AIzaSyBY9UXwDmZGb3x0DBsFGqSHWHyaaD_d3FY', keyCfg && keyCfg.default);
check('ukuran halaman bisa diatur', Boolean(pkg.contributes.configuration.properties['dateSkunder.books.pageSize']));

// ── view & media ────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(root, 'src/bookView.ts'), 'utf8');
check('memakai endpoint Google Books', /googleapis\.com\/books\/v1\/volumes/.test(src));
check('memakai API key', /books\.googleApiKey/.test(src));
check('ada paging startIndex', /startIndex=/.test(src));
check('ada query cadangan', /fallbackQuery/.test(src));
check('CSP mengizinkan frame Google Books', /frame-src https:\/\/\*\.google\.com/.test(src));
check('detail buku diambil per id', /API_BASE[\s\S]{0,40}encodeURIComponent\(id\)/.test(src));
check('view membuka panel pembaca (Free sample)', /BookReaderPanel\.open/.test(src));
const readerSrc = fs.readFileSync(path.join(root, 'src/bookReader.ts'), 'utf8');
check('panel pembaca menampilkan sampul + harga', /br-cover/.test(readerSrc) && /br-price/.test(readerSrc));
check('panel pembaca memakai grid info', /br-info/.test(readerSrc) && /grid-template-columns/.test(readerSrc));

const js = fs.readFileSync(path.join(root, 'media/books.js'), 'utf8');
check('infinite scroll memakai IntersectionObserver', /IntersectionObserver/.test(js));
check('ada jaring pengaman scroll', /addEventListener\('scroll'/.test(js));
check('kartu memuat seluruh metadata utama', /pageCount/.test(js) && /ratingsCount/.test(js) && /isbn/.test(js));
check('popup menampilkan deskripsi lengkap', /Full description/.test(js));
check('popup memasang iframe pembaca', /books\.google\.com\/books\?id=/.test(js));
check('pembaca memakai output=embed', /output=embed/.test(js));
check('tutup popup menghentikan iframe', /eMBody\.textContent = ''/.test(js));

const css = fs.readFileSync(path.join(root, 'media/books.css'), 'utf8');
check('gaya popup ada', /\.bk-modal/.test(css) && /\.bk-reader/.test(css));
check('gaya kartu ada', /\.bk-card/.test(css));

const ext = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
check('extension mendaftarkan view buku', /registerBookView\(context\)/.test(ext));

if (fails.length) {
    console.error('GAGAL ' + fails.length + ':');
    fails.forEach((f) => console.error('  ✗ ' + f));
    console.error('\nLulus: ' + ok.length);
    process.exit(1);
}
console.log('✓ Pustaka Trading: ' + ok.length + ' uji lolos (Google Books, infinite scroll, popup baca)');
