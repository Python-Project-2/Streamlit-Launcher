import * as vscode from 'vscode';
import { missionRewards, type MissionId } from './petMissions';

export interface PetSkinColors {
    leg: string;
    body: string;
    back: string;
    head: string;
    outline: string;
    eye: string;
    pupil: string;
    accent: string;
}

/** Aksesori tetap yang digambar di atas rangka laba-laba. */
export type PetAccessory = 'none' | 'crown' | 'hat' | 'bow' | 'glasses' | 'scarf' | 'halo' | 'headband' | 'antenna' | 'wings';

export interface PetSkin {
    id: string;
    name: string;
    tagline: string;
    colors: PetSkinColors;
    accessory: PetAccessory;
    /** Bila diisi, kostum ini terkunci sampai misi tersebut selesai (lihat src/petMissions.ts). */
    mission?: MissionId;
}
const ACCESSORY_SVG: Record<PetAccessory, string> = {
    none: '',
    crown: '<path class="sp-acc" d="M51.4 31 L51.4 20.6 L56 25.6 L60 18.8 L64 25.6 L68.6 20.6 L68.6 31 Z" />',
    hat: '<g class="sp-acc"><path d="M52.6 31 L52.6 19 Q60 15.4 67.4 19 L67.4 31 Z" /><ellipse cx="60" cy="31" rx="13.4" ry="3.1" /><rect class="sp-acc-band" x="52.6" y="26.4" width="14.8" height="3.4" /></g>',
    bow: '<g class="sp-acc"><path d="M53 56.5 L45.6 52.2 L45.6 60.8 Z" /><path d="M67 56.5 L74.4 52.2 L74.4 60.8 Z" /><circle cx="60" cy="56.5" r="2.3" /></g>',
    glasses: '<g class="sp-acc ring"><circle cx="55.4" cy="39" r="5.1" /><circle cx="64.6" cy="39" r="5.1" /><path d="M60.5 39 L59.5 39" /><path d="M50.3 37.6 L47 35.6" /><path d="M69.7 37.6 L73 35.6" /></g>',
    scarf: '<g class="sp-acc"><path d="M47.2 54.6 Q60 61.8 72.8 54.6 L72.8 59.6 Q60 66.8 47.2 59.6 Z" /><path d="M53.4 62.5 L49.4 73.4 L55.2 73.4 L56.8 63.6 Z" /></g>',
    halo: '<ellipse class="sp-acc ring" cx="60" cy="17.6" rx="10.2" ry="3.4" />',
    headband: '<g class="sp-acc"><path d="M48.4 34.6 Q60 30.4 71.6 34.6 L71 38.4 Q60 34.4 49 38.4 Z" /><path d="M49.6 36.4 L39.6 30.4 L41.4 37.6 Z" /></g>',
    antenna: '<g class="sp-acc"><path d="M55.4 32.5 L52.2 20.8 L54.6 20 L57.6 31.4 Z" /><circle cx="53.4" cy="18.8" r="3.1" /><path d="M64.6 32.5 L67.8 20.8 L65.4 20 L62.4 31.4 Z" /><circle cx="66.6" cy="18.8" r="3.1" /></g>',
    wings: '<g class="sp-acc"><path d="M47 54 Q30 41 26.5 58 Q37 63 47 61 Z" /><path d="M73 54 Q90 41 93.5 58 Q83 63 73 61 Z" /></g>',
};

