// commit-via-api.mjs — create the A2 commit + branch + draft PR through the
// GitHub REST API (git-database API), because local git cannot write objects
// or refs in this sandbox (EPERM write block, fleet-wide since ~20:08 CST
// Nov 8 2026; recovery needs a runtime/VM restart).
// Reads worktree files, pipes JSON bodies to `gh api` (which owns auth);
// writes no files. Prints only SHAs/URLs, never credentials.
// Usage: node docs/phase2-A2/commit-via-api.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const REPO = 'jcdavis131/vector-hoops';
const BASE_COMMIT = '010b1c2768341cf2025145358e5b29bdb2049f2c';
const BASE_TREE = '51791ad015669c8abba94aa00534b52322fd806d';
const BRANCH = 'scout/phase2-A2-scroll';

const FILES = [
  'assets/atlas-3d.js',
  'assets/home-tonight.js',
  'index.html',
  'public/assets/atlas-3d.js',
  'public/assets/home-tonight.js',
  'public/index.html',
  'MANDALA.md',
  'docs/phase2-A2/serve.mjs',
  'docs/phase2-A2/a2-check.mjs',
  'docs/phase2-A2/commit-via-api.mjs',
  'docs/phase2-A2/notes.md',
  'docs/phase2-A2/screenshots/before-t2-desktop.png',
  'docs/phase2-A2/screenshots/before-t3-desktop.png',
];

function gh(apiPath, body) {
  const args = ['api', apiPath, '--method', 'POST', '--input', '-'];
  const r = spawnSync('gh', args, {
    input: JSON.stringify(body), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error('gh api ' + apiPath + ' failed (exit ' + r.status + '): ' + (r.stderr || r.stdout || '').slice(0, 500));
  }
  return JSON.parse(r.stdout);
}

const blobs = {};
for (const f of FILES) {
  const buf = fs.readFileSync(path.join(root, f));
  const b = gh(`repos/${REPO}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
  blobs[f] = b.sha;
  console.log('blob ' + f + ' ' + b.sha + ' (' + buf.length + ' bytes)');
}

const tree = gh(`repos/${REPO}/git/trees`, {
  base_tree: BASE_TREE,
  tree: FILES.map((f) => ({ path: f, mode: '100644', type: 'blob', sha: blobs[f] })),
});
console.log('tree ' + tree.sha);

const commitMsg = `Wave A A2: chip/search scroll lands on the peers; back restores search text

Playtest T2: a guided chip click reloaded the page to the top and left the
twin list ~2,200 px below the fold. A chip click now scrolls the readout
card (selected season + peers table) into view — via a session flag on the
cold (navigation) path and in place on the warm (applyView) path.
Playtest T3: a search pick scrolled only to the map canvas, leaving the
readout + peers below the fold. The hero-search pick now scrolls the
readout card into view (shared VHAtlas.scrollToSelection helper).
Playtest T12: browser back lost the typed search text. The input is now
saved to sessionStorage on input/pick and restored at init + on pageshow.

Landing-page scoped. No model files touched. No merges.
Budgets: all gates pass (28 pages). Tests: home-tonight 5/5.
Mirror: root/public byte-identical (sync_public --check green).
Tokens re-stamped (atlas-3d ff235a3a, home-tonight 11f7b4cc).

Note: committed via the GitHub API because local git cannot write objects
or refs in this sandbox (EPERM write block, fleet-wide since ~20:08 CST
Nov 8 2026). After-run browser QA is still open — Chromium SIGTRAPs on
launch in this container; re-run docs/phase2-A2/a2-check.mjs after
when the environment recovers.`;

const commit = gh(`repos/${REPO}/git/commits`, {
  message: commitMsg, tree: tree.sha, parents: [BASE_COMMIT],
});
console.log('commit ' + commit.sha);

const ref = gh(`repos/${REPO}/git/refs`, { ref: 'refs/heads/' + BRANCH, sha: commit.sha });
console.log('ref ' + ref.ref + ' -> ' + ref.object.sha);

const prBody = `Wave A cluster A2 (navigation + scroll) — landing page only, based on
\`scout/landing-map-viz\` (PR #196) @ \`010b1c27\`.

**Fixes (playtest 2026-11-08, triaged doc
\`docs/playtest-findings-20261108.md\`):**
- **T2** — chip click reloaded to the top; twin list ~2,200 px below. Now the
  readout card (selected season + peers) scrolls into view: session flag on
  the cold navigation path, in-place scroll on the warm \`applyView\` path.
- **T3** — search pick scrolled only to the map canvas. The hero-search pick
  now scrolls the readout card into view (shared \`VHAtlas.scrollToSelection\`).
- **T12** — browser back lost the typed search text. Saved to sessionStorage
  on input/pick; restored at init + on \`pageshow\`.

**Before (base, 1280×800):** T2 scrollY 1573 → 0, readout top y 2135;
T3 scrollY 1151, readout top y 984 / peers top y 1045 (below fold).
Peers verified correct on both paths.

**Verified:** \`node --check\` on all edited JS; \`home-tonight\` tests 5/5;
\`budget_check.py\` all gates pass (28 pages); root/public byte-identical;
asset tokens re-stamped.

**Open:** the after-run browser QA is blocked — Chromium SIGTRAPs on launch
in this container (env issue since ~02:15 CST). Re-run
\`docs/phase2-A2/a2-check.mjs after\` when it recovers; repro notes in
\`docs/phase2-A2/notes.md\`.

**Draft — do not merge.**`;

const pr = gh(`repos/${REPO}/pulls`, {
  title: 'Wave A A2: chip/search scroll lands on the peers; back restores search text (T2, T3, T12)',
  head: BRANCH,
  base: 'scout/landing-map-viz',
  draft: true,
  body: prBody,
});
console.log('PR #' + pr.number + ' ' + pr.html_url);
console.log('DONE');
