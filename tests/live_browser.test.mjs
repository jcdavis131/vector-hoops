// Browser test for the /live poll rules that live OUTSIDE the pure feedPoll block
// (live-feed-freshness Stage A1): the fetch timeout, the late-response drop, the hidden
// tab, the Refresh limit, a 429 on the board, and the feed card. tests/live_poll_rules.test.mjs
// covers only the pure block (assets/live.js between "feedPoll:begin" and "feedPoll:end");
// the wiring around it is here. It also holds the game-switch cases (a failed load of game B
// shows nothing of game A) and the score-tick cases, which pass `raf: true` to `open()` so the
// fake clock drives real animation frames; every other case stubs requestAnimationFrame.
//
// Transport. live.html is served from a loopback http.server started and stopped inside
// this file. site.api.espn.com is answered by route handlers; every other host is aborted.
// The scoreboard and summary bodies are MOCKED TRANSPORT RESPONSES, not data: they are built
// from the header, boxscore and plays of the committed summary fixture
// (tests/fixtures/espn_summary_401909834_q1.json); the scoreboard event and the second game
// (same two teams, home and away swapped, a different id) are mock scaffolding around that header.
// Time is Playwright's fake clock, installed and then PAUSED before the page loads, so it moves
// only when a case moves it and real waits never count as fake time. S.run() moves it in steps of
// at most 5 s and, after each step, waits until the page has no fetch it could still answer
// (so a mocked reply is never overtaken by the page's own 10 s abort). VH_REPLY_DELAY_MS=<n>
// delays every mocked reply by n ms of real time to show that.
//
// Skips itself (exit 0, with the reason) when Playwright or its browser cannot be used,
// unless HOOPS_REQUIRE_BROWSER=1, which turns the skip into a failure. VH_LIVE_JS=<file>
// serves that file in place of assets/live.js (the mutation check uses it).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REQUIRE = process.env.HOOPS_REQUIRE_BROWSER === '1';
const DELAY = Number(process.env.VH_REPLY_DELAY_MS || 0);
const LIVE_JS = process.env.VH_LIVE_JS ? fs.readFileSync(process.env.VH_LIVE_JS, 'utf8') : null;
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/espn_summary_401909834_q1.json', import.meta.url), 'utf8'));

// ---- skip or fail when there is no browser ----
let chromium = null, browser = null, skipReason = '';
try {
  chromium = createRequire(import.meta.url)('playwright').chromium;
  browser = await chromium.launch();
} catch (e) {
  skipReason = 'Playwright or its Chromium is not usable here: ' + String(e.message).split('\n')[0];
  if (REQUIRE) throw new Error('HOOPS_REQUIRE_BROWSER=1 but ' + skipReason);
}
if (skipReason) console.log('SKIP live_browser: ' + skipReason);
const T = (name, fn) => test(name, { skip: skipReason || false }, fn);

// ---- loopback server on a free port ----
let server = null, base = '';
async function startServer() {
  const port = await new Promise((res, rej) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT],
    { stdio: 'ignore', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  server.on('error', e => { throw new Error('could not start python3 -m http.server: ' + e.message); });
  process.on('exit', () => { try { server.kill('SIGKILL'); } catch (e) { /* gone */ } });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(1));
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/live.html', { method: 'HEAD' })).ok) return; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('http.server did not come up on ' + base);
}
if (!skipReason) {
  await startServer();
  test.after(async () => { server.kill(); await browser.close(); });
}

