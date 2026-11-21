# H0 audit: every page write to `tasks` (8 Nov 2026, THULAIB COMMAND CENTRE 6, read only)

26 direct writes from the page with the public key, in 3 systems. Graphic System and Dev System write none.
`~/bb-systems/push/` writes none (only an old hand run rollback script, not an app path).

## Command Centre (`index.html`, 15, all through `sbC` at 6861, the signed-in token if any, else the public key)
| line | write | screen |
|---|---|---|
| 6247 | update done | My Day tick |
| 6410 | insert | Lead drawer, add lead task |
| 6502 | update done | Lead drawer, tick pipeline task |
| 6791 | update done | Calendar, complete a task |
| 7450 | update done | Client page Tasks tab, tick |
| 7451 | DELETE | Client page, delete task |
| 7456 | insert | Client page, add task |
| 10666 | update done | Task Book, tick |
| 10675 | DELETE | Task Book, delete |
| 10730 | update all fields | Task Book, edit |
| 10735 | insert | Task Book, new task |
| 10795 | insert, one per client | Task Book, duplicate to many clients |
| 12038 | update done | Bulk bar, close selected |
| 12077 | update assign or due | Bulk bar, reassign or new date |
| 16661 | update done | Morning check-in, tick overdue |
Plus 5 calls to the Hub service on Railway (14453 to 14530) that may write `tasks` server side; not confirmed.

## SMM Workspace (`~/bb-smm-workspace/index.html`, 6, always the public key)
3890 tick · 3906 DELETE · 4052 edit · 4067 add · 4153 copy to other clients · 9461 morning check-in tick (raw fetch).
Plus 5 Hub calls (14112 to 14189), same caveat. `index.work.html` is a working copy with the same calls.

## Video System (`~/bb-video-system/index.html`, 5 lines, always the public key)
3145 DELETE every task of a project when a project is deleted for good · 3954 tick · 3969 DELETE · 3975 add or edit ·
6442 morning check-in tick.
FAULT FOUND: the Video tick (3954, 6442) and the add (3975, `deadline`) write columns `tasks` does not have
(`completed`, `status`, `deadline`). The database refuses them, and supabase-js returns the refusal without throwing,
so a tick in the Video System changes nothing today. Not fixed here: its own job in the Video System.

## Not counted
`BB_Command_Centre_LIVE (12).html` in the CC folder is an old snapshot with 7 writes; a lock would break it if anyone
still opens it.

## What it means for the lock decision
Taking away the public key's insert, update and delete on `tasks` today would break 26 working buttons in three
systems. The handoff build adds no new open door: every handoff write goes through the six `bb_handoff_*` functions.
Closing the old door means moving those 26 writes behind functions first (CC 15, SMM 6, Video 5), the same job as the
role floor (bb_pending 844), one system at a time on his go.
