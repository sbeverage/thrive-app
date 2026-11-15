-- Read only. Query 5 attempts a real INSERT and then deliberately aborts, so
-- nothing is written. Run the whole file.
--
-- WHY
-- POST /discounts/:id/redeem is answering "We couldn't record that
-- redemption." That message comes from routes/discounts.ts, where the INSERT
-- into `redemptions` failed. The route used to log and carry on, which is why
-- the table holds 4 of the 28 redemptions that actually happened between April
-- and September 2026. The failure is probably not new. What is new is that it
-- is visible.
--
-- Ruled out already, without needing this file:
--   * Missing columns. Probing PostgREST shows redemptions has exactly
--     id, user_id, discount_id, vendor_id, redemption_code, redeemed_at,
--     total_bill, total_savings, created_at, source, source_context, and the
--     route supplies every one that has no default.
--   * RLS. index.ts builds its client with SUPABASE_SERVICE_ROLE_KEY, which
--     bypasses row level security.
--   * The 2026-11-13 attribution migration. It only added nullable columns and
--     non-unique indexes.
--
-- What is left is a constraint. The leading theory is a UNIQUE constraint that
-- the route cannot satisfy: it sets
--     redemption_code = discount.discount_code
-- which is the SAME value for every redemption of that discount, by anyone,
-- forever. If redemption_code is unique, exactly one redemption per discount
-- can ever be recorded and every later one fails. "4 of 28" is what that would
-- look like if there were four discounts.
--
-- Query 1 is the answer. Query 5 is the proof.

-- 1. THE ANSWER. Every constraint on the table, with its definition.
--    Look for UNIQUE (contype = 'u') on redemption_code, or on
--    (user_id, discount_id).
SELECT conname,
       CASE contype
         WHEN 'p' THEN 'primary key'
         WHEN 'u' THEN 'UNIQUE'
         WHEN 'f' THEN 'foreign key'
         WHEN 'c' THEN 'check'
         ELSE contype::text
       END                                   AS kind,
       pg_get_constraintdef(oid)             AS definition
FROM pg_constraint
WHERE conrelid = 'public.redemptions'::regclass
ORDER BY contype, conname;

-- 1b. Indexes too. A unique INDEX enforces uniqueness without showing up as a
--     constraint, so the list above alone is not conclusive.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'redemptions'
ORDER BY indexname;

-- 2. How bad is the loss? `redemptions` versus the app's other write path,
--    transactions of type 'redemption'. These should be close to equal.
SELECT
  (SELECT COUNT(*) FROM redemptions)                                AS redemptions_recorded,
  (SELECT COUNT(*) FROM transactions WHERE type = 'redemption')     AS redemption_transactions,
  (SELECT COUNT(DISTINCT discount_id) FROM redemptions)             AS distinct_discounts_recorded,
  (SELECT COUNT(*) FROM discounts)                                  AS discounts_total;

-- 3. If redemption_code were unique, there would be no duplicates. If this
--    returns rows, the column is NOT unique and the theory above is wrong.
SELECT redemption_code, COUNT(*) AS times_used,
       COUNT(DISTINCT user_id) AS distinct_donors
FROM redemptions
GROUP BY redemption_code
HAVING COUNT(*) > 1
ORDER BY times_used DESC
LIMIT 20;

-- 4. One row per discount: has anyone ever recorded a redemption of it?
--    Under the unique-code theory, every discount shows at most 1.
SELECT d.id, d.title, d.discount_code,
       COUNT(r.id) AS redemptions_recorded,
       MAX(r.redeemed_at) AS last_recorded
FROM discounts d
LEFT JOIN redemptions r ON r.discount_id = d.id
GROUP BY d.id, d.title, d.discount_code
ORDER BY redemptions_recorded DESC, d.id;

-- 5. THE PROOF. Performs exactly the INSERT the Edge Function performs, with
--    real ids taken from the discount that just failed, then ABORTS so nothing
--    is written. The result is an error either way: read its text.
--
--      "DIAGNOSIS: <postgres error>"  -> that is the bug, reported verbatim
--      "DIAGNOSIS: insert succeeded"  -> the constraint theory is wrong and
--                                        the failure is elsewhere
--
--    Nothing is committed in either case. The final RAISE is what rolls it
--    back, and it fires unconditionally.
DO $$
DECLARE
  v_discount   RECORD;
  v_user_id    INTEGER;
  v_err        TEXT;
  v_state      TEXT;
BEGIN
  SELECT id, vendor_id, discount_code
    INTO v_discount
  FROM discounts
  WHERE title ILIKE '%Date Night Dollars Off%'
  ORDER BY id
  LIMIT 1;

  IF v_discount.id IS NULL THEN
    RAISE EXCEPTION 'DIAGNOSIS: could not find the discount by title; edit the ILIKE above';
  END IF;

  -- Prefer a donor who has already redeemed this discount, because that is the
  -- case that fails under the unique-code theory. Otherwise any donor.
  SELECT user_id INTO v_user_id
  FROM redemptions
  WHERE discount_id = v_discount.id
  ORDER BY redeemed_at DESC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM users WHERE role = 'donor' ORDER BY id LIMIT 1;
  END IF;

  BEGIN
    INSERT INTO public.redemptions
      (discount_id, user_id, vendor_id, redemption_code, redeemed_at)
    VALUES
      (v_discount.id, v_user_id, v_discount.vendor_id,
       COALESCE(v_discount.discount_code,
                'REDEEM-' || v_discount.id || '-' || extract(epoch from now())::bigint),
       now());
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
  END;

  RAISE EXCEPTION 'DIAGNOSIS: %',
    COALESCE(
      'SQLSTATE ' || v_state || ' — ' || v_err,
      'insert succeeded (rolled back). discount=' || v_discount.id ||
      ' user=' || v_user_id || ' — the constraint theory is wrong.'
    );
END $$;
