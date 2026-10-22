"""scripts/budget_check.py counts an asset a script names even after stamp_assets.py has added
its cache token: `fetch('/assets/x.json?v=<hex>')` is still x.json's bytes on that page."""

from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("budget_check", ROOT / "scripts" / "budget_check.py")
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)


def test_asset_literal_counts_tokened_and_bare_paths() -> None:
    js = "fetch('/assets/a.json?v=dc42490a'); load(\"assets/b.js\"); x = `./assets/c.css?v=0f`; y = '/assets/d.json?v=nothex'"
    assert bc._ASSET_LITERAL.findall(js) == ["/assets/a.json", "assets/b.js", "./assets/c.css"]
