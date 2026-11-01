import * as vscode from 'vscode';

export type MissionId =
    | 'first-export' | 'first-jurnal' | 'first-workflow' | 'navigator' | 'typist'
    | 'first-json' | 'first-pptx' | 'export-all'
    | 'tour-master' | 'checker' | 'nonstop-runner' | 'marathon'
    | 'export-marathon' | 'tour-veteran' | 'check-master' | 'typist-master'
    | 'nonstop-master' | 'centurion';

export interface PetMission {
    id: MissionId;
    name: string;
    detail: string;
    target: number;
    /** id kostum yang terbuka saat misi ini selesai (lihat PET_SKINS di src/petSkins.ts). */
    rewardSkin: string;
}
export const PET_MISSIONS: PetMission[] = [
    { id: 'first-export', name: 'Eksportir Pertama', detail: 'Klik satu tombol export di halaman (mis. minta “export excel”).', target: 1, rewardSkin: 'samurai' },
    { id: 'first-jurnal', name: 'Penulis Jurnal', detail: 'Jalankan export jurnal (DOCX atau PDF) sekali.', target: 1, rewardSkin: 'merah' },
    { id: 'first-workflow', name: 'Pembuat Alur', detail: 'Jalankan export flow (gambar workflow) sekali.', target: 1, rewardSkin: 'zamrud' },
    { id: 'navigator', name: 'Penjelajah Tab', detail: 'Pindahkan tab/filter stok 3 kali lewat pet.', target: 3, rewardSkin: 'senja' },
    { id: 'typist', name: 'Juru Ketik', detail: 'Suruh pet mengetik/mengisi kolom 5 kali (mis. “cari indomie”).', target: 5, rewardSkin: 'ungu' },
    { id: 'first-json', name: 'Penjaga Data', detail: 'Jalankan export JSON sekali.', target: 1, rewardSkin: 'es' },
    { id: 'first-pptx', name: 'Presenter', detail: 'Jalankan export PPT sekali.', target: 1, rewardSkin: 'emas' },
    { id: 'export-all', name: 'Sekali Klik Semua', detail: 'Minta “export semua sekaligus” sampai 3 tombol export berhasil diklik dalam satu perintah.', target: 3, rewardSkin: 'lava' },
    { id: 'tour-master', name: 'Penjelajah Halaman', detail: 'Jalankan “▶ Jalankan semua fitur” sampai selesai.', target: 1, rewardSkin: 'robot' },
    { id: 'checker', name: 'Tukang Cek', detail: 'Jalankan “✓ Cek semua kontrol” satu kali.', target: 1, rewardSkin: 'peri' },
    { id: 'nonstop-runner', name: 'Pekerja Nonstop', detail: 'Selesaikan 5 putaran kerja nonstop.', target: 5, rewardSkin: 'hantu' },
    { id: 'marathon', name: 'Maraton Halaman', detail: 'Selesaikan total 25 aksi berhasil di halaman (akumulatif).', target: 25, rewardSkin: 'ninja' },
    // ── misi sulit (kostum reward langka) ──
    { id: 'export-marathon', name: 'Sang Exportir', detail: 'MISI SULIT: jalankan 15 export berhasil (semua jenis dihitung, akumulatif).', target: 15, rewardSkin: 'galaksi' },
    { id: 'tour-veteran', name: 'Pemandu Veteran', detail: 'MISI SULIT: selesaikan tur “Jalankan semua fitur” 5 kali.', target: 5, rewardSkin: 'naga' },
    { id: 'check-master', name: 'Auditor Ahli', detail: 'MISI SULIT: jalankan “✓ Cek semua kontrol” 5 kali.', target: 5, rewardSkin: 'alien' },
    { id: 'typist-master', name: 'Sang Pengetik', detail: 'MISI SULIT: suruh pet mengisi kolom 20 kali (akumulatif).', target: 20, rewardSkin: 'perak' },
    { id: 'nonstop-master', name: 'Mesin Nonstop', detail: 'MISI SULIT: selesaikan 20 putaran kerja nonstop.', target: 20, rewardSkin: 'matahari' },
    { id: 'centurion', name: 'Centurion', detail: 'MISI TERSULIT: selesaikan total 100 aksi berhasil di halaman (akumulatif).', target: 100, rewardSkin: 'spectrum' },
];

export function missionById(id: string): PetMission | undefined {
    return PET_MISSIONS.find((m) => m.id === id);
}

type Progress = Partial<Record<MissionId, number>>;

const KEY = 'dateSkunder.petMissions';

function read(ctx: vscode.ExtensionContext): Progress {
    return ctx.globalState.get<Progress>(KEY) ?? {};
}

export interface MissionState extends PetMission {
    value: number;
    done: boolean;
}

/** Keadaan misi untuk ditampilkan di view Pet Skin. */
export function missionStates(ctx: vscode.ExtensionContext): MissionState[] {
    const p = read(ctx);
    return PET_MISSIONS.map((m) => {
        const value = Math.min(m.target, Math.max(0, Math.floor(p[m.id] ?? 0)));
        return { ...m, value, done: value >= m.target };
    });
}

/** Id kostum yang sudah terbuka karena misinya selesai. */
export function missionRewards(ctx: vscode.ExtensionContext): Set<string> {
    return new Set(missionStates(ctx).filter((m) => m.done).map((m) => m.rewardSkin));
}

/**
 * Tambah progres misi. Mengembalikan id misi yang BARU selesai (dipakai untuk notifikasi).
 * Progres tidak pernah melewati target dan tidak pernah turun.
 */
export async function addMissionProgress(ctx: vscode.ExtensionContext, deltas: Partial<Record<MissionId, number>>): Promise<MissionId[]> {
    const now = { ...read(ctx) };
    const selesai: MissionId[] = [];
    let berubah = false;
    for (const m of PET_MISSIONS) {
        const tambah = Math.max(0, Math.floor(deltas[m.id] ?? 0));
        if (!tambah) { continue; }
        const lama = Math.max(0, Math.floor(now[m.id] ?? 0));
        if (lama >= m.target) { continue; }
        const baru = Math.min(m.target, lama + tambah);
        now[m.id] = baru;
        berubah = true;
        if (baru >= m.target) { selesai.push(m.id); }
    }
    if (berubah) { await ctx.globalState.update(KEY, now); }
    return selesai;
}
