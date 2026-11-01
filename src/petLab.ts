import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { execFile } from 'child_process';

/**
 * “Pet Lab”: dua alat pemeriksaan di bawah pemilih kostum Pet Skin.
 *
 *  1. Test API JSON — kirim permintaan HTTP ke API JSON lokal (atau URL lain) lalu tampilkan
 *     status, waktu, dan balasan yang sudah dirapikan. Hasil disimpan sebagai riwayat.
 *  2. Cek Kesehatan Laptop — kumpulkan metrik CPU/RAM/disk/baterai/aplikasi berat, tampilkan
 *     laporan langkah demi langkah di terminal VS Code, lalu simpan hasilnya.
 *
 * Setiap hasil masuk ke riwayat yang bisa dipratinjau dan dihapus dari view Pet Skin
 * (mirip daftar unduhan di Chrome: satu baris per hasil, aksi di kanan).
 */

export type LabEntryKind = 'api' | 'health';

export interface PetLabEntry {
    id: string;
    kind: LabEntryKind;
    /** Judul pendek: metode + path untuk API, “Cek Kesehatan Laptop” untuk kesehatan. */
    title: string;
    /** Waktu pembuatan (epoch ms). */
    at: number;
    ok: boolean;
    /** Satu baris ringkas untuk daftar riwayat. */
    summary: string;
    /** Teks lengkap untuk pratinjau/editor (dipotong saat disimpan bila terlalu besar). */
    detail: string;
}

const STORE_KEY = 'dateSkunder.petLab.entries';
/** Riwayat dibatasi supaya global state tetap ringan. */
export const MAX_LAB_ENTRIES = 15;
const MAX_DETAIL = 30000;
const MAX_PREVIEW = 8000;
const MAX_BODY = 2 * 1024 * 1024;

/* ── riwayat ───────────────────────────────────────────────────────────────── */

function readEntries(ctx: vscode.ExtensionContext): PetLabEntry[] {
    const raw = ctx.globalState.get<unknown>(STORE_KEY);
    if (!Array.isArray(raw)) { return []; }
    return raw.filter((e): e is PetLabEntry => {
        const it = e as PetLabEntry | undefined;
        return !!it && typeof it.id === 'string' && (it.kind === 'api' || it.kind === 'health') && typeof it.detail === 'string';
    }).slice(0, MAX_LAB_ENTRIES);
}

/** Riwayat terbaru lebih dulu. */
export function labEntries(ctx: vscode.ExtensionContext): PetLabEntry[] {
    return readEntries(ctx).sort((a, b) => (b.at || 0) - (a.at || 0));
}

export function labEntryById(ctx: vscode.ExtensionContext, id: unknown): PetLabEntry | undefined {
    const key = String(id ?? '').trim();
    return key ? labEntries(ctx).find((e) => e.id === key) : undefined;
}

