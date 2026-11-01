import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
    ARTICLE_COLLECTION,
    databaseKey,
    databaseProjectId,
} from './community';

const PUBLISH_VIEW = 'dateSkunder.publishView';
const SESSION_SECRET = 'dateSkunder.publish.session';
const DRAFT_KEY = 'dateSkunder.publish.draft';
const CACHE_KEY = 'dateSkunder.publish.cache';
/** Koleksi artikel cadangan: dipakai otomatis bila koleksi utama menolak akun yang sudah masuk. */
const ARTICLE_COLLECTION_FALLBACK = 'community_artikel';
const COLLECTION_KEY = 'dateSkunder.publish.collection';

const IDENTITY_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_BASE = 'https://securetoken.googleapis.com/v1/token';

export interface PublishArticle {
    id: string;
    title: string;
    lead: string;
    body: string;
    link: string;
    cover: string;
    authorName: string;
    authorEmail: string;
    authorUid: string;
    createdAt: number;
}

export interface ArticleInput {
    title: string;
    lead: string;
    body: string;
    link: string;
    cover: string;
    authorName: string;
}

export interface PublishSession {
    idToken: string;
    refreshToken: string;
    email: string;
    localId: string;
    expiresAt: number;
}

interface HttpReply {
    status: number;
    body: any;
}

/* ── validasi & pesan galat (dipakai juga oleh pemeriksaan otomatis) ─────────── */

export function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

/** Periksa isi artikel; `undefined` = sah. Pesan dalam Bahasa Indonesia yang bisa langsung ditampilkan. */
export function validateArticle(input: Partial<ArticleInput>): string | undefined {
    const title = String(input.title ?? '').trim();
    if (title.length < 3) { return 'Judul artikel minimal 3 karakter.'; }
    if (title.length > 120) { return 'Judul artikel maksimal 120 karakter.'; }
    const lead = String(input.lead ?? '').trim();
    if (lead.length < 10) { return 'Ringkasan pembuka minimal 10 karakter.'; }
    if (lead.length > 600) { return 'Ringkasan pembuka maksimal 600 karakter.'; }
    const link = String(input.link ?? '').trim();
    if (!link) { return 'Tautan tujuan wajib diisi.'; }
    if (!isHttpUrl(link)) { return 'Tautan tujuan harus diawali http:// atau https://.'; }
    const cover = String(input.cover ?? '').trim();
    if (cover && !isHttpUrl(cover)) { return 'Tautan sampul harus diawali http:// atau https://.'; }
    if (String(input.body ?? '').length > 12000) { return 'Isi artikel maksimal 12.000 karakter.'; }
    if (String(input.authorName ?? '').trim().length > 60) { return 'Nama penulis maksimal 60 karakter.'; }
    return undefined;
}

/** Terjemahan kode galat akun database → kalimat yang bisa dimengerti pengguna. */
export function authErrorMessage(code: string, fallback?: string): string {
    const map: Record<string, string> = {
        EMAIL_EXISTS: 'Email ini sudah terdaftar — pilih tab Masuk.',
        EMAIL_NOT_FOUND: 'Email belum terdaftar — pilih tab Daftar untuk membuat akun.',
        INVALID_PASSWORD: 'Kata sandi salah. Periksa lagi.',
        INVALID_LOGIN_CREDENTIALS: 'Email atau kata sandi salah. Periksa lagi.',
        INVALID_EMAIL: 'Format email tidak valid, mis. nama@contoh.com.',
        MISSING_PASSWORD: 'Kata sandi wajib diisi.',
        WEAK_PASSWORD: 'Kata sandi terlalu lemah — minimal 6 karakter.',
        OPERATION_NOT_ALLOWED: 'Masuk dengan email & kata sandi belum diaktifkan di database.',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
        USER_DISABLED: 'Akun ini dinonaktifkan di database.',
        API_KEY_INVALID: 'Kunci database tidak valid. Periksa pengaturan dateSkunder.community.webKey.',
        TOKEN_EXPIRED: 'Sesi sudah kedaluwarsa — masuk lagi.',
        INVALID_REFRESH_TOKEN: 'Sesi tidak berlaku lagi — masuk lagi.',
        QUOTA_EXCEEDED: 'Kuota database habis. Coba lagi nanti.',
    };
    if (map[code]) { return map[code]; }
    const detail = String(fallback || '').replace(/^[A-Z_]+ : /, '').trim();
    if (detail) { return detail; }
    if (/^HTTP \d{3}$/.test(String(code))) {
        return `Database membalas ${String(code).slice(5)}. Coba lagi beberapa saat atau periksa pengaturan database.`;
    }
    return 'Gagal menghubungi database. Periksa koneksi internet lalu coba lagi.';
}

