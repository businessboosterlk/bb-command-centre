/* TEAM SCORE, SMM AND HEADS (phase 1). Turns BB rows into the SMM card ("Tracked, not scored") and the head card (no single
   score). Pure functions, no fetch, no DOM. Rules: ~/bb-systems/team-score/SPEC-SMM-HEADS.md. Copy this file byte for byte into
   every app that shows these cards, beside engine.js and ts-adapter.js. Written 6 Nov 2026 (TEAM SCORE SMM AND HEADS 2).

   rows = { team, clients, ledger, publog, gp, vp, gh, vh, va, events, plan, shoots, formPeople?, formAnswers? }
     team     team_members where active (id, name, role, is_head, head_of)      clients  id, name, assigned_smm, status
     ledger   bb_commitment_ledger rows of the month                            publog   smm_publish_log rows
     gp, vp   graphic_projects, video_projects (id, title, client_id, target_year, target_month, type, is_archived, assignee)
     gh, vh   graphic_stage_history (entered_by), video_stage_history (moved_by)  va  video_assignment_history
     events   bb_review_events     plan  smm_weekly_plan of the week     shoots  smm_shoots
     formPeople, formAnswers  bb_daily_form_people and _answers; when absent the daily form is Not measurable.
   wk = TS_ADAPTER.week(...) ({ startMs, endMs }), asOf = min(wk.endMs, now). Rows after asOf are ignored. */