export async function addLabEntry(
    ctx: vscode.ExtensionContext,
    entry: Omit<PetLabEntry, 'id' | 'at'> & { at?: number },
): Promise<PetLabEntry> {
    const now = entry.at ?? Date.now();
    const saved: PetLabEntry = {
        id: `${entry.kind}-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        kind: entry.kind,
        title: String(entry.title || '').slice(0, 120) || 'Hasil',
        at: now,
        ok: !!entry.ok,
        summary: String(entry.summary || '').slice(0, 240),
        detail: clip(String(entry.detail || ''), MAX_DETAIL),
    };
    const next = [saved, ...readEntries(ctx)].slice(0, MAX_LAB_ENTRIES);
    await ctx.globalState.update(STORE_KEY, next);
    return saved;
}

/** Hapus satu hasil; mengembalikan true bila ada yang terhapus. */
export async function deleteLabEntry(ctx: vscode.ExtensionContext, id: unknown): Promise<boolean> {
    const key = String(id ?? '').trim();
    const list = readEntries(ctx);
    const next = list.filter((e) => e.id !== key);
    if (next.length === list.length) { return false; }
    await ctx.globalState.update(STORE_KEY, next);
    return true;
}

/** Kosongkan riwayat; mengembalikan jumlah yang dihapus. */
export async function clearLabEntries(ctx: vscode.ExtensionContext): Promise<number> {
    const jumlah = readEntries(ctx).length;
    await ctx.globalState.update(STORE_KEY, []);
    return jumlah;
}

/** Potongan detail untuk pratinjau di sidebar (teks lengkap tetap di editor). */
export function previewEntry(entry: PetLabEntry): PetLabEntry & { truncated: boolean } {
    const truncated = entry.detail.length > MAX_PREVIEW;
    return {
        ...entry,
        detail: truncated
            ? `${entry.detail.slice(0, MAX_PREVIEW)}\n\n… ${entry.detail.length - MAX_PREVIEW} karakter lagi — tekan “Buka di editor” untuk melihat semuanya.`
            : entry.detail,
        truncated,
    };
}

/* ── Test API JSON ─────────────────────────────────────────────────────────── */

export interface ApiTestInput {
    method?: unknown;
    url?: unknown;
    headers?: unknown;
    body?: unknown;
    timeoutMs?: unknown;
}

export interface ApiTestResult {
    ok: boolean;
    method: string;
    url: string;
    status: number;
    statusText: string;
    ms: number;
    bytes: number;
    contentType: string;
    /** Balasan yang sudah dirapikan (JSON di-pretty-print). */
    text: string;
    json?: unknown;
    error?: string;
    at: number;
}

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} karakter dipotong)` : text;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function pad(text: string, width: number): string {
    return String(text).padEnd(width, ' ');
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Terima JSON objek (`{"A":"b"}`) atau baris `A: b` seperti di curl. */
export function parseApiHeaders(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    const text = String(raw ?? '').trim();
    if (!text) { return out; }
    if (text.startsWith('{')) {
        try {
            const data = JSON.parse(text) as Record<string, unknown>;
            for (const [key, value] of Object.entries(data || {})) {
                if (!key.trim()) { continue; }
                out[key.trim()] = String(value ?? '');
            }
            return out;
        } catch {
            // Bukan JSON valid → coba dibaca sebagai baris.
        }
    }
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([^:#]+?)\s*[:=]\s*(.+?)\s*$/);
        if (match) { out[match[1]] = match[2]; }
    }
    return out;
}

interface RawResponse {
    status: number;
    statusText: string;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
    truncated: boolean;
}

function decodeBody(body: Buffer, encoding: string): Buffer {
    const enc = String(encoding || '').toLowerCase();
    try {
        if (enc.includes('gzip')) { return zlib.gunzipSync(body); }
        if (enc.includes('deflate')) { return zlib.inflateSync(body); }
        if (enc.includes('br')) { return zlib.brotliDecompressSync(body); }
    } catch {
        // Badan rusak/tidak lengkap → pakai apa adanya.
    }
    return body;
}

/** Satu permintaan HTTP(S) + badan balasan (dipotong pada MAX_BODY). */
function requestOnce(
    target: URL,
    method: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs: number,
): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const lib = target.protocol === 'https:' ? https : http;
        const req = lib.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port ? Number(target.port) : undefined,
            path: `${target.pathname}${target.search}`,
            method,
            headers: {
                accept: '*/*',
                'accept-encoding': 'identity',
                'user-agent': 'Date-Skunder-Pet-Lab',
                ...headers,
            },
        });
        let selesai = false;
        const gagal = (error: Error) => {
            if (selesai) { return; }
            selesai = true;
            req.destroy();
            reject(error);
        };
        req.setTimeout(timeoutMs, () => gagal(new Error(`Melewati batas waktu ${timeoutMs} ms`)));
        req.on('error', (e) => gagal(e instanceof Error ? e : new Error(String(e))));
        req.on('response', (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            let truncated = false;
            const selesaiRes = () => {
                if (selesai) { return; }
                selesai = true;
                const raw = Buffer.concat(chunks);
                resolve({
                    status: res.statusCode ?? 0,
                    statusText: String(res.statusMessage || ''),
                    headers: res.headers,
                    body: decodeBody(raw, String(res.headers['content-encoding'] || '')),
                    truncated,
                });
            };
            res.on('data', (chunk: Buffer) => {
                size += chunk.length;
                if (size <= MAX_BODY) { chunks.push(chunk); }
                else {
                    truncated = true;
                    chunks.push(chunk.subarray(0, Math.max(0, MAX_BODY - (size - chunk.length))));
                    res.destroy();
                    selesaiRes();
                }
            });
            res.on('end', selesaiRes);
            res.on('close', selesaiRes);
            res.on('error', (e) => gagal(e instanceof Error ? e : new Error(String(e))));
        });
        if (body) { req.write(body); }
        req.end();
    });
}

