/* daily-ledger.js — the Daily Court ledger: the ONLY writer and reader of
 * Daily Court slot state. (v4 panel Tier 0 #1: "the ledger is the product.")
 *
 * What it owns:
 *   - per-slot game records:  vh.daily.v2.{dayKey}.slot{i}   (Daily Court)
 *                             vh.triple.v1.{dayKey}.slot{i}  (Daily Triple)
 *   - the day streak:         vh.streak.v2  (legacy vh.streak, vh_weekStreak
 *                             migrated on first read — same values, new home)
 *
 * The win rule, stated once, beside every score it renders:
 *   WIN_RULE = "win = a guess names the target's modern twin within 6 guesses"
 * The score is a PURE function of the guess event stream (scoreSlot): the same
 * serialized history always yields the same score, across reloads, days, and
 * rule versions (each record stamps RULES_VERSION, so a rule change versions
 * old scores instead of rewriting them).
 *
 * Honesty contract:
 *   - record() never throws on storage failure; it queues the write and
 *     reports {ok:false}. Callers show "unsynced" — never a stale number.
 *   - VHLedger.honest is set by verify(), a synchronous self-check of canned
 *     histories that runs at load. Streak displays must hide unless honest
 *     (Dye: a wrong streak is worse than no streak).
 *   - streakOdds(k) is Diaconis base-rate math, p^k, with an EXPLICITLY
 *     LABELED assumed daily win rate — illustrative, not measured.
 */
