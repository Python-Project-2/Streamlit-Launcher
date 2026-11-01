import type { StoredAnalysis } from './analysisStore';
import type { SheetResult } from './analysis';

export type AgendaDimension = 'kpi' | 'quality' | 'stock' | 'stats' | 'tree' | 'viz' | 'needs';

/** Bidang persona yang cocok untuk satu dimensi (bentuknya sama dengan `Persona['focus']`). */
export type AgendaFocus = 'quality' | 'stock' | 'kpi' | 'tree' | 'viz' | 'stats' | 'build';

export interface AgendaItem {
    /** Kunci stabil: berkas + sheet + jenis butir. */
    key: string;
    dimension: AgendaDimension;
    focus: AgendaFocus;
    topic: string;
    /** Satu-dua kalimat berangka dari analisis (bahan pesan). */
    facts: string;
    /** Langkah lanjutan yang masuk akal. */
    action: string;
    /** Makin besar makin penting (dipakai untuk urutan di dalam dimensi). */
    weight: number;
}

const DIMENSION_LABEL: Record<AgendaDimension, string> = {
    kpi: 'KPI penjualan',
    quality: 'kualitas data',
    stock: 'stok & kebutuhan',
    stats: 'statistik',
    tree: 'model C4.5',
    viz: 'tren & visualisasi',
    needs: 'rencana pengadaan',
};

const DIMENSION_FOCUS: Record<AgendaDimension, AgendaFocus> = {
    kpi: 'kpi',
    quality: 'quality',
    stock: 'stock',
    stats: 'stats',
    tree: 'tree',
    viz: 'viz',
    needs: 'stock',
};

export const dimensionLabel = (dimension: AgendaDimension): string => DIMENSION_LABEL[dimension] || dimension;

const nf = (value: number | null | undefined, digits = 1): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) { return '-'; }
    return value.toLocaleString('id-ID', { maximumFractionDigits: digits });
};

const pct = (value: number, digits = 1): string => `${value.toFixed(digits)}%`;

/** Sheet terbesar pada satu berkas (tetap dipakai untuk konteks utama). */
export function mainSheet(entry: StoredAnalysis): SheetResult | undefined {
    return [...(entry.result.sheets || [])].sort((a, b) => b.totalRows - a.totalRows)[0];
}

/** Semua sheet, terbesar lebih dulu; dibatasi supaya prompt tidak membengkak. */
function sheetsOf(entry: StoredAnalysis, max = 4): SheetResult[] {
    return [...(entry.result.sheets || [])]
        .filter((sheet) => sheet && sheet.totalRows > 0)
        .sort((a, b) => b.totalRows - a.totalRows)
        .slice(0, max);
}

/**
 * Susun agenda lengkap satu berkas analisis.
 *
 * Butir dibuat per sheet dan per dimensi; kolom dibatasi (2 numerik, 2 kategori, 2 korelasi)
 * supaya daftar tetap ringkas tetapi semua dimensi terwakili.
 */