// ---- mocked transport, built from the fixture header ----
const comp = fx.header.competitions[0];
const TIP = Date.parse(comp.date);
const MIN = 60000;
const SEC = 1000;
const side = ha => comp.competitors.find(c => c.homeAway === ha).team.abbreviation;
const NAMES = { [side('home')]: 'Home', [side('away')]: 'Away' };
const ID_A = '401909834', ID_B = '900000002';   // B is a mock id, not an ESPN event
function event(id, state, swap) {
  const [hAb, aAb] = swap ? [side('away'), side('home')] : [side('home'), side('away')];
  const tm = ab => ({ abbreviation: ab, displayName: NAMES[ab], color: '123456' });
  return {
    id, date: comp.date,
    status: { type: { state, shortDetail: state === 'in' ? 'Q1 4:00' : state === 'pre' ? 'Tip soon' : 'Final', completed: state === 'post' } },
    competitions: [{ status: { displayClock: '4:00', period: 1 }, competitors: [
      { homeAway: 'home', team: tm(hAb), score: '33' }, { homeAway: 'away', team: tm(aAb), score: '28' }] }],
  };
}
const board = (...evs) => ({ events: evs });
const IN_TYPE = { ...comp.status.type, name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: 'Q1', shortDetail: 'Q1' };
function summary(nPlays, live = true) {
  const h = JSON.parse(JSON.stringify(fx.header));
  if (live) h.competitions[0].status.type = IN_TYPE;
  return { header: h, boxscore: fx.boxscore, plays: fx.plays.slice(0, nPlays) };
}
const LAST = n => fx.plays[n - 1];

// ---- one page per scenario ----
const ESPN = 'site.api.espn.com';
async function open(t, { boardReply, summaryReply, startMs = TIP + 30 * MIN, raf = false }) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const held = [];                 // routes the scenario chose never to answer yet
  const reqs = [];                 // every ESPN request: {kind, id}
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  // A held request the page itself ends (its 10 s abort) is no longer one the page waits on.
  page.on('requestfailed', r => { const i = held.findIndex(h => h.route.request() === r); if (i >= 0) held.splice(i, 1); });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === ESPN) {
      const sum = u.pathname.endsWith('/summary');
      const rec = { kind: sum ? 'summary' : 'board', id: sum ? u.searchParams.get('event') : null };
      reqs.push(rec);
      const reply = sum ? summaryReply : boardReply;
      const r = reply ? await reply(rec, route) : { status: 200, body: {} };
      if (r === 'aborted') return;        // the reply aborted the request itself: the page's own fetch counter ends it
      if (r === 'hold') { held.push({ rec, route }); return; }
      if (DELAY) await new Promise(res => setTimeout(res, DELAY));
      return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body ?? {}) }).catch(() => {});
    }
    if (u.hostname !== '127.0.0.1') return route.abort();
    if (LIVE_JS !== null && u.pathname === '/assets/live.js') {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: LIVE_JS });
    }
    return route.continue();
  });
  await page.clock.install({ time: startMs });
  await page.clock.pauseAt(startMs + 1000);          // paused: only S.run() moves it from here on
  // The 3-D plates run a requestAnimationFrame loop; 10 fake minutes of it is 36,000 frames of
  // WebGL work and never finishes. The poll rules do not use animation frames.
  // Counters: fetches the page has started and not yet finished (headers), and body reads
  // (Response.json) not yet finished. They tell S.settle() when the page has nothing left to
  // receive, so the fake clock is never moved while a reply is on its way.
  await page.addInitScript(RAF => {
    if (!RAF) window.requestAnimationFrame = () => 0;
    window.__net = { fetching: 0, json: 0 };
    const f = window.fetch;
    window.fetch = (...a) => { window.__net.fetching++; return f.apply(window, a).finally(() => { window.__net.fetching--; }); };
    const j = Response.prototype.json;
    Response.prototype.json = function () { window.__net.json++; return j.call(this).finally(() => { window.__net.json--; }); };
  }, raf);
  await page.goto(base + '/live.html', { waitUntil: 'load' });
  const S = {
    page, reqs, held, errors,
    count: kind => reqs.filter(r => !kind || r.kind === kind).length,
    mark: () => reqs.length = 0,
    // Wait (real time) until every fetch the page has started is answered, or is one the
    // scenario holds; then let the page's promise chains run.
    settle: async () => {
      const end = Date.now() + 5000;
      for (;;) {
        const n = await page.evaluate(() => window.__net.fetching + window.__net.json * 1000);
        if (n < 1000 && n <= held.length) break;
        if (Date.now() > end) throw new Error('the page still has a fetch in flight after 5 s of real time');
        await new Promise(r => setTimeout(r, 5));
      }
      await page.evaluate(() => 0);
    },
    // Move the fake clock `ms`, in steps of at most 5 s, settling after each step. Stops early
    // (and returns true) once `until()` holds.
    run: async (ms, until) => {
      for (let left = ms; left > 0;) {
        const step = Math.min(left, 5 * SEC);
        await page.clock.runFor(step);
        left -= step;
        await S.settle();
        if (until && until()) return true;
      }
      return false;
    },
    card: async () => ({
      hidden: await page.$eval('#feedcard', e => e.hidden),
      text: await page.$eval('#feedcard', e => e.textContent),
    }),
    hide: async hidden => {
      await page.evaluate(h => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
      await S.settle();
    },
    refresh: async () => { await page.click('#refreshBtn'); await S.settle(); },
    // answer a held request by hand
    answer: async (status, body) => {
      const [{ route }] = S.held.splice(0, 1);
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body ?? {}) });
      await S.settle();
    },
    done: () => assert.deepEqual(errors, [], 'the page raised no uncaught error'),
    release: async () => { for (const h of S.held.splice(0)) await h.route.abort().catch(() => {}); },
  };
  t.after(async () => { await S.release(); await ctx.close(); });
  await S.settle();
  return S;
}
const ok = (kind, n) => async () => kind === 'board' ? { status: 200, body: board(event(ID_A, 'in')) } : { status: 200, body: summary(n) };

