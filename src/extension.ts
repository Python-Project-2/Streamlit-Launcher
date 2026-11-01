import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeWorkbook } from './analysis';
import { treeOptionsFromSettings } from './treeConfig';
import { exportReport, printEasyCast, ExportFormat } from './exporter';
import { exportPython } from './pythonExport';
import { registerAiViews, AiHub } from './aiViews';
import { registerPetView, type PetApiInfo } from './petView';
import { RoomService } from './roomService';
import { RoomTerminal } from './roomTerminal';
import { registerCompileView } from './compileView';
import { registerPublishView } from './publishView';
import { registerCommunityLiveView, CommunityLiveViewProvider } from './communityLiveView';
import { CommunityLive } from './communityLive';
import { ChatApiServer } from './chatApi';
import { ChatApiTerminal } from './chatApiTerminal';
import { firebaseEnabled } from './communityFirebase';
import { onChatLogError, setChatLogFallback, flushChatLog } from './chatLog';
import { activePetSkin, buildSpiderWebConfig, petSkinSharePayload } from './petSkins';
import { addMissionProgress, missionById, MissionId } from './petMissions';
import { buildStatsContext, globalAnalysisStore } from './analysisStore';
import { registerEasyCast, EasyCastController } from './Easycast';
import { EASYCAST_CLIENT } from './Easycastclient';
import { buildSpiderPlan, SpiderTarget, SpiderRunStep, explainSpiderRun } from './spider';
import { I18N_CLIENT, i18nConfig, tr, uiLang, LANGUAGE_ITEMS, LANG_SETTING } from './i18n';

const VIEW_TYPE = 'dateSkunder.viewer';
/** Tema tampilan halaman analisis (pilihan preset + warna kustom) — diingat antar-sesi. */
const THEME_KEY = 'dateSkunder.theme';
/** Coretan pena di halaman analisis — disimpan per berkas (prefix + path berkas). */
const PEN_KEY_PREFIX = 'dateSkunder.pen:';

class SkunderDocument implements vscode.CustomDocument {
	constructor(public readonly uri: vscode.Uri) { }
	dispose(): void { }
}

class SkunderProvider implements vscode.CustomReadonlyEditorProvider<SkunderDocument> {
	/** Panel preview yang terbuka; dipakai untuk membuka EasyCast langsung di halaman preview. */
	private readonly viewerPanels = new Set<vscode.WebviewPanel>();
	private activeViewer?: vscode.WebviewPanel;
	/** Berkas yang dibuka tiap panel — dipakai fitur Join Room (satu room = satu berkas). */
	private readonly roomPanels = new Map<vscode.WebviewPanel, string>();
	/** Panel yang skrip easycast.js terbarunya sudah memberi sinyal siap. */
	private readonly ecReady = new WeakSet<vscode.WebviewPanel>();
	constructor(
		private readonly ctx: vscode.ExtensionContext,
		private readonly hub?: AiHub,
		private communityProvider?: { sendAiResult(text: string): void; sendSkinData(payload: Record<string, unknown>): void },
		/** Menyegarkan data skin aktif di view Community Chat (dipakai tombol bagikan). */
		private readonly refreshCommunitySkin?: () => void,
		/** EasyCast: kirim hasil analisis terbaru ke tampilan TV di editor. */
		private readonly easyCast?: EasyCastController,
		/** Join Room: kursor bersama, daftar perangkat, dan sinkron CSV. */
		private readonly room?: RoomService,
	) { }

	openCustomDocument(uri: vscode.Uri): SkunderDocument {
		return new SkunderDocument(uri);
	}

