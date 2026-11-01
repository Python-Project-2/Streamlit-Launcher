import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type OsFolder = 'win' | 'mac' | 'linux';
export type ServerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ServerStatus {
    state: ServerState;
    port: number;
    modelPath?: string;
    pid?: number;
    message?: string;
    startedAt?: number;
    binaryPath?: string;
    osFolder?: OsFolder | null;
}

export interface ServerConfig {
    modelPath: string;
    port: number;
    contextSize: number;
    gpuLayers?: number;
    threads?: number;
    extraArgs?: string[];
    binaryPath?: string;
    host?: string;
    startupTimeoutMs?: number;
}

export interface ModelFile {
    path: string;
    name: string;
    sizeBytes: number;
    multipart: boolean;
    part?: string;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

// ── deteksi biner per OS ─────────────────────────────────────────────────────

/** Windows → win/, macOS → mac/, Linux → linux/. */
export function osFolder(platform: NodeJS.Platform = process.platform): OsFolder | null {
    if (platform === 'win32') { return 'win'; }
    if (platform === 'darwin') { return 'mac'; }
    if (platform === 'linux') { return 'linux'; }
    return null;
}

export function osLabel(platform: NodeJS.Platform = process.platform): string {
    const f = osFolder(platform);
    return f ? `${platform} → folder "${f}/"` : `${platform} → belum didukung`;
}

export function binaryCandidates(extensionPath: string, platform: NodeJS.Platform = process.platform): string[] {
    const folder = osFolder(platform);
    if (!folder) { return []; }
    const names = platform === 'win32'
        ? ['llama-server.exe', 'llama-server', 'server.exe', 'bin/llama-server.exe', 'build/bin/Release/llama-server.exe']
        : ['llama-server', 'llama-server-arm64', 'server', 'bin/llama-server'];
    return names.map((n) => path.join(extensionPath, folder, n.split('/').join(path.sep)));
}

export function resolveServerBinary(extensionPath: string, platform: NodeJS.Platform = process.platform): { folder: OsFolder | null; candidates: string[]; chosen?: string } {
    const candidates = binaryCandidates(extensionPath, platform);
    const chosen = candidates.find((p) => isFile(p));
    return { folder: osFolder(platform), candidates, chosen };
}

function isFile(p: string): boolean {
    try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ── pemindaian model .gguf ───────────────────────────────────────────────────

/** Folder yang dilewati saat menelusuri penyimpanan (sistem, cache besar, hasil build). */
const SKIP_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', 'obj', 'dist', 'build', 'target', 'vendor',
    '$recycle.bin', 'system volume information', 'recovery', 'perflogs', 'winsxs', 'winsat',
    'windows', 'program files', 'program files (x86)', 'programdata', 'temp', 'tmp', 'crashdumps',
    'proc', 'sys', 'dev', 'run', 'boot', 'lost+found', 'snap', 'etc', 'var', 'bin', 'sbin',
    'lib', 'lib64', 'usr', 'system', 'library', 'applications', 'private', 'cores',
]);

export interface ScanProgress {
    dirs: number;
    entries: number;
    found: number;
    root: string;
    elapsedMs: number;
    done: boolean;
    cancelled: boolean;
    timedOut: boolean;
    truncated: boolean;
}

export interface ScanOptions {
    maxDepth?: number;
    maxEntries?: number;
    timeoutMs?: number;
    /** Jumlah folder yang dibaca paralel (I/O disk tetap dibatasi). */
    concurrency?: number;
    /** Dipanggil tiap berkas .gguf ditemukan → daftar bisa terisi bertahap. */
    onFound?: (file: ModelFile, total: number) => void;
    /** Laporan kemajuan (otomatis dibatasi minimal progressIntervalMs antar laporan). */
    onProgress?: (p: ScanProgress) => void;
    progressIntervalMs?: number;
    isCancelled?: () => boolean;
}

