-- Scope reference_id uniqueness to its namespace.
--
-- 20260804000000 created:
--
--   CREATE UNIQUE INDEX transactions_reference_id_uidx
--     ON transactions (reference_id) WHERE reference_id IS NOT NULL;
--
-- imposing GLOBAL uniqueness on a polymorphic column. reference_id is only
-- meaningful alongside reference_type, and different namespaces number
-- independently:
--
--   • one-time gifts   reference_type 'gift',     reference_id = one_time_gifts.id
--     (routes/webhooks.ts, the invoice.payment_succeeded gift branch)
--   • client-posted     reference_type/reference_id supplied by the caller
--     (routes/transactions.ts, POST /transactions)
--
-- So gift #5 and a client transaction with reference_id 5 collide even though
-- they refer to entirely different things. The index also blocked the monthly
-- donation backfill on 2026-09-01 until those rows were switched to writing
-- null.
--
-- Composite rather than partial-on-type: uniqueness is still enforced within
-- each namespace — which is what idempotency needs — without pretending the
-- numbering is shared. Monthly donations keep reference_id null and are keyed
-- by transactions_monthly_stripe_invoice_unique on stripe_invoice_id
-- (20260901000000).
--
-- The new index is created BEFORE the old one is dropped, on purpose: if
-- duplicate (reference_type, reference_id) pairs already exist the CREATE fails,
-- the script stops, and the existing protection is still in place. Nothing is
-- lost — fix the duplicates and run it again.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_scope_uidx
  ON transactions (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

DROP INDEX IF EXISTS transactions_reference_id_uidx;

NOTIFY pgrst, 'reload schema';
