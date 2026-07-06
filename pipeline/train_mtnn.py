"""Vector Hoops MTNN v4 — multi-tower, multi-task player embedding.

Builds on train_towers.py with:
  - Residual MLP towers + per-family missing masks
  - Gated attention fusion across tower outputs (not naive concat)
  - Learned season context for cross-era comparison
  - Multi-task heads tying embeddings to interpretable game labels:
      * InfoNCE (career continuity + feature-dropout views)
      * archetype classification (k-means clusters from build_vectors)
      * position classification (PG/SG/SF/PF/C from enrich_vectors)
      * 14-dim game-profile reconstruction (transparent stats bridge)
      * salary regression (masked MSE on SALARY_LOG z)
      * v4: skill-tower bank — one mini-tower per Skills Lens skill
        (embedding -> grade/100, targets from build_skills.py), so the
        embedding is skill-aware; per-skill held-out R2/MAE + a
        skill-neighbor consistency metric land in mtnn_report.json
      * v4: pedigree_expectation head — predict PED_PICK_QUALITY z from
        the embedding (masked MSE; active only when the pedigree family
        is merged in the matrix): measures how much of a player-season's
        measured identity his draft slot explained

Outputs (pipeline/data/):
  embedding_v3.npz     — L2-normalized embeddings + archetype/position logits
  mtnn_report.json     — losses + retrieval / classification sanity metrics
  mtnn_centroids.npz   — archetype centroids in embedding space (Chimera axis)

Promotion into assets/ is deliberate and separate — the game keeps the
transparent 14-d profile until v3 beats baselines on the stated gates.

Run:  python pipeline/train_mtnn.py [--epochs 40] [--dim 48]
Requires: torch, numpy; pipeline/data/train_matrix.npz from build_vectors.py
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
VECTORS = ROOT / "assets" / "vectors.json"
POSITIONS = ["PG", "SG", "SF", "PF", "C"]
N_ARCHETYPES = 8


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def load_bundle():
    npz = np.load(DATA_DIR / "train_matrix.npz", allow_pickle=False)
    manifest = json.loads((DATA_DIR / "feature_manifest.json").read_text(encoding="utf-8"))
    Z = npz["Z"].astype(np.float32)
    mask = npz["mask"].astype(np.float32)
    names = npz["name"]
    seasons = npz["season"]
    pids = npz["player_id"]
    clusters = npz["cluster"].astype(np.int64)
    positions = load_positions(names, seasons)
    season_ids = season_index(seasons)
    return Z, mask, names, seasons, pids, clusters, positions, season_ids, manifest


def load_positions(names, seasons) -> np.ndarray:
    """Join position index from vectors.json; -1 = unknown."""
    pos = np.full(len(names), -1, dtype=np.int64)
    if not VECTORS.exists():
        return pos
    vec = json.loads(VECTORS.read_text(encoding="utf-8"))
    lookup = {(p["name"], p["season"]): int(p.get("p", -1)) for p in vec["players"]}
    for i, (n, s) in enumerate(zip(names, seasons)):
        pidx = lookup.get((str(n), str(s)), -1)
        if 0 <= pidx < len(POSITIONS):
            pos[i] = pidx
    return pos


def season_index(seasons) -> np.ndarray:
    uniq = sorted({str(s) for s in seasons})
    m = {s: i for i, s in enumerate(uniq)}
    return np.array([m[str(s)] for s in seasons], dtype=np.int64)


def family_slices(manifest) -> dict[str, list[int]]:
    fams: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(manifest["features"]):
        fams[manifest["families"][f]].append(j)
    return dict(fams)


def adjacent_season_pairs(pids, seasons, names=None) -> list[tuple[int, int]]:
    def season_start(s: str) -> int:
        return int(s[:4])

    by_key: dict[str | int, list[tuple[int, int]]] = defaultdict(list)
    for i, (pid, s) in enumerate(zip(pids, seasons)):
        key: str | int
        if names is not None:
            key = str(names[i])
        else:
            key = int(pid)
        by_key[key].append((season_start(str(s)), i))
    pairs = []
    for rows in by_key.values():
        rows.sort()
        for (y1, i1), (y2, i2) in zip(rows, rows[1:]):
            if y2 - y1 == 1:
                pairs.append((i1, i2))
    return pairs


def game_feature_cols(manifest) -> list[int]:
    game = manifest["game_features"]
    return [manifest["features"].index(f) for f in game]


def load_skill_labels(names, seasons) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Join Skills Lens grades (0-1) by (name, season); mask=0 where absent.

    Targets come from pipeline/data/skill_labels.npz (build_skills.py).
    """
    path = DATA_DIR / "skill_labels.npz"
    if not path.exists():
        return (np.zeros((len(names), 0), np.float32),
                np.zeros(len(names), np.float32), [])
    npz = np.load(path, allow_pickle=False)
    keys = [str(k) for k in npz["keys"]]
    lookup = {
        (str(n), str(s)): g
        for n, s, g in zip(npz["name"], npz["season"], npz["grades"])
    }
    G = np.zeros((len(names), len(keys)), dtype=np.float32)
    M = np.zeros(len(names), dtype=np.float32)
    for i, (n, s) in enumerate(zip(names, seasons)):
        g = lookup.get((str(n), str(s)))
        if g is not None:
            G[i] = g
            M[i] = 1.0
    return G, M, keys


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class ResidualTower(nn.Module):
    def __init__(self, d_in: int, d_out: int = 24, d_hidden: int = 96):
        super().__init__()
        d_cat = d_in * 2
        self.fc1 = nn.Linear(d_cat, d_hidden)
        self.ln1 = nn.LayerNorm(d_hidden)
        self.fc2 = nn.Linear(d_hidden, d_out)
        self.ln2 = nn.LayerNorm(d_out)
        self.skip = nn.Linear(d_cat, d_out) if d_cat != d_out else nn.Identity()

    def forward(self, x: torch.Tensor, m: torch.Tensor) -> torch.Tensor:
        h = torch.cat([x * m, m], dim=-1)
        y = self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(h)))) + self.skip(h))
        return y


