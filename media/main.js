/* global Chart, acquireVsCodeApi */
(function () {
    const vscode = acquireVsCodeApi();
    const app = document.getElementById('app');
    const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab'];
    const TYPE_LABEL = { number: 'Decimal', integer: 'Integer', id: 'ID', date: 'Date', boolean: 'Boolean', category: 'Category', text: 'Text' };
    let state = null, charts = [], cur = 0;

    const css = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (x) => (x === null || x === undefined ? '-' : Math.abs(x) >= 1000 ? Number(x).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Math.round(x * 100) / 100));
    const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
    const color = (i, a) => { const c = PALETTE[i % PALETTE.length]; return a ? c + a : c; };

    // ── tema tampilan kustom (panel "🎨 Tema") ─────────────────────────────
    // Tema = set variabel --sk-* di media/main.css. null = ikuti warna VS Code.
    const THEME_KEYS = ['bg', 'fg', 'card', 'border', 'btn', 'btnFg', 'btnHover', 'input', 'inputFg', 'inputBorder', 'link', 'accent'];
    const THEME_PRESETS = [
        { id: 'vscode', name: 'Ikuti VS Code', vars: null },
        {
            id: 'terang', name: '☀️ Terang Bersih',
            vars: { bg: '#f1f5f9', fg: '#0f172a', card: '#ffffff', border: '#d7dee8', btn: '#2563eb', btnFg: '#ffffff', btnHover: '#1d4ed8', input: '#ffffff', inputFg: '#0f172a', inputBorder: '#c3cedb', link: '#2563eb', accent: '#2563eb' },
        },
        {
            id: 'gelap', name: '🌙 Gelap Klasik',
            vars: { bg: '#17171c', fg: '#e5e7eb', card: '#22222a', border: '#3a3a46', btn: '#3b82f6', btnFg: '#ffffff', btnHover: '#2563eb', input: '#26262e', inputFg: '#e5e7eb', inputBorder: '#4b4b58', link: '#60a5fa', accent: '#3b82f6' },
        },
        {
            id: 'laut', name: '🌊 Laut Dalam',
            vars: { bg: '#0b1c2c', fg: '#d6e9f8', card: '#123047', border: '#205070', btn: '#0ea5e9', btnFg: '#04283d', btnHover: '#38bdf8', input: '#0f2a3f', inputFg: '#d6e9f8', inputBorder: '#2a5a7c', link: '#7dd3fc', accent: '#0ea5e9' },
        },
        {
            id: 'rimba', name: '🌿 Rimba Hijau',
            vars: { bg: '#0d1f14', fg: '#d7f0e0', card: '#153523', border: '#255c3c', btn: '#22c55e', btnFg: '#052012', btnHover: '#34d873', input: '#123020', inputFg: '#d7f0e0', inputBorder: '#2f6b47', link: '#86efac', accent: '#22c55e' },
        },
        {
            id: 'nebula', name: '🔭 Nebula Ungu',
            vars: { bg: '#16111f', fg: '#e9defa', card: '#241a33', border: '#43315c', btn: '#8b5cf6', btnFg: '#ffffff', btnHover: '#7c3aed', input: '#2a1f3d', inputFg: '#e9defa', inputBorder: '#4f3a6e', link: '#c4b5fd', accent: '#8b5cf6' },
        },
        {
            id: 'sakura', name: '🌸 Sakura',
            vars: { bg: '#fdf2f6', fg: '#4a2c3a', card: '#ffffff', border: '#f0d3df', btn: '#db2777', btnFg: '#ffffff', btnHover: '#be185d', input: '#fff5f9', inputFg: '#4a2c3a', inputBorder: '#ecc4d4', link: '#db2777', accent: '#db2777' },
        },
        {
            id: 'kopi', name: '☕ Kopi Hangat',
            vars: { bg: '#201812', fg: '#efe2d0', card: '#2d2118', border: '#4d3a2a', btn: '#d97706', btnFg: '#231708', btnHover: '#f59e0b', input: '#332619', inputFg: '#efe2d0', inputBorder: '#5c4530', link: '#fbbf24', accent: '#d97706' },
        },
    ];
    let activeTheme = null;          // { id, vars } | null = ikuti VS Code
    let customTheme = null;          // warna kustom terakhir yang diketik pengguna
    let themePanel = null;

    /** Terapkan tema aktif ke halaman: set/hapus variabel --sk-* di elemen html. */
    function applyTheme() {
        const r = document.documentElement.style;
        THEME_KEYS.forEach((k) => r.removeProperty('--sk-' + k));
        const vars = activeTheme && activeTheme.vars;
        if (vars) {
            THEME_KEYS.forEach((k) => { if (vars[k]) { r.setProperty('--sk-' + k, vars[k]); } });
        }
    }

    /** Pasang tema dari pesan ekstensi: { id, vars? } atau null (ikuti VS Code). */
    function setTheme(t) {
        activeTheme = null;
        if (t && t.vars) {
            activeTheme = { id: String(t.id || 'kustom'), vars: Object.assign({}, t.vars) };
            if (activeTheme.id === 'kustom') { customTheme = Object.assign({}, t.vars); }
        } else if (t && t.id) {
            const p = THEME_PRESETS.find((x) => x.id === t.id);
            if (p) { activeTheme = { id: p.id, vars: p.vars ? Object.assign({}, p.vars) : null }; }
        }
        applyTheme();
        refreshThemePanel();
    }

    /** Warna dasar untuk color picker kustom: dari tema aktif, atau nilai bawaan gelap. */
    function seedCustomTheme() {
        const gelap = THEME_PRESETS.find((p) => p.id === 'gelap').vars;
        customTheme = Object.assign({}, gelap, (activeTheme && activeTheme.vars) || {});
    }

    function buildThemePanel() {
        const panelEl = el('div', 'theme-panel hidden');
        const head = el('div', 'theme-head');
        head.innerHTML = '<strong>🎨 Tema Tampilan</strong>';
        const closeBtn = el('button', 'theme-ib', '✕');
        closeBtn.title = 'Tutup panel tema';
        closeBtn.onclick = () => panelEl.classList.add('hidden');
        head.appendChild(closeBtn);
        panelEl.appendChild(head);

        const secPreset = el('div', 'theme-sec', 'Tema siap pakai');
        panelEl.appendChild(secPreset);
        const presets = el('div', 'theme-presets');
        THEME_PRESETS.forEach((p) => {
            const chip = el('button', 'theme-preset');
            chip.dataset.preset = p.id;
            const sw = el('span', 'sw');
            const warna = p.vars || { bg: 'var(--sk-bg)', card: 'var(--sk-card)', btn: 'var(--sk-btn)' };
            ['bg', 'card', 'btn'].forEach((k) => {
                const i = document.createElement('i');
                i.style.background = warna[k] || '#888';
                sw.appendChild(i);
            });
            chip.appendChild(sw);
            chip.appendChild(document.createTextNode(p.name));
            chip.onclick = () => {
                activeTheme = { id: p.id, vars: p.vars ? Object.assign({}, p.vars) : null };
                applyTheme();
                vscode.postMessage({ type: 'saveTheme', theme: p.vars ? { id: p.id, vars: activeTheme.vars } : null });
                refreshThemePanel();
            };
            presets.appendChild(chip);
        });
        panelEl.appendChild(presets);

        const secCustom = el('div', 'theme-sec', 'Warna kustom (langsung terlihat)');
        panelEl.appendChild(secCustom);
        const colors = el('div', 'theme-colors');
        [
            ['bg', 'Latar'], ['fg', 'Teks'], ['card', 'Kartu'], ['border', 'Garis'],
            ['btn', 'Tombol'], ['accent', 'Aksen'],
        ].forEach(([k, label]) => {
            const wrap = el('label', 'theme-color');
            wrap.appendChild(document.createTextNode(label));
            const pick = document.createElement('input');
            pick.type = 'color';
            pick.dataset.ck = k;
            pick.oninput = () => {
                if (!customTheme) { seedCustomTheme(); }
                customTheme[k] = pick.value;
                // btnHover ikut tombol biar tetap nyambung; bisa ditimpa lewat preset lain.
                if (k === 'btn') { customTheme.btnHover = pick.value; }
                activeTheme = { id: 'kustom', vars: Object.assign({}, customTheme) };
                applyTheme();
                refreshThemePanel();
            };
            wrap.appendChild(pick);
            colors.appendChild(wrap);
        });
        panelEl.appendChild(colors);

        const actions = el('div', 'theme-actions');
        const simpan = el('button', 'btn primary', '💾 Simpan tema');
        simpan.title = 'Simpan tema ini — dipakai lagi setiap kali berkas dibuka';
        simpan.onclick = () => {
            if (!activeTheme) { return; }
            if (!activeTheme.vars) {
                vscode.postMessage({ type: 'saveTheme', theme: null });
            } else {
                if (activeTheme.id === 'kustom' && customTheme) { activeTheme.vars = Object.assign({}, customTheme); }
                vscode.postMessage({ type: 'saveTheme', theme: { id: activeTheme.id, vars: activeTheme.vars } });
                simpan.textContent = '✅ Tersimpan';
                setTimeout(() => { simpan.textContent = '💾 Simpan tema'; }, 1600);
            }
        };
        const reset = el('button', 'btn', '↩ Ikuti VS Code');
        reset.title = 'Buang tema kustom dan ikuti warna editor lagi';
        reset.onclick = () => {
            activeTheme = null;
            customTheme = null;
            applyTheme();
            vscode.postMessage({ type: 'saveTheme', theme: null });
            refreshThemePanel();
        };
        actions.append(simpan, reset);
        panelEl.appendChild(actions);
        return panelEl;
    }

    function refreshThemePanel() {
        if (!themePanel) { return; }
        themePanel.querySelectorAll('.theme-preset').forEach((chip) => {
            chip.classList.toggle('active', !!activeTheme && activeTheme.id === chip.dataset.preset);
        });
        themePanel.querySelectorAll('input[type="color"]').forEach((pick) => {
            const k = pick.dataset.ck;
            const vars = (activeTheme && activeTheme.vars) || customTheme;
            if (vars && vars[k]) { pick.value = vars[k]; }
        });
    }

    function toggleThemePanel() {
        if (!themePanel) {
            themePanel = buildThemePanel();
            document.body.appendChild(themePanel);
        }
        if (!customTheme && activeTheme && activeTheme.vars) { seedCustomTheme(); }
        themePanel.classList.toggle('hidden');
        refreshThemePanel();
    }

    window.addEventListener('message', (e) => {
        const m = e.data;
        if (m.type === 'theme') {
            // Tema dikirim sebelum data supaya render pertama langsung memakai warna tersimpan.
            setTheme(m.theme || null);
        } else if (m.type === 'data') {
            state = m.payload;
            try { render(Math.min(cur, state.sheets.length - 1)); } catch (err) { showErr(err); }
        } else if (m.type === 'error') {
            app.innerHTML = '<div class="err">❌ ' + esc(m.message) + '</div>';
        } else if (m.type === 'sk-locale') {
            // Bahasa diganti → tombol 🌐 ikut menunjukkan bahasa aktif.
            const lang = m.config && m.config.lang === 'zh-cn' ? 'zh-cn' : 'id';
            document.body.setAttribute('data-ec-lang', lang);
            const b = document.getElementById('btn-language');
            if (b) { b.textContent = '🌐 ' + (lang === 'zh-cn' ? '中文' : 'ID'); }
        }
    });
    window.addEventListener('error', (e) => showErr(e.error || e.message));
    vscode.postMessage({ type: 'ready' });

    function showErr(err) {
        const box = el('div', 'err');
        box.innerHTML = '❌ An error occurred in the viewer:<br><code>' + esc(err && err.stack ? err.stack : err) + '</code>';
        if (!app.children.length) app.appendChild(box); else app.insertBefore(box, app.firstChild);
    }

    function chart(parent, title, config, h) {
        const card = el('div', 'card');
        if (title) card.appendChild(el('h3', '', esc(title)));
        const box = el('div', 'cbox'); box.style.height = (h || 260) + 'px';
        const cv = document.createElement('canvas'); box.appendChild(cv); card.appendChild(box); parent.appendChild(card);
        config.options = Object.assign({ responsive: true, maintainAspectRatio: false }, config.options || {});
        charts.push(new Chart(cv, config));
        return card;
    }

    /**
     * Kartu dengan isi HTML/SVG sendiri (bukan Chart.js) — dipakai diagram pohon keputusan C4.5
     * dan heatmap. Dipakai juga oleh media/builder.js lewat ctx (P.figure).
     */
    function figure(parent, title, html, h) {
        const card = el('div', 'card wide');
        if (title) card.appendChild(el('h3', '', esc(title)));
        const box = el('div', 'figbox');
        box.style.cssText = `overflow:auto;padding:6px 2px;${h ? `max-height:${h}px;` : ''}`;
        box.innerHTML = html;
        card.appendChild(box); parent.appendChild(card);
        return card;
    }

    function section(id, title) {
        const sec = el('section', 'sec'); sec.id = id; sec.appendChild(el('h2', '', title));
        const body = el('div', 'grid'); sec.appendChild(body); app.appendChild(sec); return body;
    }

    const barOpts = (horizontal) => ({ indexAxis: horizontal ? 'y' : 'x', plugins: { legend: { display: false } } });

    function exportToDocx() {
        const btn = document.getElementById('btn-export-docx');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

        // Stop all running animations before capturing
        charts.forEach((c) => { try { c.stop(); } catch (e) { } });
        if (window.SkunderExt && window.SkunderExt.stopAll) { window.SkunderExt.stopAll(); }

        // Capture all chart canvases as PNG data URLs
        const chartImages = charts.map((c) => {
            try {
                const canvas = c.canvas;
                const cardEl = canvas.closest ? canvas.closest('.card') : null;
                const titleEl = cardEl ? cardEl.querySelector('h3') : null;
                return {
                    dataUrl: canvas.toDataURL('image/png'),
                    title: titleEl ? titleEl.textContent.trim() : ''
                };
            } catch (e) { return null; }
        }).filter(Boolean);

        // Collect saved notes from state
        const st = vscode.getState() || {};
        const sheet = state.sheets[cur];
        const key = state.fileName + '|' + sheet.name;
        const notes = (st.notes && st.notes[key]) ? st.notes[key] : [];

        // Stats
        const total = sheet.totalRows * sheet.headers.length || 1;
        const missingPct = ((sheet.missingCells / total) * 100).toFixed(1);

        // Column summary rows (top 30)
        const colSummary = sheet.columns.slice(0, 30).map((c) => ({
            name: c.name,
            type: c.type,
            missing: ((c.missing / (sheet.totalRows || 1)) * 100).toFixed(1) + '%',
            unique: c.unique
        }));

        vscode.postMessage({
            type: 'saveDocx',
            suggestedName: (state.fileName.replace(/\.[^.]+$/, '') || 'report'),
            stats: {
                fileName: state.fileName,
                sheetName: sheet.name,
                totalRows: sheet.totalRows,
                columns: sheet.headers.length,
                missingPct,
                duplicates: sheet.duplicates,
                numericCols: sheet.columns.filter((c) => c.num).length,
                categoryCols: sheet.columns.filter((c) => c.type === 'category').length,
                dateCols: sheet.columns.filter((c) => c.type === 'date').length
            },
            stock: sheet.stockAnalysis,
            needs: sheet.needsAnalysis,
            csvHealth: sheet.csvHealth,
            decisionTree: sheet.decisionTreeAnalysis,
            chartImages,
            notes,
            insights: sheet.insights || [],
            colSummary,
            generatedAt: new Date().toLocaleString('en-US')
        });

        setTimeout(() => {
            if (btn) { btn.disabled = false; btn.textContent = '📄 Export to DOCX'; }
        }, 3000);
    }

    function render(si) {
        if (typeof Chart === 'undefined') throw new Error('Chart.js failed to load. Ensure media/chart.umd.js exists and is properly packaged.');
        cur = si;
        charts.forEach((c) => { try { c.destroy(); } catch (e) { } });
        charts = [];
        app.innerHTML = '';
        const sheet = state.sheets[si];

        // Tema aktif diterapkan setiap render (idempoten) supaya render pertama & ganti sheet konsisten.
        applyTheme();

        Chart.defaults.color = css('--sk-fg') || css('--vscode-foreground') || '#ccc';
        Chart.defaults.borderColor = 'rgba(128,128,128,.25)';
        Chart.defaults.font.family = css('--vscode-font-family') || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
        Chart.defaults.animation = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600, easing: 'easeOutQuart' };

        // Printable report banner
        const printHeader = el('div', 'print-only report-print-header');
        printHeader.innerHTML = `
            <div class="print-brand">
                <h1>Date Skunder Data Analysis Report</h1>
                <p>File: <strong>${esc(state.fileName)}</strong> · Sheet: <strong>${esc(sheet.name)}</strong> · Generated on ${new Date().toLocaleString('en-US')}</p>
            </div>
            <div class="print-meta-grid">
                <div><span>Total Rows:</span> <strong>${sheet.totalRows.toLocaleString('en-US')}</strong></div>
                <div><span>Columns:</span> <strong>${sheet.headers.length}</strong></div>
                <div><span>Duplicate Rows:</span> <strong>${sheet.duplicates.toLocaleString('en-US')}</strong></div>
                <div><span>Missing Cells:</span> <strong>${((sheet.missingCells / (sheet.totalRows * sheet.headers.length || 1)) * 100).toFixed(1)}%</strong></div>
            </div>
        `;
        app.appendChild(printHeader);

        const head = el('div', 'head');
        head.innerHTML = `<div><h1>${esc(state.fileName)}</h1><div class="muted">${sheet.totalRows.toLocaleString('en-US')} rows · ${sheet.headers.length} columns${sheet.truncated ? ' · analyzed first 200,000 rows' : ''}</div></div>`;

        const actBox = el('div', 'head-actions');

        const docxBtn = el('button', 'btn primary', '📄 Export to DOCX');
        docxBtn.id = 'btn-export-docx';
        docxBtn.title = 'Save this data analysis as a professional Word document';
        docxBtn.onclick = exportToDocx;

        // Online Project button + visible link chip
        const onlineUrl = 'https://stremlit-launcher.streamlit.app/';
        const webBtn = el('button', 'btn', '🌐 Online Project');
        webBtn.id = 'btn-visit-website-online';
        webBtn.title = `Open: ${onlineUrl}`;
        webBtn.onclick = () => {
            vscode.postMessage({ type: 'openExternalOnlineProject', url: onlineUrl });
        };
        const onlineChip = el('a', 'link-bar', '🔗 ' + onlineUrl);
        onlineChip.title = 'Click to open in browser';
        onlineChip.href = '#';
        onlineChip.onclick = (ev) => {
            ev.preventDefault();
            vscode.postMessage({ type: 'openExternalOnlineProject', url: onlineUrl });
        };

        // Offline Project button + visible link chip
        const offlineUrl = 'https://pypi.org/project/streamlit-launcher/';
        const webBtn2 = el('button', 'btn', '📦 PyPI Online Project');
        webBtn2.id = 'btn-visit-website-offline';
        webBtn2.title = `Open: ${offlineUrl}`;
        webBtn2.onclick = () => {
            vscode.postMessage({ type: 'openExternalOfflineProject', url: offlineUrl });
        };
        const offlineChip = el('a', 'link-bar', '🔗 ' + offlineUrl);
        offlineChip.title = 'Click to open in browser';
        offlineChip.href = '#';
        offlineChip.onclick = (ev) => {
            ev.preventDefault();
            vscode.postMessage({ type: 'openExternalOfflineProject', url: offlineUrl });
        };

        const downloaduser = 'https://pepy.tech/projects/streamlit-launcher?timeRange=threeMonths&category=version&includeCIDownloads=true&granularity=weekly&viewType=line&versions=Total%2C4.*%2C3.*';
        const webBtn3 = el('button', 'btn', '📩 Visit Download');
        webBtn3.id = 'btn-visit-website-offline';
        webBtn3.title = `Open: ${downloaduser}`;
        webBtn3.onclick = () => {
            vscode.postMessage({ type: 'openExternalOfflineProject', url: downloaduser });
        };
        const offlineChip3 = el('a', 'link-bar', '🔗 ' + downloaduser);
        offlineChip3.title = 'Click to open in browser';
        offlineChip3.href = '#';
        offlineChip3.onclick = (ev) => {
            ev.preventDefault();
            vscode.postMessage({ type: 'openExternalOfflineProject', url: downloaduser });
        };

        // Reload Button
        const rl = el('button', 'btn', '↻ Reload');
        rl.onclick = () => vscode.postMessage({ type: 'reload' });

        // Export jurnal/Excel/PPT/flow/JSON: semua tombol ini bisa diklik langsung maupun lewat pet Spider.
        const pdfBtn = el('button', 'btn', '📑 Export Jurnal (PDF)');
        pdfBtn.id = 'btn-export-pdf';
        pdfBtn.title = 'Simpan analisis ini sebagai jurnal PDF';
        pdfBtn.onclick = () => vscode.postMessage({ type: 'savePdf', sheetName: sheet.name });

        const xlsxBtn = el('button', 'btn', '📊 Export Excel');
        xlsxBtn.id = 'btn-export-xlsx';
        xlsxBtn.title = 'Simpan laporan analisis sebagai .xlsx (lengkap dengan grafik)';
        xlsxBtn.onclick = () => vscode.postMessage({ type: 'saveXlsx', sheetName: sheet.name });

        const pptxBtn = el('button', 'btn', '📽️ Export PPT');
        pptxBtn.id = 'btn-export-pptx';
        pptxBtn.title = 'Simpan analisis sebagai presentasi PowerPoint (.pptx)';
        pptxBtn.onclick = () => vscode.postMessage({ type: 'savePptx', sheetName: sheet.name });

        const flowBtn = el('button', 'btn', '🧭 Export Flow');
        flowBtn.id = 'btn-export-workflow';
        flowBtn.title = 'Simpan diagram alur analisis sebagai gambar (PNG, JPG, SVG)';
        flowBtn.onclick = () => vscode.postMessage({ type: 'saveWorkflow', sheetName: sheet.name });

        const jsonBtn = el('button', 'btn', '🧩 Export JSON');
        jsonBtn.id = 'btn-export-json';
        jsonBtn.title = 'Simpan seluruh hasil analisis berkas ini sebagai .json (semua lembar)';
        jsonBtn.onclick = () => vscode.postMessage({ type: 'saveJson', sheetName: sheet.name });

        // Python package export: seluruh data + skrip siap jalan (analysis.py, streamlit_app.py)
        const pyBtn = el('button', 'btn', '🐍 Export Python');
        pyBtn.id = 'btn-export-python';
        pyBtn.title = 'Buat paket Python berisi seluruh data + skrip siap dijalankan (analysis.py, streamlit_app.py) + README';
        pyBtn.onclick = () => vscode.postMessage({ type: 'savePython', sheetName: sheet.name });

        // Panel tema: preset siap pakai + warna kustom, tersimpan antar-sesi.
        const themeBtn = el('button', 'btn', '🎨 Tema');
        themeBtn.id = 'btn-theme';
        themeBtn.title = 'Ganti tema tampilan halaman analisis (preset + warna kustom)';
        themeBtn.onclick = () => toggleThemePanel();

        // Bahasa antarmuka: tombol ini tempat ganti bahasa yang paling mudah ditemukan.
        const langCode = document.body.getAttribute('data-ec-lang') === 'zh-cn' ? 'zh-cn' : 'id';
        const langBtn = el('button', 'btn', '🌐 ' + (langCode === 'zh-cn' ? '中文' : 'ID'));
        langBtn.id = 'btn-language';
        langBtn.title = 'Ganti bahasa antarmuka / 切换界面语言 (Ctrl+Alt+U)';
        langBtn.onclick = () => vscode.postMessage({ type: 'languagePick' });

        // Room: buat / gabung langsung dari halaman analisis. Laptop lain yang Join Room otomatis
        // menerima data + analisis pemilik room, jadi kedua layar menampilkan hal yang sama.
        const roomCreateBtn = el('button', 'btn', '➕ Create Room');
        roomCreateBtn.id = 'btn-room-create';
        roomCreateBtn.title = 'Buat room dari berkas ini — laptop lain yang Join Room langsung menerima data & analisis yang sama';
        roomCreateBtn.onclick = () => vscode.postMessage({ type: 'roomQuickCreate' });

        const roomJoinBtn = el('button', 'btn', '🔗 Join Room');
        roomJoinBtn.id = 'btn-room-join';
        roomJoinBtn.title = 'Gabung ke room laptop lain — data + analisis pemilik room ikut terbuka di sini';
        roomJoinBtn.onclick = () => vscode.postMessage({ type: 'roomQuickJoin' });

        // Append all buttons to the action box
        actBox.append(roomCreateBtn, roomJoinBtn, docxBtn, pdfBtn, xlsxBtn, pptxBtn, flowBtn, jsonBtn, pyBtn, webBtn, webBtn2, webBtn3, rl, themeBtn, langBtn);

        head.appendChild(actBox);
        app.appendChild(head);

        // URL link chips row — shown below head
        const linksRow = el('div', '');
        linksRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding:6px 0 10px;align-items:center;';
        linksRow.appendChild(onlineChip);
        linksRow.appendChild(offlineChip);
        app.appendChild(linksRow);


        const nav = el('nav', 'nav');
        [
            ['summary', 'Summary'],
            ['businesskpi', '📊 KPI Bisnis'],
            ['stock', '📦 Stok Barang'],
            ['saham', '📈 Analisis Saham'],
            ['trading', 'Mode Analisis'],
            ['needs', '🎯 Analisis Kebutuhan'],
            ['csvhealth', '🩺 Profil & Kualitas CSV'],
            ['decisionTree', '🌳 Decision Tree C4.5'],
            ['notes', 'Notes & Observations'],
            ['insights', 'Insights'],
            ['table', 'Data Table'],
            ['editor', '✏️ Editor CSV'],
            ['preview', '📊 Grafik Pratinjau'],
            ['builder', 'Chart Builder'],
            ['charts', 'Charts'],
            ['advanced', 'Advanced'],
            ['columns', 'Column Details'],
            ['correlation', 'Correlation']
        ].forEach(([id, t]) => nav.insertAdjacentHTML('beforeend', `<a href="#${id}">${t}</a>`));
        app.appendChild(nav);
        nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', (ev) => {
            ev.preventDefault();
            const target = document.getElementById(a.getAttribute('href').slice(1));
            if (target) target.scrollIntoView({ behavior: 'smooth' });
        }));

        const cols = sheet.columns;
        const numCols = cols.filter((c) => c.num);
        const total = sheet.rows.length ? sheet.totalRows * sheet.headers.length : 1;

        // ---- Summary ----
        const ov = section('summary', 'Summary');
        const kpis = el('div', 'kpis');
        [['Rows', sheet.totalRows.toLocaleString('en-US')], ['Columns', sheet.headers.length], ['Numeric', numCols.length],
        ['Categorical', cols.filter((c) => c.type === 'category').length], ['Date', cols.filter((c) => c.type === 'date').length],
        ['Missing Cells', ((sheet.missingCells / total) * 100).toFixed(1) + '%'], ['Duplicates', sheet.duplicates.toLocaleString('en-US')]]
            .forEach(([k, v]) => kpis.appendChild(el('div', 'kpi', `<b>${v}</b><span>${k}</span>`)));
        ov.parentElement.insertBefore(kpis, ov);

        const typeCount = {};
        cols.forEach((c) => { typeCount[TYPE_LABEL[c.type] || c.type] = (typeCount[TYPE_LABEL[c.type] || c.type] || 0) + 1; });
        chart(ov, 'Column Type Composition', { type: 'doughnut', data: { labels: Object.keys(typeCount), datasets: [{ data: Object.values(typeCount), backgroundColor: PALETTE }] } });
        chart(ov, 'Missing Values per Column (%)', { type: 'bar', data: { labels: cols.map((c) => cut(c.name, 18)), datasets: [{ data: cols.map((c) => +((c.missing / (sheet.totalRows || 1)) * 100).toFixed(1)), backgroundColor: color(2, 'cc') }] }, options: barOpts(false) });
        chart(ov, 'Unique Values per Column', { type: 'bar', data: { labels: cols.map((c) => cut(c.name, 18)), datasets: [{ data: cols.map((c) => c.unique), backgroundColor: color(0, 'cc') }] }, options: Object.assign(barOpts(false), { scales: { y: { type: 'logarithmic' } } }) });
        if (numCols.length >= 3) {
            const sel = numCols.slice(0, 8);
            chart(ov, 'Mean vs Median Radar (Normalized 0–1)', { type: 'radar', data: { labels: sel.map((c) => cut(c.name, 16)), datasets: [{ label: 'Mean', data: sel.map((c) => (c.num.max === c.num.min ? 0 : (c.num.mean - c.num.min) / (c.num.max - c.num.min))), backgroundColor: color(0, '55'), borderColor: color(0) }, { label: 'Median', data: sel.map((c) => (c.num.max === c.num.min ? 0 : (c.num.median - c.num.min) / (c.num.max - c.num.min))), backgroundColor: color(1, '33'), borderColor: color(1) }] }, options: { scales: { r: { min: 0, max: 1 } } } });
        }
        if (numCols.length) {
            chart(ov, 'Outliers per Numeric Column', { type: 'bar', data: { labels: numCols.map((c) => cut(c.name, 18)), datasets: [{ data: numCols.map((c) => c.num.outliers), backgroundColor: color(3, 'cc') }] }, options: barOpts(false) });
        }

        // ---- KPI Bisnis ----
        businessKpiSection(sheet);

        // ---- Stock & Inventory ----
        stockSection(sheet);

        // ---- Analisis Saham (candlestick OHLC) ----
        // Bagian khusus data pasar modal: candlestick + volume + MA + RSI.
        if (window.SkunderStock) {
            window.SkunderStock.init({ app, sheet, state, vscode, el, esc, fmt, cut, PALETTE, section, chart, figure });
        }

        // ---- Mode Analisis (TradingView) ----
        // Tombol pembuka lapisan penuh TradingView: chart lengkap, teknikal, fundamental, screener,
        // berita, dan pencarian seluruh emiten IDX (khusus analisis — tanpa demo/real).
        if (window.SkunderTrading) {
            window.SkunderTrading.init({ app, sheet, state, vscode, el, esc, fmt, cut, PALETTE, section, chart, figure });
        }

        // ---- Needs Analysis ----
        needsSection(sheet);

        // ---- CSV Health ----
        csvHealthSection(sheet);

        // ---- Decision Tree ----
        decisionTreeSection(sheet);

        // ---- Notes & Observations ----
        notesSection(sheet);

        // ---- Insights ----
        const ins = section('insights', 'Automated Insights');
        const ul = el('ul', 'insights card wide');
        sheet.insights.forEach((t) => ul.appendChild(el('li', '', esc(t))));
        ins.appendChild(ul);

        // ---- Data Table ----
        tableSection(sheet);

        // ---- Editor CSV Langsung ----
        // Sunting berkas CSV/TSV di dalam pratinjau lalu simpan kembali ke berkas.
        if (window.SkunderEditor) {
            window.SkunderEditor.init({ app, sheet, state, vscode, el, esc, fmt, cut, PALETTE, section });
        }

        // ---- Grafik Pratinjau (pilih fitur) ----
        // Panel grafik cepat: pilih kolom (fitur) yang ingin digrafikkan, ikut filter tabel.
        if (window.SkunderPreview) {
            window.SkunderPreview.init({ app, sheet, state, vscode, el, esc, fmt, cut, PALETTE, section, chart, figure });
        }

        // ---- Charts ----
        const gr = section('charts', 'Visualizations');
        sheet.groupBars.forEach((g, i) => chart(gr, `Average ${g.num} by ${g.cat}`, { type: 'bar', data: { labels: g.labels.map((l) => cut(l, 20)), datasets: [{ data: g.means, backgroundColor: g.labels.map((_, k) => color(k + i)) }] }, options: barOpts(g.labels.length > 6) }));
        sheet.trends.forEach((t, i) => chart(gr, `Trend of ${t.num} by ${t.gran === 'year' ? 'year' : t.gran === 'month' ? 'month' : 'day'}`, { type: 'line', data: { labels: t.labels, datasets: [{ data: t.values, borderColor: color(i), backgroundColor: color(i, '33'), fill: true, tension: 0.3, pointRadius: 2 }] }, options: { plugins: { legend: { display: false } } } }));
        if (sheet.crosstab) {
            const x = sheet.crosstab;
            chart(gr, `${x.a} × ${x.b} (Stacked)`, { type: 'bar', data: { labels: x.labels.map((l) => cut(l, 16)), datasets: x.series.map((s, i) => ({ label: s.name, data: s.data, backgroundColor: color(i) })) }, options: { scales: { x: { stacked: true }, y: { stacked: true } } } });
            chart(gr, `${x.a} × ${x.b} (Grouped)`, { type: 'bar', data: { labels: x.labels.map((l) => cut(l, 16)), datasets: x.series.map((s, i) => ({ label: s.name, data: s.data, backgroundColor: color(i) })) } });
        }
        cols.filter((c) => c.top && (c.type === 'category' || c.type === 'boolean')).slice(0, 4).forEach((c, i) => {
            const t = c.top.slice(0, 8);
            chart(gr, `Distribution of ${c.name}`, { type: i % 2 ? 'pie' : 'doughnut', data: { labels: t.map((x) => cut(x.value, 18)), datasets: [{ data: t.map((x) => x.count), backgroundColor: PALETTE }] } });
        });
        const polar = cols.find((c) => c.top && c.type === 'category' && c.top.length >= 3);
        if (polar) chart(gr, `Polar Area: ${polar.name}`, { type: 'polarArea', data: { labels: polar.top.slice(0, 8).map((x) => cut(x.value, 16)), datasets: [{ data: polar.top.slice(0, 8).map((x) => x.count), backgroundColor: PALETTE.map((p) => p + 'bb') }] } });
        cols.filter((c) => c.series && c.series.labels.length > 1).slice(0, 2).forEach((c, i) => chart(gr, `Record Count per Period ${c.name}`, { type: 'line', data: { labels: c.series.labels, datasets: [{ data: c.series.counts, borderColor: color(i + 4), backgroundColor: color(i + 4, '33'), fill: true, stepped: true, pointRadius: 0 }] }, options: { plugins: { legend: { display: false } } } }));
        sheet.scatters.forEach((s, i) => chart(gr, `${s.x} vs ${s.y} (r = ${s.r})`, { type: 'scatter', data: { datasets: [{ data: s.points.map(([x, y]) => ({ x, y })), backgroundColor: color(i, '99'), pointRadius: 3 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: s.x } }, y: { title: { display: true, text: s.y } } } } }));
        if (!gr.children.length) gr.appendChild(el('div', 'muted', 'No additional charts available for this dataset.'));

        // ---- Column Details ----
        const kc = section('columns', 'Column Details');
        cols.slice(0, 60).forEach((c, i) => kc.appendChild(colCard(c, i)));

        // ---- Correlation ----
        const kr = section('correlation', 'Correlation Matrix (Pearson)');
        kr.appendChild(heatmap(sheet.corr));

        if (window.SkunderExt) {
            window.SkunderExt.init({ app, sheet, state, vscode, el, esc, fmt, cut, PALETTE: PALETTE, section, chart, figure, treeSvg });
        }

        // Spider (laba-laba pemandu) menerima halaman yang baru digambar sebagai daftar target.
        if (window.SkunderSpider) {
            window.SkunderSpider.init({ app, sheet, state, vscode, el, esc, fmt, cut, section });
        }
    }

    function notesSection(sheet) {
        const body = section('notes', '📝 Notes & Observations');
        const card = el('div', 'card wide notes-container');
        const st = vscode.getState() || {};
        st.notes = st.notes || {};
        const key = state.fileName + '|' + sheet.name;
        let notes = st.notes[key];
        if (!Array.isArray(notes) || !notes.length) {
            notes = [
                {
                    id: 'default-1',
                    title: 'Executive Summary & Analysis Notes',
                    category: 'Summary',
                    text: 'Key takeaways and observations for this dataset:\n- Data completeness and distribution looks solid.\n- Add custom findings and action items here before exporting to PDF.',
                    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                }
            ];
            st.notes[key] = notes;
            vscode.setState(st);
        }

        const headBar = el('div', 'notes-head-bar');
        headBar.innerHTML = `
            <div>
                <h3>Analysis Notes & Report Comments</h3>
                <span class="muted">Add custom commentary, business insights, or data caveats. These notes will be saved and included in the PDF export.</span>
            </div>
        `;
        const addBtn = el('button', 'btn primary', 'Add New Note');
        headBar.appendChild(addBtn);
        card.appendChild(headBar);

        const list = el('div', 'notes-list');
        card.appendChild(list);
        body.appendChild(card);

        function saveNotes() {
            const current = vscode.getState() || {};
            current.notes = current.notes || {};
            current.notes[key] = notes;
            vscode.setState(current);
        }

        function renderNotes() {
            list.innerHTML = '';
            notes.forEach((item, idx) => {
                const noteEl = el('div', 'note-card');
                noteEl.innerHTML = `
                    <div class="note-top">
                        <input class="note-title-input" type="text" value="${esc(item.title)}" placeholder="Note Title…">
                        <select class="note-cat-select" data-id="${item.id}">
                            <option value="Summary"${item.category === 'Summary' ? ' selected' : ''}>📋 Summary</option>
                            <option value="Insight"${item.category === 'Insight' ? ' selected' : ''}>💡 Insight</option>
                            <option value="Warning"${item.category === 'Warning' ? ' selected' : ''}>⚠️ Data Warning</option>
                            <option value="Action"${item.category === 'Action' ? ' selected' : ''}>🎯 Action Item</option>
                        </select>
                        <span class="note-date muted">${esc(item.date)}</span>
                        <button class="ib note-del-btn" title="Delete note">✕</button>
                    </div>
                    <textarea class="note-textarea" rows="3" placeholder="Write your observation, conclusion, or methodology details here…">${esc(item.text)}</textarea>
                    <div class="print-only note-print-content">
                        <h4>${esc(item.title)} <span class="note-badge">${esc(item.category)}</span> <small>(${esc(item.date)})</small></h4>
                        <p>${esc(item.text).replace(/\n/g, '<br>')}</p>
                    </div>
                `;

                const titleInp = noteEl.querySelector('.note-title-input');
                const catSel = noteEl.querySelector('.note-cat-select');
                const textInp = noteEl.querySelector('.note-textarea');
                const delBtn = noteEl.querySelector('.note-del-btn');

                titleInp.oninput = () => { item.title = titleInp.value; saveNotes(); };
                catSel.onchange = () => { item.category = catSel.value; saveNotes(); };
                textInp.oninput = () => { item.text = textInp.value; saveNotes(); };
                delBtn.onclick = () => {
                    notes.splice(idx, 1);
                    saveNotes();
                    renderNotes();
                };

                list.appendChild(noteEl);
            });
        }

        addBtn.onclick = () => {
            notes.push({
                id: 'note-' + Date.now(),
                title: 'New Observation',
                category: 'Insight',
                text: '',
                date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            });
            saveNotes();
            renderNotes();
            const textareas = list.querySelectorAll('.note-textarea');
            if (textareas.length) textareas[textareas.length - 1].focus();
        };

        renderNotes();
    }

    function colCard(c, idx) {
        const card = el('div', 'card');
        card.innerHTML = `<h3>${esc(c.name)} <span class="badge t-${c.type}">${TYPE_LABEL[c.type] || c.type}</span></h3><div class="muted">${c.count.toLocaleString('en-US')} populated · ${c.missing.toLocaleString('en-US')} missing · ${c.unique.toLocaleString('en-US')} unique</div>`;
        const box = (h) => { const b = el('div', 'cbox'); b.style.height = h + 'px'; const cv = document.createElement('canvas'); b.appendChild(cv); card.appendChild(b); return cv; };
        if (c.num) {
            const n = c.num;
            card.insertAdjacentHTML('beforeend', `<table class="stats"><tr><td>Min</td><td>${fmt(n.min)}</td><td>Q1</td><td>${fmt(n.q1)}</td><td>Median</td><td>${fmt(n.median)}</td></tr><tr><td>Mean</td><td>${fmt(n.mean)}</td><td>Q3</td><td>${fmt(n.q3)}</td><td>Max</td><td>${fmt(n.max)}</td></tr><tr><td>Std</td><td>${fmt(n.std)}</td><td>Skew</td><td>${fmt(n.skew)}</td><td>Outliers</td><td>${n.outliers}</td></tr></table>${boxplot(n)}`);
            charts.push(new Chart(box(180), { type: 'bar', data: { labels: n.hist.labels, datasets: [{ data: n.hist.counts, backgroundColor: color(idx, 'cc'), barPercentage: 1, categoryPercentage: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { display: false } } } } }));
        } else if (c.top) {
            charts.push(new Chart(box(Math.max(140, c.top.length * 22)), { type: 'bar', data: { labels: c.top.map((t) => cut(t.value, 22)), datasets: [{ data: c.top.map((t) => t.count), backgroundColor: color(idx, 'cc') }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } }));
        } else if (c.series) {
            card.insertAdjacentHTML('beforeend', `<div class="muted">${esc(c.dateMin)} → ${esc(c.dateMax)}</div>`);
            charts.push(new Chart(box(180), { type: 'line', data: { labels: c.series.labels, datasets: [{ data: c.series.counts, borderColor: color(idx), backgroundColor: color(idx, '33'), fill: true, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } }));
        } else if (c.type === 'id') {
            card.appendChild(el('div', 'muted', 'Identifier column excluded from numeric calculations.'));
        } else if (c.type === 'text') {
            card.appendChild(el('div', 'muted', `Free text · length ${c.minLen}–${c.maxLen} characters.`));
        }
        return card;
    }

    function boxplot(n) {
        const r = n.max - n.min || 1, p = (v) => Math.max(0, Math.min(100, ((v - n.min) / r) * 100));
        const wl = p(Math.max(n.min, n.lower)), wr = p(Math.min(n.max, n.upper));
        return `<div class="box"><div class="whisk" style="left:${wl}%;width:${wr - wl}%"></div><div class="iqr" style="left:${p(n.q1)}%;width:${p(n.q3) - p(n.q1)}%"></div><div class="med" style="left:${p(n.median)}%"></div></div>`;
    }

    function heatmap(corr) {
        const wrap = el('div', 'card wide tablewrap');
        if (corr.cols.length < 2) { wrap.innerHTML = '<div class="muted">Requires at least 2 numeric columns for correlation matrix.</div>'; return wrap; }
        let h = '<table class="heat"><tr><th></th>' + corr.cols.map((c) => `<th>${esc(cut(c, 14))}</th>`).join('') + '</tr>';
        corr.matrix.forEach((row, i) => {
            h += `<tr><th>${esc(cut(corr.cols[i], 18))}</th>` + row.map((r) => {
                if (r === null) return '<td>–</td>';
                const bg = r >= 0 ? `rgba(78,121,167,${Math.abs(r)})` : `rgba(225,87,89,${Math.abs(r)})`;
                return `<td style="background:${bg}">${r.toFixed(2)}</td>`;
            }).join('') + '</tr>';
        });
        wrap.innerHTML = h + '</table><div class="muted">Blue = positive correlation · Red = negative correlation</div>';
        return wrap;
    }

    function tableSection(sheet) {
        const body = section('table', `Data Table (showing ${sheet.rows.length.toLocaleString('en-US')} of ${sheet.totalRows.toLocaleString('en-US')} rows)`);
        const card = el('div', 'card wide');
        const bar = el('div', 'toolbar'); const q = el('input'); q.placeholder = '🔍 Search in table…';
        q.id = 'sk-table-search';
        const more = el('button', 'btn', 'Load 200 more rows');
        bar.appendChild(q); card.appendChild(bar);
        const wrap = el('div', 'tablewrap tall'); const table = el('table', 'data'); wrap.appendChild(table); card.appendChild(wrap); card.appendChild(more);
        body.appendChild(card);
        let limit = 100, sortCol = -1, asc = true, query = '';
        const numeric = sheet.columns.map((c) => c.type === 'number' || c.type === 'integer');
        function draw() {
            let rows = sheet.rows;
            if (query) rows = rows.filter((r) => r.some((v) => v !== null && String(v).toLowerCase().includes(query)));
            if (sortCol >= 0) rows = [...rows].sort((a, b) => { const x = a[sortCol], y = b[sortCol]; if (x === y) return 0; if (x === null) return 1; if (y === null) return -1; return (x < y ? -1 : 1) * (asc ? 1 : -1); });
            let h = '<thead><tr><th>#</th>' + sheet.headers.map((c, i) => `<th data-i="${i}">${esc(c)}${sortCol === i ? (asc ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>';
            rows.slice(0, limit).forEach((r, k) => { h += `<tr><td class="idx">${k + 1}</td>` + r.map((v, i) => `<td class="${numeric[i] ? 'r' : ''}${v === null ? ' nul' : ''}">${v === null ? '∅' : esc(v)}</td>`).join('') + '</tr>'; });
            table.innerHTML = h + '</tbody>';
            more.style.display = rows.length > limit ? '' : 'none';
            table.querySelectorAll('th[data-i]').forEach((th) => th.onclick = () => { const i = +th.dataset.i; asc = sortCol === i ? !asc : true; sortCol = i; draw(); });
        }
        q.oninput = () => { query = q.value.toLowerCase(); limit = 100; draw(); };
        more.onclick = () => { limit += 200; draw(); };
        draw();
    }

    function stockSection(sheet) {
        const stock = sheet.stockAnalysis;
        const body = section('stock', '📦 Analisis & Manajemen Stok Barang');
        if (!stock || !stock.items || !stock.items.length) {
            const emptyCard = el('div', 'card wide');
            emptyCard.innerHTML = `
                <div style="padding:16px;">
                    <h3>⚠️ Data Stok Barang Tidak Terdeteksi Secara Otomatis</h3>
                    <p class="muted">Pastikan file CSV memiliki kolom nama barang/produk (misal: <code>Item</code>, <code>Product</code>, <code>Nama Barang</code>, <code>Product line</code>) dan kolom jumlah stok (misal: <code>Qty</code>, <code>Quantity</code>, <code>Stok</code>, <code>Jumlah</code>).</p>
                </div>
            `;
            body.appendChild(emptyCard);
            return;
        }

        const kpis = stock.kpis;
        const kpisEl = el('div', 'kpis stock-kpis');
        [
            ['Total SKU', kpis.totalSKUs.toLocaleString('en-US'), ''],
            ['Total Volume Stok', kpis.totalStockVolume.toLocaleString('en-US'), ''],
            ['Total Valuasi Aset', kpis.totalValuation ? fmt(kpis.totalValuation) : '—', 'val'],
            ['Rata-rata Stok/SKU', fmt(kpis.averageStockPerItem), ''],
            ['🔴 Kritis / Habis', kpis.criticalCount.toLocaleString('en-US'), kpis.criticalCount > 0 ? 'kpi-crit' : ''],
            ['🟡 Stok Menipis', kpis.lowCount.toLocaleString('en-US'), kpis.lowCount > 0 ? 'kpi-warn' : ''],
            ['🟢 Stok Aman', kpis.healthyCount.toLocaleString('en-US'), 'kpi-ok'],
            ['🔵 Overstock', kpis.overstockCount.toLocaleString('en-US'), 'kpi-info'],
        ].forEach(([label, val, cls]) => {
            const kpiDiv = el('div', `kpi ${cls}`);
            kpiDiv.innerHTML = `<b>${val}</b><span>${label}</span>`;
            kpisEl.appendChild(kpiDiv);
        });
        body.parentElement.insertBefore(kpisEl, body);

        // Chart 1: Status Distribution Doughnut
        chart(body, 'Distribusi Kesehatan Stok', {
            type: 'doughnut',
            data: {
                labels: stock.statusDistribution.map(d => d.label),
                datasets: [{
                    data: stock.statusDistribution.map(d => d.count),
                    backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6']
                }]
            }
        });

        // Chart 2: Top 10 Stok Terbanyak
        chart(body, 'Top 10 Barang dengan Stok Tertinggi', {
            type: 'bar',
            data: {
                labels: stock.topStock.map(t => cut(t.label, 18)),
                datasets: [{
                    data: stock.topStock.map(t => t.value),
                    backgroundColor: color(0, 'cc')
                }]
            },
            options: barOpts(true)
        });

        // Chart 3: Valuasi Stok per Kategori
        if (stock.categoryValuation && stock.categoryValuation.length) {
            chart(body, 'Nilai Valuasi Aset Stok per Kategori', {
                type: 'bar',
                data: {
                    labels: stock.categoryValuation.map(c => cut(c.label, 16)),
                    datasets: [{
                        label: 'Valuasi',
                        data: stock.categoryValuation.map(c => c.value),
                        backgroundColor: color(4, 'cc')
                    }]
                },
                options: barOpts(false)
            });
        }

        // Chart 4: ABC Pareto Classification
        if (stock.abcSummary) {
            const abc = stock.abcSummary;
            chart(body, 'Analisis Pareto / ABC Inventaris (% Valuasi vs % SKU)', {
                type: 'bar',
                data: {
                    labels: ['Kelas A (Prioritas Tinggi)', 'Kelas B (Menengah)', 'Kelas C (Ekonomis)'],
                    datasets: [
                        { label: '% Nilai Valuasi', data: [abc.classA.valPct, abc.classB.valPct, abc.classC.valPct], backgroundColor: '#3b82f6' },
                        { label: '% Jumlah SKU', data: [abc.classA.pctCount, abc.classB.pctCount, abc.classC.pctCount], backgroundColor: '#94a3b8' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // Interactive Stock Table Card
        const tblCard = el('div', 'card wide stock-table-card');
        tblCard.innerHTML = `
            <div class="stock-tbl-header">
                <div>
                    <h3>Daftar Inventaris Stok Barang</h3>
                    <div class="muted">Deteksi kolom: Item = <code>${esc(stock.itemCol)}</code>, Qty = <code>${esc(stock.qtyCol)}</code>${stock.priceCol ? `, Harga = <code>${esc(stock.priceCol)}</code>` : ''}${stock.categoryCol ? `, Kategori = <code>${esc(stock.categoryCol)}</code>` : ''}</div>
                </div>
                <div class="stock-filters">
                    <button class="s-tab active" data-filter="all">Semua (${stock.items.length})</button>
                    <button class="s-tab" data-filter="critical">🔴 Kritis (${kpis.criticalCount})</button>
                    <button class="s-tab" data-filter="low">🟡 Menipis (${kpis.lowCount})</button>
                    <button class="s-tab" data-filter="healthy">🟢 Aman (${kpis.healthyCount})</button>
                    <button class="s-tab" data-filter="overstock">🔵 Overstock (${kpis.overstockCount})</button>
                    <button class="s-tab" data-filter="classA">⭐ Kelas A</button>
                </div>
            </div>
            <div class="toolbar" style="margin-top:10px;">
                <input class="stock-search" placeholder="🔍 Cari nama barang / kategori stok…" style="max-width:320px;">
            </div>
            <div class="tablewrap" style="max-height:360px;overflow-y:auto;margin-top:8px;">
                <table class="data stock-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Nama Barang / Produk</th>
                            <th>Kategori</th>
                            <th class="r">Stok Saat Ini</th>
                            <th class="r">Harga Satuan</th>
                            <th class="r">Total Valuasi</th>
                            <th>Status Stok</th>
                            <th class="r">Saran Restock</th>
                            <th>Prioritas</th>
                            <th>ABC</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
                <span class="stock-row-count muted"></span>
                <button class="btn stock-load-more" style="display:none;">Muat 50 item lagi</button>
            </div>
        `;

        body.appendChild(tblCard);

        let activeFilter = 'all';
        let searchQuery = '';
        let displayLimit = 50;

        const tbody = tblCard.querySelector('tbody');
        const countSpan = tblCard.querySelector('.stock-row-count');
        const loadMoreBtn = tblCard.querySelector('.stock-load-more');
        const searchInput = tblCard.querySelector('.stock-search');
        const filterTabs = tblCard.querySelectorAll('.s-tab');

        function renderStockRows() {
            let filtered = stock.items;
            if (activeFilter === 'critical') filtered = filtered.filter(it => it.status === 'critical');
            else if (activeFilter === 'low') filtered = filtered.filter(it => it.status === 'low');
            else if (activeFilter === 'healthy') filtered = filtered.filter(it => it.status === 'healthy');
            else if (activeFilter === 'overstock') filtered = filtered.filter(it => it.status === 'overstock');
            else if (activeFilter === 'classA') filtered = filtered.filter(it => it.abcClass === 'A');

            if (searchQuery) {
                filtered = filtered.filter(it =>
                    it.name.toLowerCase().includes(searchQuery) ||
                    (it.category && it.category.toLowerCase().includes(searchQuery))
                );
            }

            countSpan.textContent = `Menampilkan ${Math.min(displayLimit, filtered.length)} dari ${filtered.length} produk`;
            loadMoreBtn.style.display = filtered.length > displayLimit ? '' : 'none';

            let html = '';
            filtered.slice(0, displayLimit).forEach((it, idx) => {
                const statusBadge = it.status === 'critical' ? '<span class="badge" style="background:#ef4444;">🔴 Kritis</span>'
                    : it.status === 'low' ? '<span class="badge" style="background:#f59e0b;">🟡 Menipis</span>'
                    : it.status === 'overstock' ? '<span class="badge" style="background:#3b82f6;">🔵 Overstock</span>'
                    : '<span class="badge" style="background:#10b981;">🟢 Aman</span>';

                const priorityBadge = it.priority === 'Urgent' ? '<span style="color:#ef4444;font-weight:700;">Segera (Urgent)</span>'
                    : it.priority === 'High' ? '<span style="color:#f59e0b;font-weight:600;">Tinggi</span>'
                    : '<span style="color:#6b7280;">Normal</span>';

                html += `
                    <tr>
                        <td class="idx">${idx + 1}</td>
                        <td><strong>${esc(it.name)}</strong></td>
                        <td>${esc(it.category || '—')}</td>
                        <td class="r"><strong>${it.quantity.toLocaleString('en-US')}</strong></td>
                        <td class="r">${it.unitPrice ? fmt(it.unitPrice) : '—'}</td>
                        <td class="r">${it.totalValue ? fmt(it.totalValue) : '—'}</td>
                        <td>${statusBadge}</td>
                        <td class="r" style="${it.reorderRecommendation > 0 ? 'color:#2563eb;font-weight:700;' : ''}">${it.reorderRecommendation > 0 ? '+' + it.reorderRecommendation.toLocaleString('en-US') : '0'}</td>
                        <td>${priorityBadge}</td>
                        <td><span class="badge" style="background:${it.abcClass === 'A' ? '#4f46e5' : it.abcClass === 'B' ? '#0284c7' : '#64748b'};">${it.abcClass}</span></td>
                    </tr>
                `;
            });

            if (!filtered.length) {
                html = `<tr><td colspan="10" style="text-align:center;padding:24px;" class="muted">Tidak ada data stok yang sesuai dengan filter atau pencarian.</td></tr>`;
            }

            tbody.innerHTML = html;
        }

        filterTabs.forEach(btn => {
            btn.onclick = () => {
                filterTabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                displayLimit = 50;
                renderStockRows();
            };
        });

        searchInput.oninput = () => {
            searchQuery = searchInput.value.toLowerCase().trim();
            displayLimit = 50;
            renderStockRows();
        };

        loadMoreBtn.onclick = () => {
            displayLimit += 50;
            renderStockRows();
        };

        renderStockRows();
    }

    function needsSection(sheet) {
        const needs = sheet.needsAnalysis;
        const body = section('needs', '🎯 Analisis Semua Kebutuhan & Rekomendasi Bisnis');
        if (!needs) {
            const emptyCard = el('div', 'card wide');
            emptyCard.innerHTML = '<div class="muted" style="padding:20px;">Analisis kebutuhan memerlukan data stok atau transaksi numerik.</div>';
            body.appendChild(emptyCard);
            return;
        }

        const banner = el('div', 'card wide needs-hero-banner');
        banner.innerHTML = `
            <div class="needs-hero-content">
                <div class="needs-hero-text">
                    <span class="needs-hero-tag">Ringkasan Kebutuhan Pengadaan (Procurement Budget)</span>
                    <h2>Estimasi Anggaran Dibutuhkan: <span class="needs-budget-highlight">${fmt(needs.totalProcurementBudget)}</span></h2>
                    <p class="muted">Mencakup rekomendasi restock untuk <strong>${needs.urgentItemCount} item berstatus kritis/habis</strong> dan <strong>${needs.highPriorityCount} item stok menipis</strong> untuk menjaga kelancaran operasional bisnis.</p>
                </div>
            </div>
        `;
        body.appendChild(banner);

        // Action Plan Cards
        const planCard = el('div', 'card wide');
        planCard.innerHTML = `<h3>📋 Rencana Tindakan Operasional (Action Plan)</h3><div class="needs-action-grid"></div>`;
        const actGrid = planCard.querySelector('.needs-action-grid');
        (needs.actionPlan || []).forEach(act => {
            const borderCol = act.type === 'critical' ? '#ef4444' : act.type === 'warning' ? '#f59e0b' : act.type === 'info' ? '#3b82f6' : '#10b981';
            const icon = act.type === 'critical' ? '🔴' : act.type === 'warning' ? '🟡' : act.type === 'info' ? '🔵' : '🟢';
            const itemEl = el('div', 'needs-action-item');
            itemEl.style.borderLeft = `4px solid ${borderCol}`;
            itemEl.innerHTML = `
                <div class="needs-action-title">${icon} <strong>${esc(act.title)}</strong></div>
                <div class="needs-action-desc muted">${esc(act.description)}</div>
            `;
            actGrid.appendChild(itemEl);
        });
        body.appendChild(planCard);

        // Operational insights & Risk warnings
        const insightsCard = el('div', 'card');
        insightsCard.innerHTML = `<h3>💡 Wawasan Kebutuhan Operasional</h3>`;
        const insUl = el('ul', 'insights');
        (needs.operationalInsights || []).forEach(ins => insUl.appendChild(el('li', '', esc(ins))));
        insightsCard.appendChild(insUl);
        body.appendChild(insightsCard);

        const risksCard = el('div', 'card');
        risksCard.innerHTML = `<h3>⚠️ Mitigasi Risiko Rantai Pasok (Supply Chain Risk)</h3>`;
        const riskUl = el('ul', 'insights');
        (needs.riskWarnings || ['Tidak terdeteksi risiko stok abnormal.']).forEach(r => riskUl.appendChild(el('li', '', esc(r))));
        risksCard.appendChild(riskUl);
        body.appendChild(risksCard);

        // Table of Restock Requirements
        if (needs.procurementItems && needs.procurementItems.length) {
            const reqCard = el('div', 'card wide');
            reqCard.innerHTML = `
                <h3>🛒 Daftar Kebutuhan Pembelian Barang (Purchase Requisition)</h3>
                <div class="tablewrap" style="max-height:300px;overflow-y:auto;margin-top:8px;">
                    <table class="data">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Nama Barang</th>
                                <th>Kategori</th>
                                <th class="r">Stok Saat Ini</th>
                                <th class="r">Kebutuhan Order (Qty)</th>
                                <th class="r">Estimasi Biaya</th>
                                <th>Prioritas Pengadaan</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${needs.procurementItems.slice(0, 30).map((it, idx) => `
                                <tr>
                                    <td class="idx">${idx + 1}</td>
                                    <td><strong>${esc(it.name)}</strong></td>
                                    <td>${esc(it.category || '—')}</td>
                                    <td class="r">${it.currentStock.toLocaleString('en-US')}</td>
                                    <td class="r" style="color:#2563eb;font-weight:700;">+${it.recommendedQty.toLocaleString('en-US')}</td>
                                    <td class="r">${fmt(it.estimatedCost)}</td>
                                    <td><span class="badge" style="background:${it.priority === 'Urgent' ? '#ef4444' : '#f59e0b'};">${it.priority}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            body.appendChild(reqCard);
        }
    }

    function csvHealthSection(sheet) {
        const health = sheet.csvHealth;
        const body = section('csvhealth', '🩺 Analisis Kualitas & Profil File CSV');
        if (!health) return;

        const meterCard = el('div', 'card wide csv-meter-card');
        const scoreCol = health.qualityScore >= 90 ? '#10b981' : health.qualityScore >= 75 ? '#f59e0b' : '#ef4444';
        meterCard.innerHTML = `
            <div class="csv-score-header">
                <div>
                    <span class="muted" style="text-transform:uppercase;letter-spacing:1px;font-size:11px;">Skor Kesehatan & Kebersihan Data</span>
                    <div style="font-size:36px;font-weight:800;color:${scoreCol};line-height:1.2;">
                        ${health.qualityScore}<span style="font-size:20px;font-weight:500;">/100</span>
                        <span class="badge" style="font-size:14px;vertical-align:middle;margin-left:12px;background:${scoreCol};">${health.qualityRating}</span>
                    </div>
                </div>
                <div class="csv-score-pills">
                    <div class="csv-pill">
                        <span class="muted">Kelengkapan</span>
                        <strong>${health.completenessScore}%</strong>
                    </div>
                    <div class="csv-pill">
                        <span class="muted">Integritas Baris</span>
                        <strong>${health.integrityScore}%</strong>
                    </div>
                    <div class="csv-pill">
                        <span class="muted">Konsistensi Tipe</span>
                        <strong>${health.consistencyScore}%</strong>
                    </div>
                </div>
            </div>
            <div class="csv-progress-bar" style="background:rgba(128,128,128,.2);height:8px;border-radius:4px;overflow:hidden;margin-top:14px;">
                <div style="width:${health.qualityScore}%;height:100%;background:${scoreCol};border-radius:4px;transition:width .6s ease;"></div>
            </div>
        `;
        body.appendChild(meterCard);

        // Checklist Table
        const checkCard = el('div', 'card wide');
        checkCard.innerHTML = `
            <h3>✅ Checklist Audit Struktur & Kualitas CSV</h3>
            <div class="tablewrap" style="margin-top:8px;">
                <table class="data">
                    <thead>
                        <tr>
                            <th>Kategori Audit</th>
                            <th>Parameter Pemeriksaan</th>
                            <th>Hasil & Keterangan</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(health.checklist || []).map(ch => {
                            const badge = ch.status === 'pass' ? '<span class="badge" style="background:#10b981;">Lolos (Pass)</span>'
                                : ch.status === 'warn' ? '<span class="badge" style="background:#f59e0b;">Perhatian</span>'
                                : '<span class="badge" style="background:#ef4444;">Perlu Perbaikan</span>';
                            return `
                                <tr>
                                    <td><strong>${esc(ch.category)}</strong></td>
                                    <td>${esc(ch.item)}</td>
                                    <td>${esc(ch.detail)}</td>
                                    <td>${badge}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        body.appendChild(checkCard);

        // Cleaning Recommendations
        const recCard = el('div', 'card wide');
        recCard.innerHTML = `
            <h3>🧹 Rekomendasi Pembersihan & Optimalisasi CSV</h3>
            <ul class="insights" style="margin:6px 0 0;">
                ${(health.cleaningRecommendations || []).map(r => `<li>${esc(r)}</li>`).join('')}
            </ul>
        `;
        body.appendChild(recCard);
    }

    // ── KPI bisnis (dihitung di src/kpi.ts) ─────────────────────────────────
    const KPI_STATUS_COLOR = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444', info: '#4e79a7' };
    const KPI_STATUS_LABEL = { good: 'Sehat', warn: 'Waspada', bad: 'Risiko', info: 'Info' };
    const kpiVal = (v, unit) => (v === null || v === undefined ? '-' : unit === 'pct' ? fmt(v) + '%' : fmt(v));

    function businessKpiSection(sheet) {
        const body = section('businesskpi', '📊 KPI Bisnis & Penjualan');
        const k = sheet.businessKpi;

        if (!k) {
            const emptyCard = el('div', 'card wide');
            emptyCard.innerHTML = '<div class="muted" style="padding:20px;">\u26A0\uFE0F KPI bisnis memerlukan kolom pendapatan (Sales/Omzet/Pendapatan) atau pasangan kolom kuantitas \u00D7 harga. Dataset ini tidak memilikinya.</div>';
            body.appendChild(emptyCard);
            return;
        }

        const det = k.detected || {};
        const revLabel = k.revenueSource === 'quantity*price' ? 'kuantitas \u00D7 harga' : (det.revenue || '-');

        // ---- kartu indikator utama + status ----
        const kpiCard = el('div', 'card wide');
        kpiCard.innerHTML = `<h3>Indikator Utama \u00B7 sumber pendapatan: ${esc(revLabel)}</h3>`;
        const kpis = el('div', 'kpis');
        (k.cards || []).forEach((c) => {
            const col = KPI_STATUS_COLOR[c.status] || KPI_STATUS_COLOR.info;
            const item = el('div', 'kpi');
            item.innerHTML = `<b>${esc(kpiVal(c.value, c.unit))}</b><span>${esc(c.label)}</span>`
                + `<div class="badge" style="display:block;width:max-content;margin-top:6px;background:${col};" title="${esc(c.note || '')}">${esc(KPI_STATUS_LABEL[c.status] || c.status)}</div>`;
            kpis.appendChild(item);
        });
        kpiCard.appendChild(kpis);
        body.appendChild(kpiCard);

        // ---- konteks perhitungan ----
        const pill = (label, value) => `<div class="csv-pill"><span class="muted">${esc(label)}</span><strong>${esc(String(value))}</strong></div>`;
        const growth = k.growth || {};
        const ctxCard = el('div', 'card wide');
        ctxCard.innerHTML = `
            <h3>📌 Konteks Perhitungan</h3>
            <div class="csv-score-pills">
                ${pill('Baris dipakai', fmt(k.rowsUsed))}
                ${pill('Baris dilewati', fmt(k.rowsSkipped))}
                ${pill('Sumber pendapatan', revLabel)}
                ${k.concentration ? pill('Pareto 80%', `${fmt(k.concentration.paretoItems)} ${esc(k.concentration.basis)} (${fmt(k.concentration.paretoPct)}%)`) : ''}
                ${k.concentration ? pill('HHI', fmt(k.concentration.hhi)) : ''}
                ${typeof growth.latestGrowthPct === 'number' ? pill('Pertumbuhan terakhir', fmt(growth.latestGrowthPct) + '%') : ''}
                ${typeof growth.avgGrowthPct === 'number' ? pill('Rata-rata pertumbuhan', fmt(growth.avgGrowthPct) + '%') : ''}
            </div>
        `;
        body.appendChild(ctxCard);

        // ---- kolom yang terdeteksi otomatis ----
        const detRows = [
            ['Pendapatan', det.revenue], ['Biaya (COGS)', det.cost], ['Laba', det.profit], ['Kuantitas', det.quantity],
            ['Harga', det.price], ['Diskon', det.discount], ['Tanggal', det.date], ['Order', det.order],
            ['Pelanggan', det.customer], ['Produk', det.product], ['Kategori', det.category], ['Wilayah', det.region]
        ].filter(([, v]) => v);
        if (detRows.length) {
            const detCard = el('div', 'card wide');
            detCard.innerHTML = `<h3>🔎 Kolom yang Terdeteksi Otomatis</h3>
                <div class="tablewrap"><table class="data">
                    <thead><tr><th>Peran</th><th>Kolom</th></tr></thead>
                    <tbody>${detRows.map(([r, v]) => `<tr><td>${esc(r)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</tbody>
                </table></div>`;
            body.appendChild(detCard);
        }

        // ---- komposisi status KPI ----
        const sc = { good: 0, warn: 0, bad: 0, info: 0 };
        (k.cards || []).forEach((c) => { sc[c.status] = (sc[c.status] || 0) + 1; });
        const stKeys = ['good', 'warn', 'bad', 'info'].filter((x) => sc[x] > 0);
        if (stKeys.length) {
            chart(body, 'Komposisi Status KPI', {
                type: 'doughnut',
                data: { labels: stKeys.map((x) => KPI_STATUS_LABEL[x]), datasets: [{ data: stKeys.map((x) => sc[x]), backgroundColor: stKeys.map((x) => KPI_STATUS_COLOR[x]) }] }
            });
        }

        // ---- tren pendapatan & laba per periode ----
        const pts = growth.periods || [];
        if (pts.length > 1) {
            const hasProfit = pts.some((p) => typeof p.profit === 'number');
            const datasets = [{ label: 'Pendapatan', data: pts.map((p) => p.revenue), borderColor: color(0), backgroundColor: color(0, '33'), fill: true, tension: .3, pointRadius: 2, yAxisID: 'y' }];
            const scales = { y: { position: 'left', title: { display: true, text: 'Pendapatan' } } };
            if (hasProfit) {
                datasets.push({ label: 'Laba kotor', data: pts.map((p) => (typeof p.profit === 'number' ? p.profit : null)), borderColor: color(4), backgroundColor: color(4, '33'), fill: false, tension: .3, pointRadius: 2, yAxisID: 'y1' });
                scales.y1 = { position: 'right', title: { display: true, text: 'Laba kotor' }, grid: { drawOnChartArea: false } };
            }
            chart(body, 'Tren Pendapatan & Laba per Periode', {
                type: 'line',
                data: { labels: pts.map((p) => p.period), datasets },
                options: { interaction: { mode: 'index', intersect: false }, scales }
            }, 300);

            const gpts = pts.filter((p) => typeof p.growthPct === 'number');
            if (gpts.length) {
                chart(body, 'Pertumbuhan Pendapatan antar Periode (%)', {
                    type: 'bar',
                    data: { labels: gpts.map((p) => p.period), datasets: [{ data: gpts.map((p) => p.growthPct), backgroundColor: gpts.map((p) => (p.growthPct >= 0 ? color(4, 'cc') : color(2, 'cc'))) }] },
                    options: barOpts(false)
                });
            }
        }

        // ---- pangsa & peringkat produk ----
        const tp = k.topProducts || [];
        if (tp.length) {
            const shareSum = tp.reduce((a, x) => a + (x.share || 0), 0);
            const rest = Math.max(0, Math.round((100 - shareSum) * 100) / 100);
            const labelsP = tp.map((x) => cut(x.label, 24)).concat(rest > 0 ? ['Produk lainnya'] : []);
            const dataP = tp.map((x) => x.share).concat(rest > 0 ? [rest] : []);
            chart(body, 'Pangsa Pendapatan Produk Teratas', { type: 'doughnut', data: { labels: labelsP, datasets: [{ data: dataP, backgroundColor: labelsP.map((_, i) => color(i)) }] } });
            chart(body, 'Pendapatan Produk Teratas', { type: 'bar', data: { labels: tp.map((x) => cut(x.label, 24)), datasets: [{ label: 'Pendapatan', data: tp.map((x) => x.revenue), backgroundColor: tp.map((_, i) => color(i, 'cc')) }] }, options: barOpts(true) }, 300);
        }

        // ---- kategori, wilayah, pelanggan ----
        const cat = k.topCategories || [], reg = k.topRegions || [], cus = k.topCustomers || [];
        if (cat.length) {
            chart(body, 'Pangsa Pendapatan per Kategori', { type: 'doughnut', data: { labels: cat.map((x) => cut(x.label, 24)), datasets: [{ data: cat.map((x) => x.share), backgroundColor: cat.map((_, i) => color(i)) }] } });
        }
        const rankBar = (items, title) => {
            if (!items.length) { return; }
            chart(body, title, {
                type: 'bar',
                data: { labels: items.map((x) => cut(x.label, 24)), datasets: [{ label: 'Pendapatan', data: items.map((x) => x.revenue), backgroundColor: items.map((_, i) => color(i, 'cc')) }] },
                options: barOpts(true)
            }, 300);
        };
        rankBar(reg, 'Pendapatan per Wilayah');
        rankBar(cus, 'Pendapatan per Pelanggan Teratas');
    }

    /** Bentuk pohon: jumlah simpul, daun, dan kedalaman (dipakai untuk keterangan diagram). */
    function treeShape(node) {
        let nodes = 0, leaves = 0, depth = 0;
        const walk = (n, d) => {
            if (!n) { return; }
            nodes += 1;
            depth = Math.max(depth, d);
            const kids = n.children || [];
            if (n.isLeaf || !kids.length) { leaves += 1; return; }
            kids.forEach((c) => walk(c, d + 1));
        };
        walk(node, 0);
        return { nodes, leaves, depth };
    }

    // ── Kustomisasi diagram pohon C4.5 (opsi disimpan di webview state) ────────
    /** Opsi bawaan diagram pohon. */
    const TREE_DEFAULTS = {
        orient: 'ttb', maxDepth: 0, maxNodes: 220, gapX: 30, gapY: 88, edge: 'curve', size: 'sedang',
        entropy: true, samples: true, percent: false, edgeLabels: true, dist: true, zoom: 1,
    };
    /** Lebar maksimum kotak simpul untuk tiap pilihan ukuran. */
    const TREE_SIZE = { ringkas: 132, sedang: 176, lebar: 240 };

    /** Opsi diagram yang sedang dipakai (bawaan + pilihan pengguna yang tersimpan). */
    function treeView() {
        const st = vscode.getState() || {};
        return Object.assign({}, TREE_DEFAULTS, st.treeView || {});
    }

    /** Simpan perubahan opsi diagram dan kembalikan opsi yang berlaku. */
    function saveTreeView(patch) {
        const next = Object.assign({}, treeView(), patch);
        vscode.setState(Object.assign({}, vscode.getState() || {}, { treeView: next }));
        return next;
    }

    /** Isi satu kotak simpul: judul, sub-baris, dan lebar yang menyesuaikan teks. */
    function treeBox(n, opt, total) {
        const daun = !!n.isLeaf || !(n.children || []).length;
        const judul = String(daun ? (n.label == null ? '—' : n.label) : (n.attribute == null ? '—' : n.attribute));
        const uji = !daun && n.splitType === 'numeric' && n.threshold !== undefined ? `≤ ${n.threshold}` : '';
        const subs = [];
        if (!daun && opt.entropy && typeof n.entropy === 'number') { subs.push(`H = ${n.entropy.toFixed(3)}`); }
        if (opt.samples && n.samples != null) { subs.push(`n = ${fmt(n.samples)}`); }
        if (opt.percent && n.samples != null && total > 0) { subs.push(`${((n.samples / total) * 100).toFixed(1)}%`); }
        const isiJudul = judul + (uji ? ' ' + uji : '');
        const isiSub = subs.join(' · ');
        const perluBar = !!opt.dist && !!n.distribution;
        const w = Math.max(104, Math.min(TREE_SIZE[opt.size] || TREE_SIZE.sedang, Math.max(isiJudul.length * 7.1, isiSub.length * 6.2) + 24));
        const h = 50 + (perluBar ? 7 : 0);
        return { w, h, daun, judul, uji, isiJudul, isiSub, perluBar };
    }

    /**
     * Tata letak pohon yang rapi (tidy): daun diberi urutan rata, simpul induk di tengah anak-anaknya,
     * lebar kotak mengikuti isi teks, dan sub-pohon yang dilipat tidak ikut dihitung.
     */
    function treeLayout(dt, opt, collapsed) {
        const maxDepth = opt.maxDepth > 0 ? opt.maxDepth : 99;
        const total = dt.trainingSize || dt.tree.samples || 1;
        const nodes = [];
        let clipped = 0;
        const walk = (n, d, parent, key) => {
            if (!n || d > maxDepth || nodes.length >= opt.maxNodes) { clipped += 1; return null; }
            const kids = n.children || [];
            const node = { n, d, key, box: treeBox(n, opt, total), kids: [], order: 0, collapsed: collapsed.has(key) && !!kids.length, x: 0, y: 0 };
            nodes.push(node);
            if (parent) { parent.kids.push(node); }
            if (node.collapsed) { clipped += kids.length; return node; }
            kids.forEach((c, i) => walk(c, d + 1, node, key + '/' + i));
            return node;
        };
        const akar = walk(dt.tree, 0, null, '0');
        if (!akar || !nodes.length) { return { nodes: [], width: 0, height: 0, clipped, total }; }

        const slotX = Math.max.apply(null, nodes.map((s) => s.box.w)) + Math.max(10, opt.gapX);
        let urutan = 0;
        const letak = (node) => {
            if (!node.kids.length) { node.order = urutan++; return; }
            node.kids.forEach(letak);
            node.order = (node.kids[0].order + node.kids[node.kids.length - 1].order) / 2;
        };
        letak(akar);

        const baris = Math.max.apply(null, nodes.map((s) => s.d)) + 1;
        const slotY = Math.max(58, opt.gapY);
        const ttb = opt.orient !== 'ltr';
        const tinggiMaks = Math.max.apply(null, nodes.map((s) => s.box.h)) + 16;
        nodes.forEach((s) => {
            if (ttb) {
                s.x = s.order * slotX + slotX / 2;
                s.y = s.d * Math.max(slotY, tinggiMaks) + Math.max(slotY, tinggiMaks) / 2;
            } else {
                s.x = s.d * slotX + slotX / 2;
                s.y = s.order * Math.max(slotY, tinggiMaks) + Math.max(slotY, tinggiMaks) / 2;
            }
        });
        const lebar = ttb ? Math.max(520, urutan * slotX) : baris * slotX + 24;
        const tinggi = ttb ? baris * Math.max(slotY, tinggiMaks) + 24 : Math.max(320, urutan * Math.max(slotY, tinggiMaks)) + 24;
        return { nodes, akar, ttb, clipped, width: lebar, height: tinggi, total };
    }

    /**
     * SVG diagram pohon keputusan C4.5. Geometri mengikuti tata letak rapi, warna mengikuti tema VS Code,
     * dan setiap simpul dapat diklik untuk melipat/membuka sub-pohonnya (rapi untuk pohon besar).
     */
    function treeSvg(dt, opt, collapsed) {
        const L = treeLayout(dt, opt, collapsed);
        if (!L.nodes.length || !L.width) { return { svg: '', clipped: L.clipped, shown: 0, size: { w: 0, h: 0 } }; }
        const kelas = (dt.confusionLabels && dt.confusionLabels.length) ? dt.confusionLabels : Object.keys(dt.classDistribution || {});
        const warnaKelas = (k) => color(Math.max(0, kelas.indexOf(k)), 'cc');
        const tepi = [], kotak = [];

        L.nodes.forEach((s) => {
            s.kids.forEach((c) => {
                let x1, y1, x2, y2, d;
                if (L.ttb) {
                    x1 = s.x; y1 = s.y + s.box.h / 2; x2 = c.x; y2 = c.y - c.box.h / 2;
                    const mid = (y1 + y2) / 2;
                    d = opt.edge === 'ortho' ? `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}` : `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
                } else {
                    x1 = s.x + s.box.w / 2; y1 = s.y; x2 = c.x - c.box.w / 2; y2 = c.y;
                    const mid = (x1 + x2) / 2;
                    d = opt.edge === 'ortho' ? `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}` : `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
                }
                tepi.push(`<path class="te" d="${d}" />`);
                const label = c.n.value === undefined || c.n.value === null ? '' : String(c.n.value);
                if (opt.edgeLabels !== false && label) {
                    const lx = L.ttb ? (x1 + x2) / 2 : (x1 + x2) / 2;
                    const ly = L.ttb ? (y1 + y2) / 2 - 4 : (y1 + y2) / 2 - 3;
                    tepi.push(`<text class="tl" x="${lx}" y="${ly}">${esc(cut(label, 20))}</text>`);
                }
            });
        });

        L.nodes.forEach((s) => {
            const b = s.box;
            const x = s.x - b.w / 2, y = s.y - b.h / 2;
            const barisSub = b.isiSub ? `<text class="ts" x="${s.x}" y="${y + (b.perluBar ? 31 : 34)}">${esc(b.isiSub)}</text>` : '';
            let bar = '';
            if (b.perluBar) {
                const dist = s.n.distribution || {};
                const jumlah = Object.values(dist).reduce((a, v) => a + v, 0) || 1;
                const lebarBar = b.w - 20;
                let acc = 0;
                const segmen = Object.keys(dist).map((k) => {
                    const w = (dist[k] / jumlah) * lebarBar;
                    const r = `<rect x="${x + 10 + acc}" y="${y + b.h - 11}" width="${Math.max(1, w)}" height="6" rx="3" fill="${warnaKelas(k)}" />`;
                    acc += w;
                    return r;
                }).join('');
                const kelasUtama = Object.entries(dist).sort((p, q) => q[1] - p[1])[0];
                bar = `<g class="tdist"><title>${esc(kelasUtama ? `${kelasUtama[0]}: ${fmt(kelasUtama[1])} dari ${fmt(jumlah)}` : '')}</title>${segmen}</g>`;
            }
            const lencana = s.kids.length || !s.collapsed ? '' : '<text class="tbadge" x="' + (x + b.w - 6) + '" y="' + (y + 12) + '">+</text>';
            kotak.push(`<g class="tn ${b.daun ? 'leaf' : 'split'}${s.collapsed ? ' fold' : ''}" data-key="${s.key}" tabindex="0" role="treeitem" aria-label="${esc(b.isiJudul + (b.isiSub ? ' · ' + b.isiSub : ''))}">`
                + `<title>${esc(b.isiJudul + (b.isiSub ? ` · ${b.isiSub}` : '') + (s.kids.length ? ' · klik untuk lipat/buka' : ''))}</title>`
                + `<rect x="${x}" y="${y}" width="${b.w}" height="${b.h}" rx="9" />`
                + `<text class="tt" x="${s.x}" y="${y + 19}">${esc(cut(b.judul, 28))}</text>`
                + (b.uji ? `<text class="tu" x="${s.x}" y="${y + 19}" dx="${Math.min(96, b.judul.length * 3.6 + 8)}">${esc(b.uji)}</text>` : '')
                + barisSub + bar + lencana + '</g>');
        });

        const zoom = Math.max(0.3, Math.min(2.5, opt.zoom || 1));
        const w = Math.round(L.width * zoom), h = Math.round(L.height * zoom);
        return {
            svg: `<div class="treewrap"><svg class="tree" viewBox="0 0 ${L.width} ${L.height}" width="${w}" height="${h}" role="img" aria-label="Diagram pohon keputusan C4.5"><g>${tepi.join('')}</g><g>${kotak.join('')}</g></svg></div>`,
            clipped: L.clipped,
            shown: L.nodes.length,
            size: { w, h }
        };
    }

    function computeDepthProfile(tree) {
        const map = new Map();
        function walk(n, d) {
            if (!n) return;
            if (!map.has(d)) {
                map.set(d, { depth: d, splits: 0, leaves: 0, samples: 0, sumEntropy: 0, countEntropy: 0 });
            }
            const p = map.get(d);
            p.samples += (n.samples || 0);
            if (typeof n.entropy === 'number') {
                p.sumEntropy += n.entropy;
                p.countEntropy++;
            }
            if (n.isLeaf || !n.children || !n.children.length) {
                p.leaves++;
            } else {
                p.splits++;
                n.children.forEach(c => walk(c, d + 1));
            }
        }
        walk(tree, 0);
        return Array.from(map.values()).sort((a, b) => a.depth - b.depth);
    }

    function rulesToPython(rules, targetAttr) {
        const safeTarget = String(targetAttr || 'target').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const lines = [
            `# ==============================================================`,
            `# Model Decision Tree C4.5 — Fungsi Prediksi Python`,
            `# Target Klasifikasi: ${targetAttr}`,
            `# ==============================================================`,
            ``,
            `def predict_${safeTarget}(row):`,
            `    """`,
            `    Memprediksi kelas ${targetAttr} berdasarkan aturan pohon keputusan C4.5.`,
            `    row: dict atau pandas Series dengan atribut sebagai kunci.`,
            `    """`
        ];
        if (!rules || !rules.length) {
            lines.push(`    return "Unknown"`);
            return lines.join('\n');
        }
        rules.forEach((r, i) => {
            if (r.condition === '(akar pohon)') {
                lines.push(`    return "${r.prediction}"  # akar pohon, sampel: ${r.samples}`);
                return;
            }
            const cond = r.condition
                .replace(/\s+AND\s+/gi, ' and ')
                .replace(/=\s*"([^"]*)"/g, '== "$1"')
                .replace(/=\s*([^"\s\)]+)/g, '== "$1"');
            const kw = i === 0 ? 'if' : 'elif';
            lines.push(`    ${kw} ${cond}:`);
            lines.push(`        return "${r.prediction}"  # kemurnian: ${Math.round((r.confidence || 0) * 100)}%, sampel: ${r.samples}`);
        });
        lines.push(`    return "${rules[0].prediction || 'Unknown'}"  # fallback default`);
        return lines.join('\n');
    }

    function rulesToSql(rules, targetAttr) {
        const safeTarget = String(targetAttr || 'target').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const lines = [
            `-- ==============================================================`,
            `-- Model Decision Tree C4.5 — Prediksi Kolom SQL`,
            `-- Target Klasifikasi: ${targetAttr}`,
            `-- ==============================================================`,
            `CASE`
        ];
        if (!rules || !rules.length) {
            lines.push(`    ELSE NULL`);
            lines.push(`END AS predicted_${safeTarget}`);
            return lines.join('\n');
        }
        rules.forEach((r) => {
            if (r.condition === '(akar pohon)') {
                lines.push(`    ELSE '${r.prediction}'`);
            } else {
                const cond = r.condition.replace(/=\s*([^\d"'][^ AND]*)/g, "= '$1'");
                lines.push(`    WHEN ${cond} THEN '${r.prediction}'`);
            }
        });
        if (!rules.some(r => r.condition === '(akar pohon)')) {
            lines.push(`    ELSE '${rules[0].prediction || 'Unknown'}'`);
        }
        lines.push(`END AS predicted_${safeTarget}`);
        return lines.join('\n');
    }

    function decisionTreeSection(sheet) {
        const dt = sheet.decisionTreeAnalysis;
        const body = section('decisionTree', '🌳 Analisis Pohon Keputusan C4.5');

        const persen = (v, d) => (typeof v === 'number' ? fmt(v * 100, d) + '%' : '—');
        const angka = (v, d) => (typeof v === 'number' ? v.toFixed(d === undefined ? 4 : d) : '—');

        // Model pohon dibangun otomatis dari kolom kategorikal paling layak (lihat src/analysis.ts).
        if (!dt) {
            const emptyCard = el('div', 'card wide');
            emptyCard.innerHTML = '<div class="muted" style="padding:16px 20px;line-height:1.6;">ℹ️ Pohon keputusan C4.5 belum terbentuk untuk lembar ini. Model dibangun otomatis dari kolom kategorikal yang paling layak dijadikan target, dan syaratnya minimal 2 kelas berbeda dengan sekurangnya 20 baris data valid. Periksa kolom kategori pada tabel <b>Column Details</b>, atau pakai lembar lain yang memiliki kolom kategori.</div>';
            body.appendChild(emptyCard);
            return;
        }

        const shape = treeShape(dt.tree);
        const perf = dt.performanceMetrics || {};
        const agg = dt.aggregateMetrics || {};
        const base = dt.baseline || {};
        const cv = dt.crossValidation;
        const prun = dt.pruning;
        const tshape = dt.treeShape || {};

        // ── 1. KPI ringkas ───────────────────────────────────────────────────────
        const kpiCard = el('div', 'card wide');
        const kpis = el('div', 'kpis kpis-6');
        [
            ['Target', esc(dt.targetAttribute || '—')],
            ['Akurasi uji', persen(dt.accuracy, 2)],
            [cv ? `Akurasi silang ${cv.folds}×` : 'Akurasi dasar', cv ? `${persen(cv.meanAccuracy, 2)} ± ${fmt(cv.stdAccuracy * 100, 2)}%` : persen(base.noInformationRate, 2)],
            ['F1 makro', persen(agg.macroF1 === undefined ? perf.macroF1 : agg.macroF1, 2)],
            ['Kappa Cohen', angka(agg.kappa, 3)],
            ['Simpul / daun', `${fmt(tshape.nodes === undefined ? shape.nodes : tshape.nodes)} / ${fmt(tshape.leaves === undefined ? shape.leaves : tshape.leaves)}`],
            ['Kedalaman', fmt(tshape.depth === undefined ? shape.depth : tshape.depth)],
            ['Aturan', dt.rules ? fmt(dt.rules.length) : '0'],
            ['Latih / uji', `${fmt(dt.trainingSize)} / ${fmt(dt.testSize)}`],
            ['Ambang numerik', fmt((dt.numericSplits || []).length)],
            ['Pemangkasan', prun ? (prun.applied ? `${fmt(prun.subtreesPruned)}×` : 'tanpa perubahan') : 'nonaktif'],
            ['Seed', dt.config ? String(dt.config.seed) : '—']
        ].forEach(([k, v]) => kpis.appendChild(el('div', 'kpi', `<b>${v}</b><span>${k}</span>`)));
        kpiCard.appendChild(kpis);
        body.appendChild(kpiCard);

        // ── 2. Diagram pohon + kontrol tampilan ──────────────────────────
        const treeCard = el('div', 'card wide');
        treeCard.innerHTML = `<div class="card-head">
                <h3>🌳 Diagram Pohon Keputusan C4.5</h3>
                <button type="button" class="btn" id="dt-share-community" title="Kirim ringkasan hasil C4.5 ke Community Chat">🌐 Bagikan ke Komunitas</button>
            </div>
            <div class="treebar" id="dt-treebar"></div>
            <div id="dt-treehost" class="treehost"></div>
            <div class="muted" id="dt-treenote" style="margin-top:6px;font-size:11.5px;"></div>`;
        body.appendChild(treeCard);
        const treeBar = treeCard.querySelector('#dt-treebar');
        const treeHost = treeCard.querySelector('#dt-treehost');
        const treeNote = treeCard.querySelector('#dt-treenote');
        const treeShareBtn = treeCard.querySelector('#dt-share-community');
        treeShareBtn.addEventListener('click', () => {
            const txt = [
                `📊 Hasil Analisis C4.5 — ${state.fileName} / ${sheet.name}`,
                `🎯 Target: ${dt.targetAttribute || '-'}`,
                `✅ Akurasi: ${((dt.accuracy || 0) * 100).toFixed(2)}%`,
                `📐 F1 Makro: ${(((agg.macroF1 === undefined ? perf.macroF1 : agg.macroF1) || 0) * 100).toFixed(2)}%`,
                `🌲 Pohon: ${tshape.nodes || shape.nodes || 0} simpul, ${tshape.leaves || shape.leaves || 0} daun, kedalaman ${tshape.depth || shape.depth || 0}`,
                `📏 Aturan: ${dt.rules ? dt.rules.length : 0} aturan`,
                `📊 Kappa: ${agg.kappa || 0} | MCC: ${agg.mcc || 0}`,
            ].join('\n');
            vscode.postMessage({ type: 'shareAiToCommunity', text: txt });
            treeShareBtn.textContent = '✅ Terkirim!';
            setTimeout(() => { treeShareBtn.textContent = '🌐 Bagikan ke Komunitas'; }, 2000);
        });
        const dilipat = new Set();
        const tOpt = treeView();

        const kontrolSelect = [
            ['Orientasi', 'orient', [['ttb', 'atas → bawah'], ['ltr', 'kiri → kanan']]],
            ['Gaya tepi', 'edge', [['curve', 'melengkung'], ['ortho', 'siku']]],
            ['Ukuran simpul', 'size', [['ringkas', 'ringkas'], ['sedang', 'sedang'], ['lebar', 'lebar']]]
        ];
        const kontrolRange = [
            ['Kedalaman tampil', 'maxDepth', 0, 12, '0 = seluruh kedalaman pohon'],
            ['Jarak antarsimpul', 'gapX', 6, 120],
            ['Jarak antarlevel', 'gapY', 58, 180],
            ['Batas simpul', 'maxNodes', 40, 400]
        ];
        const kontrolCentang = [['entropy', 'entropy'], ['samples', 'jumlah sampel'], ['percent', 'persen data'], ['dist', 'komposisi kelas'], ['edgeLabels', 'label cabang']];

        function bangunBar() {
            treeBar.innerHTML = kontrolSelect.map(([label, key, opsi]) =>
                `<label class="tctl">${label}<select data-tree="${key}">${opsi.map(([v, t]) => `<option value="${v}"${tOpt[key] === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`
            ).join('') + kontrolRange.map(([label, key, min, max, hint]) =>
                `<label class="tctl" title="${hint || ''}">${label}<input type="range" data-tree="${key}" min="${min}" max="${max}" step="1" value="${tOpt[key]}" aria-label="${label}"><b data-out="${key}">${key === 'maxDepth' && tOpt[key] === 0 ? 'semua' : tOpt[key]}</b></label>`
            ).join('') + kontrolCentang.map(([key, label]) =>
                `<label class="tctl chk"><input type="checkbox" data-tree="${key}"${tOpt[key] !== false ? ' checked' : ''}> ${label}</label>`
            ).join('') + '<span class="tbtns">'
                + '<button type="button" data-tree-act="zoom-out" title="Perkecil">−</button>'
                + '<button type="button" data-tree-act="zoom-in" title="Perbesar">＋</button>'
                + '<button type="button" data-tree-act="fit" title="Sesuaikan lebar panel">⤢ Pas</button>'
                + '<button type="button" data-tree-act="expand" title="Buka semua sub-pohon">Buka semua</button>'
                + '<button type="button" data-tree-act="reset" title="Kembalikan opsi bawaan">⟲ Bawaan</button></span>';
            pasangBar();
        }

        function pasangBar() {
            treeBar.querySelectorAll('[data-tree]').forEach((ctrl) => {
                const key = ctrl.getAttribute('data-tree');
                const jenis = ctrl.tagName === 'SELECT' ? 'change' : (ctrl.type === 'checkbox' ? 'change' : 'input');
                ctrl.addEventListener(jenis, () => {
                    const nilai = ctrl.type === 'checkbox' ? ctrl.checked : (ctrl.type === 'range' ? Number(ctrl.value) : ctrl.value);
                    const out = treeBar.querySelector(`[data-out="${key}"]`);
                    if (out) { out.textContent = nilai === 0 ? 'semua' : nilai; }
                    Object.assign(tOpt, saveTreeView({ [key]: nilai }));
                    gambarPohon();
                });
            });
            treeBar.querySelectorAll('[data-tree-act]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const act = btn.getAttribute('data-tree-act');
                    if (act === 'zoom-in') { Object.assign(tOpt, saveTreeView({ zoom: Math.min(2.5, (tOpt.zoom || 1) + 0.15) })); }
                    else if (act === 'zoom-out') { Object.assign(tOpt, saveTreeView({ zoom: Math.max(0.3, (tOpt.zoom || 1) - 0.15) })); }
                    else if (act === 'fit') {
                        const lebarPanel = treeHost.clientWidth || 900;
                        const L = treeLayout(dt, tOpt, dilipat);
                        Object.assign(tOpt, saveTreeView({ zoom: Math.max(0.3, Math.min(1.6, lebarPanel / Math.max(240, L.width))) }));
                    } else if (act === 'expand') { dilipat.clear(); }
                    else if (act === 'reset') { Object.assign(tOpt, saveTreeView(TREE_DEFAULTS)); bangunBar(); }
                    gambarPohon();
                });
            });
        }

        function gambarPohon() {
            const hasil = treeSvg(dt, tOpt, dilipat);
            treeHost.innerHTML = hasil.svg || '<div class="muted" style="padding:12px;">Diagram tidak dapat digambar untuk struktur pohon ini.</div>';
            const total = tshape.nodes === undefined ? shape.nodes : tshape.nodes;
            treeNote.innerHTML = `Simpul biru = atribut pemisah (H = entropy sebelum split, n = jumlah sampel, bilah warna = komposisi kelas); kotak hijau = daun berisi kelas prediksi; label tepi = nilai atau ambang yang diuji. Menampilkan <b>${fmt(hasil.shown)}</b> dari ${fmt(total)} simpul${tOpt.maxDepth > 0 ? ` (kedalaman ≤ ${tOpt.maxDepth})` : ''} pada skala ${Math.round((tOpt.zoom || 1) * 100)}%.${hasil.clipped ? ` ${fmt(hasil.clipped)} simpul disembunyikan — atur kedalaman/batas simpul atau klik simpul untuk melipatnya.` : ''} Klik simpul untuk melipat/membuka sub-pohonnya.`;
        }

        const toggleSimpul = (key) => { if (!key) { return; } if (dilipat.has(key)) { dilipat.delete(key); } else { dilipat.add(key); } gambarPohon(); };
        treeHost.addEventListener('click', (ev) => {
            const g = ev.target && ev.target.closest ? ev.target.closest('g.tn') : null;
            if (g) { toggleSimpul(g.getAttribute('data-key')); }
        });
        treeHost.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter' && ev.key !== ' ') { return; }
            const g = ev.target && ev.target.closest ? ev.target.closest('g.tn') : null;
            if (g) { ev.preventDefault(); toggleSimpul(g.getAttribute('data-key')); }
        });

        bangunBar();
        gambarPohon();

        // ── Tabel ringkas bergaya sama ─────────────────────────────────────────
        const tabelPohon = (judul, kepala, baris, kepalaKanan) => {
            const card = el('div', 'card wide');
            card.innerHTML = `<h3>${judul}</h3>
                <div class="tablewrap"><table class="data"><thead><tr>${kepala.map((h, i) => `<th${(kepalaKanan === undefined ? i > 0 : kepalaKanan.includes(i)) ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead>
                <tbody>${baris.join('')}</tbody></table></div>`;
            body.appendChild(card);
            return card;
        };
        const barisAngka = (label, nilai, satuan) => `<tr><td>${esc(label)}</td><td class="r"><b>${nilai}</b>${satuan ? ' ' + satuan : ''}</td></tr>`;

        // ── 3. Profil Kedalaman & Kompleksitas per Level ────────────────────────
        const depthProf = computeDepthProfile(dt.tree);
        if (depthProf.length) {
            const barisLevel = depthProf.map((p) => {
                const avgH = p.countEntropy ? (p.sumEntropy / p.countEntropy) : 0;
                return `<tr>
                    <td>Level ${p.depth === 0 ? '0 (Akar)' : p.depth}</td>
                    <td class="r"><b>${p.splits}</b></td>
                    <td class="r"><b>${p.leaves}</b></td>
                    <td class="r">${fmt(p.samples)}</td>
                    <td class="r">${angka(avgH, 4)}</td>
                </tr>`;
            });
            const card = tabelPohon(`📈 Profil Kedalaman &amp; Kompleksitas per Level (${depthProf.length} Level)`, ['Kedalaman', 'Simpul Pemisah (Splits)', 'Daun Terbentuk', 'Total Sampel', 'Rata-rata Entropi'], barisLevel);
            card.innerHTML += `<div class="muted" style="margin-top:8px;font-size:12px;">Profil memperlihatkan bagaimana data terbagi di tiap tingkatan pohon. Level dengan daun terbanyak adalah tempat di mana aturan klasifikasi paling banyak tuntas.</div>`;

            chart(body, 'Distribusi Simpul vs Daun per Kedalaman', {
                type: 'bar',
                data: {
                    labels: depthProf.map((p) => 'Level ' + p.depth),
                    datasets: [
                        { label: 'Simpul Pemisah', data: depthProf.map((p) => p.splits), backgroundColor: color(0, 'cc') },
                        { label: 'Daun Terbentuk', data: depthProf.map((p) => p.leaves), backgroundColor: color(4, 'cc') }
                    ]
                },
                options: Object.assign(barOpts(false), { plugins: { legend: { position: 'bottom' } } })
            });
        }

        // ── 4. Metrik Topologi & Keseimbangan Pohon ─────────────────────────────
        const leavesTotal = tshape.leaves || shape.leaves || 1;
        const nodesTotal = tshape.nodes || shape.nodes || 1;
        const splitsTotal = tshape.internalNodes || shape.internalNodes || 1;
        const avgBranching = (nodesTotal - 1) / splitsTotal;
        const balanceRatio = tshape.minLeafSamples && tshape.maxLeafSamples ? (tshape.minLeafSamples / tshape.maxLeafSamples) : 0;

        const topoCard = el('div', 'card wide');
        topoCard.innerHTML = `<h3>🌿 Metrik Topologi &amp; Keseimbangan Pohon</h3>
            <div class="kpis">
                <div class="kpi"><b>${angka(avgBranching, 2)}</b><span>Faktor Percabangan Rata-rata</span></div>
                <div class="kpi"><b>${angka(tshape.avgRuleLength || shape.depth / 2, 2)}</b><span>Panjang Jalur Rata-rata</span></div>
                <div class="kpi"><b>${persen(leavesTotal / nodesTotal, 1)}</b><span>Rasio Daun / Simpul</span></div>
                <div class="kpi"><b>${persen(balanceRatio, 1)}</b><span>Rasio Keseimbangan Sampel</span></div>
            </div>
            <div class="muted" style="margin-top:8px;font-size:12px;">Pohon dengan rasio daun tinggi (&gt; 50%) memiliki efisiensi pemisahan yang padat dan minim percabangan yang tidak produktif.</div>
        `;
        body.appendChild(topoCard);

        // ── 5. Diagnostik & Rekomendasi Optimasi Model (Smart Advisor) ─────────
        const advisorItems = [];
        const trainAccEst = 1 - (tshape.leavesWithError ? (tshape.leavesWithError / leavesTotal) : 0);
        const testAcc = dt.accuracy || 0;
        if (trainAccEst - testAcc > 0.15) {
            advisorItems.push({
                cls: 'warn',
                icon: '⚠️',
                title: 'Potensi Overfitting Terdeteksi',
                desc: `Akurasi uji (${persen(testAcc, 1)}) tertinggal cukup jauh dari kemurnian data latih (~${persen(trainAccEst, 1)}). Pohon dibangun otomatis dari data yang ada, sehingga selisih sebesar ini biasanya berarti data latih perlu ditambah atau kolom targetnya perlu lebih tegas; bandingkan juga sebaran akurasi pada tabel validasi silang di bawah.`
            });
        } else {
            advisorItems.push({
                cls: 'ok',
                icon: '✅',
                title: 'Generalisasi Model Stabil',
                desc: `Akurasi uji (${persen(testAcc, 1)}) berimbang dengan data latih, menandakan model C4.5 mampu menggeneralisasi data baru dengan baik.`
            });
        }
        if (tshape.minLeafSamples === 1) {
            advisorItems.push({
                cls: 'warn',
                icon: '🍂',
                title: 'Terdapat Daun Bersampel Tunggal (1 Sampel)',
                desc: 'Ada daun yang hanya menampung 1 baris data latih, pertanda pohon terlalu mengikuti derau/outlier. Tambahkan baris data atau gabungkan kelas yang jarang muncul agar tidak ada daun yang bertumpu pada satu sampel.'
            });
        }
        if (typeof base.noInformationRate === 'number') {
            if (dt.accuracy <= base.noInformationRate) {
                advisorItems.push({
                    cls: 'err',
                    icon: '❌',
                    title: 'Akurasi Belum Melampaui Baseline',
                    desc: `Akurasi model (${persen(dt.accuracy, 1)}) masih di bawah tebakan kelas mayoritas "${base.majorityClass}" (${persen(base.noInformationRate, 1)}). Coba tambahkan fitur prediktor lain atau periksa kembali kejelasan target.`
                });
            } else {
                advisorItems.push({
                    cls: 'ok',
                    icon: '🎯',
                    title: 'Mengungguli Akurasi Dasar',
                    desc: `Model unggul ${fmt((dt.accuracy - base.noInformationRate) * 100, 1)} poin persentase di atas tebakan acak kelas mayoritas "${base.majorityClass}" (${persen(base.noInformationRate, 1)}).`
                });
            }
        }
        const usedPreds = (dt.attributeUsage || []).map((u) => u.attribute);
        const unusedPreds = (dt.predictiveAttributes || []).filter((a) => !usedPreds.includes(a));
        if (unusedPreds.length) {
            advisorItems.push({
                cls: 'warn',
                icon: '🧩',
                title: `${unusedPreds.length} Atribut Tidak Terpakai`,
                desc: `Atribut [${unusedPreds.slice(0, 4).join(', ')}${unusedPreds.length > 4 ? '…' : ''}] dimasukkan tetapi tidak pernah dipilih sebagai simpul pemisah karena gain ratio rendah.`
            });
        }

        const advisorCard = el('div', 'card wide dt-advisor-card');
        advisorCard.innerHTML = `<h3>💡 Diagnostik &amp; Rekomendasi Optimasi Model C4.5</h3>
            ${advisorItems.map((item) => `
                <div class="dt-advisor-item ${item.cls}">
                    <span style="font-size:16px;">${item.icon}</span>
                    <div>
                        <b style="font-size:12px;">${esc(item.title)}</b>
                        <div style="font-size:11.5px;opacity:.85;margin-top:2px;">${esc(item.desc)}</div>
                    </div>
                </div>
            `).join('')}
        `;
        body.appendChild(advisorCard);

        // ── 6. Ringkasan struktur pohon & pemangkasan ───────────────────────────
        if (tshape.nodes) {
            const barisStruktur = [
                barisAngka('Jumlah simpul', fmt(tshape.nodes)),
                barisAngka('Simpul pemisah (internal)', fmt(tshape.internalNodes)),
                barisAngka('Daun (aturan)', fmt(tshape.leaves)),
                barisAngka('Kedalaman pohon', fmt(tshape.depth)),
                barisAngka('Rata-rata sampel per daun', fmt(tshape.avgLeafSamples)),
                barisAngka('Daun terkecil / terbesar', `${fmt(tshape.minLeafSamples)} / ${fmt(tshape.maxLeafSamples)}`),
                barisAngka('Panjang aturan rata-rata', fmt(tshape.avgRuleLength), 'kondisi'),
                barisAngka('Kemurnian daun rata-rata', persen(tshape.leafPurityAvg, 2)),
                barisAngka('Daun belum murni (ada salah klasifikasi latih)', fmt(tshape.leavesWithError)),
                barisAngka('Atribut prediktor dipakai', fmt((dt.predictiveAttributes || []).length)),
            ];
            if (prun) {
                barisStruktur.push(
                    barisAngka('Pemangkasan reduced-error', prun.applied ? `${fmt(prun.subtreesPruned)} subtree dipangkas` : 'dijalankan, tanpa perubahan'),
                    barisAngka('Simpul sebelum → sesudah', `${fmt(prun.nodesBefore)} → ${fmt(prun.nodesAfter)}`),
                    barisAngka('Daun sebelum → sesudah', `${fmt(prun.leavesBefore)} → ${fmt(prun.leavesAfter)}`),
                    barisAngka('Akurasi validasi sebelum → sesudah', `${persen(prun.accuracyValidationBefore, 2)} → ${persen(prun.accuracyValidationAfter, 2)} (${fmt(prun.validationSize)} baris validasi)`),
                );
            }
            const card = tabelPohon('🌿 Struktur Pohon &amp; Pemangkasan', ['Ukuran', 'Nilai'], barisStruktur);
            card.innerHTML += `<div class="muted" style="margin-top:8px;font-size:12px;">${prun
                ? 'Pemangkasan reduced-error memangkas cabang bila daun pengganti lebih akurat pada data validasi sehingga pohon tidak melebar mengikuti derau.'
                : 'Pemangkasan sedang nonaktif sehingga pohon tumbuh maksimal mengikuti batas kedalaman.'} Kedalaman maksimum aktif: ${dt.config ? fmt(dt.config.maxDepth) : '—'}; minimal sampel daun: ${dt.config ? fmt(dt.config.minSamplesLeaf) : '—'}.</div>`;
        }

        // ── 7. Perbandingan kinerja model vs akurasi dasar ──────────────────────
        const kinerja = [];
        if (typeof dt.accuracy === 'number') { kinerja.push(['Akurasi data uji', dt.accuracy]); }
        if (typeof agg.macroF1 === 'number') { kinerja.push(['F1 makro', agg.macroF1]); }
        if (typeof agg.weightedF1 === 'number') { kinerja.push(['F1 tertimbang', agg.weightedF1]); }
        if (cv) { kinerja.push([`Akurasi silang (${cv.folds} lipatan)`, cv.meanAccuracy]); }
        if (typeof base.noInformationRate === 'number') { kinerja.push([`Akurasi dasar (kelas mayoritas)`, base.noInformationRate]); }
        if (kinerja.length) {
            const naik = typeof base.noInformationRate === 'number' ? (dt.accuracy - base.noInformationRate) * 100 : null;
            const kinerjaCard = chart(body, 'Perbandingan Kinerja Model (%)', {
                type: 'bar',
                data: {
                    labels: kinerja.map((x) => x[0]),
                    datasets: [{ label: 'Skor (%)', data: kinerja.map((x) => Math.round(x[1] * 10000) / 100), backgroundColor: kinerja.map((x, i) => color(i, 'cc')) }],
                },
                options: Object.assign(barOpts(false), { scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Persen' } } } }),
            });
            // Catatan ditaruh di dalam kartu grafiknya: sebelumnya ia jadi blok teks liar di grid.
            const catatan = el('div', 'muted');
            catatan.style.cssText = 'font-size:12px;margin:0;';
            catatan.innerHTML = `Kappa Cohen ${angka(agg.kappa, 3)} dan MCC ${angka(agg.mcc, 3)} mengukur kesesuaian setelah memperhitungkan kebetulan. `
                + `Entropi target ${angka(base.entropyBits, 4)} bit dari maksimum ${angka(base.maxEntropyBits, 4)} bit; kelas mayoritas "${esc(base.majorityClass || '—')}".`
                + (naik === null ? '' : naik >= 0 ? ` Model berada ${fmt(naik, 2)} poin di atas akurasi dasar.` : ` ⚠️ Model berada ${fmt(-naik, 2)} poin di bawah akurasi dasar.`);
            kinerjaCard.appendChild(catatan);
        }

        // ── 8. Metrik per kelas ─────────────────────────────────────────────────
        const pcm = (dt.perClassMetrics || []).filter((c) => c && typeof c.f1 === 'number');
        if (pcm.length) {
            const tampil = pcm.slice().sort((a, b) => b.support - a.support).slice(0, 14);
            const barisKelas = tampil.map((c) => `<tr><td><strong>${esc(cut(c.label, 22))}</strong></td>
                <td class="r">${fmt(c.support)}</td><td class="r">${fmt(c.predicted)}</td><td class="r">${fmt(c.tp)}</td><td class="r">${fmt(c.fp)}</td><td class="r">${fmt(c.fn)}</td>
                <td class="r">${persen(c.precision, 1)}</td><td class="r">${persen(c.recall, 1)}</td><td class="r"><b>${persen(c.f1, 1)}</b></td><td class="r">${persen(c.specificity, 1)}</td></tr>`);
            const card = tabelPohon(`🎯 Metrik per Kelas (${pcm.length} kelas${pcm.length > tampil.length ? `, ${tampil.length} terbesar ditampilkan` : ''})`, ['Kelas', 'Support', 'Diprediksi', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1', 'Specificity'], barisKelas);
            card.innerHTML += '<div class="muted" style="margin-top:8px;font-size:12px;">Support = jumlah baris uji; TP/FP/FN dihitung one-vs-rest. Kelas dengan F1 terendah paling rentan tertukar.</div>';
            const terurut = pcm.slice().sort((a, b) => b.f1 - a.f1).slice(0, 12);
            chart(body, 'Precision, Recall, dan F1 per Kelas (%)', {
                type: 'bar',
                data: {
                    labels: terurut.map((c) => cut(c.label, 18)),
                    datasets: [
                        { label: 'Precision', data: terurut.map((c) => Math.round(c.precision * 10000) / 100), backgroundColor: color(0, 'cc') },
                        { label: 'Recall', data: terurut.map((c) => Math.round(c.recall * 10000) / 100), backgroundColor: color(1, 'cc') },
                        { label: 'F1', data: terurut.map((c) => Math.round(c.f1 * 10000) / 100), backgroundColor: color(4, 'cc') },
                    ],
                },
                options: Object.assign(barOpts(false), { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, max: 100 } } }),
            });
        }

        // ── 9. Validasi silang k-fold ──────────────────────────────────────────
        if (cv && cv.foldDetails && cv.foldDetails.length) {
            const barisCv = cv.foldDetails.map((f) => `<tr><td>Lipatan ${fmt(f.fold)}</td><td class="r">${fmt(f.trainSize)}</td><td class="r">${fmt(f.testSize)}</td>
                <td class="r"><b>${persen(f.accuracy, 2)}</b></td><td class="r">${persen(f.macroF1, 2)}</td><td>${esc(cut(f.rootAttribute, 24))}</td><td class="r">${fmt(f.leaves)}</td><td class="r">${fmt(f.depth)}</td></tr>`);
            const card = tabelPohon(`🔁 Validasi Silang ${cv.folds}-Lipatan Bertingkat`, ['Lipatan', 'Latih', 'Uji', 'Akurasi', 'F1 makro', 'Atribut akar', 'Daun', 'Kedalaman'], barisCv);
            card.innerHTML += `<div class="muted" style="margin-top:8px;font-size:12px;">Akurasi rata-rata <b>${persen(cv.meanAccuracy, 2)}</b> dengan simpangan baku ${fmt(cv.stdAccuracy * 100, 2)}% (terendah ${persen(cv.minAccuracy, 2)}, tertinggi ${persen(cv.maxAccuracy, 2)}); F1 makro rata-rata ${persen(cv.meanMacroF1, 2)}; rata-rata ${fmt(cv.meanLeaves, 1)} daun dan kedalaman ${fmt(cv.meanDepth, 1)}. Seed ${fmt(cv.seed)}.</div>`;
            const stabilitas = (cv.rootStability || []).map((r) => `<tr><td>${esc(cut(r.attribute, 24))}</td><td class="r">${fmt(r.count)}×</td><td class="r">${persen(r.share, 0)}</td></tr>`);
            if (stabilitas.length) {
                card.innerHTML += `<h4 style="margin:10px 0 4px;font-size:12px;">Stabilitas atribut akar</h4><div class="tablewrap"><table class="data"><thead><tr><th>Atribut akar</th><th class="r">Muncul</th><th class="r">Porsi</th></tr></thead><tbody>${stabilitas.join('')}</tbody></table></div>`;
            }
            chart(body, 'Akurasi per Lipatan Validasi Silang (%)', {
                type: 'line',
                data: {
                    labels: cv.foldDetails.map((f) => 'Lipatan ' + f.fold),
                    datasets: [
                        { label: 'Akurasi lipatan', data: cv.foldDetails.map((f) => Math.round(f.accuracy * 10000) / 100), borderColor: color(0), backgroundColor: color(0, '33'), fill: true, tension: 0.25, pointRadius: 4 },
                        { label: 'Rata-rata', data: cv.foldDetails.map(() => Math.round(cv.meanAccuracy * 10000) / 100), borderColor: color(2), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
                    ],
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Akurasi (%)' } } } },
            });
        }

        // ── 10. Ambang numerik yang dipakai pohon ───────────────────────────────
        const ns = dt.numericSplits || [];
        if (ns.length) {
            const barisNs = ns.slice(0, 20).map((s) => `<tr><td>${esc(cut(s.attribute, 24))}</td><td class="r"><b>≤ ${fmt(s.threshold)}</b></td><td class="r">${angka(s.gainRatio, 4)}</td>
                <td class="r">${fmt(s.leftSamples)} / ${fmt(s.rightSamples)}</td><td class="r">${fmt(s.depth)}</td></tr>`);
            const card = tabelPohon(`📐 Ambang Numerik (split biner, ${ns.length} simpul${ns.length > 20 ? ', 20 pertama' : ''})`, ['Atribut', 'Ambang', 'Gain Ratio', 'Sampel ≤ / >', 'Kedalaman'], barisNs);
            card.innerHTML += '<div class="muted" style="margin-top:8px;font-size:12px;">C4.5 memisahkan atribut numerik menjadi dua cabang pada ambang optimal (≤ ambang dan &gt; ambang) berdasarkan Gain Ratio tertinggi.</div>';
        }

        // ── 11. Penggunaan atribut dalam pohon ──────────────────────────────────
        const pakai = dt.attributeUsage || [];
        if (pakai.length) {
            const barisPakai = pakai.map((u) => `<tr><td>${u.isRoot ? '🌱 ' : ''}${esc(cut(u.attribute, 24))}</td><td>${u.type === 'numeric' ? 'numerik' : 'kategorikal'}</td>
                <td class="r"><b>${fmt(u.nodes)}</b></td><td class="r">${fmt(u.depthFirstUsed)}</td><td class="r">${fmt(u.uniqueValues)}</td></tr>`);
            const card = tabelPohon(`🧩 Penggunaan Atribut dalam Pohon (${pakai.length} dari ${(dt.predictiveAttributes || []).length} prediktor)`, ['Atribut', 'Tipe', 'Jumlah simpul', 'Kedalaman pertama', 'Nilai unik'], barisPakai, [2, 3, 4]);
            card.innerHTML += `<div class="muted" style="margin-top:8px;font-size:12px;">🌱 menandai atribut akar pohon (Gain Ratio tertinggi pertama).</div>`;
            chart(body, 'Jumlah Simpul per Atribut', {
                type: 'bar',
                data: { labels: pakai.slice(0, 12).map((u) => cut(u.attribute, 20)), datasets: [{ label: 'Simpul', data: pakai.slice(0, 12).map((u) => u.nodes), backgroundColor: pakai.slice(0, 12).map((u, i) => color(i, 'cc')) }] },
                options: barOpts(true),
            });
        }

        // ── 12. Pasangan salah klasifikasi terbanyak ────────────────────────────
        const salah = dt.misclassified || [];
        if (salah.length && (dt.confusionMatrix || []).length) {
            const barisSalah = salah.map((m) => `<tr><td>${esc(cut(m.actual, 22))}</td><td>${esc(cut(m.predicted, 22))}</td><td class="r"><b>${fmt(m.count)}</b></td><td class="r">${persen(m.share, 1)}</td></tr>`);
            const card = tabelPohon(`❌ Pasangan Salah Klasifikasi Terbanyak (${salah.length} pasangan)`, ['Aktual', 'Diprediksi sebagai', 'Jumlah', 'Porsi kesalahan'], barisSalah, [2, 3]);
            card.innerHTML += '<div class="muted" style="margin-top:8px;font-size:12px;">Pasangan aktual vs prediksi yang paling sering keliru pada data uji.</div>';
        }

        // ── 13. Split Metrics: kriteria pemilihan atribut ────────────────────────
        const sm = (dt.splitMetrics || []).filter((m) => m && typeof m.gainRatio === 'number').slice(0, 10);
        if (sm.length) {
            chart(body, 'Pemilihan Atribut C4.5: Gain Ratio vs Information Gain', {
                type: 'bar',
                data: {
                    labels: sm.map((m) => cut(m.attribute, 20)),
                    datasets: [
                        { label: 'Information Gain', data: sm.map((m) => Math.round(m.informationGain * 10000) / 10000), backgroundColor: color(0, 'cc'), borderRadius: 4 },
                        { type: 'line', label: 'Gain Ratio (dipakai C4.5)', data: sm.map((m) => Math.round(m.gainRatio * 10000) / 10000), borderColor: color(2), backgroundColor: color(2), tension: 0.3, pointRadius: 4 },
                        { type: 'line', label: 'Split Information', data: sm.map((m) => Math.round(m.splitInfo * 10000) / 10000), borderColor: color(4), borderDash: [5, 4], pointRadius: 0, tension: 0.3 },
                    ],
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Nilai' } } } },
            });
        }

        // Feature Importance
        const fi = (dt.featureImportance || []).filter((f) => f && typeof f.importance === 'number');
        if (fi.length) {
            const top = fi.slice().sort((a, b) => b.importance - a.importance).slice(0, 10);
            const vals = top.map((f) => Math.round(f.importance * 10000) / 100);
            const maxV = Math.max.apply(null, vals.concat([0]));
            chart(body, 'Feature Importance (Information Gain, %)', {
                type: 'bar',
                data: {
                    labels: top.map((f) => cut(f.feature, 22)),
                    datasets: [{ label: 'Kontribusi (%)', data: vals, backgroundColor: top.map((_, i) => color(i, 'cc')) }]
                },
                options: Object.assign(barOpts(true), { scales: { x: { beginAtZero: true, suggestedMax: maxV > 0 ? Math.round(maxV * 1.1 * 100) / 100 : 1 } } })
            });
        }

        // Performance metrics
        if (dt.performanceMetrics) {
            const pItems = [['Precision', perf.precision], ['Recall', perf.recall], ['F1-Score', perf.f1Score], ['Specificity', perf.specificity]];
            chart(body, 'Performance Metrics (%)', {
                type: 'bar',
                data: {
                    labels: pItems.map((x) => x[0]),
                    datasets: [{ label: 'Skor (%)', data: pItems.map((x) => Math.round(((x[1] || 0) * 100) * 100) / 100), backgroundColor: [color(0, 'cc'), color(1, 'cc'), color(4, 'cc'), color(3, 'cc')] }]
                },
                options: Object.assign(barOpts(false), { scales: { y: { beginAtZero: true, max: 100 } } })
            });
        }

        // Distribusi target
        const cd = dt.classDistribution || {};
        const cdKeys = Object.keys(cd);
        if (cdKeys.length) {
            const title = `Distribusi Kelas Target \u201C${cut(dt.targetAttribute || '', 20)}\u201D`;
            if (cdKeys.length <= 8) {
                chart(body, title, { type: 'doughnut', data: { labels: cdKeys.map((c) => cut(c, 24)), datasets: [{ data: cdKeys.map((c) => cd[c]), backgroundColor: PALETTE }] } });
            } else {
                chart(body, title, { type: 'bar', data: { labels: cdKeys.map((c) => cut(c, 24)), datasets: [{ data: cdKeys.map((c) => cd[c]), backgroundColor: cdKeys.map((_, i) => color(i, 'cc')) }] }, options: barOpts(true) });
            }
        }

        // Confusion matrix
        const cm = dt.confusionMatrix || [];
        if (cm.length) {
            let labels = cdKeys.slice().sort();
            if (labels.length !== cm.length) { labels = cm.map((_, i) => labels[i] || ('Class ' + (i + 1))); }
            const rowTotals = cm.map((r) => r.reduce((a, b) => a + b, 0));
            const colTotals = cm.map((_, j) => cm.reduce((a, r) => a + (r[j] || 0), 0));
            chart(body, 'Aktual vs Prediksi per Kelas', {
                type: 'bar',
                data: {
                    labels: labels.map((l) => cut(l, 20)),
                    datasets: [
                        { label: 'Aktual', data: rowTotals, backgroundColor: color(0, 'cc') },
                        { label: 'Prediksi', data: colTotals, backgroundColor: color(1, 'cc') }
                    ]
                },
                options: { plugins: { legend: { display: true } } }
            });

            const flat = cm.reduce((a, r) => a.concat(r), []);
            const maxCell = Math.max.apply(null, [1].concat(flat));
            const head = `<tr><th>Aktual \\ Prediksi</th>${labels.map((l) => `<th class="r">${esc(cut(l, 18))}</th>`).join('')}<th class="r">Total</th></tr>`;
            const bodyRows = cm.map((row, i) => `<tr><td><strong>${esc(cut(labels[i], 18))}</strong></td>${row.map((v, j) => {
                const t = v / maxCell;
                const bg = v === 0 ? 'transparent' : i === j ? `rgba(16,185,129,${(0.15 + 0.6 * t).toFixed(2)})` : `rgba(239,68,68,${(0.15 + 0.6 * t).toFixed(2)})`;
                return `<td class="r" style="background:${bg};">${fmt(v)}</td>`;
            }).join('')}<td class="r"><strong>${fmt(rowTotals[i])}</strong></td></tr>`).join('');
            const matrixCard = el('div', 'card wide');
            matrixCard.innerHTML = `<h3>🔢 Confusion Matrix (test set: ${fmt(dt.testSize)} baris)</h3>
                <div class="tablewrap"><table class="data"><thead>${head}</thead><tbody>${bodyRows}</tbody></table></div>
                <div class="muted" style="margin-top:8px;font-size:12px;">Sel hijau = prediksi benar, sel merah = prediksi salah. Akurasi keseluruhan ${fmt(dt.accuracy * 100)}%.</div>`;
            body.appendChild(matrixCard);
        }

        // ── 14. Aturan keputusan (Searchable Table) ──────────────────────────────
        const aturan = (dt.ruleDetails && dt.ruleDetails.length)
            ? dt.ruleDetails.map((r) => ({ condition: r.condition, prediction: r.prediction, samples: r.samples, confidence: r.confidence, error: r.error, coverage: r.coverage }))
            : (dt.rules || []).map((raw) => {
                const txt = String(raw);
                const m = /^IF\s+(.*?)\s+THEN\s+Class\s*=\s*(.*?)\s*\((\d+)\s+samples?\)\s*$/.exec(txt);
                if (m) { return { condition: m[1], prediction: m[2], samples: Number(m[3]) }; }
                const m2 = /^Class\s*=\s*(.*?)\s*\((\d+)\s+samples?\)\s*$/.exec(txt);
                if (m2) { return { condition: '(akar pohon)', prediction: m2[1], samples: Number(m2[2]) }; }
                return { condition: txt, prediction: '—', samples: null };
            });
        if (aturan.length) {
            const rulesCard = el('div', 'card wide');
            rulesCard.innerHTML = `<h3>📋 Aturan Keputusan (${fmt(aturan.length)} aturan)</h3>
                <div class="treebar">
                    <label class="tctl">Cari aturan<input type="search" id="dt-rule-q" placeholder="nama kelas atau atribut…" /></label>
                    <label class="tctl chk"><input type="checkbox" id="dt-rule-all" /> tampilkan semua aturan</label>
                    <span class="muted" id="dt-rule-info"></span>
                </div>
                <div class="tablewrap" style="max-height:380px;overflow-y:auto;">
                    <table class="data">
                        <thead><tr><th class="r">#</th><th>Kondisi (IF)</th><th>Kelas (THEN)</th><th class="r">Sampel</th><th class="r">Kemurnian</th><th class="r">Error</th><th class="r">Cakupan</th></tr></thead>
                        <tbody id="dt-rule-body"></tbody>
                    </table>
                </div>
                <div class="muted" style="margin-top:8px;font-size:12px;">Kemurnian = porsi kelas mayoritas pada daun (makin dekat 100% makin tegas aturannya); error = 1 − kemurnian; cakupan = porsi data latih yang jatuh ke aturan ini.</div>`;
            body.appendChild(rulesCard);
            const badanAturan = rulesCard.querySelector('#dt-rule-body');
            const cariAturan = rulesCard.querySelector('#dt-rule-q');
            const semuaAturan = rulesCard.querySelector('#dt-rule-all');
            const infoAturan = rulesCard.querySelector('#dt-rule-info');
            const gambarAturan = () => {
                const q = String(cariAturan.value || '').trim().toLowerCase();
                const cocok = q ? aturan.filter((r) => `${r.condition} ${r.prediction}`.toLowerCase().includes(q)) : aturan;
                const batas = semuaAturan.checked ? cocok.length : Math.min(25, cocok.length);
                const isi = cocok.slice(0, batas).map((r, i) => `<tr><td class="r">${fmt(i + 1)}</td><td>${esc(r.condition)}</td><td><strong>${esc(r.prediction)}</strong></td>
                    <td class="r">${r.samples === null || r.samples === undefined ? '—' : fmt(r.samples)}</td>
                    <td class="r">${typeof r.confidence === 'number' ? persen(r.confidence, 1) : '—'}</td>
                    <td class="r">${typeof r.error === 'number' ? persen(r.error, 1) : '—'}</td>
                    <td class="r">${typeof r.coverage === 'number' ? persen(r.coverage, 1) : '—'}</td></tr>`);
                badanAturan.innerHTML = isi.length ? isi.join('') : '<tr><td colspan="7" class="muted">Tidak ada aturan yang cocok dengan pencarian.</td></tr>';
                infoAturan.textContent = `${fmt(cocok.length)} cocok · menampilkan ${fmt(isi.length)}`;
            };
            cariAturan.addEventListener('input', gambarAturan);
            semuaAturan.addEventListener('change', gambarAturan);
            gambarAturan();

            // ── 15. Generator Kode Aturan (Python, SQL CASE, JSON) ──────────────────
            const codeCard = el('div', 'card wide');
            codeCard.innerHTML = `
                <h3>💻 Ekspor Kode Logika Pohon Keputusan</h3>
                <div style="display:flex;gap:6px;margin:8px 0;">
                    <button type="button" class="tab active" id="dt-tab-py">Python</button>
                    <button type="button" class="tab" id="dt-tab-sql">SQL CASE</button>
                    <button type="button" class="tab" id="dt-tab-json">JSON Aturan</button>
                </div>
                <div class="dt-code-box">
                    <button type="button" class="btn dt-code-copy-btn" id="dt-copy-code-btn">📋 Salin Kode</button>
                    <pre><code id="dt-code-display"></code></pre>
                </div>
            `;
            body.appendChild(codeCard);

            const tabPy = codeCard.querySelector('#dt-tab-py');
            const tabSql = codeCard.querySelector('#dt-tab-sql');
            const tabJson = codeCard.querySelector('#dt-tab-json');
            const codeDisplay = codeCard.querySelector('#dt-code-display');
            const copyCodeBtn = codeCard.querySelector('#dt-copy-code-btn');

            let activeCodeMode = 'py';
            const perbaruiKode = () => {
                tabPy.classList.toggle('active', activeCodeMode === 'py');
                tabSql.classList.toggle('active', activeCodeMode === 'sql');
                tabJson.classList.toggle('active', activeCodeMode === 'json');
                if (activeCodeMode === 'py') {
                    codeDisplay.textContent = rulesToPython(aturan, dt.targetAttribute);
                } else if (activeCodeMode === 'sql') {
                    codeDisplay.textContent = rulesToSql(aturan, dt.targetAttribute);
                } else {
                    codeDisplay.textContent = JSON.stringify(aturan, null, 2);
                }
            };

            tabPy.addEventListener('click', () => { activeCodeMode = 'py'; perbaruiKode(); });
            tabSql.addEventListener('click', () => { activeCodeMode = 'sql'; perbaruiKode(); });
            tabJson.addEventListener('click', () => { activeCodeMode = 'json'; perbaruiKode(); });
            copyCodeBtn.addEventListener('click', () => {
                try {
                    navigator.clipboard.writeText(codeDisplay.textContent);
                    copyCodeBtn.textContent = '✓ Tersalin!';
                    setTimeout(() => { copyCodeBtn.textContent = '📋 Salin Kode'; }, 1800);
                } catch {
                    alert('Gagal menyalin otomatis, silakan salin manual dari kotak teks.');
                }
            });
            perbaruiKode();
        }

        // ── 16. Split Metrics Tabel ─────────────────────────────────────────────
        if (dt.splitMetrics && dt.splitMetrics.length > 0) {
            const gainOf = (m) => (typeof m.informationGain === 'number' ? m.informationGain : (typeof m.infoGain === 'number' ? m.infoGain : 0));
            const barisSplit = dt.splitMetrics.slice(0, 20).map((metric) => `
                <tr>
                    <td>${esc(metric.attribute || '—')}</td>
                    <td>${metric.type === 'numeric' ? 'numerik' : 'kategorikal'}</td>
                    <td class="r">${angka(metric.entropy, 4)}</td>
                    <td class="r">${angka(gainOf(metric), 4)}</td>
                    <td class="r">${angka(metric.giniGain, 4)}</td>
                    <td class="r">${angka(metric.splitInfo, 4)}</td>
                    <td class="r"><b>${angka(metric.gainRatio, 4)}</b></td>
                    <td class="r">${fmt(metric.usedAtNodes === undefined ? 0 : metric.usedAtNodes)}</td>
                    <td class="r">${fmt(metric.uniqueValues === undefined ? 0 : metric.uniqueValues)}</td>
                </tr>`).join('');
            const splitCard = el('div', 'card wide');
            splitCard.innerHTML = `
                <h3>📊 Split Metrics — ${fmt(dt.splitMetrics.length)} atribut (${fmt(Math.min(20, dt.splitMetrics.length))} gain ratio teratas)</h3>
                <div class="tablewrap" style="max-height:340px;overflow-y:auto;">
                    <table class="data">
                        <thead>
                            <tr>
                                <th>Atribut</th>
                                <th>Tipe</th>
                                <th class="r">Entropy</th>
                                <th class="r">Info Gain</th>
                                <th class="r">Gini Gain</th>
                                <th class="r">Split Info</th>
                                <th class="r">Gain Ratio</th>
                                <th class="r">Simpul</th>
                                <th class="r">Nilai unik</th>
                            </tr>
                        </thead>
                        <tbody>${barisSplit}</tbody>
                    </table>
                </div>
                <div class="muted" style="margin-top:8px;font-size:12px;">C4.5 memilih atribut ber-gain ratio tertinggi (gain dibagi split info) agar tidak bias ke atribut bernilai banyak; kolom Gini Gain memperlihatkan pilihan bila kriteria indeks Gini yang dipakai. “Simpul” = jumlah simpul pohon yang benar-benar memakai atribut itu.</div>`;
            body.appendChild(splitCard);
        }

        // ── 17. Langkah perhitungan matematis rinci ─────────────────────────────
        const langkah = dt.detailedCalculations || [];
        if (langkah.length) {
            const detail = el('div', 'card wide');
            detail.innerHTML = `<details><summary><b>🧮 Langkah Perhitungan Rinci (${langkah.length} langkah)</b> — entropi, gain ratio, seleksi split, pemangkasan, validasi silang</summary>
                <div class="tablewrap" style="max-height:420px;overflow-y:auto;margin-top:8px;"><table class="data"><thead><tr><th class="r">#</th><th>Tahap</th><th>Rumus</th><th>Perhitungan</th><th>Hasil</th></tr></thead>
                <tbody>${langkah.map((x) => `<tr><td class="r">${fmt(x.step)}</td><td>${esc(cut(String(x.description || ''), 60))}</td><td><code>${esc(String(x.formula || ''))}</code></td><td><pre class="tdetail">${esc(String(x.calculation || ''))}</pre></td><td>${esc(cut(String(x.result === undefined ? '' : x.result), 80))}</td></tr>`).join('')}</tbody></table></div></details>`;
            body.appendChild(detail);
        }
    }

})();