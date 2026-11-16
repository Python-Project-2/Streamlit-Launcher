/**
 * Perender Markdown ringan untuk chat (tanpa dependency, aman dari HTML mentah).
 * Mendukung **bold**, *italic*, `kode`, ~~coret~~, judul #, daftar - / 1.
 * Dipakai view TradingView, drawer layar penuh, dan MetaTrader AI.
 */
(function () {
    'use strict';

    /** Pecah satu baris menjadi node teks + elemen inline (bold/italic/code/strike). */
    function inline(text) {
        const frag = document.createDocumentFragment();
        const s = String(text == null ? '' : text);
        const re = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|~~[^~]+~~)/g;
        let last = 0;
        let m;
        while ((m = re.exec(s)) !== null) {
            if (m.index > last) { frag.appendChild(document.createTextNode(s.slice(last, m.index))); }
            const tok = m[0];
            let el;
            if (tok.indexOf('**') === 0 || tok.indexOf('__') === 0) {
                el = document.createElement('strong');
                el.textContent = tok.slice(2, -2);
            } else if (tok.charAt(0) === '`') {
                el = document.createElement('code');
                el.textContent = tok.slice(1, -1);
            } else if (tok.indexOf('~~') === 0) {
                el = document.createElement('del');
                el.textContent = tok.slice(2, -2);
            } else {
                el = document.createElement('em');
                el.textContent = tok.slice(1, -1);
            }
            frag.appendChild(el);
            last = re.lastIndex;
        }
        if (last < s.length) { frag.appendChild(document.createTextNode(s.slice(last))); }
        return frag;
    }

    /** Render blok: baris kosong, judul, daftar berbutir/nomor, paragraf. */
    function block(container, text) {
        if (!container) { return; }
        container.textContent = '';
        const lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
        let list = null;
        let listType = '';
        const flush = () => { list = null; listType = ''; };
        for (const raw of lines) {
            const line = String(raw || '').trim();
            if (!line) { flush(); continue; }
            const head = line.match(/^(#{1,4})\s+(.*)$/);
            if (head) {
                flush();
                const h = document.createElement('div');
                h.className = 'md-h md-h' + head[1].length;
                h.appendChild(inline(head[2]));
                container.appendChild(h);
                continue;
            }
            const ul = line.match(/^[-*•]\s+(.*)$/);
            if (ul) {
                if (!list || listType !== 'ul') {
                    list = document.createElement('ul');
                    listType = 'ul';
                    container.appendChild(list);
                }
                const li = document.createElement('li');
                li.appendChild(inline(ul[1]));
                list.appendChild(li);
                continue;
            }
            const ol = line.match(/^\d+[.)]\s+(.*)$/);
            if (ol) {
                if (!list || listType !== 'ol') {
                    list = document.createElement('ol');
                    listType = 'ol';
                    container.appendChild(list);
                }
                const li = document.createElement('li');
                li.appendChild(inline(ol[1]));
                list.appendChild(li);
                continue;
            }
            flush();
            const p = document.createElement('div');
            p.className = 'md-p';
            p.appendChild(inline(line));
            container.appendChild(p);
        }
    }

    window.SkunderMd = { inline, block };
})();
