/* live-atlas.js — Plate 4 instrument: Twins / Matchup / Trail on the real 64-d atlas.
 * Data: assets/vectors_search_lite.json (12,966 positions) + VHMtnn.topK (live 64-d twins).
 * API: window.LiveAtlas = { onGame(d, g), setMode(m) }.
 */
(function () {
'use strict';
var LITE_URL = 'assets/vectors_search_lite.json';
var ROSTER_URL = 'assets/current_rosters_2026_27.json';
var TRAILS_INDEX = 'assets/trails_index.json';
var TRAILS_JSON = 'assets/trails.json';

var P = [], byName = {}, byNorm = {};
function normKey(n) { return String(n || '').toLowerCase().replace(/[^a-z]/g, ''); }
function siteNorm(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }
var GX = 56, GY = 36, grid = null, gmax = 1;
var canvas = null, ctx = null, W = 600, H = 330, DPR = 1;
var mode = 'twins';
var livePlayers = [];   // {name, pts, mp, idx, abbr, color}
var gameInfo = null;    // {aAbbr, hAbbr, aColor, hColor}
var fireName = null;     // NBA Jam: player currently on fire
var _lastSig = '';
var selIdx = -1, twins = [];
var rosters = null, matchup = { a: [], h: [] }, isoTeam = null;
var trailPts = [], trailT = 0, trailName = null, trailTimer = null;
var trailsCache = null;
var mtnnReady = false, liteReady = false;
var hintEl = null, listEl = null, modeLbl = null;
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function X(x) { var p = 14; return p + (W - 2 * p) * (x / 0.95); }
function Y(y) { var p = 16; return H - p - (H - 2 * p) * y; }

function fit() {
  if (!canvas) return;
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = canvas.clientWidth || 600; H = 330;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function buildGrid() {
  grid = new Float32Array(GX * GY); gmax = 1;
  for (var k = 0; k < P.length; k++) {
    var gx = Math.min(GX - 1, (P[k].x / 0.95 * GX) | 0);
    var gy = Math.min(GY - 1, ((1 - P[k].y) * GY) | 0);
    var v = ++grid[gy * GX + gx];
    if (v > gmax) gmax = v;
  }
}

var gridCache = null, gridCacheKey = '';
function drawGridLayer() {
  // the 2,016-cell density field never changes — render once per size, blit after
  var key = W + 'x' + H;
  if (gridCache && gridCacheKey === key) return gridCache;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var off = document.createElement('canvas');
  off.width = Math.round(W * DPR); off.height = Math.round(H * DPR);
  var c = off.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  var cw = (W - 28) / GX, ch = (H - 32) / GY;
  c.fillStyle = '#1b1913';
  for (var gy = 0; gy < GY; gy++) for (var gx = 0; gx < GX; gx++) {
    var n = grid[gy * GX + gx];
    if (!n) continue;
    c.globalAlpha = Math.min(0.30, n / gmax * 0.55);
    c.fillRect(14 + gx * cw, 16 + gy * ch, cw + 0.6, ch + 0.6);
  }
  c.globalAlpha = 1;
  gridCache = off; gridCacheKey = key;
  return off;
}
function draw() {
  if (!ctx || !liteReady) return;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(drawGridLayer(), 0, 0, W, H);
  ctx.font = '700 8px ui-monospace,monospace'; ctx.fillStyle = '#8a8574'; ctx.textAlign = 'left';
  ctx.fillText('12,966 PLAYER-SEASONS · 1996–2026', 14, 11);
  if (mode === 'twins') drawTwins();
  else if (mode === 'matchup') drawMatchup();
  else drawTrail();
}

function dot(x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, 7);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = 1.4; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function label(x, y, text, color, bold) {
  ctx.font = (bold ? '700 ' : '') + '9px ui-monospace,monospace';
  ctx.fillStyle = color || '#1b1913'; ctx.textAlign = 'left';
  ctx.fillText(text, X(x) + 7, Y(y) + 3);
}

function drawTwins() {
  var i, p;
  // twin markers (under players)
  for (i = 0; i < twins.length; i++) {
    var t = P[twins[i].id];
    if (!t) continue;
    dot(t.x, t.y, 4, null, '#1b1913');
    label(t.x, t.y, t.n, '#5b5545', false);
  }
  // live players
  for (i = 0; i < livePlayers.length; i++) {
    p = livePlayers[i]; if (p.idx < 0) continue;
    var pl = P[p.idx], isSel = p.idx === selIdx;
    dot(pl.x, pl.y, isSel ? 7 : 5, isSel ? '#c2401f' : p.color || '#1b1913', '#fffdf7');
    if (isSel && !reduceMotion) { // pulse ring
      var pr = 9 + 3 * Math.sin(Date.now() / 300);
      ctx.beginPath(); ctx.arc(X(pl.x), Y(pl.y), pr, 0, 7);
      ctx.strokeStyle = 'rgba(194,64,31,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    label(pl.x, pl.y, p.name.split(' ').slice(-1)[0], '#1b1913', true);
  }
  if (!livePlayers.length) {
    ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = '#8a8574'; ctx.textAlign = 'center';
    ctx.fillText('no mapped players on court yet', W / 2, H / 2);
  }
}

function drawMatchup() {
  var i, t;
  var teams = isoTeam ? [isoTeam] : ['a', 'h'];
  teams.forEach(function (k) {
    var col = k === 'a' ? gameInfo.aColor : gameInfo.hColor;
    var arr = matchup[k];
    for (var i = 0; i < arr.length; i++) {
      t = P[arr[i]]; if (!t) continue;
      dot(t.x, t.y, 4.5, col, '#fffdf7');
    }
  });
  // team means → style note
  if (matchup.a.length && matchup.h.length && modeLbl) {
    var ma = meanX(matchup.a), mh = meanX(matchup.h);
    var note = Math.abs(ma - mh) < 0.03 ? 'mirror images stylistically'
      : (ma < mh ? gameInfo.aAbbr + ' lives closer to the paint' : gameInfo.hAbbr + ' lives closer to the paint');
    modeLbl.textContent = gameInfo.aAbbr + ' × ' + gameInfo.hAbbr + ' — ' + note;
  }
}
function meanX(arr) {
  var s = 0, n = 0;
  for (var i = 0; i < arr.length; i++) { if (P[arr[i]]) { s += P[arr[i]].x; n++; } }
  return n ? s / n : 0.5;
}

function drawTrail() {
  var i, p;
  for (i = 0; i < livePlayers.length; i++) {
    p = livePlayers[i]; if (p.idx < 0) continue;
    var pl = P[p.idx];
    dot(pl.x, pl.y, 5, p.name === trailName ? '#c2401f' : '#1b1913', '#fffdf7');
    label(pl.x, pl.y, p.name.split(' ').slice(-1)[0], '#1b1913', true);
  }
  if (trailPts.length > 1) {
    var upto = Math.max(2, Math.floor(trailPts.length * trailT));
    ctx.beginPath();
    ctx.moveTo(X(trailPts[0].x), Y(trailPts[0].y));
    for (var k = 1; k < upto; k++) ctx.lineTo(X(trailPts[k].x), Y(trailPts[k].y));
    ctx.strokeStyle = '#c2401f'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    for (k = 0; k < upto; k += Math.max(1, (trailPts.length / 6) | 0)) {
      dot(trailPts[k].x, trailPts[k].y, 3, '#c2401f', '#fffdf7');
      ctx.font = '8px ui-monospace,monospace'; ctx.fillStyle = '#5b5545'; ctx.textAlign = 'left';
      ctx.fillText(trailPts[k].s, X(trailPts[k].x) + 6, Y(trailPts[k].y) - 4);
    }
  }
}

// ---------- selection ----------
function nearest(px, py, list, key) {
  var best = -1, bd = 1e9;
  for (var i = 0; i < list.length; i++) {
    var t = key ? P[list[i][key]] : P[list[i]];
    if (!t && key) t = list[i];
    if (!t || t.x === undefined) continue;
    var dx = X(t.x) - px, dy = Y(t.y) - py, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return bd < 24 * 24 ? best : -1;
}

function selectTwinPlayer(i) {
  var p = livePlayers[i]; if (!p || p.idx < 0) return;
  selIdx = p.idx;
  computeTwins();
  draw();
}
var mtnnLoading = false;
// LAZY: the 3.3MB model weights only download when twins are actually requested
function ensureModel(cb) {
  if (mtnnReady) { if (cb) cb(); return; }
  if (window.VHMtnn && window.VHMtnn.isReady()) { mtnnReady = true; if (cb) cb(); draw(); return; }
  if (!window.VHMtnn) { setTimeout(function () { ensureModel(cb); }, 400); return; }
  if (mtnnLoading) return;
  mtnnLoading = true;
  if (typeof hintEl !== 'undefined' && hintEl) { hintEl.textContent = 'finding style-twins\u2026'; hintEl.style.display = 'block'; }
  window.VHMtnn.load(function () {
    mtnnLoading = false;
    mtnnReady = window.VHMtnn.isReady();
    if (cb) cb();
    draw();
  });
}
function computeTwins() {
  twins = [];
  if (selIdx < 0) { renderTwinList(); return; }
  if (!mtnnReady) { ensureModel(function () { computeTwins(); }); renderTwinList(); return; }
  var name = P[selIdx].n;
  try {
    twins = window.VHMtnn.topK(selIdx, 6, function (id) { return P[id] && P[id].n !== name; });
  } catch (e) { twins = []; }
  renderTwinList();
}
function renderTwinList() {
  if (!listEl) return;
  if (!twins.length || selIdx < 0) {
    listEl.innerHTML = livePlayers.map(function (p, i) {
      return '<button class="twin' + (p.idx === selIdx ? ' selp' : '') + '" data-lp="' + i + '">' + esc(p.name.split(' ').slice(-1)[0]) + (fireName && p.name === fireName ? ' \U0001F525' : '') + '</button>';
    }).join('');
  } else {
    var sel = P[selIdx];
    listEl.innerHTML = '<span class="tlabel">STYLE-TWINS OF ' + esc(sel.n.split(' ').slice(-1)[0]).toUpperCase() + '</span>' +
      twins.map(function (t) {
        var q = P[t.id];
        return '<span class="twin">' + esc(q.n) + ' <span style="opacity:.55">' + esc(q.s.slice(2)) + '</span></span>';
      }).join('') +
      '<span class="tlabel" style="margin-left:10px">ON COURT</span>' +
      livePlayers.map(function (p, i) {
        return '<button class="twin' + (p.idx === selIdx ? ' selp' : '') + '" data-lp="' + i + '">' + esc(p.name.split(' ').slice(-1)[0]) + (fireName && p.name === fireName ? ' \U0001F525' : '') + '</button>';
      }).join('') +
      '<button class="twin sharebtn" id="twinShare" style="margin-left:10px">Share</button>';
    var shb = document.getElementById('twinShare');
    if (shb) shb.onclick = function () {
      var q0 = twins.length ? P[twins[0].id] : null;
      var txt = P[selIdx].n + '\u2019s closest style-twin is ' + (q0 ? q0.n + ' (' + q0.s + ')' : 'a mystery') + ' — find yours on Vector Hoops Live';
      if (navigator.share) { navigator.share({ text: txt, url: location.origin + '/live' }).catch(function () {}); }
      else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt + ' ' + location.origin + '/live'); }
    };
  }
  var btns = listEl.querySelectorAll('[data-lp]');
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.onclick = function () { selectTwinPlayer(+b.getAttribute('data-lp')); };
    })(btns[i]);
  }
  if (hintEl && mtnnReady) hintEl.style.display = 'none';
}

