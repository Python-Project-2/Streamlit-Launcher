<div align="center">

<img src="https://global.discourse-cdn.com/streamlit/optimized/3X/d/9/d98ea0064118f8129b1138b1e5aca3580fa108c1_2_690x345.jpeg" style="border-radius:20px" width="400" height="200" alt="XAMPP Meta Panel Logo" />


# SCRIPY WINDOWS PREVIEW - PRESS RELEASE 0.1.0

**Powerfull Preview ADB Manager Android For Windows**

• [📖 Documentation](https://github.com/extension-publisher-vsx-registry/pdf-cat-view/edit/main/README.md) • [🐛 Report Bug](https://github.com/Python-Project-2/Streamlit-Launcher/issues) • [💡 Request Feature](https://github.com/Python-Project-2/Streamlit-Launcher/pulls)

</div>



<div align="center">

| [<img src="https://github.com/DwiDevelopes.png" width="100px;"/><br /><sub><b>DwiDevelopes</b></sub>](https://github.com/DwiDevelopes) | [<img src="https://github.com/katshinz.png" width="100px;"/><br /><sub><b>katshinz</b></sub>](https://github.com/katshinz) | [<img src="https://github.com/codingvibe493.png" width="100px;"/><br /><sub><b>Vibe Coding</b></sub>](https://github.com/codingvibe493) |
| :---: | :---: | :---: |

</div>

# Streamlit Launcher For VS Code (Date Skunder) - Realease 1.0.0

<img src = "https://github.com/Python-Project-2/Streamlit-Launcher/blob/main/apps.gif?raw=true">

**Streamlit Launcher For VS Code** (also known as **Date Skunder**) is a powerful extension designed to provide automated previews and interactive data analysis for CSV and Excel files directly within Visual Studio Code. Visualize data with charts, add notes, and export reports seamlessly to PDF.

## ✨ Features

* **Automated File Previews:** Instantly open and preview tabular data without leaving your editor.

* **Multi-Format Support:** Works seamlessly with `CSV`, `TSV`, `XLSX`, `XLS`, and `XLSM` files.

* **Interactive Data Analysis:** Explore your datasets with built-in analytical tools.

* **Chart Generation:** Create visual representations of your data with integrated Chart.js support.

* **Notes & Annotations:** Keep track of insights, observations, and notes alongside your data.

* **PDF Export:** Export your analysis, notes, and charts into a clean PDF document.

## 🚀 Supported File Types

* **CSV** (`*.csv`)

* **TSV** (`*.tsv`)

* **Excel Workbooks** (`*.xlsx`, `*.xls`, `*.xlsm`)

## 🛠️️ Usage

### 1. Opening a File

* **Explorer Context Menu:** Right-click any supported file (`.csv`, `.xlsx`, etc.) in the VS Code File Explorer and select **"Date Skunder: Open Preview & Analysis"**.

* **Default Editor:** Clicking normally on a supported file may open it with the custom editor viewer automatically.

### 2. Analysis & Exporting

Once the viewer is open, you can:

* View interactive data summaries and grids.

* Generate and customize charts based on your columns.

* Write and save notes.

* Export everything directly to a PDF report.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🔥 What's New

### 1. Added support for XLSX, XLS, and XLSM files

* Now you can open and analyze Excel files directly within the viewer

### 2. Added support for TSV files

* Now you can open and analyze tsv files directly within the viewer

## Developers

- [Dwi Bakti N Dev](https://github.com/dwidevelopes)

# Scripy Windows Preview

Ekstensi Visual Studio Code untuk menjalankan dan mengontrol tampilan layar Android (**scrcpy**) langsung dari dalam VS Code. Ekstensi ini menyediakan panel kontrol *webview*, pembagian posisi dock otomatis di layar, serta log status real-time.

---

## 📋 Prasyarat

1. **Perangkat Android**:
* Aktifkan **Developer Options** (Opsi Pengembang) di HP Anda.
* Aktifkan **USB Debugging** (Debugging USB).
* Sambungkan HP ke komputer menggunakan kabel data USB (pilih mode *Transfer File* / *MTP* jika diperlukan).


2. **Sistem Operasi**:
* Khusus **Windows** (karena menggunakan file biner `.exe`).


3. **Berkas Biner `scrcpy**`:
* Ekstensi membutuhkan berkas eksekusi `scrcpy` yang diletakkan di dalam folder `model/` pada direktori utama ekstensi.





## 🚀 Tata Cara Penggunaan

### 1. Membuka Panel Kontrol

Setelah ekstensi terpasang, Anda dapat membuka panel **Scripy Preview** di Sidebar VS Code.

### 2. Menjalankan Preview

Terdapat 3 cara untuk menjalankan `scrcpy`:

* **Melalui Status Bar**: Klik tombol **`📱 Device`** di sudut kanan bawah VS Code.
* **Melalui Panel Webview**: Klik tombol **▶ Run scrcpy** pada panel *Scripy Preview*.
* **Melalui Command Palette**: Tekan `Ctrl + Shift + P`, ketik `scripy-windows-preview.run`, lalu tekan `Enter`.

### 3. Memilih Posisi Window (Docking)

Anda dapat mengatur posisi jendela `scrcpy` agar menempel di tepi layar monitor:

* **Left**: Menempatkan jendela di sebelah kiri layar.
* **Right**: Menempatkan jendela di sebelah kanan layar (default).
* **Free**: Menjalankan tanpa menentukan posisi awal (bebas).

*Perubahan opsi dock akan diterapkan pada sesi running berikutnya.*

### 4. Menghentikan Preview

* Klik tombol **■ Stop** pada panel Webview, atau
* Jalankan perintah `scripy-windows-preview.stop` dari Command Palette.

---

## ⚙️ Pengaturan (Settings)

Anda dapat mengonfigurasi perilaku ekstensi melalui file `settings.json` atau menu **Settings** (`Ctrl + ,`) dengan kata kunci `scripyPreview`:

| Pengaturan | Tipe | Default | Deskripsi |
| --- | --- | --- | --- |
| `scripyPreview.dock` | `string` | `"right"` | Posisi awal jendela scrcpy (`"left"`, `"right"`, atau `"none"`). |
| `scripyPreview.alwaysOnTop` | `boolean` | `true` | Membuat jendela scrcpy selalu berada di atas jendela lain (`--always-on-top`). |
| `scripyPreview.screenScale` | `number` | `0` | Override rasio skala layar (DPR). Jika `0`, skala terdeteksi secara otomatis. |

### Contoh Konfigurasi `settings.json`:

```json
{
  "scripyPreview.dock": "right",
  "scripyPreview.alwaysOnTop": true,
  "scripyPreview.screenScale": 0
}

```

---

## 🛠️ Perintah (Commands)

| Perintah | Command ID | Deskripsi |
| --- | --- | --- |
| **Run scrcpy** | `scripy-windows-preview.run` | Membuka panel dan menjalankan sesi `scrcpy`. |
| **Stop scrcpy** | `scripy-windows-preview.stop` | Menghentikan proses `scrcpy` yang sedang berjalan. |

---

## ❓ Penanganan Masalah (Troubleshooting)

* **Pesan Kesalahan:** `scrcpy.exe not found`
* Pastikan Anda telah mengekstrak file `scrcpy` ke dalam folder `model/` di lokasi instalasi ekstensi.


* **Perangkat tidak terdeteksi / Jendela scrcpy langsung tertutup**
* Periksa kembali koneksi USB.
* Pastikan pesan dialog izin **USB Debugging** di layar HP sudah Anda setujui (*Allow/Izinkan*).
* Buka *Command Prompt*, jalankan `adb devices` untuk memastikan perangkat terdaftar.