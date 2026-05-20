-- Atomik atama kilidi alma
-- UNIQUE(lead_id) constraint'i ile birleşik, race-free

CREATE OR REPLACE FUNCTION acquire_assignment_lock(
  p_lead_id UUID,
  p_agent_id UUID,
  p_scheduled_date DATE,
  p_assignment_type TEXT,
  p_lock_minutes INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ := NOW() + (p_lock_minutes || ' minutes')::INTERVAL;
  v_existing assignments%ROWTYPE;
  v_new_id UUID;
BEGIN
  -- Mevcut atamayı FOR UPDATE ile kilitle (varsa)
  SELECT * INTO v_existing
  FROM assignments
  WHERE lead_id = p_lead_id
  FOR UPDATE;

  IF FOUND THEN
    -- Aktif başka kilitse → çatışma
    IF v_existing.locked_by IS NOT NULL
       AND v_existing.locked_by <> p_agent_id
       AND v_existing.lock_expires_at IS NOT NULL
       AND v_existing.lock_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'acquired', false,
        'reason', 'LOCKED_BY_OTHER',
        'lockExpiresAt', v_existing.lock_expires_at
      );
    END IF;

    -- Aynı agent + aynı parametreler → kilidi yenile
    IF v_existing.agent_id = p_agent_id
       AND v_existing.scheduled_date = p_scheduled_date
       AND v_existing.assignment_type::text = p_assignment_type THEN
      UPDATE assignments
      SET locked_at = v_now,
          lock_expires_at = v_expires,
          locked_by = p_agent_id,
          status = 'PENDING'
      WHERE id = v_existing.id;

      RETURN jsonb_build_object(
        'acquired', true,
        'lockId', v_existing.id,
        'expiresAt', v_expires
      );
    END IF;

    -- Lead başka birine atanmış (kilit süresi dolmuş ya da yok)
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'ALREADY_ASSIGNED'
    );
  END IF;

  -- Yeni atama + kilit (UNIQUE(lead_id) — paralel race olursa 23505)
  INSERT INTO assignments (
    lead_id, agent_id, assignment_type, scheduled_date,
    status, locked_at, lock_expires_at, locked_by
  ) VALUES (
    p_lead_id, p_agent_id, p_assignment_type::assignment_type, p_scheduled_date,
    'PENDING', v_now, v_expires, p_agent_id
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'acquired', true,
    'lockId', v_new_id,
    'expiresAt', v_expires
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'RACE_CONDITION'
    );
END;
$$;

COMMENT ON FUNCTION acquire_assignment_lock IS
  'Race-free assignment lock acquisition — FOR UPDATE + UNIQUE constraint.';
