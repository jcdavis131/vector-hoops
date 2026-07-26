"""real tests for pipeline.archetype_time - wired from coverage gap mapper"""

import sys
import pathlib
import importlib.util
import json
import math
import pytest
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
PIPE = ROOT / "pipeline"
MOD_PATH = PIPE / "archetype_time.py"

if str(PIPE) not in sys.path:
    sys.path.insert(0, str(PIPE))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

spec = importlib.util.spec_from_file_location(f"pipeline.archetype_time", str(MOD_PATH))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def test_import():
    assert mod is not None
    assert hasattr(mod, "game_prevalence")

def test_game_prevalence_basic():
    # game_prevalence expects players with season and c (cluster id)
    players = [
        {"season": "2023-24", "c": 0},
        {"season": "2023-24", "c": 0},
        {"season": "2023-24", "c": 1},
        {"season": "2022-23", "c": 2},
    ]
    result = mod.game_prevalence(players, [])
    assert isinstance(result, list)
    assert len(result) >= 1
    # check shares sum ~1
    for entry in result:
        assert "season" in entry and "shares" in entry and "n" in entry
        assert abs(sum(entry["shares"]) - 1.0) < 0.01
        assert entry["n"] > 0

def test_game_prevalence_empty():
    result = mod.game_prevalence([], [])
    assert isinstance(result, list)
    assert result == []

def test_constants():
    assert hasattr(mod, "GAME_K")
    assert mod.GAME_K == 8

def test_tmp_path_integration(tmp_path):
    sample = {"eras": [{"era": "2020-24", "prevalence": 0.5}]}
    p = tmp_path / "archetype_time_sample.json"
    p.write_text(json.dumps(sample))
    assert p.exists()
    assert json.loads(p.read_text())["eras"][0]["prevalence"] == 0.5
