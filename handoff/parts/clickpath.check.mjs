/* Signed-in click path on the Command Centre as THULAIB. Restores the session the way the app does:
   bb_cc_role=th plus a refresh token, and /auth/v1/token is answered with a test token. Every GET passes
   through to Supabase as anon (reads only). Every POST, PATCH, DELETE and rpc is answered here and logged.
   node handoff/parts/clickpath.check.mjs [base] [phone|desk|both]  (BUILD 5, 8 Nov 2026: 202 checks; the Settings Back steps fail on 019a790) */
import { chromium } from '/Users/thulaibhassen/bb-systems/batch/node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8793/index.html';
const WHICH = process.argv[3] || 'both';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5dmlpd25xZ3BoeWtsY29panlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjE5OTEsImV4cCI6MjA5MTI5Nzk5MX0.I8YiBr-rfLVcc6DE8Z1PxEP2oxXCelv6mxqAY_wY7lc';
const rows = []; let bad = 0, total = 0;
const pass = (name, ok, note = '') => { total++; if (!ok) bad++; rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  (' + note + ')' : ''}`); };

const TEAM = [[5, 'USHANE'], [12, 'NIRVANA'], [17, 'FARHATH'], [3, 'SUHANA'], [23, 'THULAIB'], [24, 'SHIARA']].map(([id, name]) => ({ id, name, active: true }));
const REACH = [[5, 2], [12, 1], [17, 1], [3, 0], [23, 1], [24, 0]].map(([team_member_id, phones]) => ({ team_member_id, phones }));
const CLIENTS = [{ id: 41, name: 'SASTHO' }, { id: 42, name: 'SUN ZAPPER' }, { id: 43, name: 'WAVERLEY' }];
const CARD = [{ id: 901, title: 'Check the Waverley invoice', due: '2026-11-20', client_id: 43, notes: null, sent_by: 'SHIARA', seen_at: null, stuck_note: null, stuck_at: null, stuck_reply: null, stuck_reply_at: null, done: false, done_note: null, completed_at: null, created_at: '2026-11-08T03:00:00Z' }];

async function open(b, opts) {
  const ctx = await b.newContext({ ...opts });
  await ctx.addInitScript(() => { if (location.protocol !== 'http:') return; localStorage.setItem('bb_cc_role', 'th'); localStorage.setItem('bb_cc_rt', 'test-refresh'); sessionStorage.setItem('bb_cc_role', 'th'); });
  const writes = []; const reads = { n: 0, s401: [] }; let nextId = 7001;
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (!/supabase\.co$/.test(u.hostname)) {
      if (m === 'GET') return route.continue();
      writes.push({ m, path: u.href, body: (req.postData() || '').slice(0, 200) }); return route.fulfill({ status: 204, body: '' });
    }
    if (u.pathname.startsWith('/auth/v1/token')) return json({ access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 });
    if (u.pathname.startsWith('/auth/v1/')) { writes.push({ m, path: u.pathname, body: '' }); return json({}); }
    if (m === 'GET' || m === 'HEAD') {
      if (u.pathname === '/rest/v1/team_members' && u.search.includes('select=id,name&')) return json(TEAM);
      if (u.pathname === '/rest/v1/bb_push_reach') return json(REACH);
      if (u.pathname === '/rest/v1/clients' && u.search.includes('status=eq.active') && u.search.includes('select=id,name')) return json(CLIENTS);
      if (u.pathname === '/rest/v1/tasks' && u.search.includes('sent_to_id=eq.23')) return json(CARD);
      const h = { ...req.headers(), authorization: 'Bearer ' + ANON, apikey: ANON };
      reads.n++;
      try { const r = await route.fetch({ headers: h }); if (r.status() === 401) reads.s401.push(u.pathname); return route.fulfill({ response: r }); }
      catch (e) { return json([]); }
    }
    const body = req.postData() || '';
    writes.push({ m, path: u.pathname + u.search, body: body.slice(0, 300) });
    if (u.pathname === '/rest/v1/rpc/bb_handoff_send') return json(nextId++);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    return json([]);
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message || e).slice(0, 160)));
  const pops = []; ctx.on('page', np => pops.push(np.url()));
  await p.goto('about:blank');
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#ho-send-btn', { timeout: 20000 });
  await p.waitForTimeout(2500);
  return { ctx, p, writes, reads, errs, pops };
}