export function buildAgenda(entry: StoredAnalysis | undefined): AgendaItem[] {
    if (!entry) { return []; }
    const out: AgendaItem[] = [];
    const add = (
        sheet: SheetResult,
        kind: string,
        dimension: AgendaDimension,
        topic: string,
        facts: string,
        action: string,
        weight: number,
    ) => {
        const key = `${entry.id}|${sheet.name}|${kind}`;
        if (out.some((item) => item.key === key)) { return; }
        // Setiap butir wajib membawa angka nyata — bahan pesan tidak boleh tanpa pijakan data.
        if (!/\d/.test(facts)) { return; }
        out.push({ key, dimension, focus: DIMENSION_FOCUS[dimension], topic, facts: `${entry.fileName} · ${sheet.name}: ${facts}`, action, weight });
    };

    for (const sheet of sheetsOf(entry)) {
        const h = sheet.csvHealth;
        const cells = sheet.totalRows * sheet.headers.length || 1;
        const missingPct = (sheet.missingCells / cells) * 100;
        const quality = Math.round(h.qualityScore);

        /* ── kualitas data ───────────────────────────────────────────────── */
        add(
            sheet, 'quality', 'quality',
            'kualitas data',
            `skor kualitas ${quality}/100 (${h.qualityRating}), sel kosong ${pct(missingPct)}, baris duplikat ${nf(sheet.duplicates, 0)}, ${h.outlierColsCount} kolom dengan outlier.`,
            'bersihkan sel kosong dan duplikat sebelum angka ini dipakai untuk keputusan',
            55 + missingPct * 6 + Math.min(30, sheet.duplicates) + Math.max(0, 85 - quality),
        );
        const checks = (h.checklist || []).filter((c) => c.status !== 'pass').slice(0, 2);
        if (checks.length) {
            add(
                sheet, 'quality-check', 'quality',
                'temuan pemeriksaan data',
                checks.map((c) => `${c.item || c.category}: ${c.detail}`).join('; '),
                'perbaiki temuan ini dulu, lalu hitung ulang skor kualitas',
                42 + checks.length * 4,
            );
        }
        const rec = (h.cleaningRecommendations || [])[0];
        if (rec) {
            add(
                sheet, 'quality-fix', 'quality',
                'langkah pembersihan',
                rec,
                'jalankan langkah ini sebelum analisis berikutnya',
                30,
            );
        }

        /* ── statistik: sebaran, outlier, korelasi ───────────────────────── */
        const numeric = sheet.columns.filter((c) => c.num).slice(0, 2);
        for (const col of numeric) {
            const s = col.num!;
            const outlierPct = sheet.totalRows ? (s.outliers / sheet.totalRows) * 100 : 0;
            add(
                sheet, `num-${col.name}`, 'stats',
                `sebaran ${col.name}`,
                `kolom "${col.name}" rata-rata ${nf(s.mean)}, median ${nf(s.median)}, min ${nf(s.min)}, maks ${nf(s.max)}, ${nf(s.outliers, 0)} outlier (${pct(outlierPct)}), skew ${s.skew.toFixed(2)}.`,
                outlierPct >= 5 ? 'cek outlier itu data nyata atau salah input sebelum memakai rata-rata' : 'pakai median bila sebaran miring saat membandingkan periode',
                32 + Math.min(40, outlierPct * 2),
            );
        }
        for (const corr of (sheet.scatters || []).slice(0, 2)) {
            const strong = Math.abs(corr.r) >= 0.5;
            add(
                sheet, `corr-${corr.x}-${corr.y}`, 'stats',
                `korelasi ${corr.x} vs ${corr.y}`,
                `korelasi "${corr.x}" dengan "${corr.y}" r = ${corr.r.toFixed(2)} (${strong ? 'cukup kuat' : 'lemah'}).`,
                'korelasi bukan sebab-akibat; uji dengan kolom lain sebelum menyimpulkan',
                26 + Math.abs(corr.r) * 20,
            );
        }

        /* ── tren & komposisi (visualisasi) ──────────────────────────────── */
        const trend = (sheet.trends || [])[0];
        if (trend && trend.labels.length >= 2) {
            const first = trend.values[0];
            const last = trend.values[trend.values.length - 1];
            const change = first ? ((last - first) / Math.abs(first)) * 100 : null;
            add(
                sheet, `trend-${trend.num}`, 'viz',
                `tren ${trend.num}`,
                `tren "${trend.num}" per ${trend.gran} dari ${trend.labels[0]} (${nf(first)}) ke ${trend.labels[trend.labels.length - 1]} (${nf(last)})${change === null ? '' : `, perubahan ${change.toFixed(1)}%`}.`,
                change !== null && change < 0 ? 'telusuri periode yang turun sebelum menaikkan target' : 'jadikan arah tren ini pembanding periode berikutnya',
                34 + (change !== null ? Math.min(30, Math.abs(change)) : 0),
            );
        }
        const categories = sheet.columns.filter((c) => c.type === 'category' && c.top && c.top.length).slice(0, 2);
        for (const col of categories) {
            const top = col.top!.slice(0, 3);
            const share = top[0] && sheet.totalRows ? (top[0].count / sheet.totalRows) * 100 : null;
            add(
                sheet, `cat-${col.name}`, 'viz',
                `komposisi ${col.name}`,
                `kolom kategori "${col.name}" punya ${col.unique} nilai unik; teratas ${top.map((t) => `${t.value} (${nf(t.count, 0)})`).join(', ')}${share === null ? '' : `, ${share.toFixed(1)}% baris ada di nilai teratas`}.`,
                'bandingkan komposisi ini dengan periode sebelumnya untuk melihat pergeseran',
                24,
            );
        }
        const bar = (sheet.groupBars || [])[0];
        if (bar && bar.labels.length) {
            add(
                sheet, `bar-${bar.cat}-${bar.num}`, 'viz',
                `rata-rata ${bar.num} per ${bar.cat}`,
                `rata-rata "${bar.num}" per "${bar.cat}": ${bar.labels.slice(0, 3).map((label, i) => `${label} ${nf(bar.means[i])}`).join(', ')}.`,
                'pakai perbandingan ini untuk memilih kelompok yang perlu diprioritaskan',
                22,
            );
        }

        /* ── stok & kebutuhan ────────────────────────────────────────────── */
        const stock = sheet.stockAnalysis;
        if (stock?.detected) {
            add(
                sheet, 'stock', 'stock',
                'stok & restock',
                `${nf(stock.kpis.totalSKUs, 0)} SKU, ${stock.kpis.criticalCount} kritis, ${stock.kpis.lowCount} menipis, ${stock.kpis.overstockCount} overstock; nilai stok ${nf(stock.kpis.totalValuation)}.`,
                'kunci restock item kritis dulu, overstock belakangan',
                70 + stock.kpis.criticalCount * 8 + stock.kpis.lowCount * 2,
            );
            add(
                sheet, 'stock-abc', 'stock',
                'kelas ABC',
                `kelas A ${stock.abcSummary.classA.pctCount.toFixed(1)}% SKU memberi ${stock.abcSummary.classA.valPct.toFixed(1)}% nilai; kelas B ${stock.abcSummary.classB.pctCount.toFixed(1)}% SKU, kelas C ${stock.abcSummary.classC.pctCount.toFixed(1)}% SKU.`,
                'jaga ketersediaan kelas A, evaluasi kelas C untuk mengurangi modal tertahan',
                40,
            );
            const top = stock.topStock[0];
            if (top) {
                add(
                    sheet, 'stock-top', 'stock',
                    'barang paling menumpuk',
                    `stok terbesar "${top.label}" ${nf(top.value)} unit (item ${stock.itemCol}, qty ${stock.qtyCol}).`,
                    'cek umur stok item ini sebelum menambah pembelian',
                    30,
                );
            }
            const over = stock.items.filter((item) => item.status === 'overstock').sort((a, b) => b.totalValue - a.totalValue)[0];
            if (over) {
                add(
                    sheet, 'stock-over', 'stock',
                    'overstock bernilai besar',
                    `overstock terbesar "${over.name}" ${nf(over.quantity)} unit senilai ${nf(over.totalValue)}.`,
                    'kurangi pesanan berikutnya atau alihkan ke kanal lain',
                    36,
                );
            }
            const catVal = stock.categoryValuation[0];
            if (catVal) {
                add(
                    sheet, 'stock-cat', 'stock',
                    'nilai stok per kategori',
                    `kategori "${catVal.label}" menahan nilai stok terbesar ${nf(catVal.value)} dari ${nf(catVal.count, 0)} item.`,
                    'tinjau kategori ini lebih dulu saat mengatur modal kerja',
                    28,
                );
            }
        }
        const needs = sheet.needsAnalysis;
        if (needs) {
            add(
                sheet, 'needs', 'needs',
                'kebutuhan mendesak',
                `${needs.urgentItemCount} item urgent dan ${needs.highPriorityCount} prioritas tinggi; anggaran kebutuhan ${nf(needs.totalProcurementBudget)}.`,
                'setujui item urgent lebih dulu, sisanya bertahap',
                85 + needs.urgentItemCount * 3,
            );
            const buy = (needs.procurementItems || [])[0];
            if (buy) {
                add(
                    sheet, 'needs-top', 'needs',
                    'item yang perlu dibeli',
                    `"${buy.name}" stok ${nf(buy.currentStock)} unit, saran beli ${nf(buy.recommendedQty)} unit, biaya ${nf(buy.estimatedCost)} (${buy.priority}).`,
                    'cocokkan dengan lead time pemasok sebelum memesan',
                    50,
                );
            }
            const risk = (needs.riskWarnings || [])[0];
            if (risk) {
                add(sheet, 'needs-risk', 'needs', 'risiko pengadaan', risk, 'siapkan rencana cadangan untuk risiko ini', 44);
            }
            const plan = (needs.actionPlan || [])[0];
            if (plan) {
                add(sheet, 'needs-plan', 'needs', 'rencana tindakan', `${plan.title}: ${plan.description}`, 'jadwalkan langkah ini dengan penanggung jawab yang jelas', 38);
            }
        }

        /* ── KPI penjualan ───────────────────────────────────────────────── */
        const kpi = sheet.businessKpi;
        if (kpi) {
            const s = kpi.summary;
            add(
                sheet, 'kpi', 'kpi',
                'KPI penjualan',
                `pendapatan ${nf(s.totalRevenue)}, ${s.grossMarginPct === null ? 'margin -' : `margin ${s.grossMarginPct.toFixed(1)}%`}, ${nf(s.totalOrders, 0)} order, AOV ${nf(s.avgOrderValue)}, ${s.customers === null ? 'pelanggan -' : `${nf(s.customers, 0)} pelanggan`}.`,
                'jadikan angka ini pembanding periode berikutnya sebelum menaikkan target',
                60 + (s.grossMarginPct !== null && s.grossMarginPct < 20 ? 25 : 0),
            );
            if (s.grossMarginPct !== null) {
                add(
                    sheet, 'kpi-margin', 'kpi',
                    'margin',
                    `margin laba kotor ${s.grossMarginPct.toFixed(1)}%${s.grossProfit === null ? '' : ` (laba kotor ${nf(s.grossProfit)})`}, biaya ${s.totalCost === null ? '-' : nf(s.totalCost)}.`,
                    s.grossMarginPct < 20 ? 'periksa biaya per produk sebelum menaikkan volume' : 'pertahankan struktur biaya saat menambah volume',
                    58 + (s.grossMarginPct < 20 ? 30 - s.grossMarginPct : 0),
                );
            }
            if (s.discountRatePct !== null) {
                add(
                    sheet, 'kpi-discount', 'kpi',
                    'diskon',
                    `rasio diskon ${s.discountRatePct.toFixed(1)}%${s.totalDiscount === null ? '' : ` (total diskon ${nf(s.totalDiscount)})`}.`,
                    s.discountRatePct > 20 ? 'evaluasi diskon yang tidak menambah volume' : 'pertahankan diskon di bawah 10%',
                    30 + (s.discountRatePct > 20 ? 10 : 0),
                );
            }
            const growth = kpi.growth;
            if (growth.latestGrowthPct !== null) {
                const best = growth.best ? `, terbaik ${growth.best.period} ${growth.best.growthPct === null ? '-' : `${growth.best.growthPct.toFixed(1)}%`}` : '';
                const worst = growth.worst ? `, terlemah ${growth.worst.period} ${growth.worst.growthPct === null ? '-' : `${growth.worst.growthPct.toFixed(1)}%`}` : '';
                add(
                    sheet, 'kpi-growth', 'kpi',
                    'pertumbuhan',
                    `pertumbuhan periode terakhir ${growth.latestGrowthPct.toFixed(1)}%, rata-rata ${growth.avgGrowthPct === null ? '-' : `${growth.avgGrowthPct.toFixed(1)}%`}${best}${worst}.`,
                    growth.latestGrowthPct < 0 ? 'telusuri produk atau wilayah yang menurun sebelum menaikkan target' : 'cari sumber pertumbuhan ini supaya bisa diulang',
                    62 + Math.abs(growth.latestGrowthPct) * 1.5,
                );
            }
            const prod = kpi.topProducts[0];
            if (prod) {
                add(
                    sheet, 'kpi-product', 'kpi',
                    'produk teratas',
                    `produk teratas "${prod.label}" menyumbang ${prod.share.toFixed(1)}% pendapatan (${nf(prod.revenue)}).`,
                    'pastikan stok produk ini aman sebelum promosi berikutnya',
                    34,
                );
            }
            const cat = kpi.topCategories[0];
            if (cat) {
                add(
                    sheet, 'kpi-category', 'kpi',
                    'kategori teratas',
                    `kategori "${cat.label}" menyumbang ${cat.share.toFixed(1)}% pendapatan (${nf(cat.revenue)}).`,
                    'bandingkan kontribusi kategori ini dengan marginnya',
                    28,
                );
            }
            const region = kpi.topRegions[0];
            if (region) {
                add(
                    sheet, 'kpi-region', 'kpi',
                    'wilayah teratas',
                    `wilayah "${region.label}" menyumbang ${region.share.toFixed(1)}% pendapatan (${nf(region.revenue)}).`,
                    'cek apakah pertumbuhan wilayah ini merata di semua produk',
                    26,
                );
            }
            const cust = kpi.topCustomers[0];
            if (cust) {
                add(
                    sheet, 'kpi-customer', 'kpi',
                    'pelanggan teratas',
                    `pelanggan "${cust.label}" menyumbang ${cust.share.toFixed(1)}% pendapatan (${nf(cust.revenue)})${s.repeatCustomerRatePct === null ? '' : `; pelanggan berulang ${s.repeatCustomerRatePct.toFixed(1)}%`}.`,
                    'jaga pelanggan ini, tetapi kurangi ketergantungan pada satu pembeli',
                    32,
                );
            }
            if (kpi.concentration) {
                add(
                    sheet, 'kpi-concentration', 'kpi',
                    'konsentrasi pendapatan',
                    `${kpi.concentration.paretoItems} item menghasilkan ${kpi.concentration.paretoPct.toFixed(1)}% pendapatan (HHI ${kpi.concentration.hhi.toFixed(0)}).`,
                    kpi.concentration.hhi > 2500 ? 'kurangi konsentrasi dengan menumbuhkan item lain' : 'pertahankan sebaran pendapatan yang ada',
                    36,
                );
            }
            for (const insight of (kpi.insights || []).slice(0, 2)) {
                add(sheet, `kpi-insight-${insight.slice(0, 24)}`, 'kpi', 'temuan KPI', insight, 'uji temuan ini dengan angka periode berikutnya', 25);
            }
        }

        /* ── model C4.5 (satu dimensi, bukan seluruh obrolan) ────────────── */
        const tree = sheet.decisionTreeAnalysis;
        if (tree) {
            const m = tree.performanceMetrics;
            add(
                sheet, 'tree', 'tree',
                'model C4.5',
                `pohon C4.5 untuk target "${tree.targetAttribute}" akurasi ${(tree.accuracy * 100).toFixed(1)}%, F1 makro ${(m.macroF1 * 100).toFixed(1)}%, kappa ${m.kappa.toFixed(3)}.`,
                tree.accuracy < 0.85 ? 'uji ulang dengan pembagian data berbeda sebelum dipakai memutuskan' : 'catat batas model ini: akurasi bukan jaminan untuk data baru',
                45 + Math.max(0, 0.85 - tree.accuracy) * 60,
            );
            const feature = [...(tree.featureImportance || [])].sort((a, b) => b.importance - a.importance)[0];
            if (feature) {
                add(
                    sheet, 'tree-feature', 'tree',
                    'fitur paling berpengaruh',
                    `fitur "${feature.feature}" paling menentukan (importance ${feature.importance.toFixed(3)}).`,
                    'pastikan fitur ini tersedia dan konsisten saat model dipakai',
                    30,
                );
            }
            const rule = tree.rules?.[0];
            if (rule) {
                add(
                    sheet, 'tree-rule', 'tree',
                    'aturan pohon',
                    `contoh aturan C4.5 → ${String(rule).slice(0, 180)}`,
                    'cek aturan ini masuk akal secara bisnis sebelum dipakai',
                    24,
                );
            }
            const errors = (tree.confusionMatrix || []).reduce((sum, row, i) => {
                return sum + row.reduce((acc, value, j) => acc + (i === j ? 0 : value), 0);
            }, 0);
            if (tree.testSize > 0) {
                add(
                    sheet, 'tree-errors', 'tree',
                    'kesalahan model',
                    `dari ${nf(tree.testSize, 0)} data uji, ${nf(errors, 0)} prediksi meleset; kelas terbanyak ${tree.confusionLabels?.[0] || '-'}.`,
                    'periksa kelas yang paling sering salah, jangan hanya melihat akurasi total',
                    34,
                );
            }
        }

        /* ── dasar: ukuran data ──────────────────────────────────────────── */
        add(
            sheet, 'size', 'quality',
            'ukuran data',
            `${nf(sheet.totalRows, 0)} baris × ${sheet.headers.length} kolom, skor kualitas ${quality}/100.`,
            'lanjut ke angka bisnis (pendapatan, margin, stok) untuk keputusan berikutnya',
            5,
        );
    }

    return out;
}

