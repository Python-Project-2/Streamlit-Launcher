/**
 * “Compile MSI”: mengubah satu **link website** menjadi installer Windows (.msi) yang
 * perilakunya mirip aplikasi desktop (seperti Tauri): punya nama, pengembang, versi,
 * folder instalasi, icon, dan shortcut.
 *
 * Isi installer:
 *  - `app.ico`      icon aplikasi (dipilih pengguna, atau logo bawaan).
 *  - `app.exe`      launcher kecil (dikompilasi dengan csc bawaan Windows) yang membuka
 *                   website di jendela aplikasi Microsoft Edge (`--app`), dengan fallback
 *                   ke browser bawaan bila Edge tidak ada.
 *  - `Buka Website.url`  cadangan bila launcher tidak bisa dibuat.
 *  - Shortcut Start Menu (dan Desktop bila diminta) + entri Programs & Features.
 *
 * WiX Toolset v3 (candle + light) dipakai untuk membungkusnya. WiX dicari di cache, PATH,
 * dan folder pemasangan umum; bila belum ada dan diizinkan, diunduh sekali lalu dipakai ulang.
 */
import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';

export type BuildStepId = 'preflight' | 'aset' | 'msi';
export type BuildStepState = 'pending' | 'start' | 'ok' | 'fail' | 'skip' | 'warn';
export type LineKind = 'cmd' | 'out' | 'err' | 'info' | 'ok';

export interface BuildStep {
    id: BuildStepId;
    label: string;
    state: BuildStepState;
    detail?: string;
}

export interface BuildArtifacts {
    folder: string;
    msi?: string;
    wxs?: string;
    assetsDir?: string;
}

export type BuildEvent =
    | { type: 'step'; id: BuildStepId; state: BuildStepState; detail?: string }
    | { type: 'line'; text: string; kind?: LineKind }
    | { type: 'progress'; pct: number }
    | { type: 'done'; ok: boolean; message: string; artifacts: BuildArtifacts; ms: number };

/** Data aplikasi yang dipilih di view (mirip kolom `tauri.conf.json` + bundler MSI). */
export interface AppSpec {
    /** Link website yang dibungkus. */
    url: string;
    /** Nama aplikasi (ProductName di MSI). */
    name: string;
    /** Versi, mis. 1.0.0. */
    version: string;
    /** Nama pengembang / perusahaan (Manufacturer). */
    publisher: string;
    description: string;
    /** Nama folder di folder induk (LocalAppData\Programs atau Program Files). */
    folder: string;
    /** per pengguna (tanpa admin) atau semua pengguna (butuh admin). */
    scope: 'user' | 'machine';
    /** Berkas icon .ico atau .png; kosong = logo bawaan. */
    iconPath: string;
    /** Ukuran jendela aplikasi. */
    width: number;
    height: number;
    /** Buka di jendela aplikasi Edge (tanpa address bar). */
    appMode: boolean;
    /** Buat shortcut di Desktop selain Start Menu. */
    desktopShortcut: boolean;
}

export interface BuildOptions {
    spec: AppSpec;
    /** Folder hasil (.msi, .wxs, aset). */
    outDir: string;
    /** Cache WiX Toolset. */
    wixCacheDir: string;
    /** Izinkan unduh WiX otomatis bila belum terpasang. */
    allowWixDownload: boolean;
    /** Icon bawaan bila pengguna tidak memilih (mis. icon/logo.png). */
    defaultIconPath: string;
    /** Batas waktu tiap perintah (ms); 0 = tanpa batas. */
    timeoutMs?: number;
}

export interface BuildResult {
    ok: boolean;
    message: string;
    artifacts: BuildArtifacts;
    ms: number;
    steps: BuildStep[];
}

export const BUILD_STEPS: { id: BuildStepId; label: string }[] = [
    { id: 'preflight', label: 'Periksa data aplikasi' },
    { id: 'aset', label: 'Siapkan icon + launcher' },
    { id: 'msi', label: 'Bangun installer MSI' },
];

export const WIX_DOWNLOAD_URL = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip';
export const WIX_HOME = 'https://wixtoolset.org/';

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
    return String(text).replace(ANSI, '');
}

export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) { return '0 s'; }
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m ? `${m} m ${s} s` : `${s} s`;
}

