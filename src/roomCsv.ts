/**
 * Utilitas CSV untuk fitur Join Room.
 *
 * Dipakai bersama oleh ekstensi (host) dan uji `scripts/check-room.cjs`, jadi berkas ini
 * tidak boleh mengimpor `vscode`. Semua fungsi murni: teks masuk → struktur keluar.
 */

/** Satu sel yang diubah: indeks baris & kolom absolut (0 = baris pertama berkas). */
export interface CellChange {
    r: number;
    c: number;
    value: string;
}

/** Perbandingan satu sel sebelum/sesudah diubah (untuk pratinjau). */
export interface CellDiff {
    r: number;
    c: number;
    /** Nama kolom (header) atau `Kolom 3` bila berkas tidak punya header. */
    label: string;
    before: string;
    after: string;
}

export interface CsvTable {
    /** Pemisah kolom yang terdeteksi (`,` `;` tab `|`). */
    delimiter: string;
    /** Gaya akhir baris asli berkas (agar tulis ulang tidak mengubah seluruh berkas). */
    eol: string;
    /** Seluruh baris, termasuk baris pertama (header). */
    rows: string[][];
    /** Nama kolom (baris pertama). */
    columns: string[];
    totalRows: number;
    totalCols: number;
    /** Berkas .csv/.tsv/.txt boleh diubah; .xlsx/.xls hanya pratinjau. */
    editable: boolean;
}

const DELIMITERS: Array<{ char: string; name: string }> = [
    { char: ',', name: 'koma' },
    { char: ';', name: 'titik koma' },
    { char: '\t', name: 'tab' },
    { char: '|', name: 'pipa' },
];

/** Tebak pemisah kolom dari baris pertama yang berisi data. */
export function sniffDelimiter(text: string): string {
    const firstLine = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
    let best = ',';
    let bestCount = 0;
    for (const { char } of DELIMITERS) {
        // Tanda di dalam kutip diabaikan supaya judul kolom seperti "Toko, Jakarta" tidak menipu.
        let count = 0;
        let quoted = false;
        for (const ch of firstLine) {
            if (ch === '"') { quoted = !quoted; continue; }
            if (!quoted && ch === char) { count++; }
        }
        if (count > bestCount) { best = char; bestCount = count; }
    }
    return best;
}

/** Deteksi gaya akhir baris (CRLF / LF) supaya berkas tidak "berubah seluruhnya" saat ditulis. */
export function sniffEol(text: string): string {
    return /\r\n/.test(String(text || '')) ? '\r\n' : '\n';
}

/**
 * Pecah teks CSV menjadi baris & sel. Mendukung kutip ganda, kutip yang di-escape (`""`),
 * dan akhir baris di dalam sel (baris multi-line).
 */
export function parseCsvRows(text: string, delimiter: string): string[][] {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    let started = false;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i++; }
                else { quoted = false; }
            } else {
                field += ch;
            }
            continue;
        }
        if (ch === '"') {
            quoted = true;
            started = true;
            continue;
        }
        if (ch === delimiter) {
            row.push(field);
            field = '';
            started = true;
            continue;
        }
        if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && src[i + 1] === '\n') { i++; }
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
            started = false;
            continue;
        }
        field += ch;
        started = true;
    }
    if (started || field.length || row.length) {
        row.push(field);
        rows.push(row);
    }
    // Baris kosong di akhir berkas (sisa akhir baris) tidak perlu dipertahankan.
    while (rows.length > 1) {
        const last = rows[rows.length - 1];
        if (last.length === 1 && last[0] === '') { rows.pop(); } else { break; }
    }
    return rows;
}

/** Normalisasi lebar baris agar setiap baris punya jumlah kolom yang sama. */
export function normalizeRows(rows: string[][], minCols = 0): string[][] {
    let cols = Math.max(minCols, ...rows.map((r) => r.length), 0);
    return rows.map((cells) => {
        if (cells.length === cols) { return cells.slice(); }
        const next = cells.slice(0, cols);
        while (next.length < cols) { next.push(''); }
        return next;
    });
}

