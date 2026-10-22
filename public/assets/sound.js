/* assets/sound.js: site music and sound effects, synthesized with WebAudio. No samples,
   files or requests; site-nav.js loads it only after a visitor turns sound on.
   Each page family loops a short cue written in ABC notation. The ABC parser and GM drum
   map are ported in part from huashu-motion (cli/lib/composer.js), Copyright (c) 2026
   Huashu, MIT License: https://github.com/alchaincyf/huashu-motion/blob/main/LICENSE . ABC: M L Q K headers, V: inst= gain=,
   ^ _ = accidentals, , ' octaves, lengths, z rests, [chords], - ties, |: :|, !p!..!ff!.
   Drums: C,, kick, D,, snare, ^F,, hat, ^A,, open hat. Tests: tests/sound.test.mjs. */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  var LET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MODES = { '': [0, 2, 4, 5, 7, 9, 11], m: [0, 2, 3, 5, 7, 8, 10], dor: [0, 2, 3, 5, 7, 9, 10], mix: [0, 2, 4, 5, 7, 9, 10], lyd: [0, 2, 4, 6, 7, 9, 11] };
  MODES.maj = MODES['']; MODES.min = MODES.m;
  var DYN = { pp: 0.3, p: 0.4, mp: 0.5, mf: 0.6, f: 0.75, ff: 0.88 };
  var GM = { 36: 'kick', 38: 'snare', 39: 'snare', 42: 'hat', 46: 'ohat', 49: 'crash' };

  function keySig(k) {
    var m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(k || 'C'), acc = {};
    if (!m) return acc;
    var tonic = (LET[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, md = m[3].toLowerCase();
    var sc = MODES[md] || MODES[md.slice(0, 3)] || MODES[''], L = 'CDEFGAB', s = L.indexOf(m[1]);
    for (var i = 0; i < 7; i++) { var l = L[(s + i) % 7], d = ((tonic + sc[i] - LET[l]) % 12 + 12) % 12; acc[l] = d > 6 ? d - 12 : d; }
    return acc;
  }
  function frac(s) {
    if (!s) return 1;
    if (/^\/+$/.test(s)) return Math.pow(2, -s.length);
    var m = /^(\d*)(\/?)(\d*)$/.exec(s);
    return m ? (m[1] ? +m[1] : 1) / (m[2] ? (m[3] ? +m[3] : 2) : 1) : 1;
  }
  function attr(s, k) { var m = new RegExp('\\b' + k + '=(\\S+)').exec(s); return m ? m[1] : null; }

  var TOK = /!([^!]*)!|(\|:|:\||\|\]|\|\||\|)|(-)|(\[[^\]]*\]|[\^_=]*[A-Ga-g][,']*|[zx])(\d*\/*\d*)/g;
  var NOTE = /([\^_=]*)([A-Ga-g])([,']*)([\d\/]*)/g;

  /* ABC text -> { bpm, barLen, len, voices, ev: [{ v, b, d, m, g }] }, beats in quarter notes. */
  function parse(text) {
    var head = { M: '4/4', L: '1/8', Q: '1/4=100', K: 'C', T: '' }, voices = [], cur = null;
    String(text).split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/%.*$/, '').trim(), h = /^([A-Za-z]):\s*(.*)$/.exec(line);
      if (!line) return;
      if (h && h[1] === 'V') {
        var id = h[2].split(/\s+/)[0]; cur = null;
        voices.forEach(function (v) { if (v.id === id) cur = v; });
        if (!cur) voices.push(cur = { id: id, inst: attr(h[2], 'inst') || 'pluck', gain: +(attr(h[2], 'gain') || 1), text: '' });
        return;
      }
      if (h && !cur) { head[h[1]] = h[2]; return; }
      if (!cur) voices.push(cur = { id: '1', inst: 'pluck', gain: 1, text: '' });
      cur.text += ' ' + line;
    });
    var mt = /(\d+)\/(\d+)/.exec(head.M) || [0, 4, 4], barLen = mt[1] * 4 / mt[2];
    var q = /(?:(\d+)\/(\d+)\s*=\s*)?(\d+(?:\.\d+)?)/.exec(head.Q), bpm = q ? +q[3] * (q[1] ? q[1] / q[2] : 0.25) * 4 : 100;
    var key = keySig(head.K), Ln = frac(head.L), ev = [], len = 0;
    voices.forEach(function (v, vi) {
      var toks = [], m, beat = 0, acc = {}, vel = DYN.mf, tie = false, last = [], rep = 0, done = {}, drums = v.inst === 'drums';
      TOK.lastIndex = 0;
      while ((m = TOK.exec(v.text))) toks.push(m);
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (t[1] != null) { if (DYN[t[1]]) vel = DYN[t[1]]; continue; }
        if (t[2]) {
          acc = {};
          if (t[2] === '|:') rep = i + 1;
          else if (t[2] === ':|' && !done[i]) { done[i] = 1; i = rep - 1; }
          continue;
        }
        if (t[3]) { tie = true; continue; }
        var body = t[4], parts = [], n;
        if (body === 'z' || body === 'x') { beat += frac(t[5]) * Ln * 4; tie = false; continue; }
        NOTE.lastIndex = 0;
        while ((n = NOTE.exec(body))) parts.push(n);
        var d = frac(t[5] || (body[0] === '[' && parts[0] ? parts[0][4] : '')) * Ln * 4, now = [];
        parts.forEach(function (p) {
          var U = p[2].toUpperCase(), oct = (p[2] === U ? 4 : 5) + (p[3].match(/'/g) || []).length - (p[3].match(/,/g) || []).length, id = U + oct;
          if (p[1]) acc[id] = p[1][0] === '^' ? p[1].length : p[1][0] === '_' ? -p[1].length : 0;
          var a = acc[id] != null ? acc[id] : drums ? 0 : key[U] || 0, midi = 12 * (oct + 1) + LET[U] + a, prev = null;
          if (tie) last.forEach(function (e) { if (e.m === midi && Math.abs(e.b + e.d - beat) < 1e-6) prev = e; });
          if (prev) { prev.d += d; now.push(prev); return; }
          var e = { v: vi, b: beat, d: d, m: midi, g: +(vel * v.gain).toFixed(3) };
          ev.push(e); now.push(e);
        });
        last = now; tie = false; beat += d;
      }
      len = Math.max(len, beat);
      v.len = beat;
    });
    ev.sort(function (a, b) { return a.b - b.b || a.v - b.v || a.m - b.m; });
    return { bpm: bpm, barLen: barLen, len: Math.ceil(len / barLen - 1e-9) * barLen, voices: voices.map(function (v) { return { id: v.id, inst: v.inst, gain: v.gain, len: v.len }; }), ev: ev };
  }

  /* The looped schedule between absolute beats b0 (inclusive) and b1: [{ at, e }]. */
  function slice(s, b0, b1) {
    var out = [], L = s.len;
    if (!(L > 0)) return out;
    for (var k = Math.floor(b0 / L); k * L < b1; k++) {
      for (var i = 0; i < s.ev.length; i++) { var a = k * L + s.ev[i].b; if (a >= b0 && a < b1) out.push({ at: +a.toFixed(6), e: s.ev[i] }); }
    }
    return out;
  }

  /* ---------- the cues: one short loop per page family ---------- */
  var CUES = {
    // home: bright and open, a pluck arpeggio under a bell hook, soft four-on-the-floor
    home: 'T:Tip-Off\nM:4/4\nL:1/8\nQ:1/4=112\nK:D\n' +
      'V:PL inst=pluck gain=.5\nDFAd AFDF | B,DFB FDB,D | G,B,DG DB,G,B, | A,^CEA EC A,C |\n' +
      'V:BL inst=bell gain=.45\n!mp! f3 e d2 A2 | d3 c B2 F2 | B3 A G2 B2 | A6 z2 |\n' +
      'V:BS inst=sub gain=.8\nD,,4 D,,2 A,,2 | B,,,4 B,,,2 F,,2 | G,,,4 G,,,2 D,,2 | A,,,4 A,,,2 E,,2 |\n' +
      'V:DR inst=drums gain=.6\n|: C,,2 ^F,,2 [C,,D,,]2 ^F,,2 :| C,,2 ^F,,2 [C,,D,,]2 ^F,,2 | C,,2 ^F,,2 [C,,D,,]2 ^A,,2 |',
    // live: tense, a low pulse in eighths, ticking hats, a minor stab that never resolves
    live: 'T:Shot Clock\nM:4/4\nL:1/16\nQ:1/4=120\nK:Am\n' +
      'V:BS inst=sub gain=.9\n|: A,,2A,,2 A,,2A,,2 A,,2A,,2 A,,2A,,2 | A,,2A,,2 A,,2A,,2 G,,2G,,2 G,,2G,,2 :|\n' +
      'V:ST inst=pluck gain=.4\n|: z4 [Ace]2 z6 [Ace]2 z2 | z4 [Ace]2 z6 [GBd]2 z2 :|\n' +
      'V:PD inst=pad gain=.35\n!p! [A,CE]16 | [G,B,E]16 | [F,A,C]16 | [E,^G,B,]16 |\n' +
      'V:DR inst=drums gain=.55\n|: C,,4 ^F,,2^F,,2 C,,4 ^F,,2^F,,2 | C,,4 ^F,,2^F,,2 C,,2C,,2 ^F,,^F,,^F,,^F,, :|',
    // replay: 8-bit chiptune for the pixel court, square lead, triangle bass, chip kit
    replay: 'T:Pixel Court\nM:4/4\nL:1/8\nQ:1/4=150\nK:C\n' +
      'V:LD inst=square gain=.38\n!mf! c/e/g/c\'/ e\'2 d\'/c\'/g/e/ g2 | a/c\'/e\'/a\'/ g\'2 f\'/e\'/c\'/a/ c\'2 | f/a/c\'/f\'/ e\'2 d\'/c\'/a/f/ a2 | g/b/d\'/g\'/ f\'2 d\'/b/g/d/ g2 |\n' +
      'V:TB inst=tri gain=.8\nC,C C,C C,C C,C | A,,A, A,,A, A,,A, A,,A, | F,,F, F,,F, F,,F, F,,F, | G,,G, G,,G, G,,G, B,,B, |\n' +
      'V:DR inst=drums gain=.5\n|: C,, ^F,, D,, ^F,, C,, C,, D,, ^F,, :| C,, ^F,, D,, ^F,, C,, C,, D,, ^F,, | C,, ^F,, D,, ^F,, C,, D,, D,, D,, |',
    // play: playful, a bouncing octave bass, off-beat plucks, a bell answer
    play: 'T:Daily Court\nM:4/4\nL:1/8\nQ:1/4=108\nK:F\n' +
      'V:BS inst=sub gain=.85\nF,,F, z F,, F,,F, z C, | D,,D, z D,, D,,D, z A,, | B,,,B,, z B,,, C,,C, z E, | F,,F, z F,, C,,C, z C,, |\n' +
      'V:PL inst=pluck gain=.42\nz [FAc] z [FAc] z [FAc] z [FAc] | z [DFA] z [DFA] z [DFA] z [DFA] | z [DFB] z [DFB] z [EGc] z [EGc] | z [FAc] z [FAc] z [EGc] z [EGc] |\n' +
      'V:BL inst=bell gain=.4\n!mp! c2 z A c2 d2 | f2 z d c4 | d2 z B c2 e2 | f3 g a2 z2 |\n' +
      'V:DR inst=drums gain=.55\n|: C,, ^F,, D,, ^F,, C,, C,, D,, ^F,, :| C,, ^F,, D,, ^F,, C,, C,, D,, ^F,, | C,, ^F,, D,, ^F,, C,, ^F,, D,, D,, |',
    // atlas, players, insights and the rest: calm, held pad chords, a few bell notes, no drums
    calm: 'T:Film Room\nM:4/4\nL:1/8\nQ:1/4=72\nK:E\n' +
      'V:PD inst=pad gain=.4\n!p! [E,G,B,]8 | [C,E,G,]8 | [A,,C,E,]8 | [B,,^D,F,]8 |\n' +
      'V:BL inst=bell gain=.32\n!pp! z2 B2 z4 | z4 g2 z2 | z2 e2 z2 c2 | B6 z2 |\n' +
      'V:BS inst=sub gain=.6\nE,,8 | C,,8 | A,,,8 | B,,,8 |'
  };
  var SFX = {
    swish: 'L:1/16\nQ:1/4=200\nV:1 inst=square gain=.7\nc e g c\'3\nV:2 inst=drums gain=.5\nz2 ^F,,2 z2 ^A,,2',
    miss: 'L:1/16\nQ:1/4=170\nV:1 inst=square gain=.6\ne c _B,4',
    block: 'L:1/16\nQ:1/4=150\nV:1 inst=drums\n[C,,D,,]4\nV:2 inst=square gain=.6\n[C,G,]2 C,,2',
    live: 'L:1/16\nQ:1/4=180\nV:1 inst=square gain=.6\ne a e\' z a e\'3',
    right: 'L:1/16\nQ:1/4=160\nV:1 inst=bell gain=.9\ng c\'3',
    wrong: 'L:1/16\nQ:1/4=140\nV:1 inst=tri gain=.9\n_E2 C,4',
    wipe: 'L:1/32\nQ:1/4=150\nV:1 inst=square gain=.45\nc\' g e c G E C,2'
  };

  var API = { parse: parse, slice: slice, CUES: CUES, SFX: SFX };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (!W) return;
  W.VHSound = API;

  /* ---------- performance ---------- */
  var INST = {
    square: { w: 'square', a: 0.004, s: 0.5, r: 0.05 },
    tri: { w: 'triangle', a: 0.004, s: 0.9, r: 0.05 },
    pluck: { w: 'sawtooth', a: 0.003, dec: 0.16, lp: 2200, r: 0.08 },
    bell: { w: 'sine', a: 0.002, dec: 0.7, r: 0.3, p2: 4 },
    pad: { w: 'triangle', a: 0.45, s: 0.8, r: 0.7, lp: 1100, det: 7 },
    sub: { w: 'sine', a: 0.006, s: 0.9, r: 0.08 }
  };
  var MUSIC = 0.18, KEY = 'vh.snd';
  var ctx = null, music = null, fx = null, cue = null, timer = 0, on = false, t0 = 0, beat0 = 0, cursor = 0, saved = 0, noise = null, cache = {};

  function graph() {
    if (music) return true;
    var A = W.AudioContext || W.webkitAudioContext;
    try { ctx = W.VHAudioCtx || (A && new A()); } catch (e) { ctx = null; }
    if (!ctx) return false;
    W.VHAudioCtx = ctx;
    var comp = ctx.createDynamicsCompressor(), out = ctx.createGain();
    comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2;
    out.gain.value = 0.9; comp.connect(out); out.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0; music.connect(comp);
    fx = ctx.createGain(); fx.gain.value = 0.5; fx.connect(comp);
    noise = ctx.createBuffer(1, ctx.sampleRate >> 1, ctx.sampleRate);
    var ch = noise.getChannelData(0), x = 22222, h = 0;
    for (var i = 0; i < ch.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; if (i % 3 === 0) h = x / 0x3fffffff - 1; ch[i] = h; }
    return true;
  }

  function drum(name, t, g, bus) {
    var e = ctx.createGain();
    if (name === 'kick') {
      var o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(e); e.connect(bus); o.start(t); o.stop(t + 0.3); return;
    }
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), dec = name === 'snare' ? 0.11 : name === 'hat' ? 0.035 : name === 'ohat' ? 0.16 : 0.5;
    src.buffer = noise; f.type = name === 'snare' ? 'bandpass' : 'highpass'; f.frequency.value = name === 'snare' ? 1800 : 7000;
    e.gain.setValueAtTime(g * (name === 'snare' ? 0.9 : 0.45), t); e.gain.exponentialRampToValueAtTime(0.001, t + dec);
    src.connect(f); f.connect(e); e.connect(bus); src.start(t, (t * 7.3) % 0.3); src.stop(t + dec + 0.02);
  }

  function voice(inst, midi, t, d, g, bus) {
    var I = INST[inst] || INST.pluck, f = 440 * Math.pow(2, (midi - 69) / 12), e = ctx.createGain(), end = t + d, oscs = [];
    var o = ctx.createOscillator(); o.type = I.w; o.frequency.value = f; oscs.push(o);
    if (I.det) { var o2 = ctx.createOscillator(); o2.type = I.w; o2.frequency.value = f; o2.detune.value = I.det; oscs.push(o2); }
    var head = e;
    if (I.lp) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(I.lp, t); if (I.dec) lp.frequency.setTargetAtTime(I.lp * 0.3, t, I.dec); lp.connect(e); head = lp; }
    oscs.forEach(function (x) { x.connect(head); });
    if (I.p2) { var p = ctx.createOscillator(), pg = ctx.createGain(); p.frequency.value = f * I.p2; pg.gain.setValueAtTime(g * 0.2, t); pg.gain.setTargetAtTime(0, t, I.dec / 4); p.connect(pg); pg.connect(bus); oscs.push(p); }
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + I.a);
    e.gain.setTargetAtTime(I.dec ? 0 : g * I.s, t + I.a, I.dec || 0.08);
    e.gain.setTargetAtTime(0, Math.max(end, t + I.a), I.r / 3);
    e.connect(bus);
    oscs.forEach(function (x) { x.start(t); x.stop(end + I.r + 0.05); });
  }

  function play(s, list, at, bus, spb) {
    list.forEach(function (it) {
      var v = s.voices[it.e.v], t = at(it.at), g = it.e.g * 0.5;
      try { if (v.inst === 'drums') { if (GM[it.e.m]) drum(GM[it.e.m], t, g, bus); } else voice(v.inst, it.e.m, t, Math.max(0.05, it.e.d * spb - 0.01), g * 0.6, bus); } catch (e) { /* one note, not the loop */ }
    });
  }

  function score(name, table) { return cache[name] || (cache[name] = parse(table[name])); }
  function beatNow() { return beat0 + (ctx.currentTime - t0) * cue.bpm / 60; }
  function save() {
    if (!on || !cue || !ctx) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ b: beatNow(), at: Date.now(), bpm: cue.bpm })); } catch (e) { /* private mode */ }
  }
  function pump() {
    if (!on || ctx.state !== 'running') return;
    var spb = 60 / cue.bpm, now = beatNow(), end = now + 0.3 / spb;
    cursor = Math.max(cursor, now); // after a stall, skip the missed notes rather than fire them at once
    if (end > cursor) { play(cue, slice(cue, cursor, end), function (b) { return t0 + (b - beat0) * spb; }, music, spb); cursor = end; }
    if (Date.now() - saved > 1000) { saved = Date.now(); save(); }
  }
  var armed = false;
  function unlockOnGesture() { // one listener pair, however many times start() runs
    if (armed) return; armed = true;
    var E = ['pointerup', 'touchend', 'keydown', 'click']; // a tap unlocks audio on touchend/pointerup/click, not pointerdown
    // not every gesture counts (the touchend that ends a scroll, Escape): if the context is still
    // suspended afterwards, listen again for the next one
    var go = function () {
      armed = false; E.forEach(function (t) { W.removeEventListener(t, go, true); });
      if (!on || !ctx) return;
      ctx.resume().then(rebase, function () {}).then(function () { if (on && ctx.state !== 'running') unlockOnGesture(); });
    };
    E.forEach(function (t) { W.addEventListener(t, go, true); });
  }
  function rebase() { // keep the groove where it was across a suspend
    var b = beatNow(); t0 = ctx.currentTime + 0.05; beat0 = cursor = Math.max(b, cursor);
  }

  API.start = function (family) {
    if (on) return true;
    if (!graph()) return false;
    cue = score(CUES[family] ? family : 'calm', CUES);
    var b = 0;
    try { var o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (o && Date.now() - o.at < 6e5) b = o.b + (Date.now() - o.at) / 1000 * o.bpm / 60; } catch (e) { /* fresh start */ }
    on = true; t0 = ctx.currentTime + 0.06; beat0 = cursor = b;
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.setValueAtTime(0, ctx.currentTime); music.gain.linearRampToValueAtTime(MUSIC, ctx.currentTime + 0.8);
    if (ctx.state !== 'running') { ctx.resume().then(rebase, function () {}); unlockOnGesture(); }
    clearInterval(timer); timer = setInterval(pump, 60);
    return true;
  };
  API.stop = function () {
    if (!on) return;
    save(); on = false; clearInterval(timer);
    if (music) { music.gain.cancelScheduledValues(ctx.currentTime); music.gain.setTargetAtTime(0, ctx.currentTime, 0.08); }
  };
  API.isOn = function () { return on; };
  /* render a cue into an OfflineAudioContext (loudness checks only) */
  API.render = function (name, octx, secs) {
    ctx = octx; music = null; W.VHAudioCtx = octx; graph(); music.gain.value = MUSIC;
    var s = score(name, CUES), spb = 60 / s.bpm;
    play(s, slice(s, 0, secs / spb), function (b) { return b * spb; }, music, spb);
    return octx.startRendering();
  };
  API.sfx = function (name, delay) {
    if (!on || !SFX[name] || !ctx || ctx.state !== 'running') return;
    var s = score(name, SFX), now = ctx.currentTime + 0.01 + (delay || 0), spb = 60 / s.bpm;
    play(s, slice(s, 0, s.len), function (b) { return now + b * spb; }, fx, spb);
  };
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !on) return;
    if (document.hidden) { save(); ctx.suspend(); } else ctx.resume().then(rebase, function () {});
  });
  W.addEventListener('pagehide', save);
})();
