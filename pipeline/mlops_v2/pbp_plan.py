"""PBP transport plan — manifest only, by design.

Full NBA play-by-play is ~17.5 GB (~36,900 regular-season games).
It must NOT move through git, and no bulk PBP download starts without
a transport plan the user has approved. This module writes that plan
and STOPS. It downloads nothing.

Transport options (decision owed by the user):
  (a) Object storage / direct download on the operator machine, with
      checksums + a versioned manifest (recommended).
  (b) Forge queue to Alienware (GPU box) as the PBP host, with the
      same manifest — needs a Forge job, which this task does not queue.
  (c) Incremental per-season pulls with resume — same storage question.
  NEVER: git, git-lfs as a bulk pipe, or an unmanifested bulk pull.

Also recorded: cached PBP today is 5 games (2.2 MB); the text tower's
template dedup (~16x) makes the TEXT tower affordable once PBP lands,
but raw PBP text is never redistributed.
"""
from __future__ import annotations

from .common import CACHE, OUT, provenance, write_json


def run():
    plan = {
        "stage": "pbp-transport-plan",
        "status": "PLAN ONLY — no bulk download started, no transport chosen",
        "scale_estimate": "~17.5 GB, ~36,900 regular-season games",
        "cached_today": {
            "games": 5, "bytes_note": "2.2 MB (pipeline/cache/cdn_pbp/)",
            "files": sorted(p.name for p in (CACHE / "cdn_pbp").glob("*.json")),
        },
        "forbidden": ["git / git-lfs as the bulk pipe",
                      "unmanifested bulk pull",
                      "bulk download without a transport decision"],
        "options": {
            "a_object_storage_operator_machine": "RECOMMENDED: direct "
                "download on the operator machine + checksums + versioned "
                "manifest; pipeline reads from the manifest path, not git.",
            "b_forge_alienware_host": "PBP host = Alienware via Forge queue; "
                "needs a Forge job (not queued by this task).",
            "c_incremental_per_season": "Resume-safe per-season pulls; "
                "same storage question as (a).",
        },
        "decision_owed": "user picks a transport option; then a fetcher "
                          "with resume + checksums is built against it",
        "license_note": "PBP is NBA-origin (NEEDS PERMISSION) and §9(vi) "
                        "also touches archived play-by-play product surfaces. "
                        "Permission posture must land before bulk fetch.",
        "provenance": provenance(
            "NBA PBP feeds (cdn.nba.com / api.nba.com / data.nba.com)",
            "NEEDS PERMISSION",
            "plan only; no download",
        ),
    }
    write_json(OUT / "fetch-plans" / "pbp_transport_plan.json", plan)
    print("PBP transport plan written; no download started (decision owed).")
    return plan


if __name__ == "__main__":
    run()