// ---------- matchup ----------
function loadMatchup() {
  if (rosters || !gameInfo) return;
  fetch(ROSTER_URL).then(function (r) { return r.json(); }).then(function (d) {
    rosters = d.teams || {};
    ['a', 'h'].forEach(function (k) {
      var abbr = k === 'a' ? gameInfo.aAbbr : gameInfo.hAbbr;
      var ros = rosters[abbr] || [];
      matchup[k] = ros.map(function (r) { return latestIdx(r.name); }).filter(function (x) { return x >= 0; });
    });
    if (mode === 'matchup') draw();
  }).catch(function () {});
}
function latestIdx(name) {
  var arr = byName[name];
  if (arr && arr.length) return arr[arr.length - 1];
  var ni = byNorm[normKey(name)];
  return ni !== undefined ? ni : -1;
}

// ---------- trail ----------
function loadTrailFor(name) {
  trailName = name; trailPts = []; trailT = 0;
  if (modeLbl) modeLbl.textContent = 'drawing ' + name + '’s career…';
  function got(idxData, trails) {
    var key = idxData[siteNorm(name)];
    if (!key || !trails[key]) { if (modeLbl) modeLbl.textContent = 'no trail for ' + name; return; }
    trailPts = trails[key]; // [{x,y,s}]
    animateTrail();
  }
  if (trailsCache) { got(trailsCache.idx, trailsCache.trails); return; }
  Promise.all([
    fetch(TRAILS_INDEX).then(function (r) { return r.json(); }),
    fetch(TRAILS_JSON).then(function (r) { return r.json(); })
  ]).then(function (res) {
    trailsCache = { idx: res[0], trails: res[1] };
    got(res[0], res[1]);
  }).catch(function () { if (modeLbl) modeLbl.textContent = 'trail failed to load'; });
}
function animateTrail() {
  if (trailTimer) clearInterval(trailTimer);
  trailT = 0;
  if (reduceMotion) { trailT = 1; draw(); return; }
  trailTimer = setInterval(function () {
    trailT += 0.06;
    if (trailT >= 1) { trailT = 1; clearInterval(trailTimer); trailTimer = null; }
    draw();
  }, 50);
  if (modeLbl && trailPts.length)
    modeLbl.textContent = trailName + ' · ' + trailPts[0].s + ' → ' + trailPts[trailPts.length - 1].s;
}

