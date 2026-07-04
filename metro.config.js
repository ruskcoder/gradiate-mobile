const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// culori's package.json maps the "import" export condition to its raw ESM
// source, which uses `import.meta` — Metro's web bundler picks that
// condition but doesn't wrap output as a real ES module, so it throws
// "Cannot use 'import.meta' outside a module" at runtime. Force resolution
// to culori's prebuilt CJS bundle (the same one Node/Metro's own "require"
// condition would use) instead.
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform, ...rest) => {
  if (moduleName === 'culori') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/culori/bundled/culori.cjs'),
      type: 'sourceFile',
    };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform, ...rest);
  }
  return context.resolveRequest(context, moduleName, platform, ...rest);
};

module.exports = withUniwindConfig(config, {
  // relative path to your global.css file (from previous step)
  cssEntryFile: './global.css',
  // (optional) path where we gonna auto-generate typings
  // defaults to project's root
  dtsFile: './uniwind-types.d.ts',
});
