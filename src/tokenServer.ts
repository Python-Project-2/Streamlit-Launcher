/**
 * Server token lokal untuk “Compile MSI”.
 *
 * Tugasnya dua:
 *  1. Menyajikan website token (`api/token.html`) di http://127.0.0.1:<port>/token.html.
 *  2. Menjadi satu-satunya tempat token dibuat, diperiksa, dan dipotong kuotanya.
 *
 * Hanya mendengarkan di 127.0.0.1 (tidak bisa diakses dari jaringan lain). CORS dibuka
 * supaya halaman yang dibuka langsung dari berkas (`file://api/token.html`) tetap bisa
 * memanggil endpoint yang sama.
 */
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { MsiTokens } from './msiToken';

export interface TokenServerOptions {
    /** Folder `api/` berisi token.html. */
    apiRoot: string;
    tokens: MsiTokens;
    product?: string;
    version?: string;
    log?: (line: string) => void;
}

export interface TokenServerInfo {
    running: boolean;
    port: number;
    url: string;
    website: string;
}

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
};

/** Port bawaan: beda dengan API JSON percakapan (47831) supaya tidak berebut. */
export const DEFAULT_TOKEN_PORT = 47832;

export class TokenServer {
    private server?: http.Server;
    private port = 0;
    private starting?: Promise<number>;
    private readonly options: TokenServerOptions;

    constructor(options: TokenServerOptions) {
        this.options = {
            product: 'Date Skunder',
            version: '',
            log: () => undefined,
            ...options,
        };
    }

    get running(): boolean { return !!this.server; }
    get currentPort(): number { return this.port; }
    get url(): string { return this.port ? `http://127.0.0.1:${this.port}` : ''; }
    /** Alamat website token yang dibuka di browser. */
    get website(): string { return this.port ? `${this.url}/token.html` : ''; }

    info(): TokenServerInfo {
        return { running: this.running, port: this.port, url: this.url, website: this.website };
    }

    /**
     * Nyalakan server. Bila port pilihan sedang dipakai, coba port berikutnya (maks. 12 kali),
     * lalu serahkan ke sistem (port 0). Port yang benar-benar dipakai dikembalikan.
     */
    async start(preferredPort: number): Promise<number> {
        if (this.server) { return this.port; }
        if (this.starting) { return this.starting; }
        const base = Number.isFinite(preferredPort) && preferredPort > 0 && preferredPort < 65536
            ? Math.round(preferredPort)
            : DEFAULT_TOKEN_PORT;
        // Port 0 = serahkan ke sistem (dipakai pengujian).
        const candidates = preferredPort === 0
            ? [0]
            : [base, ...Array.from({ length: 12 }, (_, i) => base + i + 1), 0];
        this.starting = (async () => {
            let last: unknown;
            for (const port of candidates) {
                try {
                    const actual = await this.listen(port);
                    this.port = actual;
                    this.options.log?.(`Website token: ${this.website}`);
                    return actual;
                } catch (e) {
                    last = e;
                    if (!isAddrInUse(e)) { throw e; }
                }
            }
            throw last instanceof Error ? last : new Error('Port server token tidak tersedia.');
        })();
        try {
            return await this.starting;
        } finally {
            this.starting = undefined;
        }
    }

