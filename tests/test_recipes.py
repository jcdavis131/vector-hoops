"""pipeline/recipes/*.json, pipeline/mtnn_recipe.py and train_mtnn.py --recipe.

The recipe files are the one place the training flags are spelled
[training#6, orchestration#3]. These tests hold them to train_mtnn's real
parser (so a renamed or retyped option breaks here, not mid-rebuild), hold
measure.json to the herdmux climb's pinned flags when climb.py is on the box,
and hold ship.json to measure.json.

The first half uses a small parser of its own and needs no torch. The second
half imports train_mtnn (and with it torch) to build its parser; nothing
trains, and nothing is written outside tmp_path.

Run:  python -m pytest tests/test_recipes.py
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path

import pytest
from climb_protocol import climb_py, hoops_protocol

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import mtnn_recipe as mr  # noqa: E402
from artifact_io import sha256_file  # noqa: E402

NAMES = ["legacy-v5-refit", "legacy-v6-refit", "measure", "ship"]


# --- the loader, on a parser of its own ---------------------------------------------


def toy_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="toy")
    p.add_argument("--n", type=int, default=1)
    p.add_argument("--x", type=float, default=0.5)
    p.add_argument("--mode", choices=("a", "b"), default="a")
    p.add_argument("--name", type=str, default="")
    p.add_argument("--flag", action="store_true")
    p.add_argument("--heads", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--recipe", default=None)
    return p


def write(tmp_path: Path, flags: dict, **doc) -> str:
    body = {"name": "toy", "description": "", "measured": False, "notes": [], "flags": flags, **doc}
    path = tmp_path / "toy.json"
    path.write_text(json.dumps(body), encoding="utf-8")
    return str(path)


def parse(tmp_path: Path, flags: dict, *argv: str) -> mr.Parsed:
    return mr.parse_with_recipe(toy_parser(), ["--recipe", write(tmp_path, flags), *argv])


def test_values_become_defaults_and_the_command_line_wins(tmp_path):
    flags = {"--n": 3, "--x": 2, "--mode": "b", "name": "z", "--flag": True, "--heads": False}
    got = parse(tmp_path, flags)
    args = vars(got.args)
    assert args.pop("recipe").endswith("toy.json")
    assert args == {"n": 3, "x": 2.0, "mode": "b", "name": "z", "flag": True, "heads": False}
    assert isinstance(got.args.x, float)
    over = parse(tmp_path, flags, "--n", "9", "--heads")
    assert (over.args.n, over.args.heads, over.args.mode) == (9, True, "b")
    assert mr.lineage(over, tmp_path)["overridden"] == ["heads", "n"]
    # Defaults reported are the parser's own, not the recipe's.
    assert over.defaults["n"] == 1 and over.defaults["heads"] is True


def test_no_recipe_is_a_plain_parse():
    got = mr.parse_with_recipe(toy_parser(), ["--n", "4"])
    assert vars(got.args) == vars(toy_parser().parse_args(["--n", "4"]))
    assert got.recipe is None and mr.lineage(got, ROOT) is None


@pytest.mark.parametrize(
    ("flags", "message"),
    [
        ({"--nope": 1}, "'--nope' is not an option of toy"),
        ({"nope": 1}, "'nope' is not an option or argument name of toy"),
        ({"--n": True}, "'--n' takes one value"),
        ({"--n": 2.5}, "'--n' takes an integer"),
        ({"--n": "3"}, "'--n' takes an integer"),
        ({"--x": "0.1"}, "'--x' takes a number"),
        ({"--name": 5}, "'--name' takes a string"),
        ({"--mode": "c"}, "'--mode': 'c' is not one of ['a', 'b']"),
        ({"--flag": 1}, "'--flag' is a switch: true or false"),
        ({"--heads": "yes"}, "'--heads' takes true or false"),
        ({"--no-heads": True}, "'--no-heads': write '--heads': true or false instead"),
        ({"--n": 2, "n": 3}, "'n' sets args.n a second time"),
        ({"--recipe": "other"}, "'--recipe' cannot be set by a recipe"),
        ({"-h": True}, "'-h' cannot be set by a recipe"),
    ],
)
def test_a_bad_flag_stops_before_parsing_and_names_itself(tmp_path, flags, message):
    with pytest.raises(SystemExit, match=r"recipe .*toy\.json") as e:
        parse(tmp_path, flags)
    assert message in str(e.value)


@pytest.mark.parametrize(
    ("doc", "message"),
    [
        ({"measured": "yes"}, "measured must be true or false"),
        ({"flags": ["--n", "3"]}, "flags must be an object"),
        ({"notes": [1]}, "notes must be a string or a list of strings"),
        ({"name": ""}, "name must be a non-empty string"),
        ({"flag": {}}, "unknown ['flag']"),
    ],
)
def test_a_malformed_file_is_refused(tmp_path, doc, message):
    with pytest.raises(SystemExit) as e:
        mr.load(write(tmp_path, **{"flags": {}, **doc}))
    assert message in str(e.value)


def test_names_resolve_in_the_recipes_dir_and_unknown_names_list_them(tmp_path):
    for stem in ("one", "two"):
        (tmp_path / f"{stem}.json").write_text("{}", encoding="utf-8")
    assert mr.resolve("two", tmp_path) == (tmp_path / "two.json").resolve()
    with pytest.raises(SystemExit, match=r"--recipe three: no recipe of that name .* Recipes: one, two"):
        mr.resolve("three", tmp_path)
    with pytest.raises(SystemExit, match="no such file"):
        mr.resolve(str(tmp_path / "missing.json"), tmp_path)


def test_lineage_records_the_file_as_read(tmp_path):
    got = parse(tmp_path, {"--n": 3})
    rec = mr.lineage(got, tmp_path)
    assert rec == {
        "name": "toy",
        "path": "toy.json",
        "sha256": sha256_file(tmp_path / "toy.json"),
        "flags": {"--n": 3},
        "overridden": [],
    }


# --- the committed recipes -------------------------------------------------------


def test_the_committed_recipes():
    assert mr.available() == NAMES
    for name in NAMES:
        r = mr.load(name)
        doc = json.loads(r.path.read_text(encoding="utf-8"))
        assert r.name == name == r.path.stem
        assert doc["description"] and doc["notes"] and r.flags, name


def test_ship_is_measure_unchanged():
    """Ship what you measure. If a flag that does not change training is ever
    needed here, add it deliberately and say why in ship.json's notes."""
    measure, ship = mr.load("measure"), mr.load("ship")
    assert ship.flags == measure.flags
    assert measure.measured and ship.measured
    assert not {"--device", "--seed", "device", "seed"} & set(measure.flags)


