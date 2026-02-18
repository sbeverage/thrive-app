// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure all asset extensions are properly resolved
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  // Add any additional asset extensions if needed
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'mp4',
  'mp3',
  'ttf',
  'otf',
  'woff',
  'woff2',
];

// Explicitly watch asset folders to ensure they're bundled
config.watchFolders = [
  __dirname,
  __dirname + '/assets',
];

// Ensure assets are included in the bundle
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'jsx',
  'js',
  'ts',
  'tsx',
  'json',
];

module.exports = config;

