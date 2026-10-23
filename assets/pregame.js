/* assets/pregame.js — the pre-game show: a pro scouting report for fans.
 *
 * Renders into #pregame ONLY when the game state is 'pre' (live.js gates it;
 * the HOU@SA regression: zero data plates, zero waiting walls on pre-game).
 * Every number is labeled with its source. Strategy cards carry
 * "model-derived, not the coach's game plan" — always.
 *
 * Data: assets/pregame/latest.json (built by scripts/build_pregame.py —
 * trending, probable starters, 2025-26 team style fingerprints; carries asof,
 * rendered on the cards per V6/K3) + ESPN scoreboard (form, injuries).
 *
 * Stdlib only. Deferred classic script. window.Pregame.render(el, opts).
 */
(function (global) {
  'use strict';

  var SB = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
  var DATA_URL = 'assets/pregame/latest.json';

  /* abbr -> ESPN team slug for news links (D1 default: ESPN team links). */
  var SLUG = { ATL: 'atlanta-hawks', BOS: 'boston-celtics', BKN: 'brooklyn-nets', CHA: 'charlotte-hornets',
    CHI: 'chicago-bulls', CLE: 'cleveland-cavaliers', DAL: 'dallas-mavericks', DEN: 'denver-nuggets',
    DET: 'detroit-pistons', GS: 'golden-state-warriors', HOU: 'houston-rockets', IND: 'indiana-pacers',
    LAC: 'la-clippers', LAL: 'los-angeles-lakers', MEM: 'memphis-grizzlies', MIA: 'miami-heat',
    MIL: 'milwaukee-bucks', MIN: 'minnesota-timberwolves', NO: 'new-orleans-pelicans', NY: 'new-york-knicks',
    OKC: 'oklahoma-city-thunder', ORL: 'orlando-magic', PHI: 'philadelphia-76ers', PHX: 'phoenix-suns',
    POR: 'portland-trail-blazers', SAC: 'sacramento-kings', SA: 'san-antonio-spurs', TOR: 'toronto-raptors',
    UTAH: 'utah-jazz', WSH: 'washington-wizards' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function plate(no, title, meta) {
    if (global.Plate) return global.Plate.html(no, title, meta);
    return '<div class="plate"><span class="pno">' + esc(no) + '</span><h2>' + esc(title) +
      '</h2><span class="prule"></span>' + (meta ? '<span class="pmeta">' + esc(meta) + '</span>' : '') + '</div>';
  }

  function jget(u) {
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  function ymd(d) {
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  }

  /* Last-10 for both teams from the last 14 scoreboard days (fresh, honest). */
  function lastTen(aAbbr, hAbbr) {
    var days = [];
    var now = Date.now();
    for (var i = 1; i <= 14; i++) days.push(ymd(new Date(now - i * 864e5)));
    return Promise.all(days.map(function (day) {
      return jget(SB + '?dates=' + day).catch(function () { return { events: [] }; });
    })).then(function (boards) {
      var out = {};
      out[aAbbr] = []; out[hAbbr] = [];
      boards.forEach(function (b) {
        (b.events || []).forEach(function (e) {
          var c = e.competitions && e.competitions[0];
          if (!c || !e.status || e.status.type.state !== 'post') return;
          c.competitors.forEach(function (t) {
            var ab = t.team.abbreviation;
            if (ab !== aAbbr && ab !== hAbbr) return;
            var us = +t.score, them = 0;
            c.competitors.forEach(function (o) { if (o !== t) them = +o.score; });
            out[ab].push({ date: e.date, w: us > them });
          });
        });
      });
      [aAbbr, hAbbr].forEach(function (ab) {
        out[ab].sort(function (x, y) { return x.date < y.date ? 1 : -1; });
        out[ab] = out[ab].slice(0, 10);
      });
      return out;
    });
  }

  function formLine(last10, rec) {
    if (!last10.length) return esc(rec || '—') + ' · <span class="psrc">ESPN</span>';
    var w = last10.filter(function (g) { return g.w; }).length;
    var strip = last10.map(function (g) { return g.w ? 'W' : 'L'; }).join(' ');
    return esc(rec || w + '-' + (last10.length - w)) + ' · last ' + last10.length + ': ' + w + '-' + (last10.length - w) +
      ' <span class="pstr">' + esc(strip) + '</span> <span class="psrc">ESPN scoreboard</span>';
  }

  /* Matchup edges from the style fingerprints — computed, not asserted. */
  function edges(aAbbr, hAbbr, teams) {
    var A = teams[aAbbr], B = teams[hAbbr];
    if (!A || !B || !A.style || !B.style || !A.allowed || !B.allowed) return [];
    var out = [];
    function edge(cond, text) { if (cond) out.push(text); }
    // A attacks B's defense; B attacks A's defense
    edge(A.style.tpar.rank <= 10 && B.allowed.opp_tpar.rank >= 21,
      aAbbr + ' hunts threes (' + ord(A.style.tpar.rank) + ' in 3P rate) and ' + hAbbr +
      ' gives them up (' + ord(B.allowed.opp_tpar.rank) + ' in opponent 3P rate) — the math says hunt threes.');
    edge(B.style.tpar.rank <= 10 && A.allowed.opp_tpar.rank >= 21,
      hAbbr + ' hunts threes (' + ord(B.style.tpar.rank) + ' in 3P rate) and ' + aAbbr +
      ' gives them up (' + ord(A.allowed.opp_tpar.rank) + ' in opponent 3P rate) — the math says hunt threes.');
    edge(A.style.pace.rank <= 8 && B.style.pace.rank >= 23,
      aAbbr + ' plays fast (' + ord(A.style.pace.rank) + ' in pace) against a slow ' + hAbbr +
      ' (' + ord(B.style.pace.rank) + ') — whoever controls tempo controls the game.');
    edge(B.style.pace.rank <= 8 && A.style.pace.rank >= 23,
      hAbbr + ' plays fast (' + ord(B.style.pace.rank) + ' in pace) against a slow ' + aAbbr +
      ' (' + ord(A.style.pace.rank) + ') — whoever controls tempo controls the game.');
    edge(A.style.efg.rank <= 8 && B.allowed.opp_ppp.rank >= 21,
      aAbbr + ' finishes efficiently (' + ord(A.style.efg.rank) + ' in eFG%) against a leaky ' + hAbbr +
      ' defense (' + ord(B.allowed.opp_ppp.rank) + ' in points allowed per possession).');
    edge(B.style.efg.rank <= 8 && A.allowed.opp_ppp.rank >= 21,
      hAbbr + ' finishes efficiently (' + ord(B.style.efg.rank) + ' in eFG%) against a leaky ' + aAbbr +
      ' defense (' + ord(A.allowed.opp_ppp.rank) + ' in points allowed per possession).');
    return out.slice(0, 3);
  }

  function ord(n) { return n + (['th', 'st', 'nd', 'rd'][n] || 'th'); }

  function styleCard(ab, t) {
    if (!t || !t.style) return '';
    var s = t.style, a = t.allowed || {};
    function m(label, o, inv) {
      if (!o) return '';
      return '<div class="srow"><span>' + esc(label) + '</span><b>' + esc(o.v) +
        '</b><i>' + ord(o.rank) + (inv ? ' allowed' : '') + '</i></div>';
    }
    return '<div class="steam"><h4>' + esc(ab) + ' <span class="psrc">2025-26, ' + t.n_games + ' games</span></h4>' +
      m('Pace', s.pace) + m('Points/poss', s.ppp) + m('3P rate', s.tpar) + m('eFG%', s.efg) +
      (a.opp_ppp ? m('Opp pts/poss', a.opp_ppp, true) : '') +
      (a.opp_tpar ? m('Opp 3P rate', a.opp_tpar, true) : '') + '</div>';
  }

  function injuries(aAbbr, hAbbr) {
    // Best effort: ESPN's site API injuries endpoint. Any failure -> card hides.
    return jget('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries')
      .then(function (d) {
        var out = [];
        (d.injuries || []).forEach(function (inj) {
          var ab = inj.team && inj.team.abbreviation;
          if (ab !== aAbbr && ab !== hAbbr) return;
          (inj.injuries || []).slice(0, 3).forEach(function (p) {
            out.push('<div class="irow"><b>' + esc(p.athlete && p.athlete.displayName) + '</b><span>' +
              esc(ab) + ' · ' + esc(p.status || p.detail || 'out') + '</span></div>');
          });
        });
        return out.slice(0, 6);
      }).catch(function () { return null; });
  }

  function render(el, opts) {
    var aAbbr = opts.aAbbr, hAbbr = opts.hAbbr;
    var when = opts.when || '', venue = opts.venue || '';
    el.innerHTML = plate('PRE-GAME', aAbbr + ' @ ' + hAbbr, 'the pre-game show') +
      '<div class="pg-head">' +
      (global.GameHeader ? global.GameHeader.html({ abbr: aAbbr }, { abbr: hAbbr }, venue, when, 'pre') : '') +
      '</div><div class="pg-loading">Scouting the matchup…</div>';
    var done = false;
    function finish(html) { if (!done) { done = true; el.innerHTML = html; } }

    var dataP = jget(DATA_URL).catch(function () { return null; });
    var formP = lastTen(aAbbr, hAbbr).catch(function () { return null; });
    var injP = injuries(aAbbr, hAbbr);

    Promise.all([dataP, formP, injP]).then(function (res) {
      var doc = res[0], forms = res[1], injs = res[2];
      var teams = (doc && doc.teams) || {};
      var asof = doc && doc.asof;
      if (!asof) { // K3: no asof -> the data cards don't ship
        el.innerHTML = plate('PRE-GAME', aAbbr + ' @ ' + hAbbr, 'the pre-game show') +
          '<div class="pg-head">' +
          (global.GameHeader ? global.GameHeader.html({ abbr: aAbbr }, { abbr: hAbbr }, venue, when, 'pre') : '') +
          '</div><p class="pnote">Pre-game data is being rebuilt — check back shortly.</p>';
        return;
      }
      var A = teams[aAbbr] || {}, B = teams[hAbbr] || {};
      var ed = edges(aAbbr, hAbbr, teams);
      var html = plate('PRE-GAME', aAbbr + ' @ ' + hAbbr, 'as of ' + esc(asof)) +
        '<div class="pg-head">' +
        (global.GameHeader ? global.GameHeader.html({ abbr: aAbbr }, { abbr: hAbbr }, venue, when, 'pre') : '') +
        '</div>';

      // Form
      html += '<div class="pcard">' + plate('01', 'FORM', 'ESPN scoreboard') +
        '<div class="frow"><div><h4>' + esc(aAbbr) + '</h4><div>' +
        formLine(forms ? forms[aAbbr] || [] : [], opts.aRec) + '</div></div>' +
        '<div><h4>' + esc(hAbbr) + '</h4><div>' +
        formLine(forms ? forms[hAbbr] || [] : [], opts.hRec) + '</div></div></div></div>';

      // Style fingerprints + matchup edges
      html += '<div class="pcard">' + plate('02', 'HOW THEY PLAY', '2025-26 team fingerprints · game logs') +
        '<div class="sgrid">' + styleCard(aAbbr, A) + styleCard(hAbbr, B) + '</div>';
      if (ed.length) {
        html += '<h4>Where the math points</h4><ul class="edges">' +
          ed.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' +
          '<p class="pnote">Model-derived from team fingerprints — not the coach\u2019s game plan.</p>';
      }
      html += '</div>';

      // Trending
      function trendList(t, ab) {
        if (!t.trending || !t.trending.length) return '<p class="pnote">No recent game-log data for ' + esc(ab) + '.</p>';
        return '<ul>' + t.trending.map(function (p) {
          return '<li><b>' + esc(p.name) + '</b> ' + esc(p.pts) + ' pts <span class="psrc">last ' + p.n + ' games</span></li>';
        }).join('') + '</ul>' +
          (t.trending[0].n < 3 ? '<p class="pnote">Thin sample — ' + t.trending[0].n + ' games is not a trend yet.</p>' : '');
      }
      html += '<div class="pcard">' + plate('03', 'WHO\u2019S TRENDING', 'game logs · as of ' + esc(asof)) +
        '<div class="sgrid"><div><h4>' + esc(aAbbr) + '</h4>' + trendList(A, aAbbr) + '</div>' +
        '<div><h4>' + esc(hAbbr) + '</h4>' + trendList(B, hAbbr) + '</div></div></div>';

      // Probable starters
      function starterList(t, ab) {
        if (!t.starters || !t.starters.length) return '<p class="pnote">No starter data for ' + esc(ab) + '.</p>';
        return '<ul>' + t.starters.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
          '<p class="pnote">Probable, not official — from the last logged game.</p>';
      }
      html += '<div class="pcard">' + plate('04', 'PROBABLE STARTERS', 'game logs · as of ' + esc(asof)) +
        '<div class="sgrid"><div><h4>' + esc(aAbbr) + '</h4>' + starterList(A, aAbbr) + '</div>' +
        '<div><h4>' + esc(hAbbr) + '</h4>' + starterList(B, hAbbr) + '</div></div></div>';

      // Injuries (only if the feed answered)
      if (injs && injs.length) {
        html += '<div class="pcard">' + plate('05', 'INJURIES', 'ESPN · check closer to tip') +
          injs.join('') + '</div>';
      }

      // News (D1 default: ESPN team links)
      function newsLink(ab) {
        var slug = SLUG[ab];
        if (!slug) return '';
        return '<a href="https://www.espn.com/nba/team/_/name/' + ab.toLowerCase() + '/' + slug +
          '" target="_blank" rel="noopener">' + esc(ab) + ' news on ESPN</a>';
      }
      html += '<div class="pcard">' + plate('06', 'NEWS', 'links out, never scraped') +
        '<div class="nrow">' + newsLink(aAbbr) + ' ' + newsLink(hAbbr) + '</div></div>';

      finish(html);
    }).catch(function () {
      el.innerHTML = plate('PRE-GAME', aAbbr + ' @ ' + hAbbr, 'the pre-game show') +
        '<p class="pnote">Pre-game data failed to load — scores and plates are unaffected.</p>';
    });
  }

  global.Pregame = { render: render };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
