/* Publish Date Skunder: menulis artikel (judul, ringkasan, isi, tautan tujuan, sampul)
   lalu menerbitkannya ke database lewat extension host. Login memakai email + kata sandi.
   Tampilan baca dibuat seperti halaman ensiklopedia: judul serif, infobox sampul, paragraf. */
(function () {
    const vscode = acquireVsCodeApi();
    const cfg = window.SKUNDER_PUBLISH || {};
    const $ = (id) => document.getElementById(id);

    const stateEl = $('pub-state');
    const dbEl = $('pub-db');
    const dbTextEl = $('pub-db-text');
    const dbCheckEl = $('pub-db-check');
    const authEl = $('pub-auth');
    const authFormEl = $('pub-auth-form');
    const authMsgEl = $('pub-auth-msg');
    const modeInEl = $('pub-mode-in');
    const modeUpEl = $('pub-mode-up');
    const emailEl = $('pub-email');
    const passEl = $('pub-pass');
    const pass2El = $('pub-pass2');
    const pass2WrapEl = $('pub-pass2-wrap');
    const authSubmitEl = $('pub-auth-submit');
    const whoEl = $('pub-who');
    const whoEmailEl = $('pub-who-email');
    const signOutEl = $('pub-signout');

    const tabWriteEl = $('pub-tab-write');
    const tabReadEl = $('pub-tab-read');
    const paneWriteEl = $('pub-pane-write');
    const paneReadEl = $('pub-pane-read');

    const titleEl = $('pub-title');
    const leadEl = $('pub-lead');
    const bodyEl = $('pub-body');
    const linkEl = $('pub-link');
    const coverEl = $('pub-cover');
    const authorEl = $('pub-author');
    const publishEl = $('pub-publish');
    const clearEl = $('pub-clear');
    const msgEl = $('pub-msg');
    const previewEl = $('pub-preview');

    const searchEl = $('pub-search');
    const reloadEl = $('pub-reload');
    const countEl = $('pub-count');
    const listEl = $('pub-list');
    const articleEl = $('pub-article');

    let signedIn = false;
    let email = '';
    let localId = '';
    let articles = [];
    let draft = null;
    let view = 'write';
    let filter = '';
    let selectedId = '';
    let authMode = 'in';
    let offline = false;
    let needsAuth = false;
    let pendingDelete = '';
    let draftTimer = 0;

    const saved = vscode.getState() || {};
    if (saved.view === 'read') { view = 'read'; }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** URL yang aman untuk href/src (hanya http/https). */
    function safeUrl(value) {
        const raw = String(value || '').trim();
        return /^https?:\/\//i.test(raw) ? esc(raw) : '';
    }

    function hostOf(value) {
        try { return new URL(String(value || '')).hostname.replace(/^www\./, ''); } catch { return ''; }
    }

    function status(text) {
        if (stateEl) { stateEl.textContent = String(text || ''); }
    }

    function note(el, text, bad) {
        if (!el) { return; }
        el.hidden = !text;
        el.textContent = String(text || '');
        el.className = 'pub-msg' + (bad ? ' bad' : ' ok');
    }

    /** Status koneksi database: terhubung / perlu masuk / akses ditolak / offline. */
    function renderDb(db) {
        if (!dbEl) { return; }
        const info = db || {};
        const state = String(info.state || 'checking');
        dbEl.hidden = false;
        dbEl.dataset.state = state;
        const label = state === 'online' ? 'Database: terhubung'
            : state === 'auth' ? 'Database: perlu masuk'
            : state === 'rules' ? 'Database: akses ditolak'
            : state === 'key' ? 'Database: kunci belum diisi'
            : state === 'offline' ? 'Database: offline'
            : state === 'checking' ? 'Database: memeriksa…'
            : 'Database: bermasalah';
        if (dbTextEl) {
            dbTextEl.textContent = label + (info.message && state !== 'online' ? ` — ${info.message}` : '');
        }
        if (dbCheckEl) {
            dbCheckEl.disabled = state === 'checking';
            dbCheckEl.textContent = state === 'checking' ? 'Memeriksa…' : 'Uji koneksi';
        }
        dbEl.title = [label, info.message, info.projectId ? `proyek: ${info.projectId}` : ''].filter(Boolean).join(' · ');
    }

    function setForm(article) {
        const a = article || {};
        if (titleEl) { titleEl.value = String(a.title || ''); }
        if (leadEl) { leadEl.value = String(a.lead || ''); }
        if (bodyEl) { bodyEl.value = String(a.body || ''); }
        if (linkEl) { linkEl.value = String(a.link || ''); }
        if (coverEl) { coverEl.value = String(a.cover || ''); }
        if (authorEl) { authorEl.value = String(a.authorName || authorEl.value || ''); }
        renderPreview();
    }

    function readForm() {
        return {
            title: String(titleEl ? titleEl.value : '').trim(),
            lead: String(leadEl ? leadEl.value : '').trim(),
            body: String(bodyEl ? bodyEl.value : '').trim(),
            link: String(linkEl ? linkEl.value : '').trim(),
            cover: String(coverEl ? coverEl.value : '').trim(),
            authorName: String(authorEl ? authorEl.value : '').trim(),
        };
    }

    /** Validasi sama dengan sisi ekstensi supaya kesalahan langsung terlihat. */
    function validate(a) {
        if (a.title.length < 3) { return 'Judul artikel minimal 3 karakter.'; }
        if (a.title.length > 120) { return 'Judul artikel maksimal 120 karakter.'; }
        if (a.lead.length < 10) { return 'Ringkasan pembuka minimal 10 karakter.'; }
        if (a.lead.length > 600) { return 'Ringkasan pembuka maksimal 600 karakter.'; }
        if (!a.link) { return 'Tautan tujuan wajib diisi.'; }
        if (!/^https?:\/\/\S+$/i.test(a.link)) { return 'Tautan tujuan harus diawali http:// atau https://.'; }
        if (a.cover && !/^https?:\/\/\S+$/i.test(a.cover)) { return 'Tautan sampul harus diawali http:// atau https://.'; }
        if (a.body.length > 12000) { return 'Isi artikel maksimal 12.000 karakter.'; }
        return '';
    }

    function dateText(ms) {
        if (!ms) { return ''; }
        try {
            return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch { return ''; }
    }

    function paragraphs(text) {
        return String(text || '')
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => `<p>${esc(p).replace(/\n/g, '<br />')}</p>`)
            .join('');
    }

    /* ── sesi ────────────────────────────────────────────────────────────────── */

    function renderAuthMode() {
        const up = authMode === 'up';
        if (modeInEl) { modeInEl.classList.toggle('on', !up); modeInEl.setAttribute('aria-selected', up ? 'false' : 'true'); }
        if (modeUpEl) { modeUpEl.classList.toggle('on', up); modeUpEl.setAttribute('aria-selected', up ? 'true' : 'false'); }
        if (pass2WrapEl) { pass2WrapEl.hidden = !up; }
        if (authSubmitEl) { authSubmitEl.textContent = up ? 'Buat akun & masuk' : 'Masuk'; }
        if (passEl) { passEl.autocomplete = up ? 'new-password' : 'current-password'; }
        note(authMsgEl, '');
    }

    function renderSession() {
        if (authEl) { authEl.hidden = signedIn; }
        if (whoEl) { whoEl.hidden = !signedIn; }
        if (whoEmailEl) { whoEmailEl.textContent = email || '—'; }
        if (publishEl) {
            publishEl.disabled = !signedIn;
            publishEl.title = signedIn ? 'Terbitkan artikel ke database' : 'Masuk dulu dengan email & kata sandi database';
        }
        if (signedIn && !authorEl.value.trim()) {
            authorEl.value = email.split('@')[0] || '';
        }
    }

    /* ── artikel ─────────────────────────────────────────────────────────────── */

    function metaRow(label, value) {
        return value ? `<tr><th>${esc(label)}</th><td>${value}</td></tr>` : '';
    }

    function renderArticleCard(a) {
        const cover = safeUrl(a.cover);
        const thumb = cover
            ? `<img class="pub-card-cover" src="${cover}" alt="" data-cover="1" />`
            : '<div class="pub-card-cover pub-card-cover-empty">📄</div>';
        const host = hostOf(a.link);
        return `<button class="pub-card" type="button" data-open="${esc(a.id)}">
            ${thumb}
            <span class="pub-card-body">
                <span class="pub-card-title">${esc(a.title)}</span>
                <span class="pub-card-lead">${esc(String(a.lead || '').slice(0, 180))}</span>
                <span class="pub-card-meta">${esc(a.authorName || a.authorEmail || 'anonim')}${host ? ` · ${esc(host)}` : ''}${a.createdAt ? ` · ${esc(dateText(a.createdAt))}` : ''}</span>
            </span>
        </button>`;
    }

    function renderList() {
        if (!listEl) { return; }
        const key = filter.trim().toLowerCase();
        const list = articles.filter((a) => !key
            || String(a.title || '').toLowerCase().includes(key)
            || String(a.lead || '').toLowerCase().includes(key)
            || String(a.authorName || '').toLowerCase().includes(key));
        if (!list.length) {
            listEl.innerHTML = `<div class="pub-empty">${articles.length
                ? 'Tidak ada artikel yang cocok dengan pencarian.'
                : needsAuth
                    ? 'Masuk dengan email & kata sandi database untuk memuat artikel. Draf tulisanmu tetap tersimpan.'
                    : 'Belum ada artikel. Tulis artikel pertama di tab ✍️ Tulis, lalu terbitkan.'}</div>`;
            return;
        }
        listEl.innerHTML = list.map(renderArticleCard).join('');
        bindCovers(listEl);
    }

    function bindCovers(scope) {
        scope.querySelectorAll('img[data-cover]').forEach((img) => {
            img.addEventListener('error', () => {
                const holder = document.createElement('div');
                holder.className = 'pub-card-cover pub-card-cover-empty';
                holder.textContent = '🖼️';
                img.replaceWith(holder);
            }, { once: true });
        });
    }

    /** Halaman artikel bergaya ensiklopedia: judul, infobox, paragraf pembuka, isi. */
    function renderArticle(a) {
        if (!articleEl) { return; }
        const cover = safeUrl(a.cover);
        const link = safeUrl(a.link);
        const mine = !!localId && String(a.authorUid || '') === String(localId);
        const host = hostOf(a.link);
        const figure = cover
            ? `<figure class="pub-figure"><img src="${cover}" alt="Sampul ${esc(a.title)}" data-cover="1" /><figcaption>${esc(a.title)}</figcaption></figure>`
            : '';
        const infobox = `
            <aside class="pub-infobox">
                ${figure}
                <div class="pub-infobox-title">${esc(a.title)}</div>
                <table class="pub-infobox-table">
                    ${metaRow('Penulis', `<b>${esc(a.authorName || a.authorEmail || 'anonim')}</b>`)}
                    ${metaRow('Diterbitkan', esc(dateText(a.createdAt) || '—'))}
                    ${metaRow('Tautan tujuan', link ? `<a href="${link}" data-open-link="1">${esc(host || 'buka')}</a>` : '')}
                    ${metaRow('Penulis akun', esc(a.authorEmail || ''))}
                    ${metaRow('Id artikel', `<code>${esc(a.id)}</code>`)}
                </table>
                ${link ? `<button class="pub-btn pub-btn-small" type="button" data-open-link="1" data-url="${link}">Buka tautan tujuan</button>` : ''}
            </aside>`;

        articleEl.innerHTML = `
            <div class="pub-art-tools">
                <button class="pub-link" type="button" data-back="1">← Semua artikel</button>
                ${mine ? `<button class="pub-link pub-danger" type="button" data-delete="${esc(a.id)}">${pendingDelete === a.id ? 'Yakin? Klik lagi untuk hapus' : 'Hapus artikel'}</button>` : ''}
            </div>
            <header class="pub-art-head">
                <div class="pub-kicker">Artikel · Date Skunder Publish</div>
                <h1>${esc(a.title)}</h1>
                <div class="pub-byline">Oleh <b>${esc(a.authorName || a.authorEmail || 'anonim')}</b>${a.createdAt ? ` · <time>${esc(dateText(a.createdAt))}</time>` : ''}</div>
            </header>
            <div class="pub-art-body">
                ${infobox}
                <p class="pub-lead">${esc(a.lead || '')}</p>
                ${paragraphs(a.body) || ''}
                ${link ? `<p class="pub-source">Sumber lengkap: <a href="${link}" data-open-link="1">${esc(a.link)}</a></p>` : ''}
            </div>`;
        bindCovers(articleEl);
        articleEl.querySelectorAll('[data-open-link]').forEach((el) => {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                const url = el.getAttribute('data-url') || el.getAttribute('href') || link;
                if (url) { vscode.postMessage({ type: 'openExternal', url }); }
            });
        });
        const back = articleEl.querySelector('[data-back]');
        if (back) { back.addEventListener('click', () => { selectedId = ''; renderRead(); }); }
        const del = articleEl.querySelector('[data-delete]');
        if (del) {
            del.addEventListener('click', () => {
                const id = del.getAttribute('data-delete') || '';
                if (pendingDelete === id) {
                    pendingDelete = '';
                    vscode.postMessage({ type: 'deleteArticle', id });
                } else {
                    pendingDelete = id;
                    del.textContent = 'Yakin? Klik lagi untuk hapus';
                }
            });
        }
    }

    function renderRead() {
        const selected = articles.find((a) => a.id === selectedId);
        if (articleEl) { articleEl.hidden = !selected; }
        if (listEl) { listEl.hidden = !!selected; }
        if (searchEl) { searchEl.disabled = !!selected; }
        if (selected) { renderArticle(selected); }
        else { renderList(); }
        if (countEl) {
            countEl.textContent = needsAuth
                ? `${articles.length} artikel · masuk untuk sinkron dengan database`
                : offline
                    ? `${articles.length} artikel · daftar dari cadangan lokal (database belum bisa dibaca)`
                    : `${articles.length} artikel di database`;
        }
    }

    /* ── tab & pratinjau ─────────────────────────────────────────────────────── */

    function renderTabs() {
        const read = view === 'read';
        if (tabWriteEl) { tabWriteEl.classList.toggle('on', !read); tabWriteEl.setAttribute('aria-selected', read ? 'false' : 'true'); }
        if (tabReadEl) { tabReadEl.classList.toggle('on', read); tabReadEl.setAttribute('aria-selected', read ? 'true' : 'false'); }
        if (paneWriteEl) { paneWriteEl.hidden = read; }
        if (paneReadEl) { paneReadEl.hidden = !read; }
        vscode.setState(Object.assign({}, vscode.getState() || {}, { view }));
    }

    function renderPreview() {
        if (!previewEl) { return; }
        const a = readForm();
        if (!a.title && !a.lead) { previewEl.hidden = true; previewEl.innerHTML = ''; return; }
        const cover = safeUrl(a.cover);
        previewEl.hidden = false;
        previewEl.innerHTML = `<div class="pub-preview-label">Pratinjau halaman</div>
            <article class="pub-preview-page">
                ${cover ? `<img class="pub-preview-cover" src="${cover}" alt="" data-cover="1" />` : ''}
                <h2>${esc(a.title || 'Judul artikel')}</h2>
                <div class="pub-preview-byline">${esc(a.authorName || email.split('@')[0] || 'penulis')}</div>
                <p>${esc(a.lead || 'Ringkasan pembuka akan tampil di sini.')}</p>
            </article>`;
        bindCovers(previewEl);
    }

    function saveDraftSoon() {
        if (draftTimer) { clearTimeout(draftTimer); }
        draftTimer = setTimeout(() => {
            const payload = readForm();
            draft = payload;
            vscode.postMessage({ type: 'saveDraft', draft: payload });
        }, 600);
    }

    function selectView(next) {
        view = next;
        if (next === 'write') { selectedId = ''; }
        renderTabs();
        if (next === 'read') { renderRead(); }
        else { renderPreview(); }
    }

    /* ── aksi ────────────────────────────────────────────────────────────────── */

    function submitAuth(ev) {
        if (ev) { ev.preventDefault(); }
        const mail = String(emailEl ? emailEl.value : '').trim();
        const pass = String(passEl ? passEl.value : '');
        const pass2 = String(pass2El ? pass2El.value : '');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { note(authMsgEl, 'Format email tidak valid, mis. nama@contoh.com.', true); return; }
        if (pass.length < 6) { note(authMsgEl, 'Kata sandi minimal 6 karakter.', true); return; }
        if (authMode === 'up' && pass !== pass2) { note(authMsgEl, 'Kata sandi dan ulangannya belum sama.', true); return; }
        if (authSubmitEl) { authSubmitEl.disabled = true; }
        note(authMsgEl, authMode === 'up' ? 'Membuat akun…' : 'Masuk…');
        vscode.postMessage({ type: authMode === 'up' ? 'signUp' : 'signIn', email: mail, password: pass });
    }

    function publishNow() {
        const a = readForm();
        const problem = validate(a);
        if (problem) { note(msgEl, problem, true); return; }
        if (!signedIn) { note(msgEl, 'Masuk dulu dengan email & kata sandi database untuk menerbitkan.', true); return; }
        note(msgEl, 'Menerbitkan artikel…');
        if (publishEl) { publishEl.disabled = true; publishEl.textContent = 'Menerbitkan…'; }
        vscode.postMessage({ type: 'publish', article: a });
    }

    /* ── kejadian UI ─────────────────────────────────────────────────────────── */

    [modeInEl, modeUpEl].forEach((el, index) => {
        if (!el) { return; }
        el.addEventListener('click', () => {
            authMode = index === 0 ? 'in' : 'up';
            renderAuthMode();
        });
    });
    if (authFormEl) { authFormEl.addEventListener('submit', submitAuth); }
    if (signOutEl) {
        signOutEl.addEventListener('click', () => {
            signedIn = false;
            email = '';
            localId = '';
            renderSession();
            vscode.postMessage({ type: 'signOut' });
            note(authMsgEl, 'Sudah keluar. Masuk lagi untuk menerbitkan artikel berikutnya.');
        });
    }
    if (tabWriteEl) { tabWriteEl.addEventListener('click', () => selectView('write')); }
    if (tabReadEl) { tabReadEl.addEventListener('click', () => { selectView('read'); }); }
    [titleEl, leadEl, bodyEl, linkEl, coverEl, authorEl].forEach((el) => {
        if (!el) { return; }
        el.addEventListener('input', () => { renderPreview(); saveDraftSoon(); });
    });
    if (publishEl) { publishEl.addEventListener('click', publishNow); }
    if (clearEl) {
        clearEl.addEventListener('click', () => {
            setForm({ authorName: email.split('@')[0] || '' });
            draft = null;
            vscode.postMessage({ type: 'saveDraft', draft: null });
            note(msgEl, 'Formulir dikosongkan.');
        });
    }
    if (searchEl) {
        searchEl.addEventListener('input', () => {
            filter = searchEl.value;
            renderList();
        });
    }
    if (reloadEl) {
        reloadEl.addEventListener('click', () => {
            reloadEl.classList.add('spin');
            status('memuat ulang artikel…');
            vscode.postMessage({ type: 'refresh' });
            setTimeout(() => reloadEl.classList.remove('spin'), 900);
        });
    }
    if (dbCheckEl) {
        dbCheckEl.addEventListener('click', () => {
            renderDb({ state: 'checking', message: 'memeriksa koneksi database…' });
            vscode.postMessage({ type: 'checkDatabase' });
        });
    }
    if (listEl) {
        listEl.addEventListener('click', (ev) => {
            const card = ev.target.closest('[data-open]');
            if (!card) { return; }
            selectedId = card.getAttribute('data-open') || '';
            renderRead();
        });
    }

    /* ── pesan dari ekstensi ─────────────────────────────────────────────────── */

    window.addEventListener('message', (ev) => {
        const m = ev.data || {};
        if (m.type === 'publishState') {
            signedIn = !!m.signedIn;
            email = String(m.email || '');
            localId = String(m.localId || '');
            articles = Array.isArray(m.articles) ? m.articles : [];
            draft = m.draft || null;
            if (draft) { setForm(draft); }
            else if (!titleEl.value) { setForm({ authorName: email.split('@')[0] || '' }); }
            if (m.db) { renderDb(m.db); }
            else if (!signedIn) { renderDb({ state: 'auth', message: 'Masuk untuk membaca & menerbitkan artikel.' }); }
            renderAuthMode();
            renderSession();
            renderTabs();
            renderRead();
            renderPreview();
            status(signedIn ? `masuk sebagai ${email}` : 'belum masuk · masuk untuk menerbitkan');
        } else if (m.type === 'publishAuth') {
            if (authSubmitEl) { authSubmitEl.disabled = false; }
            if (m.ok) {
                signedIn = true;
                email = String(m.email || '');
                localId = String(m.localId || '');
                if (passEl) { passEl.value = ''; }
                if (pass2El) { pass2El.value = ''; }
                note(authMsgEl, `Berhasil masuk sebagai ${email}.`);
                renderSession();
                if (!authorEl.value.trim()) { authorEl.value = email.split('@')[0] || ''; }
                status(`masuk sebagai ${email}`);
            } else {
                note(authMsgEl, String(m.message || 'Gagal masuk.'), true);
            }
        } else if (m.type === 'publishSession') {
            signedIn = !!m.signedIn;
            if (!signedIn) { email = ''; localId = ''; }
            renderSession();
            if (!signedIn) { renderDb({ state: 'auth', message: 'Masuk untuk membaca & menerbitkan artikel.' }); }
        } else if (m.type === 'publishDb') {
            renderDb(m.db || { state: 'checking' });
        } else if (m.type === 'publishArticles') {
            articles = Array.isArray(m.articles) ? m.articles : [];
            offline = !!m.offline;
            needsAuth = !!m.needsAuth;
            if (m.db) { renderDb(m.db); }
            if (m.localId !== undefined) { localId = String(m.localId || localId); }
            if (m.signedIn !== undefined) { signedIn = !!m.signedIn; renderSession(); }
            if (selectedId && !articles.some((a) => a.id === selectedId)) { selectedId = ''; }
            renderRead();
            if (offline) {
                status('daftar artikel dari cadangan · database belum bisa dibaca');
            } else if (needsAuth) {
                status('belum masuk · masuk untuk memuat artikel dari database');
            } else {
                status(`${articles.length} artikel di database`);
            }
        } else if (m.type === 'publishResult') {
            if (publishEl) { publishEl.disabled = !signedIn; publishEl.textContent = 'Terbitkan artikel'; }
            if (m.ok && m.article) {
                note(msgEl, `Artikel “${m.article.title}” diterbitkan.`);
                selectedId = m.article.id;
                view = 'read';
                renderTabs();
                renderRead();
                setForm({ authorName: email.split('@')[0] || '' });
                status('artikel diterbitkan · tersimpan di database');
            } else {
                note(msgEl, String(m.message || 'Gagal menerbitkan artikel.'), true);
                status('penerbitan gagal');
            }
        } else if (m.type === 'publishDeleted') {
            pendingDelete = '';
            if (m.ok) {
                articles = articles.filter((a) => a.id !== String(m.id || ''));
                selectedId = '';
                renderRead();
                note(msgEl, 'Artikel dihapus.');
                status('artikel dihapus');
            } else {
                note(msgEl, String(m.message || 'Gagal menghapus artikel.'), true);
            }
        }
    });

    /* ── awal ─────────────────────────────────────────────────────────────────── */

    renderAuthMode();
    renderSession();
    renderTabs();
    renderRead();
    renderPreview();
    renderDb({ state: 'checking' });
    status('menyiapkan…');
    vscode.postMessage({ type: 'ready' });
})();
