    /* ====== SCROLL PROGRESS + STICKY HEADER + BACK TO TOP ====== */
    (function () {
      var progress = document.getElementById('scrollProgress');
      var header = document.getElementById('siteHeader');
      var backTop = document.getElementById('backToTop');
      var queued = false;
      function update() {
        var y = window.scrollY;
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var pct = h > 0 ? (y / h) * 100 : 0;
        progress.style.width = pct + '%';
        header.classList.toggle('scrolled', y > 10);
        backTop.classList.toggle('show', y > 600);
        queued = false;
      }
      addEventListener('scroll', function () {
        if (!queued) { queued = true; requestAnimationFrame(update); }
      }, { passive: true });
      backTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
      update();
    })();

    /* ====== SCROLL REVEAL (down + up) ====== */
    (function () {
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) return;
      var lastY = window.scrollY;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var fromAbove = window.scrollY < lastY;
            entry.target.classList.toggle('from-above', fromAbove);
            entry.target.classList.add('visible');
          } else {
            entry.target.classList.remove('visible');
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
      document.querySelectorAll('.reveal').forEach(function (el) { observer.observe(el); });
      addEventListener('scroll', function () { lastY = window.scrollY; }, { passive: true });
    })();

    /* ====== VIDEO MODAL ====== */
    (function () {
      var modal = document.getElementById('videoModal');
      var body = document.getElementById('videoModalBody');
      var titleEl = document.getElementById('videoModalTitle');
      function open(type, src, title) {
        body.innerHTML = '';
        if (type === 'gif' || type === 'img') {
          var img = document.createElement('img'); img.src = src; img.alt = title || ''; body.appendChild(img);
        } else if (type === 'video') {
          var v = document.createElement('video'); v.src = src; v.controls = true; v.autoplay = true; v.playsInline = true; body.appendChild(v);
        } else if (type === 'youtube') {
          var iframe = document.createElement('iframe'); iframe.src = src; iframe.allow = 'autoplay; encrypted-media; picture-in-picture'; iframe.allowFullscreen = true; body.appendChild(iframe);
        }
        titleEl.textContent = title || '';
        modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
      function close() {
        modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
        body.innerHTML = ''; document.body.style.overflow = '';
      }
      document.querySelectorAll('[data-video-type]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          open(el.getAttribute('data-video-type'), el.getAttribute('data-video-src'), el.getAttribute('data-video-title'));
        });
      });
      modal.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', close); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });
    })();