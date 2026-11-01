import * as vscode from 'vscode';
import { chatStream, ChatMessage } from './llamaCore';
import { AnalysisStore, StoredAnalysis } from './analysisStore';
import { appendChatLog, readChatLogEntries } from './chatLog';
import {
    AgendaItem,
    AgendaPlan,
    agendaContext,
    allowedNumbers,
    buildAgenda,
    dimensionLabel,
    foreignNumbers,
    mainSheet,
} from './communityAgenda';

export type LiveLang = 'id' | 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'ar' | 'fr';

export interface LangMeta { code: LiveLang; name: string; tag: string }

export const LIVE_LANGS: LangMeta[] = [
    { code: 'id', name: 'Bahasa Indonesia', tag: 'ID' },
    { code: 'en', name: 'English', tag: 'EN' },
    { code: 'zh', name: '简体中文', tag: '中文' },
    { code: 'ja', name: '日本語', tag: '日本語' },
    { code: 'ko', name: '한국어', tag: 'KO' },
    { code: 'es', name: 'Español', tag: 'ES' },
    { code: 'fr', name: 'Français', tag: 'FR' },
    { code: 'ar', name: 'العربية', tag: 'AR' },
];

export interface Persona {
    id: string;
    name: string;
    bio: string;
    /** Bidang yang paling sering dibahas persona ini. */
    focus: 'quality' | 'stock' | 'kpi' | 'tree' | 'viz' | 'stats' | 'build';
    /** Bahasa utama persona (dipakai sesekali supaya terasa konsisten). */
    home: LiveLang;
}

/** Anggota komunitas inti: nama, deskripsi, dan bidang bahasan yang berbeda-beda. */
export const PERSONAS: Persona[] = [
    { id: 'rina', name: 'Rina Kusuma', bio: 'Analis stok · suka metode ABC & restock', focus: 'stock', home: 'id' },
    { id: 'chen', name: 'Chen Wei 陈伟', bio: 'Python & Streamlit builder · suka ekspor otomatis', focus: 'build', home: 'zh' },
    { id: 'marco', name: 'Marco Bianchi', bio: 'Dashboard & visualisasi data', focus: 'viz', home: 'en' },
    { id: 'yuki', name: 'Yuki Tanaka 田中由紀', bio: 'Machine learning · C4.5 & evaluasi model', focus: 'tree', home: 'ja' },
    { id: 'sofia', name: 'Sofía Ramírez', bio: 'Kualitas data · pembersihan & duplikat', focus: 'quality', home: 'es' },
    { id: 'bagas', name: 'Bagas Pratama', bio: 'Supply chain · kebutuhan & risiko stok', focus: 'stock', home: 'id' },
    { id: 'nadia', name: 'Nadia Rahman', bio: 'Statistik · korelasi & distribusi', focus: 'stats', home: 'en' },
    { id: 'amel', name: 'Amel Haddad', bio: 'KPI bisnis · margin, AOV, pertumbuhan', focus: 'kpi', home: 'ar' },
    { id: 'jules', name: 'Jules Moreau', bio: 'Data storytelling · ringkasan untuk manajemen', focus: 'kpi', home: 'fr' },
    { id: 'minji', name: 'Kim Min-ji 김민지', bio: 'Otomasi laporan & QA dashboard', focus: 'build', home: 'ko' },
];

/**
 * Roster anggota TANPA BATAS.
 *
 * Sepuluh anggota inti di atas tetap dipakai lebih dulu; setelah itu anggota baru disusun dari
 * kumpulan nama, bidang, dan kota sehingga jumlah anggota tidak lagi dibatasi 10 orang.
 * `memberAt(i)` deterministik: indeks yang sama selalu menghasilkan orang yang sama.
 */
const NAMA_DEPAN = [
    'Ayu', 'Bima', 'Citra', 'Damar', 'Elsa', 'Fajar', 'Gita', 'Hendra', 'Indah', 'Joko',
    'Kartika', 'Lukman', 'Maya', 'Nanda', 'Oscar', 'Putri', 'Qori', 'Rizky', 'Sari', 'Tono',
    'Umar', 'Vina', 'Wawan', 'Yuni', 'Zaki', 'Arief', 'Bella', 'Candra', 'Dewi', 'Eko',
    'Farah', 'Galih', 'Hana', 'Ivan', 'Jihan', 'Kiki', 'Laras', 'Mega', 'Nia', 'Oki',
    'Pandu', 'Rani', 'Sinta', 'Tegar', 'Uli', 'Vera', 'Wulan', 'Yoga', 'Zahra', 'Adi',
];
const NAMA_BELAKANG = [
    'Wijaya', 'Halim', 'Saputra', 'Nugroho', 'Maulana', 'Ramadhan', 'Sitorus', 'Hakim', 'Purnama', 'Lestari',
    'Firmansyah', 'Anggraini', 'Suryana', 'Hidayat', 'Permata', 'Gunawan', 'Wibowo', 'Sanjaya', 'Kusumawati', 'Siregar',
];
const BIDANG: { focus: Persona['focus']; role: string; spec: string }[] = [
    { focus: 'stock', role: 'Analis stok', spec: 'ABC, restock & overstock' },
    { focus: 'stock', role: 'Perencana pengadaan', spec: 'kebutuhan & lead time' },
    { focus: 'stock', role: 'Supply chain', spec: 'risiko stok & distribusi' },
    { focus: 'kpi', role: 'Analis KPI', spec: 'margin, AOV & pertumbuhan' },
    { focus: 'kpi', role: 'Business analyst', spec: 'penjualan & profitabilitas' },
    { focus: 'kpi', role: 'Data storytelling', spec: 'ringkasan untuk manajemen' },
    { focus: 'quality', role: 'Quality data', spec: 'missing, duplikat & validasi' },
    { focus: 'quality', role: 'Data steward', spec: 'standar kolom & konsistensi' },
    { focus: 'stats', role: 'Statistik', spec: 'korelasi, distribusi & outlier' },
    { focus: 'stats', role: 'Riset operasional', spec: 'uji hipotesis & sampel' },
    { focus: 'tree', role: 'Machine learning', spec: 'C4.5 & evaluasi model' },
    { focus: 'tree', role: 'Model evaluator', spec: 'akurasi, kappa & F1' },
    { focus: 'viz', role: 'Visualisasi data', spec: 'dashboard & grafik' },
    { focus: 'build', role: 'Otomasi laporan', spec: 'Python, Streamlit & ekspor' },
];
const KOTA = ['Jakarta', 'Bandung', 'Surabaya', 'Medan', 'Makassar', 'Yogyakarta', 'Semarang', 'Denpasar', 'Balikpapan', 'Palembang', 'Malang', 'Bogor'];
const HOME_LANGS: LiveLang[] = ['id', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'ar'];

const memberCache = new Map<number, Persona>();

/** Anggota ke-`index` pada roster tanpa batas (0–9 = anggota inti). */
export function memberAt(index: number): Persona {
    const i = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
    if (i < PERSONAS.length) { return PERSONAS[i]; }
    const cached = memberCache.get(i);
    if (cached) { return cached; }
    const j = i - PERSONAS.length;
    const perAngkatan = NAMA_DEPAN.length * NAMA_BELAKANG.length;
    const angkatan = Math.floor(j / perAngkatan);
    const k = j % perAngkatan;
    const depan = NAMA_DEPAN[k % NAMA_DEPAN.length];
    const belakang = NAMA_BELAKANG[Math.floor(k / NAMA_DEPAN.length) % NAMA_BELAKANG.length];
    const bidang = BIDANG[j % BIDANG.length];
    const kota = KOTA[(j + Math.floor(j / BIDANG.length)) % KOTA.length];
    const persona: Persona = {
        id: `anggota-${i}`,
        name: angkatan ? `${depan} ${belakang} ${angkatan + 1}` : `${depan} ${belakang}`,
        bio: `${bidang.role} · ${bidang.spec} · ${kota}`,
        focus: bidang.focus,
        home: HOME_LANGS[(j + angkatan) % HOME_LANGS.length],
    };
    memberCache.set(i, persona);
    return persona;
}

/** Batas anggota dari pengaturan; 0 = tanpa batas. */
export function memberLimit(): number {
    const raw = vscode.workspace.getConfiguration('dateSkunder').get<number>('community.members');
    const n = Math.round(Number(raw) || 0);
    return n > 0 ? n : 0;
}

/** Anggota dengan bidang tertentu (anggota inti dulu, lalu roster tanpa batas). */
export function memberWithFocus(focus: Persona['focus'], variant = 0): Persona {
    const inti = PERSONAS.filter((p) => p.focus === focus);
    const v = Math.max(0, Math.floor(variant));
    if (v < inti.length) { return inti[v]; }
    const fi = BIDANG.findIndex((b) => b.focus === focus);
    if (fi < 0) { return memberAt(PERSONAS.length + v); }
    return memberAt(PERSONAS.length + fi + (v - inti.length) * BIDANG.length);
}

/** Anggota dengan nama tertentu (dipakai pemeriksaan & pencarian). */
export function memberByName(name: string): Persona | undefined {
    const key = String(name || '').trim().toLowerCase();
    if (!key) { return undefined; }
    const inti = PERSONAS.find((p) => p.name.toLowerCase() === key);
    if (inti) { return inti; }
    for (let i = PERSONAS.length; i < PERSONAS.length + 2000; i += 1) {
        const p = memberAt(i);
        if (p.name.toLowerCase() === key) { return p; }
    }
    return undefined;
}

/** Identitas khusus ruang Diskusi AI (satu suara, bukan persona komunitas). */
export const DISCUSSION_PERSONA: Persona = {
    id: 'spider-ai',
    name: 'Spider AI',
    bio: 'Diskusi data · poin utama, angka, tindakan',
    focus: 'stats',
    home: 'id',
};

export type LiveRoom = 'komunitas' | 'diskusi';

/** Bahasa yang benar-benar dipakai teks (untuk memperbaiki tag bahasa hasil model). */
export function langMatchesText(code: string, text: string): boolean {
    const s = String(text || '');
    switch (String(code || '').toLowerCase()) {
        case 'zh': return /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff]/.test(s);
        case 'ja': return /[\u3040-\u30ff]/.test(s);
        case 'ko': return /[\uac00-\ud7af]/.test(s);
        case 'ar': return /[\u0600-\u06ff]/.test(s);
        default: return true;
    }
}

/** Buang nama pengirim yang kadang ditulis model di awal pesan (“Spider AI: …”). */
export function stripPersonaPrefix(text: string, personaName = ''): string {
    let out = String(text || '').trim();
    const names = [personaName, 'Spider AI', 'Assistant', 'AI'].filter(Boolean);
    for (const name of names) {
        const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(`^${escaped}\\s*[:：-]\\s*`, 'i'), '').trim();
    }
    return out;
}

/* ── basa-basi ─────────────────────────────────────────────────────────────── */

/**
 * Sapaan, terima kasih, dan penutup sopan yang tidak menambah isi.
 * Dipakai untuk membuang pembuka/penutup jawaban model, dan untuk menolak pesan
 * yang isinya hanya kesopanan (“terima kasih”, “sama-sama”, “semoga membantu”).
 */
const SMALL_TALK_OPEN = /^(?:(?:halo|hai|hi|hello|hey|selamat\s+(?:pagi|siang|sore|malam)|good\s+(?:morning|afternoon|evening)|terima\s*kasih(?:\s+(?:sudah|telah)\s+bertanya)?|makasih|thanks?(?:\s*(?:you|a\s*lot|so\s*much))?|thx|gracias|merci(?:\s*beaucoup)?|شكرا|ありがとう(?:ございます)?|谢谢(?:你)?|多谢|감사합니다|고맙습니다)[\s,.!…~:：-]+)+/i;

const SMALL_TALK_CLOSE = /(?:[\s,.!…~-]+(?:terima\s*kasih|makasih|thanks?(?:\s*you)?|semoga\s+(?:ini\s+)?(?:membantu|bermanfaat)|senang\s+(?:bisa\s+)?membantu|senang\s+membantu|ada\s+lagi\s+yang\s+(?:bisa|ingin)\s+(?:saya|aku)?\s*(?:bantu|ditanyakan)|kalau\s+ada\s+yang\s+(?:mau|ingin)\s+ditanyakan[^.!?]*|silakan\s+bertanya[^.!?]*|siap\s+membantu[^.!?]*|hope\s+(?:this|that)\s+helps|happy\s+to\s+help[^.!?]*|glad\s+(?:I\s+)?could\s+help[^.!?]*|let\s+me\s+know\s+if[^.!?]*|feel\s+free\s+to\s+ask[^.!?]*|jangan\s+ragu[^.!?]*))+[\s.!?…🙏😊👍]*$/i;

/** Pembuka klise yang tidak menambah isi — dibuang walau model tetap menulisnya. */
const FILLER_OPEN = /^(?:menarik(?:\s+juga)?|setuju|sepakat|wah|mantap|mantul|keren|hebat|tentu(?:\s+saja)?|siap|oke|okay|sure|of\s+course|great|nice|interesting)[\s,.!:：-]+/i;
/** Persetujuan singkat: hanya dibuang bila diikuti tanda baca (“Bagus, …”), bukan “bagus untuk …”. */
const FILLER_ACK = /^(?:bagus(?:\s+juga)?|baik(?:lah)?|benar|betul|iya)(?:\s+sekali|\s+banget)?\s*[,.:!：-]+\s*/i;

