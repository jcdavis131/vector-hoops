"""Training recipes: named sets of train_mtnn.py flags, kept in pipeline/recipes/*.json.

Why (2026-10-09). The flags a model trains with were spelled in four places
that disagreed: train_mtnn.py's argparse defaults (--dim 48, --device cpu),
the herdmux climb's pinned protocol (--dim 64 --epochs 40 --val-every 0
--no-best-checkpoint, everything else default), and the two refits
rebuild_all.py and train.sh hard-coded (--dim 48, NCE 0.7/0.3,
--phase final-refit, --era-align procrustes, --robust-scaling). The v5 refit
also differed between those two scripts: train.sh passed --hard-neg-boost
0.3, rebuild_all left the 0.4 default. No shipping path trained what the
climb measured [training#6, orchestration#3].

A recipe file is one JSON object:

    {"name": "measure", "description": "...", "measured": true,
     "notes": ["...", ...], "flags": {"--dim": 64, "--no-best-checkpoint": true}}

`flags` maps a train_mtnn.py option string ("--dim") or its argparse dest
("dim") to the value args.<dest> should take. That rule covers the booleans
too: "--no-best-checkpoint": true sets args.no_best_checkpoint to True (the
flag is passed), "--mlp-heads": false sets args.mlp_heads to False. A
BooleanOptionalAction's "--no-..." spelling is refused, because there
`true` would have to mean False.

train_mtnn.py --recipe NAME|PATH reads the file before the real parse,
checks every key against train_mtnn's own parser and every value against the
option's type and choices, and installs the values with
parser.set_defaults, so a flag given on the command line still wins. An
unknown key, a wrong type or an unknown recipe stops the run before anything
is loaded. The report's lineage block records the recipe's name, path,
sha256 and flags, and which of its values the command line overrode.
Without --recipe nothing changes.

NAME is a file in pipeline/recipes/ (measure, ship, legacy-v5-refit,
legacy-v6-refit); anything ending in .json or containing a path separator is
read as a path.

This module imports no torch, so tests and rebuild_all.py can load and check
recipes without it.
"""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from artifact_io import display_path, sha256_file

RECIPES_DIR = Path(__file__).resolve().parent / "recipes"
KEYS = ("name", "description", "measured", "notes", "flags")


@dataclass(frozen=True)
class Recipe:
    name: str
    path: Path
    sha256: str
    measured: bool
    flags: dict[str, Any]  # as written in the file
    # dest -> value, filled by bind() against a parser.
    values: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Parsed:
    args: argparse.Namespace
    recipe: Recipe | None
    # Every dest's default before the recipe was applied: the parser's own.
    defaults: dict[str, Any]


def available(recipes_dir: Path = RECIPES_DIR) -> list[str]:
    return sorted(p.stem for p in recipes_dir.glob("*.json"))


def resolve(spec: str, recipes_dir: Path = RECIPES_DIR) -> Path:
    """The file a --recipe value names. A name is looked up in recipes_dir."""
    if spec.endswith(".json") or "/" in spec or "\\" in spec:
        path = Path(spec)
        if not path.is_file():
            raise SystemExit(f"--recipe {spec}: no such file")
        return path.resolve()
    path = recipes_dir / f"{spec}.json"
    if not path.is_file():
        raise SystemExit(
            f"--recipe {spec}: no recipe of that name in {recipes_dir}. "
            f"Recipes: {', '.join(available(recipes_dir)) or '(none)'}"
        )
    return path.resolve()


def load(spec: str, recipes_dir: Path = RECIPES_DIR) -> Recipe:
    """Read and check one recipe file's shape. Its flags are checked by bind()."""
    path = resolve(spec, recipes_dir)
    where = f"recipe {path}"
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as e:
        raise SystemExit(f"{where}: not JSON ({e})") from None
    if not isinstance(doc, dict):
        raise SystemExit(f"{where}: must be a JSON object")
    missing = [k for k in KEYS if k not in doc]
    extra = sorted(set(doc) - set(KEYS))
    if missing or extra:
        raise SystemExit(f"{where}: keys must be exactly {list(KEYS)}; missing {missing}, unknown {extra}")
    if not isinstance(doc["name"], str) or not doc["name"]:
        raise SystemExit(f"{where}: name must be a non-empty string")
    if not isinstance(doc["description"], str):
        raise SystemExit(f"{where}: description must be a string")
    if not isinstance(doc["measured"], bool):
        raise SystemExit(f"{where}: measured must be true or false")
    notes = doc["notes"]
    if not (isinstance(notes, str) or (isinstance(notes, list) and all(isinstance(n, str) for n in notes))):
        raise SystemExit(f"{where}: notes must be a string or a list of strings")
    if not isinstance(doc["flags"], dict):
        raise SystemExit(f"{where}: flags must be an object of flag -> value")
    return Recipe(
        name=doc["name"],
        path=path,
        sha256=sha256_file(path),
        measured=doc["measured"],
        flags=dict(doc["flags"]),
    )


