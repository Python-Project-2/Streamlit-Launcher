import * as XLSX from 'xlsx';

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
const dispDate = (d: Date) => ymd(d) + (d.getHours() || d.getMinutes() ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
const keyOf = (v: Val) => (v instanceof Date ? dispDate(v) : String(v));

function parseDate(s: string): Date | null {
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    const d = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(s);
    return isNaN(+d) ? null : d;
}

function coerce(v: unknown): Cell {
    if (v === null || v === undefined) { return null; }
    if (v instanceof Date) { return isNaN(+v) ? null : v; }
    if (typeof v === 'number') { return isFinite(v) ? v : null; }
    if (typeof v === 'boolean') { return v; }
    const s = String(v).trim();
    if (MISSING.has(s.toLowerCase())) { return null; }
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) { return parseFloat(s); }
    if (/^(true|false)$/i.test(s)) { return s.toLowerCase() === 'true'; }
    if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(s) || /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(s)) {
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
        if (typeof x !== 'number' || typeof y !== 'number') { continue; }
        n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    if (n < 3) { return null; }
    const d = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    return d === 0 ? null : round((n * sxy - sx * sy) / d);
}

function analyzeSheet(name: string, input: unknown[][]): SheetResult | null {
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
    const matrix = corrIdx.map((i) => corrIdx.map((j) => (i === j ? 1 : pearson(cols[i], cols[j]))));
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

    // ---- automated insights ----
    const insights: string[] = [];
    const nBody = body.length;
    insights.push(`Dataset contains ${totalRows.toLocaleString('en-US')} rows and ${headers.length} columns (${numIdx.length} numeric, ${columns.filter((c) => c.type === 'category').length} categorical, ${columns.filter((c) => c.type === 'date').length} date).`);
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
    for (const c of columns.filter((c) => c.type === 'category' && c.top).slice(0, 4)) { insights.push(`Most frequent value in "${c.name}": ${c.top![0].value} (${((c.top![0].count / c.count) * 100).toFixed(0)}%).`); }

    return {
        name, headers, rows, totalRows, truncated, columns, duplicates, missingCells,
        corr: { cols: corrIdx.map((i) => headers[i]), matrix }, scatters, groupBars, trends, crosstab, insights
    };
}

export function analyzeWorkbook(bytes: Uint8Array, fileName: string): WorkbookResult {
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
        .map((n) => analyzeSheet(n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false })))
        .filter((s): s is SheetResult => s !== null);
    if (!sheets.length) { throw new Error('File is empty or contains no readable data.'); }
    return { fileName, sheets };
}