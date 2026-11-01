/**
 * Token & kuota untuk fitur “Compile MSI” (website → installer).
 *
 * Aturan mainnya:
 *  - Token hanya bisa dibuat lewat website lokal `api/token.html` (src/tokenServer.ts).
 *  - Satu token dipakai untuk sejumlah percobaan compile (bawaan 5).
 *  - Kuota berlaku per komputer: maksimal 5 compile dalam satu jendela 5 jam.
 *    Saat jatah habis, compile DAN pembuatan token diblokir sampai jendela berikutnya
 *    (5 jam sejak percobaan pertama). Jadi token tidak bisa dipakai untuk mengakali kuota.
 *  - Yang disimpan hanya SHA-256 token (bukan teks aslinya); token aktif di SecretStorage.
 */
import { createHash, randomBytes } from 'crypto';

export const TOKEN_KEY = 'dateSkunder.compile.tokens';
export const QUOTA_KEY = 'dateSkunder.compile.quota';
export const TOKEN_PREFIX = 'SLM';
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const GROUP = 4;
const GROUPS = 3;
const SALT = 'dateSkunder.compile.msi.v2';

export type TokenReason = 'ok' | 'format' | 'unknown' | 'expired' | 'exhausted' | 'cooldown';

export interface TokenRecord {
    attempts: number;
    total: number;
    createdAt: number;
    expiresAt: number;
    lastUsed?: number;
}

export type TokenMap = Record<string, TokenRecord>;

/** Kuota per komputer: 5 compile per jendela 5 jam. */
export interface QuotaRecord {
    /** Percobaan yang sudah dipakai di jendela ini. */
    used: number;
    /** Awal jendela (0 = belum mulai). */
    windowStart: number;
    /** Sampai kapan compile/token diblokir (0 = tidak diblokir). */
    blockedUntil: number;
}

/** Penyimpanan minimal — dipenuhi globalState VS Code atau Map saat pengujian. */
export interface TokenStore {
    get<T>(key: string, fallback: T): T;
    update(key: string, value: TokenMap | QuotaRecord | undefined): Thenable<void> | void;
}

export interface TokenRules {
    /** Percobaan compile per token (1 – 12). */
    attempts: number;
    /** Masa berlaku token dalam menit. */
    minutes: number;
    /** Lama blokir setelah kuota habis, dalam jam. */
    cooldownHours: number;
}

export interface QuotaView {
    limit: number;
    used: number;
    left: number;
    windowStart: number;
    blockedUntil: number;
    /** 0 = tidak diblokir. */
    retryAfterMs: number;
    cooldownMs: number;
}

export interface TokenStatus {
    ok: boolean;
    reason: TokenReason;
    valid: boolean;
    attemptsLeft: number;
    total: number;
    expiresAt: number;
    id: string;
    message: string;
    /** Ringkasan kuota komputer saat status dibuat. */
    quota: QuotaView;
}

export interface TokenView {
    id: string;
    attemptsLeft: number;
    total: number;
    createdAt: number;
    expiresAt: number;
    lastUsed?: number;
}

const EMPTY_QUOTA: QuotaRecord = { used: 0, windowStart: 0, blockedUntil: 0 };
const DEFAULT_RULES: TokenRules = { attempts: 5, minutes: 1440, cooldownHours: 5 };

/** Batasi aturan dari pengaturan supaya nilai aneh tidak merusak penyimpanan. */
export function normalizeRules(rules: Partial<TokenRules> | undefined): TokenRules {
    const attempts = Math.round(Number(rules?.attempts ?? DEFAULT_RULES.attempts));
    const minutes = Math.round(Number(rules?.minutes ?? DEFAULT_RULES.minutes));
    const cooldownHours = Math.round(Number(rules?.cooldownHours ?? DEFAULT_RULES.cooldownHours));
    return {
        attempts: Number.isFinite(attempts) ? Math.min(12, Math.max(1, attempts)) : DEFAULT_RULES.attempts,
        minutes: Number.isFinite(minutes) ? Math.min(10080, Math.max(5, minutes)) : DEFAULT_RULES.minutes,
        cooldownHours: Number.isFinite(cooldownHours) ? Math.min(48, Math.max(1, cooldownHours)) : DEFAULT_RULES.cooldownHours,
    };
}

