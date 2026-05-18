/**
 * react-native-worklets resolves several @babel/* packages from its own
 * node_modules tree. npm hoists them to the repo root, which breaks Metro
 * unless we symlink them back (or install nested). Run after npm install.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const workletsBabelDir = path.join(
  root,
  'node_modules/react-native-worklets/node_modules/@babel'
);
const rootBabelDir = path.join(root, 'node_modules/@babel');

const babelPackages = [
  'plugin-transform-arrow-functions',
  'plugin-transform-class-properties',
  'plugin-transform-classes',
  'plugin-transform-nullish-coalescing-operator',
  'plugin-transform-optional-chaining',
  'plugin-transform-shorthand-properties',
  'plugin-transform-template-literals',
  'plugin-transform-unicode-regex',
  'preset-typescript',
];

if (!fs.existsSync(path.join(root, 'node_modules/react-native-worklets'))) {
  process.exit(0);
}

fs.mkdirSync(workletsBabelDir, { recursive: true });

for (const pkg of babelPackages) {
  const src = path.join(rootBabelDir, pkg);
  const dest = path.join(workletsBabelDir, pkg);

  if (!fs.existsSync(src)) {
    console.warn(
      `[link-worklets-babel-deps] Missing @babel/${pkg} — run npm install`
    );
    continue;
  }

  if (fs.existsSync(dest)) {
    continue;
  }

  const relativeTarget = path.relative(path.dirname(dest), src);
  fs.symlinkSync(relativeTarget, dest, 'dir');
}
