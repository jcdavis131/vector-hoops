/* live-atlas.js — Courtside Live's style map (plate 12).
 *
 * Wave 2.4 retired the old 2D canvas atlas that lived here (its own density grid,
 * hex inks and 8-9 px labels) for the shared engine: Embed3D's 'live' variant
 * (assets/embed-3d.js) mounted on #liveMap. This file is now the glue:
 *   - colours tonight's players by team with handle.setGroups();
 *   - a dot, or a player in the list under the map, marks that player-season and
 *     lights its closest style twins (VHPeers.topK; embed3d row i == peers row i,
 *     see docs/redesign/wave2-play.md).
 * API kept for live.js: window.LiveAtlas = { onGame(d, g) }.
 *
 * Team index. ESPN spells six teams differently from the NBA tricodes the map
 * stores (embed3d.json meta.teams). The six come from pipeline/build_replays.py's
 * ALIAS table (NBA -> ESPN, checked against docs/live-recon/team_map.json, ESPN's
 * own 30-team list); every other ESPN code equals the NBA tricode.
 * tests/test_live_team_index.py checks all 30 land on a team the map holds.
 *
 * Name matching (matchRow, tested in tests/live_atlas_match.test.mjs). The map ends
 * at 2025-26, so this season's rookies are not on it, and names repeat across eras.
 * A player matches only a row from 2024-25 or later; a row on his team today wins;
 * otherwise a single recent row is accepted (a traded player); anything else, two
 * recent rows on other teams or none at all, leaves him unmatched. A wrong dot is
 * worse than no dot.
 */
