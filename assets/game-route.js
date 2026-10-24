/* assets/game-route.js — ONE routing rule for Courtside Live <-> Pixel Replay.
 *
 * The 24h rule (binding, courtside-replay/SPEC.md §1–§2 as refined by
 * PRD-SPEC.md): "live" owns the now-window (last 24h + today's games);
 * "replay" owns everything older than 24h. Entry points link the *game*;
 * this module decides the surface. Shared links never rot.
 *
 * Truth table (also encoded in tests/test_game_route.py — keep in sync):
 *   state 'pre' | 'in'            -> 'live'                      (always)
 *   state 'post', age <= 24h - m  -> 'live'
 *   state 'post', age >  24h + m  -> 'replay'
 *   state 'post', age in the gray zone | age unknown | state unknown -> 'stay'
 *
 * m (marginMs) exists because callers estimate the final whistle from tip
 * time (tip + 2.5h); the gray zone means we never confidently route a game
 * to the wrong surface on a bad estimate — and the guard only redirects when
 * surfaceFor() disagrees with the current surface, so loops are impossible
 * (K2). Pass marginMs=0 for the strict SPEC contract (tests do this).
 *
 * Stdlib only. Deferred classic script; also require()-able in node for tests.
 */
(function (global) {
  'use strict';

  var HOUR_MS = 3600 * 1000;
  var LIVE_WINDOW_MS = 24 * HOUR_MS;
  var EST_MARGIN_MS = 2.5 * HOUR_MS; // max plausible game duration

  var ID_KEYS = ['game', 'g', 'espn'];           // every id-param spelling
  var KEEP_KEYS = ['possession', 't', 'view', 'cam']; // deep-link params: preserved, never treated as ids

  /* Pure: which surface for this game state? 'live' | 'replay' | 'stay'. */
  function surfaceFor(state, gameTimeMs, marginMs) {
    if (state === 'pre' || state === 'in') return 'live';
    if (state !== 'post') return 'stay';
    if (gameTimeMs == null || !(gameTimeMs > 0)) return 'stay';
    var m = marginMs || 0;
    var age = Date.now() - gameTimeMs;
    if (age <= LIVE_WINDOW_MS - m) return 'live';
    if (age > LIVE_WINDOW_MS + m) return 'replay';
    return 'stay';
  }

  /* Pure-ish: normalize the URL's id params. Returns {id, keep} where keep is
   * a query string (no leading ?) of the preserved deep-link params. */
  function readParams(search) {
    var q = new URLSearchParams(search || '');
    var id = null, key = null;
    for (var i = 0; i < ID_KEYS.length; i++) {
      var v = q.get(ID_KEYS[i]);
      if (v) { id = v; key = ID_KEYS[i]; break; }
    }
    var keep = [];
    for (var j = 0; j < KEEP_KEYS.length; j++) {
      var kv = q.get(KEEP_KEYS[j]);
      if (kv != null && kv !== '') keep.push(encodeURIComponent(KEEP_KEYS[j]) + '=' + encodeURIComponent(kv));
    }
    return { id: id, key: key, keep: keep.join('&') };
  }

  function targetFor(surface, id, keep, notice) {
    var base = surface === 'live' ? '/live?game=' + encodeURIComponent(id)
                                 : '/replay?espn=' + encodeURIComponent(id);
    var extra = (keep ? '&' + keep : '') + (notice ? '&notice=' + notice : '');
    return base + extra;
  }

  /* The guard. currentSurface: 'live' | 'replay'. lookup(id) -> {state,
   * gameTimeMs} | null (null = can't decide -> stay put). Returns true when
   * it redirected (caller must stop rendering). Never loops: it only fires
   * when surfaceFor() disagrees with the current surface. */
  function guard(currentSurface, lookup, loc) {
    loc = loc || (typeof location !== 'undefined' ? location : null);
    if (!loc) return false;
    var p = readParams(loc.search);
    if (!p.id) return false;
    var info = null;
    try { info = lookup(p.id); } catch (e) { info = null; }
    if (!info) return false;
    var want = surfaceFor(info.state, info.gameTimeMs, EST_MARGIN_MS);
    if (want === 'stay' || want === currentSurface) return false;
    var notice = want === 'replay' ? 'moved-to-replay' : 'moved-to-live';
    loc.replace(targetFor(want, p.id, p.keep, notice));
    return true;
  }

  /* One-line "moved" banner from ?notice=, shown once then stripped via
   * replaceState. mount: an element id or null (creates one at body top). */
  function notice(mountId, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    var q;
    try { q = new URLSearchParams(typeof location !== 'undefined' ? location.search : ''); }
    catch (e) { return false; }
    var n = q.get('notice');
    if (n !== 'moved-to-replay' && n !== 'moved-to-live') return false;
    var msg = n === 'moved-to-replay'
      ? 'This game has moved to Pixel Replay — you\u2019re seeing the archived view.'
      : 'This game is live now — you\u2019re on Courtside Live.';
    var el = mountId ? doc.getElementById(mountId) : null;
    if (!el) {
      el = doc.createElement('div');
      el.setAttribute('role', 'status');
      el.style.cssText = 'margin:10px auto;max-width:720px;padding:10px 14px;border:1px solid var(--line-2,#d8cfb8);border-radius:10px;font-size:13px;text-align:center;background:var(--surface,#fff);';
      if (doc.body) doc.body.insertBefore(el, doc.body.firstChild);
      else return false;
    }
    el.textContent = msg;
    el.hidden = false;
    try {
      var url = new URL(typeof location !== 'undefined' ? location.href : '');
      url.searchParams.delete('notice');
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    } catch (e) { /* banner stays; harmless */ }
    return true;
  }

  var api = {
    LIVE_WINDOW_MS: LIVE_WINDOW_MS,
    EST_MARGIN_MS: EST_MARGIN_MS,
    surfaceFor: surfaceFor,
    readParams: readParams,
    targetFor: targetFor,
    guard: guard,
    notice: notice
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.GameRoute = api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
