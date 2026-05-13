/* ==========================================================================
   The Cocktail Napkin — Main JS
   ========================================================================== */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Theme toggle ------------------------------------------------------
  // Note: the inline head script in BaseLayout has already applied the
  // correct theme before paint (reading localStorage + prefers-color-scheme).
  // This block only owns the click handler + aria-pressed sync.
  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    var syncPressed = function () {
      toggle.setAttribute('aria-pressed', document.documentElement.classList.contains('dark') ? 'true' : 'false');
    };
    syncPressed();

    toggle.addEventListener('click', function () {
      var isDark = document.documentElement.classList.contains('dark');
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      localStorage.setItem('theme', next);
      syncPressed();
    });
  }

  // ---- TOC generation + scroll spy + sliding indicator -------------------
  var content = document.querySelector('.post-prose');
  var tocContainer = document.querySelector('.toc');
  var tocIndicator = null;

  if (content && tocContainer) {
    var headings = content.querySelectorAll('h2');

    if (headings.length > 0) {
      headings.forEach(function (h, i) {
        if (!h.id) {
          h.id = 'section-' + i;
        }

        var link = document.createElement('a');
        link.className = 'toc-item';
        link.href = '#' + h.id;
        link.textContent = h.textContent;
        tocContainer.appendChild(link);
      });

      tocIndicator = document.createElement('span');
      tocIndicator.className = 'toc-indicator';
      tocContainer.appendChild(tocIndicator);

      var tocItems = tocContainer.querySelectorAll('.toc-item');

      var moveIndicator = function (el) {
        if (!tocIndicator || !el) return;
        tocIndicator.style.setProperty('--toc-indicator-y', el.offsetTop + 'px');
        tocIndicator.style.height = el.offsetHeight + 'px';
        tocIndicator.classList.add('is-active');
      };

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              tocItems.forEach(function (item) {
                item.classList.remove('active');
              });
              var active = tocContainer.querySelector(
                '.toc-item[href="#' + entry.target.id + '"]'
              );
              if (active) {
                active.classList.add('active');
                moveIndicator(active);
              }
            }
          });
        },
        { rootMargin: '-20% 0px -70% 0px' }
      );

      headings.forEach(function (h) {
        observer.observe(h);
      });
    }
  }

  // ---- Heading anchors (copy link to section) ----------------------------
  if (content) {
    var anchorables = content.querySelectorAll('h2[id], h3[id]');
    anchorables.forEach(function (h) {
      var a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = '#' + h.id;
      a.setAttribute('aria-label', 'Copy link to section');
      a.textContent = '#';
      a.addEventListener('click', function (e) {
        var url = window.location.origin + window.location.pathname + '#' + h.id;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          e.preventDefault();
          navigator.clipboard.writeText(url).then(function () {
            history.replaceState(null, '', '#' + h.id);
            a.classList.add('is-copied');
            setTimeout(function () { a.classList.remove('is-copied'); }, 1400);
          });
        }
      });
      h.appendChild(a);
    });
  }

  // ---- Reading progress bar ---------------------------------------------
  var bar = document.querySelector('.reading-progress');
  var article = document.querySelector('article.post-prose, .post-content.post-prose');
  if (bar && article) {
    var ticking = false;
    var updateBar = function () {
      var rect = article.getBoundingClientRect();
      var viewportH = window.innerHeight;
      var total = rect.height - viewportH;
      var progressed = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      var pct = total > 0 ? (progressed / total) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
      ticking = false;
    };

    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(updateBar);
        ticking = true;
      }
    }, { passive: true });
    updateBar();
  }

  // ---- Scroll reveal — images and cards ---------------------------------
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var revealTargets = document.querySelectorAll(
      '.post-prose img, .post-prose figure, .post-card-image, .post-card-featured-image, .methodology-tile'
    );
    if (revealTargets.length) {
      revealTargets.forEach(function (el) { el.classList.add('reveal'); });
      var revealObserver = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      revealTargets.forEach(function (el) { revealObserver.observe(el); });
    }
  }
})();
