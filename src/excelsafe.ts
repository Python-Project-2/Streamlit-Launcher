import * as ExcelJS from 'exceljs';
const MAX_TEXT = 32000;
const MAX_FORMULA = 8000;
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const clipText = (s: string): string => {
    const t = s.replace(BAD_XML, '');
    return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT - 40) + '\n... (dipotong: melebihi batas 32.767 karakter Excel)' : t;
};

export interface SanitizeReport { clipped: number; nonFinite: number; badChars: number; formulasDropped: number }
export function sanitizeWorkbook(wb: ExcelJS.Workbook): SanitizeReport {
    const rep: SanitizeReport = { clipped: 0, nonFinite: 0, badChars: 0, formulasDropped: 0 };
    wb.eachSheet((ws) => {
        ws.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                const v = cell.value as unknown;
                if (typeof v === 'string') {
                    if (BAD_XML.test(v)) { rep.badChars++; }
                    BAD_XML.lastIndex = 0;
                    if (v.length > MAX_TEXT) { rep.clipped++; }
                    const c = clipText(v);
                    if (c !== v) { cell.value = c; }
                } else if (typeof v === 'number') {
                    if (!isFinite(v)) { cell.value = null; rep.nonFinite++; }
                } else if (v && typeof v === 'object' && 'formula' in (v as object)) {
                    const fv = v as { formula: string; result?: unknown };
                    if (fv.formula.length > MAX_FORMULA) {
                        cell.value = (typeof fv.result === 'number' || typeof fv.result === 'string') ? fv.result : null;
                        rep.formulasDropped++;
                    } else if (typeof fv.result === 'number' && !isFinite(fv.result)) {
                        cell.value = { formula: fv.formula } as ExcelJS.CellFormulaValue;
                        rep.nonFinite++;
                    } else if (typeof fv.result === 'string' && fv.result.length > MAX_TEXT) {
                        cell.value = { formula: fv.formula, result: clipText(fv.result) } as ExcelJS.CellFormulaValue;
                        rep.clipped++;
                    }
                }
            });
        });
    });
    return rep;
}

// ───────────────────────── deteksi referensi melingkar ─────────────────────────
const colNum = (s: string) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const REF = /(?<![A-Za-z0-9_.$])(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![A-Za-z0-9_(])/g;

interface Node { sheet: string; col: number; row: number; formula: string }

/**
 * Mengembalikan daftar rantai referensi melingkar (maks. 5). Lembar tanpa rumus (mis. "Data") dilewati agar cepat.
 * Hanya sel berumus yang menjadi simpul graf, jadi rentang besar ke lembar Data tidak diperluas.
 */
export function findCircular(wb: ExcelJS.Workbook): string[] {
    const nodes = new Map<string, Node>();
    const byCol = new Map<string, Map<number, number[]>>();     // sheet -> kolom -> baris (terurut) bersel rumus
    const key = (s: string, c: number, r: number) => `${s}!${colName(c)}${r}`;

    wb.eachSheet((ws) => {
        ws.eachRow({ includeEmpty: false }, (row, r) => {
            row.eachCell({ includeEmpty: false }, (cell, c) => {
                const v = cell.value as unknown;
                if (v && typeof v === 'object' && 'formula' in (v as object)) {
                    nodes.set(key(ws.name, c, r), { sheet: ws.name, col: c, row: r, formula: (v as { formula: string }).formula });
                    let m = byCol.get(ws.name); if (!m) { m = new Map(); byCol.set(ws.name, m); }
                    let a = m.get(c); if (!a) { a = []; m.set(c, a); }
                    a.push(r);
                }
            });
        });
    });
    byCol.forEach((m) => m.forEach((a) => a.sort((x, y) => x - y)));

    const lower = (a: number[], x: number) => { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) { lo = mid + 1; } else { hi = mid; } } return lo; };

    const deps = new Map<string, string[]>();
    nodes.forEach((n, k) => {
        const f = n.formula.replace(/"(?:[^"]|"")*"/g, '""');          // buang literal teks
        const out: string[] = [];
        REF.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = REF.exec(f))) {
            const sh = (m[1] ? m[1].replace(/''/g, "'") : m[2]) ?? n.sheet;
            const idx = byCol.get(sh);
            if (!idx) { continue; }
            const c1 = colNum(m[3]), r1 = +m[4], c2 = m[5] ? colNum(m[5]) : c1, r2 = m[6] ? +m[6] : r1;
            for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
                const rows = idx.get(c); if (!rows) { continue; }
                for (let i = lower(rows, Math.min(r1, r2)); i < rows.length && rows[i] <= Math.max(r1, r2); i++) { out.push(key(sh, c, rows[i])); }
            }
        }
        deps.set(k, out);
    });

    const color = new Map<string, number>();                              // 1 = sedang diproses, 2 = selesai
    const stack: string[] = [];
    const found: string[] = [];
    const visit = (k: string) => {
        if (found.length >= 5) { return; }
        color.set(k, 1); stack.push(k);
        for (const d of deps.get(k) ?? []) {
            const c = color.get(d);
            if (c === 1) { found.push([...stack.slice(stack.indexOf(d)), d].join(' -> ')); if (found.length >= 5) { break; } }
            else if (!c) { visit(d); }
        }
        stack.pop(); color.set(k, 2);
    };
    for (const k of nodes.keys()) { if (!color.get(k)) { visit(k); } }
    return found;
}

