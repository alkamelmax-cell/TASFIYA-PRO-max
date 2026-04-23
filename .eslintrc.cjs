module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'backup-2025-09-01/',
    'src/web-dashboard/',
    'src/app.js'
  ],
  rules: {
    'no-console': 'off'
  }
};
