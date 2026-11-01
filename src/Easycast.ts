import * as vscode from 'vscode';
import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';
import { WorkbookResult } from './analysis';
import { EASYCAST_CLIENT } from './Easycastclient';
export interface EasyCastController extends vscode.Disposable {
    /** Dipanggil setiap hasil analisis diperbarui; diteruskan ke jendela TV dan semua perangkat yang terhubung. */
    update(fileName: string, workbook: WorkbookResult): void;
}

type Current = { fileName: string; workbook: WorkbookResult };

/** Baris data mentah tidak dipakai slide; dibuang agar kiriman ke TV ringan. */
function slim(workbook: WorkbookResult): WorkbookResult {
    return { ...workbook, sheets: workbook.sheets.map((s) => ({ ...s, rows: [] })) };
}

function lanAddresses(): string[] {
    const out: string[] = [];
    const ifs = os.networkInterfaces();
    for (const name of Object.keys(ifs)) {
        for (const a of ifs[name] ?? []) {
            if (a.family === 'IPv4' && !a.internal) { out.push(a.address); }
        }
    }
    return out;
}

const PIN_PAGE = (error: boolean) => `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>EasyCast TV</title>
<style>html,body{margin:0;height:100%;background:#0b1020;color:#e8ecf8;font-family:Segoe UI,Roboto,Arial,sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font-size:5vw;margin:0 0 2vh;color:#6ea8fe}p{font-size:2.4vw;color:#9aa6c7;margin:0 0 3vh}
input{font-size:5vw;width:14ch;text-align:center;padding:1vh 1vw;border-radius:14px;border:2px solid #2c3866;background:#151c33;color:#e8ecf8}
button{font-size:3vw;margin-top:3vh;padding:1.2vh 3vw;border-radius:14px;border:0;background:#3d7bff;color:#fff}
.e{color:#ff6b6b;font-size:2.4vw;margin-top:2vh}</style></head>
<body><h1>📺 EasyCast</h1><p>Masukkan kode 6 digit yang tampil di VS Code</p>
<form method="get" action="/"><input name="t" inputmode="numeric" pattern="[0-9]*" maxlength="6" autofocus autocomplete="off">
<br><button type="submit">Sambungkan</button></form>${error ? '<div class="e">Kode salah, coba lagi.</div>' : ''}</body></html>`;

