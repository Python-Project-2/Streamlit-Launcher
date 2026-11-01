/* Compile MSI — UI view sidebar: link website + identitas aplikasi → installer MSI.
   Semua pekerjaan berat ada di ekstensi; berkas ini menggambar form, kuota, dan terminal. */
(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    const noteEl = $('cp-note');
    const stateEl = $('cp-state');
    const tokenInput = $('cp-token');
    const dotsEl = $('cp-dots');
    const tokenNote = $('cp-token-note');
    const cooldownEl = $('cp-cooldown');
    const planEl = $('cp-plan');
    const stepsEl = $('cp-steps');
    const barEl = $('cp-bar');
    const termEl = $('cp-term');
    const termState = $('cp-term-state');
    const cmdInput = $('cp-cmd');
    const runBtn = $('cp-run');
    const stopBtn = $('cp-stop');
    const verifyBtn = $('cp-verify');
    const iconPreview = $('cp-icon-preview');
    const iconName = $('cp-icon-name');

    const FIELDS = {
        url: $('cp-url'),
        name: $('cp-name'),
        publisher: $('cp-publisher'),
        version: $('cp-version'),
        folder: $('cp-folder'),
        description: $('cp-desc'),
        scope: $('cp-scope'),
        width: $('cp-width'),
        height: $('cp-height'),
    };

    let steps = [];
    let busy = false;
    let token = '';
    let quota = { limit: 5, used: 0, left: 5, blockedUntil: 0, retryAfterMs: 0 };
    let cooldownHours = 5;
    let history = [];
    let historyAt = -1;
    let ticker = null;

    const STEP_ICON = { pending: '○', start: '◐', ok: '✓', fail: '✕', skip: '–', warn: '!' };

    function note(text, ok) {
        if (!noteEl) { return; }
        noteEl.hidden = !text;
        noteEl.textContent = String(text == null ? '' : text);
        noteEl.className = 'cp-note' + (ok ? '' : ' bad');
        if (text) {
            clearTimeout(note.timer);
            note.timer = setTimeout(() => { noteEl.hidden = true; }, 9000);
        }
    }

    /** Sisa waktu dalam bentuk jam:menit:detik untuk hitung mundur. */
    function clock(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const j = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const d = total % 60;
        return `${j}:${String(m).padStart(2, '0')}:${String(d).padStart(2, '0')}`;
    }

    function sisaWaktu(at) {
        if (!at) { return ''; }
        const ms = at - Date.now();
        if (ms <= 0) { return 'kedaluwarsa'; }
        const menit = Math.round(ms / 60000);
        if (menit < 60) { return `berlaku ${menit} menit lagi`; }
        const jam = Math.round(menit / 60);
        if (jam < 36) { return `berlaku ${jam} jam lagi`; }
        return `berlaku ${Math.round(jam / 24)} hari lagi`;
    }

    function renderQuota() {
        if (!dotsEl) { return; }
        dotsEl.innerHTML = '';
        const total = Math.max(1, Number(quota.limit) || 5);
        const left = Math.max(0, Math.min(total, Number(quota.left) || 0));
        for (let i = 0; i < total; i += 1) {
            const dot = document.createElement('span');
            dot.className = 'cp-dot' + (i < left ? ' on' : '');
            dot.textContent = '●';
            dotsEl.appendChild(dot);
        }
        const label = document.createElement('span');
        label.className = 'cp-dot-label';
        label.textContent = `${left}/${total} kuota compile`;
        dotsEl.appendChild(label);

        const sisaBlokir = Number(quota.blockedUntil || 0) - Date.now();
        const blokir = sisaBlokir > 0;
        if (runBtn) { runBtn.disabled = busy || blokir || left <= 0; }
        if (verifyBtn) { verifyBtn.disabled = busy || blokir; }
        if (cooldownEl) {
            cooldownEl.hidden = !blokir;
            if (blokir) {
                cooldownEl.textContent = `⏳ Kuota habis — jeda ${cooldownHours} jam. Reset dalam ${clock(sisaBlokir)} (token baru juga menunggu).`;
            }
        }
    }

    function mulaiTicker() {
        clearInterval(ticker);
        ticker = setInterval(() => {
            if (Number(quota.blockedUntil || 0) > Date.now()) {
                renderQuota();
            } else if (cooldownEl && !cooldownEl.hidden) {
                cooldownEl.hidden = true;
                renderQuota();
            }
        }, 1000);
    }

    function renderToken(m) {
        if (typeof m.token === 'string') {
            token = m.token;
            if (tokenInput) { tokenInput.value = token; }
        }
        const status = m.status || {};
        if (status.quota) { quota = status.quota; }
        if (m.cooldownHours) { cooldownHours = Number(m.cooldownHours) || 5; }
        renderQuota();
        if (tokenNote) {
            if (!token) {
                tokenNote.textContent = 'Tempel token dari website dulu.';
                tokenNote.className = 'cp-token-note';
            } else if (status.valid) {
                tokenNote.textContent = `Token sah · ${sisaWaktu(Number(status.expiresAt || 0))}`;
                tokenNote.className = 'cp-token-note ok';
            } else {
                tokenNote.textContent = status.message || 'Token tidak bisa dipakai — buat token baru di website.';
                tokenNote.className = 'cp-token-note bad';
            }
        }
        if (tokenInput) {
            tokenInput.classList.toggle('bad', !!token && !status.valid);
            tokenInput.classList.toggle('ok', !!token && !!status.valid);
        }
    }

    function renderPlan() {
        if (!planEl) { return; }
        planEl.innerHTML = '';
        const atas = document.createElement('div');
        atas.className = 'cp-plan-main';
        const nama = document.createElement('b');
        nama.textContent = 'Installer MSI · website dibuka sebagai aplikasi';
        atas.appendChild(nama);
        const hasil = document.createElement('div');
        hasil.className = 'cp-plan-out';
        const outDir = (window.__cpOutDir || '');
        hasil.textContent = outDir ? `hasil: ${outDir}` : 'hasil: build/msi';
        hasil.title = outDir;
        const label = document.createElement('span');
        label.className = 'cp-plan-tags';
        ['WiX v3', 'icon + shortcut', 'tanpa Node'].forEach((t) => {
            const tag = document.createElement('span');
            tag.className = 'cp-tag';
            tag.textContent = t;
            label.appendChild(tag);
        });
        planEl.appendChild(atas);
        planEl.appendChild(hasil);
        planEl.appendChild(label);
    }

    function renderSteps() {
        if (!stepsEl) { return; }
        stepsEl.innerHTML = '';
        (steps || []).forEach((step) => {
            const row = document.createElement('div');
            row.className = `cp-step ${step.state || 'pending'}`;
            const icon = document.createElement('span');
            icon.className = 'cp-step-icon';
            icon.textContent = STEP_ICON[step.state] || '○';
            const label = document.createElement('span');
            label.className = 'cp-step-label';
            label.textContent = step.label || step.id;
            row.appendChild(icon);
            row.appendChild(label);
            if (step.detail) {
                const detail = document.createElement('span');
                detail.className = 'cp-step-detail';
                detail.textContent = step.detail;
                detail.title = step.detail;
                row.appendChild(detail);
            }
            stepsEl.appendChild(row);
        });
    }

    function setBusy(running) {
        busy = !!running;
        if (runBtn) {
            runBtn.disabled = busy;
            runBtn.textContent = busy ? '⏳ Compiling…' : '▶ Compile MSI';
        }
        if (stopBtn) { stopBtn.disabled = !busy; }
        if (verifyBtn) { verifyBtn.disabled = busy; }
        document.body.classList.toggle('cp-running', busy);
        renderQuota();
    }

    function atBottom() {
        if (!termEl) { return true; }
        return termEl.scrollTop + termEl.clientHeight >= termEl.scrollHeight - 48;
    }

    function addLine(line) {
        if (!termEl) { return; }
        const stick = atBottom();
        const row = document.createElement('div');
        row.className = 'cp-line ' + (line.kind || 'out');
        row.textContent = String(line.text ?? '');
        termEl.appendChild(row);
        while (termEl.childElementCount > 900) { termEl.removeChild(termEl.firstChild); }
        if (stick) { termEl.scrollTop = termEl.scrollHeight; }
    }

    function send(line) {
        vscode.postMessage({ type: 'command', line });
    }

    /** Isi form dari state (dipakai saat view dibuka). */
    function applySpec(spec) {
        if (!spec) { return; }
        if (FIELDS.url) { FIELDS.url.value = spec.url || ''; }
        if (FIELDS.name) { FIELDS.name.value = spec.name || ''; }
        if (FIELDS.publisher) { FIELDS.publisher.value = spec.publisher || ''; }
        if (FIELDS.version) { FIELDS.version.value = spec.version || '1.0.0'; }
        if (FIELDS.folder) { FIELDS.folder.value = spec.folder || ''; }
        if (FIELDS.description) { FIELDS.description.value = spec.description || ''; }
        if (FIELDS.scope) { FIELDS.scope.value = spec.scope === 'machine' ? 'machine' : 'user'; }
        if (FIELDS.width) { FIELDS.width.value = String(spec.width || 1280); }
        if (FIELDS.height) { FIELDS.height.value = String(spec.height || 800); }
        if ($('cp-appmode')) { $('cp-appmode').checked = spec.appMode !== false; }
        if ($('cp-desktop')) { $('cp-desktop').checked = spec.desktopShortcut !== false; }
    }

    function collectSpec() {
        return {
            url: FIELDS.url ? String(FIELDS.url.value || '').trim() : '',
            name: FIELDS.name ? String(FIELDS.name.value || '').trim() : '',
            publisher: FIELDS.publisher ? String(FIELDS.publisher.value || '').trim() : '',
            version: FIELDS.version ? String(FIELDS.version.value || '').trim() : '1.0.0',
            folder: FIELDS.folder ? String(FIELDS.folder.value || '').trim() : '',
            description: FIELDS.description ? String(FIELDS.description.value || '').trim() : '',
            scope: FIELDS.scope ? String(FIELDS.scope.value || 'user') : 'user',
            width: FIELDS.width ? Number(FIELDS.width.value) : 1280,
            height: FIELDS.height ? Number(FIELDS.height.value) : 800,
            appMode: $('cp-appmode') ? $('cp-appmode').checked : true,
            desktopShortcut: $('cp-desktop') ? $('cp-desktop').checked : true,
        };
    }

    function kirimCompile() {
        if (busy) { note('Compile masih berjalan.', false); return; }
        const spec = collectSpec();
        if (!/^https?:\/\//i.test(spec.url)) {
            note('Isi link website lengkap, mis. https://contoh.com.', false);
            if (FIELDS.url) { FIELDS.url.focus(); }
            return;
        }
        if (!spec.name) {
            note('Nama aplikasi wajib diisi.', false);
            if (FIELDS.name) { FIELDS.name.focus(); }
            return;
        }
        if (!token && tokenInput) { token = String(tokenInput.value || '').trim(); }
        if (!token) {
            note('Masukkan token dari website dulu — klik 🌐 Website Token untuk membuatnya.', false);
            if (tokenInput) { tokenInput.focus(); }
            return;
        }
        note('Memeriksa token…', true);
        vscode.postMessage({ type: 'compile', token, spec });
    }

    function verifikasi() {
        const nilai = tokenInput ? String(tokenInput.value || '').trim() : '';
        if (!nilai) {
            note('Tempel token dulu, lalu tekan Verifikasi.', false);
            if (tokenInput) { tokenInput.focus(); }
            return;
        }
        note('Memeriksa token…', true);
        vscode.postMessage({ type: 'verify', token: nilai });
    }

    if (verifyBtn) { verifyBtn.addEventListener('click', verifikasi); }
    if (runBtn) { runBtn.addEventListener('click', kirimCompile); }
    if (stopBtn) { stopBtn.addEventListener('click', () => { vscode.postMessage({ type: 'cancel' }); }); }
    if ($('cp-site')) { $('cp-site').addEventListener('click', () => vscode.postMessage({ type: 'openSite' })); }
    if ($('cp-result')) { $('cp-result').addEventListener('click', () => vscode.postMessage({ type: 'openResult' })); }
    if ($('cp-term-open')) { $('cp-term-open').addEventListener('click', () => vscode.postMessage({ type: 'showTerminal' })); }
    if ($('cp-icon-pick')) { $('cp-icon-pick').addEventListener('click', () => vscode.postMessage({ type: 'pickIcon' })); }
    if ($('cp-icon-clear')) { $('cp-icon-clear').addEventListener('click', () => vscode.postMessage({ type: 'clearIcon' })); }
    if ($('cp-clear')) {
        $('cp-clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    }
    if ($('cp-copy')) {
        $('cp-copy').addEventListener('click', () => {
            const text = termEl ? Array.from(termEl.children).map((el) => el.textContent).join('\n') : '';
            vscode.postMessage({ type: 'copy', text });
        });
    }
    if ($('cp-revoke')) {
        $('cp-revoke').addEventListener('click', () => {
            vscode.postMessage({ type: 'revoke', token: tokenInput ? String(tokenInput.value || '').trim() : token });
        });
    }

    if (tokenInput) {
        tokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); verifikasi(); }
        });
        tokenInput.addEventListener('input', () => {
            const nilai = String(tokenInput.value || '').toUpperCase();
            if (nilai !== tokenInput.value) { tokenInput.value = nilai; }
        });
    }

    if (FIELDS.url) {
        FIELDS.url.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); kirimCompile(); }
        });
    }

    // Nama aplikasi dipakai sebagai folder default selama folder belum diubah manual.
    let folderTouched = false;
    if (FIELDS.folder) {
        FIELDS.folder.addEventListener('input', () => { folderTouched = true; });
    }
    if (FIELDS.name) {
        FIELDS.name.addEventListener('input', () => {
            if (!folderTouched && FIELDS.folder) { FIELDS.folder.value = FIELDS.name.value; }
        });
    }

    if (cmdInput) {
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const line = String(cmdInput.value || '').trim();
                if (!line) { return; }
                history.unshift(line);
                history = history.slice(0, 40);
                historyAt = -1;
                addLine({ text: `dsk> ${line}`, kind: 'cmd' });
                send(line);
                cmdInput.value = '';
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (history.length) {
                    historyAt = Math.min(history.length - 1, historyAt + 1);
                    cmdInput.value = history[historyAt] || '';
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                historyAt = Math.max(-1, historyAt - 1);
                cmdInput.value = historyAt >= 0 ? (history[historyAt] || '') : '';
            }
        });
    }

    if (termEl) {
        termEl.addEventListener('click', () => { if (cmdInput) { cmdInput.focus(); } });
    }

    window.addEventListener('message', (e) => {
        const m = e.data || {};
        switch (m.type) {
            case 'compileState':
                steps = Array.isArray(m.steps) ? m.steps : [];
                if (m.spec) { applySpec(m.spec); }
                if (m.quota) { quota = m.quota; }
                if (m.cooldownHours) { cooldownHours = Number(m.cooldownHours) || 5; }
                if (m.plan && m.plan.outDir) { window.__cpOutDir = m.plan.outDir; }
                renderPlan();
                renderSteps();
                renderQuota();
                setBusy(!!m.running);
                if (m.iconName && iconName) { iconName.textContent = m.iconName; }
                if (stateEl) {
                    stateEl.textContent = m.running ? 'build berjalan'
                        : (m.server && m.server.running ? `website aktif · port ${m.server.port}` : 'website token mati');
                }
                if (termState) { termState.textContent = m.running ? 'build berjalan…' : 'siap'; }
                if (m.lines && Array.isArray(m.lines) && termEl && !termEl.childElementCount) {
                    m.lines.forEach(addLine);
                }
                mulaiTicker();
                break;
            case 'compileToken':
                renderToken(m);
                break;
            case 'compileLog':
                (Array.isArray(m.lines) ? m.lines : []).forEach(addLine);
                break;
            case 'compileClear':
                if (termEl) { termEl.innerHTML = ''; }
                break;
            case 'compileSteps':
                steps = Array.isArray(m.steps) ? m.steps : [];
                renderSteps();
                break;
            case 'compileProgress':
                if (barEl) { barEl.style.width = `${Math.max(0, Math.min(100, Number(m.pct) || 0))}%`; }
                break;
            case 'compileBusy':
                setBusy(!!m.running);
                if (termState) { termState.textContent = m.running ? 'build berjalan…' : 'siap'; }
                if (stateEl && !m.running) { stateEl.textContent = 'selesai'; }
                break;
            case 'compileDone':
                if (m.ok) {
                    note(m.message || 'Installer MSI siap.', true);
                    if (termState) { termState.textContent = 'selesai'; }
                } else {
                    note(m.message || 'Build gagal — lihat terminal.', false);
                    if (termState) { termState.textContent = 'gagal'; }
                }
                break;
            case 'compileNote':
                note(m.text, !!m.ok);
                break;
            case 'compileStateLine':
                if (stateEl) { stateEl.textContent = m.text || ''; }
                break;
            case 'compileSite':
                note(`Website token dibuka di browser: ${m.url}`, true);
                break;
            case 'compileIcon':
                if (iconName) {
                    iconName.textContent = m.name
                        ? `${m.name}${m.size ? ` · ${(Number(m.size) / 1024).toFixed(0)} KB` : ''}`
                        : 'icon bawaan (logo Date Skunder)';
                }
                if (iconPreview) {
                    if (m.dataUrl) {
                        iconPreview.src = m.dataUrl;
                        iconPreview.hidden = false;
                    } else {
                        iconPreview.hidden = true;
                        iconPreview.removeAttribute('src');
                    }
                }
                break;
            case 'compileField':
                if (FIELDS[m.field]) { FIELDS[m.field].value = m.value; }
                break;
            case 'compileFocus': {
                const peta = { url: FIELDS.url, name: FIELDS.name, icon: $('cp-icon-pick'), token: tokenInput };
                const el = peta[m.kind];
                if (el && el.focus) { el.focus(); if (el.select) { el.select(); } }
                break;
            }
        }
    });

    renderSteps();
    renderQuota();
    vscode.postMessage({ type: 'ready' });
})();
