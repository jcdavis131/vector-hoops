/* Team Labs — roster research by team and season */
(function (global) {
  'use strict';

  var DATA = null;
  var SKILLS = null;
  var TEAMS = [];
  var els = {};
  var state = { team: '', season: '' };

  function esc(s) { return global.VHDossier ? global.VHDossier.escapeHtml(s) : String(s); }

  function initDom() {
    els.team = document.getElementById('teams-select');
    els.season = document.getElementById('teams-season');
    els.summary = document.getElementById('teams-summary');
    els.archetypes = document.getElementById('teams-archetypes');
    els.roster = document.getElementById('teams-roster');
    els.hint = document.getElementById('teams-hint');
  }

  function latestSeason(data) {
    var seasons = {};
    data.players.forEach(function (p) { seasons[p.season] = true; });
    return Object.keys(seasons).sort().pop();
  }

  function fillTeams() {
    var abbrs = {};
    TEAMS.forEach(function (t) { abbrs[t.abbr] = t; });
    Object.keys(abbrs).sort().forEach(function (abbr) {
      var opt = document.createElement('option');
      opt.value = abbr;
      opt.textContent = abbr + ' \u00b7 ' + abbrs[abbr].name;
      els.team.appendChild(opt);
    });
  }

  function fillSeasons(data) {
    var seasons = {};
    data.players.forEach(function (p) { seasons[p.season] = true; });
    Object.keys(seasons).sort().reverse().forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      els.season.appendChild(opt);
    });
  }

  function rosterRows() {
    var rows = [];
    for (var i = 0; i < DATA.players.length; i++) {
      var p = DATA.players[i];
      if (p.season !== state.season) continue;
      var abbr = global.VHPlayerRoster.teamAbbr(p.name, p.season);
      if (abbr !== state.team) continue;
      rows.push({ i: i, p: p });
    }
    return rows;
  }

  function meanSkillGrade(indices) {
    if (!SKILLS || !indices.length) return null;
    var sum = 0;
    indices.forEach(function (i) {
      var g = SKILLS.grades[i];
      sum += g.reduce(function (a, b) { return a + b; }, 0) / g.length;
    });
    return Math.round(sum / indices.length);
  }

  function topSkillName(i) {
    if (!SKILLS) return '';
    var g = SKILLS.grades[i];
    var best = 0;
    var label = '';
    SKILLS.skills.forEach(function (sk, j) {
      if (g[j] > best) { best = g[j]; label = sk.label; }
    });
    return label + ' ' + best;
  }

  function render() {
    var rows = rosterRows();
    if (!rows.length) {
      els.summary.innerHTML = '';
      els.archetypes.innerHTML = '';
      els.roster.innerHTML = '<li class="skills-hint">No charted players for this team-season (eligibility gates apply).</li>';
      return;
    }

    var archCounts = {};
    rows.forEach(function (r) {
      var name = DATA.clusters[r.p.c] || 'Unknown';
      archCounts[name] = (archCounts[name] || 0) + 1;
    });
    var archSorted = Object.keys(archCounts).sort(function (a, b) {
      return archCounts[b] - archCounts[a];
    });

    var indices = rows.map(function (r) { return r.i; });
    var teamMean = meanSkillGrade(indices);
  var pmIdx = DATA.features.indexOf('PLUS_MINUS');
    var pmSum = 0;
    rows.forEach(function (r) { pmSum += r.p.v[pmIdx] || 0; });
    var pmMean = Math.round((pmSum / rows.length) * 10) / 10;

    els.summary.innerHTML =
      '<div class="teams-stat"><div class="teams-stat__label">Roster (charted)</div>' +
      '<div class="teams-stat__value">' + rows.length + '</div></div>' +
      '<div class="teams-stat"><div class="teams-stat__label">Mean skill grade</div>' +
      '<div class="teams-stat__value">' + (teamMean !== null ? teamMean : '\u2014') + '</div></div>' +
      '<div class="teams-stat"><div class="teams-stat__label">Mean PM z</div>' +
      '<div class="teams-stat__value">' + pmMean + '</div></div>' +
      '<div class="teams-stat"><div class="teams-stat__label">Archetypes</div>' +
      '<div class="teams-stat__value">' + archSorted.length + '</div></div>';

    var maxArch = archCounts[archSorted[0]] || 1;
    els.archetypes.innerHTML = '<ul class="teams-archetype-bars">' + archSorted.map(function (name) {
      var n = archCounts[name];
      var pct = Math.round(n / rows.length * 100);
      return '<li class="teams-arch-row"><span>' + esc(name) + '</span>' +
        '<span class="teams-arch-row__track"><span class="teams-arch-row__fill" style="width:' +
        Math.round(n / maxArch * 100) + '%"></span></span>' +
        '<span>' + pct + '%</span></li>';
    }).join('') + '</ul>';

    rows.sort(function (a, b) {
      var ga = SKILLS ? SKILLS.grades[a.i].reduce(function (x, y) { return x + y; }, 0) : 0;
      var gb = SKILLS ? SKILLS.grades[b.i].reduce(function (x, y) { return x + y; }, 0) : 0;
      return gb - ga;
    });

    els.roster.innerHTML = rows.map(function (r) {
      var p = r.p;
      var slug = global.VHDossier.playerSlug(p.name);
      var arch = DATA.clusters[p.c] || '';
      var top = topSkillName(r.i);
      var mean = SKILLS ? Math.round(SKILLS.grades[r.i].reduce(function (a, b) { return a + b; }, 0) / 12) : '\u2014';
      return '<li>' +
        '<a href="/players?p=' + encodeURIComponent(slug) + '&s=' + encodeURIComponent(p.season) + '#profile">' +
        esc(p.name) + '</a>' +
        '<span>' + esc(p.season.slice(2)) + '</span>' +
        '<span>' + esc(arch) + '</span>' +
        '<span title="' + esc(top) + '">' + mean + '</span></li>';
    }).join('');

    history.replaceState(null, '', '/teams?t=' + encodeURIComponent(state.team) +
      '&s=' + encodeURIComponent(state.season));
  }

  function applyDeepLink() {
    var qp = new URLSearchParams(location.search);
    if (qp.get('t')) state.team = qp.get('t');
    if (qp.get('s')) state.season = qp.get('s');
  }

  function init() {
    if (!document.getElementById('teams-select')) return;
    initDom();
    Promise.all([
      fetch('assets/vectors.json').then(function (r) { return r.json(); }),
      fetch('assets/skills.json').then(function (r) { return r.json(); }),
      global.VHPlayerRoster.load(),
      global.VHFavoriteTeam.loadTeams()
    ]).then(function (loaded) {
      DATA = loaded[0];
      SKILLS = loaded[1];
      TEAMS = loaded[3] || [];
      fillTeams();
      fillSeasons(DATA);
      applyDeepLink();
      if (!state.season) state.season = latestSeason(DATA);
      if (!state.team && global.VHFavoriteTeam) state.team = global.VHFavoriteTeam.get();
      if (!state.team && els.team.options.length) state.team = els.team.options[1] ? els.team.options[1].value : els.team.options[0].value;
      els.team.value = state.team;
      els.season.value = state.season;
      els.team.disabled = false;
      els.season.disabled = false;
      if (els.hint) els.hint.hidden = true;
      render();
    }).catch(function (err) {
      if (els.hint) els.hint.textContent = 'Could not load team data (' + err.message + ').';
    });

    els.team.addEventListener('change', function () {
      state.team = els.team.value;
      render();
    });
    els.season.addEventListener('change', function () {
      state.season = els.season.value;
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
