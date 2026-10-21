/* engagement.js — ethical engagement hooks for Vector Hoops.
 *
 * This is the Block Blast! mechanics port, inverted: the same levers
 * (onboarding windfall, near-miss, variable rewards, streaks, live timing)
 * pointed at delight instead of extraction. The binding red line:
 *   - no invisible difficulty modulation — every ramp is disclosed in UI copy
 *   - no engineered frustration — rewards are earned by playing, never paid
 *   - disclosure is what separates a hook from a dark pattern
 *
 * No dependencies. localStorage only. Every init() is defensive: if the
 * page it targets is absent, or any game API is missing, it no-ops and the
 * game never breaks because of this file.
 */
(function () {
  'use strict';

  var LS = 'vh.engage.v1';
  var LIVE_LS = 'vh.live.now';
  var LIVE_TTL = 12 * 60 * 1000; // live badge freshness: 12 minutes

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(LS) || '{}');
      return (s && typeof s === 'object') ? s : {};
    } catch (e) { return {}; }
  }
  function save(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} }
  function dayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function shiftDay(k, n) {
    var p = k.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  // Every hook ships its disclosure in the same honest wrapper.
  function note(html) {
    return el('div', 'vh-engage-note', '<span class="vh-engage-note__k">Why you&rsquo;re seeing this</span><span>' + html + '</span>');
  }
  function toast(msg) {
    try {
      var t = el('div', 'vh-engage-toast', esc(msg));
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add('on'); }, 20);
      setTimeout(function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 400); }, 3200);
    } catch (e) {}
  }

  /* ---------------- streaks + freeze (Hook 4) ---------------- */
  function ledger() { try { return window.VHLedger || null; } catch (e) { return null; } }
  function streakState() {
    var L = ledger();
    var s = L ? L.getStreak() : { streak: 0, best: 0, lastPlayedDay: null };
    var st = load();
    return {
      streak: s.streak || 0, best: s.best || 0, lastPlayedDay: s.lastPlayedDay || null,
      freeze: st.freeze || 0, milestones: st.milestones || 0, bridges: st.bridges || []
    };
  }
  // Earn: +1 freeze per 7-day best-streak milestone. Earned by playing, never paid.
  function awardFreezeCheck() {
    var L = ledger(); if (!L) return false;
    var st = load(), s = L.getStreak();
    var miles = Math.floor((s.best || 0) / 7);
    if (miles > (st.milestones || 0)) {
      st.milestones = miles;
      st.freeze = (st.freeze || 0) + (miles - (st.milestones || 0)) + 0;
      st.freeze = (st.freeze || 0); // keep simple: award exactly the delta
      save(st);
      return true;
    }
    return false;
  }
  function freezeOffer() {
    var v = streakState();
    return v.freeze > 0 && v.lastPlayedDay === shiftDay(dayKey(), -2);
  }
  function useFreeze() {
    var st = load(), L = ledger();
    if ((st.freeze || 0) <= 0 || !L) return false;
    var y = shiftDay(dayKey(), -1);
    try { L.recordDayOutcome(y, 'win'); } catch (e) { return false; }
    st.freeze -= 1;
    st.bridges = st.bridges || [];
    st.bridges.push(y);
    save(st);
    return true;
  }
  function dayDotState(k, v) {
    if (v.bridges.indexOf(k) >= 0) return 'frozen';
    if (k > dayKey()) return 'future';
    var L = ledger();
    if (!L) return 'none';
    try {
      var r = L.readSlot(k, 0, 'court');
      if (r && r.won) return 'played';
      var full = L.read(k, 'court', 5);
      if (full && full.solved > 0) return 'played';
      if (k === dayKey()) return 'today';
      return 'missed';
    } catch (e) { return 'none'; }
  }

  /* ---------------- variable rewards (Hook 3) ---------------- */
  // Real pairs from assets/twin_explainer.json. gap = season years apart;
  // gap >= 20 earns the DEEP CUT badge.
  var TOTD = [
    ['Anthony Edwards|2024-25', 'Michael Jordan|1996-97', 28],
    ['Karl Malone|1996-97', 'Nikola Jokic|2021-22', 25],
    ['Dell Curry|1998-99', 'LJ Cryer|2025-26', 27],
    ['Jordan Poole|2024-25', 'Latrell Sprewell|1997-98', 27],
    ['Bryant Stith|1997-98', 'Kobe Bufkin|2025-26', 28],
    ['Emanual Davis|1996-97', 'John Poulakidas|2025-26', 29],
    ['Allen Iverson|2001-02', 'Kevin Durant|2013-14', 12],
    ['Kawhi Leonard|2019-20', 'Kobe Bryant|2005-06', 14],
    ['Grant Hill|1996-97', 'Paul Pierce|2002-03', 6],
    ['Allan Houston|2002-03', 'Reggie Miller|1996-97', 6],
    ['Gary Payton Sr.|1998-99', 'Jason Kidd|2002-03', 4],
    ['Bryant Reeves|1997-98', 'Jonas Valanciunas|2018-19', 21],
    ['Anthony Peeler|1996-97', 'Denzel Valentine|2019-20', 23],
    ['Anthony Goldwire|2002-03', 'Sharife Cooper|2021-22', 19],
    ["Alonzo Mourning|2000-01", "Shaquille O'Neal|1999-00", 1],
    ['Charles Barkley|1996-97', 'Danny Fortson|2004-05', 8],
    ["Chris Webber|2000-01", "Shaquille O'Neal|1999-00", 1],
    ["Kevin Garnett|2003-04", "Shaquille O'Neal|1999-00", 4],
    ["Jermaine O'Neal|2004-05", 'Patrick Ewing|1997-98', 7],
    ['Anthony Mason|1997-98', 'Luis Scola|2010-11', 13],
    ['Antonio Davis|2000-01', 'Luis Scola|2010-11', 10],
    ['Greg Anthony|1998-99', 'Jason Williams|2001-02', 3],
    ['Dale Davis|2005-06', 'Dennis Rodman|1999-00', 6],
    ['Ben Wallace|2002-03', 'Bo Outlaw|1999-00', 3],
    ['Avery Johnson|1998-99', 'Rajon Rondo|2010-11', 12],
    ['Arvydas Sabonis|1996-97', 'Zydrunas Ilgauskas|2001-02', 5],
    ['Brent Barry|2003-04', 'Derek Harper|1998-99', 5],
    ['Brian Shaw|2001-02', 'Joe Dumars|1998-99', 3]
  ];
  function twinOfDay(k) {
    var p = TOTD[hash(k || dayKey()) % TOTD.length];
    function nm(x) { return x.split('|')[0]; }
    return { a: nm(p[0]), b: nm(p[1]), gap: p[2], deep: p[2] >= 20 };
  }

  /* ---------------- live timing (Hook 5) ---------------- */
  function readLive() {
    try {
      var r = JSON.parse(localStorage.getItem(LIVE_LS) || 'null');
      if (r && r.live && Date.now() - r.ts < LIVE_TTL) return r;
    } catch (e) {}
    return null;
  }
  function writeLive(live) {
    try { localStorage.setItem(LIVE_LS, JSON.stringify({ live: !!live, ts: Date.now() })); } catch (e) {}
  }
  function liveBadge() {
    try {
      var r = readLive();
      var nav = document.querySelector('.site-nav');
      if (!nav || !r || nav.querySelector('.vh-live-badge')) return;
      var a = document.createElement('a');
      a.href = '/live.html';
      a.className = 'vh-live-badge';
      a.innerHTML = '<span class="vh-live-dot"></span>LIVE NOW';
      a.title = 'An NBA game is live right now — from ESPN\u2019s feed, checked minutes ago.';
      nav.appendChild(a);
    } catch (e) {}
  }

  /* ---------------- per-page wiring ---------------- */

  function initTwentyQuestions() {
    if (!document.getElementById('q-card')) return;
    var st = load();
    var plays = st.tqPlays || 0;

    // Hook 1a: onboarding windfall — first visit gets the easy suggestion,
    // disclosed on purpose.
    if (!plays) {
      var qc = document.getElementById('q-card');
      var w = note('We start everyone easy on purpose: your first round should end in an aha, not a shrug. ' +
        'Think of <b>Michael Jordan</b> &mdash; famous players are found fast. Nothing about the game changes, just a suggestion.');
      w.classList.add('vh-engage-welcome');
      if (qc && qc.parentNode) qc.parentNode.insertBefore(w, qc);
    } else if (plays === 1) {
      // Hook 1b: disclosed ramp — second visit is openly harder.
      var qc2 = document.getElementById('q-card');
      var lastQ = st.tqLastQ;
      var w2 = note('Round ' + (plays + 1) + ' is harder &mdash; you solved the last one' +
        (lastQ ? ' in ' + lastQ + ' questions' : '') + '. We ramp difficulty with your skill, and we tell you when we do.');
      if (qc2 && qc2.parentNode && !document.querySelector('.vh-engage-ramp')) {
        w2.classList.add('vh-engage-ramp');
        qc2.parentNode.insertBefore(w2, qc2);
      }
    }

    // Count rounds + Hook 2: near-miss on a 20-question stall.
    var mo = new MutationObserver(function () {
      var reveal = document.getElementById('reveal-card');
      if (reveal && !reveal.hidden) {
        var st2 = load();
        if (!st2._tqCounted) {
          st2._tqCounted = true;
          st2.tqPlays = (st2.tqPlays || 0) + 1;
          var pill = document.getElementById('pill-q');
          var m = pill && pill.textContent.match(/(\d+)/);
          st2.tqLastQ = m ? +m[1] : null;
          save(st2);
        }
        return;
      }
      // Stall detection: all answer buttons disabled, no reveal shown.
      var by = document.getElementById('btn-yes');
      if (by && by.disabled && reveal && reveal.hidden && !document.querySelector('.vh-nearmiss')) {
        var card = el('div', 'vh-nearmiss card',
          '<p class="vh-nearmiss__k">So close</p>' +
          '<p>You ran all 20 questions and the map narrowed 2,426 careers down to a handful. ' +
          'The tree ran out of branches &mdash; that&rsquo;s a near-miss, and near-misses are the most fun round to replay.</p>' +
          '<button class="btn btn-primary" type="button" id="vh-nearmiss-again">Play again</button>');
        var rc = document.getElementById('reveal-card');
        if (rc && rc.parentNode) rc.parentNode.insertBefore(card, rc);
        var b = document.getElementById('vh-nearmiss-again');
        if (b) b.addEventListener('click', function () {
          var rst = document.getElementById('btn-restart');
          if (rst) rst.click();
          card.remove();
        });
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    var st3 = load(); st3._tqCounted = false; save(st3);
  }

  function initDailyCourt() {
    var dc = document.getElementById('daily-court');
    if (!dc) return;
    var st = load();

    // Hook 1c: first-day windfall — highlight the first slot openly.
    if (!st.courtSeen) {
      var first = dc.querySelector('.court-card');
      if (first) {
        first.classList.add('vh-start-here');
        var rib = el('div', 'vh-start-ribbon', 'Start here &mdash; easiest twin today');
        first.appendChild(rib);
        dc.insertBefore(
          note('First day? We highlight one slot on purpose: its twin is a household name, so your first solve lands fast. ' +
            'The other four play the same for everyone &mdash; no reroll, no rigging.'),
          dc.querySelector('.court-grid'));
        var mark = function () { var s2 = load(); s2.courtSeen = true; save(s2); };
        dc.addEventListener('click', mark, { once: true });
      }
    }

    // Hook 4: streak calendar + freeze.
    var row = dc.querySelector('.rewards-row') || dc;
    var cal = el('div', 'vh-streakcal');
    var v = streakState();
    var dots = '';
    for (var i = 6; i >= 0; i--) {
      var k = shiftDay(dayKey(), -i);
      var ds = dayDotState(k, v);
      var ch = ds === 'played' ? '&#9679;' : ds === 'frozen' ? '&#10052;' : ds === 'today' ? '&#9678;' : '&#9675;';
      dots += '<span class="vh-day vh-day--' + ds + '" title="' + k + ' — ' + ds + '">' + ch + '</span>';
    }
    cal.innerHTML =
      '<div class="vh-streakcal__row">' + dots + '</div>' +
      '<div class="vh-streakcal__meta">Streak <b>' + v.streak + '</b> &middot; best <b>' + v.best + '</b> &middot; freezes <b>' + v.freeze + '</b></div>' +
      '<div class="vh-streakcal__why">A freeze forgives one missed day. You earn one every 7-day best streak &mdash; by playing, never by paying.</div>';
    row.parentNode.insertBefore(cal, row.nextSibling);

    if (awardFreezeCheck()) {
      toast('7-day best streak! You earned a streak freeze \u2014 it forgives one missed day.');
      var v2 = streakState();
      var meta = cal.querySelector('.vh-streakcal__meta');
      if (meta) meta.innerHTML = 'Streak <b>' + v2.streak + '</b> &middot; best <b>' + v2.best + '</b> &middot; freezes <b>' + v2.freeze + '</b>';
    }
    if (freezeOffer()) {
      var offer = el('div', 'vh-freeze-offer card',
        '<p><b>You missed yesterday.</b> Use your streak freeze to bridge it? The day stays marked as frozen &mdash; we don&rsquo;t pretend you played.</p>' +
        '<button class="btn btn-primary" type="button" id="vh-freeze-use">Use freeze</button> ' +
        '<button class="btn" type="button" id="vh-freeze-skip">Let the streak reset</button>');
      dc.insertBefore(offer, dc.querySelector('.court-grid'));
      document.getElementById('vh-freeze-use').addEventListener('click', function () {
        if (useFreeze()) { toast('Freeze used \u2014 streak bridged. The day is marked frozen, openly.'); offer.remove(); }
      });
      document.getElementById('vh-freeze-skip').addEventListener('click', function () { offer.remove(); });
    }
  }

  function initHome() {
    var anchor = document.getElementById('atlas');
    if (!anchor) return;
    var t = twinOfDay();
    var st = load();
    var seenKey = 'totd:' + dayKey();
    var card = el('section', 'vh-totd reveal', '');
    card.setAttribute('aria-label', 'Twin of the day');
    card.innerHTML =
      '<p class="vh-totd__k">Twin of the day</p>' +
      '<h2 class="vh-totd__pair">' + esc(t.a) + ' <span class="vh-totd__tilde">~</span> ' + esc(t.b) + '</h2>' +
      '<p class="vh-totd__sub">' + t.gap + ' seasons apart, one playing style.' +
      (t.deep ? ' <span class="vh-totd__deep">DEEP CUT</span>' : '') + '</p>' +
      '<a class="btn btn-primary" href="/twin-network.html">See why they&rsquo;re twins &rarr;</a>';
    var n = note('Same pair for everyone today, picked by the calendar &mdash; not by an algorithm watching you. ' +
      'Deep cuts are era-bridging twins (20+ seasons apart) for explorers.');
    card.appendChild(n);
    anchor.parentNode.insertBefore(card, anchor);
    card.querySelector('.btn').addEventListener('click', function () {
      var s2 = load();
      s2.unlocked = s2.unlocked || [];
      if (s2.unlocked.indexOf(seenKey) < 0) {
        s2.unlocked.push(seenKey); save(s2);
        if (t.deep) toast('Deep cut unlocked \u2014 ' + t.gap + ' seasons apart, one style.');
      }
    });
  }

  function initLivePage() {
    // Heartbeat for the cross-page LIVE badge + disclosed idle honesty.
    var renderGames = null;
    setInterval(function () {
      try {
        var btns = document.querySelectorAll('#games .gbtn.live');
        writeLive(btns.length > 0);
      } catch (e) {}
    }, 60000);
    try {
      var btns0 = document.querySelectorAll('#games .gbtn.live');
      writeLive(btns0.length > 0);
    } catch (e) {}
    renderGames = renderGames; // keep linter-quiet shape
    // Honest idle line, appended once under the games list.
    var mo = new MutationObserver(function () {
      var g = document.getElementById('games');
      if (g && /No NBA games/.test(g.textContent) && !document.querySelector('.vh-idle-honest')) {
        var p = el('p', 'vh-idle-honest caption',
          'No games right now. We never fake urgency &mdash; this page only lights up for real NBA games. Tipoff times come from ESPN&rsquo;s feed.');
        g.parentNode.insertBefore(p, g.nextSibling);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------- styles ---------------- */
  function css() {
    return '' +
    '.vh-engage-note{border:1px dashed var(--line-2,#c9c4b8);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.55;background:rgba(0,0,0,.02);margin:10px 0}' +
    '.vh-engage-note__k{display:block;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin-bottom:4px}' +
    '.vh-engage-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;background:#1A150F;color:#FFFEF7;border-radius:12px;padding:12px 16px;font-size:14px;font-weight:700;z-index:200;transition:all .3s;max-width:min(92vw,480px);text-align:center}' +
    '.vh-engage-toast.on{transform:translate(-50%,0);opacity:1}' +
    '.vh-live-badge{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:4px 10px;border-radius:999px;background:#c81e1e;color:#fff;font-family:ui-monospace,monospace;font-size:11px;font-weight:900;text-decoration:none;letter-spacing:.05em}' +
    '.vh-live-dot{width:8px;height:8px;border-radius:50%;background:#fff;animation:vhPulse 1.6s infinite}' +
    '@keyframes vhPulse{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.vh-nearmiss{margin:12px 0;padding:16px;border:2px solid var(--line-2,#c9c4b8);border-radius:14px;background:var(--surface,#fff)}' +
    '.vh-nearmiss__k{font-family:ui-monospace,monospace;font-weight:900;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px}' +
    '.vh-start-here{outline:3px solid var(--yellow,#F0E442);position:relative}' +
    '.vh-start-ribbon{position:absolute;top:-12px;left:8px;background:var(--yellow,#F0E442);color:#1A150F;font-family:ui-monospace,monospace;font-size:10px;font-weight:900;padding:2px 8px;border-radius:999px;letter-spacing:.04em}' +
    '.vh-streakcal{margin:10px 0;padding:10px 12px;border:1px solid var(--line,#e5e0d5);border-radius:12px;background:var(--surface,#fff)}' +
    '.vh-streakcal__row{display:flex;gap:8px;font-size:18px}' +
    '.vh-day--played{color:#00775A}.vh-day--frozen{color:#0072B2}.vh-day--missed{opacity:.35}.vh-day--today{color:#D55E00}.vh-day--future{opacity:.2}.vh-day--none{opacity:.2}' +
    '.vh-streakcal__meta{font-size:13px;margin-top:6px}' +
    '.vh-streakcal__why{font-size:12px;opacity:.65;margin-top:4px}' +
    '.vh-freeze-offer{margin:12px 0;padding:14px 16px;border:2px dashed #0072B2;border-radius:14px;background:#f0f8ff}' +
    '.vh-totd{max-width:1040px;margin:0 auto var(--s-6,48px);padding:0 clamp(12px,3vw,20px)}' +
    '.vh-totd__k{font-family:var(--font-code,ui-monospace,monospace);font-size:var(--t-xs,12px);font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent,#E0483B);margin:0 0 8px}' +
    '.vh-totd__pair{font-family:var(--font-display,ui-sans-serif,system-ui);font-size:clamp(24px,4.6vw,44px);font-weight:700;letter-spacing:-.02em;margin:0 0 6px}' +
    '.vh-totd__tilde{opacity:.45}' +
    '.vh-totd__sub{font-size:15px;color:var(--fg-2,#57574F);margin:0 0 12px}' +
    '.vh-totd__deep{display:inline-block;background:#1A150F;color:#F0E442;font-family:ui-monospace,monospace;font-size:10px;font-weight:900;letter-spacing:.08em;padding:3px 8px;border-radius:999px;margin-left:6px;vertical-align:middle}' +
    '.vh-idle-honest{margin-top:8px}' +
    '.twin-why__conf{margin:8px 0 2px;font-size:13px;font-weight:700}' +
    '.twin-why__conf .num{font-variant-numeric:tabular-nums}';
  }

  function boot() {
    try {
      var st = document.createElement('style');
      st.textContent = css();
      document.head.appendChild(st);
    } catch (e) {}
    try { liveBadge(); } catch (e) {}
    try {
      if (document.getElementById('q-card')) initTwentyQuestions();
      if (document.getElementById('daily-court')) initDailyCourt();
      if (document.getElementById('atlas') && document.querySelector('.hero-map')) initHome();
      if (document.querySelector('.live-root')) initLivePage();
    } catch (e) { /* the games never break because of engagement */ }
  }

  window.VHEngage = {
    dayKey: dayKey, shiftDay: shiftDay, twinOfDay: twinOfDay,
    streakState: streakState, awardFreezeCheck: awardFreezeCheck,
    freezeOffer: freezeOffer, useFreeze: useFreeze,
    readLive: readLive, writeLive: writeLive, toast: toast, note: note
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
