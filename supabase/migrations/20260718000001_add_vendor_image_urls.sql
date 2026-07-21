-- Adds the `image_urls` array to vendors so vendors (and admins on their
-- behalf) can showcase up to 5 photos on the vendor profile beyond the
-- single logo. Rendered on the donor app as a horizontal scroll strip in
-- 4:3 tiles between the About Us and Contact Information sections.
--
-- Storage lives in a public `vendor-images` bucket (bucket setup is a
-- separate one-shot SQL — see /supabase/migrations/README or run:
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('vendor-images', 'vendor-images', true)
--   ON CONFLICT (id) DO NOTHING;
-- ).
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Cap the array at 5 entries. Enforced here so a client bug can't blow
-- the profile up with 200 images; the write paths in the Edge Function
-- also validate before UPDATE, but a DB-side check keeps us honest.
ALTER TABLE vendors
  DROP CONSTRAINT IF EXISTS vendors_image_urls_max_5;
ALTER TABLE vendors
  ADD CONSTRAINT vendors_image_urls_max_5
  CHECK (image_urls IS NULL OR array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 5);
