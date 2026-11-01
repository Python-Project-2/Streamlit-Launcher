/**
 * Layanan "Join Room": menyatukan server Socket.IO (tuan rumah) + klien (peserta).
 *
 * Fitur yang dilayani:
 *  - satu room = satu berkas (peserta dengan berkas lain ditolak → "keluar room dulu"),
 *  - kursor tiap user disiarkan ke semua peserta (halaman analisis menggambar kursor + nama),
 *  - kostum (skin) pet tiap user ikut disiarkan sehingga spider user lain terlihat,
 *  - perubahan CSV disiarkan lalu ditulis otomatis ke berkas tiap laptop, lengkap dengan pratinjau.
 */
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { io as ioClient, Socket } from 'socket.io-client';
import { RoomServer, RoomMember, RoomSnapshot, RoomSkin, RoomDataset, JoinResult } from './roomServer';
import {
    CellChange,
    CellDiff,
    CsvTable,
    applyCellChanges,
    csvSummary,
    diffCells,
    readCsv,
    tableWindow,
    toCsv,
} from './roomCsv';
import { activePetSkin, petSkinPayload } from './petSkins';

const LAST_KEY = 'dateSkunder.room.last';
const MAX_PREVIEW_ROWS = 60;
const MAX_PREVIEW_COLS = 14;
/** Batas data room yang dipublikasikan saat Create Room (byte). */
const MAX_ROOM_DATA = 8 * 1024 * 1024;
/** Batas satu berkas yang dikirim antar-peserta (byte). */
const MAX_ROOM_FILE = 8 * 1024 * 1024;

export interface IncomingFileView {
    id: string;
    name: string;
    sizeLabel: string;
    from: string;
    at: number;
    savedPath: string;
}

export interface RoomFileItem {
    label: string;
    name: string;
    /** Path absolut di laptop ini. */
    path: string;
    editable: boolean;
}

export interface RoomPreviewView {
    kind: 'local' | 'incoming';
    from: string;
    summary: string;
    changed: CellDiff[];
    count: number;
    at: number;
    /** true = perubahan dari laptop lain dan langsung diterapkan otomatis. */
    auto: boolean;
    /** Masih menunggu tombol "Terapkan" (autoApplyCsv dimatikan). */
    pending: boolean;
}

export interface RoomViewState {
    server: {
        running: boolean;
        host: string;
        port: number;
        lan: string[];
        rooms: Array<{ room: string; file: string; members: number; names: string[] }>;
    };
    session: { room: string; name: string; fileName: string; host: string; port: number; owner: boolean } | null;
    /** Status sambungan realtime ke server room. */
    connection: { connected: boolean; reconnecting: boolean; attempt: number };
    /** Berkas yang dikirim peserta lain dan siap diunduh. */
    incomingFiles: IncomingFileView[];
    members: Array<RoomMember & { self: boolean; latency?: number }>;
    csv: {
        fileName: string;
        editable: boolean;
        columns: string[];
        rows: string[][];
        totalRows: number;
        totalCols: number;
        revision: number;
        truncated: boolean;
    } | null;
    files: RoomFileItem[];
    preview: RoomPreviewView | null;
    lastApplied: { from: string; summary: string; at: number } | null;
    note: string;
    defaults: { room: string; name: string; host: string };
    device: string;
    platform: string;
}

export interface RoomServiceOptions {
    log?: (line: string) => void;
    /** Dipanggil saat keadaan room/berkas berubah (view Pet Skin & halaman analisis). */
    onChange?: () => void;
    /** Perubahan kursor (payload kecil, frekuensi tinggi). */
    onCursor?: (id: string, x: number, y: number) => void;
    /** Pesan singkat untuk pengguna (toast di halaman analisis). */
    onNotice?: (text: string, kind: 'ok' | 'bad' | 'info') => void;
}

export class RoomService {
    private readonly server: RoomServer;
    private readonly logLine: (line: string) => void;
    private readonly changeHandlers = new Set<() => void>();
    private readonly cursorHandlers = new Set<(id: string, x: number, y: number) => void>();
    private readonly noticeHandlers = new Set<(text: string, kind: 'ok' | 'bad' | 'info') => void>();
    /** Perubahan pratinjau CSV (cukup untuk panel Pet Skin, bukan halaman analisis). */
    private readonly previewHandlers = new Set<() => void>();

    private socket?: Socket;
    private session?: { room: string; name: string; fileUri?: vscode.Uri; fileName: string; host: string; port: number };
    /** Berkas room yang pernah diterima/dipakai → dipakai ulang saat bergabung lagi (tanpa unduh ulang). */
    private readonly datasets = new Map<string, { hash: string; uri: vscode.Uri; fileName: string }>();
    private incomingFiles: Array<{ id: string; name: string; size: number; from: string; at: number; staged: string; savedPath: string }> = [];
    private members: RoomMember[] = [];
    private selfId = '';
    /** id socket pemilik room — dipakai menampilkan tombol “Keluarkan” hanya di laptop pemilik. */
    private ownerId = '';
    private roomFile = '';
    private joined = false;
    private joining = false;
    private latency = 0;
    private pingTimer?: ReturnType<typeof setInterval>;
    /** Status sambungan Socket.IO (dipakai badge realtime di panel & halaman analisis). */
    private connected = false;
    private reconnecting = false;
    private reconnectAttempt = 0;

    private table?: CsvTable;
    private revision = 0;
    private preview: RoomPreviewView | null = null;
    private pendingRemote?: { text: string; summary: string; from: string; at: number };
    private lastApplied: { from: string; summary: string; at: number } | null = null;
    private note = '';
    private files: RoomFileItem[] = [];
    private filesLoadedAt = 0;
    private lastCursorSentAt = 0;
    private lastCursorSentX = -1;
    private lastCursorSentY = -1;
    private readonly latencyHandlers = new Set<(ms: number) => void>();

    constructor(private readonly ctx: vscode.ExtensionContext, options: RoomServiceOptions = {}) {
        this.logLine = (line) => {
            options.log?.(line);
        };
        if (options.onChange) { this.changeHandlers.add(options.onChange); }
        if (options.onCursor) { this.cursorHandlers.add(options.onCursor); }
        if (options.onNotice) { this.noticeHandlers.add(options.onNotice); }
        this.server = new RoomServer({
            log: (line) => this.log(line),
            onChange: () => this.emitChange(),
        });
    }

    /* ── konfigurasi & info ─────────────────────────────────────────────────── */

    private cfg() { return vscode.workspace.getConfiguration('dateSkunder'); }

    private configPort(): number {
        return Math.max(1024, Math.min(65535, Math.round(this.cfg().get<number>('room.port') ?? 47900)));
    }

