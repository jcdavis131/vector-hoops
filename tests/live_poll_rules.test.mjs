// live.js feed poll rules (live-feed-freshness Stage A1). live.js is a page script,
// so the marked feedPoll block is evaluated on its own, the same as live_phase.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../assets/live.js', import.meta.url), 'utf8');
const m = src.match(/\/\* feedPoll:begin[\s\S]*?\*\/([\s\S]*?)\/\* feedPoll:end \*\//);
assert.ok(m, 'feedPoll block markers missing in live.js');
const P = new Function(m[1] + '\nreturn {POLL,pollNext,pollBackoff,pollCadence,pollRefreshAllowed,pollOnVisible,tlAfter,boardTimerStart,boardTimerEnd};')();
const g = src.match(/\/\* gamePhase:begin[\s\S]*?\*\/([\s\S]*?)\/\* gamePhase:end \*\//);
assert.ok(g, 'gamePhase block markers missing in live.js');
const gamePhase = new Function(g[1] + '\nreturn gamePhase;')();

// The real summary fixture: its header gives the tip time and the status type.
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/espn_summary_401909834_q1.json', import.meta.url), 'utf8'));
const comp = fx.header.competitions[0];
const TIP = Date.parse(comp.date);
const MIN = 60000;
const phaseAs = state => gamePhase({ ...comp.status.type, state, completed: state === 'post' ? comp.status.type.completed : false }).phase;
const ok = (phase, nowMs, failStreak = 0) =>
  P.pollNext({ status: 200, parsed: true, rendered: true, phase, tipMs: TIP, nowMs, failStreak, r: 0.5 });
const inBand = (ms, base) => ms >= 0.8 * base - 1e-9 && ms <= 1.2 * base + 1e-9;

test('the fixture header gives a tip time and the in phase', () => {
  assert.ok(Number.isFinite(TIP), 'header.competitions[0].date parses');
  assert.equal(phaseAs('in'), 'in');
  assert.equal(gamePhase(comp.status.type).phase, 'post');
});

test('pollCadence follows the Component 1 table', () => {
  assert.equal(P.pollCadence(phaseAs('in'), TIP, TIP + 10 * MIN), 30000);
  assert.equal(P.pollCadence('pre', TIP, TIP - 10 * MIN), 300000);
  assert.equal(P.pollCadence('pre', TIP, TIP - 6 * MIN), 60000);
  assert.equal(P.pollCadence('pre', TIP, TIP - 4 * MIN), 60000);
  assert.equal(P.pollCadence('pre', NaN, TIP), 300000);
  assert.equal(P.pollCadence('pre', null, TIP), 300000);
  assert.equal(P.pollCadence('pre', undefined, TIP), 300000);
  assert.equal(P.pollCadence('', TIP, TIP), 300000);
  assert.equal(P.pollCadence('weird', TIP, TIP), 300000);
});

test('pollCadence before the 5-minute window waits until the window, at least 1 s, at most 300 s', () => {
  assert.equal(P.pollCadence('pre', TIP, TIP - 5 * MIN - 500), 1000);
  assert.equal(P.pollCadence('pre', TIP, TIP - 7 * MIN), 2 * MIN);
  assert.equal(P.pollCadence('pre', TIP, TIP - 60 * MIN), 300000);
});

test('defect 1: a pre answer and then an in answer give 60 s and 30 s, from the summary alone', () => {
  // pollNext takes no board input: the cadence comes from the phase in each summary.
  const a = ok(phaseAs('pre'), TIP - 4 * MIN);
  assert.deepEqual(a, { action: 'wait', reason: 'success', waitMs: 60000, failStreak: 0 });
  const b = ok(phaseAs('in'), TIP + MIN);
  assert.deepEqual(b, { action: 'wait', reason: 'success', waitMs: 30000, failStreak: 0 });
});

test('defect 2: post and off stop the poll with the reason final', () => {
  const post = gamePhase(comp.status.type).phase;
  assert.deepEqual(ok(post, TIP + 200 * MIN), { action: 'stop', reason: 'final', waitMs: 0, failStreak: 0 });
  const off = gamePhase({ state: 'post', completed: false, name: 'STATUS_POSTPONED', description: 'Postponed' }).phase;
  assert.equal(off, 'off');
  assert.deepEqual(ok(off, TIP), { action: 'stop', reason: 'final', waitMs: 0, failStreak: 0 });
});

test('defect 4: 429 and 403 stop the poll with the reason source, with any body', () => {
  for (const status of [429, 403]) {
    for (const parsed of [true, false]) {
      for (const rendered of [true, false]) {
        const nx = P.pollNext({ status, parsed, rendered, phase: '', tipMs: NaN, nowMs: TIP, failStreak: 2, r: 0.5 });
        assert.equal(nx.action, 'stop', `status ${status} parsed ${parsed}`);
        assert.equal(nx.reason, 'source');
        assert.equal(nx.waitMs, 0);
      }
    }
  }
});

test('failures wait a backoff: 500, 504, network error or timeout (0), 200 not JSON, render failure', () => {
  const cases = [
    { status: 500, parsed: true, rendered: false },
    { status: 504, parsed: true, rendered: false },
    { status: 0, parsed: true, rendered: false },
    { status: 200, parsed: false, rendered: false },
    { status: 200, parsed: true, rendered: false },
  ];
  for (const c of cases) {
    const nx = P.pollNext({ ...c, phase: '', tipMs: TIP, nowMs: TIP, failStreak: 0, r: 0.5 });
    assert.equal(nx.action, 'wait', JSON.stringify(c));
    assert.equal(nx.reason, 'failure');
    assert.equal(nx.failStreak, 1);
    assert.equal(nx.waitMs, 30000);
    const nx3 = P.pollNext({ ...c, phase: 'in', tipMs: TIP, nowMs: TIP, failStreak: 2, r: 0.5 });
    assert.equal(nx3.failStreak, 3);
    assert.equal(nx3.waitMs, 120000);
  }
});

test('a success after failures resets failStreak to 0', () => {
  assert.equal(ok(phaseAs('in'), TIP, 4).failStreak, 0);
});

test('pollBackoff: k = 1 to 6 stays inside 0.8 to 1.2 of 30, 60, 120, 240, 300, 300 s', () => {
  const base = [30000, 60000, 120000, 240000, 300000, 300000];
  for (let k = 1; k <= 6; k++) {
    for (const r of [0, 0.25, 0.5, 0.75, 1, Math.random()]) {
      const w = P.pollBackoff(k, r);
      assert.ok(inBand(w, base[k - 1]), `k=${k} r=${r} wait=${w}`);
    }
    assert.equal(P.pollBackoff(k, 0.5), base[k - 1]);
  }
});

test('defect 5: pollRefreshAllowed is false with a request in flight', () => {
  assert.equal(P.pollRefreshAllowed({ state: 'running', reason: '', inFlight: true, nowMs: TIP, lastReqAtMs: TIP - 10 * MIN }), false);
  assert.equal(P.pollRefreshAllowed({ state: 'stopped', reason: 'final', inFlight: true, nowMs: TIP, lastReqAtMs: TIP - 10 * MIN }), false);
});

test('pollRefreshAllowed in stopped(source): false within 60 s, true after 60 s', () => {
  const s = { state: 'stopped', reason: 'source', inFlight: false };
  assert.equal(P.pollRefreshAllowed({ ...s, nowMs: TIP + 59999, lastReqAtMs: TIP }), false);
  assert.equal(P.pollRefreshAllowed({ ...s, nowMs: TIP + 1000, lastReqAtMs: TIP }), false);
  assert.equal(P.pollRefreshAllowed({ ...s, nowMs: TIP + 60000, lastReqAtMs: TIP }), true);
  assert.equal(P.pollRefreshAllowed({ ...s, nowMs: TIP + 61000, lastReqAtMs: TIP }), true);
});

test('pollRefreshAllowed is true in the other cases', () => {
  assert.equal(P.pollRefreshAllowed({ state: 'running', reason: '', inFlight: false, nowMs: TIP, lastReqAtMs: TIP - 1000 }), true);
  assert.equal(P.pollRefreshAllowed({ state: 'stopped', reason: 'final', inFlight: false, nowMs: TIP, lastReqAtMs: TIP - 1000 }), true);
  assert.equal(P.pollRefreshAllowed({ state: 'running', reason: '', inFlight: false, nowMs: TIP, lastReqAtMs: null }), true);
});

test('defect 6: pollOnVisible gives request for running and none for stopped', () => {
  assert.equal(P.pollOnVisible('running'), 'request');
  assert.equal(P.pollOnVisible('stopped'), 'none');
});

test('defect 7: a shorter play list moves n and view inside the list', () => {
  assert.deepEqual(P.tlAfter({ n: 132, view: 131, live: true, newCount: 0 }, 131), { n: 131, view: 130, newCount: 0 });
  assert.deepEqual(P.tlAfter({ n: 132, view: 40, live: false, newCount: 3 }, 131), { n: 131, view: 40, newCount: 0 });
  assert.deepEqual(P.tlAfter({ n: 5, view: 4, live: false, newCount: 2 }, 0), { n: 0, view: 0, newCount: 0 });
  const t = P.tlAfter({ n: 132, view: 131, live: false, newCount: 0 }, 120);
  assert.ok(t.view >= 0 && t.view <= t.n - 1, 'view stays inside the list');
});

test('tlAfter keeps the rule for a longer list: live follows the end, rewound counts new plays', () => {
  assert.deepEqual(P.tlAfter({ n: 130, view: 129, live: true, newCount: 0 }, 132), { n: 132, view: 131, newCount: 0 });
  assert.deepEqual(P.tlAfter({ n: 130, view: 40, live: false, newCount: 1 }, 132), { n: 132, view: 40, newCount: 3 });
  assert.deepEqual(P.tlAfter({ n: 130, view: 40, live: false, newCount: 1 }, 130), { n: 130, view: 40, newCount: 1 });
});

test('defect 3: boardTimerStart and boardTimerEnd give the window for one and two pre games', () => {
  const one = [{ state: 'pre', date: comp.date }];
  assert.equal(P.boardTimerStart(one, TIP - 10 * MIN), TIP - 2 * MIN);
  assert.equal(P.boardTimerEnd(one), TIP + 180 * MIN);
  const two = [
    { state: 'post', date: '2026-10-21T20:00Z' },
    { state: 'pre', date: '2026-10-22T02:30Z' },
    { state: 'pre', date: comp.date },
    { state: 'in', date: '2026-10-21T22:00Z' },
  ];
  assert.equal(P.boardTimerStart(two, TIP - 10 * MIN), TIP - 2 * MIN);
  assert.equal(P.boardTimerEnd(two), Date.parse('2026-10-22T02:30Z') + 180 * MIN);
});

test('boardTimerStart and boardTimerEnd give null with no pre game', () => {
  const none = [{ state: 'post', date: comp.date }, { state: 'in', date: comp.date }];
  assert.equal(P.boardTimerStart(none, TIP), null);
  assert.equal(P.boardTimerEnd(none), null);
  assert.equal(P.boardTimerStart([], TIP), null);
  assert.equal(P.boardTimerEnd([]), null);
});

test('POLL holds the Component 1 constants', () => {
  assert.equal(P.POLL.live, 30000);
  assert.equal(P.POLL.preNear, 60000);
  assert.equal(P.POLL.preFar, 300000);
  assert.equal(P.POLL.failBase, 30000);
  assert.equal(P.POLL.failMax, 300000);
  assert.equal(P.POLL.timeout, 10000);
  assert.equal(P.POLL.refreshMin, 60000);
  assert.equal(P.POLL.near, 300000);
});
