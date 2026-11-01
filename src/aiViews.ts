import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    LlamaServer, ModelFile, ScanProgress, ServerStatus, chatStream, defaultModelRoots, formatBytes,
    listStorageRoots, osFolder, osLabel, resolveServerBinary, scanGgufModels, sortModels, ChatHandle, ChatMessage, httpRequest,
} from './llamaCore';
import { globalAnalysisStore, buildStatsContext, buildSystemPrompt, tidyModelReply, AI_PERSONAS } from './analysisStore';
import { VoiceCatalog, VoiceService } from './voice';
import { buildSpiderWebConfig } from './petSkins';
import { appendChatLog } from './chatLog';
import type { WorkbookResult } from './analysis';

const CHAT_VIEW = 'dateSkunder.chatView';
const LLAMA_VIEW = 'dateSkunder.llamaView';
const SELECTED_MODEL_KEY = 'dateSkunder.selectedModel';
const MODELS_CACHE_KEY = 'dateSkunder.ggufCache';

const DEEP_SCAN_REUSE_MS = 5 * 60 * 1000;
const QUICK_SCAN_MS = 4000;
const WATCH_INTERVAL_MS = 90000;

export interface AiConfig {
    port: number;
    contextSize: number;
    gpuLayers: number;
    threads: number;
    extraArgs: string[];
    modelPaths: string[];
    scanDepth: number;
    scanTimeoutSeconds: number;
    autoScan: boolean;
    temperature: number;
    maxTokens: number;
    autoStart: boolean;
    includeStats: boolean;
    systemExtra: string;
    /** Sifat Chat AI: id dari AI_PERSONAS (netral/ringkas/ramah/tegas/analitis/guru). */
    persona: string;
    /** Sifat tambahan bebas (kustom) yang ditempel setelah sifat bawaan. */
    personaCustom: string;
    spiderMaxSteps: number;
    spiderAllowActions: boolean;
    voice: VoiceConfig;
}

export interface VoiceConfig {
    enabled: boolean;
    sttEngine: 'auto' | 'system' | 'web' | 'off';
    ttsEngine: 'auto' | 'webview' | 'system' | 'off';
    autoSend: boolean;
    autoListen: boolean;
    listenSeconds: number;
    language: string;
    gender: 'female' | 'male' | 'any';
    voiceName: string;
    rate: number;
    pitch: number;
    volume: number;
}

function readVoiceConfig(): VoiceConfig {
    const c = vscode.workspace.getConfiguration('dateSkunder');
    const gender = String(c.get<string>('voice.gender') ?? 'female').toLowerCase();
    const stt = String(c.get<string>('voice.sttEngine') ?? 'auto').toLowerCase();
    const tts = String(c.get<string>('voice.ttsEngine') ?? 'auto').toLowerCase();
    return {
        enabled: c.get<boolean>('voice.enabled') ?? true,
        sttEngine: (['auto', 'system', 'web', 'off'].includes(stt) ? stt : 'auto') as VoiceConfig['sttEngine'],
        ttsEngine: (['auto', 'webview', 'system', 'off'].includes(tts) ? tts : 'auto') as VoiceConfig['ttsEngine'],
        autoSend: c.get<boolean>('voice.autoSend') ?? true,
        autoListen: c.get<boolean>('voice.autoListen') ?? false,
        listenSeconds: Math.min(60, Math.max(3, Math.round(c.get<number>('voice.listenSeconds') ?? 12))),
        language: String(c.get<string>('voice.language') ?? 'id-ID'),
        gender: (gender === 'male' || gender === 'any' ? gender : 'female') as VoiceConfig['gender'],
        voiceName: String(c.get<string>('voice.voiceName') ?? ''),
        rate: c.get<number>('voice.rate') ?? 1,
        pitch: c.get<number>('voice.pitch') ?? 1,
        volume: c.get<number>('voice.volume') ?? 1,
    };
}

/** Tulis satu nilai pengaturan suara dari UI (mis. pilihan suara) ke pengaturan global. */
async function updateVoiceSetting(key: string, value: unknown): Promise<void> {
    try {
        await vscode.workspace.getConfiguration('dateSkunder').update(`voice.${key}`, value, vscode.ConfigurationTarget.Global);
    } catch { /* pengaturan READ-ONLY (mis. settings.json terkelola) → abaikan */ }
}

/** Tulis satu nilai pengaturan AI (mis. sifat/persona) dari UI ke pengaturan global. */
async function updateAiSetting(key: string, value: unknown): Promise<void> {
    try {
        await vscode.workspace.getConfiguration('dateSkunder').update(`ai.${key}`, value, vscode.ConfigurationTarget.Global);
    } catch { /* pengaturan READ-ONLY (mis. settings.json terkelola) → abaikan */ }
}

function readConfig(): AiConfig {
    const c = vscode.workspace.getConfiguration('dateSkunder');
    const extra = (c.get<string>('llama.extraArgs') ?? '').trim();
    return {
        port: c.get<number>('llama.port') ?? 8081,
        contextSize: c.get<number>('llama.contextSize') ?? 4096,
        gpuLayers: c.get<number>('llama.gpuLayers') ?? 0,
        threads: c.get<number>('llama.threads') ?? 0,
        extraArgs: extra ? extra.split(/\s+/).filter(Boolean) : [],
        modelPaths: c.get<string[]>('llama.modelPaths') ?? [],
        scanDepth: c.get<number>('llama.scanDepth') ?? 4,
        scanTimeoutSeconds: c.get<number>('llama.scanTimeoutSeconds') ?? 90,
        autoScan: c.get<boolean>('llama.autoScan') ?? true,
        temperature: c.get<number>('ai.temperature') ?? 0.2,
        maxTokens: c.get<number>('ai.maxTokens') ?? 0,
        autoStart: c.get<boolean>('ai.autoStartServer') ?? true,
        includeStats: c.get<boolean>('ai.includeStats') ?? true,
        systemExtra: c.get<string>('ai.systemExtra') ?? '',
        persona: String(c.get<string>('ai.persona') ?? 'netral'),
        personaCustom: String(c.get<string>('ai.personaCustom') ?? ''),
        spiderMaxSteps: Math.min(12, Math.max(3, Math.round(c.get<number>('spider.maxSteps') ?? 8))),
        spiderAllowActions: c.get<boolean>('spider.allowActions') ?? true,
        voice: readVoiceConfig(),
    };
}

function nonce(): string {
    return Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
}

/** Path panjang dipotong agar rapi dipakai di notifikasi progres. */
function shortenPath(p: string, max = 52): string {
    return p.length > max ? `…${p.slice(-max)}` : p;
}

/** Perekatin bersama: penyimpanan analisis, proses server, dan daftar model .gguf. */
export class AiHub {
    readonly store = globalAnalysisStore;
    readonly server: LlamaServer;
    /** Layanan suara (STT/TTS sistem) yang dipakai view Chat AI. */
    readonly voice = new VoiceService();

    private chat?: ChatViewProvider;
    private llama?: LlamaViewProvider;
    private models: ModelFile[] = [];
    private modelsScannedAt = 0;
    private lastDeepScanAt = 0;
    private scanning = false;
    private scanAbort?: { cancelled: boolean };
    private progress?: ScanProgress & { phase: 'ringkas' | 'penuh' };
    private reportedFound = 0;