    async stop(): Promise<void> {
        const server = this.server;
        this.server = undefined;
        this.port = 0;
        if (!server) { return; }
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
            // Sambungan keep-alive tidak boleh menahan proses saat ekstensi ditutup.
            server.closeAllConnections?.();
            setTimeout(resolve, 800);
        });
    }

    dispose(): void { void this.stop(); }

    private listen(port: number): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => this.route(req, res));
            const onError = (e: NodeJS.ErrnoException) => {
                server.removeListener('listening', onListening);
                reject(e);
            };
            const onListening = () => {
                server.removeListener('error', onError);
                server.on('error', (e) => this.options.log?.(`Server token: ${e.message}`));
                this.server = server;
                const address = server.address();
                resolve(typeof address === 'object' && address ? address.port : port);
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, '127.0.0.1');
        });
    }

    private route(req: http.IncomingMessage, res: http.ServerResponse): void {
        const started = Date.now();
        res.on('finish', () => {
            this.options.log?.(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started} ms)`);
        });
        // Halaman web lain di komputer ini tidak boleh memakai endpoint token: hanya halaman
        // yang disajikan server ini (atau berkas lokal dengan Origin "null") yang diterima.
        const origin = String(req.headers.origin ?? '');
        if (origin && origin !== 'null' && !this.isOwnOrigin(origin)) {
            this.sendJson(res, 403, { ok: false, error: 'Origin tidak diizinkan.' });
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        // Chrome meminta izin khusus untuk halaman publik/berkas lokal yang memanggil 127.0.0.1.
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        if (req.method === 'OPTIONS') {
            res.writeHead(204).end();
            return;
        }

        let pathname = '/';
        try {
            pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
        } catch {
            this.sendJson(res, 400, { ok: false, error: 'Alamat tidak valid.' });
            return;
        }

        if (pathname.startsWith('/api/')) {
            this.api(req, res, pathname).catch((e) => {
                this.sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
            });
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            this.sendJson(res, 405, { ok: false, error: 'Metode tidak didukung.' });
            return;
        }
        this.serveStatic(pathname, req, res);
    }

    private isOwnOrigin(origin: string): boolean {
        try {
            const url = new URL(origin);
            const host = url.hostname.replace(/^\[|\]$/g, '');
            const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
            return (host === '127.0.0.1' || host === 'localhost' || host === '::1') && port === this.port;
        } catch {
            return false;
        }
    }

    private async api(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
        const route = pathname.replace(/\/+$/, '');
        const rules = this.options.tokens.rule;
        const quota = this.options.tokens.quota();
        const meta = {
            product: this.options.product,
            version: this.options.version,
            attempts: rules.attempts,
            minutes: rules.minutes,
            cooldownHours: rules.cooldownHours,
            quota,
            website: this.website,
        };

        if (route === '/api/token/info') {
            if (req.method !== 'GET') { return this.sendJson(res, 405, { ok: false, error: 'Gunakan GET.' }); }
            this.sendJson(res, 200, { ok: true, ...meta, tokens: this.options.tokens.list() });
            return;
        }

        if (route === '/api/token/generate') {
            if (req.method !== 'POST') { return this.sendJson(res, 405, { ok: false, error: 'Gunakan POST.' }); }
            const hasil = this.options.tokens.generate();
            if (!hasil.ok) {
                this.options.log?.(`Generate token ditolak: ${hasil.message}`);
                this.sendJson(res, 429, {
                    ...meta,
                    ok: false,
                    error: hasil.message,
                    quota: hasil.quota,
                });
                return;
            }
            this.options.log?.(`Token baru dibuat (${hasil.status.id}, sisa kuota ${hasil.status.quota.left}/${hasil.status.quota.limit}).`);
            this.sendJson(res, 200, { ok: true, ...meta, token: hasil.token, status: hasil.status });
            return;
        }

        if (route === '/api/token/status' || route === '/api/token/verify') {
            if (req.method !== 'POST') { return this.sendJson(res, 405, { ok: false, error: 'Gunakan POST.' }); }
            const body = await readJson(req);
            const status = this.options.tokens.check(String(body.token ?? ''));
            this.sendJson(res, 200, { ok: true, ...meta, status });
            return;
        }

        if (route === '/api/token/revoke') {
            if (req.method !== 'POST') { return this.sendJson(res, 405, { ok: false, error: 'Gunakan POST.' }); }
            const body = await readJson(req);
            const removed = this.options.tokens.revoke(String(body.token ?? ''));
            this.sendJson(res, 200, { ok: true, ...meta, removed });
            return;
        }

        if (route === '/api/health') {
            this.sendJson(res, 200, { ok: true, ...meta, running: true });
            return;
        }

        this.sendJson(res, 404, { ok: false, error: `Endpoint tidak dikenal: ${route}` });
    }

    private serveStatic(pathname: string, req: http.IncomingMessage, res: http.ServerResponse): void {
        const root = path.resolve(this.options.apiRoot);
        const rel = pathname === '/' || pathname === '' ? 'token.html' : pathname.replace(/^\/+/, '');
        const full = path.resolve(root, rel);
        // Jangan pernah melayani berkas di luar folder api/.
        if (full !== root && !full.startsWith(root + path.sep)) {
            this.sendJson(res, 403, { ok: false, error: 'Akses ditolak.' });
            return;
        }
        fs.stat(full, (err, stat) => {
            if (err || !stat.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(this.notFoundPage(rel));
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
                'Content-Length': stat.size,
            });
            if (req.method === 'HEAD') { res.end(); return; }
            fs.createReadStream(full).on('error', () => res.end()).pipe(res);
        });
    }

    private notFoundPage(rel: string): string {
        const escaped = rel.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
        return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>404 — Website token</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e8ecff;font-family:system-ui,sans-serif}
.card{max-width:520px;padding:28px;border-radius:18px;background:#141b36;border:1px solid #263254}
h1{margin:0 0 8px;font-size:20px}p{margin:8px 0;color:#a9b4d6;line-height:1.6}code{background:#0e1430;padding:2px 6px;border-radius:6px}</style>
</head><body><div class="card"><h1>404 — berkas tidak ada</h1>
<p><code>${escaped}</code> tidak ditemukan di folder <code>api/</code>.</p>
<p>Buka <a style="color:#7fd7ff" href="/token.html">/token.html</a> untuk membuat token Compile MSI.</p>
</div></body></html>`;
    }

    private sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
        const text = JSON.stringify(payload, null, 2);
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(text),
        });
        res.end(text);
    }
}

function isAddrInUse(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === 'EADDRINUSE' || code === 'EACCES';
}

/** Baca body JSON kecil (maks. 8 KB) — dipakai endpoint POST token. */
function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 8192) {
                reject(new Error('Isi permintaan terlalu besar.'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8').trim();
            if (!text) { resolve({}); return; }
            try {
                const parsed = JSON.parse(text);
                resolve(parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {});
            } catch {
                reject(new Error('Isi permintaan bukan JSON.'));
            }
        });
        req.on('error', reject);
    });
}
