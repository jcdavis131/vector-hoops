/* live-atlas.js — Courtside Live's style map (plate 12).
 *
 * Wave 2.4 retired the old 2D canvas atlas that lived here (its own density grid,
 * hex inks and 8-9 px labels) for the shared engine: Embed3D's 'live' variant
 * (assets/embed-3d.js) mounted on #liveMap. This file is now the glue:
 *   - colours tonight's players by team with handle.setGroups();
 *   - tapping a dot marks it and lights its closest style twins (VHPeers.topK;
 *     embed3d row i == peers row i, see docs/redesign/wave2-play.md).
 * API kept for live.js: window.LiveAtlas = { onGame(d, g) }.
 *
 * Team index. ESPN spells six teams differently from the NBA tricodes the map
 * stores (embed3d.json meta.teams). The six come from pipeline/build_replays.py's
 * ALIAS table (NBA -> ESPN, checked against docs/live-recon/team_map.json, ESPN's
 * own 30-team list); every other ESPN code equals the NBA tricode.
 * tests/test_live_team_index.py checks all 30 land on a team the map holds.
 */
(function () {
  'use strict';

  var ESPN_TO_MAP = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
  var MAP_SEASON = '2025'; /* newest season in the map (2025-26): every team has rows */

  function mapTeam(espn) {
    var k = String(espn || '').toUpperCase();
    return ESPN_TO_MAP[k] || k;
  }
  function norm(n) {
    var s = String(n || '');
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old engines */ }
    return s.toLowerCase().replace(/[^a-z]/g, '');
  }
  function $(id) { return document.getElementById(id); }

  var host = null, handle = null, nameIdx = null, pending = null, lastSig = '', waitTries = 0;

  function mount() {
    host = $('liveMap');
    if (!host || !window.Embed3D || handle) return;
    try {
      handle = window.Embed3D.mount(host, { variant: 'live', projection: 'pca', height: 380, onSelect: onSelect });
    } catch (e) { handle = null; }
  }

  function loaded() {
    try { return !!(handle && handle.snapshot().loaded); } catch (e) { return false; }
  }

  /* Embed3D has no load event: wait for it (bounded), then apply the latest game. */
  function whenLoaded(fn) {
    if (loaded()) { fn(); return; }
    if (waitTries++ > 120) return;
    setTimeout(function () { whenLoaded(fn); }, 250);
  }

  /* normalised name -> id of that player's newest season in the map */
  function buildNameIndex() {
    if (nameIdx || !handle) return;
    nameIdx = {};
    for (var i = 0; ; i++) {
      var r = handle.info(i);
      if (!r) break;
      var k = norm(r.name), prev = nameIdx[k];
      if (prev == null || String(handle.info(prev).season) < String(r.season)) nameIdx[k] = i;
    }
  }

  function sides(d) {
    var out = [];
    try {
      var comps = d.header.competitions[0].competitors;
      var colorById = {};
      ((d.boxscore && d.boxscore.teams) || []).forEach(function (t) {
        if (t.team && t.team.id && t.team.color) colorById[String(t.team.id)] = '#' + t.team.color;
      });
      var namesById = {};
      ((d.boxscore && d.boxscore.players) || []).forEach(function (side) {
        var id = String(side.team && side.team.id);
        namesById[id] = (((side.statistics || [])[0] || {}).athletes || []).map(function (a) {
          return a.athlete && a.athlete.displayName;
        }).filter(Boolean);
      });
      ['away', 'home'].forEach(function (ha) {
        var c = comps.filter(function (x) { return x.homeAway === ha; })[0];
        if (!c || !c.team) return;
        var id = String(c.team.id);
        out.push({ abbr: c.team.abbreviation || '', color: colorById[id] || undefined, names: namesById[id] || [] });
      });
    } catch (e) { /* no header: no groups */ }
    return out;
  }

  function apply(d) {
    if (!handle) return;
    buildNameIndex();
    var ss = sides(d), groups = [], placed = 0, fallback = false;
    ss.forEach(function (s) {
      var ids = [];
      s.names.forEach(function (n) { var i = nameIdx[norm(n)]; if (i != null) ids.push(i); });
      var label = s.abbr;
      if (!ids.length) {
        /* no box score yet: the team's newest season in the map, labelled as such */
        ids = handle.find({ team: mapTeam(s.abbr), season: MAP_SEASON });
        if (ids.length) { fallback = true; label = s.abbr + ' 2025-26'; }
      } else { placed += ids.length; }
      if (ids.length) groups.push({ label: label, color: s.color, ids: ids });
    });
    handle.setGroups(groups);
    var meta = $('atlasMeta');
    if (meta) {
      meta.textContent = placed
        ? placed + ' of tonight’s players among 12,966 player-seasons'
        : (fallback ? 'each team’s 2025-26 season, until the box score is up' : 'tonight’s players among 12,966 player-seasons');
    }
  }

  function onGame(d) {
    if (!d) return;
    mount();
    var sig = JSON.stringify(sides(d).map(function (s) { return [s.abbr, s.color, s.names.length]; }));
    if (sig === lastSig && loaded()) return;
    pending = d;
    whenLoaded(function () { if (pending) { lastSig = sig; apply(pending); pending = null; } });
  }

  function twinsText(id, twins) {
    var me = handle.info(id);
    if (!me) return '';
    var head = me.name + ' (' + me.season + ')';
    if (!twins.length) return head + ': no style twins on file for this season.';
    return head + '’s closest style twins: ' + twins.map(function (t) {
      var r = handle.info(t.id);
      return r ? r.name + ' (' + r.season + ')' : '';
    }).filter(Boolean).join(', ') + '.';
  }

  function onSelect(id) {
    if (!handle || id == null || id < 0) return;
    handle.setSelected(id);
    var note = $('atlasNote'), me = handle.info(id);
    var show = function () {
      var twins = [];
      if (window.VHPeers && window.VHPeers.isReady()) {
        twins = window.VHPeers.topK(id, 3, function (t) { var r = handle.info(t); return !!r && !!me && r.name !== me.name; });
      }
      handle.setHighlight(twins.map(function (t) { return t.id; }));
      if (note) note.textContent = twinsText(id, twins);
    };
    if (window.VHPeers && !window.VHPeers.isReady()) {
      if (note && me) note.textContent = me.name + ' (' + me.season + '): finding style twins…';
      window.VHPeers.load(show);
    } else show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.LiveAtlas = { onGame: onGame, mapTeam: mapTeam };
})();
