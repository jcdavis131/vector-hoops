"""Track market deriver — salary cap %, team payroll share, season rank.

Reads pipeline/cache/salaries_merged.json + roster_context for team
fallback. Writes per charted player-season rows for integrate_context.

Features (raw; era-z within season pool when merged):
  SALARY_LOG         log10(USD annual salary)
  SALARY_CAP_PCT     salary / league soft cap that season
  SALARY_TEAM_PCT    salary / summed team payroll (same team+season)
  SALARY_RANK_POS    within-season percentile rank by salary [0, 1]

Run:  python pipeline/build_salary_market.py
"""

from __future__ import annotations

import json
import math
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from nba_salary_cap import cap_for_season

DATA = ROOT / "pipeline" / "data"
CACHE = ROOT / "pipeline" / "cache"
VECTORS = ROOT / "assets" / "vectors.json"
SALARIES = CACHE / "salaries_merged.json"
ROSTER = DATA / "roster_context.json"
OUT = DATA / "salary_market.json"
MIN_TEAM_SALARY_ROWS = 8
MIN_SALARY_USD = 10_000


def norm_name(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[.'’-]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    return re.sub(r"\s+", " ", s)


def load_salaries() -> dict[str, dict]:
    if not SALARIES.exists():
        return {}
    doc = json.loads(SALARIES.read_text(encoding="utf-8"))
    return doc.get("salaries", {})


def load_roster_teams() -> dict[tuple[str, str], str]:
    if not ROSTER.exists():
        return {}
    doc = json.loads(ROSTER.read_text(encoding="utf-8"))
    out: dict[tuple[str, str], str] = {}
    for row in doc.get("entries", []):
        team = row.get("team")
        if team:
            out[(row["name"], row["season"])] = str(team).upper()
    return out


def resolve_team(
    name: str,
    season: str,
    nn: str,
    sal: dict,
    roster_teams: dict[tuple[str, str], str],
) -> str | None:
    team = (sal.get("team") or "").strip().upper()
    if team:
        return team
    return roster_teams.get((name, season)) or roster_teams.get(
        (sal.get("name", name), season))


def build_team_payrolls(
    salaries: dict[str, dict],
    roster_teams: dict[tuple[str, str], str],
) -> tuple[dict[tuple[str, str], float], dict[tuple[str, str], int]]:
    """(team_abbr, season) -> total USD and contributing row count."""
    totals: dict[tuple[str, str], float] = defaultdict(float)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for key, sal in salaries.items():
        if key.startswith("_"):
            continue
        nn = sal.get("norm_name") or key.split("|", 1)[0]
        season = sal.get("season") or key.split("|", 1)[-1]
        amount = float(sal.get("salary") or 0)
        if amount < MIN_SALARY_USD:
            continue
        name = sal.get("name") or nn
        team = resolve_team(name, season, nn, sal, roster_teams)
        if not team:
            continue
        totals[(team, season)] += amount
        counts[(team, season)] += 1
    return dict(totals), dict(counts)


def season_salary_ranks(
    salaries: dict[str, dict],
) -> dict[tuple[str, str], float]:
    """(norm_name, season) -> percentile rank in [0, 1] among salaried rows."""
    by_season: dict[str, list[tuple[tuple[str, str], float]]] = defaultdict(list)
    for key, sal in salaries.items():
        if key.startswith("_"):
            continue
        nn = sal.get("norm_name") or key.split("|", 1)[0]
        season = sal.get("season") or key.split("|", 1)[-1]
        amount = float(sal.get("salary") or 0)
        if amount < MIN_SALARY_USD:
            continue
        by_season[season].append(((nn, season), amount))

    out: dict[tuple[str, str], float] = {}
    for season, items in by_season.items():
        items.sort(key=lambda x: x[1])
        n = len(items)
        if n == 1:
            out[items[0][0]] = 1.0
            continue
        for i, (nkey, _) in enumerate(items):
            out[nkey] = i / (n - 1)
    return out


def main() -> None:
    salaries = load_salaries()
    if not salaries:
        raise SystemExit(f"no salaries at {SALARIES} — run merge_salaries.py first")

    roster_teams = load_roster_teams()
    team_totals, team_counts = build_team_payrolls(salaries, roster_teams)
    rank_by_nkey = season_salary_ranks(salaries)

    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    entries = []
    labeled = 0
    team_pct_rows = 0
    cap_pct_rows = 0

    for p in vec["players"]:
        name, season = p["name"], p["season"]
        nn = norm_name(name)
        nkey = f"{nn}|{season}"
        sal = salaries.get(nkey) or salaries.get(f"{name}|{season}")
        if not sal:
            continue
        amount = float(sal.get("salary") or 0)
        if amount < MIN_SALARY_USD:
            continue

        team = resolve_team(name, season, nn, sal, roster_teams)
        cap = cap_for_season(season)
        team_total = team_totals.get((team, season)) if team else None
        team_n = team_counts.get((team, season), 0) if team else 0

        salary_log = math.log10(amount)
        cap_pct = (amount / cap) if cap and cap > 0 else None
        team_pct = None
        if team_total and team_total > 0 and team_n >= MIN_TEAM_SALARY_ROWS:
            team_pct = min(amount / team_total, 1.0)
        rank_pos = rank_by_nkey.get((nn, season))

        row = {
            "name": name,
            "season": season,
            "SALARY_LOG": round(salary_log, 6),
            "SALARY_CAP_PCT": round(cap_pct, 6) if cap_pct is not None else None,
            "SALARY_TEAM_PCT": round(team_pct, 6) if team_pct is not None else None,
            "SALARY_RANK_POS": round(rank_pos, 6) if rank_pos is not None else None,
        }
        entries.append(row)
        labeled += 1
        if team_pct is not None:
            team_pct_rows += 1
        if cap_pct is not None:
            cap_pct_rows += 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "built": time.strftime("%Y-%m-%d"),
        "coverage": {
            "charted_rows": len(vec["players"]),
            "labeled_rows": labeled,
            "team_pct_rows": team_pct_rows,
            "cap_pct_rows": cap_pct_rows,
            "team_payroll_buckets": len(team_totals),
            "salary_source_rows": len(salaries),
        },
        "players": entries,
    }, separators=(",", ":")), encoding="utf-8")

    print(f"salary market: {labeled} labeled rows "
          f"({team_pct_rows} team%, {cap_pct_rows} cap%), "
          f"{len(team_totals)} team-season payrolls")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