export type DatabaseState = 'checking' | 'online' | 'auth' | 'rules' | 'key' | 'offline' | 'error';

export interface DatabaseStatus {
    state: DatabaseState;
    ok: boolean;
    message: string;
    projectId: string;
    collection: string;
    signedIn: boolean;
    at: number;
}

/** Ambil kode/pesan dari galat database — termasuk bentuk array dari Firestore. */
export function firestoreErrorInfo(body: any): { code: string; message: string; status: number } {
    const candidate = Array.isArray(body)
        ? body.map((row: any) => row?.error).find(Boolean)
        : body?.error;
    const message = String(candidate?.message || '').trim();
    const status = Number(candidate?.code) || 0;
    const first = message.split(/\s+/)[0] || '';
    const code = String(candidate?.status || '').trim()
        || (/^[A-Z][A-Z0-9_]+$/.test(first) ? first : '');
    return { code, message, status };
}

/** Pesan galat database yang bisa dibaca pengguna (tanpa menyebut penyedia). */
export function databaseStatusMessage(status: number, body: any, signedIn = false): string {
    const info = firestoreErrorInfo(body);
    const code = info.code.toUpperCase();
    const text = info.message;
    const http = Number(status) || info.status;
    if (code === 'API_KEY_INVALID' || /api key not valid/i.test(text)) {
        return 'Kunci database tidak valid. Periksa pengaturan dateSkunder.community.webKey.';
    }
    if (http === 401 || code === 'UNAUTHENTICATED') {
        return 'Sesi database sudah berakhir — masuk lagi dengan email & kata sandi.';
    }
    if (http === 403 || code === 'PERMISSION_DENIED') {
        return signedIn
            ? 'Database menolak akun ini. Pastikan aturan koleksi "articles" (atau "community_artikel") mengizinkan pengguna yang sudah masuk untuk membaca & menulis.'
            : 'Masuk dulu dengan email & kata sandi database untuk membaca dan menerbitkan artikel.';
    }
    if (http === 404 || code === 'NOT_FOUND') {
        return 'Koleksi “articles” belum ada di database. Artikel pertama akan membuatnya.';
    }
    if (http === 429 || code === 'RESOURCE_EXHAUSTED') {
        return 'Kuota database sedang penuh. Coba lagi beberapa saat lagi.';
    }
    if (http >= 500) {
        return 'Database sedang tidak tersedia. Coba lagi beberapa saat lagi.';
    }
    if (/requires an index/i.test(text)) {
        return 'Database meminta indeks untuk daftar artikel. Muat ulang beberapa saat lagi atau hubungi pemilik database.';
    }
    return text || `Database membalas HTTP ${http || '?'}.`;
}

/** Galat jaringan (bukan balasan database) → kalimat yang bisa ditindaklanjuti. */
export function networkMessage(error: any): string {
    const code = String(error?.code || '').toUpperCase();
    const text = String(error?.message || error || '');
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        return 'Tidak bisa menjangkau database: nama host tidak ditemukan. Periksa koneksi internet.';
    }
    if (code === 'ECONNREFUSED') {
        return 'Koneksi ke database ditolak. Coba lagi beberapa saat lagi.';
    }
    if (code === 'ETIMEDOUT' || /timeout|waktu koneksi/i.test(text)) {
        return 'Waktu koneksi database habis. Periksa koneksi lalu coba lagi.';
    }
    if (/socket hang up|ECONNRESET|EPIPE/i.test(`${code} ${text}`)) {
        return 'Koneksi database terputus. Coba lagi.';
    }
    return text || 'Gagal menghubungi database. Periksa koneksi internet lalu coba lagi.';
}

/** Susun field Firestore dari isi artikel (bentuk REST: { stringValue | integerValue | booleanValue }). */
export function articleFields(input: ArticleInput, session: PublishSession): Record<string, unknown> {
    const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
    return {
        title: { stringValue: clean(input.title, 120) },
        lead: { stringValue: clean(input.lead, 600) },
        body: { stringValue: clean(input.body, 12000) },
        link: { stringValue: clean(input.link, 800) },
        cover: { stringValue: clean(input.cover, 800) },
        authorName: { stringValue: clean(input.authorName || session.email.split('@')[0], 60) },
        authorEmail: { stringValue: clean(session.email, 160) },
        authorUid: { stringValue: clean(session.localId, 128) },
        createdAt: { integerValue: String(Date.now()) },
        published: { booleanValue: true },
    };
}

/* ── HTTP kecil tanpa dependensi ─────────────────────────────────────────────── */