export const PET_SKINS: PetSkin[] = [
    {
        id: 'baja',
        name: 'Baja Klasik',
        tagline: 'Tampilan bawaan: abu baja dengan mata biru dingin.',
        colors: { leg: '#22262c', body: '#2b3038', back: '#3a4149', head: '#343a42', outline: '#4b5563', eye: '#e8f6ff', pupil: '#17324a', accent: '#8fa3b8' },
        accessory: 'none',
    },
    {
        id: 'merah',
        name: 'Merah Menyala',
        tagline: 'Badan merah berani, leher dibalut syal.',
        colors: { leg: '#5a1f22', body: '#a8323a', back: '#c0454d', head: '#932b33', outline: '#e2707a', eye: '#fff2f2', pupil: '#4a0f12', accent: '#ffb3b3' },
        accessory: 'scarf',
        mission: 'first-jurnal',
    },
    {
        id: 'zamrud',
        name: 'Zamrud Rimba',
        tagline: 'Hijau zamrud segar dengan topi petualang.',
        colors: { leg: '#14402c', body: '#1f7a4d', back: '#2b9962', head: '#1c6b44', outline: '#5fd39a', eye: '#eafff5', pupil: '#0b3a26', accent: '#9ff2c8' },
        accessory: 'hat',
        mission: 'first-workflow',
    },
    {
        id: 'senja',
        name: 'Senja Jingga',
        tagline: 'Oranye senja hangat berkacamata bundar.',
        colors: { leg: '#5a3418', body: '#d2691e', back: '#e8833a', head: '#b85c17', outline: '#ffc38a', eye: '#fff6ea', pupil: '#542609', accent: '#ffd9a8' },
        accessory: 'glasses',
        mission: 'navigator',
    },
    {
        id: 'ungu',
        name: 'Ungu Neon',
        tagline: 'Ungu terang berpendar dengan dasi kupu-kupu.',
        colors: { leg: '#2e1b4d', body: '#6d28d9', back: '#8b5cf6', head: '#5b21b6', outline: '#c4b5fd', eye: '#f5f3ff', pupil: '#2e1065', accent: '#d8b4fe' },
        accessory: 'bow',
        mission: 'typist',
    },
    {
        id: 'es',
        name: 'Es Kristal',
        tagline: 'Biru muda sebening es dengan halo melayang.',
        colors: { leg: '#7fa3bd', body: '#d8ecfa', back: '#eef7ff', head: '#c6dff1', outline: '#ffffff', eye: '#ffffff', pupil: '#123a55', accent: '#8fd3ff' },
        accessory: 'halo',
        mission: 'first-json',
    },
    {
        id: 'emas',
        name: 'Emas Royal',
        tagline: 'Emas berkilau bermahkota untuk tugas besar.',
        colors: { leg: '#4a3a08', body: '#d4af37', back: '#e9c95c', head: '#bb9427', outline: '#fff1b8', eye: '#fffbe8', pupil: '#4a3a06', accent: '#fff3c4' },
        accessory: 'crown',
        mission: 'first-pptx',
    },
    {
        id: 'ninja',
        name: 'Ninja Bayangan',
        tagline: 'Hitam pekat, ikat kepala merah, mata menyala.',
        colors: { leg: '#0c0e12', body: '#16181d', back: '#21252d', head: '#14171c', outline: '#3d4450', eye: '#ffe1e1', pupil: '#7f1d1d', accent: '#b91c1c' },
        accessory: 'headband',
        mission: 'marathon',
    },
    {
        id: 'samurai',
        name: 'Samurai Fajar',
        tagline: 'Merah gelap berikat kepala — terkunci sampai misi “Eksportir Pertama” selesai.',
        colors: { leg: '#2a1010', body: '#7f1d1d', back: '#a12b2b', head: '#641414', outline: '#d97373', eye: '#ffe9e9', pupil: '#3b0a0a', accent: '#dc2626' },
        accessory: 'headband',
        mission: 'first-export',
    },
    {
        id: 'lava',
        name: 'Lava Magma',
        tagline: 'Bara oranye bersyal — terkunci sampai misi “Sekali Klik Semua” selesai.',
        colors: { leg: '#2b1a0a', body: '#7c2d12', back: '#c2410c', head: '#9a3412', outline: '#fb923c', eye: '#fff1e6', pupil: '#542007', accent: '#f97316' },
        accessory: 'scarf',
        mission: 'export-all',
    },
    {
        id: 'robot',
        name: 'Robot Chrome',
        tagline: 'Logam perak berantena — terkunci sampai misi “Penjelajah Halaman” selesai.',
        colors: { leg: '#4b5563', body: '#9ca3af', back: '#cbd5e1', head: '#6b7280', outline: '#e5e7eb', eye: '#38bdf8', pupil: '#0f172a', accent: '#22d3ee' },
        accessory: 'antenna',
        mission: 'tour-master',
    },
    {
        id: 'peri',
        name: 'Peri Kupu',
        tagline: 'Ungu-pink bersayap — terkunci sampai misi “Tukang Cek” selesai.',
        colors: { leg: '#4c1d95', body: '#c084fc', back: '#e9d5ff', head: '#a855f7', outline: '#f5d0fe', eye: '#fff7ff', pupil: '#4c1d95', accent: '#f9a8d4' },
        accessory: 'wings',
        mission: 'checker',
    },
    {
        id: 'hantu',
        name: 'Hantu Bulan',
        tagline: 'Pucat berhalo — terkunci sampai misi “Pekerja Nonstop” selesai.',
        colors: { leg: '#8b9bb4', body: '#e2e8f0', back: '#f8fafc', head: '#dbe3ef', outline: '#ffffff', eye: '#334155', pupil: '#0f172a', accent: '#c7d2fe' },
        accessory: 'halo',
        mission: 'nonstop-runner',
    },
    // ── kostum langka dari misi sulit ──
    {
        id: 'galaksi',
        name: 'Galaksi Nebula',
        tagline: 'Ungu-biru rimbunan bintang berkacamata — terkunci sampai misi “Sang Exportir” selesai.',
        colors: { leg: '#1e1b4b', body: '#4338ca', back: '#6d28d9', head: '#3730a3', outline: '#a5b4fc', eye: '#e0e7ff', pupil: '#1e1b4b', accent: '#f0abfc' },
        accessory: 'glasses',
        mission: 'export-marathon',
    },
    {
        id: 'naga',
        name: 'Naga Zaman Kuno',
        tagline: 'Hijau kulit naga bertanduk antena — terkunci sampai misi “Pemandu Veteran” selesai.',
        colors: { leg: '#14532d', body: '#16a34a', back: '#22c55e', head: '#15803d', outline: '#bbf7d0', eye: '#fef08a', pupil: '#14532d', accent: '#facc15' },
        accessory: 'antenna',
        mission: 'tour-veteran',
    },
    {
        id: 'alien',
        name: 'Alien Luar Angkasa',
        tagline: 'Hijau limau bermata satu besar — terkunci sampai misi “Auditor Ahli” selesai.',
        colors: { leg: '#365314', body: '#84cc16', back: '#a3e635', head: '#65a30d', outline: '#d9f99d', eye: '#ecfccb', pupil: '#1a2e05', accent: '#bef264' },
        accessory: 'halo',
        mission: 'check-master',
    },
    {
        id: 'perak',
        name: 'Perak Kemilau',
        tagline: 'Logam mengkilap bermahkota perak — terkunci sampai misi “Sang Pengetik” selesai.',
        colors: { leg: '#64748b', body: '#cbd5e1', back: '#e2e8f0', head: '#94a3b8', outline: '#f8fafc', eye: '#ffffff', pupil: '#1e293b', accent: '#94a3b8' },
        accessory: 'crown',
        mission: 'typist-master',
    },
    {
        id: 'matahari',
        name: 'Matahari Gerhana',
        tagline: 'Emas-kelam bersayap korona — terkunci sampai misi “Mesin Nonstop” selesai.',
        colors: { leg: '#451a03', body: '#b45309', back: '#f59e0b', head: '#92400e', outline: '#fde68a', eye: '#fffbeb', pupil: '#451a03', accent: '#fbbf24' },
        accessory: 'wings',
        mission: 'nonstop-master',
    },
    {
        id: 'spectrum',
        name: 'Spektrum Pelangi',
        tagline: 'Warna-warni pelangi berhalo — terkunci sampai misi tersulit “Centurion” (100 aksi) selesai.',
        colors: { leg: '#7c3aed', body: '#ec4899', back: '#f97316', head: '#8b5cf6', outline: '#fde047', eye: '#ffffff', pupil: '#4c1d95', accent: '#22d3ee' },
        accessory: 'halo',
        mission: 'centurion',
    },
];

