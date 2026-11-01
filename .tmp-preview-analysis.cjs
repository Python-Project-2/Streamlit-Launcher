/* Pratinjau halaman analisis (main.js) di browser untuk memeriksa tampilan header. */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = __dirname;

(async () => {
    const out = path.join(root, '.tmp-check', `analysis-${process.pid}.cjs`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'src', 'analysis.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        outfile: out,
        logLevel: 'warning',
    });
    const { analyzeWorkbook } = require(out);
    const csv = fs.readFileSync(path.join(root, 'database', 'SuperMarket Analysis.csv'));
    const payload = analyzeWorkbook(csv, 'SuperMarket Analysis.csv');
    fs.rmSync(out, { force: true });

    const page = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<link href="media/main.css" rel="stylesheet">
<link href="media/spider.css" rel="stylesheet">
<link href="media/pen.css" rel="stylesheet">
<link href="media/room.css" rel="stylesheet">
<title>Date Skunder</title></head>
<body data-ec-lang="id">
<div id="app"></div>
<script>window.acquireVsCodeApi = () => ({ postMessage(msg){ (window.__posted = window.__posted || []).push(msg); }, getState(){}, setState(){} });
window.__SK_I18N__ = {};</script>
<script src="media/chart.umd.js"></script>
<script src="media/builder.js"></script>
<script src="media/preview.js"></script>
<script src="media/spider.js"></script>
<script src="media/main.js"></script>
<script src="media/intro.js"></script>
<script src="media/pen.js"></script>
<script src="media/room.js"></script>
<script>setTimeout(() => window.postMessage({ type: 'data', payload: ${JSON.stringify(payload)} }, '*'), 100);</script>
</body></html>`;
    fs.writeFileSync(path.join(root, '.tmp-analysis-preview.html'), page, 'utf8');
    console.log('tulis .tmp-analysis-preview.html');
})();