    constructor(private ctx: vscode.ExtensionContext) {
        this.server = new LlamaServer({
            extensionPath: ctx.extensionUri.fsPath,
            onLog: (line) => this.llama?.appendLog(line),
            onStatus: () => {
                this.llama?.refresh();
                this.chat?.postServerStatus();
            },
        });
        // Hasil pencarian sesi sebelumnya dipakai lebih dulu → daftar langsung terisi tanpa menyentuh disk.
        const cached = ctx.globalState.get<{ at: number; list: ModelFile[] }>(MODELS_CACHE_KEY);
        if (cached?.list?.length) {
            this.models = sortModels(cached.list.filter((m) => !!m?.path));
            this.modelsScannedAt = cached.at ?? 0;
            this.lastDeepScanAt = cached.at ?? 0;
        }
    }

    attach(chat: ChatViewProvider, llama: LlamaViewProvider): void {
        this.chat = chat;
        this.llama = llama;
    }

    config(): AiConfig { return readConfig(); }

    get extensionUri(): vscode.Uri { return this.ctx.extensionUri; }

    osInfo(): { platform: NodeJS.Platform; folder: string | null; label: string; binary?: string; candidates: string[] } {
        const info = resolveServerBinary(this.ctx.extensionUri.fsPath);
        return { platform: process.platform, folder: osFolder(process.platform), label: osLabel(process.platform), binary: info.chosen, candidates: info.candidates };
    }

    /** Daftar model yang sudah diketahui (cache/pemindaian terakhir) — tanpa menyentuh disk. */
    scanModels(): ModelFile[] { return this.models; }

    get scanningNow(): boolean { return this.scanning; }

    /** Kemajuan pemindaian terakhir (dipakai view Chat dan notifikasi progres). */
    get scanProgress(): (ScanProgress & { phase: 'ringkas' | 'penuh' }) | undefined { return this.progress; }

    modelsPayload(): { list: { path: string; name: string; size: string; multipart: boolean }[]; scannedAt: number; scanning: boolean } {
        return {
            list: this.models.map((m) => ({ path: m.path, name: m.name, size: formatBytes(m.sizeBytes), multipart: m.multipart })),
            scannedAt: this.modelsScannedAt,
            scanning: this.scanning,
        };
    }
    async refreshModels(opts: { deep?: boolean; manual?: boolean; quiet?: boolean } = {}): Promise<ModelFile[]> {
        if (this.scanning) { return this.models; }
        const cfg = this.config();
        const wantDeep = (opts.deep ?? true) && (opts.manual || cfg.autoScan);
        const deep = wantDeep && (opts.manual || this.models.length === 0 || Date.now() - this.lastDeepScanAt > DEEP_SCAN_REUSE_MS);
        const before = this.pathKey();

        this.scanning = true;
        this.reportedFound = 0;
        const abortFlag = { cancelled: false };
        this.scanAbort = abortFlag;
        try {
            if (!opts.quiet) { this.chat?.postScanStart('ringkas'); }
            const quick = await scanGgufModels(await this.searchRoots(false), {
                maxDepth: Math.min(3, Math.max(1, cfg.scanDepth)),
                timeoutMs: QUICK_SCAN_MS,
                concurrency: 4,
                isCancelled: () => abortFlag.cancelled,
                onProgress: (p) => this.reportProgress(p, 'ringkas', opts.quiet),
            });
            this.setModels(this.mergeModels(quick));
            if (!opts.quiet && !deep) { this.postModels('ringkas', true); }

            if (deep && !abortFlag.cancelled) {
                if (!opts.quiet) { this.chat?.postScanStart('penuh'); }
                const full = await scanGgufModels(await this.searchRoots(true), {
                    maxDepth: Math.max(2, cfg.scanDepth),
                    timeoutMs: Math.max(10, cfg.scanTimeoutSeconds) * 1000,
                    concurrency: 8,
                    isCancelled: () => abortFlag.cancelled,
                    onProgress: (p) => this.reportProgress(p, 'penuh', opts.quiet),
                });
                this.setModels(this.mergeModels(full));
                if (!abortFlag.cancelled) { this.lastDeepScanAt = Date.now(); }
            }
        } finally {
            this.scanning = false;
            this.scanAbort = undefined;
        }

        if (opts.quiet) {
            if (this.pathKey() !== before) { this.postModels('ringkas', true, true); }
        } else {
            this.postModels(deep ? 'penuh' : 'ringkas', true);
        }
        return this.models;
    }

    /** Batalkan pemindaian yang berjalan; berkas yang sudah ditemukan tetap dipakai. */
    cancelScan(): void {
        if (this.scanAbort) { this.scanAbort.cancelled = true; }
    }

    /** Pencarian otomatis saat ekstensi aktif (latar belakang, tidak memblokir UI). */
    autoScan(): void {
        void this.refreshModels().catch(() => { /* pencarian latar belakang tidak fatal */ });
    }

