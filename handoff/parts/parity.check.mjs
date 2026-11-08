// Parity check: the From card (h5-card.js) and its styles (ho.css) must sit byte for byte in every system
// that carries it. Change the card here, paste it again, rerun this. Usage:
//   node parity.check.mjs [video.html smm.html graphic.html]
// With no arguments it reads the three live checkouts (or the bb-wt worktrees when they exist).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const card = readFileSync(join(here, 'h5-card.js'), 'utf8').trim();
const css = readFileSync(join(here, 'ho.css'), 'utf8').trim();
const H = homedir();
const pick = (wt, repo) => existsSync(wt) ? wt : repo;
const targets = process.argv.slice(2).length ? process.argv.slice(2).map(p => [p, p]) : [
  ['Video System', pick(`${H}/bb-wt/video-from-card/index.html`, `${H}/bb-video-system/index.html`)],
  ['SMM Workspace', pick(`${H}/bb-wt/smm-from-card/index.html`, `${H}/bb-smm-workspace/index.html`)],
  ['Graphic System', pick(`${H}/bb-wt/graphic-from-card/index.html`, `${H}/bb-graphic-system/index.html`)],
];
const cc = join(here, '..', '..', 'index.html');
let pass = 0, total = 0;
const ok = (name, p, d) => { total++; if (p) pass++; console.log(`${p ? 'PASS' : 'FAIL'} ${name}${d ? '  | ' + d : ''}`); };

if (existsSync(cc)) {
  const t = readFileSync(cc, 'utf8');
  ok('Command Centre carries the card unchanged', t.includes(card));
}
for (const [name, file] of targets) {
  if (!existsSync(file)) { ok(`${name} file found`, false, file); continue; }
  const t = readFileSync(file, 'utf8');
  const a = t.indexOf('@@BBHO_FROM_CARD@@ BEGIN'), b = t.indexOf('@@BBHO_FROM_CARD@@ END');
  ok(`${name} has one From card block`, a > -1 && b > a && t.indexOf('@@BBHO_FROM_CARD@@ BEGIN', a + 1) === -1, file);
  const blk = a > -1 && b > a ? t.slice(a, b) : '';
  ok(`${name} card is byte for byte`, blk.includes(card));
  ok(`${name} styles are byte for byte`, blk.includes(css));
  ok(`${name} has its own glue`, /(\/\/|\/\*) glue: /.test(blk));
}
console.log(`RESULT: ${pass} of ${total} PASS`);
process.exit(pass === total ? 0 : 1);
