/**
 * View “Compile MSI” (sidebar Date Skunder AI, tepat di bawah Pet Skin).
 *
 * Alurnya: isi link website + identitas aplikasi (nama, pengembang, versi, folder, icon)
 * → masukkan token dari website → compile. Hasilnya installer `.msi` yang membuka website
 * itu sebagai aplikasi desktop.
 *
 *  - Tanpa token dari website (`api/token.html`) tombol Compile MSI tidak jalan.
 *  - Kuota komputer: 5 compile per 5 jam. Saat habis, compile DAN pembuatan token
 *    diblokir sampai jendela berikutnya.
 *  - Build berjalan di terminal sendiri (“Compile MSI”) dan keluarannya dicerminkan ke
 *    terminal di dalam view.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MsiTokens, TokenStatus, TokenStore } from './msiToken';
import { DEFAULT_TOKEN_PORT, TokenServer } from './tokenServer';
import {
    AppSpec,
    BUILD_STEPS,
    BuildArtifacts,
    BuildEvent,
    BuildOptions,
    BuildStep,
    BuildStepState,
    WebsiteMsiBuilder,
    formatDuration,
    normalizeSpec,
} from './websiteMsi';

const COMPILE_VIEW = 'dateSkunder.compileView';
const SECRET_TOKEN = 'dateSkunder.compile.token';
const MAX_LINES = 1200;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

interface LogLine { text: string; kind: string }

/** Terminal semu: menampilkan log build di panel Terminal VS Code. */
export class MsiTerminal implements vscode.Pseudoterminal {
    private readonly writeEmitter = new vscode.EventEmitter<string>();
    private readonly closeEmitter = new vscode.EventEmitter<void>();
    readonly onDidWrite = this.writeEmitter.event;
    readonly onDidClose = this.closeEmitter.event;
    private opened = false;
    private buffer: string[] = [];

    open(): void {
        this.opened = true;
        const pending = this.buffer;
        this.buffer = [];
        for (const text of pending) { this.writeEmitter.fire(text); }
    }

    close(): void {
        this.opened = false;
    }

    /** Terminal ini hanya menampilkan log; perintah diketik di view Compile MSI. */
    handleInput(): void { /* tidak ada input */ }

    line(text: string, kind = 'out'): void {
        const color = kind === 'cmd' ? '\u001b[36m'
            : kind === 'err' ? '\u001b[31m'
                : kind === 'ok' ? '\u001b[32m'
                    : kind === 'info' ? '\u001b[90m' : '';
        const reset = color ? '\u001b[0m' : '';
        this.emit(`${color}${String(text)}${reset}\r\n`);
    }

    clear(): void {
        this.emit('\u001b[2J\u001b[H');
    }

    private emit(text: string): void {
        if (!this.opened) {
            this.buffer.push(text);
            if (this.buffer.length > MAX_LINES) { this.buffer.shift(); }
            return;
        }
        this.writeEmitter.fire(text);
    }
}

