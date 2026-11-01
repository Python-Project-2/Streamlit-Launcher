/**
 * Pemeriksaan perilaku Spider tanpa VS Code:
 *
 *   npm run check:spider
 *
 *  1. Klasifikasi permintaan: pertanyaan/analisis vs perintah aksi.
 *  2. Pertanyaan TIDAK mengeksekusi apa pun (aksi diturunkan menjadi sorotan).
 *  3. Perintah aksi tetap dieksekusi (klik dipertahankan).
 *  4. Jawaban “belum tersedia dalam konteks data” diganti jawaban jujur berangka.
 *  5. Rencana model yang tidak memuat langkah tetap dianggap jawaban (tanpa aksi tebakan).
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const ok = (cond, label, extra) => {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
};

async function loadLib() {
    const outDir = path.join(root, '.tmp-check');
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `spider-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { buildSpiderPlan, parseSpiderPlan, hardenPlan, isQuestionRequest } from './src/spider';",
            ].join('\n'),
            resolveDir: root,
            loader: 'ts',
        },
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile,
        external: ['jsdom', 'pdf-lib'],
        logLevel: 'warning',
        plugins: [{
            name: 'vscode-stub',
            setup(build) {
                build.onResolve({ filter: /^vscode$/ }, () => ({ path: path.join(__dirname, 'vscode-stub.cjs') }));
            },
        }],
    });
    const lib = require(outfile);
    fs.rmSync(outfile, { force: true });
    return lib;
}

/** llama-server tiruan: membalas SSE sesuai isi instruksi pada prompt. */
function fakeLlama(replyForPrompt) {
    return new Promise((resolve) => {
        const seen = [];
        const srv = http.createServer((req, res) => {
            if (req.method !== 'POST' || !String(req.url).startsWith('/v1/chat/completions')) {
                res.writeHead(404); res.end('no'); return;
            }
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                let payload = {};
                try { payload = JSON.parse(body || '{}'); } catch (e) { /* abaikan */ }
                seen.push(payload);
                const text = replyForPrompt(payload);
                res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
                const chunks = String(text).match(/[\s\S]{1,12}/g) || [''];
                for (const c of chunks) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`); }
                res.write('data: [DONE]\n\n');
                res.end();
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, seen }));
    });
}

const TARGETS = [
    { id: 'kpi', label: 'KPI › Ringkasan penjualan', kind: 'section' },
    { id: 'stock', label: 'Stok › Kritis', kind: 'section' },
    { id: 'btn-export', label: 'tombol: Export Python', kind: 'button', click: true },
    { id: 'btn-tab', label: 'tab: Kritis', kind: 'tab', click: true },
];

const SUMMARY = [
    'Berkas: penjualan.csv · sheet Data: 120 baris x 8 kolom',
    '- Revenue 1.240.000.000; margin 18,4%; 320 order; AOV 3.875.000.',
    '- Stok: 12 SKU kritis, 8 menipis, 3 overstock; nilai stok 480.000.000.',
    '- Kualitas: skor 86/100, sel kosong 1,2%, duplikat 2 baris.',
].join('\n');

function request(text) {
    return {
        request: text,
        fileName: 'penjualan.csv',
        sheetName: 'Data',
        targets: TARGETS,
        summary: SUMMARY,
        facts: SUMMARY.split('\n'),
        running: true,
        port: 0,
        temperature: 0.2,
        maxTokens: 600,
        maxSteps: 8,
        contextSize: 8192,
    };
}

(async () => {
    const lib = await loadLib();

    console.log('\n[Klasifikasi permintaan]');
    ok(lib.isQuestionRequest('analisa kembali terkait penjualan produk'), 'analisa = pertanyaan');
    ok(lib.isQuestionRequest('kenapa margin turun bulan lalu?'), 'kenapa … ? = pertanyaan');
    ok(lib.isQuestionRequest('jelaskan kualitas data'), 'jelaskan = pertanyaan');
    ok(lib.isQuestionRequest('berapa stok kritis'), 'berapa = pertanyaan');
    ok(!lib.isQuestionRequest('export python'), 'export = perintah');
    ok(!lib.isQuestionRequest('tekan tombol export lalu jelaskan hasilnya'), 'perintah aksi menang');
    ok(!lib.isQuestionRequest('cari indomie'), 'cari = perintah');

    const fake = await fakeLlama((payload) => {
        // Hanya pesan pengguna yang dibaca: system prompt memang memuat kata “export”.
        const users = (payload.messages || []).filter((m) => m.role === 'user');
        const teks = String((users[users.length - 1] || {}).content || '');
        if (/apa itu regresi linear/i.test(teks)) {
            // Model kecil menjawab dengan penolakan khas + tetap menyusun klik.
            return '{"reply":"belum tersedia dalam konteks data","steps":[{"say":"","goto":"kpi","action":"click"}]}';
        }
        if (/export python/i.test(teks)) {
            return '{"reply":"Tombol export Python ditekan.","steps":[{"say":"","goto":"btn-export","action":"click"}]}';
        }
        // Pertanyaan harga/margin: model tetap menyusun klik (harus diturunkan jadi sorotan).
        return '{"reply":"Poin utama: margin turun 2,1 poin.\\n• Revenue 1.240.000.000 dengan margin 18,4%.\\nTindakan: tekan harga jual rata-rata.","steps":[{"say":"","goto":"kpi","action":"click"}]}';
    });
    const base = request('');
    base.port = fake.port;

    console.log('\n[Pertanyaan tidak dieksekusi]');
    const tanya = await lib.buildSpiderPlan({ ...base, request: 'analisa kembali terkait penjualan produk' });
    ok(tanya.steps.length >= 1, 'pertanyaan tetap menyorot bukti', String(tanya.steps.length));
    ok(tanya.steps.every((s) => !s.action), 'tidak ada aksi klik untuk pertanyaan', JSON.stringify(tanya.steps));
    ok(/Poin utama/.test(tanya.reply), 'jawaban poin utama dipertahankan', tanya.reply.slice(0, 80));

    console.log('\n[Perintah tetap dieksekusi]');
    const aksi = await lib.buildSpiderPlan({ ...base, request: 'export python' });
    ok(aksi.steps.some((s) => s.action === 'click'), 'klik export dipertahankan', JSON.stringify(aksi.steps));
    ok(aksi.steps.some((s) => s.goto === 'btn-export'), 'target export benar');

    console.log('\n[Jawaban di luar konteks / penolakan]');
    const luar = await lib.buildSpiderPlan({ ...base, request: 'apa itu regresi linear?' });
    ok(luar.steps.every((s) => !s.action), 'pertanyaan luar konteks tanpa aksi');
    ok(!/belum tersedia dalam konteks data/i.test(luar.reply), 'tidak lagi menjawab “belum tersedia”', luar.reply);
    ok(/tidak aku karang/i.test(luar.reply), 'mengaku tidak mengarang', luar.reply.slice(0, 80));
    ok(/\d/.test(luar.reply), 'menyertakan angka nyata dari data', luar.reply.slice(0, 200));

    console.log('\n[Rencana tanpa langkah]');
    const tanpaLangkah = lib.parseSpiderPlan('{"reply":"Penjelasan singkat tanpa aksi.","steps":[]}', TARGETS, 8);
    ok(!!tanpaLangkah && tanpaLangkah.steps.length === 0, 'steps kosong diterima sebagai jawaban');
    const kuat = lib.hardenPlan('apa itu regresi linear?', tanpaLangkah, TARGETS, 8);
    ok(kuat.steps.length === 0, 'pertanyaan tidak ditambahi aksi oleh hardenPlan');
    const kuatAksi = lib.hardenPlan('export python', tanpaLangkah, TARGETS, 8);
    ok(kuatAksi.steps.some((s) => s.action === 'click'), 'perintah ekspor menambah aksi yang diminta');

    fake.srv.close();
    console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('Pemeriksaan gagal:', e);
    process.exit(1);
});
