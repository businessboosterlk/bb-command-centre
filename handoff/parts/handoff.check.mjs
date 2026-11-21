/* Pass marks for H4 (the Send a task sheet) and H5 (the From Thulaib card), 8 Nov 2026.
   Opens the real index.html as THULAIB on a 390 px phone and a 1440 px desk with every Supabase call answered by
   test data (nothing reaches the database). Checks the action bar rule from bb-workshop-os/scripts/ui-sheets.mjs
   (each row is one full width button or equal buttons sharing it, 44 px tall, no wrapped or cut label, primary first,
   quiet cancel last), the reader filling the sheet, the two bb_handoff_send calls, the WhatsApp link, and the card's
   Done, Stuck and Carry on calls with their exact bodies.
   node handoff/parts/handoff.check.mjs [base-url] */
import { chromium } from '/Users/thulaibhassen/bb-systems/batch/node_modules/playwright/index.mjs';
const BASE = process.argv[2] || 'http://127.0.0.1:8793/index.html';
const rows = []; let bad = 0, total = 0;
const pass = (name, ok, note = '') => { total++; if (!ok) bad++; rows.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  (' + note + ')' : ''}`); };

const TEAM = [[5, 'USHANE'], [12, 'NIRVANA'], [17, 'FARHATH'], [3, 'SUHANA'], [23, 'THULAIB'], [24, 'SHIARA']].map(([id, name]) => ({ id, name, active: true }));
const REACH = [[5, 2], [12, 1], [17, 1], [3, 0], [23, 1], [24, 0]].map(([team_member_id, phones]) => ({ team_member_id, phones }));
const CLIENTS = [{ id: 41, name: 'SASTHO' }, { id: 42, name: 'SUN ZAPPER' }, { id: 43, name: 'WAVERLEY' }];
/* tasks sent TO Thulaib (the card): one fresh, one late, one stuck with Shiara's reply, one done today */
const CARD = [
  { id: 901, title: 'Check the Waverley invoice', due: '2026-11-20', client_id: 43, notes: 'The one from October', sent_by: 'SHIARA', seen_at: null, stuck_note: null, stuck_at: null, stuck_reply: null, stuck_reply_at: null, done: false, done_note: null, completed_at: null, created_at: '2026-11-08T03:00:00Z' },
  { id: 902, title: 'Call Sastho about the shoot', due: '2026-11-02', client_id: 41, notes: null, sent_by: 'SHIARA', seen_at: '2026-11-07T03:00:00Z', stuck_note: null, stuck_at: null, stuck_reply: null, stuck_reply_at: null, done: false, done_note: null, completed_at: null, created_at: '2026-11-07T03:00:00Z' },
  { id: 903, title: 'Sign the Sun Zapper plan', due: null, client_id: 42, notes: null, sent_by: 'SHIARA', seen_at: '2026-11-07T03:00:00Z', stuck_note: '07 Nov 10:15 Waiting on the final numbers', stuck_at: '2026-11-07T04:45:00Z', stuck_reply: 'They come Monday, sign the rest now', stuck_reply_at: '2026-11-07T05:00:00Z', done: false, done_note: null, completed_at: null, created_at: '2026-11-06T03:00:00Z' },
  { id: 904, title: 'Approve the leave sheet', due: null, client_id: null, notes: null, sent_by: 'SHIARA', seen_at: '2026-11-08T03:00:00Z', stuck_note: null, stuck_at: null, stuck_reply: null, stuck_reply_at: null, done: true, done_note: 'Approved both', completed_at: '2026-11-08T05:00:00Z', created_at: '2026-11-05T03:00:00Z' }
];
/* tasks Thulaib SENT that are stuck (the strip) */
const STUCK = [{ id: 950, title: 'Cut the Sastho reel', client_id: 41, sent_to_id: 5, stuck_note: '08 Nov 09:40 The footage is not on the drive', stuck_at: '2026-11-08T04:10:00Z', stuck_reply: null, stuck_reply_at: null }];

async function page(b, opts) {
  const ctx = await b.newContext({ ...opts, colorScheme: 'dark' });
  await ctx.addInitScript(() => { localStorage.setItem('bb_cc_role', 'th'); localStorage.setItem('bb_cc_rt', 'test-refresh'); sessionStorage.setItem('bb_cc_role', 'th'); });
  const calls = []; let nextId = 7001;
  await ctx.route(/supabase\.co\//, async (route) => {
    const req = route.request(), u = new URL(req.url()), path = u.pathname + u.search;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname.startsWith('/auth/v1/token')) return json({ access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 });
    if (u.pathname.startsWith('/rest/v1/rpc/bb_handoff_')) {
      const name = u.pathname.split('/').pop(); const body = JSON.parse(req.postData() || '{}'); calls.push({ name, body });
      if (name === 'bb_handoff_send') return json(nextId++);
      return json({ ok: true });
    }
    if (u.pathname === '/rest/v1/team_members' && u.search.includes('select=id,name&')) return json(TEAM);
    if (u.pathname === '/rest/v1/bb_push_reach') return json(REACH);
    if (u.pathname === '/rest/v1/clients' && u.search.includes('status=eq.active')) return json(CLIENTS);
    if (u.pathname === '/rest/v1/tasks' && u.search.includes('sent_to_id=eq.23')) return json(CARD);
    if (u.pathname === '/rest/v1/tasks' && u.search.includes('sent_by=eq.THULAIB')) return json(STUCK);
    if (req.method() === 'GET' || req.method() === 'HEAD') return json([]);
    return json([]);
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e.message || e)));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#ho-send-btn', { timeout: 15000 });
  await p.waitForSelector('#ho-card-mount .ho-card', { timeout: 15000 }).catch(() => {});
  return { ctx, p, calls, errs };
}

