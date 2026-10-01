/* Player References — directory, dossiers, filters */
(function (global) {
  'use strict';

  var DATA_URL = 'assets/vectors.json';
  var SWINGS_URL = 'assets/playoff-swings.json';
  var POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
  var MAX_ROWS = 400;

  var els = {};
  var PLAYERS = [];
  var SWINGS = {}; // normalized name -> [{season, rs_pts100, po_pts100, delta, po_gp}]
  var state = { q: '', pos: '', arch: '', letter: '' };
  var dossierTriggerEl = null;

  // Same normalization as pipeline/build_playoff_swings.py: accent-fold,
  // lowercase, strip non-alphanumerics.
  function normName(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function shortSeason(season) {
    // '2024-25' -> "'25"
    var m = /(\d{2})$/.exec(season);
    return m ? "'" + m[1] : season;
  }

  function fmtDelta(d) {
    var sign = d > 0 ? '+' : d < 0 ? '\u2212' : '';
    return sign + Math.abs(d).toFixed(1);
  }

  function swingBadge(name) {
    var rows = SWINGS[normName(name)];
    if (!rows || !rows.length) return '';
    var best = rows.reduce(function (a, b) {
      return Math.abs(b.delta) > Math.abs(a.delta) ? b : a;
    });
    var up = best.delta > 0;
    var arrow = up ? '\u25B2' : '\u25BC';
    var title = 'Playoff scoring swing ' + best.season + ': ' +
      best.rs_pts100.toFixed(1) + ' \u2192 ' + best.po_pts100.toFixed(1) +
      ' pts/100 over ' + best.po_gp + ' games. See Insights \u211610.';
    return ' <span class="swing-badge ' + (up ? 'swing-up' : 'swing-down') + '"' +
      ' title="' + global.VHDossier.escapeHtml(title) + '">' +
      arrow + ' ' + fmtDelta(best.delta) + ' ' + shortSeason(best.season) + '</span>';
  }

  function swingsSection(name) {
    var rows = SWINGS[normName(name)];
    if (!rows || !rows.length) return '';
    var sorted = rows.slice().sort(function (a, b) {
      return Math.abs(b.delta) - Math.abs(a.delta);
    });
    var html = '<h4 class="vh-dossier__h4">Playoff swings</h4><div class="vh-dossier__swings">';
    sorted.forEach(function (r) {
      var up = r.delta > 0;
      html += '<div class="vh-dossier__row"><span class="swing-delta ' +
        (up ? 'up' : 'down') + '">' + (up ? '\u25B2' : '\u25BC') + ' ' +
        fmtDelta(r.delta) + '</span><span>' + global.VHDossier.escapeHtml(r.season) +
        '</span><span class="swing-note">' + r.rs_pts100.toFixed(1) + ' \u2192 ' +
        r.po_pts100.toFixed(1) + ' pts/100 \u00B7 ' + r.po_gp + ' games</span></div>';
    });
    html += '<p class="swing-more"><a href="/insights#playoff-swings">' +
      'How May changes scorers (Insight \u211610) \u2192</a></p></div>';
    return html;
  }

  function initDom() {
    els.search = document.getElementById('wiki-search');
    els.filterPos = document.getElementById('wiki-filter-pos');
    els.filterArch = document.getElementById('wiki-filter-arch');
    els.alphabet = document.getElementById('wiki-alphabet');
    els.count = document.getElementById('wiki-count');
    els.list = document.getElementById('wiki-list');
    els.dossierBackdrop = document.getElementById('dossier-backdrop');
    els.dossierModal = document.getElementById('dossier-modal');
    els.dossierTitle = document.getElementById('dossier-title');
    els.dossierBody = document.getElementById('dossier-body');
    els.dossierSourceLink = document.getElementById('dossier-source-link');
    els.dossierClose = document.getElementById('dossier-close');
  }

  function buildPlayerIndex(data) {
    var bySlug = {};
    var order = [];
    for (var i = 0; i < data.players.length; i++) {
      var p = data.players[i];
      var slug = global.VHDossier.playerSlug(p.name);
      var rec = bySlug[slug];
      if (!rec) {
        rec = { name: p.name, slug: slug, seasons: [], positions: {}, archetypes: {} };
        bySlug[slug] = rec;
        order.push(slug);
      }
      rec.seasons.push(p.season);
      if (typeof p.p === 'number' && POSITIONS[p.p]) rec.positions[POSITIONS[p.p]] = true;
      if (typeof p.c === 'number' && data.clusters[p.c]) rec.archetypes[data.clusters[p.c]] = true;
    }
    return order.map(function (slug) {
      var rec = bySlug[slug];
      var seasons = rec.seasons.slice().sort();
      var teams = global.VHPlayerRoster.teamsForSeasons(rec.name, seasons);
      return {
        name: rec.name,
        slug: rec.slug,
        span: seasons.length > 1 ? seasons[0] + '\u2013' + seasons[seasons.length - 1] : seasons[0],
        seasonCount: seasons.length,
        teams: teams,
        latestTeam: teams.length ? teams[teams.length - 1] : '',
        positions: Object.keys(rec.positions).sort(),
        archetypes: Object.keys(rec.archetypes).sort()
      };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function populateFilters(data) {
    POSITIONS.forEach(function (pos) {
      var opt = document.createElement('option');
      opt.value = pos;
      opt.textContent = pos;
      els.filterPos.appendChild(opt);
    });
    data.clusters.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      els.filterArch.appendChild(opt);
    });
  }

  function buildAlphabet() {
    var present = {};
    PLAYERS.forEach(function (p) { present[p.name[0].toUpperCase()] = true; });
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    els.alphabet.innerHTML = letters.map(function (l) {
      var has = !!present[l];
      return '<button type="button" data-letter="' + l + '"' +
        (has ? '' : ' class="is-disabled" disabled') + '>' + l + '</button>';
    }).join('');
  }

  function matches(p) {
    if (state.letter && p.name[0].toUpperCase() !== state.letter) return false;
    if (state.pos && p.positions.indexOf(state.pos) === -1) return false;
    if (state.arch && p.archetypes.indexOf(state.arch) === -1) return false;
    if (state.q && p.name.toLowerCase().indexOf(state.q) === -1) return false;
    return true;
  }

  function render() {
    var filtered = PLAYERS.filter(matches);
    els.count.textContent = filtered.length + ' player' + (filtered.length === 1 ? '' : 's') +
      (filtered.length > MAX_ROWS ? ' \u2014 showing first ' + MAX_ROWS + ', narrow your search' : '');
    var shown = filtered.slice(0, MAX_ROWS);
    if (shown.length === 0) {
      els.list.innerHTML = '<li><div class="wiki-empty">No players match. Try a different search or clear filters.</div></li>';
      return;
    }
    els.list.innerHTML = shown.map(function (p) {
      var teamMeta = p.teams.length ?
        (p.teams.length > 3 ? p.teams.slice(0, 3).join('/') + '+' : p.teams.join('/')) : '';
      return '<li class="wiki-row-wrap">' +
        '<button type="button" class="wiki-row" data-slug="' + p.slug + '" data-name="' +
        global.VHDossier.escapeHtml(p.name) + '">' +
        '<span class="wiki-row__name">' + global.VHDossier.escapeHtml(p.name) +
        (teamMeta ? ' <span class="vh-team-tag">' + global.VHDossier.escapeHtml(teamMeta) + '</span>' : '') +
        swingBadge(p.name) +
        '</span>' +
        '<span class="wiki-row__meta">' + p.positions.join('/') + ' &middot; ' + p.span + '</span>' +
        '</button>' +
        '<button type="button" class="wiki-row__grades vh-link-btn" data-skills-slug="' + p.slug +
        '" title="Open skill profile">Grades</button></li>';
    }).join('');
  }

  function openDossier(slug, name, triggerEl) {
    dossierTriggerEl = triggerEl || null;
    els.dossierTitle.textContent = name + ' \u2014 dossier';
    els.dossierBody.innerHTML = '<p class="vh-dossier__p">Loading&hellip;</p>';
    els.dossierSourceLink.href = global.VHDossier.dossierGithubUrl(slug);
    els.dossierBackdrop.hidden = false;
    document.body.classList.add('vh-modal-open');
    els.dossierClose.focus();

    function showMarkdown() {
      return global.VHDossier.fetchDossierMarkdown(slug)
        .then(function (md) {
          els.dossierBody.innerHTML = global.VHDossier.renderDossierMarkdown(md);
        });
    }

    function showDataDossier() {
      // Data dossier first (works for every player); markdown wiki as fallback.
      if (global.VHPlayerDossier) {
        return global.VHPlayerDossier.renderInto(els.dossierBody, name)
          .then(function (ok) {
            if (!ok) throw new Error('no data dossier');
            els.dossierSourceLink.href = 'methods.html#dossier';
          });
      }
      return Promise.reject(new Error('no renderer'));
    }

    showDataDossier()
      .catch(showMarkdown)
      .catch(function () {
        els.dossierBody.innerHTML =
          '<p class="vh-dossier__p">Could not load this dossier right now. Use "View source" below.</p>';
      });
  }

  function closeDossier() {
    els.dossierBackdrop.hidden = true;
    document.body.classList.remove('vh-modal-open');
    if (dossierTriggerEl && dossierTriggerEl.focus) dossierTriggerEl.focus();
    dossierTriggerEl = null;
  }

  function setupControls() {
    els.search.addEventListener('input', function () {
      state.q = els.search.value.trim().toLowerCase();
      render();
    });
    els.filterPos.addEventListener('change', function () {
      state.pos = els.filterPos.value;
      render();
    });
    els.filterArch.addEventListener('change', function () {
      state.arch = els.filterArch.value;
      render();
    });
    els.alphabet.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-letter]');
      if (!btn || btn.disabled) return;
      var letter = btn.getAttribute('data-letter');
      state.letter = state.letter === letter ? '' : letter;
      Array.prototype.forEach.call(els.alphabet.querySelectorAll('button'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-letter') === state.letter);
      });
      render();
    });
    els.list.addEventListener('click', function (ev) {
      var grades = ev.target.closest('[data-skills-slug]');
      if (grades) {
        ev.preventDefault();
        global.dispatchEvent(new CustomEvent('vh:players-tab', {
          detail: { tab: 'profile', slug: grades.getAttribute('data-skills-slug') }
        }));
        return;
      }
      var row = ev.target.closest('.wiki-row');
      if (!row) return;
      openDossier(row.getAttribute('data-slug'), row.getAttribute('data-name'), row);
    });
    els.dossierClose.addEventListener('click', function(e){ e.preventDefault(); closeDossier(); });
    els.dossierBackdrop.addEventListener('click', function (ev) {
      // click on backdrop itself or outside modal should close - more forgiving than strict ===
      if (ev.target === els.dossierBackdrop || !ev.target.closest('.vh-modal')) {
        closeDossier();
      }
    });
    // Also close if clicking directly on modal's close area? handled above.
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !els.dossierBackdrop.hidden) closeDossier();
    });
    // Prevent modal clicks from bubbling to backdrop
    els.dossierModal.addEventListener('click', function(ev){
      ev.stopPropagation();
    });
  }

  function init() {
    if (!document.getElementById('wiki-list')) return;
    initDom();
    Promise.all([
      fetch(DATA_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }),
      fetch(SWINGS_URL).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).catch(function () { return { rows: [] }; }),
      global.VHPlayerRoster.load()
    ]).then(function (loaded) {
      var data = loaded[0];
      var swings = loaded[1];
      SWINGS = {};
      (swings.rows || []).forEach(function (r) {
        var k = normName(r.player);
        if (!SWINGS[k]) SWINGS[k] = [];
        SWINGS[k].push(r);
      });
      PLAYERS = buildPlayerIndex(data);
      populateFilters(data);
      buildAlphabet();
      setupControls();
      els.search.disabled = false;
      els.filterPos.disabled = false;
      els.filterArch.disabled = false;
      // Deep link: /players?q=Curry pre-fills the directory search.
      try {
        var q = new URLSearchParams(location.search).get('q');
        if (q) {
          els.search.value = q;
          state.q = q.trim().toLowerCase();
        }
      } catch (e) { /* search stays empty */ }
      render();
    }).catch(function (err) {
      els.count.textContent = 'Could not load the player index (' + err.message + ').';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
