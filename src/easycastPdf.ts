import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { SheetResult, WorkbookResult } from './analysis';

const W = 960;
const H = 540;
const PAD = 44;

const BG = rgb(0.043, 0.063, 0.125);
const CARD = rgb(0.082, 0.11, 0.2);
const LINE = rgb(0.153, 0.196, 0.337);
const FG = rgb(0.91, 0.925, 0.973);
const MUT = rgb(0.604, 0.651, 0.78);
const ACC = rgb(0.431, 0.659, 0.996);
const GOOD = rgb(0.298, 0.851, 0.541);
const WARN = rgb(1, 0.784, 0.341);
const BAD = rgb(1, 0.42, 0.42);
const INFO = rgb(0.353, 0.706, 0.945);

export interface EasyCastPdfOptions {
    /** Jumlah sheet yang dibuatkan slide (sisanya diringkas di halaman terakhir). */
    maxSheets?: number;
    /** Baris data yang ditampilkan pada slide tabel. */
    maxTableRows?: number;
    /** Footer tiap halaman. */
    footer?: string;
}

/** Font standar PDF (WinAnsi) → karakter di luar Latin-1 dibuang supaya tidak error saat encode. */
const clean = (s: unknown): string => String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00d7/g, 'x')
    .replace(/[\u2190-\u21FF]/g, '')
    .replace(/[^\x20-\x7E\xA1-\xFF\t]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Teks yang seluruhnya non-Latin (mis. aksara Mandarin) tidak bisa ditulis font standar → beri penanda. */
const label = (s: unknown, fallback = '-'): string => {
    const t = clean(s);
    if (t) { return t; }
    return String(s ?? '').trim() ? '\u00b7\u00b7\u00b7' : fallback;
};

const nf = (x: number, digits = 0): string => {
    if (!Number.isFinite(x)) { return '-'; }
    const abs = Math.abs(x);
    if (abs >= 1e9) { return `${(x / 1e9).toFixed(2)}B`; }
    if (abs >= 1e6) { return `${(x / 1e6).toFixed(2)}M`; }
    if (abs >= 1e4) { return `${(x / 1e3).toFixed(1)}K`; }
    return x.toLocaleString('en-US', { maximumFractionDigits: digits });
};

interface Ctx {
    doc: PDFDocument;
    reg: PDFFont;
    bold: PDFFont;
    ital: PDFFont;
    page: PDFPage;
    pageNo: number;
    footer: string;
    title: string;
}

function newPage(ctx: Ctx, title: string, subtitle?: string): void {
    ctx.page = ctx.doc.addPage([W, H]);
    ctx.pageNo += 1;
    const p = ctx.page;
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
    // aksen kiri atas + garis pemisah header
    p.drawRectangle({ x: PAD, y: H - 74, width: 6, height: 30, color: ACC });
    fitText(p, label(title), PAD + 16, H - 70, 24, ctx.bold, FG, W - PAD * 2 - 120);
    if (subtitle) { fitText(p, label(subtitle), PAD + 16, H - 90, 12, ctx.reg, MUT, W - PAD * 2 - 120); }
    fitText(p, 'EasyCast', W - PAD - ctx.bold.widthOfTextAtSize('EasyCast', 14), H - 66, 14, ctx.bold, ACC, 120);
    p.drawLine({ start: { x: PAD, y: H - 104 }, end: { x: W - PAD, y: H - 104 }, thickness: 0.8, color: LINE });
}

/** Tulis teks, potong bila melebihi lebar maksimum. */
function fitText(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color = FG, maxWidth?: number): void {
    let out = text;
    if (maxWidth && font.widthOfTextAtSize(out, size) > maxWidth) {
        let k = out.length;
        while (k > 1 && font.widthOfTextAtSize(`${out.slice(0, k)}...`, size) > maxWidth) { k -= 1; }
        out = `${out.slice(0, k)}...`;
    }
    if (!out) { return; }
    page.drawText(out, { x, y, size, font, color });
}

function card(ctx: Ctx, x: number, y: number, w: number, h: number, fill = CARD): void {
    ctx.page.drawRectangle({ x, y, width: w, height: h, color: fill });
}

function kpiRow(ctx: Ctx, items: { label: string; value: string }[], x: number, y: number, w: number, h = 78, perRow = 4): number {
    const gap = 12;
    const cw = (w - gap * (perRow - 1)) / perRow;
    items.forEach((it, i) => {
        const cx = x + (i % perRow) * (cw + gap);
        const cy = y - Math.floor(i / perRow) * (h + gap) - h;
        card(ctx, cx, cy, cw, h);
        fitText(ctx.page, label(it.label), cx + 14, cy + h - 22, 11, ctx.reg, MUT, cw - 28);
        fitText(ctx.page, label(it.value), cx + 14, cy + 16, 22, ctx.bold, FG, cw - 28);
    });
    return y - Math.ceil(items.length / perRow) * (h + gap);
}

function bullets(ctx: Ctx, items: string[], x: number, y: number, w: number, max: number, size = 12): number {
    const list = items.filter((t) => clean(t)).slice(0, max);
    let cy = y;
    for (const raw of list) {
        const text = label(raw);
        const lines = wrapText(text, ctx.reg, size, w - 18);
        ctx.page.drawCircle({ x: x + 4, y: cy + size * 0.35, size: 2.2, color: ACC });
        for (const ln of lines.slice(0, 3)) {
            fitText(ctx.page, ln, x + 16, cy, size, ctx.reg, FG, w - 18);
            cy -= size * 1.35;
        }
        cy -= size * 0.45;
        if (cy < 70) { break; }
    }
    return cy;
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
    const words = label(text).split(' ');
    const out: string[] = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) { out.push(line); }
        line = word;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
            let k = line.length - 1;
            while (k > 1 && font.widthOfTextAtSize(line.slice(0, k), size) > width) { k -= 1; }
            out.push(line.slice(0, k));
            line = line.slice(k);
        }
    }
    if (line) { out.push(line); }
    return out.length ? out : [''];
}

