/* Delmarva Aces — homepage motion behavior. Pairs with site-motion.css.
   Non-invasive: reads the DOM the site already renders; touches no site logic. */
(function () {
  'use strict';
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (RM) return; // reduced motion: leave the site exactly as-is
    document.body.classList.add('motion-ready');

    // Fire the hero choreography when the loading overlay hides
    var loading = document.getElementById('loading'), fired = false;
    function go() {
      if (fired) return; fired = true;
      document.body.classList.add('motion-go');
      setTimeout(startCounters, 550);
    }
    if (!loading || loading.classList.contains('hidden') || loading.style.display === 'none') go();
    else {
      new MutationObserver(function (m, o) {
        if (loading.classList.contains('hidden')) { o.disconnect(); go(); }
      }).observe(loading, { attributes: true, attributeFilter: ['class', 'style'] });
      setTimeout(go, 6000); // safety net if the overlay never resolves
    }

    initReveals();
    initCountdownTick();
  });

  /* Count the hero stats up from 0 to whatever the page (or the DB) rendered */
  function startCounters() {
    [['hs-avg', 3], ['hs-rbi', 0], ['hs-sb', 0], ['hs-hr', 0]].forEach(function (cfg, i) {
      var el = document.getElementById(cfg[0]);
      if (!el) return;
      var raw = el.textContent.trim();
      var to = parseFloat(raw.replace(/[^0-9.]/g, ''));
      if (isNaN(to)) return;
      var dp = cfg[1], strip = raw.charAt(0) === '.';
      var start = null, dur = 1300, delay = i * 140, ease = function (x) { return 1 - Math.pow(1 - x, 3); };
      function step(now) {
        if (start === null) start = now;
        var t = now - start - delay;
        var p = t <= 0 ? 0 : Math.min(1, t / dur);
        var v = to * ease(p);
        var s = dp ? v.toFixed(dp) : String(Math.round(v));
        if (strip && dp) s = s.replace(/^0/, '');
        el.textContent = s;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = raw; // restore the exact original string
      }
      requestAnimationFrame(step);
    });
  }

  /* Stagger-reveal each home-page section as it scrolls into view */
  function initReveals() {
    if (!('IntersectionObserver' in window)) return;
    document.querySelectorAll('#page-home .section').forEach(function (sec) {
      Array.prototype.forEach.call(sec.children, function (ch, i) {
        ch.setAttribute('data-reveal', String(Math.min(i, 3)));
      });
    });
    var strip = document.querySelector('.next-game-strip');
    if (strip) strip.setAttribute('data-reveal', '0');
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        el.style.transitionDelay = (parseInt(el.dataset.reveal, 10) || 0) * 90 + 'ms';
        el.classList.add('is-in');
        obs.unobserve(el);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(function (el) { obs.observe(el); });
  }

  /* Roll countdown digits when their value actually changes */
  function initCountdownTick() {
    ['cd-d', 'cd-h', 'cd-m'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var last = el.textContent;
      new MutationObserver(function () {
        if (el.textContent === last) return;
        last = el.textContent;
        el.classList.remove('cd-tick');
        void el.offsetWidth;
        el.classList.add('cd-tick');
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
})();
