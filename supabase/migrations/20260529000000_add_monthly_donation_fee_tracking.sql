-- Track Stripe processing fees and whether the donor covered them on each
-- monthly donation, mirroring the columns already used by one_time_gifts.
-- This lets admin reporting show the real fees Stripe collected per invoice
-- (populated from balance_transaction.fee via the backfill endpoint and the
-- sync-status / webhook handlers going forward).
ALTER TABLE monthly_donations
  ADD COLUMN IF NOT EXISTS processing_fee numeric(10, 2),
  ADD COLUMN IF NOT EXISTS user_covered_fees boolean DEFAULT false;
