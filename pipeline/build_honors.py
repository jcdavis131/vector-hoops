"""Track J deriver — lagged peer recognition per charted player-season.

Honors awarded after season S are applied to season S+1 rows (leak-free
for MTNN). For game puzzle weighting, build_player_meta.py also emits
same-season recognition (contemporaneous fame).

Features (raw; integrate_context era-z's within season pool when merged):
  HON_ALL_NBA_TEAM_LAG   0/1/2/3 — prior season All-NBA tier
  HON_ALL_NBA_VOTE_LAG   prior season vote points (0 if none)
  HON_ASG_LAG            1 if prior season All-Star
  HON_ASG_CUM            career ASG count through prior season
  HON_VOTE_RECOG         1 if prior season received any All-NBA vote pts

What is observed and what is missing [features#2]. An award cache with
complete=True lists every vote-getter, All-NBA selection and All-Star of its
season, so a player it does not list got 0 votes and no selection: that 0 is
measured and the row carries it (mask 1 after integrate_context). A value is
missing (no field, mask 0) only where the source does not cover it:
  - every HON_* on 1996-97 rows (the caches start with 1996-97 awards);
  - HON_ASG_LAG on 1999-00 rows: no All-Star Game was held in 1999 (the
    1998-99 cache lists all_stars 0), so "not an All-Star" was not measured;
  - HON_ASG_CUM for careers that began before 1996-97, whose earlier
    selections the caches cannot see. A career counts as fully covered when
    draft_history.json (person_id) puts the draft in 1996 or later, or, for
    a player it has no pick for, when his first dashbase season is after
    1996-97 (career_window.career_fully_observed, shared with the career
    and pedigree builders);
  - a zero row that could belong to an honoree whose cache name matches no
    charted name that season (see unmatched_honorees).
This builder used to emit a row only when the prior season had an honor, so
11,834 of the 12,966 matrix rows had no honors row: observed fraction 0.087
on HEAD against 0.969 in the promoted matrix, whose writer zero-filled every
row, 1999-00's ASG and the left-censored ASG count included. HON_ASG_CUM is
now counted per PLAYER_ID: the old count was keyed by suffix-stripped name,
so a son inherits his father's All-Star selections [features#5], and it only
advanced on a player's next charted season, so a selection followed by an
uncharted year was never counted.

Run:  python pipeline/build_honors.py
Output: pipeline/data/honors.json, assets/honors.json (when cache complete)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from _out_root import add_out_root, rerooted, shown
from career_window import career_fully_observed, draft_years_by_pid, first_seasons_by_pid
from name_utils import norm_name

VECTORS = ROOT / "assets" / "vectors.json"
CACHE_DIR = ROOT / "pipeline" / "cache"
FIXTURE = CACHE_DIR / "honors.example.json"
FMVP_CACHE = CACHE_DIR / "honors_finals_mvp.json"
DRAFT_HISTORY = CACHE_DIR / "draft_history.json"
OUT = ROOT / "pipeline" / "data" / "honors.json"
ASSET_OUT = ROOT / "assets" / "honors.json"

HON_FEATURES = (
    "HON_ALL_NBA_TEAM_LAG",
    "HON_ALL_NBA_VOTE_LAG",
    "HON_ASG_LAG",
    "HON_ASG_CUM",
    "HON_VOTE_RECOG",
)


def season_start(season: str) -> int:
    return int(season[:4])


def prior_season(season: str) -> str | None:
    y = season_start(season)
    if y <= 1996:
        return None
    return f"{y - 1}-{str(y)[-2:]}"


def real_honor_cache_paths(cache_dir: Path) -> list[Path]:
    pat = re.compile(r"honors_award_\d{4}\.json$")
    return sorted(p for p in cache_dir.glob("honors_award_*.json") if pat.match(p.name))


# BBRef prints a name stats.nba.com spells differently, and no key folds one
# into the other. 'Steve Smith' (1996-97 to 1999-00 awards: 11, 62, 63 and 1
# All-NBA vote points, All-Star 1998) is the charted 'Steven Smith', PLAYER_ID
# 120 (ATL/POR/SAS, 72-82 GP a season; the only other dashbase name near it is
# 'Stevin Smith', pid 1478, 8 GP in 1996-97). Unmatched, his honors were lost
# and the next-season rows of 13 Smiths were held back (eff24dc1).
AWARD_NAME_ALIASES = {"steve smith": "steven smith"}


def _rekey(players: dict[str, dict]) -> dict[str, dict]:
    """Award entries keyed by norm_name of their stored display name.

    The stored key is whatever norm_name was at fetch time; the display name
    is what the source printed. Keying both sides with today's norm_name is
    what lets 'Ömer Aşık' meet 'Omer Asik'.
    """
    out = {}
    for nn, rec in players.items():
        key = norm_name(rec.get("name") or nn)
        out[AWARD_NAME_ALIASES.get(key, key)] = rec
    return out


# Every All-Star list from 1997 to 2024 names 22-26 players (1999: no game).
# honors_award_2025 and _2026 name 15 each, after the game moved to a
# four-team tournament (2025) and a USA-vs-World format (2026): Giannis
# Antetokounmpo, LeBron James, Jalen Brunson and Anthony Edwards were 2025
# All-Stars and are not in the list. A list this short is partial: a player
# it names was an All-Star (1), one it omits is unknown, not 0.
ASG_MIN_LISTED = 20


def load_award_index(use_fixture: bool) -> tuple[dict[str, dict], bool, dict[str, dict]]:
    """(season -> norm_name -> {vote_pts, all_nba_team, asg}, all complete, season -> coverage).

    coverage[season] = {"complete": bool, "asg_held": bool}. A season is
    covered only by a doc with complete=True; asg_held is False for a covered
    season whose doc lists no All-Stars (1998-99: no 1999 game).
    """
    by_season: dict[str, dict[str, dict]] = {}
    coverage: dict[str, dict] = {}
    complete = True

    if not use_fixture:
        caches = real_honor_cache_paths(CACHE_DIR)
        # No real cache used to mean "read honors.example.json" without being
        # asked, writing its two hand-made award seasons into
        # pipeline/data/honors.json, a training input [ingest#5]. The fixture
        # is for tests and runs only under --fixture.
        if not caches:
            raise SystemExit(
                f"no {CACHE_DIR.name}/honors_award_<year>.json: run pipeline/fetch_honors.py on an operator "
                "machine (stats.nba.com/BBRef block datacenter IPs); --fixture builds from the test fixture"
            )
        for path in caches:
            doc = json.loads(path.read_text(encoding="utf-8"))
            season = doc["season"]
            ok = bool(doc.get("complete"))
            complete = complete and ok
            by_season[season] = _rekey(doc.get("players", {}))
            n_asg = sum(1 for r in by_season[season].values() if r.get("asg"))
            coverage[season] = {
                "complete": ok,
                "asg_held": ok and n_asg > 0,
                "asg_partial": ok and n_asg > 0 and (bool(doc.get("asg_partial")) or n_asg < ASG_MIN_LISTED),
            }
        return by_season, complete, coverage

    if not FIXTURE.exists():
        raise SystemExit(f"--fixture: no fixture at {FIXTURE}")
    doc = json.loads(FIXTURE.read_text(encoding="utf-8"))
    complete = bool(doc.get("complete"))
    for season, recs in doc.get("players", {}).items():
        by_season[season] = _rekey(recs)
        # The fixture is a hand-picked handful of honorees, never a complete
        # season: nothing it omits is a measured zero.
        coverage[season] = {"complete": False, "asg_held": False, "asg_partial": False}
    return by_season, complete, coverage


def dashbase_pids(cache_dir: Path) -> dict[str, dict[str, set[int]]]:
    """season -> norm_name -> PLAYER_IDs, from every player who played that season."""
    out: dict[str, dict[str, set[int]]] = defaultdict(lambda: defaultdict(set))
    for path in sorted(cache_dir.glob("dashbase_*.json")):
        season = path.stem.split("_", 1)[1]
        for r in json.loads(path.read_text(encoding="utf-8")):
            out[season][norm_name(str(r.get("PLAYER_NAME") or ""))].add(int(r["PLAYER_ID"]))
    return out


def surname(nn: str) -> str:
    return nn.split(" ")[-1] if nn else ""


def unmatched_honorees(award_idx: dict[str, dict], charted: dict[str, set[str]]) -> list[tuple[str, str, dict]]:
    """(season, norm_name, record) for honorees whose name matches no charted row that season.

    Measured 2026-10-09: 5 of 1,211 award entries, 'Steve Smith' 1996-97 to
    1999-00 (charted as 'Steven Smith', pid 120) and 'Ömer Aşık' 2012-13
    (matched once norm_name folds 'ı'). Without a match the honoree's own
    next-season row would read as a measured zero.
    """
    out = []
    for season, recs in sorted(award_idx.items()):
        names = charted.get(season, set())
        for nn, rec in sorted(recs.items()):
            honored = rec.get("vote_pts") or rec.get("all_nba_team") or rec.get("asg")
            if honored and nn not in names:
                out.append((season, nn, rec))
    return out


def main() -> None:
    global OUT, ASSET_OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixture", action="store_true")
    add_out_root(ap)
    args = ap.parse_args()
    OUT = rerooted(OUT, args.out_root)
    ASSET_OUT = rerooted(ASSET_OUT, args.out_root)

    award_idx, complete, coverage = load_award_index(args.fixture)
    fmvp_by_season: dict[str, str] = {}
    if not args.fixture and FMVP_CACHE.exists():
        fmvp_doc = json.loads(FMVP_CACHE.read_text(encoding="utf-8"))
        for season, rec in (fmvp_doc.get("bySeason") or {}).items():
            if rec.get("norm"):
                fmvp_by_season[season] = norm_name(rec["norm"])  # stored key, keyed again (name_utils)
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))

    draft_year = draft_years_by_pid(DRAFT_HISTORY)
    first_season = first_seasons_by_pid(CACHE_DIR)
    played = dashbase_pids(CACHE_DIR)
    played_pids = {s: {q for pids in names.values() for q in pids} for s, names in played.items()}
    partial_asg = sorted(s for s, c in coverage.items() if c.get("asg_partial"))

    charted: dict[str, set[str]] = defaultdict(set)
    for p in vec["players"]:
        charted[p["season"]].add(norm_name(p["name"]))

    # All-Star seasons per PLAYER_ID. The award caches name players, so each
    # selection is placed on the PLAYER_ID that played under that name that
    # season (dashbase: every player, charted or not). A name two players
    # shared that season places nothing.
    asg_seasons: dict[int, list[str]] = defaultdict(list)
    ambiguous_asg = 0
    for season, recs in award_idx.items():
        for nn, rec in recs.items():
            if not rec.get("asg"):
                continue
            pids = played.get(season, {}).get(nn, set())
            if len(pids) == 1:
                asg_seasons[next(iter(pids))].append(season)
            else:
                ambiguous_asg += 1

    lost = unmatched_honorees(award_idx, charted)
    # Who could own a lost honor: anyone who played that season under the
    # honoree's surname. Their next-season zero row is held back, and, for a
    # lost All-Star selection, so is every later ASG count.
    suspect_lag: set[tuple[str, int]] = set()
    suspect_cum: dict[int, str] = {}
    for prior, nn, rec in lost:
        for other, pids in played.get(prior, {}).items():
            if surname(other) != surname(nn):
                continue
            for q in pids:
                suspect_lag.add((prior, q))
                if rec.get("asg"):
                    suspect_cum[q] = min(prior, suspect_cum.get(q, prior))

    entries = []
    contemporaneous: dict[str, dict] = {}
    lagged_rows = 0
    honored_rows = 0
    vote_reco_rows = 0
    fmvp_rows = 0
    masked = {f: 0 for f in HON_FEATURES}
    held_back_zero_rows = 0

    for p in vec["players"]:
        name, season = p["name"], p["season"]
        nn = norm_name(name)
        key = f"{name}|{season}"
        pid = int(p["pid"]) if str(p.get("pid", "")).isdigit() else None

        # Same-season (game weighting / UI)
        same = award_idx.get(season, {}).get(nn, {})
        is_fmvp = fmvp_by_season.get(season) == nn
        if same or is_fmvp:
            contemporaneous[key] = {
                "asg": int(same.get("asg") or 0),
                "allNbaTeam": int(same.get("all_nba_team") or 0),
                "allNbaVotePts": int(same.get("vote_pts") or 0),
                "finalsMvp": 1 if is_fmvp else 0,
            }
            if is_fmvp:
                fmvp_rows += 1

        prev_s = prior_season(season)
        if not prev_s:
            continue
        prev = award_idx.get(prev_s, {}).get(nn, {})
        cov = coverage.get(prev_s, {"complete": False, "asg_held": False, "asg_partial": False})
        vote_pts = int(prev.get("vote_pts") or 0)
        team_tier = int(prev.get("all_nba_team") or 0)
        asg = int(prev.get("asg") or 0)
        honored = bool(vote_pts or team_tier or asg)

        if not cov["complete"]:
            # A partial source (only the --fixture path today): an honor it
            # lists is measured, an omission is not.
            if not honored:
                continue
            vals = {
                "HON_ALL_NBA_TEAM_LAG": float(team_tier),
                "HON_ALL_NBA_VOTE_LAG": float(vote_pts),
                "HON_ASG_LAG": float(asg),
                "HON_VOTE_RECOG": 1.0 if vote_pts > 0 else 0.0,
            }
        elif not honored and (prev_s, pid) in suspect_lag:
            vals = dict.fromkeys(("HON_ALL_NBA_TEAM_LAG", "HON_ALL_NBA_VOTE_LAG", "HON_ASG_LAG", "HON_VOTE_RECOG"))
            held_back_zero_rows += 1
        else:
            vals = {
                "HON_ALL_NBA_TEAM_LAG": float(team_tier),
                "HON_ALL_NBA_VOTE_LAG": float(vote_pts),
                "HON_ASG_LAG": float(asg) if cov["asg_held"] and (asg or not cov["asg_partial"]) else None,
                "HON_VOTE_RECOG": 1.0 if vote_pts > 0 else 0.0,
            }

        cum = None
        s_cum = suspect_cum.get(pid) if pid is not None else None
        # A partial All-Star season he played in and is not listed for could
        # hold a selection the list lost: the count is a lower bound.
        unseen = any(
            s <= prev_s and s not in asg_seasons.get(pid, ()) and pid in played_pids.get(s, ()) for s in partial_asg
        )
        if (
            career_fully_observed(pid, draft_year, first_season)
            and not (s_cum is not None and s_cum <= prev_s)
            and not unseen
        ):
            cum = float(sum(1 for s in asg_seasons.get(pid, ()) if s <= prev_s))
        vals["HON_ASG_CUM"] = cum

        if all(vals[f] is None for f in HON_FEATURES):
            for f in HON_FEATURES:
                masked[f] += 1
            continue
        row = {"name": name, "season": season, "pid": pid}
        for f in HON_FEATURES:
            row[f] = vals[f]
            if vals[f] is None:
                masked[f] += 1
        entries.append(row)
        lagged_rows += 1
        honored_rows += honored
        if vote_pts > 0:
            vote_reco_rows += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "built": time.strftime("%Y-%m-%d"),
                "cache_complete": complete,
                "coverage": {
                    "lagged_rows": lagged_rows,
                    "honored_rows": honored_rows,
                    "vote_recognized_rows": vote_reco_rows,
                    "contemporaneous_keys": len(contemporaneous),
                    "finals_mvp_keys": fmvp_rows,
                    "award_seasons": len(award_idx),
                    "covered_award_seasons": sorted(s for s, c in coverage.items() if c["complete"]),
                    "asg_not_held": sorted(s for s, c in coverage.items() if c["complete"] and not c["asg_held"]),
                    "asg_partial": partial_asg,
                    "rows_total": len(vec["players"]),
                    "masked_per_feature": masked,
                    "unmatched_honorees": [f"{nn}|{s}" for s, nn, _ in lost],
                    "zero_rows_held_back_for_unmatched_honorees": held_back_zero_rows,
                    "asg_selections_on_ambiguous_names": ambiguous_asg,
                },
                "players": entries,
                "contemporaneous": contemporaneous,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    if complete and contemporaneous:
        ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
        ASSET_OUT.write_text(
            json.dumps(
                {
                    "built": time.strftime("%Y-%m-%d"),
                    "note": (
                        "All-NBA voting expands beyond the 15 team slots. "
                        "Same-season keys for UI include Finals MVP when "
                        "honors_finals_mvp.json is present. Lagged HON_* in pipeline/data."
                    ),
                    "bySeason": contemporaneous,
                },
                separators=(",", ":"),
            ),
            encoding="utf-8",
        )
        asset_msg = f"wrote {shown(ASSET_OUT)} ({len(contemporaneous)} keys)"
    else:
        asset_msg = "assets/honors.json NOT written (partial cache)"

    print(
        f"honors: {lagged_rows} lagged rows ({honored_rows} honored, {vote_reco_rows} with vote pts), "
        f"{len(contemporaneous)} contemporaneous keys ({fmvp_rows} Finals MVP), "
        f"{len(award_idx)} award seasons (complete={complete}); masked per feature {masked}; "
        f"{len(lost)} unmatched honorees, {held_back_zero_rows} zero rows held back"
    )
    print(f"wrote {shown(OUT)}; {asset_msg}")


if __name__ == "__main__":
    main()