(function (g) {
  'use strict';

  var OFF = 5.5 * 3600e3;          // Colombo is UTC+05:30
  var DAY = 86400e3, HOUR = 3600e3, NEAR = 120e3;

  /* Roles inside the SMM team. Set by Thulaib on 26 Oct 2026. A name missing here shows no headline, never a guess. */
  var TS_SMM_ROLE = { HITHESH: 'Publisher', TIANA: 'Creative', NIRVANA: 'Operations' };
  var TS_SMM_ROLE_SET = '2026-10-26';

  /* Review stages, who owns each (by head_of; the COO may decide any stage), and what counts as a pass. */
  var STAGES = [
    { sys: 'v', stage: 'video_head_review', owner: 'video', label: 'Video head review' },
    { sys: 'v', stage: 'team_review', owner: 'smm', label: 'Team review' },
    { sys: 'v', stage: 'coo_check', owner: 'coo', label: 'COO check' },
    { sys: 'g', stage: 'head_review', owner: 'graphic', label: 'Graphics head review' }
  ];
  var V_RANK = { video_shot: 0, cutting_color_grading: 0, rendering: 0, editing: 0, changes: 0, video_head_review: 1, team_review: 2, coo_check: 3,
    client_review: 4, client_changes: 4, sent_to_client: 4, add_to_drive: 5, posted: 6 };
  var G_PASS = { approved: 1, sent_to_client: 1, client_changes: 1 };
  var SEND_BACK = { v: 'changes', g: 'brief' };

  function ms(x) {
    if (x === null || x === undefined || x === '') return NaN;
    if (typeof x === 'number') return x;
    if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return Date.parse(x + 'T12:00:00+05:30');
    return Date.parse(x);
  }
  function up(s) { return String(s === null || s === undefined ? '' : s).trim().toUpperCase(); }
  function num(x) { var n = Number(x); return x === null || x === undefined || x === '' || isNaN(n) ? null : n; }
  function colomboDay(t) { return Math.floor((t + OFF) / DAY); }
  function dateStr(t) { return new Date(colomboDay(t) * DAY).toISOString().slice(0, 10); }
  function dayOfWeek(day) { return (new Date(day * DAY).getUTCDay() + 6) % 7; }   // Monday 0
  function firstTick(r) {
    var best = NaN;
    ['tiktok_at', 'instagram_at', 'facebook_at', 'linkedin_at'].forEach(function (k) { var t = ms(r[k]); if (!isNaN(t) && (isNaN(best) || t < best)) best = t; });
    return best;
  }
  function list(x) { return Array.isArray(x) ? x : []; }

  /* Hours between two moments that fall on Monday to Friday, Colombo time. Saturday and Sunday hours do not count. */
  function weekdayHours(fromMs, toMs) {
    if (!(toMs > fromMs)) return 0;
    var total = 0, day = colomboDay(fromMs), last = colomboDay(toMs);
    for (; day <= last; day++) {
      if (dayOfWeek(day) > 4) continue;
      var a = Math.max(fromMs, day * DAY - OFF), b = Math.min(toMs, (day + 1) * DAY - OFF);
      if (b > a) total += b - a;
    }
    return total / HOUR;
  }
  /* Nearest rank: the value at rank ceil(p x n) in the sorted list. */
  function rank(sorted, p) { return sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : null; }

  function people(rows) {
    var team = list(rows.team).filter(function (m) { return m.active !== false; });
    var byName = {}, byId = {};
    team.forEach(function (m) { byName[up(m.name)] = m; byId[String(m.id)] = m; });
    function ownersOf(owner) {
      return team.filter(function (m) { return owner === 'coo' ? /^coo$/i.test(String(m.role || '').trim()) : (m.is_head && m.head_of === owner); }).map(function (m) { return up(m.name); });
    }
    var coo = ownersOf('coo');
    return { team: team, byName: byName, byId: byId, ownersOf: ownersOf, coo: coo };
  }

  function holderAt(assign, project, t) {
    var best = null;
    for (var i = 0; i < assign.length; i++) {
      var a = assign[i], s = ms(a.assigned_at), e = ms(a.ended_at);
      if (s <= t && (isNaN(e) || e > t) && (!best || s >= ms(best.assigned_at))) best = a;
    }
    return best ? num(best.editor_id) : num(project && project.assigned_editor_id);
  }
  function group(rows, key) {
    var out = {};
    list(rows).forEach(function (r) { var k = String(r[key]); (out[k] = out[k] || []).push(r); });
    return out;
  }
  function sortHist(h) { return h.slice().sort(function (a, b) { return ms(a.entered_at) - ms(b.entered_at) || (a.id || 0) - (b.id || 0); }); }

  /* Every review decision whose decision time falls in the week, up to asOf. A decision is the next history row after a
     review stage row (a row into the same stage again is not a decision). */
  function reviewDecisions(rows, wk, asOf) {
    var P = people(rows), out = [];
    var gp = {}, vp = {};
    list(rows.gp).forEach(function (p) { gp[String(p.id)] = p; });
    list(rows.vp).forEach(function (p) { vp[String(p.id)] = p; });
    var va = group(rows.va, 'video_project_id');
    var ev = list(rows.events).filter(function (e) { return ms(e.created_at) <= asOf; });
    var sets = [
      { sys: 'v', hist: group(rows.vh, 'video_project_id'), by: 'moved_by', proj: vp, system: 'video' },
      { sys: 'g', hist: group(rows.gh, 'graphic_project_id'), by: 'entered_by', proj: gp, system: 'graphic' }
    ];
    sets.forEach(function (S) {
      Object.keys(S.hist).forEach(function (pid) {
        var h = sortHist(S.hist[pid]).filter(function (r) { return ms(r.entered_at) <= asOf; });
        for (var i = 0; i < h.length - 1; i++) {
          var st = null;
          for (var k = 0; k < STAGES.length; k++) if (STAGES[k].sys === S.sys && STAGES[k].stage === h[i].stage) st = STAGES[k];
          if (!st || h[i + 1].stage === h[i].stage) continue;
          var at = ms(h[i + 1].entered_at), handIn = ms(h[i].entered_at);
          if (at < wk.startMs || at > asOf) continue;
          var to = h[i + 1].stage, decider = up(h[i + 1][S.by]);
          var outcome = to === SEND_BACK[S.sys] ? 'sent_back'
            : (S.sys === 'v' ? ((V_RANK[to] || 0) > V_RANK[h[i].stage] ? 'passed' : 'moved') : (G_PASS[to] ? 'passed' : 'moved'));
          var p = S.proj[pid] || null;
          var worker = S.sys === 'v' ? holderAt(va[pid] || [], p, handIn) : num(p && p.assigned_designer_id);
          var wm = worker === null ? null : P.byId[String(worker)];
          var owners = P.ownersOf(st.owner);
          var allowed = owners.indexOf(decider) > -1 || P.coo.indexOf(decider) > -1;
          var reason = null, stars = null;
          if (outcome === 'sent_back') {
            var best = null;
            ev.forEach(function (e) {
              if (e.system !== S.system || String(e.job_id) !== pid || e.kind !== 'send_back') return;
              var d = Math.abs(ms(e.created_at) - at);
              if (d <= NEAR && (!best || d < best.d)) best = { d: d, e: e };
            });
            reason = best && String(best.e.reason || '').trim() ? String(best.e.reason).trim() : null;
          }
          if (outcome === 'passed') {
            var last = null;
            ev.forEach(function (e) {
              if (e.system !== S.system || String(e.job_id) !== pid || e.kind !== 'rating' || up(e.by_name) !== decider) return;
              var t = ms(e.created_at);
              if (t >= at - NEAR && t <= Math.min(asOf, wk.endMs) && (!last || t >= ms(last.created_at))) last = e;
            });
            stars = last ? num(last.stars) : null;
          }
          // Moved into review by the decider under a minute before the decision: approved straight from another stage
          // (the Graphic System writes the head_review row itself, L-GFX-076). The hand-in time is not recorded.
          var direct = up(h[i][S.by]) === decider && at - handIn < 60e3;
          var hours = direct ? null : (at - handIn) / HOUR, wd = direct ? null : weekdayHours(handIn, at);
          out.push({
            key: S.sys + '-' + h[i].id, sys: S.sys, stage: st.stage, stageLabel: st.label, owner: st.owner,
            job: num(pid), title: String((p && p.title) || '').trim() || 'Untitled', ref: (S.sys === 'v' ? 'V-' : 'G-') + pid,
            handIn: new Date(handIn).toISOString(), at: new Date(at).toISOString(), atMs: at, handInMs: handIn,
            decider: decider, toStage: to, outcome: outcome, direct: direct, hours: hours, weekdayHours: wd, onTarget: direct ? null : wd <= 24,
            reason: reason, stars: stars, worker: worker, workerName: wm ? up(wm.name) : null,
            own: !!(wm && up(wm.name) === decider), allowed: allowed
          });
        }
      });
    });
    out.sort(function (a, b) { return a.atMs - b.atMs || (a.key < b.key ? -1 : 1); });
    return out;
  }

  function stats(decs) {
    var timed = decs.filter(function (d) { return !d.direct; });
    var hrs = timed.map(function (d) { return d.hours; }).sort(function (a, b) { return a - b; });
    var n = decs.length, onT = timed.filter(function (d) { return d.onTarget; }).length;
    var sb = decs.filter(function (d) { return d.outcome === 'sent_back'; });
    var withR = sb.filter(function (d) { return d.reason; }).length;
    var passes = decs.filter(function (d) { return d.outcome === 'passed'; });
    var starred = passes.filter(function (d) { return d.stars !== null; }).length;
    return {
      n: n, timed: timed.length, direct: n - timed.length,
      median: rank(hrs, 0.5), p90: rank(hrs, 0.9), onTarget: onT, onTargetPct: timed.length ? onT / timed.length * 100 : null,
      sentBack: sb.length, withReason: withR, reasonPct: sb.length ? withR / sb.length * 100 : null,
      passes: passes.length, starred: starred
    };
  }

  /* Jobs whose last history row at asOf is one of these review stages: still waiting for a decision. */
  function waitingAt(rows, stages, asOf) {
    var out = [];
    [['v', rows.vh, 'video_project_id', rows.vp], ['g', rows.gh, 'graphic_project_id', rows.gp]].forEach(function (S) {
      var proj = {};
      list(S[3]).forEach(function (p) { proj[String(p.id)] = p; });
      var hist = group(S[1], S[2]);
      Object.keys(hist).forEach(function (pid) {
        var p = proj[pid];
        if (!p || p.is_archived) return;
        var h = sortHist(hist[pid]).filter(function (r) { return ms(r.entered_at) <= asOf; });
        if (!h.length) return;
        var lastRow = h[h.length - 1], i = h.length - 1;
        if (!stages.some(function (s) { return s.sys === S[0] && s.stage === lastRow.stage; })) return;
        while (i > 0 && h[i - 1].stage === lastRow.stage) i--;   // waiting since the first of a run of rows into the same stage
        out.push({ sys: S[0], job: num(pid), title: String(p.title || '').trim() || 'Untitled', stage: lastRow.stage, since: ms(h[i].entered_at), hours: (asOf - ms(h[i].entered_at)) / HOUR });
      });
    });
    out.sort(function (a, b) { return a.since - b.since; });
    return out;
  }

  function weekdaysUpTo(wk, asOf) {
    var n = 0;
    for (var i = 0; i < 5; i++) if (wk.startMs + i * DAY <= asOf) n++;
    return n;
  }

  function smmCard(rows, person, wk, asOf) {
    var name = up(person.name), pid = num(person.id);
    var role = TS_SMM_ROLE[name] || null;
    var book = list(rows.clients).filter(function (c) { return String(c.status || '').trim() === 'active' && up(c.assigned_smm) === name; });
    var bookIds = {};
    book.forEach(function (c) { bookIds[String(c.id)] = c; });
    var mDay = new Date(colomboDay(asOf) * DAY), Y = mDay.getUTCFullYear(), M = mDay.getUTCMonth() + 1;

    // 1. Their book: the ledger for the month asOf falls in, per client, kinds post, video and story.
    var per = {};
    book.forEach(function (c) { per[String(c.id)] = { id: num(c.id), name: String(c.name || '').trim(), owed: null, made: 0, posted: 0 }; });
    list(rows.ledger).forEach(function (r) {
      var k = String(r.client_id);
      if (!per[k] || num(r.year) !== Y || num(r.month) !== M || ['post', 'video', 'story'].indexOf(r.kind) < 0) return;
      var c = num(r.contracted);
      if (c !== null) per[k].owed = (per[k].owed || 0) + c;
      per[k].made += num(r.completed) || 0;
      per[k].posted += num(r.published) || 0;
    });
    var clients = Object.keys(per).map(function (k) { return per[k]; });
    clients.sort(function (a, b) { return (b.owed || 0) - (a.owed || 0) || b.made - a.made || a.name.localeCompare(b.name); });
    var tot = { owed: null, made: 0, posted: 0 };
    clients.forEach(function (c) { if (c.owed !== null) tot.owed = (tot.owed || 0) + c.owed; tot.made += c.made; tot.posted += c.posted; });

    // 2. Posted this week, and made but not posted after 2 days.
    var gp = {}, vp = {};
    list(rows.gp).forEach(function (p) { gp[String(p.id)] = p; });
    list(rows.vp).forEach(function (p) { vp[String(p.id)] = p; });
    var ticked = {}, posted = [];
    list(rows.publog).forEach(function (r) {
      var t = firstTick(r);
      if (isNaN(t) || t > asOf) return;
      ticked[r.source_table + ':' + r.source_id] = t;
      if (!bookIds[String(r.client_id)] || t < wk.startMs) return;
      var src = r.source_table === 'graphic_projects' ? gp[String(r.source_id)] : vp[String(r.source_id)];
      posted.push({ id: num(r.id), title: String((src && src.title) || '').trim() || 'Untitled', at: new Date(t).toISOString(), atMs: t, sys: r.source_table === 'graphic_projects' ? 'g' : 'v', job: num(r.source_id) });
    });
    posted.sort(function (a, b) { return a.atMs - b.atMs || a.id - b.id; });
    var waiting = [];
    [['g', rows.gp, group(rows.gh, 'graphic_project_id'), 'approved', 'graphic_projects'], ['v', rows.vp, group(rows.vh, 'video_project_id'), 'add_to_drive', 'video_projects']].forEach(function (S) {
      list(S[1]).forEach(function (p) {
        if (p.is_archived || !bookIds[String(p.client_id)] || num(p.target_year) !== Y || num(p.target_month) !== M) return;
        if (S[0] === 'g' && p.type && ['post', 'carousel', 'story'].indexOf(p.type) < 0) return;
        var fin = NaN;
        (S[2][String(p.id)] || []).forEach(function (h) { var t = ms(h.entered_at); if (h.stage === S[3] && t <= asOf && (isNaN(fin) || t < fin)) fin = t; });
        if (isNaN(fin) || fin > asOf - 2 * DAY) return;
        if (ticked[S[4] + ':' + p.id] !== undefined) return;
        waiting.push({ sys: S[0], job: num(p.id), title: String(p.title || '').trim() || 'Untitled', finished: new Date(fin).toISOString(), finMs: fin, days: Math.floor((asOf - fin) / DAY) });
      });
    });
    waiting.sort(function (a, b) { return a.finMs - b.finMs || (a.sys + a.job < b.sys + b.job ? -1 : 1); });

    // 3. Reviews they did: team review decisions by this SMM.
    var revs = reviewDecisions(rows, wk, asOf).filter(function (d) { return d.stage === 'team_review' && d.decider === name; });

    // 4. Daily form: weekdays Monday to Friday up to asOf with any sent answer.
    var of = weekdaysUpTo(wk, asOf), form;
    if (!Array.isArray(rows.formPeople) || !Array.isArray(rows.formAnswers)) {
      form = { days: null, of: of, reason: 'the daily form answers sit behind the form’s own key, so this page cannot read them' };
    } else {
      var fp = rows.formPeople.filter(function (x) { return x.active && !x.is_test && up(x.name) === name; })[0];
      if (!fp) form = { days: null, of: of, reason: 'no daily form person has this name' };
      else {
        var seen = {};
        rows.formAnswers.forEach(function (a) {
          if (a.person !== fp.key || !a.sent_at || ms(a.sent_at) > asOf) return;
          var d = String(a.form_date).slice(0, 10), t = ms(d);
          if (t < wk.startMs || t > asOf || dayOfWeek(colomboDay(t)) > 4) return;
          seen[d] = 1;
        });
        form = { days: Object.keys(seen).length, of: of, reason: null };
      }
    }

    // 5. Their own diary: post rows of the week's plan, assigned to them, planned and ticked by themselves.
    var monday = dateStr(wk.startMs);
    var diary = list(rows.plan).filter(function (r) { return String(r.week_start).slice(0, 10) === monday && up(r.assigned_to) === name && r.task_type === 'post' && ms(r.created_at) <= asOf; });

    // Operations: next week's shoots, logged by Tuesday 24:00 of this week, against shoots dated next week.
    var nStart = wk.startMs + 7 * DAY, nEnd = wk.endMs + 7 * DAY, tue = wk.startMs + 2 * DAY - 1;
    var next = list(rows.shoots).filter(function (s) {
      if (!s.shoot_date || ms(s.created_at) > asOf) return false;
      var t = /^\d{4}-\d{2}-\d{2}$/.test(String(s.shoot_date)) ? ms(s.shoot_date) : (colomboDay(ms(s.shoot_date)) * DAY - OFF + 12 * HOUR);
      return t >= nStart && t <= nEnd;
    });
    var logged = next.filter(function (s) { return ms(s.created_at) <= tue; }).length;

    return {
      id: pid, name: name, role: role, roleSet: TS_SMM_ROLE_SET, year: Y, month: M,
      book: { clients: clients, owed: tot.owed, made: tot.made, posted: tot.posted, count: clients.length },
      posted: { count: posted.length, items: posted },
      waiting: { count: waiting.length, items: waiting },
      reviews: Object.assign(stats(revs), { items: revs }),
      form: form,
      diary: { planned: diary.length, ticked: diary.filter(function (r) { return r.status === 'done'; }).length },
      ops: { shootsNext: next.length, shootsLogged: logged, shootsPct: next.length ? logged / next.length * 100 : null }
    };
  }

  function headCard(rows, head, wk, asOf) {
    var P = people(rows), name = up(head.name), m = P.byName[name] || head;
    var isCoo = /^coo$/i.test(String(m.role || '').trim());
    var mine = STAGES.filter(function (s) { return isCoo ? s.owner === 'coo' : (m.is_head && s.owner === m.head_of); });
    var all = reviewDecisions(rows, wk, asOf);
    var inStage = function (d) { return mine.some(function (s) { return s.sys === d.sys && s.stage === d.stage; }); };
    // Their decisions: in their own stages; the COO's are every decision she made, in any stage.
    var decs = all.filter(function (d) { return d.decider === name && (isCoo || inStage(d)); });
    var st = stats(decs);
    var wait = waitingAt(rows, mine, asOf);
    var sb = decs.filter(function (d) { return d.outcome === 'sent_back'; }).slice().reverse();
    var skipped = all.filter(function (d) { return inStage(d) && (!d.allowed || d.own); });
    var solo = [];
    if (isCoo) {
      all.forEach(function (d) {
        if (!d.own || d.outcome !== 'passed') return;
        var dm = P.byName[d.decider];
        if (!dm || !dm.is_head) return;
        var later = all.some(function (x) { return x.sys === d.sys && x.job === d.job && x.atMs > d.atMs && x.decider !== d.decider; });
        if (!later) solo.push(d);
      });
    }
    return {
      id: num(m.id), name: name, coo: isCoo, headOf: isCoo ? 'coo' : m.head_of, stages: mine.map(function (s) { return s.label; }),
      speed: { n: st.n, timed: st.timed, direct: st.direct, median: st.median, p90: st.p90, onTarget: st.onTarget, onTargetPct: st.onTargetPct, waiting: wait.length, oldestWait: wait.length ? wait[0].hours : null, waitItems: wait },
      stars: { starred: st.starred, passes: st.passes },
      sendBacks: { count: st.sentBack, withReason: st.withReason, reasonPct: st.reasonPct, reasons: sb.slice(0, 10), more: Math.max(0, sb.length - 10) },
      skipped: skipped,
      solo: solo,
      decisions: decs
    };
  }

  g.TS_SMM = { TS_SMM_ROLE: TS_SMM_ROLE, TS_SMM_ROLE_SET: TS_SMM_ROLE_SET, STAGES: STAGES, smmCard: smmCard, headCard: headCard,
    reviewDecisions: reviewDecisions, weekdayHours: weekdayHours, stats: stats, waitingAt: waitingAt };
  g.TS_SMM_ROLE = TS_SMM_ROLE;
})(typeof window !== 'undefined' ? window : globalThis);