    private get autoApplyCsv(): boolean {
        return this.cfg().get<boolean>('room.autoApplyCsv') ?? true;
    }

    private get showCursors(): boolean {
        return this.cfg().get<boolean>('room.showCursors') ?? true;
    }

    /** Alamat LAN laptop ini (untuk dibagikan ke laptop lain). */
    lanAddresses(): string[] {
        const out: string[] = [];
        const nets = os.networkInterfaces();
        for (const list of Object.values(nets)) {
            for (const net of list || []) {
                const family = String(net.family);
                if (net.internal || (family !== 'IPv4' && family !== '4')) { continue; }
                out.push(net.address);
            }
        }
        // Alamat rumah/kantor (192.168 → 10 → 172.16-31) didahulukan; adapter virtual menyusul.
        const rank = (ip: string) => {
            // Adapter virtual (VirtualBox/Docker/Hyper-V) jangan dipilih lebih dulu.
            const virtual = /^192\.168\.56\./.test(ip) || /^172\.(17|18|19)\./.test(ip) || /^10\.0\.75\./.test(ip) || /^169\.254\./.test(ip);
            if (virtual) { return 9; }
            if (ip.startsWith('192.168.')) { return 0; }
            if (ip.startsWith('10.')) { return 1; }
            if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) { return 2; }
            return 3;
        };
        return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
    }

    private lanUrls(): string[] {
        const port = this.server.info().port || this.configPort();
        return this.lanAddresses().map((ip) => `${ip}:${port}`);
    }

    /** Daftar alamat LAN yang bisa diketik di laptop lain. */
    lan(): string[] {
        return this.lanUrls();
    }

    serverRunning(): boolean { return this.server.running; }

    serverPort(): number { return this.server.info().port; }

    listRooms() { return this.server.listRooms(); }

    isInRoom(): boolean { return !!this.session; }

    /** true hanya di laptop pembuat room — satu-satunya yang boleh mengeluarkan peserta. */
    isOwner(): boolean { return !!this.session && !!this.ownerId && this.ownerId === this.selfId; }

    /** Pemilik room mengeluarkan peserta lain; laptop peserta itu langsung keluar. */
    async kick(id: string): Promise<void> {
        const socket = this.socket;
        const member = this.members.find((m) => m.id === id);
        if (!socket || !this.session) {
            this.note = 'Bergabung di room dulu sebelum mengeluarkan peserta.';
            this.emitChange();
            return;
        }
        if (!this.isOwner()) {
            this.note = 'Hanya pemilik room yang bisa mengeluarkan peserta.';
            this.notice(this.note, 'bad');
            this.emitChange();
            return;
        }
        if (!member) {
            this.note = 'Peserta tidak ditemukan (mungkin sudah keluar).';
            this.emitChange();
            return;
        }
        const ack = await this.emitAck<{ ok: boolean; message?: string }>(socket, 'room:kick', { id }, 8000);
        if (ack?.ok) {
            this.note = `“${member.name}” dikeluarkan dari room. Laptopnya langsung keluar dari room ini.`;
            this.notice(this.note, 'ok');
        } else {
            this.note = ack?.message || 'Gagal mengeluarkan peserta.';
            this.notice(this.note, 'bad');
        }
        this.emitChange();
    }

    roomFileName(): string { return this.session?.fileName || ''; }

    roomName(): string { return this.session?.room || ''; }

    selfMember(): RoomMember | undefined { return this.members.find((m) => m.id === this.selfId); }

    /** Id socket peserta ini ('' bila belum bergabung). */
    socketId(): string { return this.selfId; }

    /** Daftar peserta ringkas untuk overlay kursor (tanpa data berkas/CSV). */
    memberSnapshot(): Array<RoomMember & { self: boolean }> {
        return this.members.map((m) => ({ ...m, self: m.id === this.selfId }));
    }

    onChange(handler: () => void): vscode.Disposable {
        this.changeHandlers.add(handler);
        return { dispose: () => this.changeHandlers.delete(handler) };
    }

    onCursor(handler: (id: string, x: number, y: number) => void): vscode.Disposable {
        this.cursorHandlers.add(handler);
        return { dispose: () => this.cursorHandlers.delete(handler) };
    }

    onNotice(handler: (text: string, kind: 'ok' | 'bad' | 'info') => void): vscode.Disposable {
        this.noticeHandlers.add(handler);
        return { dispose: () => this.noticeHandlers.delete(handler) };
    }

    /** Latensi terukur (dipakai panel untuk memperbarui angka tanpa render ulang). */
    onLatency(handler: (ms: number) => void): vscode.Disposable {
        this.latencyHandlers.add(handler);
        return { dispose: () => this.latencyHandlers.delete(handler) };
    }

    /** Pratinjau CSV berubah → panel Pet Skin saja yang perlu digambar ulang. */
    onPreview(handler: () => void): vscode.Disposable {
        this.previewHandlers.add(handler);
        return { dispose: () => this.previewHandlers.delete(handler) };
    }

    /** Status koneksi ringkas (tanpa membangun seluruh keadaan view). */
    connectionState(): { connected: boolean; reconnecting: boolean; attempt: number } {
        return {
            connected: !!this.session && this.connected,
            reconnecting: !!this.session && this.reconnecting,
            attempt: this.reconnectAttempt,
        };
    }

    private emitChange(): void {
        for (const handler of [...this.changeHandlers]) {
            try { handler(); } catch { /* tampilan lain tidak boleh mematikan layanan */ }
        }
    }

    /** Hanya panel Pet Skin yang perlu tahu (mis. pratinjau CSV berubah). */
    private emitPreview(): void {
        for (const handler of [...this.previewHandlers]) {
            try { handler(); } catch { /* abaikan */ }
        }
    }

    private notice(text: string, kind: 'ok' | 'bad' | 'info' = 'info'): void {
        this.note = text;
        for (const handler of [...this.noticeHandlers]) {
            try { handler(text, kind); } catch { /* abaikan */ }
        }
    }

    /** Baris log untuk terminal & konsol. */
    private log(line: string): void {
        const jam = new Date().toLocaleTimeString('id-ID', { hour12: false });
        this.logLine(`${jam}  ${line}`);
    }

    /* ── server ─────────────────────────────────────────────────────────────── */

    async startServer(): Promise<void> {
        if (this.server.running) { return; }
        try {
            const port = await this.server.start(this.configPort());
            this.log(`Server room siap · ${port} · LAN: ${this.lanUrls().join(', ') || 'tidak ada jaringan'}`);
            this.emitChange();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.log(`Gagal menyalakan server room: ${message}`);
            this.note = `Server Socket.IO gagal menyala: ${message}`;
            this.emitChange();
            throw e;
        }
    }

    async stopServer(): Promise<void> {
        if (this.session) { await this.leave('Server dihentikan.'); }
        await this.server.stop();
        this.emitChange();
    }

    /* ── daftar berkas ──────────────────────────────────────────────────────── */

    /** Berkas CSV/Excel yang bisa dipilih untuk sebuah room (cache 15 detik). */
    async refreshFiles(force = false): Promise<RoomFileItem[]> {
        if (!force && this.files.length && Date.now() - this.filesLoadedAt < 15000) { return this.files; }
        const items: RoomFileItem[] = [];
        const seen = new Set<string>();
        const push = (uri: vscode.Uri) => {
            const key = uri.fsPath.toLowerCase();
            if (seen.has(key)) { return; }
            seen.add(key);
            const name = path.basename(uri.fsPath);
            items.push({ label: name, name, path: uri.fsPath, editable: isEditable(name) });
        };
        try {
            const found = await vscode.workspace.findFiles(
                '**/*.{csv,tsv,xlsx,xls,xlsm}',
                '**/{node_modules,.git,dist,build,out,.vscode-test,.tmp-check}/**',
                40,
            );
            found.forEach(push);
        } catch { /* folder besar bisa melewati batas waktu — daftar kosong tetap valid */ }
        // Berkas yang sedang dibuka di editor selalu di urutan depan.
        const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
        if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) {
            if (/\.(csv|tsv|xlsx|xls|xlsm)$/i.test(input.uri.fsPath)) {
                const key = input.uri.fsPath.toLowerCase();
                const existing = items.find((i) => i.path.toLowerCase() === key);
                if (existing) {
                    this.files = [existing, ...items.filter((i) => i !== existing)];
                    this.filesLoadedAt = Date.now();
                    return this.files;
                }
                push(input.uri);
                this.files = [items[items.length - 1], ...items.slice(0, -1)];
                this.filesLoadedAt = Date.now();
                return this.files;
            }
        }
        this.files = items.sort((a, b) => a.name.localeCompare(b.name));
        this.filesLoadedAt = Date.now();
        return this.files;
    }


    /** Berkas Excel/CSV boleh diubah hanya bila berupa teks. */
    rememberFile(uri: vscode.Uri): RoomFileItem {
        const name = path.basename(uri.fsPath);
        const item: RoomFileItem = { label: name, name, path: uri.fsPath, editable: isEditable(name) };
        this.files = [item, ...this.files.filter((f) => f.path.toLowerCase() !== item.path.toLowerCase())];
        this.filesLoadedAt = Date.now();
        return item;
    }

    /* ── join / keluar ──────────────────────────────────────────────────────── */

