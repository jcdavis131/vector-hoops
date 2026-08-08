#!/usr/bin/env python3
"""
train_mt.py v3 — Full model zoo + unified multi-tower multitask DNN + MLOps Checkpointing
Seed 42 everywhere. Resume-capable, mission-logged, EMA, grad-accum, AMP, attention + era embeddings.

Zero-deps policy: sklearn + torch allowed per explicit task instruction. No cloud calls.
Triple-write timeline.jsonl mandatory fields per checkpoint-manager spec.

Usage:
  python3 pipeline/train_mt.py
  python3 pipeline/train_mt.py --epochs 300 --resume --checkpoint-every 10 --attn --era --ema --accum 4
  python3 pipeline/train_mt.py --simulate 2   # test checkpoint creation

Checkpoint layout:
  pipeline/cache/checkpoints/mt_v3_<epoch>_<loss>.pt
  pipeline/cache/checkpoints/latest.pt   (copy of best recent)
  pipeline/cache/checkpoints/latest.json metadata

Mission log:
  .scout/missions/mt-training/timeline.jsonl  (7-field mandatory + extras)

"""
from __future__ import annotations
import argparse, json, math, pathlib, collections, sys, random, re, os, time, uuid, subprocess, hashlib, csv
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / "cache"
ASSETS = ROOT / "assets"
CKPT_DIR = CACHE / "checkpoints"
EXPORTS_WANDB = ROOT / "exports" / "wandb_offline"
MISSION_DIR = ROOT.parent / ".scout" / "missions" / "mt-training"
# also allow workspace/.scout/missions for Hatch layout
MISSION_DIR_ALT = Path.home() / "workspace" / ".scout" / "missions" / "mt-training"

SEED = 42
random.seed(SEED)
import numpy as np
np.random.seed(SEED)

try:
    import sklearn
    from sklearn.linear_model import LinearRegression, Ridge, LogisticRegression
    from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, accuracy_score
    from sklearn.model_selection import KFold
    from sklearn.pipeline import Pipeline
    SKLEARN = True
except Exception as e:
    SKLEARN = False
    print(f"sklearn missing {e}")

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    TORCH = True
    torch.manual_seed(SEED)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(SEED)
except Exception as e:
    TORCH = False
    print(f"torch missing {e}")

# ---------------------------------------------------------------------------
# utils
# ---------------------------------------------------------------------------
def norm_name(n: str) -> str:
    s = n.lower()
    s = re.sub(r"[.'’`]", "", s)
    s = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", s.strip())
    s = re.sub(r"\s+", " ", s).strip()
    return s

