/**
 * Server Socket.IO untuk fitur "Join Room" di view Pet Skin.
 *
 * Satu laptop menjadi tuan rumah (server), laptop lain bergabung lewat alamat LAN.
 * Server menyimpan satu berkas per room: semua peserta wajib memakai berkas yang sama —
 * peserta yang mencoba masuk dengan berkas berbeda ditolak dengan pesan "keluar room dulu".
 *
 * Berkas ini sengaja tidak mengimpor `vscode` supaya bisa diuji langsung dari Node
 * (lihat scripts/check-room.cjs).
 */
import * as http from 'http';
import { Server as SocketServer, Socket } from 'socket.io';

/** Data kostum yang ikut disiarkan supaya kursor user lain bisa menggambar spider-nya. */
export interface RoomSkin {
    id: string;
    name: string;
    colors: Record<string, string>;
    accessorySvg: string;
}

export interface RoomCursor {
    /** Posisi ternormalisasi 0..1 terhadap lebar/tinggi halaman analisis. */
    x: number;
    y: number;
    at: number;
}

export interface RoomMember {
    id: string;
    name: string;
    device: string;
    platform: string;
    skin: RoomSkin;
    file: string;
    /** Warna penanda kursor (chip nama). */
    color: string;
    cursor: RoomCursor;
    joinedAt: number;
}

export interface RoomSnapshot {
    room: string;
    file: string;
    createdAt: number;
    /** id socket pemilik room (pembuat) — satu-satunya yang boleh mengeluarkan peserta. */
    ownerId: string;
    members: RoomMember[];
}

/** Data berkas room yang disimpan server agar peserta baru otomatis menerimanya. */
export interface RoomDatasetMeta {
    name: string;
    size: number;
    hash: string;
}

export interface RoomDataset extends RoomDatasetMeta {
    /** Isi berkas dalam base64. */
    data: string;
}

export interface JoinRequest {
    room: string;
    name: string;
    device?: string;
    platform?: string;
    skin?: RoomSkin;
    /** Hanya nama berkas (bukan path) — path tiap laptop bisa berbeda. */
    file?: string;
    /** true = buat room baru (laptop ini jadi tuan rumah + pemilik data). */
    create?: boolean;
    /** Data berkas yang dipublikasikan saat membuat room. */
    dataset?: RoomDataset;
    /** Hash berkas yang sudah dimiliki peserta → server tidak perlu mengirim ulang. */
    haveHash?: string;
}

export type JoinRejectCode = 'bad-request' | 'file-locked' | 'room-full' | 'server-full' | 'not-found' | 'too-large';

export type JoinResult =
    | { ok: true; selfId: string; snapshot: RoomSnapshot; dataset?: RoomDatasetMeta }
    | { ok: false; code: JoinRejectCode; message: string; roomFile?: string };

export interface RoomServerOptions {
    host?: string;
    /** Batas ukuran teks CSV yang boleh disiarkan (byte). */
    maxCsvBytes?: number;
    /** Batas ukuran data room yang disimpan server (byte). */
    maxDatasetBytes?: number;
    /** Batas ukuran satu berkas yang dikirim antar-peserta (byte). */
    maxFileBytes?: number;
    log?: (line: string) => void;
    /** Dipanggil setiap keadaan room berubah (join/keluar/skin) — dipakai terminal & view. */
    onChange?: () => void;
}

interface RoomState {
    key: string;
    file: string;
    createdAt: number;
    members: Map<string, RoomMember>;
    /** Pemilik (pembuat) room — pengirim data pertama. */
    ownerId?: string;
    ownerName?: string;
    /** Berkas room (base64) supaya peserta baru langsung mendapat data + analisis yang sama. */
    dataset?: RoomDataset;
}

const MEMBER_COLORS = [
    '#38bdf8', '#f97316', '#22c55e', '#e879f9', '#facc15',
    '#f87171', '#a78bfa', '#2dd4bf', '#fb7185', '#84cc16',
];

const MAX_ROOMS = 20;
const MAX_MEMBERS = 32;
const MAX_NAME = 48;
const MAX_FILE = 160;
const MAX_DATASET = 8 * 1024 * 1024;
const MAX_TRANSFER = 8 * 1024 * 1024;

