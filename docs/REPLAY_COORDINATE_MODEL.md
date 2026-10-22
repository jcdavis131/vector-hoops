# Pixel Replay coordinate model (rung b)

Play-by-play feeds name the shooter and the shot spot. They don't say where the other nine players stand. Rung (a) staged those nine from formation templates in `assets/replay.js`. Rung (b) replaces the templates with a small model that places all ten players as one scene.

## Data (decision D9, Cam 2026-10-22)

- Tracking: 2015-16 SportVU, [linouk23/NBA-Player-Movements](https://github.com/linouk23/NBA-Player-Movements). 636 games listed; 631 parsed.
- Events: [sealneaward/nba-movement-data](https://github.com/sealneaward/nba-movement-data) playbyplayv2.
- The model only. The raw tracking is never served or committed. The site shows projections, labelled projected, with the sources credited.

## Pipeline

```
python scripts/tracking/fetch_sportvu.py --out <dir>          # downloads, skips files already there
python scripts/tracking/extract_snapshots.py --data <dir>     # one snapshot per event -> snapshots/<gid>.npz
python scripts/tracking/build_roles.py                        # assets/replay_roles.json from assets/vectors.json
python scripts/tracking/train_coords.py --data <dir> --out <run> --d 32 --layers 2 --ff 64 --seed 1
python scripts/tracking/holdout_replays.py --data <dir> --report <run>/report.json --out <games>
node tests/replay_model_parity.mjs <run>                      # JS forward pass vs torch
node tests/replay_model_eval.mjs --games <games> --weights <run>/weights-q8.json --roles assets/replay_roles.json
```

Run them in the CPU venv (`C:\Users\jcdav\tools\trackvenv`: py7zr, ijson, numpy, CPU torch).

## Model

A set transformer: one scene token plus ten player tokens, d 32, 2 layers, 4 heads, 18,722 parameters. It is permutation-equivariant, so it places all ten players jointly.

Inputs:
- **Scene:** event type, period, clock, score margin, and the previous shot spot for rebounds and blocks.
- **Each player:** side, whether he is the acting player, the real shot spot when he is the shooter, and a role descriptor (3 MTNN axes, archetype cluster, position). Training uses each player's 2015-16 atlas season; the page uses his latest season (2021-22 on), which is a train/serve shift. The descriptor is dropped 30% of the time in training.
- **Each player's code:** 4 random numbers, drawn fresh every batch in training. The page hashes the player id into them instead. Without the code, two teammates with no role descriptor are identical inputs and land on the same spot: 37% of pairs fell within 2 ft.

Loss: identity Huber (acting player weighted ×5) × 0.3, plus team set-matching over 120 permutations × 1.0, plus repulsion under 3 ft × 0.5.

Shipped weights: int8 with one scale per output row, `assets/replay-model.json`, 34 KB. The browser forward pass is `assets/replay-model.js`, which needs no dependencies.

## Held-out results (80 games, 28,729 events, never trained on)

These 80 games are a validation set, not a sealed test: training printed their error every epoch, and the shipped size (d 32, 2 layers, seed 1) and the jump-ball exclusion were chosen looking at them. The eval also hands the model the exact ten players on the floor, where live feeds' lineups are approximate.

Scored through `assets/replay.js` itself, rung (a) against rung (b), with the shipped int8 weights:

| | formations (a) | model + smoother (shipped) | model alone | model alone, no roles |
|---|---|---|---|---|
| mean ft from the real spot (shooter excluded) | 21.2 | 17.6 | 18.7 | 19.1 |
| median ft | 18.2 | 15.0 | 15.3 | 15.9 |
| per-team set-matched ft | 13.3 | 11.2 | 11.5 | 12.0 |
| pairs closer than 2 ft (truth 1.1%) | 0.63% | 1.42% | 0.93% | 1.03% |

The smoother costs spacing: its players crowd a little more than real ones (1.42% against 1.1%). Cam chose it for the error (2026-10-22).

Most of the gain over the templates is the templates being worse than an average: a constant per-slot training mean scores 18.26 ft on the same holdout in the trainer's metric, against 17.84 ft for the model. Where the model earns its keep is the shape of the scene: 11.5 ft set-matched against 17.7 ft for that mean, which stacks 39% of pairs within 2 ft.

Model + smoother is closer than the templates on every event type it places (biggest: blocks 14.6 against 22.8 ft, fouls 20.9 against 27.0). Jump balls keep the template: the model alone scored 27.5 ft there against 26.3.

JS parity against torch on 16 held-out events: fp16 within 0.024 ft, int8 within 0.71 ft (mean 0.20 ft). `tests/replay_model.test.mjs` re-checks the shipped weights against `tests/fixtures/replay_model_parity.json`.

The holdout's role descriptors come from `assets/replay_roles.json`, which covers seasons 2021-22 on, so many 2015-16 players have none. Tonight's players mostly do.

## Kalman smoother

`smoothFrames()` in `assets/replay.js` runs after the frames are built. Each event's scene is predicted on its own, so a player's spot could jump between plays. The smoother fixes that per player:

- **Model:** constant velocity in court feet. Process noise q = 150 ft²/s³, times the game-clock gap (at least 0.3 s).
- **Measurements:** each model spot, with σ = 12 ft. The feed's real shot and free-throw spots are near-exact (σ 0.5 ft) and are never moved.
- **Passes:** a forward Kalman filter, then a backward Rauch-Tung-Striebel pass, over each unbroken run of model scenes. A run breaks at template scenes, period changes and when the player leaves the floor.

q and σ were tuned on 40 training games, not on the holdout (`node tests/replay_model_eval.mjs --kf q,r`; `--kf off` disables it). Those games were seen in training, so σ is if anything set too low, which means less smoothing. `window.ReplayKF = { on: 0 }` turns it off on a page.

## Where it runs

- Live page plate 01 and /replay load `replay-model.js` before `replay.js`.
- `replay.js` fetches `/assets/replay-model.json` and `/assets/replay_roles.json`, then rebuilds the current game's frames when they land.
- `?model=0` turns the model off. If the fetch fails, the formation templates stay.
- The model is told the training convention for offense: on ESPN fouls and blocks (no possession in the feed) the offense is the team not fouling, and the shooter's team. Shots use the feed's own attack side. Events with no acting player on the court keep the templates.
- Scenes are cached by everything the model reads, so a live poll only computes the new plays.
- The backward smoothing pass is not causal: new plays revise the latest frames (up to 17.9 ft in a test near the live head). On a live poll (`setGame(g, {keep: true})`), frames up to one past the playhead keep the spots the viewer already saw; only frames ahead are re-smoothed.
- NBA-built games match roles by NBA id; ESPN games match by full name, normalized the same way as `build_roles.py`.
