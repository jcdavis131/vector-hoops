# e2e_slice: 100 real players for the end-to-end smoke test

`tests/test_e2e_smoke.py` copies this directory into a throwaway repo skeleton and runs the real chain on it as processes: `train_mtnn.py --recipe measure --epochs 1`, `promote.py --force`, the five exporters, `sync_public.py`, `check_served_model.py`. It is here so that chain runs in CI, where `pipeline/data/` does not exist.

It is a slice of real prepared data, not a sample to learn from. A model trained on it means nothing, and the test asserts no metric value.

## What it is

671 player-seasons of 100 players, laid out as the repo lays them out:

| file | what |
|---|---|
| `pipeline/data/train_matrix.npz` | 671 of the 12,966 matrix rows, all 143 columns, every array (`Z`, `mask`, `player_id`, `season`, `name`, `cluster`) |
| `pipeline/data/feature_manifest.json` | unchanged |
| `pipeline/data/skill_labels.npz`, `wide_skill_labels.npz` | the rows whose (name, season) is in the slice; `keys` unchanged |
| `pipeline/data/role_context.json` | the entries whose (name, season) is in the slice |
| `assets/vectors.json` | the slice's players, every top-level key unchanged |
| `assets/drift.json` | unchanged (season-level) |
| `assets/skills.json`, `vectors_search_lite.json`, `honors.json`, `current_rosters.json` | the served files the exporters read beside the model, cut to the same rows |

The first seven are the seven files `train_mtnn` hashes into `lineage.inputs`.

Rows by split: 471 train (start year <= 2021), 100 val (2022-23, 2023-24), 100 test (2024-25, 2025-26), with adjacent-season pairs into every split. Two groups of 50 players each:

- modern: in all of 2021-22 to 2025-26 and charted on a 2025-26 roster (`current_rosters.json`), rows from 2020-21 on;
- old: every season <= 2012-13 and at least four of them, whole careers. Without rows before 2013 `composite_v2` has no regime slice: it masks the columns unobserved before 2013.

Within each group, players are ranked by sha256 of their PLAYER_ID and the first 50 kept.

## Where it came from

Cut on 2026-10-10 from the prepare chain's output at commit `b7063daf` (chore(contract): accept the P11 training-matrix drift): `build_vectors.py --offline`, `enrich_vectors.py`, `integrate_context.py`, the herdmux climb's prepare. Source files, sha256:

| source | sha256 |
|---|---|
| `pipeline/data/train_matrix.npz` | `68a0415ffa8a5a1d0368681a1595d186d17db3b672fde6f45e1c1d4a6c016b82` |
| `pipeline/data/feature_manifest.json` | `f1c90cdca75df174e2bddc31f17ef6f23083cbb214f931aad77e6e36f8af14a5` |
| `assets/vectors.json` (as the prepare chain writes it, not the committed one) | `be9de7102c3ed9c8666249e67cbdcfdbd489fce6c5e275eb9c58d3f4cca1cd05` |
| `pipeline/data/skill_labels.npz` | `416a58f1e9296004a4f1fe30cb5deacf5157b2a131167fa974ecb2eb5981987a` |
| `pipeline/data/wide_skill_labels.npz` | `1354d6c40fcc838de6c50dee15f0cbf3b65d720cd0b1e4c860068b48fa56eab2` |
| `pipeline/data/role_context.json` | `5ed5ebf86805b3e54e3de6bd732b2cb0c1cc5ea0ae44feca0b84e98eaba78959` |
| `assets/drift.json` | `a420f8c8d98c02736e3b3f063423b487f399684930270257de2e6cab481d5267` |
| `assets/skills.json` (committed at `b7063daf`) | `7ed3c9b1049a9c4204a0a0e91d7278f76f3ebfe4c6210197b6a7438a38decae6` |
| `assets/current_rosters.json` (committed) | `e4a15c6d60126366a65a6be871fb17541ed4642d24ddf08a164a4f53c718a99f` |
| `assets/vectors_search_lite.json` (committed) | `58e9978e178b3a0a9d21c0451a126a25ed343432adef8c37f5e8973a6191d306` |
| `assets/honors.json` (committed) | `140c08f47986458b7600ea954e3fbac298d13f4a4292989dc9a4fa20de67e888` |

Reproduce: run the prepare chain in a checkout of that commit, then, before `git checkout -- assets/vectors.json`,

    python tests/fixtures/e2e_slice/cut_slice.py --src . --out <dir>

The cut is deterministic: the same source gives the same bytes (`np.savez_compressed` stamps every zip member 1980-01-01).

## What was changed, and why

No value was computed. Every cell is a cell of a source file, kept or dropped whole. Three structural edits follow from dropping rows:

- `vectors.json` `players[i].id` and `vectors_search_lite.json` `players[i].i` are renumbered to the slice row. In the source they are the row index (checked: `id == i` on all 12,966 rows), and the browser and `project_next_season` index `skills.json` grades by them. `vectors_search_lite.json` `count` is the slice's row count.
- `current_rosters.json` keeps `built`, `season`, `nextSeason`, `method` and the `activePlayers` entries named in the slice's 2025-26 rows (50). `teams` and `summary` describe the whole league (37 teams, 649 players) and are dropped rather than left saying so beside 50 players.
- Three players are left out: 200766, 202419 and 203502. At rows 4673, 6564 and 7329 the committed served files (`vectors_search_lite.json`, and the committed `vectors.json` that `skills.json` is indexed by) name a different PLAYER_ID than the prepared matrix (201173, 203187, 203183: the served files were built from an older `vectors.json`), so their row-indexed served values cannot be tied to the matrix row.

`.gitattributes` marks this directory `-text`, so a Windows checkout gets the same bytes CI does and the sha256 values in a run's lineage are the same everywhere.