/** Versi MSI harus angka murni (mis. 2.9.8), tanpa akhiran -beta. */
export function msiVersion(version: string): string {
    const m = String(version).match(/(\d+)\.(\d+)\.(\d+)/);
    if (m) { return `${m[1]}.${m[2]}.${m[3]}`; }
    const one = String(version).match(/(\d+)\.(\d+)/);
    return one ? `${one[1]}.${one[2]}.0` : '1.0.0';
}

/** Nama berkas/folder yang aman dipakai di semua sistem. */
export function slug(text: string): string {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'aplikasi';
}

/** GUID stabil dari sebuah teks (UpgradeCode & Component GUID). */
export function stableGuid(seed: string): string {
    const h = createHash('md5').update(`dateSkunder.site.${seed}`).digest('hex').toUpperCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function xmlEscape(text: string): string {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Ringkasan MSI memakai code page ANSI, jadi teks non-ASCII diganti tanda hubung. */
export function asciiOnly(text: string): string {
    return String(text)
        .replace(/[^\x20-\x7E]/g, '-')
        .replace(/(?:\s*-\s*)+/g, ' - ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * Validasi + rapikan data form menjadi AppSpec yang siap dipakai.
 * Pesan galat memakai bahasa Indonesia supaya bisa langsung ditampilkan di view.
 */
export function normalizeSpec(input: Partial<AppSpec>): AppSpec {
    const url = String(input.url ?? '').trim();
    if (!url) { throw new Error('Link website wajib diisi (contoh: https://contoh.com).'); }
    if (url.length > 2048) { throw new Error('Link website terlalu panjang (maksimal 2048 karakter).'); }
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Link website tidak valid. Gunakan alamat lengkap, mis. https://contoh.com.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Link harus diawali http:// atau https://.');
    }
    if (/["'<>\s]/.test(url)) {
        throw new Error('Link website tidak boleh mengandung spasi, kutip, atau tanda < >.');
    }

    const name = String(input.name ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80);
    if (!name) { throw new Error('Nama aplikasi wajib diisi.'); }

    const publisher = (String(input.publisher ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80)) || 'Date Skunder';
    const description = String(input.description ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    const version = msiVersion(String(input.version ?? '1.0.0'));

    const folderRaw = String(input.folder ?? '').trim() || name;
    let folder = folderRaw
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\.{2,}/g, '.')
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .trim()
        .slice(0, 60);
    // Nama perangkat Windows (CON, PRN, …) tidak boleh dipakai sebagai folder.
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(folder)) { folder = `_${folder}`; }
    if (!folder) { folder = slug(name); }

    const scope: AppSpec['scope'] = input.scope === 'machine' ? 'machine' : 'user';
    const width = clampNumber(input.width, 480, 3840, 1280);
    const height = clampNumber(input.height, 320, 2160, 800);

    const iconPath = String(input.iconPath ?? '').trim();
    if (iconPath) {
        const ext = path.extname(iconPath).toLowerCase();
        if (ext !== '.ico' && ext !== '.png') {
            throw new Error('Icon harus berupa berkas .ico atau .png.');
        }
        if (!fs.existsSync(iconPath)) {
            throw new Error(`Berkas icon tidak ditemukan: ${iconPath}`);
        }
    }

    return {
        url,
        name,
        version,
        publisher,
        description,
        folder,
        scope,
        iconPath,
        width,
        height,
        appMode: input.appMode !== false,
        desktopShortcut: input.desktopShortcut !== false,
    };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0) { return fallback; }
    return Math.min(max, Math.max(min, n));
}

/** Bungkus PNG jadi ikon ICO satu entri (Windows Vista+ menerima entri PNG). */
export function pngToIco(png: Buffer): Buffer {
    if (png.length < 24 || png.readUInt32BE(0) !== 0x89504E47) {
        throw new Error('Berkas PNG tidak valid.');
    }
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header.writeUInt8(width >= 256 ? 0 : width, 6);
    header.writeUInt8(height >= 256 ? 0 : height, 7);
    header.writeUInt8(0, 8);
    header.writeUInt8(0, 9);
    header.writeUInt16LE(1, 10);
    header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14);
    header.writeUInt32LE(22, 18);
    return Buffer.concat([header, png]);
}

/** Cari compiler C# bawaan Windows (csc.exe .NET Framework). */
export function findCsc(): string | undefined {
    const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
    const candidates = [
        path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
        path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) { return candidate; }
    }
    return undefined;
}

