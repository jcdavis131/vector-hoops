/* ESPN game summary -> Pixel Replay game, in the browser.
 *
 * The live page already polls ESPN's public summary for the game on screen (every 30 s
 * while it is live). This turns that same response into the event format
 * pipeline/build_replays.py writes from the NBA's own feed, so a game can replay while it
 * is still being played, with no extra request. cdn.nba.com cannot be read from a browser
 * on our origin (its CDN answers 403 to any Origin but nba.com), so the NBA-built files stay
 * the source for the games they cover and this fills in tonight.
 *
 * Real (from ESPN): every play, clock, score, shooter, rebounder, stealer, blocker,
 *   substitution, and the shot spot (ESPN gives feet across the court and feet out from the
 *   rim, checked against the NBA feed on 2026-10-21 ATL @ ORL: 173 of 176 shots matched).
 * Assumed: which basket each team shoots at (ESPN's spot is folded onto one half). Away
 *   attacks the right rim in the first half, as in 4 of the 5 NBA feeds we hold.
 * Staged in replay.js, as for every game: where the other nine players stand.
 *
 *   ReplayESPN.toGame(summary, eventId) -> game object for PixelReplay.setGame
 * Each event carries its ESPN play index (game.src[i]) and wall clock (game.wall[i], ms).
 */