/** Jalankan test API JSON. Tidak pernah melempar: galat dikembalikan di `error`. */
export async function runApiTest(input: ApiTestInput): Promise<ApiTestResult> {
    const method = (String(input.method ?? 'GET').trim().toUpperCase() || 'GET');
    const rawUrl = String(input.url ?? '').trim();
    const timeoutMs = clamp(Math.round(Number(input.timeoutMs) || 15000), 1000, 60000);
    const kosong: ApiTestResult = {
        ok: false, method, url: rawUrl, status: 0, statusText: '', ms: 0, bytes: 0,
        contentType: '', text: '', error: '', at: Date.now(),
    };
    if (!rawUrl) { return { ...kosong, error: 'URL masih kosong.' }; }
    let target: URL;
    try {
        target = new URL(rawUrl);
    } catch {
        return { ...kosong, error: `URL tidak valid: ${rawUrl}` };
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return { ...kosong, error: `Hanya http/https yang didukung (bukan ${target.protocol}).` };
    }
    const headers = parseApiHeaders(input.headers);
    const body = method === 'GET' || method === 'HEAD' ? '' : String(input.body ?? '');
    if (body) {
        headers['content-length'] = String(Buffer.byteLength(body));
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
            headers['content-type'] = 'application/json';
        }
    }
    const mulai = Date.now();
    let res: RawResponse;
    try {
        let current = target;
        let currentMethod = method;
        let currentBody = body;
        res = await requestOnce(current, currentMethod, headers, currentBody, timeoutMs);
        // Ikuti pengalihan (maks. 5) seperti browser; kredensial tidak ikut ke host lain.
        for (let i = 0; i < 5 && [301, 302, 303, 307, 308].includes(res.status); i += 1) {
            const location = String(res.headers.location || '');
            if (!location) { break; }
            const next = new URL(location, current);
            if (next.host !== current.host) {
                for (const key of Object.keys(headers)) {
                    if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) { delete headers[key]; }
                }
            }
            current = next;
            if (res.status === 303) {
                currentMethod = 'GET';
                currentBody = '';
                delete headers['content-length'];
            }
            res = await requestOnce(current, currentMethod, headers, currentBody, timeoutMs);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return { ...kosong, ms: Date.now() - mulai, error: `Gagal menghubungi server: ${message}` };
    }
    const ms = Date.now() - mulai;
    const contentType = String(res.headers['content-type'] || '');
    const teks = res.body.toString('utf8');
    let json: unknown;
    const trimmed = teks.trim();
    if (trimmed && (/json/i.test(contentType) || /^[[{]/.test(trimmed))) {
        try { json = JSON.parse(trimmed); } catch { /* bukan JSON → tampilkan teks apa adanya */ }
    }
    const pretty = json === undefined ? teks : JSON.stringify(json, null, 2);
    return {
        ok: res.status >= 200 && res.status < 400,
        method,
        url: String(target),
        status: res.status,
        statusText: res.statusText,
        ms,
        bytes: res.body.length,
        contentType,
        text: pretty + (res.truncated ? '\n\n… balasan dipotong pada 2 MB.' : ''),
        json,
        at: Date.now(),
    };
}

export function formatBytes(bytes: number): string {
    const n = Number(bytes) || 0;
    if (n < 1024) { return `${n} B`; }
    if (n < 1024 * 1024) { return `${(n / 1024).toFixed(1)} KB`; }
    if (n < 1024 * 1024 * 1024) { return `${(n / (1024 * 1024)).toFixed(2)} MB`; }
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Ringkasan pendek untuk daftar riwayat. */
export function apiSummary(result: ApiTestResult): string {
    if (result.error) { return result.error; }
    return `${result.status} ${result.statusText || ''} · ${result.ms} ms · ${formatBytes(result.bytes)}`.replace(/\s+/g, ' ').trim();
}

/** Isi pratinjau/editor untuk hasil test API. */
export function apiDetail(result: ApiTestResult): string {
    const lines = [
        `🧪 TEST API JSON · ${new Date(result.at).toLocaleString('id-ID')}`,
        '',
        `${result.method} ${result.url}`,
        result.error
            ? `Galat   : ${result.error}`
            : `Status  : ${result.status} ${result.statusText} (${result.ms} ms, ${formatBytes(result.bytes)})`,
    ];
    if (result.contentType) { lines.push(`Tipe    : ${result.contentType}`); }
    lines.push('', '— Balasan —');
    lines.push(result.text || '(kosong)');
    return lines.join('\n');
}

/** Endpoint umum API JSON lokal, dipakai untuk mengisi pilihan cepat di view. */
export function apiPresets(endpoints?: Record<string, string>, port = 47831): { id: string; label: string; url: string }[] {
    const base = `http://127.0.0.1:${port}`;
    const url = (key: string, fallback: string) => (endpoints && endpoints[key]) || `${base}${fallback}`;
    return [
        { id: 'health', label: 'health.json — status server', url: url('health', '/api/health.json') },
        { id: 'chat', label: 'chat.json — semua pesan', url: url('chat', '/api/chat.json') },
        { id: 'community', label: 'community.json — ruang komunitas', url: url('community', '/api/community.json') },
        { id: 'diskusi', label: 'diskusi.json — diskusi AI', url: url('diskusi', '/api/diskusi.json') },
        { id: 'chat-ai', label: 'chat-ai.json — percakapan Chat AI', url: url('chatAi', '/api/chat-ai.json') },
        { id: 'rooms', label: 'rooms.json — ringkasan ruang', url: url('rooms', '/api/rooms.json') },
        { id: 'firebase', label: 'firebase.json — isi database', url: url('firebase', '/api/firebase.json') },
        { id: 'raw', label: 'raw.txt — log mentah', url: url('raw', '/api/raw.txt') },
    ];
}

/* ── Kesehatan laptop ──────────────────────────────────────────────────────── */

export interface DiskInfo { mount: string; total: number; free: number; usedPct: number }
export interface AppInfo { name: string; mb: number }

export interface HealthMetrics {
    at: number;
    host: string;
    platform: string;
    release: string;
    arch: string;
    uptimeSec: number;
    cpuModel: string;
    cores: number;
    cpuUsage: number;
    load: number[];
    memTotal: number;
    memFree: number;
    memUsedPct: number;
    disks: DiskInfo[];
    battery?: { percent: number; status: string };
    apps: AppInfo[];
    node: string;
    score: number;
    label: string;
    issues: string[];
    tips: string[];
}

function cpuSnapshot(): { idle: number; total: number }[] {
    return os.cpus().map((cpu) => {
        const t = cpu.times;
        return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
    });
}

async function cpuUsage(sampleMs = 650): Promise<number> {
    const before = cpuSnapshot();
    await sleep(sampleMs);
    const after = cpuSnapshot();
    let idle = 0;
    let total = 0;
    for (let i = 0; i < after.length; i += 1) {
        const a = before[i];
        const b = after[i];
        if (!a || !b) { continue; }
        idle += b.idle - a.idle;
        total += b.total - a.total;
    }
    return total > 0 ? clamp(Math.round(100 * (1 - idle / total)), 0, 100) : 0;
}

function diskInfo(mount: string): DiskInfo | undefined {
    try {
        const stat = fs.statfsSync(mount);
        const total = Number(stat.bsize) * Number(stat.blocks);
        const free = Number(stat.bsize) * Number(stat.bavail);
        if (!total) { return undefined; }
        return { mount, total, free, usedPct: clamp(Math.round(100 * (1 - free / total)), 0, 100) };
    } catch {
        return undefined;
    }
}

export function listDisks(): DiskInfo[] {
    const hasil: DiskInfo[] = [];
    if (process.platform === 'win32') {
        for (let code = 65; code <= 90; code += 1) {
            const letter = String.fromCharCode(code);
            const root = `${letter}:\\`;
            try {
                if (!fs.existsSync(root)) { continue; }
            } catch {
                continue;
            }
            const info = diskInfo(root);
            if (info) { hasil.push(info); }
        }
    } else {
        const info = diskInfo('/');
        if (info) { hasil.push(info); }
    }
    return hasil;
}

function runCommand(file: string, args: string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
        execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
            resolve(err ? '' : String(stdout || ''));
        });
    });
}