    /** Pemindaian manual dengan notifikasi progres dan tombol batal. */
    async scanWithProgress(title = 'Mencari berkas .gguf di penyimpanan laptop ini…'): Promise<ModelFile[]> {
        return vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: true },
            async (progress, cancellation) => {
                cancellation.onCancellationRequested(() => this.cancelScan());
                const timer = setInterval(() => {
                    const p = this.progress;
                    if (!p) { return; }
                    progress.report({ message: `${p.phase === 'penuh' ? 'seluruh drive' : 'folder umum'} · ${p.dirs.toLocaleString('id-ID')} folder · ${p.found} model${p.root ? ` · ${shortenPath(p.root)}` : ''}` });
                }, 400);
                try {
                    return await this.refreshModels({ deep: true, manual: true });
                } finally {
                    clearInterval(timer);
                }
            },
        );
    }

    /** Akar pencarian: pengaturan pengguna + workspace + folder umum model + (tahap penuh) semua drive. */
    private async searchRoots(deep: boolean): Promise<string[]> {
        const cfg = this.config();
        const roots = [
            ...cfg.modelPaths.map((p) => p.replace(/^~(?=$|[\\/])/, os.homedir())),
            ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
            this.ctx.extensionUri.fsPath,
            ...defaultModelRoots(),
        ];
        const selected = this.selectedModel;
        if (selected) { roots.push(path.dirname(selected)); }
        if (deep) { roots.push(...await listStorageRoots()); }
        return [...new Set(roots.filter(Boolean))];
    }

    /** Gabungkan hasil baru dengan daftar lama (entri lama hanya dipertahankan bila berkasnya masih ada). */
    private mergeModels(fresh: ModelFile[]): ModelFile[] {
        const byKey = new Map<string, ModelFile>();
        for (const m of fresh) { byKey.set(m.path.toLowerCase(), m); }
        for (const old of this.models) {
            const key = old.path.toLowerCase();
            if (byKey.has(key)) { continue; }
            if (fs.existsSync(old.path)) { byKey.set(key, old); }
        }
        return sortModels([...byKey.values()]);
    }

    private setModels(list: ModelFile[]): void {
        this.models = list;
        this.modelsScannedAt = Date.now();
        void this.ctx.globalState.update(MODELS_CACHE_KEY, { at: this.modelsScannedAt, list: this.models });
    }

    private pathKey(): string {
        return this.models.map((m) => m.path.toLowerCase()).join('|');
    }

    /** Laporan kemajuan: daftar ikut diperbarui begitu ada temuan baru pada tahap penuh. */
    private reportProgress(p: ScanProgress, phase: 'ringkas' | 'penuh', quiet?: boolean): void {
        this.progress = { ...p, phase };
        if (quiet) { return; }
        this.chat?.postScanProgress(this.progress);
        if (phase === 'penuh' && p.found > this.reportedFound) {
            this.reportedFound = p.found;
            this.postModels('penuh', false);
        }
    }

    private postModels(phase: 'ringkas' | 'penuh', done: boolean, quiet = false): void {
        this.chat?.postModels({ ...this.modelsPayload(), phase, done, quiet, progress: this.progress });
    }

    get selectedModel(): string | undefined {
        const saved = this.ctx.workspaceState.get<string>(SELECTED_MODEL_KEY);
        if (saved && fs.existsSync(saved)) { return saved; }
        const list = this.models;
        return list.length ? list[0].path : undefined;
    }

    async setSelectedModel(modelPath: string): Promise<void> {
        await this.ctx.workspaceState.update(SELECTED_MODEL_KEY, modelPath);
    }

    async startServer(modelPath?: string): Promise<ServerStatus> {
        const cfg = this.config();
        // Port yang sudah dilayani server lain (mis. dijalankan di terminal) tidak dijalankan dua kali.
        if (!this.server.running) {
            const hidup = await httpRequest(cfg.port, '/health', { timeoutMs: 1200 })
                .then((r) => r.status === 200)
                .catch(() => false);
            if (hidup) {
                this.server.markExternal(true);
                this.llama?.refresh();
                return this.server.status;
            }
        }
        const model = modelPath ?? this.selectedModel;
        if (!model) { throw new Error('Belum ada berkas .gguf yang terdeteksi. Pencarian otomatis masih berjalan — tunggu sebentar, tekan ⟳ untuk memindai ulang, atau tambahkan folder model pada pengaturan dateSkunder.llama.modelPaths.'); }
        const status = await this.server.start({
            modelPath: model,
            port: cfg.port,
            contextSize: cfg.contextSize,
            gpuLayers: cfg.gpuLayers,
            threads: cfg.threads,
            extraArgs: cfg.extraArgs,
            startupTimeoutMs: 240000,
        });
        await this.setSelectedModel(model);
        return status;
    }

    async stopServer(): Promise<ServerStatus> { return this.server.stop(); }

    /** llama-server siap dipakai — termasuk proses yang dijalankan di terminal. */
    serverAvailable(): boolean { return this.server.available; }

    /** Model benar-benar siap menjawab (bukan sekadar “sedang memuat”). */
    serverReady(): boolean { return this.server.ready; }

    /** Dipanggil setelah analisis selesai agar Chat AI selalu memakai statistik terbaru. */
    recordAnalysis(uri: vscode.Uri, label: string, result: WorkbookResult): void {
        globalAnalysisStore.set(uri.toString(), result, label);
        this.chat?.postContextList(uri.toString());
    }

    // ── daftar panel analisis terbuka (dipakai menyiarkan ganti kostum pet) ──
    private panels = new Set<vscode.WebviewPanel>();

    /** Panel analisis mendaftar supaya perubahan konfigurasi (mis. kostum pet) bisa disiarkan ke halaman. */
    attachPanel(panel: vscode.WebviewPanel): void {
        this.panels.add(panel);
    }

    detachPanel(panel: vscode.WebviewPanel): void {
        this.panels.delete(panel);
    }

    /** Kirim ulang konfigurasi spider (termasuk kostum yang dipakai) ke semua halaman analisis yang terbuka. */
    broadcastSpiderConfig(): void {
        const payload = buildSpiderWebConfig(this.ctx);
        for (const panel of this.panels) {
            try { void panel.webview.postMessage(payload); } catch { /* panel sudah dibuang */ }
        }
    }

    /**
     * Kirim perintah ke pet (dipakai shortcut/Command Palette: jalankan semua fitur, cek semua kontrol,
     * nyalakan/matikan nonstop, hentikan pekerjaan). Pet merespons hanya bila halamannya terlihat.
     * Mengembalikan false bila belum ada halaman analisis yang terbuka.
     */
    spiderCommand(cmd: 'tour' | 'check' | 'nonstop' | 'stop'): boolean {
        if (!this.panels.size) { return false; }
        for (const panel of this.panels) {
            try { void panel.webview.postMessage({ type: 'spiderCommand', cmd }); } catch { /* panel sudah dibuang */ }
        }
        return true;
    }

    // ── jembatan ke view Pet Skin (misi) ────────────────────────────────────
    private petView?: { refresh(): void };

    /** Dipanggil sekali oleh registerPetView: hub perlu kenal view supaya progres misi bisa memicunya. */
    bindPetView(provider: { refresh(): void }): void {
        this.petView = provider;
    }

    /** Segarkan tampilan Pet Skin (dipanggil setelah progres misi berubah). */
    refreshPetView(): void {
        this.petView?.refresh();
    }
}

// ── view: Chat AI (khusus percakapan) ───────────────────────────────────────

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private history: ChatMessage[] = [];
    private stream?: ChatHandle;
    private contextId?: string;
    private statsEnabled = true;
    private summary = '';                 // ringkasan percakapan lama → panjang percakapan tidak dibatasi
    private summarizedUntil = 0;          // jumlah pesan awal yang sudah masuk ringkasan
    private streamSeq = 0;                // penanda aliran: delta dari aliran lama diabaikan
    private summarizing = false;          // sedang meringkas? (hindari tumpukan permintaan)
    private watchTimer?: NodeJS.Timeout;

    constructor(private hub: AiHub) { }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.hub.extensionUri, 'media')] };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
        view.onDidChangeVisibility(() => { if (view.visible) { this.startWatch(); } else { this.stopWatch(); } });
        view.onDidDispose(() => { this.stopWatch(); this.view = undefined; });
        if (view.visible) { this.startWatch(); }
    }

    /** Intip folder umum secara berkala selama view terbuka → model yang baru diunduh ikut terdeteksi sendiri. */
    private startWatch(): void {
        if (this.watchTimer) { return; }
        this.watchTimer = setInterval(() => {
            void this.hub.refreshModels({ deep: false, quiet: true }).catch(() => { /* intip berkala tidak fatal */ });
        }, WATCH_INTERVAL_MS);
        if (typeof this.watchTimer.unref === 'function') { this.watchTimer.unref(); }
    }

    private stopWatch(): void {
        if (this.watchTimer) { clearInterval(this.watchTimer); this.watchTimer = undefined; }
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.hub.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'ai.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chat.js'));
        const n = nonce();
        return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
