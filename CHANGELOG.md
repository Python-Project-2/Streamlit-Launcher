# Change Log

All notable changes to the **Streamlit Launcher For VS Code** (Date Skunder) extension are documented in this file.

Check [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) for recommendations on how to structure this file.

## [2.9.7] - Press Release 2026-10-19

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

## [2.7.7] - Release 2026-10-14

- **Voice in the Chat AI sidebar**: speak → text → answered by the model → read aloud automatically with a female voice (speechSynthesis with a system-voice fallback), a repeat button on every answer, automatic conversation mode (auto-listen), and a voice picker.
- Speech recognition uses the built-in Windows recognizer (`System.Speech`), so it runs offline without downloading anything; installed recognizers are listed when they differ from the requested language.
- New settings `dateSkunder.voice.*` (enabled, sttEngine, ttsEngine, autoSend, autoListen, listenSeconds, language, gender, voiceName, rate, pitch, volume) + the command **Date Skunder AI: Speak Now (Voice Input)**.
- **Python Export**: produces a `<name>-python/` package containing all data (`data/*.csv`), `stats.json`, `analysis.py` (dependency-free, writes `laporan.txt` + PNG charts when matplotlib is available), `streamlit_app.py`, `README.md`, and `requirements.txt`.
- Command **Date Skunder: Export Python Package (All Data + Scripts)** + a 🐍 button on the preview toolbar, in the context menu, the editor title, and the Command Palette.
- **Spider (the guide)**: pet-like walking animation in the visualization panel, an instruction panel with example commands, highlighting of the discussed section, and step-by-step explanations from the local LLM (`llama-server`) with a local fallback when no model runs.
- **Spider leg rigging**: eight two-segment legs (femur + tibia) animated per joint with an alternating gait; step speed follows travel distance, the body swings, and the eyes follow the walking direction (not just blinking).
- **Draggable spider**: hold and drag to move it; the position is remembered, and a short click still opens its panel.
- **The spider presses buttons for you**: plan steps support `action: "click"` — it walks to a safe button (Export DOCX/PDF/XLSX/PPTX/Workflow/Python, navigation links, stock filter tabs) and presses it; can be disabled with `dateSkunder.spider.allowActions`.
- **Gradual movement instead of instant jumps**: the page scrolls step by step in sync with the spider's legs (useful when heading to the top or bottom of the page), with a minimum duration per step.
- **LLM context is guarded**: the spider prompt is truncated according to `dateSkunder.llama.contextSize`, and if llama-server rejects the request because the context is full (`exceeds the available context size`), the request is retried with a shorter prompt before falling back to local mode.
- New settings `dateSkunder.spider.enabled`, `dateSkunder.spider.voice`, `dateSkunder.spider.maxSteps`, `dateSkunder.spider.allowActions`, `dateSkunder.spider.walkSpeed`.

## [2.6.8] - Release 2026-10-13

- Automatic `.gguf` detection across the whole computer storage: every drive/volume (C:, D:, E:, USB drives) is scanned, not just the home folder.
- Two-stage scanning: common folders (Downloads/Documents/Desktop/model app folders) appear within seconds, then all drives are searched in the background.
- Scanning is now asynchronous (fs.promises + concurrency limit) so VS Code no longer freezes; the old 4-second timeout was replaced with a configurable time budget.
- Scan results are cached, so the model list is available immediately when the extension opens and updates itself when a new model is downloaded.
- Added settings `dateSkunder.llama.autoScan` and `dateSkunder.llama.scanTimeoutSeconds`.
- Added the command **Date Skunder AI: Find .gguf Files Across All Storage** (with progress notification + cancel button) and a scan progress indicator in the Chat AI view.
- Default model locations expanded: LM Studio, GPT4All, Ollama, Jan, AnythingLLM, the HuggingFace cache, and OneDrive folders.

## [0.1.0] - Press Release 2026-10-07

### Added
- Initial release of **Streamlit Launcher For VS Code** (Date Skunder).
- Automated file preview and interactive data analysis for tabular formats (`.csv`, `.tsv`, `.xlsx`, `.xls`, `.xlsm`).
- Integrated Chart.js support for dynamic data visualization and chart generation.
- Notes and annotations feature to keep track of insights directly alongside datasets.
- PDF export functionality to generate reports out of analysis and notes.
- Context menu integration in the VS Code Explorer for quick file launching.
- Workspace recommendation configuration support via `.vscode/extensions.json` to prompt collaborators and users to install the extension automatically.

## [1.0.0] - Release 2026-10-07

- Full release
- Bug fixes
- Added support and bug fixes for XLSX, XLS, XLSM, and TSV
- Added support and bug fixes for the helper script
- Recommended extensions

## [2.0.0] - Release 2026-10-09

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Detection accuracy and security insights

## [2.4.5] - Release 2026-10-09

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Detection accuracy and security insights
- Mendeley-ready journal formatting (APA style)
- APA style layout
- Stock inventory items
- Market seller analysis
- Buy-market analysis