function batteryLabel(status: number): string {
    const map: Record<number, string> = {
        1: 'memakai baterai', 2: 'tersambung listrik', 3: 'penuh', 4: 'lemah', 5: 'kritis',
        6: 'mengisi', 7: 'mengisi (hampir penuh)', 8: 'mengisi (lemah)', 9: 'mengisi', 10: 'tidak diketahui', 11: 'perlu servis',
    };
    return map[status] || `status ${status}`;
}

/** Baterai + aplikasi paling boros RAM di Windows (satu panggilan PowerShell). */
async function windowsExtras(): Promise<{ battery?: HealthMetrics['battery']; apps: AppInfo[] }> {
    const script = [
        "$ErrorActionPreference='SilentlyContinue';",
        '[Console]::OutputEncoding=[Text.Encoding]::UTF8;',
        '$batt=$null;',
        '$b=Get-CimInstance Win32_Battery | Select-Object -First 1;',
        'if ($b) { $batt=[pscustomobject]@{percent=[int]$b.EstimatedChargeRemaining;status=[int]$b.BatteryStatus} };',
        '$apps=Get-Process | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{name=$_.Name;mb=[int][math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum)/1MB)} } | Sort-Object mb -Descending | Select-Object -First 8;',
        '[pscustomobject]@{battery=$batt;apps=@($apps)} | ConvertTo-Json -Depth 4 -Compress',
    ].join(' ');
    const out = await runCommand('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], 8000);
    const text = out.trim();
    if (!text) { return { apps: [] }; }
    try {
        const data = JSON.parse(text) as { battery?: { percent?: number; status?: number }; apps?: unknown };
        const battery = data.battery && Number.isFinite(Number(data.battery.percent))
            ? { percent: clamp(Number(data.battery.percent), 0, 100), status: batteryLabel(Number(data.battery.status)) }
            : undefined;
        const appsRaw = Array.isArray(data.apps) ? data.apps : (data.apps ? [data.apps] : []);
        const apps = appsRaw
            .map((a) => {
                const item = a as { name?: unknown; mb?: unknown };
                return { name: String(item.name || '').trim(), mb: Math.max(0, Math.round(Number(item.mb) || 0)) };
            })
            .filter((a) => !!a.name)
            .slice(0, 8);
        return { battery, apps };
    } catch {
        return { apps: [] };
    }
}

/** Baterai + aplikasi paling boros RAM di macOS/Linux. */
async function unixExtras(): Promise<{ battery?: HealthMetrics['battery']; apps: AppInfo[] }> {
    const apps: AppInfo[] = [];
    const ps = await runCommand('ps', ['-eo', 'rss=,comm='], 5000);
    const groups = new Map<string, number>();
    for (const line of ps.split(/\r?\n/)) {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) { continue; }
        const name = path.basename(match[2].trim());
        const mb = Math.round(Number(match[1]) / 1024);
        groups.set(name, (groups.get(name) || 0) + mb);
    }
    for (const [name, mb] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        apps.push({ name, mb });
    }
    let battery: HealthMetrics['battery'];
    if (process.platform === 'darwin') {
        const out = await runCommand('pmset', ['-g', 'batt'], 4000);
        const percent = out.match(/(\d+)%/);
        if (percent) {
            battery = { percent: clamp(Number(percent[1]), 0, 100), status: /charging/i.test(out) ? 'mengisi' : /discharging/i.test(out) ? 'memakai baterai' : 'tersambung listrik' };
        }
    } else {
        try {
            const base = '/sys/class/power_supply';
            const dirs = fs.readdirSync(base).filter((d) => d.toUpperCase().startsWith('BAT'));
            if (dirs[0]) {
                const raw = fs.readFileSync(path.join(base, dirs[0], 'capacity'), 'utf8').trim();
                const status = fs.readFileSync(path.join(base, dirs[0], 'status'), 'utf8').trim();
                battery = { percent: clamp(Number(raw) || 0, 0, 100), status: status.toLowerCase() };
            }
        } catch {
            // Tidak ada baterai / tidak terbaca.
        }
    }
    return { battery, apps };
}

