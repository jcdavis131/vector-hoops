#!/usr/bin/env python3
"""Hugging Face inventory for MTNN data program.

Reads each candidate's dataset CARD itself (API record + README text),
not just the search-API cardData parse, and records: card license,
file list + sizes, schema hints, stated source/provenance, downloads.
Inventory only: this script never downloads dataset files.

Usage: python3 hf_inventory.py <candidates.txt> <out.json>
Each line of candidates.txt is one dataset id (owner/name).
"""
import json
import sys
import urllib.request

UA = {"User-Agent": "Muse-inventory/1.0 (read-only research inventory)"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # network failure: record, don't fake
        return 0, f"ERROR: {e}"


def main():
    cand_path, out_path = sys.argv[1], sys.argv[2]
    ids = [ln.strip() for ln in open(cand_path) if ln.strip()]
    results = []
    for did in ids:
        rec = {"id": did}
        st, body = get(f"https://huggingface.co/api/datasets/{did}")
        rec["api_status"] = st
        if st == 200:
            try:
                d = json.loads(body)
            except json.JSONDecodeError:
                d = {}
            cd = d.get("cardData") or {}
            rec["card_license"] = cd.get("license")
            rec["card_tags"] = cd.get("tags")
            rec["downloads"] = d.get("downloads")
            rec["likes"] = d.get("likes")
            rec["siblings_n"] = len(d.get("siblings") or [])
            rec["siblings"] = [
                {"rfilename": s.get("rfilename"), "size": s.get("size")}
                for s in (d.get("siblings") or [])
            ]
            rec["api_license_field"] = d.get("license")
        st2, readme = get(f"https://huggingface.co/datasets/{did}/raw/main/README.md")
        rec["readme_status"] = st2
        rec["readme_chars"] = len(readme) if st2 == 200 else 0
        rec["readme_head"] = readme[:3000] if st2 == 200 else readme[:200]
        results.append(rec)
        print(f"done {did} api={st} readme={st2}", flush=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=1)
    print(f"wrote {out_path} ({len(results)} datasets)")


if __name__ == "__main__":
    main()
