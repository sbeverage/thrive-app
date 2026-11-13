-- Read only. Nothing is written.
--
-- Why does the panel refuse to delete Jennifer Small over an $18.72 donation
-- that has no payment behind it?
--
-- The delete guard (DELETE /admin/donors/:id) counts rows in four tables:
-- transactions, monthly_donations, one_time_gifts, donations. If the total is
-- above zero it refuses. It counts ROWS, and never asks whether any money
-- actually moved.
--
-- monthly_donations is the subscription row. It is created when a donor sets
-- up giving, BEFORE the first charge succeeds, and it carries `amount`, which
-- is the pledged monthly figure. The panel shows that figure as the donor's
-- donation. So a donor whose card never completed can show an amount, have no
-- payment history whatsoever, and still be undeletable.
--
-- Query 4 is the one that answers it: if monthly_donations has a row and
-- transactions has none, that is exactly what happened.

-- 1. Find her. Searched by name across every role, because an account can
--    carry role 'vendorAdmin' or similar and still be the donor you mean;
--    filtering on role='donor' has hidden accounts here before.
SELECT id, first_name, last_name, email, role, status, created_at,
       stripe_customer_id
FROM users
WHERE lower(first_name || ' ' || last_name) LIKE '%jennifer%small%'
   OR lower(email) LIKE '%jennifer%'
ORDER BY created_at;

-- 2. Her subscription rows. `amount` here is the PLEDGE, not a payment.
--    last_payment_at is the field that says whether money ever arrived.
SELECT md.id, md.user_id, md.amount, md.status,
       md.stripe_subscription_id,
       md.last_payment_at, md.last_payment_amount,
       md.beneficiary_id, md.created_at
FROM monthly_donations md
JOIN users u ON u.id = md.user_id
WHERE lower(u.first_name || ' ' || u.last_name) LIKE '%jennifer%small%'
ORDER BY md.created_at;

-- 3. Actual recorded money. If this is empty, nothing was ever collected
--    and recorded, whatever the panel shows.
SELECT t.id, t.user_id, t.type, t.amount, t.savings, t.spending,
       t.stripe_invoice_id, t.processing_fee, t.created_at
FROM transactions t
JOIN users u ON u.id = t.user_id
WHERE lower(u.first_name || ' ' || u.last_name) LIKE '%jennifer%small%'
ORDER BY t.created_at;

-- 4. THE ANSWER. Exactly the four counts the delete guard uses, beside the
--    one number it does not look at: how much money was actually recorded.
--    A non-zero blocking count with zero payments means the guard is refusing
--    over a pledge nobody ever paid.
SELECT
  u.id,
  u.first_name || ' ' || u.last_name                        AS donor,
  u.email,
  (SELECT COUNT(*) FROM transactions      WHERE user_id  = u.id) AS transactions,
  (SELECT COUNT(*) FROM monthly_donations WHERE user_id  = u.id) AS monthly_donations,
  (SELECT COUNT(*) FROM one_time_gifts    WHERE user_id  = u.id) AS one_time_gifts,
  (SELECT COUNT(*) FROM donations         WHERE donor_id = u.id) AS donations,
  (SELECT COUNT(*) FROM transactions      WHERE user_id  = u.id)
  + (SELECT COUNT(*) FROM monthly_donations WHERE user_id = u.id)
  + (SELECT COUNT(*) FROM one_time_gifts  WHERE user_id  = u.id)
  + (SELECT COUNT(*) FROM donations       WHERE donor_id = u.id) AS guard_blocks_on,
  -- What the guard never checks:
  COALESCE((SELECT SUM(amount) FROM transactions
            WHERE user_id = u.id AND type = 'monthly_donation'), 0) AS money_recorded,
  (SELECT MAX(last_payment_at) FROM monthly_donations WHERE user_id = u.id) AS last_payment_at
FROM users u
WHERE lower(u.first_name || ' ' || u.last_name) LIKE '%jennifer%small%';

-- 4b. WHERE THE $18.72 ON SCREEN ACTUALLY COMES FROM.
--     The donor list builds its "donation" figure as:
--         total_monthly_donation ?? preferences.monthlyDonation
--                                 ?? preferences.donationAmount ?? 0
--     and returns it under the key `total_donations`. That name is wrong: it
--     is the monthly PLEDGE, not a lifetime total of money given, and the last
--     fallback is a value written from the signup form before any payment is
--     attempted. So the amount on screen can exist with no subscription and no
--     charge behind it at all.
--     Whichever of these columns is non-null is the one you are reading.
SELECT id,
       first_name || ' ' || last_name          AS donor,
       total_monthly_donation,
       preferences ->> 'monthlyDonation'       AS prefs_monthly_donation,
       preferences ->> 'donationAmount'        AS prefs_donation_amount,
       total_one_time_gifts_given,
       stripe_customer_id,
       status,
       created_at
FROM users
WHERE lower(first_name || ' ' || last_name) LIKE '%jennifer%small%';

-- 5. Is $18.72 unusual, or the normal pledge here? Context for whether this
--    is one broken signup or a pattern worth fixing.
SELECT amount, status, COUNT(*) AS donors
FROM monthly_donations
GROUP BY amount, status
ORDER BY donors DESC, amount;

-- 6. Everyone in the same position: a subscription row, no money recorded.
--    If this returns several people, the signup flow is leaving pledge rows
--    behind whenever a card fails, and the delete guard will refuse for all
--    of them.
SELECT u.id, u.first_name || ' ' || u.last_name AS donor, u.email,
       md.amount, md.status, md.stripe_subscription_id, md.created_at
FROM monthly_donations md
JOIN users u ON u.id = md.user_id
WHERE md.last_payment_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.user_id = md.user_id AND t.type = 'monthly_donation'
  )
ORDER BY md.created_at DESC;
