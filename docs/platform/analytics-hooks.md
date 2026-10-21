# Analytics hooks — what gets used, what doesn't, and what's private by construction

Owner: Pillar 7 (platform plumbing). Last reviewed: 2026-10-20.

## The one call site

`assets/vh-analytics.js` exposes the only analytics interface the product may use:
`VHAnalytics.track(event, props)`. Pages load it as a normal external script; game and
nav modules call it behind `if (window.VHAnalytics)` guards so a blocked or missing
script never breaks the product.

## Backend status: none — and that's the privacy story

`track()` is currently a **no-op that buffers the last 200 events in memory** (per page
load, never persisted, never sent). No backend has been chosen; the facade's own header
says: *"Do NOT wire a backend here; call VHAnalytics.configure({send: fn}) from the
chosen backend's snippet."* Until that decision (his pick), **no analytics data leaves
the visitor's browser, period.** There is nothing to opt out of because nothing is collected.

When a backend is chosen, this doc must be updated with: where data lands, retention,
and the opt-out. Until then, treat any claim of "we track X" as false.

## Events (each answers one named owner question — no vanity events)

| Event | Props | Fired from | Owner question | Status |
|---|---|---|---|---|
| `visit` | `{path, ref}` — path is `location.pathname`; `ref` is only the `?ref=` query param the site itself sets (e.g. `ref=share`), **not** the full referrer | `assets/site-nav.js` (nav mount, `data-mounted` guards double-fire) | Which inbound refs actually bring returning players? | wired |
| `game_completed` | `{won, guesses, slot, mode, dayKey}` — no player identity | `assets/play-engine.js` (Daily Court completion) | Is difficulty in the productive zone — do solve rates by slot justify 6 guesses? | wired |
| `streak_day` | `{dayKey, streak, result}` — streak state already in the player's own localStorage | `assets/past-modern-game.js` | Does a protected streak bring the player back tomorrow? | wired |
| `share_tapped` | `{mode}` | — | What fraction of completed games produce a share tap? | defined, **not wired** |
| `share_confirmed` | `{method, mode}` — verified shares only, not taps | — | Do verified shares drive `ref=share` visits? | defined, **not wired** |

## What is deliberately NOT collected

- No identity: no login, no user id, no fingerprinting, no cross-session id.
- No full referrer URLs, no query strings beyond the site's own `ref` param.
- No keystrokes, no guess contents, no mouse tracking, no scroll depth.
- Streak/game state lives in the player's `localStorage` and stays there.
- Third parties on the page: none. No ad tags, no social pixels, no external analytics
  snippet. The only external network call the site makes is the ESPN scoreboard fetch
  for live scores (see CSP audit) — ESPN sees a request, not a user.

## Feeding it back to the roadmap

When the backend lands, the loop is: events → weekly rollup (which the cron that
refreshes `/status` can also publish) → roadmap input. The five events above were chosen
by the launch panel precisely because each one names the product decision it would
change; adding an event requires writing its owner question here first.

## Constraints for any future backend

1. Privacy-respecting by default: aggregate counts, no per-user trails.
2. Same-origin or first-party only — no third-party analytics domain.
3. The `track()` contract doesn't change: backend swaps under `configure({send})`,
   call sites stay untouched.
4. This doc gets a "Backend" section with data location + retention + opt-out
   before the first byte is sent. No doc update, no backend.