/** Grafik batang horizontal sederhana (label kiri, nilai kanan). */
function bars(ctx: Ctx, items: { label: string; value: number }[], x: number, y: number, w: number, h: number, color = ACC, title?: string): void {
    const rows = items.filter((it) => Number.isFinite(it.value)).slice(0, 10);
    let top = y;
    if (title) {
        fitText(ctx.page, label(title), x, y - 2, 13, ctx.bold, FG, w);
        top = y - 22;
    }
    if (!rows.length) {
        fitText(ctx.page, 'No data', x, top - 16, 11, ctx.ital, MUT, w);
        return;
    }
    const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
    const rowH = Math.max(16, Math.min(28, h / rows.length));
    const labelW = Math.min(240, w * 0.42);
    const valueW = 74;
    const trackX = x + labelW + 10;
    const trackW = Math.max(30, w - labelW - valueW - 10);
    rows.forEach((r, i) => {
        const cy = top - (i + 1) * rowH;
        fitText(ctx.page, label(r.label), x, cy + rowH / 2 - 4, 11, ctx.reg, MUT, labelW);
        ctx.page.drawRectangle({ x: trackX, y: cy + rowH / 2 - 5, width: trackW, height: 10, color: LINE });
        const bw = Math.max(3, Math.round((Math.abs(r.value) / max) * trackW));
        ctx.page.drawRectangle({ x: trackX, y: cy + rowH / 2 - 5, width: bw, height: 10, color });
        fitText(ctx.page, nf(r.value), trackX + trackW + 8, cy + rowH / 2 - 4, 11, ctx.bold, FG, valueW);
    });
}

/** Grafik garis untuk deret waktu. */
function line(ctx: Ctx, labels: string[], values: number[], x: number, y: number, w: number, h: number, title?: string, color = ACC): void {
    let top = y;
    if (title) {
        fitText(ctx.page, label(title), x, y - 2, 13, ctx.bold, FG, w);
        top = y - 22;
    }
    const pts = values.filter((v) => Number.isFinite(v));
    if (pts.length < 2) {
        fitText(ctx.page, 'Not enough data points', x, top - 16, 11, ctx.ital, MUT, w);
        return;
    }
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const bottom = top - h;
    for (let g = 0; g <= 4; g += 1) {
        const gy = bottom + (h / 4) * g;
        ctx.page.drawLine({ start: { x, y: gy }, end: { x: x + w, y: gy }, thickness: 0.5, color: LINE });
        fitText(ctx.page, nf(min + (span / 4) * g), x - 6 - ctx.reg.widthOfTextAtSize(nf(min + (span / 4) * g), 8), gy - 3, 8, ctx.reg, MUT);
    }
    const stepX = w / Math.max(1, pts.length - 1);
    for (let i = 0; i < pts.length - 1; i += 1) {
        const x1 = x + stepX * i;
        const x2 = x + stepX * (i + 1);
        const y1 = bottom + ((pts[i] - min) / span) * h;
        const y2 = bottom + ((pts[i + 1] - min) / span) * h;
        ctx.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 2, color });
        ctx.page.drawCircle({ x: x1, y: y1, size: 2, color });
    }
    const lastX = x + stepX * (pts.length - 1);
    const lastY = bottom + ((pts[pts.length - 1] - min) / span) * h;
    ctx.page.drawCircle({ x: lastX, y: lastY, size: 2.4, color });
    const firstLabel = label(String(labels[0] ?? ''));
    const lastLabel = label(String(labels[labels.length - 1] ?? ''));
    fitText(ctx.page, firstLabel, x, bottom - 14, 9, ctx.reg, MUT, w / 2);
    const lw = ctx.reg.widthOfTextAtSize(lastLabel, 9);
    fitText(ctx.page, lastLabel, x + w - lw, bottom - 14, 9, ctx.reg, MUT, w / 2);
}

