import * as fs from 'fs';
import * as http from 'http';
import { URL } from 'url';
import {
    chatLogFile,
    chatLogJson,
    chatLogLabel,
    flushChatLog,
} from './chatLog';
import type { ChatLogMessageJson } from './chatLog';
import {
    COMMUNITY_CHANNELS,
} from './community';
import {
    firebaseEnabled,
    firebaseSummary,
    discussionSummary,
    listCommunityMessages,
    listDiscussionMessages,
} from './communityFirebase';

const API_VERSION = 1;
const MAX_LIMIT = 5000;

export interface ChatApiInfo {
    running: boolean;
    host: string;
    port: number;
    url: string;
    endpoints: Record<string, string>;
}

interface ChatApiOptions {
    host?: string;
    log?: (line: string) => void;
}

function clampLimit(value: string | null, fallback = 0): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) { return fallback; }
    return Math.max(1, Math.min(MAX_LIMIT, Math.round(n)));
}

/** `since` menerima ISO-8601 atau milidetik; 0 = tanpa batas. */
function sinceMs(value: string | null): number {
    if (!value) { return 0; }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) { return numeric < 1e12 ? Math.round(numeric * 1000) : Math.round(numeric); }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export class ChatApiServer {
    private server?: http.Server;
    private port = 0;
    private lastError = '';
    private readonly host: string;
    private readonly log: (line: string) => void;

    constructor(options: ChatApiOptions = {}) {
        this.host = options.host || '127.0.0.1';
        this.log = options.log || (() => undefined);
    }

    get running(): boolean { return !!this.server; }
    get error(): string { return this.lastError; }

    info(): ChatApiInfo {
        const base = this.port ? `http://${this.host}:${this.port}` : '';
        return {
            running: this.running,
            host: this.host,
            port: this.port,
            url: base,
            endpoints: {
                root: base ? `${base}/` : '',
                health: base ? `${base}/api/health.json` : '',
                chat: base ? `${base}/api/chat.json` : '',
                community: base ? `${base}/api/community.json` : '',
                diskusi: base ? `${base}/api/diskusi.json` : '',
                chatAi: base ? `${base}/api/chat-ai.json` : '',
                rooms: base ? `${base}/api/rooms.json` : '',
                firebase: base ? `${base}/api/firebase.json` : '',
                raw: base ? `${base}/api/raw.txt` : '',
            },
        };
    }

    /** Nyalakan server. Port sibuk → pilih port bebas; gagal total → lempar galat. */
    async start(preferredPort = 47831): Promise<number> {
        if (this.server) { return this.port; }
        const wanted = Math.max(0, Math.min(65535, Math.round(Number(preferredPort) || 0)));
        try {
            return await this.listen(wanted);
        } catch (e) {
            const code = (e as NodeJS.ErrnoException)?.code;
            if (wanted !== 0 && code === 'EADDRINUSE') {
                this.log(`Port ${wanted} sedang dipakai — memilih port bebas.`);
                return await this.listen(0);
            }
            this.lastError = e instanceof Error ? e.message : String(e);
            throw e;
        }
    }

    private listen(port: number): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const server = http.createServer((req, res) => { void this.handle(req, res); });
            const onError = (err: Error) => {
                server.close();
                reject(err);
            };
            server.once('error', onError);
            server.listen(port, this.host, () => {
                server.removeListener('error', onError);
                server.on('error', (err) => this.log(`Server API: ${err.message}`));
                const address = server.address();
                this.server = server;
                this.port = typeof address === 'object' && address ? address.port : port;
                this.lastError = '';
                this.log(`API JSON aktif di http://${this.host}:${this.port}/api/chat.json`);
                resolve(this.port);
            });
        });
    }

    async stop(): Promise<void> {
        const server = this.server;
        this.server = undefined;
        if (!server) { return; }
        await new Promise<void>((resolve) => server.close(() => resolve()));
        this.log('API JSON dihentikan.');
    }

    private cors(req: http.IncomingMessage, res: http.ServerResponse): void {
        // Hanya halaman lokal (localhost/127.0.0.1) yang boleh membaca lewat browser.
        // Situs internet tidak mendapat izin CORS, jadi tidak bisa mengambil isi obrolan.
        const origin = String(req.headers.origin || '');
        if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
    }

    private sendJson(res: http.ServerResponse, status: number, payload: unknown, downloadName?: string): void {
        const body = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': String(body.length),
            ...(downloadName ? { 'Content-Disposition': `attachment; filename="${downloadName}"` } : {}),
        });
        res.end(body);
    }

    private sendText(res: http.ServerResponse, status: number, text: string, type = 'text/plain; charset=utf-8'): void {
        const body = Buffer.from(text, 'utf8');
        res.writeHead(status, {
            'Content-Type': type,
            'Content-Length': String(body.length),
        });
        res.end(body);
    }

    private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const startedAt = Date.now();
        // Catat setiap permintaan supaya terminal “API JSON Chat” terlihat seperti server sungguhan.
        res.on('finish', () => {
            const jam = new Date().toLocaleTimeString('id-ID', { hour12: false });
            const target = String(req.url || '/').slice(0, 180);
            this.log(`${jam}  ${req.method || 'GET'} ${target}  ${res.statusCode}  (${Date.now() - startedAt} ms)`);
        });
        this.cors(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            this.sendJson(res, 405, { ok: false, error: 'Hanya GET yang didukung (API baca-saja).' });
            return;
        }
        const url = new URL(req.url || '/', `http://${this.host}:${this.port || 80}`);
        try {
            switch (url.pathname) {
                case '/':
                case '/index.html':
                    this.sendText(res, 200, this.docsHtml(), 'text/html; charset=utf-8');
                    return;
                case '/api/health.json':
                    await this.health(res);
                    return;
                case '/api/chat.json':
                    await this.chat(res, url);
                    return;
                case '/api/community.json':
                case '/api/komunitas.json':
                    await this.chat(res, url, 'komunitas');
                    return;
                case '/api/diskusi.json':
                    await this.chat(res, url, 'diskusi');
                    return;
                case '/api/chat-ai.json':
                    await this.chat(res, url, 'chat-ai');
                    return;
                case '/api/rooms.json':
                    await this.rooms(res);
                    return;
                case '/api/firebase.json':
                    await this.firebase(res, url);
                    return;
                case '/api/raw.txt':
                    await this.raw(res);
                    return;
                default:
                    this.sendJson(res, 404, {
                        ok: false,
                        error: 'Endpoint tidak dikenal.',
                        endpoints: this.info().endpoints,
                    });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.log(`API gagal: ${message}`);
            this.sendJson(res, 500, { ok: false, error: message });
        }
    }

    private downloadName(url: URL, room: string): string | undefined {
        if (url.searchParams.get('download') !== '1') { return undefined; }
        const p = (n: number) => String(n).padStart(2, '0');
        const now = new Date();
        const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
        return `percakapan-${room || 'semua'}-${stamp}.json`;
    }

    private async health(res: http.ServerResponse): Promise<void> {
        await flushChatLog();
        const firebase = firebaseSummary();
        this.sendJson(res, 200, {
            ok: true,
            api: 'date-skunder.chat',
            version: API_VERSION,
            running: this.running,
            generatedAt: new Date().toISOString(),
            source: { file: chatLogFile(), label: chatLogLabel() },
            firebase: {
                enabled: firebase.enabled,
                projectId: firebase.projectId,
                collection: firebase.collection,
            },
            diskusi: {
                enabled: discussionSummary().enabled,
                collection: discussionSummary().collection,
            },
            endpoints: this.info().endpoints,
        });
    }

    /** Pesan ruang komunitas langsung dari Firebase, dalam bentuk JSON yang sama dengan /api/chat.json. */
    private async communityFromFirebase(channel?: string): Promise<ChatLogMessageJson[]> {
        const channels = channel && COMMUNITY_CHANNELS.some((c) => c.id === channel)
            ? [channel]
            : COMMUNITY_CHANNELS.map((c) => c.id);
        const rows: ChatLogMessageJson[] = [];
        for (const id of channels) {
            const result = await listCommunityMessages(id, 300);
            for (const message of result.messages) {
                rows.push({
                    index: 0,
                    at: new Date(message.at).toISOString().slice(0, 19).replace('T', ' '),
                    timestamp: message.at,
                    iso: new Date(message.at).toISOString(),
                    room: 'komunitas',
                    roomLabel: `KOMUNITAS #${message.channel || id}`,
                    channel: message.channel || id,
                    name: message.name,
                    tag: `firebase${message.langTag ? ` · ${message.langTag}` : ''}`,
                    kind: message.kind,
                    text: message.text,
                });
            }
        }
        rows.sort((a, b) => a.timestamp - b.timestamp);
        rows.forEach((row, index) => { row.index = index; });
        return rows;
    }

    /** Pesan ruang Diskusi AI langsung dari Firebase (`diskusi_ai`). */
    private async discussionFromFirebase(): Promise<ChatLogMessageJson[]> {
        const result = await listDiscussionMessages(300);
        return result.messages.map((message, index) => ({
            index,
            at: new Date(message.at).toISOString().slice(0, 19).replace('T', ' '),
            timestamp: message.at,
            iso: new Date(message.at).toISOString(),
            room: 'diskusi' as const,
            roomLabel: 'DISKUSI AI',
            channel: '',
            name: message.name,
            tag: `firebase${message.langTag ? ` · ${message.langTag}` : ''}`,
            kind: message.kind,
            text: message.text,
        }));
    }

    private async chat(res: http.ServerResponse, url: URL, fixedRoom?: string): Promise<void> {
        await flushChatLog();
        const doc = await chatLogJson();
        const room = fixedRoom || String(url.searchParams.get('room') || '').trim();
        const channel = String(url.searchParams.get('channel') || '').trim().toLowerCase();
        const since = sinceMs(url.searchParams.get('since'));
        const limit = clampLimit(url.searchParams.get('limit'));
        let messages = doc.messages.slice();
        // Ruang Komunitas dibaca langsung dari Firebase; arsip lokal hanya cadangan.
        if (firebaseEnabled() && (!room || room === 'komunitas')) {
            try {
                const remote = await this.communityFromFirebase(channel || undefined);
                const others = room === 'komunitas' ? [] : messages.filter((m) => m.room !== 'komunitas');
                messages = [...others, ...remote].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            } catch {
                // Database tidak bisa dibaca → pakai arsip lokal (mode cadangan).
            }
        }
        // Diskusi AI juga dibaca langsung dari Firebase (`diskusi_ai`).
        if (firebaseEnabled() && (!room || room === 'diskusi')) {
            try {
                const remote = await this.discussionFromFirebase();
                const others = messages.filter((m) => m.room !== 'diskusi');
                messages = [...others, ...remote].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            } catch {
                // Gagal membaca `diskusi_ai` → log lokal tetap dipakai.
            }
        }
        if (room) { messages = messages.filter((m) => m.room === room); }
        if (channel) {
            messages = messages.filter((m) => m.room === 'komunitas' && String(m.channel || '').toLowerCase() === channel);
        }
        if (since > 0) { messages = messages.filter((m) => (m.timestamp || 0) >= since); }
        if (limit > 0 && messages.length > limit) { messages = messages.slice(-limit); }
        const rooms: Record<string, number> = {};
        for (const message of messages) { rooms[message.room] = (rooms[message.room] ?? 0) + 1; }
        this.sendJson(res, 200, {
            ok: true,
            app: doc.app,
            format: doc.format,
            version: doc.version,
            api: 'date-skunder.chat',
            apiVersion: API_VERSION,
            generatedAt: new Date().toISOString(),
            source: { file: doc.file, label: doc.label },
            filter: { room: room || null, channel: channel || null, since: since || null, limit: limit || null },
            total: messages.length,
            rooms,
            messages,
        }, this.downloadName(url, room));
    }

    private async rooms(res: http.ServerResponse): Promise<void> {
        await flushChatLog();
        const doc = await chatLogJson();
        let messages = doc.messages;
        if (firebaseEnabled()) {
            try {
                const remote = await this.communityFromFirebase();
                messages = [...doc.messages.filter((m) => m.room !== 'komunitas'), ...remote];
            } catch {
                // Database tidak bisa dibaca → ringkasan dari arsip lokal.
            }
            try {
                const diskusi = await this.discussionFromFirebase();
                messages = [...messages.filter((m) => m.room !== 'diskusi'), ...diskusi];
            } catch {
                // Koleksi `diskusi_ai` tidak terbaca → pakai log lokal.
            }
        }
        const counts: Record<string, number> = {};
        const channels: Record<string, number> = {};
        for (const message of messages) {
            counts[message.room] = (counts[message.room] ?? 0) + 1;
            if (message.room === 'komunitas' && message.channel) {
                channels[message.channel] = (channels[message.channel] ?? 0) + 1;
            }
        }
        this.sendJson(res, 200, {
            ok: true,
            api: 'date-skunder.chat',
            apiVersion: API_VERSION,
            generatedAt: new Date().toISOString(),
            total: messages.length,
            rooms: counts,
            channels: COMMUNITY_CHANNELS.map((c) => ({
                id: c.id,
                label: c.label,
                description: c.desc,
                messages: channels[c.id] ?? 0,
            })),
            source: { file: doc.file, label: doc.label },
        });
    }

    private async firebase(res: http.ServerResponse, url: URL): Promise<void> {
        if (!firebaseEnabled()) {
            this.sendJson(res, 503, {
                ok: false,
                error: 'Sinkronisasi Database dimatikan (dateSkunder.community.Database).',
            });
            return;
        }
        const requested = String(url.searchParams.get('channel') || 'all').trim().toLowerCase();
        const withDiscussion = requested === 'all' || !requested || requested === 'diskusi';
        const channels = requested === 'all' || !requested || requested === 'diskusi'
            ? (requested === 'diskusi' ? [] : COMMUNITY_CHANNELS.map((c) => c.id))
            : [requested];
        const limit = clampLimit(url.searchParams.get('limit'), 100);
        const messages: unknown[] = [];
        const collections: string[] = [];
        const errors: string[] = [];
        for (const channel of channels) {
            try {
                const result = await listCommunityMessages(channel, limit);
                collections.push(result.collection);
                messages.push(...result.messages);
            } catch (e) {
                errors.push(e instanceof Error ? e.message : String(e));
            }
        }
        if (withDiscussion) {
            try {
                const result = await listDiscussionMessages(Math.max(limit, 300));
                collections.push(result.collection);
                messages.push(...result.messages);
            } catch (e) {
                errors.push(e instanceof Error ? e.message : String(e));
            }
        }
        messages.sort((a: any, b: any) => (a.at || 0) - (b.at || 0));
        this.sendJson(res, errors.length && !messages.length ? 502 : 200, {
            ok: errors.length === 0,
            api: 'date-skunder.chat.firebase',
            apiVersion: API_VERSION,
            generatedAt: new Date().toISOString(),
            projectId: firebaseSummary().projectId,
            collections,
            total: messages.length,
            errors,
            messages,
        }, this.downloadName(url, 'firebase'));
    }

    private async raw(res: http.ServerResponse): Promise<void> {
        await flushChatLog();
        try {
            const text = await fs.promises.readFile(chatLogFile(), 'utf8');
            this.sendText(res, 200, text);
        } catch {
            this.sendText(res, 404, `Belum ada catatan di ${chatLogFile()}.\n`);
        }
    }

    private docsHtml(): string {
        const info = this.info();
        const link = (path: string, label: string, note: string) =>
            `<li><a href="${path}"><code>${path}</code></a> — ${label}<br><span>${note}</span></li>`;
        return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Date Skunder · API JSON Percakapan</title>
<style>
body{font:14px/1.55 system-ui,Segoe UI,sans-serif;max-width:860px;margin:32px auto;padding:0 18px;color:#1f2328;background:#fff}
h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:24px 0 8px}
p.lead{color:#57606a;margin:0 0 18px}
code{background:#f6f8fa;border:1px solid #d0d7de;border-radius:5px;padding:1px 5px;font-size:12.5px}
ul{padding-left:18px}li{margin:0 0 10px}li span{color:#57606a;font-size:12.5px}
pre{background:#f6f8fa;border:1px solid #d0d7de;border-radius:8px;padding:12px;overflow:auto;font-size:12.5px}
.badge{display:inline-block;background:#dafbe1;color:#1a7f37;border:1px solid #aceebb;border-radius:999px;padding:1px 9px;font-size:12px}
</style></head><body>
<h1>API JSON Percakapan <span class="badge">baca-saja</span></h1>
<p class="lead">Sumber: ruang <strong>Komunitas</strong> (<code>community_*</code>) dan <strong>Diskusi AI</strong> (<code>diskusi_ai</code>) dibaca langsung dari <strong>Firebase</strong>; Chat AI dari <code>${chatLogLabel()}</code> (log &amp; cadangan).
Server hanya mendengarkan di <code>${info.host}</code>; tidak ada data yang dikirim ke internet.</p>
<h2>Endpoint</h2>
<ul>
${link('/api/chat.json', 'semua pesan', 'parameter: room, channel, limit, since, download=1')}
${link('/api/community.json', 'ruang Komunitas (langsung dari Firebase)', 'contoh: ?channel=umum&amp;limit=100')}
${link('/api/diskusi.json', 'ruang Diskusi AI (langsung dari Firebase)', 'koleksi diskusi_ai, parameter: limit, since, download=1')}
${link('/api/chat-ai.json', 'ruang Chat AI', 'percakapan view Chat AI')}
${link('/api/rooms.json', 'ringkasan per ruang', 'jumlah pesan + daftar channel')}
${link('/api/firebase.json', 'langsung dari Firebase', '?channel=all, ?channel=umum, atau ?channel=diskusi')}
${link('/api/raw.txt', 'isi data/data.txt', 'teks asli, satu baris satu pesan')}
${link('/api/health.json', 'status server', 'lokasi berkas + status Firebase')}
</ul>
<h2>Contoh</h2>
<pre>curl "${info.url}/api/chat.json?download=1" -o percakapan.json
curl "${info.url}/api/community.json?channel=umum&amp;limit=100"</pre>
<p class="lead">Semua respons memakai UTF-8. CORS hanya diberikan kepada halaman lokal
(<code>http://localhost</code> / <code>http://127.0.0.1</code>), jadi situs internet tidak bisa membaca catatan ini.</p>
</body></html>`;
    }
}