// ---------------------------------------------------------------------------------------------
// Every case ends by asserting the page raised no uncaught error (S.done), so a broken script
// cannot hide behind a count.
T('summary never answers: the card says timeout only after 10 s', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => 'hold' });
  assert.equal(S.count('summary'), 1, 'the first summary request was sent');
  await S.run(9 * SEC);
  assert.equal((await S.card()).hidden, true, 'nothing reported at 9 s');
  await S.run(1500);
  const c = await S.card();
  assert.equal(c.hidden, false);
  assert.match(c.text, /timeout/);
  assert.match(c.text, /FEED UNREACHABLE\./);
  S.done();
});

// What was PAINTED is what the page announces on courtside:render (live.js, end of renderAll);
// window._lastD is written after the paint, so it cannot show a paint that was later overwritten.
const watchRenders = S => S.page.evaluate(() => {
  window.__renders = [];
  window.addEventListener('courtside:render', e => window.__renders.push(e.detail.d.plays.length));
});
const renders = S => S.page.evaluate(() => window.__renders);

T('a late answer for game A, after game B is picked, does not paint A', async t => {
  const first = {};
  const S = await open(t, {
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'in'), event(ID_B, 'in', true)) }),
    summaryReply: async rec => rec.id === ID_A && !first.a ? ((first.a = true), 'hold') : { status: 200, body: summary(rec.id === ID_B ? 90 : 40) },
  });
  assert.equal(S.held.length, 1, 'game A (auto-picked) is waiting on its summary');
  await watchRenders(S);
  await S.page.click('.gbtn >> nth=1');           // pick game B
  await S.settle();
  assert.deepEqual(await renders(S), [90], 'B painted');
  await S.answer(200, summary(40));
  assert.deepEqual(await renders(S), [90], 'A\'s late answer was not painted over B');
  assert.equal(await S.page.evaluate(() => window._lastD.plays.length), 90, 'and did not replace B\'s data');
  S.done();
});

T('a late FAILURE for game A, after game B is picked, shows no card on B', async t => {
  const first = {};
  const S = await open(t, {
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'in'), event(ID_B, 'in', true)) }),
    summaryReply: async rec => rec.id === ID_A && !first.a ? ((first.a = true), 'hold') : { status: 200, body: summary(90) },
  });
  await S.page.click('.gbtn >> nth=1');
  await S.settle();
  S.mark();
  await S.answer(500);
  assert.equal((await S.card()).hidden, true, 'A failure did not paint a card over B');
  await S.run(35 * SEC);
  assert.equal(S.reqs.filter(r => r.id === ID_A).length, 0, 'A is not polled again');
  S.done();
});