/** Angka di teks, dinormalisasi ke nilai numerik (format Indonesia & internasional). */
export function numbersInText(text: string): number[] {
    const raw = String(text || '').match(/\d+(?:[.,]\d+)*/g) || [];
    const out: number[] = [];
    for (const token of raw) {
        const value = parseNumberToken(token);
        if (value !== null) { out.push(value); }
    }
    return out;
}

/** Ubah satu token angka menjadi nilai; mendukung `1.234.000`, `1,5`, `12,5%`. */
export function parseNumberToken(raw: string): number | null {
    let s = String(raw || '').trim().replace(/%$/, '');
    if (!s) { return null; }
    // Ribuan bergaya Indonesia: 1.234.567 / 1.234,5
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) { s = s.replace(/\./g, '').replace(',', '.'); }
    // Ribuan bergaya Inggris: 1,234,567 / 1,234.5
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) { s = s.replace(/,/g, ''); }
    else { s = s.replace(',', '.'); }
    const value = Number(s);
    return Number.isFinite(value) ? value : null;
}

const same = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(0.0001, Math.abs(b) * 0.0001);

/** Kumpulkan angka dari struktur analisis (tanpa baris mentah / titik scatter). */
function collectNumbers(value: unknown, set: Set<number>, depth = 0): void {
    if (depth > 7 || value === null || value === undefined) { return; }
    if (typeof value === 'number') {
        if (Number.isFinite(value)) { set.add(Math.round(value * 10000) / 10000); }
        return;
    }
    if (typeof value === 'string') {
        for (const number of numbersInText(value)) { set.add(number); }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value.slice(0, 400)) { collectNumbers(item, set, depth + 1); }
        return;
    }
    if (typeof value === 'object') {
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            // Baris mentah dan titik grafik tidak perlu (besar & bukan angka ringkasan).
            if (key === 'rows' || key === 'points') { continue; }
            collectNumbers(item, set, depth + 1);
        }
    }
}

