import type { SheetResult } from './analysis';

export type FlowState = 'critical' | 'active' | 'skipped';
export type FlowKind = 'start' | 'end' | 'process' | 'decision';
export interface FlowNode { id: string; kind: FlowKind; lines: string[]; sub?: string; cx: number; cy: number; w: number; h: number; state: FlowState }
export interface FlowEdge { pts: [number, number][]; state: FlowState; arrow: boolean; label?: string; lx?: number; ly?: number }
export interface FlowRow { no: number; step: string; result: string; state: FlowState }
export interface Flowchart {
    mode: 'slide' | 'column'; W: number; H: number; title: string; tableTop: number;
    nodes: FlowNode[]; edges: FlowEdge[]; rows: FlowRow[];
    counts: { critical: number; active: number; skipped: number };
}

interface Proc { id: string; lines: string[]; sub: string; step: string; result: string }
interface Dec { id: string; lines: string[]; yes: boolean; skip: string; branch: Proc }

const n0 = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const f3 = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 3 });
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Menyusun langkah dan keputusan flowchart dari hasil analisis nyata. */
function buildSpec(sheet: SheetResult) {
    const hl = sheet.csvHealth, cols = sheet.columns, P = sheet.headers.length;
    const numC = cols.filter((c) => c.num).length;
    const catC = cols.filter((c) => c.type === 'category').length;
    const dateC = cols.filter((c) => c.type === 'date').length;
    let maxR = 0;
    sheet.corr.matrix.forEach((row, i) => row.forEach((v, j) => { if (i !== j && v !== null && Math.abs(v) > Math.abs(maxR)) { maxR = v; } }));
    const st = sheet.stockAnalysis, dt = sheet.decisionTreeAnalysis, ct = sheet.crosstab;

    const A: Proc[] = [
        { id: 'read', lines: ['Baca file', 'CSV / Excel'], sub: `${n0(sheet.totalRows)} x ${P}`, step: 'Baca file CSV / Excel', result: `${n0(sheet.totalRows)} baris x ${P} kolom` },
        { id: 'types', lines: ['Inferensi tipe', 'kolom'], sub: cut(`${numC} num ${catC} kat ${dateC} tgl`, 18), step: 'Inferensi tipe kolom', result: `${numC} numerik, ${catC} kategori, ${dateC} tanggal` },
        { id: 'quality', lines: ['Penilaian', 'kualitas data'], sub: `Skor ${hl.qualityScore}%`, step: 'Penilaian kualitas data', result: `Skor ${hl.qualityScore}%, ${n0(hl.missingCells)} sel kosong, ${n0(hl.duplicateRows)} duplikat` },
        { id: 'stats', lines: ['Statistik &', 'outlier (IQR)'], sub: cut(`${hl.outlierColsCount} kolom outlier`, 18), step: 'Statistik deskriptif dan outlier', result: `${numC} variabel numerik, ${hl.outlierColsCount} kolom beroutlier` },
    ];
    const D: Dec[] = [
        {
            id: 'd1', lines: ['Numerik >= 2', 'variabel?'], yes: sheet.corr.cols.length >= 2, skip: 'variabel numerik kurang dari 2',
            branch: { id: 'corr', lines: ['Korelasi &', 'regresi linear'], sub: `r maks ${f3(maxR)}`, step: 'Korelasi dan regresi linear', result: `${sheet.corr.cols.length} variabel, r terkuat ${f3(maxR)}` }
        },
        {
            id: 'd2', lines: ['Kategori >= 2', 'kolom?'], yes: !!ct, skip: 'kolom kategori kurang dari 2',
            branch: { id: 'chi', lines: ['Asosiasi', 'chi-kuadrat'], sub: ct ? cut(`${cut(ct.a, 8)} x ${cut(ct.b, 7)}`, 18) : '', step: 'Asosiasi kategorikal (chi-kuadrat)', result: ct ? `${ct.a} x ${ct.b}, uji chi-kuadrat dan V Cramer` : '' }
        },
        {
            id: 'd3', lines: ['Ada tanggal /', 'kelompok?'], yes: sheet.trends.length > 0 || sheet.groupBars.length > 0, skip: 'tidak ada kolom tanggal atau kategori + angka',
            branch: { id: 'trend', lines: ['Tren waktu &', 'kelompok'], sub: `${sheet.trends.length} tren ${sheet.groupBars.length} grup`, step: 'Tren waktu dan kelompok', result: `${sheet.trends.length} tren waktu, ${sheet.groupBars.length} perbandingan kelompok` }
        },
        {
            id: 'd4', lines: ['Ada kolom item', '+ kuantitas?'], yes: !!st, skip: 'kolom item/kuantitas tidak terdeteksi',
            branch: { id: 'stock', lines: ['Persediaan ABC', '+ pengadaan'], sub: st ? `${n0(st.kpis.totalSKUs)} SKU` : '', step: 'Persediaan, ABC, pengadaan', result: st ? `${n0(st.kpis.totalSKUs)} SKU, ${st.kpis.criticalCount} kritis, ${st.kpis.overstockCount} overstock` : '' }
        },
        {
            id: 'd5', lines: ['Target 2-10', 'kelas, n>=20?'], yes: !!dt, skip: 'tidak ada target kategorikal layak / baris < 20',
            branch: { id: 'dt', lines: ['Decision Tree', 'C4.5'], sub: dt ? `Akurasi ${(dt.accuracy * 100).toFixed(1)}%` : '', step: 'Decision Tree C4.5', result: dt ? `Target "${dt.targetAttribute}", akurasi ${(dt.accuracy * 100).toFixed(1)}%, ${dt.rules.length} aturan` : '' }
        },
    ];
    const exp: Proc = { id: 'export', lines: ['Ekspor hasil'], sub: 'DOCX PDF XLSX SVG', step: 'Ekspor hasil', result: 'Jurnal DOCX/PDF, laporan Excel, gambar workflow' };
    return { A, D, exp };
}