<link href="${css}" rel="stylesheet">
<title>Chat AI</title>
</head>
<body class="ai-body">
<div class="ai-root">
    <div class="ai-head">
        <div class="ai-head-row">
            <strong id="title">🦙 Chat AI</strong>
            <span id="dot" class="ai-dot off" title="status server"></span>
        </div>
        <div id="status" class="ai-status">menyiapkan…</div>
    </div>

    <div class="ai-plain">
        <select id="model" title="Model .gguf terdeteksi (pencarian otomatis di seluruh penyimpanan)"></select>
        <div class="ai-mini">
            <button id="scan" class="ai-btn ghost" title="Pindai ulang berkas .gguf (semua drive)">⟳</button>
            <button id="start" class="ai-btn ghost" title="Jalankan llama-server">▶</button>
            <button id="stop" class="ai-btn ghost" title="Hentikan llama-server">⏹</button>
            <button id="copyall" class="ai-btn ghost" title="Salin seluruh percakapan">📋</button>
            <button id="clear" class="ai-btn ghost" title="Hapus percakapan">🧹</button>
        </div>
    </div>

    <div id="scaninfo" class="ai-scaninfo" hidden></div>

    <div class="ai-plain">
        <select id="ctx" title="Sumber statistik yang dipakai"></select>
        <label class="ai-chk" title="Sertakan statistik berkas sebagai konteks jawaban">
            <input type="checkbox" id="stats" checked> statistik
        </label>
    </div>

    <div class="ai-plain">
        <select id="persona" title="Sifat (kepribadian) Chat AI"></select>
        <input id="persona-custom" type="text" placeholder="sifat kustom…" title="Sifat tambahan bebas (opsional), mis. “selalu sebut dampak rupiah dan risikonya”" />
    </div>

    <div class="ai-voice">
        <button id="mic" class="ai-btn mic" title="Bicara ke AI: suara → teks → dijawab → dibacakan suara perempuan">🎙️</button>
        <button id="tts" class="ai-btn ghost" title="Bacakan jawaban AI dengan suara (default suara perempuan)">🔊</button>
        <select id="voice" class="ai-voice-pick" title="Pilih suara AI"></select>
        <label class="ai-chk" title="Mikrofon menyala lagi otomatis setelah AI selesai bicara">
            <input type="checkbox" id="autolisten"> auto-dengar
        </label>
    </div>
    <div id="voicestate" class="ai-voicestate" hidden></div>

    <div id="msgs" class="ai-msgs"></div>

    <div class="ai-input">
        <textarea id="ta" rows="1" placeholder="Tanya soal data ini… (Enter kirim · Shift+Enter baris baru · 🎙️ bicara)"></textarea>
        <div class="ai-input-actions">
            <button id="send" class="ai-btn primary">Kirim</button>
            <button id="abort" class="ai-btn" hidden>⏹ Stop</button>
        </div>
    </div>
