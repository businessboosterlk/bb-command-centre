-- Rehearsal tests for H1. Run AFTER H1-handoff.sql inside one transaction. The block always ends by raising
-- REHEARSAL_DONE, which throws the whole transaction away, so nothing it did (migration included) is kept.
DO $$
DECLARE
  r text := '';
  v_ed bigint; v_ed_name text; v_other text; v_id bigint; v_id2 bigint; j jsonb; c int; b record; ok boolean;
BEGIN
  SELECT id, name INTO v_ed, v_ed_name FROM team_members WHERE active AND upper(name) NOT IN ('THULAIB','SHIARA') ORDER BY id LIMIT 1;
  SELECT name INTO v_other FROM team_members WHERE active AND id <> v_ed AND upper(name) NOT IN ('THULAIB','SHIARA') ORDER BY id LIMIT 1;
  SET LOCAL ROLE anon;  -- every call below runs as the public key does from a phone

  v_id := bb_handoff_send(v_ed, '  Rehearsal: cut the reel  ', to_char(now() AT TIME ZONE 'Asia/Colombo','YYYY-MM-DD'), NULL, 'note', 'thulaib');
  SELECT count(*) INTO c FROM tasks WHERE id = v_id AND sent_to_id = v_ed AND sent_by = 'THULAIB' AND assign = v_ed_name AND title = 'Rehearsal: cut the reel' AND done = false;
  r := r || format('1 send as anon: %s | ', CASE WHEN c = 1 THEN 'PASS' ELSE 'FAIL' END);

  BEGIN PERFORM bb_handoff_send(v_ed, 'x', NULL, NULL, NULL, 'NIRVANA'); r := r || '2 non sender refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('2 non sender refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_NOT_YOURS%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;
  BEGIN PERFORM bb_handoff_send(v_ed, 'x', '2026-02-30', NULL, NULL, 'THULAIB'); r := r || '3 bad date refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('3 bad date refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_BAD_INPUT%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;

  BEGIN PERFORM bb_handoff_done(v_id, v_other, NULL); r := r || '4 wrong person Done refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('4 wrong person Done refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_NOT_YOURS%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;
  BEGIN PERFORM bb_handoff_done(v_id, NULL, NULL); r := r || '5 blank person Done refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('5 blank person Done refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_NOT_YOURS%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;

  j := bb_handoff_seen(v_id, lower(v_ed_name));
  r := r || format('6 seen stamps: %s | ', CASE WHEN j->>'seen_at' IS NOT NULL THEN 'PASS' ELSE 'FAIL' END);

  PERFORM bb_handoff_stuck(v_id, v_ed_name, 'Need the logo file');
  j := bb_handoff_stuck(v_id, v_ed_name, 'Still waiting');
  r := r || format('7 second Stuck keeps the first: %s | ', CASE WHEN j->>'stuck_note' LIKE '%Need the logo file%' AND j->>'stuck_note' LIKE '%Still waiting%' THEN 'PASS' ELSE 'FAIL' END);

  SELECT * INTO b FROM bb_handoff_board WHERE member_id = v_ed;
  r := r || format('8 board as anon (pending %s stuck %s): %s | ', b.pending, b.stuck, CASE WHEN b.pending >= 1 AND b.stuck >= 1 THEN 'PASS' ELSE 'FAIL' END);

  BEGIN PERFORM bb_handoff_reply(v_id, 'SHIARA', 'x'); r := r || '9 reply by non sender refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('9 reply by non sender refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_NOT_YOURS%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;
  j := bb_handoff_reply(v_id, 'Thulaib', 'Ask Farhath');
  r := r || format('10 reply saved: %s | ', CASE WHEN j->>'stuck_reply' = 'Ask Farhath' THEN 'PASS' ELSE 'FAIL' END);
  j := bb_handoff_seen(v_id, v_ed_name, true);
  r := r || format('11 carry on clears stuck: %s | ', CASE WHEN j->>'stuck_at' IS NULL THEN 'PASS' ELSE 'FAIL' END);

  BEGIN PERFORM bb_handoff_seen(v_id, 'THULAIB'); r := r || '12 sender seen before done refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('12 sender seen before done refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_STATE%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;

  j := bb_handoff_done(v_id, v_ed_name, 'Sent to the client');
  SELECT count(*) INTO c FROM tasks WHERE id = v_id AND done AND completed_at IS NOT NULL AND done_note = 'Sent to the client' AND done_by = v_ed_name AND stuck_note LIKE '%Need the logo file%';
  r := r || format('13 Done keeps history and stamps completed_at: %s | ', CASE WHEN c = 1 THEN 'PASS' ELSE 'FAIL' END);
  BEGIN PERFORM bb_handoff_done(v_id, v_ed_name, NULL); r := r || '14 second Done refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('14 second Done refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_STATE%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;
  j := bb_handoff_seen(v_id, 'THULAIB');
  r := r || format('15 sender saw the Done: %s | ', CASE WHEN j->>'sender_seen_done_at' IS NOT NULL THEN 'PASS' ELSE 'FAIL' END);

  v_id2 := bb_handoff_send(v_ed, 'Rehearsal two', NULL, NULL, NULL, 'SHIARA');
  BEGIN PERFORM bb_handoff_cancel(v_id2, 'THULAIB'); r := r || '16 cancel by other sender refused: FAIL | ';
  EXCEPTION WHEN others THEN r := r || format('16 cancel by other sender refused: %s | ', CASE WHEN SQLERRM LIKE 'HO_NOT_YOURS%' THEN 'PASS' ELSE 'FAIL '||SQLERRM END); END;
  j := bb_handoff_cancel(v_id2, 'Shiara');
  SELECT count(*) INTO c FROM tasks WHERE id = v_id2 AND cancelled_at IS NOT NULL AND done;
  r := r || format('17 cancel keeps the row: %s | ', CASE WHEN c = 1 THEN 'PASS' ELSE 'FAIL' END);

  SELECT * INTO b FROM bb_handoff_board WHERE member_id = v_ed;
  r := r || format('18 board after (pending %s done this week %s): %s | ', b.pending, b.done_this_week, CASE WHEN b.done_this_week >= 1 THEN 'PASS' ELSE 'FAIL' END);
  SELECT count(*) INTO c FROM bb_handoff_board;
  r := r || format('19 board rows = active people: %s', c);
  RESET ROLE;
  SELECT count(*) INTO c FROM tasks;
  r := r || format(' | tasks rows inside block %s', c);

  RAISE EXCEPTION 'REHEARSAL_DONE %', r;
END $$;
