
import { chatStream, ChatMessage } from './llamaCore';
import { tidyModelReply } from './analysisStore';

export type SpiderActionKind = 'click' | 'tab' | 'select' | 'input' | 'focus' | 'scroll' | 'hover';

export interface SpiderTarget {
    id: string;
    label: string;
    kind?: string;
    click?: boolean;
    group?: string;
    danger?: boolean;
    value?: string;
}

export interface SpiderStep {
    say: string;
    goto?: string;
    highlight?: boolean;
    action?: SpiderActionKind;
    value?: string;
    hold?: number;
}

export interface SpiderPlan {
    reply: string;
    steps: SpiderStep[];
    source: 'llm' | 'local';
    note?: string;
    /** Permintaan eksplisit pengguna (mis. tombol “▶ Jalankan semua fitur”) — tetap dieksekusi walau ⚡ Auto dimatikan. */
    force?: boolean;
    /** Rencana tur halaman (“▶ Jalankan semua fitur”) — dipakai untuk laporan misi. */
    tour?: boolean;
    /** Rencana pengecekan kontrol (“✓ Cek semua kontrol”) — dipakai untuk ringkasan rapi. */
    check?: boolean;
    /** Otak model (llama-server) belum aktif: pet menolak memakai template dan minta otaknya dinyalakan. */
    needsBrain?: boolean;
}

export interface SpiderRequest {
    request: string;
    fileName: string;
    sheetName: string;
    targets: SpiderTarget[];
    summary: string;
    facts: string[];
    running: boolean;
    port: number;
    temperature: number;
    maxTokens: number;
    maxSteps: number;
    contextSize?: number;
}

interface PromptBudget {
    targetLimit: number;
    summaryChars: number;
    maxTokens: number;
    labelChars: number;
    /** Mode JSON ketat: dipakai pada percobaan terakhir agar balasan model pasti bisa dibaca. */
    strictJson?: boolean;
}

/** Kata kunci → petunjuk target yang paling relevan. */
const HINTS: [RegExp, string[]][] = [
    [/kpi|pendapatan|omzet|revenue|laba|margin|pertumbuhan|penjualan/i, ['businesskpi', 'kpi', 'pendapatan']],
    [/stok|stock|inventaris|gudang|sku|restock|overstock/i, ['stock', 'stok']],
    [/pengadaan|kebutuhan|procure|belanja|anggaran/i, ['needs', 'kebutuhan']],
    [/kualitas|kesehatan|kebersihan|kotor|csv|missing|duplikat|kosong|outlier/i, ['csvhealth', 'kualitas']],
    [/pohon|tree|c4\\.5|klasifikasi|aturan|rule|prediksi|akurasi|confusion/i, ['decisiontree', 'decision tree']],
    [/tabel|table|baris mentah|data mentah|rincian data/i, ['table', 'tabel']],
    [/builder|rangkai|bikin grafik|buat grafik|kustom|kustomisasi|tambah grafik/i, ['builder']],
    [/temuan|insight|kesimpulan|ringkasan temuan/i, ['insights', 'insight']],
    [/korelasi|hubungan|heatmap|matrix/i, ['correlation', 'korelasi']],
    [/kolom|column|profil kolom|detail kolom/i, ['columns', 'kolom']],
    [/ringkas|summary|ikhtisar|garis besar/i, ['summary', 'ringkas']],
    [/catatan|notes|komentar/i, ['notes', 'catatan']],
    [/export|ekspor|unduh|simpan berkas|keluarkan data/i, ['export', 'unduh']],
    [/grafik|chart|visual|diagram|gambar|tren|kecenderungan/i, ['charts', 'visualisasi', 'advanced', 'grafik']],
];

interface ActionIntent {
    id: string;
    minta: RegExp;
    action: SpiderActionKind;
    target: RegExp;
    /** true = mengubah/menghapus data pengguna. */
    danger?: boolean;
    /** kata kunci yang harus disebut pengguna untuk aksi berbahaya. */
    sebut?: RegExp;
    /** keterangan aksi saat dilaporkan ke pengguna. */
    aksi?: string;
}

const ACTION_INTENTS: ActionIntent[] = [
    { id: 'export-python', minta: /python/i, action: 'click', target: /export|unduh|python/i, aksi: 'menekan tombol export Python' },
    { id: 'export-json', minta: /json/i, action: 'click', target: /export|unduh|json|data/i, aksi: 'menekan tombol export JSON' },
    { id: 'export-docx', minta: /docx|word|jurnal/i, action: 'click', target: /export|unduh|docx|jurnal/i, aksi: 'menekan tombol export DOCX (jurnal)' },
    { id: 'export-pdf', minta: /pdf/i, action: 'click', target: /export|unduh|pdf|jurnal/i, aksi: 'menekan tombol export PDF' },
    { id: 'export-xlsx', minta: /xlsx|excel/i, action: 'click', target: /export|unduh|xlsx|excel/i, aksi: 'menekan tombol export Excel' },
    { id: 'export-pptx', minta: /pptx|powerpoint|presentasi|slide/i, action: 'click', target: /export|unduh|pptx|powerpoint|presentasi/i, aksi: 'menekan tombol export PowerPoint' },
    {
        // Menekan tombol export gambar workflow hanya saat pengguna meminta export/unduh berkasnya.
        id: 'export-workflow', minta: /export|ekspor|unduh/i, action: 'click',
        target: /export|unduh|workflow|alur/i, aksi: 'menekan tombol export gambar workflow',
    },
    {
        id: 'export-any', minta: /export|ekspor|unduh|simpan berkas|keluarkan data/i, action: 'click',
        target: /export|unduh|python|docx|pdf|xlsx|pptx|workflow/i, aksi: 'menekan tombol export yang paling sesuai',
    },
    { id: 'reload', minta: /\b(reload|muat ulang|segarkan)\b|refresh data/i, action: 'click', target: /reload|muat ulang|segarkan/i, danger: true, sebut: /\b(reload|muat ulang|segarkan)\b/i, aksi: 'menekan tombol muat ulang' },
    { id: 'web-online', minta: /\b(online|streamlit\.app|situs)\b/i, action: 'click', target: /online|website|situs|tautan/i, aksi: 'membuka tautan proyek online' },
    { id: 'web-pypi', minta: /pypi|paket python|library|pustaka/i, action: 'click', target: /pypi|offline|tautan|website/i, aksi: 'membuka tautan PyPI' },
    { id: 'web-download', minta: /download|jumlah unduhan|statistik unduhan/i, action: 'click', target: /download|unduhan|visit/i, aksi: 'membuka tautan statistik unduhan' },
    {
        id: 'filter-stock', minta: /\b(kritis|menipis|aman|overstock|kelas a|filter|saring|tab)\b|kelebihan stok/i, action: 'tab',
        target: /\b(kritis|menipis|aman|overstock|kelas a|semua|filter|tab)\b/i, aksi: 'memindahkan tab filter stok',
    },
    { id: 'builder-add', minta: /tambah(kan)? (grafik|chart|kartu)|grafik baru|chart baru|bikin grafik|buat grafik/i, action: 'click', target: /add chart|tambah grafik|tambah chart|grafik baru/i, aksi: 'menekan tombol tambah grafik' },
    {
        id: 'builder-reset', minta: /\b(reset|atur ulang|kembalikan tata letak|tata letak awal|rapikan tata letak)\b/i, action: 'click',
        target: /reset|tata letak awal/i, danger: true, sebut: /\b(reset|atur ulang|kembalikan|tata letak awal|rapikan tata letak)\b/i, aksi: 'menekan tombol reset tata letak grafik',
    },
    { id: 'notes-add', minta: /tambah(kan)? catatan|catatan baru|simpan catatan|tulis catatan/i, action: 'click', target: /tambah catatan|catatan baru|add note|simpan catatan/i, aksi: 'menekan tombol tambah catatan' },
    {
        id: 'notes-clear', minta: /hapus catatan|buang catatan|bersihkan catatan|kosongkan catatan/i, action: 'click',
        target: /hapus|buang|bersihkan|kosongkan/i, danger: true, sebut: /hapus|buang|bersihkan|kosongkan/i, aksi: 'menghapus catatan yang diminta',
    },
    { id: 'table-sort', minta: /\b(urutkan|sortir|diurut|urut)\b|\bsort\b/i, action: 'click', target: /urut|sort|kolom/i, aksi: 'mengurutkan tabel' },
    { id: 'table-more', minta: /muat lebih|load more|baris berikutnya|tampilkan semua baris|lebih banyak baris/i, action: 'click', target: /load more|muat lebih|baris berikutnya|lebih banyak/i, aksi: 'memuat baris tabel berikutnya' },
    { id: 'search', minta: /\b(cari|carikan|temukan|ketik|isikan|isi)\b/i, action: 'input', target: /cari|search|temukan|filter|isian/i, aksi: 'mengetikkan pencarian pada kolom yang tersedia' },
    { id: 'builder-select', minta: /ubah (tipe|jenis) grafik|ganti (tipe|jenis) grafik|jadikan (bar|line|pie|doughnut|radar|scatter)/i, action: 'select', target: /tipe|jenis|type|chart/i, aksi: 'mengubah pilihan tipe grafik' },
];