</div>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    // ── suara: bicara → teks → jawaban → dibacakan suara perempuan ──────────
    private voiceCancelled = false;

    private postVoiceStatus(state: 'idle' | 'listening' | 'speaking' | 'error', text?: string): void {
        this.post({ type: 'voiceStatus', state, text });
    }

    /** Daftar suara sistem + pengenal ucapan; juga menyegarkan cache bila diminta paksa. */
    private async postVoiceList(force = false): Promise<VoiceCatalog & { systemStt: boolean }> {
        const catalog = await this.hub.voice.listVoices(force);
        const payload = { ...catalog, systemStt: this.hub.voice.systemSttSupported() };
        this.post({ type: 'voiceList', ...payload });
        return payload;
    }

    /** Dengarkan satu ucapan dari mikrofon lalu kirim teksnya ke webview. */
    private async listen(): Promise<void> {
        const cfg = this.hub.config();
        if (!cfg.voice.enabled || cfg.voice.sttEngine === 'off') {
            this.post({ type: 'voiceResult', ok: false, error: 'Fitur suara sedang dimatikan (dateSkunder.voice.enabled / voice.sttEngine).' });
            return;
        }
        if (this.hub.voice.isListening) { return; }
        this.hub.voice.stopSpeaking();
        this.voiceCancelled = false;
        this.postVoiceStatus('listening');
        const result = await this.hub.voice.recognize({ seconds: cfg.voice.listenSeconds, culture: cfg.voice.language });
        if (this.voiceCancelled) {
            this.voiceCancelled = false;
            this.postVoiceStatus('idle');
            this.post({ type: 'voiceResult', ok: false, cancelled: true });
            return;
        }
        this.postVoiceStatus('idle');
        if (result.ok && result.text) {
            this.post({ type: 'voiceResult', ok: true, text: result.text, culture: result.culture, confidence: result.confidence });
        } else {
            this.post({ type: 'voiceResult', ok: false, error: result.error || 'Ucapan tidak terdeteksi.' });
        }
    }

    /** TTS cadangan lewat suara sistem (dipakai bila webview tidak punya daftar suara). */
    private async speakSystem(text: string): Promise<void> {
        const cfg = this.hub.config();
        const clean = String(text ?? '').trim();
        if (!clean) { return; }
        if (!this.hub.voice.systemTtsSupported()) {
            this.post({ type: 'voiceSpeakDone', ok: false, error: 'Suara sistem tidak tersedia di platform ini.' });
            return;
        }
        this.hub.voice.stopSpeaking();
        this.postVoiceStatus('speaking');
        const handle = this.hub.voice.speak({
            text: clean.slice(0, 4000),
            voiceName: cfg.voice.voiceName || undefined,
            rate: cfg.voice.rate,
            pitch: cfg.voice.pitch,
            volume: cfg.voice.volume,
        });
        await handle.done;
        this.postVoiceStatus('idle');
        this.post({ type: 'voiceSpeakDone', ok: true });
    }

    /** Mulai mendengar dari luar webview (mis. lewat perintah/keybinding). */
    startListening(): void {
        void this.listen();
    }

    /** Daftar model terbaru. quiet=true → view hanya memperbarui daftar pilihan tanpa menulis pesan. */
    postModels(payload: { list: { path: string; name: string; size: string; multipart: boolean }[]; scannedAt: number; scanning: boolean; phase: 'ringkas' | 'penuh'; done: boolean; quiet?: boolean; progress?: ScanProgress & { phase: 'ringkas' | 'penuh' } }): void {
        this.post({ type: 'models', ...payload });
    }

    postScanStart(phase: 'ringkas' | 'penuh'): void {
        this.post({ type: 'scanStart', phase });
    }

    postScanProgress(p: ScanProgress & { phase: 'ringkas' | 'penuh' }): void {
        this.post({ type: 'scanProgress', ...p });
    }

    postServerStatus(): void {
        const cfg = this.hub.config();
        const info = this.hub.osInfo();
        const st = this.hub.server.status;
        const external = this.hub.server.external && st.state === 'stopped';
        const status: ServerStatus = external
            ? { ...st, state: 'running', port: cfg.port, message: 'dijalankan di terminal' }
            : st;
        this.post({ type: 'server', status, external, os: info, binary: info.binary, port: cfg.port, model: this.hub.selectedModel });
    }

    postContextList(preferredId?: string): void {
        const list = this.hub.store.list();
        const active = preferredId ?? this.contextId ?? list[0]?.id;
        this.contextId = active;
        this.post({ type: 'contextList', items: list, active });
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready':
                this.statsEnabled = this.hub.config().includeStats;
                this.post({
                    type: 'init',
                    models: { ...this.hub.modelsPayload(), selected: this.hub.selectedModel },
                    statsEnabled: this.statsEnabled,
                    tooltip: this.hub.osInfo().label,
                    binary: this.hub.osInfo().binary,
                    osFolder: this.hub.osInfo().folder,
                    platform: process.platform,
                    voice: { ...this.hub.config().voice, systemStt: this.hub.voice.systemSttSupported() },
                    persona: this.personaPayload(),
                });
                this.postContextList();
                this.postServerStatus();
                // Daftar suara sistem menyusul (PowerShell bisa perlu 1–2 detik) — tidak memblokir UI.
                void this.postVoiceList();
                // Pencarian otomatis: folder umum dulu, lalu seluruh drive di latar belakang.
                this.hub.autoScan();
                break;
            case 'scan':
                await this.hub.refreshModels({ deep: true, manual: true });
                break;
            case 'selectModel':
                await this.hub.setSelectedModel(String(msg.path));
                this.postServerStatus();
                break;
            case 'start':
                await this.startServer(true);
                break;
            case 'stop':
                if (this.hub.server.external && !this.hub.server.running) {
                    this.post({ type: 'error', text: 'llama-server dijalankan di terminal. Hentikan dari tab Terminal atau tombol ⏹ di view “LLAMA Server”.' });
                    break;
                }
                await this.hub.stopServer();
                break;
            case 'clear':
                this.history = [];
                this.summary = '';
                this.summarizedUntil = 0;
                this.post({ type: 'cleared' });
                break;
            case 'selectContext':
                this.contextId = String(msg.id);
                this.postContextList(this.contextId);
                break;
            case 'stats':
                this.statsEnabled = !!msg.value;
                break;
            case 'send':
                await this.send(String(msg.text ?? ''));
                break;
            case 'abort':
                this.stream?.abort();
                this.stream = undefined;
                this.post({ type: 'aborted' });
                break;
            case 'openSettings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'dateSkunder');
                break;
            // ── suara ──
            case 'voiceListen':
                await this.listen();
                break;
            case 'voiceAbort':
                this.voiceCancelled = true;
                this.hub.voice.cancelRecognition();
                this.postVoiceStatus('idle');
                break;
            case 'voiceList':
                await this.postVoiceList(!!msg.force);
                break;
            case 'voiceSpeak':
                await this.speakSystem(String(msg.text ?? ''));
                break;
            case 'voiceSpeakStop':
                this.hub.voice.stopSpeaking();
                this.postVoiceStatus('idle');
                break;
            case 'voiceSetting':
                if (typeof msg.key === 'string' && msg.key) { await updateVoiceSetting(msg.key, msg.value); }
                this.post({ type: 'voiceConfig', voice: { ...this.hub.config().voice }, systemStt: this.hub.voice.systemSttSupported() });
                break;
            // ── sifat (persona) AI: bisa diubah dari panel, tersimpan ke pengaturan ──
            case 'persona':
                if (typeof msg.persona === 'string' && msg.persona.trim()) { await updateAiSetting('persona', msg.persona.trim()); }
                if (typeof msg.custom === 'string') { await updateAiSetting('personaCustom', msg.custom.trim().slice(0, 600)); }
                this.post({ type: 'persona', ...this.personaPayload() });
                break;
        }
    }

    /** Daftar sifat + sifat terpilih: dikirim ke panel agar pemilih sifat selalu sinkron. */
    private personaPayload() {
        const cfg = this.hub.config();
        return {
            persona: cfg.persona,
            custom: cfg.personaCustom,
            options: AI_PERSONAS.map((p) => ({ id: p.id, label: p.label, sifat: p.sifat })),
        };
    }

    private async startServer(verbose = false): Promise<void> {
        try {
            if (this.hub.serverAvailable()) {
                // Sudah siap (termasuk server yang dijalankan di terminal) → jangan jalankan proses kedua.
                if (verbose) {
                    this.post({
                        type: 'notice',
                        level: 'info',
                        text: this.hub.server.running ? 'llama-server sudah berjalan.' : 'llama-server berjalan di terminal — siap dipakai.',
                    });
                }
                this.postServerStatus();
                return;
            }
            if (verbose) { this.post({ type: 'notice', level: 'info', text: 'Menjalankan llama-server…' }); }
            await this.hub.startServer();
        } catch (e) {
            this.post({ type: 'error', text: e instanceof Error ? e.message : String(e) });
        }
    }

    private async send(text: string): Promise<void> {
        const question = text.trim();
        if (!question) { return; }
        // Jaring pengaman: bila webview versi lama mengirim objek sebagai teks (mis. “[object PointerEvent]”
        // dari bug tombol Kirim), pesannya tidak diteruskan ke model — pengguna diberi tahu apa adanya.
        if (/^\[object \w+\]$/.test(question)) {
            this.post({ type: 'error', text: 'Pesan itu tidak berisi teks yang bisa dibaca (bug tombol Kirim versi lama). Tulis ulang pertanyaannya, ya — versi webview ini sudah diperbaiki.' });
            return;
        }

        // Jawaban yang masih berjalan dihentikan dulu: satu pertanyaan = satu jawaban, tidak bercampur.
        if (this.stream) {
            this.stream.abort();
            this.stream = undefined;
            this.streamSeq++;
        }

        if (!this.hub.serverAvailable()) {
            const cfgAwal = this.hub.config();
            if (!cfgAwal.autoStart) {
                this.post({ type: 'error', text: 'llama-server belum berjalan. Tekan ▶ pada Chat AI atau nyalakan dari view "LLAMA Server".' });
                return;
            }
            await this.startServer();
            if (!this.hub.serverAvailable()) { return; }
        }

        const cfg = this.hub.config();

        const entry = this.hub.store.resolve(this.contextId);
        const baseContext = entry && this.statsEnabled
            ? buildStatsContext(entry, undefined, 7000, question)
            : 'KONTEKS DATA tidak disertakan (pengguna mematikan opsi statistik). Jawab seperlunya dan ingatkan bahwa analisis berkas belum/tidak disertakan.';
        // Ringkasan percakapan lama ikut dikirim → panjang percakapan tidak terbatas.
        const context = this.summary
            ? `${baseContext}\n\nRINGKASAN PERCAKAPAN SEBELUMNYA (diringkas otomatis; pakai bila relevan):\n${this.summary}`
            : baseContext;
        const system: ChatMessage = { role: 'system', content: buildSystemPrompt(context, cfg.systemExtra, cfg.persona, cfg.personaCustom, question) };

        this.history.push({ role: 'user', content: question });
        // Catatan obrolan: pertanyaan & jawaban Chat AI ikut disimpan ke data/data.txt.
        appendChatLog('chat-ai', 'Kamu', question);
        const { recent, dropped } = this.windowMessages(cfg, system.content.length + question.length + 64);
        this.post({ type: 'assistantStart' });

        const seq = ++this.streamSeq;
        let handle: ChatHandle | undefined;
        try {
            handle = chatStream({
                port: cfg.port,
                messages: [system, ...recent],
                temperature: cfg.temperature,
                maxTokens: cfg.maxTokens,
                onDelta: (delta) => { if (seq === this.streamSeq) { this.post({ type: 'delta', text: delta }); } },
            });
        } catch (e) {
            this.post({ type: 'error', text: e instanceof Error ? e.message : String(e) });
            return;
        }
        this.stream = handle;

        try {
            const full = await handle.done;
            // Rapikan sekali di sini: paragraf/kalimat kembar dibuang, lalu teks bersih inilah yang
            // dipakai webview untuk tampilan akhir dan suara (tidak ada jawaban dobel).
            const clean = tidyModelReply(full, question) || String(full || '').trim();
            this.history.push({ role: 'assistant', content: clean });
            appendChatLog('chat-ai', 'AI', clean);
            this.post({ type: 'assistantEnd', text: clean });
            // Ringkasan bergulir di latar belakang: pesan yang tak muat di jendela konteks diringkas.
            void this.compressHistory(dropped, cfg);
        } catch (e) {
            this.post({ type: 'error', text: `Gagal menghubungi llama-server: ${e instanceof Error ? e.message : String(e)}` });
            this.post({ type: 'assistantEnd', text: '' });
        } finally {
            if (this.stream === handle) { this.stream = undefined; }
        }
    }

    /** Anggaran karakter prompt dari ukuran jendela konteks model (1 token ≈ 2,6 karakter). */
    private promptBudget(cfg: AiConfig): number {
        const ctx = Math.max(1024, Math.round(cfg.contextSize || 4096));
        return Math.max(2400, Math.round((ctx - 1400) * 2.6));
    }

    /**
     * Pilih riwayat yang dikirim ke model: sebanyak mungkin pesan terbaru yang muat di jendela
     * konteks. Pesan yang tidak muat TIDAK hilang — ia diringkas bergulir oleh compressHistory(),
     * jadi panjang percakapan tidak dibatasi (bukan lagi dipotong 12 pesan).
     */
    private windowMessages(cfg: AiConfig, baseChars: number): { recent: ChatMessage[]; dropped: ChatMessage[] } {
        const budget = this.promptBudget(cfg);
        let used = baseChars;
        const recent: ChatMessage[] = [];
        for (let i = this.history.length - 1; i >= 0; i--) {
            const m = this.history[i];
            const size = m.content.length + 24;
            if (recent.length >= 2 && used + size > budget) { break; }
            used += size;
            recent.unshift(m);
        }
        const dropped = this.history.slice(this.summarizedUntil, Math.max(this.summarizedUntil, this.history.length - recent.length));
        return { recent, dropped };
    }

    /**
     * Ringkas pesan lama yang sudah keluar dari jendela konteks, lalu simpan ringkasannya.
     * Dengan begitu percakapan bisa terus berjalan tanpa batas: bagian lama menjadi ringkasan padat,
     * bagian baru tetap dikirim utuh.
     */
    private async compressHistory(dropped: ChatMessage[], cfg: AiConfig): Promise<void> {
        if (this.summarizing || dropped.length < 4 || !this.hub.serverAvailable()) { return; }
        this.summarizing = true;
        try {
            const potong = dropped.slice(0, 60);
            const isi = potong.map((m) => `${m.role === 'user' ? 'Pengguna' : 'AI'}: ${String(m.content).slice(0, 700)}`).join('\n');
            const sebelum = this.summary ? `Ringkasan sebelumnya:\n${this.summary}\n\n` : '';
            const handle = chatStream({
                port: cfg.port,
                messages: [
                    {
                        role: 'system',
                        content: 'Kamu merangkum percakapan analisis data agar bisa dilanjutkan tanpa kehilangan konteks. Tulis ringkasan padat dalam Bahasa Indonesia (maksimal 180 kata): angka penting, keputusan, dan pertanyaan yang belum selesai. Jangan mengarang fakta baru.',
                    },
                    { role: 'user', content: `${sebelum}Percakapan yang perlu diringkas:\n${isi}` },
                ],
                temperature: 0.2,
                maxTokens: 320,
                onDelta: () => { /* ringkasan diambil setelah selesai */ },
            });
            const hasil = await handle.done;
            const bersih = tidyModelReply(hasil).slice(0, 1600);
            if (bersih) {
                this.summary = bersih;
                this.summarizedUntil += potong.length;
            }
        } catch { /* ringkasan gagal → percakapan tetap jalan; dicoba lagi pada balasan berikutnya */ }
        finally {
            this.summarizing = false;
        }
    }
}