/** Tabel ringkas dengan pemotongan teks per kolom. */
function table(ctx: Ctx, head: string[], rows: string[][], widths: number[], x: number, y: number, size = 10): number {
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = 1 / total;
    const cols = widths.map((wd) => wd * scale);
    const avail = W - PAD * 2;
    let cy = y;
    const rowH = size * 1.9;
    ctx.page.drawRectangle({ x, y: cy - rowH, width: avail, height: rowH, color: LINE });
    let cx = x + 6;
    head.forEach((hd, i) => {
        fitText(ctx.page, label(hd, ''), cx, cy - rowH + size * 0.55, size, ctx.bold, MUT, avail * cols[i] - 8);
        cx += avail * cols[i];
    });
    cy -= rowH;
    rows.forEach((r, idx) => {
        if (cy - rowH < 64) { return; }
        if (idx % 2 === 1) {
            ctx.page.drawRectangle({ x, y: cy - rowH, width: avail, height: rowH, color: rgb(0.06, 0.08, 0.15) });
        }
        let rx = x + 6;
        r.forEach((cell, i) => {
            fitText(ctx.page, label(cell, ''), rx, cy - rowH + size * 0.55, size, ctx.reg, FG, avail * cols[i] - 8);
            rx += avail * cols[i];
        });
        cy -= rowH;
    });
    return cy;
}

function scoreColor(score: number) {
    if (score >= 80) { return GOOD; }
    if (score >= 60) { return WARN; }
    return BAD;
}

function cover(ctx: Ctx, wb: WorkbookResult): void {
    const p = ctx.page;
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
    p.drawRectangle({ x: 0, y: 0, width: 10, height: H, color: ACC });
    fitText(p, 'EasyCast', PAD + 20, H - 150, 20, ctx.bold, ACC);
    fitText(p, 'Date Skunder - Data Analysis Report', PAD + 20, H - 220, 40, ctx.bold, FG, W - PAD * 2 - 40);
    fitText(p, label(wb.fileName), PAD + 20, H - 266, 18, ctx.reg, MUT, W - PAD * 2 - 40);
    const totalRows = wb.sheets.reduce((a, s) => a + s.totalRows, 0);
    const totalCols = wb.sheets.reduce((a, s) => a + s.headers.length, 0);
    fitText(p, `${wb.sheets.length} sheet(s) - ${nf(totalRows)} rows - ${nf(totalCols)} columns`, PAD + 20, H - 300, 13, ctx.reg, MUT, W - PAD * 2);
    fitText(p, label(new Date().toLocaleString('en-US')), PAD + 20, 92, 11, ctx.reg, MUT, W - PAD * 2);
    fitText(p, 'Generated by Date Skunder - EasyCast', PAD + 20, 70, 10, ctx.ital, MUT, W - PAD * 2);
}

