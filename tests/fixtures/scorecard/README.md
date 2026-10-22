# Scorecard fixtures

Small inputs for `tests/test_scorecard.py`. Nothing here is invented:

- `site/assets/vectors.json`: four real 1996-97 rows of origin/master's `assets/vectors.json` (pids 2, 3, 404,
  1043), with only the fields the scorecard reads. pid 404 (Kevin Duckworth) carries the served `mpg` of 51.4,
  which is minutes per 100 possessions, not per game: the known mismatch the accuracy test counts.
- `site/pipeline/cache/dashbase_1996-97.json`: the same four players plus two more (pids 7, 9) from the repo's cache.
- `site/assets/{realtime/scoreboard,paper_trades,mtnn_lineage,eval_scoreboard}.json`: copies of origin/master's files.
- `stats_cache/`: wave 1's B-COV saved stats.nba.com responses for 1996-97, trimmed to the fixture's PLAYER_IDs
  (and to 3 GAME_IDs for the game log). Each `.meta.json` keeps the original URL, headers, fetch time and the
  sha256 of the untrimmed body.
- `acc_cache/`: wave 1's B-ACC `leaguedashplayerstats` responses for 1996-97, trimmed the same way.
- `cdn_cache/`: wave 1's B-FRESH cdn.nba.com `scheduleLeagueV2.json` (retrieved 2026-10-22T02:19:27Z), trimmed to
  its first two regular-season game dates and the fields the scorecard reads.
- `site/index.html`, `site/assets/app.{js,css}`, `site/assets/data.json`, `site/budgets.json`: a structural page
  for the byte resolver (a script that fetches JSON by a bare path). They hold no data about players or games.

`PROVENANCE.tsv` lists every source file and its sha256 at the time the fixtures were cut (2026-10-22).
