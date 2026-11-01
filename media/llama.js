/* View "LLAMA Server": status proses, tombol start/stop, tombol terminal,
   panel API terpisah, dan log yang mengalir real-time. */
(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    const elDot = $('dot');
    const elStatus = $('status');
    const elMeta = $('meta');
    const elLog = $('log');
    const elFollow = $('follow');
    const btnStart = $('start');
    const btnStop = $('stop');
    const btnClear = $('clear');
    const btnSettings = $('settings');
    const btnTerminal = $('terminal');

    const elApiBase = $('api-base');
    const elApiList = $('api-list');
    const elApiState = $('api-state');
    const elApiCurl = $('api-curl');
    const btnApiCopy = $('api-copy');
    const btnApiOpen = $('api-open');
    const btnApiCurl = $('api-copy-curl');

    const MAX_LINES = 3000;
    let lines = 0;
    /** Info API terakhir dari ekstensi: { base, openai, endpoints, curl }. */
    let api = null;

    const post = (m) => vscode.postMessage(m);

    function pill(text, cls, title) {
        const s = document.createElement('span');
        s.className = 'ai-pill' + (cls ? ' ' + cls : '');
        s.textContent = text;
        if (title) { s.title = title; }
        return s;
    }

    function render(msg) {
        const st = msg.status || { state: 'stopped' };
        const kind = st.state === 'running' ? 'on' : st.state === 'starting' ? 'busy' : st.state === 'error' ? 'err' : 'off';
        elDot.className = 'ai-dot ' + kind;

        const model = msg.modelLabel || (msg.model ? String(msg.model).split(/[\\/]/).pop() : '-');
        const port = st.port || msg.port;
        if (st.state === 'running' && msg.external) {
            elStatus.textContent = `aktif di terminal · http://127.0.0.1:${port}`;
        } else if (st.state === 'running') {
            elStatus.textContent = `aktif · PID ${st.pid ?? '-'} · http://127.0.0.1:${port}`;
        } else if (st.state === 'starting') {
            elStatus.textContent = `memuat model… (PID ${st.pid ?? '-'})`;
        } else if (st.state === 'stopping') {
            elStatus.textContent = 'menghentikan…';
        } else if (st.state === 'error') {
            elStatus.textContent = `error: ${st.message || 'lihat log'}`;
        } else {
            elStatus.textContent = 'server berhenti';
        }

        btnStart.disabled = st.state === 'running' || st.state === 'starting';
        btnStop.disabled = !(st.state === 'running' || st.state === 'starting' || st.state === 'stopping') && !msg.external;
        if (btnTerminal) {
            btnTerminal.classList.toggle('on', !!msg.terminal);
            btnTerminal.title = msg.terminal
                ? 'Server berjalan di terminal laptop — klik untuk membuka ulang terminal'
                : 'Jalankan llama-server di terminal laptop — log mentah di tab Terminal, API di panel “LLAMA API”';
        }

        elMeta.innerHTML = '';
        const os = msg.os || {};
        elMeta.appendChild(pill(`${os.platform || '?'}${os.folder ? ` → ${os.folder}/` : ''}`, os.folder ? 'ok' : 'bad',
            os.folder ? 'Folder biner sesuai OS terdeteksi' : 'OS belum didukung'));
        const bin = msg.binary || (os && os.binary);
        elMeta.appendChild(pill(bin ? 'biner siap' : 'biner tidak ditemukan', bin ? 'ok' : 'bad', bin || (os.candidates || [])[0]));
        elMeta.appendChild(pill(`port ${msg.port}`, '', 'Port HTTP llama-server'));
        elMeta.appendChild(pill(`ctx ${msg.contextSize}`, '', 'Ukuran konteks (-c)'));
        if (msg.gpuLayers) { elMeta.appendChild(pill(`ngl ${msg.gpuLayers}`, '', 'Lapisan GPU (-ngl)')); }
        elMeta.appendChild(pill(model, msg.modelExists ? 'ok' : 'bad', msg.model || 'Pilih model di view Chat AI'));
        if (msg.external) { elMeta.appendChild(pill('terminal', 'ok', 'Proses dijalankan di terminal laptop, bukan di extension host')); }

        renderApi(msg);
    }

    /** Panel API: alamat, endpoint yang bisa diklik untuk disalin, dan contoh curl. */
    function renderApi(msg) {
        api = msg.api || api;
        if (!api) { return; }
        const running = !!(msg.status && msg.status.state === 'running');

        if (elApiBase) { elApiBase.textContent = api.base || ''; }
        if (elApiCurl) { elApiCurl.textContent = api.curl || ''; }
        if (elApiState) {
            elApiState.textContent = running ? 'aktif' : 'belum berjalan';
            elApiState.className = 'ai-api-state' + (running ? ' on' : '');
        }
        if (elApiList) {
            elApiList.textContent = '';
            (api.endpoints || []).forEach((ep) => {
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'ai-ep';
                row.title = `Salin ${api.base}${ep.path}${ep.hint ? ' — ' + ep.hint : ''}`;
                const code = document.createElement('code');
                code.textContent = ep.path;
                const label = document.createElement('span');
                label.textContent = ep.label || '';
                row.appendChild(code);
                row.appendChild(label);
                row.addEventListener('click', () => post({ type: 'copy', text: api.base + ep.path, label: ep.path }));
                elApiList.appendChild(row);
            });
        }
        if (btnApiCopy) { btnApiCopy.disabled = !running; }
        if (btnApiOpen) { btnApiOpen.disabled = !running; }
        if (btnApiCurl) { btnApiCurl.disabled = !running; }
    }

    function appendLog(line) {
        const cls = /error|failed|abort/i.test(line) ? 'ln-err'
            : /warn/i.test(line) ? 'ln-warn'
                : /^(llama-server|main:|build:|system_info)/.test(line) ? 'ln-dim' : '';
        const span = document.createElement('span');
        if (cls) { span.className = cls; }
        span.textContent = line + '\n';
        elLog.appendChild(span);
        lines++;
        if (lines > MAX_LINES) {
            while (lines > MAX_LINES && elLog.firstChild) {
                elLog.removeChild(elLog.firstChild);
                lines--;
            }
        }
        if (elFollow.checked) { elLog.scrollTop = elLog.scrollHeight; }
    }

    window.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'status') {
            render(m);
            if (m.logs && m.logs.length && !lines) {
                m.logs.forEach(appendLog);
            }
        } else if (m.type === 'log') {
            appendLog(String(m.line || ''));
        } else if (m.type === 'clear') {
            elLog.textContent = '';
            lines = 0;
        } else if (m.type === 'notice') {
            appendLog(`[ext] ${m.text}`);
        }
    });

    btnStart.addEventListener('click', () => post({ type: 'start' }));
    btnStop.addEventListener('click', () => post({ type: 'stop' }));
    btnClear.addEventListener('click', () => post({ type: 'clear' }));
    btnSettings.addEventListener('click', () => post({ type: 'settings' }));
    if (btnTerminal) { btnTerminal.addEventListener('click', () => post({ type: 'terminal' })); }
    if (btnApiCopy) { btnApiCopy.addEventListener('click', () => post({ type: 'copy', text: api ? api.base : '', label: 'alamat API' })); }
    if (btnApiOpen) { btnApiOpen.addEventListener('click', () => post({ type: 'open', url: api ? api.base : '' })); }
    if (btnApiCurl) { btnApiCurl.addEventListener('click', () => post({ type: 'copy', text: api ? api.curl : '', label: 'contoh curl' })); }

    post({ type: 'ready' });
})();
