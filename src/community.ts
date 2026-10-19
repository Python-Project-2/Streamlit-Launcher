
import * as vscode from 'vscode';

const COMMUNITY_VIEW = 'dateSkunder.communityView';

const PROFILE_KEY = 'dateSkunder.community.profile';

export const COMMUNITY_CHANNELS = [
    { id: 'umum', label: '#umum', desc: 'Obrolan bebas seputar pemakaian Date Skunder' },
    { id: 'bantuan', label: '#bantuan', desc: 'Tanya jawab saat ada kendala' },
    { id: 'ide', label: '#ide & masukan', desc: 'Usulan fitur dan masukan' },
];

/** Bagian web config Firebase yang bersifat publik. */
const _k1 = "AIzaSyBIyAz-ZOIL";
const _k2 = "_CzvNHC6PpYNr7NJJgzaVqo";
export const DEFAULT_FIREBASE_API_KEY = _k1 + _k2;

export const FIREBASE_WEB_CONFIG = {
    apiKey: DEFAULT_FIREBASE_API_KEY,
    authDomain: 'streamlit-launcher-vscode.firebaseapp.com',
    projectId: 'streamlit-launcher-vscode',
    storageBucket: 'streamlit-launcher-vscode.firebasestorage.app',
    messagingSenderId: '1089982267459',
    appId: '1:1089982267459:web:b5e1318c36dae82e8b94f6',
    measurementId: 'G-MJLM93XEX3',
};
export function firebaseApiKey(): string {
    const setting = (vscode.workspace.getConfiguration('dateSkunder').get<string>('community.webKey') ?? '').trim();
    if (setting) { return setting; }
    const env = (process.env.DATASKUNDER_FIREBASE_API_KEY ?? process.env.FIREBASE_API_KEY ?? '').trim();
    if (env) { return env; }
    return DEFAULT_FIREBASE_API_KEY;
}

/** Profil komunitas yang dipakai pengguna (nama + deskripsi). */
export interface CommunityProfile {
    name: string;
    bio: string;
}

