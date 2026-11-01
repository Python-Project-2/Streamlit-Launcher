import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export type ChatRoom = 'komunitas' | 'diskusi' | 'chat-ai';

const ROOM_LABEL: Record<ChatRoom, string> = {
    komunitas: 'KOMUNITAS',
    diskusi: 'DISKUSI AI',
    'chat-ai': 'CHAT AI',
};

const HEADER = [
    '# Date Skunder — catatan obrolan',
    '# Berkas ini diisi otomatis oleh ekstensi (Community Chat, Diskusi AI, dan Chat AI).',
    '# Format: [waktu] [ruang] nama: pesan — baris lanjutan diberi indentasi 4 spasi.',
    '#',
    '# Ruang:',
    '#   [KOMUNITAS #ruang]  obrolan komunitas — sumber: Firebase `community_*`, selalu diarsipkan di sini',
    '#   [DISKUSI AI]        diskusi masalah data sampai tuntas — sumber: Firebase `diskusi_ai`;',
    '#                       file ini adalah log (tidak dihapus saat rotasi 100 pesan)',
    '#   [CHAT AI]           percakapan di view Chat AI',
    '#',
    '# Berkas ini tidak dibatasi jumlah pesan dan dibaca ulang setiap view dimuat,',
    '# jadi riwayat obrolan tetap utuh setelah refresh. Tombol “Unduh JSON” di view',
    '# Community Chat menyimpan keseluruhan isi berkas ini sebagai satu berkas JSON.',,
    '',
];

/** Folder cadangan bila VS Code tidak membuka folder proyek (diisi dari activate()). */
let fallbackDir: string | undefined;
let errorReporter: ((message: string) => void) | undefined;
let queue: Promise<void> = Promise.resolve();
let bannerWritten = false;

export function setChatLogFallback(dir: string | undefined): void {
    fallbackDir = dir ? String(dir) : undefined;
}

/** Pelapor galat (biasanya console ekstensi) supaya masalah tulis berkas tidak hilang diam-diam. */
export function onChatLogError(reporter: ((message: string) => void) | undefined): void {
    errorReporter = reporter;
}

/** Lokasi berkas catatan: `<folder proyek>/data/data.txt`. */
export function chatLogFile(): string {
    const folder = vscode.workspace?.workspaceFolders?.[0]?.uri?.fsPath;
    const root = folder || fallbackDir || path.join(os.homedir(), 'Date Skunder');
    return path.join(root, 'data', 'data.txt');
}

/** Lokasi yang ditampilkan ke pengguna (relatif bila berada di folder proyek). */
export function chatLogLabel(): string {
    const folder = vscode.workspace?.workspaceFolders?.[0]?.uri?.fsPath;
    const full = chatLogFile();
    return folder && full.startsWith(folder) ? path.relative(folder, full).split(path.sep).join('/') : full;
}