## [2.4.7] - Press Release 2026-11-10

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Detection accuracy and security insights
- Mendeley-ready journal formatting (APA style)
- APA style layout
- Stock inventory items
- Market seller analysis
- Buy-market analysis
- Fixed bugs in DOCX export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in PDF export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in Streamlit Launcher 2.5.7
- Added PDF export
- Added DOCX export
- Added PPTX export
- Added report export
- Added matrix analysis
- Added flowchart
- Added Decision Tree C4.5
- Added crosstabulation
- Added the chi-square test
- Added the normality test
- Model training tests
- Fixed bugs in security/accuracy analysis
- Fixed bugs in APA-style journal output
- Fixed analysis bugs
- Added workflow export
- Added buy-market analysis
- Added stock inventory items
- Added automatic file type detection
- Fixed PPTX bugs
- and more

## [2.5.7] - Release 2026-02-10

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Detection accuracy and security insights
- Mendeley-ready journal formatting (APA style)
- APA style layout
- Stock inventory items
- Market seller analysis
- Buy-market analysis
- Fixed bugs in DOCX export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in PDF export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in Streamlit Launcher 2.5.7
- Added PDF export
- Added DOCX export
- Added PPTX export
- Added report export
- Added matrix analysis
- Added flowchart
- Business KPI analysis
- Added Decision Tree C4.5
- Added crosstabulation
- Added the chi-square test
- Added the normality test
- Model training tests
- Added objective, purpose, and benefit information to the DOCX report
- Fixed bugs in security/accuracy analysis
- Fixed bugs in APA-style journal output
- Fixed analysis bugs
- Added workflow export
- Added buy-market analysis
- Added stock inventory items
- Added automatic file type detection
- Fixed PPTX bugs
- and more

## [2.6.7] - Release 2026-11-10

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Detection accuracy and security insights
- Mendeley-ready journal formatting (APA style)
- APA style layout
- Added objective, purpose, and benefit information to the DOCX report
- Stock inventory items
- Market seller analysis
- Business KPI analysis
- Buy-market analysis
- Fixed bugs in DOCX export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in PDF export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in Streamlit Launcher 2.5.7
- Added PDF export
- Added DOCX export
- Added PPTX export
- Added report export
- Added matrix analysis
- Added flowchart
- Added Decision Tree C4.5
- Added crosstabulation
- Added the chi-square test
- Added the normality test
- Model training tests
- Fixed bugs in security/accuracy analysis
- Fixed bugs in APA-style journal output
- Fixed analysis bugs
- Added workflow export
- Added buy-market analysis
- Added local LLM model analysis
- LLM detects vision
- LLM detects language
- LLM detects code
- LLM detects math
- LLM detects HTML
- LLM detects JSON
- LLM detects XML
- LLM detects CSV
- LLM detects XLSX
- LLM detects XLS
- LLM detects XLSM
- LLM detects DOCX
- LLM detects PDF
- LLM detects PPTX
- Added stock inventory items
- Added automatic file type detection
- Fixed PPTX bugs
- and more

## [2.5.7] - Release 2026-02-10

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Detection accuracy and security insights
- Mendeley-ready journal formatting (APA style)
- APA style layout
- Stock inventory items
- Market seller analysis
- Buy-market analysis
- Fixed bugs in DOCX export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in PDF export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in Streamlit Launcher 2.5.7
- Added PDF export
- Added DOCX export
- Added PPTX export
- Added report export
- Added matrix analysis
- Added flowchart
- Business KPI analysis
- Added Decision Tree C4.5
- Added crosstabulation
- Added the chi-square test
- Added the normality test
- Model training tests
- Added objective, purpose, and benefit information to the DOCX report
- Fixed bugs in security/accuracy analysis
- Fixed bugs in APA-style journal output
- Fixed analysis bugs
- Added workflow export
- Added buy-market analysis
- Added stock inventory items
- Added automatic file type detection
- Fixed PPTX bugs
- and more

## [2.6.8] - Release 2026-11-10

- Export to DOCX/Word, analysis, detection, vision, Decision Tree C4.5 algorithm
- Decision Tree C4.5 algorithm visualization
- Added visual animation
- Real simulation
- Real-time date animation
- Detection accuracy and security insights
- Mendeley-ready journal formatting (APA style)
- APA style layout
- Added objective, purpose, and benefit information to the DOCX report
- Stock inventory items
- Market seller analysis
- Business KPI analysis
- Buy-market analysis
- Fixed bugs in DOCX export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in PDF export, analysis, detection, vision, and Decision Tree C4.5
- Fixed bugs in Streamlit Launcher 2.5.7
- Added PDF export
- Added DOCX export
- Added PPTX export
- Added report export
- Added matrix analysis
- Added flowchart
- Added Decision Tree C4.5
- Added crosstabulation
- Added the chi-square test
- Added the normality test
- Model training tests
- Fixed bugs in security/accuracy analysis
- Fixed bugs in APA-style journal output
- Fixed analysis bugs
- Added workflow export
- Added buy-market analysis
- Added local LLM model analysis
- LLM detects vision
- LLM detects language
- LLM detects code
- LLM detects math
- LLM detects HTML
- LLM detects JSON
- LLM detects XML
- LLM detects CSV
- LLM detects XLSX
- LLM detects XLS
- LLM detects XLSM
- LLM detects DOCX
- LLM detects PDF
- LLM detects PPTX
- Added stock inventory items
- Added automatic file type detection
- Fixed PPTX bugs
- and more