T('picking game B drops game A\'s pending timer: B is polled on its own 30 s, not A\'s', async t => {
  const S = await open(t, {
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'in'), event(ID_B, 'in', true)) }),
    summaryReply: async rec => ({ status: 200, body: summary(rec.id === ID_B ? 90 : 40) }),
  });
  await S.run(10 * SEC);                          // A has answered; its next poll is 20 s away
  await S.page.click('.gbtn >> nth=1');
  await S.settle();
  S.mark();
  await S.run(25 * SEC);                          // past A's old timer, short of B's own
  assert.equal(S.count(), 0, 'nothing is requested for A\'s old timer');
  await S.run(10 * SEC);
  assert.deepEqual(S.reqs.map(r => r.id), [ID_B], 'B is polled once, on its own cadence');
  S.done();
});

T('picking game B hides the card left by game A\'s failure at once', async t => {
  const S = await open(t, {
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'in'), event(ID_B, 'in', true)) }),
    summaryReply: async rec => rec.id === ID_A ? { status: 500, body: {} } : 'hold',
  });
  assert.equal((await S.card()).hidden, false, 'A\'s failure shows a card');
  await S.page.click('.gbtn >> nth=1');
  await S.settle();
  assert.equal(S.held.length, 1, 'B is waiting on its summary');
  assert.equal((await S.card()).hidden, true, 'the card of A is gone while B loads');
  S.done();
});

T('hidden for 10 minutes sends 0 requests; becoming visible sends exactly 1', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: ok('summary', 60) });
  assert.equal(S.count('summary'), 1);
  await S.hide(true);
  S.mark();
  await S.run(10 * MIN);
  assert.equal(S.count(), 0, 'no request while hidden');
  await S.hide(false);
  assert.equal(S.count('summary'), 1, 'exactly one summary request on return');
  assert.equal(S.count('board'), 0);
  S.done();
});

T('hidden while a summary request is in flight: its answer arms no timer; visible sends exactly 1', async t => {
  let calls = 0;
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => ++calls === 2 ? 'hold' : { status: 200, body: summary(60) } });
  assert.ok(await S.run(40 * SEC, () => S.held.length === 1), 'the second summary request is in flight');
  await S.hide(true);
  await S.answer(200, summary(61));
  S.mark();
  await S.run(10 * MIN);
  assert.equal(S.count(), 0, 'no request while hidden, though the answer arrived while hidden');
  await S.hide(false);
  assert.equal(S.count('summary'), 1, 'exactly one on return');
  assert.equal(S.count('board'), 0);
  S.done();
});

T('pre game: hidden before the board timer fires sends 0 in 10 minutes; visible sends exactly 1 board request', async t => {
  const S = await open(t, { startMs: TIP - 10 * MIN, boardReply: async () => ({ status: 200, body: board(event(ID_A, 'pre')) }), summaryReply: ok('summary', 60) });
  assert.equal(S.count('board'), 1);
  await S.hide(true);
  S.mark();
  await S.run(10 * MIN);
  assert.equal(S.count(), 0, 'no board request while hidden');
  await S.hide(false);
  assert.equal(S.count('board'), 1, 'exactly one board request on return');
  assert.equal(S.count('summary'), 0);
  S.done();
});

T('pre game: hidden while the board request is in flight, its answer arms no timer', async t => {
  let calls = 0;
  const S = await open(t, { startMs: TIP - 10 * MIN, boardReply: async () => ++calls === 2 ? 'hold' : { status: 200, body: board(event(ID_A, 'pre')) }, summaryReply: ok('summary', 60) });
  assert.ok(await S.run(12 * MIN, () => S.held.length === 1), 'the second board request is in flight');
  await S.hide(true);
  await S.answer(200, board(event(ID_A, 'pre')));
  S.mark();
  await S.run(10 * MIN);
  assert.equal(S.count(), 0, 'no request while hidden, though the answer arrived while hidden');
  S.done();
});

T('a tab shown again after a final sends nothing', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => ({ status: 200, body: summary(132, false) }) });
  assert.equal(S.count('summary'), 1);
  await S.hide(true);
  S.mark();
  await S.hide(false);
  assert.equal(S.count(), 0);
  S.done();
});