/** Baca teks CSV menjadi tabel siap-edit. */
export function readCsv(text: string, editable = true, delimiter?: string): CsvTable {
    const sep = delimiter || sniffDelimiter(text);
    const eol = sniffEol(text);
    const rows = normalizeRows(parseCsvRows(text, sep));
    const columns = (rows[0] || []).map((name, i) => String(name || '').trim() || `Kolom ${i + 1}`);
    return {
        delimiter: sep,
        eol,
        rows,
        columns,
        totalRows: Math.max(0, rows.length - 1),
        totalCols: columns.length,
        editable,
    };
}

/** Satu sel perlu dikutip bila berisi pemisah, kutip, atau baris baru. */
function quoteCell(value: string, delimiter: string): string {
    const text = String(value ?? '');
    const needs = text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text) || /^\s|\s$/.test(text);
    return needs ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Susun kembali baris menjadi teks CSV dengan pemisah & akhir baris yang sama. */
export function toCsv(rows: string[][], delimiter: string, eol = '\r\n'): string {
    return rows.map((cells) => cells.map((cell) => quoteCell(cell, delimiter)).join(delimiter)).join(eol) + eol;
}

/** Salin baris lalu terapkan perubahan sel; indeks di luar jangkauan diabaikan. */
export function applyCellChanges(rows: string[][], changes: CellChange[], maxCols = 0): string[][] {
    const next = rows.map((cells) => cells.slice());
    for (const change of Array.isArray(changes) ? changes : []) {
        const r = Number(change?.r);
        const c = Number(change?.c);
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) { continue; }
        if (r >= next.length) { continue; }
        if (maxCols > 0 && c >= maxCols) { continue; }
        while (next[r].length <= c) { next[r].push(''); }
        next[r][c] = String(change?.value ?? '');
    }
    return next;
}

/** Nama kolom untuk pesan pratinjau. */
export function columnLabel(columns: string[], c: number): string {
    const name = columns[c];
    return name && name.trim() ? name.trim() : `Kolom ${c + 1}`;
}

/** Bandingkan dua tabel; hasil dibatasi `limit` sel pertama untuk tampilan pratinjau. */
export function diffCells(before: string[][], after: string[][], columns: string[], limit = 60): { changed: CellDiff[]; count: number } {
    const changed: CellDiff[] = [];
    let count = 0;
    const rows = Math.max(before.length, after.length);
    for (let r = 0; r < rows; r++) {
        const a = before[r] || [];
        const b = after[r] || [];
        const cols = Math.max(a.length, b.length);
        for (let c = 0; c < cols; c++) {
            const lalu = String(a[c] ?? '');
            const kini = String(b[c] ?? '');
            if (lalu === kini) { continue; }
            count++;
            if (changed.length < limit) {
                changed.push({ r, c, label: columnLabel(columns, c), before: lalu, after: kini });
            }
        }
    }
    return { changed, count };
}

/** Ringkasan pendek: jumlah sel/baris dan beberapa contoh kolom. */
export function csvSummary(changes: CellDiff[], count = changes.length): string {
    if (!changes.length) { return 'Tidak ada perubahan.'; }
    const rows = new Set(changes.map((c) => c.r));
    const cols = [...new Set(changes.map((c) => c.label))].slice(0, 3);
    const tail = count > changes.length ? ` (+${count - changes.length} sel lain)` : '';
    return `${count} sel di ${rows.size} baris diubah${cols.length ? ` · ${cols.join(', ')}` : ''}${tail}`;
}

/** Potongan tabel untuk ditampilkan di sidebar (baris/kolom dibatasi). */
export function tableWindow(table: CsvTable, maxRows: number, maxCols: number): { rows: string[][]; truncated: boolean } {
    const rows = table.rows.slice(0, Math.max(1, maxRows)).map((cells) => {
        const next = cells.slice(0, Math.max(1, maxCols));
        while (next.length < Math.min(maxCols, table.totalCols)) { next.push(''); }
        return next;
    });
    const truncated = table.rows.length > rows.length || table.totalCols > maxCols;
    return { rows, truncated };
}
