/* Glue for the Send a task loop (Claude, 8 Nov 2026). Owners only: THULAIB (th) and SHIARA (sh).
   For any other role nothing below is in the page. Writes go only through the bb_handoff_* functions. */
(function () {
  'use strict';
  var OWNERS = { th: { name: 'THULAIB', id: 23 }, sh: { name: 'SHIARA', id: 24 } };
  var S = { team: null, reach: {}, clients: null, card: null, cardFor: null, inited: false, waitT: null };

  function owner() { return OWNERS[document.body.getAttribute('data-role')] || null; }
  function me() { var o = owner(); return o ? o.name : ''; }
  function today() { return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }

  async function call(path, body) {
    if (typeof bbAuthEnsure === 'function') await bbAuthEnsure();
    var h = { apikey: SB_KEY, Authorization: bbBearer() };
    var o = { headers: h, cache: 'no-store' };
    if (body) { h['Content-Type'] = 'application/json'; o.method = 'POST'; o.body = JSON.stringify(body); }
    var r = await fetch(SB_URL + '/rest/v1/' + path, o);
    var t = await r.text(), j = null;
    try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
    if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
    return j;
  }
  function rpc(name, body) { return call('rpc/' + name, body); }

  function toast(msg) {
    if (typeof fincToast === 'function') fincToast(msg);
    else if (typeof sbWriteToast === 'function') sbWriteToast(msg);
  }

  async function loadRefs() {
    var res = await Promise.all([
      call('team_members?active=eq.true&select=id,name&order=name').catch(function () { return null; }),
      call('bb_push_reach?select=team_member_id,phones').catch(function () { return null; }),
      call('clients?status=eq.active&select=id,name&order=name').catch(function () { return null; })
    ]);
    if (res[0]) S.team = res[0];
    if (res[1]) { S.reach = {}; res[1].forEach(function (x) { S.reach[x.team_member_id] = Number(x.phones) || 0; }); }
    if (res[2]) S.clients = res[2];
  }
  function people() {
    var mine = me();
    return (S.team || []).filter(function (m) { return m.name && m.name.toUpperCase() !== mine; })
      .map(function (m) { return { id: m.id, name: m.name, phones: S.reach[m.id] || 0 }; });
  }
  function clients() {
    var c = S.clients || ((typeof D === 'object' && D && D.clients) || []).filter(function (x) { return !x.status || x.status === 'active'; });
    return c.map(function (x) { return { id: x.id, name: x.name }; });
  }
  function clientName(id) {
    var all = (S.clients || []).concat((typeof D === 'object' && D && D.clients) || []);
    for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i].name;
    return '';
  }

  /* the sender's strip: tasks I sent that are stuck now, with Reply and Forward (H4 stuck rows) */
  async function loadStuck() {
    var o = owner(), sec = document.getElementById('ho-stuck-card');
    if (!o || !sec) return;
    var rows = null;
    try {
      rows = await call('tasks?select=id,title,client_id,sent_to_id,stuck_note,stuck_at,stuck_reply,stuck_reply_at'
        + '&sent_by=eq.' + o.name + '&stuck_at=not.is.null&done=is.false&cancelled_at=is.null&order=stuck_at.asc');
    } catch (e) { rows = null; }
    if (!rows || !rows.length) { sec.hidden = true; return; }
    var names = {}; (S.team || []).forEach(function (m) { names[m.id] = m.name; });
    rows.forEach(function (r) { r.sent_to_name = names[r.sent_to_id] || 'Someone'; });
    sec.querySelector('.ho-card-sub').textContent = rows.length === 1 ? '1 person needs you' : rows.length + ' tasks need you';
    window.hoSheet.stuck(sec.querySelector('.ho-stuck-list'), rows);
    sec.hidden = false;
  }
  function onSent() {
    loadStuck();
    if (S.card) S.card.reload(true);
  }

  function sendButton() {
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'ho-send-btn'; b.className = 'btn-primary ho-send';
    b.setAttribute('aria-label', 'Send a task');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Send a task</span>';
    b.addEventListener('click', function () { if (window.hoSheet) window.hoSheet.open(); });
    return b;
  }
  function stuckShell() {
    var sec = document.createElement('section');
    sec.className = 'ho-card'; sec.id = 'ho-stuck-card'; sec.hidden = true;
    var h = document.createElement('h2'); h.className = 'ho-card-title'; h.textContent = 'Stuck on what you sent';
    var p = document.createElement('p'); p.className = 'ho-card-sub';
    var l = document.createElement('div'); l.className = 'ho-stuck-list';
    sec.appendChild(h); sec.appendChild(p); sec.appendChild(l);
    return sec;
  }

  function takeOut() {
    ['ho-send-btn', 'ho-card-mount', 'ho-stuck-card', 'ho-sheet'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
    S.card = null; S.cardFor = null; S.inited = false; S.team = null; S.clients = null; clearTimeout(S.waitT);
  }

  async function gate() {
    var o = owner();
    if (!o) { takeOut(); return; }
    if (S.cardFor && S.cardFor !== o.name) takeOut();
    var right = document.querySelector('.topbar-right');
    if (right && !document.getElementById('ho-send-btn')) right.insertBefore(sendButton(), right.firstChild);
    var anchor = document.getElementById('attention-panel');
    if (!anchor || !anchor.parentNode) return;
    await loadRefs();
    if (!owner() || owner().name !== o.name) return;
    if (!S.inited) {
      window.hoSheet.init({ me: me, people: people, clients: clients,
        read: function (text, ctx) { return window.hoRead(text, ctx); },
        today: today, rpc: rpc, toast: toast, onSent: onSent });
      S.inited = true;
    }
    if (!document.getElementById('ho-stuck-card')) anchor.parentNode.insertBefore(stuckShell(), anchor);
    if (!document.getElementById('ho-card-mount')) {
      var m = document.createElement('div'); m.id = 'ho-card-mount';
      anchor.parentNode.insertBefore(m, document.getElementById('ho-stuck-card'));
      S.card = hoCard(m, { me: me, myId: function () { return o.id; }, get: function (p) { return call(p); },
        rpc: rpc, clientName: clientName, today: today, toast: toast });
      S.cardFor = o.name;
    }
    loadStuck();
  }

  /* pure checks for runSelfTest (no reads, no writes) */
  function selfcheck() {
    var R = [], ok = function (n, p, d) { R.push({ name: 'Send a task: ' + n, pass: !!p, detail: d || '' }); };
    var ppl = [{ id: 5, name: 'USHANE' }, { id: 12, name: 'NIRVANA' }, { id: 3, name: 'SUHANA' }];
    var cl = [{ id: 1, name: 'SASTHO' }, { id: 2, name: 'SUN ZAPPER' }];
    var r = window.hoRead ? window.hoRead('Ushane and Suhana, cut the Sastho reel by Friday', { people: ppl, clients: cl, today: '2026-11-09' }) : null;
    ok('the reader finds both people', r && r.people.join() === '5,3', r && r.people.join());
    ok('the reader reads Friday as Fri 13 Nov', r && r.due === '2026-11-13', r && r.due);
    ok('the reader finds the client', r && r.client === 1, r && String(r.client));
    var z = window.hoRead ? window.hoRead('Nirvana, the Sun Zapper post', { people: ppl, clients: cl, today: '2026-11-09' }) : null;
    ok('Sun Zapper is a client, not Sunday', z && z.client === 2 && !z.due, z && JSON.stringify(z));
    var present = !!document.getElementById('ho-send-btn');
    ok('only Thulaib and Shiara have Send a task', !!owner() === present, 'role ' + document.body.getAttribute('data-role') + ', button ' + (present ? 'present' : 'absent'));
    return R;
  }

  window.BBHO = { selfcheck: selfcheck, reload: function () { onSent(); }, state: function () { return S; } };
  function wire() {
    new MutationObserver(function () { gate(); }).observe(document.body, { attributes: true, attributeFilter: ['data-role'] });
    if (document.body.getAttribute('data-role')) gate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
