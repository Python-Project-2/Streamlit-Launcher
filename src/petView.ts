import * as vscode from 'vscode';
import type { AiHub } from './aiViews';
import { PET_SKINS, activePetSkin, petSkinById, petSkinPayload } from './petSkins';
import { missionRewards, missionStates } from './petMissions';
import type { RoomService } from './roomService';
import type { CellChange } from './roomCsv';
import {
    PetHealthTerminal,
    addLabEntry,
    apiDetail,
    apiPresets,
    apiSummary,
    clearLabEntries,
    collectHealth,
    deleteLabEntry,
    healthReport,
    healthSummary,
    labEntries,
    openLabEntry,
    previewEntry,
    runApiTest,
} from './petLab';

const PET_VIEW = 'dateSkunder.petView';

/** Info server API JSON lokal (dipakai untuk mengisi pilihan endpoint di Pet Lab). */
export interface PetApiInfo {
    running: boolean;
    port: number;
    endpoints: Record<string, string>;
}

export class PetViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private healthTerminal?: vscode.Terminal;

    constructor(
        private hub: AiHub,
        private ctx: vscode.ExtensionContext,
        private apiInfo: () => PetApiInfo = () => ({ running: false, port: 0, endpoints: {} }),
        private room?: RoomService,
    ) { }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.hub.extensionUri, 'media')] };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
        view.onDidDispose(() => { this.view = undefined; });
        // Daftar berkas untuk room dimuat di latar belakang (tidak menahan tampilan).
        void this.room?.refreshFiles().then(() => this.refreshRoom());
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.hub.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'pet.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'pet.js'));
        const n = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
        return /* html */ `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
<link href="${css}" rel="stylesheet">
<title>Pet Skin</title>
</head>
<body class="pet-body">
<div class="pet-root">
    <div class="pet-head">
        <strong>🎨 Pet Skin</strong>
        <span id="pet-state" class="pet-state">memuat…</span>
    </div>
    <div id="pet-grid" class="pet-grid"></div>
    <div id="pet-missions" class="pet-missions"></div>
    <div id="pet-note" class="pet-note" hidden></div>
    <div class="pet-room" id="pet-room">
        <div class="pet-room-head">
            <strong>🌐 Room</strong>
            <span id="room-state" class="pet-state">memuat…</span>
        </div>
        <div class="pet-room-card">
            <div class="pet-room-mode" id="room-mode" role="tablist" aria-label="Mode room">
                <button type="button" data-mode="create" class="active" role="tab" aria-selected="true">➕ Create Room</button>
                <button type="button" data-mode="join" role="tab" aria-selected="false">🔗 Join Room</button>
            </div>
            <div class="pet-room-title">🛰 Server Socket.IO</div>
            <div id="room-server-info" class="pet-room-sub">Menyalakan server…</div>
            <div class="pet-room-row" id="room-host-row" hidden>
                <input id="room-host" class="pet-input" type="text" spellcheck="false" placeholder="192.168.1.7:47900" title="Alamat laptop tuan rumah (IP:port)">
                <button id="room-terminal" class="pet-btn icon" type="button" title="Buka terminal server">🖥</button>
                <button id="room-server-toggle" class="pet-btn icon" type="button" title="Nyalakan / hentikan server">⏻</button>
            </div>
            <div class="pet-room-row" id="room-name-row">
                <input id="room-name" class="pet-input" type="text" placeholder="Nama room" title="Nama room (pakai nama yang sama di laptop lain)">
                <input id="room-user" class="pet-input" type="text" placeholder="Nama kamu" title="Nama yang tampil di kursor">
            </div>
            <div class="pet-room-row" id="room-file-row">
                <select id="room-file" class="pet-input" title="Berkas yang dipakai room"></select>
                <button id="room-pick-file" class="pet-btn icon" type="button" title="Pilih berkas dari komputer">📂</button>
                <button id="room-refresh-files" class="pet-btn icon" type="button" title="Muat ulang daftar berkas">↻</button>
            </div>
            <div class="pet-room-actions">
                <button id="room-create" class="pet-btn primary" type="button">➕ Create Room</button>
                <button id="room-join" class="pet-btn primary" type="button" hidden>🔗 Join Room</button>
                <button id="room-leave" class="pet-btn danger" type="button" hidden>Keluar Room</button>
                <button id="room-open-file" class="pet-btn icon" type="button" hidden title="Buka berkas room di halaman analisis">📄</button>
            </div>
            <div id="room-hint" class="pet-room-sub"></div>
        </div>
        <div class="pet-room-card">
            <div class="pet-room-title">💻 Perangkat terhubung <span id="room-count" class="pet-badge">0</span></div>
            <div class="pet-room-sub">Kursor tiap perangkat tampil di halaman analisis lengkap dengan nama &amp; spider-nya.</div>
            <div id="room-cursor-map" class="pet-room-map" hidden></div>
            <div id="room-devices" class="pet-room-devices"></div>
        </div>
        <div class="pet-room-card" id="room-files-card" hidden>
            <div class="pet-room-title">📤 Kirim file <span id="room-incoming-count" class="pet-badge">0</span></div>
            <div class="pet-room-sub">Kirim file apa pun ke semua perangkat room. Di laptop penerima muncul tombol <b>Download</b>.</div>
            <div class="pet-room-actions">
                <button id="room-send-file" class="pet-btn primary" type="button">📤 Pilih &amp; Kirim File</button>
            </div>
            <div id="room-incoming" class="pet-room-devices"></div>
        </div>
        <div class="pet-room-card">
            <div class="pet-room-title">📊 CSV bersama <span id="room-csv-badge" class="pet-badge">—</span></div>
            <div id="room-csv-empty" class="pet-room-sub">Bergabung di room untuk melihat &amp; mengubah isi CSV.</div>
            <div id="room-csv-wrap" hidden>
                <div id="room-csv-table" class="pet-room-table"></div>
                <div id="room-csv-hint" class="pet-room-sub">Klik sel untuk mengubah — pratinjau muncul di tombol sebelum diterapkan.</div>
                <div class="pet-room-actions">
                    <button id="room-preview-btn" class="pet-btn" type="button" disabled>👁 Pratinjau (0)</button>
                    <button id="room-csv-cancel" class="pet-btn" type="button">Batal</button>
                    <button id="room-csv-apply" class="pet-btn primary" type="button">✔ Terapkan ke semua</button>
                </div>
                <div id="room-last-applied" class="pet-room-sub"></div>
            </div>
        </div>
        <button id="room-preview-chip" class="pet-room-chip" type="button" hidden title="Pratinjau perubahan CSV — geser untuk memindahkan, klik untuk membuka">👁 Pratinjau (0)</button>
        <div id="room-preview-float" class="pet-room-float" role="dialog" aria-label="Pratinjau perubahan CSV" hidden>
            <div class="pet-room-float-head" id="room-preview-drag" tabindex="0" title="Geser panel ini (atau pakai tombol panah)">
                <span class="pet-room-float-grip" aria-hidden="true">⠿</span>
                <strong id="room-preview-title">Pratinjau perubahan</strong>
                <button id="room-preview-close" class="pet-room-float-x" type="button" title="Tutup">✕</button>
            </div>
            <div id="room-csv-preview" class="pet-room-preview"></div>
        </div>
    </div>
    <div class="pet-lab">
        <div class="pet-lab-head">
            <strong>🧪 Pet Lab</strong>
            <span id="pet-lab-state" class="pet-state">siap</span>
        </div>
        <div class="pet-lab-card">
            <div class="pet-lab-title">🔌 Test API JSON</div>
            <div class="pet-lab-sub">Kirim permintaan ke API JSON lokal atau URL lain, lalu lihat balasannya.</div>
            <div class="pet-lab-row">
                <select id="lab-endpoint" class="pet-input" title="Pilih endpoint API JSON"></select>
                <select id="lab-method" class="pet-input pet-input-sm" title="Metode HTTP">
                    <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option><option>HEAD</option>
                </select>
            </div>
            <input id="lab-url" class="pet-input" type="text" spellcheck="false" placeholder="http://127.0.0.1:47831/api/health.json">
            <details class="pet-lab-adv">
                <summary>Header &amp; body (opsional)</summary>
                <textarea id="lab-headers" class="pet-input pet-code" rows="3" spellcheck="false" placeholder="{} atau satu baris per header: Authorization: Bearer …"></textarea>
                <textarea id="lab-body" class="pet-input pet-code" rows="4" spellcheck="false" placeholder='{"message":"halo"}'></textarea>
            </details>
            <div class="pet-lab-actions">
                <button id="lab-send" class="pet-btn primary" type="button">▶ Kirim</button>
                <button id="lab-copy-url" class="pet-btn" type="button">📋 Salin URL</button>
            </div>
            <div id="lab-result" class="pet-lab-result" hidden></div>
        </div>
        <div class="pet-lab-card">
            <div class="pet-lab-title">🩺 Kesehatan Laptop</div>
            <div class="pet-lab-sub">Periksa CPU, RAM, disk, baterai, dan aplikasi berat — prosesnya tampil di terminal.</div>
            <div class="pet-lab-actions">
                <button id="lab-health" class="pet-btn primary" type="button">🩺 Cek di Terminal</button>
            </div>
        </div>
        <div class="pet-lab-card">
            <div class="pet-lab-title">🗂 Riwayat hasil <span id="lab-count" class="pet-badge">0</span></div>
            <div class="pet-lab-sub">Pratinjau atau hapus hasil test API JSON &amp; cek kesehatan — seperti daftar unduhan di Chrome.</div>
            <div id="lab-history" class="pet-lab-history"></div>
            <button id="lab-clear" class="pet-btn danger" type="button">🗑 Hapus semua riwayat</button>
        </div>
    </div>
    <div class="pet-community-banner" style="margin-top:16px;padding:10px 12px;border:1px solid var(--vscode-panel-border, rgba(128,128,128,.3));border-radius:8px;background:var(--vscode-sideBar-background, rgba(128,128,128,.08));display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
            <div style="font-weight:600;font-size:11.5px;">💬 Community Chat</div>
            <div style="font-size:10.5px;opacity:.75;line-height:1.4;">Ruang obrolan komunitas tepat di bawah view ini.</div>
        </div>
        <button id="pet-open-community" type="button" style="padding:4px 9px;font-size:11px;cursor:pointer;white-space:nowrap;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:5px;font-weight:500;">Buka Chat</button>
    </div>
</div>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    /** Keadaan terbaru: daftar kostum (termasuk yang terkunci) + misi pembukanya. */
    private statePayload() {
        const missions = missionStates(this.ctx);
        const rewards = missionRewards(this.ctx);
        return {
            type: 'petSkinState',
            active: activePetSkin(this.ctx).id,
            missions,
            skins: PET_SKINS.map((s) => {
                const misi = s.mission ? missions.find((m) => m.id === s.mission) : undefined;
                return {
                    ...petSkinPayload(s),
                    locked: !!s.mission && !rewards.has(s.id),
                    missionName: misi ? misi.name : '',
                    missionProgress: misi ? `${misi.value}/${misi.target}` : '',
                };
            }),
        };
    }

    /** Tampilkan pilihan terbaru (dipakai saat view dibuka dan setelah pengaturan berubah). */
    refresh(): void {
        this.post(this.statePayload());
    }

    /** Riwayat + endpoint siap pakai untuk bagian Pet Lab. */
    private labPayload() {
        const info = this.apiInfo();
        const port = info.port
            || Math.round(vscode.workspace.getConfiguration('dateSkunder').get<number>('community.apiPort') ?? 47831)
            || 47831;
        return {
            type: 'petLabState',
            running: !!info.running,
            port,
            presets: apiPresets(info.endpoints, port),
            entries: labEntries(this.ctx).map(previewEntry),
        };
    }

    /** Kirim ulang riwayat ke webview (setelah test, cek kesehatan, hapus, atau buka view). */
    refreshLab(): void {
        this.post(this.labPayload());
    }

    /** Keadaan Join Room: server, peserta, daftar berkas, dan tabel CSV. */
    refreshRoom(): void {
        if (!this.view) { return; }
        this.post({ type: 'petRoomState', room: this.room?.viewState() ?? null });
    }

    /** Kursor peserta lain (payload kecil) → peta kursor di panel ikut bergerak realtime. */
    postRoomCursor(id: string, x: number, y: number): void {
        if (!this.view) { return; }
        this.post({ type: 'petRoomCursor', id, x, y });
    }

    /** Latensi terbaru → hanya angka di panel yang diperbarui (tanpa render ulang). */
    postRoomLatency(ms: number): void {
        if (!this.view) { return; }
        this.post({ type: 'petRoomLatency', ms });
    }

    /** Fokuskan form Join Room (dipakai Command Palette / tombol di halaman analisis). */
    focusRoom(): void {
        // Webview bisa belum siap saat perintah dijalankan → ulangi sebentar kemudian.
        this.post({ type: 'petRoomFocus' });
        setTimeout(() => this.post({ type: 'petRoomFocus' }), 500);
        setTimeout(() => this.post({ type: 'petRoomFocus' }), 1400);
    }

    /** Test API JSON: jalankan permintaan, simpan hasil, lalu tampilkan balasannya. */
    private async runApiTest(msg: any): Promise<void> {
        this.post({ type: 'petLabBusy', busy: 'api' });
        try {
            const result = await runApiTest({ method: msg.method, url: msg.url, headers: msg.headers, body: msg.body, timeoutMs: msg.timeoutMs });
            const detail = apiDetail(result);
            const entry = await addLabEntry(this.ctx, {
                kind: 'api',
                title: `${result.method} ${urlPath(result.url)}`,
                ok: result.ok,
                summary: apiSummary(result),
                detail,
                at: result.at,
            });
            this.post({
                type: 'petLabResult',
                entry: previewEntry(entry),
                text: detail.length > 8000 ? `${detail.slice(0, 8000)}\n… buka di editor untuk melihat semuanya.` : detail,
            });
            this.refreshLab();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.post({ type: 'petLabNote', ok: false, text: `Test API gagal: ${message}` });
        } finally {
            this.post({ type: 'petLabBusy', busy: '' });
        }
    }

    /** Cek kesehatan laptop: metrik dikumpulkan dulu, lalu ditulis ke terminal dan riwayat. */
    async runHealthCheck(): Promise<void> {
        const pty = new PetHealthTerminal();
        const terminal = vscode.window.createTerminal({ name: 'Cek Kesehatan Laptop', pty, iconPath: new vscode.ThemeIcon('pulse') });
        this.healthTerminal = terminal;
        terminal.show(true);
        this.post({ type: 'petLabBusy', busy: 'health' });
        try {
            const metrik = await collectHealth();
            const laporan = healthReport(metrik);
            pty.report(laporan);
            const entry = await addLabEntry(this.ctx, {
                kind: 'health',
                title: 'Cek Kesehatan Laptop',
                ok: metrik.score >= 65,
                summary: healthSummary(metrik),
                detail: laporan,
                at: metrik.at,
            });
            this.post({ type: 'petLabResult', entry: previewEntry(entry), text: laporan });
            this.refreshLab();
            this.post({
                type: 'petLabNote',
                ok: metrik.score >= 65,
                text: `Kesehatan laptop: ${metrik.score}/100 (${metrik.label}) — laporan lengkap ada di terminal dan Riwayat Pet Lab.`,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            pty.report(`Gagal memeriksa kesehatan: ${message}`);
            this.post({ type: 'petLabNote', ok: false, text: `Gagal memeriksa kesehatan: ${message}` });
        } finally {
            this.post({ type: 'petLabBusy', busy: '' });
        }
    }

    /** Fokuskan bagian Pet Lab (dipakai perintah Command Palette). */
    focusLab(kind: 'api' | 'health'): void {
        this.post({ type: 'petLabFocus', kind });
    }

    /** Pakai satu kostum: simpan ke pengaturan, siarkan ke panel analisis, lalu perbarui tampilan. */
    async selectSkin(id: string): Promise<void> {
        const skin = petSkinById(id);
        if (skin.mission && !missionRewards(this.ctx).has(skin.id)) {
            const misi = missionStates(this.ctx).find((m) => m.id === skin.mission);
            this.post({
                type: 'petSkinNote',
                ok: false,
                text: `Kostum “${skin.name}” masih terkunci. Selesaikan misi “${misi ? misi.name : skin.mission}” dulu${misi ? ` (${misi.value}/${misi.target})` : ''}.`,
            });
            return;
        }
        await vscode.workspace.getConfiguration('dateSkunder').update('spider.skin', skin.id, vscode.ConfigurationTarget.Global);
        this.hub.broadcastSpiderConfig();
        this.refresh();
        this.post({
            type: 'petSkinNote',
            ok: true,
            text: `Kostum “${skin.name}” dipakai — laba-laba di panel analisis yang terbuka langsung berubah.`,
        });
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready':
                this.refresh();
                this.refreshLab();
                this.refreshRoom();
                void this.room?.refreshFiles().then(() => this.refreshRoom());
                break;
            case 'roomStart':
                await this.room?.startServer().catch(() => undefined);
                this.refreshRoom();
                break;
            case 'roomStop':
                await this.room?.stopServer();
                this.refreshRoom();
                break;
            case 'roomJoin':
                await this.room?.joinRoom({
                    host: String(msg.host ?? ''),
                    room: String(msg.room ?? ''),
                    name: String(msg.name ?? ''),
                });
                this.refreshRoom();
                break;
            case 'roomCreate':
                await this.room?.createRoom({
                    room: String(msg.room ?? ''),
                    name: String(msg.name ?? ''),
                    filePath: String(msg.filePath ?? ''),
                });
                this.refreshRoom();
                break;
            case 'roomSendFile':
                await this.room?.sendFile();
                this.refreshRoom();
                break;
            case 'roomDownloadFile':
                await this.room?.downloadFile(String(msg.id ?? ''));
                this.refreshRoom();
                break;
            case 'roomKick':
                await this.room?.kick(String(msg.id ?? ''));
                this.refreshRoom();
                break;
            case 'roomLeave':
                await this.room?.leave();
                this.refreshRoom();
                break;
            case 'roomTerminal':
                await vscode.commands.executeCommand('date-skunder.room.terminal');
                break;
            case 'roomRefreshFiles':
                await this.room?.refreshFiles(true);
                this.refreshRoom();
                break;
            case 'roomPickFile': {
                if (this.room?.isInRoom()) {
                    this.post({
                        type: 'petRoomNote',
                        ok: false,
                        text: `Kamu sedang di room “${this.room.roomName()}” dengan berkas ${this.room.roomFileName()}. Keluar room dulu sebelum memakai berkas lain.`,
                    });
                    break;
                }
                const picked = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    openLabel: 'Pakai untuk room',
                    filters: { 'Data': ['csv', 'tsv', 'xlsx', 'xls', 'xlsm'] },
                });
                const uri = picked && picked[0];
                if (uri && this.room) {
                    const item = this.room.rememberFile(uri);
                    this.refreshRoom();
                    this.post({ type: 'petRoomSelectFile', path: item.path });
                }
                break;
            }
            case 'roomCsvPreview':
                this.room?.previewLocalChanges(normalizeChanges(msg.changes));
                break;
            case 'roomCsvApply':
                await this.room?.applyLocalChanges(normalizeChanges(msg.changes));
                this.refreshRoom();
                break;
            case 'roomCsvCancel':
                this.room?.clearPreview();
                this.refreshRoom();
                break;
            case 'roomCsvReload':
                await this.room?.reloadTable();
                this.refreshRoom();
                break;
            case 'roomApplyPending':
                await this.room?.applyPendingRemote();
                this.refreshRoom();
                break;
            case 'roomOpenFile': {
                const fileName = this.room?.roomFileName();
                const file = this.room?.viewState().files.find((f) => f.name === fileName);
                if (file) {
                    await vscode.commands.executeCommand('date-skunder.openPreview', vscode.Uri.file(file.path));
                } else {
                    this.post({ type: 'petRoomNote', ok: false, text: 'Berkas room tidak ditemukan di workspace ini.' });
                }
                break;
            }
            case 'select':
                await this.selectSkin(String(msg.id ?? ''));
                break;
            case 'openCommunity':
                await vscode.commands.executeCommand('dateSkunder.communityView.focus');
                break;
            case 'labApiTest':
                await this.runApiTest(msg);
                break;
            case 'labHealth':
                await this.runHealthCheck();
                break;
            case 'labDelete':
                if (await deleteLabEntry(this.ctx, msg.id)) {
                    this.refreshLab();
                    this.post({ type: 'petLabNote', ok: true, text: 'Hasil dihapus dari riwayat.' });
                } else {
                    this.post({ type: 'petLabNote', ok: false, text: 'Hasil tidak ditemukan (mungkin sudah dihapus).' });
                }
                break;
            case 'labClear': {
                const jumlah = await clearLabEntries(this.ctx);
                this.refreshLab();
                this.post({ type: 'petLabNote', ok: true, text: jumlah ? `${jumlah} hasil dihapus dari riwayat.` : 'Riwayat sudah kosong.' });
                break;
            }
            case 'labOpen':
                if (!await openLabEntry(this.ctx, msg.id)) {
                    this.post({ type: 'petLabNote', ok: false, text: 'Hasil tidak ditemukan (mungkin sudah dihapus).' });
                }
                break;
            case 'labCopy':
                await vscode.env.clipboard.writeText(String(msg.text ?? ''));
                this.post({ type: 'petLabNote', ok: true, text: 'Disalin ke papan klip.' });
                break;
        }
    }
}

/** Validasi perubahan sel yang dikirim webview (indeks & nilai dibatasi). */
function normalizeChanges(raw: unknown): CellChange[] {
    if (!Array.isArray(raw)) { return []; }
    const out: CellChange[] = [];
    for (const item of raw.slice(0, 400)) {
        if (!item || typeof item !== 'object') { continue; }
        const r = Number((item as CellChange).r);
        const c = Number((item as CellChange).c);
        if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r > 100000 || c > 500) { continue; }
        out.push({ r, c, value: String((item as CellChange).value ?? '').slice(0, 4000) });
    }
    return out;
}

/** Path ringkas untuk judul hasil test API (tanpa origin). */
function urlPath(url: string): string {
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}` || '/';
    } catch {
        return url;
    }
}

