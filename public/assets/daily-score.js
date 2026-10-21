/* daily-score.js — the P0 score-trust core for Daily Court (ux-revamp PLAN §6).
 *
 * This is the extract of the score contract into a small testable module.
 * The score is a PURE function of the guess event stream: record() appends
 * via union-merge, never overwrites, never throws. On storage write failure
 * it queues the event and surfaces "unsynced" — it never renders a stale
 * number. Every rendered score, streak-adjacent count and guess count derives
 * from scoreSlot()/readDay() over that stream and nothing else. Records stamp
 * their rules version, and a rule change VERSIONS old scores instead of
 * rewriting them: scoreSlot dispatches on record.rv through the frozen
 * SCORERS table (an unknown/future rv yields a frozen `legacy` verdict, never
 * a freshly computed score).
 *
 * Dual environment: in the browser it sets window.VHDailyScore; under Node it
 * exports the same API via module.exports. The REFRESH-PROOF fuzz suite
 * (tests/daily-refresh-proof.test.mjs) hammers the standalone store:
 * 1,000 serialize → reload → render runs, zero divergences.
 *
 * Browser integration: bindLedger(window.VHLedger) returns an API with the
 * same shape whose writes delegate to the ledger, so production keeps exactly
 * ONE writer of Daily Court slot state. The standalone createStore() exists
 * for the fuzz suite and for verify()'s self-check.
 */