(function (root) {
  'use strict';
  var L = 94, CW = 50, HOOP = 5.25;
  var TYPES = ['2pt', '3pt', 'freethrow', 'rebound', 'turnover', 'steal', 'block', 'foul', 'substitution', 'timeout', 'jumpball', 'violation', 'period', 'game', 'other'];
  var TI = {}; TYPES.forEach(function (t, i) { TI[t] = i; });
  var SUM = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';

  function clockSec(s) {
    s = String(s || '0'); var m = s.indexOf(':');
    return m < 0 ? parseFloat(s) || 0 : (parseInt(s.slice(0, m), 10) || 0) * 60 + (parseFloat(s.slice(m + 1)) || 0);
  }
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function col(c, dflt) { c = String(c || '').replace('#', ''); return /^[0-9a-f]{6}$/i.test(c) ? '#' + c.toLowerCase() : dflt; }
  /* away (side 0) attacks the right rim in periods 1-2, the left from period 3 on */
  function attacksRight(side, period) { return (period <= 2) === (side === 0); }
  function spot(c, side, period) {
    if (!c || !(c.x >= 0 && c.x <= CW) || !(c.y >= 0 && c.y <= L / 2 + 4)) return null;
    return attacksRight(side, period) ? [+(L - HOOP - c.y).toFixed(2), +(+c.x).toFixed(2)] : [+(HOOP + c.y).toFixed(2), +(CW - c.x).toFixed(2)];
  }

  function toGame(d, eventId) {
    var comp = d && d.header && d.header.competitions && d.header.competitions[0];
    if (!comp || !d.plays) return null;
    var cs = comp.competitors || [], away = cs.filter(function (c) { return c.homeAway === 'away'; })[0], home = cs.filter(function (c) { return c.homeAway === 'home'; })[0];
    if (!away || !home) return null;
    var sideOf = {}; sideOf[away.team.id] = 0; sideOf[home.team.id] = 1;
    var bteam = {};
    ((d.boxscore && d.boxscore.teams) || []).forEach(function (t) { if (t.team) bteam[t.team.id] = t.team; });
    var teams = [away, home].map(function (c) {
      var t = bteam[c.team.id] || c.team;
      return { tri: t.abbreviation || c.team.abbreviation, name: t.displayName || t.abbreviation, short: t.shortDisplayName || t.name || t.abbreviation,
        c: col(t.color, '#555555'), alt: col(t.alternateColor, '#ffffff') };
    });

    var players = {}, starters = [[], []];
    ((d.boxscore && d.boxscore.players) || []).forEach(function (tp) {
      var s = sideOf[tp.team && tp.team.id]; if (s == null) return;
      ((tp.statistics && tp.statistics[0] && tp.statistics[0].athletes) || []).forEach(function (a) {
        var id = a.athlete && a.athlete.id; if (!id) return;
        players[id] = { n: a.athlete.shortName || a.athlete.displayName || '', t: s };
        if (a.starter && starters[s].length < 5) starters[s].push(String(id));
      });
    });
    function person(p, k) { var q = p.participants && p.participants[k]; var id = q && q.athlete && String(q.athlete.id); return id && players[id] ? id : null; }

    var plays = d.plays, events = [], src = [], wall = [], lineup = [starters[0].slice(), starters[1].slice()], lastSeen = {}, lineups = [], period = 0;
    function push(p, pi, typ, sub, side, pid, xy, made, desc, poss) {
      var per = p.period ? p.period.number : period;
      var e = [per, Math.round(clockSec(p.clock && p.clock.displayValue) * 10) / 10, TI[typ], sub || '', side, pid ? +pid : 0,
        xy ? xy[0] : null, xy ? xy[1] : null, +p.awayScore || 0, +p.homeScore || 0, made, desc, poss, xy ? (attacksRight(side, per) ? 1 : 0) : -1];
      var i = events.length; events.push(e); src.push(pi); wall.push(Date.parse(p.wallclock || '') || null);
      if (pid && players[pid]) see(pid, i);
      return e;
    }
    function snap(i) {
      if (lineup[0].length !== 5 || lineup[1].length !== 5) return;
      var row = [i, lineup[0].slice(), lineup[1].slice()];
      if (lineups.length && lineups[lineups.length - 1][0] === i) lineups[lineups.length - 1] = row; else lineups.push(row);
    }
    function see(pid, i) {
      var ln = lineup[players[pid].t];
      if (ln.indexOf(pid) < 0) { // the feed shows him playing: repair the lineup, as build_replays.py does
        if (ln.length >= 5) { var old = ln.slice().sort(function (a, b) { return (lastSeen[a] || -1) - (lastSeen[b] || -1); })[0]; ln.splice(ln.indexOf(old), 1); }
        ln.push(pid); snap(i);
      }
      lastSeen[pid] = i;
    }
    if (starters[0].length === 5 && starters[1].length === 5) lineups.push([0, starters[0].slice(), starters[1].slice()]);

    plays.forEach(function (p, pi) {
      var per = p.period ? p.period.number : period, tt = clean(p.type && p.type.text), tl = tt.toLowerCase(), text = clean(p.text);
      var side = p.team && sideOf[p.team.id] != null ? sideOf[p.team.id] : -1, a0 = person(p, 0), a1 = person(p, 1);
      if (per !== period) { period = per; push({ period: { number: per }, clock: { displayValue: per <= 4 ? '12:00' : '5:00' }, awayScore: p.awayScore, homeScore: p.homeScore, wallclock: p.wallclock }, pi, 'period', 'start', -1, null, null, null, 'Period Start', -1); }
      if (p.shootingPlay && /free throw/.test(tl)) { push(p, pi, 'freethrow', tt, side, a0, null, p.scoringPlay ? 1 : 0, text, side); return; }
      if (p.shootingPlay) {
        var three = +p.pointsAttempted === 3 || +p.scoreValue === 3, xy = side >= 0 ? spot(p.coordinate, side, per) : null;
        push(p, pi, three ? '3pt' : '2pt', tt, side, a0, xy, p.scoringPlay ? 1 : 0, text, side);
        if (/ blocks /.test(text) && a1 && side >= 0) push(p, pi, 'block', '', 1 - side, a1, null, null, players[a1].n + ' BLOCK', -1);
        return;
      }
      if (tl === 'substitution') {
        if (a0 && a1 && players[a0].t === players[a1].t) {
          var ln = lineup[players[a0].t], k = ln.indexOf(a1);
          if (k >= 0) ln.splice(k, 1);
          if (ln.indexOf(a0) < 0) ln.push(a0);
          push(p, pi, 'substitution', 'in', side, a0, null, null, text, -1); lastSeen[a0] = events.length - 1; snap(events.length - 1);
        } else push(p, pi, 'substitution', '', side, a0, null, null, text, -1);
        return;
      }
      if (/rebound/.test(tl)) { push(p, pi, 'rebound', /offensive/.test(tl) ? 'offensive' : 'defensive', side, a0, null, null, text, side); return; }
      if (/turnover|traveling|double dribble|3-second|offensive goaltending|backcourt|palming|discontinue/.test(tl) && side >= 0) { // a team turnover with no team: 'other' below
        if (/foul/.test(tl)) push(p, pi, 'foul', 'offensive', side, a0, null, null, text, -1); // the NBA feed logs both
        push(p, pi, 'turnover', tt, side, a0, null, null, text, side);
        if (/ steals\)/.test(text) && a1 && side >= 0) push(p, pi, 'steal', '', 1 - side, a1, null, null, players[a1].n + ' STEAL', 1 - side);
        return;
      }
      if (/foul/.test(tl)) { push(p, pi, 'foul', tt, side, a0, null, null, text, -1); return; }
      if (/timeout|challenge|review/.test(tl)) { push(p, pi, 'timeout', tt, side, null, null, null, text, -1); return; }
      if (/jump ?ball/.test(tl)) { push(p, pi, 'jumpball', 'recovered', side, person(p, 2) || a0, null, null, text, side); return; }
      if (tl === 'end period') { push(p, pi, 'period', 'end', -1, null, null, null, text, -1); return; }
      if (tl === 'end game') { push(p, pi, 'game', 'end', -1, null, null, null, text, -1); return; }
      if (/violation|delay|^lane$/.test(tl)) { push(p, pi, 'violation', tt, side, a0, null, null, text, -1); return; }
      push(p, pi, 'other', tt, side, a0, null, null, text, -1);
    });
    if (!lineups.length || !events.length) return null;
    var st = comp.status && comp.status.type, last = events[events.length - 1];
    return {
      gameId: 'espn-' + eventId, espnId: String(eventId), source: SUM + eventId, sourceName: 'ESPN',
      final: !!(st && st.completed), live: !!(st && st.state === 'in'),
      periods: Math.max.apply(null, events.map(function (e) { return e[0]; })),
      teams: teams, score: [last[8], last[9]], date: (comp.date || '').slice(0, 10),
      types: TYPES, players: players, lineups: lineups, events: events, src: src, wall: wall,
      staged: 'Shooter, shot spot, event, clock and score are from ESPN\'s play-by-play. Which basket each team shoots at is assumed (away attacks right in the first half). The other nine players are staged from formation templates: no public feed has their positions.'
    };
  }

  var api = { toGame: toGame, summaryUrl: function (id) { return SUM + id; }, TYPES: TYPES };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ReplayESPN = api;
})(typeof window !== 'undefined' ? window : this);