/** Daftarkan view Pet Skin beserta perintah-perintahnya. */
export function registerPetView(context: vscode.ExtensionContext, hub: AiHub, apiInfo?: () => PetApiInfo, room?: RoomService): PetViewProvider {
    const provider = new PetViewProvider(hub, context, apiInfo, room);
    // Hub perlu kenal view ini supaya progres misi dari halaman analisis bisa langsung terlihat di sini.
    hub.bindPetView(provider);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(PET_VIEW, provider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('date-skunder.pet.open', async () => {
            await vscode.commands.executeCommand(`${PET_VIEW}.focus`);
        }),
        vscode.commands.registerCommand('date-skunder.pet.pick', async () => {
            const aktif = activePetSkin(context).id;
            const pilih = await vscode.window.showQuickPick(
                PET_SKINS.map((s) => ({
                    label: `${s.id === aktif ? '$(check) ' : ''}${s.name}`,
                    description: s.id === aktif ? 'sedang dipakai' : s.id,
                    detail: s.tagline,
                    id: s.id,
                })),
                { title: 'Pilih kostum pet Spider' },
            );
            if (!pilih) { return; }
            await provider.selectSkin(pilih.id);
            await vscode.commands.executeCommand(`${PET_VIEW}.focus`);
        }),
        // Pet Lab: tester API JSON (fokus ke form) dan cek kesehatan laptop (langsung di terminal).
        vscode.commands.registerCommand('date-skunder.pet.apiTest', async () => {
            await vscode.commands.executeCommand(`${PET_VIEW}.focus`);
            provider.focusLab('api');
        }),
        vscode.commands.registerCommand('date-skunder.pet.health', async () => {
            await provider.runHealthCheck();
        }),
        // Pengaturan bisa juga diubah dari Settings → siarkan ulang supaya kostum pet langsung berganti.
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('dateSkunder.spider.skin')) {
                hub.broadcastSpiderConfig();
                provider.refresh();
            }
            // Port API JSON berubah → pilihan endpoint di Pet Lab ikut menyesuaikan.
            if (e.affectsConfiguration('dateSkunder.community.apiPort') || e.affectsConfiguration('dateSkunder.community.api')) {
                provider.refreshLab();
            }
            // Pengaturan room (port, nama, kursor, auto-terapkan CSV) → panel ikut diperbarui.
            if (e.affectsConfiguration('dateSkunder.room.')) {
                provider.refreshRoom();
            }
        }),
    );
    return provider;
}
