module.exports = {
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  root: true,
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2020,
    ecmaFeatures: { jsx: true },
  },
  env: {
    browser: true,
    es2020: true,
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    'react/prop-types': 'off',
    'react/jsx-filename-extension': 'off',
  },
};
