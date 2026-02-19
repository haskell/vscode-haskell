/*---------------------------------------------------------------------------------------------
 *  Minimal webpack config for VS Code extensions
 *  Uses ES Modules (compatible with Yarn 4, npm 11, and modern Node.js)
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { fileURLToPath } from 'url';
import ESLintPlugin from 'eslint-webpack-plugin';

// Recreate __dirname for ES Modules (not available in ESM by default)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('webpack').Configuration} */
export default {
  // VS Code extensions run in a Node.js environment, not a browser
  target: 'node',

  // 'none' mode disables default optimizations (VS Code handles this)
  mode: 'none',

  // Entry point: where webpack starts bundling your extension
  entry: './src/extension.ts',

  output: {
    // Output directory for the bundled extension
    path: path.resolve(__dirname, 'dist'),
    // Final bundle filename (must match 'main' in package.json)
    filename: 'extension.js',
    // Required format for VS Code extensions (CommonJS)
    libraryTarget: 'commonjs2'
  },

  // Generate source maps for debugging (maps bundled code back to original TypeScript)
  devtool: 'source-map',

  externals: {
    // 'vscode' module is provided by VS Code at runtime — don't bundle it
    vscode: 'commonjs vscode'
    // Add other native modules here if needed (e.g., 'fsevents': 'commonjs fsevents')
  },

  resolve: {
    // File extensions webpack will look for (in order)
    extensions: ['.ts', '.js']
  },

  module: {
    rules: [
      {
        // Match all TypeScript files
        test: /\.ts$/,
        // Skip node_modules (already compiled)
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          // Explicitly point to your tsconfig.json (fixes ESM resolution issues)
          options: { configFile: path.resolve(__dirname, 'tsconfig.json') }
        }
      }
    ]
  },

  plugins: [
    // Lint TypeScript files during build
    new ESLintPlugin({
      extensions: ['.ts'],
      exclude: ['node_modules', 'dist']
    })
  ],

  // Suppress known harmless warnings from vscode-languageserver-types UMD build
  ignoreWarnings: [
    {
      module: /vscode-languageserver-types/,
      message: /Critical dependency: require function is used in a way/
    }
  ]
};
