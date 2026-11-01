# Change Log

All notable changes to the **Streamlit Launcher For VS Code** (Date Skunder) extension are documented in this file.

Check [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) for recommendations on how to structure this file.

## [Unreleased]
- **Grafik pratinjau di halaman CSV — bisa memilih fitur**: bagian baru **📊 Grafik Pratinjau Data** (tepat di bawah **Data Table**, sebelum **Chart Builder**) menampilkan setiap kolom sebagai chip fitur; centang kolom yang ingin digrafikkan. Tersedia 16 jenis grafik (batang, batang horizontal, garis, area, garis bertingkat, batang bertumpuk, 100% bertumpuk, Pareto, lollipop, pie, donut, polar area, radar, histogram + kumulatif, boxplot, scatter + trendline) plus pilihan **Nilai (Y)**, **Agregasi** (jumlah baris, total, rata-rata, median, min, maks, nilai unik), **Pecah per** (seri/grup), **Jumlah nilai** (Top N) dan **Urutan**. Grafik mengikuti kotak pencarian tabel saat **Ikuti filter tabel** dicentang, menyertakan statistik ringkas per fitur, dan pilihan fitur diingat per berkas + sheet. Jenis grafik yang tidak cocok untuk suatu kolom otomatis memakai jenis bawaan dengan keterangan. Kontrol panel ditandai `data-spider-skip` supaya pet Spider tidak mengubah pilihan fitur, dan grafik pratinjau tidak ikut ke daftar `charts` sehingga isi export DOCX/PDF/PPT tetap sama.
- **Publish works even when `articles` denies the account**: a 403 on the article collection now falls back to `community_artikel`, remembers the working collection, and reports it in the status bar instead of stopping at *Database: akses ditolak*. The 403 message names both collections. Covered by `npm run check:publish` against a local database stub.
- **No more empty pill above the analysis header**: `.sk-room-banner`, `.sk-room-toast` and `.sk-room-badge` now really hide with `[hidden]` (their `display` rules used to override it), so the room warning card only appears when a room is actually blocked.

## [2.10.2] - 2026-11-01

🚀 Performance & Optimization

• Size Converter Smooth: Smoother and more responsive size conversion workflow.
• Optimize Size: Enhanced size optimization algorithm to deliver a more lightweight application footprint.
• RAM Health: Improved memory management to maintain RAM stability and prevent memory leaks or crashes.
• PC & Laptop Health: Comprehensive system optimizations to boost performance, manage resources, and maintain overall hardware health.

🛠️ New Features & Core Systems

• Compile MSI: Added full support to directly compile your projects into .msi installer packages.
• Room Management System:
	• Create Room: Instantly spin up and host a new room with optimized server-side initialization.
	• Join Room: Connect to active rooms seamlessly with reduced latency and improved connection stability.

🛠️ Repair Bug

## [2.10.2] - 2026-10-30

🚀 Performance & Optimization

• Size Converter Smooth: Smoother and more responsive size conversion workflow.
• Optimize Size: Enhanced size optimization algorithm to deliver a more lightweight application footprint.
• RAM Health: Improved memory management to maintain RAM stability and prevent memory leaks or crashes.
• PC & Laptop Health: Comprehensive system optimizations to boost performance, manage resources, and maintain overall hardware health.

🛠️ New Features & Core Systems

• Compile MSI: Added full support to directly compile your projects into .msi installer packages.
• Room Management System:
	• Create Room: Instantly spin up and host a new room with optimized server-side initialization.
	• Join Room: Connect to active rooms seamlessly with reduced latency and improved connection stability.



## [2.9.8] - 2026-10-30
## [Unreleased]

### Added — Join Room (Socket.IO), right below Pet Skin