/** Buang basa-basi di awal/akhir pesan; isi yang sebenarnya tetap utuh. */
export function stripSmallTalk(text: string): string {
    let out = String(text || '').trim();
    for (let i = 0; i < 3; i += 1) {
        const next = out
            .replace(SMALL_TALK_OPEN, '')
            .replace(FILLER_OPEN, '')
            .replace(FILLER_ACK, '')
            .replace(SMALL_TALK_CLOSE, '')
            .trim();
        if (next === out) { break; }
        out = next;
    }
    return out.replace(/^[\s,;:.!?…-]+/, '').trim();
}

/** Kata yang tidak membawa isi (dipakai `isSmallTalk`). */
const FILLER_WORD = new Set([
    'terima', 'kasih', 'makasih', 'thanks', 'thank', 'you', 'thx', 'sama', 'siap', 'oke', 'ok',
    'okay', 'baik', 'noted', 'great', 'nice', 'wow', 'mantap', 'mantul', 'keren', 'hebat', 'bagus', 'semoga',
    'membantu', 'bermanfaat', 'senang', 'bantu', 'halo', 'hai', 'hello', 'hi', 'hey', 'pagi', 'siang',
    'sore', 'malam', 'selamat', 'gracias', 'merci', 'bonjour', 'salut', 'appreciate', 'appreciated',
    'cool', 'awesome', 'perfect', 'sure', 'yes', 'yep', 'yup', 'betul', 'benar', 'setuju', 'sepakat', 'good', 'for',
    'sekali', 'banget', 'pisan', 'banyak',
    'the', 'that', 'this', 'so', 'much', 'lot', 'a', 'it', 'ya', 'yaa', 'deh', 'sih', 'kok', 'juga',
    'ada', 'lagi', 'bisa', 'ingin', 'mau', 'saya', 'aku', 'kamu', 'anda', 'semua', 'kawan', 'teman', 'sip', 'yoi',
    'lanjut', 'next', 'gas', 'gass', 'nah', 'wkwk', 'hehe',
    'شكرا', 'جزيلا', '감사합니다', '고맙습니다', '谢谢', '多谢', 'ありがとう', 'ございます',
]);

/** True bila pesan hanya berisi kesopanan/penutup — tidak ada poin yang bisa ditanggapi. */
export function isSmallTalk(text: string): boolean {
    const cleaned = stripSmallTalk(text);
    if (!cleaned) { return true; }
    if (/\d/.test(cleaned)) { return false; }
    const words = cleaned
        .toLowerCase()
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(' ')
        .filter(Boolean);
    if (!words.length) { return true; }
    let meaningful = 0;
    for (const word of words) {
        if (word.length <= 2) { continue; }
        if (FILLER_WORD.has(word)) { continue; }
        meaningful += 1;
    }
    return meaningful === 0;
}

/**
 * Jenis pesan pengguna setelah kesopanan dibuang.
 * `courtesy` = tidak ada isi (terima kasih / ok / siap) → jawab dengan poin utama, bukan balas sopan.
 */
export type TurnKind = 'courtesy' | 'question' | 'statement';

export interface Turn {
    kind: TurnKind;
    /** Pesan setelah sapaan/terima kasih di awal & akhir dibuang. */
    body: string;
    /** True bila bentuknya pertanyaan (tanda tanya atau kata tanya). */
    asks: boolean;
}

/** Pertanyaan/ajakan yang perlu dijawab — dipakai untuk membedakan pertanyaan dari pernyataan. */
const ASK_WORD = /(\?|？)|\b(apa|apakah|kenapa|mengapa|bagaimana|gimana|berapa|kapan|dimana|di\s+mana|siapa|bisakah|boleh|tolong|why|how|what|which|when|where|who|can|could|should)\b/i;

/**
 * Baca satu pesan pengguna: kesopanan saja, pertanyaan, atau pernyataan.
 * “Terima kasih, tapi kenapa margin turun?” → question dengan isi “kenapa margin turun?”.
 */
export function classifyTurn(text: string): Turn {
    const cleaned = stripSmallTalk(String(text || '').trim())
        .replace(/^(tapi|tetapi|namun|but|however|though)[\s,]+/i, '')
        .trim();
    if (!cleaned || isSmallTalk(cleaned)) {
        return { kind: 'courtesy', body: '', asks: false };
    }
    const asks = ASK_WORD.test(cleaned);
    return { kind: asks ? 'question' : 'statement', body: cleaned, asks };
}

/** Kata kunci bidang yang menandakan pesan benar-benar membahas data. */
const SUBSTANCE_WORD = /(stok|stock|sku|restock|gudang|margin|revenue|pendapatan|kpi|order|pelanggan|kolom|baris|sheet|missing|duplikat|akurasi|model|korelasi|outlier|tren|kategori|produk|wilayah|biaya|harga|qty|data|angka|persen|dataset)/i;

/**
 * Apakah pesan punya isi (angka, istilah data, atau cukup panjang)?
 * Pesan yang hanya “terima kasih / setuju / keren” ditolak supaya ruang tidak penuh basa-basi.
 */
export function hasSubstance(text: string): boolean {
    const s = String(text || '').trim();
    if (!s || isSmallTalk(s)) { return false; }
    if (/\d/.test(s)) { return true; }
    if (/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(s) && s.length >= 12) { return true; }
    if (SUBSTANCE_WORD.test(s)) { return true; }
    return s.split(/\s+/).filter((w) => w.length >= 3).length >= 7;
}

/** Tiga kata pembuka (untuk mendeteksi pesan yang dibuka dengan pola sama terus). */
function openingShape(text: string): string {
    const s = String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) { return ''; }
    const words = s.split(' ').filter((w) => w.length > 2);
    return words.slice(0, 3).join(' ') || s.slice(0, 10);
}

