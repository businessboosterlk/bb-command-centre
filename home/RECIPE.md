# RECIPE: Thulaib Home (Command Centre, role th) and the three Shiara Home gaps
Kind: system
Live: on the branch claude/thulaib-shiara-dashboards-2-571fd9, waiting for Thulaib's go live yes (bb_pending 1606). Shiara gaps 1 to 3 are commit b5945a6 on the same branch.
Last verified: 2026-11-09, by THULAIB SHIARA DASHBOARDS 2

Checked by `python3 ~/bb-systems/qa/recipe-check.py <this folder>`. A fresh chat rebuilds from this file
alone. Anything that lives only in a chat is lost: write it here or it did not happen.

## 1. What it is
The first screen Thulaib sees when he signs in to the Command Centre as CEO. It replaces the old Dashboard for role
`th` only. Top to bottom: a greeting, a push card "Only you can clear these today" with his three newest open
decisions (Done closes one, Decide opens the console), five glance tiles (Money in this month, Sales and spend,
Clients, Your backlog, Shiara's backlog), the Team table off the Send a task board with the From card and the Stuck
strip under it, the owner duties ledger "How this business runs" with a tick per duty per cycle. Last comes a "More today"
fold that borrows the old Dashboard's panels while it is open. His menu is reordered (Home, Team, Money, Clients,
Leads, Decisions, Systems, then More) and a phone gets a five tab bar (Home, Team, Money, Clients, More).
Shiara's Home is untouched apart from three gaps: Last check names its client, Apps lists the Video System, Graphic
System, SMM Workspace and the two inboxes.
Legacy stack: the Command Centre is a single file app from before the 9 Sep 2026 stack standard. This is an added
block inside it, not a new system.

## 2. Where the source lives
- `../index.html`, between `@@BBCC_THULAIB_HOME_BEGIN@@` and `@@BBCC_THULAIB_HOME_END@@`, straight after the Shiara
  block. Page `#page-thhome`, CSS prefix `thh-`, one state object `TH`, public surface `window.BBTH` (state, reload,
  selfcheck). It adds, wraps and moves by id. It edits no existing function, not NAV9, not the Send a task block.
- This folder: `home.check.mjs` (every button, phone and desk), `after-shots.mjs` (the pictures), `make-checkcopy.sh`
  and `gzserve.mjs` (sign in stubbed copies for the layout and speed checks).
- `../handoff/parts/clickpath.check.mjs` knows his Home: it expects Home as the first screen for role th and the More
  opener in his menu.
- The mould, the cast brief and the mockup are in `~/Downloads/THULAIB-SHIARA-DASHBOARDS/` (MOULD.md, BUILD-BRIEF.md,
  thulaib-dashboard-mockup.html). They stay out of this repo because the repo is public and they carry money figures.
- Database: reads only, plus the existing `bb_pending_close` function for Done. No table, policy or function was
  added. Reads: bb_pending, invoices and pipeline (signed in only), bb_ads_daily, clients, video_projects,
  bb_handoff_board.

## 3. Rebuild from nothing
The block is hand written from the cast brief; there is no generator. To rebuild, read MOULD.md and BUILD-BRIEF.md,
then the Shiara block as the pattern. Write the block after `@@BBCC_SHIARA_END@@`. To find what is there now:
```bash
cd ~/bb-command-centre
grep -n "@@BBCC_THULAIB_HOME" index.html
git log --oneline -5 -- index.html home
```

## 4. Gates
Run from this folder. Every check stubs the sign in and refuses every write, so nothing reaches the database.
```bash
(cd .. && python3 -m http.server 8793 --bind 127.0.0.1 &)
node home.check.mjs http://127.0.0.1:8793/index.html
node ../handoff/parts/handoff.check.mjs
node ../handoff/parts/clickpath.check.mjs http://127.0.0.1:8793/index.html both
zsh make-checkcopy.sh /tmp/cc-checkcopy
node gzserve.mjs /tmp/cc-checkcopy 8795 &
node ~/bb-systems/qa/device-views.mjs http://127.0.0.1:8795/th.html --brand '.sidebar-head img' --heading '#thh-hello' --content '#page-thhome'
node ~/bb-systems/qa/speed.mjs http://127.0.0.1:8795/th.html --kind system --ready '#thh-team-body table' --press '#thh-tabbar [data-thh-tab=team],#thh-tabbar [data-thh-tab=money],#thh-tabbar [data-thh-tab=clients],#thh-tabbar [data-thh-tab=home]'
python3 ~/bb-consultancy/house_style.py /tmp/th-copy.txt
```
What each showed on 9 Nov 2026:
- home.check.mjs: 86 of 86 pass.
- handoff.check.mjs: 86 of 86 pass. clickpath.check.mjs: 210 of 210 pass, 115 touchpoints pressed.
- house_style.py on the block's visible strings: all 8 checks OK.
- device-views on his Home: the phone passes everything (heading in the middle, full width, safe areas read).
  The desk FAILS one line, DESK NOT LEVEL: his greeting starts at x=256 and the brand mark sits at x=16 inside the
  sidebar. That is the sidebar shell every Command Centre page has. It is a known fail, not a pass.