/** Token baru berbentuk `SLM-XXXX-XXXX-XXXX`. */
export function newToken(): string {
    const bytes = randomBytes(GROUP * GROUPS);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        // 31 = 0b11111 → tiap byte dipakai 5 bit, jadi pembagiannya merata.
        out += ALPHABET[bytes[i] & 31];
        if ((i + 1) % GROUP === 0 && i + 1 < bytes.length) { out += '-'; }
    }
    return `${TOKEN_PREFIX}-${out}`;
}

/** Bentuk baku token: huruf besar, hanya A–Z/2–9, dengan tanda hubung tiap 4 karakter. */
export function canonicalToken(input: unknown): string {
    const raw = String(input ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!raw.startsWith(TOKEN_PREFIX)) { return ''; }
    const body = raw.slice(TOKEN_PREFIX.length);
    if (body.length !== GROUP * GROUPS) { return ''; }
    const groups: string[] = [];
    for (let i = 0; i < body.length; i += GROUP) { groups.push(body.slice(i, i + GROUP)); }
    return `${TOKEN_PREFIX}-${groups.join('-')}`;
}

/** SHA-256 bentuk baku (disimpan sebagai kunci peta). */
export function hashToken(token: string): string {
    return createHash('sha256').update(`${SALT}:${token}`).digest('hex');
}

/** Kode pendek untuk ditampilkan di UI/website. */
export function tokenId(hash: string): string {
    return hash.slice(0, 6).toUpperCase();
}

/** Bentuk tampilan yang aman untuk daftar token (`SLM-7K2Q-••••`). */
export function maskToken(token: string): string {
    const canonical = canonicalToken(token);
    if (!canonical) { return ''; }
    return `${canonical.slice(0, 8)}-••••`;
}

/** “4 jam 59 menit” — dipakai pesan blokir. */
export function humanDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 60000));
    const jam = Math.floor(total / 60);
    const menit = total % 60;
    if (jam && menit) { return `${jam} jam ${menit} menit`; }
    if (jam) { return `${jam} jam`; }
    if (menit) { return `${menit} menit`; }
    return 'kurang dari 1 menit';
}

/**
 * Pengelola token + kuota. Semua perubahan ditulis ke penyimpanan supaya kuota tidak
 * kembali setelah VS Code ditutup.
 */
export class MsiTokens {
    constructor(
        private readonly store: TokenStore,
        private readonly rules: () => Partial<TokenRules> = () => ({}),
        private readonly now: () => number = () => Date.now(),
    ) { }

    get rule(): TokenRules { return normalizeRules(this.rules()); }

    /** Keadaan kuota saat ini (sudah memperhitungkan reset otomatis). */
    quota(): QuotaView {
        const rule = this.rule;
        const cooldownMs = rule.cooldownHours * 3600000;
        const rec = this.loadQuota();
        const at = this.now();
        let used = rec.used;
        let windowStart = rec.windowStart;
        let blockedUntil = rec.blockedUntil;
        let dirty = false;

        if (blockedUntil && at >= blockedUntil) {
            used = 0;
            windowStart = 0;
            blockedUntil = 0;
            dirty = true;
        }
        if (!blockedUntil && windowStart && at - windowStart >= cooldownMs) {
            used = 0;
            windowStart = 0;
            dirty = true;
        }
        if (dirty) { this.saveQuota({ used, windowStart, blockedUntil }); }

        const retryAfterMs = blockedUntil > at ? blockedUntil - at : 0;
        return {
            limit: rule.attempts,
            used: Math.min(rule.attempts, Math.max(0, used)),
            left: Math.max(0, rule.attempts - Math.min(rule.attempts, Math.max(0, used))),
            windowStart,
            blockedUntil,
            retryAfterMs,
            cooldownMs,
        };
    }