// ── view: LLAMA Server (output) ──────────────────────────────────────────────

export class LlamaViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private pending: string[] = [];
    /** Terminal yang menjalankan llama-server di laptop (tombol 🖥 Terminal). */
    private terminal?: vscode.Terminal;
    /** Waktu terminal dibuat — klik 🖥 Terminal saat masih memuat model tidak me-restart server. */
    private terminalAt = 0;
    private watch?: ReturnType<typeof setInterval>;
    private lastProbe = 0;
    private probing = false;
    private listeners: vscode.Disposable[] = [];
    /** Panel “LLAMA API”: alamat & endpoint ditampilkan terpisah dari log server. */
    private apiOutput?: vscode.OutputChannel;

    constructor(private hub: AiHub) { }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.hub.extensionUri, 'media')] };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
        // Terminal ditutup pengguna → status kembali ke “berhenti”.
        this.listeners.push(vscode.window.onDidCloseTerminal((t) => {
            if (t !== this.terminal) { return; }
            this.terminal = undefined;
            this.terminalAt = 0;
            this.hub.server.markExternal(false);
            this.stopWatch();
            this.refresh();
        }));
        view.onDidDispose(() => {
            this.view = undefined;
            this.stopWatch();
            for (const d of this.listeners.splice(0)) { d.dispose(); }
        });
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.hub.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'ai.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'llama.js'));
        const n = nonce();
        return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
<link href="${css}" rel="stylesheet">
<title>LLAMA Server</title>
</head>
<body class="ai-body">
<div class="ai-root">
    <div class="ai-head">
        <div class="ai-head-row">
            <strong>🦙 LLAMA Server</strong>
            <span id="dot" class="ai-dot off"></span>
        </div>
        <div id="status" class="ai-status">memeriksa…</div>
    </div>

    <div class="ai-plain">
        <div class="ai-mini">
            <button id="start" class="ai-btn ghost" title="Jalankan llama-server">▶ Start</button>
            <button id="stop" class="ai-btn ghost" title="Hentikan llama-server">⏹ Stop</button>
            <button id="terminal" class="ai-btn ghost" title="Jalankan llama-server di terminal laptop — log mentah di tab Terminal, API di panel “LLAMA API”">🖥 Terminal</button>
            <button id="settings" class="ai-btn ghost" title="Buka pengaturan Date Skunder">⚙</button>
            <button id="clear" class="ai-btn ghost" title="Bersihkan log">🧹</button>
        </div>
    </div>

    <section id="api" class="ai-api">
        <div class="ai-api-head">
            <strong>API Server</strong>
            <span id="api-state" class="ai-api-state">belum berjalan</span>
        </div>
        <div class="ai-api-line">
            <code id="api-base">http://127.0.0.1:8081</code>
            <button id="api-copy" class="ai-btn ghost" title="Salin alamat API">⧉</button>
            <button id="api-open" class="ai-btn ghost" title="Buka API di browser">↗</button>
        </div>
        <div id="api-list" class="ai-api-list"></div>
        <div class="ai-api-line ai-api-curl">
            <code id="api-curl"></code>
            <button id="api-copy-curl" class="ai-btn ghost" title="Salin contoh permintaan chat">⧉</button>
        </div>
    </section>

    <div id="meta" class="ai-meta"></div>
    <label class="ai-chk wide"><input type="checkbox" id="follow" checked> ikuti log terbaru</label>
    <pre id="log" class="ai-log"></pre>