function summarySlide(ctx: Ctx, sheet: SheetResult): void {
    newPage(ctx, `Ringkasan - ${sheet.name}`, `${nf(sheet.totalRows)} rows - ${sheet.headers.length} columns - quality ${Math.round(sheet.csvHealth.qualityScore)}/100`);
    const numeric = sheet.columns.filter((c) => c.num).length;
    const cat = sheet.columns.filter((c) => c.type === 'category').length;
    const dates = sheet.columns.filter((c) => c.type === 'date').length;
    const totalCells = sheet.totalRows * sheet.headers.length || 1;
    const missingPct = ((sheet.missingCells / totalCells) * 100).toFixed(1);
    const y = kpiRow(ctx, [
        { label: 'Rows', value: nf(sheet.totalRows) },
        { label: 'Columns', value: nf(sheet.headers.length) },
        { label: 'Numeric', value: nf(numeric) },
        { label: 'Categorical', value: nf(cat) },
        { label: 'Date', value: nf(dates) },
        { label: 'Missing cells', value: `${missingPct}%` },
        { label: 'Duplicates', value: nf(sheet.duplicates) },
        { label: 'Quality score', value: `${Math.round(sheet.csvHealth.qualityScore)}/100` },
    ], PAD, H - 130, W - PAD * 2, 78, 4);

    fitText(ctx.page, 'Automated insights', PAD, y - 24, 13, ctx.bold, FG);
    bullets(ctx, sheet.insights, PAD, y - 48, W - PAD * 2, 4);
}

function qualitySlide(ctx: Ctx, sheet: SheetResult): void {
    const h = sheet.csvHealth;
    newPage(ctx, `Kualitas & profil CSV - ${sheet.name}`, `${label(h.qualityRating)} - skor ${Math.round(h.qualityScore)}/100`);
    const pass = h.checklist.filter((c) => c.status === 'pass').length;
    const warn = h.checklist.filter((c) => c.status === 'warn').length;
    const fail = h.checklist.filter((c) => c.status === 'fail').length;
    kpiRow(ctx, [
        { label: 'Quality score', value: `${Math.round(h.qualityScore)}/100` },
        { label: 'Completeness', value: `${Math.round(h.completenessScore)}%` },
        { label: 'Consistency', value: `${Math.round(h.consistencyScore)}%` },
        { label: 'Integrity', value: `${Math.round(h.integrityScore)}%` },
        { label: 'Checks passed', value: nf(pass) },
        { label: 'Warnings', value: nf(warn) },
        { label: 'Failed checks', value: nf(fail) },
        { label: 'Missing cells', value: nf(h.missingCells) },
    ], PAD, H - 130, W - PAD * 2, 78, 4);

    // meter skor
    const barY = H - 360;
    const barW = W - PAD * 2;
    ctx.page.drawRectangle({ x: PAD, y: barY, width: barW, height: 12, color: LINE });
    ctx.page.drawRectangle({ x: PAD, y: barY, width: Math.max(4, (Math.min(100, Math.max(0, h.qualityScore)) / 100) * barW), height: 12, color: scoreColor(h.qualityScore) });

    fitText(ctx.page, 'Cleaning recommendations', PAD, barY - 30, 13, ctx.bold, FG);
    bullets(ctx, h.cleaningRecommendations, PAD, barY - 54, W - PAD * 2, 5, 11);
}

function chartsSlide(ctx: Ctx, sheet: SheetResult): void {
    newPage(ctx, `Grafik - ${sheet.name}`, 'Kategori teratas & tren waktu');
    const top = sheet.groupBars[0];
    const colTop = sheet.columns.find((c) => c.top && c.top.length >= 2);
    const items = top
        ? top.labels.map((l, i) => ({ label: l, value: top.means[i] })).sort((a, b) => b.value - a.value)
        : (colTop?.top ?? []).map((t) => ({ label: String(t.value), value: t.count }));
    bars(ctx, items, PAD, H - 140, (W - PAD * 2) / 2 - 16, 330, ACC, top ? `Average ${top.num} by ${top.cat}` : `Distribution of ${colTop?.name ?? '-'}`);
    const trend = sheet.trends[0];
    line(ctx, trend?.labels ?? [], trend?.values ?? [], PAD + (W - PAD * 2) / 2 + 16, H - 140, (W - PAD * 2) / 2 - 16, 300, trend ? `Trend of ${trend.num} by ${trend.gran}` : 'Trend');
}

function stockSlide(ctx: Ctx, sheet: SheetResult): void {
    const s = sheet.stockAnalysis!;
    newPage(ctx, `Stok Barang - ${sheet.name}`, `Item: ${label(s.itemCol)} - Qty: ${label(s.qtyCol)}${s.priceCol ? ` - Harga: ${label(s.priceCol)}` : ''}`);
    kpiRow(ctx, [
        { label: 'Total SKU', value: nf(s.kpis.totalSKUs) },
        { label: 'Total stock', value: nf(s.kpis.totalStockVolume) },
        { label: 'Asset value', value: nf(s.kpis.totalValuation) },
        { label: 'Average / SKU', value: nf(s.kpis.averageStockPerItem, 1) },
        { label: 'Critical', value: nf(s.kpis.criticalCount) },
        { label: 'Low', value: nf(s.kpis.lowCount) },
        { label: 'Healthy', value: nf(s.kpis.healthyCount) },
        { label: 'Overstock', value: nf(s.kpis.overstockCount) },
    ], PAD, H - 130, W - PAD * 2, 74, 4);
    bars(ctx, s.topStock.map((t) => ({ label: t.label, value: t.value })), PAD, H - 320, (W - PAD * 2) / 2 - 16, 180, GOOD, 'Top 10 stock');
    bars(ctx, s.categoryValuation.map((c) => ({ label: c.label, value: c.value })), PAD + (W - PAD * 2) / 2 + 16, H - 320, (W - PAD * 2) / 2 - 16, 180, INFO, 'Value by category');
}

