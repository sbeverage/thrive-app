-- Read only. Nothing is written.
--
-- Why did the panel refuse to delete Jennifer Small over an $18.72 donation
-- that has no payment behind it?
--
-- The delete guard used to count ROWS in four tables: transactions,
-- monthly_donations, one_time_gifts, donations. If the total was above zero it
-- refused, and it never asked whether any money actually moved.
--
-- monthly_donations is the subscription row. It is created when a donor sets
-- up giving, BEFORE the first charge succeeds, and it carries `amount`, the
-- pledged monthly figure. The panel showed that figure as the donor's
-- donation. So a donor whose card never completed could show an amount, have
-- no payment history whatsoever, and still be undeletable.
--
-- Both halves are now fixed and deployed: the guard classifies charged versus
-- pledged (and checks Stripe before trusting an absent local record), and the
-- field is called monthly_pledge rather than total_donations.
--
-- This file is what is left: confirming the diagnosis on her row, and finding
-- out whether she is alone. Query 6 is the one that matters now.
--
-- A previous version of this file guessed `users.status`, which does not
-- exist. Query 0 removes the guessing.

-- 0. The actual column names, so nothing below is a guess. If a query further
--    down fails on a missing column, the answer is in this result.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'monthly_donations', 'transactions',
                     'one_time_gifts', 'donations')
ORDER BY table_name, ordinal_position;

-- 1. Find her. Searched by name across every role, because an account can
--    carry role 'vendorAdmin' or similar and still be the donor you mean;
--    filtering on role='donor' has hidden accounts here before.
SELECT id, first_name, last_name, email, role, account_status, created_at,
       stripe_customer_id
FROM users
WHERE lower(first_name || ' ' || last_name) LIKE '%jennifer%small%'
   OR lower(email) LIKE '%jennifer%'
ORDER BY created_at;

-- 2. Her subscription rows. `amount` here is the PLEDGE, not a payment.
--    last_payment_at is the field that says whether money ever arrived, and
--    it is the field the new guard classifies on.
SELECT md.id, md.user_id, md.amount, md.status,
       md.stripe_subscription_id,
       md.last_payment_at, md.last_payment_amount,
       md.beneficiary_id, md.created_at,
       CASE
         WHEN md.last_payment_at IS NOT NULL
           OR COALESCE(md.last_payment_amount, 0) > 0 THEN 'charged, still blocks'
         WHEN md.stripe_subscription_id IS NOT NULL THEN 'pledge, guard asks Stripe first'
         ELSE 'pledge, never reached Stripe, deletes'
       END AS guard_verdict
FROM monthly_donations md
JOIN users u ON u.id = md.user_id
WHERE lower(u.first_name || ' ' || u.last_name) LIKE '%jennifer%small%'
ORDER BY md.created_at;

-- 3. Actual recorded money. If this is empty, nothing was ever collected
--    and recorded, whatever the panel showed.
SELECT t.id, t.user_id, t.type, t.amount, t.savings, t.spending,
       t.stripe_invoice_id, t.processing_fee, t.created_at
FROM transactions t
JOIN users u ON u.id = t.user_id
WHERE lower(u.first_name || ' ' || u.last_name) LIKE '%jennifer%small%'
ORDER BY t.created_at;

-- 4. THE DIAGNOSIS. The four counts the old guard used, beside the one number
--    it never looked at: how much money was actually recorded. A non-zero
--    blocking count with zero payments is the guard refusing over a pledge
--    nobody ever paid.
SELECT
  u.id,
  u.first_name || ' ' || u.last_name                        AS donor,
  u.email,
  (SELECT COUNT(*) FROM transactions      WHERE user_id  = u.id) AS transactions,
  (SELECT COUNT(*) FROM monthly_donations WHERE user_id  = u.id) AS monthly_donations,
  (SELECT COUNT(*) FROM one_time_gifts    WHERE user_id  = u.id) AS one_time_gifts,
  (SELECT COUNT(*) FROM donations         WHERE donor_id = u.id) AS donations,
  -- What the OLD guard blocked on:
  (SELECT COUNT(*) FROM transactions      WHERE user_id  = u.id)
  + (SELECT COUNT(*) FROM monthly_donations WHERE user_id = u.id)
  + (SELECT COUNT(*) FROM one_time_gifts  WHERE user_id  = u.id)
  + (SELECT COUNT(*) FROM donations       WHERE donor_id = u.id) AS old_guard_blocked_on,
  -- What the NEW guard blocks on: charged pledges only, plus the other three.
  (SELECT COUNT(*) FROM transactions      WHERE user_id  = u.id)
  + (SELECT COUNT(*) FROM monthly_donations
     WHERE user_id = u.id
       AND (last_payment_at IS NOT NULL OR COALESCE(last_payment_amount, 0) > 0))
  + (SELECT COUNT(*) FROM one_time_gifts  WHERE user_id  = u.id)
  + (SELECT COUNT(*) FROM donations       WHERE donor_id = u.id) AS new_guard_blocks_on,
  COALESCE((SELECT SUM(amount) FROM transactions
            WHERE user_id = u.id AND type = 'monthly_donation'), 0) AS money_recorded,
  (SELECT MAX(last_payment_at) FROM monthly_donations WHERE user_id = u.id) AS last_payment_at