</div>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    /** Baris log baru dari proses llama-server (streaming, bukan tunggu proses selesai). */
    appendLog(line: string): void {
        if (!this.view) { this.pending.push(line); return; }
        this.post({ type: 'log', line });
    }

    refresh(): void {
        const info = this.hub.osInfo();
        const cfg = this.hub.config();
        const model = this.hub.selectedModel;
        const shown = this.displayStatus();
        this.post({
            type: 'status',
            status: shown.status,
            external: shown.external,
            terminal: !!this.terminal,
            os: info,
            binary: info.binary,
            port: cfg.port,
            contextSize: cfg.contextSize,
            gpuLayers: cfg.gpuLayers,
            model,
            modelLabel: model ? path.basename(model) : undefined,
            modelExists: model ? fs.existsSync(model) : false,
            api: this.apiPayload(cfg),
            logs: this.hub.server.logs.slice(-500),
        });
        this.probeExternal();
    }

    /** Status tampilan: proses internal, atau server yang hidup dari terminal / proses lain. */
    private displayStatus(): { status: ServerStatus; external: boolean } {
        const st = this.hub.server.status;
        // Proses internal yang berjalan/memuat model memegang port → mode terminal tidak berlaku lagi.
        if (st.state === 'running' || st.state === 'starting') { this.hub.server.markExternal(false); }
        if (this.hub.server.external && st.state === 'stopped') {
            return { status: { ...st, state: 'running', port: this.hub.config().port, message: 'dijalankan di terminal' }, external: true };
        }
        return { status: st, external: false };
    }

    /** Alamat & endpoint llama-server — ditampilkan di panel API, terpisah dari log. */
    private apiPayload(cfg: AiConfig) {
        const base = `http://127.0.0.1:${cfg.port}`;
        return {
            base,
            openai: `${base}/v1`,
            endpoints: [
                { path: '/', label: 'UI web', hint: 'halaman bawaan llama-server' },
                { path: '/health', label: 'health', hint: 'status proses' },
                { path: '/props', label: 'props', hint: 'konfigurasi model' },
                { path: '/v1/models', label: 'models', hint: 'daftar model (format OpenAI)' },
                { path: '/v1/chat/completions', label: 'chat', hint: 'chat completions (format OpenAI)' },
                { path: '/slots', label: 'slots', hint: 'slot konteks yang aktif' },
            ],
            curl: `curl ${base}/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"local-model","messages":[{"role":"user","content":"halo"}]}'`,
        };
    }

    private probe(port: number): Promise<boolean> {
        return httpRequest(port, '/health', { timeoutMs: 1500 })
            .then((res) => res.status === 200)
            .catch(() => false);
    }

    /**
     * Cek apakah port sudah melayani /health meski extension host tidak memegang prosesnya
     * (mis. server dijalankan dari terminal atau dari aplikasi lain).
     */
    private probeExternal(): void {
        const st = this.hub.server.status;
        if (st.state === 'running' || st.state === 'starting' || st.state === 'stopping') { return; }
        if (this.probing || Date.now() - this.lastProbe < 3000) { return; }
        this.lastProbe = Date.now();
        const port = this.hub.config().port;
        void this.probe(port).then((ok) => {
            if (ok === this.hub.server.external) { return; }
            this.hub.server.markExternal(ok);
            if (ok) { this.startWatch(port); }
            this.refresh();
        });
    }

    private startWatch(port: number): void {
        this.stopWatch();
        this.watch = setInterval(() => { void this.tick(port); }, 4000);
    }

    private stopWatch(): void {
        if (this.watch) { clearInterval(this.watch); this.watch = undefined; }
    }

    /** Pantau server di terminal: status berubah tanpa perlu menekan tombol apa pun. */
    private async tick(port: number): Promise<void> {
        if (this.probing) { return; }
        this.probing = true;
        try {
            const ok = await this.probe(port);
            if (ok && !this.hub.server.external) {
                this.hub.server.markExternal(true);
                this.appendLog(`[ext] API server aktif di http://127.0.0.1:${port}`);
                this.writeApiPanel('aktif');
                this.refresh();
            } else if (!ok && this.hub.server.external) {
                this.hub.server.markExternal(false);
                this.appendLog('[ext] server di terminal berhenti.');
                this.writeApiPanel('berhenti');
                this.stopWatch();
                this.refresh();
            }
        } finally {
            this.probing = false;
        }
    }

    /** Tulis ringkasan API ke panel Output “LLAMA API” (terpisah dari log view). */
    private writeApiPanel(state: 'terminal' | 'aktif' | 'berhenti', command?: string): void {
        if (!this.apiOutput) { this.apiOutput = vscode.window.createOutputChannel('LLAMA API'); }
        const cfg = this.hub.config();
        const api = this.apiPayload(cfg);
        const stamp = new Date().toLocaleTimeString('id-ID');
        this.apiOutput.appendLine(`[${stamp}] ${state === 'terminal' ? 'server dijalankan di terminal' : state === 'aktif' ? 'API siap' : 'server berhenti'}`);
        if (command) { this.apiOutput.appendLine(`perintah: ${command}`); }
        this.apiOutput.appendLine(`base    : ${api.base}`);
        this.apiOutput.appendLine(`openai  : ${api.openai}`);
        for (const ep of api.endpoints) { this.apiOutput.appendLine(`  ${ep.path.padEnd(22)} ${ep.hint}`); }
        this.apiOutput.appendLine(`contoh  : ${api.curl}`);
        this.apiOutput.appendLine('');
    }

    /**
     * Tombol 🖥 Terminal: jalankan llama-server sebagai proses nyata di terminal laptop.
     * Proses internal dihentikan lebih dulu supaya port tidak dipakai dua server sekaligus.
     */
    async runInTerminal(): Promise<void> {
        const cfg = this.hub.config();
        const info = this.hub.osInfo();
        const model = this.hub.selectedModel;
        // Terminal yang masih hidup (atau sedang memuat model) dibawa ke depan, bukan dijalankan ulang.
        if (this.terminal && (this.hub.server.external || Date.now() - this.terminalAt < 120000)) {
            this.terminal.show(true);
            this.post({ type: 'notice', text: 'Server sudah dijalankan di terminal — terminal dibawa ke depan.' });
            return;
        }
        if (!model) {
            const text = 'Belum ada model .gguf. Pilih model di view Chat AI, lalu tekan 🖥 Terminal lagi.';
            this.post({ type: 'notice', text, level: 'error' });
            void vscode.window.showWarningMessage(text);
            return;
        }
        if (!fs.existsSync(model)) {
            const text = `Berkas model tidak ditemukan: ${model}`;
            this.post({ type: 'notice', text, level: 'error' });
            void vscode.window.showWarningMessage(text);
            return;
        }
        if (!info.binary) {
            const target = (info.candidates || [])[0] || '(folder win/mac/linux pada ekstensi)';
            const text = `Biner llama-server tidak ditemukan. Letakkan berkasnya di: ${target}`;
            this.post({ type: 'notice', text, level: 'error' });
            void vscode.window.showWarningMessage(text);
            return;
        }
        if (this.hub.server.running) {
            await this.hub.stopServer();
            this.appendLog('[ext] proses internal dihentikan → server dilanjutkan di terminal.');
        } else if (this.hub.server.external) {
            const text = `Port ${cfg.port} sudah dipakai server lain (mungkin terminal dari sesi sebelumnya). Hentikan dulu server itu, lalu tekan 🖥 Terminal lagi.`;
            this.post({ type: 'notice', text, level: 'error' });
            void vscode.window.showWarningMessage(text);
            return;
        }
        const command = this.hub.server.buildCommand({
            modelPath: model,
            port: cfg.port,
            contextSize: cfg.contextSize,
            gpuLayers: cfg.gpuLayers,
            threads: cfg.threads,
            extraArgs: cfg.extraArgs,
            binaryPath: info.binary,
        });
        this.terminal?.dispose();
        const term = vscode.window.createTerminal({
            name: 'LLAMA Server',
            cwd: path.dirname(info.binary),
            iconPath: new vscode.ThemeIcon('server-process'),
        });
        this.terminal = term;
        this.terminalAt = Date.now();
        term.show(true);
        term.sendText(command, true);
        this.hub.server.markExternal(false);
        this.appendLog(`[ext] terminal: ${command}`);
        this.writeApiPanel('terminal', command);
        this.apiOutput?.show(true);
        this.post({ type: 'notice', text: 'llama-server dijalankan di terminal. Log mentah ada di tab Terminal; alamat & endpoint API ada di panel “LLAMA API”.' });
        this.startWatch(cfg.port);
        this.refresh();
    }

    /** Hentikan server yang berjalan di terminal (tombol ⏹ Stop saat mode terminal). */
    private async stopExternal(): Promise<void> {
        this.stopWatch();
        const adaServerLuar = this.hub.server.external;
        this.hub.server.markExternal(false);
        const term = this.terminal;
        this.terminal = undefined;
        this.terminalAt = 0;
        if (term) {
            term.dispose();
            this.appendLog('[ext] terminal ditutup — server di terminal dihentikan.');
            this.writeApiPanel('berhenti');
        } else if (adaServerLuar) {
            this.appendLog('[ext] server berjalan di luar ekstensi — hentikan dari terminal/aplikasi pemiliknya.');
        }
        this.refresh();
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready':
                if (this.pending.length) {
                    for (const line of this.pending) { this.post({ type: 'log', line }); }
                    this.pending = [];
                }
                this.refresh();
                break;
            case 'start':
                try {
                    this.post({ type: 'notice', text: 'Menjalankan llama-server…' });
                    await this.hub.startServer();
                } catch (e) {
                    this.post({ type: 'notice', text: e instanceof Error ? e.message : String(e), level: 'error' });
                }
                this.refresh();
                break;
            case 'stop':
                await this.hub.stopServer();
                if (this.terminal || this.hub.server.external) { await this.stopExternal(); }
                this.refresh();
                break;
            case 'terminal':
                await this.runInTerminal();
                break;
            case 'copy': {
                const text = String(msg.text ?? '');
                if (!text) { break; }
                await vscode.env.clipboard.writeText(text);
                this.post({ type: 'notice', text: `Disalin: ${String(msg.label || text).slice(0, 90)}` });
                break;
            }
            case 'open': {
                const url = String(msg.url ?? '');
                if (/^https?:\/\//i.test(url)) { await vscode.env.openExternal(vscode.Uri.parse(url)); }
                break;
            }
            case 'clear':
                this.hub.server.clearLogs();
                this.post({ type: 'clear' });
                break;
            case 'settings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'dateSkunder');
                break;
        }
    }
}

