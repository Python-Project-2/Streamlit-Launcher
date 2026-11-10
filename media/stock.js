/* global Chart */
/**
 * “📈 Analisis Saham” — bagian khusus data pasar modal (OHLCV) di halaman analisis.
 *
 * Bagian ini otomatis mendeteksi kolom Tanggal / Open / High / Low / Close / Volume
 * (nama Indonesia maupun Inggris), lalu menggambar:
 *  • kartu KPI (harga terakhir, perubahan, tertinggi/terendah, volume, volatilitas, RSI),
 *  • grafik candlestick / OHLC + volume + garis MA (5/20/50),
 *  • grafik volume harian, perubahan harian (%), dan RSI(14).
 *
 * Grafik diperbarui di tempat (chart.update) saat kontrol berubah supaya daftar `charts`
 * halaman utama (dipakai export DOCX/PDF/PPT) tetap berisi contoh yang hidup.
 */
(function () {
    'use strict';

    const PERIODS = [[60, '60 bar terakhir'], [120, '120 bar terakhir'], [250, '250 bar terakhir'], [500, '500 bar terakhir'], [0, 'Semua bar']];
    const MA_DEFS = [
        { id: 'ma5', n: 5, color: '#f28e2b' },
        { id: 'ma20', n: 20, color: '#af7aa1' },
        { id: 'ma50', n: 50, color: '#59a14f' },
    ];

    let P = null, S = null;
    let body = null;              // div.grid bagian ini
    let kpiBox = null;
    let det = null;               // hasil deteksi kolom
    let cfg = null;               // { period, style, ma: {ma5,ma20,ma50}, volume }
    let bars = [];
    let st = null;
    let refs = { main: null, vol: null, chg: null, rsi: null };   // instance Chart.js
    let lang = 'id';
    let toastTimer = 0;

    const L = (id, zh) => (lang === 'zh-cn' ? zh : id);
    const hasVol = () => bars.some((b) => b.v !== null && b.v !== undefined);

    function destroy() {
        Object.keys(refs).forEach((k) => {
            try { if (refs[k]) { refs[k].destroy(); } } catch (e) { /* sudah mati */ }
            refs[k] = null;
        });
        body = null; kpiBox = null; det = null; cfg = null; bars = []; st = null;
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    }

    // ── data ────────────────────────────────────────────────────────────────────

    function currentBars() {
        const ex = SkunderCandles.extract(S.rows, S.headers, det, cfg.period);
        return ex.bars;
    }

    function maSeries() {
        const closes = bars.map((b) => b.c);
        return MA_DEFS.map((m) => ({
            label: 'MA' + m.n,
            color: m.color,
            hidden: !cfg.ma[m.id],
            data: SkunderCandles.sma(closes, m.n),
        }));
    }

    /** Terapkan data candle terbaru ke grafik utama tanpa membuat ulang. */
    function applyMain(chart) {
        const mas = maSeries();
        const labels = bars.map((b) => b.t);
        chart.data.labels = labels;
        const ds0 = chart.data.datasets[0];
        const hv = hasVol();
        ds0.data = bars.map((b) => (hv ? (b.v || 0) : 1));
        ds0.backgroundColor = bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.45)' : 'rgba(239,83,80,.45)'));
        ds0.skCandles.bars = bars;
        ds0.skCandles.style = cfg.style === 'ohlc' ? 'ohlc' : 'candle';
        mas.forEach((m, i) => {
            const ds = chart.data.datasets[1 + i];
            if (!ds) { return; }
            ds.data = m.data;
            ds.hidden = !!m.hidden;
        });
        let lo = Infinity, hi = -Infinity, volMax = 0;
        bars.forEach((b) => {
            if (b.l < lo) { lo = b.l; }
            if (b.h > hi) { hi = b.h; }
            if (b.v > volMax) { volMax = b.v; }
        });
        const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.02 || 1;
        chart.options.scales.y.min = lo - pad;
        chart.options.scales.y.max = hi + pad;
        chart.options.scales.y2.max = (volMax || 1) * 4;
        chart.update();
    }

    function applySimple(chart, values, colors) {
        chart.data.labels = bars.map((b) => b.t);
        const ds = chart.data.datasets[0];
        ds.data = values;
        if (colors) { ds.backgroundColor = colors; }
        chart.update();
    }

    function applyRsi(chart) {
        const closes = bars.map((b) => b.c);
        const r = SkunderCandles.rsi(closes, 14);
        chart.data.labels = bars.map((b) => b.t);
        chart.data.datasets[0].data = r;
        chart.data.datasets[1].data = bars.map(() => 70);
        chart.data.datasets[2].data = bars.map(() => 30);
        chart.update();
    }

    // ── KPI ─────────────────────────────────────────────────────────────────────

    function kpi(label, value, cls, title) {
        const d = P.el('div', 'kpi' + (cls ? ' ' + cls : ''));
        d.innerHTML = '<b>' + value + '</b><span>' + P.esc(label) + '</span>';
        if (title) { d.title = title; }
        return d;
    }

    function renderKpis() {
        if (!kpiBox) { return; }
        kpiBox.innerHTML = '';
        const naik = (st.chgPct || 0) >= 0;
        kpiBox.appendChild(kpi('Harga Terakhir', P.fmt(st.last), 'kpi-info'));
        kpiBox.appendChild(kpi('Perubahan', (naik ? '▲ +' : '▼ ') + (Math.round((st.chgPct || 0) * 100) / 100) + '%', naik ? 'kpi-ok' : 'kpi-crit'));
        kpiBox.appendChild(kpi('Tertinggi Periode', P.fmt(st.hi)));
        kpiBox.appendChild(kpi('Terendah Periode', P.fmt(st.lo)));
        if (st.volTotal !== null) {
            kpiBox.appendChild(kpi('Total Volume', P.fmt(st.volTotal)));
            kpiBox.appendChild(kpi('Rata-rata Volume', P.fmt(st.volAvg)));
        }
        if (st.retStd !== null) {
            kpiBox.appendChild(kpi('Volatilitas (per bar)', (Math.round(st.retStd * 100) / 100) + '%'));
        }
        if (st.rsi14 !== null && st.rsi14 !== undefined) {
            const over = st.rsi14 >= 70 ? ' · ' + L('Jenuh Beli', '超买') : st.rsi14 <= 30 ? ' · ' + L('Jenuh Jual', '超卖') : ' · ' + L('Netral', '中性');
            kpiBox.appendChild(kpi('RSI (14)', Math.round(st.rsi14) + over, st.rsi14 >= 70 ? 'kpi-warn' : st.rsi14 <= 30 ? 'kpi-info' : ''));
        }
        kpiBox.appendChild(kpi('Tren Periode', ((st.chgTotalPct || 0) >= 0 ? '▲ +' : '▼ ') + (Math.round((st.chgTotalPct || 0) * 100) / 100) + '%', (st.chgTotalPct || 0) >= 0 ? 'kpi-ok' : 'kpi-crit'));
    }

    // ── kartu & grafik ──────────────────────────────────────────────────────────

    function mainTitle() {
        return (det.full
            ? (cfg.style === 'ohlc' ? '📊 ' : '🕯️ ') + det.close + ' — ' + L('Candlestick', 'K线图') + (hasVol() ? ' + ' + L('Volume', '成交量') : '')
            : '📈 ' + det.close + ' — ' + L('Harga Penutupan (garis)', '收盘价（折线）')) + ' (' + (cfg.period ? cfg.period + ' ' + L('bar terakhir', '最近数据') : L('semua bar', '全部数据')) + ')';
    }

    /** Konfigurasi garis penutupan (dipakai bila kolom OHLC tidak lengkap). */
    function closeLineConfig() {
        const closes = bars.map((b) => b.c);
        const ma20 = SkunderCandles.sma(closes, 20);
        let lo = Infinity, hi = -Infinity;
        closes.forEach((c) => { if (c < lo) { lo = c; } if (c > hi) { hi = c; } });
        const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.02 || 1;
        return {
            type: 'line',
            data: {
                labels: bars.map((b) => b.t),
                datasets: [
                    { label: det.close, data: closes, borderColor: '#4e79a7', backgroundColor: 'rgba(78,121,167,.18)', fill: true, pointRadius: 0, tension: 0.25 },
                    { label: 'MA20', data: ma20, borderColor: '#af7aa1', borderWidth: 1.4, pointRadius: 0, tension: 0 },
                ],
            },
            options: {
                animation: { duration: 350 },
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
                scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } }, y: { min: lo - pad, max: hi + pad } },
            },
        };
    }

    function applyCloseLine(chart) {
        const closes = bars.map((b) => b.c);
        chart.data.labels = bars.map((b) => b.t);
        chart.data.datasets[0].data = closes;
        chart.data.datasets[1].data = SkunderCandles.sma(closes, 20);
        chart.update();
    }

    function buildCharts() {
        // Grafik utama (candlestick / OHLC, atau garis bila OHLC tak lengkap).
        const mainConf = det.full
            ? SkunderCandles.config({ bars, style: cfg.style, mas: maSeries(), fmt: P.fmt, lang })
            : closeLineConfig();
        const mainCard = P.chart(body, mainTitle(), mainConf, 380);
        mainCard.classList.add('wide');
        refs.main = Chart.getChart(mainCard.querySelector('canvas'));

        if (hasVol()) {
            const volCard = P.chart(body, '📦 ' + L('Volume Harian', '每日成交量'), {
                type: 'bar',
                data: {
                    labels: bars.map((b) => b.t),
                    datasets: [{ label: det.volume, data: bars.map((b) => b.v || 0), backgroundColor: bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.7)' : 'rgba(239,83,80,.7)')) }],
                },
                options: { animation: { duration: 300 }, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } } } },
            }, 200);
            volCard.classList.add('wide');
            refs.vol = Chart.getChart(volCard.querySelector('canvas'));
        }

        const chgCard = P.chart(body, '⚖️ ' + L('Perubahan Harian (%)', '每日涨跌 (%)'), {
            type: 'bar',
            data: {
                labels: bars.map((b) => b.t),
                datasets: [{ label: '%', data: bars.map((b, i) => (i === 0 ? null : b.o ? ((b.c - b.o) / b.o) * 100 : null)), backgroundColor: bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.75)' : 'rgba(239,83,80,.75)')) }],
            },
            options: { animation: { duration: 300 }, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } } } },
        }, 200);
        chgCard.classList.add('wide');
        refs.chg = Chart.getChart(chgCard.querySelector('canvas'));

        const rsiCard = P.chart(body, '📈 RSI (14)', {
            type: 'line',
            data: {
                labels: bars.map((b) => b.t),
                datasets: [
                    { label: 'RSI', data: SkunderCandles.rsi(bars.map((b) => b.c), 14), borderColor: '#4e79a7', backgroundColor: 'rgba(78,121,167,.15)', fill: true, pointRadius: 0, tension: 0.25 },
                    { label: '70', data: bars.map(() => 70), borderColor: 'rgba(239,83,80,.7)', borderDash: [6, 4], borderWidth: 1, pointRadius: 0 },
                    { label: '30', data: bars.map(() => 30), borderColor: 'rgba(38,166,154,.7)', borderDash: [6, 4], borderWidth: 1, pointRadius: 0 },
                ],
            },
            options: { animation: { duration: 300 }, plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } }, y: { min: 0, max: 100 } } },
        }, 200);
        rsiCard.classList.add('wide');
        refs.rsi = Chart.getChart(rsiCard.querySelector('canvas'));
    }

    function updateCharts() {
        const mas = maSeries();
        if (det.full && refs.main) {
            applyMain(refs.main);
        } else if (refs.main) {
            applyCloseLine(refs.main);
        }
        if (refs.main) {
            const h3 = refs.main.canvas.closest('.card').querySelector('h3');
            if (h3) { h3.textContent = mainTitle(); }
        }
        if (refs.vol) {
            refs.vol.data.labels = bars.map((b) => b.t);
            refs.vol.data.datasets[0].data = bars.map((b) => b.v || 0);
            refs.vol.data.datasets[0].backgroundColor = bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.7)' : 'rgba(239,83,80,.7)'));
            refs.vol.update();
        }
        if (refs.chg) {
            applySimple(refs.chg, bars.map((b, i) => (i === 0 ? null : b.o ? ((b.c - b.o) / b.o) * 100 : null)), bars.map((b) => (b.c >= b.o ? 'rgba(38,166,154,.75)' : 'rgba(239,83,80,.75)')));
        }
        if (refs.rsi) { applyRsi(refs.rsi); }
    }

    function redraw() {
        bars = currentBars();
        st = SkunderCandles.stats(bars);
        renderKpis();
        if (!refs.main) { buildCharts(); } else { updateCharts(); }
    }

    // ── kontrol ─────────────────────────────────────────────────────────────────

    function toast(text, ok) {
        let t = document.getElementById('sm-toast');
        if (!t) {
            t = P.el('div', 'sm-toast' + (ok === false ? ' bad' : ''));
            t.id = 'sm-toast';
            (body && body.parentElement || document.body).appendChild(t);
        }
        t.textContent = text;
        t.classList.toggle('bad', ok === false);
        t.classList.add('show');
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(() => { t.remove(); }, 2600);
    }

    function buildControls() {
        const tools = P.el('div', 'card wide sm-tools');
        // Kontrol bagian ini tidak dijalankan otomatis oleh pet Spider.
        tools.setAttribute('data-spider-skip', '1');
        tools.innerHTML =
            '<div class="sm-controls">' +
            '<label>' + P.esc(L('Periode', '区间')) + '<select id="sm-period">' + PERIODS.map(([v, l]) => '<option value="' + v + '"' + (cfg.period === v ? ' selected' : '') + '>' + P.esc(l) + '</option>').join('') + '</select></label>' +
            '<label>' + P.esc(L('Gaya grafik', '图形式样')) + '<select id="sm-style"><option value="candle"' + (cfg.style !== 'ohlc' ? ' selected' : '') + '>🕯️ ' + P.esc(L('Candlestick', 'K线图')) + '</option><option value="ohlc"' + (cfg.style === 'ohlc' ? ' selected' : '') + '>📊 ' + P.esc(L('Bar OHLC', 'OHLC 柱')) + '</option></select></label>' +
            MA_DEFS.map((m) => '<label class="sm-check"><input type="checkbox" id="sm-' + m.id + '"' + (cfg.ma[m.id] ? ' checked' : '') + '> MA' + m.n + '</label>').join('') +
            '</div>' +
            '<div class="muted sm-det">' + P.esc(L('Kolom terdeteksi', '检测到的列')) + ': ' +
            [
                det.date ? det.date + ' (' + L('tanggal', '日期') + ')' : '',
                det.open ? det.open + ' (open)' : '',
                det.high ? det.high + ' (high)' : '',
                det.low ? det.low + ' (low)' : '',
                det.close ? det.close + ' (close)' : '',
                det.volume ? det.volume + ' (volume)' : '',
            ].filter(Boolean)
                .map((s) => '<code>' + P.esc(s) + '</code>')
                .join(' · ') +
            (det.full ? '' : ' · <b>' + P.esc(L('OHLC tidak lengkap — hanya garis penutupan', 'OHLC 不完整 — 仅显示收盘折线')) + '</b>') +
            '</div>';

        tools.querySelector('#sm-period').addEventListener('change', (e) => { cfg.period = +e.target.value; redraw(); });
        tools.querySelector('#sm-style').addEventListener('change', (e) => { cfg.style = e.target.value; redraw(); });
        MA_DEFS.forEach((m) => {
            tools.querySelector('#sm-' + m.id).addEventListener('change', (e) => { cfg.ma[m.id] = e.target.checked; redraw(); });
        });
        body.appendChild(tools);
    }

    function hintCard() {
        const card = P.el('div', 'card wide');
        card.innerHTML =
            '<div style="padding:16px;">' +
            '<h3>⚠️ ' + P.esc(L('Data Saham (OHLC) Tidak Terdeteksi', '未检测到股票（OHLC）数据')) + '</h3>' +
            '<p class="muted">' + P.esc(L('Bagian ini muncul bila berkas punya kolom tanggal serta kolom angka Open, High, Low, Close (nama apa pun yang mirip, mis. Tanggal/Open/Tertinggi/Terendah/Penutupan).', '当文件包含日期列以及 Open、High、Low、Close 数值列时显示本区（支持相似命名，例如 Tanggal/Open/Tertinggi/Terendah/Penutupan）。')) + '</p>' +
            '</div>';
        body.appendChild(card);
    }

    // ── titik masuk ─────────────────────────────────────────────────────────────

    window.addEventListener('message', (ev) => {
        const m = ev.data;
        if (!m || m.type !== 'sk-locale' || !m.config) { return; }
        const next = m.config.lang === 'zh-cn' ? 'zh-cn' : 'id';
        if (next === lang || !body) { lang = next; return; }
        lang = next;
        // Label di dalam kanvas ikut berganti → bangun ulang bagian ini di posisi yang sama.
        try {
            const sec = body.parentElement;
            const anchorNode = sec.nextSibling;
            destroy();
            if (sec) { sec.remove(); }
            window.SkunderStock.init(P);
            const fresh = document.getElementById('saham');
            if (fresh && anchorNode && anchorNode.parentElement) { anchorNode.parentElement.insertBefore(fresh, anchorNode); }
        } catch (e) { /* biarkan label lama */ }
    });

    window.SkunderStock = {
        init(ctx) {
            destroy();
            P = ctx;
            S = ctx.sheet;
            if (!S || !S.columns || !S.columns.length || typeof Chart === 'undefined' || !window.SkunderCandles) { return; }
            lang = (window.__SK_I18N__ && window.__SK_I18N__.lang === 'zh-cn') ? 'zh-cn' : 'id';
            det = SkunderCandles.detect(S.headers, S.columns);
            if (!det.close && !det.open) { det = null; }

            body = P.section('saham', '📈 ' + L('Analisis Saham (Candlestick OHLC)', '股票分析（K线 OHLC）'));
            if (!det) { hintCard(); return; }

            cfg = { period: 250, style: 'candle', ma: { ma5: true, ma20: true, ma50: false } };
            bars = currentBars();
            st = SkunderCandles.stats(bars);

            kpiBox = P.el('div', 'kpis');
            body.parentElement.insertBefore(kpiBox, body);
            renderKpis();
            buildControls();
            buildCharts();
        },
        destroy,
    };
})();
