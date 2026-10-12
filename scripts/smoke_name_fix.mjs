// Data-contract test for assets/name-fix.js.
//
// Extracts the regex construction from the shipped module rather than restating
// it, then exercises it on the strings that matter: the names it must repair,
// and the correct-as-written names it must leave alone. "VanVleet" and
// "CauleyStein" are the same shape, so the control cases are the whole point.
//
//     node scripts/smoke_name_fix.mjs      # exit 0 clean, 1 on any failure
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = readFileSync(ROOT + '/assets/name-fix.js', 'utf8');
const fixes = JSON.parse(readFileSync(ROOT + '/assets/name_fixes.json', 'utf8')).fixes;

// pull esc() and the RegExp line straight out of the module
const escSrc = src.match(/function esc\([\s\S]*?\}\r?\n/);
const rxSrc = src.match(/rx = new RegExp\((.*?)\);/);
if (!escSrc || !rxSrc) { console.log('FAIL could not extract esc/RegExp from name-fix.js'); process.exit(1); }

const makeRx = new Function('map', `
  ${escSrc[0]}
  var keys = Object.keys(map);
  keys.sort(function (a, b) { return b.length - a.length; });
  return new RegExp(${rxSrc[1]});
`);
const rx = makeRx(fixes);
const apply = s => { rx.lastIndex = 0; return s.replace(rx, (_m, pre, name) => pre + (fixes[name] || name)); };

let fail = 0;
const t = (label, got, want) => {
  const ok = got === want;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};

console.log(`extracted regex over ${Object.keys(fixes).length} names\n`);
console.log('repairs:');
t('bare name', apply('KarlAnthony Towns'), 'Karl-Anthony Towns');
t('mid-sentence', apply('and Shai GilgeousAlexander scored 30'), 'and Shai Gilgeous-Alexander scored 30');
t('inside markup text', apply('Twin: Kentavious CaldwellPope (2016-17)'), 'Twin: Kentavious Caldwell-Pope (2016-17)');
t('two in one string', apply('Nigel HayesDavis vs Willie CauleyStein'), 'Nigel Hayes-Davis vs Willie Cauley-Stein');

console.log('\ncontrols — correct as written, must not change:');
for (const ok of ['Fred VanVleet', 'Aaron McKie', 'DeMar DeRozan', 'Caris LeVert', 'Zach LaVine', 'LeBron James', 'Donte DiVincenzo'])
  t(ok, apply(ok), ok);

console.log('\nboundaries:');
t('already hyphenated is untouched', apply('Karl-Anthony Towns'), 'Karl-Anthony Towns');
t('no match inside a longer token', apply('xKarlAnthony Townsx'), 'xKarlAnthony Townsx');
t('empty string', apply(''), '');

console.log('\nidempotence — a second pass must be a no-op (or the observer loops):');
const once = apply('KarlAnthony Towns and Nigel HayesDavis');
t('second pass changes nothing', apply(once), once);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASS' : fail + ' FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
