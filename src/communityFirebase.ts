import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as vscode from 'vscode';
import { databaseKey, databaseProjectId } from './community';

export type RemoteRoom = 'komunitas' | 'diskusi';

/** Koleksi Firestore ruang Diskusi AI (terpisah dari ruang komunitas). */
export const DISKUSI_COLLECTION = 'diskusi_ai';

export interface RemoteCommunityMessage {
    id: string;
    /** Ruang asal dokumen: komunitas (berkanal) atau Diskusi AI. */
    room?: RemoteRoom;
    channel: string;
    name: string;
    bio: string;
    text: string;
    at: number;
    lang: string;
    langTag: string;
    kind: 'chat' | 'answer' | 'system';
    remote: true;
}

export interface RemoteCommunityDraft {
    name: string;
    bio?: string;
    text: string;
    at?: number;
    lang?: string;
    langTag?: string;
    kind?: RemoteCommunityMessage['kind'];
    channel?: string;
    room?: RemoteRoom;
}

export interface RemoteCommunityList {
    messages: RemoteCommunityMessage[];
    collection: string;
    projectId: string;
    ok: true;
}

interface HttpReply {
    status: number;
    body: any;
}

/** Nama koleksi Firestore ruang Diskusi AI. */
export function discussionCollectionId(): string {
    return DISKUSI_COLLECTION;
}