function evaluate(m: Pick<HealthMetrics, 'cpuUsage' | 'memUsedPct' | 'memTotal' | 'memFree' | 'disks' | 'battery' | 'apps'>): { score: number; label: string; issues: string[]; tips: string[] } {
    let score = 100;
    const issues: string[] = [];
    const tips: string[] = [];
    if (m.memUsedPct >= 92) { score -= 30; issues.push(`RAM hampir penuh (${m.memUsedPct}% terpakai).`); }
    else if (m.memUsedPct >= 82) { score -= 15; issues.push(`RAM cukup penuh (${m.memUsedPct}% terpakai).`); }
    const disks = m.disks || [];
    const penuh = disks.filter((d) => d.usedPct >= 90);
    const hampir = disks.filter((d) => d.usedPct >= 82 && d.usedPct < 90);
    if (penuh.length) { score -= 10 * Math.min(2, penuh.length); issues.push(`Disk hampir penuh: ${penuh.map((d) => `${d.mount} (${d.usedPct}%)`).join(', ')}.`); }
    else if (hampir.length) { score -= 5; issues.push(`Ruang disk menipis: ${hampir.map((d) => `${d.mount} (${d.usedPct}%)`).join(', ')}.`); }
    if (disks.some((d) => d.free < 1024 * 1024 * 1024)) { score -= 8; issues.push('Ada disk dengan sisa ruang di bawah 1 GB.'); }
    if (m.cpuUsage >= 88) { score -= 12; issues.push(`CPU sibuk (${m.cpuUsage}% terpakai saat diperiksa).`); }
    else if (m.cpuUsage >= 72) { score -= 5; issues.push(`CPU cukup sibuk (${m.cpuUsage}%).`); }
    if (m.battery && m.battery.percent <= 15) { score -= 8; issues.push(`Baterai lemah (${m.battery.percent}%).`); }
    const berat = (m.apps || []).filter((a) => a.mb >= 900).slice(0, 3);
    if (berat.length) { tips.push(`Aplikasi berat: ${berat.map((a) => `${a.name} ${a.mb} MB`).join(', ')} — tutup yang tidak dipakai.`); }
    tips.push('Tutup tab/aplikasi berat (Chrome, Edge, Docker, Slack) sebelum menjalankan analisis besar.');
    tips.push('Sisakan ruang disk minimal 15% supaya Windows tetap gesit.');
    if (!m.battery) { tips.push('Cek baterai lewat pengaturan sistem (metrik baterai tidak tersedia di perangkat ini).'); }
    score = clamp(Math.round(score), 0, 100);
    const label = score >= 85 ? 'Sehat' : score >= 65 ? 'Perlu perhatian' : 'Kritis';
    return { score, label, issues, tips };
}

