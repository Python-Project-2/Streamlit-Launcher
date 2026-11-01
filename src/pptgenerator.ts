import PptxGenJS from 'pptxgenjs';
import type { ColType, SheetResult } from './analysis';
import type { DecisionTreeNode } from './decisionTree';
import { flowChart } from './chartImages';
import { layoutFlow } from './workflow';

type Align = 'l' | 'r' | 'c';
export interface PptMeta { author: string; affiliation: string }

// ───────── tema ─────────
const C = {
    navy: '1F3864', blue: '2F5597', sky: 'EAF1FB', zebra: 'F3F6FC', line: 'D0D7E5', text: '1F1F1F', mute: '595959',
    red: 'C00000', orange: 'ED7D31', green: '70AD47', gold: 'FFC000', grey: 'A6A6A6', purple: '7030A0', white: 'FFFFFF',
};
const FONT = 'Calibri';
const W = 13.333;
const TYPE_ID: Record<ColType, string> = { number: 'Desimal', integer: 'Bulat', id: 'ID', date: 'Tanggal', boolean: 'Boolean', category: 'Kategori', text: 'Teks' };
const GRAN: Record<string, string> = { year: 'tahun', month: 'bulan', day: 'hari' };
const ALIGN = { l: 'left', r: 'right', c: 'center' } as const;

// ───────── util angka & teks ─────────
const nf = (x: number | null | undefined, d = 2): string =>
    x === null || x === undefined || !isFinite(x) ? '-' : x.toLocaleString('id-ID', { maximumFractionDigits: d });
