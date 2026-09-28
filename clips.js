// clips.js · Delmarva Aces — highlight clip playback.
//
// A "clip" is a window into the game's YouTube VOD: [tap - CLIP_PRE, tap + CLIP_POST].
// The tap offset is stamped by the scorer, a beat AFTER the play, so we rewind
// into the pitch and run a little past the result.
//
// WHY NOT JUST ?start=&end= : YouTube honours `start` in an embed but treats
// `end` as advisory — it is widely ignored, and reliably so when autoplay is on.
// Clips would open at the right moment and then keep playing into the next
// at-bat. The IFrame Player API plus a watchdog on getCurrentTime() actually
// stops them. Falls back to the plain iframe if the API can't load.
//
// Shared by highlights.html and player.html so the two can't drift apart again.
(function () {
  if (window.__acesClips) return; window.__acesClips = true;

  // Offsets are anchored at the scorer's Ball-in-Play tap (≈ contact), so the
  // window is 14s back for the wind-up and delivery, then the play runs out in
  // front. Home runs get a longer tail — the trot is half the clip.
  var CLIP_PRE = 14, CLIP_POST = 16, CLIP_POST_HR = 25;
  var apiReady = false, apiRequested = false, queue = [];

  window.ytThumb = function (streamId) {
    return streamId ? 'https://i.ytimg.com/vi/' + streamId + '/hqdefault.jpg' : '';
  };

  // Callers keep storing this in data-embed, and playClip() reads the numbers
  // back out of it; the optional result widens the tail for home runs.
  window.ytEmbed = function (streamId, offset, result) {
    if (!streamId) return '';
    var o = offset || 0;
    var post = result === 'home_run' ? CLIP_POST_HR : CLIP_POST;
    var start = Math.max(0, o - CLIP_PRE), end = o + post;
    return 'https://www.youtube.com/embed/' + streamId +
      '?start=' + start + '&end=' + end + '&rel=0&modestbranding=1';
  };

  function parseEmbed(url) {
    var m = /\/embed\/([A-Za-z0-9_-]{11})/.exec(url || '');
    if (!m) return null;
    var q = function (k) {
      var r = new RegExp('[?&]' + k + '=(\\d+)').exec(url);
      return r ? parseInt(r[1], 10) : null;
    };
    var start = q('start') || 0, end = q('end');
    // No end = a full-game embed (the watch hub). It used to inherit the clip
    // window here and the watchdog cut the whole game off after 30 seconds.
    if (end == null) end = Infinity;
    else if (end <= start) end = start + CLIP_PRE + CLIP_POST;
    return { id: m[1], start: start, end: end };
  }

  // ── MULTI-ANGLE ─────────────────────────────────────────────
  // Extra cameras per game (game_angles rows: the cart cameras' internal
  // recordings uploaded unlisted). delta_sec = broadcast seconds minus that
  // angle's seconds at the same moment, so angle_time = broadcast_time - delta.
  // The card keeps its broadcast window in data-bc-start/-end; every angle is
  // derived from those, so switching back and forth never accumulates drift.
  var styleDone = false;
  function angleStyle() {
    if (styleDone) return; styleDone = true;
    var s = document.createElement('style');
    s.textContent = '.angle-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:9px}' +
      '.angle-row .angle-lbl{font-family:"Roboto Mono",monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#7A8290;margin-right:2px}' +
      '.angle-btn{font-family:"Oswald",sans-serif;font-size:12px;letter-spacing:.06em;text-transform:uppercase;' +
      'background:#1F242C;border:1px solid rgba(255,255,255,.1);color:#F0EDE8;padding:4px 10px;border-radius:5px;cursor:pointer;line-height:1.3}' +
      '.angle-btn:hover{border-color:rgba(232,83,10,.5)}' +
      '.angle-btn.on{background:rgba(232,83,10,.2);border-color:#E8530A;color:#fff}';
    document.head.appendChild(s);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Button row for a card. Empty string when the game has no extra cameras,
  // so a game without uploads renders exactly as before.
  window.angleRow = function (angles, broadcastId) {
    if (!angles || !angles.length || !broadcastId) return '';
    angleStyle();
    return '<div class="angle-row"><span class="angle-lbl">Angle</span>' +
      '<button type="button" class="angle-btn on" data-vid="' + esc(broadcastId) + '" data-delta="0" onclick="pickAngle(this)">Broadcast</button>' +
      angles.map(function (a) {
        return '<button type="button" class="angle-btn" data-vid="' + esc(a.youtube_id) + '" data-delta="' + (parseFloat(a.delta_sec) || 0) +
          '" onclick="pickAngle(this)">' + esc(a.label) + '</button>';
      }).join('') + '</div>';
  };

  window.pickAngle = function (btn) {
    var card = btn.closest('.clip,.pclip');
    var el = card && card.querySelector('[data-embed]');
    if (!el) return;
    var cur = parseEmbed(el.getAttribute('data-embed')); if (!cur) return;
    var curDelta = parseFloat(el.dataset.delta || 0), nd = parseFloat(btn.dataset.delta || 0);
    var vid = btn.dataset.vid;
    // remember the broadcast window once (first switch happens from delta 0)
    if (el.dataset.bcStart == null) { el.dataset.bcStart = cur.start + curDelta; el.dataset.bcEnd = isFinite(cur.end) ? cur.end + curDelta : ''; }
    var bcStart = parseFloat(el.dataset.bcStart), bcEnd = el.dataset.bcEnd === '' ? Infinity : parseFloat(el.dataset.bcEnd);
    var ns = Math.max(0, bcStart - nd), ne = isFinite(bcEnd) ? Math.max(ns + 1, bcEnd - nd) : Infinity;
    el.setAttribute('data-embed', 'https://www.youtube.com/embed/' + vid + '?start=' + Math.round(ns) +
      (isFinite(ne) ? '&end=' + Math.round(ne) : '') + '&rel=0&modestbranding=1');
    el.dataset.delta = nd;
    btn.parentNode.querySelectorAll('.angle-btn').forEach(function (b) { b.classList.toggle('on', b === btn); });
    if (el._player && el._info) {
      // mid-play: keep the moment — same wall-clock instant on the other camera
      var t = 0; try { t = el._player.getCurrentTime() || 0; } catch (e) {}
      var nt = Math.max(0, t - (nd - curDelta));
      el._info.id = vid; el._info.start = ns; el._info.end = ne;
      var rb = el.querySelector('.clip-replay'); if (rb) rb.remove();
      try {
        var opts = { videoId: vid, startSeconds: nt };
        if (isFinite(ne)) opts.endSeconds = ne;
        el._player.loadVideoById(opts);
        if (el._arm) el._arm();
      } catch (e) {}
    } else {
      var img = el.querySelector('img'); if (img) img.src = ytThumb(vid);
    }
  };

  function loadApi(cb) {
    if (apiReady) return cb();
    queue.push(cb);
    if (apiRequested) return;
    apiRequested = true;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      apiReady = true;
      queue.splice(0).forEach(function (f) { try { f(); } catch (e) {} });
    };
    var s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = function () {            // blocked or offline — plain iframe still plays
      queue.splice(0).forEach(function (f) { try { f(true); } catch (e) {} });
    };
    document.head.appendChild(s);
    // don't hang forever if the API never arrives
    setTimeout(function () {
      if (!apiReady) queue.splice(0).forEach(function (f) { try { f(true); } catch (e) {} });
    }, 6000);
  }

  function plainIframe(el, url) {
    el.innerHTML = '<iframe src="' + url + '&autoplay=1" ' +
      'allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
  }

  function addReplay(el, onReplay) {
    if (el.querySelector('.clip-replay')) return;
    var b = document.createElement('button');
    b.className = 'clip-replay';
    b.type = 'button';
    b.textContent = '↻ Replay';
    b.style.cssText = 'position:absolute;inset:0;margin:auto;width:118px;height:38px;' +
      'background:rgba(10,12,14,.82);color:#fff;border:1px solid rgba(232,83,10,.6);' +
      'border-radius:20px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;z-index:3;';
    b.onclick = function (e) { e.stopPropagation(); b.remove(); onReplay(); };
    el.appendChild(b);
  }

  window.playClip = function (el) {
    var url = el.getAttribute('data-embed');
    if (!url) return;
    var info = parseEmbed(url);
    if (!info) { plainIframe(el, url); return; }

    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    loadApi(function (failed) {
      if (failed || !window.YT || !window.YT.Player) { plainIframe(el, url); return; }

      el.innerHTML = '<div class="clip-player"></div>';
      var host = el.firstChild, watchdog = null, player = null;

      var stop = function () {
        if (watchdog) { clearInterval(watchdog); watchdog = null; }
        try { player && player.pauseVideo(); } catch (e) {}
        addReplay(el, function () {
          try {
            player.seekTo(info.start, true);
            player.playVideo();
            arm();
          } catch (e) {}
        });
      };
      var arm = function () {
        if (watchdog) clearInterval(watchdog);
        if (!isFinite(info.end)) return;   // full game: nothing to cut off
        // the only thing that reliably ends a clip
        watchdog = setInterval(function () {
          var t = 0;
          try { t = player.getCurrentTime(); } catch (e) { return; }
          if (t >= info.end) stop();
        }, 250);
      };
      // pickAngle() reaches these to swap cameras without losing the moment
      el._info = info; el._arm = arm;

      var pv = { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, start: info.start };
      if (isFinite(info.end)) pv.end = info.end;   // end is advisory; the watchdog is the guarantee
      player = new YT.Player(host, {
        videoId: info.id,
        playerVars: pv,
        events: {
          onReady: function (e) { el._player = player; try { e.target.playVideo(); } catch (err) {} arm(); },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.PLAYING) arm();
            if (e.data === YT.PlayerState.ENDED) stop();
          }
        }
      });
    });
  };
})();
