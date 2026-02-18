/**
 * Asset Constants - Centralized asset URLs
 * After uploading to Supabase, update these URLs to point to Supabase Storage
 * 
 * To get Supabase URLs:
 * 1. Run: npm run upload-assets
 * 2. Check assets-supabase-map.json for the URLs
 * 3. Update the URLs below
 */

// Supabase Storage Base URL
const SUPABASE_STORAGE_BASE = 'https://mdqgndyhzlnwojtubouh.supabase.co/storage/v1/object/public/app-assets';

// Video Assets (Critical - these need to work when computer is closed)
export const VIDEO_ASSETS = {
  GIVE_LOOP: `${SUPABASE_STORAGE_BASE}/assets/videos/give-loop.mp4`,
  SHOP_LOOP: `${SUPABASE_STORAGE_BASE}/assets/videos/shop-loop.mp4`,
  SAVE_LOOP: `${SUPABASE_STORAGE_BASE}/assets/videos/save-loop.mp4`,
};

// Image Assets (Most frequently used)
export const IMAGE_ASSETS = {
  // Logos
  THRIVE_LOGO_WHITE: `${SUPABASE_STORAGE_BASE}/assets/logos/thrive-logo-white.png`,
  PIGGY_WITH_FLOWERS: `${SUPABASE_STORAGE_BASE}/assets/images/piggy-with-flowers.png`,
  
  // Icons
  ARROW_LEFT: `${SUPABASE_STORAGE_BASE}/assets/icons/arrow-left.png`,
  SEARCH_ICON: `${SUPABASE_STORAGE_BASE}/assets/icons/search-icon.png`,
  HEART: `${SUPABASE_STORAGE_BASE}/assets/icons/heart.png`,
  
  // Default beneficiary images
  CHILD_CANCER: `${SUPABASE_STORAGE_BASE}/assets/images/child-cancer.jpg`,
  HUMANE_SOCIETY: `${SUPABASE_STORAGE_BASE}/assets/images/humane-society.jpg`,
  CHARITY_WATER: `${SUPABASE_STORAGE_BASE}/assets/images/charity-water.jpg`,
};

/**
 * Get asset source - tries Supabase URL first, falls back to local require
 * This allows gradual migration
 */
export function getAsset(assetType, assetKey, localRequire) {
  // After uploading, assets will be available at Supabase URLs
  // For now, we'll use local requires as fallback
  // After upload, you can switch to use Supabase URLs directly
  
  // TODO: After running upload-assets, uncomment these to use Supabase URLs:
  /*
  if (assetType === 'video') {
    return VIDEO_ASSETS[assetKey] ? { uri: VIDEO_ASSETS[assetKey] } : localRequire;
  }
  if (assetType === 'image') {
    return IMAGE_ASSETS[assetKey] ? { uri: IMAGE_ASSETS[assetKey] } : localRequire;
  }
  */
  
  // For now, use local requires (will work after upload when we switch)
  return localRequire;
}

