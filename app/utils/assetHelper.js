/**
 * Asset Helper - Uses Supabase URLs when available, falls back to local assets
 * This allows assets to work even when your computer is closed
 */

// Try to load the asset mapping (created by upload script)
let assetMap = {};
try {
  assetMap = require('../../assets-supabase-map.json');
} catch (error) {
  // Mapping file doesn't exist yet - will use local assets only
  console.log('ℹ️  No Supabase asset mapping found, using local assets only');
}

/**
 * Get asset source - uses Supabase URL if available
 * Note: Metro bundler doesn't support dynamic require(), so we only use Supabase URLs
 * @param {string} localPath - Path relative to project root (e.g., 'assets/icons/arrow-left.png')
 * @returns {object|null} - Image source object ({ uri: '...' }) or null if not found
 */
export function getAssetSource(localPath) {
  // Normalize path (handle different path separators)
  const normalizedPath = localPath.replace(/\\/g, '/');
  
  // Check if we have a Supabase URL for this asset
  if (assetMap[normalizedPath]) {
    return { uri: assetMap[normalizedPath] };
  }
  
  // Metro bundler doesn't support dynamic require() paths
  // If asset isn't in Supabase, return null
  // You can add static require() mappings below for critical local-only assets
  console.warn(`⚠️ Asset not found in Supabase: ${localPath}. Add it to Supabase or use static require.`);
  return null;
}

/**
 * Get video source - uses Supabase URL if available, otherwise local require
 * @param {string} localPath - Path relative to project root (e.g., 'assets/videos/give-loop.mp4')
 * @returns {object} - Video source object ({ uri: '...' } or require(...))
 */
export function getVideoSource(localPath) {
  return getAssetSource(localPath);
}

/**
 * Check if asset exists in Supabase
 * @param {string} localPath - Path relative to project root
 * @returns {boolean} - True if asset is in Supabase
 */
export function hasSupabaseAsset(localPath) {
  const normalizedPath = localPath.replace(/\\/g, '/');
  return !!assetMap[normalizedPath];
}

