-- Read only. Nothing is written. Run this before the backfill (file 2).
--
-- WHY
-- redemptions.redemption_code has a UNIQUE constraint and the redeem route
-- stored discount.discount_code in it, the same value for every redemption of
-- that discount. So the first redemption of each discount recorded and every
-- later one was rejected. Fixed in 7bf1e61 and deployed 2026-11-15.
--
-- The lost ones are not gone. The app writes a SECOND record for a redemption:
-- POST /transactions with type='redemption', from the savings screen
-- (app/(tabs)/(main)/discounts/DiscountApproved.js). That row carries user_id,
-- discount_id, vendor_id, savings, spending and created_at, which is
-- everything a redemptions row needs. And a $0 row is auto-created when the
-- donor leaves without filling the form, so coverage is close to complete for
-- the period when the redeem route still returned 200 on a failed insert.
--
-- WHAT THIS CANNOT RECOVER
-- After the route was changed to fail loudly, a donor who hit the error never
-- reached the savings screen, so there is no transaction either. Those
-- redemptions left no trace anywhere. Query 4 bounds that gap.

-- 1. THE HEADLINE. How much is missing, and how much comes back.
WITH redemption_txns AS (
  SELECT t.*
  FROM transactions t
  WHERE t.type = 'redemption'
),
unmatched AS (
  SELECT t.*
  FROM redemption_txns t
  WHERE t.redemption_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM redemptions r
      WHERE r.user_id = t.user_id
        AND r.discount_id = t.discount_id
        AND r.redeemed_at BETWEEN t.created_at - INTERVAL '1 hour'
                              AND t.created_at + INTERVAL '1 hour'
    )
)
SELECT
  (SELECT COUNT(*) FROM redemptions)                                  AS redemptions_today,
  (SELECT COUNT(*) FROM redemption_txns)                              AS redemption_transactions,
  (SELECT COUNT(*) FROM unmatched)                                    AS recoverable,
  (SELECT COUNT(*) FROM unmatched WHERE discount_id IS NULL)          AS unrecoverable_no_discount_id,
  (SELECT COUNT(*) FROM unmatched WHERE COALESCE(savings, 0) > 0)     AS recoverable_with_money,
  (SELECT MIN(created_at) FROM unmatched)                             AS earliest_lost,
  (SELECT MAX(created_at) FROM unmatched)                             AS latest_lost;

-- 2. Every row the backfill would create. Review this before running file 2.
--    A NULL discount_id cannot be recovered: redemptions.discount_id is NOT
--    NULL-bearing in practice and the FK needs a real discount.
SELECT t.id AS transaction_id,
       t.user_id,
       u.first_name || ' ' || u.last_name AS donor,
       t.discount_id,
       d.title                            AS discount,
       COALESCE(t.vendor_id, d.vendor_id) AS vendor_id,
       v.name                             AS vendor,
       NULLIF(t.spending, 0)              AS total_bill,
       NULLIF(t.savings, 0)               AS total_savings,
       t.created_at                       AS would_set_redeemed_at,
       CASE WHEN t.discount_id IS NULL THEN 'SKIPPED: no discount_id'
            ELSE 'will recover' END       AS outcome
FROM transactions t
LEFT JOIN users     u ON u.id = t.user_id
LEFT JOIN discounts d ON d.id = t.discount_id
LEFT JOIN vendors   v ON v.id = COALESCE(t.vendor_id, d.vendor_id)
WHERE t.type = 'redemption'
  AND t.redemption_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM redemptions r
    WHERE r.user_id = t.user_id
      AND r.discount_id = t.discount_id
      AND r.redeemed_at BETWEEN t.created_at - INTERVAL '1 hour'
                            AND t.created_at + INTERVAL '1 hour'
  )
ORDER BY t.created_at;

-- 3. Which discounts lost the most. Under the unique-code theory each discount
--    should have exactly one recorded redemption and the rest in this column.
--
--    Counted with scalar subqueries, not two LEFT JOINs. Joining redemptions
--    and transactions to discounts in one query fans out: a discount with 2
--    redemptions and 5 transactions yields 10 rows, so both counts come back
--    as 10 and the comparison this query exists to make is destroyed.
SELECT d.id,
       d.title,
       (SELECT COUNT(*) FROM redemptions r
         WHERE r.discount_id = d.id)                  AS recorded_now,
       (SELECT COUNT(*) FROM transactions t
         WHERE t.discount_id = d.id
           AND t.type = 'redemption')                 AS redemption_transactions,
       (SELECT COUNT(*) FROM transactions t
         WHERE t.discount_id = d.id
           AND t.type = 'redemption')
         - (SELECT COUNT(*) FROM redemptions r
             WHERE r.discount_id = d.id)              AS apparent_shortfall
FROM discounts d
WHERE EXISTS (SELECT 1 FROM redemptions r WHERE r.discount_id = d.id)
   OR EXISTS (SELECT 1 FROM transactions t
               WHERE t.discount_id = d.id AND t.type = 'redemption')
ORDER BY apparent_shortfall DESC, d.id;

-- 4. THE GAP THIS CANNOT CLOSE.
--    Once the route began failing loudly, the donor saw an error and never
--    reached the savings screen, so no transaction exists either. There is no
--    way to count those directly; this is the best proxy, showing redemption
--    activity per week so a drop to zero is visible. The weeks at the end with
--    no rows are the ones where donors were being turned away.
SELECT date_trunc('week', created_at)::date AS week,
       COUNT(*)                             AS redemption_transactions,
       COUNT(*) FILTER (WHERE COALESCE(savings, 0) > 0) AS with_money
FROM transactions
WHERE type = 'redemption'
GROUP BY 1
ORDER BY 1;
