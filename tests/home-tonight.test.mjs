// Landing "Tonight" strip: a postponed or cancelled game is never shown as a final score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { parse, chip, summarize } = require(path.join(here, '..', 'assets', 'home-tonight.js'));

// Shape of an ESPN scoreboard event, trimmed to the fields the strip reads.
function ev(state, completed, detail, date, away, home) {
  return {
    date,
    status: { type: { state, completed, shortDetail: detail } },
    competitions: [{ competitors: [
      { homeAway: 'home', score: home[1], team: { abbreviation: home[0] } },
      { homeAway: 'away', score: away[1], team: { abbreviation: away[0] } },
    ] }],
  };
}

const postponed = ev('post', false, 'Postponed', '2026-10-22T23:00Z', ['LAL', '0'], ['BOS', '0']);
const final = ev('post', true, 'Final', '2026-10-22T23:30Z', ['ATL', '132'], ['ORL', '125']);

test('postponed game shows ESPN status, no score, no Final', () => {
  const [g] = parse({ events: [postponed] });
  assert.equal(g.completed, false);
  const html = chip(g);
  assert.match(html, /Postponed/);
  assert.doesNotMatch(html, /Final/);
  assert.doesNotMatch(html, /0 &ndash; 0/);
});

test('completed game shows its final score', () => {
  const [g] = parse({ events: [final] });
  assert.match(chip(g), /ATL 132 &ndash; 125 ORL &middot; Final/);
});

test('postponed games are left out of the final count', () => {
  const s = summarize(parse({ events: [postponed, final] }), Date.parse('2026-10-23T03:00Z'));
  assert.match(s.text, /^1 game today is final/);
  assert.equal(s.label, 'Tonight');
});

test('an all-postponed slate claims no finals', () => {
  const s = summarize(parse({ events: [postponed] }), Date.parse('2026-10-23T03:00Z'));
  assert.doesNotMatch(s.text, /final/i);
});

test('last night is judged by the New York day', () => {
  // 02:00Z on the 23rd is 10 PM ET on the 22nd; at 14:00Z on the 23rd it is last night.
  const late = ev('post', true, 'Final', '2026-10-23T02:00Z', ['GS', '110'], ['LAL', '104']);
  assert.equal(summarize(parse({ events: [late] }), Date.parse('2026-10-23T14:00Z')).label, 'Last night');
  // 03:30Z on the 23rd is still the 22nd in New York: same night.
  assert.equal(summarize(parse({ events: [late] }), Date.parse('2026-10-23T03:30Z')).label, 'Tonight');
});
