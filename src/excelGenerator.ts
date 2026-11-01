import * as ExcelJS from 'exceljs';
import type { SheetResult } from './analysis';
import { hbarChart, histChart, lineChart, matrixChart, scatterChart, STATUS_COLORS, flowChart } from './chartImages';
import type { Chart } from './chartImages';
import { layoutFlow } from './workflow';
import { sanitizeWorkbook, findCircular, polishWorkbook, fillToc } from './excelsafe';

const BLUE = 'FF2F5597';
const THIN = { style: 'thin', color: { argb: 'FFBFBFBF' } } as const;
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const NUM = '#,##0.00';
const INT = '#,##0';
const PCT = '0.0%';
const R3 = '0.000';
const R4 = '0.0000';
const F = (formula: string, result?: number | string): ExcelJS.CellFormulaValue => ({ formula, result } as ExcelJS.CellFormulaValue);
const L = (i: number): string => { let s = ''; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const noEmoji = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const TYPE_ID: Record<string, string> = { number: 'Desimal', integer: 'Bulat', id: 'ID', date: 'Tanggal', boolean: 'Boolean', category: 'Kategori', text: 'Teks' };

const hdr = (row: ExcelJS.Row) => row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER;
});
const body = (ws: ExcelJS.Worksheet, fromRow: number, toRow: number, ncol: number) => {
    for (let r = fromRow; r <= toRow; r++) {
        for (let c = 1; c <= ncol; c++) {
            const cell = ws.getCell(r, c);
            cell.border = BORDER;
            if (typeof cell.value === 'number' || (cell.value && typeof cell.value === 'object' && 'formula' in cell.value)) { if (!cell.numFmt) { cell.numFmt = NUM; } }
        }
    }
};
/** Set format angka pada kolom tertentu (menimpa format default NUM dari body()). */
const fmtCols = (ws: ExcelJS.Worksheet, r0: number, r1: number, cols: number[], fmt: string) => {
    for (let r = r0; r <= r1; r++) { for (const c of cols) { ws.getCell(r, c).numFmt = fmt; } }
};
const title = (ws: ExcelJS.Worksheet, text: string) => {
    const r = ws.addRow([text]);
    r.font = { bold: true, size: 13, color: { argb: BLUE } };
    return r.number;
};
const note = (ws: ExcelJS.Worksheet, text: string) => { const r = ws.addRow([text]); r.font = { italic: true, color: { argb: 'FF595959' } }; };
const widths = (ws: ExcelJS.Worksheet, w: number[]) => w.forEach((x, i) => { ws.getColumn(i + 1).width = x; });
const statusFill = (ref: string, rules: [string, string][]) => ({
    ref, rules: rules.map(([text, color], i) => ({
        type: 'cellIs' as const, operator: 'equal' as const, formulae: [`"${text}"`], priority: i + 1,
        style: { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: color } } },
    })),
});