/** Angka yang boleh muncul di pesan: seluruh angka dari agenda + ringkasan analisis. */
export function allowedNumbers(entry: StoredAnalysis | undefined): Set<number> {
    const set = new Set<number>();
    if (!entry) { return set; }
    for (const item of buildAgenda(entry)) {
        for (const value of numbersInText(item.facts)) { set.add(value); }
    }
    for (const value of numbersInText(`${entry.fileName} ${(entry.sheetNames || []).join(' ')}`)) { set.add(value); }
    for (const sheet of entry.result.sheets || []) {
        collectNumbers(sheet.columns, set);
        collectNumbers(sheet.csvHealth, set);
        collectNumbers(sheet.stockAnalysis, set);
        collectNumbers(sheet.needsAnalysis, set);
        collectNumbers(sheet.businessKpi, set);
        collectNumbers(sheet.decisionTreeAnalysis, set);
        collectNumbers(sheet.trends, set);
        collectNumbers(sheet.groupBars, set);
        collectNumbers(sheet.crosstab, set);
        collectNumbers(sheet.insights, set);
        for (const scatter of sheet.scatters || []) {
            collectNumbers(scatter.x, set);
            collectNumbers(scatter.y, set);
            collectNumbers(scatter.r, set);
        }
    }
    return set;
}

