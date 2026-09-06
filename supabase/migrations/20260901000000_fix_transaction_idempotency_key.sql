-- Move monthly-donation idempotency from reference_id to stripe_invoice_id.
--
-- 20260422000000_add_transaction_idempotency.sql created:
--
--   CREATE UNIQUE INDEX transactions_monthly_invoice_unique
--     ON transactions (reference_id) WHERE type = 'monthly_donation';
--
-- with the comment "reference_id is set to the Stripe invoice ID for monthly
-- donations, making each monthly charge unique." That premise was never true:
-- reference_id is an INTEGER column, so writing a Stripe invoice id like
-- "in_1Tbm…" into it fails with "invalid input syntax for type integer". The
-- webhook attempted exactly that on every invoice.payment_succeeded event.
--
-- Consequence, found 2026-09-01: 16 paid invoices totalling $299.43 — from 11
-- real donors, most recent 2026-08-31 — were collected by Stripe and recorded
-- nowhere. Three independent faults stacked in the same code path:
--   1. the handler read `invoice.subscription`, removed by Stripe in
--      2025-04-30 while the webhook endpoint is pinned to 2025-10-29.clover,
--      so the whole block was skipped and the event acknowledged with a 200;
--   2. the insert used ON CONFLICT (reference_id), which has no unique
--      constraint — only this partial index, which ON CONFLICT cannot target;
--   3. the invoice id could not be written to reference_id at all (type).
--
-- Faults 1-3 are fixed in the Edge Function. This migration fixes the schema
-- so the index actually enforces one transaction per Stripe invoice, which is
-- what a monthly subscription needs — the previous index allowed only ONE
-- monthly_donation row per subscription for all time, so month two onward
-- could never be recorded even once the code was correct.
--
-- Safe to re-run. Apply in the Supabase dashboard SQL editor — do NOT run
-- `supabase db push` on this project.

-- Uniqueness now keyed on the Stripe invoice, which is the real idempotency
-- key for a recurring charge. NULL is excluded so rows from other code paths
-- that never set it are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_monthly_stripe_invoice_unique
  ON transactions (stripe_invoice_id)
  WHERE type = 'monthly_donation' AND stripe_invoice_id IS NOT NULL;

-- Drop the index built on the impossible premise. Done after creating the
-- replacement so there is no window without protection against webhook
-- retries duplicating a charge.
DROP INDEX IF EXISTS transactions_monthly_invoice_unique;

-- reference_id keeps holding the local monthly_donations row id, which is what
-- an integer column can actually store, and is useful for joining a charge
-- back to its subscription.

NOTIFY pgrst, 'reload schema';
