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
      * v4: playoff_riser head — predict PO_PTS_DELTA z (postseason minus
        regular-season scoring) from the embedding (masked MSE; active
        when the playoffs family is merged)
      * v4: honors_recognition head — predict HON_ALL_NBA_VOTE_LAG z from
        the embedding (masked MSE; active when the honors family is merged)
      * Phase B: team_fit, roster_lift, form_recon, career_slope,
        competition (+ bbref_bridge when cache exists); rebalanced loss
        weights; same-position hard-negative InfoNCE; val recall trace +
        best-checkpoint restore

Run:  python pipeline/train_mtnn.py [--epochs 40] [--dim 48]
       python pipeline/train_mtnn.py --lr-schedule onecycle --anneal-strategy linear
       python pipeline/mtnn_hp_sweep.py --profile novel [--quick]
       python pipeline/tower_ablation.py
Requires: torch, numpy; pipeline/data/train_matrix.npz from build_vectors.py
"""

from __future__ import annotations

import argparse
import itertools
import json
import time
from collections import defaultdict
from pathlib import Path

import composite_score as cqs
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from mtnn_validation import build_validation_report, role_labels_from_context

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "pipeline" / "data"
VECTORS = ROOT / "assets" / "vectors.json"
BEST_CKPT = DATA_DIR / "mtnn_best.pt"
POSITIONS = ["PG", "SG", "SF", "PF", "C"]
N_ARCHETYPES = 8

# v4 auxiliary targets (must exist in feature_manifest.json when active)
FORM_FEATURES = [
    "FORM_VOL",
    "FORM_CEIL",
    "FORM_DD_RATE",
    "FORM_TD_RATE",
    "FORM_GP",
    "FORM_MIN_AVG",
]
# Durability head targets — availability read off the embedding, never fed in as
# an input tower (the A/B proved injury-as-input regresses style retrieval).
INJURY_FEATURES = [
    "INJ_GP_PCT",
    "INJ_MISS_N",
    "INJ_MAX_MISS_STREAK",
    "INJ_MISS_SPELLS",
]
TEAM_FIT_FEATURE = "TM_NET_RTG"
ROSTER_LIFT_FEATURE = "ROSTER_COMPLEMENT"  # proxy until ROSTER_TOP2_VORP lands
CAREER_SLOPE_FEATURE = "CAREER_SLOPE_3Y"  # real 3y mean |Δ|; falls back below
COMPETITION_FEATURE = "SOS_NET_RTG"
BBREF_FEATURES = ["WS48", "BPM"]
HONORS_PRIMARY = "HON_ALL_NBA_VOTE_LAG"

# Phase B rebalanced weights (mtnn_v4_plan.md + Skills Lens)
DEFAULT_LOSS_WEIGHTS: dict[str, float] = {
    "archetype": 0.25,
    "position": 0.15,
    "profile": 0.12,
    "next_profile": 0.08,
    "skills": 0.18,
    "salary": 0.12,
    "team_fit": 0.08,
    "roster_lift": 0.08,
    "form_recon": 0.10,
    "durability": 0.10,
    "career_slope": 0.05,
    "competition": 0.05,
    "pedigree": 0.08,
    "playoff": 0.08,
    "honors": 0.05,
    "bbref": 0.10,
}


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


def load_bundle():
    npz = np.load(DATA_DIR / "train_matrix.npz", allow_pickle=False)
    manifest = json.loads(
        (DATA_DIR / "feature_manifest.json").read_text(encoding="utf-8")
    )
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
    for i, (n, s) in enumerate(zip(names, seasons, strict=False)):
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
    """Same-player adjacent calendar years keyed by stable NBA PLAYER_ID.

    ``names`` is accepted for call-site compatibility but ignored — display
    names collide across distinct careers and break continuity.
    """
    del names  # explicit: do not key careers by display name

    def season_start(s: str) -> int:
        return int(s[:4])

    by_key: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for i, (pid, s) in enumerate(zip(pids, seasons, strict=False)):
        by_key[int(pid)].append((season_start(str(s)), i))
    pairs = []
    for rows in by_key.values():
        rows.sort()
        for (y1, i1), (y2, i2) in itertools.pairwise(rows):
            if y2 - y1 == 1:
                pairs.append((i1, i2))
    return pairs


def next_season_index(n_rows: int, pairs: np.ndarray) -> np.ndarray:
    """Row -> next-season row index (or -1 when unavailable)."""
    nxt = np.full(n_rows, -1, dtype=np.int64)
    for i1, i2 in pairs:
        nxt[int(i1)] = int(i2)
    return nxt


def game_feature_cols(manifest) -> list[int]:
    game = manifest["game_features"]
    return [manifest["features"].index(f) for f in game]


def _join_skill_npz(path, names, seasons) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Join one skill-label npz by (name, season) -> (G, per-skill mask, keys)."""
    npz = np.load(path, allow_pickle=False)
    keys = [str(k) for k in npz["keys"]]
    lookup = {
        (str(n), str(s)): g
        for n, s, g in zip(npz["name"], npz["season"], npz["grades"], strict=False)
    }
    G = np.zeros((len(names), len(keys)), dtype=np.float32)
    M = np.zeros((len(names), len(keys)), dtype=np.float32)
    for i, (n, s) in enumerate(zip(names, seasons, strict=False)):
        g = lookup.get((str(n), str(s)))
        if g is not None:
            G[i] = g
            M[i] = 1.0
    return G, M, keys


def load_skill_labels(names, seasons) -> tuple[np.ndarray, np.ndarray, list[str], int]:
    """Skill-tower targets with a PER-SKILL mask matrix.

    Core skills (build_skills.py) cover every row; optional wide skills
    (build_wide_skills.py) are masked per row where tracking exists.
    Returns (grades[n,K], mask[n,K], keys, n_core).
    """
    core = DATA_DIR / "skill_labels.npz"
    if not core.exists():
        return (
            np.zeros((len(names), 0), np.float32),
            np.zeros((len(names), 0), np.float32),
            [],
            0,
        )
    G, M, keys = _join_skill_npz(core, names, seasons)
    n_core = len(keys)
    wide = DATA_DIR / "wide_skill_labels.npz"
    if wide.exists():
        Gw, Mw, kw = _join_skill_npz(wide, names, seasons)
        G = np.concatenate([G, Gw], axis=1)
        M = np.concatenate([M, Mw], axis=1)
        keys = keys + kw
        print(f"  wide skills joined: {kw} ({int(Mw.any(axis=1).sum())} covered rows)")
    return G, M, keys, n_core


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


class _ResBlock(nn.Module):
    """Same-width residual MLP block (d -> hidden -> d) for stacking depth."""

    def __init__(self, d: int, d_hidden: int):
        super().__init__()
        self.fc1 = nn.Linear(d, d_hidden)
        self.ln1 = nn.LayerNorm(d_hidden)
        self.fc2 = nn.Linear(d_hidden, d)
        self.ln2 = nn.LayerNorm(d)

    def forward(self, y: torch.Tensor) -> torch.Tensor:
        return self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(y)))) + y)


class ResidualTower(nn.Module):
    def __init__(
        self, d_in: int, d_out: int = 24, d_hidden: int = 96, n_blocks: int = 1
    ):
        super().__init__()
        d_cat = d_in * 2
        self.fc1 = nn.Linear(d_cat, d_hidden)
        self.ln1 = nn.LayerNorm(d_hidden)
        self.fc2 = nn.Linear(d_hidden, d_out)
        self.ln2 = nn.LayerNorm(d_out)
        self.skip = nn.Linear(d_cat, d_out) if d_cat != d_out else nn.Identity()
        # v5: optional extra same-width residual blocks for tower depth.
        self.blocks = nn.ModuleList(
            [_ResBlock(d_out, d_hidden) for _ in range(max(0, n_blocks - 1))]
        )

    def forward(self, x: torch.Tensor, m: torch.Tensor) -> torch.Tensor:
        h = torch.cat([x * m, m], dim=-1)
        y = self.ln2(self.fc2(F.gelu(self.ln1(self.fc1(h)))) + self.skip(h))
        for blk in self.blocks:
            y = blk(y)
        return y