- **Join Room panel in the Pet Skin view**: start/stop the embedded **Socket.IO** server, copy the LAN address, pick the CSV/Excel file for the room, and join with a display name. The server starts automatically with the extension (`dateSkunder.room.autoStart`) and opens the **Join Room (Socket.IO)** terminal with the LAN address, rooms, and the devices that joined on your laptop (`devices`, `rooms`, `url`, `stop` commands).
- **One room = one file**: the first laptop fixes the room's file. A laptop joining with a different file is refused with “Room … already uses … — leave the room first”, and a preview page that shows a different file displays a warning banner with a **Keluar Room** button instead of sharing cursors.
- **Shared cursors with names and spiders**: every participant broadcasts the pointer position; the analysis page draws each remote cursor with the user's name chip and a mini spider using **that user's skin** (accessories included). Skin changes are pushed immediately to every participant.
- **CSV editing with preview and automatic replacement**: the room panel edits the joined CSV in a small table; changed cells get a preview (before → after) on every participant, then **Terapkan ke semua** writes the file, broadcasts it, and each laptop rewrites its own CSV automatically (`dateSkunder.room.autoApplyCsv`). Received files reload the open analysis page through the existing file watcher.
- **Settings**: `room.autoStart`, `room.port` (default 47900), `room.terminal`, `room.name`, `room.userName`, `room.host`, `room.showCursors`, `room.autoApplyCsv`. Commands `Date Skunder Room: Join Room (Socket.IO)` (`Ctrl+Shift+Alt+J`), `Keluar dari Room` (`Ctrl+Shift+Alt+Q`), and `Buka Terminal Server Socket.IO` (`Ctrl+Shift+Alt+W`).
- **Checks**: `npm run check:room` (CSV helpers + server protocol), `check:room-service` (two simulated laptops: join, device list, preview, automatic CSV replacement, backup, different-file rejection), `check:room-ui` (jsdom: Pet Skin panel + analysis-page cursor overlay), and `check:room-activate` (full `activate()` starts the server and registers the commands).

### Changed — Join Room: realtime yang halus & panel responsif

- **Kursor 60fps**: posisi peserta lain diinterpolasi dengan `requestAnimationFrame` (bukan lompat per pesan), dikirim maksimal ±30×/detik dan dilewati bila posisinya sama. Pesan kursor memakai mode *volatile* di Socket.IO, jadi saat jaringan lambat pesan lama dibuang, bukan menumpuk. Kompresi pesan kecil dimatikan (`perMessageDeflate: false`) untuk menekan latensi.
- **Tidak “patah” saat jaringan goyang**: sambungan menyambung ulang terus dengan backoff (bukan menyerah setelah 8 kali), mendaftarkan ulang peserta otomatis, dan mengirim ulang posisi kursor terakhir. Status nyata tampil realtime: 🟢 terhubung, 🟠 menyambung ulang (dengan nomor percobaan), 🔴 terputus — di panel Pet Skin maupun badge halaman analisis.
- **Tanpa render ulang berlebihan**: latensi hanya memperbarui angka, peta kursor di panel bergerak realtime lewat pesan ringan, dan pratinjau CSV tidak lagi menggambar ulang halaman analisis. Daftar perangkat hanya digambar ulang bila strukturnya berubah.
- **Panel responsif**: container query menyesuaikan sidebar sempit (±250–320 px) — input menumpuk, tombol ikut baris berikutnya, meta perangkat pindah ke baris kedua, sel tabel 78 px dengan scroll horizontal, peta kursor lebih pendek; pada panel lebar sel melebar dan peta meninggi. Chip nama kursor otomatis pindah sisi saat mendekati tepi kanan/bawah layar analisis.

### Added

- **Compile MSI now builds a website into a real installer**: the view takes a website link plus Tauri-style fields (nama aplikasi, nama pengembang, versi, folder instalasi, icon `.ico`/`.png`, ukuran jendela, shortcut Desktop, pemasangan per pengguna atau semua pengguna) and produces an `.msi`. The installer ships `app.exe` (a small launcher compiled with the built-in .NET Framework `csc.exe` that opens the link in an Edge app window, falling back to the default browser), `app.ico`, a `.url` fallback, Start Menu/Desktop shortcuts, and a Programs & Features entry with icon, publisher, version, and an About link to the site. WiX v3 `candle`/`light` builds the package; WiX is downloaded once (± 36 MB) when missing.
- **Quota 5 compile / 5 jam**: each build spends one quota; on the 5th attempt both **Compile MSI** and **Generate token** are blocked until the 5-hour window ends, with a live `h:mm:ss` countdown in the view and on the token website. Tokens cannot bypass the machine quota; only SHA-256 hashes are stored and the active token lives in `SecretStorage`.
- **Token website `api/token.html` updated**: live quota meter, cooldown banner with countdown, HTTP `429` when generation is attempted during the cooldown, and copy that explains the website → MSI flow. `npm run check:compile` now covers quota/window resets, form validation, ICO conversion, launcher + WiX source, the HTTP API, and the webview UI (138 checks).
- **AI Discussion moved to Firebase (`diskusi_ai`)**: Questions and answers in the AI ​​Discussion space are now written to a dedicated Firestore collection and **read back from the database** every time the view is loaded or refreshed (up to 300 messages), displayed with a **☁ database** badge. Previously, this space existed only in `data/data.txt`, which meant it would show **0 messages** when accessed from other windows or devices.
- **Source status in the AI ​​Discussion header**: Displays `☁ Databases · N messages` when connected to the database, or `💾 local log data/data.txt` when the database is disconnected or unreachable.
- **One-time import of legacy logs**: If the `diskusi_ai` collection is empty, existing `[AI DISCUSSION]` messages from `data/data.txt` (up to the 120 most recent) are uploaded to Firebase once, ensuring that past history remains accessible and the space no longer appears empty. The flag `dateSkunder.community.diskusiImported` prevents redundant imports (including after a rotation).
- **100-message rotation for AI Discussion**: When the `diskusi_ai` collection reaches `dateSkunder.community.maxMessages` (default: 100), all messages are deleted from Firebase, the view resets to 0 conversations, and the AI ​​session memory is cleared—while `data/data.txt` **remains intact as a log** (an archived copy is created in `data/arsip/`, and a line reading `# AI Discussion rotation …` is appended). - **JSON APIs** `/api/diskusi.json`, `/api/chat.json`, `/api/rooms.json`, and `/api/firebase.json?channel=diskusi` now serve AI Discussions directly from Firestore, with a local log fallback in case the database is inaccessible.
- **New automated checks** have been added: `npm run check:community` (covering the `diskusi_ai` Firebase collection, question submission, the 100-message rotation to the persistent log, and the log fallback mechanism) and `npm run check:chat-api` (covering AI Discussion document read/write operations and API endpoints).