/**
 * Angka pada `text` yang TIDAK ada di `allowed` (indikasi halusinasi).
 *
 * Yang dianggap angka data: nilai ≥ 11 atau bilangan desimal/persen. Angka kecil (0–10) dan tahun
 * dilewati karena biasanya bagian kalimat (“3 langkah”, “tahun 2026”). Pembulatan wajar
 * (“1,23 juta” untuk 1.234.000) tetap diterima.
 */
export function foreignNumbers(text: string, allowed: Set<number>, extra: string[] = []): string[] {
    const permitted = new Set<number>(allowed);
    for (const source of extra) {
        for (const value of numbersInText(source)) { permitted.add(value); }
    }
    const out: string[] = [];
    const tokens = String(text || '').match(/\d+(?:[.,]\d+)*/g) || [];
    for (const token of tokens) {
        const value = parseNumberToken(token);
        if (value === null) { continue; }
        const isInteger = Number.isInteger(value);
        if (isInteger && value <= 10) { continue; }
        if (isInteger && value >= 1900 && value <= 2100) { continue; }
        if (matchesAllowed(value, permitted, significantDigits(token) <= 3 ? 0.01 : 0.001)) { continue; }
        if (!out.includes(token)) { out.push(token); }
    }
    return out;
}

/** Jumlah digit signifikan (untuk menentukan toleransi pembulatan). */
function significantDigits(token: string): number {
    const digits = String(token || '').replace(/[^\d]/g, '').replace(/^0+/, '').replace(/0+$/, '');
    return digits.length || 1;
}