export async function renderXlsx(sheet: SheetResult, fileName: string): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Date Skunder';
    wb.created = new Date();
    wb.calcProperties = { fullCalcOnLoad: true };
    const wsToc = wb.addWorksheet('Daftar Isi', { properties: { tabColor: { argb: 'FF1F3864' } } });
    const H = sheet.headers, P = H.length, N = sheet.rows.length;
    const last = Math.max(2, N + 1);
    const rng = (c: number) => `Data!$${L(c)}$2:$${L(c)}$${last}`;
    const hl = sheet.csvHealth;
    const stock = sheet.stockAnalysis, needs = sheet.needsAnalysis, dt = sheet.decisionTreeAnalysis;

    // ───── galeri grafik + penyemat gambar ─────
    // Setiap grafik disematkan di lembar asalnya (di bawah tabel atau di samping) dan juga dikumpulkan di lembar "Grafik".
    const gallery: { name: string; ch: Chart }[] = [];
    const putImg = (ws: ExcelJS.Worksheet, ch: Chart, col: number, row0: number, wpx: number): number => {
        const h = Math.round((wpx * ch.h) / ch.w);
        const id = wb.addImage({ buffer: Buffer.from(ch.png) as unknown as ExcelJS.Buffer, extension: 'png' });
        ws.addImage(id, { tl: { col, row: row0 }, ext: { width: wpx, height: h } });
        return h;
    };
    /** Sematkan grafik tepat di bawah isi lembar saat ini, lengkap dengan keterangan "Gambar n". */
    const below = (ws: ExcelJS.Worksheet, name: string, ch: Chart, wpx = 560) => {
        gallery.push({ name, ch });
        const cap = ws.addRow([`Gambar ${gallery.length}. ${name}`]);
        cap.font = { bold: true, color: { argb: BLUE } };
        const h = putImg(ws, ch, 0, ws.rowCount, wpx);
        for (let i = 0; i < Math.ceil(h / 20) + 2; i++) { ws.addRow([]); }
    };
    /** Sematkan grafik di sisi kanan tabel (kolom `col`, indeks 0), ditumpuk ke bawah mengikuti kursor `cur`. */
    const side = (ws: ExcelJS.Worksheet, cur: { row: number }, col: number, name: string, ch: Chart, wpx = 520) => {
        gallery.push({ name, ch });
        // keterangan hanya ditulis bila barisnya sudah ada (agar tidak menggeser baris yang ditambahkan sesudahnya)
        if (cur.row + 1 <= ws.rowCount) {
            const cell = ws.getCell(cur.row + 1, col + 1);
            cell.value = `Gambar ${gallery.length}. ${name}`;
            cell.font = { bold: true, color: { argb: BLUE } };
        }
        const h = putImg(ws, ch, col, cur.row + 1, wpx);
        cur.row += Math.ceil(h / 20) + 3;
    };

    // ───── Ringkasan ─────
    const ws0 = wb.addWorksheet('Ringkasan', { properties: { tabColor: { argb: BLUE } } });
    widths(ws0, [44, 22, 70]);
    title(ws0, `Ringkasan Analisis: ${fileName}`);
    const kv = (label: string, v: ExcelJS.CellValue, fmt?: string) => {
        const r = ws0.addRow([label, v]);
        r.getCell(1).font = { bold: true }; r.getCell(1).border = BORDER; r.getCell(2).border = BORDER;
        if (fmt) { r.getCell(2).numFmt = fmt; } else if (typeof v === 'number' || (v && typeof v === 'object' && 'formula' in v)) { r.getCell(2).numFmt = NUM; }
        return r.number;
    };
    kv('Berkas', fileName); kv('Lembar', sheet.name); kv('Tanggal dibuat', new Date().toLocaleString('id-ID'));
    if (sheet.truncated || sheet.totalRows > N) { note(ws0, `Catatan: sheet Data memuat ${N} baris pertama (batas pratinjau); analisis utama memakai ${sheet.totalRows} baris.`); }
    ws0.addRow([]);
    title(ws0, 'A. Perhitungan Skor Kualitas Data (rumus hidup)');
    const rN = kv('Jumlah baris', N, INT), rP = kv('Jumlah kolom', P, INT);
    const rT = kv('Total sel = baris x kolom', F(`B${rN}*B${rP}`, N * P), INT);
    const rF = kv('Sel terisi', F(`COUNTA(Data!A2:${L(P - 1)}${last})`), INT);
    const rM = kv('Sel kosong = total - terisi', F(`B${rT}-B${rF}`), INT);
    kv('Persentase sel kosong (%)', F(`IF(B${rT}=0,0,B${rM}/B${rT}*100)`));
    const rD = kv('Baris duplikat', hl.duplicateRows, INT);
    const rK = kv('Kelengkapan (%) = terisi / total x 100', F(`B${rF}/B${rT}*100`, hl.completenessScore));
    const rI = kv('Integritas (%) = (1 - duplikat / baris) x 100', F(`(1-B${rD}/B${rN})*100`, hl.integrityScore));
    const rC = kv('Konsistensi (%) = kolom dg hilang < 50% / kolom x 100', hl.consistencyScore);
    const rS = kv('SKOR KUALITAS = 0,45 K + 0,35 I + 0,20 Ks', F(`0.45*B${rK}+0.35*B${rI}+0.2*B${rC}`, hl.qualityScore));
    ws0.getCell(`B${rS}`).font = { bold: true, color: { argb: 'FFC00000' } };
    kv('Peringkat', noEmoji(hl.qualityRating));
    kv('Kolom numerik / kategori / tanggal', `${sheet.columns.filter((c) => c.num).length} / ${sheet.columns.filter((c) => c.type === 'category').length} / ${sheet.columns.filter((c) => c.type === 'date').length}`);
    kv('Kolom dengan outlier', hl.outlierColsCount, INT);
    ws0.addRow([]);
    below(ws0, 'Komponen skor kualitas data (%)', hbarChart([
        { label: 'Kelengkapan', value: hl.completenessScore }, { label: 'Integritas', value: hl.integrityScore },
        { label: 'Konsistensi', value: hl.consistencyScore }, { label: 'Skor akhir', value: hl.qualityScore },
    ], { fmt: (v) => (Math.round(v * 10) / 10).toString(), max: 100, labelLen: 12 }));
    title(ws0, 'B. Hasil Pemeriksaan Kualitas');
    const hh = ws0.addRow(['Aspek', 'Status', 'Keterangan']); hdr(hh);
    const stMap = { pass: 'Baik', warn: 'Perhatian', fail: 'Kritis' } as const;
    const c0 = ws0.rowCount + 1;
    hl.checklist.forEach((x) => ws0.addRow([x.category, stMap[x.status], x.detail]));
    body(ws0, c0, ws0.rowCount, 3);
    ws0.addConditionalFormatting(statusFill(`B${c0}:B${ws0.rowCount}`, [['Baik', 'FFC6EFCE'], ['Perhatian', 'FFFFEB9C'], ['Kritis', 'FFFFC7CE']]));
    ws0.addRow([]);
    title(ws0, 'C. Catatan Otomatis');
    sheet.insights.forEach((s) => ws0.addRow([noEmoji(s)]));
    ws0.addRow([]);
    title(ws0, 'D. Rekomendasi Pembersihan');
    hl.cleaningRecommendations.forEach((s) => ws0.addRow([noEmoji(s)]));

    // ───── Profil Kolom ─────
    const wsP = wb.addWorksheet('Profil Kolom');
    widths(wsP, [6, 28, 12, 12, 12, 12, 12, 14, 14, 14, 44]);
    title(wsP, 'Profil Kolom (rumus hidup pada sheet Data)');
    note(wsP, 'Terisi = COUNTA; Hilang = baris - terisi; Hilang (%) = Hilang / baris; Min / Rata-rata / Maks hanya untuk kolom numerik. Sel merah = data hilang > 20%.');
    hdr(wsP.addRow(['No', 'Kolom', 'Tipe', 'Terisi', 'Hilang', 'Hilang (%)', 'Unik', 'Min', 'Rata-rata', 'Maks', 'Keterangan']));
    const pf0 = wsP.rowCount + 1;
    sheet.columns.forEach((c, i) => {
        const R = rng(i), r = wsP.rowCount + 1;
        let ket = '';
        if (c.type === 'date') { ket = `${c.dateMin} s.d. ${c.dateMax}`; }
        else if (c.top && c.top.length) { ket = `Teratas: ${cut(c.top[0].value, 26)} (${c.top[0].count})`; }
        else if (c.type === 'id') { ket = 'Pengenal (tidak dianalisis sebagai angka)'; }
        else if (c.type === 'text') { ket = `Panjang teks ${c.minLen ?? 0} - ${c.maxLen ?? 0}`; }
        wsP.addRow([i + 1, c.name, TYPE_ID[c.type] ?? c.type, F(`COUNTA(${R})`, c.count), F(`${N}-D${r}`, c.missing), F(`IF(${N}=0,0,E${r}/${N})`),
        c.unique, c.num ? F(`MIN(${R})`, c.num.min) : null, c.num ? F(`AVERAGE(${R})`, c.num.mean) : null, c.num ? F(`MAX(${R})`, c.num.max) : null, ket]);
    });
    body(wsP, pf0, wsP.rowCount, 11);
    fmtCols(wsP, pf0, wsP.rowCount, [4, 5, 7], INT);
    fmtCols(wsP, pf0, wsP.rowCount, [6], PCT);
    wsP.addConditionalFormatting({
        ref: `F${pf0}:F${wsP.rowCount}`, rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['0.2'], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } }],
    });
    wsP.views = [{ state: 'frozen', ySplit: 3 }];
    {
        const cur = { row: 2 };
        const tc = new Map<string, number>();
        sheet.columns.forEach((c) => tc.set(TYPE_ID[c.type] ?? c.type, (tc.get(TYPE_ID[c.type] ?? c.type) ?? 0) + 1));
        side(wsP, cur, 12, 'Komposisi tipe kolom dataset', hbarChart([...tc.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), { fmt: (v) => String(Math.round(v)) }));
        const miss = sheet.columns.filter((c) => c.missing > 0).map((c) => ({ label: c.name, value: (c.missing / Math.max(1, c.missing + c.count)) * 100 })).sort((a, b) => b.value - a.value).slice(0, 8);
        if (miss.length) { side(wsP, cur, 12, 'Persentase data hilang per kolom', hbarChart(miss, { fmt: (v) => (Math.round(v * 10) / 10).toString(), max: 100, labelLen: 14 })); }
    }

    // ───── Data ─────
    const wsD = wb.addWorksheet('Data');
    wsD.addRow(H); hdr(wsD.getRow(1));
    sheet.rows.forEach((r) => wsD.addRow(r.map((v) => (v === null ? null : v))));
    wsD.views = [{ state: 'frozen', ySplit: 1 }];
    wsD.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: P } };
    H.forEach((h, i) => { wsD.getColumn(i + 1).width = Math.min(30, Math.max(10, h.length + 2)); });

    // ───── Statistik (rumus) ─────
    const numCols = sheet.columns.filter((c) => c.num);
    const wsS = wb.addWorksheet('Statistik');
    widths(wsS, [24, 8, 12, 12, 12, 12, 12, 12, 12, 12, 13, 13, 10, 10, 11, 14, 12, 14, 12, 13, 13, 11, 11, 11, 12, 12, 34]);
    title(wsS, 'Statistik Deskriptif dan Deteksi Outlier (rumus Excel pada sheet Data)');
    note(wsS, 'Std = STDEV (sampel); Q1/Q3 = QUARTILE; IQR = Q3 - Q1; batas = Q1 - 1,5 IQR dan Q3 + 1,5 IQR; CV = Std / |Rata-rata|; SE = Std / akar(N); CI 95% = Rata-rata ± 1,96 SE. SKEW/KURT Excel memakai koreksi sampel sehingga bisa sedikit berbeda dari skewness pada aplikasi.');
    hdr(wsS.addRow(['Variabel', 'N', 'Rata-rata', 'Median', 'Std Dev', 'Min', 'Q1', 'Q3', 'Maks', 'IQR', 'Batas Bawah', 'Batas Atas', 'Outlier', 'CV', 'Skewness', 'Jumlah',
        'Rentang', 'Varians', 'Std Error', 'CI 95% Bawah', 'CI 95% Atas', 'Kurtosis', '% Outlier', 'Modus', 'P5', 'P95', 'Interpretasi']));
    const s0 = wsS.rowCount + 1;
    numCols.forEach((c) => {
        const i = H.indexOf(c.name), R = rng(i), r = wsS.rowCount + 1, s = c.num!;
        wsS.addRow([c.name, F(`COUNT(${R})`, c.count), F(`AVERAGE(${R})`, s.mean), F(`MEDIAN(${R})`, s.median), F(`IFERROR(STDEV(${R}),0)`, s.std),
        F(`MIN(${R})`, s.min), F(`QUARTILE(${R},1)`, s.q1), F(`QUARTILE(${R},3)`, s.q3), F(`MAX(${R})`, s.max),
        F(`H${r}-G${r}`), F(`G${r}-1.5*J${r}`), F(`H${r}+1.5*J${r}`),
        F(`COUNTIF(${R},"<"&K${r})+COUNTIF(${R},">"&L${r})`, s.outliers),
        F(`IFERROR(E${r}/ABS(C${r}),0)`), F(`IFERROR(SKEW(${R}),0)`), F(`SUM(${R})`, s.sum),
        F(`I${r}-F${r}`), F(`E${r}^2`), F(`IFERROR(E${r}/SQRT(B${r}),0)`), F(`C${r}-1.96*S${r}`), F(`C${r}+1.96*S${r}`),
        F(`IFERROR(KURT(${R}),0)`), F(`IF(B${r}=0,0,M${r}/B${r})`), F(`IFERROR(MODE(${R}),"-")`),
        F(`PERCENTILE(${R},0.05)`), F(`PERCENTILE(${R},0.95)`),
        F(`IF(ABS(O${r})<=0.5,"Simetris",IF(O${r}>0,"Miring kanan","Miring kiri"))&"; variasi "&IF(N${r}<0.15,"rendah",IF(N${r}<0.35,"sedang","tinggi"))`)]);
    });
    if (numCols.length) {
        body(wsS, s0, wsS.rowCount, 27);
        fmtCols(wsS, s0, wsS.rowCount, [2, 13], INT);
        fmtCols(wsS, s0, wsS.rowCount, [23], PCT);
    }
    wsS.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];

    // distribusi frekuensi (histogram) + grafik tersemat
    numCols.filter((c) => c.num!.hist.counts.length > 1).slice(0, 3).forEach((c) => {
        wsS.addRow([]);
        title(wsS, `Distribusi frekuensi: ${c.name}`);
        hdr(wsS.addRow(['Interval', 'Frekuensi', 'Proporsi', 'Kumulatif']));
        const f0 = wsS.rowCount + 1, hs2 = c.num!.hist, f1 = f0 + hs2.counts.length - 1;
        hs2.labels.forEach((l, k) => wsS.addRow([l, hs2.counts[k], F(`B${f0 + k}/SUM(B$${f0}:B$${f1})`), F(`SUM(C$${f0}:C${f0 + k})`)]));
        body(wsS, f0, wsS.rowCount, 4);
        fmtCols(wsS, f0, wsS.rowCount, [2], INT);
        fmtCols(wsS, f0, wsS.rowCount, [3, 4], PCT);
        const tot = wsS.addRow(['Total', F(`SUM(B${f0}:B${f1})`), F(`SUM(C${f0}:C${f1})`)]);
        tot.font = { bold: true };
        tot.getCell(2).numFmt = INT; tot.getCell(3).numFmt = PCT;
        below(wsS, `Histogram ${c.name}`, histChart(hs2));
    });

    // ───── Korelasi ─────
    const cc = sheet.corr.cols, mat = sheet.corr.matrix;
    if (cc.length >= 2) {
        const wsK = wb.addWorksheet('Korelasi');
        widths(wsK, [26, ...cc.map(() => 13)]);
        title(wsK, 'Matriks Korelasi Pearson (=CORREL)');
        hdr(wsK.addRow(['', ...cc]));
        const k0 = wsK.rowCount + 1;
        cc.forEach((a, i) => wsK.addRow([a, ...cc.map((b, j) => F(`IFERROR(CORREL(${rng(H.indexOf(a))},${rng(H.indexOf(b))}),0)`, mat[i][j] ?? 0))]));
        body(wsK, k0, wsK.rowCount, cc.length + 1);
        for (let r = k0; r <= wsK.rowCount; r++) { wsK.getCell(r, 1).font = { bold: true }; for (let c = 2; c <= cc.length + 1; c++) { wsK.getCell(r, c).numFmt = R3; } }
        wsK.addConditionalFormatting({
            ref: `B${k0}:${L(cc.length)}${wsK.rowCount}`, rules: [{
                type: 'colorScale', priority: 1,
                cfvo: [{ type: 'num', value: -1 }, { type: 'num', value: 0 }, { type: 'num', value: 1 }],
                color: [{ argb: 'FF4472C4' }, { argb: 'FFFFFFFF' }, { argb: 'FFC0504D' }]
            }]
        });
        wsK.addRow([]);
        note(wsK, 'Kekuatan: |r| >= 0,7 kuat; 0,4 - 0,7 sedang; < 0,4 lemah. Korelasi tidak menunjukkan hubungan sebab-akibat.');
        below(wsK, 'Peta panas korelasi Pearson', matrixChart(cc.slice(0, 12).map((x, i) => `${i + 1}.${x}`), cc.slice(0, 12).map((_, i) => String(i + 1)), mat.slice(0, 12).map((r) => r.slice(0, 12)), { kind: 'corr' }));

        // ───── Regresi ─────
        const pairs: { a: string; b: string; r: number }[] = [];
        for (let i = 0; i < cc.length; i++) { for (let j = i + 1; j < cc.length; j++) { if (mat[i][j] !== null) { pairs.push({ a: cc[i], b: cc[j], r: mat[i][j]! }); } } }
        pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
        const wsR = wb.addWorksheet('Regresi');
        widths(wsR, [22, 22, 8, 10, 10, 11, 11, 11, 11, 9, 11, 12, 11, 36]);
        title(wsR, 'Korelasi dan Regresi Linear Sederhana: Y = a + bX (15 pasangan terkuat)');
        note(wsR, 'a = INTERCEPT; b = SLOPE; R2 = RSQ; t = r x akar((n - 2) / (1 - r2)); p = TDIST(|t|, n - 2, 2 sisi); signifikan bila p < 0,05; SE est. = STEYX.');
        hdr(wsR.addRow(['Variabel X', 'Variabel Y', 'n', 'r', 'R2', 'a', 'b', 't', 'p-value', 'Signif.', 'Kekuatan', 'Efek Cohen', 'SE est.', 'Persamaan']));
        const r0 = wsR.rowCount + 1;
        pairs.slice(0, 15).forEach((p) => {
            const r = wsR.rowCount + 1, X = rng(H.indexOf(p.a)), Y = rng(H.indexOf(p.b));
            wsR.addRow([p.a, p.b, F(`MIN(COUNT(${X}),COUNT(${Y}))`), F(`IFERROR(CORREL(${X},${Y}),0)`, p.r), F(`D${r}^2`, p.r ** 2),
            F(`IFERROR(INTERCEPT(${Y},${X}),0)`), F(`IFERROR(SLOPE(${Y},${X}),0)`),
            F(`IF(ABS(D${r})>=1,0,IFERROR(D${r}*SQRT((C${r}-2)/(1-E${r})),0))`),
            F(`IFERROR(IF(ABS(D${r})>=1,0,TDIST(ABS(H${r}),C${r}-2,2)),"-")`),
            F(`IF(ISNUMBER(I${r}),IF(I${r}<0.05,"Ya","Tidak"),"-")`),
            F(`IF(ABS(D${r})>=0.7,"Kuat",IF(ABS(D${r})>=0.4,"Sedang","Lemah"))`),
            F(`IF(ABS(D${r})>=0.5,"Besar",IF(ABS(D${r})>=0.3,"Sedang",IF(ABS(D${r})>=0.1,"Kecil","Diabaikan")))`),
            F(`IFERROR(STEYX(${Y},${X}),"-")`),
            F(`"Y = "&TEXT(F${r},"0.000")&" + "&TEXT(G${r},"0.0000")&" X"`)]);
        });
        body(wsR, r0, wsR.rowCount, 14);
        fmtCols(wsR, r0, wsR.rowCount, [3], INT);
        fmtCols(wsR, r0, wsR.rowCount, [4, 5, 9], R3);
        if (wsR.rowCount >= r0) {
            wsR.addConditionalFormatting(statusFill(`J${r0}:J${wsR.rowCount}`, [['Ya', 'FFC6EFCE'], ['Tidak', 'FFFFEB9C']]));
        }
        wsR.addRow([]);
        sheet.scatters.filter((s) => s.points.length >= 3).slice(0, 3).forEach((s) =>
            below(wsR, `Diagram pencar ${s.x} vs ${s.y} (r = ${s.r})`, scatterChart(s.points, s.x, s.y)));
    }

    // ───── Kategorikal ─────
    const catCols = sheet.columns.filter((c) => c.top && c.top.length && (c.type === 'category' || c.type === 'boolean')).slice(0, 8);
    if (catCols.length || sheet.crosstab) {
        const wsC = wb.addWorksheet('Kategorikal');
        widths(wsC, [32, 14, 14, 14, 14, 14, 14, 14, 14, 14]);
        catCols.forEach((c) => {
            title(wsC, `Frekuensi: ${c.name}`);
            hdr(wsC.addRow(['Nilai', 'Frekuensi', 'Proporsi', 'Kumulatif']));
            const f0 = wsC.rowCount + 1, R = rng(H.indexOf(c.name)), shown = c.top!.slice(0, 10), f1 = f0 + shown.length - 1;
            shown.forEach((t, k) => wsC.addRow([t.value, F(`COUNTIF(${R},A${f0 + k})`, t.count), F(`B${f0 + k}/COUNTA(${R})`), F(`SUM(C$${f0}:C${f0 + k})`)]));
            body(wsC, f0, wsC.rowCount, 4);
            fmtCols(wsC, f0, wsC.rowCount, [2], INT);
            fmtCols(wsC, f0, wsC.rowCount, [3, 4], PCT);
            const tr = wsC.addRow([`Total (${shown.length} teratas)`, F(`SUM(B${f0}:B${f1})`), F(`SUM(C${f0}:C${f1})`)]);
            tr.font = { bold: true }; tr.getCell(2).numFmt = INT; tr.getCell(3).numFmt = PCT;
            const en = wsC.addRow(['Entropi kategori teratas (bit)', F(`IFERROR(-SUMPRODUCT(C${f0}:C${f1},LOG(C${f0}:C${f1},2)),"-")`)]);
            en.font = { bold: true }; en.getCell(2).numFmt = R3;
            below(wsC, `Frekuensi ${c.name}`, hbarChart(shown.slice(0, 6).map((v) => ({ label: v.value, value: v.count })), { fmt: (v) => String(Math.round(v)), labelLen: 14 }));
        });

        const ct = sheet.crosstab;
        if (ct) {
            const ia = H.indexOf(ct.a), ib = H.indexOf(ct.b), na = ct.labels.length, nb = ct.series.length;
            title(wsC, `Uji Chi-kuadrat independensi: ${ct.a} x ${ct.b}`);
            note(wsC, '1) Observasi (COUNTIFS)  2) Ekspektasi E = total baris x total kolom / N  3) Kontribusi (O - E)^2 / E  4) Chi-kuadrat, db, nilai kritis, p-value, V Cramer.');
            const tot = L(na + 1);
            wsC.addRow(['Observasi (O)']).font = { bold: true };
            const h1 = wsC.addRow([`${ct.b} \\ ${ct.a}`, ...ct.labels, 'Total']); hdr(h1); const hr = h1.number;
            ct.series.forEach((s) => { const r = wsC.rowCount + 1; wsC.addRow([s.name, ...ct.labels.map((_, j) => F(`COUNTIFS(${rng(ia)},${L(1 + j)}$${hr},${rng(ib)},$A${r})`)), F(`SUM(B${r}:${L(na)}${r})`)]); });
            const tr = hr + nb + 1;
            wsC.addRow(['Total', ...ct.labels.map((_, j) => F(`SUM(${L(1 + j)}${hr + 1}:${L(1 + j)}${hr + nb})`)), F(`SUM(${tot}${hr + 1}:${tot}${hr + nb})`)]);
            body(wsC, hr + 1, tr, na + 2);
            fmtCols(wsC, hr + 1, tr, Array.from({ length: na + 1 }, (_, i) => i + 2), INT);
            wsC.addRow([]);
            wsC.addRow(['Ekspektasi (E)']).font = { bold: true };
            const h2 = wsC.addRow(['', ...ct.labels]); hdr(h2); const er = h2.number;
            ct.series.forEach((_, i) => wsC.addRow([ct.series[i].name, ...ct.labels.map((__, j) => F(`$${tot}${hr + 1 + i}*${L(1 + j)}$${tr}/$${tot}$${tr}`))]));
            body(wsC, er + 1, er + nb, na + 1);
            wsC.addRow([]);
            wsC.addRow(['Kontribusi (O - E)^2 / E']).font = { bold: true };
            const h3 = wsC.addRow(['', ...ct.labels]); hdr(h3); const xr = h3.number;
            ct.series.forEach((_, i) => wsC.addRow([ct.series[i].name, ...ct.labels.map((__, j) => F(`IF(${L(1 + j)}${er + 1 + i}=0,0,(${L(1 + j)}${hr + 1 + i}-${L(1 + j)}${er + 1 + i})^2/${L(1 + j)}${er + 1 + i})`))]));
            body(wsC, xr + 1, xr + nb, na + 1);
            wsC.addRow([]);
            const cr = wsC.rowCount + 1;
            const kv2 = (l: string, f: ExcelJS.CellValue, fmt = NUM) => { const r = wsC.addRow([l, f]); r.getCell(1).font = { bold: true }; r.getCell(1).border = BORDER; r.getCell(2).border = BORDER; r.getCell(2).numFmt = fmt; };
            kv2('Chi-kuadrat', F(`SUM(B${xr + 1}:${L(na)}${xr + nb})`));
            kv2('Derajat bebas', F(`(${nb}-1)*(${na}-1)`), INT);
            kv2('Nilai kritis (5%)', F(`CHIINV(0.05,B${cr + 1})`));
            kv2('V Cramer', F(`SQRT(B${cr}/(${tot}${tr}*MIN(${nb}-1,${na}-1)))`), R3);
            kv2('Keputusan', F(`IF(B${cr}>B${cr + 2},"Tolak H0 (ada asosiasi)","Gagal tolak H0")`));
            kv2('p-value = CHIDIST(chi, db)', F(`IFERROR(CHIDIST(B${cr},B${cr + 1}),"-")`), '0.00000');
            kv2('Kekuatan asosiasi (V)', F(`IF(B${cr + 3}>=0.3,"Kuat",IF(B${cr + 3}>=0.1,"Lemah - sedang","Sangat lemah"))`));
            wsC.addRow([]);
            below(wsC, `Tabulasi silang ${ct.a} x ${ct.b}`, matrixChart(ct.series.map((s) => s.name), ct.labels, ct.series.map((s) => s.data), { kind: 'count', fmt: (v) => String(Math.round(v)) }));
        }
    }

    // ───── Tren & kelompok ─────
    if (sheet.trends.length || sheet.groupBars.length) {
        const wsT = wb.addWorksheet('Tren & Kelompok');
        widths(wsT, [34, 16, 14, 18]);
        sheet.trends.forEach((tr) => {
            title(wsT, `Rata-rata ${tr.num} per ${tr.gran} (kolom ${tr.date})`);
            hdr(wsT.addRow(['Periode', 'Rata-rata', 'Perubahan', 'Perubahan (%)', 'Indeks (t)']));
            const f0 = wsT.rowCount + 1;
            tr.labels.forEach((l, k) => { const r = f0 + k; wsT.addRow([l, tr.values[k], k ? F(`B${r}-B${r - 1}`) : null, k ? F(`IF(B${r - 1}=0,0,(B${r}-B${r - 1})/ABS(B${r - 1}))`) : null, k + 1]); });
            const e = wsT.rowCount;
            body(wsT, f0, e, 5);
            for (let r = f0 + 1; r <= e; r++) { wsT.getCell(r, 4).numFmt = PCT; }
            const stat = (label: string, f: ExcelJS.CellValue, fmt = NUM) => { const r = wsT.addRow([label, f]); r.getCell(1).font = { bold: true }; r.getCell(2).numFmt = fmt; };
            stat('Rata-rata seluruh periode', F(`AVERAGE(B${f0}:B${e})`));
            stat('Minimum', F(`MIN(B${f0}:B${e})`));
            stat('Maksimum', F(`MAX(B${f0}:B${e})`));
            stat('Perubahan total (akhir - awal)', F(`B${e}-B${f0}`));
            stat('Perubahan total (%)', F(`IF(B${f0}=0,0,(B${e}-B${f0})/ABS(B${f0}))`), PCT);
            stat('Kemiringan tren (SLOPE)', F(`SLOPE(B${f0}:B${e},E${f0}:E${e})`), R4);
            stat('R2 tren (RSQ)', F(`RSQ(B${f0}:B${e},E${f0}:E${e})`), R3);
            stat('Prakiraan periode berikutnya (FORECAST)', F(`FORECAST(E${e}+1,B${f0}:B${e},E${f0}:E${e})`));
            widths(wsT, [34, 16, 14, 18, 12]);
            wsT.addRow([]);
            below(wsT, `Tren ${tr.num} per ${tr.gran}`, lineChart(tr.labels, tr.values, tr.num));
        });
        sheet.groupBars.forEach((gb) => {
            if (!gb.labels.length) { return; }
            title(wsT, `Rata-rata ${gb.num} menurut ${gb.cat}`);
            hdr(wsT.addRow(['Kelompok', 'Rata-rata', 'Jumlah', 'Selisih vs rata-rata (%)']));
            const f0 = wsT.rowCount + 1, e = f0 + gb.labels.length - 1;
            const wavg = `SUMPRODUCT(B$${f0}:B$${e},C$${f0}:C$${e})/SUM(C$${f0}:C$${e})`;
            gb.labels.forEach((l, k) => wsT.addRow([l, gb.means[k], gb.counts[k], F(`IFERROR((B${f0 + k}-${wavg})/ABS(${wavg}),0)`)]));
            body(wsT, f0, e, 4);
            for (let r = f0; r <= e; r++) { wsT.getCell(r, 3).numFmt = INT; wsT.getCell(r, 4).numFmt = PCT; }
            const stat = (label: string, f: ExcelJS.CellValue, fmt = NUM) => { const r = wsT.addRow([label, f]); r.getCell(1).font = { bold: true }; r.getCell(2).numFmt = fmt; };
            stat('Rata-rata tertimbang', F(`SUMPRODUCT(B${f0}:B${e},C${f0}:C${e})/SUM(C${f0}:C${e})`));
            stat('Rasio tertinggi / terendah', F(`IFERROR(MAX(B${f0}:B${e})/MIN(B${f0}:B${e}),0)`), R3);
            stat('Selisih tertinggi - terendah', F(`MAX(B${f0}:B${e})-MIN(B${f0}:B${e})`));
            stat('Total pengamatan', F(`SUM(C${f0}:C${e})`), INT);
            wsT.addRow([]);
            below(wsT, `Rata-rata ${gb.num} menurut ${gb.cat}`, hbarChart(gb.labels.slice(0, 8).map((l, k) => ({ label: l, value: gb.means[k] })), { labelLen: 14 }));
        });
    }

    // ───── Persediaan ─────
    if (stock) {
        const items = stock.items.slice(0, 5000), first = 2, lastR = first + items.length - 1;
        const SRN = `'Ringkasan Stok'`;
        const PS = (r: number) => `${SRN}!$B$${r}`;                     // sel parameter pada Ringkasan Stok
        const col = (c: string) => `Persediaan!$${c}$${first}:$${c}$${lastR}`;

        // — Ringkasan Stok (semua rumus mengacu pada sheet Persediaan) —
        const wsR = wb.addWorksheet('Ringkasan Stok', { properties: { tabColor: { argb: 'FF70AD47' } } });
        widths(wsR, [38, 18, 16, 18, 16, 16, 4]);
        title(wsR, 'Analisis Persediaan: Parameter, Status Stok, ABC, dan Konsentrasi (rumus hidup)');
        note(wsR, `Dihitung dari sheet Persediaan (${items.length} item${stock.items.length > items.length ? `, dari ${stock.items.length} SKU` : ''}). Kolom item: "${stock.itemCol}", kuantitas: "${stock.qtyCol}"${stock.priceCol ? `, harga: "${stock.priceCol}"` : ''}.`);
        hdr(wsR.addRow(['Parameter', 'Nilai', 'Keterangan']));
        const prm = (label: string, f: ExcelJS.CellValue, fmt: string, ket = '') => {
            const r = wsR.addRow([label, f, ket]);
            r.getCell(1).font = { bold: true }; r.getCell(1).border = BORDER; r.getCell(2).border = BORDER; r.getCell(2).numFmt = fmt; r.getCell(3).font = { italic: true, color: { argb: 'FF595959' } };
            return r.number;
        };
        // baris parameter: 4 s.d. 16 (header di baris 3)
        prm('Jumlah SKU', F(`COUNTA(${col('A')})`, items.length), INT, 'Item unik setelah agregasi');
        prm('Total volume stok', F(`SUM(${col('C')})`, stock.kpis.totalStockVolume), NUM);
        const rMed = prm('Median stok', F(`MEDIAN(${col('C')})`), NUM, 'Dasar ambang batas status');
        prm('Rata-rata stok per item', F(`AVERAGE(${col('C')})`, stock.kpis.averageStockPerItem), NUM);
        const rKr = prm('Kritis bila stok <=', F(`MAX(1,ROUND(0.15*B${rMed},0))`), INT, '15% median (min. 1)');
        const rMn = prm('Menipis bila stok <=', F(`MAX(2,ROUND(0.4*B${rMed},0))`), INT, '40% median (min. 2)');
        const rOv = prm('Overstock bila stok >=', F(`MAX(15,ROUND(2.5*B${rMed},0))`), INT, '250% median (min. 15)');
        const rTV = prm('Total nilai persediaan', F(`SUM(${col('E')})`, stock.kpis.totalValuation), NUM, 'Stok x harga satuan');
        const rSK = 4;
        prm('HHI = Sum(pangsa^2) x 10.000', F(`SUMPRODUCT((${col('E')}/B${rTV})^2)*10000`), NUM, '< 1.500 rendah; 1.500 - 2.500 sedang; > 2.500 tinggi');
        prm('Koefisien Gini nilai', F(`IFERROR(2*SUMPRODUCT(${col('E')},(${lastR + 1}-SUMPRODUCT(${col('E')})))/(B${rSK}*B${rTV})-(B${rSK}+1)/B${rSK},0)`), R3, '0 = merata; mendekati 1 = terpusat');
        prm('Pangsa item terbesar', F(`MAX(${col('E')})/B${rTV}`), PCT);
        prm('Total estimasi anggaran pengadaan', F(`SUM(${col('K')})`, needs ? needs.totalProcurementBudget : 0), NUM, 'Dari kolom Estimasi biaya');
        prm('Aturan ABC', '≤ 70% = A; ≤ 90% = B; sisanya C', '@', 'Berdasarkan % kumulatif nilai');
        wsR.addRow([]);

        const cur = { row: 2 };       // kursor grafik samping (kolom I)
        const SC = 8;

        title(wsR, 'Distribusi Status Stok');
        hdr(wsR.addRow(['Status', 'Jumlah SKU', '% SKU', 'Nilai', '% Nilai']));
        const st0 = wsR.rowCount + 1;
        ['Kritis', 'Menipis', 'Aman', 'Overstock'].forEach((s, k) => {
            const r = st0 + k;
            wsR.addRow([s, F(`COUNTIF(${col('I')},A${r})`), F(`B${r}/SUM(B$${st0}:B$${st0 + 3})`), F(`SUMIF(${col('I')},A${r},${col('E')})`), F(`IF(SUM(D$${st0}:D$${st0 + 3})=0,0,D${r}/SUM(D$${st0}:D$${st0 + 3}))`)]);
        });
        const stT = wsR.addRow(['Total', F(`SUM(B${st0}:B${st0 + 3})`), F(`SUM(C${st0}:C${st0 + 3})`), F(`SUM(D${st0}:D${st0 + 3})`), F(`SUM(E${st0}:E${st0 + 3})`)]);
        stT.font = { bold: true };
        body(wsR, st0, wsR.rowCount, 5);
        fmtCols(wsR, st0, wsR.rowCount, [2], INT); fmtCols(wsR, st0, wsR.rowCount, [3, 5], PCT);
        wsR.addConditionalFormatting(statusFill(`A${st0}:A${st0 + 3}`, [['Kritis', 'FFFFC7CE'], ['Menipis', 'FFFFEB9C'], ['Overstock', 'FFDDEBF7']]));
        wsR.addRow([]);
        side(wsR, cur, SC, 'Distribusi status stok', hbarChart(stock.statusDistribution.map((x) => ({ label: x.label, value: x.count })), { colors: STATUS_COLORS, fmt: (v) => String(Math.round(v)), labelLen: 14 }));

        title(wsR, 'Klasifikasi ABC');
        hdr(wsR.addRow(['Kelas', 'Jumlah item', '% item', 'Nilai', '% nilai']));
        const ab0 = wsR.rowCount + 1;
        ['A', 'B', 'C'].forEach((k, i) => {
            const r = ab0 + i;
            wsR.addRow([k, F(`COUNTIF(${col('H')},A${r})`), F(`B${r}/SUM(B$${ab0}:B$${ab0 + 2})`), F(`SUMIF(${col('H')},A${r},${col('E')})`), F(`IF(SUM(D$${ab0}:D$${ab0 + 2})=0,0,D${r}/SUM(D$${ab0}:D$${ab0 + 2}))`)]);
        });
        body(wsR, ab0, wsR.rowCount, 5);
        fmtCols(wsR, ab0, wsR.rowCount, [2], INT); fmtCols(wsR, ab0, wsR.rowCount, [3, 5], PCT);
        wsR.addRow([]);
        const ab = stock.abcSummary;
        side(wsR, cur, SC, 'Kontribusi nilai menurut kelas ABC (%)', hbarChart([
            { label: 'Kelas A', value: ab.classA.valPct }, { label: 'Kelas B', value: ab.classB.valPct }, { label: 'Kelas C', value: ab.classC.valPct },
        ], { max: 100, labelLen: 10 }));

        title(wsR, 'Status Stok menurut Kelas ABC (COUNTIFS)');
        hdr(wsR.addRow(['Kelas', 'Kritis', 'Menipis', 'Aman', 'Overstock']));
        const sa0 = wsR.rowCount, sh = sa0;       // baris header = sa0
        ['A', 'B', 'C'].forEach((k, i) => {
            const r = sa0 + 1 + i;
            wsR.addRow([k, ...['B', 'C', 'D', 'E'].map((c) => F(`COUNTIFS(${col('H')},$A${r},${col('I')},${c}$${sh})`))]);
        });
        body(wsR, sa0 + 1, wsR.rowCount, 5);
        fmtCols(wsR, sa0 + 1, wsR.rowCount, [2, 3, 4, 5], INT);
        wsR.addRow([]);

        // kategori
        const catAgg = new Map<string, number>();
        items.forEach((x) => catAgg.set(x.category, (catAgg.get(x.category) ?? 0) + (x.totalValue || x.quantity)));
        const cats = [...catAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (cats.length >= 1) {
            title(wsR, 'Nilai Persediaan menurut Kategori (SUMIF)');
            hdr(wsR.addRow(['Kategori', 'Jumlah SKU', 'Total stok', 'Nilai', '% nilai']));
            const k0 = wsR.rowCount + 1, k1 = k0 + cats.length - 1;
            cats.forEach(([name], i) => {
                const r = k0 + i;
                wsR.addRow([name, F(`COUNTIF(${col('B')},A${r})`), F(`SUMIF(${col('B')},A${r},${col('C')})`), F(`SUMIF(${col('B')},A${r},${col('E')})`), F(`IF($B$${rTV}=0,0,D${r}/$B$${rTV})`)]);
            });
            body(wsR, k0, wsR.rowCount, 5);
            fmtCols(wsR, k0, wsR.rowCount, [2], INT); fmtCols(wsR, k0, wsR.rowCount, [5], PCT);
            void k1;
            wsR.addRow([]);
            if (cats.length >= 2) { side(wsR, cur, SC, 'Nilai persediaan menurut kategori', hbarChart(cats.slice(0, 8).map(([label, value]) => ({ label, value })), { labelLen: 14 })); }
        }

        // stok terbesar / terendah
        const nameRow = (label: string, list: { label: string; value: number }[]) => {
            title(wsR, label);
            hdr(wsR.addRow(['Item', 'Stok', 'Nilai', 'Status']));
            const t0 = wsR.rowCount + 1;
            list.slice(0, 8).forEach((x, i) => {
                const r = t0 + i, M = `MATCH(A${r},${col('A')},0)`;
                wsR.addRow([x.label, F(`IFERROR(INDEX(${col('C')},${M}),${x.value})`, x.value), F(`IFERROR(INDEX(${col('E')},${M}),0)`), F(`IFERROR(INDEX(${col('I')},${M}),"-")`)]);
            });
            body(wsR, t0, wsR.rowCount, 4);
            wsR.addRow([]);
        };
        nameRow('Delapan Item dengan Stok Terbesar', stock.topStock);
        nameRow('Delapan Item dengan Stok Terendah', stock.bottomStock);
        side(wsR, cur, SC, 'Delapan item dengan stok terbesar', hbarChart(stock.topStock.slice(0, 8), { labelLen: 14 }));
        side(wsR, cur, SC, 'Delapan item dengan stok terendah', hbarChart(stock.bottomStock.slice(0, 8), { labelLen: 14, colors: [STATUS_COLORS[0]] }));

        // — Persediaan (daftar item, rumus hidup) —
        const ws = wb.addWorksheet('Persediaan');
        widths(ws, [32, 18, 12, 14, 18, 11, 12, 8, 12, 18, 16]);
        hdr(ws.addRow(['Item', 'Kategori', 'Stok', 'Harga satuan', 'Nilai = Stok x Harga', '% Nilai', '% Kumulatif', 'ABC', 'Status', 'Rekomendasi pesan', 'Estimasi biaya']));
        items.forEach((it, k) => {
            const r = first + k;
            ws.addRow([it.name, it.category, it.quantity, it.unitPrice, F(`C${r}*IF(D${r}=0,1,D${r})`, it.totalValue), F(`IF(${PS(rTV)}=0,0,E${r}/${PS(rTV)})`), F(`IF(${PS(rTV)}=0,0,SUM(E$${first}:E${r})/${PS(rTV)})`),
            F(`IF(OR(ROW()=${first},G${r}<=0.7),"A",IF(G${r}<=0.9,"B","C"))`),
            F(`IF(C${r}<=${PS(rKr)},"Kritis",IF(C${r}<=${PS(rMn)},"Menipis",IF(C${r}>=${PS(rOv)},"Overstock","Aman")))`),
            F(`IF(C${r}<=${PS(rKr)},MAX(5,ROUND(1.5*${PS(rMed)},0)-C${r}),IF(C${r}<=${PS(rMn)},MAX(2,ROUND(1.2*${PS(rMed)},0)-C${r}),0))`),
            F(`J${r}*IF(D${r}=0,10,D${r})`)]);
        });
        body(ws, first, lastR, 11);
        fmtCols(ws, first, lastR, [6, 7], PCT);
        ws.addConditionalFormatting(statusFill(`I${first}:I${lastR}`, [['Kritis', 'FFFFC7CE'], ['Menipis', 'FFFFEB9C'], ['Overstock', 'FFDDEBF7']]));
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };
    }

    // ───── Pengadaan ─────
    if (stock && needs) {
        const ws = wb.addWorksheet('Pengadaan');
        widths(ws, [34, 18, 12, 14, 14, 18, 12, 12]);
        const lastI = Math.max(2, stock.items.slice(0, 5000).length + 1);
        const lk = (r: number, c: number, fallback: number) => `IFERROR(VLOOKUP($A${r},Persediaan!$A$2:$K$${lastI},${c},FALSE),${fallback})`;
        title(ws, 'Daftar Kebutuhan Pengadaan (rumus hidup mengacu pada sheet Persediaan)');
        note(ws, 'Jumlah pesan: kritis = maks(5, 1,5 x median - stok); menipis = maks(2, 1,2 x median - stok). Estimasi biaya = jumlah pesan x harga satuan (harga 0 diganti 10).');
        hdr(ws.addRow(['Item', 'Kategori', 'Stok', 'Harga satuan', 'Jumlah pesan', 'Estimasi biaya', 'Prioritas', '% anggaran']));
        const f0 = ws.rowCount + 1, e = f0 + needs.procurementItems.length - 1;
        const priceOf = new Map(stock.items.map((x) => [x.name, x.unitPrice]));
        needs.procurementItems.forEach((x, k) => {
            const r = f0 + k;
            ws.addRow([x.name, x.category, F(lk(r, 3, x.currentStock), x.currentStock), F(lk(r, 4, priceOf.get(x.name) ?? 0), priceOf.get(x.name) ?? 0),
            F(lk(r, 10, x.recommendedQty), x.recommendedQty), F(`E${r}*IF(D${r}=0,10,D${r})`, x.estimatedCost), x.priority, F(`IF(SUM(F$${f0}:F$${e})=0,0,F${r}/SUM(F$${f0}:F$${e}))`)]);
        });
        if (needs.procurementItems.length) {
            body(ws, f0, e, 8);
            fmtCols(ws, f0, e, [8], PCT);
            ws.addConditionalFormatting(statusFill(`G${f0}:G${e}`, [['Urgent', 'FFFFC7CE'], ['High', 'FFFFEB9C']]));
        }
        const t = ws.addRow(['TOTAL', '', F(`SUM(C${f0}:C${e})`), '', F(`SUM(E${f0}:E${e})`), F(`SUM(F${f0}:F${e})`), '', F(`SUM(H${f0}:H${e})`)]);
        t.font = { bold: true }; t.getCell(8).numFmt = PCT;
        for (const c of [3, 5, 6]) { t.getCell(c).numFmt = c === 6 ? NUM : INT; }
        ws.addRow([]);
        title(ws, 'Ringkasan menurut Prioritas');
        hdr(ws.addRow(['Prioritas', 'Jumlah item', 'Total pesan', 'Total biaya', '% anggaran']));
        const p0 = ws.rowCount + 1;
        ['Urgent', 'High'].forEach((p, i) => {
            const r = p0 + i;
            ws.addRow([p, F(`COUNTIF($G$${f0}:$G$${e},A${r})`, p === 'Urgent' ? needs.urgentItemCount : needs.highPriorityCount), F(`SUMIF($G$${f0}:$G$${e},A${r},$E$${f0}:$E$${e})`),
                F(`SUMIF($G$${f0}:$G$${e},A${r},$F$${f0}:$F$${e})`), F(`IF(SUM($F$${f0}:$F$${e})=0,0,D${r}/SUM($F$${f0}:$F$${e}))`)]);
        });
        body(ws, p0, ws.rowCount, 5);
        fmtCols(ws, p0, ws.rowCount, [2, 3], INT); fmtCols(ws, p0, ws.rowCount, [5], PCT);
        ws.addRow([]);
        title(ws, 'Risiko Operasional'); needs.riskWarnings.forEach((s) => ws.addRow([noEmoji(s)]));
        ws.addRow([]);
        title(ws, 'Rencana Aksi'); needs.actionPlan.forEach((a) => ws.addRow([noEmoji(a.title), noEmoji(a.description)]));
        const sorted = [...needs.procurementItems].sort((a, b) => b.estimatedCost - a.estimatedCost).slice(0, 8);
        if (sorted.length) {
            side(ws, { row: 2 }, 9, 'Estimasi biaya pengadaan terbesar', hbarChart(sorted.map((x) => ({ label: x.name, value: x.estimatedCost })), { labelLen: 14, colors: [STATUS_COLORS[1]] }));
        }
    }

    // ───── Decision Tree ─────
    if (dt) {
        const ws = wb.addWorksheet('Decision Tree');
        widths(ws, [32, 14, 14, 14, 14, 14, 14, 14, 16, 4]);
        const m = dt.confusionMatrix, k = m.length;
        const labs = Object.keys(dt.classDistribution).sort();
        const lab = labs.length === k ? labs : m.map((_, i) => `Kelas ${i + 1}`);
        const cur = { row: 2 };
        const SC = Math.max(10, k + 3);
        title(ws, `Klasifikasi C4.5, target: ${dt.targetAttribute}`);
        note(ws, `Data latih ${dt.trainingSize}, data uji ${dt.testSize}, ${dt.predictiveAttributes.length} atribut prediktor, ${dt.rules.length} aturan. Aturan lengkap pada sheet "DT Aturan", langkah rinci pada "DT Langkah".`);
        ws.addRow([]);
        // distribusi + entropi
        title(ws, '1. Distribusi kelas dan entropi: H = -Sum p log2 p');
        hdr(ws.addRow(['Kelas', 'Jumlah', 'p', '-p log2(p)']));
        const d0 = ws.rowCount + 1, dist = Object.entries(dt.classDistribution).sort((a, b) => b[1] - a[1]), d1 = d0 + dist.length - 1;
        dist.forEach(([l, v], i) => ws.addRow([l, v, F(`B${d0 + i}/SUM(B$${d0}:B$${d1})`), F(`IF(C${d0 + i}=0,0,-C${d0 + i}*LOG(C${d0 + i},2))`)]));
        body(ws, d0, d1, 4);
        for (let r = d0; r <= d1; r++) { ws.getCell(r, 2).numFmt = INT; ws.getCell(r, 3).numFmt = R4; ws.getCell(r, 4).numFmt = R4; }
        const eH = ws.addRow(['Entropi dataset (bit)', '', '', F(`SUM(D${d0}:D${d1})`)]); eH.font = { bold: true }; eH.getCell(4).numFmt = R4;
        const eM = ws.addRow(['Entropi maksimum = log2(jumlah kelas)', '', '', F(`LOG(${dist.length},2)`)]); eM.getCell(4).numFmt = R4;
        const eE = ws.addRow(['Efisiensi entropi = H / H maks', '', '', F(`IF(D${eM.number}=0,0,D${eH.number}/D${eM.number})`)]); eE.getCell(4).numFmt = PCT;
        const eB = ws.addRow(['Akurasi dasar (kelas mayoritas)', '', F(`MAX(B${d0}:B${d1})/SUM(B${d0}:B${d1})`)]); eB.getCell(3).numFmt = PCT;
        const baseRow = eB.number;
        ws.addRow([]);
        side(ws, cur, SC, 'Distribusi kelas target', hbarChart(dist.slice(0, 8).map(([l, v]) => ({ label: l, value: v })), { fmt: (v) => String(Math.round(v)), labelLen: 14 }));
        // gain ratio
        title(ws, '2. Gain, SplitInfo, dan Gain Ratio = Gain / SplitInfo');
        hdr(ws.addRow(['Atribut', 'Gain', 'SplitInfo', 'Gain Ratio', 'Peringkat']));
        const g0 = ws.rowCount + 1, gN = Math.min(20, dt.splitMetrics.length);
        dt.splitMetrics.slice(0, 20).forEach((s, i) => ws.addRow([s.attribute, s.informationGain, s.splitInfo, F(`IF(C${g0 + i}=0,0,B${g0 + i}/C${g0 + i})`, s.gainRatio), F(`RANK(D${g0 + i},D$${g0}:D$${g0 + gN - 1})`)]));
        body(ws, g0, ws.rowCount, 5);
        for (let r = g0; r <= ws.rowCount; r++) { [2, 3, 4].forEach((c) => { ws.getCell(r, c).numFmt = R4; }); ws.getCell(r, 5).numFmt = INT; }
        ws.addRow([]);
        title(ws, '3. Kepentingan fitur (information gain ternormalisasi)');
        hdr(ws.addRow(['Fitur', 'Kepentingan', 'Kumulatif']));
        const fi0 = ws.rowCount + 1, fiN = Math.min(15, dt.featureImportance.length);
        dt.featureImportance.slice(0, 15).forEach((f, i) => ws.addRow([f.feature, f.importance, F(`SUM(B$${fi0}:B${fi0 + i})`)]));
        body(ws, fi0, ws.rowCount, 3);
        fmtCols(ws, fi0, ws.rowCount, [2, 3], PCT);
        void fiN;
        ws.addRow([]);
        if (dt.featureImportance.length) {
            side(ws, cur, SC, 'Kepentingan fitur (%)', hbarChart(dt.featureImportance.slice(0, 8).map((f) => ({ label: f.feature, value: f.importance * 100 })), { labelLen: 14 }));
        }
        // konfusi
        title(ws, '4. Matriks konfusi (baris = aktual, kolom = prediksi)');
        hdr(ws.addRow(['Aktual \\ Prediksi', ...lab, 'Total baris']));
        const m0 = ws.rowCount + 1, m1 = m0 + k - 1, lc = L(k);
        m.forEach((row, i) => ws.addRow([lab[i], ...row, F(`SUM(B${m0 + i}:${lc}${m0 + i})`)]));
        ws.addRow(['Total kolom', ...lab.map((_, j) => F(`SUM(${L(1 + j)}${m0}:${L(1 + j)}${m1})`)), F(`SUM(${L(k + 1)}${m0}:${L(k + 1)}${m1})`)]);
        body(ws, m0, m1 + 1, k + 2);
        for (let r = m0; r <= m1 + 1; r++) { for (let c = 2; c <= k + 2; c++) { ws.getCell(r, c).numFmt = INT; } }
        ws.addConditionalFormatting({
            ref: `B${m0}:${lc}${m1}`, rules: [{
                type: 'colorScale', priority: 1,
                cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FF5B9BD5' }]
            }]
        });
        if (k >= 2 && k <= 6) {
            side(ws, cur, SC, 'Matriks konfusi', matrixChart(lab.map((l) => cut(l, 8)), lab.map((l) => cut(l, 8)), m, { kind: 'count', fmt: (v) => String(Math.round(v)) }));
        }
        const T = `${L(k + 1)}${m1 + 1}`, colTot = m1 + 1;
        ws.addRow([]);
        title(ws, '5. Metrik per kelas: Precision = TP/(TP+FP); Recall = TP/(TP+FN); F1 = 2PR/(P+R)');
        hdr(ws.addRow(['Kelas', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1', 'Dukungan', 'Baris x Kolom']));
        const p0 = ws.rowCount + 1;
        lab.forEach((l, i) => {
            const r = p0 + i, cl = L(1 + i);
            ws.addRow([l, F(`${cl}${m0 + i}`), F(`${cl}${colTot}-B${r}`), F(`${L(k + 1)}${m0 + i}-B${r}`),
                F(`IF(B${r}+C${r}=0,0,B${r}/(B${r}+C${r}))`), F(`IF(B${r}+D${r}=0,0,B${r}/(B${r}+D${r}))`), F(`IF(E${r}+F${r}=0,0,2*E${r}*F${r}/(E${r}+F${r}))`),
                F(`${L(k + 1)}${m0 + i}`), F(`${L(k + 1)}${m0 + i}*${cl}${colTot}`)]);
        });
        const p1 = p0 + k - 1;
        body(ws, p0, p1, 9);
        for (let r = p0; r <= p1; r++) { [5, 6, 7].forEach((c) => { ws.getCell(r, c).numFmt = PCT; });[2, 3, 4, 8, 9].forEach((c) => { ws.getCell(r, c).numFmt = INT; }); }
        ws.addRow([]);
        const pc = ws.rowCount + 1;
        const kv3 = (l: string, f: ExcelJS.CellValue, fmt = PCT) => { const r = ws.addRow([l, f]); r.getCell(1).font = { bold: true }; r.getCell(1).border = BORDER; r.getCell(2).border = BORDER; r.getCell(2).numFmt = fmt; };
        kv3('Akurasi = Sum(TP) / N', F(`SUM(B${p0}:B${p1})/${T}`, dt.accuracy));
        kv3('Peningkatan vs akurasi dasar (poin)', F(`B${pc}-C${baseRow}`));
        kv3('Precision makro', F(`AVERAGE(E${p0}:E${p1})`));
        kv3('Recall makro', F(`AVERAGE(F${p0}:F${p1})`));
        kv3('F1 makro', F(`AVERAGE(G${p0}:G${p1})`));
        kv3('F1 tertimbang', F(`SUMPRODUCT(G${p0}:G${p1},H${p0}:H${p1})/${T}`));
        kv3('Kappa Cohen = (po - pe) / (1 - pe)', F(`(B${pc}-SUM(I${p0}:I${p1})/${T}^2)/(1-SUM(I${p0}:I${p1})/${T}^2)`), R3);
        kv3('Galat (error rate) = 1 - akurasi', F(`1-B${pc}`));
        const wsA = wb.addWorksheet('DT Aturan');
        widths(wsA, [6, 150]);
        title(wsA, `Aturan keputusan C4.5 (target: ${dt.targetAttribute})`);
        hdr(wsA.addRow(['No', 'Aturan']));
        const a0 = wsA.rowCount + 1;
        dt.rules.slice(0, 1000).forEach((r, i) => wsA.addRow([i + 1, r]));
        body(wsA, a0, wsA.rowCount, 2);
        wsA.views = [{ state: 'frozen', ySplit: 2 }];

        const wsL = wb.addWorksheet('DT Langkah');
        widths(wsL, [6, 46, 40, 70, 40]);
        title(wsL, 'Langkah perhitungan rinci Decision Tree (entropi, gain, gain ratio)');
        hdr(wsL.addRow(['No', 'Uraian', 'Rumus', 'Perhitungan', 'Hasil']));
        const l0 = wsL.rowCount + 1;
        dt.detailedCalculations.slice(0, 1000).forEach((x) => wsL.addRow([x.step, noEmoji(x.description), x.formula, x.calculation, String(x.result)]));
        for (let r = l0; r <= wsL.rowCount; r++) { for (let c = 1; c <= 5; c++) { const cell = wsL.getCell(r, c); cell.alignment = { wrapText: true, vertical: 'top' }; cell.border = BORDER; } }
        wsL.views = [{ state: 'frozen', ySplit: 2 }];
    }

    // ───── Workflow (flowchart + tabel ringkasan) ─────
    const fc = layoutFlow(sheet, 'slide', `Dataset ${fileName}, lembar ${sheet.name}`);
    const wsW = wb.addWorksheet('Workflow', { properties: { tabColor: { argb: 'FFC00000' } } });
    widths(wsW, [6, 36, 70, 16]);
    title(wsW, 'Diagram Alir Analisis (merah = jalur utama, biru = cabang aktif, abu-abu = dilewati)');
    hdr(wsW.addRow(['No', 'Langkah', 'Hasil utama', 'Status']));
    const stTxt = { critical: 'Jalur utama', active: 'Cabang aktif', skipped: 'Dilewati' } as const;
    const stCol = { critical: 'FFC00000', active: BLUE, skipped: 'FF7F7F7F' } as const;
    fc.rows.forEach((r) => {
        const row = wsW.addRow([r.no, r.step, r.result, stTxt[r.state]]);
        row.eachCell((c) => { c.border = BORDER; });
        row.getCell(4).font = { bold: true, color: { argb: stCol[r.state] } };
    });
    wsW.addRow([]);
    below(wsW, 'Diagram alir analisis data otomatis', flowChart(fc), 1100);

    // ───── Grafik (galeri semua grafik) ─────
    const wsG = wb.addWorksheet('Grafik', { properties: { tabColor: { argb: 'FFED7D31' } } });
    widths(wsG, [4, 100]);
    let row = 1;
    gallery.forEach((c, i) => {
        wsG.getCell(`A${row}`).value = `Gambar ${i + 1}. ${c.name}`;
        wsG.getCell(`A${row}`).font = { bold: true, color: { argb: BLUE } };
        const h = putImg(wsG, c.ch, 0, row, 600);
        row += Math.ceil(h / 20) + 3;
    });
    if (!gallery.length) { wsG.getCell('A1').value = 'Tidak ada grafik yang dapat dibuat dari data ini.'; }

    // ───── Metodologi ─────
    const wsM = wb.addWorksheet('Metodologi');
    widths(wsM, [130]);
    title(wsM, 'Rumus yang digunakan');
    [
        'Kelengkapan = sel terisi / total sel x 100%;  Integritas = (1 - duplikat / baris) x 100%;  Konsistensi = kolom dengan data hilang < 50% / jumlah kolom x 100%',
        'Skor kualitas = 0,45 Kelengkapan + 0,35 Integritas + 0,20 Konsistensi',
        'Rata-rata = AVERAGE;  Median = MEDIAN;  Std = STDEV (sampel);  Varians = Std^2;  Std Error = Std / akar(N);  CI 95% = Rata-rata ± 1,96 x Std Error',
        'IQR = Q3 - Q1;  Outlier bila < Q1 - 1,5 IQR atau > Q3 + 1,5 IQR;  CV = Std / |Rata-rata|;  Rentang = Maks - Min;  Skewness = SKEW;  Kurtosis = KURT',
        'r = CORREL(X, Y);  Y = a + bX;  b = SLOPE;  a = INTERCEPT;  R2 = r^2;  t = r akar((n - 2) / (1 - r2));  p = TDIST(|t|, n - 2, 2);  SE est. = STEYX',
        'Chi-kuadrat = Sum (O - E)^2 / E;  E = total baris x total kolom / N;  db = (r - 1)(k - 1);  p = CHIDIST;  V Cramer = akar(Chi / (N min(r - 1, k - 1)))',
        'Entropi kategori = -Sum p log2 p;  Tren: kemiringan = SLOPE, R2 = RSQ, prakiraan = FORECAST',
        'Persediaan: Kritis <= maks(1, 0,15 x Median); Menipis <= maks(2, 0,40 x Median); Overstock >= maks(15, 2,5 x Median)',
        'ABC: kumulatif nilai <= 70% = A, <= 90% = B, sisanya C;  HHI = Sum (pangsa nilai)^2 x 10.000;  Gini = [2 Sum i xi / (n Sum xi)] - (n + 1) / n',
        'Pengadaan: kritis = maks(5, 1,5 x Median - stok); menipis = maks(2, 1,2 x Median - stok);  Biaya = jumlah pesan x harga satuan',
        'Entropi = -Sum p log2 p;  Gain = H(S) - Sum (|Sv|/|S|) H(Sv);  SplitInfo = -Sum (|Sv|/|S|) log2(|Sv|/|S|);  Gain Ratio = Gain / SplitInfo',
        'Akurasi = Sum TP / N;  Precision = TP/(TP+FP);  Recall = TP/(TP+FN);  F1 = 2PR/(P+R);  Kappa = (po - pe)/(1 - pe)',
        'Catatan: rumus pada lembar dihitung ulang otomatis saat file dibuka. Hasil dapat berbeda tipis dari angka pada aplikasi untuk SKEW/KURT (koreksi sampel) dan pembagian data latih/uji Decision Tree (acak).',
    ].forEach((s) => { const r = wsM.addRow([s]); r.alignment = { wrapText: true, vertical: 'top' }; });

    fillToc(wb, wsToc, fileName, {
        'Ringkasan': 'Skor kualitas data (rumus hidup), hasil pemeriksaan, catatan otomatis, rekomendasi',
        'Profil Kolom': 'Tipe, jumlah terisi/hilang, nilai unik, min/rata-rata/maks per kolom',
        'Data': 'Data sumber (dipakai semua rumus)',
        'Statistik': 'Statistik deskriptif, outlier IQR, interval kepercayaan, histogram',
        'Korelasi': 'Matriks korelasi Pearson (CORREL) + peta panas',
        'Regresi': 'Regresi linear sederhana 15 pasangan terkuat (a, b, R2, t, p)',
        'Kategorikal': 'Frekuensi kategori, entropi, uji chi-kuadrat dan V Cramer',
        'Tren & Kelompok': 'Tren waktu, prakiraan, perbandingan rata-rata antar kelompok',
        'Ringkasan Stok': 'Parameter stok, status, ABC, HHI, Gini, kategori',
        'Persediaan': 'Daftar item: nilai, % kumulatif, ABC, status, rekomendasi pesan',
        'Pengadaan': 'Daftar kebutuhan pengadaan, anggaran, risiko, rencana aksi',
        'Decision Tree': 'Entropi, gain ratio, kepentingan fitur, matriks konfusi, metrik',
        'DT Aturan': 'Seluruh aturan keputusan C4.5',
        'DT Langkah': 'Langkah perhitungan rinci entropi dan gain',
        'Workflow': 'Diagram alir analisis + tabel ringkasan',
        'Grafik': 'Galeri seluruh grafik',
        'Metodologi': 'Daftar rumus yang digunakan',
    });
    const rep = sanitizeWorkbook(wb);
    const cyc = findCircular(wb);
    if (cyc.length) { console.error('[Date Skunder] REFERENSI MELINGKAR terdeteksi:\n' + cyc.join('\n')); }
    if (rep.clipped || rep.nonFinite || rep.badChars) { console.warn('[Date Skunder] sel dibersihkan:', rep); }
    polishWorkbook(wb);
    return new Uint8Array(await wb.xlsx.writeBuffer());
}