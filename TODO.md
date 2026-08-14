# Agent TODO — vector-hoops
_LCG 20260813→189831298 idx3820 same-link-same-stars_
_Last sync: 2026-08-13 21:12 CT_

> QUICK START for Claude/Codex: Before editing: read TODO.md, claim lane by adding row to IN-PROGRESS and push branch `scout/<slug>`, work on branch, candidate.json first, eval must beat current, clear row when done.

## READY (pick me)
- [ ] hoops v6 transformer 150ep — d_model128 4-head CLS64-d 17 towers target composite 0.7937→0.85 top1 0.438→0.55 — branch `scout/hoops-v6-ready` (LOCAL-GPU primary, but non-GPU can do eval/front scaffolding)
- [ ] hoops front polish — pill strip sticky 40px ?pov= sync Single-select map clear prev Lighthouse PWA installability 100 — branch `scout/hoops-front-polish` (free lane, hoops-level parity)
- [ ] hoops MTNN game+difficulty — difficulty retune 61%→92.9% — branch `scout/hoops-mtnn-game` (free lane, candidate.json first)

## IN-PROGRESS (talk before touching — copied from master 10 active)
| Agent | Repo/Area | Since CT | What/Why | Branch | Status |
|---|---|---|---|---|---|
| LOCAL-GPU | vector-hoops / v6 transformer 150ep | 22:20 CT | MTNN v6 d_model128 4-head CLS→64-d 17 towers, w-vicreg 0.05, target composite 0.7937→0.85 test top1 0.438→0.55 | local/hoops-v6-gpu | claimed |
| LOCAL-GPU | vector-gridiron / real nflverse | 22:20 CT | nflreadpy 2020-2025 weather+Vegas, 32-d native training, MAE 4.268→3.8 | local/gridiron-real | claimed |
| LOCAL-GPU | vector-unified / unified G2 0.685→0.64 | 22:20 CT | FULL TRAIN: GRL λ0.3→0.5 + CORAL centroid, missing caches embedding_v3.npz / mtnn_best.pt / pitch_mtnn_embeddings.json, torch OOM workaround → run train_stage2.py --smoke -> train_unified.py 60ep -> eval_unified.py on local GPU | local/unified-g2-gpu | claimed |
| self-improvement-lane | self-improvement-loop | 2026-08-13 17:54 CDT | board poll diff 17→22 t-learning sweep SIGTERM OOMGuard 167s comp0.809 MAE 0.2313 vs 0.2085 → guard v1.1 :01 ultra 3 LOCAL-GPU exempt — auto-spawn after swarm DONE via ship-notes-after-swarm 127.0.0.1:8787 dm_dev_* ephemeral 90s | scout/ship-notes-auto-43665 | todo |
| frontend-lane | frontend-swarm-hoops-level-everywhere | 2026-08-13 17:54 CDT | Pill strip sticky 40px ?pov= sync Single-select map clear prev Lighthouse PWA installability 100 delight 29JS 9CSS confetti 80max — auto-spawn after swarm DONE via ship-notes-after-swarm 127.0.0.1:8787 dm_dev_* ephemeral 90s | scout/ship-notes-auto-43665 | todo |
| scout-cli-lane | scout-cli-universal-cli-any-harness-can-plug-in | 2026-08-13 17:54 CDT | bundles/cli.sh 770B v0.8.0 installer p95 55/48/52s hallway TLPG dedup same-link-same-stars doctor 7/7 PASS — auto-spawn after swarm DONE via ship-notes-after-swarm 127.0.0.1:8787 dm_dev_* ephemeral 90s | scout/ship-notes-auto-43665 | todo |
| vector-hub-lane | vector-models-5-game-hub-at-hoops-level-parity | 2026-08-13 17:54 CDT | 12966×64-d hoops 5323 gridiron real nflverse 2430 pitch 4831 equities 20719 unified 7/7/0 Proven 59 hashes LCG dailySeed — auto-spawn after swarm DONE via ship-notes-after-swarm 127.0.0.1:8787 dm_dev_* ephemeral 90s | scout/ship-notes-auto-43665 | todo |
| Infra-gap-Aug13 | dottie-closed-loop-factory-v2 / open vs closed infra Aug13 | 18:05 CT | Infra gap Aug13 evening-wrap: IBM+OpenAI enterprise AI consult+cyber 57 Agentic AI Foundation members + Skan AI $63M + Argonne CoLa efficient pretrain rhymes LCG bloom dedup + Reproducibility is New Copyleft 7 req bit-exact — open weight 3% behind frontier 50x cheaper 79% devs use open 51% ship open vs 63% closed — infra bottleneck pattern clear | scout/infra-gap-aug13 | claimed |
| Vercel-unified-final-Aug13 | vector-hub / unified 404→200 Aug13 | 18:05 CT | Vercel final Aug13 evening-wrap: hoops 200 LIVE 49243B HIT PWA v67 offline 13.6k CORE20 DENY9 unified still 404 needs one-click Production Domains link — last click to 100% Ship — everyday chain open link drag-map→Jordan copy-link same-stars | scout/vercel-final-aug13 | claimed |
| Top5-order-Aug13 | ship-ai-product-suite-live-launched-by-aug-31 / Top5 build order Aug13 | 18:05 CT | Top5 build order Aug13 evening-wrap tick+flags → vec+lattice v2 → analytics+trace+ops v2 → meter — hoops v6 150ep d_model128 4-head CLS64-d 17 towers target composite 0.7937→0.85 top1 0.438→0.55 / gridiron real nflverse 2020-2025 32-d MAE 4.268→3.8 / unified G2 20719x64-d LCG 189831298 idx3820 triple[11205,19448,14209] sport blind GRL0.3→0.5 CORAL centroid missing caches 3 restore → smoke 2ep → 60ep train → eval measured .642 experimental | scout/top5-aug13 | claimed |

## BLOCKED (local-GPU/OOM)
- LOCAL-GPU: vector-hoops / v6 transformer 150ep — 22:20 CT — MTNN v6 — branch `local/hoops-v6-gpu` — handoff: `vector-hoops/LOCAL_GPU_HANDOFF.md` — needs local GPU torch, Hatch VM CPU only

## DONE recent
| Agent | Repo / Area | Done CT | What / Why | Branch | Result |
|---|---|---|---|---|---|
| DONE-self-improvement-100 | self-improvement-loop / 70→100% closer | 18:05 CT 2026-08-13 | Self-improvement 70%→95%→100% closer board poll 17→22 seen 500-505 5 new hits 3 blocker jsonl + paired lessons 28 tight foundation v0.1.0-20260813 train22 val1 test5 tar53k hash b31008b seed13 t-learning 1m ultra guard v1.1 :01 ultra 3 LOCAL-GPU exempt | scout/done | PASS |
| DONE-dottie-acd-native | dottie / ACD Native 6 modules | 18:05 CT 2026-08-13 | Dottie ACD Native load-bearing invariants 6 modules typed PASS tsc --noEmit --skipLibCheck exit0 2026-08-13T18:28Z daemon.ts tunnel peer.ts version mux rpc + AgentConductorPanel 40px sticky nav thin UI — timeline triple-write 7-field dottie-acd-native | scout/done | PASS |

_zero-deps true — stdlib only, no pip/torch, ACNE optional local `dottie/rl/` canonical_