class GatedFusion(nn.Module):
    """Attention-weighted tower mix + season context."""

    def __init__(self, n_towers: int, d_tower: int, n_seasons: int,
                 d_season: int = 12, d_emb: int = 48):
        super().__init__()
        self.season_emb = nn.Embedding(n_seasons, d_season)
        d_in = d_tower + d_season
        self.gate = nn.Linear(d_tower, 1)
        self.attn = nn.Sequential(
            nn.Linear(d_tower, d_tower), nn.Tanh(), nn.Linear(d_tower, 1),
        )
        self.fuse = nn.Sequential(
            nn.Linear(d_in, 192), nn.GELU(), nn.LayerNorm(192),
            nn.Linear(192, d_emb),
        )

    def forward(self, tower_stack: torch.Tensor, season_ids: torch.Tensor) -> torch.Tensor:
        # tower_stack: [B, T, D]
        scores = self.attn(tower_stack).squeeze(-1)
        weights = torch.softmax(scores, dim=-1)
        gates = torch.sigmoid(self.gate(tower_stack).squeeze(-1))
        mixed = (tower_stack * weights.unsqueeze(-1) * gates.unsqueeze(-1)).sum(1)
        s = self.season_emb(season_ids)
        emb = self.fuse(torch.cat([mixed, s], dim=-1))
        return F.normalize(emb, dim=-1)


class SkillTowers(nn.Module):
    """Players→skills tower bank: one mini-tower per Skills Lens skill.

    Each tower maps the fused embedding to that skill's grade/100, keeping
    per-skill capacity separate so one skill cannot cannibalize another's
    gradient (unlike a single shared linear head).
    """

    def __init__(self, d_emb: int, n_skills: int, d_hidden: int = 16):
        super().__init__()
        self.towers = nn.ModuleList([
            nn.Sequential(nn.Linear(d_emb, d_hidden), nn.GELU(),
                          nn.Linear(d_hidden, 1))
            for _ in range(n_skills)
        ])

    def forward(self, emb: torch.Tensor) -> torch.Tensor:
        return torch.cat([t(emb) for t in self.towers], dim=-1)