function requestJson(method: string, url: string, payload?: unknown, token?: string, timeoutMs = 20000): Promise<HttpReply> {
    return new Promise((resolve, reject) => {
        let target: URL;
        try { target = new URL(url); } catch { reject(new Error('Alamat database tidak valid.')); return; }
        const data = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), 'utf8');
        // Server tiruan pada pemeriksaan otomatis memakai http://127.0.0.1; aslinya selalu https.
        const req = (target.protocol === 'http:' ? http : https).request({
            method,
            port: target.port || undefined,
            hostname: target.hostname,
            path: `${target.pathname}${target.search}`,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': String(data.length) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            timeout: timeoutMs,
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let body: any = {};
                try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
                resolve({ status: res.statusCode || 0, body });
            });
        });
        req.on('timeout', () => req.destroy(new Error(networkMessage({ code: 'ETIMEDOUT' }))));
        req.on('error', (e) => reject(new Error(networkMessage(e))));
        if (data) { req.write(data); }
        req.end();
    });
}

const errorCode = (body: any): string => firestoreErrorInfo(body).code || String(body?.error?.message || '').split(' ')[0] || '';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/* ── view ───────────────────────────────────────────────────────────────────── */

export class PublishViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private session?: PublishSession;
    private articles: PublishArticle[] = [];
    private ready = false;
    private lastDb: DatabaseStatus = {
        state: 'checking',
        ok: false,
        message: 'memeriksa koneksi database…',
        projectId: databaseProjectId(),
        collection: ARTICLE_COLLECTION,
        signedIn: false,
        at: 0,
    };

    constructor(private ctx: vscode.ExtensionContext, private log: (line: string) => void = () => undefined) { }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
        };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
        view.onDidDispose(() => { this.view = undefined; this.ready = false; });
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'publish.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'publish.js'));
        const n = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
        const cfg = {
            collection: this.knownCollection(),
            projectId: databaseProjectId(),
        };
        // img-src https: agar sampul dari tautan web bisa tampil; tidak ada connect-src:
        // seluruh permintaan jaringan dilakukan extension host.
        return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data: https:;">
<link href="${css}" rel="stylesheet">
<title>Publish</title>
</head>
<body class="pub-body">
<div class="pub-root">
    <header class="pub-head">
        <div class="pub-brand">
            <span class="pub-mark">📚</span>
            <div>
                <b>Publish</b>
                <div class="pub-sub">Artikel Date Skunder · tata letak ensiklopedia</div>
            </div>
        </div>
        <span id="pub-state" class="pub-state">menyiapkan…</span>
    </header>

    <div id="pub-db" class="pub-db" data-state="checking">
        <span class="pub-db-dot" aria-hidden="true"></span>
        <span id="pub-db-text" class="pub-db-text">Database: memeriksa koneksi…</span>
        <button id="pub-db-check" class="pub-link" type="button" title="Uji koneksi database sekarang">Uji koneksi</button>
    </div>

    <section id="pub-auth" class="pub-card pub-auth" hidden>
        <div class="pub-auth-lead">Masuk dengan <b>email &amp; kata sandi</b> database untuk menerbitkan artikel. Belum punya akun? Pilih <b>Daftar</b>.</div>
        <div class="pub-auth-tabs" role="tablist">
            <button id="pub-mode-in" class="pub-auth-tab on" type="button" role="tab" aria-selected="true">Masuk</button>
            <button id="pub-mode-up" class="pub-auth-tab" type="button" role="tab" aria-selected="false">Daftar</button>
        </div>
        <form id="pub-auth-form" autocomplete="on">
            <label class="pub-field">Email
                <input id="pub-email" type="email" inputmode="email" autocomplete="username" placeholder="nama@contoh.com" />
            </label>
            <label class="pub-field">Kata sandi
                <input id="pub-pass" type="password" autocomplete="current-password" placeholder="minimal 6 karakter" />
            </label>
            <label id="pub-pass2-wrap" class="pub-field" hidden>Ulangi kata sandi
                <input id="pub-pass2" type="password" autocomplete="new-password" placeholder="ketik ulang kata sandi" />
            </label>
            <button id="pub-auth-submit" class="pub-btn" type="submit">Masuk</button>
        </form>
        <div id="pub-auth-msg" class="pub-msg" hidden></div>
    </section>

    <section id="pub-who" class="pub-who" hidden>
        <span class="pub-who-text">Masuk sebagai <b id="pub-who-email"></b></span>
        <button id="pub-signout" class="pub-link" type="button">Keluar</button>
    </section>

    <nav class="pub-tabs" role="tablist">
        <button id="pub-tab-write" class="pub-tab on" type="button" role="tab" aria-selected="true">✍️ Tulis</button>
        <button id="pub-tab-read" class="pub-tab" type="button" role="tab" aria-selected="false">📖 Jelajahi</button>
    </nav>

    <section id="pub-pane-write" class="pub-pane">
        <div class="pub-hint">Judul, ringkasan pembuka, isi, tautan tujuan, dan sampul dari tautan gambar web. Artikel tampil rapi seperti halaman ensiklopedia.</div>
        <label class="pub-field">Judul artikel
            <input id="pub-title" type="text" maxlength="120" placeholder="mis. Analisis Kualitas Data Supermarket" />
        </label>
        <label class="pub-field">Ringkasan pembuka (lead)
            <textarea id="pub-lead" rows="3" maxlength="600" placeholder="Satu paragraf pembuka: apa isi artikel ini dan mengapa penting."></textarea>
        </label>
        <label class="pub-field">Isi artikel
            <textarea id="pub-body" rows="8" maxlength="12000" placeholder="Tulis isi lengkap. Pisahkan paragraf dengan satu baris kosong."></textarea>
        </label>
        <label class="pub-field">Tautan tujuan
            <input id="pub-link" type="url" placeholder="https://contoh.com/artikel-lengkap" />
        </label>
        <label class="pub-field">Sampul (tautan gambar web)
            <input id="pub-cover" type="url" placeholder="https://contoh.com/gambar-sampul.jpg" />
        </label>
        <label class="pub-field">Nama penulis
            <input id="pub-author" type="text" maxlength="60" placeholder="Nama yang tampil di artikel" />
        </label>
        <div class="pub-actions">
            <button id="pub-publish" class="pub-btn" type="button">Terbitkan artikel</button>
            <button id="pub-clear" class="pub-link" type="button">Kosongkan</button>
        </div>
        <div id="pub-msg" class="pub-msg" hidden></div>
        <div id="pub-preview" class="pub-preview" hidden></div>
    </section>

    <section id="pub-pane-read" class="pub-pane" hidden>
        <div class="pub-toolbar">
            <input id="pub-search" class="pub-search" type="search" placeholder="Cari artikel…" />
            <button id="pub-reload" class="pub-ib" type="button" title="Muat ulang daftar artikel">⟳</button>
        </div>
        <div id="pub-count" class="pub-count"></div>
        <div id="pub-list" class="pub-list"></div>
        <article id="pub-article" class="pub-article" hidden></article>
    </section>
