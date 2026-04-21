-- Add availability column to discounts table
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS availability TEXT CHECK (availability IN ('in-store', 'online', 'both'));
