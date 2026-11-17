/* global SkunderTrading */
/**
 * “Mode Analisis TradingView” — lapisan (overlay) penuh berisi widget resmi TradingView.
 *
 * Isi lapisan (khusus analisis — tanpa trading demo/real, tanpa akun/broker):
 *  • Chart lanjutan TradingView dengan seluruh toolbar (indikator, gambar, alert, replay,
 *    template, bandingkan simbol, layar penuh) + pengatur simbol/interval/gaya/rentang,
 *  • pencarian simbol lengkap: 941 emiten IDX + indeks, saham AS, komoditas, dan kurs,
 *  • panel Teknikal, Fundamental, Screener, Berita — semuanya widget resmi TradingView,
 *  • setelan embed: tema, bahasa, zona waktu, toolbar samping, hotlist, kalender, indikator,
 *  • drawer “Analisa AI”: chat analisa saham dengan otak trading terpisah (pilih model .gguf,
 *    nyalakan/hentikan llama-server, tanya jawab streaming) — data diambil dari simbol aktif,
 *    jadi tetap bekerja tanpa berkas CSV (dipakai juga oleh panel layar penuh mandiri).
 *
 * Catatan tampilan: widget dipasang sebagai <iframe> langsung ke host resmi TradingView
 * (www.tradingview-widget.com, cadangan s.tradingview.com) berukuran 100% × 100%. Cara ini
 * tidak bergantung pada handshake postMessage milik skrip embed, sehingga kotak widget tidak
 * lagi tampil abu-abu kosong: tiap kotak punya penanda “memuat”, sinyal siap dari widget
 * (tv-widget-ready), penggantian host otomatis, dan pemberitahuan bila benar-benar gagal.
 */