- speed on his Home: 8 of 12 pass (weight 626 KB, first paint 538 ms, worst tap 48 ms). It FAILS four: first useful
  screen 3,590 ms against 3,000, layout shift 0.214 against 0.1, reload 3,048 ms against 1,000 and reload bytes
  586 KB against 200. Shiara's Home on main fails the same four. The cause is the shell: one file that is read again
  whole on every reload and that paints the old Dashboard before a role Home takes over. The fix sits outside this
  block and is logged in bb_pending.
- The iOS Simulator look was not done in this sitting. The phone pictures come from a phone sized browser.

## 5. Deliver or deploy
Nothing goes live without Thulaib's yes on bb_pending 1606. On his yes, from the main checkout:
```bash
cd ~/bb-command-centre
git fetch origin
git merge --ff-only claude/thulaib-shiara-dashboards-2-571fd9
git push origin main
```
Then open the live address, sign in as Thulaib and confirm Home is the first screen. The after pictures go to
`~/Downloads/THULAIB-SHIARA-DASHBOARDS/` and to Thulaib directly, never into this repo:
```bash
node after-shots.mjs http://127.0.0.1:8793/index.html after
```
With no rows file the two owner only tiles read as signed out. A rows file read on the day (kept outside the repo)
goes in as a third argument.

## 6. Finishing touches
- a failed or signed out read says Not read, never a zero | why: a zero on Money reads as no money came in | held by: home.check.mjs#no tile says Not read
- one Send a task button on a screen: the head button hides when the top bar has one | why: two orange buttons a thumb apart, seen in the first pictures | held by: home.check.mjs#one Send a task on the screen
- the push card and the Team table hold their height while they load | why: the page jumped about 570px when the decisions arrived | held by: ../index.html#TH_HOLD
- the heights are remembered per screen width, heights only and never content | why: a longer decision makes a taller card next time | held by: ../index.html#bb_th_heights
- his Home takes the screen in the same frame the app appears after a sign in | why: the old Dashboard flashed first | held by: ../index.html#takes the screen in the same frame
- leaving Home with the fold open puts every borrowed panel back first | why: the old Dashboard opened with holes in it | held by: home.check.mjs#leaving Home with the fold open
- the top bar word matches the menu word: Money for finance, Systems for agents | why: the menu said Money and the bar said Finance | held by: ../index.html#TH_TITLE
- the red error badge sits above his tab bar | why: it covered the More tab on a phone | held by: ../index.html#bb-bug-badge{bottom
- the tab bar sits on the bottom edge with 44px targets and the home bar inset | why: every device its own view, 30 Oct 2026 | held by: home.check.mjs#tab bar sits on the bottom edge
- on a phone the Team table heads wrap and shrink so the table stays inside its card | why: Overdue ran past the card edge in the first phone picture | held by: home.check.mjs#Team table stays inside its card
- cost per lead is marked derived and is left out when there is no form lead | why: BB-METRICS.md has no such metric | held by: ../index.html#DERIVED
- Done sends one bb_pending_close and nothing else | why: no new write path without his typed yes | held by: home.check.mjs#Done sends one bb_pending_close
- a duty tick writes nothing to the database | why: the owner duties table waits for his yes (bb_pending 1605) | held by: home.check.mjs#a tick writes nothing
- Back once returns to the last page and Back twice leaves cleanly | why: bb-click-path, 17 Sep 2026 | held by: home.check.mjs#Back twice leaves
- Switch shows the sign in screen and his Home lets go of everything it moved | why: Shiara signs in on the same device | held by: home.check.mjs#Switch shows the sign in screen
- More in his menu opens the rest of the menu | why: the click path check pressed it and nothing opened | held by: ../handoff/parts/clickpath.check.mjs#More opens the rest of his menu

## 7. Cast a copy
A Home for another role copies this block's shape, as this one copied Shiara's: its own page id, its own CSS prefix,
a snapshot of the menu before it is reordered and restored on leave, a wrap around whatever `showPage` is at the
time, a tab bar that is hidden from 901px up. Every borrowed element is recorded with its parent and next sibling
before it moves. Then copy `home.check.mjs`, change the role and the ids and add a row to
`~/bb-systems/MODULE-REGISTRY.md`. Any fixed floating badge must be lifted above the new tab bar.

## 8. Not on disk
- A look on Thulaib's own iPhone and on the iOS Simulator.
- Pictures taken with a real sign in. The ones sent on 9 Nov 2026 used a sign in stub with the invoices and leads
  answered from real rows read that morning.
- The owner duties table (bb_pending 1605) and the contracts table (bb_pending 1599): both wait for his typed yes.
  Until 1605, duty ticks live on the device only.
