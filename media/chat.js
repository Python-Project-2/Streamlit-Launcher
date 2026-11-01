/* Chat AI Date Skunder: menjawab berbasis statistik berkas, teks tampil bertahap (bukan instan). */
(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    const elDot = $('dot');
    const elStatus = $('status');
    const elMsgs = $('msgs');
    const elModel = $('model');
    const elCtx = $('ctx');
    const elStats = $('stats');
    const elTa = $('ta');
    const elSend = $('send');
    const elAbort = $('abort');
    const btnScan = $('scan');
    const btnStart = $('start');
    const btnStop = $('stop');
    const btnClear = $('clear');
    const elScanInfo = $('scaninfo');
    const elMic = $('mic');
    const elTts = $('tts');
    const elVoice = $('voice');
    const elAutoListen = $('autolisten');
    const elVoiceState = $('voicestate');
    const elPersona = $('persona');
    const elPersonaCustom = $('persona-custom');
    const btnCopyAll = $('copyall');

    let busy = false;
    let queue = '';
    let frame = null;
    let typing = false;
    let cur = null;          // { wrap, bub, body }
    let pendingFinal = '';   // teks akhir dari ekstensi (sudah dirapikan) untuk balon yang sedang jalan
    let caret = null;
    let curRaw = '';
    let greeted = false;
    let lastInit = null;

    // ── keadaan suara ───────────────────────────────────────────────────────
    const DEFAULT_VOICE = {
        enabled: true, sttEngine: 'auto', ttsEngine: 'auto', autoSend: true, autoListen: false,
        listenSeconds: 12, language: 'id-ID', gender: 'female', voiceName: '', rate: 1, pitch: 1, volume: 1, systemStt: false,
    };
    let voiceCfg = Object.assign({}, DEFAULT_VOICE);
    let webVoices = [];          // suara dari speechSynthesis (browser/Electron)
    let systemVoices = [];       // suara sistem dari ekstensi (mis. SAPI Windows)
    let systemRecognizers = [];  // pengenal ucapan sistem yang terpasang
    let listening = false;
    let speakSeq = 0;            // penanda urutan bicara (agar jawaban lama tidak menimpa yang baru)
    let pendingSpeakResolve = null;
    let activeRec = null;

    const post = (m) => vscode.postMessage(m);

    function selectModel(modelPath) {
        const opts = Array.from(elModel.options || []);
        const hit = opts.find((o) => o.value === modelPath);
        if (hit) { hit.selected = true; return; }
        if (!opts.some((o) => o.value)) {
            const o = document.createElement('option');
            o.value = modelPath;
            o.textContent = modelPath.split(/[\\/]/).pop();
            o.title = modelPath;
            elModel.appendChild(o);
            elModel.value = modelPath;
        }
    }

    // ── util ────────────────────────────────────────────────────────────────
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function mdLite(src) {
        const blocks = [];
        const inline = (s) => esc(s)
            .replace(/\u0000B(\d+)\u0000/g, (m, n) => blocks[Number(n)] || '')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        let text = String(src).replace(/\r\n/g, '\n');
        text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (m, code) => {
            blocks.push('<pre><code>' + esc(String(code).replace(/\n$/, '')) + '</code></pre>');
            return '\u0000B' + (blocks.length - 1) + '\u0000';
        });

        const lines = text.split('\n');
        const html = [];
        let list = null;
        const closeList = () => { if (list) { html.push('</' + list + '>'); list = null; } };
        const cellParts = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\u0000B\d+\u0000$/.test(line.trim())) { closeList(); html.push(line.trim()); continue; }
            if (!line.trim()) { closeList(); continue; }

            if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]{3,}\|?\s*$/.test(lines[i + 1])) {
                closeList();
                const head = cellParts(line);
                i += 2;
                const rows = [];
                while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cellParts(lines[i])); i++; }
                i--;
                html.push('<table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'
                    + rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
                continue;
            }

            const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
            if (h) { closeList(); html.push('<h4>' + inline(h[1]) + '</h4>'); continue; }

            const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
            if (ul) {
                if (list !== 'ul') { closeList(); html.push('<ul>'); list = 'ul'; }
                html.push('<li>' + inline(ul[1]) + '</li>');
                continue;
            }
            const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
            if (ol) {
                if (list !== 'ol') { closeList(); html.push('<ol>'); list = 'ol'; }
                html.push('<li>' + inline(ol[1]) + '</li>');
                continue;
            }
            closeList();
            html.push('<p>' + inline(line) + '</p>');
        }
        closeList();
        return html.join('').replace(/\u0000B(\d+)\u0000/g, (m, n) => blocks[Number(n)] || '');
    }

    function nearBottom() {
        return elMsgs.scrollHeight - elMsgs.scrollTop - elMsgs.clientHeight < 48;
    }

    function toBottom(force) {
        if (force || nearBottom()) { elMsgs.scrollTop = elMsgs.scrollHeight; }
    }

    function newBubble(kind) {
        const wrap = document.createElement('div');
        wrap.className = 'ai-msg ' + kind;
        const bub = document.createElement('div');
        bub.className = 'ai-bubble';
        const body = document.createElement('span');
        body.className = 'ai-text';
        bub.appendChild(body);
        wrap.appendChild(bub);
        elMsgs.appendChild(wrap);
        toBottom(true);
        return { wrap, bub, body };
    }

    // ── animasi teks: tampil bertahap, tidak langsung muncul semua ──────────
    function pump() {
        frame = null;
        if (!queue.length) {
            if (!typing) { finishCurrent(); }
            return;
        }
        const step = Math.max(1, Math.min(24, Math.ceil(queue.length / 40)));
        curRaw += queue.slice(0, step);
        queue = queue.slice(step);
        if (cur) { cur.body.textContent = curRaw; }
        toBottom(false);
        frame = setTimeout(pump, 14);
    }

    function enqueue(text) {
        queue += text;
        if (!frame) { frame = setTimeout(pump, 12); }
    }

    function startAssistant() {
        cur = newBubble('assistant');
        curRaw = '';
        queue = '';
        typing = true;
        caret = document.createElement('span');
        caret.className = 'ai-caret';
        cur.bub.appendChild(caret);
    }

    /**
     * Tutup balon yang sedang jalan. Bila ekstensi mengirim teks akhir (sudah dirapikan dan bebas
     * duplikat), teks itulah yang dipakai — jadi tampilan akhir selalu sama dengan isi jawaban dan
     * tidak ada paragraf yang tercetak dua kali.
     */
    function finishCurrent(finalText) {
        if (!cur) { return; }
        if (caret && caret.parentNode) { caret.parentNode.removeChild(caret); }
        caret = null;
        const text = String(typeof finalText === 'string' && finalText.trim() ? finalText : (pendingFinal || curRaw));
        pendingFinal = '';
        curRaw = text;
        cur.body.innerHTML = mdLite(text);
        if (String(text).trim()) { attachActions(cur.bub, text); }
        toBottom(false);
        cur = null;
        typing = false;
    }

    /** Animasi mandiri untuk sapaan/pesan sistem agar tidak mengganggu aliran jawaban. */
    function typeInto(bubble, text, speedMs) {
        let i = 0;
        const step = Math.max(1, Math.ceil(text.length / 220));
        const timer = setInterval(() => {
            i = Math.min(text.length, i + step);
            bubble.body.textContent = text.slice(0, i);
            toBottom(false);
            if (i >= text.length) {
                clearInterval(timer);
                bubble.body.innerHTML = mdLite(text);
                toBottom(false);
            }
        }, speedMs || 12);
    }

    function say(kind, text, animate) {
        const b = newBubble(kind);
        if (animate) { typeInto(b, text, 10); }
        else { b.body.innerHTML = mdLite(text); toBottom(false); }
        if (kind === 'assistant') { attachActions(b.bub, text); }
        return b;
    }

    function setBusy(v) {
        busy = v;
        elSend.disabled = v;
        elAbort.hidden = !v;
    }

    // ── status server & daftar pilihan ──────────────────────────────────────
    function renderServer(msg) {
        const st = msg.status || { state: 'stopped', port: msg.port };
        const kind = st.state === 'running' ? 'on' : st.state === 'starting' ? 'busy' : st.state === 'error' ? 'err' : 'off';
        elDot.className = 'ai-dot ' + kind;
        const model = msg.model ? msg.model.split(/[\\/]/).pop() : null;
        const os = msg.os ? `${msg.os.platform}${msg.os.folder ? ` → folder "${msg.os.folder}/"` : ''}` : '';
        if (st.state === 'running') {
            elStatus.textContent = `${msg.external ? 'aktif di terminal' : 'aktif'} · port ${st.port}${model ? ` · ${model}` : ''}`;
        } else if (st.state === 'starting') {
            elStatus.textContent = `memuat model… ${model || ''}`;
        } else if (st.state === 'error') {
            elStatus.textContent = `error: ${st.message || 'lihat view LLAMA Server'}`;
        } else {
            elStatus.textContent = model ? `server berhenti · ${model}` : 'server berhenti · pilih model .gguf';
        }
        if (os) { elStatus.title = `OS terdeteksi: ${os}${(msg.binary || msg.os?.binary) ? `\nbiner: ${msg.binary || msg.os.binary}` : '\nbiner belum ditemukan'}`; }
        elModel.disabled = busy;
        btnStart.disabled = st.state === 'running' || st.state === 'starting';
        btnStop.disabled = !(st.state === 'running' || st.state === 'starting');
    }

    function fillModels(list, selected) {
        elModel.innerHTML = '';
        if (!list || !list.length) {
            const o = document.createElement('option');
            o.textContent = '⚠️ belum ada .gguf terdeteksi — mencari…';
            o.value = '';
            elModel.appendChild(o);
            return;
        }
        list.forEach((m) => {
            const o = document.createElement('option');
            o.value = m.path;
            o.textContent = `${m.name} · ${m.size}${m.multipart ? ' (multi-bagian)' : ''}`;
            o.title = m.path;
            if (selected && selected === m.path) { o.selected = true; }
            elModel.appendChild(o);
        });
    }

    // ── pencarian .gguf otomatis (folder umum → seluruh drive) ──────────────
    function progressText(p) {
        const where = p.phase === 'penuh' ? 'semua drive' : 'folder umum';
        const root = p.root ? ` · ${p.root.length > 44 ? '…' + p.root.slice(-44) : p.root}` : '';
        return `${where} · ${(p.dirs || 0).toLocaleString('id-ID')} folder · ${p.found || 0} model${root}`;
    }

    function setScanNote(text) {
        elScanInfo.hidden = false;
        elScanInfo.textContent = text;
    }

    function startScan(phase) {
        btnScan.disabled = true;
        setScanNote(phase === 'penuh'
            ? 'mencari berkas .gguf di seluruh penyimpanan (semua drive)…'
            : 'mencari berkas .gguf di folder umum…');
    }

    function scanSummary(m) {
        const count = (m.list || []).length;
        const p = m.progress;
        if (!p) { return `Pemindaian selesai: ${count} berkas .gguf ditemukan.`; }
        const tags = [
            p.phase === 'penuh' ? 'seluruh drive' : 'folder umum',
            `${(p.dirs || 0).toLocaleString('id-ID')} folder`,
            `${((p.elapsedMs || 0) / 1000).toFixed(1)} s`,
            p.timedOut ? 'batas waktu tercapai' : '',
            p.cancelled ? 'dibatalkan' : '',
        ].filter(Boolean).join(', ');
        return `${m.done ? 'Pemindaian' : 'Pemindaian awal'} selesai: ${count} berkas .gguf ditemukan (${tags}).`;
    }

    function updateScanNote(m) {
        const count = (m.list || []).length;
        if (!m.done && m.progress) { setScanNote(`mencari .gguf · ${progressText(m.progress)}`); return; }
        const where = m.progress && m.progress.phase === 'penuh' ? 'seluruh penyimpanan' : 'folder umum';
        setScanNote(count
            ? `${count} berkas .gguf · ${where}`
            : `belum ada .gguf terdeteksi · ${where}`);
        if (m.done) { btnScan.disabled = false; }
    }

    function fillContexts(items, active) {
        elCtx.innerHTML = '';
        if (!items || !items.length) {
            const o = document.createElement('option');
            o.textContent = 'belum ada analisis — buka berkas CSV/Excel dulu';
            o.value = '';
            elCtx.appendChild(o);
            return;
        }
        items.forEach((it) => {
            const o = document.createElement('option');
            o.value = it.id;
            const tags = [it.hasKpi ? 'KPI' : '', it.hasStock ? 'stok' : '', it.hasDecisionTree ? 'tree' : ''].filter(Boolean).join('+');
            o.textContent = `${it.label} · ${it.rows.toLocaleString('id-ID')} baris${tags ? ` · ${tags}` : ''}`;
            o.title = it.sheets.join(', ');
            if (active && active === it.id) { o.selected = true; }
            elCtx.appendChild(o);
        });
    }

    function greet(payload) {
        if (greeted) { return; }
        greeted = true;
        const hasModels = payload.models && payload.models.list && payload.models.list.length;
        const hasCtx = elCtx.options.length && elCtx.value;
        const lines = [
            '### Siap membantu',
            hasModels
                ? '1. Pilih berkas `.gguf` di daftar paling atas (hasil pencarian otomatis di seluruh penyimpanan).'
                : '1. Belum ada `.gguf` terdeteksi — pencarian otomatis di seluruh penyimpanan sedang berjalan; model yang baru diunduh muncul sendiri, atau tekan ⟳ untuk memindai ulang.',
            '2. Tekan **▶** untuk menjalankan llama-server (otomatis dijalankan saat kamu mengirim pesan).',
            hasCtx
                ? '3. Jawaban saya mengikuti statistik berkas yang dipilih di baris kedua.'
                : '3. Buka berkas CSV/Excel lewat Date Skunder agar statistiknya bisa dipakai sebagai konteks.',
            '',
            'Coba tanya: *“ringkas KPI utama”*, *“produk mana paling menguntungkan?”*, atau *“apa rekomendasi dari data stok?”*.',
            'Panel ini khusus percakapan. Untuk menjalankan aksi di halaman analisis, pakai pet **🕷️ Spider** di panel halaman itu (kolom instruksinya sendiri) — pet yang mengeksekusi, dan otak model yang menjelaskan hasilnya.',
        ];
        say('assistant', lines.join('\n'), true);
    }

    // ── suara: bicara → teks → jawaban → dibacakan (suara perempuan) ────────
    const FEMALE_RE = /gadis|zira|heera|female|wanita|dewi|siti|putri|aria|jenny|michelle|samantha|joanna|salli|damayanti|bahasa indonesia/i;
    let webRecText = '';
    let voiceHintShown = false;

    function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo)); }

    function refreshWebVoices() {
        try {
            webVoices = ('speechSynthesis' in window)
                ? Array.from(speechSynthesis.getVoices() || []).map((v) => ({ name: v.name, lang: v.lang, culture: v.lang, gender: '', engine: 'webview' }))
                : [];
        } catch (e) { webVoices = []; }
    }

    const allVoices = () => webVoices.concat(systemVoices);
    const isFemale = (v) => (v.gender ? /female|perempuan/i.test(v.gender) : FEMALE_RE.test(v.name || ''));

    /** Suara terpilih: pilihan pengguna → perempuan sebahasa → perempuan mana pun → suara pertama. */
    function activeVoice() {
        const list = allVoices();
        if (!list.length) { return null; }
        const prefer = (voiceCfg.voiceName || '').trim();
        if (prefer) { const hit = list.find((v) => v.name === prefer); if (hit) { return hit; } }
        const want = voiceCfg.gender === 'any' ? null : voiceCfg.gender === 'female';
        let pool = want === null ? list : list.filter((v) => isFemale(v) === want);
        if (!pool.length) { pool = list; }
        const lang = String(voiceCfg.language || 'id-ID').slice(0, 2).toLowerCase();
        const langHit = pool.filter((v) => String(v.lang || v.culture || '').toLowerCase().startsWith(lang));
        return langHit[0] || pool[0] || list[0];
    }

    function fillVoicePicker() {
        if (!elVoice) { return; }
        const list = allVoices();
        const active = activeVoice();
        elVoice.innerHTML = '';
        const auto = document.createElement('option');
        auto.value = '__auto';
        auto.textContent = active ? `Otomatis · ${active.name}` : 'Suara otomatis (bawaan sistem)';
        elVoice.appendChild(auto);
        list.forEach((v) => {
            const o = document.createElement('option');
            o.value = v.engine + '|' + v.name;
            const female = isFemale(v) ? ' · perempuan' : (v.gender ? ` · ${v.gender}` : '');
            o.textContent = `${v.name}${(v.lang || v.culture) ? ` · ${v.lang || v.culture}` : ''}${female}`;
            elVoice.appendChild(o);
        });
        const prefer = (voiceCfg.voiceName || '').trim();
        const hit = prefer ? list.find((v) => v.name === prefer) : null;
        elVoice.value = hit ? `${hit.engine}|${hit.name}` : '__auto';
        elVoice.title = list.length
            ? `${list.length} suara tersedia (webview ${webVoices.length} · sistem ${systemVoices.length})`
            : 'Belum ada daftar suara — suara bawaan sistem akan dipakai.';
    }

    function setVoiceState(state, detail) {
        if (!elVoiceState) { return; }
        const text = state === 'listening' ? `🎙️ mendengarkan… ${detail || ''}`
            : state === 'speaking' ? '🔊 berbicara…'
            : '';
        elVoiceState.hidden = !text;
        elVoiceState.textContent = text.trim();
    }

    function setListeningUI(on) {
        if (!elMic) { return; }
        elMic.classList.toggle('rec', !!on);
        elMic.textContent = on ? '⏹' : '🎙️';
        elMic.title = on ? 'Hentikan mendengar' : 'Bicara ke AI: suara → teks → dijawab → dibacakan suara';
    }

    function refreshTtsButton() {
        if (!elTts) { return; }
        const off = voiceCfg.ttsEngine === 'off';
        elTts.textContent = off ? '🔇' : '🔊';
        elTts.title = off ? 'Suara jawaban mati — klik untuk menyalakan' : 'Suara jawaban menyala — klik untuk mematikan';
    }

    function applyVoiceConfig(v) {
        voiceCfg = Object.assign({}, voiceCfg, v || {});
        if (elAutoListen) { elAutoListen.checked = !!voiceCfg.autoListen; }
        refreshTtsButton();
        refreshWebVoices();
        fillVoicePicker();
    }

    /** Markdown dibersihkan agar enak didengar (blok kode, tabel, dan tanda berlebih dibuang). */
    function plainForSpeech(src) {
        return String(src || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`([^`]*)`/g, '$1')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/^#{1,6}\s*/gm, '')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/^\s*[-*•]\s+/gm, ', ')
            .replace(/^\s*\d+[.)]\s+/gm, ', ')
            .replace(/\|/g, ' ')
            .replace(/[*_>#]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Potong jadi kalimat pendek: beberapa mesin suara memotong ucapan yang terlalu panjang. */
    function chunkText(text, maxLen) {
        const out = [];
        let buf = '';
        for (const part of String(text).split(/(?<=[.!?…;:])\s+/)) {
            if (!part) { continue; }
            if (buf && (buf + ' ' + part).length > maxLen) { out.push(buf); buf = part; }
            else { buf = buf ? `${buf} ${part}` : part; }
            while (buf.length > maxLen * 2) { out.push(buf.slice(0, maxLen)); buf = buf.slice(maxLen); }
        }
        if (buf.trim()) { out.push(buf.trim()); }
        return out.filter((x) => x.trim().length);
    }

    function stopSpeaking() {
        speakSeq++;
        if (pendingSpeakResolve) { const r = pendingSpeakResolve; pendingSpeakResolve = null; r(); }
        try { if ('speechSynthesis' in window) { speechSynthesis.cancel(); } } catch (e) { }
        post({ type: 'voiceSpeakStop' });
        setVoiceState(null);
    }

    /** Bacakan teks: suara webview bila ada, jika tidak lewat suara sistem di ekstensi. */
    async function speakText(text) {
        const clean = plainForSpeech(text);
        if (!clean || voiceCfg.ttsEngine === 'off') { return; }
        stopSpeaking();
        const seq = speakSeq;
        const voice = activeVoice();
        const useWeb = (voiceCfg.ttsEngine === 'webview' || voiceCfg.ttsEngine === 'auto')
            && ('speechSynthesis' in window) && (webVoices.length > 0 || voiceCfg.ttsEngine === 'webview');
        if (useWeb) { await speakWeb(clean, voice, seq); } else { await speakSystem(clean); }
        if (seq !== speakSeq) { return; }   // sudah diganti bicara yang lebih baru
        setVoiceState(null);
        if (elAutoListen && elAutoListen.checked) { startListening(); }
    }

    function speakWeb(text, voice, seq) {
        return new Promise((resolve) => {
            const synth = window.speechSynthesis;
            const chunks = chunkText(text, 220);
            const voices = synth.getVoices() || [];
            const picked = voice && voice.engine === 'webview' ? voices.find((v) => v.name === voice.name) : undefined;
            let i = 0;
            const next = () => {
                if (seq !== speakSeq || i >= chunks.length) { resolve(); return; }
                const u = new SpeechSynthesisUtterance(chunks[i++]);
                if (picked) { u.voice = picked; }
                u.lang = (picked && picked.lang) || voiceCfg.language || 'id-ID';
                u.rate = clamp(voiceCfg.rate, 0.5, 2);
                u.pitch = clamp(voiceCfg.pitch, 0, 2);
                u.volume = clamp(voiceCfg.volume, 0, 1);
                u.onend = next;
                u.onerror = next;
                setVoiceState('speaking');
                synth.speak(u);
            };
            next();
        });
    }

    function speakSystem(text) {
        return new Promise((resolve) => {
            pendingSpeakResolve = resolve;
            setVoiceState('speaking');
            post({ type: 'voiceSpeak', text });
        });
    }

    const webRecognitionCtor = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;

    function startListening() {
        if (listening) { return; }
        if (voiceCfg.sttEngine === 'off') { say('sys', 'Mikrofon dimatikan lewat pengaturan suara (voice.sttEngine).', false); return; }
        stopSpeaking();
        const Ctor = webRecognitionCtor();
        if (Ctor && voiceCfg.sttEngine !== 'system') { startWebRecognition(Ctor); return; }
        if (!voiceCfg.systemStt) {
            say('sys', '🎙️ Mendengar belum bisa dipakai di perangkat ini. Pengenalan ucapan sistem tersedia di Windows; pengenalan bawaan browser tidak aktif di webview VS Code.', false);
            return;
        }
        if (!voiceHintShown) {
            voiceHintShown = true;
            const want = voiceCfg.language || 'id-ID';
            if (!systemRecognizers.length) {
                say('sys', 'ℹ️ Belum ada pengenal ucapan sistem yang terpasang. Pasang lewat Windows → Settings → Time & language → Speech.', false);
            } else if (!systemRecognizers.some((c) => String(c).toLowerCase() === String(want).toLowerCase())) {
                say('sys', `ℹ️ Pengenal ucapan terpasang: ${systemRecognizers.join(', ')} (diminta ${want}). Hasilnya tetap bisa dipakai; pasang paket bahasa Indonesia agar lebih akurat.`, false);
            }
        }
        listening = true;
        setListeningUI(true);
        setVoiceState('listening');
        post({ type: 'voiceListen' });
    }

    function startWebRecognition(Ctor) {
        try {
            const rec = new Ctor();
            activeRec = rec;
            webRecText = '';
            rec.lang = voiceCfg.language || 'id-ID';
            rec.interimResults = true;
            rec.continuous = false;
            listening = true;
            setListeningUI(true);
            setVoiceState('listening');
            rec.onresult = (ev) => {
                let interim = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const r = ev.results[i];
                    if (r.isFinal) { webRecText += r[0].transcript; } else { interim += r[0].transcript; }
                }
                setVoiceState('listening', interim ? `“${interim.trim()}”` : '');
            };
            rec.onerror = (ev) => finishWebRecognition(ev && ev.error === 'aborted' ? '' : `Pengenalan suara gagal: ${(ev && ev.error) || 'tidak diketahui'}`);
            rec.onend = () => finishWebRecognition('');
            rec.start();
        } catch (e) {
            listening = false;
            setListeningUI(false);
            setVoiceState(null);
            say('sys', `🎙️ ${e instanceof Error ? e.message : String(e)}`, false);
        }
    }

    function finishWebRecognition(errorText) {
        if (!listening) { return; }
        listening = false;
        activeRec = null;
        setListeningUI(false);
        setVoiceState(null);
        const text = webRecText.trim();
        webRecText = '';
        if (errorText) { say('sys', `🎙️ ${errorText}`, false); return; }
        if (text) { handleVoiceText(text); }
    }

    /** Teks hasil suara: langsung dikirim, atau ditaruh di kotak pesan untuk dicek dulu. */
    function handleVoiceText(text) {
        const clean = String(text || '').trim();
        if (!clean) { return; }
        if (voiceCfg.autoSend) {
            doSend(clean);
        } else {
            elTa.value = clean;
            elTa.focus();
            elTa.dispatchEvent(new Event('input'));
            say('sys', '🎙️ Teks suara siap di kotak pesan — tekan Kirim bila sudah cocok.', false);
        }
    }

    /** Tombol 🎙️: mulai mendengar, atau hentikan bila sedang mendengarkan. */
    function voiceToggle() {
        if (listening) {
            listening = false;
            if (activeRec) { try { activeRec.abort(); } catch (e) { } activeRec = null; }
            setListeningUI(false);
            setVoiceState(null);
            post({ type: 'voiceAbort' });
            return;
        }
        startListening();
    }

    /** Tombol 🔊 kecil di balasan AI untuk membacakan ulang. */
    /** Salin teks ke papan klip: API modern dulu, lalu cadangan textarea (webview lama). */
    async function copyText(text) {
        const isi = String(text || '').trim();
        if (!isi) { return false; }
        try {
            await navigator.clipboard.writeText(isi);
            return true;
        } catch (e) { /* clipboard API diblokir → pakai cara cadangan */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = isi;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }

    /** Teks seluruh percakapan — dipakai tombol “salin semua”. */
    function transcriptText() {
        const baris = [];
        elMsgs.querySelectorAll('.ai-msg').forEach((wrap) => {
            const isi = wrap.querySelector('.ai-text');
            const teks = String(isi ? (isi.innerText || isi.textContent) : '').trim();
            if (!teks) { return; }
            const siapa = wrap.classList.contains('user') ? 'Kamu' : wrap.classList.contains('assistant') ? 'AI' : 'Sistem';
            baris.push(`${siapa}: ${teks}`);
        });
        return baris.join('\n\n');
    }

    /** Tombol kecil di balasan AI: 📋 salin jawaban dan 🔊 bacakan ulang. */
    function attachActions(bub, text) {
        const isi = () => (typeof text === 'function' ? text() : text);

        const speak = document.createElement('button');
        speak.type = 'button';
        speak.className = 'ai-speak';
        speak.textContent = '🔊';
        speak.title = 'Bacakan jawaban ini dengan suara';
        speak.onclick = (ev) => { ev.stopPropagation(); void speakText(isi()); };
        bub.appendChild(speak);

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'ai-speak';
        copy.textContent = '📋';
        copy.title = 'Salin jawaban ini ke papan klip';
        copy.onclick = async (ev) => {
            ev.stopPropagation();
            const ok = await copyText(isi());
            copy.textContent = ok ? '✅' : '⚠️';
            copy.title = ok ? 'Tersalin ke papan klip' : 'Gagal menyalin — blok teksnya lalu salin manual';
            setTimeout(() => { copy.textContent = '📋'; copy.title = 'Salin jawaban ini ke papan klip'; }, 1600);
        };
        bub.appendChild(copy);
    }

    /** Sifat AI: daftar pilihan + nilai tersimpan dari pengaturan ke pemilih di panel. */
    function applyPersona(p) {
        const opsi = Array.isArray(p && p.options) ? p.options : [];
        if (elPersona && opsi.length) {
            const aktif = String((p && p.persona) || 'netral');
            elPersona.innerHTML = opsi.map((o) => `<option value="${esc(o.id)}" title="${esc(o.sifat || '')}">${esc(o.label || o.id)}</option>`).join('');
            elPersona.value = opsi.some((o) => o.id === aktif) ? aktif : opsi[0].id;
            const terpilih = opsi.find((o) => o.id === elPersona.value);
            elPersona.title = terpilih && terpilih.sifat ? terpilih.sifat : 'Sifat (kepribadian) Chat AI';
        }
        if (elPersonaCustom) { elPersonaCustom.value = String((p && p.custom) || ''); }
    }

    // ── interaksi ───────────────────────────────────────────────────────────
    elTa.addEventListener('input', () => {
        elTa.style.height = 'auto';
        elTa.style.height = Math.min(132, elTa.scrollHeight) + 'px';
    });
    elTa.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
            ev.preventDefault();
            doSend();
        } else if (ev.key === 'Escape' && busy) {
            post({ type: 'abort' });
        }
    });
    elSend.addEventListener('click', () => doSend());
    elAbort.addEventListener('click', () => post({ type: 'abort' }));
    btnScan.addEventListener('click', () => post({ type: 'scan' }));
    btnStart.addEventListener('click', () => post({ type: 'start' }));
    btnStop.addEventListener('click', () => post({ type: 'stop' }));
    btnClear.addEventListener('click', () => post({ type: 'clear' }));
    elModel.addEventListener('change', () => post({ type: 'selectModel', path: elModel.value }));
    elCtx.addEventListener('change', () => post({ type: 'selectContext', id: elCtx.value }));
    if (btnCopyAll) {
        btnCopyAll.addEventListener('click', async () => {
            const teks = transcriptText();
            if (!teks) { say('sys', 'Belum ada percakapan untuk disalin.', false); return; }
            const ok = await copyText(teks);
            btnCopyAll.textContent = ok ? '✅' : '⚠️';
            btnCopyAll.title = ok ? `Tersalin (${teks.length} karakter)` : 'Gagal menyalin percakapan';
            setTimeout(() => { btnCopyAll.textContent = '📋'; btnCopyAll.title = 'Salin seluruh percakapan'; }, 1600);
        });
    }
    if (elPersona) {
        elPersona.addEventListener('change', () => {
            post({ type: 'persona', persona: elPersona.value });
            const opsi = [...elPersona.options].find((o) => o.value === elPersona.value);
            say('sys', `Sifat AI diubah ke “${opsi ? opsi.textContent : elPersona.value}”.`, false);
        });
    }
    if (elPersonaCustom) {
        elPersonaCustom.addEventListener('change', () => post({ type: 'persona', custom: elPersonaCustom.value }));
    }
    elStats.addEventListener('change', () => post({ type: 'stats', value: elStats.checked }));
    if (elMic) { elMic.addEventListener('click', () => voiceToggle()); }
    if (elTts) {
        elTts.addEventListener('click', () => {
            const turnOn = voiceCfg.ttsEngine === 'off';
            voiceCfg.ttsEngine = turnOn ? 'auto' : 'off';
            refreshTtsButton();
            if (turnOn) { say('sys', '🔊 Suara jawaban dinyalakan. Jawaban baru akan dibacakan otomatis.', false); }
            else { stopSpeaking(); }
            post({ type: 'voiceSetting', key: 'ttsEngine', value: voiceCfg.ttsEngine });
        });
    }
    if (elAutoListen) {
        elAutoListen.addEventListener('change', () => {
            voiceCfg.autoListen = !!elAutoListen.checked;
            post({ type: 'voiceSetting', key: 'autoListen', value: voiceCfg.autoListen });
        });
    }
    if (elVoice) {
        elVoice.addEventListener('change', () => {
            const val = elVoice.value || '__auto';
            const name = val === '__auto' ? '' : val.slice(val.indexOf('|') + 1);
            voiceCfg.voiceName = name;
            post({ type: 'voiceSetting', key: 'voiceName', value: name });
            fillVoicePicker();
        });
    }

    function doSend(preset) {
        // Hanya teks (mis. hasil suara) yang diterima sebagai preset — objek event dari klik tombol
        // tidak boleh ikut terkirim sebagai pesan (pernah muncul sebagai “[object PointerEvent]”).
        const text = (typeof preset === 'string' ? preset : elTa.value).trim();
        if (!text || busy) { return; }
        const b = newBubble('user');
        b.body.textContent = text;
        elTa.value = '';
        elTa.style.height = 'auto';
        setBusy(true);
        post({ type: 'send', text });
    }

    // ── pesan dari ekstensi ─────────────────────────────────────────────────
    window.addEventListener('message', (e) => {
        const m = e.data || {};
        switch (m.type) {
            case 'init':
                lastInit = m;
                if (m.voice) { applyVoiceConfig(m.voice); }
                if (m.persona) { applyPersona(m.persona); }
                fillModels(m.models?.list, m.models?.selected);
                if (typeof m.statsEnabled === 'boolean') { elStats.checked = m.statsEnabled; }
                elStatus.textContent = m.binary ? 'server berhenti · siap dijalankan' : 'biner llama-server belum ditemukan';
                if (m.models?.scanning) { startScan('ringkas'); }
                else { updateScanNote({ list: m.models?.list, done: true, scannedAt: m.models?.scannedAt }); }
                break;
            case 'scanStart':
                startScan(m.phase);
                break;
            case 'scanProgress':
                btnScan.disabled = true;
                setScanNote(`mencari .gguf · ${progressText(m)}`);
                break;
            case 'models':
                fillModels(m.list, elModel.value);
                updateScanNote(m);
                if (!m.quiet && (m.done || m.phase === 'ringkas')) { say('sys', scanSummary(m), false); }
                break;
            case 'contextList':
                fillContexts(m.items, m.active);
                if (!greeted) { greet(lastInit || {}); }
                break;
            case 'server':
                renderServer(m);
                if (m.model) { selectModel(m.model); }
                break;
            case 'assistantStart':
                // Balon lama (kalau ada) ditutup dulu → tidak ada dua balon jawaban yang tumpang tindih.
                if (cur) { finishCurrent(); }
                startAssistant();
                break;
            case 'delta':
                // Delta hanya diterima saat balon sedang mengetik → sisa aliran lama tidak ikut tampil.
                if (typing) { enqueue(String(m.text || '')); }
                break;
            case 'assistantEnd': {
                typing = false;
                const finalText = String(m.text || '');
                pendingFinal = finalText;
                if (!queue.length) { finishCurrent(); }
                setBusy(false);
                // Jawaban AI dibacakan otomatis bila suara menyala (teks akhir yang sudah dirapikan).
                if (finalText.trim() && voiceCfg.enabled && voiceCfg.ttsEngine !== 'off') { void speakText(finalText); }
                break;
            }
            case 'aborted':
                typing = false;
                pendingFinal = '';
                if (!queue.length) { finishCurrent(); }
                setBusy(false);
                break;
            case 'error':
                setBusy(false);
                typing = false;
                pendingFinal = '';
                if (cur && !curRaw) { cur.wrap.remove(); cur = null; }
                say('err', String(m.text || 'terjadi kesalahan'), false);
                break;
            case 'notice':
                say('sys', String(m.text || ''), false);
                break;
            case 'voiceStatus':
                if (m.state === 'listening') { listening = true; setListeningUI(true); setVoiceState('listening'); }
                else if (m.state === 'speaking') { setVoiceState('speaking'); }
                else { setVoiceState(null); }
                break;
            case 'voiceResult':
                listening = false;
                setListeningUI(false);
                setVoiceState(null);
                if (m.cancelled) { break; }
                if (m.ok && m.text) { handleVoiceText(String(m.text)); }
                else { say('sys', `🎙️ ${String(m.error || 'Ucapan tidak terdeteksi.')}`, false); }
                break;
            case 'persona':
                applyPersona(m);
                break;
            case 'voiceList':
                systemVoices = Array.isArray(m.voices) ? m.voices : [];
                systemRecognizers = Array.isArray(m.recognizers) ? m.recognizers : [];
                voiceCfg.systemStt = !!m.systemStt;
                refreshWebVoices();
                fillVoicePicker();
                break;
            case 'voiceConfig':
                applyVoiceConfig(m.voice);
                voiceCfg.systemStt = !!m.systemStt;
                break;
            case 'voiceSpeakDone': {
                const resolve = pendingSpeakResolve;
                pendingSpeakResolve = null;
                setVoiceState(null);
                if (!m.ok && m.error) { say('sys', `🔊 Suara sistem: ${String(m.error)}`, false); }
                if (resolve) { resolve(); }
                break;
            }
            case 'cleared':
                elMsgs.innerHTML = '';
                greeted = false;
                pendingFinal = '';
                say('sys', 'Percakapan dibersihkan.', false);
                break;
        }
    });

    refreshWebVoices();
    if ('speechSynthesis' in window) {
        try { speechSynthesis.onvoiceschanged = () => { refreshWebVoices(); fillVoicePicker(); }; } catch (e) { }
    }
    fillVoicePicker();
    refreshTtsButton();

    post({ type: 'ready' });
})();
