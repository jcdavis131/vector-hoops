// a2-check.mjs — Wave A cluster A2 repro + measurement (T2, T3, T12).
// Runs against the rewrite-aware serve (docs/phase2-A2/serve.mjs, port 8473).
// Usage: node docs/phase2-A2/a2-check.mjs <before|after> [port]
// Writes screenshots to docs/phase2-A2/screenshots/<mode>-*.png and prints
// a JSON summary. Exit 0 always (this is a measurement, not a gate); the
// verdicts live in docs/phase2-A2/notes.md.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '/home/hatch/workspace/tools/qa-chrome/node_modules/playwright-core/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'before';
const port = Number(process.argv[3] || 8473);
const BASE = `http://127.0.0.1:${port}/`;
const shotDir = path.join(here, 'screenshots');
fs.mkdirSync(shotDir, { recursive: true });
const CHROME = path.join(os.homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');

const results = {};
function record(name, obj) { results[name] = obj; console.log(`## ${name}: ` + JSON.stringify(obj)); }

async function newPage(browser, viewport, touch) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = { console: [], pageerror: [], failedSameOrigin: [], failedExternal: [], badStatus: [] };
  let navigated = false;
  page.on('framenavigated', () => { navigated = true; });
  page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.pageerror.push(String(e).slice(0, 200)));
  page.on('requestfailed', (r) => {
    const u = r.url();
    (u.startsWith(BASE) ? errors.failedSameOrigin : errors.failedExternal).push(u.slice(0, 160));
  });
  page.on('response', (r) => { if (r.status() >= 400) errors.badStatus.push(r.status() + ' ' + r.url().slice(0, 160)); });
  return { ctx, page, errors, wasNavigated: () => navigated, resetNav: () => { navigated = false; } };
}

// Wait until the URL carries the selection, whether by full navigation
// (cold chip click) or in-place replaceState (warm chip click: the param
// order is id-first there, so never match on a fixed query string).
async function waitForId(page, id) {
  await page.waitForFunction((wanted) => location.href.includes('id=' + wanted), id, { timeout: 10000 });
}

async function waitPeers(page, timeout = 20000) {
  await page.waitForFunction(
    () => document.querySelectorAll('#atlas-peers-body tr').length >= 1,
    { timeout });
}

async function measureSelection(page) {
  return await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) }; };
    const readout = q('#atlas-selected');
    const table = q('#atlas-peers-body') ? q('#atlas-peers-body').closest('table') : null;
    const rows = [...document.querySelectorAll('#atlas-peers-body tr')].slice(0, 3).map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
    return {
      scrollY: Math.round(window.scrollY),
      viewportH: window.innerHeight,
      readoutRect: r(readout),
      peersTableRect: r(table),
      readoutText: readout ? readout.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : null,
      peerRows: rows,
      readoutInView: readout ? (() => { const b = readout.getBoundingClientRect(); return b.top >= 0 && b.top < window.innerHeight; })() : false,
      peersTopInView: table ? (() => { const b = table.getBoundingClientRect(); return b.top >= 0 && b.top < window.innerHeight; })() : false,
      peersFullyInView: table ? (() => { const b = table.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; })() : false,
    };
  });
}

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--no-proxy-server', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'],
});