const pct = (x: number, d = 1) => `${nf(x, d)}%`;
const cut = (s: string, n = 30) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const noEmoji = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
const and = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} dan ${a[a.length - 1]}`);
const skewWord = (s: number) => (Math.abs(s) <= 0.5 ? 'simetris' : Math.abs(s) <= 1 ? (s > 0 ? 'miring kanan sedang' : 'miring kiri sedang') : (s > 0 ? 'miring kanan kuat' : 'miring kiri kuat'));
const cvWord = (v: number) => (v < 0.15 ? 'rendah' : v < 0.35 ? 'sedang' : 'tinggi');
const strength = (r: number) => (Math.abs(r) >= 0.7 ? 'Kuat' : Math.abs(r) >= 0.4 ? 'Sedang' : 'Lemah');
const cohenWord = (r: number) => (Math.abs(r) >= 0.5 ? 'Besar' : Math.abs(r) >= 0.3 ? 'Sedang' : Math.abs(r) >= 0.1 ? 'Kecil' : 'Diabaikan');
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
const blendHex = (to: string, t: number): string => {
    const u = Math.max(0, Math.min(1, t)), r = parseInt(to.slice(0, 2), 16), g = parseInt(to.slice(2, 4), 16), b = parseInt(to.slice(4, 6), 16);
    return (hex2(255 + (r - 255) * u) + hex2(255 + (g - 255) * u) + hex2(255 + (b - 255) * u)).toUpperCase();
};

function regress(pts: [number, number][]) {
    const n = pts.length, mx = sum(pts.map((p) => p[0])) / n, my = sum(pts.map((p) => p[1])) / n;
    const sxx = sum(pts.map((p) => (p[0] - mx) ** 2)), syy = sum(pts.map((p) => (p[1] - my) ** 2)), sxy = sum(pts.map((p) => (p[0] - mx) * (p[1] - my)));
    const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx, r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0, r2 = r * r;
    const t = n > 2 && r2 < 1 ? r * Math.sqrt((n - 2) / (1 - r2)) : 0;
    return { n, a, b, r, r2, t };
}
function chiSquare(grid: number[][]) {
    const rs = grid.map((r) => sum(r)), cs = grid[0]?.map((_, j) => sum(grid.map((r) => r[j]))) ?? [], total = sum(rs);
    const ri = rs.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0), ci = cs.map((v, j) => (v > 0 ? j : -1)).filter((j) => j >= 0);
    if (total <= 0 || ri.length < 2 || ci.length < 2) { return null; }
    let chi = 0;
    for (const i of ri) { for (const j of ci) { const e = (rs[i] * cs[j]) / total; if (e > 0) { chi += (grid[i][j] - e) ** 2 / e; } } }
    const df = (ri.length - 1) * (ci.length - 1), v = Math.sqrt(chi / (total * Math.min(ri.length - 1, ci.length - 1)));
    const q = 2 / (9 * df), crit = df * (1 - q + 1.6449 * Math.sqrt(q)) ** 3;
    return { chi, df, v, crit, total, sig: chi > crit };
}
function gini(vals: number[]): number {
    const s = vals.filter((v) => v >= 0).sort((a, b) => a - b), n = s.length, tot = sum(s);
    if (n < 2 || tot <= 0) { return 0; }
    let cum = 0; s.forEach((v, i) => { cum += (i + 1) * v; });
    return (2 * cum) / (n * tot) - (n + 1) / n;
}
function treeStats(node: DecisionTreeNode, depth = 0): { leaves: number; nodes: number; depth: number } {
    if (node.isLeaf || !node.children?.length) { return { leaves: 1, nodes: 1, depth }; }
    let leaves = 0, nodes = 1, d = depth;
    for (const ch of node.children) { const s = treeStats(ch, depth + 1); leaves += s.leaves; nodes += s.nodes; d = Math.max(d, s.depth); }
    return { leaves, nodes, depth: d };
}

// ═════════════════════════════════════════════════════════════════════════════
export async function renderPptx(sheet: SheetResult, fileName: string, meta: PptMeta): Promise<Uint8Array> {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';                                   // 13,333 x 7,5 inci (16:9)
    pptx.author = meta.author;
    pptx.company = 'Date Skunder';
    pptx.title = `Analisis Data: ${fileName}`;
    pptx.subject = 'Laporan analisis data eksploratif otomatis';

    pptx.defineSlideMaster({
        title: 'CONTENT', background: { color: C.white },
        objects: [
            { rect: { x: 0, y: 0, w: W, h: 0.09, fill: { color: C.blue } } },
            { rect: { x: 0, y: 7.18, w: W, h: 0.32, fill: { color: C.zebra } } },
            { text: { text: `Date Skunder  |  ${fileName}`, options: { x: 0.5, y: 7.2, w: 9, h: 0.28, fontSize: 9, color: C.mute, fontFace: FONT, valign: 'middle' } } },
        ],
        slideNumber: { x: 12.2, y: 7.2, w: 0.65, h: 0.28, fontSize: 9, color: C.mute, fontFace: FONT, align: 'right' },
    });

    // ───────── data dasar ─────────
    const base = fileName.replace(/\.[^.]+$/, '');
    const hl = sheet.csvHealth, n = sheet.totalRows, P = sheet.headers.length;
    const numCols = sheet.columns.filter((x) => x.num);
    const catCols = sheet.columns.filter((x) => x.type === 'category');
    const dateCols = sheet.columns.filter((x) => x.type === 'date');
    const stock = sheet.stockAnalysis, needs = sheet.needsAnalysis, dt = sheet.decisionTreeAnalysis, ct = sheet.crosstab;
    const rating = hl.qualityScore >= 90 ? 'sangat baik' : hl.qualityScore >= 75 ? 'baik' : hl.qualityScore >= 50 ? 'cukup dan perlu pembersihan' : 'buruk dan perlu pembersihan menyeluruh';
    const ratingColor = hl.qualityScore >= 90 ? C.green : hl.qualityScore >= 75 ? C.blue : hl.qualityScore >= 50 ? C.orange : C.red;
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const cvOf = (x: { num?: { mean: number; std: number } }) => (x.num && x.num.mean !== 0 ? x.num.std / Math.abs(x.num.mean) : 0);
    const mostVar = [...numCols].sort((a, b) => cvOf(b) - cvOf(a))[0];
    const mostSkew = [...numCols].sort((a, b) => Math.abs(b.num!.skew) - Math.abs(a.num!.skew))[0];
    const { cols: cc, matrix } = sheet.corr;
    const pairs: { a: string; b: string; r: number }[] = [];
    for (let i = 0; i < cc.length; i++) { for (let j = i + 1; j < cc.length; j++) { const r = matrix[i][j]; if (r !== null) { pairs.push({ a: cc[i], b: cc[j], r }); } } }
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    const hasTrend = sheet.trends.length > 0 || sheet.groupBars.length > 0;
    const constCols = sheet.columns.filter((x) => x.unique === 1 && x.count > 1);

    // ───────── pembantu tampilan ─────────
    const newSlide = (title: string, sub?: string, tag?: string) => {
        const s = pptx.addSlide({ masterName: 'CONTENT' });
        s.addText(title, { x: 0.5, y: 0.26, w: tag ? 10.2 : 12.3, h: 0.6, fontSize: 26, bold: true, color: C.navy, fontFace: FONT, margin: 0, fit: 'shrink' });
        if (sub) { s.addText(sub, { x: 0.5, y: 0.86, w: 12.3, h: 0.36, fontSize: 13, color: C.mute, fontFace: FONT, margin: 0, fit: 'shrink' }); }
        if (tag) {
            s.addShape(pptx.ShapeType.roundRect, { x: 10.9, y: 0.34, w: 1.93, h: 0.36, fill: { color: C.sky }, line: { color: C.sky, width: 0 }, rectRadius: 0.18 });
            s.addText(tag.toUpperCase(), { x: 10.9, y: 0.34, w: 1.93, h: 0.36, fontSize: 10, bold: true, color: C.blue, fontFace: FONT, align: 'center', valign: 'middle', margin: 0 });
        }
        return s;
    };
    const callout = (s: PptxGenJS.Slide, text: string, color = C.blue, y = 6.3, h = 0.76) => {
        s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 12.33, h, fill: { color: C.sky }, line: { color: C.sky, width: 0 } });
        s.addShape(pptx.ShapeType.rect, { x: 0.5, y, w: 0.09, h, fill: { color }, line: { color, width: 0 } });
        s.addText(text, { x: 0.75, y, w: 11.95, h, fontSize: 13, color: C.text, fontFace: FONT, valign: 'middle', margin: 0, fit: 'shrink' });
    };
    const kpi = (s: PptxGenJS.Slide, x: number, y: number, w: number, label: string, value: string, color = C.blue, h = 1.15) => {
        s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 1 }, rectRadius: 0.08, shadow: { type: 'outer', color: '000000', opacity: 0.15, blur: 5, offset: 2, angle: 45 } });
        s.addShape(pptx.ShapeType.rect, { x, y: y + 0.1, w: 0.08, h: h - 0.2, fill: { color }, line: { color, width: 0 } });
        s.addText(value, { x: x + 0.2, y: y + 0.08, w: w - 0.3, h: h * 0.55, fontSize: 24, bold: true, color, fontFace: FONT, valign: 'middle', margin: 0, fit: 'shrink' });
        s.addText(label, { x: x + 0.2, y: y + h * 0.62, w: w - 0.3, h: h * 0.32, fontSize: 11, color: C.mute, fontFace: FONT, valign: 'top', margin: 0, fit: 'shrink' });
    };
    type Cell = { text: string; options?: Record<string, unknown> };
    const table = (s: PptxGenJS.Slide, head: string[], rows: (string | Cell)[][], o: { x: number; y: number; w: number; ratio?: number[]; align?: Align[]; fs?: number; rh?: number }) => {
        const ratio = o.ratio ?? head.map(() => 1), tot = sum(ratio);
        const hdr = head.map((h) => ({ text: h, options: { bold: true, color: C.white, fill: { color: C.blue }, align: 'center', valign: 'middle' } }));
        const body = rows.map((r, ri) => r.map((c, ci) => {
            const base = { align: ALIGN[o.align?.[ci] ?? 'l'], valign: 'middle', color: C.text, fill: { color: ri % 2 ? C.zebra : C.white } };
            return typeof c === 'string' ? { text: c, options: base } : { text: c.text, options: { ...base, ...(c.options ?? {}) } };
        }));
        s.addTable([hdr, ...body] as never, { x: o.x, y: o.y, w: o.w, colW: ratio.map((r) => (o.w * r) / tot), fontFace: FONT, fontSize: o.fs ?? 11, rowH: o.rh ?? 0.34, border: { type: 'solid', pt: 0.5, color: C.line } });
    };
    const stateCell = (txt: string, color: string): Cell => ({ text: txt, options: { bold: true, color, align: 'center' } });
    const hbar = (s: PptxGenJS.Slide, items: { label: string; value: number }[], o: { x: number; y: number; w: number; h: number; color?: string; colors?: string[]; fmt?: string; name?: string; max?: number }) => {
        const rows = items.length ? items : [{ label: '-', value: 0 }];
        const opt: Record<string, unknown> = {
            x: o.x, y: o.y, w: o.w, h: o.h, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: o.colors ?? [o.color ?? C.blue],
            showValue: true, dataLabelFontSize: 10, dataLabelFontFace: FONT, dataLabelFormatCode: o.fmt ?? '#,##0.##', showLegend: false,
            catAxisLabelFontSize: 10, catAxisLabelFontFace: FONT, valAxisHidden: true, valGridLine: { style: 'none' }, barGapWidthPct: 45,
        };
        if (o.max) { opt.valAxisMaxVal = o.max; opt.valAxisMinVal = 0; }
        s.addChart(pptx.ChartType.bar, [{ name: o.name ?? 'Nilai', labels: rows.map((r) => cut(r.label, 26)), values: rows.map((r) => r.value) }], opt as never);
    };
    const heat = (s: PptxGenJS.Slide, rowL: string[], colL: string[], m: (number | null)[][], kind: 'corr' | 'count', o: { x: number; y: number; w: number; fs?: number; rh?: number }) => {
        const maxC = Math.max(1, ...m.flat().map((v) => v ?? 0));
        const hdr = [{ text: '', options: { fill: { color: C.white } } }, ...colL.map((l) => ({ text: l, options: { bold: true, color: C.white, fill: { color: C.blue }, align: 'center', valign: 'middle' } }))];
        const body = rowL.map((rl, i) => [
            { text: rl, options: { bold: true, color: C.white, fill: { color: C.blue }, align: 'left', valign: 'middle' } },
            ...colL.map((_, j) => {
                const v = m[i]?.[j] ?? null;
                const fill = v === null ? 'E6E6E6' : kind === 'corr' ? (v >= 0 ? blendHex('C0504D', v) : blendHex('4472C4', -v)) : blendHex(C.blue, v / maxC);
                const dark = v !== null && (kind === 'corr' ? Math.abs(v) : v / maxC) > 0.55;
                return { text: v === null ? '-' : kind === 'corr' ? nf(v, 2) : nf(v, 0), options: { fill: { color: fill }, color: dark ? C.white : C.text, align: 'center', valign: 'middle' } };
            }),
        ]);
        const lw = o.w * 0.3, cw = (o.w - lw) / Math.max(1, colL.length);
        s.addTable([hdr, ...body] as never, { x: o.x, y: o.y, w: o.w, colW: [lw, ...colL.map(() => cw)], fontFace: FONT, fontSize: o.fs ?? 10, rowH: o.rh ?? 0.4, border: { type: 'solid', pt: 1, color: C.white } });
    };
    const bullets = (s: PptxGenJS.Slide, items: string[], x: number, y: number, w: number, h: number, fs = 14) => {
        s.addText(items.map((t) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 6 } })), { x, y, w, h, fontSize: fs, color: C.text, fontFace: FONT, valign: 'top', margin: 2, fit: 'shrink' });
    };
    const heading = (s: PptxGenJS.Slide, text: string, x: number, y: number, w: number) => {
        s.addText(text, { x, y, w, h: 0.32, fontSize: 14, bold: true, color: C.blue, fontFace: FONT, margin: 0 });
    };

    // ───────── agenda dinamis ─────────
    const agenda: string[] = ['Ringkasan Eksekutif', 'Gambaran Dataset', 'Kualitas Data', 'Statistik Deskriptif & Outlier'];
    if (catCols.some((x) => x.top && x.top.length)) { agenda.push('Variabel Kategorikal'); }
    agenda.push('Korelasi & Regresi');
    if (ct) { agenda.push('Asosiasi Kategorikal (Chi-kuadrat)'); }
    if (hasTrend) { agenda.push('Tren Waktu & Perbandingan Kelompok'); }
    if (stock) { agenda.push('Analisis Persediaan & Pengadaan'); }
    if (dt) { agenda.push('Klasifikasi Decision Tree C4.5'); }
    agenda.push('Alur Analisis (Workflow)', 'Kesimpulan, Rekomendasi & Keterbatasan');

    // ═════════ 1. SAMPUL ═════════
    {
        const s = pptx.addSlide();
        s.background = { color: C.navy };
        s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: C.orange }, line: { color: C.orange, width: 0 } });
        s.addText('LAPORAN ANALISIS DATA EKSPLORATIF', { x: 1, y: 1.35, w: 11.3, h: 0.4, fontSize: 16, bold: true, color: 'BFD0EE', fontFace: FONT, charSpacing: 4, margin: 0 });
        s.addText(base, { x: 1, y: 1.9, w: 11.3, h: 1.5, fontSize: 46, bold: true, color: C.white, fontFace: FONT, margin: 0, valign: 'middle', fit: 'shrink' });
        s.addText(`Statistik, kualitas data, korelasi dan regresi${stock ? ', persediaan ABC' : ''}${dt ? ', klasifikasi C4.5' : ''}`, { x: 1, y: 3.45, w: 11.3, h: 0.5, fontSize: 18, color: 'DCE6F7', fontFace: FONT, margin: 0 });
        s.addShape(pptx.ShapeType.line, { x: 1, y: 4.25, w: 3.2, h: 0, line: { color: C.orange, width: 3 } });
        const chips: [string, string][] = [[nf(n, 0), 'baris'], [String(P), 'kolom'], [`${hl.qualityScore}%`, 'skor kualitas data']];
        chips.forEach(([v, l], i) => {
            s.addText(v, { x: 1 + i * 2.9, y: 4.5, w: 2.7, h: 0.7, fontSize: 34, bold: true, color: C.white, fontFace: FONT, margin: 0 });
            s.addText(l, { x: 1 + i * 2.9, y: 5.18, w: 2.7, h: 0.35, fontSize: 13, color: 'BFD0EE', fontFace: FONT, margin: 0 });
        });
        s.addText(`${meta.author}${meta.affiliation ? '  |  ' + meta.affiliation : ''}`, { x: 1, y: 6.25, w: 11, h: 0.35, fontSize: 14, color: C.white, fontFace: FONT, margin: 0 });
        s.addText(`Sumber: ${fileName}  |  Lembar: ${sheet.name}  |  ${dateStr}`, { x: 1, y: 6.62, w: 11, h: 0.35, fontSize: 12, color: 'BFD0EE', fontFace: FONT, margin: 0 });
        s.addNotes(`Pembuka. Presentasi ini dihasilkan otomatis oleh ekstensi Date Skunder dari berkas "${fileName}" (lembar "${sheet.name}"). Dataset memiliki ${nf(n, 0)} baris dan ${P} kolom dengan skor kualitas data ${hl.qualityScore}% (${rating}). Seluruh angka, grafik, dan tabel dihitung langsung dari data sehingga dapat direproduksi. Tiap slide berisi ringkasan visual; penjelasan lengkap ada pada catatan pembicara.`);
    }

    // ═════════ 2. AGENDA ═════════
    {
        const s = newSlide('Agenda Presentasi', 'Urutan pembahasan disesuaikan dengan jenis data yang terdeteksi');
        const half = Math.ceil(agenda.length / 2);
        [agenda.slice(0, half), agenda.slice(half)].forEach((col, ci) => {
            col.forEach((t, i) => {
                const y = 1.55 + i * 0.88, x = 0.6 + ci * 6.25, no = ci * half + i + 1;
                s.addShape(pptx.ShapeType.ellipse, { x, y, w: 0.6, h: 0.6, fill: { color: C.blue }, line: { color: C.blue, width: 0 } });
                s.addText(String(no), { x, y, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: C.white, fontFace: FONT, align: 'center', valign: 'middle', margin: 0 });
                s.addText(t, { x: x + 0.8, y, w: 5.2, h: 0.6, fontSize: 18, color: C.text, fontFace: FONT, valign: 'middle', margin: 0, fit: 'shrink' });
            });
        });
        s.addNotes(`Agenda memuat ${agenda.length} bagian. Bagian yang tidak relevan dengan data (misalnya persediaan atau Decision Tree) otomatis tidak ditampilkan. Alur umumnya: memahami data, menilai kualitas, mengeksplorasi statistik, mencari hubungan antarvariabel, lalu menyimpulkan dan merekomendasikan tindakan.`);
    }

    // ═════════ 3. RINGKASAN EKSEKUTIF ═════════
    {
        const s = newSlide('Ringkasan Eksekutif', 'Gambaran cepat kondisi data dan temuan terpenting', 'Ringkasan');
        const k: [string, string, string][] = [
            ['Jumlah baris', nf(n, 0), C.blue], ['Jumlah kolom', String(P), C.blue],
            ['Skor kualitas data', `${hl.qualityScore}%`, ratingColor], ['Sel kosong / baris duplikat', `${nf(hl.missingCells, 0)} / ${nf(hl.duplicateRows, 0)}`, hl.missingCells + hl.duplicateRows > 0 ? C.orange : C.green],
        ];
        k.forEach(([l, v, col], i) => kpi(s, 0.5 + i * 3.13, 1.4, 2.95, l, v, col));
        heading(s, 'Temuan utama', 0.5, 2.75, 6);
        const key: string[] = [`Kualitas data ${rating} (skor ${hl.qualityScore}%): ${nf(hl.missingCells, 0)} sel kosong, ${nf(hl.duplicateRows, 0)} baris duplikat, ${hl.outlierColsCount} kolom beroutlier.`];
        key.push(`Komposisi kolom: ${numCols.length} numerik, ${catCols.length} kategorikal, ${dateCols.length} tanggal.`);
        if (mostVar) { key.push(`Variabel paling beragam: "${mostVar.name}" (CV = ${nf(cvOf(mostVar), 2)}, ${cvWord(cvOf(mostVar))}).`); }
        if (pairs.length) { key.push(`Korelasi terkuat: "${pairs[0].a}" dan "${pairs[0].b}" (r = ${nf(pairs[0].r, 3)}, ${strength(pairs[0].r).toLowerCase()}).`); }
        if (stock) { key.push(`Persediaan: ${stock.kpis.criticalCount} item kritis dan ${stock.kpis.overstockCount} item overstock dari ${nf(stock.kpis.totalSKUs, 0)} SKU.`); }
        if (dt) { key.push(`Decision Tree C4.5 untuk "${dt.targetAttribute}" mencapai akurasi ${pct(dt.accuracy * 100)}.`); }
        bullets(s, key, 0.5, 3.1, 12.3, 3.1, 15);
        callout(s, `Kesimpulan singkat: dataset berkualitas ${rating}. ${hl.missingCells + hl.duplicateRows + hl.outlierColsCount > 0 ? 'Bersihkan sel kosong, duplikat, dan tinjau outlier sebelum pemodelan lanjutan.' : 'Data siap dianalisis lanjut tanpa pembersihan berarti.'}`, ratingColor);
        s.addNotes(`Slide ini merangkum seluruh laporan. Dataset "${base}" berisi ${nf(n, 0)} baris dan ${P} kolom. Skor kualitas ${hl.qualityScore}% dihitung dari kelengkapan, integritas (ketiadaan duplikat), dan konsistensi kolom dengan bobot 45%, 35%, dan 20%. ${key.slice(1).join(' ')} Rincian tiap temuan dijelaskan pada slide berikutnya.`);
    }

    // ═════════ 4. GAMBARAN DATASET ═════════
    {
        const s = newSlide('Gambaran Dataset', `${nf(n, 0)} baris x ${P} kolom, ${nf(hl.populatedCells, 0)} sel terisi`, 'Dataset');
        const tc = new Map<string, number>();
        sheet.columns.forEach((c) => tc.set(TYPE_ID[c.type], (tc.get(TYPE_ID[c.type]) ?? 0) + 1));
        const ts = [...tc.entries()].sort((a, b) => b[1] - a[1]);
        heading(s, 'Komposisi tipe kolom', 0.5, 1.35, 4.6);
        s.addChart(pptx.ChartType.doughnut, [{ name: 'Tipe', labels: ts.map((x) => x[0]), values: ts.map((x) => x[1]) }], {
            x: 0.4, y: 1.7, w: 4.7, h: 4.4, holeSize: 55, showPercent: true, showValue: false, showLegend: true, legendPos: 'b', legendFontSize: 11, legendFontFace: FONT,
            dataLabelColor: C.white, dataLabelFontSize: 11, chartColors: [C.blue, C.orange, C.green, C.gold, '5B9BD5', C.grey, C.purple],
        } as never);
        heading(s, `Profil kolom${P > 10 ? ' (10 kolom pertama)' : ''}`, 5.4, 1.35, 7);
        table(s, ['Kolom', 'Tipe', 'Terisi', 'Hilang (%)', 'Unik'],
            sheet.columns.slice(0, 10).map((x) => [cut(x.name, 22), TYPE_ID[x.type], nf(x.count, 0), nf((x.missing / Math.max(1, x.missing + x.count)) * 100, 1), nf(x.unique, 0)]),
            { x: 5.4, y: 1.7, w: 7.43, ratio: [3, 1.5, 1.3, 1.5, 1.2], align: ['l', 'c', 'r', 'r', 'r'], fs: 11, rh: 0.37 });
        const extra = [constCols.length ? `${constCols.length} kolom konstan (${and(constCols.slice(0, 3).map((x) => `"${x.name}"`))})` : '', ...dateCols.slice(0, 1).map((d) => `kolom tanggal "${d.name}" ${d.dateMin} s.d. ${d.dateMax}`)].filter(Boolean);
        callout(s, `Tipe kolom dominan: ${ts[0][0].toLowerCase()} (${ts[0][1]} dari ${P} kolom).${extra.length ? ' Catatan: ' + extra.join('; ') + '.' : ''}`);
        s.addNotes(`Tipe kolom ditentukan otomatis dari isinya: angka (bulat/desimal), tanggal, boolean, kategori (sedikit nilai unik), teks, dan ID. Kolom ID dikecualikan dari analisis numerik karena nilainya hanya pengenal. Pada dataset ini tipe terbanyak adalah ${ts[0][0].toLowerCase()}. ${constCols.length ? 'Kolom konstan tidak informatif sehingga sebaiknya dibuang dari analisis. ' : ''}Tabel di kanan menunjukkan profil kolom: jumlah terisi, persentase data hilang, dan banyaknya nilai unik.`);
    }

    // ═════════ 5. KUALITAS DATA (SKOR) ═════════
    {
        const s = newSlide('Kualitas Data: Perhitungan Skor', 'Tiga komponen digabung menjadi satu skor terukur', 'Kualitas');
        const rowsF: [string, string, string][] = [
            ['Kelengkapan', `(${nf(hl.populatedCells, 0)} / ${nf(hl.totalCells, 0)}) x 100%`, pct(hl.completenessScore)],
            ['Integritas', `(1 - ${nf(hl.duplicateRows, 0)} / ${nf(n, 0)}) x 100%`, pct(hl.integrityScore)],
            ['Konsistensi', 'kolom dengan data hilang < 50% / jumlah kolom', pct(hl.consistencyScore)],
            ['SKOR KUALITAS', `0,45 x ${nf(hl.completenessScore, 1)} + 0,35 x ${nf(hl.integrityScore, 1)} + 0,20 x ${nf(hl.consistencyScore, 1)}`, `${hl.qualityScore}%`],
        ];
        rowsF.forEach(([l, f, v], i) => {
            const y = 1.45 + i * 1.12, last = i === 3, col = last ? ratingColor : C.blue;
            s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y, w: 6.4, h: 0.98, fill: { color: last ? C.sky : C.white }, line: { color: last ? col : C.line, width: last ? 2 : 1 }, rectRadius: 0.08 });
            s.addText(l, { x: 0.7, y: y + 0.08, w: 3.6, h: 0.35, fontSize: 14, bold: true, color: col, fontFace: FONT, margin: 0 });
            s.addText(f, { x: 0.7, y: y + 0.45, w: 4.6, h: 0.42, fontSize: 11, color: C.mute, fontFace: FONT, margin: 0, fit: 'shrink' });
            s.addText(v, { x: 5.2, y, w: 1.6, h: 0.98, fontSize: 24, bold: true, color: col, fontFace: FONT, align: 'right', valign: 'middle', margin: 0 });
        });
        heading(s, 'Perbandingan komponen (%)', 7.3, 1.35, 5.5);
        hbar(s, [{ label: 'Kelengkapan', value: hl.completenessScore }, { label: 'Integritas', value: hl.integrityScore }, { label: 'Konsistensi', value: hl.consistencyScore }, { label: 'Skor akhir', value: hl.qualityScore }],
            { x: 7.2, y: 1.7, w: 5.6, h: 4.3, colors: [C.blue, C.blue, C.blue, ratingColor], fmt: '0.0', max: 100 });
        const low = [{ l: 'kelengkapan', v: hl.completenessScore }, { l: 'integritas', v: hl.integrityScore }, { l: 'konsistensi', v: hl.consistencyScore }].sort((a, b) => a.v - b.v)[0];
        callout(s, `Skor ${hl.qualityScore}% = kualitas ${rating}. Komponen terendah: ${low.l} (${nf(low.v, 1)}%), sehingga menjadi prioritas perbaikan.`, ratingColor);
        s.addNotes(`Kualitas data dipandang sebagai kelayakan data untuk digunakan. Kelengkapan mengukur proporsi sel terisi; integritas mengukur ketiadaan baris ganda; konsistensi mengukur berapa banyak kolom yang datanya tidak terlalu banyak hilang. Skor akhir = 0,45 x kelengkapan + 0,35 x integritas + 0,20 x konsistensi = ${hl.qualityScore}%. Rentang interpretasi: >= 90% sangat baik, 75-89% baik, 50-74% perlu pembersihan, < 50% buruk. Komponen terendah adalah ${low.l} sebesar ${nf(low.v, 1)}%.`);
    }

    // ═════════ 6. CHECKLIST & DATA HILANG ═════════
    {
        const s = newSlide('Pemeriksaan Kualitas & Data Hilang', 'Aspek berstatus Perhatian atau Kritis menjadi prioritas perbaikan', 'Kualitas');
        const st = { pass: ['Baik', C.green], warn: ['Perhatian', C.orange], fail: ['Kritis', C.red] } as const;
        heading(s, 'Hasil pemeriksaan', 0.5, 1.35, 7);
        table(s, ['Aspek', 'Status', 'Keterangan'], hl.checklist.map((x) => [cut(x.category, 30), stateCell(st[x.status][0], st[x.status][1]), cut(noEmoji(x.detail), 70)]),
            { x: 0.5, y: 1.7, w: 7.6, ratio: [2.6, 1.2, 4.6], align: ['l', 'c', 'l'], fs: 11, rh: 0.62 });
        const miss = sheet.columns.filter((x) => x.missing > 0).map((x) => ({ label: x.name, value: (x.missing / Math.max(1, x.missing + x.count)) * 100 })).sort((a, b) => b.value - a.value).slice(0, 8);
        heading(s, 'Data hilang per kolom (%)', 8.4, 1.35, 4.4);
        if (miss.length) { hbar(s, miss, { x: 8.3, y: 1.7, w: 4.55, h: 4.3, color: C.orange, fmt: '0.0', max: 100 }); }
        else {
            s.addShape(pptx.ShapeType.roundRect, { x: 8.4, y: 1.8, w: 4.4, h: 2.2, fill: { color: 'E8F5E1' }, line: { color: C.green, width: 1.5 }, rectRadius: 0.1 });
            s.addText('Tidak ada data hilang\nImputasi tidak diperlukan', { x: 8.4, y: 1.8, w: 4.4, h: 2.2, fontSize: 16, bold: true, color: '3B7D1E', fontFace: FONT, align: 'center', valign: 'middle' });
        }
        const rec = hl.cleaningRecommendations.map(noEmoji);
        callout(s, `Rekomendasi: ${rec.join(' ')}`, C.orange);
        s.addNotes(`Pemeriksaan mencakup lima aspek: kelengkapan nilai, duplikasi baris, konsistensi tipe data, outlier numerik, dan kerapatan data. ${miss.length ? `Kolom dengan data hilang tertinggi adalah "${miss[0].label}" (${nf(miss[0].value, 1)}%). Mekanisme hilangnya data (acak atau tidak) perlu ditelusuri sebelum memilih imputasi atau penghapusan (Rubin, 1976; Schafer & Graham, 2002).` : 'Tidak ada sel kosong sehingga tidak perlu imputasi.'} Rekomendasi pembersihan: ${rec.join(' ')}`);
    }

    // ═════════ 7. STATISTIK DESKRIPTIF ═════════
    if (numCols.length) {
        const s = newSlide('Statistik Deskriptif', `Ringkasan variabel numerik${numCols.length > 9 ? ' (9 variabel pertama)' : ''}`, 'Statistik');
        table(s, ['Variabel', 'Rata-rata', 'Median', 'Std', 'Min', 'Q1', 'Q3', 'Maks', 'CV', 'Bentuk sebaran'],
            numCols.slice(0, 9).map((x) => [cut(x.name, 20), nf(x.num!.mean), nf(x.num!.median), nf(x.num!.std), nf(x.num!.min), nf(x.num!.q1), nf(x.num!.q3), nf(x.num!.max), nf(cvOf(x), 2), skewWord(x.num!.skew)]),
            { x: 0.5, y: 1.4, w: 12.33, ratio: [2.6, 1.3, 1.2, 1.2, 1.1, 1.1, 1.1, 1.2, 0.9, 2.3], align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'l'], fs: 11, rh: 0.4 });
        callout(s, `"${mostVar.name}" paling beragam (CV ${nf(cvOf(mostVar), 2)}, ${cvWord(cvOf(mostVar))}); sebaran paling tidak simetris pada "${mostSkew.name}" (skewness ${nf(mostSkew.num!.skew)}, ${skewWord(mostSkew.num!.skew)}). Pada CV tinggi atau sebaran miring, median lebih tepat daripada rata-rata.`);
        s.addNotes(`Statistik deskriptif meliputi rata-rata, median, simpangan baku (Std), kuartil (Q1, Q3), minimum, dan maksimum. Koefisien variasi CV = Std / |rata-rata| membandingkan keragaman antarvariabel berskala berbeda: < 0,15 rendah, 0,15-0,35 sedang, > 0,35 tinggi. Skewness mengukur kemiringan: |s| <= 0,5 simetris, 0,5-1 miring sedang, > 1 miring kuat. Selisih besar antara rata-rata dan median menandakan adanya nilai ekstrem yang menarik rata-rata. Variabel paling beragam: "${mostVar.name}" dengan CV ${nf(cvOf(mostVar), 2)}.`);

        // histogram
        for (const x of numCols.filter((c) => c.num!.hist.counts.length > 1).slice(0, 2)) {
            const sl = newSlide(`Distribusi: ${cut(x.name, 40)}`, 'Histogram frekuensi (aturan Sturges)', 'Statistik');
            const hs = x.num!.hist, step = Math.max(1, Math.ceil(hs.counts.length / 10)), labels: string[] = [], vals: number[] = [];
            for (let i = 0; i < hs.counts.length; i += step) {
                vals.push(hs.counts.slice(i, i + step).reduce((a, b) => a + b, 0));
                labels.push(`${hs.labels[i].split(' – ')[0]} - ${(hs.labels[Math.min(i + step, hs.counts.length) - 1].split(' – ').pop() ?? '')}`);
            }
            sl.addChart(pptx.ChartType.bar, [{ name: 'Frekuensi', labels, values: vals }], {
                x: 0.4, y: 1.35, w: 8.5, h: 4.8, barDir: 'col', chartColors: [C.blue], showValue: true, dataLabelFontSize: 9, showLegend: false, catAxisLabelFontSize: 9, catAxisLabelRotate: 315,
                valAxisLabelFontSize: 9, valGridLine: { color: 'E3E3E3', size: 0.5 }, barGapWidthPct: 12, showValAxisTitle: true, valAxisTitle: 'Frekuensi', valAxisTitleFontSize: 10,
            } as never);
            const st = x.num!;
            [['Rata-rata', nf(st.mean), C.blue], ['Median', nf(st.median), C.blue], ['Skewness', `${nf(st.skew)} (${skewWord(st.skew)})`, C.orange], ['Rentang Q1 - Q3', `${nf(st.q1)} - ${nf(st.q3)}`, C.green]].forEach(([l, v, col], i) =>
                kpi(sl, 9.2, 1.4 + i * 1.18, 3.63, l, v, col, 1.05));
            callout(sl, `Rata-rata ${nf(st.mean)} dan median ${nf(st.median)}: sebaran ${skewWord(st.skew)}. ${Math.abs(st.mean - st.median) > 0.1 * Math.abs(st.median || 1) ? 'Selisih rata-rata dan median cukup besar, indikasi nilai ekstrem.' : 'Rata-rata dan median berdekatan.'}`);
            sl.addNotes(`Histogram variabel "${x.name}" menunjukkan sebaran nilai dalam interval berurutan. Rata-rata ${nf(st.mean)}, median ${nf(st.median)}, skewness ${nf(st.skew)} sehingga bentuk sebaran ${skewWord(st.skew)}. Setengah data berada pada rentang antarkuartil ${nf(st.q1)} sampai ${nf(st.q3)}. Bentuk sebaran menentukan ukuran pemusatan yang layak dipakai dan perlu tidaknya transformasi sebelum pemodelan.`);
        }

        // outlier
        {
            const out = numCols.filter((c) => c.num!.outliers > 0).sort((a, b) => b.num!.outliers / Math.max(1, b.count) - a.num!.outliers / Math.max(1, a.count)).slice(0, 8);
            const sl = newSlide('Deteksi Outlier', 'Aturan IQR: di luar Q1 - 1,5 x IQR atau Q3 + 1,5 x IQR', 'Statistik');
            if (out.length) {
                heading(sl, 'Persentase outlier per variabel', 0.5, 1.35, 5.5);
                hbar(sl, out.map((x) => ({ label: x.name, value: (x.num!.outliers / Math.max(1, x.count)) * 100 })), { x: 0.4, y: 1.7, w: 5.6, h: 4.4, color: C.red, fmt: '0.0' });
                heading(sl, 'Batas dan jumlah pencilan', 6.3, 1.35, 6);
                table(sl, ['Variabel', 'Batas bawah', 'Batas atas', 'Outlier', '%'], out.map((x) => [cut(x.name, 18), nf(x.num!.lower), nf(x.num!.upper), nf(x.num!.outliers, 0), nf((x.num!.outliers / Math.max(1, x.count)) * 100, 1)]),
                    { x: 6.3, y: 1.7, w: 6.53, ratio: [2.4, 1.5, 1.5, 1.1, 0.9], align: ['l', 'r', 'r', 'r', 'r'], fs: 11, rh: 0.42 });
                callout(sl, `"${out[0].name}" memiliki pencilan terbanyak: ${nf(out[0].num!.outliers, 0)} nilai (${pct((out[0].num!.outliers / Math.max(1, out[0].count)) * 100)}). Telaah dulu: salah catat atau nilai ekstrem valid? Hindari penghapusan otomatis.`, C.red);
            } else {
                sl.addShape(pptx.ShapeType.roundRect, { x: 2.5, y: 2.1, w: 8.3, h: 2.4, fill: { color: 'E8F5E1' }, line: { color: C.green, width: 1.5 }, rectRadius: 0.1 });
                sl.addText('Tidak ditemukan outlier berdasarkan aturan IQR', { x: 2.5, y: 2.1, w: 8.3, h: 2.4, fontSize: 20, bold: true, color: '3B7D1E', fontFace: FONT, align: 'center', valign: 'middle' });
                callout(sl, 'Tidak diperlukan penanganan nilai ekstrem pada variabel numerik dataset ini.', C.green);
            }
            sl.addNotes(out.length ? `Outlier dideteksi dengan aturan rentang interkuartil (Tukey, 1977): nilai di bawah Q1 - 1,5 x IQR atau di atas Q3 + 1,5 x IQR dianggap pencilan. Variabel "${out[0].name}" paling terdampak (${nf(out[0].num!.outliers, 0)} nilai). Pada data yang sangat miring, banyak nilai valid dapat terdeteksi sebagai pencilan, jadi tiap kasus perlu diverifikasi (Hodge & Austin, 2004).` : 'Aturan IQR tidak menemukan pencilan. Ini menunjukkan sebaran nilai yang relatif terkendali.');
        }
    }

    // ═════════ 8. KATEGORIKAL ═════════
    {
        const cats = catCols.filter((x) => x.top && x.top.length).slice(0, 2);
        if (cats.length) {
            const s = newSlide('Variabel Kategorikal', 'Frekuensi nilai teratas pada kolom kategori', 'Kategorikal');
            cats.forEach((x, i) => {
                const xx = 0.5 + i * 6.25, w = cats.length === 1 ? 12.3 : 6.0;
                heading(s, `${cut(x.name, 30)} (${nf(x.unique, 0)} kategori)`, xx, 1.35, w);
                hbar(s, x.top!.slice(0, 7).map((v) => ({ label: v.value, value: v.count })), { x: xx - 0.1, y: 1.7, w: w + 0.1, h: 4.4, color: i ? C.orange : C.blue, fmt: '#,##0' });
            });
            const t0 = cats[0], top = t0.top![0];
            callout(s, `Pada "${t0.name}", nilai "${cut(top.value, 30)}" paling dominan (${pct((top.count / Math.max(1, t0.count)) * 100)}).${cats[1] ? ` Pada "${cats[1].name}": "${cut(cats[1].top![0].value, 24)}" (${pct((cats[1].top![0].count / Math.max(1, cats[1].count)) * 100)}).` : ''} Proporsi teratas yang besar berarti sebaran kategori timpang.`);
            s.addNotes(`Grafik menunjukkan frekuensi nilai-nilai teratas dari setiap variabel kategorikal. Variabel "${t0.name}" memiliki ${nf(t0.unique, 0)} kategori unik, dengan nilai dominan "${top.value}" sebesar ${pct((top.count / Math.max(1, t0.count)) * 100)}. Sebaran yang sangat timpang perlu diperhatikan pada klasifikasi karena dapat menimbulkan bias terhadap kelas mayoritas.`);
        }
    }

    // ═════════ 9. KORELASI & REGRESI ═════════
    {
        const s = newSlide('Analisis Korelasi Pearson', 'Kekuatan hubungan linear antarvariabel numerik (-1 sampai 1)', 'Korelasi');
        if (cc.length >= 2 && pairs.length) {
            const k = Math.min(cc.length, 8);
            heading(s, `Peta panas korelasi${cc.length > k ? ` (${k} variabel pertama)` : ''}`, 0.5, 1.35, 6.4);
            heat(s, cc.slice(0, k).map((x, i) => `${i + 1}. ${cut(x, 12)}`), cc.slice(0, k).map((_, i) => String(i + 1)), matrix.slice(0, k).map((r) => r.slice(0, k)), 'corr', { x: 0.5, y: 1.7, w: 6.4, fs: 10, rh: 0.5 });
            heading(s, 'Pasangan terkuat', 7.2, 1.35, 5.6);
            table(s, ['Variabel X', 'Variabel Y', 'r', 'Kekuatan', 'Efek'], pairs.slice(0, 7).map((p) => [cut(p.a, 14), cut(p.b, 14), nf(p.r, 3), strength(p.r), cohenWord(p.r)]),
                { x: 7.2, y: 1.7, w: 5.63, ratio: [2, 2, 1, 1.3, 1.3], align: ['l', 'l', 'r', 'c', 'c'], fs: 11, rh: 0.45 });
            const strong = pairs.filter((p) => Math.abs(p.r) >= 0.7).length, mid = pairs.filter((p) => Math.abs(p.r) >= 0.4 && Math.abs(p.r) < 0.7).length;
            callout(s, `Dari ${pairs.length} pasangan: ${strong} kuat dan ${mid} sedang. Terkuat "${pairs[0].a}" - "${pairs[0].b}" (r = ${nf(pairs[0].r, 3)}; r2 = ${nf(pairs[0].r ** 2, 3)}). Korelasi bukan bukti sebab-akibat.`);
            s.addNotes(`Korelasi Pearson r mengukur kekuatan hubungan linear. Kategori yang dipakai: |r| >= 0,7 kuat, 0,4 sampai < 0,7 sedang, < 0,4 lemah; ukuran efek Cohen (1988): 0,1 kecil, 0,3 sedang, 0,5 besar. Warna merah pada peta panas menandakan korelasi positif dan biru negatif; makin pekat makin kuat. Pasangan terkuat adalah "${pairs[0].a}" dan "${pairs[0].b}" dengan r = ${nf(pairs[0].r, 3)}, artinya sekitar ${pct(pairs[0].r ** 2 * 100)} keragaman satu variabel berkaitan linear dengan yang lain. ${strong > 0 ? 'Pasangan berkorelasi kuat berpotensi menimbulkan multikolinearitas sehingga seleksi fitur diperlukan.' : ''}`);

            // regresi
            const sc = sheet.scatters.filter((x) => x.points.length >= 3).slice(0, 3);
            if (sc.length) {
                const sl = newSlide('Regresi Linear Sederhana', `Y = a + bX, contoh pasangan: ${cut(sc[0].x, 24)} terhadap ${cut(sc[0].y, 24)}`, 'Korelasi');
                const pts = sc[0].points;
                sl.addChart(pptx.ChartType.scatter, [{ name: 'X', values: pts.map((p) => p[0]) }, { name: sc[0].y, values: pts.map((p) => p[1]) }], {
                    x: 0.4, y: 1.35, w: 6.7, h: 4.8, lineSize: 0, lineDataSymbolSize: 5, chartColors: [C.blue], showLegend: false,
                    showCatAxisTitle: true, catAxisTitle: cut(sc[0].x, 30), catAxisTitleFontSize: 11, showValAxisTitle: true, valAxisTitle: cut(sc[0].y, 30), valAxisTitleFontSize: 11,
                    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, valGridLine: { color: 'E3E3E3', size: 0.5 },
                } as never);
                const regs = sc.map((x) => ({ x, g: regress(x.points) }));
                heading(sl, 'Parameter regresi', 7.4, 1.35, 5.4);
                table(sl, ['Model (X > Y)', 'a', 'b', 'R2', 't', 'Sig.'], regs.map(({ x, g }) => [`${cut(x.x, 9)} > ${cut(x.y, 9)}`, nf(g.a, 3), nf(g.b, 4), nf(g.r2, 3), nf(g.t, 2), Math.abs(g.t) > 1.96 ? 'Ya' : 'Tidak']),
                    { x: 7.4, y: 1.7, w: 5.43, ratio: [3, 1.2, 1.3, 1.1, 1.1, 0.9], align: ['l', 'r', 'r', 'r', 'r', 'c'], fs: 10.5, rh: 0.5 });
                const g0 = regs[0].g;
                sl.addShape(pptx.ShapeType.roundRect, { x: 7.4, y: 3.9, w: 5.43, h: 1.5, fill: { color: C.sky }, line: { color: C.blue, width: 1 }, rectRadius: 0.08 });
                sl.addText([{ text: 'Persamaan model pertama', options: { bold: true, color: C.blue, breakLine: true } }, { text: `Y = ${nf(g0.a, 3)} ${g0.b >= 0 ? '+' : '-'} ${nf(Math.abs(g0.b), 4)} X`, options: { fontSize: 18, bold: true, color: C.text, breakLine: true } }, { text: `R2 = ${nf(g0.r2, 3)}  |  n = ${nf(g0.n, 0)} titik sampel`, options: { color: C.mute } }], { x: 7.6, y: 3.95, w: 5.1, h: 1.4, fontSize: 12, fontFace: FONT, valign: 'middle', margin: 0 });
                callout(sl, `Setiap kenaikan 1 satuan "${sc[0].x}" berasosiasi dengan perubahan ${nf(g0.b, 4)} pada "${sc[0].y}". |t| > 1,96 berarti kemiringan berbeda nyata dari nol (5%), namun besar efek tetap penting.`);
                sl.addNotes(`Regresi linear sederhana menaksir garis kecenderungan Y = a + bX dengan b = Sxy/Sxx dan a = rata-rata Y - b x rata-rata X. R2 adalah porsi keragaman Y yang dijelaskan X. Statistik t = r x akar((n-2)/(1-r2)); bila |t| melebihi sekitar 1,96 kemiringan signifikan pada taraf 5%. Parameter dihitung dari sampel maksimum sekitar 600 titik per pasangan sehingga bersifat indikatif. Model linear hanya menangkap pola lurus; pola lengkung atau pengaruh variabel ketiga perlu analisis lanjutan (Montgomery dkk., 2021).`);
            }
        } else {
            callout(s, 'Jumlah variabel numerik yang memenuhi syarat tidak cukup untuk menghitung korelasi.', C.orange, 3, 1);
            s.addNotes('Korelasi memerlukan minimal dua variabel numerik dengan variasi nilai.');
        }
    }

    // ═════════ 10. CHI-KUADRAT ═════════
    if (ct) {
        const s = newSlide('Asosiasi Variabel Kategorikal', `Tabulasi silang "${cut(ct.a, 24)}" x "${cut(ct.b, 24)}" dan uji chi-kuadrat`, 'Asosiasi');
        const grid = ct.series.map((x) => x.data), chi = chiSquare(grid);
        heading(s, 'Tabulasi silang (frekuensi)', 0.5, 1.35, 7);
        heat(s, ct.series.map((x) => cut(x.name, 12)), ct.labels.map((l) => cut(l, 8)), grid, 'count', { x: 0.5, y: 1.7, w: 7.3, fs: 10, rh: 0.5 });
        if (chi) {
            heading(s, 'Hasil uji independensi', 8.1, 1.35, 4.7);
            table(s, ['Statistik', 'Nilai'], [['Chi-kuadrat', nf(chi.chi, 2)], ['Derajat bebas', nf(chi.df, 0)], ['Nilai kritis (5%)', nf(chi.crit, 2)], ['V Cramer', nf(chi.v, 3)], ['Pengamatan', nf(chi.total, 0)], ['Keputusan', stateCell(chi.sig ? 'Tolak H0' : 'Gagal tolak H0', chi.sig ? C.red : C.green)]],
                { x: 8.1, y: 1.7, w: 4.73, ratio: [2.2, 1.6], align: ['l', 'r'], fs: 12, rh: 0.46 });
            callout(s, `Chi-kuadrat ${nf(chi.chi, 2)} ${chi.sig ? 'melampaui' : 'tidak melampaui'} nilai kritis ${nf(chi.crit, 2)} (db ${chi.df}): ${chi.sig ? 'ada bukti keterkaitan' : 'tidak cukup bukti keterkaitan'} kedua variabel. V Cramer ${nf(chi.v, 3)} = asosiasi ${chi.v >= 0.3 ? 'kuat' : chi.v >= 0.1 ? 'lemah hingga sedang' : 'sangat lemah'}.`, chi.sig ? C.red : C.green);
            s.addNotes(`Uji chi-kuadrat Pearson membandingkan frekuensi teramati (O) dengan harapan (E = total baris x total kolom / N) di bawah hipotesis independensi: chi = jumlah (O-E)^2/E. Nilai kritis dihampiri dengan transformasi Wilson-Hilferty pada alpha 5%. Hasil: chi = ${nf(chi.chi, 2)}, db = ${chi.df}, kritis = ${nf(chi.crit, 2)}, V Cramer = ${nf(chi.v, 3)}. Uji dilakukan pada kategori dengan frekuensi tertinggi saja sehingga bersifat pendekatan.`);
        } else { callout(s, 'Tabulasi silang tidak memiliki cukup baris dan kolom berisi untuk uji chi-kuadrat.', C.orange); }
    }

    // ═════════ 11. TREN & KELOMPOK ═════════
    for (const tr of sheet.trends.slice(0, 2)) {
        const s = newSlide(`Tren: ${cut(tr.num, 36)}`, `Rata-rata per ${GRAN[tr.gran] ?? tr.gran} berdasarkan kolom "${cut(tr.date, 24)}"`, 'Tren');
        const nT = tr.values.length, mI = (nT - 1) / 2, mV = sum(tr.values) / nT;
        let sxx = 0, sxy = 0, syy = 0;
        tr.values.forEach((v, i) => { sxx += (i - mI) ** 2; sxy += (i - mI) * (v - mV); syy += (v - mV) ** 2; });
        const slope = sxx > 0 ? sxy / sxx : 0, r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0, first = tr.values[0], last = tr.values[nT - 1];
        const mx = Math.max(...tr.values), mn = Math.min(...tr.values);
        s.addChart(pptx.ChartType.line, [{ name: tr.num, labels: tr.labels, values: tr.values }], {
            x: 0.4, y: 1.35, w: 8.3, h: 4.8, chartColors: [C.blue], lineSize: 2.5, lineDataSymbolSize: nT <= 40 ? 7 : 0, showLegend: false, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
            catAxisLabelRotate: nT > 10 ? 315 : 0, valGridLine: { color: 'E3E3E3', size: 0.5 },
        } as never);
        table(s, ['Ukuran', 'Nilai'], [['Periode', nf(nT, 0)], ['Nilai awal', nf(first)], ['Nilai akhir', nf(last)], ['Minimum', `${nf(mn)} (${cut(tr.labels[tr.values.indexOf(mn)], 10)})`], ['Maksimum', `${nf(mx)} (${cut(tr.labels[tr.values.indexOf(mx)], 10)})`], ['Kemiringan', nf(slope, 4)], ['R2 tren', nf(r2, 3)]],
            { x: 9, y: 1.45, w: 3.83, ratio: [1.5, 2], align: ['l', 'r'], fs: 11, rh: 0.5 });
        callout(s, `Nilai ${last >= first ? 'meningkat' : 'menurun'} dari ${nf(first)} (${tr.labels[0]}) ke ${nf(last)} (${tr.labels[nT - 1]})${first !== 0 ? `, ${pct((Math.abs(last - first) / Math.abs(first)) * 100)}` : ''}. Tren ${r2 >= 0.5 ? 'cukup jelas' : 'lemah, didominasi fluktuasi'} (R2 ${nf(r2, 3)}).`);
        s.addNotes(`Grafik garis menampilkan rata-rata "${tr.num}" per ${GRAN[tr.gran] ?? tr.gran}. Garis tren linear memiliki kemiringan ${nf(slope, 4)} per periode dengan R2 = ${nf(r2, 3)}; R2 >= 0,5 dianggap tren cukup jelas. Nilai tertinggi ${nf(mx)} pada ${tr.labels[tr.values.indexOf(mx)]} dan terendah ${nf(mn)} pada ${tr.labels[tr.values.indexOf(mn)]}. Pola temporal berguna untuk perencanaan, misalnya penjadwalan pengadaan atau pemantauan berkala.`);
    }
    for (const gb of sheet.groupBars.slice(0, 1)) {
        if (!gb.labels.length) { continue; }
        const s = newSlide(`Perbandingan Kelompok: ${cut(gb.num, 24)}`, `Rata-rata menurut "${cut(gb.cat, 28)}"`, 'Kelompok');
        const nT = sum(gb.counts), grand = nT > 0 ? sum(gb.means.map((m, i) => m * gb.counts[i])) / nT : 0, lo = gb.means[gb.means.length - 1];
        hbar(s, gb.labels.slice(0, 8).map((l, i) => ({ label: l, value: gb.means[i] })), { x: 0.4, y: 1.35, w: 6.4, h: 4.8, color: C.blue });
        table(s, ['Kelompok', 'Rata-rata', 'Jumlah', 'Selisih (%)'], gb.labels.slice(0, 8).map((l, i) => [cut(l, 18), nf(gb.means[i]), nf(gb.counts[i], 0), grand !== 0 ? nf(((gb.means[i] - grand) / Math.abs(grand)) * 100, 1) : '-']),
            { x: 7.1, y: 1.45, w: 5.73, ratio: [2.4, 1.4, 1.2, 1.4], align: ['l', 'r', 'r', 'r'], fs: 11, rh: 0.46 });
        callout(s, `"${cut(gb.labels[0], 24)}" tertinggi (${nf(gb.means[0])}) dan "${cut(gb.labels[gb.labels.length - 1], 24)}" terendah (${nf(lo)})${lo !== 0 ? `, selisih ${nf(gb.means[0] / lo, 2)} kali` : ''}. Rata-rata tertimbang ${nf(grand)}. Uji lanjutan (ANOVA) disarankan sebelum menyimpulkan perbedaan bermakna.`);
        s.addNotes(`Perbandingan rata-rata "${gb.num}" antar kelompok "${gb.cat}". Kolom selisih menunjukkan penyimpangan tiap kelompok terhadap rata-rata tertimbang keseluruhan (${nf(grand)}). Perbedaan yang tampak belum tentu signifikan secara statistik; diperlukan analisis varians (ANOVA) atau uji lanjut.`);
    }

    // ═════════ 12. PERSEDIAAN & PENGADAAN ═════════
    if (stock) {
        const kp = stock.kpis, ab = stock.abcSummary, tot = kp.totalSKUs || 1;
        const stCol = [C.red, C.orange, C.green, C.blue];
        {
            const s = newSlide('Analisis Persediaan: Status Stok & ABC', `Kolom item "${cut(stock.itemCol, 20)}", kuantitas "${cut(stock.qtyCol, 20)}"${stock.priceCol ? `, harga "${cut(stock.priceCol, 18)}"` : ''}`, 'Persediaan');
            [['Total SKU', nf(kp.totalSKUs, 0), C.blue], ['Total volume stok', nf(kp.totalStockVolume), C.blue], ['Total valuasi', nf(kp.totalValuation), C.green], ['Rata-rata stok/item', nf(kp.averageStockPerItem), C.blue]].forEach(([l, v, col], i) => kpi(s, 0.5 + i * 3.13, 1.35, 2.95, l, v, col, 1.0));
            heading(s, 'Distribusi status stok', 0.5, 2.5, 5);
            s.addChart(pptx.ChartType.doughnut, [{ name: 'Status', labels: stock.statusDistribution.map((x) => x.label), values: stock.statusDistribution.map((x) => x.count) }], {
                x: 0.4, y: 2.8, w: 5.2, h: 3.4, holeSize: 55, showPercent: true, showLegend: true, legendPos: 'r', legendFontSize: 11, dataLabelColor: C.white, dataLabelFontSize: 11, chartColors: stCol,
            } as never);
            heading(s, 'Klasifikasi ABC (prinsip Pareto)', 6.0, 2.5, 6.8);
            table(s, ['Kelas', 'Jumlah item', '% item', '% nilai'], [['A', ab.classA], ['B', ab.classB], ['C', ab.classC]].map(([k, v]) => { const x = v as typeof ab.classA; return [stateCell(String(k), k === 'A' ? C.red : k === 'B' ? C.orange : C.green), nf(x.count, 0), pct(x.pctCount), pct(x.valPct)]; }),
                { x: 6.0, y: 2.85, w: 6.83, ratio: [1, 1.6, 1.4, 1.4], align: ['c', 'r', 'r', 'r'], fs: 12, rh: 0.5 });
            s.addText(`Item kritis ${nf(kp.criticalCount, 0)} (${pct((kp.criticalCount / tot) * 100)})  |  menipis ${nf(kp.lowCount, 0)} (${pct((kp.lowCount / tot) * 100)})  |  aman ${nf(kp.healthyCount, 0)}  |  overstock ${nf(kp.overstockCount, 0)} (${pct((kp.overstockCount / tot) * 100)})`, { x: 6.0, y: 5.0, w: 6.83, h: 0.9, fontSize: 12, color: C.mute, fontFace: FONT, margin: 0, valign: 'top' });
            callout(s, `Kelas A: ${nf(ab.classA.count, 0)} item (${pct(ab.classA.pctCount)}) menyumbang ${pct(ab.classA.valPct)} nilai, ${ab.classA.pctCount < 30 && ab.classA.valPct > 60 ? 'sesuai pola Pareto' : 'menyimpang dari pola Pareto klasik'}. ${pct(((kp.criticalCount + kp.lowCount) / tot) * 100)} SKU berada di bawah tingkat aman.`, C.green);
            s.addNotes(`Item dan kuantitas dideteksi otomatis lalu diagregasi per item menjadi ${nf(kp.totalSKUs, 0)} SKU. Status stok ditentukan relatif terhadap median kuantitas: kritis <= 15% median, menipis <= 40%, overstock >= 250% (dengan batas minimum). Klasifikasi ABC mengurutkan item menurut nilai: kumulatif sampai 70% = A, sampai 90% = B, sisanya C (Silver dkk., 1998). Kelas A harus diawasi paling ketat dengan stock opname berkala.`);
        }
        {
            const s = newSlide('Persediaan: Konsentrasi & Item Utama', 'Koefisien Gini, indeks HHI, serta item dengan stok terbesar dan terendah', 'Persediaan');
            const metric = stock.items.map((x) => (kp.totalValuation > 0 ? x.totalValue : x.quantity)), totM = sum(metric) || 1;
            const hhi = sum(metric.map((v) => (v / totM) ** 2)) * 10000, gi = gini(metric);
            kpi(s, 0.5, 1.35, 3.0, 'Koefisien Gini', `${nf(gi, 3)} (${gi >= 0.6 ? 'tinggi' : gi >= 0.4 ? 'sedang' : 'rendah'})`, C.purple, 1.0);
            kpi(s, 0.5, 2.5, 3.0, 'HHI (0 - 10.000)', `${nf(hhi, 0)} (${hhi >= 2500 ? 'tinggi' : hhi >= 1500 ? 'sedang' : 'rendah'})`, C.purple, 1.0);
            kpi(s, 0.5, 3.65, 3.0, 'Pangsa item terbesar', pct((Math.max(...metric) / totM) * 100), C.purple, 1.0);
            heading(s, 'Stok terbesar', 3.8, 1.35, 4.5);
            hbar(s, stock.topStock.slice(0, 6), { x: 3.7, y: 1.65, w: 4.6, h: 4.5, color: C.blue, fmt: '#,##0' });
            heading(s, 'Stok terendah', 8.5, 1.35, 4.3);
            hbar(s, stock.bottomStock.slice(0, 6), { x: 8.4, y: 1.65, w: 4.45, h: 4.5, color: C.red, fmt: '#,##0' });
            callout(s, `Gini ${nf(gi, 3)} dan HHI ${nf(hhi, 0)} menunjukkan konsentrasi nilai ${gi >= 0.6 || hhi >= 2500 ? 'tinggi: nilai terpusat pada sedikit item' : 'moderat hingga rendah: nilai relatif merata'}. Item "${cut(stock.topStock[0]?.label ?? '-', 24)}" memiliki stok terbesar.`, C.purple);
            s.addNotes(`Konsentrasi nilai persediaan diukur dengan koefisien Gini (0 = merata, 1 = terpusat pada satu item) dan Herfindahl-Hirschman Index = jumlah (pangsa nilai)^2 x 10.000 (< 1.500 rendah, 1.500-2.500 sedang, > 2.500 tinggi). Gini = ${nf(gi, 3)} dan HHI = ${nf(hhi, 0)}. Grafik kanan menunjukkan item dengan kuantitas stok terbesar dan terendah sebagai kandidat pengawasan.`);
        }
        if (needs) {
            const sorted = [...needs.procurementItems].sort((a, b) => b.estimatedCost - a.estimatedCost);
            {
                const s = newSlide('Kebutuhan Pengadaan', 'Item berstatus kritis dan menipis menjadi kandidat restock', 'Pengadaan');
                kpi(s, 0.5, 1.35, 3.0, 'Total anggaran pengadaan', nf(needs.totalProcurementBudget), C.red, 1.0);
                kpi(s, 0.5, 2.5, 3.0, 'Item mendesak (Urgent)', nf(needs.urgentItemCount, 0), C.red, 1.0);
                kpi(s, 0.5, 3.65, 3.0, 'Prioritas tinggi (High)', nf(needs.highPriorityCount, 0), C.orange, 1.0);
                heading(s, 'Delapan item biaya terbesar', 3.8, 1.35, 9);
                table(s, ['Item', 'Stok', 'Pesan', 'Estimasi biaya', 'Prioritas'], sorted.slice(0, 8).map((x) => [cut(x.name, 24), nf(x.currentStock), nf(x.recommendedQty), nf(x.estimatedCost), stateCell(x.priority, x.priority === 'Urgent' ? C.red : C.orange)]),
                    { x: 3.8, y: 1.7, w: 9.03, ratio: [3, 1.2, 1.2, 1.8, 1.3], align: ['l', 'r', 'r', 'r', 'c'], fs: 11, rh: 0.46 });
                const top3 = sum(sorted.slice(0, 3).map((x) => x.estimatedCost));
                callout(s, sorted.length ? `${nf(needs.procurementItems.length, 0)} item perlu dipesan.${needs.totalProcurementBudget > 0 && sorted.length >= 3 ? ` Tiga item terbesar menyerap ${pct((top3 / needs.totalProcurementBudget) * 100)} anggaran.` : ''} Prioritaskan Urgent lebih dulu.` : 'Tidak ada item yang memerlukan pengadaan saat ini.', C.red);
                s.addNotes(`Rumus rekomendasi pemesanan: item kritis = maks(5, 1,5 x median - stok); item menipis = maks(2, 1,2 x median - stok). Estimasi biaya = jumlah pesan x harga satuan (harga 0 diganti 10). Total anggaran ${nf(needs.totalProcurementBudget)} untuk ${nf(needs.procurementItems.length, 0)} item (${nf(needs.urgentItemCount, 0)} mendesak, ${nf(needs.highPriorityCount, 0)} prioritas tinggi). Pendekatan ini heuristik dan dapat disempurnakan dengan model kuantitas pesanan ekonomis (Harris, 1913).`);
            }
            {
                const s = newSlide('Risiko Operasional & Rencana Aksi', 'Langkah tindak lanjut pengelolaan persediaan', 'Pengadaan');
                heading(s, 'Risiko teridentifikasi', 0.5, 1.35, 12);
                bullets(s, needs.riskWarnings.length ? needs.riskWarnings.map(noEmoji) : ['Tidak ada risiko signifikan terdeteksi.'], 0.5, 1.7, 12.3, 1.8, 13);
                heading(s, 'Rencana aksi', 0.5, 3.55, 12);
                table(s, ['Tindakan', 'Uraian'], needs.actionPlan.map((x) => [cut(noEmoji(x.title), 52), cut(noEmoji(x.description), 110)]), { x: 0.5, y: 3.9, w: 12.33, ratio: [4, 7], fs: 11, rh: 0.52 });
                s.addNotes(`Risiko utama: stockout pada item kritis (kehilangan penjualan), serta biaya simpan dan dead stock pada item overstock. Rencana aksi: ${needs.actionPlan.map((a) => noEmoji(a.title)).join('; ')}.`);
            }
        }
    }

    // ═════════ 13. DECISION TREE ═════════
    if (dt) {
        const total = Object.values(dt.classDistribution).reduce((a, b) => a + b, 0) || 1;
        const dist = Object.entries(dt.classDistribution).sort((a, b) => b[1] - a[1]);
        let hAll = 0; for (const cnt of Object.values(dt.classDistribution)) { const pi = cnt / total; if (pi > 0) { hAll -= pi * Math.log2(pi); } }
        const majShare = dist[0][1] / total, ts = treeStats(dt.tree), acc = dt.accuracy * 100;
        {
            const s = newSlide('Decision Tree C4.5: Gambaran Model', `Target otomatis: "${cut(dt.targetAttribute, 30)}" (${dist.length} kelas, ${dt.predictiveAttributes.length} prediktor)`, 'Decision Tree');
            heading(s, 'Distribusi kelas target', 0.5, 1.35, 6);
            hbar(s, dist.slice(0, 8).map(([l, v]) => ({ label: l, value: v })), { x: 0.4, y: 1.7, w: 6.2, h: 4.4, color: C.purple, fmt: '#,##0' });
            [['Data latih / uji', `${nf(dt.trainingSize, 0)} / ${nf(dt.testSize, 0)}`], ['Simpul / daun', `${nf(ts.nodes, 0)} / ${nf(ts.leaves, 0)}`], ['Kedalaman pohon', nf(ts.depth, 0)], ['Aturan keputusan', nf(dt.rules.length, 0)], ['Entropi data', `${nf(hAll, 3)} bit`], ['Akurasi dasar', pct(majShare * 100)]].forEach(([l, v], i) =>
                kpi(s, 6.9 + (i % 2) * 3.0, 1.4 + Math.floor(i / 2) * 1.3, 2.85, l, v, C.purple, 1.15));
            callout(s, `Kelas mayoritas mencakup ${pct(majShare * 100)} data sehingga model harus melampaui akurasi dasar ${pct(majShare * 100)} agar bermanfaat. Entropi ${nf(hAll, 3)} bit dari maksimum ${nf(Math.log2(Math.max(2, dist.length)), 3)} bit.`, C.purple);
            s.addNotes(`C4.5 (Quinlan, 1993) membangun pohon dengan memilih atribut ber-gain ratio tertinggi pada tiap simpul. Entropi H = -jumlah p log2 p mengukur ketidakpastian kelas; Gain = H(S) - jumlah (|Sv|/|S|) H(Sv); GainRatio = Gain / SplitInfo agar tidak bias pada atribut bernilai banyak. Data dibagi ${nf(dt.trainingSize, 0)} latih dan ${nf(dt.testSize, 0)} uji (acak, sehingga akurasi bisa berbeda tipis pada tiap proses). Pohon yang terbentuk memiliki ${nf(ts.nodes, 0)} simpul, ${nf(ts.leaves, 0)} daun, kedalaman ${ts.depth}, dan ${nf(dt.rules.length, 0)} aturan.`);
        }
        {
            const s = newSlide('Decision Tree C4.5: Atribut Terpenting', 'Kepentingan fitur (information gain ternormalisasi) dan gain ratio', 'Decision Tree');
            if (dt.featureImportance.length) {
                heading(s, 'Kepentingan fitur (%)', 0.5, 1.35, 6);
                hbar(s, dt.featureImportance.slice(0, 8).map((f) => ({ label: f.feature, value: f.importance * 100 })), { x: 0.4, y: 1.7, w: 6.0, h: 4.4, color: C.purple, fmt: '0.0' });
            }
            heading(s, 'Gain, SplitInfo, Gain Ratio', 6.7, 1.35, 6);
            table(s, ['Atribut', 'Gain', 'SplitInfo', 'Gain Ratio'], dt.splitMetrics.slice(0, 8).map((x) => [cut(x.attribute, 18), nf(x.informationGain, 4), nf(x.splitInfo, 4), nf(x.gainRatio, 4)]),
                { x: 6.7, y: 1.7, w: 6.13, ratio: [2.4, 1.3, 1.4, 1.5], align: ['l', 'r', 'r', 'r'], fs: 11, rh: 0.46 });
            const fi = dt.featureImportance[0], top3 = sum(dt.featureImportance.slice(0, 3).map((x) => x.importance)) * 100;
            callout(s, `Atribut "${dt.splitMetrics[0]?.attribute ?? '-'}" ber-gain ratio tertinggi sehingga menjadi simpul akar. Fitur "${fi?.feature ?? '-'}" paling berpengaruh (${pct((fi?.importance ?? 0) * 100)}); tiga teratas bersama ${pct(top3)}. Ini bukan hubungan sebab-akibat.`, C.purple);
            s.addNotes(`Kepentingan fitur dihitung dari information gain pada data latih lalu dinormalkan hingga berjumlah 100%. Tabel kanan memperlihatkan perhitungan gain, split info, dan gain ratio; atribut dengan gain ratio terbesar dipilih sebagai akar. Interpretasi berbasis gain tidak menunjukkan sebab-akibat (Rudin, 2019). Atribut numerik diperlakukan menurut nilai uniknya tanpa diskretisasi ambang, sehingga atribut bernilai banyak dapat membentuk cabang berlebih.`);
        }
        {
            const m = dt.confusionMatrix, labs = Object.keys(dt.classDistribution).sort(), lab = labs.length === m.length ? labs : m.map((_, i) => `Kelas ${i + 1}`);
            const N = sum(m.map((r) => sum(r))), colSum = m.map((_, j) => sum(m.map((r) => r[j])));
            const per = m.map((row, i) => { const tp = row[i], fn = sum(row) - tp, fp = colSum[i] - tp, pr = tp + fp > 0 ? tp / (tp + fp) : 0, rc = tp + fn > 0 ? tp / (tp + fn) : 0; return { l: lab[i], pr, rc, f1: pr + rc > 0 ? (2 * pr * rc) / (pr + rc) : 0, sup: sum(row) }; });
            const mP = per.length ? sum(per.map((x) => x.pr)) / per.length : 0, mR = per.length ? sum(per.map((x) => x.rc)) / per.length : 0, mF = per.length ? sum(per.map((x) => x.f1)) / per.length : 0;
            const po = N > 0 ? sum(m.map((r, i) => r[i])) / N : 0, pe = N > 0 ? sum(m.map((r, i) => sum(r) * colSum[i])) / (N * N) : 0, kappa = pe < 1 ? (po - pe) / (1 - pe) : 0;
            const grade = acc >= 90 ? 'sangat baik' : acc >= 75 ? 'baik' : acc >= 60 ? 'cukup' : 'masih rendah';
            const s = newSlide('Decision Tree C4.5: Evaluasi Model', `Akurasi ${pct(acc)} pada ${nf(dt.testSize, 0)} data uji (${grade})`, 'Decision Tree');
            heading(s, 'Metrik kinerja', 0.5, 1.35, 4.5);
            table(s, ['Metrik', 'Nilai'], [['Akurasi', pct(acc, 2)], ['Akurasi dasar', pct(majShare * 100, 2)], ['Precision makro', pct(mP * 100, 2)], ['Recall makro', pct(mR * 100, 2)], ['F1 makro', pct(mF * 100, 2)], ['Kappa Cohen', nf(kappa, 3)]],
                { x: 0.5, y: 1.7, w: 4.3, ratio: [2.2, 1.4], align: ['l', 'r'], fs: 12, rh: 0.5 });
            if (m.length >= 2 && m.length <= 6) {
                heading(s, 'Matriks konfusi (baris = aktual, kolom = prediksi)', 5.1, 1.35, 7.7);
                heat(s, lab.map((l) => cut(l, 12)), lab.map((l) => cut(l, 8)), m, 'count', { x: 5.1, y: 1.7, w: 7.73, fs: 10, rh: 0.5 });
            }
            if (per.length >= 2 && per.length <= 6) {
                heading(s, 'Kinerja per kelas', 5.1, 4.15, 7.7);
                table(s, ['Kelas', 'Precision', 'Recall', 'F1', 'Dukungan'], per.map((x) => [cut(x.l, 14), pct(x.pr * 100, 1), pct(x.rc * 100, 1), pct(x.f1 * 100, 1), nf(x.sup, 0)]), { x: 5.1, y: 4.5, w: 7.73, ratio: [2.2, 1.4, 1.4, 1.4, 1.4], align: ['l', 'r', 'r', 'r', 'r'], fs: 10, rh: 0.3 });
            }
            callout(s, `${acc > majShare * 100 ? `Model ${nf(acc - majShare * 100, 1)} poin di atas akurasi dasar.` : 'Model tidak melampaui akurasi dasar sehingga belum memberi nilai tambah.'} Kappa ${nf(kappa, 3)}.${acc >= 99 ? ' Akurasi sangat tinggi: waspadai overfitting atau kebocoran data, lakukan validasi silang.' : ' Verifikasi dengan validasi silang sebelum dipakai mengambil keputusan.'}`, C.purple, 6.45, 0.65);
            s.addNotes(`Evaluasi memakai data uji. Akurasi = prediksi benar / total uji = ${pct(acc, 2)}; pembanding adalah akurasi dasar (selalu menebak kelas mayoritas) ${pct(majShare * 100, 2)}. Precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2PR/(P+R), dirata-ratakan makro agar setiap kelas setara. Kappa Cohen (Cohen, 1960) mengoreksi kesesuaian karena kebetulan: ${nf(kappa, 3)} (${kappa >= 0.8 ? 'hampir sempurna' : kappa >= 0.6 ? 'substansial' : kappa >= 0.4 ? 'sedang' : kappa >= 0.2 ? 'lemah' : 'sangat lemah'}). Estimasi dari satu pembagian data tidak stabil; validasi silang (Kohavi, 1995) dianjurkan, juga perbandingan dengan model lain.`);
        }
        {
            const s = newSlide('Decision Tree C4.5: Contoh Aturan Keputusan', `Lima aturan pertama dari ${nf(dt.rules.length, 0)} aturan (seluruhnya ada di export Excel, lembar "DT Aturan")`, 'Decision Tree');
            dt.rules.slice(0, 5).forEach((r, i) => {
                const y = 1.4 + i * 0.95;
                s.addShape(pptx.ShapeType.roundRect, { x: 0.5, y, w: 12.33, h: 0.82, fill: { color: i % 2 ? C.zebra : C.sky }, line: { color: C.line, width: 1 }, rectRadius: 0.06 });
                s.addText(String(i + 1), { x: 0.6, y, w: 0.5, h: 0.82, fontSize: 20, bold: true, color: C.purple, fontFace: FONT, align: 'center', valign: 'middle', margin: 0 });
                s.addText(cut(r, 190), { x: 1.2, y, w: 11.5, h: 0.82, fontSize: 11.5, color: C.text, fontFace: 'Consolas', valign: 'middle', margin: 0, fit: 'shrink' });
            });
            s.addNotes('Setiap aturan berbentuk IF kondisi AND kondisi THEN Class = label (jumlah sampel) dan berasal dari satu jalur akar-ke-daun pada pohon. Aturan mudah dijelaskan kepada pemangku kepentingan, itulah alasan model pohon dipilih (Rudin, 2019). Jumlah sampel pada daun menunjukkan dukungan data bagi aturan tersebut.');
        }
    }

    // ═════════ 14. WORKFLOW ═════════
    {
        const fc = layoutFlow(sheet, 'slide', `Dataset ${fileName}, lembar ${sheet.name}`);
        const img = flowChart(fc);
        const s = pptx.addSlide();
        s.background = { color: C.white };
        s.addImage({ data: 'image/png;base64,' + Buffer.from(img.png).toString('base64'), x: 0, y: 0, w: W, h: 7.5 });
        s.addNotes(`Diagram alir menunjukkan seluruh langkah analisis. Jalur merah adalah jalur utama yang selalu dijalankan (baca file, inferensi tipe, kualitas data, statistik dan outlier, ekspor). Biru adalah cabang yang aktif karena syaratnya terpenuhi pada data ini, abu-abu putus-putus adalah cabang yang dilewati. Lima keputusan: numerik >= 2 variabel (korelasi), kategori >= 2 kolom (chi-kuadrat), ada tanggal atau kelompok (tren), ada kolom item dan kuantitas (persediaan), target 2-10 kelas dengan n >= 20 (Decision Tree). Ringkasan: ${fc.counts.critical} langkah utama, ${fc.counts.active} cabang aktif, ${fc.counts.skipped} dilewati.`);
        const t = newSlide('Ringkasan Langkah Alur Analisis', `${fc.counts.critical} langkah jalur utama  |  ${fc.counts.active} cabang aktif  |  ${fc.counts.skipped} cabang dilewati`, 'Workflow');
        const col = { critical: C.red, active: C.blue, skipped: C.grey } as const, txt = { critical: 'JALUR UTAMA', active: 'AKTIF', skipped: 'DILEWATI' } as const;
        table(t, ['No', 'Langkah', 'Hasil utama', 'Status'], fc.rows.map((r) => [String(r.no), cut(r.step, 40), { text: cut(r.result, 78), options: { color: r.state === 'skipped' ? '7F7F7F' : C.text } }, stateCell(txt[r.state], col[r.state])]),
            { x: 0.5, y: 1.4, w: 12.33, ratio: [0.6, 3.2, 6.4, 1.6], align: ['c', 'l', 'l', 'c'], fs: 11, rh: 0.43 });
        t.addNotes('Tabel ini merinci setiap langkah pada diagram alir beserta hasil utamanya pada dataset ini. Langkah berstatus DILEWATI menyebutkan alasan syarat datanya tidak terpenuhi.');
    }

    // ═════════ 15. KESIMPULAN, REKOMENDASI, KETERBATASAN ═════════
    {
        const rec: string[][] = [];
        if (hl.missingCells > 0) { rec.push([`${nf(hl.missingCells, 0)} sel kosong`, 'Dapat membiaskan statistik dan model', 'Imputasi median/rata-rata atau penyaringan data']); }
        if (hl.duplicateRows > 0) { rec.push([`${nf(hl.duplicateRows, 0)} baris duplikat`, 'Menggandakan bobot observasi', 'Hapus baris duplikat']); }
        if (hl.outlierColsCount > 0) { rec.push([`${hl.outlierColsCount} kolom beroutlier`, 'Memengaruhi rata-rata dan simpangan baku', 'Verifikasi nilai ekstrem, pertimbangkan transformasi']); }
        if (constCols.length) { rec.push([`${constCols.length} kolom konstan`, 'Tidak informatif', 'Hapus dari analisis']); }
        if (pairs.length && Math.abs(pairs[0].r) >= 0.7) { rec.push([`Korelasi kuat (r = ${nf(pairs[0].r, 2)})`, 'Potensi multikolinearitas', 'Seleksi fitur sebelum pemodelan']); }
        if (stock && stock.kpis.criticalCount > 0) { rec.push([`${stock.kpis.criticalCount} item kritis`, 'Risiko kehabisan stok', 'Terbitkan pesanan darurat']); }
        if (stock && stock.kpis.overstockCount > 0) { rec.push([`${stock.kpis.overstockCount} item overstock`, 'Modal kerja tertahan', 'Promosi atau penyesuaian pemesanan']); }
        if (dt && dt.accuracy >= 0.99) { rec.push(['Akurasi >= 99%', 'Indikasi overfitting / kebocoran data', 'Validasi silang dan uji data baru']); }
        if (!rec.length) { rec.push(['Tidak ada masalah signifikan', 'Dataset siap dianalisis lanjut', 'Pertahankan prosedur pengumpulan data']); }

        const s1 = newSlide('Kesimpulan', 'Jawaban atas pertanyaan analisis', 'Penutup');
        const concl: string[] = [`Dataset "${base}" berisi ${nf(n, 0)} baris dan ${P} kolom dengan skor kualitas ${hl.qualityScore}% (${rating}).`];
        if (mostVar) { concl.push(`Variabel "${mostVar.name}" memiliki keragaman relatif tertinggi (CV = ${nf(cvOf(mostVar), 2)}).`); }
        if (pairs.length) { concl.push(`Korelasi terkuat terdapat antara "${pairs[0].a}" dan "${pairs[0].b}" (r = ${nf(pairs[0].r, 3)}).`); }
        if (stock) { concl.push(`Dari ${nf(stock.kpis.totalSKUs, 0)} SKU: ${nf(stock.kpis.criticalCount, 0)} kritis, ${nf(stock.kpis.lowCount, 0)} menipis, ${nf(stock.kpis.overstockCount, 0)} overstock.`); }
        if (needs) { concl.push(`Estimasi anggaran pengadaan prioritas: ${nf(needs.totalProcurementBudget)}.`); }
        if (dt) { concl.push(`Model C4.5 untuk "${dt.targetAttribute}" mencapai akurasi ${pct(dt.accuracy * 100)}; fitur terpenting "${dt.featureImportance[0]?.feature ?? '-'}".`); }
        bullets(s1, concl, 0.5, 1.4, 12.3, 5.5, 17);
        s1.addNotes(`Kesimpulan: ${concl.join(' ')} Analisis bersifat deskriptif dan asosiatif sehingga tidak membuktikan hubungan sebab-akibat.`);

        const s2 = newSlide('Implikasi & Rekomendasi Tindak Lanjut', 'Dari temuan menuju tindakan', 'Penutup');
        table(s2, ['Temuan', 'Implikasi', 'Rekomendasi'], rec.slice(0, 8), { x: 0.5, y: 1.4, w: 12.33, ratio: [3, 4, 5], fs: 12, rh: 0.55 });
        s2.addNotes(`Setiap baris menghubungkan temuan data dengan dampaknya dan tindakan yang disarankan. Prioritaskan perbaikan kualitas data sebelum pemodelan lanjutan, karena kesalahan data yang terlewat akan menjalar ke tahap pemodelan dan pengambilan keputusan (Sambasivan dkk., 2021).`);

        const s3 = newSlide('Metodologi & Keterbatasan', 'Rumus utama dan hal yang perlu diperhatikan saat menafsirkan hasil', 'Penutup');
        heading(s3, 'Rumus utama', 0.5, 1.35, 6);
        bullets(s3, ['Skor kualitas = 0,45 K + 0,35 I + 0,20 Ks', 'IQR = Q3 - Q1; outlier di luar Q1 - 1,5 IQR / Q3 + 1,5 IQR', 'CV = s / |rata-rata|; k histogram = log2(n) + 1', 'r Pearson; Y = a + bX; t = r akar((n-2)/(1-r2))', 'Chi-kuadrat = jumlah (O-E)^2/E; V Cramer', stock ? 'ABC 70% / 90%; HHI; Gini; status relatif median' : 'Gain Ratio = Gain / SplitInfo', dt ? 'Entropi = -jumlah p log2 p; Gain Ratio; Kappa' : 'Akurasi, precision, recall, F1'], 0.5, 1.7, 6.0, 4.5, 12.5);
        heading(s3, 'Keterbatasan', 6.9, 1.35, 6);
        const lim = ['Analisis deskriptif dan asosiatif, bukan sebab-akibat.', 'Tipe kolom, kolom persediaan, dan target klasifikasi dideteksi otomatis; verifikasi oleh pemilik data.', 'Aturan IQR kurang tepat pada data sangat miring.', 'Regresi dari sampel titik; chi-kuadrat pada kategori teratas (pendekatan).', 'Ambang status stok relatif terhadap median, bukan laju permintaan.'];
        if (dt) { lim.push('Model C4.5 dievaluasi dengan satu pembagian data tanpa validasi silang.'); }
        if (sheet.truncated) { lim.push('Dataset dianalisis sebagian karena melebihi batas baris.'); }
        bullets(s3, lim, 6.9, 1.7, 5.9, 4.5, 12.5);
        s3.addNotes('Rumus-rumus utama ditampilkan agar hasil dapat diverifikasi ulang, dan di export Excel tersedia rumus hidup pada setiap lembar. Keterbatasan penting: hasil bersifat deskriptif, deteksi otomatis perlu diverifikasi, dan evaluasi model dari satu pembagian data bersifat tidak stabil.');

        const end = pptx.addSlide();
        end.background = { color: C.navy };
        end.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: C.orange }, line: { color: C.orange, width: 0 } });
        end.addText('Terima Kasih', { x: 1, y: 2.5, w: 11, h: 1.2, fontSize: 54, bold: true, color: C.white, fontFace: FONT, margin: 0 });
        end.addText('Pertanyaan dan diskusi', { x: 1, y: 3.8, w: 11, h: 0.6, fontSize: 22, color: 'BFD0EE', fontFace: FONT, margin: 0 });
        end.addText(`${meta.author}${meta.affiliation ? '  |  ' + meta.affiliation : ''}\nDihasilkan otomatis oleh Date Skunder`, { x: 1, y: 5.5, w: 11, h: 0.9, fontSize: 14, color: C.white, fontFace: FONT, margin: 0, valign: 'top' });
    }

    const out = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    return new Uint8Array(out);
}