export function isDir(p: string): boolean {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** Akar penyimpanan yang siap dipakai di mesin ini; hasilnya di-cache per sesi. */
let storageCache: { roots: string[]; at: number; platform: NodeJS.Platform } | undefined;

export async function listStorageRoots(platform: NodeJS.Platform = process.platform, cacheMs = 600000): Promise<string[]> {
    if (storageCache && storageCache.platform === platform && Date.now() - storageCache.at < cacheMs) {
        return storageCache.roots;
    }
    const roots = platform === 'win32'
        ? await listWindowsRoots()
        : platform === 'darwin'
            ? ['/', ...listDirNames('/Volumes').map((n) => path.join('/Volumes', n))]
            : ['/', ...['/media', '/mnt', '/run/media', '/opt'].flatMap((base) => [base, ...listDirNames(base).map((n) => path.join(base, n))])];
    const uniq = [...new Set(roots.filter((r) => !!r && isDir(r)))];
    storageCache = { roots: uniq, at: Date.now(), platform };
    return uniq;
}

/** Windows: daftar drive lewat PowerShell, dan bila gagal diuji satu per satu (dengan batas waktu). */
async function listWindowsRoots(): Promise<string[]> {
    const fromShell: string[] = [];
    try {
        const { stdout } = await execFileAsync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command', "(Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root) -join [Environment]::NewLine",
        ], { timeout: 8000, windowsHide: true });
        for (const line of String(stdout).split(/\r?\n/)) {
            const root = line.trim();
            if (/^[A-Za-z]:\\$/.test(root)) { fromShell.push(root.toUpperCase()); }
        }
    } catch { /* PowerShell tidak tersedia → uji huruf drive di bawah */ }
    if (fromShell.length) { return fromShell; }

    const probed: string[] = [];
    const budget = Date.now() + 10000;
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        if (Date.now() > budget) { break; }
        const root = `${letter}:\\`;
        if (await existsWithin(root, 1200)) { probed.push(root); }
    }
    return probed;
}

function listDirNames(dir: string): string[] {
    try { return fs.readdirSync(dir); } catch { return []; }
}

async function existsWithin(target: string, ms: number): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            fsp.stat(target).then((s) => s.isDirectory(), () => false),
            new Promise<boolean>((r) => { timer = setTimeout(() => r(false), ms); if (typeof timer.unref === 'function') { timer.unref(); } }),
        ]);
    } catch {
        return false;
    } finally {
        if (timer) { clearTimeout(timer); }
    }
}

/**
 * Pemindaian .gguf asinkron dengan batas kedalaman, jumlah entri, dan waktu.
 * Tidak memblokir extension host (batas waktu lama boleh, karena berjalan di latar belakang)
 * dan hasilnya dilaporkan bertahap lewat onFound/onProgress.
 */
export function scanGgufModels(roots: string[], opts: ScanOptions = {}): Promise<ModelFile[]> {
    const maxDepth = opts.maxDepth ?? 6;
    const maxEntries = opts.maxEntries ?? 300000;
    const timeoutMs = opts.timeoutMs ?? 60000;
    const concurrency = Math.max(1, Math.min(16, opts.concurrency ?? 6));
    const progressEvery = opts.progressIntervalMs ?? 400;
    const startedAt = Date.now();

    const found: ModelFile[] = [];
    const seen = new Set<string>();
    const queue: { dir: string; depth: number }[] = [];
    for (const root of roots) {
        if (!root) { continue; }
        const abs = path.resolve(root);
        if (!isDir(abs)) { continue; }
        queue.push({ dir: abs, depth: 0 });
    }

    let dirs = 0;
    let entries = 0;
    let active = 0;
    let current = queue[0]?.dir ?? '';
    let lastReport = 0;
    let settled = false;

    const cancelled = (): boolean => !!opts.isCancelled?.();
    const beyondLimits = (): boolean => entries > maxEntries || Date.now() - startedAt > timeoutMs;
    const stopped = (): boolean => cancelled() || beyondLimits();

    const report = (done: boolean, force = false): void => {
        const now = Date.now();
        if (!done && !force && now - lastReport < progressEvery) { return; }
        lastReport = now;
        opts.onProgress?.({
            dirs, entries, found: found.length, root: current, elapsedMs: now - startedAt,
            done, cancelled: cancelled(), timedOut: now - startedAt > timeoutMs, truncated: entries > maxEntries,
        });
    };

    const visit = async (job: { dir: string; depth: number }): Promise<void> => {
        if (stopped()) { return; }
        current = job.dir;
        let items: fs.Dirent[];
        try { items = await fsp.readdir(job.dir, { withFileTypes: true }); } catch { return; }
        dirs++;
        for (const entry of items) {
            if (stopped()) { return; }
            entries++;
            report(false);
            if (entry.isSymbolicLink()) { continue; }                     // hindari tautan berputar
            const full = path.join(job.dir, entry.name);
            if (entry.isDirectory()) {
                if (job.depth < maxDepth && !SKIP_DIRS.has(entry.name.toLowerCase())) {
                    queue.push({ dir: full, depth: job.depth + 1 });
                }
                continue;
            }
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.gguf')) { continue; }
            const key = full.toLowerCase();
            if (seen.has(key)) { continue; }
            seen.add(key);
            let size = 0;
            try { size = (await fsp.stat(full)).size; } catch { /* berkas hilang saat dipindai */ }
            const part = /(\d{4,5})-of-(\d{4,5})/i.exec(entry.name);
            const file: ModelFile = { path: full, name: entry.name, sizeBytes: size, multipart: !!part, part: part ? part[0] : undefined };
            found.push(file);
            opts.onFound?.(file, found.length);
        }
    };

    return new Promise<ModelFile[]>((resolve) => {
        const finish = (): void => {
            if (settled) { return; }
            settled = true;
            report(true, true);
            resolve(sortModels(found));
        };
        const pump = (): void => {
            if (settled) { return; }
            if (active === 0 && (queue.length === 0 || stopped())) { finish(); return; }
            while (active < concurrency && queue.length && !stopped()) {
                const job = queue.shift()!;
                active++;
                void visit(job).then(() => { active--; pump(); }, () => { active--; pump(); });
            }
        };
        pump();
    });
}

