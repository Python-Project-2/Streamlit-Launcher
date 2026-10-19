
(function () {
    'use strict';
    var vscode = null;
    try { vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : null; } catch (e) { vscode = null; }

    var COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#111827', '#ffffff'];
    var state = {
        on: false,
        tool: 'pen',            // pen | marker | eraser
        color: COLORS[0],
        size: 4,
        eraserSize: 18,
        strokes: [],            // {t:'pen'|'marker', c, w, p:[[x,y],...]}
        redo: [],
        cur: null,
        visible: true
    };

    var canvas = document.createElement('canvas');
    canvas.id = 'ds-pen-canvas';
    var ctx = canvas.getContext('2d');
    var bar = document.createElement('div');
    bar.id = 'ds-pen-bar';
    var cursor = document.createElement('div');
    cursor.id = 'ds-pen-cursor';

    function el(tag, cls, html, title) {
        var e = document.createElement(tag);
        if (cls) { e.className = cls; }
        if (html != null) { e.innerHTML = html; }
        if (title) { e.title = title; }
        return e;
    }

    var btnToggle = el('button', 'dsp-btn dsp-main', '✏️ Pena', 'Aktifkan/matikan mode coret (P)');
    var tools = el('div', 'dsp-tools');
    var btnPen = el('button', 'dsp-btn', '🖊️', 'Pena (P)');
    var btnMarker = el('button', 'dsp-btn', '🖍️', 'Stabilo (H)');
    var btnEraser = el('button', 'dsp-btn', '🧽', 'Penghapus coretan (E)');
    var sw = el('div', 'dsp-colors');
    var size = el('input', 'dsp-size');
    size.type = 'range'; size.min = '1'; size.max = '40'; size.value = String(state.size); size.title = 'Ukuran';
    var btnUndo = el('button', 'dsp-btn', '↶', 'Urungkan (Ctrl+Z)');
    var btnRedo = el('button', 'dsp-btn', '↷', 'Ulangi (Ctrl+Y)');
    var btnClear = el('button', 'dsp-btn dsp-danger', '🗑️ Hapus semua', 'Hapus semua coretan');
    var btnEye = el('button', 'dsp-btn', '👁️', 'Tampil/sembunyikan coretan');

    COLORS.forEach(function (c) {
        var b = el('button', 'dsp-color');
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', function () {
            state.color = c;
            if (state.tool === 'eraser') { setTool('pen'); }
            syncUi();
        });
        b.dataset.c = c;
        sw.appendChild(b);
    });
    var custom = el('input', 'dsp-custom');
    custom.type = 'color'; custom.value = '#ef4444'; custom.title = 'Warna kustom';
    custom.addEventListener('input', function () { state.color = custom.value; if (state.tool === 'eraser') { setTool('pen'); } syncUi(); });
    sw.appendChild(custom);

    [btnPen, btnMarker, btnEraser].forEach(function (b) { tools.appendChild(b); });
    tools.appendChild(sw);
    tools.appendChild(size);
    tools.appendChild(btnUndo);
    tools.appendChild(btnRedo);
    tools.appendChild(btnClear);
    tools.appendChild(btnEye);
    bar.appendChild(btnToggle);
    bar.appendChild(tools);

    function mount() {
        document.body.appendChild(canvas);
        document.body.appendChild(cursor);
        document.body.appendChild(bar);
        resize();
        syncUi();
    }

    /* ---------- ukuran & gambar ---------- */
    function dpr() { return Math.min(2, window.devicePixelRatio || 1); }
    function resize() {
        var w = window.innerWidth, h = window.innerHeight, r = dpr();
        canvas.width = Math.round(w * r);
        canvas.height = Math.round(h * r);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        redraw();
    }

    function drawStroke(s, ox, oy) {
        var p = s.p;
        if (!p.length) { return; }
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.c;
        ctx.fillStyle = s.c;
        if (s.t === 'marker') { ctx.globalAlpha = 0.35; ctx.lineCap = 'butt'; }
        ctx.lineWidth = s.t === 'marker' ? s.w * 3 : s.w;
        if (p.length === 1) {
            ctx.beginPath();
            ctx.arc(p[0][0] - ox, p[0][1] - oy, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(p[0][0] - ox, p[0][1] - oy);
            for (var i = 1; i < p.length - 1; i++) {
                var mx = (p[i][0] + p[i + 1][0]) / 2 - ox, my = (p[i][1] + p[i + 1][1]) / 2 - oy;
                ctx.quadraticCurveTo(p[i][0] - ox, p[i][1] - oy, mx, my);
            }
            var last = p[p.length - 1];
            ctx.lineTo(last[0] - ox, last[1] - oy);
            ctx.stroke();
        }
        ctx.restore();
    }

    function redraw() {
        var r = dpr();
        ctx.setTransform(r, 0, 0, r, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!state.visible) { return; }
        var ox = window.scrollX, oy = window.scrollY;
        var vw = window.innerWidth, vh = window.innerHeight;
        for (var i = 0; i < state.strokes.length; i++) {
            var s = state.strokes[i];
            if (s.b && (s.b[2] < ox - 50 || s.b[0] > ox + vw + 50 || s.b[3] < oy - 50 || s.b[1] > oy + vh + 50)) { continue; }
            drawStroke(s, ox, oy);
        }
        if (state.cur) { drawStroke(state.cur, ox, oy); }
    }

    function bounds(s) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        s.p.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
        var pad = (s.t === 'marker' ? s.w * 3 : s.w) / 2 + 2;
        s.b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    }

    /* ---------- penghapus ---------- */
    function distSeg(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
        var qx = ax + t * dx, qy = ay + t * dy;
        return Math.hypot(px - qx, py - qy);
    }
    function hits(s, x, y, rad) {
        var reach = rad + (s.t === 'marker' ? s.w * 1.5 : s.w / 2);
        if (s.b && (x < s.b[0] - rad || x > s.b[2] + rad || y < s.b[1] - rad || y > s.b[3] + rad)) { return false; }
        if (s.p.length === 1) { return Math.hypot(x - s.p[0][0], y - s.p[0][1]) <= reach; }
        for (var i = 1; i < s.p.length; i++) {
            if (distSeg(x, y, s.p[i - 1][0], s.p[i - 1][1], s.p[i][0], s.p[i][1]) <= reach) { return true; }
        }
        return false;
    }
    var erasedAny = false;
    var removedBatch = [];
    function eraseAt(x, y) {
        var rad = state.eraserSize / 2;
        for (var i = state.strokes.length - 1; i >= 0; i--) {
            if (hits(state.strokes[i], x, y, rad)) {
                removedBatch.push({ s: state.strokes[i], i: i });
                state.strokes.splice(i, 1);
                erasedAny = true;
            }
        }
        if (erasedAny) { redraw(); }
    }

    /* ---------- riwayat (undo/redo) ---------- */
    var history = []; // {type:'add', s} | {type:'erase', items:[{s,i}]} | {type:'clear', all:[]}
    var future = [];
    function push(a) { history.push(a); future = []; if (history.length > 300) { history.shift(); } updateButtons(); }
    function undo() {
        var a = history.pop();
        if (!a) { return; }
        if (a.type === 'add') { var k = state.strokes.indexOf(a.s); if (k >= 0) { state.strokes.splice(k, 1); } }
        else if (a.type === 'erase') { a.items.slice().sort(function (x, y) { return x.i - y.i; }).forEach(function (it) { state.strokes.splice(Math.min(it.i, state.strokes.length), 0, it.s); }); }
        else if (a.type === 'clear') { state.strokes = a.all.slice(); }
        future.push(a); redraw(); persist(); updateButtons();
    }
    function redoAct() {
        var a = future.pop();
        if (!a) { return; }
        if (a.type === 'add') { state.strokes.push(a.s); }
        else if (a.type === 'erase') { a.items.forEach(function (it) { var k = state.strokes.indexOf(it.s); if (k >= 0) { state.strokes.splice(k, 1); } }); }
        else if (a.type === 'clear') { state.strokes = []; }
        history.push(a); redraw(); persist(); updateButtons();
    }

    /* ---------- simpan ---------- */
    var saveTimer = null;
    function persist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            if (!vscode) { return; }
            var slim = state.strokes.map(function (s) { return { t: s.t, c: s.c, w: s.w, p: s.p.map(function (q) { return [Math.round(q[0]), Math.round(q[1])]; }) }; });
            vscode.postMessage({ type: 'savePen', strokes: slim });
        }, 400);
    }

    /* ---------- input pointer ---------- */
    var drawing = false;
    function pos(e) { return [e.clientX + window.scrollX, e.clientY + window.scrollY]; }
    canvas.addEventListener('pointerdown', function (e) {
        if (!state.on || e.button > 0) { return; }
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        drawing = true;
        var p = pos(e);
        if (state.tool === 'eraser') {
            erasedAny = false; removedBatch = [];
            eraseAt(p[0], p[1]);
        } else {
            state.cur = { t: state.tool, c: state.color, w: state.size, p: [p] };
            redraw();
        }
    });
    canvas.addEventListener('pointermove', function (e) {
        moveCursor(e.clientX, e.clientY);
        if (!drawing) { return; }
        var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        if (!evs.length) { evs = [e]; }
        evs.forEach(function (ev) {
            var p = pos(ev);
            if (state.tool === 'eraser') { eraseAt(p[0], p[1]); }
            else if (state.cur) {
                var l = state.cur.p[state.cur.p.length - 1];
                if (Math.hypot(p[0] - l[0], p[1] - l[1]) >= 1.2) { state.cur.p.push(p); }
            }
        });
        if (state.tool !== 'eraser') { redraw(); }
    });
    function end(e) {
        if (!drawing) { return; }
        drawing = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
        if (state.tool === 'eraser') {
            if (erasedAny) { push({ type: 'erase', items: removedBatch.slice() }); persist(); }
        } else if (state.cur) {
            var s = state.cur; state.cur = null;
            bounds(s);
            state.strokes.push(s);
            push({ type: 'add', s: s });
            persist();
            redraw();
        }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', function () { cursor.style.display = 'none'; });
    canvas.addEventListener('pointerenter', function (e) { moveCursor(e.clientX, e.clientY); });

    function moveCursor(x, y) {
        if (!state.on) { cursor.style.display = 'none'; return; }
        var d = state.tool === 'eraser' ? state.eraserSize : (state.tool === 'marker' ? state.size * 3 : state.size);
        d = Math.max(6, d);
        cursor.style.display = 'block';
        cursor.style.width = d + 'px';
        cursor.style.height = d + 'px';
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';
        cursor.style.borderColor = state.tool === 'eraser' ? '#94a3b8' : state.color;
        cursor.style.background = state.tool === 'eraser' ? 'rgba(148,163,184,.25)' : 'transparent';
    }

    /* ---------- UI ---------- */
    function setTool(t) { state.tool = t; syncUi(); }
    function setOn(v) {
        state.on = v;
        if (v && !state.visible) { state.visible = true; redraw(); }
        syncUi();
    }
    function updateButtons() {
        btnUndo.disabled = !history.length;
        btnRedo.disabled = !future.length;
        btnClear.disabled = !state.strokes.length;
    }
    function syncUi() {
        canvas.classList.toggle('on', state.on);
        bar.classList.toggle('open', state.on);
        btnToggle.classList.toggle('active', state.on);
        btnToggle.textContent = '✅ Selesai';
        var hb = document.getElementById('btn-pen');
        if (hb) { hb.classList.toggle('primary', state.on); }
        btnPen.classList.toggle('active', state.tool === 'pen');
        btnMarker.classList.toggle('active', state.tool === 'marker');
        btnEraser.classList.toggle('active', state.tool === 'eraser');
        btnEye.classList.toggle('active', !state.visible);
        Array.prototype.forEach.call(sw.querySelectorAll('.dsp-color'), function (b) { b.classList.toggle('sel', b.dataset.c === state.color && state.tool !== 'eraser'); });
        size.value = String(state.tool === 'eraser' ? state.eraserSize : state.size);
        size.max = state.tool === 'eraser' ? '80' : '40';
        cursor.style.display = 'none';
        updateButtons();
    }

    btnToggle.addEventListener('click', function () { setOn(!state.on); });
    btnPen.addEventListener('click', function () { setTool('pen'); });
    btnMarker.addEventListener('click', function () { setTool('marker'); });
    btnEraser.addEventListener('click', function () { setTool('eraser'); });
    size.addEventListener('input', function () {
        var v = +size.value;
        if (state.tool === 'eraser') { state.eraserSize = v; } else { state.size = v; }
    });
    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redoAct);
    btnClear.addEventListener('click', function () {
        if (!state.strokes.length) { return; }
        var all = state.strokes.slice();
        state.strokes = [];
        push({ type: 'clear', all: all });
        redraw(); persist();
    });
    btnEye.addEventListener('click', function () { state.visible = !state.visible; redraw(); syncUi(); });

    window.addEventListener('keydown', function (e) {
        var t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) { return; }
        var k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z' && state.on) { e.preventDefault(); if (e.shiftKey) { redoAct(); } else { undo(); } return; }
        if ((e.ctrlKey || e.metaKey) && k === 'y' && state.on) { e.preventDefault(); redoAct(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) { return; }
        if (k === 'p') { setOn(!state.on); if (state.on) { setTool('pen'); } }
        else if (state.on && k === 'e') { setTool('eraser'); }
        else if (state.on && k === 'h') { setTool('marker'); }
        else if (state.on && k === 'escape') { setOn(false); }
    });

    window.addEventListener('resize', resize);
    window.addEventListener('scroll', function () { requestAnimationFrame(redraw); }, { passive: true });
    // Konten analisis dirender ulang oleh main.js (ganti sheet/tab); gulir dokumen bisa berubah → gambar ulang.
    try { new ResizeObserver(function () { requestAnimationFrame(redraw); }).observe(document.body); } catch (e) { /* abaikan */ }

    window.addEventListener('message', function (ev) {
        var m = ev.data;
        if (m && m.type === 'penData') {
            state.strokes = Array.isArray(m.strokes) ? m.strokes.filter(function (s) { return s && Array.isArray(s.p); }) : [];
            state.strokes.forEach(bounds);
            history = []; future = [];
            redraw(); updateButtons();
        }
    });

    /* ---------- tombol “✏️ Pena” di header analisis (.head-actions) ----------
     * main.js merender ulang #app tiap data/sheet; observer menyuntik tombol lagi bila hilang. */
    function injectHeaderButton() {
        var box = document.querySelector('.head-actions');
        if (!box || box.querySelector('#btn-pen')) { return; }
        var b = el('button', 'btn', '✏️ Pena', 'Coret langsung di halaman analisis (P)');
        b.id = 'btn-pen';
        b.addEventListener('click', function () { setOn(!state.on); });
        box.appendChild(b);
    }
    function watchHeader() {
        var app = document.getElementById('app');
        if (!app) { return; }
        injectHeaderButton();
        try { new MutationObserver(injectHeaderButton).observe(app, { childList: true, subtree: true }); } catch (e) { /* abaikan */ }
    }
    window.SkunderPen = { toggle: function () { setOn(!state.on); }, setOn: setOn };

    function start() { mount(); watchHeader(); }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
})();