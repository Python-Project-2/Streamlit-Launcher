/* global Chart, matchMedia */
(function () {
    const TYPES = [
        ['bar', '📊 Bar'], ['barh', '📊 Horizontal Bar'], ['stacked', '🧱 Stacked Bar'], ['stacked100', '🧱 100% Stacked Bar'],
        ['line', '📈 Line'], ['area', '🏔️ Area'], ['step', '🪜 Step Line'], ['pareto', '📉 Pareto Analysis'],
        ['pie', '🥧 Pie'], ['doughnut', '🍩 Doughnut'], ['polar', '🎯 Polar Area'], ['radar', '🕸️ Radar'],
        ['hist', '▥ Histogram + Cumulative'], ['scatter', '⚬ Scatter + Trendline'], ['bubble', '🫧 Bubble'],
        ['waterfall', '💧 Waterfall'], ['diverging', '↕️ Diverging Bar'], ['boxplot', '📦 Boxplot (Q1–Q3 + Median)'],
        ['areastack', '🌄 Stacked Area'], ['areastack100', '🌄 100% Stacked Area'],
        ['gauge', '🎛️ Gauge (share of total)'], ['timeline', '📅 Timeline (Gantt)'],
        ['heatmap', '🔥 Heatmap (kategori × seri)'], ['lollipop', '🍭 Lollipop'], ['sunburst2', '🌞 Sunburst (2 cincin)'],
        ['candle', '🕯️ Candlestick (OHLC)'], ['ohlc', '📊 OHLC Bar']
    ];
    const AGGS = [
        ['count', 'Row count'], ['sum', 'Sum (Total)'], ['mean', 'Average (Mean)'],
        ['median', 'Median'], ['min', 'Minimum'], ['max', 'Maximum'], ['distinct', 'Distinct Count']
    ];
    const AGG_NAME = {
        count: 'Count of', sum: 'Sum of', mean: 'Average of',
        median: 'Median of', min: 'Min of', max: 'Max of', distinct: 'Distinct of'
    };
    const GRANS = [['auto', 'Automatic'], ['year', 'Yearly'], ['month', 'Monthly'], ['day', 'Daily']];
    const TOPNS = [[0, 'All'], [5, 'Top 5'], [8, 'Top 8'], [10, 'Top 10'], [20, 'Top 20'], [50, 'Top 50']];
    const SORTS = [['auto', 'Automatic'], ['desc', 'Value (High to Low) ↓'], ['asc', 'Value (Low to High) ↑'], ['label', 'Label (A–Z)']];
    const SPANS = ['s', 'm', 'l', 'xl'];
    const CIRC = ['pie', 'doughnut', 'polar'];
    const ANIM = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600, easing: 'easeOutQuart' };

    /** Plugin kecil: teks tengah untuk tipe “gauge” (persentase + keterangan label). */
    const gaugeText = {
        id: 'gaugeText',
        afterDraw(chart, _args, o) {
            if (!o || !o.value) { return; }
            const area = chart.chartArea;
            if (!area) { return; }
            const ctx = chart.ctx;
            try {
                const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
                ctx.save();
                ctx.textAlign = 'center';
                ctx.fillStyle = getComputedStyle(chart.canvas).color || '#888';
                ctx.font = '700 22px ' + family;
                ctx.fillText(String(o.value), (area.left + area.right) / 2, area.bottom - 22);
                if (o.title) {
                    ctx.font = '500 11px ' + family;
                    ctx.fillText(String(o.title).slice(0, 28), (area.left + area.right) / 2, area.bottom - 6);
                }
                ctx.restore();
            } catch (e) { /* teks gagal digambar → grafik tetap tampil */ }
        },
    };
    try { Chart.register(gaugeText); } catch (e) { /* Chart belum siap → tipe lain tetap jalan */ }

    /** Plugin kecil: angka di dalam kotak heatmap. */
    const heatValues = {
        id: 'heatValues',
        afterDatasetsDraw(chart, _args, o) {
            if (!o || !o.show) { return; }
            const ctx = chart.ctx;
            try {
                const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = getComputedStyle(chart.canvas).color || '#e5e7eb';
                ctx.font = '600 10px ' + family;
                chart.data.datasets.forEach((ds, di) => {
                    if (ds.pointStyle !== 'rect') { return; }
                    const meta = chart.getDatasetMeta(di);
                    meta.data.forEach((elm, i) => {
                        const v = ds.data[i] && ds.data[i].v;
                        if (v != null) { ctx.fillText(String(Math.round(v * 100) / 100), elm.x, elm.y); }
                    });
                });
                ctx.restore();
            } catch (e) { /* angka gagal digambar → kotak tetap tampil */ }
        },
    };
    try { Chart.register(heatValues); } catch (e) { /* Chart belum siap → tipe lain tetap jalan */ }

    let P, S, PAL, bgrid, extCharts = [];

    const num = (c) => c.type === 'number' || c.type === 'integer';
    const colI = (n) => S.headers.indexOf(n);
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const opts = (o) => Object.assign({ responsive: true, maintainAspectRatio: false, animation: ANIM }, o);
    const opt = (arr, sel) => arr.map(([v, l]) => `<option value="${P.esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${P.esc(l)}</option>`).join('');
    const drop = (c) => {
        try { c.destroy(); } catch (e) { }
        extCharts = extCharts.filter((x) => x !== c);
    };

    // ---------- aggregation ----------
    function makeKey(ci, gran) {
        const c = S.columns[ci];
        if (c.type === 'date') {
            const g = !gran || gran === 'auto' ? (c.gran || 'month') : gran;
            const len = g === 'year' ? 4 : g === 'month' ? 7 : 10;
            return { fn: (v) => (v == null ? null : String(v).slice(0, len)), time: true };
        }
        if (num(c) && c.unique > 20 && c.num) {
            const k = 10, mn = c.num.min, w = (c.num.max - mn) / k || 1;
            const labels = Array.from({ length: k }, (_, b) => P.fmt(mn + b * w) + '–' + P.fmt(mn + (b + 1) * w));
            return { fn: (v) => (typeof v === 'number' ? labels[Math.min(k - 1, Math.floor((v - mn) / w))] : null), natural: labels };
        }
        return { fn: (v) => (v == null ? null : String(v)) };
    }

    function aggregate(b, kind, hasY) {
        if (!hasY || kind === 'count') return b.n;
        if (kind === 'distinct') return new Set(b.vals).size;
        const v = b.vals.filter((x) => typeof x === 'number');
        if (!v.length) return 0;
        switch (kind) {
            case 'sum': return v.reduce((a, c) => a + c, 0);
            case 'mean': return v.reduce((a, c) => a + c, 0) / v.length;
            case 'median': { const s = [...v].sort((a, c) => a - c), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
            case 'min': return Math.min(...v);
            case 'max': return Math.max(...v);
            default: return b.n;
        }
    }

    // ---------- builder chart ----------
    function buildCat(cfg) {
        const xi = colI(cfg.x); if (xi < 0) return null;
        const yi = cfg.y ? colI(cfg.y) : -1, gi = cfg.group ? colI(cfg.group) : -1;
        const hasY = yi >= 0 && cfg.agg !== 'count';
        const T = cfg.type, pareto = T === 'pareto', gauge = T === 'gauge', circ = CIRC.includes(T) || gauge || T === 'sunburst2';
        const useG = gi >= 0 && !circ && !pareto;
        const { fn, time, natural } = makeKey(xi, cfg.gran);
        let gKeys = ['_'];
        if (useG) {
            const m = new Map();
            for (const r of S.rows) if (r[gi] != null) m.set(String(r[gi]), (m.get(String(r[gi])) || 0) + 1);
            gKeys = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
        }
        const map = new Map();
        for (const r of S.rows) {
            const k = fn(r[xi]); if (k === null) continue;
            const g = useG ? (r[gi] == null ? null : String(r[gi])) : '_';
            if (g === null || !gKeys.includes(g)) continue;
            let m = map.get(k); if (!m) { m = new Map(); map.set(k, m); }
            let b = m.get(g); if (!b) { b = { n: 0, vals: [] }; m.set(g, b); }
            b.n++; if (hasY && r[yi] != null) b.vals.push(r[yi]);
        }
        const val = (k, g) => { const b = map.get(k).get(g); return b ? r3(aggregate(b, cfg.agg, hasY)) : 0; };
        const total = (k) => gKeys.reduce((a, g) => a + val(k, g), 0);
        let labels = [...map.keys()];
        const mode = pareto ? 'desc' : cfg.sort === 'auto' ? (time || natural ? 'label' : 'desc') : cfg.sort;
        if (mode === 'desc') labels.sort((a, b) => total(b) - total(a));
        else if (mode === 'asc') labels.sort((a, b) => total(a) - total(b));
        else labels.sort((a, b) => (natural ? natural.indexOf(a) - natural.indexOf(b) : a.localeCompare(b, undefined, { numeric: true })));
        let lim = pareto && !cfg.topn ? 15 : cfg.topn;
        if (T === 'radar') lim = Math.min(lim || 12, 12);
        if (lim && !(mode === 'label' && (time || natural))) labels = labels.slice(0, lim);
        if (!labels.length) return null;

        const yTitle = hasY ? `${AGG_NAME[cfg.agg]} ${cfg.y}` : 'Row count';
        const col = (i) => PAL[i % PAL.length];
        let type = 'bar', datasets, o = {};
        if (circ) {
            if (gauge) {
                // Gauge = kontribusi label teratas terhadap total (busur setengah lingkaran).
                const vs = labels.map((l) => val(l, '_'));
                const tot = vs.reduce((a, b) => a + b, 0) || 1;
                const share = r3((vs[0] / tot) * 100);
                type = 'doughnut';
                datasets = [{ data: [share, r3(100 - share)], backgroundColor: [col(0), 'rgba(128,128,128,.25)'], borderWidth: 0 }];
                o.circumference = 180;
                o.rotation = 270;
                o.cutout = '70%';
                o.plugins = { gaugeText: { title: labels[0], value: share + '%' } };
            } else if (T === 'sunburst2') {
                // Sunburst dua cincin: cincin luar = tiap kategori, cincin dalam = total per seri/grup.
                type = 'doughnut';
                const luar = labels.map((l) => r3(total(l)));
                const dalam = gKeys.map((g, i) => ({ v: labels.reduce((a, l) => a + val(l, g), 0), i }));
                datasets = [
                    { label: cfg.group ? `Total ${cfg.group}` : 'Total', data: dalam.map((d) => r3(d.v)), backgroundColor: dalam.map((d) => col(d.i) + 'cc'), borderWidth: 1 },
                    { label: cfg.x || 'kategori', data: luar, backgroundColor: luar.map((_, i) => col(i) + '99'), borderWidth: 1 },
                ];
                o.cutout = '34%';
                o.plugins = { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed}` } } };
            } else {
                type = T === 'polar' ? 'polarArea' : T;
                datasets = [{ data: labels.map((l) => val(l, '_')), backgroundColor: labels.map((_, i) => col(i)), borderWidth: 1 }];
            }
        } else if (pareto) {
            const vs = labels.map((l) => val(l, '_')), tot = vs.reduce((a, b) => a + b, 0) || 1;
            let acc = 0;
            datasets = [
                { type: 'bar', label: yTitle, data: vs, backgroundColor: col(0) + 'cc', yAxisID: 'y' },
                { type: 'line', label: 'Cumulative %', data: vs.map((v) => r3(((acc += v) / tot) * 100)), borderColor: col(2), backgroundColor: col(2), tension: 0.3, yAxisID: 'y1' }
            ];
            o.scales = { y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + '%' } } };
        } else if (T === 'line' || T === 'area' || T === 'step' || T === 'areastack' || T === 'areastack100') {
            type = 'line';
            const stackArea = T === 'areastack' || T === 'areastack100', pctArea = T === 'areastack100';
            const tot = labels.map((l) => gKeys.reduce((a, g) => a + val(l, g), 0) || 1);
            datasets = gKeys.map((g, i) => ({
                label: g === '_' ? yTitle : g,
                data: labels.map((l, k) => (pctArea ? r3((val(l, g) / tot[k]) * 100) : val(l, g))),
                borderColor: col(i),
                backgroundColor: col(i) + '66',
                fill: T === 'area' ? 'origin' : stackArea,
                stepped: T === 'step',
                tension: T === 'step' ? 0 : 0.35,
                pointRadius: labels.length > 60 ? 0 : 3,
            }));
            if (stackArea) { o.scales = { x: { stacked: true }, y: { stacked: true, max: pctArea ? 100 : undefined } }; }
        } else if (T === 'radar') {
            type = 'radar';
            datasets = gKeys.map((g, i) => ({ label: g === '_' ? yTitle : g, data: labels.map((l) => val(l, g)), borderColor: col(i), backgroundColor: col(i) + '33' }));
        } else if (T === 'waterfall') {
            // Waterfall: batang mengambang dari nilai kumulatif sebelum → sesudah setiap label.
            const vs = labels.map((l) => total(l));
            let acc = 0;
            const spans = vs.map((v) => { const a = acc; acc += v; return [r3(a), r3(acc)]; });
            datasets = [
                { type: 'bar', label: yTitle, data: spans, backgroundColor: vs.map((v) => (v >= 0 ? col(1) + 'cc' : col(3) + 'cc')), borderRadius: 3 },
                { type: 'line', label: 'Cumulative', data: spans.map((s) => s[1]), stepped: true, borderColor: col(0), borderWidth: 1.6, pointRadius: 0 },
            ];
        } else if (T === 'diverging') {
            // Batang divergen: warna mengikuti tanda nilai (positif/negatif).
            datasets = gKeys.map((g, i) => ({ label: g === '_' ? yTitle : g, data: labels.map((l) => val(l, g)), backgroundColor: labels.map((l) => (val(l, g) >= 0 ? '#59a14fcc' : '#e15759cc')), borderRadius: 4 }));
        } else if (T === 'boxplot') {
            // Kotak Q1–Q3 + penanda median per kategori (langsung dari baris mentah).
            const yi2 = cfg.y ? colI(cfg.y) : -1;
            if (yi2 < 0) { return null; }
            const groups = new Map();
            for (const r of S.rows) {
                const k = fn(r[xi]);
                if (k === null || typeof r[yi2] !== 'number') { continue; }
                let arrB = groups.get(k);
                if (!arrB) { arrB = []; groups.set(k, arrB); }
                arrB.push(r[yi2]);
            }
            const qq = (arrB, p) => { const s2 = [...arrB].sort((a, b) => a - b); const ii = (s2.length - 1) * p, lo = Math.floor(ii), hi = Math.ceil(ii); return lo === hi ? s2[lo] : s2[lo] + (s2[hi] - s2[lo]) * (ii - lo); };
            labels = labels.filter((l) => groups.has(l));
            if (!labels.length) { return null; }
            const stats = labels.map((l) => { const arrB = groups.get(l); return { q1: qq(arrB, 0.25), med: qq(arrB, 0.5), q3: qq(arrB, 0.75) }; });
            datasets = [
                { type: 'bar', label: 'Q1–Q3', data: stats.map((s2) => [r3(s2.q1), r3(s2.q3)]), backgroundColor: col(0) + '99', borderSkipped: false, borderRadius: 3 },
                { type: 'line', label: 'Median', data: stats.map((s2) => r3(s2.med)), showLine: false, pointStyle: 'rectRot', pointRadius: 8, pointHoverRadius: 9, borderColor: col(2), backgroundColor: col(2) },
            ];
        } else if (T === 'heatmap') {
            // Heatmap kategori × seri: kotak berwarna sesuai nilai (angka ditulis di dalam kotak).
            const ys = gKeys;
            const vals = labels.map((l) => ys.map((g) => val(l, g)));
            const flat = [].concat.apply([], vals);
            const mn = Math.min.apply(null, flat.concat([0]));
            const mx = Math.max.apply(null, flat.concat([1]));
            const warna = (v) => {
                const t = mx === mn ? 0.5 : (v - mn) / (mx - mn);
                const rr = Math.round(40 + t * 190), gg = Math.round(120 + (1 - t) * 90), bb = Math.round(205 - t * 125);
                return `rgba(${rr},${gg},${bb},${(0.25 + 0.65 * t).toFixed(2)})`;
            };
            const pts = [];
            labels.forEach((l, i) => ys.forEach((g, j) => pts.push({ x: i, y: ys.length - 1 - j, v: vals[i][j], l, g })));
            type = 'scatter';
            datasets = [{
                label: yTitle,
                data: pts.map((p) => ({ x: p.x, y: p.y, v: p.v })),
                pointStyle: 'rect',
                pointRadius: 15,
                pointHoverRadius: 17,
                backgroundColor: pts.map((p) => warna(p.v)),
            }];
            o.scales = {
                x: { type: 'linear', min: -0.6, max: labels.length - 0.4, ticks: { stepSize: 1, callback: (v) => (labels[Math.round(v)] ? P.cut(labels[Math.round(v)], 12) : '') }, title: { display: true, text: cfg.x } },
                y: { type: 'linear', min: -0.6, max: ys.length - 0.4, ticks: { stepSize: 1, callback: (v) => (ys[ys.length - 1 - Math.round(v)] ? P.cut(ys[ys.length - 1 - Math.round(v)], 14) : '') }, title: { display: true, text: cfg.group || 'seri' } },
            };
            o.plugins = { legend: { display: false }, heatValues: { show: true }, tooltip: { callbacks: { label: (c) => `${ys[ys.length - 1 - c.parsed.y]} × ${labels[c.parsed.x]} = ${c.raw.v}` } } };
        } else if (T === 'lollipop') {
            // Lollipop: batang tipis + titik nilai — enak dibaca untuk peringkat.
            datasets = [];
            gKeys.forEach((g, i) => {
                const nama = g === '_' ? yTitle : g;
                const data = labels.map((l) => val(l, g));
                datasets.push({ type: 'bar', label: nama, data, backgroundColor: col(i) + '55', barPercentage: 0.16, categoryPercentage: 0.9, borderRadius: 4 });
                datasets.push({ type: 'line', label: `${nama} (titik)`, data, showLine: false, pointRadius: 6, pointHoverRadius: 7, borderColor: col(i), backgroundColor: col(i) });
            });
        } else {
            const st = T === 'stacked' || T === 'stacked100', pct = T === 'stacked100';
            datasets = gKeys.map((g, i) => ({ label: g === '_' ? yTitle : g, data: labels.map((l) => (pct ? r3((val(l, g) / (total(l) || 1)) * 100) : val(l, g))), backgroundColor: gKeys.length === 1 && !st ? labels.map((_, k) => col(k)) : col(i), borderRadius: 4 }));
            if (T === 'barh') o.indexAxis = 'y';
            if (st) o.scales = { x: { stacked: true }, y: { stacked: true, max: pct ? 100 : undefined } };
        }
        o.plugins = Object.assign({}, o.plugins, { legend: { display: !gauge && T !== 'heatmap' && ((circ && !gauge) || pareto || T === 'radar' || T === 'lollipop' || gKeys.length > 1 || T === 'waterfall' || T === 'boxplot'), position: 'bottom' } });
        if (!circ && T !== 'radar') {
            const hz = T === 'barh', ax = hz ? 'y' : 'x', ay = hz ? 'x' : 'y';
            o.scales = o.scales || {};
            o.scales[ax] = Object.assign({ title: { display: true, text: cfg.x } }, o.scales[ax]);
            o.scales[ay] = Object.assign({ title: { display: true, text: T === 'stacked100' ? '% of total' : yTitle } }, o.scales[ay]);
        }
        return { type, data: { labels: labels.map((l) => P.cut(l, 22)), datasets }, options: opts(o) };
    }

    function buildHist(cfg) {
        const xi = colI(cfg.x); if (xi < 0) return null;
        const v = S.rows.map((r) => r[xi]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
        if (!v.length) return null;
        const mn = v[0], mx = v[v.length - 1];
        const k = mn === mx ? 1 : Math.max(5, Math.min(30, Math.ceil(Math.log2(v.length) + 1)));
        const w = (mx - mn) / k || 1, counts = new Array(k).fill(0);
        v.forEach((x) => counts[Math.min(k - 1, Math.floor((x - mn) / w))]++);
        let acc = 0;
        return {
            type: 'bar', data: {
                labels: counts.map((_, i) => P.fmt(mn + i * w)), datasets: [
                    { label: 'Frequency', data: counts, backgroundColor: PAL[0] + 'cc', categoryPercentage: 1, barPercentage: 0.98, yAxisID: 'y' },
                    { type: 'line', label: 'Cumulative %', data: counts.map((c) => r3(((acc += c) / v.length) * 100)), borderColor: PAL[2], pointRadius: 0, tension: 0.3, yAxisID: 'y1' }]
            },
            options: opts({ plugins: { legend: { position: 'bottom' } }, scales: { x: { title: { display: true, text: cfg.x } }, y: { title: { display: true, text: 'Frequency' } }, y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (x) => x + '%' } } } })
        };
    }

    function buildXY(cfg) {
        const xi = colI(cfg.x), yi = colI(cfg.y), gi = cfg.group ? colI(cfg.group) : -1;
        const zi = cfg.type === 'bubble' && cfg.size ? colI(cfg.size) : -1;
        if (xi < 0 || yi < 0) return null;
        const pts = [];
        for (const r of S.rows) {
            const x = r[xi], y = r[yi];
            if (typeof x === 'number' && typeof y === 'number') pts.push({ x, y, z: zi >= 0 && typeof r[zi] === 'number' ? r[zi] : 1, g: gi >= 0 && r[gi] != null ? String(r[gi]) : '_' });
        }
        if (!pts.length) return null;
        const step = Math.max(1, Math.ceil(pts.length / 1000)), sm = pts.filter((_, i) => i % step === 0);
        let zmin = Infinity, zmax = -Infinity;
        sm.forEach((p) => { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); });
        const rad = (z) => (cfg.type === 'bubble' ? 4 + (zmax === zmin ? 6 : ((z - zmin) / (zmax - zmin)) * 18) : 3);
        const gc = new Map(); sm.forEach((p) => gc.set(p.g, (gc.get(p.g) || 0) + 1));
        const gKeys = [...gc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
        const datasets = gKeys.map((g, i) => ({ label: g === '_' ? `${cfg.y} vs ${cfg.x}` : g, data: sm.filter((p) => p.g === g).map((p) => ({ x: p.x, y: p.y, r: rad(p.z), z: p.z })), backgroundColor: PAL[i % PAL.length] + '99', borderColor: PAL[i % PAL.length] }));
        if (cfg.type === 'scatter') {
            const n = pts.length; let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, lo = Infinity, hi = -Infinity;
            pts.forEach((p) => { sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); });
            const den = n * sxx - sx * sx, slope = den ? (n * sxy - sx * sy) / den : 0, b = (sy - slope * sx) / n;
            const dr = Math.sqrt(den * (n * syy - sy * sy)), r = dr ? r3((n * sxy - sx * sy) / dr) : 0;
            datasets.push({ type: 'line', label: `Linear trend (r = ${r})`, data: [{ x: lo, y: slope * lo + b }, { x: hi, y: slope * hi + b }], borderColor: '#e15759', borderDash: [6, 4], borderWidth: 2, pointRadius: 0 });
        }
        return { type: cfg.type, data: { datasets }, options: opts({ plugins: { legend: { display: gKeys.length > 1 || cfg.type === 'scatter', position: 'bottom' } }, scales: { x: { title: { display: true, text: cfg.x } }, y: { title: { display: true, text: cfg.y } } } }) };
    }

    /** Timeline (Gantt sederhana): batang mengambang dari kolom tanggal mulai ke tanggal selesai. */
    function buildTimeline(cfg) {
        const xi = colI(cfg.x), yi = colI(cfg.y);
        if (xi < 0 || yi < 0 || xi === yi) { return null; }
        const li = S.columns.findIndex((c) => c.type === 'text' || c.type === 'category' || c.type === 'id');
        const rows = [];
        for (let i = 0; i < S.rows.length; i++) {
            const r = S.rows[i];
            const a0 = Date.parse(String(r[xi])), b0 = Date.parse(String(r[yi]));
            if (!Number.isFinite(a0) || !Number.isFinite(b0)) { continue; }
            rows.push({ label: li >= 0 && r[li] != null ? String(r[li]) : `#${i + 1}`, a: Math.min(a0, b0), b: Math.max(a0, b0) });
            if (rows.length >= 500) { break; }
        }
        if (!rows.length) { return null; }
        rows.sort((p, q) => p.a - q.a);
        const cap = cfg.topn ? Math.min(cfg.topn, rows.length) : Math.min(40, rows.length);
        const sel = rows.slice(0, cap);
        const fmt = (v) => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
        return {
            type: 'bar',
            data: {
                labels: sel.map((r) => P.cut(r.label, 24)),
                datasets: [{ label: `${cfg.x} → ${cfg.y}`, data: sel.map((r) => [r.a, r.b]), backgroundColor: PAL[0] + 'cc', borderRadius: 4, barPercentage: 0.62 }],
            },
            options: opts({
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (c) => `${fmt(c.raw[0])} → ${fmt(c.raw[1])} (${Math.round((c.raw[1] - c.raw[0]) / 86400000)} hari)` } },
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Tanggal' }, ticks: { callback: (v) => fmt(v), maxRotation: 0, autoSkip: true } },
                    y: { ticks: { autoSkip: false } },
                },
            }),
        };
    }

    const buildConfig = (cfg) => (cfg.type === 'timeline' ? buildTimeline(cfg) : cfg.type === 'hist' ? buildHist(cfg) : cfg.type === 'candle' || cfg.type === 'ohlc' ? buildCandle(cfg) : cfg.type === 'scatter' || cfg.type === 'bubble' ? buildXY(cfg) : buildCat(cfg));

    /** Candlestick / OHLC: kolom tanggal + Open-High-Low-Close (+ volume opsional), tanpa agregasi. */
    function buildCandle(cfg) {
        if (!window.SkunderCandles) { return null; }
        const xi = colI(cfg.x), oi = colI(cfg.o), hi = colI(cfg.h), li = colI(cfg.l), ci = colI(cfg.c), vi = cfg.v ? colI(cfg.v) : -1;
        if (oi < 0 || hi < 0 || li < 0 || ci < 0) { return null; }
        const det = { date: xi >= 0 ? cfg.x : '', open: cfg.o, high: cfg.h, low: cfg.l, close: cfg.c, volume: vi >= 0 ? cfg.v : '' };
        const ex = SkunderCandles.extract(S.rows, S.headers, det, 800);
        if (!ex.bars.length) { return null; }
        const closes = ex.bars.map((b) => b.c);
        const mas = [
            { label: 'MA5', data: SkunderCandles.sma(closes, 5), color: '#f28e2b' },
            { label: 'MA20', data: SkunderCandles.sma(closes, 20), color: '#af7aa1' },
        ];
        return SkunderCandles.config({ bars: ex.bars, style: cfg.type === 'ohlc' ? 'ohlc' : 'candle', mas, fmt: P.fmt });
    }

    // ---------- builder card ----------
    function normalize(cfg) {
        const nums = S.columns.filter(num).map((c) => c.name), xy = cfg.type === 'scatter' || cfg.type === 'bubble';
        const tl = cfg.type === 'timeline';
        const cd = cfg.type === 'candle' || cfg.type === 'ohlc';
        const dates = S.columns.filter((c) => c.type === 'date').map((c) => c.name);
        if (cd) {
            // Kolom saham diisi otomatis dari deteksi OHLCV; pengguna boleh mengganti lewat kontrol.
            const det = (window.SkunderCandles && SkunderCandles.detect(S.headers, S.columns)) || { date: '', open: '', high: '', low: '', close: '', volume: '' };
            if (!S.headers.includes(cfg.x)) { cfg.x = det.date || dates[0] || S.headers[0] || ''; }
            const numOk = (v) => nums.includes(v);
            if (!numOk(cfg.o)) { cfg.o = det.open || nums.find((n) => n !== cfg.h && n !== cfg.l && n !== cfg.c) || ''; }
            if (!numOk(cfg.h) || cfg.h === cfg.o) { cfg.h = det.high || nums.find((n) => n !== cfg.o && n !== cfg.l && n !== cfg.c) || ''; }
            if (!numOk(cfg.l) || cfg.l === cfg.o || cfg.l === cfg.h) { cfg.l = det.low || nums.find((n) => n !== cfg.o && n !== cfg.h && n !== cfg.c) || ''; }
            if (!numOk(cfg.c) || cfg.c === cfg.o || cfg.c === cfg.h || cfg.c === cfg.l) { cfg.c = det.close || nums.find((n) => n !== cfg.o && n !== cfg.h && n !== cfg.l) || ''; }
            if (cfg.v && !numOk(cfg.v)) { cfg.v = ''; }
            if (!cfg.v && det.volume && numOk(det.volume)) { cfg.v = det.volume; }
            return cfg;
        }
        if (tl) {
            if (!dates.includes(cfg.x)) { cfg.x = dates[0] || ''; }
            if (!dates.includes(cfg.y) || cfg.y === cfg.x) { cfg.y = dates.find((d) => d !== cfg.x) || ''; }
        }
        else if (xy || cfg.type === 'hist') { if (!nums.includes(cfg.x)) cfg.x = nums[0] || ''; }
        else if (!S.headers.includes(cfg.x)) cfg.x = S.headers[0];
        if (!tl) {
            if (xy) { if (!nums.includes(cfg.y)) cfg.y = nums.find((n) => n !== cfg.x) || nums[0] || ''; }
            else if (cfg.y && !nums.includes(cfg.y)) cfg.y = '';
        }
        if (cfg.group && !S.headers.includes(cfg.group)) cfg.group = '';
        if (cfg.size && !nums.includes(cfg.size)) cfg.size = '';
        return cfg;
    }
    const mk = (o) => normalize(Object.assign({ type: 'bar', x: '', y: '', o: '', h: '', l: '', c: '', v: '', agg: 'count', group: '', size: '', sort: 'auto', topn: 0, gran: 'auto', span: 'm' }, o));

    function controls(cfg) {
        const nums = S.columns.filter(num).map((c) => [c.name, c.name]);
        const cats = S.columns.filter((c) => c.type === 'category' || c.type === 'boolean' || (c.type === 'integer' && c.unique <= 12)).map((c) => [c.name, c.name]);
        const xy = cfg.type === 'scatter' || cfg.type === 'bubble', hist = cfg.type === 'hist', tl = cfg.type === 'timeline';
        const cd = cfg.type === 'candle' || cfg.type === 'ohlc';
        const dates = S.columns.filter((c) => c.type === 'date').map((c) => [c.name, c.name]);
        // Helper label+select: dideklarasikan sebelum cabang candlestick supaya tidak kena TDZ.
        const L = (k, label, html, show) => (show === false ? '' : `<label>${label}<select data-k="${k}">${html}</select></label>`);
        if (cd) {
            // Candlestick / OHLC: tanggal + empat kolom harga + volume opsional.
            const xc = dates.length ? dates : S.columns.map((c) => [c.name, c.name]);
            return L('x', 'Date / Labels', opt(xc, cfg.x))
                + L('o', 'Open', opt(nums, cfg.o))
                + L('h', 'High', opt(nums, cfg.h))
                + L('l', 'Low', opt(nums, cfg.l))
                + L('c', 'Close', opt(nums, cfg.c))
                + L('v', 'Volume', opt([['', '(none)'], ...nums], cfg.v));
        }
        const xc = tl ? dates : xy || hist ? nums : S.columns.map((c) => [c.name, c.name]);
        const xCol = S.columns[colI(cfg.x)], isDate = xCol && xCol.type === 'date';
        const noGroup = CIRC.includes(cfg.type) || cfg.type === 'pareto' || cfg.type === 'gauge' || cfg.type === 'boxplot';
        return L('x', tl ? 'Start (date)' : xy || hist ? 'X-Axis Column' : 'Category / X-Axis', opt(xc, cfg.x))
            + L('y', tl ? 'End (date)' : xy ? 'Y-Axis Column' : 'Value (Y-Axis)', opt(tl ? dates : xy ? nums : [['', '(row count)'], ...nums], cfg.y), !hist)
            + L('agg', 'Aggregation', opt(AGGS, cfg.agg), !xy && !hist && !tl)
            + L('group', xy ? 'Group / Color' : 'Series / Group', opt([['', '(none)'], ...cats], cfg.group), !hist && !tl && !noGroup)
            + L('size', 'Bubble Size', opt([['', '(uniform)'], ...nums], cfg.size), cfg.type === 'bubble')
            + L('sort', 'Sort Order', opt(SORTS, cfg.sort), !xy && !hist && !tl)
            + L('topn', tl ? 'Limit (rows)' : 'Limit (Top N)', opt(tl ? [[0, 'All'], [10, '10 rows'], [20, '20 rows'], [40, '40 rows']] : TOPNS, cfg.topn), !xy && !hist)
            + L('gran', 'Time Grouping', opt(GRANS, cfg.gran), isDate && !xy && !hist && !tl);
    }

    function draw(card) {
        const cfg = card._cfg, conf = buildConfig(cfg);
        const cv = card.querySelector('canvas'), em = card.querySelector('.empty');
        const printBadge = card.querySelector('.bcard-print-summary');
        if (printBadge) {
            const typeLabel = (TYPES.find((t) => t[0] === cfg.type) || ['', cfg.type])[1];
            printBadge.textContent = `${typeLabel} · X: ${cfg.x}${cfg.y ? ' · Y: ' + cfg.y : ''}${cfg.agg ? ' · ' + (AGG_NAME[cfg.agg] || cfg.agg) : ''}`;
        }
        if (!conf) {
            if (card._chart) { drop(card._chart); card._chart = null; }
            cv.classList.add('hidden'); em.classList.remove('hidden'); em.textContent = 'Please select compatible columns for this chart.';
            return;
        }
        cv.classList.remove('hidden'); em.classList.add('hidden');
        // Always recreate the chart cleanly to avoid any scale mismatch, leftover animations, or tick callback errors
        if (card._chart) {
            drop(card._chart);
            card._chart = null;
        }
        try {
            card._chart = new Chart(cv, conf);
            card._sig = cfg.type;
            extCharts.push(card._chart);
        } catch (err) {
            console.error('Error drawing chart:', err);
            em.classList.remove('hidden');
            em.textContent = 'Failed to render chart: ' + (err.message || err);
            cv.classList.add('hidden');
        }
    }

    function save() {
        if (!bgrid) return;
        const st = P.vscode.getState() || {};
        st.dash = st.dash || {};
        st.dash[P.state.fileName + '|' + S.name] = [...bgrid.querySelectorAll('.bcard')].map((c) => c._cfg);
        P.vscode.setState(st);
    }

    function addCard(cfg, after) {
        normalize(cfg);
        const card = P.el('div', 'card bcard s-' + cfg.span);
        card._cfg = cfg;
        card.innerHTML = `
            <div class="bhead">
                <span class="grip" title="Drag to reorder">⠿</span>
                <select data-k="type">${opt(TYPES, cfg.type)}</select>
                <button class="ib" data-act="span" title="Resize card">⤢</button>
                <button class="ib" data-act="dup" title="Duplicate chart">⧉</button>
                <button class="ib" data-act="del" title="Remove chart">✕</button>
            </div>
            <div class="print-only bcard-print-summary"></div>
            <div class="bctl">${controls(cfg)}</div>
            <div class="cbox"><canvas></canvas><div class="empty hidden"></div></div>
        `;

        const onControlChange = (e) => {
            const k = e.target.dataset.k; if (!k) return;
            cfg[k] = k === 'topn' ? +e.target.value : e.target.value;
            if (k === 'type') normalize(cfg);
            card.querySelector('.bctl').innerHTML = controls(cfg);
            if (k === 'type') card.querySelector('[data-k="type"]').value = cfg.type;
            draw(card);
            save();
        };

        card.addEventListener('change', onControlChange);
        card.addEventListener('input', onControlChange);

        card.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            const a = b.dataset.act;
            if (a === 'span') {
                const nx = SPANS[(SPANS.indexOf(cfg.span) + 1) % SPANS.length];
                card.classList.replace('s-' + cfg.span, 's-' + nx);
                cfg.span = nx;
            } else if (a === 'dup') {
                addCard(Object.assign({}, cfg), card);
                return;
            } else if (a === 'del') {
                if (card._chart) drop(card._chart);
                card.remove();
            }
            save();
        });

        if (after) after.after(card); else bgrid.appendChild(card);
        draw(card);
        save();
        return card;
    }

    function defaults() {
        const cats = S.columns.filter((c) => c.type === 'category' && c.unique >= 2 && c.unique <= 30);
        const dates = S.columns.filter((c) => c.type === 'date');
        const nums = S.columns.filter((c) => c.num && c.num.std > 0);
        const out = [];
        if (cats[0] && nums[0]) out.push(mk({ type: 'bar', x: cats[0].name, y: nums[0].name, agg: 'mean' }));
        if (cats[0]) out.push(mk({ type: 'doughnut', x: cats[0].name }));
        if (dates[0]) out.push(mk({ type: 'area', x: dates[0].name, y: nums[0] ? nums[0].name : '', agg: nums[0] ? 'sum' : 'count', span: 'l' }));
        if (nums[0]) out.push(mk({ type: 'hist', x: nums[0].name }));
        if (nums.length >= 2) out.push(mk({ type: 'scatter', x: nums[0].name, y: nums[1].name, group: cats[0] && cats[0].unique <= 6 ? cats[0].name : '' }));
        if (dates[0] && nums[0] && cats[0]) out.push(mk({ type: 'areastack', x: dates[0].name, y: nums[0].name, agg: 'sum', group: cats[0].name, span: 'l' }));
        if (cats[0] && nums[0]) out.push(mk({ type: 'boxplot', x: cats[0].name, y: nums[0].name, agg: 'mean' }));
        const dateCols = S.columns.filter((c) => c.type === 'date');
        if (dateCols.length >= 2) out.push(mk({ type: 'timeline', x: dateCols[0].name, y: dateCols[1].name }));
        // Data saham terdeteksi → kartu candlestick siap pakai.
        if (window.SkunderCandles) {
            const det = SkunderCandles.detect(S.headers, S.columns);
            if (det.full) { out.unshift(mk({ type: 'candle', x: det.date || dates[0] && dates[0].name, o: det.open, h: det.high, l: det.low, c: det.close, v: det.volume, span: 'xl' })); }
        }
        if (!out.length) out.push(mk({ type: 'bar', x: S.headers[0] }));
        return out;
    }

    // ---------- drag & drop (with FLIP animation) ----------
    function flip(grid, mutate) {
        const items = [...grid.children], first = new Map(items.map((c) => [c, c.getBoundingClientRect()]));
        mutate();
        items.forEach((c) => {
            const a = first.get(c), b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
            if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
    }
    function enableDnD(grid, onChange) {
        let dragged = null, busy = false;
        grid.addEventListener('mousedown', (e) => {
            const g = e.target.closest('.grip');
            const c = g && g.closest('.card');
            if (c && c.parentElement === grid) c.draggable = true;
        });
        grid.addEventListener('mouseup', () => grid.querySelectorAll('.card[draggable="true"]').forEach((c) => { c.draggable = false; }));
        grid.addEventListener('dragstart', (e) => {
            const c = e.target.closest && e.target.closest('.card');
            if (!c || !c.draggable || c.parentElement !== grid) return;
            dragged = c; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'card');
            setTimeout(() => c.classList.add('dragging'), 0);
        });
        grid.addEventListener('dragover', (e) => {
            if (!dragged) return;
            e.preventDefault();
            const t = e.target.closest('.card');
            if (busy || !t || t === dragged || t.parentElement !== grid) return;
            const r = t.getBoundingClientRect(), wide = r.width > grid.clientWidth * 0.7;
            const before = wide ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
            if (before ? t.previousElementSibling === dragged : t.nextElementSibling === dragged) return;
            busy = true; setTimeout(() => { busy = false; }, 280);
            flip(grid, () => grid.insertBefore(dragged, before ? t : t.nextElementSibling));
        });
        grid.addEventListener('drop', (e) => e.preventDefault());
        grid.addEventListener('dragend', () => {
            if (!dragged) return;
            dragged.classList.remove('dragging');
            dragged.draggable = false;
            dragged = null;
            if (onChange) onChange();
        });
    }

    // ---------- advanced extra charts ----------
    function extras(body) {
        const cols = S.columns, nums = cols.filter((c) => c.num && c.num.std > 0).slice(0, 12), cats = cols.filter((c) => c.type === 'category' && c.unique >= 2);
        const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : 0);
        const n01 = (c, v) => (c.num.max === c.num.min ? 0 : (v - c.num.min) / (c.num.max - c.num.min));
        const cut = P.cut;

        P.chart(body, 'Data Completeness per Column (%)', {
            type: 'bar', data: {
                labels: cols.map((c) => cut(c.name, 18)), datasets: [
                    { label: 'Populated', data: cols.map((c) => pct(c.count, c.count + c.missing)), backgroundColor: PAL[4] + 'cc' },
                    { label: 'Missing', data: cols.map((c) => 100 - pct(c.count, c.count + c.missing)), backgroundColor: PAL[2] + 'cc' }]
            },
            options: { indexAxis: 'y', scales: { x: { stacked: true, max: 100 }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } }
        }, Math.max(220, cols.length * 22));

        if (nums.length >= 2) {
            P.chart(body, 'IQR Range & Median (Normalized 0–1)', {
                type: 'bar', data: {
                    labels: nums.map((c) => cut(c.name, 14)), datasets: [
                        { label: 'Q1–Q3', data: nums.map((c) => [r3(n01(c, c.num.q1)), r3(n01(c, c.num.q3))]), backgroundColor: PAL[0] + 'cc', borderSkipped: false, borderRadius: 4 },
                        { type: 'line', label: 'Median', data: nums.map((c) => r3(n01(c, c.num.median))), showLine: false, pointStyle: 'rectRot', pointRadius: 6, backgroundColor: PAL[2], borderColor: PAL[2] }]
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { min: 0, max: 1 } } }
            });
            P.chart(body, 'Mean vs Median (Normalized) Skew Indicator', {
                type: 'bar', data: {
                    labels: nums.map((c) => cut(c.name, 14)), datasets: [
                        { label: 'Mean', data: nums.map((c) => r3(n01(c, c.num.mean))), backgroundColor: PAL[0] + 'cc', borderRadius: 4 },
                        { label: 'Median', data: nums.map((c) => r3(n01(c, c.num.median))), backgroundColor: PAL[1] + 'cc', borderRadius: 4 }]
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { min: 0, max: 1 } } }
            });
        }

        cats.slice(0, 2).forEach((c) => { const conf = buildConfig(mk({ type: 'pareto', x: c.name, topn: 10 })); if (conf) P.chart(body, `Pareto Analysis: ${c.name}`, conf); });
        nums.slice(0, 2).forEach((c) => { const conf = buildConfig(mk({ type: 'hist', x: c.name })); if (conf) P.chart(body, `Histogram & Cumulative: ${c.name}`, conf); });

        if (nums[0]) {
            const xi = colI(nums[0].name), v = S.rows.map((r) => r[xi]).filter((x) => typeof x === 'number').sort((a, b) => a - b), step = Math.max(1, Math.ceil(v.length / 150));
            const pts = v.map((x, i) => ({ x, y: r3(((i + 1) / v.length) * 100) })).filter((_, i) => i % step === 0);
            P.chart(body, `Cumulative Distribution (ECDF): ${nums[0].name}`, {
                type: 'scatter', data: { datasets: [{ data: pts, showLine: true, stepped: true, fill: true, pointRadius: 0, borderColor: PAL[1], backgroundColor: PAL[1] + '33' }] },
                options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: nums[0].name } }, y: { title: { display: true, text: '% data ≤ value' }, max: 100 } } }
            });

            const li = cols.findIndex((c) => c.type === 'id' || c.type === 'text' || c.type === 'category');
            const top = S.rows.map((r, i) => ({ l: li >= 0 && r[li] != null ? String(r[li]) : '#' + (i + 1), v: r[xi] })).filter((x) => typeof x.v === 'number').sort((a, b) => b.v - a.v).slice(0, 10);
            P.chart(body, `Top 10 Highest Values: ${nums[0].name}`, { type: 'bar', data: { labels: top.map((t) => cut(t.l, 20)), datasets: [{ data: top.map((t) => t.v), backgroundColor: top.map((_, i) => PAL[i % PAL.length]), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } }, 320);
        }

        if (nums.length >= 3) { const conf = buildConfig(mk({ type: 'bubble', x: nums[0].name, y: nums[1].name, size: nums[2].name })); if (conf) P.chart(body, `Bubble: ${nums[0].name} × ${nums[1].name} (size ${nums[2].name})`, conf, 300); }
        if (S.scatters.length) { const s = S.scatters[0], conf = buildConfig(mk({ type: 'scatter', x: s.x, y: s.y, group: cats[0] && cats[0].unique <= 6 ? cats[0].name : '' })); if (conf) P.chart(body, `${s.x} vs ${s.y} + Trendline`, conf, 300); }

        if (S.crosstab) {
            const x = S.crosstab, tot = x.labels.map((_, i) => x.series.reduce((a, s) => a + s.data[i], 0));
            P.chart(body, `${x.a} × ${x.b} (100% Stacked)`, {
                type: 'bar', data: { labels: x.labels.map((l) => cut(l, 16)), datasets: x.series.map((s, i) => ({ label: s.name, data: s.data.map((d, k) => r3((d / (tot[k] || 1)) * 100)), backgroundColor: PAL[i % PAL.length] })) },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } } }
            });
        }

        const cc = cats.find((c) => c.unique <= 6), ns = nums.slice(0, 6);
        if (cc && ns.length >= 3) {
            const ci = colI(cc.name), acc = new Map();
            for (const r of S.rows) {
                const k = r[ci]; if (k == null) continue;
                let a = acc.get(String(k)); if (!a) { a = ns.map(() => [0, 0]); acc.set(String(k), a); }
                ns.forEach((c, j) => { const v = r[colI(c.name)]; if (typeof v === 'number') { a[j][0] += v; a[j][1]++; } });
            }
            P.chart(body, `Radar Profile by ${cc.name} (Normalized Mean)`, {
                type: 'radar', data: { labels: ns.map((c) => cut(c.name, 14)), datasets: [...acc.entries()].slice(0, 6).map(([k, a], i) => ({ label: k, data: a.map(([s, n], j) => (n ? r3(n01(ns[j], s / n)) : 0)), borderColor: PAL[i], backgroundColor: PAL[i] + '33' })) },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { r: { min: 0, max: 1 } } }
            }, 320);
        }

        // ── Forecast: tren + moving average + proyeksi linear ──
        const dateCol = cols.find((c) => c.type === 'date'), numCol = nums[0];
        if (dateCol && numCol) {
            const di = colI(dateCol.name), vi = colI(numCol.name);
            const mb = makeKey(di, dateCol.gran || 'month');
            const bucket = new Map();
            for (const r of S.rows) {
                const k = mb.fn(r[di]);
                const v = r[vi];
                if (k == null || typeof v !== 'number') { continue; }
                const b = bucket.get(k) || { s: 0, n: 0 };
                b.s += v; b.n++;
                bucket.set(k, b);
            }
            const labels = [...bucket.keys()].sort((a, b) => a.localeCompare(b));
            const vals = labels.map((l) => r3(bucket.get(l).s / bucket.get(l).n));
            const n = vals.length;
            if (n >= 6 && n <= 400) {
                const ma = vals.map((_, i) => (i < 4 ? null : r3(vals.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5)));
                let sxy = 0, sxx = 0, sy = 0;
                for (let i = 0; i < n; i++) { const x = i - (n - 1) / 2; sxy += x * vals[i]; sxx += x * x; sy += vals[i]; }
                const slope = sxx ? sxy / sxx : 0, mean = sy / n;
                const projN = Math.max(2, Math.round(n * 0.15));
                const satuan = dateCol.gran === 'day' ? 'hari' : dateCol.gran === 'year' ? 'tahun' : 'bulan';
                const nextLabel = (l, k) => {
                    const g = dateCol.gran === 'year' ? 4 : dateCol.gran === 'day' ? 10 : 7;
                    if (g === 4) { const y = Number(l); return Number.isFinite(y) ? String(y + k) : `${l} +${k}`; }
                    const d = new Date(l.length === 7 ? `${l}-01` : l);
                    if (isNaN(d.getTime())) { return `${l} +${k}`; }
                    if (g === 10) { d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); }
                    d.setMonth(d.getMonth() + k);
                    return d.toISOString().slice(0, 7);
                };
                const projLabels = Array.from({ length: projN }, (_, i) => nextLabel(labels[n - 1], i + 1));
                const projVals = Array.from({ length: projN }, (_, i) => r3(mean + slope * ((n - 1) / 2 + i + 1)));
                const nulls = new Array(projN).fill(null);
                P.chart(body, `Forecast: ${numCol.name} per ${dateCol.name}`, {
                    type: 'line',
                    data: {
                        labels: [...labels.map((l) => cut(l, 14)), ...projLabels.map((l) => cut(l, 14))],
                        datasets: [
                            { label: 'Actual (mean)', data: [...vals, ...nulls], borderColor: PAL[0], backgroundColor: PAL[0] + '22', fill: true, tension: 0.3, pointRadius: 2 },
                            { label: 'Moving avg (5)', data: [...ma, ...nulls], borderColor: PAL[2], borderDash: [4, 3], pointRadius: 0, tension: 0.3 },
                            { label: `Projection (+${projN} ${satuan})`, data: [...new Array(n - 1).fill(null), vals[n - 1], ...projVals], borderColor: PAL[3], borderDash: [7, 4], pointRadius: 0, tension: 0 },
                        ],
                    },
                    options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } } },
                }, 320);
            }
        }

        // ── Control chart: nilai + moving average + batas ±3σ ──
        const ctrlCol = nums.find((c) => c.unique > 8) || nums[0];
        if (ctrlCol) {
            const ci = colI(ctrlCol.name);
            const seri = S.rows.map((r) => r[ci]).filter((x) => typeof x === 'number').slice(0, 300);
            if (seri.length >= 12) {
                const n = seri.length, mean = seri.reduce((a, b) => a + b, 0) / n;
                const sd = Math.sqrt(seri.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n) || 1;
                const ma = seri.map((_, i) => (i < 4 ? null : r3(seri.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5)));
                P.chart(body, `Control Chart: ${ctrlCol.name} (mean ±3σ)`, {
                    type: 'line',
                    data: {
                        labels: seri.map((_, i) => `#${i + 1}`),
                        datasets: [
                            { label: ctrlCol.name, data: seri, borderColor: PAL[0], pointRadius: 0, tension: 0.25 },
                            { label: 'Moving avg (5)', data: ma, borderColor: PAL[2], borderDash: [4, 3], pointRadius: 0, tension: 0.25 },
                            { label: `UCL ${r3(mean + 3 * sd)}`, data: seri.map(() => r3(mean + 3 * sd)), borderColor: '#e15759', borderDash: [6, 4], borderWidth: 1.2, pointRadius: 0 },
                            { label: `LCL ${r3(Math.max(0, mean - 3 * sd))}`, data: seri.map(() => r3(Math.max(0, mean - 3 * sd))), borderColor: '#e15759', borderDash: [6, 4], borderWidth: 1.2, pointRadius: 0 },
                        ],
                    },
                    options: { plugins: { legend: { position: 'bottom' } } },
                }, 300);
            }
        }

        // ── Gauge kelengkapan data ──
        const terisi = cols.reduce((a, c) => a + c.count, 0), kosong = cols.reduce((a, c) => a + c.missing, 0);
        if (terisi + kosong > 0) {
            const lengkap = r3((terisi / (terisi + kosong)) * 100);
            P.chart(body, 'Gauge: Data Completeness', {
                type: 'doughnut',
                data: { labels: ['Populated', 'Missing'], datasets: [{ data: [lengkap, r3(100 - lengkap)], backgroundColor: [PAL[4], 'rgba(128,128,128,.28)'], borderWidth: 0 }] },
                options: { circumference: 180, rotation: 270, cutout: '70%', plugins: { legend: { display: false }, gaugeText: { title: 'complete', value: `${lengkap}%` } } },
            }, 240);
        }
    }

    // ---------- entry point ----------
    window.SkunderExt = {
        stopAll() {
            extCharts.forEach((c) => {
                try { c.stop(); } catch (e) { }
            });
        },
        init(ctx) {
            extCharts.forEach((c) => { try { c.destroy(); } catch (e) { } });
            extCharts = []; bgrid = null;
            P = ctx; S = ctx.sheet; PAL = P.PALETTE;
            if (!S.rows.length) return;

            const bBody = P.section('builder', 'Chart Builder Select columns & chart types, drag ⠿ to reorder');
            const bSec = bBody.parentElement;
            const tools = P.el('div', 'btoolbar');
            const add = P.el('button', 'btn secondary', 'Add Chart'), reset = P.el('button', 'btn secondary', '↺ Reset Layout');
            tools.append(add, reset, P.el('span', 'muted', `Customize chart types, axes, aggregations, sorting, and card size. Layout is auto-saved. Computed from first ${S.rows.length.toLocaleString('en-US')} rows.`));
            bSec.insertBefore(tools, bBody);
            bgrid = bBody;

            const saved = ((P.vscode.getState() || {}).dash || {})[P.state.fileName + '|' + S.name];
            (Array.isArray(saved) ? saved.map(mk) : defaults()).forEach((c) => addCard(c));
            add.onclick = () => {
                const nums = S.columns.filter((c) => c.num), cat = S.columns.find((c) => c.type === 'category');
                const c = addCard(mk({ type: 'bar', x: cat ? cat.name : S.headers[0], y: nums[0] ? nums[0].name : '', agg: nums[0] ? 'mean' : 'count' }));
                c.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            reset.onclick = () => {
                const st = P.vscode.getState() || {}; if (st.dash) { delete st.dash[P.state.fileName + '|' + S.name]; P.vscode.setState(st); }
                [...bgrid.children].forEach((c) => { if (c._chart) drop(c._chart); c.remove(); });
                defaults().forEach((c) => addCard(c));
            };
            enableDnD(bgrid, save);

            const eBody = P.section('advanced', '🧪 Advanced Visualizations');
            extras(eBody);

            const chartsSec = document.getElementById('charts') || document.getElementById('grafik');
            if (chartsSec) {
                chartsSec.before(bSec);
                chartsSec.after(eBody.parentElement);
            }

            P.app.querySelectorAll('.grid').forEach((g) => {
                if (g === bgrid) return;
                // Panel “Grafik Pratinjau Data” punya tata letak sendiri (tanpa kartu yang bisa digeser).
                if (g.classList.contains('pv-grid')) return;
                g.querySelectorAll(':scope > .card:not(.wide)').forEach((c) => {
                    const gr = P.el('span', 'grip', '⠿');
                    gr.title = 'Drag to reorder';
                    c.appendChild(gr);
                });
                enableDnD(g);
            });
            P.app.querySelectorAll('.card').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 30)));
        },
    };
})();