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

    window.addEventListener('message', (e) => {
        const m = e.data;
        if (m.type === 'data') {
            state = m.payload;
            try { render(Math.min(cur, state.sheets.length - 1)); } catch (err) { showErr(err); }
        } else if (m.type === 'error') {
            app.innerHTML = '<div class="err">❌ ' + esc(m.message) + '</div>';
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

    function section(id, title) {
        const sec = el('section', 'sec'); sec.id = id; sec.appendChild(el('h2', '', title));
        const body = el('div', 'grid'); sec.appendChild(body); app.appendChild(sec); return body;
    }

    const barOpts = (horizontal) => ({ indexAxis: horizontal ? 'y' : 'x', plugins: { legend: { display: false } } });

    function exportToPdf() {
        const btn = document.getElementById('btn-export-pdf');
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
            type: 'savePdf',
            suggestedName: (state.fileName.replace(/\.[^.]+$/, '') || 'report') + '.pdf',
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
            chartImages,
            notes,
            insights: sheet.insights || [],
            colSummary,
            generatedAt: new Date().toLocaleString('en-US')
        });

        setTimeout(() => {
            if (btn) { btn.disabled = false; btn.textContent = '📄 Export to PDF'; }
        }, 3000);
    }

    function render(si) {
        if (typeof Chart === 'undefined') throw new Error('Chart.js failed to load. Ensure media/chart.umd.js exists and is properly packaged.');
        cur = si;
        charts.forEach((c) => { try { c.destroy(); } catch (e) { } });
        charts = [];
        app.innerHTML = '';
        const sheet = state.sheets[si];

        Chart.defaults.color = css('--vscode-foreground') || '#ccc';
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

        const pdfBtn = el('button', 'btn primary', '📄 Export to PDF');
        pdfBtn.id = 'btn-export-pdf';
        pdfBtn.title = 'Save or print this entire interactive dashboard as a clean PDF';
        pdfBtn.onclick = exportToPdf;

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

        // Append all buttons to the action box
        actBox.append(pdfBtn, webBtn, webBtn2, webBtn3, rl);

        head.appendChild(actBox);
        app.appendChild(head);

        // URL link chips row — shown below head
        const linksRow = el('div', '');
        linksRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding:6px 0 10px;align-items:center;';
        linksRow.appendChild(onlineChip);
        linksRow.appendChild(offlineChip);
        app.appendChild(linksRow);


        const nav = el('nav', 'nav');
        [['summary', 'Summary'], ['notes', 'Notes & Observations'], ['insights', 'Insights'], ['table', 'Data Table'], ['builder', 'Chart Builder'], ['charts', 'Charts'], ['advanced', 'Advanced'], ['columns', 'Column Details'], ['correlation', 'Correlation']]
            .forEach(([id, t]) => nav.insertAdjacentHTML('beforeend', `<a href="#${id}">${t}</a>`));
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

        // ---- Notes & Observations ----
        notesSection(sheet);

        // ---- Insights ----
        const ins = section('insights', 'Automated Insights');
        const ul = el('ul', 'insights card wide');
        sheet.insights.forEach((t) => ul.appendChild(el('li', '', esc(t))));
        ins.appendChild(ul);

        // ---- Data Table ----
        tableSection(sheet);

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
            window.SkunderExt.init({ app, sheet, state, vscode, el, esc, fmt, cut, PALETTE: PALETTE, section, chart });
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
})();