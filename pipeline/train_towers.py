"""Vector Hoops embedding v2: multi-tower neural net over the wide,
era-normalized player-season matrix built by build_vectors.py.

See also: pipeline/train_mtnn.py (v3) — gated fusion, season context,
archetype/position heads for Chimera + cross-era comparison games.

Architecture (honest and simple):
  - One MLP tower per feature FAMILY (volume, playmaking, rebounding,
    defense, efficiency, shot-mix, tracking, bio, market). Each tower
    sees only its family's z-scores concatenated with that family's
    missing-mask bits, so sparsely-measured families (tracking pre-2014,
    salary gaps) are handled explicitly rather than imputed silently.
  - Tower outputs (16-d each) concatenate into a fusion head -> 32-d
    L2-normalized embedding.
  - Loss = InfoNCE contrastive:
      positives: (a) the SAME PLAYER in an adjacent season (career
                     continuity -- a real, checkable signal), and
                 (b) a feature-dropout augmented view of the same row.
      negatives: everything else in the batch.
    + auxiliary salary-regression head (masked MSE on SALARY_LOG z),
      which forces the embedding to carry "market value" structure.

Output:
  pipeline/data/embedding_v2.npz   (embeddings + ids)
  pipeline/data/tower_report.json  (losses, retrieval sanity metrics)

The game keeps using the transparent 14-dim profile until the v2
embedding demonstrably beats it on the retrieval sanity checks below
(same-player-next-season recall@10). No silent swaps: promoting v2 into
assets/ is a deliberate, separate step.

Run:  python pipeline/train_towers.py [--epochs 30] [--dim 32]
Requires: torch, numpy (build_vectors.py must have produced
pipeline/data/train_matrix.npz + feature_manifest.json).
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
    return Z, mask, names, seasons, pids, manifest


def family_slices(manifest) -> dict[str, list[int]]:
    fams: dict[str, list[int]] = defaultdict(list)
    for j, f in enumerate(manifest["features"]):
        fams[manifest["families"][f]].append(j)
    return dict(fams)


def adjacent_season_pairs(pids, seasons) -> list[tuple[int, int]]:
    """(i, j) where the same PLAYER_ID appears in consecutive seasons."""
    def season_start(s: str) -> int:
        return int(s[:4])
    by_pid: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for i, (pid, s) in enumerate(zip(pids, seasons)):
        by_pid[int(pid)].append((season_start(str(s)), i))
    pairs = []
    for rows in by_pid.values():
        rows.sort()
        for (y1, i1), (y2, i2) in zip(rows, rows[1:]):
            if y2 - y1 == 1:
                pairs.append((i1, i2))
    return pairs


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class Tower(nn.Module):
    def __init__(self, d_in: int, d_out: int = 16, d_hidden: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_in * 2, d_hidden),  # features + their mask bits
            nn.GELU(),
            nn.Linear(d_hidden, d_out),
        )

    def forward(self, x, m):
        return self.net(torch.cat([x * m, m], dim=-1))


class MultiTowerNet(nn.Module):
    def __init__(self, fam_dims: dict[str, int], d_tower: int = 16, d_emb: int = 32):
        super().__init__()
        self.families = sorted(fam_dims)
        self.towers = nn.ModuleDict({
            fam: Tower(fam_dims[fam], d_tower) for fam in self.families
        })
        d_cat = d_tower * len(self.families)
        self.fuse = nn.Sequential(
            nn.Linear(d_cat, 128), nn.GELU(), nn.Linear(128, d_emb),
        )
        self.salary_head = nn.Linear(d_emb, 1)

    def forward(self, xs: dict[str, torch.Tensor], ms: dict[str, torch.Tensor]):
        parts = [self.towers[fam](xs[fam], ms[fam]) for fam in self.families]
        emb = self.fuse(torch.cat(parts, dim=-1))
        emb = F.normalize(emb, dim=-1)
        sal = self.salary_head(emb).squeeze(-1)
        return emb, sal


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def split_by_family(Z, M, fams, device):
    xs, ms = {}, {}
    for fam, cols in fams.items():
        xs[fam] = torch.tensor(Z[:, cols], device=device)
        ms[fam] = torch.tensor(M[:, cols], device=device)
    return xs, ms


def batch_views(xs, ms, idx, drop_p=0.15):
    """Feature-dropout augmented view: zero features AND their mask bits."""
    out_x, out_m = {}, {}
    for fam in xs:
        x = xs[fam][idx]
        m = ms[fam][idx]
        keep = (torch.rand_like(m) > drop_p).float()
        out_x[fam] = x * keep
        out_m[fam] = m * keep
    return out_x, out_m


def info_nce(za, zb, temp=0.1):
    logits = za @ zb.T / temp
    target = torch.arange(len(za), device=za.device)
    return 0.5 * (F.cross_entropy(logits, target) +
                  F.cross_entropy(logits.T, target))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--dim", type=int, default=32)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    Z, M, names, seasons, pids, manifest = load_bundle()
    fams = family_slices(manifest)
    print(f"{len(Z)} rows, {Z.shape[1]} features, "
          f"{len(fams)} towers: { {k: len(v) for k, v in fams.items()} }")

    pairs = adjacent_season_pairs(pids, seasons)
    print(f"{len(pairs)} same-player adjacent-season positive pairs")

    sal_j = manifest["features"].index("SALARY_LOG")
    sal_z = torch.tensor(Z[:, sal_j], device=device)
    sal_m = torch.tensor(M[:, sal_j], device=device)

    xs, ms = split_by_family(Z, M, fams, device)
    model = MultiTowerNet({f: len(c) for f, c in fams.items()},
                          d_emb=args.dim).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    n = len(Z)
    pair_arr = np.array(pairs) if pairs else np.zeros((0, 2), int)
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

            # view A: augmented self; view B: adjacent season where
            # available, augmented self otherwise
            partner = idx.copy()
            if len(pair_arr):
                lookup = {int(a): int(b) for a, b in pair_arr}
                lookup.update({int(b): int(a) for a, b in pair_arr})
                partner = np.array([lookup.get(int(i), int(i)) for i in idx])
            partner_t = torch.tensor(partner, device=device)

            xa, ma = batch_views(xs, ms, idx_t)
            xb, mb = batch_views(xs, ms, partner_t)
            za, sal_a = model(xa, ma)
            zb, _ = model(xb, mb)

            loss = info_nce(za, zb)
            w = sal_m[idx_t]
            if w.sum() > 0:
                sal_loss = (w * (sal_a - sal_z[idx_t]) ** 2).sum() / w.sum()
                loss = loss + 0.25 * sal_loss
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += float(loss)
            steps += 1
        avg = total / max(1, steps)
        history.append(avg)
        if epoch % 5 == 0 or epoch == args.epochs - 1:
            print(f"epoch {epoch:3d}  loss {avg:.4f}")

    # ---- export embeddings ----
    model.eval()
    with torch.no_grad():
        emb, _ = model(xs, ms)
    E = emb.cpu().numpy().astype(np.float32)
    np.savez_compressed(DATA_DIR / "embedding_v2.npz",
                        E=E, player_id=pids, season=seasons, name=names)

    # ---- retrieval sanity: same-player-next-season recall@10 ----
    recall = None
    if len(pair_arr):
        sample = pair_arr[np.random.choice(len(pair_arr),
                                           min(500, len(pair_arr)), replace=False)]
        hits = 0
        for a, b in sample:
            sims = E @ E[a]
            sims[a] = -np.inf
            top = np.argpartition(-sims, 10)[:10]
            hits += int(b in top)
        recall = hits / len(sample)
        print(f"same-player-next-season recall@10: {recall:.3f} "
              f"(transparent 14-dim baseline should be compared before promoting)")

    (DATA_DIR / "tower_report.json").write_text(json.dumps({
        "trained": time.strftime("%Y-%m-%d %H:%M"),
        "epochs": args.epochs, "dim": args.dim,
        "towers": {k: len(v) for k, v in fams.items()},
        "positive_pairs": len(pairs),
        "final_loss": history[-1] if history else None,
        "recall_at_10_same_player_next_season": recall,
    }, indent=2), encoding="utf-8")
    print("wrote embedding_v2.npz + tower_report.json")


if __name__ == "__main__":
    main()
