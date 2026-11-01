/**
 * Pemeriksaan “komunitas ramai” (Community Chat) tanpa VS Code:
 *
 *   npm run check:community
 *
 *  1. Roster persona unik + sudut bahasan berbeda dari satu berkas analisis.
 *  2. Deteksi bahasa pertanyaan + pemilihan bahasa jawaban yang bervariasi.
 *  3. Integrasi dengan llama-server tiruan (SSE): diskusi otomatis & jawaban langsung.
 *  4. Render klien (jsdom): badge ⚡ lokal, tag bahasa, indikator menulis, mode lokal, toggle ⚡.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const vscode = require('./vscode-stub.cjs');

let pass = 0;
let fail = 0;
const ok = (cond, label, extra) => {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
};

async function loadLib() {
    const outDir = path.join(root, '.tmp-check');
    fs.mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `community-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { analyzeWorkbook } from './src/analysis';",
                "export { globalAnalysisStore } from './src/analysisStore';",
                "export { CommunityLive, PERSONAS, LIVE_LANGS, detectLang, anglesFor, langMeta, configuredLangs } from './src/communityLive';",
                "export { memberAt, memberLimit, memberWithFocus, memberByName, DISCUSSION_PERSONA, discussionIntent, naturalDiscussion, textSimilarity, stripPersonaPrefix } from './src/communityLive';",
                "export { classifyTurn, mainPoints, keyPoint, personaVoice, numbersIn, sameNumbers, uniqueNumbers, phraseSimilarity, isSmallTalk, hasSubstance, stripSmallTalk } from './src/communityLive';",
                "export { buildAgenda, AgendaPlan, allowedNumbers, foreignNumbers, agendaContext, dimensionLabel } from './src/communityAgenda';",
                "export { firebaseDisplayEnabled, countCommunityMessages, deleteAllCommunityMessages, discussionCollectionId, listDiscussionMessages, sendDiscussionMessage, countDiscussionMessages, deleteAllDiscussionMessages, discussionSummary } from './src/communityFirebase';",
                "export { setChatLogFallback, chatLogFile, flushChatLog, appendChatLog, appendChatLogNote, archiveChatLog, clearChatLog, readChatLogEntries } from './src/chatLog';",
                "export { maxChatMessages, communityMessageCount, discussionMessageCount, shouldClearChat, shouldRotateDiscussion } from './src/chatLimits';",
                "export { CommunityLiveViewProvider } from './src/communityLiveView';",
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
    try { fs.rmdirSync(outDir); } catch (e) { /* dipakai proses lain */ }
    return lib;
}

function sampleWorkbook(lib) {
    const head = ['Date', 'Item', 'Category', 'Region', 'Customer', 'Order', 'Qty', 'Price', 'Cost', 'Revenue'];
    const items = ['Kopi Arabika', 'Teh Hijau', 'Gula Aren', 'Susu UHT', 'Cokelat Bubuk'];
    const cats = ['Minuman', 'Bahan', 'Kemasan'];
    const rows = [head.join(',')];
    for (let i = 0; i < 80; i += 1) {
        const qty = 5 + ((i * 7) % 40);
        const price = 12000 + ((i * 311) % 9000);
        rows.push([
            `2024-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
            items[i % items.length], cats[i % cats.length], ['Jakarta', 'Bandung', 'Surabaya'][i % 3],
            `Cust-${1 + (i % 17)}`, `INV-${1000 + i}`, qty, price, Math.round(qty * price * 0.62), qty * price,
        ].join(','));
    }
    const csv = rows.join('\n');
    return { wb: lib.analyzeWorkbook(Buffer.from(csv, 'utf8'), 'sales.csv', {}), csv };
}

/** llama-server tiruan: membalas SSE sesuai bahasa yang diminta prompt. */
function fakeLlama(replyForPrompt, opts = {}) {
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
                const send = () => {
                    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
                    const chunks = String(text).match(/[\s\S]{1,10}/g) || [''];
                    for (const c of chunks) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`); }
                    res.write('data: [DONE]\n\n');
                    res.end();
                };
                if (opts.delayMs) { setTimeout(send, opts.delayMs); } else { send(); }
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, seen }));
    });
}

/** Firestore tiruan: cukup untuk runQuery, runAggregationQuery, list, create, dan delete. */
function fakeFirestore(initial) {
    return new Promise((resolve) => {
        const state = { docs: initial.slice() };
        const srv = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://127.0.0.1');
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                const json = (code, payload) => {
                    res.writeHead(code, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(payload));
                };
                if (url.pathname.endsWith(':runAggregationQuery')) {
                    let collection = '';
                    try { collection = JSON.parse(body).structuredAggregationQuery.structuredQuery.from[0].collectionId; } catch (e) { /* abaikan */ }
                    const total = state.docs.filter((d) => d.collection === collection).length;
                    json(200, [{ result: { aggregateFields: { total: { integerValue: String(total) } } } }]);
                    return;
                }
                if (url.pathname.endsWith(':runQuery')) {
                    let collection = '';
                    try { collection = JSON.parse(body).structuredQuery.from[0].collectionId; } catch (e) { /* abaikan */ }
                    json(200, state.docs.filter((d) => d.collection === collection).map((d) => ({ document: d.document })));
                    return;
                }
                const idMatch = url.pathname.match(/\/documents\/([^/]+)\/([^/]+)$/);
                const colMatch = url.pathname.match(/\/documents\/([^/:]+)$/);
                if (req.method === 'GET' && colMatch) {
                    const collection = decodeURIComponent(colMatch[1]);
                    json(200, { documents: state.docs.filter((d) => d.collection === collection).map((d) => d.document) });
                    return;
                }
                if (req.method === 'DELETE' && idMatch) {
                    const collection = decodeURIComponent(idMatch[1]);
                    const id = decodeURIComponent(idMatch[2]);
                    state.docs = state.docs.filter((d) => !(d.collection === collection && d.id === id));
                    json(200, {});
                    return;
                }
                if (req.method === 'POST' && colMatch) {
                    const collection = decodeURIComponent(colMatch[1]);
                    const id = `new-${state.docs.length + 1}`;
                    const fields = JSON.parse(body).fields || {};
                    state.docs.push({ id, collection, document: { name: `projects/p/databases/(default)/documents/${collection}/${id}`, fields } });
                    json(200, { name: `projects/p/databases/(default)/documents/${collection}/${id}` });
                    return;
                }
                json(404, { error: { message: 'not found' } });
            });
        });
        srv.listen(0, '127.0.0.1', () => resolve({ srv, state, port: srv.address().port }));
    });
}

/** Satu dokumen Firestore tiruan untuk ruang komunitas. */
function firebaseDoc(i, channel = 'umum') {
    const id = `doc-${channel}-${i}`;
    return {
        id,
        collection: `community_${channel}`,
        document: {
            name: `projects/p/databases/(default)/documents/community_${channel}/${id}`,
            fields: {
                username: { stringValue: `Anggota ${i}` },
                description: { stringValue: 'uji' },
                message: { stringValue: `stok kritis ${i} SKU di gudang ${channel}.` },
                timestamp: { integerValue: String(Date.now() - (1000 - i) * 1000) },
                lang: { stringValue: 'id' },
                langTag: { stringValue: 'ID' },
                kind: { stringValue: 'chat' },
                channel: { stringValue: channel },
            },
        },
    };
}

