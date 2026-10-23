/* Pixel Replay: an animated, rotatable pixel court rebuilt from the NBA's play-by-play.
 *
 * Real (from assets/replays/<gameId>.json, built by pipeline/build_replays.py from cdn.nba.com):
 *   every event, clock, score, shooter, rebounder, stealer, the shot spot (feet), lineups.
 * Staged here (no public feed has it): where the other nine players stand. Offense spreads
 *   around the arc, defenders sit between their man and the rim, rebounds collapse on the rim,
 *   timeouts huddle at the bench. Rung (a) of the Pixel Replay research brief.
 * No dependencies; one 400x225 canvas upscaled with image-rendering: pixelated.
 */
(function () {
  'use strict';
  var DATA = '/assets/' + 'replays/'; // built path: the files change on every data refresh, so no ?v= stamp
  var W = 400, H = 225, L = 94, CW = 50, HOOP = 5.25;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };
  function on(id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); }
  function attr(id, k, v) { var el = $(id); if (el) el.setAttribute(k, v); }
  var cv = $('rpCanvas'); if (!cv) return;
  var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  var EMBED = cv.dataset && cv.dataset.mode === 'embed';

  /* ---------- 3x5 pixel font ---------- */
  var GL = {
    '0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111','4':'101101111001001',
    '5':'111100111001111','6':'111100111101111','7':'111001001010010','8':'111101111101111','9':'111101111001111',
    A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',
    F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',
    K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'010101101101010',
    P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',
    U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',
    Z:'111001010100111',':':'000010000010000','-':'000000111000000','!':'010010010000010','.':'000000000000010',
    "'":'010010000000000','/':'001001010100100','+':'000010111010000',' ':'000000000000000'
  };
  function textW(s, k) { return s.length * 4 * k - k; }
  function drawText(s, x, y, k, col, outline) {
    s = String(s).toUpperCase();
    if (outline) { var o = [[-1,0],[1,0],[0,-1],[0,1],[1,1]]; for (var j = 0; j < o.length; j++) glyphs(s, x + o[j][0] * k, y + o[j][1] * k, k, outline); }
    glyphs(s, x, y, k, col);
  }
  function glyphs(s, x, y, k, col) {
    ctx.fillStyle = col;
    for (var i = 0; i < s.length; i++) {
      var g = GL[s[i]] || GL[' '];
      for (var b = 0; b < 15; b++) if (g[b] === '1') ctx.fillRect(Math.round(x + (i * 4 + b % 3) * k), Math.round(y + Math.floor(b / 3) * k), k, k);
    }
  }

  /* ---------- colour helpers ---------- */
  function hex(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function rgb(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function mix(a, b, t) { a = hex(a); b = hex(b); return rgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  function lum(c) { var a = hex(c); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }

  /* ---------- camera ---------- */
  var PRESETS = {
    broadcast: { yaw: -Math.PI / 2, pitch: 0.5, dist: 98, fov: 0.78, tx: 47, ty: 25 },
    baseline:  { yaw: Math.PI, pitch: 0.30, dist: 44, fov: 0.95, tx: 70, ty: 25 },
    overhead:  { yaw: -Math.PI / 2, pitch: 1.45, dist: 92, fov: 0.8, tx: 47, ty: 25 },
    iso:       { yaw: -Math.PI * 0.78, pitch: 0.68, dist: 96, fov: 0.8, tx: 47, ty: 25 },
    follow:    { yaw: -Math.PI / 2, pitch: 0.42, dist: 38, fov: 0.9, tx: 47, ty: 25, follow: true }
  };
  var cam = { yaw: PRESETS.broadcast.yaw, pitch: 0.5, dist: 98, fov: 0.78, tx: 47, ty: 25, tz: 3, follow: false };
  var camGoal = null, B = {};
  function setupCam() {
    var cp = Math.cos(cam.pitch), cx = cam.tx + cam.dist * cp * Math.cos(cam.yaw), cy = cam.ty + cam.dist * cp * Math.sin(cam.yaw),
        cz = cam.tz + cam.dist * Math.sin(cam.pitch);
    var fx = cam.tx - cx, fy = cam.ty - cy, fz = cam.tz - cz, fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    var rx = fy, ry = -fx, rz = 0, rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
    var ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    B = { cx: cx, cy: cy, cz: cz, fx: fx, fy: fy, fz: fz, rx: rx, ry: ry, rz: rz, ux: ux, uy: uy, uz: uz, f: (H / 2) / Math.tan(cam.fov / 2) };
  }
  function P(x, y, z) {
    var dx = x - B.cx, dy = y - B.cy, dz = (z || 0) - B.cz;
    var zc = dx * B.fx + dy * B.fy + dz * B.fz; if (zc < 0.6) return null;
    var xc = dx * B.rx + dy * B.ry + dz * B.rz, yc = dx * B.ux + dy * B.uy + dz * B.uz;
    return { x: W / 2 + B.f * xc / zc, y: H / 2 - B.f * yc / zc, z: zc };
  }

  /* ---------- drawing primitives ---------- */
  function line2(a, b, col) {
    var x0 = Math.round(a.x), y0 = Math.round(a.y), x1 = Math.round(b.x), y1 = Math.round(b.y);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
    ctx.fillStyle = col;
    while (n++ < 900) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  function seg3(x0, y0, z0, x1, y1, z1, col, step) {
    var n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / (step || 3))), prev = null;
    for (var i = 0; i <= n; i++) { var t = i / n, p = P(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t); if (p && prev) line2(prev, p, col); prev = p; }
  }
  function arc3(cx, cy, z, r, a0, a1, col) {
    var n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 1.5)), prev = null;
    for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n, p = P(cx + r * Math.cos(a), cy + r * Math.sin(a), z); if (p && prev) line2(prev, p, col); prev = p; }
  }
  function quad(x0, y0, x1, y1, col, nx, ny, z) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1;
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
      var ax = x0 + (x1 - x0) * i / nx, bx = x0 + (x1 - x0) * (i + 1) / nx, ay = y0 + (y1 - y0) * j / ny, by = y0 + (y1 - y0) * (j + 1) / ny;
      var p1 = P(ax, ay, z), p2 = P(bx, ay, z), p3 = P(bx, by, z), p4 = P(ax, by, z);
      if (!p1 || !p2 || !p3 || !p4) continue;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  function disc(cx, cy, r, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; var pts = [];
    for (var i = 0; i < 20; i++) { var a = i / 20 * Math.PI * 2, p = P(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.02); if (!p) return; pts.push(p); }
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  /* ---------- game state ---------- */
  var G = null, EV = [], RT = [], FR = [], T_END = 1, cur = { t: 0, playing: false, speed: 2, dir: 1, loop: null, idx: -1 };
  var TY = {}, crowd = [], fx = [], shake = 0, flash = 0, lastFxIdx = -1, condensed = true;
  var COL = { wood: '#D7A56B', wood2: '#CC9860', line: '#F7F2E8', skin: '#C98B5E', hair: '#2B1D14', ball: '#E8742A', shadow: 'rgba(0,0,0,.28)' };

  function periodLen(p) { return p <= 4 ? 720 : 300; }
  function elapsed(p, c) { var s = 0; for (var q = 1; q < p; q++) s += periodLen(q); return s + periodLen(p) - c; }
  function clockStr(p, c) { var m = Math.floor(c / 60), s = Math.floor(c % 60); return (p <= 4 ? 'Q' + p : 'OT' + (p - 4)) + ' ' + m + ':' + (s < 10 ? '0' : '') + s; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function lastName(id) { var p = G.players[id]; if (!p) return ''; var n = p.n.split(' ').slice(-1)[0]; return n.toUpperCase().replace(/[^A-Z'.-]/g, ''); }

  function buildTimeline() {
    RT = []; var t = 0;
    for (var i = 0; i < EV.length; i++) {
      if (i > 0) {
        var a = EV[i - 1], b = EV[i], gap = elapsed(b[0], b[1]) - elapsed(a[0], a[1]);
        if (condensed) gap = Math.min(gap, 4.5);
        var ty = G.types[a[2]], min = (ty === '2pt' || ty === '3pt') ? 1.6 : ty === 'freethrow' ? 1.3 : 0.7;
        if (b[0] !== a[0]) gap = Math.max(gap, 2.5);
        t += Math.max(gap, min);
      }
      RT.push(t);
    }
    T_END = t + 3;
  }

  /* attack direction per period and team side: +1 attacks the right rim (x=88.75), -1 the left */
  var DIR = {};
  function buildDirs() {
    var votes = {};
    EV.forEach(function (e) { if (e[6] != null && e[4] >= 0) { var k = e[0] + ':' + e[4]; votes[k] = (votes[k] || 0) + (e[6] > L / 2 ? 1 : -1); } });
    for (var p = 1; p <= G.periods; p++) {
      for (var s = 0; s < 2; s++) {
        var v = votes[p + ':' + s], o = votes[p + ':' + (1 - s)];
        var d = v ? Math.sign(v) : o ? -Math.sign(o) : null;
        if (d == null) d = DIR[(p - 1) + ':' + s] != null ? (p === 3 ? -DIR[(p - 1) + ':' + s] : DIR[(p - 1) + ':' + s]) : (s === 0 ? 1 : -1);
        DIR[p + ':' + s] = d;
      }
    }
  }
  function hoopX(d) { return d > 0 ? L - HOOP : HOOP; }

  var OFF = [[24, 0], [19, -15], [19, 15], [1.5, -21.5], [2.5, 8]];
  var FT_OFF = [[6, -9], [6, 9], [24, -12], [24, 12]], FT_DEF = [[2.5, -9], [2.5, 9], [9, -9], [9, 9], [20, 0]];

  function lineupAt(i) { var L0 = G.lineups[0]; for (var k = 0; k < G.lineups.length && G.lineups[k][0] <= i; k++) L0 = G.lineups[k]; return [L0[1], L0[2]]; }
  function bench(s) { return [L / 2 + (s === 0 ? -9 : 9), -3.5]; }
  function at(d, dx, dy) { return [hoopX(d) - d * dx, CW / 2 + dy]; }
  function clampCourt(p) { return [Math.max(1, Math.min(L - 1, p[0])), Math.max(1, Math.min(CW - 1, p[1]))]; }

  /* Rung (b): where the coordinate model (assets/replay-model.js) places the ten players for
     this event, or null. It needs the same facts the formations use: event, acting player, the
     real shot spot, who has the ball and which rim they attack, clock, score, lineup. */
  var lastShotXY = null;
  /* Rung (b) placement; conventions, cache and limits: docs/REPLAY_COORDINATE_MODEL.md */
  var MC = {}, mcN = 0;
  function modelPlace(e, ty, pid, ln) {
    var RM = window.ReplayModel; if (!RM || !RM.ready) return null;
    if (ty === 'jumpball') return null; // the one event where the formation scored closer to the tracking
    if (!pid || (ln[0].indexOf(pid) < 0 && ln[1].indexOf(pid) < 0)) return null;
    var team = e[4], off = e[12] >= 0 ? e[12] : team;
    if (e[12] < 0 && team >= 0 && (ty === 'foul' || ty === 'block')) off = 1 - team;
    if (off !== 0 && off !== 1) return null;
    var right = DIR[e[0] + ':' + off] > 0;
    if ((ty === '2pt' || ty === '3pt') && e[13] >= 0 && e[6] != null) right = !!e[13];
    var d = right ? 1 : -1, anchor = null;
    if ((ty === '2pt' || ty === '3pt') && e[6] != null) anchor = [e[6], e[7]];
    else if (ty === 'freethrow') anchor = at(d, 13.75, 0);
    var lastShot = (ty === 'rebound' || ty === 'block') ? lastShotXY : null;
    var key = [ty, e[0], e[1], e[8], e[9], pid, off, right, ln[off].join(), ln[1 - off].join(), anchor, lastShot].join('|');
    if (MC[key]) { stats.model.events++; return copyScene(MC[key]); }
    var R = window.ReplayRoles, roles = R && R.forGame ? R.forGame(G) : null;
    try {
      var out = RM.place({ type: ty, period: e[0], clock: e[1], margin: off === 0 ? e[8] - e[9] : e[9] - e[8], right: right, offense: ln[off], defense: ln[1 - off],
        actor: pid, anchor: anchor, lastShot: lastShot, roles: roles });
      if (!out) return null;
      for (var k in out) out[k] = clampCourt(out[k]);
      if (anchor && out[pid]) out[pid] = [anchor[0], anchor[1]]; // the real spot stays exactly where the feed put it (corner threes sit inside the clamp)
      if (++mcN > 6000) { MC = {}; mcN = 1; }
      MC[key] = out; stats.model.events++;
      return copyScene(out);
    } catch (err) { stats.model.failed++; return null; }
  }
  /* Kalman smoother (constant velocity + RTS) over runs of model scenes: docs/REPLAY_COORDINATE_MODEL.md */
  var KF = { on: 1, q: 150, r: 12, ra: 0.5, v0: 10 }; // q, r tuned on 40 training games (tests/replay_model_eval.mjs --kf)
  function smoothFrames() {
    var cfg = window.ReplayKF || KF; if (!cfg.on || !stats.model.events) return;
    var runs = {}; // id -> current run [{i, z, r}]
    function flush(id) {
      var run = runs[id]; delete runs[id]; if (!run || run.length < 2) return;
      for (var ax = 0; ax < 2; ax++) {
        var n = run.length, xs = [], Ps = [], xp = [], Pp = [], dts = [];
        var x = [run[0].z[ax], 0], P = [run[0].r * run[0].r, 0, 0, cfg.v0 * cfg.v0];
        for (var k = 0; k < n; k++) {
          if (k) {
            var dt = Math.max(0.3, FR[run[k].i].t - FR[run[k - 1].i].t), q = cfg.q;
            x = [x[0] + dt * x[1], x[1]];
            P = [P[0] + dt * (P[1] + P[2]) + dt * dt * P[3] + q * dt * dt * dt / 3, P[1] + dt * P[3] + q * dt * dt / 2, P[2] + dt * P[3] + q * dt * dt / 2, P[3] + q * dt];
            dts[k] = dt;
          }
          xp[k] = x.slice(); Pp[k] = P.slice();
          var R = run[k].r * run[k].r, S = P[0] + R, K0 = P[0] / S, K1 = P[2] / S, y = run[k].z[ax] - x[0];
          x = [x[0] + K0 * y, x[1] + K1 * y];
          P = [(1 - K0) * P[0], (1 - K0) * P[1], P[2] - K1 * P[0], P[3] - K1 * P[1]];
          xs[k] = x.slice(); Ps[k] = P.slice();
        }
        var sx = xs[n - 1];
        for (k = n - 2; k >= 0; k--) {
          var dt2 = dts[k + 1], A = Ps[k], B = Pp[k + 1], det = B[0] * B[3] - B[1] * B[2];
          if (!det) { sx = xs[k].slice(); run[k].s = run[k].s || []; run[k].s[ax] = sx[0]; continue; } // cannot happen with q > 0; keep the filtered spot
          var AF = [A[0] + A[1] * dt2, A[1], A[2] + A[3] * dt2, A[3]]; // A F^T
          var inv = [B[3] / det, -B[1] / det, -B[2] / det, B[0] / det];
          var C = [AF[0] * inv[0] + AF[1] * inv[2], AF[0] * inv[1] + AF[1] * inv[3], AF[2] * inv[0] + AF[3] * inv[2], AF[2] * inv[1] + AF[3] * inv[3]];
          var d0 = sx[0] - xp[k + 1][0], d1 = sx[1] - xp[k + 1][1];
          sx = [xs[k][0] + C[0] * d0 + C[1] * d1, xs[k][1] + C[2] * d0 + C[3] * d1];
          run[k].s = run[k].s || []; run[k].s[ax] = sx[0];
        }
        run[n - 1].s = run[n - 1].s || []; run[n - 1].s[ax] = xs[n - 1][0];
      }
      run.forEach(function (o) { if (o.r > cfg.ra || o.anc !== id) FR[o.i].pos[id] = clampCourt([o.s[0], o.s[1]]); });
    }
    for (var i = 0; i < FR.length; i++) {
      var f = FR[i], prev = i ? FR[i - 1] : null, on = {};
      f.ids.forEach(function (id) { on[id] = 1; });
      if (!f.m || (prev && prev.per !== f.per)) { for (var id0 in runs) flush(id0); if (!f.m) continue; }
      for (var id1 in runs) if (!on[id1]) flush(id1);
      f.ids.forEach(function (id) { var z = f.pos[id]; if (!z) return; (runs[id] = runs[id] || []).push({ i: i, z: z, r: f.anc === id ? cfg.ra : cfg.r, anc: f.anc }); });
    }
    for (var id2 in runs) flush(id2);
  }
  function copyScene(o) { var c = {}; for (var k in o) c[k] = [o[k][0], o[k][1]]; return c; }
  function buildFrames() {
    FR = []; var possSeq = 0, lastPoss = -1, holder = null, prevOff = 0; lastShotXY = null; stats.model.events = 0;
    for (var i = 0; i < EV.length; i++) {
      var e = EV[i], ty = G.types[e[2]], team = e[4], pid = e[5] ? String(e[5]) : null, ln = lineupAt(i);
      var poss = e[12] >= 0 ? e[12] : (team >= 0 ? team : lastPoss < 0 ? 0 : lastPoss);
      if (poss !== lastPoss) { possSeq++; lastPoss = poss; }
      var off = poss, def = 1 - off, d = DIR[e[0] + ':' + off], pos = {}, focus = pid, jit = 2.2;
      var offIds = ln[off], defIds = ln[def];
      function place(ids, slots, dd, noise) {
        ids.forEach(function (id, k) {
          var s = slots[k % slots.length], p = at(dd, s[0], s[1]);
          var n = noise == null ? jit : noise;
          pos[id] = clampCourt([p[0] + (hash(possSeq * 7 + k, +id) - 0.5) * n * 2 + (hash(i, +id) - 0.5) * 1.2, p[1] + (hash(possSeq * 13 + k, +id) - 0.5) * n * 2]);
        });
      }
      function guard(dd, tight) {
        defIds.forEach(function (id, k) {
          var m = pos[offIds[k]]; if (!m) return; var hx = hoopX(dd), vx = hx - m[0], vy = CW / 2 - m[1], dl = Math.hypot(vx, vy) || 1;
          var g = Math.min(dl * 0.45, tight && offIds[k] === pid ? 2.5 : 5);
          pos[id] = clampCourt([m[0] + vx / dl * g, m[1] + vy / dl * g]);
        });
      }
      if (ty === '2pt' || ty === '3pt') {
        prevOff = off; var sx = e[6] != null ? [e[6], e[7]] : null;
        var slots = OFF.slice(), order = offIds.slice();
        if (sx && pid && order.indexOf(pid) >= 0) {
          var best = 0, bd = 1e9; slots.forEach(function (s, k) { var p = at(d, s[0], s[1]), q = Math.hypot(p[0] - sx[0], p[1] - sx[1]); if (q < bd) { bd = q; best = k; } });
          var pk = order.indexOf(pid); var tmp = order[best]; order[best] = pid; order[pk] = tmp;
        }
        offIds = order; place(offIds, slots, d);
        if (sx && pid) pos[pid] = sx;
        guard(d, true); holder = pid;
        if (e[13] >= 0 && sx) d = e[13] ? 1 : -1;
      } else if (ty === 'freethrow') {
        prevOff = off; offIds.forEach(function (id) { if (id !== pid) return; pos[id] = at(d, 13.75, 0); });
        place(offIds.filter(function (x) { return x !== pid; }), FT_OFF, d, 0.4); if (pid) pos[pid] = at(d, 13.75, 0);
        place(defIds, FT_DEF, d, 0.4); holder = pid;
      } else if (ty === 'rebound') {
        var shotD = DIR[e[0] + ':' + prevOff], shooters = ln[prevOff], others = ln[1 - prevOff];
        var sl = OFF.map(function (s) { return [s[0] * 0.55 + 2, s[1] * 0.6]; });
        offIds = shooters; defIds = others; place(shooters, sl, shotD, 1.6);
        defIds.forEach(function (id, k) { var m = pos[shooters[k]]; if (m) pos[id] = clampCourt([m[0] + (hoopX(shotD) - m[0]) * 0.35, m[1] + (CW / 2 - m[1]) * 0.35]); });
        if (pid && (pos[pid] || ln[0].concat(ln[1]).indexOf(pid) >= 0)) pos[pid] = at(shotD, 3 + hash(i, 3) * 3, (hash(i, 5) - 0.5) * 9);
        holder = pid || holder;
      } else if (ty === 'jumpball' || (ty === 'period' && e[3] === 'start')) {
        var all = ln[0].concat(ln[1]);
        all.forEach(function (id, k) {
          var a = (k % 5) / 5 * Math.PI * 2 + (k >= 5 ? Math.PI / 5 : 0), r = (k % 5 === 4) ? 1.6 : 9;
          pos[id] = [L / 2 + r * Math.cos(a) * (k >= 5 ? 1 : -1), CW / 2 + r * Math.sin(a)];
        });
        if (ty === 'jumpball' && pid) holder = pid;
      } else if (ty === 'timeout' || (ty === 'period' && e[3] === 'end') || ty === 'game') {
        [0, 1].forEach(function (s) { ln[s].forEach(function (id, k) { var b = bench(s); pos[id] = [b[0] + Math.cos(k * 1.26) * 2.2, b[1] + 1.8 + Math.sin(k * 1.26) * 1.6]; }); });
        holder = null;
      } else if ((ty === 'steal' || ty === 'turnover') && team >= 0) {
        var od = DIR[e[0] + ':' + (ty === 'steal' ? 1 - team : team)];
        var o2 = ty === 'steal' ? ln[1 - team] : ln[team], d2 = ty === 'steal' ? ln[team] : ln[1 - team];
        offIds = o2; defIds = d2; place(o2, OFF, od); guard(od, false);
        if (ty === 'steal' && pid) { var v = pos[o2[0]]; if (v) pos[pid] = [v[0] + 1.5, v[1] + 1]; holder = pid; focus = pid; }
        else holder = pid || holder;
      } else {
        place(offIds, OFF, d); guard(d, false);
        if (ty === 'block' && pid && FR.length) { var ps = FR[FR.length - 1]; var sh = ps.holder && ps.pos[ps.holder]; if (sh) pos[pid] = [sh[0] + (hoopX(DIR[e[0] + ':' + prevOff]) - sh[0]) * 0.08, sh[1] + 1.2]; }
        if (ty === 'foul' || ty === 'violation' || ty === 'substitution' || ty === 'other' || ty === 'block') { /* keep the ball where it was */ }
      }
      [0, 1].forEach(function (s) { ln[s].forEach(function (id) { if (!pos[id]) pos[id] = at(DIR[e[0] + ':' + off], 20, 0); }); });
      var mp = modelPlace(e, ty, pid, ln);
      if (mp) { for (var mk in mp) if (pos[mk] || ln[0].indexOf(mk) >= 0 || ln[1].indexOf(mk) >= 0) pos[mk] = mp[mk]; }
      if ((ty === '2pt' || ty === '3pt') && e[6] != null) lastShotXY = [e[6], e[7]];
      FR.push({ pos: pos, holder: holder && pos[holder] ? holder : null, focus: focus, ty: ty, made: e[10], d: d, ids: ln[0].concat(ln[1]),
        m: mp ? 1 : 0, anc: mp && ((ty === '2pt' || ty === '3pt') && e[6] != null || ty === 'freethrow') ? pid : null, t: e[0] * 720 - e[1], per: e[0] });
    }
    smoothFrames();
  }

  function smooth(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  function segAt(t) { var lo = 0, hi = RT.length - 1; if (t < RT[0]) return 0; while (lo < hi) { var m = (lo + hi + 1) >> 1; if (RT[m] <= t) lo = m; else hi = m - 1; } return lo; }

  function stateAt(t) {
    var i = segAt(t), j = Math.min(i + 1, EV.length - 1), A = FR[i], Bf = FR[j];
    var dur = Math.max(0.01, (RT[j] || RT[i] + 1) - RT[i]), loc = t - RT[i], players = [];
    Bf.ids.forEach(function (id) {
      var to = Bf.pos[id], from = A.pos[id] || [bench(G.players[id] ? G.players[id].t : 0)[0], -3.5];
      var dist = Math.hypot(to[0] - from[0], to[1] - from[1]), need = Math.max(0.35, dist / 17), start = Math.max(0, dur - need);
      var p = i === j ? 1 : smooth((loc - start) / Math.max(0.01, dur - start)), moving = p > 0 && p < 1 && dist > 0.6;
      players.push({ id: id, x: from[0] + (to[0] - from[0]) * p, y: from[1] + (to[1] - from[1]) * p, dx: to[0] - from[0], dy: to[1] - from[1], moving: moving, side: G.players[id] ? G.players[id].t : 0 });
    });
    var byId = {}; players.forEach(function (p) { byId[p.id] = p; });
    var ball = null, e = EV[i], ty = A.ty, shooting = false, shot = null;
    function hand(id, up) { var q = byId[id] || (A.pos[id] ? { x: A.pos[id][0], y: A.pos[id][1] } : null); return q ? [q.x + 0.6, q.y - 0.4, up ? 7.6 : 2.4 + Math.abs(Math.sin(t * 9)) * 1.4] : null; }
    if ((ty === '2pt' || ty === '3pt' || ty === 'freethrow') && A.holder) {
      var fl = Math.min(1.1, dur * 0.75), u = loc / fl, rimX = hoopX(ty === 'freethrow' ? A.d : (e[6] > L / 2 ? 1 : -1)), s0 = A.pos[A.holder];
      shot = { u: u, post: loc - fl, rimX: rimX, d: rimX > L / 2 ? 1 : -1, ft: ty === 'freethrow', dunk: ty !== 'freethrow' && /dunk/i.test(e[3] || ''), made: A.made === 1, team: e[4] };
      if (u < 1) {
        shooting = true; var apex = ty === '3pt' ? 17 : ty === 'freethrow' ? 14 : (G.types && /dunk/i.test(e[3]) ? 11 : 15);
        var dunk = /dunk/i.test(e[3]);
        ball = dunk ? [s0[0] + (rimX - s0[0]) * u, s0[1] + (CW / 2 - s0[1]) * u, 8 + 3 * u]
                    : [s0[0] + (rimX - s0[0]) * u, s0[1] + (CW / 2 - s0[1]) * u, 7.5 + (10 - 7.5) * u + 4 * (apex - 10) * u * (1 - u)];
      } else {
        var v = Math.min(1, (loc - fl) / 0.45);
        if (A.made === 1) ball = [rimX, CW / 2, 10 - 9.5 * v];
        else { var nh = Bf.holder && byId[Bf.holder]; var tx = nh ? nh.x : rimX - A.d * 4, ty2 = nh ? nh.y : CW / 2; ball = [rimX + (tx - rimX) * v, CW / 2 + (ty2 - CW / 2) * v, 10 + 4 * v * (1 - v) * 3 - 6 * v]; }
        if (v >= 1) ball = Bf.holder ? hand(Bf.holder) : ball;
      }
    } else {
      var h0 = A.holder ? hand(A.holder) : null, h1 = Bf.holder ? hand(Bf.holder) : null, k = smooth((loc / dur - 0.35) / 0.3);
      ball = h0 && h1 ? [h0[0] + (h1[0] - h0[0]) * k, h0[1] + (h1[1] - h0[1]) * k, h0[2] + (h1[2] - h0[2]) * k + (A.holder !== Bf.holder ? 4 * k * (1 - k) * 3 : 0)] : (h0 || h1);
    }
    var fxs = shot ? stage(shot, byId[A.holder], players, ball) : { net: null, rim: null };
    return { i: i, players: players, ball: ball, shooter: shooting ? A.holder : null, focus: A.focus, holder: A.holder, e: e, net: fxs.net, rim: fxs.rim };
  }

  /* Poses and hoop effects for a shot, from the replay clock alone, so scrubbing and
     playing backwards show the same thing as playing forwards. Under reduced motion
     nobody leaves the floor and the net and rim hold still; the poses stay. */
  function stage(sh, me, players, ball) {
    var out = { net: null, rim: null }, lift = reduce ? 0 : 1;
    if (sh.u < 1) {
      if (me) {
        me.ph = sh.u; if (sh.dunk) { me.pose = 'dunk'; me.z = lift * 3.4 * smooth(sh.u * 1.3); if (ball) { me.x = ball[0] - sh.d * 0.9; me.y = ball[1] + 0.4; } }
        else { me.pose = 'jumper'; me.ph = Math.min(1, sh.u * 1.25); me.z = lift * (sh.ft ? 0.5 : 2.4) * Math.sin(Math.PI * Math.min(1, sh.u * 1.25)); }
      }
    } else if (sh.made) {
      var p = sh.post;
      if (p < 0.9 && !reduce) out.net = { d: sh.d, k: p / 0.9 };
      if (sh.dunk && p < 0.6) {
        if (!reduce) out.rim = { d: sh.d, amp: 1 - p / 0.6 };
        if (me) { me.pose = 'hang'; me.z = lift * 3.4 * (p < 0.35 ? 1 : 1 - smooth((p - 0.35) / 0.25)); me.x = sh.rimX - sh.d * 0.9; me.y = CW / 2 + 0.4; }
      }
      if (p < 2.2) players.forEach(function (q, k) { if (q.side === sh.team && !q.moving && !q.pose) { q.pose = 'celebrate'; q.z = lift * Math.abs(Math.sin(perf * 9 + k)) * 0.8; } });
    } else if (sh.post < 0.45 && !sh.ft && !reduce) out.rim = { d: sh.d, amp: 0.7 * (1 - sh.post / 0.45) };
    return out;
  }

  /* ---------- scene ---------- */
  function buildCrowd() {
    crowd = []; var home = G.teams[1].c, away = G.teams[0].c, pal = ['#E9E2D2', '#3B3F45', '#8E2F2F', '#2F4F8E', '#C9A227', '#5E7F5A', home, home, home, away];
    function row(x0, y0, x1, y1, ox, oy) {
      for (var r = 0; r < 6; r++) { var n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.7); for (var k = 0; k <= n; k++) {
        var t = k / n; crowd.push({ x: x0 + (x1 - x0) * t + ox * (5 + r * 2.1), y: y0 + (y1 - y0) * t + oy * (5 + r * 2.1), z: 1.4 + r * 1.9, c: pal[Math.floor(hash(k + r * 97, x0 + y0) * pal.length)], ph: hash(k, r) * 6.28 });
      } }
    }
    row(-6, 0, L + 6, 0, 0, -1); row(-6, CW, L + 6, CW, 0, 1); row(0, -4, 0, CW + 4, -1, 0); row(L, -4, L, CW + 4, 1, 0);
  }
  function drawCourt() {
    var home = G.teams[1];
    quad(-8, -8, L + 8, CW + 8, mix(home.c, '#000000', 0.45), 14, 8, -0.05);
    for (var s = 0; s < 16; s++) quad(L * s / 16, 0, L * (s + 1) / 16, CW, s % 2 ? COL.wood : COL.wood2, 1, 6, 0);
    var paint = mix(home.c, COL.wood, 0.35);
    quad(0, 17, 19, 33, paint, 4, 4, 0.01); quad(L - 19, 17, L, 33, paint, 4, 4, 0.01);
    disc(L / 2, CW / 2, 6, mix(home.alt, COL.wood, lum(home.alt) > 200 ? 0.6 : 0.25));
    var c = COL.line, Z = 0.03;
    seg3(0, 0, Z, L, 0, Z, c); seg3(L, 0, Z, L, CW, Z, c); seg3(L, CW, Z, 0, CW, Z, c); seg3(0, CW, Z, 0, 0, Z, c);
    seg3(L / 2, 0, Z, L / 2, CW, Z, c); arc3(L / 2, CW / 2, Z, 6, 0, Math.PI * 2, c); arc3(L / 2, CW / 2, Z, 2, 0, Math.PI * 2, c);
    [1, -1].forEach(function (d) {
      var hx = hoopX(d), bx = d > 0 ? L : 0, ex = bx - d * 19, a = Math.asin(22 / 23.75), cx3 = hx - d * 23.75 * Math.cos(a);
      seg3(bx, 17, Z, ex, 17, Z, c); seg3(bx, 33, Z, ex, 33, Z, c); seg3(ex, 17, Z, ex, 33, Z, c);
      arc3(ex, CW / 2, Z, 6, d > 0 ? Math.PI / 2 : -Math.PI / 2, d > 0 ? Math.PI * 1.5 : Math.PI / 2, c);
      seg3(bx, 3, Z, cx3, 3, Z, c); seg3(bx, 47, Z, cx3, 47, Z, c);
      arc3(hx, CW / 2, Z, 23.75, d > 0 ? Math.PI - a : -a, d > 0 ? Math.PI + a : a, c);
      arc3(hx, CW / 2, Z, 4, d > 0 ? Math.PI / 2 : -Math.PI / 2, d > 0 ? Math.PI * 1.5 : Math.PI / 2, c);
    });
  }
  /* the stanchion, arm and backboard never move: drawn once per camera into a hoop layer */
  function drawHoopFrame(d) {
    var bx = d > 0 ? L + 4 : -4, bb = d > 0 ? L - 4 : 4;
    seg3(bx, CW / 2, 0, bx, CW / 2, 12.6, '#5A6068', 1); seg3(bx + d * 0.4, CW / 2, 0, bx + d * 0.4, CW / 2, 12.6, '#3E434A', 1);
    seg3(bx, CW / 2, 12.4, bb, CW / 2, 12, '#5A6068', 1);
    var a = P(bb, 22, 9.6), b = P(bb, 28, 9.6), cc = P(bb, 28, 13.1), dd = P(bb, 22, 13.1);
    if (a && b && cc && dd) {
      ctx.fillStyle = 'rgba(236,242,247,.78)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(cc.x, cc.y); ctx.lineTo(dd.x, dd.y); ctx.closePath(); ctx.fill();
      line2(a, b, '#E2E6EA'); line2(b, cc, '#E2E6EA'); line2(cc, dd, '#E2E6EA'); line2(dd, a, '#E2E6EA');
      var s1 = P(bb, 24, 10), s2 = P(bb, 26, 10), s3 = P(bb, 26, 11.5), s4 = P(bb, 24, 11.5);
      if (s1 && s2 && s3 && s4) { line2(s1, s2, '#E0483B'); line2(s2, s3, '#E0483B'); line2(s3, s4, '#E0483B'); line2(s4, s1, '#E0483B'); }
    }
  }
  /* rim and net are live: the net ripples and pinches as a make drops through, the rim
     shakes after a dunk or a clank. Both hold still under prefers-reduced-motion. */
  function drawRimNet(d, S) {
    var hx = hoopX(d), k = S.net && S.net.d === d ? S.net.k : -1, amp = S.rim && S.rim.d === d ? S.rim.amp : 0;
    if (k >= 0) stats.netRipple++; if (amp > 0) stats.rimShake++;
    var rz = 10 + (amp > 0 ? Math.sin(perf * 70) * 0.22 * amp : 0), rx = hx + (amp > 0 ? Math.cos(perf * 55) * 0.15 * amp : 0);
    var rip = k >= 0 ? Math.sin(Math.PI * k) : 0, sway = k >= 0 ? Math.sin(k * 14) * 0.2 * (1 - k) : 0;
    var br = 0.45 * (1 - 0.5 * rip), bz = 8.4 - 0.8 * rip, mz = (rz + bz) / 2, mr = (0.75 + br) / 2 + 0.06 * rip;
    for (var n = 0; n < 6; n++) {
      var an = n / 6 * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
      seg3(rx + 0.75 * c, CW / 2 + 0.75 * s, rz, hx + mr * c + sway * 0.5, CW / 2 + mr * s, mz, 'rgba(250,250,250,.85)', 1);
      seg3(hx + mr * c + sway * 0.5, CW / 2 + mr * s, mz, hx + br * c + sway, CW / 2 + br * s, bz, 'rgba(250,250,250,.85)', 1);
    }
    arc3(rx, CW / 2, rz, 0.75, 0, Math.PI * 2, '#F26A1B');
  }
  /* ---------- Blender sprites ----------
     assets/sprites/players.png is rendered offline by scripts/sprites/build_sprites.py
     (Blender, headless, a procedural blocky player): 8 facings x 2 camera pitches x 16 pose
     frames. The jersey renders pure red, the shorts pure green and the trim pure blue, so
     each team's sheet is one recolour pass here. Cells are scaled to the player's projected
     height and cached per size. Until the sheet loads, if it fails, or with ?sprites=0,
     players are drawn as boxes. */
  var SPR = null, sheets = {}, cells = {}, cellN = 0;
  function loadSprites() {
    if (/[?&]sprites=0/.test(location.search) || typeof Image === 'undefined') return;
    fetch('/assets/sprites/players.json?v=38993b8f').then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (!m) return;
      var img = new Image();
      img.onload = function () { m.img = img; SPR = m; stats.sprites.ready = 1; };
      img.onerror = function () { stats.sprites.failed = 1; };
      img.src = '/assets/sprites/' + m.image + (m.hash ? '?v=' + m.hash : '');
    }).catch(function () {});
  }
  /* jersey, shorts (10% darker), trim as [r,g,b]; mix() returns an rgb() string, so not used here */
  function teamTints(team) { var c = hex(team.c); return [c, c.map(function (v) { return v * 0.9; }), hex(team.alt)]; }
  function sheetFor(team) {
    var key = team.c + team.alt; if (sheets[key]) return sheets[key];
    var l = mkLayer(), im = SPR.img; l.c.width = im.width; l.c.height = im.height; l.x.drawImage(im, 0, 0);
    var px = l.x.getImageData(0, 0, im.width, im.height), d = px.data, top = [1, 1, 1], i, k;
    var cls = function (r, g, b) { return r > 24 && g < r * 0.3 && b < r * 0.3 ? 0 : g > 24 && r < g * 0.3 && b < g * 0.3 ? 1 : b > 24 && r < b * 0.3 && g < b * 0.3 ? 2 : -1; };
    for (i = 0; i < d.length; i += 4) if (d[i + 3]) { k = cls(d[i], d[i + 1], d[i + 2]); if (k >= 0) top[k] = Math.max(top[k], d[i + k]); }
    var tint = teamTints(team);
    for (i = 0; i < d.length; i += 4) if (d[i + 3]) {
      k = cls(d[i], d[i + 1], d[i + 2]); if (k < 0) continue;
      var s = d[i + k] / top[k]; d[i] = tint[k][0] * s; d[i + 1] = tint[k][1] * s; d[i + 2] = tint[k][2] * s;
    }
    l.x.putImageData(px, 0, 0); stats.sprites.sheets++;
    return (sheets[key] = l.c);
  }
  /* one cell at a pixel height: shrinking smooths then snaps alpha back to on/off, so the
     outline survives at 12 px tall without a blur halo; growing stays nearest-neighbour */
  function cellAt(team, row, col, s) {
    var key = team.c + team.alt + '|' + row + '|' + col + '|' + s.toFixed(3); if (cells[key]) return cells[key];
    if (cellN > 3000) { cells = {}; cellN = 0; }
    var cw = SPR.cell[0], ch = SPR.cell[1], w = Math.max(1, Math.round(cw * s)), h = Math.max(1, Math.round(ch * s)), l = mkLayer();
    l.c.width = w; l.c.height = h; l.x.imageSmoothingEnabled = s < 1; if (s < 1) l.x.imageSmoothingQuality = 'high';
    l.x.drawImage(sheetFor(team), col * cw, row * ch, cw, ch, 0, 0, w, h);
    if (s < 1) { var px = l.x.getImageData(0, 0, w, h), d = px.data; for (var i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0; l.x.putImageData(px, 0, 0); }
    cellN++; stats.sprites.cells++;
    return (cells[key] = l.c);
  }
  function spriteCol(p, pose) {
    var Q = SPR.poses, t = reduce ? 0 : perf, j = Math.abs(Math.floor(p.x * 0.7));
    if (pose === 'run') return Q.run[(Math.floor(t * 10) + j) % 4];
    if (pose === 'jumper') { var u = p.ph || 0; return Q.jumper[u < 0.15 ? 0 : u < 0.45 ? 1 : u < 0.75 ? 2 : 3]; }
    if (pose === 'dunk') { var v = p.ph || 0; return Q.dunk[v < 0.2 ? 0 : v < 0.6 ? 1 : 2]; }
    if (pose === 'hang') return Q.dunk[2];
    if (pose === 'celebrate') return Q.celebrate[(Math.floor(t * 4) + j) % 2];
    return Q.idle[(Math.floor(t * 1.5) + j) % 2];
  }
  /* facing: where the player is running, else toward the ball; turned into the sheet's
     8 camera-relative directions (0 faces the camera, 2 faces screen right) */
  function spriteDir(p, S) {
    var ax = p.moving ? p.dx : (S.ball ? S.ball[0] - p.x : L / 2 - p.x), ay = p.moving ? p.dy : (S.ball ? S.ball[1] - p.y : CW / 2 - p.y);
    if (Math.abs(ax) + Math.abs(ay) < 0.01) return 0;
    var right = ax * B.rx + ay * B.ry, toward = -(ax * B.fx + ay * B.fy);
    return ((Math.round(Math.atan2(right, toward) / (Math.PI / 4)) % 8) + 8) % 8;
  }
  function drawSprite(p, S, f, ph, pose) {
    var ei = cam.pitch > 0.79 ? 1 : 0, an = SPR.anchors[ei], span = an.foot[1] - an.head[1];
    var s = Math.round(ph / span * 16) / 16, row = ei * SPR.dirs + spriteDir(p, S), c = cellAt(G.teams[p.side], row, spriteCol(p, pose), s);
    ctx.drawImage(c, Math.round(f.x - an.foot[0] * s), Math.round(f.y - an.foot[1] * s)); stats.sprites.drawn++;
    return Math.round(f.y - an.head[1] * s);
  }

  /* Poses: idle, run (4-frame cycle with arm swing), jumper (arms up + hop), dunk (rise to
     the rim), hang (on the rim, knees tucked), celebrate (arms up, bouncing; the scoring
     team after a make). p.z is how far the feet are off the floor, in feet. */
  function drawPlayer(p, S) {
    var team = G.teams[p.side], z = p.z || 0, g = P(p.x, p.y, 0), f = z > 0 ? P(p.x, p.y, z) : g, h = P(p.x, p.y, z + 6.6); if (!f || !h || !g) return;
    var pose = p.pose || (p.moving ? 'run' : 'idle'); stats.poses[pose] = (stats.poses[pose] || 0) + 1; if (z > 0) stats.hop++;
    var ph = Math.max(4, Math.round(f.y - h.y)), w = Math.max(3, Math.round(B.f * 1.9 / f.z));
    var x0 = Math.round(f.x - w / 2), top = Math.round(f.y - ph), sw = z > 0 ? Math.max(1, w - Math.round(z)) : w;
    ctx.fillStyle = COL.shadow; ctx.fillRect(Math.round(g.x - sw / 2) - 1, Math.round(g.y) - 1, sw + 2, Math.max(1, Math.round(w / 3)));
    if (ph < w * 0.9) { // looking straight down: a jersey-coloured token
      ctx.fillStyle = team.c; ctx.fillRect(x0, Math.round(f.y - w / 2), w, w); ctx.fillStyle = team.alt; ctx.fillRect(x0 + 1, Math.round(f.y - w / 2) + 1, Math.max(1, w - 2), 1);
      ctx.fillStyle = COL.hair; ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 2, 2);
    } else if (SPR && (function () { try { top = drawSprite(p, S, f, ph, pose); return true; } catch (e) { SPR = null; stats.sprites.failed = 1; return false; } })()) {
      // drawn from the sheet; a throw drops every later frame back to boxes
    } else {
      var hh = Math.max(2, Math.round(ph * 0.2)), jh = Math.max(2, Math.round(ph * 0.36)), sh = Math.max(1, Math.round(ph * 0.16)), lh = Math.max(1, ph - hh - jh - sh);
      var hw = Math.max(2, Math.round(w * 0.6)), hx = Math.round(f.x - hw / 2), y = top;
      var up = pose === 'jumper' || pose === 'dunk' || pose === 'hang' || pose === 'celebrate';
      var fr = pose === 'run' && !reduce ? Math.floor(perf * 12 + p.x * 0.7) % 4 : 1;
      if (up) {
        var ah = Math.round(hh * 1.2), ay = y - Math.round(hh * 0.9);
        ctx.fillStyle = COL.skin; ctx.fillRect(x0, ay, 1, ah); ctx.fillRect(x0 + w - 1, ay, 1, ah);
        if (pose === 'celebrate') { ctx.fillRect(x0 - 1, ay - 1, 1, 2); ctx.fillRect(x0 + w, ay - 1, 1, 2); }
      }
      ctx.fillStyle = COL.skin; ctx.fillRect(hx, y, hw, hh); ctx.fillStyle = COL.hair; ctx.fillRect(hx, y, hw, 1); y += hh;
      ctx.fillStyle = team.c; ctx.fillRect(x0, y, w, jh); ctx.fillStyle = team.alt; ctx.fillRect(x0, y, w, 1);
      if (w >= 5 && jh >= 4) ctx.fillRect(Math.round(f.x) - 1, y + 2, 2, Math.max(1, jh - 3));
      if (!up) { // arms at the sides; on the run they swing, one forward (raised a pixel) at a time
        var la = fr === 0 ? 1 : 0, ra = fr === 2 ? 1 : 0, ah2 = Math.max(1, jh - 1);
        ctx.fillStyle = COL.skin; ctx.fillRect(x0 - 1, y + 1 - la, 1, ah2); ctx.fillRect(x0 + w, y + 1 - ra, 1, ah2);
      }
      y += jh; ctx.fillStyle = mix(team.c, '#000000', 0.25); ctx.fillRect(x0, y, w, sh); y += sh;
      var lw = Math.max(1, Math.floor(w / 3)), ll = 0, rl = 0;
      if (pose === 'run') { ll = fr === 2 ? 1 : 0; rl = fr === 0 ? 1 : 0; }
      else if (pose === 'hang' || pose === 'dunk') { ll = rl = Math.min(2, lh - 1); }
      else if (pose === 'jumper' && z > 0.3) { ll = rl = Math.min(1, lh - 1); }
      var lhl = Math.max(1, lh - ll), lhr = Math.max(1, lh - rl), lx = x0 + (pose === 'run' && (fr === 1 || fr === 3) ? 1 : 0);
      ctx.fillStyle = COL.skin; ctx.fillRect(lx, y, lw, lhl); ctx.fillRect(x0 + w - lw, y, lw, lhr);
      ctx.fillStyle = '#F4F4F4'; ctx.fillRect(lx, y + lhl - 1, lw, 1); ctx.fillRect(x0 + w - lw, y + lhr - 1, lw, 1);
    }
    if (p.id === S.focus || p.id === S.holder) {
      var bob = reduce ? 0 : Math.round(Math.sin(perf * 6) * 1.5), name = lastName(p.id);
      if (p.id === S.focus) { ctx.fillStyle = '#F2C14E'; ctx.fillRect(Math.round(f.x) - 2, top - 6 + bob, 5, 1); ctx.fillRect(Math.round(f.x) - 1, top - 5 + bob, 3, 1); ctx.fillRect(Math.round(f.x), top - 4 + bob, 1, 1); }
      if (name && p.id === S.focus) drawText(name, Math.round(f.x - textW(name, 1) / 2), top - 13 + bob, 1, '#FFFFFF', '#14161A');
    }
  }
  function drawBall(b) {
    var s = P(b[0], b[1], 0), p = P(b[0], b[1], b[2]); if (!p) return;
    var r = Math.max(1, Math.round(B.f * 0.8 / p.z));
    if (s) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(Math.round(s.x - r), Math.round(s.y), r * 2, 1); }
    ctx.fillStyle = COL.ball; ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r), r * 2, r * 2);
    ctx.fillStyle = '#7A3510'; ctx.fillRect(Math.round(p.x - r), Math.round(p.y), r * 2, 1);
  }
  function drawBackdrop() { ctx.fillStyle = '#1A1D21'; for (var r = 0; r < 6; r++) ctx.fillRect(-4, r * 6 - 4, W + 8, 3); }
  function drawCrowd(still) {
    var boost = !still && flash > 0 ? flash : 0;
    for (var k = 0; k < crowd.length; k++) {
      var c = crowd[k], jump = (!reduce && boost > 0) ? Math.max(0, Math.sin(perf * 14 + c.ph)) * 0.9 * boost : 0, p = P(c.x, c.y, c.z + jump); if (!p) continue;
      var s = Math.max(1, Math.round(B.f * 0.9 / p.z)); ctx.fillStyle = c.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      if (s > 1) { ctx.fillStyle = COL.skin; ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, s, 1); }
    }
  }
  function drawHud(S) {
    var e = S.e, a = G.teams[0], h = G.teams[1], y = 5;
    ctx.fillStyle = 'rgba(20,22,26,.86)'; ctx.fillRect(4, 3, 118, 13);
    ctx.fillStyle = a.c; ctx.fillRect(6, 5, 3, 9); ctx.fillStyle = h.c; ctx.fillRect(61, 5, 3, 9);
    drawText(a.tri + ' ' + e[8], 11, y + 1, 1, '#F2EEE4'); drawText(h.tri + ' ' + e[9], 66, y + 1, 1, '#F2EEE4');
    var cl = clockStr(e[0], e[1]); ctx.fillStyle = 'rgba(20,22,26,.86)'; ctx.fillRect(124, 3, textW(cl, 1) + 6, 13); drawText(cl, 127, y + 1, 1, '#F2C14E');
    if (cur.live || (!G.final && S.i >= EV.length - 1)) {
      var lx = 124 + textW(cl, 1) + 9, blink = reduce || Math.floor(perf * 2) % 2 === 0;
      ctx.fillStyle = 'rgba(20,22,26,.86)'; ctx.fillRect(lx - 3, 3, cur.live ? 30 : 10, 13);
      if (blink) { ctx.fillStyle = '#E0483B'; ctx.fillRect(lx, 7, 4, 4); }
      if (cur.live) drawText('LIVE', lx + 7, y + 1, 1, '#F2EEE4');
    }
    for (var k = fx.length - 1; k >= 0; k--) {
      var f = fx[k], age = perf - f.t0; if (age > 1.4) { fx.splice(k, 1); continue; } if (age < 0) continue;
      var sc = f.big ? 3 : 2, yy = Math.round(56 - (reduce ? 0 : age * 14)), xx = Math.round(W / 2 - textW(f.txt, sc) / 2);
      if (age < 1.1 || Math.floor(age * 12) % 2) drawText(f.txt, xx, yy, sc, f.col, '#14161A');
    }
  }
  var perf = 0;
  var stats = { poses: { idle: 0, run: 0, jumper: 0, dunk: 0, hang: 0, celebrate: 0 }, hop: 0, netRipple: 0, rimShake: 0, cache: { hits: 0, builds: 0, direct: 0 }, model: { events: 0, failed: 0, ready: 0 }, sprites: { ready: 0, failed: 0, sheets: 0, cells: 0, drawn: 0 } };

  /* Static-court cache. The stands, floor, lines and the two hoop frames only change when
     the camera or the game does, so they are drawn once into offscreen layers and blitted.
     A layer is built when the camera has held still for two frames; while it moves (drag,
     preset glide, follow-ball) the scene is drawn straight to the screen as before, so a
     moving camera never pays for both. The crowd jumps after a make, so while it does the
     stands are drawn live. */
  var LY = null, layerKey = '', pendKey = '', sceneVer = 0;
  function mkLayer() { var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; return { c: c, x: x }; }
  function into(l, fn) { var keep = ctx; ctx = l.x; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); try { fn(); } finally { ctx = keep; } }
  function courtCache() {
    var key = [sceneVer, cam.yaw, cam.pitch, cam.dist, cam.fov, cam.tx, cam.ty, cam.tz].join('|');
    if (LY && key === layerKey) { stats.cache.hits++; return true; }
    if (key !== pendKey) { pendKey = key; stats.cache.direct++; return false; }
    if (!LY) LY = { stands: mkLayer(), court: mkLayer(), hoopR: mkLayer(), hoopL: mkLayer() };
    into(LY.stands, function () { drawBackdrop(); drawCrowd(true); });
    into(LY.court, drawCourt);
    into(LY.hoopR, function () { drawHoopFrame(1); });
    into(LY.hoopL, function () { drawHoopFrame(-1); });
    layerKey = key; stats.cache.builds++; return true;
  }

  function render() {
    if (!G) return;
    if (camGoal) {
      var k = Math.min(1, (performance.now() - camGoal.t0) / 600), e2 = smooth(k);
      ['pitch', 'dist', 'fov', 'tx', 'ty'].forEach(function (q) { cam[q] = camGoal.from[q] + (camGoal.to[q] - camGoal.from[q]) * e2; });
      var dy = ((camGoal.to.yaw - camGoal.from.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; cam.yaw = camGoal.from.yaw + dy * e2;
      if (k >= 1) camGoal = null;
    }
    var S = stateAt(cur.t);
    if (cam.follow && S.ball) { cam.tx += (S.ball[0] - cam.tx) * 0.08; cam.ty += (S.ball[1] - cam.ty) * 0.08; }
    setupCam();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shake > 0 && !reduce) ctx.translate(Math.round((Math.random() - 0.5) * 3), Math.round((Math.random() - 0.5) * 3));
    var still = courtCache(), crowdLive = !reduce && flash > 0;
    ctx.fillStyle = '#121417'; ctx.fillRect(-4, -4, W + 8, H + 8);
    if (still && !crowdLive) ctx.drawImage(LY.stands.c, 0, 0); else { drawBackdrop(); drawCrowd(false); }
    if (still) ctx.drawImage(LY.court.c, 0, 0); else drawCourt();
    var objs = [];
    S.players.forEach(function (p) { var q = P(p.x, p.y, 0); if (q) objs.push({ z: q.z, f: function () { drawPlayer(p, S); } }); });
    [1, -1].forEach(function (d) {
      var q = P(hoopX(d), CW / 2, 10);
      if (q) objs.push({ z: q.z + 0.5, f: function () { if (still) ctx.drawImage(d > 0 ? LY.hoopR.c : LY.hoopL.c, 0, 0); else drawHoopFrame(d); drawRimNet(d, S); } });
    });
    if (S.ball) { var qb = P(S.ball[0], S.ball[1], S.ball[2]); if (qb) objs.push({ z: qb.z - 0.4, f: function () { drawBall(S.ball); } }); }
    objs.sort(function (a, b) { return b.z - a.z; }); objs.forEach(function (o) { o.f(); });
    drawHud(S); drawWipe();
    return S;
  }
  /* pixel wipe on game switch and period start, 0.5 s (after huashu-motion's mosaic, alchaincyf, MIT) */
  var wipe = 0;
  function startWipe() { if (!reduce) { wipe = performance.now(); snd('wipe'); } }
  function drawWipe() {
    if (!wipe) return; var p = (performance.now() - wipe) / 500; if (p >= 1) { wipe = 0; return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#121417';
    for (var c = 0, bw = Math.ceil(W / 16), rh = H / 9; c < 16; c++) {
      var u = Math.max(0, Math.min(1, p * 1.6 - c / 32 - hash(c, 7) * 0.1)), y = Math.round((u % 0.5) * 18) * rh;
      if (u > 0 && u < 1) ctx.fillRect(c * bw, u < 0.5 ? 0 : y, bw, u < 0.5 ? y : H - y);
    }
  }
  function snd(n, d) { if (onScreen && window.VHSound && VHSound.sfx) VHSound.sfx(n, d); } // silent while the plate is scrolled away

  /* ---------- effects ---------- */
  function popFor(i) {
    var e = EV[i], ty = G.types[e[2]], prev = EV[i - 1];
    if ((ty === '2pt' || ty === '3pt') && e[10] === 1) {
      var sub = (e[3] || '').toLowerCase(), team = G.teams[e[4]] || G.teams[0];
      var txt = ty === '3pt' ? 'BANG! 3' : /dunk/.test(sub) ? 'SLAM!' : /layup|finger|hook/.test(sub) ? 'BUCKET!' : 'SWISH!';
      fx.push({ txt: txt, t0: perf + 0.9, col: lum(team.c) < 70 ? team.alt : team.c, big: ty === '3pt' || /dunk/.test(sub) });
      flash = e[4] === 1 ? 1 : 0.5; if (/dunk/.test(sub)) shake = 0.35;
      if (prev && Math.sign(prev[8] - prev[9]) !== Math.sign(e[8] - e[9]) && e[8] !== e[9] && prev[8] !== prev[9]) fx.push({ txt: 'LEAD CHANGE', t0: perf + 1.5, col: '#FF7A33' });
      snd('swish', 0.9);
    } else if (ty === '2pt' || ty === '3pt') snd('miss', 0.9);
    else if (ty === 'period' && e[3] === 'start') startWipe();
    if (ty === 'block') { fx.push({ txt: 'REJECTED!', t0: perf, col: '#6EA8FF', big: true }); snd('block'); }
    else if (ty === 'steal') fx.push({ txt: 'PICKED!', t0: perf, col: '#6EA8FF' });
    else if (ty === 'game') fx.push({ txt: 'FINAL', t0: perf, col: '#F2C14E', big: true });
    else if (ty === 'period' && e[3] === 'end') fx.push({ txt: 'END ' + (e[0] <= 4 ? 'Q' + e[0] : 'OT'), t0: perf, col: '#F2EEE4' });
  }

  /* ---------- UI ---------- */
  var scrub = $('rpScrub'), playBtn = $('rpPlay'), nowEl = $('rpNow'), feedEl = $('rpFeed'), momEl = $('rpMoments'), filter = 'all', MOM = [];
  function fmtT(i) { return clockStr(EV[i][0], EV[i][1]); }
  function setPlaying(on) { cur.playing = on; if (!playBtn) return; playBtn.textContent = on ? '❚❚' : '▶'; playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play'); }
  function seek(t) { cur.t = Math.max(0, Math.min(T_END, t)); lastFxIdx = segAt(cur.t); fx = []; }
  function moments() {
    MOM = [];
    for (var i = 1; i < EV.length; i++) {
      var e = EV[i], ty = G.types[e[2]], sub = (e[3] || '').toLowerCase(), p = EV[i - 1], tag = null;
      if ((ty === '2pt' || ty === '3pt') && e[10] === 1) {
        if (/dunk/.test(sub)) tag = 'dunk'; else if (ty === '3pt') tag = '3';
        if (p[8] !== p[9] && e[8] !== e[9] && Math.sign(p[8] - p[9]) !== Math.sign(e[8] - e[9])) tag = tag || 'lead', MOM.push({ i: i, f: 'lead' });
        var clutch = e[0] >= 4 && e[1] <= 120 && Math.abs(e[8] - e[9]) <= 6; if (clutch && !tag) tag = 'clutch';
      } else if (ty === 'block' || ty === 'steal') tag = 'd';
      else if (ty === 'game') tag = 'end';
      if (tag) MOM.push({ i: i, f: tag });
    }
    var seen = {}; MOM = MOM.filter(function (m) { var k = m.i + m.f; if (seen[k]) return false; seen[k] = 1; return true; });
    var marks = $('rpMarks'), ticks = $('rpTicks');
    if (marks) { marks.innerHTML = ''; MOM.forEach(function (m) { if (m.f === 'clutch') return; var s = document.createElement('span'); s.style.left = (RT[m.i] / T_END * 100) + '%'; if (m.f === 'd') s.className = 'd'; if (m.f === 'lead') s.className = 'l'; marks.appendChild(s); }); }
    if (ticks) { ticks.innerHTML = ''; ticks.style.position = 'relative'; ticks.style.height = '12px'; }
    for (var q = 1; ticks && q <= G.periods; q++) { var k = EV.findIndex(function (e) { return e[0] === q; }); if (k < 0) continue; var sp = document.createElement('span'); sp.textContent = q <= 4 ? 'Q' + q : 'OT' + (q - 4); sp.style.position = 'absolute'; sp.style.left = (RT[k] / T_END * 100) + '%'; ticks.appendChild(sp); }
    renderMoments();
  }
  function renderMoments() {
    if (!momEl) return;
    momEl.innerHTML = '';
    var list = MOM.filter(function (m) { return filter === 'all' ? m.f !== 'lead' : m.f === filter; });
    if (!list.length) { var li0 = document.createElement('li'); li0.className = 'rp-muted'; li0.textContent = 'None in this game.'; momEl.appendChild(li0); return; }
    list.forEach(function (m) {
      var li = document.createElement('li'), b = document.createElement('button'), t = document.createElement('span'), d = document.createElement('span');
      b.type = 'button'; t.className = 't'; t.textContent = fmtT(m.i); d.textContent = (m.f === 'lead' ? 'Lead change: ' : m.f === 'clutch' ? 'Clutch: ' : '') + EV[m.i][11];
      b.appendChild(t); b.appendChild(d); b.dataset.i = m.i;
      b.addEventListener('click', function () { cur.live = false; seek(RT[m.i] - 3.2); cur.dir = 1; attr('rpRev', 'aria-pressed', 'false'); setPlaying(true); });
      li.appendChild(b); momEl.appendChild(li);
    });
  }
  function updateText(S) {
    if (S.i === cur.idx) return; cur.idx = S.i; var e = S.e;
    if (window.PixelReplay && window.PixelReplay.onEvent) try { window.PixelReplay.onEvent(S.i, G); } catch (er) { /* the host page's bug, not the replay's */ }
    if (nowEl) nowEl.textContent = fmtT(S.i) + ' · ' + (e[11] || '') + ' · ' + G.teams[0].tri + ' ' + e[8] + ' – ' + G.teams[1].tri + ' ' + e[9];
    if (!feedEl) return;
    feedEl.innerHTML = '';
    for (var k = Math.max(0, S.i - 7); k <= S.i; k++) { if (!EV[k][11]) continue; var li = document.createElement('li'); if (k === S.i) li.className = 'cur'; var t = document.createElement('span'); t.className = 't'; t.textContent = fmtT(k); var d = document.createElement('span'); d.textContent = EV[k][11]; li.appendChild(t); li.appendChild(d); feedEl.insertBefore(li, feedEl.firstChild); }
  }

  /* embedded on the live page: skip drawing while the plate is scrolled out of view (the clock still runs) */
  var onScreen = true;
  if (EMBED && typeof IntersectionObserver === 'function') new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; }).observe(cv);
  var lastNow = performance.now();
  function tick(now) {
    requestAnimationFrame(tick); // first, so a throw below costs one frame, not the loop
    var dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now; perf += dt;
    if (G && cur.playing) {
      if (cur.live) { // trail the newest play in real time; quicker when one poll lands several plays
        var behind = headT() - cur.t;
        cur.t = Math.min(headT(), cur.t + dt * (behind > 24 ? 4 : behind > 10 ? 2 : 1));
        if (!G.live && cur.t >= headT()) { cur.live = false; setPlaying(false); liveUi(); } // the game went final: its last play has run
      } else cur.t += dt * cur.speed * cur.dir;
      if (cur.loop && cur.t > cur.loop[1]) { cur.t = cur.loop[0]; lastFxIdx = segAt(cur.t); }
      if (cur.loop && cur.t < cur.loop[0]) { cur.t = cur.loop[1]; lastFxIdx = segAt(cur.t); }
      if (cur.t >= T_END && !cur.live) { cur.t = T_END; setPlaying(false); }
      if (cur.t <= 0) { cur.t = 0; setPlaying(false); }
      var i = segAt(cur.t);
      if (cur.dir > 0 && i > lastFxIdx) { for (var k = lastFxIdx + 1; k <= i; k++) if (k > 0) popFor(k); }
      lastFxIdx = i;
    }
    shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt * 0.9);
    var S = onScreen ? render() : null; if (S) { updateText(S); if (scrub && document.activeElement !== scrub) scrub.value = Math.round(cur.t / T_END * 1000); }
  }

  /* Show a game. opts.keep: the same game with more events (a live poll), so stay on the
     same play. opts.live: follow the newest play, a few seconds behind it. */
  function setGame(g, opts) {
    opts = opts || {};
    var same = !!(opts.keep && G && G.gameId === g.gameId), i0 = same ? segAt(cur.t) : 0, f0 = same ? cur.t - RT[i0] : 0;
    var keep = { G: G, EV: EV, RT: RT, FR: FR, T_END: T_END, DIR: DIR };
    try { G = g; EV = g.events; TY = {}; buildTimeline(); DIR = {}; buildDirs(); buildFrames(); }
    catch (err) { G = keep.G; EV = keep.EV; RT = keep.RT; FR = keep.FR; T_END = keep.T_END; DIR = keep.DIR; stats.setGameFailed = (stats.setGameFailed || 0) + 1; throw err; }
    if (same) for (var j = Math.min(i0 + 1, FR.length - 1, keep.FR.length - 1); j >= 0; j--) { // a poll re-smooths: plays already watched keep their spots
      var a = keep.EV[j], b = EV[j], o = keep.FR[j].pos, f = FR[j];
      if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[5] === b[5] && a[6] === b[6]) f.ids.forEach(function (id) { if (o[id]) f.pos[id] = o[id]; }); // per player: a late sub keeps the new man's spot
    }
    sceneVer++; moments();
    if (!same) {
      buildCrowd(); startWipe(); cur.idx = -1; cur.dir = 1; cur.loop = null; attr('rpRev', 'aria-pressed', 'false'); attr('rpLoop', 'aria-pressed', 'false');
      cur.live = !!opts.live; seek(cur.live ? Math.max(0, headT() - 6) : 0); setPlaying(cur.live);
    } else {
      cur.t = Math.min(T_END, RT[Math.min(i0, RT.length - 1)] + f0); lastFxIdx = segAt(cur.t);
      if (opts.live === true && !cur.live) goLive();
    }
    var srcEl = $('rpSrc'); if (srcEl) srcEl.href = g.source;
    try{
      if(window.GameHeader){
        var ghEl=document.getElementById('gameHeader');
        if(ghEl&&g.teams&&g.teams.length>1){
          window.GameHeader.render(ghEl,{a:{abbr:g.teams[0].tri},h:{abbr:g.teams[1].tri},
            venue:'',when:g.date||'',state:g.final?'post':(g.live?'in':'pre')});
        }
      }
    }catch(e){}
    var asOf = $('rpAsOf');
    if (asOf) asOf.textContent = 'Game of ' + g.date + (g.final ? ' · final' : g.live ? ' · live, refreshed every 30 s' : ' · in progress when the feed was read') + ' · ' + EV.length + ' events' +
      (g.sourceSha256 ? ' · feed file sha256 ' + g.sourceSha256.slice(0, 12) + '…' : ' · from ' + (g.sourceName || 'the feed'));
    liveUi();
  }
  /* where following live holds: a beat after the newest play, so its shot finishes
     before the replay waits for the next one */
  function headT() { return RT.length ? Math.min(T_END, RT[RT.length - 1] + 1.8) : 0; }
  function liveUi() { var b = $('rpLive'); if (b) { b.setAttribute('aria-pressed', cur.live ? 'true' : 'false'); b.hidden = !G || !G.live; } }
  function goLive() { if (!G) return; snd('live'); cur.live = true; cur.dir = 1; cur.loop = null; attr('rpRev', 'aria-pressed', 'false'); attr('rpLoop', 'aria-pressed', 'false'); seek(Math.max(0, headT() - 6)); setPlaying(true); liveUi(); }
  function manual() { if (cur.live) { cur.live = false; var sp = $('rpSpeed'); if (sp) cur.speed = parseFloat(sp.value) || cur.speed; liveUi(); } }
  function loadGame(id) {
    return fetch(DATA + id + '.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (g) {
      setGame(g);
      document.querySelectorAll('.rp-game').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false'); });
      try { var u = new URL(location.href); u.searchParams.set('game', id); u.searchParams.delete('g'); u.searchParams.delete('espn'); history.replaceState(null, '', u); } catch (e) { /* ignore */ }
    }).catch(function () { if (nowEl) nowEl.textContent = 'This replay could not be loaded. Try another game or reload the page.'; });
  }
  /* ---------- tonight's games, from the same ESPN summary Courtside Live polls ----------
     Games the NBA-built files cover open from those; the rest (tonight, and any game the
     pipeline has not built yet) open from ESPN through assets/replay-espn.js. A live game
     is polled every 30 s and followed a play behind; nothing is polled once it is final. */
  var SB = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard', espnTimer = null, espnFails = 0, wantEspn = null;
  function etDay(offset) {
    var d = new Date(Date.now() + (offset || 0) * 864e5);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
  }
  function card(id, teams, score, meta, label, onClick) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'rp-game'; b.dataset.id = id; b.setAttribute('role', 'listitem'); b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span><i class="sw"></i></span><span></span><span><i class="sw"></i></span><span></span><span class="meta"></span>';
    var sp = b.children; sp[0].querySelector('i').style.background = teams[0].c; sp[0].appendChild(document.createTextNode(teams[0].tri)); sp[1].textContent = score[0];
    sp[2].querySelector('i').style.background = teams[1].c; sp[2].appendChild(document.createTextNode(teams[1].tri)); sp[3].textContent = score[1];
    sp[4].textContent = meta; b.setAttribute('aria-label', label); b.addEventListener('click', onClick);
    return b;
  }
  function pressed(id) { document.querySelectorAll('.rp-game').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false'); }); }
  function loadEspn(id, again) {
    clearTimeout(espnTimer); wantEspn = id;
    return fetch(window.ReplayESPN.summaryUrl(id)).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      if (wantEspn !== id) return;
      var g = window.ReplayESPN.toGame(d, id); if (!g) throw new Error('no plays yet');
      espnFails = 0;
      try { if (again) setGame(g, { keep: true }); else setGame(g, { live: g.live }); }
      catch (err) { if (nowEl && !again) nowEl.textContent = 'This game could not be replayed. Pick another.'; return; }
      pressed('espn-' + id);
      try { var u = new URL(location.href); u.searchParams.set('espn', id); u.searchParams.delete('g'); history.replaceState(null, '', u); } catch (e) { /* ignore */ }
      if (g.live) espnTimer = setTimeout(function () { loadEspn(id, true); }, 30000);
    }).catch(function () {
      if (wantEspn !== id) return;
      espnFails++;
      var wait = Math.min(300000, 30000 * Math.pow(2, Math.min(espnFails, 3)));
      if (again || (G && G.gameId === 'espn-' + id)) espnTimer = setTimeout(function () { loadEspn(id, true); }, wait);
      else { if (nowEl) nowEl.textContent = 'This game has no plays to replay yet. It will start here once the feed has them.'; espnTimer = setTimeout(function () { loadEspn(id); }, wait); }
    });
  }
  /* C2.1/T3.1: ESPN is now guard-lookup only — no cards. Returns [{id, state}]
     for today + yesterday so ?espn= deep links route through the 24h guard.
     All states are included (pre-games belong on /live too). */
  function espnLookup() {
    var days = [etDay(0), etDay(-1)];
    var none = { events: [] }, late = function (ms) { return new Promise(function (r) { setTimeout(function () { r(none); }, ms); }); };
    return Promise.all(days.map(function (day) { // 4 s each at most: the built games must not wait on ESPN
      return Promise.race([fetch(SB + '?dates=' + day).then(function (r) { return r.ok ? r.json() : none; }).catch(function () { return none; }), late(4000)]);
    })).then(function (res) {
      var out = [];
      res.forEach(function (sb) {
        (sb.events || []).forEach(function (e) {
          var st = e.status && e.status.type; if (!st) return;
          out.push({ id: e.id, state: st.state });
        });
      });
      return out;
    });
  }
  function boot() {
    var q = new URLSearchParams(location.search), wantG = q.get('game') || q.get('g'), wantE = q.get('espn');
    // G4/T4.1: possession links — seek to an event index, falling back to ?t= seconds.
    function applyDeepTime() {
      var pi = parseInt(q.get('possession'), 10);
      if (RT.length && pi >= 0 && pi < RT.length) { seek(RT[pi] + 0.1); return; }
      var tt = parseFloat(q.get('t')); if (tt > 0) seek(tt);
    }
    fetch(DATA + 'index.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (ix) {
      var box = $('rpGames'); box.innerHTML = '';
      // T3.1: the replay index is built games only. Tonight's games live on
      // Courtside Live — the link below replaces the old ESPN cards.
      var liveLink = document.createElement('a');
      liveLink.className = 'rp-live-link'; liveLink.href = 'live.html';
      liveLink.textContent = 'Tonight\u2019s games \u2192 Courtside Live';
      box.appendChild(liveLink);
      // Team filter.
      var triSet = {};
      ix.games.forEach(function (g) { triSet[g.teams[0].tri] = 1; triSet[g.teams[1].tri] = 1; });
      var tris = Object.keys(triSet).sort(), sel = null;
      if (tris.length > 1) {
        sel = document.createElement('select');
        sel.className = 'rp-filter'; sel.setAttribute('aria-label', 'Filter by team');
        sel.innerHTML = '<option value="">All teams</option>' +
          tris.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');
        box.appendChild(sel);
      }
      // Date-grouped built games (newborn games never reach the index: --min-age).
      function renderGroups() {
        var f = sel ? sel.value : '';
        box.querySelectorAll('.rp-dategroup').forEach(function (n) { n.remove(); });
        var groups = {}, order = [];
        ix.games.forEach(function (g) {
          if (f && g.teams[0].tri !== f && g.teams[1].tri !== f) return;
          if (!groups[g.date]) { groups[g.date] = []; order.push(g.date); }
          groups[g.date].push(g);
        });
        order.sort().reverse().forEach(function (date) {
          var gd = document.createElement('div'); gd.className = 'rp-dategroup';
          var h = document.createElement('h3'); h.textContent = date; gd.appendChild(h);
          groups[date].forEach(function (g) {
            gd.appendChild(card(g.gameId, g.teams, g.score, g.date + (g.final ? ' \u00b7 FINAL' : ' \u00b7 LIVE FEED') + ' \u00b7 NBA',
              g.teams[0].short + ' ' + g.score[0] + ' at ' + g.teams[1].short + ' ' + g.score[1] + ', ' + g.date,
              function () { clearTimeout(espnTimer); wantEspn = null; loadGame(g.gameId); }));
          });
          box.appendChild(gd);
        });
        if (!order.length) {
          var em = document.createElement('div'); em.className = 'rp-dategroup';
          em.innerHTML = '<p class="rp-muted">No built replays for this filter yet.</p>';
          box.appendChild(em);
        }
      }
      if (sel) sel.addEventListener('change', renderGroups);
      renderGroups();
      var built = ix.games.some(function (g) { return g.gameId === wantG; }) ? wantG : null;
      var startBuilt = function () { var pick = built || (ix.games[0] && ix.games[0].gameId); if (pick) loadGame(pick).then(function () { applyDeepTime(); }); };
      if (!window.ReplayESPN) { startBuilt(); return; }
      // C2.1: the 24h guard — a ?espn= for a live/recent/pre game belongs on /live.
      // espnLookup covers today + yesterday; anything older (or unknown) stays put.
      espnLookup().then(function (eg) {
        if (wantE && window.GameRoute) {
          var egHit = eg.filter(function (g) { return String(g.id) === String(wantE); })[0];
          var info = egHit ? { state: egHit.state, gameTimeMs: Date.now() - 3600e3 } : null;
          if (window.GameRoute.guard('replay', function () { return info; })) return;
        }
        if (window.GameRoute) window.GameRoute.notice('routeNotice');
        if (wantE) loadEspn(wantE).then(function () { applyDeepTime(); });
        else startBuilt();
      });
    }).catch(function () { $('rpGames').textContent = 'The game list could not be loaded.'; if (wantE && window.ReplayESPN) loadEspn(wantE); });
    requestAnimationFrame(tick);
  }

  on('rpPlay', 'click', function () { if (cur.live) { manual(); setPlaying(false); return; } if (!cur.playing && cur.t >= T_END) seek(0); setPlaying(!cur.playing); });
  on('rpBack', 'click', function () { manual(); seek(cur.t - 6); });
  on('rpFwd', 'click', function () { manual(); seek(cur.t + 6); });
  on('rpLive', 'click', goLive);
  on('rpRev', 'click', function () { manual(); cur.dir = -cur.dir; this.setAttribute('aria-pressed', cur.dir < 0 ? 'true' : 'false'); if (!cur.playing) setPlaying(true); });
  on('rpLoop', 'click', function () { manual(); cur.loop = cur.loop ? null : [Math.max(0, cur.t - 8), cur.t + 0.5]; this.setAttribute('aria-pressed', cur.loop ? 'true' : 'false'); if (cur.loop) { seek(cur.loop[0]); cur.dir = 1; setPlaying(true); } });
  // G4/T4.1: copy link to this possession at this timestamp:
  // ?game=&possession=&view=&t= reopens the replay at that moment.
  on('rpShare', 'click', function () {
    var btn = this;
    var done = function (msg) { var old = btn.textContent; btn.textContent = msg; setTimeout(function () { btn.textContent = old; }, 1800); };
    if (!G) { done('No game'); return; }
    var gid = G.gameId || '';
    var idPart = gid.indexOf('espn-') === 0 ? 'espn=' + encodeURIComponent(gid.slice(5)) : 'game=' + encodeURIComponent(gid);
    var poss = 0;
    try { poss = segAt(cur.t); } catch (e) {}
    var view = 'broadcast';
    try { var cb = document.querySelector('.rp-cams button.on'); if (cb && cb.dataset.cam) view = cb.dataset.cam; } catch (e) {}
    var url = location.origin + '/replay?' + idPart + '&possession=' + poss + '&view=' + encodeURIComponent(view) + '&t=' + Math.max(0, Math.round(cur.t));
    var ok = function () { done('Copied \u2713'); }, no = function () { done('Copy failed'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, no);
      else no();
    } catch (e) { no(); }
  });
  on('rpSpeed', 'change', function () { cur.speed = parseFloat(this.value) || 2; });
  on('rpCondense', 'change', function () { if (!G) return; var i = segAt(cur.t); condensed = this.checked; buildTimeline(); seek(RT[i]); moments(); });
  on('rpScrub', 'input', function () { manual(); seek(this.value / 1000 * T_END); });
  document.querySelectorAll('.rp-cams button').forEach(function (b) {
    b.addEventListener('click', function () {
      var pr = PRESETS[b.dataset.cam]; cam.follow = !!pr.follow;
      camGoal = { t0: performance.now(), from: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, fov: cam.fov, tx: cam.tx, ty: cam.ty }, to: pr };
      document.querySelectorAll('.rp-cams button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    });
  });
  var wantCam = new URLSearchParams(location.search).get('view') || new URLSearchParams(location.search).get('cam'); // ?view=follow shares a camera
  if (PRESETS.hasOwnProperty(wantCam)) document.querySelectorAll('.rp-cams button').forEach(function (b) { if (b.dataset.cam === wantCam) b.click(); });
  document.querySelectorAll('.rp-filter button').forEach(function (b) {
    b.addEventListener('click', function () { filter = b.dataset.f; document.querySelectorAll('.rp-filter button').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); renderMoments(); });
  });
  var ptrs = {}, pinch = 0;
  cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = [e.clientX, e.clientY]; camGoal = null; });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return; var ids = Object.keys(ptrs);
    if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; ptrs[e.pointerId] = [e.clientX, e.clientY]; var d = Math.hypot(ptrs[ids[0]][0] - ptrs[ids[1]][0], ptrs[ids[0]][1] - ptrs[ids[1]][1]); if (pinch) cam.dist = Math.max(20, Math.min(140, cam.dist * pinch / d)); pinch = d; return; }
    var p = ptrs[e.pointerId], dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs[e.pointerId] = [e.clientX, e.clientY];
    cam.yaw -= dx * 0.009; cam.pitch = Math.max(0.12, Math.min(1.5, cam.pitch + dy * 0.006));
  });
  function up(e) { delete ptrs[e.pointerId]; pinch = 0; }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); cam.dist = Math.max(20, Math.min(140, cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  document.addEventListener('keydown', function (e) {
    var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'SELECT' || tg === 'TEXTAREA') return;
    if (tg === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (EMBED && !(cv.closest && cv.closest('.rp-embed') && cv.closest('.rp-embed').contains(document.activeElement))) return; // the live page owns its own keys
    if (e.key === ' ' && playBtn) { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); manual(); seek(cur.t - 6); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); manual(); seek(cur.t + 6); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); camGoal = null; cam.pitch = Math.max(0.12, Math.min(1.5, cam.pitch - 0.08)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); camGoal = null; cam.pitch = Math.max(0.12, Math.min(1.5, cam.pitch + 0.08)); }
    else if ((e.key === 'l' || e.key === 'L') && $('rpLoop')) $('rpLoop').click();
    else if (/^[1-5]$/.test(e.key)) { var bs = document.querySelectorAll('.rp-cams button'); if (bs[+e.key - 1]) bs[+e.key - 1].click(); }
  });
  window.PixelReplay = { load: loadGame, setGame: setGame, goLive: goLive, seek: seek, play: function (on) { setPlaying(on !== false); }, state: cur, speed: function (x) { cur.speed = x; }, stats: stats, teamTints: teamTints,
    /* hold on event i (the live page's rewind scrubber) */
    seekEvent: function (i) { if (!G || !RT.length) return; manual(); seek(RT[Math.max(0, Math.min(RT.length - 1, i))] + 1.6); setPlaying(false); },
    game: function () { return G; }, frames: function () { return FR; } };
  /* the coordinate model loads after the page; when it lands, the current game's frames are rebuilt with it */
  if (window.ReplayModel && !/[?&]model=0(&|$)/.test(location.search)) {
    var rolesP = window.ReplayRoles ? fetch('/assets/replay_roles.json?v=cc918287').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) { window.ReplayRoles._init(doc); }).catch(function () { /* the model runs without roles */ }) : null;
    fetch('/assets/replay-model.json?v=dc42490a').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (doc) {
      return Promise.resolve(rolesP).then(function () { return doc; });
    }).then(function (doc) {
      window.ReplayModel._init(doc); stats.model.ready = 1;
      if (G) { var keepFR = FR; try { buildFrames(); sceneVer++; } catch (err) { FR = keepFR; stats.model.failed++; } } // RT is unchanged, so the playhead stays put
    }).catch(function () { /* formations stay */ });
  }
  loadSprites();
  if (EMBED) requestAnimationFrame(tick); // the host page hands games in through setGame
  else boot();
})();