const SAFE_ACTIONS: SpiderActionKind[] = ['click', 'tab', 'select', 'input', 'focus', 'scroll', 'hover'];
const IMPERATIVE = /(tekan|klik|buka|jalankan|jalani|eksekusi|kerjakan|lakukan|ekspor|export|unduh|simpan|ubah|ganti|pilih|filter|saring|urutkan|sortir|cari|carikan|isi|isikan|ketik|tambah|tambahkan|buatkan|hapus|buang|reset|atur ulang|rapikan|reload|muat ulang|segarkan|pindah|gulir|scroll|mulai)/i;

/** Pertanyaan (bukan perintah aksi): dijawab tanpa menekan/mengklik apa pun. */
const QUESTION_RE = /\?|\b(apa|apakah|kenapa|mengapa|bagaimana|gimana|berapa|kapan|siapa|di\s?mana|mana\s+yang|jelaskan|jelasin|terangkan|analisa|analisis|bandingkan|bandingin|uraikan|rincian|seberapa|kok\s+bisa|kenapa\s+bisa)\b/i;

/** Permintaan analisis/jawaban — bukan perintah untuk menekan kontrol halaman. */
export function isQuestionRequest(request: string): boolean {
    const teks = String(request || '').trim();
    if (!teks) { return false; }
    // Perintah aksi yang jelas menang atas kata tanya (“buka tab kritis lalu jelaskan”).
    const aksiJelas = /\b(tekan|klik|buka|pindah|gulir|scroll|export|ekspor|unduh|simpan|ketik|isikan|isi\s+kolom|urutkan|sortir|cari|carikan|tambahkan|tambah\s+grafik|reload|muat\s+ulang|segarkan)\b/i.test(teks);
    if (aksiJelas) { return false; }
    return QUESTION_RE.test(teks);
}
const TOUR_HINT = /((jalankan|jalani|coba|tunjukkan|tampilkan|kelilingi|peragakan).{0,26}(semua|seluruh|tiap|setiap).{0,20}(fitur|tombol|menu|bagian|halaman|isinya|kontrol)|tur( otomatis)?\b|\bdemo\b|keliling halaman|semua fitur|semua tombol|otomatis semua)/i;

const EXPORT_HINT = /export|ekspor|unduh|keluarkan data|simpan berkas/i;

/** Label rapi untuk diucapkan: buang awalan bagian (“KPI › ”) dan jenis kontrol (“tombol: ”). */
function rapikanLabel(label: string): string {
    return String(label || '').replace(/^[^›]{0,24}›\s*/, '').replace(/^(tombol|tautan|tab|kolom isian|pilihan|urut kolom|kartu|bagian):\s*/i, '').trim();
}

function tokens(text: string): string[] {
    return String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9\u00c0-\u024f]+/)
        .filter((t) => t.length >= 4);
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
}

function targetText(t: SpiderTarget): string {
    return `${t.id} ${t.label} ${t.kind || ''}`.toLowerCase();
}

function isSafeTarget(t: SpiderTarget | undefined): boolean {
    return !!t && !!t.click && !t.danger;
}

export function matchTarget(query: string, targets: SpiderTarget[]): SpiderTarget | undefined {
    if (!targets.length) { return undefined; }
    const text = String(query || '').toLowerCase();
    const kata = new Set(tokens(text));
    let best: { target: SpiderTarget; skor: number } | undefined;
    let kataTerkuat = 0;

    for (const t of targets) {
        const label = String(t.label || '').toLowerCase();
        let skor = 0;
        for (const [pola, petunjuk] of HINTS) {
            if (!pola.test(text)) { continue; }
            if (petunjuk.some((p) => `${t.id} ${label}`.includes(p))) { skor += 2; }
        }
        for (const k of tokens(label)) {
            if (kata.has(k)) { skor += 1; if (k.length > kataTerkuat) { kataTerkuat = k.length; } }
        }
        if (label && text.includes(label)) { skor += 3; }
        if (skor > 0 && (!best || skor > best.skor)) { best = { target: t, skor }; }
    }
    if (!best) { return undefined; }
    // Skor 1 hanya diterima bila kata yang cocok cukup khas (panjang), agar tidak salah arah.
    return best.skor >= 2 || kataTerkuat >= 6 ? best.target : undefined;
}

/**
 * Pilih target yang paling tepat untuk sebuah maksud aksi.
 * Selain cocok dengan pola target, kandidat dinilai dari kata-kata permintaan pengguna —
 * jadi “export ke python” memilih tombol Export Python, bukan tombol Export DOCX.
 */
function pickTarget(re: RegExp, targets: SpiderTarget[], preferIds: Set<string> = new Set(), request = ''): SpiderTarget | undefined {
    const cocok = targets.filter((t) => re.test(targetText(t)));
    if (!cocok.length) { return undefined; }
    const aman = cocok.filter(isSafeTarget);
    const kandidat = aman.length ? aman : cocok;
    const kata = new Set(tokens(request));
    let best: { target: SpiderTarget; skor: number } | undefined;
    for (const t of kandidat) {
        let skor = 0;
        if (preferIds.has(t.id)) { skor += 2; }
        const teks = targetText(t);
        for (const k of kata) { if (teks.includes(k)) { skor += 2; } }
        if (t.click) { skor += 1; }
        if (!best || skor > best.skor) { best = { target: t, skor }; }
    }
    return best?.target;
}

/** Apakah pengguna sendiri yang meminta aksi berbahaya pada target ini. */
function adaPermintaanBahaya(request: string, target: SpiderTarget): boolean {
    const teks = String(request || '');
    return ACTION_INTENTS.some((i) => i.danger && (!i.sebut || i.sebut.test(teks)) && i.target.test(targetText(target)));
}