function matchesAllowed(value: number, allowed: Set<number>, relative = 0.001): boolean {
    for (const known of allowed) {
        if (same(value, known)) { return true; }
        // Pembulatan skala: 1,23 juta ≈ 1.234.000; 12,3 ≈ 12,34.
        for (const scale of [1e3, 1e6, 1e9]) {
            if (Math.abs(value * scale - known) <= Math.abs(known) * relative) { return true; }
        }
        if (Math.abs(value - known) <= Math.abs(known) * relative) { return true; }
    }
    // Persentase turunan wajar dari dua angka data (mis. 3 dari 40 = 7,5%).
    if (value > 0 && value < 100 && allowed.size <= 400) {
        const values = [...allowed].filter((n) => n > 0 && n < 1e9).slice(0, 400);
        for (let i = 0; i < values.length; i += 1) {
            for (let j = 0; j < values.length; j += 1) {
                if (i === j) { continue; }
                const ratio = (values[i] / values[j]) * 100;
                if (Math.abs(ratio - value) <= 1) { return true; }
            }
        }
    }
    return false;
}

/**
 * Konteks ringkas untuk prompt: SATU butir per dimensi (semua dimensi ikut), lalu butir
 * tambahan terpenting. Dipakai jawaban & Diskusi AI supaya KPI, kualitas, stok, statistik,
 * dan C4.5 semuanya terlihat — bukan hanya satu sudut.
 */
