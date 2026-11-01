import { WorkbookResult } from './analysis';
import { EASYCAST_CLIENT } from './Easycastclient';
import { I18N_CLIENT, i18nConfig, UiLang, uiLang } from './i18n';

export interface EasyCastHtmlOptions {
    /** Jumlah baris data mentah per sheet yang ikut dibawa (tabel data di halaman). */
    maxRows?: number;
    /** Detik per bagian pada mode presentasi otomatis. */
    seconds?: number;
    /** Bahasa antarmuka file .html ('id' bawaan, 'zh-cn' untuk Mandarin). */
    lang?: UiLang;
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Salinan ringan hasil analisis: baris data dipangkas agar kiriman ke TV / file .html tidak membengkak. */
export function easyCastSlim(workbook: WorkbookResult, maxRows = 300): WorkbookResult {
    return { ...workbook, sheets: workbook.sheets.map((s) => ({ ...s, rows: s.rows.slice(0, maxRows) })) };
}

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  html, body { background: #0b1020 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #ec-ov { position: static !important; height: auto !important; min-height: 0 !important; padding: 0 !important; }
  #ec-ov .ecx-top { position: static !important; }
  #ec-ov .ecx-main { overflow: visible !important; height: auto !important; max-height: none !important; }
  #ec-ov .prog, #ec-ov .ecx-chips, #ec-ov .ecx-nav, #ec-ov button, #ec-ov select { display: none !important; }
  #ec-ov .card, #ec-ov .kpi { break-inside: avoid; page-break-inside: avoid; }
}`;

export function buildEasyCastHtml(workbook: WorkbookResult, opts: EasyCastHtmlOptions = {}): string {
    const payload = easyCastSlim(workbook, opts.maxRows ?? 500);
    const json = JSON.stringify(payload)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    const client = EASYCAST_CLIENT.replace(/<\/script/gi, '<\\/script');
    const engine = I18N_CLIENT.replace(/<\/script/gi, '<\\/script');
    const seconds = Math.min(60, Math.max(5, Math.round(opts.seconds ?? 12)));
    const lang: UiLang = opts.lang ?? uiLang();
    const title = `EasyCast - ${payload.fileName}`;
    return `<!DOCTYPE html>
<html lang="${lang === 'zh-cn' ? 'zh-CN' : 'id'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="Date Skunder EasyCast">
<title>${escHtml(title)}</title>
<style>html,body{margin:0;background:#0e1116}${PRINT_CSS}</style>
</head>
<body data-ec-solo="1" data-ec-static="1" data-ec-lang="${lang}" data-ec-seconds="${seconds}">
<noscript>EasyCast membutuhkan JavaScript untuk menampilkan dasbor.</noscript>
<script>window.__EC_DATA__=${json};</script>
<script>window.__SK_I18N__=${i18nConfig(lang)};</script>
<script>${engine}</script>
<script>${client}</script>
</body>
</html>`;
}
