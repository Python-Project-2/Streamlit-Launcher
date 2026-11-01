/**
 * Stub minimal modul `vscode` agar kode extension bisa dijalankan di Node biasa.
 * Dipakai oleh `npm run check:easycast` dan `npm run check:community` (scripts/).
 */
const fs = require('fs');
const path = require('path');

// Disimpan di globalThis supaya salinan stub yang di-bundle esbuild dan yang di-require tes
// memakai objek pengaturan yang sama.
const folders = globalThis.__SK_WORKSPACE_FOLDERS__ || (globalThis.__SK_WORKSPACE_FOLDERS__ = []);
const config = globalThis.__SK_CONFIG__ || (globalThis.__SK_CONFIG__ = {
    'ui.language': 'zh-cn',
    exportFolder: '',
    autoRevealInFileManager: false,
    'easycast.slideSeconds': 10,
    authorName: 'Tester',
    affiliation: 'Lab',
    email: 'lab@example.com',
    workflowJpgQuality: 80,
    'llama.port': 8081,
    'community.live': true,
    'community.liveSeconds': 12,
    'community.languages': ['id', 'en', 'zh', 'ja', 'es'],
    'community.replyLanguage': 'auto',
});

class Uri {
    constructor(scheme, p, raw) {
        this.scheme = scheme;
        this.fsPath = p;
        this.path = String(p).replace(/\\/g, '/');
        if (raw) { this.raw = raw; }
    }
    static file(p) { return new Uri('file', p); }
    static parse(s) {
        const scheme = (s.match(/^([a-z]+):/) || [, 'file'])[1];
        const fsPath = s.replace(/^[a-z]+:\/\//, '').replace(/[?#].*$/, '');
        const u = new Uri(scheme, fsPath, s);
        u.fragment = s.includes('#') ? s.split('#')[1] : '';
        return u;
    }
    static joinPath(base, ...parts) { return new Uri('file', path.join(base.fsPath ?? base.path, ...parts)); }
    toString() { return this.raw || `file:///${String(this.fsPath || this.path).replace(/\\/g, '/')}`; }
}

/** Semua berkas yang ditulis / URL yang dibuka selama pengujian. */
const wrote = [];
const opened = [];

const vscode = {
    Uri,
    ThemeIcon: class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } },
    ProgressLocation: { Notification: 15 },
    ConfigurationTarget: { Global: 1 },
    StatusBarAlignment: { Right: 2 },
    ViewColumn: { Active: -1, One: 1 },
    env: {
        language: 'zh-cn',
        openExternal: async (u) => { opened.push(String(u)); (global.__SK_OPENED__ = global.__SK_OPENED__ || []).push(String(u)); return true; },
        clipboard: { writeText: async () => {} },
    },
    workspace: {
        getConfiguration: () => ({
            get: (k, dflt) => (k in config ? config[k] : dflt),
            update: async (k, v) => { config[k] = v; },
            has: (k) => k in config,
        }),
        fs: {
            readFile: async (uri) => fs.readFileSync(uri.fsPath),
            writeFile: async (uri, data) => {
                wrote.push(uri.fsPath);
                fs.mkdirSync(path.dirname(uri.fsPath), { recursive: true });
                fs.writeFileSync(uri.fsPath, Buffer.from(data));
            },
            createDirectory: async (uri) => { fs.mkdirSync(uri.fsPath, { recursive: true }); },
            readDirectory: async (uri) => fs.readdirSync(uri.fsPath).map((name) => [name, fs.statSync(path.join(uri.fsPath, name)).isDirectory() ? 2 : 1]),
            delete: async (uri) => { fs.rmSync(uri.fsPath, { recursive: true, force: true }); },
        },
        onDidChangeConfiguration: () => ({ dispose() {} }),
        createFileSystemWatcher: () => ({ onDidChange() {}, dispose() {} }),
        workspaceFolders: folders,
    },
    window: {
        withProgress: async (_opts, task) => task(),
        showInformationMessage: async () => undefined,
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined,
        showQuickPick: async () => undefined,
        createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
        createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
        registerWebviewViewProvider: () => ({ dispose() {} }),
        registerCustomEditorProvider: () => ({ dispose() {} }),
        createWebviewPanel: () => ({
            webview: { postMessage() {}, asWebviewUri: (u) => u, onDidReceiveMessage() {} },
            onDidDispose() {}, reveal() {}, dispose() {},
        }),
    },
    commands: {
        registerCommand: (id, fn) => {
            (globalThis.__SK_COMMANDS__ = globalThis.__SK_COMMANDS__ || {})[id] = fn;
            return { dispose() {} };
        },
        executeCommand: async () => undefined,
    },
    extensions: { getExtension: () => undefined },
    l10n: { t: (s) => s },
    EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} },
};

module.exports = vscode;
module.exports.config = config;
module.exports.wrote = wrote;
module.exports.opened = opened;
