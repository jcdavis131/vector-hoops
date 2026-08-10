// Data-contract test for the /owner front-office table.
//
// The page gate (scripts/check_frontend.py) proves inline scripts parse. It
// cannot prove they produce correct rows, and this table's failure mode was not
// a parse error: it rendered nine columns of Math.random() for however long.
// So this extracts esc/n2/COLS *verbatim* out of owner/index.html and runs the
// shipped formatters against the real assets/front_office.json - a rewrite of
// the logic would only test the rewrite.
//
// The \r?\n in the extraction patterns is load-bearing: the repo has no
// .gitattributes and core.autocrlf=true, so these files are CRLF on Windows and
// an LF-only pattern silently matches nothing.
//
//     node scripts/smoke_owner_table.mjs      # exit 0 clean, 1 on any failure
//
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const page = readFileSync(ROOT + '/owner/index.html', 'utf8');
const d = JSON.parse(readFileSync(ROOT + '/assets/front_office.json', 'utf8'));

const grab = (re, what) => {
  const m = page.match(re);
  if (!m) { console.log(`FAIL could not extract ${what} from owner/index.html`); process.exit(1); }
  return m[0];
};

const escSrc = grab(/var esc=function[\s\S]*?;\r?\n/, 'esc');
const n2Src = grab(/var n2=function[\s\S]*?;\r?\n/, 'n2');
const colsSrc = grab(/var COLS=\[[\s\S]*?\r?\n\];/, 'COLS');

console.log(`extracted esc(${escSrc.length}b) n2(${n2Src.length}b) COLS(${colsSrc.length}b) verbatim\n`);

const COLS = new Function(`${escSrc}${n2Src}${colsSrc}\nreturn COLS;`)();

const ROWS = d.teams || [];
let fail = 0;
const check = (n, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };

check('COLS has 9 entries', COLS.length === 9);
check('thead in markup has 9 <th>', (page.match(/<thead><tr>(.*?)<\/tr><\/thead>/s)?.[1].match(/<th/g) || []).length === 9);
check('30 teams', ROWS.length === 30);

const dashes = {};
for (const r of ROWS) for (const c of COLS) if (String(c.f(r)).includes('\u2014')) dashes[c.t] = (dashes[c.t] || 0) + 1;
check('no shipped formatter renders an em-dash', Object.keys(dashes).length === 0, JSON.stringify(dashes));

const badSort = COLS.filter(c => ROWS.some(r => c.v(r) == null || typeof c.v(r) === 'object'));
check('every shipped sort accessor returns a scalar', badSort.length === 0, badSort.map(c => c.t).join(','));

// strip tags first: markup like width:9px must not count as a displayed decimal
const tooPrecise = [];
for (const r of ROWS) for (const c of COLS) {
  const text = String(c.f(r)).replace(/<[^>]*>/g, '');
  const m = text.match(/\d+\.(\d{3,})/);
  if (m) tooPrecise.push(`${r.abbr}/${c.t}=${m[0]}`);
}
check('never more than 2 decimals in visible text', tooPrecise.length === 0, tooPrecise.slice(0, 4).join(' '));

// injection surface: primary goes into a style attribute, name into title
const badHex = ROWS.filter(r => r.primary != null && !/^#[0-9A-Fa-f]{3,8}$/.test(String(r.primary)));
check('all 30 primary values are hex colors', badHex.length === 0, badHex.map(r => `${r.abbr}=${r.primary}`).join(','));
const badName = ROWS.filter(r => /["<>]/.test(String(r.name || '')));
check('no team name carries a quote or angle bracket', badName.length === 0, badName.map(r => r.abbr).join(','));

// esc must actually neutralise a hostile value
const escFn = new Function(`${escSrc}return esc;`)();
check('esc neutralises quotes and brackets', escFn('a"<b>') === 'a&quot;&lt;b&gt;', escFn('a"<b>'));

const sorted = ROWS.slice().sort((a, b) => -1 * (a.for_final - b.for_final));
check('default sort puts for_rank 1 first', sorted[0].for_rank === 1, `${sorted[0].abbr}`);

console.log('\ntop 3 rows, shipped formatters, tags stripped:');
for (const r of sorted.slice(0, 3))
  console.log('  ' + COLS.map(c => String(c.f(r)).replace(/<[^>]*>/g, '')).join(' | '));

console.log(`\n${fail === 0 ? 'ALL CHECKS PASS (shipped code)' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
