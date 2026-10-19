import { WorkbookResult } from './analysis';
import { EASYCAST_CLIENT } from './Easycastclient';

export interface EasyCastHtmlOptions {
    /** Jumlah baris data mentah per sheet yang ikut dibawa (tabel data di halaman). */
    maxRows?: number;
    /** Detik per bagian pada mode presentasi otomatis. */
    seconds?: number;
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Salinan ringan hasil analisis: baris data dipangkas agar kiriman ke TV / file .html tidak membengkak. */
export function easyCastSlim(workbook: WorkbookResult, maxRows = 300): WorkbookResult {
    return { ...workbook, sheets: workbook.sheets.map((s) => ({ ...s, rows: s.rows.slice(0, maxRows) })) };
}

/**
 * File .html MANDIRI: seluruh dasbor EasyCast (ringkasan, KPI bisnis, stok, kebutuhan, kualitas CSV,
 * pohon C4.5, grafik, kolom, korelasi, tabel) + data hasil analisis tertanam di dalamnya.
 * Tanpa CDN dan tanpa server, jadi bisa dibuka langsung di browser atau diunggah ke hosting/website.
 * Bagian yang tampil mengikuti apa yang terdeteksi pada CSV (dihitung di analysis.ts).
 */
export function buildEasyCastHtml(workbook: WorkbookResult, opts: EasyCastHtmlOptions = {}): string {
    const payload = easyCastSlim(workbook, opts.maxRows ?? 500);
    const json = JSON.stringify(payload)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    const client = EASYCAST_CLIENT.replace(/<\/script/gi, '<\\/script');
    const seconds = Math.min(60, Math.max(5, Math.round(opts.seconds ?? 12)));
    const title = `EasyCast - ${payload.fileName}`;
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="Date Skunder EasyCast">
<title>${escHtml(title)}</title>
<style>html,body{margin:0;background:#0e1116}</style>
</head>
<body data-ec-solo="1" data-ec-static="1" data-ec-seconds="${seconds}">
<noscript>EasyCast membutuhkan JavaScript untuk menampilkan dasbor.</noscript>
<script>window.__EC_DATA__=${json};</script>
<script>${client}</script>
</body>
</html>`;
}