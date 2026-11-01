(function () {
    'use strict';
    var api = null;
    try { api = acquireVsCodeApi(); } catch (e) { api = null; }
    // Mode "solo": halaman khusus siaran (jendela TV atau browser TV lewat jaringan lokal) → lapisan
    // langsung terbuka, tanpa tombol tutup/jendela/sambung.
    var solo = !!(document.body && document.body.getAttribute('data-ec-solo'));
    function post(type) {
        if (api) { api.postMessage({ type: type }); return; }
        if (type === 'easycastFullscreen') {
            var d = document.documentElement;
            if (document.fullscreenElement) { document.exitFullscreen(); }
            else if (d.requestFullscreen) { d.requestFullscreen(); }
        }
    }

    var data = null;          // WorkbookResult terbaru
    var ov = null;            // elemen lapisan (null = tertutup)
    var slides = [], idx = 0, secs = 12, paused = false, timer = null, rev = 0;

    /* ---------- utilitas DOM ---------- */
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) { e.className = cls; }
        if (text !== undefined && text !== null) { e.textContent = text; }
        return e;
    }
    function clear(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }
    function fmt(n) {
        if (typeof n !== 'number' || !isFinite(n)) { return String(n === undefined || n === null ? '-' : n); }
        var a = Math.abs(n);
        if (a >= 1e9) { return (n / 1e9).toFixed(2) + ' M'; }
        if (a >= 1e6) { return (n / 1e6).toFixed(2) + ' jt'; }
        if (a >= 1000) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
        return String(Math.round(n * 100) / 100);
    }
    function pct(x) { return (x * 100).toFixed(1) + '%'; }

    /* ---------- gaya (di-scope ke #ec-ov dan diawali "ec-" agar tidak bentrok dengan main.css) ---------- */
    var CSS = [
        '#ec-ov{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;padding:2.2vh 3vw;background:#0b1020;color:#e8ecf8;font-family:Segoe UI,Roboto,Arial,sans-serif;box-sizing:border-box}',
        '#ec-ov *{box-sizing:border-box}',
        '#ec-ov .ec-head{display:flex;align-items:center;justify-content:space-between;gap:2vw}',
        '#ec-ov .ec-brand{font-size:2.2vw;font-weight:700;color:#6ea8fe;white-space:nowrap}',
        '#ec-ov .ec-file{font-size:1.7vw;color:#9aa6c7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:center}',
        '#ec-ov .ec-right{display:flex;align-items:center;gap:1vw;font-size:1.5vw;color:#9aa6c7;white-space:nowrap}',
        '#ec-ov .ec-dot{display:inline-block;width:1vw;height:1vw;border-radius:50%;background:#4cd98a;margin-right:.5vw}',
        '#ec-ov button{font:inherit;font-size:1.4vw;color:#e8ecf8;background:#1c2442;border:1px solid #2c3866;border-radius:10px;padding:.6vh 1vw;cursor:pointer;margin:0;width:auto;height:auto}',
        '#ec-ov button:hover{background:#27336a}',
        '#ec-ov button.ec-x{background:#5a1f2b;border-color:#8a3345}',
        '#ec-ov .ec-prog{height:.6vh;background:#6ea8fe;width:0;margin:1.4vh 0;border-radius:4px}',
        '@keyframes ec-prog{from{width:0}to{width:100%}}',
        '#ec-ov .ec-stage{flex:1;min-height:0;overflow:hidden}',
        '#ec-ov .ec-foot{display:flex;justify-content:space-between;font-size:1.3vw;color:#6f7ba0;padding-top:1vh}',
        '#ec-ov h2.ec-h{font-size:3.4vw;margin:0 0 2vh;color:#e8ecf8;font-weight:700;border:0;padding:0}',
        '#ec-ov .ec-sub{font-size:1.7vw;color:#9aa6c7;margin-bottom:1.6vh}',
        '#ec-ov .ec-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(16vw,1fr));gap:1.4vw;margin-bottom:2.4vh}',
        '#ec-ov .ec-card{background:#151c33;border-radius:18px;padding:2.2vh 1.4vw;border:0;box-shadow:none}',
        '#ec-ov .ec-k{font-size:1.5vw;color:#9aa6c7}',
        '#ec-ov .ec-v{font-size:4.2vw;font-weight:800;margin-top:.6vh}',
        '#ec-ov .ec-good{color:#4cd98a}#ec-ov .ec-warn{color:#ffc857}#ec-ov .ec-bad{color:#ff6b6b}#ec-ov .ec-acc{color:#6ea8fe}',
        '#ec-ov ul.ec-ins{list-style:none;padding:0;margin:0}',
        '#ec-ov ul.ec-ins li{font-size:2vw;line-height:1.35;background:#151c33;border-radius:14px;padding:1.3vh 1.4vw;margin:0 0 1.2vh;border-left:.5vw solid #6ea8fe}',
        '#ec-ov .ec-bars{display:flex;flex-direction:column;gap:1.3vh}',
        '#ec-ov .ec-brow{display:flex;align-items:center;gap:1.2vw;font-size:1.8vw}',
        '#ec-ov .ec-blabel{width:20vw;text-align:right;color:#c9d2ee;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#ec-ov .ec-btrack{flex:1;background:#151c33;border-radius:10px;height:3.2vh;overflow:hidden}',
        '#ec-ov .ec-bfill{height:100%;background:linear-gradient(90deg,#3d7bff,#6ea8fe);border-radius:10px}',
        '#ec-ov .ec-bval{width:9vw;color:#e8ecf8;font-weight:700}',
        '#ec-ov table.ec-table{width:100%;border-collapse:collapse;font-size:1.8vw;background:transparent}',
        '#ec-ov .ec-table th{color:#9aa6c7;text-align:right;font-weight:600;padding:1vh 1vw;border:0;border-bottom:2px solid #263055;background:transparent}',
        '#ec-ov .ec-table td{text-align:right;padding:1.2vh 1vw;border:0;border-bottom:1px solid #1c2442;background:transparent;color:#e8ecf8}',
        '#ec-ov .ec-table th:first-child,#ec-ov .ec-table td:first-child{text-align:left}',
        '#ec-ov .ec-two{display:grid;grid-template-columns:1fr 1fr;gap:2vw}',
        '#ec-ov .ec-chk{font-size:1.9vw;margin-bottom:1.1vh;display:flex;gap:1vw;align-items:baseline}',
        '#ec-ov svg.ec-line{width:100%;height:48vh;background:#151c33;border-radius:18px}',
        '#ec-ov .ec-msg{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}',
        '#ec-ov .ec-msg h1{font-size:4.4vw;margin:0 0 2vh;color:#e8ecf8}#ec-ov .ec-msg p{font-size:2vw;color:#9aa6c7;margin:0}'
    ].join('\n');
    function ensureStyle() {
        if (document.getElementById('ec-style')) { return; }
        var s = document.createElement('style');
        s.id = 'ec-style'; s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* ---------- komponen grafik ---------- */
    function card(k, v, cls) {
        var c = el('div', 'ec-card');
        c.appendChild(el('div', 'ec-k', k));
        c.appendChild(el('div', 'ec-v ' + (cls || ''), v));
        return c;
    }
    function title(root, t, sub) {
        root.appendChild(el('h2', 'ec-h', t));
        if (sub) { root.appendChild(el('div', 'ec-sub', sub)); }
    }
    function bars(labels, values) {
        var wrap = el('div', 'ec-bars'), max = 0, i;
        for (i = 0; i < values.length; i++) { if (values[i] > max) { max = values[i]; } }
        if (!max) { max = 1; }
        for (i = 0; i < labels.length; i++) {
            var row = el('div', 'ec-brow');
            row.appendChild(el('div', 'ec-blabel', String(labels[i])));
            var track = el('div', 'ec-btrack'), fill = el('div', 'ec-bfill');
            fill.style.width = Math.max(2, Math.round(values[i] / max * 100)) + '%';
            track.appendChild(fill); row.appendChild(track);
            row.appendChild(el('div', 'ec-bval', fmt(values[i])));
            wrap.appendChild(row);
        }
        return wrap;
    }
    function line(labels, values) {
        var ns = 'http://www.w3.org/2000/svg', W = 1000, H = 360, P = 36, i;
        var svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'ec-line');
        var mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
        if (mx === mn) { mx = mn + 1; }
        var pts = [];
        for (i = 0; i < values.length; i++) {
            var x = P + i * (W - 2 * P) / Math.max(1, values.length - 1);
            var y = H - P - (values[i] - mn) / (mx - mn) * (H - 2 * P);
            pts.push(x.toFixed(1) + ',' + y.toFixed(1));
        }
        var pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute('points', pts.join(' ')); pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', '#6ea8fe'); pl.setAttribute('stroke-width', '4'); pl.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(pl);
        function txt(s, x, y, anchor) {
            var t = document.createElementNS(ns, 'text');
            t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('fill', '#9aa6c7');
            t.setAttribute('font-size', '20'); t.setAttribute('text-anchor', anchor); t.textContent = s; svg.appendChild(t);
        }
        txt(String(labels[0]), P, H - 8, 'start'); txt(String(labels[labels.length - 1]), W - P, H - 8, 'end');
        txt('maks ' + fmt(mx), P, 24, 'start'); txt('min ' + fmt(mn), W - P, 24, 'end');
        return svg;
    }
    function table(head, rows) {
        var t = el('table', 'ec-table'), tr = el('tr'), i, j;
        for (i = 0; i < head.length; i++) { tr.appendChild(el('th', '', head[i])); }
        t.appendChild(tr);
        for (i = 0; i < rows.length; i++) {
            tr = el('tr');
            for (j = 0; j < rows[i].length; j++) { tr.appendChild(el('td', '', rows[i][j])); }
            t.appendChild(tr);
        }
        return t;
    }
    function list(items, from, to) {
        var ul = el('ul', 'ec-ins');
        for (var i = from; i < Math.min(to, items.length); i++) { ul.appendChild(el('li', '', String(items[i]))); }
        return ul;
    }

    /* ---------- susun slide dari hasil analisis ---------- */
    function sheetSlides(sh) {
        var out = [], i;
        var q = sh.csvHealth ? sh.csvHealth.qualityScore : null;
        var cols = sh.columns || [];
        out.push({
            b: function (r) {
                title(r, 'Ringkasan Data', sh.name);
                var c = el('div', 'ec-cards');
                c.appendChild(card('Baris', fmt(sh.totalRows), 'ec-acc'));
                c.appendChild(card('Kolom', fmt(sh.headers.length), 'ec-acc'));
                c.appendChild(card('Sel kosong', fmt(sh.missingCells), sh.missingCells ? 'ec-warn' : 'ec-good'));
                c.appendChild(card('Duplikat', fmt(sh.duplicates), sh.duplicates ? 'ec-warn' : 'ec-good'));
                if (q !== null && q !== undefined) { c.appendChild(card('Skor kualitas', q + '%', q >= 90 ? 'ec-good' : q >= 75 ? 'ec-warn' : 'ec-bad')); }
                r.appendChild(c);
                var types = {}, labels = [], vals = [], k;
                for (i = 0; i < cols.length; i++) { types[cols[i].type] = (types[cols[i].type] || 0) + 1; }
                for (k in types) { if (types.hasOwnProperty(k)) { labels.push(k); vals.push(types[k]); } }
                r.appendChild(el('div', 'ec-sub', 'Tipe kolom'));
                r.appendChild(bars(labels, vals));
            }
        });
        var ins = sh.insights || [];
        if (ins.length) {
            out.push({ b: function (r) { title(r, 'Insight Utama'); r.appendChild(list(ins, 0, 6)); } });
            if (ins.length > 6) { out.push({ b: function (r) { title(r, 'Insight Lanjutan'); r.appendChild(list(ins, 6, 12)); } }); }
        }
        if (sh.csvHealth) {
            out.push({
                b: function (r) {
                    var h = sh.csvHealth;
                    title(r, 'Kualitas Data', h.qualityRating);
                    var c = el('div', 'ec-cards');
                    c.appendChild(card('Kelengkapan', h.completenessScore + '%', 'ec-acc'));
                    c.appendChild(card('Integritas', h.integrityScore + '%', 'ec-acc'));
                    c.appendChild(card('Konsistensi', h.consistencyScore + '%', 'ec-acc'));
                    r.appendChild(c);
                    for (i = 0; i < h.checklist.length; i++) {
                        var it = h.checklist[i], row = el('div', 'ec-chk');
                        row.appendChild(el('span', it.status === 'pass' ? 'ec-good' : it.status === 'warn' ? 'ec-warn' : 'ec-bad', it.status === 'pass' ? '✔' : it.status === 'warn' ? '▲' : '✖'));
                        row.appendChild(el('span', '', it.item + ' — ' + it.detail));
                        r.appendChild(row);
                    }
                }
            });
        }
        var nums = [], cats = [];
        for (i = 0; i < cols.length; i++) {
            if (cols[i].num) { nums.push(cols[i]); }
            if (cols[i].top && cols[i].type === 'category') { cats.push(cols[i]); }
        }
        if (nums.length) {
            out.push({
                b: function (r) {
                    title(r, 'Statistik Kolom Numerik');
                    var rows = [], n = Math.min(7, nums.length);
                    for (var a = 0; a < n; a++) { var s = nums[a].num; rows.push([nums[a].name, fmt(s.min), fmt(s.mean), fmt(s.median), fmt(s.max), fmt(s.outliers)]); }
                    r.appendChild(table(['Kolom', 'Min', 'Rata-rata', 'Median', 'Maks', 'Outlier'], rows));
                }
            });
        }
        if (cats.length) {
            out.push({
                b: function (r) {
                    title(r, 'Distribusi Kategori');
                    var wrap = el('div', 'ec-two'), n = Math.min(2, cats.length);
                    for (var a = 0; a < n; a++) {
                        var box = el('div'), top = cats[a].top.slice(0, 6), ls = [], vs = [];
                        for (var b = 0; b < top.length; b++) { ls.push(top[b].value); vs.push(top[b].count); }
                        box.appendChild(el('div', 'ec-sub', cats[a].name));
                        box.appendChild(bars(ls, vs)); wrap.appendChild(box);
                    }
                    r.appendChild(wrap);
                }
            });
        }
        if (sh.groupBars && sh.groupBars.length) {
            out.push({
                b: function (r) {
                    title(r, 'Rata-rata per Kelompok');
                    var wrap = el('div', 'ec-two'), n = Math.min(2, sh.groupBars.length);
                    for (var a = 0; a < n; a++) {
                        var g = sh.groupBars[a], box = el('div');
                        box.appendChild(el('div', 'ec-sub', g.num + ' per ' + g.cat));
                        box.appendChild(bars(g.labels.slice(0, 6), g.means.slice(0, 6))); wrap.appendChild(box);
                    }
                    r.appendChild(wrap);
                }
            });
        }
        if (sh.trends && sh.trends.length) {
            out.push({
                b: function (r) {
                    var t = sh.trends[0];
                    title(r, 'Tren Waktu', 'Rata-rata ' + t.num + ' per ' + t.gran);
                    r.appendChild(line(t.labels, t.values));
                }
            });
        }
        if (sh.stockAnalysis && sh.stockAnalysis.kpis) {
            out.push({
                b: function (r) {
                    var s = sh.stockAnalysis, k = s.kpis;
                    title(r, 'Analisis Stok');
                    var c = el('div', 'ec-cards');
                    c.appendChild(card('Produk (SKU)', fmt(k.totalSKUs), 'ec-acc'));
                    c.appendChild(card('Total unit', fmt(k.totalStockVolume), 'ec-acc'));
                    c.appendChild(card('Kritis', fmt(k.criticalCount), k.criticalCount ? 'ec-bad' : 'ec-good'));
                    c.appendChild(card('Menipis', fmt(k.lowCount), k.lowCount ? 'ec-warn' : 'ec-good'));
                    r.appendChild(c);
                    var ls = [], vs = [];
                    for (var a = 0; a < s.statusDistribution.length; a++) { ls.push(s.statusDistribution[a].label); vs.push(s.statusDistribution[a].count); }
                    r.appendChild(bars(ls, vs));
                }
            });
        }
        if (sh.businessKpi && sh.businessKpi.insights && sh.businessKpi.insights.length) {
            out.push({ b: function (r) { title(r, 'KPI Bisnis'); r.appendChild(list(sh.businessKpi.insights, 0, 6)); } });
        }
        if (sh.decisionTreeAnalysis) {
            out.push({
                b: function (r) {
                    var d = sh.decisionTreeAnalysis;
                    title(r, 'Decision Tree C4.5');
                    var c = el('div', 'ec-cards');
                    c.appendChild(card('Akurasi', pct(d.accuracy), 'ec-good'));
                    if (d.baseline) { c.appendChild(card('Akurasi dasar', pct(d.baseline.noInformationRate), 'ec-warn')); }
                    c.appendChild(card('Aturan', fmt(d.rules ? d.rules.length : 0), 'ec-acc'));
                    r.appendChild(c);
                    r.appendChild(el('div', 'ec-sub', 'Atribut paling berpengaruh'));
                    var ls = [], vs = [], fi = (d.featureImportance || []).slice(0, 7);
                    for (var a = 0; a < fi.length; a++) { ls.push(fi[a].feature); vs.push(Math.round(fi[a].importance * 1000) / 10); }
                    r.appendChild(bars(ls, vs));
                }
            });
        }
        return out;
    }
    function buildSlides() {
        slides = [];
        if (!data || !data.sheets) { return; }
        for (var s = 0; s < data.sheets.length; s++) {
            var sh = data.sheets[s], l = sheetSlides(sh);
            for (var i = 0; i < l.length; i++) { l[i].sheet = sh.name; slides.push(l[i]); }
        }
    }

    /* ---------- lapisan presentasi ---------- */
    function $(sel) { return ov ? ov.querySelector(sel) : null; }
    function message(h, p) {
        var st = $('.ec-stage'); clear(st);
        var m = el('div', 'ec-msg'); m.appendChild(el('h1', '', h)); m.appendChild(el('p', '', p)); st.appendChild(m);
        $('.ec-pos').textContent = '';
    }
    function restartProgress() {
        var pg = $('.ec-prog');
        pg.style.animation = 'none';
        void pg.offsetWidth;
        pg.style.width = paused ? '100%' : '0';
        if (!paused) { pg.style.animation = 'ec-prog ' + secs + 's linear forwards'; }
    }
    function render() {
        if (!ov) { return; }
        if (!slides.length) { message('Menunggu data…', 'Belum ada hasil analisis. Tekan Reload di halaman ini.'); return; }
        if (idx >= slides.length) { idx = 0; }
        if (idx < 0) { idx = slides.length - 1; }
        var s = slides[idx], st = $('.ec-stage');
        clear(st); s.b(st);
        $('.ec-pos').textContent = s.sheet + ' · ' + (idx + 1) + ' / ' + slides.length + (paused ? ' · ⏸ jeda' : '');
        restartProgress();
    }
    function schedule() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!ov || paused || slides.length < 2) { return; }
        timer = setTimeout(function () { idx++; render(); schedule(); }, secs * 1000);
    }
    function go(d) { idx += d; render(); schedule(); }
    function togglePause() { paused = !paused; render(); schedule(); }
    function rebuild() { buildSlides(); render(); schedule(); }

    function onKey(e) {
        if (!ov) { return; }
        var k = e.key;
        if (k === 'Escape') { if (!solo) { closeOverlay(); e.stopPropagation(); } }
        else if (k === 'ArrowRight' || k === 'PageDown') { go(1); e.preventDefault(); }
        else if (k === 'ArrowLeft' || k === 'PageUp') { go(-1); e.preventDefault(); }
        else if (k === ' ' || k === 'Enter') { togglePause(); e.preventDefault(); }
    }
    function clock() {
        var c = $('.ec-clock'); if (!c) { return; }
        var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
        c.textContent = p(d.getHours()) + ':' + p(d.getMinutes());
    }
    var clockTimer = null;

    function openOverlay() {
        if (ov) { return; }
        ensureStyle();
        ov = el('div'); ov.id = 'ec-ov';
        ov.innerHTML =
            '<div class="ec-head"><div class="ec-brand">📺 EasyCast</div><div class="ec-file"></div>' +
            '<div class="ec-right"><span><span class="ec-dot"></span>siaran aktif</span><span class="ec-clock"></span>' +
            '<button type="button" data-a="pause" title="Jeda / lanjut">⏯</button>' +
            '<button type="button" data-a="full" title="Layar penuh">⛶ Layar Penuh</button>' +
            (solo ? '' :
                '<button type="button" data-a="tv" title="Sambungkan ke TV digital / layar lain lewat jaringan Wi-Fi yang sama">📡 Sambungkan TV</button>' +
                '<button type="button" data-a="win" title="Jendela terpisah untuk layar TV">🪟 Jendela TV</button>' +
                '<button type="button" class="ec-x" data-a="close" title="Tutup (Esc)">✕ Tutup</button>') +
            '</div></div>' +
            '<div class="ec-prog"></div><div class="ec-stage"></div>' +
            '<div class="ec-foot"><span class="ec-pos"></span><span>◀ ▶ ganti slide · Spasi/klik jeda · Esc tutup</span></div>';
        ov.onclick = function (e) {
            var a = e.target && e.target.getAttribute ? e.target.getAttribute('data-a') : null;
            if (a === 'close') { closeOverlay(); }
            else if (a === 'pause') { togglePause(); }
            else if (a === 'full') { post('easycastFullscreen'); }
            else if (a === 'win') { post('easycastNewWindow'); }
            else if (a === 'tv') { post('easycastConnect'); }
            else if ($('.ec-stage').contains(e.target)) { togglePause(); }
        };
        document.body.appendChild(ov);
        $('.ec-file').textContent = data && data.fileName ? data.fileName : '';
        paused = false; idx = 0;
        document.addEventListener('keydown', onKey, true);
        clock(); clockTimer = setInterval(clock, 20000);
        rebuild();
    }
    function closeOverlay() {
        if (!ov) { return; }
        if (timer) { clearTimeout(timer); timer = null; }
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        document.removeEventListener('keydown', onKey, true);
        ov.parentNode.removeChild(ov); ov = null;
    }

    /* ---------- sisipkan tombol & tab ke halaman ---------- */
    function findByText(sel, re) {
        var list = document.querySelectorAll(sel);
        for (var i = 0; i < list.length; i++) {
            if (list[i].id && list[i].id.indexOf('ec-') === 0) { continue; }
            if (re.test((list[i].textContent || '').trim())) { return list[i]; }
        }
        return null;
    }
    function inject() {
        if (!document.body || ov || solo) { return; }
        if (!document.getElementById('ec-btn')) {
            var ref = findByText('button,a', /Export\s*Flow/i) || findByText('button,a', /Export\s*Jurnal/i) || findByText('button,a', /Export\s*to\s*DOCX/i);
            if (ref && ref.parentNode) {
                var b = document.createElement('button');
                b.id = 'ec-btn'; b.type = 'button'; b.className = ref.className; b.title = 'Tampilkan hasil analisis sebagai presentasi layar penuh (untuk TV)';
                var iconUrl = document.body.getAttribute('data-ec-icon');
                if (iconUrl) {
                    var img = document.createElement('img');
                    img.src = iconUrl; img.alt = ''; img.style.cssText = 'width:16px;height:16px;vertical-align:-3px;margin-right:6px';
                    b.appendChild(img);
                }
                b.appendChild(document.createTextNode('EasyCast'));
                b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); openOverlay(); };
                ref.parentNode.insertBefore(b, ref.nextSibling);
            }
        }
        if (!document.getElementById('ec-tab')) {
            var tsel = 'button,a,[role="tab"],.tab,.nav-item';
            var anchor = findByText(tsel, /^Summary$/i) || findByText(tsel, /^Charts$/i);
            if (anchor && anchor.parentNode) {
                var t = anchor.cloneNode(false);        // tanpa anak & tanpa event listener bawaan
                var attrs = t.attributes;
                for (var i = attrs.length - 1; i >= 0; i--) {
                    var n = attrs[i].name;
                    if (n.indexOf('data-') === 0 || n === 'href' || n === 'id' || n === 'onclick') { t.removeAttribute(n); }
                }
                t.id = 'ec-tab';
                t.className = (t.className || '').replace(/\bactive\b|\bselected\b/g, '').trim();
                t.textContent = '📺 EasyCast';
                t.onclick = function (e) { e.preventDefault(); e.stopPropagation(); openOverlay(); };
                anchor.parentNode.insertBefore(t, anchor.nextSibling);
            }
        }
    }
    var pending = null;
    function scheduleInject() {
        if (pending) { return; }
        pending = setTimeout(function () { pending = null; inject(); }, 150);
    }

    /* ---------- pesan dari extension ---------- */
    window.addEventListener('message', function (ev) {
        var m = ev.data;
        if (!m) { return; }
        if (m.type === 'data') {
            data = m.payload; rev++;
            if (ov) { $('.ec-file').textContent = data && data.fileName ? data.fileName : ''; rebuild(); }
            else if (solo) { openOverlay(); }
            scheduleInject();
        } else if (m.type === 'easycastOpen') {
            openOverlay();
        } else if (m.type === 'easycastClose') {
            if (!solo) { closeOverlay(); }
        } else if (m.type === 'easycastToggle') {
            if (ov) { if (!solo) { closeOverlay(); } } else { openOverlay(); }
        }
    });
    var secsAttr = parseInt(document.body && document.body.getAttribute('data-ec-seconds'), 10);
    if (secsAttr >= 5 && secsAttr <= 60) { secs = secsAttr; }

    if (window.MutationObserver) {
        new MutationObserver(scheduleInject).observe(document.documentElement, { childList: true, subtree: true });
    }
    scheduleInject();

    // Beri tahu ekstensi bahwa skrip versi ini (dengan perintah buka/tutup/toggle) sudah termuat.
    post('easycastReady');

    /* ---------- mode TV lewat jaringan lokal: ambil data dari server ekstensi ---------- */
    var feed = document.body && document.body.getAttribute('data-ec-feed');   // mis. "?t=TOKEN"
    if (solo && feed !== null && feed !== undefined && !api) {
        var pull = function () {
            fetch('/data.json' + feed, { cache: 'no-store' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (p) { if (p) { window.postMessage({ type: 'data', payload: p }, '*'); } })
                .catch(function () { /* coba lagi lewat SSE/polling */ });
        };
        pull();
        if (window.EventSource) {
            var es = new EventSource('/events' + feed);
            es.onmessage = pull;      // server kirim sinyal tiap analisis diperbarui
        } else {
            setInterval(pull, 5000);
        }
    } else if (solo) {
        openOverlay();
    }
})();