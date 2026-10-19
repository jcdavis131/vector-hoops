/* VHAnalytics — the one analytics call site the product is allowed.
 *
 * Backend-swappable facade: VHAnalytics.track(event, props). Until a backend
 * is chosen (his pick — Umami is installed on the VM, the snippet awaits a
 * reachability decision), track() is a no-op that buffers the last 200 events
 * in memory for debugging. Do NOT wire a backend here; call
 * VHAnalytics.configure({send: fn}) from the chosen backend's snippet.
 *
 * Events (panel v4, Tier 2 item 11 — Zuck/Locke/Silver/Dean converge):
 *
 *   visit            {path, ref}            — Owner Q: which inbound refs actually bring returning players?
 *   game_completed   {won, guesses, slot, mode, dayKey}
 *                                            — Owner Q: is difficulty in the productive zone — do solve
 *                                              rates by slot justify 6 guesses?
 *   share_tapped     {mode}                 — Owner Q: what fraction of completed games produce a share tap?
 *   share_confirmed  {method, mode}         — Owner Q: do VERIFIED shares (not taps) drive ref=share visits?
 *   streak_day       {dayKey, streak, result}
 *                                            — Owner Q: does a protected streak bring the player back
 *                                              tomorrow (day-2 return by streak state)?
 *
 * One-line owner question per event, per the panel: no vanity events — every
 * event answers one named decision ("what would we change if this moved?").
 */
(function (global) {
  'use strict';

  var BUFFER_MAX = 200;
  var buffer = [];
  var sender = null; // set by VHAnalytics.configure({send: function(event, props){...}})

  function configure(opts) {
    opts = opts || {};
    if (typeof opts.send === 'function') sender = opts.send;
  }

  function track(event, props) {
    var rec = { event: event, props: props || {}, ts: new Date().toISOString() };
    if (buffer.length >= BUFFER_MAX) buffer.shift();
    buffer.push(rec);
    if (sender) {
      try { sender(event, props || {}); } catch (e) {}
    }
    // No console noise in prod: the traces go to the backend, not the log.
  }

  function recent() { return buffer.slice(); }

  global.VHAnalytics = {
    track: track,
    configure: configure,
    recent: recent
  };
})(window);
