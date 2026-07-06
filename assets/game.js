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
  var CHEMISTRY_URL = 'assets/chemistry.json';
  var PIVOTS_URL = 'assets/pivots.json';
  var ERATWINS_URL = 'assets/eratwins.json';
  var ARCHETYPE_TIME_URL = 'assets/archetypes_time.json';
  var TRAJECTORIES_URL = 'assets/trajectories.json';
  var EPOCH_DATE = '2026-07-01'; // puzzle #1
  // v5: STAGED SEQUENTIAL FLOW + multiplier scoring. All three cards show
  // their full evidence immediately (nothing hidden), but the GUESS ORDER
  // is staged: one guess for the Stats Player, one guess for the Style
  // Player (each always resolves, right or wrong, earning a multiplier),
  // then the Mashup unlocks for up to MAX_MASHUP_GUESSES tries. The Mashup
  // still locks on an exact true-nearest match (gold) or >=92% full-blend
  // cosine ("close enough" — silver).
  var MAX_MASHUP_GUESSES = 6;
  var WIN_SIMILARITY = 0.92;
  // Stage multiplier tiers (Stats/Style), by alignment (halfSims cosine)
  // against that donor's own half of the blend — exact player-season beats
  // every similarity tier regardless of how close a wrong guess measures.
  var MULT_EXACT = 2.0;
  var MULT_TIER_90 = 1.5;
  var MULT_TIER_75 = 1.25;
  var MULT_TIER_50 = 1.1;
  var MULT_BASE = 1.0;
  // Mashup base points by the guess number (1-6) it's solved on; unsolved
  // scores 0 base (but the two donor multipliers still bank a consolation
  // credit — see computeFinalPoints). Max FINAL = 600 * 2.0 * 2.0 = 2400.
  var MASHUP_BASE_POINTS = [600, 500, 400, 300, 200, 100];
  var LS_KEY = 'vectorHoops.v5';
  var LS_KEY_LEGACY_V4 = 'vectorHoops.v4';
  var LS_KEY_LEGACY_V3 = 'vectorHoops.v3';
  var LS_KEY_LEGACY_V2 = 'vectorHoops.v2';
  var LS_KEY_USER_REF = 'vectorHoops.userRef';
  var LS_KEY_DEADLINE_COUNTER = 'vectorHoops.deadline.counter';
  var LS_KEY_DEADLINE_DAILY = 'vectorHoops.deadline.daily.v1';
  var LS_KEY_PRACTICE_STATS = 'vectorHoops.v3.practice.chimera.stats';
  var LS_KEY_PRACTICE_STATS_LEGACY = 'vectorHoops.practice.chimera.stats';
  var LS_KEY_RESET_NOTE_SEEN = 'vectorHoops.v5.resetNoteSeen';
  var LS_KEY_FF_DAILY = 'vectorHoops.ff.daily.v1';
  var LS_KEY_FF_PRACTICE = 'vectorHoops.ff.practice';
  var LS_KEY_ARC_DAILY = 'vectorHoops.arc.daily.v1';
  var LS_KEY_ARC_PRACTICE = 'vectorHoops.arc.practice';
  var LS_KEY_CHEM_COUNTER = 'vectorHoops.chem.counter';
  var LS_KEY_CHEM_DAILY = 'vectorHoops.chem.daily.v1';
  var LS_KEY_CHEM_PRACTICE = 'vectorHoops.chem.practice';
  var LS_KEY_PIVOT_COUNTER = 'vectorHoops.pivot.counter';
  var LS_KEY_PIVOT_DAILY = 'vectorHoops.pivot.daily.v1';
  var LS_KEY_PIVOT_PRACTICE = 'vectorHoops.pivot.practice';
  var LS_KEY_TWIN_COUNTER = 'vectorHoops.twin.counter';
  var LS_KEY_TWIN_DAILY = 'vectorHoops.twin.daily.v1';
  var LS_KEY_TWIN_PRACTICE = 'vectorHoops.twin.practice';
  var LS_KEY_SEEN_HELP = 'vectorHoops.seenHelp';
  var LS_KEY_LB_PREFIX = 'vectorHoops.lbSubmitted.'; // + game + '.' + day
  var LS_KEY_LB_LAST_GAME = 'vectorHoops.lastPlayedGame';
  var DEADLINE_ROUNDS_PER_RUN = 5;
  var FF_ROUNDS_PER_RUN = 5;
  var ARC_CARD_COUNT = 5;
  var ARC_MIN_SEASONS = 5;
  var CHEM_ROUNDS_PER_RUN = 5;
  var PIVOT_ROUNDS_PER_RUN = 5;
  var TWIN_ROUNDS_PER_RUN = 5;
  var TWIN_MAX_ATTEMPTS = 2;
  var A_COUNT = 7; // first 7 dims come from player A, last 7 from player B
  // GitHub repo/branch + dossier markdown fetch/render now live in
  // assets/dossier.js (shared with wiki.html) — aliased below.
  var GITHUB_REPO = window.VHDossier.GITHUB_REPO;
  var GITHUB_BRANCH = window.VHDossier.GITHUB_BRANCH;
  // M2 hint economy: v5 hints are Mashup-stage only — Stats/Style donors
  // are already revealed by the time the Mashup opens, so donor-position/
  // decade hints no longer apply. Free Play (practice) gets both hints
  // immediately since it never counts toward anything.
  var HINT_POSITION_AT_MASHUP_GUESS = 3;   // position of the true nearest match
  var HINT_ARCHETYPE_AT_MASHUP_GUESS = 5;  // archetype of the true nearest match
  var SLOT_KEYS = ['stats', 'archetype', 'mashup'];
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

  // The exact same split buildTargetFromRng/buildTargetFromPlayers use for
  // TARGET.vector (donor A -> dims [0,A_COUNT), donor B -> the rest) — the
  // per-half secondary feedback (halfSims) must use these same indices or
  // it stops being honestly recomputable from the target construction.
  var STATS_DIMS = [0, 1, 2, 3, 4, 5, 6];
  var SHOOTING_DIMS = [7, 8, 9, 10, 11, 12, 13];

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

  function subVector(v, dims) {
    var out = new Array(dims.length);
    for (var i = 0; i < dims.length; i++) out[i] = v[dims[i]];
    return out;
  }

  // Secondary, per-half read on a guess (kept alongside the primary
  // full-blend cosine): how well does this guess match the STATS half
  // (donor A's dims) and the SHOOTING half (donor B's dims) on their own?
  // Uses the exact same STATS_DIMS/SHOOTING_DIMS split the target vector
  // was built from — see buildTargetFromPlayers.
  function halfSims(guessVector) {
    return {
      stats: cosineSim(subVector(TARGET.vector, STATS_DIMS), subVector(guessVector, STATS_DIMS)),
      shooting: cosineSim(subVector(TARGET.vector, SHOOTING_DIMS), subVector(guessVector, SHOOTING_DIMS))
    };
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

  function playDate() {
    return CHALLENGE_PLAY_DATE || TODAY;
  }

  function chimeraActiveDate() {
    return playDate();
  }

  function challengerName() {
    return (window.VHIdentity && window.VHIdentity.sessionName()) || 'Someone';
  }

  function playPageUrl() {
    var u = new URL(window.location.href);
    u.search = '';
    u.hash = '';
    if (!/\/play\/?$/i.test(u.pathname)) {
      var base = u.pathname.replace(/\/[^/]*$/, '');
      u.pathname = (base === '' ? '' : base) + '/play';
    }
    return u.origin + u.pathname.replace(/\/$/, '');
  }

  function parseChallengeQuery() {
    try {
      var q = new URLSearchParams(window.location.search);
      if (!q.has('m')) return null;
      var ch = {
        mode: q.get('m'),
        date: q.get('d') || null,
        score: q.get('s') || null,
        challenger: q.get('u') || null,
        donorA: q.has('a') ? parseInt(q.get('a'), 10) : null,
        donorB: q.has('b') ? parseInt(q.get('b'), 10) : null
      };
      if (ch.donorA != null && isNaN(ch.donorA)) ch.donorA = null;
      if (ch.donorB != null && isNaN(ch.donorB)) ch.donorB = null;
      return ch;
    } catch (e) {
      return null;
    }
  }

  function buildChallengeUrl(spec) {
    var params = new URLSearchParams();
    params.set('m', spec.mode);
    if (spec.date) params.set('d', spec.date);
    if (spec.score != null && spec.score !== '') params.set('s', String(spec.score));
    if (spec.challenger) params.set('u', spec.challenger);
    if (spec.donorA != null) params.set('a', String(spec.donorA));
    if (spec.donorB != null) params.set('b', String(spec.donorB));
    return playPageUrl() + '?' + params.toString();
  }

  function formatChallengeScoreLabel(spec) {
    if (spec.scoreLabel) return spec.scoreLabel;
    if (spec.score == null || spec.score === '') return 'a run';
    return String(spec.score);
  }

  function buildChallengeSmsBody(resultText, url, spec) {
    var who = spec.challenger || challengerName();
    var scoreLine = formatChallengeScoreLabel(spec);
    return resultText + '\n\n' +
      who + ' scored ' + scoreLine + ' — beat them on the same puzzle!\n' +
      url + '\n\n' +
      'No login — tap the link, get a random session name, play head-to-head.';
  }

  function shareChallengeResult(resultText, spec, copiedEl, trackMode) {
    var url = buildChallengeUrl(spec);
    var body = buildChallengeSmsBody(resultText, url, spec);
    var openedSms = false;
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.location.href = 'sms:?&body=' + encodeURIComponent(body);
      openedSms = true;
    } else if (navigator.share) {
      navigator.share({ text: body, url: url }).catch(function () {});
      openedSms = true;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(body).then(function () {
        if (copiedEl) {
          copiedEl.textContent = openedSms
            ? 'Opening Messages… link copied too.'
            : 'Copied — paste into a text to challenge someone.';
          copiedEl.hidden = false;
        }
      }).catch(function () {
        if (copiedEl) {
          copiedEl.textContent = openedSms ? 'Opening Messages…' : 'Share this result manually.';
          copiedEl.hidden = false;
        }
      });
    } else if (copiedEl) {
      copiedEl.textContent = openedSms ? 'Opening Messages…' : 'Share this result manually.';
      copiedEl.hidden = false;
    }
    track('vh-share', { mode: trackMode || 'challenge' });
  }

  function showChallengeBanner(ch) {
    if (!els.challengeBanner || !els.challengeBannerText) return;
    if (!ch || (!ch.challenger && !ch.score)) {
      els.challengeBanner.hidden = true;
      return;
    }
    var parts = [];
    if (ch.challenger) parts.push('<b>' + escapeHtml(ch.challenger) + '</b>');
    if (ch.score) {
      parts.push('scored <b>' + escapeHtml(String(ch.score)) + '</b>');
    }
    var modeNames = { ch: 'Chimera', dl: 'Deadline', ff: 'Fader or Finisher', arc: 'Career Arc', cm: 'Best Teammate', pv: 'The Pivot', tw: 'Era Twin' };
    var modeLabel = modeNames[ch.mode] || 'Vector Hoops';
    els.challengeBannerText.innerHTML =
      (parts.length ? parts.join(' ') + ' on ' : '') + escapeHtml(modeLabel) +
      ' — same puzzle for you. Beat them!';
    els.challengeBanner.hidden = false;
  }

  function applyChallengeFromUrl(ch) {
    if (!ch || !DATA) return;
    showChallengeBanner(ch);
    if (ch.mode === 'ch') {
      switchMode('chimera');
      if (ch.donorA != null && ch.donorB != null) {
        var pa = DATA.players[ch.donorA];
        var pb = DATA.players[ch.donorB];
        if (pa && pb) {
          activeChimeraMode = 'practice';
          PRACTICE_STAGE = 'playing';
          PRACTICE_TARGET = buildTargetFromPlayers(pa, pb);
          PRACTICE_REC = freshDayRecord(3);
          els.chimeraSubDaily.classList.toggle('is-active', false);
          els.chimeraSubPractice.classList.toggle('is-active', true);
          refreshChimeraView();
          return;
        }
      }
      if (ch.date && ch.date !== TODAY) {
        CHALLENGE_PLAY_DATE = ch.date;
        CHALLENGE_REC = freshDayRecord();
        DAILY_TARGET = buildTargetFromRng(seededRng('vector-hoops:' + ch.date));
      }
      activeChimeraMode = 'daily';
      TARGET = DAILY_TARGET;
      els.chimeraSubDaily.classList.toggle('is-active', true);
      els.chimeraSubPractice.classList.toggle('is-active', false);
      refreshChimeraView();
    } else if (ch.mode === 'dl' && DEADLINE_POOL) {
      if (ch.date && ch.date !== TODAY) CHALLENGE_PLAY_DATE = ch.date;
      switchMode('deadline');
      deadlineRuns.daily = null;
      switchDeadlineMode('daily');
      startDeadlineRun('daily');
    } else if (ch.mode === 'ff' && FF_POOL) {
      if (ch.date && ch.date !== TODAY) CHALLENGE_PLAY_DATE = ch.date;
      switchMode('fader');
      faderRuns.daily = null;
      switchFaderMode('daily');
      startFaderRun('daily');
    } else if (ch.mode === 'arc' && ARC_INDEX) {
      if (ch.date && ch.date !== TODAY) CHALLENGE_PLAY_DATE = ch.date;
      switchMode('arc');
      arcInitialized = true;
      switchArcSubMode('daily');
    } else if (ch.mode === 'cm' && CHEM_POOL) {
      if (ch.date && ch.date !== TODAY) CHALLENGE_PLAY_DATE = ch.date;
      switchMode('chem');
      chemRuns.daily = null;
      switchChemMode('daily');
    } else if (ch.mode === 'pv' && PIVOT_POOL) {
      if (ch.date && ch.date !== TODAY) CHALLENGE_PLAY_DATE = ch.date;
      switchMode('pivot');
      pivotRuns.daily = null;
      switchPivotMode('daily');
    } else if (ch.mode === 'tw' && TWIN_POOL) {
      if (ch.date && ch.date !== TODAY) CHALLENGE_PLAY_DATE = ch.date;
      switchMode('twin');
      twinRuns.daily = null;
      switchTwinMode('daily');
    }
  }

  function applyDeepLinkMode(ch) {
    var map = { dl: 'deadline', ff: 'fader', arc: 'arc', cm: 'chem', wi: 'whatif', pv: 'pivot', tw: 'twin' };
    var panel = map[ch.mode];
    if (!panel) return;
    switchMode(panel);
    // What-If Lab has no daily puzzle/score to challenge — a bare "wi" deep
    // link (from buildWhatifShareText) just restores the two shared donors.
    if (ch.mode === 'wi' && ch.donorA != null && ch.donorB != null && DATA) {
      var pa = DATA.players[ch.donorA];
      var pb = DATA.players[ch.donorB];
      if (pa && pb) {
        whatifPick = { a: pa, b: pb };
        if (els.whatifAInput) els.whatifAInput.value = playerKey(pa);
        if (els.whatifBInput) els.whatifBInput.value = playerKey(pb);
        if (els.whatifBadgeA) els.whatifBadgeA.hidden = false;
        if (els.whatifBadgeB) els.whatifBadgeB.hidden = false;
        buildWhatifReport();
      }
    }
  }

  function challengeModeReady(ch) {
    if (ch.mode === 'ch') return !!DATA;
    if (ch.mode === 'dl') return !!DEADLINE_POOL;
    if (ch.mode === 'ff') return !!(FF_POOL && FF_POOL.length);
    if (ch.mode === 'arc') return !!ARC_INDEX;
    if (ch.mode === 'cm') return !!(CHEM_POOL && CHEM_POOL.length);
    if (ch.mode === 'wi') return !!DATA;
    if (ch.mode === 'pv') return !!(PIVOT_POOL && PIVOT_POOL.length);
    if (ch.mode === 'tw') return !!(TWIN_POOL && TWIN_POOL.length);
    return false;
  }

  function maybeApplyChallenge() {
    if (!CHALLENGE || CHALLENGE_APPLIED) return;
    if (!challengeModeReady(CHALLENGE)) return;
    if (CHALLENGE.challenger || CHALLENGE.score) {
      applyChallengeFromUrl(CHALLENGE);
    } else if (CHALLENGE.mode !== 'ch') {
      applyDeepLinkMode(CHALLENGE);
    }
    CHALLENGE_APPLIED = true;
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
  var PRACTICE_TARGET = null; // Free Play = Build-a-Chimera: null until the
                              // player picks (or Randomizes) both donors —
                              // see PRACTICE_STAGE/donorPick below.
  var STATE = null;        // persisted localStorage state (Daily Chimera only)
  var TODAY = utcDateString();
  var CHALLENGE = parseChallengeQuery();
  var CHALLENGE_PLAY_DATE = (CHALLENGE && CHALLENGE.date) ? CHALLENGE.date : null;
  var CHALLENGE_REC = null; // in-memory round when replaying a friend's daily on another UTC day
  var CHALLENGE_APPLIED = false;
  // Chemistry + What-If Lab lookups, built once from DATA.players after load —
  // vectors.json carries no team field, so these only index by season/name.
  var PLAYERS_BY_SEASON = null;      // { season: [players] }
  var PLAYERS_BY_NAME_SEASON = null; // { "name|season": player }

  // M0 state isolation: Free Play (Chimera) never touches STATE/LS_KEY above.
  // Its round record and casual counters live entirely separately.
  var activeChimeraMode = 'daily'; // 'daily' | 'practice'
  var PRACTICE_REC = freshDayRecord(3); // Free Play skips Stats/Style — mashup-only from the start
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

  // Every real player-season, ranked by cosine to the target vector, EXCLUDING
  // the two donors themselves — the donors are trivially close on their own
  // half but aren't a "found" answer; the game wants the best real season
  // that plays like the WHOLE blend. Computed once per target (O(n) over the
  // full player pool, ~12k rows of a 14-dim dot product — trivial cost).
  function computeNearestExcludingDonors(target) {
    var players = DATA.players;
    var aId = target.a.id, bId = target.b.id;
    var scored = [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (p.id === aId || p.id === bId) continue;
      scored.push({ id: p.id, sim: cosineSim(target.vector, p.v) });
    }
    scored.sort(function (x, y) { return y.sim - x.sim; });
    return scored.slice(0, 3); // [0] = the true nearest; [1],[2] = runner-ups
  }

  // Builds a target straight from two chosen donors — no rng, no distinctness
  // loop. Used by the seeded paths below (after they pick a/b) AND directly
  // by Build-a-Chimera (Free Play), where the player picks a/b by hand.
  function buildTargetFromPlayers(a, b) {
    var vector = new Array(a.v.length);
    for (var i = 0; i < vector.length; i++) {
      vector[i] = i < A_COUNT ? a.v[i] : b.v[i];
    }
    var clusterIdx = nearestCentroidIdx(vector, CENTROIDS);
    var target = { a: a, b: b, vector: vector, clusterIdx: clusterIdx };
    target.nearest = computeNearestExcludingDonors(target);
    return target;
  }

  // Generalized: same distinct/sim<0.3 constraints regardless of seed source.
  // Daily uses a date seed (shared, deterministic); Randomize (Free Play) uses
  // a random nonce (crypto-sourced, unlimited, never repeats the daily puzzle).
  // NOTE for the accuracy harness: this a/b-picking loop is exactly what
  // pipeline/verify_accuracy.py V4 reimplements in Python to check daily
  // determinism — it never touches target.nearest, so that check is
  // unaffected by the v3 win-condition change.
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
    return buildTargetFromPlayers(a, b);
  }

  function buildDailyTarget() {
    return buildTargetFromRng(seededRng('vector-hoops:' + playDate()));
  }

  function buildPracticeTarget() {
    return buildTargetFromRng(seededRng('vector-hoops:practice:' + randomNonce()));
  }

  function nearestPlayer() {
    var entry = TARGET.nearest && TARGET.nearest[0];
    return entry ? DATA.players[entry.id] : null;
  }

  // M2 hint economy — derived straight from the same vectors the target
  // uses (A3 doctrine), never a fabricated value. Free Play (practice) only
  // ever hunts the mashup, so its hints stay about the TRUE NEAREST match —
  // unchanged from before v4 and available from guess 1.
  function nearestPositionHint() {
    if (!DATA.positions) return null;
    var p = nearestPlayer();
    return (p && typeof p.p === 'number' && p.p >= 0) ? DATA.positions[p.p] : null;
  }

  function nearestArchetypeHint() {
    var p = nearestPlayer();
    return p ? DATA.clusters[p.c] : null;
  }

  function slotLabel(key) {
    if (key === 'stats') return 'Stats';
    if (key === 'archetype') return 'Style';
    return 'Mashup';
  }

  // The true player-season a given slot is hunting — same three objects
  // TARGET already carries, just named uniformly for the loss-reveal recap.
  function slotTruePlayer(key) {
    if (key === 'stats') return TARGET.a;
    if (key === 'archetype') return TARGET.b;
    return nearestPlayer();
  }

  // v5: hints are Mashup-stage only — both donors are already revealed by
  // the time the Mashup opens (stage 3), so hinting them again would be
  // redundant. Free Play still gets both immediately (unchanged).
  function renderHints() {
    if (!els.hintsRow) return;
    var chips = [];
    if (activeChimeraMode === 'practice') {
      var posHint = nearestPositionHint();
      if (posHint) chips.push('<span class="vh-hint-chip">Position: ' + escapeHtml(posHint) + '</span>');
      var archHint = nearestArchetypeHint();
      if (archHint) chips.push('<span class="vh-hint-chip">Archetype: ' + escapeHtml(archHint) + '</span>');
    } else {
      var rec = todayRecord();
      var n = rec.mashupGuesses.length;
      if (n >= HINT_POSITION_AT_MASHUP_GUESS) {
        var pos = nearestPositionHint();
        if (pos) chips.push('<span class="vh-hint-chip">Mashup position: ' + escapeHtml(pos) + '</span>');
      }
      if (n >= HINT_ARCHETYPE_AT_MASHUP_GUESS) {
        var arch = nearestArchetypeHint();
        if (arch) chips.push('<span class="vh-hint-chip">Mashup archetype: ' + escapeHtml(arch) + '</span>');
      }
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

  var ALL_DIMS = STATS_DIMS.concat(SHOOTING_DIMS);

  // Shared phrasing-bank sentence builder over an arbitrary subset of
  // dimensions — top-2 positive sigmas become "an elite {noun} and {noun}",
  // the single most negative sigma becomes the "who {verb phrase}" clause.
  // Both the full scouting line (ALL_DIMS) and each clue card's half
  // sentence (STATS_DIMS / SHOOTING_DIMS) go through this one function, so
  // there's exactly one phrasing source and it always reads off whatever
  // vector/dims the caller is scoring against — never a separately
  // invented adjective.
  function buildHalfScoutingSentence(prefix, vector, dims) {
    var entries = dims.map(function (i) {
      return { key: DATA.features[i], v: vector[i] };
    });
    var byDesc = entries.slice().sort(function (a, b) { return b.v - a.v; });
    var byAsc = entries.slice().sort(function (a, b) { return a.v - b.v; });
    var noun1 = TRAIT_POS_NOUN[byDesc[0].key];
    var noun2 = TRAIT_POS_NOUN[byDesc[1].key];
    var negPhrase = TRAIT_NEG_VERB[byAsc[0].key];
    return prefix + ': an elite ' + noun1 + ' and ' + noun2 + ' who ' + negPhrase + '.';
  }

  function buildScoutingLine(vector, clusterIdx) {
    var archetype = DATA.clusters[clusterIdx];
    return buildHalfScoutingSentence('Reads like', vector, ALL_DIMS) + ' Archetype: ' + archetype + '.';
  }

  // Short labels for the clue cards' extreme-sigma chip row — same 14 keys
  // as featureLabels, just terser for a pill ("Scoring +2.9σ" rather than
  // "scoring volume +2.9σ").
  var CHIP_LABEL = {
    PTS: 'Scoring', AST: 'Assists', OREB: 'Off. Rebounds', DREB: 'Def. Rebounds',
    STL: 'Steals', BLK: 'Blocks', TOV: 'Turnovers',
    FG3A: '3PT Volume', FGA: 'Shot Volume', FTA: 'FT Rate',
    FG3_PCT: '3PT Accuracy', FG_PCT: 'FG Accuracy', FT_PCT: 'FT Touch', PLUS_MINUS: 'Plus-Minus'
  };

  // The 2-3 most extreme |sigma| dims within a dim subset — same
  // TARGET.vector halves (STATS_DIMS/SHOOTING_DIMS) everything else here
  // scores against, so a clue card's chips can never mismatch its bars or
  // its sentence.
  function buildClueChips(vector, dims, count) {
    var entries = dims.map(function (i) {
      return { key: DATA.features[i], v: vector[i] };
    });
    entries.sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
    return entries.slice(0, count || 3).map(function (e) {
      return CHIP_LABEL[e.key] + ' ' + fmtSigma(e.v);
    });
  }

  function renderPrompt() {
    els.puzzleDay.textContent = String(puzzleNumber(TODAY)); // header "day" is always the daily count
    if (activeChimeraMode === 'practice') {
      els.puzzleNumber.textContent = 'Practice Chimera #' + (PRACTICE_STATS.played + 1);
      els.promptText.textContent =
        'You built it — now find its match. Guess the real player-season that plays ' +
        "closest to your blend. Unlimited attempts — doesn't affect your daily streak.";
    } else {
      els.puzzleNumber.textContent = 'Vector Hoops #' + puzzleNumber(playDate());
      els.promptText.textContent =
        'The equation IS the puzzle: all three cards show their full evidence now, but you ' +
        'name them in order — one guess for the Stats Player, one guess for the Style Player ' +
        '(each earns a multiplier whether you\'re right or not), then up to ' + MAX_MASHUP_GUESSES +
        ' guesses for the Mashup. The true closest match in the whole player pool is a PERFECT ' +
        'MATCH on Mashup; 92%+ also locks it. FINAL score = mashup base points × both multipliers.';
    }
    renderEquationTiles();
    renderChimeraStatusLine();
  }

  // Equation tiles are the three answer slots themselves. Free Play already
  // knows its own donors (the player picked them), so those two tiles show
  // openly there — only the Mashup tile is ever a mystery in practice.
  function renderEquationTiles() {
    var rec = todayRecord();
    var isPractice = activeChimeraMode === 'practice';
    var statsSlot = isPractice ? { locked: true, name: playerKey(TARGET.a), silver: false } : rec.slots.stats;
    var archSlot = isPractice ? { locked: true, name: playerKey(TARGET.b), silver: false } : rec.slots.archetype;
    setEquationTile(els.equationNameA, els.equationTileA, statsSlot);
    setEquationTile(els.equationNameB, els.equationTileB, archSlot);
    setEquationTile(els.equationNameMashup, els.equationTileMashup, rec.slots.mashup);
  }

  function setEquationTile(nameEl, tileEl, slot) {
    if (!nameEl) return;
    if (slot.locked) {
      nameEl.textContent = slot.name;
      nameEl.classList.remove('vh-equation__tile-mark');
      nameEl.classList.add('vh-equation__tile-name');
    } else {
      nameEl.textContent = '?';
      nameEl.classList.add('vh-equation__tile-mark');
      nameEl.classList.remove('vh-equation__tile-name');
    }
    if (tileEl) {
      tileEl.classList.toggle('vh-equation__tile--gold', !!(slot.locked && !slot.silver));
      tileEl.classList.toggle('vh-equation__tile--silver', !!(slot.locked && slot.silver));
    }
  }

  // Replaces the old sequential "Step N of 3" status line — Free Play gets
  // the clarified "you built it" framing; Daily just states the shared turn
  // budget (any slot, any order), since there's no longer a fixed sequence.
  function renderChimeraStatusLine() {
    if (!els.chimeraPhaseLabel) return;
    if (activeChimeraMode === 'practice') {
      els.chimeraPhaseLabel.textContent = 'You built it — find its match.';
      return;
    }
    var rec = todayRecord();
    if (rec.done) {
      els.chimeraPhaseLabel.textContent = (rec.won ? 'Mashup solved — ' : 'Round over — ') + rec.points + ' pts.';
      return;
    }
    if (!rec.s1) {
      els.chimeraPhaseLabel.textContent = 'Stage 1 of 3 — one guess: name the Stats Player.';
      return;
    }
    if (!rec.s2) {
      els.chimeraPhaseLabel.textContent = 'Stage 2 of 3 — one guess: name the Style Player.';
      return;
    }
    var left = Math.max(0, MAX_MASHUP_GUESSES - rec.mashupGuesses.length);
    els.chimeraPhaseLabel.textContent = 'Stage 3 of 3 — find the Mashup: ' +
      left + ' guess' + (left === 1 ? '' : 'es') + ' left.';
  }

  function renderScoutingLine() {
    els.scoutingLine.hidden = false;
    els.scoutingLine.textContent = buildScoutingLine(TARGET.vector, TARGET.clusterIdx);
  }

  // ---------------------------------------------------------------------
  // v5 clue cards: each answer slot's own evidence zone (mini sigma bars +
  // phrasing-bank sentence + extreme-sigma chips), collapsing to
  // chips+sentence after that slot's first submission — tap to re-expand,
  // same pattern as the equation chip (renderEquationCollapse). Reset
  // alongside equationForceExpand at every place that flag is reset.
  // ---------------------------------------------------------------------

  var clueForceExpand = { stats: false, archetype: false, mashup: false };

  function resetClueForceExpand() {
    clueForceExpand.stats = false;
    clueForceExpand.archetype = false;
    clueForceExpand.mashup = false;
  }

  var CLUE_ZONE_CONF = {
    stats: {
      dims: STATS_DIMS, prefix: 'Hunts like',
      zone: 'statsClueZone', bars: 'statsClueBars', sentence: 'statsClueSentence',
      chips: 'statsClueChips', sr: 'statsClueSr', hint: 'statsClueHint'
    },
    archetype: {
      dims: SHOOTING_DIMS, prefix: 'Shoots like',
      zone: 'archetypeClueZone', bars: 'archetypeClueBars', sentence: 'archetypeClueSentence',
      chips: 'archetypeClueChips', sr: 'archetypeClueSr', hint: 'archetypeClueHint'
    }
  };

  // Collapse rule shared by all three clue zones: once that slot carries at
  // least one submission, hide the bars (sentence/chips stay visible) until
  // force-expanded by a tap.
  function applyClueCollapse(key, zoneKey, hintKey) {
    var zoneEl = els[zoneKey];
    if (!zoneEl) return;
    var rec = todayRecord();
    var attempts = (rec.slots[key] && rec.slots[key].attempts) || 0;
    var collapsed = attempts > 0 && !clueForceExpand[key];
    zoneEl.classList.toggle('is-collapsed', collapsed);
    zoneEl.setAttribute('aria-expanded', String(!collapsed));
    if (els[hintKey]) els[hintKey].textContent = collapsed ? 'tap to expand' : 'tap to collapse';
  }

  // Stats/Style donor cards: bars + sentence + chips over that donor's
  // own half of TARGET.vector — the exact STATS_DIMS/SHOOTING_DIMS split
  // halfSims() already scores guesses against, so the clue can never
  // mismatch the scoring.
  function renderDonorClueZone(key) {
    var conf = CLUE_ZONE_CONF[key];
    if (!conf || !els[conf.zone]) return;
    var vector = TARGET.vector;
    renderMiniSigmaBars(els[conf.bars], vector, conf.dims);
    els[conf.sentence].textContent = buildHalfScoutingSentence(conf.prefix, vector, conf.dims);
    var chips = buildClueChips(vector, conf.dims, 3);
    els[conf.chips].innerHTML = chips.map(function (c) {
      return '<span class="vh-hint-chip">' + escapeHtml(c) + '</span>';
    }).join('');
    if (els[conf.sr]) els[conf.sr].textContent = miniSigmaSummaryText(vector, conf.dims);
    applyClueCollapse(key, conf.zone, conf.hint);
  }

  // Mashup card: the full 14-dim profile — its sentence is the existing
  // #scouting-line (renderScoutingLine), unchanged; this just adds the
  // bars + collapse behavior around it.
  function renderMashupClueZone() {
    if (!els.mashupClueZone) return;
    renderMiniSigmaBars(els.mashupClueBars, TARGET.vector, ALL_DIMS);
    if (els.mashupClueSr) els.mashupClueSr.textContent = miniSigmaSummaryText(TARGET.vector, ALL_DIMS);
    applyClueCollapse('mashup', 'mashupClueZone', 'mashupClueHint');
  }

  // v5: the masked header name ("? · Stats Player") + the multiplier badge,
  // both driven by rec.slots[key] which now means "this stage has resolved"
  // (set the instant the one guess is submitted, right or wrong) rather than
  // "exact match found." The badge shows the multiplier earned; gold if the
  // guess was the exact donor, silver otherwise (still a real multiplier).
  function renderStageMaskAndBadge(key) {
    var rec = todayRecord();
    var slot = rec.slots[key];
    var maskEl = key === 'stats' ? els.statsSlotMask : els.archetypeSlotMask;
    if (maskEl) maskEl.textContent = slot.locked ? slot.name : '?';
    var badgeEl = key === 'stats' ? els.chimeraStatsBadge : els.chimeraArchetypeBadge;
    if (badgeEl) {
      badgeEl.hidden = !slot.locked;
      if (slot.locked) badgeEl.textContent = '×' + String(slot.mult);
      badgeEl.classList.toggle('vh-slot-card__badge--silver', !!(slot.locked && slot.silver));
    }
  }

  function renderClueCards() {
    if (activeChimeraMode !== 'practice') {
      renderDonorClueZone('stats');
      renderDonorClueZone('archetype');
      renderStageMaskAndBadge('stats');
      renderStageMaskAndBadge('archetype');
    }
    renderMashupClueZone();
  }

  function setupClueZoneToggle(key, zoneKey, rerenderFn) {
    var el = els[zoneKey];
    if (!el) return;
    el.addEventListener('click', function () {
      clueForceExpand[key] = true;
      rerenderFn();
    });
  }

  function setupClueZones() {
    setupClueZoneToggle('stats', 'statsClueZone', function () { renderDonorClueZone('stats'); });
    setupClueZoneToggle('archetype', 'archetypeClueZone', function () { renderDonorClueZone('archetype'); });
    setupClueZoneToggle('mashup', 'mashupClueZone', renderMashupClueZone);
  }

  // Small "Map →" affordance on every clue card — the courts/breakdown
  // report sheet stays reachable from the Mashup card's own result section
  // ("Full scouting report →", only meaningful once there's a guess to
  // compare); the 3D map is always meaningful (the Chimera diamond is on it
  // from turn 1, donor pins light up once their slot locks), so every card
  // gets a direct shortcut to it.
  function setupClueCardTools() {
    [els.statsMapLink, els.archetypeMapLink, els.mashupMapLink].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () { openMapSheet(btn); });
    });
  }

  // ---------------------------------------------------------------------
  // localStorage state
  // ---------------------------------------------------------------------

  function defaultState() {
    return { streak: 0, maxStreak: 0, lastWinDate: null, days: {} };
  }

  // v5 day record: Stats + Style resolve one guess each (slot.locked = this
  // stage has resolved, right or wrong; slot.silver = resolved but NOT the
  // exact donor; slot.sim/mult = the alignment % and multiplier earned).
  // The Mashup slot keeps the old v3/v4 lock semantics (exact true-nearest =
  // gold, >=92% cosine = silver) over up to MAX_MASHUP_GUESSES tries.
  // s1/s2/mashupGuesses/stage/points are the canonical persisted fields the
  // rest of the app (scoring, share text, stats modal) reads; `slots` is a
  // denormalized convenience view kept in sync at the same time, reused by
  // the map/equation/triangulation rendering that predates the v5 bump.
  function freshSlotState() {
    return { locked: false, silver: false, name: null, id: null, sim: 0, mult: 1, bestSim: 0, attempts: 0 };
  }

  function freshDayRecord(startStage) {
    return {
      v: 5,
      stage: startStage || 1, // 1 = Stats, 2 = Style, 3 = Mashup
      done: false, won: false, points: 0,
      s1: null, s2: null, mashupGuesses: [],
      slots: { stats: freshSlotState(), archetype: freshSlotState(), mashup: freshSlotState() }
    };
  }

  function isV5DayRecord(rec) {
    return !!(rec && typeof rec === 'object' && rec.v === 5 &&
      rec.slots && rec.slots.stats && rec.slots.archetype && rec.slots.mashup &&
      Array.isArray(rec.mashupGuesses));
  }

  function isRoundWon(rec) {
    return rec.slots.mashup.locked;
  }

  // ---------------------------------------------------------------------
  // v5 scoring: stage multipliers (Stats/Style) + Mashup base points + the
  // consolation floor for an unsolved Mashup (so donor skill always counts).
  // ---------------------------------------------------------------------

  function stageMultiplier(sim, exact) {
    if (exact) return MULT_EXACT;
    if (sim >= 0.90) return MULT_TIER_90;
    if (sim >= 0.75) return MULT_TIER_75;
    if (sim >= 0.50) return MULT_TIER_50;
    return MULT_BASE;
  }

  function fmtMult(m) {
    return String(m);
  }

  // 1-based guess number the Mashup was solved on, or null if unsolved.
  function mashupSolvedGuessIndex(rec) {
    var mg = rec.mashupGuesses || [];
    for (var i = 0; i < mg.length; i++) {
      if (mg[i].locked) return i + 1;
    }
    return null;
  }

  // FINAL = round(base * m1 * m2) when the Mashup solves; otherwise a
  // consolation floor of round(100 * (m1*m2 - 1)) so the donor multipliers
  // always count for something, even off a losing Mashup. Max 2400
  // (600 base * 2.0 * 2.0).
  function computeFinalPoints(rec) {
    var m1 = rec.s1 ? rec.s1.mult : MULT_BASE;
    var m2 = rec.s2 ? rec.s2.mult : MULT_BASE;
    var idx = mashupSolvedGuessIndex(rec);
    if (idx) return Math.round(MASHUP_BASE_POINTS[idx - 1] * m1 * m2);
    return Math.max(0, Math.round(100 * (m1 * m2 - 1)));
  }

  function donorWrongSeasonNote(guessPlayer, targetPlayer) {
    if (guessPlayer.name === targetPlayer.name && guessPlayer.season !== targetPlayer.season) {
      return 'Right player, wrong season — the donor is ' + playerKey(targetPlayer) + '.';
    }
    return null;
  }

  // Set true by loadState() when TODAY's record existed under the old key
  // shape and had to be reset; consumed once by init() to show a one-time
  // honest note, then never shown again (LS_KEY_RESET_NOTE_SEEN).
  var dailyResetNoteNeeded = false;

  function loadState() {
    var s = defaultState();
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.streak = parsed.streak || 0;
          s.maxStreak = parsed.maxStreak || parsed.streak || 0;
          s.lastWinDate = parsed.lastWinDate || null;
          s.days = parsed.days || {};
        }
      } catch (e) { /* corrupt v4 state, fall back to default */ }
    } else {
      // First run under v5: seed streak/history from v4, then v3, then v2 —
      // whichever is the newest one present — so a returning player doesn't
      // lose their streak over the schema bump.
      var legacyRaw = null;
      try { legacyRaw = localStorage.getItem(LS_KEY_LEGACY_V4); } catch (e) { legacyRaw = null; }
      if (!legacyRaw) {
        try { legacyRaw = localStorage.getItem(LS_KEY_LEGACY_V3); } catch (e) { legacyRaw = null; }
      }
      if (!legacyRaw) {
        try { legacyRaw = localStorage.getItem(LS_KEY_LEGACY_V2); } catch (e) { legacyRaw = null; }
      }
      if (legacyRaw) {
        try {
          var legacy = JSON.parse(legacyRaw);
          if (legacy && typeof legacy === 'object') {
            s.streak = legacy.streak || 0;
            s.maxStreak = legacy.maxStreak || legacy.streak || 0;
            s.lastWinDate = legacy.lastWinDate || null;
            s.days = legacy.days || {};
          }
        } catch (e) { /* corrupt legacy state, ignore */ }
      }
    }
    if (!isV5DayRecord(s.days[TODAY])) {
      var old = s.days[TODAY];
      var hadOldProgress = !!old && (
        (old.guesses && old.guesses.length > 0) ||
        (old.mashupGuesses && old.mashupGuesses.length > 0) ||
        old.s1 || old.s2
      );
      if (hadOldProgress) dailyResetNoteNeeded = true;
      s.days[TODAY] = freshDayRecord();
    }
    return s;
  }

  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(STATE)); } catch (e) { /* storage unavailable */ }
  }

  function shouldShowDailyResetNote() {
    if (!dailyResetNoteNeeded) return false;
    var seen = false;
    try { seen = localStorage.getItem(LS_KEY_RESET_NOTE_SEEN) === '1'; } catch (e) { seen = false; }
    return !seen;
  }

  function markDailyResetNoteSeen() {
    try { localStorage.setItem(LS_KEY_RESET_NOTE_SEEN, '1'); } catch (e) { /* storage unavailable */ }
  }

  // Loads once at init; { played, won } — Free Play (Chimera) only. Separate
  // key from LS_KEY so a practice round can never touch daily state (M0).
  // v3 renamed the key (see LS_KEY_PRACTICE_STATS) purely for naming
  // consistency with the LS_KEY bump — the counted shape (played/won) didn't
  // change, so this is a direct value carry-over, no reset needed.
  function loadPracticeStats() {
    var s = { played: 0, won: 0 };
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_PRACTICE_STATS); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          s.played = parsed.played || 0;
          s.won = parsed.won || 0;
        }
      } catch (e) { /* corrupt, fall back to default */ }
      return s;
    }
    var legacyRaw = null;
    try { legacyRaw = localStorage.getItem(LS_KEY_PRACTICE_STATS_LEGACY); } catch (e) { legacyRaw = null; }
    if (legacyRaw) {
      try {
        var legacy = JSON.parse(legacyRaw);
        if (legacy && typeof legacy === 'object') {
          s.played = legacy.played || 0;
          s.won = legacy.won || 0;
        }
      } catch (e) { /* corrupt legacy, fall back to default */ }
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
    if (activeChimeraMode === 'practice') return PRACTICE_REC;
    if (CHALLENGE_PLAY_DATE && CHALLENGE_PLAY_DATE !== TODAY) {
      if (!CHALLENGE_REC) CHALLENGE_REC = freshDayRecord();
      return CHALLENGE_REC;
    }
    return STATE.days[playDate()];
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
      track(won ? 'vh-win' : 'vh-loss', { turns: rec.mashupGuesses.length, mode: modeDetail, stage: 3 });
      return; // Free Play never touches STATE/streak — state isolation (M0)
    }
    rec.points = computeFinalPoints(rec);
    if (won) {
      var yesterday = utcDateString(new Date(Date.now() - 86400000));
      STATE.streak = (STATE.lastWinDate === yesterday) ? STATE.streak + 1 : 1;
      STATE.lastWinDate = TODAY;
      STATE.maxStreak = Math.max(STATE.maxStreak || 0, STATE.streak);
      track('vh-win', { turns: rec.mashupGuesses.length, mode: modeDetail, stage: 3 });
    } else {
      STATE.streak = 0;
      track('vh-loss', { mode: modeDetail, stage: 3 });
    }
    // Chimera board = points exist whether the round was won or lost (the
    // two donor multipliers always bank something) — submit either way,
    // 0-2400 higher-better (see leaderboard.html note).
    submitLeaderboardScore('chimera', TODAY, rec.points);
    saveState();
    renderStreak();
  }

  function renderStreak() {
    els.streakNum.textContent = String(STATE.streak);
  }

  // ---------------------------------------------------------------------
  // Stats (M1): played/win%/streak/maxStreak + mashup guess-to-solve
  // histogram + v5's points-based aggregates (total pts, best day, avg
  // multiplier), all recomputed straight from the persisted Daily Chimera
  // days map. Played/wins/streak stay readable for pre-v5 history (older
  // day records still carry rec.done/rec.won); the points aggregates only
  // ever sum days that actually carry v5's points/s1/s2 fields, so a mixed
  // history never fabricates a multiplier or point total for an old round.
  // ---------------------------------------------------------------------

  function computeDailyChimeraStats() {
    var played = 0, wins = 0, dist = [];
    var totalPts = 0, bestDay = 0, multSum = 0, multCount = 0;
    for (var di = 0; di < MAX_MASHUP_GUESSES; di++) dist.push(0);
    Object.keys(STATE.days).forEach(function (d) {
      var rec = STATE.days[d];
      if (!rec || !rec.done) return;
      played++;
      if (rec.won) {
        wins++;
        // v5 records: mashupGuesses is already mashup-only. Older v4
        // records mix all three slots into one guesses[] log — filter to
        // slot==='mashup' so a donor-slot lock never gets mistaken for the
        // mashup's solve position in the histogram.
        var mg = rec.mashupGuesses || (rec.guesses || []).filter(function (g) { return g.slot === 'mashup'; });
        var n = -1;
        for (var i = 0; i < mg.length; i++) { if (mg[i].locked) { n = i; break; } }
        if (n === -1) n = Math.min(MAX_MASHUP_GUESSES, mg.length) - 1;
        if (n >= 0 && n < dist.length) dist[n]++;
      }
      if (rec.v === 5 && typeof rec.points === 'number') {
        totalPts += rec.points;
        if (rec.points > bestDay) bestDay = rec.points;
        if (rec.s1 && rec.s2) {
          multSum += (rec.s1.mult * rec.s2.mult);
          multCount++;
        }
      }
    });
    return {
      played: played,
      wins: wins,
      winPct: played ? Math.round((wins / played) * 100) : 0,
      streak: STATE.streak,
      maxStreak: STATE.maxStreak || 0,
      dist: dist,
      totalPts: totalPts,
      bestDay: bestDay,
      avgMultiplier: multCount ? (multSum / multCount) : 0
    };
  }

  // ---------------------------------------------------------------------
  // Autocomplete
  // ---------------------------------------------------------------------

  // opts: { hintEl, wrapEl } — the "typeahead obviousness" affordances
  // (search glyph, chevron, empty-focus hint row, rich suggestion rows,
  // keyboard caption) are shared across all three typeahead inputs: the
  // Chimera guess input and the two Build-a-Chimera donor pickers.
  function createAutocomplete(inputEl, listEl, players, onSelect, opts) {
    opts = opts || {};
    var hintEl = opts.hintEl || null;
    var wrapEl = opts.wrapEl || (inputEl.closest ? inputEl.closest('.vh-autocomplete') : null);
    var activeIdx = -1;
    var currentMatches = [];

    function updateChevron() {
      if (wrapEl) wrapEl.classList.toggle('has-value', inputEl.value.trim().length > 0);
    }

    // Focus hint: "e.g. Nikola Jokić — then pick a season" — shown only
    // when the input is focused AND empty (nothing to search yet).
    function updateFocusHint(isFocused) {
      if (!hintEl) return;
      hintEl.hidden = !(isFocused && inputEl.value.trim().length === 0);
    }

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

    // Rich row: bold name + season + position chip — reads as a menu of
    // real player-seasons, not a bare list of strings.
    function rowHtml(p) {
      var posChip = (typeof p.p === 'number' && p.p >= 0 && DATA.positions) ?
        '<span class="vh-suggestions__chip">' + escapeHtml(DATA.positions[p.p]) + '</span>' : '';
      return '<span class="vh-suggestions__name">' + escapeHtml(p.name) + '</span>' +
        '<span class="vh-suggestions__season">' + escapeHtml(p.season) + '</span>' + posChip;
    }

    function open(matches) {
      if (matches.length === 0) { openEmpty(); return; }
      currentMatches = matches;
      activeIdx = -1;
      listEl.innerHTML = '';
      matches.forEach(function (p, idx) {
        var li = document.createElement('li');
        li.className = 'vh-suggestions__row';
        li.setAttribute('role', 'option');
        li.innerHTML = rowHtml(p);
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
      updateChevron();
      updateFocusHint(false);
      onSelect(p);
    }

    // accent-insensitive: "jokic" finds "Jokić", "doncic" finds "Dončić"
    function foldTerm(s) {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    // `players` may be a static array (every existing call site) or a
    // zero-arg function returning the CURRENT pool (Era Twin: the eligible
    // guess pool changes every round — a live indirection here means one
    // createAutocomplete() call/listener set can serve every round instead
    // of re-registering handlers each time).
    function search(term) {
      term = foldTerm(term.trim());
      if (!term) { close(); return; }
      var pool = typeof players === 'function' ? players() : players;
      var matches = [];
      for (var i = 0; i < pool.length && matches.length < 8; i++) {
        var p = pool[i];
        if (p._k === undefined) p._k = foldTerm(playerKey(p));
        if (p._k.indexOf(term) !== -1) matches.push(p);
      }
      open(matches);
    }

    inputEl.addEventListener('input', function () {
      updateChevron();
      updateFocusHint(true);
      search(inputEl.value);
    });

    inputEl.addEventListener('focus', function () {
      updateFocusHint(true);
    });

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
      updateFocusHint(false);
      setTimeout(close, 120);
    });

    updateChevron();
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

  // targetLabel/guessLabel default to the Chimera reveal's own wording so the
  // one existing caller (renderGuesses) is unaffected; What-If Lab's coverage
  // map passes its own two player names instead.
  function breakdownSummaryText(targetVector, guessVector, targetLabel, guessLabel) {
    targetLabel = targetLabel || 'Chimera';
    guessLabel = guessLabel || 'your guess';
    var parts = DATA.features.map(function (key, i) {
      var label = DATA.featureLabels[key];
      return label + ': ' + targetLabel + ' ' + fmtSigma(targetVector[i]) + ', ' + guessLabel + ' ' + fmtSigma(guessVector[i]);
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

  // What-If Lab: overlay both players' zone presence on one court instead of
  // side-by-side courts. Each player's fills/hatches are drawn independently
  // in their own translucent color (orange = Player A, blue = Player B, same
  // hues the rest of the app already uses for "first pick"/"second pick") —
  // overlapping zones blend naturally through ordinary canvas alpha
  // compositing, no special blend mode required. Court lines/dimensions are
  // drawn once, on top, so the survey layer never gets obscured by fills.
  function drawZonesForPlayer(ctx, g, zones, rgb) {
    fillRegion(ctx, g, [pathRA], rgb, zoneT(zones.rim));
    fillRegion(ctx, g, [pathKey, pathRA], rgb, zoneT(zones.paintFT));
    fillRegion(ctx, g, [pathInside3, pathKey], rgb, zoneT(zones.mid));
    fillRegion(ctx, g, [pathCourt, pathInside3], rgb, zoneT(zones.arc));
    hatchRegion(ctx, g, [pathKey], rgb, zoneT(zones.paintD) * 0.7, false);
    hatchRegion(ctx, g, [pathCourt, pathInside3], rgb, zoneT(zones.perimeterD) * 0.55, true);
  }

  function drawGlassBlockPair(ctx, g, ftx, zA, zB, rgbA, rgbB) {
    var BOX = 2.6;
    ctx.save();
    ctx.lineWidth = 1;
    // Player A's block sits slightly left/above, Player B's slightly right/below —
    // offset so both sigmas stay legible instead of one fully occluding the other.
    ctx.beginPath();
    ctx.rect(g.X(ftx - BOX - 0.6), g.Y(2.4 + BOX * 2 + 0.6), BOX * g.s, BOX * g.s);
    ctx.fillStyle = 'rgba(' + rgbA + ',' + (zoneT(zA) * ZONE_FILL_MAX + 0.04).toFixed(3) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + rgbA + ',0.9)';
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(g.X(ftx + 0.6), g.Y(2.4 + BOX), BOX * g.s, BOX * g.s);
    ctx.fillStyle = 'rgba(' + rgbB + ',' + (zoneT(zB) * ZONE_FILL_MAX + 0.04).toFixed(3) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + rgbB + ',0.9)';
    ctx.stroke();
    ctx.restore();
  }

  function renderCourtOverlay(canvas, vectorA, vectorB) {
    var r = resizeCourtCanvas(canvas);
    var ctx = r.ctx, wCss = r.wCss, hCss = r.hCss;
    ctx.clearRect(0, 0, wCss, hCss);
    var g = courtGeometry(wCss, hCss);
    var zonesA = zoneRaw(vectorA);
    var zonesB = zoneRaw(vectorB);
    drawZonesForPlayer(ctx, g, zonesA, AMBER_RGB);
    drawZonesForPlayer(ctx, g, zonesB, BLUE_RGB);
    drawGlassBlockPair(ctx, g, 12.6, zonesA.oreb, zonesB.oreb, AMBER_RGB, BLUE_RGB);
    drawGlassBlockPair(ctx, g, 50 - 12.6, zonesA.glassD, zonesB.glassD, AMBER_RGB, BLUE_RGB);
    drawCourtLines(ctx, g);
    drawCourtDimensions(ctx, g);
    return { a: zonesA, b: zonesB };
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

  // host/targetLabel/guessLabel all default to the Chimera reveal's own
  // wiring so the existing call site below needs no changes; What-If Lab's
  // coverage map passes its own host element + two player names instead.
  function renderBreakdown(host, targetVector, guessVector, targetLabel, guessLabel) {
    host = host || els.breakdownChart;
    targetLabel = targetLabel || 'Chimera';
    guessLabel = guessLabel || 'Your guess';
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

      bar(y, tv, ORANGE_HEX, targetLabel + ' · ' + label + ': ' +
        (tv >= 0 ? '+' : '') + tv.toFixed(1) + 'σ');
      bar(y + BAR_H + BAR_GAP, gv, BLUE_HEX, guessLabel +
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

  // dims optional: defaults to every dimension (0..vector.length-1), the
  // original full-14 behavior every existing caller (Arc cards, Era Twin)
  // still gets. Clue cards pass STATS_DIMS/SHOOTING_DIMS to summarize just
  // their own half — same subset halfSims() already scores against.
  function miniSigmaSummaryText(vector, dims) {
    dims = dims || vector.map(function (_, i) { return i; });
    var parts = dims.map(function (i) {
      return DATA.featureLabels[DATA.features[i]] + ' ' + fmtSigma(vector[i]);
    });
    return 'Sigma profile, ' + dims.length + ' dimensions vs era: ' + parts.join(', ') + '.';
  }

  // dims optional: same default/subset contract as miniSigmaSummaryText
  // above — this is the "compact bar renderer" clue cards reuse for their
  // per-half evidence zone.
  function renderMiniSigmaBars(host, vector, dims) {
    dims = dims || vector.map(function (_, i) { return i; });
    host.innerHTML = '';
    var W = 130, ROWH = 4.4, GAP = 1.2;
    var H = dims.length * (ROWH + GAP);
    var mid = W / 2, half = W / 2 - 3;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H }, host);
    svgEl('line', { x1: mid, y1: 0, x2: mid, y2: H, stroke: '#e1e0d9', 'stroke-width': 1 }, svg);
    dims.forEach(function (dimIdx, row) {
      var v = Math.max(-MINIBAR_XMAX, Math.min(MINIBAR_XMAX, vector[dimIdx]));
      var w = Math.max(1, Math.abs(v) / MINIBAR_XMAX * half);
      var x = v >= 0 ? mid : mid - w;
      var y = row * (ROWH + GAP);
      var rect = svgEl('rect', {
        x: x, y: y, width: w, height: ROWH, rx: 1,
        fill: v >= 0 ? ORANGE_HEX : BLUE_HEX
      }, svg);
      var title = document.createElementNS(SVG_NS, 'title');
      title.textContent = DATA.featureLabels[DATA.features[dimIdx]] + ': ' + fmtSigma(vector[dimIdx]);
      rect.appendChild(title);
    });
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

  // Exact match against the TRUE NEAREST real player-season (computeNearest
  // ExcludingDonors[0]) — the PERFECT MATCH win state. Independent of raw
  // cosine similarity — a correct id always wins and always renders gold,
  // never red, whatever the sim% happens to read. Donors themselves can
  // never be the true nearest (they're excluded from the ranking), so
  // guessing a donor is never a perfect match — just whatever its own sim%
  // to the full blend happens to be.
  function isPerfectMatchGuess(guessPlayer) {
    var nearestId = TARGET.nearest && TARGET.nearest[0] && TARGET.nearest[0].id;
    return nearestId != null && guessPlayer.id === nearestId;
  }

  // Right player, wrong season: same name as the true nearest match but a
  // different season. Not a win — surfaced as explicit coaching instead.
  function nearestWrongSeasonNote(guessPlayer) {
    var np = nearestPlayer();
    if (np && guessPlayer.name === np.name && guessPlayer.season !== np.season) {
      return 'Right player, wrong season — the closest real match is ' + np.name +
        ' (' + np.season + ').';
    }
    return null;
  }

  // Unified history/map list: the Stats + Style stages each contribute at
  // most one synthetic "guess" entry (once resolved), followed by every
  // Mashup guess in order — the exact chronological order they happened in,
  // and the same entry shape submitMashupGuess() has always produced, so
  // renderGuessRow()/the map's guess pins/redrawCourtsIfVisible() all keep
  // working unchanged over whichever stage(s) have resolved so far.
  function unifiedGuessList(rec) {
    var list = [];
    if (rec.s1) {
      var p1 = DATA.players[rec.s1.guess.id];
      if (p1) {
        list.push({
          id: p1.id, name: rec.s1.guess.name, slot: 'stats',
          halves: halfSims(p1.v), blendSim: cosineSim(TARGET.vector, p1.v),
          sim: rec.s1.sim, locked: true, silver: !rec.s1.exact,
          wrongSeasonNote: rec.s1.exact ? null : donorWrongSeasonNote(p1, TARGET.a)
        });
      }
    }
    if (rec.s2) {
      var p2 = DATA.players[rec.s2.guess.id];
      if (p2) {
        list.push({
          id: p2.id, name: rec.s2.guess.name, slot: 'archetype',
          halves: halfSims(p2.v), blendSim: cosineSim(TARGET.vector, p2.v),
          sim: rec.s2.sim, locked: true, silver: !rec.s2.exact,
          wrongSeasonNote: rec.s2.exact ? null : donorWrongSeasonNote(p2, TARGET.b)
        });
      }
    }
    (rec.mashupGuesses || []).forEach(function (g) { list.push(g); });
    return list;
  }

  function renderGuessRow(entry, idx) {
    var li = document.createElement('li');
    li.className = 'vh-guess' + (entry.locked ? ' is-identified' : '') + (entry.silver ? ' is-silver' : '');
    var pct = Math.round(entry.sim * 100);
    var pctHtml;
    if (entry.locked) {
      var badgeLabel;
      if (entry.slot === 'mashup') {
        badgeLabel = entry.silver ? 'Close enough — locked' : 'Perfect match';
      } else {
        badgeLabel = slotLabel(entry.slot) + ' donor locked';
      }
      pctHtml = '<span class="vh-guess__badge">' + badgeLabel + '</span>' +
        '<span class="vh-guess__pct vh-guess__pct--identified">' + pct + '%</span>';
    } else {
      pctHtml = '<span class="vh-guess__pct ' + pctColorClass(entry.sim) + '">' + pct + '%</span>';
    }
    li.innerHTML =
      '<div class="vh-guess__head">' +
        '<span class="vh-guess__num">' + (idx + 1) + '</span>' +
        '<span class="vh-guess__phase vh-guess__phase--' + entry.slot + '">' + slotLabel(entry.slot) + '</span>' +
        '<span class="vh-guess__name">' + entry.name + '</span>' +
        pctHtml +
      '</div>';
    if (entry.slot === 'mashup' && entry.halves) {
      li.innerHTML += '<p class="vh-guess__row-halves">Stats half ' + Math.round(entry.halves.stats * 100) +
        '% &middot; Archetype half ' + Math.round(entry.halves.shooting * 100) + '%</p>';
    }
    if (entry.wrongSeasonNote) {
      var note = document.createElement('p');
      note.className = 'vh-guess__line vh-guess__line--season';
      note.textContent = entry.wrongSeasonNote;
      li.appendChild(note);
    }
    return li;
  }

  // Mashup-only now (Stats/Style are one-shot, no "warmth" to trail —
  // their result shows in their own feedback line instead).
  function renderWarmth(rec) {
    if (rec.mashupGuesses.length === 0) {
      els.warmthCard.hidden = true;
      return;
    }
    els.warmthCard.hidden = false;

    els.warmthBars.innerHTML = '';
    rec.mashupGuesses.forEach(function (g) {
      var bar = document.createElement('div');
      bar.className = 'vh-warmth__bar vh-warmth__bar--mashup';
      var pct = Math.max(0, Math.round(g.sim * 100));
      bar.style.height = Math.max(3, Math.round(pct * 0.4)) + 'px';
      if (g.locked) bar.classList.add('is-best');
      if (g.silver) bar.classList.add('is-silver');
      bar.title = 'Mashup — ' + g.name + ': ' + pct + '%';
      els.warmthBars.appendChild(bar);
    });

    var bestIdx = 0, bestSim = -Infinity;
    rec.mashupGuesses.forEach(function (g, i) { if (g.sim > bestSim) { bestSim = g.sim; bestIdx = i; } });
    var best = rec.mashupGuesses[bestIdx];
    els.warmthClosest.textContent = 'Closest mashup: ' + best.name + ' — ' + Math.round(best.sim * 100) + '%';
  }

  // Redraws both court canvases at their current laid-out width, e.g. after
  // a viewport resize/rotation, using the last submitted Mashup guess if any.
  function redrawCourtsIfVisible() {
    var rec = todayRecord();
    var last = rec && lastMashupGuess(rec);
    if (!last) return;
    var lastPlayer = DATA.players[last.id];
    if (!lastPlayer) return;
    renderCourt(els.courtTarget, TARGET.vector);
    renderCourt(els.courtGuess, lastPlayer.v);
  }

  function lastMashupGuess(rec) {
    var mg = rec.mashupGuesses || [];
    return mg.length ? mg[mg.length - 1] : null;
  }

  // Per-stage feedback line under each of the two Daily donor guess boxes:
  // once that stage resolves (right or wrong), names the true donor (with
  // a dossier link), the alignment % earned, and the multiplier it's worth.
  // The Mashup slot's own feedback lives in the big result card below
  // (scoreboard/triangulation/courts), so it doesn't need a line here.
  function renderSlotFeedback(rec, key, feedbackEl) {
    if (!feedbackEl) return;
    var slot = rec.slots[key];
    if (!slot.locked) {
      feedbackEl.textContent = '';
      return;
    }
    var truePlayer = key === 'stats' ? TARGET.a : TARGET.b;
    var pct = Math.round(slot.sim * 100);
    var link = '<a href="#" class="vh-dossier-link" data-slug="' + playerSlug(truePlayer.name) +
      '" data-name="' + escapeHtml(truePlayer.name) + '">' + escapeHtml(playerKey(truePlayer)) + '</a>';
    var verdict = slot.silver ? '' : ' (exact match!)';
    feedbackEl.innerHTML = 'Real ' + slotLabel(key) + ' donor: ' + link + '. Your guess aligned ' +
      pct + '% &mdash; ×' + fmtMult(slot.mult) + ' multiplier' + verdict + '.';
  }

  function renderMashupBadges(rec) {
    var slot = rec.slots.mashup;
    if (els.mashupBadgeGold) els.mashupBadgeGold.hidden = !(slot.locked && !slot.silver);
    if (els.mashupBadgeSilver) els.mashupBadgeSilver.hidden = !(slot.locked && slot.silver);
  }

  // Every render/enable-disable decision for the three guess inputs funnels
  // through here — called after every guess AND on mode/round switches.
  // v5 staging: Stats is open from the start (Daily); Style stays disabled
  // (with a lock note) until Stats resolves; Mashup stays disabled until
  // Style resolves. Free Play skips straight to an always-open Mashup input.
  function updateSlotInputAvailability() {
    var rec = todayRecord();
    var isPractice = activeChimeraMode === 'practice';
    var roundOver = rec.done;
    if (!isPractice) {
      var stage1Resolved = !!rec.s1;
      var stage2Resolved = !!rec.s2;
      setSlotInputDisabled(els.chimeraStatsInput, els.chimeraStatsSubmit, roundOver || stage1Resolved);
      setSlotInputDisabled(els.chimeraArchetypeInput, els.chimeraArchetypeSubmit, roundOver || stage2Resolved || !stage1Resolved);
      if (els.archetypeLockNote) els.archetypeLockNote.hidden = roundOver || stage1Resolved;
      var mashupOver = roundOver || rec.slots.mashup.locked || rec.mashupGuesses.length >= MAX_MASHUP_GUESSES;
      setSlotInputDisabled(els.chimeraInput, els.chimeraSubmit, mashupOver || !stage2Resolved);
      if (els.mashupLockNote) els.mashupLockNote.hidden = roundOver || stage2Resolved;
    } else {
      setSlotInputDisabled(els.chimeraInput, els.chimeraSubmit, roundOver || rec.slots.mashup.locked);
      if (els.mashupLockNote) els.mashupLockNote.hidden = true;
    }
  }

  function setSlotInputDisabled(inputEl, submitEl, disabled) {
    if (!inputEl || !submitEl) return;
    inputEl.disabled = disabled;
    if (disabled) submitEl.disabled = true;
  }

  // Full reset (mode switch / new practice round / init): clears any typed-
  // but-not-submitted text across all three slots, then reapplies whatever
  // the current lock/round state says should be disabled.
  function resetAllSlotInputs() {
    pendingSelections.stats = null;
    pendingSelections.archetype = null;
    pendingSelections.mashup = null;
    if (els.chimeraStatsInput) els.chimeraStatsInput.value = '';
    if (els.chimeraArchetypeInput) els.chimeraArchetypeInput.value = '';
    els.chimeraInput.value = '';
    hideDuplicateWarning();
    updateSlotInputAvailability();
  }

  // v5: the header stat tile repurposes "turns left" into whatever's most
  // useful for the current stage — which stage you're on while Stats/Style
  // are still ahead, mashup guesses left once both donors have resolved,
  // and the FINAL points once the round is done.
  function renderChimeraHeaderStat(rec, isPractice) {
    if (!els.guessesLeftNum || !els.guessesLeftLabel) return;
    if (isPractice) {
      els.guessesLeftLabel.textContent = 'guesses used';
      els.guessesLeftNum.textContent = String(rec.mashupGuesses.length);
      return;
    }
    if (rec.done) {
      els.guessesLeftLabel.textContent = 'points';
      els.guessesLeftNum.textContent = String(rec.points);
    } else if (!rec.s1) {
      els.guessesLeftLabel.textContent = 'stage';
      els.guessesLeftNum.textContent = '1/3';
    } else if (!rec.s2) {
      els.guessesLeftLabel.textContent = 'stage';
      els.guessesLeftNum.textContent = '2/3';
    } else {
      els.guessesLeftLabel.textContent = 'mashup left';
      els.guessesLeftNum.textContent = String(Math.max(0, MAX_MASHUP_GUESSES - rec.mashupGuesses.length));
    }
  }

  function renderGuesses() {
    var rec = todayRecord();
    var isPractice = activeChimeraMode === 'practice';
    renderHints();
    renderEquationTiles();
    renderChimeraStatusLine();
    renderEquationCollapse();
    renderClueCards();
    if (els.donorSlotsRow) els.donorSlotsRow.hidden = isPractice;
    if (!isPractice) {
      renderSlotFeedback(rec, 'stats', els.chimeraStatsFeedback);
      renderSlotFeedback(rec, 'archetype', els.chimeraArchetypeFeedback);
    }
    renderMashupBadges(rec);
    updateSlotInputAvailability();

    var unified = unifiedGuessList(rec);
    els.guessList.innerHTML = unified.length ? '' : '<li class="vh-guesslist__empty">No guesses yet.</li>';
    unified.forEach(function (entry, idx) {
      els.guessList.appendChild(renderGuessRow(entry, idx));
    });
    if (els.historyCount) els.historyCount.textContent = String(unified.length);
    renderChimeraHeaderStat(rec, isPractice);

    renderWarmth(rec);
    renderMapLegend();
    els.resultCard.hidden = true;
    els.revealCard.hidden = true;
    if (els.triangulationBlock) els.triangulationBlock.hidden = true;

    var lastMashup = lastMashupGuess(rec);
    if (lastMashup) {
      var lastPlayer = DATA.players[lastMashup.id];
      els.resultCard.hidden = false;
      els.scoreboardPct.textContent = Math.round(lastMashup.sim * 100) + '%';

      if (els.triangulationBlock && lastMashup.halves) {
        els.triangulationBlock.hidden = false;
        els.triStatsPct.textContent = Math.round(lastMashup.halves.stats * 100) + '%';
        els.triShootingPct.textContent = Math.round(lastMashup.halves.shooting * 100) + '%';
        els.triBlendPct.textContent = Math.round(lastMashup.sim * 100) + '%';
        if (els.triangulationSrSummary) {
          els.triangulationSrSummary.textContent = 'Triangulation for your latest mashup guess, ' + lastMashup.name + ': ' +
            'vs Stats Donor ' + Math.round(lastMashup.halves.stats * 100) + '%, ' +
            'vs Style Donor ' + Math.round(lastMashup.halves.shooting * 100) + '%, ' +
            'vs the Chimera mashup ' + Math.round(lastMashup.sim * 100) + '%.';
        }
      }

      var targetZones = renderCourt(els.courtTarget, TARGET.vector);
      var guessZones = renderCourt(els.courtGuess, lastPlayer.v);
      els.courtGuessLabel.textContent = 'Your guess: ' + lastMashup.name;
      els.storyCaption.textContent = storyCaption(targetZones, guessZones);
      els.quickCoachingLine.textContent = coachingLineTop1(TARGET.vector, lastPlayer.v);
      renderBreakdown(els.breakdownChart, TARGET.vector, lastPlayer.v, 'Chimera', lastMashup.name);
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
        var sSign = lastPlayer.sal >= 0 ? '+' : '−';
        coaching += ' Market: this guess held a ' + sSign +
          Math.abs(lastPlayer.sal).toFixed(1) + 'σ payroll slot for its season.';
      }
      els.coachingLine.textContent = coaching;
    }

    renderMapThumbnail();

    if (rec.done) showReveal(rec);
  }

  function shareEmojiRow(entry) {
    if (entry.locked && entry.silver) return '🟩~';
    if (entry.locked) return '🟩⭐';
    if (entry.sim >= 0.85) return '🟩';
    if (entry.sim >= 0.60) return '🟨';
    return '🟥';
  }

  // v5: Stats/Style share emoji is keyed off the multiplier TIER earned —
  // those stages always resolve regardless of accuracy, so "locked" (which
  // shareEmojiRow uses for the Mashup's solved/not) doesn't mean "correct"
  // here the way it does for a Mashup guess.
  function stageShareEmoji(stageResult) {
    if (!stageResult) return '⬜';
    if (stageResult.exact) return '⭐';
    if (stageResult.sim >= 0.90) return '🟩';
    if (stageResult.sim >= 0.75) return '🟨';
    if (stageResult.sim >= 0.50) return '🟧';
    return '🟥';
  }

  // M5 share v2: warmth trail — block glyphs from each Mashup guess's match
  // %, same thresholds as the on-screen warmth bars (renderWarmth).
  function warmthBlockFor(sim) {
    if (sim >= 0.85) return '█';
    if (sim >= 0.60) return '▅';
    if (sim >= 0.35) return '▃';
    return '▁';
  }

  function warmthTrailLine(rec) {
    return rec.mashupGuesses.map(function (g) { return warmthBlockFor(g.sim); }).join('');
  }

  // Only reachable once the round is over (the share button lives on the
  // reveal card, which only renders when rec.done) — safe to name the true
  // nearest match here (already public knowledge post-game); the donors
  // were never secret, so naming them isn't a spoiler either.
  function buildShareText(rec) {
    var np = nearestPlayer();
    var nearestLabel = np ? playerKey(np) : '?';
    if (activeChimeraMode === 'practice') {
      // Free Play (Build-a-Chimera) is unchanged: a single mashup hunt, no
      // fixed denominator, donors already public knowledge (you built it).
      var rows = rec.mashupGuesses.map(shareEmojiRow).join('');
      var trail = warmthTrailLine(rec);
      var equation = TARGET.a.name + ' + ' + TARGET.b.name + ' = ' + nearestLabel + '?';
      var scorePart = rec.won ? 'solved in ' + rec.mashupGuesses.length : 'not solved (' + rec.mashupGuesses.length + ' guesses)';
      return 'Vector Hoops — Practice — ' + equation + ' ' + scorePart + '\n' + rows + '\n' + trail;
    }
    var n = puzzleNumber(playDate());
    var m1 = rec.s1 ? rec.s1.mult : MULT_BASE;
    var m2 = rec.s2 ? rec.s2.mult : MULT_BASE;
    var solvedIdx = mashupSolvedGuessIndex(rec);
    var kLabel = solvedIdx ? String(solvedIdx) : 'X';
    var headline = 'Vector Hoops #' + n + ' — ' + rec.points + ' pts (x' + fmtMult(m1) +
      ' x' + fmtMult(m2) + ', mashup in ' + kLabel + ')';
    var mashupRow = rec.mashupGuesses.length ? rec.mashupGuesses.map(shareEmojiRow).join('') : '⬜';
    var rows =
      '🅰 Stats   ' + stageShareEmoji(rec.s1) + '\n' +
      '🅱 Style   ' + stageShareEmoji(rec.s2) + '\n' +
      '🟰 Mashup  ' + mashupRow;
    return headline + '\n' + rows;
  }

  // Lazy-fetched, cached, fail-soft: the archetype-eras data only loads once
  // a round actually reveals, and any fetch/parse failure is silent — the
  // reveal card already has everything it needs without this bonus line.
  var archetypeTimeCache = null; // null = not yet tried; false = failed; object = loaded
  function loadArchetypeTime(cb) {
    if (archetypeTimeCache) { cb(archetypeTimeCache); return; }
    if (archetypeTimeCache === false) return;
    fetch(ARCHETYPE_TIME_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      archetypeTimeCache = data;
      cb(data);
    }).catch(function () {
      archetypeTimeCache = false;
    });
  }

  // "The mashup's archetype ({name}) peaked at {max}% in {season} — {current}%
  // of the league today" — appended to the reveal card when the data loads in
  // time; silently skipped otherwise (fail-soft, no error surfaced to the player).
  function appendArchetypePrevalenceLine(clusterIdx) {
    if (typeof clusterIdx !== 'number' || clusterIdx < 0) return;
    loadArchetypeTime(function (data) {
      if (!data || !data.globalArchetypes || !data.prevalence || !data.prevalence.length) return;
      var name = data.globalArchetypes[clusterIdx];
      if (!name) return;
      var peak = null, peakSeason = null;
      data.prevalence.forEach(function (p) {
        var share = p.shares && p.shares[clusterIdx];
        if (typeof share === 'number' && (peak === null || share > peak)) {
          peak = share;
          peakSeason = p.season;
        }
      });
      var last = data.prevalence[data.prevalence.length - 1];
      var current = last.shares && last.shares[clusterIdx];
      if (peak === null || typeof current !== 'number') return;
      if (!els.revealBody) return;
      var line = document.createElement('p');
      line.className = 'vh-reveal__prevalence';
      line.textContent = "The mashup's archetype (" + name + ') peaked at ' +
        (peak * 100).toFixed(1) + '% in ' + peakSeason + ' — ' +
        (current * 100).toFixed(1) + '% of the league today.';
      els.revealBody.appendChild(line);
    });
  }

  // v5 FINAL points breakdown, stated verbatim so the multiplier math is
  // never a mystery: base mashup points (by which guess it solved on) times
  // both donor multipliers, or — if the mashup never solved — the
  // consolation floor off just the two donor multipliers (still 0 if
  // neither donor guess beat the base x1.0 tier).
  function pointsBreakdownLine(rec) {
    var m1 = rec.s1 ? rec.s1.mult : MULT_BASE;
    var m2 = rec.s2 ? rec.s2.mult : MULT_BASE;
    var idx = mashupSolvedGuessIndex(rec);
    if (idx) {
      var base = MASHUP_BASE_POINTS[idx - 1];
      return 'FINAL: ' + rec.points + ' pts = ' + base + ' base &times; ' + fmtMult(m1) +
        ' Stats &times; ' + fmtMult(m2) + ' Style multiplier.';
    }
    if (rec.points > 0) {
      return 'FINAL: ' + rec.points + ' pts — mashup unsolved; consolation credit for the donor ' +
        'multipliers (&times;' + fmtMult(m1) + ' &times; ' + fmtMult(m2) + ').';
    }
    return 'FINAL: 0 pts — mashup unsolved and no donor multiplier above the base tier.';
  }

  function showReveal(rec) {
    els.revealCard.hidden = false;
    var isPractice = activeChimeraMode === 'practice';
    var practiceNote = isPractice ? ' (practice)' : '';
    els.revealTitle.textContent = (rec.won ? 'Solved' : 'The Chimera') + practiceNote;

    var abSim = cosineSim(TARGET.a.v, TARGET.b.v);
    var nearestRows = (TARGET.nearest || []).map(function (entry, i) {
      var np = DATA.players[entry.id];
      var pct = Math.round(entry.sim * 100);
      var rank = i === 0 ? '<b>#1 closest real match</b>' : '#' + (i + 1) + ' runner-up';
      return '<li>' + rank + ': ' + playerKey(np) + ' — ' + pct + '%</li>';
    }).join('');

    var recapHtml = isPractice ? '' :
      '<div class="vh-section-label">Your three stages</div>' +
      '<p class="vh-guess__line">' + slotRecapLine(rec) + '</p>' +
      '<p class="vh-guess__line"><b>' + pointsBreakdownLine(rec) + '</b></p>';

    els.revealBody.innerHTML =
      'Fused from <b>' + playerKey(TARGET.a) + '</b> (' + traitList([0, 1, 2, 3, 4, 5, 6]).join(', ') + ') and <b>' +
      playerKey(TARGET.b) + '</b> (' + traitList([7, 8, 9, 10, 11, 12, 13]).join(', ') + '). ' +
      'These two donors share just ' + Math.round(abSim * 100) + '% overlap — a deliberate contrast pairing.' +
      recapHtml +
      '<div class="vh-section-label">Closest real matches to the blend</div>' +
      '<ol class="vh-guesslist">' + nearestRows + '</ol>' +
      '<div class="vh-reveal__okf">OKF dossiers: ' +
      '<a href="#" class="vh-dossier-link" data-slug="' + playerSlug(TARGET.a.name) + '" data-name="' +
        TARGET.a.name + '">' + TARGET.a.name + '</a> · ' +
      '<a href="#" class="vh-dossier-link" data-slug="' + playerSlug(TARGET.b.name) + '" data-name="' +
        TARGET.b.name + '">' + TARGET.b.name + '</a></div>';
    els.shareCopied.hidden = true;
    appendArchetypePrevalenceLine(TARGET.clusterIdx);
  }

  // Stats/Style always resolve by the time the round is done (they're
  // one-shot gates ahead of the Mashup), so their recap is always a real
  // alignment % + multiplier, never "no attempts." The Mashup keeps the old
  // bestSim/attempts bookkeeping for its own honest "best guess reached X%"
  // when it's the one that went unsolved.
  function slotRecapLine(rec) {
    return SLOT_KEYS.map(function (key) {
      var slot = rec.slots[key];
      if (key === 'mashup') {
        if (slot.locked) {
          return '<b>Mashup</b>: ' + escapeHtml(slot.name) + (slot.silver ? ' (92%+ match)' : ' (perfect match)');
        }
        var truePlayer = slotTruePlayer('mashup');
        var trueLabel = truePlayer ? playerKey(truePlayer) : '?';
        var attemptText = slot.attempts ? ('best guess reached ' + Math.round(slot.bestSim * 100) + '%') : 'no attempts';
        return '<b>Mashup</b>: ' + escapeHtml(trueLabel) + ' — ' + attemptText;
      }
      if (!slot.locked) return '<b>' + slotLabel(key) + '</b>: not attempted';
      return '<b>' + slotLabel(key) + '</b>: ' + escapeHtml(slot.name) + ' — ' +
        Math.round(slot.sim * 100) + '% (' + (slot.silver ? '×' : 'exact, ×') + fmtMult(slot.mult) + ')';
    }).join(' &middot; ');
  }

  function showDuplicateWarning(p) {
    els.duplicateWarning.textContent = 'Already guessed ' + playerKey(p) + ' for this slot — try a different player-season.';
    els.duplicateWarning.hidden = false;
  }

  function hideDuplicateWarning() {
    els.duplicateWarning.hidden = true;
    els.duplicateWarning.textContent = '';
  }

  var pendingSelections = { stats: null, archetype: null, mashup: null };
  // Ephemeral (not persisted) — drives the brief map highlight when a slot
  // locks; a page reload simply loses the in-flight animation, which is fine.
  var lastLockEvent = null;

  // Stats/Style: ONE guess, Daily only — always resolves the instant it's
  // submitted, right or wrong, earning a multiplier off the alignment %
  // (halfSims, the exact math the clue card's own evidence is built from).
  // No duplicate-guess guard needed (there's only ever one guess per stage).
  function submitStageGuess(key) {
    var p = pendingSelections[key];
    if (!p) return;
    if (activeChimeraMode === 'practice') return; // Free Play skips Stats/Style entirely
    var rec = todayRecord();
    if (rec.done) return;
    if (key === 'stats' && rec.s1) return;
    if (key === 'archetype' && (!rec.s1 || rec.s2)) return;

    var truePlayer = key === 'stats' ? TARGET.a : TARGET.b;
    var halves = halfSims(p.v);
    var sim = key === 'stats' ? halves.stats : halves.shooting;
    var exact = (p.id === truePlayer.id);
    var mult = stageMultiplier(sim, exact);
    var result = { guess: { id: p.id, name: playerKey(p) }, sim: sim, mult: mult, exact: exact };

    if (key === 'stats') { rec.s1 = result; rec.stage = 2; }
    else { rec.s2 = result; rec.stage = 3; }

    var slotState = rec.slots[key];
    slotState.locked = true;
    slotState.silver = !exact;
    slotState.name = playerKey(truePlayer);
    slotState.id = truePlayer.id;
    slotState.sim = sim;
    slotState.mult = mult;
    slotState.attempts = 1;
    slotState.bestSim = sim;
    lastLockEvent = { slot: key, at: Date.now() };

    track('vh-guess', { turn: 1, slot: key, mode: 'daily', stage: key === 'stats' ? 1 : 2 });

    pendingSelections[key] = null;
    var inputEl = key === 'stats' ? els.chimeraStatsInput : els.chimeraArchetypeInput;
    var submitEl = key === 'stats' ? els.chimeraStatsSubmit : els.chimeraArchetypeSubmit;
    if (inputEl) inputEl.value = '';
    if (submitEl) submitEl.disabled = true;

    saveState();
    renderGuesses();
    renderMapOnce();
  }

  // Mashup: up to MAX_MASHUP_GUESSES tries, same lock semantics as v3/v4
  // (exact true-nearest match = gold; >=92% full-blend cosine = silver).
  function submitMashupGuess() {
    var p = pendingSelections.mashup;
    if (!p) return;
    var rec = todayRecord();
    var isPractice = activeChimeraMode === 'practice';
    if (rec.done) return;
    if (!isPractice && !rec.s2) return; // Style must resolve first
    if (rec.slots.mashup.locked) return;
    if (!isPractice && rec.mashupGuesses.length >= MAX_MASHUP_GUESSES) return;

    var isDuplicate = rec.mashupGuesses.some(function (g) { return g.id === p.id; });
    if (isDuplicate) {
      showDuplicateWarning(p);
      return;
    }
    hideDuplicateWarning();

    var halves = halfSims(p.v);
    var blendSim = cosineSim(TARGET.vector, p.v);
    var entry = {
      id: p.id, name: playerKey(p), slot: 'mashup',
      halves: halves, blendSim: blendSim,
      locked: false, silver: false, wrongSeasonNote: null, sim: blendSim
    };
    var perfect = isPerfectMatchGuess(p);
    entry.locked = perfect || blendSim >= WIN_SIMILARITY;
    entry.silver = entry.locked && !perfect;
    entry.wrongSeasonNote = entry.locked ? null : nearestWrongSeasonNote(p);

    var slotState = rec.slots.mashup;
    slotState.attempts += 1;
    if (entry.sim > slotState.bestSim) slotState.bestSim = entry.sim;
    if (entry.locked) {
      slotState.locked = true;
      slotState.silver = !!entry.silver;
      slotState.name = entry.name;
      slotState.id = entry.id;
      lastLockEvent = { slot: 'mashup', at: Date.now() };
    }

    rec.mashupGuesses.push(entry);
    track('vh-guess', { turn: rec.mashupGuesses.length, slot: 'mashup', mode: isPractice ? 'free' : 'daily', stage: 3 });

    var won = isRoundWon(rec);
    if (won || (!isPractice && rec.mashupGuesses.length >= MAX_MASHUP_GUESSES)) {
      registerCompletion(won);
    } else if (!isPractice) {
      saveState();
    }

    pendingSelections.mashup = null;
    els.chimeraInput.value = '';
    els.chimeraSubmit.disabled = true;

    renderGuesses();
    renderMapOnce();
  }

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

  // Short label for map/legend glyphs — last token of the full name (works
  // for the vast majority of NBA names; a reasonable truncation, not a
  // fabricated abbreviation).
  function shortName(fullName) {
    var parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1];
  }

  // Stats Donor = solid orange square; Shooting Donor = hollow orange square
  // (same hue family as the Chimera diamond — donors + blend are all
  // "target-side" entities in the orange/blue doctrine; guesses stay blue).
  function drawSquareMarker(ctx, size, xyz, opts) {
    opts = opts || {};
    var pr = project3D(xyz.x, xyz.y, xyz.z, size, mapCam);
    var r = Math.max(6, 8 * pr.scale);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ORANGE_HEX;
    ctx.beginPath();
    ctx.rect(pr.sx - r, pr.sy - r, r * 2, r * 2);
    if (opts.filled) {
      ctx.fillStyle = ORANGE_HEX;
      ctx.fill();
    }
    ctx.stroke();
    if (opts.label) {
      ctx.font = '700 10px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = ORANGE_HEX;
      ctx.fillText(opts.label, pr.sx, pr.sy - r - 6);
    }
    ctx.restore();
    return pr;
  }

  // Triangulation guide line: latest guess only (older pins stay put, but
  // only the newest one draws lines — avoids spaghetti). The % label is
  // never recomputed here — callers pass the exact same cosine already
  // shown in the Triangulation card / guess feedback (one source of truth).
  function drawGuideLine(ctx, size, fromXYZ, toXYZ, label) {
    var p0 = project3D(fromXYZ.x, fromXYZ.y, fromXYZ.z, size, mapCam);
    var p1 = project3D(toXYZ.x, toXYZ.y, toXYZ.z, size, mapCam);
    ctx.save();
    ctx.strokeStyle = 'rgba(250,250,248,0.55)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.stroke();
    ctx.restore();
    if (!label) return;
    var mx = (p0.sx + p1.sx) / 2, my = (p0.sy + p1.sy) / 2;
    ctx.save();
    ctx.font = '700 10px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(19,19,18,0.85)';
    ctx.fillRect(mx - 16, my - 7, 32, 14); // backing plate so text reads over the starfield
    ctx.fillStyle = ORANGE_HEX;
    ctx.fillText(label, mx, my + 1);
    ctx.restore();
  }

  // Progressive triangulation's signature beat: a brief expanding/fading
  // ring on the anchor that JUST resolved (module-level lastLockEvent, set
  // in submitStageGuess/submitMashupGuess). tNorm is 0 (just locked) -> 1
  // (highlight window over).
  function drawLockHighlight(ctx, size, xyz, tNorm) {
    var pr = project3D(xyz.x, xyz.y, xyz.z, size, mapCam);
    var r = Math.max(7, 10 * pr.scale) + tNorm * 18;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - tNorm);
    ctx.strokeStyle = '#fafaf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // The actual drawing routine, parameterized by ctx/size so both the
  // interactive map (els.map) and the small static result-card thumbnail
  // (els.mapThumb) render the identical scene — one source of truth for
  // what's on screen, just at two sizes.
  function drawMapScene(ctx, size) {
    ctx.clearRect(0, 0, size, size);
    drawAxisCube(ctx, size);

    var players = DATA.players;
    var projected = new Array(players.length);
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      projected[i] = project3D(p.x, p.y, p.z, size, mapCam);
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
    var isPractice = activeChimeraMode === 'practice';

    // PROGRESSIVE TRIANGULATION: donor anchors stay hidden in Daily until
    // their own slot locks — the Chimera diamond is always visible (it's
    // the thing every slot is triangulating toward). Free Play already
    // knows both donors (the player picked them), so they show immediately
    // there, same as before v4.
    //   Stats Donor / Style Donor: their OWN exact PCA(3) coordinates
    //     already carried on the player record (p.x/p.y/p.z in vectors.json)
    //     — no re-derivation, straight from source data.
    //   The Chimera (mashup): the 14-dim TARGET.vector run through the
    //     dataset's embedded affine PCA projection (DATA.proj.W/b — see
    //     projectVector), falling back to the home-cluster centroid position
    //     on older dataset builds that don't carry proj.
    var statsDonorXYZ = { x: TARGET.a.x, y: TARGET.a.y, z: TARGET.a.z };
    var archDonorXYZ = { x: TARGET.b.x, y: TARGET.b.y, z: TARGET.b.z };
    var chimeraXYZ = projectVector(TARGET.vector) || CLUSTER_XYZ[TARGET.clusterIdx];
    var showStats = isPractice || rec.slots.stats.locked;
    var showArch = isPractice || rec.slots.archetype.locked;

    drawTargetMarker(ctx, size, chimeraXYZ, 'CHIMERA');
    if (showStats) drawSquareMarker(ctx, size, statsDonorXYZ, { filled: true, label: 'STATS · ' + shortName(TARGET.a.name) });
    if (showArch) drawSquareMarker(ctx, size, archDonorXYZ, { filled: false, label: 'STYLE · ' + shortName(TARGET.b.name) });

    // Brief highlight pulse on whichever anchor just locked (~1.6s window).
    if (!isPractice && lastLockEvent) {
      var elapsed = Date.now() - lastLockEvent.at;
      if (elapsed < 1600) {
        var hlXYZ = lastLockEvent.slot === 'stats' ? statsDonorXYZ
          : (lastLockEvent.slot === 'archetype' ? archDonorXYZ : chimeraXYZ);
        drawLockHighlight(ctx, size, hlXYZ, elapsed / 1600);
      }
    }

    // numbered guess pins, always on top; the LATEST guess also gets
    // triangulation lines to whichever anchors are currently visible (older
    // pins stay, but only the newest carries lines — avoids spaghetti).
    // Unified list: Stats/Style each contribute one synthetic pin (in the
    // order they resolved), then every Mashup guess — correct chronological
    // numbering regardless of which stage the round is currently in.
    var allGuesses = unifiedGuessList(rec);
    var lastGuessIdx = allGuesses.length - 1;
    allGuesses.forEach(function (entry, gi) {
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

      if (gi === lastGuessIdx && entry.halves) {
        var guessXYZ = { x: pl.x, y: pl.y, z: pl.z };
        if (showStats) drawGuideLine(ctx, size, guessXYZ, statsDonorXYZ, Math.round(entry.halves.stats * 100) + '%');
        if (showArch) drawGuideLine(ctx, size, guessXYZ, archDonorXYZ, Math.round(entry.halves.shooting * 100) + '%');
        drawGuideLine(ctx, size, guessXYZ, chimeraXYZ, Math.round(entry.blendSim * 100) + '%');
      }
    });
  }

  function renderMap() {
    if (!DATA) return;
    var r = resizeSquareCanvas(els.map);
    drawMapScene(r.ctx, r.size);
  }

  // Mobile-only static snapshot (~120px, non-interactive — tap opens the
  // sheet): same drawMapScene() as the full map, so triangulation is visible
  // without opening it. Desktop pins the real map open already, so no
  // thumbnail is needed there.
  function renderMapThumbnail() {
    if (!els.mapThumb || !els.mapThumbBtn || !DATA) return;
    if (isDesktopWide()) { els.mapThumbBtn.hidden = true; return; }
    var rec = todayRecord();
    if (!rec || unifiedGuessList(rec).length === 0) { els.mapThumbBtn.hidden = true; return; }
    els.mapThumbBtn.hidden = false;
    var r = resizeSquareCanvas(els.mapThumb);
    drawMapScene(r.ctx, r.size);
  }

  var POS_LABEL = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };

  function anchorLegendRow(iconClass, label, locked, name) {
    if (locked) {
      return '<span><span class="vh-tri-icon ' + iconClass + '" aria-hidden="true"></span>' +
        label + ': ' + escapeHtml(name) + '</span>';
    }
    return '<span class="vh-legend-pending"><span class="vh-tri-icon ' + iconClass + '" aria-hidden="true"></span>' +
      label + ' — hidden until identified</span>';
  }

  function renderMapLegend() {
    if (!DATA || !TARGET) return;
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
    var isPractice = activeChimeraMode === 'practice';
    var rec = todayRecord();
    var statsLocked = isPractice || rec.slots.stats.locked;
    var archLocked = isPractice || rec.slots.archetype.locked;
    var anchorHtml =
      anchorLegendRow('vh-tri-icon--stats', 'Stats donor', statsLocked, TARGET.a.name) +
      anchorLegendRow('vh-tri-icon--shooting', 'Style donor', archLocked, TARGET.b.name) +
      '<span><span class="vh-tri-icon vh-tri-icon--blend" aria-hidden="true"></span>The Chimera (mashup)</span>';
    els.mapLegend.innerHTML = anchorHtml + entries.map(function (e) {
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
      renderMapThumbnail(); // desktop/mobile crossover changes whether it should show at all
    });

    if (els.mapThumbBtn) {
      els.mapThumbBtn.addEventListener('click', function () { openMapSheet(els.mapThumbBtn); });
    }

    setupMapVisibilityObserver();
  }

  // ---------------------------------------------------------------------
  // Share button
  // ---------------------------------------------------------------------

  function setupShare() {
    els.shareBtn.addEventListener('click', function () {
      var rec = todayRecord();
      var text = buildShareText(rec);
      var spec = {
        mode: 'ch',
        challenger: challengerName()
      };
      if (activeChimeraMode === 'practice') {
        spec.donorA = TARGET.a.id;
        spec.donorB = TARGET.b.id;
        spec.scoreLabel = rec.won
          ? ('solved in ' + rec.mashupGuesses.length)
          : (rec.mashupGuesses.length + ' guesses');
        if (rec.won) spec.score = String(rec.mashupGuesses.length);
      } else {
        spec.date = chimeraActiveDate();
        var solvedIdx = mashupSolvedGuessIndex(rec);
        spec.scoreLabel = rec.points + ' pts' + (solvedIdx ? (' (mashup in ' + solvedIdx + ')') : ' (mashup unsolved)');
        spec.score = String(rec.points);
      }
      shareChallengeResult(
        text,
        spec,
        els.shareCopied,
        activeChimeraMode === 'practice' ? 'free-challenge' : 'daily-challenge'
      );
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
    var rng = seededRng('vector-hoops:deadline-daily:' + playDate());
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
      var run = deadlineRuns.daily;
      var text = buildDeadlineShareText();
      shareChallengeResult(text, {
        mode: 'dl',
        date: playDate(),
        score: run.score + '/' + DEADLINE_ROUNDS_PER_RUN,
        scoreLabel: run.score + '/' + DEADLINE_ROUNDS_PER_RUN,
        challenger: challengerName()
      }, els.deadlineShareCopied, 'deadline-daily-challenge');
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
    var rng = seededRng('vector-hoops:ff-daily:' + playDate());
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
      var run = faderRuns.daily;
      var text = buildFaderShareText();
      shareChallengeResult(text, {
        mode: 'ff',
        date: playDate(),
        score: run.score + '/' + FF_ROUNDS_PER_RUN,
        scoreLabel: run.score + '/' + FF_ROUNDS_PER_RUN,
        challenger: challengerName()
      }, els.faderShareCopied, 'ff-daily-challenge');
    });
  }

  var faderInitialized = false;

  // ---------------------------------------------------------------------
  // CHEMISTRY: 4-option quiz on assets/chemistry.json's top-800 measured
  // teammate pairs (same team-season, both >=1000 min, complementarity =
  // 1-|cosine| of era-z profiles). Structurally the same 5-round Daily Set /
  // Free Play shape as The Deadline and Fader or Finisher, with a 4-way pick
  // instead of a binary call. Daily-set scores post to the public leaderboard.
  //
  // Distractor rule (chemistry.json carries no team field, only name+season+
  // team-on-the-pair-itself, so an exact "different team" filter isn't
  // computable from vectors.json alone — stated honestly in the methods
  // modal): distractors are seeded, same-season player-seasons that are
  // NEITHER the anchor nor the true partner NOR any other player who is
  // that anchor's partner elsewhere in the top-800 list for that season
  // (so a distractor is never secretly "also correct"), preferring the same
  // position as the true partner, then the same broad position group
  // (guard/forward/center), then anyone left in the season pool.
  // ---------------------------------------------------------------------

  var CHEMISTRY = null;   // parsed chemistry.json
  var CHEM_POOL = null;   // chemistry.json's pairs array (top 800)
  var activeChemMode = 'daily'; // 'daily' | 'free'
  var chemRuns = { daily: null, free: null }; // { rounds, idx, score }
  var CHEM_STATE = null;           // persisted Daily Set streak/history — LS_KEY_CHEM_DAILY
  var CHEM_PRACTICE_STATS = null;  // persisted Free Play casual stats — LS_KEY_CHEM_PRACTICE

  // Broad position group per DATA.positions index (['PG','SG','SF','PF','C']) —
  // used to relax the distractor search from "same position" to "same group"
  // when there aren't enough same-position candidates left in a season.
  var POSITION_GROUP = ['G', 'G', 'F', 'F', 'C'];

  function ordinalSuffix(n) {
    var mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return n + 'th';
    switch (n % 10) {
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }

  // Built once from DATA.players after load (vectors.json carries no team
  // field — only these two indices are derivable: by season, and by exact
  // name+season for resolving chemistry.json's pair entries).
  function buildPlayerLookups() {
    var bySeason = {};
    var byNameSeason = {};
    for (var i = 0; i < DATA.players.length; i++) {
      var p = DATA.players[i];
      (bySeason[p.season] = bySeason[p.season] || []).push(p);
      byNameSeason[p.name + '|' + p.season] = p;
    }
    PLAYERS_BY_SEASON = bySeason;
    PLAYERS_BY_NAME_SEASON = byNameSeason;
  }

  function resolveChemPlayer(name, season) {
    return PLAYERS_BY_NAME_SEASON[name + '|' + season] || null;
  }

  function loadChemCounter() {
    var n = 0;
    try {
      var raw = localStorage.getItem(LS_KEY_CHEM_COUNTER);
      n = raw ? (parseInt(raw, 10) || 0) : 0;
    } catch (e) { n = 0; }
    return n;
  }

  function saveChemCounter(n) {
    try { localStorage.setItem(LS_KEY_CHEM_COUNTER, String(n)); } catch (e) { /* storage unavailable */ }
  }

  function loadChemDailyState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_CHEM_DAILY); } catch (e) { raw = null; }
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

  function saveChemDailyState() {
    try { localStorage.setItem(LS_KEY_CHEM_DAILY, JSON.stringify(CHEM_STATE)); } catch (e) { /* storage unavailable */ }
  }

  function chemDailyToday() {
    return CHEM_STATE.days[TODAY];
  }

  function computeChemDailyStats() {
    return {
      streak: CHEM_STATE.streak,
      totalSets: CHEM_STATE.totalSets,
      avgScore: CHEM_STATE.totalSets ? (CHEM_STATE.totalScoreSum / CHEM_STATE.totalSets) : 0
    };
  }

  function loadChemPracticeStats() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_CHEM_PRACTICE); } catch (e) { raw = null; }
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

  function saveChemPracticeStats() {
    try { localStorage.setItem(LS_KEY_CHEM_PRACTICE, JSON.stringify(CHEM_PRACTICE_STATS)); } catch (e) { /* storage unavailable */ }
  }

  // Every other top-800 partner of `anchorName` in `season`, resolved to
  // player objects — a distractor must never be one of these, or picking it
  // would secretly also be "correct" (a real measured high-chemistry pair).
  function chemAnchorPartnerIds(anchorName, season, excludeIds) {
    for (var i = 0; i < CHEM_POOL.length; i++) {
      var entry = CHEM_POOL[i];
      if (entry.season !== season) continue;
      var otherName = null;
      if (entry.a === anchorName) otherName = entry.b;
      else if (entry.b === anchorName) otherName = entry.a;
      if (!otherName) continue;
      var other = resolveChemPlayer(otherName, season);
      if (other) excludeIds[other.id] = true;
    }
  }

  function pickChemDistractors(rng, pairEntry, aPlayer, bPlayer) {
    var excludeIds = {};
    excludeIds[aPlayer.id] = true;
    excludeIds[bPlayer.id] = true;
    chemAnchorPartnerIds(pairEntry.a, pairEntry.season, excludeIds);

    var seasonPool = PLAYERS_BY_SEASON[pairEntry.season] || [];
    var candidates = seasonPool.filter(function (p) { return !excludeIds[p.id]; });

    var bPos = bPlayer.p;
    var bGroup = (typeof bPos === 'number' && bPos >= 0) ? POSITION_GROUP[bPos] : null;
    var tier1 = [], tier2 = [], tier3 = [];
    candidates.forEach(function (p) {
      if (typeof p.p === 'number' && p.p >= 0 && p.p === bPos) tier1.push(p);
      else if (bGroup && typeof p.p === 'number' && p.p >= 0 && POSITION_GROUP[p.p] === bGroup) tier2.push(p);
      else tier3.push(p);
    });

    var ordered = seededShuffle(rng, tier1).concat(seededShuffle(rng, tier2), seededShuffle(rng, tier3));
    return ordered.slice(0, 3);
  }

  function buildChemRound(rng) {
    var idx = Math.floor(rng() * CHEM_POOL.length);
    var pairEntry = CHEM_POOL[idx];
    var aPlayer = resolveChemPlayer(pairEntry.a, pairEntry.season);
    var bPlayer = resolveChemPlayer(pairEntry.b, pairEntry.season);
    var distractors = pickChemDistractors(rng, pairEntry, aPlayer, bPlayer);
    var options = seededShuffle(rng, [bPlayer].concat(distractors));
    return { pairEntry: pairEntry, aPlayer: aPlayer, bPlayer: bPlayer, options: options, answered: false, correct: null };
  }

  function buildChemDailyRounds() {
    var rng = seededRng('vector-hoops:chem-daily:' + playDate());
    var rounds = [];
    for (var i = 0; i < CHEM_ROUNDS_PER_RUN; i++) rounds.push(buildChemRound(rng));
    return rounds;
  }

  function buildChemFreeRounds() {
    var counter = loadChemCounter();
    var rounds = [];
    for (var i = 0; i < CHEM_ROUNDS_PER_RUN; i++) {
      rounds.push(buildChemRound(seededRng('vector-hoops:chem:' + counter)));
      counter++;
    }
    saveChemCounter(counter);
    return rounds;
  }

  function activeChemRun() {
    return chemRuns[activeChemMode];
  }

  function startChemRun(mode) {
    activeChemMode = mode;
    if (mode === 'daily') {
      chemRuns.daily = { rounds: buildChemDailyRounds(), idx: 0, score: 0 };
    } else {
      chemRuns.free = { rounds: buildChemFreeRounds(), idx: 0, score: 0 };
    }
    els.chemFinal.hidden = true;
    renderChemRound();
  }

  function renderChemHeader() {
    var isDaily = activeChemMode === 'daily';
    els.chemEyebrow.textContent = isDaily
      ? 'Best Teammate — Daily Set #' + puzzleNumber(TODAY)
      : 'Best Teammate — Free Play (practice)';
    els.chemStreakWrap.hidden = !isDaily;
    if (isDaily) els.chemStreakNum.textContent = String(CHEM_STATE.streak);
    els.chemPracticeBanner.hidden = isDaily;
  }

  function renderChemRound() {
    var run = activeChemRun();
    var round = run.rounds[run.idx];
    els.chemRoundNum.textContent = String(run.idx + 1);
    els.chemScoreNum.textContent = String(run.score);
    els.chemPrompt.textContent = 'Who complemented ' + round.aPlayer.name + ' best on the ' +
      round.pairEntry.season + ' ' + round.pairEntry.team + '?';
    els.chemReveal.hidden = true;
    els.chemOptions.innerHTML = '';
    round.options.forEach(function (p, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vh-chem-option';
      btn.textContent = playerKey(p);
      btn.addEventListener('click', function () { answerChemRound(i); });
      els.chemOptions.appendChild(btn);
    });
    renderChemHeader();
    track('vh-chem-round', { round: run.idx + 1, mode: activeChemMode });
  }

  // The two biggest-gap dimensions (A strongest relative to B, and vice
  // versa) drive the one-line "why" — straight from the same 14-dim z
  // vectors the complementarity score itself is computed from.
  function chemWhyLine(aPlayer, bPlayer) {
    var av = aPlayer.v, bv = bPlayer.v;
    var diffs = [];
    for (var i = 0; i < av.length; i++) diffs.push({ i: i, d: av[i] - bv[i] });
    var byAStrong = diffs.slice().sort(function (x, y) { return y.d - x.d; });
    var byBStrong = diffs.slice().sort(function (x, y) { return x.d - y.d; });
    var topADim = byAStrong[0].i;
    var topBDim = byBStrong[0].i === topADim && byBStrong.length > 1 ? byBStrong[1].i : byBStrong[0].i;
    var aLabel = DATA.featureLabels[DATA.features[topADim]];
    var bLabel = DATA.featureLabels[DATA.features[topBDim]];
    return 'Orthogonal profiles: ' + aPlayer.name + '’s ' + aLabel + ' next to ' +
      bPlayer.name + '’s ' + bLabel + '.';
  }

  function chemNumbersLine(pairEntry) {
    var pctile = Math.round(pairEntry.chemistry * 100);
    var comp = Math.round(pairEntry.complementarity * 100);
    var jp = (pairEntry.jointPM >= 0 ? '+' : '') + pairEntry.jointPM.toFixed(1);
    return 'Complementarity ' + comp + '% · joint plus-minus ' + jp + '/game · chemistry ' +
      ordinalSuffix(pctile) + ' percentile of the top-800 measured pairs.';
  }

  function answerChemRound(optionIdx) {
    var run = activeChemRun();
    var round = run.rounds[run.idx];
    if (round.answered) return;
    round.answered = true;
    var picked = round.options[optionIdx];
    var correct = picked.id === round.bPlayer.id;
    round.correct = correct;
    if (correct) run.score++;

    Array.prototype.forEach.call(els.chemOptions.children, function (btn, i) {
      btn.disabled = true;
      if (round.options[i].id === round.bPlayer.id) btn.classList.add('is-correct');
      else if (i === optionIdx) btn.classList.add('is-wrong');
    });

    els.chemReveal.hidden = false;
    els.chemVerdict.innerHTML = '';
    els.chemVerdict.appendChild(document.createTextNode(correct ? 'Correct — ' : 'Missed it — '));
    var nameSpan = document.createElement('span');
    els.chemVerdict.appendChild(nameSpan);
    els.chemVerdict.appendChild(document.createTextNode(' complemented ' + round.aPlayer.name +
      ' best on the ' + round.pairEntry.season + ' ' + round.pairEntry.team + '.'));
    tryLinkMoverName(nameSpan, round.bPlayer.name);
    els.chemNumbers.textContent = chemNumbersLine(round.pairEntry);
    els.chemWhy.textContent = chemWhyLine(round.aPlayer, round.bPlayer);

    els.chemScoreNum.textContent = String(run.score);
    els.chemNextBtn.textContent = (run.idx + 1 >= CHEM_ROUNDS_PER_RUN) ? 'See results' : 'Next round';
  }

  function buildChemShareText() {
    var run = chemRuns.daily;
    var rows = run.rounds.map(function (r) { return r.correct ? '✅' : '❌'; }).join('');
    return 'Vector Hoops — Best Teammate #' + puzzleNumber(TODAY) + ' ' + run.score + '/' + CHEM_ROUNDS_PER_RUN +
      '\n' + rows;
  }

  function showChemFinal() {
    var run = activeChemRun();
    els.chemFinal.hidden = false;
    els.chemReveal.hidden = true;
    els.chemFinalScore.textContent = 'You scored ' + run.score + '/' + CHEM_ROUNDS_PER_RUN + '.';

    if (activeChemMode === 'daily') {
      var rec = chemDailyToday();
      if (!rec.done) {
        rec.done = true;
        rec.score = run.score;
        var yesterday = utcDateString(new Date(Date.now() - 86400000));
        CHEM_STATE.streak = (CHEM_STATE.lastPlayDate === yesterday) ? CHEM_STATE.streak + 1 : 1;
        CHEM_STATE.lastPlayDate = TODAY;
        CHEM_STATE.totalSets++;
        CHEM_STATE.totalScoreSum += run.score;
        saveChemDailyState();
        track('vh-chem-done', { score: run.score, mode: 'daily' });
      }
      els.chemAgainBtn.hidden = true;
      els.chemShareBtn.hidden = false;
      els.chemComeback.hidden = false;
      els.chemShareCopied.hidden = true;
    } else {
      CHEM_PRACTICE_STATS.played++;
      CHEM_PRACTICE_STATS.totalScoreSum += run.score;
      saveChemPracticeStats();
      els.chemAgainBtn.hidden = false;
      els.chemShareBtn.hidden = true;
      els.chemComeback.hidden = true;
      track('vh-chem-done', { score: run.score, mode: 'free' });
    }
    renderChemHeader();
  }

  function nextChemRound() {
    var run = activeChemRun();
    var round = run.rounds[run.idx];
    if (!round.answered) return;
    run.idx++;
    if (run.idx >= CHEM_ROUNDS_PER_RUN) {
      showChemFinal();
    } else {
      renderChemRound();
    }
  }

  function switchChemMode(mode) {
    activeChemMode = mode;
    els.chemSubDaily.classList.toggle('is-active', mode === 'daily');
    els.chemSubFree.classList.toggle('is-active', mode === 'free');
    els.chemSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.chemSubFree.setAttribute('aria-selected', String(mode === 'free'));

    if (mode === 'daily' && chemDailyToday().done && !chemRuns.daily) {
      var doneRec = chemDailyToday();
      chemRuns.daily = { rounds: [], idx: CHEM_ROUNDS_PER_RUN, score: doneRec.score || 0 };
    }

    var run = chemRuns[mode];
    if (!run) {
      startChemRun(mode);
    } else if (run.idx >= CHEM_ROUNDS_PER_RUN) {
      showChemFinal();
    } else {
      els.chemFinal.hidden = true;
      renderChemRound();
    }
    renderChemHeader();
  }

  function setupChem() {
    els.chemNextBtn.addEventListener('click', nextChemRound);
    els.chemAgainBtn.addEventListener('click', function () { startChemRun('free'); });
    els.chemSubDaily.addEventListener('click', function () { switchChemMode('daily'); });
    els.chemSubFree.addEventListener('click', function () { switchChemMode('free'); });
    els.chemMethodBtn.addEventListener('click', function () { openMethods('chem', els.chemMethodBtn); });
    els.chemShareBtn.addEventListener('click', function () {
      var run = chemRuns.daily;
      var text = buildChemShareText();
      shareChallengeResult(text, {
        mode: 'cm',
        date: playDate(),
        score: run.score + '/' + CHEM_ROUNDS_PER_RUN,
        scoreLabel: run.score + '/' + CHEM_ROUNDS_PER_RUN,
        challenger: challengerName()
      }, els.chemShareCopied, 'chem-daily-challenge');
    });
  }

  var chemInitialized = false;

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
    return buildArcRoundFromRng(seededRng('vector-hoops:arc-daily:' + playDate()));
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
        shareChallengeResult(text, {
          mode: 'arc',
          date: playDate(),
          score: rec.score + '/' + ARC_CARD_COUNT,
          scoreLabel: rec.score + '/' + ARC_CARD_COUNT,
          challenger: challengerName()
        }, els.arcShareCopied, 'arc-daily-challenge');
      };
    }
  }

  // Where a revealed season's archetype changed from its immediate
  // predecessor in the TRUE chronological order (round.correct) — computed
  // against the real career order regardless of which slot the player
  // guessed it into. round.correct.length is always small (ARC_CARD_COUNT),
  // so a plain indexOf is fine; no Map needed to match this file's style.
  function arcTransitionFor(round, player) {
    var idx = round.correct.indexOf(player);
    if (idx <= 0) return null;
    if (round.correct[idx].c === round.correct[idx - 1].c) return null;
    return DATA.clusters[round.correct[idx].c];
  }

  function arcTransitionTagHtml(round, player) {
    var arch = arcTransitionFor(round, player);
    if (!arch) return '';
    return '<div class="vh-arc-reveal-row__transition">&#8631; became ' + escapeHtml(arch) + '</div>';
  }

  // Lazy-fetched, cached, fail-soft: assets/trajectories.json only loads
  // once the reveal sheet actually opens, and any fetch/parse failure just
  // leaves the sheet without this bonus line — everything else already works.
  var trajectoriesCache = null; // null = not yet tried; false = failed; object = loaded
  function loadTrajectories(cb) {
    if (trajectoriesCache) { cb(trajectoriesCache); return; }
    if (trajectoriesCache === false) return;
    fetch(TRAJECTORIES_URL).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      trajectoriesCache = data;
      cb(data);
    }).catch(function () {
      trajectoriesCache = false;
    });
  }

  // "A {class} career — {n} archetype changes." appended below the reveal
  // list when the round's player is in trajectories.json's playerIndex;
  // silently skipped otherwise.
  function appendArcTrajectoryLine(playerName) {
    if (!els.arcTrajectoryLine) return;
    els.arcTrajectoryLine.hidden = true;
    els.arcTrajectoryLine.textContent = '';
    loadTrajectories(function (data) {
      if (!data || !data.playerIndex) return;
      var entry = data.playerIndex[playerName];
      if (!entry) return;
      // Stale-guard: the fetch is async and the player may have closed/
      // reopened the sheet on a different round by the time this resolves.
      var round = activeArcRound();
      if (!round || round.name !== playerName) return;
      var plural = entry.changes === 1 ? '' : 's';
      els.arcTrajectoryLine.textContent = 'A ' + entry.class + ' career — ' +
        entry.changes + ' archetype change' + plural + '.';
      els.arcTrajectoryLine.hidden = false;
    });
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
          '<div class="vh-arc-reveal-row__top">' +
          '<span class="vh-arc-reveal-row__rank">' + (k + 1) + '</span>' +
          '<span class="vh-arc-reveal-row__season">' + escapeHtml(picked.season) + '</span>' +
          '<span class="vh-arc-reveal-row__mark">' + (isCorrect ? '✓ right slot' : '✗ actually ' + escapeHtml(correctPlayer.season)) + '</span>' +
          '</div>' +
          arcTransitionTagHtml(round, picked);
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
          '<div class="vh-arc-reveal-row__top">' +
          '<span class="vh-arc-reveal-row__rank">' + (k + 1) + '</span>' +
          '<span class="vh-arc-reveal-row__season">' + escapeHtml(p.season) + '</span>' +
          '</div>' +
          arcTransitionTagHtml(round, p);
        els.arcRevealList.appendChild(li);
      });
    }
    renderArcLineChart(els.arcLinechart, round.allSeasons);
    if (els.arcLinechartSrSummary) {
      els.arcLinechartSrSummary.textContent = round.name + ' scoring sigma by season: ' +
        round.allSeasons.map(function (p) { return p.season + ' ' + fmtSigma(p.v[IDX.PTS]); }).join(', ') + '.';
    }
    appendArcTrajectoryLine(round.name);
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

  // ---------------------------------------------------------------------
  // WHAT-IF LAB: pure sandbox, no daily puzzle, no streak. Pick any two
  // player-seasons and get a full partnership report — complementarity
  // (same 1-|cosine| formula chemistry.json uses), a dimensional coverage
  // map (reuses the Chimera reveal's breakdown chart, relabeled), redundancy/
  // shared-weakness warnings on the 14 dims, a combined court overlay
  // (reuses the court geometry/zone math, drawn for both players at once),
  // and the closest real measured pair from chemistry.json by complementarity.
  // ---------------------------------------------------------------------

  var whatifPick = { a: null, b: null };
  var whatifLastReport = null; // { a, b, complementarity, compPct, pctileAmongPool } for the share button

  // Usage/ball-in-hand dims where both players being strong is a redundancy
  // risk (a "who's the point guard" problem), not a strength.
  var BALL_DOMINANT_KEYS = ['FGA', 'FTA', 'AST'];
  var REDUNDANCY_PHRASE = {
    FGA: 'both need heavy shot volume to feel involved — a usage fight waiting to happen',
    FTA: 'both live at the free-throw line — one ball problem',
    AST: 'both want the ball in their hands to create'
  };
  // For every dim except TOV, the "weak" direction is a low z (below era
  // average); TOV flips — a high z there is the bad/weak direction.
  var WEAKNESS_HIGH_IS_BAD = { TOV: true };
  var WEAKNESS_PHRASE = {
    PTS: 'neither one scores much', AST: 'nobody creates for others',
    OREB: 'no one crashes the offensive glass', DREB: 'nobody boards',
    STL: 'no ball pressure from either', BLK: 'no rim protection from either',
    TOV: 'both are turnover-prone', FG3A: 'neither one shoots threes',
    FGA: 'neither one shoots much', FTA: 'neither one draws fouls',
    FG3_PCT: 'neither one shoots it well from three', FG_PCT: 'neither one finishes efficiently',
    FT_PCT: 'neither one is reliable at the line', PLUS_MINUS: 'neither one has moved the needle'
  };

  function computeWhatifCoverage(aPlayer, bPlayer) {
    var covered = 0;
    for (var i = 0; i < aPlayer.v.length; i++) {
      if (aPlayer.v[i] > 0 || bPlayer.v[i] > 0) covered++;
    }
    return covered;
  }

  function computeWhatifFlags(aPlayer, bPlayer) {
    var redundancy = [], weakness = [];
    DATA.features.forEach(function (key, i) {
      var za = aPlayer.v[i], zb = bPlayer.v[i];
      if (BALL_DOMINANT_KEYS.indexOf(key) !== -1 && za > 1.5 && zb > 1.5) {
        redundancy.push(REDUNDANCY_PHRASE[key]);
      }
      var bothWeak = WEAKNESS_HIGH_IS_BAD[key] ? (za > 1 && zb > 1) : (za < -1 && zb < -1);
      if (bothWeak) weakness.push(WEAKNESS_PHRASE[key]);
    });
    return { redundancy: redundancy, weakness: weakness };
  }

  function renderWhatifFlags(flags) {
    var html = '';
    flags.redundancy.forEach(function (msg) {
      html += '<p class="vh-whatif-flag vh-whatif-flag--redundancy">⚠ Redundancy: ' + escapeHtml(msg) + '</p>';
    });
    flags.weakness.forEach(function (msg) {
      html += '<p class="vh-whatif-flag vh-whatif-flag--weakness">⚠ Shared weakness: ' + escapeHtml(msg) + '</p>';
    });
    if (!flags.redundancy.length && !flags.weakness.length) {
      html = '<p class="vh-whatif-flag vh-whatif-flag--none">No redundancy or shared-weakness flags on this pair — coverage looks clean.</p>';
    }
    els.whatifFlags.innerHTML = html;
  }

  // Nearest analog + percentile both read chemistry.json's top-800 pairs,
  // shared with the Chemistry mode's own CHEM_POOL/CHEMISTRY (one fetch,
  // two features). Percentile is explicitly "of the 800 known pairs" (an
  // elite, chemistry-selected subsample, not a claim about the whole league)
  // — stated in the What-If Lab methods text, not just implied.
  function findNearestChemAnalog(complementarity) {
    if (!CHEM_POOL || !CHEM_POOL.length) return null;
    var best = null, bestDiff = Infinity;
    for (var i = 0; i < CHEM_POOL.length; i++) {
      var diff = Math.abs(CHEM_POOL[i].complementarity - complementarity);
      if (diff < bestDiff) { bestDiff = diff; best = CHEM_POOL[i]; }
    }
    return best;
  }

  function chemPercentileAmongPool(complementarity) {
    if (!CHEM_POOL || !CHEM_POOL.length) return null;
    var below = 0;
    for (var i = 0; i < CHEM_POOL.length; i++) {
      if (CHEM_POOL[i].complementarity <= complementarity) below++;
    }
    return Math.round(below / CHEM_POOL.length * 100);
  }

  function buildWhatifReport() {
    var a = whatifPick.a, b = whatifPick.b;
    var complementarity = 1 - Math.abs(cosineSim(a.v, b.v));
    var compPct = Math.round(complementarity * 100);

    els.whatifReportEyebrow.textContent = 'Partnership report — ' + playerKey(a) + ' + ' + playerKey(b);
    els.whatifComplementarityLine.textContent =
      'Complementarity ' + compPct + '% — 1 − |cosine| of era-z profiles, the same measure chemistry.json uses. ' +
      'Higher means more orthogonal skill profiles; it is not a claim about on-court success.';

    var coverage = computeWhatifCoverage(a, b);
    els.whatifCoverageSummary.textContent = 'Together they cover ' + coverage + '/14 dimensions above era average.';
    renderBreakdown(els.whatifCoverageChart, a.v, b.v, a.name, b.name);
    if (els.whatifCoverageSrSummary) {
      els.whatifCoverageSrSummary.textContent = breakdownSummaryText(a.v, b.v, a.name, b.name);
    }
    if (els.whatifLegendA) els.whatifLegendA.textContent = playerKey(a);
    if (els.whatifLegendB) els.whatifLegendB.textContent = playerKey(b);

    renderWhatifFlags(computeWhatifFlags(a, b));

    var zones = renderCourtOverlay(els.whatifCourt, a.v, b.v);
    if (els.whatifCourtSrSummary) {
      els.whatifCourtSrSummary.textContent = zonesSummaryText(a.name, zones.a) + ' ' + zonesSummaryText(b.name, zones.b);
    }

    var analog = findNearestChemAnalog(complementarity);
    var pctileAmongPool = chemPercentileAmongPool(complementarity);
    if (analog) {
      els.whatifAnalogLine.textContent = 'Closest real-world analog by measured complementarity: ' +
        analog.a + ' + ' + analog.b + ' (' + analog.team + ' ' + analog.season + ', ' +
        Math.round(analog.complementarity * 100) + '% complementarity).';
    } else {
      els.whatifAnalogLine.textContent = 'Closest real-world analog: still loading the measured-pairs dataset.';
    }

    els.whatifReport.hidden = false;
    whatifLastReport = { a: a, b: b, complementarity: complementarity, compPct: compPct, pctileAmongPool: pctileAmongPool };
    track('vh-whatif-report', { aId: a.id, bId: b.id });
  }

  function showWhatifError(msg) {
    if (!els.whatifError) return;
    els.whatifError.textContent = msg;
    els.whatifError.hidden = false;
  }

  function hideWhatifError() {
    if (!els.whatifError) return;
    els.whatifError.hidden = true;
    els.whatifError.textContent = '';
  }

  function maybeBuildWhatifReport() {
    if (!whatifPick.a || !whatifPick.b) return;
    if (whatifPick.a.id === whatifPick.b.id) {
      showWhatifError('Pick two different player-seasons.');
      return;
    }
    hideWhatifError();
    buildWhatifReport();
  }

  function setWhatifPick(slot, player) {
    whatifPick[slot] = player;
    var badge = slot === 'a' ? els.whatifBadgeA : els.whatifBadgeB;
    if (badge) badge.hidden = false;
    maybeBuildWhatifReport();
  }

  function resetWhatifPicks() {
    whatifPick = { a: null, b: null };
    whatifLastReport = null;
    if (els.whatifBadgeA) els.whatifBadgeA.hidden = true;
    if (els.whatifBadgeB) els.whatifBadgeB.hidden = true;
    if (els.whatifAInput) els.whatifAInput.value = '';
    if (els.whatifBInput) els.whatifBInput.value = '';
    hideWhatifError();
    els.whatifReport.hidden = true;
  }

  // Any two distinct player-seasons — unlike Chimera's Randomize, the Lab
  // has no low-similarity constraint; a redundant/overlapping pair is a
  // valid (and informative) thing to sandbox.
  function randomizeWhatifPicks() {
    var rng = seededRng('vector-hoops:whatif:' + randomNonce());
    var players = DATA.players;
    var a, b;
    do {
      a = players[Math.floor(rng() * players.length)];
      b = players[Math.floor(rng() * players.length)];
    } while (a.id === b.id);
    if (els.whatifAInput) els.whatifAInput.value = playerKey(a);
    if (els.whatifBInput) els.whatifBInput.value = playerKey(b);
    setWhatifPick('a', a);
    setWhatifPick('b', b);
  }

  function buildWhatifShareText() {
    var r = whatifLastReport;
    if (!r) return '';
    var scoreText = (r.pctileAmongPool != null)
      ? ordinalSuffix(r.pctileAmongPool) + ' percentile of the top-800 measured pairs'
      : (r.compPct + '% complementarity');
    // Reuses the same deep-link URL builder the other daily modes use for
    // their challenge links (mode/donorA/donorB params are already generic)
    // so the link actually reopens this exact pairing in the Lab — no
    // "beat this score" framing since the Lab has no score to beat.
    var url = buildChallengeUrl({ mode: 'wi', donorA: r.a.id, donorB: r.b.id });
    return 'Vector Hoops What-If Lab — I paired ' + r.a.name + ' (' + r.a.season + ') + ' +
      r.b.name + ' (' + r.b.season + ') — complementarity ' + scoreText + '.\n' + url;
  }

  function setupWhatifInputs() {
    createAutocomplete(els.whatifAInput, els.whatifASuggestions, DATA.players, function (p) {
      setWhatifPick('a', p);
    }, { hintEl: els.whatifAFocusHint });
    createAutocomplete(els.whatifBInput, els.whatifBSuggestions, DATA.players, function (p) {
      setWhatifPick('b', p);
    }, { hintEl: els.whatifBFocusHint });
    els.whatifAInput.disabled = false;
    els.whatifBInput.disabled = false;
    els.whatifRandomizeBtn.disabled = false;
  }

  function setupWhatif() {
    setupWhatifInputs();
    els.whatifRandomizeBtn.addEventListener('click', randomizeWhatifPicks);
    els.whatifChangeBtn.addEventListener('click', resetWhatifPicks);
    els.whatifMethodBtn.addEventListener('click', function () { openMethods('whatif', els.whatifMethodBtn); });
    els.whatifShareBtn.addEventListener('click', function () {
      var text = buildWhatifShareText();
      if (!text) return;
      var shared = false;
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); shared = true; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          els.whatifShareCopied.hidden = false;
        }).catch(function () {
          if (!shared) els.whatifShareCopied.hidden = false;
        });
      } else if (!shared) {
        els.whatifShareCopied.hidden = false;
      }
      track('vh-share', { mode: 'whatif' });
    });
  }

  var whatifInitialized = false;

  // ---------------------------------------------------------------------
  // THE PIVOT: a real current-roster team-season + "who has the most
  // measured upside in an ADJACENT role" — every candidate's own path
  // carries the REAL historical mean PLUS_MINUS-z swing for players who
  // made that exact archetype-to-archetype pivot (assets/pivots.json's
  // `paths`, n>=8 shown), plus a name+seasons example ("the receipts").
  // Structurally the same 5-round Daily Set / Free Play shape as
  // Chemistry, but a ranked pick (2/1/0 pts against the full candidate
  // order) instead of a 4-way multiple choice. Daily-set scores post to the public leaderboard.
  // leaderboard's game enum doesn't include "pivot" yet, so results never
  // post — same doctrine as Chemistry/What-If Lab at launch.
  //
  // Ranking rule: sort a team-season's candidates by path.meanDPMz
  // descending, ties kept in the JSON's own order. This always reproduces
  // pivots.json's own `answer` field (independently re-derived here, not
  // trusted blind — verified against all 90 shipped team-seasons at
  // authoring time: zero mismatches).
  // ---------------------------------------------------------------------

  var PIVOTS = null;                  // parsed pivots.json
  var PIVOT_POOL = null;              // pivots.json's teams array (90 team-seasons)
  var PIVOT_ADJ_BY_ARCHETYPE = null;  // { archetype: [{archetype,similarity} x3] } from pivots.json's adjacency
  var activePivotMode = 'daily';      // 'daily' | 'free'
  var pivotRuns = { daily: null, free: null }; // { rounds, idx, score }
  var PIVOT_STATE = null;             // persisted Daily Set streak/history — LS_KEY_PIVOT_DAILY
  var PIVOT_PRACTICE_STATS = null;    // persisted Free Play casual stats — LS_KEY_PIVOT_PRACTICE

  function buildPivotAdjacencyIndex() {
    var idx = {};
    (PIVOTS.adjacency || []).forEach(function (entry) { idx[entry.archetype] = entry.adjacent; });
    PIVOT_ADJ_BY_ARCHETYPE = idx;
  }

  function loadPivotCounter() {
    var n = 0;
    try {
      var raw = localStorage.getItem(LS_KEY_PIVOT_COUNTER);
      n = raw ? (parseInt(raw, 10) || 0) : 0;
    } catch (e) { n = 0; }
    return n;
  }

  function savePivotCounter(n) {
    try { localStorage.setItem(LS_KEY_PIVOT_COUNTER, String(n)); } catch (e) { /* storage unavailable */ }
  }

  function loadPivotDailyState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_PIVOT_DAILY); } catch (e) { raw = null; }
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

  function savePivotDailyState() {
    try { localStorage.setItem(LS_KEY_PIVOT_DAILY, JSON.stringify(PIVOT_STATE)); } catch (e) { /* storage unavailable */ }
  }

  function pivotDailyToday() {
    return PIVOT_STATE.days[TODAY];
  }

  function computePivotDailyStats() {
    return {
      streak: PIVOT_STATE.streak,
      totalSets: PIVOT_STATE.totalSets,
      avgScore: PIVOT_STATE.totalSets ? (PIVOT_STATE.totalScoreSum / PIVOT_STATE.totalSets) : 0
    };
  }

  function loadPivotPracticeStats() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_PIVOT_PRACTICE); } catch (e) { raw = null; }
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

  function savePivotPracticeStats() {
    try { localStorage.setItem(LS_KEY_PIVOT_PRACTICE, JSON.stringify(PIVOT_PRACTICE_STATS)); } catch (e) { /* storage unavailable */ }
  }

  // { origIdx -> 0-based rank } for one team-season's candidates, sorted by
  // path.meanDPMz descending (ties keep the JSON's own order). Rank 0 is
  // "the answer" — the correct pick.
  function rankPivotCandidates(teamEntry) {
    var withIdx = teamEntry.candidates.map(function (c, i) { return { c: c, i: i }; });
    withIdx.sort(function (x, y) {
      var d = y.c.path.meanDPMz - x.c.path.meanDPMz;
      return d !== 0 ? d : (x.i - y.i);
    });
    var rankByIdx = {};
    withIdx.forEach(function (entry, rank) { rankByIdx[entry.i] = rank; });
    return rankByIdx;
  }

  function buildPivotRound(rng) {
    var idx = Math.floor(rng() * PIVOT_POOL.length);
    var teamEntry = PIVOT_POOL[idx];
    var rankByIdx = rankPivotCandidates(teamEntry);
    var displayOrder = seededShuffle(rng, teamEntry.candidates.map(function (_, i) { return i; }));
    return {
      teamEntry: teamEntry,
      rankByIdx: rankByIdx,
      displayOrder: displayOrder,
      answered: false,
      pickedIdx: null,
      points: 0
    };
  }

  function buildPivotDailyRounds() {
    var rng = seededRng('vector-hoops:pivot-daily:' + playDate());
    var rounds = [];
    for (var i = 0; i < PIVOT_ROUNDS_PER_RUN; i++) rounds.push(buildPivotRound(rng));
    return rounds;
  }

  function buildPivotFreeRounds() {
    var counter = loadPivotCounter();
    var rounds = [];
    for (var i = 0; i < PIVOT_ROUNDS_PER_RUN; i++) {
      rounds.push(buildPivotRound(seededRng('vector-hoops:pivot:' + counter)));
      counter++;
    }
    savePivotCounter(counter);
    return rounds;
  }

  function activePivotRun() {
    return pivotRuns[activePivotMode];
  }

  function startPivotRun(mode) {
    activePivotMode = mode;
    if (mode === 'daily') {
      pivotRuns.daily = { rounds: buildPivotDailyRounds(), idx: 0, score: 0 };
    } else {
      pivotRuns.free = { rounds: buildPivotFreeRounds(), idx: 0, score: 0 };
    }
    els.pivotFinal.hidden = true;
    renderPivotRound();
  }

  function renderPivotHeader() {
    var isDaily = activePivotMode === 'daily';
    els.pivotEyebrow.textContent = isDaily
      ? 'The Pivot — Daily Set #' + puzzleNumber(TODAY)
      : 'The Pivot — Free Play (practice)';
    els.pivotStreakWrap.hidden = !isDaily;
    if (isDaily) els.pivotStreakNum.textContent = String(PIVOT_STATE.streak);
    els.pivotPracticeBanner.hidden = isDaily;
  }

  function pivotArchetypeChipHtml(label) {
    return '<span class="vh-hint-chip vh-pivot-row__chip">' + escapeHtml(label) + '</span>';
  }

  function renderPivotRound() {
    var run = activePivotRun();
    var round = run.rounds[run.idx];
    var team = round.teamEntry;
    els.pivotRoundNum.textContent = String(run.idx + 1);
    els.pivotScoreNum.textContent = String(run.score);
    els.pivotTeamLabel.textContent = team.season + ' ' + team.team;
    els.pivotVerdictWrap.hidden = true;
    els.pivotRows.innerHTML = '';
    round.displayOrder.forEach(function (origIdx) {
      var c = team.candidates[origIdx];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vh-pivot-row';
      btn.innerHTML = '<span class="vh-pivot-row__name">' + escapeHtml(c.name) + '</span>' + pivotArchetypeChipHtml(c.current);
      btn.addEventListener('click', function () { pickPivotCandidate(origIdx); });
      els.pivotRows.appendChild(btn);
    });
    renderPivotHeader();
    track('vh-pivot-round', { round: run.idx + 1, mode: activePivotMode });
  }

  function pivotSignedSigma(v) {
    return (v >= 0 ? '+' : '') + v.toFixed(2) + 'σ';
  }

  // "His neighborhood": the current archetype's 3 nearest archetypes by
  // cosine (pivots.json's `adjacency`) — the one this candidate's own path
  // actually uses (`adjacent`) is marked distinctly among the three.
  function pivotNeighborhoodHtml(current, usedAdjacent) {
    var adj = PIVOT_ADJ_BY_ARCHETYPE[current];
    if (!adj || !adj.length) return '';
    var chips = adj.map(function (a) {
      var used = a.archetype === usedAdjacent;
      return '<span class="vh-hint-chip vh-pivot-row__chip--adj' + (used ? ' is-used' : '') + '">' +
        escapeHtml(a.archetype) + ' ' + Math.round(a.similarity * 100) + '%</span>';
    }).join('');
    return '<div class="vh-pivot-row__neighborhood"><span class="vh-pivot-row__neighborhood-label">His neighborhood:</span>' + chips + '</div>';
  }

  // Post-reveal: same on-screen order as the pick stage (no re-sort, so the
  // list doesn't jump), each row annotated with its true rank and expandable
  // (native <details>) into the receipts. Correct row (rank 0) gold; the
  // player's own pick gets a distinct "Your pick" badge (which can coexist
  // with gold, when they got it exactly right).
  function renderPivotReveal(round) {
    var team = round.teamEntry;
    els.pivotRows.innerHTML = '';
    round.displayOrder.forEach(function (origIdx) {
      var c = team.candidates[origIdx];
      var rank = round.rankByIdx[origIdx];
      var isCorrect = rank === 0;
      var isPicked = origIdx === round.pickedIdx;

      var details = document.createElement('details');
      details.className = 'vh-pivot-row vh-pivot-row--reveal' +
        (isCorrect ? ' is-correct' : '') + (isPicked ? ' is-picked' : '');
      if (isCorrect || isPicked) details.open = true;

      var summary = document.createElement('summary');
      summary.innerHTML =
        '<span class="vh-pivot-row__rank">#' + (rank + 1) + '</span>' +
        '<span class="vh-pivot-row__name">' + escapeHtml(c.name) + '</span>' +
        pivotArchetypeChipHtml(c.current) +
        (isPicked ? '<span class="vh-pivot-row__your-pick">Your pick</span>' : '') +
        (isCorrect ? '<span class="vh-pivot-row__mark" aria-hidden="true">★</span>' : '');
      details.appendChild(summary);

      var detail = document.createElement('div');
      detail.className = 'vh-pivot-row__detail';
      detail.innerHTML =
        '<p class="vh-pivot-row__pivot">&rarr; <b>' + escapeHtml(c.adjacent) + '</b> &middot; pivot distance ' + c.pivotDistance.toFixed(2) + '</p>' +
        '<p class="vh-pivot-row__receipts">Players who made this exact pivot: <b>' + pivotSignedSigma(c.path.meanDPMz) +
          '</b> impact on average (n=' + c.path.n + ') &mdash; e.g. ' + escapeHtml(c.path.example.name) + ' ' +
          escapeHtml(c.path.example.seasons) + '.</p>' +
        pivotNeighborhoodHtml(c.current, c.adjacent);
      details.appendChild(detail);

      els.pivotRows.appendChild(details);
    });
  }

  function pickPivotCandidate(origIdx) {
    var run = activePivotRun();
    var round = run.rounds[run.idx];
    if (round.answered) return;
    round.answered = true;
    round.pickedIdx = origIdx;

    var team = round.teamEntry;
    var rank = round.rankByIdx[origIdx];
    var points = rank === 0 ? 2 : (rank <= 2 ? 1 : 0);
    round.points = points;
    run.score += points;

    var answerOrigIdx = origIdx;
    Object.keys(round.rankByIdx).forEach(function (k) {
      if (round.rankByIdx[k] === 0) answerOrigIdx = parseInt(k, 10);
    });
    var answerCandidate = team.candidates[answerOrigIdx];

    renderPivotReveal(round);

    els.pivotVerdictWrap.hidden = false;
    els.pivotVerdict.innerHTML = '';
    var prefix, suffix;
    if (points === 2) {
      prefix = '+2 pts — exact. ';
      suffix = ' had the most measured upside on the ' + team.season + ' ' + team.team + '.';
    } else if (points === 1) {
      prefix = '+1 pt — top 3 (rank #' + (rank + 1) + '), but ';
      suffix = ' had the most measured upside instead.';
    } else {
      prefix = '+0 pts — rank #' + (rank + 1) + '. ';
      suffix = ' had the most measured upside instead.';
    }
    els.pivotVerdict.appendChild(document.createTextNode(prefix));
    var nameSpan = document.createElement('span');
    els.pivotVerdict.appendChild(nameSpan);
    els.pivotVerdict.appendChild(document.createTextNode(suffix));
    tryLinkMoverName(nameSpan, answerCandidate.name);

    els.pivotScoreNum.textContent = String(run.score);
    els.pivotNextBtn.textContent = (run.idx + 1 >= PIVOT_ROUNDS_PER_RUN) ? 'See results' : 'Next round';
  }

  function buildPivotShareText() {
    var run = pivotRuns.daily;
    var rows = run.rounds.map(function (r) {
      return r.points === 2 ? '🟩' : (r.points === 1 ? '🟨' : '⬜');
    }).join('');
    return 'Vector Hoops — The Pivot #' + puzzleNumber(TODAY) + ' ' + run.score + '/' + (PIVOT_ROUNDS_PER_RUN * 2) +
      '\n' + rows;
  }

  function showPivotFinal() {
    var run = activePivotRun();
    els.pivotFinal.hidden = false;
    els.pivotVerdictWrap.hidden = true;
    els.pivotFinalScore.textContent = 'You scored ' + run.score + '/' + (PIVOT_ROUNDS_PER_RUN * 2) + '.';

    if (activePivotMode === 'daily') {
      var rec = pivotDailyToday();
      if (!rec.done) {
        rec.done = true;
        submitLeaderboardScore('pivot', TODAY, run.score);
        rec.score = run.score;
        var yesterday = utcDateString(new Date(Date.now() - 86400000));
        PIVOT_STATE.streak = (PIVOT_STATE.lastPlayDate === yesterday) ? PIVOT_STATE.streak + 1 : 1;
        PIVOT_STATE.lastPlayDate = TODAY;
        PIVOT_STATE.totalSets++;
        PIVOT_STATE.totalScoreSum += run.score;
        savePivotDailyState();
        track('vh-pivot-done', { score: run.score, mode: 'daily' });
      }
      els.pivotAgainBtn.hidden = true;
      els.pivotShareBtn.hidden = false;
      els.pivotComeback.hidden = false;
      els.pivotShareCopied.hidden = true;
    } else {
      PIVOT_PRACTICE_STATS.played++;
      PIVOT_PRACTICE_STATS.totalScoreSum += run.score;
      savePivotPracticeStats();
      els.pivotAgainBtn.hidden = false;
      els.pivotShareBtn.hidden = true;
      els.pivotComeback.hidden = true;
      track('vh-pivot-done', { score: run.score, mode: 'free' });
    }
    renderPivotHeader();
  }

  function nextPivotRound() {
    var run = activePivotRun();
    var round = run.rounds[run.idx];
    if (!round.answered) return;
    run.idx++;
    if (run.idx >= PIVOT_ROUNDS_PER_RUN) {
      showPivotFinal();
    } else {
      renderPivotRound();
    }
  }

  function switchPivotMode(mode) {
    activePivotMode = mode;
    els.pivotSubDaily.classList.toggle('is-active', mode === 'daily');
    els.pivotSubFree.classList.toggle('is-active', mode === 'free');
    els.pivotSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.pivotSubFree.setAttribute('aria-selected', String(mode === 'free'));

    if (mode === 'daily' && pivotDailyToday().done && !pivotRuns.daily) {
      var doneRec = pivotDailyToday();
      pivotRuns.daily = { rounds: [], idx: PIVOT_ROUNDS_PER_RUN, score: doneRec.score || 0 };
    }

    var run = pivotRuns[mode];
    if (!run) {
      startPivotRun(mode);
    } else if (run.idx >= PIVOT_ROUNDS_PER_RUN) {
      showPivotFinal();
    } else {
      els.pivotFinal.hidden = true;
      renderPivotRound();
    }
    renderPivotHeader();
  }

  function setupPivot() {
    buildPivotAdjacencyIndex();
    els.pivotNextBtn.addEventListener('click', nextPivotRound);
    els.pivotAgainBtn.addEventListener('click', function () { startPivotRun('free'); });
    els.pivotSubDaily.addEventListener('click', function () { switchPivotMode('daily'); });
    els.pivotSubFree.addEventListener('click', function () { switchPivotMode('free'); });
    els.pivotMethodBtn.addEventListener('click', function () { openMethods('pivot', els.pivotMethodBtn); });
    els.pivotCaptionBtn.addEventListener('click', function () { openMethods('pivot', els.pivotCaptionBtn); });
    els.pivotShareBtn.addEventListener('click', function () {
      var run = pivotRuns.daily;
      var text = buildPivotShareText();
      shareChallengeResult(text, {
        mode: 'pv',
        date: playDate(),
        score: run.score + '/' + (PIVOT_ROUNDS_PER_RUN * 2),
        scoreLabel: run.score + '/' + (PIVOT_ROUNDS_PER_RUN * 2),
        challenger: challengerName()
      }, els.pivotShareCopied, 'pivot-daily-challenge');
    });
  }

  // ---------------------------------------------------------------------
  // ERA TWIN: every quiz-eligible player-season (assets/eratwins.json,
  // 1,260 careers with >=4 charted seasons) has a real geometric double in
  // ANOTHER decade — nearest OTHER-decade player by root-frame cosine
  // (signature seasons chained-Procrustes-mapped to the 1996-97 root
  // frame). Guess the twin from a typeahead restricted to other-decade
  // quiz-eligible players only (2 attempts/round). Only the shipped top5
  // carries a real similarity number, so a near-miss shows warmth ONLY
  // when the guess lands in that top5 ("92% aligned — so close"); any
  // other wrong guess gets an honest lower bound off top5[4].sim ("not in
  // the top 5 — colder than 89%") rather than a fabricated number. Same
  // 5-round Daily Set / Free Play shape as Chemistry/The Pivot; 2/1/0 pts
  // per round (first try / second try / miss), 0-10 total. Daily-set scores post to the public leaderboard.
  // same doctrine as Chemistry/Pivot at launch, no leaderboard submission.
  // ---------------------------------------------------------------------

  var TWINS = null;              // parsed eratwins.json
  var TWIN_POOL = null;          // eratwins.json's players array (1,260)
  var TWIN_BY_DECADE = null;     // { decade: [indices into TWIN_POOL] }
  var TWIN_DECADE_ORDER = ['1990s', '2000s', '2010s', '2020s'];
  var activeTwinMode = 'daily';  // 'daily' | 'free'
  var twinRuns = { daily: null, free: null }; // { rounds, idx, score }
  var TWIN_STATE = null;             // persisted Daily Set streak/history — LS_KEY_TWIN_DAILY
  var TWIN_PRACTICE_STATS = null;    // persisted Free Play casual stats — LS_KEY_TWIN_PRACTICE
  var activeTwinCandidatePool = [];  // current round's other-decade guess pool (fed to createAutocomplete via a getter)

  function buildTwinDecadeIndex() {
    var byDecade = {};
    TWIN_POOL.forEach(function (p, i) {
      (byDecade[p.decade] = byDecade[p.decade] || []).push(i);
    });
    TWIN_BY_DECADE = byDecade;
  }

  function loadTwinCounter() {
    var n = 0;
    try {
      var raw = localStorage.getItem(LS_KEY_TWIN_COUNTER);
      n = raw ? (parseInt(raw, 10) || 0) : 0;
    } catch (e) { n = 0; }
    return n;
  }

  function saveTwinCounter(n) {
    try { localStorage.setItem(LS_KEY_TWIN_COUNTER, String(n)); } catch (e) { /* storage unavailable */ }
  }

  function loadTwinDailyState() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_TWIN_DAILY); } catch (e) { raw = null; }
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

  function saveTwinDailyState() {
    try { localStorage.setItem(LS_KEY_TWIN_DAILY, JSON.stringify(TWIN_STATE)); } catch (e) { /* storage unavailable */ }
  }

  function twinDailyToday() {
    return TWIN_STATE.days[TODAY];
  }

  function computeTwinDailyStats() {
    return {
      streak: TWIN_STATE.streak,
      totalSets: TWIN_STATE.totalSets,
      avgScore: TWIN_STATE.totalSets ? (TWIN_STATE.totalScoreSum / TWIN_STATE.totalSets) : 0
    };
  }

  function loadTwinPracticeStats() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY_TWIN_PRACTICE); } catch (e) { raw = null; }
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

  function saveTwinPracticeStats() {
    try { localStorage.setItem(LS_KEY_TWIN_PRACTICE, JSON.stringify(TWIN_PRACTICE_STATS)); } catch (e) { /* storage unavailable */ }
  }

  // Every other-decade quiz-eligible player-season — the only pool a guess
  // can ever be picked from, so a wrong guess is always a real,
  // different-decade player-season, never a same-decade non-answer.
  function twinCandidatePool(anchor) {
    return TWIN_POOL.filter(function (p) { return p.decade !== anchor.decade; });
  }

  function buildTwinRound(anchor) {
    return { anchor: anchor, attempts: 0, guesses: [], solved: false, points: 0, done: false };
  }

  // Daily Set: seed-pick one anchor per eligible decade bucket first (a
  // mixed-decade set whenever the pool has enough distinct decades), then
  // fill any remaining rounds with more seeded picks from the full pool —
  // never repeating an anchor within the same set.
  function buildTwinDailyRounds() {
    var rng = seededRng('vector-hoops:twin-daily:' + playDate());
    var rounds = [];
    var usedIdx = {};
    var decades = TWIN_DECADE_ORDER.filter(function (d) {
      return TWIN_BY_DECADE[d] && TWIN_BY_DECADE[d].length;
    });
    decades.forEach(function (d) {
      if (rounds.length >= TWIN_ROUNDS_PER_RUN) return;
      var bucket = TWIN_BY_DECADE[d];
      var pick = bucket[Math.floor(rng() * bucket.length)];
      usedIdx[pick] = true;
      rounds.push(buildTwinRound(TWIN_POOL[pick]));
    });
    var guard = 0;
    while (rounds.length < TWIN_ROUNDS_PER_RUN && guard < 10000) {
      guard++;
      var idx = Math.floor(rng() * TWIN_POOL.length);
      if (usedIdx[idx]) continue;
      usedIdx[idx] = true;
      rounds.push(buildTwinRound(TWIN_POOL[idx]));
    }
    return rounds;
  }

  function buildTwinFreeRounds() {
    var counter = loadTwinCounter();
    var rounds = [];
    for (var i = 0; i < TWIN_ROUNDS_PER_RUN; i++) {
      rounds.push(buildTwinRound(TWIN_POOL[Math.floor(seededRng('vector-hoops:twin:' + counter)() * TWIN_POOL.length)]));
      counter++;
    }
    saveTwinCounter(counter);
    return rounds;
  }

  function activeTwinRun() {
    return twinRuns[activeTwinMode];
  }

  function startTwinRun(mode) {
    activeTwinMode = mode;
    if (mode === 'daily') {
      twinRuns.daily = { rounds: buildTwinDailyRounds(), idx: 0, score: 0 };
    } else {
      twinRuns.free = { rounds: buildTwinFreeRounds(), idx: 0, score: 0 };
    }
    els.twinFinal.hidden = true;
    renderTwinRound();
  }

  function renderTwinHeader() {
    var isDaily = activeTwinMode === 'daily';
    els.twinEyebrow.textContent = isDaily
      ? 'Era Twin — Daily Set #' + puzzleNumber(TODAY)
      : 'Era Twin — Free Play (practice)';
    els.twinStreakWrap.hidden = !isDaily;
    if (isDaily) els.twinStreakNum.textContent = String(TWIN_STATE.streak);
    els.twinPracticeBanner.hidden = isDaily;
  }

  // vectors.json carries no decade/archetype field of its own — resolve an
  // eratwins.json name+season back to its real 14-dim era-z vector via the
  // same PLAYERS_BY_NAME_SEASON index Chemistry uses. Every eratwins.json
  // entry (anchor, twin, and all top5) was independently verified resolvable
  // at authoring time; still resolved defensively (null-checked below) so a
  // future data drift fails soft (bars just don't render) rather than throws.
  function resolveTwinVector(name, season) {
    var p = PLAYERS_BY_NAME_SEASON ? PLAYERS_BY_NAME_SEASON[name + '|' + season] : null;
    return p ? p.v : null;
  }

  function renderTwinAnchorCard(anchor) {
    els.twinAnchorName.textContent = anchor.name + ' — ' + anchor.season;
    els.twinAnchorDecadeChip.textContent = anchor.decade;
    els.twinAnchorArchetypeChip.textContent = anchor.archetype;
    var v = resolveTwinVector(anchor.name, anchor.season);
    if (v && els.twinAnchorMinibars) {
      els.twinAnchorMinibars.hidden = false;
      renderMiniSigmaBars(els.twinAnchorMinibars, v);
    } else if (els.twinAnchorMinibars) {
      els.twinAnchorMinibars.hidden = true;
    }
  }

  function renderTwinAttempts(round) {
    if (round.done) {
      els.twinAttempts.textContent = round.solved
        ? 'Solved in ' + round.attempts + (round.attempts === 1 ? ' attempt.' : ' attempts.')
        : 'Out of attempts.';
    } else {
      els.twinAttempts.textContent = 'Attempt ' + (round.attempts + 1) + ' of ' + TWIN_MAX_ATTEMPTS + '.';
    }
  }

  // Warmth for a wrong guess: the shipped top5 is the ONLY source of a real
  // similarity number for this anchor, so a guess landing in it shows that
  // exact %; any other guess is honestly bounded by the top5's weakest
  // (5th-place) entry rather than inventing a number nothing here can verify.
  function twinGuessFeedback(anchor, picked) {
    var top5 = anchor.top5;
    for (var i = 0; i < top5.length; i++) {
      if (top5[i].name === picked.name && top5[i].season === picked.season) {
        return { warm: true, pct: Math.round(top5[i].sim * 100) };
      }
    }
    return { warm: false, boundPct: Math.round(top5[top5.length - 1].sim * 100) };
  }

  function twinGuessFeedbackText(fb) {
    return fb.warm
      ? (fb.pct + '% aligned — so close.')
      : ('not in the top 5 — colder than ' + fb.boundPct + '%.');
  }

  function renderTwinGuessList(round) {
    els.twinGuesses.innerHTML = '';
    round.guesses.forEach(function (g) {
      var li = document.createElement('li');
      li.className = 'vh-twin-guess';
      li.textContent = g.name + ' (' + g.season + ') — ' + twinGuessFeedbackText(g.feedback);
      els.twinGuesses.appendChild(li);
    });
  }

  function renderTwinRound() {
    var run = activeTwinRun();
    var round = run.rounds[run.idx];
    els.twinRoundNum.textContent = String(run.idx + 1);
    els.twinScoreNum.textContent = String(run.score);
    renderTwinAnchorCard(round.anchor);
    renderTwinAttempts(round);
    renderTwinGuessList(round);
    els.twinVerdictWrap.hidden = true;
    els.twinInput.value = '';
    els.twinInput.disabled = false;
    activeTwinCandidatePool = twinCandidatePool(round.anchor);
    renderTwinHeader();
    track('vh-twin-round', { round: run.idx + 1, mode: activeTwinMode });
  }

  function twinGapYears(anchor) {
    return Math.abs(parseInt(anchor.twin.season.slice(0, 4), 10) - parseInt(anchor.season.slice(0, 4), 10));
  }

  function renderTwinReveal(round) {
    var run = activeTwinRun();
    var anchor = round.anchor, twin = anchor.twin;
    els.twinVerdictWrap.hidden = false;
    els.twinVerdict.innerHTML = '';
    var prefix = round.solved
      ? (round.attempts === 1 ? 'Correct on the first try — his era twin is ' : 'Correct — his era twin is ')
      : 'Missed it — his real era twin is ';
    els.twinVerdict.appendChild(document.createTextNode(prefix));
    var nameSpan = document.createElement('span');
    els.twinVerdict.appendChild(nameSpan);
    els.twinVerdict.appendChild(document.createTextNode(' (' + twin.season + ').'));
    tryLinkMoverName(nameSpan, twin.name);

    els.twinRevealAnchorTitle.textContent = anchor.name + ' — ' + anchor.season;
    els.twinRevealTwinTitle.textContent = twin.name + ' — ' + twin.season;
    var av = resolveTwinVector(anchor.name, anchor.season);
    var tv = resolveTwinVector(twin.name, twin.season);
    if (av && els.twinRevealAnchorBars) renderMiniSigmaBars(els.twinRevealAnchorBars, av);
    if (tv && els.twinRevealTwinBars) renderMiniSigmaBars(els.twinRevealTwinBars, tv);
    els.twinRevealSimilarity.textContent = Math.round(twin.similarity * 100) + '% aligned — twins across ' +
      twinGapYears(anchor) + ' years.';

    els.twinNextBtn.textContent = (run.idx + 1 >= TWIN_ROUNDS_PER_RUN) ? 'See results' : 'Next round';
  }

  function answerTwinGuess(picked) {
    var run = activeTwinRun();
    var round = run.rounds[run.idx];
    if (round.done) return;
    round.attempts++;
    var isCorrect = picked.name === round.anchor.twin.name && picked.season === round.anchor.twin.season;
    if (isCorrect) {
      round.solved = true;
      round.points = round.attempts === 1 ? 2 : 1;
      round.done = true;
      run.score += round.points;
    } else {
      round.guesses.push({ name: picked.name, season: picked.season, feedback: twinGuessFeedback(round.anchor, picked) });
      if (round.attempts >= TWIN_MAX_ATTEMPTS) round.done = true;
    }
    els.twinScoreNum.textContent = String(run.score);
    renderTwinAttempts(round);
    renderTwinGuessList(round);
    els.twinInput.value = '';
    if (round.done) {
      els.twinInput.disabled = true;
      renderTwinReveal(round);
    }
  }

  function buildTwinShareText() {
    var run = twinRuns.daily;
    var rows = run.rounds.map(function (r) {
      return r.points === 2 ? '🟩' : (r.points === 1 ? '🟨' : '⬜');
    }).join('');
    return 'Vector Hoops — Era Twin #' + puzzleNumber(TODAY) + ' ' + run.score + '/' + (TWIN_ROUNDS_PER_RUN * 2) +
      '\n' + rows;
  }

  function showTwinFinal() {
    var run = activeTwinRun();
    els.twinFinal.hidden = false;
    els.twinVerdictWrap.hidden = true;
    els.twinFinalScore.textContent = 'You scored ' + run.score + '/' + (TWIN_ROUNDS_PER_RUN * 2) + '.';

    if (activeTwinMode === 'daily') {
      var rec = twinDailyToday();
      if (!rec.done) {
        rec.done = true;
        submitLeaderboardScore('eratwin', TODAY, run.score);
        rec.score = run.score;
        var yesterday = utcDateString(new Date(Date.now() - 86400000));
        TWIN_STATE.streak = (TWIN_STATE.lastPlayDate === yesterday) ? TWIN_STATE.streak + 1 : 1;
        TWIN_STATE.lastPlayDate = TODAY;
        TWIN_STATE.totalSets++;
        TWIN_STATE.totalScoreSum += run.score;
        saveTwinDailyState();
        track('vh-twin-done', { score: run.score, mode: 'daily' });
      }
      els.twinAgainBtn.hidden = true;
      els.twinShareBtn.hidden = false;
      els.twinComeback.hidden = false;
      els.twinShareCopied.hidden = true;
    } else {
      TWIN_PRACTICE_STATS.played++;
      TWIN_PRACTICE_STATS.totalScoreSum += run.score;
      saveTwinPracticeStats();
      els.twinAgainBtn.hidden = false;
      els.twinShareBtn.hidden = true;
      els.twinComeback.hidden = true;
      track('vh-twin-done', { score: run.score, mode: 'free' });
    }
    renderTwinHeader();
  }

  function nextTwinRound() {
    var run = activeTwinRun();
    var round = run.rounds[run.idx];
    if (!round.done) return;
    run.idx++;
    if (run.idx >= TWIN_ROUNDS_PER_RUN) {
      showTwinFinal();
    } else {
      renderTwinRound();
    }
  }

  // Switching Daily Set <-> Free Play never restarts an in-progress run —
  // each mode keeps its own state in twinRuns until you start a new one.
  function switchTwinMode(mode) {
    activeTwinMode = mode;
    els.twinSubDaily.classList.toggle('is-active', mode === 'daily');
    els.twinSubFree.classList.toggle('is-active', mode === 'free');
    els.twinSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.twinSubFree.setAttribute('aria-selected', String(mode === 'free'));

    if (mode === 'daily' && twinDailyToday().done && !twinRuns.daily) {
      var doneRec = twinDailyToday();
      twinRuns.daily = { rounds: [], idx: TWIN_ROUNDS_PER_RUN, score: doneRec.score || 0 };
    }

    var run = twinRuns[mode];
    if (!run) {
      startTwinRun(mode);
    } else if (run.idx >= TWIN_ROUNDS_PER_RUN) {
      showTwinFinal();
    } else {
      els.twinFinal.hidden = true;
      renderTwinRound();
    }
    renderTwinHeader();
  }

  // One createAutocomplete() call for the whole mode: the guess pool
  // changes every round, so the `players` arg is a getter (see the
  // function-or-array branch added to createAutocomplete's search()) that
  // always reads the CURRENT round's other-decade candidates — no need to
  // re-register input/keydown/focus/blur listeners per round.
  function setupTwinInput() {
    createAutocomplete(els.twinInput, els.twinSuggestions, function () {
      return activeTwinCandidatePool;
    }, function (p) {
      answerTwinGuess(p);
    }, { hintEl: els.twinFocusHint });
  }

  function setupTwin() {
    buildTwinDecadeIndex();
    setupTwinInput();
    els.twinNextBtn.addEventListener('click', nextTwinRound);
    els.twinAgainBtn.addEventListener('click', function () { startTwinRun('free'); });
    els.twinSubDaily.addEventListener('click', function () { switchTwinMode('daily'); });
    els.twinSubFree.addEventListener('click', function () { switchTwinMode('free'); });
    els.twinMethodBtn.addEventListener('click', function () { openMethods('twin', els.twinMethodBtn); });
    els.twinShareBtn.addEventListener('click', function () {
      var run = twinRuns.daily;
      var text = buildTwinShareText();
      shareChallengeResult(text, {
        mode: 'tw',
        date: playDate(),
        score: run.score + '/' + (TWIN_ROUNDS_PER_RUN * 2),
        scoreLabel: run.score + '/' + (TWIN_ROUNDS_PER_RUN * 2),
        challenger: challengerName()
      }, els.twinShareCopied, 'twin-daily-challenge');
    });
  }

  var pivotInitialized = false;
  var twinInitialized = false;

  function switchMode(mode) {
    var panels = {
      chimera: els.panelChimera, deadline: els.panelDeadline, fader: els.panelFader, arc: els.panelArc,
      chem: els.panelChem, whatif: els.panelWhatif, pivot: els.panelPivot, twin: els.panelTwin
    };
    var tabs = {
      chimera: els.tabChimera, deadline: els.tabDeadline, fader: els.tabFader, arc: els.tabArc,
      chem: els.tabChem, whatif: els.tabWhatif, pivot: els.tabPivot, twin: els.tabTwin
    };
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
    if (mode === 'chem' && !chemInitialized && CHEM_POOL) {
      chemInitialized = true;
      switchChemMode('daily');
    }
    if (mode === 'whatif' && !whatifInitialized) {
      whatifInitialized = true;
      setupWhatif();
    }
    if (mode === 'pivot' && !pivotInitialized && PIVOT_POOL) {
      pivotInitialized = true;
      switchPivotMode('daily');
    }
    if (mode === 'twin' && !twinInitialized && TWIN_POOL) {
      twinInitialized = true;
      switchTwinMode('daily');
    }
    checkRollover();
  }

  function setupModeTabs() {
    els.tabChimera.addEventListener('click', function () { switchMode('chimera'); });
    els.tabDeadline.addEventListener('click', function () { switchMode('deadline'); });
    els.tabFader.addEventListener('click', function () { switchMode('fader'); });
    els.tabArc.addEventListener('click', function () { switchMode('arc'); });
    els.tabChem.addEventListener('click', function () { switchMode('chem'); });
    els.tabWhatif.addEventListener('click', function () { switchMode('whatif'); });
    els.tabPivot.addEventListener('click', function () { switchMode('pivot'); });
    els.tabTwin.addEventListener('click', function () { switchMode('twin'); });
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
    var max = 1;
    for (var mi = 0; mi < dist.length; mi++) max = Math.max(max, dist[mi]);
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
    renderStatsTile(els.statsDailyGrid, daily.totalPts, 'Total pts');
    renderStatsTile(els.statsDailyGrid, daily.bestDay, 'Best day');
    renderStatsTile(els.statsDailyGrid, daily.avgMultiplier ? ('×' + daily.avgMultiplier.toFixed(2)) : '—', 'Avg multiplier');
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

    if (els.statsChemGrid) {
      var chem = computeChemDailyStats();
      els.statsChemGrid.innerHTML = '';
      renderStatsTile(els.statsChemGrid, chem.totalSets, 'Sets played');
      renderStatsTile(els.statsChemGrid, chem.avgScore.toFixed(1), 'Avg score');
      renderStatsTile(els.statsChemGrid, chem.streak, 'Streak');
    }

    if (els.statsPivotGrid) {
      var pivot = computePivotDailyStats();
      els.statsPivotGrid.innerHTML = '';
      renderStatsTile(els.statsPivotGrid, pivot.totalSets, 'Sets played');
      renderStatsTile(els.statsPivotGrid, pivot.avgScore.toFixed(1), 'Avg score');
      renderStatsTile(els.statsPivotGrid, pivot.streak, 'Streak');
    }

    if (els.statsTwinGrid) {
      var twin = computeTwinDailyStats();
      els.statsTwinGrid.innerHTML = '';
      renderStatsTile(els.statsTwinGrid, twin.totalSets, 'Sets played');
      renderStatsTile(els.statsTwinGrid, twin.avgScore.toFixed(1), 'Avg score');
      renderStatsTile(els.statsTwinGrid, twin.streak, 'Streak');
    }

    els.statsPracticeLine.textContent = 'Chimera: ' + PRACTICE_STATS.played + ' played, ' + PRACTICE_STATS.won + ' won. ' +
      'Fader or Finisher: ' + practiceSetSummary(FADER_PRACTICE_STATS) + '. ' +
      'Career Arc: ' + practiceSetSummary(ARC_PRACTICE_STATS) + '. ' +
      'Chemistry: ' + practiceSetSummary(CHEM_PRACTICE_STATS) + '. ' +
      'The Pivot: ' + practiceSetSummary(PIVOT_PRACTICE_STATS) + '. ' +
      'Era Twin: ' + practiceSetSummary(TWIN_PRACTICE_STATS) + '. ' +
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
    var ok = window.confirm('Clear all Vector Hoops data on this device? This removes every daily streak (Chimera, Deadline, Fader or Finisher, Career Arc, Chemistry, The Pivot, Era Twin) and all practice counters. This cannot be undone.');
    if (!ok) return;
    [LS_KEY, LS_KEY_DEADLINE_DAILY, LS_KEY_PRACTICE_STATS, LS_KEY_DEADLINE_COUNTER,
     LS_KEY_FF_DAILY, LS_KEY_FF_PRACTICE, LS_KEY_ARC_DAILY, LS_KEY_ARC_PRACTICE,
     LS_KEY_CHEM_DAILY, LS_KEY_CHEM_PRACTICE, LS_KEY_CHEM_COUNTER,
     LS_KEY_PIVOT_DAILY, LS_KEY_PIVOT_PRACTICE, LS_KEY_PIVOT_COUNTER,
     LS_KEY_TWIN_DAILY, LS_KEY_TWIN_PRACTICE, LS_KEY_TWIN_COUNTER].forEach(function (key) {
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
    if (which === 'chem') {
      els.methodsTitle.textContent = 'Chemistry — method & data sources';
      els.methodsBody.innerHTML =
        '<p class="vh-dossier__p">' + escapeHtml(CHEMISTRY && CHEMISTRY.method || '') + '</p>' +
        '<h4 class="vh-dossier__h4">Data sources &amp; minimums</h4>' +
        '<div class="vh-dossier__bullet">Real NBA teammate pairs, same team-season, each player &ge;1000 minutes, 2015&ndash;16 through 2025&ndash;26 seasons.</div>' +
        '<div class="vh-dossier__bullet">Quiz pool is the top 800 pairs by chemistry score out of ' +
          (CHEMISTRY && CHEMISTRY.totalPairsAnalyzed || 'all') + ' pairs analyzed — not a full-league sample.</div>' +
        '<div class="vh-dossier__bullet">Distractors: vectors.json carries no team field, so an exact "different team" filter isn\'t computable. ' +
          'Instead, distractors are seeded same-season player-seasons that are never the anchor, never the true partner, and never ' +
          'another top-800 partner of the same anchor — preferring the true partner\'s position, then broad position group.</div>' +
        '<div class="vh-dossier__bullet">Daily-set scores post to the public leaderboard.';
      return;
    }
    if (which === 'whatif') {
      els.methodsTitle.textContent = 'What-If Lab — method & data sources';
      els.methodsBody.innerHTML =
        '<p class="vh-dossier__p">Complementarity = 1 &minus; |cosine| of the two player-seasons\' era-z profiles — the exact ' +
          'formula chemistry.json uses. Higher means more orthogonal skill profiles; it is not a claim about on-court chemistry ' +
          'or team success (no lineup on/off data is used here).</p>' +
        '<h4 class="vh-dossier__h4">Data sources &amp; minimums</h4>' +
        '<div class="vh-dossier__bullet">Vectors: per-100-possession stats, z-scored within each season, 14 dimensions, 1996&ndash;97 through 2025&ndash;26.</div>' +
        '<div class="vh-dossier__bullet">Redundancy flags trigger when both players sit above +1.5&sigma; on a ball-dominant dimension (shot volume, free-throw ' +
          'rate, or assists). Shared-weakness flags trigger when both sit below &minus;1&sigma; on the same dimension (above +1&sigma; for turnovers, where high is the weak direction).</div>' +
        '<div class="vh-dossier__bullet">"Closest real-world analog" and the complementarity percentile are both computed against chemistry.json\'s top-800 ' +
          'measured pairs only — an elite, chemistry-selected subsample, not the full league. The percentile answers "where does this pairing rank among the ' +
          '800 best-measured pairs," not "among all possible pairs."</div>';
      return;
    }
    if (which === 'pivot') {
      els.methodsTitle.textContent = 'The Pivot — method & data sources';
      els.methodsBody.innerHTML =
        '<p class="vh-dossier__p">' + escapeHtml(PIVOTS && PIVOTS.method || '') + '</p>' +
        '<h4 class="vh-dossier__h4">Data sources &amp; minimums</h4>' +
        '<div class="vh-dossier__bullet">Adjacency: each archetype\'s 3 nearest other k-means centroids by cosine similarity, over the same 14-dim ' +
          'era-z vectors as the rest of the site.</div>' +
        '<div class="vh-dossier__bullet">Pivots: real players whose k-means archetype changed between two consecutive charted seasons, 1996&ndash;97 ' +
          'through 2025&ndash;26. A path\'s mean/n only ships when at least 8 players made that exact directed pivot.</div>' +
        '<div class="vh-dossier__bullet">Roster candidates: 2023&ndash;24 through 2025&ndash;26 rosters, &ge;1000 minutes that season.</div>' +
        '<div class="vh-dossier__bullet">"Measured upside" is the historical mean PLUS_MINUS-z swing for the pool of players who made that team\'s ' +
          'candidate\'s exact current-archetype&rarr;adjacent-archetype pivot before &mdash; observed precedent WITH selection effects (players who ' +
          'pivoted are those whose games changed), not a prediction, projection, or simulation for this specific player.</div>' +
        '<div class="vh-dossier__bullet">Daily-set scores post to the public leaderboard (anonymous session names).</div>';
      return;
    }
    if (which === 'twin') {
      els.methodsTitle.textContent = 'Era Twin — method & data sources';
      els.methodsBody.innerHTML =
        '<p class="vh-dossier__p">' + escapeHtml(TWINS && TWINS.method || '') + '</p>' +
        '<h4 class="vh-dossier__h4">Data sources &amp; minimums</h4>' +
        '<div class="vh-dossier__bullet">Quiz pool: 1,260 player-seasons from careers with &ge;4 charted seasons, 1996&ndash;97 through 2025&ndash;26.</div>' +
        '<div class="vh-dossier__bullet">A player\'s twin is always from a DIFFERENT decade by construction &mdash; nearest OTHER-decade player-season by ' +
          'root-frame cosine, after chaining each decade\'s own Procrustes transform back to the shared 1996&ndash;97 root frame.</div>' +
        '<div class="vh-dossier__bullet">Only the shipped top 5 candidates carry a real similarity number. A guess landing in that top 5 shows its exact ' +
          '% aligned; any other guess shows an honest lower bound off the 5th-place similarity rather than a fabricated number &mdash; warmth shows for ' +
          'near-misses, not for every possible guess.</div>' +
        '<div class="vh-dossier__bullet">Daily-set scores post to the public leaderboard (anonymous session names).</div>';
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
    els.challengeBanner = document.getElementById('challenge-banner');
    els.challengeBannerText = document.getElementById('challenge-banner-text');
    els.puzzleNumber = document.getElementById('puzzle-number');
    els.puzzleDay = document.getElementById('puzzle-day');
    els.promptText = document.getElementById('prompt-text');
    els.chimeraInput = document.getElementById('chimera-input');
    els.chimeraSuggestions = document.getElementById('chimera-suggestions');
    els.chimeraSubmit = document.getElementById('chimera-submit');
    els.chimeraFocusHint = document.getElementById('chimera-focus-hint');
    els.mashupBadgeGold = document.getElementById('mashup-slot-badge');
    els.mashupBadgeSilver = document.getElementById('mashup-slot-badge-silver');

    // v5 STAGED FLOW: Daily-only Stats + Style donor slots (the Mashup slot
    // reuses els.chimeraInput/chimeraSubmit above — shared with Free Play,
    // which only ever hunts the mashup).
    els.donorSlotsRow = document.getElementById('donor-slots-row');
    els.chimeraStatsInput = document.getElementById('chimera-stats-input');
    els.chimeraStatsSuggestions = document.getElementById('chimera-stats-suggestions');
    els.chimeraStatsSubmit = document.getElementById('chimera-stats-submit');
    els.chimeraStatsFocusHint = document.getElementById('chimera-stats-focus-hint');
    els.chimeraStatsBadge = document.getElementById('stats-slot-badge');
    els.chimeraStatsFeedback = document.getElementById('stats-slot-feedback');
    els.statsSlotMask = document.getElementById('stats-slot-mask');
    els.chimeraArchetypeInput = document.getElementById('chimera-archetype-input');
    els.chimeraArchetypeSuggestions = document.getElementById('chimera-archetype-suggestions');
    els.chimeraArchetypeSubmit = document.getElementById('chimera-archetype-submit');
    els.chimeraArchetypeFocusHint = document.getElementById('chimera-archetype-focus-hint');
    els.chimeraArchetypeBadge = document.getElementById('archetype-slot-badge');
    els.chimeraArchetypeFeedback = document.getElementById('archetype-slot-feedback');
    els.archetypeSlotMask = document.getElementById('archetype-slot-mask');
    els.archetypeLockNote = document.getElementById('archetype-lock-note');
    els.mashupLockNote = document.getElementById('mashup-lock-note');
    els.equationTileA = document.getElementById('equation-tile-a');
    els.equationTileB = document.getElementById('equation-tile-b');
    els.equationTileMashup = document.getElementById('equation-tile-mashup');
    els.equationNameMashup = document.getElementById('equation-name-mashup');

    // v5 clue cards: each slot's own evidence zone (bars + sentence + chips)
    // and its small "Map →" tool shortcut.
    els.statsClueZone = document.getElementById('stats-clue-zone');
    els.statsClueBars = document.getElementById('stats-clue-bars');
    els.statsClueSentence = document.getElementById('stats-clue-sentence');
    els.statsClueChips = document.getElementById('stats-clue-chips');
    els.statsClueSr = document.getElementById('stats-clue-sr');
    els.statsClueHint = document.getElementById('stats-clue-hint');
    els.statsMapLink = document.getElementById('stats-map-link');

    els.archetypeClueZone = document.getElementById('archetype-clue-zone');
    els.archetypeClueBars = document.getElementById('archetype-clue-bars');
    els.archetypeClueSentence = document.getElementById('archetype-clue-sentence');
    els.archetypeClueChips = document.getElementById('archetype-clue-chips');
    els.archetypeClueSr = document.getElementById('archetype-clue-sr');
    els.archetypeClueHint = document.getElementById('archetype-clue-hint');
    els.archetypeMapLink = document.getElementById('archetype-map-link');

    els.mashupClueZone = document.getElementById('mashup-clue-zone');
    els.mashupClueBars = document.getElementById('mashup-clue-bars');
    els.mashupClueSr = document.getElementById('mashup-clue-sr');
    els.mashupClueHint = document.getElementById('mashup-clue-hint');
    els.mashupMapLink = document.getElementById('mashup-map-link');

    els.guessesLeftNum = document.getElementById('guesses-left-num');
    els.guessesLeftLabel = document.getElementById('guesses-left-label');
    els.resultCard = document.getElementById('result-card');
    els.scoreboardPct = document.getElementById('scoreboard-pct');
    els.mapThumb = document.getElementById('map-thumb');
    els.mapThumbBtn = document.getElementById('map-thumb-btn');
    els.triangulationBlock = document.getElementById('triangulation-block');
    els.triangulationSrSummary = document.getElementById('triangulation-sr-summary');
    els.triStatsPct = document.getElementById('tri-stats-pct');
    els.triShootingPct = document.getElementById('tri-shooting-pct');
    els.triBlendPct = document.getElementById('tri-blend-pct');
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
    els.equationChipText = document.getElementById('equation-chip-text');
    els.equationNameA = document.getElementById('equation-name-a');
    els.equationNameB = document.getElementById('equation-name-b');
    els.chimeraPhaseLabel = document.getElementById('chimera-phase-label');
    els.resetNote = document.getElementById('reset-note');
    els.chimeraUtilityRow = document.getElementById('chimera-utility-row');

    els.tabChimera = document.getElementById('tab-chimera');
    els.tabDeadline = document.getElementById('tab-deadline');
    els.tabFader = document.getElementById('tab-fader');
    els.tabArc = document.getElementById('tab-arc');
    els.tabChem = document.getElementById('tab-chem');
    els.tabWhatif = document.getElementById('tab-whatif');
    els.tabPivot = document.getElementById('tab-pivot');
    els.tabTwin = document.getElementById('tab-twin');
    els.panelChimera = document.getElementById('panel-chimera');
    els.panelDeadline = document.getElementById('panel-deadline');
    els.panelFader = document.getElementById('panel-fader');
    els.panelArc = document.getElementById('panel-arc');
    els.panelChem = document.getElementById('panel-chem');
    els.panelWhatif = document.getElementById('panel-whatif');
    els.panelPivot = document.getElementById('panel-pivot');
    els.panelTwin = document.getElementById('panel-twin');
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

    // Build-a-Chimera donor picker (Free Play)
    els.pickerCard = document.getElementById('picker-card');
    els.pickerStatsInput = document.getElementById('picker-stats-input');
    els.pickerStatsSuggestions = document.getElementById('picker-stats-suggestions');
    els.pickerStatsFocusHint = document.getElementById('picker-stats-focus-hint');
    els.pickerBadgeStats = document.getElementById('picker-badge-stats');
    els.pickerShootingInput = document.getElementById('picker-shooting-input');
    els.pickerShootingSuggestions = document.getElementById('picker-shooting-suggestions');
    els.pickerShootingFocusHint = document.getElementById('picker-shooting-focus-hint');
    els.pickerBadgeShooting = document.getElementById('picker-badge-shooting');
    els.pickerError = document.getElementById('picker-error');
    els.pickerRandomizeBtn = document.getElementById('picker-randomize-btn');
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
    els.arcTrajectoryLine = document.getElementById('arc-trajectory-line');
    els.arcLinechart = document.getElementById('arc-linechart');
    els.arcLinechartSrSummary = document.getElementById('arc-linechart-sr-summary');

    // Chemistry
    els.chemSubDaily = document.getElementById('chem-sub-daily');
    els.chemSubFree = document.getElementById('chem-sub-free');
    els.chemPracticeBanner = document.getElementById('chem-practice-banner');
    els.chemEyebrow = document.getElementById('chem-eyebrow');
    els.chemRoundNum = document.getElementById('chem-round-num');
    els.chemScoreNum = document.getElementById('chem-score-num');
    els.chemStreakWrap = document.getElementById('chem-streak-wrap');
    els.chemStreakNum = document.getElementById('chem-streak-num');
    els.chemPrompt = document.getElementById('chem-prompt');
    els.chemOptions = document.getElementById('chem-options');
    els.chemReveal = document.getElementById('chem-reveal');
    els.chemVerdict = document.getElementById('chem-verdict');
    els.chemNumbers = document.getElementById('chem-numbers');
    els.chemWhy = document.getElementById('chem-why');
    els.chemNextBtn = document.getElementById('chem-next-btn');
    els.chemFinal = document.getElementById('chem-final');
    els.chemFinalScore = document.getElementById('chem-final-score');
    els.chemComeback = document.getElementById('chem-comeback');
    els.chemShareBtn = document.getElementById('chem-share-btn');
    els.chemShareCopied = document.getElementById('chem-share-copied');
    els.chemAgainBtn = document.getElementById('chem-again-btn');
    els.chemMethodBtn = document.getElementById('chem-method-btn');

    // What-If Lab
    els.whatifBadgeA = document.getElementById('whatif-badge-a');
    els.whatifBadgeB = document.getElementById('whatif-badge-b');
    els.whatifAInput = document.getElementById('whatif-a-input');
    els.whatifASuggestions = document.getElementById('whatif-a-suggestions');
    els.whatifAFocusHint = document.getElementById('whatif-a-focus-hint');
    els.whatifBInput = document.getElementById('whatif-b-input');
    els.whatifBSuggestions = document.getElementById('whatif-b-suggestions');
    els.whatifBFocusHint = document.getElementById('whatif-b-focus-hint');
    els.whatifError = document.getElementById('whatif-error');
    els.whatifRandomizeBtn = document.getElementById('whatif-randomize-btn');
    els.whatifReport = document.getElementById('whatif-report');
    els.whatifReportEyebrow = document.getElementById('whatif-report-eyebrow');
    els.whatifComplementarityLine = document.getElementById('whatif-complementarity-line');
    els.whatifCoverageSummary = document.getElementById('whatif-coverage-summary');
    els.whatifCoverageChart = document.getElementById('whatif-coverage-chart');
    els.whatifCoverageSrSummary = document.getElementById('whatif-coverage-sr-summary');
    els.whatifLegendA = document.getElementById('whatif-legend-a');
    els.whatifLegendB = document.getElementById('whatif-legend-b');
    els.whatifFlags = document.getElementById('whatif-flags');
    els.whatifCourt = document.getElementById('whatif-court');
    els.whatifCourtSrSummary = document.getElementById('whatif-court-sr-summary');
    els.whatifAnalogLine = document.getElementById('whatif-analog-line');
    els.whatifShareBtn = document.getElementById('whatif-share-btn');
    els.whatifShareCopied = document.getElementById('whatif-share-copied');
    els.whatifChangeBtn = document.getElementById('whatif-change-btn');
    els.whatifMethodBtn = document.getElementById('whatif-method-btn');

    // The Pivot
    els.pivotSubDaily = document.getElementById('pivot-sub-daily');
    els.pivotSubFree = document.getElementById('pivot-sub-free');
    els.pivotPracticeBanner = document.getElementById('pivot-practice-banner');
    els.pivotEyebrow = document.getElementById('pivot-eyebrow');
    els.pivotRoundNum = document.getElementById('pivot-round-num');
    els.pivotScoreNum = document.getElementById('pivot-score-num');
    els.pivotStreakWrap = document.getElementById('pivot-streak-wrap');
    els.pivotStreakNum = document.getElementById('pivot-streak-num');
    els.pivotTeamLabel = document.getElementById('pivot-team-label');
    els.pivotCaptionBtn = document.getElementById('pivot-caption-btn');
    els.pivotRows = document.getElementById('pivot-rows');
    els.pivotVerdictWrap = document.getElementById('pivot-verdict-wrap');
    els.pivotVerdict = document.getElementById('pivot-verdict');
    els.pivotNextBtn = document.getElementById('pivot-next-btn');
    els.pivotFinal = document.getElementById('pivot-final');
    els.pivotFinalScore = document.getElementById('pivot-final-score');
    els.pivotComeback = document.getElementById('pivot-comeback');
    els.pivotShareBtn = document.getElementById('pivot-share-btn');
    els.pivotShareCopied = document.getElementById('pivot-share-copied');
    els.pivotAgainBtn = document.getElementById('pivot-again-btn');
    els.pivotMethodBtn = document.getElementById('pivot-method-btn');

    // Era Twin
    els.twinSubDaily = document.getElementById('twin-sub-daily');
    els.twinSubFree = document.getElementById('twin-sub-free');
    els.twinPracticeBanner = document.getElementById('twin-practice-banner');
    els.twinEyebrow = document.getElementById('twin-eyebrow');
    els.twinRoundNum = document.getElementById('twin-round-num');
    els.twinScoreNum = document.getElementById('twin-score-num');
    els.twinStreakWrap = document.getElementById('twin-streak-wrap');
    els.twinStreakNum = document.getElementById('twin-streak-num');
    els.twinAnchorName = document.getElementById('twin-anchor-name');
    els.twinAnchorDecadeChip = document.getElementById('twin-anchor-decade-chip');
    els.twinAnchorArchetypeChip = document.getElementById('twin-anchor-archetype-chip');
    els.twinAnchorMinibars = document.getElementById('twin-anchor-minibars');
    els.twinAttempts = document.getElementById('twin-attempts');
    els.twinInput = document.getElementById('twin-input');
    els.twinSuggestions = document.getElementById('twin-suggestions');
    els.twinFocusHint = document.getElementById('twin-focus-hint');
    els.twinGuesses = document.getElementById('twin-guesses');
    els.twinVerdictWrap = document.getElementById('twin-verdict-wrap');
    els.twinVerdict = document.getElementById('twin-verdict');
    els.twinRevealAnchorTitle = document.getElementById('twin-reveal-anchor-title');
    els.twinRevealAnchorBars = document.getElementById('twin-reveal-anchor-bars');
    els.twinRevealTwinTitle = document.getElementById('twin-reveal-twin-title');
    els.twinRevealTwinBars = document.getElementById('twin-reveal-twin-bars');
    els.twinRevealSimilarity = document.getElementById('twin-reveal-similarity');
    els.twinNextBtn = document.getElementById('twin-next-btn');
    els.twinFinal = document.getElementById('twin-final');
    els.twinFinalScore = document.getElementById('twin-final-score');
    els.twinComeback = document.getElementById('twin-comeback');
    els.twinShareBtn = document.getElementById('twin-share-btn');
    els.twinShareCopied = document.getElementById('twin-share-copied');
    els.twinAgainBtn = document.getElementById('twin-again-btn');
    els.twinMethodBtn = document.getElementById('twin-method-btn');

    // Stats modal (Chemistry, The Pivot, Era Twin)
    els.statsChemGrid = document.getElementById('stats-chem-grid');
    els.statsPivotGrid = document.getElementById('stats-pivot-grid');
    els.statsTwinGrid = document.getElementById('stats-twin-grid');
  }

  // ---------------------------------------------------------------------
  // M0: Daily vs Free Play (Chimera) — the mode switch is the trust rule.
  // Every render below reads the active target/record through TARGET /
  // todayRecord(), so switching sub-modes never touches the other's state.
  // ---------------------------------------------------------------------

  // Free Play (Chimera) = Build-a-Chimera: the player picks both donors
  // themselves before any guessing happens. PRACTICE_STAGE gates which UI
  // shows: 'pick' = the donor-picker card; 'playing' = the normal
  // prompt/guess/warmth/result flow (same code path Daily uses).
  var PRACTICE_STAGE = 'pick';
  var donorPick = { stats: null, shooting: null };

  function showPickerStage() {
    els.pickerCard.hidden = false;
    els.promptCard.hidden = true;
    els.guessbarCard.hidden = true;
    if (els.donorSlotsRow) els.donorSlotsRow.hidden = true;
    els.warmthCard.hidden = true;
    els.resultCard.hidden = true;
    els.revealCard.hidden = true;
    els.chimeraPracticeBanner.hidden = true; // the picker card carries its own instructions
    if (els.chimeraUtilityRow) els.chimeraUtilityRow.hidden = true;
  }

  function showPlayingStage() {
    els.pickerCard.hidden = true;
    els.promptCard.hidden = false;
    els.guessbarCard.hidden = false;
    els.chimeraPracticeBanner.hidden = activeChimeraMode !== 'practice';
    if (els.chimeraUtilityRow) els.chimeraUtilityRow.hidden = false;
    // warmth/result/reveal visibility is decided per-render by renderGuesses()
  }

  function ensurePracticeTarget() {
    if (!PRACTICE_TARGET) {
      PRACTICE_TARGET = buildPracticeTarget();
      PRACTICE_REC = freshDayRecord(3);
    }
  }

  function refreshChimeraView() {
    if (activeChimeraMode === 'practice' && PRACTICE_STAGE === 'pick'
        && !PRACTICE_TARGET) {
      // Build-a-Chimera entry: the player picks both donors first.
      showPickerStage();
      return;
    }
    if (activeChimeraMode === 'practice') ensurePracticeTarget();
    showPlayingStage();
    TARGET = activeChimeraMode === 'practice' ? PRACTICE_TARGET : DAILY_TARGET;
    renderPrompt();
    renderScoutingLine();
    renderGuesses();
    if (todayRecord().done) updateSlotInputAvailability(); else resetAllSlotInputs();
    renderMapOnce();
    checkRollover();
  }

  function switchChimeraSubMode(mode) {
    if (mode === activeChimeraMode) return;
    activeChimeraMode = mode;
    equationForceExpand = false;
    resetClueForceExpand();
    if (mode === 'practice') ensurePracticeTarget();
    els.chimeraSubDaily.classList.toggle('is-active', mode === 'daily');
    els.chimeraSubPractice.classList.toggle('is-active', mode === 'practice');
    els.chimeraSubDaily.setAttribute('aria-selected', String(mode === 'daily'));
    els.chimeraSubPractice.setAttribute('aria-selected', String(mode === 'practice'));
    refreshChimeraView();
  }

  function resetDonorPickerUI() {
    donorPick.stats = null;
    donorPick.shooting = null;
    if (els.pickerBadgeStats) els.pickerBadgeStats.hidden = true;
    if (els.pickerBadgeShooting) els.pickerBadgeShooting.hidden = true;
    if (els.pickerStatsInput) els.pickerStatsInput.value = '';
    if (els.pickerShootingInput) els.pickerShootingInput.value = '';
    hidePickerError();
  }

  function showPickerError(msg) {
    if (!els.pickerError) return;
    els.pickerError.textContent = msg;
    els.pickerError.hidden = false;
  }

  function hidePickerError() {
    if (!els.pickerError) return;
    els.pickerError.hidden = true;
    els.pickerError.textContent = '';
  }

  // Once both donors are picked (manually or via Randomize), the blend is
  // built automatically — no separate "Build" button to click.
  function maybeBuildPracticeChimera() {
    if (!donorPick.stats || !donorPick.shooting) return;
    if (donorPick.stats.id === donorPick.shooting.id) {
      showPickerError('Pick two different player-seasons for the two donors.');
      return;
    }
    PRACTICE_TARGET = buildTargetFromPlayers(donorPick.stats, donorPick.shooting);
    PRACTICE_REC = freshDayRecord(3);
    PRACTICE_STAGE = 'playing';
    equationForceExpand = false;
    resetClueForceExpand();
    resetDonorPickerUI();
    refreshChimeraView();
    track('vh-start', { mode: 'free' });
  }

  function setDonorPick(slot, player) {
    donorPick[slot] = player;
    var badge = slot === 'stats' ? els.pickerBadgeStats : els.pickerBadgeShooting;
    if (badge) badge.hidden = false;
    hidePickerError();
    maybeBuildPracticeChimera();
  }

  // Randomize: seeded-random fills BOTH picker slots at once (same distinct/
  // low-overlap constraint the Daily target uses), then auto-builds.
  function randomizeDonorPicks() {
    var rng = seededRng('vector-hoops:practice:' + randomNonce());
    var players = DATA.players;
    var a, b, tries = 0;
    do {
      a = players[Math.floor(rng() * players.length)];
      b = players[Math.floor(rng() * players.length)];
      tries++;
    } while (tries < 2000 && (a === b || cosineSim(a.v, b.v) >= 0.3));
    if (els.pickerStatsInput) els.pickerStatsInput.value = playerKey(a);
    if (els.pickerShootingInput) els.pickerShootingInput.value = playerKey(b);
    setDonorPick('stats', a);
    setDonorPick('shooting', b);
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
    var anyGuessMade = !!rec.s1 || !!rec.s2 || rec.mashupGuesses.length > 0;
    var collapsed = anyGuessMade && !equationForceExpand;
    els.equationRow.hidden = collapsed;
    els.equationChip.hidden = !collapsed;
    if (collapsed && els.equationChipText) {
      var isPractice = activeChimeraMode === 'practice';
      var aLabel = isPractice || rec.slots.stats.locked ? TARGET.a.name : '?';
      var bLabel = isPractice || rec.slots.archetype.locked ? TARGET.b.name : '?';
      var mLabel = rec.slots.mashup.locked ? rec.slots.mashup.name : '?';
      els.equationChipText.textContent = aLabel + ' + ' + bLabel + ' = ' + mLabel;
    }
  }

  function setupEquationChip() {
    els.equationChip.addEventListener('click', function () {
      equationForceExpand = true;
      renderEquationCollapse();
    });
  }

  function setupChimeraSubtabs() {
    els.chimeraSubDaily.addEventListener('click', function () { switchChimeraSubMode('daily'); });
    els.chimeraSubPractice.addEventListener('click', function () { switchChimeraSubMode('practice'); });
    // "Change donors" (visible once a Build-a-Chimera round is underway):
    // back to the picker, discarding the current blend.
    els.chimeraNewBtn.addEventListener('click', function () {
      PRACTICE_TARGET = null;
      PRACTICE_REC = null;
      PRACTICE_STAGE = 'pick';
      donorPick.stats = null;
      donorPick.shooting = null;
      equationForceExpand = false;
      resetClueForceExpand();
      refreshChimeraView();
      track('vh-start', { mode: 'free' });
    });
  }

  // One helper wires all three answer slots identically — Mashup (shared by
  // Daily + Free Play) plus the two Daily-only donor slots.
  function setupSlotAutocomplete(slotKey, inputEl, suggEl, submitEl, hintEl) {
    if (!inputEl || !suggEl || !submitEl) return;
    createAutocomplete(inputEl, suggEl, DATA.players, function (p) {
      pendingSelections[slotKey] = p;
      submitEl.disabled = false;
    }, { hintEl: hintEl });
    inputEl.addEventListener('input', function () {
      pendingSelections[slotKey] = null;
      submitEl.disabled = true;
      hideDuplicateWarning();
    });
    submitEl.addEventListener('click', function () {
      if (slotKey === 'mashup') submitMashupGuess();
      else submitStageGuess(slotKey);
    });
    inputEl.disabled = false;
  }

  function setupChimeraInputs() {
    setupSlotAutocomplete('mashup', els.chimeraInput, els.chimeraSuggestions, els.chimeraSubmit, els.chimeraFocusHint);
    setupSlotAutocomplete('stats', els.chimeraStatsInput, els.chimeraStatsSuggestions, els.chimeraStatsSubmit, els.chimeraStatsFocusHint);
    setupSlotAutocomplete('archetype', els.chimeraArchetypeInput, els.chimeraArchetypeSuggestions, els.chimeraArchetypeSubmit, els.chimeraArchetypeFocusHint);
  }

  function setupPickerInputs() {
    createAutocomplete(els.pickerStatsInput, els.pickerStatsSuggestions, DATA.players, function (p) {
      setDonorPick('stats', p);
    }, { hintEl: els.pickerStatsFocusHint });
    createAutocomplete(els.pickerShootingInput, els.pickerShootingSuggestions, DATA.players, function (p) {
      setDonorPick('shooting', p);
    }, { hintEl: els.pickerShootingFocusHint });
    els.pickerStatsInput.disabled = false;
    els.pickerShootingInput.disabled = false;
    els.pickerRandomizeBtn.disabled = false;
    els.pickerRandomizeBtn.addEventListener('click', randomizeDonorPicks);
  }

  function resumeChimeraIfDone() {
    updateSlotInputAvailability();
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
    setupClueZones();
    setupClueCardTools();
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
        if (shouldShowDailyResetNote() && els.resetNote) {
          els.resetNote.hidden = false;
          els.resetNote.textContent = 'Vector Hoops leveled up: Chimera is now a STAGED reveal with ' +
            'scoring multipliers — one guess each for the Stats Player and the Style Player (always ' +
            'resolves, right or wrong, and earns a multiplier), then up to ' + MAX_MASHUP_GUESSES +
            ' guesses for the Mashup. FINAL score = mashup base points × both multipliers, posted to ' +
            'the leaderboard whether you solve it or not. Today’s puzzle restarted once under the new ' +
            'rules — your streak and history carried over.';
          markDailyResetNoteSeen();
        }
        PRACTICE_STATS = loadPracticeStats();
        DEADLINE_STATE = loadDeadlineDailyState();
        FADER_STATE = loadFaderDailyState();
        FADER_PRACTICE_STATS = loadFaderPracticeStats();
        ARC_STATE = loadArcDailyState();
        ARC_PRACTICE_STATS = loadArcPracticeStats();
        ARC_INDEX = buildArcIndex();
        CHEM_STATE = loadChemDailyState();
        CHEM_PRACTICE_STATS = loadChemPracticeStats();
        PIVOT_STATE = loadPivotDailyState();
        PIVOT_PRACTICE_STATS = loadPivotPracticeStats();
        TWIN_STATE = loadTwinDailyState();
        TWIN_PRACTICE_STATS = loadTwinPracticeStats();
        buildPlayerLookups();

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
        setupPickerInputs();
        setupShare();

        setupMapInteraction();
        setupModeTabs();
        renderGuesses();
        resumeChimeraIfDone();
        maybeApplyChallenge();

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
            maybeApplyChallenge();
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
            maybeApplyChallenge();
          })
          .catch(function () {
            els.tabFader.disabled = true;
            els.tabFader.setAttribute('aria-disabled', 'true');
          });

        fetch(CHEMISTRY_URL)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (cj) {
            CHEMISTRY = cj;
            CHEM_POOL = cj.pairs || [];
            setupChem();
            maybeApplyChallenge();
          })
          .catch(function () {
            els.tabChem.disabled = true;
            els.tabChem.setAttribute('aria-disabled', 'true');
          });

        fetch(PIVOTS_URL)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (pj) {
            PIVOTS = pj;
            PIVOT_POOL = pj.teams || [];
            setupPivot();
            maybeApplyChallenge();
          })
          .catch(function () {
            els.tabPivot.disabled = true;
            els.tabPivot.setAttribute('aria-disabled', 'true');
          });

        fetch(ERATWINS_URL)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function (tj) {
            TWINS = tj;
            TWIN_POOL = tj.players || [];
            setupTwin();
            maybeApplyChallenge();
          })
          .catch(function () {
            els.tabTwin.disabled = true;
            els.tabTwin.setAttribute('aria-disabled', 'true');
          });

        if (!todayRecord().s1 && !todayRecord().done) {
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
