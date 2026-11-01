/* Kursor bersama (Join Room) untuk halaman analisis Date Skunder.
   - Posisi peserta lain diinterpolasi dengan requestAnimationFrame → gerak 60fps, tidak patah-patah.
   - Chip nama otomatis pindah sisi saat kursor mendekati tepi kanan/bawah layar.
   - Mengirim posisi kursor sendiri (pointermove) ke ekstensi untuk disiarkan lewat Socket.IO.
   - Menampilkan pemberitahuan bila berkas yang dibuka berbeda dengan berkas room aktif. */
(function () {
    if (window.SkunderRoom) { return; }
    const vscode = acquireVsCodeApi();
    const REDUCED = (() => {
        try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    })();
    const state = {
        enabled: false,
        inRoom: false,
        room: '',
        file: '',
        selfId: '',
        blocked: null,
        showCursors: true,
        members: [],
        connection: { connected: true, reconnecting: false, attempt: 0 },
    };

    let layer = null;
    let badge = null;
    let banner = null;
    let toastEl = null;
    let toastTimer = 0;
    const nodes = new Map();
    const currentPos = new Map();
    const targetPos = new Map();
    let rafId = 0;
    let lastSend = 0;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function ensureBadge() {
        if (badge) { return badge; }
        badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'sk-room-badge';
        badge.hidden = true;
        badge.title = 'Buka panel Join Room di Pet Skin';
        badge.addEventListener('click', () => vscode.postMessage({ type: 'roomOpenPanel' }));
        document.body.appendChild(badge);
        return badge;
    }

    function ensureBanner() {
        if (banner) { return banner; }
        banner = document.createElement('div');
        banner.className = 'sk-room-banner';
        banner.hidden = true;
        document.body.appendChild(banner);
        return banner;
    }

    function ensureToast() {
        if (toastEl) { return toastEl; }
        toastEl = document.createElement('div');
        toastEl.className = 'sk-room-toast';
        toastEl.hidden = true;
        document.body.appendChild(toastEl);
        return toastEl;
    }

    function ensureLayer() {
        if (layer) { return layer; }
        layer = document.createElement('div');
        layer.className = 'sk-room-layer';
        document.body.appendChild(layer);
        return layer;
    }

    /* ── gambar spider mini (bentuk sama dengan Pet Skin, ukuran 20px) ─────── */

    function spiderSvg(skin) {
        const c = (skin && skin.colors) || {};
        const vars = [
            `--sp-leg:${c.leg || '#22262c'}`,
            `--sp-body:${c.body || '#2b3038'}`,
            `--sp-back:${c.back || '#3a4149'}`,
            `--sp-head:${c.head || '#343a42'}`,
            `--sp-outline:${c.outline || '#4b5563'}`,
            `--sp-eye:${c.eye || '#e8f6ff'}`,
            `--sp-pupil:${c.pupil || '#17324a'}`,
            `--sp-acc:${c.accent || '#8fa3b8'}`,
        ].join(';');
        const leg = (x1, y1, x2, y2, x3, y3) => `<path class="sk-sp-leg" d="M${x1} ${y1} L${x2} ${y2} L${x3} ${y3}" />`;
        return `<svg class="sk-room-spider" viewBox="0 0 120 120" style="${vars}" aria-hidden="true">
            <g>${leg(50, 54, 36, 44, 26, 50)}${leg(50, 62, 33, 60, 23, 68)}${leg(50, 70, 34, 76, 27, 88)}${leg(50, 78, 39, 88, 33, 99)}
            ${leg(70, 54, 84, 44, 94, 50)}${leg(70, 62, 87, 60, 97, 68)}${leg(70, 70, 86, 76, 93, 88)}${leg(70, 78, 81, 88, 87, 99)}</g>
            <ellipse class="sk-sp-body" cx="60" cy="66" rx="14" ry="16" />
            <ellipse class="sk-sp-back" cx="60" cy="69" rx="8" ry="9" />
            <circle class="sk-sp-head" cx="60" cy="44" r="10" />
            <circle class="sk-sp-eye" cx="56" cy="41" r="3.1" />
            <circle class="sk-sp-eye" cx="64" cy="41" r="3.1" />
            <circle class="sk-sp-pupil" cx="56" cy="41.6" r="1.5" />
            <circle class="sk-sp-pupil" cx="64" cy="41.6" r="1.5" />
            ${(skin && skin.accessorySvg) || ''}
        </svg>`;
    }

    /* ── kursor peserta: interpolasi 60fps ────────────────────────────────── */

    function clamp01(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) { return 0; }
        return Math.max(0, Math.min(1, n));
    }

    /** Gambar satu node di posisi (0..1) + pilih sisi chip agar tidak terpotong tepi layar. */
    function paintNode(node, x, y) {
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        const px = Math.round(clamp01(x) * w);
        const py = Math.round(clamp01(y) * h);
        node.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        node.classList.toggle('flip-x', px > w - 168);
        node.classList.toggle('flip-y', py > h - 66);
    }

    function animate() {
        rafId = 0;
        let moving = false;
        for (const [id, node] of nodes) {
            if (node.hidden) { continue; }
            const target = targetPos.get(id);
            if (!target) { continue; }
            const cur = currentPos.get(id) || { x: target.x, y: target.y };
            const dx = target.x - cur.x;
            const dy = target.y - cur.y;
            if (Math.abs(dx) < 0.00015 && Math.abs(dy) < 0.00015) {
                cur.x = target.x;
                cur.y = target.y;
            } else {
                // Faktor 0.34 ≈ responsif namun tetap halus pada ±60fps.
                cur.x += dx * 0.34;
                cur.y += dy * 0.34;
                moving = true;
            }
            currentPos.set(id, cur);
            paintNode(node, cur.x, cur.y);
        }
        if (moving) { rafId = requestAnimationFrame(animate); }
    }

    function startAnim() {
        if (REDUCED) {
            for (const [id, node] of nodes) {
                const target = targetPos.get(id);
                if (!target || node.hidden) { continue; }
                currentPos.set(id, { x: target.x, y: target.y });
                paintNode(node, target.x, target.y);
            }
            return;
        }
        if (!rafId) { rafId = requestAnimationFrame(animate); }
    }

    function memberNode(member) {
        let node = nodes.get(member.id);
        if (!node) {
            node = document.createElement('div');
            node.className = 'sk-room-cursor';
            node.dataset.id = member.id;
            node.innerHTML = `<svg class="sk-room-pointer" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L3 21 L8 16 L11.6 23.2 L15 21.5 L11.3 14.4 L18 14 Z"/></svg>
                <div class="sk-room-chip"><span class="sk-room-avatar"></span><span class="sk-room-name"></span></div>`;
            ensureLayer().appendChild(node);
            nodes.set(member.id, node);
        }
        const chip = node.querySelector('.sk-room-chip');
        const name = node.querySelector('.sk-room-name');
        const avatar = node.querySelector('.sk-room-avatar');
        const pointer = node.querySelector('.sk-room-pointer path');
        const color = member.color || '#38bdf8';
        chip.style.setProperty('--sk-room-color', color);
        pointer.style.fill = color;
        name.textContent = String(member.name || 'User');
        const signature = member.skin ? `${member.skin.id}|${member.skin.accessorySvg || ''}|${JSON.stringify(member.skin.colors || {})}` : 'none';
        if (avatar.dataset.sig !== signature) {
            avatar.innerHTML = spiderSvg(member.skin);
            avatar.dataset.sig = signature;
        }
        return node;
    }

    function renderMembers() {
        const show = state.inRoom && !state.blocked && state.showCursors;
        ensureLayer().hidden = !show;
        if (!show) {
            nodes.forEach((node) => { node.hidden = true; });
            return;
        }
        const ids = new Set();
        for (const member of state.members || []) {
            if (!member || member.id === state.selfId) { continue; }
            const cursor = member.cursor || { x: 0, y: 0, at: 0 };
            // Belum pernah menggerakkan kursor → jangan gambar di pojok kiri atas.
            if (!cursor.at) {
                const lama = nodes.get(member.id);
                if (lama) { lama.hidden = true; }
                continue;
            }
            ids.add(member.id);
            const node = memberNode(member);
            node.hidden = false;
            const x = clamp01(cursor.x);
            const y = clamp01(cursor.y);
            if (!currentPos.has(member.id)) {
                // Pertama kali muncul → langsung di posisi terakhir (hindari meluncur dari 0,0).
                currentPos.set(member.id, { x, y });
                targetPos.set(member.id, { x, y });
                paintNode(node, x, y);
            } else {
                targetPos.set(member.id, { x, y });
                startAnim();
            }
            node.classList.toggle('idle', Date.now() - cursor.at > 12000);
        }
        for (const [id, node] of nodes) {
            if (!ids.has(id)) {
                node.remove();
                nodes.delete(id);
                currentPos.delete(id);
                targetPos.delete(id);
            }
        }
    }

    function moveCursor(id, x, y) {
        const nx = clamp01(x);
        const ny = clamp01(y);
        const member = (state.members || []).find((m) => m.id === id);
        if (member) { member.cursor = { x: nx, y: ny, at: Date.now() }; }
        const node = nodes.get(id);
        if (!node || !state.inRoom || state.blocked || !state.showCursors) { return; }
        node.hidden = false;
        targetPos.set(id, { x: nx, y: ny });
        if (!currentPos.has(id)) { currentPos.set(id, { x: nx, y: ny }); paintNode(node, nx, ny); }
        startAnim();
        node.classList.remove('idle');
        clearTimeout(node._idleTimer);
        node._idleTimer = setTimeout(() => node.classList.add('idle'), 12000);
    }

    /* ── badge, banner, toast ─────────────────────────────────────────────── */

    function renderBadge() {
        const el = ensureBadge();
        if (!state.inRoom) { el.hidden = true; return; }
        el.hidden = false;
        const devices = (state.members || []).length;
        const conn = state.connection || {};
        const ikon = state.blocked ? '⚠' : (conn.connected ? '🌐' : conn.reconnecting ? '🟠' : '🔴');
        el.textContent = `${ikon} Room: ${state.room || '-'} · ${devices} device`;
        el.classList.toggle('blocked', !!state.blocked);
        el.classList.toggle('offline', !state.blocked && !conn.connected);
        el.title = state.blocked
            ? state.blocked.message
            : (conn.connected
                ? 'Kursor dan CSV dibagi dengan perangkat di room ini'
                : `Sambungan ke room sedang dipulihkan${conn.attempt ? ` (percobaan ${conn.attempt})` : ''}…`);
    }

    function renderBanner() {
        const el = ensureBanner();
        if (!state.blocked) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        const message = String(state.blocked.message || 'Keluar room dulu sebelum memakai berkas lain.');
        el.hidden = false;
        el.innerHTML = `<div class="sk-room-banner-icon">⚠</div>
            <div class="sk-room-banner-body">
                <div class="sk-room-banner-title">Berkas ini berbeda dengan berkas room</div>
                <div class="sk-room-banner-text">${esc(message)}</div>
                <div class="sk-room-banner-file">Room <b>${esc(state.room || '-')}</b> memakai <b>${esc(state.blocked.roomFile || '-')}</b> · halaman ini <b>${esc(state.file || '-')}</b></div>
            </div>
            <div class="sk-room-banner-actions">
                <button type="button" class="sk-room-btn danger" data-act="leave">Keluar Room</button>
                <button type="button" class="sk-room-btn" data-act="panel">Panel Room</button>
            </div>`;
    }

    function toast(text, kind) {
        const el = ensureToast();
        el.textContent = String(text || '');
        el.className = 'sk-room-toast ' + (kind === 'bad' ? 'bad' : kind === 'ok' ? 'ok' : 'info');
        el.hidden = !text;
        clearTimeout(toastTimer);
        if (text) {
            toastTimer = setTimeout(() => { el.hidden = true; }, 5200);
        }
    }

    /* ── pesan dari ekstensi ──────────────────────────────────────────────── */

    window.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'roomState' && m.room && typeof m.room === 'object') {
            const r = m.room;
            state.enabled = r.enabled !== false;
            state.inRoom = !!r.inRoom;
            state.room = String(r.room || '');
            state.file = String(r.file || '');
            state.selfId = String(r.selfId || '');
            state.blocked = r.blocked || null;
            state.showCursors = r.showCursors !== false;
            state.members = Array.isArray(r.members) ? r.members : [];
            state.connection = r.connection || { connected: state.inRoom, reconnecting: false, attempt: 0 };
            renderBadge();
            renderBanner();
            renderMembers();
        } else if (m.type === 'roomCursor') {
            moveCursor(String(m.id || ''), m.x, m.y);
        } else if (m.type === 'roomToast') {
            toast(m.text, m.kind);
        }
    });

    /* ── kursor sendiri → ekstensi ────────────────────────────────────────── */

    function sendCursor(ev) {
        if (!state.inRoom || state.blocked || document.hidden) { return; }
        const now = Date.now();
        if (now - lastSend < 33) { return; }
        lastSend = now;
        vscode.postMessage({
            type: 'roomCursor',
            x: Math.max(0, Math.min(1, ev.clientX / Math.max(1, window.innerWidth))),
            y: Math.max(0, Math.min(1, ev.clientY / Math.max(1, window.innerHeight))),
        });
    }

    document.addEventListener('pointermove', sendCursor, { passive: true });
    window.addEventListener('resize', () => {
        for (const [id, node] of nodes) {
            const pos = currentPos.get(id);
            if (pos) { paintNode(node, pos.x, pos.y); }
        }
    });

    ensureBanner().addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
        if (!btn) { return; }
        if (btn.dataset.act === 'leave') { vscode.postMessage({ type: 'roomLeave' }); }
        else { vscode.postMessage({ type: 'roomOpenPanel' }); }
    });

    window.SkunderRoom = {
        toast,
        state() { return { ...state }; },
    };

    vscode.postMessage({ type: 'roomReady' });
})();
