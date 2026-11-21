-- Undo for H2-alerts.sql (8 Nov 2026). Puts back exactly what was live before H2: removes the 17:00 schedule, the
-- nudge, the handoff alert trigger and its function, the address function, and restores the old task alert without
-- the skip line (byte for byte the live body read on 8 Nov 2026).
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'bb-handoff-nudge-1700';
END;
$$;
DROP FUNCTION IF EXISTS public.bb_handoff_nudge(boolean);
DROP TRIGGER IF EXISTS bb_notify_handoff ON public.tasks;
DROP FUNCTION IF EXISTS public.bb_notify_on_handoff();
DROP FUNCTION IF EXISTS public.bb_handoff_url(bigint);

CREATE OR REPLACE FUNCTION public.bb_notify_on_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rec bigint[]; client_nm text; existing bigint; n int;
begin
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
