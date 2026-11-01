    /* ====== PARALLAX FALLBACK ====== */
    (function () {
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      var supported = CSS.supports('animation-timeline: view()');
      if (reduce || supported) return;
      var heroImg = document.querySelector('.heroimage img');
      var bars = document.querySelectorAll('.bar-chart .bar');
      if (!heroImg && !bars.length) return;
      var queued = false;
      function update() {
        var y = window.scrollY;
        if (heroImg) heroImg.style.transform = 'translateY(' + (y * -0.06) + 'px)';
        bars.forEach(function (bar, i) {
          bar.style.transform = 'scaleY(' + (0.75 + ((y + i * 50) % 200) / 800) + ')';
          bar.style.transformOrigin = 'bottom';
        });
        queued = false;
      }
      addEventListener('scroll', function () {
        if (!queued) { queued = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    })();