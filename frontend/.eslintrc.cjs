/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    // Note: NOT extending plugin:react-hooks/recommended — in v7.0.1 that preset
    // ships the React Compiler rules which flag valid patterns in non-compiler projects.
    // The two important hooks rules are specified explicitly below instead.
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react', 'react-hooks'],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // Avoid common pitfalls
    'no-unused-vars':   ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    'no-console':       'warn',
    // Native dialogs are blocking and unthemeable — use utils/dialog
    // (showError / confirmDialog / promptDialog), rendered by <DialogHost>.
    'no-alert':         'error',
    'no-debugger':      'error',
    'eqeqeq':           ['error', 'always', { null: 'ignore' }],

    // React-specific
    'react/prop-types': 'off',          // project uses TS-less JSX; prop-types not enforced
    'react-hooks/rules-of-hooks':  'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
