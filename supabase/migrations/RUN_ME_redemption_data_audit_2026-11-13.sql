-- Read only. Nothing is written. Safe to run any time.
--
-- Before building a redemptions view, find out what is actually in the two
-- tables that hold redemption data, because they are not the same table and
-- they are not linked to each other.
--
--   redemptions  is written by POST /discounts/:id/redeem, every time, the
--                moment the code is revealed.
--   transactions is written by the savings form on DiscountApproved, which
--                the donor can skip, and which fires only if they fill it in.
--
-- Everything about "how much did they pay versus save" lives in the second
-- one. Everything about "did a redemption happen at all" lives in the first.
-- There is no foreign key between them.

-- 1. What columns actually exist. I inferred some of these from the insert
--    payloads; this is the authoritative answer.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('redemptions', 'transactions')
ORDER BY table_name, ordinal_position;

-- 2. How much data is there, and how far back does it go.
SELECT
  COUNT(*)                                              AS redemptions_total,
  COUNT(DISTINCT user_id)                               AS distinct_donors,
  COUNT(DISTINCT vendor_id)                             AS distinct_vendors,
  MIN(redeemed_at)::date                                AS first_redemption,
  MAX(redeemed_at)::date                                AS latest_redemption,
  COUNT(*) FILTER (WHERE redeemed_at > now() - interval '30 days') AS last_30_days
FROM redemptions;

-- 3. THE IMPORTANT ONE. How often is the money actually captured?
--    total_bill and total_savings are optional on the redemption row, and the
--    app currently sends them to `transactions` instead, so expect these to be
--    mostly null. If they are, "paid vs savings" cannot be read off a
--    redemption today, and that is the thing to fix first.
SELECT
  COUNT(*)                                        AS redemptions,
  COUNT(total_bill)                               AS with_bill,
  COUNT(total_savings)                            AS with_savings,
  ROUND(100.0 * COUNT(total_savings) / NULLIF(COUNT(*), 0), 1) AS pct_with_savings
FROM redemptions;

-- 4. The same question from the transactions side: how many redemption
--    transactions exist, and do they carry the amounts?
SELECT
  COUNT(*)                                        AS redemption_transactions,
  COUNT(DISTINCT user_id)                         AS distinct_donors,
  MIN(created_at)::date                           AS first_seen,
  MAX(created_at)::date                           AS latest
FROM transactions
WHERE type = 'redemption';

-- 5. The join problem, measured. For each redemption, is there a transaction
--    from the same donor for the same discount within an hour either side?
--    This is the ONLY way to pair them today, and it is approximate: it will
--    mispair a donor who redeems the same discount twice in one hour.
--    The gap between these two numbers is the savings-form completion rate,
--    and it is the single most useful number on this page.
SELECT
  COUNT(*)                                                   AS redemptions,
  COUNT(t.id)                                                AS paired_with_a_transaction,
  ROUND(100.0 * COUNT(t.id) / NULLIF(COUNT(*), 0), 1)        AS pct_told_us_what_they_saved
FROM redemptions r
LEFT JOIN LATERAL (
  SELECT tx.id
  FROM transactions tx
  WHERE tx.user_id = r.user_id
    AND tx.type = 'redemption'
    AND tx.discount_id = r.discount_id
    AND tx.created_at BETWEEN r.redeemed_at - interval '1 hour'
                          AND r.redeemed_at + interval '1 hour'
  LIMIT 1
) t ON TRUE;

-- 6. Is redemption_code unique per redemption, or is it just the discount's
--    own code repeated? The insert uses `discount.discount_code`, so I expect
--    heavy duplication, which rules out joining on the code. Confirming,
--    because if it IS unique the join above gets much easier.
SELECT
  COUNT(*)                        AS rows,
  COUNT(DISTINCT redemption_code) AS distinct_codes
FROM redemptions;
