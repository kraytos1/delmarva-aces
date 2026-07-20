// nav.js · Delmarva Aces — one shared top nav for every non-index page.
// index.html keeps its own SPA nav (Home/Schedule/Roster are in-page tabs there);
// this renders the identical bar everywhere else so the whole site links together
// and looks consistent regardless of a page's own theme. Self-contained styling.
//
// Parent-facing pages sit in the bar directly; the coach/scouting tools are
// grouped under a "Coach" dropdown so parents aren't faced with a wall of tools.
(function () {
  var PARENT = [
    { label: 'Home',       href: '/#home' },
    { label: 'Schedule',   href: '/#schedule' },
    { label: 'Roster',     href: '/#roster' },
    { label: 'Highlights', href: '/highlights.html', test: function (p) { return /\/highlights\.html$/.test(p); } },
    { label: 'Photos',     href: '/photos.html',     test: function (p) { return /\/photos\.html$/.test(p); } },
    { label: 'Live Game',  href: '/game.html',       test: function (p) { return /\/game\.html$/.test(p); } }
  ];
  var COACH = [
    { label: 'Bullpen',      href: '/bullpen.html',        test: function (p) { return /\/bullpen\.html$/.test(p); } },
    { label: 'Scout',        href: '/scout.html',          test: function (p) { return /\/scout\.html$/.test(p); } },
    { label: 'Pitching',     href: '/pitching-scout.html', test: function (p) { return /\/pitching-scout\.html$/.test(p); } },
    { label: 'Threat Board', href: '/threat-board.html',   test: function (p) { return /\/threat-board\.html$/.test(p); } },
    { label: 'Report',       href: '/report.html',         test: function (p) { return /\/report\.html$/.test(p); } }
  ];
  var path = location.pathname;
  // player detail pages (/player/:num or /player.html) belong to the Roster section
  var rosterActive = /\/player(\.html)?(\/|$)/.test(path);
  var coachActive = COACH.some(function (it) { return it.test && it.test(path); });

  var css = [
    '.dva-nav{position:sticky;top:0;z-index:200;display:flex;align-items:center;justify-content:space-between;',
      'gap:12px;flex-wrap:wrap;padding:0 24px;min-height:60px;background:rgba(10,12,14,.96);',
      'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.08);',
      "font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;}",
    '.dva-nav *{box-sizing:border-box;}',
    '.dva-brand{display:flex;align-items:center;gap:10px;text-decoration:none;padding:8px 0;}',
    '.dva-logo{width:34px;height:34px;object-fit:contain;filter:drop-shadow(0 0 8px rgba(232,83,10,.3));}',
    ".dva-name{font-family:'Oswald','Inter',sans-serif;font-size:17px;font-weight:600;color:#F0EDE8;letter-spacing:.5px;white-space:nowrap;}",
    '.dva-name span{color:#E8530A;}',
    '.dva-links{display:flex;flex-wrap:wrap;align-items:center;gap:2px;}',
    '.dva-link{padding:6px 13px;border-radius:6px;font-size:13px;font-weight:500;color:#7A8290;text-decoration:none;',
      'white-space:nowrap;transition:color .15s,background .15s;}',
    '.dva-link:hover{color:#F0EDE8;background:rgba(255,255,255,.06);}',
    '.dva-link.dva-active{color:#E8530A;}',
    // Coach dropdown
    '.dva-coach{position:relative;}',
    '.dva-coach-btn{font-family:inherit;padding:6px 13px;border-radius:6px;font-size:13px;font-weight:500;color:#7A8290;',
      'background:none;border:none;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:3px;transition:color .15s,background .15s;}',
    '.dva-coach-btn:hover{color:#F0EDE8;background:rgba(255,255,255,.06);}',
    '.dva-coach-btn.dva-active{color:#E8530A;}',
    '.dva-caret{font-size:10px;opacity:.7;}',
    '.dva-coach-menu{position:absolute;top:100%;right:0;margin-top:6px;min-width:172px;display:none;flex-direction:column;gap:2px;',
      'background:rgba(16,19,23,.98);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);',
      'border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:6px;box-shadow:0 14px 34px rgba(0,0,0,.55);z-index:210;}',
    '.dva-coach.dva-open .dva-coach-menu{display:flex;}',
    '.dva-coach-menu .dva-link{padding:9px 14px;}',
    // Mobile: hamburger dropdown; coach tools become an inline labeled section
    '.dva-toggle{display:none;background:none;border:none;color:#F0EDE8;font-size:24px;line-height:1;cursor:pointer;padding:4px 8px;-webkit-tap-highlight-color:transparent;}',
    '@media(max-width:640px){',
      '.dva-nav{padding:0 16px;}',
      '.dva-toggle{display:block;}',
      '.dva-links{position:absolute;top:100%;left:0;right:0;flex-direction:column;align-items:stretch;gap:0;',
        'background:rgba(10,12,14,.98);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);',
        'border-bottom:1px solid rgba(255,255,255,.08);padding:6px 0;display:none;max-height:80vh;overflow-y:auto;}',
      '.dva-links.dva-open{display:flex;}',
      '.dva-link{padding:14px 20px;font-size:15px;border-radius:0;}',
      // Coach tools collapse behind one tap on mobile — parents see 5 clean
      // links; the coach section expands only when asked for.
      '.dva-coach{position:static;width:100%;border-top:1px solid rgba(255,255,255,.07);margin-top:4px;padding-top:4px;}',
      '.dva-coach-btn{width:100%;text-align:left;padding:12px 20px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7A8290;display:flex;align-items:center;gap:6px;}',
      '.dva-coach.dva-open .dva-coach-btn{color:#E8530A;}',
      '.dva-coach.dva-open .dva-caret{transform:rotate(180deg);}',
      '.dva-caret{transition:transform .15s;}',
      '.dva-coach-menu{display:none;position:static;margin:0;min-width:0;background:none;border:none;box-shadow:none;padding:0;border-radius:0;backdrop-filter:none;}',
      '.dva-coach-menu .dva-link{padding:12px 20px 12px 34px;}',
    '}'
  ].join('');

  function renderLink(it) {
    var active = it.test ? it.test(path) : (it.label === 'Roster' && rosterActive);
    return '<a class="dva-link' + (active ? ' dva-active' : '') + '" href="' + it.href + '">' + it.label + '</a>';
  }

  var html =
    '<nav class="dva-nav">' +
      '<a class="dva-brand" href="/"><img class="dva-logo" src="/logo.png" alt="Aces"/>' +
        '<span class="dva-name">Delmarva <span>Aces</span></span></a>' +
      '<div class="dva-links">' +
        PARENT.map(renderLink).join('') +
        '<div class="dva-coach">' +
          '<button class="dva-coach-btn' + (coachActive ? ' dva-active' : '') + '" type="button">Coach<span class="dva-caret">▾</span></button>' +
          '<div class="dva-coach-menu">' + COACH.map(renderLink).join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="dva-toggle" aria-label="Menu">☰</button>' +
    '</nav>';

  // Load the shared PWA setup (manifest + service worker + install chip) on every page.
  if (!document.querySelector('script[src="/pwa.js"]')) {
    var pw = document.createElement('script'); pw.src = '/pwa.js'; document.head.appendChild(pw);
  }
  // Load the shared game strip (LIVE score / next-game line under the nav).
  if (!document.querySelector('script[src="/gamestrip.js"]')) {
    var gs = document.createElement('script'); gs.src = '/gamestrip.js'; document.head.appendChild(gs);
  }

  function mount() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    var host = document.getElementById('site-nav');
    if (host) host.outerHTML = html;
    else document.body.insertAdjacentHTML('afterbegin', html);

    var toggle = document.querySelector('.dva-toggle');
    var linkbar = document.querySelector('.dva-links');
    var coach = document.querySelector('.dva-coach');
    var coachBtn = document.querySelector('.dva-coach-btn');

    // Mobile hamburger: open/close the whole menu; tapping any link closes it.
    if (toggle && linkbar) {
      toggle.addEventListener('click', function () { linkbar.classList.toggle('dva-open'); });
      linkbar.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.dva-link')) {
          linkbar.classList.remove('dva-open');
          if (coach) coach.classList.remove('dva-open');
        }
      });
    }
    // Desktop Coach dropdown: click to toggle, click outside to close.
    if (coachBtn && coach) {
      coachBtn.addEventListener('click', function (e) { e.stopPropagation(); coach.classList.toggle('dva-open'); });
      document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('.dva-coach')) coach.classList.remove('dva-open');
      });
    }
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