class GatedFusion(nn.Module):
    """Attention-weighted tower mix + season context."""

    def __init__(
        self,
        n_towers: int,
        d_tower: int,
        n_seasons: int,
        d_season: int = 12,
        d_emb: int = 48,
        d_hidden: int = 192,
    ):
        super().__init__()
        self.season_emb = nn.Embedding(n_seasons, d_season)
        d_in = d_tower + d_season
        self.gate = nn.Linear(d_tower, 1)
        self.attn = nn.Sequential(
            nn.Linear(d_tower, d_tower),
            nn.Tanh(),
            nn.Linear(d_tower, 1),
        )
        self.fuse = nn.Sequential(
            nn.Linear(d_in, d_hidden),
            nn.GELU(),
            nn.LayerNorm(d_hidden),
            nn.Linear(d_hidden, d_emb),
        )

    def forward(
        self, tower_stack: torch.Tensor, season_ids: torch.Tensor
    ) -> torch.Tensor:
        # tower_stack: [B, T, D]
        scores = self.attn(tower_stack).squeeze(-1)
        weights = torch.softmax(scores, dim=-1)
        gates = torch.sigmoid(self.gate(tower_stack).squeeze(-1))
        mixed = (tower_stack * weights.unsqueeze(-1) * gates.unsqueeze(-1)).sum(1)
        s = self.season_emb(season_ids)
        emb = self.fuse(torch.cat([mixed, s], dim=-1))
        return F.normalize(emb, dim=-1)


class ConcatFusion(nn.Module):
    """Flatten tower stack + season embedding (Brain2Qwerty conv ablation analogue).

    `d_hidden` is the widest layer in the whole net -- at the v4 default of 256
    it is ~57% of all parameters, and until now it had no CLI knob and was never
    swept.
    """

    def __init__(
        self,
        n_towers: int,
        d_tower: int,
        n_seasons: int,
        d_season: int = 12,
        d_emb: int = 48,
        d_hidden: int = 256,
    ):
        super().__init__()
        self.season_emb = nn.Embedding(n_seasons, d_season)
        d_in = n_towers * d_tower + d_season
        self.fuse = nn.Sequential(
            nn.Linear(d_in, d_hidden),
            nn.GELU(),
            nn.LayerNorm(d_hidden),
            nn.Linear(d_hidden, d_emb),
        )

    def forward(
        self, tower_stack: torch.Tensor, season_ids: torch.Tensor
    ) -> torch.Tensor:
        flat = tower_stack.reshape(tower_stack.size(0), -1)
        s = self.season_emb(season_ids)
        return F.normalize(self.fuse(torch.cat([flat, s], dim=-1)), dim=-1)


