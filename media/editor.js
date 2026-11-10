/* global acquireVsCodeApi */
/**
 * “✏️ Editor CSV Langsung” — editor berkas CSV/TSV di dalam halaman pratinjau.
 *
 * Cara kerja:
 *  • tombol “Aktifkan Mode Edit” meminta isi mentah berkas ke extension host
 *    (pesan `csvEditOpen` → balasan `csvEditData`),
 *  • semua perubahan (sel, baris, kolom, tempel, cari & ganti) dicatat sebagai operasi
 *    yang bisa di-undo/redo,
 *  • tombol “Simpan” mengirim teks hasil susun kembali (pesan `csvSave`); host menulis
 *    berkas lalu watcher memuat ulang seluruh analisis secara otomatis.
 *
 * Hanya .csv/.tsv/.txt yang bisa diedit; pemisah kolom & gaya akhir baris asli
 * dipertahankan (logika parser/penulis sama dengan fitur Join Room di src/roomCsv.ts).
 */
(function () {
    'use strict';

    let P = null;
    let vscodeApi = null;
    let body = null;          // div.grid bagian
    let card = null;          // kartu utama
    let tbody = null;
    let table = null;
    let filterInput = null;
    let findPanel = null;
    let moreBtn = null;
    let footEl = null;
    let statusEl = null;
    let toastEl = null;

    let active = false;
    let rawText = '';
    let hadBom = false;
    let raw = null;           // { rows: string[][], delimiter, eol }
    let original = [];        // salinan rows saat dimuat — penanda sel berubah
    let shape = { rows: 0, cols: 0 };
    let edited = new Set();
    let sel = { r: 1, c: 0 };
    let range = null;         // { r0, c0, r1, c1 } (ter-normalisasi)
    let anchor = null;
    let dragging = false;
    let query = '';
    let limit = 60;
    let undoStack = [];
    let redoStack = [];
    let editing = null;       // { r, c, input, prev }
    let filterTimer = 0;
    let toastTimer = 0;

    const EXT_EDITABLE = /\.(csv|tsv|txt)$/i;
    const NUM_RE = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)([eE][+-]?\d+)?$/;

    // ── CSV murni (port logika src/roomCsv.ts) ─────────────────────────────────

    function sniffDelimiter(text) {
        const firstLine = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
        let best = ',', bestCount = 0;
        for (const char of [',', ';', '\t', '|']) {
            let count = 0, quoted = false;
            for (const ch of firstLine) {
                if (ch === '"') { quoted = !quoted; continue; }
                if (!quoted && ch === char) { count++; }
            }
            if (count > bestCount) { best = char; bestCount = count; }
        }
        return best;
    }

    function sniffEol(text) { return /\r\n/.test(String(text || '')) ? '\r\n' : '\n'; }

    function parseCsvRows(text, delimiter) {
        const src = String(text || '').replace(/^\uFEFF/, '');
        const rows = [];
        let row = [], field = '', quoted = false, started = false;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (quoted) {
                if (ch === '"') {
                    if (src[i + 1] === '"') { field += '"'; i++; }
                    else { quoted = false; }
                } else { field += ch; }
                continue;
            }
            if (ch === '"') { quoted = true; started = true; continue; }
            if (ch === delimiter) { row.push(field); field = ''; started = true; continue; }
            if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && src[i + 1] === '\n') { i++; }
                row.push(field); field = ''; rows.push(row); row = []; started = false;
                continue;
            }
            field += ch; started = true;
        }
        if (started || field.length || row.length) { row.push(field); rows.push(row); }
        while (rows.length > 1) {
            const last = rows[rows.length - 1];
            if (last.length === 1 && last[0] === '') { rows.pop(); } else { break; }
        }
        return rows;
    }

    function normalizeRows(rows) {
        const cols = Math.max(0, ...rows.map((r) => r.length));
        return rows.map((cells) => {
            const next = cells.slice(0, cols);
            while (next.length < cols) { next.push(''); }
            return next;
        });
    }

    function quoteCell(value, delimiter) {
        const text = String(value ?? '');
        const needs = text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text) || /^\s|\s$/.test(text);
        return needs ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function serialize() {
        const d = raw.delimiter;
        return (hadBom ? '\uFEFF' : '') + raw.rows.map((cells) => cells.map((cell) => quoteCell(cell, d)).join(d)).join(raw.eol) + raw.eol;
    }

    function parseClipboard(text) {
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        while (lines.length && lines[lines.length - 1] === '') { lines.pop(); }
        if (!lines.length) { return []; }
        let grid = lines.map((l) => l.split('\t'));
        const flat = grid.length === 1 && grid[0].length === 1 ? grid[0][0] : '';
        if (flat && !flat.includes('\t') && (flat.includes(';') || flat.includes(','))) {
            grid = normalizeRows(parseCsvRows(flat, sniffDelimiter(flat)));
        }
        return grid;
    }

    // ── util ───────────────────────────────────────────────────────────────────

    const colCount = () => (raw && raw.rows[0] ? raw.rows[0].length : 0);
    const rowCount = () => (raw ? raw.rows.length : 0);

    function clampSel() {
        if (!raw) { return; }
        sel.r = Math.max(0, Math.min(rowCount() - 1, sel.r));
        sel.c = Math.max(0, Math.min(Math.max(0, colCount() - 1), sel.c));
        if (range) {
            range.r0 = Math.max(0, range.r0); range.r1 = Math.min(rowCount() - 1, range.r1);
            range.c0 = Math.max(0, range.c0); range.c1 = Math.min(Math.max(0, colCount() - 1), range.c1);
            if (range.r0 > range.r1 || range.c0 > range.c1) { range = null; }
        }
    }

    function normRange() {
        return range || { r0: sel.r, c0: sel.c, r1: sel.r, c1: sel.c };
    }

    function setRange(r0, c0, r1, c1) {
        range = { r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) };
    }

    function inRange(r, c) {
        const q = normRange();
        return r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1;
    }

    function isDirty() {
        if (!raw) { return false; }
        return edited.size > 0 || rowCount() !== shape.rows || colCount() !== shape.cols;
    }

    function toast(text, bad) {
        if (!card) { return; }
        if (!toastEl || !toastEl.parentElement) {
            toastEl = P.el('div', 'ed-toast' + (bad ? ' bad' : ''));
            card.appendChild(toastEl);
        }
        toastEl.textContent = text;
        toastEl.classList.toggle('bad', !!bad);
        toastEl.classList.add('show');
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(() => { if (toastEl) { toastEl.classList.remove('show'); } }, 3200);
    }

    // ── operasi model (semua tercatat untuk undo/redo) ─────────────────────────

    function pushHistory(entry) {
        undoStack.push(entry);
        if (undoStack.length > 120) { undoStack.shift(); }
        redoStack = [];
    }

    function recomputeEdited() {
        if (!raw) { return; }
        if (rowCount() * colCount() > 500000) { edited.clear(); return; }
        edited.clear();
        for (let r = 0; r < raw.rows.length; r++) {
            const a = raw.rows[r], b = original[r] || [];
            for (let c = 0; c < a.length; c++) {
                if (String(a[c] ?? '') !== String(b[c] ?? '')) { edited.add(r + ':' + c); }
            }
        }
    }

    function applyCells(list) {
        for (const ch of list) {
            const r = ch.r, c = ch.c;
            if (!raw || r < 0 || r >= raw.rows.length || c < 0) { continue; }
            while (raw.rows[r].length <= c) { raw.rows[r].push(''); }
            raw.rows[r][c] = String(ch.v ?? '');
            if (!original[r]) { original[r] = raw.rows[r].map(() => ''); }
            while (original[r].length <= c) { original[r].push(''); }
            const key = r + ':' + c;
            if (raw.rows[r][c] === original[r][c]) { edited.delete(key); } else { edited.add(key); }
        }
    }

    function opCells(changes) {
        const befores = changes.map((ch) => ({ r: ch.r, c: ch.c, v: (raw.rows[ch.r] && raw.rows[ch.r][ch.c] != null) ? raw.rows[ch.r][ch.c] : '' }));
        applyCells(changes);
        pushHistory({ undo: () => applyCells(befores), redo: () => applyCells(changes) });
    }

    function opInsertRows(at, contents) {
        const cols = colCount();
        const rows = contents ? contents.map((c) => c.slice()) : [new Array(cols).fill('')];
        const origRows = rows.map(() => new Array(cols).fill(''));
        raw.rows.splice(at, 0, ...rows.map((r) => r.slice()));
        original.splice(at, 0, ...origRows.map((r) => r.slice()));
        recomputeEdited();
        pushHistory({
            undo: () => { raw.rows.splice(at, rows.length); original.splice(at, rows.length); recomputeEdited(); },
            redo: () => { raw.rows.splice(at, 0, ...rows.map((r) => r.slice())); original.splice(at, 0, ...origRows.map((r) => r.slice())); recomputeEdited(); },
        });
    }

    function opDeleteRows(list) {
        const rs = [...new Set(list)].filter((r) => r >= 1 && r < rowCount()).sort((a, b) => b - a);
        if (!rs.length) { return false; }
        const removed = rs.map((r) => ({ r, row: raw.rows.splice(r, 1)[0], orig: original.splice(r, 1)[0] }));
        const asc = removed.slice().sort((a, b) => a.r - b.r);
        recomputeEdited();
        pushHistory({
            undo: () => { for (const m of asc) { raw.rows.splice(m.r, 0, m.row); original.splice(m.r, 0, m.orig); } recomputeEdited(); },
            redo: () => { const rs2 = asc.map((m) => m.r).sort((a, b) => b - a); for (const r of rs2) { raw.rows.splice(r, 1); original.splice(r, 1); } recomputeEdited(); },
        });
        return true;
    }

    function opInsertCol(at, name) {
        const add = (rows, val) => rows.forEach((r) => { r.splice(at, 0, val); });
        add(raw.rows, ''); add(original, '');
        if (name) { raw.rows[0][at] = name; }
        recomputeEdited();
        pushHistory({
            undo: () => { raw.rows.forEach((r) => { if (r.length > at) { r.splice(at, 1); } }); original.forEach((r) => { if (r.length > at) { r.splice(at, 1); } }); recomputeEdited(); },
            redo: () => { add(raw.rows, ''); add(original, ''); if (name) { raw.rows[0][at] = name; } recomputeEdited(); },
        });
    }

    function opDeleteCols(cs) {
        if (!cs.length) { return false; }
        if (cs.length >= colCount()) { toast('Minimal satu kolom harus tetap ada.', true); return false; }
        const uniq = [...new Set(cs)].sort((a, b) => b - a); // descending supaya indeks tetap sah saat di-splice
        const removed = uniq.map((c) => ({
            c,
            vals: raw.rows.map((r) => (r.length > c ? r.splice(c, 1)[0] : null)),
            valsO: original.map((r) => (r.length > c ? r.splice(c, 1)[0] : null)),
        }));
        recomputeEdited();
        const asc = removed.slice().sort((a, b) => a.c - b.c);
        pushHistory({
            undo: () => {
                for (const m of asc) {
                    raw.rows.forEach((r, i) => { if (m.vals[i] !== null) { r.splice(m.c, 0, m.vals[i]); } });
                    original.forEach((r, i) => { if (m.valsO[i] !== null) { r.splice(m.c, 0, m.valsO[i]); } });
                }
                recomputeEdited();
            },
            redo: () => {
                for (const m of removed) {
                    raw.rows.forEach((r) => { if (r.length > m.c) { r.splice(m.c, 1); } });
                    original.forEach((r) => { if (r.length > m.c) { r.splice(m.c, 1); } });
                }
                recomputeEdited();
            },
        });
        return true;
    }

    function opMoveCol(c, dir) {
        const t = c + dir;
        if (t < 0 || t >= colCount()) { return; }
        const swap = (rows) => rows.forEach((r) => { const tmp = r[c]; r[c] = r[t]; r[t] = tmp; });
        swap(raw.rows); swap(original);
        recomputeEdited();
        pushHistory({ undo: () => { swap(raw.rows); swap(original); recomputeEdited(); }, redo: () => { swap(raw.rows); swap(original); recomputeEdited(); } });
        sel.c = t; range = null;
    }

    function growModel(needRows, needCols) {
        for (let i = 0; i < needRows; i++) { raw.rows.push(new Array(colCount()).fill('')); original.push(new Array(colCount()).fill('')); }
        for (let j = 0; j < needCols; j++) { raw.rows.forEach((r) => r.push('')); original.forEach((r) => r.push('')); }
    }

    function shrinkModel(rows, cols) {
        while (rowCount() > rows) { raw.rows.pop(); original.pop(); }
        if (cols < colCount()) { raw.rows.forEach((r) => { r.length = cols; }); original.forEach((r) => { r.length = cols; }); }
    }

    function applyPaste(text) {
        const grid = parseClipboard(text);
        if (!grid.length || !raw) { return; }
        const q = normRange();
        const r0 = q.r0, c0 = q.c0;
        const w = Math.max(...grid.map((g) => g.length));
        const needRows = Math.max(0, r0 + grid.length - rowCount());
        const needCols = Math.max(0, c0 + w - colCount());
        const beforeRows = rowCount(), beforeCols = colCount();
        if (needCols > 0 && colCount() + needCols > 256) { toast('Tempelan terlalu lebar (maks 256 kolom).', true); return; }
        growModel(needRows, needCols);
        const changes = [];
        grid.forEach((cells, i) => cells.forEach((v, j) => changes.push({ r: r0 + i, c: c0 + j, v })));
        const befores = changes.map((ch) => ({ r: ch.r, c: ch.c, v: (raw.rows[ch.r] && raw.rows[ch.r][ch.c] != null) ? raw.rows[ch.r][ch.c] : '' }));
        applyCells(changes);
        pushHistory({
            undo: () => { applyCells(befores); shrinkModel(beforeRows, beforeCols); recomputeEdited(); },
            redo: () => { growModel(needRows, needCols); applyCells(changes); recomputeEdited(); },
        });
        setRange(r0, c0, r0 + grid.length - 1, c0 + w - 1);
        sel = { r: r0, c: c0 };
    }

    function clearRangeCells() {
        const q = normRange();
        const changes = [];
        for (let r = q.r0; r <= q.r1; r++) {
            for (let c = q.c0; c <= q.c1; c++) {
                if (raw.rows[r] && raw.rows[r][c] !== '') { changes.push({ r, c, v: '' }); }
            }
        }
        if (changes.length) { opCells(changes); }
    }

    function undo() {
        commitEditor();
        const e = undoStack.pop();
        if (!e) { return; }
        try { e.undo(); } catch (err) { /* lanjut */ }
        redoStack.push(e);
        clampSel(); refresh();
    }

    function redo() {
        commitEditor();
        const e = redoStack.pop();
        if (!e) { return; }
        try { e.redo(); } catch (err) { /* lanjut */ }
        undoStack.push(e);
        clampSel(); refresh();
    }

    // ── cari & ganti ───────────────────────────────────────────────────────────

    function frInputs() {
        return {
            q: String((findPanel.querySelector('#ed-find-q') || {}).value || ''),
            r: String((findPanel.querySelector('#ed-find-r') || {}).value || ''),
            cs: !!(findPanel.querySelector('#ed-find-case') || {}).checked,
            col: String((findPanel.querySelector('#ed-find-col') || {}).value || ''),
        };
    }

    /** Indeks kolom pilihan panel cari (”” = semua kolom); opsi memakai indeks sebagai nilai. */
    function frColIndex(f) {
        if (!f.col) { return -1; }
        const i = parseInt(f.col, 10);
        return Number.isFinite(i) && i >= 0 && i < colCount() ? i : -1;
    }

    function countMatches() {
        const f = frInputs();
        if (!f.q) { return 0; }
        const ci = frColIndex(f);
        let n = 0;
        const hay = (s) => (f.cs ? String(s) : String(s).toLowerCase());
        const needle = f.cs ? f.q : f.q.toLowerCase();
        for (let r = 0; r < raw.rows.length; r++) {
            const cols = ci >= 0 ? [ci] : raw.rows[r].map((_, c) => c);
            for (const c of cols) {
                let s = hay(raw.rows[r][c] ?? ''), i = 0;
                while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
            }
        }
        return n;
    }

    function replaceAll() {
        const f = frInputs();
        if (!f.q) { toast('Isi teks yang dicari dulu.', true); return; }
        const ci = frColIndex(f);
        const changes = [];
        const run = (val) => {
            const s = String(val ?? '');
            if (!f.cs && !s.toLowerCase().includes(f.q.toLowerCase())) { return null; }
            if (f.cs && !s.includes(f.q)) { return null; }
            const re = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.cs ? 'g' : 'gi');
            return s.replace(re, f.r);
        };
        for (let r = 0; r < raw.rows.length; r++) {
            const cols = ci >= 0 ? [ci] : raw.rows[r].map((_, c) => c);
            for (const c of cols) {
                const next = run(raw.rows[r][c]);
                if (next !== null && next !== String(raw.rows[r][c] ?? '')) { changes.push({ r, c, v: next }); }
            }
        }
        if (!changes.length) { toast('Tidak ada yang cocok dengan “' + f.q + '”.'); return; }
        opCells(changes);
        refresh();
        toast(changes.length.toLocaleString('en-US') + ' sel diganti.');
    }

    // ── pemuatan & simpan ──────────────────────────────────────────────────────

    function loadFromText(text) {
        hadBom = text.charCodeAt(0) === 0xFEFF;
        const delimiter = sniffDelimiter(text);
        raw = { rows: normalizeRows(parseCsvRows(text, delimiter)), delimiter, eol: sniffEol(text) };
        original = raw.rows.map((r) => r.slice());
        shape = { rows: raw.rows.length, cols: colCount() };
        edited.clear();
        undoStack = []; redoStack = [];
        sel = { r: 1, c: 0 }; range = null; anchor = null;
        query = ''; limit = 60;
        active = true;
    }

    function save() {
        if (!active) { return; }
        if (!isDirty()) { toast('Tidak ada perubahan untuk disimpan.'); return; }
        const st = vscodeApi.getState() || {};
        st.csvEditorReopen = true;
        vscodeApi.setState(st);
        vscodeApi.postMessage({ type: 'csvSave', text: serialize() });
        toast('⏳ Menyimpan berkas…');
    }

    function revert() {
        if (!active || !rawText) { return; }
        loadFromText(rawText);
        refresh();
        toast('↺ Perubahan dibuang — kembali ke isi berkas terakhir yang dimuat.');
    }

    function activate() {
        const name = P.state && P.state.fileName ? String(P.state.fileName) : '';
        if (!EXT_EDITABLE.test(name)) {
            renderNotice('Pengeditan langsung hanya tersedia untuk berkas .csv/.tsv/.txt. Berkas Excel (.xlsx/.xls/.xlsm) hanya bisa dipratinjau — ekspor ke CSV bila ingin diedit di sini.');
            return;
        }
        if (statusEl) { statusEl.textContent = '⏳ Membaca berkas…'; }
        vscodeApi.postMessage({ type: 'csvEditOpen' });
    }

    // ── render ─────────────────────────────────────────────────────────────────

    function rowMatches(r) {
        if (!query) { return true; }
        const q = query.toLowerCase();
        for (let c = 0; c < raw.rows[r].length; c++) {
            const v = raw.rows[r][c];
            if (v !== null && v !== undefined && String(v).toLowerCase().includes(q)) { return true; }
        }
        return false;
    }

    function cellCls(r, c) {
        let cls = '';
        const v = String(raw.rows[r][c] ?? '');
        if (NUM_RE.test(v)) { cls += ' ed-num'; }
        if (edited.has(r + ':' + c)) { cls += ' ed-dirty'; }
        if (sel.r === r && sel.c === c) { cls += ' ed-sel'; }
        else if (range && inRange(r, c)) { cls += ' ed-range'; }
        return cls;
    }

    function renderGrid() {
        if (!active || !raw) { return; }
        const cols = colCount();
        const parts = [];
        parts.push('<tr class="ed-hrow"><td class="ed-idx ed-corner">⬍</td>');
        for (let c = 0; c < cols; c++) {
            parts.push('<td data-r="0" data-c="' + c + '" class="ed-hcell' + (cellCls(0, c).replace('ed-num', '') || '') + '">' + P.esc(String(raw.rows[0][c] ?? '')) + '</td>');
        }
        parts.push('</tr>');
        let shown = 0, total = 0;
        for (let r = 1; r < raw.rows.length; r++) {
            if (!rowMatches(r)) { continue; }
            total++;
            if (shown >= limit) { continue; }
            parts.push('<tr><td class="ed-idx" data-selrow="' + r + '">' + r + '</td>');
            for (let c = 0; c < cols; c++) {
                parts.push('<td data-r="' + r + '" data-c="' + c + '" class="' + cellCls(r, c) + '">' + P.esc(String(raw.rows[r][c] ?? '')) + '</td>');
            }
            parts.push('</tr>');
            shown++;
        }
        tbody.innerHTML = parts.join('');
        const dName = raw.delimiter === '\t' ? 'tab' : raw.delimiter === ';' ? 'titik koma' : raw.delimiter === '|' ? 'pipa' : 'koma';
        if (footEl) {
            footEl.innerHTML =
                '<span>' + (rowCount() - 1).toLocaleString('en-US') + ' baris × ' + cols + ' kolom · pemisah: ' + dName + ' · ' +
                '<b class="' + (edited.size ? 'ed-dirty-text' : '') + '">' + edited.size.toLocaleString('en-US') + ' sel diubah</b>' +
                (query ? ' · ' + total.toLocaleString('en-US') + ' baris cocok saringan' : '') + '</span>' +
                '<span class="muted">klik = pilih · klik ganda / Enter = edit · Ctrl+C / Ctrl+V = salin-tempel · Ctrl+Z / Ctrl+Y = urungkan · Ctrl+S = simpan</span>';
        }
        if (moreBtn) { moreBtn.style.display = total > limit ? '' : 'none'; }
    }

    function refresh() {
        if (!active) { return; }
        clampSel();
        renderGrid();
        const u = card.querySelector('[data-ed="undo"]');
        const r2 = card.querySelector('[data-ed="redo"]');
        if (u) { u.disabled = !undoStack.length; }
        if (r2) { r2.disabled = !redoStack.length; }
        const sv = card.querySelector('[data-ed="save"]');
        if (sv) { sv.classList.toggle('primary', isDirty()); }
    }

    function renderEditorShell() {
        // Kartu baru setiap kali mode edit aktif — listener lama ikut terbuang bersama elemennya.
        const fresh = P.el('div', 'card wide ed-card');
        fresh.setAttribute('data-spider-skip', '1');
        if (card && card.parentElement) { card.replaceWith(fresh); } else { body.appendChild(fresh); }
        card = fresh;
        statusEl = null; filterInput = null; findPanel = null; moreBtn = null; footEl = null; tbody = null; table = null; toastEl = null;
        const head = P.el('div', 'ed-head');
        head.innerHTML = '<h3>✏️ Editor CSV</h3><span class="muted">' + P.esc(P.state && P.state.fileName ? String(P.state.fileName) : '') + '</span><span class="ed-spacer"></span>';
        const mkBtn = (label, act, title) => {
            const b = P.el('button', 'btn secondary', label);
            b.dataset.ed = act; b.title = title || '';
            head.appendChild(b);
            return b;
        };
        mkBtn('↩', 'undo', 'Urungkan (Ctrl+Z)');
        mkBtn('↪', 'redo', 'Ulangi (Ctrl+Y)');
        const sv = mkBtn('💾 Simpan', 'save', 'Simpan ke berkas (Ctrl+S)');
        sv.classList.add('primary');
        mkBtn('↺ Buang', 'revert', 'Buang semua perubahan sejak berkas dimuat');
        card.appendChild(head);

        const bar = P.el('div', 'ed-toolbar');
        bar.innerHTML =
            '<span class="ed-tgroup"><span class="muted">Baris:</span>' +
            '<button class="btn secondary" data-ed="rowAbove" title="Sisipkan baris kosong di atas pilihan">➕ Atas</button>' +
            '<button class="btn secondary" data-ed="rowBelow" title="Sisipkan baris kosong di bawah pilihan">➕ Bawah</button>' +
            '<button class="btn secondary" data-ed="rowEnd" title="Tambah baris kosong di akhir berkas">➕ Akhir</button>' +
            '<button class="btn secondary" data-ed="rowDup" title="Duplikat baris yang dipilih">⧉ Duplikat</button>' +
            '<button class="btn secondary" data-ed="rowDel" title="Hapus baris dalam pilihan">🗑 Hapus</button></span>' +
            '<span class="ed-tgroup"><span class="muted">Kolom:</span>' +
            '<button class="btn secondary" data-ed="colAdd" title="Tambah kolom baru (ganti namanya dengan mengedit baris kepala)">➕ Kolom</button>' +
            '<button class="btn secondary" data-ed="colDel" title="Hapus kolom dalam pilihan">🗑 Hapus</button>' +
            '<button class="btn secondary" data-ed="colLeft" title="Geser kolom ke kiri">⬅</button>' +
            '<button class="btn secondary" data-ed="colRight" title="Geser kolom ke kanan">➡</button></span>' +
            '<span class="ed-tgroup">' +
            '<button class="btn secondary" data-ed="find" title="Buka panel cari & ganti (Ctrl+F)">🔍 Cari & Ganti</button></span>';
        card.appendChild(bar);

        findPanel = P.el('div', 'ed-find hidden');
        findPanel.innerHTML =
            '<input id="ed-find-q" placeholder="Cari teks…">' +
            '<input id="ed-find-r" placeholder="Ganti dengan…">' +
            '<label class="ed-check"><input type="checkbox" id="ed-find-case"> Sama huruf besar-kecil</label>' +
            '<select id="ed-find-col"></select>' +
            '<button class="btn secondary" id="ed-find-count">Hitung</button>' +
            '<button class="btn secondary" id="ed-find-replace">Ganti Semua</button>';
        card.appendChild(findPanel);

        const bar2 = P.el('div', 'ed-bar');
        filterInput = document.createElement('input');
        filterInput.placeholder = '🔍 Saring baris (tampilkan hanya yang memuat teks ini)…';
        filterInput.id = 'ed-filter';
        statusEl = P.el('span', 'muted ed-status', '');
        moreBtn = P.el('button', 'btn secondary ed-more', 'Muat 200 baris lagi');
        bar2.appendChild(filterInput);
        bar2.appendChild(statusEl);
        bar2.appendChild(moreBtn);
        card.appendChild(bar2);

        const wrap = P.el('div', 'ed-wrap');
        table = document.createElement('table');
        table.className = 'ed-table';
        table.setAttribute('tabindex', '0');
        table.setAttribute('data-i18n-skip', '1');
        tbody = document.createElement('tbody');
        table.appendChild(tbody);
        wrap.appendChild(table);
        card.appendChild(wrap);

        footEl = P.el('div', 'ed-foot');
        card.appendChild(footEl);

        wireEvents();
    }

    function renderNotice(text) {
        active = false;
        statusEl = null; filterInput = null; findPanel = null; moreBtn = null; footEl = null; tbody = null; table = null; toastEl = null;
        if (!card) { return; }
        card.innerHTML = '<div class="ed-notice"><span>' + P.esc(text) + '</span></div>';
    }

    function renderInactive() {
        card.innerHTML = '';
        const box = P.el('div', 'ed-notice');
        box.innerHTML =
            '<div><b>✏️ Edit berkas langsung di dalam pratinjau.</b></div>' +
            '<div class="muted">Sunting sel, tambah/hapus baris & kolom, tempel dari Excel (Ctrl+V), cari & ganti, urungkan/ulangi, lalu simpan kembali ke berkas — analisis ikut dimuat ulang otomatis. Baris kepala (header) juga bisa diganti namanya dengan klik ganda.</div>';
        const btn = P.el('button', 'btn primary', '🔓 Aktifkan Mode Edit');
        btn.onclick = activate;
        box.appendChild(btn);
        const name = P.state && P.state.fileName ? String(P.state.fileName) : '';
        if (!EXT_EDITABLE.test(name)) {
            const warn = P.el('div', 'ed-warn', 'Berkas Excel (.xlsx/.xls/.xlsm) hanya bisa dipratinjau. Ekspor ke CSV bila ingin diedit langsung.');
            box.appendChild(warn);
            btn.disabled = true;
            btn.title = 'Hanya .csv/.tsv/.txt yang bisa diedit langsung';
        }
        card.appendChild(box);
    }

    // ── interaksi grid ─────────────────────────────────────────────────────────

    function tdCell(target) {
        const td = target && target.closest ? target.closest('td[data-r]') : null;
        if (!td || !td.dataset) { return null; }
        const r = parseInt(td.dataset.r, 10), c = parseInt(td.dataset.c, 10);
        if (!Number.isFinite(r) || !Number.isFinite(c)) { return null; }
        return { td, r, c };
    }

    function openEditor(r, c, initial) {
        commitEditor();
        if (!raw || r < 0 || r >= rowCount()) { return; }
        let td = tbody.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]');
        if (!td) {
            // Baris mungkin belum dirender (di luar halaman) → perbesar halaman dulu.
            limit = Math.max(limit, r + 5);
            renderGrid();
            td = tbody.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]');
            if (!td) { return; }
        }
        sel = { r, c }; range = null;
        renderGrid();
        td = tbody.querySelector('td[data-r="' + r + '"][data-c="' + c + '"]');
        const input = document.createElement('input');
        input.className = 'ed-input';
        input.value = initial !== undefined ? initial : String(raw.rows[r][c] ?? '');
        input.dataset.r = String(r); input.dataset.c = String(c);
        td.textContent = '';
        td.appendChild(input);
        input.focus();
        if (initial === undefined) { input.select(); }
        else { input.setSelectionRange(input.value.length, input.value.length); }
        editing = { r, c, input, prev: String(raw.rows[r][c] ?? '') };
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); commitEditor(); move(1, 0); }
            else if (ev.key === 'Tab') { ev.preventDefault(); commitEditor(); move(0, ev.shiftKey ? -1 : 1); }
            else if (ev.key === 'Escape') { ev.preventDefault(); cancelEditor(); }
            ev.stopPropagation();
        });
        input.addEventListener('blur', () => { commitEditor(); });
    }

    function commitEditor() {
        if (!editing) { return; }
        const { r, c, input, prev } = editing;
        const val = input.value;
        editing = null;
        if (val !== prev) { opCells([{ r, c, v: val }]); }
        refresh();
        if (table) { try { table.focus({ preventScroll: true }); } catch (e) { } }
    }

    function cancelEditor() {
        if (!editing) { return; }
        editing = null;
        refresh();
        if (table) { try { table.focus({ preventScroll: true }); } catch (e) { } }
    }

    function move(dr, dc, extend) {
        if (!raw) { return; }
        if (extend) {
            const q = normRange();
            const nr = Math.max(0, Math.min(rowCount() - 1, (range ? q.r1 : sel.r) + dr));
            const nc = Math.max(0, Math.min(Math.max(0, colCount() - 1), (range ? q.c1 : sel.c) + dc));
            setRange(q.r0, q.c0, nr, nc);
            sel = { r: nr, c: nc };
        } else {
            sel.r = Math.max(0, Math.min(rowCount() - 1, sel.r + dr));
            sel.c = Math.max(0, Math.min(Math.max(0, colCount() - 1), sel.c + dc));
            range = null;
        }
        ensureVisible();
        renderGrid();
    }

    function ensureVisible() {
        const td = tbody.querySelector('td[data-r="' + sel.r + '"][data-c="' + sel.c + '"]');
        if (td && td.scrollIntoView) { td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }

    function rangeTsv() {
        const q = normRange();
        const lines = [];
        for (let r = q.r0; r <= q.r1; r++) {
            const cells = [];
            for (let c = q.c0; c <= q.c1; c++) { cells.push(String((raw.rows[r] || [])[c] ?? '')); }
            lines.push(cells.join('\t'));
        }
        return lines.join('\n');
    }

    function selectedRows() {
        const q = normRange();
        const out = [];
        for (let r = Math.max(1, q.r0); r <= q.r1; r++) { out.push(r); }
        return out;
    }

    function selectedCols() {
        const q = normRange();
        const out = [];
        for (let c = q.c0; c <= q.c1; c++) { out.push(c); }
        return out;
    }

    let globalWired = false;
    function wireGlobal() {
        if (globalWired) { return; }
        globalWired = true;
        document.addEventListener('mouseup', () => { dragging = false; });
    }

    function wireEvents() {
        wireGlobal();
        // Tombol kepala & toolbar (delegasi di kartu).
        card.addEventListener('click', (e) => {
            const b = e.target.closest('[data-ed]');
            if (b && b.dataset.ed) {
                const act = b.dataset.ed;
                commitEditor();
                if (act === 'undo') { undo(); }
                else if (act === 'redo') { redo(); }
                else if (act === 'save') { save(); }
                else if (act === 'revert') { revert(); }
                else if (act === 'find') { toggleFind(); }
                else if (act === 'rowAbove') { const at = Math.max(1, sel.r); opInsertRows(at, null); sel = { r: at, c: sel.c }; refresh(); }
                else if (act === 'rowBelow') { const at = Math.min(rowCount(), Math.max(1, sel.r) + 1); opInsertRows(at, null); sel = { r: at, c: sel.c }; refresh(); }
                else if (act === 'rowEnd') { opInsertRows(rowCount(), null); sel = { r: rowCount() - 1, c: sel.c }; limit = Math.max(limit, rowCount()); refresh(); toast('Baris ditambahkan di akhir.'); }
                else if (act === 'rowDup') {
                    if (sel.r >= 1 && sel.r < rowCount()) { opInsertRows(sel.r + 1, [raw.rows[sel.r].slice()]); sel = { r: sel.r + 1, c: sel.c }; refresh(); }
                }
                else if (act === 'rowDel') {
                    const rs = selectedRows();
                    if (!rs.length) { toast('Pilih baris dulu (baris kepala tidak bisa dihapus).', true); return; }
                    if (opDeleteRows(rs)) { clampSel(); refresh(); toast(rs.length + ' baris dihapus.'); }
                }
                else if (act === 'colAdd') { opInsertCol(colCount(), 'Kolom ' + (colCount() + 1)); sel = { r: sel.r, c: colCount() - 1 }; refresh(); toast('Kolom baru ditambahkan — klik ganda baris kepala untuk mengganti nama.'); }
                else if (act === 'colDel') {
                    const cs = selectedCols();
                    if (opDeleteCols(cs)) { clampSel(); refresh(); toast(cs.length > 1 ? cs.length + ' kolom dihapus.' : 'Kolom dihapus.'); }
                }
                else if (act === 'colLeft') { opMoveCol(sel.c, -1); refresh(); }
                else if (act === 'colRight') { opMoveCol(sel.c, 1); refresh(); }
                return;
            }
        });

        // Klik sel: pilih / rentang dengan Shift.
        tbody.addEventListener('mousedown', (e) => {
            const cell = tdCell(e.target);
            if (!cell) {
                const idx = e.target.closest('td[data-selrow]');
                if (idx) {
                    const r = parseInt(idx.dataset.selrow, 10);
                    if (Number.isFinite(r)) {
                        commitEditor();
                        if (r === 0) { sel = { r: 1, c: sel.c }; setRange(1, 0, rowCount() - 1, Math.max(0, colCount() - 1)); }
                        else { sel = { r, c: 0 }; setRange(r, 0, r, Math.max(0, colCount() - 1)); }
                        renderGrid();
                        try { table.focus({ preventScroll: true }); } catch (err) { }
                    }
                }
                return;
            }
            dragging = true;
            commitEditor();
            if (e.shiftKey && anchor) {
                setRange(anchor.r, anchor.c, cell.r, cell.c);
                sel = { r: cell.r, c: cell.c };
            } else {
                anchor = { r: cell.r, c: cell.c };
                sel = { r: cell.r, c: cell.c };
                range = null;
            }
            renderGrid();
            try { table.focus({ preventScroll: true }); } catch (err) { }
            e.preventDefault();
        });
        tbody.addEventListener('mouseover', (e) => {
            if (!dragging) { return; }
            const cell = tdCell(e.target);
            if (!cell || !anchor) { return; }
            setRange(anchor.r, anchor.c, cell.r, cell.c);
            renderGrid();
        });

        tbody.addEventListener('dblclick', (e) => {
            const cell = tdCell(e.target);
            if (cell) { openEditor(cell.r, cell.c); }
        });

        // Keyboard pada grid.
        table.addEventListener('keydown', (e) => {
            if (editing) { return; }
            const k = e.key;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) { redo(); } else { undo(); } return; }
            if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
            if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); save(); return; }
            if (ctrl && (k === 'f' || k === 'F')) { e.preventDefault(); toggleFind(true); return; }
            if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); setRange(0, 0, rowCount() - 1, Math.max(0, colCount() - 1)); renderGrid(); return; }
            if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0, e.shiftKey); return; }
            if (k === 'ArrowDown') { e.preventDefault(); move(1, 0, e.shiftKey); return; }
            if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1, e.shiftKey); return; }
            if (k === 'ArrowRight') { e.preventDefault(); move(0, 1, e.shiftKey); return; }
            if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
            if (k === 'Enter' || k === 'F2') { e.preventDefault(); openEditor(sel.r, sel.c); return; }
            if (k === 'Escape') { e.preventDefault(); range = null; renderGrid(); return; }
            if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearRangeCells(); refresh(); return; }
            if (!ctrl && k.length === 1) { e.preventDefault(); openEditor(sel.r, sel.c, k); return; }
        });

        // Salin / potong / tempel (rentang ↔ clipboard).
        table.addEventListener('copy', (e) => {
            if (editing || !raw) { return; }
            e.clipboardData.setData('text/plain', rangeTsv());
            e.preventDefault();
        });
        table.addEventListener('cut', (e) => {
            if (editing || !raw) { return; }
            e.clipboardData.setData('text/plain', rangeTsv());
            clearRangeCells();
            refresh();
            e.preventDefault();
        });
        table.addEventListener('paste', (e) => {
            if (editing || !raw) { return; }
            const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
            if (text) {
                applyPaste(text);
                refresh();
                toast('Ditempel dari clipboard.');
            }
            e.preventDefault();
        });

        // Saringan baris.
        filterInput.addEventListener('input', () => {
            if (filterTimer) { clearTimeout(filterTimer); }
            filterTimer = setTimeout(() => {
                query = filterInput.value.trim();
                limit = Math.max(60, limit);
                renderGrid();
            }, 160);
        });
        moreBtn.addEventListener('click', () => { limit += 200; renderGrid(); });

        // Panel cari & ganti.
        findPanel.querySelector('#ed-find-count').addEventListener('click', () => {
            const f = frInputs();
            if (!f.q) { toast('Isi teks yang dicari dulu.', true); return; }
            toast(countMatches().toLocaleString('en-US') + ' kecocokan ditemukan.');
        });
        findPanel.querySelector('#ed-find-replace').addEventListener('click', replaceAll);
    }

    function toggleFind(show) {
        if (!findPanel) { return; }
        const hidden = findPanel.classList.contains('hidden');
        if (show === true && !hidden) { findPanel.querySelector('#ed-find-q').focus(); return; }
        if (hidden) {
            // Isi pilihan kolom sesuai berkas.
            const selCol = findPanel.querySelector('#ed-find-col');
            if (selCol && raw) {
                selCol.innerHTML = '<option value="">Semua kolom</option>' + raw.rows[0].map((h, i) => '<option value="' + i + '">' + P.esc(String(h || ('Kolom ' + (i + 1)))) + '</option>').join('');
            }
            findPanel.classList.remove('hidden');
            const q = findPanel.querySelector('#ed-find-q');
            if (q) { q.focus(); }
        } else {
            findPanel.classList.add('hidden');
        }
    }

    // ── pesan dari extension host ──────────────────────────────────────────────

    window.addEventListener('message', (ev) => {
        const m = ev.data;
        if (!m) { return; }
        if (m.type === 'csvEditData') {
            if (!card) { return; }
            if (!m.editable) {
                renderNotice(String(m.reason || 'Berkas ini tidak bisa diedit langsung.'));
                return;
            }
            rawText = String(m.text ?? '');
            try {
                loadFromText(rawText);
            } catch (err) {
                renderNotice('Gagal membaca CSV: ' + (err && err.message ? err.message : String(err)));
                return;
            }
            if (statusEl) { statusEl.textContent = ''; }
            renderEditorShell();
            refresh();
            toast('Mode edit aktif — perubahan baru tersimpan setelah menekan 💾 Simpan.');
        } else if (m.type === 'csvSaved') {
            if (m.ok) {
                edited.clear();
                if (raw) { shape = { rows: raw.rows.length, cols: colCount() }; }
                refresh();
                toast('✓ Tersimpan — analisis dimuat ulang…');
            } else {
                toast('Gagal menyimpan: ' + String(m.message || ''), true);
            }
        }
    });

    // ── titik masuk ────────────────────────────────────────────────────────────

    window.SkunderEditor = {
        init(ctx) {
            P = ctx;
            vscodeApi = ctx.vscode;
            body = P.section('editor', '✏️ Editor CSV Langsung');
            card = P.el('div', 'card wide ed-card');
            // Seluruh editor dilewati pet Spider supaya pet tidak pernah mengubah berkas pengguna.
            card.setAttribute('data-spider-skip', '1');
            body.appendChild(card);
            active = false;
            raw = null; original = []; rawText = '';
            undoStack = []; redoStack = []; edited.clear();
            renderInactive();
            // Setelah menyimpan, halaman dimuat ulang — buka kembali editor bila diminta.
            const st = vscodeApi.getState() || {};
            if (st.csvEditorReopen) {
                st.csvEditorReopen = false;
                vscodeApi.setState(st);
                const name = P.state && P.state.fileName ? String(P.state.fileName) : '';
                if (EXT_EDITABLE.test(name)) { activate(); }
            }
        },
    };
})();