/** Kata umum yang bukan nilai pencarian (“cari semua barang” ≠ mencari kata “semua”). */
const KATA_BUKAN_NILAI = new Set(['semua', 'seluruh', 'kritis', 'menipis', 'aman', 'overstock', 'stok', 'stock', 'barang', 'data', 'tabel', 'nama', 'kategori', 'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'untuk', 'pada', 'dengan', 'nilai', 'baris']);

/** Apakah kandidat nilai terdiri dari kata-kata umum saja (bukan kata yang layak dicari). */
function nilaiBermakna(kandidat: string): boolean {
    const kata = kandidat.toLowerCase().split(/\s+/).filter(Boolean);
    if (!kata.length) { return false; }
    return kata.some((k) => !KATA_BUKAN_NILAI.has(k));
}

/** Nilai yang disebut pengguna untuk dropdown/kolom isian (mis. “jadikan pie”, “cari indomie”). */
function nilaiDiminta(request: string): string | undefined {
    const kutip = request.match(/["“']([^"”']{2,40})["”']/);
    if (kutip) { return kutip[1].trim(); }
    const pola: RegExp[] = [
        /(?:jadikan|ubah (?:ke|menjadi)|pilih|isi(?:kan)?|ketik|tulis|ganti (?:ke|menjadi))\s+([\w .-]{2,40}?)(?:\s+(?:pada|di|untuk|di kolom)\b|[.,]|$)/i,
        /\b(?:cari|carikan|temukan|filter)\s+(?:barang\s+|produk\s+|nama\s+|kategori\s+)?([\w .-]{2,40}?)(?:\s+(?:pada|di|untuk|di kolom)\b|[.,]|$)/i,
    ];
    for (const p of pola) {
        const sesudah = request.match(p);
        if (sesudah && sesudah[1] && nilaiBermakna(sesudah[1].trim())) { return sesudah[1].trim(); }
    }
    return undefined;
}

/** Jenis export yang bisa disebut langsung oleh pengguna (mis. “export python lalu export json”). */
const JENIS_EXPORT: { pola: RegExp; target: RegExp; nama: string }[] = [
    { pola: /\b(json)\b/i, target: /json/i, nama: 'JSON' },
    { pola: /\b(python|py)\b/i, target: /python/i, nama: 'Python' },
    { pola: /\b(docx|word)\b/i, target: /docx|word/i, nama: 'DOCX' },
    { pola: /\b(pdf|jurnal)\b/i, target: /pdf|jurnal/i, nama: 'jurnal PDF' },
    { pola: /\b(xlsx|excel)\b/i, target: /xlsx|excel/i, nama: 'Excel' },
    { pola: /\b(pptx|powerpoint|ppt)\b/i, target: /ppt|powerpoint/i, nama: 'PowerPoint' },
    { pola: /\b(flow|workflow|alur)\b/i, target: /flow|workflow|alur/i, nama: 'gambar flow' },
];

/**
 * Jenis export yang disebut langsung pengguna, beserta posisi penyebutannya.
 * Satu penyebutan = satu langkah, sehingga “export python lalu export json” tidak lagi jadi satu klik saja.
 */
function sebutanExport(text: string, targets: SpiderTarget[], preferIds: Set<string>): { pos: number; step: SpiderStep }[] {
    if (!/(export|ekspor|unduh|simpan|keluarkan)/i.test(text)) { return []; }
    const hasil: { pos: number; step: SpiderStep }[] = [];
    for (const jenis of JENIS_EXPORT) {
        const m = jenis.pola.exec(text);
        if (!m) { continue; }
        const t = pickTarget(jenis.target, targets, preferIds, text);
        if (!t || !t.click || t.danger) { continue; }
        hasil.push({
            pos: m.index,
            step: {
                say: `Menekan ${rapikanLabel(t.label)} untuk export ${jenis.nama} — sesuai perintah.`,
                goto: t.id,
                highlight: true,
                action: 'click',
                hold: 1200,
            },
        });
    }
    return hasil;
}

/**
 * Posisi maksud aksi di dalam kalimat perintah — dipakai agar langkah dieksekusi menurut urutan
 * penyebutan pengguna, bukan menurut urutan tabel maksud. Hanya pola “minta” yang menentukan
 * apakah sebuah maksud dianggap diminta (sama seperti perilaku sebelumnya).
 */
function posisiMinta(text: string, intent: ActionIntent): number {
    const m = intent.minta.exec(text);
    return m ? m.index : -1;
}

/**
 * Susun langkah aksi nyata dari maksud perintah — inti perilaku “langsung eksekusi”.
 * Langkah diurutkan menurut urutan penyebutan di instruksi, dan dipakai lagi untuk memperkuat
 * rencana dari model (hardenPlan).
 */
export function actionSteps(request: string, targets: SpiderTarget[], maxSteps = 8, preferIds: Set<string> = new Set()): SpiderStep[] {
    const text = String(request || '');
    if (!text.trim() || !targets.length) { return []; }
    const imperative = IMPERATIVE.test(text);
    const nilai = nilaiDiminta(text);
    const langkah: SpiderStep[] = [];
    const dipakai = new Set<string>();

    const push = (t: SpiderTarget, action: SpiderActionKind, say: string, value?: string) => {
        if (dipakai.has(t.id) || langkah.length >= maxSteps) { return; }
        dipakai.add(t.id);
        const pakaiAksi: SpiderActionKind | undefined = action === 'click' && t.kind === 'tab' ? 'tab' : action;
        langkah.push({ say, goto: t.id, highlight: true, action: pakaiAksi, value, hold: 1200 });
    };

    const maksud: { step: SpiderStep; pos: number }[] = [];
    // Export spesifik (mis. “export python lalu export json”) ditangani satu per satu, urut sebutan.
    const exportSpesifik = sebutanExport(text, targets, preferIds);
    for (const e of exportSpesifik) { maksud.push({ step: e.step, pos: e.pos }); }
    for (const intent of ACTION_INTENTS) {
        // Maksud export umum dilewati bila jenis exportnya sudah disebut spesifik — supaya tidak dobel
        // dan supaya urutannya mengikuti penyebutan pengguna.
        if (exportSpesifik.length && intent.id.startsWith('export')) { continue; }
        const pos = posisiMinta(text, intent);
        if (pos < 0) { continue; }
        // Aksi berbahaya hanya sah bila pengguna menyebutnya sendiri.
        if (intent.danger && !(intent.sebut ? intent.sebut.test(text) : true)) { continue; }
        const t = pickTarget(intent.target, targets, preferIds, text);
        if (!t || !t.click) { continue; }
        if (intent.danger && !imperative) { continue; }
        const value = intent.action === 'select' || intent.action === 'input' ? (nilai || t.value) : undefined;
        const pakaiAksi: SpiderActionKind = intent.action === 'click' && t.kind === 'tab' ? 'tab' : intent.action;
        maksud.push({
            pos,
            step: { say: `Baik, aku ${intent.aksi || 'menjalankan'} — ${t.label.replace(/^tombol:\s*/i, '')}.`, goto: t.id, highlight: true, action: pakaiAksi, value, hold: 1200 },
        });
    }
    // Urutan eksekusi mengikuti urutan penyebutan pada instruksi pengguna.
    maksud.sort((a, b) => a.pos - b.pos);
    for (const m of maksud) {
        const t = targets.find((x) => x.id === m.step.goto);
        if (t && m.step.action) { push(t, m.step.action, m.step.say, m.step.value); }
    }

    // “Export semua sekaligus”: satu perintah, banyak klik — tekan setiap tombol export di halaman.
    if (/(export|ekspor|unduh|simpan)/i.test(text) && /(semua|seluruh|sekaligus|keseluruhan)/i.test(text)) {
        const tombolExport = targets.filter((t) => t.click && !t.danger && /export|unduh/i.test(targetText(t)));
        for (const t of tombolExport) {
            push(t, 'click', `Menekan ${rapikanLabel(t.label)} — sekaligus dalam satu perintah.`);
        }
    }

    // Perintah imperatif tanpa maksud yang dikenali: tekan kontrol yang paling cocok dengan kalimat.
    if (!langkah.length && imperative) {
        const utama = matchTarget(text, targets);
        if (utama && utama.click) {
            push(utama, utama.kind === 'tab' ? 'tab' : 'click', `Baik, aku jalankan ${utama.label.replace(/^tombol:\s*/i, '')}.`);
        }
    }

    return langkah;
}

/** Ubah satu langkah mentah (bisa string atau objek bersinonim) menjadi format baku. */
function normalizeStep(raw: unknown, targets: SpiderTarget[]): SpiderStep | undefined {
    let obj: any = raw;
    if (typeof raw === 'string') { obj = { say: raw }; }
    if (!obj || typeof obj !== 'object') { return undefined; }
    const say = String(obj.say ?? obj.text ?? obj.message ?? obj.explain ?? obj.penjelasan ?? '').trim();
    const gotoRaw = obj.goto ?? obj.target ?? obj.move ?? obj.focus ?? obj.to ?? obj.arah;
    let goto = typeof gotoRaw === 'string' ? gotoRaw.trim() : '';
    if (goto && !targets.some((t) => t.id === goto)) {
        goto = matchTarget(goto, targets)?.id || '';
    }
    const aksiRaw = String(obj.action ?? obj.aksi ?? obj.do ?? '').toLowerCase();
    const petaAksi: Record<string, SpiderActionKind> = {
        click: 'click', klik: 'click', tekan: 'click', press: 'click', tap: 'click',
        tab: 'tab', ganti_tab: 'tab', filter: 'tab',
        select: 'select', pilih: 'select', dropdown: 'select',
        input: 'input', ketik: 'input', type: 'input', isi: 'input', fill: 'input',
        focus: 'focus', sorot: 'focus', highlight: 'focus',
        scroll: 'scroll', gulir: 'scroll',
        hover: 'hover', arahkan: 'hover',
    };
    let action: SpiderActionKind | undefined = petaAksi[aksiRaw];
    if ((obj.click === true || obj.klik === true) && !action) { action = 'click'; }
    const valueRaw = obj.value ?? obj.nilai ?? obj.text_value ?? obj.isi;
    const value = typeof valueRaw === 'string' ? valueRaw.slice(0, 200) : undefined;

    const target = goto ? targets.find((t) => t.id === goto) : undefined;
    // Aksi hanya sah bila targetnya kontrol yang boleh dijalankan. Target berbahaya tidak pernah
    // boleh menghidupkan aksinya sendiri dari kata-kata model — hanya permintaan pengguna yang
    // dapat mengizinkannya (lihat hardenPlan).
    if (action && (!target || !target.click)) { action = undefined; }
    if (action && target?.danger) { action = undefined; }
    if (!say && !goto) { return undefined; }
    return {
        say: say.slice(0, 600),
        goto: goto || undefined,
        highlight: obj.highlight === undefined ? !!goto : !!obj.highlight,
        action,
        value: action === 'select' || action === 'input' ? value : undefined,
        hold: clamp(Number(obj.hold ?? obj.ms ?? obj.delay ?? 1400) || 1400, 400, 6000),
    };
}


/** Perbaikan ringan JSON dari model kecil: kutip miring dan koma menggantung. */
function repairJson(teks: string): string {
    return teks.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1');
}

/**
 * Baca rencana dari balasan model.
 * - JSON murni maupun JSON yang tersisip di teks diterima, termasuk yang berpagar kode.
 * - Bila model menjawab tanpa langkah ("steps": [] atau hanya "reply"), rencana tetap dianggap sah:
 *   pet hanya menjelaskan — aksi TIDAK ditebak-nebak dari kalimatnya.
 * - Baris teks hanya dijadikan langkah bila benar-benar cocok dengan target halaman (minimal 2),
 *   supaya pet tidak berjalan ke bagian yang tidak diminta.
 */
export function parseSpiderPlan(text: string, targets: SpiderTarget[], maxSteps = 8): SpiderPlan | undefined {
    const raw = String(text || '').trim();
    if (!raw) { return undefined; }

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
        const candidate = repairJson(raw.slice(start, end + 1));
        try {
            const json = JSON.parse(candidate);
            const kandidat: unknown[] = Array.isArray(json.steps) ? json.steps
                : Array.isArray(json.langkah) ? json.langkah
                    : Array.isArray(json.aksi) ? json.aksi
                        : Array.isArray(json.plan) ? json.plan
                            : (json.steps && typeof json.steps === 'object' ? [json.steps] : []);
            const steps = kandidat
                .map((s) => normalizeStep(s, targets))
                .filter((s): s is SpiderStep => !!s)
                .slice(0, maxSteps);
            const reply = String(json.reply ?? json.pesan ?? json.intro ?? json.jawaban ?? json.text ?? '').trim().slice(0, 1200);
            if (steps.length || reply) {
                return { reply, steps, source: 'llm' };
            }
        } catch { /* bukan JSON valid → coba baris teks di bawah */ }
    }

    // Cadangan baris teks: hanya langkah yang targetnya benar-benar dikenali.
    const lines = raw
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter((l) => l.length > 12 && !/^```/.test(l));
    const cocok: SpiderStep[] = [];
    for (const line of lines) {
        const target = matchTarget(line, targets);
        if (!target) { continue; }
        cocok.push({ say: line.slice(0, 600), goto: target.id, highlight: true, hold: 1400 });
        if (cocok.length >= maxSteps) { break; }
    }
    if (cocok.length >= 2) { return { reply: '', steps: cocok, source: 'llm' }; }
    // Tidak cukup yakin: perlakukan sebagai jawaban biasa (tanpa aksi) agar pet tidak berkeliaran.
    const bersih = raw.replace(/```[a-z]*/gi, '').replace(/\s+/g, ' ').trim();
    return bersih.length >= 12 ? { reply: bersih.slice(0, 1200), steps: [], source: 'llm' } : undefined;
}

/**
 * Apakah kontrol ini benar-benar disebut pada perintah pengguna (kecocokan kata label ≥5 huruf).
 * Dipakai agar rencana dari model tidak ditambahi aksi yang tidak diminta.
 */
function disebutDiPerintah(request: string, target: SpiderTarget): boolean {
    const kata = tokens(request);
    if (!kata.length) { return false; }
    const teks = `${target.label} ${target.id}`.toLowerCase();
    return kata.some((k) => k.length >= 5 && teks.includes(k));
}

/**
 * Perkuat rencana: pastikan langkah yang menuju kontrol benar-benar dieksekusi.
 * - langkah tanpa `action` yang cocok dengan maksud perintah diberi aksi;
 * - langkah berbahaya tanpa penyebutan eksplisit diturunkan menjadi sorot saja dan dilaporkan;
 * - bila belum ada satu pun aksi padahal perintahnya imperatif, langkah aksi disisipkan di akhir.
 */
export function hardenPlan(request: string, plan: SpiderPlan, targets: SpiderTarget[], maxSteps: number): SpiderPlan {
    const langkahBersih: SpiderStep[] = [];
    const kunciGanda = new Set<string>();
    for (const s of plan.steps) {
        const salinan = { ...s };
        // Langkah kembar (target + aksi sama) dibuang agar tidak menekan kontrol yang sama dua kali.
        const kunci = `${salinan.goto || ''}|${salinan.action || ''}`;
        if (salinan.goto && kunciGanda.has(kunci)) { continue; }
        if (salinan.goto) { kunciGanda.add(kunci); }
        langkahBersih.push(salinan);
    }
    const steps = langkahBersih;
    const idTarget = new Set(steps.map((s) => s.goto).filter((x): x is string => !!x));
    const dipsakaiUntukAksi = new Set(steps.filter((s) => s.action).map((s) => s.goto).filter((x): x is string => !!x));
    const catatan: string[] = [];
    // Pertanyaan tidak pernah memicu aksi tambahan, walau memuat kata seperti “buka”.
    const imperative = IMPERATIVE.test(request) && !isQuestionRequest(request);

    // Maksud perintah → aksi wajib.
    const wajib = actionSteps(request, targets, maxSteps, idTarget);
    const wajibById = new Map(wajib.map((s) => [s.goto as string, s]));

    for (const s of steps) {
        const target = s.goto ? targets.find((t) => t.id === s.goto) : undefined;
        if (!target) { continue; }
        const bahayaDiminta = target.danger ? adaPermintaanBahaya(request, target) : false;
        if (target.danger) {
            if (s.action && !bahayaDiminta) { s.action = undefined; s.value = undefined; }
            // Model ingin melakukan sesuatu yang mengubah data padahal pengguna tidak memintanya.
            if (!bahayaDiminta && /(tekan|klik|hapus|buang|bersihkan|reset|kembalikan|muat ulang|segarkan|hentikan|stop)/i.test(s.say || '')) {
                catatan.push(`Aksi pada “${target.label.replace(/^tombol:\s*/i, '')}” tidak dijalankan karena bisa mengubah/menghapus data — sebutkan perintahnya bila memang ingin dijalankan.`);
            }
        }
        if (!s.action && s.goto) {
            const harus = wajibById.get(s.goto);
            if (harus?.action && imperative && (!target.danger || bahayaDiminta)) {
                // input/select tanpa nilai tidak pernah dihidupkan: kolom kosong hanya bikin gagal palsu.
                const butuhNilai = harus.action === 'input' || harus.action === 'select';
                if (!butuhNilai || String(harus.value ?? s.value ?? '').trim()) {
                    s.action = harus.action;
                    s.value = harus.value ?? s.value;
                    dipsakaiUntukAksi.add(s.goto);
                }
            }
        }
    }

    // Aksi yang belum tercakup langkah mana pun → tambahkan HANYA bila kontrolnya memang disebut
    // pengguna, supaya pet tidak menekan/mengisi kontrol yang tidak diminta.
    for (const s of wajib) {
        const id = s.goto as string;
        if (dipsakaiUntukAksi.has(id)) { continue; }
        if (steps.length >= maxSteps) { break; }
        const target = targets.find((t) => t.id === id);
        if (!target || !disebutDiPerintah(request, target)) { continue; }
        if ((s.action === 'input' || s.action === 'select') && !String(s.value ?? '').trim()) { continue; }
        steps.push({ ...s, say: s.say || `Aku lanjutkan: ${rapikanLabel(target.label)}.` });
        dipsakaiUntukAksi.add(id);
    }

    if (catatan.length) {
        plan = { ...plan, note: [plan.note, ...catatan].filter(Boolean).join(' ') };
    }
    return { ...plan, steps: steps.slice(0, maxSteps) };
}

/**
 * Tur otomatis menyeluruh: menyusuri setiap bagian halaman berurutan, lalu menekan/mengubah setiap
 * kontrol aman di bagian itu. Kontrol berbahaya hanya disorot dan dilaporkan (tidak ditekan).
 */
export function planAutoTour(req: SpiderRequest): SpiderPlan {
    const targets = req.targets;
    const bagian = targets.filter((t) => t.kind === 'section');
    const kontrol = targets.filter((t) => t.click && t.kind !== 'section');
    const steps: SpiderStep[] = [];
    const sudah = new Set<string>();
    const ditahan: string[] = [];

    const tambah = (s: SpiderStep) => {
        if (steps.length >= Math.max(6, req.maxSteps * 4)) { return; }
        steps.push(s);
    };

    /** Label rapi untuk diucapkan: buang awalan teknis seperti "tombol: ". */
    const rapikan = (label: string) => String(label || '').replace(/^(tombol|tautan|tab|kartu|kolom):\s*/i, '').trim();

    const grupOrder: { id: string; label: string; kontrol: SpiderTarget[] }[] = bagian.map((sec) => ({
        id: sec.id,
        label: rapikan(sec.label).replace(/^[a-z0-9_-]+\s*—\s*/i, ''),
        kontrol: kontrol.filter((k) => k.group && k.group === sec.id),
    }));
    const tanpaGrup = kontrol.filter((k) => !k.group || !bagian.some((b) => b.id === k.group));
    if (tanpaGrup.length) { grupOrder.push({ id: '__lain', label: 'kontrol halaman', kontrol: tanpaGrup }); }

    for (const grup of grupOrder) {
        if (grup.id !== '__lain') {
            tambah({ say: `Aku mulai dari bagian ${grup.label}.`, goto: grup.id, highlight: true, hold: 900 });
        } else {
            tambah({ say: 'Lanjut ke kontrol halaman yang lain.', hold: 400 });
        }
        for (const k of grup.kontrol) {
            if (sudah.has(k.id)) { continue; }
            sudah.add(k.id);
            const nama = rapikan(k.label);
            if (k.danger) {
                ditahan.push(nama);
                tambah({ say: `Tombol ${nama} tidak aku tekan karena bisa mengubah atau menghapus data — sebutkan perintahnya kalau memang mau dijalankan.`, goto: k.id, highlight: true, hold: 700 });
                continue;
            }
            const aksi: SpiderActionKind = k.kind === 'tab' ? 'tab' : k.kind === 'input' || k.kind === 'select' ? (k.kind as SpiderActionKind) : 'click';
            tambah({ say: `Menekan ${nama}.`, goto: k.id, highlight: true, action: aksi, value: k.value, hold: 1000 });
        }
    }

    const catatan = ditahan.length
        ? `Tur selesai menyusuri seluruh bagian. ${ditahan.length} tombol berisiko perubahan data dilewati: ${ditahan.slice(0, 4).join(', ')}${ditahan.length > 4 ? ', …' : ''}.`
        : 'Tur selesai menyusuri seluruh bagian halaman dan menjalankan semua kontrol aman.';

    return {
        reply: `Siap! Aku jalankan tur otomatis: menyusuri ${grupOrder.length} bagian dan mengerjakan ${sudah.size} kontrol yang ada di halaman ini.`,
        steps,
        source: 'local',
        tour: true,
        note: catatan,
    };
}

/** Rencana klik tombol (mis. “export ke python”) tanpa perlu LLM. */
function localExportSteps(req: SpiderRequest): SpiderStep[] | undefined {
    if (!EXPORT_HINT.test(req.request)) { return undefined; }
    const tombol = req.targets.filter((t) => t.click && /export|unduh|python|docx|pdf|xlsx|pptx|workflow/i.test(`${t.id} ${t.label}`));
    if (!tombol.length) { return undefined; }

    const pilihan: SpiderTarget[] = [];
    for (const jenis of ACTION_INTENTS.filter((i) => i.id.startsWith('export') && i.id !== 'export-any')) {
        if (!jenis.minta.test(req.request)) { continue; }
        const hit = tombol.find((t) => jenis.target.test(targetText(t)));
        if (hit && !pilihan.includes(hit)) { pilihan.push(hit); }
    }
    const daftar = pilihan.length ? pilihan : [tombol[0]];

    const steps: SpiderStep[] = [];
    for (const t of daftar) {
        const nama = t.label.replace(/^tombol:\s*/i, '');
        steps.push({ say: `Aku berjalan ke tombol ${nama} dulu.`, goto: t.id, highlight: true, hold: 900 });
        steps.push({ say: 'Sekarang aku tekan tombolnya — prosesnya berjalan dan hasilnya muncul di notifikasi serta folder berkas sumber.', action: 'click', goto: t.id, hold: 1200 });
    }
    return steps;
}

/** Rencana cadangan tanpa LLM: jelaskan dari baris fakta hasil analisis + jalankan aksi yang diminta. */
export function localSpiderPlan(req: SpiderRequest): SpiderPlan {
    if (TOUR_HINT.test(req.request)) { return planAutoTour(req); }

    const exportSteps = localExportSteps(req);
    const aksi = actionSteps(req.request, req.targets, req.maxSteps);
    if (exportSteps) {
        return {
            reply: 'Baik, aku kerjakan langsung di halaman ini.',
            steps: exportSteps,
            source: 'local',
            note: 'Dijalankan tanpa model: aku menekan tombol yang ada di halaman. Nyalakan ▶ di sidebar Chat AI agar aku bisa menjelaskan dengan angka juga.',
        };
    }

    const kata = new Set(tokens(req.request));
    const pilihan: string[] = [];
    for (const baris of req.facts) {
        const bersih = String(baris || '').replace(/^\s*-\s*/, '').trim();
        if (!bersih || bersih.startsWith('===')) { continue; }
        if (tokens(bersih).some((t) => kata.has(t))) { pilihan.push(bersih); }
        if (pilihan.length >= req.maxSteps) { break; }
    }
    if (!pilihan.length) {
        for (const baris of req.facts) {
            const bersih = String(baris || '').replace(/^\s*-\s*/, '').trim();
            if (!bersih || bersih.startsWith('===')) { continue; }
            pilihan.push(bersih);
            if (pilihan.length >= Math.min(5, req.maxSteps)) { break; }
        }
    }

    const steps: SpiderStep[] = pilihan.map((teks) => {
        const target = matchTarget(`${req.request} ${teks}`, req.targets);
        return {
            say: teks.slice(0, 600),
            goto: target?.id,
            highlight: !!target,
            hold: 1500,
        };
    });

    const catatan = req.running
        ? 'Jawaban model tidak bisa dibaca, jadi penjelasan ini disusun langsung dari angka analisis.'
        : 'llama-server belum berjalan, jadi penjelasan ini disusun langsung dari angka analisis. Nyalakan ▶ di sidebar Chat AI agar spider bisa menjawab lebih luwes.';

    // Perintah imperatif tetap dieksekusi walau penjelasan diambil dari mode lokal.
    const sudahAda = new Set(steps.filter((s) => s.action).map((s) => s.goto));
    for (const s of aksi) {
        if (steps.some((x) => x.goto === s.goto && x.action) || sudahAda.has(s.goto)) { continue; }
        steps.push(s);
        if (steps.length >= req.maxSteps + 3) { break; }
    }

    return {
        reply: `Oke, aku tunjukkan bagian yang paling berkaitan dengan permintaanmu. (${catatan})`,
        steps,
        source: 'local',
        note: aksi.length ? `${catatan} Aksi pada halaman ikut aku jalankan.` : catatan,
    };
}

/** Anggaran karakter prompt berdasarkan jendela konteks model (1 token ≈ 2,6 karakter). */
export function promptBudgetChars(contextSize?: number): number {
    const ctx = Math.max(1024, Math.round(contextSize || 4096));
    return Math.max(900, Math.round((ctx - 1400) * 2.6));
}

function buildSystemPrompt(req: SpiderRequest, budget: PromptBudget): string {
    // Konteks data DIJAMIN minimal ±45% anggaran: kalau daftar target terlalu panjang, daftarnya
    // yang dipangkas — bukan konteksnya. (Dulu daftar besar membuat konteks tersisa ratusan karakter
    // saja, sehingga model menjawab “belum tersedia dalam konteks data yang diberikan”.)
    const batasDaftar = Math.max(600, Math.floor(budget.summaryChars * 0.5));
    const barisTarget: string[] = [];
    let terpakai = 0;
    for (const t of req.targets.slice(0, budget.targetLimit)) {
        const baris = `${t.id} | ${String(t.label).slice(0, budget.labelChars)}${t.click ? ` [bisa dijalankan${t.danger ? ', mengubah data' : ''}]` : ''}`;
        if (terpakai + baris.length + 1 > batasDaftar) { break; }
        barisTarget.push(baris);
        terpakai += baris.length + 1;
    }
    const daftar = barisTarget.join('\n');
    const sisaUntukKonteks = Math.max(
        500,
        Math.floor(budget.summaryChars * 0.45),
        budget.summaryChars - daftar.length - 900,
    );
    const konteks = req.summary.slice(0, sisaUntukKonteks);

    return [
        'Kamu adalah "Spider", pet eksekutor yang hidup di panel visualisasi analisis data pada ekstensi VS Code "Date Skunder".',
        'Pembagian peran: Chat AI hanya bercakap-cakap; kamulah yang menjalankan aksi di halaman dan menjelaskan hasil kerjamu dengan tepat.',
        'Tentukan dulu jenis permintaannya (satu saja):',
        '· PERINTAH AKSI — pengguna menyuruh menekan/membuka/memindah tab/mengisi/mengurutkan/export → susun langkah dengan "action" yang benar.',
        '· PERTANYAAN / ANALISIS — pengguna bertanya, minta penjelasan, minta analisa, atau membandingkan angka → JAWAB di "reply" dan JANGAN menekan atau mengklik apa pun ("steps": []). Menyorot satu bagian bukti boleh, tanpa "action".',
        '· DI LUAR KONTEKS DATA — pertanyaan umum, teori, alat, kode, atau sapaan → tetap JAWAB dengan benar dan ringkas di "reply", tandai bahwa itu penjelasan umum (bukan angka dari data ini), dan "steps": []. Jangan menolak hanya karena di luar konteks, dan jangan mengarang.',
        '',
        'CARA BERPIKIR (lakukan diam-diam; yang keluar hanya JSON):',
        '1. Pecah perintah aksi menjadi perintah-perintah kecil: setiap verba (tekan/buka/pindah/ketik/urutkan/export/sorot) = satu perintah.',
        '2. Untuk tiap perintah, bandingkan DAFTAR TARGET (label + jenisnya) lalu pilih SATU id yang paling tepat — jangan menebak dan jangan mengarang id.',
        '3. Tentukan "action" dari verba itu: tekan/buka/jalankan → "click"; pindah tab/filter → "tab"; pilih/ubah dropdown → "select"; ketik/isi → "input"; hanya menyorot → "focus".',
        '4. Urutkan langkah sesuai urutan penyebutan pada instruksi pengguna, satu perintah satu langkah, tanpa target yang sama dua kali.',
        '5. Periksa ulang: semua bagian instruksi sudah terwakili? ada id yang bukan dari daftar? ada angka yang tidak ada di KONTEKS DATA? Perbaiki sebelum menjawab.',
        '',
        'Untuk PERINTAH AKSI, kamu WAJIB mengeksekusi (menekan tombol, membuka bagian, mengganti tab filter, mengurutkan tabel, menambah grafik, mengetik pencarian, export, membuka tautan) — langkah seperti itu harus punya "action".',
        'Untuk PERTANYAAN, JANGAN mengeksekusi apa pun: tidak menekan tombol, tidak memindah tab, tidak mengisi kolom. Jawab di "reply" (boleh 2–5 baris; awali tiap poin dengan "• "). Kalau pengguna menyebut angka yang tidak ada, sebut angka yang ADA dan apa yang perlu dihitung — jangan menjawab “belum tersedia dalam konteks data”.',
        'Tulis "reply" seakurat mungkin: satu baris satu gagasan, langsung ke poin, tanpa basa-basi, tanpa mengulang instruksi pengguna, dan tanpa mengulas percakapan sebelumnya.',
        'JANGAN menarasikan aktivitas mekanis. Untuk langkah beraksi, "say" WAJIB string kosong (""); eksekusi berjalan tanpa narasi. Dilarang menulis “aku berjalan ke…”, “aku menekan tombol…”, “sekarang aku klik…”. Isi "say" hanya bila satu langkah perlu penjelasan singkat (maksimal 12 kata).',
        'DAFTAR TARGET memuat SEMUA kontrol halaman: tombol (termasuk tombol export jurnal/Excel/PPT/flow/JSON/Python), tautan, tab filter, kolom isian pencarian, dropdown, kolom sortir, catatan, dan chart builder. Pakai id-nya apa adanya — jangan mengarang id atau bagian yang tidak ada di daftar.',
        'Balas HANYA dengan JSON valid (tanpa penjelasan tambahan, tanpa blok kode) dengan bentuk:',
        '{"reply":"jawaban/pembuka singkat maksimal 3 kalimat, boleh memuat angka","steps":[{"say":"penjelasan langkah ini","goto":"id-target","highlight":true,"action":"click","value":"","hold":1400}]}',
        'Jangan menulis kalimat apa pun di luar JSON itu. Bila instruksinya TIDAK memerlukan aksi di halaman, balas dengan "steps": [] dan jelaskan jawabannya di "reply" — lebih baik tanpa langkah daripada langkah asal-asalan.',
        budget.strictJson ? 'Mode JSON ketat: balasan harus dimulai dengan { dan diakhiri } — tanpa teks, tanpa markdown, tanpa komentar.' : '',
        'Nilai "action" yang boleh dipakai: "click" (tekan tombol/tautan), "tab" (pindah tab filter), "select" (ubah dropdown), "input" (ketik ke kolom isian), "focus" (sorot saja tanpa menjalankan), "scroll", "hover". Bila tanpa "action", langkah hanya menyorot.',
        `Aturan penting: isi langkah HANYA untuk perintah aksi (0 langkah sah untuk pertanyaan); nilai "goto" WAJIB salah satu id dari DAFTAR TARGET di bawah; gunakan angka dari KONTEKS DATA; jangan mengarang angka atau bagian yang tidak ada; "hold" 800–3000 (milidetik).`,
        'Jangan memakai id yang sama dua kali kecuali benar-benar diminta berulang, dan jangan menulis langkah yang hanya mengulang langkah sebelumnya dengan kata berbeda.',
        'Bila tidak ada satu pun target yang cocok untuk sebuah perintah, katakan di "reply" bagian mana yang belum ada padanannya — jangan mengarang target atau mengklik bagian lain sebagai gantinya.',
        'Isi "value" hanya untuk action "select"/"input" (nilai yang diminta pengguna).',
        'Target yang mengubah atau menghapus data pengguna hanya boleh dijalankan bila pengguna menyebutnya sendiri pada instruksinya.',
        'Bila permintaan tidak bisa dipenuhi dari data yang ada, katakan terus terang di "reply" apa yang tersedia dan apa yang belum — bukan menolak menjawab.',
        'Angka turunan BOLEH dihitung dari KONTEKS DATA (selisih, persen, rata-rata, jumlah) — tulis rumus singkatnya. JANGAN menjawab “belum tersedia dalam konteks data” bila angkanya bisa dihitung dari konteks yang ada.',
        'Bila pengguna menyuruh mencari/mengetik sesuatu (mis. “cari indomie”), langkah "input" WAJIB memuat "value" berisi teks yang dicari — jangan mengosongkannya.',
        '',
        'DAFTAR TARGET (id | label | keterangan):',
        daftar,
        '',
        'KONTEKS DATA:',
        konteks,
    ].filter((l) => l !== '').join('\n');
}

/** Minta rencana ke model dengan anggaran prompt tertentu; undefined bila balasan tidak bisa dibaca. */
async function askLlm(req: SpiderRequest, budget: PromptBudget): Promise<SpiderPlan | undefined> {
    const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(req, budget) },
        {
            role: 'user',
            content: `Instruksi: ${req.request}\nBerkas: ${req.fileName} · Sheet: ${req.sheetName}\nJawab hanya dengan JSON sesuai bentuk yang diminta.`,
        },
    ];
    const handle = chatStream({
        port: req.port,
        messages,
        temperature: req.temperature,
        maxTokens: budget.maxTokens,
        onDelta: () => { /* rencana diambil setelah selesai */ },
    });
    const full = await handle.done;
    return parseSpiderPlan(full, req.targets, clamp(req.maxSteps, 3, 12));
}

