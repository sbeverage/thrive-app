// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Redirect native-only modules to no-op stubs on web builds
const WEB_NATIVE_STUBS = {
  '@stripe/stripe-react-native': path.resolve(__dirname, 'app/lib/stripe-web-mock.js'),
  'react-native-maps': path.resolve(__dirname, 'app/lib/maps-web-mock.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_NATIVE_STUBS[moduleName]) {
    return { filePath: WEB_NATIVE_STUBS[moduleName], type: 'sourceFile' };
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

