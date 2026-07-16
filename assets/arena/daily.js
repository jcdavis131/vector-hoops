/* Arena daily-puzzle selection — the ONE place the day's row is decided.
 *
 * Deterministic given (core.json pool, UTC day number): every player on
 * Earth gets the same puzzle, no backend. pipeline/test_arena.py runs this
 * exact file under node and asserts a Python mirror agrees, so any change
 * here fails the gate until the spec is re-pinned.
 *
 * UMD-lite: browser global `ArenaDaily` + node `module.exports`.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ArenaDaily = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Day #1 = the epoch date itself (UTC). */
  function dayNumber(epochIso, nowMs) {
    var epoch = Date.parse(epochIso + "T00:00:00Z");
    return Math.floor((nowMs - epoch) / 86400000) + 1;
  }

  /* Weight-proportional draw from pool = [[rowIdx, weight1to255], ...]. */
  function pickDaily(pool, day) {
    var seed = (Math.imul(day, 2654435761) >>> 0) ^ 0x9e3779b9;
    var rng = mulberry32(seed);
    var total = 0;
    for (var i = 0; i < pool.length; i++) total += pool[i][1];
    var t = rng() * total;
    for (var j = 0; j < pool.length; j++) {
      t -= pool[j][1];
      if (t <= 0) return pool[j][0];
    }
    return pool[pool.length - 1][0];
  }

  /* Free-play draw: uniform, seeded by a client nonce so "new puzzle" is
   * cheap but never collides with the daily lane. */
  function pickFree(pool, nonce) {
    var rng = mulberry32((nonce ^ 0x51ed270b) | 0);
    return pool[Math.floor(rng() * pool.length)][0];
  }

  return {
    mulberry32: mulberry32,
    dayNumber: dayNumber,
    pickDaily: pickDaily,
    pickFree: pickFree,
  };
});