function pesanSingkat(e: unknown): string {
    const teks = e instanceof Error ? e.message : String(e);
    if (/context size|exceeds/i.test(teks)) {
        return 'percobaan pertama melebihi jendela konteks model — naikkan dateSkunder.llama.contextSize bila ingin penjelasan lebih panjang';
    }
    return teks.slice(0, 160);
}

/**
 * Pertanyaan → semua aksi diturunkan menjadi sorotan saja (tanpa menekan/mengisi apa pun).
 * Ini gerbang terakhir selain instruksi prompt: model kecil kadang tetap menyusun klik untuk
 * pertanyaan, dan pengguna meminta pertanyaan dijawab tanpa eksekusi.
 */
function softenQuestionPlan(plan: SpiderPlan): SpiderPlan {
    const steps = plan.steps
        .filter((s) => !!s.goto)
        .slice(0, 2)
        .map((s) => ({ ...s, action: undefined, value: undefined, highlight: true }));
    return { ...plan, steps };
}

/** Jawaban penolakan khas model kecil (“belum tersedia dalam konteks data”) diganti jawaban jujur berangka. */
const REFUSAL_RE = /belum tersedia (dalam|di) konteks data|tidak tersedia (dalam|di) (konteks )?data|tidak ada (dalam|di) konteks data/i;
function repairRefusal(req: SpiderRequest, plan: SpiderPlan): SpiderPlan {
    if (!REFUSAL_RE.test(plan.reply)) { return plan; }
    if ((plan.reply.match(/\d/g) || []).length >= 2) { return plan; }
    const fakta = req.facts
        .map((f) => String(f || '').replace(/^\s*[-•]\s*/, '').trim())
        .filter((f) => f && !f.startsWith('===') && /\d/.test(f))
        .slice(0, 3);
    const balasan = [
        'Angka yang kamu sebut tidak ada di data ini, jadi tidak aku karang.',
        ...fakta.map((f) => `• ${f.slice(0, 220)}`),
        fakta.length ? '' : '• Belum ada angka analisis yang bisa kutampilkan untuk berkas ini.',
        'Sebutkan angka turunan yang mau dihitung (selisih, persen, rata-rata, jumlah) supaya bisa aku hitung dari data yang ada.',
    ].filter(Boolean);
    return { ...plan, reply: balasan.join('\n') };
}

