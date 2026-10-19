<div align="center">

<img src="https://global.discourse-cdn.com/streamlit/optimized/3X/d/9/d98ea0064118f8129b1138b1e5aca3580fa108c1_2_690x345.jpeg" style="border-radius:20px" width="400" height="200" alt="XAMPP Meta Panel Logo" />

# Install Model LLM Engine

<img src= "https://github.com/Python-Project-2/Streamlit-Launcher/blob/main/contoh.gif?raw=true" />

# SCRIPY WINDOWS PREVIEW - PRESS RELEASE 3.7

**Powerfull Preview ADB Manager Android For Windows**

<img src = "https://github.com/Python-Project-2/Streamlit-Launcher/blob/main/thema.png?raw=true">

• [📖 Documentation](https://github.com/extension-publisher-vsx-registry/pdf-cat-view/edit/main/README.md) • [🐛 Report Bug](https://github.com/Python-Project-2/Streamlit-Launcher/issues) • [💡 Request Feature](https://github.com/Python-Project-2/Streamlit-Launcher/pulls)

</div>


# Journal Generator APA Style

<img src = "https://github.com/Python-Project-2/Streamlit-Launcher/blob/main/journal.png?raw=true"/>

## Friend Help Project
<div align="center">

| [<img src="https://github.com/DwiDevelopes.png" width="100px;"/><br /><sub><b>DwiDevelopes</b></sub>](https://github.com/DwiDevelopes) | [<img src="https://github.com/katshinz.png" width="100px;"/><br /><sub><b>katshinz</b></sub>](https://github.com/katshinz) | [<img src="https://github.com/codingvibe493.png" width="100px;"/><br /><sub><b>Vibe Coding</b></sub>](https://github.com/codingvibe493) |
| :---: | :---: | :---: |

</div>

## [2.9.7] - Press-Release 2026-10-19

### Fixed

- **Excel export**: cell content longer than 32K characters could trigger Excel errors. All formula-driven sheets now compute intermediate values in hidden columns and reference those instead — avoiding long strings in calculations and simplifying formulas.

### Changed

- **Decision Tree entropy detail**: the breakdown of per-value entropy in the Decision Tree tab now shows at most **12 unique values**. Beyond that, a summary line is printed (`... dan 12 nilai lain`), so numeric columns with many distinct values no longer overflow cell limits.
- **C4.5 discovery: default model now treats high-cardinality integers as categorical**: when the model does **not** see `"number"` or `"date"` explicitly, integer columns with more than 30 unique values are now treated as categorical (discrete), not continuous — which typically results in more interpretable split rules.

## [2.8.3] - Release 2026-10-16

### Fixed

- **Chat AI “Kirim” button**: the click event was passed into the message text, so the chat could send the literal string `[object PointerEvent]` to the model as a question. The handler now calls `doSend()` with no arguments, `doSend` accepts only string presets (voice results), and the extension rejects `[object …]` messages with a clear notice instead of forwarding them.

### Changed

- **All costumes except the default are now locked**: only **Baja Klasik** is available from the start; the other **12 costumes** each require their own mission. Twelve missions in total: first export (Samurai Fajar), jurnal DOCX/PDF (Merah Menyala), flow image (Zamrud Rimba), 3 stock-tab switches (Senja Jingga), 5 typing/input actions (Ungu Neon), export JSON (Es Kristal), export PPT (Emas Royal), “export semua sekaligus” (Lava Magma), run the tour (Robot Chrome), run the check (Peri Kupu), 5 nonstop rounds (Hantu Bulan), 25 successful actions (Ninja Bayangan).
- The pet now **falls back to the default costume** whenever the selected costume is still locked, even if the setting already points at it; unlocked costumes keep working as before.

### Spider: full export control, checking, shortcuts

- **New export buttons in the analysis toolbar**: Jurnal PDF, Excel, PPT, Flow (workflow image) and **JSON** (new `json` export format writes `<name>-data.json` containing the full analysis of every sheet, plus the export timestamp and sheet list). The spider can press all of them because they use `btn-export-*` ids like the existing DOCX/Python buttons.
- **Batch export**: “export semua sekaligus” now clicks *every* export button in one command (one verified step per button, ✓/✗ reported per click).
- **✓ Cek semua kontrol**: new panel button + Command Palette entry + keybinding; it presses each safe control once with per-action verification and prints a tidy summary with any failures named; inputs/dropdowns are only highlighted so a check never changes data.
- **Wider target coverage**: header/toolbar/Chart Builder buttons, range sliders, checkboxes, content-editable fields, note fields, sort headers, stock tabs and search boxes are now part of the target list; labels carry their section (“KPI › tombol: Export Excel”). Targets named by the model that do not exist on the page are reported and skipped instead of being silently ignored.
- **Keybindings**: `Ctrl+Alt+T` (run all features), `Ctrl+Alt+K` (check all controls), `Ctrl+Alt+N` (toggle nonstop), `Ctrl+Alt+X` (stop), `Ctrl+Alt+J` (export JSON) — plus Command Palette entries and editor-title buttons. Commands are delivered only to the visible analysis page (hidden tabs ignore them).

### Pet Skin: locked costumes with missions

- **Five new costumes** (Samurai Fajar, Lava Magma, Robot Chrome, Peri Kupu, Hantu Bulan — 13 in total) with two new accessories (antenna, wings).
- **Mission gate**: each locked costume needs its mission (first export / export-all in one command / run the tour / run the check / 5 nonstop rounds). Progress lives in global state, the view shows a mission list with progress and the unlocked costume, and locked cards show 🔒, a dimmed preview, and the requirement.

### Nonstop work: coverage-driven and tidy

- Each round targets the **next un-analysed section** (“bagian 3/9 sudah dibahas — lanjut ke …”) and only switches to fresh angles (trend, outliers, correlation, data quality, recommendations) once every section has been covered; previous suggestions travel with the request as a “do not repeat” list and each round logs one compact line.

### Chat AI: grounded, duplicate-free, unlimited

- **Anti-hallucination system prompt**: answers may only use numbers and columns that really exist in the data context; missing values must be admitted (*“datanya tidak tersedia di konteks ini”*); derived values must show their short calculation; facts are kept apart from estimates; inventing columns, files or sources is forbidden.
- **Duplicate replies fixed on both ends**: the extension aborts a running answer before starting a new one, ignores stream chunks from an old answer, and de-duplicates the final text (identical paragraphs + consecutive repeated sentences) before the webview renders it; the webview closes any leftover bubble, ignores stray chunks, and shows exactly the cleaned final text (also used for speech).
- **Unlimited conversation**: the 12-message cut is gone. The prompt now carries as many recent turns as fit `dateSkunder.llama.contextSize`, and messages that fall out of that window are compressed into a **rolling summary** (generated by the same model) that is attached to every new question, so long sessions keep their context.

### Spider: nonstop mode, tidier model output

- **🔁 Nonstop work mode**: new panel button + setting `dateSkunder.spider.nonstopSeconds` (default 90, 30–3600). Every round the pet asks the model for one **new suggestion with details** (already-given suggestions are passed along so they are not repeated) and runs the safe supporting steps; it keeps going while the analysis page is open, survives page redraws (state is remembered), and stops when you turn it off.
- **Tidier explanations**: the closing explanation written by the model now follows a fixed format (one conclusion line, then 2–4 `•` detail lines), is de-duplicated with the same helper as the chat, renders as tidy rows in the pet log, and is spoken without bullet symbols.
- **Stronger executor prompt**: the spider answers the whole instruction, answers questions with data and highlights the evidence, executes when the instruction asks for it, and avoids repeating the same sentence across steps.

### Charts: complete set

- **7 new Chart Builder types** (22 total): Waterfall (floating cumulative bars + cumulative line), Diverging Bar (colour by sign), Boxplot (Q1–Q3 box + median marker per category, computed from raw rows), Stacked Area, 100% Stacked Area, Gauge (share of a category against the total, with centre text plugin), and Timeline/Gantt (floating bars from a start-date column to an end-date column, with duration tooltips).
- **3 new Advanced Visualizations**: Forecast (per-period mean + 5-point moving average + dashed linear projection), Control Chart (series + moving average + UCL/LCL at mean ±3σ), and a Data Completeness gauge.
- Default dashboards now also seed a stacked area (period × series) and a boxplot when the columns allow it, and a timeline when two date columns exist.
- All charts use the bundled Chart.js build — no extra plugins or dependencies — and every type was verified to produce a valid Chart.js configuration.

### Spider: executes instead of only narrating

- **Commands now map to real actions**: the intent behind a request (export, switch stock filter tab, sort the table, add a chart, type into a search field, open a link, change a dropdown) is translated into concrete actions and is forced onto every plan — even when the model forgets to write `action`. Actions that change or delete user data run **only** when the instruction itself names them.
- **Wider page executor**: beyond export buttons and links, the spider now presses stock filter tabs, table sort headers, Chart Builder buttons, notes buttons and “load more”, changes dropdowns, and types into input fields — each with the correct `change`/`input` events so the view really updates.
- **Per-action verification**: clicks that should change the view are watched with a `MutationObserver`; if nothing changes the action is retried once and then reported honestly as ✓/✗ (never claimed as successful). Icon-only buttons (e.g. “✕”) now use their `title` as a meaningful label.
- **Automatic tour “▶ Run all features”**: the spider walks through every page section in order and operates all safe controls, with “step i/n” progress and a progress bar; controls that could change data are only highlighted and reported.
- **⚡ Auto toggle** (`dateSkunder.spider.autoRun`, on by default): every spider instruction is executed immediately; switch it off temporarily for “explain only” mode.

### Chat AI is chat only

- The **Chat AI** sidebar now answers questions about the analyzed file (text, tables, voice) and does nothing else. The **⚡ Auto-eksekusi** toggle (`dateSkunder.ai.autoExecute`), the **🕷️ Kerjakan di halaman** button on every message, and the execution cards in the chat were **removed**: analysis panels no longer register their control list with the extension, and execution lives entirely in the spider panel (its own instruction box).

### Full-model explanations for the spider

- Plans, per-step narration, and the closing summary are written by the same `llama-server` as Chat AI with the **full statistics context** of the open file (no longer truncated to a short summary).
- After a run finishes, the model writes a short explanation of the results (what was done, what succeeded or failed, and what it means for the data) which the spider shows in its bubble and log and reads aloud when 🔈 is on. When `llama-server` is not running, the spider reports that honestly instead of inventing a summary.

### New: Pet Skin (spider costume picker)

- **Third view in the Date Skunder AI sidebar**, right below Chat AI and LLAMA Server — it **replaces the Flowchart Canvas**, which was removed together with its commands (`date-skunder.flow.open`, `date-skunder.flow.addNode`) and settings (`dateSkunder.flow.useModel`, `dateSkunder.flow.nodeWidth`).
- **Eight costumes** (Baja Klasik, Merah Menyala, Zamrud Rimba, Senja Jingga, Ungu Neon, Es Kristal, Emas Royal, Ninja Bayangan) with their own colours and accessories (crown, hat, bow, glasses, scarf, halo, headband).
- Every card shows a **live preview** drawn from the same colours and accessory shapes the spider uses on the page; the **Pakai** button stores the choice in the new setting `dateSkunder.spider.skin` and broadcasts it to every open analysis page, so the spider re-dresses immediately. The spider panel also gained a **🎨 button** that opens this view.
- New commands: **Date Skunder Pet: Buka Ganti Kostum Pet (Skin)** and **Date Skunder Pet: Ganti Kostum Pet (Pilih Cepat)**.

<img src = "https://github.com/Python-Project-2/Streamlit-Launcher/blob/main/apps.gif?raw=true">

**Streamlit Launcher For VS Code** (also known as **Date Skunder**) is an extension that provides automated previews and interactive data analysis for CSV and Excel files directly inside Visual Studio Code. Visualize data with charts, add notes, and export reports without leaving the editor.

## ✨ Features

* **Automated File Previews:** Instantly open and preview tabular data without leaving your editor.

* **Multi-Format Support:** Works with `CSV`, `TSV`, `XLSX`, `XLS`, and `XLSM` files.

* **Interactive Data Analysis:** Explore datasets with built-in analytical tools.

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

* Export everything directly to a report (DOCX, PDF, XLSX, PPTX, workflow image, or a ready-to-run Python package).

## 📄 License

This project is licensed under the [MIT License](LICENSE).

## 🔥 What's New

### 1. Added support for XLSX, XLS, and XLSM files

* You can now open and analyze Excel files directly inside the viewer.

### 2. Added support for TSV files

* You can now open and analyze TSV files directly inside the viewer.

## Developers

- [Dwi Bakti N Dev](https://github.com/dwidevelopes)

## Voice, Python Export & Spider (2.7.7)

### 🎙️ Voice in the Chat AI sidebar

You can **talk** to the AI and it answers with a **female voice**:

1. Open the **Date Skunder AI** icon in the activity bar → **Chat AI** view.
2. Press **🎙️** and speak. Speech is converted to text and (by default) sent to the LLM immediately.
3. Answers are read aloud automatically with a female voice (🔊 toggles sound; the small 🔊 button on a reply repeats it).
4. Turn on **auto-listen** so the microphone starts again after the AI finishes speaking (hands-free conversation).

Speech recognition uses the built-in Windows recognizer (offline, through `System.Speech`); if an Indonesian recognizer is not installed, the available default recognizer is used. Settings live under `dateSkunder.voice.*` (STT/TTS engine, language, voice gender, rate, auto-send, auto-listen). The command **Date Skunder AI: Speak Now (Voice Input)** can be used from the Command Palette or a keybinding.

### 🐍 Python Export (all data, ready to run)

The **🐍 Export Python** button on the preview toolbar (or right-click a CSV/Excel file → **Date Skunder: Export Python Package**).

It produces a `<name>-python/` folder containing:

- `data/*.csv` — **all** rows of every sheet; `data/index.json` — sheet index;
- `stats.json` — the full analysis result (business KPIs, stock, needs, CSV health, decision tree, insights);
- `analysis.py` — a **dependency-free** script (standard library only): `python analysis.py` prints a summary and writes `laporan.txt`, plus PNG charts when `matplotlib` is available;
- `streamlit_app.py` — an optional interactive dashboard (`streamlit run streamlit_app.py`);
- `README.md` + `requirements.txt` — how to run it.

```powershell
cd penjualan-python
python analysis.py                 # no installation required
python analysis.py --no-chart      # without charts
python analysis.py --sheet Sheet1  # a single sheet
```

### 🕷️ Spider: the visualization guide

The spider lives in the analysis panel (bottom right) with a **fully animated leg rig** (femur + tibia, alternating gait):

- **Drag** the spider to move it (position is remembered); a short click opens/closes its panel.
- Type an **instruction** in the “Instruksi…” field, e.g. *“jelaskan grafik pendapatan”*, *“sorot masalah kualitas data”*, or *“export ke python”*.
- The spider **walks** to the target without teleporting: the page scrolls **step by step** in sync with its legs, the section is **highlighted**, and every step is **explained** in the panel log and in its speech bubble.
- It can also **press safe page buttons** (Export DOCX/PDF/XLSX/PPTX/Workflow/Python, navigation links, stock filter tabs) when you ask it to.
- When idle it strolls around, taps a leg, blinks, and stays where you left it.
- Explanations are written by the **local LLM** (the same `llama-server` as Chat AI) using the page target list and data statistics. Prompt size follows `dateSkunder.llama.contextSize`, and if the model rejects the request because the context is full, it retries with a shorter prompt before falling back to local mode.
- 🔈 reads explanations aloud. Settings: `dateSkunder.spider.enabled`, `dateSkunder.spider.voice`, `dateSkunder.spider.maxSteps`, `dateSkunder.spider.allowActions`, `dateSkunder.spider.walkSpeed`.

## Spider-only execution, chat-only chat & Pet Skin 

### ⚡ The spider executes instead of only narrating

The spider is the extension's **only executor**: it **performs** every instruction on the analysis page.

- Commands such as *“export ke python”*, *“tampilkan stok kritis”*, *“urutkan tabel berdasarkan pendapatan”*, *“tambahkan grafik baru”*, *“cari data indomie”*, or *“ubah tipe grafik jadi line”* are really executed: the spider walks to the control, highlights it, then **clicks the button / switches the tab / changes the dropdown / types into the input**.
- Every action is **verified**: if the view does not change, it is retried once and then reported honestly as **✓ succeeded** or **✗ failed with the reason** — never claimed as successful when it was not.
- **▶ Run all features** walks through every section of the page and operates all safe controls in order, showing “step i/n” progress and a progress bar.
- The **⚡ Auto** toggle in the spider panel (setting `dateSkunder.spider.autoRun`, on by default) decides whether commands are executed immediately; turn it off for “explain only” mode.
- Controls that change or delete your data (delete note, reset layout, reload) run **only** when the instruction itself names that action — e.g. *“hapus catatan pertama”*.
- **Instructions are typed in the spider's own panel** (bottom right of the analysis page): it is the only door for execution, so Chat AI and the spider never fight over the same command.

### 🧠 Explanations come from the full model brain

- Plans, per-step narration, and the closing summary are written by the same `llama-server` as Chat AI, using the **full statistics context** of the open file; prompt size follows `dateSkunder.llama.contextSize`.
- After a run finishes, the model writes a short **explanation of the results** — what was done, which steps succeeded or failed, and what it means for your data — shown in the spider bubble and log (and read aloud when 🔈 is on).
- If `llama-server` is not running, the spider says so honestly instead of inventing a summary; start it with **▶** in the Chat AI sidebar or the LLAMA Server view.

### 💬 Chat AI is chat only

- The **Chat AI** sidebar answers questions about the analyzed file — text, tables, and voice — and nothing else.
- The old **⚡ Auto-eksekusi** toggle (`dateSkunder.ai.autoExecute`), the **🕷️ Kerjakan di halaman** button, and the execution cards are gone: execution lives entirely in the spider panel.

### 🎨 Pet Skin: change the spider's costume

The third view in the Date Skunder AI sidebar is now **Pet Skin** (it replaces the removed Flowchart Canvas):

- **Eight costumes** — Baja Klasik, Merah Menyala, Zamrud Rimba, Senja Jingga, Ungu Neon, Es Kristal, Emas Royal, and Ninja Bayangan — each with its own colours and accessory (crown, hat, bow, glasses, scarf, halo, headband).
- Every card shows a **live preview** drawn from the same colours and accessory shapes the spider uses on the page.
- Press **Pakai** (or run the Command Palette command): the choice is saved to `dateSkunder.spider.skin` and **broadcast to every open analysis page**, so the spider changes costume immediately — no reload needed.
- The spider panel has a **🎨 button** that jumps straight to this view.

Command Palette: **Date Skunder Pet: Buka Ganti Kostum Pet (Skin)** and **Date Skunder Pet: Ganti Kostum Pet (Pilih Cepat)**. Settings: `dateSkunder.spider.skin` plus the existing `dateSkunder.spider.*` options. (The old **Flowchart Canvas** view, its commands, and the `dateSkunder.flow.*` settings were removed.)

## Smarter chat, nonstop spider & complete charts (2.8.3)

### 🧠 Chat AI: grounded, duplicate-free, unlimited

- **Anti-hallucination rules** built into the system prompt: use only numbers/columns that exist in the data context, say *“datanya tidak tersedia di konteks ini”* when something is missing, show the short calculation behind derived values (margins, growth, differences), keep facts apart from estimates, and never invent columns, files or sources.
- **No duplicate replies**: a still-running answer is aborted before a new one starts, stream chunks from an old answer are ignored, and the final text is de-duplicated (identical paragraphs and consecutive repeated sentences are dropped) before it is displayed — and read aloud by the exact same cleaned text.
- **Unlimited conversation**: history is no longer cut at 12 messages. The prompt is filled with as many recent turns as fit `dateSkunder.llama.contextSize`, and older turns are compressed automatically into a **rolling summary** that travels with every new question — so a long session never loses its thread.

### 🔁 Spider: nonstop suggestions 24/7, tidier model output

- **🔁 Nonstop mode** (button in the spider panel; setting `dateSkunder.spider.nonstopSeconds`, default 90 s): the pet keeps producing a **new suggestion with details** — it is told which suggestions it already gave, so they do not repeat — and runs the safe supporting steps, continuously while the analysis page is open, until you switch it off.
- **Tidier LLM output**: the closing explanation now follows a fixed format (one conclusion line, then 2–4 `•` detail lines), is rendered as tidy rows in the pet log, is de-duplicated, and is read aloud without bullet symbols.
- **Stronger executor prompt**: the spider answers the whole instruction, answers questions straight from the data (highlighting the evidence), executes when asked, and keeps every step a new idea instead of repeating sentences.

### 📊 Complete chart set

- **7 new Chart Builder types**: 💧 Waterfall, ↕️ Diverging Bar, 📦 Boxplot (Q1–Q3 + median), 🌄 Stacked Area, 🌄 100% Stacked Area, 🎛️ Gauge (share of total), 📅 Timeline (Gantt).
- **3 new Advanced Visualizations**: Forecast (moving average + linear projection), Control Chart (moving average ±3σ), and a Data Completeness gauge.
- New starter cards: a stacked-area-by-series chart and a boxplot appear automatically when your data supports them, and a timeline appears when the file has two date columns.
- Everything is drawn with the bundled Chart.js build (no extra plugins): the charts are ready to run as soon as the file is opened.

## Spider shortcuts, locked skins & full export control (2.8.3)

### 🖱️ The spider can click every export — and type, scroll, search, and check

- The analysis toolbar now has **Export Jurnal (PDF)**, **Export Excel**, **Export PPT**, **Export Flow** (workflow image) and **Export JSON** buttons next to DOCX and Python — all using `btn-export-*` ids, so the spider presses them like any other control. (JSON is a new export format: `<name>-data.json` with the full analysis of every sheet.)
- Ask for *“export semua sekaligus”* and the spider clicks **every export button in one command** (batch execution) and reports ✓/✗ per button.
- **✓ Cek semua kontrol** (new panel button) presses every safe control once, verifies each result, and prints a tidy summary (`Pengecekan selesai: 12 kontrol OK`) with any failures named; inputs and dropdowns are only highlighted, so a check never changes your data.
- Wider target coverage: header/toolbar/Chart Builder buttons, range sliders, checkboxes, content-editable fields, note fields, sort headers, stock tabs and search boxes all belong to the target list. Labels carry their section (`KPI › tombol: Export Excel`) so the model picks precisely.
- If the model names a target that does not exist on the page, the spider **says so and skips it** — no invented controls, no silent pretending.

### ⌨️ Shortcuts for the spider

| Action | Shortcut | Command Palette |
| --- | --- | --- |
| Run all features (tour) | `Ctrl+Alt+T` | Date Skunder Spider: Jalankan Semua Fitur |
| Check all controls | `Ctrl+Alt+K` | Date Skunder Spider: Cek Semua Kontrol |
| Toggle nonstop work | `Ctrl+Alt+N` | Date Skunder Spider: Nyalakan/Matikan Kerja Nonstop |
| Stop the pet | `Ctrl+Alt+X` | Date Skunder Spider: Hentikan Pekerjaan |
| Export JSON | `Ctrl+Alt+J` | Date Skunder: Export JSON (Seluruh Analisis) |

Shortcuts are delivered to the **visible** analysis page only, so they never press buttons on a hidden tab, and the export/tour/check commands also appear as editor-title buttons on the Date Skunder preview.

### 🎨 Locked costumes & missions

- The Pet Skin view holds **13 costumes**; **only the default (Baja Klasik) is available at the start** and the other **12 are locked behind their own mission** (one mission per costume).
- Progress is saved in VS Code global state and shown in the view as a **mission list** (`✓ selesai`, `3/5`, plus the costume it unlocks). Locked cards show a 🔒, a dimmed preview, and the required mission; trying to pick one explains what to finish first, and a still-locked selection always falls back to the default costume.

### 🔁 Nonstop: tidy, whole-page analysis without repeats

- Every round targets the **next section that has not been analysed yet** (the pet logs `bagian 3/9 sudah dibahas — lanjut ke: …`); only when every section is covered does it switch to different angles (trend, outliers, correlation, data quality, recommendations).
- Suggestions already given are passed to the model as a “do not repeat” list, coverage is tracked per section, and each round writes a single compact line instead of dumping the whole prompt into the log.

## Chat input fix & every costume locked behind a mission (2.8.3)

### 🐞 Chat AI: “[object PointerEvent]” fixed

- The Chat AI **Kirim** button passed its click event into the message text, so the chat could send the literal string `[object PointerEvent]` to the model. The button now calls `doSend()` with no arguments, `doSend` accepts only *string* presets (voice results), and the extension refuses `[object …]` messages with a clear notice instead of asking the model about them.

### 🎨 Only the default costume is free — 12 missions open the rest

- **Baja Klasik (the default) is the only costume available from the start.** All other **12 costumes are locked**, one mission each, and while the selected costume is still locked the pet automatically uses the default — even if an older selection sits in Settings.
- The twelve missions: first export (Samurai Fajar), jurnal DOCX/PDF (Merah Menyala), flow image (Zamrud Rimba), 3 stock-tab switches (Senja Jingga), 5 typing/input actions (Ungu Neon), export JSON (Es Kristal), export PPT (Emas Royal), “export semua sekaligus” (Lava Magma), run the tour (Robot Chrome), run the check (Peri Kupu), 5 nonstop rounds (Hantu Bulan), and 25 successful actions in total (Ninja Bayangan).
- Progress lives in VS Code global state; the Pet Skin view lists every mission with its progress and the costume it unlocks.