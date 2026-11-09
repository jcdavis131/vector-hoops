// commit-via-api.mjs — create the A6 commit + branch + draft PR through the
// GitHub REST API (git-database API), because local git cannot write objects
// or refs in this sandbox (EPERM write block, fleet-wide since ~20:08 CST
// Nov 8 2026; recovery needs a runtime/VM restart).
// Reads worktree files, pipes JSON bodies to `gh api` (which owns auth);
// writes no files. Prints only SHAs/URLs, never credentials.
// Two file classes:
//   FILES — full content from this overlay worktree (the 6 changed files,
//     MANDALA.md, docs/phase2-A6/*).
//   TOKEN_BUMP — token-only re-stamps: read from the BASE worktree,
//     replace `site-nav.js?v=a16120da` with the new token in memory, upload.
//     Each file must contain exactly one old token before and zero after;
//     each root/public pair must produce identical blob SHAs.
// Usage: node docs/phase2-A6/commit-via-api.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const baseRoot = '/home/hatch/workspace/_worktrees/landing-map-viz';
const REPO = 'jcdavis131/vector-hoops';
const BASE_COMMIT = '010b1c2768341cf2025145358e5b29bdb2049f2c';
const BASE_TREE = '51791ad015669c8abba94aa00534b52322fd806d';
const BRANCH = 'scout/phase2-A6-shell';
const OLD_TOKEN = 'a16120da';
const NEW_TOKEN = '3facdff2';

const FILES = [
  'assets/site-nav.js',
  'assets/home-tonight.js',
  'index.html',
  'public/assets/site-nav.js',
  'public/assets/home-tonight.js',
  'public/index.html',
  'MANDALA.md',
  'docs/phase2-A6/serve.mjs',
  'docs/phase2-A6/a6-check.mjs',
  'docs/phase2-A6/t13-t15-harness.mjs',
  'docs/phase2-A6/commit-via-api.mjs',
  'docs/phase2-A6/notes.md',
];

// Root pages (other than index.html) that reference site-nav.js?v=<old>.
// Their public/ mirrors get the same substitution.
const TOKEN_PAGES = [
  '404.html', 'feed-health.html', 'guide.html', 'insights.html', 'live.html',
  'map-guess.html', 'methods.html', 'models/mtnn-v5.html', 'offline.html',
  'play/era-crossed.html', 'play.html', 'players.html', 'playoff-runs.html',
  'replay.html', 'research.html', 'schedule.html', 'status.html',
  'taxonomy.html', 'twenty-questions.html', 'twin-network.html',
];
const TOKEN_BUMP = TOKEN_PAGES.flatMap((p) => [p, 'public/' + p]);