function needsSlide(ctx: Ctx, sheet: SheetResult): void {
    const n = sheet.needsAnalysis!;
    newPage(ctx, `Analisis Kebutuhan - ${sheet.name}`, 'Rekomendasi pembelian & risiko operasional');
    kpiRow(ctx, [
        { label: 'Procurement budget', value: nf(n.totalProcurementBudget) },
        { label: 'Urgent items', value: nf(n.urgentItemCount) },
        { label: 'High priority', value: nf(n.highPriorityCount) },
        { label: 'Items listed', value: nf(n.procurementItems.length) },
    ], PAD, H - 130, W - PAD * 2, 74, 4);
    const rows = n.procurementItems.slice(0, 7).map((it) => [
        label(it.name), label(it.category), nf(it.currentStock), nf(it.recommendedQty), nf(it.estimatedCost), label(it.priority),
    ]);
    table(ctx, ['Item', 'Category', 'Stock', 'Order qty', 'Est. cost', 'Priority'],
        rows, [2.6, 1.2, 0.9, 0.9, 1.1, 1], PAD, H - 230, 9.5);
    fitText(ctx.page, 'Risk warnings', PAD, 150, 12, ctx.bold, WARN);
    bullets(ctx, n.riskWarnings, PAD, 128, W - PAD * 2, 2, 10);
}

function kpiSlide(ctx: Ctx, sheet: SheetResult): void {
    const k = sheet.businessKpi!;
    const s = k.summary;
    newPage(ctx, `KPI Bisnis & Penjualan - ${sheet.name}`, `Revenue source: ${k.revenueSource} - rows used: ${nf(k.rowsUsed)}`);
    kpiRow(ctx, [
        { label: 'Total revenue', value: nf(s.totalRevenue) },
        { label: 'Gross profit', value: s.grossProfit === null ? '-' : nf(s.grossProfit) },
        { label: 'Gross margin', value: s.grossMarginPct === null ? '-' : `${s.grossMarginPct.toFixed(1)}%` },
        { label: 'Orders', value: nf(s.totalOrders) },
        { label: 'Units', value: s.totalUnits === null ? '-' : nf(s.totalUnits) },
        { label: 'Avg order value', value: nf(s.avgOrderValue, 1) },
        { label: 'Customers', value: s.customers === null ? '-' : nf(s.customers) },
        { label: 'Latest growth', value: k.growth.latestGrowthPct === null ? '-' : `${k.growth.latestGrowthPct.toFixed(1)}%` },
    ], PAD, H - 130, W - PAD * 2, 74, 4);
    bars(ctx, k.topProducts.slice(0, 8).map((p) => ({ label: p.label, value: p.revenue })), PAD, H - 320, (W - PAD * 2) / 2 - 16, 180, ACC, 'Top products by revenue');
    line(ctx, k.growth.periods.map((p) => p.period), k.growth.periods.map((p) => p.revenue), PAD + (W - PAD * 2) / 2 + 16, H - 320, (W - PAD * 2) / 2 - 16, 170, 'Revenue trend');
}

