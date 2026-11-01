import * as vscode from 'vscode';
import { ChatApiServer } from './chatApi';
import { chatLogLabel } from './chatLog';

export interface ChatApiTerminalOptions {
    server: ChatApiServer;
    /** Port yang diminta dari pengaturan (0 = port bebas). */
    port: () => number;
    /** Dipanggil saat pengguna mengetik `open` (biasanya membuka browser). */
    onOpen?: (url: string) => void;
    /** Dipanggil setelah server dinyalakan/dihentikan dari terminal. */
    onChange?: () => void;
    /** Kontrol server LLAMA (opsional; bila tersedia, perintah `llama start/stop` aktif). */
    llama?: {
        status: () => string;
        start: () => Thenable<unknown>;
        stop: () => Thenable<unknown>;
    };
}

export class ChatApiTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private readonly closeEmitter = new vscode.EventEmitter<void>();
    readonly onDidWrite = this.writeEmitter.event;
    readonly onDidClose = this.closeEmitter.event;

    private opened = false;
    private input = '';
    private pending: string[] = [];

    constructor(private readonly opts: ChatApiTerminalOptions) { }

    open(): void {
        this.opened = true;
        this.banner();
        for (const line of this.pending) { this.wrap(line); }
        this.pending = [];
        this.prompt();
    }

    close(): void {
        this.opened = false;
    }

    setDimensions(): void { /* ukuran terminal tidak memengaruhi keluaran */ }

    /** Baris log dari server (permintaan HTTP, status, galat). */
    log(line: string): void {
        if (!this.opened) {
            this.pending.push(line);
            if (this.pending.length > 200) { this.pending.splice(0, this.pending.length - 200); }
            return;
        }
        this.wrap(line);
    }

    handleInput(data: string): void {
        for (const char of String(data || '')) {
            // Abaikan escape sequence (panah, PageUp, dll.).
            if (char === '\x1b') { return; }
            if (char === '\r' || char === '\n') {
                const command = this.input.trim();
                this.input = '';
                this.write('\r\n');
                this.run(command);
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

    /* ── keluaran ────────────────────────────────────────────────────────────── */

    private write(text: string): void {
        this.writeEmitter.fire(String(text).replace(/\r?\n/g, '\r\n'));
    }

    private wrap(line: string): void {
        this.write(`  ${line}\r\n`);
    }

    private prompt(): void {
        this.write('\x1b[2m>\x1b[0m ');
    }

    private llamaStatus(): string {
        return this.opts.llama ? this.opts.llama.status() : 'tidak tersedia';
    }

    private banner(): void {
        const info = this.opts.server.info();
        this.write('\x1b[1mDate Skunder · API JSON Percakapan\x1b[0m\r\n');
        this.write(`Sumber   : ${chatLogLabel()}\r\n`);
        this.write(`Akses    : hanya dari komputer ini (127.0.0.1)\r\n`);
        this.write(`LLAMA    : ${this.llamaStatus()}\r\n`);
        if (info.running) {
            this.write(`Status   : berjalan\r\n`);
            this.write(`Chat     : ${info.endpoints.chat}\r\n`);
            this.write(`Semua    : ${info.endpoints.rooms}\r\n`);
            this.write(`Contoh   : fetch('${info.endpoints.chat}').then((r) => r.json())\r\n`);
        } else {
            this.write('Status   : belum berjalan (ketik start)\r\n');
        }
        this.write('\r\nKetik \x1b[1mhelp\x1b[0m untuk daftar perintah. Menutup terminal tidak mematikan server.\r\n\r\n');
    }

    /* ── perintah ────────────────────────────────────────────────────────────── */

    private run(command: string): void {
        const cmd = String(command || '').trim().toLowerCase();
        if (!cmd) { this.prompt(); return; }
        const [head, ...rest] = cmd.split(/\s+/);
        if (head === 'llama' || head === 'model') {
            void this.llama(rest[0] || '');
            return;
        }
        switch (head) {
            case 'help':
            case '?':
                this.write([
                    'Perintah:',
                    '  help       daftar perintah',
                    '  status     status server + URL endpoint',
                    '  open       buka /api/chat.json di browser',
                    '  copy       salin URL API ke papan klip',
                    '  llama      status server LLAMA',
                    '  llama start / llama stop   nyalakan atau hentikan LLAMA Server',
                    '  start      nyalakan server API (bila mati)',
                    '  stop       hentikan server',
                    '  clear      bersihkan layar',
                    '  exit       tutup terminal (server tetap berjalan)',
                    '',
                ].join('\r\n'));
                break;
            case 'status':
                this.status();
                break;
            case 'open':
            case 'buka': {
                const url = this.opts.server.info().endpoints.chat;
                if (!url) {
                    this.write('Server belum berjalan. Ketik start.\r\n');
                } else if (this.opts.onOpen) {
                    this.opts.onOpen(url);
                    this.write(`Membuka ${url}\r\n`);
                } else {
                    void vscode.env.openExternal(vscode.Uri.parse(url));
                    this.write(`Membuka ${url}\r\n`);
                }
                break;
            }
            case 'copy':
            case 'salin': {
                const url = this.opts.server.info().endpoints.chat;
                if (!url) {
                    this.write('Server belum berjalan. Ketik start.\r\n');
                } else {
                    void vscode.env.clipboard.writeText(url);
                    this.write(`URL disalin: ${url}\r\n`);
                }
                break;
            }
            case 'start':
            case 'nyalakan':
                void this.start();
                return;
            case 'stop':
            case 'matikan':
                void this.stop();
                return;
            case 'clear':
            case 'cls':
                this.write('\x1b[2J\x1b[H');
                this.banner();
                break;
            case 'exit':
            case 'quit':
            case 'q':
                this.write('Menutup terminal. Server tetap berjalan; buka lagi lewat tombol 🖥 Terminal.\r\n');
                setTimeout(() => this.closeEmitter.fire(), 40);
                return;
            default:
                this.write(`Perintah tidak dikenal: ${command}\r\nKetik help untuk daftar perintah.\r\n`);
        }
        this.write('\r\n');
        this.prompt();
    }

    private status(): void {
        const info = this.opts.server.info();
        this.write(`Status   : ${info.running ? 'berjalan' : 'mati'}\r\n`);
        this.write(`Host     : ${info.host}${info.port ? `:${info.port}` : ''}\r\n`);
        this.write(`LLAMA    : ${this.llamaStatus()}\r\n`);
        if (info.running) {
            for (const [key, url] of Object.entries(info.endpoints)) {
                this.write(`  ${key.padEnd(10)} ${url}\r\n`);
            }
        } else {
            this.write('Ketik start untuk menyalakan server.\r\n');
        }
    }

    /** Perintah `llama`, `llama start`, `llama stop`. */
    private async llama(action: string): Promise<void> {
        const control = this.opts.llama;
        if (!control) {
            this.write('Kontrol LLAMA tidak tersedia di terminal ini.\r\n\r\n');
            this.prompt();
            return;
        }
        const act = String(action || '').trim().toLowerCase();
        if (!act || act === 'status') {
            this.write(`LLAMA    : ${control.status()}\r\n`);
            this.write('Ketik llama start untuk menjalankan model, atau llama stop untuk menghentikannya.\r\n\r\n');
            this.prompt();
            return;
        }
        if (act === 'start' || act === 'nyalakan' || act === 'jalan') {
            this.write('Menjalankan LLAMA Server…\r\n');
            try {
                await control.start();
                this.write(`LLAMA    : ${control.status()}\r\n`);
            } catch (e) {
                this.write(`Gagal menjalankan LLAMA: ${e instanceof Error ? e.message : String(e)}\r\n`);
            }
            this.opts.onChange?.();
            this.write('\r\n');
            this.prompt();
            return;
        }
        if (act === 'stop' || act === 'matikan' || act === 'berhenti') {
            this.write('Menghentikan LLAMA Server…\r\n');
            try {
                await control.stop();
                this.write(`LLAMA    : ${control.status()}\r\n`);
            } catch (e) {
                this.write(`Gagal menghentikan LLAMA: ${e instanceof Error ? e.message : String(e)}\r\n`);
            }
            this.opts.onChange?.();
            this.write('\r\n');
            this.prompt();
            return;
        }
        this.write('Perintah LLAMA tidak dikenal. Pakai: llama, llama start, llama stop.\r\n\r\n');
        this.prompt();
    }

    private async start(): Promise<void> {
        if (this.opts.server.running) {
            this.write('Server sudah berjalan.\r\n\r\n');
            this.prompt();
            return;
        }
        this.write('Menyalakan server API JSON…\r\n');
        try {
            const port = await this.opts.server.start(this.opts.port());
            this.write(`Server aktif di http://${this.opts.server.info().host}:${port}/api/chat.json\r\n\r\n`);
        } catch (e) {
            this.write(`Gagal menyalakan server: ${e instanceof Error ? e.message : String(e)}\r\n\r\n`);
        }
        this.opts.onChange?.();
        this.prompt();
    }

    private async stop(): Promise<void> {
        if (!this.opts.server.running) {
            this.write('Server memang belum berjalan.\r\n\r\n');
            this.prompt();
            return;
        }
        this.write('Menghentikan server…\r\n');
        await this.opts.server.stop();
        this.opts.onChange?.();
        this.write('Server dihentikan. Ketik start untuk menyalakan lagi.\r\n\r\n');
        this.prompt();
    }
}
