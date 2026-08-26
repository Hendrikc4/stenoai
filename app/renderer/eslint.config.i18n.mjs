import i18next from 'eslint-plugin-i18next';
import tsParser from '@typescript-eslint/parser';
import tseslint from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import { IGNORED_FILES, COPY_ATTRIBUTES, NON_COPY_PATTERNS } from '../scripts/i18n-copy-rules.mjs';

// i18n gate config — deliberately SEPARATE from eslint.config.mjs.
//
// `no-literal-string` fires on every user-facing string in a codebase that has no
// i18n yet — 713 of them when this landed. Putting it in the main config would
// make `npm run lint:renderer` permanently red, and this repo's own history says what
// happens next: eslint.config.mjs documents four react-hooks rules that were downgraded
// to `warn` for exactly that reason, where they are now write-only.
//
// So the rule lives here at `error` and is run by scripts/i18n-lint-gate.mjs, which
// compares per-file counts against renderer/i18n-lint-baseline.json and fails only when
// a count diverges. New hardcoded copy is blocked from day one; the pre-existing 713
// are a burn-down number rather than a wall. Once the i18n migration drains the baseline,
// this config can fold into the main one as a plain global `error`.
export default [
  { ignores: IGNORED_FILES },
  {
    files: ['**/*.{ts,tsx}'],
    // The rule set below is deliberately just the one rule. The other two plugins are
    // registered but left switched off: the codebase carries `eslint-disable` comments
    // for their rules, and ESLint 9 reports a disable directive for an *undefined* rule
    // as an error — which would show up as phantom failures in this gate's output.
    plugins: { i18next, '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Match the main config: this codebase carries intentional disable directives that
    // aren't active rules here, and reporting them would be noise from an unrelated gate.
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          // 'jsx-only', not 'jsx-text-only': the latter skips JSX attributes entirely,
          // so `placeholder="Search notes"` would never be seen. 'jsx-only' covers JSX
          // text plus the attributes listed below, and still leaves plain TypeScript
          // string literals alone — those are overwhelmingly ids, keys and class names.
          mode: 'jsx-only',
          // Attributes that carry copy a user actually reads. Everything else
          // (className, data-*, variant, href, …) stays out by omission.
          'jsx-attributes': { include: COPY_ATTRIBUTES },
          words: { exclude: NON_COPY_PATTERNS },
        },
      ],
    },
  },
];
