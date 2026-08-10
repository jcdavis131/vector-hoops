/* Vector Hoops — assets/leaderboard.js
 *
 * Two things live in this one file:
 *
 *   1. window.VHIdentity — a deterministic, fun anonymous handle derived
 *      from the existing localStorage vectorHoops.userRef (the same ref
 *      game.js already mints for telemetry). Shared by:
 *        - play.html / game.js: the "you play as {name}" header chip and
 *          the fire-and-forget leaderboard score submissions.
 *        - leaderboard.html (below): highlighting your own row.
 *
 *   2. The leaderboard.html page controller — game switcher, date nav
 *      (today back to 7 days), and the board table itself, all backed by
 *      GET /api/leaderboard (a same-origin proxy; see api/leaderboard.js).
 *      This half no-ops on any page that doesn't carry the board markup
 *      (e.g. play.html, which loads this file only for VHIdentity).
 *
 * Load BEFORE assets/game.js wherever both are present — game.js reads
 * window.VHIdentity synchronously when rendering the chip and submitting
 * scores.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // 1. Identity
  // ---------------------------------------------------------------------

  var LS_KEY_USER_REF = 'vectorHoops.userRef';
  var LS_KEY_SESSION_NAME = 'vectorHoops.sessionName';

  // Same xmur3 string-hash game.js uses for puzzle seeding, reproduced here
  // so this file has no load-order dependency on game.js.
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

  // 24 basketball-flavored adjectives x 24 animals (a few real NBA-mascot
  // species mixed with generic ones) -> 24*24*90 = ~52k distinct handles.
  var ADJECTIVES = [
    'Clutch', 'Baseline', 'Corner', 'Midrange', 'Fastbreak', 'Buzzer',
    'Crossover', 'Backdoor', 'Fadeaway', 'Transition', 'Hustle', 'Deadeye',
    'Sharpshooting', 'Fullcourt', 'Alleyoop', 'Pickup', 'Airborne',
    'Rimrattling', 'Doubleteam', 'Zone', 'Iso', 'Overtime', 'Bankshot',
    'Freethrow'
  ];

  var ANIMALS = [
    'Hawk', 'Bull', 'Raptor', 'Grizzly', 'Buck', 'Wolf', 'Pelican',
    'Badger', 'Falcon', 'Panther', 'Stallion', 'Hornet', 'Jaguar',
    'Cougar', 'Eagle', 'Bison', 'Lynx', 'Otter', 'Fox', 'Bear', 'Ram',
    'Viper', 'Gazelle', 'Condor'
  ];

  function getUserRef() {
    var ref = null;
    try { ref = localStorage.getItem(LS_KEY_USER_REF); } catch (e) { ref = null; }
    if (!ref) {
      ref = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      try { localStorage.setItem(LS_KEY_USER_REF, ref); } catch (e) { /* storage unavailable */ }
    }
    return ref;
  }

  function nameFromRef(ref) {
    var seedFn = xmur3('vh-identity:' + ref);
    var a = seedFn() % ADJECTIVES.length;
    var b = seedFn() % ANIMALS.length;
    var n = 10 + (seedFn() % 90); // two digits, 10-99
    return ADJECTIVES[a] + ' ' + ANIMALS[b] + ' ' + n;
  }

  function sessionName() {
    var cached = null;
    try { cached = localStorage.getItem(LS_KEY_SESSION_NAME); } catch (e) { cached = null; }
    if (cached) return cached;
    var name = nameFromRef(getUserRef());
    try { localStorage.setItem(LS_KEY_SESSION_NAME, name); } catch (e) { /* storage unavailable */ }
    return name;
  }

  global.VHIdentity = {
    getUserRef: getUserRef,
    sessionName: sessionName
  };

  // Auto-render the "you play as" chip wherever #identity-name exists
  // (play.html header, leaderboard.html intro line) — a no-op elsewhere.
  function renderIdentityChip() {
    var el = document.getElementById('identity-name');
    if (el) el.textContent = sessionName();
  }

  // ---------------------------------------------------------------------
  // 2. Leaderboard page controller
  // ---------------------------------------------------------------------

  var GAMES = [
    { id: 'chimera', label: 'Chimera', icon: '🧬', unit: 'pts' },
    { id: 'deadline', label: 'Deadline', icon: '📉', unit: 'score' },
    { id: 'fader', label: 'Fader', icon: '🌡️', unit: 'score' },
    { id: 'arc', label: 'Arc', icon: '📈', unit: 'score' },
    { id: 'pivot', label: 'Pivot', icon: '🔀', unit: 'score' },
    { id: 'eratwin', label: 'Twin', icon: '👥', unit: 'score' }
  ];
  var MAX_DAYS_BACK = 7;
  var LS_KEY_LAST_GAME = 'vectorHoops.lastPlayedGame';

  function utcDateString(d) {
    d = d || new Date();
    return d.toISOString().slice(0, 10);
  }

  function offsetDayString(offset) {
    return utcDateString(new Date(Date.now() - offset * 86400000));
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function gameById(id) {
    for (var i = 0; i < GAMES.length; i++) {
      if (GAMES[i].id === id) return GAMES[i];
    }
    return GAMES[0];
  }

  function initLeaderboardPage() {
    var chipsEl = document.getElementById('lb-game-chips');
    var boardEl = document.getElementById('lb-board');
    if (!chipsEl || !boardEl) return; // not on leaderboard.html — nothing to do

    var els = {
      chips: chipsEl,
      dateLabel: document.getElementById('lb-date-label'),
      prevBtn: document.getElementById('lb-date-prev'),
      nextBtn: document.getElementById('lb-date-next'),
      table: document.getElementById('lb-table'),
      tbody: document.getElementById('lb-tbody'),
      scoreHead: document.getElementById('lb-score-head'),
      players: document.getElementById('lb-players'),
      note: document.getElementById('lb-note'),
      chimeraNote: document.getElementById('lb-chimera-note'),
      empty: document.getElementById('lb-empty'),
      youLine: document.getElementById('lb-you-line')
    };

    var lastPlayed = null;
    try { lastPlayed = localStorage.getItem(LS_KEY_LAST_GAME); } catch (e) { lastPlayed = null; }
    var state = {
      // "Auto-loads your game+day": defaults to whichever mode you most
      // recently submitted a score for (game.js sets this key), else Chimera.
      game: (lastPlayed && gameById(lastPlayed).id === lastPlayed) ? lastPlayed : 'chimera',
      dayOffset: 0,
      reqId: 0
    };

    function renderChips() {
      els.chips.innerHTML = GAMES.map(function (g) {
        return '<button type="button" class="lb-chip' + (g.id === state.game ? ' is-active' : '') +
          '" data-game="' + g.id + '" role="tab" aria-selected="' + (g.id === state.game) + '">' +
          '<span class="lb-chip__icon" aria-hidden="true">' + g.icon + '</span>' + g.label + '</button>';
      }).join('');
    }

    function renderDateRow() {
      var day = offsetDayString(state.dayOffset);
      els.dateLabel.textContent = state.dayOffset === 0 ? 'Today (' + day + ')' : day;
      els.prevBtn.disabled = state.dayOffset >= MAX_DAYS_BACK;
      els.nextBtn.disabled = state.dayOffset <= 0;
    }

    function renderEmpty(message) {
      els.table.hidden = true;
      els.empty.hidden = false;
      els.empty.textContent = message;
    }

    function renderRows(entries, myRef) {
      els.table.hidden = false;
      els.empty.hidden = true;
      els.tbody.innerHTML = entries.map(function (e) {
        var mine = !!myRef && e.ref === myRef;
        return '<tr class="' + (mine ? 'lb-row--you' : '') + '">' +
          '<td class="lb-td-rank">' + escapeHtml(e.rank) + '</td>' +
          '<td class="lb-td-name">' + escapeHtml(e.name) +
            (mine ? ' <span class="lb-you-badge">you</span>' : '') + '</td>' +
          '<td class="lb-td-score">' + escapeHtml(e.score) + '</td>' +
          '</tr>';
      }).join('');
    }

    function load() {
      var g = gameById(state.game);
      var day = offsetDayString(state.dayOffset);
      var myRef = global.VHIdentity.getUserRef();
      var reqId = ++state.reqId;

      renderChips();
      renderDateRow();
      els.scoreHead.textContent = g.unit === 'pts' ? 'Points' : 'Score';
      els.chimeraNote.hidden = g.id !== 'chimera';
      els.note.textContent = 'Loading…';
      els.players.textContent = '';
      els.youLine.hidden = true;
      els.table.hidden = true;
      els.empty.hidden = true;

      var qs = 'game=' + encodeURIComponent(g.id) + '&day=' + encodeURIComponent(day) +
        '&ref=' + encodeURIComponent(myRef);

      fetch('/api/leaderboard?' + qs)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (reqId !== state.reqId) return; // a later switch already superseded this response
          var entries = (data && data.entries) || [];
          els.players.textContent = (data && typeof data.players === 'number')
            ? data.players + ' player' + (data.players === 1 ? '' : 's')
            : '';
          els.note.textContent = (data && data.note) || '';
          if (data && data.error) {
            renderEmpty((data && data.note) || 'Leaderboard temporarily unavailable.');
          } else if (entries.length === 0) {
            renderEmpty('No scores yet today — be the first.');
          } else {
            renderRows(entries, myRef);
          }
          if (data && data.you) {
            els.youLine.hidden = false;
            els.youLine.textContent = 'You: rank ' + data.you.rank + ', ' + data.you.score +
              (g.unit === 'pts' ? ' pts' : ' score');
          }
        })
        .catch(function () {
          if (reqId !== state.reqId) return;
          els.note.textContent = '';
          els.players.textContent = '';
          renderEmpty('Could not load the leaderboard right now.');
        });
    }

    els.chips.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.lb-chip');
      if (!btn) return;
      var g = btn.getAttribute('data-game');
      if (g === state.game) return;
      state.game = g;
      load();
    });

    els.prevBtn.addEventListener('click', function () {
      if (state.dayOffset >= MAX_DAYS_BACK) return;
      state.dayOffset++;
      load();
    });
    els.nextBtn.addEventListener('click', function () {
      if (state.dayOffset <= 0) return;
      state.dayOffset--;
      load();
    });

    load();
  }

  function init() {
    renderIdentityChip();
    initLeaderboardPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