// ---------- T2 desktop: chip click ----------
{
  const { ctx, page, errors, wasNavigated, resetNav } = await newPage(browser, { width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const chip = page.locator('a[data-view][data-id="672"]').first();
  await chip.scrollIntoViewIfNeeded();
  const beforeY = await page.evaluate(() => Math.round(window.scrollY));
  resetNav();
  await Promise.all([waitForId(page, '672'), chip.click()]);
  const navTookPlace = wasNavigated();
  await page.waitForLoadState('load');
  await waitPeers(page);
  await page.waitForTimeout(1200); // let any smooth scroll settle
  const m = await measureSelection(page);
  m.scrollYBeforeClick = beforeY;
  m.fullNavigation = navTookPlace;
  m.urlAfter = page.url();
  // Position stability: the readout must not drift after the scroll lands
  // (canvas mount / peers fill must not move the card).
  const y1 = await page.evaluate(() => Math.round(window.scrollY + document.querySelector('#atlas-selected').getBoundingClientRect().top));
  await page.waitForTimeout(3000);
  const y2 = await page.evaluate(() => Math.round(window.scrollY + document.querySelector('#atlas-selected').getBoundingClientRect().top));
  m.readoutPageYSettled = y1;
  m.readoutPageYAfter3s = y2;
  await page.screenshot({ path: path.join(shotDir, `${mode}-t2-desktop.png`) });
  record('T2-desktop-chip', m);
  record('T2-desktop-console', errors);
  await ctx.close();
}

// ---------- T3 desktop: search pick ----------
{
  const { ctx, page, errors } = await newPage(browser, { width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.fill('#atlas-search', 'LeBron James');
  await page.waitForSelector('#atlas-results li[data-id]', { timeout: 15000 });
  const pickLabel = await page.locator('#atlas-results li[data-id]').first().textContent();
  await page.locator('#atlas-results li[data-id]').first().click();
  await waitPeers(page);
  await page.waitForTimeout(1200);
  const m = await measureSelection(page);
  m.pickedOption = (pickLabel || '').replace(/\s+/g, ' ').trim();
  await page.screenshot({ path: path.join(shotDir, `${mode}-t3-desktop.png`) });
  record('T3-desktop-search-pick', m);
  record('T3-desktop-console', errors);
  await ctx.close();
}

// ---------- T12 desktop: back restores typed text ----------
{
  const { ctx, page, errors, wasNavigated, resetNav } = await newPage(browser, { width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.fill('#atlas-search', 'Jordan');
  await page.waitForTimeout(400);
  const typedBefore = await page.inputValue('#atlas-search');
  const chip = page.locator('a[data-view][data-id="672"]').first();
  await chip.scrollIntoViewIfNeeded();
  resetNav();
  await Promise.all([waitForId(page, '672'), chip.click()]);
  const chipNavigated = wasNavigated();
  await page.waitForLoadState('load');
  await waitPeers(page);
  await page.waitForTimeout(1200);
  // Warm-path T2: the chip click was applied in place (no navigation), so the
  // page must still bring the payoff into view.
  const warm = await measureSelection(page);
  warm.fullNavigation = chipNavigated;
  record('T2-desktop-chip-warm', warm);
  const afterChip = await page.inputValue('#atlas-search');
  await page.goto(BASE + 'play', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.goBack({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const m = {
    typedBefore,
    chipFullNavigation: chipNavigated,
    inputAfterChip: afterChip,
    urlAfterBack: page.url(),
    inputAfterBack: await page.inputValue('#atlas-search'),
    selectionAfterBack: await page.evaluate(() => (document.querySelector('#atlas-selected') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) || null),
  };
  await page.screenshot({ path: path.join(shotDir, `${mode}-t12-desktop.png`) });
  record('T12-desktop-back', m);
  record('T12-desktop-console', errors);
  await ctx.close();
}

// ---------- T2 + T3 mobile 390x844 ----------
{
  const { ctx, page, errors, wasNavigated, resetNav } = await newPage(browser, { width: 390, height: 844 }, true);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const chip = page.locator('a[data-view][data-id="672"]').first();
  await chip.scrollIntoViewIfNeeded();
  resetNav();
  await Promise.all([waitForId(page, '672'), chip.click()]);
  const m2nav = wasNavigated();
  await page.waitForLoadState('load');
  await waitPeers(page);
  await page.waitForTimeout(1200);
  const m2 = await measureSelection(page);
  m2.fullNavigation = m2nav;
  m2.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: path.join(shotDir, `${mode}-t2-mobile.png`) });
  record('T2-mobile-chip', m2);

  // T3 mobile: fresh page in same context is fine, but use a new page for isolation
  const page3 = await ctx.newPage();
  const errors3 = { console: [], pageerror: [], failedSameOrigin: [], failedExternal: [], badStatus: [] };
  page3.on('console', (mm) => { if (mm.type() === 'error') errors3.console.push(mm.text().slice(0, 200)); });
  page3.on('pageerror', (e) => errors3.pageerror.push(String(e).slice(0, 200)));
  page3.on('requestfailed', (r) => { const u = r.url(); (u.startsWith(BASE) ? errors3.failedSameOrigin : errors3.failedExternal).push(u.slice(0, 160)); });
  page3.on('response', (r) => { if (r.status() >= 400) errors3.badStatus.push(r.status() + ' ' + r.url().slice(0, 160)); });
  await page3.goto(BASE, { waitUntil: 'load' });
  await page3.waitForTimeout(1200);
  await page3.fill('#atlas-search', 'LeBron James');
  await page3.waitForSelector('#atlas-results li[data-id]', { timeout: 15000 });
  await page3.locator('#atlas-results li[data-id]').first().click();
  await waitPeers(page3);
  await page3.waitForTimeout(1200);
  const m3 = await measureSelection(page3);
  m3.horizontalOverflow = await page3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page3.screenshot({ path: path.join(shotDir, `${mode}-t3-mobile.png`) });
  record('T3-mobile-search-pick', m3);
  record('T3-mobile-console', errors3);
  record('T2-mobile-console', errors);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(shotDir, `${mode}-results.json`), JSON.stringify(results, null, 2));
console.log('DONE ' + mode);
