# Daily box pipeline (feeds plan P4)

One runner keeps the site's daily data current without a person:
`scripts/daily/run_daily.py`. It runs on the operator box, because cdn.nba.com answers
the box's residential IP with the repo's header set (D8). It needs no GPU. It changes
data files only. A person still merges the data PR it opens.

## What runs

Each step can be rerun safely and writes to the run log. The whole run holds a lock
(`%USERPROFILE%\.hoops-daily\run.lock`), so two runs never overlap. A second run exits 4.

| Step | What | Network |
|---|---|---|
| a. fetch | `pipeline/fetch_cdn_games.py` runs under `wt/locks/nba-fetch.sh daily-fetch` (one NBA fetcher on the box). It reads `staticData/scheduleLeagueV2_1.json`, then GETs `playbyplay_<id>.json` and then `boxscore_<id>.json` for every finished game (`gameStatus 3`, ids 002/004/005) dated on or after the cursor that is not cached yet. Oldest games come first, and all play-by-play comes before any box score. Files land in the box cache `%USERPROFILE%\.hoops-daily\cache\{cdn_pbp,cdn_box}` as the bytes cdn.nba.com sent, each with an ingest-style record in `_fetch_meta/`. | yes |
| b. replays | Copies new box scores and fetch records into the tree's `pipeline/cache/`, then runs `scripts/refresh_replays.py --from <box cache>/cdn_pbp` (copy, `build_replays.py`, `sync_public.py`). | no |
| c. maphunt | `scripts/build_map_hunt.py` extends the window to today + 21. Days already published keep their picks and `.u8` bytes, and only new days are appended. Then `--check`, which fails when fewer than 7 days remain after today (local date, as map-hunt.js uses). | no |
| d. status | Writes `assets/realtime/daily_pipeline.json`, then runs `scripts/build_status.py` and its `--check`. | no |
| e. stamp + checks | `stamp_assets`, `stamp_footer`, `sync_public`, then the checks listed below, then an EOL guard. | no |
| f. pr | `--open-pr` only. In the tree: branch `data/daily-YYYY-MM-DD`, commit only the files the run changed, push, `gh pr create`. | GitHub |

`daily_pipeline.json` has one row per cdn.nba.com feed the run read (`cdn_schedule`,
`cdn_playbyplay`, `cdn_boxscore`) plus a `daily_pipeline` row for steps a-c. Each row's
`last_good_tick` is this run when nothing that feed owed failed. Rows carry
`stale_after_minutes: 2160` (36 h): one missed night is not stale, two are.
`build_status.py` merges these rows into the Feed health card, alongside the ESPN rows,
which stay stale until P2 removes them.

The checks in step e:
- `stamp_assets.py --check`
- `stamp_footer.py --check`
- `sync_public.py --check`
- `build_replays.py --check`
- `build_map_hunt.py --check`
- `build_status.py --check`
- `build_twenty_questions.py --check`
- `check_site_facts.py`
- `budget_check.py`

The EOL guard fails the run if a changed text file would land with CRLF line endings
that its committed version does not have. `assets/**` is `-text` in `.gitattributes`, so
a Windows text-mode write would otherwise be committed verbatim.

The heavier steps run under `wt/locks/admit.sh` with `ADMIT_FLOOR=700`:
- Map Hunt: 600 MB.
- build_status: 500 MB.
- twenty-questions, site facts and budget checks: 400 MB each.

Step f refuses to open a PR in three cases:
- a file outside `pipeline/cache/cdn_pbp/`, `pipeline/cache/cdn_box/`, `assets/`, `public/` or the top-level `*.html` changed;
- `api/`, `vercel.json` or `sw.js` changed;
- any step or check other than the fetch failed.

The PR body starts with `DO NOT MERGE without Cam's word (daily data PR; CI-gated)` and
lists the games added, the Map Hunt end date, the request count and every check with its
exit code.

## When

The scheduled task "Hoops Daily Pipeline" runs daily at 10:00 local. It wakes the box,
starts late if the box was off, and is killed after 2 h. It runs `scripts\daily\run_daily.cmd`,
which calls `run_daily.ps1`. That script:
1. resets the dedicated worktree `C:\Users\jcdav\wt\hoops-daily` to `origin/master` (it creates the tree on first use; it never touches the main checkout);
2. runs `run_daily.py --tree <that tree> --open-pr` with the tree's own copy of the code, so what runs is always reviewed master.

The 24 h replay rule (`build_replays.py --min-age 24`) holds a game out of
`assets/replays/index.json` until 24 h after its final horn. The game's replay file is
built the night it is fetched, and the next run indexes it. At 10:00 local, last night's
games are fetched and built, and the night before's games are indexed.

