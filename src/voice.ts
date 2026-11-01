import { execFile, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface VoiceInfo {
    name: string;
    culture: string;
    gender: string;
    engine: 'system';
}

export interface VoiceCatalog {
    voices: VoiceInfo[];
    recognizers: string[];
}

export interface SpeechResult {
    ok: boolean;
    text?: string;
    confidence?: number;
    culture?: string;
    error?: string;
}

export interface SpeakOptions {
    text: string;
    voiceName?: string;
    /** 0.5–2.0 (1 = kecepatan normal) */
    rate?: number;
    /** 0–2 (1 = normal) */
    pitch?: number;
    /** 0–1 */
    volume?: number;
}

export interface SpeechHandle {
    done: Promise<void>;
    cancel: () => void;
}

export interface RecognizeOptions {
    /** Batas waktu mendengar satu ucapan (detik). */
    seconds: number;
    /** Budaya yang diminta, mis. 'id-ID'. Kosong = pengenal bawaan. */
    culture?: string;
}

// ── skrip PowerShell (Windows) ───────────────────────────────────────────────

const PS_VOICES = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @()
foreach ($v in $synth.GetInstalledVoices()) {
    $info = $v.VoiceInfo
    $voices += [pscustomobject]@{
        name = $info.Name
        culture = $info.Culture.Name
        gender = $info.Gender.ToString()
    }
}
$synth.Dispose()
$recognizers = @()
try {
    foreach ($r in [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()) {
        $recognizers += $r.Culture.Name
    }
} catch { }
ConvertTo-Json -InputObject @{ voices = @($voices); recognizers = @($recognizers) } -Compress -Depth 4
`;

const PS_LISTEN = `param([int]$Seconds = 12, [string]$Culture = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Emit($obj) { $obj | ConvertTo-Json -Compress -Depth 4 }
try {
    Add-Type -AssemblyName System.Speech
} catch {
    Emit @{ ok = $false; error = 'Pustaka System.Speech tidak tersedia di komputer ini.' }
    exit 0
}
try {
    $engine = $null
    if ($Culture) {
        $info = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()) | Where-Object { $_.Culture.Name -eq $Culture } | Select-Object -First 1
        if ($info) { $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $info }
    }
    if (-not $engine) {
        $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    }
    $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
    $engine.SetInputToDefaultAudioDevice()
    $result = $engine.Recognize([TimeSpan]::FromSeconds([Math]::Max(3, $Seconds)))
    if ($result) {
        Emit @{ ok = $true; text = $result.Text; confidence = $result.Confidence; culture = $engine.RecognizerInfo.Culture.Name }
    } else {
        Emit @{ ok = $false; error = 'Tidak ada ucapan yang terdengar dalam batas waktu. Coba bicara lebih dekat ke mikrofon.' }
    }
    $engine.Dispose()
} catch {
    Emit @{ ok = $false; error = $_.Exception.Message }
}
`;

const PS_SPEAK = `param([string]$File = '', [string]$Voice = '', [int]$Rate = 0, [int]$Volume = 100)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = Get-Content -LiteralPath $File -Raw -Encoding UTF8
if (-not $text) { exit 0 }
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($Voice) { try { $synth.SelectVoice($Voice) } catch { } }
$synth.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
$synth.Volume = [Math]::Max(0, [Math]::Min(100, $Volume))
try {
    $synth.Speak($text)
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $synth.Dispose()
    exit 1
}
$synth.Dispose()
exit 0
`;

const CACHE_MS = 5 * 60 * 1000;

/**
 * Penyimpanan skrip bantu di folder sementara. Berkas ditulis ulang hanya bila isinya berbeda
 * sehingga pemanggilan berulang tidak menyentuh disk tanpa perlu.
 */
function scriptPath(name: string, content: string): string {
    const dir = path.join(os.tmpdir(), 'date-skunder-voice');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, name);
    try {
        if (fs.readFileSync(file, 'utf8') === content) { return file; }
    } catch { /* berkas belum ada → tulis baru */ }
    fs.writeFileSync(file, content, 'utf8');
    return file;
}

function parseJsonLoose(raw: string): any {
    const text = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (!text) { return undefined; }
    try { return JSON.parse(text); } catch { /* coba baris terakhir */ }
    const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
    for (let i = lines.length - 1; i >= 0; i--) {
        try { return JSON.parse(lines[i].trim()); } catch { /* lanjut ke baris sebelumnya */ }
    }
    return undefined;
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}

/** Layanan suara lintas platform: satu instance dipakai bersama view Chat AI. */
export class VoiceService {
    private catalog?: { at: number; data: VoiceCatalog };
    private listening?: ChildProcess;
    private speaking?: ChildProcess;
    private speechFile?: string;

    constructor(private platform: NodeJS.Platform = process.platform) { }

    /** STT hanya tersedia bila pengenal ucapan sistem bisa dipanggil (Windows). */
    systemSttSupported(): boolean {
        return this.platform === 'win32';
    }

    systemTtsSupported(): boolean {
        return this.platform === 'win32' || this.platform === 'darwin' || this.platform === 'linux';
    }

    /** Daftar suara sistem + pengenal ucapan yang terpasang (hasil di-cache 5 menit). */
    async listVoices(force = false): Promise<VoiceCatalog> {
        if (!force && this.catalog && Date.now() - this.catalog.at < CACHE_MS) { return this.catalog.data; }
        let data: VoiceCatalog = { voices: [], recognizers: [] };
        try {
            if (this.platform === 'win32') {
                data = await this.listWindowsVoices();
            } else if (this.platform === 'darwin') {
                data = await this.listDarwinVoices();
            } else {
                data = await this.listLinuxVoices();
            }
        } catch { /* daftar suara gagal → suara default sistem tetap dipakai */ }
        this.catalog = { at: Date.now(), data };
        return data;
    }

    private async listWindowsVoices(): Promise<VoiceCatalog> {
        const script = scriptPath('voices.ps1', PS_VOICES);
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { timeout: 20000, windowsHide: true });
        const json = parseJsonLoose(stdout) ?? {};
        const rawVoices: any[] = Array.isArray(json.voices) ? json.voices : (json.voices ? [json.voices] : []);
        const voices: VoiceInfo[] = rawVoices
            .filter((v) => v && v.name)
            .map((v) => ({ name: String(v.name), culture: String(v.culture || ''), gender: String(v.gender || ''), engine: 'system' as const }));
        const rawRec: any[] = Array.isArray(json.recognizers) ? json.recognizers : (json.recognizers ? [json.recognizers] : []);
        const recognizers = rawRec.map((c) => String(c)).filter(Boolean);
        return { voices, recognizers };
    }

    /** macOS: daftar suara `say`. Pengenalan ucapan sistem tidak tersedia lewat CLI. */
    private async listDarwinVoices(): Promise<VoiceCatalog> {
        const { stdout } = await execFileAsync('say', ['-v', '?'], { timeout: 8000 });
        const voices: VoiceInfo[] = String(stdout)
            .split(/\r?\n/)
            .map((line) => /^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})/.exec(line))
            .filter((m): m is RegExpExecArray => !!m)
            .map((m) => ({ name: m[1].trim(), culture: m[2], gender: '', engine: 'system' as const }));
        return { voices, recognizers: [] };
    }

    /** Linux: pakai espeak-ng/espeak bila terpasang. */
    private async listLinuxVoices(): Promise<VoiceCatalog> {
        for (const bin of ['espeak-ng', 'espeak']) {
            try {
                const { stdout } = await execFileAsync(bin, ['--voices'], { timeout: 8000 });
                const voices: VoiceInfo[] = String(stdout)
                    .split(/\r?\n/)
                    .slice(1)
                    .map((line) => line.split(/\s+/))
                    .filter((cols) => cols.length >= 4)
                    .map((cols) => ({ name: cols[3], culture: cols[1] === '--' ? cols[2] : `${cols[1]}`, gender: '', engine: 'system' as const }));
                return { voices, recognizers: [] };
            } catch { /* coba biner berikutnya */ }
        }
        return { voices: [], recognizers: [] };
    }

    /** Mendengarkan satu ucapan dari mikrofon default lalu mengembalikan teksnya. */
    async recognize(opts: RecognizeOptions): Promise<SpeechResult> {
        if (!this.systemSttSupported()) {
            return { ok: false, error: 'Pengenalan ucapan sistem hanya tersedia di Windows. Di sistem lain pakai mesin STT lain (mis. dukungan Web Speech API pada VS Code for the Web).' };
        }
        const script = scriptPath('listen.ps1', PS_LISTEN);
        const seconds = clamp(Math.round(opts.seconds || 12), 3, 60);
        const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Seconds', String(seconds)];
        if (opts.culture) { args.push('-Culture', opts.culture); }

        try {
            const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
                const child = execFile('powershell.exe', args, {
                    timeout: (seconds + 20) * 1000,
                    windowsHide: true,
                    maxBuffer: 4 * 1024 * 1024,
                    encoding: 'utf8',
                }, (err, stdout, stderr) => {
                    this.listening = undefined;
                    if (err && !stdout) {
                        // Proses gagal tanpa keluaran JSON: bawa pesan stderr agar pengguna tahu sebabnya.
                        const detail = String(stderr || err.message || '').trim();
                        reject(new Error(detail || err.message || 'proses mendengar gagal'));
                        return;
                    }
                    resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
                });
                this.listening = child;
            });
            const json = parseJsonLoose(stdout);
            if (!json) {
                const detail = String(stderr || '').trim();
                return { ok: false, error: detail || 'Mesin pengenal ucapan tidak memberi jawaban yang bisa dibaca.' };
            }
            if (json.ok && json.text) {
                return { ok: true, text: String(json.text), confidence: typeof json.confidence === 'number' ? json.confidence : undefined, culture: json.culture ? String(json.culture) : undefined };
            }
            return { ok: false, error: String(json.error || 'Ucapan tidak terdeteksi.') };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }

    /** Batalkan proses mendengar yang sedang berjalan (berkas yang sudah dikenali tetap hilang). */
    cancelRecognition(): void {
        const child = this.listening;
        if (!child) { return; }
        this.listening = undefined;
        try { child.kill(); } catch { /* sudah berhenti sendiri */ }
    }

    get isListening(): boolean { return !!this.listening; }
    get isSpeaking(): boolean { return !!this.speaking; }

    /** Bicara memakai suara sistem; teks dikirim lewat berkas agar tidak ada masalah kutipan. */
    speak(opts: SpeakOptions): SpeechHandle {
        const text = String(opts.text || '').trim();
        let cancelled = false;
        let child: ChildProcess | undefined;
        let settle: () => void = () => { };
        const done = new Promise<void>((resolve) => { settle = resolve; });

        const finish = (): void => {
            if (this.speaking === child) { this.speaking = undefined; }
            settle();
        };

        if (!text || !this.systemTtsSupported()) { finish(); return { done, cancel: () => { } }; }

        const file = path.join(os.tmpdir(), 'date-skunder-voice', `speak-${Date.now()}.txt`);
        try {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text, 'utf8');
        } catch {
            finish();
            return { done, cancel: () => { } };
        }
        this.speechFile = file;

        const cleanup = (): void => {
            try { fs.unlinkSync(file); } catch { /* sudah dihapus */ }
            if (this.speechFile === file) { this.speechFile = undefined; }
        };

        const rate10 = clamp(Math.round(((opts.rate ?? 1) - 1) * 10), -10, 10);
        const volume = clamp(Math.round((opts.volume ?? 1) * 100), 0, 100);

        if (this.platform === 'win32') {
            const script = scriptPath('speak.ps1', PS_SPEAK);
            const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-File', file, '-Rate', String(rate10), '-Volume', String(volume)];
            if (opts.voiceName) { args.push('-Voice', opts.voiceName); }
            child = execFile('powershell.exe', args, { windowsHide: true }, () => { cleanup(); finish(); });
        } else if (this.platform === 'darwin') {
            const args = ['-f', file];
            if (opts.voiceName) { args.push('-v', opts.voiceName); }
            args.push('-r', String(clamp(Math.round(175 * (opts.rate ?? 1)), 90, 400)));
            child = execFile('say', args, () => { cleanup(); finish(); });
        } else {
            const bin = 'espeak-ng';
            child = execFile(bin, ['-f', file, '-s', String(clamp(Math.round(175 * (opts.rate ?? 1)), 80, 450)), '-a', String(clamp(Math.round((opts.volume ?? 1) * 200), 0, 200))], () => { cleanup(); finish(); });
        }
        this.speaking = child;

        return {
            done,
            cancel: () => {
                if (cancelled) { return; }
                cancelled = true;
                try { child?.kill(); } catch { /* proses sudah berhenti */ }
                cleanup();
                finish();
            },
        };
    }

    /** Hentikan suara sistem yang sedang berbunyi. */
    stopSpeaking(): void {
        const child = this.speaking;
        if (!child) { return; }
        this.speaking = undefined;
        try { child.kill(); } catch { /* sudah berhenti */ }
        if (this.speechFile) {
            try { fs.unlinkSync(this.speechFile); } catch { /* sudah terhapus */ }
            this.speechFile = undefined;
        }
    }
}

// execFile dengan promise + encoding utf8 (dipakai beberapa tempat di file ini).
function execFileAsync(cmd: string, args: string[], options: Parameters<typeof execFile>[2]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { ...options, encoding: 'utf8' }, (err, stdout, stderr) => {
            if (err) { reject(err); return; }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}