export function agendaContext(entry: StoredAnalysis | undefined, perDimension = 2, extra = 3): string {
    if (!entry) { return ''; }
    const items = buildAgenda(entry);
    const sections: string[] = [];
    for (const dimension of Object.keys(DIMENSION_LABEL) as AgendaDimension[]) {
        const rows = items
            .filter((item) => item.dimension === dimension)
            .sort((a, b) => b.weight - a.weight)
            .slice(0, perDimension);
        if (!rows.length) { continue; }
        sections.push(`[${DIMENSION_LABEL[dimension]}]`);
        for (const item of rows) { sections.push(`- ${item.facts}`); }
    }
    const used = new Set(sections);
    const rest = items
        .filter((item) => !sections.some((line) => line.includes(item.facts)))
        .sort((a, b) => b.weight - a.weight)
        .slice(0, extra);
    if (rest.length) {
        sections.push('[lainnya]');
        for (const item of rest) {
            const line = `- ${item.facts}`;
            if (!used.has(line)) { sections.push(line); }
        }
    }
    return sections.join('\n');
}

/**
 * Pemilih butir yang adil: dimensi paling sedikit dibahas didahulukan.
 *
 * Satu putaran penuh membahas setiap dimensi (KPI, kualitas, stok, statistik, C4.5, tren) sebelum
 * ada dimensi yang dibahas dua kali, sehingga model C4.5 tidak mendominasi obrolan. Setelah semua
 * butir terpakai, putaran baru dimulai tanpa mengulang 6 butir terakhir.
 */
