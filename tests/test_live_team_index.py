"""Courtside Live's style map colours teams by ESPN code; the map stores NBA tricodes.

assets/live-atlas.js carries the ESPN -> map index. This checks it against real data:
every team in ESPN's own list (docs/live-recon/team_map.json) must land on a tricode the
map holds for its newest season (assets/projections/embed3d.json), and the six aliases must
be the inverse of pipeline/build_replays.py's NBA -> ESPN table.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _index() -> dict:
    js = (ROOT / "assets" / "live-atlas.js").read_text(encoding="utf-8")
    m = re.search(r"var ESPN_TO_MAP = \{([^}]*)\}", js)
    assert m, "live-atlas.js has no ESPN_TO_MAP"
    return dict(re.findall(r"(\w+): '(\w+)'", m.group(1)))


def test_every_espn_team_lands_on_the_map() -> None:
    idx = _index()
    espn = [
        t["abbr"] for t in json.loads((ROOT / "docs/live-recon/team_map.json").read_text(encoding="utf-8")).values()
    ]
    assert len(set(espn)) == 30
    d = json.loads((ROOT / "assets/projections/embed3d.json").read_text(encoding="utf-8"))
    teams, base = d["meta"]["teams"], d["meta"]["season_base"]
    newest = max(base + (m >> 9) for m in d["m"])
    held = {teams[((m >> 3) & 63) - 1] for m in d["m"] if base + (m >> 9) == newest and (m >> 3) & 63}
    assert newest == 2025, "MAP_SEASON in live-atlas.js must follow the newest season"
    missing = sorted(a for a in espn if idx.get(a, a) not in held)
    assert not missing, missing


def test_aliases_match_the_replay_pipeline() -> None:
    src = (ROOT / "pipeline" / "build_replays.py").read_text(encoding="utf-8")
    block = re.search(r"ALIAS = \{(.*?)\}", src, re.S).group(1)
    nba_to_espn = dict(re.findall(r'"(\w+)": "(\w+)"', block))
    assert _index() == {v: k for k, v in nba_to_espn.items()}
