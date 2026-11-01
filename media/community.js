/* Community Chat Date Skunder: ruang Komunitas dan Diskusi AI (keduanya Firebase + log lokal).
   - Setiap pesan tetap ditulis ke `data/data.txt`; berkas itu dibaca ulang saat view dimuat,
     jadi riwayat tidak hilang walau view ditutup atau VS Code dijalankan ulang.
   - Ruang Komunitas juga membaca/mengirim pesan ke Firebase (bila aktif), sehingga percakapan
     yang sama terlihat oleh anggota lain. Pesan dari Firebase ikut diarsipkan ke data/data.txt.
   - Tombol “⬇ JSON” = arsip lokal semua ruang; “☁ JSON” = isi Firebase; “🔗 API” = API JSON lokal.
   - “Komunitas ramai”: pesan beberapa persona (llama-server), badge bahasa, indikator menulis. */
(function () {
    const vscode = acquireVsCodeApi();
    const cfg = window.SKUNDER_COMMUNITY || {};
    const $ = (id) => document.getElementById(id);

    const root = document.querySelector('.cw-root');
    const stateEl = $('cw-state');
    const channelEl = $('cw-channel');
    const refreshEl = $('cw-refresh');
    const msgsEl = $('cw-msgs');
    const textEl = $('cw-text');
    const sendEl = $('cw-send');
    const countEl = $('cw-count');
    const aiCountEl = $('cw-ai-count');
    const nameEl = $('cw-name');
    const bioEl = $('cw-bio');
    const saveEl = $('cw-save');
    const saveNoteEl = $('cw-save-note');
    const meSumEl = $('cw-me-sum');
    const avatarEl = $('cw-avatar');
    const sendSkinEl = $('cw-send-skin');
    const sendAiEl = $('cw-send-ai');
    const liveEl = $('cw-live');
    const liveNoteEl = $('cw-live-note');
    const langEl = $('cw-lang');
    const langMenuEl = $('cw-lang-menu');
    const langListEl = $('cw-lang-list');
    const langCountEl = $('cw-lang-count');
    const langNoteEl = $('cw-lang-note');
    const langAllEl = $('cw-lang-all');
    const langResetEl = $('cw-lang-reset');
    const replyLangEl = $('cw-reply-lang');
    const tabCommunityEl = $('cw-tab-community');
    const tabAiEl = $('cw-tab-ai');
    const paneCommunityEl = $('cw-pane-community');
    const paneAiEl = $('cw-pane-ai');
    const aiMsgsEl = $('cw-ai-msgs');
    const aiTextEl = $('cw-ai-text');
    const aiSendEl = $('cw-ai-send');
    const openLogEl = $('cw-open-log');
    const jsonEl = $('cw-json');
    const jsonRemoteEl = $('cw-json-fb');
    const apiEl = $('cw-api');
    const apiTermEl = $('cw-api-term');
    const apiTerm2El = $('cw-api-term-2');
    const apiTermNoteEl = $('cw-api-term-note');
    const apiTermStateEl = $('cw-api-term-state');
    const apiTermOpenEl = $('cw-api-term-open');
    const apiLineEl = $('cw-api-line');
    const apiUrlEl = $('cw-api-url');
    const apiCopyEl = $('cw-api-copy');
    const jumpEl = $('cw-jump');

    let AVATAR = String(cfg.defaultAvatar || '');
    let LOG_LABEL = String(cfg.logLabel || 'data/data.txt');
    const CHANNELS = Array.isArray(cfg.channels) && cfg.channels.length
        ? cfg.channels
        : [{ id: 'umum', label: '#umum', desc: '' }];

    const saved = vscode.getState() || {};
    /** @type {{name: string, bio: string}} */
    let profile = { name: '', bio: '' };
    let channel = CHANNELS[0].id;
    /** Seluruh pesan hasil pembacaan data/data.txt (semua ruang). */
    let history = [];
    /** Pesan sesi ini di ruang komunitas (dari mesin lokal / pesan pengguna). */
    let liveMessages = [];
    /** Pesan sesi ini di ruang Diskusi AI. */
    let aiMessages = [];
    /** Pesan ruang Komunitas yang dibaca dari Firebase (bukan dari data/data.txt). */
    let remoteMessages = [];
    /** Pesan ruang Diskusi AI yang dibaca dari Firebase (koleksi `diskusi_ai`). */
    let aiRemoteMessages = Array.isArray(cfg.aiRemoteMessages) ? cfg.aiRemoteMessages.map(normalizeLive).filter(Boolean) : [];
    /** Status Firebase ruang Diskusi AI: { enabled, ok, message, count, projectId, collection }. */
    let aiStatus = cfg.diskusi && typeof cfg.diskusi === 'object' ? cfg.diskusi : null;
    /** Status Firebase: { enabled, ok, message, count, projectId, collection }. */
    let firebaseStatus = null;
    /** Status API JSON: { enabled, running, url, chat, ... }. */
    let apiInfo = null;
    /** Skin data terakhir yang dikirim dari ekstensi. */
    let lastSkinData = null;
    let skinRequestSent = false;
    let pendingSkinShare = false;
    /** Teks AI terakhir yang diterima dari panel lain. */
    let lastAiText = null;
    /** Persona yang sedang menulis jawaban (indikator menulis…). */
    let typing = null;
    let aiTyping = null;
    /** Ruang aktif: 'komunitas' | 'diskusi'. */
    let tab = saved.tab === 'diskusi' ? 'diskusi' : 'komunitas';
    /** Status mesin lokal: { enabled, running, active, seconds, languages, personas, unlimited }. */
    let liveStatus = null;
    /** Katalog bahasa dari ekstensi (`langs`) atau bawaan supaya view tetap jalan sendiri. */
    const LANGS = Array.isArray(cfg.langs) && cfg.langs.length ? cfg.langs : [
        { code: 'id', name: 'Bahasa Indonesia', tag: 'ID' },
        { code: 'en', name: 'English', tag: 'EN' },
        { code: 'zh', name: '简体中文', tag: '中文' },
        { code: 'ja', name: '日本語', tag: '日本語' },
        { code: 'ko', name: '한국어', tag: 'KO' },
        { code: 'es', name: 'Español', tag: 'ES' },
        { code: 'fr', name: 'Français', tag: 'FR' },
        { code: 'ar', name: 'العربية', tag: 'AR' },
    ];
    /** Bahasa yang dipakai bergiliran (boleh lebih dari satu) → dateSkunder.community.languages. */
    let langs = cfg.live && Array.isArray(cfg.live.languages) && cfg.live.languages.length
        ? cfg.live.languages.slice()
        : ['id', 'en', 'zh', 'ja', 'es'];
    /** Mode bahasa jawaban: 'auto' (ikuti pesan) | 'mix' (bergiliran) | kode bahasa. */
    let replyLang = String(cfg.replyLanguage || 'auto');
    let typingTimer = 0;
    let aiTypingTimer = 0;
    /** Jumlah pesan baru saat pengguna sedang membaca ke atas (per ruang). */
    let unread = { komunitas: 0, diskusi: 0 };
    let lastCount = { komunitas: 0, diskusi: 0 };
    /** true = daftar menempel di bawah (pesan baru otomatis terlihat). */
    let stick = { komunitas: true, diskusi: true };
    /** Draft jawaban yang sedang stream: { id, name, bio, langTag, text }. */
    let streaming = { komunitas: null, diskusi: null };
    /** Jumlah pertanyaan yang sedang disusun (dari mesin jawaban). */
    let pendingCount = 0;
    /** Batas pesan sebelum chat dibersihkan otomatis (0 = nonaktif). */
    let autoClearAt = 0;
    /** Kunci pesan yang sudah tampil per ruang — dipakai render inkremental (tanpa bangun ulang). */
    const listState = { komunitas: { keys: [] }, diskusi: { keys: [] } };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** Inisial nama + warna tetap per orang — terasa seperti anggota sungguhan, bukan avatar kembar. */
    function avatarOf(name) {
        const n = String(name || '').trim();
        if (!n) { return `<img class="cw-avatar" src="${esc(AVATAR)}" alt="" />`; }
        const initials = n.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
        let hue = 0;
        for (let i = 0; i < n.length; i += 1) { hue = (hue * 31 + n.charCodeAt(i)) % 360; }
        return `<span class="cw-avatar cw-ini" style="--h:${hue}" aria-hidden="true">${esc(initials)}</span>`;
    }

    /** Ubah potongan HTML menjadi satu elemen (untuk menambah pesan tanpa membangun ulang daftar). */
    function nodeFromHtml(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = String(html || '').trim();
        return tpl.content.firstElementChild;
    }

    function status(text, bad) {
        if (!stateEl) { return; }
        stateEl.textContent = String(text || '');
        stateEl.className = 'cw-state' + (bad ? ' bad' : '');
    }

    /** Penghitung karakter supaya pesan tidak kepanjangan. */
    function renderCounts() {
        if (countEl && textEl) { countEl.textContent = `${textEl.value.length}/900`; }
        if (aiCountEl && aiTextEl) { aiCountEl.textContent = `${aiTextEl.value.length}/4000`; }
    }

    /** Kotak tulis tumbuh mengikuti isi (maksimal beberapa baris) supaya teks panjang tetap terlihat. */
    function autoGrow(el, maxRows) {
        if (!el || !el.style) { return; }
        el.style.height = 'auto';
        const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 16;
        const max = Math.max(2, maxRows) * lineHeight + 10;
        const next = Math.min(el.scrollHeight || 0, max);
        el.style.height = next > 0 ? `${next}px` : '';
    }

    function note(text, bad) {
        if (!saveNoteEl) { return; }
        saveNoteEl.hidden = !text;
        saveNoteEl.textContent = String(text || '');
        saveNoteEl.className = 'cw-note' + (bad ? ' bad' : '');
    }

    /** Jam relatif singkat: baru saja / x menit lalu / tanggal lokal. */
    function when(ms) {
        if (!ms) { return ''; }
        const d = Date.now() - ms;
        if (d < 60000) { return 'baru saja'; }
        if (d < 3600000) { return Math.floor(d / 60000) + ' menit lalu'; }
        if (d < 86400000) { return Math.floor(d / 3600000) + ' jam lalu'; }
        if (d < 604800000) { return Math.floor(d / 86400000) + ' hari lalu'; }
        return new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function stamp(ms) {
        return ms ? new Date(ms).toLocaleString('id-ID') : '';
    }

    /** Tag bahasa dari keterangan pesan (`lokal · ID`, `jawaban · 中文`, …). */
    function langTagOf(tag) {
        const parts = String(tag || '').split(' · ').map((x) => x.trim()).filter(Boolean);
        const last = parts[parts.length - 1] || '';
        return parts.length > 1 && last.length <= 8 && !/^(lokal|jawaban|sistem|dibagikan)$/i.test(last) ? last : '';
    }

    /** Ubah satu pesan hasil baca data/data.txt menjadi bentuk tampilan. */
    function fromHistory(h) {
        if (!h || !h.text) { return null; }
        return {
            id: 'h' + Number(h.index || 0),
            name: String(h.name || 'tanpa nama'),
            bio: '',
            text: String(h.text),
            at: Number(h.atMs) || 0,
            atText: String(h.at || ''),
            lang: '',
            langTag: langTagOf(h.tag),
            local: true,
            persisted: true,
            kind: h.kind || 'chat',
            room: h.room === 'diskusi' ? 'diskusi' : 'komunitas',
            channel: String(h.channel || ''),
        };
    }

    /** Normalisasi satu pesan dari ekstensi (lokal atau Firebase). */
    function normalizeLive(m) {
        if (!m || !m.text) { return null; }
        const remote = !!m.remote;
        return {
            id: String(m.id || ('l-' + Math.random().toString(36).slice(2))),
            name: String(m.name || 'anggota'),
            bio: String(m.bio || ''),
            text: String(m.text),
            at: Number(m.at) || Date.now(),
            atText: '',
            lang: String(m.lang || ''),
            langTag: String(m.langTag || ''),
            local: m.local === undefined ? !remote : !!m.local,
            remote: remote,
            persisted: !!m.persisted,
            kind: m.kind || 'chat',
            room: m.room === 'diskusi' ? 'diskusi' : 'komunitas',
            channel: String(m.channel || ''),
        };
    }

    /** Kunci pembanding untuk mencegah pesan yang sama tampil dua kali (sesi + berkas + Firebase). */
    function sameKey(m) {
        const text = String(m.text || '').trim().replace(/\s+/g, ' ');
        return `${String(m.name || '').trim().toLowerCase()}|${text.slice(0, 160)}`;
    }

    /** Gabungkan pesan dari berkas dengan pesan sesi, tanpa duplikat, urut waktu. */
    function mergeUnique(base, extra) {
        const seen = new Set();
        const out = [];
        const push = (m) => {
            if (!m) { return; }
            const key = sameKey(m);
            if (seen.has(key)) { return; }
            seen.add(key);
            out.push(m);
        };
        base.forEach(push);
        extra.forEach(push);
        return out.sort((a, b) => (a.at || 0) - (b.at || 0));
    }

    /** Pesan ruang komunitas: seluruh isi berkas + pesan Firebase + pesan sesi ini. */
    function communityMessages() {
        const fromFile = history.map(fromHistory).filter(Boolean).filter((m) => m.room === 'komunitas');
        return mergeUnique(mergeUnique(fromFile, remoteMessages), liveMessages);
    }

    /** Pesan ruang Diskusi AI: pesan Firebase + sisa log lokal + pesan sesi ini. */
    function discussionMessages() {
        const fromFile = history.map(fromHistory).filter(Boolean).filter((m) => m.room === 'diskusi');
        return mergeUnique(mergeUnique(fromFile, aiRemoteMessages), aiMessages);
    }

    /** Keterangan sumber ruang Diskusi AI (Firebase / log lokal). */
    function aiSourceLabel() {
        const st = aiStatus;
        if (!st) { return `💾 log ${LOG_LABEL}`; }
        if (st.enabled === false) { return `💾 log lokal ${LOG_LABEL}`; }
        if (st.display === false) { return `💾 ${LOG_LABEL} · tampilan database dimatikan`; }
        if (!st.ok && !st.message) { return `☁ Firebase ${st.collection || 'diskusi_ai'} · menyambung…`; }
        if (st.ok) {
            const n = Number(st.count);
            const total = Number.isFinite(n) ? n : discussionMessages().length;
            return `☁ Firebase ${st.collection || 'diskusi_ai'} · ${total} pesan`;
        }
        return `☁ Firebase ${st.collection || 'diskusi_ai'}: ${String(st.message)} — cadangan ${LOG_LABEL}`;
    }

    /** Baris sumber di kepala ruang Diskusi AI. */
    function renderAiSource() {
        const el = $('cw-ai-src');
        if (!el) { return; }
        const auto = autoClearAt > 0 ? ` · bersih otomatis tiap ${autoClearAt} pesan` : '';
        el.textContent = `${aiSourceLabel()}${auto}`;
        el.title = aiStatus && aiStatus.ok
            ? 'Percakapan Diskusi AI dibaca dari database Firebase dan tetap dicatat sebagai log di ' + LOG_LABEL
            : 'Diskusi AI dibaca dari log lokal; sambungkan database agar terbaca semua perangkat.';
    }

    /** Baris “menulis…” selama persona menyusun jawaban. */
    function typingRow(who) {
        const t = who === undefined ? typing : who;
        if (!t) { return ''; }
        const tag = t.langTag ? ' · ' + esc(t.langTag) : '';
        return `<div class="cw-msg cw-typing">
            ${avatarOf(t.name || 'anggota')}
            <div class="cw-bubble">
                <div class="cw-top"><span class="cw-name">${esc(t.name || 'anggota')}</span><span class="cw-local">⚡ lokal${tag}</span></div>
                <div class="cw-text cw-dots">menulis<span>.</span><span>.</span><span>.</span></div>
            </div>
        </div>`;
    }

    /** Draft jawaban yang sedang mengalir dari model (teks tumbuh, bukan menunggu selesai). */
    function draftRow(draft) {
        if (!draft) { return ''; }
        const tag = draft.langTag ? ' · ' + esc(draft.langTag) : '';
        return `<div class="cw-msg cw-typing cw-stream" data-cw-draft="${esc(draft.id)}">
            ${avatarOf(draft.name)}
            <div class="cw-bubble">
                <div class="cw-top"><span class="cw-name">${esc(draft.name || 'anggota')}</span><span class="cw-local">⚡ menyusun${tag}</span></div>
                <div class="cw-text cw-stream-text"><span data-cw-draft-text>${esc(draft.text)}</span><span class="cw-caret">▍</span></div>
            </div>
        </div>`;
    }

    /** Pesan kosong (belum ada isi) — hanya tampil bila tidak ada pesan, typing, atau draft. */
    function emptyHtml(room) {
        if (room === 'diskusi') {
            return '<div class="cw-empty">🧠 Belum ada diskusi. Tulis satu permasalahan data — jawabannya langsung ke inti, sesuai yang kamu tanyakan.</div>';
        }
        return `<div class="cw-empty">Belum ada pesan. Tulis satu pesan — percakapan tersimpan di database komunitas dan tetap tampil setelah view dimuat ulang.</div>`;
    }

    /** Bagian bawah daftar: indikator menulis, draft streaming, dan pesan kosong. */
    function footerHtml(room, count) {
        const who = room === 'diskusi' ? aiTyping : typing;
        const draft = streaming[room];
        const empty = (count || who || draft) ? '' : emptyHtml(room);
        return typingRow(who) + draftRow(draft) + empty;
    }

    /** Render ulang hanya bagian bawah (murah) saat indikator/draft berubah. */
    function renderFooter(room) {
        const el = room === 'diskusi' ? aiMsgsEl : msgsEl;
        if (!el) { return; }
        const footer = el.querySelector('[data-cw-footer]');
        if (!footer) {
            if (room === 'diskusi') { renderAi(); } else { render(); }
            return;
        }
        const list = room === 'diskusi' ? discussionMessages() : communityMessages();
        footer.innerHTML = footerHtml(room, list.length);
        if (stick[room]) { el.scrollTop = el.scrollHeight; }
    }

    /** Perbarui teks draft tanpa menyentuh elemen lain (dipanggil tiap potongan teks dari model). */
    function updateDraft(room, draft) {
        const el = room === 'diskusi' ? aiMsgsEl : msgsEl;
        if (!el) { return; }
        const row = el.querySelector('[data-cw-draft]');
        if (!row || row.getAttribute('data-cw-draft') !== draft.id) {
            renderFooter(room);
            return;
        }
        const body = row.querySelector('[data-cw-draft-text]');
        if (body) { body.textContent = draft.text; }
        if (stick[room]) { el.scrollTop = el.scrollHeight; }
    }

    /** Bangun daftar pesan menjadi potongan HTML berkunci (pemisah hari + pesan). */
    function buildItems(list) {
        const items = [];
        let lastDay = '';
        let prev = null;
        for (const m of list) {
            const key = dayKey(m.at);
            if (key !== lastDay) {
                items.push({ key: 'day:' + key, html: `<div class="cw-day"><span>${esc(dayLabel(m.at))}</span></div>` });
                lastDay = key;
                prev = null;
            }
            const grouped = !!prev
                && prev.name === m.name
                && prev.room === m.room
                && Math.abs((m.at || 0) - (prev.at || 0)) < 5 * 60 * 1000;
            items.push({ key: 'm:' + sameKey(m) + ':' + (m.at || 0), html: renderMsg(m, grouped) });
            prev = m;
        }
        return items;
    }

    /**
     * Tampilkan daftar pesan secara inkremental: pesan baru ditambahkan, bukan membangun ulang
     * seluruh daftar. Ini yang membuat chat tetap responsif saat pesan mengalir cepat.
     */
    function paintList(el, room, items, footer, count) {
        const st = listState[room] || (listState[room] = { keys: [] });
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        const keepTop = el.scrollTop;
        const appendOnly = st.keys.length > 0
            && items.length >= st.keys.length
            && st.keys.every((k, i) => k === items[i].key);
        if (appendOnly && el.querySelector('[data-cw-footer]')) {
            const holder = el.querySelector('[data-cw-footer]');
            const frag = document.createDocumentFragment();
            for (let i = st.keys.length; i < items.length; i += 1) {
                const node = nodeFromHtml(items[i].html);
                if (node) { frag.appendChild(node); }
            }
            el.insertBefore(frag, holder);
            holder.innerHTML = footer;
        } else {
            el.innerHTML = items.map((x) => x.html).join('') + `<div data-cw-footer="">${footer}</div>`;
        }
        st.keys = items.map((x) => x.key);
        if (atBottom || stick[room]) {
            el.scrollTop = el.scrollHeight;
            unread[room] = 0;
        } else {
            el.scrollTop = keepTop;
            unread[room] += Math.max(0, count - lastCount[room]);
        }
        lastCount[room] = count;
        updateJump();
    }

    /** Tampilkan jumlah pertanyaan yang sedang disusun (indikator responsif). */
    function syncPending() {
        if (pendingCount > 0) {
            status(`menyusun jawaban…${pendingCount > 1 ? ` (${pendingCount} pesan menunggu)` : ''}`);
        } else {
            // Antrean selesai: kembalikan status ke ringkasan biasa (jangan tertinggal “menyusun…”).
            showLoadedStatus();
        }
    }

    /** Status tombol ⚡ Ramai + keterangan singkat di bawah bilah ruang. */
    function renderLive() {
        const st = liveStatus;
        if (liveEl) {
            const on = !!(st && st.enabled);
            liveEl.classList.toggle('on', on);
            liveEl.textContent = on ? '⚡ Ramai' : '⚡ Mati';
            liveEl.title = on
                ? 'Diskusi otomatis aktif saat llama-server berjalan — klik untuk mematikan'
                : 'Diskusi otomatis dimatikan — klik untuk menyalakan';
        }
        if (liveNoteEl) {
            if (!st) {
                liveNoteEl.hidden = true;
            } else {
                const listBahasa = (st.languages || []).join(' · ') || '-';
                const jumlah = st.unlimited ? '∞ anggota (tanpa batas)' : `${st.personas || 0} anggota`;
                const auto = autoClearAt > 0 ? ` · bersih otomatis tiap ${autoClearAt} pesan` : '';
                liveNoteEl.hidden = false;
                liveNoteEl.className = 'cw-live-note' + (st.enabled && st.running ? ' on' : '');
                liveNoteEl.textContent = !st.enabled
                    ? 'Diskusi otomatis komunitas dimatikan. Klik ⚡ Ramai untuk menyalakan.'
                    : st.running
                        ? `⚡ Ramai aktif · ${jumlah} · tiap ${st.seconds || 12} dtk · bahasa: ${listBahasa}${firebaseNote()}${auto}`
                        : `⚡ Ramai siap · ${jumlah}. Nyalakan llama-server (▶ di Chat AI) agar anggota komunitas mulai berdiskusi otomatis.${firebaseNote()}${auto}`;
            }
        }
        syncLangMenu();
    }

    /** Label pendek pilihan bahasa, mis. "ID · EN · 中文". */
    function langTags(codes) {
        const list = Array.isArray(codes) ? codes : [];
        const tags = list.map((c) => {
            const found = LANGS.find((l) => l.code === c);
            return found ? String(found.tag || found.code) : String(c).toUpperCase();
        });
        return tags.join(' · ') || '-';
    }

    function noteLang(text) {
        if (langNoteEl) { langNoteEl.textContent = String(text || ''); }
    }

    /** Daftar centang bahasa + pilihan bahasa jawaban — dibangun sekali saja. */
    function buildLangMenu() {
        if (langListEl && !langListEl.childElementCount) {
            LANGS.forEach((l) => {
                const item = document.createElement('label');
                item.className = 'cw-lang-item';
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.value = String(l.code);
                box.addEventListener('change', () => toggleLang(box));
                const name = document.createElement('span');
                name.textContent = String(l.name || l.code);
                const tag = document.createElement('em');
                tag.textContent = String(l.tag || l.code);
                item.appendChild(box);
                item.appendChild(name);
                item.appendChild(tag);
                langListEl.appendChild(item);
            });
        }
        if (replyLangEl && !replyLangEl.childElementCount) {
            const opts = [
                ['auto', 'Ikuti bahasa pesan'],
                ['mix', 'Bergiliran (campur)'],
            ].concat(LANGS.map((l) => [String(l.code), `Selalu ${String(l.name || l.code)}`]));
            opts.forEach((pair) => {
                const o = document.createElement('option');
                o.value = pair[0];
                o.textContent = pair[1];
                replyLangEl.appendChild(o);
            });
            replyLangEl.addEventListener('change', () => {
                replyLang = String(replyLangEl.value || 'auto');
                vscode.postMessage({ type: 'setReplyLanguage', mode: replyLang });
                noteLang(replyLang === 'auto'
                    ? 'Jawaban mengikuti bahasa pesan; sesekali bahasa lain.'
                    : replyLang === 'mix'
                        ? 'Jawaban bergiliran memakai bahasa terpilih.'
                        : `Jawaban selalu ${langTags([replyLang])}.`);
            });
        }
    }

    /** Selaraskan centang, angka pada tombol 🌐, dan keterangan dengan pilihan aktif. */
    function syncLangMenu() {
        buildLangMenu();
        if (langListEl) {
            langListEl.querySelectorAll('input[type="checkbox"]').forEach((box) => {
                box.checked = langs.indexOf(box.value) !== -1;
            });
        }
        if (langCountEl) { langCountEl.textContent = String(langs.length); }
        if (replyLangEl && replyLangEl.value !== replyLang) { replyLangEl.value = replyLang; }
        if (langEl) {
            langEl.classList.toggle('on', langs.length > 1);
            langEl.title = `Bahasa komunitas: ${langTags(langs)} — klik untuk memilih (boleh lebih dari satu)`;
        }
    }

    /** Kirim pilihan bahasa ke ekstensi; minimal satu bahasa harus tetap aktif. */
    function applyLangs(next, note) {
        const wanted = [...new Set((next || []).map((x) => String(x)))];
        const cleaned = LANGS.map((l) => l.code).filter((c) => wanted.indexOf(c) !== -1);
        if (!cleaned.length) {
            noteLang('Minimal satu bahasa harus dipilih.');
            syncLangMenu();
            return;
        }
        langs = cleaned;
        syncLangMenu();
        noteLang(note || `${langs.length} bahasa dipakai bergiliran: ${langTags(langs)}`);
        vscode.postMessage({ type: 'setCommunityLanguages', languages: langs });
    }

    function toggleLang(box) {
        const set = new Set(langs);
        if (box.checked) { set.add(box.value); } else { set.delete(box.value); }
        applyLangs([...set]);
    }

    /** Keterangan singkat status Firebase untuk baris ⚡ Ramai. */
    function firebaseNote() {
        if (!firebaseStatus) { return ''; }
        if (!firebaseStatus.enabled) { return ' · 📴 mode lokal'; }
        if (firebaseStatus.display === false) { return ' · 💾 chat dibaca dari data lokal'; }
        if (firebaseStatus.ok) { return ' · ☁ database tersambung'; }
        return ` · ☁ database: ${String(firebaseStatus.message || 'belum tersambung')}`;
    }

    /** Tambahkan pesan pengguna secara optimistis (langsung tampil sebelum jawaban). */
    function pushMine(text) {
        liveMessages.push({
            id: 'mine-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            name: profile.name || 'Kamu',
            bio: profile.bio || '',
            text: String(text),
            at: Date.now(),
            atText: '',
            lang: '',
            langTag: '',
            local: true,
            mine: true,
            kind: 'chat',
            room: 'komunitas',
            channel: channel,
        });
        if (liveMessages.length > 5000) { liveMessages.splice(0, liveMessages.length - 5000); }
        render();
    }

    /** Kunci hari untuk pemisah tanggal. */
    function dayKey(ms) {
        const d = new Date(Number(ms) || Date.now());
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }

    /** Label pemisah hari: Hari ini / Kemarin / tanggal panjang. */
    function dayLabel(ms) {
        const d = new Date(Number(ms) || Date.now());
        const now = new Date();
        const today = dayKey(now.getTime());
        const yesterday = dayKey(now.getTime() - 86400000);
        const key = dayKey(d.getTime());
        if (key === today) { return 'Hari ini'; }
        if (key === yesterday) { return 'Kemarin'; }
        return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    /** Jam pesan (HH:MM) untuk pesan yang dikelompokkan. */
    function clock(ms) {
        if (!ms) { return ''; }
        try { return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
    }

    /** Render satu baris pesan komunitas / Diskusi AI. */
    function renderMsg(m, grouped) {
        const isMine = !!m.mine || (profile.name.trim() && m.name.trim().toLowerCase() === profile.name.trim().toLowerCase());
        const nama = esc(m.name || 'tanpa nama');
        const bio = !grouped && m.bio && m.room !== 'diskusi' ? `<div class="cw-bio" title="${esc(m.bio)}">${esc(m.bio)}</div>` : '';
        const badges = [];
        if (m.remote) {
            badges.push(`<span class="cw-local cw-cloud" title="Dibaca dari database — pesan yang sama juga diarsipkan ke ${esc(LOG_LABEL)}">☁ database</span>`);
        } else if (m.persisted) {
            badges.push(`<span class="cw-local cw-saved" title="Dibaca dari ${esc(LOG_LABEL)} — tetap ada setelah refresh">💾 tersimpan</span>`);
        } else if (m.local) {
            badges.push(`<span class="cw-local" title="Dibuat model lokal di komputer Anda (llama-server) dan ditulis ke ${esc(LOG_LABEL)}">⚡ lokal${m.langTag ? ' · ' + esc(m.langTag) : ''}</span>`);
        }
        if (m.channel) {
            badges.push(`<span class="cw-room" title="Ruang obrolan">#${esc(m.channel)}</span>`);
        }
        const skinBadge = m.skinData
            ? `<div class="cw-skin-badge">🎨 <b>Patch Skin</b> · <span class="cw-muted">${esc(m.skinLabel || 'data skin')}</span></div>`
            : '';
        const aiBadge = m.aiResult
            ? `<div class="cw-ai-badge">🤖 <b>Hasil Analisis AI</b></div>`
            : '';
        const textContent = m.text ? `<div class="cw-text">${esc(m.text)}</div>` : '';
        const top = grouped
            ? ''
            : `<div class="cw-top"><span class="cw-name">${nama}</span>${badges.join('')}<span class="cw-when" title="${esc(m.atText || stamp(m.at))}">${esc(when(m.at))}</span></div>`;
        return `<div class="cw-msg${isMine ? ' mine' : ''}${m.local ? ' local' : ''}${m.room === 'diskusi' ? ' ai-room' : ''}${m.skinData ? ' skin-share' : ''}${m.aiResult ? ' ai-share' : ''}${grouped ? ' grouped' : ''}" title="${esc(m.atText || stamp(m.at))}">
            ${grouped ? '' : avatarOf(m.name)}
            <div class="cw-bubble">
                ${top}
                ${bio}
                ${aiBadge}
                ${skinBadge}
                ${textContent}
                ${grouped ? `<span class="cw-mini-time">${esc(clock(m.at))}</span>` : ''}
            </div>
        </div>`;
    }

    /** Ruang aktif saat ini. */
    function activeRoom() { return tab === 'diskusi' ? 'diskusi' : 'komunitas'; }

    /** Tampilkan/sembunyikan tombol “pesan baru” untuk ruang yang sedang dilihat. */
    function updateJump() {
        if (!jumpEl) { return; }
        const room = activeRoom();
        const n = unread[room];
        jumpEl.hidden = n <= 0;
        if (n > 0) { jumpEl.textContent = `↓ ${n} pesan baru`; }
        jumpEl.title = 'Lompat ke pesan terbaru';
    }

    /** Susun daftar pesan komunitas (terlama → terbaru, dengan pemisah hari). */
    function render() {
        if (!msgsEl) { return; }
        renderLive();
        const list = communityMessages();
        paintList(msgsEl, 'komunitas', buildItems(list), footerHtml('komunitas', list.length), list.length);
    }

    /** Susun daftar pesan Diskusi AI (ruang terpisah; sumber Firebase + log). */
    function renderAi() {
        if (!aiMsgsEl) { return; }
        renderAiSource();
        const list = discussionMessages();
        paintList(aiMsgsEl, 'diskusi', buildItems(list), footerHtml('diskusi', list.length), list.length);
    }

    /** Tampilkan ruang yang dipilih (Komunitas / Diskusi AI). */
    function renderTabs() {
        const ai = tab === 'diskusi';
        if (tabCommunityEl) {
            tabCommunityEl.classList.toggle('on', !ai);
            tabCommunityEl.setAttribute('aria-selected', ai ? 'false' : 'true');
        }
        if (tabAiEl) {
            tabAiEl.classList.toggle('on', ai);
            tabAiEl.setAttribute('aria-selected', ai ? 'true' : 'false');
        }
        if (paneCommunityEl) { paneCommunityEl.hidden = ai; }
        if (paneAiEl) { paneAiEl.hidden = !ai; }
        if (root) { root.classList.toggle('cw-tab-ai', ai); }
        if (ai) { renderAi(); }
        updateJump();
    }

    /** Total pesan yang benar-benar terbaca dari data/data.txt. */
    function historyCount() {
        return history.length;
    }

    /** true = ruang Komunitas dibaca dari database (bukan dari log lokal). */
    function firebaseLive() {
        const st = firebaseStatus;
        return !st || (st.enabled !== false && st.display !== false);
    }

    /** Label sumber ruang Komunitas: Firebase lebih dulu, log lokal hanya cadangan/mode offline. */
    function communitySourceLabel() {
        const st = firebaseStatus;
        const collection = (st && st.collection) || 'community';
        if (st && st.enabled === false) { return `💾 log lokal ${LOG_LABEL} · database dimatikan`; }
        if (st && st.display === false) { return `💾 ${LOG_LABEL} · tampilan database dimatikan`; }
        if (!st || (!st.ok && !st.message)) { return `☁ Firebase ${collection} · menyambung…`; }
        if (st.ok) { return `☁ Firebase ${collection}`; }
        return `☁ Firebase ${collection}: ${String(st.message)}`;
    }

    /** Status ringkas: sumber percakapan + jumlah pesan pada ruang yang sedang dilihat. */
    function showLoadedStatus() {
        if (activeRoom() === 'diskusi') {
            status(`diskusi AI · ${discussionMessages().length} pesan · ${aiSourceLabel()}`);
            return;
        }
        const st = firebaseStatus;
        if (firebaseLive()) {
            if (!st || (!st.ok && !st.message)) {
                status(`☁ Firebase ${(st && st.collection) || 'community'} · menyambung…`);
                return;
            }
            status(`${communitySourceLabel()} · ${communityMessages().length} pesan`, !!(st && st.ok === false));
            return;
        }
        status(`${communitySourceLabel()} · ${historyCount()} pesan`);
    }

    function requireProfile() {
        if (!profile.name.trim()) {
            note('Isi nama/username dulu di bagian "Profil Saya", lalu simpan.', true);
            const detailsEl = document.getElementById('cw-me');
            if (detailsEl) { detailsEl.open = true; }
            if (nameEl) { nameEl.focus(); }
            return false;
        }
        return true;
    }

    /** Kirim satu pesan: langsung tampil, dikirim ke Firebase (log lokal tetap ditulis), lalu dijawab. */
    function send() {
        const raw = String(textEl ? textEl.value : '');
        const text = raw.trim();
        if (!text) { return; }
        if (textEl) { textEl.value = ''; }
        renderCounts();
        autoGrow(textEl, 6);
        typing = null;
        stick.komunitas = true;
        unread.komunitas = 0;
        pushMine(text);
        pendingCount += 1;
        vscode.postMessage({ type: 'askCommunity', text, channel, author: profile.name || 'Kamu' });
        status(`${firebaseLive() ? 'dikirim ke Firebase' : 'dicatat di ' + LOG_LABEL} · menyusun jawaban…`);
        if (textEl) { textEl.focus(); }
    }

    /** Bagikan data skin ke catatan obrolan (dan Firebase bila aktif). */
    function applySkinData(payload) {
        const ada = payload && (payload.label || payload.data || payload.id || payload.skinId);
        const tandaSebelum = lastSkinData ? `${lastSkinData.label || ''}|${lastSkinData.data || ''}` : '';
        lastSkinData = ada ? payload : null;
        const tandaSesudah = lastSkinData ? `${lastSkinData.label || ''}|${lastSkinData.data || ''}` : '';
        skinRequestSent = false;
        if (sendSkinEl) {
            sendSkinEl.disabled = false;
            sendSkinEl.title = lastSkinData
                ? `Bagikan skin aktif: ${lastSkinData.label || 'skin'}`
                : 'Bagikan skin aktif pet Spider ke ruang komunitas';
        }
        if (!pendingSkinShare) {
            if (lastSkinData && tandaSesudah !== tandaSebelum) {
                status(`Skin "${lastSkinData.label || 'skin'}" siap dibagikan · klik 🎨 Bagikan Skin`);
            }
            return;
        }
        pendingSkinShare = false;
        if (lastSkinData) { sendSkin(); }
        else { note('Data skin tidak tersedia dari ekstensi.', true); }
    }

    /** Kirim label skin sebagai pesan yang tersimpan di data/data.txt. */
    function sendSkin() {
        if (!requireProfile()) { return; }
        if (!lastSkinData) {
            if (!skinRequestSent) {
                skinRequestSent = true;
                pendingSkinShare = true;
                status('mengambil data skin aktif dari pet…');
                vscode.postMessage({ type: 'requestSkin' });
                return;
            }
            note('Data skin belum diterima dari ekstensi. Buka view Pet Skin sekali, lalu tekan tombol ini lagi.', true);
            return;
        }
        const label = lastSkinData.label || lastSkinData.name || 'skin-patch';
        vscode.postMessage({
            type: 'appendChat',
            text: `[Patch Skin] ${label}`,
            author: profile.name,
            channel,
            tag: 'bagikan skin',
        });
        status('skin dibagikan · ' + communitySourceLabel());
    }

    /** Bagikan hasil analisis AI terakhir ke ruang komunitas. */
    function sendAi() {
        if (!requireProfile()) { return; }
        if (!lastAiText) {
            note('Belum ada hasil AI yang diterima. Jalankan analisis AI terlebih dahulu.', true);
            return;
        }
        vscode.postMessage({
            type: 'appendChat',
            text: lastAiText.slice(0, 900),
            author: profile.name,
            channel,
            tag: 'hasil analisis AI',
        });
        lastAiText = null;
        if (sendAiEl) { sendAiEl.style.display = 'none'; }
        status('hasil analisis dibagikan · ' + communitySourceLabel());
    }

    /** Kirim satu permasalahan ke ruang Diskusi AI (Firebase `diskusi_ai`; log di data/data.txt). */
    function sendDiscussion() {
        const text = String(aiTextEl ? aiTextEl.value : '').trim();
        if (!text) { return; }
        aiTextEl.value = '';
        renderCounts();
        autoGrow(aiTextEl, 8);
        stick.diskusi = true;
        unread.diskusi = 0;
        aiMessages.push({
            id: 'ai-mine-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            name: profile.name || 'Kamu',
            bio: profile.bio || '',
            text,
            at: Date.now(),
            atText: '',
            lang: '',
            langTag: '',
            local: true,
            mine: true,
            kind: 'chat',
            room: 'diskusi',
        });
        aiTyping = { name: 'Spider AI', langTag: '' };
        pendingCount += 1;
        if (aiTypingTimer) { clearTimeout(aiTypingTimer); }
        aiTypingTimer = setTimeout(() => { aiTyping = null; renderAi(); }, 150000);
        status(`diskusi AI menyusun jawaban · ${aiSourceLabel()}`);
        renderAi();
        vscode.postMessage({ type: 'aiAsk', text, author: profile.name || 'Kamu' });
        if (aiTextEl) { aiTextEl.focus(); }
    }

    /** Simpan profil (dikirim ke ekstensi agar tersimpan di globalState) + tampilkan ringkasannya. */
    function saveProfile() {
        const name = String(nameEl ? nameEl.value : '').trim();
        const bio = String(bioEl ? bioEl.value : '').trim();
        if (!name) { note('Nama tampilan tidak boleh kosong.', true); if (nameEl) { nameEl.focus(); } return; }
        profile = { name, bio };
        vscode.setState(Object.assign({}, vscode.getState() || {}, { profile, channel }));
        vscode.postMessage({ type: 'saveProfile', name, bio });
        note('Profil disimpan. Nama dan deskripsi ini ikut tercatat pada pesan berikutnya.');
        renderSummary();
    }

    function renderSummary() {
        const p = profile.name.trim();
        if (meSumEl) { meSumEl.textContent = p ? `· ${p}${profile.bio.trim() ? ' — ' + profile.bio.trim() : ''}` : '· nama belum diisi'; }
        if (avatarEl) { avatarEl.src = AVATAR; }
    }

    /** Isi dropdown ruang + pulihkan ruang terakhir. */
    function buildChannels() {
        if (!channelEl) { return; }
        channelEl.innerHTML = CHANNELS.map((c) => `<option value="${esc(c.id)}" title="${esc(c.desc || '')}">${esc(c.label || c.id)}</option>`).join('');
        if (saved.channel && CHANNELS.some((c) => c.id === saved.channel)) { channel = saved.channel; }
        channelEl.value = channel;
    }

    /** Tampilkan URL API JSON yang sedang berjalan. */
    function renderApi() {
        if (!apiLineEl) { return; }
        const enabled = !apiInfo || apiInfo.enabled !== false;
        const url = enabled && apiInfo && apiInfo.chat ? String(apiInfo.chat) : '';
        apiLineEl.hidden = !url;
        if (url && apiUrlEl) { apiUrlEl.textContent = url; }
        if (apiEl) {
            apiEl.disabled = !enabled;
            apiEl.title = enabled
                ? 'Buka API JSON baca-saja di browser (127.0.0.1)'
                : 'API JSON dimatikan lewat pengaturan dateSkunder.community.api';
        }
        if (apiTermNoteEl) {
            apiTermNoteEl.hidden = !url;
            const running = !!(url && apiInfo && apiInfo.running);
            apiTermNoteEl.dataset.state = running ? 'on' : 'off';
            if (apiTermStateEl) {
                apiTermStateEl.textContent = running
                    ? 'Server API JSON berjalan di terminal “API JSON Chat” — siap dipakai website lokal.'
                    : 'Server API JSON belum berjalan. Buka terminal lalu ketik start.';
            }
        }
    }

    /** Baca ulang catatan lokal DAN database (tombol ⟳). */
    function reloadHistory() {
        vscode.postMessage({ type: 'refreshRemote' });
        vscode.postMessage({ type: 'reloadHistory' });
        status(firebaseLive() ? 'menyegarkan percakapan dari Firebase…' : 'membaca ulang ' + LOG_LABEL + '…');
    }

    // ── kejadian UI ────────────────────────────────────────────────────────────
    if (channelEl) {
        channelEl.addEventListener('change', () => {
            channel = channelEl.value;
            vscode.setState(Object.assign({}, vscode.getState() || {}, { profile, channel, tab }));
            vscode.postMessage({ type: 'channelChanged', channel });
            status(`ruang tulis #${channel} · ${firebaseLive() ? 'pesan dibaca dari Firebase' : 'pesan dibaca dari ' + LOG_LABEL}`);
        });
    }
    if (tabCommunityEl) {
        tabCommunityEl.addEventListener('click', () => {
            tab = 'komunitas';
            vscode.setState(Object.assign({}, vscode.getState() || {}, { profile, channel, tab }));
            renderTabs();
            render();
        });
    }
    if (tabAiEl) {
        tabAiEl.addEventListener('click', () => {
            tab = 'diskusi';
            vscode.setState(Object.assign({}, vscode.getState() || {}, { profile, channel, tab }));
            renderTabs();
            renderAi();
            status(`diskusi AI · ${discussionMessages().length} pesan · ${aiSourceLabel()}`);
            if (aiTextEl) { aiTextEl.focus(); }
        });
    }
    if (aiSendEl) { aiSendEl.addEventListener('click', sendDiscussion); }
    if (aiTextEl) {
        aiTextEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendDiscussion(); }
        });
    }
    [textEl, aiTextEl].forEach((el) => {
        if (!el) { return; }
        el.addEventListener('input', () => {
            renderCounts();
            autoGrow(el, el === aiTextEl ? 8 : 6);
        });
    });
    if (openLogEl) { openLogEl.addEventListener('click', () => vscode.postMessage({ type: 'openChatLog' })); }
    if (jsonEl) { jsonEl.addEventListener('click', () => vscode.postMessage({ type: 'downloadChatJson' })); }
    if (jsonRemoteEl) { jsonRemoteEl.addEventListener('click', () => vscode.postMessage({ type: 'downloadRemoteJson' })); }
    if (apiEl) { apiEl.addEventListener('click', () => vscode.postMessage({ type: 'openChatApi' })); }
    if (apiCopyEl) { apiCopyEl.addEventListener('click', () => vscode.postMessage({ type: 'copyChatApi' })); }
    [apiTermEl, apiTerm2El].forEach((el) => {
        if (el) { el.addEventListener('click', () => vscode.postMessage({ type: 'openChatApiTerminal' })); }
    });
    if (apiTermOpenEl) {
        apiTermOpenEl.addEventListener('click', () => vscode.postMessage({ type: 'openChatApiTerminal' }));
    }
    if (refreshEl) {
        refreshEl.addEventListener('click', () => {
            refreshEl.classList.add('spin');
            reloadHistory();
            setTimeout(() => refreshEl.classList.remove('spin'), 900);
        });
    }
    if (sendEl) { sendEl.addEventListener('click', send); }
    if (textEl) {
        textEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); send(); }
        });
    }
    if (saveEl) { saveEl.addEventListener('click', saveProfile); }
    if (sendSkinEl) { sendSkinEl.addEventListener('click', sendSkin); }
    if (sendAiEl) { sendAiEl.addEventListener('click', sendAi); }
    if (liveEl) { liveEl.addEventListener('click', () => vscode.postMessage({ type: 'liveToggle' })); }

    // ── pemilih bahasa komunitas (🌐): boleh lebih dari satu ─────────────────
    if (langEl) {
        langEl.addEventListener('click', () => {
            const open = !!(langMenuEl && langMenuEl.hidden);
            if (langMenuEl) { langMenuEl.hidden = !open; }
            langEl.setAttribute('aria-expanded', String(open));
            if (open) { syncLangMenu(); }
        });
    }
    if (langAllEl) {
        langAllEl.addEventListener('click', () => applyLangs(LANGS.map((l) => l.code), 'Semua bahasa dipakai bergiliran.'));
    }
    if (langResetEl) {
        langResetEl.addEventListener('click', () => applyLangs(['id', 'en', 'zh', 'ja', 'es'], 'Pilihan awal: 5 bahasa (ID · EN · 中文 · 日本語 · ES).'));
    }
    // Klik di luar panel menutup menu bahasa supaya tidak menutupi pesan.
    document.addEventListener('click', (e) => {
        if (!langMenuEl || langMenuEl.hidden) { return; }
        const target = e.target;
        if (langMenuEl.contains(target) || (langEl && langEl.contains(target))) { return; }
        langMenuEl.hidden = true;
        if (langEl) { langEl.setAttribute('aria-expanded', 'false'); }
    });
    if (jumpEl) {
        jumpEl.addEventListener('click', () => {
            const room = activeRoom();
            const el = room === 'diskusi' ? aiMsgsEl : msgsEl;
            stick[room] = true;
            unread[room] = 0;
            if (el) { el.scrollTop = el.scrollHeight; }
            updateJump();
        });
    }
    // Daftar pesan: menempel di bawah selama pengguna tidak membaca ke atas.
    [[msgsEl, 'komunitas'], [aiMsgsEl, 'diskusi']].forEach(([el, room]) => {
        if (!el) { return; }
        el.addEventListener('scroll', () => {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
            stick[room] = atBottom;
            if (atBottom && unread[room]) { unread[room] = 0; updateJump(); }
        });
    });
    window.addEventListener('resize', () => {
        const room = activeRoom();
        if (!stick[room]) { return; }
        const el = room === 'diskusi' ? aiMsgsEl : msgsEl;
        if (el) { el.scrollTop = el.scrollHeight; }
    });
    document.addEventListener('visibilitychange', () => {
        const vis = document.visibilityState === 'visible';
        // Diskusi otomatis hanya berjalan saat ruang terlihat → tidak memakan CPU saat disembunyikan.
        vscode.postMessage({ type: 'communityVisible', visible: vis });
    });

    // ── pesan dari ekstensi ────────────────────────────────────────────────────
    window.addEventListener('message', (e) => {
        const m = e.data || {};
        if (m.type === 'communityConfig') {
            if (m.defaultAvatar) { AVATAR = String(m.defaultAvatar); }
            if (m.logLabel) { LOG_LABEL = String(m.logLabel); }
            if (m.profile) { profile = { name: String(m.profile.name || ''), bio: String(m.profile.bio || '') }; }
            liveStatus = m.live || null;
            if (m.live && Array.isArray(m.live.languages) && m.live.languages.length) { langs = m.live.languages.slice(); }
            if (m.replyLanguage) { replyLang = String(m.replyLanguage); }
            firebaseStatus = m.firebase || null;
            apiInfo = m.api || null;
            autoClearAt = Number(m.autoClearAt) || 0;
            if (Array.isArray(m.history)) { history = m.history; }
            // Ruang Komunitas dibaca langsung dari Firebase (bukan dari data/data.txt).
            if (Array.isArray(m.remoteMessages)) {
                remoteMessages = m.remoteMessages.map(normalizeLive).filter(Boolean);
            }
            // Diskusi AI juga dibaca dari Firebase (koleksi `diskusi_ai`).
            if (Array.isArray(m.aiRemoteMessages)) {
                aiRemoteMessages = m.aiRemoteMessages.map(normalizeLive).filter(Boolean);
            }
            if (m.diskusi) { aiStatus = m.diskusi; }
            if (Array.isArray(m.recent)) {
                liveMessages = m.recent.map(normalizeLive).filter(Boolean);
            }
            if (Array.isArray(m.aiRecent)) {
                aiMessages = m.aiRecent.map(normalizeLive).filter(Boolean);
            }
            if (nameEl) { nameEl.value = profile.name; }
            if (bioEl) { bioEl.value = profile.bio; }
            renderSummary();
            renderLive();
            syncLangMenu();
            noteLang(langs.length > 1
                ? `mengikuti pengaturan community.languages · ${langs.length} bahasa bergiliran: ${langTags(langs)}`
                : `hanya ${langTags(langs)} · pilih lebih dari satu agar komunitas tidak satu bahasa`);
            renderApi();
            renderTabs();
            render();
            renderAi();
            if (m.skin) { applySkinData(m.skin); }
            showLoadedStatus();
        } else if (m.type === 'chatHistory') {
            // Riwayat lokal berubah / dimuat ulang: ganti riwayat tanpa menghapus sesi.
            if (Array.isArray(m.history)) { history = m.history; }
            // Pesan Firebase ikut diganti (rotasi 100 → 0 percakapan).
            if (Array.isArray(m.remoteMessages)) {
                remoteMessages = m.remoteMessages.map(normalizeLive).filter(Boolean);
            }
            // Diskusi AI: pesan Firebase + status koleksinya ikut disegarkan.
            if (Array.isArray(m.aiRemoteMessages)) {
                aiRemoteMessages = m.aiRemoteMessages.map(normalizeLive).filter(Boolean);
            }
            if (m.aiStatus) { aiStatus = m.aiStatus; }
            if (m.logLabel) { LOG_LABEL = String(m.logLabel); }
            if (m.autoClearAt !== undefined) { autoClearAt = Number(m.autoClearAt) || 0; }
            render();
            renderAi();
            renderLive();
            showLoadedStatus();
        } else if (m.type === 'chatClearing') {
            status(`menyiapkan arsip · ${Number(m.count) || Number(m.limit) || autoClearAt} pesan…`);
        } else if (m.type === 'chatCleared') {
            // Rotasi otomatis: kosongkan semua tampilan (arsip tetap ada di data/arsip).
            history = [];
            liveMessages = [];
            aiMessages = [];
            remoteMessages = [];
            streaming = { komunitas: null, diskusi: null };
            typing = null;
            aiTyping = null;
            if (typingTimer) { clearTimeout(typingTimer); typingTimer = 0; }
            if (aiTypingTimer) { clearTimeout(aiTypingTimer); aiTypingTimer = 0; }
            listState.komunitas.keys = [];
            listState.diskusi.keys = [];
            lastCount = { komunitas: 0, diskusi: 0 };
            unread = { komunitas: 0, diskusi: 0 };
            pendingCount = 0;
            render();
            renderAi();
            const archiveName = String(m.archived || '').split(/[\\/]/).pop();
            status(`chat dibersihkan otomatis (${Number(m.count) || Number(m.limit) || autoClearAt} pesan)${archiveName ? ` · arsip ${archiveName}` : ''}`);
        } else if (m.type === 'chatClearResult') {
            if (m.skipped) {
                status('chat dibersihkan · database dimatikan (arsip lokal)');
            } else if (m.ok) {
                status(`database dibersihkan · ${Number(m.deleted) || 0} pesan dihapus`);
            } else {
                status(`chat dibersihkan · database: ${String(m.message || 'sebagian gagal dihapus')}`, true);
            }
        } else if (m.type === 'aiRemote') {
            // Pesan Diskusi AI dari Firebase: ganti/gabungkan, lalu render ulang ruangnya.
            if (Array.isArray(m.messages)) {
                const incoming = m.messages.map(normalizeLive).filter(Boolean);
                const base = m.replace ? [] : aiRemoteMessages;
                const merged = [];
                for (const msg of base.concat(incoming)) {
                    if (!merged.some((x) => x.id === msg.id)) { merged.push(msg); }
                }
                aiRemoteMessages = merged.slice(-5000);
            }
            if (m.status) { aiStatus = m.status; }
            renderAi();
            if (activeRoom() === 'diskusi') {
                status(`diskusi AI · ${discussionMessages().length} pesan · ${aiSourceLabel()}`);
            }
        } else if (m.type === 'communityAiStatus') {
            aiStatus = m.status || null;
            renderAiSource();
        } else if (m.type === 'aiCleared') {
            // Rotasi Diskusi AI: Firebase dikosongkan, log data/data.txt tetap utuh.
            aiMessages = [];
            aiRemoteMessages = [];
            if (aiStatus) { aiStatus = Object.assign({}, aiStatus, { count: 0, ok: true, message: '' }); }
            streaming.diskusi = null;
            aiTyping = null;
            if (aiTypingTimer) { clearTimeout(aiTypingTimer); aiTypingTimer = 0; }
            listState.diskusi.keys = [];
            lastCount.diskusi = 0;
            unread.diskusi = 0;
            renderAi();
            const archiveName = String(m.archived || '').split(/[\\/]/).pop();
            status(`Diskusi AI dibersihkan otomatis (${Number(m.count) || Number(m.limit) || autoClearAt} pesan) · ${Number(m.deleted) || 0} pesan dihapus dari Firebase${archiveName ? ` · arsip ${archiveName}` : ''} · log tetap di ${LOG_LABEL}`);
        } else if (m.type === 'aiClearResult') {
            status(`rotasi Diskusi AI gagal: ${String(m.message || 'database tidak merespons')}`, true);
        } else if (m.type === 'chatJsonSaved') {
            const nama = String(m.path || '').split(/[\\/]/).pop();
            const asal = m.source === 'firebase' ? 'database' : 'arsip lokal';
            status(`JSON ${Number(m.total) || 0} pesan (${asal}) tersimpan: ${nama}`);
        } else if (m.type === 'chatJsonError') {
            status('gagal mengunduh JSON: ' + String(m.message || ''), true);
        } else if (m.type === 'chatJsonCancelled') {
            status('unduh JSON dibatalkan');
        } else if (m.type === 'communityLive') {
            const msg = normalizeLive(m.message);
            if (msg) {
                // Pesan akhir menggantikan draft streaming di ruang yang sama.
                streaming[msg.room] = null;
                if (msg.room === 'diskusi') {
                    if (!aiMessages.some((x) => x.id === msg.id)) { aiMessages.push(msg); }
                    if (aiMessages.length > 5000) { aiMessages.splice(0, aiMessages.length - 5000); }
                    aiTyping = null;
                    if (aiTypingTimer) { clearTimeout(aiTypingTimer); aiTypingTimer = 0; }
                    status(`diskusi AI · ${discussionMessages().length} pesan · ${aiSourceLabel()}`);
                    renderAi();
                } else {
                    if (!liveMessages.some((x) => x.id === msg.id)) { liveMessages.push(msg); }
                    typing = null;
                    if (typingTimer) { clearTimeout(typingTimer); typingTimer = 0; }
                    render();
                }
            }
        } else if (m.type === 'communityLiveStream') {
            // Teks jawaban mengalir potongan demi potongan: tampilkan draft, bukan menunggu selesai.
            const room = m.room === 'diskusi' ? 'diskusi' : 'komunitas';
            if (m.done) {
                streaming[room] = null;
                renderFooter(room);
                return;
            }
            const draft = {
                id: String(m.id || 'draft'),
                name: String(m.name || 'anggota'),
                bio: String(m.bio || ''),
                langTag: String(m.langTag || ''),
                text: String(m.text || ''),
            };
            const before = streaming[room];
            streaming[room] = draft;
            // Draft baru menggantikan indikator “menulis…”.
            if (room === 'diskusi') { aiTyping = null; } else { typing = null; }
            if (!before || before.id !== draft.id) { renderFooter(room); } else { updateDraft(room, draft); }
        } else if (m.type === 'communityLiveQueue') {
            pendingCount = Math.max(0, Number(m.pending) || 0);
            syncPending();
        } else if (m.type === 'communityLiveTyping') {
            if (m.done) {
                const room = m.room === 'diskusi' ? 'diskusi' : 'komunitas';
                if (room === 'diskusi') { aiTyping = null; } else { typing = null; }
                renderFooter(room);
                return;
            }
            const who = { name: String(m.name || 'anggota'), langTag: String(m.langTag || '') };
            if (m.room === 'diskusi') {
                aiTyping = who;
                if (aiTypingTimer) { clearTimeout(aiTypingTimer); }
                aiTypingTimer = setTimeout(() => { aiTyping = null; renderFooter('diskusi'); }, 150000);
                renderFooter('diskusi');
            } else {
                typing = who;
                if (typingTimer) { clearTimeout(typingTimer); }
                // Jaring pengaman: indikator tidak boleh berhenti selamanya bila model gagal.
                typingTimer = setTimeout(() => { typing = null; renderFooter('komunitas'); }, 90000);
                renderFooter('komunitas');
            }
        } else if (m.type === 'communityLiveStatus') {
            liveStatus = m.status || null;
            if (Array.isArray(m.langs) && m.langs.length) { langs = m.langs.slice(); }
            else if (m.status && Array.isArray(m.status.languages) && m.status.languages.length) { langs = m.status.languages.slice(); }
            if (m.replyLanguage) { replyLang = String(m.replyLanguage); }
            renderLive();
            syncLangMenu();
        } else if (m.type === 'communityRemote') {
            // Pesan dari Firebase: ganti/gabungkan tanpa duplikat, lalu render ulang.
            if (Array.isArray(m.messages)) {
                const incoming = m.messages.map(normalizeLive).filter(Boolean);
                const base = m.replace ? [] : remoteMessages;
                const merged = [];
                for (const msg of base.concat(incoming)) {
                    if (!merged.some((x) => x.id === msg.id)) { merged.push(msg); }
                }
                remoteMessages = merged.slice(-5000);
            }
            if (m.status) { firebaseStatus = m.status; }
            render();
            renderLive();
            const total = communityMessages().length;
            const bad = !!(m.status && m.status.ok === false);
            status(m.archived
                ? `${communitySourceLabel()} · ${total} pesan (${Number(m.archived)} baru)`
                : `${communitySourceLabel()} · ${total} pesan`, bad);
        } else if (m.type === 'communityFirebaseStatus') {
            firebaseStatus = m.status || null;
            renderLive();
            if (firebaseStatus && firebaseStatus.enabled && firebaseStatus.ok === false && firebaseStatus.message) {
                status(`${communitySourceLabel()} — pesan tetap tampil dari ${LOG_LABEL}`, true);
            }
        } else if (m.type === 'chatApiInfo') {
            apiInfo = m.api || null;
            renderApi();
        } else if (m.type === 'communityProfile') {
            profile = { name: String(m.profile && m.profile.name || ''), bio: String(m.profile && m.profile.bio || '') };
            if (nameEl) { nameEl.value = profile.name; }
            if (bioEl) { bioEl.value = profile.bio; }
            renderSummary();
            render();
        } else if (m.type === 'prefillMessage') {
            // Panel lain (AI chat, spider) mengirim teks agar bisa dibagikan ke komunitas.
            const txt = String(m.text || '').trim();
            if (txt) {
                lastAiText = txt;
                if (sendAiEl) { sendAiEl.style.display = ''; sendAiEl.disabled = false; }
                if (textEl) { textEl.value = txt.slice(0, 900); textEl.focus(); }
                status('Teks AI siap dibagikan. Klik "Kirim" atau gunakan tombol 🤖 Bagikan ke Chat.');
            }
        } else if (m.type === 'skinData') {
            applySkinData(m.payload || { label: m.label || 'skin', data: m.data || '' });
        }
    });

    // ── awal ───────────────────────────────────────────────────────────────────
    buildChannels();
    if (saved.profile && saved.profile.name) { profile = { name: String(saved.profile.name), bio: String(saved.profile.bio || '') }; }
    if (cfg.profile && cfg.profile.name) { profile = { name: String(cfg.profile.name), bio: String(cfg.profile.bio || '') }; }
    if (nameEl) { nameEl.value = profile.name; }
    if (bioEl) { bioEl.value = profile.bio; }
    renderSummary();
    renderTabs();
    render();
    renderAi();
    renderCounts();
    if (cfg.skin) { applySkinData(cfg.skin); }
    renderLive();
    renderApi();
    vscode.postMessage({ type: 'ready' });
    vscode.postMessage({ type: 'communityVisible', visible: document.visibilityState !== 'hidden' });
})();
