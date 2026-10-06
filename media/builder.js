/* global Chart, matchMedia */
(function () {
    const TYPES = [
        ['bar', '📊 Bar'], ['barh', '📊 Horizontal Bar'], ['stacked', '🧱 Stacked Bar'], ['stacked100', '🧱 100% Stacked Bar'],
        ['line', '📈 Line'], ['area', '🏔️ Area'], ['step', '🪜 Step Line'], ['pareto', '📉 Pareto Analysis'],
        ['pie', '🥧 Pie'], ['doughnut', '🍩 Doughnut'], ['polar', '🎯 Polar Area'], ['radar', '🕸️ Radar'],
        ['hist', '▥ Histogram + Cumulative'], ['scatter', '⚬ Scatter + Trendline'], ['bubble', '🫧 Bubble']
    ];
    const AGGS = [
        ['count', 'Row count'], ['sum', 'Sum (Total)'], ['mean', 'Average (Mean)'],
        ['median', 'Median'], ['min', 'Minimum'], ['max', 'Maximum'], ['distinct', 'Distinct Count']
    ];
    const AGG_NAME = {
        count: 'Count of', sum: 'Sum of', mean: 'Average of',
        median: 'Median of', min: 'Min of', max: 'Max of', distinct: 'Distinct of'
    };
    const GRANS = [['auto', 'Automatic'], ['year', 'Yearly'], ['month', 'Monthly'], ['day', 'Daily']];
    const TOPNS = [[0, 'All'], [5, 'Top 5'], [8, 'Top 8'], [10, 'Top 10'], [20, 'Top 20'], [50, 'Top 50']];
    const SORTS = [['auto', 'Automatic'], ['desc', 'Value (High to Low) ↓'], ['asc', 'Value (Low to High) ↑'], ['label', 'Label (A–Z)']];
    const SPANS = ['s', 'm', 'l', 'xl'];
    const CIRC = ['pie', 'doughnut', 'polar'];
    const ANIM = matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 600, easing: 'easeOutQuart' };

    let P, S, PAL, bgrid, extCharts = [];

    const num = (c) => c.type === 'number' || c.type === 'integer';
    const colI = (n) => S.headers.indexOf(n);
    const r3 = (x) => Math.round(x * 1000) / 1000;
    const opts = (o) => Object.assign({ responsive: true, maintainAspectRatio: false, animation: ANIM }, o);
    const opt = (arr, sel) => arr.map(([v, l]) => `<option value="${P.esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${P.esc(l)}</option>`).join('');
    const drop = (c) => {
        try { c.destroy(); } catch (e) { }
        extCharts = extCharts.filter((x) => x !== c);
    };

    // ---------- aggregation ----------
    function makeKey(ci, gran) {
        const c = S.columns[ci];
        if (c.type === 'date') {
            const g = !gran || gran === 'auto' ? (c.gran || 'month') : gran;
            const len = g === 'year' ? 4 : g === 'month' ? 7 : 10;
            return { fn: (v) => (v == null ? null : String(v).slice(0, len)), time: true };
        }
        if (num(c) && c.unique > 20 && c.num) {
            const k = 10, mn = c.num.min, w = (c.num.max - mn) / k || 1;
            const labels = Array.from({ length: k }, (_, b) => P.fmt(mn + b * w) + '–' + P.fmt(mn + (b + 1) * w));
            return { fn: (v) => (typeof v === 'number' ? labels[Math.min(k - 1, Math.floor((v - mn) / w))] : null), natural: labels };
        }
        return { fn: (v) => (v == null ? null : String(v)) };
    }

    function aggregate(b, kind, hasY) {
        if (!hasY || kind === 'count') return b.n;
        if (kind === 'distinct') return new Set(b.vals).size;
        const v = b.vals.filter((x) => typeof x === 'number');
        if (!v.length) return 0;
        switch (kind) {
            case 'sum': return v.reduce((a, c) => a + c, 0);
            case 'mean': return v.reduce((a, c) => a + c, 0) / v.length;
            case 'median': { const s = [...v].sort((a, c) => a - c), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
            case 'min': return Math.min(...v);
            case 'max': return Math.max(...v);
            default: return b.n;
        }
    }

    // ---------- builder chart ----------
    function buildCat(cfg) {
        const xi = colI(cfg.x); if (xi < 0) return null;
        const yi = cfg.y ? colI(cfg.y) : -1, gi = cfg.group ? colI(cfg.group) : -1;
        const hasY = yi >= 0 && cfg.agg !== 'count';
        const T = cfg.type, pareto = T === 'pareto', circ = CIRC.includes(T);
        const useG = gi >= 0 && !circ && !pareto;
        const { fn, time, natural } = makeKey(xi, cfg.gran);
        let gKeys = ['_'];
        if (useG) {
            const m = new Map();
            for (const r of S.rows) if (r[gi] != null) m.set(String(r[gi]), (m.get(String(r[gi])) || 0) + 1);
            gKeys = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
        }
        const map = new Map();
        for (const r of S.rows) {
            const k = fn(r[xi]); if (k === null) continue;
            const g = useG ? (r[gi] == null ? null : String(r[gi])) : '_';
            if (g === null || !gKeys.includes(g)) continue;
            let m = map.get(k); if (!m) { m = new Map(); map.set(k, m); }
            let b = m.get(g); if (!b) { b = { n: 0, vals: [] }; m.set(g, b); }
            b.n++; if (hasY && r[yi] != null) b.vals.push(r[yi]);
        }
        const val = (k, g) => { const b = map.get(k).get(g); return b ? r3(aggregate(b, cfg.agg, hasY)) : 0; };
        const total = (k) => gKeys.reduce((a, g) => a + val(k, g), 0);
        let labels = [...map.keys()];
        const mode = pareto ? 'desc' : cfg.sort === 'auto' ? (time || natural ? 'label' : 'desc') : cfg.sort;
        if (mode === 'desc') labels.sort((a, b) => total(b) - total(a));
        else if (mode === 'asc') labels.sort((a, b) => total(a) - total(b));
        else labels.sort((a, b) => (natural ? natural.indexOf(a) - natural.indexOf(b) : a.localeCompare(b, undefined, { numeric: true })));
        let lim = pareto && !cfg.topn ? 15 : cfg.topn;
        if (T === 'radar') lim = Math.min(lim || 12, 12);
        if (lim && !(mode === 'label' && (time || natural))) labels = labels.slice(0, lim);
        if (!labels.length) return null;

        const yTitle = hasY ? `${AGG_NAME[cfg.agg]} ${cfg.y}` : 'Row count';
        const col = (i) => PAL[i % PAL.length];
        let type = 'bar', datasets, o = {};
        if (circ) {
            type = T === 'polar' ? 'polarArea' : T;
            datasets = [{ data: labels.map((l) => val(l, '_')), backgroundColor: labels.map((_, i) => col(i)), borderWidth: 1 }];
        } else if (pareto) {
            const vs = labels.map((l) => val(l, '_')), tot = vs.reduce((a, b) => a + b, 0) || 1;
            let acc = 0;
            datasets = [
                { type: 'bar', label: yTitle, data: vs, backgroundColor: col(0) + 'cc', yAxisID: 'y' },
                { type: 'line', label: 'Cumulative %', data: vs.map((v) => r3(((acc += v) / tot) * 100)), borderColor: col(2), backgroundColor: col(2), tension: 0.3, yAxisID: 'y1' }
            ];
            o.scales = { y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (v) => v + '%' } } };
        } else if (T === 'line' || T === 'area' || T === 'step') {
            type = 'line';
            datasets = gKeys.map((g, i) => ({ label: g === '_' ? yTitle : g, data: labels.map((l) => val(l, g)), borderColor: col(i), backgroundColor: col(i) + '33', fill: T === 'area', stepped: T === 'step', tension: T === 'step' ? 0 : 0.35, pointRadius: labels.length > 60 ? 0 : 3 }));
        } else if (T === 'radar') {
            type = 'radar';
            datasets = gKeys.map((g, i) => ({ label: g === '_' ? yTitle : g, data: labels.map((l) => val(l, g)), borderColor: col(i), backgroundColor: col(i) + '33' }));
        } else {
            const st = T === 'stacked' || T === 'stacked100', pct = T === 'stacked100';
            datasets = gKeys.map((g, i) => ({ label: g === '_' ? yTitle : g, data: labels.map((l) => (pct ? r3((val(l, g) / (total(l) || 1)) * 100) : val(l, g))), backgroundColor: gKeys.length === 1 && !st ? labels.map((_, k) => col(k)) : col(i), borderRadius: 4 }));
            if (T === 'barh') o.indexAxis = 'y';
            if (st) o.scales = { x: { stacked: true }, y: { stacked: true, max: pct ? 100 : undefined } };
        }
        o.plugins = { legend: { display: circ || pareto || T === 'radar' || gKeys.length > 1, position: 'bottom' } };
        if (!circ && T !== 'radar') {
            const hz = T === 'barh', ax = hz ? 'y' : 'x', ay = hz ? 'x' : 'y';
            o.scales = o.scales || {};
            o.scales[ax] = Object.assign({ title: { display: true, text: cfg.x } }, o.scales[ax]);
            o.scales[ay] = Object.assign({ title: { display: true, text: T === 'stacked100' ? '% of total' : yTitle } }, o.scales[ay]);
        }
        return { type, data: { labels: labels.map((l) => P.cut(l, 22)), datasets }, options: opts(o) };
    }

    function buildHist(cfg) {
        const xi = colI(cfg.x); if (xi < 0) return null;
        const v = S.rows.map((r) => r[xi]).filter((x) => typeof x === 'number').sort((a, b) => a - b);
        if (!v.length) return null;
        const mn = v[0], mx = v[v.length - 1];
        const k = mn === mx ? 1 : Math.max(5, Math.min(30, Math.ceil(Math.log2(v.length) + 1)));
        const w = (mx - mn) / k || 1, counts = new Array(k).fill(0);
        v.forEach((x) => counts[Math.min(k - 1, Math.floor((x - mn) / w))]++);
        let acc = 0;
        return {
            type: 'bar', data: {
                labels: counts.map((_, i) => P.fmt(mn + i * w)), datasets: [
                    { label: 'Frequency', data: counts, backgroundColor: PAL[0] + 'cc', categoryPercentage: 1, barPercentage: 0.98, yAxisID: 'y' },
                    { type: 'line', label: 'Cumulative %', data: counts.map((c) => r3(((acc += c) / v.length) * 100)), borderColor: PAL[2], pointRadius: 0, tension: 0.3, yAxisID: 'y1' }]
            },
            options: opts({ plugins: { legend: { position: 'bottom' } }, scales: { x: { title: { display: true, text: cfg.x } }, y: { title: { display: true, text: 'Frequency' } }, y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: (x) => x + '%' } } } })
        };
    }

    function buildXY(cfg) {
        const xi = colI(cfg.x), yi = colI(cfg.y), gi = cfg.group ? colI(cfg.group) : -1;
        const zi = cfg.type === 'bubble' && cfg.size ? colI(cfg.size) : -1;
        if (xi < 0 || yi < 0) return null;
        const pts = [];
        for (const r of S.rows) {
            const x = r[xi], y = r[yi];
            if (typeof x === 'number' && typeof y === 'number') pts.push({ x, y, z: zi >= 0 && typeof r[zi] === 'number' ? r[zi] : 1, g: gi >= 0 && r[gi] != null ? String(r[gi]) : '_' });
        }
        if (!pts.length) return null;
        const step = Math.max(1, Math.ceil(pts.length / 1000)), sm = pts.filter((_, i) => i % step === 0);
        let zmin = Infinity, zmax = -Infinity;
        sm.forEach((p) => { zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); });
        const rad = (z) => (cfg.type === 'bubble' ? 4 + (zmax === zmin ? 6 : ((z - zmin) / (zmax - zmin)) * 18) : 3);
        const gc = new Map(); sm.forEach((p) => gc.set(p.g, (gc.get(p.g) || 0) + 1));
        const gKeys = [...gc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
        const datasets = gKeys.map((g, i) => ({ label: g === '_' ? `${cfg.y} vs ${cfg.x}` : g, data: sm.filter((p) => p.g === g).map((p) => ({ x: p.x, y: p.y, r: rad(p.z), z: p.z })), backgroundColor: PAL[i % PAL.length] + '99', borderColor: PAL[i % PAL.length] }));
        if (cfg.type === 'scatter') {
            const n = pts.length; let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, lo = Infinity, hi = -Infinity;
            pts.forEach((p) => { sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); });
            const den = n * sxx - sx * sx, slope = den ? (n * sxy - sx * sy) / den : 0, b = (sy - slope * sx) / n;
            const dr = Math.sqrt(den * (n * syy - sy * sy)), r = dr ? r3((n * sxy - sx * sy) / dr) : 0;
            datasets.push({ type: 'line', label: `Linear trend (r = ${r})`, data: [{ x: lo, y: slope * lo + b }, { x: hi, y: slope * hi + b }], borderColor: '#e15759', borderDash: [6, 4], borderWidth: 2, pointRadius: 0 });
        }
        return { type: cfg.type, data: { datasets }, options: opts({ plugins: { legend: { display: gKeys.length > 1 || cfg.type === 'scatter', position: 'bottom' } }, scales: { x: { title: { display: true, text: cfg.x } }, y: { title: { display: true, text: cfg.y } } } }) };
    }

    const buildConfig = (cfg) => (cfg.type === 'hist' ? buildHist(cfg) : cfg.type === 'scatter' || cfg.type === 'bubble' ? buildXY(cfg) : buildCat(cfg));

    // ---------- builder card ----------
    function normalize(cfg) {
        const nums = S.columns.filter(num).map((c) => c.name), xy = cfg.type === 'scatter' || cfg.type === 'bubble';
        if (xy || cfg.type === 'hist') { if (!nums.includes(cfg.x)) cfg.x = nums[0] || ''; }
        else if (!S.headers.includes(cfg.x)) cfg.x = S.headers[0];
        if (xy) { if (!nums.includes(cfg.y)) cfg.y = nums.find((n) => n !== cfg.x) || nums[0] || ''; }
        else if (cfg.y && !nums.includes(cfg.y)) cfg.y = '';
        if (cfg.group && !S.headers.includes(cfg.group)) cfg.group = '';
        if (cfg.size && !nums.includes(cfg.size)) cfg.size = '';
        return cfg;
    }
    const mk = (o) => normalize(Object.assign({ type: 'bar', x: '', y: '', agg: 'count', group: '', size: '', sort: 'auto', topn: 0, gran: 'auto', span: 'm' }, o));

    function controls(cfg) {
        const nums = S.columns.filter(num).map((c) => [c.name, c.name]);
        const cats = S.columns.filter((c) => c.type === 'category' || c.type === 'boolean' || (c.type === 'integer' && c.unique <= 12)).map((c) => [c.name, c.name]);
        const xy = cfg.type === 'scatter' || cfg.type === 'bubble', hist = cfg.type === 'hist';
        const xc = xy || hist ? nums : S.columns.map((c) => [c.name, c.name]);
        const xCol = S.columns[colI(cfg.x)], isDate = xCol && xCol.type === 'date';
        const L = (k, label, html, show) => (show === false ? '' : `<label>${label}<select data-k="${k}">${html}</select></label>`);
        return L('x', xy || hist ? 'X-Axis Column' : 'Category / X-Axis', opt(xc, cfg.x))
            + L('y', xy ? 'Y-Axis Column' : 'Value (Y-Axis)', opt(xy ? nums : [['', '(row count)'], ...nums], cfg.y), !hist)
            + L('agg', 'Aggregation', opt(AGGS, cfg.agg), !xy && !hist)
            + L('group', xy ? 'Group / Color' : 'Series / Group', opt([['', '(none)'], ...cats], cfg.group), !hist && !CIRC.includes(cfg.type) && cfg.type !== 'pareto')
            + L('size', 'Bubble Size', opt([['', '(uniform)'], ...nums], cfg.size), cfg.type === 'bubble')
            + L('sort', 'Sort Order', opt(SORTS, cfg.sort), !xy && !hist)
            + L('topn', 'Limit (Top N)', opt(TOPNS, cfg.topn), !xy && !hist)
            + L('gran', 'Time Grouping', opt(GRANS, cfg.gran), isDate && !xy && !hist);
    }

    function draw(card) {
        const cfg = card._cfg, conf = buildConfig(cfg);
        const cv = card.querySelector('canvas'), em = card.querySelector('.empty');
        const printBadge = card.querySelector('.bcard-print-summary');
        if (printBadge) {
            const typeLabel = (TYPES.find((t) => t[0] === cfg.type) || ['', cfg.type])[1];
            printBadge.textContent = `${typeLabel} · X: ${cfg.x}${cfg.y ? ' · Y: ' + cfg.y : ''}${cfg.agg ? ' · ' + (AGG_NAME[cfg.agg] || cfg.agg) : ''}`;
        }
        if (!conf) {
            if (card._chart) { drop(card._chart); card._chart = null; }
            cv.classList.add('hidden'); em.classList.remove('hidden'); em.textContent = 'Please select compatible columns for this chart.';
            return;
        }
        cv.classList.remove('hidden'); em.classList.add('hidden');
        // Always recreate the chart cleanly to avoid any scale mismatch, leftover animations, or tick callback errors
        if (card._chart) {
            drop(card._chart);
            card._chart = null;
        }
        try {
            card._chart = new Chart(cv, conf);
            card._sig = cfg.type;
            extCharts.push(card._chart);
        } catch (err) {
            console.error('Error drawing chart:', err);
            em.classList.remove('hidden');
            em.textContent = 'Failed to render chart: ' + (err.message || err);
            cv.classList.add('hidden');
        }
    }

    function save() {
        if (!bgrid) return;
        const st = P.vscode.getState() || {};
        st.dash = st.dash || {};
        st.dash[P.state.fileName + '|' + S.name] = [...bgrid.querySelectorAll('.bcard')].map((c) => c._cfg);
        P.vscode.setState(st);
    }

    function addCard(cfg, after) {
        normalize(cfg);
        const card = P.el('div', 'card bcard s-' + cfg.span);
        card._cfg = cfg;
        card.innerHTML = `
            <div class="bhead">
                <span class="grip" title="Drag to reorder">⠿</span>
                <select data-k="type">${opt(TYPES, cfg.type)}</select>
                <button class="ib" data-act="span" title="Resize card">⤢</button>
                <button class="ib" data-act="dup" title="Duplicate chart">⧉</button>
                <button class="ib" data-act="del" title="Remove chart">✕</button>
            </div>
            <div class="print-only bcard-print-summary"></div>
            <div class="bctl">${controls(cfg)}</div>
            <div class="cbox"><canvas></canvas><div class="empty hidden"></div></div>
        `;

        const onControlChange = (e) => {
            const k = e.target.dataset.k; if (!k) return;
            cfg[k] = k === 'topn' ? +e.target.value : e.target.value;
            if (k === 'type') normalize(cfg);
            card.querySelector('.bctl').innerHTML = controls(cfg);
            if (k === 'type') card.querySelector('[data-k="type"]').value = cfg.type;
            draw(card);
            save();
        };

        card.addEventListener('change', onControlChange);
        card.addEventListener('input', onControlChange);

        card.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]'); if (!b) return;
            const a = b.dataset.act;
            if (a === 'span') {
                const nx = SPANS[(SPANS.indexOf(cfg.span) + 1) % SPANS.length];
                card.classList.replace('s-' + cfg.span, 's-' + nx);
                cfg.span = nx;
            } else if (a === 'dup') {
                addCard(Object.assign({}, cfg), card);
                return;
            } else if (a === 'del') {
                if (card._chart) drop(card._chart);
                card.remove();
            }
            save();
        });

        if (after) after.after(card); else bgrid.appendChild(card);
        draw(card);
        save();
        return card;
    }

    function defaults() {
        const cats = S.columns.filter((c) => c.type === 'category' && c.unique >= 2 && c.unique <= 30);
        const dates = S.columns.filter((c) => c.type === 'date');
        const nums = S.columns.filter((c) => c.num && c.num.std > 0);
        const out = [];
        if (cats[0] && nums[0]) out.push(mk({ type: 'bar', x: cats[0].name, y: nums[0].name, agg: 'mean' }));
        if (cats[0]) out.push(mk({ type: 'doughnut', x: cats[0].name }));
        if (dates[0]) out.push(mk({ type: 'area', x: dates[0].name, y: nums[0] ? nums[0].name : '', agg: nums[0] ? 'sum' : 'count', span: 'l' }));
        if (nums[0]) out.push(mk({ type: 'hist', x: nums[0].name }));
        if (nums.length >= 2) out.push(mk({ type: 'scatter', x: nums[0].name, y: nums[1].name, group: cats[0] && cats[0].unique <= 6 ? cats[0].name : '' }));
        if (!out.length) out.push(mk({ type: 'bar', x: S.headers[0] }));
        return out;
    }

    // ---------- drag & drop (with FLIP animation) ----------
    function flip(grid, mutate) {
        const items = [...grid.children], first = new Map(items.map((c) => [c, c.getBoundingClientRect()]));
        mutate();
        items.forEach((c) => {
            const a = first.get(c), b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
            if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
    }
    function enableDnD(grid, onChange) {
        let dragged = null, busy = false;
        grid.addEventListener('mousedown', (e) => {
            const g = e.target.closest('.grip');
            const c = g && g.closest('.card');
            if (c && c.parentElement === grid) c.draggable = true;
        });
        grid.addEventListener('mouseup', () => grid.querySelectorAll('.card[draggable="true"]').forEach((c) => { c.draggable = false; }));
        grid.addEventListener('dragstart', (e) => {
            const c = e.target.closest && e.target.closest('.card');
            if (!c || !c.draggable || c.parentElement !== grid) return;
            dragged = c; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'card');
            setTimeout(() => c.classList.add('dragging'), 0);
        });
        grid.addEventListener('dragover', (e) => {
            if (!dragged) return;
            e.preventDefault();
            const t = e.target.closest('.card');
            if (busy || !t || t === dragged || t.parentElement !== grid) return;
            const r = t.getBoundingClientRect(), wide = r.width > grid.clientWidth * 0.7;
            const before = wide ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
            if (before ? t.previousElementSibling === dragged : t.nextElementSibling === dragged) return;
            busy = true; setTimeout(() => { busy = false; }, 280);
            flip(grid, () => grid.insertBefore(dragged, before ? t : t.nextElementSibling));
        });
        grid.addEventListener('drop', (e) => e.preventDefault());
        grid.addEventListener('dragend', () => {
            if (!dragged) return;
            dragged.classList.remove('dragging');
            dragged.draggable = false;
            dragged = null;
            if (onChange) onChange();
        });
    }

    // ---------- advanced extra charts ----------
    function extras(body) {
        const cols = S.columns, nums = cols.filter((c) => c.num && c.num.std > 0).slice(0, 12), cats = cols.filter((c) => c.type === 'category' && c.unique >= 2);
        const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : 0);
        const n01 = (c, v) => (c.num.max === c.num.min ? 0 : (v - c.num.min) / (c.num.max - c.num.min));
        const cut = P.cut;

        P.chart(body, 'Data Completeness per Column (%)', {
            type: 'bar', data: {
                labels: cols.map((c) => cut(c.name, 18)), datasets: [
                    { label: 'Populated', data: cols.map((c) => pct(c.count, c.count + c.missing)), backgroundColor: PAL[4] + 'cc' },
                    { label: 'Missing', data: cols.map((c) => 100 - pct(c.count, c.count + c.missing)), backgroundColor: PAL[2] + 'cc' }]
            },
            options: { indexAxis: 'y', scales: { x: { stacked: true, max: 100 }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } } }
        }, Math.max(220, cols.length * 22));

        if (nums.length >= 2) {
            P.chart(body, 'IQR Range & Median (Normalized 0–1)', {
                type: 'bar', data: {
                    labels: nums.map((c) => cut(c.name, 14)), datasets: [
                        { label: 'Q1–Q3', data: nums.map((c) => [r3(n01(c, c.num.q1)), r3(n01(c, c.num.q3))]), backgroundColor: PAL[0] + 'cc', borderSkipped: false, borderRadius: 4 },
                        { type: 'line', label: 'Median', data: nums.map((c) => r3(n01(c, c.num.median))), showLine: false, pointStyle: 'rectRot', pointRadius: 6, backgroundColor: PAL[2], borderColor: PAL[2] }]
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { min: 0, max: 1 } } }
            });
            P.chart(body, 'Mean vs Median (Normalized) Skew Indicator', {
                type: 'bar', data: {
                    labels: nums.map((c) => cut(c.name, 14)), datasets: [
                        { label: 'Mean', data: nums.map((c) => r3(n01(c, c.num.mean))), backgroundColor: PAL[0] + 'cc', borderRadius: 4 },
                        { label: 'Median', data: nums.map((c) => r3(n01(c, c.num.median))), backgroundColor: PAL[1] + 'cc', borderRadius: 4 }]
                },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { min: 0, max: 1 } } }
            });
        }

        cats.slice(0, 2).forEach((c) => { const conf = buildConfig(mk({ type: 'pareto', x: c.name, topn: 10 })); if (conf) P.chart(body, `Pareto Analysis: ${c.name}`, conf); });
        nums.slice(0, 2).forEach((c) => { const conf = buildConfig(mk({ type: 'hist', x: c.name })); if (conf) P.chart(body, `Histogram & Cumulative: ${c.name}`, conf); });

        if (nums[0]) {
            const xi = colI(nums[0].name), v = S.rows.map((r) => r[xi]).filter((x) => typeof x === 'number').sort((a, b) => a - b), step = Math.max(1, Math.ceil(v.length / 150));
            const pts = v.map((x, i) => ({ x, y: r3(((i + 1) / v.length) * 100) })).filter((_, i) => i % step === 0);
            P.chart(body, `Cumulative Distribution (ECDF): ${nums[0].name}`, {
                type: 'scatter', data: { datasets: [{ data: pts, showLine: true, stepped: true, fill: true, pointRadius: 0, borderColor: PAL[1], backgroundColor: PAL[1] + '33' }] },
                options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: nums[0].name } }, y: { title: { display: true, text: '% data ≤ value' }, max: 100 } } }
            });

            const li = cols.findIndex((c) => c.type === 'id' || c.type === 'text' || c.type === 'category');
            const top = S.rows.map((r, i) => ({ l: li >= 0 && r[li] != null ? String(r[li]) : '#' + (i + 1), v: r[xi] })).filter((x) => typeof x.v === 'number').sort((a, b) => b.v - a.v).slice(0, 10);
            P.chart(body, `Top 10 Highest Values: ${nums[0].name}`, { type: 'bar', data: { labels: top.map((t) => cut(t.l, 20)), datasets: [{ data: top.map((t) => t.v), backgroundColor: top.map((_, i) => PAL[i % PAL.length]), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } }, 320);
        }

        if (nums.length >= 3) { const conf = buildConfig(mk({ type: 'bubble', x: nums[0].name, y: nums[1].name, size: nums[2].name })); if (conf) P.chart(body, `Bubble: ${nums[0].name} × ${nums[1].name} (size ${nums[2].name})`, conf, 300); }
        if (S.scatters.length) { const s = S.scatters[0], conf = buildConfig(mk({ type: 'scatter', x: s.x, y: s.y, group: cats[0] && cats[0].unique <= 6 ? cats[0].name : '' })); if (conf) P.chart(body, `${s.x} vs ${s.y} + Trendline`, conf, 300); }

        if (S.crosstab) {
            const x = S.crosstab, tot = x.labels.map((_, i) => x.series.reduce((a, s) => a + s.data[i], 0));
            P.chart(body, `${x.a} × ${x.b} (100% Stacked)`, {
                type: 'bar', data: { labels: x.labels.map((l) => cut(l, 16)), datasets: x.series.map((s, i) => ({ label: s.name, data: s.data.map((d, k) => r3((d / (tot[k] || 1)) * 100)), backgroundColor: PAL[i % PAL.length] })) },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, max: 100 } } }
            });
        }

        const cc = cats.find((c) => c.unique <= 6), ns = nums.slice(0, 6);
        if (cc && ns.length >= 3) {
            const ci = colI(cc.name), acc = new Map();
            for (const r of S.rows) {
                const k = r[ci]; if (k == null) continue;
                let a = acc.get(String(k)); if (!a) { a = ns.map(() => [0, 0]); acc.set(String(k), a); }
                ns.forEach((c, j) => { const v = r[colI(c.name)]; if (typeof v === 'number') { a[j][0] += v; a[j][1]++; } });
            }
            P.chart(body, `Radar Profile by ${cc.name} (Normalized Mean)`, {
                type: 'radar', data: { labels: ns.map((c) => cut(c.name, 14)), datasets: [...acc.entries()].slice(0, 6).map(([k, a], i) => ({ label: k, data: a.map(([s, n], j) => (n ? r3(n01(ns[j], s / n)) : 0)), borderColor: PAL[i], backgroundColor: PAL[i] + '33' })) },
                options: { plugins: { legend: { position: 'bottom' } }, scales: { r: { min: 0, max: 1 } } }
            }, 320);
        }
    }

    // ---------- entry point ----------
    window.SkunderExt = {
        stopAll() {
            extCharts.forEach((c) => {
                try { c.stop(); } catch (e) { }
            });
        },
        init(ctx) {
            extCharts.forEach((c) => { try { c.destroy(); } catch (e) { } });
            extCharts = []; bgrid = null;
            P = ctx; S = ctx.sheet; PAL = P.PALETTE;
            if (!S.rows.length) return;

            const bBody = P.section('builder', 'Chart Builder Select columns & chart types, drag ⠿ to reorder');
            const bSec = bBody.parentElement;
            const tools = P.el('div', 'btoolbar');
            const add = P.el('button', 'btn secondary', 'Add Chart'), reset = P.el('button', 'btn secondary', '↺ Reset Layout');
            tools.append(add, reset, P.el('span', 'muted', `Customize chart types, axes, aggregations, sorting, and card size. Layout is auto-saved. Computed from first ${S.rows.length.toLocaleString('en-US')} rows.`));
            bSec.insertBefore(tools, bBody);
            bgrid = bBody;

            const saved = ((P.vscode.getState() || {}).dash || {})[P.state.fileName + '|' + S.name];
            (Array.isArray(saved) ? saved.map(mk) : defaults()).forEach((c) => addCard(c));
            add.onclick = () => {
                const nums = S.columns.filter((c) => c.num), cat = S.columns.find((c) => c.type === 'category');
                const c = addCard(mk({ type: 'bar', x: cat ? cat.name : S.headers[0], y: nums[0] ? nums[0].name : '', agg: nums[0] ? 'mean' : 'count' }));
                c.scrollIntoView({ behavior: 'smooth', block: 'center' });
            };
            reset.onclick = () => {
                const st = P.vscode.getState() || {}; if (st.dash) { delete st.dash[P.state.fileName + '|' + S.name]; P.vscode.setState(st); }
                [...bgrid.children].forEach((c) => { if (c._chart) drop(c._chart); c.remove(); });
                defaults().forEach((c) => addCard(c));
            };
            enableDnD(bgrid, save);

            const eBody = P.section('advanced', '🧪 Advanced Visualizations');
            extras(eBody);

            const chartsSec = document.getElementById('charts') || document.getElementById('grafik');
            if (chartsSec) {
                chartsSec.before(bSec);
                chartsSec.after(eBody.parentElement);
            }

            P.app.querySelectorAll('.grid').forEach((g) => {
                if (g === bgrid) return;
                g.querySelectorAll(':scope > .card:not(.wide)').forEach((c) => {
                    const gr = P.el('span', 'grip', '⠿');
                    gr.title = 'Drag to reorder';
                    c.appendChild(gr);
                });
                enableDnD(g);
            });
            P.app.querySelectorAll('.card').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 30)));
        },
    };
})();