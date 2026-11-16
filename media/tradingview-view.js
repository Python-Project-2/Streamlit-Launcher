/* TradingView view (sidebar) — chart mini, kartu sinyal, chat Trading AI, console sendiri. */
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    const eSymbol = $('tv-symbol');
    const eGo = $('tv-go');
    const eAc = $('tv-ac');
    const eQuote = $('tv-quote');
    const eChart = $('tv-chart');
    const eSignal = $('tv-signal');
    const eArah = $('tv-arah');
    const eSinyal = $('tv-sinyal');
    const eKeyakinan = $('tv-keyakinan');
    const eEntry = $('tv-entry');
    const eStop = $('tv-stop');
    const eTp1 = $('tv-tp1');
    const eTp2 = $('tv-tp2');
    const eRr = $('tv-rr');
    const eRsi = $('tv-rsi');
    const eAlasan = $('tv-alasan');
    const eChat = $('tv-chat');
    const eAsk = $('tv-ask');
    const eSend = $('tv-send');
    const eAi = $('tv-ai');
    const eAiToggle = $('tv-ai-toggle');
    const eStopBtn = $('tv-stop');
    const eState = $('tv-state');
    const eSesi = $('tv-sesi');
    const eLive = $('tv-live');
    const eTermLog = $('tv-term-log');
    const eTermCmd = $('tv-term-cmd');
    const eTermState = $('tv-term-state');
    const eModel = $('tv-model');
    const eModelScan = $('tv-model-scan');
    const eModelPick = $('tv-model-pick');
    const eNewChat = $('tv-new-chat');
    const eHistoryBtn = $('tv-history-btn');
    const eHistory = $('tv-history');
    const eCommFeed = $('tv-comm-feed');
    const eCommAsk = $('tv-comm-ask');
    const eCommSend = $('tv-comm-send');
    const eCommRefresh = $('tv-comm-refresh');
    const eCommPartners = $('tv-comm-partners');
    const eCommState = $('tv-comm-state');

    let symbol = 'IDX:BBCA';
    let lastTeknik = null;
    let aiState = { state: 'stopped', port: 0, model: '', ready: false };
    let busy = false;
    let streaming = null;
    let modelKey = '';

    // ── util ────────────────────────────────────────────────────────────────
    const esc = (s) => String(s == null ? '' : s);
    /** Isi elemen dengan teks ber-Markdown (bold/italic/kode) atau teks biasa bila perender belum ada. */
    function mdInto(el, text) {
        if (window.SkunderMd) { el.appendChild(window.SkunderMd.inline(String(text == null ? '' : text))); }
        else { el.textContent = esc(text); }
    }
    const nf = (n, d) => (typeof n === 'number' && isFinite(n)
        ? n.toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 })
        : '—');

    function harga(n) {
        if (typeof n !== 'number' || !isFinite(n)) { return '—'; }
        const curr = lastTeknik && lastTeknik.currency;
        const d = Math.abs(n) >= 100 ? 0 : 2;
        return n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d })
            + (curr && curr !== 'IDR' ? ' ' + curr : '');
    }

    function isLight() {
        return document.body.classList.contains('vscode-light')
            || document.body.classList.contains('vscode-high-contrast-light');
    }

    // ── chart mini TradingView ──────────────────────────────────────────────
    function buildChart(sym) {
        if (!eChart) { return; }
        const settings = {
            symbol: sym,
            dateRange: '3M',
            isTransparent: true,
            autosize: true,
            largeChartUrl: '',
            colorTheme: isLight() ? 'light' : 'dark',
        };
        const src = 'https://www.tradingview-widget.com/embed-widget/mini-symbol-overview/?locale=id'
            + '&symbol=' + encodeURIComponent(sym)
            + '#' + encodeURIComponent(JSON.stringify(settings));
        eChart.textContent = '';
        const frame = document.createElement('iframe');
        frame.setAttribute('scrolling', 'no');
        frame.setAttribute('frameborder', '0');
        frame.setAttribute('allowtransparency', 'true');
        frame.setAttribute('title', 'TradingView mini chart');
        frame.src = src;
        eChart.appendChild(frame);
    }

    // ── kartu sinyal ────────────────────────────────────────────────────────
    function renderSignal(t) {
        lastTeknik = t;
        eSignal.hidden = false;
        const arah = String(t.arah || '').toUpperCase();
        const sinyal = String(t.sinyal || '').toUpperCase();
        eArah.textContent = 'ARAH ' + (arah || '—');
        eArah.className = 'tv-badge ' + (arah === 'NAIK' ? 'up' : arah === 'TURUN' ? 'down' : 'hold');
        eSinyal.textContent = sinyal || '—';
        eSinyal.className = 'tv-badge ' + (sinyal === 'BUY' ? 'up' : sinyal === 'SELL' ? 'down' : 'hold');
        const skor = Number(t.skor) || 0;
        eKeyakinan.textContent = 'skor ' + (skor >= 0 ? '+' : '') + skor;
        eEntry.textContent = harga(t.entry);
        eStop.textContent = harga(t.stop);
        eTp1.textContent = harga(t.tp1);
        eTp2.textContent = harga(t.tp2);
        eRr.textContent = t.rr ? '1 : ' + nf(t.rr, 2) : '—';
        eRsi.textContent = t.rsi === null || t.rsi === undefined ? '—' : nf(t.rsi, 1);

        const rows = Array.isArray(t.alasan) ? t.alasan : [];
        eAlasan.textContent = '';
        rows.slice(0, 6).forEach((text, i) => {
            const div = document.createElement('div');
            const no = document.createElement('i');
            no.textContent = (i + 1) + '.';
            const span = document.createElement('span');
            span.textContent = esc(text);
            div.append(no, span);
            eAlasan.appendChild(div);
        });
    }

    function renderQuote(t, meta) {
        const up = Number(t.changePct) >= 0;
        eQuote.textContent = '';
        const b = document.createElement('b');
        b.textContent = harga(t.last);
        const chg = document.createElement('span');
        chg.className = up ? 'up' : 'down';
        chg.textContent = ' ' + (up ? '+' : '') + nf(t.changePct, 2) + '%';
        const info = document.createElement('span');
        info.className = 'muted';
        info.textContent = ' · ' + t.symbol + ' · ' + nf(t.bars, 0) + ' bar · ' + (t.currency || '')
            + (meta && meta.waktu ? ' · ' + meta.waktu : '');
        eQuote.append(b, chg, info);
    }

    // ── chat ────────────────────────────────────────────────────────────────
    function bubble(role, text) {
        const div = document.createElement('div');
        div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
        div.textContent = esc(text);
        eChat.appendChild(div);
        eChat.scrollTop = eChat.scrollHeight;
        return div;
    }

    /** Daftar percakapan tersimpan (klik untuk memuat konteks lama). */
    function renderSessions(list) {
        if (!eHistory) { return; }
        eHistory.textContent = '';
        const rows = Array.isArray(list) ? list : [];
        if (eCommSend) {
        const sendComm = () => {
            const text = String(eCommAsk && eCommAsk.value || '').trim();
            if (!text) { return; }
            post({ type: 'communityAsk', text });
            if (eCommAsk) { eCommAsk.value = ''; }
        };
        eCommSend.addEventListener('click', sendComm);
        if (eCommAsk) {
            eCommAsk.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); sendComm(); }
            });
        }
        if (eCommRefresh) { eCommRefresh.addEventListener('click', () => post({ type: 'community' })); }
    }

    if (eHistoryBtn) {
            eHistoryBtn.textContent = rows.length ? `🕘 Riwayat (${rows.length})` : '🕘 Riwayat';
        }
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'tv-hist-empty';
            empty.textContent = 'Belum ada riwayat percakapan.';
            eHistory.appendChild(empty);
            return;
        }
        rows.forEach((s) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tv-hist-item';
            const title = document.createElement('b');
            title.textContent = s.title || 'Percakapan';
            const meta = document.createElement('span');
            const when = s.at ? new Date(s.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
            meta.textContent = [s.symbol, (s.count || 0) + ' pesan', when].filter(Boolean).join(' · ');
            b.append(title, meta);
            b.onclick = () => {
                post({ type: 'loadSession', id: s.id });
                if (eHistory) { eHistory.hidden = true; }
            };
            eHistory.appendChild(b);
        });
    }

    // ── Community AI (partner acak, database/comunity.txt) ───────────────
    function commTime(at) {
        if (!at) { return ''; }
        return new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

    function appendCommunity(msg) {
        if (!eCommFeed || !msg || !msg.text) { return; }
        const row = document.createElement('div');
        row.className = 'tv-comm-msg ' + (msg.role === 'user' ? 'user' : 'partner')
            + (msg.signal ? ' ' + String(msg.signal).toLowerCase() : '');
        const head = document.createElement('div');
        head.className = 'tv-comm-head';
        const name = document.createElement('b');
        name.textContent = msg.name || (msg.role === 'user' ? 'Kamu' : 'Partner');
        const time = document.createElement('span');
        time.className = 'tv-comm-time';
        time.textContent = commTime(msg.at);
        head.append(name, time);
        if (msg.signal) {
            const sig = document.createElement('span');
            sig.className = 'tv-comm-sig ' + String(msg.signal).toLowerCase();
            sig.textContent = msg.signal;
            head.appendChild(sig);
        }
        const text = document.createElement('div');
        text.className = 'tv-comm-text';
        text.textContent = msg.text;
        row.append(head, text);
        eCommFeed.appendChild(row);
        while (eCommFeed.childElementCount > 300) { eCommFeed.removeChild(eCommFeed.firstChild); }
        eCommFeed.scrollTop = eCommFeed.scrollHeight;
    }

    function renderCommunity(list) {
        if (!eCommFeed) { return; }
        eCommFeed.textContent = '';
        const rows = Array.isArray(list) ? list : [];
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'tv-comm-empty';
            empty.textContent = 'Belum ada chat. Partner akan mengumumkan sinyal otomatis saat analisa berjalan.';
            eCommFeed.appendChild(empty);
            return;
        }
        rows.forEach(appendCommunity);
    }

    /** Pisahkan jawaban LLM (ARAH/SINYAL/ENTRY/…/ALASAN/RISIKO) menjadi blok terstruktur. */
    const KNOWN_KEYS = ['STOP LOSS', 'R:R', 'TP1', 'TP2', 'ENTRY', 'ARAH', 'SINYAL', 'KEYAKINAN', 'ALASAN', 'RISIKO'];

    /** Kunci dikenal lebih dulu (agar “R:R: 1:2,0” dan “TP1: …” tidak salah pisah). */
    function splitKey(line) {
        const up = line.toUpperCase();
        for (const k of KNOWN_KEYS) {
            if (up.indexOf(k + ':') === 0) {
                return { key: k, val: line.slice(k.length + 1).trim() };
            }
        }
        const m = line.match(/^([A-Za-z][A-Za-z0-9 .]{0,20}?)\s*:\s*(.*)$/);
        return m ? { key: m[1].toUpperCase(), val: m[2].trim() } : null;
    }

    function parseAnswer(text) {
        const kv = {};
        const alasan = [];
        const risiko = [];
        let mode = '';
        String(text || '').split(/\r?\n/).forEach((raw) => {
            const line = raw.trim();
            if (!line) { return; }
            const kvp = splitKey(line);
            if (kvp) {
                if (kvp.key === 'ALASAN') { mode = 'alasan'; if (kvp.val) { alasan.push(kvp.val); } return; }
                if (kvp.key === 'RISIKO') { mode = 'risiko'; if (kvp.val) { risiko.push(kvp.val); } return; }
                kv[kvp.key] = kvp.val;
                mode = '';
                return;
            }
            const item = line.replace(/^[-•*]\s*/, '');
            if (mode === 'risiko') { risiko.push(item); }
            else if (mode === 'alasan') { alasan.push(item); }
            else { kv._extra = (kv._extra || '') + (kv._extra ? ' ' : '') + item; }
        });
        return { kv, alasan, risiko };
    }

    /** Kunci yang isinya kalimat panjang → ditampilkan sebagai blok penuh, bukan baris label–nilai. */
    const WIDE_KEYS = ['JAWABAN', 'KAITAN TRADING', 'CATATAN RISIKO', 'SARAN', 'CATATAN', 'RINGKASAN'];

    function renderAi(div, text) {
        const { kv, alasan, risiko } = parseAnswer(text);
        const keys = Object.keys(kv).filter((k) => k !== '_extra');
        if (!keys.length && !alasan.length && !risiko.length) {
            if (window.SkunderMd) { window.SkunderMd.block(div, text); } else { div.textContent = esc(text); }
            return;
        }
        div.textContent = '';
        if (keys.length) {
            const grid = document.createElement('div');
            grid.className = 'kv';
            keys.forEach((k) => {
                const isi = String(kv[k] || '');
                if (WIDE_KEYS.indexOf(k) >= 0 || isi.length > 48) {
                    const row = document.createElement('div');
                    row.className = 'wide';
                    const label = document.createElement('span');
                    label.textContent = k.replace(/_/g, ' ');
                    const val = document.createElement('b');
                    mdInto(val, isi);
                    row.append(label, val);
                    grid.appendChild(row);
                    return;
                }
                const label = document.createElement('span');
                label.textContent = k.replace(/_/g, ' ');
                const val = document.createElement('b');
                mdInto(val, isi);
                const v = isi.toUpperCase();
                if (k === 'SINYAL' || k === 'ARAH') {
                    val.className = /BUY|NAIK/.test(v) ? 'buy' : /SELL|TURUN/.test(v) ? 'sell' : 'hold';
                }
                grid.append(label, val);
            });
            div.appendChild(grid);
        }
        const list = (title, items, cls) => {
            if (!items.length) { return; }
            const h = document.createElement('div');
            h.className = 'muted';
            h.textContent = title;
            h.style.marginTop = '5px';
            const ul = document.createElement('ul');
            ul.className = cls || '';
            items.slice(0, 6).forEach((it) => {
                const li = document.createElement('li');
                mdInto(li, it);
                ul.appendChild(li);
            });
            div.append(h, ul);
        };
        list('Alasan', alasan);
        list('Risiko', risiko);
        if (kv._extra) {
            const p = document.createElement('div');
            p.className = 'muted';
            p.style.marginTop = '5px';
            mdInto(p, kv._extra);
            div.appendChild(p);
        }
    }

    // ── terminal ────────────────────────────────────────────────────────────
    const MAX_LOG = 400;

    function appendLog(text, kind) {
        const line = document.createElement('div');
        line.className = 'l-' + (kind || 'out');
        line.textContent = esc(text);
        eTermLog.appendChild(line);
        while (eTermLog.childElementCount > MAX_LOG) { eTermLog.removeChild(eTermLog.firstChild); }
        eTermLog.scrollTop = eTermLog.scrollHeight;
    }

    // ── keadaan ─────────────────────────────────────────────────────────────
    function setBusy(on) {
        busy = !!on;
        eGo.disabled = busy;
        eSend.disabled = busy;
        eGo.textContent = busy ? '…' : 'Analisa';
        eState.textContent = busy ? 'menganalisa…' : (aiState.ready ? 'AI siap' : 'siap');
        eState.className = 'tv-chip' + (busy ? '' : aiState.ready ? ' ok' : '');
    }

    function setAi(a) {
        aiState = Object.assign({ state: 'stopped', port: 0, model: '', ready: false }, a || {});
        const ready = aiState.ready || aiState.state === 'running';
        const starting = aiState.state === 'starting';
        eAiToggle.textContent = starting ? 'Memuat…' : (ready ? 'Hentikan' : 'Nyalakan');
        eAiToggle.disabled = starting;
        eAi.textContent = 'otak terpisah · port ' + aiState.port + ' · model ' + (aiState.model || '—')
            + ' · ' + (ready ? 'siap' : (aiState.state === 'starting' ? 'memuat model…' : (aiState.state || 'berhenti')))
            + (aiState.external ? ' · di terminal' : '');
        eAiToggle.dataset.on = ready ? '1' : '';
        eState.textContent = busy ? 'menganalisa…' : (ready ? 'AI siap' : 'siap');
        eState.className = 'tv-chip' + (ready ? ' ok' : '');
        renderModels(aiState.models, aiState.modelPath);
    }

    /** Daftar model .gguf untuk otak trading (dipilih dari hasil pindai otak trading sendiri). */
    function renderModels(models, selected) {
        if (!eModel) { return; }
        const list = Array.isArray(models) ? models : [];
        const key = list.map((m) => m.path).join('|');
        if (key !== modelKey) {
            modelKey = key;
            eModel.textContent = '';
            if (!list.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '(belum ada berkas .gguf — tekan ⟳)';
                eModel.appendChild(opt);
            }
            list.forEach((m) => {
                const opt = document.createElement('option');
                opt.value = m.path;
                opt.textContent = m.name + (m.size ? ' · ' + m.size : '');
                opt.title = m.path;
                eModel.appendChild(opt);
            });
        }
        const target = selected || (aiState && aiState.modelPath) || '';
        if (target) {
            const hit = Array.prototype.some.call(eModel.options, (o) => o.value === target);
            if (hit) { eModel.value = target; }
        }
    }

    // ── pencarian simbol ────────────────────────────────────────────────────
    function paintAc() {
        const kata = String(eSymbol.value || '').trim();
        const katalog = window.SkunderSaham;
        if (!katalog) { eAc.hidden = true; return; }
        const hasil = katalog.cari(kata, 30);
        if (!hasil.length) { eAc.hidden = true; return; }
        eAc.textContent = '';
        hasil.forEach((it) => {
            const b = document.createElement('button');
            b.type = 'button';
            const k = document.createElement('span');
            k.className = 'k';
            k.textContent = String(it[0]).split(':').pop();
            const n = document.createElement('span');
            n.className = 'n';
            n.textContent = it[1] || '';
            b.append(k, n);
            b.onclick = () => {
                eSymbol.value = it[0];
                eAc.hidden = true;
                post({ type: 'symbol', symbol: it[0] });
            };
            eAc.appendChild(b);
        });
        eAc.hidden = false;
    }

    function post(msg) { vscode.postMessage(msg); }

    function runAnalyze() {
        const v = String(eSymbol.value || '').trim();
        if (v) { post({ type: 'symbol', symbol: v }); }
        if (window.SkunderSaham) {
            const hit = window.SkunderSaham.byCode(v.toUpperCase());
            if (!hit && /^[A-Z]{4}$/.test(v.toUpperCase())) { eSymbol.value = 'IDX:' + v.toUpperCase(); }
        }
        post({ type: 'analyze' });
    }

    // ── event UI ────────────────────────────────────────────────────────────
    eSymbol.addEventListener('input', paintAc);
    eSymbol.addEventListener('focus', paintAc);
    eSymbol.addEventListener('blur', () => setTimeout(() => { eAc.hidden = true; }, 150));
    eSymbol.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { eAc.hidden = true; runAnalyze(); }
        if (e.key === 'Escape') { eAc.hidden = true; }
    });
    eGo.addEventListener('click', runAnalyze);

    eSend.addEventListener('click', sendAsk);
    eAsk.addEventListener('keydown', (e) => { if (e.key === 'Enter') { sendAsk(); } });

    function sendAsk() {
        const text = String(eAsk.value || '').trim();
        if (!text) { return; }
        eAsk.value = '';
        post({ type: 'ask', text });
    }

    eAiToggle.addEventListener('click', () => {
        const on = eAiToggle.dataset.on === '1';
        post({ type: 'server', action: on ? 'stop' : 'start' });
    });

    eStopBtn.addEventListener('click', () => post({ type: 'stop' }));
    const eFull = $('tv-full');
    if (eFull) { eFull.addEventListener('click', () => post({ type: 'fullscreen' })); }
    const eScreen = $('tv-screen');
    if (eScreen) { eScreen.addEventListener('click', () => post({ type: 'screen' })); }
    const eServer = $('tv-srv');
    if (eServer) { eServer.addEventListener('click', () => post({ type: 'serverTerminal' })); }
    $('tv-term-open').addEventListener('click', () => post({ type: 'terminalOpen' }));
    const eTermSrv = $('tv-term-srv');
    if (eTermSrv) { eTermSrv.addEventListener('click', () => post({ type: 'serverTerminal' })); }
    $('tv-term-clear').addEventListener('click', () => { eTermLog.textContent = ''; });
    if (eModel) {
        eModel.addEventListener('change', () => {
            const path = String(eModel.value || '');
            if (!path) { return; }
            appendLog('Model otak trading → ' + path.split(/[\\/]/).pop(), 'info');
            post({ type: 'model', path });
        });
    }
    if (eModelScan) {
        eModelScan.addEventListener('click', () => {
            eModelScan.disabled = true;
            appendLog('Memindai berkas .gguf untuk otak trading…', 'info');
            post({ type: 'modelsRefresh' });
        });
    }
    if (eModelPick) {
        eModelPick.addEventListener('click', () => post({ type: 'modelPick' }));
    }
    if (eNewChat) {
        eNewChat.addEventListener('click', () => {
            post({ type: 'newChat' });
            if (eHistory) { eHistory.hidden = true; }
        });
    }
    if (eHistoryBtn) {
        eHistoryBtn.addEventListener('click', () => {
            if (!eHistory) { return; }
            eHistory.hidden = !eHistory.hidden;
            if (!eHistory.hidden) { post({ type: 'history' }); }
        });
    }
    eTermCmd.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') { return; }
        const line = String(eTermCmd.value || '').trim();
        if (!line) { return; }
        eTermCmd.value = '';
        appendLog('trading> ' + line, 'cmd');
        post({ type: 'terminalCmd', line });
    });

    // ── pesan dari ekstensi ─────────────────────────────────────────────────
    window.addEventListener('message', (ev) => {
        const m = ev.data || {};
        switch (m.type) {
            case 'init':
                symbol = m.symbol || symbol;
                eSymbol.value = symbol;
                eSesi.textContent = m.sesi || '—';
                if (eLive) { eLive.textContent = Number(m.live) > 0 ? 'auto ' + Number(m.live) + 's' : 'auto mati'; }
                setAi(m.ai);
                buildChart(symbol);
                appendLog('TradingView siap · simbol ' + symbol + ' · sesi ' + (m.sesi || '-'), 'ok');
                post({ type: 'dataOnly' });
                break;
            case 'symbol':
                symbol = m.symbol || symbol;
                eSymbol.value = symbol;
                buildChart(symbol);
                eSignal.hidden = true;
                eQuote.textContent = 'Memuat ' + symbol + '…';
                appendLog('Simbol → ' + symbol, 'info');
                break;
            case 'quote':
                renderQuote(m.teknik, m);
                renderSignal(m.teknik);
                if (m.sesi) { eSesi.textContent = m.sesi; }
                if (m.teknik && m.teknik.symbol) { symbol = m.teknik.symbol; }
                break;
            case 'answerStart':
                streaming = bubble('ai', '…');
                streaming.classList.add('thinking');
                break;
            case 'chunk':
                if (streaming) {
                    streaming.classList.remove('thinking');
                    streaming.textContent = (streaming.dataset.raw || '') + m.text;
                    streaming.dataset.raw = streaming.textContent;
                    eChat.scrollTop = eChat.scrollHeight;
                }
                break;
            case 'answer':
                if (streaming) {
                    const node = streaming;
                    streaming = null;
                    if (m.text) { renderAi(node, m.text); }
                    else { node.textContent = 'Tidak ada jawaban.'; }
                    eChat.scrollTop = eChat.scrollHeight;
                } else if (m.text) {
                    renderAi(bubble('ai', ''), m.text);
                }
                break;
            case 'busy':
                setBusy(m.on);
                break;
            case 'ai':
                setAi(m.ai);
                break;
            case 'models':
                renderModels(m.models, m.selected);
                if (eModelScan) { eModelScan.disabled = false; }
                break;
            case 'sessions':
                renderSessions(m.sessions);
                break;
            case 'community':
                renderCommunity(m.messages);
                if (eCommPartners && m.partners) { eCommPartners.textContent = 'partner: ' + m.partners.join(', '); }
                if (eCommState && m.file) { eCommState.textContent = 'database/' + String(m.file).split(/[\\/]/).pop(); }
                break;
            case 'communityAdd':
                appendCommunity(m.message);
                break;
            case 'communityThink':
                if (eCommState) {
                    eCommState.textContent = m.on
                        ? (m.name ? m.name + ' sedang mengetik…' : 'partner sedang mengetik…')
                        : 'tersimpan di database/comunity.txt';
                }
                break;
            case 'question':
                bubble('user', m.text);
                break;
            case 'chatLoaded':
                eChat.textContent = '';
                (m.messages || []).forEach((msg) => {
                    if (msg.role === 'user') { bubble('user', msg.content); }
                    else { renderAi(bubble('ai', ''), msg.content); }
                });
                if (m.symbol) {
                    const changed = m.symbol !== symbol;
                    symbol = m.symbol;
                    eSymbol.value = symbol;
                    if (changed) { buildChart(symbol); }
                }
                appendLog('Riwayat dimuat · ' + (m.session || '') + ' · ' + (m.messages || []).length + ' pesan', 'ok');
                break;
            case 'error':
                appendLog(String(m.text || 'galat'), 'err');
                if (streaming) { streaming.remove(); streaming = null; }
                bubble('ai', '⚠ ' + String(m.text || 'galat'));
                break;
            case 'log':
                appendLog(m.text, m.kind);
                break;
            case 'chatReset':
                eChat.textContent = '';
                break;
            default:
                break;
        }
    });

    setBusy(false);
    post({ type: 'ready' });
})();
