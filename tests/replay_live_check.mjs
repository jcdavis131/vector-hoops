// Pixel Replay embedded on the live page: runs assets/replay.js with data-mode="embed"
// against the harness stubs, feeds it a game built by assets/replay-espn.js from a real
// (trimmed) ESPN summary, and checks live-follow and rewind. Prints one JSON report.
//
//   node tests/replay_live_check.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { makeContext, flush, ROOT } from './replay_harness.mjs';

const require = createRequire(import.meta.url);
const ESPN = require(path.join(ROOT, 'assets', 'replay-espn.js'));
const summary = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'espn_summary_401909834_q1.json'), 'utf8'));

const errors = [], report = {};
const H = makeContext('espn', false, true);
H.canvas.dataset.mode = 'embed';
try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets', 'replay.js'), 'utf8'), H.sandbox, { filename: 'replay.js' }); } catch (e) { errors.push('boot: ' + e.message); }
const PR = H.sandbox.window.PixelReplay;
let lastCb = H.raf.cb;
function frames(n, ms = 16.7) {
  for (let k = 0; k < n; k++) {
    H.clock.now += ms; const cb = H.raf.cb || lastCb; H.raf.cb = null; lastCb = cb;
    try { cb(H.clock.now); } catch (e) { errors.push('frame: ' + e.message); return; }
  }
}
await flush();
report.embedSkipsGameList = !H.ids.rpGames || H.ids.rpGames.children.length === 0;

// a live game: the first 60 plays, as if the poll had just returned them
const live = JSON.parse(JSON.stringify(summary));
live.header.competitions[0].status.type = { state: 'in', completed: false };
live.plays = summary.plays.slice(0, 60);
const g1 = ESPN.toGame(live, '401909834');
PR.setGame(g1, { live: true });
frames(5);
report.followingAtLoad = PR.state.live === true && PR.state.playing === true;
const n1 = g1.events.length;
frames(60 * 30); // 30 s of wall time: it should reach the newest play and hold there, still live
const held1 = PR.state.t;
frames(60 * 5);
report.holdsAtHead = PR.state.live && Math.abs(PR.state.t - held1) < 1e-6;

// the next poll brings 40 more plays: it keeps its place, then plays on toward the new head
const more = JSON.parse(JSON.stringify(live)); more.plays = summary.plays.slice(0, 100);
const g2 = ESPN.toGame(more, '401909834');
PR.setGame(g2, { keep: true });
report.keptPlace = Math.abs(PR.state.t - held1) < 0.01;
frames(60 * 10);
report.advancesAfterPoll = PR.state.t > held1 + 5;
report.catchUpRate = +((PR.state.t - held1) / 10).toFixed(2); // replay seconds per wall second while behind

// the live page's scrubber rewinds to play 20: the replay holds there and leaves live
PR.seekEvent(20); frames(30);
report.rewindLeavesLive = PR.state.live === false && PR.state.playing === false;
PR.goLive(); frames(10);
report.backToLive = PR.state.live === true;
// the game goes final while followed: once its last play has run it stops being live
const fin = JSON.parse(JSON.stringify(summary)); fin.plays = summary.plays.slice(0, 100);
fin.header.competitions[0].status.type = { state: 'post', completed: true };
PR.setGame(ESPN.toGame(fin, '401909834'), { keep: true });
frames(60 * 20);
report.finalEndsLive = PR.state.live === false && PR.state.playing === false;

// a malformed poll (a turnover with no team, which buildFrames cannot place) must not stop the loop
PR.goLive(); frames(10);
const bad = JSON.parse(JSON.stringify(more)); bad.plays = summary.plays.slice(0, 101);
bad.plays[100] = Object.assign({}, bad.plays[100], { type: { id: '62', text: 'Bad Pass Turnover' }, text: 'team bad pass turnover', team: undefined, shootingPlay: false });
const gBad = ESPN.toGame(bad, '401909834');
report.teamlessTurnoverIsOther = gBad.types[gBad.events[gBad.events.length - 1][2]] === 'other';
gBad.events[gBad.events.length - 1][2] = gBad.types.indexOf('turnover'); // force the old failure past the adapter
const t0 = PR.state.t; let threw = false;
try { PR.setGame(gBad, { keep: true }); } catch (e) { threw = true; }
const errsBefore = errors.length; frames(60 * 3);
report.badPollKeepsLoop = errors.length === errsBefore && PR.state.t > t0 && (threw ? PR.game().events.length === g2.events.length : true);
report.events = [n1, g2.events.length];
report.errors = errors;
report.ok = !errors.length && ['embedSkipsGameList', 'followingAtLoad', 'holdsAtHead', 'keptPlace', 'advancesAfterPoll', 'rewindLeavesLive', 'backToLive', 'finalEndsLive', 'teamlessTurnoverIsOther', 'badPollKeepsLoop'].every((k) => report[k]);
process.stdout.write(JSON.stringify(report, null, 1) + '\n');
process.exit(report.ok ? 0 : 1);