def _coerce(action: argparse.Action, key: str, value: Any, where: str) -> Any:
    """The value args.<dest> takes for this recipe entry, or SystemExit saying why not."""
    bad = f"{where}: {key!r}"
    if isinstance(action, argparse.BooleanOptionalAction):
        positive = next(s for s in action.option_strings if not s.startswith("--no-"))
        if key.startswith("--no-"):
            raise SystemExit(f"{bad}: write {positive!r}: true or false instead (the value is args.{action.dest})")
        if not isinstance(value, bool):
            raise SystemExit(f"{bad} takes true or false, not {value!r}")
        return value
    if isinstance(action, (argparse._StoreTrueAction, argparse._StoreFalseAction)):
        if not isinstance(value, bool):
            raise SystemExit(f"{bad} is a switch: true or false (the value of args.{action.dest}), not {value!r}")
        return value
    if action.nargs is not None or not isinstance(action, argparse._StoreAction):
        raise SystemExit(f"{bad}: a recipe cannot set this kind of option ({type(action).__name__})")
    if value is None or isinstance(value, (bool, list, dict)):
        raise SystemExit(f"{bad} takes one value, not {value!r}")
    kind = action.type
    if kind is int:
        if not isinstance(value, int):
            raise SystemExit(f"{bad} takes an integer, not {value!r}")
    elif kind is float:
        if not isinstance(value, (int, float)):
            raise SystemExit(f"{bad} takes a number, not {value!r}")
        value = float(value)
    elif kind is None or kind is str:
        if not isinstance(value, str):
            raise SystemExit(f"{bad} takes a string, not {value!r}")
    else:
        try:
            value = kind(value)
        except (TypeError, ValueError) as e:
            raise SystemExit(f"{bad}: {value!r} is not valid ({e})") from None
    if action.choices is not None and value not in action.choices:
        raise SystemExit(f"{bad}: {value!r} is not one of {list(action.choices)}")
    return value


def bind(recipe: Recipe, parser: argparse.ArgumentParser) -> Recipe:
    """Check every flag against parser and return the recipe with its dest -> value map."""
    where = f"recipe {recipe.path}"
    by_dest: dict[str, list[argparse.Action]] = {}
    for a in parser._actions:
        by_dest.setdefault(a.dest, []).append(a)
    values: dict[str, Any] = {}
    for key, value in recipe.flags.items():
        if key.startswith("-"):
            action = parser._option_string_actions.get(key)
            if action is None:
                raise SystemExit(f"{where}: {key!r} is not an option of {parser.prog}")
        else:
            acts = by_dest.get(key) or []
            if len(acts) != 1 or not acts[0].option_strings:
                raise SystemExit(f"{where}: {key!r} is not an option or argument name of {parser.prog}")
            action = acts[0]
        if action.dest in ("help", "recipe"):
            raise SystemExit(f"{where}: {key!r} cannot be set by a recipe")
        if action.dest in values:
            raise SystemExit(f"{where}: {key!r} sets args.{action.dest} a second time")
        values[action.dest] = _coerce(action, key, value, where)
    return replace(recipe, values=values)


def parse_with_recipe(
    parser: argparse.ArgumentParser,
    argv: Sequence[str] | None = None,
    recipes_dir: Path = RECIPES_DIR,
) -> Parsed:
    """parser.parse_args(argv), with --recipe's values as the defaults when it is given.

    The parser must declare --recipe itself (default None), so that the real
    parse accepts it and records it in args.
    """
    defaults = {a.dest: a.default for a in parser._actions if a.dest != "help"}
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--recipe", default=None)
    spec = pre.parse_known_args(argv)[0].recipe
    recipe = None
    if spec is not None:
        recipe = bind(load(spec, recipes_dir), parser)
        parser.set_defaults(**recipe.values)
    args = parser.parse_args(argv)
    if getattr(args, "recipe", None) != spec:
        # Only an abbreviated or unusual spelling gets here: the pre-parse and
        # the real parse read --recipe differently, so it was not applied.
        raise SystemExit(f"--recipe was read as {args.recipe!r} but applied as {spec!r}; spell it --recipe NAME")
    return Parsed(args=args, recipe=recipe, defaults=defaults)


def _render(action: argparse.Action, value: Any) -> str:
    opt = next((s for s in action.option_strings if s.startswith("--")), action.option_strings[0])
    if isinstance(action, argparse.BooleanOptionalAction):
        return opt if value else "--no-" + opt[2:]
    if action.nargs == 0:
        return opt
    return f"{opt} {value}"


def non_default_flags(parser: argparse.ArgumentParser, parsed: Parsed) -> list[str]:
    """Every option whose value differs from the parser's own default, as `--flag value (source)`."""
    out = []
    recipe_values = parsed.recipe.values if parsed.recipe else {}
    for action in parser._actions:
        dest = action.dest
        if dest == "help" or not action.option_strings:
            continue
        value = getattr(parsed.args, dest)
        if value == parsed.defaults.get(dest):
            continue
        source = "recipe" if dest in recipe_values and recipe_values[dest] == value else "command line"
        out.append(f"{_render(action, value)} ({source})")
    return out


def lineage(parsed: Parsed, root: Path) -> dict[str, Any] | None:
    """The report's lineage["recipe"]: what was asked for, and what the command line changed."""
    r = parsed.recipe
    if r is None:
        return None
    return {
        "name": r.name,
        "path": display_path(r.path, root),
        "sha256": r.sha256,
        "flags": dict(r.flags),
        # Recipe values the command line replaced; empty when the run is the recipe.
        "overridden": sorted(d for d, v in r.values.items() if getattr(parsed.args, d) != v),
    }