function treeSlide(ctx: Ctx, sheet: SheetResult): void {
    const t = sheet.decisionTreeAnalysis!;
    newPage(ctx, `Decision Tree C4.5 - ${sheet.name}`, `Target: ${label(t.targetAttribute)} - ${nf(t.trainingSize)} train / ${nf(t.testSize)} test`);
    const m = t.performanceMetrics;
    kpiRow(ctx, [
        { label: 'Accuracy', value: `${(t.accuracy * 100).toFixed(1)}%` },
        { label: 'Macro F1', value: `${(m.macroF1 * 100).toFixed(1)}%` },
        { label: 'Weighted F1', value: `${(m.weightedF1 * 100).toFixed(1)}%` },
        { label: 'Kappa Cohen', value: m.kappa.toFixed(3) },
    ], PAD, H - 130, W - PAD * 2, 74, 4);
    bars(ctx, t.featureImportance.slice(0, 8).map((f) => ({ label: f.feature, value: f.importance })), PAD, H - 330, (W - PAD * 2) / 2 - 16, 170, INFO, 'Feature importance (information gain)');
    fitText(ctx.page, 'Rules', PAD + (W - PAD * 2) / 2 + 16, H - 152, 13, ctx.bold, FG);
    bullets(ctx, t.rules.slice(0, 4), PAD + (W - PAD * 2) / 2 + 16, H - 176, (W - PAD * 2) / 2 - 16, 4, 10);
}

function tableSlide(ctx: Ctx, sheet: SheetResult, maxRows: number): void {
    newPage(ctx, `Tabel Data - ${sheet.name}`, `Menampilkan ${Math.min(maxRows, sheet.rows.length)} dari ${nf(sheet.totalRows)} baris`);
    const cols = sheet.headers.slice(0, 7);
    const rows = sheet.rows.slice(0, maxRows).map((r) => cols.map((_, i) => (r[i] === null || r[i] === undefined ? '' : String(r[i]))));
    table(ctx, cols, rows, cols.map((_, i) => (i === 0 ? 1.4 : 1)), PAD, H - 140, 9);
}

function sheetsOverview(ctx: Ctx, wb: WorkbookResult): void {
    newPage(ctx, 'Daftar Sheet', `${wb.sheets.length} sheet dianalisis`);
    const rows = wb.sheets.map((s, i) => [
        String(i + 1), label(s.name), nf(s.totalRows), nf(s.headers.length), nf(s.duplicates),
        `${Math.round(s.csvHealth.qualityScore)}/100`,
        s.decisionTreeAnalysis ? `${(s.decisionTreeAnalysis.accuracy * 100).toFixed(1)}%` : '-',
    ]);
    table(ctx, ['#', 'Sheet', 'Rows', 'Columns', 'Duplicates', 'Quality', 'C4.5 acc.'], rows, [0.6, 3, 1.2, 1.2, 1.2, 1.2, 1.2], PAD, H - 150, 10);
}

/** Bangun PDF dasbor EasyCast dari hasil analisis. */
export async function renderEasyCastPdf(wb: WorkbookResult, opts: EasyCastPdfOptions = {}): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(clean(`EasyCast - ${wb.fileName}`));
    doc.setCreator('Date Skunder');
    doc.setProducer('Date Skunder EasyCast');
    doc.setCreationDate(new Date());
    const ctx: Ctx = {
        doc,
        reg: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
        ital: await doc.embedFont(StandardFonts.HelveticaOblique),
        page: doc.addPage([W, H]),
        pageNo: 0,
        footer: opts.footer ?? '',
        title: wb.fileName,
    };
    ctx.pageNo = 1;

    cover(ctx, wb);
    if (wb.sheets.length > 1) { sheetsOverview(ctx, wb); }

    const maxRows = Math.max(4, Math.min(30, opts.maxTableRows ?? 12));
    const sheets = wb.sheets.slice(0, Math.max(1, Math.min(12, opts.maxSheets ?? 6)));
    for (const sheet of sheets) {
        summarySlide(ctx, sheet);
        qualitySlide(ctx, sheet);
        if (sheet.groupBars.length || sheet.trends.length) { chartsSlide(ctx, sheet); }
        if (sheet.businessKpi) { kpiSlide(ctx, sheet); }
        if (sheet.stockAnalysis?.items.length) { stockSlide(ctx, sheet); }
        if (sheet.needsAnalysis) { needsSlide(ctx, sheet); }
        if (sheet.decisionTreeAnalysis) { treeSlide(ctx, sheet); }
        if (sheet.rows.length) { tableSlide(ctx, sheet, maxRows); }
    }

    // Nomor halaman & footer di semua halaman.
    const pages = doc.getPages();
    pages.forEach((pg, i) => {
        const text = `${i + 1} / ${pages.length}`;
        pg.drawText(text, { x: W - PAD - ctx.reg.widthOfTextAtSize(text, 9), y: 24, size: 9, font: ctx.reg, color: MUT });
        if (ctx.footer) { pg.drawText(label(ctx.footer), { x: PAD, y: 24, size: 9, font: ctx.reg, color: MUT }); }
    });

    return doc.save();
}