export class RoomServer {
    private httpServer?: http.Server;
    private io?: SocketServer;
    private port = 0;
    private lastError = '';
    private readonly host: string;
    private readonly maxCsvBytes: number;
    private readonly maxDatasetBytes: number;
    private readonly maxFileBytes: number;
    private readonly logLine: (line: string) => void;
    private readonly onChange?: () => void;
    private readonly rooms = new Map<string, RoomState>();

    constructor(private readonly options: RoomServerOptions = {}) {
        this.host = options.host || '0.0.0.0';
        this.maxCsvBytes = Math.max(64 * 1024, Math.min(8 * 1024 * 1024, options.maxCsvBytes ?? 512 * 1024));
        this.maxDatasetBytes = Math.max(64 * 1024, Math.min(32 * 1024 * 1024, options.maxDatasetBytes ?? MAX_DATASET));
        this.maxFileBytes = Math.max(64 * 1024, Math.min(32 * 1024 * 1024, options.maxFileBytes ?? MAX_TRANSFER));
        this.logLine = options.log || (() => undefined);
        this.onChange = options.onChange;
    }

    get running(): boolean { return !!this.io; }
    get error(): string { return this.lastError; }

    info(): { running: boolean; host: string; port: number } {
        return { running: this.running, host: this.host, port: this.port };
    }

    /** Ringkasan semua room (dipakai terminal & panel Pet Skin). */
    listRooms(): Array<{ room: string; file: string; members: number; names: string[]; createdAt: number; hasData: boolean; owner: string }> {
        return [...this.rooms.values()].map((state) => ({
            room: state.key,
            file: state.file,
            members: state.members.size,
            names: [...state.members.values()].map((m) => m.name),
            createdAt: state.createdAt,
            hasData: !!state.dataset,
            owner: state.ownerName || '',
        }));
    }

    /** Nyalakan server. Port sibuk → coba port berikutnya, lalu port bebas. Port 0 = bebas. */
    async start(preferredPort = 47900): Promise<number> {
        if (this.io) { return this.port; }
        const parsed = Number(preferredPort);
        const wanted = Number.isFinite(parsed) ? Math.max(0, Math.min(65535, Math.round(parsed))) : 47900;
        const candidates = wanted === 0 ? [0] : [wanted, wanted + 1, wanted + 2, wanted + 3, 0];
        let lastError: unknown;
        for (const port of candidates) {
            try {
                return await this.listen(port);
            } catch (e) {
                lastError = e;
                const code = (e as NodeJS.ErrnoException)?.code;
                if (code !== 'EADDRINUSE') { break; }
                this.log(`Port ${port || 'bebas'} sedang dipakai — mencoba port lain.`);
            }
        }
        this.lastError = lastError instanceof Error ? lastError.message : String(lastError);
        throw lastError instanceof Error ? lastError : new Error(this.lastError);
    }