export class CompileViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private readonly builder = new WebsiteMsiBuilder();
    private readonly lines: LogLine[] = [];
    private steps: BuildStep[] = BUILD_STEPS.map((s) => ({ ...s, state: 'pending' as BuildStepState }));
    private artifacts: BuildArtifacts = { folder: '' };
    private terminal?: vscode.Terminal;
    private pty?: MsiTerminal;
    /** Icon yang dipilih lewat dialog (path absolut). */
    private iconPath = '';

    constructor(
        private readonly ctx: vscode.ExtensionContext,
        private readonly tokens: MsiTokens,
        private readonly server: TokenServer,
    ) { }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
        };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
        view.onDidDispose(() => { this.view = undefined; });
    }

    async focus(): Promise<void> {
        await vscode.commands.executeCommand(`${COMPILE_VIEW}.focus`);
    }

    /** Buka website token di browser (server dinyalakan dulu bila perlu). */
    async openWebsite(): Promise<void> {
        const cfg = this.config();
        try {
            if (!this.server.running) { await this.server.start(cfg.tokenPort); }
        } catch (e) {
            vscode.window.showErrorMessage(`Website token tidak bisa dinyalakan: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        await vscode.env.openExternal(vscode.Uri.parse(this.server.website));
        this.post({ type: 'compileSite', url: this.server.website });
    }

    showTerminal(): void {
        this.ensureTerminal();
        this.terminal?.show(true);
    }

    /** Perintah Command Palette: pakai pengaturan sebagai isian awal, token diminta bila perlu. */
    async runFromCommand(): Promise<void> {
        await this.focus();
        const spec = this.specFromSettings();
        if (!spec.url) {
            this.note('Isi “Link website” dulu di view Compile MSI, lalu tekan ▶ Compile MSI.', false);
            this.post({ type: 'compileFocus', kind: 'url' });
            return;
        }
        let token = await this.ctx.secrets.get(SECRET_TOKEN);
        let status = token ? this.tokens.check(token) : undefined;
        if (!token || !status?.valid) {
            const input = await vscode.window.showInputBox({
                title: 'Token Compile MSI',
                prompt: 'Tempel token dari website token, lalu tekan Enter. Kuota: 5 compile per 5 jam.',
                placeHolder: 'SLM-XXXX-XXXX-XXXX',
                ignoreFocusOut: true,
                validateInput: (value) => (this.tokens.check(value).ok ? undefined : this.tokens.check(value).message),
            });
            if (!input) {
                await this.openWebsite();
                return;
            }
            token = input.trim();
            status = this.tokens.check(token);
            if (!status.ok) {
                const buka = await vscode.window.showWarningMessage(status.message, 'Buka Website Token');
                if (buka) { await this.openWebsite(); }
                return;
            }
            await this.ctx.secrets.store(SECRET_TOKEN, token);
        }
        await this.pushTokenState();
        await this.startBuild(token, spec);
    }

    /** Mulai build: validasi data, pakai satu percobaan token, lalu jalankan pipeline. */
    async startBuild(inputToken?: string, inputSpec?: Partial<AppSpec>): Promise<void> {
        if (this.builder.running) {
            this.note('Compile masih berjalan. Tunggu sampai selesai atau tekan ⏹ Stop.', false);
            return;
        }
        let spec: AppSpec;
        try {
            spec = normalizeSpec({ ...this.specFromSettings(), ...(inputSpec || {}), iconPath: this.iconPath || (inputSpec?.iconPath ?? '') });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.note(message, false);
            const field = /link/i.test(message) ? 'url' : /icon/i.test(message) ? 'icon' : /nama aplikasi/i.test(message) ? 'name' : 'url';
            this.post({ type: 'compileFocus', kind: field });
            return;
        }

        const token = String(inputToken ?? '').trim() || (await this.ctx.secrets.get(SECRET_TOKEN)) || '';
        if (!token) {
            this.note('Masukkan token dari website dulu. Klik “🌐 Website Token” untuk membuatnya.', false);
            this.post({ type: 'compileFocus', kind: 'token' });
            return;
        }
        const status = this.tokens.consume(token);
        if (!status.ok) {
            this.note(status.message, false);
            await this.pushTokenState(token);
            this.post({ type: 'compileFocus', kind: 'token' });
            return;
        }
        await this.ctx.secrets.store(SECRET_TOKEN, token);
        await this.pushTokenState(token);
        if (!status.valid) {
            this.note(`${status.message} Build tetap dijalankan karena percobaan ini sudah terpakai.`, true);
        }

        const options = this.buildOptions(spec);
        this.steps = BUILD_STEPS.map((s) => ({ ...s, state: 'pending' as BuildStepState }));
        this.lines.length = 0;
        this.artifacts = { folder: options.outDir };
        this.post({ type: 'compileClear' });
        this.post({ type: 'compileSteps', steps: this.steps });
        this.post({ type: 'compileBusy', running: true });
        this.setStateLine('compile dijalankan…');

        this.ensureTerminal();
        this.terminal?.show(true);
        this.append(`Compile MSI dimulai untuk “${spec.name}” → ${spec.url}`, 'ok');
        this.append(`Kuota komputer: sisa ${status.quota.left} dari ${status.quota.limit} percobaan.`, 'info');

        try {
            const result = await this.builder.run(options, (event) => this.onBuildEvent(event));
            this.artifacts = result.artifacts;
            if (result.ok) {
                this.setStateLine('selesai');
                this.post({ type: 'compileBusy', running: false });
                const buka = await vscode.window.showInformationMessage(
                    `Installer MSI siap: ${path.basename(result.artifacts.msi || '')} (${formatDuration(result.ms)}).`,
                    'Buka Folder Hasil',
                );
                if (buka) { await this.openResult(); }
            } else {
                this.setStateLine('gagal');
                this.post({ type: 'compileBusy', running: false });
            }
        } catch (e) {
            this.append(`Build berhenti: ${e instanceof Error ? e.message : String(e)}`, 'err');
            this.post({ type: 'compileBusy', running: false });
            this.setStateLine('gagal');
        } finally {
            await this.pushTokenState();
        }
    }

    private onBuildEvent(event: BuildEvent): void {
        if (event.type === 'step') {
            this.steps = this.steps.map((s) => (s.id === event.id ? { ...s, state: event.state, detail: event.detail } : s));
            this.post({ type: 'compileSteps', steps: this.steps });
            return;
        }
        if (event.type === 'progress') {
            this.post({ type: 'compileProgress', pct: event.pct });
            return;
        }
        if (event.type === 'done') {
            this.artifacts = event.artifacts;
            this.post({ type: 'compileDone', ok: event.ok, message: event.message, artifacts: event.artifacts, ms: event.ms });
            return;
        }
        this.append(event.text, event.kind || 'out');
    }

    private append(text: string, kind = 'out'): void {
        const clean = String(text ?? '');
        this.lines.push({ text: clean, kind });
        if (this.lines.length > MAX_LINES) { this.lines.splice(0, this.lines.length - MAX_LINES); }
        this.pty?.line(clean, kind);
        this.post({ type: 'compileLog', lines: [{ text: clean, kind }] });
    }

    private note(text: string, ok: boolean): void {
        this.post({ type: 'compileNote', ok, text });
    }

    private setStateLine(text: string): void {
        this.post({ type: 'compileStateLine', text });
    }

    private ensureTerminal(): void {
        if (this.terminal && this.terminal.exitStatus === undefined) { return; }
        this.pty = new MsiTerminal();
        this.terminal = vscode.window.createTerminal({
            name: 'Compile MSI',
            pty: this.pty,
            iconPath: new vscode.ThemeIcon('package'),
        });
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    private config() {
        const cfg = vscode.workspace.getConfiguration('dateSkunder');
        const num = (key: string, fallback: number) => Math.round(Number(cfg.get<number>(key) ?? fallback) || fallback);
        return {
            tokenPort: Math.min(65535, Math.max(1024, num('compile.tokenPort', DEFAULT_TOKEN_PORT))),
            attempts: Math.min(12, Math.max(1, num('compile.attempts', 5))),
            minutes: Math.min(10080, Math.max(5, num('compile.minutes', 1440))),
            cooldownHours: Math.min(48, Math.max(1, num('compile.cooldownHours', 5))),
            outputFolder: String(cfg.get<string>('compile.outputFolder') ?? '').trim(),
            timeoutMs: Math.max(0, num('compile.timeoutMinutes', 20) * 60000),
            autoWix: cfg.get<boolean>('compile.autoWix') ?? true,
            url: String(cfg.get<string>('compile.url') ?? '').trim(),
            appName: String(cfg.get<string>('compile.appName') ?? '').trim(),
            publisher: String(cfg.get<string>('compile.publisher') ?? '').trim(),
            scope: (String(cfg.get<string>('compile.scope') ?? 'user') === 'machine' ? 'machine' : 'user') as 'user' | 'machine',
            width: num('compile.windowWidth', 1280),
            height: num('compile.windowHeight', 800),
            appMode: cfg.get<boolean>('compile.appMode') ?? true,
            desktopShortcut: cfg.get<boolean>('compile.desktopShortcut') ?? true,
        };
    }

    private specFromSettings(): AppSpec {
        const cfg = this.config();
        return {
            url: cfg.url,
            name: cfg.appName || 'Aplikasi Website',
            version: '1.0.0',
            publisher: cfg.publisher || 'Date Skunder',
            description: '',
            folder: cfg.appName || 'Aplikasi Website',
            scope: cfg.scope,
            iconPath: this.iconPath,
            width: cfg.width,
            height: cfg.height,
            appMode: cfg.appMode,
            desktopShortcut: cfg.desktopShortcut,
        };
    }

    private outputDir(): string {
        const cfg = this.config();
        return cfg.outputFolder ? path.resolve(cfg.outputFolder) : path.join(this.ctx.extensionUri.fsPath, 'build', 'msi');
    }

    private buildOptions(spec: AppSpec): BuildOptions {
        const cfg = this.config();
        return {
            spec,
            outDir: this.outputDir(),
            wixCacheDir: path.join(this.ctx.globalStorageUri.fsPath, 'wix'),
            allowWixDownload: cfg.autoWix,
            defaultIconPath: path.join(this.ctx.extensionUri.fsPath, 'icon', 'logo.png'),
            timeoutMs: cfg.timeoutMs,
        };
    }

    private async pushTokenState(value?: string): Promise<void> {
        const stored = value ?? (await this.ctx.secrets.get(SECRET_TOKEN)) ?? '';
        const status: TokenStatus = this.tokens.check(stored);
        const cfg = this.config();
        this.post({
            type: 'compileToken',
            token: stored,
            status,
            attempts: cfg.attempts,
            minutes: cfg.minutes,
            cooldownHours: cfg.cooldownHours,
            active: this.tokens.list().length,
        });
    }

    private statePayload() {
        const cfg = this.config();
        return {
            type: 'compileState',
            running: this.builder.running,
            steps: this.steps,
            lines: this.lines.slice(-400),
            artifacts: this.artifacts,
            attempts: cfg.attempts,
            minutes: cfg.minutes,
            cooldownHours: cfg.cooldownHours,
            quota: this.tokens.quota(),
            server: this.server.info(),
            spec: this.specFromSettings(),
            iconName: this.iconPath ? path.basename(this.iconPath) : '',
            plan: {
                outDir: this.outputDir(),
                autoWix: cfg.autoWix,
                timeoutMinutes: Math.round(cfg.timeoutMs / 60000),
            },
        };
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready':
                this.post(this.statePayload());
                await this.pushTokenState();
                break;
            case 'openSite':
                await this.openWebsite();
                break;
            case 'verify': {
                const token = String(msg.token ?? '').trim();
                const status = this.tokens.check(token);
                if (status.ok) {
                    await this.ctx.secrets.store(SECRET_TOKEN, token);
                    this.note(`Token diterima — sisa ${status.quota.left} dari ${status.quota.limit} kuota komputer.`, true);
                } else {
                    this.note(status.message, false);
                }
                await this.pushTokenState(token);
                break;
            }
            case 'revoke': {
                const token = String(msg.token ?? '').trim() || (await this.ctx.secrets.get(SECRET_TOKEN)) || '';
                const removed = this.tokens.revoke(token);
                if (token) { await this.ctx.secrets.delete(SECRET_TOKEN); }
                this.note(removed ? 'Token dibatalkan. Buat token baru di website bila ingin compile lagi.' : 'Tidak ada token tersimpan untuk dibatalkan.', removed);
                await this.pushTokenState('');
                break;
            }
            case 'pickIcon':
                await this.pickIcon();
                break;
            case 'clearIcon':
                this.iconPath = '';
                this.post({ type: 'compileIcon', path: '', name: '', dataUrl: '', size: 0 });
                break;
            case 'compile':
                await this.startBuild(String(msg.token ?? '').trim(), msg.spec as Partial<AppSpec>);
                break;
            case 'cancel':
                if (this.builder.cancel()) {
                    this.note('Permintaan berhenti dikirim — proses build dihentikan.', true);
                } else {
                    this.note('Tidak ada build yang berjalan.', false);
                }
                break;
            case 'clear':
                this.lines.length = 0;
                this.pty?.clear();
                this.post({ type: 'compileClear' });
                break;
            case 'copy':
                await vscode.env.clipboard.writeText(String(msg.text ?? ''));
                this.note('Log disalin ke papan klip.', true);
                break;
            case 'showTerminal':
                this.showTerminal();
                break;
            case 'openResult':
                await this.openResult();
                break;
            case 'command':
                await this.runTerminalCommand(String(msg.line ?? '').trim());
                break;
        }
    }

    /** Dialog pilih icon; PNG dikirim sebagai data URL untuk pratinjau. */
    private async pickIcon(): Promise<void> {
        const picked = await vscode.window.showOpenDialog({
            title: 'Pilih icon aplikasi (.ico atau .png)',
            canSelectMany: false,
            openLabel: 'Pakai icon',
            filters: { 'Icon aplikasi': ['ico', 'png'] },
        });
        const file = picked?.[0]?.fsPath;
        if (!file) { return; }
        const ext = path.extname(file).toLowerCase();
        if (ext !== '.ico' && ext !== '.png') {
            this.note('Icon harus berkas .ico atau .png.', false);
            return;
        }
        let size = 0;
        try {
            size = fs.statSync(file).size;
        } catch {
            this.note('Berkas icon tidak bisa dibaca.', false);
            return;
        }
        if (size > MAX_ICON_BYTES) {
            this.note('Ukuran icon maksimal 2 MB. Perkecil dulu berkasnya.', false);
            return;
        }
        let dataUrl = '';
        if (ext === '.png') {
            try {
                dataUrl = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
            } catch { /* pratinjau dilewati */ }
        }
        this.iconPath = file;
        this.post({ type: 'compileIcon', path: file, name: path.basename(file), dataUrl, size });
        this.note(`Icon dipakai: ${path.basename(file)}${ext === '.png' ? ' (PNG diubah ke ICO saat build)' : ''}.`, true);
    }

    /** Mini terminal di dalam view: perintah teks supaya tidak perlu berpindah panel. */
    private async runTerminalCommand(line: string): Promise<void> {
        const [cmdRaw, ...rest] = line.split(/\s+/);
        const cmd = (cmdRaw || '').toLowerCase();
        const arg = rest.join(' ').trim();
        switch (cmd) {
            case '':
                break;
            case 'help':
                this.append('Perintah: help · status · compile · token <token> · url <link> · site · open · clear · stop', 'info');
                this.append('  compile  mulai build MSI (memakai 1 percobaan kuota)', 'info');
                this.append('  url      isi link website, mis. url https://contoh.com', 'info');
                this.append('  token    tempel token dari website, mis. token SLM-ABCD-EFGH-JKLM', 'info');
                this.append('  open     buka folder hasil build', 'info');
                break;
            case 'status': {
                const stored = (await this.ctx.secrets.get(SECRET_TOKEN)) || '';
                const status = this.tokens.check(stored);
                const quota = status.quota;
                this.append(`build: ${this.builder.running ? 'berjalan' : 'diam'} · token: ${stored ? 'tersimpan' : 'belum ada'}`, 'info');
                this.append(`kuota: ${quota.left}/${quota.limit}${quota.retryAfterMs ? ` · blokir ${Math.ceil(quota.retryAfterMs / 60000)} menit lagi` : ''}`, 'info');
                this.append(`website token: ${this.server.running ? this.server.website : 'server belum menyala'}`, 'info');
                this.append(`hasil: ${this.outputDir()}`, 'info');
                break;
            }
            case 'compile':
            case 'build':
                await this.startBuild();
                break;
            case 'url':
                if (!arg) {
                    this.append(`Link saat ini: ${this.config().url || '(belum diisi)'}`, 'info');
                    break;
                }
                this.post({ type: 'compileField', field: 'url', value: arg });
                this.append(`Link website diisi: ${arg}`, 'ok');
                break;
            case 'token': {
                if (!arg) {
                    const stored = (await this.ctx.secrets.get(SECRET_TOKEN)) || '';
                    const status = this.tokens.check(stored);
                    this.append(stored ? `Token tersimpan · sisa kuota ${status.quota.left}/${status.quota.limit}.` : 'Belum ada token. Jalankan: token SLM-XXXX-XXXX-XXXX', 'info');
                    break;
                }
                const status = this.tokens.check(arg);
                if (status.ok) {
                    await this.ctx.secrets.store(SECRET_TOKEN, arg);
                    this.append(`Token diterima — sisa kuota ${status.quota.left} dari ${status.quota.limit}.`, 'ok');
                } else {
                    this.append(status.message, 'err');
                }
                await this.pushTokenState(status.ok ? arg : undefined);
                break;
            }
            case 'site':
            case 'website':
                await this.openWebsite();
                break;
            case 'open':
            case 'result':
                await this.openResult();
                break;
            case 'clear':
                this.lines.length = 0;
                this.pty?.clear();
                this.post({ type: 'compileClear' });
                break;
            case 'stop':
            case 'cancel':
                this.append(this.builder.cancel() ? 'Build dihentikan.' : 'Tidak ada build yang berjalan.', 'info');
                break;
            default:
                this.append(`Perintah “${cmd}” tidak dikenal. Ketik help.`, 'err');
        }
    }

    private async openResult(): Promise<void> {
        const folder = this.artifacts.folder || this.outputDir();
        try {
            fs.mkdirSync(folder, { recursive: true });
        } catch { /* folder hasil mungkin belum bisa dibuat */ }
        const msi = this.artifacts.msi;
        if (msi && fs.existsSync(msi)) {
            await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(msi));
            return;
        }
        await vscode.env.openExternal(vscode.Uri.file(folder));
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'compile.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'compile.js'));
        const n = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
        return /* html */ `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
<link href="${css}" rel="stylesheet">
<title>Compile MSI</title>
</head>
<body class="cp-body">
<div class="cp-root">
    <div class="cp-head">
        <strong>⚙️ Compile MSI</strong>
        <span id="cp-state" class="cp-state">memuat…</span>
    </div>
    <div id="cp-note" class="cp-note" hidden></div>

    <section class="cp-card">
        <div class="cp-title">🌐 Website → aplikasi</div>
        <div class="cp-sub">Tempel link website, atur identitas aplikasi seperti di Tauri, lalu compile jadi installer <b>.msi</b>.</div>
        <label class="cp-label" for="cp-url">Link website</label>
        <input id="cp-url" class="cp-input" type="text" spellcheck="false" autocomplete="off" placeholder="https://contoh.com">
        <div class="cp-grid2">
            <div>
                <label class="cp-label" for="cp-name">Nama aplikasi</label>
                <input id="cp-name" class="cp-input" type="text" spellcheck="false" placeholder="Aplikasi Saya">
            </div>
            <div>
                <label class="cp-label" for="cp-publisher">Nama pengembang</label>
                <input id="cp-publisher" class="cp-input" type="text" spellcheck="false" placeholder="Nama Anda / perusahaan">
            </div>
        </div>
        <div class="cp-grid2">
            <div>
                <label class="cp-label" for="cp-version">Versi</label>
                <input id="cp-version" class="cp-input" type="text" spellcheck="false" placeholder="1.0.0">
            </div>
            <div>
                <label class="cp-label" for="cp-folder">Folder instalasi</label>
                <input id="cp-folder" class="cp-input" type="text" spellcheck="false" placeholder="Aplikasi Saya">
            </div>
        </div>
        <label class="cp-label" for="cp-desc">Deskripsi (opsional)</label>
        <input id="cp-desc" class="cp-input" type="text" spellcheck="false" placeholder="Aplikasi desktop untuk …">
        <div class="cp-grid2">
            <div>
                <label class="cp-label" for="cp-scope">Pemasangan</label>
                <select id="cp-scope" class="cp-input">
                    <option value="user">Per pengguna (tanpa admin)</option>
                    <option value="machine">Semua pengguna (butuh admin)</option>
                </select>
            </div>
            <div>
                <label class="cp-label" for="cp-width">Ukuran jendela</label>
                <div class="cp-size">
                    <input id="cp-width" class="cp-input" type="number" min="480" max="3840" step="10">
                    <span>×</span>
                    <input id="cp-height" class="cp-input" type="number" min="320" max="2160" step="10">
                </div>
            </div>
        </div>
        <div class="cp-icon-row">
            <img id="cp-icon-preview" class="cp-icon-preview" alt="" hidden>
            <div class="cp-icon-main">
                <div id="cp-icon-name" class="cp-icon-name">icon bawaan (logo Date Skunder)</div>
                <div class="cp-row">
                    <button id="cp-icon-pick" class="cp-btn" type="button">🖼 Pilih icon…</button>
                    <button id="cp-icon-clear" class="cp-btn" type="button">Hapus</button>
                </div>
            </div>
        </div>
        <div class="cp-checks">
            <label class="cp-check"><input id="cp-appmode" type="checkbox"> Jendela aplikasi (Edge tanpa address bar)</label>
            <label class="cp-check"><input id="cp-desktop" type="checkbox"> Shortcut di Desktop</label>
        </div>
    </section>

    <section class="cp-card">
        <div class="cp-title">🔑 Token akses</div>
        <div class="cp-sub">Kuota <b>5 compile per 5 jam</b> untuk komputer ini. Setelah habis, compile <b>dan</b> pembuatan token baru diblokir sampai 5 jam berikutnya.</div>
        <input id="cp-token" class="cp-input" type="text" spellcheck="false" autocomplete="off" placeholder="SLM-XXXX-XXXX-XXXX">
        <div class="cp-row">
            <button id="cp-verify" class="cp-btn primary" type="button">✓ Verifikasi</button>
            <button id="cp-site" class="cp-btn" type="button">🌐 Website Token</button>
            <button id="cp-revoke" class="cp-btn danger" type="button" title="Batalkan token tersimpan">🗑</button>
        </div>
        <div class="cp-token-meta">
            <span id="cp-dots" class="cp-dots" title="Sisa kuota compile"></span>
            <span id="cp-token-note" class="cp-token-note">Tempel token dari website dulu.</span>
        </div>
        <div id="cp-cooldown" class="cp-cooldown" hidden></div>
    </section>

    <section class="cp-card">
        <div class="cp-title">🧱 Build installer</div>
        <div id="cp-plan" class="cp-sub">—</div>
        <div class="cp-row">
            <button id="cp-run" class="cp-btn primary" type="button">▶ Compile MSI</button>
            <button id="cp-stop" class="cp-btn danger" type="button">⏹ Stop</button>
            <button id="cp-result" class="cp-btn" type="button">📂 Hasil</button>
            <button id="cp-term-open" class="cp-btn" type="button">🖥 Terminal</button>
        </div>
        <div class="cp-progress"><div id="cp-bar"></div></div>
        <div id="cp-steps" class="cp-steps"></div>
    </section>

    <section class="cp-term-wrap">
        <div class="cp-term-head">
            <span class="cp-term-title">▮ Compile Terminal</span>
            <span id="cp-term-state" class="cp-term-state">siap</span>
            <button id="cp-clear" class="cp-term-btn" type="button" title="Bersihkan layar">🧹</button>
            <button id="cp-copy" class="cp-term-btn" type="button" title="Salin seluruh log">📋</button>
        </div>
        <pre id="cp-term" class="cp-term" tabindex="0"></pre>
        <div class="cp-prompt">
            <span class="cp-ps1">dsk&gt;</span>
            <input id="cp-cmd" class="cp-cmd" type="text" spellcheck="false" autocomplete="off" placeholder="help · compile · status · url &lt;link&gt; · token &lt;token&gt; · site · open">
        </div>
    </section>
</div>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }
}

/** Daftarkan view Compile MSI + server token + perintahnya. */
export function registerCompileView(context: vscode.ExtensionContext): { provider: CompileViewProvider; server: TokenServer } {
    const store: TokenStore = {
        get: <T>(key: string, fallback: T) => context.globalState.get<T>(key, fallback) ?? fallback,
        update: async (key, value) => {
            await context.globalState.update(key, value);
        },
    };
    const cfg = () => vscode.workspace.getConfiguration('dateSkunder');
    const tokens = new MsiTokens(store, () => ({
        attempts: Math.min(12, Math.max(1, Math.round(Number(cfg().get<number>('compile.attempts') ?? 5) || 5))),
        minutes: Math.min(10080, Math.max(5, Math.round(Number(cfg().get<number>('compile.minutes') ?? 1440) || 1440))),
        cooldownHours: Math.min(48, Math.max(1, Math.round(Number(cfg().get<number>('compile.cooldownHours') ?? 5) || 5))),
    }));

    let version = '';
    try { version = String(JSON.parse(fs.readFileSync(path.join(context.extensionUri.fsPath, 'package.json'), 'utf8')).version ?? ''); } catch { /* paket tanpa package.json */ }

    const server = new TokenServer({
        apiRoot: path.join(context.extensionUri.fsPath, 'api'),
        tokens,
        product: 'Date Skunder',
        version,
        log: (line) => console.log(`[compile-token] ${line}`),
    });

    const provider = new CompileViewProvider(context, tokens, server);
    const port = () => Math.min(65535, Math.max(1024, Math.round(Number(cfg().get<number>('compile.tokenPort') ?? DEFAULT_TOKEN_PORT) || DEFAULT_TOKEN_PORT)));

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(COMPILE_VIEW, provider, { webviewOptions: { retainContextWhenHidden: true } }),
        server,
        vscode.commands.registerCommand('date-skunder.compile.open', async () => { await provider.focus(); }),
        vscode.commands.registerCommand('date-skunder.compile.run', async () => { await provider.runFromCommand(); }),
        vscode.commands.registerCommand('date-skunder.compile.token', async () => { await provider.openWebsite(); }),
        vscode.commands.registerCommand('date-skunder.compile.terminal', () => { provider.showTerminal(); }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('dateSkunder.compile.tokenPort')) {
                void server.stop().then(() => server.start(port())).catch(() => undefined);
            }
        }),
    );

    void server.start(port()).catch((e) => {
        console.warn(`[compile-token] gagal menyala: ${e instanceof Error ? e.message : String(e)}`);
    });

    return { provider, server };
}
