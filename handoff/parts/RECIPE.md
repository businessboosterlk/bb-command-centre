# RECIPE: Send a task, see it done (Command Centre H3 to H5)
Kind: system
Live: not live; the block sits in index.html of branch claude/vigilant-cannon-efb76a, uncommitted on 8 Nov 2026
Last verified: 2026-11-08, by THULAIB CC HANDOFF (H2 to H5 side session)

Checked by `python3 ~/bb-systems/qa/recipe-check.py <this folder>`. A fresh chat rebuilds from this file
alone. Anything that lives only in a chat is lost: write it here or it did not happen.

## 1. What it is
Thulaib and Shiara send a task to anyone on the team from a Send a task button in the Command Centre topbar. One
sentence ("Ushane and Suhana, cut the Sastho reel by Friday") fills Who, Day and Client. Several people means one
task each. Anyone without phone alerts gets a WhatsApp link after the save; the page never sends WhatsApp itself.
A From Thulaib or From Shiara card shows tasks sent to the signed-in owner with Done (optional what I did line),
Stuck (a reason is required) and Carry on after a reply. A Stuck strip shows tasks the owner sent that are stuck,
with Send reply and Forward. Plan: ~/Downloads/BB-CC-FULL-UPGRADE/THULAIB-TASKS-AND-TEAM-PLAN.md.

## 2. Where the source lives
- The true copy of each part is in this folder: h3-reader.js, h4-sheet.js, h5-card.js, glue.js, ho.css.
- index.html carries them between `@@BBCC_THULAIB_VIEW@@ BEGIN` and `@@BBCC_THULAIB_VIEW@@ END`, pasted by build-block.py.
- Database: the H1 functions bb_handoff_send, bb_handoff_seen, bb_handoff_done, bb_handoff_stuck, bb_handoff_reply
  (migration thulaib_cc_handoff_h1, live on yyviiwnqgphyklcoijyd). H2 alerts are ../H2-alerts.sql, NOT applied.
- Crew receipts: ~/bb-systems/bb-crew/crew/out/handoff-js-part/, mould ~/bb-systems/bb-crew/crew/moulds/handoff-js-part.json.

## 3. Rebuild from nothing
```bash
cd ~/bb-command-centre/handoff/parts   # or the same folder in the worktree
python3 build-block.py                  # pastes the parts into ../../index.html
```

## 4. Gates
```bash
node h3-reader.test.mjs                                    # RESULT: ALL 30 PASS
(cd ../.. && python3 -m http.server 8793 --bind 127.0.0.1 &)  # serve the repo
node handoff.check.mjs                                     # RESULT: 86 of 86 PASS (phone 390 and desk 1440)
python3 ~/bb-consultancy/house_style.py <visible strings>  # all OK
```

## 5. Deliver or deploy
Not deployed. Commit and push of index.html is Thulaib's call through the coordinating session. When he says go:
```bash
cd ~/bb-command-centre && git add index.html handoff && git commit -m "Send a task loop H3 to H5" && git push
```

## 6. Finishing touches
- the sheet's action bar is one bar: primary full width, secondary in equal pairs, quiet cancel last | why: bb-workshop-os ui-sheets rule, Thulaib 17 Sep 2026 | held by: handoff.check.mjs#action bar
- every field 16px so a tap never zooms the phone | why: BB Money zoom fault, 17 Aug 2026 | held by: ho.css#font-size:16px
- dates read Fri 13 Nov with no comma | why: house date style | held by: handoff.check.mjs#was due Mon 2 Nov
- WhatsApp is a link the person taps after the save, never sent by the page | why: brief, and iOS blocks pop ups after an await | held by: handoff.check.mjs#the page sends nothing to WhatsApp itself
- one primary per card row; Done steps back once Carry on shows | why: Claude judged the screenshot | held by: h5-card.js#one primary

## 7. Cast a copy
The From card (h5-card.js) is self contained behind its deps. A cast into the Video, SMM or Graphic system pastes
h5-card.js byte for byte and writes a small glue for that system's currentUser { name, team_member_id }. Never edit
h5-card.js inside a cast; change it here and paste again.

## 8. Not on disk
A real phone test on Thulaib's iPhone, and the live H1 call proof inside BEGIN and ROLLBACK, which was refused by the
permission check on 8 Nov 2026 and needs Thulaib's go.
