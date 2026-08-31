/* Vector Hoops — favorite team preference (device-local).
 *
 * Persists vectorHoops.favoriteTeam (3-letter abbr or empty).
 * Loads assets/teams.json once; wires #favorite-team-select and chips.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'vectorHoops.favoriteTeam';
  var teamsCache = null;
  var THEME_VARS = ['--data-orange', '--data-blue', '--team-primary', '--team-secondary'];

  function get() {
    try {
      var v = localStorage.getItem(LS_KEY);
      return v && typeof v === 'string' ? v : '';
    } catch (e) {
      return '';
    }
  }

  function set(abbr) {
    var val = abbr ? String(abbr) : '';
    try {
      if (val) localStorage.setItem(LS_KEY, val);
      else localStorage.removeItem(LS_KEY);
    } catch (e) { /* storage unavailable */ }
    syncUI();
    try {
      global.dispatchEvent(new CustomEvent('vh:favorite-team', { detail: { abbr: val } }));
    } catch (e2) { /* old browsers */ }
  }

  function loadTeams() {
    if (teamsCache) return Promise.resolve(teamsCache);
    return fetch('assets/teams.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        teamsCache = data.teams || [];
        return teamsCache;
      })
      .catch(function () {
        teamsCache = [];
        return teamsCache;
      });
  }

  function teamByAbbr(abbr) {
    if (!abbr || !teamsCache) return null;
    for (var i = 0; i < teamsCache.length; i++) {
      if (teamsCache[i].abbr === abbr) return teamsCache[i];
    }
    return null;
  }

  function labelFor(abbr) {
    if (!abbr) return '—';
    var t = teamByAbbr(abbr);
    return t ? t.abbr + ' · ' + t.name : abbr;
  }

  function applyTheme(abbr) {
    var root = document.documentElement;
    var body = document.body;
    if (!abbr) {
      THEME_VARS.forEach(function (key) {
        root.style.removeProperty(key);
      });
      if (body) {
        body.classList.remove('vh-team-themed');
        body.removeAttribute('data-team');
      }
      return;
    }
    var t = teamByAbbr(abbr);
    if (!t || !t.primary) {
      applyTheme('');
      return;
    }
    var primary = t.primary;
    var secondary = t.secondary || t.primary;
    root.style.setProperty('--data-orange', primary);
    root.style.setProperty('--data-blue', secondary);
    root.style.setProperty('--team-primary', primary);
    root.style.setProperty('--team-secondary', secondary);
    if (body) {
      body.classList.add('vh-team-themed');
      body.setAttribute('data-team', abbr);
    }
  }

  function fillSelect(selectEl) {
    if (!selectEl) return;
    var cur = get();
    selectEl.innerHTML = '';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = 'No favorite team';
    selectEl.appendChild(none);
    (teamsCache || []).forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t.abbr;
      opt.textContent = t.abbr + ' — ' + t.name;
      selectEl.appendChild(opt);
    });
    selectEl.value = cur;
  }

  function syncChip(chipEl, nameEl) {
    if (!chipEl) return;
    var abbr = get();
    if (!abbr) {
      chipEl.hidden = true;
      return;
    }
    chipEl.hidden = false;
    if (nameEl) nameEl.textContent = labelFor(abbr);
  }

  function syncUI() {
    var abbr = get();
    applyTheme(abbr);
    syncChip(
      document.getElementById('favorite-team-chip'),
      document.getElementById('favorite-team-label')
    );
    var sel = document.getElementById('favorite-team-select');
    if (sel && teamsCache) sel.value = get();
    var landing = document.getElementById('landing-favorite-select');
    if (landing && teamsCache) landing.value = get();
  }

  function wireSelect(selectEl) {
    if (!selectEl || selectEl.__vhFavoriteWired) return;
    selectEl.__vhFavoriteWired = true;
    selectEl.addEventListener('change', function () {
      set(selectEl.value || '');
    });
  }

  function init() {
    loadTeams().then(function () {
      fillSelect(document.getElementById('favorite-team-select'));
      fillSelect(document.getElementById('landing-favorite-select'));
      wireSelect(document.getElementById('favorite-team-select'));
      wireSelect(document.getElementById('landing-favorite-select'));
      syncUI();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.VHFavoriteTeam = {
    LS_KEY: LS_KEY,
    get: get,
    set: set,
    loadTeams: loadTeams,
    labelFor: labelFor,
    syncUI: syncUI,
    applyTheme: applyTheme,
  };
})(typeof window !== 'undefined' ? window : globalThis);