/** Teks aman untuk string C# biasa (bukan verbatim). */
export function csLiteral(text: string): string {
    return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

/**
 * Sumber launcher: membuka link di jendela aplikasi Edge (`--app`), atau browser bawaan
 * bila Edge tidak ditemukan. Tidak ada dependensi tambahan.
 */
export function launcherSource(spec: AppSpec, exeName = 'app.exe'): string {
    return `// Dibuat otomatis oleh Date Skunder — Compile MSI (website -> installer).
using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

static class Program
{
    const string Url = ${csLiteral(spec.url)};
    const string AppName = ${csLiteral(spec.name)};
    const int WinWidth = ${spec.width};
    const int WinHeight = ${spec.height};
    const bool AppMode = ${spec.appMode ? 'true' : 'false'};

    static void Main(string[] args)
    {
        try
        {
            if (AppMode)
            {
                string edge = EdgePath();
                if (!string.IsNullOrEmpty(edge))
                {
                    ProcessStartInfo psi = new ProcessStartInfo(edge);
                    psi.Arguments = "--app=" + Quote(Url) + " --window-size=" + WinWidth + "," + WinHeight + " --new-window";
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                    return;
                }
            }
            Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
        }
        catch
        {
            try { Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true }); }
            catch { }
        }
    }

    static string Quote(string text)
    {
        return "\\"" + text.Replace("\\"", "\\\\\\"") + "\\"";
    }

    static string EdgePath()
    {
        string[] roots = new string[]
        {
            Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
            Environment.GetEnvironmentVariable("ProgramFiles"),
            Environment.GetEnvironmentVariable("LocalAppData")
        };
        foreach (string root in roots)
        {
            if (string.IsNullOrEmpty(root)) { continue; }
            string p = Path.Combine(root, @"Microsoft\\Edge\\Application\\msedge.exe");
            if (File.Exists(p)) { return p; }
        }
        try
        {
            using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe"))
            {
                if (key != null)
                {
                    string value = key.GetValue(null) as string;
                    if (!string.IsNullOrEmpty(value) && File.Exists(value)) { return value; }
                }
            }
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe"))
            {
                if (key != null)
                {
                    string value = key.GetValue(null) as string;
                    if (!string.IsNullOrEmpty(value) && File.Exists(value)) { return value; }
                }
            }
        }
        catch { }
        return null;
    }
}
`;
}

/** Isi berkas `.url` (cadangan bila launcher tidak bisa dikompilasi). */
export function internetShortcut(spec: AppSpec): string {
    return `[InternetShortcut]\r\nURL=${spec.url}\r\n`;
}

type Emit = (event: BuildEvent) => void;

interface ExecResult { code: number; output: string }

interface ExecOptions { cwd: string; timeoutMs?: number; kind?: LineKind }

function runCommand(exe: string, args: string[], options: ExecOptions, emit: Emit, onChild?: (child: ChildProcess | undefined) => void): Promise<ExecResult> {
    const isWin = process.platform === 'win32';
    const pretty = [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    emit({ type: 'line', text: `> ${pretty}`, kind: 'cmd' });

    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' };
    let child: ChildProcess;
    if (isWin) {
        const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
        const command = `& ${q(exe)} ${args.map(q).join(' ')}; exit $LASTEXITCODE`;
        child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
            cwd: options.cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
    } else {
        child = spawn(exe, args, { cwd: options.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    onChild?.(child);

    return new Promise<ExecResult>((resolve) => {
        let output = '';
        let buffer = '';
        let done = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (code: number) => {
            if (done) { return; }
            done = true;
            if (timer) { clearTimeout(timer); }
            if (buffer.trim()) { emit({ type: 'line', text: stripAnsi(buffer), kind: options.kind ?? 'out' }); }
            onChild?.(undefined);
            resolve({ code, output });
        };

        const onData = (chunk: Buffer, kind: LineKind) => {
            const text = stripAnsi(chunk.toString('utf8'));
            output += text;
            buffer += text;
            const parts = buffer.split(/\r?\n/);
            buffer = parts.pop() ?? '';
            for (const line of parts) {
                const clean = line.replace(/\s+$/, '');
                emit({ type: 'line', text: clean, kind: clean ? kind : 'out' });
            }
        };

        child.stdout?.on('data', (c: Buffer) => onData(c, options.kind ?? 'out'));
        child.stderr?.on('data', (c: Buffer) => onData(c, 'err'));
        child.on('error', (e) => {
            emit({ type: 'line', text: `Gagal menjalankan ${exe}: ${e.message}`, kind: 'err' });
            finish(-1);
        });
        child.on('close', (code) => finish(typeof code === 'number' ? code : -1));

        if (options.timeoutMs && options.timeoutMs > 0) {
            timer = setTimeout(() => {
                if (done) { return; }
                emit({ type: 'line', text: `Batas waktu ${formatDuration(options.timeoutMs ?? 0)} tercapai — perintah dihentikan.`, kind: 'err' });
                killTree(child);
                finish(-2);
            }, options.timeoutMs);
        }
    });
}

function killTree(child: ChildProcess | undefined): void {
    if (!child || !child.pid) { return; }
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
        } else {
            process.kill(-child.pid, 'SIGTERM');
        }
    } catch { /* proses sudah selesai */ }
}

/** Unduh berkas lewat https dengan mengikuti pengalihan (GitHub → objects.githubusercontent.com). */
async function downloadFile(url: string, dest: string, emit: Emit, redirects = 0): Promise<void> {
    if (redirects > 6) { throw new Error('Terlalu banyak pengalihan saat mengunduh.'); }
    await new Promise<void>((resolve, reject) => {
        const client = url.startsWith('http:') ? http : https;
        const req = client.get(url, { headers: { 'User-Agent': 'date-skunder-compile-msi' } }, (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                const next = new URL(res.headers.location, url).toString();
                downloadFile(next, dest, emit, redirects + 1).then(resolve, reject);
                return;
            }
            if (status !== 200) {
                res.resume();
                reject(new Error(`Unduhan gagal (HTTP ${status}).`));
                return;
            }
            const total = Number(res.headers['content-length'] ?? 0);
            let seen = 0;
            let lastPct = -1;
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const out = fs.createWriteStream(dest);
            res.on('data', (chunk: Buffer) => {
                seen += chunk.length;
                if (total > 0) {
                    const pct = Math.floor((seen / total) * 100);
                    if (pct >= lastPct + 10) {
                        lastPct = pct - (pct % 10);
                        emit({ type: 'line', text: `  mengunduh WiX… ${lastPct}% (${(seen / 1048576).toFixed(1)} MB)`, kind: 'info' });
                    }
                }
            });
            res.pipe(out);
            out.on('finish', () => out.close(() => resolve()));
            out.on('error', reject);
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(120000, () => req.destroy(new Error('Unduhan melewati batas waktu.')));
    });
}

export interface WixTools { candle: string; light: string; source: string }

/** Cari candle.exe/light.exe di cache, PATH, atau folder pemasangan WiX. */
export function findWixTools(cacheDir: string): WixTools | undefined {
    const candidates = [
        cacheDir,
        path.join(cacheDir, 'bin'),
        path.join(cacheDir, 'wix314'),
        ...(process.env.PATH || '').split(path.delimiter).filter(Boolean),
        process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'WiX Toolset v3.14', 'bin') : '',
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'WiX Toolset v3.14', 'bin') : '',
        process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'WiX Toolset v3.11', 'bin') : '',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'WiX Toolset v3.14', 'bin') : '',
    ].filter(Boolean);

    for (const dir of candidates) {
        const candle = path.join(dir, 'candle.exe');
        const light = path.join(dir, 'light.exe');
        if (fs.existsSync(candle) && fs.existsSync(light)) {
            return { candle, light, source: dir };
        }
    }
    return undefined;
}