function gh(apiPath, body, method) {
  const args = ['api', apiPath];
  if (method) args.push('--method', method);
  if (body !== undefined) args.push('--input', '-');
  const r = spawnSync('gh', args, {
    input: body === undefined ? undefined : JSON.stringify(body),
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error('gh api ' + apiPath + ' failed (exit ' + r.status + '): ' + (r.stderr || r.stdout || '').slice(0, 500));
  }
  return r.stdout ? JSON.parse(r.stdout) : null;
}

// Pre-flight: base head must still be 010b1c27; branch must not exist yet.
const baseRef = gh(`repos/${REPO}/git/refs/heads/scout/landing-map-viz`);
if (baseRef.object.sha !== BASE_COMMIT) {
  throw new Error('BASE MOVED: origin/scout/landing-map-viz is ' + baseRef.object.sha + ', expected ' + BASE_COMMIT + ' — STOP, do not ship.');
}
console.log('base head confirmed ' + BASE_COMMIT);
const exists = spawnSync('gh', ['api', `repos/${REPO}/git/refs/heads/${BRANCH}`], { encoding: 'utf8' });
if (exists.status === 0) throw new Error('branch ' + BRANCH + ' already exists on origin — STOP, do not re-create.');
console.log('branch ' + BRANCH + ' does not exist yet — proceeding');

const blobs = {};
for (const f of FILES) {
  const buf = fs.readFileSync(path.join(root, f));
  const b = gh(`repos/${REPO}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' }, 'POST');
  blobs[f] = b.sha;
  console.log('blob ' + f + ' ' + b.sha + ' (' + buf.length + ' bytes)');
}

const pairShas = {};
for (const f of TOKEN_BUMP) {
  const buf = fs.readFileSync(path.join(baseRoot, f));
  const text = buf.toString('utf8');
  const oldCount = text.split('site-nav.js?v=' + OLD_TOKEN).length - 1;
  if (oldCount !== 1) throw new Error('TOKEN_BUMP ' + f + ': expected exactly 1 old token, found ' + oldCount);
  const bumped = text.split('site-nav.js?v=' + OLD_TOKEN).join('site-nav.js?v=' + NEW_TOKEN);
  if (bumped.includes('site-nav.js?v=' + OLD_TOKEN)) throw new Error('TOKEN_BUMP ' + f + ': old token remains after substitution');
  const b = gh(`repos/${REPO}/git/blobs`, { content: Buffer.from(bumped, 'utf8').toString('base64'), encoding: 'base64' }, 'POST');
  blobs[f] = b.sha;
  console.log('blob(token) ' + f + ' ' + b.sha + ' (' + Buffer.byteLength(bumped) + ' bytes)');
  const base = f.startsWith('public/') ? f.slice(7) : f;
  if (pairShas[base] && pairShas[base] !== b.sha) throw new Error('mirror mismatch: ' + base + ' root/public blob SHAs differ');
  pairShas[base] = b.sha;
}
console.log('token bumps: ' + TOKEN_BUMP.length + ' files, ' + TOKEN_PAGES.length + ' root/public pairs identical');

const allFiles = [...FILES, ...TOKEN_BUMP];
const tree = gh(`repos/${REPO}/git/trees`, {
  base_tree: BASE_TREE,
  tree: allFiles.map((f) => ({ path: f, mode: '100644', type: 'blob', sha: blobs[f] })),
}, 'POST');
console.log('tree ' + tree.sha);

const commitMsg = `Wave A A6: drawer Close reachable by Tab; search focus ring; scoreboard stops after first failure

Playtest T15: opening the Explore drawer focused the first item, so forward
Tab could never reach Close (it sits before the item list in DOM order).
open() now focuses Close first; Tab walks Close -> Atlas ... -> Guide.
Playtest T16: the search input was the only stop of 56 with outline-style:
none (pale halo only). It now gets the same 2px solid red :focus-visible
outline as the other controls; the halo stays.
Playtest T13-retry: the Tonight strip retried the scoreboard on every page
load (2 failed requests per load) because neither fetcher remembered a
failure. loadTonight() and markLive() now set a sessionStorage flag on
failure and skip the fetch for the rest of the tab session — one attempt,
then silence. Success paths unchanged.

Landing-page scoped. No model files touched. No merges.
Tokens re-stamped (site-nav 3facdff2, home-tonight bdcf572a) incl. the
token-only pages that reference site-nav.js.
Budgets: gates 1+2 pass (28 pages); sync_public --check green (440 files);
stamp check lists only the 20 site-nav pages this commit re-stamps.
Tests: home-tonight 5/5; t13-t15 harness 12/12.
Mirror: root/public byte-identical.

Note: committed via the GitHub API because local git cannot write objects
or refs in this sandbox (EPERM write block, fleet-wide since ~20:08 CST
Nov 8 2026). Browser QA is still open — Chromium SIGTRAPs on launch in
this container; re-run docs/phase2-A6/a6-check.mjs after when the
environment recovers.`;

const commit = gh(`repos/${REPO}/git/commits`, {
  message: commitMsg, tree: tree.sha, parents: [BASE_COMMIT],
}, 'POST');
console.log('commit ' + commit.sha);

const ref = gh(`repos/${REPO}/git/refs`, { ref: 'refs/heads/' + BRANCH, sha: commit.sha }, 'POST');
console.log('ref ' + ref.ref + ' -> ' + ref.object.sha);

const prBody = `Wave A cluster A6 (shell) — landing page only, based on
\`scout/landing-map-viz\` (PR #196) @ \`010b1c27\`.

**Fixes (playtest 2026-11-08, triaged doc
\`docs/playtest-findings-20261108.md\`):**
- **T15** — drawer Close unreachable by forward Tab once open. \`open()\`
  now focuses Close first (fallback: first item); Tab walks
  Close → Atlas … → Guide. No DOM/CSS change.
- **T16** — search input's focus ring was a pale halo, not the standard
  2px red outline. It now gets the same
  \`2px solid var(--accent)\` \`:focus-visible\` outline as the other
  controls; the halo stays.
- **T13-retry** — Tonight strip retried the scoreboard on every page load
  (2 failed requests per load). Both fetchers (\`loadTonight\`,
  \`markLive\`) now remember a failure in sessionStorage and skip the
  fetch for the rest of the tab session. Success paths unchanged.

**Verified:** \`node --check\` on all edited JS; \`home-tonight\` tests 5/5;
new \`t13-t15\` stub harness 12/12 (open focuses Close; both fetchers
attempt once, then zero refetches in-session); budget gates 1+2 pass
(28 pages); \`sync_public --check\` green (440 files); root/public
byte-identical; asset tokens re-stamped (site-nav \`3facdff2\`,
home-tonight \`bdcf572a\`, incl. the 20 token-only pages).

**Open:** the browser after-run is blocked — Chromium SIGTRAPs on launch
in this container (env issue since ~02:15 CST). Re-run
\`node docs/phase2-A6/a6-check.mjs after 8477\` (serve on 8477 first)
when it recovers; repro notes in \`docs/phase2-A6/notes.md\`.

**Draft — do not merge.**`;

const pr = gh(`repos/${REPO}/pulls`, {
  title: 'Wave A A6: drawer Close reachable by Tab; search focus ring; scoreboard stops after first failure (T15, T16, T13-retry)',
  head: BRANCH,
  base: 'scout/landing-map-viz',
  draft: true,
  body: prBody,
}, 'POST');
console.log('PR #' + pr.number + ' ' + pr.html_url);
console.log('DONE');
