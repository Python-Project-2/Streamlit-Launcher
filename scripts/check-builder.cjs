/*
 * Uji regresi Chart Builder (media/builder.js) tanpa VS Code:
 * - semua tipe grafik bisa dirender kontrolnya (dropdown) tanpa error,
 * - candlestick/OHLC mendapat kontrol x/o/h/l/c/v,
 * - mengganti tipe kartu lewat dropdown tidak melempar error (mis. ReferenceError TDZ).
 * Jalankan: npm run check:builder
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div><div class="grid" id="charts"></div><div class="grid pv-grid"><div class="card wide"></div></div></body></html>',
    { pretendToBeVisual: true, runScripts: 'outside-only' }
);
const { window } = dom;
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() { }, removeListener() { } }));
class ChartStub {
    static register() { }
    constructor(cv, conf) { this.canvas = cv; this.conf = conf; }
    destroy() { } stop() { } update() { }
}
window.Chart = ChartStub;

window.eval(fs.readFileSync(path.join(root, 'media/candles.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(root, 'media/builder.js'), 'utf8'));

const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Ticker'];
const rows = [];
for (let i = 0; i < 40; i++) {
    const base = 1000 + i * 5;
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    rows.push([
        d.toISOString().slice(0, 10),
        base, base + 12, base - 9, base + 4, 10000 + i * 250, i % 2 ? 'BBCA' : 'BBRI',
    ]);
}
const col = (name, type, extra) => Object.assign({ name, type, unique: 40, count: 40, missing: 0, std: 1 }, extra);
const sheet = {
    name: 'Sheet1', fileName: 'saham.csv', headers, rows, totalRows: rows.length, scatters: [],
    columns: [
        col('Date', 'date'), col('Open', 'number'), col('High', 'number'), col('Low', 'number'),
        col('Close', 'number'), col('Volume', 'number'), col('Ticker', 'category', { unique: 2 }),
    ],
};

const doc = window.document;
const app = doc.getElementById('app');
const el = (tag, cls, html) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
};
const store = {};
window.SkunderExt.init({
    app, sheet, state: { fileName: 'saham.csv' },
    vscode: { getState: () => store, setState: (s) => Object.assign(store, s) },
    el, esc: (s) => String(s), fmt: (n) => String(n), cut: (s) => String(s).slice(0, 12),
    PALETTE: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948'],
    section: (id, title) => {
        const sec = el('section', 'card wide');
        const body = el('div', 'grid');
        sec.append(el('h2', null, title), body);
        app.appendChild(sec);
        return body;
    },
    chart: () => { }, figure: () => { }, treeSvg: () => '',
});

const problems = [];
const card = doc.querySelector('.bcard');
if (!card) {
    problems.push('Chart Builder tidak membuat satu kartu pun');
} else {
    const defaultCandle = [...doc.querySelectorAll('.bcard')].find((c) => c._cfg.type === 'candle');
    if (!defaultCandle) problems.push('data OHLC tidak menghasilkan kartu candlestick bawaan');
    else {
        const keys = [...defaultCandle.querySelectorAll('.bctl select[data-k]')].map((s) => s.dataset.k);
        for (const k of ['x', 'o', 'h', 'l', 'c', 'v']) {
            if (!keys.includes(k)) problems.push('kontrol candlestick tidak punya dropdown "' + k + '"');
        }
    }

    const types = ['bar', 'barh', 'stacked100', 'line', 'area', 'pareto', 'pie', 'doughnut', 'polar', 'radar',
        'hist', 'scatter', 'bubble', 'waterfall', 'diverging', 'boxplot', 'areastack', 'areastack100', 'gauge',
        'timeline', 'heatmap', 'lollipop', 'sunburst2', 'candle', 'ohlc'];
    const sel = card.querySelector('.bhead select[data-k="type"]');
    for (const t of types) {
        try {
            sel.value = t;
            sel.dispatchEvent(new window.Event('change', { bubbles: true }));
            if (!card.querySelector('.bctl') || !card.querySelector('.bctl select[data-k]')) {
                problems.push('kontrol kosong untuk tipe "' + t + '"');
            }
        } catch (e) {
            problems.push('tipe "' + t + '" melempar error: ' + (e && e.message));
        }
    }
}

if (problems.length) {
    console.error(problems.map((p) => 'FAIL ' + p).join('\n'));
    process.exit(1);
}
console.log('OK  Chart Builder: kontrol semua tipe grafik tampil tanpa error (termasuk candlestick/OHLC).');
