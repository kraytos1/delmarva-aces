// pwa.js · Delmarva Aces — makes the whole site an installable app.
// Idempotent: ensures the manifest link + theme-color, registers the service
// worker, and shows an "Install app" chip when the browser offers it.
(function () {
  if (window.__acesPwa) return; window.__acesPwa = true;

  if (!document.querySelector('link[rel="manifest"]')) {
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.json';
    document.head.appendChild(l);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    var m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#E8530A';
    document.head.appendChild(m);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').catch(function () {});
    });
  }

  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferred = e; showChip();
  });
  window.addEventListener('appinstalled', function () {
    var b = document.getElementById('pwa-install'); if (b) b.remove();
  });

  function showChip() {
    if (isInstalled() || document.getElementById('pwa-install') || !document.body) return;
    var b = document.createElement('button');
    b.id = 'pwa-install';
    b.textContent = '📲 Install app';
    b.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9998;background:#E8530A;color:#fff;border:none;' +
      'border-radius:24px;padding:11px 18px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.55);';
    b.onclick = async function () {
      if (!deferred) { b.remove(); return; }
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) {}
      deferred = null; b.remove();
    };
    document.body.appendChild(b);
  }
})();
