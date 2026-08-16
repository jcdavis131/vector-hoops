"""Score population validation for an existing MTNN checkpoint without training."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from _torch_safe import safe_torch_load
from mtnn_validation import build_validation_report, role_labels_from_context
from train_mtnn import (
    BBREF_FEATURES,
    DATA_DIR,
    FORM_FEATURES,
    MTNN,
    adjacent_season_pairs,
    family_slices,
    feature_cols,
    filter_pairs_by_split,
    game_feature_cols,
    load_bundle,
    load_skill_labels,
    season_index,
    split_by_family,
)

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = DATA_DIR / "mtnn_best.pt"
REPORT = DATA_DIR / "mtnn_report.json"
OUT = DATA_DIR / "mtnn_validation_baseline.json"


def main() -> None:
    checkpoint = safe_torch_load(CHECKPOINT, map_location="cpu")
    args = checkpoint["args"]
    Z, M, names, seasons, pids, clusters, positions, _, manifest = load_bundle()
    families = family_slices(manifest)
    excluded = {value.strip() for value in args.get("exclude_families", "").split(",") if value.strip()}
    families = {name: cols for name, cols in families.items() if name not in excluded}
    game_cols = game_feature_cols(manifest)
    form_cols = feature_cols(manifest, FORM_FEATURES)
    bbref_cols = feature_cols(manifest, BBREF_FEATURES)
    _, _, skill_keys, _ = load_skill_labels(names, seasons)
    device = torch.device("cpu")
    model = MTNN(
        {name: len(cols) for name, cols in families.items()},
        int(season_index(seasons).max()) + 1,
        d_tower=args["tower_width"],
        d_tower_hidden=args["tower_hidden"],
        d_emb=args["dim"],
        n_game=len(game_cols),
        n_skills=len(skill_keys),
        d_skill_hidden=args["skill_hidden"],
        n_form=len(form_cols) if form_cols else 0,
        n_bbref=len(bbref_cols) if bbref_cols else 0,
        fusion_mode=args["fusion"],
        n_tower_blocks=args["tower_blocks"],
        mlp_heads=args["mlp_heads"],
        d_head_hidden=args["d_head_hidden"],
        d_model=args["d_model"],
        n_fusion_layers=args["n_fusion_layers"],
        n_attn_heads=args["n_attn_heads"],
        d_fusion_hidden=args["fusion_hidden"] or None,
    ).to(device)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    xs, ms = split_by_family(Z, M, families, device)
    season_ids = torch.tensor(season_index(seasons), device=device)
    with torch.inference_mode():
        embeddings, heads = model(xs, ms, season_ids)
        tower_stack = torch.stack(
            [model.towers[name](xs[name], ms[name]) for name in families],
            dim=1,
        )

    pairs = np.asarray(adjacent_season_pairs(pids, seasons, names), dtype=int)
    next_index = np.full(len(Z), -1, dtype=int)
    for source, target in pairs:
        next_index[source] = target
    validation = build_validation_report(
        embeddings=embeddings.numpy().astype(np.float32),
        tower_stack=tower_stack.numpy().astype(np.float32),
        archetype_logits=heads["archetype"].numpy().astype(np.float32),
        clusters=clusters,
        positions=positions,
        seasons=seasons,
        role_labels=role_labels_from_context(names, seasons, DATA_DIR / "role_context.json"),
        next_profile_pred=heads["next_profile"].numpy().astype(np.float32),
        game_profile_target=Z[:, game_cols],
        next_index=next_index,
        pairs=pairs,
        held_out_pairs=filter_pairs_by_split(pairs, seasons, "test"),
    )
    OUT.write_text(json.dumps(validation, indent=2), encoding="utf-8")
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    report["population_validation"] = validation
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(validation["collapse_flags"], indent=2))
    print(f"wrote {OUT.name} and updated {REPORT.name}")


if __name__ == "__main__":
    main()
