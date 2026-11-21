// After pictures, signed in as Thulaib and as Shiara, every Supabase write stubbed.
// Usage: node home/after-shots.mjs <base url> [prefix] [signed-in-rows.json]
// The pictures are taken without anyone's password, so the two tables only a signed in owner can read (invoices,
// pipeline) are answered from a rows file read through the Supabase admin connection on the day. That file holds
// money figures: it lives outside the repo and is never committed. Without it those tiles read as signed out.
import { chromium } from '/Users/thulaibhassen/bb-systems/batch/node_modules/playwright/index.mjs';
import fs from 'fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8793/index.html';
const PRE = process.argv[3] || 'after';
const OUT = process.env.HOME + '/Downloads/THULAIB-SHIARA-DASHBOARDS/';
const ROWS = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
/* a small stand in for the database's filter language: col=eq.x, neq, gt, gte, lt, lte, is.null, not.is.null */
function answer(table, u) {
  let rows = ROWS[table].slice(); let sel = '*';
  for (const [k, v] of u.searchParams) {
    if (k === 'select') { sel = v; continue; }
    if (['order', 'limit', 'offset'].includes(k)) continue;
    const m = v.match(/^(not\.is|is|eq|neq|gte|gt|lte|lt)\.(.*)$/); if (!m) return null;
    const [, op, val] = m;
    const cmp = (a, b) => (typeof a === 'number' ? a - Number(b) : String(a).localeCompare(String(b)));
    rows = rows.filter(r => { const x = r[k];
      if (op === 'is') return val === 'null' ? x == null : String(x) === val;
      if (op === 'not.is') return val === 'null' ? x != null : String(x) !== val;
      if (x == null) return false;
      if (/_at$/.test(k)) { const d = Date.parse(x) - Date.parse(val); return op === 'gte' ? d >= 0 : op === 'gt' ? d > 0 : op === 'lte' ? d <= 0 : op === 'lt' ? d < 0 : op === 'eq' ? d === 0 : d !== 0; }
      const c = cmp(x, val); return op === 'eq' ? c === 0 : op === 'neq' ? c !== 0 : op === 'gte' ? c >= 0 : op === 'gt' ? c > 0 : op === 'lte' ? c <= 0 : c < 0; });
  }
  if (sel !== '*') { const cols = sel.split(','); rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] === undefined ? null : r[c]]))); }
  return rows;
}
const served = new Set(), passed = new Set();
const b = await chromium.launch();
const blocked = [], errs = [], fails = [], checks = {};
for (const [who, role] of [['thulaib', 'th'], ['shiara', 'sh']]) {
  for (const [dev, opts] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desk', { viewport: { width: 1440, height: 900 } }]]) {
    const ctx = await b.newContext(opts);
    await ctx.addInitScript((r) => { try { localStorage.setItem('bb_cc_role', r); localStorage.setItem('bb_cc_rt', 'test-refresh'); } catch (e) {} }, role);
    await ctx.route(/supabase\.co\//, async route => {
      const req = route.request(), u = new URL(req.url());
      if (u.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 }) });
      const tbl = u.pathname.replace('/rest/v1/', '');
      if (req.method() === 'GET' && ROWS && ROWS[tbl]) { const rows = answer(tbl, u); if (rows) { served.add(tbl + ' ' + decodeURIComponent(u.search).slice(0, 90) + ' -> ' + rows.length + ' rows'); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }); } passed.add(tbl + decodeURIComponent(u.search).slice(0, 90)); }
      if (['GET', 'HEAD'].includes(req.method())) { const h = { ...req.headers() }; delete h['authorization']; if (h['apikey']) h['authorization'] = 'Bearer ' + h['apikey']; return route.continue({ headers: h }); }
      blocked.push(who + ' ' + dev + ' ' + req.method() + ' ' + u.pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(`${who} ${dev}: ${e.message}`));
    p.on('requestfailed', r => { if (/supabase/.test(r.url())) fails.push(`${who} ${dev} DROPPED ${new URL(r.url()).pathname}`); });
    p.on('response', r => { if (/supabase/.test(r.url()) && r.status() >= 400) fails.push(`${who} ${dev} ${r.status()} ${new URL(r.url()).pathname}`); });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(9000);
    await p.screenshot({ path: `${OUT}${PRE}-${who}-${dev}-1.jpg`, type: 'jpeg', quality: 82 });
    const info = await p.evaluate(() => {
      const vh = innerHeight; const sc = [document.scrollingElement, ...document.querySelectorAll('main,.main,.content,.page,.view,[class*=scroll]')].find(e => e && e.scrollHeight > e.clientHeight + 50);
      if (sc) sc.scrollBy(0, vh * 0.85);
      const out = { sc: sc ? sc.tagName + '.' + sc.className : null, title: (document.getElementById('topbar-title') || {}).textContent, text: document.body.innerText.slice(0, 4000) };
      try { out.th = window.BBTH && window.BBTH.selfcheck ? window.BBTH.selfcheck() : 'no BBTH'; } catch (e) { out.th = 'selfcheck threw ' + e.message; }
      try { out.sh = window.BBSH && window.BBSH.selfcheck ? window.BBSH.selfcheck() : 'no BBSH'; } catch (e) { out.sh = 'selfcheck threw ' + e.message; }
      return out;
    });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}${PRE}-${who}-${dev}-2.jpg`, type: 'jpeg', quality: 82 });
    checks[who + ' ' + dev] = { title: info.title, th: info.th, sh: info.sh };
    if (dev === 'desk') fs.writeFileSync(OUT + `${PRE}-${who}.txt`, info.text);
    await ctx.close();
  }
}
console.log('TITLES+SELFCHECKS', JSON.stringify(checks, null, 1).slice(0, 3000));
console.log('SERVED FROM THE ROWS FILE', JSON.stringify([...served], null, 1)); console.log('NOT UNDERSTOOD, PASSED AS SIGNED OUT', JSON.stringify([...passed]));
console.log('BLOCKED', blocked.length, JSON.stringify(blocked));
console.log('ERRS', JSON.stringify(errs)); console.log('FAILS', JSON.stringify([...new Set(fails)]));
await b.close();