﻿    /* ── create / join / keluar ─────────────────────────────────────────────── */

    /** Buat room baru: laptop ini menjadi tuan rumah sekaligus pemilik data room. */
    async createRoom(opts: { room?: string; name?: string; filePath?: string }): Promise<void> {
        const room = String(opts.room ?? '').trim() || this.defaultRoomName();
        const name = String(opts.name ?? '').trim() || this.defaultUserName();
        const filePath = String(opts.filePath ?? '').trim();
        if (!filePath) {
            this.note = 'Pilih berkas CSV/Excel dulu untuk membuat room.';
            this.emitChange();
            return;
        }
        const fileUri = vscode.Uri.file(filePath);
        const fileName = path.basename(filePath);
        let bytes: Uint8Array;
        try {
            bytes = await vscode.workspace.fs.readFile(fileUri);
        } catch {
            this.note = `Berkas “${fileName}” tidak ditemukan di laptop ini.`;
            this.emitChange();
            return;
        }
        if (bytes.byteLength > MAX_ROOM_DATA) {
            this.note = `Berkas ${fileName} terlalu besar untuk room (${formatBytes(bytes.byteLength)}, batas ${formatBytes(MAX_ROOM_DATA)}).`;
            this.notice(this.note, 'bad');
            this.emitChange();
            return;
        }
        const dataset: RoomDataset = {
            name: fileName,
            size: bytes.byteLength,
            hash: createHash('sha1').update(bytes).digest('hex'),
            data: Buffer.from(bytes).toString('base64'),
        };
        await this.connectRoom({ host: '127.0.0.1', room, name, create: true, fileUri, fileName, dataset });
    }

    /** Gabung ke room milik laptop lain; data + analisis pemilik otomatis diterima & dibuka. */
    async joinRoom(opts: { host?: string; room?: string; name?: string }): Promise<void> {
        const host = String(opts.host ?? '').trim();
        const room = String(opts.room ?? '').trim() || this.defaultRoomName();
        const name = String(opts.name ?? '').trim() || this.defaultUserName();
        if (!host) {
            this.note = 'Isi alamat laptop tuan rumah (mis. 192.168.1.7:47900) untuk bergabung.';
            this.emitChange();
            return;
        }
        await this.connectRoom({ host, room, name, create: false });
    }

    private async connectRoom(opts: {
        host: string;
        room: string;
        name: string;
        create: boolean;
        fileUri?: vscode.Uri;
        fileName?: string;
        dataset?: RoomDataset;
    }): Promise<void> {
        if (this.joining) { return; }
        this.joining = true;
        try {
            if (this.session) { await this.leave('Pindah room.', { silent: true }); }
            const { room, name, create } = opts;
            if (!room || !name) {
                this.note = 'Nama room dan nama kamu wajib diisi.';
                this.emitChange();
                return;
            }
            if (create && !opts.dataset) {
                this.note = 'Data room belum siap — pilih berkas lalu coba lagi.';
                this.emitChange();
                return;
            }
            // Alamat sendiri → pakai server lokal (hindari "hairpin" lewat IP LAN).
            const parsed = parseAddress(opts.host, this.configPort());
            const local = this.isLocalHost(parsed.host);
            let host = parsed.host;
            let port = parsed.port;
            if (local) {
                if (!this.server.running) { await this.startServer(); }
                host = '127.0.0.1';
                port = this.server.info().port || this.configPort();
            }

            if (create && opts.fileUri) {
                await this.loadTable(opts.fileUri, opts.fileName || room);
            }

            const socket = ioClient(`http://${host}:${port}`, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                // Sambungan dijaga terus (bukan menyerah setelah beberapa kali) supaya tidak “patah”.
                reconnectionAttempts: Infinity,
                reconnectionDelay: 600,
                reconnectionDelayMax: 3000,
                timeout: 9000,
                autoConnect: true,
                forceNew: true,
                rememberUpgrade: true,
            });
            this.socket = socket;
            this.wireSocket(socket);
            this.note = `Menghubungkan ke ${host}:${port}…`;
            this.emitChange();

            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Waktu habis — server tidak menjawab (cek alamat & firewall).')), 10000);
                const done = () => { clearTimeout(timer); resolve(); };
                const fail = (e: Error) => { clearTimeout(timer); reject(e); };
                socket.once('connect', done);
                socket.once('connect_error', (err: Error) => fail(new Error(`Gagal terhubung: ${err.message}`)));
            });

            const cache = this.datasets.get(room.toLowerCase());
            const result = await this.emitAck<JoinResult>(socket, 'room:hello', {
                room,
                name,
                device: os.hostname(),
                platform: `${process.platform}${process.arch ? ` · ${process.arch}` : ''}`,
                skin: this.skinPayload(),
                create,
                file: opts.fileName,
                dataset: opts.dataset,
                haveHash: create ? opts.dataset?.hash : cache?.hash,
            }, 15000);

            if (!result?.ok) {
                socket.disconnect();
                this.socket = undefined;
                this.table = undefined;
                this.revision++;
                this.note = result?.message || 'Tidak bisa bergabung ke room.';
                this.log(`Join ditolak: ${this.note}`);
                this.notice(this.note, 'bad');
                this.emitChange();
                return;
            }

            this.selfId = result.selfId;
            this.ownerId = result.snapshot.ownerId || '';
            this.members = result.snapshot.members;
            this.roomFile = result.snapshot.file;
            this.session = {
                room: result.snapshot.room,
                name,
                fileUri: create ? opts.fileUri : undefined,
                fileName: result.snapshot.file,
                host,
                port,
            };
            this.joined = true;

            if (create && opts.dataset && opts.fileUri) {
                // Pemilik: data sudah ada di laptop ini, cukup dicatat untuk bergabung ulang.
                this.datasets.set(room.toLowerCase(), { hash: opts.dataset.hash, uri: opts.fileUri, fileName: opts.dataset.name });
                this.note = `Room “${result.snapshot.room}” dibuat · ${this.members.length} perangkat · data ${opts.dataset.name}.`;
                this.notice(this.note, 'ok');
                void this.openViewer(opts.fileUri);
            } else {
                this.note = `Bergabung di room “${result.snapshot.room}” · ${this.members.length} perangkat.`;
                this.notice(this.note, 'ok');
                if (cache && (!result.dataset || result.dataset.hash === cache.hash)) {
                    // Sudah punya berkas yang sama → tidak perlu unduh ulang, langsung buka analisis.
                    this.session.fileUri = cache.uri;
                    this.session.fileName = cache.fileName;
                    await this.loadTable(cache.uri, cache.fileName);
                    void this.openViewer(cache.uri);
                } else if (result.dataset) {
                    this.note = `Menerima data room “${result.snapshot.room}” (${formatBytes(result.dataset.size)})…`;
                    this.emitChange();
                    socket.emit('room:dataset:get', { room: result.snapshot.room });
                } else {
                    this.note = 'Bergabung, tetapi room ini tidak menyediakan data berkas.';
                }
            }

            this.startPing();
            void this.ctx.workspaceState.update(LAST_KEY, { host: `${host}:${port}`, room: result.snapshot.room, name });
            this.emitChange();
        } catch (e) {
            this.socket?.disconnect();
            this.socket = undefined;
            this.joined = false;
            this.session = undefined;
            this.note = e instanceof Error ? e.message : String(e);
            this.log(`Gagal bergabung: ${this.note}`);
            this.notice(this.note, 'bad');
            this.emitChange();
        } finally {
            this.joining = false;
        }
    }

    async leave(reason = 'Kamu keluar dari room.', opts: { silent?: boolean } = {}): Promise<void> {
        const session = this.session;
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = undefined; }
        // Sesi dibersihkan lebih dulu supaya handler `disconnect` tidak mengira koneksi putus tiba-tiba.
        this.session = undefined;
        this.joined = false;
        this.connected = false;
        this.reconnecting = false;
        this.reconnectAttempt = 0;
        try { this.socket?.emit('room:leave'); } catch { /* socket mungkin sudah mati */ }
        this.socket?.disconnect();
        this.socket = undefined;
        this.selfId = '';
        this.ownerId = '';
        this.members = [];;
        this.roomFile = '';
        this.table = undefined;
        this.preview = null;
        this.pendingRemote = undefined;
        this.lastApplied = null;
        this.lastCursorSentX = -1;
        this.lastCursorSentY = -1;
        this.revision++;
        this.latency = 0;
        if (!opts.silent) {
            this.note = reason;
            this.log(reason);
            this.notice(reason, 'info');
        }
        if (session) { this.emitChange(); }
    }

    private isLocalHost(host: string): boolean {
        const key = String(host || '').toLowerCase();
        return key === '127.0.0.1' || key === 'localhost' || key === '::1' || this.lanAddresses().includes(host);
    }

    private defaultRoomName(): string {
        const last = this.ctx.workspaceState.get<{ room?: string }>(LAST_KEY) || {};
        return String(this.cfg().get<string>('room.name') || last.room || 'date-skunder').trim() || 'date-skunder';
    }

    private defaultUserName(): string {
        const last = this.ctx.workspaceState.get<{ name?: string }>(LAST_KEY) || {};
        return String(this.cfg().get<string>('room.userName') || last.name || os.userInfo().username || 'User').trim() || 'User';
    }

    private wireSocket(socket: Socket): void {
        socket.on('connect', () => {
            this.connected = true;
            this.reconnecting = false;
            this.reconnectAttempt = 0;
            if (!this.session) { this.emitChange(); return; }
            this.joined = true;
            const session = this.session;
            const cache = this.datasets.get(session.room.toLowerCase());
            // Sambungan pulih → daftarkan ulang supaya daftar perangkat tetap benar.
            void this.emitAck<JoinResult>(socket, 'room:hello', {
                room: session.room,
                name: session.name,
                device: os.hostname(),
                platform: `${process.platform}${process.arch ? ` · ${process.arch}` : ''}`,
                skin: this.skinPayload(),
                create: false,
                file: session.fileName,
                haveHash: cache?.hash,
            }, 12000).then((result) => {
                if (result?.ok) {
                    this.selfId = result.selfId;
                    this.ownerId = result.snapshot.ownerId || '';
                    this.members = result.snapshot.members;
                    this.roomFile = result.snapshot.file;
                    // Data room berubah (mis. setelah peserta lain membuat ulang) → minta ulang.
                    if (result.dataset && result.dataset.hash !== cache?.hash) {
                        socket.emit('room:dataset:get', { room: result.snapshot.room });
                    }
                    // Kursor terakhir dikirim ulang agar peserta lain langsung melihat posisinya.
                    if (this.lastCursorSentX >= 0) {
                        socket.volatile.emit('room:cursor', { x: this.lastCursorSentX, y: this.lastCursorSentY });
                    }
                    this.emitChange();
                }
            }).catch(() => undefined);
            this.emitChange();
        });
        socket.on('disconnect', (reason: string) => {
            this.joined = false;
            this.connected = false;
            if (this.session) {
                this.reconnecting = true;
                this.note = `Sambungan ke server terputus (${reason}). Menyambung ulang otomatis…`;
                this.log(this.note);
                this.emitChange();
            }
        });
        socket.on('connect_error', (err: Error) => {
            this.connected = false;
            this.note = `Tidak bisa menghubungi server: ${err.message}`;
            this.emitChange();
        });
        // Percobaan sambung ulang dilaporkan supaya panel bisa menampilkan status yang jujur.
        socket.io.on('reconnect_attempt', (attempt: number) => {
            if (!this.session) { return; }
            this.reconnecting = true;
            this.reconnectAttempt = attempt;
            this.emitChange();
        });
        socket.io.on('reconnect_failed', () => {
            this.reconnecting = false;
            this.note = 'Gagal menyambung ulang ke server. Periksa jaringan, lalu tekan Join Room lagi.';
            this.emitChange();
        });
        socket.on('room:state', (snapshot: RoomSnapshot) => {
            if (!snapshot || !Array.isArray(snapshot.members)) { return; }
            this.members = snapshot.members;
            this.roomFile = snapshot.file;
            if (this.session) { this.session.room = snapshot.room; }
            this.emitChange();
        });
        socket.on('room:cursor', (payload: { id?: string; x?: number; y?: number }) => {
            const member = this.members.find((m) => m.id === payload?.id);
            if (!member) { return; }
            member.cursor = { x: clamp01(payload.x), y: clamp01(payload.y), at: Date.now() };
            if (!this.showCursors) { return; }
            for (const handler of [...this.cursorHandlers]) {
                try { handler(member.id, member.cursor.x, member.cursor.y); } catch { /* abaikan */ }
            }
        });
        socket.on('room:csv:preview', (payload: { from?: { name?: string }; summary?: string; changes?: CellDiff[]; at?: number }) => {
            const from = String(payload?.from?.name || 'Peserta lain');
            this.preview = {
                kind: 'incoming',
                from,
                summary: String(payload?.summary || 'Sedang menyiapkan perubahan CSV.'),
                changed: Array.isArray(payload?.changes) ? payload.changes.slice(0, 24) : [],
                count: Array.isArray(payload?.changes) ? payload.changes.length : 0,
                at: Number(payload?.at) || Date.now(),
                auto: this.autoApplyCsv,
                pending: false,
            };
            this.log(`${from} menyiapkan perubahan CSV: ${this.preview.summary}`);
            // Hanya panel Pet Skin yang perlu diperbarui (halaman analisis tidak ikut berkedip).
            this.emitPreview();
        });
        socket.on('room:csv:applied', (payload: { from?: { name?: string }; fileName?: string; summary?: string; text?: string; at?: number }) => {
            void this.receiveCsv(payload);
        });
        socket.on('room:dataset', (payload: RoomDataset) => {
            void this.receiveDataset(payload);
        });
        socket.on('room:file', (payload: { from?: { name?: string }; name?: string; data?: string }) => {
            void this.receiveFile(payload);
        });
        // Pemilik room mengeluarkan laptop ini → sesi ditutup + alasan ditampilkan.
        socket.on('room:kicked', (payload: { room?: string; by?: { name?: string } }) => {
            const room = String(payload?.room || this.session?.room || 'room');
            const by = String(payload?.by?.name || 'Pemilik room');
            void this.handleKicked(room, by);
        });
        socket.on('room:notice', (payload: { text?: string }) => {
            const text = String(payload?.text || '');
            if (text) { this.notice(text, 'info'); }
        });
    }

    /** Dipanggil saat pemilik room mengeluarkan laptop ini dari room. */
    private async handleKicked(room: string, by: string): Promise<void> {
        if (!this.session) { return; }
        this.preview = null;
        await this.leave(`Kamu dikeluarkan dari room “${room}” oleh ${by}.`, { silent: true });
        this.note = `Kamu dikeluarkan dari room “${room}” oleh ${by}. Kamu bisa membuka berkas lain atau bergabung lagi dengan nama room yang sama.`;
        this.notice(this.note, 'bad');
        this.emitChange();
    }

    private startPing(): void {
        if (this.pingTimer) { clearInterval(this.pingTimer); }
        const ping = () => {
            const socket = this.socket;
            if (!socket || !socket.connected) { return; }
            const t0 = Date.now();
            socket.timeout(4000).emit('room:ping', (err: Error | null) => {
                if (err) { return; }
                const next = Math.max(1, Date.now() - t0);
                const changed = this.latency === 0 || Math.abs(next - this.latency) >= 2;
                this.latency = next;
                // Hanya angka latensi yang dikirim ulang — panel tidak perlu digambar ulang seluruhnya.
                if (!changed) { return; }
                for (const handler of [...this.latencyHandlers]) {
                    try { handler(next); } catch { /* abaikan */ }
                }
            });
        };
        ping();
        this.pingTimer = setInterval(ping, 5000);
    }

    /* ── kursor & skin ──────────────────────────────────────────────────────── */

    /** Kursor pengguna ini → semua peserta lain (±30 pesan/detik, posisi kembar dilewati). */
    sendCursor(x: number, y: number): void {
        const socket = this.socket;
        if (!socket || !this.joined || !this.session) { return; }
        const now = Date.now();
        if (now - this.lastCursorSentAt < 33) { return; }
        const nx = clamp01(x);
        const ny = clamp01(y);
        if (this.lastCursorSentX >= 0 && Math.abs(nx - this.lastCursorSentX) < 0.0007 && Math.abs(ny - this.lastCursorSentY) < 0.0007) {
            return;
        }
        this.lastCursorSentAt = now;
        this.lastCursorSentX = nx;
        this.lastCursorSentY = ny;
        const self = this.selfMember();
        if (self) { self.cursor = { x: nx, y: ny, at: now }; }
        socket.volatile.emit('room:cursor', { x: nx, y: ny });
    }

    private skinPayload(): RoomSkin {
        const payload = petSkinPayload(activePetSkin(this.ctx));
        return {
            id: payload.id,
            name: payload.name,
            colors: payload.colors as unknown as Record<string, string>,
            accessorySvg: payload.accessorySvg,
        };
    }

    /** Kostum diganti → beri tahu peserta lain supaya spider di kursor mereka ikut berganti. */
    setSkin(): void {
        const skin = this.skinPayload();
        const self = this.selfMember();
        if (self) { self.skin = skin; }
        if (this.socket && this.joined) {
            this.socket.emit('room:skin', skin);
            this.emitChange();
        }
    }

    /* ── CSV bersama ────────────────────────────────────────────────────────── */

    private async loadTable(uri: vscode.Uri, fileName: string): Promise<void> {
        this.emitChange();
        if (!isEditable(fileName)) {
            this.table = undefined;
            this.revision++;
            return;
        }
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(bytes).toString('utf8');
            this.table = readCsv(text, true);
            this.preview = null;
            this.pendingRemote = undefined;
            this.revision++;
            this.log(`CSV dimuat: ${fileName} · ${this.table.totalRows} baris · ${this.table.totalCols} kolom · pemisah ${JSON.stringify(this.table.delimiter)}`);
        } catch (e) {
            this.table = undefined;
            this.note = `Berkas ${fileName} tidak bisa dibaca sebagai CSV: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    /** Pratinjau perubahan lokal (belum ditulis): dipakai panel sebelum menekan Terapkan. */
    previewLocalChanges(changes: CellChange[]): void {
        if (!this.table) { return; }
        const rows = applyCellChanges(this.table.rows, changes, this.table.totalCols);
        const { changed, count } = diffCells(this.table.rows, rows, this.table.columns, 40);
        if (!count) {
            this.preview = null;
            this.note = 'Belum ada sel yang berubah.';
            this.emitChange();
            return;
        }
        const summary = csvSummary(changed, count);
        this.preview = { kind: 'local', from: 'Kamu', summary, changed, count, at: Date.now(), auto: false, pending: true };
        // Peserta lain melihat pratinjau lebih dulu, sebelum perubahannya diterapkan.
        if (this.socket && this.joined && this.session) {
            this.socket.emit('room:csv:preview', { summary, changes: changed.slice(0, 20), fileName: this.session.fileName });
        }
        this.emitPreview();
    }

    /** Tulis perubahan ke berkas laptop ini lalu siarkan ke semua peserta room. */
    async applyLocalChanges(changes: CellChange[]): Promise<void> {
        const session = this.session;
        const table = this.table;
        if (!session || !table) {
            this.note = 'Bergabung di room dengan berkas CSV dulu sebelum mengubah data.';
            this.emitChange();
            return;
        }
        if (!table.editable) {
            this.note = 'Berkas Excel tidak bisa diubah dari panel ini — pakai CSV/TSV.';
            this.emitChange();
            return;
        }
        if (!session.fileUri) {
            this.note = 'Berkas room belum diterima di laptop ini — tunggu data selesai diunduh.';
            this.emitChange();
            return;
        }
        const rows = applyCellChanges(table.rows, changes, table.totalCols);
        const { changed, count } = diffCells(table.rows, rows, table.columns, 40);
        if (!count) {
            this.note = 'Tidak ada perubahan untuk diterapkan.';
            this.emitChange();
            return;
        }
        const text = toCsv(rows, table.delimiter, table.eol);
        const summary = csvSummary(changed, count);
        const bytes = Buffer.byteLength(text, 'utf8');
        try {
            await vscode.workspace.fs.writeFile(session.fileUri, Buffer.from(text, 'utf8'));
        } catch (e) {
            this.note = `Gagal menulis ${session.fileName}: ${e instanceof Error ? e.message : String(e)}`;
            this.notice(this.note, 'bad');
            this.emitChange();
            return;
        }
        table.rows = rows;
        table.totalRows = Math.max(0, rows.length - 1);
        this.revision++;
        this.preview = { kind: 'local', from: 'Kamu', summary, changed, count, at: Date.now(), auto: false, pending: false };
        this.lastApplied = { from: 'Kamu', summary, at: Date.now() };
        this.note = `CSV diterapkan: ${summary}`;
        this.log(`CSV lokal ditulis (${summary}) dan disiarkan ke room “${session.room}”.`);
        if (bytes > 500 * 1024) {
            this.note = `CSV tersimpan di laptop ini, tetapi terlalu besar untuk disiarkan (${Math.round(bytes / 1024)} KB, batas ±500 KB).`;
            this.notice(this.note, 'bad');
        } else if (this.socket && this.joined) {
            const ack = await this.emitAck<{ ok: boolean; message?: string }>(this.socket, 'room:csv:apply', { text, summary }, 12000);
            if (!ack) {
                this.note = 'CSV tersimpan di laptop ini, tetapi server tidak menjawab — peserta lain mungkin belum menerima.';
                this.notice(this.note, 'bad');
            } else if (ack.ok === false) {
                this.note = ack.message || 'CSV tersimpan lokal, tetapi gagal dikirim ke peserta lain.';
                this.notice(this.note, 'bad');
            } else {
                this.notice(`CSV diperbarui untuk semua perangkat di room (${summary}).`, 'ok');
            }
        } else {
            this.note = `CSV tersimpan di laptop ini (${summary}) — sambungan room sedang terputus, jadi belum disiarkan.`;
            this.notice(this.note, 'bad');
        }
        this.emitChange();
    }

    /** Perubahan dari laptop lain: default langsung ditulis (autoApplyCsv = true). */
    private async receiveCsv(payload: { from?: { name?: string }; fileName?: string; summary?: string; text?: string; at?: number }): Promise<void> {
        const session = this.session;
        if (!session) { return; }
        const fileName = String(payload?.fileName || '');
        if (fileName && fileName.toLowerCase() !== session.fileName.toLowerCase()) { return; }
        const text = String(payload?.text ?? '');
        if (!text.trim()) { return; }
        const from = String(payload?.from?.name || 'Peserta lain');
        const summary = String(payload?.summary || 'CSV diperbarui.');
        if (!this.autoApplyCsv) {
            this.pendingRemote = { text, summary, from, at: Number(payload?.at) || Date.now() };
            this.preview = {
                kind: 'incoming',
                from,
                summary,
                changed: [],
                count: 0,
                at: Number(payload?.at) || Date.now(),
                auto: false,
                pending: true,
            };
            this.note = `${from} mengirim CSV baru (${summary}). Menunggu tombol “Terapkan”.`;
            this.notice(this.note, 'info');
            this.emitChange();
            return;
        }
        await this.writeIncoming(text, summary, from);
    }

    /** Batalkan pratinjau perubahan lokal (belum ada yang ditulis). */
    clearPreview(): void {
        if (!this.preview) { return; }
        this.preview = null;
        this.note = 'Perubahan dibatalkan — berkas CSV tidak diubah.';
        this.emitChange();
    }

    /** Salin isi CSV lama ke penyimpanan ekstensi sebelum ditimpa peserta lain. */
    private async backupTable(session: { fileName: string }): Promise<void> {
        const base = this.ctx.globalStorageUri;
        if (!base || !this.table) { return; }
        try {
            const dir = vscode.Uri.joinPath(base, 'room-backup');
            await vscode.workspace.fs.createDirectory(dir);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const target = vscode.Uri.joinPath(dir, `${stamp}-${session.fileName}`);
            await vscode.workspace.fs.writeFile(target, Buffer.from(toCsv(this.table.rows, this.table.delimiter, this.table.eol), 'utf8'));
            const entries = await vscode.workspace.fs.readDirectory(dir);
            if (entries.length > 30) {
                const names = entries.map((entry) => String(entry[0])).sort();
                for (const name of names.slice(0, names.length - 30)) {
                    await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, name)).then(() => undefined, () => undefined);
                }
            }
        } catch {
            // Cadangan bersifat tambahan: kegagalan menyimpannya tidak boleh membatalkan sinkronisasi.
        }
    }

    /** Tombol “Terapkan” untuk perubahan yang menunggu (autoApplyCsv dimatikan). */
    async applyPendingRemote(): Promise<void> {
        const pending = this.pendingRemote;
        if (!pending) { return; }
        this.pendingRemote = undefined;
        await this.writeIncoming(pending.text, pending.summary, pending.from);
    }

    private async writeIncoming(text: string, summary: string, from: string): Promise<void> {
        const session = this.session;
        if (!session || !session.fileUri) { return; }
        try {
            const beforeRows = this.table ? this.table.rows : [];
            const next = readCsv(text, true, this.table?.delimiter);
            const { changed, count } = diffCells(beforeRows, next.rows, next.columns, 40);
            // Sebelum ditimpa, isi lama disimpan di penyimpanan ekstensi (30 cadangan terakhir).
            await this.backupTable(session);
            await vscode.workspace.fs.writeFile(session.fileUri, Buffer.from(text, 'utf8'));
            this.table = next;
            this.revision++;
            this.lastApplied = { from, summary, at: Date.now() };
            this.preview = {
                kind: 'incoming',
                from,
                summary,
                changed,
                count,
                at: Date.now(),
                auto: true,
                pending: false,
            };
            this.note = `CSV diganti otomatis oleh ${from} · ${summary}`;
            this.log(`${from} mengganti CSV di laptop ini (${summary}).`);
            this.notice(`📥 ${from} memperbarui ${session.fileName} · ${summary}`, 'ok');
        } catch (e) {
            this.note = `Gagal mengganti CSV: ${e instanceof Error ? e.message : String(e)}`;
            this.notice(this.note, 'bad');
        }
        this.emitChange();
    }

    /** Muat ulang isi CSV dari disk (tombol “Muat ulang”). */
    async reloadTable(): Promise<void> {
        const session = this.session;
        if (!session || !session.fileUri) { return; }
        this.preview = null;
        this.pendingRemote = undefined;
        await this.loadTable(session.fileUri, session.fileName);
        this.note = 'Isi CSV dimuat ulang dari berkas.';
        this.emitChange();
    }

﻿    /* ── data room & transfer berkas ────────────────────────────────────────── */

    /** Buka berkas room di halaman analisis Date Skunder (otomatis setelah create/join). */
    private async openViewer(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.commands.executeCommand('vscode.openWith', uri, 'dateSkunder.viewer');
        } catch (e) {
            this.log(`Tidak bisa membuka analisis otomatis: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Tempat berkas room diterima: folder workspace (mudah ditemukan) atau penyimpanan ekstensi. */
    private async targetRoomFile(room: string, fileName: string): Promise<vscode.Uri> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        const base = folder
            ? vscode.Uri.joinPath(folder.uri, 'Date Skunder Room', safeName(room))
            : vscode.Uri.joinPath(this.ctx.globalStorageUri, 'rooms', safeName(room));
        await vscode.workspace.fs.createDirectory(base);
        return vscode.Uri.joinPath(base, safeName(fileName));
    }

    /** Terima isi berkas room dari server → tulis lokal, muat analisis, lalu buka halamannya. */
    private async receiveDataset(raw: RoomDataset): Promise<void> {
        const session = this.session;
        if (!session) { return; }
        const data = String(raw?.data ?? '');
        const bytes = data ? Buffer.from(data, 'base64') : Buffer.alloc(0);
        if (!bytes.length) {
            this.note = 'Data room kosong — tidak bisa dibuka.';
            this.notice(this.note, 'bad');
            this.emitChange();
            return;
        }
        if (bytes.byteLength > MAX_ROOM_DATA) {
            this.note = `Data room terlalu besar (${formatBytes(bytes.byteLength)}).`;
            this.notice(this.note, 'bad');
            this.emitChange();
            return;
        }
        try {
            const uri = await this.targetRoomFile(session.room, session.fileName);
            await vscode.workspace.fs.writeFile(uri, bytes);
            session.fileUri = uri;
            this.datasets.set(session.room.toLowerCase(), { hash: String(raw.hash || ''), uri, fileName: session.fileName });
            await this.loadTable(uri, session.fileName);
            this.note = `Data room diterima (${formatBytes(bytes.byteLength)}) — analisis ${session.fileName} dibuka.`;
            this.notice(this.note, 'ok');
            this.emitChange();
            await this.openViewer(uri);
        } catch (e) {
            this.note = `Gagal menyimpan data room: ${e instanceof Error ? e.message : String(e)}`;
            this.notice(this.note, 'bad');
            this.emitChange();
        }
    }

    /** Pilih & kirim berkas ke semua peserta room (penerima melihat tombol Download). */
    async sendFile(): Promise<void> {
        if (!this.session || !this.socket || !this.joined) {
            this.note = 'Bergabung di room dulu sebelum mengirim berkas.';
            this.emitChange();
            return;
        }
        const picked = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Kirim ke room',
        });
        const uri = picked?.[0];
        if (!uri) { return; }
        await this.sendFilePath(uri);
    }

    private async sendFilePath(uri: vscode.Uri): Promise<void> {
        const name = path.basename(uri.fsPath) || 'berkas';
        let bytes: Uint8Array;
        try {
            bytes = await vscode.workspace.fs.readFile(uri);
        } catch {
            this.note = `Berkas “${name}” tidak bisa dibaca.`;
            this.emitChange();
            return;
        }
        if (bytes.byteLength > MAX_ROOM_FILE) {
            this.note = `Berkas ${name} terlalu besar (${formatBytes(bytes.byteLength)}, batas ${formatBytes(MAX_ROOM_FILE)}).`;
            this.notice(this.note, 'bad');
            this.emitChange();
            return;
        }
        const ack = await this.emitAck<{ ok: boolean; message?: string }>(this.socket!, 'room:file', {
            name,
            data: Buffer.from(bytes).toString('base64'),
        }, 20000);
        if (ack?.ok) {
            this.note = `Berkas “${name}” dikirim ke semua perangkat di room.`;
            this.notice(this.note, 'ok');
        } else {
            this.note = ack?.message || 'Berkas gagal dikirim.';
            this.notice(this.note, 'bad');
        }
        this.emitChange();
    }

    /** Berkas masuk: simpan sementara + tampilkan tombol Download (panel & notifikasi VS Code). */
    private async receiveFile(payload: { from?: { name?: string }; name?: string; data?: string }): Promise<void> {
        if (!this.session) { return; }
        const from = String(payload?.from?.name || 'Peserta lain');
        const name = safeName(String(payload?.name || 'berkas'));
        const raw = String(payload?.data || '');
        const bytes = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
        if (!bytes.length || bytes.byteLength > MAX_ROOM_FILE) { return; }
        try {
            const dir = vscode.Uri.joinPath(this.ctx.globalStorageUri, 'incoming');
            await vscode.workspace.fs.createDirectory(dir);
            const staged = vscode.Uri.joinPath(dir, `${Date.now()}-${name}`);
            await vscode.workspace.fs.writeFile(staged, bytes);
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            this.incomingFiles.unshift({
                id,
                name,
                size: bytes.byteLength,
                from,
                at: Date.now(),
                staged: staged.fsPath,
                savedPath: '',
            });
            this.incomingFiles = this.incomingFiles.slice(0, 8);
            this.note = `📥 ${from} mengirim berkas “${name}” (${formatBytes(bytes.byteLength)}).`;
            this.notice(this.note, 'ok');
            this.emitChange();
            const choice = await vscode.window.showInformationMessage(
                `📥 File “${name}” dari ${from} (${formatBytes(bytes.byteLength)})`,
                'Download',
                'Nanti',
            );
            if (choice === 'Download') { await this.downloadFile(id); }
        } catch (e) {
            this.log(`Gagal menerima berkas: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Simpan berkas masuk ke lokasi pilihan pengguna (default folder Downloads). */
    async downloadFile(id: string): Promise<void> {
        const entry = this.incomingFiles.find((f) => f.id === id);
        if (!entry) { return; }
        const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', entry.name)),
            saveLabel: 'Download',
        });
        if (!target) { return; }
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(entry.staged));
            await vscode.workspace.fs.writeFile(target, bytes);
            entry.savedPath = target.fsPath;
            this.note = `Berkas “${entry.name}” disimpan ke ${target.fsPath}.`;
            this.notice(this.note, 'ok');
        } catch (e) {
            this.note = `Gagal menyimpan berkas: ${e instanceof Error ? e.message : String(e)}`;
            this.notice(this.note, 'bad');
        }
        this.emitChange();
    }

    /* ── keadaan untuk view ─────────────────────────────────────────────────── */

    viewState(): RoomViewState {
        const session = this.session;
        const info = this.server.info();
        const last = this.ctx.workspaceState.get<{ host?: string; room?: string; name?: string }>(LAST_KEY) || {};
        const fileWindow = this.table ? tableWindow(this.table, MAX_PREVIEW_ROWS, MAX_PREVIEW_COLS) : null;
        return {
            server: {
                running: this.server.running,
                host: info.host,
                port: info.port,
                lan: this.lanUrls(),
                rooms: this.server.listRooms().map((r) => ({ room: r.room, file: r.file, members: r.members, names: r.names })),
            },
            session: session
                ? { room: session.room, name: session.name, fileName: session.fileName, host: session.host, port: session.port, owner: this.isOwner() }
                : null,
            connection: this.connectionState(),
            members: this.members.map((m) => ({
                ...m,
                self: m.id === this.selfId,
                latency: m.id === this.selfId ? this.latency : undefined,
            })),
            csv: this.session && this.table && fileWindow
                ? {
                    fileName: session?.fileName || '',
                    editable: this.table.editable,
                    columns: this.table.columns.slice(0, MAX_PREVIEW_COLS),
                    rows: fileWindow.rows,
                    totalRows: this.table.totalRows,
                    totalCols: this.table.totalCols,
                    revision: this.revision,
                    truncated: fileWindow.truncated,
                }
                : null,
            files: this.files,
            preview: this.preview,
            lastApplied: this.lastApplied,
            note: this.note,
            incomingFiles: this.incomingFiles.map((f) => ({
                id: f.id,
                name: f.name,
                sizeLabel: formatBytes(f.size),
                from: f.from,
                at: f.at,
                savedPath: f.savedPath,
            })),
            defaults: {
                room: String(this.cfg().get<string>('room.name') || last.room || 'date-skunder'),
                name: String(this.cfg().get<string>('room.userName') || last.name || os.userInfo().username || 'User'),
                host: String(this.cfg().get<string>('room.host') || last.host || this.lanUrls()[0] || `127.0.0.1:${info.port || this.configPort()}`),
            },
            device: os.hostname(),
            platform: `${process.platform} ${process.arch}`,
        };
    }

    dispose(): void {
        if (this.pingTimer) { clearInterval(this.pingTimer); }
        try { this.socket?.disconnect(); } catch { /* sudah mati */ }
        this.socket = undefined;
        void this.server.stop();
    }

    /* ── util socket ────────────────────────────────────────────────────────── */

    private emitAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = 10000): Promise<T | undefined> {
        return new Promise<T | undefined>((resolve) => {
            let done = false;
            const timer = setTimeout(() => { if (!done) { done = true; resolve(undefined); } }, timeoutMs);
            try {
                socket.emit(event, payload, (result: T) => {
                    if (done) { return; }
                    done = true;
                    clearTimeout(timer);
                    resolve(result);
                });
            } catch {
                done = true;
                clearTimeout(timer);
                resolve(undefined);
            }
        });
    }
}

function clamp01(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) { return 0; }
    return Math.max(0, Math.min(1, n));
}

/** Berkas CSV/TSV/TXT bisa diedit langsung; Excel hanya pratinjau. */
export function isEditable(fileName: string): boolean {
    return /\.(csv|tsv|txt)$/i.test(String(fileName || ''));
}

/** "192.168.1.7:47900" → { host, port }; tanpa port memakai port bawaan. */
export function parseAddress(text: unknown, fallbackPort: number): { host: string; port: number } {
    const raw = String(text ?? '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
    const match = /^([^:]+)(?::(\d+))?$/.exec(raw);
    const host = (match ? match[1] : raw).trim() || '127.0.0.1';
    const port = Math.max(1024, Math.min(65535, Math.round(Number(match && match[2]) || fallbackPort)));
    return { host, port };
}

/** Nama berkas/folder aman untuk semua sistem operasi. */
function safeName(raw: string): string {
    const base = String(raw || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 120);
    return base && base !== '.' && base !== '..' ? base : 'berkas';
}

/** Ukuran berkas yang mudah dibaca (KB/MB). */
function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) { return '0 KB'; }
    if (bytes < 1024 * 1024) { return `${Math.max(1, Math.round(bytes / 1024))} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