export interface AppAsset { rel: string; abs: string; size: number }

/** Berkas aset aplikasi yang siap dibungkus (relatif terhadap folder kerja). */
export function listAssets(dir: string): AppAsset[] {
    const out: AppAsset[] = [];
    const walk = (current: string, base: string) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const abs = path.join(current, entry.name);
            const rel = base ? `${base}/${entry.name}` : entry.name;
            if (entry.isDirectory()) { walk(abs, rel); continue; }
            const stat = fs.statSync(abs);
            out.push({ rel, abs, size: stat.size });
        }
    };
    if (fs.existsSync(dir)) { walk(dir, ''); }
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

interface DirNode { name: string; id: string; children: Map<string, DirNode> }

export interface WixMeta {
    /** Nama folder kerja (asset root). */
    appFolder: string;
}

/**
 * Susun sumber WiX untuk aplikasi website: Product metadata, folder instalasi,
 * icon ARP, shortcut Start Menu/Desktop, dan satu komponen per berkas.
 */
export function buildWixSource(spec: AppSpec, assets: AppAsset[], meta: WixMeta): string {
    const perMachine = spec.scope === 'machine';
    const upgradeCode = stableGuid(`${spec.publisher}/${spec.name}/${spec.folder}/upgrade`);
    const launcherRel = assets.find((a) => a.rel.toLowerCase().endsWith('.exe'))?.rel;
    const urlRel = assets.find((a) => a.rel.toLowerCase().endsWith('.url'))?.rel;
    const shortcutTarget = launcherRel
        ? `[INSTALLFOLDER]${launcherRel}`
        : (urlRel ? `[INSTALLFOLDER]${urlRel}` : `[INSTALLFOLDER]`);

    const rootNode: DirNode = { name: '', id: 'INSTALLFOLDER', children: new Map() };
    const ensureDir = (relDir: string): DirNode => {
        const parts = relDir.split('/').filter(Boolean);
        let node = rootNode;
        let walked = '';
        for (const part of parts) {
            walked = walked ? `${walked}/${part}` : part;
            let child = node.children.get(part);
            if (!child) {
                child = { name: part, id: `D_${stableHex(walked)}`, children: new Map() };
                node.children.set(part, child);
            }
            node = child;
        }
        return node;
    };

    const dirMarkup = (node: DirNode, indent: string): string => {
        const lines: string[] = [];
        for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`${indent}<Directory Id="${child.id}" Name="${xmlEscape(child.name)}">`);
            lines.push(dirMarkup(child, `${indent}  `));
            lines.push(`${indent}</Directory>`);
        }
        return lines.join('\n');
    };

    const components: string[] = [];
    for (const file of assets) {
        const relDir = path.posix.dirname(file.rel) === '.' ? '' : path.posix.dirname(file.rel);
        const dirNode = ensureDir(relDir);
        const hex = stableHex(file.rel);
        const source = `$(var.SrcDir)\\${file.rel.split('/').join('\\')}`;
        components.push([
            `      <Component Id="C_${hex}" Guid="{${stableGuid(file.rel)}}" Directory="${dirNode.id}">`,
            `        <File Id="F_${hex}" KeyPath="yes" Source="${xmlEscape(source)}" />`,
            `      </Component>`,
        ].join('\n'));
    }

    const registryRoot = perMachine ? 'HKLM' : 'HKCU';
    const shortcutRows = [
        `        <Shortcut Id="StartMenuShortcut" Directory="ProgramMenuDir" Name="${xmlEscape(spec.name)}" Target="${shortcutTarget}" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" Advertise="no" />`,
    ];
    if (spec.desktopShortcut) {
        shortcutRows.push(`        <Shortcut Id="DesktopShortcut" Directory="DesktopFolder" Name="${xmlEscape(spec.name)}" Target="${shortcutTarget}" WorkingDirectory="INSTALLFOLDER" Icon="AppIcon" Advertise="no" />`);
    }

    const rootDirs = perMachine
        ? `      <Directory Id="ProgramFiles64Folder">
        <Directory Id="INSTALLFOLDER" Name="${xmlEscape(spec.folder)}">
${dirMarkup(rootNode, '          ')}
        </Directory>
      </Directory>`
        : `      <Directory Id="LocalAppDataFolder">
        <Directory Id="ProgramsFolder" Name="Programs">
          <Directory Id="INSTALLFOLDER" Name="${xmlEscape(spec.folder)}">
${dirMarkup(rootNode, '            ')}
          </Directory>
        </Directory>
      </Directory>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Dibuat otomatis oleh fitur “Compile MSI” Date Skunder. Jangan diedit tangan. -->
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="*" Name="${xmlEscape(spec.name)}" Language="1033" Version="${msiVersion(spec.version)}"
           Manufacturer="${xmlEscape(spec.publisher)}" UpgradeCode="{${upgradeCode}}" Codepage="65001">
    <Package Id="*" InstallerVersion="500" Compressed="yes" InstallScope="${perMachine ? 'perMachine' : 'perUser'}" Platform="x64"
             Description="${xmlEscape(asciiOnly(spec.description || `${spec.name} - ${spec.url}`).slice(0, 200))}" />
    <MajorUpgrade DowngradeErrorMessage="Versi ${xmlEscape(spec.name)} yang lebih baru sudah terpasang." />
    <MediaTemplate EmbedCab="yes" CompressionLevel="high" />
    <Icon Id="AppIcon" SourceFile="$(var.SrcDir)\\app.ico" />
    <Property Id="ARPPRODUCTICON" Value="AppIcon" />
    <Property Id="ARPHELPLINK" Value="${xmlEscape(spec.url)}" />
    <Property Id="ARPURLINFOABOUT" Value="${xmlEscape(spec.url)}" />
    <Property Id="ARPNOMODIFY" Value="1" />
    <Property Id="ARPNOREPAIR" Value="1" />
    <Property Id="ARPCOMMENTS" Value="Dibuat dengan Date Skunder - Compile MSI." />
    <Directory Id="TARGETDIR" Name="SourceDir">
${rootDirs}
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ProgramMenuDir" Name="${xmlEscape(spec.folder)}" />
      </Directory>
      <Directory Id="DesktopFolder" />
    </Directory>
    <Feature Id="MainFeature" Title="${xmlEscape(spec.name)}" Level="1" Display="expand">
      <ComponentGroupRef Id="Files" />
      <ComponentGroupRef Id="Shortcuts" />
    </Feature>
  </Product>
  <Fragment>
    <ComponentGroup Id="Files">
${components.join('\n')}
    </ComponentGroup>
    <ComponentGroup Id="Shortcuts">
      <Component Id="C_shortcuts" Guid="{${stableGuid(`${spec.name}/shortcuts`)}}" Directory="INSTALLFOLDER">
${shortcutRows.join('\n')}
        <RegistryValue Root="${registryRoot}" Key="Software\\${xmlEscape(spec.publisher)}\\${xmlEscape(spec.name)}" Name="Shortcut" Type="integer" Value="1" KeyPath="yes" />
        <RemoveFolder Id="RemoveProgramMenuDir" Directory="ProgramMenuDir" On="uninstall" />
      </Component>
    </ComponentGroup>
  </Fragment>
</Wix>
`;
}

