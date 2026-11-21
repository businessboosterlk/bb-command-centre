-- Judged and corrected by THULAIB COMMAND CENTRE 6 on 8 Nov 2026 (crew part H1, five fixes: null who, recipient from sent_to_id, safe overdue, sender state code, null sender).
-- =============================================================================
-- PART H1: handoff columns, six functions and one read view on public.tasks
-- =============================================================================

-- 1. New columns on tasks -----------------------------------------------------
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS sent_to_id bigint REFERENCES public.team_members(id),
    ADD COLUMN IF NOT EXISTS sent_by text,
    ADD COLUMN IF NOT EXISTS seen_at timestamptz,
    ADD COLUMN IF NOT EXISTS done_by text,
    ADD COLUMN IF NOT EXISTS done_note text,
    ADD COLUMN IF NOT EXISTS stuck_note text,
    ADD COLUMN IF NOT EXISTS stuck_at timestamptz,
    ADD COLUMN IF NOT EXISTS stuck_reply text,
    ADD COLUMN IF NOT EXISTS stuck_reply_at timestamptz,
    ADD COLUMN IF NOT EXISTS sender_seen_done_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE INDEX IF NOT EXISTS tasks_sent_to_idx ON public.tasks(sent_to_id)
    WHERE sent_to_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.sent_to_id IS 'The team member this handoff task was sent to.';
COMMENT ON COLUMN public.tasks.sent_by IS 'The sender who created this handoff task.';
COMMENT ON COLUMN public.tasks.seen_at IS 'Timestamp when the recipient first saw the handoff task.';
COMMENT ON COLUMN public.tasks.done_by IS 'Name of the recipient who marked the handoff task as done.';
COMMENT ON COLUMN public.tasks.done_note IS 'Optional note provided by the recipient when completing the handoff task.';
COMMENT ON COLUMN public.tasks.stuck_note IS 'Accumulated stuck notes appended by the recipient.';
COMMENT ON COLUMN public.tasks.stuck_at IS 'Timestamp when the handoff task was last marked as stuck.';
COMMENT ON COLUMN public.tasks.stuck_reply IS 'Reply from the sender to the most recent stuck note.';
COMMENT ON COLUMN public.tasks.stuck_reply_at IS 'Timestamp when the sender replied to the stuck note.';
COMMENT ON COLUMN public.tasks.sender_seen_done_at IS 'Timestamp when the sender acknowledged the completed handoff task.';
COMMENT ON COLUMN public.tasks.cancelled_at IS 'Timestamp when the sender cancelled the handoff task.';

-- 3. bb_handoff_send ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bb_handoff_send(
    p_to_id bigint,
    p_title text,
    p_due text,
    p_client_id bigint,
    p_note text,
    p_by text
)
RETURNS bigint
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_senders text[] := array['THULAIB','SHIARA'];
    v_recipient_name text;
    v_title_clean text;
    v_note_clean text;
    v_due_date date;
    v_today date;
    v_count integer;
    v_new_id bigint;
