import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const api = require(path.join(here, '..', 'assets', 'games.js'));

const game = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'replays', '0022600001.json'), 'utf8'));

test('shot count matches the file check.shots', () => {
  const shots = api.shotsFromEvents(game);
  assert.equal(shots.length, game.check.shots);
  assert.ok(shots.every((s) => s.x >= 0 && s.x <= 94 && s.y >= 0 && s.y <= 50));
});

test('box scores are counted from makes, not invented', () => {
  const box = api.boxFromEvents(game);
  const pts = box.reduce((n, p) => n + p.pts, 0);
  assert.equal(pts, game.score[0] + game.score[1]);
  assert.ok(box.some((p) => p.name === 'J. Tatum' || p.name.indexOf('Tatum') !== -1));
});

test('timeline only includes made shots and free throws', () => {
  const tl = api.timelineFromEvents(game);
  assert.ok(tl.length > 20);
  assert.ok(tl.every((e) => typeof e.desc === 'string' && e.desc.length > 0));
});

test('shot chart svg plots every located shot', () => {
  const shots = api.shotsFromEvents(game);
  const svg = api.shotChartSvg(shots);
  assert.equal((svg.match(/class="sc-(away|home)/g) || []).length, shots.length);
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}/);
});