function stableHex(seed: string): string {
    return createHash('md5').update(seed).digest('hex').slice(0, 10).toUpperCase();
}

/** Siapkan aset: icon (ico/png/bawaan), launcher exe (csc) atau .url cadangan. */
export async function prepareAssets(options: BuildOptions, workDir: string, emit: Emit, onChild?: (c: ChildProcess | undefined) => void): Promise<{ icon: boolean; launcher: boolean; files: AppAsset[] }> {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });

    // ── icon ────────────────────────────────────────────────────────────
    const iconSource = options.spec.iconPath || options.defaultIconPath;
    let iconOk = false;
    if (iconSource && fs.existsSync(iconSource)) {
        const ext = path.extname(iconSource).toLowerCase();
        try {
            if (ext === '.png') {
                const ico = pngToIco(fs.readFileSync(iconSource));
                fs.writeFileSync(path.join(workDir, 'app.ico'), ico);
            } else {
                fs.copyFileSync(iconSource, path.join(workDir, 'app.ico'));
            }
            iconOk = true;
            emit({ type: 'line', text: `  Icon: ${path.basename(iconSource)} → app.ico`, kind: 'info' });
        } catch (e) {
            emit({ type: 'line', text: `  Icon dilewati: ${e instanceof Error ? e.message : String(e)}`, kind: 'err' });
        }
    }
    if (!iconOk) {
        // ICO 1×1 transparan supaya WiX tetap punya berkas icon.
        const fallback = Buffer.from('00000100010001000000010020003000000016000000280000000100000002000000010020000000000004000000000000000000000000000000000000000000000000000000', 'hex');
        fs.writeFileSync(path.join(workDir, 'app.ico'), fallback);
        emit({ type: 'line', text: '  Icon bawaan tidak ditemukan — memakai icon kosong.', kind: 'info' });
    }

    // ── launcher ────────────────────────────────────────────────────────
    let launcherOk = false;
    const csc = findCsc();
    if (csc) {
        const sourceFile = path.join(workDir, 'launcher.cs');
        const exeFile = path.join(workDir, 'app.exe');
        fs.writeFileSync(sourceFile, launcherSource(options.spec), 'utf8');
        const compile = await runCommand(csc, [
            '/nologo', '/target:winexe', '/optimize+', '/platform:anycpu',
            `/win32icon:${path.join(workDir, 'app.ico')}`,
            `/out:${exeFile}`, sourceFile,
        ], { cwd: workDir, timeoutMs: Math.min(120000, options.timeoutMs || 120000) }, emit, onChild);
        if (compile.code === 0 && fs.existsSync(exeFile)) {
            launcherOk = true;
            emit({ type: 'line', text: '  Launcher app.exe berhasil dikompilasi.', kind: 'ok' });
        } else {
            emit({ type: 'line', text: '  Kompilasi launcher gagal — installer memakai berkas .url.', kind: 'err' });
        }
        fs.rmSync(sourceFile, { force: true });
    } else {
        emit({ type: 'line', text: '  csc.exe (compiler C# bawaan Windows) tidak ditemukan — memakai berkas .url.', kind: 'info' });
    }

    fs.writeFileSync(path.join(workDir, 'Buka Website.url'), internetShortcut(options.spec), 'utf8');
    return { icon: iconOk, launcher: launcherOk, files: listAssets(workDir) };
}

