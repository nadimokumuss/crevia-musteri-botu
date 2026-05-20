-- Atomik manuel arama listesi oluşturma
-- call_lists + assignments + lead_activities tek transaction'da yazılır
-- Herhangi bir adım fail ederse Postgres otomatik ROLLBACK yapar

CREATE OR REPLACE FUNCTION create_call_list_atomic(
  p_agent_id UUID,
  p_list_date DATE,
  p_items JSONB,
  p_lead_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_list call_lists%ROWTYPE;
  v_lead_id UUID;
  v_total INT;
BEGIN
  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'NO_LEADS' USING ERRCODE = 'P0001';
  END IF;

  v_total := array_length(p_lead_ids, 1);

  IF jsonb_array_length(p_items) <> v_total THEN
    RAISE EXCEPTION 'ITEMS_LEAD_COUNT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  -- 1) call_lists insert (UNIQUE(agent_id, list_date) çakışırsa 23505)
  INSERT INTO call_lists (agent_id, list_date, items, total_items, completed_items)
  VALUES (p_agent_id, p_list_date, p_items, v_total, 0)
  RETURNING * INTO v_call_list;

  -- 2) assignments insert (UNIQUE(lead_id) çakışırsa 23505 → tüm transaction ROLLBACK)
  FOREACH v_lead_id IN ARRAY p_lead_ids
  LOOP
    INSERT INTO assignments (lead_id, agent_id, assignment_type, scheduled_date, status)
    VALUES (v_lead_id, p_agent_id, 'CALL', p_list_date, 'PENDING');

    INSERT INTO lead_activities (lead_id, activity_type, agent_id, description, metadata)
    VALUES (
      v_lead_id,
      'ASSIGNMENT_CREATED',
      p_agent_id,
      format('Manuel arama listesine eklendi (%s)', p_list_date),
      jsonb_build_object('assignment_type', 'CALL', 'scheduled_date', p_list_date::text)
    );
  END LOOP;

  RETURN to_jsonb(v_call_list);
END;
$$;

COMMENT ON FUNCTION create_call_list_atomic IS
  'Atomic call list + assignments + activity log creation. UNIQUE constraint çakışmaları otomatik rollback yapar.';
