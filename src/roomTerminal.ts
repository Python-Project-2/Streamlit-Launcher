/**
 * Terminal untuk server Socket.IO (fitur Join Room).
 *
 * Menampilkan alamat LAN yang bisa diketik di laptop lain, daftar room, dan perangkat
 * yang sedang bergabung. Perintah yang tersedia: help, status, devices, rooms, url,
 * start, stop, clear, exit.
 */
import * as vscode from 'vscode';
import { RoomService } from './roomService';

export interface RoomTerminalOptions {
    service: RoomService;
    onOpenPanel?: () => void;
}

export class RoomTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private readonly closeEmitter = new vscode.EventEmitter<void>();
    readonly onDidWrite = this.writeEmitter.event;
    readonly onDidClose = this.closeEmitter.event;

    private opened = false;
    private input = '';
    private pending: string[] = [];

    constructor(private readonly opts: RoomTerminalOptions) { }

    open(): void {
        this.opened = true;
        this.banner();
        for (const line of this.pending) { this.write(`  ${line}\r\n`); }
        this.pending = [];
        this.prompt();
    }

    close(): void {
        this.opened = false;
    }

    setDimensions(): void { /* ukuran terminal tidak memengaruhi keluaran */ }

    /** Baris log dari layanan (join, keluar, CSV diterapkan, galat). */
    log(line: string): void {
        if (!this.opened) {
            this.pending.push(line);
            if (this.pending.length > 300) { this.pending.splice(0, this.pending.length - 300); }
            return;
        }
        this.write(`  ${line}\r\n`);
    }

    handleInput(data: string): void {
        for (const char of String(data || '')) {
            if (char === '\x1b') { return; }
            if (char === '\r' || char === '\n') {
                const command = this.input.trim();
                this.input = '';
                this.write('\r\n');
                void this.run(command);
                continue;
            }
            if (char === '\x7f' || char === '\b') {
                if (this.input) {
                    this.input = this.input.slice(0, -1);
                    this.write('\b \b');
                }
                continue;
            }
            if (char === '\x03') {
                this.input = '';
                this.write('^C\r\n');
                this.prompt();
                continue;
            }
            if (char < ' ') { continue; }
            this.input += char;
            this.write(char);
        }
    }

    /* ── keluaran ───────────────────────────────────────────────────────────── */

    private write(text: string): void {
        this.writeEmitter.fire(String(text).replace(/\r?\n/g, '\r\n'));
    }

    private prompt(): void {
        this.write('\x1b[2m>\x1b[0m ');
    }

    private banner(): void {
        const service = this.opts.service;
        const state = service.viewState();
        const server = state.server;
        this.write('\x1b[1mDate Skunder · Join Room (Socket.IO)\x1b[0m\r\n');
        this.write(`Server   : ${server.running ? `berjalan di ${server.host}:${server.port}` : 'belum berjalan (ketik start)'}\r\n`);
        this.write(`Alamat   : ${server.lan.length ? server.lan.join('  ·  ') : 'tidak ada jaringan LAN'}\r\n`);
        if (state.session) {
            this.write(`Room     : ${state.session.room} · berkas ${state.session.fileName}\r\n`);
            this.write(`Perangkat: ${state.members.length}\r\n`);
        } else {
            this.write('Room     : belum bergabung (panel Pet Skin → Join Room)\r\n');
        }
        this.write(`Room aktif di server: ${server.rooms.length}\r\n`);
        this.write('\r\nJika Windows meminta izin jaringan saat server pertama menyala, pilih \x1b[1mIzinkan\x1b[0m (jaringan privat)\r\n');
        this.write('supaya laptop lain bisa bergabung. Kursor, skin, dan CSV hanya lewat jaringan lokal (LAN).\r\n');
        this.write('\r\nKetik \x1b[1mhelp\x1b[0m untuk daftar perintah. Menutup terminal tidak mematikan server.\r\n\r\n');
    }

    /* ── perintah ───────────────────────────────────────────────────────────── */

    private async run(command: string): Promise<void> {
        const cmd = String(command || '').trim().toLowerCase();
        if (!cmd) { this.prompt(); return; }
        const [head] = cmd.split(/\s+/);
        switch (head) {
            case 'help':
            case '?':
                this.write([
                    'Perintah:',
                    '  help       daftar perintah',
                    '  status     status server + alamat LAN',
                    '  devices    perangkat yang bergabung (nama, laptop, skin, kursor)',
                    '  rooms      daftar room di server ini',
                    '  url        salin alamat LAN pertama ke papan klip',
                    '  panel      buka panel Join Room di Pet Skin',
                    '  start      nyalakan server socket',
                    '  stop       hentikan server (semua peserta terputus)',
                    '  clear      bersihkan layar',
                    '  exit       tutup terminal (server tetap berjalan)',
                    '',
                ].join('\r\n'));
                break;
            case 'status':
                this.status();
                break;
            case 'devices':
            case 'perangkat':
                this.devices();
                break;
            case 'rooms':
            case 'room':
                this.rooms();
                break;
            case 'url':
            case 'alamat': {
                const lan = this.opts.service.lan();
                if (!lan.length) {
                    this.write('Belum ada alamat LAN — pastikan laptop terhubung ke jaringan.\r\n');
                } else {
                    await vscode.env.clipboard.writeText(lan[0]);
                    this.write(`Alamat disalin: ${lan[0]}\r\n`);
                }
                break;
            }
            case 'panel':
                this.opts.onOpenPanel?.();
                break;
            case 'start':
                this.write('Menyalakan server Socket.IO…\r\n');
                try {
                    await this.opts.service.startServer();
                    this.write(`Server aktif · ${this.opts.service.lan().join(' · ') || 'tanpa LAN'}\r\n`);
                } catch (e) {
                    this.write(`Gagal: ${e instanceof Error ? e.message : String(e)}\r\n`);
                }
                break;
            case 'stop':
                this.write('Menghentikan server Socket.IO…\r\n');
                await this.opts.service.stopServer();
                this.write('Server dihentikan.\r\n');
                break;
            case 'clear':
            case 'cls':
                this.write('\x1b[2J\x1b[H');
                this.banner();
                break;
            case 'exit':
            case 'quit':
            case 'q':
                this.write('Menutup terminal. Server tetap berjalan; buka lagi lewat tombol 🖥 di panel Join Room.\r\n');
                setTimeout(() => this.closeEmitter.fire(), 40);
                return;
            default:
                this.write(`Perintah tidak dikenal: ${command}\r\nKetik help untuk daftar perintah.\r\n`);
        }
        this.write('\r\n');
        this.prompt();
    }

    private status(): void {
        const state = this.opts.service.viewState();
        const server = state.server;
        this.write(`Status   : ${server.running ? 'berjalan' : 'mati'}\r\n`);
        this.write(`Bind     : ${server.host}${server.port ? `:${server.port}` : ''}\r\n`);
        this.write(`LAN      : ${server.lan.join('  ·  ') || '—'}\r\n`);
        this.write(`Room     : ${state.session ? `${state.session.room} · ${state.session.fileName}` : 'belum bergabung'}\r\n`);
        this.write(`Perangkat: ${state.members.length}\r\n`);
        this.write(`Room di server: ${server.rooms.length}\r\n`);
    }

    private devices(): void {
        const state = this.opts.service.viewState();
        if (!state.members.length) {
            // Belum bergabung → tunjukkan perangkat yang sudah ada di room mana pun di server ini.
            const rooms = this.opts.service.listRooms();
            if (!rooms.length) {
                this.write('Belum ada perangkat yang bergabung di laptop ini.\r\n');
                return;
            }
            rooms.forEach((r) => {
                this.write(`Room “${r.room}” · ${r.members} perangkat · berkas ${r.file}\r\n`);
                if (r.names.length) { this.write(`  ${r.names.join(', ')}\r\n`); }
            });
            return;
        }
        this.write(`Perangkat di room “${state.session ? state.session.room : '-'}” (${state.members.length}):\r\n`);
        state.members.forEach((m, i) => {
            const kursor = m.cursor && m.cursor.at ? `${Math.round(m.cursor.x * 100)}%,${Math.round(m.cursor.y * 100)}%` : '—';
            const latensi = typeof m.latency === 'number' && m.latency > 0 ? ` · ${m.latency} ms` : '';
            this.write(`  ${i + 1}. ${m.name}${m.self ? ' (kamu)' : ''} · ${m.device} · ${m.platform || '?'}\r\n`);
            this.write(`     skin ${m.skin.name || m.skin.id} · kursor ${kursor}${latensi}\r\n`);
        });
    }

    private rooms(): void {
        const rooms = this.opts.service.listRooms();
        if (!rooms.length) {
            this.write('Belum ada room. Minta rekanmu menekan “Join Room” di panel Pet Skin.\r\n');
            return;
        }
        rooms.forEach((r, i) => {
            this.write(`  ${i + 1}. ${r.room} · ${r.members} perangkat · berkas ${r.file}\r\n`);
            if (r.names.length) { this.write(`     ${r.names.join(', ')}\r\n`); }
        });
    }
}