// ───────────────────────── perapian tampilan ─────────────────────────
const TAB: Record<string, string> = {
    'Daftar Isi': 'FF1F3864', 'Ringkasan': 'FF2F5597', 'Profil Kolom': 'FF2F5597', 'Data': 'FF7F7F7F',
    'Statistik': 'FF2F5597', 'Korelasi': 'FFED7D31', 'Regresi': 'FFED7D31', 'Kategorikal': 'FFED7D31', 'Tren & Kelompok': 'FFED7D31',
    'Ringkasan Stok': 'FF70AD47', 'Persediaan': 'FF70AD47', 'Pengadaan': 'FF70AD47',
    'Decision Tree': 'FF7030A0', 'DT Aturan': 'FF7030A0', 'DT Langkah': 'FF7030A0',
    'Workflow': 'FFC00000', 'Grafik': 'FFFFC000', 'Metodologi': 'FF7F7F7F',
};

export function polishWorkbook(wb: ExcelJS.Workbook): void {
    wb.eachSheet((ws) => {
        const isData = ws.name === 'Data';
        const prev = (ws.views && ws.views[0]) ? ws.views[0] : undefined;
        ws.views = [{ ...(prev as object), showGridLines: isData, zoomScale: isData ? 100 : 90 } as ExcelJS.WorksheetView];
        ws.pageSetup = { ...ws.pageSetup, orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
        ws.headerFooter = { oddFooter: '&L&8Date Skunder&C&8&A&R&8Halaman &P / &N' };
        if (!ws.properties.tabColor && TAB[ws.name]) { ws.properties.tabColor = { argb: TAB[ws.name] }; }
    });
}

/** Isi lembar "Daftar Isi" (harus dibuat paling awal agar menjadi lembar pertama). */
export function fillToc(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, fileName: string, desc: Record<string, string>): void {
    const NAVY = 'FF1F3864', BLUE = 'FF2F5597';
    ws.getColumn(1).width = 4; ws.getColumn(2).width = 28; ws.getColumn(3).width = 90; ws.getColumn(4).width = 14;
    ws.mergeCells('B2:D2');
    const t = ws.getCell('B2');
    t.value = 'Laporan Analisis Data Otomatis';
    t.font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 36;
    ws.mergeCells('B3:D3');
    const s = ws.getCell('B3');
    s.value = `Sumber: ${fileName}   |   Dibuat: ${new Date().toLocaleString('id-ID')}   |   Ekstensi Date Skunder`;
    s.font = { italic: true, color: { argb: 'FF595959' } };
    const h = ws.getRow(5);
    ['Lembar', 'Isi', 'Buka'].forEach((x, i) => {
        const c = h.getCell(2 + i); c.value = x;
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    let r = 6;
    const thin = { style: 'thin', color: { argb: 'FFD0D7E5' } } as const;
    wb.eachSheet((w) => {
        if (w.id === ws.id) { return; }
        const row = ws.getRow(r);
        row.getCell(2).value = w.name; row.getCell(2).font = { bold: true };
        row.getCell(3).value = desc[w.name] ?? '';
        row.getCell(3).alignment = { wrapText: true, vertical: 'middle' };
        row.getCell(4).value = { text: 'Buka >', hyperlink: `#'${w.name.replace(/'/g, "''")}'!A1` } as ExcelJS.CellHyperlinkValue;
        row.getCell(4).font = { color: { argb: 'FF0563C1' }, underline: true };
        row.getCell(4).alignment = { horizontal: 'center' };
        for (let c = 2; c <= 4; c++) {
            const cell = row.getCell(c);
            cell.border = { top: thin, bottom: thin, left: thin, right: thin };
            if (r % 2 === 1) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FC' } }; }
        }
        row.height = 22;
        r++;
    });
    ws.addRow([]);
    const n = ws.getRow(r + 1);
    n.getCell(2).value = 'Catatan: rumus dihitung ulang otomatis saat file dibuka. Warna tab: biru = ringkasan/statistik, oranye = hubungan antarvariabel, hijau = persediaan, ungu = Decision Tree, merah = workflow.';
    n.getCell(2).font = { italic: true, color: { argb: 'FF595959' } };
    ws.views = [{ showGridLines: false }];
}