FROM users u
WHERE lower(u.first_name || ' ' || u.last_name) LIKE '%jennifer%small%';

-- 4b. WHERE THE $18.72 ON SCREEN CAME FROM.
--     The donor list built its figure as:
--         total_monthly_donation ?? preferences.monthlyDonation
--                                 ?? preferences.donationAmount ?? 0
--     and returned it under the key `total_donations`. That name was wrong: it
--     is the monthly PLEDGE, not a lifetime total of money given, and the last
--     fallback is written from the signup form before any payment is
--     attempted. So the amount on screen could exist with no subscription and
--     no charge behind it at all. It is now returned as `monthly_pledge` and
--     the column reads "Monthly pledge".
--     Whichever of these columns is non-null is the one that was being read.
SELECT id,
       first_name || ' ' || last_name          AS donor,
       total_monthly_donation,
       preferences ->> 'monthlyDonation'       AS prefs_monthly_donation,
       preferences ->> 'donationAmount'        AS prefs_donation_amount,
       total_one_time_gifts_given,
       stripe_customer_id,
       account_status,
       created_at
FROM users
WHERE lower(first_name || ' ' || last_name) LIKE '%jennifer%small%';

-- 5. Is $18.72 unusual, or the normal pledge here? Context for whether this
--    is one broken signup or a pattern worth fixing.
SELECT amount, status, COUNT(*) AS donors
FROM monthly_donations
GROUP BY amount, status
ORDER BY donors DESC, amount;

-- 6. THE QUESTION THAT IS STILL OPEN. Everyone in the same position: a
--    subscription row with no money recorded against it.
--
--    If this returns one person, Jennifer was a one-off and the guard fix is
--    the whole story. If it returns several, the signup flow is leaving a
--    pledge row behind whenever a card fails, and the real fix is upstream in
--    signup, not in the delete guard.
--
--    `reached_stripe` splits them. A row with a stripe_subscription_id got as
--    far as creating a subscription and then stopped, which the new guard will
--    verify against Stripe before deleting. A row without one never reached
--    Stripe at all, which points at the signup flow writing the pledge before
--    it had any business doing so.
SELECT u.id,
       u.first_name || ' ' || u.last_name AS donor,
       u.email,
       u.account_status,
       md.amount,
       md.status,
       md.stripe_subscription_id IS NOT NULL AS reached_stripe,
       md.created_at,
       EXTRACT(DAY FROM now() - md.created_at)::int AS days_old
FROM monthly_donations md
JOIN users u ON u.id = md.user_id
WHERE md.last_payment_at IS NULL
  AND COALESCE(md.last_payment_amount, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.user_id = md.user_id AND t.type = 'monthly_donation'
  )
ORDER BY md.created_at DESC;

-- 6b. The same thing counted, so the shape is obvious at a glance.
SELECT COUNT(*)                                                   AS stuck_pledges,
       COUNT(DISTINCT md.user_id)                                 AS donors_affected,
       COUNT(*) FILTER (WHERE md.stripe_subscription_id IS NOT NULL) AS reached_stripe,
       COUNT(*) FILTER (WHERE md.stripe_subscription_id IS NULL)     AS never_reached_stripe,
       MIN(md.created_at)                                         AS earliest,
       MAX(md.created_at)                                         AS latest
FROM monthly_donations md
WHERE md.last_payment_at IS NULL
  AND COALESCE(md.last_payment_amount, 0) = 0
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.user_id = md.user_id AND t.type = 'monthly_donation'
  );
