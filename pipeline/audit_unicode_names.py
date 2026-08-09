"""Report unicode / join mismatches across vectors, pedigree, draft cache."""

from __future__ import annotations

import json
from pathlib import Path

from name_utils import canonical_name, norm_name

ROOT = Path(__file__).resolve().parents[1]
vec = json.loads((ROOT / "assets" / "vectors.json").read_text(encoding="utf-8"))["players"]
draft = json.loads((ROOT / "pipeline/cache/draft_history.json").read_text(encoding="utf-8"))

uni = sorted({p["name"] for p in vec if p["name"] != canonical_name(p["name"])})
print(f"vectors.json names needing canonicalization: {len(uni)}")
for n in uni[:25]:
    print(f"  {n!r} -> {canonical_name(n)!r}")

miss = []
for p in vec:
    nk = norm_name(p["name"])
    if nk not in draft.get("players", {}):
        miss.append(p["name"])
print(f"\ndraft_history norm miss (current vectors): {len(miss)}")
for n in sorted(set(miss))[:20]:
    print(f"  {n!r} (norm={norm_name(n)!r})")

# Spot checks
for label in ("Nikola Jokic", "Nikola Jokić", "Jusuf Nurkic", "Luka Doncic"):
    print(f"\n{label!r}: norm={norm_name(label)!r} draft={norm_name(label) in draft['players']}")