T('a tab shown while a summary request is in flight sends no second one', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => 'hold' });
  assert.equal(S.count('summary'), 1);
  await S.hide(true);
  S.mark();
  await S.hide(false);
  assert.equal(S.count(), 0);
  S.done();
});

T('Refresh while a summary request is in flight sends 0', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => 'hold' });
  assert.equal(S.count('summary'), 1);
  S.mark();
  await S.refresh();
  assert.equal(S.count(), 0);
  S.done();
});

T('Refresh while the board request is in flight sends 0', async t => {
  const S = await open(t, { boardReply: async () => 'hold', summaryReply: ok('summary', 60) });
  assert.equal(S.count('board'), 1);
  S.mark();
  await S.refresh();
  assert.equal(S.count(), 0);
  S.done();
});

T('after a 429 on the summary, Refresh inside 60 s sends 0 and after 60 s sends 1', async t => {
  let calls = 0;
  const S = await open(t, {
    boardReply: ok('board'),
    summaryReply: async () => ++calls === 1 ? { status: 200, body: summary(60) } : { status: 429, body: {} },
  });
  await S.run(35 * SEC);                          // the live cadence is exactly 30 s (live.js POLL.live)
  assert.equal(S.count('summary'), 2, 'second request got the 429');
  const c = await S.card();
  assert.match(c.text, /FEED PAUSED\./);
  assert.match(c.text, /HTTP 429/);
  S.mark();
  await S.run(20 * SEC);                          // well under 60 s after the request
  await S.refresh();
  assert.equal(S.count(), 0, 'Refresh inside 60 s sends nothing');
  await S.run(60 * SEC);
  S.mark();
  await S.refresh();
  assert.equal(S.count(), 1, 'Refresh after 60 s sends exactly one request');
  assert.equal(S.count('summary'), 1, 'and it is a summary request, not a board request');
  S.done();
});

T('after a 429 on the first board load, Refresh inside 60 s sends 0 and after 60 s sends 1', async t => {
  const S = await open(t, { boardReply: async () => ({ status: 429, body: {} }), summaryReply: ok('summary', 60) });
  assert.equal(S.count('board'), 1);
  assert.match((await S.card()).text, /FEED PAUSED\./);
  S.mark();
  await S.run(20 * SEC);
  await S.refresh();
  assert.equal(S.count(), 0, 'Refresh inside 60 s sends nothing');
  await S.run(60 * SEC);
  S.mark();
  await S.refresh();
  assert.equal(S.count(), 1, 'Refresh after 60 s sends exactly one request');
  assert.equal(S.count('board'), 1, 'and it is a board request');
  S.done();
});

for (const status of [429, 403]) {
  T(`a ${status} on the board: FEED PAUSED and 0 requests in the next 10 minutes`, async t => {
    let calls = 0;
    const S = await open(t, {
      startMs: TIP - 10 * MIN,                      // a pre game: the board is re-polled before tip
      boardReply: async () => ++calls === 1 ? { status: 200, body: board(event(ID_A, 'pre')) } : { status, body: {} },
      summaryReply: ok('summary', 60),
    });
    assert.equal(S.count('board'), 1);
    assert.ok(await S.run(12 * MIN, () => S.count('board') === 2), 'the board timer fired');
    assert.match((await S.card()).text, /FEED PAUSED\./);
    S.mark();
    await S.run(10 * MIN);
    assert.equal(S.count(), 0);
    await S.hide(true);                             // and coming back to the tab does not poll a stopped board
    await S.hide(false);
    assert.equal(S.count(), 0, 'a visible tab does not restart a paused board');
    S.done();
  });
}

T('a day that is not today arms no board timer (a pre game, Prev day, 12 minutes, 0 requests)', async t => {
  const S = await open(t, { startMs: TIP - 10 * MIN, boardReply: async () => ({ status: 200, body: board(event(ID_A, 'pre')) }), summaryReply: ok('summary', 60) });
  assert.equal(S.count('board'), 1);
  await S.page.click('#dayPrev');
  await S.settle();
  assert.equal(S.count('board'), 2, 'the other day was loaded');
  S.mark();
  await S.run(12 * MIN);
  assert.equal(S.count(), 0, 'no board timer on a day that is not today');
  S.done();
});