/** Pembangun MSI. Satu instance boleh dipakai berulang; `run` menolak saat masih sibuk. */
export class WebsiteMsiBuilder {
    private child?: ChildProcess;
    private cancelled = false;
    private busy = false;
    private steps: BuildStep[] = [];

    get running(): boolean { return this.busy; }

    cancel(): boolean {
        if (!this.busy) { return false; }
        this.cancelled = true;
        killTree(this.child);
        return true;
    }

    async run(options: BuildOptions, emit: Emit): Promise<BuildResult> {
        if (this.busy) {
            return { ok: false, message: 'Compile masih berjalan. Tunggu sampai selesai atau tekan ⏹ Stop.', artifacts: { folder: options.outDir }, ms: 0, steps: this.steps };
        }
        this.busy = true;
        this.cancelled = false;
        const started = Date.now();
        const artifacts: BuildArtifacts = { folder: options.outDir };
        this.steps = BUILD_STEPS.map((s) => ({ ...s, state: 'pending' as BuildStepState }));
        const onChild = (child: ChildProcess | undefined) => { this.child = child; };
        const emitStep = (id: BuildStepId, state: BuildStepState, detail?: string) => {
            const step = this.steps.find((s) => s.id === id);
            if (step) { step.state = state; step.detail = detail; }
            emit({ type: 'step', id, state, detail });
            const index = BUILD_STEPS.findIndex((s) => s.id === id);
            const pct = Math.round(((index + (state === 'start' ? 0.35 : 1)) / BUILD_STEPS.length) * 100);
            emit({ type: 'progress', pct: Math.min(100, pct) });
        };
        const fail = (id: BuildStepId, message: string): BuildResult => {
            emitStep(id, 'fail', message);
            emit({ type: 'line', text: `✕ ${message}`, kind: 'err' });
            const result: BuildResult = { ok: false, message, artifacts, ms: Date.now() - started, steps: this.steps };
            emit({ type: 'done', ok: false, message, artifacts, ms: result.ms });
            return result;
        };
        const limit = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 1200000;

        try {
            // ── 1. preflight ────────────────────────────────────────────────
            emitStep('preflight', 'start');
            let spec: AppSpec;
            try {
                spec = normalizeSpec(options.spec);
            } catch (e) {
                return fail('preflight', e instanceof Error ? e.message : String(e));
            }
            if (process.platform !== 'win32') {
                return fail('preflight', 'Installer MSI hanya bisa dibuat di Windows.');
            }
            fs.mkdirSync(options.outDir, { recursive: true });
            emit({ type: 'line', text: `  ${spec.name} ${spec.version} · ${spec.publisher}`, kind: 'info' });
            emit({ type: 'line', text: `  Link: ${spec.url}`, kind: 'info' });
            emit({ type: 'line', text: `  Instalasi: ${spec.scope === 'machine' ? 'semua pengguna (Program Files)' : 'per pengguna (LocalAppData\\Programs)'}\\${spec.folder}`, kind: 'info' });
            emitStep('preflight', 'ok', `${spec.name} ${spec.version}`);
            if (this.cancelled) { return fail('preflight', 'Dibatalkan.'); }

            // ── 2. aset ─────────────────────────────────────────────────────
            emitStep('aset', 'start');
            const workDir = path.join(options.outDir, `${slug(spec.name)}-assets`);
            const prepared = await prepareAssets({ ...options, spec }, workDir, emit, onChild);
            if (!prepared.files.length) { return fail('aset', 'Tidak ada aset aplikasi yang berhasil disiapkan.'); }
            artifacts.assetsDir = workDir;
            emitStep('aset', 'ok', `${prepared.files.length} berkas${prepared.launcher ? ' · launcher .exe' : ' · launcher .url'}`);
            if (this.cancelled) { return fail('aset', 'Dibatalkan.'); }

            // ── 3. msi ──────────────────────────────────────────────────────
            emitStep('msi', 'start');
            let wix = findWixTools(options.wixCacheDir);
            if (wix) {
                emit({ type: 'line', text: `  WiX ditemukan: ${wix.source}`, kind: 'info' });
            } else if (!options.allowWixDownload) {
                return fail('msi', `WiX Toolset v3 (candle.exe/light.exe) belum terpasang dan unduhan otomatis dimatikan. Pasang WiX v3 dari ${WIX_HOME} atau nyalakan dateSkunder.compile.autoWix.`);
            } else {
                emit({ type: 'line', text: '  WiX belum ada — mengunduh WiX 3.14 (sekali saja, ± 36 MB)…', kind: 'info' });
                const zip = path.join(options.wixCacheDir, 'wix314-binaries.zip');
                const marker = path.join(options.wixCacheDir, '.wix-ok');
                try {
                    if (!fs.existsSync(marker)) {
                        if (!fs.existsSync(zip) || fs.statSync(zip).size < 5_000_000) {
                            await downloadFile(WIX_DOWNLOAD_URL, zip, emit);
                        }
                        emit({ type: 'line', text: '  Mengekstrak WiX…', kind: 'info' });
                        const unzip = await runCommand('powershell.exe', [
                            '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                            '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${options.wixCacheDir.replace(/'/g, "''")}' -Force`,
                        ], { cwd: options.outDir, timeoutMs: Math.min(300000, limit) }, emit, onChild);
                        if (unzip.code !== 0) {
                            fs.rmSync(zip, { force: true });
                            return fail('msi', 'Gagal mengekstrak WiX. Coba compile sekali lagi supaya WiX diunduh ulang.');
                        }
                        fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
                    }
                    wix = findWixTools(options.wixCacheDir);
                } catch (e) {
                    return fail('msi', `WiX tidak bisa diunduh: ${e instanceof Error ? e.message : String(e)}`);
                }
                if (!wix) {
                    return fail('msi', `WiX sudah diunduh tetapi candle.exe/light.exe tidak ditemukan. Pasang WiX v3 manual dari ${WIX_HOME}.`);
                }
            }

            if (this.cancelled) { return fail('msi', 'Dibatalkan.'); }
            const wxsPath = path.join(options.outDir, `${slug(spec.name)}.wxs`);
            fs.writeFileSync(wxsPath, buildWixSource(spec, prepared.files, { appFolder: workDir }), 'utf8');
            artifacts.wxs = wxsPath;
            emit({ type: 'line', text: `  Sumber WiX: ${path.basename(wxsPath)} (${prepared.files.length} berkas)`, kind: 'info' });

            const wixobj = path.join(options.outDir, `${slug(spec.name)}.wixobj`);
            const candle = await runCommand(wix.candle, ['-nologo', '-arch', 'x64', `-dSrcDir=${workDir}`, '-out', wixobj, wxsPath], { cwd: options.outDir, timeoutMs: limit }, emit, onChild);
            if (candle.code !== 0) { return fail('msi', 'candle.exe gagal menyusun MSI (lihat pesan di atas).'); }

            const msiPath = path.join(options.outDir, `${slug(spec.name)}-${msiVersion(spec.version)}.msi`);
            const light = await runCommand(wix.light, ['-nologo', '-sval', '-cultures:en-us', '-out', msiPath, wixobj], { cwd: options.outDir, timeoutMs: limit }, emit, onChild);
            if (light.code !== 0) { return fail('msi', 'light.exe gagal membangun MSI (lihat pesan di atas).'); }
            if (!fs.existsSync(msiPath) || fs.statSync(msiPath).size < 1024) {
                return fail('msi', 'MSI tidak dihasilkan oleh light.exe.');
            }

            artifacts.msi = msiPath;
            emitStep('msi', 'ok', `${path.basename(msiPath)} · ${(fs.statSync(msiPath).size / 1024).toFixed(0)} KB`);
            const ms = Date.now() - started;
            emit({ type: 'progress', pct: 100 });
            const message = `Installer siap: ${path.basename(msiPath)} (${formatDuration(ms)}).`;
            emit({ type: 'line', text: `✓ ${message}`, kind: 'ok' });
            const result: BuildResult = { ok: true, message, artifacts, ms, steps: this.steps };
            emit({ type: 'done', ok: true, message, artifacts, ms });
            return result;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const running = this.steps.find((s) => s.state === 'start');
            return fail(running?.id ?? 'msi', message);
        } finally {
            this.busy = false;
            this.child = undefined;
        }
    }
}