</div>
<script nonce="${n}">window.SKUNDER_PUBLISH = ${JSON.stringify(cfg)};</script>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    /* ── sesi ────────────────────────────────────────────────────────────────── */

    private async readSecret(key: string): Promise<string | undefined> {
        try { return await this.ctx.secrets.get(key); } catch { return undefined; }
    }

    private async writeSecret(key: string, value: string | undefined): Promise<void> {
        try {
            if (value === undefined) { await this.ctx.secrets.delete(key); }
            else { await this.ctx.secrets.store(key, value); }
        } catch { /* tanpa SecretStorage sesi hanya berlaku selama view hidup */ }
    }

    private async restoreSession(): Promise<PublishSession | undefined> {
        if (this.session) { return this.session; }
        const raw = await this.readSecret(SESSION_SECRET);
        if (!raw) { return undefined; }
        try {
            const saved = JSON.parse(raw) as PublishSession;
            if (!saved?.refreshToken) { return undefined; }
            this.session = saved;
            return saved;
        } catch {
            return undefined;
        }
    }

    /** Token masih berlaku? Bila tidak, perbarui dengan refresh token. */
    private async ensureSession(): Promise<PublishSession> {
        const session = await this.restoreSession();
        if (!session) { throw new Error('Masuk dulu dengan email & kata sandi database.'); }
        if (Date.now() < session.expiresAt - 60000) { return session; }
        const res = await requestJson(
            'POST',
            `${TOKEN_BASE}?key=${encodeURIComponent(databaseKey())}`,
            { grant_type: 'refresh_token', refresh_token: session.refreshToken },
        );
        const body = res.body || {};
        if (res.status !== 200 || !body.id_token) {
            await this.signOut();
            throw new Error(authErrorMessage(errorCode(body) || 'TOKEN_EXPIRED'));
        }
        const next: PublishSession = {
            ...session,
            idToken: String(body.id_token),
            refreshToken: String(body.refresh_token || session.refreshToken),
            localId: String(body.user_id || session.localId),
            expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
        };
        this.session = next;
        await this.writeSecret(SESSION_SECRET, JSON.stringify(next));
        return next;
    }

    private async signIn(email: string, password: string, mode: 'signIn' | 'signUp'): Promise<PublishSession> {
        const action = mode === 'signUp' ? 'signUp' : 'signInWithPassword';
        const res = await requestJson(
            'POST',
            `${IDENTITY_BASE}:${action}?key=${encodeURIComponent(databaseKey())}`,
            { email: String(email).trim(), password: String(password), returnSecureToken: true },
        );
        const body = res.body || {};
        if (res.status !== 200 || !body.idToken) {
            throw new Error(authErrorMessage(errorCode(body) || `HTTP ${res.status}`));
        }
        const session: PublishSession = {
            idToken: String(body.idToken),
            refreshToken: String(body.refreshToken || ''),
            email: String(body.email || email).trim(),
            localId: String(body.localId || ''),
            expiresAt: Date.now() + (Number(body.expiresIn) || 3600) * 1000,
        };
        this.session = session;
        await this.writeSecret(SESSION_SECRET, JSON.stringify(session));
        return session;
    }

    async signOut(): Promise<void> {
        this.session = undefined;
        await this.writeSecret(SESSION_SECRET, undefined);
        this.post({ type: 'publishSession', signedIn: false, email: '' });
        // Daftar kembali ke cadangan lokal + status “perlu masuk” (tanpa permintaan jaringan).
        void this.refreshArticles();
    }

    /* ── artikel ─────────────────────────────────────────────────────────────── */

    private documentsUrl(path = ''): string {
        const override = String(process.env.DATASKUNDER_FIRESTORE_BASE ?? '').trim().replace(/\/+$/, '');
        const project = encodeURIComponent(databaseProjectId());
        const base = override || `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
        return path ? `${base}/${path}` : base;
    }

    /** Koleksi artikel yang terakhir terbukti bisa dipakai akun ini (`articles` bila belum pernah dicoba). */
    private knownCollection(): string {
        const saved = String(this.ctx.globalState.get<string>(COLLECTION_KEY) || '').trim();
        const name = /^[A-Za-z0-9_-]{1,120}$/.test(saved) ? saved : '';
        return name || ARTICLE_COLLECTION;
    }

    /** Urutan percobaan koleksi: yang sudah terbukti, koleksi utama, lalu cadangan. */
    private collectionOrder(): string[] {
        const list = [this.knownCollection(), ARTICLE_COLLECTION, ARTICLE_COLLECTION_FALLBACK];
        return list.filter((name, index) => list.indexOf(name) === index);
    }

    /** Ingat koleksi yang berhasil supaya percobaan berikutnya langsung tepat. */
    private rememberCollection(name: string): void {
        if (name && this.knownCollection() !== name) {
            void this.ctx.globalState.update(COLLECTION_KEY, name);
        }
    }

    /** Pesan status untuk koleksi yang sedang dipakai (cadangan disebut apa adanya). */
    private connectedMessage(collection: string): string {
        return collection === ARTICLE_COLLECTION
            ? 'Database terhubung.'
            : `Database terhubung - artikel disimpan di koleksi "${collection}".`;
    }

    /** URL satu koleksi artikel beserta parameter kuncinya. */
    private collectionUrl(collection: string, query: string): string {
        return `${this.documentsUrl()}/${encodeURIComponent(collection)}${query}`;
    }

    private cacheArticles(): void {
        void this.ctx.globalState.update(CACHE_KEY, this.articles.slice(0, 100));
    }

    private cachedArticles(): PublishArticle[] {
        const raw = this.ctx.globalState.get<PublishArticle[]>(CACHE_KEY);
        return Array.isArray(raw) ? raw.filter((a) => a && a.title) : [];
    }

    private docToArticle(doc: any): PublishArticle | undefined {
        const fields = doc?.fields || {};
        const str = (key: string): string => {
            const v = fields[key];
            if (!v) { return ''; }
            if (typeof v.stringValue === 'string') { return v.stringValue; }
            if (v.integerValue !== undefined) { return String(v.integerValue); }
            return '';
        };
        const title = str('title');
        if (!title) { return undefined; }
        const name = String(doc?.name || '');
        return {
            id: name.split('/').pop() || `${Date.now()}`,
            title,
            lead: str('lead'),
            body: str('body'),
            link: str('link'),
            cover: str('cover'),
            authorName: str('authorName'),
            authorEmail: str('authorEmail'),
            authorUid: str('authorUid'),
            createdAt: Number(str('createdAt')) || 0,
        };
    }

    /** Status koneksi database (dipakai tombol “Uji koneksi” dan status di kepala view). */
    async checkDatabase(): Promise<DatabaseStatus> {
        const signed = !!(await this.restoreSession());
        const base = this.dbBase(signed);
        const key = databaseKey();
        if (!key) {
            const db: DatabaseStatus = { ...base, state: 'key', ok: false, message: 'Kunci database belum diisi. Atur dateSkunder.community.webKey.' };
            this.lastDb = db;
            return db;
        }
        let session: PublishSession | undefined;
        if (signed) {
            try { session = await this.ensureSession(); } catch { session = undefined; }
        }
        const query = `?pageSize=1&key=${encodeURIComponent(key)}`;
        try {
            // Satu nama koleksi bisa ditolak aturan database: coba koleksi cadangan sebelum menyimpulkan "akses ditolak".
            let last: HttpReply = { status: 0, body: {} };
            for (const name of this.collectionOrder()) {
                const res = await requestJson('GET', this.collectionUrl(name, query), undefined, session?.idToken);
                if (res.status === 200) {
                    this.rememberCollection(name);
                    this.lastDb = {
                        ...base,
                        collection: name,
                        signedIn: !!session,
                        state: 'online',
                        ok: true,
                        message: this.connectedMessage(name),
                    };
                    return this.lastDb;
                }
                last = res;
                if (res.status !== 403 && res.status !== 404) { break; }
            }
            const state: DatabaseState = last.status === 401
                ? 'auth'
                : last.status === 403
                    ? (session ? 'rules' : 'auth')
                    : 'error';
            this.lastDb = {
                ...base,
                signedIn: !!session,
                state,
                ok: false,
                message: databaseStatusMessage(last.status, last.body, !!session),
            };
            return this.lastDb;
        } catch (e) {
            this.lastDb = { ...base, signedIn: !!session, state: 'offline', ok: false, message: networkMessage(e) };
            return this.lastDb;
        }
    }

    private dbBase(signedIn: boolean): Pick<DatabaseStatus, 'projectId' | 'collection' | 'signedIn' | 'at'> {
        return {
            projectId: databaseProjectId(),
            collection: ARTICLE_COLLECTION,
            signedIn,
            at: Date.now(),
        };
    }

    private articlesFromList(body: any): PublishArticle[] {
        const docs = Array.isArray(body?.documents) ? body.documents : [];
        return docs
            .map((doc: any) => this.docToArticle(doc))
            .filter((a: PublishArticle | undefined): a is PublishArticle => !!a)
            .sort((a: PublishArticle, b: PublishArticle) => b.createdAt - a.createdAt);
    }

    /**
     * Baca daftar artikel.
     * Tanpa sesi, koleksi artikel memang butuh akun — daftar cadangan ditampilkan dengan status
     * “perlu masuk”, tanpa permintaan jaringan yang pasti ditolak dan tanpa pesan galat menakutkan.
     */
    async listArticles(): Promise<{
        articles: PublishArticle[];
        offline: boolean;
        needsAuth: boolean;
        message?: string;
        db: DatabaseStatus;
    }> {
        const session = await this.restoreSession();
        if (!session) {
            if (!this.articles.length) { this.articles = this.cachedArticles(); }
            const db: DatabaseStatus = {
                ...this.dbBase(false),
                state: 'auth',
                ok: false,
                message: 'Masuk dulu dengan email & kata sandi database untuk membaca dan menerbitkan artikel.',
            };
            this.lastDb = db;
            return { articles: this.articles, offline: false, needsAuth: true, db };
        }
        let active: PublishSession;
        try {
            active = await this.ensureSession();
        } catch (e) {
            if (!this.articles.length) { this.articles = this.cachedArticles(); }
            const message = networkMessage(e);
            const db: DatabaseStatus = {
                ...this.dbBase(true),
                state: /jangkau|koneksi|waktu/i.test(message) ? 'offline' : 'auth',
                ok: false,
                message,
            };
            this.lastDb = db;
            return { articles: this.articles, offline: db.state === 'offline', needsAuth: true, message, db };
        }
        const query = `?pageSize=100&key=${encodeURIComponent(databaseKey())}`;
        let res: HttpReply | undefined;
        let lastError: any;
        let collection = this.knownCollection();
        for (const name of this.collectionOrder()) {
            for (let attempt = 0; attempt < 2 && !res; attempt += 1) {
                try {
                    const reply = await requestJson('GET', this.collectionUrl(name, query), undefined, active.idToken);
                    if (reply.status === 401 && attempt === 0) {
                        // Token bisa dicabut sebelum kedaluwarsa: segarkan sekali lalu ulangi.
                        try { active = await this.ensureSession(); } catch { /* biarkan 401 */ }
                        await delay(150);
                        continue;
                    }
                    res = reply;
                } catch (e) {
                    lastError = e;
                    if (attempt === 0) { await delay(600); }
                }
            }
            if (!res) { break; }
            if (res.status === 200) { collection = name; break; }
            if (res.status !== 403 && res.status !== 404) { break; }
            // Koleksi ini menolak akun: coba koleksi berikutnya.
            res = undefined;
        }
        if (!res) {
            if (!this.articles.length) { this.articles = this.cachedArticles(); }
            const db: DatabaseStatus = {
                ...this.dbBase(true),
                state: 'offline',
                ok: false,
                message: networkMessage(lastError),
            };
            this.lastDb = db;
            return { articles: this.articles, offline: true, needsAuth: false, message: db.message, db };
        }
        if (res.status === 200) {
            const articles = this.articlesFromList(res.body);
            this.articles = articles;
            this.cacheArticles();
            this.rememberCollection(collection);
            const db: DatabaseStatus = {
                ...this.dbBase(true),
                collection,
                state: 'online',
                ok: true,
                message: this.connectedMessage(collection),
            };
            this.lastDb = db;
            return { articles, offline: false, needsAuth: false, db };
        }
        if (res.status === 401) { await this.signOut(); }
        if (!this.articles.length) { this.articles = this.cachedArticles(); }
        const db: DatabaseStatus = {
            ...this.dbBase(true),
            state: res.status === 401 ? 'auth' : res.status === 403 ? 'rules' : 'error',
            ok: false,
            message: databaseStatusMessage(res.status, res.body, true),
        };
        this.lastDb = db;
        return { articles: this.articles, offline: true, needsAuth: false, message: db.message, db };
    }

    /** Terbitkan artikel (validasi → token → simpan ke koleksi). */
    async publish(input: ArticleInput): Promise<PublishArticle> {
        const problem = validateArticle(input);
        if (problem) { throw new Error(problem); }
        const session = await this.ensureSession();
        const fields = articleFields(input, session);
        const query = `?key=${encodeURIComponent(databaseKey())}`;
        let res: HttpReply = { status: 0, body: {} };
        let collection = this.knownCollection();
        for (const name of this.collectionOrder()) {
            const url = this.collectionUrl(name, query);
            try {
                res = await requestJson('POST', url, { fields }, session.idToken);
            } catch (e) {
                // Satu percobaan ulang untuk gangguan jaringan singkat (bukan penolakan database).
                await delay(500);
                res = await requestJson('POST', url, { fields }, session.idToken);
            }
            if (res.status < 400 && res.body?.name) { collection = name; break; }
            // Hanya penolakan akses yang layak dicoba ke koleksi berikutnya.
            if (res.status !== 403) { break; }
        }
        if (res.status >= 400 || !res.body?.name) {
            if (res.status === 401) { await this.signOut(); }
            throw new Error(databaseStatusMessage(res.status, res.body, true));
        }
        this.rememberCollection(collection);
        const article: PublishArticle = {
            id: String(res.body.name).split('/').pop() || `${Date.now()}`,
            title: String(input.title).trim().slice(0, 120),
            lead: String(input.lead).trim().slice(0, 600),
            body: String(input.body ?? '').trim().slice(0, 12000),
            link: String(input.link).trim().slice(0, 800),
            cover: String(input.cover ?? '').trim().slice(0, 800),
            authorName: String(input.authorName || session.email.split('@')[0]).trim().slice(0, 60),
            authorEmail: session.email,
            authorUid: session.localId,
            createdAt: Date.now(),
        };
        this.articles = [article, ...this.articles.filter((a) => a.id !== article.id)];
        this.cacheArticles();
        return article;
    }

    /** Hapus artikel milik sendiri. */
    async deleteArticle(id: string): Promise<void> {
        const target = String(id || '').trim();
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(target)) { throw new Error('Id artikel tidak valid.'); }
        const session = await this.ensureSession();
        const query = `?key=${encodeURIComponent(databaseKey())}`;
        let res: HttpReply = { status: 0, body: {} };
        let collection = this.knownCollection();
        for (const name of this.collectionOrder()) {
            res = await requestJson(
                'DELETE',
                `${this.documentsUrl()}/${encodeURIComponent(name)}/${encodeURIComponent(target)}${query}`,
                undefined,
                session.idToken,
            );
            if (res.status < 400) { collection = name; break; }
            if (res.status !== 404 && res.status !== 403) { break; }
        }
        if (res.status >= 400 && res.status !== 404) {
            if (res.status === 401) { await this.signOut(); }
            throw new Error(databaseStatusMessage(res.status, res.body, true));
        }
        if (res.status < 400) { this.rememberCollection(collection); }
        this.articles = this.articles.filter((a) => a.id !== target);
        this.cacheArticles();
    }

    /* ── pesan dari webview ──────────────────────────────────────────────────── */

    private async statePayload() {
        const session = await this.restoreSession();
        return {
            type: 'publishState',
            signedIn: !!session,
            email: session?.email || '',
            localId: session?.localId || '',
            draft: this.ctx.globalState.get(DRAFT_KEY) || null,
            articles: this.articles.length ? this.articles : this.cachedArticles(),
            collection: this.knownCollection(),
            projectId: databaseProjectId(),
            db: this.lastDb,
        };
    }

    private async refreshArticles(): Promise<void> {
        const hasil = await this.listArticles();
        const session = await this.restoreSession();
        this.post({
            type: 'publishArticles',
            articles: hasil.articles,
            offline: hasil.offline,
            needsAuth: hasil.needsAuth,
            message: hasil.message || '',
            signedIn: !!session,
            localId: session?.localId || '',
            db: hasil.db,
        });
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready': {
                this.ready = true;
                this.post(await this.statePayload());
                void this.refreshArticles();
                break;
            }
            case 'saveDraft':
                await this.ctx.globalState.update(DRAFT_KEY, msg.draft || null);
                break;
            case 'checkDatabase': {
                const db = await this.checkDatabase();
                this.post({ type: 'publishDb', db });
                break;
            }
            case 'signIn':
            case 'signUp': {
                const email = String(msg.email ?? '').trim();
                const password = String(msg.password ?? '');
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    this.post({ type: 'publishAuth', ok: false, message: 'Format email tidak valid, mis. nama@contoh.com.' });
                    break;
                }
                if (password.length < 6) {
                    this.post({ type: 'publishAuth', ok: false, message: 'Kata sandi minimal 6 karakter.' });
                    break;
                }
                try {
                    const session = await this.signIn(email, password, msg.type === 'signUp' ? 'signUp' : 'signIn');
                    this.post({ type: 'publishAuth', ok: true, email: session.email, signedIn: true, localId: session.localId });
                    // Profil penulis ikut dipakai pada artikel berikutnya.
                    this.post(await this.statePayload());
                    void this.refreshArticles();
                } catch (e) {
                    this.post({ type: 'publishAuth', ok: false, message: e instanceof Error ? e.message : String(e) });
                }
                break;
            }
            case 'signOut':
                await this.signOut();
                break;
            case 'publish': {
                const input: ArticleInput = {
                    title: String(msg.article?.title ?? ''),
                    lead: String(msg.article?.lead ?? ''),
                    body: String(msg.article?.body ?? ''),
                    link: String(msg.article?.link ?? ''),
                    cover: String(msg.article?.cover ?? ''),
                    authorName: String(msg.article?.authorName ?? ''),
                };
                try {
                    const article = await this.publish(input);
                    await this.ctx.globalState.update(DRAFT_KEY, null);
                    this.post({ type: 'publishResult', ok: true, article });
                    this.post({
                        type: 'publishArticles',
                        articles: this.articles,
                        offline: false,
                        message: '',
                        signedIn: true,
                        localId: this.session?.localId || '',
                    });
                } catch (e) {
                    this.post({ type: 'publishResult', ok: false, message: e instanceof Error ? e.message : String(e) });
                }
                break;
            }
            case 'deleteArticle': {
                try {
                    await this.deleteArticle(String(msg.id ?? ''));
                    this.post({ type: 'publishDeleted', ok: true, id: String(msg.id ?? '') });
                    this.post({
                        type: 'publishArticles',
                        articles: this.articles,
                        offline: false,
                        message: '',
                        signedIn: true,
                        localId: this.session?.localId || '',
                    });
                } catch (e) {
                    this.post({ type: 'publishDeleted', ok: false, message: e instanceof Error ? e.message : String(e) });
                }
                break;
            }
            case 'refresh':
                await this.refreshArticles();
                break;
            case 'openExternal': {
                const url = String(msg.url ?? '');
                if (isHttpUrl(url)) { await vscode.env.openExternal(vscode.Uri.parse(url)); }
                break;
            }
        }
    }

    /** Dipakai perintah “Buka Publish” di palet. */
    focus(): void {
        void vscode.commands.executeCommand(`${PUBLISH_VIEW}.focus`);
    }
}

/** Daftarkan view Publish + perintahnya. */
export function registerPublishView(context: vscode.ExtensionContext): PublishViewProvider {
    const provider = new PublishViewProvider(context, (line) => console.log(`[publish] ${line}`));
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PUBLISH_VIEW, provider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('date-skunder.publish.open', async () => {
            await vscode.commands.executeCommand(`${PUBLISH_VIEW}.focus`);
        }),
    );
    return provider;
}