export function layoutFlow(sheet: SheetResult, mode: 'slide' | 'column', title: string): Flowchart {
    const { A, D, exp } = buildSpec(sheet);
    const slide = mode === 'slide';
    const nodes: FlowNode[] = [], edges: FlowEdge[] = [];
    const E = (pts: [number, number][], state: FlowState, arrow = true, label?: string, lx?: number, ly?: number) => { edges.push({ pts, state, arrow, label, lx, ly }); };

    const W = slide ? 1280 : 700;
    const wN = slide ? 170 : 290, hN = slide ? 58 : 62, hD = slide ? 80 : 84;
    const startS = { w: slide ? 100 : 120, h: slide ? 40 : 36 };

    // posisi
    const pStart: [number, number] = slide ? [100, 135] : [185, 30];
    const pA: [number, number][] = slide ? [370, 640, 910, 1180].map((x) => [x, 135] as [number, number]) : [104, 180, 256, 332].map((y) => [185, y] as [number, number]);
    const pD: [number, number][] = slide ? [1180, 965, 750, 535, 320].map((x) => [x, 285] as [number, number]) : D.map((_, i) => [185, 440 + i * 116] as [number, number]);
    const pB: [number, number][] = pD.map(([x, y]) => (slide ? [x, 395] : [530, y]) as [number, number]);
    const pExp: [number, number] = slide ? [105, 285] : [185, 1020];
    const pEnd: [number, number] = slide ? [105, 385] : [185, 1100];
    const H = slide ? 720 : 1175;

    nodes.push({ id: 'start', kind: 'start', lines: ['Mulai'], cx: pStart[0], cy: pStart[1], w: startS.w, h: startS.h, state: 'critical' });
    const aN = A.map((a, i) => { const n: FlowNode = { id: a.id, kind: 'process', lines: a.lines, sub: a.sub, cx: pA[i][0], cy: pA[i][1], w: wN, h: hN, state: 'critical' }; nodes.push(n); return n; });
    const dN = D.map((d, i) => { const n: FlowNode = { id: d.id, kind: 'decision', lines: d.lines, cx: pD[i][0], cy: pD[i][1], w: wN, h: hD, state: 'critical' }; nodes.push(n); return n; });
    const bN = D.map((d, i) => {
        const n: FlowNode = { id: d.branch.id, kind: 'process', lines: d.branch.lines, sub: d.yes ? d.branch.sub : 'dilewati', cx: pB[i][0], cy: pB[i][1], w: wN, h: hN, state: d.yes ? 'active' : 'skipped' };
        nodes.push(n); return n;
    });
    const xN: FlowNode = { id: exp.id, kind: 'process', lines: exp.lines, sub: exp.sub, cx: pExp[0], cy: pExp[1], w: wN, h: hN, state: 'critical' };
    const eN: FlowNode = { id: 'end', kind: 'end', lines: ['Selesai'], cx: pEnd[0], cy: pEnd[1], w: startS.w, h: startS.h, state: 'critical' };
    nodes.push(xN, eN);
    const sN: FlowNode = nodes[0];

    if (slide) {
        const seq = [sN, ...aN];
        for (let i = 0; i < seq.length - 1; i++) { E([[seq[i].cx + seq[i].w / 2, 135], [seq[i + 1].cx - seq[i + 1].w / 2, 135]], 'critical'); }
        E([[1180, 135 + hN / 2], [1180, dN[0].cy - hD / 2]], 'critical');
        dN.forEach((d, i) => {
            const sx = d.cx - wN / 2, ex = i < 4 ? dN[i + 1].cx + wN / 2 : xN.cx + xN.w / 2;
            E([[sx, d.cy], [ex, d.cy]], 'critical', true, 'Tidak', (sx + ex) / 2, d.cy - 10);
            const b = bN[i], st: FlowState = D[i].yes ? 'active' : 'skipped';
            E([[d.cx, d.cy + hD / 2], [b.cx, b.cy - hN / 2]], st, true, 'Ya', d.cx + 16, d.cy + hD / 2 + 15);
            const xm = (sx + ex) / 2;
            E([[b.cx - wN / 2, b.cy], [xm, b.cy], [xm, d.cy]], st, false);
        });
        E([[xN.cx, xN.cy + hN / 2], [xN.cx, eN.cy - eN.h / 2]], 'critical');
    } else {
        E([[185, sN.cy + sN.h / 2], [185, aN[0].cy - hN / 2]], 'critical');
        for (let i = 0; i < 3; i++) { E([[185, aN[i].cy + hN / 2], [185, aN[i + 1].cy - hN / 2]], 'critical'); }
        E([[185, aN[3].cy + hN / 2], [185, dN[0].cy - hD / 2]], 'critical');
        dN.forEach((d, i) => {
            const y0 = d.cy + hD / 2, y1 = i < 4 ? dN[i + 1].cy - hD / 2 : xN.cy - hN / 2, mid = (y0 + y1) / 2;
            E([[185, y0], [185, y1]], 'critical', true, 'Tidak', 185 - 28, mid - 5);
            const b = bN[i], st: FlowState = D[i].yes ? 'active' : 'skipped';
            E([[185 + wN / 2, d.cy], [b.cx - wN / 2, b.cy]], st, true, 'Ya', (185 + wN / 2 + b.cx - wN / 2) / 2, d.cy - 12);
            E([[b.cx, b.cy + hN / 2], [b.cx, mid], [185, mid]], st, false);
        });
        E([[185, xN.cy + hN / 2], [185, eN.cy - eN.h / 2]], 'critical');
    }

    const rows: FlowRow[] = [];
    A.forEach((a) => rows.push({ no: 0, step: a.step, result: a.result, state: 'critical' }));
    D.forEach((d) => rows.push({ no: 0, step: d.branch.step, result: d.yes ? d.branch.result : `Dilewati: ${d.skip}`, state: d.yes ? 'active' : 'skipped' }));
    rows.push({ no: 0, step: exp.step, result: exp.result, state: 'critical' });
    rows.forEach((r, i) => { r.no = i + 1; });
    const counts = { critical: rows.filter((r) => r.state === 'critical').length, active: rows.filter((r) => r.state === 'active').length, skipped: rows.filter((r) => r.state === 'skipped').length };
    return { mode, W, H, title, tableTop: 455, nodes, edges, rows, counts };
}

