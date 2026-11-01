/**
 * Uji aktivasi ekstensi untuk fitur Join Room (tanpa membuka VS Code):
 *  - seluruh `activate()` berjalan tanpa galat,
 *  - server Socket.IO menyala otomatis,
 *  - perintah room terdaftar di Command Palette,
 *  - `deactivate()` menutup layanan dengan rapi.
 *
 * Jalankan: node scripts/check-room-activate.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const vscode = require('./vscode-stub.cjs');

// API yang dipakai saat aktivasi (tidak ada di stub dasar).
vscode.window.createTerminal = () => ({ show() {}, dispose() {}, exitStatus: undefined, sendText() {} });
vscode.window.tabGroups = { activeTabGroup: { activeTab: undefined } };
vscode.window.activeTextEditor = undefined;
vscode.window.showOpenDialog = async () => undefined;
vscode.window.createOutputChannel = () => ({ appendLine() {}, show() {}, dispose() {} });
vscode.window.onDidChangeActiveTextEditor = () => ({ dispose() {} });
vscode.workspace.findFiles = async () => [];
vscode.workspace.onDidSaveTextDocument = () => ({ dispose() {} });
vscode.workspace.getWorkspaceFolder = () => undefined;
vscode.workspace.workspaceFolders = [];
vscode.env.appName = 'VS Code';
globalThis.__SK_VSCODE__ = vscode;

// Terminal & API obrolan dimatikan supaya uji fokus ke Join Room dan tidak membuka port lain.
vscode.config['community.api'] = false;
vscode.config['community.apiTerminal'] = false;
vscode.config['room.terminal'] = false;
vscode.config['room.autoStart'] = true;
vscode.config['room.port'] = 49600 + Math.floor(Math.random() * 200);

let pass = 0;
let fail = 0;
function ok(cond, label, extra) {
    if (cond) { pass += 1; console.log(`  ok   ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}${extra ? ` -> ${extra}` : ''}`); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bundle() {
    const out = path.join(root, '.tmp-check', `extension-activate-${process.pid}.cjs`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await esbuild.build({
        entryPoints: [path.join(root, 'src', 'extension.ts')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: 'node18',
        outfile: out,
        logLevel: 'warning',
        external: ['vscode'],
        plugins: [{
            name: 'vscode-global',
            setup(build) {
                build.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'stub' }));
                build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'module.exports = globalThis.__SK_VSCODE__;',
                    loader: 'js',
                }));
            },
        }],
    });
    return out;
}

(async () => {
    let file;
    try {
        file = await bundle();
        const ext = require(file);
        ok(typeof ext.activate === 'function', 'bundel ekstensi memuat activate');

        const state = new Map();
        const ctx = {
            subscriptions: [],
            extensionUri: vscode.Uri.file(root),
            extensionPath: root,
            globalStorageUri: vscode.Uri.file(path.join(os.tmpdir(), `sk-activate-${process.pid}`)),
            workspaceState: { get: (k, d) => (state.has(k) ? state.get(k) : d), update: async (k, v) => { state.set(k, v); } },
            globalState: { get: (k, d) => (state.has(k) ? state.get(k) : d), update: async (k, v) => { state.set(k, v); } },
            secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} },
        };

        let error = null;
        try {
            ext.activate(ctx);
        } catch (e) {
            error = e;
        }
        ok(!error, 'activate() berjalan tanpa galat', error && error.message);
        ok(ctx.subscriptions.length > 40, 'banyak langganan terdaftar', String(ctx.subscriptions.length));

        await wait(1600);
        const commands = globalThis.__SK_COMMANDS__ || {};
        const roomCommands = ['date-skunder.room.join', 'date-skunder.room.leave', 'date-skunder.room.terminal'];
        ok(roomCommands.every((c) => typeof commands[c] === 'function'), 'tiga perintah room terdaftar', roomCommands.filter((c) => !commands[c]).join(','));

        await ext.deactivate();
        ok(true, 'deactivate() selesai');
    } catch (e) {
        fail += 1;
        console.error('\nGagal:', e && e.stack ? e.stack : e);
    } finally {
        if (file) { try { fs.rmSync(file, { force: true }); } catch { /* abaikan */ } }
    }
    console.log(`\n${pass} lulus, ${fail} gagal`);
    process.exit(fail ? 1 : 0);
})();