(function () {
    'use strict';

    /** Host widget resmi TradingView. Yang kedua dipakai bila yang pertama gagal dimuat. */
    const HOSTS = ['https://www.tradingview-widget.com', 'https://s.tradingview.com'];
    const OV_ID = 'tv-ov';
    const CFG_KEY = 'sk-tv-cfg';

    /** Simbol cepat (kurasi): saham likuid IDX, indeks, saham AS, komoditas, kurs. */
    const QUICK = [
        { s: 'IDX:COMPOSITE', d: 'IHSG', n: 'Indeks Harga Saham Gabungan' },
        { s: 'IDX:BBCA', d: 'BBCA', n: 'Bank Central Asia' },
        { s: 'IDX:BBRI', d: 'BBRI', n: 'Bank Rakyat Indonesia' },
        { s: 'IDX:BMRI', d: 'BMRI', n: 'Bank Mandiri' },
        { s: 'IDX:TLKM', d: 'TLKM', n: 'Telkom Indonesia' },
        { s: 'IDX:ASII', d: 'ASII', n: 'Astra International' },
        { s: 'IDX:ANTM', d: 'ANTM', n: 'Aneka Tambang' },
        { s: 'IDX:GOTO', d: 'GOTO', n: 'GoTo Gojek Tokopedia' },
        { s: 'IDX:ADRO', d: 'ADRO', n: 'Alamtri Resources' },
        { s: 'IDX:ICBP', d: 'ICBP', n: 'Indofood CBP' },
        { s: 'IDX:MDKA', d: 'MDKA', n: 'Merdeka Copper Gold' },
        { s: 'IDX:BRIS', d: 'BRIS', n: 'Bank Syariah Indonesia' },
        { s: 'IDX:AMMN', d: 'AMMN', n: 'Amman Mineral' },
        { s: 'IDX:TPIA', d: 'TPIA', n: 'Chandra Asri Pacific' },
        { s: 'NASDAQ:AAPL', d: 'AAPL', n: 'Apple Inc.' },
        { s: 'NASDAQ:TSLA', d: 'TSLA', n: 'Tesla Inc.' },
        { s: 'FX_IDC:USDIDR', d: 'USD/IDR', n: 'Dolar AS / Rupiah' },
        { s: 'TVC:GOLD', d: 'GOLD', n: 'Emas (XAU/USD)' },
    ];

    const INTERVALS = [
        ['1', '1 menit'], ['3', '3 menit'], ['5', '5 menit'], ['15', '15 menit'], ['30', '30 menit'],
        ['45', '45 menit'], ['60', '1 jam'], ['120', '2 jam'], ['240', '4 jam'],
        ['D', '1 hari'], ['W', '1 minggu'], ['M', '1 bulan'],
    ];

    const STYLES = [
        ['1', 'Candlestick'], ['0', 'Bar (OHLC)'], ['2', 'Garis'],
        ['3', 'Area'], ['8', 'Heikin Ashi'], ['9', 'Hollow candle'], ['10', 'Baseline'],
    ];

    const RANGES = [
        ['1D', '1 hari'], ['5D', '5 hari'], ['1M', '1 bulan'], ['3M', '3 bulan'],
        ['6M', '6 bulan'], ['YTD', 'YTD'], ['12M', '1 tahun'], ['60M', '5 tahun'], ['ALL', 'Semua'],
    ];

    const ZONES = [
        ['Asia/Jakarta', 'WIB (Jakarta)'], ['Asia/Singapore', 'SGT (Singapura)'],
        ['Asia/Tokyo', 'JST (Tokyo)'], ['Etc/UTC', 'UTC'],
        ['America/New_York', 'New York'], ['Europe/London', 'London'],
    ];

    const LOCALES = [['id', 'Indonesia'], ['en', 'English'], ['zh_CN', '中文']];

    /** Indikator cepat yang dikirim ke chart (id modern TradingView). */
    const STUDIES = [
        { k: 'rsi', label: 'RSI (14)', std: 'STD;RSI' },
        { k: 'macd', label: 'MACD', std: 'STD;MACD' },
        { k: 'ma20', label: 'MA 20', std: 'STD;SMA' },
        { k: 'bb', label: 'Bollinger Bands', std: 'STD;Bollinger_Bands' },
        { k: 'vwap', label: 'VWAP', std: 'STD;VWAP' },
        { k: 'stoch', label: 'Stochastic', std: 'STD;Stochastic' },
        { k: 'atr', label: 'ATR', std: 'STD;ATR' },
        { k: 'ichimoku', label: 'Ichimoku', std: 'STD;Ichimoku' },
        { k: 'vol', label: 'Volume', std: 'STD;Volume' },
    ];

    const TABS = [
        { id: 'chart', icon: 'chart', idl: 'Chart', zhl: '图表' },
        { id: 'tech', icon: 'tech', idl: 'Teknikal', zhl: '技术面' },
        { id: 'fund', icon: 'bank', idl: 'Fundamental', zhl: '基本面' },
        { id: 'screen', icon: 'filter', idl: 'Screener', zhl: '选股器' },
        { id: 'news', icon: 'news', idl: 'Berita', zhl: '新闻' },
        { id: 'cari', icon: 'search', idl: 'Cari Saham', zhl: '搜股' },
        { id: 'buku', icon: 'book', idl: 'Buku', zhl: '书籍' },
        { id: 'media', icon: 'image', idl: 'Gambar & Video', zhl: '图片与视频' },
    ];

    const DEFAULT_CFG = {
        symbol: 'IDX:BBCA',
        interval: 'D',
        style: '1',
        range: '12M',
        theme: 'auto',
        locale: 'id',
        tz: 'Asia/Jakarta',
        // Indikator cepat dikosongkan secara bawaan: chart tampil paling andal tanpa
        // studi tambahan, lalu indikator dipilih dari panel setelan atau toolbar chart.
        studies: [],
        rail: true,
        sideToolbar: true,
        symbolChange: true,
        details: true,
        hotlist: true,
        calendar: true,
        saveImage: true,
    };

    // ── keadaan modul ───────────────────────────────────────────────────────────
    let P = null;                 // ctx dari media/main.js
    let S = null;                 // sheet aktif
    let lang = 'id';
    let cfg = Object.assign({}, DEFAULT_CFG);
    let ov = null;                // elemen overlay (null = tertutup)
    let tab = 'chart';
    let bodyEl = null;
    let statusEl = null;
    let setEl = null;
    let renderSeq = 0;            // penanda render: widget lama tidak boleh menimpa yang baru
    let sectionBody = null;       // div.grid seksi “Mode Trading” di halaman analisis
    let zenOn = false;            // apakah lapisan meminta mode layar penuh (zen) VS Code
    let hasSaved = false;         // ada setelan tersimpan (simbol pilihan pengguna dihormati)
    let aiEl = null;              // drawer chat AI analisa (null = belum dibuat)
    let aiStream = null;          // gelembung jawaban yang sedang di-stream
    let aiInfo = {};              // keadaan otak trading terakhir (port/model/siap)
    let aiBusy = false;           // permintaan AI sedang berjalan
    const frames = new Map();     // kotak widget → keadaan pemantauan (lihat mount)

    const L = (id, zh) => (lang === 'zh-cn' ? zh : id);

    /** Katalog saham lengkap (media/saham.js). Bila belum termuat, pakai chip cepat saja. */
    function saham() {
        const k = window.SkunderSaham;
        if (k) { return k; }
        const items = QUICK.map((q) => [q.s, q.n, '', '']);
        return {
            items: items,
            sectors: [],
            jumlah: items.length,
            updated: '',
            cari(q, n) {
                const key = String(q || '').toUpperCase();
                const hit = key ? items.filter((it) => it[0].indexOf(key) >= 0) : items;
                return n ? hit.slice(0, n) : hit;
            },
            byCode(s) { return items.filter((it) => it[0] === s)[0] || null; },
            nameOf(s) { const h = items.filter((it) => it[0] === s)[0]; return h ? h[1] : ''; },
        };
    }

    // ── utilitas ────────────────────────────────────────────────────────────────
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) { e.className = cls; }
        if (text !== undefined && text !== null) { e.textContent = text; }
        return e;
    }
    function clear(n) { while (n && n.firstChild) { n.removeChild(n.firstChild); } }
    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    const nf = (n, d) => (typeof n === 'number' && isFinite(n)
        ? n.toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 })
        : '-');

    /** Apakah tema halaman terang? Dipakai tema widget “auto”. */
    function pageIsLight() {
        try {
            const bg = window.getComputedStyle(document.body).backgroundColor;
            const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m) { return false; }
            return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 > 0.55;
        } catch (e) { return false; }
    }
    /** Nama tema yang dipakai widget TradingView: 'dark' | 'light'. */
    function themeName() {
        if (cfg.theme === 'light' || cfg.theme === 'dark') { return cfg.theme; }
        return pageIsLight() ? 'light' : 'dark';
    }
    /** Warna latar widget (dipakai kotak widget supaya tidak ada bingkai abu-abu). */
    function themeBg() { return themeName() === 'light' ? '#ffffff' : '#131722'; }

    function readCfg() {
        try {
            const raw = window.localStorage.getItem(CFG_KEY);
            if (!raw) { return; }
            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== 'object') { return; }
            hasSaved = true;
            Object.keys(DEFAULT_CFG).forEach((k) => {
                if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULT_CFG[k]) { cfg[k] = saved[k]; }
            });
            if (Array.isArray(saved.studies)) { cfg.studies = saved.studies.filter((k) => STUDIES.some((s) => s.k === k)); }
        } catch (e) { /* localStorage bisa diblokir — pakai bawaan */ }
    }
    function saveCfg() {
        try { window.localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* abaikan */ }
    }

    /** Kirim pesan ke ekstensi (bila acquireVsCodeApi tersedia — dipakai uji jsdom juga). */
    function post(msg) {
        try {
            if (P && P.vscode && typeof P.vscode.postMessage === 'function') { P.vscode.postMessage(msg); }
        } catch (e) { /* halaman tanpa API (uji) */ }
    }
    function openExternal(url) {
        post({ type: 'tradingExternal', url: url });
    }

    /** Tautan chart TradingView untuk satu simbol (tombol “buka di browser”). */
    function tvChartUrl(symbol) {
        return 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol || 'IDX:BBCA');
    }

    // ── ikon garis (24×24, stroke currentColor) ────────────────────────────────
    const PATHS = {
        chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 2 5-7"/>',
        tech: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
        bank: '<path d="M4 20h16M6 20V9l6-4 6 4v11"/><path d="M10 20v-6h4v6"/>',
        filter: '<path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/>',
        news: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.3l-.1.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.5-1.1 1.7 1.7 0 0 0-1.2.4l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.3-1.8l-.1-.2v-3.3l.2-.1a1.7 1.7 0 0 0 1.1-1.5 1.7 1.7 0 0 0-.4-1.2l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.8-.3l.2-.1h3.3l.1.2a1.7 1.7 0 0 0 1.5 1.1 1.7 1.7 0 0 0 1.2-.4l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .3 1.8l.1.2z"/>',
        expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
        offline: '<path d="M3 3l18 18"/><path d="M8 17h9a4 4 0 0 0 .9-7.9A6 6 0 0 0 7 8.5"/>',
        reload: '<path d="M20 11a8 8 0 1 0-2.6 6"/><path d="M20 5v6h-6"/>',
        link: '<path d="M14 4h6v6M20 4l-8 8M18 14v5H5V6h5"/>',
        check: '<path d="M4 12l5 5L20 6"/>',
        alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
        chat: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8.5 9h7M8.5 12h4"/>',
        book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M8 7.5h8M8 11h8M8 14.5h5"/>',
        image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
        play: '<path d="M8 5l11 7-11 7z"/>',
        download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    };
    /** Ikon SVG monokrom; ukuran & warna diatur CSS (.tv-i). */
    function icon(name, cls) {
        return '<svg class="tv-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
            + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + (PATHS[name] || '') + '</svg>';
    }

    // ── gaya (di-scope ke #tv-ov, awalan tv-) ───────────────────────────────────
    const CSS = [
        '#tv-ov{position:fixed;inset:0;z-index:2147483200;display:flex;flex-direction:column;background:var(--sk-bg,var(--vscode-editor-background,#1e1e1e));color:var(--sk-fg,var(--vscode-foreground,#ddd));font-family:inherit;box-sizing:border-box;padding:10px 12px 8px;gap:8px}',
        '#tv-ov *{box-sizing:border-box}',
        '#tv-ov .tv-i{width:15px;height:15px;flex:0 0 auto;margin-right:6px;vertical-align:-3px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
        '#tv-ov button{display:inline-flex;align-items:center;font:inherit;color:inherit;background:transparent;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:6px;padding:5px 10px;cursor:pointer;white-space:nowrap;line-height:1.55}',
        '#tv-ov button:hover{background:var(--sk-input,rgba(128,128,128,.14))}',
        '#tv-ov button.tv-primary{background:var(--sk-btn,var(--vscode-button-background,#0e639c));border-color:var(--sk-btn,var(--vscode-button-background,#0e639c));color:var(--sk-btn-fg,var(--vscode-button-foreground,#fff));font-weight:600}',
        '#tv-ov button.tv-primary:hover{background:var(--sk-btn-hover,var(--sk-btn,var(--vscode-button-hoverBackground,#1177bb)))}',
        '#tv-ov select,#tv-ov input{font:inherit;color:var(--sk-input-fg,var(--sk-fg,inherit));background:var(--sk-input,var(--vscode-input-background,rgba(128,128,128,.12)));border:1px solid var(--sk-input-border,var(--sk-border,rgba(128,128,128,.35)));border-radius:6px;padding:5px 8px;min-width:0}',
        '#tv-ov select:focus,#tv-ov input:focus{outline:1px solid var(--sk-accent,var(--vscode-focusBorder,#007fd4));outline-offset:1px}',
        '#tv-ov .tv-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
        '#tv-ov .tv-brand{display:flex;align-items:center;gap:6px;font-weight:600;letter-spacing:.01em;white-space:nowrap;padding-right:4px}',
        '#tv-ov .tv-brand b{font-weight:400;opacity:.62}',
        '#tv-ov .tv-sym{display:flex;align-items:center;gap:6px;flex:1;min-width:220px;max-width:420px;position:relative}',
        '#tv-ov .tv-sym input{flex:1;text-transform:uppercase}',
        '#tv-ov .tv-acts{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
        '#tv-ov .tv-tabs{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--sk-border,rgba(128,128,128,.35));padding-bottom:0;flex-wrap:wrap}',
        '#tv-ov .tv-tab{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;color:inherit;opacity:.68;padding:6px 10px;margin-bottom:-1px}',
        '#tv-ov .tv-tab:hover{background:transparent;opacity:1}',
        '#tv-ov .tv-tab.on{background:transparent;border-bottom-color:var(--sk-accent,var(--vscode-focusBorder,#007fd4));color:inherit;opacity:1;font-weight:600}',
        '#tv-ov .tv-status{margin-left:auto;font-size:11.5px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:58%;padding-right:2px}',
        '#tv-ov .tv-chips{display:flex;gap:6px;flex-wrap:wrap}',
        '#tv-ov .tv-chip{background:transparent;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:4px;padding:2px 9px;font-size:11.5px;color:inherit;opacity:.78}',
        '#tv-ov .tv-chip:hover{background:var(--sk-input,rgba(128,128,128,.14));opacity:1}',
        '#tv-ov .tv-chip.on{border-color:var(--sk-accent,var(--vscode-focusBorder,#007fd4));background:transparent;color:inherit;opacity:1;font-weight:600}',
        '#tv-ov .tv-body{flex:1;min-height:0;display:flex;gap:8px}',
        '#tv-ov .tv-main{flex:1;min-width:0;min-height:0;display:flex;gap:8px}',
        '#tv-ov .tv-chart{flex:1;min-width:0;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:6px;overflow:hidden;position:relative}',
        '#tv-ov .tv-chart>.tv-wbox{border:0;border-radius:0}',
        '#tv-ov .tv-rail{width:340px;flex:0 0 340px;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}',
        '#tv-ov .tv-rail>.tv-wbox{flex:1 1 0;height:auto;min-height:0}',
        '#tv-ov .tv-grid{flex:1;min-height:0;display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(0,1fr)}',
        '#tv-ov .tv-col{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;overflow:auto}',
        '#tv-ov .tv-wbox{background:var(--tv-bg,#131722);border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:6px;overflow:hidden;position:relative;min-height:120px;height:100%;display:flex;flex-direction:column}',
        '#tv-ov .tv-frame{display:block;width:100%;flex:1 1 auto;height:100%;border:0;min-height:120px;background:transparent}',
        '#tv-ov .tv-hint{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:11.5px;background:var(--sk-bg,var(--vscode-editor-background,#1e1e1e));border-top:1px solid var(--sk-border,rgba(128,128,128,.35));color:var(--sk-fg,inherit)}',
        '#tv-ov .tv-hint span{flex:1;min-width:0;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#tv-ov .tv-hint button{padding:2px 8px;font-size:11.5px}',
        '#tv-ov .tv-hint .tv-i{width:13px;height:13px;margin-right:4px}',
        '#tv-ov .tv-skel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:#b2b5be;background:transparent;pointer-events:none}',
        '#tv-ov .tv-wbox.tv-ready .tv-skel{display:none}',
        '#tv-ov .tv-spin{width:13px;height:13px;border:2px solid rgba(178,181,190,.35);border-top-color:#2962ff;border-radius:50%;display:inline-block;animation:tv-spin .85s linear infinite}',
        '@keyframes tv-spin{to{transform:rotate(360deg)}}',
        '#tv-ov .tv-off{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:18px;background:var(--sk-bg,var(--vscode-editor-background,#1e1e1e));z-index:2}',
        '#tv-ov .tv-off .tv-i{width:22px;height:22px;margin:0}',
        '#tv-ov .tv-off p{margin:0;opacity:.75;font-size:12.5px;line-height:1.6;max-width:460px}',
        '#tv-ov .tv-off .tv-off-act{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}',
        '#tv-ov .tv-ac{position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:300px;overflow:auto;background:var(--sk-bg,var(--vscode-editor-background,#1e1e1e));border:1px solid var(--sk-border,rgba(128,128,128,.4));border-radius:6px;box-shadow:0 12px 28px rgba(0,0,0,.35);z-index:9;padding:3px}',
        '#tv-ov .tv-ac[hidden]{display:none}',
        '#tv-ov .tv-ac-item{display:grid;grid-template-columns:74px minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;padding:5px 8px;border:0;border-radius:4px;text-align:left;font-size:12.5px}',
        '#tv-ov .tv-ac-item.on{background:var(--sk-input,rgba(128,128,128,.18))}',
        '#tv-ov .tv-ac-item .tv-kode{font-weight:600;font-variant-numeric:tabular-nums}',
        '#tv-ov .tv-ac-item .tv-nama{opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#tv-ov .tv-ac-item .tv-sek{font-size:10.5px;opacity:.55;white-space:nowrap}',
        '#tv-ov .tv-ac-empty{padding:8px 10px;font-size:12px;opacity:.6}',
        '#tv-ov .tv-set{position:absolute;top:56px;right:12px;width:340px;max-height:calc(100% - 90px);overflow:auto;background:var(--sk-bg,var(--vscode-editor-background,#1e1e1e));border:1px solid var(--sk-border,rgba(128,128,128,.4));border-radius:8px;padding:12px;z-index:5;box-shadow:0 12px 32px rgba(0,0,0,.35)}',
        '#tv-ov .tv-set[hidden]{display:none}',
        '#tv-ov .tv-set h4{margin:0 0 8px;font-size:11.5px;font-weight:600;opacity:.6;text-transform:uppercase;letter-spacing:.06em;border:0;padding:0}',
        '#tv-ov .tv-set h4:not(:first-child){margin-top:14px;border-top:1px solid var(--sk-border,rgba(128,128,128,.25));padding-top:12px}',
        '#tv-ov .tv-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0;font-size:12.5px}',
        '#tv-ov .tv-row select,#tv-ov .tv-row input[type=text]{flex:1;max-width:180px}',
        '#tv-ov .tv-row input[type=checkbox]{width:14px;height:14px;accent-color:var(--sk-accent,var(--vscode-focusBorder,#007fd4))}',
        '#tv-ov .tv-studies{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:12px}',
        '#tv-ov .tv-studies label{display:flex;align-items:center;gap:6px;white-space:nowrap}',
        '#tv-ov .tv-studies input{accent-color:var(--sk-accent,var(--vscode-focusBorder,#007fd4))}',
        '#tv-ov .tv-set-act{display:flex;gap:6px;margin-top:12px}',
        '#tv-ov .tv-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;opacity:.55;flex-wrap:wrap}',
        '#tv-ov .tv-foot-open{padding:1px 7px;font-size:11px;opacity:.9}',
        '#tv-ov .tv-foot-open .tv-i{width:12px;height:12px;margin-right:4px}',
        '#tv-ov .tv-card{background:transparent;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:6px;padding:14px 16px}',
        '#tv-ov .tv-card h3{margin:0 0 6px;font-size:14px;font-weight:600;border:0;padding:0;color:inherit;display:flex;align-items:center;gap:2px}',
        '#tv-ov .tv-card p{margin:0 0 10px;font-size:12.5px;opacity:.75;line-height:1.65}',
        '#tv-ov .tv-search{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px}',
        '#tv-ov .tv-searchbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
        '#tv-ov .tv-searchbar input{flex:1;min-width:220px}',
        '#tv-ov .tv-searchinfo{font-size:11.5px;opacity:.6;line-height:1.6}',
        '#tv-ov .tv-list{flex:1;min-height:0;overflow:auto;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:6px}',
        '#tv-ov .tv-item{display:grid;grid-template-columns:78px minmax(0,1fr) 150px 92px;align-items:center;gap:10px;width:100%;padding:7px 12px;border:0;border-bottom:1px solid var(--sk-border,rgba(128,128,128,.16));border-radius:0;text-align:left;font-size:12.5px}',
        '#tv-ov .tv-item:hover{background:var(--sk-input,rgba(128,128,128,.14))}',
        '#tv-ov .tv-item.on{background:var(--sk-input,rgba(128,128,128,.2));box-shadow:inset 2px 0 0 var(--sk-accent,var(--vscode-focusBorder,#007fd4))}',
        '#tv-ov .tv-item .tv-kode{font-weight:600;font-variant-numeric:tabular-nums}',
        '#tv-ov .tv-item .tv-nama{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.82}',
        '#tv-ov .tv-item .tv-sek{font-size:11px;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#tv-ov .tv-item .tv-papan{font-size:10.5px;opacity:.45;text-align:right;white-space:nowrap}',
        '#tv-ov .tv-more{display:flex;justify-content:center;padding:8px}',
        '.tv-launch .tv-lbtn{font-size:13.5px;padding:9px 16px}',
        '.tv-launch .tv-lrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}',
        '.tv-launch .tv-lchip{background:transparent;border:1px solid var(--sk-border);border-radius:4px;padding:2px 9px;font-size:11.5px;cursor:pointer;color:inherit;opacity:.8}',
        '.tv-launch .tv-lchip:hover{opacity:1;border-color:var(--sk-accent)}',
        '.tv-launch .tv-lnote{margin-top:10px;font-size:11.5px;color:var(--sk-fg);opacity:.65;line-height:1.6}',
        '.tv-launch .tv-lsearch{position:relative;max-width:420px;margin-bottom:10px}',
        '.tv-launch .tv-lsearch input{width:100%;font:inherit;color:var(--sk-fg);background:var(--sk-input);border:1px solid var(--sk-border);border-radius:6px;padding:8px 10px}',
        '.tv-launch .tv-lac{position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:280px;overflow:auto;background:var(--sk-bg);border:1px solid var(--sk-border);border-radius:6px;box-shadow:0 12px 28px rgba(0,0,0,.35);z-index:20;padding:3px}',
        '.tv-launch .tv-lac[hidden]{display:none}',
        '.tv-launch .tv-lac button{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:8px;width:100%;padding:6px 9px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:12.5px;text-align:left;cursor:pointer}',
        '.tv-launch .tv-lac .tv-sek{font-size:10.5px;opacity:.55;white-space:nowrap}',
        '.tv-launch .tv-lac button.on,.tv-launch .tv-lac button:hover{background:var(--sk-input)}',
        '.tv-launch .tv-lac .tv-kode{font-weight:600}',
        '.tv-launch .tv-lac .tv-nama{opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.tv-launch .tv-i{width:15px;height:15px;margin-right:6px;vertical-align:-3px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
        '@media (max-width:1180px){#tv-ov .tv-rail{display:none}#tv-ov .tv-grid{grid-template-columns:1fr}#tv-ov .tv-item{grid-template-columns:74px minmax(0,1fr) 96px}}',
        '@media (max-width:1520px){#tv-ov .tv-lb{display:none}#tv-ov .tv-acts .tv-i{margin-right:0}#tv-ov .tv-acts button{padding:5px 9px}}',
        '@media (max-width:860px){#tv-ov .tv-set{left:12px;width:auto}#tv-ov .tv-brand .tv-bname{display:none}#tv-ov .tv-chips{display:none}#tv-ov .tv-top select{max-width:126px}#tv-ov .tv-item{grid-template-columns:74px minmax(0,1fr)}#tv-ov .tv-item .tv-sek,#tv-ov .tv-item .tv-papan{display:none}}',
        // Drawer chat AI analisa (otak trading terpisah). Mengambang di kanan, chart tidak bergeser.
        '#tv-ov .tv-ai{position:absolute;top:0;right:0;bottom:0;width:392px;max-width:94vw;z-index:6;display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:var(--sk-bg,var(--vscode-editor-background,#1e1e1e));border-left:1px solid var(--sk-border,rgba(128,128,128,.4));box-shadow:-18px 0 44px rgba(0,0,0,.38)}',
        '#tv-ov .tv-ai[hidden]{display:none}',
        '#tv-ov .tv-ai-head{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}',
        '#tv-ov .tv-ai-head .tv-i{width:16px;height:16px;margin-right:0}',
        '#tv-ov .tv-ai-head b{font-weight:600}',
        '#tv-ov .tv-ai-head .tv-chip{margin-left:auto;font-size:11px;font-weight:400;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:10px;padding:1px 8px;opacity:.8;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#tv-ov .tv-ai-x{padding:3px 7px;border-radius:6px}',
        '#tv-ov .tv-ai-x .tv-i{margin:0}',
        '#tv-ov .tv-ai-model{display:flex;gap:6px;align-items:center}',
        '#tv-ov .tv-ai-model select{flex:1;min-width:0}',
        '#tv-ov .tv-ai-live{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px;font-size:11.5px;line-height:1.5;padding-top:6px;border-top:1px solid var(--sk-border,rgba(128,128,128,.25));opacity:.9}',
        '#tv-ov .tv-ai-live .up{color:#26a69a}',
        '#tv-ov .tv-ai-live .down{color:#ef5350}',
        '#tv-ov .tv-ai-live .muted{opacity:.6}',
        '#tv-ov .tv-ai-log{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px}',
        '#tv-ov .tv-ai-msg{border:1px solid var(--sk-border,rgba(128,128,128,.28));border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.62;white-space:pre-wrap;word-break:break-word}',
        '#tv-ov .tv-ai-msg strong{font-weight:700}',
        '#tv-ov .tv-ai-msg em{font-style:italic}',
        '#tv-ov .tv-ai-msg code{font-family:var(--vscode-editor-font-family,Consolas,monospace);font-size:11px;background:rgba(128,128,128,.18);border-radius:3px;padding:0 3px}',
        '#tv-ov .tv-ai-msg .md-p{margin:2px 0}',
        '#tv-ov .tv-ai-msg .md-h{font-weight:700;margin:6px 0 2px;line-height:1.4}',
        '#tv-ov .tv-ai-msg ul,#tv-ov .tv-ai-msg ol{margin:3px 0 3px 16px;padding:0}',
        '#tv-ov .tv-ai-msg.user{background:var(--sk-input,rgba(128,128,128,.14));opacity:.92}',
        '#tv-ov .tv-ai-msg.ai{background:transparent}',
        '#tv-ov .tv-ai-msg.thinking{opacity:.6;font-style:italic}',
        '#tv-ov .tv-ai-msg.err{border-color:#ef5350;color:#ef5350}',
        '#tv-ov .tv-ai-note{font-size:11.5px;opacity:.6;line-height:1.6}',
        // Kursor berkedip saat jawaban sedang mengalir (animasi mengetik).
        '#tv-ov .tv-ai-msg.streaming::after{content:"▍";margin-left:1px;opacity:.75;animation:tv-blink 1s steps(1) infinite}',
        '@keyframes tv-blink{50%{opacity:0}}',
        // Tab Buku: grid sampul + info + harga + Free sample.
        '#tv-ov .tv-bgrid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;align-content:start;padding:2px}',
        '#tv-ov .tv-bcard{display:flex;flex-direction:column;border:1px solid var(--sk-border,rgba(128,128,128,.3));border-radius:8px;background:var(--sk-input,rgba(128,128,128,.06));overflow:hidden;min-width:0}',
        '#tv-ov .tv-bcover{width:100%;height:190px;background:rgba(128,128,128,.14);display:flex;align-items:center;justify-content:center;font-size:28px;overflow:hidden}',
        '#tv-ov .tv-bcover img{width:100%;height:100%;object-fit:contain;display:block;background:#0f0f0f}',
        '#tv-ov .tv-bbody{display:flex;flex-direction:column;gap:4px;padding:8px 9px 9px;min-width:0;flex:1}',
        '#tv-ov .tv-bt{font-size:12.5px;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}',
        '#tv-ov .tv-ba{font-size:11px;opacity:.66;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '#tv-ov .tv-bd{font-size:10.5px;opacity:.55}',
        '#tv-ov .tv-bprice{font-size:13px;font-weight:700;color:#26a69a;font-variant-numeric:tabular-nums}',
        '#tv-ov .tv-btags{display:flex;flex-wrap:wrap;gap:3px}',
        '#tv-ov .tv-btag{font-size:9px;border:1px solid var(--sk-border,rgba(128,128,128,.35));border-radius:3px;padding:0 4px;opacity:.8}',
        '#tv-ov .tv-btag.ok{border-color:#26a69a;color:#26a69a}',
        '#tv-ov .tv-btag.warn{border-color:#d1a33a;color:#d1a33a}',
        '#tv-ov .tv-bact{display:flex;gap:6px;margin-top:auto;padding-top:4px}',
        '#tv-ov .tv-sample{padding:5px 9px;font-size:11.5px;flex:1;justify-content:center}',
        '#tv-ov .tv-binfo{padding:5px 8px;font-size:11.5px}',
        // Tab Media: toggle Gambar/Video + grid hasil Pexels.
        '#tv-ov .tv-seg{padding:5px 10px;font-size:12px;opacity:.7}',
        '#tv-ov .tv-seg.on{opacity:1;border-color:var(--sk-accent,var(--vscode-focusBorder,#007fd4));font-weight:600}',
        '#tv-ov .tv-mgrid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;align-content:start;padding:2px}',
        '#tv-ov .tv-mcard{display:flex;flex-direction:column;border:1px solid var(--sk-border,rgba(128,128,128,.3));border-radius:8px;overflow:hidden;background:var(--sk-input,rgba(128,128,128,.06));min-width:0}',
        '#tv-ov .tv-mthumb{position:relative;height:130px;background:rgba(128,128,128,.14);overflow:hidden}',
        '#tv-ov .tv-mthumb img{width:100%;height:100%;object-fit:cover;display:block}',
        '#tv-ov .tv-mplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(0,0,0,.28)}',
        '#tv-ov .tv-mplay .tv-i{width:34px;height:34px;margin:0;stroke-width:1.6}',
        '#tv-ov .tv-mdur{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.68);color:#fff;font-size:10px;border-radius:3px;padding:1px 5px}',
        '#tv-ov .tv-mbody{display:flex;flex-direction:column;gap:3px;padding:7px 9px 9px;min-width:0}',
        '#tv-ov .tv-mt{font-size:12px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}',
        '#tv-ov .tv-mm{font-size:10.5px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '#tv-ov .tv-mact{display:flex;gap:6px;margin-top:3px}',
        '#tv-ov .tv-mact button{padding:4px 8px;font-size:11.5px}',
        '#tv-ov .tv-mact .tv-primary{flex:1;justify-content:center}',
        '#tv-ov .tv-mdl .tv-i{width:13px;height:13px;margin-right:3px}',
        '#tv-ov .tv-ai-ask{display:flex;gap:6px}',
        '#tv-ov .tv-ai-ask input{flex:1;min-width:0}',
        '#tv-ov .tv-ai-foot{font-size:10.5px;opacity:.5;line-height:1.55}',
        '#tv-ov #tv-btn-ai.on{border-color:var(--sk-accent,var(--vscode-focusBorder,#007fd4));color:inherit;font-weight:600}',
        '@media (max-width:860px){#tv-ov .tv-ai{width:100%;max-width:none}}',
    ].join('\n');

    function ensureCss() {
        if (document.getElementById('sk-tv-css')) { return; }
        const st = el('style');
        st.id = 'sk-tv-css';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    // ── deteksi simbol dari data ────────────────────────────────────────────────
    /**
     * Cari kode emiten di berkas: kolom Ticker/Symbol/Kode/Emiten, atau nama berkas
     * seperti “BBCA.JK.csv”. Mengembalikan '' bila tidak ada.
     */
    function detectSymbol() {
        try {
            const headers = (S && S.headers) || [];
            const rows = (S && S.rows) || [];
            const want = /^(ticker|symbol|kode|kode saham|kode emiten|emiten|saham|stock|stock code)$/i;
            const at = headers.findIndex((h) => want.test(String(h || '').trim()));
            if (at >= 0) {
                const count = {};
                rows.slice(0, 3000).forEach((r) => {
                    const v = String((r && r[at]) || '').trim().toUpperCase().replace(/\.JK$/, '');
                    if (/^[A-Z]{4}$/.test(v)) { count[v] = (count[v] || 0) + 1; }
                });
                const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
                if (best) { return 'IDX:' + best; }
            }
            const fileName = String((P && P.state && P.state.fileName) || '');
            const m = fileName.toUpperCase().match(/(?:^|[^A-Z])([A-Z]{4})(?:\.JK)?(?:\.[A-Z]+)?$/);
            if (m) { return 'IDX:' + m[1]; }
        } catch (e) { /* data belum siap */ }
        return '';
    }

    // ── mesin widget TradingView ────────────────────────────────────────────────
    /**
     * URL iframe widget resmi. Sama seperti yang dibangun skrip embed TradingView:
     *   <host>/embed-widget/<jenis>/?locale=..&symbol=..#<JSON setelan (di-encode)>
     *
     * Penting: `symbol` (dan `market`) HARUS ada di query string — widget seperti
     * symbol-info, financials, symbol-profile, dan timeline membaca simbol dari sana;
     * bila hanya ditaruh di hash, widget jatuh ke simbol bawaan (AAPL).
     * Widget “timeline” (berita) hanya mendukung bahasa Inggris, jadi locale dipaksa 'en'
     * persis seperti skrip embed resmi.
     */
    function widgetSrc(kind, settings, hostIdx) {
        const set = {};
        Object.keys(settings).forEach((k) => { if (settings[k] !== undefined) { set[k] = settings[k]; } });
        const locale = kind === 'timeline' ? 'en' : (set.locale || cfg.locale || 'id');
        set.locale = locale;
        const q = ['locale=' + encodeURIComponent(locale)];
        if (set.symbol) { q.push('symbol=' + encodeURIComponent(set.symbol)); }
        if (set.market) { q.push('market=' + encodeURIComponent(set.market)); }
        return HOSTS[hostIdx] + '/embed-widget/' + kind + '/?' + q.join('&')
            + '#' + encodeURIComponent(JSON.stringify(set));
    }

    /**
     * Pasang satu widget resmi TradingView di dalam `host`.
     * `kind` = nama widget (advanced-chart, technical-analysis, …).
     *
     * Iframe dipasang langsung (bukan lewat skrip embed) supaya ukurannya pasti 100% × 100%
     * dan tidak bergantung pada pesan pengatur-ukuran dari TradingView — penyebab umum kotak
     * abu-abu kosong. Penanda “memuat” hilang begitu iframe selesai memuat (atau saat widget
     * mengirim sinyal siap), lalu bilah bantuan muncul bila chart tetap tidak tampil.
     */
    function mount(kind, config, host, opts) {
        const o = opts || {};
        // Widget non-chart diberi ukuran 100% × 100% agar mengisi kotaknya; chart memakai autosize.
        const settings = Object.assign({}, config);
        if (settings.autosize !== true) {
            if (settings.width === undefined) { settings.width = '100%'; }
            if (settings.height === undefined) { settings.height = '100%'; }
        }
        const box = el('div', 'tv-wbox' + (o.cls ? ' ' + o.cls : ''));
        const frame = el('iframe', 'tv-frame');
        frame.setAttribute('frameborder', '0');
        frame.setAttribute('allowtransparency', 'true');
        frame.setAttribute('allowfullscreen', 'true');
        frame.setAttribute('scrolling', 'no');
        frame.setAttribute('loading', 'eager');
        frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        frame.setAttribute('title', kind + ' TradingView');
        box.appendChild(frame);
        const skel = el('div', 'tv-skel');
        skel.innerHTML = '<span class="tv-spin"></span><span>' + esc(L('Memuat widget TradingView…', '正在加载 TradingView 组件…')) + '</span>';
        box.appendChild(skel);
        host.appendChild(box);

        const st = {
            kind: kind, settings: settings, box: box, frame: frame,
            hostIdx: 0, ready: false, dead: false, mine: renderSeq,
            fallback: o.fallback || null,
            tSwap: 0, tFail: 0, tHint: 0, tFallback: 0,
        };
        frames.set(box, st);
        frame.onload = () => {
            st.loaded = true;
            box.classList.add('tv-ready');
            if (st.tSwap) { clearTimeout(st.tSwap); st.tSwap = 0; }
        };
        frame.src = widgetSrc(kind, settings, 0);
        watch(st);
        return box;
    }

    /**
     * Pemantauan pemuatan: bila dokumen widget belum termuat, coba host cadangan;
     * bila tetap tidak termuat, tunjukkan pemberitahuan (bukan kotak kosong).
     * Begitu `load` iframe terjadi, widget dianggap termuat — tidak ada penggantian
     * host yang tidak perlu dan tidak ada pesan galat palsu.
     */
    function watch(st) {
        st.tSwap = setTimeout(() => {
            if (!live(st) || st.loaded) { return; }
            if (st.hostIdx === 0) {
                st.hostIdx = 1;
                st.frame.src = widgetSrc(st.kind, st.settings, 1);
                return;
            }
            st.tFail = setTimeout(() => { if (live(st) && !st.loaded) { fail(st); } }, 8000);
        }, 8000);

        // Widget yang sudah termuat tetapi tidak pernah mengirim sinyal siap (mis. data feed
        // diblokir) tetap diberi jalan keluar singkat di bawah kotak — tanpa menutupi chart.
        if (st.kind === 'advanced-chart') {
            st.tHint = setTimeout(() => { if (live(st)) { hint(st); } }, 9000);
        }

        // Kotak kosong tidak dibiarkan: bila widget pengganti disiapkan dan widget ini tidak
        // pernah melapor siap, kotaknya diganti widget lain yang menampilkan data lain.
        if (st.fallback) {
            st.tFallback = setTimeout(() => { if (live(st)) { gantiWidget(st); } }, 9000);
        }
    }

    /** Ganti isi satu kotak dengan widget cadangan (dipakai bila widget pertama kosong). */
    function gantiWidget(st) {
        const host = st.box ? st.box.parentElement : null;
        if (!host || !st.fallback) { return; }
        const old = st.box;
        st.dead = true;
        frames.delete(old);
        const next = mount(st.fallback.kind, st.fallback.config, host, {});
        host.insertBefore(next, old);
        host.removeChild(old);
    }

    /** Bilah bantuan kecil di bawah kotak chart (tidak menutupi grafik). */
    function hint(st) {
        const box = st.box;
        if (!box || !box.isConnected || box.querySelector('.tv-hint')) { return; }
        const bar = el('div', 'tv-hint');
        bar.innerHTML =
            '<span>' + esc(L('Chart belum tampil? Muat ulang atau buka di browser.', '图表尚未显示？请重载或在浏览器中打开。')) + '</span>' +
            '<button class="tv-hint-reload">' + icon('reload') + esc(L('Muat ulang', '重载')) + '</button>' +
            '<button class="tv-hint-open">' + icon('link') + esc(L('Buka', '打开')) + '</button>';
        bar.querySelector('.tv-hint-reload').onclick = () => { renderMain(); };
        bar.querySelector('.tv-hint-open').onclick = () => openExternal(tvChartUrl(cfg.symbol));
        box.appendChild(bar);
    }

    function live(st) { return st && !st.dead && st.ready !== true && st.mine === renderSeq && st.box.isConnected; }

    /** Widget benar-benar tidak bisa dimuat: beri penjelasan + tombol, jangan kotak kosong. */
    function fail(st) {
        const box = st.box;
        if (!box || !box.isConnected) { return; }
        st.dead = true;
        const off = el('div', 'tv-off');
        off.innerHTML =
            icon('offline') +
            '<p>' + esc(L('Widget TradingView tidak dapat dimuat. Periksa koneksi internet atau blokir jaringan.',
                'TradingView 组件无法加载。请检查网络连接或防火墙。')) + '</p>' +
            '<div class="tv-off-act">' +
            '<button class="tv-retry">' + icon('reload') + esc(L('Coba lagi', '重试')) + '</button>' +
            '<button class="tv-primary tv-open">' + icon('link') + esc(L('Buka di browser', '在浏览器中打开')) + '</button>' +
            '</div>';
        if (box.querySelector('.tv-skel')) { box.removeChild(box.querySelector('.tv-skel')); }
        box.appendChild(off);
        off.querySelector('.tv-retry').onclick = () => {
            if (off.parentElement) { off.parentElement.removeChild(off); }
            frames.delete(box);
            st.dead = true;
            const host = box.parentElement;
            if (host) {
                const next = mount(st.kind, st.settings, host);
                host.insertBefore(next, box);
                host.removeChild(box);
            }
        };
        off.querySelector('.tv-open').onclick = () => openExternal(tvChartUrl(cfg.symbol));
    }

    /** Sinyal dari widget TradingView (tv-widget-ready / load / no-data). */
    function onWidgetMessage(ev) {
        if (!ev || !ev.data) { return; }
        let d = ev.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
        if (!d || typeof d !== 'object' || !d.name) { return; }
        let hit = null;
        frames.forEach((st) => { if (!hit && st.frame && st.frame.contentWindow === ev.source) { hit = st; } });
        if (!hit) { return; }
        if (d.name === 'tv-widget-ready' || d.name === 'tv-widget-load') {
            hit.ready = true;
            hit.box.classList.add('tv-ready');
            if (hit.tSwap) { clearTimeout(hit.tSwap); hit.tSwap = 0; }
            if (hit.tFail) { clearTimeout(hit.tFail); hit.tFail = 0; }
            if (hit.tFallback) { clearTimeout(hit.tFallback); hit.tFallback = 0; }
        }
    }
    window.addEventListener('message', onWidgetMessage);

    /** Lepas semua pemantauan (dipakai saat lapisan ditutup). */
    function disposeFrames() {
        frames.forEach((st) => {
            st.dead = true;
            if (st.tSwap) { clearTimeout(st.tSwap); }
            if (st.tFail) { clearTimeout(st.tFail); }
            if (st.tHint) { clearTimeout(st.tHint); }
            if (st.tFallback) { clearTimeout(st.tFallback); }
        });
        frames.clear();
    }

    function chosenStudies() {
        return STUDIES.filter((s) => cfg.studies.indexOf(s.k) >= 0);
    }

    // ── chat AI analisa (drawer kanan) ──────────────────────────────────────────
    /** Gelembung pesan di drawer AI. */
    function aiSay(kind, text) {
        if (!aiEl) { return null; }
        const log = aiEl.querySelector('#tv-ai-log');
        if (!log) { return null; }
        const box = el('div', 'tv-ai-msg' + (kind ? ' ' + kind : ''), text);
        log.appendChild(box);
        log.scrollTop = log.scrollHeight;
        return box;
    }

    function aiChip(text) {
        if (!aiEl) { return; }
        const chip = aiEl.querySelector('#tv-ai-chip');
        if (chip) { chip.textContent = text; }
    }

    /** Daftar model otak trading di drawer (pilihan aktif tidak dihapus saat daftar sama). */
    function aiModels(models, selected) {
        if (!aiEl) { return; }
        const sel = aiEl.querySelector('#tv-ai-model');
        if (!sel) { return; }
        const list = Array.isArray(models) ? models : [];
        const key = list.map((m) => m.path).join('|');
        if (sel.getAttribute('data-key') !== key) {
            clear(sel);
            if (!list.length) {
                const kosong = el('option', null, L('(belum ada berkas .gguf)', '(没有 .gguf 文件)'));
                kosong.value = '';
                sel.appendChild(kosong);
            }
            list.forEach((m) => {
                const o = el('option', null, (m.name || '') + (m.size ? ' · ' + m.size : ''));
                o.value = m.path;
                o.title = m.path;
                sel.appendChild(o);
            });
            sel.setAttribute('data-key', key);
        }
        if (selected) { sel.value = selected; }
    }

    /** Keadaan otak trading: chip siap/berhenti + tombol Nyalakan/Hentikan. */
    function aiApplyState(ai) {
        if (!aiEl) { return; }
        aiInfo = ai || {};
        const ready = !!aiInfo.ready || aiInfo.state === 'running';
        const label = aiInfo.state === 'starting' ? L('memuat…', '加载中…') : ready ? L('siap', '就绪') : L('berhenti', '停止');
        aiChip(label + (aiInfo.port ? ' · port ' + aiInfo.port : ''));
        const start = aiEl.querySelector('#tv-ai-start');
        if (start) {
            const starting = aiInfo.state === 'starting';
            start.textContent = starting ? L('Memuat…', '加载中…') : ready ? L('Hentikan', '停止') : L('Nyalakan', '启动');
            start.setAttribute('data-on', ready ? '1' : '');
            start.disabled = starting;
        }
        if (aiInfo.models) { aiModels(aiInfo.models, aiInfo.modelPath); }
    }

    function aiBusySet(on) {
        aiBusy = !!on;
        if (!aiEl) { return; }
        const q = aiEl.querySelector('#tv-ai-q');
        const send = aiEl.querySelector('#tv-ai-send');
        if (q) { q.disabled = aiBusy; }
        if (send) { send.disabled = aiBusy; }
        aiEl.classList.toggle('busy', aiBusy);
    }

    /** Angka harga ringkas untuk baris data live di drawer. */
    function hargaRingkas(n) {
        if (typeof n !== 'number' || !isFinite(n)) { return '—'; }
        const d = Math.abs(n) >= 100 ? 0 : 2;
        return n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    /** Baris harga terbaru (simbol, harga, perubahan, sesi, waktu data) di drawer AI. */
    function aiLive(m) {
        if (!aiEl) { return; }
        const box = aiEl.querySelector('#tv-ai-live');
        if (!box) { return; }
        const t = m && m.teknik;
        if (!t) { box.textContent = '—'; return; }
        const up = Number(t.changePct) >= 0;
        const pct = isFinite(t.changePct) ? Number(t.changePct) : 0;
        box.textContent = '';
        const sym = el('b', null, String(t.symbol || m.symbol || cfg.symbol));
        const price = el('span', null, ' ' + hargaRingkas(t.last) + ' ');
        const chg = el('span', up ? 'up' : 'down', (up ? '+' : '') + nf(pct, 2) + '%');
        const rest = el('span', 'muted', ' · ' + (m.sesi || '') + (m.waktu ? ' · ' + m.waktu : ''));
        box.append(sym, price, chg, rest);
    }

    function aiBegin() {
        if (!aiEl) { return; }
        if (aiStream && aiStream.parentElement) { aiStream.parentElement.removeChild(aiStream); }
        aiStream = aiSay('ai thinking', L('Membaca data pasar…', '正在读取市场数据…'));
    }

    /** Animasi mengetik: teks muncul bertahap, kursor berkedip sampai jawaban selesai. */
    function aiType(node, full) {
        if (!node) { return; }
        node.dataset.raw = full;
        if (typeof window.requestAnimationFrame !== 'function') {
            node.textContent = full;
            return;
        }
        if (node._typer) { return; }
        // Potongan pertama tampil utuh; potongan berikutnya dianimasikan mengetik.
        if (!String(node.textContent || '').length) {
            node.textContent = full;
            node._typer = false;
            return;
        }
        node._typer = true;
        const step = () => {
            const target = String(node.dataset.raw || '');
            const shown = String(node.textContent || '');
            if (shown.length >= target.length) { node._typer = false; return; }
            const add = Math.max(2, Math.ceil((target.length - shown.length) / 10));
            node.textContent = target.slice(0, shown.length + add);
            const log = node.parentElement;
            if (log) { log.scrollTop = log.scrollHeight; }
            window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    function aiChunk(text) {
        if (!aiStream) { aiBegin(); }
        if (!aiStream) { return; }
        if (aiStream.classList.contains('thinking')) {
            aiStream.classList.remove('thinking');
            aiStream.textContent = '';
            aiStream.dataset.raw = '';
        }
        const full = String(aiStream.dataset.raw || '') + String(text || '');
        aiStream.classList.add('streaming');
        aiType(aiStream, full);
    }

    function aiAnswer(text) {
        const body = String(text || '').trim();
        if (!aiStream) { aiStream = aiSay('ai', ''); }
        if (!aiStream) { return; }
        aiStream.classList.remove('thinking');
        aiStream.classList.remove('streaming');
        aiStream._typer = false;
        aiStream.dataset.raw = '';
        if (window.SkunderMd) {
            window.SkunderMd.block(aiStream, body || L('(tidak ada jawaban)', '(无回答)'));
        } else {
            aiStream.textContent = body || L('(tidak ada jawaban)', '(无回答)');
        }
        const log = aiStream.parentElement;
        if (log) { log.scrollTop = log.scrollHeight; }
        aiStream = null;
    }

    function aiError(text) {
        if (aiStream && aiStream.parentElement) { aiStream.parentElement.removeChild(aiStream); }
        aiStream = null;
        aiSay('err', String(text || L('galat', '错误')));
    }

    function aiNote(text) {
        if (!aiEl) { return; }
        const log = aiEl.querySelector('#tv-ai-log');
        if (!log) { return; }
        const note = el('div', 'tv-ai-note', String(text || ''));
        log.appendChild(note);
        log.scrollTop = log.scrollHeight;
    }

    function aiSend() {
        if (!aiEl || aiBusy) { return; }
        const q = aiEl.querySelector('#tv-ai-q');
        if (!q) { return; }
        const text = String(q.value || '').trim();
        if (!text) { return; }
        q.value = '';
        aiSay('user', text);
        aiBegin();
        post({ type: 'tvAiAsk', text: text, symbol: cfg.symbol });
    }

    function aiToggle() {
        if (!aiEl) { return; }
        if (aiEl.hidden) { aiOpen(); } else { aiClose(); }
    }

    function aiOpen() {
        if (!aiEl) { return; }
        aiEl.hidden = false;
        const btn = ov && ov.querySelector('#tv-btn-ai');
        if (btn) { btn.classList.add('on'); }
        // Keadaan & daftar model diminta saat drawer dibuka (bukan saat halaman dimuat).
        post({ type: 'tvAiState' });
        post({ type: 'tvAiModels' });
        // Data pasar simbol aktif diminta ulang agar baris live & jawaban mengikuti harga terbaru.
        post({ type: 'tvAiWatch', symbol: cfg.symbol });
        const q = aiEl.querySelector('#tv-ai-q');
        if (q) { setTimeout(() => { if (q.isConnected) { q.focus(); } }, 40); }
    }

    function aiClose() {
        if (!aiEl) { return; }
        aiEl.hidden = true;
        const btn = ov && ov.querySelector('#tv-btn-ai');
        if (btn) { btn.classList.remove('on'); }
    }

    /** Drawer kanan: pilih model, nyalakan otak trading, tanya analisa. */
    function buildAi() {
        const box = el('aside', 'tv-ai');
        box.id = 'tv-ai';
        box.hidden = true;
        box.innerHTML =
            '<div class="tv-ai-head">' + icon('chat') +
            '<b>' + esc(L('Analisa AI', 'AI 分析')) + '</b>' +
            '<span id="tv-ai-chip" class="tv-chip">…</span>' +
            '<button id="tv-ai-new" class="tv-ai-x" title="' + esc(L('Percakapan baru', '新对话')) + '">＋</button>' +
            '<button id="tv-ai-x" class="tv-ai-x" title="' + esc(L('Tutup panel AI', '关闭 AI 面板')) + '">' + icon('close') + '</button>' +
            '</div>' +
            '<div class="tv-ai-model">' +
            '<select id="tv-ai-model" title="' + esc(L('Model .gguf otak trading', '交易大脑模型')) + '"><option value="">' + esc(L('(memindai model…)', '(正在扫描模型…)')) + '</option></select>' +
            '<button id="tv-ai-start">' + esc(L('Nyalakan', '启动')) + '</button>' +
            '<button id="tv-ai-scan" title="' + esc(L('Pindai ulang berkas .gguf', '重新扫描 .gguf')) + '">⟳</button>' +
            '</div>' +
            '<div id="tv-ai-live" class="tv-ai-live">—</div>' +
            '<div id="tv-ai-log" class="tv-ai-log"></div>' +
            '<div class="tv-ai-ask">' +
            '<input id="tv-ai-q" type="text" spellcheck="false" autocomplete="off" placeholder="' + esc(L('Tanya: aman buy sekarang?', '提问：现在适合买入吗？')) + '">' +
            '<button id="tv-ai-send" class="tv-primary">' + esc(L('Kirim', '发送')) + '</button>' +
            '</div>' +
            '<div class="tv-ai-foot">' + esc(L('Otak trading terpisah dari Skunder AI: port, model, dan terminal sendiri. Data diambil langsung, tidak perlu berkas CSV.', '交易大脑独立于 Skunder AI：独立端口、模型与终端。数据直接获取，无需 CSV。')) + '</div>';
        box.querySelector('#tv-ai-x').onclick = () => aiClose();
        box.querySelector('#tv-ai-new').onclick = () => {
            post({ type: 'tvAiNewChat' });
            const log = box.querySelector('#tv-ai-log');
            if (log) { clear(log); }
            aiStream = null;
            aiNote(L('Percakapan baru.', '新对话。'));
        };
        box.querySelector('#tv-ai-model').onchange = (ev) => {
            const path = String(ev.target.value || '');
            if (path) { post({ type: 'tvAiModel', path: path }); }
        };
        box.querySelector('#tv-ai-start').onclick = (ev) => {
            const on = ev.currentTarget.getAttribute('data-on') === '1';
            post({ type: 'tvAiServer', action: on ? 'stop' : 'start' });
        };
        box.querySelector('#tv-ai-scan').onclick = () => {
            aiChip(L('memindai…', '扫描中…'));
            post({ type: 'tvAiModels' });
        };
        box.querySelector('#tv-ai-send').onclick = () => aiSend();
        box.querySelector('#tv-ai-q').onkeydown = (ev) => {
            if (ev.key === 'Enter') { aiSend(); }
            if (ev.key === 'Escape') { ev.stopPropagation(); aiClose(); }
        };
        return box;
    }

    // ── overlay ─────────────────────────────────────────────────────────────────
    function status(text) {
        if (statusEl) { statusEl.textContent = text; }
    }

    function buildOverlay() {
        ensureCss();
        const x = el('div', 'tv-ov');
        x.id = OV_ID;
        x.style.setProperty('--tv-bg', themeBg());

        // Baris atas: merek + pencarian simbol + interval/gaya/rentang + aksi.
        const top = el('div', 'tv-top');
        const brand = el('div', 'tv-brand');
        brand.innerHTML = icon('chart') + '<span class="tv-bname">' + esc(L('MODE ANALISIS', '分析模式')) + '</span><b>TradingView</b>';
        top.appendChild(brand);

        const symWrap = el('div', 'tv-sym');
        const input = el('input');
        input.id = 'tv-symbol';
        input.type = 'text';
        input.value = cfg.symbol;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.title = L('Cari kode atau nama saham (941 emiten IDX, indeks, saham AS, komoditas, kurs)',
            '搜索代码或公司名称（941 家 IDX 公司、指数、美股、商品、汇率）');
        const ac = el('div', 'tv-ac');
        ac.id = 'tv-symbol-ac';
        ac.hidden = true;
        const go = el('button', 'tv-primary');
        go.innerHTML = icon('search');
        go.title = L('Tampilkan simbol ini', '显示该代码');
        go.onclick = () => { applySymbol(input.value); hideAc(); };
        input.onkeydown = (e) => { if (e.key === 'Enter') { go.onclick(); } };
        symWrap.appendChild(input);
        symWrap.appendChild(go);
        symWrap.appendChild(ac);
        top.appendChild(symWrap);
        attachSuggest(input, ac, (simbol) => { applySymbol(simbol); });

        top.appendChild(selectEl('tv-interval', INTERVALS, cfg.interval, L('Interval', '周期'), (v) => {
            cfg.interval = v; saveCfg(); renderAll();
        }));
        top.appendChild(selectEl('tv-style', STYLES, cfg.style, L('Gaya grafik', '图形样式'), (v) => {
            cfg.style = v; saveCfg(); renderAll();
        }));
        top.appendChild(selectEl('tv-range', RANGES, cfg.range, L('Rentang', '区间'), (v) => {
            cfg.range = v; saveCfg(); renderAll();
        }));

        const acts = el('div', 'tv-acts');
        const bAi = el('button');
        bAi.innerHTML = icon('chat') + '<span class="tv-lb">' + esc(L('Analisa AI', 'AI 分析')) + '</span>';
        bAi.id = 'tv-btn-ai';
        bAi.title = L('Chat AI analisa saham — otak trading terpisah (port, model, terminal sendiri)', 'AI 股票分析对话 — 独立交易大脑（独立端口、模型、终端）');
        bAi.setAttribute('aria-label', L('Analisa AI', 'AI 分析'));
        bAi.onclick = () => aiToggle();
        const bSet = el('button');
        bSet.innerHTML = icon('gear') + '<span class="tv-lb">' + esc(L('Setelan', '设置')) + '</span>';
        bSet.title = L('Setelan tampilan widget & indikator cepat', '组件显示与快捷指标设置');
        bSet.setAttribute('aria-label', L('Setelan', '设置'));
        bSet.id = 'tv-btn-settings';
        bSet.onclick = () => toggleSettings();
        const bFull = el('button');
        bFull.innerHTML = icon('expand') + '<span class="tv-lb">' + esc(L('Layar penuh', '全屏')) + '</span>';
        bFull.id = 'tv-btn-full';
        bFull.title = L('Sembunyikan panel VS Code (mode Zen) supaya chart memakai seluruh layar', '隐藏 VS Code 面板（Zen 模式），让图表占满屏幕');
        bFull.onclick = () => {
            zenOn = !zenOn;
            bFull.classList.toggle('tv-primary', zenOn);
            post({ type: 'tradingFullscreen', on: zenOn });
            status(zenOn ? L('Mode layar penuh — tekan Esc untuk keluar', '全屏模式 — 按 Esc 退出') : '');
        };
        const bReload = el('button');
        bReload.innerHTML = icon('reload') + '<span class="tv-lb">' + esc(L('Muat ulang', '重载')) + '</span>';
        bReload.id = 'tv-btn-reload';
        bReload.title = L('Muat ulang semua widget TradingView', '重新加载所有 TradingView 组件');
        bReload.onclick = () => { renderMain(); };
        const bX = el('button', 'tv-x');
        bX.innerHTML = icon('close');
        bX.id = 'tv-btn-close';
        bX.title = L('Tutup mode analisis (Esc)', '关闭分析模式（Esc）');
        bX.onclick = () => close();
        acts.append(bAi, bSet, bFull, bReload, bX);
        top.appendChild(acts);
        x.appendChild(top);

        // Baris tab + status.
        const tabs = el('div', 'tv-tabs');
        TABS.forEach((t) => {
            const b = el('button', 'tv-tab' + (tab === t.id ? ' on' : ''));
            b.innerHTML = icon(t.icon) + '<span>' + esc(L(t.idl, t.zhl)) + '</span>';
            b.dataset.tvTab = t.id;
            b.onclick = () => { tab = t.id; renderMain(); };
            tabs.appendChild(b);
        });
        statusEl = el('span', 'tv-status');
        tabs.appendChild(statusEl);
        x.appendChild(tabs);

        // Chip simbol cepat.
        const chips = el('div', 'tv-chips');
        QUICK.forEach((q) => {
            const c = el('button', 'tv-chip' + (q.s === cfg.symbol ? ' on' : ''), q.d);
            c.title = q.n + ' — ' + q.s;
            c.onclick = () => { applySymbol(q.s); };
            chips.appendChild(c);
        });
        x.appendChild(chips);

        bodyEl = el('div', 'tv-body');
        x.appendChild(bodyEl);

        // Drawer chat AI analisa: mengambang di kanan, tidak menggeser chart (iframe tidak perlu dimuat ulang).
        aiStream = null;
        aiEl = buildAi();
        x.appendChild(aiEl);

        // Pita harga TradingView dihapus: saat jaringan lambat/lambat memuat, bilah 46px itu
        // hanya menyisakan kotak kosong di bawah chart. Seluruh info pasar kini ada di dalam
        // widget chart/Teknikal/Screener yang memang tampil penuh.

        const foot = el('div', 'tv-foot');
        foot.id = 'tv-foot';
        x.appendChild(foot);
        paintFoot();

        setEl = buildSettings();
        x.appendChild(setEl);

        // Esc: tutup setelan dulu, lalu lapisan.
        x.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') { return; }
            if (setEl && !setEl.hidden) { setEl.hidden = true; e.stopPropagation(); return; }
            close();
            e.stopPropagation();
        });

        return x;
    }

    /** Footer: sumber data + simbol aktif beserta namanya + tautan ke browser. */
    function paintFoot() {
        const foot = document.getElementById('tv-foot');
        if (!foot) { return; }
        const nama = saham().nameOf(cfg.symbol);
        foot.innerHTML =
            '<span>' + esc(L('Data & analisis dari TradingView. Bukan rekomendasi investasi.',
                '数据与分析来自 TradingView。非投资建议。')) + '</span>' +
            '<span>' + esc(L('Simbol', '代码')) + ': <b>' + esc(cfg.symbol) + '</b>' +
            (nama ? ' · ' + esc(nama) : '') + ' · ' + esc(L('Sumber', '来源')) + ': TradingView</span>' +
            '<button class="tv-foot-open" title="' + esc(L('Buka chart simbol ini di browser', '在浏览器中打开该代码的图表')) + '">' +
            icon('link') + esc(L('Buka di browser', '在浏览器中打开')) + '</button>';
        const btn = foot.querySelector('.tv-foot-open');
        if (btn) { btn.onclick = () => openExternal(tvChartUrl(cfg.symbol)); }
    }

    /** Select berlabel dengan nilai awal dan callback perubahan. */
    function selectEl(id, pairs, value, title, onChange) {
        const sel = el('select');
        sel.id = id;
        sel.title = title;
        sel.innerHTML = pairs.map(([v, label]) => '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
        sel.onchange = () => onChange(sel.value);
        return sel;
    }

    /** Tetapkan simbol aktif (IDX:XXXX bila hanya kode 4 huruf). */
    function applySymbol(raw) {
        let v = String(raw || '').trim().toUpperCase();
        if (!v) { return; }
        v = v.replace(/\s+/g, '');
        if (/^[A-Z]{4}$/.test(v)) { v = 'IDX:' + v; }
        cfg.symbol = v;
        saveCfg();
        renderAll();
        // Simbol chart berubah → otak trading & data live mengikuti simbol ini.
        post({ type: 'tvAiWatch', symbol: cfg.symbol });
    }

    function hideAc() {
        const ac = ov && ov.querySelector('#tv-symbol-ac');
        if (ac) { ac.hidden = true; }
    }

    /**
     * Daftar saran simbol di bawah sebuah input.
     * Dipakai bar atas lapisan (dan seksi di halaman analisis lewat `opts`).
     */
    function attachSuggest(input, panel, onPick) {
        let idx = -1;
        let rows = [];
        let armed = false;   // saran hanya terbuka setelah pengguna menyentuh input ini

        function paint() {
            const q = input.value;
            rows = saham().cari(q, q ? 40 : 12);
            if (!rows.length) {
                panel.innerHTML = '<div class="tv-ac-empty">' + esc(L('Tidak ada simbol yang cocok.', '没有匹配的代码。')) + '</div>';
                panel.hidden = false;
                idx = -1;
                return;
            }
            panel.innerHTML = rows.map((it, i) => {
                const kode = String(it[0]).split(':').pop();
                const pasar = String(it[0]).split(':')[0];
                return '<button type="button" class="tv-ac-item' + (i === idx ? ' on' : '') + '" data-i="' + i + '">' +
                    '<span class="tv-kode">' + esc(kode) + '</span>' +
                    '<span class="tv-nama">' + esc(it[1] || '') + '</span>' +
                    '<span class="tv-sek">' + esc(pasar === 'IDX' ? (it[2] || 'IDX') : pasar) + '</span>' +
                    '</button>';
            }).join('');
            panel.hidden = false;
            panel.querySelectorAll('.tv-ac-item').forEach((b) => {
                b.onmousedown = (ev) => { ev.preventDefault(); };
                b.onclick = () => {
                    const it = rows[+b.dataset.i];
                    if (!it) { return; }
                    input.value = it[0];
                    panel.hidden = true;
                    onPick(it[0]);
                };
            });
            if (idx >= 0 && panel.children[idx]) { panel.children[idx].classList.add('on'); }
        }

        function move(step) {
            if (panel.hidden) { paint(); }
            if (!rows.length) { return; }
            idx = (idx + step + rows.length) % rows.length;
            panel.querySelectorAll('.tv-ac-item').forEach((b, i) => { b.classList.toggle('on', i === idx); });
            const on = panel.children[idx];
            if (on && on.scrollIntoView) { on.scrollIntoView({ block: 'nearest' }); }
        }

        input.addEventListener('input', () => { armed = true; idx = -1; paint(); });
        input.addEventListener('pointerdown', () => { armed = true; });
        input.addEventListener('focus', () => { if (armed) { paint(); } });
        input.addEventListener('blur', () => { setTimeout(() => { panel.hidden = true; }, 120); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Escape') { panel.hidden = true; }
            else if (e.key === 'Enter' && idx >= 0 && rows[idx]) {
                e.preventDefault();
                input.value = rows[idx][0];
                panel.hidden = true;
                onPick(rows[idx][0]);
            }
        });
    }

    // ── setelan ─────────────────────────────────────────────────────────────────
    function buildSettings() {
        const box = el('aside', 'tv-set');
        box.id = 'tv-set';
        box.hidden = true;

        const rows = [];
        const row = (label, control) => {
            const r = el('div', 'tv-row');
            r.appendChild(el('span', null, label));
            r.appendChild(control);
            rows.push(r);
            return r;
        };

        const head1 = el('h4', null, L('Tampilan widget', '组件显示'));
        const selTheme = smallSelect([['auto', L('Ikuti tema halaman', '跟随页面主题')], ['dark', 'Dark'], ['light', 'Light']], cfg.theme, (v) => { cfg.theme = v; saveCfg(); renderAll(); });
        const selLocale = smallSelect(LOCALES, cfg.locale, (v) => { cfg.locale = v; saveCfg(); renderAll(); });
        const selZone = smallSelect(ZONES, cfg.tz, (v) => { cfg.tz = v; saveCfg(); renderAll(); });
        const selRange = smallSelect(RANGES, cfg.range, (v) => { cfg.range = v; saveCfg(); renderAll(); });

        const toggle = (on, cb) => {
            const c = el('input');
            c.type = 'checkbox';
            c.checked = !!on;
            c.onchange = () => cb(c.checked);
            return c;
        };
        const cSide = toggle(cfg.sideToolbar, (v) => { cfg.sideToolbar = v; saveCfg(); renderAll(); });
        const cSym = toggle(cfg.symbolChange, (v) => { cfg.symbolChange = v; saveCfg(); renderAll(); });
        const cDet = toggle(cfg.details, (v) => { cfg.details = v; saveCfg(); renderAll(); });
        const cHot = toggle(cfg.hotlist, (v) => { cfg.hotlist = v; saveCfg(); renderAll(); });
        const cCal = toggle(cfg.calendar, (v) => { cfg.calendar = v; saveCfg(); renderAll(); });
        const cImg = toggle(cfg.saveImage, (v) => { cfg.saveImage = v; saveCfg(); renderAll(); });
        const cRail = toggle(cfg.rail, (v) => { cfg.rail = v; saveCfg(); renderAll(); });

        box.appendChild(head1);
        [row(L('Tema', '主题'), selTheme), row(L('Bahasa', '语言'), selLocale),
        row(L('Zona waktu', '时区'), selZone), row(L('Rentang data', '数据区间'), selRange),
        row(L('Toolbar samping (alat gambar)', '侧边工具栏（绘图工具）'), cSide),
        row(L('Bisa ganti simbol dari chart', '可在图表中切换代码'), cSym),
        row(L('Panel detail simbol', '代码信息面板'), cDet),
        row(L('Watchlist (hotlist)', '自选列表'), cHot),
        row(L('Kalender ekonomi', '经济日历'), cCal),
        row(L('Tombol simpan gambar', '保存图片按钮'), cImg),
        row(L('Rel kanan (teknikal & info)', '右侧栏（技术面与信息）'), cRail),
        ].forEach((r) => box.appendChild(r));

        box.appendChild(el('h4', null, L('Indikator cepat', '快捷指标')));
        const st = el('div', 'tv-studies');
        STUDIES.forEach((s) => {
            const lab = el('label');
            const c = el('input');
            c.type = 'checkbox';
            c.checked = cfg.studies.indexOf(s.k) >= 0;
            c.onchange = () => {
                const at = cfg.studies.indexOf(s.k);
                if (c.checked && at < 0) { cfg.studies.push(s.k); }
                if (!c.checked && at >= 0) { cfg.studies.splice(at, 1); }
                saveCfg(); renderAll();
            };
            lab.appendChild(c);
            lab.appendChild(document.createTextNode(s.label));
            st.appendChild(lab);
        });
        box.appendChild(st);
        box.appendChild(el('div', 'tv-row', L('Semua indikator lain: tombol “Indicators” di toolbar chart.', '其他指标：图表工具栏的 “Indicators” 按钮。')));

        const acts = el('div', 'tv-set-act');
        const reset = el('button', null, L('Reset', '重置'));
        reset.onclick = () => {
            cfg = Object.assign({}, DEFAULT_CFG);
            cfg.symbol = detectSymbol() || DEFAULT_CFG.symbol;
            saveCfg(); renderAll();
        };
        const done = el('button', 'tv-primary', L('Selesai', '完成'));
        done.onclick = () => { setEl.hidden = true; };
        acts.append(reset, done);
        box.appendChild(acts);
        return box;
    }

    function smallSelect(pairs, value, cb) {
        const sel = el('select');
        sel.innerHTML = pairs.map(([v, label]) => '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
        sel.onchange = () => cb(sel.value);
        return sel;
    }

    function toggleSettings() {
        if (!setEl) { return; }
        setEl.hidden = !setEl.hidden;
    }

    // ── isi per tab ─────────────────────────────────────────────────────────────
    /** Segarkan kerangka (chip, pilihan, footer) lalu gambar ulang isi tab. */
    function renderAll() {
        if (!ov) { return; }
        renderChrome();
        renderMain();
    }

    /** Samakan kontrol bar atas dengan keadaan `cfg` terbaru. */
    function renderChrome() {
        if (!ov) { return; }
        ov.style.setProperty('--tv-bg', themeBg());
        ov.querySelectorAll('.tv-tab').forEach((b) => { b.classList.toggle('on', b.dataset.tvTab === tab); });
        ov.querySelectorAll('.tv-chip').forEach((c) => { c.classList.toggle('on', c.title.indexOf(cfg.symbol) > 0); });
        paintFoot();
        const inp = ov.querySelector('#tv-symbol');
        if (inp && document.activeElement !== inp && inp.value !== cfg.symbol) { inp.value = cfg.symbol; }
        const pairs = [['#tv-interval', cfg.interval], ['#tv-style', cfg.style], ['#tv-range', cfg.range]];
        pairs.forEach(([sel, v]) => {
            const e2 = ov.querySelector(sel);
            if (e2 && e2.value !== String(v)) { e2.value = String(v); }
        });
        const full = ov.querySelector('#tv-btn-full');
        if (full) { full.classList.toggle('tv-primary', zenOn); }
    }

    function renderMain() {
        if (!bodyEl) { return; }
        renderChrome();
        renderSeq++;
        disposeFrames();
        clear(bodyEl);
        if (tab === 'chart') { renderChart(); }
        else if (tab === 'tech') { renderTech(); }
        else if (tab === 'fund') { renderFund(); }
        else if (tab === 'screen') { renderScreen(); }
        else if (tab === 'news') { renderNews(); }
        else if (tab === 'buku') { renderBooks(); }
        else if (tab === 'media') { renderMedia(); }
        else { renderCari(); }
        status(symbolLabel() + ' · ' + labelOf(INTERVALS, cfg.interval) + ' · ' + labelOf(RANGES, cfg.range));
    }

    /** “IDX:BBCA · Bank Central Asia” untuk baris status. */
    function symbolLabel() {
        const nama = saham().nameOf(cfg.symbol);
        return nama ? cfg.symbol + ' · ' + nama : cfg.symbol;
    }

    function labelOf(pairs, v) {
        const hit = pairs.find((p) => String(p[0]) === String(v));
        return hit ? hit[1] : v;
    }

    /** Widget cadangan “data lain”: kutipan saham IDX (dipakai bila gauge teknikal kosong). */
    function quotesFallback() {
        return {
            kind: 'market-quotes',
            config: {
                symbols: [{
                    name: L('Saham IDX', 'IDX 股票'),
                    symbols: QUICK.filter((q) => q.s.indexOf('IDX:') === 0).slice(0, 10).map((q) => ({ s: q.s, d: q.d })),
                }],
                showSymbolLogo: true, colorTheme: themeName(), isTransparent: false,
            },
        };
    }

    /** Widget cadangan bila berita tidak tampil: kalender ekonomi. */
    function kalenderFallback() {
        return {
            kind: 'events',
            config: {
                colorTheme: themeName(), isTransparent: false,
                importanceFilter: '0,1', countryFilter: 'id,us,cn,jp,eu,gb',
            },
        };
    }

    /** Chart utama + rel kanan (teknikal, info simbol, berita). */
    function renderChart() {
        const main = el('div', 'tv-main');
        const chart = el('div', 'tv-chart');
        chart.id = 'tv-chart-host';
        main.appendChild(chart);
        if (cfg.rail) {
            const rail = el('div', 'tv-rail');
            mount('technical-analysis', {
                symbol: cfg.symbol, interval: '1h', showIntervalTabs: true, displayMode: 'single',
                colorTheme: themeName(), isTransparent: false,
            }, rail, { fallback: quotesFallback() });
            mount('symbol-info', {
                symbol: cfg.symbol, colorTheme: themeName(), isTransparent: false,
            }, rail);
            mount('timeline', {
                feedMode: 'all_symbols', displayMode: 'regular', colorTheme: themeName(),
                isTransparent: false,
            }, rail, { fallback: kalenderFallback() });
            main.appendChild(rail);
        }
        bodyEl.appendChild(main);
        mount('advanced-chart', chartConfig(), chart, { cls: 'tv-chartbox' });
    }

    function chartConfig() {
        return {
            autosize: true,
            symbol: cfg.symbol,
            interval: cfg.interval,
            timezone: cfg.tz,
            theme: themeName(),
            style: cfg.style,
            range: cfg.range,
            withdateranges: true,
            hide_side_toolbar: !cfg.sideToolbar,
            allow_symbol_change: !!cfg.symbolChange,
            details: !!cfg.details,
            hotlist: !!cfg.hotlist,
            calendar: !!cfg.calendar,
            save_image: !!cfg.saveImage,
            studies: chosenStudies().map((s) => s.std),
        };
    }

    /** Teknikal: gauge multi-timeframe + info simbol di atas, chart 15 menit di bawah. */
    function renderTech() {
        const col = el('div', 'tv-col');
        col.style.flex = '1';
        col.style.overflow = 'hidden';
        const grid = el('div', 'tv-grid');
        grid.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,1fr)';
        grid.style.flex = '0 0 46%';
        const g1 = el('div', 'tv-wbox');
        const g2 = el('div', 'tv-wbox');
        grid.append(g1, g2);
        mount('technical-analysis', {
            symbol: cfg.symbol, interval: '1h', showIntervalTabs: true, displayMode: 'single',
            colorTheme: themeName(), isTransparent: false,
        }, g1, { fallback: quotesFallback() });
        mount('symbol-info', {
            symbol: cfg.symbol, colorTheme: themeName(), isTransparent: false,
        }, g2);
        const chart = el('div', 'tv-chart');
        chart.style.flex = '1';
        chart.style.minHeight = '240px';
        col.append(grid, chart);
        bodyEl.appendChild(col);
        mount('advanced-chart', Object.assign(chartConfig(), { interval: '15', studies: [], hotlist: false, calendar: false }), chart);
    }

    /** Fundamental: laporan keuangan + profil perusahaan. */
    function renderFund() {
        const grid = el('div', 'tv-grid');
        grid.style.gridTemplateColumns = 'minmax(0,1.35fr) minmax(0,1fr)';
        const g1 = el('div', 'tv-wbox');
        const g2 = el('div', 'tv-wbox');
        grid.append(g1, g2);
        mount('financials', {
            symbol: cfg.symbol, displayMode: 'regular', colorTheme: themeName(), isTransparent: false,
            largeChartUrl: '',
        }, g1);
        mount('symbol-profile', {
            symbol: cfg.symbol, colorTheme: themeName(), isTransparent: false,
        }, g2);
        bodyEl.appendChild(grid);
    }

    /** Screener: saham Indonesia + hotlist bursa. */
    function renderScreen() {
        const grid = el('div', 'tv-grid');
        grid.style.gridTemplateColumns = 'minmax(0,1.4fr) minmax(0,1fr)';
        const g1 = el('div', 'tv-wbox');
        const g2 = el('div', 'tv-wbox');
        grid.append(g1, g2);
        mount('screener', {
            defaultColumn: 'overview', defaultScreen: 'general',
            market: 'indonesia', showToolbar: true, colorTheme: themeName(), isTransparent: false,
        }, g1);
        mount('hotlists', {
            exchange: 'IDX', showChart: true, colorTheme: themeName(), isTransparent: false,
        }, g2);
        bodyEl.appendChild(grid);
    }

    /** Berita: top stories untuk simbol ini + kalender ekonomi. */
    function renderNews() {
        const grid = el('div', 'tv-grid');
        grid.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,1fr)';
        const g1 = el('div', 'tv-wbox');
        const g2 = el('div', 'tv-wbox');
        grid.append(g1, g2);
        mount('timeline', {
            feedMode: 'symbol', symbol: cfg.symbol, displayMode: 'regular', colorTheme: themeName(),
            isTransparent: false,
        }, g1);
        mount('events', {
            colorTheme: themeName(), isTransparent: false,
            importanceFilter: '0,1', countryFilter: 'id,us,cn,jp,eu,gb',
        }, g2);
        bodyEl.appendChild(grid);
    }

    // ── tab pencarian saham (lengkap) ──────────────────────────────────────────
    let cariQuery = '';
    let cariSector = '';
    let cariLimit = 150;

    const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
        'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    /** “2026-11-10” → “10 November 2026”. */
    function tanggalId(iso) {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) { return iso || '-'; }
        return (+m[3]) + ' ' + BULAN[(+m[2]) - 1] + ' ' + m[1];
    }

    function renderCari() {
        const wrap = el('div', 'tv-search');
        const bar = el('div', 'tv-searchbar');

        const inp = el('input');
        inp.id = 'tv-cari';
        inp.type = 'search';
        inp.value = cariQuery;
        inp.autocomplete = 'off';
        inp.placeholder = L('Cari kode atau nama saham — mis. BBRI, bank, telkom, GOTO…',
            '搜索代码或公司名称 — 例如 BBRI、bank、telkom、GOTO…');

        const pairSector = [['', L('Semua sektor', '全部行业')]].concat(saham().sectors.map((s) => [s, s]));
        const sel = selectEl('tv-cari-sector', pairSector, cariSector, L('Sektor', '行业'), (v) => {
            cariSector = v;
            cariLimit = 150;
            paint();
        });

        bar.append(inp, sel);
        wrap.appendChild(bar);

        const info = el('div', 'tv-searchinfo');
        info.id = 'tv-cari-info';
        wrap.appendChild(info);

        const list = el('div', 'tv-list');
        list.id = 'tv-cari-list';
        wrap.appendChild(list);

        const more = el('div', 'tv-more');
        wrap.appendChild(more);
        bodyEl.appendChild(wrap);

        let rows = [];

        function matches() {
            let out = saham().cari(cariQuery, 0);
            if (cariSector) { out = out.filter((it) => it[2] === cariSector); }
            return out;
        }

        function paint() {
            rows = matches();
            const katalog = saham();
            const total = katalog.jumlah || katalog.items.length;
            const global = Math.max(0, katalog.items.length - total);
            const tampil = Math.min(cariLimit, rows.length);
            info.textContent = L(
                'Menampilkan ' + nf(tampil) + ' dari ' + nf(rows.length) + ' simbol · ' + nf(total)
                + ' emiten IDX + ' + nf(global) + ' simbol global (indeks, saham AS, komoditas, kurs) · data '
                + tanggalId(katalog.updated),
                '显示 ' + nf(tampil) + ' / ' + nf(rows.length) + ' 个匹配 · ' + nf(total)
                + ' 家 IDX 公司 + ' + nf(global) + ' 个全球代码（指数、美股、商品、汇率）· 数据 '
                + tanggalId(katalog.updated));
            const show = rows.slice(0, cariLimit);
            list.innerHTML = show.length
                ? show.map((it) => {
                    const kode = String(it[0]).split(':').pop();
                    return '<button class="tv-item' + (it[0] === cfg.symbol ? ' on' : '') + '" data-sym="' + esc(it[0]) + '">' +
                        '<span class="tv-kode">' + esc(kode) + '</span>' +
                        '<span class="tv-nama">' + esc(it[1] || '') + '</span>' +
                        '<span class="tv-sek">' + esc(it[2] || '') + '</span>' +
                        '<span class="tv-papan">' + esc(it[3] || '') + '</span>' +
                        '</button>';
                }).join('')
                : '<div class="tv-ac-empty">' + esc(L('Tidak ada simbol yang cocok dengan pencarian ini.', '没有匹配的代码。')) + '</div>';

            list.querySelectorAll('.tv-item').forEach((b) => {
                b.onclick = () => {
                    applySymbol(b.dataset.sym);
                    tab = 'chart';
                    renderAll();
                };
            });

            more.innerHTML = rows.length > cariLimit
                ? '<button class="tv-primary" id="tv-cari-more">' + esc(L('Tampilkan ' + nf(Math.min(150, rows.length - cariLimit)) + ' simbol lagi', '再显示 ' + nf(Math.min(150, rows.length - cariLimit)) + ' 个')) + '</button>'
                : '';
            const b = more.querySelector('#tv-cari-more');
            if (b) { b.onclick = () => { cariLimit += 150; paint(); }; }
        }

        inp.oninput = () => { cariQuery = inp.value; cariLimit = 150; paint(); };
        inp.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const first = rows[0];
                if (first) { applySymbol(first[0]); tab = 'chart'; renderAll(); }
            }
        };
        paint();
        setTimeout(() => { if (inp.isConnected) { inp.focus(); } }, 30);
    }

    // ── tab buku (Pustaka Trading): cari buku lalu klik “Free sample” ─────────
    let bookQuery = '';
    let bookItems = [];
    let bookInfo = '';
    let bookBusy = false;
    let bookError = '';
    /** Repaint tab buku tanpa membangun ulang seluruh lapisan (dipanggil dari pesan ekstensi). */
    let bookRepaint = null;

    /** Payload buku untuk panel pembaca (info + harga + sampul ikut dikirim). */
    function bookPayload(b) {
        return {
            type: 'tvBookRead', id: b.id, title: b.title, subtitle: b.subtitle,
            authors: b.authors || [], viewability: b.viewability, embeddable: b.embeddable,
            thumbnail: b.thumbnail, previewLink: b.previewLink, infoLink: b.infoLink,
            publisher: b.publisher, publishedDate: b.publishedDate, pageCount: b.pageCount,
            language: b.language, categories: b.categories || [], isbn: b.isbn,
            rating: b.rating, ratingsCount: b.ratingsCount, price: b.price,
            saleability: b.saleability, buyLink: b.buyLink, description: b.description,
        };
    }

    /** Kartu buku di grid: sampul besar, info, harga, dan tombol Free sample. */
    function bookCard(b) {
        const card = el('div', 'tv-bcard');
        const cover = el('div', 'tv-bcover');
        if (b.thumbnail) {
            const img = el('img');
            img.src = String(b.thumbnail).replace('zoom=1', 'zoom=2');
            img.alt = 'Sampul ' + (b.title || '');
            img.loading = 'lazy';
            img.onerror = () => { img.remove(); cover.textContent = '📕'; };
            cover.appendChild(img);
        } else {
            cover.textContent = '📕';
        }

        const body = el('div', 'tv-bbody');
        body.appendChild(el('div', 'tv-bt', b.title || 'Tanpa judul'));
        const authors = (b.authors && b.authors.length) ? b.authors.join(', ') : L('Penulis tidak dicantumkan', '未注明作者');
        body.appendChild(el('div', 'tv-ba', authors));
        const bits = [];
        if (b.publishedDate) { bits.push(String(b.publishedDate).slice(0, 4)); }
        if (b.pageCount) { bits.push(nf(b.pageCount) + ' hlm'); }
        if (b.rating) { bits.push('★ ' + b.rating); }
        body.appendChild(el('div', 'tv-bd', bits.join(' · ')));

        const price = b.price || (b.saleability === 'FREE' ? L('Gratis', '免费') : '—');
        const priceRow = el('div', 'tv-bprice', price);
        priceRow.title = b.saleability ? 'saleability: ' + b.saleability : '';
        body.appendChild(priceRow);

        const tags = el('div', 'tv-btags');
        const tag = (text, cls) => el('span', 'tv-btag' + (cls ? ' ' + cls : ''), text);
        if (b.viewability === 'FULL') { tags.appendChild(tag(L('buku penuh', '全书'), 'ok')); }
        else if (b.viewability === 'NO_PAGES') { tags.appendChild(tag(L('tanpa sampel', '无样页'), 'warn')); }
        else { tags.appendChild(tag(L('free sample', '免费样章'), 'ok')); }
        if (b.embeddable) { tags.appendChild(tag(L('bisa dibaca', '可阅读'))); }
        if (tags.childElementCount) { body.appendChild(tags); }

        const act = el('div', 'tv-bact');
        const sample = el('button', 'tv-primary tv-sample', L('📖 Free sample', '📖 免费样章'));
        sample.title = L('Baca pratinjau gratis buku ini sekarang', '立即阅读免费样章');
        sample.onclick = () => {
            post(bookPayload(b));
            sample.textContent = L('membuka…', '打开中…');
            setTimeout(() => { if (sample.isConnected) { sample.textContent = L('📖 Free sample', '📖 免费样章'); } }, 2500);
        };
        const info = el('button', 'tv-binfo', L('Info', '详情'));
        info.title = L('Info lengkap + harga di panel pembaca', '在阅读面板查看详情与价格');
        info.onclick = () => post(bookPayload(b));
        act.append(sample, info);
        body.appendChild(act);

        card.append(cover, body);
        return card;
    }

    /** Tab Buku: pencarian Google Books + tombol Free sample per buku. */
    function renderBooks() {
        const wrap = el('div', 'tv-search');
        const bar = el('div', 'tv-searchbar');
        const inp = el('input');
        inp.id = 'tv-book-q';
        inp.type = 'search';
        inp.value = bookQuery;
        inp.autocomplete = 'off';
        inp.placeholder = L('Cari buku trading — bandarmologi, candlestick, valuasi, psikologi…',
            '搜索交易书籍 — 庄家、K线、估值、交易心理…');
        const go = el('button', 'tv-primary', L('Cari buku', '搜索书籍'));
        go.id = 'tv-book-go';
        bar.append(inp, go);
        wrap.appendChild(bar);

        const info = el('div', 'tv-searchinfo');
        info.id = 'tv-book-info';
        info.textContent = bookInfo || L('Klik “Free sample” pada buku untuk membuka pratinjau baca langsung.',
            '点击书籍的“免费样章”即可直接打开阅读预览。');
        wrap.appendChild(info);

        const list = el('div', 'tv-bgrid');
        list.id = 'tv-book-list';
        wrap.appendChild(list);
        bodyEl.appendChild(wrap);

        function paint() {
            clear(list);
            if (bookError) {
                list.appendChild(el('div', 'tv-ac-empty', bookError));
            } else if (!bookItems.length) {
                list.appendChild(el('div', 'tv-ac-empty', bookBusy
                    ? L('Mencari buku…', '正在搜索书籍…')
                    : L('Belum ada hasil. Ketik kata kunci lalu tekan Cari buku.', '尚无结果。输入关键词后搜索。')));
            } else {
                bookItems.forEach((b) => list.appendChild(bookCard(b)));
            }
            info.textContent = bookBusy ? L('Mencari buku…', '正在搜索书籍…')
                : (bookInfo || L('Klik “Free sample” pada buku untuk membuka pratinjau baca langsung.',
                    '点击书籍的“免费样章”即可直接打开阅读预览。'));
        }

        function cari() {
            const q = String(inp.value || '').trim();
            bookQuery = q;
            bookBusy = true;
            bookError = '';
            bookItems = [];
            bookInfo = q ? L('Mencari “' + q + '”…', '正在搜索“' + q + '”…') : '';
            paint();
            post({ type: 'tvBookSearch', q: q, limit: 10 });
        }

        go.onclick = cari;
        inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cari(); } };
        bookRepaint = () => { if (list.isConnected) { paint(); } };
        paint();
        // Buka tab = langsung ada buku (tidak perlu mengetik dulu).
        if (!bookItems.length && !bookBusy && !bookError) {
            bookBusy = true;
            bookInfo = L('Memuat buku trading populer…', '正在加载热门交易书籍…');
            paint();
            post({ type: 'tvBookSearch', q: bookQuery, limit: 10 });
        }
        // Hasil baru dari ekstensi (tab lain tetap memakai keadaan terakhir).
        setTimeout(() => { if (inp.isConnected && !bookQuery) { inp.focus(); } }, 30);
    }

    // ── tab media (Pexels): gambar & video, pratinjau + unduh ─────────────
    let mediaKind = 'photo';
    let mediaQuery = '';
    let mediaItems = [];
    let mediaTotal = 0;
    let mediaBusy = false;
    let mediaError = '';
    let mediaInfo = '';
    let mediaRepaint = null;

    function fmtDur(sec) {
        const s = Math.max(0, Math.round(Number(sec) || 0));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    /** Kartu media: thumbnail (foto/video), info, tombol Putar/Pratinjau + Unduh. */
    function mediaCard(hit) {
        const card = el('div', 'tv-mcard');
        const thumb = el('div', 'tv-mthumb');
        if (hit.color) { thumb.style.background = hit.color; }
        if (hit.thumb) {
            const img = el('img');
            img.src = hit.thumb;
            img.alt = hit.title || '';
            img.loading = 'lazy';
            img.onerror = () => { img.remove(); };
            thumb.appendChild(img);
        }
        if (hit.kind === 'video') {
            const badge = el('span', 'tv-mplay');
            badge.innerHTML = icon('play');
            thumb.appendChild(badge);
            if (hit.duration) { thumb.appendChild(el('span', 'tv-mdur', fmtDur(hit.duration))); }
        }

        const body = el('div', 'tv-mbody');
        body.appendChild(el('div', 'tv-mt', hit.title || 'Media Pexels'));
        const meta = [(Number(hit.width) || 0) + '×' + (Number(hit.height) || 0)];
        if (hit.kind === 'video' && hit.duration) { meta.push(fmtDur(hit.duration)); }
        if (hit.author) { meta.push(hit.author); }
        body.appendChild(el('div', 'tv-mm', meta.join(' · ')));

        const act = el('div', 'tv-mact');
        const prev = el('button', 'tv-primary', hit.kind === 'video' ? L('▶ Putar', '▶ 播放') : L('Pratinjau', '预览'));
        prev.title = L('Buka pratinjau besar (bisa diputar / diunduh)', '打开大图预览（可播放/下载）');
        prev.onclick = () => post({ type: 'tvMediaPreview', hit: hit });
        const dl = el('button', 'tv-mdl');
        dl.innerHTML = icon('download') + '<span>' + esc(L('Unduh', '下载')) + '</span>';
        dl.title = L('Unduh berkas asli dari Pexels', '从 Pexels 下载原始文件');
        dl.onclick = () => {
            dl.disabled = true;
            setTimeout(() => { if (dl.isConnected) { dl.disabled = false; } }, 4000);
            post({ type: 'tvMediaDownload', hit: hit });
        };
        act.append(prev, dl);
        body.appendChild(act);

        card.append(thumb, body);
        return card;
    }

    /** Tab Media: pencarian gambar/video Pexels + pratinjau + unduh. */
    function renderMedia() {
        const wrap = el('div', 'tv-search');
        const bar = el('div', 'tv-searchbar');

        const bPhoto = el('button', 'tv-seg' + (mediaKind === 'photo' ? ' on' : ''), L('🖼 Gambar', '🖼 图片'));
        const bVideo = el('button', 'tv-seg' + (mediaKind === 'video' ? ' on' : ''), L('🎬 Video', '🎬 视频'));
        bPhoto.onclick = () => {
            if (mediaKind === 'photo') { return; }
            mediaQuery = String(inp.value || '').trim();
            mediaKind = 'photo';
            mediaItems = [];
            mediaRepaint = null;
            renderMedia();
        };
        bVideo.onclick = () => {
            if (mediaKind === 'video') { return; }
            mediaQuery = String(inp.value || '').trim();
            mediaKind = 'video';
            mediaItems = [];
            mediaRepaint = null;
            renderMedia();
        };

        const inp = el('input');
        inp.id = 'tv-media-q';
        inp.type = 'search';
        inp.value = mediaQuery;
        inp.autocomplete = 'off';
        inp.placeholder = mediaKind === 'video'
            ? L('Cari video — chart, trading floor, bitcoin, ekonomi…', '搜索视频 — 图表、交易大厅、比特币、经济…')
            : L('Cari gambar — chart saham, trading, kantor, uang…', '搜索图片 — 股票图表、交易、办公室、金钱…');
        const go = el('button', 'tv-primary', L('Cari', '搜索'));
        go.id = 'tv-media-go';
        bar.append(bPhoto, bVideo, inp, go);
        wrap.appendChild(bar);

        const info = el('div', 'tv-searchinfo');
        info.id = 'tv-media-info';
        wrap.appendChild(info);

        const grid = el('div', 'tv-mgrid');
        grid.id = 'tv-media-list';
        wrap.appendChild(grid);
        bodyEl.appendChild(wrap);

        function paint() {
            clear(grid);
            if (mediaError) {
                grid.appendChild(el('div', 'tv-ac-empty', mediaError));
            } else if (!mediaItems.length) {
                grid.appendChild(el('div', 'tv-ac-empty', mediaBusy
                    ? L('Mencari media…', '正在搜索媒体…')
                    : L('Belum ada hasil. Ketik kata kunci lalu tekan Cari.', '尚无结果。输入关键词后搜索。')));
            } else {
                mediaItems.forEach((h) => grid.appendChild(mediaCard(h)));
            }
            info.textContent = mediaBusy ? L('Mencari media…', '正在搜索媒体…')
                : (mediaInfo || L('Sumber: Pexels — gratis dipakai sesuai lisensi Pexels. Klik Putar/Pratinjau untuk melihat, Unduh untuk menyimpan.',
                    '来源：Pexels — 按 Pexels 许可免费使用。点击播放/预览查看，下载保存。'));
        }

        function cari() {
            mediaQuery = String(inp.value || '').trim();
            mediaBusy = true;
            mediaError = '';
            mediaItems = [];
            mediaInfo = mediaQuery ? L('Mencari “' + mediaQuery + '”…', '正在搜索“' + mediaQuery + '”…') : '';
            paint();
            post({ type: 'tvMediaSearch', kind: mediaKind, q: mediaQuery, page: 1 });
        }

        go.onclick = cari;
        inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); cari(); } };
        mediaRepaint = () => { if (grid.isConnected) { paint(); } };
        paint();
        // Buka tab = langsung ada hasil (tema trading bawaan).
        if (!mediaItems.length && !mediaBusy && !mediaError) {
            mediaBusy = true;
            mediaInfo = L('Memuat media trading populer…', '正在加载热门交易媒体…');
            paint();
            post({ type: 'tvMediaSearch', kind: mediaKind, q: mediaQuery, page: 1 });
        }
        setTimeout(() => { if (inp.isConnected && !mediaQuery) { inp.focus(); } }, 30);
    }

    // ── buka / tutup ────────────────────────────────────────────────────────────
    function open(opts) {
        ensureCss();
        const wanted = (opts && opts.symbol) || '';
        if (wanted) {
            cfg.symbol = wanted;
        } else if (!ov) {
            // Simbol dari data dipakai hanya bila pengguna belum punya pilihan tersimpan.
            const auto = detectSymbol();
            if (auto && !hasSaved) { cfg.symbol = auto; }
        }
        if (!cfg.symbol) { cfg.symbol = DEFAULT_CFG.symbol; }
        tab = (opts && opts.tab) || tab || 'chart';
        if (ov) {
            renderAll();
            if (opts && opts.ai) { aiOpen(); }
            return;
        }
        ov = buildOverlay();
        document.body.appendChild(ov);
        document.body.style.overflow = 'hidden';
        renderMain();
        // Mode layar penuh tanpa data & panel mandiri: drawer AI langsung terbuka.
        if (opts && opts.ai) { aiOpen(); }
        // Data pasar untuk simbol awal langsung diminta (baris live terisi tanpa klik).
        post({ type: 'tvAiWatch', symbol: cfg.symbol });
        const inp = ov.querySelector('#tv-symbol');
        if (inp) { inp.focus(); }
        status(symbolLabel() + ' · ' + labelOf(INTERVALS, cfg.interval) + ' · ' + labelOf(RANGES, cfg.range));
    }

    function close(silent) {
        if (!ov) { return; }
        renderSeq++;
        disposeFrames();
        const x = ov;
        ov = null; bodyEl = null; statusEl = null; setEl = null;
        aiEl = null; aiStream = null; aiBusy = false;
        clear(x);
        if (x.parentElement) { x.parentElement.removeChild(x); }
        document.body.style.overflow = '';
        if (zenOn) { zenOn = false; post({ type: 'tradingFullscreen', on: false }); }
        // Panel mandiri menutup jendelanya lewat hook ini (halaman analisis tidak memakainya).
        if (!silent) {
            try { if (P && typeof P.onClose === 'function') { P.onClose(); } } catch (e) { /* tanpa panel */ }
        }
    }

    // ── seksi di halaman analisis ───────────────────────────────────────────────
    function renderSection() {
        if (!P || !P.section) { return; }

        const old = document.getElementById('trading');
        if (old?.parentElement) { 
            old.parentElement.removeChild(old); 
        }

        sectionBody = P.section('trading', L('Mode Analisis (TradingView)', '分析模式（TradingView）'));
        if (!sectionBody) { return; }

        const card = P.el('div', 'card wide tv-launch');
        card.setAttribute('data-spider-skip', '1');

        const auto = detectSymbol();
        const sym = auto || cfg.symbol;
        const total = saham().jumlah || saham().items.length;

        card.innerHTML = `
            <div style="padding:16px">
                <h3>${esc(L('Analisis saham lengkap dengan TradingView', '使用 TradingView 进行完整股票分析'))}</h3>
                <p class="muted" style="margin:0 0 12px;line-height:1.7">
                    ${esc(L(
                        `Satu klik membuka layar penuh berisi chart TradingView: semua indikator, alat gambar, alert, replay, gauge teknikal, laporan keuangan, profil perusahaan, screener bursa, berita, kalender ekonomi — plus pencarian ${nf(total)} emiten IDX.`,
                        `一键打开 TradingView 图表全屏界面：全部指标、绘图工具、警报、回放、技术面仪表、财务报表、公司资料、选股器、新闻、经济日历，以及 ${nf(total)} 家 IDX 公司搜索。`
                    ))}
                </p>
                <div class="tv-lsearch">
                    <input id="tv-lsearch" type="text" autocomplete="off" placeholder="${esc(L('Cari kode atau nama saham…', '搜索代码或公司名称…'))}">
                    <div class="tv-lac" id="tv-lac" hidden></div>
                </div>
                <div class="tv-lrow">
                    <button class="btn tv-lbtn" id="btn-trading-open">${icon('chart')}${esc(L('Buka Mode Analisis', '打开分析模式'))}</button>
                </div>
                <div class="tv-lrow" id="tv-lchips"></div>
                <div class="tv-lnote">
                    ${esc(L('Simbol terdeteksi', '检测到的代码'))}: <code>${esc(sym)}</code> · 
                    ${esc(L(
                        `Katalog pencarian: ${nf(total)} emiten IDX + indeks, saham AS, komoditas, kurs. Butuh internet — data dari TradingView, bukan rekomendasi investasi.`,
                        `搜索目录：${nf(total)} 家 IDX 公司 + 指数、美股、商品、汇率。需要联网 — 数据来自 TradingView，非投资建议。`
                    ))}
                </div>
            </div>
        `;
        
        sectionBody.appendChild(card);

        // Event Listeners & Binding
        const btn = card.querySelector('#btn-trading-open');
        if (btn) {
            btn.onclick = () => open({ symbol: auto || undefined });
        }

        const inp = card.querySelector('#tv-lsearch');
        const panel = card.querySelector('#tv-lac');
        if (inp && panel) {
            attachSuggest(inp, panel, (simbol) => { open({ symbol: simbol }); });
        }

        const chips = card.querySelector('#tv-lchips');
        if (chips) {
            QUICK.slice(0, 10).forEach((q) => {
                const c = P.el('button', 'tv-lchip', q.d);
                c.title = q.n;
                c.onclick = () => open({ symbol: q.s });
                chips.appendChild(c);
            });
        }
    }

    // ── bahasa & pesan dari ekstensi ────────────────────────────────────────────
    window.addEventListener('message', (ev) => {
        const m = ev.data;
        if (!m) { return; }
        if (m.type === 'sk-locale' && m.config) {
            const next = m.config.lang === 'zh-cn' ? 'zh-cn' : 'id';
            if (next === lang) { return; }
            lang = next;
            const wasOpen = !!ov;
            if (wasOpen) { close(true); }
            renderSection();
            if (wasOpen) { open(); }
        } else if (m.type === 'tradingOpen') {
            open();
        } else if (m.type === 'tradingClose') {
            close();
        } else if (m.type === 'tradingTab' && m.tab) {
            tab = String(m.tab);
            if (ov) { renderMain(); } else { open({ tab: tab }); }
        } else if (m.type === 'tvAiState') {
            aiApplyState(m.ai);
        } else if (m.type === 'tvAiModels') {
            aiModels(m.models, m.selected);
        } else if (m.type === 'tvAiThink') {
            aiBegin();
        } else if (m.type === 'tvAiChunk') {
            aiChunk(m.text);
        } else if (m.type === 'tvAiAnswer') {
            aiAnswer(m.text);
        } else if (m.type === 'tvAiError') {
            aiError(m.text);
        } else if (m.type === 'tvAiInfo') {
            aiNote(m.text);
        } else if (m.type === 'tvAiBusy') {
            aiBusySet(!!m.on);
        } else if (m.type === 'tvAiSymbol' && m.symbol) {
            // Simbol yang benar-benar dipakai otak trading dikirim balik oleh ekstensi.
            if (m.symbol !== cfg.symbol) { cfg.symbol = String(m.symbol); saveCfg(); renderAll(); }
        } else if (m.type === 'tvAiLive') {
            aiLive(m);
        } else if (m.type === 'tvAiChatReset') {
            if (aiEl) {
                const log = aiEl.querySelector('#tv-ai-log');
                if (log) { clear(log); }
                aiStream = null;
                aiNote(L('Percakapan baru.', '新对话。'));
            }
        } else if (m.type === 'tvBookBusy') {
            bookBusy = !!m.on;
            if (bookBusy) { bookError = ''; }
            if (bookRepaint) { bookRepaint(); }
        } else if (m.type === 'tvBookResults') {
            bookBusy = false;
            bookError = '';
            bookItems = Array.isArray(m.items) ? m.items.slice(0, 60) : [];
            bookInfo = String(m.info || '');
            if (bookRepaint) { bookRepaint(); }
        } else if (m.type === 'tvBookError') {
            bookBusy = false;
            bookError = String(m.text || 'Gagal mencari buku.');
            if (bookRepaint) { bookRepaint(); }
        } else if (m.type === 'tvMediaBusy') {
            mediaBusy = !!m.on;
            if (mediaBusy) { mediaError = ''; }
            if (mediaRepaint) { mediaRepaint(); }
        } else if (m.type === 'tvMediaResults') {
            if (m.kind && m.kind !== mediaKind) { return; }
            mediaBusy = false;
            mediaError = '';
            mediaItems = Array.isArray(m.items) ? m.items.slice(0, 60) : [];
            mediaTotal = Number(m.total) || mediaItems.length;
            const label = mediaKind === 'video' ? L('video', '视频') : L('gambar', '图片');
            mediaInfo = L(
                mediaItems.length + ' ' + label + ' dari ' + nf(mediaTotal) + ' hasil · klik Putar/Pratinjau atau Unduh',
                mediaItems.length + ' 个' + label + '，共 ' + nf(mediaTotal) + ' 条 · 点击播放/预览或下载');
            if (mediaRepaint) { mediaRepaint(); }
        } else if (m.type === 'tvMediaError') {
            mediaBusy = false;
            mediaError = String(m.text || 'Gagal mencari media.');
            if (mediaRepaint) { mediaRepaint(); }
        } else if (m.type === 'tvMediaSaved') {
            if (m.ok) {
                status(L('Tersimpan: ' + String(m.path || ''), '已保存：' + String(m.path || '')));
            } else {
                status(L('Unduhan dibatalkan.', '下载已取消。'));
            }
        }
    });

    // Esc global (overlay kadang tidak memegang fokus, mis. setelah klik iframe).
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ov) { close(); }
    });

    window.SkunderTrading = {
        init(ctx) {
            P = ctx; S = ctx.sheet;
            // Bahasa mengikuti halaman (main.js menyetel data-ec-lang dari setelan ekstensi).
            const fromBody = document.body ? document.body.getAttribute('data-ec-lang') : '';
            lang = fromBody === 'zh-cn' ? 'zh-cn'
                : (window.__SK_I18N__ && window.__SK_I18N__.lang === 'zh-cn' ? 'zh-cn' : 'id');
            readCfg();
            renderSection();
        },
        open,
        close,
        toggle() { if (ov) { close(); } else { open(); } },
        isOpen() { return !!ov; },
        get cfg() { return Object.assign({}, cfg); },
        detectSymbol,
        /** Pencarian simbol lengkap (dipakai uji & fitur lain). */
        cari(q, n) { return saham().cari(q, n); },
        destroy() {
            close(true);
            const sec = document.getElementById('trading');
            if (sec && sec.parentElement) { sec.parentElement.removeChild(sec); }
            P = null; S = null; sectionBody = null;
        },
    };
})();

