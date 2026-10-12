/* arcade.js — between-games fun on the atlas: Twin Snap, Trail Blazer, Era Call.
 * Uses assets/vectors_search_lite.json + VHMtnn.topK + trails data. Streaks in localStorage.
 */
(function () {
'use strict';
var LITE_URL = 'assets/vectors_search_lite.json';
var TRAILS_INDEX = 'assets/trails_index.json', TRAILS_JSON = 'assets/trails.json';

var P = [], liteReady = false, mtnnReady = false;
var recentPool = []; // recognizable faces: current-era player-seasons
var running = false, rafId = null, pulseT = 0;
var trailsCache = null;
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function streakGet(k) { try { return +(localStorage.getItem('vh_arcade_' + k) || 0); } catch (e) { return 0; } }
function streakSet(k, v) { try { localStorage.setItem('vh_arcade_' + k, String(v)); } catch (e) {} }
function rnd(n) { return (Math.random() * n) | 0; }
function disp(n) { return String(n || '').split(' ').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function dailySeed() { var d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function shareText(t, msgEl) {
  var done = function () { if (msgEl) msgEl.innerHTML += ' <span class="copied">copied ✓</span>'; };
  if (navigator.share) { navigator.share({ text: t, url: location.origin + '/live' }).catch(function () {}); }
  else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t + ' ' + location.origin + '/live').then(done, done); }
  else done();
}
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

// ---------- shared mini map ----------
function fitCanvas(cv, h) {
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var W = cv.clientWidth || 600;
  cv.width = Math.round(W * DPR); cv.height = Math.round(h * DPR);
  cv.style.height = h + 'px';
  var ctx = cv.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { ctx: ctx, W: W, H: h };
}
var densCache = {};
function drawDensity(ctx, W, H) {
  ctx.clearRect(0, 0, W, H);
  var key = W + 'x' + H, off = densCache[key];
  if (!off) {
    var DPR = Math.min(2, window.devicePixelRatio || 1);
    off = document.createElement('canvas');
    off.width = Math.round(W * DPR); off.height = Math.round(H * DPR);
    var c = off.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = '#1b1913';
    for (var k = 0; k < P.length; k += 7) {
      var p = P[k];
      c.globalAlpha = 0.10;
      c.fillRect(10 + (W - 20) * (p.x / 0.95), 12 + (H - 24) * (1 - p.y), 2.4, 2.4);
    }
    densCache[key] = off;
  }
  ctx.drawImage(off, 0, 0, W, H);
}
function MX(p, W) { return 10 + (W - 20) * (p.x / 0.95); }
function MY(p, H) { return 12 + (H - 24) * (1 - p.y); }

// ---------- GAME 01: Twin Snap ----------
var snap = { p: null, twin: null, opts: [], lock: false };
function snapRound(daily) {
  snap.lock = false;
  var pool = recentPool.length ? recentPool : P;
  var R = daily ? mulberry32(dailySeed()) : Math.random;
  var p = pool[(R() * pool.length) | 0];
  snap.p = p; snap.daily = !!daily;
  snap.twin = null; snap.opts = [];
  if (mtnnReady) {
    try {
      var hits = window.VHMtnn.topK(p.i, 1, function (id) { return P[id] && P[id].n !== p.n; });
      if (hits.length) snap.twin = P[hits[0].id];
    } catch (e) {}
  }
  if (!snap.twin) {
    snap.retries = (snap.retries || 0) + 1;
    if (snap.retries > 25) { $('snapQ').innerHTML = 'Style model failed to load — check your connection and reopen the arcade.'; return; }
    setTimeout(function () { if (running) snapRound(); }, 600);
    return;
  }
  snap.retries = 0;
  var used = {};
  used[p.n] = 1; used[snap.twin.n] = 1;
  snap.opts = [snap.twin.n];
  var guard = 0;
  var dpool = recentPool.length ? recentPool : P;
  while (snap.opts.length < 4 && guard++ < 200) {
    var q = dpool[(R() * dpool.length) | 0].n;
    if (!used[q]) { used[q] = 1; snap.opts.push(q); }
  }
  for (var si = snap.opts.length - 1; si > 0; si--) { var sj = (R() * (si + 1)) | 0; var st2 = snap.opts[si]; snap.opts[si] = snap.opts[sj]; snap.opts[sj] = st2; }
  $('snapQ').innerHTML = (snap.daily ? '🎯 <b>Daily</b> — ' : '') + 'Whose <b>#1 style-twin</b> is the pulsing dot?';
  $('snapOpts').innerHTML = snap.opts.map(function (n) {
    return '<button class="twin" data-o="' + esc(n) + '">' + esc(n) + '</button>';
  }).join('');
  var btns = $('snapOpts').querySelectorAll('[data-o]');
  for (var i = 0; i < btns.length; i++) (function (b) {
    b.onclick = function () { snapGuess(b.getAttribute('data-o'), b); };
  })(btns[i]);
  $('snapMsg').textContent = '';
  $('snapStreak').textContent = streakGet('snap');
}
function snapGuess(name, btn) {
  if (snap.lock) return; snap.lock = true;
  var ok = name === snap.twin.n;
  var st = ok ? streakGet('snap') + 1 : 0;
  streakSet('snap', st); $('snapStreak').textContent = st;
  btn.classList.add(ok ? 'selp' : 'nope');
  if (ok) {
    $('snapMsg').innerHTML = '✓ <b>' + esc(snap.twin.n) + '</b> — ' + esc(snap.twin.s) + ' · streak ' + st +
      ' <button class="twin sharebtn" id="snapShare">Share</button>';
    var sb = $('snapShare');
    if (sb) sb.onclick = function () { shareText((snap.daily ? '🎯 I solved today\u2019s Daily Twin Snap' : '🔥 I\u2019m on a ' + st + '-game Twin Snap streak') + ' on Vector Hoops Live — whose style-twin is who?', $('snapMsg')); };
  } else {
    $('snapMsg').innerHTML = '✗ it was <b>' + esc(snap.twin.n) + '</b> (' + esc(snap.twin.s) + ')';
  }
  setTimeout(function () { if (running) snapRound(); }, 1600);
}
function snapDraw() {
  var cv = $('snapCanvas'); if (!cv || !liteReady || !snap.p) return;
  var f = fitCanvas(cv, 260), ctx = f.ctx;
  drawDensity(ctx, f.W, f.H);
  var pr = reduceMotion ? 8 : 7 + 3 * Math.sin(pulseT / 350);
  ctx.beginPath(); ctx.arc(MX(snap.p, f.W), MY(snap.p, f.H), pr, 0, 7);
  ctx.fillStyle = '#c2401f'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fffdf7'; ctx.stroke();
}

// ---------- GAME 02: Trail Blazer ----------
var trail = { name: null, pts: [], t: 0, opts: [], lock: false };
function trailRound() {
  trail.lock = false; trail.t = 0; trail.pts = []; trail.opts = [];
  ensureTrails(function () {
    var names = Object.keys(trailsCache.idx);
    var nm = names[rnd(names.length)];
    trail.name = nm;
    var key = trailsCache.idx[nm];
    trail.pts = trailsCache.trails[key] || [];
    if (trail.pts.length < 3) { setTimeout(trailRound, 300); return; }
    var used = {}; used[nm] = 1;
    trail.opts = [nm];
    var guard = 0;
    while (trail.opts.length < 4 && guard++ < 300) {
      var q = names[rnd(names.length)];
      if (!used[q]) { used[q] = 1; trail.opts.push(q); }
    }
    shuffle(trail.opts);
    $('trailOpts').innerHTML = trail.opts.map(function (n) {
      return '<button class="twin" data-o="' + esc(n) + '">' + esc(disp(n)) + '</button>';
    }).join('');
    var btns = $('trailOpts').querySelectorAll('[data-o]');
    for (var i = 0; i < btns.length; i++) (function (b) {
      b.onclick = function () { trailGuess(b.getAttribute('data-o'), b); };
    })(btns[i]);
    $('trailMsg').textContent = '';
    $('trailStreak').textContent = streakGet('trail');
  });
}
function trailGuess(name, btn) {
  if (trail.lock) return; trail.lock = true;
  trail.t = 1; // reveal full trail
  var ok = name === trail.name;
  var st = ok ? streakGet('trail') + 1 : 0;
  streakSet('trail', st); $('trailStreak').textContent = st;
  btn.classList.add(ok ? 'selp' : 'nope');
  if (ok) {
    $('trailMsg').innerHTML = '✓ <b>' + esc(disp(trail.name)) + '</b> · streak ' + st + ' <button class="twin sharebtn" id="trailShare">Share</button>';
    var tb = $('trailShare');
    if (tb) tb.onclick = function () { shareText('🔥 I\u2019m on a ' + st + '-game Trail Blazer streak on Vector Hoops Live — guess the player from their career trail', $('trailMsg')); };
  } else {
    $('trailMsg').innerHTML = '✗ it was <b>' + esc(disp(trail.name)) + '</b>';
  }
  setTimeout(function () { if (running) trailRound(); }, 1800);
}
function trailDraw(dt) {
  var cv = $('trailCanvas'); if (!cv || !liteReady || !trail.pts.length) return;
  var f = fitCanvas(cv, 260), ctx = f.ctx;
  drawDensity(ctx, f.W, f.H);
  if (!trail.lock && !reduceMotion) trail.t = Math.min(1, trail.t + dt / 2400);
  else if (reduceMotion) trail.t = 1;
  var upto = Math.max(2, Math.floor(trail.pts.length * trail.t));
  ctx.beginPath();
  ctx.moveTo(MX(trail.pts[0], f.W), MY(trail.pts[0], f.H));
  for (var k = 1; k < upto; k++) ctx.lineTo(MX(trail.pts[k], f.W), MY(trail.pts[k], f.H));
  ctx.strokeStyle = '#c2401f'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  for (k = 0; k < upto; k += Math.max(1, (trail.pts.length / 5) | 0)) {
    ctx.beginPath(); ctx.arc(MX(trail.pts[k], f.W), MY(trail.pts[k], f.H), 3, 0, 7);
    ctx.fillStyle = '#c2401f'; ctx.fill();
  }
}
function ensureTrails(cb) {
  if (trailsCache) { cb(); return; }
  Promise.all([
    fetch('assets/trails_index.json').then(function (r) { return r.json(); }),
    fetch('assets/trails.json').then(function (r) { return r.json(); })
  ]).then(function (res) { trailsCache = { idx: res[0], trails: res[1] }; cb(); })
    .catch(function () { $('trailMsg').textContent = 'trails failed to load'; });
}

// ---------- GAME 03: Era Call ----------
var era = { a: null, b: null, lock: false };
function eraRound() {
  era.lock = false;
  var epool = recentPool.length ? recentPool : P;
  var a = epool[rnd(epool.length)], b = epool[rnd(epool.length)], guard = 0;
  while (a.s === b.s && guard++ < 50) { b = epool[rnd(epool.length)]; }
  era.a = a; era.b = b;
  $('eraOpts').innerHTML =
    '<button class="twin" data-o="a"><b>A</b> · ' + esc(a.n.split(' ').slice(-1)[0]) + '</button>' +
    '<button class="twin" data-o="b"><b>B</b> · ' + esc(b.n.split(' ').slice(-1)[0]) + '</button>';
  var btns = $('eraOpts').querySelectorAll('[data-o]');
  for (var i = 0; i < btns.length; i++) (function (bt) {
    bt.onclick = function () { eraGuess(bt.getAttribute('data-o'), bt); };
  })(btns[i]);
  $('eraMsg').textContent = '';
  $('eraStreak').textContent = streakGet('era');
}
function eraGuess(which, btn) {
  if (era.lock) return; era.lock = true;
  var aFirst = era.a.s < era.b.s;
  var ok = (which === 'a') === aFirst;
  var st = ok ? streakGet('era') + 1 : 0;
  streakSet('era', st); $('eraStreak').textContent = st;
  btn.classList.add(ok ? 'selp' : 'nope');
  if (ok) {
    $('eraMsg').innerHTML = '✓ <b>' + esc(era.a.n) + '</b> ' + esc(era.a.s) + ' vs <b>' + esc(era.b.n) + '</b> ' + esc(era.b.s) + ' · streak ' + st + ' <button class="twin sharebtn" id="eraShare">Share</button>';
    var eb = $('eraShare');
    if (eb) eb.onclick = function () { shareText('🔥 I\u2019m on a ' + st + '-game Era Call streak on Vector Hoops Live', $('eraMsg')); };
  } else {
    $('eraMsg').innerHTML = '✗ <b>' + esc(era.a.n) + '</b> ' + esc(era.a.s) + ' vs <b>' + esc(era.b.n) + '</b> ' + esc(era.b.s);
  }
  setTimeout(function () { if (running) eraRound(); }, 2000);
}
function eraDraw() {
  var cv = $('eraCanvas'); if (!cv || !liteReady || !era.a) return;
  var f = fitCanvas(cv, 260), ctx = f.ctx;
  drawDensity(ctx, f.W, f.H);
  [['a', '#c2401f'], ['b', '#1b1913']].forEach(function (pair) {
    var p = era[pair[0]];
    var pr = reduceMotion ? 8 : 7 + 3 * Math.sin(pulseT / 350 + (pair[0] === 'b' ? 2 : 0));
    ctx.beginPath(); ctx.arc(MX(p, f.W), MY(p, f.H), pr, 0, 7);
    ctx.fillStyle = pair[1]; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fffdf7'; ctx.stroke();
    ctx.font = '700 11px ui-monospace,monospace'; ctx.fillStyle = '#fffdf7'; ctx.textAlign = 'center';
    ctx.fillText(pair[0].toUpperCase(), MX(p, f.W), MY(p, f.H) + 4);
  });
  ctx.textAlign = 'left';
}

// ---------- main loop ----------
var lastT = 0;
function loop(t) {
  if (!running) return;
  var dt = Math.min(80, t - (lastT || t)); lastT = t;
  pulseT = t;
  try {
    snapDraw(); trailDraw(dt); eraDraw();
  } catch (e) {}
  rafId = requestAnimationFrame(loop);
}

function bootData() {
  fetch(LITE_URL).then(function (r) { return r.json(); }).then(function (d) {
    P = d.players || []; liteReady = true;
    recentPool = P.filter(function (p) { return p.s >= '2024-25'; });
    if (!recentPool.length) recentPool = P;
    snapRound(); trailRound(); eraRound();
  }).catch(function () {});
  function mboot() {
    if (window.VHMtnn && window.VHMtnn.isReady()) { mtnnReady = true; }
    else if (window.VHMtnn) { window.VHMtnn.load(function () { mtnnReady = true; }); }
    else setTimeout(mboot, 500);
  }
  mboot();
  document.addEventListener('vh:mtnn-loaded', function () { mtnnReady = true; });
}

window.Arcade = {
  start: function () {
    if (running) return;
    running = true; lastT = 0;
    if (!liteReady) bootData();
    else { snapRound(); trailRound(); eraRound(); }
    var db = document.getElementById('snapDaily');
    if (db && !db._wired) { db._wired = true; db.onclick = function () { snapRound(true); }; }
    rafId = requestAnimationFrame(loop);
  },
  stop: function () { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
};
})();
