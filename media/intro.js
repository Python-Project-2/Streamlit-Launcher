(function () {
  'use strict';

  // Cegah script dijalankan dua kali (penyebab overlay/TTS dobel)
  if (window.__enhancementsLoaded) return;
  window.__enhancementsLoaded = true;

  // ──────────────────────────────────────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────────────────────────────────────
  function toNum(v, def) {
    var n = Number(v);
    return isFinite(n) ? n : (def || 0);
  }

  function numToWords(n) {
    n = Math.floor(toNum(n, 0));
    if (n < 0) return 'minus ' + numToWords(-n);
    var ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    var teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    if (n === 0) return 'zero';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      var o = n % 10;
      return tens[Math.floor(n / 10)] + (o > 0 ? ' ' + ones[o] : '');
    }
    if (n < 1000) {
      var r = n % 100;
      return ones[Math.floor(n / 100)] + ' hundred' + (r > 0 ? ' ' + numToWords(r) : '');
    }
    if (n < 1000000) {
      var r2 = n % 1000;
      return numToWords(Math.floor(n / 1000)) + ' thousand' + (r2 > 0 ? ' ' + numToWords(r2) : '');
    }
    return String(n);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function once(fn) {
    var done = false;
    return function () {
      if (done) return;
      done = true;
      try { fn.apply(null, arguments); } catch (e) { console.error(e); }
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Deteksi interaksi user (kunci agar suara bisa jalan otomatis)
  // Browser hanya mengizinkan suara otomatis kalau user pernah berinteraksi
  // dengan halaman (klik tombol analisis, tekan tombol, dsb). Kita pantau itu
  // sejak awal supaya begitu ada interaksi apa pun, suara langsung dinyalakan
  // tanpa user harus menekan tombol khusus.
  // ──────────────────────────────────────────────────────────────────────────
  var userActivated = false;
  var gestureQueue = [];

  function hasActivation() {
    if (userActivated) return true;
    try {
      if (navigator.userActivation && navigator.userActivation.hasBeenActive) return true;
    } catch (e) { /* abaikan */ }
    return false;
  }

  function flushGestureQueue() {
    userActivated = true;
    var q = gestureQueue.slice();
    gestureQueue.length = 0;
    q.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  ['pointerdown', 'mousedown', 'click', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, flushGestureQueue, { capture: true, passive: true });
  });

  // Jalankan fn secepatnya setelah ada aktivasi user (langsung jika sudah ada)
  function whenActivated(fn) {
    if (hasActivation()) { fn(); return; }
    gestureQueue.push(fn);
  }

  // Polling ringan: kalau webview menandai aktivasi tanpa event yang kita tangkap
  var activationPoll = setInterval(function () {
    if (hasActivation()) {
      clearInterval(activationPoll);
      flushGestureQueue();
    }
  }, 250);

  // Tunggu #summary. Tidak crash jika #app belum ada, dan ada timeout fallback
  function waitForSummary(callback) {
    var cb = once(callback);
    var existing = document.getElementById('summary');
    if (existing) { cb(existing); return; }

    var observer = new MutationObserver(function () {
      var found = document.getElementById('summary');
      if (found) {
        observer.disconnect();
        cb(found);
      }
    });

    function start() {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);

    // Fallback: kalau summary tidak pernah muncul, video + suara tetap jalan
    setTimeout(function () {
      observer.disconnect();
      cb(document.getElementById('summary') || null);
    }, 4000);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Pemilihan suara perempuan
  // ──────────────────────────────────────────────────────────────────────────
  function selectFemaleVoice() {
    if (!window.speechSynthesis) return null;
    var voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    var i, j, name;

    for (i = 0; i < voices.length; i++) {
      name = (voices[i].name || '').toLowerCase();
      if (name.indexOf('google') !== -1 && (name.indexOf('female') !== -1 || name.indexOf('woman') !== -1)) {
        return voices[i];
      }
    }

    var femaleNames = ['samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'allison', 'susan', 'zira', 'hazel', 'catherine', 'aria', 'jenny'];
    for (i = 0; i < voices.length; i++) {
      name = (voices[i].name || '').toLowerCase();
      for (j = 0; j < femaleNames.length; j++) {
        if (name.indexOf(femaleNames[j]) !== -1) return voices[i];
      }
    }

    var maleNames = ['male', 'david', 'mark', 'richard', 'james'];
    for (i = 0; i < voices.length; i++) {
      var lang = voices[i].lang || '';
      name = (voices[i].name || '').toLowerCase();
      if (lang.indexOf('en') === 0) {
        var isMale = false;
        for (j = 0; j < maleNames.length; j++) {
          if (name.indexOf(maleNames[j]) !== -1) { isMale = true; break; }
        }
        if (!isMale) return voices[i];
      }
    }
    return null;
  }

  // Pancing pemuatan voice list (addEventListener agar tidak menimpa handler lain)
  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener('voiceschanged', function () {
        window.speechSynthesis.getVoices();
      });
    } catch (e) { /* abaikan */ }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Video overlay — suara otomatis, tanpa tombol tambahan
  //
  // Alur:
  //   a) Coba putar langsung DENGAN suara.
  //   b) Kalau diblokir browser, putar tanpa suara (selalu diizinkan) lalu
  //      suara otomatis dinyalakan begitu ada interaksi user pertama
  //      (klik / tekan tombol / sentuh di mana saja) — tanpa tombol khusus.
  //   c) Kalau video gagal total, lanjut ke narasi, tidak menggantung.
  // ──────────────────────────────────────────────────────────────────────────
  var videoShown = false;

  function resolveVideoUrl(payload) {
    var url = null;
    if (document.body && document.body.dataset && document.body.dataset.video) {
      url = document.body.dataset.video;
    } else if (payload && (payload.videoUrl || payload.video)) {
      url = payload.videoUrl || payload.video;
    } else {
      var el = document.querySelector('[data-video]');
      if (el) url = el.getAttribute('data-video');
    }
    return url || null;
  }

  function removeVideoOverlay() {
    var overlay = document.getElementById('video-overlay');
    if (!overlay) return;
    var vid = overlay.querySelector('video');
    if (vid) {
      try {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      } catch (e) { /* abaikan */ }
    }
    overlay.remove();
  }

  // onDone dipanggil tepat sekali: saat video selesai / di-skip / error
  function insertVideoOverlay(videoUrl, onDone) {
    var finish = once(function () {
      removeVideoOverlay();
      if (onDone) onDone();
    });

    if (document.getElementById('video-overlay')) return;
    if (!videoUrl) { finish(); return; }

    var overlay = document.createElement('div');
    overlay.id = 'video-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:#000;display:flex;align-items:center;justify-content:center;';

    var videoEl = document.createElement('video');
    videoEl.style.cssText = 'width:100vw;height:100vh;display:block;object-fit:contain;background:#000;';
    videoEl.controls = false;
    videoEl.loop = false;
    videoEl.preload = 'auto';
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.volume = 1;
    videoEl.muted = false;

    // Tombol Skip (satu-satunya tombol)
    var skipBtn = document.createElement('button');
    skipBtn.textContent = '✕ Skip';
    skipBtn.style.cssText = 'position:fixed;top:16px;right:16px;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:6px;padding:8px 16px;font-size:14px;cursor:pointer;font-weight:500;z-index:10001;';
    skipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      finish();
    });

    videoEl.addEventListener('ended', finish);

    videoEl.addEventListener('error', function () {
      console.error('Video gagal dimuat:', videoUrl, videoEl.error);
      finish(); // jangan biarkan layar hitam menggantung
    });

    var started = false;
    videoEl.addEventListener('playing', function () { started = true; });

    // Nyalakan suara otomatis begitu diizinkan
    function enableSound() {
      if (!document.getElementById('video-overlay')) return;
      try {
        videoEl.muted = false;
        videoEl.volume = 1;
        // Jika browser ternyata menolak unmute, tetap muted tanpa error
      } catch (e) { /* abaikan */ }
    }

    function playMutedFallback() {
      videoEl.muted = true;
      var p2;
      try { p2 = videoEl.play(); } catch (e2) { p2 = null; }
      if (p2 && p2.then) {
        p2.then(function () {
          // Suara menyala otomatis di interaksi pertama user (tanpa tombol khusus)
          whenActivated(enableSound);
        }).catch(function (err2) {
          console.error('Video tidak bisa diputar:', err2);
          finish();
        });
      } else {
        whenActivated(enableSound);
      }
    }

    function tryPlay() {
      var p;
      videoEl.muted = false;
      videoEl.volume = 1;
      try { p = videoEl.play(); } catch (e) { p = null; }
      if (p && p.then) {
        p.catch(function (err) {
          if (started) return;
          console.warn('Autoplay bersuara diblokir, putar tanpa suara lalu nyalakan otomatis:', err && err.name);
          playMutedFallback();
        });
      }
    }

    var canPlayFired = false;
    videoEl.addEventListener('canplay', function () {
      if (canPlayFired) return;
      canPlayFired = true;
      tryPlay();
    });

    // Jika video tidak pernah mulai dalam 10 detik, lanjut tanpa video
    setTimeout(function () {
      if (!started) finish();
    }, 10000);

    overlay.appendChild(videoEl);
    overlay.appendChild(skipBtn);
    document.body.appendChild(overlay);

    videoEl.src = videoUrl;
    try { videoEl.load(); } catch (e) { finish(); }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. TTS (dipecah per kalimat agar tidak terpotong di Chrome)
  // ──────────────────────────────────────────────────────────────────────────
  var ttsCancelled = false;

  function createTtsBar() {
    if (document.getElementById('tts-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'tts-bar';
    bar.style.cssText = 'position:fixed;bottom:18px;right:18px;background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff);padding:8px 14px;border-radius:8px;font-size:12px;display:flex;gap:10px;align-items:center;z-index:9999;box-shadow:0 2px 12px rgba(0,0,0,.3);';
    bar.innerHTML =
      '<span id="tts-label">🔊 Narrating analysis…</span>' +
      '<button id="tts-stop" style="background:transparent;border:1px solid currentColor;color:inherit;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">Stop</button>';
    document.body.appendChild(bar);
    document.getElementById('tts-stop').addEventListener('click', function () {
      ttsCancelled = true;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      hideTtsBar();
    });
  }

  function showTtsBar() {
    createTtsBar();
    var bar = document.getElementById('tts-bar');
    if (bar) bar.style.display = 'flex';
  }

  function hideTtsBar() {
    var bar = document.getElementById('tts-bar');
    if (bar) bar.style.display = 'none';
  }

  function buildNarration(payload) {
    var sheet = payload && payload.sheets && payload.sheets.length > 0 ? payload.sheets[0] : null;
    if (!sheet) return null;

    var fileName = payload.fileName || 'File';
    var totalRows = toNum(sheet.totalRows);
    var columns = (sheet.headers || []).length;
    var numCols = toNum(sheet.numCols);
    var catCols = toNum(sheet.catCols);
    var missingPct = toNum(sheet.missingPct);
    var duplicates = toNum(sheet.duplicates);

    var narration = 'Analysis complete. The file ' + fileName + ' contains ' + numToWords(totalRows) + ' rows, and ' + numToWords(columns) + ' columns. ';
    narration += numToWords(numCols) + ' are numeric, ' + numToWords(catCols) + ' are categorical. ';
    narration += 'Missing values account for ' + missingPct.toFixed(1) + ' percent. ';
    narration += numToWords(duplicates) + ' duplicate rows were found. ';

    if (sheet.insights && sheet.insights.length > 0) {
      sheet.insights.slice(0, 2).forEach(function (insight) {
        var t = String(insight == null ? '' : insight).trim();
        if (t) narration += t.replace(/[.!?]+$/, '') + '. ';
      });
    }

    var criticalCount = 0, lowCount = 0;
    if (sheet.stockAnalysis && sheet.stockAnalysis.items && sheet.stockAnalysis.items.length > 0) {
      var items = sheet.stockAnalysis.items;
      items.forEach(function (item) {
        if (item.status === 'critical') criticalCount++;
        else if (item.status === 'low') lowCount++;
      });
      narration += 'Stock analysis found ' + numToWords(items.length) + ' items, with ' + numToWords(criticalCount) + ' critical and ' + numToWords(lowCount) + ' low stock items. ';
    }

    var recommendation = 'Your data quality is excellent. You may proceed to chart generation.';
    if (missingPct > 20) recommendation = 'Consider cleaning missing values before drawing conclusions.';
    else if (criticalCount > 0) recommendation = 'Prioritize restocking critical items immediately.';
    else if (duplicates > 0) recommendation = 'Review and remove duplicate rows to improve data quality.';

    return narration + 'Recommendation: ' + recommendation;
  }

  function speakAnalysis(payload) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;

    try {
      var narration = buildNarration(payload);
      if (!narration) return;

      var chunks = narration.match(/[^.!?]+[.!?]*/g) || [narration];
      chunks = chunks.map(function (c) { return c.trim(); }).filter(Boolean);

      ttsCancelled = false;
      window.speechSynthesis.cancel();
      var voice = selectFemaleVoice();
      var index = 0;
      var waitingForGesture = false;

      function speakNext() {
        if (ttsCancelled || index >= chunks.length) {
          hideTtsBar();
          return;
        }
        var current = index;
        var u = new SpeechSynthesisUtterance(chunks[current]);
        u.lang = 'en-US';
        u.rate = 0.9;
        u.pitch = 1.1;
        u.volume = 1;
        if (voice) u.voice = voice;
        u.onstart = showTtsBar;
        u.onend = function () {
          index = current + 1;
          speakNext();
        };
        u.onerror = function (ev) {
          var reason = ev && ev.error;
          if (reason === 'canceled' || reason === 'interrupted') return;
          if (reason === 'not-allowed' && !waitingForGesture) {
            // Browser belum mengizinkan suara → otomatis lanjut di interaksi pertama user
            waitingForGesture = true;
            whenActivated(function () {
              waitingForGesture = false;
              if (ttsCancelled) return;
              window.speechSynthesis.cancel();
              index = current;
              speakNext();
            });
            return;
          }
          hideTtsBar();
        };
        window.speechSynthesis.speak(u);
      }

      showTtsBar();
      speakNext();
    } catch (e) {
      console.error('TTS error:', e);
      hideTtsBar();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Suggestion cards
  // ──────────────────────────────────────────────────────────────────────────
  function insertSuggestions(summaryEl, payload) {
    if (!summaryEl || !summaryEl.parentNode) return;
    if (document.getElementById('suggestions')) return;

    var sheet = payload && payload.sheets && payload.sheets.length > 0 ? payload.sheets[0] : null;
    if (!sheet) return;

    var suggestions = generateSuggestions(sheet);
    if (suggestions.length === 0) return;

    var section = document.createElement('section');
    section.id = 'suggestions';
    section.style.margin = '0 0 28px';

    var html = '<h2 style="font-size:16px;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid rgba(128,128,128,.3);">💡 Smart Suggestions</h2>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">';
    suggestions.forEach(function (s) {
      html +=
        '<div style="background:var(--vscode-editor-inactiveSelectionBackground,rgba(128,128,128,.1));border-radius:10px;padding:14px 16px;border-left:3px solid var(--vscode-focusBorder,#007acc);">' +
        '<div style="font-size:14px;font-weight:600;margin-bottom:6px;">' + s.icon + ' ' + escapeHtml(s.title) + '</div>' +
        '<div style="font-size:12px;opacity:.85;line-height:1.5;">' + escapeHtml(s.body) + '</div>' +
        '</div>';
    });
    html += '</div>';
    section.innerHTML = html;

    summaryEl.parentNode.insertBefore(section, summaryEl.nextSibling);
  }

  function generateSuggestions(sheet) {
    var suggestions = [];
    var totalRows = toNum(sheet.totalRows);
    var totalCols = (sheet.headers || []).length;
    var numCols = toNum(sheet.numCols);
    var missingPct = toNum(sheet.missingPct);
    var duplicates = toNum(sheet.duplicates);
    var dateCols = toNum(sheet.dateCols);

    var body = 'Your dataset has ' + totalRows + ' rows and ' + totalCols + ' columns.';
    if (sheet.truncated) body += ' Only the first 200,000 rows were analyzed.';
    suggestions.push({ icon: '📊', title: 'Data Overview', body: body });

    if (missingPct > 10) {
      suggestions.push({ icon: '⚠️', title: 'Missing Values Detected', body: missingPct.toFixed(1) + '% of cells are missing. Consider imputation or filtering rows with excessive nulls before exporting.' });
    }
    if (duplicates > 0) {
      suggestions.push({ icon: '🔁', title: 'Duplicate Rows Found', body: duplicates + ' duplicate rows detected. Deduplication is recommended before statistical analysis.' });
    }
    if (numCols > 0 && totalCols > 0 && numCols / totalCols > 0.5) {
      suggestions.push({ icon: '📈', title: 'Numeric-Heavy Dataset', body: 'Over half the columns are numeric. Use the Correlation and Advanced sections to uncover relationships.' });
    }

    if (sheet.stockAnalysis && sheet.stockAnalysis.items && sheet.stockAnalysis.items.length > 0) {
      var critical = 0, over = 0;
      sheet.stockAnalysis.items.forEach(function (item) {
        if (item.status === 'critical') critical++;
        else if (item.status === 'overstock') over++;
      });
      if (critical > 0) suggestions.push({ icon: '🔴', title: 'Critical Stock Alert', body: critical + ' items are at critical or zero stock. Immediate restock action is recommended.' });
      if (over > 3) suggestions.push({ icon: '🔵', title: 'Overstock Warning', body: over + ' items are overstocked. Consider redistribution or promotions to free capital.' });
    }

    if (dateCols > 0) {
      suggestions.push({ icon: '📅', title: 'Time Series Detected', body: 'Date columns were found. Use the Charts section to explore trends over time.' });
    }

    suggestions.push({ icon: '💡', title: 'Export Tip', body: 'Use the Export to DOCX button to generate a professional report including all charts and notes.' });
    return suggestions;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Cleanup
  // ──────────────────────────────────────────────────────────────────────────
  function cleanupMediaAndTts() {
    ttsCancelled = true;
    gestureQueue.length = 0;
    clearInterval(activationPoll);
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* abaikan */ }
    }
    hideTtsBar();
    removeVideoOverlay();
  }

  window.addEventListener('beforeunload', cleanupMediaAndTts);
  window.addEventListener('pagehide', cleanupMediaAndTts);

  // ──────────────────────────────────────────────────────────────────────────
  // Main: pesan dari extension
  // Urutan: suggestions → video (suara otomatis) → setelah video selesai/skip → narasi TTS
  // ──────────────────────────────────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    var message = event && event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'data' && message.payload) {
      var payload = message.payload;

      waitForSummary(function (summaryEl) {
        try { insertSuggestions(summaryEl, payload); }
        catch (e) { console.error('Suggestions error:', e); }

        // Video hanya sekali per sesi halaman (hindari replay saat data dikirim ulang)
        if (videoShown) return;
        videoShown = true;

        var url = resolveVideoUrl(payload);
        if (!url) console.warn('Video URL tidak ditemukan (data-video / payload.videoUrl)');

        insertVideoOverlay(url, function () {
          speakAnalysis(payload);
        });
      });
    }

    if (message.type === 'dispose' || message.type === 'close') {
      cleanupMediaAndTts();
    }
  });
})();