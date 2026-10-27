-- A third charity image, for the browse list.
--
-- Charities had exactly two images: logo_url (the circle) and image_url (the
-- wide banner on the profile). The browse list rendered image_url too, in a
-- 120pt-wide, roughly square slot with resizeMode "cover". A 2:1 banner
-- squeezed into a square box loses its left and right thirds, so any subject
-- that was not dead centre got cropped out of the list card while looking
-- correct on the profile. One image cannot serve both shapes.
--
-- highlight_url is that square crop. Nothing reads it until it is set:
-- every consumer falls back highlight_url -> image_url -> logo_url, so the
-- 50-odd charities already in the table keep rendering exactly as they do
-- today until someone re-crops them.
--
-- Per-role upload targets are written up in CLAUDE.md under "Charity images".

ALTER TABLE charities
  ADD COLUMN IF NOT EXISTS highlight_url TEXT;

COMMENT ON COLUMN charities.highlight_url IS
  'Square (1:1) crop shown on the charity browse list. Falls back to image_url then logo_url when null. Upload target 600x600.';

COMMENT ON COLUMN charities.image_url IS
  'Wide (2:1) cover image across the top of the charity profile. Upload target 1600x800.';

COMMENT ON COLUMN charities.logo_url IS
  'Square (1:1) logo, rendered in a circle. Upload target 512x512.';

-- Make the new column visible to the Edge Functions immediately.
NOTIFY pgrst, 'reload schema';
