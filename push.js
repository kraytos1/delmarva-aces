// push.js · Delmarva Aces — game-day push notifications (client side).
//
// Renders a bell toggle in the nav: 🔔 = subscribed (this device gets "game is
// live" / "final score" pings), 🔕 = off. Turning it off deletes the device's
// subscription from the database — actually unsubscribed, not muted.
//
// Placement: uses #push-bell if the page provides one (index.html's own nav),
// otherwise injects itself into the shared .dva-nav (all nav.js pages).
// Hidden entirely when the browser can't do push — on iPhone that means
// "not added to the Home Screen yet" (Apple only allows web push for
// installed PWAs, iOS 16.4+).
(function () {
  if (window.__acesPush) return; window.__acesPush = true;

  // Must match the pair whose PRIVATE key lives in Vercel env (api/notify.js).
  var VAPID_PUBLIC = 'BF1CW7OahWW815bjr8550Cv-bdBXG0Oy2PsBEk7_OG7gwm2AaWnGFZhqbAUyPHUKSMdAO5wLI3NUD8q7gAHupek';
  var SUPABASE_URL = 'https://urwwzdlkgfljfvqgfhyb.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyd3d6ZGxrZ2ZsamZ2cWdmaHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzY0MzYsImV4cCI6MjA5NzcxMjQzNn0.s5eOVqI0EaCnP5jDfuVtHeqBonsaIwwqQBrf1heMK1k';

  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function keyBytes(b64u) {
    var pad = '='.repeat((4 - (b64u.length % 4)) % 4);
    var raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function rest(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json',
    }, opts.headers || {});
    return fetch(SUPABASE_URL + '/rest/v1/' + path, opts);
  }

  async function getSub() {
    var reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function subscribe() {
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications are blocked for this site — enable them in your browser settings.');
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID_PUBLIC),
    });
    var j = sub.toJSON();
    await rest('push_subs?on_conflict=endpoint', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        ua: (navigator.userAgent || '').slice(0, 160),
      }),
    });
    return sub;
  }

  async function unsubscribe() {
    var sub = await getSub();
    if (!sub) return;
    try {
      await rest('push_subs?endpoint=eq.' + encodeURIComponent(sub.endpoint), { method: 'DELETE' });
    } catch (e) {}
    await sub.unsubscribe();
  }

  function paint(btn, on) {
    btn.textContent = on ? '🔔' : '🔕';
    btn.title = on
      ? 'Game notifications ON for this device — tap to turn off'
      : 'Get a ping when the Aces go live — tap to turn on';
    btn.style.opacity = on ? '1' : '.55';
  }

  async function toggle(btn) {
    btn.disabled = true;
    try {
      var sub = await getSub();
      if (sub) { await unsubscribe(); paint(btn, false); }
      else { await subscribe(); paint(btn, true); }
    } catch (e) {
      alert(e.message || 'Could not change notification settings.');
    }
    btn.disabled = false;
  }

  async function boot() {
    if (!supported()) return;   // e.g. iPhone Safari before Add-to-Home-Screen
    var btn = document.getElementById('push-bell');
    if (!btn) {
      var nav = document.querySelector('.dva-nav');
      if (!nav) return;
      btn = document.createElement('button');
      btn.id = 'push-bell';
      btn.style.cssText = 'background:none;border:none;font-size:19px;cursor:pointer;padding:4px 6px;line-height:1;-webkit-tap-highlight-color:transparent;';
      var toggleBtn = nav.querySelector('.dva-toggle');
      nav.insertBefore(btn, toggleBtn || null);
    }
    btn.style.display = '';
    btn.addEventListener('click', function () { toggle(btn); });
    try { paint(btn, !!(await getSub())); } catch (e) { paint(btn, false); }
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
