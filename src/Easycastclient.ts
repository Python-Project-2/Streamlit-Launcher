export const EASYCAST_CLIENT: string = String.raw`(function () {
    'use strict';

    var api = null;
    try { api = acquireVsCodeApi(); } catch (e) { api = null; }

    var B = document.body;
    var STATIC = !!window.__EC_DATA__;
    var solo = STATIC || !!(B && B.getAttribute('data-ec-solo'));

    var data = null;          // WorkbookResult
    var ov = null, refs = null;
    var si = 0;               // indeks sheet aktif
    var sections = [];
    var secIdx = 0;
    var present = false, paused = false, secs = 12;
    var timer = null, clockTimer = null, injectTimer = null;
    var theme = 'dark';

    var PAL = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
    var TYPE_LABEL = { number: 'Desimal', integer: 'Bilangan bulat', id: 'ID', date: 'Tanggal', boolean: 'Boolean', category: 'Kategori', text: 'Teks' };
    var STL = { good: 'Sehat', warn: 'Waspada', bad: 'Risiko', info: 'Info' };

    /* ---------- dasar ---------- */

    function post(type) {
        if (api) { api.postMessage({ type: type }); return; }
        if (type === 'easycastFullscreen') {
            var d = document.documentElement;
            if (document.fullscreenElement) { document.exitFullscreen(); }
            else if (d.requestFullscreen) { d.requestFullscreen(); }
        }
    }
    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) { e.className = cls; }
        if (html !== undefined && html !== null) { e.innerHTML = html; }
        return e;
    }
    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function num(v) { return typeof v === 'number' && isFinite(v); }
    function fmt(n) {
        if (!num(n)) { return n === undefined || n === null ? '-' : String(n); }
        var a = Math.abs(n);
        if (a >= 1e9) { return (n / 1e9).toFixed(2) + ' M'; }
        if (a >= 1e6) { return (n / 1e6).toFixed(2) + ' jt'; }
        if (a >= 1000) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
        return String(Math.round(n * 100) / 100);
    }
    function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
    function pct(x) { return num(x) ? (x * 100).toFixed(1) + '%' : '-'; }
    function pc(x) { return num(x) ? fmt(x) + '%' : '-'; }
    function col(i) { return PAL[i % PAL.length]; }
    function each(a, f) { for (var i = 0; i < (a || []).length; i++) { f(a[i], i); } }
    function map(a, f) { var o = []; each(a, function (x, i) { o.push(f(x, i)); }); return o; }
    function sum(a) { var s = 0; each(a, function (v) { if (num(v)) { s += v; } }); return s; }

    function getJSON(url, ok) {
        if (window.fetch) {
            fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
                .then(function (p) { if (p) { ok(p); } }).catch(function () {});
            return;
        }
        try {
            var x = new XMLHttpRequest();
            x.open('GET', url, true);
            x.onreadystatechange = function () {
                if (x.readyState === 4 && x.status === 200) { try { ok(JSON.parse(x.responseText)); } catch (e2) {} }
            };
            x.send(null);
        } catch (e) {}
    }

    /* ---------- gaya (di-scope ke #ec-ov) ---------- */

    var CSS = [
        '#ec-ov{--bg:#0e1116;--panel:#161c27;--panel2:#1d2432;--line:#2a3345;--text:#e7eaf0;--muted:#96a0b5;--accent:#5b8def;--good:#5cb47e;--warn:#d2a04e;--bad:#d47070;',
        'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:var(--bg);color:var(--text);',
        'font:clamp(13px,1.02vw,26px)/1.5 "Segoe UI",system-ui,Roboto,Arial,sans-serif;box-sizing:border-box}',
        '#ec-ov.light{--bg:#f3f5f9;--panel:#ffffff;--panel2:#eef1f6;--line:#d7dde8;--text:#1a2233;--muted:#5d6980;--accent:#2f6fe4;--good:#2e8b57;--warn:#b7791f;--bad:#c44545}',
        '#ec-ov.static{position:relative;inset:auto;min-height:100vh;overflow:visible}',
        '#ec-ov *{box-sizing:border-box}',
        '#ec-ov h2,#ec-ov h3,#ec-ov h4{border:0;padding:0;margin:0;color:var(--text)}',

        '#ec-ov .ecx-top{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--line);padding:.6em 1.4em .5em}',
        '#ec-ov .ecx-row{display:flex;align-items:center;gap:.8em;flex-wrap:wrap}',
        '#ec-ov .brand{font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);white-space:nowrap}',
        '#ec-ov .file{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:34em}',
        '#ec-ov .spacer{flex:1}',
        '#ec-ov .clock{color:var(--muted);font-variant-numeric:tabular-nums}',
        '#ec-ov button,#ec-ov select{font:inherit;font-size:.92em;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:.5em;padding:.3em .75em;cursor:pointer;margin:0;width:auto;height:auto}',
        '#ec-ov button:hover{background:var(--panel2)}',
        '#ec-ov button.on{background:var(--accent);border-color:var(--accent);color:#fff}',
        '#ec-ov button.quiet{background:transparent;border-color:transparent;color:var(--muted)}',
        '#ec-ov .ecx-chips{display:flex;gap:.45em;flex-wrap:wrap;margin-top:.45em}',
        '#ec-ov .chip{font-size:.8em;padding:.1em .7em;border-radius:99px;background:var(--panel2);border:1px solid var(--line);color:var(--muted)}',
        '#ec-ov .chip b{color:var(--text);font-weight:600}',
        '#ec-ov .ecx-nav{display:flex;gap:.3em;overflow-x:auto;margin-top:.5em;padding-bottom:.1em}',
        '#ec-ov .ecx-nav a{white-space:nowrap;color:var(--muted);text-decoration:none;padding:.2em .75em;border-radius:99px;font-size:.9em;cursor:pointer}',
        '#ec-ov .ecx-nav a:hover,#ec-ov .ecx-nav a.cur{background:var(--panel2);color:var(--text)}',
        '#ec-ov .prog{height:3px;margin-top:.5em;background:var(--panel2);border-radius:2px;overflow:hidden;display:none}',
        '#ec-ov.present .prog{display:block}',
        '#ec-ov .prog i{display:block;height:100%;background:var(--accent);transform:scaleX(0);transform-origin:0 50%}',
        '@keyframes ec-prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
        '@media (prefers-reduced-motion:reduce){#ec-ov .prog i{animation:none!important}}',

        '#ec-ov .ecx-main{padding:1.2em 1.6em 3em;max-width:110em;margin:0 auto}',
        '#ec-ov .ecx-sec{margin-bottom:2.4em;scroll-margin-top:9em}',
        '#ec-ov .ecx-sec>h2{font-size:1.45em;font-weight:600;margin-bottom:.7em;padding-bottom:.4em;border-bottom:1px solid var(--line)}',
        '#ec-ov.present .ecx-sec{display:none;margin:0}',
        '#ec-ov.present .ecx-sec.cur{display:block}',
        '#ec-ov.present .ecx-nav{display:none}',
        '#ec-ov.present .ecx-main{font-size:1.12em}',
        '#ec-ov .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,27em),1fr));gap:1em;margin-top:1em}',
        '#ec-ov .ecx-card{background:var(--panel);border:1px solid var(--line);border-radius:.7em;padding:1em 1.1em;min-width:0}',
        '#ec-ov .ecx-card.wide{grid-column:1/-1}',
        '#ec-ov .ecx-card>h3{font-size:1em;font-weight:600;margin-bottom:.6em}',
        '#ec-ov .kp-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5em,1fr));gap:.8em}',
        '#ec-ov .kp{background:var(--panel);border:1px solid var(--line);border-radius:.7em;padding:.8em 1em}',
        '#ec-ov .kp b{display:block;font-size:1.7em;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.15}',
        '#ec-ov .kp span{display:block;color:var(--muted);font-size:.78em;text-transform:uppercase;letter-spacing:.05em;margin-top:.2em}',
        '#ec-ov .kp i.st{display:inline-block;font-style:normal;font-size:.72em;margin-top:.4em;padding:0 .6em;border-radius:99px;color:#fff;background:var(--muted)}',
        '#ec-ov .st.good{background:var(--good)}#ec-ov .st.warn{background:var(--warn)}#ec-ov .st.bad{background:var(--bad)}#ec-ov .st.info{background:var(--accent)}',
        '#ec-ov .good{color:var(--good)}#ec-ov .warn{color:var(--warn)}#ec-ov .bad{color:var(--bad)}#ec-ov .acc{color:var(--accent)}',
        '#ec-ov .kp.good b{color:var(--good)}#ec-ov .kp.warn b{color:var(--warn)}#ec-ov .kp.bad b{color:var(--bad)}#ec-ov .kp.acc b{color:var(--accent)}',
        '#ec-ov .mut{color:var(--muted);font-size:.88em}',
        '#ec-ov .pills{display:flex;flex-wrap:wrap;gap:.6em}',
        '#ec-ov .pill{background:var(--panel2);border:1px solid var(--line);border-radius:.6em;padding:.4em .9em;min-width:7em}',
        '#ec-ov .pill span{display:block;color:var(--muted);font-size:.78em}',
        '#ec-ov .pill strong{font-size:1.1em}',
        '#ec-ov ul.ins{list-style:none;margin:0;padding:0}',
        '#ec-ov ul.ins li{background:var(--panel2);border-left:3px solid var(--accent);border-radius:.4em;padding:.5em .8em;margin-bottom:.45em}',
        '#ec-ov .ecx-svg{width:100%;height:auto;display:block}',
        '#ec-ov .ecx-svg .g{stroke:var(--line);stroke-width:1}',
        '#ec-ov .ecx-svg .g0{stroke:var(--muted);stroke-width:1.2;opacity:.6}',
        '#ec-ov .ecx-svg .ax{fill:var(--muted);font-size:11px}',
        '#ec-ov .ecx-svg .lb{fill:var(--text);font-size:12px}',
        '#ec-ov .ecx-svg .vl{fill:var(--text);font-size:12px;font-weight:600}',
        '#ec-ov .dn{display:flex;gap:1em;align-items:center;flex-wrap:wrap}',
        '#ec-ov .dn svg{width:12em;height:12em;flex:none}',
        '#ec-ov .lg{display:flex;flex-direction:column;gap:.25em;font-size:.86em;min-width:0}',
        '#ec-ov .lg.row{flex-direction:row;flex-wrap:wrap;gap:.3em .9em;margin-top:.4em}',
        '#ec-ov .lg span{display:flex;align-items:center;gap:.45em}',
        '#ec-ov .lg i{width:.75em;height:.75em;border-radius:50%;flex:none;display:inline-block}',
        '#ec-ov .tw{overflow:auto;max-height:30em}',
        '#ec-ov table{border-collapse:collapse;width:100%;font-size:.9em}',
        '#ec-ov th{position:sticky;top:0;background:var(--panel);color:var(--muted);text-align:left;font-weight:600;padding:.4em .7em;border-bottom:2px solid var(--line);white-space:nowrap}',
        '#ec-ov td{padding:.35em .7em;border-bottom:1px solid var(--line);white-space:nowrap;max-width:24em;overflow:hidden;text-overflow:ellipsis}',
        '#ec-ov th.r,#ec-ov td.r{text-align:right;font-variant-numeric:tabular-nums}',
        '#ec-ov tr:hover td{background:var(--panel2)}',
        '#ec-ov th.sort{cursor:pointer}',
        '#ec-ov .badge{display:inline-block;font-size:.76em;font-weight:600;padding:0 .6em;border-radius:99px;color:#fff;background:var(--muted)}',
        '#ec-ov .tools{display:flex;gap:.5em;flex-wrap:wrap;align-items:center;margin-bottom:.6em}',
        '#ec-ov input[type=search]{font:inherit;font-size:.9em;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:.5em;padding:.3em .7em;min-width:14em}',
        '#ec-ov .score{font-size:3em;font-weight:800;line-height:1.1}',
        '#ec-ov .bar{height:.5em;background:var(--panel2);border-radius:99px;overflow:hidden;margin-top:.8em}',
        '#ec-ov .bar i{display:block;height:100%;border-radius:99px}',
        '#ec-ov .act{border-left:4px solid var(--accent);background:var(--panel2);border-radius:.4em;padding:.6em .9em}',
        '#ec-ov .act.critical{border-color:var(--bad)}#ec-ov .act.warning{border-color:var(--warn)}#ec-ov .act.success{border-color:var(--good)}',
        '#ec-ov .hero{background:linear-gradient(135deg,rgba(91,141,239,.18),rgba(91,141,239,.04));border:1px solid var(--line);border-radius:.8em;padding:1.1em 1.4em}',
        '#ec-ov .hero h3{font-size:1.5em}',
        '#ec-ov .treehost{overflow:auto;max-height:42em;border:1px solid var(--line);border-radius:.6em;padding:.6em;background:var(--bg)}',
        '#ec-ov .tn rect{fill:var(--panel);stroke:var(--line);stroke-width:1.3;cursor:pointer}',
        '#ec-ov .tn.split rect{stroke:#4e79a7}#ec-ov .tn.leaf rect{stroke:#59a14f;fill:rgba(89,161,79,.14)}',
        '#ec-ov .tn text{text-anchor:middle;fill:var(--text);font-size:11px}',
        '#ec-ov .tn text.s{fill:var(--muted);font-size:10px}',
        '#ec-ov .te{fill:none;stroke:var(--muted);stroke-width:1.3;opacity:.6}',
        '#ec-ov .tl{fill:var(--muted);font-size:10px;text-anchor:middle}',
        '#ec-ov .cm td{text-align:center}',
        '#ec-ov details{margin-top:.6em}',
        '#ec-ov pre{margin:0;white-space:pre-wrap;font-size:.82em;color:var(--muted)}',
        '#ec-ov .msg{padding:4em 1em;text-align:center}',
        '#ec-ov .msg h1{font-size:2.4em;margin:0 0 .3em;font-weight:600}',
        '#ec-ov .msg p{color:var(--muted);margin:0}',
        '@media (max-width:700px){#ec-ov .ecx-main{padding:1em .8em 2em}#ec-ov .ecx-top{padding:.5em .8em}}',
        '@media print{#ec-ov{position:static!important;overflow:visible!important;background:#fff;color:#111}',
        '#ec-ov .ecx-top{position:static}#ec-ov .ecx-row button,#ec-ov .ecx-row select,#ec-ov .ecx-nav,#ec-ov .prog,#ec-ov .tools{display:none!important}',
        '#ec-ov.present .ecx-sec{display:block!important}#ec-ov .ecx-sec{break-inside:avoid-page}#ec-ov .tw,#ec-ov .treehost{max-height:none;overflow:visible}}'
    ].join('\n');

    function ensureStyle() {
        if (document.getElementById('ec-style')) { return; }
        var s = document.createElement('style');
        s.id = 'ec-style';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* ---------- grafik SVG ---------- */

    function svg(w, h, inner, cls) {
        return '<svg class="ecx-svg ' + (cls || '') + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" role="img">' + inner + '</svg>';
    }
    function legend(items, row) {
        return '<div class="lg' + (row ? ' row' : '') + '">' + map(items, function (it) {
            return '<span><i style="background:' + it.color + '"></i>' + esc(cut(it.name, 26)) + (it.note ? ' <b>' + esc(it.note) + '</b>' : '') + '</span>';
        }).join('') + '</div>';
    }
    function ticks(mn, mx, n) {
        var span = mx - mn;
        if (span <= 0) { span = Math.abs(mx) || 1; }
        var step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10));
        var err = span / n / step;
        if (err >= 7.5) { step *= 10; } else if (err >= 3.5) { step *= 5; } else if (err >= 1.5) { step *= 2; }
        var lo = Math.floor(mn / step) * step, hi = Math.ceil(mx / step) * step, t = [];
        for (var v = lo; v <= hi + step / 2; v += step) { t.push(Math.round(v * 1e6) / 1e6); }
        return t;
    }
    function empty(msg) { return '<div class="mut">' + esc(msg || 'Tidak ada data.') + '</div>'; }

    function barH(labels, values, o) {
        o = o || {};
        var n = labels.length;
        if (!n) { return empty(); }
        var W = 680, L = 190, R = 90, rh = 26, H = n * rh + 8, mx = 0, i;
        for (i = 0; i < n; i++) { if (num(values[i]) && values[i] > mx) { mx = values[i]; } }
        if (!mx) { mx = 1; }
        var s = '';
        for (i = 0; i < n; i++) {
            var v = num(values[i]) ? values[i] : 0, y = 4 + i * rh, w = Math.max(2, v / mx * (W - L - R));
            var c = o.colors ? o.colors[i] : (o.multi ? col(i) : (o.color || col(0)));
            s += '<text class="lb" x="' + (L - 8) + '" y="' + (y + 16) + '" text-anchor="end">' + esc(cut(labels[i], 28)) + '</text>' +
                '<rect x="' + L + '" y="' + (y + 3) + '" width="' + w.toFixed(1) + '" height="' + (rh - 9) + '" rx="3" fill="' + c + '"><title>' + esc(labels[i]) + ': ' + fmt(v) + '</title></rect>' +
                '<text class="vl" x="' + (L + w + 6).toFixed(1) + '" y="' + (y + 16) + '">' + fmt(v) + (o.suffix || '') + '</text>';
        }
        return svg(W, H, s);
    }

    function barV(labels, series, o) {
        o = o || {};
        var n = labels.length, k = series.length, i, j;
        if (!n || !k) { return empty(); }
        var W = 680, H = o.h || 280, L = 56, R = 12, T = 14;
        var Bt = o.noX ? 14 : (n > 8 ? 74 : 44);
        var mn = 0, mx = 0;
        for (i = 0; i < n; i++) {
            if (o.stacked) {
                var pos = 0, neg = 0;
                for (j = 0; j < k; j++) { var sv = series[j].data[i] || 0; if (sv >= 0) { pos += sv; } else { neg += sv; } }
                mx = Math.max(mx, pos); mn = Math.min(mn, neg);
            } else {
                for (j = 0; j < k; j++) { var dv = series[j].data[i]; if (num(dv)) { mx = Math.max(mx, dv); mn = Math.min(mn, dv); } }
            }
        }
        if (mx === mn) { mx = mn + 1; }
        var tk = ticks(mn, mx, 5);
        mn = Math.min(mn, tk[0]); mx = Math.max(mx, tk[tk.length - 1]);
        var pw = W - L - R, ph = H - T - Bt;
        function Y(v) { return T + ph - (v - mn) / (mx - mn) * ph; }
        var s = '';
        each(tk, function (t) {
            var y = Y(t);
            s += '<line class="g" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + fmt(t) + '</text>';
        });
        var gw = pw / n, bw = o.stacked ? gw * 0.62 : gw * 0.72 / k;
        for (i = 0; i < n; i++) {
            var gx = L + i * gw, acc = 0, accn = 0;
            for (j = 0; j < k; j++) {
                var v = series[j].data[i];
                if (!num(v)) { continue; }
                var c = series[j].colors ? series[j].colors[i] : (series[j].color || col(j));
                var x, y0, y1;
                if (o.stacked) {
                    x = gx + (gw - bw) / 2;
                    if (v >= 0) { y0 = Y(acc); acc += v; y1 = Y(acc); } else { y0 = Y(accn); accn += v; y1 = Y(accn); }
                } else {
                    x = gx + (gw - bw * k) / 2 + j * bw; y0 = Y(0); y1 = Y(v);
                }
                s += '<rect x="' + x.toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + Math.max(1, Math.abs(y1 - y0)).toFixed(1) + '" fill="' + c + '" rx="2"><title>' +
                    esc(labels[i]) + (k > 1 ? ' - ' + esc(series[j].name) : '') + ': ' + fmt(v) + '</title></rect>';
            }
            if (!o.noX) {
                var lx = gx + gw / 2, ly = H - Bt + 14, lab = esc(cut(labels[i], n > 8 ? 14 : 18));
                s += n > 8
                    ? '<text class="ax" transform="translate(' + lx.toFixed(1) + ',' + ly + ') rotate(-35)" text-anchor="end">' + lab + '</text>'
                    : '<text class="ax" x="' + lx.toFixed(1) + '" y="' + ly + '" text-anchor="middle">' + lab + '</text>';
            }
        }
        s += '<line class="g0" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '"/>';
        var lg = k > 1 ? legend(map(series, function (x, q) { return { name: x.name, color: x.color || col(q) }; }), true) : '';
        return svg(W, H, s) + lg;
    }

    function line(labels, series, o) {
        o = o || {};
        var n = labels.length;
        if (n < 2) { return empty('Butuh minimal 2 titik data.'); }
        var W = 680, H = o.h || 280, L = 56, R = 16, T = 14, Bt = 46, mn = Infinity, mx = -Infinity;
        each(series, function (se) { each(se.data, function (v) { if (num(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }); });
        if (!isFinite(mn)) { return empty(); }
        if (o.zero) { mn = Math.min(mn, 0); }
        if (mx === mn) { mx = mn + 1; }
        var tk = ticks(mn, mx, 5);
        mn = Math.min(mn, tk[0]); mx = Math.max(mx, tk[tk.length - 1]);
        var pw = W - L - R, ph = H - T - Bt;
        function X(i) { return L + i * pw / (n - 1); }
        function Y(v) { return T + ph - (v - mn) / (mx - mn) * ph; }
        var s = '';
        each(tk, function (t) {
            var y = Y(t);
            s += '<line class="g" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + fmt(t) + '</text>';
        });
        var step = Math.ceil(n / 8);
        for (var i = 0; i < n; i += step) {
            s += '<text class="ax" x="' + X(i).toFixed(1) + '" y="' + (H - Bt + 18) + '" text-anchor="middle">' + esc(cut(labels[i], 10)) + '</text>';
        }
        each(series, function (se, q) {
            var c = se.color || col(q), d = '', pts = '', first = -1, last = -1, drawing = false;
            each(se.data, function (v, i2) {
                if (!num(v)) { drawing = false; return; }
                d += (drawing ? 'L' : 'M') + X(i2).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
                drawing = true;
                if (first < 0) { first = i2; }
                last = i2;
                if (n <= 40) { pts += '<circle cx="' + X(i2).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3" fill="' + c + '"><title>' + esc(labels[i2]) + ': ' + fmt(v) + '</title></circle>'; }
            });
            if (o.area && q === 0 && first >= 0) {
                s += '<path d="' + d + 'L' + X(last).toFixed(1) + ' ' + (T + ph) + ' L' + X(first).toFixed(1) + ' ' + (T + ph) + ' Z" fill="' + c + '" opacity=".14"/>';
            }
            s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' + pts;
        });
        return svg(W, H, s) + (series.length > 1 ? legend(map(series, function (x, q) { return { name: x.name, color: x.color || col(q) }; }), true) : '');
    }

    function donut(labels, values, o) {
        o = o || {};
        var tot = sum(values);
        if (!tot) { return empty(); }
        var r = 62, C = 2 * Math.PI * r, acc = 0, segs = '', items = [];
        each(values, function (v, i) {
            if (!num(v) || v <= 0) { return; }
            var len = v / tot * C, c = o.colors ? o.colors[i] : col(i);
            segs += '<circle r="' + r + '" cx="90" cy="90" fill="none" stroke="' + c + '" stroke-width="26" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) +
                '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 90 90)"><title>' + esc(labels[i]) + ': ' + fmt(v) + '</title></circle>';
            acc += len;
            items.push({ name: labels[i], color: c, note: (v / tot * 100).toFixed(1) + '%' });
        });
        segs += '<text x="90" y="95" text-anchor="middle" style="fill:var(--text);font-size:15px;font-weight:700">' + fmt(o.center === undefined ? tot : o.center) + '</text>';
        return '<div class="dn">' + svg(180, 180, segs) + legend(items) + '</div>';
    }

    function scatter(points, xl, yl) {
        if (!points || !points.length) { return empty(); }
        var W = 680, H = 280, L = 56, R = 14, T = 12, Bt = 42, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        each(points, function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
        if (x1 === x0) { x1 = x0 + 1; }
        if (y1 === y0) { y1 = y0 + 1; }
        var pw = W - L - R, ph = H - T - Bt;
        var s = '';
        each(ticks(y0, y1, 4), function (t) {
            var y = T + ph - (t - y0) / (y1 - y0) * ph;
            if (y >= T - 1 && y <= T + ph + 1) { s += '<line class="g" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + fmt(t) + '</text>'; }
        });
        each(ticks(x0, x1, 5), function (t) {
            var x = L + (t - x0) / (x1 - x0) * pw;
            if (x >= L - 1 && x <= L + pw + 1) { s += '<text class="ax" x="' + x.toFixed(1) + '" y="' + (H - Bt + 16) + '" text-anchor="middle">' + fmt(t) + '</text>'; }
        });
        each(points, function (p) {
            s += '<circle cx="' + (L + (p[0] - x0) / (x1 - x0) * pw).toFixed(1) + '" cy="' + (T + ph - (p[1] - y0) / (y1 - y0) * ph).toFixed(1) + '" r="3" fill="' + col(0) + '" opacity=".55"/>';
        });
        s += '<text class="ax" x="' + (L + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(xl) + '</text>' +
            '<text class="ax" transform="translate(12,' + (T + ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(yl) + '</text>';
        return svg(W, H, s);
    }

    function tbl(head, rows, rightFrom) {
        var h = '<div class="tw"><table><thead><tr>' + map(head, function (x, i) { return '<th' + (rightFrom !== undefined && i >= rightFrom ? ' class="r"' : '') + '>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
        each(rows, function (r) {
            h += '<tr>' + map(r, function (c, i) { return '<td' + (rightFrom !== undefined && i >= rightFrom ? ' class="r"' : '') + '>' + c + '</td>'; }).join('') + '</tr>';
        });
        return h + '</tbody></table></div>';
    }
    function C(title, inner, cls) { return '<div class="ecx-card' + (cls ? ' ' + cls : '') + '">' + (title ? '<h3>' + esc(title) + '</h3>' : '') + inner + '</div>'; }
    function K(label, value, cls) { return '<div class="kp' + (cls ? ' ' + cls : '') + '"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>'; }
    function pill(l, v) { return '<div class="pill"><span>' + esc(l) + '</span><strong>' + esc(v) + '</strong></div>'; }
    function ulist(items) { return '<ul class="ins">' + map(items, function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'; }
    function badge(text, color) { return '<span class="badge" style="background:' + color + '">' + esc(text) + '</span>'; }
    function grid(inner) { return '<div class="grid">' + inner + '</div>'; }

    /* ---------- pohon keputusan (SVG) ---------- */

    function treeCount(tree) {
        var nodes = 0, leaves = 0, depth = 0;
        (function walk(n, d) {
            if (!n) { return; }
            nodes++; depth = Math.max(depth, d);
            var k = n.children || [];
            if (n.isLeaf || !k.length) { leaves++; return; }
            each(k, function (c) { walk(c, d + 1); });
        })(tree, 0);
        return { nodes: nodes, leaves: leaves, depth: depth };
    }

    function treeSvg(tree, folded, zoom) {
        var BW = 150, BH = 46, GX = 18, GY = 64, nodes = [], order = 0, maxD = 0;
        function walk(n, d, key, parent) {
            var kids = n.children || [], leaf = !!n.isLeaf || !kids.length;
            var nd = { n: n, d: d, key: key, leaf: leaf, kids: [], fold: !leaf && !!folded[key] };
            nodes.push(nd);
            if (d > maxD) { maxD = d; }
            if (parent) { parent.kids.push(nd); }
            if (!leaf && !nd.fold) { each(kids, function (c, i) { walk(c, d + 1, key + '/' + i, nd); }); }
            return nd;
        }
        var root = walk(tree, 0, '0', null);
        (function place(nd) {
            if (!nd.kids.length) { nd.o = order++; return; }
            each(nd.kids, place);
            nd.o = (nd.kids[0].o + nd.kids[nd.kids.length - 1].o) / 2;
        })(root);
        var W = Math.max(320, order * (BW + GX) + 20), H = (maxD + 1) * (BH + GY) - GY + 24;
        var edges = '', boxes = '';
        each(nodes, function (nd) {
            nd.x = nd.o * (BW + GX) + BW / 2 + 10;
            nd.y = nd.d * (BH + GY) + BH / 2 + 10;
        });
        each(nodes, function (nd) {
            each(nd.kids, function (c) {
                var y1 = nd.y + BH / 2, y2 = c.y - BH / 2, m = (y1 + y2) / 2;
                edges += '<path class="te" d="M ' + nd.x + ' ' + y1 + ' C ' + nd.x + ' ' + m + ', ' + c.x + ' ' + m + ', ' + c.x + ' ' + y2 + '"/>';
                if (c.n.value !== undefined && c.n.value !== null) {
                    edges += '<text class="tl" x="' + ((nd.x + c.x) / 2) + '" y="' + (m - 3) + '">' + esc(cut(c.n.value, 22)) + '</text>';
                }
            });
        });
        each(nodes, function (nd) {
            var n = nd.n, x = nd.x - BW / 2, y = nd.y - BH / 2;
            var title = nd.leaf ? (n.label === undefined ? '-' : n.label) : (n.attribute === undefined ? '-' : n.attribute);
            if (!nd.leaf && n.splitType === 'numeric' && n.threshold !== undefined) { title += ' <= ' + n.threshold; }
            var sub = [];
            if (!nd.leaf && num(n.entropy)) { sub.push('H=' + n.entropy.toFixed(2)); }
            if (n.samples !== undefined) { sub.push('n=' + fmt(n.samples)); }
            boxes += '<g class="tn ' + (nd.leaf ? 'leaf' : 'split') + '" data-key="' + nd.key + '"><title>' + esc(title + ' ' + sub.join(' ')) + '</title>' +
                '<rect x="' + x + '" y="' + y + '" width="' + BW + '" height="' + BH + '" rx="8"/>' +
                '<text x="' + nd.x + '" y="' + (y + 19) + '" style="font-weight:700">' + esc(cut(title, 24)) + '</text>' +
                '<text class="s" x="' + nd.x + '" y="' + (y + 35) + '">' + esc(sub.join(' | ') + (nd.fold ? ' [+]' : '')) + '</text></g>';
        });
        return '<svg class="tree" viewBox="0 0 ' + W + ' ' + H + '" width="' + Math.round(W * zoom) + '" height="' + Math.round(H * zoom) + '" role="img">' + edges + boxes + '</svg>';
    }

    /* ---------- bagian dasbor ---------- */

    function secSummary(sh) {
        var cols = sh.columns || [], H = sh.headers || [], types = {}, nNum = 0, nCat = 0, nDate = 0;
        each(cols, function (c) {
            if (c.num) { nNum++; }
            if (c.type === 'category') { nCat++; }
            if (c.type === 'date') { nDate++; }
            var t = TYPE_LABEL[c.type] || c.type;
            types[t] = (types[t] || 0) + 1;
        });
        var total = (sh.totalRows * H.length) || 1, q = sh.csvHealth ? sh.csvHealth.qualityScore : null;
        var k = '<div class="kp-row">' + K('Baris', fmt(sh.totalRows), 'acc') + K('Kolom', fmt(H.length), 'acc') + K('Numerik', fmt(nNum)) + K('Kategorikal', fmt(nCat)) + K('Tanggal', fmt(nDate)) +
            K('Sel kosong', (sh.missingCells / total * 100).toFixed(1) + '%', sh.missingCells ? 'warn' : 'good') +
            K('Duplikat', fmt(sh.duplicates), sh.duplicates ? 'warn' : 'good') +
            (q !== null && q !== undefined ? K('Skor kualitas', q + '%', q >= 90 ? 'good' : q >= 75 ? 'warn' : 'bad') : '') + '</div>';
        var tl = []; for (var t in types) { if (types.hasOwnProperty(t)) { tl.push(t); } }
        var miss = cols.filter(function (c) { return c.missing > 0; }).sort(function (a, b) { return b.missing - a.missing; }).slice(0, 12);
        var outl = cols.filter(function (c) { return c.num && c.num.outliers > 0; }).sort(function (a, b) { return b.num.outliers - a.num.outliers; }).slice(0, 12);
        var html = k + grid(
            C('Komposisi tipe kolom', donut(tl, map(tl, function (x) { return types[x]; }))) +
            C('Sel kosong per kolom (%)', miss.length ? barH(map(miss, function (c) { return c.name; }), map(miss, function (c) { return Math.round(c.missing / (sh.totalRows || 1) * 1000) / 10; }), { suffix: '%', color: col(2) }) : '<div class="good">Tidak ada sel kosong.</div>') +
            C('Outlier per kolom numerik', outl.length ? barH(map(outl, function (c) { return c.name; }), map(outl, function (c) { return c.num.outliers; }), { color: col(1) }) : '<div class="good">Tidak ada outlier signifikan.</div>')
        );
        return { id: 'summary', title: 'Ringkasan', icon: '\uD83D\uDCCB', html: html };
    }

    function kv(v, unit) { return v === null || v === undefined ? '-' : unit === 'pct' ? fmt(v) + '%' : fmt(v); }

    function secKpi(sh) {
        var k = sh.businessKpi;
        if (!k) { return null; }
        var det = k.detected || {}, g = k.growth || {};
        var revLabel = k.revenueSource === 'quantity*price' ? 'kuantitas x harga' : (det.revenue || '-');
        var cards = '<div class="kp-row">' + map(k.cards || [], function (c) {
            return '<div class="kp"><b>' + esc(kv(c.value, c.unit)) + '</b><span>' + esc(c.label) + '</span><i class="st ' + c.status + '" title="' + esc(c.note || '') + '">' + (STL[c.status] || c.status) + '</i></div>';
        }).join('') + '</div>';
        var ctx = '<div class="pills">' + pill('Baris dipakai', fmt(k.rowsUsed)) + pill('Baris dilewati', fmt(k.rowsSkipped)) + pill('Sumber pendapatan', revLabel) +
            (k.concentration ? pill('Pareto 80%', fmt(k.concentration.paretoItems) + ' ' + k.concentration.basis + ' (' + fmt(k.concentration.paretoPct) + '%)') + pill('HHI', fmt(k.concentration.hhi)) : '') +
            (num(g.latestGrowthPct) ? pill('Pertumbuhan terakhir', fmt(g.latestGrowthPct) + '%') : '') +
            (num(g.avgGrowthPct) ? pill('Rata-rata pertumbuhan', fmt(g.avgGrowthPct) + '%') : '') + '</div>';
        var parts = C('Indikator utama - sumber pendapatan: ' + revLabel, cards, 'wide') + C('Konteks perhitungan', ctx, 'wide');
        var pts = g.periods || [];
        if (pts.length > 1) {
            var labs = map(pts, function (p) { return p.period; });
            var hasProfit = pts.some(function (p) { return num(p.profit); });
            parts += C('Tren pendapatan per periode', line(labs, [{ name: 'Pendapatan', data: map(pts, function (p) { return p.revenue; }), color: col(0) }], { area: true }));
            if (hasProfit) { parts += C('Tren laba kotor per periode', line(labs, [{ name: 'Laba kotor', data: map(pts, function (p) { return p.profit; }), color: col(4) }], { area: true })); }
            var gp = pts.filter(function (p) { return num(p.growthPct); });
            if (gp.length) {
                parts += C('Pertumbuhan pendapatan antar periode (%)', barV(map(gp, function (p) { return p.period; }),
                    [{ name: 'Pertumbuhan', data: map(gp, function (p) { return p.growthPct; }), colors: map(gp, function (p) { return p.growthPct >= 0 ? col(4) : col(2); }) }]));
            }
        }
        var tp = k.topProducts || [];
        if (tp.length) {
            parts += C('Pangsa pendapatan produk teratas', donut(map(tp, function (x) { return x.label; }), map(tp, function (x) { return x.share; })));
            parts += C('Pendapatan produk teratas', barH(map(tp, function (x) { return x.label; }), map(tp, function (x) { return x.revenue; }), { multi: true }));
        }
        var cat = k.topCategories || [], reg = k.topRegions || [], cus = k.topCustomers || [];
        if (cat.length) { parts += C('Pangsa pendapatan per kategori', donut(map(cat, function (x) { return x.label; }), map(cat, function (x) { return x.share; }))); }
        if (reg.length) { parts += C('Pendapatan per wilayah', barH(map(reg, function (x) { return x.label; }), map(reg, function (x) { return x.revenue; }), { multi: true })); }
        if (cus.length) { parts += C('Pendapatan per pelanggan', barH(map(cus, function (x) { return x.label; }), map(cus, function (x) { return x.revenue; }), { multi: true })); }
        var rows = [['Pendapatan', det.revenue], ['Biaya (COGS)', det.cost], ['Laba', det.profit], ['Kuantitas', det.quantity], ['Harga', det.price], ['Diskon', det.discount],
            ['Tanggal', det.date], ['Order', det.order], ['Pelanggan', det.customer], ['Produk', det.product], ['Kategori', det.category], ['Wilayah', det.region]]
            .filter(function (r) { return r[1]; });
        if (rows.length) { parts += C('Kolom yang terdeteksi otomatis', tbl(['Peran', 'Kolom'], map(rows, function (r) { return [esc(r[0]), '<b>' + esc(r[1]) + '</b>']; })), 'wide'); }
        return { id: 'kpi', title: 'KPI Bisnis & Penjualan', icon: '\uD83D\uDCCA', html: grid(parts) };
    }

    var ST_COL = { critical: '#ef4444', low: '#f59e0b', healthy: '#10b981', overstock: '#3b82f6' };
    var ST_LBL = { critical: 'Kritis', low: 'Menipis', healthy: 'Aman', overstock: 'Overstock' };

    function secStock(sh) {
        var s = sh.stockAnalysis;
        if (!s || !s.items || !s.items.length) { return null; }
        var k = s.kpis;
        var kp = '<div class="kp-row">' + K('Total SKU', fmt(k.totalSKUs), 'acc') + K('Total volume', fmt(k.totalStockVolume)) + K('Valuasi aset', k.totalValuation ? fmt(k.totalValuation) : '-') +
            K('Rata-rata/SKU', fmt(k.averageStockPerItem)) + K('Kritis', fmt(k.criticalCount), k.criticalCount ? 'bad' : '') + K('Menipis', fmt(k.lowCount), k.lowCount ? 'warn' : '') +
            K('Aman', fmt(k.healthyCount), 'good') + K('Overstock', fmt(k.overstockCount), 'acc') + '</div>';
        var parts = C('Kolom terdeteksi', '<div class="mut">Item = <b>' + esc(s.itemCol) + '</b>, Qty = <b>' + esc(s.qtyCol) + '</b>' + (s.priceCol ? ', Harga = <b>' + esc(s.priceCol) + '</b>' : '') +
            (s.categoryCol ? ', Kategori = <b>' + esc(s.categoryCol) + '</b>' : '') + '</div>' + kp, 'wide');
        parts += C('Distribusi kesehatan stok', donut(map(s.statusDistribution, function (d) { return d.label; }), map(s.statusDistribution, function (d) { return d.count; }), { colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'] }));
        parts += C('Top 10 stok tertinggi', barH(map(s.topStock, function (d) { return d.label; }), map(s.topStock, function (d) { return d.value; }), { color: col(0) }));
        if (s.categoryValuation && s.categoryValuation.length) {
            parts += C('Nilai valuasi per kategori', barH(map(s.categoryValuation, function (d) { return d.label; }), map(s.categoryValuation, function (d) { return d.value; }), { multi: true }));
        }
        if (s.abcSummary) {
            var a = s.abcSummary;
            parts += C('Analisis ABC (% valuasi vs % SKU)', barV(['Kelas A', 'Kelas B', 'Kelas C'], [
                { name: '% nilai', data: [a.classA.valPct, a.classB.valPct, a.classC.valPct], color: '#3b82f6' },
                { name: '% SKU', data: [a.classA.pctCount, a.classB.pctCount, a.classC.pctCount], color: '#94a3b8' }]));
        }
        parts += C('Daftar inventaris', '<div class="tools" id="st-tools"></div><div id="st-table"></div><div class="tools"><span class="mut" id="st-count"></span><button id="st-more" type="button">Muat 50 lagi</button></div>', 'wide');
        return {
            id: 'stock', title: 'Stok Barang', icon: '\uD83D\uDCE6', html: grid(parts),
            after: function (root) {
                var filter = 'all', q = '', limit = 50;
                var tools = root.querySelector('#st-tools'), box = root.querySelector('#st-table'), cnt = root.querySelector('#st-count'), more = root.querySelector('#st-more');
                var defs = [['all', 'Semua'], ['critical', 'Kritis'], ['low', 'Menipis'], ['healthy', 'Aman'], ['overstock', 'Overstock'], ['A', 'Kelas A']];
                each(defs, function (d) {
                    var b = el('button', d[0] === 'all' ? 'on' : '', esc(d[1]));
                    b.type = 'button';
                    b.onclick = function () { filter = d[0]; limit = 50; each(tools.querySelectorAll('button'), function (x) { x.className = ''; }); b.className = 'on'; draw(); };
                    tools.appendChild(b);
                });
                var inp = el('input'); inp.type = 'search'; inp.placeholder = 'Cari barang / kategori';
                inp.oninput = function () { q = inp.value.toLowerCase().trim(); limit = 50; draw(); };
                tools.appendChild(inp);
                more.onclick = function () { limit += 50; draw(); };
                function draw() {
                    var items = s.items.filter(function (it) {
                        if (filter === 'A') { if (it.abcClass !== 'A') { return false; } }
                        else if (filter !== 'all' && it.status !== filter) { return false; }
                        return !q || String(it.name).toLowerCase().indexOf(q) >= 0 || String(it.category || '').toLowerCase().indexOf(q) >= 0;
                    });
                    cnt.textContent = 'Menampilkan ' + Math.min(limit, items.length) + ' dari ' + items.length + ' produk';
                    more.style.display = items.length > limit ? '' : 'none';
                    box.innerHTML = tbl(['#', 'Barang', 'Kategori', 'Stok', 'Harga', 'Valuasi', 'Status', 'Restock', 'Prioritas', 'ABC'],
                        map(items.slice(0, limit), function (it, i) {
                            return [i + 1, '<b>' + esc(it.name) + '</b>', esc(it.category || '-'), fmt(it.quantity), it.unitPrice ? fmt(it.unitPrice) : '-', it.totalValue ? fmt(it.totalValue) : '-',
                                badge(ST_LBL[it.status] || it.status, ST_COL[it.status] || '#888'), it.reorderRecommendation > 0 ? '+' + fmt(it.reorderRecommendation) : '0', esc(it.priority),
                                badge(it.abcClass, it.abcClass === 'A' ? '#4f46e5' : it.abcClass === 'B' ? '#0284c7' : '#64748b')];
                        }), 3) || '';
                    if (!items.length) { box.innerHTML = empty('Tidak ada data yang cocok.'); }
                }
                draw();
            }
        };
    }

    function secNeeds(sh) {
        var n = sh.needsAnalysis;
        if (!n || !sh.stockAnalysis) { return null; }
        var parts = '<div class="ecx-card wide hero"><div class="mut">Ringkasan kebutuhan pengadaan</div><h3>Estimasi anggaran: <span class="good">' + fmt(n.totalProcurementBudget) + '</span></h3>' +
            '<div class="mut">' + fmt(n.urgentItemCount) + ' item kritis dan ' + fmt(n.highPriorityCount) + ' item menipis perlu restock.</div></div>';
        parts += C('Rencana tindakan', '<div class="grid">' + map(n.actionPlan || [], function (a) {
            return '<div class="act ' + esc(a.type) + '"><b>' + esc(a.title) + '</b><div class="mut">' + esc(a.description) + '</div></div>';
        }).join('') + '</div>', 'wide');
        parts += C('Wawasan operasional', ulist(n.operationalInsights || []));
        parts += C('Risiko rantai pasok', (n.riskWarnings && n.riskWarnings.length) ? ulist(n.riskWarnings) : '<div class="good">Tidak terdeteksi risiko stok abnormal.</div>');
        if (n.procurementItems && n.procurementItems.length) {
            parts += C('Daftar kebutuhan pembelian', tbl(['#', 'Barang', 'Kategori', 'Stok', 'Qty order', 'Estimasi biaya', 'Prioritas'],
                map(n.procurementItems.slice(0, 40), function (it, i) {
                    return [i + 1, '<b>' + esc(it.name) + '</b>', esc(it.category || '-'), fmt(it.currentStock), '+' + fmt(it.recommendedQty), fmt(it.estimatedCost), badge(it.priority, it.priority === 'Urgent' ? '#ef4444' : '#f59e0b')];
                }), 3), 'wide');
        }
        return { id: 'needs', title: 'Analisis Kebutuhan', icon: '\uD83C\uDFAF', html: grid(parts) };
    }

    function secHealth(sh) {
        var h = sh.csvHealth;
        if (!h) { return null; }
        var c = h.qualityScore >= 90 ? 'var(--good)' : h.qualityScore >= 75 ? 'var(--warn)' : 'var(--bad)';
        var head = '<div style="display:flex;gap:1.5em;flex-wrap:wrap;align-items:center;justify-content:space-between"><div><div class="mut">Skor kesehatan data</div><div class="score" style="color:' + c + '">' + h.qualityScore +
            '<span style="font-size:.4em;font-weight:500">/100</span></div><div>' + esc(h.qualityRating) + '</div></div><div class="pills">' +
            pill('Kelengkapan', h.completenessScore + '%') + pill('Integritas', h.integrityScore + '%') + pill('Konsistensi', h.consistencyScore + '%') + '</div></div>' +
            '<div class="bar"><i style="width:' + h.qualityScore + '%;background:' + c + '"></i></div>';
        var parts = C('', head, 'wide');
        parts += C('Checklist audit CSV', tbl(['Kategori', 'Parameter', 'Keterangan', 'Status'], map(h.checklist || [], function (x) {
            return [esc(x.category), esc(x.item), esc(x.detail), x.status === 'pass' ? badge('Lolos', '#10b981') : x.status === 'warn' ? badge('Perhatian', '#f59e0b') : badge('Perlu perbaikan', '#ef4444')];
        })), 'wide');
        parts += C('Rekomendasi pembersihan', ulist(h.cleaningRecommendations || []), 'wide');
        return { id: 'health', title: 'Kualitas & Profil CSV', icon: '\uD83E\uDE7A', html: grid(parts) };
    }

    function secTree(sh) {
        var dt = sh.decisionTreeAnalysis;
        if (!dt || !dt.tree) { return null; }
        var shape = treeCount(dt.tree), perf = dt.performanceMetrics || {}, agg = dt.aggregateMetrics || {}, base = dt.baseline, cv = dt.crossValidation;
        var f1 = num(agg.macroF1) ? agg.macroF1 : perf.f1Score;
        var kp = '<div class="kp-row">' + K('Target', dt.targetAttribute || '-', 'acc') + K('Akurasi uji', pct(dt.accuracy), 'good') + K('F1', pct(f1)) +
            (num(agg.kappa) ? K('Kappa', agg.kappa.toFixed(3)) : '') + (cv ? K('Akurasi silang ' + cv.folds + 'x', pct(cv.meanAccuracy)) : '') +
            (base ? K('Akurasi dasar', pct(base.noInformationRate), 'warn') : '') + K('Simpul / daun', shape.nodes + ' / ' + shape.leaves) + K('Kedalaman', shape.depth) +
            K('Aturan', fmt((dt.rules || []).length)) + K('Latih / uji', fmt(dt.trainingSize) + ' / ' + fmt(dt.testSize)) + '</div>';
        var parts = C('', kp, 'wide');
        parts += C('Diagram pohon keputusan C4.5', '<div class="tools"><button type="button" id="tr-out">-</button><button type="button" id="tr-in">+</button><button type="button" id="tr-fit">Pas</button><button type="button" id="tr-open">Buka semua</button><span class="mut">Klik simpul untuk melipat/membuka cabang.</span></div><div class="treehost" id="tr-host"></div>', 'wide');
        var fi = (dt.featureImportance || []).filter(function (f) { return f && num(f.importance); }).sort(function (a, b) { return b.importance - a.importance; }).slice(0, 10);
        if (fi.length) { parts += C('Feature importance (%)', barH(map(fi, function (f) { return f.feature; }), map(fi, function (f) { return Math.round(f.importance * 10000) / 100; }), { multi: true, suffix: '%' })); }
        var pm = [['Precision', perf.precision], ['Recall', perf.recall], ['F1-score', perf.f1Score], ['Specificity', perf.specificity]].filter(function (x) { return num(x[1]); });
        if (pm.length) { parts += C('Metrik kinerja (%)', barV(map(pm, function (x) { return x[0]; }), [{ name: 'Skor', data: map(pm, function (x) { return Math.round(x[1] * 10000) / 100; }), colors: map(pm, function (x, i) { return col(i); }) }])); }
        var cd = dt.classDistribution || {}, cdk = []; for (var q in cd) { if (cd.hasOwnProperty(q)) { cdk.push(q); } }
        if (cdk.length) { parts += C('Distribusi kelas target "' + (dt.targetAttribute || '') + '"', cdk.length <= 8 ? donut(cdk, map(cdk, function (x) { return cd[x]; })) : barH(cdk, map(cdk, function (x) { return cd[x]; }), { multi: true })); }
        var sm = (dt.splitMetrics || []).filter(function (m) { return m && num(m.gainRatio); }).slice(0, 10);
        if (sm.length) {
            parts += C('Pemilihan atribut: gain ratio vs information gain', barV(map(sm, function (m) { return m.attribute; }), [
                { name: 'Information gain', data: map(sm, function (m) { return Math.round(m.informationGain * 10000) / 10000; }), color: col(0) },
                { name: 'Gain ratio', data: map(sm, function (m) { return Math.round(m.gainRatio * 10000) / 10000; }), color: col(2) }]));
        }
        var cm = dt.confusionMatrix || [];
        if (cm.length) {
            var labels = (dt.confusionLabels && dt.confusionLabels.length) ? dt.confusionLabels : cdk.slice().sort();
            var rt = map(cm, function (r) { return sum(r); }), mx = 1;
            each(cm, function (r) { each(r, function (v) { if (v > mx) { mx = v; } }); });
            var th = '<tr><th>Aktual \\ Prediksi</th>' + map(cm, function (r, j) { return '<th class="r">' + esc(cut(labels[j] || 'Kelas ' + (j + 1), 16)) + '</th>'; }).join('') + '<th class="r">Total</th></tr>';
            var tb = map(cm, function (r, i) {
                return '<tr><td><b>' + esc(cut(labels[i] || 'Kelas ' + (i + 1), 16)) + '</b></td>' + map(r, function (v, j) {
                    var t = v / mx, bg = v === 0 ? 'transparent' : (i === j ? 'rgba(16,185,129,' : 'rgba(239,68,68,') + (0.15 + 0.6 * t).toFixed(2) + ')';
                    return '<td class="r cm" style="background:' + bg + '">' + fmt(v) + '</td>';
                }).join('') + '<td class="r"><b>' + fmt(rt[i]) + '</b></td></tr>';
            }).join('');
            parts += C('Confusion matrix (uji: ' + fmt(dt.testSize) + ' baris)', '<div class="tw"><table><thead>' + th + '</thead><tbody>' + tb + '</tbody></table></div>');
        }
        var pcm = (dt.perClassMetrics || []).filter(function (c) { return c && num(c.f1); });
        if (pcm.length) {
            parts += C('Metrik per kelas', tbl(['Kelas', 'Support', 'Precision', 'Recall', 'F1'], map(pcm.slice(0, 14), function (c) {
                return ['<b>' + esc(cut(c.label, 22)) + '</b>', fmt(c.support), pct(c.precision), pct(c.recall), '<b>' + pct(c.f1) + '</b>'];
            }), 1), 'wide');
        }
        if (cv && cv.foldDetails && cv.foldDetails.length) {
            parts += C('Validasi silang ' + cv.folds + '-lipatan', line(map(cv.foldDetails, function (f) { return 'L' + f.fold; }), [{ name: 'Akurasi (%)', data: map(cv.foldDetails, function (f) { return Math.round(f.accuracy * 10000) / 100; }), color: col(0) }], { zero: true }));
        }
        var rules = (dt.ruleDetails && dt.ruleDetails.length) ? dt.ruleDetails : map(dt.rules || [], function (raw) {
            var m = /^IF\s+(.*?)\s+THEN\s+Class\s*=\s*(.*?)\s*\((\d+)\s+samples?\)\s*$/.exec(String(raw));
            return m ? { condition: m[1], prediction: m[2], samples: Number(m[3]) } : { condition: String(raw), prediction: '-', samples: null };
        });
        if (rules.length) {
            parts += C('Aturan keputusan (' + fmt(rules.length) + ')', '<div class="tools"><input type="search" id="rl-q" placeholder="Cari aturan..."><span class="mut" id="rl-n"></span></div><div id="rl-t"></div>', 'wide');
        }
        if (dt.detailedCalculations && dt.detailedCalculations.length) {
            parts += '<div class="ecx-card wide"><details><summary><b>Langkah perhitungan rinci (' + dt.detailedCalculations.length + ')</b></summary>' +
                tbl(['#', 'Tahap', 'Rumus', 'Hasil'], map(dt.detailedCalculations, function (x) {
                    return [fmt(x.step), esc(cut(x.description || '', 60)), '<code>' + esc(x.formula || '') + '</code>', esc(cut(x.result === undefined ? '' : x.result, 80))];
                })) + '</details></div>';
        }
        return {
            id: 'tree', title: 'Decision Tree C4.5', icon: '\uD83C\uDF33', html: grid(parts),
            after: function (root) {
                var host = root.querySelector('#tr-host'), folded = {}, zoom = 1;
                function drawTree() { host.innerHTML = treeSvg(dt.tree, folded, zoom); }
                host.onclick = function (e) {
                    var t = e.target, g = null;
                    while (t && t !== host) { if (t.getAttribute && t.getAttribute('class') && String(t.getAttribute('class')).indexOf('tn') >= 0) { g = t; break; } t = t.parentNode; }
                    if (g) { var k = g.getAttribute('data-key'); if (folded[k]) { delete folded[k]; } else { folded[k] = true; } drawTree(); }
                };
                root.querySelector('#tr-in').onclick = function () { zoom = Math.min(2.5, zoom + 0.15); drawTree(); };
                root.querySelector('#tr-out').onclick = function () { zoom = Math.max(0.3, zoom - 0.15); drawTree(); };
                root.querySelector('#tr-open').onclick = function () { folded = {}; drawTree(); };
                root.querySelector('#tr-fit').onclick = function () {
                    var s0 = host.querySelector('svg'); if (!s0) { return; }
                    var vb = s0.getAttribute('viewBox').split(' '); zoom = Math.max(0.3, Math.min(1.6, (host.clientWidth - 20) / Number(vb[2]))); drawTree();
                };
                drawTree();
                var rq = root.querySelector('#rl-q');
                if (rq) {
                    var rt = root.querySelector('#rl-t'), rn = root.querySelector('#rl-n');
                    var drawR = function () {
                        var q2 = rq.value.toLowerCase().trim();
                        var m = rules.filter(function (r) { return !q2 || (r.condition + ' ' + r.prediction).toLowerCase().indexOf(q2) >= 0; });
                        rn.textContent = m.length + ' cocok, menampilkan ' + Math.min(30, m.length);
                        rt.innerHTML = tbl(['#', 'Kondisi (IF)', 'Kelas (THEN)', 'Sampel', 'Kemurnian'], map(m.slice(0, 30), function (r, i) {
                            return [i + 1, esc(r.condition), '<b>' + esc(r.prediction) + '</b>', r.samples === null || r.samples === undefined ? '-' : fmt(r.samples), num(r.confidence) ? pct(r.confidence) : '-'];
                        }), 3);
                    };
                    rq.oninput = drawR; drawR();
                }
            }
        };
    }

    function secInsights(sh) {
        if (!sh.insights || !sh.insights.length) { return null; }
        return { id: 'insights', title: 'Insight Otomatis', icon: '\uD83D\uDCA1', html: C('', ulist(sh.insights)) };
    }

    function secCharts(sh) {
        var parts = '', cols = sh.columns || [];
        each(sh.groupBars || [], function (g, i) {
            parts += C('Rata-rata ' + g.num + ' per ' + g.cat, g.labels.length > 6 ? barH(g.labels, g.means, { multi: true }) : barV(g.labels, [{ name: g.num, data: g.means, colors: map(g.labels, function (x, k) { return col(k + i); }) }]));
        });
        each(sh.trends || [], function (t, i) {
            parts += C('Tren ' + t.num + ' per ' + (t.gran === 'year' ? 'tahun' : t.gran === 'month' ? 'bulan' : 'hari'), line(t.labels, [{ name: t.num, data: t.values, color: col(i) }], { area: true }));
        });
        if (sh.crosstab) {
            var x = sh.crosstab;
            parts += C(x.a + ' x ' + x.b + ' (bertumpuk)', barV(x.labels, map(x.series, function (s, i) { return { name: s.name, data: s.data, color: col(i) }; }), { stacked: true }));
            parts += C(x.a + ' x ' + x.b + ' (berkelompok)', barV(x.labels, map(x.series, function (s, i) { return { name: s.name, data: s.data, color: col(i) }; })));
        }
        each(cols.filter(function (c) { return c.top && (c.type === 'category' || c.type === 'boolean'); }).slice(0, 4), function (c) {
            var t = c.top.slice(0, 8);
            parts += C('Distribusi ' + c.name, donut(map(t, function (v) { return v.value; }), map(t, function (v) { return v.count; })));
        });
        each(cols.filter(function (c) { return c.series && c.series.labels.length > 1; }).slice(0, 2), function (c, i) {
            parts += C('Jumlah record per periode: ' + c.name, line(c.series.labels, [{ name: c.name, data: c.series.counts, color: col(i + 4) }], { area: true }));
        });
        each(sh.scatters || [], function (s) { parts += C(s.x + ' vs ' + s.y + ' (r = ' + s.r + ')', scatter(s.points, s.x, s.y)); });
        if (!parts) { return null; }
        return { id: 'charts', title: 'Visualisasi', icon: '\uD83D\uDCC8', html: grid(parts) };
    }

    function secColumns(sh) {
        var cols = sh.columns || [];
        if (!cols.length) { return null; }
        var parts = '';
        each(cols.slice(0, 60), function (c, idx) {
            var inner = '<div class="mut">' + fmt(c.count) + ' terisi - ' + fmt(c.missing) + ' kosong - ' + fmt(c.unique) + ' unik</div>';
            if (c.num) {
                var n = c.num;
                inner += tbl(['Min', 'Q1', 'Median', 'Mean', 'Q3', 'Max', 'Std', 'Outlier'], [[fmt(n.min), fmt(n.q1), fmt(n.median), fmt(n.mean), fmt(n.q3), fmt(n.max), fmt(n.std), fmt(n.outliers)]], 0);
                if (n.hist) { inner += barV(n.hist.labels, [{ name: c.name, data: n.hist.counts, color: col(idx) }], { noX: true, h: 140 }); }
            } else if (c.top) {
                inner += barH(map(c.top.slice(0, 8), function (t) { return t.value; }), map(c.top.slice(0, 8), function (t) { return t.count; }), { color: col(idx) });
            } else if (c.series) {
                inner += '<div class="mut">' + esc(c.dateMin) + ' sampai ' + esc(c.dateMax) + '</div>' + line(c.series.labels, [{ name: c.name, data: c.series.counts, color: col(idx) }], { area: true, h: 180 });
            } else if (c.type === 'text') {
                inner += '<div class="mut">Teks bebas, panjang ' + c.minLen + '-' + c.maxLen + ' karakter.</div>';
            } else if (c.type === 'id') {
                inner += '<div class="mut">Kolom identitas, tidak dihitung sebagai numerik.</div>';
            }
            parts += '<div class="ecx-card"><h3>' + esc(cut(c.name, 30)) + ' ' + badge(TYPE_LABEL[c.type] || c.type, col(idx)) + '</h3>' + inner + '</div>';
        });
        return { id: 'columns', title: 'Detail Kolom', icon: '\uD83D\uDDC2\uFE0F', html: grid(parts) };
    }

    function secCorr(sh) {
        var c = sh.corr;
        if (!c || !c.cols || c.cols.length < 2) { return null; }
        var h = '<div class="tw"><table class="cm"><thead><tr><th></th>' + map(c.cols, function (x) { return '<th class="r">' + esc(cut(x, 12)) + '</th>'; }).join('') + '</tr></thead><tbody>';
        each(c.matrix, function (row, i) {
            h += '<tr><td><b>' + esc(cut(c.cols[i], 16)) + '</b></td>' + map(row, function (r) {
                if (r === null) { return '<td class="r">-</td>'; }
                var bg = r >= 0 ? 'rgba(78,121,167,' + Math.abs(r) + ')' : 'rgba(225,87,89,' + Math.abs(r) + ')';
                return '<td class="r" style="background:' + bg + ';color:' + (Math.abs(r) > 0.5 ? '#fff' : 'inherit') + '">' + r.toFixed(2) + '</td>';
            }).join('') + '</tr>';
        });
        return { id: 'corr', title: 'Korelasi (Pearson)', icon: '\uD83D\uDD17', html: C('', h + '</tbody></table></div><div class="mut">Biru = positif, merah = negatif.</div>') };
    }

    function secTable(sh) {
        if (!sh.rows || !sh.rows.length) { return null; }
        return {
            id: 'table', title: 'Tabel Data', icon: '\uD83D\uDCC4',
            html: C('', '<div class="tools"><input type="search" id="dt-q" placeholder="Cari di tabel..."><span class="mut" id="dt-n"></span><button type="button" id="dt-more">Muat 100 lagi</button></div><div id="dt-t"></div>', 'wide'),
            after: function (root) {
                var q = '', limit = 100, sortCol = -1, asc = true;
                var inp = root.querySelector('#dt-q'), box = root.querySelector('#dt-t'), cnt = root.querySelector('#dt-n'), more = root.querySelector('#dt-more');
                var numeric = map(sh.columns || [], function (c) { return c.type === 'number' || c.type === 'integer'; });
                function draw() {
                    var rows = sh.rows;
                    if (q) { rows = rows.filter(function (r) { return r.some(function (v) { return v !== null && String(v).toLowerCase().indexOf(q) >= 0; }); }); }
                    if (sortCol >= 0) {
                        rows = rows.slice().sort(function (a, b) {
                            var x = a[sortCol], y = b[sortCol];
                            if (x === y) { return 0; } if (x === null) { return 1; } if (y === null) { return -1; }
                            return (x < y ? -1 : 1) * (asc ? 1 : -1);
                        });
                    }
                    cnt.textContent = 'Menampilkan ' + Math.min(limit, rows.length) + ' dari ' + rows.length + ' (total data ' + fmt(sh.totalRows) + ')';
                    more.style.display = rows.length > limit ? '' : 'none';
                    var h = '<div class="tw"><table><thead><tr><th>#</th>' + map(sh.headers, function (x, i) { return '<th class="sort' + (numeric[i] ? ' r' : '') + '" data-i="' + i + '">' + esc(x) + (sortCol === i ? (asc ? ' \u25B2' : ' \u25BC') : '') + '</th>'; }).join('') + '</tr></thead><tbody>';
                    each(rows.slice(0, limit), function (r, k) {
                        h += '<tr><td class="mut">' + (k + 1) + '</td>' + map(r, function (v, i) { return '<td' + (numeric[i] ? ' class="r"' : '') + '>' + (v === null ? '<span class="mut">-</span>' : esc(v)) + '</td>'; }).join('') + '</tr>';
                    });
                    box.innerHTML = h + '</tbody></table></div>';
                    each(box.querySelectorAll('th.sort'), function (th) {
                        th.onclick = function () { var i = Number(th.getAttribute('data-i')); asc = sortCol === i ? !asc : true; sortCol = i; draw(); };
                    });
                }
                inp.oninput = function () { q = inp.value.toLowerCase(); limit = 100; draw(); };
                more.onclick = function () { limit += 100; draw(); };
                draw();
            }
        };
    }

    function buildSections(sh) {
        var out = [], fns = [secSummary, secKpi, secStock, secNeeds, secHealth, secTree, secInsights, secCharts, secColumns, secCorr, secTable];
        each(fns, function (f) {
            try { var s = f(sh); if (s) { out.push(s); } } catch (e) {
                out.push({ id: 'err' + out.length, title: 'Bagian gagal dimuat', icon: '\u26A0\uFE0F', html: C('', '<div class="bad">' + esc(e && e.message ? e.message : e) + '</div>') });
            }
        });
        return out;
    }

    function detectChips(sh) {
        var c = [];
        if (sh.businessKpi) { c.push(['Data penjualan', sh.businessKpi.detected && sh.businessKpi.detected.revenue ? sh.businessKpi.detected.revenue : 'kuantitas x harga']); }
        if (sh.stockAnalysis && sh.stockAnalysis.items && sh.stockAnalysis.items.length) { c.push(['Stok', sh.stockAnalysis.itemCol]); }
        if (sh.decisionTreeAnalysis) { c.push(['Klasifikasi C4.5', sh.decisionTreeAnalysis.targetAttribute]); }
        if ((sh.trends || []).length) { c.push(['Deret waktu', sh.trends[0].date]); }
        if (sh.crosstab) { c.push(['Silang kategori', sh.crosstab.a + ' x ' + sh.crosstab.b]); }
        c.push(['Ukuran', fmt(sh.totalRows) + ' baris x ' + (sh.headers || []).length + ' kolom']);
        return c;
    }

    /* ---------- render, navigasi, presentasi ---------- */

    function message(h, p) {
        if (!refs) { return; }
        refs.main.innerHTML = '<div class="msg"><h1>' + esc(h) + '</h1><p>' + esc(p) + '</p></div>';
        refs.nav.innerHTML = ''; refs.chips.innerHTML = '';
    }

    function renderAll() {
        if (!ov || !refs) { return; }
        if (!data || !data.sheets || !data.sheets.length) { message('Menunggu data', 'Belum ada hasil analisis. Jalankan analisis, lalu tekan Reload di halaman analisis.'); return; }
        if (si >= data.sheets.length) { si = 0; }
        var sh = data.sheets[si];
        refs.file.textContent = data.fileName || '';
        sections = buildSections(sh);
        refs.main.innerHTML = '';
        each(sections, function (s) {
            var e = el('section', 'ecx-sec', '<h2>' + s.icon + ' ' + esc(s.title) + '</h2>' + s.html);
            e.id = 'ecx-' + s.id;
            refs.main.appendChild(e);
            s.node = e;
            if (s.after) { try { s.after(e, sh); } catch (err) { e.appendChild(el('div', 'bad', esc(err && err.message ? err.message : err))); } }
        });
        refs.nav.innerHTML = '';
        each(sections, function (s, i) {
            var a = el('a', '', s.icon + ' ' + esc(s.title));
            a.onclick = function () { if (present) { showSec(i); } else if (s.node.scrollIntoView) { s.node.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
            refs.nav.appendChild(a);
        });
        refs.chips.innerHTML = map(detectChips(sh), function (c) { return '<span class="chip">' + esc(c[0]) + ': <b>' + esc(c[1]) + '</b></span>'; }).join('');
        if (refs.sheet) {
            refs.sheet.innerHTML = map(data.sheets, function (s, i) { return '<option value="' + i + '"' + (i === si ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
            refs.sheet.style.display = data.sheets.length > 1 ? '' : 'none';
        }
        if (secIdx >= sections.length) { secIdx = 0; }
        applyPresent();
    }

    function restartProgress() {
        if (!refs) { return; }
        var f = refs.prog;
        f.style.animation = 'none';
        void f.offsetWidth;
        f.style.transform = paused ? 'scaleX(1)' : 'scaleX(0)';
        f.style.animation = paused ? 'none' : 'ec-prog ' + secs + 's linear forwards';
    }

    function showSec(i) {
        if (!sections.length) { return; }
        if (i >= sections.length) { i = 0; }
        if (i < 0) { i = sections.length - 1; }
        secIdx = i;
        each(sections, function (s, k) { s.node.className = 'ecx-sec' + (k === i ? ' cur' : ''); });
        each(refs.nav.children, function (a, k) { a.className = k === i ? 'cur' : ''; });
        ov.scrollTop = 0;
        window.scrollTo(0, 0);
        refs.pos.textContent = (data.sheets[si].name || '') + ' \u00B7 ' + (i + 1) + '/' + sections.length + (paused ? ' \u00B7 jeda' : '');
        restartProgress();
    }

    function schedule() {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!ov || !present || paused || document.hidden || sections.length < 2) { return; }
        timer = setTimeout(function () { showSec(secIdx + 1); schedule(); }, secs * 1000);
    }

    function applyPresent() {
        if (!ov) { return; }
        ov.className = (theme === 'light' ? 'light ' : '') + (STATIC ? 'static ' : '') + (present ? 'present' : '');
        refs.btnPresent.className = present ? 'on' : '';
        refs.btnPresent.textContent = present ? '\u23F9 Keluar presentasi' : '\u25B6 Presentasi';
        refs.btnPause.style.display = present ? '' : 'none';
        refs.btnPrev.style.display = present ? '' : 'none';
        refs.btnNext.style.display = present ? '' : 'none';
        refs.pos.style.display = present ? '' : 'none';
        if (present) { showSec(secIdx); } else {
            each(sections, function (s) { s.node.className = 'ecx-sec'; });
        }
        schedule();
    }

    function setPresent(v) { present = v; paused = false; applyPresent(); }
    function go(d) { if (!present) { return; } showSec(secIdx + d); schedule(); }
    function togglePause() { paused = !paused; refs.btnPause.textContent = paused ? '\u25B6 Lanjut' : '\u23F8 Jeda'; showSec(secIdx); schedule(); }
    function setTheme(t) { theme = t; try { localStorage.setItem('ec-theme', t); } catch (e) {} applyPresent(); }

    function onKey(e) {
        if (!ov) { return; }
        var t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') { return; }
        var k = e.key;
        if (k === 'Escape') {
            if (present) { setPresent(false); e.stopPropagation(); }
            else if (!solo) { closeOverlay(); e.stopPropagation(); }
        } else if (present && (k === 'ArrowRight' || k === 'PageDown')) { go(1); e.preventDefault(); }
        else if (present && (k === 'ArrowLeft' || k === 'PageUp')) { go(-1); e.preventDefault(); }
        else if (present && (k === ' ' || k === 'Enter')) { togglePause(); e.preventDefault(); }
        else if (k === 'p' || k === 'P') { setPresent(!present); }
    }

    function clock() {
        if (!refs) { return; }
        var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
        refs.clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function openOverlay() {
        if (ov || !document.body) { return; }
        ensureStyle();
        try { var tt = localStorage.getItem('ec-theme'); if (tt === 'light' || tt === 'dark') { theme = tt; } } catch (e) {}
        ov = el('div');
        ov.id = 'ec-ov';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-label', 'EasyCast');
        ov.innerHTML =
            '<div class="ecx-top"><div class="ecx-row">' +
                '<span class="brand">\uD83D\uDCFA EasyCast</span><span class="file"></span><span class="spacer"></span>' +
                '<select data-a="sheet" title="Pilih sheet"></select>' +
                '<span class="pos mut"></span>' +
                '<button type="button" data-a="prev" title="Sebelumnya">\u25C0</button>' +
                '<button type="button" data-a="pause" title="Jeda / lanjut (Spasi)">\u23F8 Jeda</button>' +
                '<button type="button" data-a="next" title="Berikutnya">\u25B6</button>' +
                '<button type="button" data-a="present" title="Mode presentasi otomatis (P)">\u25B6 Presentasi</button>' +
                '<button type="button" data-a="theme" title="Ganti tema terang/gelap">\u25D0 Tema</button>' +
                '<button type="button" data-a="full" title="Layar penuh">\u26F6</button>' +
                '<button type="button" data-a="print" title="Cetak / simpan PDF">\uD83D\uDDA8</button>' +
                (STATIC ? '' : '<button type="button" data-a="html" title="Simpan sebagai file .html mandiri untuk di-preview di website">\uD83D\uDCBE Simpan .html</button>') +
                (solo ? '' : '<button type="button" data-a="tv" title="Sambungkan ke TV lewat jaringan lokal">\uD83D\uDCE1 TV</button><button type="button" data-a="win" title="Jendela terpisah">\uD83E\uDE9F Jendela</button><button type="button" class="quiet" data-a="close" title="Tutup (Esc)">\u2715</button>') +
                '<span class="clock"></span>' +
            '</div><div class="ecx-chips"></div><nav class="ecx-nav"></nav><div class="prog"><i></i></div></div><main class="ecx-main"></main>';
        refs = {
            file: ov.querySelector('.file'), pos: ov.querySelector('.pos'), clock: ov.querySelector('.clock'),
            chips: ov.querySelector('.ecx-chips'), nav: ov.querySelector('.ecx-nav'), main: ov.querySelector('.ecx-main'),
            prog: ov.querySelector('.prog i'), sheet: ov.querySelector('[data-a="sheet"]'),
            btnPresent: ov.querySelector('[data-a="present"]'), btnPause: ov.querySelector('[data-a="pause"]'),
            btnPrev: ov.querySelector('[data-a="prev"]'), btnNext: ov.querySelector('[data-a="next"]')
        };
        refs.sheet.onchange = function () { si = Number(refs.sheet.value); secIdx = 0; renderAll(); };
        ov.onclick = function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button[data-a]') : null;
            if (!b) { return; }
            var a = b.getAttribute('data-a');
            if (a === 'close') { closeOverlay(); }
            else if (a === 'present') { setPresent(!present); }
            else if (a === 'pause') { togglePause(); }
            else if (a === 'prev') { go(-1); }
            else if (a === 'next') { go(1); }
            else if (a === 'theme') { setTheme(theme === 'light' ? 'dark' : 'light'); }
            else if (a === 'full') { post('easycastFullscreen'); }
            else if (a === 'print') { window.print(); }
            else if (a === 'html') { post('easycastExportHtml'); }
            else if (a === 'win') { post('easycastNewWindow'); }
            else if (a === 'tv') { post('easycastConnect'); }
        };
        document.body.appendChild(ov);
        paused = false;
        present = solo && !STATIC;       // layar TV (siaran) langsung berputar otomatis; file .html mulai sebagai dasbor
        document.addEventListener('keydown', onKey, true);
        clock();
        clockTimer = setInterval(clock, 30000);
        renderAll();
    }

    function closeOverlay() {
        if (!ov) { return; }
        if (timer) { clearTimeout(timer); timer = null; }
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        document.removeEventListener('keydown', onKey, true);
        if (ov.parentNode) { ov.parentNode.removeChild(ov); }
        ov = null; refs = null;
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { if (timer) { clearTimeout(timer); timer = null; } } else if (ov) { schedule(); }
    });

    /* ---------- tombol & tab di halaman analisis ---------- */

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
                b.id = 'ec-btn'; b.type = 'button'; b.className = ref.className;
                b.title = 'Tampilkan hasil analisis sebagai dasbor/presentasi layar penuh';
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
                var t = anchor.cloneNode(false);
                var attrs = t.attributes;
                for (var i = attrs.length - 1; i >= 0; i--) {
                    var n = attrs[i].name;
                    if (n.indexOf('data-') === 0 || n === 'href' || n === 'id' || n === 'onclick') { t.removeAttribute(n); }
                }
                t.id = 'ec-tab';
                t.className = (t.className || '').replace(/\bactive\b|\bselected\b/g, '').trim();
                t.textContent = '\uD83D\uDCFA EasyCast';
                t.onclick = function (e) { e.preventDefault(); e.stopPropagation(); openOverlay(); };
                anchor.parentNode.insertBefore(t, anchor.nextSibling);
            }
        }
    }
    function scheduleInject() {
        if (injectTimer) { return; }
        injectTimer = setTimeout(function () { injectTimer = null; inject(); }, 150);
    }

    /* ---------- pesan dari ekstensi ---------- */

    window.addEventListener('message', function (ev) {
        var m = ev.data;
        if (!m) { return; }
        if (m.type === 'data') {
            data = m.payload;
            if (ov) { renderAll(); } else if (solo) { openOverlay(); }
            scheduleInject();
        } else if (m.type === 'easycastOpen') { openOverlay(); }
        else if (m.type === 'easycastClose') { if (!solo) { closeOverlay(); } }
        else if (m.type === 'easycastToggle') { if (ov) { if (!solo) { closeOverlay(); } } else { openOverlay(); } }
    });

    /* ---------- inisialisasi ---------- */

    var secsAttr = parseInt(B && B.getAttribute('data-ec-seconds'), 10);
    if (secsAttr >= 5 && secsAttr <= 60) { secs = secsAttr; }

    if (STATIC) {
        data = window.__EC_DATA__;
        document.title = 'EasyCast - ' + (data.fileName || '');
        openOverlay();
    } else {
        if (window.MutationObserver) { new MutationObserver(scheduleInject).observe(document.documentElement, { childList: true, subtree: true }); }
        scheduleInject();
        post('easycastReady');
        var feed = B ? B.getAttribute('data-ec-feed') : null;
        if (solo && feed !== null && feed !== undefined && !api) {
            var pull = function () {
                if (document.hidden) { return; }
                getJSON('/data.json' + feed, function (p) { window.postMessage({ type: 'data', payload: p }, '*'); });
            };
            pull();
            if (window.EventSource) { var es = new EventSource('/events' + feed); es.onmessage = pull; }
            else { setInterval(pull, 5000); }
        } else if (solo) {
            openOverlay();
        }
    }
})();
`;