T('a summary the page timed out is dropped from the held list, so the retry reply is awaited', async t => {
  let calls = 0;
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => ++calls === 1 ? 'hold' : { status: 200, body: summary(60) } });
  await S.run(11 * SEC);
  assert.match((await S.card()).text, /timeout/);
  assert.equal(S.held.length, 0, 'the request the page aborted is no longer held');
  await S.run(40 * SEC);                          // the retry (24-36 s after the timeout) is answered 200
  assert.equal((await S.card()).hidden, true, 'the retry succeeded and took the card down: ' + (await S.card()).text);
  S.done();
});

T('a failed summary keeps "Last known:" and "as of" on the card, and the next success hides it', async t => {
  let calls = 0;
  const S = await open(t, {
    boardReply: ok('board'),
    summaryReply: async () => ++calls === 2 ? { status: 500, body: {} } : { status: 200, body: summary(60) },
  });
  await S.run(35 * SEC);
  assert.equal(S.count('summary'), 2);
  const c = await S.card();
  assert.equal(c.hidden, false);
  const l = LAST(60);
  assert.ok(c.text.includes(`Last known: ${side('away')} ${l.awayScore} – ${l.homeScore} ${side('home')}`), c.text);
  assert.match(c.text, / as of \d/);
  assert.match(c.text, /FEED UNREACHABLE\./);
  assert.match(c.text, /Next try at \d/, 'the card says when the next try is');
  await S.run(70 * SEC);                          // the retry after a failure is 30 s +-20%
  assert.ok(S.count('summary') >= 3, 'the retry was sent');
  assert.equal((await S.card()).hidden, true, 'a success takes the card down');
  S.done();
});

T('a final sends 0 requests in 20 minutes', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: async () => ({ status: 200, body: summary(132, false) }) });
  assert.equal(S.count('summary'), 1);
  assert.equal((await S.card()).hidden, true);
  S.mark();
  await S.run(20 * MIN);
  assert.equal(S.count(), 0);
  S.done();
});

T('#feedcard is a polite status region', async t => {
  const S = await open(t, { boardReply: ok('board'), summaryReply: ok('summary', 60) });
  assert.equal(await S.page.getAttribute('#feedcard', 'role'), 'status');
  assert.equal(await S.page.getAttribute('#feedcard', 'aria-live'), 'polite');
  S.done();
});

const txtOf = (S, id) => S.page.$eval(id, e => e.textContent);
// The scorebug, clock, phase, header, update stamp and tab title hold nothing of game A.
async function assertNoGameA(S, away, home) {
  assert.equal(await txtOf(S, '#aAbbr'), '–', 'away abbreviation');
  assert.equal(await txtOf(S, '#hAbbr'), '–', 'home abbreviation');
  assert.equal(await txtOf(S, '#aScore'), '–');
  assert.equal(await txtOf(S, '#hScore'), '–');
  assert.equal(await txtOf(S, '#clock'), '–', 'A\'s clock is gone');
  assert.notEqual(await txtOf(S, '#liveState'), 'Final', 'A\'s phase is gone');
  assert.equal(await txtOf(S, '#upd'), '', 'A\'s update stamp is gone');
  const gh = await txtOf(S, '#ghMount');
  assert.ok(!gh.includes(away) && !gh.includes(home), 'A\'s game header is gone: ' + gh);
  assert.ok(!(await S.page.title()).includes(`${away} @ ${home}`), await S.page.title());
}

T('picking game B after game A, with B\'s summary aborted, shows none of A\'s score, clock or title', async t => {
  const S = await open(t, {
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'post'), event(ID_B, 'pre', true)) }),
    summaryReply: async (rec, route) => rec.id === ID_A ? { status: 200, body: summary(132, false) } : (await route.abort(), 'aborted'),
  });
  await S.page.click('.gbtn >> nth=0');           // pick A: it paints
  await S.settle();
  const away = side('away'), home = side('home');
  assert.notEqual(await txtOf(S, '#aScore'), '–', 'A painted a score');
  assert.notEqual(await txtOf(S, '#clock'), '–', 'A painted a clock');
  await S.page.click('.gbtn >> nth=1');           // pick B: its summary is aborted
  await S.settle();
  const c = await S.card();
  assert.equal(c.hidden, false);
  assert.ok(!c.text.includes(away) && !c.text.includes(home), 'the card names neither of A\'s teams: ' + c.text);
  assert.ok(!/Last known/.test(c.text), c.text);
  assert.match(c.text, /No score on record yet\./);
  assert.ok(!/ as of \d/.test(c.text), 'no as-of time from game A: ' + c.text);
  await assertNoGameA(S, away, home);
  S.done();
});