/** Teks tanpa tanda baca/spasi berlebih — pembanding cepat pesan yang benar-benar sama. */
function normalizeText(text: string): string {
    return String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface LiveMessage {
    id: string;
    name: string;
    bio: string;
    text: string;
    at: number;
    lang: LiveLang;
    langTag: string;
    local: true;
    kind: 'chat' | 'answer' | 'system';
    /** Ruang asal pesan: komunitas (lokal) atau Diskusi AI. */
    room: LiveRoom;
    /** Ruang komunitas aktif (#umum, #bantuan, …) — ikut tercatat sebagai label catatan. */
    channel?: string;
    /** Id draft streaming yang digantikan pesan ini (dipakai view untuk menghapus draft). */
    draftId?: string;
}

export interface CommunityLiveDeps {
    store: AnalysisStore;
    /** llama-server sedang berjalan? */
    isRunning: () => boolean;
    /** Port HTTP llama-server. */
    port: () => number;
    /** Coba nyalakan server (dipakai saat pengguna bertanya sementara server mati). */
    ensureServer?: () => Promise<boolean>;
    /** Kirim pesan ke webview Community Chat. */
    post: (message: unknown) => void;
    log?: (line: string) => void;
    /** Kirim pesan ruang Komunitas / Diskusi AI ke database (opsional; tanpa ini tetap lokal). */
    remote?: {
        enabled: () => boolean;
        publish: (draft: {
            name: string;
            bio: string;
            text: string;
            at: number;
            lang: string;
            langTag: string;
            kind: LiveMessage['kind'];
            channel: string;
            /** Ruang tujuan: `komunitas` (community_*) atau `diskusi` (diskusi_ai). */
            room?: LiveRoom;
        }) => void;
    };
}

interface Angle {
    id: string;
    focus: Persona['focus'];
    topic: string;
    facts: string;
}

const nf = (v: number | null | undefined, digits = 1): string => {
    if (v === null || v === undefined || !Number.isFinite(v)) { return '-'; }
    return v.toLocaleString('id-ID', { maximumFractionDigits: digits });
};

const pick = <T>(list: T[], seed: number): T => list[Math.abs(seed) % list.length];

/** Ambil bagian pendek dari fakta analisis agar kalimat cadangan tetap enak dibaca. */
const shortFact = (facts: string): string => {
    const s = String(facts || '').trim();
    if (!s) { return ''; }
    const after = s.includes(': ') ? s.slice(s.indexOf(': ') + 2) : s;
    const clean = after.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
    if (!clean) { return ''; }
    return clean.length > 120 ? `${clean.slice(0, 119)}…` : clean;
};

/** Bahasa yang dipilih pengguna (urutan tetap, tanpa duplikat). */
export function configuredLangs(): LiveLang[] {
    const raw = vscode.workspace.getConfiguration('dateSkunder').get<string[]>('community.languages');
    const list = (Array.isArray(raw) && raw.length ? raw : ['id', 'en', 'zh', 'ja', 'es'])
        .map((x) => String(x).toLowerCase().slice(0, 2))
        .filter((x): x is LiveLang => LIVE_LANGS.some((l) => l.code === x));
    return list.length ? [...new Set(list)] : ['id'];
}

export const langMeta = (code: LiveLang): LangMeta => LIVE_LANGS.find((l) => l.code === code) ?? LIVE_LANGS[0];

/**
 * Simpan pilihan bahasa dari view Community Chat (tombol 🌐).
 * Urutan mengikuti katalog supaya giliran bahasa stabil; minimal satu bahasa tetap aktif.
 */
export async function saveConfiguredLangs(codes: unknown): Promise<LiveLang[]> {
    const raw = Array.isArray(codes) ? codes : [];
    const chosen = new Set(raw.map((x) => String(x).toLowerCase().slice(0, 2)));
    const list = LIVE_LANGS.map((l) => l.code).filter((c) => chosen.has(c));
    const next: LiveLang[] = list.length ? list : ['id'];
    await vscode.workspace.getConfiguration('dateSkunder').update('community.languages', next, vscode.ConfigurationTarget.Global);
    return next;
}

/** Simpan mode bahasa jawaban ('auto' = ikuti bahasa pesan, 'mix' = bergiliran, atau kode bahasa). */
export async function saveReplyLanguage(mode: unknown): Promise<string> {
    const raw = String(mode ?? 'auto').toLowerCase();
    const allowed = ['auto', 'mix', ...LIVE_LANGS.map((l) => l.code)];
    const next = allowed.includes(raw) ? raw : 'auto';
    await vscode.workspace.getConfiguration('dateSkunder').update('community.replyLanguage', next, vscode.ConfigurationTarget.Global);
    return next;
}

/** Tebak bahasa dari teks yang ditulis pengguna (hanya sinyal kuat; sisanya null). */
export function detectLang(text: string): LiveLang | null {
    const s = String(text || '');
    if (!s.trim()) { return null; }
    if (/[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff]/.test(s)) { return 'zh'; }
    if (/[\u3040-\u30ff]/.test(s)) { return 'ja'; }
    if (/[\uac00-\ud7af]/.test(s)) { return 'ko'; }
    if (/[\u0600-\u06ff]/.test(s)) { return 'ar'; }
    if (/\b(apa|bagaimana|kenapa|mengapa|berapa|tolong|stok|barang|kualitas|analisis|berkas|file|data|yang|tidak|bisa|dari|untuk|dengan)\b/i.test(s)) { return 'id'; }
    if (/[¿¡ñ]|\b(que|cómo|como|porque|cuál|datos|análisis|hola|gracias|buenos)\b/i.test(s)) { return 'es'; }
    if (/\b(quel|quels|pourquoi|comment|données|merci|bonjour)\b/i.test(s)) { return 'fr'; }
    if (/\b(the|what|how|why|which|data|stock|quality|please|thanks|can|could)\b/i.test(s)) { return 'en'; }
    return null;
}

/** Sheet terbesar pada satu berkas analisis (dipakai untuk ringkasan cepat). */
/**
 * Fakta siap pakai + sudut bahasan dari satu berkas.
 *
 * Sejak agenda analisis diperkenalkan, daftar ini adalah cermin `buildAgenda()`: SEMUA dimensi
 * (KPI, kualitas, stok, statistik, C4.5, tren) ikut, bukan hanya satu sudut. Semua angka tetap
 * berasal dari hasil analisis nyata supaya model tidak mengarang.
 */
export function anglesFor(entry: StoredAnalysis): Angle[] {
    return buildAgenda(entry).map((item) => ({
        id: item.key,
        focus: item.focus as Persona['focus'],
        topic: item.topic,
        facts: item.facts,
    }));
}

/** Satu temuan berangka yang layak dibahas, lengkap dengan langkah lanjutannya. */
export interface MainPoint {
    id: string;
    focus: Persona['focus'];
    topic: string;
    /** Satu kalimat berangka dari DATA (bukan karangan). */
    fact: string;
    /** Langkah yang masuk akal setelah temuan ini. */
    action: string;
    /** Makin besar makin mendesak. */
    weight: number;
}

/**
 * Poin-poin utama satu berkas, diurutkan dari yang paling perlu ditindak.
 *
 * Dipakai untuk membawa obrolan kembali ke inti — misalnya saat pengguna hanya menulis
 * “terima kasih” — dan untuk menyusun konteks Diskusi AI. Semua angka berasal dari analisis;
 * tidak ada tambahan yang dikarang.
 */
export function mainPoints(entry?: StoredAnalysis): MainPoint[] {
    if (!entry) { return []; }
    const sheet = mainSheet(entry);
    if (!sheet) { return []; }
    const out: MainPoint[] = [];
    const h = sheet.csvHealth;
    const cells = sheet.totalRows * sheet.headers.length || 1;
    const missingPct = (sheet.missingCells / cells) * 100;
    const quality = Math.round(h.qualityScore);

    const stock = sheet.stockAnalysis;
    if (stock?.detected) {
        out.push({
            id: 'stock',
            focus: 'stock',
            topic: 'stok kritis',
            fact: `${stock.kpis.criticalCount} SKU kritis dan ${stock.kpis.lowCount} menipis dari ${nf(stock.kpis.totalSKUs, 0)} SKU; nilai stok ${nf(stock.kpis.totalValuation)}.`,
            action: 'kunci restock item kritis dulu, overstock belakangan',
            weight: 35 + stock.kpis.criticalCount * 10 + stock.kpis.lowCount * 3,
        });
    }
    const needs = sheet.needsAnalysis;
    if (needs && needs.urgentItemCount > 0) {
        out.push({
            id: 'needs',
            focus: 'stock',
            topic: 'kebutuhan mendesak',
            fact: `${needs.urgentItemCount} item urgent dan ${needs.highPriorityCount} prioritas tinggi; anggaran kebutuhan ${nf(needs.totalProcurementBudget)}.`,
            action: 'setujui item urgent lebih dulu, sisanya bertahap',
            weight: 95 + needs.urgentItemCount * 4,
        });
    }
    if (missingPct > 0 || sheet.duplicates > 0 || quality < 85) {
        out.push({
            id: 'quality',
            focus: 'quality',
            topic: 'kualitas data',
            fact: `skor kualitas ${quality}/100, sel kosong ${missingPct.toFixed(1)}%, baris duplikat ${nf(sheet.duplicates, 0)}.`,
            action: 'bersihkan sel kosong dan duplikat sebelum angka ini dipakai untuk keputusan',
            weight: 60 + missingPct * 8 + Math.min(40, sheet.duplicates) + Math.max(0, 85 - quality),
        });
    }
    const kpi = sheet.businessKpi;
    if (kpi) {
        const margin = kpi.summary.grossMarginPct;
        if (margin !== null && margin < 20) {
            out.push({
                id: 'margin',
                focus: 'kpi',
                topic: 'margin tipis',
                fact: `margin ${margin.toFixed(1)}% dari pendapatan ${nf(kpi.summary.totalRevenue)}.`,
                action: 'periksa biaya per produk sebelum menaikkan volume',
                weight: 70 + (20 - margin),
            });
        }
        const growth = kpi.growth.latestGrowthPct;
        if (growth !== null && growth < 0) {
            out.push({
                id: 'growth',
                focus: 'kpi',
                topic: 'pertumbuhan turun',
                fact: `pertumbuhan periode terakhir ${growth.toFixed(1)}% (rata-rata ${kpi.growth.avgGrowthPct === null ? '-' : `${kpi.growth.avgGrowthPct.toFixed(1)}%`}).`,
                action: 'telusuri produk atau wilayah yang menurun sebelum menaikkan target',
                weight: 90 + Math.abs(growth) * 2,
            });
        }
        // Angka bisnis tetap jadi poin utama walau datanya bersih (tidak ada yang mendesak).
        out.push({
            id: 'revenue',
            focus: 'kpi',
            topic: 'angka penjualan',
            fact: `pendapatan ${nf(kpi.summary.totalRevenue)} dari ${nf(kpi.summary.totalOrders, 0)} order; AOV ${nf(kpi.summary.avgOrderValue)}.`,
            action: 'jadikan pembanding periode berikutnya sebelum menaikkan target',
            weight: 30,
        });
        const topProduct = kpi.topProducts[0];
        if (topProduct) {
            out.push({
                id: 'product',
                focus: 'kpi',
                topic: 'produk teratas',
                fact: `produk teratas "${topProduct.label}" menyumbang ${topProduct.share.toFixed(1)}% pendapatan (${nf(topProduct.revenue)}).`,
                action: 'pastikan stok produk ini aman sebelum promosi berikutnya',
                weight: 22,
            });
        }
    }
    const tree = sheet.decisionTreeAnalysis;
    if (tree && (tree.accuracy < 0.85 || tree.performanceMetrics.kappa < 0.6)) {
        out.push({
            id: 'tree',
            focus: 'tree',
            topic: 'keandalan model',
            fact: `akurasi C4.5 ${(tree.accuracy * 100).toFixed(1)}%, kappa ${tree.performanceMetrics.kappa.toFixed(3)}.`,
            action: 'uji ulang dengan pembagian data berbeda sebelum dipakai memutuskan',
            weight: 55 + Math.max(0, 0.85 - tree.accuracy) * 100,
        });
    }
    const num = sheet.columns.find((c) => c.num);
    if (num?.num && sheet.totalRows > 0) {
        const outlierPct = (num.num.outliers / sheet.totalRows) * 100;
        if (outlierPct >= 5) {
            out.push({
                id: 'outlier',
                focus: 'stats',
                topic: 'outlier',
                fact: `${nf(num.num.outliers, 0)} outlier (${outlierPct.toFixed(1)}%) di kolom "${num.name}"; median ${nf(num.num.median)} vs rata-rata ${nf(num.num.mean)}.`,
                action: 'cek outlier itu data nyata atau salah input sebelum memakai rata-rata',
                weight: 40 + outlierPct,
            });
        }
    }
    // Selalu ada satu poin dasar supaya obrolan tetap punya pijakan saat data bersih.
    out.push({
        id: 'size',
        focus: 'quality',
        topic: 'ukuran data',
        fact: `${entry.fileName} · sheet ${sheet.name}: ${nf(sheet.totalRows, 0)} baris × ${sheet.headers.length} kolom, skor kualitas ${quality}/100.`,
        action: 'lanjut ke angka bisnis (pendapatan, margin, stok) untuk keputusan berikutnya',
        weight: 5,
    });
    return out
        .map((point, index) => ({ point, index }))
        .sort((a, b) => b.point.weight - a.point.weight || a.index - b.index)
        .map((row) => row.point);
}

/** Poin yang paling perlu ditindak (undefined bila belum ada berkas). */
export function keyPoint(entry?: StoredAnalysis): MainPoint | undefined {
    return mainPoints(entry)[0];
}

/** Gaya bicara tiap bidang — dipakai prompt supaya persona tidak terdengar seragam. */
export function personaVoice(focus: Persona['focus']): string {
    const map: Record<Persona['focus'], string> = {
        stock: 'praktis, bicara SKU/unit, langsung ke keputusan gudang',
        quality: 'teliti, sebut kolom & baris, jujur soal keterbatasan data',
        kpi: 'bicara dampak bisnis dan keputusan, bukan teori',
        tree: 'hati-hati, sebut metrik evaluasi dan risiko model',
        viz: 'suka membandingkan angka dan tampilan grafik',
        stats: 'ragu yang sehat, sebut sampel, outlier, dan asumsi',
        build: 'teknis ringan, sebut langkah otomatis/ekspor',
    };
    return map[focus] || map.quality;
}

/** Ringkasan konteks (untuk prompt jawaban): semua dimensi analisis, bukan satu sudut. */
function contextBlock(entry: StoredAnalysis | undefined): string {
    if (!entry) {
        return 'Belum ada berkas yang dianalisis. Ajak pengguna membuka CSV/Excel lewat Date Skunder.';
    }
    return `Berkas aktif: ${entry.fileName}\n${agendaContext(entry, 2, 3)}`;
}

/** Konteks poin utama (dipakai saat pengguna hanya menulis kesopanan). */
function pointContext(entry: StoredAnalysis | undefined): string {
    if (!entry) {
        return 'Belum ada berkas yang dianalisis; tidak ada angka yang boleh dikarang.';
    }
    const lines = mainPoints(entry).slice(0, 4).map((p) => `- [${p.topic}] ${p.fact} → ${p.action}`);
    // Jangan hanya stok/kualitas: sertakan satu butir KPI (atau dimensi lain) bila belum ada.
    const agenda = buildAgenda(entry);
    for (const dimension of ['kpi', 'stats', 'tree', 'viz'] as const) {
        if (lines.length >= 6) { break; }
        const item = agenda
            .filter((a) => a.dimension === dimension)
            .sort((a, b) => b.weight - a.weight)[0];
        if (!item || lines.some((line) => line.includes(item.facts))) { continue; }
        lines.push(`- [${item.topic}] ${item.facts} → ${item.action}`);
    }
    return `Berkas aktif: ${entry.fileName}\n${lines.join('\n')}`;
}

const SYSTEM_CHATTER = [
    'Kamu salah satu anggota komunitas Date Skunder (alat analisis CSV/Excel di VS Code) yang sedang bekerja dengan data itu.',
    'Tulis SATU pesan grup yang terdengar seperti manusia: 1–2 kalimat pendek, maksimal 220 karakter.',
    'Setiap pesan wajib membawa satu isi baru — satu angka dari DATA, satu pertanyaan lanjutan yang spesifik,',
    'satu perbandingan, satu risiko, atau satu langkah kerja. Menyahut “setuju/bagus/menarik” saja tidak boleh.',
    'Sambung pesan terakhir: tanggapi satu hal spesifik darinya, lalu tambahkan satu hal yang belum dibahas.',
    'Obrolan membahas SELURUH analisis secara bergiliran: KPI (pendapatan, margin, AOV, pertumbuhan), kualitas data,',
    'stok & kebutuhan, statistik (sebaran, outlier, korelasi), model C4.5, dan tren. Ikuti FOKUS yang diminta;',
    'jangan menjadikan C4.5 bahan semua pesan dan jangan membahas dimensi yang sama dua kali berturut-turut.',
    'Dilarang membuka dengan salam, “terima kasih”, pujian kosong, atau kata “siap”; jangan memakai emoji,',
    'jangan menyalin bullet/heading mentah, jangan mengarang angka, jangan menyebut nama sendiri atau menyebut dirimu AI.',
    'Angka yang boleh dipakai HANYA angka yang tertulis di DATA. Jangan menambah persen, jumlah, kolom, atau nama berkas baru.',
    'Jangan memakai kata “menarik”, “bagus”, “setuju”, “sepakat”, “semoga membantu”, atau tawaran bantuan.',
    'Jangan mengulang angka, frasa, atau kalimat pembuka yang sudah dipakai pesan sebelumnya; kalau tidak ada hal baru, ambil sudut lain.',
    'Kalimat pertama jangan dimulai dengan angka; variasikan bentuk kalimat, jangan mengulang pola pembuka yang sudah dipakai.',
].join(' ');

/** Bentuk pesan yang bergiliran supaya obrolan tidak terasa satu pola. */
const CHATTER_SHAPES = [
    'tanggapi satu hal spesifik dari pesan terakhir, lalu tambahkan alasan singkat',
    'ajukan satu pertanyaan lanjutan yang benar-benar spesifik tentang data itu',
    'sebut satu angka dari DATA, lalu satu kalimat tentang artinya bagi keputusan',
    'bandingkan dua nilai atau dua kolom dari DATA dalam satu kalimat',
    'usulkan satu langkah kerja berikutnya dan apa yang mau dicek',
    'tandai satu batasan: apa yang belum bisa disimpulkan dari data itu',
    'bagikan satu pengalaman kerja singkat (tanpa angka karangan), lalu satu poin praktis',
];

const SYSTEM_ANSWER = [
    'Kamu anggota komunitas Date Skunder yang menjawab pertanyaan pengguna.',
    'Jawab langsung ke inti: maksimal 4 baris, tanpa basa-basi, tanpa daftar panjang.',
    'Kalimat pertama harus sudah berisi jawaban atau angkanya (maksimal 18 kata); jangan membuka dengan salam, "terima kasih",',
    '"tentu", "siap", atau "pertanyaan bagus". Jangan mengulang pertanyaan dan jangan menutup dengan basa-basi.',
    'Jangan pernah membalas dengan "terima kasih", "sama-sama", "semoga membantu", atau tawaran bantuan',
    '("ada lagi yang bisa dibantu"). Kalau pesan pengguna hanya kesopanan, sebutkan poin utama data yang paling',
    'mendesak beserta angkanya dan satu tindakan berikutnya.',
    'DATA memuat beberapa dimensi (KPI penjualan, kualitas data, stok & kebutuhan, statistik, model C4.5, tren).',
    'Pakai dimensi yang benar-benar menjawab pertanyaan; jangan mengalihkan semua jawaban ke C4.5 bila yang ditanya KPI,',
    'stok, atau kualitas data. Bila pertanyaan menyentuh beberapa hal, jawab semuanya secara ringkas.',
    'Sebutkan angka nyata dari DATA bila relevan; jangan mengarang angka, persen, kolom, atau nama berkas.',
    'Bila data tidak mendukung, katakan apa adanya dan sarankan satu langkah berikutnya. Balas HANYA jawabannya.',
].join(' ');

/** Aturan saat pengguna hanya menutup percakapan dengan kesopanan. */
const SYSTEM_POINT = [
    'Kamu analis data di komunitas Date Skunder. Pengguna baru saja menulis kesopanan (mis. “terima kasih”).',
    'JANGAN membalas kesopanan itu dan jangan menawarkan bantuan.',
    'Bawa percakapan ke poin utama: satu temuan berangka dari DATA yang paling perlu ditindak, lalu satu langkah berikutnya.',
    'Pilih poin dari dimensi yang paling mendesak (stok kritis, kebutuhan mendesak, margin tipis, kualitas data, pertumbuhan',
    'turun, atau keandalan model) — bukan selalu C4.5.',
    'Kalimat pertama sudah berisi temuannya. Maksimal 2 kalimat (200 karakter), tanpa salam, tanpa emoji, tanpa heading.',
    'Angka hanya dari DATA; bila DATA kosong, katakan belum ada data dan satu langkah untuk memulainya.',
].join(' ');

/** Buang label template + basa-basi supaya jawaban terdengar seperti orang, bukan formulir. */
export function naturalDiscussion(text: string): string {
    let out = stripSmallTalk(stripPersonaPrefix(text));
    out = out.replace(/^(tentu(?:\s+saja)?|baik(?:lah)?|siap|oke|okay|sure|of\s+course|好的|かしこまりました|물론입니다)[\s,.!:：-]+/i, '');
    out = out.replace(/^(poin utama|inti jawaban|ringkasan)\s*[:：]\s*/gim, '');
    out = out.replace(/^(akar masalah|penyebab utama)\s*[:：]\s*/gim, 'Penyebabnya: ');
    out = out.replace(/^tindakan\s*[:：]\s*/gim, 'Langkahnya: ');
    out = out.replace(/^status\s*[:：]\s*/gim, '');
    out = out.replace(/^•\s*/gm, '- ');
    out = out.replace(/\n{3,}/g, '\n\n');
    return out.trim();
}

/** Kemiripan dua teks (0–1) berbasis kata, untuk mencegah jawaban berulang. */
export function textSimilarity(a: string, b: string): number {
    const tokens = (value: string) => new Set(
        String(value || '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .split(' ')
            .filter((word) => word.length >= 3),
    );
    const left = tokens(a);
    const right = tokens(b);
    if (!left.size || !right.size) { return left.size === right.size ? 1 : 0; }
    let same = 0;
    for (const word of left) { if (right.has(word)) { same += 1; } }
    return same / (left.size + right.size - same);
}

/** Kata bermakna (≥3 karakter) — bahan pembanding frasa. */
function wordsOf(text: string): string[] {
    return String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .split(' ')
        .filter((word) => word.length >= 3);
}

/**
 * Kemiripan frasa (pasangan kata berurutan) 0–1.
 * Menangkap parafrase yang memakai kata berbeda tetapi susunan kalimatnya sama —
 * penyebab utama pesan terasa “kembar” walau tidak identik.
 */
export function phraseSimilarity(a: string, b: string): number {
    const grams = (text: string): Set<string> => {
        const words = wordsOf(text);
        const out = new Set<string>();
        for (let i = 0; i < words.length - 1; i += 1) { out.add(`${words[i]} ${words[i + 1]}`); }
        if (!out.size && words.length) { out.add(words[0]); }
        return out;
    };
    const left = grams(a);
    const right = grams(b);
    if (!left.size || !right.size) { return 0; }
    let same = 0;
    for (const gram of left) { if (right.has(gram)) { same += 1; } }
    return same / (left.size + right.size - same);
}

/** Angka di teks, dinormalisasi supaya “0,0%” dan “0%” dianggap sama. */
export function numbersIn(text: string): string[] {
    const raw = String(text || '').match(/\d+(?:[.,]\d+)?/g) || [];
    return raw.map((value) => {
        const clean = value.replace(',', '.');
        if (!clean.includes('.')) { return clean; }
        return clean.replace(/0+$/, '').replace(/\.$/, '');
    });
}

/** Dua teks membawa angka temuan yang sama (minimal dua angka, ≥80% sama). */
export function sameNumbers(a: string, b: string): boolean {
    const left = new Set(numbersIn(a));
    const right = new Set(numbersIn(b));
    if (left.size < 2 || right.size < 2) { return false; }
    let same = 0;
    for (const angka of left) { if (right.has(angka)) { same += 1; } }
    return same / (left.size + right.size - same) >= 0.8;
}

/** Angka unik dari beberapa teks (dipakai prompt “angka yang sudah muncul”). */
export function uniqueNumbers(texts: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const text of texts) {
        for (const angka of numbersIn(text)) {
            if (seen.has(angka)) { continue; }
            seen.add(angka);
            out.push(angka);
        }
    }
    return out;
}

/** Jenis pertanyaan → bentuk jawaban yang berbeda (bukan satu template untuk semua). */
export type DiscussionIntent = 'cause' | 'how' | 'compare' | 'recommend' | 'define' | 'data' | 'general';

export function discussionIntent(question: string): DiscussionIntent {
    const q = String(question || '').toLowerCase();
    if (/(kenapa|mengapa|penyebab|sebab|akar masalah|why|为什么|为何|なぜ|どうして|porque|pourquoi|warum)/.test(q)) { return 'cause'; }
    if (/(bagaimana|cara|langkah|gimana|how|怎么|怎样|如何|どうやって|como|cómo)/.test(q)) { return 'how'; }
    if (/(banding|bandingkan|versus|\bvs\b|compare|perbandingan|dibanding)/.test(q)) { return 'compare'; }
    if (/(saran|rekomendasi|sebaiknya|should|recommend|strategi|solusi|tindakan)/.test(q)) { return 'recommend'; }
    if (/(apa itu|apa yang dimaksud|maksudnya|definisi|jelaskan|explain|what is|什么是|とは|que es|qu'est-ce)/.test(q)) { return 'define'; }
    if (/(berapa|jumlah|nilai|angka|statistik|rata-rata|median|persen|total|how many|how much)/.test(q)) { return 'data'; }
    if (/(python|streamlit|kode|code|alat|tool|model|llm|llama|api|firebase|umum|teori)/.test(q)) { return 'general'; }
    return 'data';
}

/**
 * Konteks Diskusi AI.
 * Semua dimensi tetap dikirim (KPI, kualitas, stok, statistik, C4.5, tren) supaya jawaban tidak
 * hanya berputar di satu topik; butir yang cocok dengan pertanyaan diberi bobot lebih dulu oleh
 * `agendaContext` (urutannya berat), jadi jawaban tetap fokus.
 */
function discussionContext(entry: StoredAnalysis | undefined, question = ''): string {
    if (!entry) {
        return 'Belum ada berkas yang dianalisis di sesi ini (tidak ada angka data yang bisa dipakai).';
    }
    const sheet = mainSheet(entry);
    const kepala = sheet
        ? `Berkas: ${entry.fileName} · sheet ${sheet.name} · ${nf(sheet.totalRows, 0)} baris x ${sheet.headers.length} kolom`
        : `Berkas: ${entry.fileName}`;
    // Pertanyaan menyebut istilah tertentu? Beri dimensi itu jatah lebih banyak.
    const q = String(question || '').toLowerCase();
    const focused = /(kpi|pendapatan|revenue|margin|laba|omzet|penjualan|aov|order|pelanggan|customer|diskon|pertumbuhan|growth)/.test(q)
        ? 'kpi'
        : /(c4\.5|pohon|tree|akurasi|kappa|f1|model|prediksi)/.test(q)
            ? 'tree'
            : /(stok|stock|sku|restock|gudang|overstock|kebutuhan|pengadaan)/.test(q)
                ? 'stock'
                : /(kualitas|missing|kosong|duplikat|outlier|korelasi|statistik|distribusi)/.test(q)
                    ? 'quality'
                    : '';
    const body = agendaContext(entry, 2, 3);
    return [kepala, focused ? `(pertanyaan menyangkut: ${focused})` : '', body].filter(Boolean).join('\n');
}

/** Aturan Diskusi AI: menjawab pertanyaan yang benar-benar ditanyakan, dengan gaya manusia. */
function discussionSystem(intent: DiscussionIntent, langName: string, openings: string[]): string {
    const bentuk: Record<DiscussionIntent, string> = {
        cause: 'Jelaskan penyebab paling mungkin lebih dulu, lalu bukti angkanya, lalu satu langkah perbaikan. Boleh memakai kata "kemungkinan besar" bila datanya hanya mendukung dugaan.',
        how: 'Jawab sebagai langkah praktis: 1), 2), 3) — masing-masing satu kalimat, lalu hasil yang diharapkan.',
        compare: 'Bandingkan dua hal yang ditanyakan secara langsung: mana lebih tinggi/rendah, selisihnya berapa, dan apa artinya.',
        recommend: 'Mulai dengan rekomendasi yang jelas, alasan berbasis angka, lalu risiko bila tidak dilakukan.',
        define: 'Definisikan dengan bahasa sederhana, beri satu contoh dari data bila ada, jangan bertele-tele.',
        data: 'Jawab angka yang ditanyakan lebih dulu, lalu satu kalimat konteks dan satu catatan bila ada keterbatasan data.',
        general: 'Jawab pertanyaan umum dengan benar dan ringkas, tandai "(umum)" bila bukan dari data, lalu kaitkan ke data hanya bila relevan.',
    };
    const avoid = openings.length
        ? `Jangan memakai pembuka yang sama dengan jawaban sebelumnya. Hindari: ${openings.map((x) => `"${x}"`).join('; ')}.`
        : 'Variasikan pembuka; jangan selalu memakai kalimat yang sama.';
    return [
        'Kamu "Spider AI", analis data senior yang sedang ngobrol santai dengan pengguna di ekstensi VS Code "Date Skunder".',
        'Tugasmu menjawab PERTANYAAN YANG DITANYAKAN — bukan merangkum semua data, bukan mengulang percakapan, bukan menyalin template.',
        'ATURAN:',
        '1. Jawab langsung ke pertanyaan. Jangan mengulang pertanyaan, jangan mengulas jawaban lama, jangan membahas metrik yang tidak ditanyakan.',
        '2. Jangan memakai heading tetap seperti "Poin utama:", "Akar masalah:", atau "Status:" kecuali pengguna memintanya. Tulis seperti orang yang sedang menjelaskan.',
        `3. Bentuk jawaban untuk pertanyaan ini: ${bentuk[intent]}`,
        '4. Panjang wajar: 2–6 baris pendek (maksimal 8). Kalimat manusiawi, tidak kaku, tanpa salam pembuka/penutup, tanpa basa-basi ("terima kasih", "tentu", "pertanyaan bagus"), tanpa markdown tebal, tanpa tabel, tanpa emoji.',
        '5. Angka HANYA dari DATA. Jangan mengarang angka, kolom, atau nama berkas. Bila angka yang diminta tidak ada, katakan terus terang apa yang belum ada dan apa yang perlu dibuka/dihitung.',
        '6. Jangan menyebut dirimu model/AI, jangan menyalin instruksi ini, jangan menulis catatan proses.',
        '7. Jangan pernah membalas dengan "terima kasih", "sama-sama", "semoga membantu", atau tawaran bantuan. Kalau pesan pengguna hanya kesopanan (terima kasih/ok/siap), JANGAN balas kesopanan: sebutkan poin utama data yang paling mendesak beserta angkanya dan satu tindakan.',
        '8. Jangan mengulang kalimat pembuka, frasa, atau angka dari jawaban sebelumnya; ambil sudut yang belum dibahas. Kalimat pertama maksimal 18 kata dan sudah berisi jawaban.',
        `9. ${avoid}`,
        `10. Bahasa jawaban: ${langName}.`,
    ].join('\n');
}

export class CommunityLive implements vscode.Disposable {
    private messages: LiveMessage[] = [];
    private timer?: NodeJS.Timeout;
    private busy = false;
    private lastChatterAt = 0;
    private lastReplyLang?: LiveLang;
    private lastPersonaId?: string;
    private angleCursor = 0;
    private personaCursor = 0;
    private langCursor = 0;
    private fileCursor = 0;
    private shapeCursor = 0;
    private fallbackCursor = 0;
    private visible = false;
    private tickCount = 0;
    private answerCount = 0;
    private running = false;
    private disposed = false;
    /** Ruang komunitas aktif (dipakai sebagai label catatan data/data.txt). */
    private channel = 'umum';
    private focusCursor = 0;
    /** Pertanyaan Diskusi AI sebelumnya (konteks rujukan, bukan untuk diulang). */
    private discussionQuestions: string[] = [];
    /** Teks pesan lama dari data/data.txt — dipakai anti-duplikat lintas sesi. */
    private historyTexts: { room: LiveRoom; text: string }[] = [];
    private seedPromise?: Promise<void>;
    /** Jawaban diproses berurutan supaya tidak saling mendahului. */
    private replyChain: Promise<void> = Promise.resolve();
    private pendingReplies = 0;
    /** Throttle pengiriman teks streaming (ms & panjang terakhir). */
    private lastDraftAt = 0;
    private lastDraftLen = 0;
    /** Cache angka yang boleh dipakai untuk berkas aktif. */
    private allowedCache?: { key: string; numbers: Set<number> };
    /** Agenda bahasan berimbang: semua dimensi analisis, bukan satu topik saja. */
    private agenda = new AgendaPlan();
    /** Pertanyaan pengguna yang sudah dijawab (dipakai supaya jawaban tidak diulang). */
    private askedQuestions: { question: string; answer: string }[] = [];
    /** Putaran riset: naik setiap rotasi 100 pesan (0 percakapan → riset ulang). */
    private researchRound = 0;

    constructor(private readonly deps: CommunityLiveDeps) { }

    /** Pesan lokal terakhir (dipakai saat view dibuka kembali); `room` memfilter per ruang. */
    recent(room?: LiveRoom): LiveMessage[] {
        const list = room ? this.messages.filter((m) => m.room === room) : this.messages;
        return list.slice(-200);
    }

    /**
     * Kosongkan memori sesi setelah rotasi otomatis (arsip tetap tersimpan di data/arsip).
     * Agenda, pertanyaan lama, dan penghitung giliran direset supaya putaran berikutnya benar-benar
     * baru — bukan melanjutkan percakapan yang sudah dihapus.
     */
    reset(): void {
        this.messages = [];
        this.discussionQuestions = [];
        this.askedQuestions = [];
        this.agenda.reset();
        this.lastPersonaId = undefined;
        this.historyTexts = [];
        this.seedPromise = undefined;
        this.personaCursor = 0;
        this.focusCursor = 0;
        this.angleCursor = 0;
        this.shapeCursor = 0;
        this.fileCursor = 0;
        this.lastReplyLang = undefined;
        this.answerCount = 0;
        this.lastChatterAt = 0;
        this.postQueue();
    }

    /**
     * Mulai putaran riset baru setelah rotasi 100 pesan (percakapan = 0).
     * Agenda dibangun ulang dari analisis terakhir, lalu dua pesan pembuka dibuat supaya ruang
     * tidak kosong dan pembahasan langsung menyebar ke semua dimensi.
     */
    beginResearchRound(): void {
        this.researchRound += 1;
        this.reset();
        this.deps.log?.(`Community riset ulang #${this.researchRound}: 0 percakapan, agenda baru.`);
        if (this.isActive() && this.visible) {
            setTimeout(() => { void this.warmUp(); }, 350);
        }
    }

    /**
     * Kosongkan HANYA ingatan ruang Diskusi AI setelah rotasi 100 pesan di Firebase.
     * Ruang komunitas tidak disentuh; pertanyaan rujukan lama ikut dihapus supaya jawaban
     * berikutnya tidak mengacu pada percakapan yang sudah tidak ada.
     */
    resetDiscussion(): void {
        this.messages = this.messages.filter((m) => m.room !== 'diskusi');
        this.discussionQuestions = [];
        this.postQueue();
    }

    /**
     * Tambahkan teks pesan dari Firebase sebagai pembanding anti-duplikat lintas sesi.
     * Dipanggil view setiap kali pesan database dibaca, supaya pesan yang sudah ada di database
     * tidak dibuat ulang oleh chatter lokal.
     */
    rememberRemote(texts: string[]): void {
        const known = new Set(this.historyTexts.map((item) => item.text));
        for (const text of texts.slice(-300)) {
            const clean = String(text || '').trim();
            if (!clean || known.has(clean)) { continue; }
            known.add(clean);
            this.historyTexts.push({ room: 'komunitas', text: clean });
        }
        if (this.historyTexts.length > 800) { this.historyTexts.splice(0, this.historyTexts.length - 800); }
    }

    /** Ruang komunitas aktif (dari dropdown di view) → label catatan. */
    setChannel(channel: string): void {
        const next = String(channel || '').trim().slice(0, 40);
        if (next) { this.channel = next; }
    }

    status(): { enabled: boolean; running: boolean; active: boolean; visible: boolean; seconds: number; languages: string[]; personas: number; unlimited: boolean; firebase: boolean } {
        const cfg = vscode.workspace.getConfiguration('dateSkunder');
        const limit = memberLimit();
        return {
            enabled: cfg.get<boolean>('community.live') ?? true,
            running: this.deps.isRunning(),
            active: this.isActive(),
            visible: this.visible,
            seconds: Math.max(5, Math.min(120, Math.round(cfg.get<number>('community.liveSeconds') ?? 12))),
            languages: configuredLangs(),
            personas: limit || 0,
            unlimited: limit === 0,
            firebase: this.deps.remote?.enabled() ?? false,
        };
    }

    private isActive(): boolean {
        if (this.disposed) { return false; }
        const cfg = vscode.workspace.getConfiguration('dateSkunder');
        return (cfg.get<boolean>('community.live') ?? true) && this.deps.isRunning();
    }

    start(): void {
        if (this.timer) { return; }
        this.seedHistory();
        this.timer = setInterval(() => void this.poll(), 1000);
    }

    /**
     * Baca pesan lama dari data/data.txt sekali, lalu pakai sebagai pembanding anti-duplikat.
     * Dengan begitu pesan yang sama tidak muncul lagi setelah view ditutup atau VS Code dijalankan ulang.
     */
    private seedHistory(): Promise<void> {
        if (!this.seedPromise) {
            this.seedPromise = readChatLogEntries().then(
                (entries) => {
                    const seeded = entries
                        .slice(-400)
                        .map((entry) => ({
                            room: entry.room === 'diskusi' ? 'diskusi' as LiveRoom : 'komunitas' as LiveRoom,
                            text: entry.text,
                        }));
                    // Pesan Firebase yang sudah diketahui sebelum berkas dibaca tetap dipakai
                    // sebagai pembanding anti-duplikat (jangan ditimpa).
                    const known = new Set(seeded.map((item) => item.text));
                    const extra = this.historyTexts.filter((item) => !known.has(item.text));
                    this.historyTexts = [...seeded, ...extra].slice(-800);
                },
                () => undefined,
            );
        }
        return this.seedPromise;
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    }

    /** View dibuka/ditutup → diskusi otomatis hanya berjalan saat ruangnya terlihat. */
    setVisible(visible: boolean): void {
        const changed = this.visible !== visible;
        this.visible = !!visible;
        if (!changed) { return; }
        this.postStatus();
        // Saat ruang baru dibuka, langsung isi beberapa pesan supaya tidak terasa kosong.
        if (this.visible) {
            void this.seedHistory();
            void this.warmUp();
        }
    }

    /** Beberapa pesan pembuka saat ruang pertama kali terlihat (maks. 2, agar tidak membanjiri). */
    private async warmUp(): Promise<void> {
        if (!this.isActive() || this.messages.filter((m) => m.room === 'komunitas').length >= 3) { return; }
        for (let i = 0; i < 2 && this.isActive(); i += 1) {
            if (this.busy) {
                await new Promise((r) => setTimeout(r, 400));
                continue;
            }
            await this.chatter();
            await new Promise((r) => setTimeout(r, 200));
        }
    }

    /** Teruskan pesan pengguna; jawaban dikirim secepatnya oleh persona yang relevan. */
    async ask(text: string, author?: string): Promise<void> {
        const question = String(text || '').trim().slice(0, 900);
        if (!question) { return; }
        await this.enqueueReply(() => this.answer(question, author));
    }

    /**
     * Satu pesan ruang Komunitas.
     *
     * Pesan yang hanya berisi kesopanan (“terima kasih”, “ok siap”) tidak dibalas dengan
     * kesopanan: percakapan langsung dibawa ke poin utama data (angka + langkah).
     */
    private async answer(question: string, author?: string): Promise<void> {
        appendChatLog('komunitas', String(author || 'Kamu').slice(0, 40), question, undefined, `KOMUNITAS #${this.channel}`);
        const turn = classifyTurn(question);
        const detected = detectLang(question);
        const plan = this.replyPlan(question, detected);
        const lang = plan.main;
        const persona = this.personaForQuestion(turn.body || question);
        this.postTyping(persona, lang, 'komunitas');
        let running = this.deps.isRunning();
        if (!running && this.deps.ensureServer) {
            try { running = await this.deps.ensureServer(); } catch { running = false; }
        }
        if (!running) {
            this.pushSystem(
                persona,
                lang,
                HELP[lang.code] || HELP.id,
                'answer',
                'komunitas',
            );
            return;
        }
        const entry = this.deps.store.last();
        const draftId = this.newDraftId('komunitas');
        if (turn.kind === 'courtesy') {
            const point = await this.answerPoint(entry, persona, lang, draftId, 'komunitas', question);
            this.push(persona, lang, point, 'answer', 'komunitas', draftId, [], entry);
            return;
        }
        const context = contextBlock(entry);
        const history = this.messages.slice(-4).map((m) => `${m.name}: ${m.text}`).join('\n') || '(belum ada)';
        // Pertanyaan yang diulang dijawab dari sudut berbeda, bukan menyalin jawaban lama.
        const repeat = this.previousAnswer(turn.body);
        const payload: ChatMessage[] = [
            {
                role: 'system',
                content: `${SYSTEM_ANSWER}\nBahasa jawaban: ${lang.name}.`
                    + (plan.alt ? ` Setelah jawaban utama, tambahkan SATU baris terjemahan singkat (maks. 12 kata) dalam ${plan.alt.name}, diawali “— ”.` : ''),
            },
            {
                role: 'user',
                content: `DATA:\n${context}\n\nOBROLAN TERAKHIR:\n${history}\n\n`
                    + (repeat
                        ? `PERTANYAAN INI SUDAH PERNAH DIJAWAB. Jawaban lama (JANGAN diulang, jangan diringkas): "${repeat.answer.replace(/\s+/g, ' ').slice(0, 240)}"\nJawab dari sudut berbeda, ambil angka/dimensi yang belum disebut di jawaban itu.\n\n`
                        : '')
                    + `PESAN PENGGUNA (${persona.name}, ${persona.bio}):\n${turn.body}\n\n`
                    + (turn.kind === 'statement'
                        ? 'Pesan itu pernyataan, bukan pertanyaan. Tanggapi dengan satu angka dari DATA dan satu hal yang perlu dicek; jangan mengulang pernyataannya.\n'
                        : '')
                    + `Jawab dalam ${lang.name}, maksimal ${plan.alt ? 3 : 4} baris.`,
            },
        ];
        try {
            const raw = await this.complete(payload, 240, 0.35, 60000, (full) => this.streamDraft(draftId, 'komunitas', persona, lang, full));
            let text = stripSmallTalk(this.clean(raw, 700));
            // Model kadang hanya membalas “terima kasih / siap” → minta sekali lagi, tegas.
            if (!text || isSmallTalk(text)) {
                const retry = await this.complete([
                    ...payload,
                    {
                        role: 'user',
                        content: 'Jawaban tadi hanya basa-basi. Ulangi: kalimat pertama langsung berisi jawaban atau angka dari DATA, tanpa salam, tanpa terima kasih, tanpa penawaran bantuan, tanpa penutup.',
                    },
                ], 240, 0.5, 60000);
                text = stripSmallTalk(this.clean(retry, 700));
            }
            if (!text || isSmallTalk(text)) { throw new Error('jawaban hanya basa-basi'); }
            // Angka di luar DATA = halusinasi → minta ulang, lalu pakai poin data yang aman.
            const asing = this.foreignFor(text, entry, question);
            if (asing.length) {
                const retry = await this.complete([
                    ...payload,
                    {
                        role: 'user',
                        content: `Angka berikut tidak ada di DATA: ${asing.join(', ')}. Tulis ulang jawaban hanya dengan angka yang tertulis di DATA; jangan menambah persen, jumlah, atau kolom baru.`,
                    },
                ], 240, 0.4, 60000);
                const ulang = stripSmallTalk(this.clean(retry, 700));
                if (ulang && !isSmallTalk(ulang) && !this.foreignFor(ulang, entry, question).length) {
                    text = ulang;
                } else {
                    text = this.uniqueFallback(entry, lang, 'komunitas', 0.9) || this.fallbackAnswer(question, entry, lang);
                }
            }
            // Jawaban yang menyalin pesan lain di ruang ini → minta sudut yang berbeda.
            if (this.tooSimilar(text, 'komunitas', 0.9)) {
                const retry = await this.complete([
                    ...payload,
                    {
                        role: 'user',
                        content: 'Jawaban itu sudah muncul di ruang ini. Jawab ulang pertanyaan yang sama dengan kalimat pembuka dan angka yang berbeda, tetap ke inti.',
                    },
                ], 240, 0.6, 60000);
                const ulang = stripSmallTalk(this.clean(retry, 700));
                if (ulang && !isSmallTalk(ulang) && !this.tooSimilar(ulang, 'komunitas', 0.9) && !this.foreignFor(ulang, entry, question).length) { text = ulang; }
                else {
                    // Masih kembar → jawab dengan poin utama lain yang belum pernah muncul.
                    text = this.uniqueFallback(entry, lang, 'komunitas', 0.9) || text;
                }
            }
            this.rememberAnswer(turn.body, text);
            if (!this.push(persona, lang, text, 'answer', 'komunitas', draftId, [question], entry)) {
                this.pushSystem(persona, lang, this.fallbackAnswer(question, entry, lang), 'answer', 'komunitas', draftId);
            }
        } catch (e) {
            this.deps.log?.(`Community jawaban gagal: ${e instanceof Error ? e.message : String(e)}`);
            this.pushSystem(persona, lang, this.fallbackAnswer(question, entry, lang), 'answer', 'komunitas', draftId);
        }
    }

    /**
     * Diskusi AI: membahas satu permasalahan data sampai tuntas.
     *
     * Riwayat percakapan SENGAJA tidak dikirim ke model — penjelasan poin utama harus jelas tanpa
     * mengulas percakapan sebelumnya. Pertanyaan & jawaban dicatat ke data/data.txt (DISKUSI AI).
     */
    async askDiscussion(text: string, author?: string): Promise<void> {
        const question = String(text || '').trim().slice(0, 4000);
        if (!question) { return; }
        await this.enqueueReply(() => this.discuss(question, author));
    }

    private async discuss(question: string, author?: string): Promise<void> {
        const persona = DISCUSSION_PERSONA;
        const turn = classifyTurn(question);
        const lang = langMeta(detectLang(question) || 'id');
        const intent = discussionIntent(turn.body || question);
        appendChatLog('diskusi', String(author || 'Kamu').slice(0, 40), question);
        this.postTyping(persona, lang, 'diskusi');
        let running = this.deps.isRunning();
        if (!running && this.deps.ensureServer) {
            try { running = await this.deps.ensureServer(); } catch { running = false; }
        }
        const entry = this.deps.store.last();
        if (!running) {
            this.pushSystem(
                persona,
                lang,
                'Diskusi AI butuh model untuk menjawab.',
                'system',
                'diskusi',
            );
            return;
        }
        const draftId = this.newDraftId('diskusi');
        if (turn.kind === 'courtesy') {
            const point = await this.answerPoint(entry, persona, lang, draftId, 'diskusi', question);
            this.push(persona, lang, point, 'answer', 'diskusi', draftId, [], entry);
            return;
        }
        const body = turn.body || question;
        const prior = this.messages.filter((m) => m.room === 'diskusi').slice(-6);
        const earlier = this.discussionQuestions.slice(-3);
        this.discussionQuestions.push(question);
        if (this.discussionQuestions.length > 12) { this.discussionQuestions.splice(0, this.discussionQuestions.length - 12); }
        const openings = prior
            .filter((m) => m.kind === 'answer')
            .slice(-3)
            .map((m) => m.text.split('\n')[0].replace(/\s+/g, ' ').slice(0, 60));
        const previous = [
            ...earlier.map((q) => `Pengguna (sebelumnya): ${q.replace(/\s+/g, ' ').slice(0, 200)}`),
            ...prior.map((m) => `${m.name}: ${m.text.replace(/\s+/g, ' ').slice(0, 220)}`),
        ].join('\n') || '(belum ada)';
        const payload: ChatMessage[] = [
            { role: 'system', content: discussionSystem(intent, lang.name, openings) },
            {
                role: 'user',
                content: [
                    `DATA:\n${discussionContext(entry, body)}`,
                    '',
                    `KONTEKS SEBELUMNYA (hanya untuk memahami rujukan seperti “itu” atau “tadi”; JANGAN diulang, JANGAN diringkas):\n${previous}`,
                    '',
                    `PERTANYAAN PENGGUNA:\n${body}`,
                    '',
                    `Jawab sekarang dalam ${lang.name}: 2–6 baris, sesuai bentuk "${intent}", tanpa heading template.`,
                ].join('\n'),
            },
        ];
        try {
            const raw = await this.complete(payload, 420, 0.55, 120000, (full) => this.streamDraft(draftId, 'diskusi', persona, lang, full, 1600, true));
            let jawab = naturalDiscussion(this.clean(raw, 1600, 8, true));
            if (!jawab || isSmallTalk(jawab)) { throw new Error('jawaban kosong'); }
            // Angka di luar DATA = halusinasi → minta ulang dengan angka yang benar.
            const asing = this.foreignFor(jawab, entry, body);
            if (asing.length) {
                const retry = await this.complete([
                    ...payload,
                    {
                        role: 'user',
                        content: `Angka berikut tidak ada di DATA: ${asing.join(', ')}. Tulis ulang jawaban hanya dengan angka dari DATA; jangan menambah persen, jumlah, atau kolom baru.`,
                    },
                ], 420, 0.45, 120000);
                const ulang = naturalDiscussion(this.clean(retry, 1600, 8, true));
                if (ulang && !isSmallTalk(ulang) && !this.foreignFor(ulang, entry, body).length) { jawab = ulang; }
                else { jawab = this.uniqueFallback(entry, lang, 'diskusi', 0.9) || this.fallbackDiscussion(entry, body, intent, lang); }
            }
            // Jawaban yang mirip jawaban sebelumnya → minta sudut pandang lain sekali lagi.
            if (this.tooSimilar(jawab, 'diskusi', 0.78)) {
                const retry = await this.complete([
                    ...payload,
                    {
                        role: 'user',
                        content: `Jawaban sebelumnya terlalu mirip jawaban lama. Jawab ulang pertanyaan yang sama dari sudut berbeda, tanpa mengulang kalimat pembuka, dan jangan menyalin jawaban sebelumnya.`,
                    },
                ], 420, 0.7, 120000);
                const ulang = naturalDiscussion(this.clean(retry, 1600, 8, true));
                if (ulang && !this.tooSimilar(ulang, 'diskusi', 0.9) && !this.foreignFor(ulang, entry, body).length) { jawab = ulang; }
                else { jawab = this.uniqueFallback(entry, lang, 'diskusi', 0.9) || this.fallbackDiscussion(entry, body, intent, lang); }
            }
            this.rememberAnswer(body, jawab);
            if (!this.push(persona, lang, jawab, 'answer', 'diskusi', draftId, [body], entry)) {
                this.pushSystem(persona, lang, this.fallbackDiscussion(entry, body, intent, lang), 'answer', 'diskusi', draftId);
            }
        } catch (e) {
            this.deps.log?.(`Diskusi AI gagal: ${e instanceof Error ? e.message : String(e)}`);
            this.pushSystem(persona, lang, this.fallbackDiscussion(entry, body, intent, lang), 'answer', 'diskusi', draftId);
        }
    }

    /** Antrekan satu jawaban supaya diproses berurutan (jawaban tidak saling mendahului). */
    private enqueueReply(task: () => Promise<void>): Promise<void> {
        this.pendingReplies += 1;
        this.postQueue();
        const run = this.replyChain.then(task, task).then(
            () => this.finishReply(),
            (e) => {
                this.finishReply();
                this.deps.log?.(`Community antrean jawaban gagal: ${e instanceof Error ? e.message : String(e)}`);
            },
        );
        this.replyChain = run;
        return run;
    }

    private finishReply(): void {
        this.pendingReplies = Math.max(0, this.pendingReplies - 1);
        this.postQueue();
    }

    private postQueue(): void {
        this.deps.post({ type: 'communityLiveQueue', pending: this.pendingReplies });
    }

    /**
     * Jawaban saat pengguna hanya menulis kesopanan: bukan “terima kasih”, tetapi poin utama
     * data berikutnya (angka + satu langkah), dalam bahasa yang dipilih.
     */
    private async answerPoint(
        entry: StoredAnalysis | undefined,
        persona: Persona,
        lang: LangMeta,
        draftId: string,
        room: LiveRoom,
        question = '',
    ): Promise<string> {
        const payload: ChatMessage[] = [
            { role: 'system', content: `${SYSTEM_POINT}\nBahasa jawaban: ${lang.name}.` },
            {
                role: 'user',
                content: `DATA:\n${pointContext(entry)}\n\n`
                    + `PESAN PENGGUNA: ${question || '(hanya kesopanan)'}\n\n`
                    + 'Tulis 1–2 kalimat: satu temuan berangka dari DATA yang paling perlu ditindak, lalu satu langkah. Maksimal 200 karakter.',
            },
        ];
        let text = '';
        try {
            const raw = await this.complete(payload, 120, 0.5, 45000, (full) => this.streamDraft(draftId, room, persona, lang, full, 240));
            text = stripSmallTalk(this.clean(raw, 240, 3));
            if (!text || isSmallTalk(text) || !hasSubstance(text)) {
                const retry = await this.complete([
                    ...payload,
                    {
                        role: 'user',
                        content: 'Balasan tadi hanya kesopanan atau kosong. Tulis ulang: satu temuan berangka dari DATA, lalu satu tindakan. Tanpa terima kasih, tanpa tawaran bantuan.',
                    },
                ], 120, 0.6, 45000);
                const ulang = stripSmallTalk(this.clean(retry, 240, 3));
                if (ulang && !isSmallTalk(ulang) && hasSubstance(ulang)) { text = ulang; }
            }
        } catch (e) {
            this.deps.log?.(`Community poin utama gagal: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (!text || isSmallTalk(text) || !hasSubstance(text) || this.foreignFor(text, entry).length) {
            text = this.fallbackPoint(entry, lang);
        }
        return text;
    }

    /** Angka yang boleh dipakai untuk berkas aktif (cache per berkas/versi). */
    private allowedFor(entry: StoredAnalysis | undefined): Set<number> {
        if (!entry) { return new Set<number>(); }
        const key = `${entry.id}|${entry.updatedAt}`;
        if (!this.allowedCache || this.allowedCache.key !== key) {
            this.allowedCache = { key, numbers: allowedNumbers(entry) };
        }
        return this.allowedCache.numbers;
    }

    /** Angka pada teks yang tidak ada di DATA (termasuk angka dari pertanyaan pengguna). */
    private foreignFor(text: string, entry: StoredAnalysis | undefined, extra = ''): string[] {
        return foreignNumbers(text, this.allowedFor(entry), extra ? [extra] : []);
    }

    /** Jawaban lama untuk pertanyaan yang sama (dipakai supaya tidak mengulang percakapan). */
    private previousAnswer(question: string): { question: string; answer: string } | undefined {
        const q = String(question || '').trim();
        if (!q) { return undefined; }
        for (let i = this.askedQuestions.length - 1; i >= 0; i -= 1) {
            const row = this.askedQuestions[i];
            if (textSimilarity(q, row.question) >= 0.8 || phraseSimilarity(q, row.question) >= 0.7) { return row; }
        }
        return undefined;
    }

    /** Simpan pertanyaan + jawaban supaya pertanyaan berulang dijawab dari sudut lain. */
    private rememberAnswer(question: string, answer: string): void {
        const q = String(question || '').trim();
        const a = String(answer || '').trim();
        if (!q || !a) { return; }
        this.askedQuestions.push({ question: q, answer: a });
        if (this.askedQuestions.length > 20) { this.askedQuestions.splice(0, this.askedQuestions.length - 20); }
    }

    private newDraftId(room: LiveRoom): string {
        // Setiap jawaban baru punya draft sendiri; penghitung throttle direset di sini.
        this.lastDraftAt = 0;
        this.lastDraftLen = 0;
        return `draft-${room}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    /** Kirim teks yang sedang disusun ke view (streaming), dibatasi supaya tidak membanjiri. */
    private streamDraft(
        id: string,
        room: LiveRoom,
        persona: Persona,
        lang: LangMeta,
        raw: string,
        max = 700,
        keepBullets = false,
    ): void {
        let text = keepBullets
            ? naturalDiscussion(this.clean(stripPersonaPrefix(raw, persona.name), max, 8, true))
            : stripSmallTalk(this.clean(stripPersonaPrefix(raw, persona.name), max, 6));
        // Jangan tampilkan potongan yang masih berupa basa-basi (mis. “Terima kasih, …”).
        if (!text || isSmallTalk(text)) { return; }
        const now = Date.now();
        if (now - this.lastDraftAt < 70 && text.length - this.lastDraftLen < 24) { return; }
        this.lastDraftAt = now;
        this.lastDraftLen = text.length;
        this.deps.post({
            type: 'communityLiveStream',
            id,
            room,
            name: persona.name,
            bio: persona.bio,
            lang: lang.code,
            langTag: lang.tag,
            text,
        });
    }

    /** Hapus draft di view (dipakai bila pesan akhir tidak dikirim). */
    private endDraft(id: string | undefined, room: LiveRoom): void {
        if (!id) { return; }
        this.deps.post({ type: 'communityLiveStream', id, room, done: true });
    }

    /** Satu putaran diskusi otomatis. */
    private async poll(): Promise<void> {
        if (this.disposed) { return; }
        const running = this.deps.isRunning();
        if (running !== this.running) {
            this.running = running;
            this.postStatus();
        }
        if (!this.isActive() || !this.visible || this.busy) { return; }
        // Pertanyaan pengguna diprioritaskan: jangan menambah pesan otomatis saat jawaban masih disusun.
        if (this.pendingReplies > 0) { return; }
        const cfg = vscode.workspace.getConfiguration('dateSkunder');
        const seconds = Math.max(5, Math.min(120, Math.round(cfg.get<number>('community.liveSeconds') ?? 12)));
        if (Date.now() - this.lastChatterAt < seconds * 1000) { return; }
        await this.chatter();
    }

    private async chatter(): Promise<void> {
        this.busy = true;
        this.lastChatterAt = Date.now();
        await this.seedHistory();
        const files = this.deps.store.list();
        const shape = CHATTER_SHAPES[this.shapeCursor++ % CHATTER_SHAPES.length];
        const lang = langMeta(this.nextChatterLang());
        let persona = this.nextMember();
        let facts = '';
        let topic = 'analisis data';
        let entry: StoredAnalysis | undefined;
        let item: AgendaItem | undefined;
        let sent = false;
        try {
            if (files.length) {
                const target = files[Math.abs(this.fileCursor++) % files.length];
                entry = this.deps.store.get(target.id) ?? this.deps.store.last();
                if (entry) {
                    // Agenda berimbang: dimensi yang paling sedikit dibahas didahulukan.
                    this.agenda.setItems(buildAgenda(entry));
                    item = this.agenda.next();
                    if (item) {
                        facts = item.facts;
                        topic = item.topic;
                        // Anggota yang bidangnya cocok, bergiliran dari roster tanpa batas.
                        persona = this.memberFor(item.focus);
                    }
                }
            }
            if (persona.id === this.lastPersonaId) {
                persona = item ? this.memberFor(item.focus) : this.nextMember();
                if (persona.id === this.lastPersonaId) { persona = this.nextMember(); }
            }
            this.lastPersonaId = persona.id;
            // Indikator “menulis…” juga untuk pesan otomatis: ruang tidak terasa diam.
            this.postTyping(persona, lang, 'komunitas');

            const room = this.messages.filter((m) => m.room === 'komunitas');
            const recent = room
                .slice(-4)
                .map((m) => `${m.name}: ${m.text}`)
                .join('\n') || '(baru dibuka)';
            const last = room.filter((m) => m.kind === 'chat').slice(-1)[0];
            // Frasa yang sudah dipakai → dilarang muncul lagi (anti pesan kembar).
            const dipakai = room
                .filter((m) => m.kind === 'chat')
                .slice(-3)
                .map((m) => `"${m.text.replace(/\s+/g, ' ').slice(0, 60)}"`)
                .join(' · ') || '- (belum ada)';
            const angkaDipakai = uniqueNumbers(room.slice(-5).map((m) => m.text)).slice(0, 12).join(', ') || '-';
            const messages: ChatMessage[] = [
                { role: 'system', content: `${SYSTEM_CHATTER}\nBahasa pesan: ${lang.name}.` },
                {
                    role: 'user',
                    content: entry
                        ? `Kamu: ${persona.name} — ${persona.bio}. Gaya bicara: ${personaVoice(persona.focus)}.\n`
                            + (last ? `PESAN TERAKHIR (${last.name}): "${last.text.replace(/\s+/g, ' ').slice(0, 140)}"\n` : '')
                            + `BENTUK PESAN: ${shape}.\nTOPIK: ${topic}${item ? ` (dimensi: ${dimensionLabel(item.dimension)})` : ''}.\nDATA:\n${facts}\n\nOBROLAN TERAKHIR:\n${recent}\n\n`
                            + `Sudah muncul di putaran ini (pakai angka/butir baru, bukan kalimat lama): ${this.agenda.covered().map((d) => dimensionLabel(d)).join(', ') || '-'}\n`
                            + `Sudah dipakai (jangan diulang, baik kalimat, angka, maupun frasa): ${dipakai}\n`
                            + `Angka yang sudah muncul (bawa sudut dengan angka baru): ${angkaDipakai}\n\n`
                            + `Tulis pesanmu dalam ${lang.name}.`
                        : `Kamu: ${persona.name} — ${persona.bio}. Gaya bicara: ${personaVoice(persona.focus)}.\nBENTUK PESAN: ${shape}.\n`
                            + `Belum ada berkas yang dianalisis di sesi ini. Ajak anggota lain membuka CSV/Excel lewat Date Skunder dan sebutkan satu hal konkret yang bisa dicek (kualitas data, stok, KPI, atau C4.5) — tanpa basa-basi.\n\n`
                            + `Sudah dipakai (jangan diulang): ${dipakai}\n\nTulis pesanmu dalam ${lang.name}.`,
                },
            ];
            const raw = await this.complete(messages, 180, 0.85, 60000);
            let text = this.clean(raw, 260, 3);
            if (!text) { throw new Error('pesan kosong'); }
            // “terima kasih / setuju / bagus” bukan diskusi → ditolak, bukan ditampilkan.
            if (!hasSubstance(text)) { throw new Error('pesan tanpa isi (basa-basi)'); }
            // Angka yang tidak ada di DATA = halusinasi → minta ulang sekali, lalu tolak.
            const asing = this.foreignFor(text, entry);
            if (asing.length) {
                const retry = await this.complete([
                    ...messages,
                    {
                        role: 'user',
                        content: `Pesan itu memakai angka yang tidak ada di DATA: ${asing.join(', ')}. Tulis ulang hanya dengan angka yang tertulis di DATA, tanpa menambah persen atau jumlah baru.`,
                    },
                ], 180, 0.7, 60000);
                const ulang = this.clean(retry, 260, 3);
                if (ulang && hasSubstance(ulang) && !this.foreignFor(ulang, entry).length) { text = ulang; }
                else { throw new Error('angka di luar data'); }
            }
            if (this.tooSimilar(text, 'komunitas', 0.86, true)) { throw new Error('pesan terlalu mirip pesan sebelumnya'); }
            sent = this.push(persona, lang, text, 'chat', 'komunitas', undefined, [], entry);
        } catch (e) {
            this.deps.log?.(`Community chatter gagal: ${e instanceof Error ? e.message : String(e)}`);
            // Model lambat/gagal → satu pesan cadangan yang tetap berisi, bukan sapaan kosong.
            const fallback = this.fallbackChatter(persona, topic, facts, lang);
            if (fallback && hasSubstance(fallback) && !this.tooSimilar(fallback, 'komunitas', 0.86, true)) {
                sent = this.push(persona, lang, fallback, 'chat', 'komunitas', undefined, [], entry);
            }
        } finally {
            // Tidak ada pesan yang jadi dikirim → jangan biarkan indikator menulis menggantung.
            if (!sent) { this.endTyping('komunitas'); }
            this.busy = false;
        }
    }

    /**
     * Cegah pesan kembar: teks yang mirip, frasa yang sama, angka temuan yang sama, atau salinan
     * pesan lama — termasuk pesan yang sudah ada di Firebase/data lama sebelum sesi ini.
     * Ambang `threshold` bisa dinaikkan untuk jawaban (yang boleh mirip topiknya, bukan kalimatnya).
     */
    private tooSimilar(text: string, room: LiveRoom = 'komunitas', threshold = 0.86, deep = false): boolean {
        const needle = String(text || '').trim();
        if (!needle) { return true; }
        const shape = openingShape(needle);
        const phraseFloor = Math.max(0.62, threshold - 0.18);
        const recent = this.messages.filter((x) => x.room === room).slice(-40);
        const normalized = normalizeText(needle);
        let sameShape = 0;
        for (const m of recent) {
            if (normalizeText(m.text) === normalized) { return true; }
            if (this.sameMessage(needle, m.text, threshold, phraseFloor)) { return true; }
        }
        // Tiga pesan dibuka dengan pola kata yang sama → terasa mengulang.
        for (const m of recent.slice(-10)) {
            if (shape && openingShape(m.text) === shape) { sameShape += 1; }
        }
        // Pesan dari Firebase/sesi sebelumnya (termasuk berkas catatan lama).
        const old = this.historyTexts.filter((h) => h.room === room).slice(-200);
        const oldThreshold = Math.min(0.98, threshold + (deep ? 0 : 0.03));
        for (const item of old) {
            if (normalizeText(item.text) === normalized) { return true; }
            if (this.sameMessage(needle, item.text, oldThreshold, phraseFloor)) { return true; }
        }
        return sameShape >= 2;
    }

    /** Dua pesan dianggap sama bila mirip kata, mirip frasa, atau membawa angka temuan yang sama. */
    private sameMessage(a: string, b: string, threshold: number, phraseFloor: number): boolean {
        if (textSimilarity(a, b) >= threshold) { return true; }
        if (phraseSimilarity(a, b) >= phraseFloor && textSimilarity(a, b) >= 0.3) { return true; }
        // Angka yang sama + topik yang sama = temuan yang sama walau kalimatnya diubah.
        return sameNumbers(a, b) && textSimilarity(a, b) >= 0.45;
    }

    private complete(
        messages: ChatMessage[],
        maxTokens: number,
        temperature: number,
        timeoutMs: number,
        onPartial?: (full: string) => void,
    ): Promise<string> {
        const port = this.deps.port();
        return new Promise<string>((resolve, reject) => {
            let settled = false;
            let full = '';
            const handle = chatStream({
                port,
                messages,
                temperature,
                maxTokens,
                onDelta: (delta) => {
                    full += delta;
                    if (!onPartial) { return; }
                    try { onPartial(full); } catch { /* view ditutup saat model menulis */ }
                },
            });
            const timer = setTimeout(() => {
                if (settled) { return; }
                settled = true;
                try { handle.abort(); } catch { /* sudah berhenti */ }
                reject(new Error('waktu tunggu model habis'));
            }, timeoutMs);
            handle.done.then(
                (text) => { if (!settled) { settled = true; clearTimeout(timer); resolve(text); } },
                (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } },
            );
        });
    }

    /** Buang pembungkus gaya model (nama di depan, tanda kutip, bullet, “Berikut …”). */
    private clean(raw: string, max: number, maxLines = 6, keepBullets = false): string {
        let t = String(raw || '').trim();
        t = t.replace(/^```[\w]*\n?|\n?```$/g, '').trim();
        t = t.replace(/^["“'«]+|["”'»]+$/g, '').trim();
        t = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
        t = t.replace(/^(jawaban|answer|pesan|message)\s*[:：]\s*/i, '');
        if (!keepBullets) { t = t.replace(/^[-*•]\s+/gm, ''); }
        const lines = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (lines.length > maxLines) { t = lines.slice(0, maxLines).join('\n'); }
        if (t.length > max) { t = `${t.slice(0, max - 1)}…`; }
        return t;
    }

    /** Anggota berikutnya dari roster (dibatasi pengaturan `community.members` bila diisi). */
    private nextMember(): Persona {
        const limit = memberLimit();
        const i = this.personaCursor++;
        return memberAt(limit > 0 ? i % limit : i);
    }

    /** Anggota berikutnya dengan bidang tertentu, tetap menghormati batas anggota. */
    private memberFor(focus: Persona['focus']): Persona {
        const limit = memberLimit();
        const v = this.focusCursor++;
        if (limit <= 0) { return memberWithFocus(focus, v); }
        for (let k = 0; k < limit; k += 1) {
            const p = memberAt((v + k) % limit);
            if (p.focus === focus) { return p; }
        }
        return memberAt(v % limit);
    }

    private nextChatterLang(): LiveLang {
        const langs = configuredLangs();
        if (langs.length === 1) { return langs[0]; }
        const limit = memberLimit();
        const idx = this.personaCursor + 3;
        const persona = memberAt(limit > 0 ? idx % limit : idx);
        // Sesekali pakai bahasa utama persona supaya terasa konsisten, sisanya rotasi.
        const useHome = this.tickCount % 3 === 0 && langs.includes(persona.home);
        this.tickCount += 1;
        if (useHome) { return persona.home; }
        const next = langs[this.langCursor++ % langs.length];
        return next === this.lastReplyLang && langs.length > 1
            ? langs[this.langCursor++ % langs.length]
            : next;
    }

    /** Bahasa jawaban: ikuti bahasa pertanyaan, dengan satu baris terjemahan bergiliran (variasi). */
    private replyPlan(question: string, detected: LiveLang | null): { main: LangMeta; alt?: LangMeta } {
        const langs = configuredLangs();
        const mode = vscode.workspace.getConfiguration('dateSkunder').get<string>('community.replyLanguage') ?? 'auto';
        if (LIVE_LANGS.some((l) => l.code === mode)) {
            const main = langMeta(mode as LiveLang);
            this.lastReplyLang = main.code;
            return { main };
        }
        if (mode === 'mix') {
            const options = langs.filter((l) => l !== this.lastReplyLang);
            const next = options.length ? pick(options, this.langCursor++) : langs[0];
            this.lastReplyLang = next;
            return { main: langMeta(next) };
        }
        // 'auto': jawaban utama selalu mengikuti bahasa pertanyaan (jelas), lalu setiap
        // jawaban kedua ditambah satu baris terjemahan dalam bahasa lain → tetap bervariasi.
        const main = langMeta(detected && detected !== 'id' ? detected : 'id');
        this.lastReplyLang = main.code;
        this.answerCount += 1;
        let alt: LangMeta | undefined;
        if (this.answerCount % 2 === 0) {
            const candidates = langs.filter((l) => l !== main.code);
            if (candidates.length) { alt = langMeta(pick(candidates, this.langCursor++)); }
        }
        return { main, alt };
    }

    private personaForQuestion(question: string): Persona {
        const q = question.toLowerCase();
        const rules: [Persona['focus'], RegExp][] = [
            ['stock', /(stok|stock|barang|sku|restock|gudang|inventor)/],
            ['kpi', /(kpi|pendapatan|revenue|margin|laba|omzet|penjualan|profit|aov)/],
            ['tree', /(c4\.5|pohon|tree|akurasi|model|prediksi|kappa|f1)/],
            ['quality', /(kualitas|missing|kosong|duplikat|bersih|valid|duplicate)/],
            ['stats', /(korelasi|korelasi|statistik|distribusi|outlier|rata-rata|median)/],
            ['viz', /(grafik|chart|visual|warna|diagram)/],
            ['build', /(python|streamlit|ekspor|export|script|skrip|otomatis)/],
        ];
        for (const [focus, re] of rules) {
            if (re.test(q)) {
                return this.memberFor(focus);
            }
        }
        return this.nextMember();
    }

    private fallbackAnswer(question: string, entry: StoredAnalysis | undefined, lang: LangMeta): string {
        const sheet = entry ? mainSheet(entry) : undefined;
        const head = FALLBACK_HEAD[lang.code] || FALLBACK_HEAD.id;
        if (!sheet) {
            return `${head} ${NO_DATA[lang.code] || NO_DATA.id}`;
        }
        const h = sheet.csvHealth;
        const bits = [
            `${nf(sheet.totalRows, 0)}×${sheet.headers.length}`,
            `Q ${Math.round(h.qualityScore)}/100`,
            `missing ${((sheet.missingCells / (sheet.totalRows * sheet.headers.length || 1)) * 100).toFixed(1)}%`,
        ];
        if (sheet.stockAnalysis?.detected) { bits.push(`stok kritis ${sheet.stockAnalysis.kpis.criticalCount}`); }
        if (sheet.businessKpi) { bits.push(`revenue ${nf(sheet.businessKpi.summary.totalRevenue)}`); }
        return `${head} ${entry?.fileName}: ${bits.join(' · ')}.`;
    }

    private fallbackChatter(_persona: Persona, topic: string, facts: string, lang: LangMeta): string {
        const fact = shortFact(facts);
        // Tanpa data yang bisa disebut, lebih baik tidak mengirim pesan daripada menyapa kosong.
        if (!fact) { return ''; }
        const pool = FALLBACK_CHATTER[lang.code] || FALLBACK_CHATTER.id;
        const tpl = pool[this.fallbackCursor++ % pool.length];
        return tpl.replace('{topic}', topic).replace('{fact}', fact);
    }

    /**
     * Poin utama cadangan saat model gagal: tetap berisi angka dari analisis dan satu langkah,
     * bukan balasan sopan. Tanpa berkas, jawabannya jujur bahwa belum ada data.
     */
    private fallbackPoint(entry: StoredAnalysis | undefined, lang: LangMeta): string {
        const point = keyPoint(entry);
        if (!point) { return NO_DATA[lang.code] || NO_DATA.id; }
        const pool = FALLBACK_POINT[lang.code] || FALLBACK_POINT.id;
        const tpl = pool[this.fallbackCursor++ % pool.length];
        return tpl.replace('{fact}', point.fact).replace('{action}', point.action);
    }

    /**
     * Jawaban cadangan yang belum muncul di ruang itu: poin utama bergiliran (bukan kalimat kembar).
     * Kosong bila semua poin sudah pernah dibahas — pemanggil memakai cadangan terakhirnya sendiri.
     */
    private uniqueFallback(entry: StoredAnalysis | undefined, lang: LangMeta, room: LiveRoom, threshold = 0.9): string {
        const points = entry ? mainPoints(entry) : [];
        const templates = FALLBACK_POINT[lang.code] || FALLBACK_POINT.id;
        for (const point of points) {
            for (const tpl of templates) {
                const text = tpl.replace('{fact}', point.fact).replace('{action}', point.action);
                if (hasSubstance(text) && !this.tooSimilar(text, room, threshold)) { return text; }
            }
        }
        // Semua poin utama sudah dipakai → telusuri seluruh agenda (KPI, kualitas, stok,
        // statistik, C4.5, tren) supaya jawaban tetap baru, bukan mengulang kalimat lama.
        const agenda = entry ? buildAgenda(entry).sort((a, b) => b.weight - a.weight) : [];
        for (const item of agenda) {
            for (const tpl of templates) {
                const text = tpl.replace('{fact}', item.facts).replace('{action}', item.action);
                if (hasSubstance(text) && !this.tooSimilar(text, room, threshold)) { return text; }
            }
        }
        return '';
    }

    /**
     * Jawaban cadangan Diskusi AI — hanya angka yang benar-benar ada di analisis, tanpa mengarang.
     * Dipakai bila model gagal/kosong supaya ruang diskusi tetap memberi jawaban jujur dan tidak kaku.
     */
    private fallbackDiscussion(
        entry: StoredAnalysis | undefined,
        question: string,
        intent: DiscussionIntent = discussionIntent(question),
        _lang = langMeta('id'),
    ): string {
        const sheet = entry ? mainSheet(entry) : undefined;
        if (!sheet) {
            if (intent === 'how') {
                return 'Langkahnya: buka CSV/Excel lewat Date Skunder, tunggu panel analisis tampil, lalu kirim pertanyaannya lagi. Tanpa data, langkah lain hanya jadi tebakan.';
            }
            if (intent === 'cause') {
                return 'Belum bisa kutunjukkan penyebabnya karena di sesi ini belum ada data yang dianalisis. Buka CSV/Excel lewat Date Skunder dulu, lalu tanyakan lagi.';
            }
            return 'Di sesi ini belum ada angka yang bisa kuhitung — belum ada berkas yang dianalisis. Buka CSV/Excel lewat Date Skunder, lalu kirim pertanyaannya lagi.';
        }
        // Ambil satu butir teratas per dimensi supaya jawaban cadangan tidak hanya soal C4.5/quality.
        const agenda = buildAgenda(entry);
        const seen = new Set<string>();
        const facts: string[] = [];
        for (const dimension of ['kpi', 'stock', 'needs', 'quality', 'stats', 'tree', 'viz'] as const) {
            const best = agenda.filter((a) => a.dimension === dimension).sort((a, b) => b.weight - a.weight)[0];
            if (!best || seen.has(best.key)) { continue; }
            seen.add(best.key);
            facts.push(`- ${best.facts}`);
            if (facts.length >= 4) { break; }
        }
        const kepala = `Dari ${entry?.fileName} (sheet ${sheet.name}):`;
        const pembuka: Record<DiscussionIntent, string> = {
            cause: 'Penyebab paling mungkin, dilihat dari datanya:',
            how: 'Langkah yang paling aman dari data ini:',
            compare: 'Yang bisa dibandingkan dari data ini:',
            recommend: 'Saranku berdasarkan data ini:',
            define: 'Istilahnya begini; di data ini contohnya:',
            data: 'Angka yang bisa kupastikan:',
            general: 'Secara umum, lalu kaitannya ke data ini:',
        };
        const ekor = intent === 'how'
            ? ['1) Cek baris dengan sel kosong atau duplikat dulu.', '2) Bandingkan angka utama dengan periode sebelumnya.', '3) Baru ambil keputusan dari selisihnya.']
            : ['Kalau mau, sebutkan angka atau kolom yang ingin ditelusuri — aku hitungkan dari data ini.'];
        return [pembuka[intent], kepala, ...facts, ...ekor].join('\n');
    }

    private push(
        persona: Persona,
        lang: LangMeta,
        text: string,
        kind: LiveMessage['kind'],
        room: LiveRoom = 'komunitas',
        draftId?: string,
        extraNumbers: string[] = [],
        entry?: StoredAnalysis,
    ): boolean {
        // Model kadang menulis “Nama: …” atau memakai bahasa lain dari yang diminta.
        const body = stripPersonaPrefix(text, persona.name);
        if (!body) {
            this.endDraft(draftId, room);
            return false;
        }
        // Jaring pengaman terakhir: pesan obrolan tanpa isi atau kembar tidak pernah tampil.
        if (kind === 'chat' && (!hasSubstance(body) || this.tooSimilar(body, room, 0.86, true))) {
            this.endDraft(draftId, room);
            return false;
        }
        // Jaring pengaman angka: tidak ada angka di luar DATA yang boleh tampil.
        if ((kind === 'chat' || kind === 'answer')
            && this.foreignFor(body, entry ?? this.deps.store.last(), extraNumbers.join('\n')).length) {
            this.endDraft(draftId, room);
            return false;
        }
        let shownLang = lang;
        if (!langMatchesText(lang.code, body)) {
            const detected = detectLang(body);
            if (detected && detected !== lang.code) { shownLang = langMeta(detected); }
        }
        const message: LiveMessage = {
            id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: persona.name,
            bio: persona.bio,
            text: body,
            at: Date.now(),
            lang: shownLang.code,
            langTag: shownLang.tag,
            local: true,
            kind,
            room,
            channel: room === 'komunitas' ? this.channel : undefined,
            draftId,
        };
        this.messages.push(message);
        // Batas memori sesi: cukup untuk konteks & anti-duplikat, tidak tumbuh tanpa henti.
        if (this.messages.length > 4000) { this.messages.splice(0, this.messages.length - 4000); }
        if (room === 'diskusi') {
            // Diskusi AI: log ke data/data.txt, tetapi percakapannya hidup di Firebase `diskusi_ai`.
            appendChatLog('diskusi', persona.name, body);
            if (this.deps.remote?.enabled()) {
                this.deps.remote.publish({
                    name: persona.name,
                    bio: persona.bio,
                    text: body,
                    at: message.at,
                    lang: shownLang.code,
                    langTag: shownLang.tag,
                    kind,
                    channel: '',
                    room: 'diskusi',
                });
            }
        } else {
            const jenis = kind === 'chat' ? 'lokal' : kind === 'answer' ? 'jawaban' : 'sistem';
            appendChatLog('komunitas', persona.name, body, `${jenis}${shownLang.tag ? ` · ${shownLang.tag}` : ''}`, `KOMUNITAS #${this.channel}`);
            // Ruang Komunitas ikut disiarkan ke database Firebase; data/data.txt hanya arsip lokal.
            if (this.deps.remote?.enabled()) {
                this.deps.remote.publish({
                    name: persona.name,
                    bio: persona.bio,
                    text: body,
                    at: message.at,
                    lang: shownLang.code,
                    langTag: shownLang.tag,
                    kind,
                    channel: this.channel,
                });
            }
        }
        this.deps.post({ type: 'communityLive', message });
        this.postStatus();
        return true;
    }

    private pushSystem(
        persona: Persona,
        lang: LangMeta,
        text: string,
        kind: LiveMessage['kind'],
        room: LiveRoom = 'komunitas',
        draftId?: string,
    ): void {
        this.push(persona, lang, text, kind, room, draftId);
    }

    private postTyping(persona: Persona, lang: LangMeta, room: LiveRoom = 'komunitas'): void {
        this.deps.post({
            type: 'communityLiveTyping',
            room,
            name: persona.name,
            bio: persona.bio,
            lang: lang.code,
            langTag: lang.tag,
        });
    }

    /** Hentikan indikator “menulis…” tanpa mengirim pesan. */
    private endTyping(room: LiveRoom): void {
        this.deps.post({ type: 'communityLiveTyping', room, done: true });
    }

    private postStatus(): void {
        this.deps.post({ type: 'communityLiveStatus', status: this.status() });
    }
}

/** Kalimat bantuan saat llama-server belum siap. */
const HELP: Record<string, string> = {
    id: 'llama-server belum berjalan. Nyalakan lewat tombol ▶ di Chat AI atau view “LLAMA Server”, lalu kirim pertanyaannya lagi — saya jawab dengan angka dari analisis terakhir.',
    en: 'llama-server is not running yet. Start it with ▶ in Chat AI (or the “LLAMA Server” view), then ask again — I will answer with real numbers from your latest analysis.',
    zh: 'llama-server 尚未运行。请先在 Chat AI（或“LLAMA Server”视图）点击 ▶ 启动，然后重新提问——我会用最近一次分析的真实数据回答。',
    ja: 'llama-server が起動していません。Chat AI（または「LLAMA Server」ビュー）で ▶ を押して起動してから、もう一度質問してください。最新の分析の実数で回答します。',
    ko: 'llama-server가 아직 실행 중이 아닙니다. Chat AI(또는 “LLAMA Server” 보기)에서 ▶를 눌러 실행한 뒤 다시 질문해 주세요. 최근 분석의 실제 수치로 답하겠습니다.',
    es: 'llama-server todavía no está en marcha. Inícialo con ▶ en Chat AI (o en la vista “LLAMA Server”) y vuelve a preguntar: responderé con los números reales de tu último análisis.',
    fr: 'llama-server n’est pas encore démarré. Lancez-le avec ▶ dans Chat AI (ou la vue « LLAMA Server »), puis reposez la question : je répondrai avec les chiffres réels de votre dernière analyse.',
    ar: 'لم يتم تشغيل llama-server بعد. شغّله بزر ▶ في Chat AI (أو عرض “LLAMA Server”) ثم اسأل مرة أخرى — سأجيب بأرقام حقيقية من آخر تحليل.',
};

const NO_DATA: Record<string, string> = {
    id: 'Belum ada berkas yang dianalisis — buka CSV/Excel lewat Date Skunder dulu.',
    en: 'No file has been analysed yet — open a CSV/Excel with Date Skunder first.',
    zh: '还没有分析任何文件——请先用 Date Skunder 打开 CSV/Excel。',
    ja: 'まだ分析されたファイルがありません。まず Date Skunder で CSV/Excel を開いてください。',
    ko: '아직 분석된 파일이 없습니다. 먼저 Date Skunder로 CSV/Excel을 여세요.',
    es: 'Todavía no hay archivos analizados: abre un CSV/Excel con Date Skunder.',
    fr: 'Aucun fichier analysé pour le moment : ouvrez d’abord un CSV/Excel avec Date Skunder.',
    ar: 'لا يوجد ملف تم تحليله بعد — افتح CSV/Excel عبر Date Skunder أولاً.',
};

const FALLBACK_HEAD: Record<string, string> = {
    id: 'Ringkasnya',
    en: 'In short',
    zh: '简要结论',
    ja: '要点',
    ko: '요약',
    es: 'En resumen',
    fr: 'En bref',
    ar: 'باختصار',
};

const FALLBACK_CHATTER: Record<string, string[]> = {
    id: [
        '{topic} ini yang paling kelihatan: {fact}',
        'Coba lihat {topic} dulu — {fact}',
        'Soal {topic}: {fact}. Menurutku itu yang paling perlu dicek.',
    ],
    en: [
        'The clearest signal on {topic}: {fact}',
        'Worth checking {topic} — {fact}',
        'On {topic}: {fact}. That is what I would look at first.',
    ],
    zh: [
        '关于{topic}：{fact}',
        '{topic}这块，{fact}',
        '{fact}。这是{topic}里最值得先看的。',
    ],
    ja: [
        '{topic}で一番気になるのは、{fact}',
        '{topic}は一度見たほうがいい — {fact}',
        '{fact}。{topic}はまずここだと思う。',
    ],
    ko: [
        '{topic}에서 제일 눈에 띄는 건 {fact}',
        '{topic} 먼저 보는 게 좋겠어 — {fact}',
        '{fact}. {topic}에서 우선 볼 부분이야.',
    ],
    es: [
        'Lo más claro en {topic}: {fact}',
        'Vale la pena revisar {topic}: {fact}',
        'Sobre {topic}: {fact}. Eso miraría primero.',
    ],
    fr: [
        'Le signal le plus clair sur {topic} : {fact}',
        'À vérifier côté {topic} : {fact}',
        'Sur {topic} : {fact}. C’est ce que je regarderais d’abord.',
    ],
    ar: [
        'أوضح شيء في {topic}: {fact}',
        'يستحق النظر في {topic}: {fact}',
        'بخصوص {topic}: {fact}. هذا ما سأتحقق منه أولاً.',
    ],
};

/** Balasan saat pengguna hanya menulis kesopanan: poin utama + langkah, bukan “terima kasih”. */
const FALLBACK_POINT: Record<string, string[]> = {
    id: [
        'Poin yang paling perlu ditindak: {fact} Langkahnya: {action}.',
        'Kalau dilanjutkan, ini yang paling mendesak: {fact} Aku akan {action}.',
    ],
    en: [
        'The point that needs action: {fact} Next step: {action}.',
        'If we keep going, this matters most: {fact} I would {action}.',
    ],
    zh: [
        '最需要处理的一点：{fact} 下一步：{action}。',
        '继续之前先看这里：{fact} 我会{action}。',
    ],
    ja: [
        'まず対処すべき点：{fact} 次は{action}。',
        '続ける前にここが重要です：{fact} {action}つもりです。',
    ],
    ko: [
        '가장 먼저 처리할 점: {fact} 다음 단계: {action}.',
        '계속하기 전에 이게 중요합니다: {fact} 다음으로 {action}.',
    ],
    es: [
        'Lo que más urge: {fact} Siguiente paso: {action}.',
        'Si seguimos, esto es lo importante: {fact} Yo {action}.',
    ],
    fr: [
        'Le point le plus urgent : {fact} Ensuite : {action}.',
        'Avant de continuer, voici l’essentiel : {fact} Je vais {action}.',
    ],
    ar: [
        'أهم نقطة تحتاج إجراءً: {fact} الخطوة التالية: {action}.',
        'قبل المتابعة، هذا الأهم: {fact} سأ{action}.',
    ],
};
