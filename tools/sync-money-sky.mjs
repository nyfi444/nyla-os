// Copies the Financial Astrology engine and view from Nyla OS (the one source)
// into the two Business OS dashboards, plus the astronomy library they serve
// themselves. Run after any change to js/money-sky-core.js or js/money-sky-view.js:
//
//   node tools/sync-money-sky.mjs          write the copies
//   node tools/sync-money-sky.mjs --check  only report drift (exit 1 if any)
//
// Each receiving repo still needs its own commit and release. Its own tests check
// its copy (it must load and work, and the astronomy file must match its pinned
// hash), and tests/money-sky.test.mjs here fails while a sibling copy differs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  ['js/money-sky-core.js', 'money-sky/money-sky-core.js'],
  ['js/money-sky-view.js', 'money-sky/money-sky-view.js'],
  ['tests/vendor/astronomy-engine-2.1.19.min.js', 'astronomy-engine/astronomy.browser.min.js'],
];
const TARGETS = [
  ['Semester HQ Business OS', 'semester-hq-dashboard/vendor'],
  ['Company HQ (Business OS product)', 'maison-os/portal/vendor'],
];
const check = process.argv.includes('--check');
let drift = 0;
for (const [label, dir] of TARGETS) {
  const base = join(ROOT, dir);
  if (!existsSync(dirname(base))) { console.log(`skip  ${label}: ${dir} is not on this Mac`); continue; }
  for (const [src, dst] of FILES) {
    const want = readFileSync(join(ROOT, src), 'utf8'), path = join(base, dst);
    const have = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (have === want) { console.log(`same  ${label}: ${dst}`); continue; }
    drift++;
    if (check) { console.log(`DRIFT ${label}: ${dst}`); continue; }
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, want);
    console.log(`wrote ${label}: ${dst}`);
  }
}
if (check && drift) process.exit(1);
