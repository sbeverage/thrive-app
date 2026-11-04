/**
 * COPY. The original lives in the admin panel at
 *   ti-admin-panel/ti-admin-panel/src/utils/imageCrop.ts
 * and the donor app's slot styles are the other half of the same decision.
 *
 * Duplicated rather than shared because the panel, this portal and the app are
 * three separate builds with no shared package. If one changes, the others
 * have to change with it, or a charity crops to one shape and donors see
 * another. See CLAUDE.md "Charity images".
 */
/**
 * Charity image roles, their target shapes, and the crop export.
 *
 * Split out of ImageCropUpload so the geometry can be exercised directly in a
 * browser harness (scripts/cropHarness) rather than only by eye through the
 * admin UI. A crop that is subtly wrong produces a plausible-looking image, so
 * "it rendered something" is not evidence that it rendered the right thing.
 */
import type { Area } from 'react-easy-crop';

export type ImageRole = 'logo' | 'cover' | 'highlight' | 'gallery';

type Preset = {
  label: string;
  /** width / height of the slot in the app. */
  aspect: number;
  /** Exported pixel size. Roughly 3x the rendered point size, for retina. */
  outWidth: number;
  outHeight: number;
  /** Draw the crop overlay as a circle (the slot is circular). */
  round: boolean;
  /** Keep alpha. Logos are often a mark on transparency. */
  png: boolean;
  /** Shown under the control so whoever uploads knows what they are framing. */
  help: string;
};

/**
 * One entry per image role, matching what the app actually renders.
 *
 *   logo       110pt circle on the charity profile
 *   cover      full-width 2:1 band across the top of the profile
 *   highlight  120pt square thumbnail on the charity browse list
 *
 * Changing an aspect here without changing the app's layout to match puts the
 * silent centre-crop straight back, so these are paired with the styles in
 * components/BeneficiaryDetailCard.js and app/(tabs)/(main)/beneficiary/index.js.
 */
export const IMAGE_PRESETS: Record<ImageRole, Preset> = {
  logo: {
    label: 'Logo',
    aspect: 1,
    outWidth: 512,
    outHeight: 512,
    round: true,
    png: true,
    help: 'Square. Shown as a circle on the profile, so keep the mark centred and leave a little breathing room at the edges.',
  },
  cover: {
    label: 'Cover',
    aspect: 2,
    outWidth: 1600,
    outHeight: 800,
    round: false,
    png: false,
    help: 'Wide banner across the top of the profile. The bottom edge sits behind the logo and the charity name, so keep faces and text out of the lower left.',
  },
  highlight: {
    label: 'Highlight',
    aspect: 1,
    outWidth: 600,
    outHeight: 600,
    round: false,
    png: false,
    help: 'Square thumbnail on the browse list, where donors see the charity before tapping in. One clear subject reads best this small.',
  },
  gallery: {
    label: 'Photo',
    // The app draws these at 220 x 165 in a horizontal strip, which is 4:3.
    // A real ratio, so these are cropped like the other three rather than
    // uploaded raw: anything not already 4:3 would be centre-cropped on the
    // device with nobody watching. See CLAUDE.md "Charity images".
    aspect: 4 / 3,
    outWidth: 1200,
    outHeight: 900,
    round: false,
    png: false,
    help: 'Shown in the Photos strip on your profile. Landscape works best. Up to five.',
  },
};

/** Load a URL or object URL into an <img> we can draw to a canvas. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    // Needed to re-crop an image already in Supabase Storage: without it the
    // canvas is tainted and toBlob throws a security error. Public buckets
    // send permissive CORS, so this succeeds; if it ever does not, the caller
    // reports it rather than failing silently.
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('That image could not be opened for cropping.')));
    img.src = src;
  });
}

/**
 * Longest edge the cropper will work with.
 *
 * react-easy-crop re-transforms the source image on every pointer move. A
 * modern phone or DSLR photo is 6000px or more on its long edge, and the
 * validator admits files up to 20 MB, so handing one straight to the cropper
 * can pin the main thread hard enough that dragging appears to do nothing at
 * all. The existing upload path already learned this (resizeImageForUpload,
 * used by VendorProfile); the cropper has to do the same thing before the
 * image reaches it, not after.
 *
 * 3000px is chosen for headroom rather than for the preview. The largest crop
 * target is the 1600x800 cover, so even a half-width crop of a 3000px source
 * still has more pixels than the output needs. Only an extreme zoom into a
 * small corner would upscale, which is not a framing anyone wants anyway.
 */
export const CROP_SOURCE_MAX_DIM = 3000;

/**
 * Turn a chosen file into something the cropper can move smoothly, returning
 * an object URL plus what was done to it.
 *
 * Images already within the limit pass through untouched, so nothing is
 * re-encoded needlessly and a PNG logo keeps its transparency.
 */
export async function prepareCropSource(file: File): Promise<{
  url: string;
  original: { w: number; h: number };
  downscaledTo?: { w: number; h: number };
}> {
  const directUrl = URL.createObjectURL(file);
  const img = await loadImage(directUrl);
  const { naturalWidth: w, naturalHeight: h } = img;
  const longest = Math.max(w, h);

  if (longest <= CROP_SOURCE_MAX_DIM) {
    return { url: directUrl, original: { w, h } };
  }

  const scale = CROP_SOURCE_MAX_DIM / longest;
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Cropping a huge image is slow, not broken, so fall back to the original
    // rather than refusing to crop at all.
    return { url: directUrl, original: { w, h } };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, tw, th);

  // PNG keeps alpha, which matters because a logo is often a mark on
  // transparency and the logo preset exports PNG.
  const isPng = file.type === 'image/png' || file.type === 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, isPng ? 'image/png' : 'image/jpeg', isPng ? undefined : 0.92),
  );

  URL.revokeObjectURL(directUrl);
  if (!blob) return { url: URL.createObjectURL(file), original: { w, h } };

  return {
    url: URL.createObjectURL(blob),
    original: { w, h },
    downscaledTo: { w: tw, h: th },
  };
}

/**
 * Draw the chosen rectangle of the source onto a canvas at the target size.
 *
 * `area` arrives from react-easy-crop in natural source pixels, so this is a
 * straight copy of that rectangle. Drawing directly to the output dimensions
 * does the downscale in one step, which is both sharper and cheaper than
 * cropping and then resizing.
 */
export async function exportCrop(
  src: string,
  area: Area,
  preset: Preset,
): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = preset.outWidth;
  canvas.height = preset.outHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not prepare the crop.');

  // A JPEG has no alpha, so anything transparent would render black. Fill
  // white first; harmless for photos, correct for a logo saved as JPEG.
  if (!preset.png) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    Math.round(area.x),
    Math.round(area.y),
    Math.round(area.width),
    Math.round(area.height),
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('That crop could not be saved. Give it another try?'));
      },
      preset.png ? 'image/png' : 'image/jpeg',
      preset.png ? undefined : 0.9,
    );
  });
}