class MTNN(nn.Module):
    def __init__(self, fam_dims: dict[str, int], n_seasons: int,
                 d_tower: int = 24, d_emb: int = 48, n_game: int = 14,
                 n_skills: int = 0):
        super().__init__()
        self.families = sorted(fam_dims)
        self.towers = nn.ModuleDict({
            fam: ResidualTower(fam_dims[fam], d_tower) for fam in self.families
        })
        self.fusion = GatedFusion(len(self.families), d_tower, n_seasons, d_emb=d_emb)
        self.archetype_head = nn.Linear(d_emb, N_ARCHETYPES)
        self.position_head = nn.Linear(d_emb, len(POSITIONS))
        self.profile_head = nn.Linear(d_emb, n_game)
        self.salary_head = nn.Linear(d_emb, 1)
        self.pedigree_head = nn.Linear(d_emb, 1)
        self.skill_towers = SkillTowers(d_emb, n_skills) if n_skills else None

    def encode(self, xs, ms, season_ids):
        parts = torch.stack(
            [self.towers[fam](xs[fam], ms[fam]) for fam in self.families], dim=1)
        return self.fusion(parts, season_ids)

    def forward(self, xs, ms, season_ids):
        emb = self.encode(xs, ms, season_ids)
        out = {
            "archetype": self.archetype_head(emb),
            "position": self.position_head(emb),
            "profile": self.profile_head(emb),
            "salary": self.salary_head(emb).squeeze(-1),
            "pedigree": self.pedigree_head(emb).squeeze(-1),
        }
        if self.skill_towers is not None:
            out["skills"] = self.skill_towers(emb)
        return emb, out


# ---------------------------------------------------------------------------
# Training helpers
# ---------------------------------------------------------------------------

def split_by_family(Z, M, fams, device):
    xs, ms = {}, {}
    for fam, cols in fams.items():
        xs[fam] = torch.tensor(Z[:, cols], device=device)
        ms[fam] = torch.tensor(M[:, cols], device=device)
    return xs, ms


def batch_views(xs, ms, idx, drop_p=0.12):
    out_x, out_m = {}, {}
    for fam in xs:
        x = xs[fam][idx]
        m = ms[fam][idx]
        keep = (torch.rand_like(m) > drop_p).float()
        out_x[fam] = x * keep
        out_m[fam] = m * keep
    return out_x, out_m


def info_nce(za, zb, temp=0.08):
    logits = za @ zb.T / temp
    target = torch.arange(len(za), device=za.device)
    return 0.5 * (F.cross_entropy(logits, target) +
                  F.cross_entropy(logits.T, target))


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def season_start_year(season: str) -> int:
    return int(str(season)[:4])


def eval_split(season: str) -> str:
    """Held-out split for adjacent-season pairs (target = next season)."""
    y = season_start_year(season)
    if y <= 2021:
        return "train"
    if y <= 2023:
        return "val"
    return "test"


def filter_pairs_by_split(
    pairs: np.ndarray, seasons: np.ndarray, split: str,
) -> np.ndarray:
    """Keep pairs whose target row (index b) falls in split."""
    if len(pairs) == 0:
        return pairs
    keep = []
    for a, b in pairs:
        if eval_split(str(seasons[b])) == split:
            keep.append((int(a), int(b)))
    return np.array(keep, dtype=int) if keep else np.zeros((0, 2), int)


def recall_at_k(E: np.ndarray, pairs: np.ndarray, k: int = 10) -> float | None:
    if len(pairs) == 0:
        return None
    sample = pairs[np.random.choice(len(pairs), min(500, len(pairs)), replace=False)]
    hits = 0
    for a, b in sample:
        sims = E @ E[a]
        sims[a] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        hits += int(b in top)
    return hits / len(sample)


def transparent_baseline_embeddings(Z: np.ndarray, game_cols: list[int]) -> np.ndarray:
    """L2-normalized 14-d game profile vectors for held-out baseline."""
    G = Z[:, game_cols].astype(np.float64)
    norms = np.linalg.norm(G, axis=1, keepdims=True)
    G = G / np.maximum(norms, 1e-8)
    return G.astype(np.float32)


def classification_acc(logits: np.ndarray, labels: np.ndarray,
                       valid_mask: np.ndarray | None = None) -> float | None:
    if valid_mask is None:
        valid_mask = np.ones(len(labels), dtype=bool)
    idx = np.where(valid_mask)[0]
    if len(idx) == 0:
        return None
    pred = logits[idx].argmax(1)
    return float((pred == labels[idx]).mean())


