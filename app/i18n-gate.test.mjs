// Tests for the i18n gate's own configuration (renderer/eslint.config.i18n.mjs).
//
// A lint gate that silently stops matching is worse than no gate: it reports green while
// blind. That is not hypothetical here — the first version of this config passed its
// exclusion patterns as STRINGS, and the plugin compiles those with a bare `new RegExp()`
// with no `u` flag. `\p{L}` degraded to a literal `p`, so `[^\p{L}]+` matched any copy
// without p/{/L/} in it and dropped 258 real user-facing strings from the gate.
//
// So: assert the semantics, not the count. The count lives in i18n-lint-baseline.json.
import { test } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const eslint = new ESLint({
  cwd: APP_DIR,
  overrideConfigFile: path.join(APP_DIR, 'renderer/eslint.config.i18n.mjs'),
});

// Lint a JSX snippet as if it were a renderer component; return the flagged strings.
async function flagged(jsx) {
  const source = `export function C() {\n  return (\n${jsx}\n  );\n}\n`;
  const [result] = await eslint.lintText(source, {
    filePath: path.join(APP_DIR, 'renderer/src/__fixture__.tsx'),
  });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'i18next/no-literal-string');
}

test('flags ordinary user-facing JSX text', async () => {
  // "All notes" is the exact regression case: no p, {, L or } in it, so the broken
  // string-pattern version of the config skipped it.
  for (const copy of ['All notes', 'Transcript', 'Import audio file', 'Try again']) {
    const messages = await flagged(`    <span>${copy}</span>`);
    assert.equal(messages.length, 1, `expected "${copy}" to be flagged`);
  }
});

test('ignores symbol-, punctuation- and number-only text', async () => {
  for (const glyph of ['—', '·', '×', '1', '2026', '/', '…', '·  ·']) {
    const messages = await flagged(`    <span>${glyph}</span>`);
    assert.equal(messages.length, 0, `expected "${glyph}" to be ignored`);
  }
});

test('ignores product and vendor names', async () => {
  for (const name of ['Steno', 'Ollama', 'Whisper', 'Parakeet', 'Obsidian']) {
    const messages = await flagged(`    <span>${name}</span>`);
    assert.equal(messages.length, 0, `expected "${name}" to be ignored`);
  }
});

test('ignores structural attributes but flags copy-bearing ones', async () => {
  const structural = await flagged(
    `    <input className="mv-input" data-testid="search" type="text" />`
  );
  assert.equal(structural.length, 0, 'structural attributes must not be flagged');

  for (const attr of ['placeholder', 'title', 'alt', 'aria-label']) {
    const messages = await flagged(`    <input ${attr}="Search notes" />`);
    assert.equal(messages.length, 1, `expected ${attr} to be flagged`);
  }
});

test('exclusion patterns are RegExp objects, not strings', async () => {
  // The structural guard behind the failure described at the top of this file.
  const { default: config } = await import('./renderer/eslint.config.i18n.mjs');
  const rule = config.flatMap((b) => Object.entries(b.rules ?? {}))
    .find(([id]) => id === 'i18next/no-literal-string');
  assert.ok(rule, 'the gate must configure i18next/no-literal-string');
  for (const pattern of rule[1][1].words.exclude) {
    assert.ok(
      pattern instanceof RegExp,
      `word exclusions must be RegExp objects — a string is compiled without the u flag ` +
        `and \\p{L} silently degrades to a literal p (got ${JSON.stringify(pattern)})`
    );
  }
});

// --- the inventory's own rules -------------------------------------------------------
// Both cases below are regressions that actually happened while building this gate, and
// both were silent: the tooling reported success while quietly covering less than it
// claimed. That is the failure mode a gate must not have.

import { globToRegExp, looksLikeCopy } from './scripts/i18n-copy-rules.mjs';

test('globToRegExp expands a double-star segment across path depth', async () => {
  const rx = globToRegExp('**/*.test.ts');
  // The bug: chained replaces rewrote the star inside the expansion, narrowing it to a
  // single path segment — so nothing below renderer/src matched and every test file's
  // strings leaked into the inventory.
  assert.ok(rx.test('renderer/src/lib/hero.test.ts'), 'must match at any depth');
  assert.ok(rx.test('hero.test.ts'), 'must match with no directory at all');
  assert.ok(!rx.test('renderer/src/lib/hero.ts'), 'must not match a non-test file');

  const sandbox = globToRegExp('**/routes/Sandbox.tsx');
  assert.ok(sandbox.test('renderer/src/routes/Sandbox.tsx'));
  assert.ok(!sandbox.test('renderer/src/routes/Home.tsx'));
});

test('looksLikeCopy keeps prose and drops markup', async () => {
  // 'Nothing to process' is the string whose silent rewrite in PR #494 broke three specs.
  // It is a plain TS literal, invisible to the linter — the inventory is what covers it.
  for (const copy of [
    'Nothing to process',
    'Ready to capture beautiful notes',
    'Transcribe and summarise in Portuguese',
    'Processing',
    'Cancelled',
  ]) {
    assert.ok(looksLikeCopy(copy), `expected copy: ${JSON.stringify(copy)}`);
  }

  for (const markup of [
    'flex flex-col items-center gap-3 rounded-xl',
    'text-[18px] font-normal',
    'truncate text-[11.5px] italic',
    'M514.833,1703.333h1228.316c18.901,0.096,37.335-5.874',
    'CardContent',
    'ArrowDown',
    'aria-label',
    'https://example.com/x',
    './relative/path',
    '--fg-1',
  ]) {
    assert.ok(!looksLikeCopy(markup), `expected NOT copy: ${JSON.stringify(markup)}`);
  }
});