	async resolveCustomEditor(doc: SkunderDocument, panel: vscode.WebviewPanel): Promise<void> {
		const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
		const icon = vscode.Uri.joinPath(this.ctx.extensionUri, 'icon');
		const video = vscode.Uri.joinPath(this.ctx.extensionUri, 'video');
		panel.webview.options = { enableScripts: true, localResourceRoots: [media, icon, video] };
		panel.webview.html = this.getHtml(panel.webview, media, icon, video);

		this.viewerPanels.add(panel);
		this.activeViewer = panel;
		panel.onDidChangeViewState((e) => {
			if (e.webviewPanel.active) {
				this.activeViewer = e.webviewPanel;
				// Saat tab kembali terlihat, kirim keadaan room terbaru (posisi kursor bisa tertinggal).
				this.postRoom(e.webviewPanel);
			}
		});
		panel.onDidDispose(() => { this.viewerPanels.delete(panel); if (this.activeViewer === panel) { this.activeViewer = [...this.viewerPanels].pop(); } });

		const fileName = path.basename(doc.uri.fsPath);
		// Panel ini terikat pada satu berkas: room hanya boleh menampilkan berkas yang sama.
		this.roomPanels.set(panel, fileName);
		panel.onDidDispose(() => this.roomPanels.delete(panel));
		// Daftarkan panel ke hub supaya perubahan konfigurasi (mis. kostum pet) bisa disiarkan ke halaman ini.
		this.hub?.attachPanel(panel);
		panel.onDidDispose(() => this.hub?.detachPanel(panel));
		const load = async () => {
			try {
				const bytes = await vscode.workspace.fs.readFile(doc.uri);
				const payload = analyzeWorkbook(bytes, fileName, treeOptionsFromSettings());
				this.hub?.recordAnalysis(doc.uri, fileName, payload);
				this.easyCast?.update(fileName, payload);
				// Konfigurasi laba-laba (termasuk kostum yang dipakai) dibangun di satu tempat: src/petSkins.ts.
				// Konteks dikirim supaya kostum yang masih terkunci otomatis kembali ke bawaan.
				panel.webview.postMessage(buildSpiderWebConfig(this.ctx));
				// Tema dikirim sebelum data supaya render pertama langsung memakai warna yang tersimpan.
				panel.webview.postMessage({ type: 'theme', theme: this.ctx.workspaceState.get<unknown>(THEME_KEY) ?? null });
				panel.webview.postMessage({ type: 'data', payload });
				// Coretan pena yang tersimpan untuk berkas ini dikembalikan ke halaman analisis.
				panel.webview.postMessage({ type: 'penData', strokes: this.ctx.workspaceState.get<unknown[]>(PEN_KEY_PREFIX + doc.uri.fsPath) ?? [] });
				// Keadaan room (kursor peserta lain + peringatan berkas berbeda) dikirim setelah data.
				this.postRoom(panel);
			} catch (e) {
				panel.webview.postMessage({ type: 'error', message: `Failed to read file: ${String(e)}` });
			}
		};

		panel.webview.onDidReceiveMessage(async (m) => {
			try {
				if (m.type === 'ready' || m.type === 'reload') {
					await load();
				} else if (m.type === 'roomReady') {
					// Skrip overlay room siap → kirim keadaan terbaru (termasuk peringatan berkas).
					this.postRoom(panel);
				} else if (m.type === 'roomCursor') {
					// Kursor pengguna ini hanya disiarkan bila halaman memakai berkas room yang sama.
					const mine = (this.roomPanels.get(panel) || '').toLowerCase();
					const roomFile = (this.room?.roomFileName() || '').toLowerCase();
					if (this.room?.isInRoom() && (!roomFile || roomFile === mine)) {
						this.room?.sendCursor(Number(m.x), Number(m.y));
					}
				} else if (m.type === 'roomLeave') {
					await this.room?.leave('Kamu keluar dari room. Kursor bersama dimatikan.');
				} else if (m.type === 'roomOpenPanel') {
					await vscode.commands.executeCommand('dateSkunder.petView.focus');
				} else if (m.type === 'roomQuickCreate') {
					// Tombol “➕ Create Room” di halaman analisis: room memakai berkas yang sedang dibuka.
					await this.quickCreateRoom(doc.uri);
				} else if (m.type === 'roomQuickJoin') {
					await this.quickJoinRoom();
				} else if (m.type === 'openExternalOnlineProject' || m.type === 'openExternalOfflineProject') {
					await vscode.env.openExternal(vscode.Uri.parse(m.url));
				} else if (m.type === 'saveDocx') {
					await exportReport('docx', doc.uri, m.sheetName);
				} else if (m.type === 'savePdf') {
					await exportReport('pdf', doc.uri, m.sheetName);
				} else if (m.type === 'saveXlsx') {
					await exportReport('xlsx', doc.uri, m.sheetName);
				} else if (m.type === 'saveWorkflow') {
					await exportReport('workflow', doc.uri, m.sheetName);
				} else if (m.type === 'savePptx') {
					await exportReport('pptx', doc.uri, m.sheetName);
				} else if (m.type === 'savePython') {
					await exportPython(doc.uri, m.sheetName);
				} else if (m.type === 'saveJson') {
					// Seluruh hasil analisis berkas ini sebagai .json (dibaca mesin).
					await exportReport('json', doc.uri, m.sheetName);
				} else if (m.type === 'easycastToggle' || m.type === 'easycastNewWindow') {
					// Dari tombol di lapisan EasyCast: buka tampilan di jendela terpisah (untuk layar TV).
					await vscode.commands.executeCommand('date-skunder.easycast.newWindow');
				} else if (m.type === 'easycastReady') {
					this.ecReady.add(panel);
				} else if (m.type === 'easycastConnect') {
					// Tombol “📡 Sambungkan TV”: siarkan ke TV digital / layar lain lewat jaringan lokal.
					await vscode.commands.executeCommand('date-skunder.easycast.connectTv');
				} else if (m.type === 'easycastExportHtml') {
					// Tombol “💾 Simpan .html” di lapisan EasyCast: dasbor mandiri untuk di-preview di website.
					await exportReport('html', doc.uri, m.sheetName);
				} else if (m.type === 'easycastPrintPdf') {
					// Tombol “🖨 Cetak / simpan PDF”: webview tidak punya dialog cetak, jadi PDF dibuat
					// di extension host (bukan lagi window.print() yang diabaikan webview).
					await exportReport('easycastPdf', doc.uri, m.sheetName);
				} else if (m.type === 'easycastFullscreen') {
					await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
				} else if (m.type === 'languagePick') {
					// Tombol 🌐 di toolbar halaman analisis → pemilih bahasa yang sama dengan Command Palette.
					await vscode.commands.executeCommand('date-skunder.language.select');
				} else if (m.type === 'savePen') {
					// Coretan pena/stabilo (koordinat dokumen) → diingat per berkas; kosong = hapus entri.
					const strokes = Array.isArray(m.strokes) ? m.strokes.slice(0, 5000) : [];
					await this.ctx.workspaceState.update(PEN_KEY_PREFIX + doc.uri.fsPath, strokes.length ? strokes : undefined);
				} else if (m.type === 'saveTheme') {
					// Tema halaman analisis (preset + warna kustom) dipilih pengguna → diingat untuk sesi berikutnya.
					await this.ctx.workspaceState.update(THEME_KEY, m.theme ?? null);
				} else if (m.type === 'spiderAsk') {
					await this.planSpider(panel, doc, m);
				} else if (m.type === 'spiderResult') {
					// Pet selesai menjalankan rencananya → otak model menulis penjelasan hasilnya.
					await this.explainSpiderResult(panel, doc, m);
				} else if (m.type === 'spiderEvent') {
					// Peristiwa pekerjaan pet (export/cek/tur/nonstop) → progres misi & view Pet Skin.
					await this.recordSpiderEvent(panel, m);
				} else if (m.type === 'openPetSkin') {
					// Tombol “Ganti kostum” di panel pet membuka view Pet Skin.
					await vscode.commands.executeCommand('dateSkunder.petView.focus');
				} else if (m.type === 'openCommunity') {
					// Tombol Community Chat di panel pet membuka view Community Chat + menyiapkan data skin.
					await vscode.commands.executeCommand('dateSkunder.communityView.focus');
					this.refreshCommunitySkin?.();
				} else if (m.type === 'shareAiToCommunity') {
					// Kirim hasil analisis AI/C4.5 dari panel analisis ke Community Chat.
					const text = String(m.text || '').trim();
					if (text && this.communityProvider) {
						// Fokus ke Community Chat dulu agar pengguna melihatnya.
						await vscode.commands.executeCommand('dateSkunder.communityView.focus');
						this.communityProvider.sendAiResult(text);
						this.refreshCommunitySkin?.();
					}
				} else if (m.type === 'shareSkinToCommunity') {
					// Data skin dari webview; bila tidak dikirim, ambil skin aktif langsung dari pengaturan.
					await vscode.commands.executeCommand('dateSkunder.communityView.focus');
					if (m.payload && this.communityProvider) {
						this.communityProvider.sendSkinData(m.payload);
					} else {
						this.refreshCommunitySkin?.();
					}
				}
			} catch (e) {
				vscode.window.showErrorMessage(`Date Skunder: ${e instanceof Error ? e.message : String(e)}`);
			}
		});

		// Auto-refresh when file changes on disk
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(vscode.Uri.joinPath(doc.uri, '..'), fileName)
		);
		watcher.onDidChange(load);
		panel.onDidDispose(() => watcher.dispose());
	}

	/**
	 * Bahasa antarmuka diganti → kirim konfigurasi baru ke semua halaman analisis yang terbuka.
	 * Mesin penerjemah di halaman langsung menggambar ulang label (tanpa reload jendela).
	 */
	broadcastLanguage(): void {
		const config = JSON.parse(i18nConfig());
		for (const p of this.viewerPanels) { void p.webview.postMessage({ type: 'sk-locale', config }); }
	}

	/** Keadaan room untuk satu panel: kursor peserta lain, nama room, dan kunci berkas. */
	private roomPayload(panel: vscode.WebviewPanel) {
		const fileName = this.roomPanels.get(panel) || '';
		const inRoom = !!this.room?.isInRoom();
		const roomFile = this.room?.roomFileName() || '';
		const blocked = inRoom && roomFile && fileName && roomFile.toLowerCase() !== fileName.toLowerCase()
			? {
				message: `Halaman ini membuka “${fileName}”, sedangkan room memakai “${roomFile}”. Keluar dari room dulu sebelum memakai berkas yang berbeda.`,
				roomFile,
			}
			: null;
		return {
			enabled: true,
			inRoom,
			room: this.room?.roomName() || '',
			file: fileName,
			selfId: this.room?.socketId() || '',
			showCursors: vscode.workspace.getConfiguration('dateSkunder').get<boolean>('room.showCursors') ?? true,
			blocked,
			members: inRoom ? (this.room?.memberSnapshot() || []) : [],
			connection: this.room?.connectionState() || { connected: false, reconnecting: false, attempt: 0 },
		};
	}

	/** Kirim keadaan room ke satu panel analisis. */
	private postRoom(panel: vscode.WebviewPanel): void {
		void panel.webview.postMessage({ type: 'roomState', room: this.roomPayload(panel) });
	}

	/** Semua halaman analisis yang terbuka menerima keadaan room terbaru (join/keluar/kursor). */
	refreshRoomViews(): void {
		for (const panel of this.roomPanels.keys()) { this.postRoom(panel); }
	}

	/** Pesan ringkas (mis. CSV diganti peserta lain) tampil sebagai toast di halaman analisis. */
	postRoomToast(text: string, kind: 'ok' | 'bad' | 'info' = 'info'): void {
		for (const panel of this.roomPanels.keys()) {
			void panel.webview.postMessage({ type: 'roomToast', text, kind });
		}
	}

	/** Input room baru dari halaman analisis (tombol ➕ Create Room). Satu room = satu berkas. */
	private async quickCreateRoom(uri: vscode.Uri): Promise<void> {
		if (!this.room) { return; }
		if (this.room.isInRoom()) {
			void vscode.window.showWarningMessage('Kamu sudah berada di room. Keluar dari room dulu sebelum membuat room baru.');
			return;
		}
		const defaults = this.room.viewState().defaults;
		const room = await vscode.window.showInputBox({
			title: 'Create Room',
			prompt: `Nama room untuk “${path.basename(uri.fsPath)}” — pakai nama yang sama di laptop kedua`,
			value: defaults.room,
			ignoreFocusOut: true,
		});
		if (!room || !room.trim()) { return; }
		await this.room.createRoom({ room: room.trim(), name: defaults.name, filePath: uri.fsPath });
		const alamat = this.room.lan()[0] || `127.0.0.1:${this.room.viewState().server.port}`;
		this.postRoomToast(`Room “${room.trim()}” siap. Di laptop kedua: Join Room ke ${alamat} dengan nama room yang sama.`, 'ok');
	}

	/** Join Room dari halaman analisis: data + analisis pemilik room langsung terbuka di sini. */
	private async quickJoinRoom(): Promise<void> {
		if (!this.room) { return; }
		if (this.room.isInRoom()) {
			void vscode.window.showWarningMessage('Kamu sudah berada di room. Keluar dari room dulu sebelum bergabung ke room lain.');
			return;
		}
		const defaults = this.room.viewState().defaults;
		const host = await vscode.window.showInputBox({
			title: 'Join Room · alamat laptop tuan rumah',
			prompt: 'Alamat ip:port laptop pemilik room (lihat di terminal “Join Room” atau panel Pet Skin)',
			value: defaults.host,
			placeHolder: '192.168.1.7:47900',
			ignoreFocusOut: true,
		});
		if (!host || !host.trim()) { return; }
		const room = await vscode.window.showInputBox({
			title: 'Join Room · nama room',
			prompt: 'Nama room yang dibuat pemilik (harus sama persis)',
			value: defaults.room,
			ignoreFocusOut: true,
		});
		if (!room || !room.trim()) { return; }
		await this.room.joinRoom({ host: host.trim(), room: room.trim(), name: defaults.name });
	}

	/** Perubahan kursor peserta lain (payload kecil, frekuensi tinggi). */
	postRoomCursor(id: string, x: number, y: number): void {		for (const panel of this.roomPanels.keys()) {
			// Panel yang tidak terlihat tidak perlu digambar ulang; state dikirim saat tab aktif lagi.
			if (!panel.visible) { continue; }
			void panel.webview.postMessage({ type: 'roomCursor', id, x, y });
		}
	}

	/** Buka EasyCast langsung di halaman preview yang sedang aktif. false bila belum ada preview terbuka. */
	showEasyCast(type: 'easycastOpen' | 'easycastClose' | 'easycastToggle' = 'easycastOpen'): boolean {
		const p = this.activeViewer ?? [...this.viewerPanels].pop();
		if (!p) { return false; }
		if (!this.ecReady.has(p)) {
			vscode.window.showWarningMessage('EasyCast: skrip tampilan di halaman ini masih versi lama, jadi tombol tidak bereaksi. Jalankan npm run compile lalu reload window (Developer: Reload Window).');
		}
		if (type !== 'easycastClose') { p.reveal(undefined, false); }
		void p.webview.postMessage({ type });
		return true;
	}

	/**
	 * Spider: susun rencana langkah (gerak + sorot + penjelasan) dari instruksi pengguna.
	 * LLM lokal dipakai bila llama-server aktif; bila tidak, perencana lokal dari angka analisis.
	 */
	private async planSpider(panel: vscode.WebviewPanel, doc: SkunderDocument, msg: any): Promise<void> {
		const request = String(msg?.text ?? '').trim();
		if (!request) { return; }
		const fileName = path.basename(doc.uri.fsPath);
		const sheetName = String(msg?.sheetName ?? '');
		const targets: SpiderTarget[] = Array.isArray(msg?.targets)
			? msg.targets
				.filter((t: any) => t && typeof t.id === 'string' && t.label)
				.slice(0, 60)
				.map((t: any) => ({
					id: String(t.id),
					label: String(t.label),
					kind: t.kind ? String(t.kind) : undefined,
					click: !!t.click,
					group: t.group ? String(t.group) : undefined,
					danger: !!t.danger,
				}))
			: [];

		const hub = this.hub;
		const cfg = hub?.config();
		const entry = this.findStoredAnalysis(fileName);
		// Ringkasan dijaga pendek: prompt + daftar target + keluaran harus tetap muat di jendela model.
		// Otak penuh: pet menyusun rencana + penjelasan langkah dengan konteks statistik seluas mungkin.
		const summary = entry ? buildStatsContext(entry, sheetName || undefined, 7000) : 'Belum ada analisis tersimpan untuk berkas ini.';
		const maxSteps = Math.min(12, Math.max(3, Math.round(vscode.workspace.getConfiguration('dateSkunder').get<number>('spider.maxSteps') ?? 8)));

		panel.webview.postMessage({ type: 'spiderStatus', state: 'thinking' });
		try {
			const plan = await buildSpiderPlan({
				request,
				fileName,
				sheetName: sheetName || entry?.sheetNames?.[0] || '',
				targets,
				summary,
				facts: summary.split('\n'),
				running: !!hub?.serverAvailable(),
				port: cfg?.port ?? 8081,
				temperature: Math.max(0.2, cfg?.temperature ?? 0.2),
				maxTokens: cfg?.maxTokens ?? 0,
				maxSteps,
				contextSize: cfg?.contextSize ?? 4096,
			});
			if (!(cfg?.spiderAllowActions ?? true)) {
				plan.note = [plan.note, 'Aksi klik sedang dimatikan lewat pengaturan dateSkunder.spider.allowActions.'].filter(Boolean).join(' ');
			}
			// Permintaan eksplisit dari panel (mis. tombol “Jalankan semua fitur”) tetap dieksekusi walau ⚡ Auto mati.
			if (msg?.force) { plan.force = true; }
			panel.webview.postMessage({ type: 'spiderPlan', request, plan });
		} catch (e) {
			panel.webview.postMessage({
				type: 'spiderPlan',
				request,
				plan: { reply: `Maaf, rencana gagal disusun: ${e instanceof Error ? e.message : String(e)}`, steps: [], source: 'local' },
			});
		}
	}

	/**
	 * Penjelasan hasil eksekusi oleh otak model penuh: setelah pet selesai menjalankan langkahnya,
	 * llama-server menulis apa yang dikerjakan, hasil mana yang berhasil/gagal, dan maknanya bagi data.
	 * Bila server belum berjalan, pet diberi tahu apa adanya (tidak ada penjelasan template).
	 */
	private async explainSpiderResult(panel: vscode.WebviewPanel, doc: SkunderDocument, msg: any): Promise<void> {
		const steps: SpiderRunStep[] = Array.isArray(msg?.steps)
			? msg.steps
				.filter((s: any) => s && typeof s === 'object')
				.slice(0, 24)
				.map((s: any) => ({
					say: s.say ? String(s.say) : undefined,
					target: s.target ? String(s.target) : undefined,
					action: s.action ? String(s.action) : null,
					ok: s.ok !== false,
					detail: s.detail ? String(s.detail) : undefined,
				}))
			: [];
		if (!steps.length) { return; }
		const hub = this.hub;
		if (!hub?.serverAvailable()) {
			panel.webview.postMessage({
				type: 'spiderExplain',
				ok: false,
				note: 'Penjelasan otak model belum bisa ditulis: llama-server belum berjalan. Tekan ▶ di sidebar Chat AI (atau view LLAMA Server) supaya pet bisa menjelaskan hasil kerjanya.',
			});
			return;
		}
		const cfg = hub.config();
		const fileName = path.basename(doc.uri.fsPath);
		const sheetName = String(msg?.sheetName ?? '');
		const entry = this.findStoredAnalysis(fileName);
		const summary = entry ? buildStatsContext(entry, sheetName || undefined, 7000) : '';
		panel.webview.postMessage({ type: 'spiderExplain', ok: true, pending: true });
		try {
			const text = await explainSpiderRun({
				request: String(msg?.request ?? ''),
				fileName,
				sheetName: sheetName || (entry?.sheetNames?.[0] ?? ''),
				summary,
				steps,
				port: cfg.port,
				temperature: Math.max(0.2, cfg.temperature),
				maxTokens: cfg.maxTokens,
				contextSize: cfg.contextSize,
			});
			panel.webview.postMessage(text
				? { type: 'spiderExplain', ok: true, text }
				: { type: 'spiderExplain', ok: false, note: 'Otak model tidak membalas, jadi penjelasan hasil belum bisa ditulis. Coba lagi sebentar lagi.' });
		} catch (e) {
			panel.webview.postMessage({ type: 'spiderExplain', ok: false, note: `Penjelasan gagal disusun: ${e instanceof Error ? e.message : String(e)}` });
		}
	}

	/**
	 * Peristiwa dari pet (export/cek/tur/nonstop) → progres misi tersimpan + view Pet Skin ikut diperbarui.
	 * Misi yang baru selesai memberi tahu panel supaya pemakainya tahu kostum baru sudah terbuka.
	 */
	private async recordSpiderEvent(panel: vscode.WebviewPanel, msg: any): Promise<void> {
		const deltas: Partial<Record<MissionId, number>> = {};
		const kind = String(msg?.kind ?? '');
		if (kind === 'run') {
			const angka = (v: unknown, maks: number) => Math.max(0, Math.min(maks, Math.round(Number(v) || 0)));
			const exports = angka(msg?.exports, 24);
			if (exports > 0) { deltas['first-export'] = exports; }
			if (exports >= 3) { deltas['export-all'] = exports; }
			if (exports > 0) { deltas['export-marathon'] = exports; }
			if (angka(msg?.jurnal, 12) > 0) { deltas['first-jurnal'] = angka(msg?.jurnal, 12); }
			if (angka(msg?.flow, 12) > 0) { deltas['first-workflow'] = angka(msg?.flow, 12); }
			if (angka(msg?.json, 12) > 0) { deltas['first-json'] = angka(msg?.json, 12); }
			if (angka(msg?.pptx, 12) > 0) { deltas['first-pptx'] = angka(msg?.pptx, 12); }
			if (angka(msg?.typed, 24) > 0) {
				deltas['typist'] = angka(msg?.typed, 24);
				deltas['typist-master'] = angka(msg?.typed, 40);
			}
			if (angka(msg?.tabs, 24) > 0) { deltas['navigator'] = angka(msg?.tabs, 24); }
			const dieksekusi = angka(msg?.executed, 120);
			deltas['marathon'] = dieksekusi;
			deltas['centurion'] = dieksekusi;
			if (msg?.tour) { deltas['tour-master'] = 1; deltas['tour-veteran'] = 1; }
			if (msg?.check) { deltas['checker'] = 1; deltas['check-master'] = 1; }
		} else if (kind === 'nonstop') {
			deltas['nonstop-runner'] = 1;
			deltas['nonstop-master'] = 1;
		}
		const selesai = await addMissionProgress(this.ctx, deltas);
		this.hub?.refreshPetView();
		if (!selesai.length) { return; }
		const bagian: string[] = [];
		for (const id of selesai) {
			const misi = missionById(id);
			if (misi) { bagian.push(`“${misi.name}” → kostum ${misi.rewardSkin} terbuka`); }
		}
		panel.webview.postMessage({ type: 'spiderMission', ids: selesai, text: `🎉 Misi selesai: ${bagian.join('; ')}. Buka view Pet Skin untuk memakainya.` });
	}

	/** Cari hasil analisis berkas ini di penyimpanan bersama (dipakai spider sebagai konteks). */
	private findStoredAnalysis(fileName: string) {
		const store = this.hub?.store;
		if (!store) { return undefined; }
		for (const item of store.list()) {
			const entry = store.get(item.id);
			if (entry && entry.fileName === fileName) { return entry; }
		}
		return store.last();
	}

	private getHtml(webview: vscode.Webview, media: vscode.Uri, icon: vscode.Uri, video: vscode.Uri): string {
		const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
		const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.css'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.js'));
		const builder = webview.asWebviewUri(vscode.Uri.joinPath(media, 'builder.js'));
		// Panel “Grafik Pratinjau Data”: grafik cepat per fitur + pemilih kolom.
		const previewCharts = webview.asWebviewUri(vscode.Uri.joinPath(media, 'preview.js'));
		const spider = webview.asWebviewUri(vscode.Uri.joinPath(media, 'spider.js'));
		const spiderCss = webview.asWebviewUri(vscode.Uri.joinPath(media, 'spider.css'));
		const chart = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chart.umd.js'));
		const intro = webview.asWebviewUri(vscode.Uri.joinPath(media, 'intro.js'));
		const pen = webview.asWebviewUri(vscode.Uri.joinPath(media, 'pen.js'));
		const penCss = webview.asWebviewUri(vscode.Uri.joinPath(media, 'pen.css'));
		const roomJs = webview.asWebviewUri(vscode.Uri.joinPath(media, 'room.js'));
		const roomCss = webview.asWebviewUri(vscode.Uri.joinPath(media, 'room.css'));
		const ecIcon = webview.asWebviewUri(vscode.Uri.joinPath(icon, 'easycast.svg'));
		const ecSeconds = Math.min(60, Math.max(5, Math.round(vscode.workspace.getConfiguration('dateSkunder').get<number>('easycast.slideSeconds') ?? 12)));
		const logo = webview.asWebviewUri(vscode.Uri.joinPath(icon, 'logo.png'));
		const mp4 = webview.asWebviewUri(vscode.Uri.joinPath(video, 'streamlit.mp4'));
		return /* html */ `<!DOCTYPE html>
<html lang="${uiLang() === 'zh-cn' ? 'zh-CN' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} data:; media-src ${webview.cspSource};">
<link href="${css}" rel="stylesheet">
<link href="${spiderCss}" rel="stylesheet">
<link href="${penCss}" rel="stylesheet">
<link href="${roomCss}" rel="stylesheet">
<title>Date Skunder</title>
</head>
<body data-video="${mp4}" data-ec-icon="${ecIcon}" data-ec-seconds="${ecSeconds}" data-ec-lang="${uiLang()}">
<div id="app">
	<center><img src="${logo}" width="120" height="120" style="border-radius:20px" /></center>
	<div class="loading">Reading analyzing data…</div>
	<center><p>This Extension Analys Api Management Streamlit Launcher</p></center>
</div>
<script nonce="${nonce}">(function(){var o=window.acquireVsCodeApi,a;if(typeof o==='function'){window.acquireVsCodeApi=function(){return a||(a=o());};}})();</script>
<script nonce="${nonce}">window.__SK_I18N__=${i18nConfig()};</script>
<script nonce="${nonce}">${I18N_CLIENT}</script>
<script nonce="${nonce}" src="${chart}"></script>
<script nonce="${nonce}" src="${builder}"></script>
<script nonce="${nonce}" src="${previewCharts}"></script>
<script nonce="${nonce}" src="${spider}"></script>
<script nonce="${nonce}" src="${js}"></script>
<script nonce="${nonce}" src="${intro}"></script>
<script nonce="${nonce}" src="${pen}"></script>
<script nonce="${nonce}" src="${roomJs}"></script>
<script nonce="${nonce}">${EASYCAST_CLIENT}</script>
</body>
</html>`;
	}
}