/* the bar rule, measured on the open sheet: rows found by their y position */
async function bar(p, label, expectFirstPrimary = true) {
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const foot = document.querySelector('#ho-sheet:not(.hidden) .ho-bar'); if (!foot) return { err: 'no action bar' };
    const W = foot.clientWidth - parseFloat(getComputedStyle(foot).paddingLeft) - parseFloat(getComputedStyle(foot).paddingRight);
    const btns = [...foot.children].filter(x => getComputedStyle(x).display !== 'none');
    const out = []; const byRow = {};
    for (const x of btns) { const t = Math.round(x.getBoundingClientRect().top); (byRow[t] = byRow[t] || []).push(x); }
    const gap = parseFloat(getComputedStyle(foot).columnGap || '0');
    for (const row of Object.values(byRow)) {
      const ws = row.map(x => x.getBoundingClientRect().width), hs = row.map(x => x.getBoundingClientRect().height);
      const sum = ws.reduce((a, w) => a + w, 0) + (row.length - 1) * gap;
      if (Math.abs(sum - W) > 1.5) out.push(`row not full width: ${Math.round(sum)} of ${Math.round(W)}`);
      if (Math.max(...ws) - Math.min(...ws) > 1.5) out.push(`unequal widths ${ws.map(Math.round).join('/')}`);
      if (Math.max(...hs) - Math.min(...hs) > 1) out.push('unequal heights in a row');
      for (const x of row) {
        const h = x.getBoundingClientRect().height;
        if (h < 43.5) out.push(`"${x.textContent.trim()}" only ${Math.round(h)}px tall`);
        if (x.scrollWidth > x.clientWidth + 1) out.push(`"${x.textContent.trim()}" label cut`);
        for (const t of [...x.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())) { const g = document.createRange(); g.selectNodeContents(t); if (g.getClientRects().length > 1) out.push(`"${x.textContent.trim()}" label wraps`); }
      }
    }
    const first = btns[0], last = btns[btns.length - 1];
    return { out, n: btns.length, firstPrimary: first && first.classList.contains('btn-primary'), lastQuiet: last && last.classList.contains('ho-quiet'), labels: btns.map(x => x.textContent.trim()) };
  });
  const order = r.err ? '' : (expectFirstPrimary && !r.firstPrimary ? 'primary not first; ' : '') + (!r.lastQuiet ? 'quiet cancel not last' : '');
  pass(`${label}: action bar`, !r.err && r.out.length === 0 && !order, r.err || ([...r.out, order].filter(Boolean).join('; ') || r.labels.join(' | ')));
}

