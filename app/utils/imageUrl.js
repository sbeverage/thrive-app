// Request images at the size they are displayed, not the size they were
// uploaded.
//
// Vendor and charity art is served straight from Supabase Storage at whatever
// dimensions the uploader happened to have. Measured 2026-09-04: the vendor
// images referenced on a cold launch totalled 3.7 MB across 48 URLs, with
// single gallery photos at ~400 KB being drawn into a card a few hundred points
// wide. That is what makes the app feel glitchy on open — it is decoding and
// downloading several megabytes before anything settles.
//
// Supabase Storage can resize on the fly: swapping /object/public/ for
// /render/image/public/ and passing a width returned the same images ~73%
// smaller in testing (399 KB -> 108 KB at width=600).
//
// Deliberately a URL rewrite rather than re-uploading anything, so it applies
// to every image already in the bucket and to everything uploaded later.

/** Widths that cover the places images actually appear, in points-times-3. */
export const IMAGE_WIDTH = {
  /** Small circular avatars and list thumbnails. */
  logo: 240,
  /** Discount and vendor cards in a list. */
  card: 600,
  /** Full-width hero art on a detail screen. */
  hero: 1200,
};

/**
 * Rewrite a Supabase Storage URL to render at `width`.
 *
 * Anything that is not a public Storage object URL is returned untouched —
 * external logos, data URIs and bundled `require()` module ids must pass
 * through unharmed.
 *
 * @param {string|null|undefined} url
 * @param {number} width target width in pixels
 * @param {number} [quality] JPEG quality, 1-100
 * @returns {string|null|undefined} the original input when it cannot be rewritten
 */
export function sizedImageUrl(url, width = IMAGE_WIDTH.card, quality = 72) {
  if (typeof url !== 'string' || url.length === 0) return url;
  if (!url.includes('/storage/v1/object/public/')) return url;
  // Don't stack transforms if a caller already asked for one.
  if (url.includes('/render/image/public/')) return url;

  const rendered = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );
  const separator = rendered.includes('?') ? '&' : '?';
  return `${rendered}${separator}width=${Math.round(width)}&quality=${quality}`;
}

/**
 * Same rewrite, for an `{ uri }` image source.
 *
 * Returns the source unchanged when there is no uri to rewrite, so it is safe
 * to wrap a resolver whose result may be a bundled module id.
 */
export function sizedImageSource(source, width = IMAGE_WIDTH.card, quality = 72) {
  if (!source || typeof source !== 'object' || typeof source.uri !== 'string') {
    return source;
  }
  return { ...source, uri: sizedImageUrl(source.uri, width, quality) };
}
