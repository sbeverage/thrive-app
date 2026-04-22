-- Prevent duplicate transactions from Stripe webhook retries.
-- gift_id is unique per one-time gift payment.
-- reference_id is set to the Stripe invoice ID for monthly donations, making each monthly charge unique.

ALTER TABLE transactions
  ADD CONSTRAINT transactions_gift_id_unique UNIQUE (gift_id);

-- Partial unique index on reference_id for monthly donation invoices only
CREATE UNIQUE INDEX transactions_monthly_invoice_unique
  ON transactions (reference_id)
  WHERE type = 'monthly_donation';
