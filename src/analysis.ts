import * as XLSX from 'xlsx';
import { trainDecisionTree, autoDetectTargetAttribute, DecisionTreeAnalysis, DecisionTreeOptions } from './decisionTree';
import { computeBusinessKpi, BusinessKpi } from './kpi';

export type ColType = 'number' | 'integer' | 'id' | 'date' | 'boolean' | 'category' | 'text';
type Cell = number | string | boolean | Date | null;
type Val = Exclude<Cell, null>;

export interface Hist { labels: string[]; counts: number[] }
export interface NumStats {
    min: number; max: number; mean: number; median: number; std: number;
    q1: number; q3: number; sum: number; skew: number;
    outliers: number; lower: number; upper: number; hist: Hist;
}
export interface ColumnInfo {
    name: string; type: ColType; count: number; missing: number; unique: number;
    num?: NumStats;
    top?: { value: string; count: number }[];
    dateMin?: string; dateMax?: string; gran?: string; series?: Hist;
    minLen?: number; maxLen?: number;
}

export interface StockItem {
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    totalValue: number;
    status: 'critical' | 'low' | 'healthy' | 'overstock';
    statusLabel: string;
    reorderRecommendation: number;
    estimatedCost: number;
    priority: 'Urgent' | 'High' | 'Normal';
    abcClass: 'A' | 'B' | 'C';
}

export interface StockAnalysis {
    detected: boolean;
    itemCol: string;
    qtyCol: string;
    priceCol?: string;
    categoryCol?: string;
    kpis: {
        totalSKUs: number;
        totalStockVolume: number;
        totalValuation: number;
        averageStockPerItem: number;
        criticalCount: number;
        lowCount: number;
        healthyCount: number;
        overstockCount: number;
    };
    items: StockItem[];
    topStock: { label: string; value: number }[];
    bottomStock: { label: string; value: number }[];
    categoryValuation: { label: string; value: number; count: number }[];
    statusDistribution: { label: string; count: number }[];
    abcSummary: {
        classA: { count: number; pctCount: number; valPct: number };
        classB: { count: number; pctCount: number; valPct: number };
        classC: { count: number; pctCount: number; valPct: number };
    };
}

export interface NeedsAnalysis {
    totalProcurementBudget: number;
    urgentItemCount: number;
    highPriorityCount: number;
    procurementItems: {
        name: string;
        category: string;
        currentStock: number;
        recommendedQty: number;
        estimatedCost: number;
        priority: string;
    }[];
    operationalInsights: string[];
    riskWarnings: string[];
    actionPlan: {
        title: string;
        description: string;
        type: 'critical' | 'warning' | 'info' | 'success';
    }[];
}

export interface CsvHealth {
    qualityScore: number;
    qualityRating: string;
    completenessScore: number;
    consistencyScore: number;
    integrityScore: number;
    totalCells: number;
    populatedCells: number;
    missingCells: number;
    duplicateRows: number;
    outlierColsCount: number;
    checklist: {
        category: string;
        item: string;
        status: 'pass' | 'warn' | 'fail';
        detail: string;
    }[];
    cleaningRecommendations: string[];
}

export interface SheetResult {
    name: string;
    headers: string[];
    rows: (string | number | boolean | null)[][];
    totalRows: number;
    truncated: boolean;
    columns: ColumnInfo[];
    duplicates: number;
    missingCells: number;
    corr: { cols: string[]; matrix: (number | null)[][] };
    scatters: { x: string; y: string; r: number; points: [number, number][] }[];
    groupBars: { cat: string; num: string; labels: string[]; means: number[]; counts: number[] }[];
    trends: { date: string; num: string; gran: string; labels: string[]; values: number[] }[];
    crosstab?: { a: string; b: string; labels: string[]; series: { name: string; data: number[] }[] };
    insights: string[];
    stockAnalysis?: StockAnalysis;
    needsAnalysis?: NeedsAnalysis;
    csvHealth: CsvHealth;
    businessKpi?: BusinessKpi;
    decisionTreeAnalysis?: DecisionTreeAnalysis | null;
}
export interface WorkbookResult { fileName: string; sheets: SheetResult[] }

const MAX_ROWS = 200_000;
const PREVIEW_ROWS = 50_000;
const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '#n/a']);

const round = (x: number) => Math.round(x * 1000) / 1000;
export const fmt = (x: number) =>
    Math.abs(x) >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Math.round(x * 100) / 100);

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dispDate = (d: Date) => {
    if (!(d instanceof Date) || isNaN(+d)) { return ''; }
    return ymd(d) + (d.getHours() || d.getMinutes() ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
};
const keyOf = (v: Val) => (v instanceof Date ? dispDate(v) : String(v));

function parseDate(s: string): Date | null {
    const ym = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (ym) {
        const yr = +ym[1], mo = +ym[2] - 1, da = +ym[3];
        const hr = +(ym[4] || 0), mi = +(ym[5] || 0), sc = +(ym[6] || 0);
        const d = new Date(yr, mo, da, hr, mi, sc);
        return isNaN(+d) || d.getMonth() !== mo ? null : d;
    }
    const dm = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dm) {
        const p1 = +dm[1], p2 = +dm[2], yr = +dm[3];
        const hr = +(dm[4] || 0), mi = +(dm[5] || 0), sc = +(dm[6] || 0);
        let mo: number, da: number;
        if (p1 > 12 && p2 <= 12) {
            da = p1; mo = p2 - 1;
        } else if (p2 > 12 && p1 <= 12) {
            mo = p1 - 1; da = p2;
        } else {
            da = p1; mo = p2 - 1;
        }
        const d = new Date(yr, mo, da, hr, mi, sc);
        return isNaN(+d) || d.getMonth() !== mo ? null : d;
    }
    const fallback = new Date(s);
    return isNaN(+fallback) ? null : fallback;
}