def cross_era_archetype_purity(E: np.ndarray, clusters: np.ndarray,
                               seasons: np.ndarray, k: int = 20,
                               n_sample: int = 400) -> float | None:
    """Among cross-era neighbors, fraction sharing the same archetype."""
    season_year = np.array([int(str(s)[:4]) for s in seasons])
    rng = np.random.default_rng(7)
    candidates = np.where(clusters >= 0)[0]
    if len(candidates) < n_sample:
        return None
    sample = rng.choice(candidates, min(n_sample, len(candidates)), replace=False)
    purities = []
    for i in sample:
        sims = E @ E[i]
        sims[i] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        cross = top[season_year[top] != season_year[i]]
        if len(cross) == 0:
            continue
        purities.append(float((clusters[cross] == clusters[i]).mean()))
    return float(np.mean(purities)) if purities else None


def skill_holdout_metrics(pred: np.ndarray, target: np.ndarray,
                          valid: np.ndarray, seasons: np.ndarray,
                          keys: list[str]) -> dict:
    """Per-skill R2 + MAE (grade points, 0-100) on held-out season splits."""
    out: dict = {}
    split_of = np.array([eval_split(str(s)) for s in seasons])
    for split in ("val", "test"):
        rows = np.where((valid > 0) & (split_of == split))[0]
        if len(rows) == 0:
            out[split] = None
            continue
        p, t = pred[rows], target[rows]
        per = {}
        for j, key in enumerate(keys):
            resid = t[:, j] - p[:, j]
            ss_res = float((resid ** 2).sum())
            ss_tot = float(((t[:, j] - t[:, j].mean()) ** 2).sum())
            per[key] = {
                "r2": round(1.0 - ss_res / max(ss_tot, 1e-9), 4),
                "mae_pts": round(float(np.abs(resid).mean()) * 100.0, 2),
            }
        out[split] = {
            "rows": int(len(rows)),
            "mean_r2": round(float(np.mean([v["r2"] for v in per.values()])), 4),
            "per_skill": per,
        }
    return out