    /** Token yang masih punya sisa percobaan dan belum kedaluwarsa. */
    list(): TokenView[] {
        const map = this.loadTokens();
        let dirty = false;
        const views: TokenView[] = [];
        for (const [hash, rec] of Object.entries(map)) {
            if (this.dead(rec)) {
                delete map[hash];
                dirty = true;
                continue;
            }
            views.push({
                id: tokenId(hash),
                attemptsLeft: rec.attempts,
                total: rec.total,
                createdAt: rec.createdAt,
                expiresAt: rec.expiresAt,
                lastUsed: rec.lastUsed,
            });
        }
        if (dirty) { this.saveTokens(map); }
        return views.sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * Buat token baru. Ditolak (tanpa membuat token) saat kuota komputer sedang diblokir,
     * jadi menunggu 5 jam juga berlaku untuk pembuatan token.
     */
    generate(): { ok: true; token: string; status: TokenStatus } | { ok: false; quota: QuotaView; message: string } {
        const rule = this.rule;
        const quota = this.quota();
        if (quota.retryAfterMs > 0 || quota.left <= 0) {
            const tunggu = humanDuration(Math.max(quota.retryAfterMs, 1000));
            return {
                ok: false,
                quota,
                message: `Jatah ${quota.limit} compile sudah habis. Tunggu ${tunggu} lagi sebelum membuat token baru.`,
            };
        }

        const map = this.loadTokens();
        for (const [hash, rec] of Object.entries(map)) {
            if (this.dead(rec)) { delete map[hash]; }
        }
        const alive = Object.entries(map).sort((a, b) => b[1].createdAt - a[1].createdAt);
        for (const [hash] of alive.slice(24)) { delete map[hash]; }

        const token = newToken();
        const hash = hashToken(token);
        const at = this.now();
        map[hash] = {
            // Token hanya boleh dipakai sebanyak sisa kuota komputer saat dibuat.
            attempts: quota.left,
            total: rule.attempts,
            createdAt: at,
            expiresAt: at + rule.minutes * 60000,
        };
        this.saveTokens(map);
        return { ok: true, token, status: this.statusOf(hash, map[hash]) };
    }

    /** Periksa token tanpa memakai percobaan. */
    check(token: string): TokenStatus {
        const canonical = canonicalToken(token);
        if (!canonical) {
            return this.fail('format', 'Token belum diisi atau bentuknya salah (contoh: SLM-ABCD-EFGH-JKLM).', '', 0, this.rule.attempts);
        }
        const hash = hashToken(canonical);
        const map = this.loadTokens();
        const rec = map[hash];
        if (!rec) {
            return this.fail(
                'unknown',
                'Token tidak dikenal di komputer ini. Buat token baru di website (view Compile MSI → 🌐 Website Token).',
                tokenId(hash), 0, this.rule.attempts,
            );
        }
        return this.statusOf(hash, rec);
    }

    /**
     * Pakai satu percobaan. Token yang salah tidak memotong jatah, tetapi percobaan yang
     * dimulai selalu menambah kuota komputer.
     */
    consume(token: string): TokenStatus {
        const before = this.check(token);
        if (!before.valid) { return before; }

        const canonical = canonicalToken(token);
        const hash = hashToken(canonical);
        const map = this.loadTokens();
        const rec = map[hash];
        if (!rec) { return this.check(token); }

        const rule = this.rule;
        const cooldownMs = rule.cooldownHours * 3600000;
        const at = this.now();
        const quota = this.loadQuota();
        let used = quota.used;
        let windowStart = quota.windowStart;
        let blockedUntil = quota.blockedUntil;

        // Jendela lama sudah lewat → mulai hitungan baru.
        if (blockedUntil && at >= blockedUntil) {
            used = 0;
            windowStart = 0;
            blockedUntil = 0;
        }
        if (!blockedUntil && windowStart && at - windowStart >= cooldownMs) {
            used = 0;
            windowStart = 0;
        }
        if (!windowStart) { windowStart = at; }
        used += 1;

        rec.attempts = Math.max(0, rec.attempts - 1);
        rec.lastUsed = at;
        map[hash] = rec;
        this.saveTokens(map);

        if (used >= rule.attempts) {
            blockedUntil = at + cooldownMs;
        }
        this.saveQuota({ used, windowStart, blockedUntil });

        const sisa = Math.max(0, rule.attempts - Math.min(rule.attempts, used));
        if (blockedUntil > at) {
            return {
                ...this.statusOf(hash, rec),
                ok: true,
                reason: 'cooldown',
                valid: false,
                message: `Percobaan ke-${used} dari ${rule.attempts} terpakai. Jatah habis — tunggu ${rule.cooldownHours} jam untuk reset otomatis (termasuk token baru).`,
            };
        }
        return {
            ...this.statusOf(hash, rec),
            ok: true,
            valid: sisa > 0 && rec.attempts > 0,
            message: `Satu percobaan terpakai. Sisa ${sisa} dari ${rule.attempts} di jendela ${rule.cooldownHours} jam ini.`,
        };
    }

    /** Hapus satu token (mis. salah bagikan). Kuota komputer tidak ikut direset. */
    revoke(token: string): boolean {
        const canonical = canonicalToken(token);
        if (!canonical) { return false; }
        const map = this.loadTokens();
        const hash = hashToken(canonical);
        if (!map[hash]) { return false; }
        delete map[hash];
        this.saveTokens(map);
        return true;
    }

    /** Hapus semua token (kuota tetap berjalan). */
    clear(): number {
        const map = this.loadTokens();
        const count = Object.keys(map).length;
        if (count) { this.saveTokens({}); }
        return count;
    }

    /** Reset kuota — hanya dipakai pengujian/pemeliharaan. */
    resetQuota(): void {
        this.saveQuota({ ...EMPTY_QUOTA });
    }

    private fail(reason: TokenReason, message: string, id: string, attemptsLeft: number, total: number): TokenStatus {
        return {
            ok: false,
            reason,
            valid: false,
            attemptsLeft,
            total,
            expiresAt: 0,
            id,
            message,
            quota: this.quota(),
        };
    }

    private statusOf(hash: string, rec: TokenRecord): TokenStatus {
        const id = tokenId(hash);
        const quota = this.quota();
        const base = {
            attemptsLeft: rec.attempts,
            total: rec.total,
            expiresAt: rec.expiresAt,
            id,
            quota,
        };
        if (rec.expiresAt <= this.now()) {
            return { ...base, ok: false, reason: 'expired', valid: false, message: 'Token sudah kedaluwarsa. Buat token baru di website.' };
        }
        if (quota.retryAfterMs > 0) {
            return {
                ...base,
                ok: false,
                reason: 'cooldown',
                valid: false,
                message: `Kuota ${quota.limit} compile sudah habis. Tunggu ${humanDuration(quota.retryAfterMs)} lagi — membuat token baru juga baru bisa setelah itu.`,
            };
        }
        if (quota.left <= 0) {
            return { ...base, ok: false, reason: 'cooldown', valid: false, message: `Jatah ${quota.limit} compile habis. Tunggu ${humanDuration(quota.cooldownMs)} untuk reset otomatis.` };
        }
        if (rec.attempts <= 0) {
            return {
                ...base,
                ok: false,
                reason: 'exhausted',
                valid: false,
                message: `Token ini sudah terpakai ${rec.total} kali. Buat token baru di website (kuota komputer: ${quota.left}/${quota.limit}).`,
            };
        }
        return {
            ...base,
            ok: true,
            reason: 'ok',
            valid: true,
            message: `Token sah — sisa ${rec.attempts} percobaan token, ${quota.left}/${quota.limit} kuota komputer.`,
        };
    }

    private dead(rec: TokenRecord): boolean {
        return rec.attempts <= 0 || rec.expiresAt <= this.now();
    }

    private loadTokens(): TokenMap {
        const raw = this.store.get<unknown>(TOKEN_KEY, {});
        const map: TokenMap = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            for (const [hash, value] of Object.entries(raw as Record<string, unknown>)) {
                const rec = value as Partial<TokenRecord> | undefined;
                if (!rec || typeof rec !== 'object') { continue; }
                const attempts = Math.max(0, Math.min(99, Math.round(Number(rec.attempts) || 0)));
                const total = Math.max(attempts, Math.min(99, Math.round(Number(rec.total) || attempts)));
                const createdAt = Number(rec.createdAt) || 0;
                const expiresAt = Number(rec.expiresAt) || 0;
                if (!hash || !createdAt) { continue; }
                map[hash] = { attempts, total, createdAt, expiresAt, lastUsed: Number(rec.lastUsed) || undefined };
            }
        }
        return map;
    }

    private saveTokens(map: TokenMap): void {
        const empty = Object.keys(map).length === 0;
        void this.store.update(TOKEN_KEY, empty ? undefined : map);
    }

    private loadQuota(): QuotaRecord {
        const raw = this.store.get<unknown>(QUOTA_KEY, EMPTY_QUOTA);
        const rec = raw && typeof raw === 'object' ? raw as Partial<QuotaRecord> : {};
        return {
            used: Math.max(0, Math.min(99, Math.round(Number(rec.used) || 0))),
            windowStart: Number(rec.windowStart) || 0,
            blockedUntil: Number(rec.blockedUntil) || 0,
        };
    }

    private saveQuota(value: QuotaRecord): void {
        const kosong = !value.used && !value.windowStart && !value.blockedUntil;
        void this.store.update(QUOTA_KEY, kosong ? undefined : value);
    }
}