(function (global) {
  'use strict';

  var ESPN_TO_MAP = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
  var MAP_SEASON = '2025'; /* newest season in the map (2025-26): every team has rows */
  var MIN_SEASON = '2024'; /* oldest season a name match may land on (2024-25) */

  function mapTeam(espn) {
    var k = String(espn || '').toUpperCase();
    return ESPN_TO_MAP[k] || k;
  }
  function norm(n) {
    var s = String(n || '');
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old engines */ }
    return s.toLowerCase().replace(/[^a-z]/g, '');
  }
  function hexColor(c) {
    var s = String(c || '').replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(s) ? '#' + s : undefined;
  }

  /* rows: [{id, season:'2024-25', team:'ATL'}] sharing one normalised name.
     Returns the id to show, or null when the match is missing or ambiguous. */
  function matchRow(rows, espnTeam) {
    var recent = (rows || []).filter(function (r) { return String(r.season).slice(0, 4) >= MIN_SEASON; });
    if (!recent.length) return null;
    var team = mapTeam(espnTeam);
    var onTeam = recent.filter(function (r) { return String(r.team).toUpperCase() === team; });
    var pool = onTeam.length ? onTeam : recent;
    if (!onTeam.length && recent.length > 1) return null;
    pool.sort(function (a, b) { return String(b.season) < String(a.season) ? -1 : String(b.season) > String(a.season) ? 1 : 0; });
    return pool[0].id;
  }

  var pure = { mapTeam: mapTeam, norm: norm, matchRow: matchRow, hexColor: hexColor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  var document = global.document;
  function $(id) { return document.getElementById(id); }

  var host = null, handle = null, nameIdx = null, pending = null, pendingSig = '', lastSig = '';
  var waiting = false, players = [], selId = null;

  function mount() {
    host = $('liveMap');
    if (!host || !global.Embed3D || handle) return;
    try {
      handle = global.Embed3D.mount(host, { variant: 'live', projection: 'pca', height: 380, onSelect: onSelect,
        loadingText: false /* the plate meta states the count */ });
    } catch (e) { handle = null; }
  }

  function loaded() {
    try { return !!(handle && handle.snapshot().loaded); } catch (e) { return false; }
  }

  /* Run fn once the map's data has loaded: now, or when handle.ready
     resolves (one subscription; the latest pending game wins). */
  function whenLoaded(fn) {
    if (loaded()) { fn(); return; }
    if (waiting || !handle || !handle.ready || typeof handle.ready.then !== 'function') return;
    waiting = true;
    var h = handle;
    h.ready.then(function () { waiting = false; if (handle === h) fn(); });
  }

  /* normalised name -> [{id, season, team}] for every row of that name */
  function buildNameIndex() {
    if (nameIdx || !handle) return;
    nameIdx = {};
    for (var i = 0; ; i++) {
      var r = handle.info(i);
      if (!r) break;
      var k = norm(r.name);
      (nameIdx[k] || (nameIdx[k] = [])).push({ id: i, season: r.season, team: r.team });
    }
  }

  function sides(d) {
    var out = [];
    try {
      var comps = d.header.competitions[0].competitors;
      var colorById = {};
      ((d.boxscore && d.boxscore.teams) || []).forEach(function (t) {
        var c = t.team && hexColor(t.team.color);
        if (t.team && t.team.id && c) colorById[String(t.team.id)] = c;
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
        out.push({ abbr: c.team.abbreviation || '', color: colorById[id], names: namesById[id] || [] });
      });
    } catch (e) { /* no header: no groups */ }
    return out;
  }

  function renderList() {
    var ul = $('atlasPlayers');
    if (!ul) return;
    ul.innerHTML = '';
    ul.hidden = !players.length;
    players.forEach(function (p) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'live-map__player';
      b.setAttribute('aria-pressed', p.id === selId ? 'true' : 'false');
      var nm = document.createElement('span'); nm.className = 'row-list__main'; nm.textContent = p.name;
      var tm = document.createElement('span'); tm.className = 'row-list__meta'; tm.textContent = p.abbr;
      b.appendChild(nm); b.appendChild(tm);
      b.addEventListener('click', function () { onSelect(p.id); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function apply(d) {
    if (!handle) return;
    buildNameIndex();
    var ss = sides(d), groups = [], placed = 0, missed = 0, fallback = false;
    players = [];
    ss.forEach(function (s) {
      var ids = [];
      s.names.forEach(function (n) {
        var i = matchRow(nameIdx[norm(n)], s.abbr);
        if (i != null) { ids.push(i); players.push({ id: i, name: n, abbr: s.abbr }); } else missed++;
      });
      var label = s.abbr;
      if (!ids.length && !s.names.length) {
        /* no box score yet: the team's newest season in the map, labelled as such */
        ids = handle.find({ team: mapTeam(s.abbr), season: MAP_SEASON });
        if (ids.length) { fallback = true; label = s.abbr + ' 2025-26'; }
      } else { placed += ids.length; }
      if (ids.length) groups.push({ label: label, color: s.color, ids: ids });
    });
    handle.setGroups(groups);
    renderList();
    var meta = $('atlasMeta');
    if (meta) {
      meta.textContent = placed
        ? placed + ' of tonight’s players among 12,966 player-seasons' + (missed ? ' (' + missed + ' not on the map yet)' : '')
        : (fallback ? 'each team’s 2025-26 season, until the box score is up' : 'tonight’s players among 12,966 player-seasons');
    }
  }

  function flush() {
    if (!pending) return;
    var d = pending;
    lastSig = pendingSig; pending = null;
    apply(d);
  }

  function onGame(d) {
    if (!d) return;
    mount();
    var sig = JSON.stringify(sides(d).map(function (s) { return [s.abbr, s.color, s.names.join('|')]; }));
    if (sig === lastSig && loaded()) return;
    pending = d; pendingSig = sig;
    whenLoaded(flush);
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
    selId = id;
    handle.setSelected(id);
    renderList();
    var note = $('atlasNote'), me = handle.info(id);
    var show = function () {
      var twins = [];
      if (global.VHPeers && global.VHPeers.isReady()) {
        twins = global.VHPeers.topK(id, 3, function (t) { var r = handle.info(t); return !!r && !!me && r.name !== me.name; });
      }
      handle.setHighlight(twins.map(function (t) { return t.id; }));
      if (note) note.textContent = twinsText(id, twins);
    };
    if (global.VHPeers && !global.VHPeers.isReady()) {
      if (note && me) note.textContent = me.name + ' (' + me.season + '): finding style twins…';
      global.VHPeers.load(show);
    } else show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.LiveAtlas = { onGame: onGame, mapTeam: mapTeam };
})(typeof window !== 'undefined' ? window : globalThis);