function stamp(at = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())} ${p(at.getHours())}:${p(at.getMinutes())}:${p(at.getSeconds())}`;
}

function oneLine(text: string, max = 6000): string {
    return String(text ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+$/g, ''))
        .join('\n')
        .trim()
        .slice(0, max);
}

function formatLine(room: ChatRoom, author: string, text: string, tag?: string, roomLabel?: string, at = new Date()): string {
    const label = String(roomLabel || ROOM_LABEL[room] || room);
    const who = String(author || 'tanpa nama').replace(/\s+/g, ' ').trim().slice(0, 60);
    const suffix = tag ? ` · ${String(tag).replace(/\s+/g, ' ').trim().slice(0, 60)}` : '';
    const isi = oneLine(text);
    if (!isi) { return ''; }
    const lines = isi.split('\n');
    const head = `[${stamp(at)}] [${label}] ${who}${suffix}: ${lines[0]}`;
    const rest = lines.slice(1).map((line) => `    ${line}`);
    return [head, ...rest].join('\n');
}

function enqueue(chunk: string): void {
    queue = queue.then(async () => {
        const file = chatLogFile();
        try {
            await fs.promises.mkdir(path.dirname(file), { recursive: true });
            let prefix = '';
            if (!bannerWritten) {
                let empty = true;
                try { empty = (await fs.promises.stat(file)).size === 0; } catch { empty = true; }
                // BOM hanya saat berkas dibuat: Windows (Notepad/PowerShell) jadi tahu ini UTF-8.
                if (empty) { prefix += `\uFEFF${HEADER.join('\n')}`; }
                prefix += `# ── Sesi baru: ${stamp()} ──\n`;
                bannerWritten = true;
            }
            await fs.promises.appendFile(file, `${prefix}${chunk}\n`, 'utf8');
        } catch (e) {
            errorReporter?.(`Catatan obrolan gagal ditulis ke ${file}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }).catch(() => undefined);
}


export function appendChatLog(room: ChatRoom, author: string, text: string, tag?: string, roomLabel?: string, at?: Date): void {
    const line = formatLine(room, author, text, tag, roomLabel, at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date());
    if (!line) { return; }
    enqueue(line);
}

export function appendChatLogNote(text: string): void {
    const line = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!line) { return; }
    enqueue(`# ${line}`);
}

export function flushChatLog(): Promise<void> {
    return queue.then(() => undefined, () => undefined);
}

export async function archiveChatLog(): Promise<string | undefined> {
    await flushChatLog();
    const file = chatLogFile();
    try {
        const stat = await fs.promises.stat(file);
        if (!stat.size) { return undefined; }
        const dir = path.join(path.dirname(file), 'arsip');
        await fs.promises.mkdir(dir, { recursive: true });
        const p = (n: number) => String(n).padStart(2, '0');
        const now = new Date();
        const stampMs = String(now.getMilliseconds()).padStart(3, '0');
        const name = `data-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}-${stampMs}.txt`;
        const target = path.join(dir, name);
        await fs.promises.copyFile(file, target);
        return target;
    } catch (e) {
        errorReporter?.(`Arsip catatan gagal dibuat: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
    }
}

export function clearChatLog(reason = 'batas pesan'): Promise<void> {
    queue = queue.then(async () => {
        const file = chatLogFile();
        try {
            await fs.promises.mkdir(path.dirname(file), { recursive: true });
            const head = `\uFEFF${HEADER.join('\n')}# ── Sesi baru: ${stamp()} ──\n# ${String(reason).replace(/\s+/g, ' ').slice(0, 160)}\n`;
            await fs.promises.writeFile(file, head, 'utf8');
            bannerWritten = true;
        } catch (e) {
            errorReporter?.(`Catatan obrolan gagal dikosongkan: ${e instanceof Error ? e.message : String(e)}`);
        }
    }).catch(() => undefined);
    return queue;
}

