/* Daily Court append-only ledger (panel v3 G1).
 *
 * Invariant: a guess recorded for (day, slot) is NEVER removed or altered by
 * a later write. The old protocol was a blind full-array overwrite
 * (read-modify-write with no merge, no versioning, no writer identity), so
 * any two writers sharing the origin's localStorage — two tabs, or two
 * walkthrough sessions on one profile — silently corrupted each other's
 * game history: phantom guesses, fabricated wins, inflated streaks.
 *
 * This module is pure logic with injected storage, so node can test the
 * protocol without a DOM. play-engine.js wires it to localStorage.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DailyLedger = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function newSessionId() {
    try {
      return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
    } catch (e) { return 's0'; }
  }

  // Stamp identity onto a guess at record time. Idempotent — never
  // overwrites an existing gid/sid.
  function stampGuess(g, day, slot, sid) {
    if (!g || typeof g !== 'object') return g;
    try {
      if (!g.gid) g.gid = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
      if (day != null) g.day = day;
      if (slot != null) g.slot = slot;
      if (g.ts == null) g.ts = Date.now();
      if (!g.sid) g.sid = sid || newSessionId();
    } catch (e) {}
    return g;
  }

  function guessKey(g) {
    if (!g) return '';
    if (g.gid) return 'gid:' + g.gid;
    var n = '';
    try { n = String(g.name || '').toLowerCase().trim(); } catch (e) {}
    return n ? 'n:' + n : '';
  }

  // Union by identity. Never deletes. Stable chronological order.
  // Legacy unstamped guesses dedupe by name, as before; stamped guesses also
  // dedupe by name, preserving the old "one guess per player per slot" rule
  // even when two writers stamp the same player independently.
  function mergeGuesses(a, b) {
    var seen = {}, seenName = {}, out = [], li, i, g, k, nm;
    var lists = [a, b];
    for (li = 0; li < lists.length; li++) {
      var arr = lists[li];
      if (!Array.isArray(arr)) continue;
      for (i = 0; i < arr.length; i++) {
        g = arr[i];
        if (!g) continue;
        k = guessKey(g);
        if (!k || seen[k]) continue;
        try { nm = String(g.name || '').toLowerCase().trim(); } catch (e) { nm = ''; }
        if (nm && seenName[nm]) continue;
        seen[k] = true;
        if (nm) seenName[nm] = true;
        out.push(g);
      }
    }
    out.sort(function (x, y) { return (x.ts || 0) - (y.ts || 0); });
    return out;
  }

  function createLedger(storage, opts) {
    opts = opts || {};
    var qPrefix = opts.quarantinePrefix || 'vh.quarantine.v1.';

    function readRaw(k) {
      try {
        var raw = storage.getItem(k);
        if (!raw) return null;
        return { raw: raw, rec: JSON.parse(raw) };
      } catch (e) {
        return { raw: null, rec: null, corrupt: true };
      }
    }

    function quarantine(k, raw) {
      try {
        storage.setItem(qPrefix + Date.now().toString(36),
          JSON.stringify({ key: k, raw: String(raw).slice(0, 4000) }));
        storage.removeItem(k);
      } catch (e) {}
    }

    // Load guesses for (day, slot). A record whose stored day/slot does not
    // match is FOREIGN — quarantined (moved aside with its bytes intact),
    // never silently merged, never silently dropped.
    function load(k, day, slot) {
      var r = readRaw(k);
      if (!r || !r.raw) return { guesses: [], quarantined: false };
      var rec = r.rec;
      if (!rec || !Array.isArray(rec.guesses) ||
          (rec.day != null && rec.day !== day) ||
          (rec.slot != null && slot != null && rec.slot !== slot)) {
        quarantine(k, r.raw);
        return { guesses: [], quarantined: true };
      }
      return { guesses: mergeGuesses([], rec.guesses), quarantined: false };
    }

    // Append-only save: union(stored, incoming) by identity, then persist.
    // Returns the merged array — the caller MUST adopt it as the working
    // set, so a stale in-memory array can never clobber newer storage.
    function save(k, day, slot, guesses, sid) {
      var cur = load(k, day, slot).guesses;
      var stamped = (guesses || []).map(function (g) { return stampGuess(g, day, slot, sid); });
      var merged = mergeGuesses(cur, stamped);
      try {
        storage.setItem(k, JSON.stringify({ day: day, slot: slot, guesses: merged }));
      } catch (e) {}
      return merged;
    }

    return { load: load, save: save, quarantine: quarantine };
  }

  return {
    newSessionId: newSessionId,
    stampGuess: stampGuess,
    mergeGuesses: mergeGuesses,
    createLedger: createLedger
  };
});