/** Titik masuk: rencana SELALU disusun otak model (llama-server). Tanpa otak model, pet mengaku
 *  terus terang dan tidak menjalankan template apa pun. */
export async function buildSpiderPlan(req: SpiderRequest): Promise<SpiderPlan> {
    // “Jalankan semua fitur” tidak perlu model: tur otomatis sudah pasti dan terurut.
    if (TOUR_HINT.test(req.request)) { return planAutoTour(req); }

    // Otak model wajib untuk instruksi biasa: tanpa llama-server pet tidak menebak-nebak lewat template.
    if (!req.running) {
        return {
            reply: 'Otak model (llama-server) belum berjalan, jadi aku belum bisa menyusun langkah yang benar-benar sesuai perintahmu. Nyalakan ▶ dulu di Chat AI atau view “LLAMA Server”, lalu tulis lagi perintahnya — setelah itu seluruh langkah dan penjelasanku disusun otak model, bukan template.',
            steps: [],
            source: 'llm',
            note: 'Otak model belum aktif: tidak ada langkah template yang dijalankan.',
            needsBrain: true,
        };
    }

    const maxSteps = clamp(req.maxSteps, 3, 12);
    const budget = promptBudgetChars(req.contextSize);
    // “Otak penuh”: rencana dan penjelasan langkah disusun model dengan konteks data seluas mungkin
    // (sesuai dateSkunder.llama.contextSize), bukan ringkasan pendek.
    const lapis1: PromptBudget = {
        targetLimit: 56,
        labelChars: 64,
        summaryChars: clamp(budget - 2200, 900, 8000),
        maxTokens: req.maxTokens > 0 ? Math.min(req.maxTokens, 900) : 900,
    };
    const lapis2: PromptBudget = { targetLimit: 24, labelChars: 48, summaryChars: 1400, maxTokens: 520 };
    const lapis3: PromptBudget = { targetLimit: 12, labelChars: 40, summaryChars: 700, maxTokens: 400, strictJson: true };

    const pakai = (plan: SpiderPlan, catatan?: string) => {
        const pertanyaan = isQuestionRequest(req.request);
        if (!plan.reply) {
            plan.reply = pertanyaan
                ? 'Model belum memberi jawaban yang bisa dibaca. Coba tulis pertanyaannya lebih singkat — tidak ada aksi halaman yang kujalankan.'
                : 'Siap, aku kerjakan langsung di halaman ini.';
        }
        if (catatan) { plan.note = [plan.note, catatan].filter(Boolean).join(' '); }
        let hasil = hardenPlan(req.request, plan, req.targets, maxSteps);
        if (pertanyaan) { hasil = softenQuestionPlan(hasil); }
        return repairRefusal(req, hasil);
    };

    let galat: unknown;
    for (const lapis of [lapis1, lapis2, lapis3]) {
        try {
            const plan = await askLlm(req, lapis);
            if (plan) {
                return pakai(plan, lapis === lapis1 ? undefined
                    : `Rencana disusun ulang dengan konteks ${lapis === lapis2 ? 'ringkas' : 'sangat ringkas (JSON ketat)'}.`);
            }
        } catch (e) {
            if (!galat) { galat = e; }
        }
    }

    // Otak model aktif tetapi balasannya tetap tidak terbaca: jujur, tanpa aksi tebakan.
    return {
        reply: 'Balasan otak model belum bisa kubaca sebagai rencana kali ini, jadi aku tidak menjalankan aksi apa pun supaya tidak salah tekan. Coba tulis perintahnya lebih singkat, atau periksa apakah model .gguf sudah termuat dengan benar.',
        steps: [],
        source: 'llm',
        note: galat ? `Percobaan otak model gagal: ${pesanSingkat(galat)}` : 'Balasan model tidak bisa dibaca sebagai rencana.',
    };
}

