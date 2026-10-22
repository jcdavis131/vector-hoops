/* Courtside Live: the Pixel Replay plate.
 *
 * live.js fires `courtside:render` every time it draws the page: after each poll (30 s
 * while a game is live) and while the viewer drags the rewind scrubber. This turns the
 * same ESPN summary into a replay game (assets/replay-espn.js) and hands it to the
 * embedded replay (assets/replay.js, data-mode="embed"). No request of its own.
 *
 * Following live, the replay plays each new play as it lands, in real time, a beat behind
 * the scoreboard and the other plates. Rewinding the page's timeline holds the court on
 * that play; the timeline's LIVE button follows again. The plate has one transport button:
 * play/pause, and pressing play while the page is at LIVE follows live again.
 */
(function () {
  'use strict';
  var plate = document.getElementById('rpPlate');
  if (!plate || !window.ReplayESPN) return;
  var meta = document.getElementById('rpPlateMeta'), full = document.getElementById('rpFull'), lag = document.getElementById('rpLag');
  var shown = null, plays = -1, status = '', lastIdx = null, lastLive = null, newest = null;

  function eventFor(g, idx) { // the replay event for ESPN play idx: the last one built from a play at or before it
    var k = 0; for (var i = 0; i < g.src.length; i++) { if (g.src[i] <= idx) k = i; else break; }
    return k;
  }
  function wallLag(g) { // how far the newest play trails the clock on the wall, from ESPN's own wallclock stamps
    for (var i = g.wall.length - 1; i >= 0; i--) if (g.wall[i]) return Math.max(0, Math.round((Date.now() - g.wall[i]) / 1000));
    return null;
  }

  window.addEventListener('courtside:render', function (ev) {
    var d = ev.detail && ev.detail.d, gm = ev.detail && ev.detail.g, idx = ev.detail.idx, live = !!ev.detail.live;
    if (!d || !gm || !window.PixelReplay) return;
    var R = window.PixelReplay, n = (d.plays || []).length, id = String(gm.id), g = null;
    var st = d.header && d.header.competitions && d.header.competitions[0] && d.header.competitions[0].status && d.header.competitions[0].status.type;
    var stKey = st ? st.state + (st.completed ? ':done' : '') : '';
    if (id !== shown || n !== plays || stKey !== status) { // new game, new plays, or the game went final
      try { g = window.ReplayESPN.toGame(d, id); } catch (e) { g = null; }
      var first = id !== shown;
      try { if (g) { R.setGame(g, first ? { live: live && g.live } : { keep: true }); if (first && !(live && g.live)) R.seekEvent(eventFor(g, idx)); } }
      catch (e) { g = null; }
      if (!g) { plate.hidden = true; shown = null; return; } // tried again on the next poll
      plate.hidden = false;
      shown = id; plays = n; status = stKey; lastIdx = idx; lastLive = live; newest = g;
      if (full) full.href = '/replay?espn=' + encodeURIComponent(id);
      if (meta) meta.textContent = g.live ? 'live · trails the feed by a play' : g.final ? 'final · scrub the timeline above' : 'from ESPN play-by-play';
    }
    g = R.game();
    if (!g || !g.src) return;
    if (live !== lastLive || (!live && idx !== lastIdx)) {
      if (live && g.live) R.goLive(); else R.seekEvent(eventFor(g, idx));
      lastIdx = idx; lastLive = live;
    }
    showLag();
  });
  function showLag() {
    if (!lag) return;
    var s = newest && newest.live ? wallLag(newest) : null;
    lag.textContent = s == null ? '' : 'newest play ' + (s < 90 ? s + ' s' : Math.round(s / 60) + ' min') + ' ago';
  }
  var playBtn = document.getElementById('rpPlay'); // replay.js handles the click first; this only re-follows live
  if (playBtn) playBtn.addEventListener('click', function () {
    var R = window.PixelReplay, g = R && R.game();
    if (lastLive && g && g.live && R.state.playing && !R.state.live) R.goLive();
  });
  setInterval(showLag, 5000); // between polls too, so the age counts up instead of freezing
})();
