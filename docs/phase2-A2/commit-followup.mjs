// commit-followup.mjs — second A2 commit (record PR #199 + CI status in the
// branch docs) through the GitHub API, same reason as commit-via-api.mjs:
// local git cannot write objects or refs in this sandbox.
// Usage: node docs/phase2-A2/commit-followup.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const REPO = 'jcdavis131/vector-hoops';
const PARENT = '0281a482ac30723e5a524fe902ac2fa4651bbaea';
const BASE_TREE = 'baf2a7fa9d11dbe5eccbfd5ba94565211baa322e';

const FILES = [
  'MANDALA.md',
  'docs/phase2-A2/notes.md',
  'docs/phase2-A2/commit-followup.mjs',
];

function gh(apiPath, body, method) {
  const r = spawnSync('gh', ['api', apiPath, '--method', method || 'POST', '--input', '-'], {
    input: JSON.stringify(body), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error('gh api ' + apiPath + ' failed: ' + (r.stderr || r.stdout || '').slice(0, 500));
  return JSON.parse(r.stdout);
}

const treeEntries = FILES.map((f) => {
  const buf = fs.readFileSync(path.join(root, f));
  const b = gh(`repos/${REPO}/git/blobs`, { content: buf.toString('base64'), encoding: 'base64' });
  console.log('blob ' + f + ' ' + b.sha);
  return { path: f, mode: '100644', type: 'blob', sha: b.sha };
});
const tree = gh(`repos/${REPO}/git/trees`, { base_tree: BASE_TREE, tree: treeEntries });
console.log('tree ' + tree.sha);
const commit = gh(`repos/${REPO}/git/commits`, {
  message: 'Wave A A2: record PR #199 + CI status in branch docs\n\nFollow-up to 0281a482 (created via the GitHub API). No code changes.',
  tree: tree.sha, parents: [PARENT],
});
console.log('commit ' + commit.sha);
const ref = gh(`repos/${REPO}/git/refs/heads/scout/phase2-A2-scroll`, { sha: commit.sha, force: false }, 'PATCH');
console.log('ref ' + ref.ref + ' -> ' + ref.object.sha);
console.log('DONE');