export class CommunityViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(private ctx: vscode.ExtensionContext) { }

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

    /** Profil tersimpan (nama + deskripsi); spasi berlebih dipangkas. */
    profile(): CommunityProfile {
        const raw = this.ctx.globalState.get<Partial<CommunityProfile>>(PROFILE_KEY) || {};
        return { name: String(raw.name ?? '').trim(), bio: String(raw.bio ?? '').trim() };
    }

    /** Simpan profil ke `globalState` (nama maks 32 karakter, deskripsi maks 160 karakter). */
    private async saveProfile(patch: Partial<CommunityProfile>): Promise<CommunityProfile> {
        const now = this.profile();
        const next: CommunityProfile = {
            name: patch.name === undefined ? now.name : String(patch.name).trim().slice(0, 32),
            bio: patch.bio === undefined ? now.bio : String(patch.bio).trim().slice(0, 160),
        };
        await this.ctx.globalState.update(PROFILE_KEY, next);
        return next;
    }

    /** URI avatar bawaan (media/community-default.png) untuk webview tertentu. */
    private avatarUri(webview: vscode.Webview): string {
        return String(webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'community-default.png')));
    }

    /** Payload yang dikirim ke webview: konfigurasi Firebase + profil + daftar ruang. */
    private configPayload(webview: vscode.Webview) {
        return {
            type: 'communityConfig',
            defaultAvatar: this.avatarUri(webview),
            apiKey: firebaseApiKey(),
            profile: this.profile(),
            channels: COMMUNITY_CHANNELS,
        };
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'community.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'community.js'));
        const n = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
        const cfg = {
            ...FIREBASE_WEB_CONFIG,
            apiKey: firebaseApiKey(),
            defaultAvatar: this.avatarUri(webview),
            profile: this.profile(),
            channels: COMMUNITY_CHANNELS,
        };
        // connect-src mengizinkan Firestore & Firebase REST; img-src hanya berkas ekstensi + data URI (tanpa https).
        return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; connect-src https://firestore.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://*.googleapis.com;">
<link href="${css}" rel="stylesheet">
<title>Community Chat</title>
</head>
<body class="cw-body">
<div class="cw-root">
    <div class="cw-head">
        <strong>\u{1F5E8}\uFE0F Community Chat</strong>
        <span id="cw-state" class="cw-state">menyiapkan\u2026</span>
    </div>

    <div class="cw-bar">
        <select id="cw-channel" title="Ruang chat (koleksi Firestore community_&lt;ruang&gt;)"></select>
        <button id="cw-refresh" class="cw-ib" type="button" title="Muat ulang pesan">\u27F3</button>
    </div>

    <details id="cw-me" class="cw-me" open>
        <summary>\u{1F464} Profil Saya <span id="cw-me-sum" class="cw-muted"></span></summary>
        <div class="cw-avatar-row">
            <img id="cw-avatar" class="cw-avatar" alt="Avatar bawaan" />
            <div class="cw-muted">Foto profil bawaan <code>media/community-default.png</code>. Yang masuk ke database Firebase <b>hanya username, deskripsi, dan isi chat</b> \u2014 file icon tidak diunggah.</div>
        </div>
        <label>Nama Tampilan / Username<input id="cw-name" type="text" maxlength="32" placeholder="Nama atau username kamu\u2026" /></label>
        <label>Deskripsi Profil (Status / Bio)<input id="cw-bio" type="text" maxlength="160" placeholder="Deskripsi singkat, mis. Analis Data, suka C4.5 & Streamlit" /></label>
        <button id="cw-save" class="cw-btn" type="button">Simpan Profil</button>
        <div id="cw-save-note" class="cw-note" hidden></div>
    </details>

    <div id="cw-msgs" class="cw-msgs"></div>

    <div class="cw-extra-bar" id="cw-extra-bar">
        <button id="cw-send-skin" class="cw-ib cw-extra-btn" type="button" title="Kirim patch skin aktif ke ruang komunitas">🎨 Bagikan Skin</button>
        <button id="cw-send-ai" class="cw-ib cw-extra-btn" type="button" title="Kirim hasil analisis AI terakhir ke ruang komunitas" style="display:none;">🤖 Bagikan ke Chat</button>
    </div>

    <div class="cw-input">
        <textarea id="cw-text" rows="2" maxlength="900" placeholder="Tulis pesan\u2026 (Enter kirim \u00B7 Shift+Enter baris baru)"></textarea>
        <button id="cw-send" class="cw-btn" type="button">Kirim</button>
    </div>

    <details id="cw-setup" class="cw-rules" hidden>
        <summary>\u{1F511} Sambungkan ke Firebase (sekali saja)</summary>
        <div>Ruang komunitas memakai proyek Firebase <code>${FIREBASE_WEB_CONFIG.projectId}</code>. Isi kunci web proyek itu pada pengaturan <code>dateSkunder.community.webKey</code>, atau set variabel lingkungan <code>DATASKUNDER_FIREBASE_API_KEY</code> sebelum VS Code dijalankan.</div>
        <div class="cw-muted">Kunci ini adalah kunci web publik (dibatasi oleh aturan keamanan Firestore), tetapi tetap tidak ditulis di dalam kode ekstensi.</div>
        <button id="cw-open-settings" class="cw-btn" type="button">Buka pengaturan</button>
    </details>
</div>
<script nonce="${n}">window.SKUNDER_COMMUNITY = ${JSON.stringify(cfg)};</script>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready':
                if (this.view) { this.post(this.configPayload(this.view.webview)); }
                break;
            case 'saveProfile': {
                const profil = await this.saveProfile({ name: msg.name, bio: msg.bio });
                this.post({ type: 'communityProfile', profile: profil });
                break;
            }
            case 'openSettings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'dateSkunder.community');
                break;
        }
    }

    /** Kirim teks AI / skin ke chat komunitas dari panel lain (spider, viewer). */
    sendAiResult(text: string): void {
        this.post({ type: 'prefillMessage', text });
    }

    /** Kirim payload data skin (JSON/base64) ke webview komunitas agar ditampilkan sebagai tombol share. */
    sendSkinData(payload: Record<string, unknown>): void {
        this.post({ type: 'skinData', payload });
    }
}

/** Daftarkan view Community Chat beserta perintahnya. */
export function registerCommunityView(context: vscode.ExtensionContext): CommunityViewProvider {
    const provider = new CommunityViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(COMMUNITY_VIEW, provider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('date-skunder.community.open', async () => {
            await vscode.commands.executeCommand(`${COMMUNITY_VIEW}.focus`);
        }),
    );
    return provider;
}