/** Kumpulkan seluruh metrik kesehatan (CPU, RAM, disk, baterai, aplikasi berat). */
export async function collectHealth(): Promise<HealthMetrics> {
    const cpus = os.cpus();
    const usage = await cpuUsage();
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const memUsedPct = memTotal ? clamp(Math.round(100 * (1 - memFree / memTotal)), 0, 100) : 0;
    const disks = listDisks();
    const extra = process.platform === 'win32' ? await windowsExtras() : await unixExtras();
    const base = {
        at: Date.now(),
        host: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        release: os.release(),
        arch: os.arch(),
        uptimeSec: Math.round(os.uptime()),
        cpuModel: (cpus[0] && cpus[0].model ? cpus[0].model : 'CPU tidak dikenal').replace(/\s+/g, ' ').trim(),
        cores: cpus.length,
        cpuUsage: usage,
        load: os.loadavg().map((n) => Math.round(n * 100) / 100),
        memTotal,
        memFree,
        memUsedPct,
        disks,
        battery: extra.battery,
        apps: extra.apps,
        node: process.version,
    };
    const nilai = evaluate(base);
    return { ...base, ...nilai };
}

function formatDuration(sec: number): string {
    const hari = Math.floor(sec / 86400);
    const jam = Math.floor((sec % 86400) / 3600);
    const menit = Math.floor((sec % 3600) / 60);
    if (hari) { return `${hari} hari ${jam} jam`; }
    if (jam) { return `${jam} jam ${menit} menit`; }
    return `${menit} menit`;
}

