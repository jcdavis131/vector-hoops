/* assets/game-center.js — ONE game-center layer shared by /live and /replay.
 *
 * What it is: the header, tab bar, plays feed, box score, catch-up summary,
 * state hero and Game Pulse sheet from the 2026-10-24 game-center redesign
 * (~/workspace/specs/live-replay-redesign/REDESIGN.md, approved 2026-10-25).
 * Both pages render the same components from the same game data, keyed by
 * ESPN event ID. The 24h rule itself lives in assets/game-route.js and is
 * untouched here: live owns scheduled/live/recent (<=24h after the whistle),
 * replay owns everything older; a game is on one page only.
 *
 * Honesty rules, enforced by construction (not by copy):
 * - No team logos anywhere: abbreviations + team colors from the summary's
 *   own boxscore.teams, exactly as live.js teamColors() already does.
 * - No video prompt, no broadcast name, no video cards: this site has no
 *   video rights. The lede stays "no video, just the numbers".
 * - No betting-lines row: no public source carries them (PR #188).
 * - No timeout countdown: ESPN gives a timeout play and a game clock, not
 *   time left in the timeout. The hero shows TIMEOUT + the game clock +
 *   elapsed time since the timeout play, labeled "elapsed". Never a
 *   countdown to zero. If no wall clock is known, elapsed is omitted.
 * - No invented headlines, quotes, stats or motives. Feed headlines are the
 *   play text itself. Catch-up sentences are computed from the score
 *   sequence only (leader, last score, lead changes, largest unanswered
 *   run) and are labeled "Generated from play-by-play data".
 * - Shot spots and scores are real; the other nine players are modeled.
 *   /replay keeps its full "What's real, what's staged" disclosure and
 *   /live keeps its honesty caption under the replay plate.
 *
 * Stdlib only. Deferred classic script; also require()-able in node for
 * tests (tests/test_game_center.mjs). Pure functions are tested; the DOM
 * renderers are thin wrappers over them.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function isColor(s) {
    return /^[0-9a-f]{6}$/i.test(String(s || ''));
  }

  function fmtClock(period, clock) {
    var p = +period || 0, c = String(clock || '');
    if (!p) return c;
    return (p <= 4 ? 'Q' + p : 'OT' + (p - 4)) + (c ? ' ' + c : '');
  }

  function fmtElapsed(ms) {
    if (ms == null || !(ms >= 0)) return '';
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* Normalize one ESPN summary play (live) or one replay event (see
   * fromReplayEvent) to a common row. Rows are chronological. */
  function normalizePlay(p, idx) {
    var typeText = String((p.type && p.type.text) || p.typeText || '');
    var tl = typeText.toLowerCase();
    var text = String(p.text || '');
    var period = p.period != null
      ? (+(typeof p.period === 'object' ? p.period.number : p.period) || 0)
      : (+p.periodNum || 0);
    var clock = p.clock != null
      ? String(typeof p.clock === 'object' ? (p.clock.displayValue || '') : p.clock)
      : String(p.clockStr || '');
    return {
      idx: idx,
      period: period,
      clock: clock,
      label: fmtClock(period, clock),
      text: text,
      typeText: typeText,
      away: +p.awayScore || 0,
      home: +p.homeScore || 0,
      scoring: !!p.scoringPlay,
      timeout: tl.indexOf('timeout') >= 0,
      periodEnd: tl === 'end period' || /^end of/i.test(text),
      wallMs: p.wallclock ? Date.parse(p.wallclock) || null : (p.wallMs || null)
    };
  }

  function fromReplayEvent(e, types, idx) {
    var ty = (types && types[e[2]]) || '';
    var sec = +e[1] || 0;
    var clock = Math.floor(sec / 60) + ':' + ('0' + Math.floor(sec % 60)).slice(-2);
    return normalizePlay({
      periodNum: e[0], clockStr: clock, text: e[11] || '',
      typeText: ty, awayScore: e[8], homeScore: e[9],
      scoringPlay: (ty === '2pt' || ty === '3pt' || ty === 'freethrow') && e[10] === 1,
      wallMs: null
    }, idx);
  }

  /* Annotate rows with the derived flags the feed filters need. Pure:
   * returns new row objects; never mutates the input. */
  function annotate(rows) {
    var out = [], prev = null, leader = 0, changes = 0;
    rows.forEach(function (r) {
      var row = {};
      for (var k in r) row[k] = r[k];
      var diff = row.home - row.away;
      var sign = diff > 0 ? 1 : diff < 0 ? -1 : 0;
      if (prev && sign !== 0 && leader !== 0 && sign !== leader) changes++;
      if (sign !== 0) leader = sign;
      row.leadChange = !!(prev && sign !== 0 && prev.sign !== 0 && sign !== prev.sign);
      row.leadChangesSoFar = changes;
      row.sign = sign;
      row.points = prev ? Math.max(0, (row.away - prev.away) + (row.home - prev.home)) : 0;
      row.scoringTeam = prev ? (row.away > prev.away ? -1 : row.home > prev.home ? 1 : 0) : 0;
      out.push(row);
      prev = row;
    });
    return out;
  }

  function filterRows(rows, filter) {
    if (filter === 'highlights') {
      return rows.filter(function (r) {
        var t = (r.text || '').toLowerCase();
        return r.scoring || r.leadChange || /dunk|block|steal/.test(t) ||
          (r.scoring && r.text && /3-pt|three point/i.test(r.text));
      });
    }
    if (filter === 'insights') {
      return rows.filter(function (r) { return r.leadChange || r.timeout || r.periodEnd; });
    }
    return rows.slice();
  }

  /* Feed rows for rendering, newest first, with state dividers. A timeout
   * play renders as a divider row, not as a normal row; a period change
   * inserts an END OF QUARTER divider before the first play of the new
   * period. Dividers carry no score claim beyond the running score. */
  function feedRows(rows, filter) {
    var kept = filterRows(rows, filter);
    var out = [], prevPeriod = null;
    kept.forEach(function (r) {
      if (prevPeriod != null && r.period && r.period !== prevPeriod) {
        out.push({ divider: true, text: 'END OF ' + (prevPeriod <= 4 ? 'Q' + prevPeriod : 'OT' + (prevPeriod - 4)) });
      }
      if (r.timeout) {
        out.push({ divider: true, text: 'TIMEOUT', clock: r.label, away: r.away, home: r.home });
      } else {
        out.push({ row: r });
      }
      prevPeriod = r.period || prevPeriod;
    });
    return out;
  }

  /* Catch-up summary, computed from the score sequence only. Returns null
   * when there is nothing to summarize (fewer than 2 plays). The two
   * sentences never name a motive, quote anyone, or invent a stat. */
  function catchUp(rows) {
    if (!rows || rows.length < 2) return null;
    var ann = annotate(rows);
    var last = ann[ann.length - 1];
    var lastScore = null;
    for (var i = ann.length - 1; i >= 0; i--) {
      if (ann[i].scoring) { lastScore = ann[i]; break; }
    }
    if (!lastScore) return null;
    var leader = last.home > last.away ? 'Home' : last.away > last.home ? 'Away' : null;
    var s1 = leader
      ? leader + ' lead ' + last.away + '–' + last.home + ' after the last score: ' + lastScore.text
      : 'Tied at ' + last.away + '–' + last.home + ' after the last score: ' + lastScore.text;
    var runTeam = 0, runPts = 0, curTeam = 0, curPts = 0;
    ann.forEach(function (r) {
      if (r.scoring && r.scoringTeam) {
        if (r.scoringTeam === curTeam) curPts += r.points;
        else { curTeam = r.scoringTeam; curPts = r.points; }
        if (curPts > runPts) { runPts = curPts; runTeam = curTeam; }
      } else if (!r.scoring) { curTeam = 0; curPts = 0; }
    });
    var changes = last.leadChangesSoFar || 0;
    var s2 = (changes ? changes + (changes === 1 ? ' lead change' : ' lead changes') + ' so far. '
      : 'No lead change yet. ') +
      (runPts ? 'Largest unanswered run: ' + (runTeam === 1 ? 'Home' : 'Away') + ' ' + runPts + '–0.' : '');
    return {
      headline: leader ? leader + ' lead ' + last.away + '–' + last.home : 'Tied at ' + last.away + '–' + last.home,
      sentences: [s1, s2],
      label: 'Generated from play-by-play data'
    };
  }

  /* Game Pulse content: win probability (caller-supplied, may be null),
   * the lead trace as a list of home-minus-away margins, and the last
   * three plays, newest first. No value is synthesized here. */
  function pulse(rows, wpPct, wpTeam, wpNote) {
    var last3 = rows.slice(-3).reverse().map(function (r) {
      return { label: r.label, text: r.text, away: r.away, home: r.home };
    });
    return {
      wp: wpPct == null ? null : { pct: wpPct, team: wpTeam || '' },
      wpNote: wpNote || null,
      margins: rows.map(function (r) { return r.home - r.away; }),
      last3: last3
    };
  }

  /* State hero model. timeoutElapsedMs is supplied by the caller from the
   * timeout play's wall clock; it is an elapsed duration, never a
   * countdown, and it is omitted when unknown. */
  function stateHero(state, lastPlay, timeoutElapsedMs) {
    if (state === 'pre') return { kind: 'pregame', title: 'Before tip', detail: 'Pregame module only. Live plates start at tip.' };
    if (state === 'post') return { kind: 'final', title: 'Final', detail: 'The feed is no longer polled. The timeline rewinds the final record.' };
    if (lastPlay && lastPlay.timeout) {
      var el = fmtElapsed(timeoutElapsedMs);
      return {
        kind: 'timeout', title: 'TIMEOUT',
        detail: (lastPlay.label ? lastPlay.label + ' · ' : '') +
          (el ? 'elapsed ' + el + ' since the timeout play.' : 'Game clock at the timeout play.')
      };
    }
    if (state === 'in') return { kind: 'live', title: 'Live now', detail: lastPlay ? 'Last play: ' + lastPlay.label + ' · ' + lastPlay.text : '' };
    return { kind: 'off', title: 'No live game', detail: 'Nothing is live right now. Rewatch the last game in Pixel Replay.' };
  }

  /* Split-color header HTML. Colors are validated hex (without '#') from
   * boxscore.teams; anything else renders uncolored. No logos. */
  function splitHeaderHtml(a, h, clock, stateLabel) {
    var ac = isColor(a && a.color) ? '#' + String(a.color).toLowerCase() : null;
    var hc = isColor(h && h.color) ? '#' + String(h.color).toLowerCase() : null;
    var style = (ac ? '--gc-a:' + ac + ';' : '') + (hc ? '--gc-h:' + hc + ';' : '');
    return '<div class="gc-split"' + (style ? ' style="' + style + '"' : '') + '>' +
      '<div class="gc-split__half gc-split__half--a"><span class="gc-split__abbr">' + esc(a && a.abbr) + '</span>' +
      '<span class="gc-split__score">' + esc(a && a.score) + '</span></div>' +
      '<div class="gc-split__mid"><span class="gc-split__clock">' + esc(clock) + '</span>' +
      '<span class="gc-split__state">' + esc(stateLabel) + '</span></div>' +
      '<div class="gc-split__half gc-split__half--h"><span class="gc-split__score">' + esc(h && h.score) + '</span>' +
      '<span class="gc-split__abbr">' + esc(h && h.abbr) + '</span></div></div>';
  }

  /* Box-score rows, parsed by column name (never by position) from an ESPN
   * boxscore.players payload. Returns {teams:[{tri, starters, bench}]}.
   * Columns are caller-chosen: live uses MIN/PTS/REB/AST/STL, replay's
   * full panel keeps its own wider table (see replay-boxscore.js). */
  function parseBoxScore(boxscore, cols) {
    var out = [];
    ((boxscore && boxscore.players) || []).forEach(function (tp) {
      var st = (tp.statistics && tp.statistics[0]) || {};
      var keys = st.keys || [], idx = {};
      cols.forEach(function (c) { idx[c] = keys.indexOf(c); });
      var starters = [], bench = [];
      ((st.athletes) || []).forEach(function (a) {
        var at = a.athlete || {}, stats = a.stats || [];
        var row = {
          name: at.shortName || at.displayName || '',
          dnp: !!a.didNotPlay,
          cells: cols.map(function (c) {
            var i = idx[c];
            return i >= 0 && stats[i] != null ? String(stats[i]) : '';
          })
        };
        if (a.starter) starters.push(row); else bench.push(row);
      });
      out.push({ tri: tp.team && tp.team.abbreviation, starters: starters, bench: bench });
    });
    return out;
  }

  /* ---- DOM renderers (thin wrappers; safe to call when elements are absent) ---- */

  function renderFeed(el, rows, filter, onSeek) {
    if (!el) return;
    var items = feedRows(annotate(rows), filter);
    if (!items.length) { el.innerHTML = '<li class="gc-muted">No plays on record for this game.</li>'; return; }
    el.innerHTML = '';
    items.slice().reverse().forEach(function (it) {
      var li = document.createElement('li');
      if (it.divider) {
        li.className = 'gc-divider';
        li.innerHTML = '<span>' + esc(it.text) + '</span>' +
          (it.clock ? '<span class="gc-divider__clock">' + esc(it.clock) + '</span>' : '') +
          (it.away != null ? '<span class="gc-divider__score">' + esc(it.away) + '–' + esc(it.home) + '</span>' : '');
      } else {
        var r = it.row;
        li.className = (r.scoring ? 'gc-feed__row gc-feed__row--score' : 'gc-feed__row') +
          (onSeek ? ' gc-feed__row--seek' : '');
        li.dataset.idx = r.idx;
        li.innerHTML = '<span class="gc-feed__clock">' + esc(r.label) + '</span>' +
          '<span class="gc-feed__text">' + esc(r.text) + '</span>' +
          '<span class="gc-feed__score">' + esc(r.away) + '–' + esc(r.home) + '</span>';
        if (onSeek) li.addEventListener('click', function () { onSeek(r.idx); });
      }
      el.appendChild(li);
    });
  }

  function renderCatchUp(el, rows) {
    if (!el) return;
    var c = catchUp(rows);
    if (!c) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<p class="gc-catchup__label">Catch-up summary · ' + esc(c.label) + '</p>' +
      '<h3 class="gc-catchup__headline">' + esc(c.headline) + '</h3>' +
      c.sentences.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('');
  }

  function renderBoxScore(el, boxscore, cols) {
    if (!el) return;
    var teams = parseBoxScore(boxscore, cols);
    if (!teams.length || !teams.some(function (t) { return t.starters.length || t.bench.length; })) {
      el.innerHTML = '<p class="gc-muted">Box score not up yet.</p>';
      return;
    }
    var cur = 0;
    function table(title, list) {
      if (!list.length) return '';
      return '<h3 class="gc-box__group">' + esc(title) + '</h3>' +
        '<table class="gc-box__table"><thead><tr><th scope="col"><span class="visually-hidden">Player</span></th>' +
        cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        list.map(function (r) {
          return '<tr><th scope="row">' + esc(r.name) + '</th>' +
            (r.dnp ? '<td colspan="' + cols.length + '">DNP</td>'
              : r.cells.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('')) + '</tr>';
        }).join('') + '</tbody></table>';
    }
    function paint() {
      var t = teams[cur];
      el.innerHTML = '<div class="seg gc-box__toggle" role="group" aria-label="Team">' +
        teams.map(function (tm, i) {
          return '<button type="button" data-team="' + i + '" aria-pressed="' + (i === cur ? 'true' : 'false') + '"' +
            (i === cur ? ' class="on"' : '') + '>' + esc(tm.tri) + '</button>';
        }).join('') + '</div>' +
        table('Starters', t.starters) + table('Bench', t.bench);
      var btns = el.querySelectorAll('[data-team]');
      for (var i = 0; i < btns.length; i++) {
        (function (b) {
          b.addEventListener('click', function () { cur = +b.dataset.team; paint(); });
        })(btns[i]);
      }
    }
    paint();
  }

  function renderPulse(el, data) {
    if (!el) return;
    var wp = data.wp
      ? '<p class="gc-pulse__wp">' + esc(data.wp.team) + ' ' + esc(Math.round(data.wp.pct)) + '% to win <span>(our estimate)</span></p>'
      : '<p class="gc-pulse__wp">' + esc(data.wpNote || 'Win probability is a live estimate — this game is final, so the sheet shows the lead trace instead.') + '</p>';
    el.innerHTML = wp +
      '<p class="gc-pulse__label">Last plays</p><ol class="gc-pulse__plays">' +
      data.last3.map(function (p) {
        return '<li><span>' + esc(p.label) + '</span> ' + esc(p.text) + ' <span>' + esc(p.away) + '–' + esc(p.home) + '</span></li>';
      }).join('') + '</ol>';
  }

  /* Tab controller: buttons [data-gc-tab] switch panels [data-gc-panel].
   * Panels are hidden with the hidden attribute (never display:none in CSS
   * alone, so a no-JS page still shows its first panel's content in source
   * order). Fires gamecenter:tab with {tab} so page scripts can paint
   * charts at real widths when their panel opens. */
  function mountTabs(root) {
    root = root || document;
    var btns = root.querySelectorAll('[data-gc-tab]');
    if (!btns.length) return false;
    var panels = root.querySelectorAll('[data-gc-panel]');
    function show(tab) {
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].dataset.gcTab === tab;
        btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
        btns[i].classList.toggle('on', on);
      }
      for (var j = 0; j < panels.length; j++) {
        panels[j].hidden = panels[j].dataset.gcPanel !== tab;
      }
      try {
        root.dispatchEvent(new CustomEvent('gamecenter:tab', { detail: { tab: tab } }));
      } catch (e) { /* listeners are optional */ }
    }
    for (var k = 0; k < btns.length; k++) {
      (function (b) {
        b.addEventListener('click', function () { show(b.dataset.gcTab); });
      })(btns[k]);
    }
    var first = btns[0].dataset.gcTab;
    show(first);
    return true;
  }

  function mountPulse(pillId, sheetId, closeId) {
    var pill = document.getElementById(pillId);
    var sheet = document.getElementById(sheetId);
    if (!pill || !sheet) return false;
    pill.addEventListener('click', function () { sheet.hidden = !sheet.hidden; });
    var close = closeId && document.getElementById(closeId);
    if (close) close.addEventListener('click', function () { sheet.hidden = true; });
    return true;
  }

  /* Self-mount on pages that carry the markup: tab bar + pulse pill.
   * Page scripts listen for gamecenter:tab and paint their panels. */
  function autoMount() {
    try { mountTabs(document); } catch (e) { /* no tab bar on this page */ }
    try {
      var pill = document.getElementById('gcPulseBtn');
      var sheet = document.getElementById('gcPulseSheet');
      if (pill && sheet) {
        pill.addEventListener('click', function () {
          sheet.hidden = !sheet.hidden;
          pill.setAttribute('aria-expanded', sheet.hidden ? 'false' : 'true');
        });
        var close = document.getElementById('gcPulseClose');
        if (close) close.addEventListener('click', function () { sheet.hidden = true; pill.setAttribute('aria-expanded', 'false'); });
      }
    } catch (e) { /* no pulse pill on this page */ }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
    else autoMount();
  }

  var api = {
    esc: esc, fmtClock: fmtClock, fmtElapsed: fmtElapsed,
    normalizePlay: normalizePlay, fromReplayEvent: fromReplayEvent,
    annotate: annotate, filterRows: filterRows, feedRows: feedRows,
    catchUp: catchUp, pulse: pulse, stateHero: stateHero,
    splitHeaderHtml: splitHeaderHtml, parseBoxScore: parseBoxScore,
    renderFeed: renderFeed, renderCatchUp: renderCatchUp,
    renderBoxScore: renderBoxScore, renderPulse: renderPulse,
    mountTabs: mountTabs, mountPulse: mountPulse
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (global.GameCenter = api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
