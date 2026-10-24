/* api/odds.js — Vercel serverless: pregame odds for the Courtside pre-game panel.
 *
 * GET /api/odds?away=HOU&home=SA
 *
 * Proxies api.the-odds-api.com (basketball_nba, us books, h2h/spreads/totals),
 * normalizes to one consensus number per market (median across books), caches
 * 10 minutes in memory. The API key lives ONLY in the THE_ODDS_API_KEY env
 * var — never in the repo, never in a response.
 *
 * No key      -> 503 {ok:false}  (client hides the odds card; honest, no fake)
 * No matching event -> 404 {ok:false}
 * Upstream failure  -> 502 {ok:false}
 *
 * The panel renders ONLY in the pre-game state (live.js gates #pregame), so
 * these lines can never go stale mid-game: once the game starts the live
 * plates take over.
 */
'use strict';

var API = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/';
var TTL_MS = 10 * 60 * 1000;

/* ESPN abbr -> the-odds-api full team name. */
var TEAMS = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets',
  CHA: 'Charlotte Hornets', CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers',
  DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets', DET: 'Detroit Pistons',
  GS: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'LA Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies',
  MIA: 'Miami Heat', MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves',
  NO: 'New Orleans Pelicans', NY: 'New York Knicks', OKC: 'Oklahoma City Thunder',
  ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SA: 'San Antonio Spurs',
  TOR: 'Toronto Raptors', UTAH: 'Utah Jazz', WSH: 'Washington Wizards'
};

var cache = {}; /* key -> {at, body} */

function median(nums) {
  if (!nums.length) return null;
  var s = nums.slice().sort(function (a, b) { return a - b; });
  return s[Math.floor(s.length / 2)];
}

function normName(n) {
  return String(n || '').toLowerCase().replace(/[^a-z]/g, '');
}

/* Find the event for these two teams; nearest tipoff wins (future preferred). */
function pickEvent(events, home, away) {
  var hn = normName(home), an = normName(away);
  var now = Date.now(), best = null, bestScore = Infinity;
  events.forEach(function (e) {
    var pair = [normName(e.home_team), normName(e.away_team)];
    if (!(pair.indexOf(hn) > -1 && pair.indexOf(an) > -1)) return;
    var t = Date.parse(e.commence_time);
    if (isNaN(t)) return;
    var score = t >= now ? (t - now) : (now - t + 36e5 * 1e6); /* future beats past */
    if (score < bestScore) { bestScore = score; best = e; }
  });
  return best;
}

/* Median line per market across books. Returns null when nothing usable. */
function normalize(event, awayAbbr, homeAbbr) {
  var books = event.bookmakers || [];
  var ml = {}, sp = {}, tot = [];
  books.forEach(function (b) {
    (b.markets || []).forEach(function (m) {
      (m.outcomes || []).forEach(function (o) {
        if (m.key === 'h2h' && typeof o.price === 'number') {
          var ab = normName(o.name) === normName(event.home_team) ? homeAbbr
            : normName(o.name) === normName(event.away_team) ? awayAbbr : null;
          if (ab) { (ml[ab] = ml[ab] || []).push(o.price); }
        } else if (m.key === 'spreads' && typeof o.point === 'number') {
          var ab2 = normName(o.name) === normName(event.home_team) ? homeAbbr
            : normName(o.name) === normName(event.away_team) ? awayAbbr : null;
          if (ab2) { (sp[ab2] = sp[ab2] || []).push(o.point); }
        } else if (m.key === 'totals' && typeof o.point === 'number') {
          tot.push(o.point);
        }
      });
    });
  });
  var mlMed = {}, spMed = {};
  Object.keys(ml).forEach(function (k) { mlMed[k] = median(ml[k]); });
  Object.keys(sp).forEach(function (k) { spMed[k] = median(sp[k]); });
  var totMed = median(tot);
  if (mlMed[awayAbbr] == null || mlMed[homeAbbr] == null) return null;
  /* Favorite = the side with the more negative median spread. */
  var favAbbr = null, favLine = null;
  [awayAbbr, homeAbbr].forEach(function (k) {
    if (spMed[k] == null) return;
    if (favLine == null || spMed[k] < favLine) { favLine = spMed[k]; favAbbr = k; }
  });
  return {
    ok: true,
    asof: new Date().toISOString(),
    books: books.length,
    source: 'the-odds-api.com',
    spread: favAbbr ? { abbr: favAbbr, line: favLine } : null,
    moneyline: mlMed,
    total: totMed != null ? { line: totMed } : null
  };
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60');
  res.end(JSON.stringify(body));
}

module.exports = function handler(req, res) {
  var q = req.query || {};
  var away = String(q.away || '').toUpperCase();
  var home = String(q.home || '').toUpperCase();
  if (!TEAMS[away] || !TEAMS[home] || away === home) {
    return send(res, 400, { ok: false, error: 'need ?away=ABBR&home=ABBR' });
  }
  var key = process.env.THE_ODDS_API_KEY;
  if (!key) return send(res, 503, { ok: false, error: 'odds not configured' });

  var ckey = [away, home].sort().join('@');
  var hit = cache[ckey];
  if (hit && Date.now() - hit.at < TTL_MS) return send(res, 200, hit.body);

  var url = API + '?apiKey=' + encodeURIComponent(key) +
    '&regions=us&markets=h2h,spreads,totals&oddsFormat=american';
  fetch(url).then(function (r) {
    if (!r.ok) throw new Error('upstream ' + r.status);
    return r.json();
  }).then(function (events) {
    var ev = pickEvent(events || [], TEAMS[home], TEAMS[away]);
    if (!ev) return send(res, 404, { ok: false, error: 'no odds for this matchup' });
    var body = normalize(ev, away, home);
    if (!body) return send(res, 404, { ok: false, error: 'no usable lines' });
    cache[ckey] = { at: Date.now(), body: body };
    send(res, 200, body);
  }).catch(function () {
    send(res, 502, { ok: false, error: 'odds upstream failed' });
  });
};

/* Exported for the node smoke test (tests/odds-normalize.test.mjs). */
module.exports._normalize = normalize;
module.exports._pickEvent = pickEvent;
module.exports._median = median;
