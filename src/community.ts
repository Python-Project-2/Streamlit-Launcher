import * as vscode from 'vscode';

export const COMMUNITY_CHANNELS = [
    { id: 'umum', label: '#umum', desc: 'Obrolan bebas seputar pemakaian Date Skunder' },
    { id: 'bantuan', label: '#bantuan', desc: 'Tanya jawab saat ada kendala' },
    { id: 'ide', label: '#ide & masukan', desc: 'Usulan fitur dan masukan' },
];

/** Koleksi artikel Publish di database. */
export const ARTICLE_COLLECTION = 'articles';

const _k1 = 'AIzaSyBIyAz-ZOIL';
const _k2 = '_CzvNHC6PpYNr7NJJgzaVqo';
/** Kunci web publik bawaan (dibatasi aturan keamanan database). */
export const DEFAULT_DATABASE_KEY = _k1 + _k2;

/** Proyek database bawaan (bisa diganti lewat pengaturan `dateSkunder.publish.project`). */
export const DEFAULT_DATABASE_PROJECT = 'streamlit-launcher-vscode';

export function databaseKey(): string {
    const candidate = (value: unknown): string => {
        const text = String(value ?? '').trim();
        if (!text || text.includes('[') || text.includes('<') || text.length < 20) { return ''; }
        return text;
    };
    const cfg = vscode.workspace.getConfiguration('dateSkunder');
    const setting = candidate(cfg.get<string>('publish.webKey'))
        || candidate(cfg.get<string>('community.webKey'));
    if (setting) { return setting; }
    const env = candidate(
        process.env.DATASKUNDER_DATABASE_KEY
        || process.env.DATASKUNDER_DATABASE_WEB_KEY,
    );
    if (env) { return env; }
    return DEFAULT_DATABASE_KEY;
}

/** Id proyek database yang dipakai (bawaan proyek publik, bisa diganti di pengaturan). */
export function databaseProjectId(): string {
    const setting = (vscode.workspace.getConfiguration('dateSkunder').get<string>('publish.project') ?? '').trim();
    return setting || DEFAULT_DATABASE_PROJECT;
}
