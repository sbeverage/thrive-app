-- Reconciliation columns on transactions.
--
-- Before this migration transactions rows carried only amount/type, so the
-- payouts report had to sum monthly_donations.last_payment_amount (one row
-- per subscription, most recent invoice only) and grab processing_fee from
-- the same denormalized monthly_donations row. That means:
--   • A subscription that paid twice in the window (renewal) contributed
--     only its most recent invoice to the payout.
--   • A donor who paid in-window then cancelled was excluded entirely
--     because we filtered monthly_donations.status='active'.
--   • Every invoice for the same subscription shared the last_seen fee value,
--     so a fee fluctuation on one invoice bled onto every other invoice's math.
--
-- Adding processing_fee per-transaction (populated on webhook + backfill)
-- lets the payouts endpoint sum transactions in the window and get the exact
-- fee Stripe took on that specific invoice.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS processing_fee numeric(10, 2),
  ADD COLUMN IF NOT EXISTS user_covered_fees boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text;

-- We already upsert transactions on reference_id (invoices) or gift_id
-- (one-time gifts). Enforce those as real unique constraints so the
-- ignoreDuplicates:true fallback in the upsert calls cannot silently
-- double-write when the constraint is missing.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_id_uidx
  ON transactions (reference_id)
  WHERE reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_gift_id_uidx
  ON transactions (gift_id)
  WHERE gift_id IS NOT NULL;

-- Speed up payout window queries — the reporting endpoint scans transactions
-- for (beneficiary_id, type, created_at) tuples every time it renders.
CREATE INDEX IF NOT EXISTS transactions_beneficiary_type_created_idx
  ON transactions (beneficiary_id, type, created_at DESC);

-- Reload PostgREST so the new columns are visible to Edge Functions immediately.
NOTIFY pgrst, 'reload schema';