export class AgendaPlan {
    private items: AgendaItem[] = [];
    private used = new Map<string, number>();
    private dimensionUse = new Map<AgendaDimension, number>();
    private roundCovered = new Set<AgendaDimension>();
    private lastDimension?: AgendaDimension;
    private turn = 0;
    private rounds = 0;

    /** Ganti daftar butir (mis. berkas lain); riwayat pakai yang masih relevan dipertahankan. */
    setItems(items: AgendaItem[]): void {
        this.items = items.slice();
        const keys = new Set(items.map((item) => item.key));
        for (const key of [...this.used.keys()]) {
            if (!keys.has(key)) { this.used.delete(key); }
        }
    }

    get size(): number { return this.items.length; }
    get round(): number { return this.rounds; }

    /** Dimensi yang sudah pernah dibahas pada putaran ini (kecuali fokus yang sedang ditulis). */
    covered(): AgendaDimension[] {
        return [...this.roundCovered].filter((dimension) => dimension !== this.lastDimension);
    }

    /** Butir berikutnya (langsung ditandai terpakai). */
    next(): AgendaItem | undefined {
        if (!this.items.length) { return undefined; }
        let pool = this.items.filter((item) => !this.used.has(item.key));
        if (!pool.length) {
            // Putaran baru: sisakan 12 butir terakhir supaya tidak langsung mengulang.
            const recent = [...this.used.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key]) => key);
            const keep = new Set(recent);
            this.used.clear();
            this.roundCovered.clear();
            let time = 0;
            for (const key of recent) { this.used.set(key, time++); }
            this.rounds += 1;
            pool = this.items.filter((item) => !keep.has(item.key));
            if (!pool.length) { pool = this.items.slice(); }
        }
        const dimensions = [...new Set(pool.map((item) => item.dimension))];
        let chosen: AgendaDimension = dimensions[0];
        let lowest = Number.POSITIVE_INFINITY;
        for (const dimension of dimensions) {
            const count = this.dimensionUse.get(dimension) ?? 0;
            if (count < lowest) { lowest = count; chosen = dimension; }
        }
        const candidates = pool.filter((item) => item.dimension === chosen);
        const item = candidates.slice().sort((a, b) => b.weight - a.weight)[0];
        this.used.set(item.key, this.turn++);
        this.dimensionUse.set(item.dimension, (this.dimensionUse.get(item.dimension) ?? 0) + 1);
        this.roundCovered.add(item.dimension);
        this.lastDimension = item.dimension;
        return item;
    }

    reset(): void {
        this.used.clear();
        this.dimensionUse.clear();
        this.roundCovered.clear();
        this.lastDimension = undefined;
        this.turn = 0;
        this.rounds = 0;
    }
}