function coerce(v: unknown): Cell {
    if (v === null || v === undefined) { return null; }
    if (v instanceof Date) { return isNaN(+v) ? null : v; }
    if (typeof v === 'number') { return isFinite(v) ? v : null; }
    if (typeof v === 'boolean') { return v; }
    const s = String(v).trim();
    if (MISSING.has(s.toLowerCase())) { return null; }
    if (/^[-+]?(\d{1,3}(,\d{3})+(\.\d+)?|\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) {
        const cleaned = s.replace(/,/g, '');
        const num = parseFloat(cleaned);
        if (isFinite(num)) { return num; }
    }
    if (/^(true|false)$/i.test(s)) { return s.toLowerCase() === 'true'; }
    if (/^\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}/.test(s) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}/.test(s)) {
        const d = parseDate(s);
        if (d) { return d; }
    }
    return s;
}

function inferType(vals: Val[], name: string, unique: number): ColType {
    const n = vals.length;
    if (!n) { return 'text'; }
    let nums = 0, ints = 0, dates = 0, bools = 0;
    for (const v of vals) {
        if (typeof v === 'number') { nums++; if (Number.isInteger(v)) { ints++; } }
        else if (v instanceof Date) { dates++; }
        else if (typeof v === 'boolean') { bools++; }
    }
    if (bools / n >= 0.9) { return 'boolean'; }
    if (dates / n >= 0.9) { return 'date'; }
    if (nums / n >= 0.9) {
        if (ints === nums && unique === n && n > 1 && /(^|[_\s-])id$|^id($|[_\s-])|^kode|^no$/i.test(name.trim())) { return 'id'; }
        return ints === nums ? 'integer' : 'number';
    }
    if ((unique <= 50 && unique / n <= 0.5) || unique <= 12) { return 'category'; }
    return 'text';
}

function quantile(s: number[], p: number): number {
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function histogram(s: number[]): Hist {
    const min = s[0], max = s[s.length - 1];
    if (min === max) { return { labels: [fmt(min)], counts: [s.length] }; }
    const k = Math.max(5, Math.min(30, Math.ceil(Math.log2(s.length) + 1)));
    const w = (max - min) / k;
    const counts = new Array<number>(k).fill(0);
    for (const v of s) { counts[Math.min(k - 1, Math.floor((v - min) / w))]++; }
    return { labels: counts.map((_, i) => `${fmt(min + i * w)} – ${fmt(min + (i + 1) * w)}`), counts };
}

function numStats(values: number[]): NumStats {
    const s = [...values].sort((a, b) => a - b);
    const n = s.length;
    const sum = s.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const std = n > 1 ? Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    const q1 = quantile(s, 0.25), median = quantile(s, 0.5), q3 = quantile(s, 0.75);
    const iqr = q3 - q1, lower = q1 - 1.5 * iqr, upper = q3 + 1.5 * iqr;
    const skew = std > 0 ? s.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n : 0;
    const outliers = s.filter((v) => v < lower || v > upper).length;
    return {
        min: s[0], max: s[n - 1], mean: round(mean), median: round(median), std: round(std), q1: round(q1), q3: round(q3),
        sum: round(sum), skew: round(skew), outliers, lower: round(lower), upper: round(upper), hist: histogram(s)
    };
}

function pickGran(min: number, max: number): string {
    const days = (max - min) / 864e5;
    return days > 365 * 5 ? 'year' : days > 90 ? 'month' : 'day';
}
function periodKey(d: Date, gran: string): string {
    return gran === 'year' ? `${d.getFullYear()}` : gran === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : ymd(d);
}

function pearson(a: Cell[], b: Cell[]): number | null {
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) { continue; }
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    if (n < 3) { return null; }
    const vx = n * sxx - sx * sx;
    const vy = n * syy - sy * sy;
    if (vx <= 0 || vy <= 0) { return null; }
    const d = Math.sqrt(vx * vy);
    if (!d || !isFinite(d)) { return null; }
    const r = (n * sxy - sx * sy) / d;
    if (!isFinite(r)) { return null; }
    return round(Math.max(-1, Math.min(1, r)));
}

