const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig([
  {
    label: 'integration-tests',
    files: 'out/test/**/*.test.js',
    version: 'stable',
    workspaceFolder: './test-workspace',
    installExtensions: ['justusadam.language-haskell'],
    mocha: {
      timeout: 120 * 1000, // 2 minute timeout
    },
  },
  // you can specify additional test configurations, too
]);