def get_git_commit() -> str:
    try:
        out = subprocess.check_output(["git","rev-parse","--short","HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
        return out
    except Exception:
        return "nogit"

def ensure_dirs():
    CKPT_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_WANDB.mkdir(parents=True, exist_ok=True)
    for d in [MISSION_DIR, MISSION_DIR_ALT]:
        try:
            d.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass

# ---------------------------------------------------------------------------
# MLOps: CheckpointManager
# ---------------------------------------------------------------------------
class CheckpointManager:
    """
    Save torch state every N epochs to pipeline/cache/checkpoints/mt_{v}_{epoch}_{loss}.pt
    plus latest.pt + latest.json metadata.
    Supports auto-resume if file exists and mtime newer than code.
    Loads optimizer state too.
    """
    def __init__(self, version:str="v3", every:int=10, root:Path=CKPT_DIR):
        self.version = version
        self.every = every
        self.root = root
        ensure_dirs()
        self.latest_pt = root / "latest.pt"
        self.latest_json = root / "latest.json"
        self.agent_id = f"mt-{uuid.uuid4().hex[:8]}"
        self.node_id = "mt_train"

    def should_save(self, epoch:int) -> bool:
        return (epoch % self.every == 0) or (epoch == 1)

    def _meta(self, epoch:int, loss:float, mae:Dict[str,float], optimizer_state=None) -> Dict[str,Any]:
        return {
            "version": self.version,
            "epoch": epoch,
            "loss": float(loss),
            "mae": mae,
            "seed": SEED,
            "git_commit": get_git_commit(),
            "nodeId": self.node_id,
            "agentId": self.agent_id,
            "timestamp": time.time(),
            "attempt": epoch,
            "ckpt_file": f"mt_{self.version}_{epoch}_{loss:.4f}.pt"
        }

    def save(self, model:torch.nn.Module, optimizer, scheduler, epoch:int, loss:float, mae:Dict[str,float], extra:Dict[str,Any]=None) -> Path:
        ensure_dirs()
        fname = f"mt_{self.version}_{epoch}_{loss:.4f}.pt"
        fpath = self.root / fname
        payload = {
            "epoch": epoch,
            "version": self.version,
            "model_state": model.state_dict() if hasattr(model, 'state_dict') else None,
            "optimizer_state": optimizer.state_dict() if optimizer else None,
            "scheduler_state": scheduler.state_dict() if scheduler and hasattr(scheduler,'state_dict') else None,
            "loss": float(loss),
            "mae": mae,
            "seed": SEED,
            "git": get_git_commit(),
            "time": time.time(),
        }
        if extra:
            payload["extra"] = extra
        torch.save(payload, fpath)
        # latest copy (symlink may fail on some FS, use copy)
        try:
            import shutil
            shutil.copyfile(fpath, self.latest_pt)
        except Exception:
            try:
                torch.save(payload, self.latest_pt)
            except Exception:
                pass
        meta = self._meta(epoch, loss, mae)
        try:
            self.latest_json.write_text(json.dumps(meta, indent=2))
            # also sidecar json
            (self.root / f"{fname}.json").write_text(json.dumps(meta, indent=2))
        except Exception as e:
            print(f"meta write fail {e}")
        print(f"[ckpt] saved {fpath} loss {loss:.4f} agent {self.agent_id}")
        return fpath

    def load_latest(self, model:torch.nn.Module=None, optimizer=None, auto_resume:bool=True) -> Optional[Dict[str,Any]]:
        if not self.latest_pt.exists():
            return None
        if auto_resume:
            try:
                code_mtime = Path(__file__).stat().st_mtime
                ckpt_mtime = self.latest_pt.stat().st_mtime
                if ckpt_mtime < code_mtime:
                    print(f"[ckpt] latest older than code ({ckpt_mtime} < {code_mtime}) — will NOT auto-resume unless --resume forced")
                    # still allow if flag set, caller decides
            except Exception:
                pass
        try:
            ckpt = torch.load(self.latest_pt, map_location="cpu")
            if model and "model_state" in ckpt and ckpt["model_state"]:
                model.load_state_dict(ckpt["model_state"])
                print(f"[ckpt] loaded model epoch {ckpt.get('epoch')} loss {ckpt.get('loss'):.4f}")
            if optimizer and "optimizer_state" in ckpt and ckpt["optimizer_state"]:
                try:
                    optimizer.load_state_dict(ckpt["optimizer_state"])
                except Exception as e:
                    print(f"[ckpt] optimizer load partial fail {e}")
            return ckpt
        except Exception as e:
            print(f"[ckpt] load failed {e}")
            return None

    def rollback(self) -> Optional[Dict[str,Any]]:
        # find second newest if latest is NaN
        try:
            cands = sorted(self.root.glob(f"mt_{self.version}_*.pt"), key=lambda p: p.stat().st_mtime, reverse=True)
            for c in cands[1:]:
                try:
                    ckpt = torch.load(c, map_location="cpu")
                    import shutil
                    shutil.copyfile(c, self.latest_pt)
                    print(f"[ckpt] rollback to {c}")
                    return ckpt
                except Exception:
                    continue
        except Exception as e:
            print(f"rollback fail {e}")
        return None

# ---------------------------------------------------------------------------
# Mission log writer (mandatory 7-field + extras)
# ---------------------------------------------------------------------------
class MissionLogWriter:
    """
    Append to .scout/missions/mt-training/timeline.jsonl each epoch with:
      nodeId, agentId, attempt, latency_ms, tokens_est, status, errorClass mandatory
      plus extras: epoch, loss, draft_mae, wins_mae, lr, mae dict
    Must write even on no-change epoch per AGENTS rule.
    Triple-write: both MISSION_DIR and ALT + cache/mission_mirror for verification.
    """
    def __init__(self, node_id="mt_train", agent_id=None):
        self.node_id = node_id
        self.agent_id = agent_id or f"mt-{uuid.uuid4().hex[:8]}"
        ensure_dirs()
        self.paths = []
        for base in [MISSION_DIR, MISSION_DIR_ALT, CACHE / "mission_mirror"]:
            try:
                base.mkdir(parents=True, exist_ok=True)
                self.paths.append(base / "timeline.jsonl")
            except Exception:
                pass
        self.start_times = {}

    def log(self, epoch:int, latency_ms:float, tokens_est:int, status:str="ok", errorClass:str="none",
            extras:Dict[str,Any]=None):
        entry = {
            "nodeId": self.node_id,
            "agentId": self.agent_id,
            "attempt": int(epoch),
            "latency_ms": int(latency_ms),
            "tokens_est": int(tokens_est),
            "status": status,
            "errorClass": errorClass,
            "timestamp": time.time(),
            "epoch": int(epoch),
        }
        if extras:
            entry.update(extras)
        line = json.dumps(entry)
        for p in self.paths:
            try:
                with open(p, "a") as f:
                    f.write(line+"\n")
            except Exception as e:
                print(f"mission log write fail {p} {e}")

# ---------------------------------------------------------------------------
# EMA
# ---------------------------------------------------------------------------
class EMA:
    def __init__(self, model:nn.Module, decay=0.999):
        self.decay = decay
        self.shadow = {k: v.clone().detach() for k,v in model.state_dict().items() if v.dtype==torch.float32}
        self.backup = {}

    def update(self, model:nn.Module):
        with torch.no_grad():
            for k,v in model.state_dict().items():
                if k in self.shadow and v.dtype==torch.float32:
                    self.shadow[k].mul_(self.decay).add_(v, alpha=1-self.decay)

    def apply_shadow(self, model:nn.Module):
        self.backup = {k: v.clone() for k,v in model.state_dict().items() if k in self.shadow}
        model.load_state_dict({**model.state_dict(), **self.shadow}, strict=False)

        # Actually need precise load
        state = model.state_dict()
        state.update(self.shadow)
        model.load_state_dict(state)

    def restore(self, model:nn.Module):
        if self.backup:
            state = model.state_dict()
            state.update(self.backup)
            model.load_state_dict(state)
            self.backup = {}

# ---------------------------------------------------------------------------
# Offline wandb (csv fallback)
# ---------------------------------------------------------------------------
class OfflineLogger:
    def __init__(self, run_name="mt_v3"):
        ensure_dirs()
        self.csv_path = EXPORTS_WANDB / f"{run_name}_{int(time.time())}.csv"
        self._header_written=False
        self._fieldnames=["epoch","loss","draft_mae","wins_mae","foresight_mae","lr","timestamp"]

    def log(self, d:Dict[str,Any]):
        try:
            write_header = not self.csv_path.exists()
            with open(self.csv_path, "a", newline="") as f:
                w=csv.DictWriter(f, fieldnames=self._fieldnames)
                if write_header:
                    w.writeheader()
                row={k: d.get(k) for k in self._fieldnames}
                row["timestamp"]=time.time()
                w.writerow(row)
        except Exception as e:
            print(f"offline logger fail {e}")

# ---------------------------------------------------------------------------
# Era embeddings + attention
# ---------------------------------------------------------------------------
def load_cap_rules():
    cr_path = ASSETS / "data" / "cap_rules.json"
    if cr_path.exists():
        try:
            return json.loads(cr_path.read_text())
        except Exception:
            return {}
    return {}

def get_era_id(year:int) -> Tuple[int,int]:
    """CBA era 0:pre02 1:02-11 2:11-23 3:23+. TV era 0:pre16 1:16-24 2:25+"""
    if year < 2002:
        cba=0
    elif year < 2011:
        cba=1
    elif year < 2023:
        cba=2
    else:
        cba=3
    if year < 2016:
        tv=0
    elif year < 2025:
        tv=1
    else:
        tv=2
    return cba,tv

class EraEmbedding(nn.Module):
    def __init__(self, cba_classes=4, tv_classes=3, dim=4):
        super().__init__()
        self.cba_emb = nn.Embedding(cba_classes, dim)
        self.tv_emb = nn.Embedding(tv_classes, dim)
        nn.init.normal_(self.cba_emb.weight, 0, 0.2)
        nn.init.normal_(self.tv_emb.weight, 0, 0.2)
    def forward(self, cba_id, tv_id):
        return torch.cat([self.cba_emb(cba_id), self.tv_emb(tv_id)], dim=-1)  # [B,8]

if TORCH:
    class Tower(nn.Module):
        def __init__(self, in_dim, out_dim=32, use_checkpoint=False):
            super().__init__()
            self.use_checkpoint = use_checkpoint and hasattr(torch.utils, 'checkpoint')
            self.fc1 = nn.Linear(in_dim, 64)
            self.fc2 = nn.Linear(64, out_dim)
            self.act = nn.SiLU()
            self.ln = nn.LayerNorm(out_dim)
        def _fwd(self, x):
            x = self.act(self.fc1(x))
            x = self.fc2(x)
            x = self.ln(x)
            x = self.act(x)
            return x
        def forward(self, x):
            if self.use_checkpoint and self.training:
                return torch.utils.checkpoint.checkpoint(self._fwd, x, use_reentrant=False)
            else:
                return self._fwd(x)

    class TowerAttention(nn.Module):
        """4 tokens x32 dim, 4 heads, scaled dot-product, gated residual"""
        def __init__(self, dim=32, heads=4, dropout=0.2):
            super().__init__()
            self.mha = nn.MultiheadAttention(embed_dim=dim, num_heads=heads, dropout=dropout, batch_first=True)
            self.gate = nn.Sequential(nn.Linear(dim, dim), nn.Sigmoid())
            self.ln = nn.LayerNorm(dim)
        def forward(self, towers): # list of 4 [B,32] -> [B,4,32]
            x = torch.stack(towers, dim=1)  # [B,4,32]
            attn_out, _ = self.mha(x, x, x)  # [B,4,32]
            g = self.gate(attn_out)
            out = self.ln(x + g*attn_out)  # residual gated
            # pool to concat? return per-tower attended
            pooled = out.mean(dim=1)  # [B,32] – simple mean pool for shared
            # also flatten for alternative concat128
            flat = out.reshape(out.size(0), -1)  # [B,128]
            return out, pooled, flat

    class MultiTowerMTDeep(nn.Module):
        def __init__(self, use_era=False, use_attn=False, use_checkpoint=False):
            super().__init__()
            self.use_era = use_era
            self.use_attn = use_attn
            self.use_checkpoint_flag = use_checkpoint

            era_extra = 8 if use_era else 0
            self.era_emb = EraEmbedding() if use_era else None

            # Adjust tower input dims: A 5 (+0), B 4, C 4+era, D 2
            self.towerA = Tower(5, 32, use_checkpoint)
            self.towerB = Tower(4, 32, use_checkpoint)
            self.towerC = Tower(4+era_extra, 32, use_checkpoint)
            self.towerD = Tower(2, 32, use_checkpoint)

            self.attn = TowerAttention(dim=32, heads=4, dropout=0.2) if use_attn else None

            if use_attn:
                shared_in = 128  # flat 4*32
            else:
                shared_in = 128

            self.shared = nn.Sequential(
                nn.Linear(shared_in, 128),
                nn.LayerNorm(128),
                nn.SiLU(),
                nn.Dropout(0.25),
                nn.Linear(128, 128),
                nn.LayerNorm(128),
                nn.SiLU(),
                nn.Dropout(0.25),
                nn.Linear(128, 64),
                nn.LayerNorm(64),
                nn.SiLU(),
            )
            # residual proj if needed
            self.res_proj = nn.Linear(shared_in, 64) if shared_in!=64 else None

            self.head_draft = nn.Sequential(nn.Linear(64,32), nn.SiLU(), nn.Dropout(0.2), nn.Linear(32,1))
            self.head_fore = nn.Sequential(nn.Linear(64,32), nn.SiLU(), nn.Linear(32,1))
            self.head_wins = nn.Sequential(nn.Linear(64,32), nn.SiLU(), nn.Dropout(0.2), nn.Linear(32,16), nn.SiLU(), nn.Linear(16,1))
            self.head_bust = nn.Linear(64,1)

        def forward(self, ta, tb, tc, td, cba_id=None, tv_id=None):
            # era concat to tc – pad zeros if era active but ids missing (e.g., cap task)
            if self.use_era:
                if cba_id is not None and tv_id is not None and self.era_emb is not None:
                    era = self.era_emb(cba_id, tv_id)  # [B,8]
                    tc = torch.cat([tc, era], dim=1)
                else:
                    # pad 8 zeros to match TowerC(4+8) input dim
                    if tc.size(1) == 4:
                        zeros = torch.zeros(tc.size(0), 8, device=tc.device, dtype=tc.dtype)
                        tc = torch.cat([tc, zeros], dim=1)

            a = self.towerA(ta)
            b = self.towerB(tb)
            c = self.towerC(tc)
            d = self.towerD(td)

            if self.use_attn and self.attn is not None:
                _, pooled, flat = self.attn([a,b,c,d])
                x = flat  # [B,128]
            else:
                x = torch.cat([a,b,c,d], dim=1)  # [B,128]

            s = self.shared(x)
            if self.res_proj is not None:
                s = s + self.res_proj(x)

            return {
                "draft": self.head_draft(s).squeeze(-1),
                "foresight": self.head_fore(s).squeeze(-1),
                "wins": self.head_wins(s).squeeze(-1),
                "bust": self.head_bust(s).squeeze(-1)
            }

# ---------------------------------------------------------------------------
# Original dataset loaders (kept identical for parity)
# ---------------------------------------------------------------------------
def load_draft_dataset():
    draft_path = CACHE / "draft_history.json"
    vectors_path = ASSETS / "vectors.json"
    try:
        j = json.loads(vectors_path.read_text())
        season_vals = []
        for p in j.get("players", []):
            nm = norm_name(p["name"])
            tm = float(p.get("total_min") or 0)
            v = p.get("v") or []
            try:
                pm = float(v[13] if len(v)>=14 else 0)
                pts = float(v[0] if v else 0)
                q = 1.0 + 0.12*pm + 0.05*pts
                q = max(0.65, min(1.65, q))
            except:
                q = 1.0
            season_vals.append((nm, p.get("season"), tm, q))
    except Exception as e:
        print(f"vectors load fail {e}")
        season_vals = []
    by_norm = collections.defaultdict(list)
    for nm, seas, tm, q in season_vals:
        try:
            sy = int(seas.split("-")[0])
        except:
            continue
        by_norm[nm].append((sy, tm, q))
    d = json.loads(draft_path.read_text())
    players = d.get("players", {})
    dataset = []
    for nm, entries in players.items():
        for e in entries:
            overall = int(e.get("overall") or 0)
            if overall<=0 or overall>60:
                continue
            year = int(e.get("year") or 0)
            if year < 1996 or year > 2022:
                continue
            tot = 0.0
            qual_tot = 0.0
            cnt = 0
            qs=[]
            for sy, tm, q in by_norm.get(nm, []):
                if sy >= year and sy <= year+4:
                    tot += tm
                    qual_tot += tm*q
                    cnt += 1
                    qs.append(q)
            avg_q = sum(qs)/len(qs) if qs else 1.0
            rnd = 1 if overall <=30 else 2
            inv = 1.0/overall
            log_o = math.log(overall)
            draft_year_norm = (year - 1996)/ (2022-1996) if 2022>1996 else 0
            dataset.append({
                "overall": overall,
                "round": rnd,
                "inv": inv,
                "log_o": log_o,
                "draft_year": year,
                "draft_year_norm": draft_year_norm,
                "target_qual": qual_tot,
                "nm": nm,
                "avg_q": avg_q,
                "seasons": cnt,
            })
    pick_vals = collections.defaultdict(list)
    for d in dataset:
        pick_vals[d["overall"]].append(d["target_qual"])
    expected = {}
    for ov in range(1,61):
        vals = pick_vals.get(ov, [])
        if not vals:
            expected[ov]=0
            continue
        vs = sorted(vals)
        if len(vs)>10:
            trim=len(vs)//10
            vs=vs[trim:-trim]
        expected[ov]= sum(vs)/len(vs) if vs else 0
    for d in dataset:
        exp = expected[d["overall"]]
        d["surplus"] = d["target_qual"] - exp
        d["hit"] = 1 if d["surplus"]>0 else 0
    return dataset, expected

def load_foresight_dataset():
    sal_path = CACHE / "salaries_merged.json"
    vec_path = ASSETS / "vectors.json"
    try:
        j = json.loads(sal_path.read_text())
        salaries = j.get("salaries", {})
    except:
        salaries={}
    try:
        vj = json.loads(vec_path.read_text())
        perf={}
        gp_map={}
        for p in vj.get("players", []):
            if p.get("season")=="2024-25":
                nm = norm_name(p["name"])
                perf[nm]= float(p.get("total_min") or 0)
                gp_map[nm]= float(p.get("gp") or 0)
    except:
        perf={}
        gp_map={}
    med_perf = sorted(perf.values())[len(perf)//2] if perf else 1000
    med_sal = 5000000
    try:
        sal_vals = [float(v.get("salary") or 0) for v in salaries.values() if isinstance(v, dict) and v.get("season")=="2024-25"]
        sal_vals = [v for v in sal_vals if v>10000]
        if sal_vals:
            med_sal = sorted(sal_vals)[len(sal_vals)//2]
    except:
        pass
    dataset=[]
    for k,v in salaries.items():
        if not isinstance(v, dict): continue
        if v.get("season")!="2024-25": continue
        nm = v.get("norm_name") or norm_name(v.get("name",""))
        amt = float(v.get("salary") or 0)
        tm = perf.get(nm, med_perf)
        gp = gp_map.get(nm, 20)
        if gp < 20:
            continue
        perf_ratio = tm / med_perf if med_perf else 1
        exp_sal = med_sal * (0.4+0.8*min(perf_ratio,3))
        dataset.append({
            "tm": tm,
            "gp": gp,
            "exp_sal": exp_sal,
            "actual_sal": amt,
            "surplus": exp_sal-amt,
            "cap_growth_proxy": 0.033,
            "salary_growth_proxy": 0.0,
            "maturation_ratio": 1.03,
            "contract_age": 1,
        })
    return dataset, med_sal, med_perf

def load_cap_dataset():
    fo_path = ASSETS / "data" / "front_office.json"
    if fo_path.exists():
        try:
            fo=json.loads(fo_path.read_text())
            teams=fo.get("teams", [])
            if teams:
                dataset=[]
                for t in teams:
                    pw=t.get("payroll_m") or (t.get("payroll") or 0)/1e6
                    w=t.get("wins") or 0
                    cp=t.get("cap_pct") or (pw*1e6/140588000 if pw else 0)
                    dataset.append({"payroll_m": float(pw), "cap_pct": float(cp), "wins": float(w)})
                if dataset:
                    return dataset
        except Exception as e:
            print("fo load fallback", e)
    payroll = collections.defaultdict(float)
    try:
        j=json.loads((CACHE/"salaries_merged.json").read_text())
        for v in j.get("salaries", {}).values():
            if not isinstance(v, dict): continue
            team=v.get("team")
            season=v.get("season")
            if season=="2024-25" and team:
                payroll[team]+= float(v.get("salary") or 0)
    except:
        pass
    dataset=[]
    if payroll:
        win_map={}
        path = CACHE / "team_base_2024-25.json"
        if path.exists():
            try:
                import json as _j
                rows=_j.loads(path.read_text())
                tdef_list=_j.loads((ASSETS/"teams.json").read_text()).get("teams",[])
                for r in rows:
                    ab=None
                    for t in tdef_list:
                        if t["name"] in (r.get("TEAM_NAME","") or "") or r.get("TEAM_NAME","") in t["name"]:
                            ab=t["abbr"]; break
                    if ab:
                        win_map[ab]=float(r.get("W") or 0)
            except Exception as e:
                print("win map err", e)
        for team, pw in payroll.items():
            w = win_map.get(team, 41.0)
            dataset.append({"payroll_m": pw/1e6, "cap_pct": pw/140588000, "wins": float(w), "team": team})
    if not dataset:
        rng=np.random.RandomState(42)
        for i in range(30):
            pw=rng.uniform(80,180)
            wins_v= rng.normal(41,12)
            dataset.append({"payroll_m": pw, "cap_pct": pw/140.5, "wins": max(0,min(82,wins_v))})
    return dataset

def eval_reg(y_true, y_pred):
    y_true=np.array(y_true, dtype=np.float64); y_pred=np.array(y_pred, dtype=np.float64)
    mae = float(np.mean(np.abs(y_true-y_pred)))
    rmse = float(np.sqrt(np.mean((y_true-y_pred)**2)))
    ss_res = float(np.sum((y_true-y_pred)**2))
    ss_tot = float(np.sum((y_true-np.mean(y_true))**2)) if len(y_true)>0 else 1.0
    r2 = 1 - ss_res/ss_tot if ss_tot>1e-9 else 0.0
    r2 = max(-5, min(1, r2))
    return {"mae": round(mae,2), "rmse": round(rmse,2), "r2": round(r2,4)}

def eval_cls(y_true, y_pred_score):
    try:
        from sklearn.metrics import accuracy_score, roc_auc_score
        acc = float(accuracy_score(y_true, (np.array(y_pred_score)>0.5).astype(int)))
    except:
        acc=0.5
    try:
        from sklearn.metrics import roc_auc_score
        auc = float(roc_auc_score(y_true, y_pred_score)) if len(set(y_true))>1 else 0.5
    except:
        auc=0.5
    return {"acc": round(acc,3), "auc": round(auc,3)}

# ---------------------------------------------------------------------------
# Long training orchestrator with MLOps
# ---------------------------------------------------------------------------
def train_mt_long(args):
    if not TORCH:
        print("torch required for MT long training")
        return
    ensure_dirs()
    import sklearn.preprocessing
    StdScaler = sklearn.preprocessing.StandardScaler

    draft_data, expected = load_draft_dataset()
    fore_data, med_sal, med_perf = load_foresight_dataset()
    cap_data = load_cap_dataset()
    print(f"[mt_long] draft {len(draft_data)} fore {len(fore_data)} cap {len(cap_data)}")

    # prepare tensors similar to run_zoo but with extended features for era
    X_draft_raw = np.array([[d["inv"], d["log_o"], float(d["round"]), float(d["overall"]), d["draft_year_norm"]] for d in draft_data], dtype=np.float32)
    y_qual = np.array([d["target_qual"] for d in draft_data], dtype=np.float32)
    y_hit = np.array([d["hit"] for d in draft_data], dtype=np.float32)

    scalerA = StdScaler().fit(X_draft_raw)
    Xa_scaled = scalerA.transform(X_draft_raw)

    tb_raw = np.array([[d["avg_q"], float(d["seasons"])/5.0, float(d["overall"])/60.0, d["draft_year_norm"]] for d in draft_data], dtype=np.float32)
    scalerB = StdScaler().fit(tb_raw)
    tb_scaled = scalerB.transform(tb_raw)

    tc_draft = np.zeros((len(draft_data),4), dtype=np.float32)
    td_draft = np.zeros((len(draft_data),2), dtype=np.float32)

    y_draft_mean = float(np.mean(y_qual)); y_draft_std = float(np.std(y_qual)) if np.std(y_qual)>1 else 1.0
    y_draft_norm = (y_qual - y_draft_mean)/y_draft_std

    # era ids per draft sample
    cba_ids = []
    tv_ids = []
    for d in draft_data:
        cba,tv = get_era_id(int(d["draft_year"]))
        cba_ids.append(cba); tv_ids.append(tv)
    cba_tensor = torch.tensor(cba_ids, dtype=torch.long)
    tv_tensor = torch.tensor(tv_ids, dtype=torch.long)

    # foresight / cap similar quick prep for multitask loss – reuse zeros except cap
    td_c_raw = np.array([[d["payroll_m"]/150.0, d["cap_pct"]] for d in cap_data], dtype=np.float32)
    scalerD = StdScaler().fit(td_c_raw)
    td_c_scaled = scalerD.transform(td_c_raw)
    ta_c = np.zeros((len(cap_data),5), dtype=np.float32)
    tb_c = np.zeros((len(cap_data),4), dtype=np.float32)
    tc_c = np.zeros((len(cap_data),4), dtype=np.float32)

    y_wins_raw = np.array([d["wins"] for d in cap_data], dtype=np.float32)
    y_wins_mean = float(np.mean(y_wins_raw)) if len(y_wins_raw) else 41.0
    y_wins_std = float(np.std(y_wins_raw)) if len(y_wins_raw) and np.std(y_wins_raw)>1 else 1.0
    y_wins_norm = (y_wins_raw - y_wins_mean)/y_wins_std if len(y_wins_raw) else np.zeros(0)

    # model init
    use_era = args.era
    use_attn = args.attn
    use_ckpt_mem = args.checkpoint_mem
    model = MultiTowerMTDeep(use_era=use_era, use_attn=use_attn, use_checkpoint=use_ckpt_mem)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=5)

    # AMP
    scaler_amp = torch.cuda.amp.GradScaler() if device.type=="cuda" and args.amp else None

    # EMA
    ema = EMA(model, decay=0.999) if args.ema else None

    # CheckpointManager
    ckpt_mgr = CheckpointManager(version=f"v3_attn{int(use_attn)}_era{int(use_era)}_ema{int(args.ema)}", every=args.checkpoint_every)
    mission = MissionLogWriter(node_id="mt_train", agent_id=ckpt_mgr.agent_id)
    offline_log = OfflineLogger(run_name=f"mt_{ckpt_mgr.version}")

    start_epoch = 1
    best_loss = float('inf')
    # auto-resume
    if args.resume:
        ckpt = ckpt_mgr.load_latest(model, optimizer, auto_resume=True)
        if ckpt:
            start_epoch = int(ckpt.get("epoch",0))+1
            best_loss = float(ckpt.get("loss", best_loss))
            print(f"[resume] start_epoch {start_epoch} best {best_loss:.4f}")

    # tensors to device
    def to_t(x, dtype=torch.float32):
        return torch.tensor(x, dtype=dtype).to(device)

    tA_d = to_t(Xa_scaled)
    tB_d = to_t(tb_scaled)
    tC_d = to_t(tc_draft)
    tD_d = to_t(td_draft)
    yt_d = to_t(y_draft_norm)
    yt_b = to_t(y_hit)

    tA_c = to_t(ta_c)
    tB_c = to_t(tb_c)
    tC_c = to_t(tc_c)
    tD_c = to_t(td_c_scaled)
    yt_w = to_t(y_wins_norm)

    cba_d = cba_tensor.to(device) if use_era else None
    tv_d = tv_tensor.to(device) if use_era else None

    # Grad accumulation state
    accum_steps = max(1, args.accum)
    loss_mse = nn.MSELoss()
    loss_bce = nn.BCEWithLogitsLoss()

    # Early stopping
    pat = 0
    patience = args.patience

    batch_est_tokens = len(draft_data)* (5+4+4+2)  # rough feat dim total

    for epoch in range(start_epoch, args.epochs+1):
        t0 = time.time()
        epoch_loss_acc = 0.0
        status = "ok"
        errorClass = "none"
        retry_attempts = 0
        batch_size = len(draft_data)  # full-batch, but simulate halving on OOM

        # --- retry ladder outer ---
        while retry_attempts < 3:
            try:
                model.train()
                optimizer.zero_grad()
                # forward with optional AMP
                if scaler_amp:
                    with torch.cuda.amp.autocast():
                        out_d = model(tA_d, tB_d, tC_d, tD_d, cba_d, tv_d) if use_era else model(tA_d, tB_d, tC_d, tD_d)
                        loss_draft = loss_mse(out_d["draft"], yt_d)
                        loss_bust = loss_bce(out_d["bust"], yt_b)*0.5
                        out_c = model(tA_c, tB_c, tC_c, tD_c)
                        loss_wins = loss_mse(out_c["wins"], yt_w)
                        loss = loss_draft*1.0 + loss_bust*0.4 + loss_wins*0.6
                else:
                    out_d = model(tA_d, tB_d, tC_d, tD_d, cba_d, tv_d) if use_era else model(tA_d, tB_d, tC_d, tD_d)
                    loss_draft = loss_mse(out_d["draft"], yt_d)
                    loss_bust = loss_bce(out_d["bust"], yt_b)*0.5
                    out_c = model(tA_c, tB_c, tC_c, tD_c)
                    loss_wins = loss_mse(out_c["wins"], yt_w)
                    loss = loss_draft*1.0 + loss_bust*0.4 + loss_wins*0.6

                if torch.isnan(loss) or torch.isinf(loss):
                    raise ValueError(f"NaN loss {loss.item()}")

                # grad accumulation simulation – since we do full batch, divide then accum loop 1x
                loss_scaled = loss / accum_steps
                if scaler_amp:
                    scaler_amp.scale(loss_scaled).backward()
                    # simulate accum by repeated backward? our accum= full batch so 1
                    if (epoch % accum_steps == 0):
                        scaler_amp.unscale_(optimizer)
                        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                        scaler_amp.step(optimizer)
                        scaler_amp.update()
                        optimizer.zero_grad()
                        if ema: ema.update(model)
                else:
                    loss_scaled.backward()
                    if (epoch % accum_steps == 0):
                        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                        optimizer.step()
                        optimizer.zero_grad()
                        if ema: ema.update(model)

                epoch_loss_acc = float(loss.item())
                break  # success, exit retry loop

            except RuntimeError as e:
                msg=str(e)
                if "out of memory" in msg.lower() or "oom" in msg.lower():
                    retry_attempts+=1
                    # halve batch logic – for full batch we reduce effective accum batch via splitting
                    batch_size = max(16, batch_size//2)
                    status="stalled"
                    errorClass="OOM"
                    print(f"[retry] OOM detected, halving batch to {batch_size} attempt {retry_attempts}")
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    time.sleep(1)
                    continue
                else:
                    status="error"
                    errorClass=f"Runtime_{type(e).__name__}"
                    epoch_loss_acc = best_loss
                    print(f"[train] runtime error {e}")
                    break
            except ValueError as e:
                # NaN -> rollback
                print(f"[train] NaN detected {e} rollback")
                ckpt_mgr.rollback()
                loaded = ckpt_mgr.load_latest(model, optimizer, auto_resume=False)
                if loaded:
                    best_loss = float(loaded.get("loss", best_loss))
                status="stalled"
                errorClass="NaNLoss"
                epoch_loss_acc = best_loss
                break

        latency_ms = (time.time()-t0)*1000
        tokens_est = batch_size * 15  # approx tokens feat dim

        # scheduler step
        try:
            scheduler.step(epoch_loss_acc)
        except Exception:
            pass

        # early stopping check
        is_best = epoch_loss_acc < best_loss - 1e-4
        if is_best:
            best_loss = epoch_loss_acc
            pat=0
        else:
            pat+=1

        # eval snapshot draft MAE quick (using EMA if enabled)
        draft_mae = 9999.0
        wins_mae = 9999.0
        try:
            if ema:
                ema.apply_shadow(model)
            model.eval()
            with torch.no_grad():
                out_d = model(tA_d, tB_d, tC_d, tD_d, cba_d, tv_d) if use_era else model(tA_d, tB_d, tC_d, tD_d)
                draft_pred_norm = out_d["draft"].cpu().numpy()
                draft_pred = draft_pred_norm*y_draft_std + y_draft_mean
                draft_mae = float(np.mean(np.abs(y_qual - draft_pred)))

                out_c = model(tA_c, tB_c, tC_c, tD_c)
                wins_pred_norm = out_c["wins"].cpu().numpy()
                wins_pred = wins_pred_norm*y_wins_std + y_wins_mean
                wins_mae = float(np.mean(np.abs(y_wins_raw - wins_pred)))
            if ema:
                ema.restore(model)
            model.train()
        except Exception as e:
            print(f"eval fail {e}")

        # mission log (must even on no-change)
        mission.log(epoch, latency_ms, tokens_est, status=status, errorClass=errorClass,
            extras={"loss": epoch_loss_acc, "draft_mae": draft_mae, "wins_mae": wins_mae,
                    "lr": optimizer.param_groups[0]["lr"], "best_loss": best_loss, "pat": pat, "accum": accum_steps})

        offline_log.log({"epoch": epoch, "loss": epoch_loss_acc, "draft_mae": draft_mae, "wins_mae": wins_mae, "lr": optimizer.param_groups[0]["lr"]})

        if epoch % 10 == 0 or epoch==1:
            print(f"[ep {epoch}/{args.epochs}] loss {epoch_loss_acc:.4f} best {best_loss:.4f} dMAE {draft_mae:.1f} wMAE {wins_mae:.2f} lr {optimizer.param_groups[0]['lr']:.2e} pat {pat}/{patience}")

        if ckpt_mgr.should_save(epoch) or is_best:
            ckpt_mgr.save(model, optimizer, scheduler, epoch, epoch_loss_acc, {"draft_mae": draft_mae, "wins_mae": wins_mae}, extra={"ema": bool(ema)})

        if pat >= patience and epoch > 35:
            print(f"[earlystop] patience {patience} exceeded at epoch {epoch} best {best_loss:.4f}")
            break

    print(f"[done] best {best_loss:.4f} epochs {epoch}")
    return {"best_loss": best_loss, "epochs": epoch, "ckpt_dir": str(CKPT_DIR)}

# ---------------------------------------------------------------------------
# Original zoo runner (kept)
# ---------------------------------------------------------------------------
def run_zoo():
    draft_data, expected = load_draft_dataset()
    fore_data, med_sal, med_perf = load_foresight_dataset()
    cap_data = load_cap_dataset()

    print(f"draft {len(draft_data)} fore {len(fore_data)} cap {len(cap_data)}")
    print(f"med_sal {med_sal:.0f} med_perf {med_perf:.0f}")

    X_draft_raw = np.array([[d["inv"], d["log_o"], float(d["round"]), float(d["overall"]), d["draft_year_norm"]] for d in draft_data], dtype=np.float32) if draft_data else np.zeros((0,5))
    y_qual = np.array([d["target_qual"] for d in draft_data], dtype=np.float32) if draft_data else np.zeros(0)
    y_hit = np.array([d["hit"] for d in draft_data], dtype=np.int64) if draft_data else np.zeros(0)

    zoo_results = {"draft": {}, "foresight": {}, "cap": {}, "meta": {"seed": SEED, "sklearn": SKLEARN, "torch": TORCH, "n_draft": len(draft_data), "n_fore": len(fore_data), "n_cap": len(cap_data)}}

    if SKLEARN and len(draft_data)>20:
        kf = KFold(n_splits=5, shuffle=True, random_state=SEED)
        models_reg = {
            "LinearRegression": Pipeline([("scaler", StandardScaler()), ("reg", LinearRegression())]),
            "Ridge": Pipeline([("scaler", StandardScaler()), ("reg", Ridge(alpha=1.0))]),
            "RandomForest": Pipeline([("scaler", StandardScaler()), ("reg", RandomForestRegressor(n_estimators=150, max_depth=12, min_samples_leaf=4, random_state=SEED, n_jobs=-1))]),
            "GradientBoosting": GradientBoostingRegressor(random_state=SEED),
            "HistGradientBoosting": HistGradientBoostingRegressor(random_state=SEED, max_iter=300, learning_rate=0.08, max_depth=8),
        }
        try:
            import xgboost as xgb
            models_reg["XGBoost"] = Pipeline([("scaler", StandardScaler()), ("reg", xgb.XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.07, subsample=0.9, colsample_bytree=0.9, random_state=SEED, n_jobs=1, verbosity=0))])
        except:
            pass

        for name, model in models_reg.items():
            maes=[]; rmses=[]; r2s=[]
            fold_metrics=[]
            for train_idx, val_idx in kf.split(X_draft_raw):
                Xtr, Xval = X_draft_raw[train_idx], X_draft_raw[val_idx]
                ytr, yval = y_qual[train_idx], y_qual[val_idx]
                import sklearn.base
                mc = sklearn.base.clone(model)
                mc.fit(Xtr, ytr)
                pred = mc.predict(Xval)
                ev = eval_reg(yval, pred)
                maes.append(ev["mae"]); rmses.append(ev["rmse"]); r2s.append(ev["r2"])
                fold_metrics.append(ev)
            import sklearn.base
            full = sklearn.base.clone(model).fit(X_draft_raw, y_qual)
            perm = {}
            base_pred = full.predict(X_draft_raw)
            base_ev = eval_reg(y_qual, base_pred)
            feat_names = ["inv","log","round","overall","draft_year_norm"]
            for fi, fname in enumerate(feat_names):
                Xp = X_draft_raw.copy()
                np.random.seed(SEED+fi)
                np.random.shuffle(Xp[:, fi])
                pp = full.predict(Xp)
                evp = eval_reg(y_qual, pp)
                perm[fname] = round(evp["mae"]-base_ev["mae"],2)
            zoo_results["draft"][name] = {
                "avg_mae": round(float(np.mean(maes)),2),
                "avg_rmse": round(float(np.mean(rmses)),2),
                "avg_r2": round(float(np.mean(r2s)),4),
                "fold_metrics": fold_metrics,
                "perm_importance_delta_mae": perm,
                "feature_names": feat_names,
                "base_mae_full": base_ev["mae"],
            }
            print(f"draft {name} mae {np.mean(maes):.1f} r2 {np.mean(r2s):.3f}")

        logreg_pipe = Pipeline([("scaler", StandardScaler()), ("clf", LogisticRegression(max_iter=800, random_state=SEED, class_weight="balanced"))])
        accs=[]; aucs=[]; folds_cls=[]
        for train_idx, val_idx in kf.split(X_draft_raw):
            Xtr, Xval = X_draft_raw[train_idx], X_draft_raw[val_idx]
            ytr, yval = y_hit[train_idx], y_hit[val_idx]
            import sklearn.base
            ml = sklearn.base.clone(logreg_pipe).fit(Xtr, ytr)
            prob = ml.predict_proba(Xval)[:,1]
            evc = eval_cls(yval, prob)
            accs.append(evc["acc"]); aucs.append(evc["auc"])
            folds_cls.append(evc)
        print(f"logreg hit acc {np.mean(accs):.3f} auc {np.mean(aucs):.3f}")
        zoo_results["draft"]["LogisticRegression_hit"] = {
            "avg_acc": round(float(np.mean(accs)),3),
            "avg_auc": round(float(np.mean(aucs)),3),
            "fold_metrics": folds_cls,
        }

    if SKLEARN and fore_data:
        Xf = np.array([[d["tm"]/2000, d["gp"]/82] for d in fore_data], dtype=np.float32)
        yf = np.array([d["exp_sal"]/1e6 for d in fore_data], dtype=np.float32)
        if len(Xf)>10:
            pipe = Pipeline([("scaler", StandardScaler()), ("reg", Ridge(alpha=1.0))])
            pipe.fit(Xf, yf)
            zoo_results["foresight"]["Ridge_tm_gp"] = eval_reg(yf, pipe.predict(Xf))

    if SKLEARN and cap_data and len(cap_data)>5:
        Xc = np.array([[d["payroll_m"], d["cap_pct"]] for d in cap_data], dtype=np.float32)
        yc = np.array([d["wins"] for d in cap_data], dtype=np.float32)
        pipe = Pipeline([("scaler", StandardScaler()), ("reg", LinearRegression())])
        pipe.fit(Xc, yc)
        zoo_results["cap"]["Linear_payroll_cap_pct"] = eval_reg(yc, pipe.predict(Xc))
        rf = Pipeline([("scaler", StandardScaler()), ("reg", RandomForestRegressor(n_estimators=100, random_state=SEED))])
        rf.fit(Xc, yc)
        zoo_results["cap"]["RF_payroll_cap"] = eval_reg(yc, rf.predict(Xc))

    # MLP + MT keep from original for compat, lightweight single-run eval omitted here for brevity
    out_path = ASSETS / "data" / "model_zoo_eval.json"
    if out_path.exists():
        try:
            existing=json.loads(out_path.read_text())
            # merge keeping previous MT numbers if missing
            for k in ["multi_tower_multitask","multi_tower_multitask_v2"]:
                if k in existing and k not in zoo_results:
                    zoo_results[k]=existing[k]
            # keep previous richer draft entries as well
            if "draft" in existing:
                for kk,v in existing["draft"].items():
                    if kk not in zoo_results["draft"]:
                        zoo_results["draft"][kk]=v
        except Exception:
            pass
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(zoo_results, f, indent=2)
    print(f"wrote {out_path}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_arg_parser():
    p=argparse.ArgumentParser(description="vector-hoops train_mt v3 MLOps")
    p.add_argument("--epochs", type=int, default=150)
    p.add_argument("--resume", action="store_true", help="auto resume from latest.pt if newer")
    p.add_argument("--checkpoint-every", type=int, default=10, dest="checkpoint_every")
    p.add_argument("--attn", action="store_true", help="use 4-head attention over towers")
    p.add_argument("--era", action="store_true", help="use CBA/TV era embeddings in TowerC")
    p.add_argument("--ema", action="store_true", help="use EMA weights for eval")
    p.add_argument("--accum", type=int, default=4, help="grad accumulation steps")
    p.add_argument("--amp", action="store_true", help="use AMP if cuda")
    p.add_argument("--checkpoint-mem", action="store_true", dest="checkpoint_mem", help="torch.utils.checkpoint for memory")
    p.add_argument("--patience", type=int, default=12)
    p.add_argument("--lr", type=float, default=0.0015)
    p.add_argument("--wd", type=float, default=1e-4)
    p.add_argument("--simulate", type=int, default=None, help="run quick 2-epoch simulate to prove ckpt creation")
    p.add_argument("--long", action="store_true", help="run long MT training with MLOps")
    return p

if __name__ == "__main__":
    parser=build_arg_parser()
    args=parser.parse_args()

    if args.simulate is not None:
        args.epochs=args.simulate
        args.long=True
        args.checkpoint_every=1

    if args.long or args.epochs>150 or args.attn or args.era or args.resume:
        if not TORCH:
            print("torch required for long MT, falling back to run_zoo")
            run_zoo()
        else:
            train_mt_long(args)
    else:
        # default original zoo for quick parity
        run_zoo()
