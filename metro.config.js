// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Redirect stripe-react-native to a no-op stub on web builds
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return {
      filePath: path.resolve(__dirname, 'app/lib/stripe-web-mock.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

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