## How long, how many requests

Dry run on 2026-10-24, the first real run:
- 110 s in total.
- The fetch took 71 s for 29 requests at one request per 2.5 s.
- Steps b-e took about 35 s, and are about the same on a rerun that fetches nothing.

A normal night is 1 schedule request plus 2 per game: about 31 requests and 80 s for a
15-game night. The cap is `--max-requests 80` by default, and retries count against it.
Files over the cap are deferred, and the cursor stays on the oldest missing file so the
next run picks them up.

Rules (D8):
- Headers are `pipeline/nba_http.py`'s `_STATS_HEADERS` plus a Chrome User-Agent. Nothing else is sent: no cookie warm-up and no Sec-Fetch headers.
- At most one request per 2.5 s.
- Every request goes to `%USERPROFILE%\.hoops-daily\logs\requests-YYYY-MM-DD.jsonl` (url, status, bytes, ms).
- nba-fetch.sh also logs each holder to `wt/locks/nba-fetch.log`.

Repo growth per game, committed:
- play-by-play: about 450 KB;
- box score: about 33 KB;
- replay: about 65 KB, twice (`assets/` and `public/`).

That is roughly 0.6 MB a game, about 0.75 GB over a full season. Revisit before it matters.

## Failure handling

- **NBA errors** follow `nba_http`'s classes.
  - A 403 is retried once. It then counts as blocked, and two blocked files in a row stop the fetch.
  - A 429, a 5xx, a timeout or a non-JSON 200 backs off with jitter, for up to 3 attempts.
  - Any other 4xx fails that file at once.
  - A file whose schedule status says final but whose content is not final yet is not kept, and the next run fetches it again.
- **A failed or blocked fetch does not stop the run.** Map Hunt still rolls and status still regenerates, showing the failure. With `--open-pr` the PR still opens, so the Map Hunt window keeps moving while NBA refuses us, and its body says the fetch failed. The run exits 2. Any other failed step or check blocks the PR.
- **Exit codes.**
  - 0: all green.
  - 1: a step or check failed.
  - 2: the fetch failed or was blocked.
  - 4: the lock is held.
  - The fetcher on its own exits 3 when some files were deferred. That is normal after a cap, and the runner treats it as success.
- **Logs.** Run logs are `%USERPROFILE%\.hoops-daily\logs\run-*.log`, and the wrapper writes `wrapper-*.log`. `last_summary.md` there is the PR body the run built, written on dry runs too.
- **State.** `%USERPROFILE%\.hoops-daily\state.json` holds the fetch cursor. Deleting it makes the next run scan from `--since`, or the whole season's schedule. The cache is what decides what gets fetched, so nothing is fetched twice.
- **Unmerged data PRs** each branch from `origin/master` and carry everything the box cache has that master lacks. The newest one supersedes the older ones: close the older ones. Expect one PR a day, because the status snapshot and the next Map Hunt day change every day.

## How to rerun

```
python scripts/daily/run_daily.py                      # dry run in this checkout: steps a-e, no push
python scripts/daily/run_daily.py --skip-fetch         # b-e only, no network
python scripts/daily/run_daily.py --max-requests 10    # a tighter cap
powershell -File scripts\daily\run_daily.ps1 -DryRun   # what the task does, minus --open-pr
python scripts/build_map_hunt.py --check               # just the window check
```

## How to register the task (operator, after review)

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\daily\register_task.ps1            # daily 10:00
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\daily\register_task.ps1 -At 11:30
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\daily\register_task.ps1 -Unregister
Start-ScheduledTask -TaskName "Hoops Daily Pipeline"; Get-ScheduledTaskInfo -TaskName "Hoops Daily Pipeline"
```

The task runs as the logged-on user, so it uses that user's git credentials and `gh auth`.
Both must work non-interactively.

## Known limits

- **Two side effects of the daily `index.json` change.**
  - `stamp_assets.py` bumps the `?v=` token for `assets/map-hunt/index.json` inside `assets/map-hunt.js` and `map-guess.html` every day.
  - `sw.js` `CACHE_NAME` is not bumped. `map-hunt.js` is not in its precache list, and other `.js` files are served stale-while-revalidate, so a returning visitor gets the new token one visit later.
- **ESPN rows stay stale.** The ESPN feed-health rows (`scripts/realtime/feed_health.py`, off-rule) are not refreshed by this pipeline, so Feed health shows them stale until P2 lands.
- **Box scores are fetched and cached but not served yet.** P5 builds pregame, form and rosters from them.
