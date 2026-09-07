// Flat ESLint config (ESLint 10 / typescript-eslint 8).
//
// Scope for this PR (PR-01A, "tooling configuration"): wire up lint/format tooling with no
// reformatting and no behavior change to src/. Rules that fail on existing code are downgraded to
// 'warn' below (grouped, with a TODO) rather than fixed here — see docs/adr/0001 and
// CONTRIBUTING.md. A follow-up cleanup PR promotes them to 'error' incrementally.
//
// react-hooks: this project does not opt into the React Compiler, so only the two classic,
// load-bearing rules (rules-of-hooks, exhaustive-deps) are enabled. eslint-plugin-react-hooks v7
// bundles a much larger "compiler readiness" rule family (purity, immutability, refs,
// set-state-in-effect, ...); adopting that family is a separate decision, not a byproduct of
// wiring up lint tooling, so it is left out entirely rather than silently enabled as warnings.
//
// Boundary rule: src/core/ is pure TypeScript per CLAUDE.md ("no DOM, no React, no Cesium
// imports"). The no-restricted-imports override below enforces exactly that boundary and no more;
// the fuller src/domain <-> src/contracts <-> src/state <-> src/viewer <-> src/ui boundaries from
// the upgrade plan land with the modules they protect, not speculatively here.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/cesium/**',
      'public/models/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files at the repo root are not part of tsconfig.json's `include`; type-check
          // everything else against the real project and these standalone files on their own.
          allowDefaultProject: ['eslint.config.js', '*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // React hooks + Vite Fast Refresh rules, browser source only. See file header re: scope.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // src/core is pure TS: no DOM, no React, no Cesium (CLAUDE.md, "Layout rules").
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/core is pure TypeScript; no React imports.' },
            { name: 'react-dom', message: 'src/core is pure TypeScript; no React imports.' },
            { name: 'cesium', message: 'src/core is pure TypeScript; no Cesium imports.' },
            { name: 'zustand', message: 'src/core is pure TypeScript; no store imports.' },
          ],
          patterns: [
            { group: ['../viewer/*', '../../viewer/*'], message: 'src/core must not depend on src/viewer.' },
            { group: ['../state/*', '../../state/*'], message: 'src/core must not depend on src/state.' },
            { group: ['../ui/*', '../../ui/*'], message: 'src/core must not depend on src/ui.' },
          ],
        },
      ],
    },
  },

  // Ambient global-augmentation files (Vite's ImportMetaEnv pattern): the declared interface is
  // consumed by TypeScript's declaration merging, not by any local reference, so no-unused-vars
  // does not apply.
  {
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },

  // Node-side scripts and configs (not part of the browser bundle).
  {
    files: ['scripts/**/*.mjs', '*.config.ts', '*.config.js', 'vitest.config.ts', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  // public/boot.js: a classic (non-module) inline <script>, loaded before the app bundle to show
  // a boot error if the module script fails. Plain JS, not part of the TS project.
  {
    files: ['public/boot.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      sourceType: 'script',
      globals: globals.browser,
      parserOptions: { project: false, projectService: false },
    },
  },

  // --- Temporary downgrades: pre-existing patterns not yet clean under these rules. ---
  // TODO(follow-up cleanup PR): fix and remove these overrides one rule at a time; tracked in
  // docs/adr/0001-record-architecture-decisions.md.
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },

  // scripts/*.mjs are not type-checked (see disableTypeChecked above); only non-typed rules apply.
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'no-useless-assignment': 'warn',
    },
  },

  // Prettier compatibility: disable stylistic rules that would conflict with formatting.
  eslintConfigPrettier,
);
