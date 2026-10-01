// tests/harness.js · Delmarva Aces — scorer + gamecast test rig.
//
// Not linked from any page. Load it into score.html from the browser console:
//     var s=document.createElement('script'); s.src='/tests/harness.js'; document.head.appendChild(s)
// then:  await TH.runAll()
//
// It swaps the page's Supabase client for an in-memory fake (tables + realtime
// events), so the REAL scorer code plays thousands of situations without a
// single write reaching the database. The gamecast (game.html) is loaded in an
// iframe wired to the same fake, so every scorer write reaches the viewer's
// real realtime handlers in order, and the two pages are compared after every
// action. Nothing here ships to families; it exists so a regression is caught
// by a machine and not during a tournament.
(function () {
  'use strict';
  var TH = window.TH = {};
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };

  // ───────────────────────── in-memory Supabase ─────────────────────────
  function FakeDb() {
    this.tables = {};
    this.subs = [];        // realtime subscriptions from every attached page
    this.log = [];         // every mutation, in order
    this.clock = Date.parse('2026-10-01T22:00:00Z');
    this.failInserts = false;
    this.latency = 0;      // ms; >0 makes every request take a random 0.5x-1.5x of this, like a cell connection
  }
  FakeDb.prototype.now = function () { this.clock += 1500; return new Date(this.clock).toISOString(); };
  FakeDb.prototype.rows = function (t) {
    if (t === 'live_game_summary') {
      return (this.tables.games || []).filter(function (g) { return g.status === 'live'; }).map(function (g) {
        var o = clone(g); o.team_name = 'Delmarva Aces'; o.opponent_name = (g.opponents && g.opponents.name) || 'Opponent';
        delete o.base_1b; delete o.base_2b; delete o.base_3b; delete o.is_home; delete o.season;   // the real view lacks these
        return o;
      });
    }
    return this.tables[t] || (this.tables[t] = []);
  };
  FakeDb.prototype.emit = function (type, table, nw, old) {
    var self = this, ev = { eventType: type, table: table, new: clone(nw) || {}, old: clone(old) || {} };
    this.log.push(ev);
    this.subs.slice().forEach(function (s) {
      if (s.table !== table) return;
      if (s.event !== '*' && s.event !== type) return;
      if (s.filter) {
        var m = /^(\w+)=eq\.(.+)$/.exec(s.filter), src = type === 'DELETE' ? old : nw;
        if (m && String((src || {})[m[1]]) !== m[2]) return;
      }
      // deliver asynchronously, like a websocket, but in order
      Promise.resolve().then(function () { try { s.cb(clone(ev)); } catch (e) { self.handlerErrors = (self.handlerErrors || []); self.handlerErrors.push(String(e && e.stack || e)); } });
    });
  };
  FakeDb.prototype.client = function () {
    var D = this;
    function Q(t) { this.t = t; this.f = []; this.op = 'select'; this.opts = {}; this.ord = []; this.lim = null; this.one = false; this.ret = false; }
    ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like'].forEach(function (op) { Q.prototype[op] = function (c, v) { this.f.push([op, c, v]); return this; }; });
    Q.prototype.is = function (c, v) { this.f.push(['is', c, v]); return this; };
    Q.prototype.in = function (c, a) { this.f.push(['in', c, a]); return this; };
    Q.prototype.contains = function (c, a) { this.f.push(['contains', c, a]); return this; };
    Q.prototype.not = function (c, op, v) { this.f.push(['not', c, op, v]); return this; };
    Q.prototype.order = function (c, o) { this.ord.push([c, !(o && o.ascending === false)]); return this; };
    Q.prototype.limit = function (n) { this.lim = n; return this; };
    Q.prototype.single = function () { this.one = 'one'; return this; };
    Q.prototype.maybeSingle = function () { this.one = 'maybe'; return this; };
    Q.prototype.select = function (cols, opts) { if (this.op === 'select') this.opts = opts || {}; this.ret = true; return this; };
    Q.prototype.insert = function (row) { this.op = 'insert'; this.row = row; return this; };
    Q.prototype.update = function (p) { this.op = 'update'; this.patch = p; return this; };
    Q.prototype.delete = function () { this.op = 'delete'; return this; };
    Q.prototype.match = function (r) {
      return this.f.every(function (f) {
        var op = f[0], v = r[f[1]];
        if (op === 'eq') return v === f[2] || String(v) === String(f[2]);
        if (op === 'neq') return !(v === f[2] || String(v) === String(f[2]));
        if (op === 'gt') return v > f[2]; if (op === 'gte') return v >= f[2];
        if (op === 'lt') return v < f[2]; if (op === 'lte') return v <= f[2];
        if (op === 'like') { var re = new RegExp('^' + String(f[2]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 's'); return re.test(String(v == null ? '' : v)); }
        if (op === 'is') return f[2] === null ? v == null : v === f[2];
        if (op === 'in') return f[2].indexOf(v) >= 0;
        if (op === 'contains') return Array.isArray(v) && f[2].every(function (x) { return v.indexOf(x) >= 0; });
        if (op === 'not') {
          if (f[2] === 'is') return f[3] === null ? v != null : v !== f[3];
          if (f[2] === 'in') { var list = String(f[3]).replace(/^\(|\)$/g, '').split(',').map(function (s) { return s.trim(); }); return list.indexOf(String(v)) < 0; }
          if (f[2] === 'eq') return v !== f[3];
        }
        return true;
      });
    };
    Q.prototype.exec = function () {
      var self = this, rows = D.rows(this.t);
      if (this.op === 'insert') {
        if (D.failInserts) return { data: null, error: { message: 'network down (harness)' } };
        var list = Array.isArray(this.row) ? this.row : [this.row], made = [];
        if (list.some(function (r) { return r.id && rows.some(function (x) { return x.id === r.id; }); })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        list.forEach(function (r) { var n = Object.assign({ id: 'm' + (D.seq = (D.seq || 0) + 1), created_at: D.now() }, clone(r)); rows.push(n); made.push(n); D.emit('INSERT', self.t, n, null); });
        return { data: this.one ? clone(made[0]) : clone(made), error: null };
      }
      var hit = rows.filter(function (r) { return self.match(r); });
      if (this.op === 'update') {
        hit.forEach(function (r) { var old = clone(r); Object.assign(r, clone(self.patch)); D.emit('UPDATE', self.t, r, old); });
        return { data: this.ret ? (this.one ? clone(hit[0] || null) : clone(hit)) : null, error: null };
      }
      if (this.op === 'delete') {
        hit.forEach(function (r) { rows.splice(rows.indexOf(r), 1); D.emit('DELETE', self.t, null, { id: r.id }); });   // real DELETE payloads carry only the PK
        return { data: this.ret ? clone(hit) : null, error: null };
      }
      this.ord.forEach(function (o) { /* stable multi-key: apply last key first */ });
      var out = hit.slice();
      this.ord.slice().reverse().forEach(function (o) {
        out.sort(function (a, b) { var x = a[o[0]], y = b[o[0]]; if (x === y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * (o[1] ? 1 : -1); });
      });
      if (this.opts.head) return { data: null, count: out.length, error: null };
      if (this.lim != null) out = out.slice(0, this.lim);
      if (this.one === 'one') return out.length ? { data: clone(out[0]), error: null } : { data: null, error: { message: 'no rows' } };
      if (this.one === 'maybe') return { data: clone(out[0] || null), error: null };
      return { data: clone(out), count: this.opts.count ? out.length : undefined, error: null };
    };
    Q.prototype.then = function (res, rej) {
      var self = this, run = function () { try { return self.exec(); } catch (e) { return { data: null, error: { message: String(e) } }; } };
      if (D.latency > 0) return new Promise(function (ok) { setTimeout(function () { ok(run()); }, D.latency * (0.5 + Math.random())); }).then(res, rej);
      return Promise.resolve(run()).then(res, rej);
    };
    return {
      from: function (t) { return new Q(t); },
      channel: function () {
        var ch = { on: function (kind, spec, cb) { D.subs.push({ event: spec.event, table: spec.table, filter: spec.filter, cb: cb }); return ch; }, subscribe: function () { return ch; }, unsubscribe: function () { } };
        return ch;
      },
      removeChannel: function () { }, rpc: function () { return Promise.resolve({ data: [], error: null }); }
    };
  };
  TH.FakeDb = FakeDb;

  // ───────────────────────────── fixtures ─────────────────────────────
  var NAMES = ['Wyatt Wiltbank', 'Jackson Booher', 'Ayden Jester', 'Hudson Hartstein', 'Jake Coulbourne', 'Brody Pegelow', 'Mason Maloney', 'Declan Soares', 'Cayden White', 'Braden Franssen', 'Jaxon May', 'Logan May'];
  function seed(D, opt) {
    opt = opt || {};
    var players = NAMES.map(function (n, i) { var p = n.split(' '); return { id: 'pl' + (i + 1), jersey_num: [27, 3, 54, 11, 23, 5, 47, 2, 7, 44, 24, 99][i], first_name: p[0], last_name: p[1], positions: ['P'], photo_url: null }; });
    var named = opt.named || 9;
    var lineup = []; for (var i = 0; i < 9; i++) {
      lineup.push(i < named ? { playerId: players[i].id, playerName: NAMES[i], jerseyNum: players[i].jersey_num, position: ['CF', 'RF', '2B', '3B', 'SS', '1B', 'LF', 'C', 'DH'][i], battingOrder: i + 1 }
        : { playerId: null, playerName: '', jerseyNum: null, position: '', battingOrder: i + 1 });
    }
    var opp = []; for (var k = 0; k < (opt.opp == null ? 9 : opt.opp); k++) opp.push({ name: (k + 1) + ' Opp' + (k + 1), position: 'P' + (k + 1), battingOrder: k + 1 });
    var notes = { aces_lineup: lineup, aces_pitcher_id: 'pl10', aces_pitcher_name: 'Braden Franssen', aces_pitcher_num: 44, opp_lineup: opp, opp_pitcher: 'Opp Starter', subs_log: [] };
    D.tables = {
      games: [{ id: 'g1', team_id: 't1', game_date: '2026-10-01', season: '__test__', status: 'scheduled', is_home: !!opt.home, our_score: 0, opp_score: 0, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0, base_1b: false, base_2b: false, base_3b: false, youtube_stream_id: null, stream_start_utc: null, notes: JSON.stringify(notes), opponents: { name: 'Testers' }, location: null, bug_show_pitching: true, bug_show_atbat: true }],
      players: players, at_bats: [], pitches: [], radar_readings: [], game_angles: [], team_photos: [],
      app_settings: [{ id: 1, chip_base_check: true, chip_fielder_tag: true, chip_spray: true, chip_d3k: true }]
    };
    D.log = []; D.subs = []; D.seq = 0;
    return D;
  }

  // ─────────────────────── baseball reference model ───────────────────────
  var BR = /(stolen_base|wp_advance|pb_advance|balk|caught_stealing|pickoff|out_advancing)/i;
  function outsOf(r) { if (/double_play/i.test(r)) return 2; return /(strikeout|groundout|flyout|lineout|popout|sac_fly|sac_bunt|caught_stealing|pickoff|out_advancing|dropped_third_k|fielders_choice)/i.test(r) ? 1 : 0; }
  function payoffPitch(r, skip) {
    if (skip || BR.test(r) || /^(walk|intentional_walk)$/.test(r)) return null;
    if (r === 'hbp') return 'hbp'; if (r === 'strikeout_looking') return 'strike_called';
    if (r === 'strikeout_swinging' || r === 'dropped_third' || r === 'dropped_third_k') return 'strike_swinging';
    return 'in_play';
  }
  var cnt = function (b) { return (b[0] ? 1 : 0) + (b[1] ? 1 : 0) + (b[2] ? 1 : 0); };
  // What must be true for the play to be physically possible at all.
  function possible(r, b) {
    if (r === 'stolen_base' || r === 'caught_stealing' || r === 'out_advancing' || /wp_advance|pb_advance|balk/.test(r)) return cnt(b) > 0;
    if (r === 'pickoff_1b') return b[0]; if (r === 'pickoff_2b') return b[1]; if (r === 'pickoff_3b') return b[2];
    if (r === 'double_play' || r === 'fielders_choice') return cnt(b) > 0;
    return true;
  }

  // ───────────────────────────── scorer driver ─────────────────────────────
  var D = null, fails = null, confirmAnswer = function () { return false; }, confirms = [];
  function fail(cat, msg) { (fails[cat] = fails[cat] || { n: 0, ex: [] }).n++; if (fails[cat].ex.length < 12) fails[cat].ex.push(msg); }
  function snap() {
    return clone({ balls: S.balls, strikes: S.strikes, outs: S.outs, inning: S.inning, isTop: S.isTop, bases: S.bases, scores: S.scores, pitchCount: S.pitchCount, abNum: S.abNum, bi: S.currentBatterIdx, oi: S.currentOppBatterIdx, apc: S.acesPitchCount, opc: S.oppPitchCount });
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function clearOffers() { try { hideD3K(); hideBaseCheck(); hideFielderTag(); disarmSpray(); } catch (e) { } }
  async function settle(ms) { await sleep(ms == null ? 4 : ms); }

  async function boot(opt) {
    D = TH.db = seed(new FakeDb(), opt);
    var c = D.client();
    db.from = c.from; db.channel = c.channel; db.removeChannel = c.removeChannel;
    window.fetch = function (url) { TH.fetched.push(String(url)); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [] }); } }); };
    window.confirm = function (m) { confirms.push(String(m).split('\n')[0]); return confirmAnswer(m); };
    window.alert = function () { }; window.prompt = function () { return null; };
    try { localStorage.removeItem('aces_offline_queue'); localStorage.removeItem('aces_game_state_g1'); } catch (e) { }
    HISTORY.length = 0; RECENT.length = 0; for (var k in BATLINE) delete BATLINE[k];
    _claimed = false; _takenOver = false; GAME_OVER = false; isOnline = true;
    Object.keys(PC_LOCAL).forEach(function (k) { delete PC_LOCAL[k]; }); streamMode = 'unknown';
    S.currentBatterIdx = 0; S.currentOppBatterIdx = 0; S.oppLineup = []; S.acesLineup = [];   // a real page load starts clean
    var sel = document.getElementById('game-sel');
    sel.innerHTML = '<option value="g1">harness game</option>'; sel.value = 'g1';
    document.getElementById('yt-id').value = '';
    var keep = confirmAnswer; confirmAnswer = function () { return true; };
    await startScoring(); await settle(20);
    confirmAnswer = keep;
    clearOffers();
  }
  TH.fetched = [];

  function setState(side, outs, bases, balls, strikes, pc) {
    // side 'bat' = Aces hitting, 'field' = Aces pitching
    S.isTop = S.acesHome ? (side !== 'bat') : (side === 'bat');
    S.outs = outs; S.bases = bases.slice(); S.balls = balls; S.strikes = strikes; S.pitchCount = pc;
  }
  function allResults() {
    var seen = {}, out = [];
    Object.keys(MODALS).forEach(function (m) { MODALS[m].sections.forEach(function (s) { s.items.forEach(function (it) { if (!seen[it.v]) { seen[it.v] = 1; out.push({ v: it.v, l: it.l, modal: m }); } }); }); });
    return out;
  }
  var SKIP = /(walk|intentional_walk|stolen_base|wp_advance|pb_advance|balk|caught_stealing|pickoff|out_advancing)/i;

  // ── TEST 1: every outcome × every base state × every out count × both sides ──
  TH.matrix = async function () {
    await boot({ home: false });
    confirmAnswer = function () { return false; };   // never end the half inside the matrix
    var results = allResults(), cases = 0, impossible = [];
    for (var si = 0; si < 2; si++) for (var outs = 0; outs < 3; outs++) for (var bm = 0; bm < 8; bm++) for (var ri = 0; ri < results.length; ri++) {
      var side = si ? 'field' : 'bat', bases = [!!(bm & 1), !!(bm & 2), !!(bm & 4)], R = results[ri], r0 = R.v;
      setState(side, outs, bases, 1, 1, 2);
      HISTORY.length = 0;
      var pre = snap(), nP = D.tables.pitches.length, nA = D.tables.at_bats.length, bl = JSON.stringify(BATLINE), rc = RECENT.length;
      var tag = side + ' ' + outs + 'out ' + (bases.map(function (b, i) { return b ? (i + 1) : '-'; }).join('')) + ' ' + r0;
      window._lastLogAB = 0;
      var skip = SKIP.test(r0);
      await logAB(r0, R.l, skip); await settle(0);
      cases++;
      if (!possible(r0, bases)) {
        // an impossible play must be refused outright: no row, no state change
        impossible.push(tag);
        if (!same(snap(), pre) || D.tables.at_bats.length !== nA || D.tables.pitches.length !== nP) fail('impossible', tag + ': accepted a play that cannot happen (outs ' + pre.outs + '→' + S.outs + ', rows +' + (D.tables.at_bats.length - nA) + ')');
        HISTORY.length = 0; clearOffers(); continue;
      }
      var post = snap(), ab = D.tables.at_bats[D.tables.at_bats.length - 1], newP = D.tables.pitches.slice(nP);
      if (D.tables.at_bats.length !== nA + 1) { fail('row', tag + ': at_bats rows +' + (D.tables.at_bats.length - nA)); }
      var r = ab ? ab.result : r0, isBR = BR.test(r), oAdd = outsOf(r), runs = ab ? ab.runs_scored : 0;
      var poss = true;
      // a "sacrifice" with nobody to move, or with two out, has to be booked as the plain out
      if (r0 === 'sac_fly' && (pre.outs >= 2 || !pre.bases[2]) && r !== 'flyout') fail('sacrifice', tag + ': stored as ' + r + ', should be flyout');
      if (r0 === 'sac_bunt' && (pre.outs >= 2 || !cnt(pre.bases)) && r !== 'groundout') fail('sacrifice', tag + ': stored as ' + r + ', should be groundout');
      // outs
      var expOuts = Math.min(3, pre.outs + oAdd);
      if (post.outs !== expOuts) fail('outs', tag + ': outs ' + pre.outs + '→' + post.outs + ' expected ' + expOuts);
      // conservation of people (skip when the half is over — nothing after out 3 matters)
      if (poss && expOuts < 3) {
        var lhs = cnt(pre.bases) + (isBR ? 0 : 1), rhs = cnt(post.bases) + runs + oAdd;
        if (lhs !== rhs) fail('conservation', tag + ': ' + cnt(pre.bases) + ' on' + (isBR ? '' : ' + batter') + ' ≠ ' + cnt(post.bases) + ' on + ' + runs + ' runs + ' + oAdd + ' outs  (bases ' + pre.bases.map(Number).join('') + '→' + post.bases.map(Number).join('') + ')');
      }
      // nothing may score on the play that makes the third out when that out is the batter/force
      if (expOuts >= 3 && runs > 0 && /^(strikeout|groundout|flyout|lineout|popout|sac_fly|sac_bunt|double_play|dropped_third_k|fielders_choice)/.test(r)) fail('run-on-3rd-out', tag + ': ' + runs + ' run(s) credited on the third out');
      // hits by the book
      if (poss && expOuts < 3) {
        var eb = null, er = null, b = pre.bases;
        if (r === 'single') { er = b[2] ? 1 : 0; eb = [true, b[0], b[1]]; }
        if (r === 'double') { er = (b[1] ? 1 : 0) + (b[2] ? 1 : 0); eb = [false, true, b[0]]; }
        if (r === 'triple') { er = cnt(b); eb = [false, false, true]; }
        if (r === 'home_run') { er = cnt(b) + 1; eb = [false, false, false]; }
        if (r === 'walk' || r === 'intentional_walk' || r === 'hbp') {
          if (b[0] && b[1] && b[2]) { er = 1; eb = [true, true, true]; } else if (b[0] && b[1]) { er = 0; eb = [true, true, true]; } else if (b[0]) { er = 0; eb = [true, true, b[2]]; } else { er = 0; eb = [true, b[1], b[2]]; }
        }
        if (/^(groundout|flyout|lineout|popout|strikeout_looking|strikeout_swinging)$/.test(r)) { er = 0; eb = b.slice(); }
        if (eb && (!same(post.bases, eb) || runs !== er)) fail('book', tag + ': got bases ' + post.bases.map(Number).join('') + ' runs ' + runs + ', book says ' + eb.map(Number).join('') + ' runs ' + er);
      }
      // score goes to the batting team, by the right amount
      var dUs = post.scores.us - pre.scores.us, dThem = post.scores.them - pre.scores.them;
      if (side === 'bat' ? (dUs !== runs || dThem !== 0) : (dThem !== runs || dUs !== 0)) fail('score', tag + ': runs ' + runs + ' but score moved us+' + dUs + ' them+' + dThem);
      // RBI rule
      if (ab) {
        var noRbi = /(error|double_play|wp_advance|pb_advance|balk|stolen_base|caught_stealing|pickoff|out_advancing)/i.test(r);
        var expRbi = (runs > 0 && !noRbi) ? runs : 0;
        if (ab.rbi !== expRbi) fail('rbi', tag + ': rbi ' + ab.rbi + ' expected ' + expRbi);
        // row context
        if (ab.outs_before !== pre.outs || ab.on_1b_before !== pre.bases[0] || ab.on_2b_before !== pre.bases[1] || ab.on_3b_before !== pre.bases[2]) fail('row', tag + ': situational columns wrong');
        if (ab.half !== (pre.isTop ? 'top' : 'bottom') || ab.inning !== pre.inning) fail('row', tag + ': inning/half wrong on the row');
        var ord = acesOrder(), expBatter = side === 'bat' ? ord[pre.bi % ord.length].playerId : null;
        if (ab.batter_id !== expBatter) fail('attribution', tag + ': batter_id ' + ab.batter_id + ' expected ' + expBatter);
        if (ab.aces_pitcher_id !== (side === 'field' ? S.currentPitcherId : null)) fail('attribution', tag + ': aces_pitcher_id ' + ab.aces_pitcher_id);
        if (side === 'bat' && ab.lineup_slot !== (pre.bi % ord.length) + 1) fail('attribution', tag + ': lineup_slot ' + ab.lineup_slot);
      }
      // the payoff pitch
      var want = payoffPitch(r0, false);   // by what the coach tapped
      if (r !== r0) want = payoffPitch(r, false);
      if (skip) want = null;
      if ((want ? 1 : 0) !== newP.length) fail('pitch-row', tag + ': ' + newP.length + ' pitch row(s), expected ' + (want ? 1 : 0));
      else if (want) {
        var p = newP[0];
        if (p.result !== want) fail('pitch-row', tag + ': pitch result ' + p.result + ' expected ' + want);
        if (p.pitch_num !== pre.pitchCount + 1) fail('pitch-row', tag + ': pitch_num ' + p.pitch_num + ' expected ' + (pre.pitchCount + 1));
        if (p.balls_before !== pre.balls || p.strikes_before !== pre.strikes) fail('pitch-row', tag + ': count on pitch ' + p.balls_before + '-' + p.strikes_before + ' expected ' + pre.balls + '-' + pre.strikes);
        if (p.pitcher_id !== (side === 'field' ? S.currentPitcherId : null)) fail('attribution', tag + ': pitch pitcher_id ' + p.pitcher_id);
        if (side === 'field' ? post.apc !== pre.apc + 1 : post.opc !== pre.opc + 1) fail('pitch-count', tag + ': pitch count did not move by 1');
      } else if (post.apc !== pre.apc || post.opc !== pre.opc) fail('pitch-count', tag + ': pitch count moved with no pitch');
      // batter / count handling
      if (isBR) {
        if (post.balls !== pre.balls || post.strikes !== pre.strikes || post.pitchCount !== pre.pitchCount) fail('count', tag + ': runner event disturbed the batter\'s count');
        if (post.bi !== pre.bi || post.oi !== pre.oi) fail('order', tag + ': runner event moved the batting order');
      } else {
        if (post.balls !== 0 || post.strikes !== 0) fail('count', tag + ': count not reset after the at-bat');
        if (post.pitchCount !== 0) fail('count', tag + ': per-batter pitch number not reset');
        var n1 = acesOrder().length, n2 = S.oppLineup.length;
        if (side === 'bat' ? post.bi !== (pre.bi + 1) % n1 : post.oi !== (pre.oi + 1) % n2) fail('order', tag + ': batting order did not advance by one');
        if (side === 'bat' ? post.oi !== pre.oi : post.bi !== pre.bi) fail('order', tag + ': the OTHER team\'s order moved');
      }
      // the games row is what every viewer reads
      var g = D.tables.games[0];
      if (g.our_score !== post.scores.us || g.opp_score !== post.scores.them || g.outs !== post.outs || g.balls !== post.balls || g.strikes !== post.strikes || g.base_1b !== post.bases[0] || g.base_2b !== post.bases[1] || g.base_3b !== post.bases[2] || g.inning !== post.inning || (g.half === 'top') !== post.isTop) fail('published', tag + ': games row differs from the scorer');
      // undo must be a perfect inverse
      clearOffers(); window._lastUndo = 0;
      await undoLast(); await settle(0);
      var back = snap();
      if (!same(back, pre)) fail('undo', tag + ': undo left ' + JSON.stringify(back) + ' expected ' + JSON.stringify(pre));
      if (D.tables.pitches.length !== nP || D.tables.at_bats.length !== nA) fail('undo', tag + ': undo left rows behind (pitches ' + (D.tables.pitches.length - nP) + ', at_bats ' + (D.tables.at_bats.length - nA) + ')');
      var blNow = {}; Object.keys(BATLINE).forEach(function (k) { var t = BATLINE[k]; if (t.ab || t.h || t.bb || t.hr) blNow[k] = t; });   // an all-zero line is the same as no line
      var blWas = {}, _was = JSON.parse(bl); Object.keys(_was).forEach(function (k) { var t = _was[k]; if (t.ab || t.h || t.bb || t.hr) blWas[k] = t; });
      if (JSON.stringify(blNow) !== JSON.stringify(blWas)) fail('undo', tag + ': batter game line not restored');
      if (RECENT.length !== rc) fail('undo', tag + ': feed has ' + (RECENT.length - rc) + ' stray row(s)');
      clearOffers();
    }
    return { cases: cases, impossible: impossible };
  };

  // ── TEST 2: every pitch sequence — counts, auto walk / K, pitch rows ──
  TH.counts = async function () {
    await boot({ home: false });
    confirmAnswer = function () { return false; };
    var P = ['ball', 'strike_called', 'strike_swinging', 'foul'], n = 0;
    for (var t = 0; t < 400; t++) {
      var side = t % 2 ? 'field' : 'bat';
      setState(side, 0, [false, false, false], 0, 0, 0); HISTORY.length = 0;
      var nP = D.tables.pitches.length, nA = D.tables.at_bats.length, b = 0, s = 0, seq = [], done = null;
      for (var k = 0; k < 14 && !done; k++) {
        var pr = P[Math.floor(Math.random() * 4)]; seq.push(pr);
        _lastPitchTap = { t: 0, r: '' };
        var eb = b, es = s;
        if (pr === 'ball') { b++; if (b >= 4) done = 'walk'; }
        else if (pr === 'foul') { if (s < 2) s++; }
        else { s++; if (s >= 3) done = pr === 'strike_called' ? 'strikeout_looking' : 'strikeout_swinging'; }
        await quickLog(pr); await settle(0);
        var row = D.tables.pitches[D.tables.pitches.length - 1];
        if (!row || row.result !== pr || row.balls_before !== eb || row.strikes_before !== es || row.pitch_num !== k + 1) fail('counts', seq.join(',') + ': pitch row ' + JSON.stringify(row && { r: row.result, c: row.balls_before + '-' + row.strikes_before, n: row.pitch_num }) + ' expected ' + pr + ' ' + eb + '-' + es + ' #' + (k + 1));
        if (!done && (S.balls !== b || S.strikes !== s)) fail('counts', seq.join(',') + ': count ' + S.balls + '-' + S.strikes + ' expected ' + b + '-' + s);
      }
      n++;
      if (done) {
        var ab = D.tables.at_bats[D.tables.at_bats.length - 1];
        if (D.tables.at_bats.length !== nA + 1 || !ab || ab.result !== done) fail('counts', seq.join(',') + ': expected auto ' + done + ', got ' + (ab && D.tables.at_bats.length !== nA ? ab.result : 'nothing'));
        if (S.balls !== 0 || S.strikes !== 0 || S.pitchCount !== 0) fail('counts', seq.join(',') + ': not reset after ' + done);
        if (D.tables.pitches.length - nP !== seq.length) fail('counts', seq.join(',') + ': ' + (D.tables.pitches.length - nP) + ' pitch rows for ' + seq.length + ' taps');
        // one Undo removes the payoff pitch AND the outcome together
        var before = D.tables.pitches.length; window._lastUndo = 0; clearOffers(); await undoLast(); await settle(0);
        if (D.tables.at_bats.length !== nA || D.tables.pitches.length !== before - 1) fail('counts', seq.join(',') + ': undo of auto ' + done + ' left rows wrong');
      } else if (D.tables.at_bats.length !== nA) fail('counts', seq.join(',') + ': an outcome fired with the at-bat unresolved');
      clearOffers();
    }
    return { sequences: n };
  };

  // ───────────────────────── gamecast in an iframe ─────────────────────────
  var VW = null;
  async function bootViewer() {
    var old = document.getElementById('th-viewer'); if (old) old.remove();
    // NOT ?test=1: the page's own first load runs against the real database,
    // and with the test door open it would pick up a real rehearsal game and
    // race the fake one. Open the door by hand once the fake is in place.
    var f = document.createElement('iframe'); f.id = 'th-viewer'; f.src = '/game.html?th=' + Date.now();
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:420px;height:560px;opacity:.02;pointer-events:none;border:0;z-index:-1';
    document.body.appendChild(f);
    await new Promise(function (r) { f.onload = r; });
    VW = f.contentWindow;
    for (var i = 0; i < 60 && !VW.db; i++) await sleep(50);
    for (i = 0; i < 100 && VW._pollBusy; i++) await sleep(50);   // its own init() holds _pollBusy until the first load is done
    await sleep(150);
    VW.SHOW_TEST = true;
    VW._ytSearched = true;                  // never spend YouTube quota from the rig
    VW.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [] }); } }); };
    VW.db = D.client();
    VW.liveGame = null;
    await VW.loadLiveGame(); await sleep(50);
    return VW;
  }
  function viewerState() {
    var d = VW.document, on = function (ids, cls) { return ids.filter(function (id) { var e = d.getElementById(id); return e && (' ' + e.className + ' ').indexOf(' ' + cls + ' ') >= 0; }).length; };
    return {
      us: +d.getElementById('away-score').textContent, them: +d.getElementById('home-score').textContent,
      inning: +d.getElementById('inn-num').textContent, top: /Top/.test(d.getElementById('inn-half').textContent),
      balls: on(['b1', 'b2', 'b3'], 'b'), strikes: on(['s1', 's2'], 's'), outs: on(['o1', 'o2'], 'o'),
      bases: (VW.bases || []).map(Boolean), batter: d.getElementById('b-name').textContent, pitcher: d.getElementById('p-name').textContent,
      pc: +d.getElementById('p-count').textContent, badge: (d.getElementById('nav-badge-txt') || {}).textContent
    };
  }
  function compareViewer(label) {
    if (!VW) return;
    var v = viewerState(), up = acesUp(), ord = acesOrder();
    var exp = {
      us: S.scores.us, them: S.scores.them, inning: S.inning, top: S.isTop,
      balls: Math.min(3, S.balls), strikes: Math.min(2, S.strikes), outs: Math.min(2, S.outs), bases: S.bases.map(Boolean),
      batter: up ? (ord.length ? ord[S.currentBatterIdx % ord.length].playerName : '') : (S.oppLineup.length ? (S.oppLineup[S.currentOppBatterIdx % S.oppLineup.length].name || 'Opp. Batter') : 'Opp. Batter'),
      pitcher: up ? (S.oppPitcher || 'Opp. Pitcher') : (S.currentPitcherName || '—'),
      pc: up ? S.oppPitchCount : S.acesPitchCount
    };
    Object.keys(exp).forEach(function (k) {
      if (JSON.stringify(v[k]) !== JSON.stringify(exp[k])) fail('viewer:' + k, label + ': gamecast shows ' + JSON.stringify(v[k]) + ', scorer has ' + JSON.stringify(exp[k]));
    });
  }

  // ── TEST 3: whole games, random plays, both pages checked after every tap ──
  function dbChecks(label) {
    var g = D.tables.games[0], abs = D.tables.at_bats, acesHalf = g.is_home ? 'bottom' : 'top';
    var us = 0, them = 0, outsNow = 0;
    abs.forEach(function (a) { if (a.half === acesHalf) us += a.runs_scored || 0; else them += a.runs_scored || 0; if (a.inning === S.inning && a.half === (S.isTop ? 'top' : 'bottom')) outsNow += outsOf(a.result); });
    if (us !== S.scores.us || them !== S.scores.them) fail('sim:score', label + ': scoreboard ' + S.scores.us + '-' + S.scores.them + ' but the recorded plays add up to ' + us + '-' + them);
    if (Math.min(3, outsNow) !== S.outs) fail('sim:outs', label + ': ' + S.outs + ' outs showing, recorded plays in this half make ' + outsNow);
    if (S.outs > 3 || S.outs < 0 || S.balls > 3 || S.strikes > 2) fail('sim:range', label + ': impossible count/outs ' + S.balls + '-' + S.strikes + ' ' + S.outs + ' out');
    if (g.our_score !== S.scores.us || g.opp_score !== S.scores.them || g.outs !== S.outs || g.inning !== S.inning || (g.half === 'top') !== S.isTop || g.balls !== S.balls || g.strikes !== S.strikes || g.base_1b !== S.bases[0] || g.base_2b !== S.bases[1] || g.base_3b !== S.bases[2]) fail('sim:published', label + ': games row out of step with the scorer');
    var n = {}; try { n = JSON.parse(g.notes || '{}'); } catch (e) { }
    if (n.cur_batter_idx !== S.currentBatterIdx || n.cur_opp_batter_idx !== S.currentOppBatterIdx) fail('sim:pointer', label + ': published pointers ' + n.cur_batter_idx + '/' + n.cur_opp_batter_idx + ' vs ' + S.currentBatterIdx + '/' + S.currentOppBatterIdx);
    var apc = D.tables.pitches.filter(function (p) { return p.pitcher_id === S.currentPitcherId; }).length;
    if (apc !== S.acesPitchCount) fail('sim:pitchcount', label + ': our pitcher shows ' + S.acesPitchCount + ', rows say ' + apc);
    // our hitters must come up in order, one slot at a time, across innings
    // in TAP order (ab_num is assigned at the tap; created_at is arrival order, which a slow network can shuffle)
    var slots = abs.filter(function (a) { return a.batter_id && !BR.test(a.result); }).sort(function (a, b) { return a.ab_num - b.ab_num; }).map(function (a) { return a.lineup_slot; }), nSl = acesOrder().length;
    for (var i = 1; i < slots.length; i++) if (slots[i] !== (slots[i - 1] % nSl) + 1) { fail('sim:order', label + ': lineup slots went ' + slots[i - 1] + ' → ' + slots[i]); break; }
    // per-batter pitch numbering: within each at-bat, 1..n with no repeats
    // (a runner making the third out ends the half mid-at-bat, so the half is a boundary too)
    var seq = [], bad = null, lastHalf = null;
    D.tables.pitches.concat(abs.filter(function (a) { return !BR.test(a.result); }).map(function (a) { return { _ab: 1, created_at: a.created_at }; })).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; }).forEach(function (x) {
      if (x._ab) { seq = []; return; }
      var hk = x.inning + x.half; if (hk !== lastHalf) { seq = []; lastHalf = hk; }
      seq.push(x.pitch_num);
      if (x.pitch_num !== seq.length && !bad) bad = hk + ' pitch numbers ' + seq.join(',');
    });
    if (bad && !dbChecks._pn) { dbChecks._pn = 1; fail('sim:pitchnum', label + ': ' + bad); }
  }
  TH.game = async function (opt) {
    opt = opt || {};
    await boot(opt);
    if (opt.viewer !== false) await bootViewer();
    confirmAnswer = function (m) { return /3 outs|already 3 outs|End the|Skip/i.test(m); };
    dbChecks._pn = 0;
    var steps = 0, halves = 0, undos = 0, maxInn = opt.innings || 4, guard = 0;
    var rnd = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    var INPLAY = ['groundout', 'groundout', 'groundout', 'flyout', 'flyout', 'lineout', 'popout', 'single', 'single', 'single', 'double', 'triple', 'home_run', 'error', 'fielders_choice', 'double_play', 'sac_fly', 'sac_bunt'];
    var LBL = {}; allResults().forEach(function (r) { LBL[r.v] = r.l; });
    while (S.inning <= maxInn && guard++ < 1500) {
      var label = (S.isTop ? 'T' : 'B') + S.inning + ' step ' + steps, startKey = S.inning + (S.isTop ? 't' : 'b');
      var roll = Math.random(), did = '';
      _lastPitchTap = { t: 0, r: '' }; window._lastLogAB = 0; window._lastUndo = 0;
      if (roll < 0.07 && HISTORY.length) { clearOffers(); await undoLast(); undos++; did = 'undo'; }
      else if (roll < 0.52) { var p = rnd(['ball', 'ball', 'strike_called', 'strike_swinging', 'foul']); await quickLog(p); did = p; }
      else if (roll < 0.60 && cnt(S.bases)) { var br = rnd(['stolen_base', 'wp_advance', 'pb_advance', 'caught_stealing', 'out_advancing', 'balk_advance'].concat(S.bases[0] ? ['pickoff_1b'] : [])); await logAB(br, LBL[br], true, false, null); did = br; }
      else if (roll < 0.63) { await logAB('hbp', 'HBP', false); did = 'hbp'; }
      else if (roll < 0.66) { var kk = rnd(['strikeout_looking', 'strikeout_swinging']); await logAB(kk, LBL[kk], false); did = kk + ' (modal)'; }
      else if (roll < 0.68 && opt.subs !== false && !acesUp()) { var np = rnd(['pl10', 'pl11', 'pl12']); if (np !== S.currentPitcherId) { await applyAcePitch(np); did = 'pitching change'; } }
      else {
        var pool = INPLAY.filter(function (r) { return possible(r, S.bases); });
        var ip = rnd(pool); await logAB(ip, LBL[ip], false); did = ip;
      }
      steps++; label += ' (' + did + ')';
      await settle(6);
      if (did === 'undo') await sleep(260);   // the gamecast recounts pitches after a delete; give the recount its 150ms
      if (S.outs >= 3) { await sleep(330); await settle(6); }   // the "3 outs — end half?" prompt
      if (S.inning + (S.isTop ? 't' : 'b') !== startKey) halves++;
      clearOffers();
      dbChecks(label);
      compareViewer(label);
    }
    var res = { steps: steps, halves: halves, undos: undos, atBats: D.tables.at_bats.length, pitches: D.tables.pitches.length, final: S.scores.us + '-' + S.scores.them, viewerErrors: (D.handlerErrors || []).slice(0, 5), viewerAtEnd: VW ? viewerState() : null };
    if (D.handlerErrors && D.handlerErrors.length) fail('viewer:exception', D.handlerErrors.length + ' exception(s) inside gamecast realtime handlers: ' + D.handlerErrors[0]);
    return res;
  };

  // ── TEST 4: resume rebuilds the same state; a parent opening mid-game sees it too ──
  TH.resume = async function () {
    var before = snap(), extra = { pitcher: S.currentPitcherId, bl: JSON.stringify(BATLINE), home: S.acesHome };
    HISTORY.length = 0; RECENT.length = 0; for (var k in BATLINE) delete BATLINE[k];
    S.balls = S.strikes = S.outs = 0; S.inning = 1; S.isTop = true; S.bases = [false, false, false]; S.scores = { us: 0, them: 0 };
    S.pitchCount = 0; S.abNum = 0; S.currentBatterIdx = 0; S.currentOppBatterIdx = 0; S.acesPitchCount = 0; S.oppPitchCount = 0; S.currentPitcherId = null;
    var keep = confirmAnswer; confirmAnswer = function () { return true; };
    await startScoring(); await settle(20); confirmAnswer = keep; clearOffers();
    var after = snap();
    Object.keys(before).forEach(function (k) { if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) fail('resume', k + ': was ' + JSON.stringify(before[k]) + ', after resume ' + JSON.stringify(after[k])); });
    if (S.currentPitcherId !== extra.pitcher) fail('resume', 'pitcher id ' + S.currentPitcherId + ' was ' + extra.pitcher);
    if (JSON.stringify(BATLINE) !== extra.bl) fail('resume', 'batter game lines differ after resume');
    if (S.acesHome !== extra.home) fail('resume', 'home/away flipped on resume');
    // a second viewer joining now must land on the same picture
    if (VW) { await bootViewer(); await sleep(150); compareViewer('viewer joining mid-game'); }
    return { ok: true };
  };

  // ── TEST 5: wifi drops, coach keeps scoring, page reloads, wifi returns ──
  TH.offline = async function () {
    await boot({ home: true });
    confirmAnswer = function (m) { return /3 outs/i.test(m); };
    setState('bat', 0, [false, false, false], 0, 0, 0);
    await quickLog('ball'); _lastPitchTap = { t: 0, r: '' }; window._lastLogAB = 0; await logAB('single', 'Single', false); await settle(5);
    var onlineRows = D.tables.at_bats.length + D.tables.pitches.length;
    isOnline = false; D.failInserts = true;
    var plays = [['double', 'Double'], ['groundout', 'Ground out'], ['home_run', 'Home Run'], ['flyout', 'Fly out']];
    for (var i = 0; i < plays.length; i++) { window._lastLogAB = 0; _lastPitchTap = { t: 0, r: '' }; await quickLog('strike_called'); window._lastLogAB = 0; await logAB(plays[i][0], plays[i][1], false); await settle(3); clearOffers(); }
    var q = getQueue().length, expectQ = plays.length * 3;   // strike + in_play + at_bat each
    if (q !== expectQ) fail('offline', 'queue holds ' + q + ' items after ' + plays.length + ' plays, expected ' + expectQ);
    if (D.tables.at_bats.length + D.tables.pitches.length !== onlineRows) fail('offline', 'rows reached the DB while offline');
    // undo one queued play: it must leave the queue, not phantom-insert later
    window._lastUndo = 0; await undoLast(); await settle(3);
    if (getQueue().length !== expectQ - 2) fail('offline', 'undo of a queued play left ' + getQueue().length + ' queued, expected ' + (expectQ - 2));
    var live = snap();
    // "reload" while still offline-with-queue: the local mirror must win over the stale games row
    HISTORY.length = 0; S.outs = 0; S.scores = { us: 0, them: 0 }; S.bases = [false, false, false]; S.currentBatterIdx = 0; S.balls = 0; S.strikes = 0;
    isOnline = true; D.failInserts = false;
    var keep = confirmAnswer; confirmAnswer = function () { return true; };
    await startScoring(); await settle(30); confirmAnswer = keep; clearOffers();
    var after = snap();
    ['outs', 'bases', 'scores', 'bi', 'inning', 'isTop', 'balls', 'strikes'].forEach(function (k) { if (JSON.stringify(live[k]) !== JSON.stringify(after[k])) fail('offline', 'after reload ' + k + ' = ' + JSON.stringify(after[k]) + ', the coach had ' + JSON.stringify(live[k])); });
    await flushQueue(); await settle(20);
    if (getQueue().length) fail('offline', getQueue().length + ' items still queued after reconnect');
    var g = D.tables.games[0];
    if (g.our_score !== live.scores.us || g.outs !== live.outs) fail('offline', 'after sync the games row shows ' + g.our_score + ' runs / ' + g.outs + ' outs, coach had ' + live.scores.us + ' / ' + live.outs);
    var us = 0; D.tables.at_bats.forEach(function (a) { us += a.runs_scored || 0; });
    if (us !== live.scores.us) fail('offline', 'synced plays add up to ' + us + ' runs, scoreboard says ' + live.scores.us);
    try { localStorage.removeItem('aces_offline_queue'); localStorage.removeItem('aces_game_state_g1'); } catch (e) { }
    return { queuedAtPeak: q };
  };

  // ── TEST 6: slow network + fast thumbs ──
  TH.races = async function () {
    var F = false, T = true, r = {};
    await boot({ home: false });
    confirmAnswer = function (m) { return /3 outs|already 3 outs/i.test(m); };
    D.latency = 70;
    var fresh = function () { HISTORY.length = 0; clearOffers(); _lastPitchTap = { t: 0, r: '' }; window._lastLogAB = 0; window._lastUndo = 0; };
    var rows = function () { return D.tables.pitches.length + '/' + D.tables.at_bats.length; };

    // a mis-tapped ball, Undo before the request has come back
    setState('field', 0, [F, F, F], 0, 0, 0); fresh(); var base = rows(), pre = snap();
    var a = quickLog('ball'); await sleep(8); var u = undoLast(); await Promise.all([a, u]); await sleep(350);
    if (rows() !== base) fail('race', 'undo during a pitch insert left rows ' + rows() + ' (was ' + base + ')');
    if (!same(snap(), pre)) fail('race', 'undo during a pitch insert left state ' + JSON.stringify(snap()));

    // ball four, Undo before it lands: no pitch, and no walk either
    setState('field', 0, [F, F, F], 3, 0, 3); fresh(); base = rows(); pre = snap();
    a = quickLog('ball'); await sleep(8); u = undoLast(); await Promise.all([a, u]); await sleep(500);
    if (rows() !== base) fail('race', 'undo of ball four mid-flight left rows ' + rows() + ' (was ' + base + ') — a walk logged after the undo');
    if (!same(snap(), pre)) fail('race', 'undo of ball four mid-flight left state ' + JSON.stringify(snap()) + ' expected ' + JSON.stringify(pre));

    // a hit, Undo while its pitch row is in flight… and again while the at-bat row is
    for (var w = 0; w < 2; w++) {
      setState('bat', 0, [T, F, F], 1, 1, 2); fresh(); base = rows(); pre = snap();
      a = logAB('single', 'Single', false); await sleep(w ? 130 : 8); window._lastUndo = 0; u = undoLast(); await Promise.all([a, u]); await sleep(500);
      if (rows() !== base) fail('race', 'undo of a single ' + (w ? 'during the at-bat insert' : 'during the pitch insert') + ' left rows ' + rows() + ' (was ' + base + ')');
      if (!same(snap(), pre)) fail('race', 'undo of a single mid-flight left state ' + JSON.stringify(snap()) + ' expected ' + JSON.stringify(pre));
    }

    // the catch-up habit: next pitch tapped while the last play is still saving.
    // Chips must stay with their own play (or not be offered) — never bind to the pitch.
    setState('bat', 0, [T, F, F], 0, 0, 0); fresh();
    a = logAB('groundout', 'Ground out', false); await sleep(8); _lastPitchTap = { t: 0, r: '' }; var b2 = quickLog('ball'); await Promise.all([a, b2]); await sleep(300);
    var abRow = D.tables.at_bats[D.tables.at_bats.length - 1], pitchEntry = HISTORY[HISTORY.length - 1];
    if (_baseCheck && _baseCheck.entry === pitchEntry) fail('race', 'base-check chip bound itself to the NEXT pitch — a Fix would change the score without patching any play');
    if (_spray && _spray.entry && _spray.entry.atBatId !== abRow.id) fail('race', 'spray tap would land on the wrong play');
    clearOffers();

    // 150 taps as fast as a thumb goes, never waiting for the network
    await bootViewer();
    setState('bat', 0, [F, F, F], 0, 0, 0); fresh(); await pushState(); await sleep(200);
    var rnd = function (x) { return x[Math.floor(Math.random() * x.length)]; }, LBL = {}; allResults().forEach(function (q) { LBL[q.v] = q.l; });
    var pend = [];
    for (var i = 0; i < 150; i++) {
      var roll = Math.random();
      window._lastUndo = 0; window._lastLogAB = 0; _lastPitchTap = { t: 0, r: '' };
      if (roll < 0.08 && HISTORY.length) pend.push(undoLast());
      else if (roll < 0.62) pend.push(quickLog(rnd(['ball', 'strike_called', 'strike_swinging', 'foul'])));
      else { var pool = ['groundout', 'flyout', 'single', 'double', 'home_run', 'error', 'popout', 'hbp', 'strikeout_swinging', 'fielders_choice', 'double_play', 'stolen_base', 'caught_stealing'].filter(function (x) { return possible(x, S.bases); }), pick = rnd(pool); pend.push(logAB(pick, LBL[pick] || pick, /stolen|caught/.test(pick))); }
      await sleep(Math.random() * 30);
      if (S.outs >= 3) await sleep(340);
      clearOffers();
    }
    await Promise.all(pend.map(function (p) { return p.catch(function () { }); })); await sleep(1200);
    if (S.outs >= 3) await sleep(400);
    D.latency = 0; await pushState(); await sleep(250);
    dbChecks._pn = 1;   // pitch numbering under deliberately overlapping taps is not a meaningful check
    dbChecks('after 150 rapid taps'); compareViewer('after 150 rapid taps');
    r.rapid = { pitches: D.tables.pitches.length, atBats: D.tables.at_bats.length, score: S.scores.us + '-' + S.scores.them };
    if (D.handlerErrors && D.handlerErrors.length) fail('viewer:exception', D.handlerErrors[0]);
    return r;
  };

  // ── TEST 7: the gamecast when things go wrong around it ──
  TH.viewerExtras = async function () {
    var F = false, T = true, r = {};
    await boot({ home: false });
    confirmAnswer = function (m) { return /3 outs|already 3 outs|End game/i.test(m); };
    await bootViewer();
    var d = VW.document, tap = function () { _lastPitchTap = { t: 0, r: '' }; window._lastLogAB = 0; window._lastUndo = 0; };
    var feedIds = function () { return { ab: [].map.call(d.querySelectorAll('#play-log [data-abid]'), function (e) { return e.dataset.abid; }), p: [].map.call(d.querySelectorAll('#play-log [data-pid]'), function (e) { return e.dataset.pid; }) }; };

    // (a) the websocket goes deaf for a few plays, then the poll runs: every row must be back
    setState('bat', 0, [F, F, F], 0, 0, 0); tap(); await quickLog('ball'); tap(); await logAB('single', 'Single', false); await settle(20);
    var keepSubs = D.subs; D.subs = [];                       // realtime silent
    tap(); await quickLog('strike_called'); tap(); await logAB('double', 'Double', false); tap(); await quickLog('ball'); tap(); await logAB('groundout', 'Ground out', false); await settle(20);
    D.subs = keepSubs;                                        // socket back (nothing is replayed)
    tap(); await quickLog('ball'); await settle(20);          // first row AFTER the gap arrives normally
    await VW.pollReconcile(); await sleep(80);
    var ids = feedIds(), missA = D.tables.at_bats.filter(function (a) { return ids.ab.indexOf(a.id) < 0; }).length, missP = D.tables.pitches.filter(function (x) { return ids.p.indexOf(x.id) < 0; }).length;
    if (missA || missP) fail('viewer:repair', 'after a websocket gap + one poll, the feed is still missing ' + missA + ' play(s) and ' + missP + ' pitch chip(s)');
    compareViewer('after a websocket gap');
    clearOffers();

    // (b) the scorer corrects a play (strikeout → dropped third, safe): the feed must follow
    setState('field', 0, [F, F, F], 0, 2, 2); HISTORY.length = 0; tap(); await quickLog('strike_swinging'); await settle(30);
    var kId = D.tables.at_bats[D.tables.at_bats.length - 1].id;
    if (!_d3k) fail('viewer:correction', 'no dropped-third chip was offered');
    else { await convertD3K(true); await sleep(900); var row = d.querySelector('#play-log [data-abid="' + kId + '"] .play-result'); if (!row || !/dropped third/i.test(row.textContent)) fail('viewer:correction', 'after converting the K to a dropped third, the feed still says "' + (row ? row.textContent : 'nothing') + '"'); }
    compareViewer('after a dropped-third conversion'); clearOffers();

    // (c) undo a play: the at-bat's earlier pitch chips must survive as a live at-bat
    setState('bat', 1, [F, F, F], 0, 0, 0); HISTORY.length = 0;
    tap(); await quickLog('ball'); tap(); await quickLog('strike_called'); tap(); await logAB('flyout', 'Fly out', false); await settle(30);
    var twoChips = D.tables.pitches.slice(-3, -1).map(function (x) { return x.id; });
    tap(); await undoLast(); await sleep(900);
    ids = feedIds();
    if (twoChips.some(function (id) { return ids.p.indexOf(id) < 0; })) fail('viewer:undo', 'after undoing the fly out, the ball and strike that are still in the book vanished from the feed');
    compareViewer('after an undo'); clearOffers();

    // (d) Final: board says Final, not "▼ Bot Inning" with a live count
    // (endGame itself redirects the page; flip the row the way it does)
    await db.from('games').update({ status: 'final', our_score: S.scores.us, opp_score: S.scores.them }).eq('id', S.gameId); await sleep(150);
    var half = d.getElementById('inn-half').textContent, badge = (d.getElementById('nav-badge-txt') || {}).textContent;
    if (!/final/i.test(half) || !/final/i.test(badge)) fail('viewer:final', 'after End game the board shows "' + half + '" / badge "' + badge + '"');

    // (e) the stream search must never stamp a video onto the wrong game
    var found = 'AAAAAAAAAAA';
    VW.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ items: [{ id: { videoId: found } }] }); } }); };
    var g1 = D.tables.games[0];                      // g1 is now FINAL with no video
    D.tables.games.push({ id: 'g2', team_id: 't1', game_date: VW.localYmd(), season: 'fall2026', status: 'scheduled', youtube_stream_id: null, opponents: { name: 'Later Today' }, notes: '{}' });
    g1.youtube_stream_id = null; g1.game_date = VW.localYmd(); VW.liveGame = Object.assign({}, g1); VW._ytSearched = false;
    var fr = d.getElementById('yt-iframe'); if (fr) fr.remove();
    await VW.checkYouTubeLive(); await sleep(60);
    if (g1.youtube_stream_id) fail('viewer:stream', 'a FINISHED game was stamped with the live stream id');
    if (D.tables.games[1].youtube_stream_id) fail('viewer:stream', 'a merely SCHEDULED game was stamped with the live stream id');
    // …but the game that is actually live does get it, once
    D.tables.games[1].status = 'live'; VW.liveGame = Object.assign({}, D.tables.games[1], { team_name: 'Delmarva Aces', opponent_name: 'Later Today' }); VW._ytSearched = false;
    fr = d.getElementById('yt-iframe'); if (fr) fr.remove();
    await VW.checkYouTubeLive(); await sleep(60);
    if (D.tables.games[1].youtube_stream_id !== found) fail('viewer:stream', 'the live game did not get the found stream id');
    // a dry run on the air must not reach families through the search
    D.tables.games[1].status = 'scheduled'; D.tables.games[1].youtube_stream_id = null;
    D.tables.games.push({ id: 'g3', team_id: 't1', game_date: VW.localYmd(), season: '__test__', status: 'live', youtube_stream_id: null, opponents: { name: 'Dry Run' }, notes: '{}' });
    VW.liveGame = null; VW._ytSearched = false; VW.SHOW_TEST = false;
    fr = d.getElementById('yt-iframe'); if (fr) fr.remove();
    await VW.checkYouTubeLive(); await sleep(60);
    if (d.getElementById('yt-iframe')) fail('viewer:stream', 'a rehearsal stream was embedded on the family page');
    if (D.tables.games[1].youtube_stream_id) fail('viewer:stream', 'a rehearsal stream id was written onto the real scheduled game');
    VW.SHOW_TEST = true;
    r.ok = true; return r;
  };

  // ───────────────────────────── run everything ─────────────────────────────
  TH.runAll = async function (opt) {
    opt = opt || {};
    fails = TH.fails = {}; confirms = [];
    var out = { started: new Date().toISOString() };
    var realFetch = window.fetch, realConfirm = window.confirm;
    try {
      if (opt.matrix !== false) out.matrix = await TH.matrix();
      if (opt.counts !== false) out.counts = await TH.counts();
      if (opt.games !== false) {
        out.games = [];
        var cfgs = [{ home: false }, { home: true }, { home: true, named: 7, opp: 5 }, { home: false, named: 9, opp: 0 }];
        for (var i = 0; i < (opt.nGames || cfgs.length); i++) {
          var c = cfgs[i % cfgs.length]; c.innings = opt.innings || 4;
          var g = await TH.game(c); g.cfg = JSON.stringify(c);
          g.resume = await TH.resume();
          out.games.push(g);
        }
      }
      if (opt.offline !== false) out.offline = await TH.offline();
      if (opt.races !== false) out.races = await TH.races();
      if (opt.viewerExtras !== false) out.viewerExtras = await TH.viewerExtras();
    } catch (e) { out.crashed = String(e && e.stack || e); }
    finally {
      window.fetch = realFetch; window.confirm = realConfirm;
      var v = document.getElementById('th-viewer'); if (v) v.remove(); VW = null;
      try { localStorage.removeItem('aces_offline_queue'); localStorage.removeItem('aces_game_state_g1'); } catch (e) { }
    }
    var total = 0; Object.keys(fails).forEach(function (k) { total += fails[k].n; });
    out.failures = total; out.byCategory = {}; Object.keys(fails).forEach(function (k) { out.byCategory[k] = fails[k].n; });
    TH.last = out;
    return out;
  };
})();
