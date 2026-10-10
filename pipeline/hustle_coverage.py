"""Which hustle numbers in a wide_skills_<season>.json were measured [ingest#2, features#3].

fetch_wide_skills.build_season_cache unioned player names across five
endpoints and wrote `float(h.get("BOX_OUTS") or 0.0)` for every hustle field,
so a player the hustle endpoint did not list, and a column the endpoint did
not track that season, both became 0.0 in a cache stamped complete=True.
Measured in the 11 caches (2015-16..2025-26):
  - 2015-16: box_outs 0 for 476/476 players, charges 468, screen_ast 409,
    loose_balls 405, deflections 379, contested_shots 333; 329 players have
    every hustle field at 0. The endpoint only partly covered that season.
  - box_outs: 0 for 476/476 (2015-16) and 486/486 (2016-17); from 2017-18
    17-71 zeros a season against 312+ distinct values.
  - d_fg_pct: 0.0 for every player of every season. The Defense measure
    does not return D_FG_PCT under that name; it was never measured.
  - From 2016-17, 1-10 players a season have every tracked hustle field at
    0: absent from the hustle endpoint, not measured at zero.
A real zero stays a zero: charges drawn is 0 for 208-334 players a season
(about 40-60%) with the other fields non-zero.

In an existing cache an absent player and a measured zero cannot be told
apart (the union erased it), so the repair is season-level plus one row
rule:
  season rules   box_outs before BOX_OUTS_TRACKED_FROM, d_fg_pct always
                 -> None; in a PARTIAL_SEASONS season every hustle 0.0
                 -> None, while a non-zero value stays
  absent rows    every field the season tracks is exactly 0 -> all None

Why 2015-16 is partial rather than untracked (corrected 2026-10-10): the
first repair nulled every 2015-16 hustle value, and with it 386 non-zero
values for 147 players (contested 143, deflections 97, loose balls 71,
screen assists 67, charges 8). A non-zero number can only have come from
the endpoint, so those were measurements. What 2015-16 cannot say is
whether a 0.0 is a measured zero or a player the endpoint skipped, and with
329 of 476 players at 0 on every field it skips a lot; so the zeros go and
the non-zeros stay. The observed 2015-16 values are therefore the non-zero
ones only, which the mask records.
fetch_wide_skills applies the season rules when it writes (it already
writes None for an absent player). Docs written that way, and the repaired
caches, carry "field_coverage"; readers apply the absent-row rule only to a
doc without it.

Stdlib only.
"""

from __future__ import annotations

HUSTLE_FIELDS = ("screen_ast", "deflections", "loose_balls", "charges", "box_outs", "contested_shots")
NEVER_MEASURED = ("d_fg_pct",)
HUSTLE_TRACKED_FROM = "2015-16"
BOX_OUTS_TRACKED_FROM = "2017-18"
# The endpoint covered these seasons only in part: a 0.0 may be a player it
# skipped, a non-zero value was measured.
PARTIAL_SEASONS = ("2015-16",)


def untracked_fields(season: str) -> tuple[str, ...]:
    """Hustle fields the endpoint did not measure for that season."""
    if season < HUSTLE_TRACKED_FROM:
        return HUSTLE_FIELDS
    if season < BOX_OUTS_TRACKED_FROM:
        return ("box_outs",)
    return ()


def apply_season_rules(season: str, rec: dict) -> dict:
    """Copy of one player record with the season's unmeasured fields set to None."""
    out = dict(rec)
    for f in (*NEVER_MEASURED, *untracked_fields(season)):
        if f in out:
            out[f] = None
    if season in PARTIAL_SEASONS:
        for f in HUSTLE_FIELDS:
            if out.get(f) is not None and float(out[f]) == 0.0:
                out[f] = None
    return out


def is_absent_row(season: str, rec: dict) -> bool:
    """Every hustle field the season tracks is exactly 0.0: the player was not in the hustle response."""
    tracked = [f for f in HUSTLE_FIELDS if f not in untracked_fields(season) and f in rec]
    return bool(tracked) and all(rec[f] is not None and float(rec[f]) == 0.0 for f in tracked)


def honest_record(season: str, rec: dict, *, legacy: bool) -> dict:
    """The record with unmeasured hustle values None. legacy: the doc has no field_coverage."""
    out = apply_season_rules(season, rec)
    if legacy and is_absent_row(season, out):
        for f in HUSTLE_FIELDS:
            if f in out:
                out[f] = None
    return out


def honest_players(doc: dict) -> dict[str, dict]:
    """A wide_skills doc's players with unmeasured hustle values None (idempotent)."""
    season = str(doc["season"])
    legacy = "field_coverage" not in doc
    return {nn: honest_record(season, rec, legacy=legacy) for nn, rec in (doc.get("players") or {}).items()}


def field_coverage(players: dict[str, dict]) -> dict[str, int]:
    """Field -> number of players with a measured (non-None) value."""
    fields = sorted({f for rec in players.values() for f in rec})
    return {f: sum(1 for rec in players.values() if rec.get(f) is not None) for f in fields}


REPAIR_NOTE = (
    "2026-10-09: unmeasured hustle values set to null [ingest#2, features#3]. Season rules: box_outs before "
    "2017-18 and d_fg_pct always; in 2015-16, which the endpoint covered only in part, every hustle 0.0 (a "
    "non-zero value was measured and stays; corrected 2026-10-10, the first repair had nulled all of 2015-16). "
    "Absent rows: every tracked hustle field was 0.0. field_coverage counts the repaired fields only. "
    "post_*/trans_*/pull_up_fg3a are as fetched: a 0.0 there can be a player the endpoint did not list, and "
    "cannot be told apart from a measured zero."
)


def repair_doc(doc: dict) -> tuple[dict, dict[str, int]]:
    """(repaired doc, counts) for one legacy cache doc: values nulled per field, rows found absent."""
    season = str(doc["season"])
    before = doc.get("players") or {}
    after = honest_players(doc)
    counts = {f: 0 for f in (*HUSTLE_FIELDS, *NEVER_MEASURED)}
    absent = 0
    for nn, rec in before.items():
        new = after[nn]
        for f in counts:
            if rec.get(f) is not None and new.get(f) is None:
                counts[f] += 1
        if "field_coverage" not in doc and is_absent_row(season, apply_season_rules(season, rec)):
            absent += 1
    counts["absent_rows"] = absent
    out = {k: v for k, v in doc.items() if k != "players"}
    out["untracked_fields"] = [*untracked_fields(season), *NEVER_MEASURED]
    repaired = (*HUSTLE_FIELDS, *NEVER_MEASURED)
    out["field_coverage"] = {f: n for f, n in field_coverage(after).items() if f in repaired}
    out["repair"] = REPAIR_NOTE
    out["players"] = after
    return out, counts


def main() -> None:
    import argparse
    import json
    from pathlib import Path

    ap = argparse.ArgumentParser(description="Null the unmeasured hustle values in the committed wide_skills caches")
    ap.add_argument("--write", action="store_true", help="rewrite the caches (default: report only)")
    args = ap.parse_args()
    cache = Path(__file__).resolve().parent / "cache"
    for path in sorted(cache.glob("wide_skills_*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if "field_coverage" in doc:
            print(f"{path.name}: already carries field_coverage; unchanged")
            continue
        out, counts = repair_doc(doc)
        print(f"{path.name}: {len(doc.get('players') or {})} players; nulled {counts}")
        if args.write:
            # Same layout as the fetcher wrote: compact separators, no trailing newline.
            from artifact_io import atomic_write_text

            atomic_write_text(path, json.dumps(out, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
