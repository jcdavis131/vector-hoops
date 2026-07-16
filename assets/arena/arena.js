/* Vector Hoops — arena.js
 * The daily game: one real player-season shown only as model output
 * (constellation position, archetype pull, skill DNA). Name the player in 6.
 *
 * Data contract: assets/arena/core.json + rows.bin (34 B/row, layout stated
 * in core.json) + emb_q8.bin (int8 48-d MTNN embeddings, lazy). Every number
 * shown here is recomputable from those files; pipeline/test_arena.py gates
 * them against the source assets.
 */
(function () {
  "use strict";

  var ROW_BYTES = 34;
  var EMB_DIM = 48;
  var MAX_GUESSES = 6;
  var LS = {
    daily: "vh.arena.daily",
    stats: "vh.arena.stats",
    practice: "vh.arena.practice",
    seen: "vh.arena.seen",
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- state ----------
  var core = null;          // core.json
  var rows = null;          // decoded typed arrays
  var emb = null;           // Int8Array n*48
  var embNorm = null;       // Float32Array n (L2 norms of int8 rows)
  var embReady = null;      // promise
  var playerRows = null;    // nameIdx -> [rowIdx...]
  var game = null;          // active game (daily or practice)
  var simsToTarget = null;  // Float32Array n, cosine of every row vs target
  var rankOrder = null;     // sims sorted ascending, for percentile
  var sky = null;           // renderer handle
  var practiceNonce = (Date.now() ^ 0x2f6e2b1) >>> 0;

  // ---------- utils ----------
  function lsGet(k) {
    try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ }
  }
  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "");
  }
  function seasonYear(s) { return parseInt(s.slice(0, 4), 10); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function toast(msg) {
    var t = el("div", "toast", msg);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // warmth: percentile 0-100 -> color / emoji. Muted ramp: grey by default,
  // color only shows up as you get close (mirrors arena.css tokens).
  var WSTOPS = [
    [0, 0x7a, 0x9a, 0xb5], [70, 0x8f, 0x93, 0x9e],
    [92, 0xd9, 0xa9, 0x4a], [99, 0xc1, 0x7b, 0x5e], [100.001, 0xc1, 0x7b, 0x5e],
  ];
  function warmthColor(p, won) {
    if (won) return "#d9a94a";
    for (var i = 1; i < WSTOPS.length; i++) {
      if (p <= WSTOPS[i][0]) {
        var a = WSTOPS[i - 1], b = WSTOPS[i];
        var t = (p - a[0]) / (b[0] - a[0]);
        var mix = function (x, y) { return Math.round(x + (y - x) * t); };
        return "rgb(" + mix(a[1], b[1]) + "," + mix(a[2], b[2]) + "," + mix(a[3], b[3]) + ")";
      }
    }
    return "#c17b5e";
  }
  function warmthEmoji(p, won) {
    if (won) return "🎯";                       // dart
    if (p < 70) return "❄️";                    // snowflake
    if (p < 90) return "🧊";                    // ice
    if (p < 97) return "🌡️";              // thermometer
    return "🔥";                                // fire
  }

  // ---------- data ----------
  function decodeRows(buf, n) {
    var dv = new DataView(buf);
    var r = {
      nameIdx: new Uint16Array(n), season: new Uint8Array(n),
      pos: new Uint8Array(n), gc: new Uint8Array(n), mtop: new Uint8Array(n),
      tags: new Uint8Array(n), gp: new Uint8Array(n),
      x: new Float32Array(n), y: new Float32Array(n),
      skills: new Uint8Array(n * 12), pulls: new Uint8Array(n * 8),
    };
    for (var i = 0; i < n; i++) {
      var o = i * ROW_BYTES;
      r.nameIdx[i] = dv.getUint16(o, true);
      r.season[i] = dv.getUint8(o + 2);
      r.pos[i] = dv.getUint8(o + 3);
      r.gc[i] = dv.getUint8(o + 4);
      r.mtop[i] = dv.getUint8(o + 5);
      r.tags[i] = dv.getUint8(o + 6);
      r.gp[i] = dv.getUint8(o + 7);
      r.x[i] = dv.getUint16(o + 8, true) / 65535;
      r.y[i] = dv.getUint16(o + 10, true) / 65535;
      for (var j = 0; j < 12; j++) r.skills[i * 12 + j] = dv.getUint8(o + 14 + j);
      for (var k = 0; k < 8; k++) r.pulls[i * 8 + k] = dv.getUint8(o + 26 + k);
    }
    return r;
  }

  function loadEmbeddings() {
    if (embReady) return embReady;
    embReady = fetch("assets/arena/emb_q8.bin")
      .then(function (r) {
        if (!r.ok) throw new Error("emb fetch " + r.status);
        return r.arrayBuffer();
      })
      .then(function (buf) {
        emb = new Int8Array(buf);
        var n = core.rows;
        embNorm = new Float32Array(n);
        for (var i = 0; i < n; i++) {
          var s = 0, o = i * EMB_DIM;
          for (var d = 0; d < EMB_DIM; d++) s += emb[o + d] * emb[o + d];
          embNorm[i] = Math.sqrt(s) || 1;
        }
      });
    return embReady;
  }

  function cosine(a, b) {
    var s = 0, oa = a * EMB_DIM, ob = b * EMB_DIM;
    for (var d = 0; d < EMB_DIM; d++) s += emb[oa + d] * emb[ob + d];
    return s / (embNorm[a] * embNorm[b]);
  }

  function computeTargetSims(target) {
    var n = core.rows;
    simsToTarget = new Float32Array(n);
    for (var i = 0; i < n; i++) simsToTarget[i] = cosine(i, target);
    rankOrder = Float32Array.from(simsToTarget);
    rankOrder.sort();
  }

  // percentile of a similarity value among all rows (higher = closer)
  function percentile(sim) {
    var lo = 0, hi = rankOrder.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (rankOrder[mid] < sim) lo = mid + 1; else hi = mid;
    }
    return (lo / rankOrder.length) * 100;
  }

  function bestRowForPlayer(nameIdx) {
    var list = playerRows[nameIdx], best = list[0], bs = -2;
    for (var i = 0; i < list.length; i++) {
      var s = simsToTarget[list[i]];
      if (s > bs) { bs = s; best = list[i]; }
    }
    return best;
  }

  function neighborhood(target, count) {
    var idx = [];
    for (var i = 0; i < core.rows; i++) {
      if (i !== target && rows.nameIdx[i] !== rows.nameIdx[target]) idx.push(i);
    }
    idx.sort(function (a, b) { return simsToTarget[b] - simsToTarget[a]; });
    var seen = {}, out = [];
    for (var j = 0; j < idx.length && out.length < count; j++) {
      var ni = rows.nameIdx[idx[j]];
      if (seen[ni]) continue;
      seen[ni] = 1;
      out.push(idx[j]);
    }
    return out;
  }

  // ---------- sky (constellation renderer) ----------
  function makeSky(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var W = 0, H = 0, base = null;
    // Muted per-archetype tint: dark and low-contrast against the night
    // background so the field reads as grey texture, with just enough
    // hue variety to tell the 8 clusters apart up close. Real color is
    // spent on the beacon and guess feedback, not the ambient field.
    var ARCH_COLORS = [
      "#453d5c", "#3d5c57", "#645640", "#5a3f50",
      "#65473e", "#3d4b5c", "#3f5a49", "#625c41",
    ];
    var PAD = 0.03;
    function px(v) { return (PAD + v * (1 - 2 * PAD)) * W; }
    function py(v) { return (PAD + (1 - v) * (1 - 2 * PAD)) * H; }

    function buildBase() {
      base = document.createElement("canvas");
      base.width = W * dpr; base.height = H * dpr;
      var c = base.getContext("2d");
      c.scale(dpr, dpr);
      for (var i = 0; i < core.rows; i++) {
        c.fillStyle = ARCH_COLORS[rows.gc[i]];
        c.globalAlpha = 0.9;
        c.fillRect(px(rows.x[i]), py(rows.y[i]), 1.25, 1.25);
      }
    }

    function resize() {
      var w = canvas.clientWidth || canvas.parentNode.clientWidth;
      if (!w) return;
      W = w; H = Math.round(w * 0.92);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.height = H + "px";
      buildBase();
    }

    var ctx = canvas.getContext("2d");
    var t0 = performance.now();
    var neighbors = [];
    var burst = 0; // reveal burst start time

    function draw(now) {
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0, W, H);
      if (!game) return;
      var t = game.target;
      var tx = px(rows.x[t]), ty = py(rows.y[t]);
      var time = (now - t0) / 1000;

      // anonymous asterism: the target's true craft neighborhood
      ctx.strokeStyle = "rgba(217,169,74,0.16)";
      ctx.lineWidth = 1;
      for (var a = 0; a < neighbors.length; a++) {
        var nx = px(rows.x[neighbors[a]]), ny = py(rows.y[neighbors[a]]);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.fillStyle = "rgba(217,169,74,0.5)";
        ctx.beginPath(); ctx.arc(nx, ny, 1.8, 0, 7); ctx.fill();
      }

      // guess dots + traces
      for (var g = 0; g < game.guesses.length; g++) {
        var gg = game.guesses[g];
        if (gg.row === t && !game.won) continue;
        var gx = px(rows.x[gg.row]), gy = py(rows.y[gg.row]);
        var col = warmthColor(gg.pct, gg.hit);
        ctx.strokeStyle = col; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(gx, gy, 3.4, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(21,23,28,0.9)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(gx, gy, 3.4, 0, 7); ctx.stroke();
      }

      // the beacon
      var pulse = reducedMotion ? 0.5 : (time % 1.8) / 1.8;
      ctx.fillStyle = game.done && game.won ? "#7fa88f" : "#d9a94a";
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(tx, ty, 4.2, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = game.done && game.won
        ? "rgba(127,168,143," + (1 - pulse) * 0.8 + ")"
        : "rgba(217,169,74," + (1 - pulse) * 0.8 + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tx, ty, 5 + pulse * 16, 0, 7); ctx.stroke();

      if (burst && now - burst < 1400) {
        var bt = (now - burst) / 1400;
        ctx.strokeStyle = "rgba(217,169,74," + (1 - bt) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, ty, bt * W * 0.5, 0, 7); ctx.stroke();
      }
    }

    var raf = null;
    function loop(now) {
      draw(now);
      if (!reducedMotion && !document.hidden) raf = requestAnimationFrame(loop);
      else raf = null;
    }
    // Draw synchronously, then animate. rAF alone never fires in a hidden
    // tab, which would leave the board blank for background-tab opens.
    // Layout can also lag the boot fetch on cold loads, so re-measure
    // whenever the canvas and our cached width disagree.
    function kick() {
      if ((canvas.clientWidth || 0) !== W) resize();
      draw(performance.now());
      if (!raf && !reducedMotion) raf = requestAnimationFrame(loop);
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) kick();
    });
    if (reducedMotion) {
      // static: draw on demand only
      kick();
      setInterval(function () { draw(performance.now()); }, 900);
    }

    window.addEventListener("resize", function () { resize(); kick(); });
    window.addEventListener("load", function () { resize(); kick(); });
    resize();
    kick();
    if (!W) {
      var tries = 0;
      var probe = setInterval(function () {
        if (W || ++tries > 40) { clearInterval(probe); }
        if (!W) { resize(); kick(); }
      }, 100);
    }

    var api = {
      setNeighbors: function (list) { neighbors = list; kick(); },
      burst: function () { burst = performance.now(); kick(); },
      redraw: kick,
      resize: resize,
      pause: function () { if (raf) { cancelAnimationFrame(raf); raf = null; } },
      resume: kick,
    };
    window.__vhSky = api; // debug/testing handle
    return api;
  }

  // ---------- game setup ----------
  function currentDay() {
    return ArenaDaily.dayNumber(core.epoch, Date.now());
  }

  function newGame(mode) {
    var day = currentDay();
    var target;
    if (mode === "daily") {
      var saved = lsGet(LS.daily);
      if (saved && saved.day === day) {
        game = saved;
        game.mode = "daily";
        return;
      }
      target = ArenaDaily.pickDaily(core.pool, day);
    } else {
      practiceNonce = (practiceNonce * 1664525 + 1013904223) >>> 0;
      target = ArenaDaily.pickFree(core.pool, practiceNonce);
    }
    game = {
      mode: mode, day: day, target: target,
      guesses: [], done: false, won: false,
    };
    if (mode === "daily") lsSet(LS.daily, game);
  }

  function saveGame() {
    if (game.mode === "daily") lsSet(LS.daily, game);
  }

  // ---------- rendering: static target panels ----------
  function renderRead() {
    var wrap = $("arch-rows");
    wrap.textContent = "";
    var t = game.target;
    var pulls = [];
    for (var k = 0; k < 8; k++) {
      pulls.push([k, rows.pulls[t * 8 + k] / 127.5 - 1]);
    }
    pulls.sort(function (a, b) { return b[1] - a[1]; });
    for (var i = 0; i < 4; i++) {
      var row = el("div", "arch-row" + (i === 0 ? " top" : ""));
      row.appendChild(el("span", "lbl", core.clusters[pulls[i][0]]));
      var bar = el("div", "bar");
      var fill = el("i");
      fill.style.width = Math.max(3, (pulls[i][1] + 1) / 2 * 100) + "%";
      fill.style.animationDelay = (i * 90) + "ms";
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el("span", "val", pulls[i][1].toFixed(2)));
      wrap.appendChild(row);
    }
  }

  function renderDNA() {
    var wrap = $("dna");
    wrap.textContent = "";
    var t = game.target;
    for (var j = 0; j < 12; j++) {
      var g = rows.skills[t * 12 + j];
      var d = core.skillDefs[j];
      var cls = "sk" + (g >= core.goldGrade ? " gold" : g >= core.badgeGrade ? " badge" : "");
      var sk = el("div", cls);
      sk.appendChild(el("span", "g", String(g)));
      var col = el("div", "col");
      var fill = el("i");
      fill.style.height = Math.max(4, g / 99 * 100) + "%";
      fill.style.animationDelay = (j * 45) + "ms";
      col.appendChild(fill);
      sk.appendChild(col);
      sk.appendChild(el("span", "k", d.key === "efficiency" ? "eff" :
        d.key === "playmaking" ? "play" : d.key === "security" ? "sec" :
        d.key === "finishing" ? "fin" : d.key === "shooting" ? "3pt" :
        d.key === "scoring" ? "pts" : d.key));
      sk.title = d.label + " — " + g;
      wrap.appendChild(sk);
    }
    $("vital-gp").textContent = rows.gp[game.target];
  }

  // ---------- hints ----------
  function hintDefs() {
    var t = game.target;
    var year = seasonYear(core.seasons[rows.season[t]]);
    var name = core.players[rows.nameIdx[t]];
    var last = name.split(" ").slice(-1)[0] || name;
    var hon = core.honors[String(t)];
    var extra;
    if (hon && hon[2]) extra = "Finals MVP that season";
    else if (hon && hon[1]) extra = "All-NBA that season";
    else if (hon && hon[0]) extra = "All-Star that season";
    else {
      var tags = [];
      for (var b = 0; b < core.tagOrder.length; b++) {
        if (rows.tags[t] & (1 << b)) tags.push(core.tagLabels[core.tagOrder[b]]);
      }
      extra = tags.length ? tags[0] : "no All-Star nod that season";
    }
    return [
      { after: 2, label: "Decade", value: Math.floor(year / 10) * 10 + "s" },
      { after: 3, label: "Position", value: rows.pos[t] < 5 ? core.positions[rows.pos[t]] : "unlisted" },
      { after: 4, label: "Season", value: core.seasons[rows.season[t]] },
      { after: 5, label: "Intel", value: last[0] + "․ " + extra },
    ];
  }

  function renderIntel() {
    var wrap = $("intel");
    wrap.textContent = "";
    var misses = game.guesses.filter(function (g) { return !g.hit; }).length;
    hintDefs().forEach(function (h) {
      if (game.done && !game.won) misses = MAX_GUESSES;
      if (misses >= h.after) {
        var c = el("span", "chip");
        c.appendChild(el("span", "", h.label + ": "));
        c.appendChild(el("b", "", h.value));
        wrap.appendChild(c);
      } else if (!game.done) {
        wrap.appendChild(el("span", "chip locked",
          "🔒 " + h.label.toLowerCase() + " after miss " + h.after));
      }
    });
  }

  // ---------- guesses ----------
  function renderGuessCount() {
    var wrap = $("guess-count");
    wrap.textContent = "";
    for (var i = 0; i < MAX_GUESSES; i++) {
      var dot = el("i");
      if (i < game.guesses.length) {
        dot.className = game.guesses[i].hit ? "win" : "used";
      }
      wrap.appendChild(dot);
    }
  }

  function factChips(g) {
    var t = game.target;
    var out = [];
    var gy = seasonYear(core.seasons[rows.season[g.row]]);
    var ty = seasonYear(core.seasons[rows.season[t]]);
    if (gy === ty) out.push(["same season year", "yes"]);
    else out.push([ty > gy ? "▲ later era" : "▼ earlier era", ""]);
    if (rows.pos[g.row] < 5 && rows.pos[t] < 5) {
      var dp = Math.abs(rows.pos[g.row] - rows.pos[t]);
      if (dp === 0) out.push(["✓ " + core.positions[rows.pos[t]], "yes"]);
      else if (dp === 1) out.push(["~ position close", "near"]);
      else out.push(["✗ position", ""]);
    }
    if (rows.mtop[g.row] === rows.mtop[t]) out.push(["✓ same model read", "yes"]);
    else out.push(["✗ model read", ""]);
    return out;
  }

  function renderGuesses() {
    var wrap = $("guesses");
    wrap.textContent = "";
    for (var i = game.guesses.length - 1; i >= 0; i--) {
      var g = game.guesses[i];
      var row = el("div", "guess-row");
      var col = warmthColor(g.pct, g.hit);
      row.style.setProperty("--w", col);
      var nm = el("div", "guess-name", core.players[rows.nameIdx[g.row]]);
      var sm = el("small", "", core.seasons[rows.season[g.row]]);
      nm.appendChild(sm);
      row.appendChild(nm);
      var w = el("div", "guess-warmth");
      w.style.setProperty("--w", col);
      w.textContent = g.hit ? "🎯" : g.pct.toFixed(1);
      var wl = el("small", "", g.hit ? "got it" : "warmth");
      w.appendChild(wl);
      row.appendChild(w);
      var facts = el("div", "guess-facts");
      if (!g.hit) {
        factChips(g).forEach(function (f) {
          facts.appendChild(el("span", "f " + f[1], f[0]));
        });
      } else {
        facts.appendChild(el("span", "f yes", "named in " + game.guesses.length));
      }
      row.appendChild(facts);
      wrap.appendChild(row);
    }
  }

  function announce(msg) { $("aria-live").textContent = msg; }

  function submitGuess(nameIdx) {
    if (game.done) return;
    for (var i = 0; i < game.guesses.length; i++) {
      if (rows.nameIdx[game.guesses[i].row] === nameIdx) {
        toast("Already guessed " + core.players[nameIdx]);
        return;
      }
    }
    var hit = nameIdx === rows.nameIdx[game.target];
    var row = hit ? game.target : bestRowForPlayer(nameIdx);
    var sim = simsToTarget[row];
    var pct = hit ? 100 : Math.min(percentile(sim), 99.9);
    game.guesses.push({ row: row, pct: Math.round(pct * 10) / 10, hit: hit });
    if (hit) {
      game.done = true; game.won = true;
    } else if (game.guesses.length >= MAX_GUESSES) {
      game.done = true; game.won = false;
    }
    saveGame();
    if (game.done) finishGame();
    renderGuesses();
    renderGuessCount();
    renderIntel();
    sky.redraw();
    if (hit) {
      sky.burst();
      announce("Correct: " + core.players[nameIdx]);
    } else {
      announce(core.players[nameIdx] + ": warmth " + pct.toFixed(1) + " of 100");
    }
    $("guess-input").value = "";
    renderSuggest("");
  }

  // ---------- finish / reveal ----------
  function statsBump() {
    if (game.mode !== "daily") {
      var p = lsGet(LS.practice) || { played: 0, wins: 0 };
      p.played += 1; if (game.won) p.wins += 1;
      lsSet(LS.practice, p);
      return;
    }
    var s = lsGet(LS.stats) ||
      { played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: 0, dist: [0, 0, 0, 0, 0, 0] };
    if (s.lastDay === game.day) return; // already counted (restored)
    s.played += 1;
    if (game.won) {
      s.wins += 1;
      s.streak = (s.lastWinDay === game.day - 1) ? s.streak + 1 : 1;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      s.lastWinDay = game.day;
      s.dist[game.guesses.length - 1] += 1;
    } else {
      s.streak = 0;
    }
    s.lastDay = game.day;
    lsSet(LS.stats, s);
    renderStreakChip();
  }

  function shareText() {
    var head = game.mode === "daily"
      ? "Vector Hoops #" + game.day
      : "Vector Hoops (practice)";
    var score = (game.won ? game.guesses.length : "X") + "/" + MAX_GUESSES;
    var trail = game.guesses.map(function (g) {
      return warmthEmoji(g.pct, g.hit);
    }).join("");
    if (!game.won) trail += "❌";
    return head + " · " + score + "\n" + trail + "\nhoops.dumbmodel.com";
  }

  function finishGame() {
    statsBump();
    var t = game.target;
    $("rv-kicker").textContent = game.won
      ? "Named in " + game.guesses.length : "The board wins";
    $("rv-kicker").className = "reveal-kicker " + (game.won ? "won" : "lost");
    $("rv-name").textContent = core.players[rows.nameIdx[t]];
    var sub = core.seasons[rows.season[t]] + " · " +
      (rows.pos[t] < 5 ? core.positions[rows.pos[t]] + " · " : "") +
      "read: " + core.clusters[rows.mtop[t]];
    var hon = core.honors[String(t)];
    if (hon) {
      var bits = [];
      if (hon[0]) bits.push("All-Star");
      if (hon[1]) bits.push("All-NBA");
      if (hon[2]) bits.push("Finals MVP");
      if (bits.length) sub += " · " + bits.join(" · ");
    }
    $("rv-sub").innerHTML = "";
    $("rv-sub").appendChild(document.createTextNode(sub));
    // badges
    var bs = $("rv-badges");
    bs.textContent = "";
    for (var j = 0; j < 12; j++) {
      var g = rows.skills[t * 12 + j];
      if (g >= core.badgeGrade) {
        bs.appendChild(el("span", "", core.skillDefs[j].badge + " " + g));
      }
    }
    // neighbors
    var nb = neighborhood(t, 5);
    var list = $("rv-neighbors");
    list.textContent = "";
    nb.forEach(function (r) {
      var li = el("li");
      li.appendChild(el("span", "",
        core.players[rows.nameIdx[r]] + " ’" + core.seasons[rows.season[r]].slice(2, 4)));
      li.appendChild(el("small", "", (simsToTarget[r] * 100).toFixed(0) + "% cos"));
      list.appendChild(li);
    });
    $("rv-trail").textContent = shareText().split("\n")[1];
    startCountdown();
    setTimeout(function () { openSheet("ov-reveal"); }, game.won ? 900 : 600);
  }

  function startCountdown() {
    var elc = $("rv-countdown");
    function tick() {
      var now = new Date();
      var next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      var ms = next - now.getTime();
      var h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60,
          s = Math.floor(ms / 1000) % 60;
      elc.innerHTML = "next mystery in <b>" +
        String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" +
        String(s).padStart(2, "0") + "</b>";
    }
    tick();
    clearInterval(startCountdown.t);
    startCountdown.t = setInterval(tick, 1000);
  }

  // ---------- suggest ----------
  var suggestHi = -1;
  function renderSuggest(q) {
    var wrap = $("suggest");
    wrap.textContent = "";
    suggestHi = -1;
    var s = norm(q.trim());
    if (s.length < 2) return;
    if (!simsToTarget) {
      var wait = el("button", "done");
      wait.type = "button";
      wait.disabled = true;
      wait.textContent = "Warming up the similarity space…";
      wrap.appendChild(wait);
      return;
    }
    var scored = [];
    for (var i = 0; i < core.players.length; i++) {
      var pn = playerNorms[i];
      var rank = pn.startsWith(s) ? 0 : pn.indexOf(" " + s) >= 0 ? 1 :
        pn.indexOf(s) >= 0 ? 2 : -1;
      if (rank >= 0) scored.push([rank, -playerRows[i].length, i]);
    }
    scored.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1] ||
        core.players[a[2]].localeCompare(core.players[b[2]]);
    });
    var guessed = {};
    game.guesses.forEach(function (g) { guessed[rows.nameIdx[g.row]] = 1; });
    scored.slice(0, 8).forEach(function (t) {
      var i = t[2];
      var b = el("button", guessed[i] ? "done" : "");
      b.type = "button";
      b.appendChild(el("span", "", core.players[i]));
      var list = playerRows[i];
      var first = core.seasons[rows.season[list[0]]].slice(0, 4);
      var last = core.seasons[rows.season[list[list.length - 1]]].slice(0, 4);
      b.appendChild(el("small", "", list.length + " season" +
        (list.length > 1 ? "s · " + first + "–" + last : " · " + first)));
      b.addEventListener("click", function () {
        if (guessed[i]) { toast("Already guessed"); return; }
        submitGuess(i);
      });
      wrap.appendChild(b);
    });
  }

  // ---------- modals ----------
  function openSheet(id) {
    $(id).hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheets() {
    ["ov-intro", "ov-help", "ov-stats", "ov-reveal"].forEach(function (id) {
      $(id).hidden = true;
    });
    document.body.style.overflow = "";
  }

  function renderStats() {
    var s = lsGet(LS.stats) ||
      { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] };
    $("st-played").textContent = s.played;
    $("st-win").textContent = s.played ? Math.round(s.wins / s.played * 100) + "%" : "–";
    $("st-streak").textContent = s.streak;
    $("st-max").textContent = s.maxStreak;
    var d = $("st-dist");
    d.textContent = "";
    var mx = Math.max.apply(null, s.dist.concat([1]));
    for (var i = 0; i < 6; i++) {
      var row = el("div", "dist-row" +
        (game && game.done && game.won && game.mode === "daily" &&
         game.guesses.length === i + 1 ? " me" : ""));
      row.appendChild(el("span", "", String(i + 1)));
      var bar = el("div", "bar");
      var fill = el("i", "", String(s.dist[i]));
      fill.style.width = Math.max(9, s.dist[i] / mx * 100) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);
      d.appendChild(row);
    }
    var p = lsGet(LS.practice);
    $("st-practice").textContent = p
      ? "Practice: " + p.wins + "/" + p.played + " solved" : "";
  }

  function renderStreakChip() {
    var s = lsGet(LS.stats);
    var c = $("streak-chip");
    if (s && s.streak > 1) {
      c.textContent = "🔥" + s.streak;
      c.hidden = false;
    } else c.hidden = true;
  }

  // ---------- practice / day chip ----------
  function renderDayChip() {
    var c = $("day-chip");
    if (game.mode === "daily") {
      c.textContent = "#" + game.day;
      c.className = "day-chip";
      c.title = "Daily mystery";
    } else {
      c.textContent = "practice";
      c.className = "day-chip practice";
      c.title = "Practice — tap to return to the daily";
    }
  }

  function startRound(mode) {
    closeSheets();
    newGame(mode);
    renderDayChip();
    renderRead();
    renderDNA();
    renderIntel();
    renderGuessCount();
    $("guesses").textContent = "";
    loadEmbeddings().then(function () {
      computeTargetSims(game.target);
      // restored daily games need their sims recomputed before rendering
      game.guesses.forEach(function (g) {
        if (!g.hit) g.pct = Math.min(Math.round(percentile(simsToTarget[g.row]) * 10) / 10, 99.9);
      });
      renderGuesses();
      renderIntel();
      sky.setNeighbors(neighborhood(game.target, 5));
      if (game.done && !$("ov-reveal").dataset.shown) {
        $("ov-reveal").dataset.shown = "1";
        finishGame();
      }
    }).catch(function (e) {
      toast("Similarity data failed to load — retrying");
      embReady = null;
      setTimeout(function () { startRound(mode); }, 1500);
    });
    sky.redraw();
  }

  // ---------- boot ----------
  var playerNorms = null;

  function boot() {
    Promise.all([
      fetch("assets/arena/core.json").then(function (r) { return r.json(); }),
      fetch("assets/arena/rows.bin").then(function (r) { return r.arrayBuffer(); }),
    ]).then(function (res) {
      core = res[0];
      rows = decodeRows(res[1], core.rows);
      playerRows = [];
      for (var i = 0; i < core.players.length; i++) playerRows.push([]);
      for (var r = 0; r < core.rows; r++) playerRows[rows.nameIdx[r]].push(r);
      playerNorms = core.players.map(norm);
      $("sky-count").textContent =
        core.rows.toLocaleString() + " seasons · " +
        core.seasons[0].slice(0, 4) + "–" + core.seasons[core.seasons.length - 1].slice(0, 4);
      sky = makeSky($("sky"));
      loadEmbeddings();
      startRound("daily");
      renderStreakChip();
      if (!lsGet(LS.seen)) openSheet("ov-intro");
      // rollover watch: never swap a live board (A5); offer, don't force
      setInterval(function () {
        if (game.mode === "daily" && game.done && currentDay() !== game.day &&
            !$("day-chip").dataset.newday) {
          $("day-chip").dataset.newday = "1";
          $("day-chip").textContent = "new mystery →";
        }
      }, 30000);
    }).catch(function (e) {
      document.querySelector(".app").insertAdjacentHTML("beforeend",
        "<p style='color:#8f939e'>Couldn’t load the board (" + e.message +
        "). Refresh to retry.</p>");
    });

    // input events
    var input = $("guess-input");
    input.addEventListener("input", function () { renderSuggest(input.value); });
    input.addEventListener("keydown", function (ev) {
      var btns = $("suggest").querySelectorAll("button");
      if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        ev.preventDefault();
        if (!btns.length) return;
        suggestHi = ev.key === "ArrowDown"
          ? (suggestHi + 1) % btns.length
          : (suggestHi - 1 + btns.length) % btns.length;
        btns.forEach(function (b, i) { b.classList.toggle("hi", i === suggestHi); });
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (btns.length) btns[suggestHi >= 0 ? suggestHi : 0].click();
      } else if (ev.key === "Escape") {
        renderSuggest("");
      }
    });

    $("btn-help").addEventListener("click", function () { openSheet("ov-help"); });
    $("btn-stats").addEventListener("click", function () {
      renderStats(); openSheet("ov-stats");
    });
    $("day-chip").addEventListener("click", function () {
      if ($("day-chip").dataset.newday) {
        delete $("day-chip").dataset.newday;
        lsSet(LS.daily, null);
        startRound("daily");
      } else if (game.mode === "practice") {
        startRound("daily");
      }
    });
    $("intro-play").addEventListener("click", function () {
      lsSet(LS.seen, 1); closeSheets(); $("guess-input").focus();
    });
    $("rv-share").addEventListener("click", function () {
      var text = shareText();
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          toast("Result copied — paste it anywhere");
        });
      }
    });
    $("rv-practice").addEventListener("click", function () {
      $("ov-reveal").dataset.shown = "";
      startRound("practice");
    });
    $("rv-close").addEventListener("click", closeSheets);
    document.querySelectorAll(".overlay").forEach(function (ov) {
      ov.addEventListener("click", function (ev) {
        if (ev.target === ov && ov.id !== "ov-intro") closeSheets();
      });
    });
    document.querySelectorAll(".sheet .close").forEach(function (b) {
      b.addEventListener("click", closeSheets);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else boot();
})();