function computeCsvHealth(headers: string[], bodyLength: number, columns: ColumnInfo[], duplicates: number, missingCells: number): CsvHealth {
    const totalCells = (bodyLength || 1) * (headers.length || 1);
    const populatedCells = Math.max(0, totalCells - missingCells);
    const completenessScore = Math.max(0, Math.min(100, Math.round((populatedCells / totalCells) * 1000) / 10));
    const integrityScore = Math.max(0, Math.min(100, Math.round((1 - duplicates / (bodyLength || 1)) * 1000) / 10));
    const consistentCols = columns.filter((c) => c.count > 0 && c.missing / (bodyLength || 1) < 0.5).length;
    const consistencyScore = Math.max(0, Math.min(100, Math.round((consistentCols / (headers.length || 1)) * 1000) / 10));
    const qualityScore = Math.round(completenessScore * 0.45 + integrityScore * 0.35 + consistencyScore * 0.2);

    let qualityRating = '🟢 Sangat Sehat (Excellent Quality)';
    if (qualityScore < 50) {
        qualityRating = '🔴 Kritis (Poor Quality - Needs Deep Cleaning)';
    } else if (qualityScore < 75) {
        qualityRating = '🟠 Perlu Pembersihan (Moderate - Needs Attention)';
    } else if (qualityScore < 90) {
        qualityRating = '🟡 Cukup Baik (Good Quality - Minor Cleanups)';
    }

    const outlierCols = columns.filter((c) => c.num && c.num.outliers > 0);
    const checklist: CsvHealth['checklist'] = [
        {
            category: 'Kelengkapan Nilai',
            item: 'Missing / Null Values',
            status: missingCells === 0 ? 'pass' : (missingCells / totalCells < 0.05 ? 'warn' : 'fail'),
            detail: missingCells === 0 ? 'Lengkap 100% tanpa sel kosong' : `${missingCells.toLocaleString()} sel kosong (${((missingCells / totalCells) * 100).toFixed(1)}%)`
        },
        {
            category: 'Integritas Rekor',
            item: 'Duplikasi Baris (Duplicates)',
            status: duplicates === 0 ? 'pass' : (duplicates / (bodyLength || 1) < 0.02 ? 'warn' : 'fail'),
            detail: duplicates === 0 ? 'Tidak ada baris duplikat' : `${duplicates.toLocaleString()} baris duplikat terdeteksi`
        },
        {
            category: 'Konsistensi Tipe Data',
            item: 'Struktur Kolom & Tipe Data',
            status: consistencyScore >= 80 ? 'pass' : 'warn',
            detail: `${columns.filter((c) => c.type !== 'text').length} kolom bertipe terstruktur (numerik/tanggal/kategori)`
        },
        {
            category: 'Deteksi Anomali / Outlier',
            item: 'Nilai Ekstrem (Numeric Outliers)',
            status: outlierCols.length === 0 ? 'pass' : (outlierCols.length <= 2 ? 'warn' : 'fail'),
            detail: outlierCols.length === 0 ? 'Tidak ada anomali ekstrem signifikan' : `${outlierCols.length} kolom memiliki pencilan data (outlier)`
        },
        {
            category: 'Skema CSV',
            item: 'Kerapatan & Densitas Data',
            status: 'pass',
            detail: `${headers.length} kolom × ${bodyLength.toLocaleString()} baris (${populatedCells.toLocaleString()} nilai terisi)`
        }
    ];

    const cleaningRecommendations: string[] = [];
    if (missingCells > 0) {
        cleaningRecommendations.push(`Terdapat ${missingCells.toLocaleString()} sel kosong. Dianjurkan melakukan imputasi (median/mean) atau filtering data sebelum pemodelan.`);
    }
    if (duplicates > 0) {
        cleaningRecommendations.push(`Hapus ${duplicates.toLocaleString()} baris duplikat untuk mencegah bias kalkulasi.`);
    }
    if (outlierCols.length > 0) {
        cleaningRecommendations.push(`Tinjau kolom dengan outlier: ${outlierCols.slice(0, 3).map((c) => `"${c.name}"`).join(', ')}.`);
    }
    if (!cleaningRecommendations.length) {
        cleaningRecommendations.push('Kualitas file CSV sangat bersih dan konsisten.');
    }

    return {
        qualityScore, qualityRating, completenessScore, consistencyScore, integrityScore,
        totalCells, populatedCells, missingCells, duplicateRows: duplicates, outlierColsCount: outlierCols.length,
        checklist, cleaningRecommendations
    };
}

