/* Player References — skill profiles and leaderboards — v28 collectible */
(function (global) {
  'use strict';

  var POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
  var MAX_SUGGEST = 8;
  var BOARD_ROWS = 20;
  var FEATURED = ['Victor Wembanyama','Nikola Jokic','Stephen Curry','LeBron James','Giannis Antetokounmpo','Luka Doncic','Kevin Durant','Joel Embiid'];

  var els = {};
  var DATA = null;
  var SKILLS = null;
  var INDEX = {};
  var ORDER = [];
  var PEDIGREE = null;
  var WIDE = null;
  var ARCH_ASSIGN = null;
  var NEXT_EVAL = null;
  var MTNN_READY = false;
  var current = { slug: '', season: '' };
  var courtMounted = null;
  var courtModulePromise = null;

  function esc(s) { return window.VHDossier.escapeHtml(s); }

  function ensureCourtModule() {
    if (!courtModulePromise) {
      courtModulePromise = import('./lemmino/player-court-skill-story.js?v=32');
    }
    return courtModulePromise;
  }

  function mountCourtFor(name) {
    var root = document.getElementById('pp-court-skill-root');
    if (!root) return;
    root.innerHTML = '<div style="padding:18px;border:3px dashed #1A150F;border-radius:16px;font-family:ui-monospace,monospace;font-size:12px">Loading career floor + skills evolution for '+esc(name)+'...</div>';
    ensureCourtModule().then(function(mod){
      return mod.mountPlayerCourtStory(root, name, { skillDefs: SKILLS ? SKILLS.skills : null });
    }).then(function(inst){
      courtMounted = inst;
    }).catch(function(e){
      console.warn('court story mount fail', e);
      root.innerHTML = '<div style="padding:12px;font-family:ui-monospace,monospace;font-size:12px;color:#666">Court story unavailable</div>';
    });
  }

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
    // v28
    els.ppName = document.getElementById('pp-name');
    els.ppMega = document.getElementById('pp-mega');
    els.ppRarity = document.getElementById('pp-rarity');
    els.ppFeatured = document.getElementById('pp-featured');
    els.ppEmptyWrap = document.getElementById('pp-empty');
    els.ppRandom = document.getElementById('pp-random');
    els.ppQuickRow = document.getElementById('pp-quick-row');
    els.ppDiscoverRow = document.getElementById('pp-discover-row');
    els.ppWideWrap = document.getElementById('pp-wide-wrap');
    els.ppShell = document.getElementById('pp-shell');
  }

  function buildIndex() {
    // Unique key = slug (name) + disambiguation via pid/birthYear if needed.
    // Fixes Gary Payton (1996-2007) vs Gary Payton II (2017-2026) which previously
    // merged because canonical_name stripped Jr/II.
    // User wants name+dob uniqueness — we use pid (unique per person) + birthYear as dob proxy.
    for (var i = 0; i < DATA.players.length; i++) {
      var p = DATA.players[i];
      var baseSlug = window.VHDossier.playerSlug(p.name);
      var pid = p.pid || p.player_id || null;
      var birth = p.birthYear || p.dob || '';
      var key = baseSlug;
      // If same slug already taken by a different pid/birth, disambiguate
      if (INDEX[key] && pid && INDEX[key].pid && INDEX[key].pid!==pid) {
        key = baseSlug + '--' + pid; // e.g., gary-payton--1627780
      } else if (INDEX[key] && birth && INDEX[key].birthYear && String(INDEX[key].birthYear)!==String(birth)) {
        key = baseSlug + '--' + String(birth).slice(0,4);
      }
      // also if slug collision but same person (same pid) keep same
      if (!INDEX[key]) {
        INDEX[key] = { name: p.name, slug: baseSlug, key: key, pid: pid, birthYear: birth, rows: [], canonicalSlug: baseSlug };
        ORDER.push(key);
      }
      // ensure pid stored on rec for later checks
      if (pid && !INDEX[key].pid) INDEX[key].pid=pid;
      if (birth && !INDEX[key].birthYear) INDEX[key].birthYear=birth;
      INDEX[key].rows.push({ i: i, season: p.season });
    }
    // Also create alias so lookup by baseSlug still works when unique
    var aliasMap={};
    Object.keys(INDEX).forEach(function(k){
      var rec=INDEX[k];
      var base=rec.slug;
      if (!aliasMap[base]) aliasMap[base]=k; // first wins
    });
    // attach alias map for resolve
    window.__playerAliasMap=aliasMap;
    ORDER.sort(function (a, b) {
      var an=INDEX[a].name.toLowerCase(), bn=INDEX[b].name.toLowerCase();
      if (an===bn) {
        var ab=INDEX[a].birthYear||0, bb=INDEX[b].birthYear||0;
        if (ab!==bb) return ab-bb;
        return (INDEX[a].pid||0)-(INDEX[b].pid||0);
      }
      return INDEX[a].name.localeCompare(INDEX[b].name);
    });
    Object.keys(INDEX).forEach(function (k) {
      INDEX[k].rows.sort(function (a, b) { return a.season < b.season ? -1 : 1; });
    });
  }

  function fillControls() {
    if (els.boardSkill) {
      // Clear placeholder "Loading skills..." — otherwise value is that text, parseInt -> NaN, SKILLS.skills[NaN] undefined, crash on .w
      els.boardSkill.innerHTML = '';
    }
    SKILLS.skills.forEach(function (sk, j) {
      var opt = document.createElement('option');
      opt.value = String(j);
      opt.textContent = sk.label;
      els.boardSkill.appendChild(opt);
    });
    if (els.boardSkill) els.boardSkill.value = '0';
    if (els.boardSeason) {
      var existingSeasons = {};
      Array.from(els.boardSeason.options).forEach(function(o){ existingSeasons[o.value]=true; });
      var seasons = {};
      DATA.players.forEach(function (p) { seasons[p.season] = true; });
      Object.keys(seasons).sort().reverse().forEach(function (s) {
        if (!existingSeasons[s]) {
          var opt = document.createElement('option');
          opt.value = s; opt.textContent = s;
          els.boardSeason.appendChild(opt);
        }
      });
    }
  }

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

  function wideGrades(name, season) {
    if (!WIDE) return null;
    return WIDE.grades[name + '|' + season] || null;
  }

  function gradeTier(g) {
    if (g >= 97) return { pill: 'pp-skill__grade--gold', fill: 'pp-skill__fill--gold', badge: 'pp-badge--gold', label: 'ELITE' };
    if (g >= 90) return { pill: 'pp-skill__grade--blue', fill: '', badge: 'pp-badge--elite', label: 'ELITE' };
    if (g >= 75) return { pill: 'pp-skill__grade--green', fill: '', badge: '', label: 'STRONG' };
    if (g >= 60) return { pill: 'pp-skill__grade--mid', fill: '', badge: '', label: 'AVG' };
    return { pill: 'pp-skill__grade--low', fill: '', badge: '', label: 'LOW' };
  }

  function archetypeDotColor(name) {
    var n = (name||'').toLowerCase();
    if (n.indexOf('rim')>=0 || n.indexOf('glass')>=0) return '#D55E00';
    if (n.indexOf('shoot')>=0 || n.indexOf('sniper')>=0) return '#0072B2';
    if (n.indexOf('playmaker')>=0 || n.indexOf('general')>=0) return '#009E73';
    if (n.indexOf('motor')>=0 || n.indexOf('pressure')>=0) return '#CC79A7';
    return '#1A150F';
  }

  // ---- profile v28 ----

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
    var arch = typeof p.c === 'number' && DATA.clusters && DATA.clusters[p.c] ? DATA.clusters[p.c] : '';
    var eraTags = [];
    var eraNative = '';
    if (ARCH_ASSIGN && ARCH_ASSIGN.assignments && ARCH_ASSIGN.assignments[row.i]) {
      var aa = ARCH_ASSIGN.assignments[row.i];
      if (aa.eraNativeName) eraNative = aa.eraNativeName;
      if (aa.eraTags && aa.eraTags.length) eraTags = aa.eraTags;
    }

    // hero name + mega
    if (els.ppName) els.ppName.textContent = rec.name;
    var count99 = 0, count97 = 0, count90 = 0, sum = 0;
    for (var gg=0; gg<grades.length; gg++) {
      sum+=grades[gg];
      if (grades[gg]>=99) count99++;
      if (grades[gg]>=97) count97++;
      if (grades[gg]>=90) count90++;
    }
    var avg = Math.round(sum/grades.length);
    var wg = wideGrades(rec.name, current.season);
    var wCount99 = 0;
    if (wg) {
      Object.keys(wg).forEach(function(k){ if (wg[k]>=99) wCount99++; });
    }
    var total99 = count99 + wCount99;
    if (els.ppMega) {
      if (total99>0) els.ppMega.innerHTML = '<b>'+total99+'</b> × 99';
      else if (count97>0) els.ppMega.innerHTML = '<b>'+count97+'</b> × 97+';
      else if (count90>0) els.ppMega.innerHTML = count90+'× 90+';
      else els.ppMega.textContent = 'AVG '+avg;
      els.ppMega.title = count99+' grades at 99, '+count90+' at 90+, avg '+avg;
    }

    // meta pills
    var metaHtml = '';
    metaHtml += '<span class="pp-meta-pill"><span class="kdot" style="background:#1A150F"></span>'+esc(current.season)+'</span>';
    metaHtml += '<span class="pp-meta-pill">'+esc(pos)+'</span>';
    if (arch) {
      var dot = archetypeDotColor(arch);
      metaHtml += '<span class="pp-meta-pill pp-meta-pill--arch"><span class="kdot" style="background:'+dot+'"></span>'+esc(arch)+'</span>';
    }
    if (eraNative) metaHtml += '<span class="pp-meta-pill" title="Era-native MTNN cluster">'+esc(eraNative)+'</span>';
    eraTags.forEach(function(t){
      var label = (ARCH_ASSIGN.tagLabels && ARCH_ASSIGN.tagLabels[t]) || t;
      metaHtml += '<span class="pp-meta-pill" style="background:#FFFEF7">'+esc(label)+'</span>';
    });
    els.meta.innerHTML = metaHtml;

    // seasons
    els.seasons.innerHTML = rec.rows.map(function (rr) {
      var isActive = rr.season === current.season;
      return '<button type="button" role="tab" data-season="' + esc(rr.season) + '"' +
        (isActive ? ' class="is-active" aria-selected="true"' : ' aria-selected="false"') +
        '>' + esc(rr.season) + '</button>';
    }).join('');

    // rarity row
    var rarityHtml = '';
    if (total99 >= 4) {
      rarityHtml += '<span class="pp-rarity pp-rarity--gold"><b>'+total99+'× 99</b> — rarer than 0.3% of seasons in 12,966 charted. Collector card.</span>';
    } else if (total99 >= 1) {
      rarityHtml += '<span class="pp-rarity pp-rarity--gold"><b>'+total99+'× 99</b> — top 1% that year. Elite signature.</span>';
    } else if (count90 >= 5) {
      rarityHtml += '<span class="pp-rarity pp-rarity--blue"><b>'+count90+'× 90+</b> — two-way star, 88th+ percentile across era.</span>';
    } else if (count90 >= 1) {
      rarityHtml += '<span class="pp-rarity"><b>'+count90+'× 90+</b> — has an elite skill. Average '+avg+'.</span>';
    } else {
      rarityHtml += '<span class="pp-rarity">Avg <b>'+avg+'</b> — role specialist. No 90+ this season.</span>';
    }
    // Add tracking hint
    if (!wg) {
      rarityHtml += '<span class="pp-rarity">No tracking stats pre 2015-16.</span>';
    }
    if (els.ppRarity) els.ppRarity.innerHTML = rarityHtml;

    // badges grid — 90+
    var badges = [];
    SKILLS.skills.forEach(function (sk, j) {
      var g = grades[j];
      if (g >= SKILLS.badgeGrade) {
        var tier = gradeTier(g);
        badges.push({ label: sk.badge, grade: g, tier: tier, key: sk.key });
      }
    });
    if (wg) {
      WIDE.skills.forEach(function (sk) {
        var g = wg[sk.key];
        if (g >= WIDE.badgeGrade) {
          var tier = gradeTier(g);
          badges.push({ label: sk.badge, grade: g, tier: tier, key: 'wide:'+sk.key, wide:true });
        }
      });
    }
    badges.sort(function(a,b){ return b.grade - a.grade; });
    if (!badges.length) {
      els.badges.innerHTML = '<div class="pp-badge pp-badge--muted"><div class="pp-badge__top"><span class="pp-badge__name">No 90+ badges this season</span><span class="pp-badge__grade" style="background:#EEE8D9">—</span></div><div class="pp-badge__bar" style="opacity:.4"><div class="pp-badge__fill" style="width:12%;background:#ccc"></div></div></div>';
    } else {
      els.badges.innerHTML = badges.map(function(b){
        var fillW = Math.max(b.grade, 8);
        var fillColor = b.grade>=97 ? '#1A150F' : b.grade>=90 ? '#0072B2' : b.grade>=75 ? '#009E73' : '#999';
        if (b.wide) fillColor = '#D55E00';
        return '<div class="pp-badge '+(b.tier.badge||'')+(b.wide?' pp-skill--wide':'')+'" title="'+esc(b.label)+' '+b.grade+'">' +
          '<div class="pp-badge__top"><span class="pp-badge__name">'+esc(b.label)+'</span><span class="pp-badge__grade '+(b.tier.pill||'')+'">'+b.grade+'</span></div>' +
          '<div class="pp-badge__bar"><div class="pp-badge__fill" style="width:'+fillW+'%;background:'+fillColor+'"></div></div>' +
          '</div>';
      }).join('');
    }

    // skill bars — main 12
    var barsHtml = SKILLS.skills.map(function (sk, j) {
      var g = grades[j];
      var tier = gradeTier(g);
      var fillColor = g>=97 ? '#1A150F' : g>=90 ? '#0072B2' : g>=75 ? '#009E73' : g>=60 ? '#6B665E' : '#C9C2B4';
      var pct = Math.max(g, 4);
      var subtitle = esc(sk.badge);
      var footLeft = subtitle;
      var footRight = g>=90 ? 'ELITE' : g>=75 ? 'STRONG' : g>=60 ? 'AVG' : 'LOW';
      return '<li class="pp-skill">' +
        '<div class="pp-skill__head"><span class="pp-skill__label">'+esc(sk.label)+'</span><span class="pp-skill__grade '+tier.pill+'">'+g+'</span></div>' +
        '<div class="pp-skill__track"><div class="pp-skill__fill '+tier.fill+'" style="width:'+pct+'%;background:'+fillColor+'"></div></div>' +
        '<div class="pp-skill__foot"><span>'+footLeft+'</span><span>'+footRight+'</span></div>' +
        '</li>';
    }).join('');
    els.bars.innerHTML = barsHtml;

    // wide tracking section
    if (els.ppWideWrap) {
      if (!WIDE) {
        els.ppWideWrap.innerHTML = '';
      } else if (!wg) {
        els.ppWideWrap.innerHTML = '<div class="pp-section pp-wide-head"><div class="pp-section-head">Tracking skills — post / transition / motor</div><div class="pp-rarity">No tracking grades — synergy + hustle begins 2015-16.</div></div>';
      } else {
        var wideHtml = '<div class="pp-section pp-wide-head"><div class="pp-section-head">Tracking skills — 2015-16+ only</div><ul class="pp-skills-grid">'
          + WIDE.skills.map(function(sk){
            var g = wg[sk.key];
            if (g===undefined) return '';
            var tier = gradeTier(g);
            var fillColor = g>=97 ? '#1A150F' : g>=90 ? '#D55E00' : g>=75 ? '#0072B2' : '#6B665E';
            return '<li class="pp-skill pp-skill--wide"><div class="pp-skill__head"><span class="pp-skill__label">'+esc(sk.label)+'</span><span class="pp-skill__grade '+tier.pill+'">'+g+'</span></div><div class="pp-skill__track"><div class="pp-skill__fill" style="width:'+Math.max(g,4)+'%;background:'+fillColor+'"></div></div><div class="pp-skill__foot"><span>'+esc(sk.badge)+'</span><span>TRACK</span></div></li>';
          }).join('') + '</ul></div>';
        els.ppWideWrap.innerHTML = wideHtml;
      }
    }

    renderNextProfile(rec.name, current.season);
    renderPlayoffs(rec.name, current.season);
    renderMtnnNeighbors(row.i);
    mountCourtFor(rec.name);

    els.profile.hidden = false;
    if (els.ppEmptyWrap) els.ppEmptyWrap.hidden = true;
    if (global.VHPlayersPage) {
      global.VHPlayersPage.showTab('profile', { skipHistory: true });
    }
    var url = '/players?p=' + encodeURIComponent(current.slug) +
      '&s=' + encodeURIComponent(current.season) + '#profile';
    history.replaceState(null, '', url);

    // tiny delight: confetti if 99s
    if (total99 >= 3 && window.confetti) {
      try { window.confetti({ particleCount: 24, spread: 50, origin: { y: 0.75 } }); } catch(e){}
    }
  }

  // ---- Playoff Lens (transparent; dormant until assets/playoffs.json lands) ----
  var PLAYOFFS = null;
  var PLAYOFF_PATHS = null;
  var HONORS = null;

  function fmtDelta(v, digits) {
    if (v === null || v === undefined) return '&mdash;';
    var s = v >= 0 ? '+' : '';
    return s + v.toFixed(Math.min(2, digits === undefined ? 1 : digits));
  }
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
  var SEASON_NORMS = null;
  function seasonNormFor(season, key) {
    if (!SEASON_NORMS || !season) return null;
    var s = SEASON_NORMS.seasons && SEASON_NORMS.seasons[season];
    return (s && s.features && s.features[season] && s.features[season]) || (s && s.features && s.features[key]) || null;
    // fallback handled below in more robust way
  }
  // more robust: SEASON_NORMS.seasons[season].features[key]
  function seasonNormForV2(season, key){
    if (!SEASON_NORMS || !season) return null;
    var s = SEASON_NORMS.seasons && SEASON_NORMS.seasons[season];
    return (s && s.features && s.features[key]) || null;
  }
  function realFromZ(z, season, key) {
    if (z === null || z === undefined || !isFinite(z)) return null;
    var n = seasonNormForV2(season, key);
    if (!n) return null;
    return Math.max(-4, Math.min(4, z)) * n.sd + n.mu;
  }
  function fmtReal(v) { var a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2); }
  function fmtStat(z, season, key) { var r = realFromZ(z, season, key); if (r != null) return fmtReal(r); return fmtZ(z); }
  function fmtStatDelta(pred, actual, season, key) {
    var rp = realFromZ(pred, season, key); var ra = realFromZ(actual, season, key);
    if (rp != null && ra != null) { var d = rp - ra; return (d >= 0 ? '+' : '') + fmtReal(d); }
    if (pred == null || actual == null) return '&mdash;'; return fmtZ(pred - actual);
  }
  function fmtZ(v) { if (v === null || v === undefined || !isFinite(v)) return '&mdash;'; var n = Math.round(v * 100) / 100; var s = n >= 0 ? '+' : ''; return s + String(n); }

  function renderNextProfile(name, season) {
    var box = els.nextProfile;
    if (!box) return;
    if (!NEXT_EVAL) { box.hidden = true; return; }
    var row = NEXT_EVAL.rows[name + '|' + season];
    if (!row) { box.hidden = true; return; }
    if (row.status === 'no_next') { box.hidden = true; return; }
    var features = NEXT_EVAL.primaryFeatures || NEXT_EVAL.features || [];
    var labels = NEXT_EVAL.featureLabels || {};
    var allKeys = NEXT_EVAL.features || [];
    var pending = row.status === 'pending';
    var tag = pending ? '<span class="po-tag po-tag--steady" style="border:1.5px solid #1A150F;border-radius:999px;padding:1px 6px;font-size:10px;background:#fff">Prediction only</span>' : '<span class="po-tag po-tag--riser" style="border:1.5px solid #1A150F;border-radius:999px;padding:1px 6px;background:#F0E442">Predicted vs actual</span>';
    var hint = pending ? (esc(row.to) + ' not charted yet. Showing MTNN next-profile prediction only.') : ('From ' + esc(season) + ' → predicted ' + esc(row.to) + ' profile.');
    var head = pending ? '<li class="np-split np-split--head"><span>Stat</span><span>Pred</span></li>' : '<li class="np-split np-split--head"><span>Stat</span><span>Pred</span><span>Actual</span><span>Δ</span></li>';
    var lines = features.map(function (key) {
      var idx = allKeys.indexOf(key); if (idx < 0) return '';
      var pred = row.pred[idx]; var label = labels[key] || key;
      if (pending) return '<li class="np-split"><span>'+esc(label)+'</span><span>'+fmtStat(pred, row.to, key)+'</span></li>';
      var actual = row.actual[idx];
      return '<li class="np-split"><span>'+esc(label)+'</span><span>'+fmtStat(pred, row.to, key)+'</span><span>'+fmtStat(actual, row.to, key)+'</span><span>'+fmtStatDelta(pred, actual, row.to, key)+'</span></li>';
    }).join('');
    box.hidden = false;
    box.innerHTML = '<div class="vh-section-label">Next-season stats '+tag+'</div><p class="skills-hint" style="font-family:ui-monospace,monospace;font-size:11px;color:#666;margin:6px 0">'+hint+'</p><ul class="np-splits">'+head+lines+'</ul>';
  }

  function renderPlayoffSeries(series, champion) {
    if (!series || !series.length) return '';
    return '<ol class="po-series" style="list-style:none;padding:0;display:flex;flex-direction:column;gap:4px;margin:8px 0">' + series.map(function (sr) {
      var won = sr.won !== false && (sr.wins == null || sr.wins > sr.losses);
      var bg = won ? '#F0E442' : '#fff';
      if (sr.finals || sr.label === 'NBA Finals') bg = champion ? '#1A150F' : '#D6EFFF';
      var mark = won ? 'W' : 'L';
      return '<li style="border:1.6px solid #1A150F;border-radius:10px;padding:6px 9px;background:'+bg+';display:flex;justify-content:space-between;gap:8px;font-family:ui-monospace,monospace;font-size:11px"><span>'+esc(sr.label)+' vs '+esc(sr.opp)+'</span><span>'+esc(sr.result)+' '+mark+'</span></li>';
    }).join('') + '</ol>';
  }
  function renderPlayoffGames(games) {
    if (!games || !games.length) return '';
    return '<details style="margin-top:8px"><summary style="font-family:ui-monospace,monospace;font-size:11px;cursor:pointer">Game log ('+games.length+')</summary><ul style="list-style:none;padding:0;margin:6px 0;display:flex;flex-direction:column;gap:2px;font-family:ui-monospace,monospace;font-size:10px">'+games.map(function(g){return '<li style="display:flex;gap:8px;justify-content:space-between;border-bottom:1px dashed #ddd;padding:2px 0"><span>'+esc((g.d||'').slice(5))+' '+esc(g.m||'')+'</span><span>'+esc(g.wl||'')+' '+num2(g.pts)+'/'+num2(g.reb)+'/'+num2(g.ast)+'</span></li>';}).join('')+'</ul></details>';
  }
  function playoffOutcomeLabel(s) {
    var r = s.rounds; if (typeof r !== 'number') return '';
    if (r === 4 || s.champion) return '<span style="border:1.5px solid #1A150F;border-radius:999px;background:#1A150F;color:#fff;padding:1px 6px;font-size:10px">NBA Champion</span>';
    var labels = ['exited R1','exited R2','exited Conf. finals','NBA Finals'];
    return '<span style="border:1.5px solid #1A150F;border-radius:999px;padding:1px 6px;background:#fff;font-size:10px">'+(labels[r]||('round '+r))+'</span>';
  }
  function renderHonorsBadges(name, season) {
    if (!HONORS || !HONORS.bySeason) return '';
    var h = HONORS.bySeason[name + '|' + season]; if (!h) return '';
    var bits = [];
    if (h.finalsMvp) bits.push('<span style="border:1.5px solid #1A150F;border-radius:999px;background:#F0E442;padding:1px 6px">Finals MVP</span>');
    if (h.allNbaTeam === 3) bits.push('<span style="border-radius:999px;background:#F0E442;padding:1px 6px">All-NBA 1st</span>');
    else if (h.allNbaTeam === 2) bits.push('<span style="border-radius:999px;background:#D6EFFF;padding:1px 6px">All-NBA 2nd</span>');
    else if (h.allNbaTeam === 1) bits.push('<span>All-NBA 3rd</span>');
    if (h.asg) bits.push('<span>All-Star</span>');
    return bits.length ? '<span>'+bits.join(' ')+'</span>' : '';
  }
  function renderPlayoffs(name, season) {
    var box = els.playoffs; if (!box) return;
    if (!PLAYOFFS) { box.hidden = true; return; }
    var s = PLAYOFFS.splits[name + '|' + season];
    if (!s) { box.hidden = false; box.innerHTML = '<div class="vh-section-label">Playoffs</div><p style="font-size:11px;color:#666">No postseason games this season.</p>'; return; }
    var champion = !!(s.champion || s.rounds === 4);
    var outcome = playoffOutcomeLabel(s);
    var honors = renderHonorsBadges(name, season);
    box.hidden = false;
    box.innerHTML = '<div class="vh-section-label">Playoffs &middot; RS vs PO '+outcome+' '+honors+'</div>'+renderPlayoffSeries(s.series, champion)+renderPlayoffGames((PLAYOFF_PATHS && PLAYOFF_PATHS.paths && PLAYOFF_PATHS.paths[name + '|' + season] && PLAYOFF_PATHS.paths[name + '|' + season].games) || s.games);
  }

  function renderMtnnNeighbors(playerIndex) {
    var box = els.mtnn; if (!box) return;
    if (!MTNN_READY || !window.VHMtnn) { box.hidden = true; return; }
    var selfName = DATA.players[playerIndex].name;
    var hits = window.VHMtnn.topK(playerIndex, 5, function (i) { return DATA.players[i].name !== selfName; });
    if (!hits.length) { box.hidden = true; return; }
    box.hidden = false;
    var items = hits.map(function (h) {
      var p = DATA.players[h.id]; var slug = window.VHDossier.playerSlug(p.name); var pct = fmtPredPct(h.sim * 100);
      return '<li><a href="/players?p='+encodeURIComponent(slug)+'&s='+encodeURIComponent(p.season)+'">'+esc(p.name)+'</a> <span class="skills-mtnn__meta">'+esc(p.season)+' · '+pct+'% craft match</span></li>';
    }).join('');
    box.innerHTML = '<div class="vh-section-label">Similar craft profiles (MTNN) — who plays like this?</div><p class="skills-hint" style="font-family:ui-monospace,monospace;font-size:11px;color:#666">Click to flip their card.</p><ol class="skills-mtnn__list">'+items+'</ol>';
  }

  function resolveKey(slugOrKey){
    if (INDEX[slugOrKey]) return slugOrKey;
    // alias fallback for old URLs / bare slug when disambiguated
    if (window.__playerAliasMap && window.__playerAliasMap[slugOrKey]) return window.__playerAliasMap[slugOrKey];
    // also try base slug without pid suffix
    var base = String(slugOrKey).split('--')[0];
    if (INDEX[base]) return base;
    if (window.__playerAliasMap && window.__playerAliasMap[base]) return window.__playerAliasMap[base];
    return null;
  }

  function pickPlayer(slug, season) {
    var key=resolveKey(slug);
    if (!key) return;
    current.slug = key;
    current.season = season || INDEX[key].rows[INDEX[key].rows.length - 1].season;
    els.search.value = INDEX[key].name;
    els.suggest.innerHTML = '';
    renderProfile();
  }

  function fold(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function renderSuggest() {
    var q = fold(els.search.value.trim());
    if (q.length < 2) { els.suggest.innerHTML = ''; return; }
    var hits = [];
    for (var k = 0; k < ORDER.length && hits.length < MAX_SUGGEST; k++) {
      var rec = INDEX[ORDER[k]];
      if (fold(rec.name).indexOf(q) !== -1) hits.push(rec);
    }
    els.suggest.innerHTML = hits.map(function (rec) {
      var span = rec.rows.length > 1 ? rec.rows[0].season + '–' + rec.rows[rec.rows.length - 1].season : rec.rows[0].season;
      var keyForClick = rec.key || rec.slug;
      var label = rec.name + (rec.birthYear ? ' ('+String(rec.birthYear).slice(0,4)+')' : '');
      // show dob hint only when same name collision
      return '<li><button type="button" data-slug="' + esc(keyForClick) + '"><span><span class="pp-suggest__name">'+esc(rec.name)+'</span><br><span class="skills-suggest__meta">'+span+' · '+rec.rows.length+' season'+(rec.rows.length===1?'':'s')+(rec.birthYear?' · '+String(rec.birthYear).slice(0,4):'')+'</span></span><span style="font-size:16px">→</span></button></li>';
    }).join('');
  }

  function renderFeatured() {
    if (!els.ppFeatured || !INDEX['victor-wembanyama']) return;
    var html = '';
    FEATURED.forEach(function(name){
      var slug = window.VHDossier.playerSlug(name);
      var rec = INDEX[slug];
      if (!rec) return;
      var last = rec.rows[rec.rows.length-1];
      var g = SKILLS.grades[last.i];
      var c99 = g.filter(function(x){return x>=99;}).length;
      var c90 = g.filter(function(x){return x>=90;}).length;
      var avg = Math.round(g.reduce(function(a,b){return a+b;},0)/g.length);
      html += '<div class="pp-featured__card" data-slug="'+esc(slug)+'"><div class="pp-featured__name">'+esc(name)+'</div><div class="pp-featured__line">'+esc(last.season)+' · avg '+avg+'</div><div class="pp-featured__grade">'+(c99?c99+'×99 ': '')+(c90?c90+'×90+':'avg '+avg)+'</div></div>';
    });
    els.ppFeatured.innerHTML = html;
  }

  // ---- board (unchanged core) ----
  var DRAFT = {};
  var STEAL_MIN_SEASONS = 5;
  var BUST_MATURITY_YEARS = 5;
  var PO_BONUS_MAX = 10;
  var SEASON_SPAN = null;
  function seasonSpan() {
    if (SEASON_SPAN) return SEASON_SPAN;
    var lo = Infinity, hi = 0;
    DATA.players.forEach(function (p) { var v = parseInt(p.season.slice(0,4),10); if (v < lo) lo=v; if (v > hi) hi=v; });
    SEASON_SPAN = { first: lo, latest: hi }; return SEASON_SPAN;
  }
  function seasonSkillMean(rowIndex) { var g = SKILLS.grades[rowIndex]; return g.reduce(function(a,b){return a+b;},0)/g.length; }
  function careerSkillMean(rec) {
    if (!rec.rows.length) return null;
    var sum=0, mins=0;
    rec.rows.forEach(function(rr){ var m=DATA.players[rr.i].total_min||0; sum+=seasonSkillMean(rr.i)*m; mins+=m; });
    if (!mins) return null; return sum/mins;
  }
  function observedFromStart(rec, ped) {
    var span = seasonSpan();
    if (ped.undrafted) {
      var first=Infinity;
      rec.rows.forEach(function(rr){ var v=parseInt(rr.season.slice(0,4),10); if (v<first) first=v; });
      return first > span.first;
    }
    return !!ped.draft_year && ped.draft_year >= span.first;
  }
  function pctRank(values) {
    var idx = values.map(function(v,i){return i;}).sort(function(a,b){return values[a]-values[b];});
    var out = new Array(values.length);
    var r=0;
    while (r<idx.length) {
      var j=r;
      while (j+1<idx.length && values[idx[j+1]]===values[idx[r]]) j++;
      var mid = ((r+j)/2+0.5)/values.length*100;
      for (var k=r;k<=j;k++) out[idx[k]]=mid;
      r=j+1;
    }
    return out;
  }
  function playoffRecord(rec) {
    var apps=0, prod=0;
    if (PLAYOFFS && PLAYOFFS.splits) {
      rec.rows.forEach(function(rr){ var s=PLAYOFFS.splits[rec.name+'|'+rr.season]; if (s && s.po && s.po.GP>0) { apps++; prod+=s.po.PTS100||0; } });
    }
    return { apps: apps, rate: apps/rec.rows.length, prod: apps ? prod/apps : null };
  }
  function computeDraft(mode) {
    if (!PEDIGREE || PLAYOFFS === null) return null;
    if (DRAFT[mode]) return DRAFT[mode];
    var cutoff = seasonSpan().latest - BUST_MATURITY_YEARS;
    var pool=[];
    ORDER.forEach(function(slug){
      var rec=INDEX[slug]; var ped=PEDIGREE.players[rec.name]; if (!ped) return;
      if (mode==='steal') { if (rec.rows.length < STEAL_MIN_SEASONS) return; }
      else { if (ped.undrafted || !ped.draft_year) return; if (ped.draft_year>cutoff) return; if (!observedFromStart(rec, ped)) return; }
      var career=careerSkillMean(rec); if (career===null) return;
      pool.push({ rec: rec, ped: ped, career: career, po: playoffRecord(rec) });
    });
    var actualPct=pctRank(pool.map(function(p){return p.career;}));
    var expectPct=pctRank(pool.map(function(p){return p.ped.expect_slot;}));
    var withProd=[]; pool.forEach(function(p,i){ if (p.po.prod!==null) withProd.push(i); });
    var prodPct=pctRank(withProd.map(function(i){return pool[i].po.prod;}));
    var prodOf={}; withProd.forEach(function(i,k){ prodOf[i]=prodPct[k]; });
    DRAFT[mode]=pool.map(function(p,i){
      var bonus=PO_BONUS_MAX*(0.5*p.po.rate+0.5*((prodOf[i]||0)/100));
      return { name:p.rec.name, slug:window.VHDossier.playerSlug(p.rec.name), overall:Math.round(p.career), seasons:p.rec.rows.length, poApps:p.po.apps, pick:p.ped.overall, roundNo:p.ped.round, year:p.ped.draft_year, team:p.ped.team, steal: Math.round(actualPct[i]+bonus-expectPct[i]) };
    });
    return DRAFT[mode];
  }
  function renderDraftBoard(mode) {
    var d=computeDraft(mode); if (!d) { els.board.innerHTML='<li class="skills-board__empty">Loading draft data…</li>'; return; }
    d=d.slice(); d.sort(function(a,b){return mode==='steal'?b.steal-a.steal:a.steal-b.steal;});
    els.board.innerHTML=d.slice(0, BOARD_ROWS).map(function(r){
      var pickLbl = r.pick ? '#'+r.pick+(r.roundNo===2?' R2':'')+(r.year?' ’'+String(r.year).slice(2):'') : 'undrafted';
      var cls=r.steal>=0?'po-tag--riser':'po-tag--fader';
      return '<li><span class="skills-board__name" data-slug="'+esc(r.slug)+'">'+esc(r.name)+'</span><span class="skills-board__season">'+pickLbl+' · career '+r.overall+' · '+r.seasons+' yr'+(r.poApps?' · '+r.poApps+' playoff yr':'')+'</span><span class="skills-board__grade po-tag '+cls+'">'+(r.steal>=0?'+':'')+r.steal+'</span></li>';
    }).join('');
  }
  function renderWideBoard(wideKey) {
    var season=els.boardSeason.value; var rows=[];
    for (var i=0;i<DATA.players.length;i++) {
      var p=DATA.players[i]; if (season && p.season!==season) continue;
      var wg=wideGrades(p.name, p.season); if (!wg || wg[wideKey]===undefined) continue;
      rows.push({ i:i, grade:wg[wideKey] });
    }
    rows.sort(function(a,b){return b.grade-a.grade;});
    els.board.innerHTML=rows.slice(0, BOARD_ROWS).map(function(row){
      var p=DATA.players[row.i]; var slug=window.VHDossier.playerSlug(p.name);
      return '<li><span class="skills-board__name" data-slug="'+esc(slug)+'" data-season="'+esc(p.season)+'">'+esc(p.name)+'</span><span class="skills-board__season">'+esc(p.season)+'</span><span class="skills-board__grade">'+row.grade+'</span></li>';
    }).join('');
    if (!rows.length) els.board.innerHTML='<li class="skills-hint">No tracked grades for this filter.</li>';
  }
  function renderBoard() {
    var mode=els.boardSkill.value;
    if (mode==='steal' || mode==='bust') { els.boardSeason.disabled=true; renderDraftBoard(mode); return; }
    if (mode && mode.indexOf('wide:')===0) { els.boardSeason.disabled=false; renderWideBoard(mode.slice(5)); return; }
    els.boardSeason.disabled=false;
    var j=parseInt(mode||'0',10);
    if (isNaN(j) || j<0 || j>=SKILLS.skills.length) j=0;
    var season=els.boardSeason.value; var rows=[];
    for (var i=0;i<DATA.players.length;i++) { if (season && DATA.players[i].season!==season) continue; rows.push(i); }
    var featIdx={}; DATA.features.forEach(function(f,k){ featIdx[f]=k; });
    var w=SKILLS.skills[j].w; var volCols=['FGA','FTA','AST'].map(function(f){return featIdx[f];}).filter(function(k){return k!==undefined;});
    var score={}, vol={};
    rows.forEach(function(i){ var s=0, v=DATA.players[i].v; for (var f in w) s+=w[f]*v[featIdx[f]]; score[i]=s; vol[i]=volCols.reduce(function(a,k){return a+v[k];},0); });
    rows.sort(function(a,b){ return score[b]-score[a] || vol[b]-vol[a]; });
    els.board.innerHTML=rows.slice(0, BOARD_ROWS).map(function(i){
      var p=DATA.players[i]; var slug=window.VHDossier.playerSlug(p.name);
      return '<li><span class="skills-board__name" data-slug="'+esc(slug)+'" data-season="'+esc(p.season)+'">'+esc(p.name)+'</span><span class="skills-board__season">'+esc(p.season)+'</span><span class="skills-board__grade">'+SKILLS.grades[i][j]+'</span></li>';
    }).join('');
  }

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
    // v28 quick chips
    if (els.ppQuickRow) {
      els.ppQuickRow.addEventListener('click', function(ev){
        var chip = ev.target.closest('[data-q]');
        if (!chip) return;
        var q = chip.getAttribute('data-q');
        els.search.value = q;
        renderSuggest();
        // try exact match
        var slug = window.VHDossier.playerSlug(q);
        if (INDEX[slug]) pickPlayer(slug);
      });
    }
    if (els.ppDiscoverRow) {
      els.ppDiscoverRow.addEventListener('click', function(ev){
        var chip = ev.target.closest('[data-q]');
        if (!chip) return;
        var q = chip.getAttribute('data-q');
        var slug = window.VHDossier.playerSlug(q);
        if (INDEX[slug]) pickPlayer(slug);
        else { els.search.value = q; renderSuggest(); }
      });
    }
    if (els.ppRandom) {
      els.ppRandom.addEventListener('click', function(){
        if (!ORDER.length) return;
        var slug = ORDER[Math.floor(Math.random()*ORDER.length)];
        pickPlayer(slug);
        if (els.ppShell) {
          els.ppShell.animate([{transform:'rotate(-.6deg) scale(.98)'},{transform:'rotate(0) scale(1)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
        }
      });
    }
    if (els.ppFeatured) {
      els.ppFeatured.addEventListener('click', function(ev){
        var card = ev.target.closest('[data-slug]');
        if (!card) return;
        pickPlayer(card.getAttribute('data-slug'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
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
      fetch('assets/vectors.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch('assets/skills.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    ]).then(function (loaded) {
      DATA = loaded[0]; SKILLS = loaded[1];
      if (SKILLS.grades.length !== DATA.players.length) throw new Error('skills/vectors misaligned');
      buildIndex(); fillControls(); setupControls();
      els.search.disabled = false;
      els.boardSkill.disabled = false;
      els.boardSeason.disabled = false;
      renderBoard();
      renderFeatured();
      applyDeepLink();
      if (!current.slug) {
        // show empty state with featured
        if (els.ppEmptyWrap) els.ppEmptyWrap.hidden = false;
      }
      fetch('assets/playoffs.json').then(function(r){return r.ok?r.json():null;}).then(function(po){
        PLAYOFFS=po||false; if (PLAYOFFS && current.slug) renderProfile(); DRAFT={}; renderBoard();
      }).catch(function(){PLAYOFFS=false; DRAFT={}; renderBoard();});
      fetch('assets/playoff_paths.json').then(function(r){return r.ok?r.json():null;}).then(function(pp){ PLAYOFF_PATHS=pp||false; if (PLAYOFF_PATHS && current.slug) renderProfile(); }).catch(function(){PLAYOFF_PATHS=false;});
      fetch('assets/honors.json').then(function(r){return r.ok?r.json():null;}).then(function(ho){ HONORS=ho||false; if (HONORS && current.slug) renderProfile(); }).catch(function(){HONORS=false;});
      fetch('assets/pedigree.json').then(function(r){return r.ok?r.json():null;}).then(function(ped){ PEDIGREE=ped||false; if (PEDIGREE) addDraftBoardModes(); }).catch(function(){PEDIGREE=false;});
      fetch('assets/skills_wide.json').then(function(r){return r.ok?r.json():null;}).then(function(w){ WIDE=w||false; if (WIDE) { addWideBoardModes(); if (current.slug) renderProfile(); } }).catch(function(){WIDE=false;});
      fetch('assets/archetype_assignments.json').then(function(r){return r.ok?r.json():null;}).then(function(aa){ ARCH_ASSIGN=aa||false; if (ARCH_ASSIGN && current.slug) renderProfile(); }).catch(function(){ARCH_ASSIGN=false;});
      fetch('assets/season_norms.json').then(function(r){return r.ok?r.json():null;}).then(function(sn){ SEASON_NORMS=sn||null; if (SEASON_NORMS && current.slug) renderProfile(); }).catch(function(){SEASON_NORMS=null;});
      fetch('assets/next_profile_eval.json').then(function(r){return r.ok?r.json():null;}).then(function(ne){ NEXT_EVAL=ne||false; if (NEXT_EVAL && current.slug) renderProfile(); }).catch(function(){NEXT_EVAL=false;});
      if (window.VHMtnn && window.VHMtnn.load) { window.VHMtnn.load(function (ok) { MTNN_READY = !!ok; if (MTNN_READY && current.slug) renderProfile(); }); } else { MTNN_READY=false; }
    }).catch(function (err) {
      if (els.empty) els.empty.textContent = 'Could not load the skills data (' + err.message + ').';
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }

  global.addEventListener('vh:players-tab', function (ev) {
    var d = ev.detail || {};
    if (d.tab === 'profile' && d.slug && INDEX[d.slug]) { pickPlayer(d.slug, d.season || ''); }
    if (d.tab === 'leaderboard') {
      var board = document.getElementById('board-skill');
      if (board && d.skill !== undefined) board.value = String(d.skill);
      renderBoard();
    }
  });

  global.VHPlayersSkills = { pickPlayer: pickPlayer };
})(window);