def test_legacy_refits_are_unmeasured_final_refits():
    for name in ("legacy-v5-refit", "legacy-v6-refit"):
        r = mr.load(name)
        assert r.measured is False
        assert r.flags["--phase"] == "final-refit"


# --- against train_mtnn's own parser (imports torch) ------------------------------------


@pytest.fixture(scope="module")
def tm():
    return importlib.import_module("train_mtnn")


@pytest.mark.parametrize("name", NAMES)
def test_every_recipe_parses_in_train_mtnns_parser(tm, name):
    got = tm.parse_args(["--recipe", name])
    assert got.recipe.name == name
    assert set(got.recipe.values) == {
        tm.build_parser()._option_string_actions[k].dest if k.startswith("-") else k for k in got.recipe.flags
    }
    for dest, value in got.recipe.values.items():
        assert getattr(got.args, dest) == value, dest


def test_without_a_recipe_train_mtnn_parses_as_before(tm):
    got = tm.parse_args([])
    assert vars(got.args) == vars(tm.build_parser().parse_args([]))
    assert got.args.recipe is None and got.recipe is None
    assert mr.non_default_flags(tm.build_parser(), got) == []


def test_measure_is_the_climbs_pinned_train_flags(tm):
    path = climb_py()
    if path is None:
        pytest.skip("herdmux gpu/climb.py not on this machine (set HERDMUX_ROOT to point at it)")
    tokens = hoops_protocol(path, "train")
    kept: list[str] = []
    it = iter(tokens)
    for tok in it:
        if tok in ("--device", "--seed"):
            next(it)  # the climb sets these per run; measure.json leaves them out
            continue
        kept.append(tok)
    climb = vars(tm.build_parser().parse_args(kept))
    recipe = vars(tm.parse_args(["--recipe", "measure"]).args)
    recipe.pop("recipe")
    climb.pop("recipe")
    assert recipe == climb, f"pipeline/recipes/measure.json drifted from PROTOCOLS['vector-hoops'].train in {path}"
    assert {t for t in kept if t.startswith("--")} == set(mr.load("measure").flags)


def test_the_command_line_overrides_a_recipe_and_the_lineage_says_so(tm):
    got = tm.parse_args(["--recipe", "measure", "--dim", "48"])
    assert (got.args.dim, got.args.epochs, got.args.val_every, got.args.no_best_checkpoint) == (48, 40, 0, True)
    rec = mr.lineage(got, ROOT)
    assert rec["name"] == "measure" and rec["path"] == "pipeline/recipes/measure.json"
    assert rec["sha256"] == sha256_file(ROOT / "pipeline" / "recipes" / "measure.json")
    assert rec["flags"] == mr.load("measure").flags
    assert rec["overridden"] == ["dim"]


def test_the_start_of_run_line_names_every_non_default_option(tm):
    parser = tm.build_parser()
    got = mr.parse_with_recipe(parser, ["--recipe", "measure", "--device", "cuda", "--seed", "5"])
    assert mr.non_default_flags(parser, got) == [
        "--device cuda (command line)",
        "--dim 64 (recipe)",
        "--seed 5 (command line)",
        "--val-every 0 (recipe)",
        "--no-best-checkpoint (recipe)",
        "--recipe measure (command line)",
    ]