/** Dipanggil dari activate(): daftarkan kedua view beserta perintahnya. */
export function registerAiViews(context: vscode.ExtensionContext): AiHub {
    const hub = new AiHub(context);
    const chat = new ChatViewProvider(hub);
    const llama = new LlamaViewProvider(hub);
    hub.attach(chat, llama);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CHAT_VIEW, chat, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(LLAMA_VIEW, llama, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('date-skunder.ai.openChat', async () => {
            await vscode.commands.executeCommand('dateSkunder.chatView.focus');
            if (!hub.selectedModel) {
                const choice = await vscode.window.showWarningMessage('Belum ada berkas .gguf yang terdeteksi. Pencarian otomatis di seluruh penyimpanan sedang berjalan; bila model ada di folder khusus, tambahkan pada Date Skunder → LLAMA → Model Paths.', 'Buka Pengaturan');
                if (choice === 'Buka Pengaturan') { await vscode.commands.executeCommand('workbench.action.openSettings', 'dateSkunder.llama.modelPaths'); }
            }
        }),
        vscode.commands.registerCommand('date-skunder.ai.voiceListen', async () => {
            // Fokuskan view dahulu supaya status “mendengarkan…” terlihat di sidebar.
            await vscode.commands.executeCommand('dateSkunder.chatView.focus');
            chat.startListening();
        }),
        vscode.commands.registerCommand('date-skunder.llama.start', () => hub.startServer()),
        vscode.commands.registerCommand('date-skunder.llama.stop', () => hub.stopServer()),
        vscode.commands.registerCommand('date-skunder.llama.terminal', () => llama.runInTerminal()),
        vscode.commands.registerCommand('date-skunder.llama.scanModels', async () => {
            const models = await hub.scanWithProgress('Memindai ulang berkas .gguf di seluruh penyimpanan…');
            const p = hub.scanProgress;
            const detail = p ? ` (${p.dirs.toLocaleString('id-ID')} folder diperiksa${p.timedOut ? ', batas waktu tercapai' : ''}${p.cancelled ? ', dibatalkan' : ''})` : '';
            if (models.length) {
                await vscode.window.showInformationMessage(`Date Skunder AI: ${models.length} berkas .gguf terdeteksi${detail}.`);
                return;
            }
            const choice = await vscode.window.showWarningMessage(`Belum ada berkas .gguf yang terdeteksi${detail}. Letakkan model di folder Downloads/Documents, atau tambahkan foldernya pada pengaturan dateSkunder.llama.modelPaths.`, 'Buka Pengaturan');
            if (choice === 'Buka Pengaturan') { await vscode.commands.executeCommand('workbench.action.openSettings', 'dateSkunder.llama.modelPaths'); }
        }),
        vscode.commands.registerCommand('date-skunder.llama.pickModel', async () => {
            let models = hub.scanModels();
            if (!models.length) {
                // Cache kosong → cari dulu di seluruh penyimpanan sebelum menawarkan pilihan.
                models = await hub.scanWithProgress();
            }
            if (!models.length) {
                const choice = await vscode.window.showWarningMessage('Tidak ada berkas .gguf yang ditemukan setelah mencari di seluruh penyimpanan. Tambahkan folder pencarian pada pengaturan dateSkunder.llama.modelPaths.', 'Buka Pengaturan');
                if (choice === 'Buka Pengaturan') { await vscode.commands.executeCommand('workbench.action.openSettings', 'dateSkunder.llama.modelPaths'); }
                return;
            }
            const pick = await vscode.window.showQuickPick(
                models.map((m) => ({ label: m.name, description: formatBytes(m.sizeBytes), detail: m.path, path: m.path })),
                { title: 'Pilih model .gguf untuk llama-server', matchOnDetail: true },
            );
            if (pick) { await hub.setSelectedModel(pick.path); }
        }),
    );
    hub.autoScan();
    return hub;
}