/** Potongan pertama (00001-of-...) di atas; sisanya urut ukuran terbesar. */
export function sortModels(list: ModelFile[]): ModelFile[] {
    return [...list].sort((a, b) => {
        const aTail = a.part ? !/00001-of-/i.test(a.name) : false;
        const bTail = b.part ? !/00001-of-/i.test(b.name) : false;
        if (aTail !== bTail) { return aTail ? 1 : -1; }
        return b.sizeBytes - a.sizeBytes;
    });
}

/** Lokasi umum penyimpanan model pada laptop pengguna (per sistem operasi). */
export function defaultModelRoots(homeDir: string = os.homedir(), platform: NodeJS.Platform = process.platform): string[] {
    const env = process.env;
    const home = homeDir;
    const list: string[] = [];
    const add = (...items: (string | undefined)[]): void => { for (const it of items) { if (it) { list.push(it); } } };

    if (platform === 'win32') {
        const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
        add(
            path.join(home, 'Downloads'), path.join(home, 'Documents'), path.join(home, 'Desktop'),
            path.join(home, 'Models'), path.join(home, 'models'), path.join(home, 'LLM'), path.join(home, 'llama.cpp'),
            path.join(home, '.lmstudio', 'models'), path.join(home, 'jan', 'models'),
            path.join(home, '.cache', 'llama.cpp'), path.join(home, '.cache', 'lm-studio', 'models'),
            path.join(home, '.cache', 'huggingface', 'hub'), path.join(home, '.ollama', 'models'),
            path.join(local, 'LM-Studio', 'models'), path.join(local, 'nomic.ai', 'GPT4All'),
            path.join(roaming, 'Jan', 'data', 'models'), path.join(roaming, 'anythingllm-desktop', 'storage', 'models'),
            env.OneDrive ? path.join(env.OneDrive, 'Documents') : undefined,
            env.OneDrive ? path.join(env.OneDrive, 'Desktop') : undefined,
            env.OneDrive ? path.join(env.OneDrive, 'Models') : undefined,
        );
    } else if (platform === 'darwin') {
        const support = path.join(home, 'Library', 'Application Support');
        add(
            path.join(home, 'Downloads'), path.join(home, 'Documents'), path.join(home, 'Desktop'),
            path.join(home, 'Models'), path.join(home, 'models'), path.join(home, 'LLM'),
            path.join(home, '.lmstudio', 'models'), path.join(home, 'jan', 'models'),
            path.join(home, '.cache', 'llama.cpp'), path.join(home, '.cache', 'lm-studio', 'models'),
            path.join(home, '.cache', 'huggingface', 'hub'), path.join(home, '.ollama', 'models'),
            path.join(support, 'nomic.ai', 'GPT4All'), path.join(support, 'Jan', 'data', 'models'),
            path.join(home, 'Library', 'Caches', 'llama.cpp'),
        );
    } else {
        add(
            path.join(home, 'Downloads'), path.join(home, 'Documents'), path.join(home, 'Desktop'),
            path.join(home, 'Models'), path.join(home, 'models'), path.join(home, 'LLM'), path.join(home, 'llama.cpp'),
            path.join(home, '.lmstudio', 'models'), path.join(home, 'jan', 'models'),
            path.join(home, '.cache', 'llama.cpp'), path.join(home, '.cache', 'lm-studio', 'models'),
            path.join(home, '.cache', 'huggingface', 'hub'), path.join(home, '.ollama', 'models'),
            path.join(home, '.local', 'share', 'nomic.ai', 'GPT4All'),
            '/usr/share/llama.cpp', '/usr/local/share/models', '/opt/models',
        );
    }

    const uniq = new Map<string, string>();
    for (const p of list) {
        const key = platform === 'win32' ? p.toLowerCase() : p;
        if (!uniq.has(key)) { uniq.set(key, p); }
    }
    return [...uniq.values()];
}

