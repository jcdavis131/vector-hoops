"""Train the Pixel Replay coordinate model (rung b) on 2015-16 SportVU snapshots.

    python scripts/tracking/train_coords.py --data C:/Users/jcdav/datasets/sportvu-linouk23 --out <dir> [--epochs 30] [--no-roles]

Question it answers: given only what a play-by-play feed says about an event (its type, who
acted, the shot spot for shots, which team has the ball and which rim it attacks, the clock,
the score, and the ten players on the court), where was everybody standing? The ten players
are a set: a small transformer attends across them, so the answer is one joint scene, not ten
separate guesses.

Inputs are in the offense's frame (the offense always attacks +x), feet scaled to about [-1, 1].
Per player: offense/defense, acting player, the anchor (the real shot or free-throw spot, only
for the acting shooter), and the player-season's role descriptor from assets/vectors.json (the
3 projected MTNN axes, cluster, position), dropped at random in training so the model also
works for players we have no descriptor for. Per scene: event type, period, clock, margin, and
the previous shot's spot for rebounds and blocks.

Holdout: 10% of games by a hash of the game id. Reports per-player position error in feet on
the holdout (all events and by type), against two baselines: the training mean per
(event, side, actor) slot, and rung (a) is measured separately by tests/replay_model_eval.mjs.
Writes model.pt, weights.json (for assets/replay-model.js) and report.json to --out.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

ROOT = Path(__file__).resolve().parents[2]
TYPES = ["2pt", "3pt", "freethrow", "rebound", "turnover", "steal", "block", "foul", "substitution", "timeout", "jumpball", "violation", "period", "game", "other"]
USED = ["2pt", "3pt", "freethrow", "rebound", "turnover", "steal", "block", "foul", "jumpball"]
UIDX = {TYPES.index(t): k for k, t in enumerate(USED)}
L, CW = 94.0, 50.0
SX, SY = 47.0, 25.0  # feet -> model units: x' = (x - 47) / 47, y' = (y - 25) / 25
NROLE = 3 + 8 + 5  # PC axes, cluster one-hot, position one-hot
PF = 1 + 1 + 3 + NROLE + 1  # side, actor, anchor (x, y, has), role, role mask
CODES = 4  # per-player random code: the only thing telling apart two teammates with no role descriptor
PFC = PF + CODES
GF = len(USED) + 5 + 1 + 1 + 3  # event, period (1-4, OT), clock, margin, last shot (x, y, has)


def holdout(gid: str) -> bool:
    return int(hashlib.sha256(gid.encode()).hexdigest(), 16) % 10 == 0


def roles(season: str = "2015-16") -> dict[int, np.ndarray]:
    d = json.loads((ROOT / "assets" / "vectors.json").read_text(encoding="utf-8"))
    out = {}
    for p in d["players"]:
        if p.get("season") != season or not p.get("pid"):
            continue
        v = np.zeros(NROLE, np.float32)
        v[0:3] = [p["x"], p["y"], p["z"]]
        if 0 <= p.get("c", -1) < 8:
            v[3 + p["c"]] = 1
        if 0 <= p.get("p", -1) < 5:
            v[11 + p["p"]] = 1
        out[int(p["pid"])] = v
    return out


def canon(x, y, right):
    """full-court feet -> offense frame (attacking +x), model units"""
    x = np.where(right, x, L - x)
    y = np.where(right, y, CW - y)
    return (x - SX) / SX, (y - SY) / SY


def featurize(z: dict, R: dict[int, np.ndarray]):
    n = len(z["ev"])
    right = z["right"].astype(bool)
    px, py = canon(z["pos"][..., 0], z["pos"][..., 1], right[:, None])
    tgt = np.stack([px, py], -1).astype(np.float32)  # (n,10,2)
    P = np.zeros((n, 10, PFC), np.float32)  # the last CODES columns are filled at train time
    P[..., 0] = z["team"]
    act = z["actor"]
    rows = np.arange(n)
    has = act >= 0
    P[rows[has], act[has], 1] = 1
    ev = z["ev"]
    anchored = has & np.isin(ev, [TYPES.index("2pt"), TYPES.index("3pt"), TYPES.index("freethrow")])
    P[rows[anchored], act[anchored], 2] = tgt[rows[anchored], act[anchored], 0]
    P[rows[anchored], act[anchored], 3] = tgt[rows[anchored], act[anchored], 1]
    P[rows[anchored], act[anchored], 4] = 1
    for i in range(n):
        for k in range(10):
            r = R.get(int(z["pid"][i, k]))
            if r is not None:
                P[i, k, 5 : 5 + NROLE] = r
                P[i, k, 5 + NROLE] = 1
    G = np.zeros((n, GF), np.float32)
    for i in range(n):
        G[i, UIDX[int(ev[i])]] = 1
    per = np.clip(z["per"].astype(int), 1, 5) - 1
    G[rows, len(USED) + per] = 1
    o = len(USED) + 5
    G[:, o] = z["clock"] / 720.0
    G[:, o + 1] = np.clip(z["margin"], -30, 30) / 20.0
    sx, sy = canon(np.nan_to_num(z["shotx"]), np.nan_to_num(z["shoty"]), right)
    hs = (~np.isnan(z["shotx"])) & (z["shotlast"] == 1)
    G[:, o + 2] = np.where(hs, sx, 0)
    G[:, o + 3] = np.where(hs, sy, 0)
    G[:, o + 4] = hs
    return P, G, tgt


class CoordNet(nn.Module):
    def __init__(self, d=64, layers=3, heads=4, ff=128):
        super().__init__()
        self.p_in = nn.Linear(PFC, d)
        self.g_in = nn.Linear(GF, d)
        self.blocks = nn.ModuleList([nn.TransformerEncoderLayer(d, heads, ff, dropout=0.0, batch_first=True, norm_first=True, activation="gelu") for _ in range(layers)])
        self.norm = nn.LayerNorm(d)
        self.out = nn.Linear(d, 2)

    def forward(self, P, G):
        h = torch.cat([self.g_in(G)[:, None, :], self.p_in(P)], 1)  # scene token + 10 players
        for b in self.blocks:
            h = b(h)
        return self.out(self.norm(h[:, 1:]))


def load(data: Path, R):
    tr, te = [], []
    for f in sorted((data / "snapshots").glob("*.npz")):
        z = dict(np.load(f))
        if len(z["ev"]) == 0:
            continue
        P, G, Y = featurize(z, R)
        (te if holdout(f.stem) else tr).append((P, G, Y, z["ev"], z["actor"], f.stem))
    cat = lambda xs, k: np.concatenate([x[k] for x in xs])  # noqa: E731
    return [tuple(cat(s, k) for k in range(5)) + ([x[5] for x in s],) for s in (tr, te)]


PERMS = None


def perms5():
    import itertools

    global PERMS
    if PERMS is None:
        PERMS = torch.tensor(list(itertools.permutations(range(5))))  # (120, 5)
    return PERMS


def set_cost(pred, Y, scale):
    """per team, the cheapest way to match the five predicted spots to the five real ones
    (feet, mean over players): scores the formation, not who stands where. pred, Y (B,10,2)."""
    pm = perms5()
    tot = 0
    for t in (slice(0, 5), slice(5, 10)):
        a, b = pred[:, t] * scale, Y[:, t] * scale  # (B,5,2)
        d = torch.sqrt(((a[:, :, None] - b[:, None]) ** 2).sum(-1) + 1e-6)  # (B,5,5)
        c = d[:, torch.arange(5)[None, :], pm].mean(-1)  # (B,120)
        tot = tot + c.min(-1).values
    return tot / 2


def repulsion(pred, scale, ft=3.0):
    p = pred * scale
    d = torch.sqrt(((p[:, :, None] - p[:, None]) ** 2).sum(-1) + 1e-6)
    iu = torch.triu_indices(10, 10, 1)
    return torch.relu(ft - d[:, iu[0], iu[1]]).pow(2).mean(-1)


def set_err_np(pred, Y):
    with torch.no_grad():
        return set_cost(torch.from_numpy(pred), torch.from_numpy(Y), torch.tensor([SX, SY])).numpy()


def ft_err(pred, Y):
    d = (pred - Y) * np.array([SX, SY], np.float32)
    return np.sqrt((d**2).sum(-1))  # (n,10) feet


def mean_baseline(Ptr, Ytr, evtr, Pte, evte):
    """per (event, side, actor) slot average in the offense frame"""
    key = lambda P, ev: ev[:, None].astype(int) * 4 + P[..., 0].astype(int) * 2 + P[..., 1].astype(int)  # noqa: E731
    ktr, kte = key(Ptr, evtr), key(Pte, evte)
    out = np.zeros(kte.shape + (2,), np.float32)
    for k in np.unique(kte):
        m = ktr == k
        out[kte == k] = Ytr[m].mean(0) if m.any() else Ytr.reshape(-1, 2).mean(0)
    return out


def overlap_rate(pos, ft=2.0):
    """share of player pairs closer than ft (both teams): a check that scenes do not pile up"""
    p = pos * np.array([SX, SY], np.float32)
    d = np.sqrt(((p[:, :, None] - p[:, None]) ** 2).sum(-1))
    iu = np.triu_indices(10, 1)
    return float((d[:, iu[0], iu[1]] < ft).mean())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--no-roles", action="store_true")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--w-ident", type=float, default=0.3)
    ap.add_argument("--w-set", type=float, default=1.0)
    ap.add_argument("--w-rep", type=float, default=0.5)
    ap.add_argument("--d", type=int, default=64)
    ap.add_argument("--layers", type=int, default=3)
    ap.add_argument("--ff", type=int, default=128)
    a = ap.parse_args()
    torch.manual_seed(a.seed)
    np.random.seed(a.seed)
    torch.set_num_threads(a.threads)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    R = {} if a.no_roles else roles()
    t0 = time.time()
    (Ptr, Gtr, Ytr, evtr, _actr, gtr), (Pte, Gte, Yte, evte, acte, gte) = load(Path(a.data), R)
    # codes: fresh noise every batch in training; one fixed draw for the holdout (the page hashes each player id instead)
    Pte[..., PF:] = np.random.default_rng(1234).standard_normal(Pte.shape[:2] + (CODES,)).astype(np.float32)
    print(f"train {len(Ptr)} events / {len(gtr)} games, holdout {len(Pte)} / {len(gte)}, roles {len(R)}, load {time.time() - t0:.0f}s", flush=True)
    net = CoordNet(d=a.d, layers=a.layers, ff=a.ff)
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-4)
    steps = a.epochs * math.ceil(len(Ptr) / a.batch)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=steps, pct_start=0.1)
    Pt, Gt, Yt = map(torch.from_numpy, (Ptr, Gtr, Ytr))
    Pv, Gv = torch.from_numpy(Pte), torch.from_numpy(Gte)
    scale = torch.tensor([SX, SY])
    rmask = slice(5, 5 + NROLE + 1)
    hist = []
    for ep in range(a.epochs):
        net.train()
        perm = torch.randperm(len(Pt))
        tot = 0.0
        for b in range(0, len(Pt), a.batch):
            idx = perm[b : b + a.batch]
            P, G, Y = Pt[idx].clone(), Gt[idx], Yt[idx]
            drop = torch.rand(P.shape[0], 10, 1) < 0.3  # role descriptors go missing at inference too
            P[..., rmask] = P[..., rmask] * (~drop)
            P[..., PF:] = torch.randn(P.shape[0], 10, CODES)
            pred = net(P, G)
            ident = nn.functional.smooth_l1_loss(pred * scale, Y * scale, beta=1.0, reduction="none").mean(-1)  # (B,10)
            w = 1 + 4 * P[..., 1]  # the acting player's own spot matters most
            loss = a.w_ident * (ident * w).sum(-1).div(w.sum(-1)).mean() + a.w_set * set_cost(pred, Y, scale).mean() + a.w_rep * repulsion(pred, scale).mean()
            opt.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
            sched.step()
            tot += loss.item() * len(idx)
        net.eval()
        with torch.no_grad():
            pv = torch.cat([net(Pv[i : i + 4096], Gv[i : i + 4096]) for i in range(0, len(Pv), 4096)]).numpy()
        e = ft_err(pv, Yte).mean()
        hist.append({"epoch": ep + 1, "train_loss": round(tot / len(Pt), 3), "holdout_ft": round(float(e), 3), "holdout_set_ft": round(float(set_err_np(pv, Yte).mean()), 3), "overlap_2ft": round(overlap_rate(pv), 4)})
        print(json.dumps(hist[-1]), flush=True)
    base = mean_baseline(Ptr, Ytr, evtr, Pte, evte)
    em, eb = ft_err(pv, Yte), ft_err(base, Yte)
    anch = np.zeros_like(em, bool)
    anch[np.arange(len(acte))[acte >= 0], acte[acte >= 0]] = (Pte[np.arange(len(acte))[acte >= 0], acte[acte >= 0], 4] == 1)
    free = ~anch  # the players the model has to place (not the given shot spot)
    by = {}
    for t in USED:
        m = evte == TYPES.index(t)
        if m.any():
            by[t] = {"n": int(m.sum()), "model_ft": round(float(em[m][free[m]].mean()), 2), "mean_baseline_ft": round(float(eb[m][free[m]].mean()), 2)}
    rep = {
        "trained": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "data": "linouk23/NBA-Player-Movements 2015-16 SportVU + sealneaward/nba-movement-data events (D9)",
        "roles": not a.no_roles,
        "seed": a.seed,
        "train_events": int(len(Ptr)),
        "train_games": len(gtr),
        "holdout_events": int(len(Pte)),
        "holdout_games": len(gte),
        "params": sum(p.numel() for p in net.parameters()),
        "holdout_ft": {"model": round(float(em[free].mean()), 3), "mean_baseline": round(float(eb[free].mean()), 3)},
        "holdout_set_ft": {"model": round(float(set_err_np(pv, Yte).mean()), 3), "mean_baseline": round(float(set_err_np(base, Yte).mean()), 3)},
        "arch": {"d": a.d, "layers": a.layers, "ff": a.ff, "heads": 4},
        "loss_weights": {"ident": a.w_ident, "set": a.w_set, "rep": a.w_rep},
        "holdout_ft_median": {"model": round(float(np.median(em[free])), 3), "mean_baseline": round(float(np.median(eb[free])), 3)},
        "by_event": by,
        "overlap_2ft": {"truth": overlap_rate(Yte), "model": overlap_rate(pv), "mean_baseline": overlap_rate(base)},
        "history": hist,
        "holdout_game_ids": gte,
    }
    (out / "report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    torch.save(net.state_dict(), out / "model.pt")
    np.savez_compressed(out / "holdout_pred.npz", pred=pv, base=base, Y=Yte, ev=evte, actor=acte)
    export(net, out / "weights.json", rep)
    export(net, out / "weights-q8.json", rep, q8=True)
    k = min(16, len(Pte))  # tests/replay_model_parity.mjs: the JS forward pass must give torch's answers
    (out / "parity.json").write_text(json.dumps({"P": Pte[:k].round(6).tolist(), "G": Gte[:k].round(6).tolist(), "pred": pv[:k].round(6).tolist()}), encoding="utf-8")
    print(json.dumps({k: rep[k] for k in ("holdout_ft", "holdout_set_ft", "holdout_ft_median", "overlap_2ft", "params")}), flush=True)
    return 0


def export(net: CoordNet, path: Path, rep: dict, q8: bool = False) -> None:
    """weights base64 per tensor, as float16, or (q8) as int8 with one float scale per output row;
    assets/replay-model.js reads both"""
    import base64

    sd = {k: v.detach().float().numpy() for k, v in net.state_dict().items()}
    blobs = {}
    for k, v in sd.items():
        if q8 and v.ndim == 2:
            sc = np.abs(v).max(1, keepdims=True) / 127.0
            sc[sc == 0] = 1.0
            q = np.clip(np.round(v / sc), -127, 127).astype(np.int8)
            blobs[k] = {"shape": list(v.shape), "q8": base64.b64encode(q.tobytes()).decode(), "s": [float(f"{x:.6g}") for x in sc[:, 0]]}
        else:
            blobs[k] = {"shape": list(v.shape), "b64": base64.b64encode(v.astype(np.float16).tobytes()).decode()}
    meta = {"pf": PFC, "codes": CODES, "gf": GF, "nrole": NROLE, "used": USED, "scale": [SX, SY], "d": net.out.in_features, "layers": len(net.blocks), "heads": 4,
            "holdout_ft": rep["holdout_ft"], "trained": rep["trained"], "data": rep["data"]}
    path.write_text(json.dumps({"meta": meta, "w": blobs}, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