### Changed

- **Room status now prioritizes Firebase**: The status bar no longer displays “0 messages read · `data/data.txt`”. Community rooms now show `☁ Firebase community_umum · N messages` (or `connecting…` during the initial load), while AI Discussion rooms show `☁ Firebase diskusi_ai · N messages`. The local log text only appears if the database is disabled, the database view is turned off, or the database is unreachable.
- The **⟳** (refresh) button now refreshes messages from Firebase while also re-reading the local log; the bottom line is labeled `📄 log:` to clarify that this file serves as an archive rather than the primary data source.
- `data/data.txt` now functions as a **log/archive** for both rooms (Community and AI Discussion) and as a **fallback** when the database is unavailable—it is no longer the sole repository for AI Discussion conversations.
- The **☁ JSON** download now includes AI Discussion messages along with the message count per room; descriptions for the `community.firebase`, `community.firebaseDisplay`, and `community.maxMessages` settings have been updated.

### Added

- **Community rooms now utilize Firebase again**: User messages and persona responses are sent to Firestore (`community_umum`, `community_bantuan`, `community_ide`), while messages from other members are fetched approximately every 20 seconds and displayed with a **☁ Firebase** badge. Can be disabled via `dateSkunder.community.firebase`; the view continues to function in local mode even without a network connection.
- **Complete archive in `data/data.txt`**: Every message is recorded in the project logs—including those received from Firebase, preserving their original timestamps—ensuring no data is lost when the view is closed, VS Code is restarted, or the database becomes unreachable.
- **Read-only JSON API** at `http://127.0.0.1:47831`: `/api/chat.json`, `/api/community.json`, `/api/diskusi.json`, `/api/chat-ai.json`, `/api/rooms.json`, `/api/firebase.json`, `/api/raw.txt`, and `/api/health.json`. Supports parameters such as `room`, `channel`, `limit`, `since`, and `download=1`. Can be disabled via `dateSkunder.community.api`; the port is configured via `community.apiPort` (`0` = automatic).
- **☁ JSON and 🔗 API buttons** in the Community Chat view: allow for downloading Firebase content as JSON and opening or copying the local API URL.
- **New command** `date-skunder.community.api` (available via the Command Palette) to open the JSON API.
- Automated checks via `npm run check:chat-api` (38 tests covering: Firestore document mapping, read/write operations to a mock server, `data/data.txt` archiving, all API endpoints, CORS, downloads, and 404 error handling).

### Changed

- **Improved quality of AI-generated messages**: Removed prefixes (e.g., “Spider AI: …”), corrected language tags when the model responds in a different script, and prevented the repetition of similar messages.
- **AI discussions no longer rely on a single template**: The system now detects the type of inquiry (e.g., causes, steps, numerical data, comparisons, suggestions, definitions, or general queries) and tailors the response format accordingly. The use of headings like "Key points," "Root cause," or "Status" is not forced; if an answer resembles a previous one, it is either rephrased from a different perspective or replaced with a distinct, honest response.
- The context of previous questions is provided as a reference (without being summarized), ensuring that follow-up questions—such as "Why is that?"—remain coherent without needing to repeat the prior conversation.
- **Cleaner chat layout**: includes day separators (Today/Yesterday/date) and groups consecutive messages from the same person.

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