(function () {
  'use strict';

  var RULES_VERSION = 'v1';
  var WIN_RULE = 'win = a guess names the target\u2019s modern twin within 6 guesses';
  var MAX_GUESSES = 6;

  /* Twin-band thresholds, mirroring assets/twin_bands.json (terciles of the
   * 1,181 twin similarities: strong >= 0.727, lean >= 0.663, else distant).
   * TODO(registry-lane): unify with the served-constants registry when it
   * lands; until then these two literals must match twin_bands.json. */
  var BANDS = [
    { min: 0.727, label: 'strong' },
    { min: 0.663, label: 'lean' },
    { min: 0.0,   label: 'distant' }
  ];

  /* Storage is injectable so the Node fuzz suite can test the real shipped
   * bytes against a fake store. In the browser it is localStorage. */
  var _store = null;
  function store() {
    if (_store) return _store;
    try { return window.localStorage; } catch (e) { return null; }
  }
  function getItem(k) { var s = store(); if (!s) return null; try { return s.getItem(k); } catch (e) { return null; } }
  function setItem(k, v) { var s = store(); if (!s) return false; try { s.setItem(k, v); return true; } catch (e) { return false; } }

  function slotKey(dayKey, slot, mode) {
    var prefix = (mode === 'triple') ? 'vh.triple.v1.' : 'vh.daily.v2.';
    return prefix + dayKey + '.slot' + slot;
  }

  function dedupeGuesses(guesses) {
    var seen = {}, out = [];
    for (var i = 0; i < (guesses || []).length; i++) {
      var g = guesses[i] || {};
      var key = (g.name || '').toLowerCase();
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(g);
    }
    return out;
  }

  /* THE scoring procedure. Pure: guesses in, score out. Won iff some guess
   * has rank === 0 (the guess named the target's modern twin). Everything —
   * game screen, ledger card, streak pill, share card — renders from this.
   *
   * The game is 6 guesses: the effective stream ends at the first win or at
   * 6 guesses, whichever comes first. Anything beyond is not the game, so
   * no input — valid or corrupted — can produce winIn > 6 or count > 6. */
  function scoreSlot(guesses) {
    var gs = dedupeGuesses(guesses);
    var won = false, winIn = 0, count = 0;
    for (var i = 0; i < gs.length && i < MAX_GUESSES; i++) {
      count++;
      if (gs[i] && gs[i].rank === 0) { won = true; winIn = count; break; }
    }
    var over = won || count >= MAX_GUESSES;
    return {
      won: won,
      count: count,
      over: over,
      winIn: won ? winIn : 0,
      state: won ? 'won' : (over ? 'lost' : 'open'),
      rules: RULES_VERSION
    };
  }

  function bandForSim(sim) {
    var s = Number(sim);
    if (!isFinite(s)) return BANDS[2].label;
    for (var i = 0; i < BANDS.length; i++) {
      if (s >= BANDS[i].min) return BANDS[i].label;
    }
    return BANDS[2].label;
  }

  /* Kubrick's state-matrix strings. A loss is "Missed · {date}" — never "Won". */
  function fmtSlotScore(slotRec, dayKey) {
    if (!slotRec) return 'Not started';
    var s = scoreSlot(slotRec.guesses);
    if (s.won) return 'Won in ' + s.winIn + '/' + MAX_GUESSES + ' \u00B7 ' + dayKey;
    if (s.state === 'lost') return 'Missed \u00B7 ' + dayKey;
    return s.count + '/' + MAX_GUESSES + ' tries';
  }

  /* ---- writes ---- */
  var pendingWrites = [];   // queued {key, value} when storage failed
  var unsyncedFlag = false;

  function record(dayKey, slot, record, mode) {
    var key = slotKey(dayKey, slot, mode);
    var gs = dedupeGuesses((record && record.guesses) || []);
    var value = JSON.stringify({
      day: dayKey,
      slot: slot,
      guesses: gs,
      rules: RULES_VERSION,
      ts: Date.now()
    });
    if (setItem(key, value)) {
      // A successful write clears any earlier failure for this key.
      pendingWrites = pendingWrites.filter(function (w) { return w.key !== key; });
      if (!pendingWrites.length) unsyncedFlag = false;
      return { ok: true, score: scoreSlot(gs) };
    }
    // Write failed: queue for retry, NEVER pretend it landed.
    pendingWrites.push({ key: key, value: value });
    unsyncedFlag = true;
    return { ok: false, error: 'storage write failed; queued for retry', score: scoreSlot(gs) };
  }

  function flush() {
    var failed = [];
    for (var i = 0; i < pendingWrites.length; i++) {
      if (!setItem(pendingWrites[i].key, pendingWrites[i].value)) failed.push(pendingWrites[i]);
    }
    pendingWrites = failed;
    unsyncedFlag = failed.length > 0;
    return { ok: failed.length === 0, remaining: failed.length };
  }

  function unsynced() { return unsyncedFlag; }

  /* ---- reads ---- */
  function readSlot(dayKey, slot, mode) {
    var raw = getItem(slotKey(dayKey, slot, mode));
    if (!raw) return null;
    try {
      var j = JSON.parse(raw);
      if (!j || j.day !== dayKey) return null;   // stale day: not this ledger page
      var gs = dedupeGuesses(j.guesses);
      var s = scoreSlot(gs);
      return { won: s.won, count: s.count, over: s.over, winIn: s.winIn, state: s.state, rules: j.rules || '?', guesses: gs };
    } catch (e) { return null; }
  }

  function read(dayKey, mode, poolLen) {
    var n = poolLen || 5;
    var slots = [], solved = 0, totalGuesses = 0;
    for (var i = 0; i < n; i++) {
      var rec = readSlot(dayKey, i, mode);
      slots.push(rec);
      if (rec) { if (rec.won) solved++; totalGuesses += rec.count; }
    }
    return {
      dayKey: dayKey,
      mode: mode || 'court',
      slots: slots,
      solved: solved,
      total: n,
      totalGuesses: totalGuesses,
      unsynced: unsyncedFlag,
      honest: honest
    };
  }

  /* ---- streak ---- */
  var STREAK_KEY = 'vh.streak.v2';
  function loadStreak() {
    try {
      var raw = getItem(STREAK_KEY);
      if (!raw) {
        var legacy = getItem('vh_weekStreak');
        if (legacy) {
          var w = JSON.parse(legacy);
          var seeded = { streak: w.streak || 0, lastPlayedDay: w.last || null, best: w.streak || 0, lastWin: true };
          setItem(STREAK_KEY, JSON.stringify(seeded));
          setItem('vh.streak', JSON.stringify({ streak: seeded.streak }));
          return seeded;
        }
        return { streak: 0, lastPlayedDay: null, best: 0, lastWin: false };
      }
      var j = JSON.parse(raw);
      return { streak: j.streak || 0, lastPlayedDay: j.lastPlayedDay || null, best: j.best || j.streak || 0, lastWin: !!j.lastWin };
    } catch (e) { return { streak: 0, lastPlayedDay: null, best: 0, lastWin: false }; }
  }
  function saveStreak(obj) {
    var ok = setItem(STREAK_KEY, JSON.stringify(obj));
    try { setItem('vh.streak', JSON.stringify({ streak: obj.streak })); } catch (e) {}
    return ok;
  }
  function getStreak() { return loadStreak(); }

  function dayDiff(a, b) {
    var d1 = new Date(a + 'T00:00:00Z'), d2 = new Date(b + 'T00:00:00Z');
    return Math.round((d2 - d1) / 86400000);
  }

  /* outcome: 'win' (solved >= 1 slot today) or 'loss' (all slots resolved, none solved) */
  function recordDayOutcome(dayKey, outcome) {
    if (!dayKey) return { ok: false, streak: 0 };
    var cur = loadStreak();
    if (cur.lastPlayedDay === dayKey) return { ok: true, streak: cur.streak, unchanged: true };
    var nxt, lastWin;
    if (outcome === 'win') {
      nxt = 1; lastWin = true;
      if (cur.lastPlayedDay) {
        var diff = dayDiff(cur.lastPlayedDay, dayKey);
        if (diff === 1) nxt = cur.streak + 1;
        else if (diff === 0) nxt = cur.streak;
        else nxt = 1;
      }
    } else {
      nxt = 0; lastWin = false;
    }
    var best = Math.max(cur.best || 0, nxt);
    var ok = saveStreak({ streak: nxt, lastPlayedDay: dayKey, best: best, lastWin: lastWin });
    if (!ok) unsyncedFlag = true;
    return { ok: ok, streak: nxt, best: best };
  }

  /* Diaconis base-rate math for the streak parenthetical.
   *
   * streakOdds(k) = p^k with p = ASSUMED_DAILY_WIN_RATE = 0.6, EXPLICITLY
   * LABELED as an assumption. This is an illustrative base rate — a "what
   * would luck alone produce" yardstick — NOT a measured property of any
   * player. Display is rounded with a leading "~": no fake precision.
   * Example: a 7-day streak at p=0.6 is 0.6^7 ≈ 2.8% per attempt. */
  var ASSUMED_DAILY_WIN_RATE = 0.6; // ASSUMED, labeled everywhere it is shown
  function streakOdds(k) {
    var n = Math.max(0, Math.floor(k || 0));
    return { p: ASSUMED_DAILY_WIN_RATE, k: n, prob: Math.pow(ASSUMED_DAILY_WIN_RATE, n) };
  }
  function streakOddsText(k) {
    var o = streakOdds(k);
    var pct = o.prob * 100;
    var pctStr = pct < 0.1 ? '<0.1' : (pct < 10 ? pct.toFixed(1) : Math.round(pct).toString());
    return 'a ' + Math.round(o.p * 100) + '%-a-day player reaches a ' + o.k +
      '-day streak ~' + pctStr + '% of the time';
  }

  /* ---- self-check: streak displays hide unless this passes (Dye's demand) ----
   * Canned histories through the real scoreSlot + a write/read round-trip.
   * Deterministic, synchronous, runs at load. The Node fuzz suite
   * (scripts/test_ledger.mjs) is the stronger CI gate; this is the runtime one. */
  var honest = true;
  function verify() {
    try {
      var mk = function (n, winAt) {
        var gs = [];
        for (var i = 0; i < n; i++) gs.push({ name: 'G' + i, rank: (winAt === i + 1) ? 0 : 40 + i });
        return gs;
      };
      var cases = [
        { g: mk(3, 3), won: true, winIn: 3, state: 'won' },     // win on guess 3
        { g: mk(6, 0), won: false, winIn: 0, state: 'lost' },   // 6 misses: loss
        { g: mk(1, 1), won: true, winIn: 1, state: 'won' },     // first-guess win
        { g: mk(2, 0), won: false, winIn: 0, state: 'open' },    // mid-game
        { g: [], won: false, winIn: 0, state: 'open' }           // not started
      ];
      for (var i = 0; i < cases.length; i++) {
        var s1 = scoreSlot(cases[i].g);
        var s2 = scoreSlot(JSON.parse(JSON.stringify(cases[i].g))); // serialize round-trip
        if (s1.won !== cases[i].won || s1.winIn !== cases[i].winIn || s1.state !== cases[i].state) return false;
        if (s1.won !== s2.won || s1.winIn !== s2.winIn || s1.state !== s2.state) return false; // reload invariance
      }
      // the walker-observed contradiction, quoted: a failed game must never
      // render "Won". (walkthrough-verification-v4 §1 #1)
      var lost = scoreSlot(mk(6, 0));
      if (fmtSlotScore({ guesses: mk(6, 0) }, '2026-10-19').indexOf('Won') !== -1) return false;
      if (lost.won) return false;
      return true;
    } catch (e) { return false; }
  }
  honest = verify();

  /* Share-card text builder, rendered from the ledger (never from live game
   * state). Losses share too: lost slots are X-marked rows (Wordle's growth
   * card). Every URL carries ref=share. */
  function shareUrl(dayKey, mode) {
    var base = 'https://hoops.dumbmodel.com/play?day=' + encodeURIComponent(dayKey);
    if (mode === 'triple') base += '&mode=triple';
    return base + '&ref=share';
  }
  function slotEmoji(r) {
    if (!r) return '\u2B1C';
    if (r.won) return r.winIn <= 2 ? '\u{1F7E9}' : r.winIn <= 4 ? '\u{1F7E8}' : '\u{1F7E7}';
    return '\u274C';
  }
  function shareText(ledger, pool, streakN) {
    var label = ledger.mode === 'triple' ? 'Daily Triple' : 'Daily Court';
    var grid = ledger.slots.map(slotEmoji).join(' ');
    var head = '\u{1F3C0} Vector Hoops ' + label + ' \u2014 ' + ledger.dayKey;
    var scoreLine = ledger.solved + '/' + ledger.total + ' in ' + ledger.totalGuesses +
      ' guess' + (ledger.totalGuesses === 1 ? '' : 'es');
    var streakLine = streakN > 0 ? ('\u{1F525} ' + streakN + '-day streak') : '';
    var url = shareUrl(ledger.dayKey, ledger.mode);
    var lines = (pool || []).map(function (p, i) {
      var sd = ledger.slots[i];
      var status = !sd ? '\u2B1C' : sd.won ? ('\u2705 ' + sd.winIn + '/6') : '\u274C X/6';
      return status + ' Slot ' + (i + 1) + ': ' + (p.n || '');
    }).join('\n');
    return head + '\n' + scoreLine + '\n' + grid +
      (streakLine ? '\n' + streakLine : '') + '\n' + lines +
      '\nPlay the same ' + (ledger.mode === 'triple' ? 'triple' : 'court') + ': ' + url;
  }

  var api = {
    RULES_VERSION: RULES_VERSION,
    WIN_RULE: WIN_RULE,
    MAX_GUESSES: MAX_GUESSES,
    BANDS: BANDS,
    ASSUMED_DAILY_WIN_RATE: ASSUMED_DAILY_WIN_RATE,
    slotKey: slotKey,
    scoreSlot: scoreSlot,
    bandForSim: bandForSim,
    fmtSlotScore: fmtSlotScore,
    record: record,
    flush: flush,
    unsynced: unsynced,
    readSlot: readSlot,
    read: read,
    getStreak: getStreak,
    recordDayOutcome: recordDayOutcome,
    streakOdds: streakOdds,
    streakOddsText: streakOddsText,
    shareUrl: shareUrl,
    shareText: shareText,
    slotEmoji: slotEmoji,
    verify: verify,
    honest: honest,
    _setStorage: function (s) { _store = s; },
    _pendingWrites: function () { return pendingWrites.slice(); }
  };
  if (typeof window !== 'undefined') window.VHLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
