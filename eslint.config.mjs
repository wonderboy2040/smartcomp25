// SmartComp ESLint flat config.
// Catches unused imports/vars, common React pitfalls, and Next.js best practices.
// `no-explicit-any` and `ban-ts-comment` are kept as WARN (not error) so the
// legacy panel code can compile without a giant refactor — but the rules are
// visible in editor and CI so new code is held to a higher bar.

import tseslint from 'typescript-eslint'
import nextPlugin from '@next/eslint-plugin-next'

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'next-env.d.ts',
      'examples/**',
      'skills/**',
      'apps-script/**', // Apps Script is plain JS, not part of TS project
      'electron/**',    // Electron main/preload are plain JS
      'scripts/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|ignored)' }],
      'no-undef': 'error',
      '@next/next/no-img-element': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@next/next': nextPlugin,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': 'off', // handled by @typescript-eslint version
      'no-undef': 'off',       // TS already checks this
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|ignored)' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@next/next/no-img-element': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
    },
  },
]

export default eslintConfig
