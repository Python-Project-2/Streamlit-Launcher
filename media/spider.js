/* Spider Date Skunder: pet eksekutor yang hidup di panel visualisasi.
   - Pet ini KHUSUS EKSEKUSI: Chat AI hanya bercakap-cakap, sedangkan semua aksi di halaman
     (berjalan, menyorot, menekan tombol/tab, mengubah dropdown, mengisi kolom) dikerjakan di sini.
   - Penjelasan langkah disusun otak model (llama-server dengan konteks penuh); setelah rencana
     selesai dijalankan, otak model juga menulis penjelasan hasilnya (pesan "spiderExplain") dan
     ditampilkan rapi: satu baris kesimpulan, lalu baris-baris detail.
   - Mode kerja nonstop (tombol 🔁): setiap ±dateSkunder.spider.nonstopSeconds detik pet meminta
     satu masukan + detail baru (tidak mengulang masukan lama) dan menjalankan langkah aman
     pendukungnya, terus-menerus selama halaman terbuka sampai dimatikan.
   - Rangka kaki bergerak (rigging femur + tibia) dengan pola langkah selang-seling seperti hewan.
   - Setiap aksi diverifikasi: kalau tampilan tidak berubah, aksi dicoba sekali lagi; bila tetap
     tidak ada perubahan, hasilnya dilaporkan jujur (✗) dan langkah dilanjutkan.
   - Bisa di-drag (tahan lalu geser); posisinya diingat.
   - Aksi yang mengubah/menghapus data pengguna hanya dijalankan bila kalimat perintahnya menyebut
     aksi itu (gerbang kedua setelah perencana di src/spider.ts).
   - Kostum (skin) datang dari view "Pet Skin": warna + potongan SVG aksesori dikirim lewat
     "spiderConfig" dan diterapkan ke rangka tanpa memuat ulang halaman.
   - Instruksi dikirim ke ekstensi lewat "spiderAsk"; rencana dibalas "spiderPlan", dan hasil tiap
     langkah dilaporkan balik lewat "spiderResult". */
