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
    // Bottom-RIGHT: the hero's primary CTAs ("Roster & Stats" / "Watch Last
    // Game") sit bottom-left, and a fixed chip there covered them.
    b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9998;background:#E8530A;color:#fff;border:none;' +
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

  // iOS never fires beforeinstallprompt — show iPhone/iPad parents a one-time
  // dismissible tip with the manual Add-to-Home-Screen steps instead.
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS masquerades as Mac
  function dismissedIosTip() { try { return localStorage.getItem('aces_ios_tip') === '1' } catch (e) { return true } }
  function showIosTip() {
    if (!isIOS || isInstalled() || dismissedIosTip() || document.getElementById('pwa-ios-tip') || !document.body) return;
    var d = document.createElement('div');
    d.id = 'pwa-ios-tip';
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:9998;display:flex;align-items:center;gap:10px;' +
      'background:#15181d;color:#F0EDE8;border:1px solid rgba(232,83,10,.45);border-radius:14px;padding:12px 14px;' +
      'font-family:inherit;font-size:13px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.55);';
    d.innerHTML = '<span style="font-size:20px;">📲</span>' +
      '<span style="flex:1;">Add the Aces app to your phone: tap <b>Share</b> ' +
      '<span style="opacity:.8;">(the &#x2B06;&#xFE0E; box)</span> then <b>&ldquo;Add to Home Screen&rdquo;</b></span>' +
      '<button style="background:none;border:none;color:#7A8290;font-size:20px;line-height:1;padding:4px 6px;cursor:pointer;">&times;</button>';
    d.querySelector('button').onclick = function () {
      try { localStorage.setItem('aces_ios_tip', '1') } catch (e) {}
      d.remove();
    };
    document.body.appendChild(d);
  }
  window.addEventListener('load', function () { setTimeout(showIosTip, 2500); });
})();