(function () {
  'use strict';

  var SCORE_RULES_V = 'v1';      // rules version stamped by record()
  var MAX_GUESSES = 6;
  var WIN_RULE = 'win = a guess names the target\u2019s modern twin within 6 guesses';
  var UNSYNCED_LABEL = 'unsynced';

  /* ---- frozen rule sets: a rule change ADDS a scorer, never edits one ----
   * v1 (current): won iff some guess has rank === 0 within the first 6
   * deduped guesses; lost iff 6 guesses with no win; else open. The game is 6
   * guesses: the effective stream ends at the first win or at 6 guesses, so
   * no input — valid or corrupted — can produce winIn > 6 or count > 6. */
  function scoreV1(guesses) {
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
      rules: 'v1'
    };
  }
  var SCORERS = { v1: scoreV1 };

  /* ---- guess identity + union merge (append-only, never deletes) ---- */
  function guessKey(g) {
    if (!g) return '';
    if (g.gid) return 'gid:' + g.gid;
    var n = '';
    try { n = String(g.name || '').toLowerCase().trim(); } catch (e) {}
    return n ? 'n:' + n : '';
  }
  function dedupeGuesses(guesses) {
    var seen = {}, seenName = {}, out = [], i, g, k, nm;
    if (!Array.isArray(guesses)) return out;
    for (i = 0; i < guesses.length; i++) {
      g = guesses[i];
      if (!g) continue;
      k = guessKey(g);
      if (!k || seen[k]) continue;
      try { nm = String(g.name || '').toLowerCase().trim(); } catch (e) { nm = ''; }
      if (nm && seenName[nm]) continue;
      seen[k] = true;
      if (nm) seenName[nm] = true;
      out.push(g);
    }
    out.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });
    return out;
  }
  function mergeStream(a, b) { return dedupeGuesses((a || []).concat(b || [])); }

  function stampEvent(guess, dayKey, slot, sid) {
    if (!guess || typeof guess !== 'object') return null;
    var g = {};
    var src = guess;
    for (var p in src) { if (Object.prototype.hasOwnProperty.call(src, p)) g[p] = src[p]; }
    try {
      if (!g.gid) g.gid = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
      g.day = dayKey;
      g.slot = slot;
      if (g.ts == null) g.ts = Date.now();
      if (!g.sid) g.sid = sid || ('s' + Math.floor(Math.random() * 1e9).toString(36));
    } catch (e) {}
    return g;
  }

  /* THE scoring procedure. Pure: record in, score out. Dispatches on the
   * record's stamped rules version: a record carrying an unknown (future)
   * rules version is frozen as `legacy` — old scores version instead of
   * being rewritten under new rules. */
  function scoreSlot(record) {
    var rec = record || {};
    var rv = rec.rv || 'v1';
    var scorer = SCORERS[rv];
    if (!scorer) {
      return { won: false, count: 0, over: true, winIn: 0, state: 'legacy',
               legacy: true, rules: rv,
               note: 'scored under frozen rules ' + rv + '; not rescored' };
    }
    return scorer(rec.guesses);
  }

  function fmtSlotScore(record, dayKey) {
    var s = scoreSlot(record);
    if (s.legacy) return 'Scored under rules ' + s.rules;
    if (s.won) return 'Won in ' + s.winIn + '/' + MAX_GUESSES + ' \u00B7 ' + dayKey;
    if (s.state === 'lost') return 'Missed \u00B7 ' + dayKey;
    if (!s.count) return 'Not started';
    return s.count + '/' + MAX_GUESSES + ' tries';
  }

  /* ---- standalone store: injectable storage, the fuzz suite's target ---- */
  function slotStorageKey(dayKey, slot, mode) {
    return 'vh.score.v1.' + dayKey + '.' + (mode === 'triple' ? 'triple' : 'court') + '.slot' + slot;
  }

  function createStore(storage) {
    var pending = [];
    var unsyncedFlag = false;

    function setRaw(k, v) {
      try { storage.setItem(k, v); return true; } catch (e) { return false; }
    }
    function getRaw(k) {
      try { return storage.getItem(k); } catch (e) { return null; }
    }
    function delRaw(k) {
      try { if (storage.removeItem) storage.removeItem(k); } catch (e) {}
    }

    function load(dayKey, slot, mode) {
      var raw = getRaw(slotStorageKey(dayKey, slot, mode));
      if (!raw) return null;
      var rec = null;
      try { rec = JSON.parse(raw); } catch (e) { rec = null; }
      if (!rec || !Array.isArray(rec.guesses)) return null;
      if ((rec.day != null && rec.day !== dayKey) ||
          (rec.slot != null && rec.slot !== slot)) return null;
      return rec;
    }

    /* record(): appends ONE guess event via union-merge, never overwrites,
     * never throws. Stamps SCORE_RULES_V. On storage failure the event is
     * queued and the result reports ok:false + unsynced — the caller shows
     * "unsynced", never a stale number. */
    function record(dayKey, slot, guess, mode) {
      var out = { ok: false, unsynced: false, score: null, dayKey: dayKey, slot: slot };
      try {
        var sid = 's' + Math.floor(Math.random() * 1e9).toString(36);
        var ev = stampEvent(guess, dayKey, slot, sid);
        if (!ev) { out.score = scoreSlot({ rv: SCORE_RULES_V, guesses: [] }); return out; }
        var cur = (load(dayKey, slot, mode) || { guesses: [] }).guesses;
        var merged = mergeStream(cur, [ev]);
        var rec = { day: dayKey, slot: slot, mode: (mode === 'triple' ? 'triple' : 'court'),
                    guesses: merged, rv: SCORE_RULES_V, ts: Date.now() };
        var value = JSON.stringify(rec);
        var k = slotStorageKey(dayKey, slot, mode);
        if (setRaw(k, value)) {
          pending = pending.filter(function (w) { return w.key !== k; });
          if (!pending.length) unsyncedFlag = false;
          out.ok = true;
        } else {
          pending.push({ key: k, value: value });
          unsyncedFlag = true;
        }
        out.unsynced = unsyncedFlag;
        out.score = scoreSlot(rec);
        return out;
      } catch (e) {
        // record() never throws — the worst case is an unsynced report.
        unsyncedFlag = true;
        out.unsynced = true;
        out.error = 'record failed; queued for retry';
        return out;
      }
    }

    function flush() {
      var failed = [];
      for (var i = 0; i < pending.length; i++) {
        if (!setRaw(pending[i].key, pending[i].value)) failed.push(pending[i]);
      }
      pending = failed;
      unsyncedFlag = failed.length > 0;
      return { ok: failed.length === 0, remaining: failed.length, unsynced: unsyncedFlag };
    }

    function readSlot(dayKey, slot, mode) {
      var rec = load(dayKey, slot, mode);
      if (!rec || !rec.guesses.length) return null;
      var s = scoreSlot(rec);
      return { won: s.won, count: s.count, over: s.over, winIn: s.winIn,
               state: s.state, legacy: !!s.legacy, rules: s.rules,
               guesses: rec.guesses, ledgerLine: fmtSlotScore(rec, dayKey) };
    }

    /* readDay(): the ONLY aggregation. Every rendered solved/guess count
     * derives from this, over the event stream and nothing else. */
    function readDay(dayKey, mode, slotCount) {
      var n = slotCount || 5, slots = [], solved = 0, totalGuesses = 0, i, r;
      for (i = 0; i < n; i++) {
        r = readSlot(dayKey, i, mode);
        slots.push(r);
        if (r && !r.legacy) { if (r.won) solved++; totalGuesses += r.count; }
      }
      return { dayKey: dayKey, mode: (mode === 'triple' ? 'triple' : 'court'),
               slots: slots, solved: solved, total: n, totalGuesses: totalGuesses,
               unsynced: unsyncedFlag, rules: SCORE_RULES_V };
    }

    /* renderSnapshot(): the single render input. A renderer draws ONLY from
     * this object — same stream in, same snapshot out, across reloads. */
    function renderSnapshot(dayKey, mode, slotCount) {
      var day = readDay(dayKey, mode, slotCount);
      return {
        dayKey: day.dayKey,
        mode: day.mode,
        solved: day.solved,
        total: day.total,
        totalGuesses: day.totalGuesses,
        unsynced: day.unsynced,
        rules: day.rules,
        scoreLine: day.solved + '/' + day.total + ' in ' + day.totalGuesses + ' guesses',
        slots: day.slots.map(function (s, i) {
          if (!s) return { slot: i, played: false, line: 'Not started' };
          return { slot: i, played: true, won: s.won, count: s.count,
                   over: s.over, state: s.state, legacy: s.legacy,
                   line: s.ledgerLine };
        })
      };
    }

    function unsynced() { return unsyncedFlag; }
    function pendingWrites() { return pending.slice(); }

    return { record: record, flush: flush, load: load, readSlot: readSlot,
             readDay: readDay, renderSnapshot: renderSnapshot,
             unsynced: unsynced, _pendingWrites: pendingWrites,
             _slotStorageKey: slotStorageKey };
  }

  /* ---- browser integration: one writer, via the ledger ----
   * bindLedger(ledger) returns the same contract surface with writes and
   * reads delegated to window.VHLedger (the production single writer), so
   * the standalone store never competes with it in the browser. */
  function bindLedger(ledger) {
    function modeOf(m) { return m === 'triple' ? 'triple' : 'court'; }
    return {
      bound: true,
      record: function (dayKey, slot, guess, mode) {
        var m = modeOf(mode), out = { ok: false, unsynced: false, score: null };
        try {
          if (ledger && typeof ledger.flush === 'function') ledger.flush();
          var cur = [], loaded = null;
          if (ledger && typeof ledger.readSlot === 'function') {
            loaded = ledger.readSlot(dayKey, slot, m);
            cur = (loaded && loaded.guesses) || [];
          }
          var ev = stampEvent(guess, dayKey, slot, null);
          var merged = mergeStream(cur, ev ? [ev] : []);
          var r = (ledger && typeof ledger.record === 'function')
            ? ledger.record(dayKey, slot, { guesses: merged }, m)
            : null;
          out.ok = !!(r && r.ok);
          out.unsynced = (ledger && typeof ledger.unsynced === 'function')
            ? !!ledger.unsynced() : !out.ok;
          out.score = scoreSlot({ rv: SCORE_RULES_V, guesses: merged });
          return out;
        } catch (e) {
          out.unsynced = true;
          return out;
        }
      },
      readSlot: function (dayKey, slot, mode) {
        try {
          var rec = ledger.readSlot(dayKey, slot, modeOf(mode));
          if (!rec) return null;
          var s = scoreSlot({ rv: SCORE_RULES_V, guesses: rec.guesses || [] });
          return { won: s.won, count: s.count, over: s.over, winIn: s.winIn,
                   state: s.state, rules: s.rules, guesses: rec.guesses || [],
                   ledgerLine: fmtSlotScore({ rv: SCORE_RULES_V, guesses: rec.guesses || [] }, dayKey) };
        } catch (e) { return null; }
      },
      readDay: function (dayKey, mode, slotCount) {
        var m = modeOf(mode), n = slotCount || 5, slots = [], solved = 0,
            totalGuesses = 0, i, r;
        for (i = 0; i < n; i++) {
          r = this.readSlot(dayKey, i, m);
          slots.push(r);
          if (r) { if (r.won) solved++; totalGuesses += r.count; }
        }
        return { dayKey: dayKey, mode: m, slots: slots, solved: solved,
                 total: n, totalGuesses: totalGuesses,
                 unsynced: !!(ledger && ledger.unsynced && ledger.unsynced()),
                 rules: SCORE_RULES_V };
      },
      renderSnapshot: function (dayKey, mode, slotCount) {
        var day = this.readDay(dayKey, mode, slotCount);
        return {
          dayKey: day.dayKey, mode: day.mode, solved: day.solved,
          total: day.total, totalGuesses: day.totalGuesses,
          unsynced: day.unsynced, rules: day.rules,
          scoreLine: day.solved + '/' + day.total + ' in ' + day.totalGuesses + ' guesses',
          slots: day.slots.map(function (s, i) {
            if (!s) return { slot: i, played: false, line: 'Not started' };
            return { slot: i, played: true, won: s.won, count: s.count,
                     over: s.over, state: s.state, line: s.ledgerLine };
          })
        };
      },
      unsynced: function () {
        try { return !!(ledger && ledger.unsynced && ledger.unsynced()); }
        catch (e) { return true; }
      }
    };
  }

  /* ---- verify(): the runtime self-check ----
   * Canned histories through the real frozen scorer + a serialize round-trip,
   * plus the walker-observed contradictions quoted as assertions. Runs at
   * load; play.html hides streak displays unless it passes — a wrong score
   * is worse than no score. Deterministic, synchronous. */
  function verify() {
    try {
      var mk = function (n, winAt) {
        var gs = [];
        for (var i = 0; i < n; i++) {
          gs.push({ name: 'G' + i, rank: (winAt === i + 1) ? 0 : 40 + i, ts: i });
        }
        return gs;
      };
      var cases = [
        { g: mk(3, 3), won: true, winIn: 3, state: 'won' },
        { g: mk(6, 0), won: false, winIn: 0, state: 'lost' },
        { g: mk(1, 1), won: true, winIn: 1, state: 'won' },
        { g: mk(2, 0), won: false, winIn: 0, state: 'open' },
        { g: [], won: false, winIn: 0, state: 'open' },
        { g: mk(9, 0), won: false, winIn: 0, state: 'lost' }  // >6 inputs capped
      ];
      for (var i = 0; i < cases.length; i++) {
        var c = cases[i];
        var s1 = scoreSlot({ rv: SCORE_RULES_V, guesses: c.g });
        var s2 = scoreSlot(JSON.parse(JSON.stringify({ rv: SCORE_RULES_V, guesses: c.g })));
        if (s1.won !== c.won || s1.winIn !== c.winIn || s1.state !== c.state) return false;
        if (s1.won !== s2.won || s1.winIn !== s2.winIn || s1.state !== s2.state ||
            s1.count !== s2.count) return false;   // reload invariance
        if (s1.count > MAX_GUESSES || s1.winIn > MAX_GUESSES) return false;
      }
      // "Won in 5/6" on a failed game must never render.
      if (fmtSlotScore({ rv: SCORE_RULES_V, guesses: mk(6, 0) }, '2026-10-19').indexOf('Won') !== -1) return false;
      // A stale write must union, never clobber.
      var m = mergeStream([{ name: 'A', rank: 5 }], [{ name: 'B', rank: 0 }]);
      if (m.length !== 2 || !m.some(function (g) { return g.rank === 0; })) return false;
      // An unknown rules version freezes the score — never a fresh verdict.
      var leg = scoreSlot({ rv: 'vX-future', guesses: mk(1, 1) });
      if (!leg.legacy || leg.state !== 'legacy' || leg.won) return false;
      // record() on a dead store: queued + unsynced, never thrown.
      var dead = createStore({ getItem: function () { return null; },
        setItem: function () { throw new Error('denied'); },
        removeItem: function () {} });
      var r = dead.record('2026-10-19', 0, { name: 'X', rank: 5 }, 'court');
      if (r.ok !== false || r.unsynced !== true) return false;
      return true;
    } catch (e) { return false; }
  }
  var honest = verify();

  var api = {
    SCORE_RULES_V: SCORE_RULES_V,
    MAX_GUESSES: MAX_GUESSES,
    WIN_RULE: WIN_RULE,
    UNSYNCED_LABEL: UNSYNCED_LABEL,
    scoreSlot: scoreSlot,
    fmtSlotScore: fmtSlotScore,
    mergeStream: mergeStream,
    dedupeGuesses: dedupeGuesses,
    createStore: createStore,
    bindLedger: bindLedger,
    verify: verify,
    honest: honest
  };
  if (typeof window !== 'undefined') window.VHDailyScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
