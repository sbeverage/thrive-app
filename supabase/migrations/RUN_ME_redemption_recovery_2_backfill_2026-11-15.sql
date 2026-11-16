-- WRITES. Run file 1 first and read its query 2, which lists exactly the rows
-- this creates. Nothing here deletes or changes an existing redemption.
--
-- Rebuilds the redemptions that redemptions_redemption_code_key rejected, from
-- the transaction the app wrote for the same event, and links the two so the
-- money and the redemption stop being separate facts.
--
-- SAFE TO RUN TWICE. Statement 1 skips any transaction that already has a
-- matching redemption, and statement 2's link makes it ineligible afterwards.
-- Both guards live inside their statements rather than in a prior check, so a
-- redemption happening concurrently cannot slip between the two.
--
-- No BEGIN/COMMIT here on purpose: the Supabase SQL editor already runs a
-- script in one transaction, and nesting another earns a warning and buys
-- nothing. The review step is file 1, which writes nothing.

-- ---------------------------------------------------------------------------
-- 1. Recreate the missing redemptions.
--
-- redemption_code is 'RECOVERED-<transaction id>'. Unique because transaction
-- ids are, and legible: anyone reading a redemption later can see it was
-- reconstructed rather than captured, and trace it to the row it came from.
-- Statement 2 relies on that exact shape.
--
-- NULLIF(..., 0) on the amounts is deliberate. A donor who skipped the savings
-- form has a $0 auto-created transaction, and that means "we were not told",
-- not "they saved nothing". Writing 0 would push a number nobody reported into
-- savings totals and admin averages. NULL reads as "Not told", which is what
-- the panel already shows.
--
-- A donor who double-taps Redeem writes two transaction rows for one real
-- visit. Transactions 210 and 211 are 1.56 seconds apart, same donor, same
-- discount: without a guard the backfill would record two redemptions and
-- overstate that vendor. The guard drops a transaction when an earlier one
-- exists for the same donor and discount within two minutes, which keeps the
-- first of a burst. Two minutes is short enough that genuine repeat visits
-- survive: transactions 194 and 195 are three hours apart and both recover.
--
-- `source` stays NULL. It records which entry point a redemption came from,
-- and these came from a recovery, which is not one. Inventing a value would
-- corrupt the attribution the column exists to measure.
INSERT INTO public.redemptions
  (discount_id, user_id, vendor_id, redemption_code, redeemed_at,
   total_bill, total_savings)
SELECT t.discount_id,
       t.user_id,
       COALESCE(t.vendor_id, d.vendor_id),
       'RECOVERED-' || t.id,
       t.created_at,
       NULLIF(t.spending, 0),
       NULLIF(t.savings, 0)
FROM transactions t
JOIN discounts d ON d.id = t.discount_id
WHERE t.type = 'redemption'
  AND t.redemption_id IS NULL
  AND t.discount_id IS NOT NULL
  AND t.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM redemptions r
    WHERE r.user_id = t.user_id
      AND r.discount_id = t.discount_id
      AND r.redeemed_at BETWEEN t.created_at - INTERVAL '1 hour'
                            AND t.created_at + INTERVAL '1 hour'
  )
  AND NOT EXISTS (
    SELECT 1 FROM transactions t2
    WHERE t2.type = 'redemption'
      AND t2.user_id = t.user_id
      AND t2.discount_id = t.discount_id
      AND t2.id < t.id
      AND t2.created_at > t.created_at - INTERVAL '2 minutes'
      AND t2.created_at <= t.created_at
  );

-- ---------------------------------------------------------------------------
-- 2. Link each transaction to the redemption rebuilt from it, so the admin
--    view pairs them exactly instead of inferring from donor + discount + an
--    hour window. Joins on the code convention from statement 1.
UPDATE public.transactions t
SET redemption_id = r.id
FROM public.redemptions r
WHERE r.redemption_code = 'RECOVERED-' || t.id
  AND t.redemption_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. What exists now. `amount_not_told` is expected to be non-zero: those are
--    donors who skipped the savings form.
SELECT COUNT(*)                                          AS recovered_rows,
       COUNT(*) FILTER (WHERE total_savings IS NOT NULL) AS with_savings,
       COUNT(*) FILTER (WHERE total_savings IS NULL)     AS amount_not_told,
       MIN(redeemed_at)                                  AS earliest,
       MAX(redeemed_at)                                  AS latest
FROM redemptions
WHERE redemption_code LIKE 'RECOVERED-%';

-- ---------------------------------------------------------------------------
-- 4. Should be 0. Anything left here has a discount_id but still did not
--    match, which would mean statement 1's guard and this check disagree.
SELECT COUNT(*) AS still_unmatched
FROM transactions t
WHERE t.type = 'redemption'
  AND t.redemption_id IS NULL
  AND t.discount_id IS NOT NULL
  AND t.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM redemptions r
    WHERE r.user_id = t.user_id
      AND r.discount_id = t.discount_id
      AND r.redeemed_at BETWEEN t.created_at - INTERVAL '1 hour'
                            AND t.created_at + INTERVAL '1 hour'
  )
  AND NOT EXISTS (
    SELECT 1 FROM transactions t2
    WHERE t2.type = 'redemption'
      AND t2.user_id = t.user_id
      AND t2.discount_id = t.discount_id
      AND t2.id < t.id
      AND t2.created_at > t.created_at - INTERVAL '2 minutes'
      AND t2.created_at <= t.created_at
  );

-- ---------------------------------------------------------------------------
-- 5. The totals these rows feed, before and after, so the change to anything
--    a donor or vendor has been shown is visible rather than implied.
SELECT COUNT(*)                                          AS redemptions_total,
       COUNT(*) FILTER (WHERE redemption_code LIKE 'RECOVERED-%') AS of_which_recovered,
       COALESCE(SUM(total_savings), 0)                   AS savings_recorded,
       COUNT(DISTINCT user_id)                           AS distinct_donors,
       COUNT(DISTINCT vendor_id)                         AS distinct_vendors
FROM redemptions;
