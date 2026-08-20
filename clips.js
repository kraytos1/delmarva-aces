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
    if (end == null || end <= start) end = start + CLIP_PRE + CLIP_POST;
    return { id: m[1], start: start, end: end };
  }

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
        // the only thing that reliably ends a clip
        watchdog = setInterval(function () {
          var t = 0;
          try { t = player.getCurrentTime(); } catch (e) { return; }
          if (t >= info.end) stop();
        }, 250);
      };

      player = new YT.Player(host, {
        videoId: info.id,
        playerVars: {
          start: info.start, end: info.end,   // end is advisory; the watchdog is the guarantee
          autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1
        },
        events: {
          onReady: function (e) { try { e.target.playVideo(); } catch (err) {} arm(); },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.PLAYING) arm();
            if (e.data === YT.PlayerState.ENDED) stop();
          }
        }
      });
    });
  };
})();
