-- Atomik arama sonucu güncelleme
-- call_lists.items JSONB içinde tek lead'i güncelle
-- assignments.status'ü senkronize et
-- lead_activities log yaz
-- Tek transaction'da, lost-update riski yok

CREATE OR REPLACE FUNCTION update_call_item_atomic(
  p_agent_id UUID,
  p_lead_id UUID,
  p_status TEXT,
  p_outcome TEXT,
  p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment assignments%ROWTYPE;
  v_call_list call_lists%ROWTYPE;
  v_idx INT;
  v_item JSONB;
  v_new_items JSONB;
  v_completed INT;
  v_assignment_status assignment_status;
BEGIN
  -- 1) Atamayı bul (lead + agent + CALL) — kaynak tek "doğruluk noktası"
  SELECT * INTO v_assignment
  FROM assignments
  WHERE lead_id = p_lead_id
    AND agent_id = p_agent_id
    AND assignment_type = 'CALL'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 2) İlgili call_list'i kilitle (FOR UPDATE — paralel PATCH'leri serialize eder)
  SELECT * INTO v_call_list
  FROM call_lists
  WHERE agent_id = p_agent_id
    AND list_date = v_assignment.scheduled_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CALL_LIST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 3) JSONB items içinde lead'i bul, güncelle (jsonb_set ile in-place)
  v_idx := NULL;
  FOR i IN 0..jsonb_array_length(v_call_list.items) - 1
  LOOP
    IF (v_call_list.items->i->>'leadId') = p_lead_id::text THEN
      v_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_IN_LIST' USING ERRCODE = 'P0002';
  END IF;

  v_item := v_call_list.items->v_idx;

  IF p_status IS NOT NULL THEN
    v_item := jsonb_set(v_item, '{status}', to_jsonb(p_status));
  END IF;
  IF p_outcome IS NOT NULL THEN
    v_item := jsonb_set(v_item, '{outcome}', to_jsonb(p_outcome));
  END IF;
  IF p_notes IS NOT NULL THEN
    v_item := jsonb_set(v_item, '{notes}', to_jsonb(p_notes));
  END IF;

  v_new_items := jsonb_set(v_call_list.items, ARRAY[v_idx::text], v_item);

  -- 4) completed_items recompute (PENDING olmayanların sayısı)
  SELECT count(*)::INT INTO v_completed
  FROM jsonb_array_elements(v_new_items) AS elem
  WHERE elem->>'status' IS DISTINCT FROM 'PENDING';

  UPDATE call_lists
  SET items = v_new_items,
      completed_items = v_completed
  WHERE id = v_call_list.id;

  -- 5) assignment status mapping
  IF p_status IS NOT NULL THEN
    v_assignment_status := CASE p_status
      WHEN 'PENDING' THEN 'PENDING'
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'INTERESTED' THEN 'COMPLETED'
      WHEN 'DEMO' THEN 'COMPLETED'
      ELSE 'IN_PROGRESS'
    END::assignment_status;

    UPDATE assignments
    SET status = v_assignment_status,
        outcome = COALESCE(p_outcome, outcome),
        notes = COALESCE(p_notes, notes)
    WHERE id = v_assignment.id;
  END IF;

  -- 6) Activity log
  INSERT INTO lead_activities (lead_id, activity_type, agent_id, description, new_value, metadata)
  VALUES (
    p_lead_id,
    'CALL_LOGGED',
    p_agent_id,
    format('Arama sonucu: %s', COALESCE(p_outcome, p_status, 'guncellendi')),
    COALESCE(p_outcome, p_status),
    jsonb_build_object('notes', p_notes)
  );

  RETURN jsonb_build_object(
    'call_list_id', v_call_list.id,
    'updated_item', v_item,
    'completed_items', v_completed,
    'total_items', jsonb_array_length(v_new_items)
  );
END;
$$;

COMMENT ON FUNCTION update_call_item_atomic IS
  'Atomic call item update with row-level lock — JSONB lost-update riski yok.';