export const workbookTypes = ['.xlsx', '.xls', '.csv', '.tsv', '.xlsm'];

/** Ambil URI dari argumen command, tab custom editor yang aktif, atau editor teks aktif. */
function resolveUri(uri?: vscode.Uri): vscode.Uri | undefined {
	if (uri) { return uri; }
	const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
	if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) { return input.uri; }
	return vscode.window.activeTextEditor?.document.uri;
}

// ── Extension lifecycle ──────────────────────────────────────────────────────

/** Diisi setelah provider dibuat; perintah EasyCast mengaksesnya lewat sini. */
let providerRef: SkunderProvider | undefined;
let chatApiRef: ChatApiServer | undefined;
/** Layanan Join Room (server + klien Socket.IO) untuk dihentikan saat ekstensi mati. */
let roomRef: RoomService | undefined;

/** Buka/tutup EasyCast di halaman preview; bila belum ada preview, buka berkas yang aktif lebih dulu. */
async function easyCastInEditor(type: 'easycastOpen' | 'easycastToggle'): Promise<void> {
	if (providerRef?.showEasyCast(type)) { return; }
	const target = resolveUri();
	if (target && workbookTypes.some((ext) => target.fsPath.toLowerCase().endsWith(ext))) {
		await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
		// Beri waktu halaman memuat hasil analisis sebelum lapisan dibuka.
		setTimeout(() => providerRef?.showEasyCast('easycastOpen'), 1500);
		return;
	}
	vscode.window.showInformationMessage('Buka berkas CSV/Excel lewat Date Skunder dulu — EasyCast tampil di halaman preview.');
}

