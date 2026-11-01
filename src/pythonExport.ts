import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeWorkbook, SheetResult, WorkbookResult } from './analysis';
import { treeOptionsFromSettings } from './treeConfig';
import { globalAnalysisStore } from './analysisStore';

export type CellValue = string | number | boolean | null;

/** Batas ukuran stats.json; di atas ini kolom `rows` dipangkas agar berkas tidak meledak. */
const MAX_JSON_CHARS = 40_000_000;

/** Nama berkas aman dari nama sheet (huruf kecil, tanpa karakter terlarang). */
export function fileSlug(name: string): string {
    const clean = String(name || 'sheet')
        .toLowerCase()
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return clean || 'sheet';
}

/** Satu sel CSV: kutip bila mengandung pemisah, kutip, atau baris baru. */
export function csvCell(value: CellValue): string {
    if (value === null || value === undefined) { return ''; }
    const text = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Seluruh baris sheet → teks CSV (header + isi). */
export function sheetToCsv(sheet: SheetResult): string {
    const lines: string[] = [sheet.headers.map((h) => csvCell(h)).join(',')];
    for (const row of sheet.rows) {
        lines.push(row.map((v) => csvCell(v as CellValue)).join(','));
    }
    return lines.join('\r\n') + '\r\n';
}

/** Tulis berkas; bila terkunci (mis. sedang dibuka), simpan dengan akhiran waktu. */
async function safeWrite(uri: vscode.Uri, data: Uint8Array): Promise<vscode.Uri> {
    try {
        await vscode.workspace.fs.writeFile(uri, data);
        return uri;
    } catch {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const alt = uri.with({ path: uri.path.replace(/(\.[^./]+)$/, `-${stamp}$1`) });
        await vscode.workspace.fs.writeFile(alt, data);
        return alt;
    }
}

function enc(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

// ── templat skrip Python (stdlib saja) ──────────────────────────────────────

export const ANALYSIS_PY = String.raw`#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Laporan analisis Date Skunder — dibuat otomatis oleh ekstensi "Streamlit Launcher".

Paket ini berisi seluruh data yang dianalisis:
  data/          : data tiap sheet (CSV) + index.json
  stats.json     : hasil analisis lengkap (KPI bisnis, stok, kebutuhan, kualitas CSV, decision tree)
  laporan.txt    : hasil skrip ini

Jalankan:
  python analysis.py              # ringkasan + laporan.txt (+ grafik bila matplotlib terpasang)
  python analysis.py --no-chart   # tanpa grafik
  python analysis.py --sheet NAMA # hanya satu sheet (mis. --sheet Sheet1)

Skrip ini HANYA memakai pustaka bawaan Python. Grafik dan dashboard tambahan bersifat opsional
(isi requirements.txt lalu: pip install -r requirements.txt).
"""

import collections
import csv
import json
import os
import statistics
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATS_FILE = os.path.join(BASE_DIR, "stats.json")
REPORT_FILE = os.path.join(BASE_DIR, "laporan.txt")
CHART_DIR = os.path.join(BASE_DIR, "grafik")

KOSONG = {"", "na", "n/a", "nan", "null", "none", "-"}


def baca_index():
    path = os.path.join(DATA_DIR, "index.json")
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as berkas:
        return json.load(berkas)


def baca_csv(nama_berkas):
    path = os.path.join(DATA_DIR, nama_berkas)
    with open(path, "r", encoding="utf-8-sig", newline="") as berkas:
        baris = [r for r in csv.reader(berkas) if any((sel or "").strip() for sel in r)]
    if not baris:
        return [], []
    return baris[0], baris[1:]


def sebagai_angka(teks):
    if teks is None:
        return None
    t = str(teks).strip()
    if t.lower() in KOSONG:
        return None
    t2 = t.replace(" ", "")
    if "," in t2 and "." in t2:
        t2 = t2.replace(",", "")
    elif "," in t2:
        t2 = t2.replace(",", ".")
    try:
        return float(t2)
    except ValueError:
        return None


def terisi(teks):
    return str(teks if teks is not None else "").strip().lower() not in KOSONG


def statistik_kolom(kolom):
    """Ringkasan satu kolom: kelengkapan, keunikan, dan statistik numerik bila seluruh isinya angka."""
    nilai = [v for v in kolom if terisi(v)]
    kosong = len(kolom) - len(nilai)
    angka = [sebagai_angka(v) for v in nilai]
    angka = [a for a in angka if a is not None]
    hasil = {"terisi": len(nilai), "kosong": kosong, "unik": len(set(str(v) for v in nilai))}
    if nilai and len(angka) == len(nilai):
        hasil["numerik"] = True
        hasil["min"] = min(angka)
        hasil["max"] = max(angka)
        hasil["mean"] = sum(angka) / len(angka)
        hasil["median"] = statistics.median(angka)
        hasil["std"] = statistics.pstdev(angka) if len(angka) > 1 else 0.0
        hasil["sum"] = sum(angka)
    else:
        hasil["numerik"] = False
    return hasil


def teratas(kolom, jumlah=5):
    hitung = collections.Counter(str(v).strip() for v in kolom if terisi(v))
    return hitung.most_common(jumlah)


def fmt(angka, digit=2):
    if angka is None:
        return "-"
    if isinstance(angka, str):
        return angka
    try:
        teks = format(float(angka), ",." + str(digit) + "f")
    except (TypeError, ValueError):
        return str(angka)
    return teks.replace(",", "_").replace(".", ",").replace("_", ".")


def persen(angka, digit=2):
    if angka is None:
        return "-"
    return fmt(angka, digit) + "%"


def potong(teks, batas):
    teks = str(teks if teks is not None else "")
    return teks if len(teks) <= batas else teks[: batas - 1] + "…"


# ── bagian laporan dari stats.json ──────────────────────────────────────────

def bagian_kpi(kpi, baris):
    if not kpi:
        return
    s = kpi.get("summary") or {}
    baris.append("")
    baris.append("[KPI BISNIS]")
    baris.append("  Pendapatan " + fmt(s.get("totalRevenue")) + " dari " + fmt(s.get("totalOrders"), 0) + " order"
                 + " (AOV " + fmt(s.get("avgOrderValue")) + ")")
    baris.append("  Biaya " + fmt(s.get("totalCost")) + " · laba kotor " + fmt(s.get("grossProfit"))
                 + " · margin " + persen(s.get("grossMarginPct")))
    baris.append("  Unit terjual " + fmt(s.get("totalUnits")) + " · item/order " + fmt(s.get("itemsPerOrder"))
                 + " · diskon " + fmt(s.get("totalDiscount")) + " (" + persen(s.get("discountRatePct")) + " dari nilai kotor)")
    baris.append("  Pelanggan " + fmt(s.get("customers"), 0) + " · pendapatan/pelanggan " + fmt(s.get("revenuePerCustomer"))
                 + " · pelanggan berulang " + persen(s.get("repeatCustomerRatePct"))
                 + " · retensi " + persen(s.get("avgRetentionPct"))
                 + " · kontribusi 10% pelanggan teratas " + persen(s.get("top10PctCustomerSharePct")))
    tumbuh = kpi.get("growth") or {}
    baris.append("  Pertumbuhan: periode terakhir " + persen(tumbuh.get("latestGrowthPct"))
                 + " · rata-rata " + persen(tumbuh.get("avgGrowthPct"))
                 + " · terbaik " + str((tumbuh.get("best") or {}).get("period", "-"))
                 + " · terlemah " + str((tumbuh.get("worst") or {}).get("period", "-")))
    konsentrasi = kpi.get("concentration")
    if konsentrasi:
        baris.append("  Konsentrasi: " + fmt(konsentrasi.get("paretoItems"), 0) + " " + str(konsentrasi.get("basis", "item"))
                     + " (" + persen(konsentrasi.get("paretoPct")) + ") menghasilkan 80% pendapatan · HHI "
                     + fmt(konsentrasi.get("hhi"), 0))
    for judul, kunci, satuan in (("Produk teratas", "topProducts", "revenue"),
                                 ("Kategori teratas", "topCategories", "revenue"),
                                 ("Wilayah teratas", "topRegions", "revenue"),
                                 ("Pelanggan teratas", "topCustomers", "revenue")):
        daftar = kpi.get(kunci) or []
        if daftar:
            isi = "; ".join((str(x.get("label")) + " " + fmt(x.get(satuan))) for x in daftar[:5])
            baris.append("  " + judul + ": " + isi)
    periode = tumbuh.get("periods") or []
    if periode:
        isi = " | ".join((str(p.get("period")) + " " + fmt(p.get("revenue"))) for p in periode[:24])
        baris.append("  Tren per periode: " + isi)


def bagian_stok(stok, baris):
    if not stok:
        return
    k = stok.get("kpis") or {}
    baris.append("")
    baris.append("[STOK / INVENTARIS]")
    baris.append("  " + fmt(k.get("totalSKUs"), 0) + " SKU · volume " + fmt(k.get("totalStockVolume"))
                 + " · valuasi " + fmt(k.get("totalValuation"))
                 + " · " + fmt(k.get("criticalCount"), 0) + " kritis, "
                 + fmt(k.get("lowCount"), 0) + " menipis, "
                 + fmt(k.get("healthyCount"), 0) + " aman, "
                 + fmt(k.get("overstockCount"), 0) + " overstock")
    abc = stok.get("abcSummary")
    if abc:
        baris.append("  Kelas ABC: A " + fmt((abc.get("classA") or {}).get("count"), 0)
                     + " SKU (" + persen((abc.get("classA") or {}).get("valPct"), 1) + " nilai), B "
                     + fmt((abc.get("classB") or {}).get("count"), 0) + " ("
                     + persen((abc.get("classB") or {}).get("valPct"), 1) + "), C "
                     + fmt((abc.get("classC") or {}).get("count"), 0) + " ("
                     + persen((abc.get("classC") or {}).get("valPct"), 1) + ")")
    for judul, kunci in (("Stok terbanyak", "topStock"), ("Stok paling sedikit", "bottomStock")):
        daftar = stok.get(kunci) or []
        if daftar:
            baris.append("  " + judul + ": " + "; ".join((str(x.get("label")) + " " + fmt(x.get("value"))) for x in daftar[:5]))


def bagian_kebutuhan(butuh, baris):
    if not butuh:
        return
    baris.append("")
    baris.append("[KEBUTUHAN PENGADAAN]")
    baris.append("  Anggaran " + fmt(butuh.get("totalProcurementBudget"))
                 + " · " + fmt(butuh.get("urgentItemCount"), 0) + " item mendesak, "
                 + fmt(butuh.get("highPriorityCount"), 0) + " prioritas tinggi")
    for item in (butuh.get("procurementItems") or [])[:10]:
        baris.append("   - " + str(item.get("name")) + " qty " + fmt(item.get("recommendedQty"))
                     + " (" + str(item.get("priority")) + ", " + fmt(item.get("estimatedCost")) + ")")
    for peringatan in (butuh.get("riskWarnings") or [])[:5]:
        baris.append("   ! " + str(peringatan))


def bagian_kualitas_csv(kualitas, baris):
    if not kualitas:
        return
    baris.append("")
    baris.append("[KUALITAS & PROFIL CSV]")
    baris.append("  Skor " + fmt(kualitas.get("qualityScore"), 0) + "/100 (" + str(kualitas.get("qualityRating")) + ")"
                 + " · kelengkapan " + persen(kualitas.get("completenessScore"))
                 + " · integritas " + persen(kualitas.get("integrityScore"))
                 + " · konsistensi " + persen(kualitas.get("consistencyScore")))
    for cek in (kualitas.get("checklist") or [])[:6]:
        baris.append("   [" + str(cek.get("status")) + "] " + str(cek.get("item")) + ": " + str(cek.get("detail")))
    for saran in (kualitas.get("cleaningRecommendations") or [])[:4]:
        baris.append("   * " + str(saran))


def bagian_pohon_keputusan(pohon, baris):
    if not pohon:
        return
    metrik = pohon.get("performanceMetrics") or {}
    baris.append("")
    baris.append("[DECISION TREE C4.5]")
    baris.append("  Target \"" + str(pohon.get("targetAttribute")) + "\" · akurasi "
                 + persen(100 * float(pohon.get("accuracy") or 0), 1)
                 + " · precision " + persen(100 * float(metrik.get("precision") or 0), 1)
                 + " · recall " + persen(100 * float(metrik.get("recall") or 0), 1)
                 + " · F1 " + persen(100 * float(metrik.get("f1Score") or 0), 1))
    atribut = pohon.get("featureImportance") or []
    if atribut:
        baris.append("  Atribut terpenting: " + "; ".join(
            (str(x.get("feature")) + " " + persen(100 * float(x.get("importance") or 0), 1)) for x in atribut[:5]))
    aturan = pohon.get("rules") or []
    if aturan:
        baris.append("  Aturan (maks. 8):")
        for r in aturan[:8]:
            baris.append("   - " + str(r))


# ── grafik opsional (matplotlib) ────────────────────────────────────────────

def buat_grafik(index, stats):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("Catatan: matplotlib belum terpasang, grafik dilewati (pip install matplotlib).")
        return
    os.makedirs(CHART_DIR, exist_ok=True)
    for entri in index:
        nama_sheet = str(entri.get("sheet") or entri.get("file"))
        slug = str(entri.get("slug") or "sheet")
        header, isi = baca_csv(entri["file"])
        if not header:
            continue
        kolom = [[baris[no] if no < len(baris) else "" for baris in isi] for no in range(len(header))]
        stat = [statistik_kolom(k) for k in kolom]

        # 1) sel kosong per kolom
        try:
            label = [potong(h, 26) for h in header]
            kosong = [100.0 * s["kosong"] / max(1, s["terisi"] + s["kosong"]) for s in stat]
            tinggi = max(3.0, 0.32 * len(header) + 1.2)
            gambar, poros = plt.subplots(figsize=(8.5, tinggi))
            poros.barh(label, kosong, color="#e15759")
            poros.set_xlabel("Sel kosong (%)")
            poros.set_title("Kelengkapan kolom — " + nama_sheet)
            poros.invert_yaxis()
            gambar.tight_layout()
            gambar.savefig(os.path.join(CHART_DIR, "kelengkapan_" + slug + ".png"), dpi=130)
            plt.close(gambar)
        except Exception as galat:
            print("  (grafik kelengkapan " + nama_sheet + " gagal: " + str(galat) + ")")

        # 2) histogram kolom numerik (maks. 3) dan 3) nilai teratas kolom kategorikal (maks. 2)
        numerik = [no for no, s in enumerate(stat) if s["numerik"]]
        for no in numerik[:3]:
            try:
                nilai = [sebagai_angka(v) for v in kolom[no]]
                nilai = [x for x in nilai if x is not None]
                gambar, poros = plt.subplots(figsize=(8, 3.6))
                poros.hist(nilai, bins=min(30, max(5, int(len(nilai) ** 0.5) + 1)), color="#4e79a7")
                poros.set_title("Distribusi " + str(header[no]) + " — " + nama_sheet)
                poros.set_xlabel(str(header[no]))
                poros.set_ylabel("Frekuensi")
                gambar.tight_layout()
                gambar.savefig(os.path.join(CHART_DIR, "histogram_" + slug + "_" + str(no + 1) + ".png"), dpi=130)
                plt.close(gambar)
            except Exception as galat:
                print("  (histogram " + str(header[no]) + " gagal: " + str(galat) + ")")
        kategorikal = [no for no, s in enumerate(stat) if not s["numerik"] and 1 < s["unik"] <= 30]
        for no in kategorikal[:2]:
            try:
                teratas_isi = teratas(kolom[no], 10)
                if not teratas_isi:
                    continue
                label = [potong(k, 24) for k, _ in teratas_isi]
                jumlah = [n for _, n in teratas_isi]
                gambar, poros = plt.subplots(figsize=(8.5, max(3.0, 0.34 * len(label) + 1.2)))
                poros.barh(label, jumlah, color="#59a14f")
                poros.set_title("Nilai terbanyak: " + str(header[no]) + " — " + nama_sheet)
                poros.invert_yaxis()
                gambar.tight_layout()
                gambar.savefig(os.path.join(CHART_DIR, "kategori_" + slug + "_" + str(no + 1) + ".png"), dpi=130)
                plt.close(gambar)
            except Exception as galat:
                print("  (grafik kategori " + str(header[no]) + " gagal: " + str(galat) + ")")

        # 4) tren dari stats.json (bila ada kolom tanggal)
        for lembar in (stats.get("sheets") or []):
            if str(lembar.get("name")) != nama_sheet:
                continue
            for tren in (lembar.get("trends") or [])[:2]:
                try:
                    label = [str(x) for x in (tren.get("labels") or [])]
                    nilai = [float(x) for x in (tren.get("values") or [])]
                    if len(label) < 2 or len(label) != len(nilai):
                        continue
                    gambar, poros = plt.subplots(figsize=(9, 3.6))
                    poros.plot(range(len(label)), nilai, marker="o", linewidth=1.6, color="#f28e2b")
                    poros.set_xticks(range(len(label)))
                    poros.set_xticklabels(label, rotation=45, ha="right", fontsize=7)
                    poros.set_title("Tren " + str(tren.get("num")) + " per " + str(tren.get("gran")) + " — " + nama_sheet)
                    gambar.tight_layout()
                    gambar.savefig(os.path.join(CHART_DIR, "tren_" + slug + "_" + str(tren.get("num")) + ".png"), dpi=130)
                    plt.close(gambar)
                except Exception as galat:
                    print("  (tren " + str(tren.get("num")) + " gagal: " + str(galat) + ")")
    print("Grafik disimpan di folder: " + CHART_DIR)


# ── laporan utama ───────────────────────────────────────────────────────────

def ringkas_sheet(entri, baris):
    nama_sheet = str(entri.get("sheet") or entri.get("file"))
    header, isi = baca_csv(entri["file"])
    baris.append("")
    baris.append("-" * 72)
    baris.append("SHEET: " + nama_sheet + "  (" + str(len(isi)) + " baris x " + str(len(header)) + " kolom)")
    baris.append("-" * 72)
    if not header:
        baris.append("  (tidak ada data terbaca)")
        return
    kolom = [[b[no] if no < len(b) else "" for b in isi] for no in range(len(header))]
    stat = [statistik_kolom(k) for k in kolom]
    total_sel = max(1, len(header) * len(isi))
    kosong_total = sum(s["kosong"] for s in stat)
    duplikat = len(isi) - len(set(tuple(b) for b in isi))
    baris.append("  Sel kosong " + str(kosong_total) + " dari " + str(total_sel) + " ("
                 + persen(100.0 * kosong_total / total_sel, 1) + ") · baris duplikat " + str(duplikat))
    angka_cols = [s for s in stat if s["numerik"]]
    baris.append("  Kolom: " + str(len(angka_cols)) + " numerik, " + str(len(header) - len(angka_cols)) + " lain-lain")
    baris.append("")
    for no, nama in enumerate(header):
        waktu = "[" + str(no + 1) + "] " + str(nama)
        s = stat[no]
        if s["numerik"]:
            baris.append("  " + waktu + " (numerik)")
            baris.append("      min " + fmt(s["min"]) + " · mean " + fmt(s["mean"]) + " · median " + fmt(s["median"])
                         + " · max " + fmt(s["max"]) + " · std " + fmt(s["std"]) + " · jumlah " + fmt(s["sum"]))
        else:
            atas = teratas(kolom[no], 5)
            isi_atas = " | ".join((potong(k, 24) + " " + str(n)) for k, n in atas) if atas else "-"
            baris.append("  " + waktu + " (unik " + str(s["unik"]) + ", kosong " + str(s["kosong"]) + ")")
            baris.append("      teratas: " + isi_atas)


def main():
    argumen = sys.argv[1:]
    hanya_sheet = None
    if "--sheet" in argumen:
        posisi = argumen.index("--sheet")
        if posisi + 1 < len(argumen):
            hanya_sheet = argumen[posisi + 1]

    index = baca_index()
    if not index:
        print("Folder data/ kosong atau index.json tidak ditemukan.")
        print("Pastikan folder diekstrak lengkap (analysis.py + data/ + stats.json harus bersebelahan).")
        return 1

    stats = {}
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE, "r", encoding="utf-8") as berkas:
            stats = json.load(berkas)

    baris = []
    baris.append("=" * 72)
    baris.append("LAPORAN ANALISIS DATA — " + str(stats.get("fileName", "(tanpa nama)")))
    baris.append("Dibuat oleh Date Skunder · " + str(stats.get("generatedAt", "")))
    baris.append("Jumlah sheet: " + str(len(index)))
    baris.append("=" * 72)

    for entri in index:
        if hanya_sheet and str(entri.get("sheet")) != str(hanya_sheet):
            continue
        ringkas_sheet(entri, baris)
        for lembar in (stats.get("sheets") or []):
            if str(lembar.get("name")) != str(entri.get("sheet")):
                continue
            bagian_kualitas_csv(lembar.get("csvHealth"), baris)
            bagian_kpi(lembar.get("businessKpi"), baris)
            bagian_stok(lembar.get("stockAnalysis"), baris)
            bagian_kebutuhan(lembar.get("needsAnalysis"), baris)
            bagian_pohon_keputusan(lembar.get("decisionTreeAnalysis"), baris)
            if lembar.get("insights"):
                baris.append("")
                baris.append("[TEMUAN OTOMATIS]")
                for temuan in (lembar.get("insights") or [])[:20]:
                    baris.append("  - " + str(temuan))

    teks = "\n".join(baris)
    with open(REPORT_FILE, "w", encoding="utf-8") as berkas:
        berkas.write(teks + "\n")
    print(teks)
    print("")
    print("Laporan ditulis: " + REPORT_FILE)

    if "--no-chart" not in argumen:
        buat_grafik(index, stats)
    print("Selesai.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

export const STREAMLIT_PY = String.raw`#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dashboard interaktif (opsional) dari hasil export Date Skunder.

Jalankan:
  pip install -r requirements.txt
  streamlit run streamlit_app.py

Semua angka diambil dari data/ dan stats.json — tidak ada koneksi internet yang dibutuhkan.
"""

import json
import os

import pandas as pd
import streamlit as st

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATS_FILE = os.path.join(BASE_DIR, "stats.json")

st.set_page_config(page_title="Date Skunder — Analisis Data", page_icon="📊", layout="wide")
st.title("📊 Date Skunder — Dashboard Analisis")
st.caption("Dibuat otomatis dari ekstensi Streamlit Launcher (Date Skunder).")


@st.cache_data(show_spinner=False)
def baca_index():
    path = os.path.join(DATA_DIR, "index.json")
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as berkas:
        return json.load(berkas)


@st.cache_data(show_spinner=False)
def baca_stats():
    if not os.path.exists(STATS_FILE):
        return {}
    with open(STATS_FILE, "r", encoding="utf-8") as berkas:
        return json.load(berkas)


@st.cache_data(show_spinner=False)
def baca_data(nama_berkas):
    return pd.read_csv(os.path.join(DATA_DIR, nama_berkas))


index = baca_index()
stats = baca_stats()
if not index:
    st.error("Folder data/ kosong — jalankan analisis.py lebih dulu atau periksa isi paket export.")
    st.stop()

st.sidebar.header("Pilih data")
pilihan = st.sidebar.selectbox("Sheet", [str(x.get("sheet")) for x in index], index=0)
entri = next((x for x in index if str(x.get("sheet")) == pilihan), index[0])
lembar = next((x for x in (stats.get("sheets") or []) if str(x.get("name")) == pilihan), {})

df = baca_data(entri["file"])
st.subheader("Pratinjau data — " + pilihan)
st.write(str(len(df)) + " baris × " + str(len(df.columns)) + " kolom")
st.dataframe(df.head(500), use_container_width=True)

kualitas = lembar.get("csvHealth") or {}
if kualitas:
    kolom1, kolom2, kolom3, kolom4 = st.columns(4)
    kolom1.metric("Skor kualitas", str(kualitas.get("qualityScore")) + "/100", kualitas.get("qualityRating"))
    kolom2.metric("Kelengkapan", str(kualitas.get("completenessScore")) + "%")
    kolom3.metric("Integritas", str(kualitas.get("integrityScore")) + "%")
    kolom4.metric("Konsistensi", str(kualitas.get("consistencyScore")) + "%")

kpi = lembar.get("businessKpi") or {}
ringkas = kpi.get("summary") or {}
if ringkas:
    st.subheader("KPI bisnis")
    kolom = st.columns(4)
    kolom[0].metric("Pendapatan", format(ringkas.get("totalRevenue") or 0, ",.2f"))
    kolom[1].metric("Order", format(ringkas.get("totalOrders") or 0, ",.0f"))
    kolom[2].metric("Laba kotor", format(ringkas.get("grossProfit") or 0, ",.2f"))
    kolom[3].metric("Margin", format(ringkas.get("grossMarginPct") or 0, ",.2f") + "%")
    periode = (kpi.get("growth") or {}).get("periods") or []
    if periode:
        data_tren = pd.DataFrame(periode)
        st.line_chart(data_tren.set_index("period")["revenue"])
    produk = kpi.get("topProducts") or []
    if produk:
        st.bar_chart(pd.DataFrame(produk).set_index("label")["revenue"])

stok = lembar.get("stockAnalysis") or {}
if stok:
    st.subheader("Stok / inventaris")
    kpi_stok = stok.get("kpis") or {}
    kolom = st.columns(4)
    kolom[0].metric("Total SKU", format(kpi_stok.get("totalSKUs") or 0, ",.0f"))
    kolom[1].metric("Kritis", format(kpi_stok.get("criticalCount") or 0, ",.0f"))
    kolom[2].metric("Menipis", format(kpi_stok.get("lowCount") or 0, ",.0f"))
    kolom[3].metric("Valuasi", format(kpi_stok.get("totalValuation") or 0, ",.2f"))

angka = df.select_dtypes("number")
if not angka.empty:
    st.subheader("Jelajah kolom numerik")
    kolom_pilih = st.selectbox("Kolom numerik", list(angka.columns))
    st.bar_chart(angka[kolom_pilih].dropna().reset_index(drop=True).head(200))
    st.line_chart(angka[kolom_pilih].dropna().reset_index(drop=True).head(200))

with st.expander("Ringkasan statistik (pandas)"):
    st.dataframe(df.describe(include="all").transpose(), use_container_width=True)

st.caption("Data lengkap ada di folder data/ · laporan teks di laporan.txt (dari analysis.py).")
`;

// ── export ──────────────────────────────────────────────────────────────────

export interface PackageFile { path: string; text: string }

export interface PackageIndex {
    sheet: string;
    file: string;
    slug: string;
    rows: number;
    totalRows: number;
    truncated: boolean;
}

/**
 * Susun seluruh isi paket Python di memori (tanpa menyentuh disk) — dipakai exportPython
 * dan juga bisa diuji langsung dengan Node. Urutan berkas: data/* lalu metadata dan skrip.
 */
export function buildPythonPackage(wb: WorkbookResult, fileName: string): { files: PackageFile[]; index: PackageIndex[]; mainPath: string } {
    const files: PackageFile[] = [];
    const used = new Set<string>();
    const index: PackageIndex[] = [];
    const base = fileName.replace(/\.[^.]+$/, '');
    const generik = (nama: string) => /^sheet\s*\d+$/i.test(String(nama || '').trim());

    // 1) Seluruh data tiap sheet.
    for (const sheet of wb.sheets) {
        // Nama sheet bawaan pembaca ("Sheet1") diganti nama berkas sumber agar rapi.
        const sumber = generik(sheet.name) && wb.sheets.length === 1 ? base : sheet.name;
        let slug = fileSlug(sumber);
        while (used.has(slug)) { slug = `${slug}-2`; }
        used.add(slug);
        const file = `${slug}.csv`;
        files.push({ path: `data/${file}`, text: sheetToCsv(sheet) });
        index.push({
            sheet: sheet.name,
            file,
            slug,
            rows: sheet.rows.length,
            totalRows: sheet.totalRows,
            truncated: !!sheet.truncated,
        });
    }
    files.push({ path: 'data/index.json', text: JSON.stringify(index, null, 2) });

    // 2) stats.json — payload analisis lengkap; baris dipangkas bila berkas terlalu besar.
    const full = { ...wb, generatedAt: new Date().toLocaleString('id-ID') };
    let statsText = JSON.stringify(full);
    if (statsText.length > MAX_JSON_CHARS) {
        statsText = JSON.stringify({
            ...full,
            _catatan: 'Kolom baris pada stats.json dipangkas karena berkas terlalu besar; data lengkap ada di folder data/*.csv.',
            sheets: wb.sheets.map((s) => ({ ...s, rows: [] })),
        });
    }
    files.push({ path: 'stats.json', text: statsText });

    // 3) Skrip + petunjuk.
    files.push({ path: 'analysis.py', text: ANALYSIS_PY });
    files.push({ path: 'streamlit_app.py', text: STREAMLIT_PY });
    files.push({ path: 'requirements.txt', text: REQUIREMENTS });
    files.push({
        path: 'README.md',
        text: buildReadme(fileName, `${fileName.replace(/\.[^.]+$/, '')}-python`, index.map((i) => ({ sheet: i.sheet, file: i.file, rows: i.totalRows, truncated: i.truncated }))),
    });

    return { files, index, mainPath: 'analysis.py' };
}

function buildReadme(fileName: string, folderName: string, sheets: { sheet: string; file: string; rows: number; truncated: boolean }[]): string {
    const sheetList = sheets
        .map((s) => `- \`data/${s.file}\` — sheet **${s.sheet}** (${s.rows.toLocaleString('id-ID')} baris${s.truncated ? ', analisis dibatasi 50.000 baris pertama' : ''})`)
        .join('\n');
    return `# Paket Python — analisis \`${fileName}\`

Dibuat otomatis oleh ekstensi **Streamlit Launcher (Date Skunder)**. Seluruh data dianalisis ada di folder ini.

## Isi paket

${sheetList}
- \`data/index.json\` — daftar sheet dan berkasnya
- \`stats.json\` — hasil analisis lengkap (KPI bisnis, stok, kebutuhan, kualitas CSV, decision tree, temuan otomatis)
- \`analysis.py\` — skrip utama (hanya pustaka bawaan Python)
- \`streamlit_app.py\` — dashboard interaktif opsional
- \`requirements.txt\` — paket opsional untuk grafik dan dashboard

## Cara menjalankan

1. Pastikan Python 3.8+ terpasang (\`python --version\`).
2. Jalankan skrip utama — tanpa pemasangan paket apa pun:

   \`\`\`
   python analysis.py
   \`\`\`

   Hasilnya: ringkasan di layar, berkas \`laporan.txt\`, dan (bila matplotlib terpasang) gambar di folder \`grafik/\`.

3. (Opsional) grafik statis:

   \`\`\`
   pip install matplotlib
   python analysis.py
   \`\`\`

4. (Opsional) dashboard interaktif:

   \`\`\`
   pip install -r requirements.txt
   streamlit run streamlit_app.py
   \`\`\`

## Pilihan lain

\`\`\`
python analysis.py --no-chart      # tanpa grafik
python analysis.py --sheet Sheet1  # hanya satu sheet
\`\`\`

## Catatan

- Angka pada \`laporan.txt\` dihitung ulang dari CSV di folder \`data/\`, jadi bisa dipakai memverifikasi hasil ekstensi.
- Bila berkas sumber sangat besar, analisis ekstensi memakai baris yang tersedia pada \`stats.json\`; CSV pada folder \`data/\` berisi data yang sama dengan yang dianalisis.
`;
}

const REQUIREMENTS = `# Paket opsional untuk paket export Date Skunder.
# analysis.py TIDAK memerlukan paket apa pun (hanya pustaka bawaan Python).
# Pasang baris berikut bila ingin grafik dan dashboard:

# Grafik PNG dari analysis.py:
matplotlib>=3.5

# Dashboard interaktif (streamlit_app.py):
streamlit>=1.30
pandas>=1.5
`;

/**
 * Buat paket Python dari berkas sumber: seluruh data + stats.json + skrip siap jalan.
 * Berkas disimpan di folder sumber (atau dateSkunder.exportFolder) di subfolder `<nama>-python/`.
 */
export async function exportPython(source: vscode.Uri, sheetName?: string): Promise<vscode.Uri | undefined> {
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Membuat paket Python (data + skrip)…' },
        async () => {
            try {
                const cfg = vscode.workspace.getConfiguration('dateSkunder');
                const fileName = path.posix.basename(source.path);
                const bytes = await vscode.workspace.fs.readFile(source);
                const wb: WorkbookResult = analyzeWorkbook(bytes, fileName, treeOptionsFromSettings());
                globalAnalysisStore.set(source.toString(), wb, fileName);

                const base = fileName.replace(/\.[^.]+$/, '');
                const folder = (cfg.get<string>('exportFolder') ?? '').trim();
                const dir = folder ? vscode.Uri.file(folder) : vscode.Uri.joinPath(source, '..');
                const target = vscode.Uri.joinPath(dir, `${base}-python`);
                await vscode.workspace.fs.createDirectory(target);

                const pkg = buildPythonPackage(wb, fileName);
                let main: vscode.Uri | undefined;
                for (const file of pkg.files) {
                    const uri = vscode.Uri.joinPath(target, ...file.path.split('/'));
                    const written = await safeWrite(uri, enc(file.text));
                    if (file.path === pkg.mainPath) { main = written; }
                }

                await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
                const relative = path.posix.basename(target.path);
                vscode.window.showInformationMessage(
                    `Paket Python tersimpan di folder "${relative}" (${wb.sheets.length} sheet). Jalankan: python analysis.py`,
                    'Buka Skrip',
                ).then(async (answer) => {
                    if (answer !== 'Buka Skrip' || !main) { return; }
                    const scriptDoc = await vscode.workspace.openTextDocument(main);
                    await vscode.window.showTextDocument(scriptDoc);
                });
                return main;
            } catch (e) {
                console.error('Export Python gagal:', e);
                vscode.window.showErrorMessage(`Gagal membuat paket Python: ${e instanceof Error ? e.message : String(e)}`);
                return undefined;
            }
        },
    );
}
