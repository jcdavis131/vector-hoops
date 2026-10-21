"""The three QA gates. PUBLISH is hard-blocked on any FAIL. Stdlib only."""

from __future__ import annotations

REQUIRED_FIELDS = {
    "game_id": str,
    "game_date": str,
    "season": str,
    "player_id": str,
    "player_name": str,
    "team_abbr": str,
    "period": int,
    "clock": str,
    "x": (int, float),
    "y": (int, float),
    "made": bool,
    "shot_type": str,
    "source": str,
    "fetched_at": str,
    "pipeline_version": str,
}

# Generous court bounds in feet (hoop at 0,0; +y toward half-court).
X_BOUND = 30.0
Y_MIN, Y_MAX = -5.0, 47.0
MIN_SHOTS_PER_GAME, MAX_SHOTS_PER_GAME = 80, 350


def check_schema(records: list) -> dict:
    errors = []
    for i, r in enumerate(records):
        for field, typ in REQUIRED_FIELDS.items():
            if field not in r:
                errors.append(f"record {i}: missing {field}")
            elif not isinstance(r[field], typ):
                errors.append(f"record {i}: {field} wrong type (got {type(r[field]).__name__})")
        if errors and len(errors) > 5:
            errors.append("...truncated")
            break
        if "x" in r and "y" in r and isinstance(r["x"], int | float) and isinstance(r["y"], int | float):
            if not (-X_BOUND <= r["x"] <= X_BOUND and Y_MIN <= r["y"] <= Y_MAX):
                errors.append(f"record {i}: coords out of bounds (x={r['x']}, y={r['y']})")
                if len(errors) > 5:
                    break
        if r.get("shot_type") not in (None, "2PT", "3PT"):
            errors.append(f"record {i}: bad shot_type {r.get('shot_type')!r}")
        if r.get("period") is not None and not 1 <= r["period"] <= 7:
            errors.append(f"record {i}: bad period {r.get('period')!r}")
    return {"verdict": "PASS" if not errors else "FAIL", "errors": errors[:10], "records_checked": len(records)}


def check_row_counts(records: list) -> dict:
    per_game: dict = {}
    for r in records:
        per_game.setdefault(r.get("game_id"), 0)
        per_game[r.get("game_id")] += 1
    bad = {g: n for g, n in per_game.items() if not MIN_SHOTS_PER_GAME <= n <= MAX_SHOTS_PER_GAME}
    return {"verdict": "PASS" if not bad else "FAIL", "games": len(per_game), "out_of_range": bad}


def check_spot_sample(records: list, refetch_one) -> dict:
    """refetch_one() -> (game_id, record_count, key_hash) re-pulled from source."""
    if not records:
        return {"verdict": "FAIL", "reason": "no records to sample"}
    try:
        game_id, count, key_hash = refetch_one()
    except Exception as exc:  # noqa: BLE001 - report, don't crash QA
        return {"verdict": "FAIL", "reason": f"refetch raised: {exc}"}
    local = [r for r in records if r.get("game_id") == game_id]
    ok = len(local) == count
    return {
        "verdict": "PASS" if ok else "FAIL",
        "game_id": game_id,
        "source_count": count,
        "local_count": len(local),
        "key_hash_match": key_hash,
    }


def run_qa(records: list, refetch_one) -> dict:
    schema = check_schema(records)
    counts = check_row_counts(records)
    spot = check_spot_sample(records, refetch_one)
    verdict = "PASS" if all(c["verdict"] == "PASS" for c in (schema, counts, spot)) else "FAIL"
    return {
        "verdict": verdict,
        "checks": {"schema": schema["verdict"], "row_counts": counts["verdict"], "spot_sample": spot["verdict"]},
        "detail": {"schema": schema, "row_counts": counts, "spot_sample": spot},
    }