export function registerEasyCast(
    ctx: vscode.ExtensionContext,
    getCurrent: () => Promise<Current | undefined>,
): EasyCastController {
    const media = vscode.Uri.joinPath(ctx.extensionUri, 'media');
    const log = vscode.window.createOutputChannel('EasyCast');
    let latest: Current | undefined;
    const tvPanels = new Set<vscode.WebviewPanel>();

    // ── server siaran jaringan lokal ───────────────────────────────────────────
    let server: http.Server | undefined;
    let token = '';
    let port = 0;
    let fails = 0;
    let lockedUntil = 0;
    const sseClients = new Set<http.ServerResponse>();
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    status.command = 'date-skunder.easycast.connectTv';

    const cfg = () => vscode.workspace.getConfiguration('dateSkunder');
    const slideSeconds = () => Math.min(60, Math.max(5, Math.round(cfg().get<number>('easycast.slideSeconds') ?? 12)));

    const tvPage = () => `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>EasyCast TV</title>
<style>html,body{margin:0;height:100%;background:#0b1020}</style></head>
<body data-ec-solo="1" data-ec-feed="?t=${token}" data-ec-seconds="${slideSeconds()}">
<script>${EASYCAST_CLIENT}</script></body></html>`;

    const startServer = async (): Promise<string[]> => {
        if (!server) {
            token = String(crypto.randomInt(100000, 1000000));
            fails = 0; lockedUntil = 0;
            const srv = http.createServer(async (req, res) => {
                try {
                    const url = new URL(req.url ?? '/', 'http://x');
                    const given = url.searchParams.get('t');
                    if (Date.now() < lockedUntil) { res.writeHead(429); res.end('Terlalu banyak percobaan. Tunggu semenit.'); return; }
                    if (given !== token) {
                        if (url.pathname === '/') {
                            if (given !== null) {
                                fails++;
                                if (fails >= 20) { lockedUntil = Date.now() + 60_000; fails = 0; }
                            }
                            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                            res.end(PIN_PAGE(given !== null));
                        } else {
                            res.writeHead(403); res.end('Forbidden');
                        }
                        return;
                    }
                    log.appendLine(`[${new Date().toLocaleTimeString()}] ${req.socket.remoteAddress} ${url.pathname}`);
                    if (url.pathname === '/') {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
                        res.end(tvPage());
                    } else if (url.pathname === '/data.json') {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                        res.end(latest ? JSON.stringify(slim(latest.workbook)) : 'null');
                    } else if (url.pathname === '/events') {
                        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
                        res.write('retry: 3000\n\n');
                        sseClients.add(res);
                        req.on('close', () => sseClients.delete(res));
                    } else {
                        res.writeHead(404); res.end('Not found');
                    }
                } catch (e) {
                    log.appendLine(`Kesalahan server: ${e instanceof Error ? e.message : String(e)}`);
                    try { res.writeHead(500); res.end('Error'); } catch { /* sudah terkirim */ }
                }
            });
            await new Promise<void>((resolve, reject) => {
                srv.once('error', reject);
                srv.listen(cfg().get<number>('easycast.port') ?? 8765, '0.0.0.0', () => resolve());
            });
            server = srv;
            port = (srv.address() as import('net').AddressInfo).port;
            log.appendLine(`Server siaran aktif di port ${port}, kode ${token}`);
        }
        const ips = lanAddresses();
        status.text = `$(broadcast) EasyCast TV ${ips[0] ?? 'localhost'}:${port} · kode ${token}`;
        status.tooltip = 'EasyCast sedang menyiarkan ke TV. Klik untuk melihat alamat.';
        status.show();
        return ips;
    };

    const stopServer = () => {
        for (const c of sseClients) { try { c.end(); } catch { /* sudah putus */ } }
        sseClients.clear();
        if (server) { log.appendLine('Server siaran dihentikan.'); }
        server?.close();
        server = undefined;
        status.hide();
    };

    const broadcast = () => {
        for (const c of sseClients) { c.write('data: update\n\n'); }
    };

    // ── perintah ───────────────────────────────────────────────────────────────
    const ensureData = async (): Promise<Current | undefined> => {
        if (!latest) { latest = await getCurrent(); }
        return latest;
    };

    const openTvWindow = async () => {
        const cur = await ensureData();
        const panel = vscode.window.createWebviewPanel('dateSkunder.easycast', 'EasyCast TV', vscode.ViewColumn.Active,
            { enableScripts: true, localResourceRoots: [media], retainContextWhenHidden: true });
        const nonce = crypto.randomBytes(16).toString('hex');
        panel.webview.html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>EasyCast TV</title><style>html,body{margin:0;height:100%;background:#0b1020}</style></head>
<body data-ec-solo="1" data-ec-seconds="${slideSeconds()}"><script nonce="${nonce}">${EASYCAST_CLIENT}</script></body></html>`;
        tvPanels.add(panel);
        panel.onDidDispose(() => tvPanels.delete(panel));
        if (cur) { void panel.webview.postMessage({ type: 'data', payload: slim(cur.workbook) }); }
        else { vscode.window.showInformationMessage('EasyCast: belum ada data. Buka berkas CSV/Excel lewat Date Skunder, jendela TV akan terisi otomatis.'); }
        // Pindahkan ke jendela baru supaya bisa ditarik ke monitor/TV.
        try { await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow'); } catch { /* versi VS Code lama */ }
    };

    const connectTv = async () => {
        const cur = await ensureData();
        if (!cur) {
            vscode.window.showWarningMessage('EasyCast: belum ada data untuk disiarkan. Buka berkas CSV/Excel lewat Date Skunder dulu, lalu tekan Sambungkan TV lagi.');
            return;
        }
        let ips: string[];
        try {
            ips = await startServer();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log.appendLine(`Gagal memulai server: ${msg}`);
            vscode.window.showErrorMessage(`EasyCast: server TV gagal dijalankan (${msg}). Ubah dateSkunder.easycast.port (mis. 0 = otomatis) lalu coba lagi.`);
            return;
        }
        if (!ips.length) {
            vscode.window.showWarningMessage('EasyCast: tidak ada jaringan Wi-Fi/LAN aktif. Hubungkan komputer ke jaringan yang sama dengan TV, atau pakai “Jendela TV” dengan kabel HDMI / Windows Project (Win+P).');
            return;
        }
        const base = ips.map((ip) => `http://${ip}:${port}`);
        const choice = await vscode.window.showInformationMessage(
            `📡 EasyCast siap. Di browser TV buka ${base[0]} lalu masukkan kode ${token}`,
            {
                modal: true,
                detail: `Alamat lain: ${base.slice(1).join(', ') || '-'}\n\nTV tidak menerima notifikasi otomatis — TV harus membuka alamat di atas (komputer & TV satu Wi-Fi). Untuk Chromecast: buka alamat ini di Chrome lalu menu ⋮ → Cast. Bila TV tidak bisa membuka, izinkan VS Code/Node di Windows Firewall (jaringan pribadi). Siaran berhenti saat dihentikan atau VS Code ditutup.`,
            },
            'Salin alamat + kode', 'Tes di komputer ini', 'Hentikan siaran',
        );
        if (choice === 'Salin alamat + kode') {
            await vscode.env.clipboard.writeText(`${base[0]}/?t=${token}`);
            vscode.window.showInformationMessage('Tautan lengkap disalin. Siaran tetap aktif (lihat status bar).');
        } else if (choice === 'Tes di komputer ini') {
            await vscode.env.openExternal(vscode.Uri.parse(`http://127.0.0.1:${port}/?t=${token}`));
        } else if (choice === 'Hentikan siaran') {
            stopServer();
            vscode.window.showInformationMessage('Siaran EasyCast dihentikan.');
        }
    };

    ctx.subscriptions.push(
        log, status,
        vscode.commands.registerCommand('date-skunder.easycast.newWindow', openTvWindow),
        vscode.commands.registerCommand('date-skunder.easycast.connectTv', connectTv),
        vscode.commands.registerCommand('date-skunder.easycast.stopTv', () => {
            if (server) {
                stopServer();
                vscode.window.showInformationMessage('Siaran EasyCast dihentikan.');
            }
        }),
    );

    return {
        update(fileName, workbook) {
            latest = { fileName, workbook };
            const payload = slim(workbook);
            for (const p of tvPanels) { void p.webview.postMessage({ type: 'data', payload }); }
            broadcast();
        },
        dispose() {
            stopServer();
            for (const p of [...tvPanels]) { p.dispose(); }
        },
    };
}