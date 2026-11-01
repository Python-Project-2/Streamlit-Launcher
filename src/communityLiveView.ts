import * as vscode from 'vscode';
import * as path from 'path';
import { COMMUNITY_CHANNELS } from './community';
import { CommunityLive, LiveMessage, LIVE_LANGS, saveConfiguredLangs, saveReplyLanguage } from './communityLive';
import {
    appendChatLog,
    appendChatLogNote,
    archiveChatLog,
    chatLogFile,
    chatLogJson,
    chatLogLabel,
    clearChatLog,
    openChatLog,
    readChatLogEntries,
} from './chatLog';
import type { ChatLogEntry } from './chatLog';
import {
    countCommunityMessages,
    countDiscussionMessages,
    deleteAllCommunityMessages,
    deleteAllDiscussionMessages,
    discussionSummary,
    firebaseDisplayEnabled,
    firebaseEnabled,
    firebaseSummary,
    listCommunityMessages,
    listDiscussionMessages,
    sendCommunityMessage,
    sendDiscussionMessage,
    RemoteCommunityMessage,
} from './communityFirebase';
import { communityMessageCount, maxChatMessages, shouldClearChat, shouldRotateDiscussion } from './chatLimits';
import { ChatApiServer } from './chatApi';

/**
 * View “Community Chat”.
 *
 * Dua ruang, keduanya dibaca dari database Firebase:
 *  • **Komunitas** — koleksi `community_<ruang>` (tiga kanal); pesan ditulis ke sana.
 *  • **Diskusi AI** — koleksi `diskusi_ai`; pertanyaan & jawaban AI ditulis ke sana.
 * `data/data.txt` tetap ditulis sebagai **log/arsip** setiap pesan, dan menjadi cadangan bila
 * database tidak dapat dihubungi (mode lokal).
 *
 * Rotasi otomatis: saat jumlah pesan di database mencapai batas (bawaan 100), arsip lokal dibuat,
 * lalu **semua pesan ruang itu dihapus dari Firebase** sehingga tampilan kembali 0 percakapan.
 * Untuk Diskusi AI, `data/data.txt` tidak dikosongkan — berkas itu memang log percakapan.
 *
 * Tombol **⬇ JSON** menyimpan arsip lokal; **☁ JSON** mengunduh isi Firebase;
 * **🔗 API** membuka API JSON baca-saja di `http://127.0.0.1:<port>/api/chat.json`.
 */

const COMMUNITY_VIEW = 'dateSkunder.communityView';
const PROFILE_KEY = 'dateSkunder.community.profile';
const REMOTE_SEEN_KEY = 'dateSkunder.community.remoteSeen';
/** Penanda impor sekali: log lama Diskusi AI sudah dikirim ke koleksi `diskusi_ai`. */
const DISKUSI_IMPORT_KEY = 'dateSkunder.community.diskusiImported';
const REMOTE_INTERVAL_MS = 20000;

export interface CommunityProfile {
    name: string;
    bio: string;
}

