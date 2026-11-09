// THULAIB HOME click path: every button on his Home pressed in a real browser, phone and desk, writes stubbed.
// Usage: python3 -m http.server 8793 --bind 127.0.0.1 (from the repo root), then node home/home.check.mjs [base url]
import { chromium } from '/Users/thulaibhassen/bb-systems/batch/node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8793/index.html';
const rows = []; let fails = 0;
const pass = (n, ok, d = '') => { rows.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  [' + d + ']' : ''}`); if (!ok) fails++; };
const b = await chromium.launch();
for (const [L, opts] of [['phone', { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desk', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('bb_cc_role', 'th'); localStorage.setItem('bb_cc_rt', 'test-refresh'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  const writes = [], errs = [], dropped = [];
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname.startsWith('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 }) });
    if (['GET', 'HEAD'].includes(req.method())) { const h = { ...req.headers() }; delete h['authorization']; if (h['apikey']) h['authorization'] = 'Bearer ' + h['apikey']; return route.continue({ headers: h }); }
    writes.push({ m: req.method(), path: u.pathname, body: req.postData() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('requestfailed', r => { if (/supabase/.test(r.url())) dropped.push(r.url().slice(40, 110)); });
  await p.goto('about:blank'); await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#thh-push-rows [data-thh-done], #thh-push-rows .thh-calm', { timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(5000);
  const st = () => p.evaluate(() => ({ title: document.getElementById('topbar-title').textContent.trim(), vis: [...document.querySelectorAll('.page-section')].filter(x => getComputedStyle(x).display !== 'none').map(x => x.id).join(), side: document.getElementById('sidebar').classList.contains('open'), cur: (document.querySelector('#thh-tabbar [aria-current=page]') || {}).textContent || '', lit: (document.querySelector('#sidebar .nav-item.active') || {}).id || '', y: Math.round((document.querySelector('.main') || document.scrollingElement).scrollTop || scrollY) }));
  const home = async () => { if (L === 'phone') await p.click('#thh-tabbar [data-thh-tab=home]'); else await p.click('#nav-thhome'); await p.waitForTimeout(700); };
  let s = await st();
  pass(`${L} opens on Home`, s.title === 'Home' && s.vis === 'page-thhome', JSON.stringify(s));
  const sendBtns = await p.$$eval('button', xs => xs.filter(x => x.offsetParent !== null && /send a task/i.test((x.getAttribute('aria-label') || '') + x.textContent)).map(x => x.id));
  pass(`${L} one Send a task on the screen`, sendBtns.length === 1, sendBtns.join());
  const txt = await p.$eval('#page-thhome', x => x.innerText);
  pass(`${L} no tile says Not read`, !/Not read|Could not read/.test(txt), (txt.match(/[^\n]*(Not read|Could not read)[^\n]*/g) || []).join(' | ').slice(0, 200));
  pass(`${L} no read was dropped by the network`, dropped.length === 0, dropped.slice(0, 3).join());

  /* tiles */
  for (const [id, page, title] of [['thh-money', 'page-finance', 'Money'], ['thh-sales', 'page-pipeline', 'Leads'], ['thh-clients', 'page-clients', 'Clients'], ['thh-mine', 'page-dashboard', 'Decisions'], ['thh-hers', 'page-approvals', '']]) {
    await p.click('#' + id); await p.waitForTimeout(1300); s = await st();
    pass(`${L} tile ${id} opens ${page}`, s.vis === page && (!title || s.title === title), JSON.stringify(s));
    await home(); s = await st();
    pass(`${L} back on Home after ${id}`, s.vis === 'page-thhome' && s.title === 'Home', JSON.stringify(s));
  }
  /* team */
  await p.click('#thh-score'); await p.waitForTimeout(1200); s = await st();
  pass(`${L} Team Score opens its page`, s.vis === 'page-teamscore', JSON.stringify(s));
  await home();
  const members = await p.$$('#thh-team-body [data-thh-member]');
  pass(`${L} Team table lists people`, members.length >= 3, members.length + ' rows');
  if (members.length) { await members[0].click(); await p.waitForTimeout(1200); s = await st();
    const sheet = await p.evaluate(() => [...document.querySelectorAll('.modal-overlay:not(.hidden),[role=dialog]')].filter(x => x.getBoundingClientRect().height > 0 && getComputedStyle(x).display !== 'none').map(x => x.id || x.className).join());
    pass(`${L} a Team row opens something`, s.vis !== 'page-thhome' || !!sheet, JSON.stringify(s) + ' sheet:' + sheet);
    if (sheet) { await p.goBack(); await p.waitForTimeout(600); } await home(); }
  const ho = await p.evaluate(() => { const m = document.getElementById('thh-ho-mount'), c = document.getElementById('ho-card-mount'), t = document.getElementById('thh-team'); return { inMount: !!(c && m.contains(c)), under: !!(c && t && (t.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) }; });
  pass(`${L} the Send a task From card sits under the Team table`, ho.inMount && ho.under, JSON.stringify(ho));

  /* duty ticks */
  const d0 = '#page-thhome [data-thh-duty]';
  const before = await p.getAttribute(d0, 'aria-pressed');
  await p.locator(d0).first().click(); await p.waitForTimeout(300);
  const after = await p.locator(d0).first().getAttribute('aria-pressed');
  pass(`${L} a duty tick switches on`, before === 'false' && after === 'true', `${before} -> ${after}`);
  const w0 = writes.length;
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector(d0, { timeout: 25000 }); await p.waitForTimeout(4000);
  pass(`${L} the tick is still on after a reload`, (await p.locator(d0).first().getAttribute('aria-pressed')) === 'true');
  await p.locator(d0).first().click(); await p.waitForTimeout(300);
  pass(`${L} the tick switches off again`, (await p.locator(d0).first().getAttribute('aria-pressed')) === 'false');
  /* the reload in between lets the shell write its own boot rows (error log, alerts, the team logged in notice); a tick adds none */
  pass(`${L} a tick writes nothing to the database`, writes.slice(w0).filter(w => !/error_log|bb-alert|bb_ops_form_sent|cc_notifications/.test(w.path)).length === 0, writes.slice(w0).map(w => w.path).join());

  /* More today fold */
  const where = () => p.evaluate(() => ['attention-panel', 'renewals-card', 'bb-brief', 'ed-list', 'shoot-items'].map(id => { const e = document.getElementById(id); return id + ':' + (e ? (e.closest('#thh-more-mount') ? 'fold' : e.closest('#page-dashboard') ? 'dash' : 'other') : 'none'); }).join(' '));
  const w1 = await where();
  await p.click('#thh-fold'); await p.waitForTimeout(500);
  const open1 = await p.evaluate(() => ({ exp: document.getElementById('thh-fold').getAttribute('aria-expanded'), kids: document.getElementById('thh-more-mount').children.length, hid: document.getElementById('thh-more-mount').hidden, sw: document.documentElement.scrollWidth, W: innerWidth }));
  pass(`${L} More today opens with the old parts inside`, open1.exp === 'true' && open1.kids >= 4 && !open1.hid, JSON.stringify(open1) + ' ' + await where());
  pass(`${L} More today open does not push the page sideways`, open1.sw <= open1.W + 1, `${open1.sw} on ${open1.W}`);
  await p.click('#thh-fold'); await p.waitForTimeout(500);
  const w2 = await where();
  pass(`${L} More today closes and every part is back where it was`, w2 === w1 && !/fold/.test(w2), w2);
  await p.click('#thh-fold'); await p.waitForTimeout(400);
  if (L === 'phone') await p.click('#thh-tabbar [data-thh-tab=team]'); else await p.click('#nav-team'); await p.waitForTimeout(900);
  const w3 = await where();
  pass(`${L} leaving Home with the fold open puts the parts back`, !/fold/.test(w3), w3);
  await home();
  pass(`${L} the fold is shut on return`, (await p.getAttribute('#thh-fold', 'aria-expanded')) === 'false');

  /* push card */
  const n0 = await p.locator('#thh-push-rows [data-thh-done]').count();
  pass(`${L} push card lists decisions`, n0 >= 1 && n0 <= 3, n0 + ' rows');
  if (n0) {
    await p.locator('#thh-push-rows [data-thh-decide]').first().click(); await p.waitForTimeout(1300); s = await st();
    const seen = await p.evaluate(() => { const e = document.getElementById('bb-brief'); if (!e) return 'no console'; const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 ? 'in view' : 'off screen top ' + Math.round(r.top); });
    pass(`${L} Decide opens the decisions console`, s.vis === 'page-dashboard' && s.title === 'Decisions' && seen === 'in view', JSON.stringify(s) + ' ' + seen);
    pass(`${L} Decisions is lit in his menu`, s.lit === 'nav-thdecide', s.lit);
    await home();
    const id = await p.locator('#thh-push-rows [data-thh-done]').first().getAttribute('data-thh-done');
    const w4 = writes.length;
    await p.locator('#thh-push-rows [data-thh-done]').first().click(); await p.waitForTimeout(1800);
    const cl = writes.slice(w4).filter(w => /bb_pending_close/.test(w.path));
    const body = cl[0] ? JSON.parse(cl[0].body) : {};
    pass(`${L} Done sends one bb_pending_close for that row (stubbed, nothing reached the database)`, cl.length === 1 && String(body.p_id) === id && body.p_status === 'done', JSON.stringify(cl).slice(0, 200));
    const other = writes.slice(w4).filter(w => !/bb_pending_close|error_log|bb-alert|bb_ops_form_sent|cc_notifications/.test(w.path));
    pass(`${L} Done writes nothing else`, other.length === 0, other.map(w => w.path).join());
  }
  /* tab bar */
  if (L === 'phone') {
    for (const [t, page, word] of [['team', 'page-team', 'Team'], ['money', 'page-finance', 'Money'], ['clients', 'page-clients', 'Clients'], ['home', 'page-thhome', 'Home']]) {
      await p.click(`#thh-tabbar [data-thh-tab=${t}]`); await p.waitForTimeout(1100); s = await st();
      pass(`${L} tab ${word} shows its page and lights up`, s.vis === page && s.cur.trim() === word && s.title === word, JSON.stringify(s));
    }
    await p.click('#thh-tabbar [data-thh-tab=more]'); await p.waitForTimeout(450); s = await st();
    pass(`${L} tab More opens his menu`, s.side);
    await p.mouse.click(394, 437); await p.waitForTimeout(400); s = await st();
    pass(`${L} a tap outside closes the menu`, !s.side);
    const bar = await p.evaluate(() => { const r = document.getElementById('thh-tabbar').getBoundingClientRect(); const bs = [...document.querySelectorAll('#thh-tabbar button')].map(x => Math.round(x.getBoundingClientRect().height)); return { bottom: Math.round(r.bottom), H: innerHeight, min: Math.min(...bs) }; });
    pass(`${L} tab bar sits on the bottom edge with 44px targets`, bar.bottom === bar.H && bar.min >= 44, JSON.stringify(bar));
  } else {
    pass(`${L} tab bar is not shown on a desk`, await p.$eval('#thh-tabbar', x => getComputedStyle(x).display === 'none'));
  }
  /* the Team table must never run past the edge of its card, on any size */
  await p.evaluate(() => { if (CURRENT_PAGE !== 'thhome') showPage('thhome'); }); await p.waitForTimeout(900);
  const tbl = await p.evaluate(() => { const t = document.querySelector('#thh-team-body table'), c = document.getElementById('thh-team'); if (!t) return null; const a = t.getBoundingClientRect(), b = c.getBoundingClientRect(), pr = parseFloat(getComputedStyle(c).paddingRight); return { table: Math.round(a.right), inner: Math.round(b.right - pr), page: document.documentElement.scrollWidth, W: innerWidth }; });
  pass(`${L} Team table stays inside its card`, !!tbl && tbl.table <= tbl.inner + 1 && tbl.page <= tbl.W, JSON.stringify(tbl));
  /* Send a task sheet: Back once closes it, Back twice leaves */
  await p.click('#ho-send-btn'); await p.waitForTimeout(700);
  const sheetOpen = () => p.evaluate(() => { const e = document.getElementById('ho-sheet') || document.querySelector('[id^=ho-][role=dialog]'); return !!(e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0 && !e.classList.contains('hidden') && !e.hidden); });
  pass(`${L} Send a task opens its sheet from Home`, await sheetOpen());
  await p.goBack(); await p.waitForTimeout(700); s = await st();
  pass(`${L} Back once closes the sheet and stays on Home`, !(await sheetOpen()) && p.url().startsWith(BASE) && s.vis === 'page-thhome', p.url() + ' ' + JSON.stringify(s));
  await p.goBack(); await p.waitForTimeout(700);
  pass(`${L} Back twice leaves the Command Centre (no stale entry)`, !p.url().startsWith(BASE), p.url());
  await p.goForward(); await p.waitForSelector('#thh-hello', { timeout: 25000 }); await p.waitForTimeout(3500); s = await st();
  pass(`${L} Forward comes back to Home`, s.vis === 'page-thhome' && s.title === 'Home', JSON.stringify(s));
  /* Switch: his bar and menu go, the sign in screen is clear */
  if (L === 'phone') { await p.click('.menu-btn'); await p.waitForTimeout(400); }
  await p.click('.signout-btn'); await p.waitForTimeout(1200);
  const out = await p.evaluate(() => ({ login: getComputedStyle(document.getElementById('login-screen')).display, bar: getComputedStyle(document.getElementById('thh-tabbar')).display, made: ['nav-thhome', 'nav-thdecide', 'nav-thmore'].filter(id => document.getElementById(id)).join(), ho: !document.querySelector('#thh-ho-mount #ho-card-mount'), rt: localStorage.getItem('bb_cc_rt') }));
  pass(`${L} Switch shows the sign in screen with his bar and menu gone`, out.login !== 'none' && out.bar === 'none' && out.made === '' && out.ho, JSON.stringify(out));
  pass(`${L} nothing threw`, errs.length === 0, errs.slice(0, 3).join(' | '));
  rows.push(`INFO  ${L} writes stubbed: ${[...new Set(writes.map(w => w.m + ' ' + w.path))].join(', ')}`);
  await ctx.close();
}
await b.close();
console.log(rows.join('\n')); console.log(`RESULT: ${rows.filter(r => r.startsWith('PASS')).length} of ${rows.filter(r => /^(PASS|FAIL)/.test(r)).length} PASS`);
process.exit(fails ? 1 : 0);
