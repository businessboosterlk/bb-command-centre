# RECIPE: THULAIB CC HANDOFF, part H0 audit and H1 database change

## 1. What it is
The database half of Thulaib's Send a task loop in the Command Centre. H0 is the read only list of every page write
to `tasks` (`H0-AUDIT.md`). H1 adds eleven empty columns to `tasks`, six checked functions (`bb_handoff_send`, `_seen`,
`_done`, `_stuck`, `_reply`, `_cancel`) and the read view `bb_handoff_board`. It changes no existing column, trigger,
policy or grant. Not live until Thulaib says yes to the database change.

## 2. Where the source lives
- `handoff/H0-AUDIT.md`: the audit, also summarised in bb_pending 1541.
- `handoff/H1-handoff.sql`: the change. Written by BB Crew (mould `~/bb-systems/bb-crew/crew/moulds/handoff-sql-part.json`,
  brief `~/bb-systems/bb-crew/crew/items/items-handoff-h1.jsonl`), then judged and corrected by Claude (five fixes listed in
  the first line of the file).
- `handoff/H1-handoff-undo.sql`: the undo, back to exactly how it was.
- `handoff/H1-rehearse-tests.sql`: 19 tests that run as the public key and always throw the whole block away.
- Plan: `~/Downloads/BB-CC-FULL-UPGRADE/THULAIB-TASKS-AND-TEAM-PLAN.md` (version 3.2). Supabase project `yyviiwnqgphyklcoijyd`.

## 3. Rebuild from nothing
```bash
cd ~/bb-systems/bb-crew
node crew/run.mjs handoff-sql-part crew/items/items-handoff-h1.jsonl --task "THULAIB CC HANDOFF" --cap 0.5
# take the sql block from the run file in crew/out/handoff-sql-part, swap SENDER_A and SENDER_B for THULAIB and SHIARA,
# then apply the five fixes named in the first line of handoff/H1-handoff.sql before anything else
```

## 4. Gates
```bash
cd ~/bb-command-centre/.claude/worktrees/stoic-tesla-7d5703
python3 ~/bb-consultancy/house_style.py handoff/H0-AUDIT.md
# rehearsal: one execute_sql call holding BEGIN; then H1-handoff.sql then H1-rehearse-tests.sql, never COMMIT
# expected: error REHEARSAL_DONE with 18 PASS lines and the board row count; afterwards 0 leftover columns and 0 functions
python3 ~/bb-systems/qa/recipe-check.py handoff
```

## 5. Deliver or deploy
```bash
# ONLY after Thulaib's yes to the database change, recorded in bb_pending:
# apply_migration name thulaib_cc_handoff_h1 with the text of handoff/H1-handoff.sql, then run the board as anon:
# select * from bb_handoff_board limit 3;
# to undo: run handoff/H1-handoff-undo.sql
```

## 6. Finishing touches
- Recipient checks use `sent_to_id` | why: old screens can retype `assign` | held by: H1-rehearse-tests.sql
- Name checks use IS DISTINCT FROM | why: a blank name must be refused, not waved through | held by: H1-rehearse-tests.sql
- Overdue compares the due text as text | why: one bad old date must never break the Team view | held by: H1-handoff.sql
- Cancel never deletes, it stamps `cancelled_at` and sets done | why: nothing is hard deleted and old lists drop it | held by: H1-rehearse-tests.sql
- A second Stuck appends a time stamped line, Done keeps it | why: the history is the evidence | held by: H1-rehearse-tests.sql
- Sending fires the old push trigger until H2 | why: H2 adds the guard and the right address | held by: RECIPE.md

## 7. Cast a copy
Not cast: this is one database. The person's card (H5) is cast into the team systems later with the push block
pattern. The senders list lives in `v_senders` inside `bb_handoff_send`; only Thulaib and Shiara, by his decision.

## 8. Not on disk
Thulaib's yes on 8 Nov is bb_pending 1543. The database change itself waits for his separate yes after the plain words
summary. The Video System tick fault found by H0 is its own job in the Video System.