/** Laporan teks yang ditulis ke terminal dan disimpan di riwayat. */
export function healthReport(m: HealthMetrics): string {
    const lines: string[] = [];
    lines.push(`🩺 CEK KESEHATAN LAPTOP · ${new Date(m.at).toLocaleString('id-ID')}`);
    lines.push(`Skor    : ${m.score}/100 · ${m.label}`);
    lines.push('');
    lines.push(`Sistem  : ${m.platform} · ${m.arch} · ${m.host}`);
    lines.push(`CPU     : ${m.cpuModel}`);
    lines.push(`          ${m.cores} inti · beban ${m.cpuUsage}% · uptime ${formatDuration(m.uptimeSec)}`);
    lines.push(`RAM     : ${formatBytes(m.memTotal - m.memFree)} / ${formatBytes(m.memTotal)} terpakai (${m.memUsedPct}%)`);
    lines.push(`          sisa ${formatBytes(m.memFree)}`);
    for (const d of m.disks) {
        lines.push(`Disk ${pad(d.mount, 4)}: ${formatBytes(d.free)} bebas dari ${formatBytes(d.total)} · ${d.usedPct}% terpakai`);
    }
    if (!m.disks.length) { lines.push('Disk    : metrik ruang disk tidak tersedia.'); }
    if (m.battery) { lines.push(`Baterai : ${m.battery.percent}% · ${m.battery.status}`); }
    lines.push(`Runtime : Node ${m.node} · VS Code extension host`);
    lines.push('');
    if (m.apps.length) {
        lines.push('Aplikasi paling boros RAM:');
        m.apps.slice(0, 6).forEach((a, i) => lines.push(`  ${String(i + 1).padStart(2)}. ${pad(a.name, 22)} ${String(a.mb).padStart(6)} MB`));
        lines.push('');
    }
    if (m.issues.length) {
        lines.push('Temuan:');
        m.issues.forEach((issue) => lines.push(`  ⚠ ${issue}`));
    } else {
        lines.push('Temuan: tidak ada masalah berarti — semua metrik dalam batas wajar.');
    }
    lines.push('');
    lines.push('Saran:');
    m.tips.slice(0, 4).forEach((tip) => lines.push(`  • ${tip}`));
    return lines.join('\n');
}

