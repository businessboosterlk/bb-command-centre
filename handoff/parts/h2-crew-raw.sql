-- Migration: H2 – handoff phone alert, skip line in old task alert, and 17:00 nudge
-- Assumes H1 columns (sent_to_id, sent_by, seen_at, etc.) already exist on public.tasks.

-- 1. Handoff URL for a team member
CREATE OR REPLACE FUNCTION public.bb_handoff_url(p_member_id bigint)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO public
AS $$
  SELECT CASE
    WHEN lower(tm.role) LIKE '%video%' OR lower(tm.role) LIKE '%editor%' OR tm.head_of = 'video'
      THEN 'https://businessboosterlk.github.io/bb-video-system/'
    WHEN lower(tm.role) LIKE '%social media%' OR tm.head_of = 'smm'
      THEN 'https://businessboosterlk.github.io/bb-smm-workspace/'
    WHEN lower(tm.role) LIKE '%graphic%' OR tm.head_of = 'graphic'
      THEN 'https://businessboosterlk.github.io/bb-graphic-system/'
    WHEN lower(tm.role) LIKE '%dev%'
      THEN 'https://businessboosterlk.github.io/bb-dev-system/'
    ELSE 'https://businessboosterlk.github.io/bb-command-centre/'
  END
  FROM public.team_members tm
  WHERE tm.id = p_member_id;
$$;
REVOKE ALL ON FUNCTION public.bb_handoff_url(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_url(bigint) TO anon, authenticated;
COMMENT ON FUNCTION public.bb_handoff_url(bigint) IS 'Returns the system URL a team member should open based on their role or head_of.';

-- 2. Trigger function for handoff alert
CREATE OR REPLACE FUNCTION public.bb_notify_on_handoff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public
AS $$
DECLARE
  client_nm text;
BEGIN
  BEGIN
    SELECT c.name INTO client_nm
    FROM public.clients c
    WHERE c.id = NEW.client_id;

    INSERT INTO public.bb_notify_queue
      (source_table, source_id, to_stage, title, body, url, recipients, send_after)
    VALUES (
      'handoff',
      NEW.id,
      'sent',
      'From ' || initcap(NEW.sent_by),
      NEW.title
        || CASE WHEN client_nm IS NOT NULL THEN ' · ' || client_nm ELSE '' END
        || CASE WHEN NEW.due ~ '^\d{4}-\d{2}-\d{2}$' THEN ' · by ' || to_char(NEW.due::date, 'Dy DD Mon') ELSE '' END,
      public.bb_handoff_url(NEW.sent_to_id),
      ARRAY[NEW.sent_to_id],
      public.bb_notify_send_after(now())
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bb_notify_on_handoff failed silently: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bb_notify_on_handoff() FROM PUBLIC;
-- No GRANT needed; only the trigger executes it.
COMMENT ON FUNCTION public.bb_notify_on_handoff() IS 'Inserts a phone alert when a task is handed off to a team member.';

DROP TRIGGER IF EXISTS bb_notify_handoff ON public.tasks;
CREATE TRIGGER bb_notify_handoff
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  WHEN (NEW.sent_to_id IS NOT NULL)
  EXECUTE FUNCTION public.bb_notify_on_handoff();

-- 3. Updated old task alert with skip line for sent tasks
CREATE OR REPLACE FUNCTION public.bb_notify_on_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rec bigint[]; client_nm text; existing bigint; n int;
begin
  if new.sent_to_id is not null then return new; end if;
  if tg_op = 'UPDATE' and (new.assign is not distinct from old.assign) then return new; end if;
  if coalesce(new.done,false) then return new; end if;
  rec := public.bb_assign_to_members(new.assign);
  if array_length(rec,1) is null then return new; end if;
  select name into client_nm from clients where id = new.client_id;

  -- DEBOUNCE. The SMM Workspace copies one task to many clients in one go.
  -- Twenty inserts must become ONE alert, not twenty. If an unsent tasks
  -- alert for the same people exists from the last 2 minutes, fold into it
  -- and push its send time out by a minute.
  select id into existing from bb_notify_queue
   where source_table='tasks' and sent_at is null and recipients = rec and created_at > now() - interval '2 minutes'
   order by id desc limit 1;
  if existing is not null then
    update bb_notify_queue set
      body = case when body ~ '^\d+ new tasks' then (substring(body from '^\d+')::int + 1) || ' new tasks for you' else '2 new tasks for you' end,
      send_after = greatest(send_after, now() + interval '60 seconds')
    where id = existing;
    return new;
  end if;

  insert into bb_notify_queue (source_table, source_id, to_stage, title, body, url, recipients, send_after)
  values ('tasks', new.id, 'assigned', 'New task for you',
          coalesce(new.title,'Untitled') || case when client_nm is not null then ' · ' || client_nm else '' end,
          'https://businessboosterlk.github.io/bb-command-centre/', rec,
          public.bb_notify_send_after(now() + interval '45 seconds'));
  return new;
exception when others then raise warning 'bb_notify_on_task failed silently: %', sqlerrm; return new;
end $function$;
COMMENT ON FUNCTION public.bb_notify_on_task() IS 'Sends a phone alert for newly assigned tasks, skipping sent tasks and debouncing bulk inserts.';

-- 4. Handoff nudge function (17:00 schedule)
CREATE OR REPLACE FUNCTION public.bb_handoff_nudge(p_dry boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public
AS $$
DECLARE
  nudged_ids bigint[] := '{}';
  nudged_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT t.id, t.sent_to_id, t.sent_by, t.title
    FROM public.tasks t
    JOIN public.team_members tm ON tm.id = t.sent_to_id
    WHERE t.sent_to_id IS NOT NULL
      AND t.done = false
      AND t.cancelled_at IS NULL
      AND t.seen_at IS NULL
      AND t.created_at < now() - interval '30 minutes'
      AND tm.active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.bb_notify_queue nq
        WHERE nq.source_table = 'handoff_nudge'
          AND nq.source_id = t.id
          AND nq.created_at::date = (now() AT TIME ZONE 'Asia/Colombo')::date
      )
  LOOP
    nudged_ids := array_append(nudged_ids, r.id);
    nudged_count := nudged_count + 1;

    IF NOT p_dry THEN
      INSERT INTO public.bb_notify_queue
        (source_table, source_id, to_stage, title, body, url, recipients, send_after)
      VALUES (
        'handoff_nudge',
        r.id,
        'nudge',
        'Still waiting: from ' || initcap(r.sent_by),
        'Open it and tap Done or Stuck: ' || r.title,
        public.bb_handoff_url(r.sent_to_id),
        ARRAY[r.sent_to_id],
        public.bb_notify_send_after(now())
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'nudged', nudged_count,
    'dry', p_dry,
    'ids', nudged_ids
  );
END;
$$;
REVOKE ALL ON FUNCTION public.bb_handoff_nudge(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bb_handoff_nudge(boolean) TO postgres;
COMMENT ON FUNCTION public.bb_handoff_nudge(boolean) IS 'Sends one daily nudge per unseen handoff task older than 30 minutes, unless dry run.';

-- 5. Schedule the 17:00 Colombo (11:30 UTC) nudge, weekdays only
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bb-handoff-nudge-1700';
  PERFORM cron.schedule('bb-handoff-nudge-1700', '30 11 * * 1-5', 'select public.bb_handoff_nudge(false)');
END;
$$;