function computeStockAndNeedsAnalysis(
    headers: string[],
    cols: Cell[][],
    columns: ColumnInfo[],
    bodyLength: number
): { stock?: StockAnalysis; needs?: NeedsAnalysis } {
    if (!bodyLength || !headers.length) { return {}; }

    const itemPattern = /(^|[_\s-])(item|product|produk|barang|nama[-_\s]?barang|product[-_\s]?line|sku|kode[-_\s]?barang|part[-_\s]?number|article|komoditas|name|nama|title)($|[_\s-])/i;
    const qtyPattern = /(^|[_\s-])(qty|quantity|stok|stock|jumlah|volume|stock[-_\s]?on[-_\s]?hand|saldo|saldo[-_\s]?stok|unit|kuantitas|count|terjual|sales[-_\s]?qty)($|[_\s-])/i;
    const pricePattern = /(^|[_\s-])(price|harga|unit[-_\s]?price|harga[-_\s]?satuan|cost|modal|cogs|rate|nilai|amount|total|subtotal)($|[_\s-])/i;
    const catPattern = /(^|[_\s-])(category|kategori|group|jenis|tipe|product[-_\s]?line|department|divisi|brand|merk)($|[_\s-])/i;

    let itemIdx = headers.findIndex((h) => itemPattern.test(h));
    if (itemIdx < 0) {
        // Prefer category columns first (more likely to be item names), then text columns
        itemIdx = columns.findIndex((c, i) => c.type === 'category' && c.unique >= 2 && c.unique <= 2000);
    }
    if (itemIdx < 0) {
        itemIdx = columns.findIndex((c, i) => c.type === 'text' && c.unique >= 2 && c.unique <= 2000);
    }

    let qtyIdx = headers.findIndex((h) => qtyPattern.test(h));
    if (qtyIdx < 0) {
        qtyIdx = columns.findIndex((c, i) =>
            i !== itemIdx && (c.type === 'integer' || c.type === 'number') &&
            !/(id|year|month|day|date|rating|rank|pct|percent|discount|tax|margin|lat|lon|zip)/i.test(headers[i]) &&
            (c.num ? c.num.min >= 0 && c.num.mean > 0 : true)
        );
    }

    if (itemIdx < 0 || qtyIdx < 0) {
        return {};
    }

    const itemColName = headers[itemIdx];
    const qtyColName = headers[qtyIdx];

    let priceIdx = headers.findIndex((h, i) => i !== qtyIdx && pricePattern.test(h));
    if (priceIdx < 0) {
        priceIdx = columns.findIndex((c, i) =>
            i !== qtyIdx && i !== itemIdx && (c.type === 'number' || c.type === 'integer') &&
            /(price|harga|cost|total|amount|cogs|nilai)/i.test(headers[i])
        );
    }
    const priceColName = priceIdx >= 0 ? headers[priceIdx] : undefined;

    let catIdx = headers.findIndex((h, i) => i !== itemIdx && catPattern.test(h));
    if (catIdx < 0) {
        catIdx = columns.findIndex((c, i) => i !== itemIdx && i !== qtyIdx && c.type === 'category' && c.unique >= 2 && c.unique <= 25);
    }
    const catColName = catIdx >= 0 ? headers[catIdx] : undefined;

    interface AggItem {
        name: string;
        categories: Map<string, number>;
        totalQty: number;
        sumPrice: number;
        count: number;
    }
    const aggMap = new Map<string, AggItem>();

    for (let r = 0; r < bodyLength; r++) {
        const itemVal = cols[itemIdx][r];
        if (itemVal === null || itemVal === undefined) { continue; }
        const name = String(itemVal).trim();
        if (!name) { continue; }

        const qRaw = cols[qtyIdx][r];
        const q = typeof qRaw === 'number' && isFinite(qRaw) ? Math.max(0, qRaw) : 1;

        let p = 0;
        if (priceIdx >= 0) {
            const pRaw = cols[priceIdx][r];
            if (typeof pRaw === 'number' && isFinite(pRaw)) { p = Math.max(0, pRaw); }
        }

        const cat = catIdx >= 0 && cols[catIdx][r] !== null ? String(cols[catIdx][r]).trim() : 'Umum';

        let item = aggMap.get(name);
        if (!item) {
            item = { name, categories: new Map(), totalQty: 0, sumPrice: 0, count: 0 };
            aggMap.set(name, item);
        }
        item.totalQty += q;
        item.sumPrice += p * q;
        item.count++;
        item.categories.set(cat, (item.categories.get(cat) || 0) + 1);
    }

    if (!aggMap.size) { return {}; }

    const rawItems = [...aggMap.values()];
    const qtys = rawItems.map((it) => it.totalQty).sort((a, b) => a - b);
    const medianQty = qtys[Math.floor(qtys.length * 0.5)] || 1;

    const critThresh = Math.max(1, Math.round(medianQty * 0.15));
    const lowThresh = Math.max(2, Math.round(medianQty * 0.4));
    const overThresh = Math.max(15, Math.round(medianQty * 2.5));

    let totalStockVolume = 0;
    let totalValuation = 0;
    let criticalCount = 0;
    let lowCount = 0;
    let healthyCount = 0;
    let overstockCount = 0;

    const stockItems: StockItem[] = rawItems.map((it) => {
        const quantity = round(it.totalQty);
        totalStockVolume += quantity;

        let topCat = 'Umum';
        let topCatCount = -1;
        it.categories.forEach((cnt, cname) => {
            if (cnt > topCatCount) { topCatCount = cnt; topCat = cname; }
        });

        const unitPrice = it.totalQty > 0 && it.sumPrice > 0 ? round(it.sumPrice / it.totalQty) : (it.count > 0 && it.sumPrice > 0 ? round(it.sumPrice / it.count) : 0);
        const totalValue = round(quantity * (unitPrice || 1));
        totalValuation += totalValue;

        let status: StockItem['status'] = 'healthy';
        let statusLabel = 'Stok Aman';
        let priority: StockItem['priority'] = 'Normal';
        let reorderRecommendation = 0;

        if (quantity <= critThresh) {
            status = 'critical';
            statusLabel = 'Kritis / Habis';
            priority = 'Urgent';
            reorderRecommendation = Math.max(5, Math.round(medianQty * 1.5) - Math.max(0, quantity));
            criticalCount++;
        } else if (quantity <= lowThresh) {
            status = 'low';
            statusLabel = 'Menipis';
            priority = 'High';
            reorderRecommendation = Math.max(2, Math.round(medianQty * 1.2) - Math.max(0, quantity));
            lowCount++;
        } else if (quantity >= overThresh) {
            status = 'overstock';
            statusLabel = 'Overstock';
            priority = 'Normal';
            reorderRecommendation = 0;
            overstockCount++;
        } else {
            status = 'healthy';
            statusLabel = 'Stok Aman';
            priority = 'Normal';
            reorderRecommendation = 0;
            healthyCount++;
        }

        const estimatedCost = round(reorderRecommendation * (unitPrice || 10));

        return {
            name: it.name,
            category: topCat,
            quantity,
            unitPrice,
            totalValue,
            status,
            statusLabel,
            reorderRecommendation,
            estimatedCost,
            priority,
            abcClass: 'C'
        };
    });

    stockItems.sort((a, b) => (totalValuation > 0 ? b.totalValue - a.totalValue : b.quantity - a.quantity));
    let cumVal = 0;
    const baseVal = totalValuation > 0 ? totalValuation : (totalStockVolume || 1);
    let classACount = 0, classBCount = 0, classCCount = 0;
    let classAVal = 0, classBVal = 0, classCVal = 0;

    stockItems.forEach((item) => {
        const itemMetric = totalValuation > 0 ? item.totalValue : item.quantity;
        cumVal += itemMetric;
        const cumRatio = cumVal / baseVal;
        if (cumRatio <= 0.70 || classACount === 0) {
            item.abcClass = 'A';
            classACount++;
            classAVal += itemMetric;
        } else if (cumRatio <= 0.90 || classBCount === 0) {
            item.abcClass = 'B';
            classBCount++;
            classBVal += itemMetric;
        } else {
            item.abcClass = 'C';
            classCCount++;
            classCVal += itemMetric;
        }
    });

    const totalSKUs = stockItems.length;
    const averageStockPerItem = totalSKUs > 0 ? round(totalStockVolume / totalSKUs) : 0;

    const catMap = new Map<string, { value: number; count: number }>();
    stockItems.forEach((it) => {
        const c = catMap.get(it.category) || { value: 0, count: 0 };
        c.value += it.totalValue || it.quantity;
        c.count++;
        catMap.set(it.category, c);
    });
    const categoryValuation = [...catMap.entries()]
        .map(([label, d]) => ({ label, value: round(d.value), count: d.count }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const topStock = [...stockItems]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
        .map((it) => ({ label: it.name, value: it.quantity }));

    const bottomStock = [...stockItems]
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 10)
        .map((it) => ({ label: it.name, value: it.quantity }));

    const statusDistribution = [
        { label: 'Kritis / Habis', count: criticalCount },
        { label: 'Menipis', count: lowCount },
        { label: 'Stok Aman', count: healthyCount },
        { label: 'Overstock', count: overstockCount }
    ];

    const abcSummary = {
        classA: {
            count: classACount,
            pctCount: round((classACount / (totalSKUs || 1)) * 100),
            valPct: round((classAVal / (baseVal || 1)) * 100)
        },
        classB: {
            count: classBCount,
            pctCount: round((classBCount / (totalSKUs || 1)) * 100),
            valPct: round((classBVal / (baseVal || 1)) * 100)
        },
        classC: {
            count: classCCount,
            pctCount: round((classCCount / (totalSKUs || 1)) * 100),
            valPct: round((classCVal / (baseVal || 1)) * 100)
        }
    };

    const stock: StockAnalysis = {
        detected: true,
        itemCol: itemColName,
        qtyCol: qtyColName,
        priceCol: priceColName,
        categoryCol: catColName,
        kpis: {
            totalSKUs,
            totalStockVolume: round(totalStockVolume),
            totalValuation: round(totalValuation),
            averageStockPerItem,
            criticalCount,
            lowCount,
            healthyCount,
            overstockCount
        },
        items: stockItems,
        topStock,
        bottomStock,
        categoryValuation,
        statusDistribution,
        abcSummary
    };

    const restockCandidates = stockItems
        .filter((it) => it.status === 'critical' || it.status === 'low')
        .sort((a, b) => {
            const pa = a.priority === 'Urgent' ? 0 : a.priority === 'High' ? 1 : 2;
            const pb = b.priority === 'Urgent' ? 0 : b.priority === 'High' ? 1 : 2;
            return pa !== pb ? pa - pb : b.estimatedCost - a.estimatedCost;
        });

    const totalProcurementBudget = round(restockCandidates.reduce((sum, it) => sum + it.estimatedCost, 0));
    const urgentItemCount = restockCandidates.filter((it) => it.priority === 'Urgent').length;
    const highPriorityCount = restockCandidates.filter((it) => it.priority === 'High').length;

    const procurementItems = restockCandidates.map((it) => ({
        name: it.name,
        category: it.category,
        currentStock: it.quantity,
        recommendedQty: it.reorderRecommendation,
        estimatedCost: it.estimatedCost,
        priority: it.priority
    }));

    const operationalInsights: string[] = [
        `Estimasi total kebutuhan anggaran pengadaan (Procurement Budget) sebesar ${fmt(totalProcurementBudget)} untuk merestok ${restockCandidates.length} SKU prioritas.`,
        `Terdapat ${urgentItemCount} item dalam kondisi Kritis/Habis stok yang memerlukan order darurat segera guna mencegah lost sales (kehilangan penjualan).`,
        `Kategori "${categoryValuation[0]?.label || 'Utama'}" memegang porsi nilai perputaran terbesar (${categoryValuation[0] ? fmt(categoryValuation[0].value) : 0}), disarankan menjaga buffer stock secara konsisten.`
    ];

    if (overstockCount > 0) {
        operationalInsights.push(`Sebanyak ${overstockCount} produk mengalami Overstock (kelebihan kuantitas). Dianjurkan program diskon, bundle promo, atau restrukturisasi pemesanan untuk mencairkan modal kerja.`);
    }

    const riskWarnings: string[] = [];
    if (criticalCount > 0) {
        riskWarnings.push(`Risiko Stockout: ${criticalCount} barang berada di bawah ambang batas kritis. Konsumen dapat beralih ke kompetitor jika tidak segera dipasok.`);
    }
    if (overstockCount > 0) {
        riskWarnings.push(`Risiko Dead Stock / Holding Cost: Biaya simpan dan depresiasi barang overstock berpotensi menekan margin laba.`);
    }
    if (categoryValuation[0] && baseVal > 0 && (categoryValuation[0].value / baseVal) > 0.4) {
        riskWarnings.push(`Ketergantungan Kategori Tinggi: Kategori "${categoryValuation[0].label}" mendominasi lebih dari 40% perputaran. Diversifikasi lini produk dianjurkan.`);
    }

    const actionPlan: NeedsAnalysis['actionPlan'] = [
        {
            title: '1. Terbitkan Purchase Order Darurat (Urgent PO)',
            description: `Segera lakukan pengadaan untuk ${urgentItemCount} item berstatus kritis dengan prioritas utama.`,
            type: urgentItemCount > 0 ? 'critical' : 'success'
        },
        {
            title: '2. Terapkan Kebijakan Reorder Point (ROP) Otomatis',
            description: `Pasang ambang batas minimum pemesanan pada ${highPriorityCount} item berstatus stok menipis sebelum mencapai level habis.`,
            type: highPriorityCount > 0 ? 'warning' : 'info'
        },
        {
            title: '3. Likuidasi Modal & Clearance Sale Overstock',
            description: overstockCount > 0 ? `Luncurkan strategi bundle atau promo khusus untuk ${overstockCount} SKU overstock agar kas kembali likuid.` : 'Kapasitas stok efisien tanpa indikasi penumpukan berlebih.',
            type: overstockCount > 0 ? 'info' : 'success'
        },
        {
            title: '4. Pengawasan Ketat Aset Kelas A (Pareto 80/20)',
            description: `Fokuskan akurasi stock opname mingguan pada ${classACount} SKU Kelas A yang menyumbang ${abcSummary.classA.valPct}% nilai keseluruhan.`,
            type: 'success'
        }
    ];

    const needs: NeedsAnalysis = {
        totalProcurementBudget,
        urgentItemCount,
        highPriorityCount,
        procurementItems,
        operationalInsights,
        riskWarnings,
        actionPlan
    };

    return { stock, needs };
}

function analyzeSheet(name: string, input: unknown[][], treeOptions?: DecisionTreeOptions): SheetResult | null {
    const aoa = input.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
    if (!aoa.length) { return null; }
    const width = aoa.reduce((m, r) => Math.max(m, r.length), 0);
    const used = new Map<string, number>();
    const headers = Array.from({ length: width }, (_, i) => {
        const h = String(aoa[0][i] ?? '').trim() || `Column ${i + 1}`;
        const c = used.get(h) ?? 0;
        used.set(h, c + 1);
        return c ? `${h} (${c + 1})` : h;
    });
    let body = aoa.slice(1);
    const totalRows = body.length;
    const truncated = totalRows > MAX_ROWS;
    if (truncated) { body = body.slice(0, MAX_ROWS); }
    const cols: Cell[][] = headers.map((_, c) => body.map((r) => coerce(r[c])));

    // ---- column analysis ----
    const columns: ColumnInfo[] = headers.map((h, c) => {
        const vals = cols[c].filter((v): v is Val => v !== null);
        const counts = new Map<string, number>();
        for (const v of vals) { const k = keyOf(v); counts.set(k, (counts.get(k) ?? 0) + 1); }
        const unique = counts.size;
        const type = inferType(vals, h, unique);
        const info: ColumnInfo = { name: h, type, count: vals.length, missing: body.length - vals.length, unique };
        if (type === 'number' || type === 'integer') {
            const nums = vals.filter((v): v is number => typeof v === 'number');
            if (nums.length) { info.num = numStats(nums); }
        }
        const wantTop = type === 'category' || type === 'boolean' || (type === 'integer' && unique <= 15) || (type === 'text' && unique < vals.length);
        if (wantTop) {
            info.top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([value, count]) => ({ value, count }));
        }
        if (type === 'date') {
            const ds = vals.filter((v): v is Date => v instanceof Date);
            let mn = Infinity, mx = -Infinity;
            for (const d of ds) { mn = Math.min(mn, +d); mx = Math.max(mx, +d); }
            const gran = pickGran(mn, mx);
            const agg = new Map<string, number>();
            for (const d of ds) { const k = periodKey(d, gran); agg.set(k, (agg.get(k) ?? 0) + 1); }
            const keys = [...agg.keys()].sort();
            info.dateMin = dispDate(new Date(mn)); info.dateMax = dispDate(new Date(mx)); info.gran = gran;
            info.series = { labels: keys, counts: keys.map((k) => agg.get(k)!) };
        }
        if (type === 'text') {
            let lo = Infinity, hi = 0;
            for (const v of vals) { const l = String(v).length; lo = Math.min(lo, l); hi = Math.max(hi, l); }
            info.minLen = lo === Infinity ? 0 : lo; info.maxLen = hi;
        }
        return info;
    });

    // ---- preview rows, duplicates, missing cells ----
    const rows = body.slice(0, PREVIEW_ROWS).map((_, i) =>
        headers.map((__, c) => {
            const v = cols[c][i];
            return v === null ? null : v instanceof Date ? dispDate(v) : v;
        }));
    const seen = new Set<string>();
    let duplicates = 0;
    for (const r of body) { const k = JSON.stringify(r); if (seen.has(k)) { duplicates++; } else { seen.add(k); } }
    const missingCells = columns.reduce((a, c) => a + c.missing, 0);

    // ---- correlation & scatter ----
    const numIdx = columns.map((c, i) => ({ c, i })).filter((x) => x.c.num && x.c.num.std > 0).map((x) => x.i);
    const corrIdx = numIdx.slice(0, 12);
    const matrix: (number | null)[][] = corrIdx.map((i) => corrIdx.map((j) => (i === j ? 1 : pearson(cols[i], cols[j]))));
    const pairs: { i: number; j: number; r: number }[] = [];
    for (let a = 0; a < corrIdx.length; a++) {
        for (let b = a + 1; b < corrIdx.length; b++) {
            const r = matrix[a][b];
            if (r !== null) { pairs.push({ i: corrIdx[a], j: corrIdx[b], r }); }
        }
    }
    pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
    const scatters = pairs.slice(0, 4).map(({ i, j, r }) => {
        const pts: [number, number][] = [];
        for (let k = 0; k < body.length; k++) {
            const x = cols[i][k], y = cols[j][k];
            if (typeof x === 'number' && typeof y === 'number') { pts.push([x, y]); }
        }
        const step = Math.max(1, Math.ceil(pts.length / 600));
        return { x: headers[i], y: headers[j], r, points: pts.filter((_, k) => k % step === 0) };
    });

    // ---- group by categorical ----
    const catIdx = columns.map((c, i) => ({ c, i })).filter((x) => x.c.type === 'category' && x.c.unique >= 2 && x.c.unique <= 12)
        .sort((a, b) => a.c.unique - b.c.unique).map((x) => x.i);
    const groupBars: SheetResult['groupBars'] = [];
    for (const ci of catIdx.slice(0, 2)) {
        for (const ni of numIdx.slice(0, 2)) {
            const agg = new Map<string, [number, number]>();
            for (let k = 0; k < body.length; k++) {
                const cv = cols[ci][k], nv = cols[ni][k];
                if (cv === null || typeof nv !== 'number') { continue; }
                const key = keyOf(cv), a = agg.get(key) ?? [0, 0];
                a[0] += nv; a[1]++; agg.set(key, a);
            }
            const ent = [...agg.entries()].map(([k, [s, n]]) => ({ k, m: round(s / n), n })).sort((x, y) => y.m - x.m);
            groupBars.push({ cat: headers[ci], num: headers[ni], labels: ent.map((e) => e.k), means: ent.map((e) => e.m), counts: ent.map((e) => e.n) });
        }
    }

    // ---- time trend ----
    const trends: SheetResult['trends'] = [];
    const di = columns.findIndex((c) => c.type === 'date');
    if (di >= 0) {
        const gran = columns[di].gran ?? 'month';
        for (const ni of numIdx.slice(0, 2)) {
            const agg = new Map<string, [number, number]>();
            for (let k = 0; k < body.length; k++) {
                const d = cols[di][k], v = cols[ni][k];
                if (d instanceof Date && typeof v === 'number') {
                    const key = periodKey(d, gran), a = agg.get(key) ?? [0, 0];
                    a[0] += v; a[1]++; agg.set(key, a);
                }
            }
            const keys = [...agg.keys()].sort();
            if (keys.length > 1) {
                trends.push({ date: headers[di], num: headers[ni], gran, labels: keys, values: keys.map((k) => round(agg.get(k)![0] / agg.get(k)![1])) });
            }
        }
    }

    // ---- crosstab category x category ----
    let crosstab: SheetResult['crosstab'];
    if (catIdx.length >= 2) {
        const topKeys = (ci: number, k: number) => {
            const m = new Map<string, number>();
            for (const v of cols[ci]) { if (v !== null) { const key = keyOf(v); m.set(key, (m.get(key) ?? 0) + 1); } }
            return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, k).map((x) => x[0]);
        };
        const ai = catIdx[1], bi = catIdx[0];
        const aKeys = topKeys(ai, 8), bKeys = topKeys(bi, 6);
        const grid = bKeys.map(() => aKeys.map(() => 0));
        for (let k = 0; k < body.length; k++) {
            const av = cols[ai][k], bv = cols[bi][k];
            if (av === null || bv === null) { continue; }
            const x = aKeys.indexOf(keyOf(av)), y = bKeys.indexOf(keyOf(bv));
            if (x >= 0 && y >= 0) { grid[y][x]++; }
        }
        crosstab = { a: headers[ai], b: headers[bi], labels: aKeys, series: bKeys.map((n, y) => ({ name: n, data: grid[y] })) };
    }

    // ---- CSV Health, Stock Analysis, Needs Analysis ----
    const csvHealth = computeCsvHealth(headers, body.length, columns, duplicates, missingCells);
    const { stock: stockAnalysis, needs: needsAnalysis } = computeStockAndNeedsAnalysis(headers, cols, columns, body.length);

    // ---- automated insights ----
    const insights: string[] = [];
    const nBody = body.length;
    insights.push(`Dataset contains ${totalRows.toLocaleString('en-US')} rows and ${headers.length} columns (${numIdx.length} numeric, ${columns.filter((c) => c.type === 'category').length} categorical, ${columns.filter((c) => c.type === 'date').length} date).`);
    insights.push(`🩺 Skor Kualitas File CSV: ${csvHealth.qualityScore}% (${csvHealth.qualityRating}).`);
    if (truncated) { insights.push(`Large dataset — analyzed first ${MAX_ROWS.toLocaleString('en-US')} rows.`); }
    if (missingCells === 0) { insights.push('✅ No missing values — dataset is complete.'); }
    else { insights.push(`Found ${missingCells.toLocaleString('en-US')} missing cells (${((missingCells / (nBody * headers.length || 1)) * 100).toFixed(1)}% of all cells).`); }
    for (const c of columns.filter((c) => nBody && c.missing / nBody > 0.2)) { insights.push(`⚠️ Column "${c.name}" has ${((c.missing / nBody) * 100).toFixed(0)}% missing values.`); }
    if (duplicates > 0) { insights.push(`⚠️ Found ${duplicates.toLocaleString('en-US')} duplicate rows.`); }
    for (const c of columns.filter((c) => c.unique === 1 && c.count > 1)) { insights.push(`Column "${c.name}" contains only a single constant value.`); }
    for (const c of columns.filter((c) => c.type === 'id')) { insights.push(`Column "${c.name}" detected as identifier (not analyzed as numeric).`); }
    for (const c of columns.filter((c) => c.num && c.count && c.num.outliers / c.count > 0.05)) { insights.push(`⚠️ Column "${c.name}" has ${c.num!.outliers} outliers (${((c.num!.outliers / c.count) * 100).toFixed(1)}%).`); }
    for (const c of columns.filter((c) => c.num && Math.abs(c.num.skew) > 1).slice(0, 5)) { insights.push(`Distribution of "${c.name}" is ${c.num!.skew > 0 ? 'skewed right (positive skew)' : 'skewed left (negative skew)'} (skewness ${c.num!.skew}).`); }
    for (const p of pairs.filter((p) => Math.abs(p.r) >= 0.7).slice(0, 4)) { insights.push(`🔗 Strong ${p.r > 0 ? 'positive' : 'negative'} correlation between "${headers[p.i]}" and "${headers[p.j]}" (r = ${p.r}).`); }
    for (const c of columns.filter((c) => c.type === 'date')) { insights.push(`Date range for "${c.name}": ${c.dateMin} → ${c.dateMax}.`); }
    for (const c of columns.filter((c) => c.type === 'category' && c.top && c.top.length > 0 && c.count > 0).slice(0, 4)) { insights.push(`Most frequent value in "${c.name}": ${c.top![0].value} (${((c.top![0].count / c.count) * 100).toFixed(0)}%).`); }

    if (stockAnalysis) {
        insights.push(`Analisis Stok Barang: Terdeteksi ${stockAnalysis.kpis.totalSKUs} produk unik dengan total kuantitas ${fmt(stockAnalysis.kpis.totalStockVolume)} unit${stockAnalysis.kpis.totalValuation ? ` (Valuasi Aset: ${fmt(stockAnalysis.kpis.totalValuation)})` : ''}.`);
        if (stockAnalysis.kpis.criticalCount > 0) {
            insights.push(`Perhatian Stok: ${stockAnalysis.kpis.criticalCount} item Kritis/Habis dan ${stockAnalysis.kpis.lowCount} item Menipis membutuhkan restock.`);
        }
        if (needsAnalysis && needsAnalysis.totalProcurementBudget > 0) {
            insights.push(`Analisis Kebutuhan: Estimasi anggaran restock pengadaan sebesar ${fmt(needsAnalysis.totalProcurementBudget)}.`);
        }
    }

    // ---- KPI bisnis (dihitung setelah headers, rows, columns, dan insights siap) ----
    const businessKpi = computeBusinessKpi({ headers, rows, columns });
    if (businessKpi) { insights.push(...businessKpi.insights.map((s) => `📈 ${s}`)); }

    // ---- Decision Tree C4.5 Analysis ----
    let decisionTreeAnalysis: DecisionTreeAnalysis | undefined | null;
    try {
        // Convert data to format for decision tree
        const dataForDT = body.map((row, idx) => {
            const obj: Record<string, any> = {};
            headers.forEach((header, colIdx) => {
                const val = cols[colIdx][idx];
                obj[header] = val instanceof Date ? val.toISOString().split('T')[0] : val;
            });
            return obj;
        });

        // Auto-detect target attribute (classification target)
        const targetAttr = autoDetectTargetAttribute(dataForDT);

        if (targetAttr && dataForDT.length >= 20) {
            // Kolom teks/identitas/tanggal dibuang; kolom numerik kini **dipakai** karena C4.5
            // memisahkannya lewat ambang biner (<= t / > t). Hanya kolom bilangan yang hampir unik
            // per baris (mirip id) yang tetap diabaikan.
            const excludeAttrs = headers.filter(h => {
                const col = columns.find(c => c.name === h);
                if (!col) { return false; }
                if (col.type === 'id' || col.type === 'text' || col.type === 'date') { return true; }
                const ratio = dataForDT.length ? col.unique / dataForDT.length : 1;
                return col.type === 'integer' && col.unique > 30 && ratio > 0.5;
            });

            decisionTreeAnalysis = trainDecisionTree(dataForDT, targetAttr, {
                maxDepth: treeOptions?.maxDepth ?? 6,
                testSplit: treeOptions?.testSplit ?? 0.25,
                seed: treeOptions?.seed ?? 42,
                minSamplesLeaf: treeOptions?.minSamplesLeaf ?? 2,
                minGainRatio: treeOptions?.minGainRatio ?? 0,
                maxBranches: treeOptions?.maxBranches ?? 20,
                mergeRare: treeOptions?.mergeRare ?? true,
                pruning: treeOptions?.pruning ?? true,
                validationSplit: treeOptions?.validationSplit ?? 0.2,
                cvFolds: treeOptions?.cvFolds ?? 5,
                cvMaxRows: treeOptions?.cvMaxRows ?? 2000,
                excludeAttributes: excludeAttrs
            });

            if (decisionTreeAnalysis) {
                const dt = decisionTreeAnalysis;
                insights.push(`🌳 Decision Tree C4.5: Model klasifikasi dibangun untuk prediksi "${targetAttr}" dengan akurasi ${(dt.accuracy * 100).toFixed(1)}% (${dt.rules.length} aturan keputusan).`);
                insights.push(`📊 Feature Importance: "${dt.featureImportance[0]?.feature}" adalah atribut paling penting (${(dt.featureImportance[0]?.importance * 100).toFixed(1)}% kontribusi).`);
                // Pembanding paling penting: akurasi dasar (selalu menebak kelas mayoritas).
                const base = dt.baseline;
                if (base && dt.accuracy > base.noInformationRate) {
                    insights.push(`🎯 Akurasi ${(dt.accuracy * 100).toFixed(1)}% berada ${((dt.accuracy - base.noInformationRate) * 100).toFixed(1)} poin di atas akurasi dasar "${base.majorityClass}" (${(base.noInformationRate * 100).toFixed(1)}%).`);
                } else if (base) {
                    insights.push(`⚠️ Akurasi model (${(dt.accuracy * 100).toFixed(1)}%) belum melampaui akurasi dasar kelas mayoritas "${base.majorityClass}" (${(base.noInformationRate * 100).toFixed(1)}%) — tambah atribut prediktor atau periksa kembali target klasifikasinya.`);
                }
                // Validasi silang: estimasi kinerja yang lebih andal daripada satu pembagian data.
                if (dt.crossValidation) {
                    const cv = dt.crossValidation;
                    insights.push(`🔁 Validasi silang ${cv.folds}-lipatan: akurasi ${(cv.meanAccuracy * 100).toFixed(1)}% ± ${(cv.stdAccuracy * 100).toFixed(1)}% (${cv.sampled ? `${cv.sampleSize} baris sampel, ` : ''}akar pohon paling sering "${cv.rootStability[0]?.attribute ?? '-'}").`);
                }
                // Struktur pohon + pemangkasan menjelaskan kompleksitas model.
                const shape = dt.treeShape;
                if (shape) {
                    insights.push(`🌿 Struktur pohon: ${shape.nodes} simpul, ${shape.leaves} daun, kedalaman ${shape.depth}, panjang aturan rata-rata ${shape.avgRuleLength}; ${dt.pruning ? (dt.pruning.applied ? `${dt.pruning.subtreesPruned} subtree dipangkas (daun ${dt.pruning.leavesBefore} → ${dt.pruning.leavesAfter})` : 'pemangkasan reduced-error tidak mengubah pohon') : 'pemangkasan nonaktif'}.`);
                }
                // Ambang numerik disebut karena inilah letak perbaikan C4.5-nya.
                if (dt.numericSplits?.length) {
                    insights.push(`📐 Ambang numerik dipakai pada ${dt.numericSplits.length} simpul, mis. ${dt.numericSplits.slice(0, 3).map((s) => `${s.attribute} <= ${s.threshold}`).join(', ')}.`);
                }
            }
        }
    } catch (err) {
        console.error('Decision Tree analysis failed:', err);
    }

    return {
        name, headers, rows, totalRows, truncated, columns, duplicates, missingCells,
        corr: { cols: corrIdx.map((i) => headers[i]), matrix }, scatters, groupBars, trends, crosstab, insights,
        stockAnalysis, needsAnalysis, csvHealth, businessKpi, decisionTreeAnalysis
    };
}

export function analyzeWorkbook(bytes: Uint8Array, fileName: string, treeOptions?: DecisionTreeOptions): WorkbookResult {
    const isText = /\.(csv|tsv|txt)$/i.test(fileName);
    let wb: XLSX.WorkBook;
    if (isText) {
        const text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
        const opts: XLSX.ParsingOptions = { type: 'string', raw: true };
        if (/\.tsv$/i.test(fileName)) { opts.FS = '\t'; }
        wb = XLSX.read(text, opts);
    } else {
        wb = XLSX.read(bytes, { type: 'array', cellDates: true });
    }
    const sheets = wb.SheetNames
        .map((n) => analyzeSheet(n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }), treeOptions))
        .filter((s): s is SheetResult => s !== null);
    if (!sheets.length) { throw new Error('File is empty or contains no readable data.'); }
    return { fileName, sheets };
}