/** Satu dokumen Firestore tiruan untuk ruang Diskusi AI (`diskusi_ai`). */
function discussionDoc(i) {
    const id = `ai-${i}`;
    return {
        id,
        collection: 'diskusi_ai',
        document: {
            name: `projects/p/databases/(default)/documents/diskusi_ai/${id}`,
            fields: {
                username: { stringValue: 'Spider AI' },
                description: { stringValue: 'Diskusi data · poin utama, angka, tindakan' },
                message: { stringValue: `jawaban diskusi ${i}: stok kritis 12 SKU.` },
                timestamp: { integerValue: String(Date.now() - (1000 - i) * 1000) },
                lang: { stringValue: 'id' },
                langTag: { stringValue: 'ID' },
                kind: { stringValue: 'answer' },
                channel: { stringValue: '' },
                room: { stringValue: 'diskusi' },
            },
        },
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const lib = await loadLib();
    const { wb } = sampleWorkbook(lib);
    lib.globalAnalysisStore.set('file:///sales.csv', wb, 'sales.csv');

    console.log('\n[Persona & sudut bahasan]');
    ok(lib.PERSONAS.length >= 8, 'jumlah persona', String(lib.PERSONAS.length));
    ok(new Set(lib.PERSONAS.map((p) => p.name)).size === lib.PERSONAS.length, 'nama persona unik');
    ok(new Set(lib.PERSONAS.map((p) => p.bio)).size === lib.PERSONAS.length, 'deskripsi persona unik');
    ok(lib.PERSONAS.map((p) => p.name).some((n) => /[\u4e00-\u9fff]/.test(n)), 'ada nama beraksara Mandarin');
    // Roster TANPA BATAS: 10 anggota inti + anggota baru dari nama/bidang/kota.
    vscode.config['community.members'] = 0;
    ok(lib.memberLimit() === 0, '0 = tanpa batas');
    const roster = [0, 9, 10, 11, 137, 500, 1500].map((i) => lib.memberAt(i));
    ok(roster[0].name === 'Rina Kusuma', 'anggota ke-0 = anggota inti');
    ok(new Set(roster.map((p) => p.name)).size === roster.length, 'nama anggota tanpa batas unik', roster.map((p) => p.name).join(' | '));
    ok(lib.memberAt(500).name !== lib.memberAt(501).name, 'anggota ke-500 dan 501 berbeda');
    ok(lib.memberAt(1500).focus && lib.memberAt(1500).bio.includes('·'), 'anggota jauh tetap punya bidang & bio', lib.memberAt(1500).name);
    ok(lib.memberWithFocus('stock', 0).focus === 'stock', 'anggota inti sesuai bidang');
    ok(lib.memberWithFocus('stock', 25).focus === 'stock', 'anggota roster sesuai bidang', lib.memberWithFocus('stock', 25).name);
    ok(!!lib.memberByName('Rina Kusuma'), 'cari anggota berdasarkan nama');
    const angles = lib.anglesFor(lib.globalAnalysisStore.last());
    ok(angles.length >= 6, 'sudut bahasan dari satu berkas', String(angles.length));
    ok(new Set(angles.map((a) => a.id)).size === angles.length, 'sudut bahasan tidak duplikat');
    ok(angles.every((a) => /\d/.test(a.facts)), 'setiap sudut memuat angka nyata');
    ok(new Set(angles.map((a) => a.focus)).size >= 3, 'bidang bahasan beragam');

    console.log('\n[Agenda: semua dimensi, tidak didominasi C4.5]');
    const baseEntry = lib.globalAnalysisStore.last();
    const richEntry = JSON.parse(JSON.stringify(baseEntry));
    const richSheet = richEntry.result.sheets[0];
    richSheet.decisionTreeAnalysis = {
        targetAttribute: 'Region',
        accuracy: 0.82,
        rules: ['IF Qty > 20 THEN Jakarta'],
        featureImportance: [{ feature: 'Qty', importance: 0.42 }],
        confusionMatrix: [[10, 2], [3, 8]],
        confusionLabels: ['Jakarta', 'Bandung'],
        testSize: 23,
        performanceMetrics: { macroF1: 0.78, kappa: 0.61 },
    };
    richSheet.stockAnalysis = {
        detected: true, itemCol: 'Item', qtyCol: 'Qty',
        kpis: { totalSKUs: 40, totalStockVolume: 800, totalValuation: 12000000, averageStockPerItem: 20, criticalCount: 3, lowCount: 4, healthyCount: 30, overstockCount: 3 },
        items: [{ name: 'Kopi Arabika', category: 'Minuman', quantity: 120, unitPrice: 10000, totalValue: 1200000, status: 'overstock', statusLabel: 'Overstock', reorderRecommendation: 0, estimatedCost: 0, priority: 'Normal', abcClass: 'A' }],
        topStock: [{ label: 'Kopi Arabika', value: 120 }],
        bottomStock: [],
        categoryValuation: [{ label: 'Minuman', value: 1200000, count: 5 }],
        statusDistribution: [],
        abcSummary: { classA: { count: 10, pctCount: 25, valPct: 70 }, classB: { count: 12, pctCount: 30, valPct: 20 }, classC: { count: 18, pctCount: 45, valPct: 10 } },
    };
    richSheet.needsAnalysis = {
        totalProcurementBudget: 5000000, urgentItemCount: 2, highPriorityCount: 3,
        procurementItems: [{ name: 'Kopi Arabika', category: 'Minuman', currentStock: 2, recommendedQty: 20, estimatedCost: 200000, priority: 'Urgent' }],
        operationalInsights: [], riskWarnings: ['Lead time pemasok 14 hari'],
        actionPlan: [{ title: 'PO cepat', description: 'Kirim PO minggu ini', type: 'critical' }],
    };
    const agenda = lib.buildAgenda(richEntry);
    ok(agenda.length >= 12, 'butir agenda lengkap', String(agenda.length));
    ok(agenda.every((item) => /\d/.test(item.facts)), 'setiap butir agenda membawa angka');
    const agendaDims = new Set(agenda.map((item) => item.dimension));
    ok(['kpi', 'quality', 'stats', 'viz'].every((d) => agendaDims.has(d)), 'KPI, kualitas, statistik, tren ikut', [...agendaDims].join(','));
    ok(agendaDims.has('tree') && agendaDims.has('stock') && agendaDims.has('needs'), 'stok, kebutuhan, C4.5 ikut', [...agendaDims].join(','));
    ok(agenda.filter((item) => item.dimension === 'tree').length <= 5, 'porsi butir C4.5 tidak mendominasi', String(agenda.filter((item) => item.dimension === 'tree').length));
    const plan = new lib.AgendaPlan();
    plan.setItems(agenda);
    const picks = [];
    for (let i = 0; i < 8; i += 1) { picks.push(plan.next()); }
    ok(picks.every(Boolean), 'agenda menghasilkan butir');
    ok(new Set(picks.map((p) => p.key)).size === picks.length, 'butir tidak diulang dalam satu putaran');
    ok(new Set(picks.slice(0, 7).map((p) => p.dimension)).size >= 6, 'tujuh pesan pertama membahas >= 6 dimensi', picks.map((p) => p.dimension).join(','));
    ok(picks.filter((p) => p.dimension === 'tree').length <= 1, 'C4.5 paling banyak sekali per putaran', picks.map((p) => p.dimension).join(','));
    const allowed = lib.allowedNumbers(richEntry);
    ok(allowed.size > 5, 'daftar angka data tersedia', String(allowed.size));
    ok(lib.foreignNumbers(`skor kualitas ${Math.round(richSheet.csvHealth.qualityScore)}/100`, allowed).length === 0, 'angka dari data diterima');
    ok(lib.foreignNumbers('margin naik 87,5% dan 987654 unit', allowed).includes('987654'), 'angka karangan ditolak', lib.foreignNumbers('margin naik 87,5% dan 987654 unit', allowed).join(','));
    ok(/\[KPI penjualan\]/.test(lib.agendaContext(richEntry)), 'konteks memuat bagian KPI');
    ok(/\[model C4\.5\]/.test(lib.agendaContext(richEntry)), 'konteks memuat bagian C4.5');
    ok(/\[kualitas data\]/.test(lib.agendaContext(richEntry)), 'konteks memuat bagian kualitas');
    ok(/\[stok & kebutuhan\]/.test(lib.agendaContext(richEntry)), 'konteks memuat bagian stok');
    ok(lib.firebaseDisplayEnabled() === true, 'ruang komunitas membaca Firebase secara bawaan');

    console.log('\n[Bahasa]');
    ok(lib.detectLang('Berapa stok kritis sekarang?') === 'id', 'deteksi Bahasa Indonesia');
    ok(lib.detectLang('What is the accuracy of the C4.5 model?') === 'en', 'deteksi English');
    ok(lib.detectLang('这个数据集的质量如何？') === 'zh', 'deteksi 中文');
    ok(lib.detectLang('データの品質はどうですか') === 'ja', 'deteksi 日本語');
    ok(lib.detectLang('¿Cuál es el margen?') === 'es', 'deteksi Español');
    ok(lib.detectLang('123 456') === null, 'teks ambigu → null');
    vscode.config['community.languages'] = ['id', 'en', 'zh', 'ja', 'es'];
    ok(lib.configuredLangs().length === 5, 'daftar bahasa dari pengaturan', lib.configuredLangs().join(','));

    console.log('\n[Diskusi AI: jenis pertanyaan & gaya manusia]');
    ok(lib.discussionIntent('Kenapa margin turun bulan ini?') === 'cause', 'pertanyaan kenapa → cause');
    ok(lib.discussionIntent('Bagaimana cara mengecek stok kritis?') === 'how', 'pertanyaan cara → how');
    ok(lib.discussionIntent('Berapa total revenue?') === 'data', 'pertanyaan angka → data');
    ok(lib.discussionIntent('Apa itu C4.5?') === 'define', 'pertanyaan definisi → define');
    ok(lib.discussionIntent('Bandingkan Alex dan Cairo') === 'compare', 'pertanyaan banding → compare');
    ok(lib.discussionIntent('Saran restock minggu ini?') === 'recommend', 'pertanyaan saran → recommend');
    ok(lib.discussionIntent('Kenapa hasilnya begini?') === 'cause', 'pertanyaan campuran tetap cause', lib.discussionIntent('Kenapa hasilnya begini?'));
    ok(lib.discussionIntent('Why is the accuracy low?') === 'cause', 'pertanyaan Inggris why → cause');
    ok(lib.discussionIntent('为什么会这样？') === 'cause', 'pertanyaan Mandarin 为什么 → cause');
    const natural = lib.naturalDiscussion('Poin utama: margin turun 2,1 poin.\n• Biaya naik 8%.\nStatus: tuntas.');
    ok(!/^Poin utama/i.test(natural), 'label “Poin utama” dibuang');
    ok(!/^Status\s*[:：]/im.test(natural), 'label “Status” dibuang');
    ok(/margin turun 2,1 poin/.test(natural) && /Biaya naik 8%/.test(natural), 'isi jawaban tetap utuh');
    ok(lib.textSimilarity('margin turun dua poin', 'margin turun dua poin') > 0.9, 'teks sama → mirip');
    ok(lib.textSimilarity('stok kritis di gudang', 'margin turun karena biaya') < 0.2, 'teks berbeda → tidak mirip');
    ok(lib.stripPersonaPrefix('Spider AI: Halo, ini jawabannya.') === 'Halo, ini jawabannya.', 'awalan nama dibuang');

    console.log('\n[Klasifikasi pesan & poin utama]');
    ok(lib.classifyTurn('terima kasih').kind === 'courtesy', 'terima kasih = kesopanan');
    ok(lib.classifyTurn('makasih ya, oke siap').kind === 'courtesy', 'makasih/oke = kesopanan');
    const mixed = lib.classifyTurn('Terima kasih, tapi kenapa margin turun?');
    ok(mixed.kind === 'question', 'kesopanan + pertanyaan tetap pertanyaan', mixed.kind);
    ok(!/terima kasih/i.test(mixed.body) && /kenapa margin turun/i.test(mixed.body), 'kesopanan dibuang dari isi', mixed.body);
    ok(lib.classifyTurn('Stok kritis naik jadi 12 SKU').kind === 'statement', 'pernyataan dikenali');
    const points = lib.mainPoints(lib.globalAnalysisStore.last());
    ok(points.length >= 1, 'poin utama tersedia', String(points.length));
    ok(points.every((p) => /\d/.test(p.fact)), 'setiap poin membawa angka');
    ok(points.every((p) => !!p.action), 'setiap poin punya langkah');
    ok(points.every((p, i) => i === 0 || points[i - 1].weight >= p.weight), 'poin diurutkan dari yang mendesak');
    ok(points.some((p) => p.id === 'size'), 'ada poin dasar ukuran data');
    ok(lib.keyPoint(lib.globalAnalysisStore.last()).id === points[0].id, 'keyPoint = poin teratas');
    ok(new Set(points.map((p) => p.topic)).size === points.length, 'topik poin tidak duplikat');
    ok(lib.personaVoice('stock') !== lib.personaVoice('tree'), 'gaya bicara persona berbeda');

    console.log('\n[Anti-duplikat & angka]');
    ok(lib.numbersIn('0,0% kosong, 12 SKU').join(',') === '0,12', 'angka dinormalisasi', lib.numbersIn('0,0% kosong, 12 SKU').join(','));
    ok(lib.sameNumbers('stok 12 SKU, 3 kritis', 'stok 12 SKU dan 3 kritis'), 'angka sama terdeteksi');
    ok(!lib.sameNumbers('stok 12 SKU, 3 kritis', 'stok 7 SKU, 1 kritis'), 'angka berbeda tidak dianggap sama');
    ok(lib.phraseSimilarity('stok kritis di gudang utama', 'stok kritis di gudang utama') === 1, 'frasa sama = 1');
    ok(lib.phraseSimilarity('stok kritis di gudang', 'margin turun karena biaya') < 0.2, 'frasa berbeda = rendah');
    ok(lib.uniqueNumbers(['12 SKU kritis', '12 SKU, 3 gudang']).join(',') === '12,3', 'angka unik tanpa duplikat');
    ok(lib.isSmallTalk('Terima kasih, semoga membantu!'), 'balasan sopan dikenali sebagai basa-basi');
    ok(!lib.hasSubstance('Terima kasih banyak'), 'basa-basi tidak punya isi');
    ok(lib.hasSubstance('Stok kritis 12 SKU'), 'pesan berangka punya isi');

    console.log('\n[Integrasi llama-server tiruan]');
    const replies = [];
    const fake = await fakeLlama((payload) => {
        const prompt = String((payload.messages || []).map((m) => m.content).join('\n'));
        // Pengguna hanya menulis kesopanan → model tiruan membalas sopan (harus ditolak mesin).
        if (/PESAN PENGGUNA: terima kasih/i.test(prompt)) {
            replies.push('courtesy');
            return 'Terima kasih, senang bisa membantu! Ada lagi yang bisa saya bantu?';
        }
        // Pertanyaan tertentu dijawab berbeda supaya urutan antrean bisa diperiksa.
        if (/Berapa total revenue\?/.test(prompt)) { replies.push('rev'); return 'Pendapatan 1.234.000 dengan 80 order.'; }
        if (/Berapa jumlah order\?/.test(prompt)) { replies.push('ord'); return 'Order tercatat 81 dan pelanggan 17.'; }
        // Balas sesuai bahasa yang diminta prompt, supaya variasi bahasa bisa diperiksa.
        if (/Bahasa pesan: 简体中文|dalam 简体中文/.test(prompt)) { replies.push('zh'); return '库存质量看起来不错：缺失 0.0%，重复 0 行。'; }
        if (/Bahasa pesan: 日本語|dalam 日本語/.test(prompt)) { replies.push('ja'); return 'データ品質は良好です。欠損は0.0%です。'; }
        if (/Bahasa pesan: English|dalam English/.test(prompt)) { replies.push('en'); return 'Quality looks solid: 0.0% missing and no duplicates.'; }
        if (/Bahasa pesan: Español|dalam Español/.test(prompt)) { replies.push('es'); return 'La calidad es buena: 0.0% de valores vacíos.'; }
        replies.push('id');
        return 'Kualitas datanya bagus: sel kosong 0,0% dan tidak ada duplikat.';
    });
    vscode.config['llama.port'] = fake.port;
    vscode.config['community.live'] = true;
    vscode.config['community.liveSeconds'] = 5;

    // Catatan obrolan (data/data.txt) ditulis ke folder sementara agar repo tetap bersih.
    const logRoot = path.join(root, '.tmp-check', 'log');
    fs.rmSync(logRoot, { recursive: true, force: true });
    lib.setChatLogFallback(logRoot);

    const posted = [];
    /** Pesan yang disiarkan mesin ke "database" (ditangkap, tidak dikirim ke jaringan). */
    const published = [];
    const live = new lib.CommunityLive({
        store: lib.globalAnalysisStore,
        isRunning: () => true,
        port: () => fake.port,
        post: (m) => posted.push(m),
        log: () => {},
        remote: { enabled: () => true, publish: (draft) => published.push(draft) },
    });
    live.setVisible(true);
    live.start();
    await sleep(1600);
    const chats = posted.filter((m) => m.type === 'communityLive').map((m) => m.message);
    ok(chats.length >= 1, 'pesan diskusi otomatis dibuat', String(chats.length));
    ok(posted.some((m) => m.type === 'communityLiveTyping' && m.room !== 'diskusi'), 'pesan otomatis didahului indikator menulis');
    ok(chats[0] && chats[0].local === true, 'pesan bertanda lokal');
    ok(chats[0] && !!chats[0].langTag, 'pesan punya tag bahasa', chats[0] && chats[0].langTag);
    ok(chats[0] && lib.PERSONAS.some((p) => p.name === chats[0].name), 'pengirim adalah persona resmi', chats[0] && chats[0].name);
    ok(posted.some((m) => m.type === 'communityLiveStatus' && m.status.running === true), 'status ramai dikirim ke view');

    await sleep(5600);
    const chats2 = posted.filter((m) => m.type === 'communityLive').map((m) => m.message);
    ok(chats2.length >= 2, 'diskusi berlanjut otomatis', String(chats2.length));
    ok(new Set(chats2.map((m) => m.langTag)).size >= 2 || new Set(chats2.map((m) => m.name)).size >= 2, 'variasi bahasa atau persona', chats2.map((m) => `${m.name}/${m.langTag}`).join(' | '));
    const chatterPrompt = String((fake.seen.find((p) => p.max_tokens === 180)?.messages || []).map((m) => m.content).join('\n'));
    ok(/dimensi:/i.test(chatterPrompt), 'prompt chatter menyebut dimensi agenda');
    ok(/Sudah muncul di putaran ini/.test(chatterPrompt), 'prompt chatter memuat cakupan putaran');
    ok(/jangan menjadikan C4\.5 bahan semua pesan/i.test(chatterPrompt), 'prompt chatter melarang dominasi C4.5');

    // Jawaban langsung untuk pesan pengguna.
    posted.length = 0;
    await live.ask('Berapa stok kritis dan bagaimana kualitas datanya?');
    const typing = posted.find((m) => m.type === 'communityLiveTyping' && m.room !== 'diskusi');
    ok(!!typing, 'indikator menulis dikirim lebih dulu');
    const answer = posted.filter((m) => m.type === 'communityLive').map((m) => m.message).pop();
    ok(!!answer && answer.kind === 'answer', 'jawaban dikirim');
    ok(!!answer && /\d/.test(answer.text), 'jawaban memuat angka', answer && answer.text);
    ok(!!answer && answer.text.length <= 700, 'jawaban ringkas', answer && String(answer.text.length));
    const lastPrompt = String((fake.seen[fake.seen.length - 1].messages || []).map((m) => m.content).join('\n'));
    ok(/langsung ke inti|maksimal 4 baris/i.test(lastPrompt), 'prompt meminta jawaban ke poin');
    ok(/skor kualitas|baris x/i.test(lastPrompt), 'prompt memuat fakta analisis (grounding)');
    ok(/\[KPI penjualan\]/.test(lastPrompt), 'prompt jawaban memuat dimensi KPI');
    ok(/\[kualitas data\]/.test(lastPrompt), 'prompt jawaban memuat dimensi kualitas');
    ok(/\[statistik\]/.test(lastPrompt), 'prompt jawaban memuat dimensi statistik');
    ok(/Bahasa jawaban: Bahasa Indonesia/.test(lastPrompt), 'bahasa jawaban mengikuti pertanyaan Indonesia');

    // Pertanyaan berbahasa Mandarin → dijawab Mandarin.
    await live.ask('这个数据集的质量如何？');
    const zhAnswer = posted.filter((m) => m.type === 'communityLive').map((m) => m.message).pop();
    ok(!!zhAnswer && zhAnswer.langTag === '中文', 'pertanyaan Mandarin dijawab Mandarin', zhAnswer && zhAnswer.langTag);

    // Pesan hanya kesopanan → bukan balasan “terima kasih”, tetapi poin utama data.
    posted.length = 0;
    await live.ask('terima kasih');
    const pointPrompt = String((fake.seen[fake.seen.length - 1].messages || []).map((m) => m.content).join('\n'));
    const pointMsg = posted.filter((m) => m.type === 'communityLive').map((m) => m.message).pop();
    ok(/JANGAN membalas kesopanan/i.test(pointPrompt), 'prompt melarang membalas kesopanan');
    ok(!!pointMsg && pointMsg.kind === 'answer', 'pesan kesopanan tetap dibalas');
    ok(!!pointMsg && !/terima kasih|sama-sama|semoga membantu|ada lagi yang bisa/i.test(pointMsg.text), 'bukan balasan terima kasih', pointMsg && pointMsg.text);
    ok(!!pointMsg && /\d/.test(pointMsg.text), 'balasan berisi angka poin utama', pointMsg && pointMsg.text);
    ok(!!pointMsg && pointMsg.text !== 'Terima kasih, senang bisa membantu! Ada lagi yang bisa saya bantu?', 'salinan model sopan tidak dipakai');

    // Streaming: teks muncul bertahap sebelum pesan akhir.
    posted.length = 0;
    await live.ask('Berapa revenue dan margin sekarang?');
    const streams = posted.filter((m) => m.type === 'communityLiveStream');
    const finalMsg = posted.filter((m) => m.type === 'communityLive').map((m) => m.message).pop();
    ok(streams.length >= 1, 'teks jawaban dikirim bertahap', String(streams.length));
    ok(streams.every((m) => typeof m.text === 'string' && m.text.length > 0), 'potongan teks tidak kosong');
    ok(!!finalMsg && /^draft-komunitas-/.test(String(finalMsg.draftId || '')), 'pesan akhir membawa id draft', finalMsg && finalMsg.draftId);
    const streamAt = posted.findIndex((m) => m.type === 'communityLiveStream');
    const finalAt = posted.findIndex((m) => m.type === 'communityLive' && m.message && m.message.draftId === finalMsg.draftId);
    ok(streamAt >= 0 && finalAt > streamAt, 'draft muncul sebelum pesan akhir');
    ok(!streams.some((m) => /terima kasih/i.test(String(m.text))), 'basa-basi tidak pernah di-stream');

    // Dua pertanyaan berturut-turut: antre, dijawab berurutan, tidak kembar.
    posted.length = 0;
    const q1 = live.ask('Berapa total revenue?');
    const q2 = live.ask('Berapa jumlah order?');
    const pendings = posted.filter((m) => m.type === 'communityLiveQueue').map((m) => m.pending);
    ok(pendings.includes(2), 'dua pertanyaan masuk antrean', pendings.join(','));
    await Promise.all([q1, q2]);
    const queuedAnswers = posted.filter((m) => m.type === 'communityLive').map((m) => m.message).filter((m) => m.kind === 'answer');
    ok(queuedAnswers.length === 2, 'dua jawaban dikirim', String(queuedAnswers.length));
    ok(queuedAnswers.length === 2 && queuedAnswers[0].text !== queuedAnswers[1].text, 'jawaban tidak disalin', queuedAnswers.map((m) => m.text).join(' || '));
    const lastPending = posted.filter((m) => m.type === 'communityLiveQueue').map((m) => m.pending).pop();
    ok(lastPending === 0, 'antrean selesai');

    console.log('\n[Diskusi AI: ruang terpisah]');
    posted.length = 0;
    await live.askDiscussion('Kenapa margin turun bulan terakhir?');
    const aiTyping = posted.find((m) => m.type === 'communityLiveTyping' && m.room === 'diskusi');
    ok(!!aiTyping && aiTyping.room === 'diskusi', 'indikator menulis di ruang diskusi');
    const aiMsg = posted.filter((m) => m.type === 'communityLive').map((m) => m.message).pop();
    ok(!!aiMsg && aiMsg.room === 'diskusi', 'jawaban masuk ruang diskusi', aiMsg && aiMsg.room);
    ok(!!aiMsg && aiMsg.name === lib.DISCUSSION_PERSONA.name, 'pengirim Diskusi AI', aiMsg && aiMsg.name);
    const diskPrompt = String((fake.seen[fake.seen.length - 1].messages || []).map((m) => m.content).join('\n'));
    ok(/Jelaskan penyebab paling mungkin/i.test(diskPrompt), 'prompt diskusi menyesuaikan pertanyaan “kenapa”');
    ok(/JANGAN diulang|jangan mengulang/i.test(diskPrompt), 'prompt diskusi melarang pengulangan');
    ok(/KONTEKS SEBELUMNYA/.test(diskPrompt), 'konteks sebelumnya dikirim sebagai rujukan saja');
    ok(/JANGAN diringkas/i.test(diskPrompt), 'konteks sebelumnya tidak untuk diringkas');
    ok(/jangan memakai heading tetap/i.test(diskPrompt), 'prompt diskusi melarang heading template');
    ok(/DATA:\n/.test(diskPrompt) && /skor kualitas|baris x/i.test(diskPrompt), 'prompt diskusi memuat angka analisis');
    ok(!/^Poin utama/m.test(aiMsg.text), 'jawaban tidak selalu diawali “Poin utama”', aiMsg.text.slice(0, 40));
    ok(live.recent('diskusi').length === 1, 'recent(diskusi) memfilter ruang', String(live.recent('diskusi').length));
    const diskusiPublish = published.filter((d) => d.room === 'diskusi');
    ok(diskusiPublish.length >= 1, 'jawaban Diskusi AI disiarkan ke Firebase', String(diskusiPublish.length));
    ok(diskusiPublish.every((d) => !d.channel), 'siaran Diskusi AI tanpa kanal komunitas');
    ok(diskusiPublish.some((d) => d.name === lib.DISCUSSION_PERSONA.name && d.kind === 'answer'), 'pengirim siaran adalah persona Diskusi AI');
    ok(published.some((d) => d.room !== 'diskusi' && !!d.channel), 'siaran komunitas tetap memakai kanal');

    // Pertanyaan berbeda → bentuk jawaban berbeda, bukan mengulang jawaban pertama.
    posted.length = 0;
    await live.askDiscussion('Bagaimana cara mengecek stok kritis?');
    const howMsg = posted.filter((m) => m.type === 'communityLive' && m.message.room === 'diskusi').map((m) => m.message).pop();
    const howPrompt = String((fake.seen[fake.seen.length - 1].messages || []).map((m) => m.content).join('\n'));
    ok(/langkah praktis/i.test(howPrompt), 'pertanyaan “bagaimana” meminta langkah praktis');
    ok(!!howMsg && /langkah|1\)/i.test(howMsg.text), 'jawaban pertanyaan cara berbentuk langkah', howMsg && howMsg.text.slice(0, 60));
    ok(!!howMsg && howMsg.text !== aiMsg.text, 'jawaban pertanyaan berbeda tidak disalin');

    console.log('\n[Catatan data/data.txt]');
    await lib.flushChatLog();
    const logText = fs.readFileSync(lib.chatLogFile(), 'utf8');
    ok(/\[KOMUNITAS #umum\]/.test(logText), 'pesan komunitas tercatat');
    ok(/\[DISKUSI AI\] Kamu: Kenapa margin turun/.test(logText), 'pertanyaan diskusi tercatat');
    ok(/\[DISKUSI AI\] Spider AI:/.test(logText), 'jawaban diskusi tercatat');
    ok(/# Date Skunder/.test(logText), 'berkas catatan punya kepala format');
    ok(lib.chatLogFile().endsWith(path.join('data', 'data.txt')), 'lokasi catatan = data/data.txt', lib.chatLogFile());

    console.log('\n[Rotasi otomatis 100 pesan]');
    vscode.config['community.maxMessages'] = 100;
    ok(lib.maxChatMessages() === 100, 'batas dari pengaturan', String(lib.maxChatMessages()));
    ok(lib.communityMessageCount([{ room: 'komunitas' }, { room: 'diskusi' }, { room: 'komunitas' }]) === 2, 'hanya pesan komunitas dihitung');
    const hundred = Array.from({ length: 100 }, () => ({ room: 'komunitas' }));
    ok(lib.shouldClearChat(hundred) === true, '100 pesan → rotasi');
    ok(lib.shouldClearChat(hundred.slice(0, 99)) === false, '99 pesan → belum rotasi');
    vscode.config['community.maxMessages'] = 0;
    ok(lib.shouldClearChat(hundred) === false, '0 = rotasi dimatikan');
    vscode.config['community.maxMessages'] = 100;

    const archived = await lib.archiveChatLog();
    ok(!!archived && fs.existsSync(archived), 'arsip dibuat sebelum menghapus', archived);
    const archivedText = archived ? fs.readFileSync(archived, 'utf8') : '';
    await lib.clearChatLog('uji rotasi otomatis');
    ok((await lib.readChatLogEntries()).length === 0, 'catatan kosong setelah rotasi');
    ok(archivedText.length > 0 && fs.readFileSync(archived, 'utf8') === archivedText, 'arsip tetap utuh');
    ok(/# Date Skunder/.test(fs.readFileSync(lib.chatLogFile(), 'utf8')), 'header baru ditulis setelah rotasi');
    delete vscode.config['community.maxMessages'];

    live.dispose();
    fake.srv.close();
    ok(replies.length > 0, 'model tiruan menerima permintaan', replies.join(','));

    console.log('\n[Rotasi otomatis dari view]');
    for (let i = 0; i < 100; i += 1) {
        lib.appendChatLog('komunitas', `Anggota ${i}`, `stok kritis ${i} SKU di gudang.`, 'lokal · ID', 'KOMUNITAS #umum');
    }
    await lib.flushChatLog();
    ok((await lib.readChatLogEntries()).length === 100, '100 pesan komunitas siap dirotasi');
    process.env.DATASKUNDER_COMMUNITY_FIREBASE = '0';
    vscode.config['community.maxMessages'] = 100;
    const provider = new lib.CommunityLiveViewProvider({
        extensionUri: vscode.Uri.file(root),
        workspaceState: { get: () => undefined, update: async () => undefined },
        globalState: { get: () => undefined, update: async () => undefined },
        secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined },
    });
    await provider.pushHistory();
    for (let i = 0; i < 60; i += 1) {
        if ((await lib.readChatLogEntries()).length === 0) { break; }
        await sleep(50);
    }
    ok((await lib.readChatLogEntries()).length === 0, 'view memicu rotasi saat 100 pesan');
    const archiveDir = path.join(path.dirname(lib.chatLogFile()), 'arsip');
    ok(fs.existsSync(archiveDir) && fs.readdirSync(archiveDir).length >= 1, 'arsip rotasi tersimpan di data/arsip');
    delete process.env.DATASKUNDER_COMMUNITY_FIREBASE;
    delete vscode.config['community.maxMessages'];

    console.log('\n[Firebase: sumber ruang komunitas + rotasi 100]');
    const fb = await fakeFirestore([0, 1, 2, 3, 4].map((i) => firebaseDoc(i)));
    process.env.DATASKUNDER_FIRESTORE_BASE = `http://127.0.0.1:${fb.port}/v1/projects/p/databases/(default)/documents`;
    vscode.config['community.firebase'] = true;
    vscode.config['community.firebaseDisplay'] = true;
    vscode.config['community.maxMessages'] = 100;
    const postedFb = [];
    const providerFb = new lib.CommunityLiveViewProvider({
        extensionUri: vscode.Uri.file(root),
        workspaceState: { get: () => undefined, update: async () => undefined },
        globalState: { get: () => undefined, update: async () => undefined },
        secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined },
    });
    providerFb.view = { webview: { postMessage: (m) => postedFb.push(m) } };
    await providerFb.refreshRemote();
    const fbCfg = await providerFb.configPayload({ asWebviewUri: (u) => u });
    ok(fbCfg.remoteMessages.length === 5, 'pesan Firebase dibaca langsung', String(fbCfg.remoteMessages.length));
    ok(!fbCfg.history.some((entry) => entry.room === 'komunitas'), 'riwayat komunitas tidak dari data/data.txt');
    ok(postedFb.some((m) => m.type === 'communityRemote' && m.replace === true && m.messages.length === 5), 'view menerima pesan Firebase');
    for (let i = 5; i < 100; i += 1) { fb.state.docs.push(firebaseDoc(i)); }
    postedFb.length = 0;
    await providerFb.refreshRemote();
    for (let i = 0; i < 40 && fb.state.docs.length; i += 1) { await sleep(25); }
    ok(fb.state.docs.length === 0, 'semua pesan Firebase terhapus saat 100', String(fb.state.docs.length));
    ok(postedFb.some((m) => m.type === 'chatCleared' && Number(m.count) >= 100), 'tampilan dikosongkan menjadi 0 percakapan', JSON.stringify(postedFb.filter((m) => m.type === 'chatCleared')));
    ok(postedFb.some((m) => m.type === 'chatClearResult' && Number(m.deleted) >= 100), 'jumlah pesan terhapus dilaporkan', JSON.stringify(postedFb.filter((m) => m.type === 'chatClearResult')));
    fb.srv.close();
    delete process.env.DATASKUNDER_FIRESTORE_BASE;
    delete vscode.config['community.firebase'];
    delete vscode.config['community.firebaseDisplay'];
    delete vscode.config['community.maxMessages'];

    console.log('\n[Diskusi AI: Firebase diskusi_ai + rotasi 100 → log tetap]');
    // Log lokal disiapkan lebih dulu: berkas ini harus TETAP ada setelah Firebase dikosongkan.
    fs.rmSync(logRoot, { recursive: true, force: true });
    lib.setChatLogFallback(logRoot);
    for (let i = 0; i < 3; i += 1) {
        lib.appendChatLog('diskusi', 'Spider AI', `jawaban lokal ${i}: margin 18,4%.`, 'jawaban · ID');
    }
    await lib.flushChatLog();
    ok(fs.readFileSync(lib.chatLogFile(), 'utf8').includes('jawaban lokal 2'), 'log diskusi lokal siap diuji');
    ok(lib.discussionCollectionId() === 'diskusi_ai', 'koleksi Diskusi AI = diskusi_ai', lib.discussionCollectionId());
    ok(lib.shouldRotateDiscussion(100) === true && lib.shouldRotateDiscussion(99) === false, 'rotasi Diskusi AI tepat di 100 pesan');
    ok(lib.discussionMessageCount([{ room: 'diskusi' }, { room: 'komunitas' }]) === 1, 'penghitung log diskusi terpisah');

    // Riwayat yang dulu hanya ada di data/data.txt diimpor SEKALI ke Firebase (tidak tampil 0 pesan).
    const fbImport = await fakeFirestore([]);
    const stateImport = new Map();
    process.env.DATASKUNDER_FIRESTORE_BASE = `http://127.0.0.1:${fbImport.port}/v1/projects/p/databases/(default)/documents`;
    vscode.config['community.firebase'] = true;
    vscode.config['community.firebaseDisplay'] = true;
    const providerImport = new lib.CommunityLiveViewProvider({
        extensionUri: vscode.Uri.file(root),
        workspaceState: { get: (k) => stateImport.get(k), update: async (k, v) => { stateImport.set(k, v); } },
        globalState: { get: () => undefined, update: async () => undefined },
        secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined },
    });
    providerImport.view = { webview: { postMessage: () => undefined } };
    await providerImport.refreshRemote();
    ok(fbImport.state.docs.filter((d) => d.collection === 'diskusi_ai').length === 3, 'log Diskusi AI lama diimpor ke Firebase', String(fbImport.state.docs.length));
    ok(providerImport.aiRemoteMessages.length === 3, 'pesan hasil impor langsung terbaca', String(providerImport.aiRemoteMessages.length));
    ok(providerImport.aiRemoteMessages.every((m) => m.room === 'diskusi'), 'hasil impor bertanda ruang diskusi');
    ok(stateImport.get('dateSkunder.community.diskusiImported') === true, 'penanda impor disimpan di workspaceState');
    // Setelah rotasi (koleksi kosong) pesan lama tidak diimpor ulang pada sesi yang sama.
    fbImport.state.docs = [];
    await providerImport.refreshRemote();
    ok(fbImport.state.docs.length === 0, 'tidak ada impor ulang setelah rotasi', String(fbImport.state.docs.length));
    fbImport.srv.close();
    delete process.env.DATASKUNDER_FIRESTORE_BASE;
    delete vscode.config['community.firebase'];
    delete vscode.config['community.firebaseDisplay'];

    const fbAi = await fakeFirestore([0, 1, 2, 3, 4].map((i) => discussionDoc(i)));
    process.env.DATASKUNDER_FIRESTORE_BASE = `http://127.0.0.1:${fbAi.port}/v1/projects/p/databases/(default)/documents`;
    vscode.config['community.firebase'] = true;
    vscode.config['community.firebaseDisplay'] = true;
    vscode.config['community.maxMessages'] = 100;
    const postedAi = [];
    const providerAi = new lib.CommunityLiveViewProvider({
        extensionUri: vscode.Uri.file(root),
        workspaceState: { get: () => undefined, update: async () => undefined },
        globalState: { get: () => undefined, update: async () => undefined },
        secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined },
    });
    providerAi.view = { webview: { postMessage: (m) => postedAi.push(m) } };
    await providerAi.refreshRemote();
    const aiCfg = await providerAi.configPayload({ asWebviewUri: (u) => u });
    ok(aiCfg.aiRemoteMessages.length === 5, 'seluruh pesan Diskusi AI terbaca dari Firebase', String(aiCfg.aiRemoteMessages.length));
    ok(aiCfg.aiRemoteMessages.every((m) => m.room === 'diskusi'), 'pesan ditandai ruang diskusi');
    ok(aiCfg.aiRemoteMessages[0].at <= aiCfg.aiRemoteMessages[4].at, 'urutan pesan diskusi berdasarkan waktu');
    ok(!aiCfg.history.some((entry) => entry.room === 'diskusi'), 'log lokal tidak diduplikasi saat Firebase terbaca');
    ok(aiCfg.diskusi && aiCfg.diskusi.collection === 'diskusi_ai' && aiCfg.diskusi.ok === true, 'status koleksi diskusi_ai dikirim ke view', JSON.stringify(aiCfg.diskusi));
    ok(postedAi.some((m) => m.type === 'aiRemote' && m.replace === true && m.messages.length === 5), 'view menerima pesan aiRemote');

    postedAi.length = 0;
    await providerAi.onMessage({ type: 'aiAsk', text: 'Kenapa margin turun bulan ini?', author: 'Rina' });
    for (let i = 0; i < 80; i += 1) {
        if (fbAi.state.docs.filter((d) => d.collection === 'diskusi_ai').length >= 6) { break; }
        await sleep(25);
    }
    const aiDocs = fbAi.state.docs.filter((d) => d.collection === 'diskusi_ai');
    ok(aiDocs.length === 6, 'pertanyaan tersimpan ke koleksi diskusi_ai', String(aiDocs.length));
    ok(aiDocs[aiDocs.length - 1].document.fields.room.stringValue === 'diskusi', 'dokumen pertanyaan bertanda room diskusi');
    ok(!fbAi.state.docs.some((d) => String(d.collection).startsWith('community_') && /Kenapa margin/.test(d.document.fields.message.stringValue)), 'pertanyaan tidak masuk koleksi komunitas');

    // 100 pesan di `diskusi_ai` → semua dihapus dari Firebase; data/data.txt tetap jadi log.
    for (let i = 6; i < 100; i += 1) { fbAi.state.docs.push(discussionDoc(i)); }
    postedAi.length = 0;
    await providerAi.refreshRemote();
    for (let i = 0; i < 160 && fbAi.state.docs.some((d) => d.collection === 'diskusi_ai'); i += 1) { await sleep(25); }
    ok(fbAi.state.docs.filter((d) => d.collection === 'diskusi_ai').length === 0, 'semua pesan diskusi dihapus dari Firebase saat 100', `${fbAi.state.docs.filter((d) => d.collection === 'diskusi_ai').length} tersisa`);
    const cleared = postedAi.find((m) => m.type === 'aiCleared');
    ok(!!cleared && Number(cleared.deleted) >= 100, 'jumlah pesan diskusi terhapus dilaporkan', JSON.stringify(cleared));
    ok(postedAi.some((m) => m.type === 'chatHistory' && Array.isArray(m.aiRemoteMessages) && m.aiRemoteMessages.length === 0), 'tampilan Diskusi AI dikosongkan (0 pesan)');
    const logAfter = fs.readFileSync(lib.chatLogFile(), 'utf8');
    ok(/jawaban lokal 2/.test(logAfter), 'data/data.txt tetap menyimpan log setelah rotasi');
    ok(/rotasi Diskusi AI/.test(logAfter), 'log mencatat rotasi Diskusi AI');
    ok(providerAi.aiStatus.count === 0 && providerAi.aiStatus.ok === true, 'status Diskusi AI kembali 0 pesan', JSON.stringify(providerAi.aiStatus));
    const archiveAi = path.join(path.dirname(lib.chatLogFile()), 'arsip');
    ok(fs.existsSync(archiveAi) && fs.readdirSync(archiveAi).length >= 1, 'arsip log dibuat sebelum menghapus');

    // Database tidak bisa dihubungi → log lokal menjadi cadangan (tidak kosong).
    fbAi.srv.close();
    await providerAi.refreshRemote();
    const aiFallback = await providerAi.configPayload({ asWebviewUri: (u) => u });
    ok(aiFallback.aiRemoteMessages.length === 0, 'database mati → tidak ada pesan remote diskusi');
    ok(aiFallback.history.some((entry) => entry.room === 'diskusi'), 'database mati → log diskusi tampil sebagai cadangan');
    ok(aiFallback.diskusi && aiFallback.diskusi.ok === false, 'status menandai database diskusi gagal');
    delete process.env.DATASKUNDER_FIRESTORE_BASE;
    delete vscode.config['community.firebase'];
    delete vscode.config['community.firebaseDisplay'];
    delete vscode.config['community.maxMessages'];

    console.log('\n[Render klien]');
    const communityJs = fs.readFileSync(path.join(root, 'media', 'community.js'), 'utf8');
    const dom = new JSDOM(`<!DOCTYPE html><html><body class="cw-body"><div class="cw-root">
        <div class="cw-head"><strong>Obrolan</strong><span id="cw-state" class="cw-state"></span></div>
        <div class="cw-tabs"><button id="cw-tab-community" class="cw-tab on"></button><button id="cw-tab-ai" class="cw-tab"></button></div>
        <div id="cw-pane-community" class="cw-pane">
            <div class="cw-bar"><select id="cw-channel"></select><button id="cw-live" class="cw-ib cw-live"></button><button id="cw-lang" class="cw-ib cw-langbtn">🌐 <span id="cw-lang-count">·</span></button><button id="cw-refresh" class="cw-ib"></button></div>
            <div id="cw-live-note" hidden></div>
            <section id="cw-lang-menu" hidden><div class="cw-lang-head"><strong>Bahasa</strong></div>
                <div id="cw-lang-list"></div>
                <button id="cw-lang-all"></button><button id="cw-lang-reset"></button>
                <select id="cw-reply-lang"></select><div id="cw-lang-note"></div></section>
            <details id="cw-me"><summary><span id="cw-me-sum"></span></summary>
                <img id="cw-avatar" /><input id="cw-name" /><input id="cw-bio" /><button id="cw-save"></button><div id="cw-save-note" hidden></div></details>
            <div id="cw-msgs" class="cw-msgs"></div>
            <div class="cw-extra-bar"><button id="cw-send-skin"></button><button id="cw-send-ai" style="display:none"></button></div>
            <div class="cw-countline"><span id="cw-count">0/900</span></div>
            <div class="cw-input"><textarea id="cw-text"></textarea><button id="cw-send"></button></div>
        </div>
        <div id="cw-pane-ai" class="cw-pane" hidden>
            <div id="cw-ai-src" class="cw-muted"></div>
            <div id="cw-ai-msgs" class="cw-msgs cw-ai-msgs"></div>
            <div class="cw-countline"><span id="cw-ai-count">0/4000</span></div>
            <div class="cw-input"><textarea id="cw-ai-text"></textarea><button id="cw-ai-send"></button></div>
        </div>
        <div class="cw-logline"><span>Catatan</span><button id="cw-open-log"></button><button id="cw-json"></button><button id="cw-json-fb"></button><button id="cw-api"></button><button id="cw-api-term"></button></div>
        <div id="cw-api-line" hidden><code id="cw-api-url"></code><button id="cw-api-copy"></button><button id="cw-api-term-2"></button></div>
        <div id="cw-api-term-note" hidden><span class="cw-term-dot"></span><span id="cw-api-term-state"></span><button id="cw-api-term-open"></button></div>
        <details id="cw-setup" hidden><button id="cw-open-settings"></button></details>
    </div>
    <script>window.SKUNDER_COMMUNITY = { channels: [{ id: 'umum', label: '#umum' }], defaultAvatar: '', profile: { name: '', bio: '' } };
    window.__posted = [];
    window.acquireVsCodeApi = function () { return { postMessage: function (m) { window.__posted.push(m); }, getState: function () { return {}; }, setState: function () {} }; };</script>
    <script>${communityJs.replace(/<\/script/gi, '<\\/script')}</script>
    </body></html>`, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' });

    const w = dom.window;
    const dispatch = (data) => w.dispatchEvent(new w.MessageEvent('message', { data }));
    await sleep(120);

    dispatch({ type: 'communityConfig', defaultAvatar: '', profile: { name: '', bio: '' }, channels: [{ id: 'umum', label: '#umum' }], live: { enabled: true, running: false, seconds: 12, languages: ['id', 'en', 'zh'], personas: 0, unlimited: true }, recent: [], diskusi: { enabled: true, ok: false, display: true, message: '', count: 0, collection: 'diskusi_ai' } });
    await sleep(60);
    const note = w.document.getElementById('cw-live-note');
    ok(!note.hidden && /Nyalakan llama-server/.test(note.textContent), 'catatan: server belum berjalan', note.textContent);
    ok(/Ramai/.test(w.document.getElementById('cw-live').textContent), 'tombol ⚡ Ramai tampil');
    // Status awal harus menyebut Firebase, BUKAN “0 pesan terbaca · data/data.txt”.
    ok(/☁ Firebase .*menyambung/.test(w.document.getElementById('cw-state').textContent), 'status awal menyebut Firebase', w.document.getElementById('cw-state').textContent);
    ok(!/pesan terbaca/.test(w.document.getElementById('cw-state').textContent), 'status tidak memakai teks “N pesan terbaca · data/data.txt”', w.document.getElementById('cw-state').textContent);

    dispatch({ type: 'communityLiveTyping', name: 'Chen Wei 陈伟', langTag: '中文' });
    await sleep(40);
    ok(/menulis/.test(w.document.getElementById('cw-msgs').textContent), 'indikator menulis dirender');
    ok(/Chen Wei/.test(w.document.getElementById('cw-msgs').textContent), 'nama persona tampil di indikator');

    dispatch({ type: 'communityLive', message: { id: 'm1', name: 'Marco Bianchi', bio: 'Dashboard & visualisasi data', text: 'Quality is solid: 0.0% missing.', at: Date.now(), lang: 'en', langTag: 'EN', local: true, kind: 'chat' } });
    await sleep(60);
    const html = w.document.getElementById('cw-msgs').innerHTML;
    ok(/Marco Bianchi/.test(html), 'pesan lokal dirender');
    ok(/⚡ lokal/.test(html), 'badge ⚡ lokal tampil');
    ok(/EN/.test(html), 'tag bahasa tampil');
    ok(!/menulis/.test(html), 'indikator menulis hilang setelah pesan masuk');

    // Kirim pesan: mode lokal (tanpa Firebase) → langsung muncul + minta jawaban.
    w.document.getElementById('cw-text').value = 'Berapa stok kritis?';
    w.document.getElementById('cw-send').dispatchEvent(new w.Event('click'));
    await sleep(60);
    const sent = w.__posted.filter((m) => m.type === 'askCommunity');
    ok(sent.length === 1 && sent[0].text === 'Berapa stok kritis?', 'pesan dikirim ke mesin jawaban', JSON.stringify(sent));
    ok(/Berapa stok kritis/.test(w.document.getElementById('cw-msgs').textContent), 'pesan pengguna tampil di mode lokal');

    w.document.getElementById('cw-live').dispatchEvent(new w.Event('click'));
    await sleep(30);
    ok(w.__posted.some((m) => m.type === 'liveToggle'), 'tombol ⚡ mengirim liveToggle');

    // ── pemilih bahasa (🌐): boleh lebih dari satu, tidak dipaksa satu bahasa ──
    const langBtn = w.document.getElementById('cw-lang');
    ok(!!langBtn && /3/.test(langBtn.textContent), 'tombol 🌐 menampilkan jumlah bahasa', langBtn && langBtn.textContent);
    langBtn.dispatchEvent(new w.Event('click'));
    await sleep(20);
    ok(!w.document.getElementById('cw-lang-menu').hidden, 'panel bahasa terbuka');
    const langBoxes = Array.from(w.document.querySelectorAll('#cw-lang-list input[type="checkbox"]'));
    ok(langBoxes.length === 8, 'seluruh bahasa tersedia untuk dipilih', langBoxes.length);
    ok(langBoxes.filter((b) => b.checked).map((b) => b.value).join(',') === 'id,en,zh', 'centang sesuai community.languages', langBoxes.filter((b) => b.checked).length);
    const enBox = langBoxes.find((b) => b.value === 'en');
    enBox.checked = false;
    enBox.dispatchEvent(new w.Event('change'));
    await sleep(20);
    const langMsg = w.__posted.filter((m) => m.type === 'setCommunityLanguages').pop();
    ok(langMsg && langMsg.languages.join(',') === 'id,zh', 'pilihan bahasa terkirim tanpa EN', JSON.stringify(langMsg));
    ok(w.document.getElementById('cw-reply-lang').options.length === 10, 'pilihan bahasa jawaban tersedia', w.document.getElementById('cw-reply-lang').options.length);
    const replySelect = w.document.getElementById('cw-reply-lang');
    replySelect.value = 'en';
    replySelect.dispatchEvent(new w.Event('change'));
    await sleep(20);
    const replyMsg = w.__posted.filter((m) => m.type === 'setReplyLanguage').pop();
    ok(replyMsg && replyMsg.mode === 'en', 'mode bahasa jawaban terkirim', JSON.stringify(replyMsg));

    // ── ruang Diskusi AI: pesan tidak tercampur, tab, dan pengiriman ──
    ok(/∞ anggota/.test(note.textContent), 'status anggota tanpa batas tampil', note.textContent);
    dispatch({
        type: 'communityLive',
        message: {
            id: 'ai1', name: 'Spider AI', bio: 'Diskusi data', room: 'diskusi', kind: 'answer',
            text: 'Poin utama: margin turun 2,1 poin.\n• Revenue 120 juta; margin 18,4%.\nStatus: tuntas.',
            at: Date.now(), lang: 'id', langTag: 'ID', local: true,
        },
    });
    await sleep(60);
    ok(/Poin utama/.test(w.document.getElementById('cw-ai-msgs').textContent), 'pesan Diskusi AI masuk ruang diskusi');
    ok(!/Poin utama/.test(w.document.getElementById('cw-msgs').textContent), 'pesan Diskusi AI tidak masuk ruang komunitas');

    w.document.getElementById('cw-tab-ai').dispatchEvent(new w.Event('click'));
    await sleep(40);
    ok(!w.document.getElementById('cw-pane-ai').hidden && w.document.getElementById('cw-pane-community').hidden, 'tab Diskusi AI menampilkan ruangnya');
    ok(/diskusi AI · \d+ pesan · ☁ Firebase diskusi_ai · menyambung/.test(w.document.getElementById('cw-state').textContent), 'status Diskusi AI menyebut Firebase sejak awal', w.document.getElementById('cw-state').textContent);
    w.document.getElementById('cw-ai-text').value = 'Kenapa margin turun?';
    w.document.getElementById('cw-ai-send').dispatchEvent(new w.Event('click'));
    await sleep(60);
    const aiSent = w.__posted.filter((m) => m.type === 'aiAsk');
    ok(aiSent.length === 1 && aiSent[0].text === 'Kenapa margin turun?', 'pertanyaan diskusi dikirim ke mesin AI', JSON.stringify(aiSent));
    ok(/Kenapa margin turun/.test(w.document.getElementById('cw-ai-msgs').textContent), 'pertanyaan tampil di ruang diskusi');
    ok(/menulis/.test(w.document.getElementById('cw-ai-msgs').textContent), 'indikator menulis muncul di ruang diskusi');

    // ── Diskusi AI dari Firebase: sumber di kepala ruang + rotasi 100 mengosongkan ──
    dispatch({
        type: 'chatHistory',
        history: [],
        remoteMessages: [],
        aiRemoteMessages: [
            { id: 'ai-fb-1', room: 'diskusi', name: 'Spider AI', text: 'Jawaban dari Firebase', at: Date.now(), kind: 'answer', remote: true },
        ],
        aiStatus: { enabled: true, ok: true, display: true, count: 1, collection: 'diskusi_ai' },
    });
    await sleep(60);
    ok(/Jawaban dari Firebase/.test(w.document.getElementById('cw-ai-msgs').textContent), 'pesan Diskusi AI dari Firebase dirender');
    ok(/☁ database/.test(w.document.getElementById('cw-ai-msgs').innerHTML), 'badge ☁ database tampil di Diskusi AI');
    const aiSrcEl = w.document.getElementById('cw-ai-src');
    ok(!!aiSrcEl && /Firebase diskusi_ai/.test(aiSrcEl.textContent), 'sumber Firebase tampil di kepala Diskusi AI', aiSrcEl && aiSrcEl.textContent);
    w.document.getElementById('cw-tab-ai').dispatchEvent(new w.Event('click'));
    await sleep(40);
    ok(/diskusi AI · \d+ pesan · ☁ Firebase diskusi_ai · 1 pesan/.test(w.document.getElementById('cw-state').textContent), 'status tab menyebut jumlah pesan Firebase', w.document.getElementById('cw-state').textContent);
    dispatch({ type: 'aiCleared', count: 100, limit: 100, deleted: 100, archived: 'data/arsip/data-1.txt' });
    await sleep(60);
    ok(!/Jawaban dari Firebase/.test(w.document.getElementById('cw-ai-msgs').textContent), 'rotasi mengosongkan ruang Diskusi AI');
    ok(/dihapus dari Firebase/.test(w.document.getElementById('cw-state').textContent), 'status rotasi menyebut Firebase dikosongkan', w.document.getElementById('cw-state').textContent);
    ok(/log tetap di/.test(w.document.getElementById('cw-state').textContent), 'status rotasi menyebut log tetap disimpan', w.document.getElementById('cw-state').textContent);
    dispatch({
        type: 'aiRemote',
        replace: true,
        status: { enabled: true, ok: true, display: true, count: 2, collection: 'diskusi_ai' },
        messages: [
            { id: 'ai-fb-2', room: 'diskusi', name: 'Kamu', text: 'Pertanyaan baru dari perangkat lain', at: Date.now() - 1000, kind: 'chat', remote: true },
            { id: 'ai-fb-3', room: 'diskusi', name: 'Spider AI', text: 'Jawaban baru dari perangkat lain', at: Date.now(), kind: 'answer', remote: true },
        ],
    });
    await sleep(60);
    const aiPaneText = w.document.getElementById('cw-ai-msgs').textContent;
    ok(/Pertanyaan baru dari perangkat lain/.test(aiPaneText) && /Jawaban baru dari perangkat lain/.test(aiPaneText), 'aiRemote menampilkan pesan dari perangkat lain');
    ok(/Firebase diskusi_ai · 2 pesan/.test(w.document.getElementById('cw-ai-src').textContent), 'jumlah pesan mengikuti status Firebase', w.document.getElementById('cw-ai-src').textContent);

    w.document.getElementById('cw-open-log').dispatchEvent(new w.Event('click'));
    await sleep(30);
    ok(w.__posted.some((m) => m.type === 'openChatLog'), 'tombol catatan meminta buka data/data.txt');

    // ── Firebase: pesan remote, status, dan tombol JSON/API ──
    dispatch({
        type: 'communityRemote',
        channel: 'umum',
        archived: 1,
        status: { enabled: true, ok: true, count: 1, projectId: 'streamlit-launcher-vscode', collection: 'community_umum' },
        messages: [{
            id: 'fb1', name: 'Rina Kusuma', bio: 'Kualitas data', text: 'Halo dari Firebase',
            at: Date.now(), lang: 'id', langTag: 'ID', kind: 'chat', channel: 'umum', remote: true,
        }],
    });
    await sleep(80);
    const fbHtml = w.document.getElementById('cw-msgs').innerHTML;
    ok(/Halo dari Firebase/.test(fbHtml), 'pesan Firebase dirender');
    ok(/☁ database/.test(fbHtml), 'badge ☁ database tampil');
    ok(/database tersambung/.test(note.textContent), 'status database tampil di catatan ⚡', note.textContent);
    ok(/☁ Firebase community_umum · \d+ pesan/.test(w.document.getElementById('cw-state').textContent), 'status ruang Komunitas = Firebase + jumlah pesan', w.document.getElementById('cw-state').textContent);
    ok(/cw-day/.test(fbHtml), 'pemisah hari tampil di daftar pesan');
    dispatch({
        type: 'communityLive',
        message: { id: 'fb2', name: 'Rina Kusuma', bio: '', text: 'Tambahan kecil dari saya.', at: Date.now() + 60000, lang: 'id', langTag: 'ID', local: true, kind: 'chat' },
    });
    await sleep(50);
    ok(/cw-msg[^"]*grouped/.test(w.document.getElementById('cw-msgs').innerHTML), 'pesan berurutan dari orang yang sama dikelompokkan');
    w.document.getElementById('cw-text').value = 'abc';
    w.document.getElementById('cw-text').dispatchEvent(new w.Event('input'));
    await sleep(20);
    ok(w.document.getElementById('cw-count').textContent === '3/900', 'penghitung karakter pesan bekerja', w.document.getElementById('cw-count').textContent);

    dispatch({ type: 'chatApiInfo', api: { enabled: true, running: true, url: 'http://127.0.0.1:47831', chat: 'http://127.0.0.1:47831/api/chat.json' } });
    await sleep(40);
    const apiLine = w.document.getElementById('cw-api-line');
    ok(!apiLine.hidden && /\/api\/chat\.json/.test(w.document.getElementById('cw-api-url').textContent), 'URL API JSON tampil');
    const termNote = w.document.getElementById('cw-api-term-note');
    ok(!termNote.hidden && /berjalan/.test(w.document.getElementById('cw-api-term-state').textContent), 'status terminal server API tampil', w.document.getElementById('cw-api-term-state').textContent);
    ok(termNote.dataset.state === 'on', 'status terminal menandai server berjalan');
    w.document.getElementById('cw-api-term-open').dispatchEvent(new w.Event('click'));
    await sleep(30);
    ok(w.__posted.some((m) => m.type === 'openChatApiTerminal'), 'tombol Buka Terminal di bawah Salin bekerja');
    w.document.getElementById('cw-json-fb').dispatchEvent(new w.Event('click'));
    w.document.getElementById('cw-api').dispatchEvent(new w.Event('click'));
    await sleep(30);
    ok(w.__posted.some((m) => m.type === 'downloadRemoteJson'), 'tombol ☁ JSON meminta unduhan Firebase');
    ok(w.__posted.some((m) => m.type === 'openChatApi'), 'tombol 🔗 API membuka API JSON');
    w.document.getElementById('cw-api-term').dispatchEvent(new w.Event('click'));
    await sleep(30);
    ok(w.__posted.some((m) => m.type === 'openChatApiTerminal'), 'tombol 🖥 Terminal membuka terminal server API');

    // ── render inkremental, draft streaming, antrean, dan duplikat ──
    const msgs = w.document.getElementById('cw-msgs');
    const firstNode = msgs.querySelector('.cw-msg');
    firstNode.__cwKeep = true;
    dispatch({ type: 'communityLive', message: { id: 'inc1', name: 'Yuki Tanaka 田中由紀', bio: 'Machine learning', text: 'Akurasi model 82,4% dan kappa 0,61.', at: Date.now() + 120000, lang: 'id', langTag: 'ID', local: true, kind: 'chat' } });
    await sleep(50);
    ok(firstNode.isConnected && firstNode.__cwKeep === true, 'pesan lama tidak dibangun ulang (render inkremental)');
    ok(/Akurasi model 82,4%/.test(msgs.textContent), 'pesan baru ditambahkan');

    dispatch({ type: 'communityLiveStream', id: 'd1', room: 'komunitas', name: 'Rina Kusuma', lang: 'id', langTag: 'ID', text: 'Stok kritis ' });
    await sleep(30);
    ok(/cw-stream/.test(msgs.innerHTML) && /Stok kritis/.test(msgs.textContent), 'draft streaming tampil');
    dispatch({ type: 'communityLiveStream', id: 'd1', room: 'komunitas', name: 'Rina Kusuma', lang: 'id', langTag: 'ID', text: 'Stok kritis 12 SKU dari 40 SKU.' });
    await sleep(30);
    ok((msgs.innerHTML.match(/data-cw-draft=/g) || []).length === 1, 'draft diperbarui tanpa duplikat');
    dispatch({ type: 'communityLive', message: { id: 'd2', draftId: 'd1', name: 'Rina Kusuma', bio: 'Analis stok', text: 'Stok kritis 12 SKU dari 40 SKU.', at: Date.now() + 130000, lang: 'id', langTag: 'ID', local: true, kind: 'answer' } });
    await sleep(40);
    ok(!/cw-stream/.test(msgs.innerHTML), 'draft hilang setelah jawaban akhir');
    ok((msgs.textContent.match(/Stok kritis 12 SKU/g) || []).length === 1, 'jawaban akhir tidak tampil dua kali');
    ok(/cw-ini/.test(msgs.innerHTML), 'avatar inisial dipakai');

    dispatch({ type: 'communityLiveQueue', pending: 2 });
    await sleep(20);
    ok(/2 pesan menunggu/.test(w.document.getElementById('cw-state').textContent), 'status antrean tampil', w.document.getElementById('cw-state').textContent);
    dispatch({ type: 'communityLiveQueue', pending: 0 });

    const beforeDup = (msgs.textContent.match(/Halo dari Firebase/g) || []).length;
    dispatch({ type: 'communityLive', message: { id: 'fb1dup', name: 'Rina Kusuma', text: 'Halo dari Firebase', at: Date.now() + 140000, lang: 'id', langTag: 'ID', local: true, kind: 'chat' } });
    await sleep(40);
    ok(((msgs.textContent.match(/Halo dari Firebase/g) || []).length) === beforeDup, 'pesan kembar tidak tampil dua kali');

    // ── rotasi otomatis: layar dikosongkan saat 100 pesan tercapai ──
    dispatch({ type: 'chatClearing', limit: 100, count: 100 });
    await sleep(20);
    ok(/menyiapkan arsip/.test(w.document.getElementById('cw-state').textContent), 'status menyiapkan arsip tampil');
    dispatch({ type: 'chatCleared', limit: 100, count: 100, archived: 'C:\\proyek\\data\\arsip\\data-20261026-120000.txt' });
    await sleep(40);
    ok(!/Halo dari Firebase|Stok kritis 12 SKU/.test(msgs.textContent), 'seluruh pesan komunitas dikosongkan');
    ok(!/Akurasi model/.test(w.document.getElementById('cw-ai-msgs').textContent), 'ruang Diskusi AI ikut dikosongkan');
    ok(/chat dibersihkan otomatis \(100 pesan\)/.test(w.document.getElementById('cw-state').textContent), 'status rotasi tampil', w.document.getElementById('cw-state').textContent);
    ok(/data-20261026-120000\.txt/.test(w.document.getElementById('cw-state').textContent), 'nama arsip tampil di status');
    dispatch({ type: 'chatClearResult', ok: true, deleted: 100, failed: 0 });
    await sleep(20);
    ok(/database dibersihkan · 100 pesan dihapus/.test(w.document.getElementById('cw-state').textContent), 'status hapus database tampil');

    // ── tampilan database dimatikan: catatan memakai data lokal ──
    dispatch({ type: 'communityFirebaseStatus', status: { enabled: true, display: false, ok: true, message: '', count: 0 } });
    await sleep(20);
    ok(/data lokal/.test(note.textContent), 'catatan ⚡ menjelaskan pembacaan data lokal', note.textContent);
    w.document.getElementById('cw-tab-community').dispatchEvent(new w.Event('click'));
    dispatch({ type: 'chatHistory', history: [], remoteMessages: [] });
    await sleep(30);
    ok(/tampilan database dimatikan · [0-9]+ pesan/.test(w.document.getElementById('cw-state').textContent), 'mode lokal menjelaskan database dimatikan', w.document.getElementById('cw-state').textContent);

    w.close();
    console.log(`\nHASIL: ${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})().catch((e) => {
    console.error('Pemeriksaan gagal:', e);
    process.exit(1);
});

