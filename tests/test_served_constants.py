"""v4 honesty grammar: served constants, model story, and copy rules. Stdlib + pytest.

The v4 panel (2026-10-19) found copy drifting from the spec: a contradictory
dossier footer, an 11% badge for a 0.115 overlap, a false eligibility message,
absence-led twin chips, and naked similarity numbers. These tests pin the
fixes: every displayed constant traces to assets/served-constants.js, banned
strings fail the build on resurrection, and the twin chips lead with presence.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent

BANNED = [
    "14-d serving vectors",  # the dossier footer contradiction (McInnes)
    "11% of each player's",  # badge drift: overlap@20 = 0.115 -> 12%
    "Not a current 2024-26 player",  # the false eligibility message
    "The Tough Seasons",  # renamed -> "The Brief Stints"
]


def _served_text_files() -> list[Path]:
    out = []
    for p in ROOT.rglob("*"):
        if ".git" in p.parts or "node_modules" in p.parts:
            continue
        if p.suffix in (".html", ".js") and p.is_file():
            out.append(p)
    return sorted(out)


@pytest.mark.parametrize("path", _served_text_files(), ids=lambda p: str(p.relative_to(ROOT)))
def test_no_banned_strings(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for banned in BANNED:
        assert banned not in text, f"{path.relative_to(ROOT)} resurrects {banned!r}"


def _registry_src() -> str:
    return (ROOT / "assets" / "served-constants.js").read_text(encoding="utf-8")


def test_registry_defines_constants() -> None:
    src = _registry_src()
    assert "window.VHServedConstants" in src
    for key in (
        "badge_overlap_pct",
        "badge_overlap_at20",
        "twin_bands",
        "twin_band_definition",
        "twin_pair_count",
        "twin_sim_percentiles",
        "region_count",
        "guess_rule",
    ):
        assert key in src, f"registry missing {key}"


def test_badge_matches_registry() -> None:
    src = _registry_src()
    m = re.search(r"badge_overlap_pct:\s*(\d+)", src)
    assert m and int(m.group(1)) == 12, "badge must be 12 (overlap@20 = 0.115)"
    assert re.search(r"badge_overlap_at20:\s*0\.115", src), "registry must cite 0.115"
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    # the badge reads from the registry; the static fallback is the same value
    assert 'data-served-const="badge_overlap_pct">12<' in index


def test_band_cutoffs_match_registry_and_json() -> None:
    src = _registry_src()
    cuts = [float(x) for x in re.findall(r'"min":\s*([\d.]+)', src)]
    assert cuts == [0.727, 0.663, 0.0], f"registry cutoffs drifted: {cuts}"
    bands = json.loads((ROOT / "assets" / "twin_bands.json").read_text(encoding="utf-8"))["bands"]
    assert [b["min"] for b in bands] == cuts, "twin_bands.json disagrees with the registry"
    tb = (ROOT / "assets" / "twin-bands.js").read_text(encoding="utf-8")
    assert "VHServedConstants" in tb, "twin-bands.js must read the registry"
    assert "twin_bands.json" not in tb, "twin-bands.js must not fetch a second copy"


def test_dossier_footer_tells_one_true_story() -> None:
    src = (ROOT / "assets" / "player-dossier.js").read_text(encoding="utf-8")
    assert "64-dimensional MTNN embedding" in src
    assert "14 era-normalized" in src


def test_regions_renamed_and_geometried() -> None:
    doc = json.loads((ROOT / "assets" / "atlas_regions.json").read_text(encoding="utf-8"))
    names = [r["name"] for r in doc["regions"]]
    assert len(names) == 12
    assert "The Brief Stints" in names
    assert "The Tough Seasons" not in names
    for r in doc["regions"]:
        assert r.get("geometry"), f"region {r['name']} has no stated geometry"
        assert "k-means" in r["geometry"], f"region {r['name']} geometry hides the method"


def _twin_explainer() -> dict:
    return json.loads((ROOT / "assets" / "twin_explainer.json").read_text(encoding="utf-8"))


def test_twin_chips_lead_with_presence() -> None:
    te = _twin_explainer()
    key = next(k for k in te if "AC Green|1999-00" in k and not k.startswith("_"))
    rec = te[key]
    # the v4 verification item: no longer three shared absences
    assert rec["kinds"][0] == "presence", f"AC Green chips: {rec['shared']}"
    assert not rec["absence_only"]
    assert rec["pct"] == sum(1 for t in te["_meta"]["pct_table"] if t < rec["sim"])
    assert 0 < rec["sim_se"] < 0.2, f"implausible bootstrap se: {rec['sim_se']}"


def test_strong_band_absence_only_pairs_are_flagged() -> None:
    te = _twin_explainer()
    for k, r in te.items():
        if k.startswith("_"):
            continue
        assert "absence_only" in r, f"{k} missing absence_only"
        assert "kinds" in r and len(r["kinds"]) == 3
    strong_absence = [k for k, r in te.items() if not k.startswith("_") and r["sim"] >= 0.727 and r["absence_only"]]
    assert strong_absence, "expected at least one absence_only strong pair to exercise the qualifier"
    # the renderer must show the qualifier for these
    src = (ROOT / "assets" / "twin-explainer.js").read_text(encoding="utf-8")
    assert "Strong twin, mostly in what they" in src


def test_percentile_table_self_consistent() -> None:
    te = _twin_explainer()
    table = te["_meta"]["pct_table"]
    assert len(table) == 101
    assert table == sorted(table)
    keys = [k for k in te if not k.startswith("_")]
    for k in keys[::47]:  # sample across the distribution
        r = te[k]
        assert r["pct"] == sum(1 for t in table if t < r["sim"]), k


def test_guess_rule_stated_where_players_type() -> None:
    play = (ROOT / "play.html").read_text(encoding="utf-8")
    assert 'data-served-const="guess_rule"' in play
    assert "12+ games, 450+ minutes" in play
    gm = (ROOT / "assets" / "past-modern-game.js").read_text(encoding="utf-8")
    assert "12+ games, 450+ minutes" in gm


def test_material_treatments_exist() -> None:
    # distinct CSS treatment for embedding-truth vs map-approximation surfaces
    for page in ("index.html", "play.html"):
        css = (ROOT / page).read_text(encoding="utf-8")
        assert ".vh-truth" in css and ".vh-approx" in css, page
    dos = (ROOT / "assets" / "player-dossier.js").read_text(encoding="utf-8")
    assert "vh-truth" in dos and "vh-approx" in dos