(function () {
    if (window.SkunderSpider) { return; }

    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SIZE = 96;                        // kotak laba-laba di layar (px)
    const VIEW = 120;                       // ukuran viewBox rig

    /** Kontrol yang mengubah data pengguna → butuh penyebutan eksplisit pada perintah. */
    const DANGER_RE = /(hapus|delete|buang|remove|bersihkan|kosongkan|reset|atur ulang|muat ulang|reload|segarkan|hentikan|stop|clear|✕|🗑)/i;
    /** Kendali yang seharusnya langsung mengubah tampilan → hasil kliknya bisa diverifikasi. */
    const VIEW_CHANGE_RE = /(tab|filter|kritis|menipis|aman|overstock|kelas|urut|sort|kolom|add chart|tambah|new note|catatan|load|muat|more|baris)/i;

    // ── keadaan ─────────────────────────────────────────────────────────────
    let P = null;
    let enabled = true;
    let speakPref = false;
    let clickAllowed = true;
    let autoRun = true;                     // nyala = setiap instruksi langsung dieksekusi
    let walkSpeed = 1;
    let nonstopOn = false;                  // kerja nonstop: masukan + detail terus-menerus
    let nonstopSeconds = 90;                // jeda antar-putaran (dari pengaturan)
    let nonstopTimer = null;
    let nonstopKick = null;
    let nonstopSeen = [];                   // ringkasan masukan terakhir → tidak diulang
    let nonstopCovered = new Set();         // bagian halaman yang sudah dibahas (analisa menyeluruh, tanpa ulang)
    let nonstopPending = false;             // penanda putaran nonstop yang sedang berjalan
    let built = false;
    let open = true;
    let running = false;
    let runSeq = 0;
    let greeted = false;
    let idleNext = 0;
    let idSeq = 0;
    let targets = [];
    let skin = null;                         // kostum aktif dari view Pet Skin
    let pos = { x: 0, y: 0 };
    let facing = 1;                          // 1 = menghadap kanan, -1 = kiri
    let dragging = false;
    let dragMoved = false;
    let dragOffset = { x: 0, y: 0 };
    let motion = null;                       // langkah berjalan yang sedang berlangsung
    let gaitPhase = 0;                       // fase langkah (radian)
    let tap = { leg: -1, until: 0 };         // kaki yang mengetuk saat menunggu
    let lastFrame = 0;
    let rafId = null;
    let bubbleTimer = null;
    let lastRequest = '';                    // perintah yang sedang dijalankan (untuk gerbang bahaya)
    let lastPlan = null;                     // rencana terakhir (dipakai tombol “ulangi”)
    let focusEl = null;
    let focusTimer = null;

    let agent, bubble, panel, logBox, inputEl, noteEl, statusEl, chipRow, voiceBtn, autoBtn, tourBtn, barFill, barBox;
    let rig = null, core = null, legs = [], pupils = [];

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));

    // ── geometri rangka kaki (femur + tibia) ────────────────────────────────
    const LEG_SPEC = [
        { y: 50, out: [-0.95, -0.48], femur: 19, tibia: 22 },   // kiri, dari atas ke bawah
        { y: 58, out: [-1.00, -0.14], femur: 20, tibia: 23 },
        { y: 66, out: [-1.00, 0.18], femur: 20, tibia: 23 },
        { y: 74, out: [-0.92, 0.54], femur: 19, tibia: 22 },
    ];
    const GAIT_OFFSET = [0, Math.PI, 0, Math.PI];               // pola langkah selang-seling

    function norm(x, y) { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }

    /** Susun 8 kaki: titik pangkal (hip), lutut (knee), dan ujung (foot) + fase langkahnya. */
    function buildLegs() {
        const out = [];
        for (let side = 0; side < 2; side++) {
            const sign = side === 0 ? -1 : 1;                   // 0 = kiri, 1 = kanan
            LEG_SPEC.forEach((spec, i) => {
                const hip = { x: 60 + sign * 10, y: spec.y };
                // spec.out ditulis untuk sisi kiri (x negatif); sisi kanan dicerminkan.
                const dir1 = norm(spec.out[0] * (sign === -1 ? 1 : -1), spec.out[1]);
                const knee = { x: hip.x + dir1.x * spec.femur, y: hip.y + dir1.y * spec.femur };
                const dir2 = norm(dir1.x * 0.42, dir1.y * 0.25 + 1);
                const foot = { x: knee.x + dir2.x * spec.tibia, y: knee.y + dir2.y * spec.tibia };
                out.push({
                    dir: sign,
                    phase: GAIT_OFFSET[i] + (sign === 1 ? Math.PI : 0),
                    hip, knee, foot,
                });
            });
        }
        return out;
    }

    function rigMarkup(geo) {
        const kaki = geo.map((g, i) => `
                <g class="leg" data-i="${i}">
                    <g class="femur">
                        <path class="seg" d="M ${g.hip.x} ${g.hip.y} L ${g.knee.x} ${g.knee.y}" />
                        <g class="tibia">
                            <path class="seg" d="M ${g.knee.x} ${g.knee.y} L ${g.foot.x} ${g.foot.y}" />
                        </g>
                    </g>
                </g>`).join('');
        return `<svg class="sp-svg" viewBox="0 0 ${VIEW} ${VIEW}" aria-hidden="true">
            <g class="sp-rig">${kaki}
                <g class="sp-core">
                    <ellipse class="sp-body" cx="60" cy="64" rx="17" ry="19" />
                    <ellipse class="sp-back" cx="60" cy="67" rx="10" ry="11" />
                    <circle class="sp-head" cx="60" cy="42" r="11.5" />
                    <g class="sp-eyes">
                        <circle class="sp-eye" cx="55.4" cy="39" r="3.7" />
                        <circle class="sp-eye" cx="64.6" cy="39" r="3.7" />
                        <circle class="sp-pupil" cx="55.4" cy="39.6" r="1.8" />
                        <circle class="sp-pupil" cx="64.6" cy="39.6" r="1.8" />
                    </g>
                </g>
                <g class="sp-accessory"></g>
            </g>
        </svg>`;
    }

    // ── kostum (skin) dari view "Pet Skin" ────────────────────────────────
    /** Terapkan kostum: warna lewat variabel CSS + aksesori SVG di atas rangka. */
    function applySkin(next) {
        if (next) { skin = next; }
        if (!agent || !skin) { return; }
        const c = skin.colors || {};
        const map = {
            '--sp-leg': c.leg, '--sp-body': c.body, '--sp-back': c.back, '--sp-head': c.head,
            '--sp-outline': c.outline, '--sp-eye': c.eye, '--sp-pupil': c.pupil, '--sp-acc': c.accent,
        };
        Object.keys(map).forEach((k) => { if (map[k]) { agent.style.setProperty(k, map[k]); } });
        const holder = agent.querySelector('.sp-accessory');
        if (holder) { holder.innerHTML = skin.accessorySvg || ''; }
        agent.title = `Kostum: ${skin.name || skin.id} · tahan & geser untuk memindahkanku · klik untuk panel`;
    }

    // ── DOM ─────────────────────────────────────────────────────────────────
    function ensureDom() {
        if (built || !enabled) { return; }
        built = true;
        const geo = buildLegs();

        agent = document.createElement('div');
        agent.id = 'spider-agent';
        agent.innerHTML = rigMarkup(geo);
        agent.title = 'Tahan & geser untuk memindahkanku · klik untuk panel';
        document.body.appendChild(agent);
        applySkin();

        rig = agent.querySelector('.sp-rig');
        core = agent.querySelector('.sp-core');
        pupils = [...agent.querySelectorAll('.sp-pupil')];
        legs = [...agent.querySelectorAll('.leg')].map((el, i) => ({
            el,
            femur: el.querySelector('.femur'),
            tibia: el.querySelector('.tibia'),
            hip: geo[i].hip,
            knee: geo[i].knee,
            dir: geo[i].dir,
            phase: geo[i].phase,
            index: i,
        }));

        bubble = document.createElement('div');
        bubble.id = 'spider-bubble';
        bubble.hidden = true;
        document.body.appendChild(bubble);

        panel = document.createElement('div');
        panel.id = 'spider-panel';
        panel.innerHTML = `
            <div class="sp-head">
                <strong>🕷️ Spider</strong>
                <span class="sp-status" id="sp-status">siap</span>
                <button class="sp-ib on" id="sp-auto" title="Eksekusi otomatis: setiap instruksi langsung dikerjakan di halaman">⚡ Auto</button>
                <button class="sp-ib" id="sp-nonstop" title="Kerja nonstop: pet terus memberi masukan + detail baru dan menjalankan langkah aman pendukung selama halaman terbuka">🔁</button>
                <button class="sp-ib" id="sp-skin" title="Ganti kostum pet (buka view Pet Skin)">🎨</button>
                <button class="sp-ib" id="sp-community" title="Buka Community Chat (ruang obrolan komunitas)">💬</button>
                <button class="sp-ib" id="sp-voice" title="Bacakan penjelasan spider dengan suara">🔈</button>
                <button class="sp-ib" id="sp-clear" title="Bersihkan catatan">🧹</button>
                <button class="sp-ib" id="sp-close" title="Sembunyikan panel (laba-laba tetap jalan)">✕</button>
            </div>
            <div class="sp-bar" id="sp-bar" hidden><i id="sp-bar-fill"></i></div>
            <div class="sp-tools">
                <button class="sp-chip go" id="sp-tour" title="Spider menyusuri semua bagian halaman dan mengerjakan setiap kontrol aman">▶ Jalankan semua fitur</button>
                <button class="sp-chip" id="sp-again" title="Ulangi rencana terakhir">↻ Ulangi</button>
            </div>
            <div class="sp-chips" id="sp-chips"></div>
            <div class="sp-log" id="sp-log"></div>
            <div class="sp-input">
                <input id="sp-text" type="text" placeholder="Instruksi… mis. “export python” atau “jalankan semua fitur”" />
                <button class="btn primary" id="sp-send">Kirim</button>
            </div>
            <div class="sp-note" id="sp-note"></div>
        `;
        document.body.appendChild(panel);

        statusEl = document.getElementById('sp-status');
        logBox = document.getElementById('sp-log');
        inputEl = document.getElementById('sp-text');
        noteEl = document.getElementById('sp-note');
        chipRow = document.getElementById('sp-chips');
        voiceBtn = document.getElementById('sp-voice');
        autoBtn = document.getElementById('sp-auto');
        tourBtn = document.getElementById('sp-tour');
        barBox = document.getElementById('sp-bar');
        barFill = document.getElementById('sp-bar-fill');

        [
            ['▶ Jalankan semua fitur', 'jalankan semua fitur di halaman ini'],
            ['Tampilkan stok kritis', 'tampilkan tab stok kritis'],
            ['Tambah grafik baru', 'tambahkan grafik baru di chart builder'],
            ['Export Python', 'export data ini ke python'],
            ['Export DOCX', 'export jurnal ke docx'],
            ['Urutkan tabel', 'urutkan tabel berdasarkan nilai terbesar'],
            ['Jelaskan KPI utama', 'jelaskan KPI utama'],
        ].forEach(([teks, perintah]) => {
            const chip = document.createElement('button');
            chip.className = 'sp-chip';
            chip.textContent = teks;
            chip.onclick = () => ask(perintah);
            chipRow.appendChild(chip);
        });

        document.getElementById('sp-send').onclick = () => { ask(inputEl.value); inputEl.value = ''; };
        inputEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); ask(inputEl.value); inputEl.value = ''; }
        });
        document.getElementById('sp-close').onclick = () => setOpen(false);
        document.getElementById('sp-clear').onclick = () => { logBox.innerHTML = ''; addLog('note', 'Catatan dibersihkan.'); };
        document.getElementById('sp-again').onclick = () => {
            if (!lastPlan) { addLog('note', 'Belum ada rencana yang bisa diulang.'); return; }
            addLog('user', `(ulangi) ${lastRequest}`);
            void runPlan(lastPlan, { request: lastRequest, origin: 'ulang' });
        };
        tourBtn.onclick = () => ask('jalankan semua fitur di halaman ini', true);
        autoBtn.onclick = () => {
            autoRun = !autoRun;
            refreshAutoBtn();
            addLog('note', autoRun
                ? 'Mode eksekusi otomatis NYALA: aku langsung mengerjakan setiap instruksi di halaman.'
                : 'Mode eksekusi otomatis MATI: aku hanya berjalan dan menjelaskan.');
        };
        document.getElementById('sp-nonstop').onclick = () => setNonstop(!nonstopOn);
        document.getElementById('sp-skin').onclick = () => {
            if (P) { P.vscode.postMessage({ type: 'openPetSkin' }); }
        };
        const commBtn = document.getElementById('sp-community');
        if (commBtn) {
            commBtn.onclick = () => {
                if (P) { P.vscode.postMessage({ type: 'openCommunity' }); }
            };
        }
        voiceBtn.onclick = () => {
            speakPref = !speakPref;
            refreshVoiceBtn();
            if (!speakPref) { stopSpeech(); }
            addLog('note', speakPref ? 'Suara spider dinyalakan.' : 'Suara spider dimatikan.');
        };

        // Drag: tahan lalu geser; klik singkat tetap membuka/menutup panel.
        agent.addEventListener('pointerdown', beginDrag);
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', endDrag);
        window.addEventListener('pointercancel', endDrag);

        const st = safeState();
        const awal = st.spiderPos && typeof st.spiderPos.x === 'number' ? st.spiderPos : null;
        pos = awal
            ? { x: clamp(awal.x, 8, Math.max(8, window.innerWidth - SIZE - 8)), y: clamp(awal.y, 8, Math.max(8, window.innerHeight - SIZE - 10)) }
            : { x: window.innerWidth - SIZE - 26, y: window.innerHeight - SIZE - 34 };
        setPos(pos.x, pos.y);

        setOpen(open, true);
        refreshVoiceBtn();
        refreshAutoBtn();
        refreshNonstopBtn();
        startLoop();
    }

    function setOpen(next, silent) {
        open = !!next;
        if (!panel) { return; }
        panel.classList.toggle('hidden', !open);
        const st = safeState();
        st.spiderOpen = open;
        if (P) { P.vscode.setState(st); }
        if (open && !silent && !greeted) { greet(); }
    }

    function greet() {
        greeted = true;
        addLog('spider', 'Hai, aku Spider. Tulis perintah untuk kujalankan, atau pertanyaan untuk kujawab dari data ini.');
    }

    function safeState() {
        try { return (P && P.vscode.getState()) || {}; } catch (e) { return {}; }
    }

    // ── posisi, langkah, dan gaya badan ─────────────────────────────────────
    function setPos(x, y) {
        // Pengaman terakhir: posisi selalu di dalam area pandang, apa pun yang memanggilnya.
        pos = {
            x: clamp(x, 6, Math.max(6, window.innerWidth - SIZE - 6)),
            y: clamp(y, 6, Math.max(6, window.innerHeight - SIZE - 8)),
        };
        if (agent) {
            agent.style.left = Math.round(pos.x) + 'px';
            agent.style.top = Math.round(pos.y) + 'px';
        }
        placeBubble();
    }

    function placeBubble() {
        if (!bubble || bubble.hidden) { return; }
        bubble.style.left = Math.round(clamp(pos.x - 118, 8, Math.max(8, window.innerWidth - 344))) + 'px';
        bubble.style.top = Math.round(clamp(pos.y - 98, 8, window.innerHeight - 60)) + 'px';
    }

    /** Berjalan ke titik tujuan dengan durasi minimum supaya tidak terlihat melompat. */
    function walkTo(x, y, minMs) {
        return new Promise((resolve) => {
            if (!agent) { resolve(); return; }
            if (REDUCED) { setPos(x, y); resolve(); return; }
            const from = { x: pos.x, y: pos.y };
            const jarak = Math.hypot(x - from.x, y - from.y);
            if (jarak < 3) { resolve(); return; }
            if (x < from.x - 6) { facing = -1; } else if (x > from.x + 6) { facing = 1; }
            agent.classList.toggle('flip', facing === -1);
            const durasi = clamp((jarak / (600 * walkSpeed)) * 1000, minMs || 460, 3600);
            // Langkah kaki diselaraskan dengan jarak: 1 langkah ≈ 170 px, jadi kaki mengayun wajar
            // (bukan berputar terlalu cepat) dan tetap sinkron dengan kecepatan berjalan.
            const laju = clamp((2 * Math.PI * (jarak / 170)) / (durasi / 1000), 2.4, 26);
            motion = { from, to: { x, y }, t0: performance.now(), durasi, laju, resolve };
        });
    }

    function hop() {
        return new Promise((resolve) => {
            if (!agent || REDUCED) { resolve(); return; }
            agent.classList.add('hop');
            setTimeout(() => { agent.classList.remove('hop'); resolve(); }, 640);
        });
    }

    /** Satu loop untuk segalanya: fase langkah, gerak badan, dan perilaku menunggu. */
    function startLoop() {
        if (rafId) { return; }
        lastFrame = performance.now();
        const frame = (now) => {
            rafId = requestAnimationFrame(frame);
            // Batas longgar (0,12 s) supaya langkah kaki tetap maju walau frame sedang jarang.
            const dt = Math.min(0.12, Math.max(0.001, (now - lastFrame) / 1000));
            lastFrame = now;
            if (document.hidden) { return; }

            const berjalan = !!motion;
            gaitPhase += dt * (berjalan ? (motion.laju || 10) * walkSpeed : 0.85 * walkSpeed);

            if (motion) {
                const t = Math.min(1, (now - motion.t0) / motion.durasi);
                const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                setPos(
                    motion.from.x + (motion.to.x - motion.from.x) * e,
                    motion.from.y + (motion.to.y - motion.from.y) * e,
                );
                if (t >= 1) {
                    setPos(motion.to.x, motion.to.y);
                    const selesai = motion.resolve;
                    motion = null;
                    if (selesai) { selesai(); }
                }
            } else if (!dragging && now > idleNext && !running) {
                idleNext = now + 6000 + Math.random() * 8000;
                if (Math.random() < 0.35) { tap = { leg: Math.floor(Math.random() * 8), until: now + 520 }; }
                if (Math.random() < 0.22) { void hop(); }
                else { void berkeliling(); }
            }

            applyPose(now);
        };
        rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    async function berkeliling() {
        if (!enabled || !agent || motion || dragging || running || document.hidden) { return; }
        const nx = clamp(pos.x + (Math.random() * 320 - 160), 10, Math.max(10, window.innerWidth - SIZE - 10));
        const ny = clamp(pos.y + (Math.random() * 220 - 110), 10, Math.max(10, window.innerHeight - SIZE - 14));
        if (Math.hypot(nx - pos.x, ny - pos.y) < 44) { return; }
        await walkTo(nx, ny);
    }

    /** Terapkan rangka kaki: ayun femur, angkat tibia, goyangkan badan (rigging). */
    const tulisan = new WeakMap();
    function setAttr(el, nama, nilai) {
        const kunci = nama + '=' + nilai;
        if (tulisan.get(el) === kunci) { return; }            // nilai sama → jangan sentuh DOM
        tulisan.set(el, kunci);
        el.setAttribute(nama, nilai);
    }

    function applyPose(now) {
        if (!legs.length) { return; }
        const berjalan = !!motion;
        const ayun = berjalan ? 11.5 : 3.4;
        const angkat = berjalan ? 13 : 4.2;
        legs.forEach((leg) => {
            let femurAngle = Math.sin(gaitPhase + leg.phase) * ayun * leg.dir;
            let tibiaAngle = ((Math.sin(gaitPhase + leg.phase + 1.15) * 0.5 + 0.5) * angkat) * leg.dir;
            if (dragging) {                                  // gaya menggantung saat di-drag
                femurAngle = -18 * leg.dir;
                tibiaAngle = 30 * leg.dir;
            } else if (tap.leg === leg.index && now < tap.until) {
                femurAngle += Math.sin((tap.until - now) / 45) * 10 * leg.dir;
            }
            setAttr(leg.femur, 'transform', `rotate(${femurAngle.toFixed(1)} ${leg.hip.x} ${leg.hip.y})`);
            setAttr(leg.tibia, 'transform', `rotate(${tibiaAngle.toFixed(1)} ${leg.knee.x} ${leg.knee.y})`);
        });
        const goyang = dragging ? Math.sin(now / 80) * 6 : Math.sin(gaitPhase) * (berjalan ? 2.8 : 0.9);
        const naik = dragging ? 0 : Math.sin(gaitPhase * 2) * (berjalan ? 1.8 : 0.5);
        if (rig) { setAttr(rig, 'transform', `translate(0 ${naik.toFixed(1)})`); }
        if (core) { setAttr(core, 'transform', `rotate(${goyang.toFixed(1)} 60 66)`); }
        const lihat = facing < 0 ? -1.3 : 1.3;
        pupils.forEach((p) => setAttr(p, 'transform', `translate(${lihat} 0)`));
    }

    // ── drag ────────────────────────────────────────────────────────────────
    function beginDrag(ev) {
        if (ev.button !== undefined && ev.button !== 0) { return; }
        // Berhenti dari langkah yang sedang berjalan supaya posisi tidak ditarik kembali.
        if (motion) {
            const selesai = motion.resolve;
            motion = null;
            if (selesai) { selesai(); }
        }
        dragging = true;
        dragMoved = false;
        dragOffset = { x: ev.clientX - pos.x, y: ev.clientY - pos.y };
        agent.classList.add('dragging');
        try { agent.setPointerCapture(ev.pointerId); } catch (e) { }
        ev.preventDefault();
    }

    function onDragMove(ev) {
        if (!dragging) { return; }
        const nx = clamp(ev.clientX - dragOffset.x, 6, Math.max(6, window.innerWidth - SIZE - 6));
        const ny = clamp(ev.clientY - dragOffset.y, 6, Math.max(6, window.innerHeight - SIZE - 8));
        if (Math.hypot(nx - pos.x, ny - pos.y) > 4) { dragMoved = true; }
        if (dragMoved) { setPos(nx, ny); }
    }

    function endDrag() {
        if (!dragging) { return; }
        dragging = false;
        agent.classList.remove('dragging');
        if (!dragMoved) { setOpen(!open); return; }
        const st = safeState();
        st.spiderPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
        if (P) { P.vscode.setState(st); }
    }

    // id → label: diingat lintas pengumpulan ulang supaya target lama masih bisa dipulihkan.
    const labelById = new Map();

    // ── target visualisasi & aksi ───────────────────────────────────────────
    function mkTarget(el, label, kind, click, group) {
        if (!el.dataset.spiderId) { el.dataset.spiderId = 'tg' + (++idSeq); }
        const teks = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 90);
        labelById.set(el.dataset.spiderId, teks);
        return {
            id: el.dataset.spiderId,
            label: teks,
            kind,
            click: !!click,
            group,
            danger: !!click && DANGER_RE.test(teks),
            el,
        };
    }

    /**
     * Label terbaca untuk sebuah kontrol.
     * Tombol berikon saja (mis. “✕”) diberi judulnya supaya labelnya tetap bermakna, dan dropdown
     * dilabeli nama kolomnya + nilai yang sedang dipilih (bukan gabungan seluruh opsi).
     */
    function labelOf(el) {
        const teks = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        const judul = String(el.getAttribute('title') || '').trim();
        const plc = String(el.getAttribute('placeholder') || '').trim();
        if (el.tagName === 'SELECT') {
            const nama = String(el.dataset.k || el.name || 'pilihan').trim();
            return `${nama} = ${String(el.value || (el.options[0] && el.options[0].value) || '').trim()}`;
        }
        if (teks.length >= 3) { return teks; }
        if (judul) { return (teks ? teks + ' ' : '') + judul; }
        return teks || judul || plc || String(el.getAttribute('aria-label') || '').trim();
    }

    /**
     * Tombol/tautan/kontrol yang boleh dijalankan spider (di luar panel spider sendiri).
     * Kontrol berisiko (mengubah/menghapus data) tetap dijaga gerbang “danger” saat dijalankan.
     */
    function usable(el) {
        if (!el || !el.isConnected) { return false; }
        if ((panel && panel.contains(el)) || (agent && agent.contains(el))) { return false; }
        if (el.disabled) { return false; }
        // Kontrol bertanda khusus (mis. pemilih fitur grafik pratinjau) tidak dijalankan otomatis.
        if (el.closest && el.closest('[data-spider-skip]')) { return false; }
        const id = el.id || '';
        if (/^btn-(export|visit)-/.test(id)) { return true; }
        if (el.tagName === 'A' && (el.closest('nav') || el.classList.contains('link-bar'))) { return true; }
        if (el.classList && (el.classList.contains('s-tab') || el.classList.contains('stock-load-more'))) { return true; }
        if (el.matches && el.matches('th[data-i], [data-act], [data-k], .note-del-btn, .note-title-input, .note-textarea, .note-cat-select, .stock-search, [contenteditable="true"]')) { return true; }
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') { return true; }
        // Semua tombol halaman (header, toolbar chart builder, panel kontrol) boleh dijalankan.
        if (el.tagName === 'BUTTON' && el.closest && el.closest('.sec, .head, .btoolbar, .bctl, .toolbar')) { return true; }
        return false;
    }

    /** Jenis kontrol → menentukan cara eksekusi dan verifikasinya. */
    function kindOf(el) {
        if (el.classList && el.classList.contains('s-tab')) { return 'tab'; }
        if (el.matches && el.matches('th[data-i]')) { return 'sort'; }
        if (el.tagName === 'SELECT') { return 'select'; }
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { return 'input'; }
        if (el.tagName === 'A') { return 'link'; }
        return 'button';
    }

    /** Kumpulkan target halaman: kontrol yang bisa dijalankan + bagian/kartu/KPI yang bisa disorot. */
    function collectTargets() {
        const list = [];
        if (!P || !P.app) { return list; }
        // idSeq sengaja TIDAK direset: id target harus unik seumur halaman. Bila direset, elemen baru
        // bisa memakai id lama milik elemen lain sehingga pet menekan kontrol yang salah.

        const secJudul = new Map();
        P.app.querySelectorAll('section.sec').forEach((sec) => {
            const h = sec.querySelector('h2');
            secJudul.set(sec.id || '', String(h ? h.textContent : (sec.id || '')).replace(/[^\w\sÀ-ÿ-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20));
        });

        const grupDari = (el) => {
            const sec = el.closest && el.closest('section.sec');
            if (sec) { return sec.id || undefined; }
            if (el.closest && el.closest('.head')) { return 'head'; }
            if (el.closest && el.closest('nav')) { return 'nav'; }
            return undefined;
        };

        // Kontrol interaktif, urut sesuai posisinya di halaman. Label diberi awalan bagian supaya
        // model tahu kontrol itu ada di mana (mis. “KPI › tombol: Export Excel”) — bukan menebak.
        P.app.querySelectorAll('button, a, select, input, textarea, [contenteditable="true"], .s-tab, th[data-i]').forEach((el) => {
            if (!usable(el)) { return; }
            const label = labelOf(el);
            if (!label && el.tagName !== 'SELECT' && el.tagName !== 'INPUT') { return; }
            const kind = kindOf(el);
            const nama = label || (kind === 'select' ? 'pilihan' : 'kolom isian');
            const prefiks = kind === 'tab' ? 'tab: ' : kind === 'sort' ? 'urut kolom: ' : kind === 'input' ? 'kolom isian: ' : kind === 'select' ? 'pilihan: ' : el.tagName === 'A' ? 'tautan: ' : 'tombol: ';
            const grup = grupDari(el);
            const bagian = grup === 'head' ? 'header' : (grup === 'nav' ? 'nav' : (grup && secJudul.get(grup) ? secJudul.get(grup) : ''));
            list.push(mkTarget(el, (bagian ? `${bagian} › ` : '') + prefiks + nama, kind, true, grup));
        });

        // Bagian halaman (target berjalan untuk tur otomatis).
        P.app.querySelectorAll('section.sec').forEach((sec) => {
            const h = sec.querySelector('h2');
            list.push(mkTarget(sec, `${sec.id || 'bagian'} — ${h ? h.textContent.trim() : ''}`, 'section', false, sec.id || undefined));
        });

        let kartu = 0;
        P.app.querySelectorAll('.card').forEach((card) => {
            if (kartu >= 60) { return; }
            const h = card.querySelector('h3');
            if (!h) { return; }
            kartu++;
            list.push(mkTarget(card, `kartu: ${h.textContent.trim()}`, 'card', false, grupDari(card)));
        });

        let kpi = 0;
        P.app.querySelectorAll('.kpi').forEach((tile) => {
            if (kpi >= 24) { return; }
            const span = tile.querySelector('span');
            const nilai = tile.querySelector('b');
            if (!span) { return; }
            kpi++;
            list.push(mkTarget(tile, `KPI ${span.textContent.trim()}${nilai ? ` = ${nilai.textContent.trim()}` : ''}`, 'kpi', false, grupDari(tile)));
        });

        return list;
    }

    /**
     * Kemiripan dua label (0–1) dari kata bermakna yang sama — dipakai memulihkan target setelah
     * halaman digambar ulang sehingga id lama tidak ada lagi.
     */
    function skorLabel(a, b) {
        const kata = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter((k) => k.length >= 4));
        const ka = kata(a);
        const kb = kata(b);
        if (!ka.size || !kb.size) { return 0; }
        let sama = 0;
        ka.forEach((k) => { if (kb.has(k)) { sama += 1; } });
        return sama / Math.min(ka.size, kb.size);
    }

    /** Target di halaman saat ini yang paling mirip dengan label target lama. */
    function targetSerupa(label) {
        let best = null;
        for (const t of targets) {
            if (!t.el || !document.contains(t.el)) { continue; }
            const skor = skorLabel(label, t.label);
            if (skor >= 0.6 && (!best || skor > best.skor)) { best = { target: t, skor }; }
        }
        return best ? best.target : null;
    }

    /**
     * Target + elemen untuk sebuah id. Bila halaman sudah digambar ulang (id lama hilang), target
     * dipulihkan lewat label yang sama — jadi eksekusi tetap menuju kontrol yang dimaksud.
     */
    function resolveTarget(id) {
        if (!id) { return { el: null, target: null }; }
        const dari = targets.find((t) => t.id === id);
        if (dari && dari.el && document.contains(dari.el)) { return { el: dari.el, target: dari }; }
        let dom = null;
        try { dom = document.querySelector(`[data-spider-id="${CSS.escape(String(id))}"]`); } catch (e) { dom = null; }
        if (dom) { return { el: dom, target: dari || targets.find((t) => t.el === dom) || null }; }
        // Label diingat dari pemindaian sebelumnya (labelById), jadi pemulihan tetap bekerja walau
        // pencarian ini sudah beberapa kali memicu pengumpulan ulang target.
        const label = dari ? dari.label : labelById.get(id);
        if (label) {
            refreshTargets();
            const baru = targetSerupa(label);
            if (baru && baru.el) { return { el: baru.el, target: baru }; }
        }
        return { el: null, target: dari || null };
    }

    function targetEl(id) {
        return resolveTarget(id).el;
    }

    /** Bawa elemen ke area pandang dengan gulir bertahap (bukan lompatan instan). */
    async function bringIntoView(el, maxMs) {
        const bisaGulir = () => (document.documentElement.scrollHeight - window.innerHeight) > 8;
        if (!bisaGulir()) { return true; }
        const t0 = performance.now();
        let takBergerak = 0;
        for (let i = 0; i < 30; i++) {
            if (performance.now() - t0 > (maxMs || 6500)) { break; }
            const r = el.getBoundingClientRect();
            const delta = (r.top + r.height / 2) - window.innerHeight * 0.45;
            if (Math.abs(delta) < 120) { return true; }
            const sebelum = window.scrollY;
            const langkah = clamp(delta * 0.45, -300, 300);
            window.scrollBy(0, langkah);
            const ny = clamp(pos.y + (langkah < 0 ? -46 : 46) * (Math.abs(langkah) / 140), 10, Math.max(10, window.innerHeight - SIZE - 14));
            await walkTo(clamp(pos.x + (Math.random() * 70 - 35), 10, Math.max(10, window.innerWidth - SIZE - 10)), ny, 240);
            await wait(120);
            if (Math.abs(window.scrollY - sebelum) < 2) {
                takBergerak++;
                if (takBergerak >= 4) { return true; }   // halaman tidak bisa digulir lagi
            } else {
                takBergerak = 0;
            }
        }
        return false;
    }

    async function goTo(id) {
        const el = targetEl(id);
        if (!el) { return false; }
        await bringIntoView(el, 6500);
        const r = el.getBoundingClientRect();
        const x = clamp(r.left + Math.min(r.width / 2, 180) - SIZE / 2, 8, Math.max(8, window.innerWidth - SIZE - 8));
        const y = clamp(r.top + Math.min(r.height / 2, 130) - SIZE / 2, 8, Math.max(8, window.innerHeight - SIZE - 10));
        await walkTo(x, y);
        return true;
    }

    async function highlight(id) {
        const el = targetEl(id);
        if (!el) { return; }
        clearFocus();
        focusEl = el;
        el.classList.add('spider-focus');
        await hop();
        focusTimer = setTimeout(clearFocus, REDUCED ? 900 : 2600);
        await wait(REDUCED ? 900 : 2200);
    }

    function clearFocus() {
        if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
        if (focusEl) { focusEl.classList.remove('spider-focus'); focusEl = null; }
    }

    // ── eksekusi nyata + verifikasi ─────────────────────────────────────────
    /** Hitung perubahan DOM selama ms — dipakai untuk memastikan aksi benar-benar berpengaruh. */
    function watchMutations(ms) {
        return new Promise((resolve) => {
            let jumlah = 0;
            let obs = null;
            try {
                obs = new MutationObserver((muts) => { jumlah += muts.length; });
                obs.observe(P.app, { childList: true, subtree: true, attributes: true, characterData: true });
            } catch (e) { /* MutationObserver tidak ada → anggap berubah */ jumlah = -1; }
            setTimeout(() => {
                try { if (obs) { obs.disconnect(); } } catch (e) { }
                resolve(jumlah);
            }, ms);
        });
    }

    /** Apakah langkah ini seharusnya langsung mengubah tampilan (bisa diverifikasi). */
    function expectViewChange(target) {
        const teks = `${target.kind} ${target.label}`;
        if (target.kind === 'tab' || target.kind === 'sort') { return true; }
        return VIEW_CHANGE_RE.test(teks) && !/export|unduh|website|tautan|online|pypi|download/i.test(teks);
    }

    function fire(el, jenis) {
        try {
            el.dispatchEvent(new MouseEvent(jenis, { bubbles: true, cancelable: true, view: window }));
        } catch (e) { /* browser lama → lewati */ }
    }

    /** Penanda “aktif” pada tab/tombol berkelompok; null = kelompok ini tidak memakai penanda. */
    function statusAktif(el) {
        if (!el || !el.classList) { return null; }
        const kelas = ['active', 'aktif', 'selected', 'is-active', 'on'];
        const punya = (n) => !!(n && n.classList && kelas.some((k) => n.classList.contains(k)));
        let pakaiPenanda = punya(el);
        if (!pakaiPenanda && el.parentElement) {
            pakaiPenanda = [...el.parentElement.children].some(punya);
        }
        if (!pakaiPenanda) { return null; }
        return kelas.some((k) => el.classList.contains(k))
            || el.getAttribute('aria-selected') === 'true'
            || el.getAttribute('aria-pressed') === 'true';
    }

    /** Elemen lain yang bisa diklik di dalam/sekitar target (mis. label vs tombolnya). */
    function elemenAlternatif(el) {
        const kandidat = [
            el.querySelector ? el.querySelector('button, [role="button"], a, input[type="checkbox"]') : null,
            el.closest ? el.closest('button, [role="button"]') : null,
            el.parentElement && el.parentElement.querySelector ? el.parentElement.querySelector('button, [role="button"]') : null,
        ].filter((x) => x && x !== el && document.contains(x) && !x.disabled);
        return kandidat[0] || null;
    }

    /** Tekan sebuah kontrol dan pastikan efeknya; coba lagi, lalu coba elemen alternatifnya. */
    async function doClick(el, target) {
        const cekPerubahan = expectViewChange(target);
        const cekAktif = target.kind === 'tab' || (el.classList && (el.classList.contains('tab') || el.classList.contains('s-tab')));
        const nilaiPercobaan = (percobaan, jumlah, aktif) => (percobaan > 1 ? 'tampilan berubah setelah percobaan kedua' : 'tampilan berubah')
            + (aktif === true ? ' dan kontrol menjadi aktif' : '');
        for (let percobaan = 1; percobaan <= 2; percobaan++) {
            const pantau = cekPerubahan ? watchMutations(700) : null;
            let error = null;
            try {
                if (percobaan === 1) { el.click(); } else { fire(el, 'mousedown'); fire(el, 'mouseup'); fire(el, 'click'); el.click(); }
            } catch (e) { error = e; }
            const jumlah = pantau ? await pantau : await wait(260).then(() => 1);
            if (error) { return { ok: false, detail: `klik gagal: ${error.message || error}` }; }
            const aktif = cekAktif ? statusAktif(el) : null;
            if (cekPerubahan && jumlah !== 0 && (aktif === null || aktif)) {
                return { ok: true, detail: nilaiPercobaan(percobaan, jumlah, aktif) };
            }
            if (!cekPerubahan) { return { ok: true, detail: 'aksi dikirim ke halaman' }; }
        }
        // Dua percobaan gagal → coba elemen alternatif di dalam/sekitar target (mis. label vs tombol).
        const alt = elemenAlternatif(el);
        if (alt) {
            const pantau = cekPerubahan ? watchMutations(700) : null;
            try { alt.click(); } catch (e) { /* lanjut ke laporan gagal */ }
            const jumlah = pantau ? await pantau : await wait(260).then(() => 1);
            const aktif = cekAktif ? statusAktif(alt) : null;
            if (!cekPerubahan || jumlah !== 0 || aktif) {
                return { ok: true, detail: 'efek muncul setelah menekan elemen alternatif di dalam target' };
            }
        }
        return {
            ok: false,
            detail: cekAktif
                ? 'kontrol tidak menjadi aktif setelah dua kali percobaan (mungkin bagian ini sedang tidak bisa diubah)'
                : 'tampilan tidak berubah setelah dua kali percobaan',
        };
    }

    /** Isi kolom isian / ubah pilihan dropdown lalu pastikan nilainya benar-benar tersimpan. */
    async function doInput(el, target, value) {
        const teks = String(value || '').trim();
        if (!teks) {
            // Tanpa nilai: fokuskan kolomnya — itu yang diminta “tekan kolom isian”. Bukan gagal palsu.
            try { el.focus(); el.click(); } catch (e) { /* fokus tidak wajib berhasil */ }
            return { ok: true, detail: 'kolom difokuskan — nilai belum disebutkan; tulis perintahnya lengkap (mis. “cari indomie”) bila mau aku isi' };
        }
        // Pantau halaman sejak sebelum nilainya dikirim, supaya efek saringan terlihat nyata.
        const pantau = watchMutations(650);
        try {
            el.focus();
            if (el.tagName === 'SELECT') {
                const opsi = [...el.options].find((o) => String(o.value).toLowerCase() === teks.toLowerCase())
                    || [...el.options].find((o) => String(o.textContent).toLowerCase().includes(teks.toLowerCase()));
                if (!opsi) { return { ok: false, detail: `pilihan “${teks}” tidak ada di dropdown` }; }
                el.value = opsi.value;
            } else if (el.tagName === 'INPUT' && el.type === 'checkbox') {
                el.checked = !/^(false|off|0|tidak|jangan|nonaktif)$/i.test(teks);
                try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
            } else if (el.tagName === 'INPUT' && el.type === 'range') {
                const angka = Number(String(teks).replace(',', '.'));
                if (!Number.isFinite(angka)) { return { ok: false, detail: 'nilai angka tidak disebutkan untuk slider' }; }
                el.value = String(angka);
                try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
            } else {
                el.value = teks;
                try {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                } catch (e) { }
            }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            const jumlah = await pantau;
            const terisi = String(el.value) === teks || el.tagName === 'SELECT';
            if (terisi) { return { ok: true, detail: `nilai diisi: ${teks.slice(0, 40)}${jumlah > 0 ? ' — tampilan ikut berubah (hasil tersaring)' : ''}` }; }
            return { ok: true, detail: `nilai dikirim: ${teks.slice(0, 40)}` };
        } catch (e) {
            return { ok: false, detail: `gagal mengisi kolom: ${e && e.message ? e.message : e}` };
        }
    }

    /** Jalankan satu aksi pada target; kembalikan hasil yang bisa dilaporkan apa adanya. */
    async function performAction(step) {
        const dipakai = resolveTarget(step.goto);
        const el = dipakai.el;
        const target = dipakai.target || targets.find((t) => t.id === step.goto);
        if (!el || !target) { return { ok: false, detail: 'bagian yang mau dijalankan tidak ditemukan' }; }
        if (!clickAllowed) { return { ok: false, detail: 'aksi halaman sedang dimatikan (dateSkunder.spider.allowActions)' }; }
        if (!usable(el)) { return { ok: false, detail: 'bukan kontrol yang boleh aku jalankan' }; }
        // Gerbang kedua: aksi yang mengubah data hanya jika perintahnya sendiri menyebut aksi itu.
        if (target.danger && !DANGER_RE.test(`${lastRequest} ${step.say || ''}`)) {
            return { ok: false, detail: 'aksi ini bisa mengubah/menghapus data — sebutkan perintahnya bila memang ingin dijalankan' };
        }
        await hop();
        // “Klik” pada kolom isian/dropdown bukan aksi yang mengubah tampilan: cukup fokuskan (dan isi
        // nilainya bila model menyertakannya). Dulu ini dilaporkan gagal padahal tidak ada yang salah.
        const tag = String(el.tagName || '').toUpperCase();
        const kolomIsian = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        if (kolomIsian && (step.action === 'click' || step.action === 'tab')) {
            if (String(step.value || '').trim()) { return doInput(el, target, step.value); }
            try { el.focus(); el.click(); } catch (e) { /* fokus tidak wajib berhasil */ }
            return { ok: true, detail: 'kolom isian difokuskan (memang tidak mengubah tampilan)' };
        }
        switch (step.action) {
            case 'tab':
            case 'click':
                return doClick(el, target);
            case 'select':
            case 'input':
                return doInput(el, target, step.value);
            case 'focus':
                return { ok: true, detail: 'disorot' };
            case 'scroll':
                await bringIntoView(el, 4000);
                return { ok: true, detail: 'halaman digulir ke bagian ini' };
            case 'hover':
                fire(el, 'mouseover');
                fire(el, 'mouseenter');
                return { ok: true, detail: 'kursor diarahkan' };
            default:
                return { ok: true, detail: 'tidak ada aksi yang perlu dijalankan' };
        }
    }

    // ── catatan, balon kata, dan suara ──────────────────────────────────────
    function addLog(kind, text) {
        if (!logBox) { return; }
        const isi = String(text || '');
        // Baris kembar berurutan dibuang: penjelasan yang sama tidak dicetak dua kali.
        const terakhir = logBox.lastElementChild;
        if (terakhir && terakhir.textContent === isi) { return; }
        const row = document.createElement('div');
        row.className = 'sp-row ' + kind;
        row.textContent = isi;
        logBox.appendChild(row);
        while (logBox.children.length > 200) { logBox.removeChild(logBox.firstChild); }
        logBox.scrollTop = logBox.scrollHeight;
    }

    /**
     * Rapikan teks penjelasan model: buang penomoran/poin berlapis (“• 3. • …”), baris yang isinya
     * tercakup baris lain (lanjutan baris terpotong atau pengulangan), baris kembar, dan kosong.
     * Hasilnya maksimal 8 baris yang benar-benar berbeda dan lengkap.
     */
    function rapikanPenjelasan(teks) {
        const kunci = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const kata = (s) => new Set(String(s || '').toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter((k) => k.length >= 4));
        // Kata a tercakup di b: hampir semua kata bermakna a ada di b (min. 3 kata agar aman).
        const tercakup = (a, b) => {
            const ka = kata(a);
            const kb = kata(b);
            if (ka.size < 3 || !kb.size) { return false; }
            let sama = 0;
            ka.forEach((w) => { if (kb.has(w)) { sama += 1; } });
            return sama / ka.size >= 0.85;
        };
        const baris = String(teks || '')
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map((b) => String(b)
                // Nomor berlapis dibuang walau tanpa tanda baca (“• 3 • …” → “…”).
                .replace(/^\s*(?:(?:[•▪●*\-–—]+|\d+(?:\s*[.)])?|#{1,3})\s*)+/, '')
                .replace(/\s*[•▪●]+\s*/g, ' ')
                .replace(/\s+/g, ' ')
                .trim())
            .filter(Boolean);
        const hasil = [];
        const sudah = new Set();
        for (const b of baris) {
            const k = kunci(b);
            if (!k || sudah.has(k)) { continue; }
            // Baris tersimpan yang tercakup baris baru → baris baru lebih lengkap: gantikan.
            const idx = hasil.findIndex((h) => tercakup(h, b));
            if (idx >= 0) {
                hasil[idx] = b.slice(0, 400);
                sudah.add(k);
                continue;
            }
            // Baris baru tercakup baris tersimpan → pengulangan/lanjutan terpotong: dibuang.
            if (hasil.some((h) => tercakup(b, h))) { continue; }
            sudah.add(k);
            hasil.push(b.slice(0, 400));
            if (hasil.length >= 8) { break; }
        }
        return hasil;
    }

    const setStatus = (text) => { if (statusEl) { statusEl.textContent = text; } };
    const setNote = (text) => { if (noteEl) { noteEl.textContent = String(text || ''); } };

    function setProgress(i, total) {
        if (!barBox || !barFill) { return; }
        if (!total) { barBox.hidden = true; barFill.style.width = '0%'; return; }
        barBox.hidden = false;
        barFill.style.width = Math.round((i / total) * 100) + '%';
    }

    function bubbleSay(text) {
        return new Promise((resolve) => {
            if (!bubble || !agent) { resolve(); return; }
            const full = String(text || '').trim();
            if (!full) { resolve(); return; }
            if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
            bubble.classList.remove('thinking');
            bubble.hidden = false;
            if (speakPref) { speak(full); }
            if (REDUCED) {
                bubble.textContent = full;
                placeBubble();
                bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 4200);
                resolve();
                return;
            }
            const seq = runSeq;
            let i = 0;
            bubble.textContent = '';
            const langkah = Math.max(1, Math.ceil(full.length / 80));
            const timer = setInterval(() => {
                if (seq !== runSeq) { clearInterval(timer); bubble.classList.remove('thinking'); resolve(); return; }
                i = Math.min(full.length, i + langkah);
                bubble.textContent = full.slice(0, i);
                placeBubble();
                if (i >= full.length) {
                    clearInterval(timer);
                    bubbleTimer = setTimeout(() => { if (seq === runSeq) { bubble.hidden = true; } }, 3600);
                    resolve();
                }
            }, 24);
        });
    }

    /** Balon “menyusun rencana…” supaya jawaban tidak terasa muncul mendadak. */
    function thinkingBubble() {
        if (!bubble || !agent) { return; }
        if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
        bubble.hidden = false;
        bubble.classList.add('thinking');
        bubble.textContent = 'menyusun rencana';
        placeBubble();
        // Jaring pengaman: jangan menggantung kalau balasan tidak pernah datang.
        bubbleTimer = setTimeout(() => {
            if (bubble.classList.contains('thinking')) { bubble.hidden = true; bubble.classList.remove('thinking'); }
        }, 60000);
    }

    const FEMALE_RE = /gadis|zira|heera|female|wanita|bahasa indonesia/i;

    function pickVoice() {
        try {
            const voices = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : [];
            const female = voices.filter((v) => FEMALE_RE.test(v.name));
            const id = female.filter((v) => String(v.lang || '').toLowerCase().startsWith('id'));
            return id[0] || female[0] || voices[0] || null;
        } catch (e) { return null; }
    }

    function speak(text) {
        try {
            if (!window.speechSynthesis) { return; }
            speechSynthesis.cancel();
            const bersih = String(text || '').replace(/[*_`#>|•]/g, ' ').replace(/\s+/g, ' ').trim();
            if (!bersih) { return; }
            const utter = new SpeechSynthesisUtterance(bersih.slice(0, 400));
            const voice = pickVoice();
            if (voice) { utter.voice = voice; utter.lang = voice.lang; }
            speechSynthesis.speak(utter);
        } catch (e) { /* suara tidak tersedia → abaikan */ }
    }

    function stopSpeech() {
        try { if (window.speechSynthesis) { speechSynthesis.cancel(); } } catch (e) { }
    }

    function refreshVoiceBtn() {
        if (!voiceBtn) { return; }
        voiceBtn.textContent = speakPref ? '🔊' : '🔈';
        voiceBtn.title = speakPref ? 'Suara spider menyala — klik untuk mematikan' : 'Bacakan penjelasan spider dengan suara';
    }

    function refreshAutoBtn() {
        if (!autoBtn) { return; }
        autoBtn.classList.toggle('on', autoRun);
        autoBtn.textContent = autoRun ? '⚡ Auto nyala' : '⚡ Auto mati';
        autoBtn.title = autoRun
            ? 'Eksekusi otomatis NYALA — klik untuk kembali ke mode hanya menjelaskan'
            : 'Eksekusi otomatis MATI — klik agar setiap instruksi langsung dikerjakan';
    }

    // ── mode kerja nonstop: masukan + detail terus-menerus, menyeluruh tanpa ulang ──────
    /** Bagian halaman yang sudah/belum dibahas — dasar putaran nonstop supaya analisanya menyeluruh. */
    function nonstopCoverage() {
        const sections = targets.filter((t) => t.kind === 'section').map((t) => ({
            id: t.id,
            name: rapikanTarget(String(t.label).replace(/^[^—]*—\s*/, '')) || String(t.id),
        }));
        return { sections, belum: sections.filter((s) => !nonstopCovered.has(s.id)) };
    }

    /** Sudut analisa yang diputar tiap putaran supaya masukan nonstop benar-benar baru (bukan template). */
    const NONSTOP_ANGLES = [
        'tren antarperiode beserta perubahan persennya',
        'anomali atau nilai ekstrem dan dampaknya pada keseluruhan',
        'hubungan antarkolom (korelasi) yang paling kuat',
        'kualitas data: sel kosong, duplikat, dan kolom yang mencurigakan',
        'segmentasi: kelompok mana yang paling menonjol dan mengapa',
        'rekomendasi tindakan konkret beserta angkanya',
    ];

    /** Instruksi putaran nonstop: masukan BARU per bagian yang belum dibahas, tanpa mengulang. */
    function nonstopText() {
        const { belum } = nonstopCoverage();
        const lalu = nonstopSeen.slice(-6).map((s) => `- ${String(s).slice(0, 120)}`).join('\n');
        const fokus = belum.length
            ? `Fokus bagian yang BELUM dibahas: ${belum.slice(0, 5).map((s) => s.name).join('; ')}.`
            : 'Semua bagian sudah pernah dibahas — beri analisa lanjutan yang berbeda sudut, tanpa mengulang.';
        const sudut = NONSTOP_ANGLES[nonstopSeen.length % NONSTOP_ANGLES.length];
        return [
            'Beri satu masukan analisis BARU dari data ini beserta detail angkanya,',
            `sudut putaran ini: ${sudut}.`,
            'Sertakan minimal tiga angka nyata dari KONTEKS DATA beserta perhitungan singkatnya, dan tulis di "reply" (maksimal 4 kalimat).',
            'Untuk langkah halaman, pilih bagian yang benar-benar mendukung masukan itu — boleh hanya "focus" (sorot) atau steps kosong bila tidak perlu menekan apa pun; jangan mengarang aksi.',
            fokus,
            lalu ? `Masukan yang sudah pernah kamu berikan (jangan diulang):\n${lalu}` : '',
        ].filter(Boolean).join(' ');
    }

    function nonstopTick() {
        if (!nonstopOn || !P || !built || running) { return; }
        nonstopPending = true;
        targets = collectTargets();
        const { sections, belum } = nonstopCoverage();
        if (sections.length) {
            addLog('note', `🔁 Nonstop: bagian ${nonstopCovered.size}/${sections.length} sudah dibahas${belum.length ? ` — lanjut ke: ${belum.slice(0, 3).map((s) => s.name).join(', ')}` : ' — semua bagian selesai, lanjut analisa lain'}.`);
        }
        ask(nonstopText(), false, '🔁 Nonstop: masukan + detail berikutnya');
    }

    function refreshNonstopBtn() {
        const btn = document.getElementById('sp-nonstop');
        if (!btn) { return; }
        btn.classList.toggle('on', nonstopOn);
        btn.textContent = nonstopOn ? '🔁 Nyala' : '🔁';
        btn.title = nonstopOn
            ? `Kerja nonstop NYALA — masukan + detail baru setiap ±${nonstopSeconds} detik. Klik untuk mematikan.`
            : 'Kerja nonstop: pet terus memberi masukan + detail baru dan menjalankan langkah aman pendukung selama halaman terbuka. Klik untuk menyalakan.';
    }

    /** Nyalakan/matikan kerja nonstop; pilihan diingat di keadaan halaman. */
    function setNonstop(on, silent) {
        nonstopOn = !!on;
        if (nonstopTimer) { clearInterval(nonstopTimer); nonstopTimer = null; }
        if (nonstopKick) { clearTimeout(nonstopKick); nonstopKick = null; }
        if (nonstopOn) {
            // Putaran pertama cepat, lalu berkala sesuai pengaturan.
            nonstopKick = setTimeout(() => { if (nonstopOn) { nonstopTick(); } }, 4000);
            nonstopTimer = setInterval(nonstopTick, clamp(nonstopSeconds, 30, 3600) * 1000);
        }
        refreshNonstopBtn();
        const st = safeState();
        st.spiderNonstop = nonstopOn;
        if (P) { P.vscode.setState(st); }
        if (!silent) {
            addLog('note', nonstopOn
                ? `Kerja nonstop NYALA: setiap ±${nonstopSeconds} detik aku memberi masukan + detail baru dan menjalankan langkah amannya — berjalan terus selama halaman ini terbuka sampai kamu matikan.`
                : 'Kerja nonstop dimatikan.');
        }
    }

    /** Simpan ringkasan masukan supaya putaran berikutnya tidak mengulang hal yang sama. */
    function pushNonstopNote(teks) {
        const bersih = String(teks || '').replace(/\s+/g, ' ').trim();
        if (!bersih) { return; }
        nonstopSeen.push(bersih.slice(0, 200));
        while (nonstopSeen.length > 8) { nonstopSeen.shift(); }
    }

    // ── pengecekan kontrol & perintah shortcut ─────────────────────────────
    /**
     * Rencana pengecekan lokal: tekan setiap kontrol aman sekali, verifikasi, lalu laporkan rapi.
     * Kontrol export/tautan luar tidak ditekan (biar tidak menulis berkas / membuka browser) — cukup disorot.
     */
    function checkPlan() {
        const klikKinds = ['button', 'link', 'tab', 'sort'];
        const janganDitkan = /export|ekspor|unduh|download|website|situs|tautan|reload|muat ulang|segarkan/i;
        const kontrol = targets.filter((t) => t.click && !t.danger && t.kind !== 'section' && t.kind !== 'card' && t.kind !== 'kpi');
        const steps = kontrol.slice(0, 40).map((t) => {
            const nama = rapikanTarget(t.label);
            if (klikKinds.includes(t.kind) && !janganDitkan.test(t.label)) {
                return { say: `Memeriksa ${nama}.`, goto: t.id, highlight: false, action: t.kind === 'tab' ? 'tab' : 'click', hold: 320 };
            }
            return { say: `${nama} hanya disorot (tidak ditekan: ${klikKinds.includes(t.kind) ? 'bisa menulis berkas/membuka tautan' : 'data tidak boleh berubah'}).`, goto: t.id, highlight: false, action: 'focus', hold: 200 };
        });
        return {
            reply: `Aku periksa ${steps.length} kontrol di halaman ini satu per satu, lalu melaporkan hasilnya.`,
            steps,
            source: 'local',
            check: true,
            note: 'Pengecekan: kontrol tampilan (tombol/tab/urut kolom) ditekan sekali dan diverifikasi (✓/✗); kolom isian, dropdown, tombol export, dan tautan hanya disorot supaya data & berkas tidak berubah.',
        };
    }

    function runCheck() {
        if (!built) { return; }
        setOpen(true, true);
        addLog('user', '✓ Cek semua kontrol');
        runSeq++;
        running = false;
        targets = collectTargets();
        const plan = checkPlan();
        if (!plan.steps.length) {
            addLog('note', 'Belum ada kontrol yang bisa diperiksa di halaman ini.');
            return;
        }
        void runPlan(plan, { request: 'cek semua kontrol', origin: 'check' });
    }

    /** Perintah dari shortcut/Command Palette (hanya halaman yang terlihat yang merespons). */
    function handleCommand(cmd) {
        if (cmd === 'tour') { ask('jalankan semua fitur di halaman ini', true); return; }
        if (cmd === 'check') { runCheck(); return; }
        if (cmd === 'nonstop') { setNonstop(!nonstopOn); return; }
        if (cmd === 'stop') {
            runSeq++;
            running = false;
            nonstopPending = false;
            setProgress(0, 0);
            setStatus('siap');
            addLog('note', 'Pekerjaan pet dihentikan dari shortcut.');
            return;
        }
        if (cmd === 'panel') { setOpen(true); }
    }

    // ── menjalankan rencana ─────────────────────────────────────────────────
    /**
     * Jalankan rencana langkah satu per satu: progres, sorot, eksekusi, verifikasi.
     * Tanpa narasi aktivitas: tidak ada baris “berjalan ke…”, “menekan tombol…”. Pengguna melihat
     * progres di bilah status; penjelasan yang ditulis otak model tampil sekali di akhir.
     * `meta.origin` menandai asal rencana ('spider' | 'chat' | 'ulang') untuk laporan.
     */
    async function runPlan(plan, meta) {
        if (!plan || !P) { return; }
        meta = meta || {};
        const seq = ++runSeq;
        running = true;
        const steps = Array.isArray(plan.steps) ? plan.steps : [];
        // ⚡ Auto mati = pet hanya berjalan & menjelaskan; permintaan eksplisit (▶ Jalankan semua fitur) tetap dieksekusi.
        const bolehAksi = clickAllowed && (autoRun || !!plan.force);
        lastPlan = plan;
        if (meta.request) { lastRequest = String(meta.request); }

        setStatus(steps.length ? (plan.source === 'llm' ? 'menjalankan…' : 'mode lokal…') : 'siap');
        setNote(plan.note || '');
        // Otak model belum aktif: kerja nonstop dihentikan sementara supaya tidak mengulang permintaan yang sama.
        if (plan.needsBrain && nonstopOn) {
            setNonstop(false, true);
            addLog('note', '🔁 Kerja nonstop dijeda: nyalakan otak model (▶) dulu, lalu hidupkan 🔁 lagi.');
        }
        setProgress(0, steps.length);
        if (plan.reply) {
            addLog('spider', plan.reply);
            await bubbleSay(plan.reply);
        }
        if (!steps.length) {
            setProgress(0, 0);
            if (bubble && bubble.classList.contains('thinking')) { bubble.hidden = true; bubble.classList.remove('thinking'); }
        }

        const laporan = [];
        let gagal = 0;
        for (let i = 0; i < steps.length; i++) {
            if (seq !== runSeq) { return; }
            const step = steps[i] || {};
            setProgress(i, steps.length);
            setStatus(`langkah ${i + 1}/${steps.length}`);
            if (seq !== runSeq) { return; }
            if (step.goto) { await goTo(step.goto); }
            if (seq !== runSeq) { return; }
            if (step.highlight && step.goto) { await highlight(step.goto); }
            if (seq !== runSeq) { return; }

            const target = resolveTarget(step.goto).target || targets.find((t) => t.id === step.goto);
            // Tandai bagian yang sudah dibahas untuk mode nonstop (analisa menyeluruh tanpa ulang).
            if (nonstopPending && target) {
                const gid = target.kind === 'section' ? target.id : target.group;
                if (gid) { nonstopCovered.add(gid); }
            }
            let hasil = { ok: true, detail: 'disorot' };
            if (step.action && step.goto) {
                if (!bolehAksi) {
                    hasil = { ok: false, detail: !autoRun ? 'mode ⚡ Auto sedang dimatikan di panel pet' : 'aksi halaman dimatikan di pengaturan' };
                } else {
                    hasil = await performAction(step);
                }
                // Hanya kegagalan yang dicatat; keberhasilan tidak dinarasikan (“menekan tombol …”).
                if (!hasil.ok) {
                    addLog('gagal', `✗ ${describeAction(step, target)} — ${hasil.detail}`);
                    gagal++;
                }
            }
            if (seq !== runSeq) { return; }
            laporan.push({
                say: step.say || '',
                target: target ? target.label : step.goto || '',
                action: step.action || null,
                ok: !!hasil.ok,
                detail: hasil.detail,
            });
            await wait(clamp(+step.hold || 1300, 500, 4000));
        }

        if (seq === runSeq) {
            running = false;
            setProgress(steps.length, steps.length);
            const dieksekusi = laporan.filter((l) => l.action).length;
            setStatus(gagal ? `selesai · ${dieksekusi - gagal}/${dieksekusi} aksi berhasil` : 'selesai');
            if (dieksekusi) {
                // Hanya kegagalan yang perlu dilaporkan; keberhasilan sudah terlihat di halaman + penjelasan akhir.
                if (gagal) { addLog('note', `${gagal} dari ${dieksekusi} aksi gagal dijalankan; sisanya berhasil.`); }
            }
            // Ringkasan rapi untuk pengecekan kontrol (“✓ Cek semua kontrol”).
            if (plan.check) {
                const gagalNama = laporan.filter((l) => l.action && !l.ok).map((l) => rapikanTarget(l.target));
                addLog(gagal ? 'note' : 'ok', gagal
                    ? `Pengecekan selesai: ${dieksekusi - gagal} kontrol OK, ${gagal} gagal${gagalNama.length ? ` — ${gagalNama.slice(0, 4).join(', ')}${gagalNama.length > 4 ? ', …' : ''}` : ''}.`
                    : `Pengecekan selesai: semua ${dieksekusi} kontrol aman berfungsi (✓).`);
            }
            setTimeout(() => { if (seq === runSeq) { setStatus('siap'); setProgress(0, 0); } }, 1800);
            if (nonstopOn && plan.reply) { pushNonstopNote(plan.reply); }
            // Laporan untuk misi (view Pet Skin): jumlah export per jenis + aksi lain yang berhasil.
            const aksiOk = laporan.filter((l) => l.ok && l.action);
            const jenis = (re) => aksiOk.filter((l) => re.test(String(l.target))).length;
            P.vscode.postMessage({
                type: 'spiderEvent',
                kind: 'run',
                origin: meta.origin || 'spider',
                exports: jenis(/export|unduh/i),
                jurnal: jenis(/jurnal|docx|pdf/i),
                flow: jenis(/flow|workflow/i),
                json: jenis(/json/i),
                pptx: jenis(/ppt|powerpoint/i),
                typed: aksiOk.filter((l) => l.action === 'input').length,
                tabs: aksiOk.filter((l) => l.action === 'tab').length,
                executed: dieksekusi,
                failed: gagal,
                tour: !!plan.tour,
                check: !!plan.check,
            });
            if (nonstopPending) {
                nonstopPending = false;
                P.vscode.postMessage({ type: 'spiderEvent', kind: 'nonstop' });
            }
            P.vscode.postMessage({
                type: 'spiderResult',
                origin: meta.origin || 'spider',
                request: lastRequest,
                fileName: P.state ? P.state.fileName : '',
                sheetName: P.sheet ? P.sheet.name : '',
                executed: dieksekusi,
                failed: gagal,
                steps: laporan,
            });
        }
    }

    // ── penjelasan hasil eksekusi oleh otak model ───────────────────────────
    /** Tampilkan penjelasan hasil eksekusi yang ditulis otak model penuh (llama-server). */
    async function showExplain(m) {
        if (m.pending) {
            setStatus('otak model menulis penjelasan…');
            addLog('note', 'Pet meminta otak model menulis penjelasan hasil eksekusi…');
            return;
        }
        if (m.ok && m.text) {
            const baris = rapikanPenjelasan(m.text);
            addLog('explain', '📖 Penjelasan pet (otak model)');
            baris.forEach((b) => addLog('explain', `• ${b}`));
            if (nonstopOn) { pushNonstopNote(baris[0] || ''); }
            await bubbleSay(baris.length ? baris.join('\n') : String(m.text).slice(0, 600));
            setStatus('siap');
            return;
        }
        addLog('note', String(m.note || 'Penjelasan otak model tidak tersedia saat ini.'));
        setStatus('siap');
    }

    /** Nama target yang rapi untuk laporan: buang awalan bagian & jenis kontrol. */
    function rapikanTarget(label) {
        return String(label || '').replace(/^[^›]{0,24}›\s*/, '').replace(/^(tombol|tautan|tab|kolom isian|pilihan|urut kolom|kartu|bagian):\s*/i, '').trim().slice(0, 48);
    }

    function describeAction(step, target) {
        const nama = target ? target.label.replace(/^(tombol|tautan|tab|kolom isian|pilihan|urut kolom):\s*/i, '') : step.goto;
        switch (step.action) {
            case 'tab': return `pindah tab “${nama}”`;
            case 'select': return `ubah pilihan “${nama}”`;
            case 'input': return `isi kolom “${nama}”`;
            case 'hover': return `arahkan ke “${nama}”`;
            case 'scroll': return `gulir ke “${nama}”`;
            default: return `tekan “${nama}”`;
        }
    }

    function ask(text, force, display) {
        const bersih = String(text || '').trim();
        if (!bersih || !P) { return; }
        setOpen(true, true);
        addLog('user', String(display || bersih));
        runSeq++;                       // hentikan langkah sebelumnya
        running = false;
        lastRequest = bersih;
        setStatus('menyusun rencana…');
        thinkingBubble();
        targets = collectTargets();
        P.vscode.postMessage({
            type: 'spiderAsk',
            text: bersih,
            fileName: P.state ? P.state.fileName : '',
            sheetName: P.sheet ? P.sheet.name : '',
            auto: autoRun,
            force: !!force,
            targets: targets.map((t) => ({ id: t.id, label: t.label, kind: t.kind, click: t.click, group: t.group, danger: t.danger })),
        });
    }

    /** Segarkan daftar target halaman (dipakai pet sendiri untuk berjalan dan mengeksekusi). */
    function refreshTargets() {
        if (!P) { return; }
        targets = collectTargets();
    }

    // ── pesan dari ekstensi ─────────────────────────────────────────────────
    window.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'spiderConfig') {
            enabled = m.enabled !== false;
            speakPref = !!m.speak;
            clickAllowed = m.allowActions !== false;
            if (typeof m.autoRun === 'boolean') { autoRun = m.autoRun; }
            walkSpeed = clamp(m.walkSpeed || 1, 0.5, 2);
            if (typeof m.nonstopSeconds === 'number') { nonstopSeconds = clamp(m.nonstopSeconds, 30, 3600); }
            if (m.skin) { skin = m.skin; }
            if (enabled) {
                ensureDom(); applySkin(); refreshVoiceBtn(); refreshAutoBtn(); refreshNonstopBtn();
                if (nonstopOn) { setNonstop(true, true); }   // pengaturan berubah → timer disesuaikan
            }
            else if (built) { stopLoop(); agent.remove(); bubble.remove(); panel.remove(); built = false; }
        } else if (m.type === 'spiderStatus') {
            if (m.state === 'thinking') { setStatus('menyusun rencana…'); thinkingBubble(); }
        } else if (m.type === 'spiderPlan') {
            void runPlan(m.plan, { request: m.request || '', origin: m.origin || 'spider' });
        } else if (m.type === 'spiderExplain') {
            void showExplain(m);
        } else if (m.type === 'spiderCommand') {
            // Shortcut/Command Palette: hanya halaman yang terlihat yang merespons.
            if (document.hidden) { return; }
            handleCommand(String(m.cmd || ''));
        } else if (m.type === 'spiderMission') {
            addLog('note', String(m.text || 'Misi selesai — kostum baru terbuka di view Pet Skin.'));
        } else if (m.type === 'spiderTour') {
            ask('jalankan semua fitur di halaman ini', true);
        }
    });

    window.addEventListener('resize', () => {
        if (!agent) { return; }
        setPos(
            clamp(pos.x, 8, Math.max(8, window.innerWidth - SIZE - 8)),
            clamp(pos.y, 8, Math.max(8, window.innerHeight - SIZE - 10)),
        );
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSpeech(); } });

    // ── titik masuk dari main.js (setiap halaman digambar ulang) ────────────
    window.SkunderSpider = {
        init(ctx) {
            P = ctx;
            // Daftar target selalu disegarkan (walau pet dimatikan) supaya siap dipakai saat instruksi datang.
            refreshTargets();
            if (!enabled) { return; }
            ensureDom();
            const st = safeState();
            if (typeof st.spiderOpen === 'boolean' && !greeted) { setOpen(st.spiderOpen, true); }
            // Mode nonstop ikut diingat: kalau sebelumnya menyala, lanjut lagi setelah halaman digambar ulang.
            if (st.spiderNonstop === true && !nonstopOn) { setNonstop(true, true); }
            if (!greeted) { greet(); }
        },
        ask,
        refreshTargets,
        /** Dipakai ekstensi untuk menjalankan rencana dari luar. */
        run(plan, origin, request) { void runPlan(plan, { origin: origin || 'spider', request: request || '' }); },
        setAuto(on) { autoRun = !!on; refreshAutoBtn(); },
        stop() { stopSpeech(); runSeq++; running = false; setProgress(0, 0); },
    };
})();
