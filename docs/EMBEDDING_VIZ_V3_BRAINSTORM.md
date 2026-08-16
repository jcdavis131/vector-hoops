# Embedding Viz V3 Brainstorm — Starry Sky + Court

**Date:** 2026-07-15
**Problem:** city-intro v2 = Overpass live OSM fetch 720m, 180 extruded buildings, sessionStorage cache, first-load blank + rate-limit, 12966 faint white Points opacity 0.32 AdditiveBlending = busy unreadable, no archetype encoding, fans InstancedMesh 360/city expensive.
**Truth:** 12,966 seasons, 8 archetypes, CQS 66.29 best ep25, leakfree 0.977, mtnn_meta dim48 48-d L2.
**Design bar:** Sunni SCAD AAA >=7:1, 18px/1.65, Okabe-Ito triple (color+shape+label), mobile 44px touch, safe-area env(), reduced-motion, best-app-ever polish.

## Concept 1: Nebulae Archipelago Court — RECOMMENDED

**Idea:** Replace OSM live with prebaked chibi arenas + court ground. Embedding sky as 8 Okabe-Ito density nebulae (colored clouds via canvas radial gradient texture) + 12,966 points colored by archetype (not white), opacity 0.68, size by z, centroids as glowing orbs + label sprites paper bg ink text AAA, constellation as Voronoi/Delaunay edges 2NN with opacity 0.28. Interaction hover dims others. Click fly.

- **Ground:** Court plane #FFFEF7 with ink lines (#1A150F 2px), team-color center circle accent. Chibi arena: low cylinder 12-ribs primary color emissive 0.13 + secondary roof ring + 4 bleacher wedges low-poly. No OSM fetch, zero latency, deterministic.
- **Sky:** 
  - Compute 8 centroids avg xyz from vectors.json clusters.
  - For each cluster, build nebula Sprite texture 256x256 via canvas radial gradient Okabe color → transparent with noise blobs.
  - Points: BufferGeometry 12966, Float32 x,y,z mapped to sky dome az/el/r (same mapping as v2 but colored by Okabe[cluster] triple-encoded), sizeAttenuation true, size 1.6px + z*0.8, opacity 0.68, fog false, depthWrite false, blending Normal (not Additive) for readability.
  - Centroids: sphere 0.72r Okabe opaque 0.94 + halo 1.18r opacity 0.20 Additive + pointLight 0.8.
  - Lines: 2 nearest neighbors in xyz per centroid, LineBasic opacity 0.28.
  - Labels: CanvasTexture sprite paper #FFFEF7 ink #111 border 2px, font 18px mono bold, AAA 17.9:1.
- **Perf:** No fetch, starfield once, InstancedMesh fans removed (or 60 max low-poly dots), draw calls ~8 (ground+court+arena+roof+nebulaSprites+points+centroids+lines). Works offline, free-tier only.
- **Pros:** Instant load, AAA, Okabe triple clear, not busy (colored clouds provide density cue, white stars confusion removed), production-hardened, mobile-friendly, tells story: clouds = archetype density, dots = seasons colored, bright = centroid.
- **Cons:** No real OSM buildings (but previous was flaky). Need to explain stylized court in legend.
- **Sunni critique:** Pass AAA paper #FFFEF7 ink #1A150F 17.9:1, centroid labels 18px/1.65 monospace, Okabe dots triple dot+color+label, touch 44px pills, safe-area padding, reduced-motion disables twirl + nebula pulse.

## Concept 2: Drift Timeline Terrain

**Idea:** Ground = stacked court planks as timeline 1996→2026, each plank z = season. Embedding projected onto ground as heightmap. Sky = nebulae still. Too complex, breaks city tour metaphor (30 teams vs timeline).

- Pros: shows drift research.
- Cons: loses city flyover viral hook, confusing, heavy geometry, not engaging for landing.

## Concept 3: Prebaked City Blocks Archive

**Idea:** Keep OSM but prebake to assets/osm/ JSON cache at build time, avoid live fetch latency. Still buildings extruded but offline.

- Pros: Keeps real buildings promise.
- Cons: 30 cities * ~180 buildings * polygons = 5400 polygons ~3-5MB JSON, still busy visually, doesn't fix embedding sky busy. Needs build step, cache invalidation. Not more engaging.

## Recommendation: Concept 1 Nebulae Archipelago Court

**Rationale:** Solves both problems (latency + busy sky) with one narrative: "Each cluster is an island of playstyle floating above a chibi NBA world." Chibi court grounds it, colored nebulae give density without clutter, points colored by archetype gives instant triple-encoding. Viral: share ?team=CHI view + gold ring highlight for searched season.

**Implementation Checklist V3:**
- [ ] assets/embedding-nebula.js: export function computeCentroids(players), buildNebulaTexture(color), buildSkyGeometry(players, centroids) → {pointsGeo, centroids[], linesGeo, nebulaSprites[]}
- [ ] city-intro.js v3: REMOVE overpass fetch, sessionStorage, osmMemCache, cityBuildToken race. Keep ARENAS lat/lng for badge only but not for fetch. City = ground plane #FFFEF7 + court lines + chibi arena. Sky = import from embedding-nebula. Legend updated. Attribution "Stylized court · 12,966 seasons · prebaked".
- [ ] arena-page.js v3: full controls sky toggles, city toggles, search highlight gold ring, share ?team=xxx, random, reduced-motion.
- [ ] city-intro.css + arena.css: legend 8 dots Okabe + labels hint "Colored clouds = archetype density · Dots = 12,966 seasons colored by archetype · Bright = centroid", AAA, responsive 2-col mobile.
- [ ] Perf: starfield once, fans optional 60 low, no InstancedMesh per-city fans 360.
- [ ] Truth: footer solo disclaimer, CQS 66.29, leakfree 0.977, 12,966/8 modes, no OSM attribution needed (replace).
- [ ] Lazy-load via IntersectionObserver retained, prefers-reduced-motion disables twirl.
- [ ] Commit push verify ETag HIT.

**Solo personal project, no connection to employer, built with public/free-tier only**
