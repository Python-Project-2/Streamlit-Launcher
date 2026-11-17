/*
 * Uji regresi “Syarat MUTLAK” + room Community yang tidak bergantung LLM.
 *
 * Cakupan:
 *  • tradeConviction: semua syarat lulus → MUTLAK BUY; satu gagal → TUNGGU;
 *  • jawaban LLM ditimpa bila melawan gerbang (enforceConviction);
 *  • tradeCommunityBrain: partner tetap menjawab tanpa LLM, angka nyata, tanpa janji menang;
 *  • tradingViewView: gate dipakai di quote + prompt + room, heartbeat room ada,
 *    HTML punya kartu MUTLAK & chip status LLM.
 *
 * Jalankan: npm run check:mutlak
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const fails = [];
const ok = [];
function check(name, cond, extra) {
    if (cond) { ok.push(name); return; }
    fails.push(name + (extra ? ' — ' + extra : ''));
}
function eq(name, actual, expected) {
    check(name, actual === expected, 'dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
}

function bundle(entry) {
    const built = esbuild.buildSync({
        entryPoints: [path.join(root, entry)],
        bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
    });
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
    return mod.exports;
}

const C = bundle('src/tradeConviction.ts');
const B = bundle('src/tradeCommunityBrain.ts');

/** Teknik BUY yang memenuhi semua syarat. */
function goodBuy() {
    return {
        symbol: 'IDX:TEST', yahoo: 'TEST.JK', currency: 'IDR', last: 1000, changePct: 1.2,
        sma20: 950, sma50: 900, sma200: 800, ema9: 990, ema21: 960,
        rsi: 60, macd: 5, signalLine: 3, histogram: 2, atr: 20, atrPct: 2,
        hi20: 990, lo20: 960, hi55: 1050, lo55: 900, high52: 1200, low52: 700,
        volAvg20: 1e6, volLast: 1.5e6, volRatio: 1.5,
        arah: 'NAIK', sinyal: 'BUY', skor: 5, alasan: ['tren naik', 'volume naik'],
        entry: 988.04, stop: 958.04, tp1: 1048.04, tp2: 1078.04, rr: 2,
        bars: 250, time: 1700000000, updated: 1700000000,
    };
}

const good = C.evaluateConviction(goodBuy());
eq('semua syarat lulus → MUTLAK_BUY', good.verdict, 'MUTLAK_BUY');
eq('sisi BUY', good.side, 'BUY');
eq('13 syarat dinilai', good.total, 13);
eq('semua syarat lulus (passed = total)', good.passed, good.total);
check('skor gerbang 100%', good.score === 100, String(good.score));
check('ringkasan menyebut MUTLAK', /syarat mutlak lulus/i.test(good.summary), good.summary);

// Satu syarat gagal (volume) → tidak boleh ada entry.
const lowVol = goodBuy();
lowVol.volRatio = 0.8;
lowVol.volLast = 800000;
const wait = C.evaluateConviction(lowVol);
eq('volume gagal → TUNGGU', wait.verdict, 'TUNGGU');
eq('sisi HOLD', wait.side, 'HOLD');
check('blocker menyebut volume', wait.blockers.some((b) => /Volume/i.test(b)), JSON.stringify(wait.blockers));
check('ringkasan TUNGGU menyuruh menunggu', /Tidak ada entry/i.test(wait.summary), wait.summary);

// Sinyal mesin HOLD tidak boleh dipaksa jadi BUY.
const hold = goodBuy();
hold.sinyal = 'HOLD';
hold.skor = 1;
eq('sinyal mesin HOLD → TUNGGU', C.evaluateConviction(hold).verdict, 'TUNGGU');

// R:R jelek juga menggagalkan.
const badRr = goodBuy();
badRr.rr = 1.2;
badRr.hi55 = 1000;
const rrWait = C.evaluateConviction(badRr);
eq('R:R < 2 → TUNGGU', rrWait.verdict, 'TUNGGU');
check('blocker menyebut R:R', rrWait.blockers.some((b) => /R:R/i.test(b)), JSON.stringify(rrWait.blockers));

// LLM dilarang melawan gerbang.
const enforced = C.enforceConviction('ARAH: NAIK\nSINYAL: BUY\nENTRY: 1000\nKEYAKINAN: 95%', wait);
check('jawaban LLM TUNGGU dipaksa SINYAL: HOLD', /^SINYAL: HOLD$/m.test(enforced), enforced);
check('jawaban LLM TUNGGU diberi peringatan jangan entry', /Jangan entry/i.test(enforced), enforced);
check('tidak ada SINYAL: BUY tersisa', !/^SINYAL: BUY$/m.test(enforced), enforced);

const allowed = C.enforceConviction('SINYAL: HOLD\nKEYAKINAN: 10%', good);
check('gerbang lulus memaksa SINYAL: BUY', /^SINYAL: BUY$/m.test(allowed), allowed);
check('keyakinan dibatasi skor gerbang', /KEYAKINAN: 100%/.test(allowed), allowed);

