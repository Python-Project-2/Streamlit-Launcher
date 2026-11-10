/* global Chart */
/**
 * “Candles” — mesin grafik saham (candlestick / OHLC) Date Skunder.
 *
 * Berkas ini sengaja berdiri sendiri (tanpa dependensi DOM) supaya bisa dipakai bersama oleh:
 *  • media/stock.js   → bagian “📈 Analisis Saham” di halaman analisis,
 *  • media/preview.js → tipe grafik “Candlestick / OHLC” di Grafik Pratinjau,
 *  • media/builder.js → tipe grafik “Candlestick / OHLC Bar” di Chart Builder.
 *
 * Chart.js v4 tidak menyertakan tipe candlestick, jadi candle digambar lewat plugin kustom
 * `skCandles`: dataset pembawa (bar volume / bar tak terlihat) hanya menyediakan skala,
 * interaksi, dan tooltip — badan serta sumbu candle digambar manual di kanvas.
 */
(function () {
    'use strict';

    // ── deteksi kolom OHLCV ─────────────────────────────────────────────────────

    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

    const PAT_DATE = [/^date$/, /^tanggal$/, /^tradedate$/, /^trade_date$/, /^waktu$/, /^time$/, /^day$/, /^hari$/, /date/, /tanggal/, /waktu/];
    const PAT_OPEN = [/^open$/, /^o$/, /^openprice$/, /^hargaopen$/, /^hargabuka$/, /^buka$/, /open/, /buka/];
    const PAT_HIGH = [/^high$/, /^hi$/, /^highprice$/, /^hargatertinggi$/, /^tertinggi$/, /high/, /tertinggi/, /highest/, /maxprice/];
    const PAT_LOW = [/^low$/, /^lo$/, /^lowprice$/, /^hargaterendah$/, /^terendah$/, /low/, /terendah/, /lowest/, /minprice/];
    const PAT_CLOSE = [/^close$/, /^c$/, /^closeprice$/, /^hargapenutup$/, /^penutup$/, /^penutupan$/, /close/, /penutup/, /closing/];
    const PAT_VOL = [/^volume$/, /^vol$/, /^v$/, /^jumlahvolume$/, /^qty$/, /^quantity$/, /^jumlah$/, /volume/, /vol/, /qty/, /quantity/];

    /**
     * Cari kolom yang cocok dengan daftar pola (urutan pola = prioritas).
     * `numeric` true → hanya kolom angka (Desimal/Bulat) yang dianggap.
     */
    function findCol(headers, columns, pats, numeric) {
        for (const pat of pats) {
            for (let i = 0; i < headers.length; i++) {
                const c = columns ? columns[i] : null;
                if (numeric && (!c || (c.type !== 'number' && c.type !== 'integer'))) { continue; }
                if (pat.test(norm(headers[i]))) { return headers[i]; }
            }
        }
        return '';
    }

    /**
     * Deteksi kolom saham (tanggal + Open/High/Low/Close/Volume) dari header & info kolom.
     * Menghasilkan { date, open, high, low, close, volume, full } — `full` true bila
     * keempat kolom OHLC ditemukan (candle bisa digambar).
     */
    function detect(headers, columns) {
        const colOfType = (t) => {
            const i = (columns || []).findIndex((c) => c && c.type === t);
            return i >= 0 ? headers[i] : '';
        };
        let date = findCol(headers, columns, PAT_DATE, false) || colOfType('date');
        const open = findCol(headers, columns, PAT_OPEN, true);
        const high = findCol(headers, columns, PAT_HIGH, true);
        const low = findCol(headers, columns, PAT_LOW, true);
        const close = findCol(headers, columns, PAT_CLOSE, true);
        const volume = findCol(headers, columns, PAT_VOL, true);
        // Kolom tanggal yang sama dengan kolom angka OHLC tidak masuk akal → kosongkan.
        if (date && (date === open || date === high || date === low || date === close)) { date = colOfType('date') !== close ? colOfType('date') : ''; }
        const uniq = [open, high, low, close].filter(Boolean);
        const distinct = new Set(uniq).size === uniq.length;
        const full = !!(distinct && open && high && low && close);
        return { date, open, high, low, close, volume, full };
    }

    // ── ekstraksi bar (baris OHLC) ──────────────────────────────────────────────

    const toNum = (v) => {
        if (typeof v === 'number') { return isFinite(v) ? v : null; }
        if (v === null || v === undefined || v === '') { return null; }
        const s = String(v).replace(/[,\s]/g, '').replace(/[^\d.\-eE+]/g, '');
        if (!s || s === '-' || s === '.') { return null; }
        const n = Number(s);
        return isFinite(n) ? n : null;
    };

    /**
     * Ambil bar OHLC dari baris data. Hasil diurutkan menaik menurut tanggal
     * (parse tanggal bila bisa, jika tidak bandingkan sebagai teks), lalu dipotong
     * ke `limit` bar terakhir (0 = semua).
     */
    function extract(rows, headers, det, limit) {
        const idx = (n) => (n ? headers.indexOf(n) : -1);
        const di = idx(det.date), oi = idx(det.open), hi = idx(det.high), li = idx(det.low), ci = idx(det.close), vi = idx(det.volume);
        let bars = [];
        for (const r of rows || []) {
            const o = oi >= 0 ? toNum(r[oi]) : null;
            const h = hi >= 0 ? toNum(r[hi]) : null;
            const l = li >= 0 ? toNum(r[li]) : null;
            const c = ci >= 0 ? toNum(r[ci]) : null;
            if (o === null || h === null || l === null || c === null) { continue; }
            const t = di >= 0 && r[di] !== null && r[di] !== undefined && r[di] !== '' ? String(r[di]) : String(bars.length + 1);
            const v = vi >= 0 ? toNum(r[vi]) : null;
            bars.push({ t, o, h, l, c, v });
        }
        const ts = (t) => { const d = Date.parse(t); return Number.isFinite(d) ? d : null; };
        if (bars.length > 1) {
            const anyTs = bars.some((b) => ts(b.t) !== null);
            if (anyTs) {
                bars.sort((a, b) => {
                    const ta = ts(a.t), tb = ts(b.t);
                    return (ta === null ? 0 : ta) - (tb === null ? 0 : tb);
                });
            } else {
                bars.sort((a, b) => String(a.t).localeCompare(String(b.t)));
            }
        }
        if (limit > 0 && bars.length > limit) { bars = bars.slice(bars.length - limit); }
        return { bars };
    }

    // ── indikator ───────────────────────────────────────────────────────────────

    /** Rata-rata bergerak sederhana; posisi < n-1 bernilai null. */
    function sma(vals, n) {
        const out = new Array(vals.length).fill(null);
        if (n <= 0) { return out; }
        let sum = 0;
        for (let i = 0; i < vals.length; i++) {
            sum += vals[i];
            if (i >= n) { sum -= vals[i - n]; }
            if (i >= n - 1) { out[i] = sum / n; }
        }
        return out;
    }

    /** RSI Wilder (bawaan 14); posisi < n bernilai null. */
    function rsi(closes, n) {
        const len = closes.length;
        const out = new Array(len).fill(null);
        const p = n > 1 ? n : 14;
        if (len <= p) { return out; }
        let gain = 0, loss = 0;
        for (let i = 1; i <= p; i++) {
            const d = closes[i] - closes[i - 1];
            if (d >= 0) { gain += d; } else { loss -= d; }
        }
        gain /= p; loss /= p;
        out[p] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
        for (let i = p + 1; i < len; i++) {
            const d = closes[i] - closes[i - 1];
            gain = (gain * (p - 1) + (d > 0 ? d : 0)) / p;
            loss = (loss * (p - 1) + (d < 0 ? -d : 0)) / p;
            out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
        }
        return out;
    }

    /** Statistik ringkas satu periode bar (untuk kartu KPI bagian Saham). */
    function stats(bars) {
        const n = bars.length;
        const none = { last: null, prev: null, chg: null, chgPct: null, hi: null, lo: null, volTotal: null, volAvg: null, retStd: null, rsi14: null, chgTotalPct: null, count: n };
        if (!n) { return none; }
        const closes = bars.map((b) => b.c);
        const last = closes[n - 1];
        const prev = n > 1 ? closes[n - 2] : last;
        let hi = -Infinity, lo = Infinity, volTotal = 0, volCnt = 0;
        for (const b of bars) {
            if (b.h > hi) { hi = b.h; }
            if (b.l < lo) { lo = b.l; }
            if (b.v !== null && b.v !== undefined) { volTotal += b.v; volCnt++; }
        }
        const rets = [];
        for (let i = 1; i < n; i++) { rets.push(((closes[i] / closes[i - 1]) - 1) * 100); }
        const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
        const std = rets.length ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rets.length) : null;
        const r = rsi(closes, 14);
        return {
            count: n,
            last, prev,
            chg: last - prev,
            chgPct: prev ? ((last - prev) / prev) * 100 : 0,
            hi, lo,
            volTotal: volCnt ? volTotal : null,
            volAvg: volCnt ? volTotal / volCnt : null,
            retStd: std,
            rsi14: r[n - 1],
            chgTotalPct: closes[0] ? ((last / closes[0]) - 1) * 100 : 0,
        };
    }

    // ── plugin Chart.js ─────────────────────────────────────────────────────────

    const UP = '#26a69a';
    const DOWN = '#ef5350';

    /**
     * Gambar candle / bar OHLC untuk setiap dataset bertanda `ds.skCandles`.
     * Dataset pembawa (bar volume atau bar 1 tak terlihat) hanya menyiapkan skala,
     * posisi kategori, dan tooltip — bentuk candle digambar sendiri di sini.
     */
    const skCandlesPlugin = {
        id: 'skCandles',
        beforeDatasetsDraw(chart) {
            const area = chart.chartArea;
            if (!area || area.width <= 0) { return; }
            const ctx = chart.ctx;
            ctx.save();
            for (const ds of chart.data.datasets) {
                const conf = ds && ds.skCandles;
                if (!conf || !conf.bars || !conf.bars.length) { continue; }
                const x = chart.scales[ds.xAxisID || 'x'];
                const y = chart.scales[ds.yAxisID || 'y'];
                if (!x || !y) { continue; }
                const bars = conf.bars;
                const step = bars.length > 1
                    ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0))
                    : Math.min(40, area.width / 4);
                const style = conf.style === 'ohlc' ? 'ohlc' : 'candle';
                const bodyW = Math.max(1, Math.min(30, step * 0.68));
                const tick = Math.max(2, bodyW / 2);
                for (let i = 0; i < bars.length; i++) {
                    const b = bars[i];
                    const cx = x.getPixelForValue(i);
                    if (!isFinite(cx) || cx < area.left - bodyW || cx > area.right + bodyW) { continue; }
                    const up = b.c >= b.o;
                    const color = up ? (conf.up || UP) : (conf.down || DOWN);
                    const yH = y.getPixelForValue(b.h);
                    const yL = y.getPixelForValue(b.l);
                    const yO = y.getPixelForValue(b.o);
                    const yC = y.getPixelForValue(b.c);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = Math.max(1, Math.min(2, bodyW * 0.14));
                    if (style === 'ohlc') {
                        ctx.beginPath();
                        ctx.moveTo(cx, yH); ctx.lineTo(cx, yL);
                        ctx.moveTo(cx - tick, yO); ctx.lineTo(cx, yO);
                        ctx.moveTo(cx, yC); ctx.lineTo(cx + tick, yC);
                        ctx.stroke();
                    } else {
                        const top = Math.min(yO, yC);
                        const hgt = Math.max(1, Math.abs(yC - yO));
                        ctx.beginPath();
                        ctx.moveTo(cx, yH); ctx.lineTo(cx, top);
                        ctx.moveTo(cx, top + hgt); ctx.lineTo(cx, yL);
                        ctx.stroke();
                        ctx.fillStyle = up ? 'rgba(38,166,154,.9)' : 'rgba(239,83,80,.9)';
                        ctx.fillRect(cx - bodyW / 2, top, bodyW, hgt);
                        ctx.strokeRect(cx - bodyW / 2, top, bodyW, hgt);
                    }
                }
            }
            ctx.restore();
        },
        afterDraw(chart) {
            // Garis bantu vertikal mengikuti candle yang di-hover (kalau tooltip aktif).
            const tip = chart.tooltip;
            const act = tip && tip.getActiveElements ? tip.getActiveElements() : [];
            if (!act.length || !tip || tip.opacity === 0 || !chart.chartArea) { return; }
            const x = act[0].element.x;
            if (!isFinite(x)) { return; }
            const ctx = chart.ctx;
            const a = chart.chartArea;
            ctx.save();
            ctx.strokeStyle = 'rgba(128,128,128,.45)';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, a.top);
            ctx.lineTo(x, a.bottom);
            ctx.stroke();
            ctx.restore();
        },
    };

    let registered = false;
    function register() {
        if (registered) { return; }
        if (typeof Chart !== 'undefined' && Chart && typeof Chart.register === 'function') {
            try { Chart.register(skCandlesPlugin); registered = true; } catch (e) { /* digambar ulang berikutnya */ }
        }
    }

    // ── angka ringkas ───────────────────────────────────────────────────────────

    function fmtShort(v) {
        const n = Number(v);
        if (!isFinite(n)) { return String(v); }
        const abs = Math.abs(n);
        if (abs >= 1e9) { return (n / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + ' M'; }
        if (abs >= 1e6) { return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + ' jt'; }
        if (abs >= 1e4) { return (n / 1e3).toFixed(0) + ' rb'; }
        return String(Math.round(n * 100) / 100);
    }

    /**
     * Susun konfigurasi Chart.js untuk candlestick / OHLC.
     * opts: { bars, style: 'candle'|'ohlc', mas: [{label,data,color,hidden}], fmt, lang }
     */
    function config(opts) {
        register();
        const bars = opts.bars || [];
        const lang = opts.lang === 'zh-cn' ? 'zh-cn' : 'id';
        const L = (id, zh) => (lang === 'zh-cn' ? zh : id);
        const fmt = typeof opts.fmt === 'function' ? opts.fmt : ((x) => String(Math.round(Number(x) * 100) / 100));
        let lo = Infinity, hi = -Infinity, volMax = 0;
        let hasVol = false;
        bars.forEach((b) => {
            if (b.l < lo) { lo = b.l; }
            if (b.h > hi) { hi = b.h; }
            if (b.v !== null && b.v !== undefined) { hasVol = true; if (b.v > volMax) { volMax = b.v; } }
        });
        const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.02 || 1;
        lo -= pad; hi += pad;

        const datasets = [];
        // Dataset pembawa: volume nyata (sumbu y2 tersembunyi, maks 4× supaya menempati
        // seperempat bawah kanvas) — atau bar 1 tak terlihat bila tidak ada kolom volume.
        datasets.push({
            type: 'bar',
            label: L('Volume', '成交量'),
            data: bars.map((b) => (hasVol ? (b.v || 0) : 1)),
            backgroundColor: bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)')),
            hoverBackgroundColor: bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)')),
            yAxisID: 'y2',
            order: 4,
            barPercentage: 0.7,
            categoryPercentage: 1,
            skCandles: { bars, style: opts.style === 'ohlc' ? 'ohlc' : 'candle', up: UP, down: DOWN },
        });
        (opts.mas || []).forEach((m) => {
            datasets.push({
                type: 'line',
                label: m.label,
                data: m.data,
                borderColor: m.color || '#f28e2b',
                backgroundColor: m.color || '#f28e2b',
                borderWidth: 1.4,
                pointRadius: 0,
                tension: 0,
                yAxisID: 'y',
                order: 1,
                hidden: !!m.hidden,
            });
        });

        return {
            type: 'bar',
            data: { labels: bars.map((b) => b.t), datasets },
            options: {
                animation: { duration: 350 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const ds = ctx.chart.data.datasets[ctx.datasetIndex];
                                if (ds && ds.skCandles) {
                                    const b = ds.skCandles.bars[ctx.dataIndex];
                                    if (!b) { return ''; }
                                    const chg = b.o ? ((b.c - b.o) / b.o) * 100 : 0;
                                    const panah = chg >= 0 ? '▲ +' : '▼ ';
                                    return [
                                        'O ' + fmt(b.o) + ' · H ' + fmt(b.h) + ' · L ' + fmt(b.l),
                                        'C ' + fmt(b.c) + ' (' + panah + (Math.round(chg * 100) / 100) + '%)',
                                        hasVol ? L('Vol', '成交量') + ' ' + fmt(b.v || 0) : '',
                                    ].filter(Boolean);
                                }
                                return (ds && ds.label ? ds.label + ': ' : '') + (ctx.parsed && ctx.parsed.y != null ? fmt(ctx.parsed.y) : '–');
                            },
                        },
                    },
                },
                scales: {
                    x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } },
                    y: { min: lo, max: hi, ticks: { callback: (v) => fmtShort(v) } },
                    y2: { display: false, min: 0, max: (volMax || 1) * 4 },
                },
            },
        };
    }

    const api = { detect, extract, sma, rsi, stats, config, register, plugin: skCandlesPlugin, fmtShort, UP, DOWN };
    if (typeof window !== 'undefined') {
        window.SkunderCandles = api;
        register();
    }
    if (typeof module !== 'undefined' && module.exports) {
        // Dipakai uji otomatis (node) tanpa Chart/DOM.
        module.exports = api;
    }
})();