/** Nama koleksi Firestore untuk satu ruang; hanya huruf/angka/garis bawah. */
export function communityCollectionId(channel: string): string {
    const safe = String(channel ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    return `community_${safe || 'umum'}`;
}

/** Apakah pesan komunitas dikirim ke database? Bisa dimatikan lewat pengaturan. */
export function firebaseEnabled(): boolean {
    if (process.env.DATASKUNDER_COMMUNITY_FIREBASE === '0') { return false; }
    const cfg = vscode.workspace.getConfiguration('dateSkunder');
    return (cfg.get<boolean>('community.firebase') ?? true) && Boolean(databaseKey());
}

/**
 * Apakah pesan dari database ikut **ditampilkan**?
 * Bawaan nyala: ruang Komunitas membaca percakapan langsung dari Firebase. Matikan
 * (`dateSkunder.community.firebaseDisplay = false`) untuk kembali ke mode lokal
 * `data/data.txt` — berguna saat offline. Penulisan/penghapusan database tetap berjalan.
 */
export function firebaseDisplayEnabled(): boolean {
    const cfg = vscode.workspace.getConfiguration('dateSkunder');
    return cfg.get<boolean>('community.firebaseDisplay') ?? true;
}

/** Alamat dasar koleksi Firestore (bisa diarahkan ke server tiruan saat pemeriksaan). */
export function firestoreDocumentsBase(): string {
    const override = String(process.env.DATASKUNDER_FIRESTORE_BASE ?? '').trim().replace(/\/+$/, '');
    if (override) { return override; }
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(databaseProjectId())}/databases/(default)/documents`;
}

function requestJson(method: string, url: string, payload?: unknown, timeoutMs = 12000): Promise<HttpReply> {
    return new Promise((resolve, reject) => {
        let target: URL;
        try { target = new URL(url); } catch { reject(new Error('Alamat database tidak valid.')); return; }
        const mod = target.protocol === 'http:' ? http : https;
        const data = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload), 'utf8');
        const req = mod.request({
            method,
            hostname: target.hostname,
            port: target.port || undefined,
            path: `${target.pathname}${target.search}`,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': String(data.length) } : {}),
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
        req.on('timeout', () => req.destroy(new Error('Waktu koneksi database habis.')));
        req.on('error', (e) => reject(e));
        if (data) { req.write(data); }
        req.end();
    });
}

const fieldText = (fields: any, key: string): string => {
    const value = fields?.[key];
    if (!value || typeof value !== 'object') { return ''; }
    if (typeof value.stringValue === 'string') { return value.stringValue; }
    if (value.integerValue !== undefined) { return String(value.integerValue); }
    if (value.doubleValue !== undefined) { return String(value.doubleValue); }
    return '';
};

const fieldNumber = (fields: any, key: string): number => {
    const raw = fieldText(fields, key);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) { return 0; }
    // Sebagian dokumen lama menyimpan detik, bukan milidetik.
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
};

/** Ubah dokumen Firestore REST menjadi pesan yang bisa ditampilkan view. */
export function remoteFromDocument(
    document: any,
    fallbackChannel = 'umum',
    room: RemoteRoom = 'komunitas',
): RemoteCommunityMessage | undefined {
    const fields = document?.fields || {};
    const text = String(fieldText(fields, 'message') || fieldText(fields, 'text')).trim();
    if (!text) { return undefined; }
    const id = String(document?.name || '').split('/').pop() || '';
    const storedRoom = String(fieldText(fields, 'room') || '').trim().toLowerCase();
    const finalRoom: RemoteRoom = room === 'diskusi' || storedRoom === 'diskusi' ? 'diskusi' : 'komunitas';
    const channelRaw = String(fieldText(fields, 'channel') || fallbackChannel).trim();
    const channel = finalRoom === 'diskusi' ? '' : (channelRaw || fallbackChannel);
    const kindRaw = String(fieldText(fields, 'kind') || 'chat').toLowerCase();
    const kind: RemoteCommunityMessage['kind'] = kindRaw === 'answer' || kindRaw === 'system' ? kindRaw : 'chat';
    return {
        id: id || `fb-${fieldNumber(fields, 'timestamp')}-${text.slice(0, 24)}`,
        room: finalRoom,
        channel,
        name: String(fieldText(fields, 'username') || 'anggota').trim().slice(0, 60) || 'anggota',
        bio: String(fieldText(fields, 'description')).trim().slice(0, 160),
        text,
        at: fieldNumber(fields, 'timestamp') || Date.now(),
        lang: String(fieldText(fields, 'lang')).trim().slice(0, 8),
        langTag: String(fieldText(fields, 'langTag')).trim().slice(0, 16),
        kind,
        remote: true,
    };
}

/** Field Firestore untuk satu pesan (Komunitas atau Diskusi AI). */
export function remoteFields(draft: RemoteCommunityDraft): Record<string, unknown> {
    const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
    const room: RemoteRoom = draft.room === 'diskusi' ? 'diskusi' : 'komunitas';
    const channel = room === 'diskusi' ? '' : (clean(draft.channel || 'umum', 40) || 'umum');
    const at = Number(draft.at);
    return {
        username: { stringValue: clean(draft.name, 60) || 'anggota' },
        description: { stringValue: clean(draft.bio, 160) },
        message: { stringValue: clean(draft.text, 4000) },
        timestamp: { integerValue: String(Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now()) },
        lang: { stringValue: clean(draft.lang, 8) },
        langTag: { stringValue: clean(draft.langTag, 16) },
        kind: { stringValue: clean(draft.kind || 'chat', 12) },
        channel: { stringValue: channel },
        room: { stringValue: room },
    };
}

/** Pesan galat yang bisa dibaca pengguna, tanpa menyebut penyedia database. */
function friendlyError(status: number, body: any, scope = 'ruang komunitas'): string {
    const detail = String(body?.error?.message || '').split('\n')[0].slice(0, 180);
    if (status === 401 || status === 403) {
        return `Database menolak akses ${scope}. Periksa aturan koleksinya.`;
    }
    if (status === 404) {
        return `Koleksi ${scope} belum ada di database. Pesan pertama akan membuatnya.`;
    }
    if (status === 429) {
        return 'Kuota database sedang penuh. Coba lagi beberapa saat lagi.';
    }
    return detail || `Database membalas HTTP ${status}.`;
}

/**
 * Baca pesan terbaru satu koleksi dari database.
 * `limit` dibatasi 1–300 supaya kuota baca tetap hemat (cukup untuk batas 100 pesan).
 */
async function listRoomMessages(
    collection: string,
    fallbackChannel: string,
    limit: number,
    room: RemoteRoom,
): Promise<RemoteCommunityList> {
    const projectId = databaseProjectId();
    const rows = Math.max(1, Math.min(300, Math.round(Number(limit) || 40)));
    const url = `${firestoreDocumentsBase()}:runQuery?key=${encodeURIComponent(databaseKey())}`;
    const query = {
        structuredQuery: {
            from: [{ collectionId: collection }],
            orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
            limit: rows,
        },
    };
    const res = await requestJson('POST', url, query);
    if (res.status !== 200) { throw new Error(friendlyError(res.status, res.body, collection)); }
    if (!Array.isArray(res.body)) { throw new Error('Balasan database tidak dikenali.'); }
    const messages = res.body
        .map((row: any) => row?.document ? remoteFromDocument(row.document, fallbackChannel, room) : undefined)
        .filter((message: RemoteCommunityMessage | undefined): message is RemoteCommunityMessage => !!message)
        .sort((a: RemoteCommunityMessage, b: RemoteCommunityMessage) => a.at - b.at);
    return { messages, collection, projectId, ok: true };
}

/** Baca pesan terbaru satu ruang komunitas dari database. */
export function listCommunityMessages(channel = 'umum', limit = 40): Promise<RemoteCommunityList> {
    return listRoomMessages(communityCollectionId(channel), channel, limit, 'komunitas');
}

/**
 * Baca SELURUH pesan Diskusi AI dari database (koleksi `diskusi_ai`).
 * Bawaan 300 dokumen — cukup untuk batas rotasi 100 pesan beserta sisa sesi sebelumnya.
 */
export function listDiscussionMessages(limit = 300): Promise<RemoteCommunityList> {
    return listRoomMessages(DISKUSI_COLLECTION, '', limit, 'diskusi');
}

/** Tulis satu pesan ke satu koleksi; mengembalikan id dokumen. */
async function sendRoomMessage(
    collection: string,
    draft: RemoteCommunityDraft,
    room: RemoteRoom,
): Promise<{ id: string; collection: string; projectId: string }> {
    const url = `${firestoreDocumentsBase()}/${encodeURIComponent(collection)}?key=${encodeURIComponent(databaseKey())}`;
    const res = await requestJson('POST', url, { fields: remoteFields({ ...draft, room }) });
    if (res.status >= 400 || !res.body?.name) {
        throw new Error(friendlyError(res.status, res.body, collection));
    }
    const id = String(res.body.name).split('/').pop() || '';
    return { id, collection, projectId: databaseProjectId() };
}

/** Kirim satu pesan komunitas ke database; mengembalikan id dokumen. */
export function sendCommunityMessage(draft: RemoteCommunityDraft): Promise<{ id: string; collection: string; projectId: string }> {
    const channel = String(draft.channel || 'umum').trim() || 'umum';
    return sendRoomMessage(communityCollectionId(channel), { ...draft, channel }, 'komunitas');
}

/** Kirim satu pesan Diskusi AI ke database (koleksi `diskusi_ai`). */
export function sendDiscussionMessage(draft: RemoteCommunityDraft): Promise<{ id: string; collection: string; projectId: string }> {
    return sendRoomMessage(DISKUSI_COLLECTION, draft, 'diskusi');
}

export interface RemoteDeleteResult {
    channel: string;
    collection: string;
    deleted: number;
    failed: number;
    errors: string[];
}

/** Daftar id dokumen satu koleksi (mengikuti pageToken). */
async function listDocumentIds(collection: string, pageSize = 300): Promise<string[]> {
    const ids: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 40; page += 1) {
        const url = `${firestoreDocumentsBase()}/${encodeURIComponent(collection)}?key=${encodeURIComponent(databaseKey())}&pageSize=${pageSize}`
            + (token ? `&pageToken=${encodeURIComponent(token)}` : '');
        const res = await requestJson('GET', url);
        if (res.status !== 200) { throw new Error(friendlyError(res.status, res.body, collection)); }
        const docs = Array.isArray(res.body?.documents) ? res.body.documents : [];
        for (const doc of docs) {
            const id = String(doc?.name || '').split('/').pop() || '';
            if (id) { ids.push(id); }
        }
        token = String(res.body?.nextPageToken || '') || undefined;
        if (!token) { break; }
    }
    return [...new Set(ids)];
}

/**
 * Hitung jumlah pesan satu koleksi langsung di database (agregasi COUNT).
 * Dipakai rotasi otomatis: batas 100 pesan dihitung dari isi Firebase, bukan dari berkas lokal.
 */
async function countRoomMessages(collection: string, timeoutMs: number): Promise<number> {
    const url = `${firestoreDocumentsBase()}:runAggregationQuery?key=${encodeURIComponent(databaseKey())}`;
    const query = {
        structuredAggregationQuery: {
            structuredQuery: { from: [{ collectionId: collection }] },
            aggregations: [{ alias: 'total', count: {} }],
        },
    };
    const res = await requestJson('POST', url, query, Math.max(1000, Math.round(timeoutMs)));
    if (res.status !== 200) { throw new Error(friendlyError(res.status, res.body, collection)); }
    const rows = Array.isArray(res.body) ? res.body : [];
    for (const row of rows) {
        const field = row?.result?.aggregateFields?.total;
        const value = Number(field?.integerValue ?? field?.doubleValue ?? 0);
        if (Number.isFinite(value) && value >= 0) { return Math.round(value); }
    }
    return 0;
}

/** Hitung jumlah pesan satu ruang komunitas langsung di database. */
export function countCommunityMessages(channel = 'umum', timeoutMs = 6000): Promise<number> {
    return countRoomMessages(communityCollectionId(channel), timeoutMs);
}

/** Hitung jumlah pesan Diskusi AI di database (untuk rotasi 100 pesan). */
export function countDiscussionMessages(timeoutMs = 6000): Promise<number> {
    return countRoomMessages(DISKUSI_COLLECTION, timeoutMs);
}

/** Hapus SEMUA dokumen satu koleksi (dipakai rotasi otomatis). */
async function deleteRoomMessages(collection: string, label: string): Promise<RemoteDeleteResult> {
    const result: RemoteDeleteResult = { channel: label, collection, deleted: 0, failed: 0, errors: [] };
    let ids: string[];
    try {
        ids = await listDocumentIds(collection);
    } catch (e) {
        result.errors.push(e instanceof Error ? e.message : String(e));
        return result;
    }
    for (const id of ids) {
        try {
            const res = await requestJson(
                'DELETE',
                `${firestoreDocumentsBase()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?key=${encodeURIComponent(databaseKey())}`,
            );
            if (res.status >= 400 && res.status !== 404) {
                result.failed += 1;
                result.errors.push(friendlyError(res.status, res.body, collection));
            } else {
                result.deleted += 1;
            }
        } catch (e) {
            result.failed += 1;
            result.errors.push(e instanceof Error ? e.message : String(e));
        }
    }
    return result;
}

/**
 * Hapus SEMUA pesan satu ruang komunitas dari database.
 * Dipakai saat rotasi otomatis (setiap 100 pesan) supaya database tidak menumpuk.
 */
export function deleteAllCommunityMessages(channel = 'umum'): Promise<RemoteDeleteResult> {
    return deleteRoomMessages(communityCollectionId(channel), channel);
}

/**
 * Hapus SEMUA pesan Diskusi AI dari database saat mencapai 100 pesan.
 * `data/data.txt` TIDAK dihapus: berkas itu tetap menjadi log percakapan.
 */
export function deleteAllDiscussionMessages(): Promise<RemoteDeleteResult> {
    return deleteRoomMessages(DISKUSI_COLLECTION, 'diskusi');
}

/** Ringkasan koneksi untuk ditampilkan di view. */
export function firebaseSummary(channel = 'umum'): {
    enabled: boolean;
    projectId: string;
    collection: string;
} {
    return {
        enabled: firebaseEnabled(),
        projectId: databaseProjectId(),
        collection: communityCollectionId(channel),
    };
}

/** Ringkasan koneksi ruang Diskusi AI (koleksi `diskusi_ai`). */
export function discussionSummary(): { enabled: boolean; projectId: string; collection: string } {
    return {
        enabled: firebaseEnabled(),
        projectId: databaseProjectId(),
        collection: discussionCollectionId(),
    };
}
