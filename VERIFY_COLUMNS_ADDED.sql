-- Verify that the columns were added successfully
-- Run this in Supabase SQL Editor to check

SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users' 
  AND column_name IN ('email_verified_at', 'latitude', 'longitude')
ORDER BY column_name;

-- Expected result: Should show 3 rows:
-- 1. email_verified_at | timestamp with time zone | YES | null
-- 2. latitude          | numeric                  | YES | null
-- 3. longitude         | numeric                  | YES | null