export const DEFAULT_PET_SKIN_ID = 'baja';

/** Cari kostum berdasarkan id; id tak dikenal → kostum bawaan (tidak pernah melempar). */
export function petSkinById(id: unknown): PetSkin {
    const key = String(id ?? '').trim().toLowerCase();
    return PET_SKINS.find((s) => s.id === key) ?? PET_SKINS[0];
}

/**
 * Apakah kostum sudah boleh dipakai: kostum bawaan (tanpa misi) selalu boleh; kostum lain harus
 * misinya selesai. Tanpa ctx (mis. di uji terpisah) kostum dianggap boleh.
 */
export function skinAvailable(skin: PetSkin, ctx?: vscode.ExtensionContext): boolean {
    return !skin.mission || !ctx || missionRewards(ctx).has(skin.id);
}

/**
 * Kostum yang sedang dipakai menurut pengaturan `dateSkunder.spider.skin`.
 * Bila kostum yang tersimpan masih terkunci (misinya belum selesai), otomatis kembali ke bawaan.
 */
export function activePetSkin(ctx?: vscode.ExtensionContext): PetSkin {
    const skin = petSkinById(vscode.workspace.getConfiguration('dateSkunder').get<string>('spider.skin'));
    return skinAvailable(skin, ctx) ? skin : PET_SKINS[0];
}

/** Kostum siap dikirim ke webview: warna + potongan SVG aksesorinya. */
export interface PetSkinPayload extends PetSkin {
    accessorySvg: string;
}

export function petSkinPayload(skin: PetSkin): PetSkinPayload {
    return { ...skin, accessorySvg: ACCESSORY_SVG[skin.accessory] ?? '' };
}

/**
 * Payload siap-bagikan untuk Community Chat: label, id, warna, aksesori, dan patch kostum
 * (JSON dari `petSkinPayload`). Dipakai tombol “🎨 Bagikan Skin” dan tombol bagikan di view Pet Skin.
 */
export function petSkinSharePayload(skin: PetSkin): Record<string, unknown> {
    return {
        label: skin.name || skin.id,
        skinId: skin.id,
        accessory: skin.accessory,
        colors: skin.colors,
        data: JSON.stringify(petSkinPayload(skin)),
    };
}

/** Pesan konfigurasi laba-laba untuk panel analisis (saat halaman dimuat & saat kostum diganti). */
export function buildSpiderWebConfig(ctx?: vscode.ExtensionContext) {
    const c = vscode.workspace.getConfiguration('dateSkunder');
    return {
        type: 'spiderConfig' as const,
        enabled: c.get<boolean>('spider.enabled') ?? true,
        speak: c.get<boolean>('spider.voice') ?? false,
        allowActions: c.get<boolean>('spider.allowActions') ?? true,
        autoRun: c.get<boolean>('spider.autoRun') ?? true,
        walkSpeed: c.get<number>('spider.walkSpeed') ?? 1,
        nonstopSeconds: Math.min(3600, Math.max(30, Math.round(c.get<number>('spider.nonstopSeconds') ?? 90))),
        skin: petSkinPayload(activePetSkin(ctx)),
    };
}