def skill_neighbor_consistency(E: np.ndarray, grades: np.ndarray,
                               valid: np.ndarray, k: int = 10,
                               n_sample: int = 400) -> float | None:
    """Mean |grade(self) − mean grade(top-k NN)| across skills, in grade
    points — lower means neighbors in this space share craft."""
    rows = np.where(valid > 0)[0]
    if len(rows) < n_sample + k:
        return None
    rng = np.random.default_rng(7)
    sample = rng.choice(rows, n_sample, replace=False)
    valid_mask = valid > 0
    gaps = []
    for i in sample:
        sims = E @ E[i]
        sims[i] = -np.inf
        sims[~valid_mask] = -np.inf
        top = np.argpartition(-sims, k)[:k]
        gaps.append(float(np.abs(grades[top].mean(0) - grades[i]).mean()) * 100.0)
    return round(float(np.mean(gaps)), 2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--dim", type=int, default=48)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=1.5e-3)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exclude-families", type=str, default="",
                    help="comma-separated tower families to drop (ablation)")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    (Z, M, names, seasons, pids, clusters, positions, season_ids,
     manifest) = load_bundle()
    fams = family_slices(manifest)
    exclude = {s.strip() for s in args.exclude_families.split(",") if s.strip()}
    if exclude:
        fams = {k: v for k, v in fams.items() if k not in exclude}
        print(f"excluded families: {sorted(exclude)} -> {len(fams)} towers")
    game_cols = game_feature_cols(manifest)
    game_z = torch.tensor(Z[:, game_cols], device=device)
    n_seasons = int(season_ids.max()) + 1

    print(f"{len(Z)} rows, {Z.shape[1]} features, {len(fams)} towers, "
          f"{n_seasons} seasons, device={device}")
    print(f"tower widths: { {k: len(v) for k, v in fams.items()} }")

    pairs = adjacent_season_pairs(pids, seasons, names)
    print(f"{len(pairs)} same-player adjacent-season pairs")

    sal_j = None
    if "SALARY_LOG" in manifest["features"]:
        sal_j = manifest["features"].index("SALARY_LOG")
    sal_z = torch.tensor(Z[:, sal_j], device=device) if sal_j is not None else None
    sal_m = torch.tensor(M[:, sal_j], device=device) if sal_j is not None else None

    ped_j = None
    if "PED_PICK_QUALITY" in manifest["features"]:
        ped_j = manifest["features"].index("PED_PICK_QUALITY")
    ped_z = torch.tensor(Z[:, ped_j], device=device) if ped_j is not None else None
    ped_m = torch.tensor(M[:, ped_j], device=device) if ped_j is not None else None
    if ped_j is not None:
        print(f"pedigree_expectation head active: "
              f"{int(M[:, ped_j].sum())} rows with draft-slot labels")
    arch_t = torch.tensor(clusters, device=device)
    pos_t = torch.tensor(positions, device=device)
    pos_mask = pos_t >= 0
    seas_t = torch.tensor(season_ids, device=device)

    skill_g, skill_m, skill_keys = load_skill_labels(names, seasons)
    skill_t = torch.tensor(skill_g, device=device)
    skillm_t = torch.tensor(skill_m, device=device)
    print(f"{len(skill_keys)} skill towers, "
          f"{int(skill_m.sum())} rows with Skills Lens labels")

    xs, ms = split_by_family(Z, M, fams, device)
    model = MTNN({f: len(c) for f, c in fams.items()}, n_seasons,
                 d_emb=args.dim, n_game=len(game_cols),
                 n_skills=len(skill_keys)).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    n = len(Z)
    pair_arr = np.array(pairs) if pairs else np.zeros((0, 2), int)
    lookup = {}
    if len(pair_arr):
        lookup = {int(a): int(b) for a, b in pair_arr}
        lookup.update({int(b): int(a) for a, b in pair_arr})

    history = []
    for epoch in range(args.epochs):
        model.train()
        perm = np.random.permutation(n)
        total, steps = 0.0, 0
        for s in range(0, n, args.batch):
            idx = perm[s:s + args.batch]
            if len(idx) < 8:
                continue
            idx_t = torch.tensor(idx, device=device)
            partner = np.array([lookup.get(int(i), int(i)) for i in idx])
            partner_t = torch.tensor(partner, device=device)

            xa, ma = batch_views(xs, ms, idx_t)
            xb, mb = batch_views(xs, ms, partner_t)
            za, out_a = model(xa, ma, seas_t[idx_t])
            zb, _ = model(xb, mb, seas_t[partner_t])

            loss = info_nce(za, zb)
            loss = loss + 0.35 * F.cross_entropy(out_a["archetype"], arch_t[idx_t])
            if pos_mask[idx_t].any():
                loss = loss + 0.2 * F.cross_entropy(
                    out_a["position"][pos_mask[idx_t]], pos_t[idx_t][pos_mask[idx_t]])
            loss = loss + 0.15 * F.mse_loss(out_a["profile"], game_z[idx_t])
            if "skills" in out_a:
                w = skillm_t[idx_t]
                if w.sum() > 0:
                    per_row = ((out_a["skills"] - skill_t[idx_t]) ** 2).mean(-1)
                    loss = loss + 0.3 * (w * per_row).sum() / w.sum()
            if sal_z is not None and sal_m is not None:
                w = sal_m[idx_t]
                if w.sum() > 0:
                    sal_loss = (w * (out_a["salary"] - sal_z[idx_t]) ** 2).sum() / w.sum()
                    loss = loss + 0.2 * sal_loss
            if ped_z is not None and ped_m is not None:
                w = ped_m[idx_t]
                if w.sum() > 0:
                    ped_loss = (w * (out_a["pedigree"] - ped_z[idx_t]) ** 2).sum() / w.sum()
                    loss = loss + 0.1 * ped_loss

            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total += float(loss)
            steps += 1
        sched.step()
        avg = total / max(1, steps)
        history.append(avg)
        if epoch % 5 == 0 or epoch == args.epochs - 1:
            print(f"epoch {epoch:3d}  loss {avg:.4f}  lr {sched.get_last_lr()[0]:.2e}")

    # ---- export ----
    model.eval()
    with torch.no_grad():
        emb = model.encode(xs, ms, seas_t)
        _, heads = model(xs, ms, seas_t)
    E = emb.cpu().numpy().astype(np.float32)
    arch_logits = heads["archetype"].cpu().numpy().astype(np.float32)
    pos_logits = heads["position"].cpu().numpy().astype(np.float32)
    skill_pred = (heads["skills"].cpu().numpy().astype(np.float32)
                  if "skills" in heads else np.zeros((len(E), 0), np.float32))

    np.savez_compressed(
        DATA_DIR / "embedding_v3.npz",
        E=E, player_id=pids, season=seasons, name=names,
        cluster=clusters, position=positions,
        archetype_logits=arch_logits, position_logits=pos_logits,
        skill_pred=skill_pred, skill_keys=np.array(skill_keys),
    )

    centroids = np.zeros((N_ARCHETYPES, E.shape[1]), dtype=np.float32)
    for k in range(N_ARCHETYPES):
        mask_k = clusters == k
        if mask_k.any():
            c = E[mask_k].mean(0)
            centroids[k] = c / (np.linalg.norm(c) + 1e-8)
    np.savez_compressed(DATA_DIR / "mtnn_centroids.npz", centroids=centroids)

    recall = recall_at_k(E, pair_arr, k=10)
    arch_acc = classification_acc(arch_logits, clusters)
    pos_acc = classification_acc(pos_logits, positions, positions >= 0)
    purity = cross_era_archetype_purity(E, clusters, seasons)

    G_base = transparent_baseline_embeddings(Z, game_cols)

    pedigree_report = None
    if ped_j is not None:
        ped_pred = heads["pedigree"].cpu().numpy().astype(np.float32)
        ped_true = Z[:, ped_j]
        ped_valid = M[:, ped_j]
        split_of = np.array([eval_split(str(s)) for s in seasons])
        pedigree_report = {}
        for split in ("val", "test"):
            rows = np.where((ped_valid > 0) & (split_of == split))[0]
            if len(rows) == 0:
                pedigree_report[split] = None
                continue
            resid = ped_true[rows] - ped_pred[rows]
            ss_tot = float(((ped_true[rows] - ped_true[rows].mean()) ** 2).sum())
            pedigree_report[split] = {
                "rows": int(len(rows)),
                "mae_z": round(float(np.abs(resid).mean()), 4),
                "r2": round(1.0 - float((resid ** 2).sum()) / max(ss_tot, 1e-9), 4),
            }

    skills_report = None
    if skill_keys:
        skills_report = {
            "holdout": skill_holdout_metrics(
                skill_pred, skill_g, skill_m, seasons, skill_keys),
            "neighbor_consistency_pts_mtnn": skill_neighbor_consistency(
                E, skill_g, skill_m),
            "neighbor_consistency_pts_transparent_14d": skill_neighbor_consistency(
                G_base, skill_g, skill_m),
        }
    held_out = {}
    for split in ("train", "val", "test", "all"):
        sub = pair_arr if split == "all" else filter_pairs_by_split(pair_arr, seasons, split)
        held_out[split] = {
            "pairs": int(len(sub)),
            "recall_at_10_mtnn": recall_at_k(E, sub, k=10),
            "recall_at_10_transparent_14d": recall_at_k(G_base, sub, k=10),
        }

    report = {
        "trained": time.strftime("%Y-%m-%d %H:%M"),
        "model": "mtnn_v4_skills",
        "epochs": args.epochs,
        "dim": args.dim,
        "towers": {k: len(v) for k, v in fams.items()},
        "positive_pairs": len(pairs),
        "position_labeled": int((positions >= 0).sum()),
        "final_loss": history[-1] if history else None,
        "recall_at_10_same_player_next_season": recall,
        "held_out_recall": held_out,
        "archetype_top1_acc": arch_acc,
        "position_top1_acc": pos_acc,
        "cross_era_archetype_neighbor_purity_at_20": purity,
        "skills": skills_report,
        "pedigree_expectation": pedigree_report,
        "promotion_gate": (
            "Promote only if held-out val/test recall@10 beats transparent 14-d "
            "baseline by >=0.05 AND archetype_top1_acc >= 0.55 (not auto-promoted)."
        ),
    }
    (DATA_DIR / "mtnn_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print("wrote embedding_v3.npz, mtnn_centroids.npz, mtnn_report.json")


if __name__ == "__main__":
    main()
