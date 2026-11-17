/* MetaTrader AI view — koneksi bridge, quote, rencana tervalidasi, eksekusi, chat, konsol. */
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);

    const eBridge = $('mt-bridge');
    const eMode = $('mt-mode');
    const eConnect = $('mt-connect');
    const eAuto = $('mt-auto');
    const eBridgeTerm = $('mt-bridge-term');
    const eDisconnect = $('mt-disconnect');
    const eRefresh = $('mt-refresh');
    const eAccount = $('mt-account');
    const eRemote = $('mt-remote');
    const eServer = $('mt-server');
    const eLogin = $('mt-login');
    const ePassword = $('mt-password');
    const ePath = $('mt-path');
    const eLoginBtn = $('mt-login-btn');
    const eFindTerminal = $('mt-find-terminal');
    const eForget = $('mt-forget');
    const eLoginState = $('mt-login-state');
    const eSymbol = $('mt-symbol');
    const eSymbolSearch = $('mt-symbol-search');
    const eSymbolScan = $('mt-symbol-scan');
    const eSymbolInfo = $('mt-symbol-info');
    const eSymbolCount = $('mt-symbol-count');
    const eEntryLlm = $('mt-entry-llm');
    const eTf = $('mt-tf');
    const eLoad = $('mt-load');
    const eQuote = $('mt-quote');
    const eInd = $('mt-ind');
    const eChart = $('mt-chart');
    const ePlanCard = $('mt-plan-card');
    const eAction = $('mt-action');
    const eVerdict = $('mt-verdict');
    const eConf = $('mt-conf');
    const eEntry = $('mt-entry');
    const eSl = $('mt-sl');
    const eTp = $('mt-tp');
    const eLot = $('mt-lot');
    const eRr = $('mt-rr');
    const eRiskPct = $('mt-riskpct');
    const eReasons = $('mt-reasons');
    const eAnalyze = $('mt-analyze');
    const eExecute = $('mt-execute');
    const eCloseAll = $('mt-closeall');
    const eEmpty = $('mt-empty-plan');
    const eAnalyze2 = $('mt-analyze2');
    const eAnalyzeNote = $('mt-analyze-note');
    const ePosCount = $('mt-pos-count');
    const ePositions = $('mt-positions');
    const eAiToggle = $('mt-ai-toggle');
    const eStopAi = $('mt-stop');
    const eModel = $('mt-model');
    const eModelScan = $('mt-model-scan');
    const eModelPick = $('mt-model-pick');
    const eAi = $('mt-ai');
    const eChat = $('mt-chat');
    const eHistoryBtn = $('mt-history-btn');
    const eHistory = $('mt-history');
    const eNewChat = $('mt-new-chat');
    const eChatCount = $('mt-chat-count');
    const eAsk = $('mt-ask');
    const eSend = $('mt-send');
    const eTermLog = $('mt-term-log');
    const eTermCmd = $('mt-term-cmd');
    const eToast = $('mt-toast');

    let lastQuote = null;
    let lastBars = [];
    let lastPlan = null;
    let busy = false;
    let streaming = null;
    let modelKey = '';
    let toastTimer = null;
    let aiReady = false;
    // Katalog simbol akun (nama asli broker: ETHUSDm, XAUUSDm, …).
    let catalog = [];
    let favorites = [];
    let catalogKey = '';
    let catalogShown = 0;
    let activeSymbol = '';

    const esc = (s) => String(s == null ? '' : s);
    function mdInto(el, text) {
        if (window.SkunderMd) { el.appendChild(window.SkunderMd.inline(String(text == null ? '' : text))); }
        else { el.textContent = esc(text); }
    }
    const nf = (n, d) => (typeof n === 'number' && isFinite(n)
        ? n.toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 })
        : '—');

    function post(msg) { vscode.postMessage(msg); }

    function price(n) {
        return priceFor(n, (lastQuote && lastQuote.digits) || 2);
    }

    function priceFor(n, digits) {
        if (typeof n !== 'number' || !isFinite(n)) { return '—'; }
        return n.toFixed(Math.max(0, Math.min(5, digits == null ? 2 : digits)));
    }

    function toast(text, kind) {
        if (!eToast) { return; }
        eToast.textContent = String(text || '');
        eToast.className = 'mt-toast ' + (kind || 'info');
        eToast.hidden = false;
        if (toastTimer) { clearTimeout(toastTimer); }
        toastTimer = setTimeout(() => { eToast.hidden = true; }, 6500);
        appendLog(text, kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : 'info');
    }

    function appendLog(text, kind) {
        const line = document.createElement('div');
        line.className = 'l-' + (kind || 'out');
        line.textContent = esc(text);
        eTermLog.appendChild(line);
        while (eTermLog.childElementCount > 500) { eTermLog.removeChild(eTermLog.firstChild); }
        eTermLog.scrollTop = eTermLog.scrollHeight;
    }

    function setBusy(on, text) {
        busy = !!on;
        [eConnect, eLoad, eAnalyze, eAnalyze2, eRefresh, eSend, eEntryLlm, eSymbolScan].forEach((b) => { if (b) { b.disabled = busy; } });
        eExecute.disabled = busy || !ePlanCard.dataset.ok || ePlanCard.dataset.hold === '1';
        if (text && eAnalyzeNote) { eAnalyzeNote.textContent = text; }
        if (!busy && eAnalyzeNote && ePlanCard.hidden) {
            eAnalyzeNote.textContent = 'AI menentukan arah & jarak SL/TP; sistem menentukan entry dari harga terminal dan menolak setup yang tidak lolos syarat.';
        }
    }

    function setBridge(state, health, target, text, attempts) {
        if (state === 'connected') {
            const mode = health && health.mode ? String(health.mode).toUpperCase() : '—';
            const acc = (health && health.account) || {};
            const demo = /trial|demo/i.test(String(acc.server || ''));
            const label = mode === 'SIM' ? 'SIM (uang palsu)' : demo ? 'DEMO' : mode;
            eBridge.textContent = 'tersambung';
            eBridge.className = 'mt-chip ok';
            // Tampilkan broker/server akun (menyesuaikan broker), bukan alamat bridge.
            const who = acc.server ? String(acc.server) : (target || '');
            eMode.textContent = label + (who ? ' · ' + who : '');
            eMode.className = 'mt-chip' + (mode === 'SIM' || demo ? ' warn' : ' ok');
            renderAccount(health && health.account ? health.account : null);
        } else if (state === 'connecting') {
            eBridge.textContent = 'menghubungkan…';
            eBridge.className = 'mt-chip';
            eMode.textContent = target || '—';
            eMode.className = 'mt-chip muted';
        } else if (state === 'retrying') {
            // Sambung otomatis: tidak perlu menekan Hubungkan lagi.
            if (eAccount) {
                eAccount.textContent = 'Menunggu terminal MetaTrader & broker… akun lama tidak dipakai (bukan akun simulasi).';
            }
            eBridge.textContent = 'menyambung ulang…';
            eBridge.className = 'mt-chip warn';
            const n = Number(attempts) || 1;
            eMode.textContent = text || `percobaan ${n}`;
            eMode.className = 'mt-chip muted';
            if (text) { appendLog(String(text), 'info'); }
        } else if (state === 'error') {
            eBridge.textContent = 'gagal';
            eBridge.className = 'mt-chip err';
            eMode.textContent = target || '—';
            eMode.className = 'mt-chip muted';
            if (text) { toast(text, 'err'); }
        } else {
            eBridge.textContent = 'belum tersambung';
            eBridge.className = 'mt-chip';
            eMode.textContent = '—';
            eMode.className = 'mt-chip muted';
        }
    }

    function renderAccount(acc) {
        if (!acc || !acc.currency) {
            eAccount.textContent = 'Menyambung otomatis ke MetaTrader… (mode simulasi hanya bila MT5 tidak ada)';
            return;
        }
        eAccount.textContent = '';
        const line = document.createElement('div');
        line.className = 'mt-acc-line';
        line.textContent = `${acc.name || 'Akun'} · login ${acc.login ?? '—'} · ${acc.server || ''}`;
        const nums = document.createElement('div');
        nums.className = 'mt-acc-nums';
        const cur = acc.currency ? ' ' + acc.currency : '';
        const lev = Number(acc.leverage) || 0;
        // Exness “unlimited” dilaporkan sebagai 1:2000000000 — tampilkan apa adanya, jangan dikira palsu.
        const levText = lev >= 1e9 ? '1:∞ (unlimited)' : (lev > 0 ? '1:' + lev : '—');
        [['Balance', nf(acc.balance, 2) + cur], ['Equity', nf(acc.equity, 2) + cur], ['Free margin', nf(acc.freeMargin, 2) + cur], ['Margin level', acc.marginLevel ? nf(acc.marginLevel, 0) + '%' : '—'], ['Leverage', levText]]
            .forEach(([k, v]) => {
                const box = document.createElement('div');
                const s = document.createElement('span');
                s.textContent = k;
                const b = document.createElement('b');
                b.textContent = v;
                box.append(s, b);
                nums.appendChild(box);
            });
        eAccount.append(line, nums);
    }

    /** Catatan syarat/risiko + status auto-pilot. */
    function renderSettings(s) {
        if (!eAnalyzeNote || !s) { return; }
        const platform = s.platform === 'mt4' ? 'MT4 (bridge EA)' : 'MT5 (Python)';
        const auto = s.autoPilot
            ? `auto-pilot ON (${Number(s.autoScanSeconds) || 60}s${s.watchlist ? ' · ' + s.watchlist : ''})`
            : s.autoTrade ? 'auto-trade ON (tanpa loop)' : 'auto-pilot mati';
        const rt = s.autoConnect === false ? 'sambung manual' : 'sambung otomatis realtime';
        const llm = s.llmEntry === false ? 'LLM entry mati' : 'LLM entry aktif';
        const aggr = s.demoAggressive === false
            ? 'demo agresif mati'
            : `demo agresif ≤${nf(Number(s.demoRiskCapPct) || 25, 0)}%`;
        const autoTp = s.autoProfitClose === false
            ? 'auto-TP mati'
            : `auto-TP +${nf(Number(s.profitCloseR) || 0.8, 1)}R · entry ulang ${Math.round(Number(s.reentryCooldown) || 45)}s · maks ${Math.round(Number(s.maxTradesPerDay) || 30)}/hari`;
        eAnalyzeNote.textContent = `Risiko ${nf(s.riskPercent, 1)}% ekuitas · R:R min ${nf(s.minRR, 1)} · keyakinan min ${nf(s.minConfidence, 0)}% · ${autoTp} · ${aggr} · ${auto} · ${rt} · ${llm} · ${platform} · mode ${s.mode || 'auto'}`;
        setAuto(!!s.autoPilot);
    }

    function setAuto(on) {
        if (!eAuto) { return; }
        eAuto.dataset.on = on ? '1' : '';
        eAuto.textContent = on ? 'Auto: ON' : 'Auto: mati';
        eAuto.className = 'mt-btn' + (on ? ' on' : '');
    }

    /** Status kredensial akun nyata (password tidak pernah ditampilkan). */
    function setCredentials(hasPassword, login, server) {
        if (!eLoginState) { return; }
        const who = login ? `${login}${server ? ' @ ' + server : ''}` : 'akun nyata';
        eLoginState.textContent = hasPassword ? `${who} · password tersimpan` : `${who} · password belum tersimpan`;
    }

    /** URL + token jembatan untuk HP (LAN) — ditampilkan bila bridgeHost bukan 127.0.0.1. */
    function renderRemote(remote) {
        if (!eRemote) { return; }
        if (!remote || !remote.url) {
            eRemote.hidden = true;
            eRemote.textContent = '';
            return;
        }
        eRemote.hidden = false;
        eRemote.textContent = '';
        const info = document.createElement('span');
        info.textContent = `HP: ${remote.url}` + (remote.token ? ` · token ${remote.token}` : '');
        const copy = document.createElement('button');
        copy.className = 'mt-btn small';
        copy.textContent = 'Salin';
        copy.onclick = () => post({ type: 'copyRemote' });
        eRemote.append(info, copy);
    }

    // ── simbol akun/broker (dropdown di HP) ────────────────────────────────
    /** Pastikan nama simbol punya <option>, lalu pilih (init/state/symbol). */
    function setSymbolValue(name) {
        const value = String(name == null ? '' : name);
        if (!eSymbol || !value) { return; }
        activeSymbol = value;
        Array.prototype.slice.call(eSymbol.options).forEach((o) => {
            if (!o.value) { o.remove(); }
        });
        let opt = Array.prototype.slice.call(eSymbol.options).find((o) => o.value === value);
        if (!opt) {
            // Belum ada di katalog (mis. bridge MT4) → tambahkan supaya nama tidak hilang.
            opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            eSymbol.insertBefore(opt, eSymbol.firstChild);
        }
        eSymbol.value = value;
    }

    function catalogFingerprint() {
        const first = catalog.length ? catalog[0].n : '';
        const last = catalog.length ? catalog[catalog.length - 1].n : '';
        return `${catalog.length}|${first}|${last}|${favorites.join(',')}`;
    }

    function catalogLabel(row) {
        const name = String(row.n || '');
        const base = String(row.b || '');
        return base && base !== name ? `${name} · ${base}` : name;
    }

    /** Isi dropdown: kelompok favorit dulu, lalu per grup Market Watch. */
    function applySearch() {
        if (!eSymbol) { return; }
        const term = String((eSymbolSearch && eSymbolSearch.value) || '').trim().toUpperCase();
        const rows = !term
            ? catalog
            : catalog.filter((r) => String(r.n).toUpperCase().indexOf(term) >= 0
                || String(r.b || '').toUpperCase().indexOf(term) >= 0);
        eSymbol.textContent = '';
        const favSet = new Set(favorites);
        const favRows = [];
        const groups = new Map();
        rows.forEach((r) => {
            if (favSet.has(r.n)) { favRows.push(r); return; }
            const g = String(r.g || 'Lainnya');
            if (!groups.has(g)) { groups.set(g, []); }
            groups.get(g).push(r);
        });
        const addGroup = (label, list) => {
            if (!list.length) { return; }
            const og = document.createElement('optgroup');
            og.label = label;
            list.forEach((r) => {
                const o = document.createElement('option');
                o.value = r.n;
                o.textContent = catalogLabel(r);
                o.dataset.base = r.b || '';
                og.appendChild(o);
            });
            eSymbol.appendChild(og);
        };
        addGroup('★ Favorit', favRows.slice(0, 24));
        Array.from(groups.keys()).sort().forEach((g) => addGroup(g, groups.get(g).slice(0, 400)));
        // Simbol aktif selalu ada walau katalog kosong / tidak cocok pencarian.
        setSymbolValue(activeSymbol || (eSymbol.options.length ? eSymbol.options[0].value : ''));
        catalogShown = rows.length;
        updateSymbolInfo(term, rows.length);
    }

    function updateSymbolInfo(term, count) {
        if (!eSymbolInfo) { return; }
        if (!catalog.length) {
            eSymbolInfo.textContent = 'Daftar simbol menunggu akun tersambung — chart & analisa mengikuti broker otomatis.';
            return;
        }
        if (term) {
            eSymbolInfo.textContent = `${count} dari ${catalog.length} simbol cocok “${term}”.`;
            return;
        }
        const active = catalog.find((r) => r.n === activeSymbol);
        const arrow = active && active.b && active.b !== active.n ? `${active.b} → ` : '';
        eSymbolInfo.textContent = `${arrow}${activeSymbol || '—'} · ${catalog.length} simbol akun ini. Chart & analisa ikut nama broker.`;
    }

    /** Terima katalog broker dari host (saat tersambung / akun berganti). */
    function renderCatalog(payload) {
        if (!payload || !Array.isArray(payload.symbols)) { return; }
        favorites = Array.isArray(payload.favorites) ? payload.favorites.slice() : favorites;
        catalog = payload.symbols.slice();
        if (payload.active) { activeSymbol = String(payload.active); }
        const key = catalogFingerprint();
        if (key !== catalogKey) {
            catalogKey = key;
            applySearch();
        } else {
            setSymbolValue(activeSymbol);
        }
        if (eSymbolCount) { eSymbolCount.textContent = catalog.length ? `${catalog.length} simbol` : '—'; }
    }

    function renderMarket(m) {
        lastQuote = m.quote || null;
        const q = m.quote;
        if (!q) { return; }
        eQuote.textContent = '';
        const main = document.createElement('div');
        main.className = 'mt-quote-main';
        const sym = document.createElement('b');
        sym.textContent = q.name;
        const bid = document.createElement('span');
        bid.textContent = ' bid ' + price(q.bid);
        const ask = document.createElement('span');
        ask.textContent = ' / ask ' + price(q.ask);
        const spread = document.createElement('span');
        spread.className = 'muted';
        spread.textContent = ' · spread ' + nf(q.spread, 0) + ' · ' + m.timeframe + ' · ' + nf(m.bars, 0) + ' bar';
        main.append(sym, bid, ask, spread);
        eQuote.appendChild(main);

        eInd.textContent = '';
        [['ATR', price(m.atr)], ['EMA20', price(m.ema20)], ['EMA50', price(m.ema50)], ['RSI', nf(m.rsi, 1)]]
            .forEach(([k, v]) => {
                const box = document.createElement('div');
                const s = document.createElement('span');
                s.textContent = k;
                const b = document.createElement('b');
                b.textContent = v;
                box.append(s, b);
                eInd.appendChild(box);
            });
        if (m.symbol) { setSymbolValue(m.symbol); }
        if (m.timeframe) { eTf.value = m.timeframe; }
        lastBars = Array.isArray(m.candles) ? m.candles.slice(-120) : [];
        drawChart();
    }

    /** Seri SMA sederhana untuk garis tren di chart. */
    function smaSeries(values, n) {
        const out = [];
        let sum = 0;
        for (let i = 0; i < values.length; i++) {
            sum += values[i];
            if (i >= n) { sum -= values[i - n]; }
            out.push(i >= n - 1 ? sum / n : null);
        }
        return out;
    }

    /** Chart candle mini: harga, SMA20/50, entry/SL/TP dari rencana aktif. */
    function drawChart() {
        if (!eChart || typeof eChart.getContext !== 'function') { return; }
        const ctx = eChart.getContext('2d');
        if (!ctx) { return; }
        const w = Math.max(220, Math.round(eChart.clientWidth || 300));
        // Tinggi mengikuti CSS (lebih tinggi di HP), supaya chart tidak terpotong.
        const box = Math.round(eChart.getBoundingClientRect().height || 0);
        const h = box > 80 ? box : 170;
        const dpr = window.devicePixelRatio || 1;
        if (eChart.width !== Math.round(w * dpr) || eChart.height !== Math.round(h * dpr)) {
            eChart.width = Math.round(w * dpr);
            eChart.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const bars = lastBars;
        if (!bars.length) {
            ctx.fillStyle = 'rgba(200,200,200,.55)';
            ctx.font = '12px sans-serif';
            ctx.fillText('Chart menunggu data simbol…', 10, h / 2);
            return;
        }
        const digits = Math.max(0, Math.min(5, (lastQuote && lastQuote.digits) || 2));
        const padL = 4, padR = 60, padT = 8, padB = 16;
        const iw = w - padL - padR, ih = h - padT - padB;
        let min = Infinity, max = -Infinity;
        bars.forEach((b) => { min = Math.min(min, b.l); max = Math.max(max, b.h); });
        if (lastPlan) {
            [lastPlan.entry, lastPlan.sl, lastPlan.tp].forEach((v) => {
                if (typeof v === 'number' && isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); }
            });
        }
        if (!isFinite(min) || !isFinite(max)) { return; }
        const span = (max - min) || Math.max(1e-6, Math.abs(max) * 0.001);
        min -= span * 0.06;
        max += span * 0.06;
        const y = (v) => padT + ((max - v) / (max - min)) * ih;
        const x = (i) => padL + (bars.length <= 1 ? iw / 2 : (i / (bars.length - 1)) * iw);
        const cw = Math.max(1, (iw / bars.length) * 0.62);

        bars.forEach((b, i) => {
            const up = b.c >= b.o;
            const color = up ? '#26a69a' : '#ef5350';
            const xc = x(i);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(xc, y(b.h));
            ctx.lineTo(xc, y(b.l));
            ctx.stroke();
            const yo = y(b.o), yc = y(b.c);
            ctx.fillRect(xc - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
        });

        const closes = bars.map((b) => b.c);
        [['SMA20', smaSeries(closes, 20), '#f0a020'], ['SMA50', smaSeries(closes, 50), '#9c6ade']].forEach(([label, series, color]) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            let started = false;
            series.forEach((v, i) => {
                if (v === null || !isFinite(v)) { return; }
                if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else { ctx.lineTo(x(i), y(v)); }
            });
            ctx.stroke();
        });
        ctx.lineWidth = 1;

        const line = (value, color, label) => {
            if (typeof value !== 'number' || !isFinite(value)) { return; }
            const yy = y(value);
            if (yy < padT || yy > padT + ih) { return; }
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(padL, yy);
            ctx.lineTo(w - padR, yy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = color;
            ctx.font = '9px sans-serif';
            ctx.fillText(label, w - padR + 3, yy - 2);
        };
        if (lastPlan) {
            line(lastPlan.entry, '#4fc1ff', 'entry');
            line(lastPlan.sl, '#ef5350', 'SL');
            line(lastPlan.tp, '#26a69a', 'TP');
        }
        const last = bars[bars.length - 1];
        line(last.c, '#4fc1ff', last.c.toFixed(digits));

        ctx.fillStyle = 'rgba(200,200,200,.7)';
        ctx.font = '10px sans-serif';
        ctx.fillText(max.toFixed(digits), w - padR + 3, padT + 8);
        ctx.fillText(min.toFixed(digits), w - padR + 3, h - padB + 2);
    }

    window.addEventListener('resize', () => { drawChart(); });

    function renderTick(q) {
        if (!q) { return; }
        lastQuote = q;
        if (lastBars.length) {
            const last = lastBars[lastBars.length - 1];
            const mid = (Number(q.bid) + Number(q.ask)) / 2;
            if (isFinite(mid)) { last.c = mid; }
            drawChart();
        }
        const main = eQuote.querySelector('.mt-quote-main');
        if (!main || main.children.length < 4) { return; }
        main.children[1].textContent = ' bid ' + price(q.bid);
        main.children[2].textContent = ' / ask ' + price(q.ask);
        main.children[3].textContent = ' · spread ' + nf(q.spread, 0) + ' · ' + String(eTf.value || '') + ' · live';
    }

    function renderPlan(p) {
        if (!p) { return; }
        const wasHidden = ePlanCard.hidden;
        lastPlan = p;
        drawChart();
        lastPlan = p;
        ePlanCard.hidden = false;
        eEmpty.hidden = true;
        ePlanCard.dataset.ok = p.ok ? '1' : '';
        ePlanCard.dataset.hold = p.action === 'HOLD' ? '1' : '';

        eAction.textContent = p.action;
        eAction.className = 'mt-badge ' + (p.action === 'BUY' ? 'buy' : p.action === 'SELL' ? 'sell' : 'hold');
        eVerdict.textContent = p.ok ? 'LOLOS SYARAT' : 'DITOLAK';
        eVerdict.className = 'mt-badge ' + (p.ok ? 'ok' : 'bad');
        eConf.textContent = p.confidence + '%';
        eConf.title = 'Keyakinan AI ' + p.confidence + '%';
        eConf.className = 'mt-chip' + (p.ok ? ' ok' : '');
        eEntry.textContent = price(p.entry);
        eSl.textContent = price(p.sl);
        eTp.textContent = price(p.tp);
        eLot.textContent = nf(p.lot, 2);
        eRr.textContent = '1:' + nf(p.rr, 2);
        eRiskPct.textContent = nf(p.riskPct, 2) + '%';

        eReasons.textContent = '';
        const add = (text, cls) => {
            if (!text) { return; }
            const row = document.createElement('div');
            row.className = cls || '';
            row.textContent = '• ' + text;
            eReasons.appendChild(row);
        };
        if (p.reason) { add(p.reason); }
        if (p.invalidate) { add('Invalidasi: ' + p.invalidate); }
        if (p.risk) { add('Risiko: ' + p.risk, 'muted'); }
        (p.reasons || []).forEach((r) => add(r, 'bad-text'));

        eExecute.disabled = busy || !p.ok || p.action === 'HOLD';

        // Di HP, rencana baru langsung dibawa ke layar supaya tombol Eksekusi terlihat.
        if (wasHidden && typeof ePlanCard.scrollIntoView === 'function' && (window.innerWidth || 0) <= 560) {
            try { ePlanCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch { ePlanCard.scrollIntoView(); }
        }
    }

    function clearPlan() {
        lastPlan = null;
        drawChart();
        ePlanCard.hidden = true;
        eEmpty.hidden = false;
        ePlanCard.dataset.ok = '';
        ePlanCard.dataset.hold = '';
        eExecute.disabled = true;
    }

    /** Daftar riwayat chat MetaTrader (database/mt-chat.txt). */
    function renderChatSessions(list) {
        if (!eHistory) { return; }
        eHistory.textContent = '';
        const rows = Array.isArray(list) ? list : [];
        if (eChatCount) { eChatCount.textContent = rows.length ? rows.length + ' riwayat' : 'belum ada riwayat'; }
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'mt-empty';
            empty.textContent = 'Belum ada riwayat chat tersimpan.';
            eHistory.appendChild(empty);
            return;
        }
        rows.forEach((s) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mt-hist-item';
            const title = document.createElement('b');
            title.textContent = s.title || 'Percakapan';
            const meta = document.createElement('span');
            const when = s.at ? new Date(s.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
            meta.textContent = [s.symbol, (s.count || 0) + ' pesan', when].filter(Boolean).join(' · ');
            b.append(title, meta);
            b.onclick = () => {
                post({ type: 'loadChat', id: s.id });
                if (eHistory) { eHistory.hidden = true; }
            };
            eHistory.appendChild(b);
        });
    }

    /** Pulihkan percakapan terakhir setelah view di-reload / pindah fitur. */
    function restoreChat(turns) {
        if (!eChat) { return; }
        const rows = Array.isArray(turns) ? turns.slice(-8) : [];
        if (!rows.length) { return; }
        eChat.textContent = '';
        rows.forEach((t) => {
            if (!t || !t.content) { return; }
            if (t.role === 'user') { bubble('user', t.content); return; }
            renderAnswer(bubble('ai', ''), t.content);
        });
        eChat.scrollTop = eChat.scrollHeight;
    }

    function renderPositions(list) {
        const rows = Array.isArray(list) ? list : [];
        ePosCount.textContent = rows.length + ' terbuka';
        ePositions.textContent = '';
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'mt-empty';
            empty.textContent = 'Belum ada posisi.';
            ePositions.appendChild(empty);
            return;
        }
        rows.forEach((p) => {
            const row = document.createElement('div');
            row.className = 'mt-pos';
            const head = document.createElement('div');
            head.className = 'mt-pos-head';
            const title = document.createElement('b');
            title.textContent = '#' + p.ticket + ' ' + p.symbol + ' ' + String(p.type).toUpperCase() + ' ' + nf(p.volume, 2) + ' lot';
            const profit = document.createElement('span');
            profit.className = Number(p.profit) >= 0 ? 'up' : 'down';
            profit.textContent = (Number(p.profit) >= 0 ? '+' : '') + nf(Number(p.profit), 2);
            head.append(title, profit);
            const meta = document.createElement('div');
            meta.className = 'muted small';
            const pd = p.digits != null ? p.digits : (lastQuote ? lastQuote.digits : 2);
            meta.textContent = `entry ${priceFor(p.price, pd)} · SL ${priceFor(p.sl, pd)} · TP ${priceFor(p.tp, pd)}${p.current ? ' · kini ' + priceFor(p.current, pd) : ''}`;
            const btn = document.createElement('button');
            btn.className = 'mt-btn small';
            btn.textContent = 'Tutup';
            btn.onclick = () => post({ type: 'closePosition', ticket: p.ticket });
            row.append(head, meta, btn);
            ePositions.appendChild(row);
        });
    }

    function renderModels(models, selected) {
        const list = Array.isArray(models) ? models : [];
        const key = list.map((m) => m.path).join('|');
        if (key !== modelKey) {
            modelKey = key;
            eModel.textContent = '';
            if (!list.length) {
                const o = document.createElement('option');
                o.value = '';
                o.textContent = '(belum ada berkas .gguf — tekan ⟳)';
                eModel.appendChild(o);
            }
            list.forEach((m) => {
                const o = document.createElement('option');
                o.value = m.path;
                o.textContent = m.name + (m.size ? ' · ' + m.size : '');
                o.title = m.path;
                eModel.appendChild(o);
            });
        }
        if (selected) { eModel.value = selected; }
    }

    function setAi(a) {
        const info = Object.assign({ state: 'stopped', port: 0, model: '', ready: false }, a || {});
        aiReady = !!info.ready || info.state === 'running';
        const starting = info.state === 'starting';
        eAiToggle.textContent = starting ? 'Memuat…' : aiReady ? 'Hentikan' : 'Nyalakan';
        eAiToggle.disabled = starting;
        eAiToggle.dataset.on = aiReady ? '1' : '';
        eAi.textContent = 'otak terpisah · port ' + info.port + ' · model ' + (info.model || '—')
            + ' · ' + (aiReady ? 'siap' : starting ? 'memuat model…' : (info.state || 'berhenti'));
        renderModels(info.models, info.modelPath);
    }

    // ── jawaban terstruktur ──────────────────────────────────────────────────
    const KEYS = ['STOP LOSS', 'R:R', 'ENTRY', 'TP', 'LOT', 'ARAH', 'SINYAL', 'KEYAKINAN', 'ALASAN', 'RISIKO', 'STATUS', 'JAWABAN', 'KAITAN TRADING', 'CATATAN RISIKO'];
    function splitKey(line) {
        const up = line.toUpperCase();
        for (const k of KEYS) {
            if (up.indexOf(k + ':') === 0) { return { key: k, val: line.slice(k.length + 1).trim() }; }
        }
        const m = line.match(/^([A-Za-z][A-Za-z0-9 .]{0,22}?)\s*:\s*(.*)$/);
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
            const pair = splitKey(line);
            if (pair) {
                if (pair.key === 'ALASAN') { mode = 'alasan'; if (pair.val) { alasan.push(pair.val); } return; }
                if (pair.key === 'RISIKO') { mode = 'risiko'; if (pair.val) { risiko.push(pair.val); } return; }
                kv[pair.key] = pair.val;
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

    function renderAnswer(div, text) {
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
                const val = String(kv[k] || '');
                const wide = ['JAWABAN', 'KAITAN TRADING', 'CATATAN RISIKO', 'STATUS'].indexOf(k) >= 0 || val.length > 48;
                if (wide) {
                    const row = document.createElement('div');
                    row.className = 'wide';
                    const s = document.createElement('span');
                    s.textContent = k.replace(/_/g, ' ');
                    const b = document.createElement('b');
                    mdInto(b, val);
                    row.append(s, b);
                    grid.appendChild(row);
                    return;
                }
                const s = document.createElement('span');
                s.textContent = k.replace(/_/g, ' ');
                const b = document.createElement('b');
                mdInto(b, val);
                const up = val.toUpperCase();
                if (k === 'SINYAL' || k === 'ARAH') {
                    b.className = /BUY|NAIK/.test(up) ? 'buy' : /SELL|TURUN/.test(up) ? 'sell' : 'hold';
                }
                grid.append(s, b);
            });
            div.appendChild(grid);
        }
        const list = (title, items, cls) => {
            if (!items.length) { return; }
            const h = document.createElement('div');
            h.className = 'muted small';
            h.textContent = title;
            const ul = document.createElement('ul');
            ul.className = cls || '';
            items.slice(0, 8).forEach((it) => {
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
            p.className = 'muted small';
            mdInto(p, kv._extra);
            div.appendChild(p);
        }
    }

    /**
     * Animasi mengetik: jawaban AI muncul bertahap dengan kursor berkedip.
     * Bila requestAnimationFrame tidak tersedia, teks langsung ditulis penuh.
     */
    function typeInto(node, full) {
        if (!node) { return; }
        node.dataset.raw = full;
        if (typeof window.requestAnimationFrame !== 'function') {
            node.textContent = full;
            node.classList.remove('streaming');
            return;
        }
        if (node.classList.contains('thinking')) {
            node.classList.remove('thinking');
            node.textContent = '';
        }
        // Potongan pertama tampil utuh, potongan berikutnya dianimasikan mengetik.
        if (!String(node.textContent || '').length) {
            node.textContent = full;
            node.classList.remove('streaming');
            node._typer = false;
            return;
        }
        node.classList.add('streaming');
        if (node._typer) { return; }
        node._typer = true;
        const step = () => {
            const target = String(node.dataset.raw || '');
            const shown = String(node.textContent || '');
            if (shown.length >= target.length) {
                node._typer = false;
                node.classList.remove('streaming');
                return;
            }
            const add = Math.max(2, Math.ceil((target.length - shown.length) / 10));
            node.textContent = target.slice(0, shown.length + add);
            if (eChat) { eChat.scrollTop = eChat.scrollHeight; }
            window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    function bubble(role, text) {
        const div = document.createElement('div');
        div.className = 'mt-msg ' + (role === 'user' ? 'user' : 'ai');
        div.textContent = esc(text);
        eChat.appendChild(div);
        eChat.scrollTop = eChat.scrollHeight;
        return div;
    }

    function sendAsk() {
        const text = String(eAsk.value || '').trim();
        if (!text || busy) { return; }
        eAsk.value = '';
        bubble('user', text);
        post({ type: 'ask', text });
    }

    // ── pesan dari ekstensi ─────────────────────────────────────────────────
    window.addEventListener('message', (ev) => {
        const m = ev.data || {};
        switch (m.type) {
            case 'init': {
                if (m.symbol) { setSymbolValue(m.symbol); }
                if (m.timeframe) { eTf.value = m.timeframe; }
                setAi(m.ai);
                renderModels(m.ai && m.ai.models, m.ai && m.ai.modelPath);
                renderSettings(m.settings || {});
                if (m.catalog) { renderCatalog(m.catalog); }
                if (m.settings) {
                    if (eServer && m.settings.server) { eServer.value = m.settings.server; }
                    if (eLogin && m.settings.login) { eLogin.value = String(m.settings.login); }
                    if (ePath && m.settings.terminalPath) { ePath.value = m.settings.terminalPath; }
                    setCredentials(!!m.hasPassword, m.settings.login, m.settings.server);
                }
                appendLog('MetaTrader AI siap · ' + m.symbol + ' ' + m.timeframe + ' · menyambung otomatis', 'ok');
                break;
            }
            case 'state': {
                // Snapshot lengkap: view dibuka lagi / webview di-reload → jangan kosong.
                if (m.catalog) { renderCatalog(m.catalog); }
                if (m.settings) { renderSettings(m.settings); }
                if (m.health) { setBridge('connected', m.health, undefined, undefined); }
                if (m.account) { renderAccount(m.account); }
                if (m.remote) { renderRemote(m.remote); }
                if (m.symbol) { setSymbolValue(m.symbol); }
                if (m.timeframe) { eTf.value = m.timeframe; }
                if (m.quote) { renderMarket(m); }
                if (Array.isArray(m.positions)) { renderPositions(m.positions); }
                if (m.plan) { renderPlan(m.plan); } else { clearPlan(); }
                if (m.auto && typeof m.auto.on === 'boolean') { setAuto(!!m.auto.on); }
                restoreChat(m.chat);
                break;
            }
            case 'catalog':
                renderCatalog(m);
                break;
            case 'reset': {
                // Ganti akun / putuskan: bersihkan chart & rencana lama supaya tidak salah akun.
                lastBars = [];
                lastPlan = null;
                lastQuote = null;
                clearPlan();
                renderPositions([]);
                if (m.reason === 'account') {
                    eChat.textContent = '';
                    appendLog('Akun berganti — chart, rencana, dan posisi disesuaikan ke akun aktif.', 'info');
                }
                drawChart();
                break;
            }
            case 'bridge':
                setBridge(m.state, m.health, m.target, m.text, m.attempts);
                if (m.state === 'connected') { renderRemote(m.remote); } else if (m.state === 'disconnected') { renderRemote(undefined); }
                break;
            case 'market':
                renderMarket(m);
                if (m.account) { renderAccount(m.account); }
                break;
            case 'tick':
                renderTick(m.quote);
                if (m.account) { renderAccount(m.account); }
                break;
            case 'symbol': {
                // Nama broker bisa berubah tanpa instrumen berbeda (ETHUSD → ETHUSDm):
                // chart hanya dikosongkan bila simbolnya benar-benar berganti.
                const next = String(m.symbol || '');
                const changed = !!next && next !== activeSymbol;
                if (changed) {
                    lastBars = [];
                    lastPlan = null;
                }
                if (next) { setSymbolValue(next); }
                if (m.digits != null && lastQuote) { lastQuote.digits = Number(m.digits) || lastQuote.digits; }
                drawChart();
                break;
            }
            case 'positions':
                renderPositions(m.positions);
                break;
            case 'plan':
                renderPlan(m.plan);
                break;
            case 'planError':
                if (streaming) {
                    streaming.classList.remove('thinking');
                    streaming.textContent = String(m.text || 'Analisa gagal');
                    streaming = null;
                }
                toast(String(m.text || 'Analisa gagal'), 'err');
                clearPlan();
                break;
            case 'planClear':
                clearPlan();
                break;
            case 'answerStart':
                streaming = bubble('ai', '…');
                streaming.classList.add('thinking');
                break;
            case 'chunk':
                if (streaming) {
                    // Aliran teks: ditulis bertahap (animasi mengetik) + kursor berkedip.
                    typeInto(streaming, String(streaming.dataset.raw || '') + String(m.text || ''));
                }
                break;
            case 'answer':
                if (streaming) {
                    const node = streaming;
                    streaming = null;
                    node.classList.remove('thinking');
                    node.classList.remove('streaming');
                    node._typer = false;
                    node.dataset.raw = '';
                    if (m.text) { renderAnswer(node, m.text); } else { node.textContent = '(tidak ada jawaban)'; }
                    eChat.scrollTop = eChat.scrollHeight;
                } else if (m.text) {
                    renderAnswer(bubble('ai', ''), m.text);
                }
                break;
            case 'busy':
                setBusy(!!m.on, m.on ? m.text : '');
                break;
            case 'ai':
                setAi(m.ai);
                break;
            case 'chatSessions':
                renderChatSessions(m.sessions);
                break;
            case 'chatLoaded':
                if (eChat) { eChat.textContent = ''; }
                restoreChat(m.messages || []);
                break;
            case 'models':
                renderModels(m.models, m.selected);
                if (eModelScan) { eModelScan.disabled = false; }
                break;
            case 'log':
                appendLog(m.text, m.kind);
                break;
            case 'toast':
                toast(m.text, m.kind);
                break;
            case 'auto':
                setAuto(!!m.on);
                renderSettings(m.settings || {});
                toast(m.on ? 'Auto-pilot aktif — eksekusi hanya untuk rencana yang lolos validasi.' : 'Auto-pilot dimatikan.', m.on ? 'ok' : 'info');
                break;
            case 'credentials':
                setCredentials(!!m.hasPassword, m.login, m.server);
                break;
            case 'terminalPath':
                if (ePath && m.path) { ePath.value = String(m.path); }
                break;
            default:
                break;
        }
    });

    // ── event UI ────────────────────────────────────────────────────────────
    eConnect.addEventListener('click', () => { post({ type: 'connect' }); toast('Menghubungkan ke MetaTrader…', 'info'); });
    if (eAuto) {
        eAuto.addEventListener('click', () => post({ type: 'auto', on: eAuto.dataset.on !== '1' }));
    }
    if (eLoginBtn) {
        eLoginBtn.addEventListener('click', () => {
            const server = String(eServer.value || '').trim();
            const login = Number(eLogin.value) || 0;
            const password = String(ePassword.value || '');
            const path = String(ePath.value || '').trim();
            if (!server || !login) {
                toast('Isi broker/server dan nomor login akun MT5.', 'err');
                return;
            }
            post({ type: 'login', server, login, password, path });
            toast('Menghubungkan akun nyata…', 'info');
        });
    }
    if (eForget) {
        eForget.addEventListener('click', () => {
            if (ePassword) { ePassword.value = ''; }
            post({ type: 'forget' });
        });
    }
    if (eFindTerminal) {
        eFindTerminal.addEventListener('click', () => {
            post({ type: 'findTerminals' });
            toast('Mencari terminal64.exe MT5 di PC bridge…', 'info');
        });
    }
    eDisconnect.addEventListener('click', () => { post({ type: 'disconnect' }); toast('Jembatan diputuskan.', 'info'); });
    eBridgeTerm.addEventListener('click', () => post({ type: 'bridgeTerminal' }));
    eRefresh.addEventListener('click', () => post({ type: 'refresh' }));
    // Dropdown simbol broker (nama asli akun: ETHUSDm, XAUUSDm, …).
    if (eSymbol) {
        eSymbol.addEventListener('change', () => {
            const sym = String(eSymbol.value || '').trim();
            if (!sym) { return; }
            activeSymbol = sym;
            updateSymbolInfo('', 0);
            post({ type: 'symbol', symbol: sym });
        });
    }
    let searchTimer = null;
    if (eSymbolSearch) {
        eSymbolSearch.addEventListener('input', () => {
            if (searchTimer) { clearTimeout(searchTimer); }
            searchTimer = setTimeout(() => { applySearch(); }, 140);
        });
        eSymbolSearch.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter') { return; }
            const term = String(eSymbolSearch.value || '').trim();
            if (!term) { return; }
            // Tekan Enter = pilih hasil pertama (bisa juga nama generik: ETHUSD → ETHUSDm).
            const hit = catalog.find((r) => String(r.n).toUpperCase() === term.toUpperCase())
                || catalog.find((r) => String(r.b || '').toUpperCase() === term.toUpperCase())
                || catalog.find((r) => String(r.n).toUpperCase().indexOf(term.toUpperCase()) >= 0);
            if (hit) { setSymbolValue(hit.n); post({ type: 'symbol', symbol: hit.n }); }
            else { post({ type: 'symbol', symbol: term }); }
        });
    }
    if (eSymbolScan) {
        eSymbolScan.addEventListener('click', () => {
            post({ type: 'catalog' });
            toast('Memuat ulang daftar simbol akun…', 'info');
        });
    }
    eLoad.addEventListener('click', () => {
        post({ type: 'load', symbol: String(eSymbol.value || '').trim(), timeframe: String(eTf.value || 'M15') });
    });
    eTf.addEventListener('change', () => { post({ type: 'timeframe', timeframe: String(eTf.value || 'M15') }); post({ type: 'refresh' }); });
    eAnalyze.addEventListener('click', () => post({ type: 'analyze' }));
    eAnalyze2.addEventListener('click', () => post({ type: 'analyze' }));
    // Tombol di view = persetujuan eksplisit; tidak perlu dialog modal lagi di HP.
    eExecute.addEventListener('click', () => post({ type: 'execute', confirm: true }));
    if (eEntryLlm) {
        eEntryLlm.addEventListener('click', () => {
            if (busy) { return; }
            toast('LLM menyusun entry tervalidasi…', 'info');
            post({ type: 'entry', text: '' });
        });
    }
    eCloseAll.addEventListener('click', () => post({ type: 'closeAll' }));
    eSend.addEventListener('click', sendAsk);
    eAsk.addEventListener('keydown', (e) => { if (e.key === 'Enter') { sendAsk(); } });
    eStopAi.addEventListener('click', () => post({ type: 'stop' }));
    eAiToggle.addEventListener('click', () => {
        const on = eAiToggle.dataset.on === '1';
        post({ type: 'server', action: on ? 'stop' : 'start' });
    });
    if (eHistoryBtn) {
        eHistoryBtn.addEventListener('click', () => {
            if (!eHistory) { return; }
            eHistory.hidden = !eHistory.hidden;
            if (!eHistory.hidden) { post({ type: 'chatHistory' }); }
        });
    }
    if (eNewChat) { eNewChat.addEventListener('click', () => post({ type: 'newChat' })); }

    eModel.addEventListener('change', () => {
        const path = String(eModel.value || '');
        if (path) { post({ type: 'model', path }); }
    });
    eModelScan.addEventListener('click', () => { eModelScan.disabled = true; appendLog('Memindai berkas .gguf…', 'info'); post({ type: 'modelsRefresh' }); });
    eModelPick.addEventListener('click', () => post({ type: 'modelPick' }));
    $('mt-term-open').addEventListener('click', () => post({ type: 'terminal' }));
    $('mt-term-srv').addEventListener('click', () => post({ type: 'serverTerminal' }));
    $('mt-term-clear').addEventListener('click', () => { eTermLog.textContent = ''; });
    eTermCmd.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') { return; }
        const line = String(eTermCmd.value || '').trim();
        if (!line) { return; }
        eTermCmd.value = '';
        appendLog('mt> ' + line, 'cmd');
        post({ type: 'terminalCmd', line });
    });

    clearPlan();
    setBusy(false);
    if (eSymbol && !eSymbol.options.length) {
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '(memuat simbol akun…)';
        eSymbol.appendChild(ph);
    }
    post({ type: 'ready' });
})();
