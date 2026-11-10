/* global Chart */
/**
 * “Grafik Pratinjau Data” — grafik cepat untuk fitur (kolom) yang dipilih di halaman
 * pratinjau CSV/Excel. Panel ini:
 *  • menampilkan setiap kolom sebagai chip “fitur” yang bisa dinyalakan/dimatikan,
 *  • menyediakan 16 jenis grafik + pilihan agregasi (jumlah baris, total, rata-rata, …),
 *  • mengikuti kotak pencarian pada tabel data (opsional, bawaan aktif),
 *  • mengingat pilihan fitur per berkas + sheet.
 *
 * Grafik di sini sengaja tidak dimasukkan ke daftar `charts` halaman utama, supaya isi
 * export DOCX/PDF/PPT (yang mengambil gambar dari daftar itu) tidak berubah.
 */
(function () {
    'use strict';

    const TYPES = [
        ['auto', '🪄 Otomatis (per tipe)'],
        ['bar', '📊 Batang'],
        ['barh', '📊 Batang horizontal'],
        ['line', '📈 Garis (line)'],
        ['area', '🏔️ Area'],
        ['step', '🪜 Garis bertingkat'],
        ['stacked', '🧱 Batang bertumpuk'],
        ['stacked100', '🧱 100% bertumpuk'],
        ['pareto', '📉 Pareto'],
        ['lollipop', '🍭 Lollipop'],
        ['pie', '🥧 Pie'],
        ['doughnut', '🍩 Donut'],
        ['polar', '🎯 Polar area'],
        ['radar', '🕸️ Radar'],
        ['hist', '▥ Histogram + kumulatif'],
        ['boxplot', '📦 Boxplot (Q1–Q3 + median)'],
        ['scatter', '⚬ Scatter + trendline'],
        ['candle', '🕯️ Candlestick (saham OHLC)'],
        ['ohlc', '📊 Bar OHLC (saham)'],
    ];
    // Nama pendek untuk label kecil di kartu (tanpa emoji).
    const NAME = {
        auto: 'Otomatis', bar: 'Batang', barh: 'Batang horizontal', line: 'Garis (line)', area: 'Area',
        step: 'Garis bertingkat', stacked: 'Bertumpuk', stacked100: '100% bertumpuk', pareto: 'Pareto',
        lollipop: 'Lollipop', pie: 'Pie', doughnut: 'Donut', polar: 'Polar', radar: 'Radar',
        hist: 'Histogram', boxplot: 'Boxplot', scatter: 'Scatter', candle: 'Candlestick', ohlc: 'OHLC',
    };
    const AGGS = [
        ['count', 'Jumlah baris'],
        ['sum', 'Total (sum)'],
        ['mean', 'Rata-rata'],
        ['median', 'Median'],
        ['min', 'Minimum'],
        ['max', 'Maksimum'],
        ['distinct', 'Nilai unik'],
    ];
    const SORTS = [
        ['auto', 'Otomatis'],
        ['desc', 'Nilai ↓ (besar → kecil)'],
        ['asc', 'Nilai ↑ (kecil → besar)'],
        ['label', 'Label A–Z'],
    ];
    const TOPNS = [
        [10, 'Top 10'], [12, 'Top 12'], [15, 'Top 15'], [20, 'Top 20'], [30, 'Top 30'], [0, 'Semua nilai'],
    ];
    const TYPE_LABEL = { number: 'Desimal', integer: 'Bulat', id: 'ID', date: 'Tanggal', boolean: 'Boolean', category: 'Kategori', text: 'Teks' };
    const TYPE_ICON = { number: '🔢', integer: '🔢', id: '🆔', date: '📅', boolean: '✅', category: '🏷️', text: '📝' };
    const MAX_CARDS = 8;

    let P, S, PAL, charts = [], cfg = null, host = null, chipBox = null, drawTimer = 0;

    let lang = 'id';
    /** Select “Agregasi” — dipakai untuk menyelaraskan nilainya saat kolom Nilai (Y) dipilih. */
    let aggSel = null;

    // Label di dalam kanvas tidak bisa diterjemahkan mesin i18n (bukan teks DOM),
    // jadi beberapa kata kunci grafik diterjemahkan langsung di sini.
    const L = (id, zh) => (lang === 'zh-cn' ? zh : id);

    // ── siklus hidup ───────────────────────────────────────────────────────────

    function destroyCharts() {
        charts.forEach((c) => { try { c.destroy(); } catch (e) { } });
        charts = [];
    }

    function destroy() {
        destroyCharts();
        host = null;
        chipBox = null;
        aggSel = null;
        if (drawTimer) { clearTimeout(drawTimer); drawTimer = 0; }
    }

    const key = () => P.state.fileName + '|' + S.name;

    function loadCfg() {
        const st = P.vscode.getState() || {};
        const saved = ((st.preview || {})[key()] || null);
        const c = Object.assign({ type: 'auto', y: '', agg: 'count', group: '', topn: 12, sort: 'auto', follow: true, feats: [] }, saved || {});
        c.feats = Array.isArray(c.feats) ? c.feats.filter((n) => S.headers.includes(n)) : [];
        if (!c.feats.length) { c.feats = pickDefaults(); }
        return c;
    }

    function saveCfg() {
        if (!P || !S || !cfg) { return; }
        const st = P.vscode.getState() || {};
        st.preview = st.preview || {};
        st.preview[key()] = { type: cfg.type, y: cfg.y, agg: cfg.agg, group: cfg.group, topn: cfg.topn, sort: cfg.sort, follow: cfg.follow, feats: cfg.feats.slice(0, MAX_CARDS) };
        P.vscode.setState(st);
    }

    /** Fitur awal: satu kategori, satu angka, satu tanggal, lalu angka kedua. */
    function pickDefaults() {
        const out = [];
        const cats = S.columns.filter((c) => (c.type === 'category' || c.type === 'boolean') && c.unique >= 2);
        const nums = S.columns.filter((c) => isNum(c) && c.num && c.num.std > 0);
        const dates = S.columns.filter((c) => c.type === 'date');
        if (cats[0]) { out.push(cats[0].name); }
        if (nums[0]) { out.push(nums[0].name); }
        if (dates[0]) { out.push(dates[0].name); }
        if (nums[1]) { out.push(nums[1].name); }
        return out.slice(0, 4);
    }

    // ── util data ──────────────────────────────────────────────────────────────

    const isNum = (c) => !!c && (c.type === 'number' || c.type === 'integer');
    const colName = (i) => (i >= 0 && S.headers[i] ? S.headers[i] : '');

    function numIndex(name) {
        const i = name ? S.headers.indexOf(name) : -1;
        return i >= 0 && isNum(S.columns[i]) ? i : -1;
    }

    /** Kotak (bin) 12 bagian untuk kolom angka yang punya banyak nilai unik. */
    function makeBins(col) {
        const mn = col.num ? col.num.min : 0;
        const mx = col.num ? col.num.max : 0;
        const k = 12;
        const w = (mx - mn) / k || 1;
        const labels = [];
        for (let i = 0; i < k; i++) { labels.push(P.fmt(mn + i * w) + ' – ' + P.fmt(mn + (i + 1) * w)); }
        return { k, w, min: mn, labels };
    }

    function bucketKey(col, v, bins) {
        if (v === null || v === undefined || v === '') { return null; }
        if (col.type === 'date') {
            const s = String(v);
            if (s.length < 4) { return s; }
            const g = col.gran || 'month';
            return s.slice(0, g === 'year' ? 4 : g === 'month' ? 7 : 10);
        }
        if (bins) {
            const n = Number(v);
            if (!isFinite(n)) { return null; }
            const i = Math.min(bins.k - 1, Math.max(0, Math.floor((n - bins.min) / bins.w)));
            return bins.labels[i];
        }
        return String(v);
    }

    /** Kumpulkan nilai per kategori. `yi` < 0 berarti hanya menghitung baris. */
    function aggMap(rows, ci, yi, agg, bins) {
        const needVals = yi >= 0 && (agg === 'median' || agg === 'min' || agg === 'max');
        const needSet = yi >= 0 && agg === 'distinct';
        const col = S.columns[ci];
        const map = new Map();
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const k = bucketKey(col, row[ci], bins);
            if (k === null) { continue; }
            let b = map.get(k);
            if (!b) { b = { n: 0, nc: 0, sum: 0, vals: null, set: null }; map.set(k, b); }
            b.n++;
            if (yi >= 0) {
                const v = row[yi];
                if (typeof v === 'number' && isFinite(v)) {
                    b.nc++;
                    b.sum += v;
                    if (needVals) { (b.vals || (b.vals = [])).push(v); }
                    if (needSet) { (b.set || (b.set = new Set())).add(v); }
                }
            }
        }
        return map;
    }

    function median(vals) {
        if (!vals || !vals.length) { return 0; }
        const s = vals.slice().sort((a, b) => a - b);
        const m = s.length >> 1;
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    function aggValue(b, agg, hasY) {
        if (!hasY || agg === 'count') { return b.n; }
        if (agg === 'sum') { return b.sum; }
        if (agg === 'mean') { return b.nc ? b.sum / b.nc : 0; }
        if (agg === 'median') { return median(b.vals); }
        if (agg === 'distinct') { return b.set ? b.set.size : 0; }
        if (agg === 'min' || agg === 'max') {
            if (!b.vals || !b.vals.length) { return 0; }
            let m = b.vals[0];
            for (let i = 1; i < b.vals.length; i++) {
                m = agg === 'min' ? Math.min(m, b.vals[i]) : Math.max(m, b.vals[i]);
            }
            return m;
        }
        return b.n;
    }

    /**
     * Daftar {k, v} per kategori, sudah diurutkan dan dipotong sesuai pengaturan.
     * Kolom tanggal & bin angka memakai urutan alami (kronologis / batas nilai).
     */
    function bucketList(rows, ci, col, yi, agg, bins) {
        const map = aggMap(rows, ci, yi, agg, bins);
        let items = [...map.entries()].map(([k, b]) => ({ k, v: aggValue(b, agg, yi >= 0) }));
        const natural = !!bins || col.type === 'date';
        if (natural) {
            const order = bins ? new Map(bins.labels.map((l, i) => [l, i])) : null;
            items.sort((a, b) => (order ? (order.get(a.k) ?? 0) - (order.get(b.k) ?? 0) : String(a.k).localeCompare(String(b.k))));
        } else if (cfg.sort === 'label') {
            items.sort((a, b) => String(a.k).localeCompare(String(b.k)));
        } else if (cfg.sort === 'asc') {
            items.sort((a, b) => a.v - b.v);
        } else {
            items.sort((a, b) => b.v - a.v);
        }
        if (cfg.topn > 0 && !natural) { items = items.slice(0, cfg.topn); }
        return items;
    }

    function rowsFor() {
        const rows = S.rows || [];
        if (!cfg.follow) { return rows; }
        const input = document.getElementById('sk-table-search');
        const q = input && input.value ? String(input.value).trim().toLowerCase() : '';
        if (!q) { return rows; }
        const out = [];
        for (const r of rows) {
            if (r.some((v) => v !== null && String(v).toLowerCase().includes(q))) { out.push(r); }
        }
        return out;
    }

    function linreg(pts) {
        const n = pts.length;
        if (n < 2) { return { slope: 0, b: 0, r: 0 }; }
        let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
        for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
        const den = n * sxx - sx * sx;
        const slope = den ? (n * sxy - sx * sy) / den : 0;
        const b = (sy - slope * sx) / n;
        const rDen = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
        const r = rDen ? (n * sxy - sx * sy) / rDen : 0;
        return { slope, b, r: Math.round(r * 1000) / 1000 };
    }

    // ── konfigurasi grafik ────────────────────────────────────────────────────

    function autoType(col) {
        if (isNum(col)) { return col.unique > 12 ? 'hist' : 'bar'; }
        if (col.type === 'date') { return 'line'; }
        return 'barh';
    }

    function effectiveType(col) {
        return cfg.type === 'auto' ? autoType(col) : cfg.type;
    }

    function catConfig(labels, values, type) {
        const colors = values.map((_, i) => PAL[i % PAL.length]);
        if (type === 'pie' || type === 'doughnut' || type === 'polar') {
            return {
                type: type === 'polar' ? 'polarArea' : type,
                data: { labels, datasets: [{ data: values, backgroundColor: colors.map((c) => c + 'cc'), borderColor: colors, borderWidth: 1 }] },
                options: { plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } },
            };
        }
        if (type === 'radar') {
            return {
                type: 'radar',
                data: { labels, datasets: [{ label: L('Nilai', '数值'), data: values, borderColor: PAL[0], backgroundColor: PAL[0] + '44', pointRadius: 2 }] },
                options: { plugins: { legend: { display: false } }, scales: { r: { beginAtZero: true } } },
            };
        }
        if (type === 'pareto') {
            const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
            const lab = order.map((i) => labels[i]);
            const val = order.map((i) => values[i]);
            const total = val.reduce((a, b) => a + b, 0) || 1;
            let acc = 0;
            const cum = val.map((v) => { acc += v; return Math.round((acc / total) * 1000) / 10; });
            return {
                type: 'bar',
                data: {
                    labels: lab,
                    datasets: [
                        { label: L('Nilai', '数值'), data: val, backgroundColor: PAL[0] + 'cc', borderRadius: 3, yAxisID: 'y' },
                        { type: 'line', label: L('Kumulatif %', '累计 %'), data: cum, borderColor: PAL[2], backgroundColor: PAL[2], pointRadius: 2, tension: 0.3, yAxisID: 'y1' },
                    ],
                },
                options: {
                    plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                    scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false } } },
                },
            };
        }
        if (type === 'lollipop') {
            return {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: L('Nilai', '数值'), data: values, backgroundColor: PAL[0] + '55', barPercentage: 0.16, categoryPercentage: 0.9, borderRadius: 4 },
                        { type: 'line', label: L('Titik', '数据点'), data: values, showLine: false, pointRadius: 5, pointHoverRadius: 6, borderColor: PAL[0], backgroundColor: PAL[0] },
                    ],
                },
                options: { plugins: { legend: { display: false } } },
            };
        }
        const isLine = type === 'line' || type === 'area' || type === 'step';
        if (isLine) {
            return {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: L('Nilai', '数值'), data: values, borderColor: PAL[0], backgroundColor: PAL[0] + '33',
                        fill: type === 'area', stepped: type === 'step', tension: type === 'step' ? 0 : 0.3, pointRadius: 2,
                    }],
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
            };
        }
        return {
            type: 'bar',
            data: { labels, datasets: [{ label: L('Nilai', '数值'), data: values, backgroundColor: colors.map((c) => c + 'cc'), borderRadius: 3 }] },
            options: {
                indexAxis: type === 'barh' ? 'y' : 'x',
                plugins: { legend: { display: false } },
                scales: type === 'barh' ? { x: { beginAtZero: true } } : { y: { beginAtZero: true } },
            },
        };
    }

    function histConfig(rows, ci, col) {
        const vals = [];
        for (const r of rows) { const v = r[ci]; if (typeof v === 'number' && isFinite(v)) { vals.push(v); } }
        if (vals.length < 2) { return null; }
        let mn = Infinity, mx = -Infinity;
        for (const v of vals) { if (v < mn) { mn = v; } if (v > mx) { mx = v; } }
        const k = Math.max(6, Math.min(20, Math.round(Math.sqrt(vals.length)) || 8));
        const w = (mx - mn) / k || 1;
        const counts = new Array(k).fill(0);
        for (const v of vals) { counts[Math.min(k - 1, Math.floor((v - mn) / w))]++; }
        const labels = counts.map((_, i) => P.fmt(mn + i * w) + '–' + P.fmt(mn + (i + 1) * w));
        const total = vals.length;
        let acc = 0;
        const cum = counts.map((c) => { acc += c; return Math.round((acc / total) * 1000) / 10; });
        return {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: L('Frekuensi', '频数'), data: counts, backgroundColor: PAL[0] + 'cc', borderRadius: 2, yAxisID: 'y' },
                    { type: 'line', label: L('Kumulatif %', '累计 %'), data: cum, borderColor: PAL[2], backgroundColor: PAL[2], pointRadius: 0, tension: 0.3, yAxisID: 'y1' },
                ],
            },
            options: {
                plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: {
                    y: { beginAtZero: true, title: { display: true, text: L('Frekuensi', '频数') } },
                    y1: { position: 'right', beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } },
                    x: { ticks: { autoSkip: true, maxRotation: 45, font: { size: 9 } } },
                },
            },
        };
    }

    function boxStats(vals) {
        const s = vals.slice().sort((a, b) => a - b);
        const q = (p) => {
            const pos = (s.length - 1) * p;
            const base = Math.floor(pos);
            const rest = pos - base;
            return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
        };
        return { min: s[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: s[s.length - 1] };
    }

    function boxConfig(rows, ci, col) {
        if (!isNum(col)) { return null; }
        const gi = cfg.group ? S.headers.indexOf(cfg.group) : -1;
        const groups = new Map();
        for (const r of rows) {
            const v = r[ci];
            if (typeof v !== 'number' || !isFinite(v)) { continue; }
            const k = gi >= 0 ? (r[gi] === null || r[gi] === '' ? L('(kosong)', '（空）') : String(r[gi])) : L('Semua data', '全部数据');
            const arr = groups.get(k) || [];
            arr.push(v);
            groups.set(k, arr);
        }
        let items = [...groups.entries()].filter(([, v]) => v.length > 1).slice(0, 10);
        if (!items.length) { return null; }
        items = items.sort((a, b) => median(b[1]) - median(a[1]));
        const stats = items.map(([, v]) => boxStats(v));
        return {
            type: 'bar',
            data: {
                labels: items.map(([k]) => P.cut(k, 16)),
                datasets: [
                    { label: 'Q1–Q3', data: stats.map((s) => [s.q1, s.q3]), backgroundColor: PAL[0] + '88', borderColor: PAL[0], borderSkipped: false, borderRadius: 3 },
                    { type: 'line', label: 'Median', data: stats.map((s) => s.med), showLine: false, pointStyle: 'rectRot', pointRadius: 7, borderColor: PAL[2], backgroundColor: PAL[2] },
                ],
            },
            options: {
                plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: { y: { beginAtZero: true } },
            },
        };
    }

    function stackedConfig(rows, ci, col, gi, yi, agg, type) {
        const bins = isNum(col) && col.unique > 12 ? makeBins(col) : null;
        const map = new Map();
        const totals = new Map();
        for (const r of rows) {
            const k = bucketKey(col, r[ci], bins);
            if (k === null) { continue; }
            const g = r[gi] === null || r[gi] === '' ? L('(kosong)', '（空）') : String(r[gi]);
            totals.set(g, (totals.get(g) || 0) + 1);
            let inner = map.get(k);
            if (!inner) { inner = new Map(); map.set(k, inner); }
            let b = inner.get(g);
            if (!b) { b = { n: 0, nc: 0, sum: 0, vals: null, set: null }; inner.set(g, b); }
            b.n++;
            if (yi >= 0) {
                const v = r[yi];
                if (typeof v === 'number' && isFinite(v)) { b.nc++; b.sum += v; }
            }
        }
        let labels = [...map.keys()];
        if (bins) {
            const order = new Map(bins.labels.map((l, i) => [l, i]));
            labels.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
        } else if (col.type === 'date') {
            labels.sort((a, b) => String(a).localeCompare(String(b)));
        } else if (cfg.sort === 'label') {
            labels.sort((a, b) => String(a).localeCompare(String(b)));
        } else {
            const tot = (k) => [...map.get(k).values()].reduce((s, b) => s + aggValue(b, agg, yi >= 0), 0);
            labels.sort((a, b) => (cfg.sort === 'asc' ? tot(a) - tot(b) : tot(b) - tot(a)));
        }
        if (cfg.topn > 0 && col.type !== 'date' && !bins) { labels = labels.slice(0, cfg.topn); }

        const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
        const rest = [...totals.keys()].filter((g) => !top.includes(g));
        const series = top.map((g) => ({
            name: g,
            data: labels.map((k) => { const b = (map.get(k) || new Map()).get(g); return b ? aggValue(b, agg, yi >= 0) : 0; }),
        }));
        if (rest.length) {
            series.push({
                name: 'Lainnya',
                data: labels.map((k) => {
                    const inner = map.get(k);
                    if (!inner) { return 0; }
                    return rest.reduce((s, g) => { const b = inner.get(g); return s + (b ? aggValue(b, agg, yi >= 0) : 0); }, 0);
                }),
            });
        }
        const datasets = series.map((s, i) => ({ label: s.name, data: s.data, backgroundColor: PAL[i % PAL.length] + (type === 'stacked100' ? 'dd' : 'cc'), borderRadius: 2 }));
        if (type === 'stacked100') {
            labels.forEach((k, i) => {
                const tot = datasets.reduce((s, d) => s + (d.data[i] || 0), 0) || 1;
                datasets.forEach((d) => { d.data[i] = Math.round(((d.data[i] || 0) / tot) * 1000) / 10; });
            });
        }
        return {
            type: 'bar',
            data: { labels: labels.map((l) => P.cut(l, 18)), datasets },
            options: {
                plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, max: type === 'stacked100' ? 100 : undefined },
                },
            },
        };
    }

    function categoryConfig(rows, ci, col, type) {
        const yi = numIndex(cfg.y);
        const agg = yi >= 0 ? cfg.agg : 'count';
        const gi = cfg.group ? S.headers.indexOf(cfg.group) : -1;
        if ((type === 'stacked' || type === 'stacked100') && gi >= 0) {
            return stackedConfig(rows, ci, col, gi, yi, agg, type);
        }
        const bins = isNum(col) && col.unique > 12 ? makeBins(col) : null;
        const items = bucketList(rows, ci, col, yi, agg, bins);
        if (!items.length) { return null; }
        const labels = items.map((it) => P.cut(it.k, type === 'pie' || type === 'doughnut' ? 22 : 18));
        const values = items.map((it) => Math.round(it.v * 1000) / 1000);
        return catConfig(labels, values, type === 'stacked' || type === 'stacked100' ? 'bar' : type);
    }

    function scatterConfig(rows) {
        const idx = cfg.feats.map((n) => S.headers.indexOf(n)).filter((i) => i >= 0 && isNum(S.columns[i]));
        if (idx.length < 2) { return null; }
        const xi = idx[0], yi = idx[1];
        const pts = [];
        for (const r of rows) {
            const x = r[xi], y = r[yi];
            if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) {
                pts.push({ x, y });
                if (pts.length >= 3000) { break; }
            }
        }
        if (pts.length < 2) { return null; }
        const fit = linreg(pts);
        let lo = Infinity, hi = -Infinity;
        for (const p of pts) { if (p.x < lo) { lo = p.x; } if (p.x > hi) { hi = p.x; } }
        return {
            type: 'scatter',
            data: {
                datasets: [
                    { label: colName(xi) + ' vs ' + colName(yi), data: pts, backgroundColor: PAL[0] + '99', pointRadius: 3 },
                    { type: 'line', label: L('Tren', '趋势') + ' (r = ' + fit.r + ')', data: [{ x: lo, y: fit.slope * lo + fit.b }, { x: hi, y: fit.slope * hi + fit.b }], borderColor: PAL[2], borderDash: [6, 4], borderWidth: 2, pointRadius: 0 },
                ],
            },
            options: {
                plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: { x: { title: { display: true, text: colName(xi) } }, y: { title: { display: true, text: colName(yi) } } },
            },
        };
    }

    // ── statistik ringkas di bawah grafik ──────────────────────────────────────

    function statsLine(rows, ci, col) {
        let n = 0;
        if (isNum(col)) {
            let mn = Infinity, mx = -Infinity, sum = 0;
            for (const r of rows) {
                const v = r[ci];
                if (typeof v === 'number' && isFinite(v)) { n++; sum += v; if (v < mn) { mn = v; } if (v > mx) { mx = v; } }
            }
            if (!n) { return 'Tidak ada nilai angka pada filter ini.'; }
            return n.toLocaleString('en-US') + ' nilai · min ' + P.fmt(mn) + ' · rata-rata ' + P.fmt(sum / n) + ' · maks ' + P.fmt(mx);
        }
        const counts = new Map();
        for (const r of rows) {
            const v = r[ci];
            if (v === null || v === '') { continue; }
            n++;
            const k = String(v);
            counts.set(k, (counts.get(k) || 0) + 1);
        }
        if (!n) { return 'Tidak ada nilai pada filter ini.'; }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        const share = Math.round((top[1] / n) * 1000) / 10;
        return n.toLocaleString('en-US') + ' nilai · ' + counts.size.toLocaleString('en-US') + ' unik · terbanyak “' + P.cut(top[0], 24) + '” (' + share + '%)';
    }

    // ── gambar kartu ──────────────────────────────────────────────────────────

    function addCard(title, badge, typeName) {
        const card = P.el('div', 'card pv-card');
        const head = P.el('div', 'pv-card-head');
        const h = document.createElement('h3');
        h.textContent = title;
        head.appendChild(h);
        if (badge) { head.appendChild(P.el('span', 'badge t-' + badge, TYPE_LABEL[badge] || badge)); }
        if (typeName) { head.appendChild(P.el('span', 'muted pv-type', typeName)); }
        card.appendChild(head);
        const box = P.el('div', 'cbox');
        const cv = document.createElement('canvas');
        box.appendChild(cv);
        card.appendChild(box);
        host.appendChild(card);
        return { card, box, cv };
    }

    function drawInto(slot, conf) {
        if (!conf) {
            slot.box.innerHTML = '<div class="empty">Data tidak cukup untuk grafik ini.</div>';
            return;
        }
        // Kanvas mengikuti tinggi kotak (bukan rasio bawaan Chart.js).
        conf.options = Object.assign({ responsive: true, maintainAspectRatio: false }, conf.options || {});
        try {
            charts.push(new Chart(slot.cv, conf));
        } catch (e) {
            slot.box.innerHTML = '<div class="empty">Grafik gagal digambar: ' + P.esc(e.message || e) + '</div>';
        }
    }

    function featureCard(rows, name) {
        const ci = S.headers.indexOf(name);
        const col = S.columns[ci];
        if (!col) { return; }
        let type = effectiveType(col);
        let note = '';
        // Jenis grafik yang tidak cocok untuk fitur ini → pakai jenis bawaan + keterangan.
        if (type === 'boxplot' && !isNum(col)) {
            type = autoType(col);
            note = 'Boxplot hanya untuk fitur angka — memakai jenis grafik bawaan.';
        }
        if ((type === 'stacked' || type === 'stacked100') && (!cfg.group || cfg.group === name)) {
            type = 'bar';
            note = cfg.group === name
                ? 'Kolom pecahan sama dengan fitur ini — ditampilkan sebagai batang.'
                : 'Pilih “Pecah per” untuk grafik bertumpuk — ditampilkan sebagai batang.';
        }
        const slot = addCard(name, col.type, NAME[type] || type);
        slot.card.appendChild(P.el('div', 'pv-foot', (note ? note + ' ' : '') + statsLine(rows, ci, col)));
        const conf = type === 'hist' ? histConfig(rows, ci, col)
            : type === 'boxplot' ? boxConfig(rows, ci, col)
                : categoryConfig(rows, ci, col, type);
        drawInto(slot, conf);
    }

    function draw() {
        if (!host) { return; }
        destroyCharts();
        [...host.querySelectorAll('.pv-card, .pv-empty')].forEach((n) => n.remove());
        const rows = rowsFor();
        if (!rows.length) {
            host.appendChild(P.el('div', 'pv-empty muted', 'Tidak ada baris yang cocok dengan filter tabel.'));
            return;
        }
        const feats = cfg.feats.filter((n) => S.headers.includes(n));
        if (!feats.length) {
            host.appendChild(P.el('div', 'pv-empty muted', 'Pilih minimal satu fitur di atas untuk menampilkan grafik.'));
            return;
        }
        if (cfg.type === 'scatter') {
            const idx = feats.map((n) => S.headers.indexOf(n)).filter((i) => i >= 0 && isNum(S.columns[i]));
            if (idx.length < 2) {
                host.appendChild(P.el('div', 'pv-empty muted', 'Scatter butuh dua fitur angka. Pilih dua kolom angka (Desimal/Bulat).'));
                return;
            }
            const slot = addCard(colName(idx[0]) + ' vs ' + colName(idx[1]), S.columns[idx[0]].type, 'Scatter');
            const conf = scatterConfig(rows);
            if (conf) {
                const r = /r = ([-\d.]+)/.exec(conf.data.datasets[1].label);
                if (r) { slot.card.querySelector('.pv-type').textContent = 'Scatter · r = ' + r[1]; }
            }
            slot.card.appendChild(P.el('div', 'pv-foot', 'Titik dibatasi 3.000 baris pertama yang lolos filter · garis putus-putus = tren linear.'));
            drawInto(slot, conf);
            return;
        }
        if (cfg.type === 'candle' || cfg.type === 'ohlc') {
            // Candlestick / OHLC: butuh kolom angka Open-High-Low-Close (deteksi otomatis).
            if (!window.SkunderCandles) {
                host.appendChild(P.el('div', 'pv-empty muted', 'Skrip candlestick (media/candles.js) belum termuat.'));
                return;
            }
            const det = SkunderCandles.detect(S.headers, S.columns);
            if (!det.full) {
                host.appendChild(P.el('div', 'pv-empty muted', 'Candlestick butuh kolom angka Open, High, Low, dan Close (mis. Open/High/Low/Close atau Buka/Tertinggi/Terendah/Penutupan) — tidak terdeteksi pada berkas ini.'));
                return;
            }
            const rows = rowsFor();
            const ex = SkunderCandles.extract(rows, S.headers, det, 800);
            if (!ex.bars.length) {
                host.appendChild(P.el('div', 'pv-empty muted', 'Tidak ada baris OHLC yang lolos filter tabel.'));
                return;
            }
            const st = SkunderCandles.stats(ex.bars);
            const ci = S.headers.indexOf(det.close);
            const slot = addCard(det.close + ' (' + (det.date || 'urutan') + ')', S.columns[ci] ? S.columns[ci].type : 'number', NAME[cfg.type] || cfg.type);
            const closes = ex.bars.map((b) => b.c);
            const mas = [
                { label: 'MA5', data: SkunderCandles.sma(closes, 5), color: '#f28e2b' },
                { label: 'MA20', data: SkunderCandles.sma(closes, 20), color: '#af7aa1' },
            ];
            const conf = SkunderCandles.config({ bars: ex.bars, style: cfg.type, mas, fmt: P.fmt, lang: lang === 'zh-cn' ? 'zh-cn' : 'id' });
            const arah = st.chgPct >= 0 ? '+' : '';
            slot.card.appendChild(P.el('div', 'pv-foot',
                ex.bars.length.toLocaleString('en-US') + ' bar · terakhir ' + P.fmt(st.last) + ' (' + arah + (Math.round((st.chgPct || 0) * 10) / 10) + '%)' +
                (st.volTotal !== null ? ' · total volume ' + P.fmt(st.volTotal) : '') + ' · grafik mengikuti filter tabel bila diaktifkan'));
            drawInto(slot, conf);
            return;
        }
        feats.slice(0, MAX_CARDS).forEach((n) => featureCard(rows, n));
        if (feats.length > MAX_CARDS) {
            host.appendChild(P.el('div', 'pv-empty muted', 'Menampilkan ' + MAX_CARDS + ' fitur pertama dari ' + feats.length + ' fitur yang dipilih.'));
        }
    }

    function scheduleDraw() {
        if (drawTimer) { clearTimeout(drawTimer); }
        drawTimer = setTimeout(() => { drawTimer = 0; draw(); }, 120);
    }

    // ── kontrol ───────────────────────────────────────────────────────────────

    function mkSelect(list, value, onChange) {
        const s = document.createElement('select');
        list.forEach(([v, label]) => {
            const o = document.createElement('option');
            o.value = String(v);
            o.textContent = label;
            if (String(v) === String(value)) { o.selected = true; }
            s.appendChild(o);
        });
        s.addEventListener('change', () => onChange(s.value));
        return s;
    }

    function mkField(labelText, select) {
        const l = document.createElement('label');
        l.appendChild(document.createTextNode(labelText));
        l.appendChild(select);
        return l;
    }

    function chips() {
        chipBox.innerHTML = '';
        S.columns.forEach((c) => {
            const on = cfg.feats.includes(c.name);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'pv-chip' + (on ? ' on' : '');
            chip.title = c.name + ' · ' + (TYPE_LABEL[c.type] || c.type) + ' · ' + c.unique + ' unik · ' + c.missing + ' kosong';
            const dot = document.createElement('span');
            dot.className = 'pv-dot';
            chip.appendChild(dot);
            chip.appendChild(document.createTextNode((TYPE_ICON[c.type] || '•') + ' ' + c.name));
            chip.addEventListener('click', () => {
                if (on) {
                    cfg.feats = cfg.feats.filter((n) => n !== c.name);
                } else {
                    if (cfg.feats.length >= MAX_CARDS) { return; }
                    cfg.feats = cfg.feats.concat(c.name);
                }
                chips();
                saveCfg();
                scheduleDraw();
            });
            chipBox.appendChild(chip);
        });
    }

    function setFeats(list) {
        cfg.feats = list.slice(0, MAX_CARDS);
        chips();
        saveCfg();
        draw();
    }

    function buildTools() {
        const tools = P.el('div', 'card wide pv-tools');
        // Kontrol panel ini tidak ikut dijalankan otomatis oleh pet Spider.
        tools.setAttribute('data-spider-skip', '1');

        const headRow = P.el('div', 'pv-feats-head');
        const strong = document.createElement('strong');
        strong.textContent = 'Fitur';
        headRow.appendChild(strong);
        headRow.appendChild(P.el('span', 'muted', 'pilih kolom yang ingin digrafikkan (maks. ' + MAX_CARDS + ')'));
        headRow.appendChild(P.el('span', 'pv-spacer'));

        const btnNum = P.el('button', 'btn secondary', '🔢 Semua numerik');
        btnNum.onclick = () => setFeats(S.columns.filter((c) => isNum(c)).map((c) => c.name));
        const btnCat = P.el('button', 'btn secondary', '🏷️ Semua kategori');
        btnCat.onclick = () => setFeats(S.columns.filter((c) => c.type === 'category' || c.type === 'boolean').map((c) => c.name));
        const btnReset = P.el('button', 'btn secondary', '↺ Pilihan awal');
        btnReset.onclick = () => setFeats(pickDefaults());
        const btnClear = P.el('button', 'btn secondary', '✕ Kosongkan');
        btnClear.onclick = () => setFeats([]);
        headRow.append(btnNum, btnCat, btnReset, btnClear);

        chipBox = P.el('div', 'pv-chips');
        tools.appendChild(headRow);
        tools.appendChild(chipBox);

        const controls = P.el('div', 'pv-controls');
        controls.appendChild(mkField('Jenis grafik', mkSelect(TYPES, cfg.type, (v) => { cfg.type = v; saveCfg(); draw(); })));
        const numOpts = [['', '(jumlah baris)']].concat(S.columns.filter((c) => isNum(c)).map((c) => [c.name, c.name]));
        controls.appendChild(mkField('Nilai (Y)', mkSelect(numOpts, cfg.y, (v) => {
            cfg.y = v;
            // Memilih kolom nilai berarti ingin menjumlahkan/menghitung nilai itu, bukan baris.
            if (v && cfg.agg === 'count') { cfg.agg = 'sum'; if (aggSel) { aggSel.value = 'sum'; } }
            saveCfg(); draw();
        })));
        aggSel = mkSelect(AGGS, cfg.agg, (v) => { cfg.agg = v; saveCfg(); draw(); });
        controls.appendChild(mkField('Agregasi', aggSel));
        const groupOpts = [['', '(tanpa)']].concat(S.columns.filter((c) => c.type === 'category' || c.type === 'boolean').map((c) => [c.name, c.name]));
        controls.appendChild(mkField('Pecah per', mkSelect(groupOpts, cfg.group, (v) => { cfg.group = v; saveCfg(); draw(); })));
        controls.appendChild(mkField('Jumlah nilai', mkSelect(TOPNS, cfg.topn, (v) => { cfg.topn = +v; saveCfg(); draw(); })));
        controls.appendChild(mkField('Urutan', mkSelect(SORTS, cfg.sort, (v) => { cfg.sort = v; saveCfg(); draw(); })));

        const toggle = document.createElement('label');
        toggle.className = 'pv-toggle';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!cfg.follow;
        cb.addEventListener('change', () => { cfg.follow = cb.checked; saveCfg(); draw(); });
        toggle.appendChild(cb);
        toggle.appendChild(document.createTextNode('Ikuti filter tabel'));
        controls.appendChild(toggle);
        tools.appendChild(controls);

        chips();
        return tools;
    }

    // ── titik masuk ───────────────────────────────────────────────────────────

    // Bahasa diganti dari toolbar/Command Palette → label kanvas ikut diperbarui.
    window.addEventListener('message', (ev) => {
        const m = ev.data;
        if (!m || m.type !== 'sk-locale' || !m.config) { return; }
        lang = m.config.lang === 'zh-cn' ? 'zh-cn' : 'id';
        if (host) { draw(); }
    });

    window.SkunderPreview = {
        init(ctx) {
            destroy();
            P = ctx;
            S = ctx.sheet;
            PAL = (P.PALETTE && P.PALETTE.length) ? P.PALETTE : ['#4e79a7'];
            if (!S || !S.columns || !S.columns.length) { return; }
            if (typeof Chart === 'undefined') { return; }
            lang = (window.__SK_I18N__ && window.__SK_I18N__.lang === 'zh-cn') ? 'zh-cn' : 'id';
            cfg = loadCfg();
            const body = P.section('preview', 'Grafik Pratinjau Data');
            body.classList.add('pv-grid');
            const sec = body.parentElement;
            sec.insertBefore(P.el('div', 'pv-hint muted', 'Pilih fitur (kolom) yang ingin digrafikkan. Grafik mengikuti kotak pencarian tabel bila “Ikuti filter tabel” dicentang.'), body);
            body.appendChild(buildTools());
            host = body;
            draw();
            // Kotak pencarian tabel digambar sebelum panel ini → sambungkan filter langsung.
            const q = document.getElementById('sk-table-search');
            if (q) { q.addEventListener('input', scheduleDraw); }
        },
        destroy,
    };
})();