const b = await chromium.launch();
for (const [size, opts] of [['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['desk', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]]) {
  const { ctx, p, calls, errs } = await page(b, opts);
  const L = size;
  /* H4: the sheet */
  await p.click('#ho-send-btn'); await p.waitForTimeout(250);
  pass(`${L} sheet opens from the topbar`, await p.locator('#ho-sheet:not(.hidden)').count() === 1);
  await bar(p, `${L} empty sheet`);
  pass(`${L} empty sheet: main button reads Pick who it is for and is off`, await p.locator('.ho-main').evaluate(x => x.textContent === 'Pick who it is for' && x.disabled));
  const sizes = await p.evaluate(() => [...document.querySelectorAll('#ho-sheet .ho-in')].map(x => parseFloat(getComputedStyle(x).fontSize)));
  pass(`${L} every field is 16px or more (no zoom on tap)`, sizes.length === 4 && sizes.every(s => s >= 16), sizes.join(','));
  await p.fill('#ho-text', 'Ushane and Suhana, cut the Sastho reel by Friday'); await p.waitForTimeout(500);
  const pressed = await p.$$eval('.ho-chip[aria-pressed="true"]', xs => xs.map(x => x.firstChild.textContent));
  pass(`${L} the reader presses Ushane and Suhana`, pressed.join() === 'Ushane,Suhana', pressed.join());
  pass(`${L} Suhana's chip says No phone alerts`, await p.locator('.ho-chip', { hasText: 'Suhana' }).locator('.ho-chip-note').count() === 1);
  const day = await p.inputValue('#ho-due'), cl = await p.inputValue('#ho-client');
  pass(`${L} the reader fills Day and Client`, cl === '41' && /^2026-\d\d-\d\d$/.test(day), day + ' ' + cl);
  pass(`${L} Read line`, /^Read: Ushane and Suhana, \w{3} \d{1,2} \w{3}, SASTHO$/.test(await p.textContent('.ho-read')), await p.textContent('.ho-read'));
  pass(`${L} main button reads Send, then WhatsApp them`, (await p.textContent('.ho-main')) === 'Send, then WhatsApp them');
  await bar(p, `${L} WhatsApp sheet`);
  /* a chip tapped by hand is never overwritten by the reader again */
  await p.click('.ho-chip:has-text("Nirvana")'); await p.fill('#ho-text', 'Ushane and Suhana, cut the Sastho reel by Friday please'); await p.waitForTimeout(500);
  const hand = await p.$$eval('.ho-chip[aria-pressed="true"]', xs => xs.map(x => x.firstChild.textContent));
  pass(`${L} a chip tapped by hand stays as tapped`, hand.join() === 'Ushane,Nirvana,Suhana', hand.join());
  await p.click('.ho-chip:has-text("Nirvana")'); await p.waitForTimeout(150);
  /* Send */
  const before = calls.length;
  await p.click('.ho-main'); await p.waitForTimeout(700);
  const sends = calls.slice(before).filter(c => c.name === 'bb_handoff_send');
  pass(`${L} Send calls bb_handoff_send twice, 5 then 3`, sends.map(c => c.body.p_to_id).join() === '5,3', sends.map(c => c.body.p_to_id).join());
  const s0 = sends[0] && sends[0].body;
  pass(`${L} send body: title, day, client, by`, s0 && s0.p_title === 'Cut the Sastho reel' && s0.p_client_id === 41 && /^2026-/.test(s0.p_due) && s0.p_by === 'THULAIB' && s0.p_note === null, JSON.stringify(s0));
  pass(`${L} done state says Saved. Now tell them on WhatsApp.`, (await p.textContent('#ho-sheet .modal-body')).trim() === 'Saved. Now tell them on WhatsApp.');
  const wa = await p.$$eval('.ho-bar a.ho-wa', xs => xs.map(x => ({ t: x.textContent, h: x.href, tg: x.target })));
  const msg = wa[0] ? decodeURIComponent(wa[0].h.split('text=')[1]) : '';
  pass(`${L} one WhatsApp link, for Suhana only, opening wa.me with the task typed in`, wa.length === 1 && wa[0].t === 'WhatsApp Suhana' && wa[0].h.startsWith('https://wa.me/?text=') && wa[0].tg === '_blank' && /^Suhana, a task from Thulaib: Cut the Sastho reel \(SASTHO\), by \w{3} \d{1,2} \w{3}\.$/.test(msg), msg);
  await bar(p, `${L} WhatsApp done state`);
  const waCalls = calls.filter(c => /whatsapp|wa\.me/i.test(JSON.stringify(c)));
  pass(`${L} the page sends nothing to WhatsApp itself`, waCalls.length === 0);
  await p.click('.ho-bar .ho-quiet'); await p.waitForTimeout(250);
  pass(`${L} Close shuts the sheet`, await p.locator('#ho-sheet.hidden').count() === 1);
  /* one person with a phone: no WhatsApp */
  await p.click('#ho-send-btn'); await p.fill('#ho-text', 'Nirvana, post the Waverley carousel tomorrow'); await p.waitForTimeout(500);
  pass(`${L} one person with alerts: Send to Nirvana`, (await p.textContent('.ho-main')) === 'Send to Nirvana');
  await bar(p, `${L} one person sheet`);
  await p.click('.ho-chip:has-text("Farhath")'); await p.waitForTimeout(150);
  pass(`${L} two people with alerts: Send as 2 tasks`, (await p.textContent('.ho-main')) === 'Send as 2 tasks');
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  pass(`${L} Escape closes the sheet`, await p.locator('#ho-sheet.hidden').count() === 1);
  /* phone Back closes the sheet once and leaves the page where it was */
  if (size === 'phone') {
    await p.click('#ho-send-btn'); await p.waitForTimeout(300);
    await p.goBack(); await p.waitForTimeout(500);
    pass(`${L} Back closes the sheet`, await p.locator('#ho-sheet.hidden').count() === 1);
    pass(`${L} the page is still the Command Centre after Back`, p.url().startsWith(BASE.split('#')[0]) && await p.locator('#ho-send-btn').count() === 1, p.url());
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    pass(`${L} page never scrolls sideways`, over <= 0, over + 'px');
  }
  /* H4: the Stuck strip, Reply and Forward */
  pass(`${L} Stuck strip shows the stuck task`, (await p.textContent('#ho-stuck-card .ho-st-who').catch(() => '')) === 'Ushane is stuck');
  await p.click('#ho-stuck-card button:has-text("Send reply")'); await p.waitForTimeout(150);
  pass(`${L} empty reply asks for a reply`, (await p.textContent('#ho-stuck-card .ho-err')) === 'Type a reply first.');
  await p.fill('#ho-stuck-card .ho-st-in', 'It is in the Sastho folder now'); const b4 = calls.length;
  await p.click('#ho-stuck-card button:has-text("Send reply")'); await p.waitForTimeout(500);
  const rep = calls.slice(b4).find(c => c.name === 'bb_handoff_reply');
  pass(`${L} Send reply calls bb_handoff_reply`, rep && rep.body.p_id === 950 && rep.body.p_by === 'THULAIB' && rep.body.p_reply === 'It is in the Sastho folder now', JSON.stringify(rep && rep.body));
  await p.click('#ho-stuck-card button:has-text("Forward")'); await p.waitForTimeout(500);
  pass(`${L} Forward opens the sheet with the stuck line and the client`, (await p.inputValue('#ho-text')) === 'The footage is not on the drive' && (await p.inputValue('#ho-client')) === '41', await p.inputValue('#ho-text'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);

  /* H5: the card from test data */
  const card = p.locator('#ho-card-mount .ho-card');
  pass(`${L} card shows From Shiara`, (await card.locator('.ho-card-title').textContent().catch(() => '')) === 'From Shiara');
  pass(`${L} card says 3 to do`, (await card.locator('.ho-card-sub').textContent().catch(() => '')) === '3 to do');
  pass(`${L} card rows in order, done last`, (await card.locator('.ho-t-title').allTextContents()).join('|') === 'Check the Waverley invoice|Call Sastho about the shoot|Sign the Sun Zapper plan|Approve the leave sheet');
  pass(`${L} late row says was due`, (await card.locator('.ho-task[data-id="902"] .ho-late').textContent().catch(() => '')) === 'was due Mon 2 Nov');
  pass(`${L} done row shows the what I did line`, (await card.locator('.ho-task[data-id="904"] .ho-t-meta').textContent().catch(() => '')) === 'Done · Approved both');
  const seen = calls.filter(c => c.name === 'bb_handoff_seen' && c.body.p_carry_on === false);
  pass(`${L} an unseen row is marked seen once`, seen.length >= 1 && seen.every(c => c.body.p_id === 901 && c.body.p_who === 'THULAIB'), JSON.stringify(seen.map(c => c.body)));
  /* Done with the optional line */
  let k = calls.length;
  await card.locator('.ho-task[data-id="901"] button:has-text("Done")').click(); await p.waitForTimeout(150);
  const fs = await card.locator('.ho-task[data-id="901"] .ho-t-form .ho-in').evaluate(x => parseFloat(getComputedStyle(x).fontSize)).catch(() => 0);
  pass(`${L} Done opens a What I did line at 16px`, fs >= 16 && (await card.locator('.ho-task[data-id="901"] .ho-t-form .ho-in').getAttribute('placeholder')) === 'What I did (optional)');
  await card.locator('.ho-task[data-id="901"] .ho-t-form .ho-in').fill('Paid on the 6th');
  await card.locator('.ho-task[data-id="901"] button:has-text("Mark done")').click(); await p.waitForTimeout(500);
  let c = calls.slice(k).find(x => x.name === 'bb_handoff_done');
  pass(`${L} Mark done calls bb_handoff_done { p_id 901, p_who THULAIB, p_note }`, c && c.body.p_id === 901 && c.body.p_who === 'THULAIB' && c.body.p_note === 'Paid on the 6th', JSON.stringify(c && c.body));
  /* Done with nothing typed sends null */
  k = calls.length;
  await card.locator('.ho-task[data-id="902"] button:has-text("Done")').click(); await card.locator('.ho-task[data-id="902"] button:has-text("Mark done")').click(); await p.waitForTimeout(500);
  c = calls.slice(k).find(x => x.name === 'bb_handoff_done');
  pass(`${L} Mark done with no line sends p_note null`, c && c.body.p_id === 902 && c.body.p_note === null, JSON.stringify(c && c.body));
  /* Stuck needs a reason */
  k = calls.length;
  await card.locator('.ho-task[data-id="902"] button:has-text("Stuck")').click(); await card.locator('.ho-task[data-id="902"] .ho-t-form button:has-text("Send")').click(); await p.waitForTimeout(200);
  pass(`${L} Stuck with nothing typed asks why and calls nothing`, calls.slice(k).length === 0 && (await card.locator('.ho-task[data-id="902"] .ho-err').textContent()) === 'Say what is in the way first.');
  await card.locator('.ho-task[data-id="902"] .ho-t-form .ho-in').fill('Sastho has not picked a day');
  await card.locator('.ho-task[data-id="902"] .ho-t-form button:has-text("Send")').click(); await p.waitForTimeout(500);
  c = calls.slice(k).find(x => x.name === 'bb_handoff_stuck');
  pass(`${L} Stuck calls bb_handoff_stuck { p_id 902, p_who THULAIB, p_note }`, c && c.body.p_id === 902 && c.body.p_who === 'THULAIB' && c.body.p_note === 'Sastho has not picked a day', JSON.stringify(c && c.body));
  /* Carry on after a reply */
  pass(`${L} the stuck row shows the reply`, (await card.locator('.ho-task[data-id="903"] .ho-t-reply').textContent().catch(() => '')) === 'Shiara: They come Monday, sign the rest now');
  k = calls.length;
  await card.locator('.ho-task[data-id="903"] button:has-text("Carry on")').click(); await p.waitForTimeout(500);
  c = calls.slice(k).find(x => x.name === 'bb_handoff_seen');
  pass(`${L} Carry on calls bb_handoff_seen { p_id 903, p_who THULAIB, p_carry_on true }`, c && c.body.p_id === 903 && c.body.p_who === 'THULAIB' && c.body.p_carry_on === true, JSON.stringify(c && c.body));
  const small = await p.evaluate(() => [...document.querySelectorAll('#ho-card-mount button, #ho-stuck-card button')].filter(x => x.offsetParent && x.getBoundingClientRect().height < 43.5).map(x => x.textContent));
  pass(`${L} every card button is 44px tall`, small.length === 0, small.join(','));
  pass(`${L} no page errors from the block`, !errs.some(e => /ho[A-Z]|hoRead|hoSheet|hoCard|BBHO/.test(e)), errs.filter(e => /ho/.test(e)).join(' | '));
  if (size === 'phone') await p.screenshot({ path: '/private/tmp/claude-501/-Users-thulaibhassen-bb-command-centre--claude-worktrees-vigilant-cannon-efb76a/495970d7-1a2d-4a8b-9b42-526cb22bf75c/scratchpad/ho-phone-card.png', fullPage: false });
  await ctx.close();
}
/* a staff role never gets the block */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { localStorage.removeItem('bb_cc_role'); sessionStorage.removeItem('bb_cc_role'); });
  await ctx.route(/supabase\.co\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p = await ctx.newPage(); await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  await p.evaluate(() => document.body.setAttribute('data-role', 'demo')); await p.waitForTimeout(400);
  pass('demo role: no Send a task button, no card, no sheet', await p.locator('#ho-send-btn, #ho-card-mount, #ho-sheet, #ho-stuck-card').count() === 0);
  await ctx.close();
}
await b.close();
console.log(rows.join('\n'));
console.log(`\nRESULT: ${total - bad} of ${total} PASS${bad ? ', ' + bad + ' FAIL' : ''}`);
process.exit(bad ? 1 : 0);