// Brief prompt memuat gerbang dan larangan janji menang.
const brief = C.convictionBrief(wait);
check('brief memuat PUTUSAN MESIN', /PUTUSAN MESIN: TUNGGU/.test(brief), brief.slice(0, 200));
check('brief melarang BUY/SELL saat TUNGGU', /DILARANG menyarankan BUY\/SELL/.test(brief), brief.slice(0, 400));
check('brief melarang janji menang', /pasti menang/i.test(brief), brief.slice(-200));

// ── otak lokal room Community ────────────────────────────────────────────────
const ctxWait = {
    partner: 'Rina', symbol: 'IDX:TEST', teknik: goodBuy(), conviction: wait,
    question: 'aman beli sekarang?', llmOnline: false, tick: 0,
};
const replies = B.localPartnerReply(ctxWait);
check('partner tetap menjawab tanpa LLM (≥2 pesan)', replies.length >= 2, String(replies.length));
check('balasan menyebut status gerbang', replies.some((r) => /TUNGGU/.test(r)), replies.join(' | '));
check('balasan memakai angka harga', replies.some((r) => /1\.000|988/.test(r)), replies.join(' | '));
check('balasan tidak menjanjikan kemenangan', !replies.some((r) => /pasti menang|dijamin profit/i.test(r)), replies.join(' | '));

const ctxOk = Object.assign({}, ctxWait, { conviction: good, question: 'target di mana?' });
const okReplies = B.localPartnerReply(ctxOk);
check('balasan menyebut TP saat gerbang lulus', okReplies.some((r) => /TP1/.test(r) && /R:R/.test(r)), okReplies.join(' | '));

const noData = B.localPartnerReply({ partner: 'Bagas', symbol: 'IDX:TEST', question: 'beli?', llmOnline: false });
check('tanpa data partner tetap menjawab', noData.length >= 1 && /data/i.test(noData[0]), noData.join(' | '));

const obs = B.partnerObservation({ partner: 'Sinta', symbol: 'IDX:TEST', teknik: goodBuy(), conviction: wait, tick: 1 });
check('heartbeat room berisi angka & gerbang', /1\.000|TUNGGU/.test(obs), obs);
const obsNoData = B.partnerObservation({ partner: 'Sinta', symbol: 'IDX:TEST' });
check('heartbeat tanpa data tetap hidup', obsNoData.length > 10, obsNoData);

const notesWait = B.signalMessages(goodBuy(), wait);
check('pengumuman TUNGGU tidak menyarankan entry', notesWait.every((n) => n.signal === 'HOLD'), JSON.stringify(notesWait));
check('pengumuman TUNGGU menyebut syarat gagal', /belum lulus/i.test(notesWait[0].text), notesWait[0].text);
const notesOk = B.signalMessages(goodBuy(), good);
check('pengumuman MUTLAK memakai sisi BUY', notesOk.every((n) => n.signal === 'BUY'), JSON.stringify(notesOk));
check('pengumuman MUTLAK memuat level', /entry 988/.test(notesOk[0].text) && /TP1/.test(notesOk[0].text), notesOk[0].text);

// ── sambungan ke view ───────────────────────────────────────────────────────
const view = fs.readFileSync(path.join(root, 'src/tradingViewView.ts'), 'utf8');
check('view memakai evaluateConviction', /evaluateConviction\(/.test(view));
check('view mengirim conviction ke quote', /conviction: this\.conviction/.test(view));
check('view menimpa jawaban LLM dengan gerbang', /enforceConviction\(/.test(view));
check('view menyertakan gerbang di prompt', /convictionBrief\(/.test(view));
check('room memakai otak lokal saat LLM mati', /localPartnerReply\(/.test(view) && /brain\.ready/.test(view));
check('room punya heartbeat', /communityBeat\(/.test(view) && /setInterval/.test(view));
check('view punya kartu MUTLAK', /id="tv-mutlak"/.test(view));
check('view punya chip status LLM room', /id="tv-comm-llm"/.test(view));

const js = fs.readFileSync(path.join(root, 'media/tradingview-view.js'), 'utf8');
check('UI merender daftar syarat', /function renderConviction/.test(js));
check('UI menampilkan badge veredict room', /msg\.verdict/.test(js));
check('UI memasang listener room di luar render riwayat', !/function renderSessions[\s\S]{0,400}communityAsk/.test(js));

const prompt = fs.readFileSync(path.join(root, 'src/tradingAi.ts'), 'utf8');
check('prompt sistem memuat aturan GERBANG MUTLAK', /GERBANG MUTLAK mengikat/.test(prompt));
check('prompt melarang janji menang', /pasti menang/.test(prompt));

if (fails.length) {
    console.error('GAGAL ' + fails.length + ':');
    fails.forEach((f) => console.error('  ✗ ' + f));
    console.error('\nLulus: ' + ok.length);
    process.exit(1);
}
console.log('✓ Mutlak & Community: ' + ok.length + ' uji lolos (gerbang mengikat, room hidup tanpa LLM)');