export class CommunityLiveViewProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private live?: CommunityLive;
    private api?: ChatApiServer;
    /** Buka/gulir terminal server API JSON. */
    private showApiTerminal?: () => void;
    /** Ruang komunitas aktif (dipakai saat mengirim ke Firebase). */
    private channel = 'umum';
    private remoteTimer?: NodeJS.Timeout;
    private remoteBusy = false;
    /** Rotasi 100 pesan sedang berjalan (mencegah dua pembersihan sekaligus). */
    private rotating = false;
    /** Rotasi 100 pesan Diskusi AI sedang berjalan. */
    private aiRotating = false;
    private remoteSeen = new Set<string>();
    private remoteSeenSavedAt = 0;
    /** Pesan komunitas yang sudah dibaca dari Firebase (sumber tampilan ruang Komunitas). */
    private remoteMessages: RemoteCommunityMessage[] = [];
    /** Database berhasil dibaca pada percobaan terakhir? (false → tampilkan arsip lokal) */
    private remoteOk = false;
    /** Pesan Diskusi AI yang dibaca dari Firebase (koleksi `diskusi_ai`). */
    private aiRemoteMessages: RemoteCommunityMessage[] = [];
    /** Koleksi `diskusi_ai` berhasil dibaca? (false → tampilkan log lokal) */
    private aiRemoteOk = false;
    /** Impor log lama hanya dicoba sekali per sesi (agar tidak menulis berulang saat database menolak). */
    private discussionImportTried = false;
    /** Penanda impor sudah ditulis ke workspaceState (hindari update berulang tiap polling). */
    private discussionImportedMarked = false;
    private aiStatus = {
        enabled: false,
        ok: false,
        message: '',
        at: 0,
        count: 0,
        projectId: '',
        collection: '',
        display: false,
    };
    private remoteStatus = {
        enabled: false,
        ok: false,
        message: '',
        at: 0,
        count: 0,
        projectId: '',
        collection: '',
        display: false,
    };

    constructor(private ctx: vscode.ExtensionContext) { }

    /** Sambungkan mesin diskusi lokal (dibuat di activate()). */
    attachLive(live: CommunityLive): void {
        this.live = live;
    }

    /** Sambungkan terminal server API JSON (dibuat di activate()). */
    attachApiTerminal(show: () => void): void {
        this.showApiTerminal = show;
    }

    /** Sambungkan server API JSON lokal (dibuat di activate()). */
    attachApi(api: ChatApiServer): void {
        this.api = api;
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
        };
        view.webview.html = this.html(view.webview);
        view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
        // Diskusi otomatis hanya berjalan saat view terlihat (VS Code memberi tahu secara akurat).
        view.onDidChangeVisibility(() => {
            this.live?.setVisible(view.visible);
            if (view.visible) { void this.refreshRemote(); }
        });
        view.onDidDispose(() => {
            this.view = undefined;
            this.live?.setVisible(false);
            this.stopRemoteSync();
        });
        this.loadRemoteSeen();
        this.remoteStatus = {
            ...firebaseSummary(this.channel),
            enabled: firebaseEnabled(),
            display: firebaseDisplayEnabled(),
            ok: false,
            message: '',
            at: 0,
            count: 0,
        };
        this.aiStatus = {
            ...discussionSummary(),
            enabled: firebaseEnabled(),
            display: firebaseDisplayEnabled(),
            ok: false,
            message: '',
            at: 0,
            count: 0,
        };
        this.startRemoteSync();
    }

    /* ── Firebase: baca, arsipkan, kirim ───────────────────────────────────── */

    private loadRemoteSeen(): void {
        try {
            const raw = this.ctx.workspaceState?.get<string[]>(REMOTE_SEEN_KEY);
            this.remoteSeen = new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string').slice(-3000) : []);
        } catch {
            this.remoteSeen = new Set();
        }
    }

    private saveRemoteSeen(force = false): void {
        if (!force && Date.now() - this.remoteSeenSavedAt < 5000) { return; }
        this.remoteSeenSavedAt = Date.now();
        try {
            const list = [...this.remoteSeen].slice(-3000);
            void this.ctx.workspaceState?.update(REMOTE_SEEN_KEY, list);
        } catch {
            // Tanpa workspaceState, dedupe tetap berjalan selama sesi ini.
        }
    }

    private startRemoteSync(): void {
        if (this.remoteTimer) { return; }
        // Ruang Komunitas dibaca dari database; mode lokal tidak perlu polling.
        if (!firebaseEnabled()) { return; }
        this.remoteTimer = setInterval(() => {
            if (this.view?.visible) { void this.refreshRemote(); }
        }, REMOTE_INTERVAL_MS);
        setTimeout(() => { if (this.view?.visible) { void this.refreshRemote(); } }, 500);
    }

    private stopRemoteSync(): void {
        if (this.remoteTimer) { clearInterval(this.remoteTimer); this.remoteTimer = undefined; }
    }

    private remotePayload(): Record<string, unknown> {
        return {
            enabled: this.remoteStatus.enabled,
            display: this.remoteStatus.display,
            ok: this.remoteStatus.ok,
            message: this.remoteStatus.message,
            at: this.remoteStatus.at,
            count: this.remoteStatus.count,
            projectId: this.remoteStatus.projectId,
            collection: this.remoteStatus.collection,
        };
    }

    private postRemoteStatus(): void {
        this.post({ type: 'communityFirebaseStatus', status: this.remotePayload() });
    }

    /** Status koleksi Diskusi AI (`diskusi_ai`) untuk view. */
    private aiPayload(): Record<string, unknown> {
        return {
            enabled: this.aiStatus.enabled,
            display: this.aiStatus.display,
            ok: this.aiStatus.ok,
            message: this.aiStatus.message,
            at: this.aiStatus.at,
            count: this.aiStatus.count,
            projectId: this.aiStatus.projectId,
            collection: this.aiStatus.collection,
        };
    }

    private postAiStatus(): void {
        this.post({ type: 'communityAiStatus', status: this.aiPayload() });
    }

    /**
     * Baca pesan terbaru dari Firebase — sumber utama ruang Komunitas.
     * Pesan yang dibaca **tidak** disalin ke data/data.txt (dulu itu membuat percakapan ganda);
     * data lokal hanya log pesan yang dikirim dari komputer ini + cadangan saat database mati.
     * `allChannels` dipakai saat mengunduh JSON (semua ruang), bukan saat polling biasa.
     */
    private async refreshRemote(allChannels = false): Promise<void> {
        if (this.remoteBusy) { return; }
        if (!firebaseEnabled()) {
            this.remoteOk = false;
            this.aiRemoteOk = false;
            this.remoteStatus = {
                ...this.remoteStatus,
                ...firebaseSummary(this.channel),
                enabled: false,
                display: false,
                ok: false,
                message: 'Sinkronisasi database dimatikan — mode lokal.',
                at: Date.now(),
                count: this.remoteMessages.length,
            };
            this.aiStatus = {
                ...discussionSummary(),
                enabled: false,
                display: false,
                ok: false,
                message: 'Sinkronisasi database dimatikan — Diskusi AI dibaca dari log lokal.',
                at: Date.now(),
                count: this.aiRemoteMessages.length,
            };
            this.postRemoteStatus();
            this.postAiStatus();
            this.post({ type: 'aiRemote', messages: [], replace: true, status: this.aiPayload() });
            return;
        }
        this.remoteBusy = true;
        const channels = allChannels ? COMMUNITY_CHANNELS.map((c) => c.id) : [this.channel];
        const fetched: RemoteCommunityMessage[] = [];
        const fetchedChannels = new Set<string>();
        const errors: string[] = [];
        try {
            for (const channel of channels) {
                try {
                    const result = await listCommunityMessages(channel, 300);
                    fetched.push(...result.messages);
                    fetchedChannels.add(channel);
                    if (!allChannels) { this.remoteStatus.collection = result.collection; }
                } catch (e) {
                    errors.push(e instanceof Error ? e.message : String(e));
                }
            }
            // Ganti isi cache hanya untuk kanal yang berhasil dibaca: pesan yang sudah dihapus
            // di database (mis. rotasi dari perangkat lain) tidak boleh tetap tampil dari cache lama.
            const kept = this.remoteMessages.filter((message) => !fetchedChannels.has(message.channel));
            const byId = new Map(kept.map((message) => [message.id, message]));
            for (const message of fetched) { byId.set(message.id, message); }
            this.remoteMessages = [...byId.values()]
                .sort((a, b) => a.at - b.at)
                .slice(-600);
            // Semua kanal gagal → jangan kosongkan ruang; pakai arsip lokal sebagai cadangan.
            this.remoteOk = fetched.length > 0 || errors.length === 0;
            // Pesan database menjadi pembanding anti-duplikat mesin komunitas.
            this.live?.rememberRemote(this.remoteMessages.map((message) => message.text));
            this.remoteStatus = {
                ...firebaseSummary(this.channel),
                enabled: true,
                display: firebaseDisplayEnabled(),
                ok: errors.length === 0,
                message: errors.length ? errors[0] : '',
                at: Date.now(),
                count: this.remoteMessages.length,
            };
            this.post({
                type: 'communityRemote',
                channel: this.channel,
                messages: firebaseDisplayEnabled() && this.remoteOk ? this.remoteMessages : [],
                replace: true,
                archived: 0,
                status: this.remotePayload(),
            });
            this.postRemoteStatus();
            // Diskusi AI: koleksi `diskusi_ai` dibaca seluruhnya setiap penyegaran.
            await this.refreshDiscussion();
            // Batas 100 dihitung dari isi database → riset ulang saat tercapai.
            await this.checkRotation();
            // Segarkan riwayat: saat database berhasil dibaca, salinan lokal komunitas disembunyikan;
            // saat gagal (offline), arsip lokal ditampilkan sebagai cadangan.
            if (!allChannels) { void this.pushHistory(!this.remoteOk); }
        } finally {
            this.remoteBusy = false;
        }
    }

    /**
     * Baca SELURUH pesan Diskusi AI dari Firestore (`diskusi_ai`).
     * Saat gagal, log lokal (`data/data.txt`) tetap menjadi cadangan sehingga diskusi tidak kosong.
     */
    private async refreshDiscussion(): Promise<void> {
        try {
            let result = await listDiscussionMessages(300);
            if (!result.messages.length) {
                // Database masih kosong → pesan Diskusi AI lama dari data/data.txt diimpor sekali,
                // supaya riwayat yang dulu hanya lokal tetap terbaca (bukan tampil 0 pesan).
                const imported = await this.importDiscussionLog();
                if (imported > 0) { result = await listDiscussionMessages(300); }
            } else {
                // Koleksi sudah berisi → sesi ini tidak perlu impor lagi (juga setelah rotasi).
                this.discussionImportTried = true;
                await this.markDiscussionImported();
            }
            this.aiRemoteMessages = result.messages
                .slice()
                .sort((a, b) => a.at - b.at)
                .slice(-600);
            this.aiRemoteOk = true;
            this.aiStatus = {
                ...discussionSummary(),
                enabled: true,
                display: firebaseDisplayEnabled(),
                ok: true,
                message: '',
                at: Date.now(),
                count: this.aiRemoteMessages.length,
            };
            this.post({
                type: 'aiRemote',
                messages: firebaseDisplayEnabled() ? this.aiRemoteMessages : [],
                replace: true,
                status: this.aiPayload(),
            });
        } catch (e) {
            this.aiRemoteOk = false;
            this.aiStatus = {
                ...discussionSummary(),
                enabled: true,
                display: firebaseDisplayEnabled(),
                ok: false,
                message: e instanceof Error ? e.message : String(e),
                at: Date.now(),
                count: this.aiRemoteMessages.length,
            };
        }
        this.postAiStatus();
    }

    /** Catat bahwa impor log lama sudah dilakukan (workspaceState; tanpa itu tetap aman). */
    private async markDiscussionImported(): Promise<void> {
        if (this.discussionImportedMarked) { return; }
        this.discussionImportedMarked = true;
        try { await this.ctx.workspaceState?.update(DISKUSI_IMPORT_KEY, true); } catch { /* tanpa state */ }
    }

    /**
     * Impor sekali pesan `[DISKUSI AI]` lama dari `data/data.txt` ke koleksi `diskusi_ai`.
     * Hanya berjalan bila koleksi masih kosong dan penanda impor belum ada; dibatasi 120 pesan
     * terakhir dan satu percobaan per sesi supaya tidak menulis berulang saat database menolak.
     * Mengembalikan jumlah pesan yang berhasil dikirim.
     */
    private async importDiscussionLog(): Promise<number> {
        if (this.discussionImportTried) { return 0; }
        this.discussionImportTried = true;
        if (!firebaseEnabled()) { return 0; }
        try {
            if (this.ctx.workspaceState?.get<boolean>(DISKUSI_IMPORT_KEY)) { return 0; }
        } catch {
            // Tanpa workspaceState impor tetap aman: koleksi kosong = belum ada pesan.
        }
        const entries = (await readChatLogEntries())
            .filter((entry) => entry.room === 'diskusi')
            .slice(-120);
        if (!entries.length) {
            await this.markDiscussionImported();
            return 0;
        }
        let sent = 0;
        for (const entry of entries) {
            try {
                await sendDiscussionMessage({
                    name: entry.name || 'Spider AI',
                    bio: '',
                    text: entry.text,
                    at: entry.atMs || Date.now(),
                    lang: '',
                    langTag: String(entry.tag || '').split(' · ')[1] || '',
                    kind: entry.kind,
                    room: 'diskusi',
                });
                sent += 1;
            } catch {
                return sent;
            }
        }
        if (sent === entries.length) { await this.markDiscussionImported(); }
        return sent;
    }

    /** Kirim satu pesan (Komunitas atau Diskusi AI) ke Firebase — tidak pernah melempar ke UI). */
    private async publishRemote(draft: {
        name: string;
        bio?: string;
        text: string;
        at?: number;
        lang?: string;
        langTag?: string;
        kind?: 'chat' | 'answer' | 'system';
        channel?: string;
        room?: 'komunitas' | 'diskusi';
    }): Promise<void> {
        if (!firebaseEnabled()) { return; }
        const room = draft.room === 'diskusi' ? 'diskusi' : 'komunitas';
        const channel = String(draft.channel || this.channel || 'umum');
        const at = draft.at || Date.now();
        try {
            const result = room === 'diskusi'
                ? await sendDiscussionMessage({
                    name: draft.name,
                    bio: draft.bio || '',
                    text: draft.text,
                    at,
                    lang: draft.lang || '',
                    langTag: draft.langTag || '',
                    kind: draft.kind || 'chat',
                    room: 'diskusi',
                })
                : await sendCommunityMessage({
                    name: draft.name,
                    bio: draft.bio || '',
                    text: draft.text,
                    at,
                    lang: draft.lang || '',
                    langTag: draft.langTag || '',
                    kind: draft.kind || 'chat',
                    channel,
                });
            const posted: RemoteCommunityMessage = {
                id: result.id,
                room,
                channel: room === 'diskusi' ? '' : channel,
                name: String(draft.name || 'anggota'),
                bio: String(draft.bio || ''),
                text: String(draft.text || ''),
                at,
                lang: String(draft.lang || ''),
                langTag: String(draft.langTag || ''),
                kind: draft.kind || 'chat',
                remote: true,
            };
            if (room === 'diskusi') {
                // Simpan di cache Diskusi AI supaya langsung terhitung & tampil tanpa menunggu polling.
                this.aiRemoteMessages.push(posted);
                this.aiRemoteMessages = this.aiRemoteMessages.sort((a, b) => a.at - b.at).slice(-600);
                this.aiRemoteOk = true;
                this.aiStatus = {
                    ...this.aiStatus,
                    enabled: true,
                    ok: true,
                    message: '',
                    at: Date.now(),
                    count: this.aiRemoteMessages.length,
                    collection: result.collection,
                };
                this.post({
                    type: 'aiRemote',
                    messages: firebaseDisplayEnabled() ? this.aiRemoteMessages : [],
                    replace: true,
                    status: this.aiPayload(),
                });
            } else {
                this.remoteSeen.add(result.id);
                this.saveRemoteSeen(true);
                this.remoteMessages.push(posted);
                this.remoteMessages = this.remoteMessages.sort((a, b) => a.at - b.at).slice(-600);
                this.remoteStatus = { ...this.remoteStatus, enabled: true, ok: true, message: '', at: Date.now(), count: this.remoteMessages.length, collection: result.collection };
                this.remoteOk = true;
            }
            this.live?.rememberRemote([draft.text]);
            // Pesan ke-100 (atau lebih) → rotasi, termasuk menghapus Firebase.
            void this.checkRotation();
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (room === 'diskusi') {
                this.aiStatus = { ...this.aiStatus, enabled: true, ok: false, message, at: Date.now() };
                this.postAiStatus();
                return;
            }
            this.remoteStatus = { ...this.remoteStatus, enabled: true, ok: false, message, at: Date.now() };
            this.post({ type: 'communityFirebaseStatus', status: this.remotePayload() });
        }
    }

    /** Profil tersimpan (nama + deskripsi); spasi berlebih dipangkas. */
    profile(): CommunityProfile {
        const raw = this.ctx.globalState.get<Partial<CommunityProfile>>(PROFILE_KEY) || {};
        return { name: String(raw.name ?? '').trim(), bio: String(raw.bio ?? '').trim() };
    }

    private async saveProfile(patch: Partial<CommunityProfile>): Promise<CommunityProfile> {
        const now = this.profile();
        const next: CommunityProfile = {
            name: patch.name === undefined ? now.name : String(patch.name).trim().slice(0, 32),
            bio: patch.bio === undefined ? now.bio : String(patch.bio).trim().slice(0, 160),
        };
        await this.ctx.globalState.update(PROFILE_KEY, next);
        return next;
    }

    private avatarUri(webview: vscode.Webview): string {
        return String(webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'community-default.png')));
    }

    /** Mode bahasa jawaban Community Chat ('auto', 'mix', atau kode bahasa). */
    private replyLanguage(): string {
        const mode = String(vscode.workspace.getConfiguration('dateSkunder').get<string>('community.replyLanguage') ?? 'auto').toLowerCase();
        return ['auto', 'mix', ...LIVE_LANGS.map((l) => l.code)].includes(mode) ? mode : 'auto';
    }

    /** Payload awal: konfigurasi + riwayat lokal + pesan Firebase kedua ruang. */
    private async configPayload(webview: vscode.Webview) {
        const entries = await readChatLogEntries();
        const remote = firebaseEnabled() && firebaseDisplayEnabled() && this.remoteOk ? this.remoteMessages : [];
        const aiRemote = firebaseEnabled() && firebaseDisplayEnabled() && this.aiRemoteOk ? this.aiRemoteMessages : [];
        return {
            type: 'communityConfig',
            defaultAvatar: this.avatarUri(webview),
            profile: this.profile(),
            channels: COMMUNITY_CHANNELS,
            live: this.live?.status(),
            langs: LIVE_LANGS,
            replyLanguage: this.replyLanguage(),
            recent: this.live?.recent('komunitas') ?? [],
            aiRecent: this.live?.recent('diskusi') ?? [],
            logLabel: chatLogLabel(),
            history: this.localHistory(entries),
            remoteMessages: remote,
            aiRemoteMessages: aiRemote,
            autoClearAt: maxChatMessages(),
            firebaseDisplay: firebaseDisplayEnabled(),
            firebase: this.remotePayload(),
            diskusi: this.aiPayload(),
            api: this.apiPayload(),
        };
    }

    /**
     * Riwayat lokal yang ditampilkan. Saat Firebase aktif, ruang Komunitas & Diskusi AI dibaca
     * langsung dari database — salinan lokalnya tidak ikut ditampilkan supaya tidak tampil dua kali.
     * Bila koleksi `diskusi_ai` gagal dibaca, log lokal dipakai sebagai cadangan.
     */
    private localHistory(entries: ChatLogEntry[], withCommunity = false): ChatLogEntry[] {
        if (firebaseEnabled() && firebaseDisplayEnabled()) {
            return this.visibleHistory(entries).filter((entry) => {
                if (entry.room === 'komunitas') { return withCommunity; }
                if (entry.room === 'diskusi') { return !this.aiRemoteOk; }
                return true;
            });
        }
        return this.visibleHistory(entries);
    }

    /** Riwayat yang boleh tampil: pesan database disembunyikan bila tampilan database dimatikan. */
    private visibleHistory(entries: ChatLogEntry[]): ChatLogEntry[] {
        if (firebaseDisplayEnabled()) { return entries; }
        return entries.filter((entry) => !(entry.room === 'komunitas' && /firebase/i.test(entry.tag)));
    }

    /** Kirim ulang riwayat (dipakai saat berkas catatan berubah / view terlihat lagi). */
    async pushHistory(withCommunityFallback = false): Promise<void> {
        const raw = await readChatLogEntries();
        const history = this.localHistory(raw, withCommunityFallback);
        const remote = firebaseEnabled() && firebaseDisplayEnabled() && this.remoteOk && !withCommunityFallback
            ? this.remoteMessages
            : [];
        const aiRemote = firebaseEnabled() && firebaseDisplayEnabled() && this.aiRemoteOk
            ? this.aiRemoteMessages
            : [];
        this.post({
            type: 'chatHistory',
            history,
            remoteMessages: remote,
            aiRemoteMessages: aiRemote,
            aiStatus: this.aiPayload(),
            logLabel: chatLogLabel(),
            total: history.length + remote.length + aiRemote.length,
            autoClearAt: maxChatMessages(),
        });
        void this.checkRotation();
    }

    /**
     * Batas pesan dihitung dari **isi database** (bukan dari data/data.txt).
     * Diskusi AI punya koleksi sendiri (`diskusi_ai`) sehingga rotasinya terpisah dari komunitas.
     */
    private async checkRotation(): Promise<void> {
        await this.checkDiscussionRotation();
        if (this.rotating) { return; }
        const limit = maxChatMessages();
        if (limit <= 0) { return; }
        if (firebaseEnabled()) {
            // Hitung ketiga koleksi sekaligus; yang gagal memakai isi cache sebagai perkiraan.
            const results = await Promise.all(COMMUNITY_CHANNELS.map(async (channel) => {
                try {
                    return { ok: true, count: await countCommunityMessages(channel.id, 6000) };
                } catch {
                    return { ok: false, count: this.remoteMessages.filter((m) => m.channel === channel.id).length };
                }
            }));
            const counted = results.some((row) => row.ok);
            const total = counted
                ? results.reduce((sum, row) => sum + row.count, 0)
                : this.remoteMessages.length;
            if (total >= limit) { await this.rotateCommunity(total, 'firebase'); }
            return;
        }
        const entries = await readChatLogEntries();
        if (shouldClearChat(entries, limit)) {
            await this.rotateCommunity(communityMessageCount(entries), 'lokal');
        }
    }

    /**
     * Rotasi otomatis: arsipkan catatan lokal, kosongkan tampilan (0 percakapan), hapus SEMUA pesan
     * komunitas dari Firebase, lalu mulai riset ulang dengan agenda analisis baru.
     */
    private async rotateCommunity(count: number, source: 'firebase' | 'lokal'): Promise<void> {
        if (this.rotating) { return; }
        this.rotating = true;
        const limit = maxChatMessages();
        try {
            this.post({ type: 'chatClearing', limit, count });
            const entries = await readChatLogEntries();
            let archive: string | undefined;
            if (entries.length) {
                archive = await archiveChatLog();
                if (!archive) {
                    this.post({
                        type: 'chatClearResult',
                        ok: false,
                        deleted: 0,
                        failed: 0,
                        message: 'Arsip gagal dibuat; chat tidak dihapus agar data tidak hilang.',
                    });
                    return;
                }
            }
            await clearChatLog(`rotasi otomatis: ${count} pesan (${source})${archive ? `, arsip ${path.basename(archive)}` : ''}`);
            let deleted = 0;
            let failed = 0;
            const errors: string[] = [];
            if (firebaseEnabled()) {
                for (const channel of COMMUNITY_CHANNELS) {
                    const result = await deleteAllCommunityMessages(channel.id);
                    deleted += result.deleted;
                    failed += result.failed;
                    errors.push(...result.errors);
                }
            }
            // Tampilan langsung kosong (0 percakapan), termasuk cache database.
            this.remoteMessages = [];
            this.remoteSeen.clear();
            this.saveRemoteSeen(true);
            this.remoteStatus = {
                ...firebaseSummary(this.channel),
                enabled: firebaseEnabled(),
                display: firebaseDisplayEnabled(),
                ok: errors.length === 0,
                message: errors[0] || '',
                at: Date.now(),
                count: 0,
            };
            this.post({ type: 'chatCleared', limit, count, archived: archive || '' });
            this.post({
                type: 'chatClearResult',
                ok: failed === 0 && errors.length === 0,
                skipped: !firebaseEnabled(),
                deleted,
                failed,
                archived: archive || '',
                message: errors[0] || '',
            });
            await this.pushHistory();
            // Riset ulang: 0 percakapan, agenda dibangun lagi dari analisis terakhir.
            this.live?.beginResearchRound();
            this.postRemoteStatus();
        } catch (e) {
            this.post({
                type: 'chatClearResult',
                ok: false,
                deleted: 0,
                failed: 0,
                message: e instanceof Error ? e.message : String(e),
            });
        } finally {
            this.rotating = false;
        }
    }

    /**
     * Rotasi Diskusi AI: hitung pesan `diskusi_ai` di Firebase; saat mencapai batas (bawaan 100)
     * semua pesan dihapus dari database sehingga ruang kembali 0 percakapan.
     * `data/data.txt` **tidak** dikosongkan — berkas itu tetap menjadi log percakapan.
     */
    private async checkDiscussionRotation(): Promise<void> {
        if (this.aiRotating) { return; }
        const limit = maxChatMessages();
        if (limit <= 0 || !firebaseEnabled()) { return; }
        let count: number;
        try {
            count = await countDiscussionMessages(6000);
        } catch {
            // Database tidak bisa dihitung → perkiraan dari cache (tidak memicu rotasi palsu).
            count = this.aiRemoteMessages.length;
        }
        if (shouldRotateDiscussion(count, limit)) { await this.rotateDiscussion(count); }
    }

    /**
     * Hapus seluruh pesan Diskusi AI dari Firebase (koleksi `diskusi_ai`) setelah batas tercapai.
     * Sebelum menghapus, salinan log dibuat di `data/arsip/`; data/data.txt tetap utuh sebagai log.
     */
    private async rotateDiscussion(count: number): Promise<void> {
        if (this.aiRotating) { return; }
        this.aiRotating = true;
        const limit = maxChatMessages();
        try {
            this.post({ type: 'chatClearing', room: 'diskusi', limit, count });
            const archive = await archiveChatLog();
            const result = await deleteAllDiscussionMessages();
            // Tampilan Diskusi AI langsung kosong (0 percakapan); log lokal tidak disentuh.
            this.aiRemoteMessages = [];
            this.aiRemoteOk = result.failed === 0;
            this.aiStatus = {
                ...discussionSummary(),
                enabled: true,
                display: firebaseDisplayEnabled(),
                ok: result.failed === 0 && result.errors.length === 0,
                message: result.errors[0] || '',
                at: Date.now(),
                count: 0,
            };
            // Ingatan sesi Diskusi AI dikosongkan supaya jawaban berikutnya tidak merujuk pesan lama.
            this.live?.resetDiscussion();
            this.post({
                type: 'aiCleared',
                limit,
                count,
                archived: archive || '',
                deleted: result.deleted,
                failed: result.failed,
                message: result.errors[0] || '',
            });
            appendChatLogNote(`rotasi Diskusi AI: ${count} pesan dihapus dari Firebase, log tetap di ${chatLogLabel()}`);
            await this.pushHistory();
            this.postAiStatus();
        } catch (e) {
            this.post({
                type: 'aiClearResult',
                ok: false,
                deleted: 0,
                failed: 0,
                message: e instanceof Error ? e.message : String(e),
            });
        } finally {
            this.aiRotating = false;
        }
    }

    private html(webview: vscode.Webview): string {
        const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'community.css'));
        const cssLive = webview.asWebviewUri(vscode.Uri.joinPath(media, 'community-live.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'community.js'));
        const n = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
        const logLabel = chatLogLabel();
        const cfg = {
            defaultAvatar: this.avatarUri(webview),
            profile: this.profile(),
            channels: COMMUNITY_CHANNELS,
            live: this.live?.status(),
            langs: LIVE_LANGS,
            replyLanguage: this.replyLanguage(),
            logLabel,
            firebase: this.remotePayload(),
            diskusi: this.aiPayload(),
            remoteMessages: this.remoteMessages,
            aiRemoteMessages: this.aiRemoteMessages,
            firebaseDisplay: firebaseDisplayEnabled(),
            api: this.apiPayload(),
        };
        return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
<link href="${css}" rel="stylesheet">
<link href="${cssLive}" rel="stylesheet">
<title>Community Chat</title>
</head>
<body class="cw-body">
<div class="cw-root">
    <div class="cw-head">
        <strong>💬 Obrolan</strong>
        <span id="cw-state" class="cw-state">menyiapkan…</span>
    </div>

    <div class="cw-tabs" role="tablist">
        <button id="cw-tab-community" class="cw-tab on" type="button" role="tab" aria-selected="true">👥 Komunitas</button>
        <button id="cw-tab-ai" class="cw-tab" type="button" role="tab" aria-selected="false">🧠 Diskusi AI</button>
    </div>

    <div id="cw-pane-community" class="cw-pane">
        <div class="cw-bar">
            <select id="cw-channel" title="Ruang obrolan — labelnya ikut tercatat di data/data.txt"></select>
            <button id="cw-live" class="cw-ib cw-live" type="button" title="Diskusi komunitas otomatis saat llama-server berjalan (klik untuk menyalakan/mematikan)">⚡ Ramai</button>
            <button id="cw-lang" class="cw-ib cw-langbtn" type="button" aria-expanded="false" title="Pilih bahasa anggota komunitas — boleh lebih dari satu">🌐 <span id="cw-lang-count">·</span></button>
            <button id="cw-refresh" class="cw-ib" type="button" title="Baca ulang seluruh catatan dari data/data.txt">⟳</button>
        </div>
        <div id="cw-live-note" class="cw-live-note" hidden></div>
        <section id="cw-lang-menu" class="cw-lang-menu" hidden aria-label="Pilihan bahasa komunitas">
            <div class="cw-lang-head">
                <strong>Bahasa komunitas</strong>
                <span class="cw-muted">boleh lebih dari satu</span>
            </div>
            <div id="cw-lang-list" class="cw-lang-list"></div>
            <div class="cw-lang-actions">
                <button id="cw-lang-all" class="cw-btn" type="button">Semua bahasa</button>
                <button id="cw-lang-reset" class="cw-btn" type="button">Reset</button>
            </div>
            <label class="cw-lang-reply">Bahasa jawaban
                <select id="cw-reply-lang"></select>
            </label>
            <div id="cw-lang-note" class="cw-muted cw-lang-note"></div>
        </section>

        <details id="cw-me" class="cw-me" open>
            <summary>👤 Profil Saya <span id="cw-me-sum" class="cw-muted"></span></summary>
            <div class="cw-avatar-row">
                <img id="cw-avatar" class="cw-avatar" alt="Avatar bawaan" />
                <div class="cw-muted">Nama &amp; deskripsi ikut tercatat pada setiap pesan. Ruang Komunitas dan Diskusi AI dibaca dari database (bila aktif); semuanya tetap ditulis sebagai log di <code>data/data.txt</code>.</div>
            </div>
            <label>Nama Tampilan / Username<input id="cw-name" type="text" maxlength="32" placeholder="Nama atau username kamu…" /></label>
            <label>Deskripsi Profil (Status / Bio)<input id="cw-bio" type="text" maxlength="160" placeholder="Deskripsi singkat, mis. Analis Data, suka C4.5 &amp; Streamlit" /></label>
            <button id="cw-save" class="cw-btn" type="button">Simpan Profil</button>
            <div id="cw-save-note" class="cw-note" hidden></div>
        </details>

        <div id="cw-msgs" class="cw-msgs" role="log" aria-live="polite" aria-relevant="additions"></div>
        <button id="cw-jump" class="cw-jump" type="button" hidden>↓ pesan baru</button>

        <div class="cw-extra-bar" id="cw-extra-bar">
            <button id="cw-send-skin" class="cw-ib cw-extra-btn" type="button" title="Bagikan skin aktif ke ruang komunitas (tercatat di data/data.txt)">🎨 Bagikan Skin</button>
            <button id="cw-send-ai" class="cw-ib cw-extra-btn" type="button" title="Bagikan hasil analisis AI terakhir ke ruang komunitas" style="display:none;">🤖 Bagikan ke Chat</button>
        </div>

        <div class="cw-countline"><span id="cw-count">0/900</span><span>Enter kirim · Shift+Enter baris baru</span></div>
        <div class="cw-input">
            <textarea id="cw-text" rows="2" maxlength="900" placeholder="Tulis pesan komunitas… (Enter kirim · Shift+Enter baris baru)"></textarea>
            <button id="cw-send" class="cw-btn" type="button">Kirim</button>
        </div>
    </div>

    <div id="cw-pane-ai" class="cw-pane" hidden>
        <div class="cw-ai-head">
            <div><b>🧠 Diskusi AI</b> bahas satu permasalahan data; jawabannya menyesuaikan pertanyaan (penyebab, langkah, angka, perbandingan).</div>
        </div>
        <div id="cw-ai-msgs" class="cw-msgs cw-ai-msgs" role="log" aria-live="polite" aria-relevant="additions"></div>
        <button id="cw-jump-ai" class="cw-jump" type="button" hidden>↓ jawaban baru</button>
        <div class="cw-countline"><span id="cw-ai-count">0/4000</span><span>Jawaban mengikuti pertanyaan · tanpa heading template</span></div>
        <div class="cw-input">
            <textarea id="cw-ai-text" rows="3" maxlength="4000" placeholder="Tulis permasalahan data… mis. “kenapa margin turun bulan terakhir?”"></textarea>
            <button id="cw-ai-send" class="cw-btn" type="button">Kirim</button>
        </div>
        <div class="cw-muted cw-ai-tips">Contoh: “tuntaskan masalah stok kritis” · “kenapa penjualan turun?” · “jelaskan akurasi C4.5 dan risikonya”.</div>
    </div>

    <div class="cw-logline">
        <span>📄 log: <code>${logLabel}</code></span>
        <button id="cw-open-log" class="cw-ib" type="button" title="Buka log obrolan (arsip lokal — sumber tampilan tetap Firebase)">Buka</button>
        <button id="cw-json" class="cw-ib cw-json" type="button" title="Unduh seluruh arsip lokal (semua ruang) sebagai JSON">⬇ JSON</button>
        <button id="cw-json-fb" class="cw-ib cw-json cw-cloud" type="button" title="Unduh isi database ruang komunitas sebagai JSON">☁ JSON</button>
        <button id="cw-api" class="cw-ib cw-api" type="button" title="Buka API JSON baca-saja (127.0.0.1)">🔗 API</button>
        <button id="cw-api-term" class="cw-ib cw-term" type="button" title="Buka terminal server API JSON — server berjalan di laptop ini dan siap dipakai website">🖥 Terminal</button>
    </div>
    <div id="cw-api-line" class="cw-api-line" hidden>
        <code id="cw-api-url"></code>
        <button id="cw-api-copy" class="cw-ib" type="button" title="Salin URL API">Salin</button>
        <button id="cw-api-term-2" class="cw-ib cw-term" type="button" title="Buka terminal server API JSON">🖥 Terminal</button>
    </div>
    <div id="cw-api-term-note" class="cw-api-term-note" hidden>
        <span id="cw-api-term-dot" class="cw-term-dot" aria-hidden="true"></span>
        <span id="cw-api-term-state">Server API JSON berjalan di terminal “API JSON Chat”.</span>
        <button id="cw-api-term-open" class="cw-ib cw-term" type="button" title="Buka terminal server API JSON">Buka Terminal</button>
    </div>
</div>
<script nonce="${n}">window.SKUNDER_COMMUNITY = ${JSON.stringify(cfg)};</script>
<script nonce="${n}" src="${js}"></script>
</body>
</html>`;
    }

    private post(message: unknown): void {
        void this.view?.webview.postMessage(message);
    }

    /** Dipakai CommunityLive untuk mengirim pesan/indikator ke view. */
    postLive(message: unknown): void { this.post(message); }

    /** Segarkan indikator ⚡ Ramai di view (dipakai perintah nyala/mati). */
    refreshStatus(): void {
        this.post({ type: 'communityLiveStatus', status: this.live?.status() });
        this.post({ type: 'communityFirebaseStatus', status: this.remotePayload() });
        this.post({ type: 'communityAiStatus', status: this.aiPayload() });
        this.post({ type: 'chatApiInfo', api: this.apiPayload() });
    }

    /** Informasi API JSON untuk ditampilkan di view. */
    private apiPayload(): Record<string, unknown> {
        const cfg = vscode.workspace.getConfiguration('dateSkunder');
        const info = this.api?.info();
        return {
            enabled: cfg.get<boolean>('community.api') ?? true,
            running: !!info?.running,
            url: info?.url || '',
            chat: info?.endpoints.chat || '',
            community: info?.endpoints.community || '',
            diskusi: info?.endpoints.diskusi || '',
            firebase: info?.endpoints.firebase || '',
        };
    }

    private apiPort(): number {
        const value = vscode.workspace.getConfiguration('dateSkunder').get<number>('community.apiPort') ?? 47831;
        return Math.max(0, Math.min(65535, Math.round(Number(value) || 0)));
    }

    /** Buka API JSON di browser (server dinyalakan lebih dulu bila perlu). */
    async openChatApi(): Promise<void> {
        if (!(vscode.workspace.getConfiguration('dateSkunder').get<boolean>('community.api') ?? true)) {
            void vscode.window.showWarningMessage('API JSON dimatikan. Aktifkan dateSkunder.community.api untuk memakainya.');
            return;
        }
        if (!this.api) {
            void vscode.window.showWarningMessage('Server API JSON belum siap. Muat ulang jendela lalu coba lagi.');
            return;
        }
        if (!this.api.running) {
            try { await this.api.start(this.apiPort()); } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                void vscode.window.showErrorMessage(`API JSON tidak bisa dinyalakan: ${message}`);
                return;
            }
        }
        const url = this.api.info().endpoints.chat;
        this.post({ type: 'chatApiInfo', api: this.apiPayload() });
        this.showApiTerminal?.();
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }

    /** Salin URL API JSON ke papan klip. */
    async copyChatApi(): Promise<void> {
        if (!(vscode.workspace.getConfiguration('dateSkunder').get<boolean>('community.api') ?? true)) {
            void vscode.window.showWarningMessage('API JSON dimatikan. Aktifkan dateSkunder.community.api untuk memakainya.');
            return;
        }
        if (!this.api) { return; }
        if (!this.api.running) {
            try { await this.api.start(this.apiPort()); } catch { /* pesan di bawah */ }
        }
        const url = this.api.info().url;
        if (!url) {
            void vscode.window.showWarningMessage('API JSON belum berjalan. Periksa pengaturan dateSkunder.community.apiPort.');
            return;
        }
        await vscode.env.clipboard.writeText(`${url}/api/chat.json`);
        this.post({ type: 'chatApiInfo', api: this.apiPayload() });
        void vscode.window.showInformationMessage(`URL API JSON disalin: ${url}/api/chat.json`);
    }

    /**
     * Unduh isi ruang komunitas langsung dari Firebase sebagai JSON.
     * Arsip lokal (data/data.txt) tetap tidak berubah; ini salinan untuk dipakai API/pihak lain.
     */
    async downloadRemoteJson(): Promise<void> {
        if (!firebaseEnabled()) {
            this.post({ type: 'chatJsonError', message: 'Sinkronisasi database dimatikan (dateSkunder.community.firebase).' });
            return;
        }
        try {
            const messages: RemoteCommunityMessage[] = [];
            const collections: string[] = [];
            const errors: string[] = [];
            for (const channel of COMMUNITY_CHANNELS.map((c) => c.id)) {
                try {
                    const result = await listCommunityMessages(channel, 300);
                    collections.push(result.collection);
                    messages.push(...result.messages);
                } catch (e) {
                    errors.push(e instanceof Error ? e.message : String(e));
                }
            }
            // Diskusi AI ikut diunduh dari koleksinya sendiri (`diskusi_ai`).
            let discussionCount = 0;
            try {
                const diskusi = await listDiscussionMessages(300);
                collections.push(diskusi.collection);
                messages.push(...diskusi.messages);
                discussionCount = diskusi.messages.length;
            } catch (e) {
                errors.push(e instanceof Error ? e.message : String(e));
            }
            messages.sort((a, b) => a.at - b.at);
            const folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            const dir = folder ? path.join(folder, 'data') : path.dirname(chatLogFile());
            const p = (n: number) => String(n).padStart(2, '0');
            const now = new Date();
            const name = `percakapan-database-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(dir, name)),
                saveLabel: 'Unduh JSON database',
                filters: { JSON: ['json'] },
                title: `Unduh ${messages.length} pesan database sebagai JSON`,
            });
            if (!target) {
                this.post({ type: 'chatJsonCancelled' });
                return;
            }
            const doc = {
                app: 'Date Skunder',
                format: 'date-skunder.chat.firebase',
                version: 1,
                exportedAt: new Date().toISOString(),
                projectId: firebaseSummary(this.channel).projectId,
                collections,
                errors,
                total: messages.length,
                rooms: { komunitas: messages.length - discussionCount, diskusi: discussionCount },
                messages,
            };
            const payload = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8');
            await vscode.workspace.fs.writeFile(target, payload);
            this.post({ type: 'chatJsonSaved', source: 'firebase', path: target.fsPath, total: messages.length, rooms: doc.rooms });
            const aksi = await vscode.window.showInformationMessage(
                `Pesan database (${messages.length}) diunduh sebagai JSON: ${path.basename(target.fsPath)}`,
                'Buka berkas',
            );
            if (aksi) { await vscode.window.showTextDocument(target, { preview: false }); }
        } catch (e) {
            const pesan = e instanceof Error ? e.message : String(e);
            this.post({ type: 'chatJsonError', message: pesan });
            void vscode.window.showErrorMessage(`Gagal mengunduh JSON database: ${pesan}`);
        }
    }

    /**
     * Unduh KESELURUHAN percakapan (semua ruang) sebagai satu berkas JSON.
     * Berkas ditulis lewat dialog simpan VS Code; bentuknya stabil untuk dipakai API lain.
     */
    async downloadChatJson(): Promise<void> {
        try {
            const doc = await chatLogJson();
            const folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            const dir = folder ? path.join(folder, 'data') : path.dirname(chatLogFile());
            const p = (n: number) => String(n).padStart(2, '0');
            const now = new Date();
            const name = `percakapan-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
            const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(dir, name)),
                saveLabel: 'Unduh JSON',
                filters: { JSON: ['json'] },
                title: `Unduh ${doc.total} pesan percakapan sebagai JSON`,
            });
            if (!target) {
                this.post({ type: 'chatJsonCancelled' });
                return;
            }
            const payload = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8');
            await vscode.workspace.fs.writeFile(target, payload);
            this.post({ type: 'chatJsonSaved', path: target.fsPath, total: doc.total, rooms: doc.rooms });
            const aksi = await vscode.window.showInformationMessage(
                `Percakapan (${doc.total} pesan) diunduh sebagai JSON: ${path.basename(target.fsPath)}`,
                'Buka berkas',
            );
            if (aksi) { await vscode.window.showTextDocument(target, { preview: false }); }
        } catch (e) {
            const pesan = e instanceof Error ? e.message : String(e);
            this.post({ type: 'chatJsonError', message: pesan });
            void vscode.window.showErrorMessage(`Gagal mengunduh JSON percakapan: ${pesan}`);
        }
    }

    private async onMessage(msg: any): Promise<void> {
        switch (msg?.type) {
            case 'ready':
                if (this.view) {
                    this.post(await this.configPayload(this.view.webview));
                    this.live?.setVisible(true);
                    // Baca database di latar belakang supaya view tidak menunggu jaringan.
                    void this.refreshRemote();
                    // Periksa batas 100 pesan juga saat view dibuka (tanpa menunggu pesan baru).
                    void this.pushHistory();
                }
                break;
            case 'saveProfile': {
                const profil = await this.saveProfile({ name: msg.name, bio: msg.bio });
                this.post({ type: 'communityProfile', profile: profil });
                break;
            }
            case 'askCommunity': {
                // Pesan pengguna → data/data.txt + Firebase → jawaban langsung dari persona relevan.
                const text = String(msg.text ?? '').slice(0, 900);
                const channel = String(msg.channel ?? this.channel).trim().slice(0, 40) || this.channel;
                this.channel = channel;
                this.live?.setChannel(channel);
                const author = String(msg.author ?? this.profile().name ?? 'Kamu').trim().slice(0, 40) || 'Kamu';
                if (text.trim()) {
                    void this.publishRemote({
                        name: author,
                        bio: this.profile().bio,
                        text: text.trim(),
                        channel,
                        kind: 'chat',
                    });
                    void this.live?.ask(text, author);
                }
                break;
            }
            case 'aiAsk': {
                // Diskusi AI: percakapan hidup di Firebase `diskusi_ai`; data/data.txt hanya log.
                const text = String(msg.text ?? '').slice(0, 4000);
                const author = String(msg.author ?? this.profile().name ?? 'Kamu').trim().slice(0, 40) || 'Kamu';
                if (text.trim()) {
                    void this.publishRemote({
                        name: author,
                        bio: this.profile().bio,
                        text: text.trim(),
                        kind: 'chat',
                        channel: '',
                        room: 'diskusi',
                    });
                    void this.live?.askDiscussion(text, String(msg.author ?? ''));
                }
                break;
            }
            case 'appendChat': {
                // Pesan yang dibagikan dari panel lain (skin / hasil analisis AI).
                const text = String(msg.text ?? '').slice(0, 4000).trim();
                if (!text) { break; }
                const author = String(msg.author ?? 'Kamu').trim().slice(0, 40) || 'Kamu';
                const channel = String(msg.channel ?? 'umum').trim().slice(0, 40) || 'umum';
                const tag = String(msg.tag ?? 'dibagikan').trim().slice(0, 60);
                appendChatLog('komunitas', author, text, tag, `KOMUNITAS #${channel}`);
                void this.publishRemote({ name: author, bio: this.profile().bio, text, channel, kind: 'chat' });
                this.post({
                    type: 'communityLive',
                    message: {
                        id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        name: author,
                        bio: this.profile().bio,
                        text,
                        at: Date.now(),
                        lang: '',
                        langTag: '',
                        local: true,
                        kind: 'chat',
                        room: 'komunitas',
                        channel,
                    },
                });
                break;
            }
            case 'channelChanged':
                this.channel = String(msg.channel ?? '').trim().slice(0, 40) || this.channel;
                this.live?.setChannel(this.channel);
                this.remoteStatus = { ...this.remoteStatus, ...firebaseSummary(this.channel) };
                void this.refreshRemote();
                break;
            case 'refreshRemote':
                await this.refreshRemote();
                break;
            case 'reloadHistory':
                await this.pushHistory();
                break;
            case 'downloadChatJson':
                await this.downloadChatJson();
                break;
            case 'downloadRemoteJson':
                await this.downloadRemoteJson();
                break;
            case 'openChatApi':
                await this.openChatApi();
                break;
            case 'copyChatApi':
                await this.copyChatApi();
                break;
            case 'openChatApiTerminal':
                this.showApiTerminal?.();
                break;
            case 'openChatLog':
                await openChatLog();
                break;
            case 'communityVisible': {
                this.live?.setVisible(!!msg.visible);
                // Saat view terlihat lagi, baca ulang berkas + Firebase supaya pesan baru ikut tampil.
                if (msg.visible) {
                    await this.pushHistory();
                    void this.refreshRemote();
                }
                break;
            }
            case 'liveToggle': {
                const cfg = vscode.workspace.getConfiguration('dateSkunder');
                const current = cfg.get<boolean>('community.live') ?? true;
                const next = typeof msg.enabled === 'boolean' ? msg.enabled : !current;
                await cfg.update('community.live', next, vscode.ConfigurationTarget.Global);
                this.post({ type: 'communityLiveStatus', status: this.live?.status() });
                break;
            }
            case 'setCommunityLanguages': {
                // Pilihan bahasa dari view (🌐): boleh lebih dari satu, urut katalog.
                const next = await saveConfiguredLangs(msg.languages);
                this.post({
                    type: 'communityLiveStatus',
                    status: this.live?.status(),
                    langs: next,
                    replyLanguage: this.replyLanguage(),
                });
                break;
            }
            case 'setReplyLanguage': {
                const next = await saveReplyLanguage(msg.mode);
                this.post({ type: 'communityLiveStatus', status: this.live?.status(), replyLanguage: next });
                break;
            }
        }
    }

    /** Kirim teks AI / skin ke chat komunitas dari panel lain (spider, viewer). */
    sendAiResult(text: string): void {
        this.post({ type: 'prefillMessage', text });
    }

    /** Kirim payload data skin (JSON/base64) ke webview komunitas agar bisa dibagikan. */
    sendSkinData(payload: Record<string, unknown>): void {
        this.post({ type: 'skinData', payload });
    }

    /** Dipakai CommunityLive untuk menyiarkan pesan Komunitas / Diskusi AI ke Firebase. */
    publishRemoteMessage(draft: {
        name: string;
        bio: string;
        text: string;
        at: number;
        lang: string;
        langTag: string;
        kind: 'chat' | 'answer' | 'system';
        channel: string;
        room?: 'komunitas' | 'diskusi';
    }): void {
        void this.publishRemote(draft);
    }

    /** Pesan lokal yang sudah ada (dipakai saat view dibuka kembali). */
    recent(): LiveMessage[] { return this.live?.recent() ?? []; }
}