    private listen(port: number): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const httpServer = http.createServer((_req, res) => {
                // Server ini hanya untuk socket; halaman biasa diberi keterangan singkat.
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end('Date Skunder · Join Room (Socket.IO)\nServer berjalan. Bergabung lewat panel Pet Skin → Join Room.\n');
            });
            const io = new SocketServer(httpServer, {
                serveClient: false,
                transports: ['websocket', 'polling'],
                maxHttpBufferSize: Math.max(this.maxCsvBytes, this.maxDatasetBytes, this.maxFileBytes) + 1024 * 1024,
                pingInterval: 20000,
                pingTimeout: 25000,
                // Pesan kursor sangat kecil & sering: kompresi justru menambah latensi.
                perMessageDeflate: false,
                cors: { origin: '*' },
            });
            const onError = (err: Error) => {
                io.close();
                httpServer.close();
                reject(err);
            };
            httpServer.once('error', onError);
            httpServer.listen(port, this.host, () => {
                httpServer.removeListener('error', onError);
                httpServer.on('error', (err) => this.log(`Server room: ${err.message}`));
                const address = httpServer.address();
                this.httpServer = httpServer;
                this.io = io;
                this.port = typeof address === 'object' && address ? address.port : port;
                this.lastError = '';
                this.wire(io);
                this.log(`Server Socket.IO aktif di ${this.host}:${this.port}`);
                this.onChange?.();
                resolve(this.port);
            });
        });
    }

    async stop(): Promise<void> {
        const io = this.io;
        this.io = undefined;
        if (!io) { return; }
        for (const state of this.rooms.values()) {
            for (const socketId of state.members.keys()) {
                io.sockets.sockets.get(socketId)?.disconnect(true);
            }
        }
        this.rooms.clear();
        await new Promise<void>((resolve) => {
            io.close(() => resolve());
            // Bila tidak ada koneksi, `close` tetap memanggil callback; jaga-jaga bila tidak.
            setTimeout(resolve, 1200);
        });
        this.port = 0;
        this.log('Server Socket.IO dihentikan.');
        this.onChange?.();
    }

    private log(line: string): void {
        this.logLine(line);
    }

    private wire(io: SocketServer): void {
        io.on('connection', (socket: Socket) => {
            socket.on('room:hello', (payload: JoinRequest, ack?: (result: JoinResult) => void) => {
                const result = this.join(socket, payload);
                if (typeof ack === 'function') { ack(result); }
            });

            socket.on('room:cursor', (payload: { x?: number; y?: number }) => {
                const found = this.findMember(socket.id);
                if (!found) { return; }
                const x = clamp01(payload?.x);
                const y = clamp01(payload?.y);
                found.member.cursor = { x, y, at: Date.now() };
                // Volatile: bila jaringan lambat, pesan kursor lama dibuang (tidak menumpuk).
                socket.volatile.to(found.state.key).emit('room:cursor', { id: socket.id, x, y });
            });

            socket.on('room:skin', (payload: RoomSkin) => {
                const found = this.findMember(socket.id);
                if (!found) { return; }
                found.member.skin = cleanSkin(payload) || found.member.skin;
                this.broadcast(found.state);
            });

            socket.on('room:csv:preview', (payload: { summary?: string; changes?: unknown[]; fileName?: string }) => {
                const found = this.findMember(socket.id);
                if (!found) { return; }
                const changes = Array.isArray(payload?.changes) ? payload.changes.slice(0, 24) : [];
                socket.to(found.state.key).emit('room:csv:preview', {
                    from: { id: socket.id, name: found.member.name, color: found.member.color },
                    fileName: found.state.file,
                    summary: String(payload?.summary || 'Ada perubahan CSV yang sedang disiapkan.'),
                    changes,
                    at: Date.now(),
                });
            });

            socket.on('room:csv:apply', (payload: { text?: string; summary?: string }, ack?: (res: { ok: boolean; message?: string }) => void) => {
                const found = this.findMember(socket.id);
                if (!found) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Kamu belum bergabung di room.' }); }
                    return;
                }
                const text = String(payload?.text ?? '');
                const bytes = Buffer.byteLength(text, 'utf8');
                if (!text.trim()) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Isi CSV kosong — tidak dikirim.' }); }
                    return;
                }
                if (bytes > this.maxCsvBytes) {
                    const message = `CSV terlalu besar untuk disiarkan (${Math.round(bytes / 1024)} KB, batas ${Math.round(this.maxCsvBytes / 1024)} KB).`;
                    if (typeof ack === 'function') { ack({ ok: false, message }); }
                    return;
                }
                const summary = String(payload?.summary || 'CSV diperbarui.');
                const at = Date.now();
                socket.to(found.state.key).emit('room:csv:applied', {
                    from: { id: socket.id, name: found.member.name, color: found.member.color },
                    fileName: found.state.file,
                    summary,
                    text,
                    at,
                });
                this.log(`${found.member.name} menerapkan CSV (${Math.round(bytes / 1024)} KB) di room “${found.state.key}”.`);
                this.onChange?.();
                if (typeof ack === 'function') { ack({ ok: true }); }
            });

            // Ping manual untuk menampilkan latensi di daftar perangkat.
            socket.on('room:ping', (ack?: () => void) => {
                if (typeof ack === 'function') { ack(); }
            });

            // Peserta baru meminta isi berkas room (dikirim setelah ack join, agar tidak berebut).
            socket.on('room:dataset:get', (_payload: unknown, ack?: (res: { ok: boolean }) => void) => {
                const found = this.findMember(socket.id);
                if (!found || !found.state.dataset) {
                    if (typeof ack === 'function') { ack({ ok: false }); }
                    return;
                }
                socket.emit('room:dataset', found.state.dataset);
                if (typeof ack === 'function') { ack({ ok: true }); }
            });

            // Transfer berkas antar-peserta (gambar, dokumen, CSV lain, dsb.).
            socket.on('room:file', (payload: { name?: string; data?: string }, ack?: (res: { ok: boolean; message?: string }) => void) => {
                const found = this.findMember(socket.id);
                if (!found) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Kamu belum bergabung di room.' }); }
                    return;
                }
                const name = String(payload?.name ?? '').trim().split(/[\\/]/).pop()?.slice(0, MAX_FILE) ?? '';
                const data = String(payload?.data ?? '');
                const size = data ? Buffer.byteLength(data, 'base64') : 0;
                if (!name || !size) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Berkas kosong — tidak dikirim.' }); }
                    return;
                }
                if (size > this.maxFileBytes) {
                    const message = `Berkas terlalu besar (${Math.round(size / 1024)} KB, batas ${Math.round(this.maxFileBytes / 1024)} KB).`;
                    if (typeof ack === 'function') { ack({ ok: false, message }); }
                    return;
                }
                socket.to(found.state.key).emit('room:file', {
                    from: { id: socket.id, name: found.member.name, color: found.member.color },
                    name,
                    size,
                    data,
                    at: Date.now(),
                });
                this.log(`${found.member.name} mengirim berkas “${name}” (${Math.round(size / 1024)} KB) ke room “${found.state.key}”.`);
                if (typeof ack === 'function') { ack({ ok: true }); }
            });

            // Pemilik room mengeluarkan peserta (mis. salah berbagi ke laptop orang lain).
            socket.on('room:kick', (payload: { id?: string }, ack?: (res: { ok: boolean; message?: string }) => void) => {
                const found = this.findMember(socket.id);
                if (!found) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Kamu belum bergabung di room.' }); }
                    return;
                }
                if (found.state.ownerId !== socket.id) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Hanya pemilik room yang bisa mengeluarkan peserta.' }); }
                    return;
                }
                const id = String(payload?.id ?? '');
                if (!id || id === socket.id) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Tidak bisa mengeluarkan dirimu sendiri dari room.' }); }
                    return;
                }
                const target = found.state.members.get(id);
                const targetSocket = this.io?.sockets.sockets.get(id);
                if (!target || !targetSocket) {
                    if (typeof ack === 'function') { ack({ ok: false, message: 'Peserta tidak ditemukan (mungkin sudah keluar).' }); }
                    return;
                }
                // Beri tahu dulu supaya laptop penerima menampilkan alasan, lalu lepaskan dari room.
                targetSocket.emit('room:kicked', {
                    room: found.state.key,
                    by: { id: socket.id, name: found.member.name },
                    at: Date.now(),
                });
                targetSocket.leave(found.state.key);
                targetSocket.data.roomKey = undefined;
                found.state.members.delete(id);
                this.log(`${found.member.name} mengeluarkan ${target.name} dari room “${found.state.key}”.`);
                this.broadcast(found.state);
                this.onChange?.();
                if (typeof ack === 'function') { ack({ ok: true }); }
            });

            socket.on('room:leave', (ack?: () => void) => {
                this.remove(socket.id, 'keluar');
                if (typeof ack === 'function') { ack(); }
            });

            socket.on('disconnect', () => this.remove(socket.id, 'terputus'));
        });
    }

    private join(socket: Socket, payload: JoinRequest): JoinResult {
        const roomName = String(payload?.room ?? '').trim().slice(0, MAX_NAME);
        const name = String(payload?.name ?? '').trim().slice(0, MAX_NAME);
        const create = !!payload?.create;
        const requestedFile = String(payload?.file ?? '').trim().split(/[\\/]/).pop()?.slice(0, MAX_FILE) ?? '';
        if (!roomName || !name) {
            return { ok: false, code: 'bad-request', message: 'Nama room dan nama kamu wajib diisi.' };
        }
        const key = roomName.toLowerCase();
        // Peserta lama (mis. reconnect) dilepas dulu supaya tidak muncul dua kali.
        this.remove(socket.id, 'bergabung ulang', { silent: true });
        let state = this.rooms.get(key);
        if (!state) {
            if (!create) {
                return {
                    ok: false,
                    code: 'not-found',
                    message: `Room “${roomName}” belum ada. Minta pemilik menekan Create Room dulu, atau periksa nama room & alamat server.`,
                };
            }
            if (this.rooms.size >= MAX_ROOMS) {
                return { ok: false, code: 'server-full', message: `Server sudah menampung ${MAX_ROOMS} room. Hentikan room yang tidak dipakai dulu.` };
            }
            const dataset = cleanDataset(payload?.dataset, this.maxDatasetBytes);
            if (!dataset) {
                return { ok: false, code: 'bad-request', message: 'Data room tidak diterima. Pilih berkas CSV/Excel (maksimal 8 MB) lalu buat room lagi.' };
            }
            state = {
                key: roomName,
                file: dataset.name,
                createdAt: Date.now(),
                members: new Map(),
                ownerId: socket.id,
                ownerName: name,
                dataset,
            };
            this.rooms.set(key, state);
        } else {
            // Room sudah ada: Create dengan berkas lain = konflik; Create dengan berkas sama = bergabung ulang.
            if (requestedFile && state.file.toLowerCase() !== requestedFile.toLowerCase()) {
                return {
                    ok: false,
                    code: 'file-locked',
                    message: `Room “${state.key}” sudah memakai berkas “${state.file}”. Keluar dari room itu dulu sebelum memakai “${requestedFile}”.`,
                    roomFile: state.file,
                };
            }
        }
        if (state.members.size >= MAX_MEMBERS) {
            return { ok: false, code: 'room-full', message: `Room “${state.key}” sudah penuh (${MAX_MEMBERS} perangkat).` };
        }
        const member: RoomMember = {
            id: socket.id,
            name,
            device: String(payload?.device ?? '').trim().slice(0, MAX_NAME) || 'Perangkat',
            platform: String(payload?.platform ?? '').trim().slice(0, 24),
            skin: cleanSkin(payload?.skin) || { id: 'baja', name: 'Baja Klasik', colors: {}, accessorySvg: '' },
            file: state.file,
            color: MEMBER_COLORS[state.members.size % MEMBER_COLORS.length],
            cursor: { x: 0, y: 0, at: 0 },
            joinedAt: Date.now(),
        };
        state.members.set(socket.id, member);
        socket.join(key);
        socket.data.roomKey = key;
        this.log(`${member.name} (${member.device} · ${member.platform || '?'}) bergabung di room “${state.key}” · berkas ${member.file}`);
        this.broadcast(state);
        const meta = state.dataset
            ? { name: state.dataset.name, size: state.dataset.size, hash: state.dataset.hash }
            : undefined;
        // Peserta yang belum punya berkas (hash beda) akan meminta isinya lewat `room:dataset:get`.
        const needData = !create && !!meta && payload?.haveHash !== meta.hash;
        return { ok: true, selfId: socket.id, snapshot: this.snapshot(state), dataset: needData ? meta : undefined };
    }

    private findMember(socketId: string): { state: RoomState; member: RoomMember } | undefined {
        for (const state of this.rooms.values()) {
            const member = state.members.get(socketId);
            if (member) { return { state, member }; }
        }
        return undefined;
    }

    private remove(socketId: string, reason: string, opts: { silent?: boolean } = {}): void {
        const found = this.findMember(socketId);
        if (!found) { return; }
        const socket = this.io?.sockets.sockets.get(socketId);
        socket?.leave(found.state.key);
        if (socket?.data) { delete socket.data.roomKey; }
        found.state.members.delete(socketId);
        if (!opts.silent) {
            this.log(`${found.member.name} ${reason} dari room “${found.state.key}”.`);
        }
        if (!found.state.members.size) {
            this.rooms.delete(found.state.key.toLowerCase());
            if (!opts.silent) { this.log(`Room “${found.state.key}” kosong dan ditutup.`); }
        } else {
            this.broadcast(found.state);
        }
        this.onChange?.();
    }

    private snapshot(state: RoomState): RoomSnapshot {
        const members = [...state.members.values()].sort((a, b) => a.joinedAt - b.joinedAt);
        return {
            room: state.key,
            file: state.file,
            createdAt: state.createdAt,
            ownerId: state.ownerId || '',
            members: members.map((m) => ({ ...m, skin: { ...m.skin, colors: { ...m.skin.colors } }, cursor: { ...m.cursor } })),
        };
    }

    private broadcast(state: RoomState): void {
        this.io?.to(state.key).emit('room:state', this.snapshot(state));
        this.onChange?.();
    }
}

