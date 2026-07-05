/* Vector Hoops — game.js
 * Zero deps, zero build. Loads assets/vectors.json and runs "The Chimera":
 * a daily fused player-season, 6 guesses, cosine-similarity feedback,
 * a half-court zone-presence story, and a 3D league starfield map.
 *
 * Data contract (assets/vectors.json), produced by pipeline/build_vectors.py:
 *   { built, seasons:[first,last], normalization, features:[14],
 *     featureLabels:{feature->label}, clusters:[8 names],
 *     players:[{id,name,season,v:[14 z-scores],x,y,z,c,sal?}, ...] }
 * x,y,z are PCA(3) map coordinates in [0,1]; sal (optional) is the
 * era-honest salary z-score when the dataset carries payroll coverage.
 */
(function () {
  'use strict';

  var DATA_URL = 'assets/vectors.json';
  var DEADLINE_URL = 'assets/deadline.json';
  var FADERFINISHER_URL = 'assets/faderfinisher.json';
  var EPOCH_DATE = '2026-07-01'; // puzzle #1
  var MAX_GUESSES = 6;
  var WIN_SIMILARITY = 0.92;
  var LS_KEY = 'vectorHoops.v2';
  var LS_KEY_USER_REF = 'vectorHoops.userRef';
  var LS_KEY_DEADLINE_COUNTER = 'vectorHoops.deadline.counter';
  var LS_KEY_DEADLINE_DAILY = 'vectorHoops.deadline.daily.v1';
  var LS_KEY_PRACTICE_STATS = 'vectorHoops.practice.chimera.stats';
  var LS_KEY_FF_DAILY = 'vectorHoops.ff.daily.v1';
  var LS_KEY_FF_PRACTICE = 'vectorHoops.ff.practice';
  var LS_KEY_ARC_DAILY = 'vectorHoops.arc.daily.v1';
  var LS_KEY_ARC_PRACTICE = 'vectorHoops.arc.practice';
  var LS_KEY_SEEN_HELP = 'vectorHoops.seenHelp';
  var LS_KEY_LB_PREFIX = 'vectorHoops.lbSubmitted.'; // + game + '.' + day
  var LS_KEY_LB_LAST_GAME = 'vectorHoops.lastPlayedGame';
  var DEADLINE_ROUNDS_PER_RUN = 5;
  var FF_ROUNDS_PER_RUN = 5;
  var ARC_CARD_COUNT = 5;
  var ARC_MIN_SEASONS = 5;
  var A_COUNT = 7; // first 7 dims come from player A, last 7 from player B
  // GitHub repo/branch + dossier markdown fetch/render now live in
  // assets/dossier.js (shared with wiki.html) — aliased below.
  var GITHUB_REPO = window.VHDossier.GITHUB_REPO;
  var GITHUB_BRANCH = window.VHDossier.GITHUB_BRANCH;
  // M2 hint economy: Daily Chimera only. Free Play (practice) gets both
  // hints immediately since it never counts toward anything.
  var HINT_POSITION_AT_GUESS = 3;
  var HINT_ARCHETYPE_AT_GUESS = 5;
  var DESKTOP_QUERY = '(min-width: 1000px)';

  function isDesktopWide() {
    try { return window.matchMedia && window.matchMedia(DESKTOP_QUERY).matches; }
    catch (e) { return false; }
  }

  // ---------------------------------------------------------------------
  // Telemetry: fire-and-forget, never blocks gameplay
  // ---------------------------------------------------------------------

  function getUserRef() {
    var ref = null;
    try { ref = localStorage.getItem(LS_KEY_USER_REF); } catch (e) { ref = null; }
    if (!ref) {
      ref = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      try { localStorage.setItem(LS_KEY_USER_REF, ref); } catch (e) { /* storage unavailable */ }
    }
    return ref;
  }

  function track(event, detail) {
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: event, userRef: getUserRef(), detail: detail })
      }).catch(function () { /* fire-and-forget */ });
    } catch (e) { /* never block gameplay */ }
  }

  // ---------------------------------------------------------------------
  // Public leaderboard: fire-and-forget submission on DAILY completion
  // only (never practice/Free Play). One submission per game/day, guarded
  // in localStorage independent of each mode's own "done" state so a
  // re-render or state bug never double-posts. assets/leaderboard.js
  // (loaded before this file) owns window.VHIdentity — the session ref +
  // deterministic anonymous name. See api/leaderboard.js for the proxy.
  // ---------------------------------------------------------------------

  function lbGuardKey(game, day) {
    return LS_KEY_LB_PREFIX + game + '.' + day;
  }

  function lbAlreadySubmitted(game, day) {
    try { return localStorage.getItem(lbGuardKey(game, day)) === '1'; }
    catch (e) { return false; }
  }

  function lbMarkSubmitted(game, day) {
    try {
      localStorage.setItem(lbGuardKey(game, day), '1');
      localStorage.setItem(LS_KEY_LB_LAST_GAME, game);
    } catch (e) { /* storage unavailable */ }
  }

  function submitLeaderboardScore(game, day, score) {
    if (lbAlreadySubmitted(game, day)) return;
    lbMarkSubmitted(game, day); // mark first: never retries the same game/day, even if this fails
    if (!window.VHIdentity) return;
    try {
      fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: game, day: day, score: score,
          ref: window.VHIdentity.getUserRef(),
          name: window.VHIdentity.sessionName()
        })
      }).catch(function () { /* fire-and-forget */ });
    } catch (e) { /* never block gameplay */ }
  }

  // Feature indices (fixed by pipeline/build_vectors.py FEATURES order)
  var IDX = {
    PTS: 0, AST: 1, OREB: 2, DREB: 3, STL: 4, BLK: 5, TOV: 6,
    FG3A: 7, FGA: 8, FTA: 9, FG3_PCT: 10, FG_PCT: 11, FT_PCT: 12, PLUS_MINUS: 13
  };

  // ---------------------------------------------------------------------
  // Deterministic PRNG: xmur3 string hash -> mulberry32 generator
  // ---------------------------------------------------------------------

  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededRng(str) {
    var seedFn = xmur3(str);
    return mulberry32(seedFn());
  }

  // crypto.getRandomValues-sourced nonce -> deterministic-from-nonce rng, used
  // by every mode's Free Play so unlimited practice rounds never repeat and
  // never touch the daily seed.
  function randomNonce() {
    var arr = new Uint32Array(2);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      arr[0] = Math.floor(Math.random() * 4294967296);
      arr[1] = Math.floor(Math.random() * 4294967296);
    }
    return arr[0].toString(36) + '-' + arr[1].toString(36) + '-' + Date.now().toString(36);
  }

  // Fisher-Yates partial shuffle: first k of a shuffled [0..n) index array —
  // a seeded, distinct (no-replacement) sample.
  function seededSampleIndices(rng, n, k) {
    var arr = new Array(n);
    for (var i = 0; i < n; i++) arr[i] = i;
    var lim = Math.min(k, n);
    for (i = 0; i < lim; i++) {
      var j = i + Math.floor(rng() * (n - i));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.slice(0, lim);
  }

  function seededShuffle(rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ---------------------------------------------------------------------
  // Vector math
  // ---------------------------------------------------------------------

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) {
    return Math.sqrt(dot(a, a));
  }

  function cosineSim(a, b) {
    var na = norm(a), nb = norm(b);
    if (na === 0 || nb === 0) return 0;
    return dot(a, b) / (na * nb);
  }

  // ---------------------------------------------------------------------
  // Date helpers (UTC — one puzzle per UTC day)
  // ---------------------------------------------------------------------

  function utcDateString(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  }

  function daysBetweenUTC(fromStr, toStr) {
    var a = Date.parse(fromStr + 'T00:00:00Z');
    var b = Date.parse(toStr + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  function puzzleNumber(todayStr) {
    return daysBetweenUTC(EPOCH_DATE, todayStr) + 1;
  }

  // ---------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------

  var DATA = null;         // parsed vectors.json
  var CENTROIDS = null;    // [k][14] mean vector per cluster
  var CLUSTER_XYZ = null;  // [k]{x,y,z,n} mean map position per cluster
  var TARGET = null;       // the ACTIVE target { a, b, vector, clusterIdx } —
                            // repointed to DAILY_TARGET or PRACTICE_TARGET
                            // whenever the Chimera sub-mode switches.
  var DAILY_TARGET = null; // the seeded, shared, once-a-day target
  var PRACTICE_TARGET = null; // Free Play: regenerated by "New chimera"
  var STATE = null;        // persisted localStorage state (Daily Chimera only)
  var TODAY = utcDateString();

  // M0 state isolation: Free Play (Chimera) never touches STATE/LS_KEY above.
  // Its round record and casual counters live entirely separately.
  var activeChimeraMode = 'daily'; // 'daily' | 'practice'
  var PRACTICE_REC = { guesses: [], done: false, won: false };
  var PRACTICE_STATS = null; // { played, won } — loaded from LS_KEY_PRACTICE_STATS

  var els = {}; // cached DOM refs, filled in initDom()

  // ---------------------------------------------------------------------
  // Data prep
  // ---------------------------------------------------------------------

  function computeCentroids(players, k, dims) {
    var sums = [];
    var counts = [];
    for (var c = 0; c < k; c++) {
      sums.push(new Array(dims).fill(0));
      counts.push(0);
    }
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      for (var d = 0; d < dims; d++) s[d] += p.v[d];
      counts[p.c]++;
    }
    for (c = 0; c < k; c++) {
      var n = counts[c] || 1;
      for (d = 0; d < dims; d++) sums[c][d] /= n;
    }
    return sums;
  }

  function computeClusterXYZ(players, k) {
    var sums = [];
    for (var c = 0; c < k; c++) sums.push({ x: 0, y: 0, z: 0, n: 0 });
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var s = sums[p.c];
      if (!s) continue;
      s.x += p.x; s.y += p.y; s.z += p.z; s.n++;
    }
    for (c = 0; c < k; c++) {
      if (sums[c].n > 0) { sums[c].x /= sums[c].n; sums[c].y /= sums[c].n; sums[c].z /= sums[c].n; }
      else { sums[c].x = 0.5; sums[c].y = 0.5; sums[c].z = 0.5; }
    }
    return sums;
  }

  function nearestCentroidIdx(vector, centroids) {
    var best = 0, bestDist = Infinity;
    for (var c = 0; c < centroids.length; c++) {
      var d = 0;
      for (var i = 0; i < vector.length; i++) {
        var diff = vector[i] - centroids[c][i];
        d += diff * diff;
      }
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function playerKey(p) {
    return p.name + ' (' + p.season + ')';
  }

  // Slug rules shared with pipeline/build_wiki.py (OKF page filenames) —
  // extracted to assets/dossier.js so wiki.html builds identical links.
  var playerSlug = window.VHDossier.playerSlug;

  // ---------------------------------------------------------------------
  // Daily Chimera target selection
  // ---------------------------------------------------------------------

  // Generalized: same distinct/sim<0.3 constraints regardless of seed source.
  // Daily uses a date seed (shared, deterministic); Free Play uses a random
  // nonce (crypto-sourced, unlimited, never repeats the daily puzzle).
  function buildTargetFromRng(rng) {
    var players = DATA.players;
    var a, b, tries = 0;
    do {
      var ia = Math.floor(rng() * players.length);
      var ib = Math.floor(rng() * players.length);
      a = players[ia];
      b = players[ib];
      tries++;
    } while (
      tries < 2000 &&
      (a === b || cosineSim(a.v, b.v) >= 0.3)
    );

    var vector = new Array(a.v.length);
    for (var i = 0; i < vector.length; i++) {
      vector[i] = i < A_COUNT ? a.v[i] : b.v[i];
    }

    var clusterIdx = nearestCentroidIdx(vector, CENTROIDS);

    return { a: a, b: b, vector: vector, clusterIdx: clusterIdx };
  }

  function buildDailyTarget() {
    return buildTargetFromRng(seededRng('vector-hoops:' + TODAY));
  }

  function buildPracticeTarget() {
    return buildTargetFromRng(seededRng('vector-hoops:practice:' + randomNonce()));
  }

  // M2 hint economy — derived straight from the same vectors the target
  // uses (A3 doctrine), never a fabricated value.
  function targetPositionHint() {
    if (!DATA.positions) return null;
    var pa = (typeof TARGET.a.p === 'number' && TARGET.a.p >= 0) ? DATA.positions[TARGET.a.p] : null;
    var pb = (typeof TARGET.b.p === 'number' && TARGET.b.p >= 0) ? DATA.positions[TARGET.b.p] : null;
    if (pa && pb) return pa === pb ? pa : (pa + ' / ' + pb);
    return pa || pb || null;
  }

  function hintUnlocked(kind) {
    if (activeChimeraMode === 'practice') return true; // Free Play: hints from guess 1
    var n = todayRecord().guesses.length;
    if (kind === 'position') return n >= HINT_POSITION_AT_GUESS;
    if (kind === 'archetype') return n >= HINT_ARCHETYPE_AT_GUESS;
    return false;
  }

  function renderHints() {
    if (!els.hintsRow) return;
    var chips = [];
    if (hintUnlocked('position')) {
      var posHint = targetPositionHint();
      if (posHint) chips.push('<span class="vh-hint-chip">Position: ' + escapeHtml(posHint) + '</span>');
    }
    if (hintUnlocked('archetype')) {
      chips.push('<span class="vh-hint-chip">Archetype: ' + escapeHtml(DATA.clusters[TARGET.clusterIdx]) + '</span>');
    }
    if (chips.length) {
      els.hintsRow.innerHTML = chips.join('');
      els.hintsRow.hidden = false;
    } else {
      els.hintsRow.hidden = true;
      els.hintsRow.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------
  // Trait phrasing for the prompt
  // ---------------------------------------------------------------------

  function traitList(indices) {
    return indices.map(function (i) {
      return DATA.featureLabels[DATA.features[i]];
    });
  }

  // Deterministic trait phrasing for the scouting-report opener: top-2
  // positive sigmas become "an elite {noun} and {noun}", the single most
  // negative sigma becomes the "who {verb phrase}" clause.
  var TRAIT_POS_NOUN = {
    PTS: 'scorer', AST: 'playmaker', OREB: 'offensive rebounder', DREB: 'defensive rebounder',
    STL: 'perimeter disruptor', BLK: 'rim-protector', TOV: 'high-usage ball-handler',
    FG3A: 'three-point shooter', FGA: 'shot creator', FTA: 'rim-pressure threat',
    FG3_PCT: 'knockdown shooter', FG_PCT: 'finisher', FT_PCT: 'free-throw threat',
    PLUS_MINUS: 'winning presence'
  };
  var TRAIT_NEG_VERB = {
    PTS: 'rarely looks for his own shot', AST: "isn't the one setting up teammates",
    OREB: 'stays off the offensive glass', DREB: 'rarely finishes plays with a defensive board',
    STL: "doesn't generate takeaways", BLK: 'gives you nothing at the rim',
    TOV: 'protects the ball at a premium rate', FG3A: 'almost never shoots threes',
    FGA: 'barely creates his own offense', FTA: 'rarely draws contact',
    FG3_PCT: "can't hit from three", FG_PCT: 'struggles to finish around the rim',
    FT_PCT: 'is shaky at the line', PLUS_MINUS: 'has been a net negative on the floor'
  };

  function buildScoutingLine(vector, clusterIdx) {
    var entries = DATA.features.map(function (key, i) {
      return { key: key, v: vector[i] };
    });
    var byDesc = entries.slice().sort(function (a, b) { return b.v - a.v; });
    var byAsc = entries.slice().sort(function (a, b) { return a.v - b.v; });
    var noun1 = TRAIT_POS_NOUN[byDesc[0].key];
    var noun2 = TRAIT_POS_NOUN[byDesc[1].key];
    var negPhrase = TRAIT_NEG_VERB[byAsc[0].key];
    var archetype = DATA.clusters[clusterIdx];
    return 'Reads like: an elite ' + noun1 + ' and ' + noun2 + ' who ' +
      negPhrase + '. Archetype: ' + archetype + '.';
  }

  function renderPrompt() {
    els.puzzleDay.textContent = String(puzzleNumber(TODAY)); // header "day" is always the daily count
    if (activeChimeraMode === 'practice') {
      els.puzzleNumber.textContent = 'Practice Chimera #' + (PRACTICE_STATS.played + 1);
      els.promptText.textContent =
        "This practice Chimera fuses two secret real player-seasons: one donates its counting-stat " +
        'profile (scoring, boards, dimes, defense), the other its shooting-and-impact profile. ' +
        'Guess the season that plays like the blend, or name either real component, to win. ' +
        "Doesn't affect your daily streak.";
    } else {
      els.puzzleNumber.textContent = 'Vector Hoops #' + puzzleNumber(TODAY);
      // The equation tiles (counting stats + shooting/impact = ?) are the visual
      // prompt; this is the screen-reader-only equivalent — deliberately does
      // not name either donor, matching the "= ?" secrecy the win state relies on.
      els.promptText.textContent =
        "Today's Chimera fuses two secret real player-seasons: one donates its counting-stat " +
        'profile (scoring, boards, dimes, defense), the other its shooting-and-impact profile. ' +
        'Guess the season that plays like the blend, or name either real component, to win.';
    }
  }

  function renderScoutingLine() {
    els.scoutingLine.textContent = buildScoutingLine(TARGET.vector, TARGET.clusterIdx);
  }

  // ---------------------------------------------------------------------
  // localStorage state
  // ---------------------------------------------------------------------

  function defaultState() {
    return { streak: 0, maxStreak: 0, lastWinDate: null, days: {} };
  }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    var s = defaultState();
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.maxStreak = parsed.maxStreak || parsed.streak || 0;
          s.lastWinDate = parsed.lastWinDate || null;
          s.days = parsed.days || {};
        }
      } catch (e) { /* corrupt state, fall back to default */ }
    }
    if (!s.days[TODAY]) {
      s.days[TODAY] = { guesses: [], done: false, won: false };
    }
    return s;
  }

  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) { /* storage unavailable */ }
  }

  // Loads once at init; { played, won } — Free Play (Chimera) only. Separate
  // key from LS_KEY so a practice round can never touch daily state (M0).
  function loadPracticeStats() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_PRACTICE_STATS); } catch (e) { raw = null; }
    var s = { played: 0, won: 0 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.played = parsed.played || 0;
          s.won = parsed.won || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
    }
    return s;
  }

  function savePracticeStats() {
    try { localStorage.setItem(LS_KEY_PRACTICE_STATS, JSON.stringify(PRACTICE_STATS)); } catch (e) { /* storage unavailable */ }
  }

  // Mode-aware: the single seam through which every render/submit function
  // reads "the round in play," so Daily and Free Play share all the same
  // rendering code paths without ever touching each other's storage.
  function todayRecord() {
    return activeChimeraMode === 'practice' ? PRACTICE_REC : STATE.days[TODAY];
  }

  function registerCompletion(won) {
    var rec = todayRecord();
    rec.done = true;
    rec.won = won;
    var modeDetail = activeChimeraMode === 'practice' ? 'free' : 'daily';
    if (activeChimeraMode === 'practice') {
      PRACTICE_STATS.played++;
      if (won) PRACTICE_STATS.won++;
      savePracticeStats();
      track(won ? 'vh-win' : 'vh-loss', { guesses: rec.guesses.length, mode: modeDetail });
      return; // Free Play never touches STATE/streak — state isolation (M0)
    }
    if (won) {
      var yesterday = utcDateString(new Date(Date.now() - 86400000));
      STATE.streak = (STATE.lastWinDate === yesterday) ? STATE.streak + 1 : 1;
      STATE.lastWinDate = TODAY;
      STATE.maxStreak = Math.max(STATE.maxStreak || 0, STATE.streak);
      track('vh-win', { guesses: rec.guesses.length, mode: modeDetail });
      // Chimera board = finishers only: a win submits guesses used (1-6,
      // lower better); a loss submits nothing (see leaderboard.html note).
      submitLeaderboardScore('chimera', TODAY, rec.guesses.length);
    } else {
      STATE.streak = 0;
      track('vh-loss', { mode: modeDetail });
    }
    saveState();
    renderStreak();
  }

  function renderStreak() {
    els.streakNum.textContent = String(STATE.streak);
  }

  // ---------------------------------------------------------------------
  // Stats (M1): played/win%/streak/maxStreak + guess-distribution histogram,
  // all recomputed straight from the persisted Daily Chimera days map.
  // ---------------------------------------------------------------------

  function computeDailyChimeraStats() {
    var played = 0, wins = 0, dist = [0, 0, 0, 0, 0, 0];
    Object.keys(STATE.days).forEach(function (d) {
      var rec = STATE.days[d];
      if (!rec || !rec.done) return;
      played++;
      if (rec.won) {
        wins++;
        var n = Math.min(MAX_GUESSES, rec.guesses.length) - 1;
        if (n >= 0 && n < dist.length) dist[n]++;
      }
    });
    return {
      played: played,
      wins: wins,
      winPct: played ? Math.round((wins / played) * 100) : 0,
      streak: STATE.streak,
      maxStreak: STATE.maxStreak || 0,
      dist: dist
    };
  }

  // ---------------------------------------------------------------------
  // Autocomplete
  // ---------------------------------------------------------------------

  function createAutocomplete(inputEl, listEl, players, onSelect) {
    var activeIdx = -1;
    var currentMatches = [];

    function close() {
      listEl.hidden = true;
      listEl.innerHTML = '';
      inputEl.setAttribute('aria-expanded', 'false');
      activeIdx = -1;
      currentMatches = [];
    }

    function openEmpty() {
      currentMatches = [];
      activeIdx = -1;
      listEl.innerHTML = '';
      var li = document.createElement('li');
      li.className = 'vh-suggestions__empty';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-disabled', 'true');
      li.textContent = 'No matches — try a last name';
      listEl.appendChild(li);
      listEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
    }

    function open(matches) {
      if (matches.length === 0) { openEmpty(); return; }
      currentMatches = matches;
      activeIdx = -1;
      listEl.innerHTML = '';
      matches.forEach(function (p, idx) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.textContent = playerKey(p);
        li.dataset.idx = String(idx);
        li.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          select(idx);
        });
        listEl.appendChild(li);
      });
      listEl.hidden = false;
      inputEl.setAttribute('aria-expanded', 'true');
    }

    function highlight() {
      var items = listEl.querySelectorAll('li');
      items.forEach(function (li, idx) {
        li.classList.toggle('active', idx === activeIdx);
      });
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    function select(idx) {
      var p = currentMatches[idx];
      if (!p) return;
      inputEl.value = playerKey(p);
      close();
      onSelect(p);
    }

    // accent-insensitive: "jokic" finds "Jokić", "doncic" finds "Dončić"
    function foldTerm(s) {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function search(term) {
      term = foldTerm(term.trim());
      if (!term) { close(); return; }
      var matches = [];
      for (var i = 0; i < players.length && matches.length < 8; i++) {
        var p = players[i];
        if (p._k === undefined) p._k = foldTerm(playerKey(p));
        if (p._k.indexOf(term) !== -1) matches.push(p);
      }
      open(matches);
    }

    inputEl.addEventListener('input', function () { search(inputEl.value); });

    inputEl.addEventListener('keydown', function (ev) {
      if (listEl.hidden) return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1);
        highlight();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlight();
      } else if (ev.key === 'Enter') {
        if (activeIdx >= 0) {
          ev.preventDefault();
          select(activeIdx);
        }
      } else if (ev.key === 'Escape') {
        close();
      }
    });

    inputEl.addEventListener('blur', function () {
      setTimeout(close, 120);
    });

    return { close: close };
  }

  // ---------------------------------------------------------------------
  // Zone math: z-scored features -> court zone intensities
  // ---------------------------------------------------------------------
  //
  // The half court is partitioned into the real shooting regions of the
  // NBA floor (all dimensions in feet, to rule):
  //
  //   restricted area   r = 4' semicircle at the rim (rim center 5.25' out)
  //   paint (non-RA)    16' x 19' lane minus the restricted area
  //   midrange          inside the 3PT boundary, outside the lane
  //   beyond the arc    r = 23.75' arc + 22' corner lines to the baseline
  //
  // Region fill opacity (offense, orange) and hatch opacity (defense,
  // blue) are both linear in sigma: clamp(z / 3, 0, 1) * MAX. Every
  // offensive region carries its numeric sigma label — the court reads
  // as a labeled diagram, not a heat blur.
  //
  //   OFFENSE (orange fills)
  //     restricted   = avg( FTA[9], max(0, FGA[8]-FG3A[7]) )  rim pressure
  //     paint (FT)   = FTA[9]                                 fouls drawn / line trips
  //     midrange     = FGA[8]                                 overall shot volume
  //     beyond arc   = FG3A[7]                                three-point volume
  //     oreb square  = OREB[2]                                offensive-glass block
  //     ast vectors  = AST[1]                                 passing vectors from the key
  //   DEFENSE (blue 45-degree hatching)
  //     lane hatch   = BLK[5]                                 rim protection
  //     arc band     = STL[4]                                 perimeter pressure
  //     dreb square  = DREB[3]                                defensive-glass block

  var ZONE_Z_MAX = 3;         // sigma value that saturates a zone
  var ZONE_FILL_MAX = 0.60;   // fills stay translucent so labels read
  var ZONE_HATCH_MAX = 0.90;

  function zoneT(z) {
    var t = z / ZONE_Z_MAX;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t;
  }

  function zoneRaw(v) {
    return {
      rim: (v[IDX.FTA] + Math.max(0, v[IDX.FGA] - v[IDX.FG3A])) / 2,
      paintFT: v[IDX.FTA],
      mid: v[IDX.FGA],
      arc: v[IDX.FG3A],
      oreb: v[IDX.OREB],
      ast: v[IDX.AST],
      paintD: v[IDX.BLK],
      perimeterD: v[IDX.STL],
      glassD: v[IDX.DREB]
    };
  }

  var OFFENSE_KEYS = ['rim', 'mid', 'arc', 'oreb', 'ast'];
  var DEFENSE_KEYS = ['paintD', 'perimeterD', 'glassD'];
  var AREA_MATCH = { rim: 'paintD', arc: 'perimeterD', oreb: 'glassD' };
  var AREA_LABEL = { rim: 'the rim', arc: 'the arc', oreb: 'the glass' };
  var OFFENSE_PHRASE = {
    rim: 'shoots at the rim', mid: 'lives in the midrange', arc: 'shoots from the arc',
    oreb: 'crashes the glass', ast: 'runs it from the top of the key'
  };
  var DEFENSE_PHRASE = {
    paintD: 'protects the paint', perimeterD: 'defends the perimeter', glassD: 'owns the defensive glass'
  };

  function dominantKey(zones, keys) {
    var bestK = keys[0], bestV = -Infinity;
    keys.forEach(function (k) {
      if (zones[k] > bestV) { bestV = zones[k]; bestK = k; }
    });
    return bestK;
  }

  function entityPhrase(zones) {
    var topOff = dominantKey(zones, OFFENSE_KEYS);
    var topDef = dominantKey(zones, DEFENSE_KEYS);
    if (AREA_MATCH[topOff] === topDef) {
      return 'lives at ' + AREA_LABEL[topOff] + ' on both ends';
    }
    return DEFENSE_PHRASE[topDef] + ' and ' + OFFENSE_PHRASE[topOff];
  }

  function storyCaption(targetZones, guessZones) {
    return 'The Chimera ' + entityPhrase(targetZones) + ' — your guess ' + entityPhrase(guessZones) + '.';
  }

  // ---------------------------------------------------------------------
  // Half-court diagram (canvas, drawn in code — no assets)
  // ---------------------------------------------------------------------

  // Court geometry, all in feet. X() and Y() convert court feet to canvas
  // px, with y measured up from the baseline (canvas bottom edge).
  function courtGeometry(w, h) {
    var s = w / 50; // px per foot; canvas aspect fixed at 50:47
    var g = {
      s: s, w: w, h: h,
      RIM: { x: 25, y: 5.25 },
      RA: 4, R3: 23.75, CORNER: 22,
      KEY_W: 16, KEY_H: 19, FT_R: 6
    };
    g.X = function (ft) { return ft * s; };
    g.Y = function (ft) { return h - ft * s; };
    g.breakY = g.RIM.y + Math.sqrt(g.R3 * g.R3 - g.CORNER * g.CORNER); // 14.19'
    // canvas-space arc angles at the two corner break points (y-down space)
    g.leftAngle = Math.atan2(g.Y(g.breakY) - g.Y(g.RIM.y), g.X(25 - g.CORNER) - g.X(25));
    g.rightAngle = Math.atan2(g.Y(g.breakY) - g.Y(g.RIM.y), g.X(25 + g.CORNER) - g.X(25));
    return g;
  }

  // -- region path builders (each appends to the current path) --

  function pathRA(ctx, g) {
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), g.RA * g.s, 0, Math.PI * 2);
  }

  function pathKey(ctx, g) {
    ctx.rect(g.X(25 - g.KEY_W / 2), g.Y(g.KEY_H), g.KEY_W * g.s, g.KEY_H * g.s);
  }

  // everything inside the 3PT boundary (corner lines + arc), down to baseline
  function pathInside3(ctx, g) {
    ctx.moveTo(g.X(25 - g.CORNER), g.Y(0));
    ctx.lineTo(g.X(25 - g.CORNER), g.Y(g.breakY));
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), g.R3 * g.s, g.leftAngle, g.rightAngle, false);
    ctx.lineTo(g.X(25 + g.CORNER), g.Y(0));
    ctx.closePath();
  }

  function pathCourt(ctx, g) {
    ctx.rect(0, 0, g.w, g.h);
  }

  function fillRegion(ctx, g, builders, rgb, t) {
    if (t <= 0.02) return;
    ctx.save();
    ctx.beginPath();
    builders.forEach(function (b) { b(ctx, g); });
    ctx.fillStyle = 'rgba(' + rgb + ',' + (t * ZONE_FILL_MAX).toFixed(3) + ')';
    ctx.fill('evenodd');
    ctx.restore();
  }

  // 45-degree engineering hatch clipped to a region — the defense layer.
  function hatchRegion(ctx, g, builders, rgb, t, mirror) {
    if (t <= 0.02) return;
    ctx.save();
    ctx.beginPath();
    builders.forEach(function (b) { b(ctx, g); });
    ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(' + rgb + ',' + (t * ZONE_HATCH_MAX).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, g.s * 0.14);
    var step = 2.5 * g.s;
    var span = g.w + g.h;
    ctx.beginPath();
    for (var d = -span; d <= span; d += step) {
      if (mirror) { // 135 degrees
        ctx.moveTo(d, 0);
        ctx.lineTo(d - span, span);
      } else {      // 45 degrees
        ctx.moveTo(d, 0);
        ctx.lineTo(d + span, span);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Data accents (validated against both the paper and dark surfaces):
  // orange = the Chimera / offense, blue = your guess / defense.
  var ORANGE_HEX = '#eb6834';
  var BLUE_HEX = '#2a78d6';
  var AMBER_RGB = '235,104,52';   // offense layer (orange)
  var BLUE_RGB = '42,120,214';    // defense layer (blue)
  var INK = '#111111';
  var MUTED = '#898781';

  function drawCourtLines(ctx, g) {
    ctx.save();
    ctx.strokeStyle = 'rgba(17,17,17,0.75)';
    ctx.lineWidth = Math.max(1, g.s * 0.09);

    // boundary + 5' survey ticks along baseline and sidelines
    ctx.strokeRect(0.5, 0.5, g.w - 1, g.h - 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(17,17,17,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var ft = 5; ft < 50; ft += 5) {
      ctx.moveTo(g.X(ft), g.Y(0));
      ctx.lineTo(g.X(ft), g.Y(1));
    }
    for (ft = 5; ft < 47; ft += 5) {
      ctx.moveTo(g.X(0), g.Y(ft));
      ctx.lineTo(g.X(1), g.Y(ft));
      ctx.moveTo(g.X(50), g.Y(ft));
      ctx.lineTo(g.X(49), g.Y(ft));
    }
    ctx.stroke();
    ctx.restore();

    // lane
    ctx.strokeRect(g.X(25 - g.KEY_W / 2), g.Y(g.KEY_H), g.KEY_W * g.s, g.KEY_H * g.s);

    // free-throw circle: solid top half, dashed bottom half (to rule)
    ctx.beginPath();
    ctx.arc(g.X(25), g.Y(g.KEY_H), g.FT_R * g.s, Math.PI, 0, false);
    ctx.stroke();
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(g.X(25), g.Y(g.KEY_H), g.FT_R * g.s, 0, Math.PI, false);
    ctx.stroke();
    ctx.restore();

    // restricted-area arc
    ctx.beginPath();
    pathRA(ctx, g);
    ctx.stroke();

    // backboard (6' wide, 4' from baseline) + rim (9" radius)
    ctx.beginPath();
    ctx.moveTo(g.X(22), g.Y(4));
    ctx.lineTo(g.X(28), g.Y(4));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), 0.75 * g.s, 0, Math.PI * 2);
    ctx.stroke();

    // 3PT boundary: corner lines + arc
    ctx.beginPath();
    ctx.moveTo(g.X(25 - g.CORNER), g.Y(0));
    ctx.lineTo(g.X(25 - g.CORNER), g.Y(g.breakY));
    ctx.moveTo(g.X(25 + g.CORNER), g.Y(0));
    ctx.lineTo(g.X(25 + g.CORNER), g.Y(g.breakY));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(g.X(g.RIM.x), g.Y(g.RIM.y), g.R3 * g.s, g.leftAngle, g.rightAngle, false);
    ctx.stroke();

    ctx.restore();
  }

  // Dimension callouts — the survey layer that makes it read as a diagram.
  function drawCourtDimensions(ctx, g) {
    ctx.save();
    ctx.strokeStyle = 'rgba(137,135,129,0.8)';
    ctx.fillStyle = MUTED;
    ctx.lineWidth = 1;
    ctx.font = '600 ' + Math.max(7, 1.45 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // R = 23.75' radius from the rim, drawn up-left at 128 degrees
    var a = Math.PI * 128 / 180;
    var fx = g.RIM.x + g.R3 * Math.cos(a), fy = g.RIM.y + g.R3 * Math.sin(a);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(g.X(g.RIM.x), g.Y(g.RIM.y));
    ctx.lineTo(g.X(fx), g.Y(fy));
    ctx.stroke();
    ctx.restore();
    ctx.fillText("R 23'9″", g.X((g.RIM.x + fx) / 2 - 4.4), g.Y((g.RIM.y + fy) / 2));

    // corner distance and restricted-area radius
    ctx.fillText("22'", g.X(25 - g.CORNER + 2.2), g.Y(g.breakY - 2.6));
    ctx.fillText("RA 4'", g.X(g.RIM.x + 7.6), g.Y(g.RIM.y + 4.6));
    ctx.restore();
  }

  function zoneSigmaLabel(ctx, g, ftx, fty, name, z, rgbHex, minAbs) {
    if (typeof minAbs === 'number' && Math.abs(z) < minAbs) return;
    var px = g.X(ftx), py = g.Y(fty);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 ' + Math.max(6.5, 1.3 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = MUTED;
    ctx.textBaseline = 'bottom';
    ctx.fillText(name, px, py - 1);
    ctx.font = '700 ' + Math.max(8, 1.7 * g.s) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = rgbHex || INK;
    ctx.textBaseline = 'top';
    ctx.fillText((z >= 0 ? '+' : '−') + Math.abs(z).toFixed(1) + 'σ', px, py + 1);
    ctx.restore();
  }

  function drawZones(ctx, g, offense, defense) {
    // ---- offense: region fills with hard boundaries ----
    fillRegion(ctx, g, [pathRA], AMBER_RGB, zoneT(offense.rim));
    fillRegion(ctx, g, [pathKey, pathRA], AMBER_RGB, zoneT(offense.paintFT));
    fillRegion(ctx, g, [pathInside3, pathKey], AMBER_RGB, zoneT(offense.mid));
    fillRegion(ctx, g, [pathCourt, pathInside3], AMBER_RGB, zoneT(offense.arc));

    // ---- defense: 45-degree hatch layers ----
    hatchRegion(ctx, g, [pathKey], BLUE_RGB, zoneT(defense.paintD), false);
    hatchRegion(ctx, g, [pathCourt, pathInside3], BLUE_RGB, zoneT(defense.perimeterD) * 0.65, true);

    // ---- the glass: mirrored blocks flanking the rim ----
    var BOX = 3; // ft
    ctx.save();
    ctx.lineWidth = 1;
    // offensive glass, left block
    ctx.beginPath();
    ctx.rect(g.X(14.6), g.Y(2.4 + BOX), BOX * g.s, BOX * g.s);
    ctx.fillStyle = 'rgba(' + AMBER_RGB + ',' + (zoneT(offense.oreb) * ZONE_FILL_MAX + 0.04).toFixed(3) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + AMBER_RGB + ',0.9)';
    ctx.stroke();
    // defensive glass, right block (mirror)
    ctx.beginPath();
    ctx.rect(g.X(50 - 14.6 - BOX), g.Y(2.4 + BOX), BOX * g.s, BOX * g.s);
    ctx.fillStyle = 'rgba(' + BLUE_RGB + ',' + (zoneT(defense.glassD) * ZONE_FILL_MAX + 0.04).toFixed(3) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + BLUE_RGB + ',0.9)';
    ctx.stroke();
    ctx.restore();

    // ---- playmaking: straight passing vectors with arrowheads ----
    var astT = zoneT(offense.ast);
    if (astT > 0.05) {
      ctx.save();
      ctx.strokeStyle = 'rgba(' + AMBER_RGB + ',' + Math.min(1, astT + 0.2).toFixed(3) + ')';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1, g.s * 0.16);
      ctx.setLineDash([4, 3]);
      var o = { x: 25, y: g.KEY_H + 4.5 }; // just above the FT line
      [{ x: 9, y: 18 }, { x: 41, y: 18 }, { x: 25, y: 7.2 }].forEach(function (t) {
        var dx = g.X(t.x) - g.X(o.x), dy = g.Y(t.y) - g.Y(o.y);
        var len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        var hx = g.X(t.x) - ux * 4, hy = g.Y(t.y) - uy * 4;
        ctx.beginPath();
        ctx.moveTo(g.X(o.x), g.Y(o.y));
        ctx.lineTo(hx, hy);
        ctx.stroke();
        // arrowhead
        ctx.save();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(g.X(t.x), g.Y(t.y));
        ctx.lineTo(hx - uy * 2.4, hy + ux * 2.4);
        ctx.lineTo(hx + uy * 2.4, hy - ux * 2.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    }
  }

  function drawZoneLabels(ctx, g, offense, defense) {
    // offense: every shooting region carries its sigma, always
    zoneSigmaLabel(ctx, g, 25, 8.4, 'RIM', offense.rim, INK);
    zoneSigmaLabel(ctx, g, 25, 16.6, 'FTA', offense.paintFT, INK);
    zoneSigmaLabel(ctx, g, 10.2, 11.4, 'MID', offense.mid, INK);
    zoneSigmaLabel(ctx, g, 25, 33.5, '3PT', offense.arc, INK);
    // defense: labeled when the hatch is visible
    zoneSigmaLabel(ctx, g, 31.2, 12.6, 'BLK', defense.paintD, BLUE_HEX, 0.35);
    zoneSigmaLabel(ctx, g, 43.6, 27.5, 'STL', defense.perimeterD, BLUE_HEX, 0.35);
    // the glass blocks
    zoneSigmaLabel(ctx, g, 10.5, 3.2, 'OREB', offense.oreb, INK, 0.35);
    zoneSigmaLabel(ctx, g, 39.5, 3.2, 'DREB', defense.glassD, BLUE_HEX, 0.35);
  }

  // Measures the canvas's actual laid-out CSS width (like resizeSquareCanvas)
  // rather than assuming a fixed 300px card width — crisp at any viewport,
  // including narrow mobile widths where the card is smaller than 300px.
  var COURT_ASPECT = 47 / 50; // h/w, matches the CSS aspect-ratio: 50/47

  function resizeCourtCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var wCss = Math.max(rect.width || canvas.clientWidth, 160);
    var hCss = wCss * COURT_ASPECT;
    canvas.width = Math.round(wCss * dpr);
    canvas.height = Math.round(hCss * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, wCss: wCss, hCss: hCss };
  }

  // Screen-reader text summaries generated from the same zone/vector data
  // that drives the canvas court and the SVG breakdown chart, so anyone
  // using assistive tech gets the same numbers sighted users see.
  function fmtSigma(z) {
    return (z >= 0 ? '+' : '−') + Math.abs(z).toFixed(1) + 'σ';
  }

  function zonesSummaryText(label, zones) {
    return label + ' zones: rim ' + fmtSigma(zones.rim) + ', midrange ' + fmtSigma(zones.mid) +
      ', arc ' + fmtSigma(zones.arc) + ', free-throw line ' + fmtSigma(zones.paintFT) +
      ', offensive glass ' + fmtSigma(zones.oreb) + ', passing ' + fmtSigma(zones.ast) +
      ', rim protection ' + fmtSigma(zones.paintD) + ', perimeter defense ' + fmtSigma(zones.perimeterD) +
      ', defensive glass ' + fmtSigma(zones.glassD) + '.';
  }

  function breakdownSummaryText(targetVector, guessVector) {
    var parts = DATA.features.map(function (key, i) {
      var label = DATA.featureLabels[key];
      return label + ': Chimera ' + fmtSigma(targetVector[i]) + ', your guess ' + fmtSigma(guessVector[i]);
    });
    return 'Dimensional breakdown, sigma vs era, all 14 dimensions. ' + parts.join('; ') + '.';
  }

  function renderCourt(canvas, vector) {
    var r = resizeCourtCanvas(canvas);
    var ctx = r.ctx, wCss = r.wCss, hCss = r.hCss;
    ctx.clearRect(0, 0, wCss, hCss);
    var g = courtGeometry(wCss, hCss);
    var zones = zoneRaw(vector);
    drawZones(ctx, g, zones, zones);
    drawCourtLines(ctx, g);
    drawCourtDimensions(ctx, g);
    drawZoneLabels(ctx, g, zones, zones);
    return zones;
  }

  // ---------------------------------------------------------------------
  // Dimensional breakdown: diverging two-series bar chart (SVG)
  // 14 labeled rows, x = sigmas vs era, zero baseline, hairline grid.
  // ---------------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function renderBreakdown(targetVector, guessVector, guessName) {
    var host = els.breakdownChart;
    host.innerHTML = '';

    var W = 640, LEFT = 150, RIGHT = 20, TOP = 22;
    var ROW = 26, SEP = 18, BOT = 8;
    var H = TOP + 14 * ROW + SEP + BOT;
    var plotW = W - LEFT - RIGHT;
    var XMIN = -4, XMAX = 4;

    function xOf(v) {
      if (v < XMIN) v = XMIN;
      if (v > XMAX) v = XMAX;
      return LEFT + (v - XMIN) / (XMAX - XMIN) * plotW;
    }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    // find the biggest-gap dimensions for selective direct labels
    var gaps = [];
    for (var gi = 0; gi < 14; gi++) {
      gaps.push({ i: gi, g: Math.abs(targetVector[gi] - guessVector[gi]) });
    }
    gaps.sort(function (a, b) { return b.g - a.g; });
    var labelRows = {};
    labelRows[gaps[0].i] = true;
    labelRows[gaps[1].i] = true;
    labelRows[gaps[2].i] = true;

    function rowY(i) {
      return TOP + i * ROW + (i >= 7 ? SEP : 0);
    }

    // gridlines each sigma; labels every 2
    for (var t = XMIN; t <= XMAX; t++) {
      var gx = xOf(t);
      svgEl('line', {
        x1: gx, y1: TOP - 4, x2: gx, y2: H - BOT,
        stroke: t === 0 ? '#111111' : '#e1e0d9',
        'stroke-width': t === 0 ? 1.5 : 1
      }, svg);
      if (t % 2 === 0) {
        var tl = svgEl('text', {
          x: gx, y: TOP - 9, 'text-anchor': 'middle',
          'font-size': 10, fill: '#898781'
        }, svg);
        tl.textContent = (t > 0 ? '+' : '') + t + 'σ';
      }
    }

    // half separator label between rows 6 and 7
    var sepY = TOP + 7 * ROW + SEP / 2;
    svgEl('line', {
      x1: 8, y1: sepY, x2: W - 8, y2: sepY,
      stroke: '#e1e0d9', 'stroke-width': 1, 'stroke-dasharray': '4 4'
    }, svg);
    var sepText = svgEl('text', {
      x: LEFT, y: sepY - 4, 'font-size': 9, fill: '#898781',
      'text-anchor': 'start', 'letter-spacing': '0.08em'
    }, svg);
    sepText.textContent = 'COUNTING-STAT HALF ABOVE · SHOOTING / IMPACT HALF BELOW';

    var BAR_H = 6, BAR_GAP = 2;

    function bar(y, v, color, title) {
      var x0 = xOf(0), x1 = xOf(v);
      var g = svgEl('g', {}, svg);
      svgEl('rect', {
        x: Math.min(x0, x1), y: y,
        width: Math.max(1, Math.abs(x1 - x0)), height: BAR_H,
        rx: 2, fill: color
      }, g);
      var titleEl = document.createElementNS(SVG_NS, 'title');
      titleEl.textContent = title;
      g.appendChild(titleEl);
      // oversized invisible hit target for the hover
      svgEl('rect', {
        x: LEFT, y: y - 2, width: plotW, height: BAR_H + 4,
        fill: 'transparent'
      }, g);
      return g;
    }

    for (var i = 0; i < 14; i++) {
      var y = rowY(i);
      var label = DATA.featureLabels[DATA.features[i]];
      var tv = targetVector[i], gv = guessVector[i];

      var lt = svgEl('text', {
        x: LEFT - 8, y: y + BAR_H + BAR_GAP / 2 + 1,
        'text-anchor': 'end', 'font-size': 11, fill: '#52514e'
      }, svg);
      lt.textContent = label;

      bar(y, tv, ORANGE_HEX, 'Chimera · ' + label + ': ' +
        (tv >= 0 ? '+' : '') + tv.toFixed(1) + 'σ');
      bar(y + BAR_H + BAR_GAP, gv, BLUE_HEX, (guessName || 'Your guess') +
        ' · ' + label + ': ' + (gv >= 0 ? '+' : '') + gv.toFixed(1) + 'σ');

      // selective direct labels on the 3 biggest-gap dimensions
      if (labelRows[i]) {
        var vt = svgEl('text', {
          x: xOf(tv) + (tv >= 0 ? 4 : -4), y: y + BAR_H - 1,
          'text-anchor': tv >= 0 ? 'start' : 'end',
          'font-size': 9, fill: '#111111', 'font-weight': 700
        }, svg);
        vt.textContent = (tv >= 0 ? '+' : '') + tv.toFixed(1);
        var vg = svgEl('text', {
          x: xOf(gv) + (gv >= 0 ? 4 : -4), y: y + 2 * BAR_H + BAR_GAP,
          'text-anchor': gv >= 0 ? 'start' : 'end',
          'font-size': 9, fill: '#111111', 'font-weight': 700
        }, svg);
        vg.textContent = (gv >= 0 ? '+' : '') + gv.toFixed(1);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Career Arc: compact single-series "mini sigma bars" card — same
  // diverging-bar-vs-era visual language as the breakdown chart above
  // (orange positive / blue negative, sigma-scaled), shrunk to a 14-row
  // fingerprint with no numeric labels (the puzzle is unlabeled cards).
  // Per-bar <title> + an aria-label summary keep it screen-reader honest.
  // ---------------------------------------------------------------------

  var MINIBAR_XMAX = 4;

  function miniSigmaSummaryText(vector) {
    var parts = DATA.features.map(function (key, i) {
      return DATA.featureLabels[key] + ' ' + fmtSigma(vector[i]);
    });
    return 'Sigma profile, 14 dimensions vs era: ' + parts.join(', ') + '.';
  }

  function renderMiniSigmaBars(host, vector) {
    host.innerHTML = '';
    var W = 130, ROWH = 4.4, GAP = 1.2;
    var H = vector.length * (ROWH + GAP);
    var mid = W / 2, half = W / 2 - 3;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H }, host);
    svgEl('line', { x1: mid, y1: 0, x2: mid, y2: H, stroke: '#e1e0d9', 'stroke-width': 1 }, svg);
    for (var i = 0; i < vector.length; i++) {
      var v = Math.max(-MINIBAR_XMAX, Math.min(MINIBAR_XMAX, vector[i]));
      var w = Math.max(1, Math.abs(v) / MINIBAR_XMAX * half);
      var x = v >= 0 ? mid : mid - w;
      var y = i * (ROWH + GAP);
      var rect = svgEl('rect', {
        x: x, y: y, width: w, height: ROWH, rx: 1,
        fill: v >= 0 ? ORANGE_HEX : BLUE_HEX
      }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = DATA.featureLabels[DATA.features[i]] + ': ' + fmtSigma(vector[i]);
      rect.appendChild(title);
    }
  }

  // Arc line chart: PTS (index 0) sigma trajectory across every charted
  // season for the player, oldest to newest — straight from vectors.json,
  // nothing derived beyond the existing z-scores.
  function renderArcLineChart(host, seasonsAsc) {
    host.innerHTML = '';
    var W = 640, LEFT = 30, RIGHT = 14, TOP = 16, BOT = 26;
    var H = 160;
    var plotW = W - LEFT - RIGHT, plotH = H - TOP - BOT;
    var XMIN = -4, XMAX = 4;
    var n = seasonsAsc.length;

    function xOf(i) { return n <= 1 ? LEFT + plotW / 2 : LEFT + (i / (n - 1)) * plotW; }
    function yOf(v) {
      var c = Math.max(XMIN, Math.min(XMAX, v));
      return TOP + (1 - (c - XMIN) / (XMAX - XMIN)) * plotH;
    }

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      'font-family': getComputedStyle(document.body).fontFamily
    }, host);

    var zeroY = yOf(0);
    svgEl('line', { x1: LEFT, y1: zeroY, x2: W - RIGHT, y2: zeroY, stroke: '#111111', 'stroke-width': 1 }, svg);
    svgEl('text', { x: LEFT - 6, y: zeroY + 3, 'text-anchor': 'end', 'font-size': 9, fill: '#898781' }, svg).textContent = '0σ';

    var points = seasonsAsc.map(function (p, i) { return xOf(i) + ',' + yOf(p.v[IDX.PTS]); }).join(' ');
    svgEl('polyline', { points: points, fill: 'none', stroke: ORANGE_HEX, 'stroke-width': 2 }, svg);

    seasonsAsc.forEach(function (p, i) {
      var cx = xOf(i), cy = yOf(p.v[IDX.PTS]);
      var dot = svgEl('circle', { cx: cx, cy: cy, r: 3.5, fill: ORANGE_HEX }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = p.season + ': ' + fmtSigma(p.v[IDX.PTS]) + ' scoring';
      dot.appendChild(title);
      if (n <= 16 || i % Math.ceil(n / 16) === 0 || i === n - 1) {
        svgEl('text', {
          x: cx, y: H - 8, 'text-anchor': 'middle', 'font-size': 8, fill: '#898781'
        }, svg).textContent = p.season.slice(2, 4);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Chimera mode: guessing + feedback
  // ---------------------------------------------------------------------

  function pctColorClass(sim) {
    if (sim >= 0.85) return 'vh-guess__pct--hot';
    if (sim >= 0.60) return 'vh-guess__pct--warm';
    return 'vh-guess__pct--cold';
  }

  function coachingLine(targetVector, guessVector) {
    var diffs = [];
    for (var i = 0; i < targetVector.length; i++) {
      diffs.push({ i: i, d: targetVector[i] - guessVector[i] });
    }
    diffs.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var top3 = diffs.slice(0, 3);
    var parts = top3.map(function (entry) {
      var label = DATA.featureLabels[DATA.features[entry.i]];
      var mag = Math.abs(entry.d).toFixed(1);
      return entry.d > 0
        ? 'more ' + label + ' (+' + mag + 'σ)'
        : 'less ' + label + ' (−' + mag + 'σ)';
    });
    return 'You need ' + parts.join(', ') + '.';
  }

  function coachingLineTop1(targetVector, guessVector) {
    var diffs = [];
    for (var i = 0; i < targetVector.length; i++) {
      diffs.push({ i: i, d: targetVector[i] - guessVector[i] });
    }
    diffs.sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var top = diffs[0];
    var label = DATA.featureLabels[DATA.features[top.i]];
    var mag = Math.abs(top.d).toFixed(1);
    return 'Biggest gap: ' + (top.d > 0
      ? 'more ' + label + ' (+' + mag + 'σ).'
      : 'less ' + label + ' (−' + mag + 'σ).');
  }

  function clusterLine(guessPlayer) {
    var guessCluster = DATA.clusters[guessPlayer.c];
    var targetCluster = DATA.clusters[TARGET.clusterIdx];
    if (guessPlayer.c === TARGET.clusterIdx) {
      return "You're already in the Chimera's home archetype: <b>" + targetCluster + '</b>.';
    }
    return "You're in <b>" + guessCluster + '</b>; the Chimera lives in <b>' + targetCluster + '</b>.';
  }

  // Exact name+season match against either fused component: the IDENTIFIED
  // win state. Independent of raw cosine similarity — a correct identification
  // always wins and always renders gold, never red, whatever the sim% reads.
  function isIdentifiedGuess(guessPlayer) {
    if (guessPlayer.name === TARGET.a.name && guessPlayer.season === TARGET.a.season) return true;
    if (guessPlayer.name === TARGET.b.name && guessPlayer.season === TARGET.b.season) return true;
    return false;
  }

  // Right player, wrong season: same name as a fused component but a
  // different season. Not a win — surfaced as explicit coaching instead.
  function wrongSeasonNote(guessPlayer) {
    if (guessPlayer.name === TARGET.a.name && guessPlayer.season !== TARGET.a.season) {
      return 'Right player, wrong season — this Chimera uses ' + guessPlayer.name +
        ' (' + TARGET.a.season + ').';
    }
    if (guessPlayer.name === TARGET.b.name && guessPlayer.season !== TARGET.b.season) {
      return 'Right player, wrong season — this Chimera uses ' + guessPlayer.name +
        ' (' + TARGET.b.season + ').';
    }
    return null;
  }

  function isWinningGuess(guessPlayer, sim) {
    if (isIdentifiedGuess(guessPlayer)) return true;
    if (sim >= WIN_SIMILARITY) return true;
    return false;
  }

  function renderGuessRow(entry, idx) {
    var li = document.createElement('li');
    li.className = 'vh-guess' + (entry.identified ? ' is-identified' : '');
    var pct = Math.round(entry.sim * 100);
    var pctHtml;
    if (entry.identified) {
      // IDENTIFIED win: gold styling always, sim% shown only as secondary info.
      pctHtml = '<span class="vh-guess__badge">Identified</span>' +
        '<span class="vh-guess__pct vh-guess__pct--identified">' + pct + '% match</span>';
    } else {
      pctHtml = '<span class="vh-guess__pct ' + pctColorClass(entry.sim) + '">' + pct + '%</span>';
    }
    li.innerHTML =
      '<div class="vh-guess__head">' +
        '<span class="vh-guess__num">' + (idx + 1) + '</span>' +
        '<span class="vh-guess__name">' + entry.name + '</span>' +
        pctHtml +
      '</div>';
    if (entry.wrongSeasonNote) {
      var note = document.createElement('p');
      note.className = 'vh-guess__line vh-guess__line--season';
      note.textContent = entry.wrongSeasonNote;
      li.appendChild(note);
    }
    return li;
  }

  function renderWarmth(rec) {
    if (rec.guesses.length === 0) {
      els.warmthCard.hidden = true;
      return;
    }
    els.warmthCard.hidden = false;

    var bestIdx = 0, bestSim = -Infinity;
    rec.guesses.forEach(function (g, i) {
      if (g.sim > bestSim) { bestSim = g.sim; bestIdx = i; }
    });
    var lastIdx = rec.guesses.length - 1;
    var lastIsNewBest = lastIdx === bestIdx;

    els.warmthBars.innerHTML = '';
    rec.guesses.forEach(function (g, i) {
      var bar = document.createElement('div');
      bar.className = 'vh-warmth__bar';
      var pct = Math.max(0, Math.round(g.sim * 100));
      bar.style.height = Math.max(3, Math.round(pct * 0.4)) + 'px';
      if (i === lastIdx && lastIsNewBest) bar.classList.add('is-best');
      bar.title = g.name + ': ' + pct + '%';
      els.warmthBars.appendChild(bar);
    });

    var bestEntry = rec.guesses[bestIdx];
    els.warmthClosest.textContent = 'Closest: ' + bestEntry.name + ' — ' +
      Math.round(bestEntry.sim * 100) + '%';
  }

  // Redraws both court canvases at their current laid-out width, e.g. after
  // a viewport resize/rotation, using the last submitted guess if any.
  function redrawCourtsIfVisible() {
    var rec = todayRecord();
    if (!rec || rec.guesses.length === 0) return;
    var last = rec.guesses[rec.guesses.length - 1];
    var lastPlayer = DATA.players[last.id];
    if (!lastPlayer) return;
    renderCourt(els.courtTarget, TARGET.vector);
    renderCourt(els.courtGuess, lastPlayer.v);
  }

  function renderGuesses() {
    var rec = todayRecord();
    renderHints();
    renderEquationCollapse();
    els.guessList.innerHTML = rec.guesses.length ? '' : '<li class="vh-guesslist__empty">No guesses yet.</li>';
    rec.guesses.forEach(function (entry, idx) {
      els.guessList.appendChild(renderGuessRow(entry, idx));
    });
    if (els.historyCount) els.historyCount.textContent = String(rec.guesses.length);
    var left = Math.max(0, MAX_GUESSES - rec.guesses.length);
    els.guessesLeftNum.textContent = String(left);

    renderWarmth(rec);
    // Reset per-round cards before deciding what to show — necessary now
    // that a fresh Free Play round (or a mode switch) can present a rec
    // with zero guesses again after a completed one was on screen.
    els.resultCard.hidden = true;
    els.revealCard.hidden = true;

    if (rec.guesses.length > 0) {
      var last = rec.guesses[rec.guesses.length - 1];
      var lastPlayer = DATA.players[last.id];
      els.resultCard.hidden = false;
      els.scoreboardPct.textContent = Math.round(last.sim * 100) + '%';

      var targetZones = renderCourt(els.courtTarget, TARGET.vector);
      var guessZones = renderCourt(els.courtGuess, lastPlayer.v);
      els.courtGuessLabel.textContent = 'Your guess: ' + last.name;
      els.storyCaption.textContent = storyCaption(targetZones, guessZones);
      els.quickCoachingLine.textContent = coachingLineTop1(TARGET.vector, lastPlayer.v);
      renderBreakdown(TARGET.vector, lastPlayer.v, last.name);
      if (els.courtsSrSummary) {
        els.courtsSrSummary.textContent = zonesSummaryText('Chimera', targetZones) + ' ' +
          zonesSummaryText('Your guess', guessZones);
      }
      if (els.breakdownSrSummary) {
        els.breakdownSrSummary.textContent = breakdownSummaryText(TARGET.vector, lastPlayer.v);
      }
      els.clusterLine.innerHTML = clusterLine(lastPlayer);
      var coaching = coachingLine(TARGET.vector, lastPlayer.v);
      if (typeof lastPlayer.sal === 'number') {
        // salary z (era-honest payroll percentile) when the dataset has it
        var sSign = lastPlayer.sal >= 0 ? '+' : '−';
        coaching += ' Market: this guess held a ' + sSign +
          Math.abs(lastPlayer.sal).toFixed(1) + 'σ payroll slot for its season.';
      }
      els.coachingLine.textContent = coaching;
    }

    if (rec.done) {
      showReveal(rec);
      lockInput();
    }
  }

  function lockInput() {
    els.chimeraInput.disabled = true;
    els.chimeraSubmit.disabled = true;
  }

  function unlockInput() {
    els.chimeraInput.disabled = false;
    els.chimeraInput.value = '';
    els.chimeraSubmit.disabled = true;
    pendingChimeraSelection = null;
    hideDuplicateWarning();
  }

  function shareEmojiRow(entry) {
    if (entry.identified) return '🟩⭐'; // IDENTIFIED win — starred variant
    if (entry.sim >= 0.85) return '🟩'; // green
    if (entry.sim >= 0.60) return '🟨'; // yellow
    return '🟥'; // red
  }

  // M5 share v2: warmth trail — block glyphs from each guess's match %,
  // same thresholds as the on-screen warmth bars (renderWarmth).
  function warmthBlockFor(sim) {
    if (sim >= 0.85) return '█';
    if (sim >= 0.60) return '▅';
    if (sim >= 0.35) return '▃';
    return '▁';
  }

  function warmthTrailLine(rec) {
    return rec.guesses.map(function (g) { return warmthBlockFor(g.sim); }).join('');
  }

  // Only reachable once the round is over (the share button lives on the
  // reveal card, which only renders when rec.done) — safe to name both
  // real donors here since the puzzle is already solved or exhausted.
  function buildShareText(rec) {
    var rows = rec.guesses.map(shareEmojiRow).join('');
    var trail = warmthTrailLine(rec);
    var scoreLabel = rec.won ? String(rec.guesses.length) : 'X';
    var equation = TARGET.a.name + ' + ' + TARGET.b.name + ' = ?';
    if (activeChimeraMode === 'practice') {
      return 'Vector Hoops — practice chimera — ' + equation + ' ' + scoreLabel + '/' + MAX_GUESSES +
        '\n' + rows + '\n' + trail;
    }
    var n = puzzleNumber(TODAY);
    return 'Vector Hoops #' + n + ' — ' + equation + ' ' + scoreLabel + '/' + MAX_GUESSES + '\n' + rows + '\n' + trail;
  }

  function showReveal(rec) {
    els.revealCard.hidden = false;
    var practiceNote = activeChimeraMode === 'practice' ? ' (practice)' : '';
    els.revealTitle.textContent = (rec.won ? 'Solved' : 'The Chimera') + practiceNote;
    els.revealBody.innerHTML =
      'Fused from <b>' + playerKey(TARGET.a) + '</b> (' + traitList([0, 1, 2, 3, 4, 5, 6]).join(', ') + ') and <b>' +
      playerKey(TARGET.b) + '</b> (' + traitList([7, 8, 9, 10, 11, 12, 13]).join(', ') + ').' +
      '<div class="vh-reveal__okf">OKF dossiers: ' +
      '<a href="#" class="vh-dossier-link" data-slug="' + playerSlug(TARGET.a.name) + '" data-name="' +
        TARGET.a.name + '">' + TARGET.a.name + '</a> · ' +
      '<a href="#" class="vh-dossier-link" data-slug="' + playerSlug(TARGET.b.name) + '" data-name="' +
        TARGET.b.name + '">' + TARGET.b.name + '</a></div>';
    els.shareCopied.hidden = true;
  }

  function showDuplicateWarning(p) {
    els.duplicateWarning.textContent = 'Already guessed ' + playerKey(p) + ' — try a different player-season.';
    els.duplicateWarning.hidden = false;
  }

  function hideDuplicateWarning() {
    els.duplicateWarning.hidden = true;
    els.duplicateWarning.textContent = '';
  }

  function submitGuess() {
    var p = pendingChimeraSelection;
    if (!p) return;
    var rec = todayRecord();
    if (rec.done || rec.guesses.length >= MAX_GUESSES) return;

    // Duplicate guard: same player-season resubmitted doesn't consume a guess.
    var isDuplicate = rec.guesses.some(function (g) { return g.id === p.id; });
    if (isDuplicate) {
      showDuplicateWarning(p);
      return;
    }
    hideDuplicateWarning();

    var sim = cosineSim(TARGET.vector, p.v);
    var identified = isIdentifiedGuess(p);
    var entry = {
      id: p.id,
      name: playerKey(p),
      sim: sim,
      identified: identified,
      wrongSeasonNote: identified ? null : wrongSeasonNote(p)
    };
    rec.guesses.push(entry);
    track('vh-guess', { guesses: rec.guesses.length, mode: activeChimeraMode === 'practice' ? 'free' : 'daily' });

    var won = isWinningGuess(p, sim);
    if (won || rec.guesses.length >= MAX_GUESSES) {
      registerCompletion(won);
    } else if (activeChimeraMode !== 'practice') {
      saveState();
    }

    pendingChimeraSelection = null;
    els.chimeraInput.value = '';
    els.chimeraSubmit.disabled = true;
    renderGuesses();
    renderMapOnce();
  }

  var pendingChimeraSelection = null;

  // ---------------------------------------------------------------------
  // 3D starfield map: manual perspective projection, no libraries
  // ---------------------------------------------------------------------

  // 8 cluster hues, fixed order, validated for the dark map surface
  // (CVD-checked; identity is backed by the labeled legend + numbered pins).
  var PALETTE = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9',
                 '#e66767', '#d55181', '#d95926'];

  // 5 position hues (PG SG SF PF C), validated on the dark map surface —
  // worst adjacent CVD deltaE 41.3, all >= 3:1 contrast. Gray = unknown.
  var POS_PALETTE = ['#3987e5', '#c98500', '#199e70', '#9085e9', '#e66767'];
  var POS_UNKNOWN = '#6f6e69';
  var mapColorMode = 'pos'; // 'pos' | 'cluster'; falls back if no position data

  function playerColor(p) {
    if (mapColorMode === 'pos' && typeof p.p === 'number' && p.p >= 0) {
      return POS_PALETTE[p.p % POS_PALETTE.length];
    }
    if (mapColorMode === 'pos') return POS_UNKNOWN;
    return PALETTE[p.c % PALETTE.length];
  }

  // Project any 14-dim vector into map space via the affine PCA map the
  // pipeline embeds (proj.W 14x3, proj.b 3). Exact — not an approximation.
  function projectVector(v) {
    if (!DATA.proj) return null;
    var W = DATA.proj.W, b = DATA.proj.b;
    var out = [b[0], b[1], b[2]];
    for (var i = 0; i < 14; i++) {
      out[0] += v[i] * W[i][0];
      out[1] += v[i] * W[i][1];
      out[2] += v[i] * W[i][2];
    }
    for (var d = 0; d < 3; d++) out[d] = Math.max(0, Math.min(1, out[d]));
    return { x: out[0], y: out[1], z: out[2] };
  }

  var PREFERS_REDUCED_MOTION = false;
  try {
    PREFERS_REDUCED_MOTION = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { PREFERS_REDUCED_MOTION = false; }

  var mapCam = {
    yaw: 0.6,
    pitch: 0.28,
    zoom: 1,
    focal: 2.6,
    autoRotate: !PREFERS_REDUCED_MOTION,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pinchDist: null,
    rafId: null
  };

  function resizeSquareCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(rect.width, 240);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, size: w };
  }

  function project3D(x, y, z, size, cam) {
    // center to [-1, 1]-ish cube
    var px = (x - 0.5) * 2;
    var py = (y - 0.5) * 2;
    var pz = (z - 0.5) * 2;

    // rotate around Y (yaw)
    var cosY = Math.cos(cam.yaw), sinY = Math.sin(cam.yaw);
    var x1 = px * cosY + pz * sinY;
    var z1 = -px * sinY + pz * cosY;

    // rotate around X (pitch)
    var cosX = Math.cos(cam.pitch), sinX = Math.sin(cam.pitch);
    var y2 = py * cosX - z1 * sinX;
    var z2 = py * sinX + z1 * cosX;

    var focal = cam.focal / cam.zoom;
    var zc = z2 + focal;
    if (zc < 0.2) zc = 0.2;
    var scale = focal / zc;

    var half = size / 2;
    return {
      sx: half + x1 * scale * half * 0.85,
      sy: half - y2 * scale * half * 0.85,
      scale: scale,
      depth: zc
    };
  }

  // Wireframe axis cube: the unit PCA box, so the starfield reads as a
  // graph with visible dimensions rather than a free-floating cloud.
  var CUBE_CORNERS = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  var CUBE_EDGES = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  function drawAxisCube(ctx, size) {
    var pts = CUBE_CORNERS.map(function (c) {
      return project3D(c[0], c[1], c[2], size, mapCam);
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(137,135,129,0.30)';
    ctx.lineWidth = 1;
    CUBE_EDGES.forEach(function (e) {
      ctx.beginPath();
      ctx.moveTo(pts[e[0]].sx, pts[e[0]].sy);
      ctx.lineTo(pts[e[1]].sx, pts[e[1]].sy);
      ctx.stroke();
    });
    // tick marks at quarters along the three labeled axes
    ctx.strokeStyle = 'rgba(137,135,129,0.45)';
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (axis) {
      for (var t = 0.25; t < 1; t += 0.25) {
        var p = project3D(axis[0] * t, axis[1] * t, axis[2] * t, size, mapCam);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    // axis labels just past the +1 corner of each axis: PC number on the
    // first line, its basketball meaning on the second
    ctx.fillStyle = 'rgba(195,194,183,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var ends = [
      project3D(1.1, 0, 0, size, mapCam),
      project3D(0, 1.12, 0, size, mapCam),
      project3D(0, 0, 1.1, size, mapCam)
    ];
    var fam = getComputedStyle(document.body).fontFamily;
    for (var ai = 0; ai < 3; ai++) {
      var axis = (DATA && DATA.axes && DATA.axes[ai]) || null;
      ctx.font = '700 11px ' + fam;
      ctx.fillText('PC' + (ai + 1), ends[ai].sx, ends[ai].sy - 6);
      if (axis && axis.name) {
        ctx.font = '600 9px ' + fam;
        ctx.fillText(axis.name.toUpperCase(), ends[ai].sx, ends[ai].sy + 6);
      }
    }
    ctx.restore();
  }

  // Distinct target marker: an orange diamond crosshair at the Chimera's
  // exact projected position — this is the point you are guessing toward.
  function drawTargetMarker(ctx, size, xyz, label) {
    var pr = project3D(xyz.x, xyz.y, xyz.z, size, mapCam);
    var r = Math.max(7, 10 * pr.scale);
    ctx.save();
    ctx.strokeStyle = ORANGE_HEX;
    ctx.fillStyle = ORANGE_HEX;
    ctx.lineWidth = 2;
    // diamond
    ctx.beginPath();
    ctx.moveTo(pr.sx, pr.sy - r);
    ctx.lineTo(pr.sx + r, pr.sy);
    ctx.lineTo(pr.sx, pr.sy + r);
    ctx.lineTo(pr.sx - r, pr.sy);
    ctx.closePath();
    ctx.stroke();
    // crosshair ticks
    ctx.beginPath();
    ctx.moveTo(pr.sx - r - 6, pr.sy); ctx.lineTo(pr.sx - r - 1, pr.sy);
    ctx.moveTo(pr.sx + r + 1, pr.sy); ctx.lineTo(pr.sx + r + 6, pr.sy);
    ctx.moveTo(pr.sx, pr.sy - r - 6); ctx.lineTo(pr.sx, pr.sy - r - 1);
    ctx.moveTo(pr.sx, pr.sy + r + 1); ctx.lineTo(pr.sx, pr.sy + r + 6);
    ctx.stroke();
    // center dot
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.font = '700 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, pr.sx, pr.sy - r - 8);
    }
    ctx.restore();
    return pr;
  }

  function renderMap() {
    if (!DATA) return;
    var canvas = els.map;
    var r = resizeSquareCanvas(canvas);
    var ctx = r.ctx, size = r.size;

    ctx.clearRect(0, 0, size, size);
    drawAxisCube(ctx, size);

    var players = DATA.players;
    var projected = new Array(players.length);
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var proj = project3D(p.x, p.y, p.z, size, mapCam);
      projected[i] = proj;
    }

    // painter's algorithm: farthest first
    var order = players.map(function (_, i) { return i; });
    order.sort(function (a, b) { return projected[b].depth - projected[a].depth; });

    var maxDepth = mapCam.focal * 2.2;
    for (var oi = 0; oi < order.length; oi++) {
      var idx = order[oi];
      var pl = players[idx];
      var pr = projected[idx];
      var depthT = Math.max(0, Math.min(1, pr.depth / maxDepth));
      var alpha = 0.55 * (1 - depthT) + 0.05;
      var radius = Math.max(0.6, 2.4 * pr.scale);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = playerColor(pl);
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    var rec = todayRecord();

    // the Chimera itself: exact projection of the fused vector — the point
    // you are guessing toward. Falls back to the home-cluster centroid on
    // datasets without the embedded projection.
    var chimeraXYZ = projectVector(TARGET.vector) || CLUSTER_XYZ[TARGET.clusterIdx];
    drawTargetMarker(ctx, size, chimeraXYZ, 'CHIMERA');

    // once the round is over, pin the two real component seasons
    if (rec.done) {
      [TARGET.a, TARGET.b].forEach(function (pl, ci) {
        var pr = project3D(pl.x, pl.y, pl.z, size, mapCam);
        ctx.fillStyle = '#131312';
        ctx.strokeStyle = ORANGE_HEX;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ORANGE_HEX;
        ctx.font = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ci === 0 ? 'A' : 'B', pr.sx, pr.sy + 1);
      });
    }

    // numbered guess pins, always on top
    rec.guesses.forEach(function (entry, gi) {
      var pl = players[entry.id];
      if (!pl) return;
      var pr = project3D(pl.x, pl.y, pl.z, size, mapCam);
      ctx.fillStyle = '#fafaf8';
      ctx.strokeStyle = BLUE_HEX;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pr.sx, pr.sy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(gi + 1), pr.sx, pr.sy + 1);
    });
  }

  var POS_LABEL = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };

  function renderMapLegend() {
    var entries;
    if (mapColorMode === 'pos' && DATA.positions) {
      entries = DATA.positions.map(function (pos, idx) {
        return { color: POS_PALETTE[idx % POS_PALETTE.length], name: pos + ' · ' + (POS_LABEL[pos] || pos) };
      });
      var hasUnknown = DATA.players.some(function (p) { return !(typeof p.p === 'number' && p.p >= 0); });
      if (hasUnknown) entries.push({ color: POS_UNKNOWN, name: 'unlisted' });
    } else {
      entries = DATA.clusters.map(function (name, idx) {
        return { color: PALETTE[idx % PALETTE.length], name: name };
      });
    }
    els.mapLegend.innerHTML = entries.map(function (e) {
      return '<span><span class="vh-legend-dot" style="background:' + e.color + '"></span>' + e.name + '</span>';
    }).join('');
  }

  // The three PCA dimensions, spelled out for a basketball fan:
  // "PC1 — On-ball load: low end -> high end".
  function renderMapAxesInfo() {
    if (!els.mapAxes) return;
    if (!DATA.axes) {
      els.mapAxes.textContent = 'PC1 / PC2 / PC3 of the era-normalized stat space';
      return;
    }
    els.mapAxes.innerHTML = DATA.axes.map(function (ax, i) {
      return '<div class="vh-map-axis-def"><b>PC' + (i + 1) + ' · ' + ax.name + '</b> — ' +
        ax.lo + ' &rarr; ' + ax.hi + '</div>';
    }).join('');
  }

  // mapVisible combines two signals: the <details> is open AND the canvas is
  // actually on-screen (IntersectionObserver). The rAF rotation loop is gated
  // on both — no rendering work happens while the map is collapsed or
  // scrolled out of the viewport.
  var mapVisible = false;
  var mapObserver = null;
  // Replaces the old <details open> flag now that the map lives in a sheet:
  // true while the map sheet is open (mobile: user-opened; desktop: pinned).
  var mapSheetOpen = false;

  function mapLoop() {
    if (!mapVisible || !mapCam.autoRotate || mapCam.dragging) {
      mapCam.rafId = null;
      return;
    }
    mapCam.yaw += 0.0028;
    renderMap();
    mapCam.rafId = requestAnimationFrame(mapLoop);
  }

  function startMapLoopIfNeeded() {
    if (mapCam.rafId != null) return;
    if (mapVisible && mapCam.autoRotate && !mapCam.dragging) {
      mapCam.rafId = requestAnimationFrame(mapLoop);
    }
  }

  function stopMapLoop() {
    if (mapCam.rafId != null) {
      cancelAnimationFrame(mapCam.rafId);
      mapCam.rafId = null;
    }
  }

  // Renders once — but only while the map is actually visible, so a guess
  // submitted while the map panel is collapsed/off-screen doesn't pay for a
  // wasted draw. The next open/scroll-into-view re-renders with fresh pins.
  function renderMapOnce() {
    if (!mapVisible) return;
    renderMap();
  }

  function setupMapVisibilityObserver() {
    if (typeof IntersectionObserver === 'undefined') {
      mapVisible = mapSheetOpen; // no IO support: sheet-open only
      return;
    }
    mapObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        mapVisible = entry.isIntersecting && mapSheetOpen;
        if (mapVisible) {
          renderMap();
          startMapLoopIfNeeded();
        } else {
          stopMapLoop();
        }
      });
    }, { threshold: 0.01 });
    mapObserver.observe(els.map);
  }

  function setupMapInteraction() {
    var canvas = els.map;

    canvas.addEventListener('pointerdown', function (ev) {
      mapCam.dragging = true;
      mapCam.lastX = ev.clientX;
      mapCam.lastY = ev.clientY;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
    });

    canvas.addEventListener('pointermove', function (ev) {
      if (!mapCam.dragging) return;
      var dx = ev.clientX - mapCam.lastX;
      var dy = ev.clientY - mapCam.lastY;
      mapCam.lastX = ev.clientX;
      mapCam.lastY = ev.clientY;
      mapCam.yaw += dx * 0.008;
      mapCam.pitch += dy * 0.008;
      mapCam.pitch = Math.max(-1.2, Math.min(1.2, mapCam.pitch));
      renderMap();
    });

    function endDrag() {
      if (!mapCam.dragging) return;
      mapCam.dragging = false;
      startMapLoopIfNeeded();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', function () {
      if (mapCam.dragging) endDrag();
    });

    canvas.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var factor = Math.exp(-ev.deltaY * 0.001);
      mapCam.zoom = Math.max(0.5, Math.min(3.5, mapCam.zoom * factor));
      renderMap();
    }, { passive: false });

    // two-finger pinch to zoom
    canvas.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 2) return;
      ev.preventDefault();
      var t0 = ev.touches[0], t1 = ev.touches[1];
      var d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (mapCam.pinchDist != null) {
        var factor = d / mapCam.pinchDist;
        mapCam.zoom = Math.max(0.5, Math.min(3.5, mapCam.zoom * factor));
        renderMap();
      }
      mapCam.pinchDist = d;
    }, { passive: false });
    canvas.addEventListener('touchend', function (ev) {
      if (ev.touches.length < 2) mapCam.pinchDist = null;
    });

    els.mapPauseBtn.addEventListener('click', function () {
      mapCam.autoRotate = !mapCam.autoRotate;
      els.mapPauseBtn.textContent = mapCam.autoRotate ? 'Pause' : 'Resume';
      if (mapCam.autoRotate) startMapLoopIfNeeded();
    });
    els.mapPauseBtn.textContent = mapCam.autoRotate ? 'Pause' : 'Resume';

    if (els.mapColorBtn) {
      if (!DATA.positions) {
        mapColorMode = 'cluster';
        els.mapColorBtn.hidden = true;
      }
      els.mapColorBtn.addEventListener('click', function () {
        mapColorMode = mapColorMode === 'pos' ? 'cluster' : 'pos';
        els.mapColorBtn.textContent = mapColorMode === 'pos' ? 'Color: position' : 'Color: archetype';
        renderMapLegend();
        renderMap();
      });
      els.mapColorBtn.textContent = mapColorMode === 'pos' ? 'Color: position' : 'Color: archetype';
    }

    window.addEventListener('resize', function () {
      if (mapVisible) renderMap();
      redrawCourtsIfVisible();
    });

    setupMapVisibilityObserver();
  }

  // ---------------------------------------------------------------------
  // Share button
  // ---------------------------------------------------------------------

  function setupShare() {
    els.shareBtn.addEventListener('click', function () {
      var rec = todayRecord();
      var text = buildShareText(rec);
      var shared = false;
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () {});
        shared = true;
      }
      if (!shared && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          els.shareCopied.hidden = false;
        }).catch(function () {});
      } else if (!shared) {
        els.shareCopied.hidden = false;
      }
      track('vh-share', { mode: activeChimeraMode === 'practice' ? 'free' : 'daily' });
    });
  }

  // ---------------------------------------------------------------------
  // Bottom sheets: report / map / history / arc-reveal. Every sheet reuses
  // the same modal stack (focus trap + Escape) as the help/stats/methods/
  // dossier modals — a sheet IS a modal, just docked at the bottom below
  // ~480px (see hoops.css). At >=1000px the report/map sheets are pinned
  // open as a static right-column panel instead (see pinDesktopAuxPanels).
  // ---------------------------------------------------------------------

  var reportSheetTrigger = null;
  var mapSheetTrigger = null;
  var historySheetTrigger = null;

  function openReportSheet(triggerEl) {
    if (isDesktopWide()) return; // pinned open already; no overlay needed
    reportSheetTrigger = triggerEl || document.activeElement;
    els.reportSheetBackdrop.hidden = false;
    els.reportSheetCloseBtn.focus();
    pushModal(els.reportSheet, closeReportSheet);
  }
  function closeReportSheet() {
    if (isDesktopWide()) return; // pinned open as a static panel; close btn is a no-op here
    els.reportSheetBackdrop.hidden = true;
    if (reportSheetTrigger && reportSheetTrigger.focus) reportSheetTrigger.focus();
    popModal();
  }

  function openMapSheet(triggerEl) {
    if (isDesktopWide()) return; // pinned open already
    mapSheetTrigger = triggerEl || document.activeElement;
    els.mapSheetBackdrop.hidden = false;
    mapSheetOpen = true;
    els.mapSheetCloseBtn.focus();
    pushModal(els.mapSheet, closeMapSheet);
    mapVisible = true; // optimistic; IntersectionObserver corrects next tick
    renderMap();
    startMapLoopIfNeeded();
  }
  function closeMapSheet() {
    if (isDesktopWide()) return; // pinned open as a static panel; close btn is a no-op here
    els.mapSheetBackdrop.hidden = true;
    mapSheetOpen = false;
    mapVisible = false;
    stopMapLoop();
    if (mapSheetTrigger && mapSheetTrigger.focus) mapSheetTrigger.focus();
    popModal();
  }

  function openHistorySheet(triggerEl) {
    historySheetTrigger = triggerEl || document.activeElement;
    els.historySheetBackdrop.hidden = false;
    els.historySheetCloseBtn.focus();
    pushModal(els.historySheet, closeHistorySheet);
  }
  function closeHistorySheet() {
    els.historySheetBackdrop.hidden = true;
    if (historySheetTrigger && historySheetTrigger.focus) historySheetTrigger.focus();
    popModal();
  }

  function setupSheets() {
    els.reportSheetOpenBtn.addEventListener('click', function () { openReportSheet(els.reportSheetOpenBtn); });
    els.reportSheetCloseBtn.addEventListener('click', closeReportSheet);
    els.reportSheetBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.reportSheetBackdrop) closeReportSheet();
    });

    els.mapSheetOpenBtn.addEventListener('click', function () { openMapSheet(els.mapSheetOpenBtn); });
    els.mapSheetCloseBtn.addEventListener('click', closeMapSheet);
    els.mapSheetBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.mapSheetBackdrop) closeMapSheet();
    });

    els.historyChipBtn.addEventListener('click', function () { openHistorySheet(els.historyChipBtn); });
    els.historySheetCloseBtn.addEventListener('click', closeHistorySheet);
    els.historySheetBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.historySheetBackdrop) closeHistorySheet();
    });
  }

  // ---------------------------------------------------------------------
  // Two-column desktop (>=1000px): report + map sheets pin open as a
  // static right-column panel instead of an overlay sheet. Below 1000px
  // they revert to closed sheets. A matchMedia listener keeps this in
  // sync across resizes (e.g. rotating a tablet).
  // ---------------------------------------------------------------------

  function pinDesktopAuxPanels() {
    // A sheet opened as a mobile/tablet overlay (<1000px) pushes itself onto
    // the modal stack (Escape + focus trap). If the viewport then crosses to
    // >=1000px while it's open, drop it from the stack before pinning it open
    // as a static panel — otherwise it dead-ends there: closeReportSheet/
    // closeMapSheet no-op at desktop width, so nothing would ever pop it and
    // Escape/Tab would keep targeting a panel that's no longer an overlay.
    removeModalEntry(els.reportSheet);
    removeModalEntry(els.mapSheet);
    els.reportSheetBackdrop.hidden = false;
    els.mapSheetBackdrop.hidden = false;
    mapSheetOpen = true;
    mapVisible = true;
    renderMap();
    startMapLoopIfNeeded();
  }

  function unpinDesktopAuxPanels() {
    els.reportSheetBackdrop.hidden = true;
    els.mapSheetBackdrop.hidden = true;
    mapSheetOpen = false;
    mapVisible = false;
    stopMapLoop();
  }

  function setupDesktopPin() {
    var mq = null;
    try { mq = window.matchMedia(DESKTOP_QUERY); } catch (e) { mq = null; }
    if (isDesktopWide()) pinDesktopAuxPanels();
    if (!mq) return;
    var handler = function (ev) {
      if (ev.matches) pinDesktopAuxPanels(); else unpinDesktopAuxPanels();
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler); // older Safari
  }

  // ---------------------------------------------------------------------
  // THE DEADLINE: quiz mode on midseason movers, unlimited, seeded by
  // round count (not date) so it never repeats on the daily Chimera's clock.
  // ---------------------------------------------------------------------

  var DEADLINE = null;      // parsed deadline.json
  var DEADLINE_POOL = null; // thrives + craters, tagged with type
  // M0: Daily Set (5 fixed movers, shared, UTC-date-seeded) vs Free Play
  // (the original endless counter-seeded run, relabeled "practice"). Each
  // mode keeps its own in-memory run so switching tabs never loses progress.
  var activeDeadlineMode = 'daily'; // 'daily' | 'free'
  var deadlineRuns = { daily: null, free: null }; // { rounds, idx, score }
  var DEADLINE_STATE = null; // persisted Daily Set streak/history — LS_KEY_DEADLINE_DAILY

  function activeDeadlineRun() {
    return deadlineRuns[activeDeadlineMode];
  }

  function loadDeadlineCounter() {
    var n = 0;
    try {
      var raw = localStorage.getItem(LS_KEY_DEADLINE_COUNTER);
      n = raw ? (parseInt(raw, 10) || 0) : 0;
    } catch (e) { n = 0; }
    return n;
  }

  function saveDeadlineCounter(n) {
    try { localStorage.setItem(LS_KEY_DEADLINE_COUNTER, String(n)); } catch (e) { /* storage unavailable */ }
  }

  // Daily Set state: streak + per-day completion + running totals for the
  // Stats modal ("sets played, avg score") — entirely separate storage key
  // from Free Play, which persists nothing but its endless draw counter.
  function loadDeadlineDailyState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_DEADLINE_DAILY); } catch (e) { raw = null; }
    var s = { streak: 0, lastPlayDate: null, days: {}, totalSets: 0, totalScoreSum: 0 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.lastPlayDate = parsed.lastPlayDate || null;
          s.days = parsed.days || {};
          s.totalSets = parsed.totalSets || 0;
          s.totalScoreSum = parsed.totalScoreSum || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
    }
    if (!s.days[TODAY]) s.days[TODAY] = { done: false, score: null };
    return s;
  }

  function saveDeadlineDailyState() {
    try { localStorage.setItem(LS_KEY_DEADLINE_DAILY, JSON.stringify(DEADLINE_STATE)); } catch (e) { /* storage unavailable */ }
  }

  function deadlineDailyToday() {
    return DEADLINE_STATE.days[TODAY];
  }

  function computeDeadlineDailyStats() {
    return {
      streak: DEADLINE_STATE.streak,
      totalSets: DEADLINE_STATE.totalSets,
      avgScore: DEADLINE_STATE.totalSets ? (DEADLINE_STATE.totalScoreSum / DEADLINE_STATE.totalSets) : 0
    };
  }

  function buildDeadlinePool() {
    var thrives = (DEADLINE.thrives || []).map(function (m) {
      return {
        name: m.name, season: m.season, from: m.from, to: m.to,
        gBefore: m.gBefore, gAfter: m.gAfter, dP36: m.dP36, dPM: m.dPM,
        dEff: m.dEff, type: 'thrive'
      };
    });
    var craters = (DEADLINE.craters || []).map(function (m) {
      return {
        name: m.name, season: m.season, from: m.from, to: m.to,
        gBefore: m.gBefore, gAfter: m.gAfter, dP36: m.dP36, dPM: m.dPM,
        dEff: m.dEff, type: 'crater'
      };
    });
    return thrives.concat(craters);
  }

  function drawDeadlineMover(counter) {
    var rng = seededRng('vector-hoops:deadline:' + counter);
    var idx = Math.floor(rng() * DEADLINE_POOL.length);
    return DEADLINE_POOL[idx];
  }

  // Daily Set: 5 movers, seeded from the UTC date alone — same set for
  // every player that day (A8 balance is inherited from the pool itself;
  // the pool already mixes thrives+craters so a 5-draw sample reliably
  // covers both, matching the "at least 2 of each" spirit at pool scale).
  function buildDeadlineDailyRounds() {
    var rng = seededRng('vector-hoops:deadline-daily:' + TODAY);
    var rounds = [];
    for (var i = 0; i < DEADLINE_ROUNDS_PER_RUN; i++) {
      var idx = Math.floor(rng() * DEADLINE_POOL.length);
      rounds.push({ mover: DEADLINE_POOL[idx], answered: false, correct: null });
    }
    return rounds;
  }

  function buildDeadlineFreeRounds() {
    var counter = loadDeadlineCounter();
    var rounds = [];
    for (var i = 0; i < DEADLINE_ROUNDS_PER_RUN; i++) {
      rounds.push({ mover: drawDeadlineMover(counter), answered: false, correct: null });
      counter++;
    }
    saveDeadlineCounter(counter);
    return rounds;
  }

  function startDeadlineRun(mode) {
    activeDeadlineMode = mode;
    if (mode === 'daily') {
      deadlineRuns.daily = { rounds: buildDeadlineDailyRounds(), idx: 0, score: 0 };
    } else {
      deadlineRuns.free = { rounds: buildDeadlineFreeRounds(), idx: 0, score: 0 };
    }
    els.deadlineButtons.hidden = false;
    els.deadlineFinal.hidden = true;
    renderDeadlineRound();
  }

  function renderDeadlineHeader() {
    var isDaily = activeDeadlineMode === 'daily';
    els.deadlineEyebrow.textContent = isDaily
      ? 'The Deadline — Daily Set #' + puzzleNumber(TODAY)
      : 'The Deadline — Free Play (practice)';
    els.deadlineStreakWrap.hidden = !isDaily;
    if (isDaily) els.deadlineStreakNum.textContent = String(DEADLINE_STATE.streak);
    els.deadlinePracticeBanner.hidden = isDaily;
  }

  function renderDeadlineRound() {
    var run = activeDeadlineRun();
    var round = run.rounds[run.idx];
    var m = round.mover;
    els.deadlineRoundNum.textContent = String(run.idx + 1);
    els.deadlineScoreNum.textContent = String(run.score);
    els.deadlinePrompt.textContent = m.name + ' moved ' + m.from + ' → ' + m.to +
      ' mid ' + m.season + ' (' + m.gBefore + ' games before, ' + m.gAfter + ' after).';
    els.deadlineReveal.hidden = true;
    els.deadlineThrivedBtn.disabled = false;
    els.deadlineCraterBtn.disabled = false;
    renderDeadlineHeader();
    track('vh-deadline-round', { round: run.idx + 1, mode: activeDeadlineMode });
  }

  function deadlineOneLiner(m, correct) {
    var direction = m.type === 'thrive' ? 'thrived' : 'cratered';
    return {
      prefix: correct ? 'Correct — ' : 'Missed it — ',
      suffix: correct ? (' ' + direction + ' after the move.') : (' actually ' + direction + ' after the move.')
    };
  }

  // M7: mover name links to its dossier modal only if that page actually
  // exists — a HEAD request confirms this before ever showing a link, so a
  // missing page fails soft to plain text (never a dead/broken link).
  function tryLinkMoverName(el, name) {
    el.textContent = name;
    var slug = playerSlug(name);
    fetch('knowledge/players/' + slug + '.md', { method: 'HEAD' }).then(function (res) {
      if (!res.ok) return;
      el.innerHTML = '<a href="#" class="vh-dossier-link" data-slug="' + slug + '" data-name="' +
        escapeHtml(name) + '">' + escapeHtml(name) + '</a>';
    }).catch(function () { /* fail soft: leave as plain text, no link */ });
  }

  function renderDeadlineVerdict(m, correct) {
    var parts = deadlineOneLiner(m, correct);
    els.deadlineVerdict.innerHTML = '';
    els.deadlineVerdict.appendChild(document.createTextNode(parts.prefix));
    var nameSpan = document.createElement('span');
    els.deadlineVerdict.appendChild(nameSpan);
    els.deadlineVerdict.appendChild(document.createTextNode(parts.suffix));
    tryLinkMoverName(nameSpan, m.name);
  }

  // M7 post-round detail: the shipped deadline.json carries the per-36
  // DELTA (dP36), not absolute before/after rates, so the bar pair renders
  // that true delta (a neutral "before" reference vs a scaled "after" bar)
  // rather than fabricating baseline numbers the harness can't verify.
  var DEADLINE_BAR_SCALE_MAX = 12; // pts/36 that saturates the "after" bar

  function renderDeadlineDetail(m) {
    var p36 = (m.dP36 >= 0 ? '+' : '') + m.dP36.toFixed(1);
    var pm = (m.dPM >= 0 ? '+' : '') + m.dPM.toFixed(1);
    els.deadlineP36Value.textContent = p36 + ' pts/36';
    els.deadlineAdjpm.textContent = 'Context-adjusted plus-minus: ' + pm;
    els.deadlineSamples.textContent = m.gBefore + 'g → ' + m.gAfter + 'g (games logged before → after the move)';

    var magPct = Math.max(2, Math.min(100, Math.round(Math.abs(m.dP36) / DEADLINE_BAR_SCALE_MAX * 100)));
    var sign = m.dP36 >= 0 ? 'pos' : 'neg';
    els.deadlineP36Bars.innerHTML =
      '<div class="vh-deadline__bar-row"><span class="vh-deadline__bar-label">Before</span>' +
        '<div class="vh-deadline__bar-track"><div class="vh-deadline__bar vh-deadline__bar--before"></div></div></div>' +
      '<div class="vh-deadline__bar-row"><span class="vh-deadline__bar-label">After</span>' +
        '<div class="vh-deadline__bar-track"><div class="vh-deadline__bar vh-deadline__bar--after vh-deadline__bar--' + sign +
        '" style="width:' + magPct + '%"></div></div></div>';
  }

  function answerDeadlineRound(guessType) {
    var run = activeDeadlineRun();
    var round = run.rounds[run.idx];
    if (round.answered) return;
    round.answered = true;
    var correct = guessType === round.mover.type;
    round.correct = correct;
    if (correct) run.score++;

    els.deadlineThrivedBtn.disabled = true;
    els.deadlineCraterBtn.disabled = true;
    els.deadlineReveal.hidden = false;
    renderDeadlineVerdict(round.mover, correct);
    renderDeadlineDetail(round.mover);

    els.deadlineScoreNum.textContent = String(run.score);
    els.deadlineNextBtn.textContent = (run.idx + 1 >= DEADLINE_ROUNDS_PER_RUN)
      ? 'See results' : 'Next round';
  }

  function buildDeadlineShareText() {
    var run = deadlineRuns.daily;
    var rows = run.rounds.map(function (r) { return r.correct ? '✅' : '❌'; }).join('');
    return 'Vector Hoops — Deadline #' + puzzleNumber(TODAY) + ' ' + run.score + '/' + DEADLINE_ROUNDS_PER_RUN +
      '\n' + rows + '\nStreak: ' + DEADLINE_STATE.streak;
  }

  function showDeadlineFinal() {
    var run = activeDeadlineRun();
    els.deadlineButtons.hidden = true;
    els.deadlineReveal.hidden = true;
    els.deadlineFinal.hidden = false;
    els.deadlineFinalScore.textContent = 'You scored ' + run.score + '/' + DEADLINE_ROUNDS_PER_RUN + '.';

    if (activeDeadlineMode === 'daily') {
      var rec = deadlineDailyToday();
      if (!rec.done) {
        rec.done = true;
        rec.score = run.score;
        var yesterday = utcDateString(new Date(Date.now() - 86400000));
        DEADLINE_STATE.streak = (DEADLINE_STATE.lastPlayDate === yesterday) ? DEADLINE_STATE.streak + 1 : 1;
        DEADLINE_STATE.lastPlayDate = TODAY;
        DEADLINE_STATE.totalSets++;
        DEADLINE_STATE.totalScoreSum += run.score;
        saveDeadlineDailyState();
        track('vh-deadline-done', { score: run.score, mode: 'daily' });
        submitLeaderboardScore('deadline', TODAY, run.score);
      }
      els.deadlineAgainBtn.hidden = true;
      els.deadlineShareBtn.hidden = false;
      els.deadlineComeback.hidden = false;
      els.deadlineShareCopied.hidden = true;
    } else {
      els.deadlineAgainBtn.hidden = false;
      els.deadlineShareBtn.hidden = true;
      els.deadlineComeback.hidden = true;
      track('vh-deadline-done', { score: run.score, mode: 'free' });
    }
    renderDeadlineHeader();
  }

  function nextDeadlineRound() {
    var run = activeDeadlineRun();
    var round = run.rounds[run.idx];
    if (!round.answered) return;
    run.idx++;
    if (run.idx >= DEADLINE_ROUNDS_PER_RUN) {
      showDeadlineFinal();
    } else {
      renderDeadlineRound();
    }
  }

  // Switching Daily Set <-> Free Play never restarts an in-progress run —
  // each mode keeps its own state in deadlineRuns until you start a new one.
  function switchDeadlineMode(mode) {
    activeDeadlineMode = mode;
    els.deadlineSubDaily.classList.toggle('is-active', mode === 'daily');
    els.deadlineSubFree.classList.toggle('is-active', mode === 'free');
    els.deadlineSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.deadlineSubFree.setAttribute('aria-selected', String(mode === 'free'));

    if (mode === 'daily' && deadlineDailyToday().done && !deadlineRuns.daily) {
      // Resume a day already completed earlier this session (or a fresh
      // load after completing it) straight to the final/summary view.
      var doneRec = deadlineDailyToday();
      deadlineRuns.daily = { rounds: [], idx: DEADLINE_ROUNDS_PER_RUN, score: doneRec.score || 0 };
    }

    var run = deadlineRuns[mode];
    if (!run) {
      startDeadlineRun(mode);
    } else if (run.idx >= DEADLINE_ROUNDS_PER_RUN) {
      showDeadlineFinal();
    } else {
      els.deadlineButtons.hidden = false;
      els.deadlineFinal.hidden = true;
      renderDeadlineRound();
    }
    renderDeadlineHeader();
  }

  function setupDeadline() {
    els.deadlineThrivedBtn.addEventListener('click', function () { answerDeadlineRound('thrive'); });
    els.deadlineCraterBtn.addEventListener('click', function () { answerDeadlineRound('crater'); });
    els.deadlineNextBtn.addEventListener('click', nextDeadlineRound);
    els.deadlineAgainBtn.addEventListener('click', function () { startDeadlineRun('free'); });
    els.deadlineSubDaily.addEventListener('click', function () { switchDeadlineMode('daily'); });
    els.deadlineSubFree.addEventListener('click', function () { switchDeadlineMode('free'); });
    els.deadlineMethodBtn.addEventListener('click', function () { openMethods('deadline', els.deadlineMethodBtn); });
    els.deadlineShareBtn.addEventListener('click', function () {
      var text = buildDeadlineShareText();
      var shared = false;
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); shared = true; }
      if (!shared && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { els.deadlineShareCopied.hidden = false; }).catch(function () {});
      } else if (!shared) {
        els.deadlineShareCopied.hidden = false;
      }
      track('vh-share', { mode: 'deadline-daily' });
    });
  }

  var deadlineInitialized = false;

  // ---------------------------------------------------------------------
  // FADER OR FINISHER: monthly-split scoring/rebounding quiz on real
  // player-seasons, computed offline into assets/faderfinisher.json.
  // Structurally a near-clone of The Deadline (5-round daily set vs
  // unlimited practice) — same M0 isolation, same reveal shape — with a
  // binary FINISHED STRONGER / FADED call in place of Thrived/Cratered.
  // Free Play here is nonce-seeded (like Chimera Free Play), not a
  // persisted counter, since it never needs to guarantee no-repeat across
  // sessions the way Deadline's incrementing counter does.
  // ---------------------------------------------------------------------

  var FADERFINISHER = null;   // parsed faderfinisher.json
  var FF_POOL = null;         // .questions, as-is
  var activeFaderMode = 'daily'; // 'daily' | 'free'
  var faderRuns = { daily: null, free: null };
  var FADER_STATE = null;     // persisted LS_KEY_FF_DAILY
  var FADER_PRACTICE_STATS = null; // persisted LS_KEY_FF_PRACTICE: { played, totalScoreSum }

  function activeFaderRun() {
    return faderRuns[activeFaderMode];
  }

  function loadFaderDailyState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_FF_DAILY); } catch (e) { raw = null; }
    var s = { streak: 0, lastPlayDate: null, days: {}, totalSets: 0, totalScoreSum: 0 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.lastPlayDate = parsed.lastPlayDate || null;
          s.days = parsed.days || {};
          s.totalSets = parsed.totalSets || 0;
          s.totalScoreSum = parsed.totalScoreSum || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
    }
    if (!s.days[TODAY]) s.days[TODAY] = { done: false, score: null };
    return s;
  }

  function saveFaderDailyState() {
    try { localStorage.setItem(LS_KEY_FF_DAILY, JSON.stringify(FADER_STATE)); } catch (e) { /* storage unavailable */ }
  }

  function faderDailyToday() {
    return FADER_STATE.days[TODAY];
  }

  function computeFaderDailyStats() {
    return {
      streak: FADER_STATE.streak,
      totalSets: FADER_STATE.totalSets,
      avgScore: FADER_STATE.totalSets ? (FADER_STATE.totalScoreSum / FADER_STATE.totalSets) : 0
    };
  }

  function loadFaderPracticeStats() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_FF_PRACTICE); } catch (e) { raw = null; }
    var s = { played: 0, totalScoreSum: 0 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.played = parsed.played || 0;
          s.totalScoreSum = parsed.totalScoreSum || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
    }
    return s;
  }

  function saveFaderPracticeStats() {
    try { localStorage.setItem(LS_KEY_FF_PRACTICE, JSON.stringify(FADER_PRACTICE_STATS)); } catch (e) { /* storage unavailable */ }
  }

  function buildFaderDailyRounds() {
    var rng = seededRng('vector-hoops:ff-daily:' + TODAY);
    var rounds = [];
    for (var i = 0; i < FF_ROUNDS_PER_RUN; i++) {
      var idx = Math.floor(rng() * FF_POOL.length);
      rounds.push({ q: FF_POOL[idx], answered: false, correct: null });
    }
    return rounds;
  }

  // Nonce-seeded (crypto-sourced) — same mechanism as Chimera Free Play, so
  // Free Play sets are unlimited and never repeat the daily set.
  function buildFaderFreeRounds() {
    var rng = seededRng('vector-hoops:ff-practice:' + randomNonce());
    var rounds = [];
    for (var i = 0; i < FF_ROUNDS_PER_RUN; i++) {
      var idx = Math.floor(rng() * FF_POOL.length);
      rounds.push({ q: FF_POOL[idx], answered: false, correct: null });
    }
    return rounds;
  }

  function startFaderRun(mode) {
    activeFaderMode = mode;
    if (mode === 'daily') {
      faderRuns.daily = { rounds: buildFaderDailyRounds(), idx: 0, score: 0 };
    } else {
      faderRuns.free = { rounds: buildFaderFreeRounds(), idx: 0, score: 0 };
    }
    els.faderButtons.hidden = false;
    els.faderFinal.hidden = true;
    renderFaderRound();
  }

  function renderFaderHeader() {
    var isDaily = activeFaderMode === 'daily';
    els.faderEyebrow.textContent = isDaily
      ? 'Fader or Finisher — Daily Set #' + puzzleNumber(TODAY)
      : 'Fader or Finisher — Free Play (practice)';
    els.faderStreakWrap.hidden = !isDaily;
    if (isDaily) els.faderStreakNum.textContent = String(FADER_STATE.streak);
    els.faderPracticeBanner.hidden = isDaily;
  }

  function renderFaderRound() {
    var run = activeFaderRun();
    var round = run.rounds[run.idx];
    var q = round.q;
    els.faderRoundNum.textContent = String(run.idx + 1);
    els.faderScoreNum.textContent = String(run.score);
    els.faderPrompt.textContent = q.name + ' (' + q.season + ') averaged ' + q.firstHalf +
      ' per-36 ' + q.stat + ' in the first half of his games. Did he FINISH stronger or FADE?';
    els.faderReveal.hidden = true;
    els.faderFinishBtn.disabled = false;
    els.faderFadeBtn.disabled = false;
    renderFaderHeader();
    track('vh-ff-round', { round: run.idx + 1, mode: activeFaderMode === 'daily' ? 'daily' : 'free' });
  }

  function faderOneLiner(q, correct) {
    var verb = q.verdict === 'finisher' ? 'finished stronger' : 'faded';
    return {
      prefix: correct ? 'Correct — ' : 'Missed it — ',
      suffix: ' ' + verb + ' in the second half.'
    };
  }

  function renderFaderVerdict(q, correct) {
    els.faderVerdict.className = 'vh-deadline__verdict ' +
      (q.verdict === 'finisher' ? 'vh-ff-verdict--finisher' : 'vh-ff-verdict--fader');
    var parts = faderOneLiner(q, correct);
    els.faderVerdict.innerHTML = '';
    els.faderVerdict.appendChild(document.createTextNode(parts.prefix));
    var nameSpan = document.createElement('span');
    els.faderVerdict.appendChild(nameSpan);
    els.faderVerdict.appendChild(document.createTextNode(parts.suffix));
    tryLinkMoverName(nameSpan, q.name);
  }

  function renderFaderDetail(q) {
    var sign = q.delta >= 0 ? '+' : '';
    els.faderSecondhalfValue.textContent = q.secondHalf + ' per-36 ' + q.stat;
    els.faderDelta.textContent = 'Delta: ' + sign + q.delta.toFixed(1) + ' per-36 ' + q.stat +
      ' (first half ' + q.firstHalf + ' → second half ' + q.secondHalf + ').';
    els.faderSamples.textContent = q.g1 + 'g → ' + q.g2 + 'g (games logged first half → second half).';

    var magPct = Math.max(2, Math.min(100, Math.round(Math.abs(q.delta) / 6 * 100)));
    var sideClass = q.delta >= 0 ? 'pos' : 'neg';
    els.faderBars.innerHTML =
      '<div class="vh-deadline__bar-row"><span class="vh-deadline__bar-label">1st half</span>' +
        '<div class="vh-deadline__bar-track"><div class="vh-deadline__bar vh-deadline__bar--before"></div></div></div>' +
      '<div class="vh-deadline__bar-row"><span class="vh-deadline__bar-label">2nd half</span>' +
        '<div class="vh-deadline__bar-track"><div class="vh-deadline__bar vh-deadline__bar--after vh-deadline__bar--' + sideClass +
        '" style="width:' + magPct + '%"></div></div></div>';
  }

  function answerFaderRound(guessVerdict) {
    var run = activeFaderRun();
    var round = run.rounds[run.idx];
    if (round.answered) return;
    round.answered = true;
    var correct = guessVerdict === round.q.verdict;
    round.correct = correct;
    if (correct) run.score++;

    els.faderFinishBtn.disabled = true;
    els.faderFadeBtn.disabled = true;
    els.faderReveal.hidden = false;
    renderFaderVerdict(round.q, correct);
    renderFaderDetail(round.q);

    els.faderScoreNum.textContent = String(run.score);
    els.faderNextBtn.textContent = (run.idx + 1 >= FF_ROUNDS_PER_RUN) ? 'See results' : 'Next round';
  }

  function buildFaderShareText() {
    var run = faderRuns.daily;
    var rows = run.rounds.map(function (r) { return r.correct ? '✅' : '❌'; }).join('');
    return 'Vector Hoops — Fader or Finisher #' + puzzleNumber(TODAY) + ' ' + run.score + '/' + FF_ROUNDS_PER_RUN +
      '\n' + rows + '\nStreak: ' + FADER_STATE.streak;
  }

  function showFaderFinal() {
    var run = activeFaderRun();
    els.faderButtons.hidden = true;
    els.faderReveal.hidden = true;
    els.faderFinal.hidden = false;
    els.faderFinalScore.textContent = 'You scored ' + run.score + '/' + FF_ROUNDS_PER_RUN + '.';

    if (activeFaderMode === 'daily') {
      var rec = faderDailyToday();
      if (!rec.done) {
        rec.done = true;
        rec.score = run.score;
        var yesterday = utcDateString(new Date(Date.now() - 86400000));
        FADER_STATE.streak = (FADER_STATE.lastPlayDate === yesterday) ? FADER_STATE.streak + 1 : 1;
        FADER_STATE.lastPlayDate = TODAY;
        FADER_STATE.totalSets++;
        FADER_STATE.totalScoreSum += run.score;
        saveFaderDailyState();
        track('vh-ff-done', { score: run.score, mode: 'daily' });
        submitLeaderboardScore('fader', TODAY, run.score);
      }
      els.faderAgainBtn.hidden = true;
      els.faderShareBtn.hidden = false;
      els.faderComeback.hidden = false;
      els.faderShareCopied.hidden = true;
    } else {
      FADER_PRACTICE_STATS.played++;
      FADER_PRACTICE_STATS.totalScoreSum += run.score;
      saveFaderPracticeStats();
      els.faderAgainBtn.hidden = false;
      els.faderShareBtn.hidden = true;
      els.faderComeback.hidden = true;
      track('vh-ff-done', { score: run.score, mode: 'free' });
    }
    renderFaderHeader();
  }

  function nextFaderRound() {
    var run = activeFaderRun();
    var round = run.rounds[run.idx];
    if (!round.answered) return;
    run.idx++;
    if (run.idx >= FF_ROUNDS_PER_RUN) {
      showFaderFinal();
    } else {
      renderFaderRound();
    }
  }

  function switchFaderMode(mode) {
    activeFaderMode = mode;
    els.faderSubDaily.classList.toggle('is-active', mode === 'daily');
    els.faderSubFree.classList.toggle('is-active', mode === 'free');
    els.faderSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.faderSubFree.setAttribute('aria-selected', String(mode === 'free'));

    if (mode === 'daily' && faderDailyToday().done && !faderRuns.daily) {
      var doneRec = faderDailyToday();
      faderRuns.daily = { rounds: [], idx: FF_ROUNDS_PER_RUN, score: doneRec.score || 0 };
    }

    var run = faderRuns[mode];
    if (!run) {
      startFaderRun(mode);
    } else if (run.idx >= FF_ROUNDS_PER_RUN) {
      showFaderFinal();
    } else {
      els.faderButtons.hidden = false;
      els.faderFinal.hidden = true;
      renderFaderRound();
    }
    renderFaderHeader();
  }

  function setupFader() {
    els.faderFinishBtn.addEventListener('click', function () { answerFaderRound('finisher'); });
    els.faderFadeBtn.addEventListener('click', function () { answerFaderRound('fader'); });
    els.faderNextBtn.addEventListener('click', nextFaderRound);
    els.faderAgainBtn.addEventListener('click', function () { startFaderRun('free'); });
    els.faderSubDaily.addEventListener('click', function () { switchFaderMode('daily'); });
    els.faderSubFree.addEventListener('click', function () { switchFaderMode('free'); });
    els.faderMethodBtn.addEventListener('click', function () { openMethods('ff', els.faderMethodBtn); });
    els.faderShareBtn.addEventListener('click', function () {
      var text = buildFaderShareText();
      var shared = false;
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); shared = true; }
      if (!shared && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { els.faderShareCopied.hidden = false; }).catch(function () {});
      } else if (!shared) {
        els.faderShareCopied.hidden = false;
      }
      track('vh-share', { mode: 'ff-daily' });
    });
  }

  var faderInitialized = false;

  // ---------------------------------------------------------------------
  // CAREER ARC: order one player's charted seasons, oldest to newest, from
  // unlabeled sigma-bar cards (no years shown). Single puzzle per Daily
  // (like the Chimera), unlimited nonce-seeded Free Play via "New arc".
  // Scoring is exact-position count against the true chronological order.
  // ---------------------------------------------------------------------

  var ARC_INDEX = null;             // { names:[qualifying names], byName:{name:[players asc by season]} }
  var activeArcMode = 'daily';      // 'daily' | 'practice'
  var ARC_DAILY_TARGET = null;      // { name, correct:[players asc], shuffled:[players, display order] }
  var ARC_PRACTICE_TARGET = null;
  var ARC_STATE = null;             // persisted LS_KEY_ARC_DAILY
  var ARC_PRACTICE_STATS = null;    // persisted LS_KEY_ARC_PRACTICE: { played, totalScoreSum }
  var ARC_DAILY_REC = { selection: [], done: false, score: null };
  var ARC_PRACTICE_REC = { selection: [], done: false, score: null };

  function buildArcIndex() {
    var byName = {};
    for (var i = 0; i < DATA.players.length; i++) {
      var p = DATA.players[i];
      (byName[p.name] = byName[p.name] || []).push(p);
    }
    var names = [];
    Object.keys(byName).forEach(function (name) {
      var arr = byName[name];
      if (arr.length >= ARC_MIN_SEASONS) {
        arr.sort(function (a, b) { return a.season < b.season ? -1 : (a.season > b.season ? 1 : 0); });
        names.push(name);
      }
    });
    names.sort(); // deterministic order for seeded index picks
    return { names: names, byName: byName };
  }

  function arraysEqualByRef(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function buildArcRoundFromRng(rng) {
    var idx = Math.floor(rng() * ARC_INDEX.names.length);
    var name = ARC_INDEX.names[idx];
    var allSeasons = ARC_INDEX.byName[name]; // sorted ascending already
    var correct;
    if (allSeasons.length === ARC_CARD_COUNT) {
      correct = allSeasons.slice();
    } else {
      var picks = seededSampleIndices(rng, allSeasons.length, ARC_CARD_COUNT);
      picks.sort(function (a, b) { return a - b; }); // preserve chronological order
      correct = picks.map(function (i) { return allSeasons[i]; });
    }
    var shuffled = correct;
    var tries = 0;
    while (tries < 50 && arraysEqualByRef(shuffled, correct)) {
      shuffled = seededShuffle(rng, correct);
      tries++;
    }
    return { name: name, correct: correct, shuffled: shuffled, allSeasons: allSeasons };
  }

  function buildArcDailyTarget() {
    return buildArcRoundFromRng(seededRng('vector-hoops:arc-daily:' + TODAY));
  }

  function buildArcPracticeTarget() {
    return buildArcRoundFromRng(seededRng('vector-hoops:arc-practice:' + randomNonce()));
  }

  function activeArcRound() {
    return activeArcMode === 'practice' ? ARC_PRACTICE_TARGET : ARC_DAILY_TARGET;
  }

  function activeArcRecord() {
    return activeArcMode === 'practice' ? ARC_PRACTICE_REC : ARC_DAILY_REC;
  }

  function loadArcDailyState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_ARC_DAILY); } catch (e) { raw = null; }
    var s = { streak: 0, lastPlayDate: null, days: {}, totalSets: 0, totalScoreSum: 0 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.lastPlayDate = parsed.lastPlayDate || null;
          s.days = parsed.days || {};
          s.totalSets = parsed.totalSets || 0;
          s.totalScoreSum = parsed.totalScoreSum || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
    }
    if (!s.days[TODAY]) s.days[TODAY] = { done: false, score: null };
    return s;
  }

  function saveArcDailyState() {
    try { localStorage.setItem(LS_KEY_ARC_DAILY, JSON.stringify(ARC_STATE)); } catch (e) { /* storage unavailable */ }
  }

  function arcDailyToday() {
    return ARC_STATE.days[TODAY];
  }

  function computeArcDailyStats() {
    return {
      streak: ARC_STATE.streak,
      totalSets: ARC_STATE.totalSets,
      avgScore: ARC_STATE.totalSets ? (ARC_STATE.totalScoreSum / ARC_STATE.totalSets) : 0
    };
  }

  function loadArcPracticeStats() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_ARC_PRACTICE); } catch (e) { raw = null; }
    var s = { played: 0, totalScoreSum: 0 };
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.played = parsed.played || 0;
          s.totalScoreSum = parsed.totalScoreSum || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
    }
    return s;
  }

  function saveArcPracticeStats() {
    try { localStorage.setItem(LS_KEY_ARC_PRACTICE, JSON.stringify(ARC_PRACTICE_STATS)); } catch (e) { /* storage unavailable */ }
  }

  function renderArcHeader() {
    var isDaily = activeArcMode === 'daily';
    els.arcEyebrow.textContent = isDaily ? 'Career Arc — Daily #' + puzzleNumber(TODAY) : 'Career Arc — Free Play (practice)';
    els.arcPracticeBanner.hidden = isDaily;
    var round = activeArcRound();
    els.arcInstructions.textContent = round
      ? "Order " + round.name + "'s seasons oldest → newest. Tap the cards in order."
      : 'Loading a career…';
  }

  function renderArcCards() {
    var round = activeArcRound();
    var rec = activeArcRecord();
    els.arcCards.innerHTML = '';
    round.shuffled.forEach(function (p, idx) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'vh-arc-card';
      card.setAttribute('data-idx', String(idx));
      var order = document.createElement('div');
      order.className = 'vh-arc-card__order';
      var selIdx = rec.selection.indexOf(idx);
      if (selIdx !== -1) {
        order.textContent = String(selIdx + 1);
        card.classList.add('is-selected');
      }
      card.appendChild(order);
      var minibars = document.createElement('div');
      minibars.className = 'vh-arc-card__minibars';
      card.appendChild(minibars);
      renderMiniSigmaBars(minibars, p.v);
      var chips = document.createElement('div');
      chips.className = 'vh-arc-card__chips';
      var posLabel = (DATA.positions && typeof p.p === 'number' && p.p >= 0) ? DATA.positions[p.p] : null;
      if (posLabel) chips.innerHTML += '<span class="vh-hint-chip">' + escapeHtml(posLabel) + '</span>';
      chips.innerHTML += '<span class="vh-hint-chip">' + escapeHtml(DATA.clusters[p.c]) + '</span>';
      card.appendChild(chips);
      var sr = document.createElement('span');
      sr.className = 'vh-visually-hidden';
      sr.textContent = miniSigmaSummaryText(p.v);
      card.appendChild(sr);
      if (rec.done) card.disabled = true;
      card.addEventListener('click', function () { onArcCardTap(idx); });
      els.arcCards.appendChild(card);
    });
    updateArcSubmitEnabled();
  }

  function updateArcSubmitEnabled() {
    var rec = activeArcRecord();
    els.arcSubmitBtn.disabled = rec.done || rec.selection.length < ARC_CARD_COUNT;
  }

  function onArcCardTap(idx) {
    var rec = activeArcRecord();
    if (rec.done) return;
    if (rec.selection.indexOf(idx) !== -1) return; // already tapped
    if (rec.selection.length >= ARC_CARD_COUNT) return;
    rec.selection.push(idx);
    renderArcCards();
  }

  function clearArcSelection() {
    var rec = activeArcRecord();
    if (rec.done) return;
    rec.selection = [];
    renderArcCards();
  }

  function scoreArcRound(round, selection) {
    var score = 0;
    for (var k = 0; k < selection.length; k++) {
      if (round.shuffled[selection[k]] === round.correct[k]) score++;
    }
    return score;
  }

  function buildArcShareText(round, rec) {
    var equation = 'Order ' + round.name + "'s seasons";
    if (activeArcMode === 'practice') {
      return 'Vector Hoops — practice Career Arc — ' + equation + ' ' + rec.score + '/' + ARC_CARD_COUNT;
    }
    return 'Vector Hoops — Career Arc #' + puzzleNumber(TODAY) + ' — ' + rec.score + '/' + ARC_CARD_COUNT + ' in the right slot';
  }

  function submitArcRound() {
    var round = activeArcRound();
    var rec = activeArcRecord();
    if (rec.done || rec.selection.length < ARC_CARD_COUNT) return;
    rec.done = true;
    rec.score = scoreArcRound(round, rec.selection);
    renderArcCards();

    var modeDetail = activeArcMode === 'practice' ? 'free' : 'daily';
    track('vh-arc-done', { score: rec.score, mode: modeDetail });

    if (activeArcMode === 'daily') {
      var dayRec = arcDailyToday();
      if (!dayRec.done) {
        dayRec.done = true;
        dayRec.score = rec.score;
        var yesterday = utcDateString(new Date(Date.now() - 86400000));
        ARC_STATE.streak = (ARC_STATE.lastPlayDate === yesterday) ? ARC_STATE.streak + 1 : 1;
        ARC_STATE.lastPlayDate = TODAY;
        ARC_STATE.totalSets++;
        ARC_STATE.totalScoreSum += rec.score;
        saveArcDailyState();
        submitLeaderboardScore('arc', TODAY, rec.score);
      }
    } else {
      ARC_PRACTICE_STATS.played++;
      ARC_PRACTICE_STATS.totalScoreSum += rec.score;
      saveArcPracticeStats();
    }
    showArcResult();
  }

  function showArcResult() {
    var round = activeArcRound();
    var rec = activeArcRecord();
    els.arcResult.hidden = false;
    els.arcScoreLine.textContent = rec.score + '/' + ARC_CARD_COUNT + ' in the right slot.';
    var isDaily = activeArcMode === 'daily';
    els.arcShareBtn.hidden = !isDaily;
    els.arcComeback.hidden = !isDaily;
    els.arcShareCopied.hidden = true;
    if (isDaily) {
      els.arcShareBtn.onclick = function () {
        var text = buildArcShareText(round, rec);
        var shared = false;
        if (navigator.share) { navigator.share({ text: text }).catch(function () {}); shared = true; }
        if (!shared && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { els.arcShareCopied.hidden = false; }).catch(function () {});
        } else if (!shared) {
          els.arcShareCopied.hidden = false;
        }
        track('vh-share', { mode: 'arc-daily' });
      };
    }
  }

  function renderArcRevealSheetContent() {
    var round = activeArcRound();
    var rec = activeArcRecord();
    els.arcRevealList.innerHTML = '';
    if (rec.selection.length === ARC_CARD_COUNT) {
      for (var k = 0; k < rec.selection.length; k++) {
        var picked = round.shuffled[rec.selection[k]];
        var correctPlayer = round.correct[k];
        var isCorrect = picked === correctPlayer;
        var li = document.createElement('li');
        li.className = 'vh-arc-reveal-row ' + (isCorrect ? 'is-correct' : 'is-wrong');
        li.innerHTML =
          '<span class="vh-arc-reveal-row__rank">' + (k + 1) + '</span>' +
          '<span class="vh-arc-reveal-row__season">' + escapeHtml(picked.season) + '</span>' +
          '<span class="vh-arc-reveal-row__mark">' + (isCorrect ? '✓ right slot' : '✗ actually ' + escapeHtml(correctPlayer.season)) + '</span>';
        els.arcRevealList.appendChild(li);
      }
    } else {
      // Resumed a day already completed earlier (selection wasn't persisted,
      // only the score) — show the true chronological order plainly instead
      // of a right/wrong comparison we no longer have the picks for.
      round.correct.forEach(function (p, k) {
        var li = document.createElement('li');
        li.className = 'vh-arc-reveal-row';
        li.innerHTML =
          '<span class="vh-arc-reveal-row__rank">' + (k + 1) + '</span>' +
          '<span class="vh-arc-reveal-row__season">' + escapeHtml(p.season) + '</span>';
        els.arcRevealList.appendChild(li);
      });
    }
    renderArcLineChart(els.arcLinechart, round.allSeasons);
    if (els.arcLinechartSrSummary) {
      els.arcLinechartSrSummary.textContent = round.name + ' scoring sigma by season: ' +
        round.allSeasons.map(function (p) { return p.season + ' ' + fmtSigma(p.v[IDX.PTS]); }).join(', ') + '.';
    }
  }

  function switchArcSubMode(mode) {
    if (mode === activeArcMode && (mode === 'daily' ? ARC_DAILY_TARGET : ARC_PRACTICE_TARGET)) {
      renderArcHeader();
      renderArcCards();
      return;
    }
    activeArcMode = mode;
    els.arcSubDaily.classList.toggle('is-active', mode === 'daily');
    els.arcSubPractice.classList.toggle('is-active', mode === 'practice');
    els.arcSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.arcSubPractice.setAttribute('aria-selected', String(mode === 'practice'));
    els.arcPracticeBanner.hidden = mode !== 'practice';

    if (mode === 'daily' && !ARC_DAILY_TARGET) {
      ARC_DAILY_TARGET = buildArcDailyTarget();
      if (arcDailyToday().done) {
        ARC_DAILY_REC.done = true;
        ARC_DAILY_REC.score = arcDailyToday().score;
      }
    }
    if (mode === 'practice' && !ARC_PRACTICE_TARGET) {
      ARC_PRACTICE_TARGET = buildArcPracticeTarget();
    }
    els.arcResult.hidden = !activeArcRecord().done;
    if (activeArcRecord().done) showArcResult();
    renderArcHeader();
    renderArcCards();
  }

  function startNewPracticeArc() {
    ARC_PRACTICE_TARGET = buildArcPracticeTarget();
    ARC_PRACTICE_REC = { selection: [], done: false, score: null };
    els.arcResult.hidden = true;
    renderArcHeader();
    renderArcCards();
    track('vh-arc-round', { mode: 'free' });
  }

  var arcRevealSheetTrigger = null;

  function openArcRevealSheet(triggerEl) {
    arcRevealSheetTrigger = triggerEl || document.activeElement;
    renderArcRevealSheetContent();
    els.arcRevealSheetBackdrop.hidden = false;
    els.arcRevealSheetCloseBtn.focus();
    pushModal(els.arcRevealSheet, closeArcRevealSheet);
  }
  function closeArcRevealSheet() {
    els.arcRevealSheetBackdrop.hidden = true;
    if (arcRevealSheetTrigger && arcRevealSheetTrigger.focus) arcRevealSheetTrigger.focus();
    popModal();
  }

  function setupArc() {
    els.arcSubDaily.addEventListener('click', function () { switchArcSubMode('daily'); });
    els.arcSubPractice.addEventListener('click', function () { switchArcSubMode('practice'); });
    els.arcNewBtn.addEventListener('click', startNewPracticeArc);
    els.arcClearBtn.addEventListener('click', clearArcSelection);
    els.arcSubmitBtn.addEventListener('click', submitArcRound);
    els.arcRevealOpenBtn.addEventListener('click', function () { openArcRevealSheet(els.arcRevealOpenBtn); });
    els.arcRevealSheetCloseBtn.addEventListener('click', closeArcRevealSheet);
    els.arcRevealSheetBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.arcRevealSheetBackdrop) closeArcRevealSheet();
    });
  }

  var arcInitialized = false;

  function switchMode(mode) {
    var panels = { chimera: els.panelChimera, deadline: els.panelDeadline, fader: els.panelFader, arc: els.panelArc };
    var tabs = { chimera: els.tabChimera, deadline: els.tabDeadline, fader: els.tabFader, arc: els.tabArc };
    Object.keys(panels).forEach(function (m) {
      panels[m].hidden = m !== mode;
      tabs[m].classList.toggle('is-active', m === mode);
      tabs[m].setAttribute('aria-selected', String(m === mode));
    });
    if (mode === 'deadline' && !deadlineInitialized && DEADLINE_POOL) {
      deadlineInitialized = true;
      switchDeadlineMode('daily');
    }
    if (mode === 'fader' && !faderInitialized && FF_POOL) {
      faderInitialized = true;
      switchFaderMode('daily');
    }
    if (mode === 'arc' && !arcInitialized && ARC_INDEX) {
      arcInitialized = true;
      track('vh-arc-round', { mode: 'daily' });
      switchArcSubMode('daily');
    }
    checkRollover();
  }

  function setupModeTabs() {
    els.tabChimera.addEventListener('click', function () { switchMode('chimera'); });
    els.tabDeadline.addEventListener('click', function () { switchMode('deadline'); });
    els.tabFader.addEventListener('click', function () { switchMode('fader'); });
    els.tabArc.addEventListener('click', function () { switchMode('arc'); });
  }

  // ---------------------------------------------------------------------
  // Modal a11y helpers (shared by the help modal and the dossier modal)
  // ---------------------------------------------------------------------

  var FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  function getFocusableElements(container) {
    return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE_SELECTOR));
  }

  function trapFocusIn(container, ev) {
    if (ev.key !== 'Tab') return;
    var focusables = getFocusableElements(container);
    if (focusables.length === 0) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  function hasSeenHelp() {
    try { return localStorage.getItem(LS_KEY_SEEN_HELP) === '1'; } catch (e) { return false; }
  }

  function markSeenHelp() {
    try { localStorage.setItem(LS_KEY_SEEN_HELP, '1'); } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------------
  // Generic modal stack: Escape closes the topmost modal, Tab traps focus
  // inside it. Every modal (help, dossier, stats, methods) pushes/pops here
  // instead of each wiring its own keydown listener.
  // ---------------------------------------------------------------------

  var modalStack = [];
  var MODAL_OPEN_BODY_CLASS = 'vh-modal-open';

  function syncModalBodyClass() {
    if (modalStack.length === 0) document.body.classList.remove(MODAL_OPEN_BODY_CLASS);
    else document.body.classList.add(MODAL_OPEN_BODY_CLASS);
  }

  function pushModal(container, closeFn) {
    modalStack.push({ container: container, close: closeFn });
    syncModalBodyClass();
  }

  function popModal() {
    modalStack.pop();
    syncModalBodyClass();
  }

  // Removes any stack entries for `container` without invoking their close
  // callback — used when a sheet stops being an overlay out from under the
  // stack (e.g. pinDesktopAuxPanels) rather than being explicitly closed.
  function removeModalEntry(container) {
    modalStack = modalStack.filter(function (entry) { return entry.container !== container; });
    syncModalBodyClass();
  }

  document.addEventListener('keydown', function (ev) {
    if (modalStack.length === 0) return;
    var top = modalStack[modalStack.length - 1];
    if (ev.key === 'Escape') {
      ev.preventDefault();
      top.close();
    } else if (ev.key === 'Tab') {
      trapFocusIn(top.container, ev);
    }
  });

  // ---------------------------------------------------------------------
  // How-to-play modal
  // ---------------------------------------------------------------------

  function openHelp() {
    els.helpBackdrop.hidden = false;
    els.helpClose.focus();
    pushModal(els.helpModal, closeHelp);
  }
  function closeHelp() {
    els.helpBackdrop.hidden = true;
    els.helpBtn.focus();
    popModal();
    // "No taglines on mobile after first visit": once the player has closed
    // how-to-play at least once, the header goes compact for good.
    if (els.appHeader) els.appHeader.classList.add('vh-header--compact');
  }

  function setupHelp() {
    els.helpBtn.addEventListener('click', openHelp);
    els.helpClose.addEventListener('click', closeHelp);
    els.helpBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.helpBackdrop) closeHelp();
    });
  }

  // ---------------------------------------------------------------------
  // Stats modal (M1) — Wordle-grade: played/win%/streak/maxStreak + guess
  // distribution for Daily Chimera, sets/avg for Deadline Daily Set, and a
  // clearly-casual Practice line. Everything recomputed from localStorage.
  // ---------------------------------------------------------------------

  function renderStatsTile(host, num, label) {
    var tile = document.createElement('div');
    tile.className = 'vh-stats-tile';
    tile.innerHTML = '<span class="vh-stats-tile__num">' + num + '</span><span class="vh-stats-tile__label">' + label + '</span>';
    host.appendChild(tile);
  }

  function renderHistogram(dist) {
    var max = Math.max(1, dist[0], dist[1], dist[2], dist[3], dist[4], dist[5]);
    var html = '';
    for (var i = 0; i < dist.length; i++) {
      var pct = Math.round((dist[i] / max) * 100);
      html += '<div class="vh-hist-row"><span class="vh-hist-row__label">' + (i + 1) + '</span>' +
        '<div class="vh-hist-row__track"><div class="vh-hist-row__bar" style="width:' + (dist[i] > 0 ? Math.max(pct, 10) : 0) + '%">' +
        '<span class="vh-hist-row__count">' + dist[i] + '</span></div></div></div>';
    }
    els.statsHistogram.innerHTML = html;
  }

  function renderStatsModal() {
    var daily = computeDailyChimeraStats();
    els.statsDailyGrid.innerHTML = '';
    renderStatsTile(els.statsDailyGrid, daily.played, 'Played');
    renderStatsTile(els.statsDailyGrid, daily.winPct + '%', 'Win %');
    renderStatsTile(els.statsDailyGrid, daily.streak, 'Streak');
    renderStatsTile(els.statsDailyGrid, daily.maxStreak, 'Max streak');
    renderHistogram(daily.dist);

    var dl = computeDeadlineDailyStats();
    els.statsDeadlineGrid.innerHTML = '';
    renderStatsTile(els.statsDeadlineGrid, dl.totalSets, 'Sets played');
    renderStatsTile(els.statsDeadlineGrid, dl.avgScore.toFixed(1), 'Avg score');
    renderStatsTile(els.statsDeadlineGrid, dl.streak, 'Streak');

    var ff = computeFaderDailyStats();
    els.statsFaderGrid.innerHTML = '';
    renderStatsTile(els.statsFaderGrid, ff.totalSets, 'Sets played');
    renderStatsTile(els.statsFaderGrid, ff.avgScore.toFixed(1), 'Avg score');
    renderStatsTile(els.statsFaderGrid, ff.streak, 'Streak');

    var arc = computeArcDailyStats();
    els.statsArcGrid.innerHTML = '';
    renderStatsTile(els.statsArcGrid, arc.totalSets, 'Played');
    renderStatsTile(els.statsArcGrid, arc.avgScore.toFixed(1), 'Avg score');
    renderStatsTile(els.statsArcGrid, arc.streak, 'Streak');

    els.statsPracticeLine.textContent = 'Chimera: ' + PRACTICE_STATS.played + ' played, ' + PRACTICE_STATS.won + ' won. ' +
      'Fader or Finisher: ' + practiceSetSummary(FADER_PRACTICE_STATS) + '. ' +
      'Career Arc: ' + practiceSetSummary(ARC_PRACTICE_STATS) + '. ' +
      'Casual only — never counted toward your streaks or stats above.';
  }

  function practiceSetSummary(stats) {
    if (!stats || !stats.played) return '0 played';
    return stats.played + ' played, ' + (stats.totalScoreSum / stats.played).toFixed(1) + ' avg score';
  }

  function openStats() {
    renderStatsModal();
    els.statsBackdrop.hidden = false;
    els.statsClose.focus();
    pushModal(els.statsModal, closeStats);
  }
  function closeStats() {
    els.statsBackdrop.hidden = true;
    els.statsBtn.focus();
    popModal();
  }

  function clearAllData() {
    var ok = window.confirm('Clear all Vector Hoops data on this device? This removes every daily streak (Chimera, Deadline, Fader or Finisher, Career Arc) and all practice counters. This cannot be undone.');
    if (!ok) return;
    [LS_KEY, LS_KEY_DEADLINE_DAILY, LS_KEY_PRACTICE_STATS, LS_KEY_DEADLINE_COUNTER,
     LS_KEY_FF_DAILY, LS_KEY_FF_PRACTICE, LS_KEY_ARC_DAILY, LS_KEY_ARC_PRACTICE].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
    });
    window.location.reload();
  }

  function setupStats() {
    els.statsBtn.addEventListener('click', openStats);
    els.statsClose.addEventListener('click', closeStats);
    els.statsClearBtn.addEventListener('click', clearAllData);
    els.statsBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.statsBackdrop) closeStats();
    });
  }

  // ---------------------------------------------------------------------
  // Methods & data sources modal (M7) — the deadline.json method string
  // plus the data-source lines the mechanics doc requires stated in one
  // place (game logs, minimums, what "midseason move" does and doesn't mean).
  // ---------------------------------------------------------------------

  function renderMethodsModal(which) {
    if (which === 'ff') {
      els.methodsTitle.textContent = 'Fader or Finisher — method & data sources';
      els.methodsBody.innerHTML =
        '<p class="vh-dossier__p">' + escapeHtml(FADERFINISHER && FADERFINISHER.method || '') + '</p>' +
        '<h4 class="vh-dossier__h4">Data sources &amp; minimums</h4>' +
        '<div class="vh-dossier__bullet">Real NBA game logs, 2015&ndash;16 through 2025&ndash;26 seasons.</div>' +
        '<div class="vh-dossier__bullet">Split at each player-season\'s own game-sequence midpoint, not the calendar All-Star break.</div>' +
        '<div class="vh-dossier__bullet">Minimum 25 games and 12 minutes per game on both sides of the split.</div>' +
        '<div class="vh-dossier__bullet">Quiz pool limited to unambiguous deltas (1.5&ndash;6.0 per-36) so ties aren\'t part of the puzzle.</div>';
      return;
    }
    els.methodsTitle.textContent = 'Method & data sources';
    els.methodsBody.innerHTML =
      '<p class="vh-dossier__p">' + escapeHtml(DEADLINE && DEADLINE.method || '') + '</p>' +
      '<h4 class="vh-dossier__h4">Data sources &amp; minimums</h4>' +
      '<div class="vh-dossier__bullet">Real NBA game logs, 2015&ndash;16 through 2025&ndash;26 seasons.</div>' +
      '<div class="vh-dossier__bullet">Minimum 15 games logged on both sides of the move, minimum 12 minutes per game &mdash; excludes token appearances.</div>' +
      '<div class="vh-dossier__bullet">"Midseason move" means any in-season team change (trade, waiver claim, buyout) &mdash; not necessarily an officially announced trade.</div>' +
      '<div class="vh-dossier__bullet">Numbers are context-adjusted (teammates, opponents, pace) before comparing before/after, not raw box-score deltas.</div>';
  }

  var methodsTriggerEl = null;

  function openMethods(which, triggerEl) {
    methodsTriggerEl = triggerEl || document.activeElement;
    renderMethodsModal(which);
    els.methodsBackdrop.hidden = false;
    els.methodsClose.focus();
    pushModal(els.methodsModal, closeMethods);
  }
  function closeMethods() {
    els.methodsBackdrop.hidden = true;
    if (methodsTriggerEl && methodsTriggerEl.focus) methodsTriggerEl.focus();
    popModal();
  }

  function setupMethods() {
    els.methodsClose.addEventListener('click', closeMethods);
    els.methodsBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.methodsBackdrop) closeMethods();
    });
  }

  // ---------------------------------------------------------------------
  // Dossier modal: reveal-card component links open an in-game modal.
  // Markdown fetch/parse (stripFrontmatter / wikilinksToPlainText /
  // mdToSimpleHtml / renderDossierMarkdown) now lives in assets/dossier.js,
  // shared with wiki.html — aliased here so callers below are unchanged.
  // ---------------------------------------------------------------------

  var dossierTriggerEl = null;
  var stripFrontmatter = window.VHDossier.stripFrontmatter;
  var wikilinksToPlainText = window.VHDossier.wikilinksToPlainText;
  var escapeHtml = window.VHDossier.escapeHtml;
  var mdInline = window.VHDossier.mdInline;
  var mdToSimpleHtml = window.VHDossier.mdToSimpleHtml;
  var renderDossierMarkdown = window.VHDossier.renderDossierMarkdown;

  function openDossier(slug, name, triggerEl) {
    dossierTriggerEl = triggerEl || null;
    els.dossierTitle.textContent = name + ' — dossier';
    els.dossierBody.innerHTML = '<p class="vh-dossier__p">Loading&hellip;</p>';
    els.dossierSourceLink.href = window.VHDossier.dossierGithubUrl(slug);
    els.dossierBackdrop.hidden = false;
    els.dossierClose.focus();
    pushModal(els.dossierModal, closeDossier);

    window.VHDossier.fetchDossierMarkdown(slug)
      .then(function (md) {
        els.dossierBody.innerHTML = renderDossierMarkdown(md);
      })
      .catch(function () {
        els.dossierBody.innerHTML =
          '<p class="vh-dossier__p">Could not load this dossier right now. Use "View source" below.</p>';
      });
  }

  function closeDossier() {
    els.dossierBackdrop.hidden = true;
    var toFocus = dossierTriggerEl;
    dossierTriggerEl = null;
    if (toFocus && typeof toFocus.focus === 'function') toFocus.focus();
    popModal();
  }

  function setupDossierModal() {
    document.addEventListener('click', function (ev) {
      var link = ev.target.closest && ev.target.closest('.vh-dossier-link');
      if (!link) return;
      ev.preventDefault();
      openDossier(link.getAttribute('data-slug'), link.getAttribute('data-name'), link);
    });
    els.dossierClose.addEventListener('click', closeDossier);
    els.dossierBackdrop.addEventListener('click', function (ev) {
      if (ev.target === els.dossierBackdrop) closeDossier();
    });
  }

  // ---------------------------------------------------------------------
  // Footer
  // ---------------------------------------------------------------------

  function renderFooter() {
    var range = DATA.seasons[0] + ' through ' + DATA.seasons[DATA.seasons.length - 1];
    els.footer.textContent =
      'Vectors: per-100-possession stats, z-scored within each season (era-honest) · ' +
      range + ' · built ' + DATA.built +
      ' · anonymous play events help tune the game — a random id, no account, no ads';
  }

  // ---------------------------------------------------------------------
  // DOM wiring
  // ---------------------------------------------------------------------

  function initDom() {
    els.puzzleNumber = document.getElementById('puzzle-number');
    els.puzzleDay = document.getElementById('puzzle-day');
    els.promptText = document.getElementById('prompt-text');
    els.chimeraInput = document.getElementById('chimera-input');
    els.chimeraSuggestions = document.getElementById('chimera-suggestions');
    els.chimeraSubmit = document.getElementById('chimera-submit');
    els.guessesLeftNum = document.getElementById('guesses-left-num');
    els.resultCard = document.getElementById('result-card');
    els.scoreboardPct = document.getElementById('scoreboard-pct');
    els.courtTarget = document.getElementById('court-target');
    els.courtGuess = document.getElementById('court-guess');
    els.courtGuessLabel = document.getElementById('court-guess-label');
    els.storyCaption = document.getElementById('story-caption');
    els.breakdownChart = document.getElementById('breakdown-chart');
    els.clusterLine = document.getElementById('cluster-line');
    els.coachingLine = document.getElementById('coaching-line');
    els.guessList = document.getElementById('guess-list');
    els.revealCard = document.getElementById('reveal-card');
    els.revealTitle = document.getElementById('reveal-title');
    els.revealBody = document.getElementById('reveal-body');
    els.shareBtn = document.getElementById('share-btn');
    els.shareCopied = document.getElementById('share-copied');
    els.map = document.getElementById('hoops-map');
    els.mapLegend = document.getElementById('map-legend');
    els.mapPauseBtn = document.getElementById('map-pause-btn');
    els.mapColorBtn = document.getElementById('map-color-btn');
    els.mapAxes = document.getElementById('map-axes');
    els.streakNum = document.getElementById('streak-num');
    els.helpBtn = document.getElementById('help-btn');
    els.helpBackdrop = document.getElementById('help-backdrop');
    els.helpModal = document.getElementById('help-modal');
    els.helpClose = document.getElementById('help-close');
    els.loadingBanner = document.getElementById('loading-banner');
    els.errorBanner = document.getElementById('error-banner');
    els.footer = document.getElementById('footer');

    els.gameSkeleton = document.getElementById('game-skeleton');
    els.promptCard = document.getElementById('prompt-card');
    els.guessbarCard = document.getElementById('guessbar-card');
    els.duplicateWarning = document.getElementById('duplicate-warning');
    els.courtsSrSummary = document.getElementById('courts-sr-summary');
    els.breakdownSrSummary = document.getElementById('breakdown-sr-summary');

    els.dossierBackdrop = document.getElementById('dossier-backdrop');
    els.dossierModal = document.getElementById('dossier-modal');
    els.dossierTitle = document.getElementById('dossier-title');
    els.dossierBody = document.getElementById('dossier-body');
    els.dossierSourceLink = document.getElementById('dossier-source-link');
    els.dossierClose = document.getElementById('dossier-close');

    els.rolloverBanner = document.getElementById('rollover-banner');
    els.rolloverReloadBtn = document.getElementById('rollover-reload-btn');

    els.scoutingLine = document.getElementById('scouting-line');
    els.warmthCard = document.getElementById('warmth-card');
    els.warmthBars = document.getElementById('warmth-bars');
    els.warmthClosest = document.getElementById('warmth-closest');
    els.quickCoachingLine = document.getElementById('quick-coaching-line');

    els.appHeader = document.getElementById('app-header');
    els.tagline = document.getElementById('tagline');
    els.equationRow = document.getElementById('equation-row');
    els.equationChip = document.getElementById('equation-chip');

    els.tabChimera = document.getElementById('tab-chimera');
    els.tabDeadline = document.getElementById('tab-deadline');
    els.tabFader = document.getElementById('tab-fader');
    els.tabArc = document.getElementById('tab-arc');
    els.panelChimera = document.getElementById('panel-chimera');
    els.panelDeadline = document.getElementById('panel-deadline');
    els.panelFader = document.getElementById('panel-fader');
    els.panelArc = document.getElementById('panel-arc');
    els.deadlineRoundNum = document.getElementById('deadline-round-num');
    els.deadlineScoreNum = document.getElementById('deadline-score-num');
    els.deadlinePrompt = document.getElementById('deadline-prompt');
    els.deadlineButtons = document.getElementById('deadline-buttons');
    els.deadlineThrivedBtn = document.getElementById('deadline-thrived-btn');
    els.deadlineCraterBtn = document.getElementById('deadline-crater-btn');
    els.deadlineReveal = document.getElementById('deadline-reveal');
    els.deadlineVerdict = document.getElementById('deadline-verdict');
    els.deadlineNextBtn = document.getElementById('deadline-next-btn');
    els.deadlineFinal = document.getElementById('deadline-final');
    els.deadlineFinalScore = document.getElementById('deadline-final-score');
    els.deadlineAgainBtn = document.getElementById('deadline-again-btn');
    els.deadlineMethodBtn = document.getElementById('deadline-method-btn');

    // M0: sub-mode segmented controls + practice banners
    els.chimeraSubDaily = document.getElementById('chimera-sub-daily');
    els.chimeraSubPractice = document.getElementById('chimera-sub-practice');
    els.chimeraPracticeBanner = document.getElementById('chimera-practice-banner');
    els.chimeraNewBtn = document.getElementById('chimera-new-btn');
    els.deadlineSubDaily = document.getElementById('deadline-sub-daily');
    els.deadlineSubFree = document.getElementById('deadline-sub-free');
    els.deadlinePracticeBanner = document.getElementById('deadline-practice-banner');
    els.deadlineEyebrow = document.getElementById('deadline-eyebrow');
    els.deadlineStreakWrap = document.getElementById('deadline-streak-wrap');
    els.deadlineStreakNum = document.getElementById('deadline-streak-num');
    els.deadlineShareBtn = document.getElementById('deadline-share-btn');
    els.deadlineShareCopied = document.getElementById('deadline-share-copied');
    els.deadlineComeback = document.getElementById('deadline-comeback');

    // M2: hint chips
    els.hintsRow = document.getElementById('hints-row');

    // M7: post-round detail
    els.deadlineP36Value = document.getElementById('deadline-p36-value');
    els.deadlineP36Bars = document.getElementById('deadline-p36-bars');
    els.deadlineSamples = document.getElementById('deadline-samples');
    els.deadlineAdjpm = document.getElementById('deadline-adjpm');

    // M1: stats modal
    els.statsBtn = document.getElementById('stats-btn');
    els.statsBackdrop = document.getElementById('stats-backdrop');
    els.statsModal = document.getElementById('stats-modal');
    els.statsClose = document.getElementById('stats-close');
    els.statsClearBtn = document.getElementById('stats-clear-btn');
    els.statsDailyGrid = document.getElementById('stats-daily-grid');
    els.statsHistogram = document.getElementById('stats-histogram');
    els.statsDeadlineGrid = document.getElementById('stats-deadline-grid');
    els.statsFaderGrid = document.getElementById('stats-fader-grid');
    els.statsArcGrid = document.getElementById('stats-arc-grid');
    els.statsPracticeLine = document.getElementById('stats-practice-line');

    // M7: methods modal
    els.methodsBackdrop = document.getElementById('methods-backdrop');
    els.methodsModal = document.getElementById('methods-modal');
    els.methodsTitle = document.getElementById('methods-title');
    els.methodsBody = document.getElementById('methods-body');
    els.methodsClose = document.getElementById('methods-close');

    // Bottom sheets: report / map / history
    els.reportSheetOpenBtn = document.getElementById('report-sheet-open-btn');
    els.reportSheetBackdrop = document.getElementById('report-sheet-backdrop');
    els.reportSheet = document.getElementById('report-sheet');
    els.reportSheetCloseBtn = document.getElementById('report-sheet-close-btn');
    els.mapSheetOpenBtn = document.getElementById('map-sheet-open-btn');
    els.mapSheetBackdrop = document.getElementById('map-sheet-backdrop');
    els.mapSheet = document.getElementById('map-sheet');
    els.mapSheetCloseBtn = document.getElementById('map-sheet-close-btn');
    els.historyChipBtn = document.getElementById('history-chip-btn');
    els.historyCount = document.getElementById('history-count');
    els.historySheetBackdrop = document.getElementById('history-sheet-backdrop');
    els.historySheet = document.getElementById('history-sheet');
    els.historySheetCloseBtn = document.getElementById('history-sheet-close-btn');

    // Fader or Finisher
    els.faderSubDaily = document.getElementById('fader-sub-daily');
    els.faderSubFree = document.getElementById('fader-sub-free');
    els.faderPracticeBanner = document.getElementById('fader-practice-banner');
    els.faderEyebrow = document.getElementById('fader-eyebrow');
    els.faderRoundNum = document.getElementById('fader-round-num');
    els.faderScoreNum = document.getElementById('fader-score-num');
    els.faderStreakWrap = document.getElementById('fader-streak-wrap');
    els.faderStreakNum = document.getElementById('fader-streak-num');
    els.faderPrompt = document.getElementById('fader-prompt');
    els.faderButtons = document.getElementById('fader-buttons');
    els.faderFinishBtn = document.getElementById('fader-finish-btn');
    els.faderFadeBtn = document.getElementById('fader-fade-btn');
    els.faderReveal = document.getElementById('fader-reveal');
    els.faderVerdict = document.getElementById('fader-verdict');
    els.faderSecondhalfValue = document.getElementById('fader-secondhalf-value');
    els.faderBars = document.getElementById('fader-bars');
    els.faderSamples = document.getElementById('fader-samples');
    els.faderDelta = document.getElementById('fader-delta');
    els.faderNextBtn = document.getElementById('fader-next-btn');
    els.faderFinal = document.getElementById('fader-final');
    els.faderFinalScore = document.getElementById('fader-final-score');
    els.faderComeback = document.getElementById('fader-comeback');
    els.faderShareBtn = document.getElementById('fader-share-btn');
    els.faderShareCopied = document.getElementById('fader-share-copied');
    els.faderAgainBtn = document.getElementById('fader-again-btn');
    els.faderMethodBtn = document.getElementById('fader-method-btn');

    // Career Arc
    els.arcSubDaily = document.getElementById('arc-sub-daily');
    els.arcSubPractice = document.getElementById('arc-sub-practice');
    els.arcPracticeBanner = document.getElementById('arc-practice-banner');
    els.arcNewBtn = document.getElementById('arc-new-btn');
    els.arcEyebrow = document.getElementById('arc-eyebrow');
    els.arcInstructions = document.getElementById('arc-instructions');
    els.arcCards = document.getElementById('arc-cards');
    els.arcClearBtn = document.getElementById('arc-clear-btn');
    els.arcSubmitBtn = document.getElementById('arc-submit-btn');
    els.arcResult = document.getElementById('arc-result');
    els.arcScoreLine = document.getElementById('arc-score-line');
    els.arcRevealOpenBtn = document.getElementById('arc-reveal-open-btn');
    els.arcShareBtn = document.getElementById('arc-share-btn');
    els.arcShareCopied = document.getElementById('arc-share-copied');
    els.arcComeback = document.getElementById('arc-comeback');
    els.arcRevealSheetBackdrop = document.getElementById('arc-reveal-sheet-backdrop');
    els.arcRevealSheet = document.getElementById('arc-reveal-sheet');
    els.arcRevealSheetCloseBtn = document.getElementById('arc-reveal-sheet-close-btn');
    els.arcRevealList = document.getElementById('arc-reveal-list');
    els.arcLinechart = document.getElementById('arc-linechart');
    els.arcLinechartSrSummary = document.getElementById('arc-linechart-sr-summary');
  }

  // ---------------------------------------------------------------------
  // M0: Daily vs Free Play (Chimera) — the mode switch is the trust rule.
  // Every render below reads the active target/record through TARGET /
  // todayRecord(), so switching sub-modes never touches the other's state.
  // ---------------------------------------------------------------------

  function refreshChimeraView() {
    TARGET = activeChimeraMode === 'practice' ? PRACTICE_TARGET : DAILY_TARGET;
    renderPrompt();
    renderScoutingLine();
    renderGuesses();
    if (todayRecord().done) lockInput(); else unlockInput();
    renderMapOnce();
    checkRollover();
  }

  function switchChimeraSubMode(mode) {
    if (mode === activeChimeraMode) return;
    activeChimeraMode = mode;
    equationForceExpand = false;
    els.chimeraSubDaily.classList.toggle('is-active', mode === 'daily');
    els.chimeraSubPractice.classList.toggle('is-active', mode === 'practice');
    els.chimeraSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.chimeraSubPractice.setAttribute('aria-selected', String(mode === 'practice'));
    els.chimeraPracticeBanner.hidden = mode !== 'practice';
    refreshChimeraView();
  }

  function startNewPracticeChimera() {
    PRACTICE_TARGET = buildPracticeTarget();
    PRACTICE_REC = { guesses: [], done: false, won: false };
    equationForceExpand = false;
    refreshChimeraView();
    track('vh-start', { mode: 'free' });
  }

  // ---------------------------------------------------------------------
  // Equation collapse-to-chip (mobile-first: after the first guess the
  // equation tiles give way to a one-line chip; tapping it re-expands until
  // the next guess collapses it again). Desktop has room so this still
  // applies there too — it's one less thing between guesses.
  // ---------------------------------------------------------------------

  var equationForceExpand = false;

  function renderEquationCollapse() {
    var rec = todayRecord();
    var collapsed = rec.guesses.length > 0 && !equationForceExpand;
    els.equationRow.hidden = collapsed;
    els.equationChip.hidden = !collapsed;
  }

  function setupEquationChip() {
    els.equationChip.addEventListener('click', function () {
      equationForceExpand = true;
      renderEquationCollapse();
    });
  }

  function setupChimeraSubtabs() {
    els.chimeraSubDaily.addEventListener('click', function () { switchChimeraSubMode('daily'); });
    els.chimeraSubPractice.addEventListener('click', function () {
      if (!PRACTICE_TARGET) PRACTICE_TARGET = buildPracticeTarget();
      switchChimeraSubMode('practice');
    });
    els.chimeraNewBtn.addEventListener('click', startNewPracticeChimera);
  }

  function setupChimeraInputs() {
    createAutocomplete(els.chimeraInput, els.chimeraSuggestions, DATA.players, function (p) {
      pendingChimeraSelection = p;
      els.chimeraSubmit.disabled = false;
    });
    els.chimeraInput.addEventListener('input', function () {
      pendingChimeraSelection = null;
      els.chimeraSubmit.disabled = true;
      hideDuplicateWarning();
    });
    els.chimeraSubmit.addEventListener('click', submitGuess);
    els.chimeraInput.disabled = false;
  }

  function resumeChimeraIfDone() {
    if (todayRecord().done) lockInput();
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Rollover: the day's puzzle is frozen at first load (TODAY is captured
  // once, above, at script start). If the UTC date changes mid-session we
  // never silently swap the target under the player — show a banner and
  // let them choose when to reload.
  // ---------------------------------------------------------------------

  // Rollover banner only in Daily (Chimera): Free Play and The Deadline are
  // unaffected by the puzzle date, so the banner has nothing to say there.
  function checkRollover() {
    var pending = utcDateString() !== TODAY;
    var onChimeraDaily = !els.panelChimera.hidden && activeChimeraMode === 'daily';
    els.rolloverBanner.hidden = !(pending && onChimeraDaily);
  }

  function setupRollover() {
    els.rolloverReloadBtn.addEventListener('click', function () {
      window.location.reload();
    });
    setInterval(checkRollover, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkRollover();
    });
  }

  function init() {
    initDom();
    if (hasSeenHelp() && els.appHeader) els.appHeader.classList.add('vh-header--compact');
    setupHelp();
    setupStats();
    setupMethods();
    setupDossierModal();
    setupRollover();
    setupEquationChip();
    setupSheets();
    setupArc();
    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        DATA = json;
        var k = DATA.clusters.length;
        var dims = DATA.features.length;
        CENTROIDS = computeCentroids(DATA.players, k, dims);
        CLUSTER_XYZ = computeClusterXYZ(DATA.players, k);
        DAILY_TARGET = buildDailyTarget();
        TARGET = DAILY_TARGET;
        STATE = loadState();
        PRACTICE_STATS = loadPracticeStats();
        DEADLINE_STATE = loadDeadlineDailyState();
        FADER_STATE = loadFaderDailyState();
        FADER_PRACTICE_STATS = loadFaderPracticeStats();
        ARC_STATE = loadArcDailyState();
        ARC_PRACTICE_STATS = loadArcPracticeStats();
        ARC_INDEX = buildArcIndex();

        els.loadingBanner.hidden = true;
        // First paint: reveal the real content only once data has actually
        // loaded, replacing the skeleton's placeholder dashes.
        els.gameSkeleton.hidden = true;
        els.promptCard.hidden = false;
        els.guessbarCard.hidden = false;

        if (!DATA.positions) mapColorMode = 'cluster';
        renderPrompt();
        renderScoutingLine();
        renderFooter();
        renderStreak();
        renderMapLegend();
        renderMapAxesInfo();
        setupChimeraInputs();
        setupChimeraSubtabs();
        setupShare();

        setupMapInteraction();
        setupModeTabs();
        renderGuesses();
        resumeChimeraIfDone();

        // Pin the report/map panels open on wide viewports (two-column
        // desktop layout); below that breakpoint they stay closed sheets
        // until the player opens them. Also wires the resize listener that
        // keeps this correct if the viewport crosses 1000px later.
        setupDesktopPin();

        // One immediate paint so a pinned-open desktop map isn't blank for
        // the frame or two before the IntersectionObserver's first callback
        // lands and takes over deciding whether the rotation loop should run.
        if (mapVisible) renderMap();

        fetch(DEADLINE_URL)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (dj) {
            DEADLINE = dj;
            DEADLINE_POOL = buildDeadlinePool();
            setupDeadline();
            renderDeadlineHeader();
          })
          .catch(function () {
            els.tabDeadline.disabled = true;
            els.tabDeadline.setAttribute('aria-disabled', 'true');
          });

        fetch(FADERFINISHER_URL)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (fj) {
            FADERFINISHER = fj;
            FF_POOL = FADERFINISHER.questions || [];
            setupFader();
          })
          .catch(function () {
            els.tabFader.disabled = true;
            els.tabFader.setAttribute('aria-disabled', 'true');
          });

        if (todayRecord().guesses.length === 0 && !todayRecord().done) {
          track('vh-start', { mode: 'daily' });
        }
        // Auto-open the how-to-play modal only on a player's true first-ever
        // visit (a dedicated flag, independent of daily guess state) — never
        // on a daily cadence.
        if (!hasSeenHelp()) {
          openHelp();
          markSeenHelp();
        }
      })
      .catch(function (err) {
        els.loadingBanner.hidden = true;
        els.gameSkeleton.hidden = true;
        els.errorBanner.hidden = false;
        els.errorBanner.textContent = 'Could not load vectors.json (' + err.message + '). Is assets/vectors.json built yet?';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
