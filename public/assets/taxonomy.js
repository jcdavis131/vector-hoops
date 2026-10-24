/* Taxonomy of Play Styles — interactive tree renderer. Zero-deps IIFE. */
(function (global) {
  'use strict';

  var JSON_URL = 'assets/taxonomy.json';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ordSuffix(n) {
    var m = n % 100;
    if (m >= 11 && m <= 13) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  // Feature keys are bare stat codes (e.g. "FTA"); strip any stray trailing
  // separator a data build might bake in so labels never render "FTA -".
  function featLabel(f) {
    return String(f).replace(/[\s\-–—·]+$/, '');
  }

  function barRow(feat, sig) {
    var s = sig[feat];
    var pct = s.pct;
    var left = Math.min(pct, 50), width = Math.abs(pct - 50);
    var cls = pct >= 50 ? 'is-pos' : 'is-neg';
    return '<div class="vh-tax__sigrow">' +
      '<span class="vh-tax__signame">' + esc(featLabel(feat)) + '</span>' +
      '<span class="vh-tax__sigbar"><i class="' + cls + '" style="left:' + left + '%;width:' + width + '%"></i><b style="left:50%"></b></span>' +
      '<span class="vh-tax__sigpct">' + pct + '<small>' + ordSuffix(pct) + '</small></span>' +
      '</div>';
  }

  function memberChip(m) {
    return '<a class="chip-link vh-tax__chip" href="/players?p=' + encodeURIComponent(m.slug) + '#profile">' +
      esc(m.name) + '<span>' + esc(m.pos) + '</span></a>';
  }

  function renderArch(a) {
    var sigRows = a.top_features.map(function (f) { return barRow(f, a.stat_signature); }).join('');
    return '<details class="card vh-tax__arch" data-arch="' + esc(a.id) + '">' +
      '<summary class="vh-tax__archsum">' +
      '<span class="vh-tax__archname">' + esc(a.label) + '</span>' +
      '<span class="vh-tax__archmeta">' + a.member_count + ' players · ' +
      a.top_features.slice(0, 3).map(function (f) {
        var p = a.stat_signature[f].pct;
        return esc(featLabel(f)) + ' ' + p + ordSuffix(p);
      }).join(' · ') + '</span>' +
      '<span class="vh-tax__chev" aria-hidden="true">▾</span>' +
      '</summary>' +
      '<div class="vh-tax__archbody">' +
      '<p class="vh-tax__archdesc">' + esc(a.description) + '</p>' +
      '<div class="vh-tax__sig" role="img" aria-label="Stat signature percentiles">' + sigRows + '</div>' +
      '<p class="vh-tax__sigcap">Percentiles vs all 2,426 players, from each archetype\u2019s stat profile. 50th is league-average.</p>' +
      '<div class="vh-tax__members" data-members></div>' +
      '</div></details>';
  }

  function renderFamily(f) {
    var archs = f.children.map(renderArch).join('');
    return '<section class="vh-tax__fam" data-fam="' + esc(f.id) + '">' +
      '<header class="card card--void vh-tax__famhead"><h2>' + esc(f.label) + '</h2>' +
      '<p>' + esc(f.description) + '</p>' +
      '<div class="stat-strip vh-tax__fammeta"><div class="stat"><b>' + f.member_count + '</b>Players</div>' +
      '<div class="stat"><b>' + f.children.length + '</b>Archetypes</div></div></header>' +
      '<div class="vh-tax__archs">' + archs + '</div></section>';
  }

  // Lazy-render members on first open (keeps initial DOM small).
  function wireLazy(root, byId) {
    root.addEventListener('toggle', function (ev) {
      var det = ev.target;
      if (det.tagName !== 'DETAILS' || !det.open) return;
      var box = det.querySelector('[data-members]');
      if (!box || box.getAttribute('data-done') === '1') return;
      var a = byId[det.getAttribute('data-arch')];
      if (!a) return;
      box.innerHTML = a.members.map(memberChip).join('');
      box.setAttribute('data-done', '1');
    }, true);
  }

  function wireSearch(root, data) {
    var input = document.getElementById('tax-search');
    var note = document.getElementById('tax-search-note');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var hits = 0;
      data.families.forEach(function (f) {
        var famHit = false;
        f.children.forEach(function (a) {
          var det = root.querySelector('[data-arch="' + a.id + '"]');
          if (!det) return;
          if (!q) {
            det.style.display = '';
            det.open = false;
            var box = det.querySelector('[data-members]');
            if (box) { box.innerHTML = ''; box.setAttribute('data-done', ''); }
            return;
          }
          var matched = a.members.filter(function (m) {
            return m.name.toLowerCase().indexOf(q) !== -1;
          });
          if (matched.length || a.label.toLowerCase().indexOf(q) !== -1) {
            famHit = true;
            det.style.display = '';
            det.open = true;
            var box2 = det.querySelector('[data-members]');
            if (box2) {
              box2.innerHTML = (matched.length ? matched : a.members.slice(0, 60)).map(memberChip).join('') +
                (matched.length ? '' : '<p class="vh-tax__more">Showing 60 of ' + a.members.length + ' — archetype name matched.</p>');
              box2.setAttribute('data-done', '1');
              hits += matched.length;
            }
          } else {
            det.style.display = 'none';
          }
        });
        var sec = root.querySelector('[data-fam="' + f.id + '"]');
        if (sec) sec.style.display = (!q || famHit) ? '' : 'none';
      });
      if (note) note.textContent = q ? (hits + ' matching players') : '';
    });
  }

  function init() {
    var root = document.getElementById('taxonomy-tree');
    var err = document.getElementById('taxonomy-err');
    if (!root) return;
    fetch(JSON_URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var byId = {};
      data.families.forEach(function (f) {
        f.children.forEach(function (a) { byId[a.id] = a; });
      });
      root.innerHTML = data.families.map(renderFamily).join('');
      wireLazy(root, byId);
      wireSearch(root, data);
      // the hero .stat-strip ships the published counts; refresh them from the data
      var facts = { players: data.n_players, families: data.n_families, archetypes: data.n_archetypes };
      Object.keys(facts).forEach(function (k) {
        var el = document.querySelector('#tax-meta [data-tax="' + k + '"]');
        if (el && typeof facts[k] === 'number') el.textContent = facts[k].toLocaleString();
      });
    }).catch(function (e) {
      if (err) { err.hidden = false; err.textContent = 'Could not load the taxonomy data (' + e.message + ').'; }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  global.VHTaxonomy = { init: init };
})(window);
