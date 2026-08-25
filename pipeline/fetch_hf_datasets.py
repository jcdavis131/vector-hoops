"""Inspect + stage the operator-curated HuggingFace NBA datasets.

Three sources (curated 2026-07) and where each feeds:

  * ds-training-nba/nba_shot_data                 -> court shot events:
        (a) re-enactment ANIMATIONS on the site, (b) a shot-profile signal
        candidate for the MTNN (location/zone frequencies per player-season).
  * Mr-Bridge/nba-salary-cap-contracts-2016-2026  -> contract STRUCTURE:
        extends the `market` family (today only SALARY_* singletons) and is the
        cross-sport 'universal MTNN' bridge (dollars + cap% are the one feature
        space every league shares).
  * cdechoch/nba-data-archive                      -> broad archive, schema TBD.

Doctrine: schema-first. This never trusts assumed columns -- it loads each
source, prints the real schema + a sample, and writes
pipeline/data/hf_<name>_schema.json so integration is built against ground
truth (same validate-first pattern as the injury proxy). Network is flaky
inside the agent sandbox; run this on the operator machine.

Load path (per the dataset authors):
    import polars as pl
    pl.read_parquet("hf://datasets/ds-training-nba/nba_shot_data/"
                    "processed/processed_20_players_train.parquet")
  or:
    from datasets import load_dataset
    load_dataset("ds-training-nba/nba_shot_data")

Run:
    python pipeline/fetch_hf_datasets.py --list                # enumerate repo files
    python pipeline/fetch_hf_datasets.py --inspect shot        # schema + sample + report
    python pipeline/fetch_hf_datasets.py --inspect salary
    python pipeline/fetch_hf_datasets.py --inspect archive
    python pipeline/fetch_hf_datasets.py --inspect all
Deps: pip install polars huggingface_hub  (pandas+pyarrow works as a fallback)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"

# name -> (repo_id, preferred sub-path or None to auto-pick the first data file)
DATASETS = {
    "shot": (
        "ds-training-nba/nba_shot_data",
        "processed/processed_20_players_train.parquet",
    ),
    "salary": ("Mr-Bridge/nba-salary-cap-contracts-2016-2026", None),
    "archive": ("cdechoch/nba-data-archive", None),
}
DATA_EXT = (".parquet", ".csv", ".jsonl", ".json", ".tsv")


def list_files(repo_id: str) -> list[str]:
    """Enumerate data files in a HF dataset repo (needs huggingface_hub)."""
    from huggingface_hub import HfApi

    files = HfApi().list_repo_files(repo_id, repo_type="dataset")
    return [f for f in files if f.lower().endswith(DATA_EXT)]


def load_frame(repo_id: str, sub_path: str):
    """Return (columns, dtypes, n_rows, head_records) for one file, polars first."""
    uri = f"hf://datasets/{repo_id}/{sub_path}"
    try:
        import polars as pl

        if sub_path.endswith(".parquet"):
            lf = pl.scan_parquet(uri)  # lazy: reads footer metadata only
            schema = lf.collect_schema()
            cols = list(schema.names())
            dtypes = [str(schema[c]) for c in cols]
            head = lf.head(5).collect().to_dicts()
            n = lf.select(pl.len()).collect().item()
            return cols, dtypes, n, head
        df = (
            pl.read_csv(uri)
            if sub_path.endswith((".csv", ".tsv"))
            else pl.read_ndjson(uri)
        )
        return df.columns, [str(t) for t in df.dtypes], df.height, df.head(5).to_dicts()
    except Exception as exc:  # pragma: no cover - env dependent
        print(f"  polars path failed ({exc}); trying pandas")
        import pandas as pd

        reader = pd.read_parquet if sub_path.endswith(".parquet") else pd.read_csv
        df = reader(uri)
        return (
            list(df.columns),
            [str(t) for t in df.dtypes],
            len(df),
            df.head(5).to_dict(orient="records"),
        )


def inspect(name: str) -> None:
    repo_id, sub = DATASETS[name]
    print(f"\n{'=' * 72}\n{name}: {repo_id}\n{'=' * 72}")
    if sub is None:
        files = list_files(repo_id)
        print("data files:", files[:30])
        parquet = [f for f in files if f.endswith(".parquet")]
        sub = (parquet or files or [None])[0]
        if sub is None:
            print("  no data files found")
            return
        print("picking:", sub)

    cols, dtypes, n, head = load_frame(repo_id, sub)
    print(f"rows: {n} | cols: {len(cols)} | file: {sub}")
    print("schema:")
    for c, t in zip(cols, dtypes):
        print(f"    {c:<28} {t}")
    print("sample row:", json.dumps(head[0], default=str)[:400] if head else "(none)")

    DATA.mkdir(parents=True, exist_ok=True)
    report = DATA / f"hf_{name}_schema.json"
    report.write_text(
        json.dumps(
            {
                "repo_id": repo_id,
                "file": sub,
                "rows": n,
                "columns": [{"name": c, "dtype": t} for c, t in zip(cols, dtypes)],
                "sample": head[:3],
            },
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )
    print(f"wrote {report}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Inspect curated HF NBA datasets")
    ap.add_argument("--list", action="store_true", help="enumerate repo files")
    ap.add_argument(
        "--inspect",
        choices=[*DATASETS.keys(), "all"],
        help="load schema + sample and write a report",
    )
    args = ap.parse_args()

    if args.list:
        for name, (repo_id, _) in DATASETS.items():
            try:
                print(f"{name} ({repo_id}):", list_files(repo_id)[:30])
            except Exception as exc:
                print(f"{name} ({repo_id}): ERR {exc}")
        return

    targets = list(DATASETS) if args.inspect == "all" else [args.inspect]
    if not args.inspect:
        ap.error("nothing to do; pass --list or --inspect <name>")
    for name in targets:
        try:
            inspect(name)
        except Exception as exc:
            print(f"{name}: ERR {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
