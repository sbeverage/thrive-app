-- Normalise vendors.hours JSONB keys to the canonical 3-letter lowercase form.
--
-- The donor app sorts hours by matching keys against a canonical Mon–Sun
-- list. Historically vendors have been saved with two different shapes for
-- hours — full day names ("monday") from the original wizard and 3-letter
-- abbreviations ("mon") from newer entry paths. When they mix, some vendors
-- render in random order (Fri, Thu, Wed, ...).
--
-- Going forward every write path routes through lib/vendorHours.ts →
-- normalizeHours() and lands as 3-letter lowercase. This migration
-- backfills every existing row so the raw data matches.

DO $$
DECLARE
  v_row RECORD;
  v_new JSONB;
  v_key TEXT;
  v_normalized TEXT;
  v_value JSONB;
BEGIN
  FOR v_row IN
    SELECT id, hours
    FROM vendors
    WHERE hours IS NOT NULL
      AND jsonb_typeof(hours) = 'object'
  LOOP
    v_new := '{}'::jsonb;
    FOR v_key, v_value IN
      SELECT key, value FROM jsonb_each(v_row.hours)
    LOOP
      v_normalized := lower(trim(v_key));
      -- Take the first three characters if it's a recognised weekday, so
      -- "monday" / "Mon" / "MON " all collapse to "mon". Anything that
      -- doesn't match a weekday keeps its original key unchanged.
      IF substr(v_normalized, 1, 3) IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') THEN
        v_new := v_new || jsonb_build_object(substr(v_normalized, 1, 3), v_value);
      ELSE
        v_new := v_new || jsonb_build_object(v_key, v_value);
      END IF;
    END LOOP;

    IF v_new IS DISTINCT FROM v_row.hours THEN
      UPDATE vendors SET hours = v_new WHERE id = v_row.id;
    END IF;
  END LOOP;
END $$;