function clamp01(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) { return 0; }
    return Math.max(0, Math.min(1, n));
}

/** Validasi data room dari klien: nama aman, base64 tidak kosong, ukuran dibatasi. */
function cleanDataset(raw: RoomDataset | undefined, maxBytes: number): RoomDataset | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const name = String(raw.name ?? '').trim().split(/[\\/]/).pop()?.slice(0, 160) ?? '';
    const data = String(raw.data ?? '');
    if (!name || !data) { return undefined; }
    const size = Buffer.byteLength(data, 'base64');
    if (size <= 0 || size > maxBytes) { return undefined; }
    return {
        name,
        size,
        hash: String(raw.hash ?? '').slice(0, 80),
        data,
    };
}

const ALLOWED_SVG_TAGS = new Set(['path', 'circle', 'ellipse', 'g', 'rect', 'line', 'polygon', 'polyline']);
const ALLOWED_SVG_ATTRS = new Set([
    'class', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
    'x1', 'y1', 'x2', 'y2', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'transform',
]);

/**
 * Aksesori kostum datang dari komputer lain → hanya bentuk SVG sederhana yang diizinkan.
 * Tag/atribut di luar daftar putih dibuang, skrip & penangan peristiwa tidak pernah lolos.
 */
function sanitizeAccessory(svg: string): string {
    // Blok berbahaya dibuang utuh (termasuk isinya), lalu hanya tag/atribut daftar putih yang lolos.
    const cleaned = String(svg || '').replace(/<\s*(script|style|foreignObject)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    return cleaned.slice(0, 4000).replace(/<[^>]*>/g, (tag) => {
        const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)>$/.exec(tag);
        if (!match) { return ''; }
        const [, closing, nameRaw, rest, selfClose] = match;
        const name = nameRaw.toLowerCase();
        if (!ALLOWED_SVG_TAGS.has(name)) { return ''; }
        if (closing) { return `</${name}>`; }
        const attrs: string[] = [];
        const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
        let found: RegExpExecArray | null;
        while ((found = attrRe.exec(rest))) {
            const key = found[1].toLowerCase();
            if (!ALLOWED_SVG_ATTRS.has(key)) { continue; }
            const value = found[2].replace(/[<>]/g, '').slice(0, 240);
            if (/javascript:/i.test(value)) { continue; }
            attrs.push(`${key}="${value}"`);
        }
        return `<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClose ? ' /' : ''}>`;
    }).slice(0, 2000);
}

/** Bersihkan data kostum dari klien (hanya field yang dikenal, ukuran dibatasi). */
function cleanSkin(raw: RoomSkin | undefined): RoomSkin | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const colors: Record<string, string> = {};
    const source = (raw.colors && typeof raw.colors === 'object') ? raw.colors : {};
    for (const key of ['leg', 'body', 'back', 'head', 'outline', 'eye', 'pupil', 'accent']) {
        const value = (source as Record<string, unknown>)[key];
        if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim())) {
            colors[key] = value.trim();
        }
    }
    const accessorySvg = sanitizeAccessory(String(raw.accessorySvg ?? ''));
    return {
        id: String(raw.id ?? 'baja').slice(0, 32),
        name: String(raw.name ?? 'Baja Klasik').slice(0, 48),
        colors,
        accessorySvg,
    };
}
