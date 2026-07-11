/* Player References — skill profiles and leaderboards */
(function (global) {
  'use strict';

  var POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
  var MAX_SUGGEST = 8;
  var BOARD_ROWS = 20;

  var els = {};
  var DATA = null;    // vectors.json
  var SKILLS = null;  // skills.json
  var INDEX = {};     // slug -> { name, rows: [{ i, season }] }
  var ORDER = [];     // slugs sorted by name
  var PEDIGREE = null; // assets/pedigree.json (optional; false if absent)
  var WIDE = null;     // assets/skills_wide.json (optional; false if absent)
  var ARCH_ASSIGN = null; // assets/archetype_assignments.json (optional)
  var NEXT_EVAL = null; // assets/next_profile_eval.json (optional; false if absent)
  var MTNN_READY = false;
  var current = { slug: '', season: '' };

  function esc(s) { return window.VHDossier.escapeHtml(s); }

  function initDom() {
    els.search = document.getElementById('skills-search');
    els.suggest = document.getElementById('skills-suggest');
    els.profile = document.getElementById('skills-profile');
    els.meta = document.getElementById('skills-player-meta');
    els.seasons = document.getElementById('skills-seasons');
    els.badges = document.getElementById('skills-badges');
    els.bars = document.getElementById('skills-bars');
    els.mtnn = document.getElementById('skills-mtnn');
    els.playoffs = document.getElementById('skills-playoffs');
    els.nextProfile = document.getElementById('skills-next-profile');
    els.empty = document.getElementById('skills-empty');
    els.boardSkill = document.getElementById('board-skill');
    els.boardSeason = document.getElementById('board-season');
    els.board = document.getElementById('skills-board');
  }

  function buildIndex() {
    for (var i = 0; i < DATA.players.length; i++) {
      var p = DATA.players[i];
      var slug = window.VHDossier.playerSlug(p.name);
      if (!INDEX[slug]) {
        INDEX[slug] = { name: p.name, slug: slug, rows: [] };
        ORDER.push(slug);
      }
      INDEX[slug].rows.push({ i: i, season: p.season });
    }
    ORDER.sort(function (a, b) { return INDEX[a].name.localeCompare(INDEX[b].name); });
    Object.keys(INDEX).forEach(function (slug) {
      INDEX[slug].rows.sort(function (a, b) { return a.season < b.season ? -1 : 1; });
    });
  }

  function fillControls() {
    SKILLS.skills.forEach(function (sk, j) {
      var opt = document.createElement('option');
      opt.value = String(j);
      opt.textContent = sk.label;
      els.boardSkill.appendChild(opt);
    });
    var seasons = {};
    DATA.players.forEach(function (p) { seasons[p.season] = true; });
    Object.keys(seasons).sort().reverse().forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      els.boardSeason.appendChild(opt);
    });
  }

  // Prepend wide-skill board modes once skills_wide.json lands.
  function addWideBoardModes() {
    if (!WIDE || els.boardSkill.querySelector('option[value^="wide:"]')) return;
    var group = document.createElement('optgroup');
    group.label = 'Tracking skills (2015-16+)';
    WIDE.skills.forEach(function (sk) {
      var opt = document.createElement('option');
      opt.value = 'wide:' + sk.key;
      opt.textContent = sk.label;
      group.appendChild(opt);
    });
    els.boardSkill.appendChild(group);
  }

  // Prepend the Draft Steals/Busts board modes once pedigree data lands.
  function addDraftBoardModes() {
    if (!PEDIGREE || els.boardSkill.querySelector('option[value="steal"]')) return;
    [['bust', '★ Draft Busts'], ['steal', '★ Draft Steals']].forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0]; opt.textContent = o[1];
      els.boardSkill.insertBefore(opt, els.boardSkill.firstChild);
    });
    els.boardSkill.value = 'steal';
    renderBoard();
  }

  // ---- wide (masked) skills: post / transition / motor, 2015-16+ ----
  function wideGrades(name, season) {
    if (!WIDE) return null;
    return WIDE.grades[name + '|' + season] || null;
  }

  function wideBarsHtml(name, season) {
    if (!WIDE) return '';
    var wg = wideGrades(name, season);
    var head = '<li class="skillbar skillbar--widehead"><span class="skillbar__label">' +
      'Tracking skills</span><span></span><span></span></li>';
    if (!wg) {
      return head + '<li class="skillbar"><span class="skillbar__label">' +
        'Post · Transition · Motor · Gravities</span>' +
        '<span class="skillbar__track"></span>' +
        '<span class="skillbar__grade skillbar__grade--na" title="synergy + hustle tracking begins 2015-16">n/a</span></li>';
    }
    return head + WIDE.skills.map(function (sk) {
      var g = wg[sk.key];
      var cls = g >= WIDE.badgeGrade ? ' is-elite' : g >= 75 ? ' is-strong' : '';
      return '<li class="skillbar" title="' + esc(sk.badge) + '">' +
        '<span class="skillbar__label">' + esc(sk.label) + '</span>' +
        '<span class="skillbar__track"><span class="skillbar__fill' + cls +
        '" style="width:' + Math.max(g, 2) + '%"></span></span>' +
        '<span class="skillbar__grade">' + g + '</span></li>';
    }).join('');
  }

  // ---- profile ----

  function gradeClass(g) {
    if (g >= SKILLS.badgeGrade) return ' is-elite';
    if (g >= 75) return ' is-strong';
    return '';
  }

  function renderProfile() {
    var rec = INDEX[current.slug];
    if (!rec) return;
    var row = null;
    for (var r = 0; r < rec.rows.length; r++) {
      if (rec.rows[r].season === current.season) row = rec.rows[r];
    }
    if (!row) { row = rec.rows[rec.rows.length - 1]; current.season = row.season; }
    var p = DATA.players[row.i];
    var grades = SKILLS.grades[row.i];

    var pos = typeof p.p === 'number' && POSITIONS[p.p] ? POSITIONS[p.p] : '?';
    var arch = typeof p.c === 'number' && DATA.clusters[p.c] ? DATA.clusters[p.c] : '';
    var eraLine = '';
    if (ARCH_ASSIGN && ARCH_ASSIGN.assignments && ARCH_ASSIGN.assignments[row.i]) {
      var aa = ARCH_ASSIGN.assignments[row.i];
      var tagLabels = ARCH_ASSIGN.tagLabels || {};
      if (aa.eraNativeName) {
        eraLine = ' &middot; <span class="skills-era-arch" title="Era-native MTNN cluster">' +
          esc(aa.eraNativeName) + '</span>';
      }
      if (aa.eraTags && aa.eraTags.length) {
        eraLine += ' &middot; ' + aa.eraTags.map(function (t) {
          return '<span class="skills-era-tag">' + esc(tagLabels[t] || t) + '</span>';
        }).join(' ');
      }
    }
    els.meta.innerHTML = '<b>' + esc(rec.name) + '</b> &middot; ' + esc(current.season) +
      ' &middot; ' + esc(pos) + (arch ? ' &middot; ' + esc(arch) : '') + eraLine;

    els.seasons.innerHTML = rec.rows.map(function (rr) {
      return '<button type="button" role="tab" data-season="' + esc(rr.season) + '"' +
        (rr.season === current.season ? ' class="is-active" aria-selected="true"' : ' aria-selected="false"') +
        '>' + esc(rr.season.slice(2)) + '</button>';
    }).join('');

    var badges = [];
    SKILLS.skills.forEach(function (sk, j) {
      if (grades[j] >= SKILLS.badgeGrade) {
        badges.push('<span class="vh-skill-badge' +
          (grades[j] >= SKILLS.goldGrade ? ' vh-skill-badge--gold' : '') + '">' +
          esc(sk.badge) + ' ' + grades[j] + '</span>');
      }
    });
    var wg = wideGrades(rec.name, current.season);
    if (wg) WIDE.skills.forEach(function (sk, j) {
      if (wg[sk.key] >= WIDE.badgeGrade) {
        badges.push('<span class="vh-skill-badge' +
          (wg[sk.key] >= WIDE.goldGrade ? ' vh-skill-badge--gold' : '') + '">' +
          esc(sk.badge) + ' ' + wg[sk.key] + '</span>');
      }
    });
    els.badges.innerHTML = badges.length ? badges.join('') :
      '<span class="vh-skill-badge vh-skill-badge--muted">No 90+ badges this season</span>';

    var barsHtml = SKILLS.skills.map(function (sk, j) {
      var g = grades[j];
      return '<li class="skillbar" title="' + esc(sk.badge) + '">' +
        '<span class="skillbar__label">' + esc(sk.label) + '</span>' +
        '<span class="skillbar__track"><span class="skillbar__fill' + gradeClass(g) +
        '" style="width:' + Math.max(g, 2) + '%"></span></span>' +
        '<span class="skillbar__grade">' + g + '</span>' +
        '</li>';
    }).join('');
    barsHtml += wideBarsHtml(rec.name, current.season);
    els.bars.innerHTML = barsHtml;

    renderNextProfile(rec.name, current.season);
    renderPlayoffs(rec.name, current.season);
    renderMtnnNeighbors(row.i);

    els.profile.hidden = false;
    els.empty.hidden = true;
    if (global.VHPlayersPage) {
      global.VHPlayersPage.showTab('profile', { skipHistory: true });
    }
    var url = '/players?p=' + encodeURIComponent(current.slug) +
      '&s=' + encodeURIComponent(current.season) + '#profile';
    history.replaceState(null, '', url);
  }

  // ---- Playoff Lens (transparent; dormant until assets/playoffs.json lands) ----
  // PLAYOFFS is null until the fetch resolves; false if absent (dormant).
  var PLAYOFFS = null;
  var PLAYOFF_PATHS = null; // assets/playoff_paths.json (optional game logs)
  var HONORS = null; // assets/honors.json (All-NBA / ASG / Finals MVP)

  function fmtDelta(v, digits) {
    if (v === null || v === undefined) return '&mdash;';
    var s = v >= 0 ? '+' : '';
    return s + v.toFixed(Math.min(2, digits === undefined ? 1 : digits));
  }

  // Round any user-facing number to at most 2 decimals, trailing zeros trimmed.
  function num2(v) {
    if (v === null || v === undefined) return '&mdash;';
    return String(Math.round(v * 100) / 100);
  }

  function fmtPredPct(v) {
    var capped = Math.max(0, Math.min(99.9, v));
    var one = Math.round(capped * 10) / 10;
    if (Math.abs(one - capped) < 0.01) return one.toFixed(1);
    return (Math.round(capped * 100) / 100).toFixed(2);
  }

  /* ---- z-score -> real per-100 numbers ---------------------------------
     next_profile_eval ships era-z predictions and actuals. A z-score means
     nothing without the league it was scored against, so invert it with that
     TARGET season's league mean/SD (assets/season_norms.json):

        real = clip(z, -4, 4) * sd + mu       units: per 100 possessions

     FG3_PCT / FG_PCT / FT_PCT are empirical-Bayes shrunk before z-scoring, so
     they are NOT invertible; those keep the z reading rather than print a rate
     the model never held. Absent norms -> everything falls back to z. */

  var SEASON_NORMS = null;   // assets/season_norms.json (optional)

  function seasonNormFor(season, key) {
    if (!SEASON_NORMS || !season) return null;
    var s = SEASON_NORMS.seasons && SEASON_NORMS.seasons[season];
    return (s && s.features && s.features[key]) || null;
  }

  function realFromZ(z, season, key) {
    if (z === null || z === undefined || !isFinite(z)) return null;
    var n = seasonNormFor(season, key);
    if (!n) return null;
    return Math.max(-4, Math.min(4, z)) * n.sd + n.mu;
  }

  function fmtReal(v) {
    var a = Math.abs(v);
    return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  }

  /* A predicted/actual cell: real per-100 when invertible, else the z. */
  function fmtStat(z, season, key) {
    var r = realFromZ(z, season, key);
    if (r != null) return fmtReal(r);
    return fmtZ(z);
  }

  /* Delta must be computed in the SAME space as the cells it sits beside --
     differencing real values, not z, or the column would not add up. */
  function fmtStatDelta(pred, actual, season, key) {
    var rp = realFromZ(pred, season, key);
    var ra = realFromZ(actual, season, key);
    if (rp != null && ra != null) {
      var d = rp - ra;
      return (d >= 0 ? '+' : '') + fmtReal(d);
    }
    if (pred == null || actual == null) return '&mdash;';
    return fmtZ(pred - actual);
  }

  function fmtZ(v) {
    if (v === null || v === undefined || !isFinite(v)) return '&mdash;';
    var n = Math.round(v * 100) / 100;
    var s = n >= 0 ? '+' : '';
    return s + String(n);
  }

  function renderNextProfile(name, season) {
    var box = els.nextProfile;
    if (!box) return;
    if (!NEXT_EVAL) { box.hidden = true; return; }
    var row = NEXT_EVAL.rows[name + '|' + season];
    if (!row) {
      box.hidden = true;
      return;
    }
    // Career-ended / uncharted next year: keep asset for audit, hide in UI.
    if (row.status === 'no_next') {
      box.hidden = true;
      return;
    }

    var features = NEXT_EVAL.primaryFeatures || NEXT_EVAL.features || [];
    var labels = NEXT_EVAL.featureLabels || {};
    var allKeys = NEXT_EVAL.features || [];
    var pending = row.status === 'pending';
    var tag = pending
      ? '<span class="po-tag po-tag--steady">Prediction only</span>'
      : '<span class="po-tag po-tag--riser">Predicted vs actual</span>';
    var hint = pending
      ? (esc(row.to) + ' stats are not charted yet (latest season ' +
         esc(NEXT_EVAL.latestSeason || season) +
         '). Showing the MTNN next-profile prediction only.')
      : ('From ' + esc(season) + ' embedding &rarr; predicted ' + esc(row.to) +
         ' era-z profile, compared to the charted ' + esc(row.to) +
         ' vector' +
         (row.mae != null
             ? ' &middot; typically off by about ' + num2(row.mae)
               + ' standard deviations on the main stats'
             : '') +
         '.');

    var head = pending
      ? '<li class="np-split np-split--head">' +
          '<span class="np-split__label">Stat</span>' +
          '<span class="np-split__pred">Predicted</span>' +
        '</li>'
      : '<li class="np-split np-split--head">' +
          '<span class="np-split__label">Stat</span>' +
          '<span class="np-split__pred">Predicted</span>' +
          '<span class="np-split__actual">Actual</span>' +
          '<span class="np-split__delta">&Delta;</span>' +
        '</li>';

    var lines = features.map(function (key) {
      var idx = allKeys.indexOf(key);
      if (idx < 0) return '';
      var pred = row.pred[idx];
      var label = labels[key] || key;
      var norm = seasonNormFor(row.to, key);
      var unitTip = norm
        ? key + ': per 100 possessions (league average ' + fmtReal(norm.mu) + ')'
        : key + ': standard deviations vs the league that season (this stat is '
          + 'smoothed before the model sees it, so no raw rate is shown)';
      if (pending) {
        return '<li class="np-split">' +
          '<span class="np-split__label" title="' + esc(unitTip) + '">' + esc(label) + '</span>' +
          '<span class="np-split__pred">' + fmtStat(pred, row.to, key) + '</span>' +
          '</li>';
      }
      var actual = row.actual[idx];
      // Accuracy classes stay in z: "how many SDs off" is the scale-free read.
      var zDelta = (pred != null && actual != null) ? (pred - actual) : null;
      var deltaCls = '';
      if (zDelta != null) {
        if (Math.abs(zDelta) < 0.35) deltaCls = ' np-split__delta--ok';
        else if (Math.abs(zDelta) >= 1) deltaCls = ' np-split__delta--miss';
      }
      return '<li class="np-split">' +
        '<span class="np-split__label" title="' + esc(unitTip) + '">' + esc(label) + '</span>' +
        '<span class="np-split__pred">' + fmtStat(pred, row.to, key) + '</span>' +
        '<span class="np-split__actual">' + fmtStat(actual, row.to, key) + '</span>' +
        '<span class="np-split__delta' + deltaCls + '">' +
          fmtStatDelta(pred, actual, row.to, key) + '</span>' +
        '</li>';
    }).join('');

    box.hidden = false;
    box.className = 'skills-next-profile' + (pending ? ' skills-next-profile--pending' : '');
    box.innerHTML =
      '<div class="vh-section-label">Next-season stats ' + tag + '</div>' +
      '<p class="skills-hint">' + hint + '</p>' +
      '<ul class="np-splits' + (pending ? ' np-splits--pending' : '') + '">' +
      head + lines + '</ul>' +
      '<p class="skills-hint">' + (SEASON_NORMS
        ? 'Numbers are <b>per 100 possessions</b> &mdash; not per game &mdash; measured against the '
          + esc(row.to) + ' league. Shooting percentages are smoothed before the model sees them, so '
          + 'those rows stay in standard deviations rather than show a rate that never existed. '
        : 'Values are standard deviations vs the league that season. ')
      + 'Not a minutes or pace forecast.</p>';
  }

  function renderPlayoffSeries(series, champion) {
    if (!series || !series.length) return '';
    return '<ol class="po-series">' + series.map(function (sr) {
      var won = sr.won !== false && (sr.wins == null || sr.wins > sr.losses);
      var rowCls = won ? ' po-series__row--won' : ' po-series__row--lost';
      if (sr.finals || sr.label === 'NBA Finals' || sr.label === 'Finals') {
        rowCls += champion ? ' po-series__row--champion' : ' po-series__row--finals';
      }
      var mark = won ? 'W' : 'L';
      return '<li class="po-series__row' + rowCls + '">' +
        '<span class="po-series__round">' + esc(sr.label) + '</span>' +
        '<span class="po-series__opp">vs ' + esc(sr.opp) + '</span>' +
        '<span class="po-series__result">' + esc(sr.result) +
        ' <span class="po-series__mark">' + mark + '</span></span>' +
        '</li>';
    }).join('') + '</ol>';
  }

  function renderPlayoffGames(games) {
    if (!games || !games.length) return '';
    var head =
      '<li class="po-game po-game--head">' +
        '<span class="po-game__date">Date</span>' +
        '<span class="po-game__matchup">Matchup</span>' +
        '<span class="po-game__wl">W/L</span>' +
        '<span class="po-game__pts">PTS</span>' +
        '<span class="po-game__reb">REB</span>' +
        '<span class="po-game__ast">AST</span>' +
        '<span class="po-game__min">MIN</span>' +
        '<span class="po-game__pm">+/-</span>' +
      '</li>';
    var rows = games.map(function (g) {
      var wlCls = g.wl === 'W' ? ' po-game__wl--w' : (g.wl === 'L' ? ' po-game__wl--l' : '');
      return '<li class="po-game">' +
        '<span class="po-game__date">' + esc((g.d || '').slice(5)) + '</span>' +
        '<span class="po-game__matchup">' + esc(g.m || '') + '</span>' +
        '<span class="po-game__wl' + wlCls + '">' + esc(g.wl || '') + '</span>' +
        '<span class="po-game__pts">' + num2(g.pts) + '</span>' +
        '<span class="po-game__reb">' + num2(g.reb) + '</span>' +
        '<span class="po-game__ast">' + num2(g.ast) + '</span>' +
        '<span class="po-game__min">' + num2(g.min) + '</span>' +
        '<span class="po-game__pm">' + fmtDelta(g.pm, 0) + '</span>' +
        '</li>';
    }).join('');
    return '<details class="po-games">' +
      '<summary>Game log (' + games.length + ')</summary>' +
      '<ul class="po-game-list">' + head + rows + '</ul></details>';
  }

  function playoffOutcomeLabel(s) {
    var r = s.rounds;
    if (typeof r !== 'number') return '';
    // Explicit champion first — never bury under a series-path "Conf finals" row.
    if (r === 4 || s.champion) {
      return '<span class="po-tag po-tag--champion">NBA Champion</span>';
    }
    var labels = ['exited R1', 'exited R2', 'exited Conf. finals', 'NBA Finals'];
    return '<span class="po-tag po-tag--steady">' + (labels[r] || ('round ' + r)) + '</span>';
  }

  function renderHonorsBadges(name, season) {
    if (!HONORS || !HONORS.bySeason) return '';
    var h = HONORS.bySeason[name + '|' + season];
    if (!h) return '';
    var bits = [];
    if (h.finalsMvp) bits.push('<span class="po-tag po-tag--champion">Finals MVP</span>');
    if (h.allNbaTeam === 3) bits.push('<span class="po-tag po-tag--riser">All-NBA 1st</span>');
    else if (h.allNbaTeam === 2) bits.push('<span class="po-tag po-tag--riser">All-NBA 2nd</span>');
    else if (h.allNbaTeam === 1) bits.push('<span class="po-tag po-tag--steady">All-NBA 3rd</span>');
    if (h.asg) bits.push('<span class="po-tag po-tag--steady">All-Star</span>');
    return bits.length ? '<span class="po-honors">' + bits.join(' ') + '</span>' : '';
  }

  function renderPlayoffs(name, season) {
    var box = els.playoffs;
    if (!box) return;
    if (!PLAYOFFS) { box.hidden = true; return; }
    var s = PLAYOFFS.splits[name + '|' + season];
    if (!s) {
      box.hidden = false;
      box.innerHTML = '<div class="vh-section-label">Playoffs</div>' +
        '<p class="skills-hint">No postseason games this season.</p>';
      return;
    }
    var d = s.pts_delta;
    var verdict = d === null ? '' :
      d >= 2 ? '<span class="po-tag po-tag--riser">Riser +' + d.toFixed(1) + '</span>' :
      d <= -2 ? '<span class="po-tag po-tag--fader">Fader ' + d.toFixed(1) + '</span>' :
      '<span class="po-tag po-tag--steady">Held serve</span>';
    var champion = !!(s.champion || s.rounds === 4);
    var outcome = playoffOutcomeLabel(s);
    var honors = renderHonorsBadges(name, season);
    var runNote = (typeof s.wins === 'number')
      ? (s.wins + ' playoff win' + (s.wins === 1 ? '' : 's'))
      : '';
    function line(label, po, rs, delta, digits) {
      return '<li class="po-split">' +
        '<span class="po-split__label">' + label + '</span>' +
        '<span class="po-split__rs">RS ' + num2(rs) + '</span>' +
        '<span class="po-split__po">PO ' + num2(po) + '</span>' +
        '<span class="po-split__delta">' + fmtDelta(delta, digits) + '</span></li>';
    }
    box.hidden = false;
    box.innerHTML =
      '<div class="vh-section-label">Playoffs &middot; regular season vs postseason ' +
      outcome + ' ' + honors + ' ' + verdict + '</div>' +
      (runNote ? '<p class="skills-hint">' + runNote +
        (champion ? ' &middot; won the NBA Finals' : '') + '</p>' : '') +
      renderPlayoffSeries(s.series, champion) +
      '<ul class="po-splits">' +
      line('Pts / 100', s.po.PTS100, s.rs.PTS100, s.pts_delta, 1) +
      line('Minutes', s.po.MIN, s.rs.MIN, s.min_delta, 1) +
      line('Usage %', s.po.USG, s.rs.USG, s.usg_delta, 1) +
      line('True Shooting', s.po.TS, s.rs.TS,
           (s.po.TS != null && s.rs.TS != null) ? (s.po.TS - s.rs.TS) : null, 2) +
      '</ul>' +
      renderPlayoffGames(
        (PLAYOFF_PATHS && PLAYOFF_PATHS.paths &&
          PLAYOFF_PATHS.paths[name + '|' + season] &&
          PLAYOFF_PATHS.paths[name + '|' + season].games) || s.games
      ) +
      '<p class="skills-hint">On-court plus-minus per 100 in the playoffs: ' +
      fmtDelta(s.po.PLUS_MINUS, 1) +
      '. Series path lists every round played (including Conf. finals on the way to a title). ' +
      'Outcome badge is the season result. Source: stats.nba.com + Basketball-Reference Finals MVP.</p>';
  }

  function renderMtnnNeighbors(playerIndex) {
    var box = els.mtnn;
    if (!box) return;
    if (!MTNN_READY || !window.VHMtnn) {
      box.hidden = true;
      return;
    }
    var selfName = DATA.players[playerIndex].name;
    var hits = window.VHMtnn.topK(playerIndex, 5, function (i) {
      return DATA.players[i].name !== selfName;
    });
    if (!hits.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    var items = hits.map(function (h) {
      var p = DATA.players[h.id];
      var slug = window.VHDossier.playerSlug(p.name);
      var pct = fmtPredPct(h.sim * 100);
      return '<li><a href="/players?p=' + encodeURIComponent(slug) +
        '&s=' + encodeURIComponent(p.season) + '">' + esc(p.name) +
        '</a> <span class="skills-mtnn__meta">' + esc(p.season) +
        ' &middot; ' + pct + '% craft match</span></li>';
    }).join('');
    box.innerHTML =
      '<div class="vh-section-label">Similar craft profiles (MTNN)</div>' +
      '<p class="skills-hint">Skill-aware 48-d neighbors from the promoted embedding — same space daily puzzles grade in.</p>' +
      '<ol class="skills-mtnn__list">' + items + '</ol>';
  }

  function pickPlayer(slug, season) {
    if (!INDEX[slug]) return;
    current.slug = slug;
    current.season = season || INDEX[slug].rows[INDEX[slug].rows.length - 1].season;
    els.search.value = INDEX[slug].name;
    els.suggest.innerHTML = '';
    renderProfile();
  }

  // ---- search ----

  function fold(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function renderSuggest() {
    var q = fold(els.search.value.trim());
    if (q.length < 2) { els.suggest.innerHTML = ''; return; }
    var hits = [];
    for (var k = 0; k < ORDER.length && hits.length < MAX_SUGGEST; k++) {
      var rec = INDEX[ORDER[k]];
      if (fold(rec.name).indexOf(q) !== -1) hits.push(rec);
    }
    els.suggest.innerHTML = hits.map(function (rec) {
      var span = rec.rows.length > 1 ?
        rec.rows[0].season + '&ndash;' + rec.rows[rec.rows.length - 1].season :
        rec.rows[0].season;
      return '<li><button type="button" data-slug="' + esc(rec.slug) + '">' +
        '<span>' + esc(rec.name) + '</span>' +
        '<span class="skills-suggest__meta">' + span + ' &middot; ' +
        rec.rows.length + ' season' + (rec.rows.length === 1 ? '' : 's') + '</span>' +
        '</button></li>';
    }).join('');
  }

  // ---- leaderboard ----

  // Boards sort by the era-z linear composite itself (weights ship in
  // skills.json), so 99-grade ties rank honestly across eras instead of
  // falling back to recency.

  // ---- Steals of the Draft: draft expectation vs actual career skill ----
  // Career overall = mean of per-season skill means across charted seasons
  // (not peak — one hot year shouldn't top the board).
  //
  // Steals and busts need OPPOSITE eligibility rules, and using one rule for
  // both is how the board came to hide its own subject matter:
  //
  //   steal — has to have proven it, so require a real career (5 charted
  //     seasons). Undrafted players are eligible: being passed over by all 60
  //     picks is the largest expectation there is to beat.
  //   bust  — measured by elapsed opportunity, NOT by survival. Screening on
  //     seasons played drops precisely the players who washed out. Instead
  //     require that enough years have passed since the draft to judge, and
  //     let a short career count as evidence rather than as a disqualifier.
  //     Undrafted players cannot bust: there was no expectation to miss.
  //     Because a short career is the evidence, a bust's career must also fall
  //     entirely inside the data window — otherwise a pre-1996 All-Star whose
  //     prime we never charted (Tom Chambers, Xavier McDaniel) tops the board.
  //     Steals are exempt: 5 charted seasons already rule that failure out, and
  //     the window would drop Ben Wallace, the canonical undrafted steal.
  //
  // Because the two pools differ, percentiles are computed per board.
  var DRAFT = {};
  var STEAL_MIN_SEASONS = 5;
  var BUST_MATURITY_YEARS = 5;
  var PO_BONUS_MAX = 10;

  // Data window, derived rather than pinned.
  var SEASON_SPAN = null;
  function seasonSpan() {
    if (SEASON_SPAN) return SEASON_SPAN;
    var lo = Infinity, hi = 0;
    DATA.players.forEach(function (p) {
      var v = parseInt(p.season.slice(0, 4), 10);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    });
    SEASON_SPAN = { first: lo, latest: hi };
    return SEASON_SPAN;
  }

  function seasonSkillMean(rowIndex) {
    var g = SKILLS.grades[rowIndex];
    return g.reduce(function (a, b) { return a + b; }, 0) / g.length;
  }

  // Minutes-weighted, so a 200-minute cameo season cannot pull a career mean
  // around as hard as a 2,900-minute one.
  function careerSkillMean(rec) {
    if (!rec.rows.length) return null;
    var sum = 0, mins = 0;
    rec.rows.forEach(function (rr) {
      var m = DATA.players[rr.i].total_min || 0;
      sum += seasonSkillMean(rr.i) * m;
      mins += m;
    });
    if (!mins) return null;
    return sum / mins;
  }

  // A bust's career has to be observable from its start.
  function observedFromStart(rec, ped) {
    var span = seasonSpan();
    if (ped.undrafted) {
      var first = Infinity;
      rec.rows.forEach(function (rr) {
        var v = parseInt(rr.season.slice(0, 4), 10);
        if (v < first) first = v;
      });
      return first > span.first;
    }
    return !!ped.draft_year && ped.draft_year >= span.first;
  }

  // Mid-rank percentile. Ties MUST share a rank: 364 second-round picks carry
  // the identical expect_slot of 0.10, and ranking them by position in the
  // array handed otherwise-identical players expectation percentiles 28 points
  // apart — a swing bigger than most real steal scores.
  function pctRank(values) {
    var idx = values.map(function (v, i) { return i; })
      .sort(function (a, b) { return values[a] - values[b]; });
    var out = new Array(values.length);
    var r = 0;
    while (r < idx.length) {
      var j = r;
      while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[r]]) j++;
      var mid = ((r + j) / 2 + 0.5) / values.length * 100;
      for (var k = r; k <= j; k++) out[idx[k]] = mid;
      r = j + 1;
    }
    return out;
  }

  // playoffs.json carries a row only for seasons a player actually reached the
  // postseason, so a missing key is a genuine "did not make it".
  function playoffRecord(rec) {
    var apps = 0, prod = 0;
    if (PLAYOFFS && PLAYOFFS.splits) {
      rec.rows.forEach(function (rr) {
        var s = PLAYOFFS.splits[rec.name + '|' + rr.season];
        if (s && s.po && s.po.GP > 0) { apps++; prod += s.po.PTS100 || 0; }
      });
    }
    return { apps: apps, rate: apps / rec.rows.length, prod: apps ? prod / apps : null };
  }

  function computeDraft(mode) {
    // PLAYOFFS is null only while its fetch is in flight; scoring now would
    // bake in a zero playoff bonus for everyone.
    if (!PEDIGREE || PLAYOFFS === null) return null;
    if (DRAFT[mode]) return DRAFT[mode];
    var cutoff = seasonSpan().latest - BUST_MATURITY_YEARS;
    var pool = [];
    ORDER.forEach(function (slug) {
      var rec = INDEX[slug];
      var ped = PEDIGREE.players[rec.name];
      if (!ped) return;
      if (mode === 'steal') {
        if (rec.rows.length < STEAL_MIN_SEASONS) return;
      } else {
        if (ped.undrafted || !ped.draft_year) return;
        if (ped.draft_year > cutoff) return;
        if (!observedFromStart(rec, ped)) return;
      }
      var career = careerSkillMean(rec);
      if (career === null) return;
      pool.push({ rec: rec, ped: ped, career: career, po: playoffRecord(rec) });
    });

    var actualPct = pctRank(pool.map(function (p) { return p.career; }));
    var expectPct = pctRank(pool.map(function (p) { return p.ped.expect_slot; }));

    // Playoff credit is a BONUS and never a penalty: reaching the postseason is
    // a team outcome, so a steal stranded on a bad franchise loses nothing,
    // while a player who showed up in the playoffs gains. Production is ranked
    // only among players who actually appeared.
    var withProd = [];
    pool.forEach(function (p, i) { if (p.po.prod !== null) withProd.push(i); });
    var prodPct = pctRank(withProd.map(function (i) { return pool[i].po.prod; }));
    var prodOf = {};
    withProd.forEach(function (i, k) { prodOf[i] = prodPct[k]; });

    DRAFT[mode] = pool.map(function (p, i) {
      var bonus = PO_BONUS_MAX * (0.5 * p.po.rate + 0.5 * ((prodOf[i] || 0) / 100));
      return {
        name: p.rec.name, slug: window.VHDossier.playerSlug(p.rec.name),
        overall: Math.round(p.career),
        seasons: p.rec.rows.length,
        poApps: p.po.apps,
        pick: p.ped.overall,
        roundNo: p.ped.round, year: p.ped.draft_year, team: p.ped.team,
        steal: Math.round(actualPct[i] + bonus - expectPct[i]),
      };
    });
    return DRAFT[mode];
  }

  function renderDraftBoard(mode) {
    var d = computeDraft(mode);
    if (!d) { els.board.innerHTML = '<li class="skills-board__empty">Loading draft data…</li>'; return; }
    d = d.slice();
    d.sort(function (a, b) { return mode === 'steal' ? b.steal - a.steal : a.steal - b.steal; });
    els.board.innerHTML = d.slice(0, BOARD_ROWS).map(function (r) {
      var pickLbl = r.pick
        ? '#' + r.pick + (r.roundNo === 2 ? ' R2' : '') +
          (r.year ? ' ’' + String(r.year).slice(2) : '')
        : 'undrafted';
      var cls = r.steal >= 0 ? 'po-tag--riser' : 'po-tag--fader';
      return '<li>' +
        '<span class="skills-board__name" data-slug="' + esc(r.slug) +
        '">' + esc(r.name) + '</span>' +
        '<span class="skills-board__season">' + pickLbl + ' &middot; career ' + r.overall +
        ' &middot; ' + r.seasons + ' yr' +
        (r.poApps ? ' &middot; ' + r.poApps + ' playoff yr' : '') + '</span>' +
        '<span class="skills-board__grade po-tag ' + cls + '">' +
        (r.steal >= 0 ? '+' : '') + r.steal + '</span>' +
        '</li>';
    }).join('');
  }

  function renderWideBoard(wideKey) {
    var season = els.boardSeason.value;
    var rows = [];
    for (var i = 0; i < DATA.players.length; i++) {
      var p = DATA.players[i];
      if (season && p.season !== season) continue;
      var wg = wideGrades(p.name, p.season);
      if (!wg || wg[wideKey] === undefined) continue;
      rows.push({ i: i, grade: wg[wideKey] });
    }
    rows.sort(function (a, b) { return b.grade - a.grade; });
    els.board.innerHTML = rows.slice(0, BOARD_ROWS).map(function (row) {
      var p = DATA.players[row.i];
      var slug = window.VHDossier.playerSlug(p.name);
      return '<li>' +
        '<span class="skills-board__name" data-slug="' + esc(slug) +
        '" data-season="' + esc(p.season) + '">' + esc(p.name) + '</span>' +
        '<span class="skills-board__season">' + esc(p.season) + '</span>' +
        '<span class="skills-board__grade">' + row.grade + '</span>' +
        '</li>';
    }).join('');
    if (!rows.length) {
      els.board.innerHTML = '<li class="skills-hint">No tracked grades for this filter.</li>';
    }
  }

  function renderBoard() {
    var mode = els.boardSkill.value;
    if (mode === 'steal' || mode === 'bust') {
      els.boardSeason.disabled = true;
      renderDraftBoard(mode);
      return;
    }
    if (mode && mode.indexOf('wide:') === 0) {
      els.boardSeason.disabled = false;
      renderWideBoard(mode.slice(5));
      return;
    }
    els.boardSeason.disabled = false;
    var j = parseInt(mode || '0', 10);
    var season = els.boardSeason.value;
    var rows = [];
    for (var i = 0; i < DATA.players.length; i++) {
      if (season && DATA.players[i].season !== season) continue;
      rows.push(i);
    }
    var featIdx = {};
    DATA.features.forEach(function (f, k) { featIdx[f] = k; });
    var w = SKILLS.skills[j].w;
    var volCols = ['FGA', 'FTA', 'AST'].map(function (f) { return featIdx[f]; })
      .filter(function (k) { return k !== undefined; });
    var score = {}, vol = {};
    rows.forEach(function (i) {
      var s = 0, v = DATA.players[i].v;
      for (var f in w) s += w[f] * v[featIdx[f]];
      score[i] = s;
      vol[i] = volCols.reduce(function (a, k) { return a + v[k]; }, 0);
    });
    // Primary: composite score; ties broken by volume/usage proxy (higher first).
    rows.sort(function (a, b) {
      return score[b] - score[a] || vol[b] - vol[a];
    });
    els.board.innerHTML = rows.slice(0, BOARD_ROWS).map(function (i) {
      var p = DATA.players[i];
      var slug = window.VHDossier.playerSlug(p.name);
      return '<li>' +
        '<span class="skills-board__name" data-slug="' + esc(slug) +
        '" data-season="' + esc(p.season) + '">' + esc(p.name) + '</span>' +
        '<span class="skills-board__season">' + esc(p.season) + '</span>' +
        '<span class="skills-board__grade">' + SKILLS.grades[i][j] + '</span>' +
        '</li>';
    }).join('');
  }

  // ---- wiring ----

  function setupControls() {
    els.search.addEventListener('input', renderSuggest);
    els.suggest.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-slug]');
      if (btn) pickPlayer(btn.getAttribute('data-slug'));
    });
    els.seasons.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-season]');
      if (!btn) return;
      current.season = btn.getAttribute('data-season');
      renderProfile();
    });
    els.boardSkill.addEventListener('change', renderBoard);
    els.boardSeason.addEventListener('change', renderBoard);
    els.board.addEventListener('click', function (ev) {
      var name = ev.target.closest('.skills-board__name');
      if (name) {
        if (global.VHPlayersPage) global.VHPlayersPage.showTab('profile', { skipHistory: true });
        pickPlayer(name.getAttribute('data-slug'), name.getAttribute('data-season'));
      }
    });
  }

  function applyDeepLink() {
    var qp = new URLSearchParams(location.search);
    var slug = qp.get('p');
    if (slug && INDEX[slug]) {
      pickPlayer(slug, qp.get('s') || '');
      if (global.VHPlayersPage) global.VHPlayersPage.showTab('profile', { skipHistory: true });
    }
  }

  function init() {
    if (!document.getElementById('skills-search')) return;
    initDom();
    Promise.all([
      fetch('assets/vectors.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
      }),
      fetch('assets/skills.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
      })
    ]).then(function (loaded) {
      DATA = loaded[0];
      SKILLS = loaded[1];
      if (SKILLS.grades.length !== DATA.players.length) {
        throw new Error('skills/vectors misaligned');
      }
      buildIndex();
      fillControls();
      setupControls();
      els.search.disabled = false;
      els.boardSkill.disabled = false;
      els.boardSeason.disabled = false;
      renderBoard();
      applyDeepLink();
      // Playoff Lens is optional — dormant until an operator commits
      // assets/playoffs.json. Fetch once, fail soft to `false`.
      fetch('assets/playoffs.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (po) {
          PLAYOFFS = po || false;
          if (PLAYOFFS && current.slug) renderProfile();
          // The draft boards fold playoff credit into their scores, so any
          // board drawn while this fetch was in flight has to be rebuilt.
          DRAFT = {};
          renderBoard();
        })
        .catch(function () { PLAYOFFS = false; DRAFT = {}; renderBoard(); });
      fetch('assets/playoff_paths.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (pp) {
          PLAYOFF_PATHS = pp || false;
          if (PLAYOFF_PATHS && current.slug) renderProfile();
        })
        .catch(function () { PLAYOFF_PATHS = false; });
      fetch('assets/honors.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ho) {
          HONORS = ho || false;
          if (HONORS && current.slug) renderProfile();
        })
        .catch(function () { HONORS = false; });
      // Steals of the Draft is optional — dormant until an operator commits
      // assets/pedigree.json. Adds two board modes when it lands.
      fetch('assets/pedigree.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ped) {
          PEDIGREE = ped || false;
          if (PEDIGREE) addDraftBoardModes();
        })
        .catch(function () { PEDIGREE = false; });
      // Wide (masked) skills — post / transition / motor / gravities, 2015-16+.
      fetch('assets/skills_wide.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (w) {
          WIDE = w || false;
          if (WIDE) {
            addWideBoardModes();
            if (current.slug) renderProfile();
          }
        })
        .catch(function () { WIDE = false; });
      fetch('assets/archetype_assignments.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (aa) {
          ARCH_ASSIGN = aa || false;
          if (ARCH_ASSIGN && current.slug) renderProfile();
        })
        .catch(function () { ARCH_ASSIGN = false; });
      // Per-season league mean/SD, so the predicted/actual columns can be shown
      // as real per-100 numbers instead of z-scores. Optional: absent -> z.
      fetch('assets/season_norms.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (sn) {
          SEASON_NORMS = sn || null;
          if (SEASON_NORMS && current.slug) renderProfile();
        })
        .catch(function () { SEASON_NORMS = null; });
      // Next-season predicted vs actual (pending on latest charted season).
      fetch('assets/next_profile_eval.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ne) {
          NEXT_EVAL = ne || false;
          if (NEXT_EVAL && current.slug) renderProfile();
        })
        .catch(function () { NEXT_EVAL = false; });
      window.VHMtnn.load(function (ok) {
        MTNN_READY = !!ok;
        if (MTNN_READY && current.slug) renderProfile();
      });
    }).catch(function (err) {
      els.empty.textContent = 'Could not load the skills data (' + err.message + ').';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.addEventListener('vh:players-tab', function (ev) {
    var d = ev.detail || {};
    if (d.tab === 'profile' && d.slug && INDEX[d.slug]) {
      pickPlayer(d.slug, d.season || '');
    }
    if (d.tab === 'leaderboard') {
      var board = document.getElementById('board-skill');
      if (board && d.skill !== undefined) board.value = String(d.skill);
      renderBoard();
    }
  });

  global.VHPlayersSkills = { pickPlayer: pickPlayer };
})(window);