export function healthSummary(m: HealthMetrics): string {
    const disk = m.disks.length ? ` · disk ${Math.max(...m.disks.map((d) => d.usedPct))}%` : '';
    return `${m.score}/100 ${m.label} · RAM ${m.memUsedPct}% · CPU ${m.cpuUsage}%${disk}`;
}

/* ── terminal laporan ──────────────────────────────────────────────────────── */

/**
 * Terminal semu yang menulis laporan baris demi baris (memberi kesan pemeriksaan berjalan).
 * Hasil yang sama tetap disimpan di riwayat supaya bisa dipratinjau/diulang tanpa membuka terminal.
 */
export class PetHealthTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private readonly closeEmitter = new vscode.EventEmitter<void>();
    readonly onDidWrite = this.writeEmitter.event;
    readonly onDidClose = this.closeEmitter.event;

    private opened = false;
    private lines: string[] = [];
    private index = 0;
    private timer?: ReturnType<typeof setInterval>;
    private finished = false;

    open(): void {
        this.opened = true;
        this.write('\x1b[1mDate Skunder · Cek Kesehatan Laptop\x1b[0m\r\n');
        this.write('Mengumpulkan metrik CPU, RAM, disk, baterai, dan aplikasi berat…\r\n\r\n');
        this.pump();
    }

    close(): void {
        this.opened = false;
        if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    }

    handleInput(data: string): void {
        const text = String(data || '').toLowerCase();
        if (this.finished && (text.includes('\r') || text.includes('\n') || text.includes('q'))) {
            this.closeEmitter.fire();
        }
    }

    /** Kirim laporan (boleh dipanggil sebelum terminal terbuka). */
    report(report: string): void {
        this.lines = String(report || '').split(/\r?\n/);
        this.pump();
    }

    private write(text: string): void {
        this.writeEmitter.fire(String(text).replace(/\r?\n/g, '\r\n'));
    }

    private pump(): void {
        if (!this.opened || this.timer || this.finished) { return; }
        this.timer = setInterval(() => {
            if (this.index >= this.lines.length) {
                if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
                this.finished = true;
                this.write('\r\n\x1b[2mHasil disimpan di riwayat Pet Lab — bisa dipratinjau & dihapus dari view Pet Skin.\x1b[0m\r\n');
                this.write('\x1b[2mTekan Enter untuk menutup terminal.\x1b[0m\r\n');
                return;
            }
            this.write(`${this.lines[this.index]}\r\n`);
            this.index += 1;
        }, 28);
    }
}

/* ── pratinjau di editor ───────────────────────────────────────────────────── */

/** Buka hasil di tab editor (read-only) untuk melihat teks lengkap. */
export async function openLabEntry(ctx: vscode.ExtensionContext, id: unknown): Promise<boolean> {
    const entry = labEntryById(ctx, id);
    if (!entry) { return false; }
    const language = entry.kind === 'api' && /"|\[|\{/.test(entry.detail) ? 'json' : 'markdown';
    const doc = await vscode.workspace.openTextDocument({ content: entry.detail, language });
    await vscode.window.showTextDocument(doc, { preview: true });
    return true;
}

/** Uraian singkat untuk laporan di editor/riwayat. */
export function labEntryText(entry: PetLabEntry): string {
    return entry.detail;
}