class TransformerFusion(nn.Module):
    """v5: self-attention across tower tokens so families interact.

    Each tower output is a token; a season token and a learned [CLS] token
    are prepended. A pre-LN Transformer encoder lets towers attend to one
    another (unlike concat, which only mixes them in one linear layer). The
    [CLS] state becomes the embedding.
    """

    def __init__(
        self,
        n_towers: int,
        d_tower: int,
        n_seasons: int,
        d_season: int = 12,
        d_emb: int = 48,
        d_model: int = 96,
        n_layers: int = 4,
        n_heads: int = 4,
        ff: int = 256,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.tower_proj = nn.Linear(d_tower, d_model)
        self.season_emb = nn.Embedding(n_seasons, d_season)
        self.season_proj = nn.Linear(d_season, d_model)
        self.cls = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=ff,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.out = nn.Linear(d_model, d_emb)

    def forward(
        self, tower_stack: torch.Tensor, season_ids: torch.Tensor
    ) -> torch.Tensor:
        b = tower_stack.size(0)
        tok = self.tower_proj(tower_stack)  # [B, T, d_model]
        s = self.season_proj(self.season_emb(season_ids)).unsqueeze(
            1
        )  # [B, 1, d_model]
        cls = self.cls.expand(b, -1, -1)  # [B, 1, d_model]
        x = self.encoder(torch.cat([cls, s, tok], dim=1))
        return F.normalize(self.out(x[:, 0]), dim=-1)


class SkillTowers(nn.Module):
    """Players→skills tower bank: one mini-tower per Skills Lens skill.

    Each tower maps the fused embedding to that skill's grade/100, keeping
    per-skill capacity separate so one skill cannot cannibalize another's
    gradient (unlike a single shared linear head).
    """

    def __init__(self, d_emb: int, n_skills: int, d_hidden: int = 16):
        super().__init__()
        self.towers = nn.ModuleList(
            [
                nn.Sequential(
                    nn.Linear(d_emb, d_hidden), nn.GELU(), nn.Linear(d_hidden, 1)
                )
                for _ in range(n_skills)
            ]
        )

    def forward(self, emb: torch.Tensor) -> torch.Tensor:
        return torch.cat([t(emb) for t in self.towers], dim=-1)


class MTNN(nn.Module):
    def __init__(
        self,
        fam_dims: dict[str, int],
        n_seasons: int,
        d_tower: int = 24,
        d_tower_hidden: int = 96,
        d_emb: int = 48,
        n_game: int = 14,
        n_skills: int = 0,
        d_skill_hidden: int = 16,
        n_form: int = 0,
        n_injury: int = 0,
        n_bbref: int = 0,
        fusion_mode: str = "gated",
        n_tower_blocks: int = 1,
        mlp_heads: bool = False,
        d_head_hidden: int = 64,
        d_model: int = 96,
        n_fusion_layers: int = 4,
        n_attn_heads: int = 4,
        d_fusion_hidden: int | None = None,
    ):
        super().__init__()
        self.families = sorted(fam_dims)
        self.fusion_mode = fusion_mode
        self.towers = nn.ModuleDict(
            {
                fam: ResidualTower(
                    fam_dims[fam],
                    d_out=d_tower,
                    d_hidden=d_tower_hidden,
                    n_blocks=n_tower_blocks,
                )
                for fam in self.families
            }
        )
        # d_fusion_hidden=None keeps each fusion's historical default exactly.
        if fusion_mode == "concat":
            self.fusion = ConcatFusion(
                len(self.families),
                d_tower,
                n_seasons,
                d_emb=d_emb,
                **({} if d_fusion_hidden is None else {"d_hidden": d_fusion_hidden}),
            )
        elif fusion_mode == "transformer":
            self.fusion = TransformerFusion(
                len(self.families),
                d_tower,
                n_seasons,
                d_emb=d_emb,
                d_model=d_model,
                n_layers=n_fusion_layers,
                n_heads=n_attn_heads,
                **({} if d_fusion_hidden is None else {"ff": d_fusion_hidden}),
            )
        else:
            self.fusion = GatedFusion(
                len(self.families),
                d_tower,
                n_seasons,
                d_emb=d_emb,
                **({} if d_fusion_hidden is None else {"d_hidden": d_fusion_hidden}),
            )

        def head(k: int) -> nn.Module:
            if mlp_heads:
                return nn.Sequential(
                    nn.Linear(d_emb, d_head_hidden),
                    nn.GELU(),
                    nn.Linear(d_head_hidden, k),
                )
            return nn.Linear(d_emb, k)

        self.archetype_head = head(N_ARCHETYPES)
        self.position_head = head(len(POSITIONS))
        self.profile_head = head(n_game)
        self.next_profile_head = head(n_game)
        self.salary_head = nn.Linear(d_emb, 1)
        self.team_fit_head = nn.Linear(d_emb, 1)
        self.roster_lift_head = nn.Linear(d_emb, 1)
        self.form_recon_head = nn.Linear(d_emb, n_form) if n_form else None
        self.durability_head = nn.Linear(d_emb, n_injury) if n_injury else None
        self.career_slope_head = nn.Linear(d_emb, 1)
        self.competition_head = nn.Linear(d_emb, 1)
        self.bbref_bridge_head = nn.Linear(d_emb, n_bbref) if n_bbref else None
        self.pedigree_head = nn.Linear(d_emb, 1)
        self.playoff_head = nn.Linear(d_emb, 1)
        self.honors_head = nn.Linear(d_emb, 1)
        self.skill_towers = (
            SkillTowers(d_emb, n_skills, d_hidden=d_skill_hidden) if n_skills else None
        )

    def encode(self, xs, ms, season_ids):
        parts = torch.stack(
            [self.towers[fam](xs[fam], ms[fam]) for fam in self.families], dim=1
        )
        return self.fusion(parts, season_ids)

    def forward(self, xs, ms, season_ids):
        emb = self.encode(xs, ms, season_ids)
        out = {
            "archetype": self.archetype_head(emb),
            "position": self.position_head(emb),
            "profile": self.profile_head(emb),
            "next_profile": self.next_profile_head(emb),
            "salary": self.salary_head(emb).squeeze(-1),
            "team_fit": self.team_fit_head(emb).squeeze(-1),
            "roster_lift": self.roster_lift_head(emb).squeeze(-1),
            "career_slope": self.career_slope_head(emb).squeeze(-1),
            "competition": self.competition_head(emb).squeeze(-1),
            "pedigree": self.pedigree_head(emb).squeeze(-1),
            "playoff": self.playoff_head(emb).squeeze(-1),
            "honors": self.honors_head(emb).squeeze(-1),
        }
        if self.form_recon_head is not None:
            out["form_recon"] = self.form_recon_head(emb)
        if self.durability_head is not None:
            out["durability"] = self.durability_head(emb)
        if self.bbref_bridge_head is not None:
            out["bbref"] = self.bbref_bridge_head(emb)
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


def feature_cols(manifest: dict, names: list[str]) -> list[int] | None:
    feats = manifest["features"]
    cols = [feats.index(n) for n in names if n in feats]
    return cols if len(cols) == len(names) else None


def tensor_col(Z: np.ndarray, M: np.ndarray, j: int, device: str) -> tuple:
    return (
        torch.tensor(Z[:, j], device=device),
        torch.tensor(M[:, j], device=device),
    )


def tensor_cols(Z: np.ndarray, M: np.ndarray, cols: list[int], device: str) -> tuple:
    z = torch.tensor(Z[:, cols], device=device)
    m = torch.tensor(M[:, cols], device=device)
    row_m = (m.sum(dim=-1) > 0).float()
    return z, m, row_m


def masked_scalar_mse(pred, target, row_mask) -> torch.Tensor:
    w = row_mask
    if w.sum() <= 0:
        return pred.sum() * 0.0
    return (w * (pred - target) ** 2).sum() / w.sum()


def masked_vector_mse(pred, target, feat_mask, row_mask) -> torch.Tensor:
    w = row_mask.unsqueeze(-1) * feat_mask
    if w.sum() <= 0:
        return pred.sum() * 0.0
    return (w * (pred - target) ** 2).sum() / w.sum()


def info_nce(
    za,
    zb,
    temp: float = 0.08,
    pos_a: torch.Tensor | None = None,
    pos_b: torch.Tensor | None = None,
    hard_neg_boost: float = 0.0,
):
    """Symmetric InfoNCE with optional same-position hard-negative boost."""
    logits = za @ zb.T / temp
    if hard_neg_boost > 0 and pos_a is not None and pos_b is not None:
        b = logits.shape[0]
        idx = torch.arange(b, device=logits.device)
        hard = (pos_a.unsqueeze(1) == pos_b.unsqueeze(0)) & (
            idx.unsqueeze(0) != idx.unsqueeze(1)
        )
        logits = logits + hard.float() * hard_neg_boost
    target = torch.arange(len(za), device=za.device)
    return 0.5 * (F.cross_entropy(logits, target) + F.cross_entropy(logits.T, target))


def supcon_archetype(
    za,
    zb,
    *,
    labels: torch.Tensor,
    temp: float,
) -> torch.Tensor:
    """Archetype-supervised multi-positive contrastive (all same-cluster in-batch)."""
    logits = za @ zb.T / temp
    pos = labels.unsqueeze(0) == labels.unsqueeze(1)
    eye = torch.eye(len(za), device=za.device, dtype=torch.bool)
    pos = pos & ~eye
    log_denom = torch.logsumexp(logits, dim=1)
    pos_logits = logits.masked_fill(~pos, -1e4)
    log_num = torch.logsumexp(pos_logits, dim=1)
    has_pos = pos.any(dim=1)
    if not bool(has_pos.any()):
        return za.sum() * 0.0
    loss = -(log_num - log_denom)
    return loss[has_pos].mean()


def contrastive_loss(
    za,
    zb,
    *,
    mode: str,
    temp: float,
    pos_a: torch.Tensor | None = None,
    pos_b: torch.Tensor | None = None,
    hard_neg_boost: float = 0.0,
    arch_labels: torch.Tensor | None = None,
    player_weight: float = 0.75,
    arch_weight: float = 0.25,
) -> torch.Tensor:
    """InfoNCE (player continuity), supcon-arch, or weighted hybrid."""
    if mode == "infonce":
        return info_nce(
            za,
            zb,
            temp=temp,
            pos_a=pos_a,
            pos_b=pos_b,
            hard_neg_boost=hard_neg_boost,
        )
    if mode == "supcon-arch":
        if arch_labels is None:
            return info_nce(
                za,
                zb,
                temp=temp,
                pos_a=pos_a,
                pos_b=pos_b,
                hard_neg_boost=hard_neg_boost,
            )
        return supcon_archetype(za, zb, labels=arch_labels, temp=temp)
    if mode == "hybrid":
        l_player = info_nce(
            za,
            zb,
            temp=temp,
            pos_a=pos_a,
            pos_b=pos_b,
            hard_neg_boost=hard_neg_boost,
        )
        if arch_labels is None or arch_weight <= 0:
            return l_player
        l_arch = supcon_archetype(za, zb, labels=arch_labels, temp=temp)
        pw, aw = player_weight, arch_weight
        norm = pw + aw
        return (pw * l_player + aw * l_arch) / norm
    raise ValueError(f"unknown contrastive loss: {mode}")


RECALL_RANK_FLOOR = 0.85


def promotion_composite(test_recall: float | None, purity: float | None) -> float:
    """Mid-epoch checkpoint proxy — delegates to composite_score.partial_cqs."""
    return cqs.partial_cqs(test_recall, purity)


def model_tag(args) -> str:
    """Name the net that was actually trained.

    The tag was hardcoded to "mtnn_v4_phase_b", so a promoted v5 recipe
    (stacked tower blocks / MLP decode heads / transformer fusion) shipped
    describing itself as v4 in mtnn_report.json and, downstream, in the public
    manifest.json. A label is a claim; derive it from the knobs.
    """
    v5 = (
        getattr(args, "tower_blocks", 1) > 1
        or getattr(args, "mlp_heads", False)
        or args.fusion == "transformer"
        or getattr(args, "fusion_hidden", 0)
    )
    if not v5:
        return "mtnn_v4_phase_b"
    bits = [
        f"b{args.tower_blocks}",
        f"h{args.tower_hidden}",
        f"t{args.tower_width}",
        f"d{args.dim}",
    ]
    if args.mlp_heads:
        bits.append(f"mlp{args.d_head_hidden}")
    if getattr(args, "fusion_hidden", 0):
        bits.append(f"fus{args.fusion_hidden}")
    return f"mtnn_v5_{args.fusion}_" + "_".join(bits)


def adamw_param_groups(model: nn.Module, weight_decay: float) -> list[dict]:
    """AdamW with no decay on biases and LayerNorm (LLM/embed convention)."""
    decay, no_decay = [], []
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        if param.ndim == 1 or name.endswith(".bias"):
            no_decay.append(param)
        else:
            decay.append(param)
    return [
        {"params": decay, "weight_decay": weight_decay},
        {"params": no_decay, "weight_decay": 0.0},
    ]


def optimizer_steps_per_epoch(n_rows: int, batch: int, grad_accum: int) -> int:
    batches = max(1, (n_rows + batch - 1) // batch)
    return max(1, batches // grad_accum)


def build_lr_scheduler(
    opt: torch.optim.Optimizer,
    *,
    schedule: str,
    total_steps: int,
    epochs: int,
    warmup_pct: float,
    max_lr: float,
    anneal_strategy: str,
) -> tuple[torch.optim.lr_scheduler.LRScheduler, str]:
    """Return (scheduler, step_mode) where step_mode is 'step' or 'epoch'."""
    if schedule == "legacy-epoch-cosine":
        return torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs), "epoch"

    warmup_steps = max(1, int(warmup_pct * total_steps))
    if schedule == "onecycle":
        return (
            torch.optim.lr_scheduler.OneCycleLR(
                opt,
                max_lr=max_lr,
                total_steps=total_steps,
                pct_start=warmup_pct,
                anneal_strategy=anneal_strategy,
                div_factor=25.0,
                final_div_factor=1e4,
            ),
            "step",
        )
    if schedule == "warmup-cosine":
        main_steps = max(1, total_steps - warmup_steps)
        sched = torch.optim.lr_scheduler.SequentialLR(
            opt,
            schedulers=[
                torch.optim.lr_scheduler.LinearLR(
                    opt, start_factor=0.01, total_iters=warmup_steps
                ),
                torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=main_steps),
            ],
            milestones=[warmup_steps],
        )
        return sched, "step"
    raise ValueError(f"unknown lr schedule: {schedule}")


@torch.no_grad()
def embed_all(model: MTNN, xs, ms, seas_t) -> np.ndarray:
    model.eval()
    emb = model.encode(xs, ms, seas_t)
    return emb.cpu().numpy().astype(np.float32)


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
    pairs: np.ndarray,
    seasons: np.ndarray,
    split: str,
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


def classification_acc(
    logits: np.ndarray, labels: np.ndarray, valid_mask: np.ndarray | None = None
) -> float | None:
    if valid_mask is None:
        valid_mask = np.ones(len(labels), dtype=bool)
    idx = np.where(valid_mask)[0]
    if len(idx) == 0:
        return None
    pred = logits[idx].argmax(1)
    return float((pred == labels[idx]).mean())


def cross_era_archetype_purity(
    E: np.ndarray,
    clusters: np.ndarray,
    seasons: np.ndarray,
    k: int = 20,
    n_sample: int = 400,
) -> float | None:
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


def skill_holdout_metrics(
    pred: np.ndarray,
    target: np.ndarray,
    mask: np.ndarray,
    seasons: np.ndarray,
    keys: list[str],
) -> dict:
    """Per-skill R2 + MAE (grade points, 0-100) on held-out season splits.

    `mask` is the per-skill [n, K] coverage matrix — each skill scores only
    over rows where that skill is present (wide skills are 2015-16+).
    """
    out: dict = {}
    split_of = np.array([eval_split(str(s)) for s in seasons])
    for split in ("val", "test"):
        in_split = split_of == split
        per = {}
        for j, key in enumerate(keys):
            rows = np.where((mask[:, j] > 0) & in_split)[0]
            if len(rows) < 5:
                per[key] = {"r2": None, "mae_pts": None, "rows": len(rows)}
                continue
            resid = target[rows, j] - pred[rows, j]
            ss_tot = float(((target[rows, j] - target[rows, j].mean()) ** 2).sum())
            per[key] = {
                "r2": round(1.0 - float((resid**2).sum()) / max(ss_tot, 1e-9), 4),
                "mae_pts": round(float(np.abs(resid).mean()) * 100.0, 2),
                "rows": len(rows),
            }
        scored = [v["r2"] for v in per.values() if v["r2"] is not None]
        out[split] = {
            "mean_r2": round(float(np.mean(scored)), 4) if scored else None,
            "per_skill": per,
        }
    return out


def skill_neighbor_consistency(
    E: np.ndarray,
    grades: np.ndarray,
    valid: np.ndarray,
    k: int = 10,
    n_sample: int = 400,
) -> float | None:
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


def next_profile_holdout_metrics(
    pred: np.ndarray,
    target: np.ndarray,
    next_idx: np.ndarray,
    seasons: np.ndarray,
    feature_names: list[str],
) -> dict:
    """Held-out next-season stats quality on z-scored game features."""
    out: dict = {}
    target_split = np.full(len(next_idx), "", dtype=object)
    valid = next_idx >= 0
    if valid.any():
        target_split[valid] = np.array(
            [eval_split(str(s)) for s in seasons[next_idx[valid]]]
        )
    for split in ("val", "test"):
        rows = np.where(valid & (target_split == split))[0]
        if len(rows) == 0:
            out[split] = None
            continue
        y = target[next_idx[rows]]
        p = pred[rows]
        resid = y - p
        mse = float((resid**2).mean())
        rmse = float(np.sqrt(mse))
        mae = float(np.abs(resid).mean())
        ss_tot = float(((y - y.mean(axis=0, keepdims=True)) ** 2).sum())
        r2 = 1.0 - float((resid**2).sum()) / max(ss_tot, 1e-9)
        per_mae = np.abs(resid).mean(axis=0)
        top = np.argsort(-per_mae)[:5]
        out[split] = {
            "rows": len(rows),
            "mae_z": round(mae, 4),
            "rmse_z": round(rmse, 4),
            "r2": round(r2, 4),
            "worst_features_mae_z": [
                {"feature": feature_names[j], "mae_z": round(float(per_mae[j]), 4)}
                for j in top
            ],
        }
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


_TRAIN_RUN_ID = None


def emit_training_snapshot(args, weights, fams, history, val_trace, status) -> None:
    """Live per-epoch telemetry for the /model training cockpit.

    Writes assets/mtnn_training/live.json each val_every epoch (status
    'training', or 'done' on the final epoch). Wrapped so telemetry can never
    break a training run.
    """
    global _TRAIN_RUN_ID
    try:
        excl = {s.strip() for s in args.exclude_families.split(",") if s.strip()}
        out_dir = ROOT / "assets" / "mtnn_training"
        out_dir.mkdir(parents=True, exist_ok=True)
        if _TRAIN_RUN_ID is None:
            _TRAIN_RUN_ID = time.strftime("%Y%m%d-%H%M%S")
        doc = {
            "run_id": _TRAIN_RUN_ID,
            "status": status,
            "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "arch": {
                "dim": args.dim,
                "tower_width": args.tower_width,
                "tower_hidden": args.tower_hidden,
                "tower_blocks": args.tower_blocks,
                "fusion": args.fusion,
                "n_towers": len(fams),
                "families": sorted(fams),
                "epochs_target": args.epochs,
                "durability_w": (
                    weights.get("durability") if "injury" not in excl else None
                ),
            },
            "loss": [round(float(x), 4) for x in history],
            "val": [
                {
                    "epoch": r.get("epoch"),
                    "val_recall_at_10": r.get("val_recall_at_10"),
                    "test_recall_at_10": r.get("test_recall_at_10"),
                    "purity_at_20": r.get("val_purity_at_20"),
                    "cqs": r.get("val_composite"),
                }
                for r in val_trace
            ],
        }
        (out_dir / "live.json").write_text(
            json.dumps(doc, separators=(",", ":")), encoding="utf-8"
        )
    except Exception:
        pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--dim", type=int, default=48)
    ap.add_argument(
        "--tower-width",
        type=int,
        default=24,
        help="per-family tower output width before fusion",
    )
    ap.add_argument(
        "--tower-hidden", type=int, default=96, help="per-family tower hidden width"
    )
    ap.add_argument(
        "--skill-hidden", type=int, default=16, help="per-skill mini-tower hidden width"
    )
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=1.5e-3)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--nce-temp", type=float, default=0.08)
    ap.add_argument("--drop-p", type=float, default=0.12)
    ap.add_argument(
        "--hard-neg-boost",
        type=float,
        default=0.3,
        help="same-position in-batch negative boost (0=off)",
    )
    ap.add_argument(
        "--lr-schedule",
        choices=("legacy-epoch-cosine", "onecycle", "warmup-cosine"),
        default="legacy-epoch-cosine",
        help="onecycle mirrors Brain2Qwerty (arXiv:2502.17480); warmup-cosine is embed SOTA",
    )
    ap.add_argument(
        "--warmup-pct",
        type=float,
        default=0.1,
        help="warmup fraction of optimizer steps (Brain2Qwerty uses 0.1)",
    )
    ap.add_argument(
        "--anneal-strategy",
        choices=("cos", "linear"),
        default="linear",
        help="OneCycleLR anneal; paper uses linear decay after warmup",
    )
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument(
        "--grad-accum",
        type=int,
        default=1,
        help="gradient accumulation steps (effective batch = batch * accum)",
    )
    ap.add_argument(
        "--fusion",
        choices=("gated", "concat", "transformer"),
        default="gated",
        help="tower fusion: gated attention (default), concat MLP, or v5 transformer",
    )
    ap.add_argument(
        "--tower-blocks",
        type=int,
        default=1,
        help="v5: residual blocks per family tower (depth)",
    )
    ap.add_argument(
        "--mlp-heads",
        action="store_true",
        help="v5: 2-layer MLP decode heads instead of linear",
    )
    ap.add_argument(
        "--d-head-hidden",
        type=int,
        default=64,
        help="v5: hidden width for MLP decode heads",
    )
    ap.add_argument(
        "--d-model", type=int, default=96, help="v5: transformer fusion token width"
    )
    ap.add_argument(
        "--n-fusion-layers", type=int, default=4, help="v5: transformer encoder layers"
    )
    ap.add_argument(
        "--n-attn-heads", type=int, default=4, help="v5: transformer attention heads"
    )
    ap.add_argument(
        "--fusion-hidden",
        type=int,
        default=0,
        help="fusion hidden width (0 = per-fusion default: concat 256, "
        "gated 192, transformer ff 256). At the default this layer "
        "is ~57%% of all params and was previously unswept.",
    )
    ap.add_argument(
        "--nce-loss",
        choices=("infonce", "supcon-arch", "hybrid"),
        default="infonce",
        help="contrastive: player InfoNCE, archetype SupCon, or hybrid",
    )
    ap.add_argument(
        "--nce-player-weight",
        type=float,
        default=0.75,
        help="hybrid: weight on adjacent-season player InfoNCE",
    )
    ap.add_argument(
        "--nce-arch-weight",
        type=float,
        default=0.25,
        help="hybrid: weight on archetype SupCon (purity pressure)",
    )
    ap.add_argument(
        "--checkpoint-metric",
        choices=("recall", "composite", "purity", "cqs"),
        default="cqs",
        help="save best checkpoint by val recall, purity@20, composite/cqs proxy",
    )
    ap.add_argument(
        "--val-every",
        type=int,
        default=10,
        help="log held-out val recall every N epochs; 0=off",
    )
    ap.add_argument(
        "--no-best-checkpoint",
        action="store_true",
        help="skip saving/restoring best-val checkpoint",
    )
    ap.add_argument(
        "--mask-families",
        type=str,
        default="",
        help="comma-separated families to zero out (values + mask) while "
        "keeping their towers, so ablation arms share one architecture",
    )
    ap.add_argument(
        "--exclude-families",
        type=str,
        default="",
        help="comma-separated tower families to drop (ablation)",
    )
    ap.add_argument(
        "--phase",
        choices=("select", "final-refit", "auto"),
        default="select",
        help="select=honest held-out metrics (train-split rows only for loss); "
        "final-refit=fit all rows then ship; "
        "auto=select then full-corpus refit if promote ok",
    )
    ap.add_argument(
        "--fit-rows",
        choices=("train", "all"),
        default=None,
        help="override which rows enter the loss (default: train for "
        "select/auto-selection, all for final-refit)",
    )
    ap.add_argument(
        "--era-align",
        choices=("none", "procrustes"),
        default="none",
        help="v6: rotate the 14 game-feature dims into the 1996-97 root "
        "frame via assets/drift.json chainedToRoot before training",
    )
    ap.add_argument(
        "--robust-scaling",
        action="store_true",
        help="v6: replace the season z-scores with per-season median/IQR "
        "scaling (RealMLP-style, clip [-3,3]) before training",
    )
    for key in DEFAULT_LOSS_WEIGHTS:
        ap.add_argument(
            f"--w-{key.replace('_', '-')}", type=float, default=None, dest=f"w_{key}"
        )
    args = ap.parse_args()

    weights = dict(DEFAULT_LOSS_WEIGHTS)
    for key in DEFAULT_LOSS_WEIGHTS:
        val = getattr(args, f"w_{key}")
        if val is not None:
            weights[key] = val

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    (Z, M, names, seasons, pids, clusters, positions, season_ids, manifest) = (
        load_bundle()
    )

    if args.era_align == "procrustes":
        from era_procrustes_align import align_batch, load_alignment

        chains = load_alignment()["chains"]
        Z = align_batch(Z, [str(s) for s in seasons], chains)
        print(
            f"era-align procrustes: rotated {len(Z)} rows into 1996-97 root frame "
            f"({len(chains)} season chains)"
        )

    if args.robust_scaling:
        from realmlp_preproc import RealMLPPreprocessor

        preproc = RealMLPPreprocessor(manifest["features"])
        preproc.fit(Z, [str(s) for s in seasons], M, by_season=True)
        Z = preproc.transform(Z, [str(s) for s in seasons])
        print("robust-scaling: replaced season z-scores with median/IQR clip[-3,3]")

    fams = family_slices(manifest)
    mask_fams = {s.strip() for s in args.mask_families.split(",") if s.strip()}
    if mask_fams:
        # Ablate by zeroing a family's values AND its mask bits while keeping the
        # tower. --exclude-families deletes the tower, which also re-shapes the
        # fusion input (17x32 -> 16x32), so every arm becomes a different
        # architecture and the delta confounds "family carries signal" with
        # "fusion was re-sized". Masking holds the architecture fixed.
        all_slices = family_slices(manifest)
        zeroed = 0
        for fam in sorted(mask_fams):
            for c in all_slices.get(fam) or []:
                Z[:, c] = 0.0
                M[:, c] = 0.0
                zeroed += 1
        print(
            f"masked families: {sorted(mask_fams)} -> {zeroed} columns zeroed, "
            f"towers kept (fusion width unchanged)"
        )
    exclude = {s.strip() for s in args.exclude_families.split(",") if s.strip()}
    # Injury never feeds an input tower — the A/B proved it regresses retrieval.
    # It survives only as the durability head's target (predicted FROM the
    # embedding), so drop it from the tower set unconditionally.
    fams = {k: v for k, v in fams.items() if k not in exclude and k != "injury"}
    if exclude:
        print(f"excluded families: {sorted(exclude)} -> {len(fams)} towers")
    game_cols = game_feature_cols(manifest)
    game_z = torch.tensor(Z[:, game_cols], device=device)
    n_seasons = int(season_ids.max()) + 1

    print(
        f"{len(Z)} rows, {Z.shape[1]} features, {len(fams)} towers, "
        f"{n_seasons} seasons, device={device}"
    )
    print(f"tower widths: { {k: len(v) for k, v in fams.items()} }")
    print(f"loss weights: {weights}")

    pairs = adjacent_season_pairs(pids, seasons, names)
    print(f"{len(pairs)} same-player adjacent-season pairs")

    feats = manifest["features"]

    def col_idx(name: str) -> int | None:
        return feats.index(name) if name in feats else None

    sal_j = col_idx("SALARY_LOG")
    sal_z, sal_m = (
        tensor_col(Z, M, sal_j, device) if sal_j is not None else (None, None)
    )

    ped_j = col_idx("PED_PICK_QUALITY")
    ped_z, ped_m = (
        tensor_col(Z, M, ped_j, device) if ped_j is not None else (None, None)
    )
    if ped_j is not None:
        print(f"pedigree_expectation head: {int(M[:, ped_j].sum())} labeled rows")

    po_j = col_idx("PO_PTS_DELTA")
    po_z, po_m = tensor_col(Z, M, po_j, device) if po_j is not None else (None, None)
    if po_j is not None:
        print(f"playoff_riser head: {int(M[:, po_j].sum())} labeled rows")

    hon_j = col_idx(HONORS_PRIMARY)
    hon_z, hon_m = (
        tensor_col(Z, M, hon_j, device) if hon_j is not None else (None, None)
    )
    if hon_j is not None:
        print(
            f"honors_recognition head ({HONORS_PRIMARY}): "
            f"{int(M[:, hon_j].sum())} labeled rows"
        )

    team_j = col_idx(TEAM_FIT_FEATURE)
    team_z, team_m = (
        tensor_col(Z, M, team_j, device) if team_j is not None else (None, None)
    )
    if team_j is not None:
        print(f"team_fit head: {int(M[:, team_j].sum())} labeled rows")

    roster_j = col_idx(ROSTER_LIFT_FEATURE)
    roster_z, roster_m = (
        tensor_col(Z, M, roster_j, device) if roster_j is not None else (None, None)
    )
    if roster_j is not None:
        print(
            f"roster_lift head ({ROSTER_LIFT_FEATURE}): "
            f"{int(M[:, roster_j].sum())} labeled rows"
        )

    career_j = col_idx(CAREER_SLOPE_FEATURE)
    # Existence is not enough: integrate_context materializes a column for every
    # declared feature, so a feature with no source lands as an all-masked
    # column. Testing `is None` let that pass and the head silently trained
    # against zero labels. Fall back when the column carries no observations.
    if career_j is None or float(M[:, career_j].sum()) == 0.0:
        career_j = col_idx("DELTA_NORM")  # legacy matrices pre-enrichment
    career_z, career_m = (
        tensor_col(Z, M, career_j, device) if career_j is not None else (None, None)
    )
    if career_j is not None:
        print(
            f"career_slope head ({manifest['features'][career_j]}): "
            f"{int(M[:, career_j].sum())} labeled rows"
        )

    comp_j = col_idx(COMPETITION_FEATURE)
    comp_z, comp_m = (
        tensor_col(Z, M, comp_j, device) if comp_j is not None else (None, None)
    )

    form_cols = feature_cols(manifest, FORM_FEATURES)
    form_z, form_m, form_row_m = (
        tensor_cols(Z, M, form_cols, device) if form_cols else (None, None, None)
    )
    if form_cols:
        print(f"form_recon head: {int(form_row_m.sum())} labeled rows")

    injury_cols = feature_cols(manifest, INJURY_FEATURES)
    injury_active = bool(injury_cols) and "injury" not in exclude
    injury_z, injury_m, injury_row_m = (
        tensor_cols(Z, M, injury_cols, device) if injury_active else (None, None, None)
    )
    if injury_active:
        print(f"durability head: {int(injury_row_m.sum())} labeled rows")

    bbref_cols = feature_cols(manifest, BBREF_FEATURES)
    bbref_z, bbref_m, bbref_row_m = (
        tensor_cols(Z, M, bbref_cols, device) if bbref_cols else (None, None, None)
    )
    if bbref_cols:
        print(f"bbref_bridge head: {int(bbref_row_m.sum())} labeled rows")

    arch_t = torch.tensor(clusters, device=device)
    pos_t = torch.tensor(positions, device=device)
    pos_mask = pos_t >= 0
    seas_t = torch.tensor(season_ids, device=device)

    skill_g, skill_m, skill_keys, n_core = load_skill_labels(names, seasons)
    skill_t = torch.tensor(skill_g, device=device)
    skillm_t = torch.tensor(skill_m, device=device)
    skill_row_mask = skill_m.any(axis=1) if skill_m.ndim == 2 else skill_m > 0
    print(
        f"{len(skill_keys)} skill towers ({n_core} core + "
        f"{len(skill_keys) - n_core} wide), per-skill masked"
    )

    n = len(Z)
    split_of = np.array([eval_split(str(s)) for s in seasons])
    if args.fit_rows is not None:
        fit_rows_mode = args.fit_rows
    elif args.phase in ("select", "auto"):
        fit_rows_mode = "train"
    else:
        fit_rows_mode = "all"
    fit_mask = (
        (split_of == "train") if fit_rows_mode == "train" else np.ones(n, dtype=bool)
    )
    fit_idx = np.where(fit_mask)[0]
    print(f"phase={args.phase} fit_rows={fit_rows_mode} n_fit={len(fit_idx)}/{n}")

    xs, ms = split_by_family(Z, M, fams, device)
    model = MTNN(
        {f: len(c) for f, c in fams.items()},
        n_seasons,
        d_tower=args.tower_width,
        d_tower_hidden=args.tower_hidden,
        d_emb=args.dim,
        n_game=len(game_cols),
        n_skills=len(skill_keys),
        d_skill_hidden=args.skill_hidden,
        n_form=len(form_cols) if form_cols else 0,
        n_injury=len(injury_cols) if injury_active else 0,
        n_bbref=len(bbref_cols) if bbref_cols else 0,
        fusion_mode=args.fusion,
        n_tower_blocks=args.tower_blocks,
        mlp_heads=args.mlp_heads,
        d_head_hidden=args.d_head_hidden,
        d_model=args.d_model,
        n_fusion_layers=args.n_fusion_layers,
        n_attn_heads=args.n_attn_heads,
        d_fusion_hidden=(args.fusion_hidden or None),
    ).to(device)
    opt = torch.optim.AdamW(adamw_param_groups(model, args.weight_decay), lr=args.lr)
    steps_per_epoch = optimizer_steps_per_epoch(n, args.batch, args.grad_accum)
    total_steps = max(1, steps_per_epoch * args.epochs)
    sched, sched_mode = build_lr_scheduler(
        opt,
        schedule=args.lr_schedule,
        total_steps=total_steps,
        epochs=args.epochs,
        warmup_pct=args.warmup_pct,
        max_lr=args.lr,
        anneal_strategy=args.anneal_strategy,
    )
    print(
        f"lr schedule: {args.lr_schedule} ({sched_mode}-level), "
        f"steps/epoch={steps_per_epoch}, total_steps={total_steps}, "
        f"fusion={args.fusion}, nce_loss={args.nce_loss}, "
        f"tower={args.tower_width}/{args.tower_hidden}, "
        f"skill_hidden={args.skill_hidden}"
    )

    pair_arr = np.array(pairs) if pairs else np.zeros((0, 2), int)
    val_pairs = filter_pairs_by_split(pair_arr, seasons, "val")
    next_idx_arr = next_season_index(n, pair_arr)
    next_row_count = int((next_idx_arr >= 0).sum())
    print(f"next-season stats labels: {next_row_count}/{n} rows")
    lookup: dict[int, int] = {}
    if len(pair_arr):
        lookup = {int(a): int(b) for a, b in pair_arr}
        lookup.update({int(b): int(a) for a, b in pair_arr})

    best_val_recall: float | None = None
    best_val_purity: float | None = None
    best_val_composite: float | None = None
    best_epoch = -1
    history: list[float] = []
    val_trace: list[dict] = []

    for epoch in range(args.epochs):
        model.train()
        perm = np.random.permutation(fit_idx)
        total, steps = 0.0, 0
        accum = 0
        opt.zero_grad(set_to_none=True)
        for s in range(0, n, args.batch):
            idx = perm[s : s + args.batch]
            if len(idx) < 8:
                continue
            idx_t = torch.tensor(idx, device=device)
            partner = np.array([lookup.get(int(i), int(i)) for i in idx])
            partner_t = torch.tensor(partner, device=device)

            xa, ma = batch_views(xs, ms, idx_t, drop_p=args.drop_p)
            xb, mb = batch_views(xs, ms, partner_t, drop_p=args.drop_p)
            za, out_a = model(xa, ma, seas_t[idx_t])
            zb, _ = model(xb, mb, seas_t[partner_t])

            pos_batch = pos_t[idx_t]
            pos_partner = pos_t[partner_t]
            loss = contrastive_loss(
                za,
                zb,
                mode=args.nce_loss,
                temp=args.nce_temp,
                pos_a=pos_batch,
                pos_b=pos_partner,
                hard_neg_boost=args.hard_neg_boost,
                arch_labels=arch_t[idx_t],
                player_weight=args.nce_player_weight,
                arch_weight=args.nce_arch_weight,
            )
            loss = loss + weights["archetype"] * F.cross_entropy(
                out_a["archetype"], arch_t[idx_t]
            )
            if pos_mask[idx_t].any():
                loss = loss + weights["position"] * F.cross_entropy(
                    out_a["position"][pos_mask[idx_t]], pos_t[idx_t][pos_mask[idx_t]]
                )
            loss = loss + weights["profile"] * F.mse_loss(
                out_a["profile"], game_z[idx_t]
            )
            next_batch = next_idx_arr[idx]
            next_valid = next_batch >= 0
            if next_valid.any():
                next_t = torch.tensor(next_batch[next_valid], device=device)
                next_valid_t = torch.tensor(next_valid, device=device, dtype=torch.bool)
                pred_next = out_a["next_profile"][next_valid_t]
                # Target is next-season z-scored game profile (same 14-d contract).
                loss = loss + weights["next_profile"] * F.smooth_l1_loss(
                    pred_next, game_z[next_t]
                )
            if "skills" in out_a:
                wm = skillm_t[idx_t]
                if wm.sum() > 0:
                    se = (out_a["skills"] - skill_t[idx_t]) ** 2
                    loss = loss + weights["skills"] * (wm * se).sum() / wm.sum()
            if sal_z is not None and sal_m is not None:
                loss = loss + weights["salary"] * masked_scalar_mse(
                    out_a["salary"], sal_z[idx_t], sal_m[idx_t]
                )
            if team_z is not None and team_m is not None:
                loss = loss + weights["team_fit"] * masked_scalar_mse(
                    out_a["team_fit"], team_z[idx_t], team_m[idx_t]
                )
            if roster_z is not None and roster_m is not None:
                loss = loss + weights["roster_lift"] * masked_scalar_mse(
                    out_a["roster_lift"], roster_z[idx_t], roster_m[idx_t]
                )
            if form_z is not None and form_m is not None:
                loss = loss + weights["form_recon"] * masked_vector_mse(
                    out_a["form_recon"], form_z[idx_t], form_m[idx_t], form_row_m[idx_t]
                )
            if injury_z is not None and injury_m is not None and "durability" in out_a:
                loss = loss + weights["durability"] * masked_vector_mse(
                    out_a["durability"],
                    injury_z[idx_t],
                    injury_m[idx_t],
                    injury_row_m[idx_t],
                )
            if career_z is not None and career_m is not None:
                loss = loss + weights["career_slope"] * masked_scalar_mse(
                    out_a["career_slope"], career_z[idx_t], career_m[idx_t]
                )
            if comp_z is not None and comp_m is not None:
                loss = loss + weights["competition"] * masked_scalar_mse(
                    out_a["competition"], comp_z[idx_t], comp_m[idx_t]
                )
            if bbref_z is not None and bbref_m is not None and "bbref" in out_a:
                loss = loss + weights["bbref"] * masked_vector_mse(
                    out_a["bbref"], bbref_z[idx_t], bbref_m[idx_t], bbref_row_m[idx_t]
                )
            if ped_z is not None and ped_m is not None:
                loss = loss + weights["pedigree"] * masked_scalar_mse(
                    out_a["pedigree"], ped_z[idx_t], ped_m[idx_t]
                )
            if po_z is not None and po_m is not None:
                loss = loss + weights["playoff"] * masked_scalar_mse(
                    out_a["playoff"], po_z[idx_t], po_m[idx_t]
                )
            if hon_z is not None and hon_m is not None:
                loss = loss + weights["honors"] * masked_scalar_mse(
                    out_a["honors"], hon_z[idx_t], hon_m[idx_t]
                )

            scaled = loss / args.grad_accum
            scaled.backward()
            accum += 1
            total += float(loss)
            if accum < args.grad_accum:
                continue
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            if sched_mode == "step":
                sched.step()
            opt.zero_grad(set_to_none=True)
            accum = 0
            steps += 1
        if accum > 0:
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            if sched_mode == "step":
                sched.step()
            opt.zero_grad(set_to_none=True)
            steps += 1
        if sched_mode == "epoch":
            sched.step()
        avg = total / max(1, steps)
        history.append(avg)

        log_line = f"epoch {epoch:3d}  loss {avg:.4f}  lr {sched.get_last_lr()[0]:.2e}"
        if args.val_every > 0 and (
            epoch % args.val_every == 0 or epoch == args.epochs - 1
        ):
            E_val = embed_all(model, xs, ms, seas_t)
            val_r = recall_at_k(E_val, val_pairs, k=10)
            test_pairs = filter_pairs_by_split(pair_arr, seasons, "test")
            test_r = recall_at_k(E_val, test_pairs, k=10)
            val_pu = cross_era_archetype_purity(E_val, clusters, seasons)
            val_comp = promotion_composite(val_r, val_pu)
            pu_s = f" purity@20={val_pu:.3f}" if val_pu is not None else ""
            log_line += (
                f"  val_recall@10={val_r:.3f} test_recall@10={test_r:.3f}"
                f"{pu_s} composite={val_comp:.3f}"
            )
            trace_row = {
                "epoch": epoch,
                "val_recall_at_10": val_r,
                "test_recall_at_10": test_r,
                "val_purity_at_20": val_pu,
                "val_composite": val_comp,
            }
            val_trace.append(trace_row)
            emit_training_snapshot(
                args,
                weights,
                fams,
                history,
                val_trace,
                "done" if epoch == args.epochs - 1 else "training",
            )
            if not args.no_best_checkpoint:
                metric_val = None
                if args.checkpoint_metric == "recall":
                    metric_val = val_r
                    is_better = metric_val is not None and (
                        best_val_recall is None or metric_val > best_val_recall
                    )
                elif args.checkpoint_metric == "purity":
                    metric_val = val_pu
                    is_better = metric_val is not None and (
                        best_val_purity is None or metric_val > best_val_purity
                    )
                else:
                    metric_val = val_comp
                    is_better = metric_val is not None and (
                        best_val_composite is None or metric_val > best_val_composite
                    )
                if is_better:
                    best_val_recall = val_r
                    best_val_purity = val_pu
                    best_val_composite = val_comp
                    best_epoch = epoch
                    torch.save(
                        {
                            "epoch": epoch,
                            "model": model.state_dict(),
                            "val_recall_at_10": val_r,
                            "val_purity_at_20": val_pu,
                            "val_composite": val_comp,
                            "checkpoint_metric": args.checkpoint_metric,
                            "args": vars(args),
                            "weights": weights,
                        },
                        BEST_CKPT,
                    )
        if epoch % 5 == 0 or epoch == args.epochs - 1:
            print(log_line)

    if not args.no_best_checkpoint and BEST_CKPT.exists() and best_epoch >= 0:
        ckpt = torch.load(BEST_CKPT, map_location=device, weights_only=False)
        model.load_state_dict(ckpt["model"])
        pu_s = f"{best_val_purity:.3f}" if best_val_purity is not None else "n/a"
        co_s = f"{best_val_composite:.3f}" if best_val_composite is not None else "n/a"
        print(
            f"restored best checkpoint epoch {best_epoch} "
            f"(metric={args.checkpoint_metric} "
            f"recall={best_val_recall:.3f} purity={pu_s} composite={co_s})"
        )

    # ---- export ----
    model.eval()
    with torch.no_grad():
        emb = model.encode(xs, ms, seas_t)
        _, heads = model(xs, ms, seas_t)
        tower_stack = torch.stack(
            [model.towers[family](xs[family], ms[family]) for family in fams],
            dim=1,
        )
    E = emb.cpu().numpy().astype(np.float32)
    tower_values = tower_stack.cpu().numpy().astype(np.float32)
    arch_logits = heads["archetype"].cpu().numpy().astype(np.float32)
    pos_logits = heads["position"].cpu().numpy().astype(np.float32)
    skill_pred = (
        heads["skills"].cpu().numpy().astype(np.float32)
        if "skills" in heads
        else np.zeros((len(E), 0), np.float32)
    )
    next_profile_pred = heads["next_profile"].cpu().numpy().astype(np.float32)
    game_feature_keys = np.array([manifest["features"][j] for j in game_cols])

    np.savez_compressed(
        DATA_DIR / "embedding_v3.npz",
        E=E,
        player_id=pids,
        season=seasons,
        name=names,
        cluster=clusters,
        position=positions,
        archetype_logits=arch_logits,
        position_logits=pos_logits,
        skill_pred=skill_pred,
        skill_keys=np.array(skill_keys),
        next_profile_pred=next_profile_pred,
        game_feature_keys=game_feature_keys,
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

    split_of = np.array([eval_split(str(s)) for s in seasons])

    def regression_head_report(head_key: str, col_j: int | None) -> dict | None:
        """Held-out val/test R2 + MAE(z) for a masked single-target aux head."""
        if col_j is None:
            return None
        pred = heads[head_key].cpu().numpy().astype(np.float32)
        true, valid = Z[:, col_j], M[:, col_j]
        out: dict = {}
        for split in ("val", "test"):
            rows = np.where((valid > 0) & (split_of == split))[0]
            if len(rows) == 0:
                out[split] = None
                continue
            resid = true[rows] - pred[rows]
            ss_tot = float(((true[rows] - true[rows].mean()) ** 2).sum())
            out[split] = {
                "rows": len(rows),
                "mae_z": round(float(np.abs(resid).mean()), 4),
                "r2": round(1.0 - float((resid**2).sum()) / max(ss_tot, 1e-9), 4),
            }
        return out

    pedigree_report = regression_head_report("pedigree", ped_j)
    playoff_report = regression_head_report("playoff", po_j)
    honors_report = regression_head_report("honors", hon_j)
    team_fit_report = regression_head_report("team_fit", team_j)
    roster_lift_report = regression_head_report("roster_lift", roster_j)
    career_slope_report = regression_head_report("career_slope", career_j)
    competition_report = regression_head_report("competition", comp_j)

    skills_report = None
    if skill_keys:
        skills_report = {
            "holdout": skill_holdout_metrics(
                skill_pred, skill_g, skill_m, seasons, skill_keys
            ),
            "neighbor_consistency_pts_mtnn": skill_neighbor_consistency(
                E, skill_g, skill_row_mask
            ),
            "neighbor_consistency_pts_transparent_14d": skill_neighbor_consistency(
                G_base, skill_g, skill_row_mask
            ),
        }
    next_profile_report = next_profile_holdout_metrics(
        next_profile_pred,
        Z[:, game_cols],
        next_idx_arr,
        seasons,
        [manifest["features"][j] for j in game_cols],
    )
    population_validation = build_validation_report(
        embeddings=E,
        tower_stack=tower_values,
        archetype_logits=arch_logits,
        clusters=clusters,
        positions=positions,
        seasons=seasons,
        role_labels=role_labels_from_context(
            names,
            seasons,
            DATA_DIR / "role_context.json",
        ),
        next_profile_pred=next_profile_pred,
        game_profile_target=Z[:, game_cols],
        next_index=next_idx_arr,
        pairs=pair_arr,
        held_out_pairs=filter_pairs_by_split(pair_arr, seasons, "test"),
    )
    held_out = {}
    for split in ("train", "val", "test", "all"):
        sub = (
            pair_arr
            if split == "all"
            else filter_pairs_by_split(pair_arr, seasons, split)
        )
        held_out[split] = {
            "pairs": len(sub),
            "recall_at_10_mtnn": recall_at_k(E, sub, k=10),
            "recall_at_10_transparent_14d": recall_at_k(G_base, sub, k=10),
        }

    report = {
        "trained": time.strftime("%Y-%m-%d %H:%M"),
        "model": model_tag(args),
        "epochs": args.epochs,
        "best_epoch": best_epoch if best_epoch >= 0 else None,
        "best_val_recall_at_10": best_val_recall,
        "dim": args.dim,
        "tower_width": args.tower_width,
        "tower_hidden": args.tower_hidden,
        "skill_hidden": args.skill_hidden,
        # v5 architecture knobs. Without these the report cannot tell you which
        # recipe produced it -- only the checkpoint could, which made
        # mtnn_report.json useless as provenance for a promote.
        "tower_blocks": args.tower_blocks,
        "mlp_heads": args.mlp_heads,
        "d_head_hidden": args.d_head_hidden if args.mlp_heads else None,
        "fusion_hidden": args.fusion_hidden or None,
        "lr": args.lr,
        "lr_schedule": args.lr_schedule,
        "warmup_pct": args.warmup_pct,
        "anneal_strategy": args.anneal_strategy,
        "weight_decay": args.weight_decay,
        "grad_accum": args.grad_accum,
        "fusion": args.fusion,
        "nce_loss": args.nce_loss,
        "nce_player_weight": args.nce_player_weight,
        "nce_arch_weight": args.nce_arch_weight,
        "checkpoint_metric": args.checkpoint_metric,
        "best_val_purity_at_20": best_val_purity,
        "best_val_composite": best_val_composite,
        "nce_temp": args.nce_temp,
        "drop_p": args.drop_p,
        "hard_neg_boost": args.hard_neg_boost,
        "loss_weights": weights,
        "val_trace": val_trace,
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
        "next_profile": next_profile_report,
        "population_validation": population_validation,
        "next_profile_labeled_rows": next_row_count,
        "team_fit": team_fit_report,
        "roster_lift": roster_lift_report,
        "career_slope": career_slope_report,
        "competition": competition_report,
        "pedigree_expectation": pedigree_report,
        "playoff_riser": playoff_report,
        "honors_recognition": honors_report,
        "promotion_gate": (
            "Promote only if multi-task CQS >= baseline + 0.5 AND test recall@10 "
            "and purity@20 stay within 0.02 of baseline (not auto-promoted to assets/)."
        ),
    }
    report["composite"] = cqs.composite_quality(report)
    ok, why = cqs.should_promote(report)
    report["promote"] = {"ok": ok, "reason": why}
    report["metrics_source"] = "selection_holdout"
    report["selection"] = {
        "fit_rows": fit_rows_mode,
        "n_fit": int(fit_mask.sum()),
        "split": "train y<=2021 / val y<=2023 / test y>=2024",
        "best_epoch": best_epoch,
    }
    report["deploy"] = {
        "mode": "selection_fit_rows_" + fit_rows_mode,
        "metrics_source": "selection_holdout",
        "note": (
            "Held-out recall/CQS use val/test pairs; loss rows follow fit_rows. "
            "Use --phase auto to full-corpus refit after promote."
        ),
    }

    do_refit = args.phase == "auto" and ok
    if args.phase == "auto" and not ok:
        print(f"auto: promote failed ({why}) — skipping full-corpus refit")

    if do_refit and best_epoch > 0:
        refit_epochs = max(int(best_epoch), 10)
        print(f"\n-- final-refit on ALL rows ({refit_epochs} epochs) --")
        fit_idx = np.arange(n)
        if BEST_CKPT.exists() and not args.no_best_checkpoint:
            ckpt = torch.load(BEST_CKPT, map_location=device, weights_only=False)
            model.load_state_dict(ckpt["model"])
        for epoch in range(refit_epochs):
            model.train()
            perm = np.random.permutation(fit_idx)
            total, steps = 0.0, 0
            accum = 0
            opt.zero_grad(set_to_none=True)
            for s in range(0, len(perm), args.batch):
                idx = perm[s : s + args.batch]
                if len(idx) < 8:
                    continue
                idx_t = torch.tensor(idx, device=device)
                partner = np.array([lookup.get(int(i), int(i)) for i in idx])
                partner_t = torch.tensor(partner, device=device)
                xa, ma = batch_views(xs, ms, idx_t, drop_p=args.drop_p)
                xb, mb = batch_views(xs, ms, partner_t, drop_p=args.drop_p)
                za, out_a = model(xa, ma, seas_t[idx_t])
                zb, _ = model(xb, mb, seas_t[partner_t])
                loss = contrastive_loss(
                    za,
                    zb,
                    mode=args.nce_loss,
                    temp=args.nce_temp,
                    pos_a=pos_t[idx_t],
                    pos_b=pos_t[partner_t],
                    hard_neg_boost=args.hard_neg_boost,
                    arch_labels=arch_t[idx_t],
                    player_weight=args.nce_player_weight,
                    arch_weight=args.nce_arch_weight,
                )
                loss = loss + weights["archetype"] * F.cross_entropy(
                    out_a["archetype"], arch_t[idx_t]
                )
                if pos_mask[idx_t].any():
                    loss = loss + weights["position"] * F.cross_entropy(
                        out_a["position"][pos_mask[idx_t]],
                        pos_t[idx_t][pos_mask[idx_t]],
                    )
                loss = loss + weights["profile"] * F.mse_loss(
                    out_a["profile"], game_z[idx_t]
                )
                next_batch = next_idx_arr[idx]
                next_valid = next_batch >= 0
                if next_valid.any():
                    next_t = torch.tensor(next_batch[next_valid], device=device)
                    next_valid_t = torch.tensor(
                        next_valid, device=device, dtype=torch.bool
                    )
                    loss = loss + weights["next_profile"] * F.smooth_l1_loss(
                        out_a["next_profile"][next_valid_t], game_z[next_t]
                    )
                if "skills" in out_a:
                    wm = skillm_t[idx_t]
                    if wm.sum() > 0:
                        se = (out_a["skills"] - skill_t[idx_t]) ** 2
                        loss = loss + weights["skills"] * (wm * se).sum() / wm.sum()
                scaled = loss / args.grad_accum
                scaled.backward()
                accum += 1
                total += float(loss)
                if accum < args.grad_accum:
                    continue
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step()
                if sched_mode == "step":
                    sched.step()
                opt.zero_grad(set_to_none=True)
                accum = 0
                steps += 1
            if accum > 0:
                nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                opt.step()
                if sched_mode == "step":
                    sched.step()
                opt.zero_grad(set_to_none=True)
                steps += 1
            if (epoch + 1) % 10 == 0 or epoch + 1 == refit_epochs:
                print(
                    f"  refit epoch {epoch + 1}/{refit_epochs} "
                    f"loss={total / max(1, steps):.4f}"
                )
        report["deploy"] = {
            "mode": "final_refit_all_rows",
            "metrics_source": "selection_holdout",
            "refit_epochs": refit_epochs,
            "refit_n_fit": n,
            "note": (
                "Held-out recall/CQS are from the train-split selection run; "
                "shipped embeddings are full-corpus refit."
            ),
        }
        model.eval()
        with torch.no_grad():
            emb = model.encode(xs, ms, seas_t)
            _, heads = model(xs, ms, seas_t)
        E = emb.cpu().numpy().astype(np.float32)
        arch_logits = heads["archetype"].cpu().numpy().astype(np.float32)
        pos_logits = heads["position"].cpu().numpy().astype(np.float32)
        skill_pred = (
            heads["skills"].cpu().numpy().astype(np.float32)
            if "skills" in heads
            else np.zeros((len(E), 0), np.float32)
        )
        next_profile_pred = heads["next_profile"].cpu().numpy().astype(np.float32)
        np.savez_compressed(
            DATA_DIR / "embedding_v3.npz",
            E=E,
            player_id=pids,
            season=seasons,
            name=names,
            cluster=clusters,
            position=positions,
            archetype_logits=arch_logits,
            position_logits=pos_logits,
            skill_pred=skill_pred,
            skill_keys=np.array(skill_keys),
            next_profile_pred=next_profile_pred,
            game_feature_keys=game_feature_keys,
        )
        centroids = np.zeros((N_ARCHETYPES, E.shape[1]), dtype=np.float32)
        for k in range(N_ARCHETYPES):
            mask_k = clusters == k
            if mask_k.any():
                c = E[mask_k].mean(0)
                centroids[k] = c / (np.linalg.norm(c) + 1e-8)
        np.savez_compressed(DATA_DIR / "mtnn_centroids.npz", centroids=centroids)
        torch.save(
            {
                "epoch": best_epoch,
                "model": model.state_dict(),
                "checkpoint_metric": args.checkpoint_metric,
                "args": vars(args),
                "weights": weights,
                "deploy": report["deploy"],
            },
            BEST_CKPT,
        )
        print("rewrote embedding_v3.npz, mtnn_centroids.npz, mtnn_best.pt from refit")

    (DATA_DIR / "mtnn_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    print(f"CQS {report['composite']['cqs']} · {why}")
    print("wrote embedding_v3.npz, mtnn_centroids.npz, mtnn_report.json")


if __name__ == "__main__":
    main()
