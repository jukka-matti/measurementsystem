-- Security fix: Add org membership validation to SECURITY DEFINER functions
-- This prevents users from querying data from orgs they don't belong to

-- Helper function to check if user belongs to an org
CREATE OR REPLACE FUNCTION check_user_org_membership(p_org_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Check if the current user (from JWT) belongs to the requested org
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND org_id = p_org_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_wip_by_stage to validate org membership
CREATE OR REPLACE FUNCTION get_wip_by_stage(p_org_id uuid)
RETURNS TABLE(stage stage_key, wip_count bigint) AS $$
BEGIN
  -- Validate user belongs to requested org
  IF NOT check_user_org_membership(p_org_id) THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this organization';
  END IF;

  RETURN QUERY
    SELECT e.stage, COUNT(DISTINCT e.unit_id)::bigint as wip_count
    FROM events e
    WHERE e.org_id = p_org_id
      AND e.type = 'stage_start'
      AND NOT EXISTS (
        SELECT 1 FROM events e2
        WHERE e2.unit_id = e.unit_id
          AND e2.stage = e.stage
          AND e2.type = 'stage_complete'
          AND e2.org_id = p_org_id
      )
    GROUP BY e.stage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_cycle_times to validate org membership
CREATE OR REPLACE FUNCTION get_cycle_times(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  stage stage_key,
  p50_cycle_time interval,
  p90_cycle_time interval
) AS $$
BEGIN
  -- Validate user belongs to requested org
  IF NOT check_user_org_membership(p_org_id) THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this organization';
  END IF;

  RETURN QUERY
    WITH cycle_times AS (
      SELECT
        s.stage,
        (c.ts_server - s.ts_server) AS cycle_time
      FROM events s
      JOIN events c ON s.unit_id = c.unit_id
        AND s.stage = c.stage
        AND s.org_id = c.org_id
      WHERE s.org_id = p_org_id
        AND s.type = 'stage_start'
        AND c.type = 'stage_complete'
        AND s.ts_server >= p_start_date
        AND s.ts_server <= p_end_date
    )
    SELECT
      stage,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cycle_time) AS p50_cycle_time,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY cycle_time) AS p90_cycle_time
    FROM cycle_times
    GROUP BY stage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_fpy to validate org membership
CREATE OR REPLACE FUNCTION get_fpy(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  stage stage_key,
  fpy_percent numeric
) AS $$
BEGIN
  -- Validate user belongs to requested org
  IF NOT check_user_org_membership(p_org_id) THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this organization';
  END IF;

  RETURN QUERY
    WITH stage_completes AS (
      SELECT
        stage,
        COUNT(*) FILTER (WHERE qty_defect = 0) AS good_count,
        COUNT(*) AS total_count
      FROM events
      WHERE org_id = p_org_id
        AND type = 'stage_complete'
        AND ts_server >= p_start_date
        AND ts_server <= p_end_date
      GROUP BY stage
    )
    SELECT
      stage,
      CASE
        WHEN total_count > 0 THEN (good_count::numeric / total_count::numeric * 100)
        ELSE 0
      END AS fpy_percent
    FROM stage_completes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_throughput to validate org membership
CREATE OR REPLACE FUNCTION get_throughput(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  stage stage_key,
  units_completed bigint,
  avg_cycle_time interval
) AS $$
BEGIN
  -- Validate user belongs to requested org
  IF NOT check_user_org_membership(p_org_id) THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this organization';
  END IF;

  RETURN QUERY
    SELECT
      stage,
      COUNT(DISTINCT unit_id)::bigint AS units_completed,
      AVG(cycle_time) AS avg_cycle_time
    FROM (
      SELECT
        c.stage,
        c.unit_id,
        (c.ts_server - s.ts_server) AS cycle_time
      FROM events c
      JOIN events s ON c.unit_id = s.unit_id
        AND c.stage = s.stage
        AND c.org_id = s.org_id
      WHERE c.org_id = p_org_id
        AND c.type = 'stage_complete'
        AND s.type = 'stage_start'
        AND c.ts_server >= p_start_date
        AND c.ts_server <= p_end_date
    ) AS cycles
    GROUP BY stage;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update get_on_time_percentage to validate org membership
CREATE OR REPLACE FUNCTION get_on_time_percentage(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS numeric AS $$
DECLARE
  result numeric;
BEGIN
  -- Validate user belongs to requested org
  IF NOT check_user_org_membership(p_org_id) THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this organization';
  END IF;

  WITH shipped_orders AS (
    SELECT DISTINCT
      o.id,
      o.promised_ship_date,
      MIN(e.ts_server) AS actual_ship_date
    FROM orders o
    JOIN events e ON e.order_id = o.id
    WHERE o.org_id = p_org_id
      AND e.type = 'shipment_dispatch'
      AND e.ts_server >= p_start_date
      AND e.ts_server <= p_end_date
    GROUP BY o.id, o.promised_ship_date
  )
  SELECT
    CASE
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE actual_ship_date <= promised_ship_date)::numeric / COUNT(*)::numeric * 100)
      ELSE 0
    END INTO result
  FROM shipped_orders;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update create_next_unit to validate org membership
CREATE OR REPLACE FUNCTION create_next_unit(p_batch_id uuid)
RETURNS uuid AS $$
DECLARE
  v_unit_id uuid;
  v_order_id uuid;
  v_org_id uuid;
  v_label text;
  v_count integer;
  v_unit_number text;
BEGIN
  -- Get batch info
  SELECT order_id, org_id, label INTO v_order_id, v_org_id, v_label
  FROM unit_batches
  WHERE id = p_batch_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- Validate user belongs to batch's org
  IF NOT check_user_org_membership(v_org_id) THEN
    RAISE EXCEPTION 'Access denied: User does not belong to this organization';
  END IF;
  
  -- Count existing units for this batch
  SELECT COUNT(*) INTO v_count
  FROM units
  WHERE order_id = v_order_id
    AND unit_number LIKE v_label || '-%';
  
  -- Create unit number
  v_unit_number := v_label || '-' || (v_count + 1);
  
  -- Create unit
  INSERT INTO units (org_id, order_id, unit_number)
  VALUES (v_org_id, v_order_id, v_unit_number)
  RETURNING id INTO v_unit_id;
  
  RETURN v_unit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