export function activate(context: vscode.ExtensionContext) {
	// Catatan obrolan (data/data.txt): folder proyek diutamakan; tanpa folder terbuka, simpan di
	// penyimpanan ekstensi supaya Community Chat & Diskusi AI tetap punya berkas catatan.
	setChatLogFallback(context.globalStorageUri?.fsPath);
	onChatLogError((line) => console.warn(`[chat-log] ${line}`));

	// Perintah EasyCast didaftarkan PALING AWAL (sebelum view/AI/komunitas) supaya tetap ada
	// walau bagian lain gagal diaktifkan. Dideklarasikan di package.json (menu, palet, Ctrl+Alt+B).
	context.subscriptions.push(
		vscode.commands.registerCommand('date-skunder.easycast.inline', () => easyCastInEditor('easycastOpen')),
		vscode.commands.registerCommand('date-skunder.easycast.toggle', () => easyCastInEditor('easycastToggle')),
		vscode.commands.registerCommand('date-skunder.easycast.start', () => easyCastInEditor('easycastOpen')), vscode.commands.registerCommand('date-skunder.easycast.stop', async () => {
			providerRef?.showEasyCast('easycastClose');
			await vscode.commands.executeCommand('date-skunder.easycast.stopTv');
		}),
	);

	const hub = registerAiViews(context);
	// View “Pet Skin”: tempat ganti kostum pet Spider (menggantikan view Flowchart Canvas yang dihapus).
	// Pet Lab di dalamnya memakai info server API JSON — diisi setelah server dibuat di bawah.
	let petApiInfo: () => PetApiInfo = () => ({ running: false, port: 0, endpoints: {} });

	// Fitur “Join Room” (di view Pet Skin): server Socket.IO otomatis, terminal log,
	// kursor bersama, dan sinkronisasi CSV antar laptop.
	let roomPty: RoomTerminal | undefined;
	let roomTerminal: vscode.Terminal | undefined;
	const room = new RoomService(context, {
		log: (line) => {
			console.log(`[room] ${line}`);
			roomPty?.log(line);
		},
	});
	roomRef = room;
	const petProvider = registerPetView(context, hub, () => petApiInfo(), room);

	// View “Compile MSI” (tepat di bawah Pet Skin): token dari website lokal + terminal build.
	// Server token (api/token.html) menyala bersama ekstensi supaya website langsung bisa dibuka.
	registerCompileView(context);

	// View “Publish”: tulis & terbitkan artikel (judul, ringkasan, isi, tautan tujuan, sampul) ke database.
	// Akun memakai email & kata sandi database; belum punya akun → daftar dulu di tab “Daftar”.
	registerPublishView(context);

	// Indikator bahasa di status bar: tempat ganti bahasa yang selalu terlihat (klik → pemilih bahasa).
	const langItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 89);
	langItem.command = 'date-skunder.language.select';
	const refreshLangItem = () => {
		const zh = uiLang() === 'zh-cn';
		langItem.text = zh ? '$(globe) 中文' : '$(globe) Bahasa: ID';
		langItem.tooltip = tr(
			'Ganti bahasa antarmuka Date Skunder (Ctrl+Alt+U)',
			'切换 Date Skunder 界面语言（Ctrl+Alt+U）',
		);
		langItem.show();
	};
	refreshLangItem();
	context.subscriptions.push(langItem);

	// View “Community Chat”: ruang Komunitas (Firebase + arsip lokal) dan Diskusi AI (lokal).
	// Setiap pesan ditulis & dibaca kembali dari data/data.txt; ruang Komunitas juga disinkronkan
	// ke database supaya anggota lain melihat percakapan yang sama.
	let apiPty: ChatApiTerminal | undefined;
	let apiTerminal: vscode.Terminal | undefined;
	let notifyApiChange: () => void = () => undefined;
	const chatApi = new ChatApiServer({
		log: (line) => {
			console.log(`[chat-api] ${line}`);
			apiPty?.log(line);
		},
	});
	chatApiRef = chatApi;
	const apiPort = () => Math.max(0, Math.min(65535, Math.round(vscode.workspace.getConfiguration('dateSkunder').get<number>('community.apiPort') ?? 47831)));
	petApiInfo = () => ({ running: chatApi.running, port: chatApi.info().port, endpoints: chatApi.info().endpoints });
	/** Terminal server API JSON: dibuat sekali, dibuat ulang bila pengguna menutupnya. */
	const ensureApiTerminal = (show = true): void => {
		if (!apiTerminal || apiTerminal.exitStatus !== undefined) {
			apiPty = new ChatApiTerminal({
				server: chatApi,
				port: apiPort,
				onChange: () => notifyApiChange(),
				llama: {
					status: () => {
						const status = hub.server.status;
						const model = status.modelPath ? String(status.modelPath).split(/[\\/]/).pop() : '';
						return `${status.state}${status.port ? ` · port ${status.port}` : ''}${model ? ` · ${model}` : ''}`;
					},
					start: () => vscode.commands.executeCommand('date-skunder.llama.start'),
					stop: () => vscode.commands.executeCommand('date-skunder.llama.stop'),
				},
			});
			apiTerminal = vscode.window.createTerminal({
				name: 'API JSON Chat',
				pty: apiPty,
				iconPath: new vscode.ThemeIcon('radio-tower'),
			});
		}
		if (show) { apiTerminal.show(true); }
	};
	const apiCfg = vscode.workspace.getConfiguration('dateSkunder');
	const autoApiTerminal = () => vscode.workspace.getConfiguration('dateSkunder').get<boolean>('community.apiTerminal') ?? true;
	if (apiCfg.get<boolean>('community.api') ?? true) {
		void chatApi.start(apiPort())
			.then(() => {
				if (autoApiTerminal()) {
					// preserveFocus: terminal tampil tanpa merebut fokus editor.
					ensureApiTerminal(true);
					apiPty?.log(`API JSON siap dipakai: ${chatApi.info().endpoints.chat}`);
				}
				notifyApiChange();
			})
			.catch((e) => {
				const message = e instanceof Error ? e.message : String(e);
				console.warn(`[chat-api] gagal menyala: ${message}`);
				if (autoApiTerminal()) {
					ensureApiTerminal(true);
					apiPty?.log(`Gagal menyalakan server: ${message}`);
				}
			});
	}
	context.subscriptions.push({
		dispose: () => {
			void chatApi.stop();
			apiTerminal?.dispose();
		},
	});
	let communityProvider: CommunityLiveViewProvider | undefined;
	const communityLive = new CommunityLive({
		store: globalAnalysisStore,
		isRunning: () => hub.serverReady(),
		port: () => vscode.workspace.getConfiguration('dateSkunder').get<number>('llama.port') ?? 8081,
		ensureServer: async () => {
			try {
				if (!hub.serverAvailable()) { await hub.startServer(); }
				return hub.serverReady();
			} catch {
				return false;
			}
		},
		post: (m) => communityProvider?.postLive(m),
		log: (line) => console.log(`[community] ${line}`),
		remote: {
			enabled: () => firebaseEnabled(),
			publish: (draft) => communityProvider?.publishRemoteMessage(draft),
		},
	});
	communityProvider = registerCommunityLiveView(context, communityLive, chatApi);
	communityProvider.attachApiTerminal(() => ensureApiTerminal(true));
	notifyApiChange = () => communityProvider?.refreshStatus();
	context.subscriptions.push(vscode.commands.registerCommand('date-skunder.community.apiTerminal', () => ensureApiTerminal(true)));
	communityLive.start();
	context.subscriptions.push(communityLive);

	/**
	 * Kirim data skin pet aktif ke view Community Chat supaya tombol “🎨 Bagikan Skin” selalu punya data.
	 * View komunitas baru dibuat saat pertama dibuka, jadi pesan diulang dengan jeda singkat (webview yang
	 * belum siap melewatkannya) dan disegarkan berkala selama VS Code aktif.
	 */
	const pushCommunitySkin = () => {
		communityProvider?.sendSkinData(petSkinSharePayload(activePetSkin(context)));
	};
	const pushCommunitySkinSoon = () => {
		pushCommunitySkin();
		setTimeout(pushCommunitySkin, 800);
		setTimeout(pushCommunitySkin, 2200);
	};
	const communitySkinTimer = setInterval(pushCommunitySkin, 10000);
	context.subscriptions.push(
		{ dispose: () => clearInterval(communitySkinTimer) },
		// Kostum diganti (dari view Pet Skin maupun Settings) → data skin di chat ikut diperbarui.
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('dateSkunder.spider.skin')) {
				pushCommunitySkinSoon();
				// Kostum baru ikut disiarkan ke room supaya spider di kursor peserta lain berganti.
				room.setSkin();
			}
			if (e.affectsConfiguration('dateSkunder.room.')) {
				skunderProvider.refreshRoomViews();
				petProvider.refreshRoom();
			}
			// Bahasa antarmuka diubah dari Settings → halaman analisis langsung ikut berganti.
			if (e.affectsConfiguration('dateSkunder.' + LANG_SETTING)) {
				providerRef?.broadcastLanguage();
				refreshLangItem();
			}
		}),
	);

	// EasyCast: tampilan presentasi di editor VS Code (bisa dipindah ke layar TV).
	const easyCast = registerEasyCast(context, async () => {
		const target = resolveUri();
		if (!target || !workbookTypes.some((ext) => target.fsPath.toLowerCase().endsWith(ext))) { return undefined; }
		const fileName = path.basename(target.fsPath);
		const bytes = await vscode.workspace.fs.readFile(target);
		return { fileName, workbook: analyzeWorkbook(bytes, fileName, treeOptionsFromSettings()) };
	});
	context.subscriptions.push(easyCast);

	const skunderProvider = new SkunderProvider(context, hub, communityProvider, pushCommunitySkinSoon, easyCast, room);

	// Semua perubahan room (join/keluar/skin/CSV) langsung tampil di panel Pet Skin & halaman analisis.
	context.subscriptions.push(
		room.onChange(() => {
			skunderProvider.refreshRoomViews();
			petProvider.refreshRoom();
		}),
		room.onCursor((id, x, y) => {
			skunderProvider.postRoomCursor(id, x, y);
			petProvider.postRoomCursor(id, x, y);
		}),
		room.onLatency((ms) => petProvider.postRoomLatency(ms)),
		// Pratinjau CSV hanya menggambar ulang panel Pet Skin (halaman analisis tidak ikut berkedip).
		room.onPreview(() => petProvider.refreshRoom()),
		room.onNotice((text, kind) => {
			petProvider.refreshRoom();
			skunderProvider.postRoomToast(text, kind);
		}),
	);

	/** Terminal server Socket.IO: dibuat sekali, dibuat ulang bila pengguna menutupnya. */
	const ensureRoomTerminal = (show = true): void => {
		if (!roomTerminal || roomTerminal.exitStatus !== undefined) {
			roomPty = new RoomTerminal({
				service: room,
				onOpenPanel: () => void vscode.commands.executeCommand('dateSkunder.petView.focus'),
			});
			roomTerminal = vscode.window.createTerminal({
				name: 'Join Room (Socket.IO)',
				pty: roomPty,
				iconPath: new vscode.ThemeIcon('radio-tower'),
			});
		}
		if (show) { roomTerminal.show(true); }
	};

	// Server socket dinyalakan otomatis supaya laptop lain bisa langsung bergabung.
	const roomCfg = vscode.workspace.getConfiguration('dateSkunder');
	if (roomCfg.get<boolean>('room.autoStart') ?? true) {
		void room.startServer()
			.then(() => {
				if (roomCfg.get<boolean>('room.terminal') ?? true) {
					ensureRoomTerminal(true);
					roomPty?.log(`Server siap · alamat LAN: ${room.lan().join(', ') || 'tidak ada'}`);
				}
			})
			.catch((e) => {
				const message = e instanceof Error ? e.message : String(e);
				console.warn(`[room] gagal menyala: ${message}`);
				if (roomCfg.get<boolean>('room.terminal') ?? true) {
					ensureRoomTerminal(true);
					roomPty?.log(`Gagal menyalakan server: ${message}`);
				}
			});
	}
	context.subscriptions.push(
		{ dispose: () => { room.dispose(); roomTerminal?.dispose(); } },
		vscode.commands.registerCommand('date-skunder.room.join', async () => {
			await vscode.commands.executeCommand('dateSkunder.petView.focus');
			petProvider.focusRoom();
		}),
		vscode.commands.registerCommand('date-skunder.room.leave', () => room.leave()),
		vscode.commands.registerCommand('date-skunder.room.terminal', () => ensureRoomTerminal(true)),
	);


	/** Kirim perintah ke pet di halaman analisis; beri tahu bila belum ada halaman terbuka. */
	const spiderCmd = (cmd: 'tour' | 'check' | 'nonstop' | 'stop') => {
		if (!hub.spiderCommand(cmd)) {
			vscode.window.showInformationMessage(tr(
				'Buka berkas CSV/Excel lewat Date Skunder dulu — perintah pet dijalankan di halaman analisis yang terbuka.',
				'请先用 Date Skunder 打开 CSV/Excel 文件 — 宠物指令在已打开的分析页面中执行。',
			));
		}
	};

	providerRef = skunderProvider;

	const exportCmd = (format: ExportFormat) => async (uri?: vscode.Uri) => {
		const target = resolveUri(uri);
		if (!target) {
			vscode.window.showWarningMessage(tr('Buka file CSV atau Excel terlebih dahulu.', '请先打开 CSV 或 Excel 文件。'));
			return;
		}
		await exportReport(format, target);
	};

	/**
	 * “Date Skunder: Ganti Bahasa / 切换语言” — pilih Indonesia, Mandarin, atau otomatis.
	 * Halaman analisis yang sedang terbuka langsung berganti bahasa tanpa reload jendela.
	 */
	const selectLanguage = async (): Promise<void> => {
		const cfg = vscode.workspace.getConfiguration('dateSkunder');
		const current = cfg.get<string>(LANG_SETTING) ?? 'auto';
		const picked = await vscode.window.showQuickPick(
			LANGUAGE_ITEMS.map((it) => ({ label: it.label, description: it.description, value: it.value, picked: it.value === current })),
			{
				title: tr('Bahasa antarmuka Date Skunder', 'Date Skunder 界面语言'),
				placeHolder: tr('Pilih bahasa tampilan', '请选择界面语言'),
				ignoreFocusOut: true,
			},
		);
		if (!picked) { return; }
		await cfg.update(LANG_SETTING, picked.value, vscode.ConfigurationTarget.Global);
		providerRef?.broadcastLanguage();
		refreshLangItem();
		const now = uiLang();
		const note = tr(
			now === 'zh-cn' ? 'Bahasa antarmuka: 中文（简体）. Halaman analisis yang terbuka langsung berganti dan dasbor .html hasil ekspor ikut Mandarin (label PDF memakai font standar, jadi tetap Inggris/Indonesia).' : 'Bahasa antarmuka: Bahasa Indonesia. Halaman analisis yang terbuka langsung berganti.',
			now === 'zh-cn' ? '界面语言：简体中文。已打开的分析页面会立即切换，导出的 .html 仪表板也为中文（PDF 使用标准字体，标签保持英文）。' : '界面语言：印尼语。已打开的分析页面会立即切换。',
		);
		const reload = tr('Muat Ulang Jendela', '重新加载窗口');
		void vscode.window.showInformationMessage(note, reload).then((a) => {
			if (a === reload) { void vscode.commands.executeCommand('workbench.action.reloadWindow'); }
		});
	};

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, skunderProvider, {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: false,
		}),
		vscode.commands.registerCommand('date-skunder.openPreview', async (uri?: vscode.Uri) => {
			uri = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (!uri) {
				vscode.window.showWarningMessage('Please select a CSV or Excel file first.');
				return;
			}
			await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
		}),
		// EasyCast langsung di halaman preview (lapisan presentasi di dalam editor ekstensi).
		vscode.commands.registerCommand('date-skunder.exportDocx', exportCmd('docx')),
		vscode.commands.registerCommand('date-skunder.exportPdf', exportCmd('pdf')),
		vscode.commands.registerCommand('date-skunder.exportXlsx', exportCmd('xlsx')),
		vscode.commands.registerCommand('date-skunder.exportPptx', exportCmd('pptx')),
		vscode.commands.registerCommand('date-skunder.exportWorkflow', exportCmd('workflow')),
		vscode.commands.registerCommand('date-skunder.exportJson', exportCmd('json')),
		// EasyCast: dasbor .html mandiri (tombol “Simpan .html”) & PDF slide (tombol “Cetak / simpan PDF”).
		vscode.commands.registerCommand('date-skunder.easycast.exportHtml', exportCmd('html')),
		vscode.commands.registerCommand('date-skunder.easycast.exportPdf', exportCmd('easycastPdf')),
		vscode.commands.registerCommand('date-skunder.easycast.print', async (uri?: vscode.Uri) => {
			const target = resolveUri(uri);
			if (!target) {
				vscode.window.showWarningMessage(tr('Buka file CSV atau Excel terlebih dahulu.', '请先打开 CSV 或 Excel 文件。'));
				return;
			}
			await printEasyCast(target);
		}),
		// Ganti bahasa antarmuka (Indonesia / Mandarin / otomatis mengikuti VS Code).
		vscode.commands.registerCommand('date-skunder.language.select', selectLanguage),
		// Shortcut pet Spider: perintah dikirim ke halaman analisis yang terbuka (pet merespons
		// hanya bila halamannya terlihat, jadi shortcut tidak “menekan” halaman lain).
		vscode.commands.registerCommand('date-skunder.spider.tour', () => spiderCmd('tour')),
		vscode.commands.registerCommand('date-skunder.spider.check', () => spiderCmd('check')),
		vscode.commands.registerCommand('date-skunder.spider.nonstop', () => spiderCmd('nonstop')),
		vscode.commands.registerCommand('date-skunder.spider.stop', () => spiderCmd('stop')),
		vscode.commands.registerCommand('date-skunder.exportPython', async (uri?: vscode.Uri) => {
			const target = resolveUri(uri);
			if (!target) {
				vscode.window.showWarningMessage('Buka file CSV atau Excel terlebih dahulu.');
				return;
			}
			await exportPython(target);
		})
	);
}

export async function deactivate(): Promise<void> {
	// Pastikan catatan obrolan yang masih mengantre selesai ditulis sebelum ekstensi berhenti.
	if (roomRef) {
		try { roomRef.dispose(); } catch { /* sudah berhenti */ }
		roomRef = undefined;
	}
	if (chatApiRef) {
		try { await chatApiRef.stop(); } catch { /* server sudah berhenti */ }
		chatApiRef = undefined;
	}
	await flushChatLog();
}