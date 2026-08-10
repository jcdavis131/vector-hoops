# Posecode Basketball Moves — Vector Hoops

**Solo personal project, no connection to employer, built with public/free-tier only**

Hand-authored people animations from scratch in Posecode language.

## Official Posecode (MIT)
- GitHub: https://github.com/posecode-dev/posecode
- Parser: `posecode-parser` (pure TS, Zod, ROM-clamped IR)
- Renderer: `posecode-render` (Three.js 0.171, FK + ground-lock IK)
- Embed: `posecode-embed` — one tag `<posecode-player>` renders 60fps on-device
- Playground: https://www.posecode.org/play → https://www.posecode.org/play (live editor, share tokens)
- Library: https://www.posecode.org/moves/

Embed usage (production for Vector Hoops):
```html
<script src="https://unpkg.com/posecode-embed/dist/posecode-embed.js"></script>
<posecode-player src="assets/posecode/basketball/jump-shot.posecode" controls loop autoplay></posecode-player>
```

## Grammar we use
```
posecode exercise "Name"
  rig humanoid
  pose start = standing|neutral|...
  step "Phase" 0.45s ease-in-out:
    knees: flex 42
    hips: flex 28 + abduct 22
    shoulders: abduct 72
    shoulder_left: flex 42
    pelvis: hinge 28 | rotate-out 12
    ankles: dorsiflex 12 / plantarflex 26
    ground-lock: feet
    reach: hand_right -> ball
    travel: 0.24 0.12   // XZ meters
    turn: 12           // yaw deg
    cue "Coaching tip"
  repeat 1
```

Joints: neck head spine chest pelvis + plural hips/knees/ankles/shoulders/elbows/wrists + singular _left/_right, fingers. Actions: flex/extend, abduct/adduct, rotate-in/out, supinate/pronate, dorsiflex/plantarflex, hinge.

## ROM Safety (hard-clamped in parser)
- knee flex ≤144°, elbow flex ≤154°, shoulder flex ≤180°, abduct ≤180°, ankle dorsiflex ≤35° plantarflex ≤60°, hip flex ≤140°, etc. Our files stay inside safe.

## 8 NBA moves (assets/posecode/basketball/)

1. `jump-shot.posecode` — Gather 42°→84° coiled, dorsiflex 18°, explode plantarflex 26°, travel 0.12, release flex 34° wrist + 52° fingers. Archetype: Shooter/Scorer.
2. `crossover-dribble.posecode` — Low 68° knees, abduct 22°, pelvis rotate-out 14°, travel -0.18m crossover. Playmaker.
3. `defensive-shuffle.posecode` — Wide abduct 32° hips, 72° shoulders, turn ±8° lateral shuffle 0.44m. Rim Protector.
4. `layup.posecode` — Drive 0.28+0.22m, left flex 86° plant, right plantarflex 24°, soft touch. Driver.
5. `free-throw.posecode` — Routine bounce, set 96° elbows, release 156° shoulders. Shooter Ritual.
6. `box-out.posecode` — Hinge 28°→36°, abduct 38°, turn 88°. Big/Anchor.
7. `chest-pass.posecode` — 84° elbows → 8° punch, travel 0.14m. Floor General.
8. `celebration.posecode` — Crouch 52°, sky 168° abduct, 22° plantarflex pop. Win.

All authored from scratch, no copy, follow spec.

## Integration
- `player-animations.html` — gallery with <posecode-player> src= each file, source viewer, controls, mobile-responsive clamp(300px,60vw,380px), 56px touch.
- `play.html` #player-anim-card after reveal-card — dropdown selector + auto archetype mapping via MutationObserver on revealBody (keywords: shooter→jump-shot, playmaker→crossover, rim/defen→shuffle, rebound/big→box-out, etc.), celebration on win.
- Design: Okabe-Ito #0072B2/#D55E00, paper #FFFEF7 ink #1A150F, 2px ink border, safe-area.

## Why not diffusion
No GPU, deterministic, editable joint angles, cheap text. Parser warns + clamps.

Footer: Solo personal project, no connection to employer, built with public/free-tier only.