T('changing the day with the board failing leaves none of A\'s score on the scorebug or card', async t => {
  let boards = 0;
  const S = await open(t, {
    boardReply: async () => ++boards === 1 ? { status: 200, body: board(event(ID_A, 'post'), event(ID_B, 'pre', true)) } : { status: 500, body: {} },
    summaryReply: async () => ({ status: 200, body: summary(132, false) }),
  });
  await S.page.click('.gbtn >> nth=0');
  await S.settle();
  const away = side('away'), home = side('home');
  assert.notEqual(await txtOf(S, '#aScore'), '–', 'A painted a score');
  await S.page.click('#dayPrev');
  await S.settle();
  const c = await S.card();
  assert.ok(!/Last known/.test(c.text), c.text);
  assert.ok(!c.text.includes(away) && !c.text.includes(home), c.text);
  await assertNoGameA(S, away, home);
  S.done();
});

T('picking the game already shown, with its summary failing, keeps its last-known score', async t => {
  let n = 0;
  const S = await open(t, {
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'post'), event(ID_B, 'pre', true)) }),
    summaryReply: async () => ++n === 1 ? { status: 200, body: summary(132, false) } : { status: 500 },
  });
  await S.page.click('.gbtn >> nth=0');           // pick A, then A again
  await S.settle();
  const aScore = await txtOf(S, '#aScore'), hScore = await txtOf(S, '#hScore');
  assert.notEqual(aScore, '–');
  await S.page.click('.gbtn >> nth=0');
  await S.settle();
  const c = await S.card();
  assert.ok(c.text.includes(`Last known: ${side('away')} ${aScore} – ${hScore} ${side('home')}`), c.text);
  assert.equal(await txtOf(S, '#aScore'), aScore);
  S.done();
});

T('picking game B inside a score tick on A leaves B\'s score, not A\'s tick, on the scorebug', async t => {
  const S = await open(t, {
    raf: true,                                    // the fake clock drives the animation frames
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'in'), event(ID_B, 'in', true)) }),
    summaryReply: async rec => ({ status: 200, body: summary(rec.id === ID_B ? 90 : 40) }),
  });
  await S.run(2 * SEC);
  // drag A's timeline back: the scorebug ticks toward an earlier score for 650 ms
  await S.page.$eval('#scrub', e => { e.value = 10; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await S.page.clock.runFor(100);
  await S.page.click('.gbtn >> nth=1');           // pick B inside the tick
  await S.settle();
  await S.run(2 * SEC);
  const want = summary(90).plays.at(-1);
  assert.equal(await txtOf(S, '#aScore'), String(want.awayScore), 'B\'s away score');
  assert.equal(await txtOf(S, '#hScore'), String(want.homeScore), 'B\'s home score');
  S.done();
});

T('dragging the timeline of a shown live game lands the scorebug on that play\'s score', async t => {
  const S = await open(t, {
    raf: true,                                    // real animation frames: the tick runs and must finish
    boardReply: async () => ({ status: 200, body: board(event(ID_A, 'in', true)) }),
    summaryReply: async () => ({ status: 200, body: summary(60) }),
  });
  await S.run(2 * SEC);
  await S.page.$eval('#scrub', e => { e.value = 10; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await S.page.clock.runFor(1000);                // past the 650 ms tick
  const want = summary(60).plays[10];
  assert.equal(await txtOf(S, '#aScore'), String(want.awayScore), 'away score of play 10');
  assert.equal(await txtOf(S, '#hScore'), String(want.homeScore), 'home score of play 10');
  S.done();
});