export function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) { return '0 B'; }
    const gb = bytes / 1024 ** 3;
    if (gb >= 1) { return `${gb.toFixed(2)} GB`; }
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── HTTP kecil untuk /health & /v1/chat/completions ──────────────────────────

export interface HttpResult { status: number; body: string }

export function httpRequest(port: number, pathName: string, opts: { host?: string; method?: string; body?: string; timeoutMs?: number } = {}): Promise<HttpResult> {
    return new Promise<HttpResult>((resolve, reject) => {
        const payload = opts.body;
        const req = http.request({
            host: opts.host ?? '127.0.0.1',
            port,
            path: pathName,
            method: opts.method ?? 'GET',
            headers: payload
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
                : undefined,
            timeout: opts.timeoutMs ?? 5000,
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
        if (payload) { req.write(payload); }
        req.end();
    });
}

export interface ChatStreamOptions {
    port: number;
    host?: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    onDelta: (text: string) => void;
}

export interface ChatHandle { abort: () => void; done: Promise<string> }

/** Chat streaming (SSE) ke llama-server. Teks dikirim potongan demi potongan lewat onDelta. */
export function chatStream(o: ChatStreamOptions): ChatHandle {
    const body = JSON.stringify({
        model: 'local-model',
        messages: o.messages,
        temperature: o.temperature ?? 0.2,
        top_p: o.topP ?? 0.95,
        max_tokens: o.maxTokens && o.maxTokens > 0 ? o.maxTokens : undefined,
        stream: true,
    });

    let full = '';
    let finished = false;
    let resolveDone!: (v: string) => void;
    let rejectDone!: (e: Error) => void;
    const done = new Promise<string>((res, rej) => { resolveDone = res; rejectDone = rej; });

    const req = http.request({
        host: o.host ?? '127.0.0.1',
        port: o.port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'text/event-stream' },
    }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 400) {
            let err = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { err += c; });
            res.on('end', () => {
                if (finished) { return; }
                finished = true;
                rejectDone(new Error(`llama-server membalas HTTP ${status}: ${err.slice(0, 300) || 'tanpa pesan'}`));
            });
            return;
        }
        res.setEncoding('utf8');
        let buf = '';
        res.on('data', (chunk: string) => {
            buf += chunk;
            let nl: number;
            while ((nl = buf.indexOf('\n')) >= 0) {
                const raw = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (!raw || !raw.startsWith('data:')) { continue; }
                const data = raw.slice(5).trim();
                if (data === '[DONE]') { continue; }
                try {
                    const json = JSON.parse(data);
                    const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.text ?? '';
                    if (typeof delta === 'string' && delta) {
                        full += delta;
                        o.onDelta(delta);
                    }
                } catch { /* potongan SSE tidak lengkap → abaikan */ }
            }
        });
        res.on('end', () => {
            if (finished) { return; }
            finished = true;
            resolveDone(full);
        });
        res.on('error', (e) => {
            if (finished) { return; }
            finished = true;
            rejectDone(e);
        });
    });

    req.on('error', (e) => {
        if (finished) { return; }
        finished = true;
        rejectDone(e);
    });
    req.write(body);
    req.end();

    return {
        abort: () => {
            try { req.destroy(new Error('dibatalkan pengguna')); } catch { /* sudah ditutup */ }
        },
        done,
    };
}

// ── manajer proses llama-server ──────────────────────────────────────────────

/**
 * Kutip satu argumen agar aman ditempel ke terminal sistem (PowerShell/cmd, bash/zsh).
 * Dipakai tombol “🖥 Terminal” yang menjalankan llama-server di terminal laptop.
 */