const state = (p) => p.evaluate(() => ({
  title: (document.getElementById('topbar-title') || {}).textContent,
  page: window.CURRENT_PAGE || window._bbCurrentPage,
  visible: [...document.querySelectorAll('.page-section')].filter(x => x.style.display === 'block').map(x => x.id),
  overlays: [...document.querySelectorAll('.modal-overlay:not(.hidden), [role=dialog]')].filter(x => x.offsetParent !== null || getComputedStyle(x).position === 'fixed' && getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().height > 0).map(x => x.id || x.className).slice(0, 5),
  hist: history.length, url: location.href, login: getComputedStyle(document.getElementById('login-screen')).display,
  sidebarOpen: document.getElementById('sidebar').classList.contains('open'),
  theme: document.documentElement.getAttribute('data-theme'),
  locked: document.body.classList.contains('bb-locked')
}));

const b = await chromium.launch();
const SIZES = [['phone', { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]].filter(([s]) => WHICH === 'both' || WHICH === s);
const touch = [];
for (const [L, opts] of SIZES) {
  const { ctx, p, writes, reads, errs, pops } = await open(b, opts);
  let s = await state(p);
  pass(`${L} signed in with no password (login screen hidden)`, s.login === 'none', s.login);
  pass(`${L} opens on Dashboard`, s.title === 'Dashboard' && s.visible.includes('page-dashboard'), s.title);

  /* main buttons in the topbar */
  const navOpen = async () => { if (L === 'phone' && !(await p.evaluate(() => document.getElementById('sidebar').classList.contains('open')))) { await p.click('.menu-btn'); await p.waitForTimeout(350); } };
  if (L === 'phone') {
    await p.click('.menu-btn'); await p.waitForTimeout(350); touch.push('menu');
    s = await state(p); pass(`${L} menu opens the side nav`, s.sidebarOpen);
    await p.mouse.click(p.viewportSize().width - 8, p.viewportSize().height / 2); await p.waitForTimeout(350);
    s = await state(p); pass(`${L} tapping the mask closes the side nav`, !s.sidebarOpen);
  }
  const th0 = (await state(p)).theme;
  await p.click('#theme-btn'); await p.waitForTimeout(200); touch.push('theme');
  const th1 = (await state(p)).theme;
  pass(`${L} theme switches`, th0 !== th1, `${th0} -> ${th1}`);
  await p.click('#theme-btn'); await p.waitForTimeout(200);
  pass(`${L} theme switches back`, (await state(p)).theme === th0);
  const r0 = reads.n;
  await p.click('#refresh-btn'); await p.waitForTimeout(1500); touch.push('refresh');
  pass(`${L} refresh reads again`, reads.n > r0, `${reads.n - r0} reads`);
  await p.click('#notif-btn'); await p.waitForTimeout(250); touch.push('notifications');
  pass(`${L} bell opens the notifications panel`, await p.locator('#notif-panel').isVisible());
  await p.click('#notif-btn'); await p.waitForTimeout(250);
  pass(`${L} bell again closes it`, !(await p.locator('#notif-panel').isVisible()));

  /* every top-level nav item, then every segmented tab on that page */
  await navOpen();
  const navIds = await p.$$eval('#sidebar .nav-item', xs => xs.filter(x => x.offsetParent !== null && getComputedStyle(x).display !== 'none').map(x => x.id));
  if (L === 'phone') { await p.mouse.click(p.viewportSize().width - 8, p.viewportSize().height / 2); await p.waitForTimeout(300); }
  const tabsSeen = new Set();
  for (const id of navIds) {
    if (id === 'nav-brain' || id === 'nav-askbb' || id === 'bbset-nav') continue;
    await navOpen();
    const label = (await p.textContent('#' + id)).trim();
    const e0 = errs.length;
    await p.click('#' + id); await p.waitForTimeout(1200); touch.push(label);
    s = await state(p);
    const want = id.replace('nav-', '');
    pass(`${L} nav ${label} shows its page`, s.visible.length === 1 && !s.sidebarOpen && (await p.$eval('#' + id, x => x.classList.contains('active'))), `${s.visible.join()} title ${s.title}${s.sidebarOpen ? ' nav still open' : ''}`);
    pass(`${L} nav ${label} throws nothing`, errs.length === e0, errs.slice(e0).join(' | '));
    const tabs = await p.$$eval('.page-section[style*="block"] .v2-seg-bar .tab-btn', xs => xs.filter(x => x.offsetParent !== null).map(x => x.textContent.trim()));
    for (const t of tabs) {
      if (tabsSeen.has(want + ':' + t)) continue; tabsSeen.add(want + ':' + t);
      const e1 = errs.length;
      await p.locator('.page-section[style*="block"] .v2-seg-bar .tab-btn').filter({ hasText: new RegExp('^' + t + '$') }).first().click(); await p.waitForTimeout(1000); touch.push(label + '/' + t);
      s = await state(p);
      const active = await p.$$eval('.page-section[style*="block"] .v2-seg-bar .tab-btn.active', xs => xs.map(x => x.textContent.trim()));
      pass(`${L} ${label} tab ${t} shows`, s.visible.length === 1 && active.includes(t), `${s.visible.join()} title ${s.title} active ${active.join()}`);
      pass(`${L} ${label} tab ${t} throws nothing`, errs.length === e1, errs.slice(e1).join(' | '));
    }
  }
  rows.push(`INFO ${L} nav order: ${navIds.join(', ')}`);
  /* Settings: opens the shared sheet; a tap on the dim closes it; Back closes it */
  if (navIds.includes('bbset-nav')) {
    await navOpen(); await p.click('#bbset-nav'); await p.waitForTimeout(400); touch.push('Settings');
    pass(`${L} Settings opens its sheet`, await p.locator('#bbset-sheet').isVisible());
    const sh = await p.evaluate(() => [...document.querySelectorAll('#bbset-sheet button')].map(x => x.textContent.trim()));
    rows.push(`INFO ${L} settings buttons: ${sh.join(' | ')}`);
    await p.goBack(); await p.waitForTimeout(600); touch.push('Settings Back');
    const stillIn = p.url().startsWith(BASE.split('#')[0]);
    pass(`${L} Back once closes Settings and stays in the CC`, stillIn && !(await p.locator('#bbset-sheet').isVisible().catch(() => false)), `url ${p.url()} sheet ${stillIn ? await p.locator('#bbset-sheet').isVisible() : 'gone'}`);
    if (!stillIn) { await p.goForward(); await p.waitForSelector('#ho-send-btn', { timeout: 20000 }); await p.waitForTimeout(2000); }
    if (await p.locator('#bbset-sheet').isVisible().catch(() => false)) { await p.mouse.click(5, 880 > (p.viewportSize().height) ? 5 : p.viewportSize().height - 5); await p.waitForTimeout(300); }
    if (await p.locator('#bbset-sheet').isVisible().catch(() => false)) await p.evaluate(() => BBSET.close());
    await navOpen(); const hS = (await state(p)).hist; await p.click('#bbset-nav'); await p.waitForTimeout(400);
    await p.click('#bbset-sheet button[aria-label=Close]'); await p.waitForTimeout(400); touch.push('Settings cross');
    pass(`${L} the Settings cross closes it and leaves no history behind`, !(await p.locator('#bbset-sheet').isVisible()) && p.url().startsWith(BASE.split('#')[0]), `hist ${hS} -> ${(await state(p)).hist}`);
    await p.goBack(); await p.waitForTimeout(500);
    pass(`${L} after the cross one Back leaves the CC (no stale entry)`, !p.url().startsWith(BASE.split('#')[0]), p.url());
    await p.goForward(); await p.waitForSelector('#ho-send-btn', { timeout: 20000 }); await p.waitForTimeout(2500);
    await navOpen(); await p.click('#bbset-nav'); await p.waitForTimeout(400);
    await p.mouse.click(5, 5); await p.waitForTimeout(300); touch.push('Settings dim');
    pass(`${L} a tap on the dim closes Settings`, !(await p.locator('#bbset-sheet').isVisible()));
    if (await p.locator('#bbset-sheet').isVisible()) await p.evaluate(() => BBSET.close());
    await p.evaluate(() => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('nav-mask').classList.remove('open'); });
  }
  /* Digital Brain opens a new tab; Booster opens the owners' desk */
  await navOpen();
  const popP = ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await p.click('#nav-brain'); const pop = await popP; touch.push('Digital Brain');
  pass(`${L} Digital Brain opens bb-brain in a new tab`, !!pop, pop ? pop.url() : 'no tab');
  if (pop) await pop.close();
  if (L === 'phone') { s = await state(p); if (s.sidebarOpen) { rows.push(`INFO ${L} side nav still open after Digital Brain (the person returns to the menu)`); await p.mouse.click(p.viewportSize().width - 8, p.viewportSize().height / 2); await p.waitForTimeout(300); } }
  await navOpen();
  await p.click('#nav-askbb'); await p.waitForTimeout(3500); touch.push('Booster');
  const covered = () => p.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && !e.closest('#app') && !e.closest('#sidebar') ? (e.id || e.tagName) : ''; });
  const askOpen = [await covered()].filter(Boolean);
  pass(`${L} Booster opens the owners' desk`, askOpen.length > 0, askOpen.join());
  if (L === 'phone') rows.push(`INFO ${L} side nav under Booster is ${(await state(p)).sidebarOpen ? 'open' : 'shut'}`);
  const h0 = (await state(p)).hist;
  await p.goBack().catch(() => {}); await p.waitForTimeout(600);
  s = await state(p);
  if (L === 'phone') rows.push(`INFO ${L} after Booster Back the side nav is ${(await state(p)).sidebarOpen ? 'open' : 'shut'}`);
  pass(`${L} Back once closes Booster and stays in the CC`, s.url.startsWith(BASE.split('#')[0]) && !(await covered()), s.url + ' ' + (await covered().catch(() => '')));
  if (!s.url.startsWith(BASE.split('#')[0])) { await p.goto(BASE); await p.waitForSelector('#ho-send-btn'); await p.waitForTimeout(1500); }
  /* make sure no overlay is left over */
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.evaluate(() => { const c = document.querySelector('[id*=askbb] .close, #askbb-close'); if (c) c.click(); });

  /* back on Dashboard for the sheet */
  await navOpen(); await p.click('#nav-dashboard'); await p.waitForTimeout(1200);

  /* Send a task: the whole sheet */
  const histBefore = (await state(p)).hist;
  await p.click('#ho-send-btn'); await p.waitForTimeout(400); touch.push('Send a task');
  pass(`${L} Send a task opens the sheet`, await p.locator('#ho-sheet:not(.hidden)').count() === 1);
  pass(`${L} sheet focuses What needs doing`, await p.evaluate(() => document.activeElement && document.activeElement.id === 'ho-text'));
  await p.click('.ho-chip:has-text("Ushane")'); await p.waitForTimeout(150); touch.push('chip Ushane');
  pass(`${L} chip Ushane presses`, await p.locator('.ho-chip[aria-pressed="true"]', { hasText: 'Ushane' }).count() === 1);
  await p.click('.ho-main'); await p.waitForTimeout(200); touch.push('Send with no title');
  const e0t = (await p.textContent('#ho-sheet .ho-err').catch(() => '')).trim();
  pass(`${L} Send with no title says what is missing and writes nothing`, e0t === 'Say what needs doing first.' && !writes.some(w => /bb_handoff_send/.test(w.path)), e0t);
  await p.fill('#ho-text', 'Cut the Waverley reel'); await p.waitForTimeout(600); touch.push('title');
  pass(`${L} title typed, main button on`, await p.locator('.ho-main').evaluate(x => !x.disabled), await p.textContent('.ho-main'));
  await p.fill('#ho-due', '2026-11-13'); touch.push('due');
  await p.selectOption('#ho-client', '43'); touch.push('client');
  await p.fill('#ho-note', 'The raw files are on the drive'); touch.push('note');
  await p.waitForTimeout(300);
  pass(`${L} Day, Client and Note hold their values`, (await p.inputValue('#ho-due')) === '2026-11-13' && (await p.inputValue('#ho-client')) === '43' && (await p.inputValue('#ho-note')) === 'The raw files are on the drive');
  const wb = writes.length;
  await p.click('.ho-main'); await p.waitForTimeout(800); touch.push('Send');
  const sent = writes.slice(wb).filter(w => /bb_handoff_send/.test(w.path));
  const sb = sent[0] ? JSON.parse(sent[0].body || '{}') : {};
  pass(`${L} Send writes one bb_handoff_send with every field`, sent.length === 1 && sb.p_to_id === 5 && sb.p_title === 'Cut the Waverley reel' && sb.p_due === '2026-11-13' && sb.p_client_id === 43 && sb.p_note === 'The raw files are on the drive' && sb.p_by === 'THULAIB', JSON.stringify(sb));
  const autoClosed = await p.locator('#ho-sheet.hidden').count() === 1;
  const toastTxt = await p.evaluate(() => [...document.querySelectorAll('[class*=toast],[id*=toast]')].filter(x => { const r = x.getBoundingClientRect(); return r.height > 0 && getComputedStyle(x).display !== 'none' && getComputedStyle(x).visibility !== 'hidden'; }).map(x => x.textContent.trim()).join(' / '));
  rows.push(`INFO ${L} after Send: sheet ${autoClosed ? 'closed itself' : 'open'}; toast "${toastTxt.slice(0, 80)}"`);
  if (!autoClosed) {
    const doneTxt = (await p.textContent('#ho-sheet .modal-body')).trim();
    pass(`${L} after Send the sheet says it saved`, /^Saved|Sent/.test(doneTxt), doneTxt.slice(0, 60));
  } else pass(`${L} after Send the sheet closes and a toast says it went`, /sent|saved/i.test(toastTxt), toastTxt.slice(0, 80));
  if (autoClosed) { await p.click('#ho-send-btn'); await p.waitForTimeout(400); }
  await p.click('#ho-sheet .modal-close'); await p.waitForTimeout(400); touch.push('close x');
  pass(`${L} the cross closes the sheet`, await p.locator('#ho-sheet.hidden').count() === 1);
  s = await state(p);
  pass(`${L} closing leaves no lock and no extra history`, !s.locked && s.hist === histBefore, `locked ${s.locked} hist ${histBefore} -> ${s.hist}`);
  /* reopen: it is fresh */
  await p.click('#ho-send-btn'); await p.waitForTimeout(400);
  pass(`${L} reopened sheet is empty`, (await p.inputValue('#ho-text')) === '' && await p.locator('.ho-chip[aria-pressed="true"]').count() === 0);
  /* tap outside closes */
  const vp = p.viewportSize();
  await p.mouse.click(5, 5); await p.waitForTimeout(400); touch.push('tap outside');
  const outside = await p.locator('#ho-sheet.hidden').count() === 1;
  pass(`${L} a tap outside the sheet closes it`, outside, outside ? '' : 'still open');
  if (!outside) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  /* Back once and Back twice */
  await p.click('#ho-send-btn'); await p.waitForTimeout(400);
  await p.goBack(); await p.waitForTimeout(600); touch.push('Back once');
  s = await state(p);
  pass(`${L} Back once closes the sheet and stays in the CC`, await p.locator('#ho-sheet.hidden').count() === 1 && s.url.startsWith(BASE.split('#')[0]) && !s.locked, s.url);
  await p.waitForTimeout(800);
  pass(`${L} the sheet stays shut 800ms later`, await p.locator('#ho-sheet.hidden').count() === 1);
  await p.goBack(); await p.waitForTimeout(800); touch.push('Back twice');
  pass(`${L} Back twice leaves the CC (one Back undid one thing)`, !p.url().startsWith(BASE.split('#')[0]), p.url());
  await p.goForward(); await p.waitForTimeout(2500);
  pass(`${L} Forward returns to the CC signed in`, await p.locator('#ho-send-btn').count() === 1);

  /* the From card on Dashboard */
  const card = await p.$$eval('#ho-card-mount button', xs => xs.filter(x => x.offsetParent !== null).map(x => x.textContent.trim()));
  pass(`${L} From card shows its buttons`, card.length > 0, card.join(' | '));
  if (card.includes('Done')) {
    const w0 = writes.length;
    await p.click('#ho-card-mount button:has-text("Done")'); await p.waitForTimeout(500); touch.push('card Done');
    const more = await p.$$eval('#ho-card-mount button', xs => xs.filter(x => x.offsetParent !== null).map(x => x.textContent.trim()));
    pass(`${L} card Done asks or writes`, writes.length > w0 || more.join() !== card.join(), more.join(' | '));
  }

  /* Switch signs out */
  await navOpen();
  await p.click('.signout-btn'); await p.waitForTimeout(800); touch.push('Switch');
  s = await state(p);
  pass(`${L} Switch signs out to the login screen`, s.login !== 'none', s.login);
  pass(`${L} Switch clears the saved session`, await p.evaluate(() => !localStorage.getItem('bb_cc_rt') && !localStorage.getItem('bb_cc_role')));

  pass(`${L} no page errors overall`, errs.length === 0, [...new Set(errs)].slice(0, 6).join(' | '));
  rows.push(`INFO ${L} writes stubbed: ${writes.length} ${[...new Set(writes.map(w => w.m + ' ' + w.path.split('?')[0]))].join(', ')}`);
  rows.push(`INFO ${L} reads ${reads.n}, 401s: ${[...new Set(reads.s401)].join(', ')}`);
  await ctx.close();
}
await b.close();
console.log(rows.join('\n'));
console.log(`touchpoints pressed: ${touch.length}`);
console.log(`RESULT: ${total - bad} of ${total} PASS`);
process.exit(bad ? 1 : 0);