/** Daftarkan view Community Chat + mesin diskusi lokal dan perintahnya. */
export function registerCommunityLiveView(context: vscode.ExtensionContext, live: CommunityLive, api?: ChatApiServer): CommunityLiveViewProvider {
    const provider = new CommunityLiveViewProvider(context);
    provider.attachLive(live);
    if (api) { provider.attachApi(api); }
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(COMMUNITY_VIEW, provider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.commands.registerCommand('date-skunder.community.open', async () => {
            await vscode.commands.executeCommand(`${COMMUNITY_VIEW}.focus`);
        }),
        vscode.commands.registerCommand('date-skunder.community.api', async () => {
            await provider.openChatApi();
        }),
        vscode.commands.registerCommand('date-skunder.community.live', async () => {
            const cfg = vscode.workspace.getConfiguration('dateSkunder');
            const next = !(cfg.get<boolean>('community.live') ?? true);
            await cfg.update('community.live', next, vscode.ConfigurationTarget.Global);
            provider.refreshStatus();
            void vscode.window.showInformationMessage(next
                ? '⚡ Diskusi otomatis Community Chat dinyalakan. Nyalakan llama-server (▶ di Chat AI) lalu buka view Community Chat.'
                : '⏸ Diskusi otomatis Community Chat dimatikan. Chat manual & jawaban langsung tetap berjalan.');
        }),
    );

    // Catatan obrolan bisa berubah dari view lain (Diskusi AI/Chat AI) → riwayat ikut disegarkan.
    try {
        const file = chatLogFile();
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(path.dirname(file)), path.basename(file)),
        );
        context.subscriptions.push(
            watcher,
            watcher.onDidChange(() => void provider.pushHistory()),
            watcher.onDidCreate(() => void provider.pushHistory()),
        );
    } catch {
        // Tanpa dukungan watcher (mis. tanpa folder proyek) riwayat tetap dibaca saat view dibuka.
    }

    // Periksa batas pesan sekali saat ekstensi aktif, walau view belum dibuka.
    void provider.pushHistory();

    return provider;
}
