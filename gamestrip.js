// Delmarva Aces — game strip
// One-line answer to the #1 parent question, shown directly under the nav:
//   LIVE      ->  "🔴 LIVE · Aces 5–3 · Bot 4 — Watch"        (links /game.html)
//   today     ->  "Today · vs Storm · 5:30 PM · 📍 Directions"  (links /game.html)
//   upcoming  ->  "Next: Sat, Jul 25 vs Fury · 9:00 AM"        (links /#schedule)
//   nothing scheduled -> renders nothing at all.
// Self-contained (own Supabase client + injected CSS). Loaded by nav.js on
// every parent page and directly by index.html. Polls while a game is live.
(function () {
  if (window.__acesGameStrip) return; window.__acesGameStrip = true;

  var css =
    '.dva-strip{display:flex;align-items:center;justify-content:center;gap:8px;' +
      'background:#15181d;border-bottom:1px solid rgba(232,83,10,.35);' +
      'padding:9px 14px;font-family:"Roboto Mono",monospace;font-size:12.5px;' +
      'color:#F0EDE8;text-decoration:none;letter-spacing:.3px;white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;}' +
    '.dva-strip b{color:#E8530A;font-weight:600;}' +
    '.dva-strip:active{opacity:.85;}' +
    '.dva-strip.dva-live{background:#1d1113;border-bottom-color:rgba(231,76,60,.55);}' +
    '.dva-strip .dva-dot{width:8px;height:8px;border-radius:50%;background:#e74c3c;' +
      'flex-shrink:0;animation:dvaBlink 1.4s infinite;}' +
    '@keyframes dvaBlink{0%,100%{opacity:1}50%{opacity:.25}}' +
    '.dva-strip .dva-cta{color:#E8530A;font-weight:600;margin-left:2px;}' +
    '.dva-strip .dva-maps{color:#7A8290;text-decoration:none;margin-left:6px;}' +
    '.dva-strip .dva-maps:active{color:#E8530A;}';

  function fmtTime(t) {                       // "17:30:00" -> "5:30 PM"
    if (!t) return '';
    var m = String(t).match(/^(\d{1,2}):(\d{2})/); if (!m) return '';
    var h = parseInt(m[1], 10), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m[2] + ' ' + ap;
  }
  function dayLabel(dstr) {                   // 'YYYY-MM-DD' vs local today
    var p = String(dstr || '').split('-').map(Number);
    if (p.length !== 3) return dstr;
    var d = new Date(p[0], p[1] - 1, p[2]), now = new Date();
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((d - t0) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  var client = null;
  function getClient() {
    if (client) return client;
    try {
      // NOTE: config.js declares `const ACES_CONFIG` — lexically global but
      // NOT a window property, so it must be referenced bare (typeof-guarded).
      var cfg = (typeof ACES_CONFIG !== 'undefined') ? ACES_CONFIG : null;
      if (window.supabase && cfg && cfg.supabaseUrl) {
        client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      }
    } catch (e) {}
    return client;
  }

  function host() {
    var el = document.getElementById('game-strip');
    if (el) return el;
    var nav = document.querySelector('.dva-nav');
    if (nav) {
      el = document.createElement('div'); el.id = 'game-strip';
      nav.insertAdjacentElement('afterend', el);
      return el;
    }
    return null;
  }

  function render(html) {
    var el = host(); if (!el) return;
    el.innerHTML = html || '';
  }

  var pollTimer = null;
  function setPolling(on) {
    if (on && !pollTimer) pollTimer = setInterval(refresh, 20000);
    if (!on && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function refresh() {
    var db = getClient(); if (!db) return;
    try {
      var live = await db.from('games')
        .select('id,our_score,opp_score,inning,half,opponents(name)')
        .eq('status', 'live').limit(1);
      if (live.data && live.data.length) {
        var g = live.data[0];
        var innTxt = (g.half === 'bottom' ? 'Bot' : 'Top') + ' ' + (g.inning || 1);
        render('<a class="dva-strip dva-live" href="/game.html">' +
          '<span class="dva-dot"></span><b>LIVE</b>' +
          '<span>Aces ' + (g.our_score || 0) + '–' + (g.opp_score || 0) + ' · ' + innTxt + '</span>' +
          '<span class="dva-cta">Watch ▶</span></a>');
        setPolling(true);
        return;
      }
      setPolling(false);
      var today = new Date(); var ymd = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      var next = await db.from('games')
        .select('id,game_date,game_time,location,opponents(name)')
        .eq('status', 'scheduled').gte('game_date', ymd)
        .order('game_date').order('game_time', { nullsFirst: false }).limit(1);
      if (!next.data || !next.data.length) { render(''); return; }
      var n = next.data[0];
      var opp = (n.opponents && n.opponents.name) ? n.opponents.name : 'TBD';
      var when = dayLabel(n.game_date), time = fmtTime(n.game_time);
      var isToday = when === 'Today';
      var maps = (isToday && n.location)
        ? '<a class="dva-maps" href="https://maps.google.com/?q=' + encodeURIComponent(n.location) +
          '" target="_blank" rel="noopener" onclick="event.stopPropagation()">📍 Directions</a>'
        : '';
      render('<a class="dva-strip" href="' + (isToday ? '/game.html' : '/#schedule') + '">' +
        '<b>' + (isToday ? 'Game today' : 'Next') + '</b>' +
        '<span>' + (isToday ? '' : when + ' · ') + 'vs ' + opp + (time ? ' · ' + time : '') + '</span>' +
        maps + '</a>');
    } catch (e) {}
  }

  function boot() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    // supabase UMD may load after us on some pages — retry briefly
    var tries = 0;
    (function waitDb() {
      if (getClient()) { refresh(); return; }
      if (++tries < 20) setTimeout(waitDb, 250);
    })();
  }
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
