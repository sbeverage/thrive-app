-- Photo gallery + video for charity profiles, mirroring what vendors already
-- have (see 20260718000001_add_vendor_image_urls.sql).
--
-- Context: the beneficiary profile previously carried four narrative sections
-- (Why This Matters, Our Impact, Success Story, Your Impact). Most charities
-- had none of that content — 26 of 51 had no livesImpacted, 34 had no
-- directToProgramsPercentage — so profiles read as half-built. Those sections
-- were removed in favour of media, which almost every charity can supply.
--
-- Storage lives in a public `charity-images` bucket. Bucket creation is
-- included below so this is a single paste.

ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Cap at 5. Enforced here as well as in the Edge Function write paths, so a
-- client bug can't blow a profile up with 200 images.
ALTER TABLE charities
  DROP CONSTRAINT IF EXISTS charities_image_urls_max_5;
ALTER TABLE charities
  ADD CONSTRAINT charities_image_urls_max_5
  CHECK (image_urls IS NULL OR array_length(image_urls, 1) IS NULL OR array_length(image_urls, 1) <= 5);

-- One video per charity. Stores a URL, not a file: either an uploaded object
-- in the charity-images bucket (.mp4/.mov — played inline via expo-av) or a
-- YouTube/Vimeo link (opened externally, since expo-av cannot play those).
-- Keeping it a URL avoids transcoding and storage-size handling entirely.
ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Public bucket for charity photos and video. Idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('charity-images', 'charity-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone may read (the donor app loads these without auth); only
-- authenticated callers may write. The Edge Function uses the service role,
-- which bypasses RLS, so these policies govern direct client access only.
DROP POLICY IF EXISTS "charity_images_public_read" ON storage.objects;
CREATE POLICY "charity_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'charity-images');

DROP POLICY IF EXISTS "charity_images_auth_insert" ON storage.objects;
CREATE POLICY "charity_images_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'charity-images');

DROP POLICY IF EXISTS "charity_images_auth_delete" ON storage.objects;
CREATE POLICY "charity_images_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'charity-images');

-- Make the new columns visible to the Edge Functions immediately.
NOTIFY pgrst, 'reload schema';
