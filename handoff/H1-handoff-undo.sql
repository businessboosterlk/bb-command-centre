-- UNDO for H1-handoff.sql (THULAIB CC HANDOFF, 8 Nov 2026).
-- Takes the database back to exactly how it was before H1. No existing column, trigger, policy or grant is touched.
-- Warning: dropping the columns also drops any sent tasks' extra details (who it went to, seen, stuck, done notes).
-- The task rows themselves stay, with their title, assign, due and done as normal tasks.
DROP VIEW IF EXISTS public.bb_handoff_board;
DROP FUNCTION IF EXISTS public.bb_handoff_send(bigint, text, text, bigint, text, text);
DROP FUNCTION IF EXISTS public.bb_handoff_seen(bigint, text, boolean);
DROP FUNCTION IF EXISTS public.bb_handoff_done(bigint, text, text);
DROP FUNCTION IF EXISTS public.bb_handoff_stuck(bigint, text, text);
DROP FUNCTION IF EXISTS public.bb_handoff_reply(bigint, text, text);
DROP FUNCTION IF EXISTS public.bb_handoff_cancel(bigint, text);
DROP INDEX IF EXISTS public.tasks_sent_to_idx;
ALTER TABLE public.tasks
    DROP COLUMN IF EXISTS sent_to_id,
    DROP COLUMN IF EXISTS sent_by,
    DROP COLUMN IF EXISTS seen_at,
    DROP COLUMN IF EXISTS done_by,
    DROP COLUMN IF EXISTS done_note,
    DROP COLUMN IF EXISTS stuck_note,
    DROP COLUMN IF EXISTS stuck_at,
    DROP COLUMN IF EXISTS stuck_reply,
    DROP COLUMN IF EXISTS stuck_reply_at,
    DROP COLUMN IF EXISTS sender_seen_done_at,
    DROP COLUMN IF EXISTS cancelled_at;