BEGIN
    -- Validate sender
    IF NOT coalesce(upper(trim(p_by)) = ANY(v_senders), false) THEN
        RAISE EXCEPTION 'HO_NOT_YOURS: You are not authorised to send handoff tasks.'
            USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.team_members
        WHERE upper(name) = upper(trim(p_by)) AND active = true
    ) THEN
        RAISE EXCEPTION 'HO_NOT_YOURS: Sender is not an active team member.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Validate recipient
    SELECT name INTO v_recipient_name
    FROM public.team_members
    WHERE id = p_to_id AND active = true;

    IF v_recipient_name IS NULL THEN
        RAISE EXCEPTION 'HO_BAD_INPUT: Recipient must be an active team member.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Validate title
    v_title_clean := trim(p_title);
    IF v_title_clean IS NULL OR length(v_title_clean) < 1 OR length(v_title_clean) > 300 THEN
        RAISE EXCEPTION 'HO_BAD_INPUT: Title must be between 1 and 300 characters.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Validate due date
    IF p_due IS NOT NULL AND p_due <> '' THEN
        IF p_due !~ '^\d{4}-\d{2}-\d{2}$' THEN
            RAISE EXCEPTION 'HO_BAD_INPUT: Due date must be in YYYY-MM-DD format.'
                USING ERRCODE = 'P0001';
        END IF;
        BEGIN
            v_due_date := p_due::date;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'HO_BAD_INPUT: Due date is not a valid date.'
                USING ERRCODE = 'P0001';
        END;
        v_today := (now() AT TIME ZONE 'Asia/Colombo')::date;
        IF v_due_date < v_today - 1 THEN
            RAISE EXCEPTION 'HO_BAD_INPUT: Due date cannot be before yesterday.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Validate client
    IF p_client_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
            RAISE EXCEPTION 'HO_BAD_INPUT: Client does not exist.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Validate note
    v_note_clean := trim(p_note);
    IF v_note_clean = '' THEN
        v_note_clean := NULL;
    END IF;
    IF v_note_clean IS NOT NULL AND length(v_note_clean) > 2000 THEN
        RAISE EXCEPTION 'HO_BAD_INPUT: Note must be at most 2000 characters.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Cap check
    v_today := (now() AT TIME ZONE 'Asia/Colombo')::date;
    SELECT count(*) INTO v_count
    FROM public.tasks
    WHERE sent_by IS NOT NULL
      AND (created_at AT TIME ZONE 'Asia/Colombo')::date = v_today;

    IF v_count >= 200 THEN
        RAISE EXCEPTION 'HO_CAP: Daily handoff send limit reached.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Insert
    INSERT INTO public.tasks (
        title, assign, due, client_id, notes, done, created_by, sent_to_id, sent_by
    ) VALUES (
        v_title_clean,
        v_recipient_name,
        p_due,
        p_client_id,
        v_note_clean,
        false,
        upper(trim(p_by)),
        p_to_id,
        upper(trim(p_by))
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bb_handoff_send(bigint, text, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_send(bigint, text, text, bigint, text, text) TO anon, authenticated;

-- 4. bb_handoff_seen ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bb_handoff_seen(
    p_id bigint,
    p_who text,
    p_carry_on boolean DEFAULT false
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.tasks%ROWTYPE;
    v_who text;
BEGIN
    v_who := upper(trim(p_who));

    SELECT * INTO v_row
    FROM public.tasks
    WHERE id = p_id
    FOR UPDATE;

    IF v_row.id IS NULL OR v_row.sent_to_id IS NULL THEN
        RAISE EXCEPTION 'HO_NOT_FOUND: Handoff task not found.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Recipient path
    IF v_who = (SELECT upper(name) FROM public.team_members WHERE id = v_row.sent_to_id) THEN
        UPDATE public.tasks
        SET seen_at = coalesce(seen_at, now()),
            stuck_at = CASE WHEN p_carry_on THEN NULL ELSE stuck_at END
        WHERE id = p_id;
    -- Sender path
    ELSIF v_who = upper(v_row.sent_by) THEN
        IF v_row.done = true AND v_row.cancelled_at IS NULL THEN
            IF p_carry_on THEN
                RAISE EXCEPTION 'HO_BAD_INPUT: carry_on must be false for sender.'
                    USING ERRCODE = 'P0001';
            END IF;
            UPDATE public.tasks
            SET sender_seen_done_at = coalesce(sender_seen_done_at, now())
            WHERE id = p_id;
        ELSE
            RAISE EXCEPTION 'HO_STATE: The sender can only mark a finished task as seen.'
                USING ERRCODE = 'P0001';
        END IF;
    ELSE
        RAISE EXCEPTION 'HO_NOT_YOURS: You are not the recipient or sender of this task.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_row FROM public.tasks WHERE id = p_id;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'seen_at', v_row.seen_at,
        'stuck_at', v_row.stuck_at,
        'sender_seen_done_at', v_row.sender_seen_done_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bb_handoff_seen(bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_seen(bigint, text, boolean) TO anon, authenticated;

-- 5. bb_handoff_done ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bb_handoff_done(
    p_id bigint,
    p_who text,
    p_note text DEFAULT null
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.tasks%ROWTYPE;
    v_who text;
    v_note_clean text;
BEGIN
    v_who := upper(trim(p_who));

    SELECT * INTO v_row
    FROM public.tasks
    WHERE id = p_id
    FOR UPDATE;

    IF v_row.id IS NULL OR v_row.sent_to_id IS NULL THEN
        RAISE EXCEPTION 'HO_NOT_FOUND: Handoff task not found.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_who IS DISTINCT FROM (SELECT upper(name) FROM public.team_members WHERE id = v_row.sent_to_id) THEN
        RAISE EXCEPTION 'HO_NOT_YOURS: Only the recipient can mark this task as done.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_row.cancelled_at IS NOT NULL OR v_row.done = true THEN
        RAISE EXCEPTION 'HO_STATE: Task is already done or cancelled.'
            USING ERRCODE = 'P0001';
    END IF;

    v_note_clean := trim(p_note);
    IF v_note_clean = '' THEN
        v_note_clean := NULL;
    END IF;
    IF v_note_clean IS NOT NULL AND length(v_note_clean) > 1000 THEN
        RAISE EXCEPTION 'HO_BAD_INPUT: Done note must be at most 1000 characters.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.tasks
    SET done = true,
        done_by = (SELECT name FROM public.team_members WHERE id = v_row.sent_to_id),
        done_note = v_note_clean,
        seen_at = coalesce(seen_at, now()),
        stuck_at = NULL
    WHERE id = p_id;

    SELECT * INTO v_row FROM public.tasks WHERE id = p_id;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'done', v_row.done,
        'completed_at', v_row.completed_at,
        'done_by', v_row.done_by
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bb_handoff_done(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_done(bigint, text, text) TO anon, authenticated;

-- 6. bb_handoff_stuck ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bb_handoff_stuck(
    p_id bigint,
    p_who text,
    p_note text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.tasks%ROWTYPE;
    v_who text;
    v_note_clean text;
    v_timestamp text;
BEGIN
    v_who := upper(trim(p_who));

    SELECT * INTO v_row
    FROM public.tasks
    WHERE id = p_id
    FOR UPDATE;

    IF v_row.id IS NULL OR v_row.sent_to_id IS NULL THEN
        RAISE EXCEPTION 'HO_NOT_FOUND: Handoff task not found.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_who IS DISTINCT FROM (SELECT upper(name) FROM public.team_members WHERE id = v_row.sent_to_id) THEN
        RAISE EXCEPTION 'HO_NOT_YOURS: Only the recipient can mark this task as stuck.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_row.done = true OR v_row.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'HO_STATE: Cannot mark a done or cancelled task as stuck.'
            USING ERRCODE = 'P0001';
    END IF;

    v_note_clean := trim(p_note);
    IF v_note_clean IS NULL OR length(v_note_clean) < 1 OR length(v_note_clean) > 1000 THEN
        RAISE EXCEPTION 'HO_BAD_INPUT: Stuck note must be between 1 and 1000 characters.'
            USING ERRCODE = 'P0001';
    END IF;

    v_timestamp := to_char(now() AT TIME ZONE 'Asia/Colombo', 'DD Mon HH24:MI');

    UPDATE public.tasks
    SET stuck_note = concat_ws(E'\n', stuck_note, v_timestamp || ' ' || v_note_clean),
        stuck_at = now(),
        seen_at = coalesce(seen_at, now())
    WHERE id = p_id;

    SELECT * INTO v_row FROM public.tasks WHERE id = p_id;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'stuck_at', v_row.stuck_at,
        'stuck_note', v_row.stuck_note
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bb_handoff_stuck(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_stuck(bigint, text, text) TO anon, authenticated;

-- 7. bb_handoff_reply ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bb_handoff_reply(
    p_id bigint,
    p_by text,
    p_reply text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.tasks%ROWTYPE;
    v_by text;
    v_reply_clean text;
BEGIN
    v_by := upper(trim(p_by));

    SELECT * INTO v_row
    FROM public.tasks
    WHERE id = p_id
    FOR UPDATE;

    IF v_row.id IS NULL OR v_row.sent_to_id IS NULL THEN
        RAISE EXCEPTION 'HO_NOT_FOUND: Handoff task not found.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_by IS DISTINCT FROM upper(v_row.sent_by) THEN
        RAISE EXCEPTION 'HO_NOT_YOURS: Only the sender can reply to a stuck task.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_row.stuck_at IS NULL OR v_row.done = true OR v_row.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'HO_STATE: Task is not stuck, or is already done or cancelled.'
            USING ERRCODE = 'P0001';
    END IF;

    v_reply_clean := trim(p_reply);
    IF v_reply_clean IS NULL OR length(v_reply_clean) < 1 OR length(v_reply_clean) > 1000 THEN
        RAISE EXCEPTION 'HO_BAD_INPUT: Reply must be between 1 and 1000 characters.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.tasks
    SET stuck_reply = v_reply_clean,
        stuck_reply_at = now()
    WHERE id = p_id;

    SELECT * INTO v_row FROM public.tasks WHERE id = p_id;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'stuck_reply', v_row.stuck_reply,
        'stuck_reply_at', v_row.stuck_reply_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bb_handoff_reply(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_reply(bigint, text, text) TO anon, authenticated;

-- 8. bb_handoff_cancel --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bb_handoff_cancel(
    p_id bigint,
    p_by text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_row public.tasks%ROWTYPE;
    v_by text;
BEGIN
    v_by := upper(trim(p_by));

    SELECT * INTO v_row
    FROM public.tasks
    WHERE id = p_id
    FOR UPDATE;

    IF v_row.id IS NULL OR v_row.sent_to_id IS NULL THEN
        RAISE EXCEPTION 'HO_NOT_FOUND: Handoff task not found.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_by IS DISTINCT FROM upper(v_row.sent_by) THEN
        RAISE EXCEPTION 'HO_NOT_YOURS: Only the sender can cancel this task.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_row.done = true OR v_row.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'HO_STATE: Task is already done or cancelled.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.tasks
    SET cancelled_at = now(),
        done = true
    WHERE id = p_id;

    SELECT * INTO v_row FROM public.tasks WHERE id = p_id;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'cancelled_at', v_row.cancelled_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bb_handoff_cancel(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_cancel(bigint, text) TO anon, authenticated;

-- 9. bb_handoff_board view ----------------------------------------------------
CREATE OR REPLACE VIEW public.bb_handoff_board
WITH (security_invoker = true)
AS
SELECT
    tm.id AS member_id,
    tm.name,
    tm.role,
    count(t.id) FILTER (
        WHERE t.done = false AND t.cancelled_at IS NULL
    ) AS pending,
    count(t.id) FILTER (
        WHERE t.done = false
          AND t.cancelled_at IS NULL
          AND CASE WHEN t.due ~ '^\d{4}-\d{2}-\d{2}$'
                   THEN t.due < to_char(now() AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD')
                   ELSE false END
    ) AS overdue,
    count(t.id) FILTER (
        WHERE t.done = false
          AND t.cancelled_at IS NULL
          AND t.stuck_at IS NOT NULL
    ) AS stuck,
    count(t.id) FILTER (
        WHERE t.done = false
          AND t.cancelled_at IS NULL
          AND t.seen_at IS NULL
    ) AS not_seen,
    count(t.id) FILTER (
        WHERE t.done = true
          AND t.cancelled_at IS NULL
          AND t.completed_at >= date_trunc('week', now() AT TIME ZONE 'Asia/Colombo') AT TIME ZONE 'Asia/Colombo'
    ) AS done_this_week
FROM public.team_members tm
LEFT JOIN public.tasks t ON t.sent_to_id = tm.id
WHERE tm.active = true
GROUP BY tm.id, tm.name, tm.role;

GRANT SELECT ON public.bb_handoff_board TO anon, authenticated;

-- 10. Function comments -------------------------------------------------------
COMMENT ON FUNCTION public.bb_handoff_send(bigint, text, text, bigint, text, text)
    IS 'Sends a new handoff task to an active team member, subject to a daily cap.';
COMMENT ON FUNCTION public.bb_handoff_seen(bigint, text, boolean)
    IS 'Marks a handoff task as seen by the recipient or acknowledges completion as the sender.';
COMMENT ON FUNCTION public.bb_handoff_done(bigint, text, text)
    IS 'Marks a handoff task as done by the recipient with an optional completion note.';
COMMENT ON FUNCTION public.bb_handoff_stuck(bigint, text, text)
    IS 'Appends a stuck note to a pending handoff task by the recipient.';
COMMENT ON FUNCTION public.bb_handoff_reply(bigint, text, text)
    IS 'Allows the sender to reply to the most recent stuck note on a pending task.';
COMMENT ON FUNCTION public.bb_handoff_cancel(bigint, text)
    IS 'Cancels a pending handoff task by the sender, marking it as done without a done_by value.';
