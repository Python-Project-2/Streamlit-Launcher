/* Pet Skin Date Skunder: pemilih kostum untuk pet Spider (laba-laba eksekutor di panel analisis).
   - Pratinjau tiap kostum digambar dari data yang dikirim ekstensi (warna + potongan SVG aksesori),
     jadi bentuknya sama dengan laba-laba yang berjalan di halaman analisis.
   - Tombol “Pakai” menyimpan pilihan ke pengaturan dateSkunder.spider.skin dan menyiarkannya ke
     semua halaman analisis yang terbuka — kostum langsung berganti tanpa perlu memuat ulang. */
(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    const grid = $('pet-grid');
    const stateEl = $('pet-state');
    const noteEl = $('pet-note');
    const missionsEl = $('pet-missions');

    let skins = [];
    let missions = [];
    let active = '';

    /** Geometri kaki yang sama dengan media/spider.js (4 pasang, femur + tibia). */
    const LEG_SPEC = [
        { y: 50, out: [-0.95, -0.48], femur: 19, tibia: 22 },
        { y: 58, out: [-1.00, -0.14], femur: 20, tibia: 23 },
        { y: 66, out: [-1.00, 0.18], femur: 20, tibia: 23 },
        { y: 74, out: [-0.92, 0.54], femur: 19, tibia: 22 },
    ];

    function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }

    function legMarkup() {
        let out = '';
        for (let side = 0; side < 2; side++) {
            const sign = side === 0 ? -1 : 1;
            LEG_SPEC.forEach((spec) => {
                const hip = { x: 60 + sign * 10, y: spec.y };
                // spec.out ditulis untuk sisi kiri (x negatif); sisi kanan dicerminkan.
                const dir1 = norm(spec.out[0] * (sign === -1 ? 1 : -1), spec.out[1]);
                const knee = { x: hip.x + dir1.x * spec.femur, y: hip.y + dir1.y * spec.femur };
                const dir2 = norm(dir1.x * 0.42, dir1.y * 0.25 + 1);
                const foot = { x: knee.x + dir2.x * spec.tibia, y: knee.y + dir2.y * spec.tibia };
                out += `<g class="sp-leg"><path class="sp-seg" d="M ${hip.x} ${hip.y} L ${knee.x} ${knee.y}" />`
                    + `<g class="sp-tibia"><path class="sp-seg" d="M ${knee.x} ${knee.y} L ${foot.x} ${foot.y}" /></g></g>`;
            });
        }
        return out;
    }

    function previewSvg(skin) {
        return `<svg viewBox="0 0 120 120" aria-hidden="true">
            <g>${legMarkup()}</g>
            <ellipse class="sp-body" cx="60" cy="64" rx="17" ry="19" />
            <ellipse class="sp-back" cx="60" cy="67" rx="10" ry="11" />
            <circle class="sp-head" cx="60" cy="42" r="11.5" />
            <circle class="sp-eye" cx="55.4" cy="39" r="3.7" />
            <circle class="sp-eye" cx="64.6" cy="39" r="3.7" />
            <circle class="sp-pupil" cx="55.4" cy="39.6" r="1.8" />
            <circle class="sp-pupil" cx="64.6" cy="39.6" r="1.8" />
            ${skin.accessorySvg || ''}
        </svg>`;
    }

    function previewStyle(skin) {
        const c = skin.colors || {};
        return [
            `--sp-leg:${c.leg}`,
            `--sp-body:${c.body}`,
            `--sp-back:${c.back}`,
            `--sp-head:${c.head}`,
            `--sp-outline:${c.outline}`,
            `--sp-eye:${c.eye}`,
            `--sp-pupil:${c.pupil}`,
            `--sp-acc:${c.accent}`,
        ].join(';');
    }

    function note(text, kind) {
        if (!noteEl) { return; }
        noteEl.hidden = !text;
        noteEl.textContent = String(text || '');
        noteEl.className = 'pet-note' + (kind === 'bad' ? ' bad' : '');
    }

    function select(id) {
        note('Mengganti kostum…', 'info');
        vscode.postMessage({ type: 'select', id });
    }

    function render() {
        if (!grid) { return; }
        grid.innerHTML = '';
        skins.forEach((skin) => {
            const card = document.createElement('div');
            card.className = 'pet-card' + (skin.id === active ? ' active' : '') + (skin.locked ? ' locked' : '');

            const prev = document.createElement('div');
            prev.className = 'pet-prev';
            prev.style.cssText = previewStyle(skin);
            prev.innerHTML = previewSvg(skin);
            if (skin.locked) {
                const kunci = document.createElement('div');
                kunci.className = 'pet-lock';
                kunci.textContent = '🔒';
                prev.appendChild(kunci);
            }

            const nama = document.createElement('div');
            nama.className = 'pet-name';
            nama.textContent = skin.name || skin.id;

            const tag = document.createElement('div');
            tag.className = 'pet-tag';
            tag.textContent = skin.locked
                ? `Terkunci — selesaikan misi “${skin.missionName || '?'}” (${skin.missionProgress || '0/1'}) dulu.`
                : (skin.tagline || '');

            const pakai = document.createElement('button');
            pakai.type = 'button';
            pakai.className = 'pet-use';
            if (skin.locked) {
                pakai.textContent = '🔒 Terkunci';
                pakai.disabled = true;
                pakai.title = `Selesaikan misi “${skin.missionName || '?'}” dulu untuk membuka kostum ini`;
            } else if (skin.id === active) {
                pakai.textContent = '✓ dipakai';
                pakai.disabled = true;
                pakai.title = 'Kostum ini sedang dipakai pet';
            } else {
                pakai.textContent = 'Pakai';
                pakai.title = `Pakai kostum “${skin.name || skin.id}”`;
                pakai.onclick = () => select(skin.id);
            }

            card.appendChild(prev);
            card.appendChild(nama);
            card.appendChild(tag);
            card.appendChild(pakai);
            grid.appendChild(card);
        });
    }

    /** Daftar misi pembuka kostum: nama, progres, dan kostum hadiahnya. */
    function renderMissions() {
        if (!missionsEl) { return; }
        missionsEl.innerHTML = '';
        const selesai = missions.filter((m) => m.done).length;
        const judul = document.createElement('div');
        judul.className = 'pet-missions-head';
        judul.textContent = `🏁 Misi pembuka kostum · ${selesai}/${missions.length} selesai`;
        missionsEl.appendChild(judul);
        missions.forEach((m) => {
            const hadiah = skins.find((s) => s.id === m.rewardSkin);
            const baris = document.createElement('div');
            baris.className = 'pet-mission' + (m.done ? ' done' : '');
            const nama = document.createElement('div');
            nama.className = 'pet-mission-name';
            nama.textContent = `${m.done ? '✓' : '•'} ${m.name} — ${m.done ? 'selesai' : `${m.value}/${m.target}`}${hadiah ? ` → ${hadiah.name}` : ''}`;
            const detail = document.createElement('div');
            detail.className = 'pet-mission-detail';
            detail.textContent = m.detail;
            baris.appendChild(nama);
            baris.appendChild(detail);
            missionsEl.appendChild(baris);
        });
    }

    /* ── Pet Lab: test API JSON, cek kesehatan, riwayat hasil ─────────────── */

    const labStateEl = $('pet-lab-state');
    const labEndpoint = $('lab-endpoint');
    const labMethod = $('lab-method');
    const labUrl = $('lab-url');
    const labHeaders = $('lab-headers');
    const labBody = $('lab-body');
    const labSend = $('lab-send');
    const labCopy = $('lab-copy-url');
    const labHealth = $('lab-health');
    const labResult = $('lab-result');
    const labHistory = $('lab-history');
    const labCount = $('lab-count');
    const labClear = $('lab-clear');

    let labEntries = [];
    let labBusy = '';
    let labClearArm = false;

    function labTime(at) {
        try {
            return new Date(at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function setLabBusy() {
        const api = labBusy === 'api';
        if (labSend) {
            labSend.disabled = !!labBusy;
            labSend.textContent = api ? '⏳ Mengirim…' : '▶ Kirim';
        }
        if (labHealth) {
            labHealth.disabled = !!labBusy;
            labHealth.textContent = labBusy === 'health' ? '⏳ Memeriksa…' : '🩺 Cek di Terminal';
        }
        if (labStateEl && labBusy) {
            labStateEl.textContent = api ? 'mengirim…' : 'memeriksa laptop…';
        }
    }

    function renderLabPresets(presets, running, port) {
        if (!labEndpoint) { return; }
        const sebelumnya = labEndpoint.value;
        labEndpoint.innerHTML = '';
        const hint = document.createElement('option');
        hint.value = '';
        hint.textContent = running ? `Endpoint API lokal · port ${port}` : 'Pilih endpoint (API lokal belum aktif)';
        labEndpoint.appendChild(hint);
        (Array.isArray(presets) ? presets : []).forEach((p) => {
            const opsi = document.createElement('option');
            opsi.value = p.url;
            opsi.textContent = p.label;
            labEndpoint.appendChild(opsi);
        });
        if (sebelumnya && Array.from(labEndpoint.options).some((o) => o.value === sebelumnya)) {
            labEndpoint.value = sebelumnya;
        }
        if (labUrl && !labUrl.value && presets && presets[0]) { labUrl.value = presets[0].url; }
    }

    function labButton(text, act, id, title) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pet-lab-icon';
        btn.textContent = text;
        btn.title = title;
        btn.setAttribute('data-act', act);
        btn.setAttribute('data-id', id);
        return btn;
    }

    function renderLabResult(entry, text) {
        if (!labResult) { return; }
        labResult.hidden = false;
        labResult.innerHTML = '';

        const head = document.createElement('div');
        head.className = 'pet-lab-result-head';
        const badge = document.createElement('span');
        badge.className = 'pet-lab-badge ' + (entry && entry.ok ? 'ok' : 'bad');
        badge.textContent = entry && entry.ok ? '✓ OK' : '✕ Gagal';
        const judul = document.createElement('strong');
        judul.textContent = entry ? entry.title : 'Hasil';
        const waktu = document.createElement('span');
        waktu.className = 'pet-lab-time';
        waktu.textContent = entry ? labTime(entry.at) : '';
        head.appendChild(badge);
        head.appendChild(judul);
        head.appendChild(waktu);

        const ringkas = document.createElement('div');
        ringkas.className = 'pet-lab-result-sub';
        ringkas.textContent = entry ? entry.summary : '';

        const aksi = document.createElement('div');
        aksi.className = 'pet-lab-actions';
        const salin = document.createElement('button');
        salin.type = 'button';
        salin.className = 'pet-btn';
        salin.textContent = '📋 Salin';
        salin.addEventListener('click', () => vscode.postMessage({ type: 'labCopy', text: String(text || (entry && entry.detail) || '') }));
        aksi.appendChild(salin);
        if (entry && entry.id) {
            const buka = document.createElement('button');
            buka.type = 'button';
            buka.className = 'pet-btn';
            buka.textContent = '📄 Buka di editor';
            buka.addEventListener('click', () => vscode.postMessage({ type: 'labOpen', id: entry.id }));
            aksi.appendChild(buka);
        }

        const pre = document.createElement('pre');
        pre.className = 'pet-lab-pre';
        pre.textContent = String(text || (entry && entry.detail) || '');

        labResult.appendChild(head);
        labResult.appendChild(ringkas);
        labResult.appendChild(aksi);
        labResult.appendChild(pre);
    }

    function renderLabHistory() {
        if (!labHistory) { return; }
        labHistory.innerHTML = '';
        if (labCount) { labCount.textContent = String(labEntries.length); }
        if (labClear) { labClear.disabled = !labEntries.length; }
        if (!labEntries.length) {
            const kosong = document.createElement('div');
            kosong.className = 'pet-lab-empty';
            kosong.textContent = 'Belum ada hasil. Jalankan test API JSON atau cek kesehatan dulu.';
            labHistory.appendChild(kosong);
            return;
        }
        labEntries.forEach((entry) => {
            const baris = document.createElement('div');
            baris.className = 'pet-lab-entry';
            baris.setAttribute('data-id', entry.id);

            const ikon = document.createElement('span');
            ikon.className = 'pet-lab-dot ' + (entry.ok ? 'ok' : 'bad');
            ikon.textContent = entry.kind === 'api' ? '🧪' : '🩺';
            ikon.title = entry.kind === 'api' ? 'Test API JSON' : 'Cek kesehatan laptop';

            const isi = document.createElement('div');
            isi.className = 'pet-lab-entry-main';
            const judul = document.createElement('div');
            judul.className = 'pet-lab-entry-title';
            judul.textContent = entry.title;
            const sub = document.createElement('div');
            sub.className = 'pet-lab-entry-sub';
            sub.textContent = `${labTime(entry.at)} · ${entry.summary}`;
            isi.appendChild(judul);
            isi.appendChild(sub);

            const aksi = document.createElement('div');
            aksi.className = 'pet-lab-entry-actions';
            aksi.appendChild(labButton('👁', 'preview', entry.id, 'Pratinjau hasil'));
            aksi.appendChild(labButton('📄', 'open', entry.id, 'Buka di editor'));
            aksi.appendChild(labButton('🗑', 'delete', entry.id, 'Hapus hasil ini'));

            const pratinjau = document.createElement('pre');
            pratinjau.className = 'pet-lab-pre pet-lab-entry-preview';
            pratinjau.hidden = true;
            pratinjau.textContent = entry.detail || '';

            baris.appendChild(ikon);
            baris.appendChild(isi);
            baris.appendChild(aksi);
            baris.appendChild(pratinjau);
            labHistory.appendChild(baris);
        });
    }

    if (labEndpoint) {
        labEndpoint.addEventListener('change', () => {
            const opsi = labEndpoint.selectedOptions[0];
            if (opsi && opsi.value && labUrl) { labUrl.value = opsi.value; }
        });
    }

    function kirimTestApi() {
        if (labBusy) { return; }
        const url = labUrl ? String(labUrl.value || '').trim() : '';
        if (!url) {
            note('Isi URL API dulu — mis. http://127.0.0.1:47831/api/health.json', 'bad');
            if (labUrl) { labUrl.focus(); }
            return;
        }
        labBusy = 'api';
        setLabBusy();
        note('Mengirim permintaan ke ' + url + ' …', 'info');
        vscode.postMessage({
            type: 'labApiTest',
            method: labMethod ? labMethod.value : 'GET',
            url,
            headers: labHeaders ? labHeaders.value : '',
            body: labBody ? labBody.value : '',
            timeoutMs: 15000,
        });
    }

    if (labSend) { labSend.addEventListener('click', kirimTestApi); }
    if (labUrl) {
        labUrl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); kirimTestApi(); }
        });
    }
    if (labCopy) {
        labCopy.addEventListener('click', () => {
            vscode.postMessage({ type: 'labCopy', text: labUrl ? String(labUrl.value || '') : '' });
        });
    }
    if (labHealth) {
        labHealth.addEventListener('click', () => {
            if (labBusy) { return; }
            labBusy = 'health';
            setLabBusy();
            note('Mengumpulkan metrik di terminal “Cek Kesehatan Laptop”…', 'info');
            vscode.postMessage({ type: 'labHealth' });
        });
    }
    if (labHistory) {
        labHistory.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
            if (!btn) { return; }
            const id = btn.getAttribute('data-id');
            const act = btn.getAttribute('data-act');
            const baris = btn.closest('.pet-lab-entry');
            if (act === 'delete') {
                vscode.postMessage({ type: 'labDelete', id });
                if (baris) { baris.classList.add('removing'); }
            } else if (act === 'open') {
                vscode.postMessage({ type: 'labOpen', id });
            } else if (act === 'preview' && baris) {
                const pre = baris.querySelector('.pet-lab-entry-preview');
                if (!pre) { return; }
                pre.hidden = !pre.hidden;
                btn.classList.toggle('active', !pre.hidden);
            }
        });
    }
    if (labClear) {
        labClear.addEventListener('click', () => {
            if (!labEntries.length) { note('Riwayat masih kosong.', 'bad'); return; }
            if (!labClearArm) {
                labClearArm = true;
                labClear.textContent = `🗑 Yakin hapus ${labEntries.length} hasil? Klik lagi`;
                setTimeout(() => {
                    if (labClearArm) {
                        labClearArm = false;
                        labClear.textContent = '🗑 Hapus semua riwayat';
                    }
                }, 5000);
                return;
            }
            labClearArm = false;
            labClear.textContent = '🗑 Hapus semua riwayat';
            vscode.postMessage({ type: 'labClear' });
        });
    }

    /* ── Join Room: server Socket.IO, perangkat, kursor, dan CSV bersama ──── */

    const roomStateEl = $('room-state');
    const roomServerInfo = $('room-server-info');
    const roomHost = $('room-host');
    const roomTerminalBtn = $('room-terminal');
    const roomServerToggle = $('room-server-toggle');
    const roomNameInput = $('room-name');
    const roomUserInput = $('room-user');
    const roomFileSelect = $('room-file');
    const roomPickFileBtn = $('room-pick-file');
    const roomRefreshBtn = $('room-refresh-files');
    const roomJoinBtn = $('room-join');
    const roomLeaveBtn = $('room-leave');
    const roomOpenFileBtn = $('room-open-file');
    const roomHint = $('room-hint');
    const roomCountEl = $('room-count');
    const roomCursorMap = $('room-cursor-map');
    const roomDevicesEl = $('room-devices');
    const roomCsvBadge = $('room-csv-badge');
    const roomCsvEmpty = $('room-csv-empty');
    const roomCsvWrap = $('room-csv-wrap');
    const roomCsvTable = $('room-csv-table');
    const roomCsvHint = $('room-csv-hint');
    const roomCsvApply = $('room-csv-apply');
    const roomCsvCancel = $('room-csv-cancel');
    const roomCsvPreview = $('room-csv-preview');
    const roomLastApplied = $('room-last-applied');
    const roomCreateBtn = $('room-create');
    const roomModeEl = $('room-mode');
    const roomHostRow = $('room-host-row');
    const roomFileRow = $('room-file-row');
    const roomFilesCard = $('room-files-card');
    const roomSendFileBtn = $('room-send-file');
    const roomIncomingEl = $('room-incoming');
    const roomIncomingCount = $('room-incoming-count');
    const roomPreviewBtn = $('room-preview-btn');
    const roomPreviewChip = $('room-preview-chip');
    const roomPreviewFloat = $('room-preview-float');
    const roomPreviewDrag = $('room-preview-drag');
    const roomPreviewClose = $('room-preview-close');
    const roomPreviewTitle = $('room-preview-title');

    let roomView = null;
    let currentCsv = null;
    let lastTableRevision = -1;
    let selectedFile = '';
    let pendingFile = '';
    let fileSignature = '';
    let editedCells = new Map();
    let previewTimer = 0;
    let roomDefaultsApplied = false;
    let deviceSignature = '';
    let incomingSignature = '';
    let roomMode = 'create';
    let roomBusy = '';
    let previewOpen = false;
    let lastPreview = null;
    const metaTimes = new Map();

    /** Kunci localStorage posisi elemen melayang (diingat antar-sesi). */
    const POS_CHIP = 'dateSkunder.room.chipPos';
    const POS_FLOAT = 'dateSkunder.room.previewPos';

    function roomEsc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function roomSetDefault(input, value) {
        if (!input) { return; }
        if (!input.value || input.dataset.auto === '1') {
            input.value = value;
            input.dataset.auto = '1';
        }
    }

    function roomClock(at) {
        try { return new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
        catch (e) { return ''; }
    }

    /* ── elemen melayang (tombol & panel pratinjau) bisa digeser ───────────── */

    function readPos(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) { return null; }
            const pos = JSON.parse(raw);
            if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') { return null; }
            return pos;
        } catch (e) { return null; }
    }

    function writePos(key, el) {
        try {
            const r = el.getBoundingClientRect();
            localStorage.setItem(key, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
        } catch (e) { /* posisi hanya kenyamanan, bukan data penting */ }
    }

    function clampNumber(value, min, max) { return Math.min(Math.max(min, value), Math.max(min, max)); }

    /** Tempatkan elemen melayang di dalam layar; posisi tersimpan dipakai lagi saat panel dibuka. */
    function placeFloat(el, key, fallback) {
        if (!el) { return; }
        const rect = el.getBoundingClientRect();
        const width = rect.width || el.offsetWidth || 180;
        const height = rect.height || el.offsetHeight || 120;
        const saved = readPos(key);
        const x = saved ? saved.x : fallback.x;
        const y = saved ? saved.y : fallback.y;
        el.style.left = `${clampNumber(x, 4, (window.innerWidth || 420) - width - 4)}px`;
        el.style.top = `${clampNumber(y, 4, (window.innerHeight || 640) - height - 4)}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    /** Drag dengan pointer + panah keyboard; klik tetap jalan bila tidak digeser. */
    function makeDraggable(el, handle, key) {
        if (!el || !handle) { return; }
        let start = null;
        let moved = false;
        const geser = (x, y) => {
            const lebar = el.offsetWidth || 180;
            const tinggi = el.offsetHeight || 120;
            el.style.left = `${clampNumber(x, 4, (window.innerWidth || 420) - lebar - 4)}px`;
            el.style.top = `${clampNumber(y, 4, (window.innerHeight || 640) - tinggi - 4)}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        };
        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') { return; }
            const tombol = e.target && e.target.closest ? e.target.closest('button') : null;
            if (tombol && tombol !== handle) { return; }
            const rect = el.getBoundingClientRect();
            start = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, x0: e.clientX, y0: e.clientY };
            moved = false;
            el.classList.add('dragging');
            try { handle.setPointerCapture(e.pointerId); } catch (err) { /* pointer sudah lepas */ }
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (!start || e.pointerId !== start.id) { return; }
            if (Math.abs(e.clientX - start.x0) + Math.abs(e.clientY - start.y0) > 3) { moved = true; }
            geser(e.clientX - start.dx, e.clientY - start.dy);
        });
        const selesai = (e) => {
            if (!start) { return; }
            start = null;
            el.classList.remove('dragging');
            try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* sudah dilepas */ }
            writePos(key, el);
        };
        handle.addEventListener('pointerup', selesai);
        handle.addEventListener('pointercancel', selesai);
        // Aksesibilitas: fokus pegangan, lalu panah untuk memindahkan (Shift = lebih jauh).
        handle.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 24 : 8;
            const arah = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
            if (!arah) { return; }
            const rect = el.getBoundingClientRect();
            geser(rect.left + arah[0], rect.top + arah[1]);
            writePos(key, el);
            e.preventDefault();
        });
        // Klik setelah drag tidak boleh ikut membuka/menutup panel.
        handle.addEventListener('click', (e) => {
            if (!moved) { return; }
            moved = false;
            e.preventDefault();
            e.stopPropagation();
        }, true);
    }

    makeDraggable(roomPreviewFloat, roomPreviewDrag, POS_FLOAT);
    makeDraggable(roomPreviewChip, roomPreviewChip, POS_CHIP);

    function renderRoomServer(room) {
        const srv = room.server || {};
        if (roomServerInfo) {
            const lan = Array.isArray(srv.lan) && srv.lan.length ? srv.lan.join('  ·  ') : 'tidak ada jaringan LAN';
            roomServerInfo.textContent = srv.running
                ? `Aktif · port ${srv.port} · ${lan}`
                : 'Server mati — tekan ⏻ untuk menyalakan.';
        }
        if (roomServerToggle) {
            roomServerToggle.textContent = srv.running ? '⏻' : '▶';
            roomServerToggle.title = srv.running ? 'Hentikan server Socket.IO' : 'Nyalakan server Socket.IO';
        }
        if (roomStateEl) {
            const session = room.session;
            // Payload lama tanpa status koneksi dianggap terhubung selama sesi ada.
            const conn = room.connection || { connected: !!session, reconnecting: false, attempt: 0 };
            let text = 'belum bergabung';
            let kelas = '';
            if (session) {
                const jumlah = (room.members || []).length;
                if (conn.connected) {
                    text = `🟢 ${session.room} · ${jumlah} device`;
                    kelas = 'ok';
                } else if (conn.reconnecting) {
                    text = `🟠 menyambung ulang${conn.attempt ? ` (${conn.attempt})` : ''}…`;
                    kelas = 'warn';
                } else {
                    text = '🔴 terputus';
                    kelas = 'bad';
                }
            }
            roomStateEl.textContent = text;
            roomStateEl.classList.remove('ok', 'warn', 'bad');
            if (kelas) { roomStateEl.classList.add(kelas); }
            roomStateEl.title = session
                ? `Room ${session.room} · berkas ${session.fileName} · ${conn.connected ? 'terhubung' : 'tidak terhubung'}`
                : 'Belum bergabung di room';
        }
        if (!roomDefaultsApplied) {
            const def = room.defaults || {};
            roomSetDefault(roomHost, def.host || '');
            roomSetDefault(roomNameInput, def.room || '');
            roomSetDefault(roomUserInput, def.name || '');
            roomDefaultsApplied = true;
        }
    }

    function renderRoomFiles(room) {
        if (!roomFileSelect) { return; }
        const files = Array.isArray(room.files) ? room.files : [];
        const sig = files.map((f) => f.path).join('|') + '#' + (room.session ? room.session.fileName : '');
        if (sig !== fileSignature) {
            fileSignature = sig;
            roomFileSelect.innerHTML = '';
            if (!files.length) {
                const opsi = document.createElement('option');
                opsi.value = '';
                opsi.textContent = 'Belum ada berkas CSV/Excel di workspace';
                roomFileSelect.appendChild(opsi);
            }
            files.forEach((f) => {
                const opsi = document.createElement('option');
                opsi.value = f.path;
                opsi.textContent = f.editable ? f.name : `${f.name} (pratinjau)`;
                roomFileSelect.appendChild(opsi);
            });
            const target = room.session
                ? (files.find((f) => f.name === room.session.fileName) || {}).path
                : (pendingFile && files.some((f) => f.path === pendingFile) ? pendingFile : (selectedFile || (files[0] && files[0].path)));
            if (target) { roomFileSelect.value = target; selectedFile = target; }
            if (pendingFile && files.some((f) => f.path === pendingFile)) { pendingFile = ''; }
        }
        if (roomFileSelect) { roomFileSelect.disabled = !!room.session; }
    }

    function memberMeta(m) {
        const kursor = m.cursor && m.cursor.at
            ? `${Math.round(m.cursor.x * 100)}%,${Math.round(m.cursor.y * 100)}%`
            : 'belum bergerak';
        return kursor + (typeof m.latency === 'number' && m.latency > 0 ? ` · ${m.latency} ms` : '');
    }

    function renderRoomDevices(room) {
        const members = Array.isArray(room.members) ? room.members : [];
        if (roomCountEl) { roomCountEl.textContent = String(members.length); }
        if (roomDevicesEl) {
            if (!members.length) {
                deviceSignature = '';
            }
            const sig = members.map((m) => [m.id, m.name, m.device, m.platform, m.self ? '1' : '0', (m.skin && m.skin.id) || ''].join('|')).join(';');
            if (members.length && sig === deviceSignature && roomDevicesEl.children.length) {
                // Struktur sama → cukup perbarui angka kursor/latensi (tanpa menggambar ulang daftar).
                members.forEach((m) => {
                    const meta = roomDevicesEl.querySelector(`.pet-room-device[data-id="${m.id}"] .pet-room-device-meta`);
                    if (meta) { meta.textContent = memberMeta(m); }
                });
                renderRoomCursorMap(members);
                return;
            }
            deviceSignature = members.length ? sig : '';
            roomDevicesEl.innerHTML = '';
            if (!members.length) {
                const rooms = (room.server && Array.isArray(room.server.rooms)) ? room.server.rooms : [];
                if (!room.session && rooms.length) {
                    // Belum bergabung: tetap tampilkan room yang sudah ada di server laptop ini.
                    rooms.forEach((r) => {
                        const baris = document.createElement('div');
                        baris.className = 'pet-room-device';
                        const dot = document.createElement('span');
                        dot.className = 'pet-room-dot';
                        dot.style.background = '#38bdf8';
                        const utama = document.createElement('div');
                        utama.className = 'pet-room-device-main';
                        const nama = document.createElement('div');
                        nama.className = 'pet-room-device-name';
                        nama.textContent = `Room “${r.room}” · ${r.members} perangkat`;
                        const sub = document.createElement('div');
                        sub.className = 'pet-room-device-sub';
                        sub.textContent = `${r.file}${r.names && r.names.length ? ` · ${r.names.join(', ')}` : ''}`;
                        utama.appendChild(nama);
                        utama.appendChild(sub);
                        baris.appendChild(dot);
                        baris.appendChild(utama);
                        roomDevicesEl.appendChild(baris);
                    });
                    renderRoomCursorMap(members);
                    return;
                }
                const kosong = document.createElement('div');
                kosong.className = 'pet-room-empty';
                kosong.textContent = room.session
                    ? 'Menunggu perangkat lain bergabung…'
                    : 'Belum ada perangkat. Tekan Join Room untuk mulai.';
                roomDevicesEl.appendChild(kosong);
            }
            members.forEach((m) => {
                const baris = document.createElement('div');
                baris.className = 'pet-room-device' + (m.self ? ' self' : '');
                baris.dataset.id = m.id;

                const dot = document.createElement('span');
                dot.className = 'pet-room-dot';
                dot.style.background = m.color || '#38bdf8';

                const utama = document.createElement('div');
                utama.className = 'pet-room-device-main';
                const nama = document.createElement('div');
                nama.className = 'pet-room-device-name';
                nama.textContent = m.name + (m.self ? ' · laptop ini' : '');
                const sub = document.createElement('div');
                sub.className = 'pet-room-device-sub';
                const skinName = m.skin && m.skin.name ? m.skin.name : (m.skin && m.skin.id) || '-';
                sub.textContent = `${m.device || 'Perangkat'} · ${m.platform || '?'} · skin ${skinName}`;
                utama.appendChild(nama);
                utama.appendChild(sub);

                const meta = document.createElement('div');
                meta.className = 'pet-room-device-meta';
                meta.textContent = memberMeta(m);

                // Ujung kanan: latensi/kursor + tombol “keluarkan” khusus laptop pemilik room.
                const ujung = document.createElement('div');
                ujung.className = 'pet-room-device-end';
                ujung.appendChild(meta);
                if (roomView && roomView.session && roomView.session.owner && !m.self) {
                    const keluar = document.createElement('button');
                    keluar.type = 'button';
                    keluar.className = 'pet-btn danger pet-room-kick';
                    keluar.textContent = '✕';
                    keluar.title = `Keluarkan ${m.name} dari room`;
                    keluar.addEventListener('click', () => {
                        if (keluar.dataset.arm !== '1') {
                            keluar.dataset.arm = '1';
                            keluar.textContent = 'Yakin?';
                            setTimeout(() => {
                                if (!keluar.isConnected) { return; }
                                keluar.dataset.arm = '';
                                keluar.textContent = '✕';
                            }, 4000);
                            return;
                        }
                        keluar.dataset.arm = '';
                        keluar.disabled = true;
                        keluar.textContent = '…';
                        vscode.postMessage({ type: 'roomKick', id: m.id });
                    });
                    ujung.appendChild(keluar);
                }

                baris.appendChild(dot);
                baris.appendChild(utama);
                baris.appendChild(ujung);
                roomDevicesEl.appendChild(baris);
            });
        }
        renderRoomCursorMap(members);
    }

    function renderRoomCursorMap(members) {
        if (!roomCursorMap) { return; }
        // Hanya kursor peserta lain; kursor sendiri sudah terlihat di halaman.
        const aktif = members.filter((m) => !m.self && m.cursor && m.cursor.at);
        roomCursorMap.hidden = !aktif.length;
        roomCursorMap.innerHTML = '';
        if (!aktif.length) { return; }
        const peta = document.createElement('div');
        peta.className = 'pet-room-map-inner';
        aktif.forEach((m) => {
            const titik = document.createElement('span');
            titik.className = 'pet-room-map-cursor';
            titik.dataset.id = m.id;
            titik.style.left = `${Math.round(m.cursor.x * 100)}%`;
            titik.style.top = `${Math.round(m.cursor.y * 100)}%`;
            titik.style.setProperty('--c', m.color || '#38bdf8');
            titik.title = `${m.name} · ${m.device || ''}`;
            const label = document.createElement('span');
            label.className = 'pet-room-map-name';
            label.textContent = m.name;
            titik.appendChild(label);
            peta.appendChild(titik);
        });
        roomCursorMap.appendChild(peta);
    }

    /** Kursor peserta lain datang (frekuensi tinggi) → peta & angka ikut bergerak realtime. */
    function updateRoomCursor(id, x, y) {
        if (!roomView) { return; }
        const member = (roomView.members || []).find((m) => m.id === id);
        if (member) { member.cursor = { x, y, at: Date.now() }; }
        if (member && member.self) { return; }
        const titik = roomCursorMap && roomCursorMap.querySelector(`.pet-room-map-cursor[data-id="${id}"]`);
        if (titik) {
            titik.style.left = `${Math.round(x * 100)}%`;
            titik.style.top = `${Math.round(y * 100)}%`;
        } else if (member && !member.self) {
            // Peserta ini baru mulai menggerakkan kursor → peta belum punya titiknya.
            renderRoomCursorMap(roomView.members || []);
        }
        const meta = roomDevicesEl && roomDevicesEl.querySelector(`.pet-room-device[data-id="${id}"] .pet-room-device-meta`);
        if (meta && member) {
            // Teks tidak perlu 30×/detik — 7×/detik sudah terasa realtime dan jauh lebih ringan.
            const now = Date.now();
            if (now - (metaTimes.get(id) || 0) > 140) {
                metaTimes.set(id, now);
                meta.textContent = memberMeta(member);
            }
        }
    }

    /** Latensi baru → hanya angka milidetik yang diperbarui. */
    function updateRoomLatency(ms) {
        if (!roomView) { return; }
        const self = (roomView.members || []).find((m) => m.self);
        if (!self) { return; }
        self.latency = ms;
        const meta = roomDevicesEl && roomDevicesEl.querySelector(`.pet-room-device[data-id="${self.id}"] .pet-room-device-meta`);
        if (meta) { meta.textContent = memberMeta(self); }
    }

    function csvValueAt(r, c) {
        if (!currentCsv || !currentCsv.rows[r]) { return ''; }
        return String(currentCsv.rows[r][c] ?? '');
    }

    function changesArray() {
        return [...editedCells.entries()].map(([key, value]) => {
            const [r, c] = key.split(':').map(Number);
            return { r, c, value };
        });
    }

    function updateEditState() {
        const n = editedCells.size;
        if (roomCsvApply) { roomCsvApply.disabled = !n || !(currentCsv && currentCsv.editable); }
        if (roomCsvCancel) { roomCsvCancel.disabled = !n; }
        if (roomCsvHint) {
            const potong = currentCsv && currentCsv.truncated ? ' · tampilan dipotong (60 baris × 14 kolom pertama) — geser tabel ⇄' : '';
            roomCsvHint.textContent = (n
                ? `${n} sel diubah — buka tombol Pratinjau untuk melihat & menerapkan.`
                : (currentCsv && currentCsv.editable
                    ? 'Klik sel untuk mengubah — sel yang berubah diberi garis aksen, bukan blok warna.'
                    : 'Berkas ini hanya bisa dilihat (Excel), bukan diubah.')) + potong;
        }
        updatePreviewBadge();
    }

    /** Jumlah perubahan tampil di tombol + chip pratinjau (chip hanya muncul bila ada perubahan). */
    function updatePreviewBadge() {
        const jumlah = editedCells.size || (lastPreview ? (lastPreview.count || (Array.isArray(lastPreview.changed) ? lastPreview.changed.length : 0)) : 0);
        const label = `👁 Pratinjau (${jumlah})`;
        if (roomPreviewBtn) {
            roomPreviewBtn.disabled = !jumlah;
            roomPreviewBtn.textContent = label;
        }
        if (!roomPreviewChip) { return; }
        const tampil = jumlah > 0 && !previewOpen;
        roomPreviewChip.hidden = !tampil;
        roomPreviewChip.textContent = label;
        roomPreviewChip.classList.toggle('pending', !!(lastPreview && lastPreview.kind === 'incoming' && lastPreview.pending));
        roomPreviewChip.title = lastPreview && lastPreview.kind === 'incoming' && lastPreview.pending
            ? 'Perubahan dari perangkat lain menunggu persetujuanmu — klik untuk melihat'
            : 'Pratinjau perubahan CSV — geser untuk memindahkan, klik untuk membuka';
        if (tampil) {
            const lebar = roomPreviewChip.offsetWidth || 140;
            const tinggi = roomPreviewChip.offsetHeight || 30;
            placeFloat(roomPreviewChip, POS_CHIP, {
                x: (window.innerWidth || 420) - lebar - 14,
                y: (window.innerHeight || 640) - tinggi - 14,
            });
        }
    }

    /** Buka/tutup panel pratinjau melayang (bisa digeser lewat judulnya). */
    function openPreview(show) {
        previewOpen = !!show;
        if (roomPreviewFloat) {
            roomPreviewFloat.hidden = !previewOpen;
            if (previewOpen) {
                const lebar = roomPreviewFloat.offsetWidth || 300;
                placeFloat(roomPreviewFloat, POS_FLOAT, {
                    x: (window.innerWidth || 420) - lebar - 14,
                    y: 72,
                });
            }
        }
        updatePreviewBadge();
    }

    function sendPreviewSoon() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => {
            const changes = changesArray();
            if (!changes.length) { return; }
            vscode.postMessage({ type: 'roomCsvPreview', changes });
        }, 250);
    }

    function renderCsvTable(csv) {
        if (!roomCsvTable) { return; }
        currentCsv = csv;
        editedCells = new Map();
        roomCsvTable.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'pet-room-grid';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const corner = document.createElement('th');
        corner.className = 'idx';
        corner.textContent = '#';
        headRow.appendChild(corner);
        (csv.columns || []).forEach((name) => {
            const th = document.createElement('th');
            th.textContent = String(name);
            th.title = String(name);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (let r = 1; r < csv.rows.length; r++) {
            const tr = document.createElement('tr');
            const idx = document.createElement('td');
            idx.className = 'idx';
            idx.textContent = String(r);
            tr.appendChild(idx);
            for (let c = 0; c < (csv.columns || []).length; c++) {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'cell';
                input.value = String(csv.rows[r][c] ?? '');
                input.dataset.r = String(r);
                input.dataset.c = String(c);
                input.disabled = !csv.editable;
                td.appendChild(input);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        roomCsvTable.appendChild(table);
        updateEditState();
    }

    function renderRoomCsv(room) {
        const csv = room.csv;
        if (roomCsvBadge) {
            roomCsvBadge.textContent = csv ? `${csv.totalRows}×${csv.totalCols}` : '—';
            if (csv) {
                roomCsvBadge.title = csv.truncated
                    ? `Menampilkan ${Math.max(0, csv.rows.length - 1)} dari ${csv.totalRows} baris dan ${csv.columns.length} dari ${csv.totalCols} kolom`
                    : `${csv.totalRows} baris × ${csv.totalCols} kolom`;
            }
        }
        if (!csv) {
            if (roomCsvEmpty) {
                roomCsvEmpty.hidden = false;
                roomCsvEmpty.textContent = room.session
                    ? 'Berkas room bukan CSV/TSV (Excel hanya pratinjau) atau belum dibaca.'
                    : 'Bergabung di room untuk melihat & mengubah isi CSV.';
            }
            if (roomCsvWrap) { roomCsvWrap.hidden = true; }
            currentCsv = null;
            lastTableRevision = -1;
            return;
        }
        if (roomCsvEmpty) { roomCsvEmpty.hidden = true; }
        if (roomCsvWrap) { roomCsvWrap.hidden = false; }
        if (csv.revision !== lastTableRevision) {
            lastTableRevision = csv.revision;
            renderCsvTable(csv);
        }
    }

    function renderRoomPreview(preview) {
        if (!roomCsvPreview) { return; }
        lastPreview = preview || null;
        if (!preview) {
            roomCsvPreview.innerHTML = '';
            if (roomPreviewTitle) { roomPreviewTitle.textContent = 'Pratinjau perubahan'; }
            if (previewOpen) { openPreview(false); }
            updatePreviewBadge();
            return;
        }
        const judul = preview.kind === 'incoming'
            ? `📥 ${roomEsc(preview.from)} · ${roomEsc(preview.summary)}`
            : `📝 Pratinjau perubahan · ${roomEsc(preview.summary)}`;
        const catatan = preview.kind === 'incoming'
            ? (preview.pending ? 'Menunggu persetujuanmu (auto-terapkan dimatikan).' : 'Sudah diterapkan otomatis ke berkas CSV di laptop ini.')
            : (preview.pending
                ? 'Belum ditulis — tekan “Terapkan ke semua” untuk menyiarkan ke semua perangkat.'
                : 'Sudah diterapkan ke berkas ini dan disiarkan ke semua perangkat room.');
        let isi = `<div class="pet-room-preview-head">${judul}</div>`
            + `<div class="pet-room-sub">${roomEsc(catatan)} · ${roomClock(preview.at)}</div>`;
        if (Array.isArray(preview.changed) && preview.changed.length) {
            isi += '<div class="pet-room-diff">' + preview.changed.slice(0, 8).map((c) =>
                `<div class="pet-room-diff-row"><span class="kol">${roomEsc(c.label)}</span>`
                + `<span class="lama">${roomEsc(c.before || '∅')}</span>`
                + `<span class="arah">→</span>`
                + `<span class="baru">${roomEsc(c.after || '∅')}</span></div>`).join('') + '</div>';
        }
        if (preview.kind === 'incoming' && preview.pending) {
            isi += '<button type="button" class="pet-btn primary" data-act="apply-pending">✔ Terapkan sekarang</button>';
        }
        if (preview.kind === 'local' && preview.pending) {
            isi += '<div class="pet-room-actions"><button type="button" class="pet-btn" data-act="close-preview">Tutup</button>'
                + '<button type="button" class="pet-btn primary" data-act="apply-local">✔ Terapkan ke semua</button></div>';
        }
        roomCsvPreview.innerHTML = isi;
        if (roomPreviewTitle) {
            roomPreviewTitle.textContent = preview.kind === 'incoming' ? 'Perubahan dari perangkat lain' : 'Pratinjau perubahan';
        }
        updatePreviewBadge();
        // Panel melayang terbuka saat pengguna memintanya, atau saat ada perubahan dari laptop lain
        // yang menunggu persetujuan (supaya tidak terlewat).
        if (!previewOpen && preview.kind === 'incoming' && preview.pending) { openPreview(true); }
    }

    function renderRoomLastApplied(room) {
        if (!roomLastApplied) { return; }
        const last = room.lastApplied;
        roomLastApplied.textContent = last
            ? `Terakhir diterapkan: ${last.from} · ${last.summary} · ${roomClock(last.at)}`
            : '';
    }

    /** File masuk dari peserta lain: nama, pengirim, ukuran + tombol Download. */
    function renderRoomIncoming(room) {
        const files = Array.isArray(room.incomingFiles) ? room.incomingFiles : [];
        if (roomFilesCard) { roomFilesCard.hidden = !room.session; }
        if (roomIncomingCount) { roomIncomingCount.textContent = String(files.length); }
        if (!roomIncomingEl) { return; }
        const sig = files.map((f) => `${f.id}:${f.savedPath || ''}`).join('|');
        if (sig === incomingSignature && roomIncomingEl.children.length) { return; }
        incomingSignature = sig;
        roomIncomingEl.innerHTML = '';
        if (!room.session) { return; }
        if (!files.length) {
            const kosong = document.createElement('div');
            kosong.className = 'pet-room-empty';
            kosong.textContent = 'Belum ada file masuk. Tekan “Pilih & Kirim File” untuk mengirim dari laptop ini.';
            roomIncomingEl.appendChild(kosong);
            return;
        }
        files.forEach((f) => {
            const baris = document.createElement('div');
            baris.className = 'pet-room-device';
            baris.dataset.id = f.id;

            const ikon = document.createElement('span');
            ikon.className = 'pet-room-file-icon';
            ikon.textContent = '📄';

            const utama = document.createElement('div');
            utama.className = 'pet-room-device-main';
            const nama = document.createElement('div');
            nama.className = 'pet-room-device-name';
            nama.textContent = f.name;
            nama.title = f.name;
            const sub = document.createElement('div');
            sub.className = 'pet-room-device-sub';
            sub.textContent = `${f.from} · ${f.sizeLabel} · ${roomClock(f.at)}`;
            utama.appendChild(nama);
            utama.appendChild(sub);

            const unduh = document.createElement('button');
            unduh.type = 'button';
            unduh.className = 'pet-btn primary pet-room-download';
            if (f.savedPath) {
                unduh.textContent = '✔ Tersimpan';
                unduh.title = f.savedPath;
                unduh.disabled = true;
            } else {
                unduh.textContent = '⬇ Download';
                unduh.title = 'Simpan file ini ke laptop ini';
                unduh.addEventListener('click', () => {
                    unduh.disabled = true;
                    unduh.textContent = '⏳ Menyimpan…';
                    vscode.postMessage({ type: 'roomDownloadFile', id: f.id });
                });
            }

            baris.appendChild(ikon);
            baris.appendChild(utama);
            baris.appendChild(unduh);
            roomIncomingEl.appendChild(baris);
        });
    }

    /** Tab Create / Join + tombol yang sesuai; saat sudah di room hanya tombol Keluar yang tampil. */
    function renderRoomMode(room) {
        const inRoom = !!(room && room.session);
        if (roomModeEl) {
            roomModeEl.querySelectorAll('[data-mode]').forEach((tab) => {
                const aktif = tab.getAttribute('data-mode') === roomMode;
                tab.classList.toggle('active', aktif);
                tab.setAttribute('aria-selected', aktif ? 'true' : 'false');
            });
        }
        if (roomHostRow) { roomHostRow.hidden = roomMode !== 'join' || inRoom; }
        // Berkas hanya dipilih saat Create Room; peserta Join menerima berkas pemilik otomatis.
        if (roomFileRow) { roomFileRow.hidden = roomMode !== 'create' || inRoom; }
        if (roomCreateBtn) {
            roomCreateBtn.hidden = roomMode !== 'create' || inRoom;
            roomCreateBtn.disabled = roomBusy === 'create';
            roomCreateBtn.textContent = roomBusy === 'create' ? '⏳ Membuat room…' : '➕ Create Room';
        }
        if (roomJoinBtn) {
            roomJoinBtn.hidden = roomMode !== 'join' || inRoom;
            roomJoinBtn.disabled = inRoom || roomBusy === 'join';
            roomJoinBtn.textContent = roomBusy === 'join' ? '⏳ Menghubungkan…' : '🔗 Join Room';
        }
        if (roomLeaveBtn) { roomLeaveBtn.hidden = !inRoom; }
        if (roomOpenFileBtn) { roomOpenFileBtn.disabled = !inRoom; }
    }

    function renderRoom(room) {
        roomView = room;
        if (!room) { return; }
        if (room.session && roomBusy) { roomBusy = ''; }
        renderRoomServer(room);
        renderRoomFiles(room);
        renderRoomDevices(room);
        renderRoomCsv(room);
        renderRoomPreview(room.preview);
        renderRoomLastApplied(room);
        renderRoomIncoming(room);
        renderRoomMode(room);
        updateEditState();
        if (roomHint) {
            if (room.session) {
                roomHint.textContent = `Berkas room: ${room.session.fileName} · server ${room.session.host}:${room.session.port}. ${room.session.owner ? 'Kamu pemilik room — tombol ✕ mengeluarkan peserta.' : 'Keluar room dulu sebelum membuka berkas CSV lain.'}`;
            } else if (room.note) {
                roomHint.textContent = room.note;
            } else {
                roomHint.textContent = roomMode === 'join'
                    ? 'Berkas tidak perlu dipilih — data & analisis pemilik room diunduh otomatis ke laptop ini.'
                    : 'Isi nama room, pilih berkas CSV/Excel, lalu tekan Create Room.';
            }
        }
    }

    function currentRoomInputs() {
        return {
            room: roomNameInput ? String(roomNameInput.value || '').trim() : '',
            name: roomUserInput ? String(roomUserInput.value || '').trim() : '',
            filePath: roomFileSelect ? String(roomFileSelect.value || '') : selectedFile,
            host: roomHost ? String(roomHost.value || '').trim() : '',
        };
    }

    function joinRoom() {
        const isi = currentRoomInputs();
        if (!isi.room) { note('Isi nama room dulu.', 'bad'); return; }
        if (!isi.host) { note('Isi alamat laptop tuan rumah (IP:port) dulu.', 'bad'); return; }
        roomBusy = 'join';
        if (roomView) { renderRoomMode(roomView); }
        note('Menghubungkan ke room “' + isi.room + '”… data & analisis pemilik akan diunduh otomatis.', 'info');
        vscode.postMessage({ type: 'roomJoin', host: isi.host, room: isi.room, name: isi.name });
    }

    /** Buat room: laptop ini jadi tuan rumah + pemilik data; peserta langsung menerima data & analisisnya. */
    function createRoom() {
        const isi = currentRoomInputs();
        if (!isi.room) { note('Isi nama room dulu (dipakai juga di laptop kedua).', 'bad'); roomNameInput && roomNameInput.focus(); return; }
        if (!isi.filePath) { note('Pilih berkas CSV/Excel dulu.', 'bad'); return; }
        roomBusy = 'create';
        if (roomView) { renderRoomMode(roomView); }
        note('Membuat room “' + isi.room + '”… laptop lain tinggal Join Room.', 'info');
        vscode.postMessage({ type: 'roomCreate', room: isi.room, name: isi.name, filePath: isi.filePath });
    }

    function setRoomMode(mode) {
        roomMode = mode === 'join' ? 'join' : 'create';
        if (roomView) { renderRoomMode(roomView); }
        if (roomMode === 'join' && roomHost) { roomHost.focus(); }
    }

    if (roomHost) { roomHost.addEventListener('input', () => { roomHost.dataset.auto = '0'; }); }
    if (roomNameInput) { roomNameInput.addEventListener('input', () => { roomNameInput.dataset.auto = '0'; }); }
    if (roomUserInput) { roomUserInput.addEventListener('input', () => { roomUserInput.dataset.auto = '0'; }); }
    if (roomFileSelect) {
        roomFileSelect.addEventListener('change', () => { selectedFile = roomFileSelect.value; });
    }
    if (roomJoinBtn) { roomJoinBtn.addEventListener('click', joinRoom); }
    if (roomCreateBtn) { roomCreateBtn.addEventListener('click', createRoom); }
    if (roomModeEl) {
        roomModeEl.addEventListener('click', (e) => {
            const tab = e.target && e.target.closest ? e.target.closest('[data-mode]') : null;
            if (tab) { setRoomMode(tab.getAttribute('data-mode')); }
        });
    }
    if (roomSendFileBtn) {
        roomSendFileBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'roomSendFile' });
        });
    }
    if (roomPreviewBtn) { roomPreviewBtn.addEventListener('click', () => openPreview(true)); }
    if (roomPreviewChip) { roomPreviewChip.addEventListener('click', () => openPreview(!previewOpen)); }
    if (roomPreviewClose) { roomPreviewClose.addEventListener('click', () => openPreview(false)); }
    if (roomLeaveBtn) { roomLeaveBtn.addEventListener('click', () => vscode.postMessage({ type: 'roomLeave' })); }
    if (roomServerToggle) {
        roomServerToggle.addEventListener('click', () => {
            const running = roomView && roomView.server && roomView.server.running;
            vscode.postMessage({ type: running ? 'roomStop' : 'roomStart' });
            note(running ? 'Menghentikan server Socket.IO…' : 'Menyalakan server Socket.IO…', 'info');
        });
    }
    if (roomTerminalBtn) { roomTerminalBtn.addEventListener('click', () => vscode.postMessage({ type: 'roomTerminal' })); }
    if (roomRefreshBtn) {
        roomRefreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'roomRefreshFiles' }));
    }
    if (roomPickFileBtn) {
        roomPickFileBtn.addEventListener('click', () => vscode.postMessage({ type: 'roomPickFile' }));
    }
    if (roomOpenFileBtn) {
        roomOpenFileBtn.addEventListener('click', () => vscode.postMessage({ type: 'roomOpenFile' }));
    }
    if (roomCsvTable) {
        roomCsvTable.addEventListener('input', (e) => {
            const input = e.target && e.target.closest ? e.target.closest('input.cell') : null;
            if (!input || !currentCsv) { return; }
            const r = Number(input.dataset.r);
            const c = Number(input.dataset.c);
            const key = `${r}:${c}`;
            if (input.value === csvValueAt(r, c)) {
                editedCells.delete(key);
                input.classList.remove('dirty');
            } else {
                editedCells.set(key, input.value);
                input.classList.add('dirty');
            }
            updateEditState();
            sendPreviewSoon();
        });
    }
    if (roomCsvApply) {
        roomCsvApply.addEventListener('click', () => {
            const changes = changesArray();
            if (!changes.length) { return; }
            if (roomCsvApply.dataset.arm !== '1') {
                roomCsvApply.dataset.arm = '1';
                roomCsvApply.textContent = `✔ Yakin terapkan ${changes.length} sel?`;
                setTimeout(() => {
                    if (roomCsvApply) {
                        roomCsvApply.dataset.arm = '';
                        roomCsvApply.textContent = '✔ Terapkan ke semua';
                    }
                }, 4000);
                return;
            }
            roomCsvApply.dataset.arm = '';
            roomCsvApply.textContent = '✔ Terapkan ke semua';
            roomCsvApply.disabled = true;
            vscode.postMessage({ type: 'roomCsvApply', changes });
        });
    }
    if (roomCsvCancel) {
        roomCsvCancel.addEventListener('click', () => {
            editedCells = new Map();
            lastTableRevision = -1;
            vscode.postMessage({ type: 'roomCsvCancel' });
            if (currentCsv) { renderCsvTable(currentCsv); }
            updateEditState();
        });
    }
    if (roomCsvPreview) {
        roomCsvPreview.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
            if (!btn) { return; }
            const act = btn.dataset.act;
            if (act === 'apply-pending') {
                vscode.postMessage({ type: 'roomApplyPending' });
            } else if (act === 'apply-local') {
                const changes = changesArray();
                if (!changes.length) { return; }
                btn.disabled = true;
                vscode.postMessage({ type: 'roomCsvApply', changes });
            } else if (act === 'close-preview') {
                openPreview(false);
            }
        });
    }

    window.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'petSkinState') {
            skins = Array.isArray(m.skins) ? m.skins : [];
            missions = Array.isArray(m.missions) ? m.missions : [];
            active = String(m.active || '');
            const aktif = skins.find((s) => s.id === active);
            if (stateEl) {
                const terkunci = skins.filter((s) => s.locked).length;
                stateEl.textContent = skins.length
                    ? `${skins.length} kostum (${terkunci} terkunci) · aktif: ${aktif ? aktif.name : active}`
                    : 'belum ada kostum';
            }
            render();
            renderMissions();
        } else if (m.type === 'petSkinNote') {
            note(m.text, m.ok ? 'ok' : 'bad');
        } else if (m.type === 'petRoomState') {
            renderRoom(m.room);
        } else if (m.type === 'petRoomCursor') {
            updateRoomCursor(String(m.id || ''), Math.max(0, Math.min(1, Number(m.x) || 0)), Math.max(0, Math.min(1, Number(m.y) || 0)));
        } else if (m.type === 'petRoomLatency') {
            updateRoomLatency(Math.max(0, Math.round(Number(m.ms) || 0)));
        } else if (m.type === 'petRoomNote') {
            if (!m.ok && roomBusy) {
                roomBusy = '';
                if (roomView) { renderRoomMode(roomView); }
            }
            note(m.text, m.ok ? 'ok' : 'bad');
        } else if (m.type === 'petRoomFocus') {
            if (roomHost) { roomHost.focus(); roomHost.select(); }
        } else if (m.type === 'petRoomSelectFile') {
            // Berkas hasil tombol 📂 dipilih setelah daftar berkas dari ekstensi datang.
            pendingFile = String(m.path || '');
            if (roomFileSelect) {
                const ada = Array.from(roomFileSelect.options).some((o) => o.value === pendingFile);
                if (ada) {
                    roomFileSelect.value = pendingFile;
                    selectedFile = pendingFile;
                    pendingFile = '';
                }
            }
            if (roomView) { renderRoomFiles(roomView); }
        } else if (m.type === 'petLabState') {
            labEntries = Array.isArray(m.entries) ? m.entries : [];
            renderLabPresets(m.presets, !!m.running, m.port);
            renderLabHistory();
            if (labStateEl && !labBusy) {
                labStateEl.textContent = m.running ? `API aktif · port ${m.port}` : 'API lokal mati';
            }
        } else if (m.type === 'petLabResult') {
            renderLabResult(m.entry, m.text);
        } else if (m.type === 'petLabBusy') {
            labBusy = String(m.busy || '');
            setLabBusy();
            if (!labBusy && labStateEl) { labStateEl.textContent = 'siap'; }
        } else if (m.type === 'petLabNote') {
            note(m.text, m.ok ? 'ok' : 'bad');
        } else if (m.type === 'petLabFocus') {
            if (m.kind === 'health') {
                if (labHealth) { labHealth.focus(); }
            } else if (labUrl) {
                labUrl.focus();
                labUrl.select();
            }
        }
    });

    const openCommBtn = $('pet-open-community');
    if (openCommBtn) {
        openCommBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openCommunity' });
        });
    }

    vscode.postMessage({ type: 'ready' });
})();
