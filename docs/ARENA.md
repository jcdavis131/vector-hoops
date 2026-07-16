# Name the Player — the 9th daily mode

One mystery player-season a day, shown only as model output: its position on
the MTNN constellation, its pull toward the 8 archetype poles, its 12-skill
DNA, and its games played. Name the player in six guesses. Every guess lands
on the map and comes back with a warmth score. `fingerprint.html` is the
whole app, reachable from the `/play` tab bar and the mode grid on `/`; the
other 8 modes are untouched.

> **Not `/arena`.** `/arena` is a separate, pre-existing feature — a
> Three.js "chibi court" tour of 30 arenas with the embedding drawn as
> colored nebulae (`assets/arena.css`, importmap-loaded three.js). This mode
> lives at `/fingerprint` and its bundle at `assets/arena/` (a subdirectory,
> not `assets/arena.css`) purely because that name was picked before the
> collision was noticed — a rename to `assets/fingerprint/` would remove the
> ambiguity if anyone finds it confusing.

## Data contract

`pipeline/build_arena.py` repacks committed assets into `assets/arena/`;
`pipeline/test_arena.py` gates every rebuild (27 gates). Nothing is computed
fresh — every byte traces to a committed asset:

| file | contents | size |
|------|----------|------|
| `core.json` | names, seasons, daily pool, honors, layout doc, quant drift | 83 KB |
| `rows.bin` | 34 B/row × 12,966: identity, map coords (u16), 12 skill grades, 8 archetype pulls | 431 KB |
| `emb_q8.bin` | int8-quantized 48-d MTNN v5 embeddings (lazy-loaded) | 608 KB |

First paint needs core.json + rows.bin (~514 KB, gzip less); emb_q8.bin
streams in the background and is only needed for the first guess.

## Mechanics (all stated, no hidden rules)

- **Daily**: everyone gets the same mystery. Selection is
  `assets/arena/daily.js` — weight-proportional draw from the pool, seeded by
  the UTC day number (epoch 2026-07-15 = #1). The Python mirror in
  test_arena.py pins the algorithm cross-language for 60 days; changing
  daily.js fails the gate.
- **Pool**: top 2,000 rows by `player_meta.json` puzzleWeight (minutes +
  All-Star/All-NBA + popularity blend), gp ≥ 40, ≤ 6 seasons per player.
- **Warmth**: cosine similarity to the mystery in the full 48-d space,
  reported as the share of all 12,966 seasons that sit farther away.
  Multi-season players are scored on their nearest season (stated in-app).
- **Feedback chips**: era arrow, position exact/adjacent, archetype-read
  match (MTNN head argmax).
- **Intel ladder**: miss 2 → decade; miss 3 → position; miss 4 → exact
  season; miss 5 → last-name initial + honors note.
- **Win** = naming the player (any season). 6 guesses. Streaks/stats in
  localStorage (`vh.arena.*`); practice mode is unlimited, labeled, and
  never touches daily state (GAMEPLAY.md M0 doctrine).
- **Rollover**: the board is frozen at load; a new day is offered as a
  chip, never a silent swap (A5).

## Honesty invariants

- Archetype "pull" bars are cosines to the 8 MTNN centroids
  (`mtnn_meta.json`), NOT the softmax head — the head is saturated (88%+ of
  rows > 0.99 top-1) and would draw a flat bar. The head argmax still
  decides the "model's read" label and the match chip. Agreement between
  the two drifts with each MTNN retrain (currently ~97.6%); the gate checks
  the rate stays >=90%, not a byte-exact match per row.
- Similarity runs on int8-quantized embeddings; measured drift vs f32 is
  written into core.json (`embed.maxCosDrift`, ~0.013) and gated < 0.02.
- Skill bytes must byte-match skills.json; map coords within one u16
  quantum of mtnn_map.json; both gated.
- The 14-dim game contract (vectors.json) is untouched; the arena is a
  read-only repack.

## Rebuild

```bash
python pipeline/build_arena.py   # after any skills/vectors/MTNN rebuild
python pipeline/test_arena.py    # 27 gates, exit 0 required
```

Both steps run inside `pipeline/update_dataset.py` (required), so the weekly
growth loop keeps the bundle in sync.