export async function openChatLog(): Promise<void> {
    const file = chatLogFile();
    const uri = vscode.Uri.file(file);
    try {
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        try { await fs.promises.access(file); } catch {
            await fs.promises.writeFile(file, `\uFEFF${HEADER.join('\n')}# ── Sesi baru: ${stamp()} ──\n`, 'utf8');
        }
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (e) {
        void vscode.window.showWarningMessage(
            `Tidak bisa membuka catatan obrolan di ${file}: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
}

export interface ChatLogEntry {
    index: number;
    at: string;
    atMs: number;
    room: ChatRoom;
    roomLabel: string;
    channel: string;
    name: string;
    tag: string;
    kind: 'chat' | 'answer' | 'system';
    text: string;
}
export interface ChatLogMessageJson {
    index: number;
    at: string;
    timestamp: number;
    iso: string;
    room: ChatRoom;
    roomLabel: string;
    channel: string;
    name: string;
    tag: string;
    kind: ChatLogEntry['kind'];
    text: string;
}

export interface ChatLogJson {
    app: 'Date Skunder';
    format: 'date-skunder.chat';
    version: 1;
    exportedAt: string;
    file: string;
    label: string;
    total: number;
    rooms: Record<string, number>;
    messages: ChatLogMessageJson[];
}

const ENTRY_RE = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\] \[([^\]]+)\] ([^:]{1,200}): ?([\s\S]*)$/;

const ROOM_OF = (label: string): { room: ChatRoom; channel: string } => {
    const text = String(label || '').trim();
    const kom = /^KOMUNITAS(?:\s+#(.+))?$/i.exec(text);
    if (kom) { return { room: 'komunitas', channel: String(kom[1] || '').trim() }; }
    if (/^DISKUSI AI$/i.test(text)) { return { room: 'diskusi', channel: '' }; }
    if (/^CHAT AI$/i.test(text)) { return { room: 'chat-ai', channel: '' }; }
    return { room: 'komunitas', channel: '' };
};

const KIND_OF = (tag: string): ChatLogEntry['kind'] => {
    if (/\bjawaban\b/i.test(tag)) { return 'answer'; }
    if (/\bsistem\b/i.test(tag)) { return 'system'; }
    return 'chat';
};
function splitAuthor(raw: string): { name: string; tag: string } {
    const parts = String(raw || '').split(' · ').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) { return { name: 'tanpa nama', tag: '' }; }
    return { name: parts[0], tag: parts.slice(1).join(' · ') };
}
export function parseChatLog(text: string): ChatLogEntry[] {
    const out: ChatLogEntry[] = [];
    const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/);
    let current: ChatLogEntry | undefined;
    for (const line of lines) {
        const m = ENTRY_RE.exec(line);
        if (m) {
            const [, y, mo, d, h, mi, se, label, who, body] = m;
            const at = `${y}-${mo}-${d} ${h}:${mi}:${se}`;
            const atMs = new Date(
                Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se),
            ).getTime();
            const { room, channel } = ROOM_OF(label);
            const author = splitAuthor(who);
            current = {
                index: out.length,
                at,
                atMs: Number.isFinite(atMs) ? atMs : 0,
                room,
                roomLabel: label.trim(),
                channel,
                name: author.name,
                tag: author.tag,
                kind: KIND_OF(author.tag),
                text: body ?? '',
            };
            out.push(current);
            continue;
        }
        if (!current) { continue; }
        if (/^ {4}/.test(line)) {
            current.text += `\n${line.slice(4)}`;
            continue;
        }
        if (!line.trim()) { continue; }
        current = undefined;
    }
    return out;
}

export async function readChatLogEntries(): Promise<ChatLogEntry[]> {
    const file = chatLogFile();
    try {
        const text = await fs.promises.readFile(file, 'utf8');
        return parseChatLog(text);
    } catch {
        return [];
    }
}

export async function chatLogJson(): Promise<ChatLogJson> {
    const entries = await readChatLogEntries();
    const rooms: Record<string, number> = {};
    for (const entry of entries) {
        rooms[entry.room] = (rooms[entry.room] ?? 0) + 1;
    }
    return {
        app: 'Date Skunder',
        format: 'date-skunder.chat',
        version: 1,
        exportedAt: new Date().toISOString(),
        file: chatLogFile(),
        label: chatLogLabel(),
        total: entries.length,
        rooms,
        messages: entries.map((entry) => ({
            index: entry.index,
            at: entry.at,
            timestamp: entry.atMs,
            iso: entry.atMs ? new Date(entry.atMs).toISOString() : '',
            room: entry.room,
            roomLabel: entry.roomLabel,
            channel: entry.channel,
            name: entry.name,
            tag: entry.tag,
            kind: entry.kind,
            text: entry.text,
        })),
    };
}
export async function chatLogJsonText(): Promise<string> {
    return `${JSON.stringify(await chatLogJson(), null, 2)}\n`;
}