// ── penjelasan hasil eksekusi oleh otak model penuh ─────────────────────────

/** Satu langkah yang sudah dijalankan, seperti dilaporkan pet dari halaman. */
export interface SpiderRunStep {
    say?: string;
    target?: string;
    action?: string | null;
    ok?: boolean;
    detail?: string;
}

export interface SpiderExplainRequest {
    request: string;
    fileName: string;
    sheetName: string;
    /** Konteks statistik berkas (seluas mungkin) supaya penjelasan berlandaskan angka nyata. */
    summary: string;
    /** Laporan langkah hasil eksekusi pet di halaman. */
    steps: SpiderRunStep[];
    port: number;
    temperature: number;
    maxTokens: number;
    contextSize?: number;
}

/**
 * Setelah pet selesai mengeksekusi rencana di halaman, otak model penuh (llama-server) yang menulis
 * penjelasannya: apa yang dikerjakan, hasil yang berhasil/gagal, dan maknanya bagi data pengguna.
 * undefined = model tidak menjawab (server belum berjalan atau balasan kosong); pemanggil yang
 * memberi tahu pengguna apa adanya — tidak ada penjelasan template.
 */
export async function explainSpiderRun(req: SpiderExplainRequest): Promise<string | undefined> {
    const langkah = (req.steps || []).slice(0, 24);
    if (!langkah.length) { return undefined; }
    const daftar = langkah
        .map((s, i) => {
            const status = s.ok === false ? '✗ gagal' : '✓ berhasil';
            const aksi = s.action ? ` [${String(s.action)}]` : '';
            const target = s.target ? ` “${String(s.target).slice(0, 80)}”` : '';
            const detail = s.detail ? ` — ${String(s.detail).slice(0, 160)}` : '';
            return `${i + 1}. ${status}${aksi}${target}${detail}`;
        })
        .join('\n');
    const konteks = String(req.summary || '').slice(0, 7000);
    const permintaan = String(req.request || '').trim().slice(0, 300);
    const system = [
        'Kamu adalah "Spider", pet eksekutor yang hidup di panel analisis data pada ekstensi VS Code "Date Skunder".',
        'Chat AI hanya untuk percakapan; kamulah yang menjalankan aksi di halaman — dan penjelasan hasil kerja ini ditulis oleh otak model penuh (kamu), bukan mode lokal.',
        'Kamu baru saja menjalankan instruksi pengguna di halaman dan sudah melaporkan hasil tiap langkah di bawah.',
        permintaan ? `Instruksi pengguna yang harus kamu jelaskan: "${permintaan}". Jelaskan HANYA untuk instruksi itu — jangan melebar ke topik atau bagian lain, dan jangan mengulas percakapan sebelumnya.` : '',
        'Susun penjelasan lengkap tetapi padat dengan urutan ini:',
        '1) baris pertama: satu kalimat kesimpulan hasil kerja (apa yang berhasil dan apa intinya bagi data pengguna);',
        '2) lalu 2–5 baris detail, masing-masing diawali "• ", memuat apa yang dihasilkan, angka nyata dari KONTEKS DATA yang relevan (tulis rumus singkat bila kamu menghitung), dan maknanya;',
        '3) bila ada langkah yang gagal, tulis satu baris "• " tersendiri yang menyebut kegagalan itu apa adanya beserta sebabnya — jangan disembunyikan dan jangan diklaim berhasil;',
        '4) baris terakhir: satu langkah berikutnya yang paling masuk akal bagi pengguna.',
        'JANGAN menarasikan aktivitas mekanis (berjalan, menyorot, mengklik, memindah tab). Langsung hasil dan maknanya — bukan catatan proses.',
        'Satu baris = satu gagasan; jangan mengulang kalimat/kata yang sama; tanpa tanda markdown lain, tanpa tabel, tanpa daftar bernomor. Bahasa Indonesia yang ramah dan jelas.',
        'Gunakan HANYA angka dan fakta dari KONTEKS DATA serta laporan langkah; jangan mengarang tombol, aksi, atau angka yang tidak ada.',
        'Angka turunan boleh dihitung dari KONTEKS DATA (selisih, persen, rata-rata) dengan rumus singkat — jangan menyatakan “belum tersedia” bila angkanya bisa dihitung dari konteks.',
        '',
        'KONTEKS DATA:',
        konteks || '(tidak ada konteks data untuk berkas ini)',
    ].filter((l) => l !== '').join('\n');
    const user = [
        `Instruksi pengguna: ${String(req.request || '').slice(0, 400)}`,
        `Berkas: ${req.fileName || '-'} · Sheet: ${req.sheetName || '-'}`,
        'Laporan langkah yang sudah dijalankan:',
        daftar,
        '',
        'Tulis penjelasan hasilnya sekarang.',
    ].join('\n');
    let teks = '';
    try {
        const handle = chatStream({
            port: req.port,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
            temperature: req.temperature,
            maxTokens: req.maxTokens > 0 ? Math.min(req.maxTokens, 700) : 700,
            onDelta: () => { /* penjelasan diambil setelah selesai */ },
        });
        teks = await handle.done;
    } catch {
        return undefined;
    }
    const bersih = tidyModelReply(teks).slice(0, 1200);
    return bersih || undefined;
}