export function quoteArg(value: string, platform: NodeJS.Platform = process.platform): string {
    const s = String(value ?? '');
    if (!s) { return platform === 'win32' ? '""' : "''"; }
    if (platform === 'win32') {
        // cmd.exe dan PowerShell sama-sama menerima tanda kutip ganda untuk path berspasi.
        return /[\s&|<>^()]/.test(s) ? `"${s}"` : s;
    }
    return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface LlamaServerOptions {
    extensionPath: string;
    platform?: NodeJS.Platform;
    onLog?: (line: string) => void;
    onStatus?: (status: ServerStatus) => void;
    maxLogLines?: number;
}

export class LlamaServer {
    private child?: ChildProcess;
    private st: ServerStatus = { state: 'stopped', port: 0 };
    private platform: NodeJS.Platform;
    private maxLog: number;
    /** true = port dilayani proses di luar extension host (mis. terminal atau aplikasi lain). */
    private externalUp = false;

    readonly logs: string[] = [];

    constructor(private opts: LlamaServerOptions) {
        this.platform = opts.platform ?? process.platform;
        this.maxLog = opts.maxLogLines ?? 4000;
        this.st.osFolder = osFolder(this.platform);
    }

    get status(): ServerStatus { return { ...this.st }; }

    get running(): boolean { return this.st.state === 'running' || this.st.state === 'starting'; }

    /** true = server dijalankan di terminal / proses lain, bukan oleh extension host. */
    get external(): boolean { return this.externalUp; }

    /** Siap dipakai: proses internal sudah menerima permintaan, atau server luar sudah sehat. */
    get ready(): boolean { return this.st.state === 'running' || this.externalUp; }

    /** Jangan jalankan proses kedua: sedang memuat model, sudah jalan, atau ada server luar. */
    get available(): boolean { return this.running || this.externalUp; }

    /** Tandai port sedang dilayani proses lain supaya Chat AI tidak menjalankan server kedua. */
    markExternal(up: boolean): void { this.externalUp = up; }

    binaryInfo(): { folder: OsFolder | null; candidates: string[]; chosen?: string } {
        return resolveServerBinary(this.opts.extensionPath, this.platform);
    }

    log(line: string): void {
        const clean = line.replace(/\r$/, '');
        this.logs.push(clean);
        if (this.logs.length > this.maxLog) { this.logs.splice(0, this.logs.length - this.maxLog); }
        this.opts.onLog?.(clean);
    }

    clearLogs(): void {
        this.logs.length = 0;
    }

    private setState(patch: Partial<ServerStatus>): ServerStatus {
        this.st = { ...this.st, ...patch };
        this.opts.onStatus?.(this.status);
        return this.status;
    }

    /** Argumen CLI llama-server yang dipakai (juga ditampilkan di view output). */
    buildArgs(cfg: ServerConfig): string[] {
        const args = [
            '-m', cfg.modelPath,
            '--host', cfg.host ?? '127.0.0.1',
            '--port', String(cfg.port),
            '-c', String(cfg.contextSize),
        ];
        if (cfg.gpuLayers && cfg.gpuLayers > 0) { args.push('-ngl', String(cfg.gpuLayers)); }
        if (cfg.threads && cfg.threads > 0) { args.push('-t', String(cfg.threads)); }
        if (cfg.extraArgs && cfg.extraArgs.length) { args.push(...cfg.extraArgs); }
        return args;
    }

    /**
     * Perintah lengkap siap-tempel untuk terminal (tombol 🖥 Terminal).
     * Argumennya sama persis dengan yang dipakai proses internal, jadi API yang tampil identik.
     */
    buildCommand(cfg: ServerConfig): string {
        const bin = cfg.binaryPath ?? this.binaryInfo().chosen ?? 'llama-server';
        return [bin, ...this.buildArgs(cfg)].map((a) => quoteArg(a, this.platform)).join(' ');
    }

    async start(cfg: ServerConfig): Promise<ServerStatus> {
        if (this.child) { await this.stop(); }
        this.markExternal(false);

        const bin = cfg.binaryPath ?? this.binaryInfo().chosen;
        if (!bin) {
            const info = this.binaryInfo();
            const msg = `Biner llama-server tidak ditemukan untuk ${osLabel(this.platform)}. Letakkan berkasnya di: ${info.candidates[0]}`;
            this.log(`[error] ${msg}`);
            this.setState({ state: 'error', port: cfg.port, message: msg, modelPath: cfg.modelPath });
            throw new Error(msg);
        }
        if (!isFile(cfg.modelPath)) {
            const msg = `Berkas model tidak ditemukan: ${cfg.modelPath}`;
            this.log(`[error] ${msg}`);
            this.setState({ state: 'error', port: cfg.port, message: msg, modelPath: cfg.modelPath, binaryPath: bin });
            throw new Error(msg);
        }

        const args = this.buildArgs(cfg);
        this.log(`[info] OS ${this.platform} → ${osLabel(this.platform)}`);
        this.log(`[info] Perintah: "${bin}" ${args.join(' ')}`);
        this.setState({ state: 'starting', port: cfg.port, modelPath: cfg.modelPath, binaryPath: bin, pid: undefined, message: 'Memuat model…', startedAt: Date.now() });

        const child = spawn(bin, args, {
            cwd: path.dirname(bin),
            windowsHide: true,
            env: { ...process.env, LLAMA_LOG_COLORS: '0' },
        });
        this.child = child;
        this.setState({ pid: child.pid });

        const pipe = (stream?: NodeJS.ReadableStream | null) => {
            stream?.setEncoding?.('utf8');
            stream?.on('data', (chunk: string) => {
                for (const line of String(chunk).split('\n')) {
                    if (line.trim().length) { this.log(line); }
                }
            });
        };
        pipe(child.stdout);
        pipe(child.stderr);

        let exitInfo = '';
        child.on('exit', (code, signal) => {
            exitInfo = `berhenti (kode ${code ?? '-'}${signal ? `, sinyal ${signal}` : ''})`;
            this.log(`[info] llama-server ${exitInfo}`);
            if (this.child === child) {
                this.child = undefined;
                this.setState({ state: this.st.state === 'stopping' ? 'stopped' : 'error', pid: undefined, message: this.st.state === 'stopping' ? undefined : exitInfo });
            }
        });
        child.on('error', (err: NodeJS.ErrnoException) => {
            const hint = err.code === 'EACCES'
                ? ` → beri izin eksekusi dulu: chmod +x "${bin}"`
                : '';
            this.log(`[error] gagal menjalankan proses: ${err.message}${hint}`);
            this.setState({ state: 'error', message: `${err.message}${hint}`, pid: undefined });
        });

        const timeoutMs = cfg.startupTimeoutMs ?? 180000;
        const healthy = await this.waitHealthy(cfg.port, timeoutMs, () => this.child === child);
        if (!healthy) {
            const detail = this.st.state === 'error' ? (this.st.message ?? 'proses berhenti') : `tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik`;
            this.setState({ state: 'error', message: `llama-server ${detail}` });
            throw new Error(`llama-server ${detail}`);
        }

        this.log(`[info] llama-server siap di http://${cfg.host ?? '127.0.0.1'}:${cfg.port}`);
        return this.setState({ state: 'running', message: 'Siap menerima permintaan', pid: child.pid });
    }

    private async waitHealthy(port: number, timeoutMs: number, alive: () => boolean): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (!alive()) { return false; }
            try {
                const res = await httpRequest(port, '/health', { timeoutMs: 1500 });
                if (res.status === 200) { return true; }
            } catch { /* server belum siap */ }
            await new Promise((r) => setTimeout(r, 500));
        }
        return false;
    }

    /** Hentikan proses internal; status kembali ke berhenti tanpa mengubah penanda server luar. */
    async stop(): Promise<ServerStatus> {
        const child = this.child;
        if (!child) {
            return this.setState({ state: 'stopped', pid: undefined, message: undefined });
        }
        this.setState({ state: 'stopping', message: 'Menghentikan server…' });
        const pid = child.pid;

        if (this.platform === 'win32' && pid) {
            try {
                const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
                await new Promise<void>((resolve) => {
                    killer.on('exit', () => resolve());
                    killer.on('error', () => resolve());
                    setTimeout(resolve, 4000);
                });
            } catch { /* lanjut ke kill biasa */ }
        }
        await new Promise((r) => setTimeout(r, 400));
        if (this.child === child) {
            try { child.kill(); } catch { /* sudah mati */ }
            if (this.platform !== 'win32' && pid) {
                try { process.kill(pid, 'SIGKILL'); } catch { /* sudah mati */ }
            }
        }
        this.child = undefined;
        return this.setState({ state: 'stopped', pid: undefined, message: undefined });
    }
}
