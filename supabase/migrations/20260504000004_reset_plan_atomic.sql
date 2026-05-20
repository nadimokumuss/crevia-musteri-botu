-- Atomik haftalık + günlük plan sıfırlama
-- Multi-table DELETE'leri tek transaction'da yapar; herhangi bir tablo fail ederse tümü ROLLBACK

CREATE OR REPLACE FUNCTION reset_weekly_plan_atomic(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan weekly_plans%ROWTYPE;
  v_start DATE;
  v_end DATE;
  v_assignments_deleted INT := 0;
  v_routes_deleted INT := 0;
  v_call_lists_deleted INT := 0;
  v_scrape_jobs_deleted INT := 0;
BEGIN
  SELECT * INTO v_plan FROM weekly_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_plan.status = 'DISTRIBUTING' THEN
    RAISE EXCEPTION 'PLAN_DISTRIBUTING' USING ERRCODE = 'P0001';
  END IF;

  v_start := v_plan.week_start;
  v_end := v_plan.week_start + INTERVAL '11 days';

  WITH d AS (DELETE FROM assignments WHERE scheduled_date BETWEEN v_start AND v_end RETURNING 1)
  SELECT count(*) INTO v_assignments_deleted FROM d;

  WITH d AS (DELETE FROM routes WHERE route_date BETWEEN v_start AND v_end RETURNING 1)
  SELECT count(*) INTO v_routes_deleted FROM d;

  WITH d AS (DELETE FROM call_lists WHERE list_date BETWEEN v_start AND v_end RETURNING 1)
  SELECT count(*) INTO v_call_lists_deleted FROM d;

  WITH d AS (DELETE FROM scrape_jobs WHERE weekly_plan_id = p_plan_id RETURNING 1)
  SELECT count(*) INTO v_scrape_jobs_deleted FROM d;

  DELETE FROM weekly_plans WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'planId', p_plan_id,
    'weekStart', v_start,
    'assignmentsDeleted', v_assignments_deleted,
    'routesDeleted', v_routes_deleted,
    'callListsDeleted', v_call_lists_deleted,
    'scrapeJobsDeleted', v_scrape_jobs_deleted
  );
END;
$$;

CREATE OR REPLACE FUNCTION reset_daily_plan_atomic(p_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignments_deleted INT := 0;
  v_routes_deleted INT := 0;
  v_call_lists_deleted INT := 0;
  v_plans_deleted INT := 0;
BEGIN
  WITH d AS (DELETE FROM assignments WHERE scheduled_date = p_date RETURNING 1)
  SELECT count(*) INTO v_assignments_deleted FROM d;

  WITH d AS (DELETE FROM routes WHERE route_date = p_date RETURNING 1)
  SELECT count(*) INTO v_routes_deleted FROM d;

  WITH d AS (DELETE FROM call_lists WHERE list_date = p_date RETURNING 1)
  SELECT count(*) INTO v_call_lists_deleted FROM d;

  WITH d AS (DELETE FROM weekly_plans WHERE week_start = p_date RETURNING 1)
  SELECT count(*) INTO v_plans_deleted FROM d;

  RETURN jsonb_build_object(
    'date', p_date,
    'assignmentsDeleted', v_assignments_deleted,
    'routesDeleted', v_routes_deleted,
    'callListsDeleted', v_call_lists_deleted,
    'plansDeleted', v_plans_deleted
  );
END;
$$;

COMMENT ON FUNCTION reset_weekly_plan_atomic IS
  'Atomic weekly plan reset — herhangi bir tablo fail ederse full ROLLBACK.';
COMMENT ON FUNCTION reset_daily_plan_atomic IS
  'Atomic daily plan reset — herhangi bir tablo fail ederse full ROLLBACK.';
