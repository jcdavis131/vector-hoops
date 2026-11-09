// a6-check.mjs — Wave A cluster A6 repro + measurement (T15, T16, T13-retry).
// Runs against the rewrite-aware serve (docs/phase2-A6/serve.mjs, port 8475).
// Usage: node docs/phase2-A6/a6-check.mjs <before|after> [port]
//   before: serve the BASE public/ on the port first:
//     node docs/phase2-A6/serve.mjs 8476 ~/workspace/_worktrees/landing-map-viz/public
//     node docs/phase2-A6/a6-check.mjs before 8476
//   after: serve this worktree's public/ (default root) on 8475:
//     node docs/phase2-A6/serve.mjs 8475
//     node docs/phase2-A6/a6-check.mjs after 8475
//   Scoreboard-fail mode (playtest condition, /api 404s):
//     A6_SCOREBOARD=fail node docs/phase2-A6/serve.mjs 8475
// Writes screenshots to docs/phase2-A6/screenshots/<mode>-*.png and prints
// a JSON summary. Exit 0 always (this is a measurement, not a gate); the
// verdicts live in docs/phase2-A6/notes.md.
// BLOCKED 2026-11-08 ~21:00 CST: Chromium SIGTRAPs on launch in this
// container (see notes.md) — rerun when the environment recovers.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/tools/qa-chrome/node_modules/playwright-core/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'before';
const port = Number(process.argv[3] || 8475);
const BASE = `http://127.0.0.1:${port}/`;
const shotDir = path.join(here, 'screenshots');
fs.mkdirSync(shotDir, { recursive: true });
const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');

const results = {};
function record(name, obj) { results[name] = obj; console.log(`## ${name}: ` + JSON.stringify(obj)); }

function newCollector(page) {
  const errors = { console: [], pageerror: [], failedSameOrigin: [], failedExternal: [], badStatus: [], scoreboardReqs: [] };
  page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.pageerror.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => {
    const u = r.url();
    (u.startsWith(BASE) ? errors.failedSameOrigin : errors.failedExternal).push(u.slice(0, 160));
  });
  page.on('response', (r) => { if (r.status() >= 400) errors.badStatus.push(r.status() + ' ' + r.url().slice(0, 160)); });
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/espn/scoreboard') || u.includes('site.api.espn.com')) errors.scoreboardReqs.push(u.slice(0, 160));
  });
  return errors;
}

async function focusLabel(page) {
  return await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    return (el.tagName + '#' + (el.id || '') + '.' + (typeof el.className === 'string' ? el.className : '')).slice(0, 120) +
      ' :: ' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  });
}

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--no-proxy-server', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'],
});

// ---------- T15 desktop: drawer Tab walk ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = newCollector(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // Tab to the Explore button (5th stop per the playtest) then open.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  const exploreFocused = await focusLabel(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const afterOpen = await focusLabel(page);
  const walk = [afterOpen];
  for (let i = 0; i < 15; i++) { await page.keyboard.press('Tab'); walk.push(await focusLabel(page)); }
  const closeIndex = walk.findIndex((s) => s.includes('site-nav__drawer-close'));
  await page.screenshot({ path: path.join(shotDir, `${mode}-t15-drawer-open.png`) });
  record('T15-desktop-drawer-tab', { exploreFocused, afterOpen, closeIndexInWalk: closeIndex, walk });
  record('T15-desktop-console', errors);
  await ctx.close();
}

// ---------- T16 desktop: search focus ring ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = newCollector(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('#atlas-search').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  // Tab from the top until the search box is focused (8th stop per playtest).
  let searchFocused = false;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
    if (id === 'atlas-search') { searchFocused = true; break; }
  }
  const ring = await page.evaluate(() => {
    const el = document.querySelector('#atlas-search');
    const cs = getComputedStyle(el);
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 80), borderColor: cs.borderColor };
  });
  await page.screenshot({ path: path.join(shotDir, `${mode}-t16-focus-search.png`) });
  record('T16-desktop-search-focus', { searchFocused, ring });
  record('T16-desktop-console', errors);
  await ctx.close();
}

// ---------- T13: scoreboard requests across loads in one session ----------
// Fresh context = fresh tab session. Load 1 attempts the scoreboard; loads 2+
// (reload, then /play and back) must issue ZERO further scoreboard requests.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = newCollector(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const load1 = [...errors.scoreboardReqs];
  const flags1 = await page.evaluate(() => ({ tonightFailed: sessionStorage.getItem('vh.tonightFailed'), navLiveFailed: sessionStorage.getItem('vh_nav_live_failed') }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const load2 = errors.scoreboardReqs.slice(load1.length);
  await page.goto(BASE + 'play', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.goBack({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const load3plus = errors.scoreboardReqs.slice(load1.length + load2.length);
  record('T13-session-scoreboard', {
    load1ScoreboardReqs: load1, load1Flags: flags1,
    reloadScoreboardReqs: load2, laterScoreboardReqs: load3plus,
    totalScoreboardReqs: errors.scoreboardReqs.length,
    failedSameOrigin: errors.failedSameOrigin, failedExternal: errors.failedExternal,
    pageerrors: errors.pageerror,
  });
  await ctx.close();
}

// ---------- Mobile 390px: overflow + drawer + search focus ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = newCollector(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const afterOpen = await focusLabel(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shotDir, `${mode}-t15-mobile.png`) });
  record('T15-mobile', { horizontalOverflow: overflow, afterOpen });
  record('T15-mobile-console', errors);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(shotDir, `${mode}-results.json`), JSON.stringify(results, null, 2));
console.log('DONE ' + mode);