// ───────── SVG (slide 16:9) ─────────
const EC: Record<FlowState, { stroke: string; fill: string; text: string; w: number; dash: string }> = {
    critical: { stroke: '#C00000', fill: '#FDECEA', text: '#1F1F1F', w: 2.5, dash: '' },
    active: { stroke: '#2F5597', fill: '#EAF1FB', text: '#1F1F1F', w: 2, dash: '' },
    skipped: { stroke: '#A6A6A6', fill: '#F2F2F2', text: '#7F7F7F', w: 1.5, dash: '6 4' },
};
const STATUS_TXT: Record<FlowState, string> = { critical: 'JALUR UTAMA', active: 'AKTIF', skipped: 'DILEWATI' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ell = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function workflowSvg(fc: Flowchart): string {
    const { W, H } = fc;
    let g = '';
    for (const e of fc.edges) {
        const c = EC[e.state];
        const d = e.pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
        g += `<path d="${d}" fill="none" stroke="${c.stroke}" stroke-width="${c.w}"${c.dash ? ` stroke-dasharray="${c.dash}"` : ''}${e.arrow ? ` marker-end="url(#m-${e.state})"` : ''} stroke-linejoin="round"/>`;
        if (e.label) { g += `<text x="${e.lx}" y="${e.ly}" text-anchor="middle" font-size="11" font-weight="700" fill="${c.stroke}">${esc(e.label)}</text>`; }
    }
    for (const n of fc.nodes) {
        const c = EC[n.state], x = n.cx - n.w / 2, y = n.cy - n.h / 2;
        const dash = c.dash ? ` stroke-dasharray="${c.dash}"` : '';
        if (n.kind === 'start' || n.kind === 'end') {
            g += `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="${n.h / 2}" fill="#C00000" stroke="#7F0000" stroke-width="1.5"/><text x="${n.cx}" y="${n.cy + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${esc(n.lines[0])}</text>`;
            continue;
        }
        if (n.kind === 'decision') {
            g += `<polygon points="${n.cx},${y} ${x + n.w},${n.cy} ${n.cx},${y + n.h} ${x},${n.cy}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${c.w}"${dash}/>`;
        } else {
            g += `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${c.w}"${dash}/>`;
        }
        const total = n.lines.length * 15 + (n.sub ? 14 : 0), y0 = n.cy - total / 2;
        n.lines.forEach((l, i) => { g += `<text x="${n.cx}" y="${y0 + (i + 1) * 15 - 3}" text-anchor="middle" font-size="${n.kind === 'decision' ? 12 : 13}" font-weight="700" fill="${c.text}">${esc(l)}</text>`; });
        if (n.sub) { g += `<text x="${n.cx}" y="${y0 + n.lines.length * 15 + 11}" text-anchor="middle" font-size="11" fill="${n.state === 'skipped' ? '#8C8C8C' : '#555'}">${esc(n.sub)}</text>`; }
    }

    // tabel ringkasan tertanam
    const top = fc.tableTop, gx = [40, 660], cw = [30, 170, 290, 90], rh = 22;
    [fc.rows.slice(0, 5), fc.rows.slice(5)].forEach((rows, gi) => {
        const x = gx[gi];
        g += `<rect x="${x}" y="${top}" width="580" height="24" fill="#2F5597"/>`;
        ['No', 'Langkah', 'Hasil utama', 'Status'].forEach((h, i) => { g += `<text x="${x + cw.slice(0, i).reduce((a, b) => a + b, 0) + 8}" y="${top + 16}" font-size="12" font-weight="700" fill="#fff">${h}</text>`; });
        rows.forEach((r, ri) => {
            const y = top + 24 + ri * rh, c = EC[r.state];
            g += `<rect x="${x}" y="${y}" width="580" height="${rh}" fill="${ri % 2 ? '#F3F6FC' : '#FFFFFF'}" stroke="#D0D0D0" stroke-width="0.7"/>`;
            g += `<text x="${x + 8}" y="${y + 15}" font-size="11" fill="#282828">${r.no}</text>`;
            g += `<text x="${x + cw[0] + 8}" y="${y + 15}" font-size="11" font-weight="700" fill="${c.text}">${esc(ell(r.step, 29))}</text>`;
            g += `<text x="${x + cw[0] + cw[1] + 8}" y="${y + 15}" font-size="11" fill="${r.state === 'skipped' ? '#7F7F7F' : '#282828'}">${esc(ell(r.result, 50))}</text>`;
            g += `<rect x="${x + cw[0] + cw[1] + cw[2] + 4}" y="${y + 4}" width="82" height="14" rx="7" fill="${c.stroke}"/><text x="${x + cw[0] + cw[1] + cw[2] + 45}" y="${y + 14.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${STATUS_TXT[r.state]}</text>`;
        });
    });
    const sy = top + 24 + 5 * rh + 24;
    g += `<text x="40" y="${sy}" font-size="13" font-weight="700" fill="#1F1F1F">Ringkasan: ${fc.counts.critical} langkah jalur utama | ${fc.counts.active} cabang aktif dari 5 keputusan | ${fc.counts.skipped} cabang dilewati</text>`;

    const ly = H - 28;
    g += `<rect x="40" y="${ly - 12}" width="24" height="14" rx="3" fill="#FDECEA" stroke="#C00000" stroke-width="2.5"/><text x="72" y="${ly}" font-size="12" fill="#282828">Jalur utama (selalu dijalankan)</text>`;
    g += `<rect x="290" y="${ly - 12}" width="24" height="14" rx="3" fill="#EAF1FB" stroke="#2F5597" stroke-width="2"/><text x="322" y="${ly}" font-size="12" fill="#282828">Cabang aktif (syarat data terpenuhi)</text>`;
    g += `<rect x="560" y="${ly - 12}" width="24" height="14" rx="3" fill="#F2F2F2" stroke="#A6A6A6" stroke-dasharray="4 3"/><text x="592" y="${ly}" font-size="12" fill="#282828">Cabang dilewati</text>`;
    g += `<polygon points="740,${ly - 12} 754,${ly - 5} 740,${ly + 2} 726,${ly - 5}" fill="#FDECEA" stroke="#C00000" stroke-width="1.5"/><text x="764" y="${ly}" font-size="12" fill="#282828">Keputusan</text>`;
    g += `<rect x="850" y="${ly - 12}" width="30" height="14" rx="7" fill="#C00000"/><text x="888" y="${ly}" font-size="12" fill="#282828">Mulai / Selesai</text>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">
<defs>
<marker id="m-critical" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="#C00000"/></marker>
<marker id="m-active" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="#2F5597"/></marker>
<marker id="m-skipped" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 z" fill="#A6A6A6"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<rect width="${W}" height="8" fill="#2F5597"/>
<text x="40" y="44" font-size="26" font-weight="700" fill="#1F1F1F">Diagram Alir Analisis Data Otomatis</text>
<text x="40" y="70" font-size="14" fill="#555">${esc(ell(fc.title, 120))}</text>
${g}
</svg>`;
}