// ---------- public ----------
function setMode(m) {
  mode = m;
  var btns = document.querySelectorAll('#atlasModes button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('picked', btns[i].getAttribute('data-m') === m);
  if (modeLbl) modeLbl.textContent = m === 'twins' ? 'tap a player for their style-twins'
    : m === 'matchup' ? 'where each roster lives stylistically' : 'tap a player to draw their career';
  if (listEl) listEl.innerHTML = '';
  if (mode === 'matchup') loadMatchup();
  draw();
}

function onGame(d, g, fire) {
  fireName = fire || null;
  gameInfo = { aAbbr: g.a.abbr, hAbbr: g.h.abbr, aColor: g.a.color || '#5b5545', hColor: g.h.color || '#1b1913' };
  livePlayers = [];
  var bp = d.boxscore && d.boxscore.players;
  if (bp) bp.forEach(function (side) {
    var abbr = side.team.abbreviation;
    var col = abbr === g.h.abbr ? gameInfo.hColor : gameInfo.aColor;
    (side.statistics[0].athletes || []).forEach(function (a) {
      var s = a.stats; if (!s || s.length < 14) return;
      var mstr = s[0], mp = mstr.indexOf(':') >= 0 ? (+mstr.split(':')[0]) + (+mstr.split(':')[1]) / 60 : (+mstr || 0);
      if (!(mp >= 10)) return;
      livePlayers.push({ name: a.athlete.displayName, pts: +s[1] || 0, mp: mp, idx: latestIdx(a.athlete.displayName), abbr: abbr, color: col });
    });
  });
  livePlayers.sort(function (a, b) { return b.pts - a.pts; });
  livePlayers = livePlayers.slice(0, 4);
  var sig = livePlayers.map(function (p) { return p.name; }).join('|') + '#' + (fireName || '');
  if (sig === _lastSig && liteReady) return; // nothing changed — skip the topK scan + redraw
  _lastSig = sig;
  matchup = { a: [], h: [] }; rosters = null; isoTeam = null;
  trailPts = []; trailName = null; selIdx = -1; twins = [];
  if (mode === 'matchup') loadMatchup();
  else if (liteReady) {
    if (mode === 'twins' && livePlayers.length) { selIdx = livePlayers[0].idx; computeTwins(); }
    draw();
  }
  if (hintEl) hintEl.style.display = mtnnReady ? 'none' : 'block';
}

function init() {
  canvas = $('liveAtlas'); if (!canvas) return;
  ctx = canvas.getContext('2d');
  hintEl = $('atlasHint'); listEl = $('twinList'); modeLbl = $('atlasModeLbl');
  fit();
  var rT = null;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { fit(); draw(); }, 200); });
  fetch(LITE_URL).then(function (r) { return r.json(); }).then(function (d) {
    P = d.players || [];
    for (var i = 0; i < P.length; i++) {
      var n = P[i].n;
      (byName[n] = byName[n] || []).push(P[i].i);
      byNorm[normKey(n)] = P[i].i; // last wins = latest season
    }
    // sort each name's seasons chronologically (lite order is by index; ensure)
    Object.keys(byName).forEach(function (n) { byName[n].sort(function (a, b) { return a - b; }); });
    buildGrid(); liteReady = true;
    if (livePlayers.length) {
      livePlayers.forEach(function (pl) { pl.idx = latestIdx(pl.name); });
      if (mode === 'twins' && selIdx < 0 && livePlayers[0].idx >= 0) { selIdx = livePlayers[0].idx; computeTwins(); }
    }
    draw();
  }).catch(function () { if (hintEl) hintEl.textContent = 'map failed to load'; });

  document.addEventListener('vh:mtnn-loaded', function () { mtnnReady = true; mtnnLoading = false; computeTwins(); draw(); });

  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    if (mode === 'twins') {
      var bi = nearest(px, py, livePlayers.map(function (p) { return p.idx; }));
      if (bi >= 0) selectTwinPlayer(bi);
    } else if (mode === 'trail') {
      var ti = nearest(px, py, livePlayers.map(function (p) { return p.idx; }));
      if (ti >= 0) { loadTrailFor(livePlayers[ti].name); draw(); }
    }
  });
  var btns = document.querySelectorAll('#atlasModes button');
  for (var i = 0; i < btns.length; i++) {
    (function (b) { b.onclick = function () { setMode(b.getAttribute('data-m')); }; })(btns[i]);
  }
}

window.LiveAtlas = { onGame: onGame, setMode: setMode };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
