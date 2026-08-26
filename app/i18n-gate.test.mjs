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

import { globToRegExp, definitelyNotCopy, readsAsCopy } from './scripts/i18n-copy-rules.mjs';

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

test('the inventory keeps prose and rejects only provable markup', async () => {
  // Burden of proof is inverted here: a string is copy unless provably not. The previous
  // accept-list dropped all of these, each discovered in a separate review round.
  for (const copy of [
    'Nothing to process',
    'Ready to capture beautiful notes',
    'Ask AI',
    'AI provider',
    'AI',
    'note',
    'notes',
    'Re-run first-time setup',
    'permission denied',
    'Processing',
  ]) {
    assert.ok(!definitelyNotCopy(copy), `expected copy: ${JSON.stringify(copy)}`);
  }

  for (const markup of [
    'flex flex-col items-center gap-3 rounded-xl',
    'text-[11.5px]',
    'hover:bg-red-500',
    'var(--fg-1)',
    '0 14px',
    '#FAF9F5',
    'M514.833,1703.333h1228.316c18.901,0.096,37.335-5.874',
    'camelCaseThing',
    'SCREAMING_CONST',
    'https://example.com/x',
    './relative/path',
    '--fg-1',
  ]) {
    assert.ok(definitelyNotCopy(markup), `expected NOT copy: ${JSON.stringify(markup)}`);
  }
});

test('lowercase copy with a hyphenated word is kept; class lists are still rejected', async () => {
  // A hyphen alone was treated as proof of markup as soon as a second token followed, so
  // every lowercase multi-word phrase containing one fell out of the inventory -- exactly
  // the "e-mail"/"opt-in"/"sign-in" family the rule above claims to protect. No such copy
  // exists in the renderer today, which is why nothing went red: the hole is a trap for
  // the copy that gets written next, not a loss that already happened.
  for (const copy of [
    'sign-in required',
    'opt-in only',
    'built-in template',
    'read-only mode',
    'follow-up notes',
    'drag-and-drop a file',
    'e-mail address',
    'per-channel labels',
    // Both tokens are bare utilities that are also English words -- only the missing
    // hyphen keeps this out of the class-list branch.
    'open group',
  ]) {
    assert.ok(!definitelyNotCopy(copy), `expected copy: ${JSON.stringify(copy)}`);
  }

  // Every one of these is a real class list from the renderer, and each is rejected by
  // the utility vocabulary rather than by the bare presence of a hyphen.
  for (const markup of [
    'flex items-center',
    'flex flex-col',
    'text-sm font-medium',
    'bg-muted text-foreground',
    'inline-flex items-stretch overflow-hidden rounded-full',
    'border border-border bg-card shadow-sm',
    'min-h-screen bg-background text-foreground',
    'h-full max-w-full flex flex-col',
    'font-mono text-sm tabular-nums',
    'mv-transcript-wave mv-transcript-wave-static',
    'mv-title group',
    'mv-transcript open',
  ]) {
    assert.ok(definitelyNotCopy(markup), `expected NOT copy: ${JSON.stringify(markup)}`);
  }
});

// --- fixes from the Codex review ------------------------------------------------------

import { decodeEntities, toPosixPath, COPY_ATTRIBUTES } from './scripts/i18n-copy-rules.mjs';

test('records what the user sees, not the JSX source entity', async () => {
  // The inventory stored `Summarisation &amp; Chat` while React renders `Summarisation &
  // Chat`. Untouched copy would then read as changed in a migration diff — the exact
  // comparison the inventory exists to make.
  assert.equal(decodeEntities('Summarisation &amp; Chat'), 'Summarisation & Chat');
  assert.equal(decodeEntities('Settings &gt; People'), 'Settings > People');
  assert.equal(decodeEntities('it&apos;s'), "it's");
  assert.equal(decodeEntities('&#39;x&#39;'), "'x'");
  assert.equal(decodeEntities('&#x2014;'), '—');
  // An entity nobody declared stays put rather than turning into something wrong.
  assert.equal(decodeEntities('&unknown;'), '&unknown;');
});

test('baseline and glob keys are POSIX on every platform', async () => {
  // On Windows path.relative() returns backslashes: the slash-based ignore globs stop
  // matching and every baseline key differs from the committed one, so both gates fail on
  // an untouched checkout.
  assert.equal(toPosixPath('renderer\\src\\routes\\Home.tsx', '\\'), 'renderer/src/routes/Home.tsx');
  assert.equal(toPosixPath('renderer/src/routes/Home.tsx', '/'), 'renderer/src/routes/Home.tsx');

  const rx = globToRegExp('**/*.test.ts');
  assert.ok(rx.test(toPosixPath('renderer\\src\\lib\\hero.test.ts', '\\')));
});

test('copy-bearing component props are gated, not just DOM attributes', async () => {
  // ~170 sites in the renderer use label=/description=/hint=/confirmLabel=. Leaving them
  // out let new hardcoded copy in through the front door with the gate reporting green.
  for (const attr of ['label', 'description', 'hint', 'confirmLabel']) {
    const messages = await flagged(`    <SettingRow ${attr}="Shown to users" />`);
    assert.equal(messages.length, 1, `expected ${attr} to be flagged`);
  }
  assert.ok(COPY_ATTRIBUTES.includes('label'));

  // Still no false positive on the structural props sitting right next to them.
  const structural = await flagged(`    <SettingRow id="general" variant="compact" />`);
  assert.equal(structural.length, 0);
});

test('the copy partition holds the contract, uncertain holds the safety net', async () => {
  // `copy` is what a migration diff must hold string-for-string; `uncertain` is recall
  // insurance, so a styling PR that only moves uncertain lines is a five-second read.
  for (const certain of ['Ask AI', 'Nothing to process', 'Delete', 'AI']) {
    assert.ok(readsAsCopy(certain), `expected copy partition: ${JSON.stringify(certain)}`);
  }
  for (const hedged of ['keydown', 'dragover', 'gallery']) {
    assert.ok(!readsAsCopy(hedged), `expected uncertain partition: ${JSON.stringify(hedged)}`);
  }
});

// --- fixes from the cubic review on PR #497 -------------------------------------------

import fs from 'node:fs';
import os from 'node:os';

test('a duplicate swap changes the inventory (multiset, not Set)', async () => {
  // The real failure: a file holds the same string twice and one occurrence is changed to
  // another string ALREADY present in that file. Set-backed collection produced identical
  // output before and after, so the guard missed exactly the rewording it exists to catch.
  // Drive the real extractor over a fixture rather than asserting on the generated file.
  const { collectFromSource } = await import('./scripts/i18n-copy-inventory.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-gate-'));
  const write = (body) => {
    const file = path.join(dir, 'Fixture.tsx');
    fs.writeFileSync(file, body);
    return collectFromSource(file);
  };

  const before = write(
    `export function C() {
       return (<div><span>All notes</span><span>All notes</span><span>Shared notes</span></div>);
     }`
  );
  const after = write(
    `export function C() {
       return (<div><span>All notes</span><span>Shared notes</span><span>Shared notes</span></div>);
     }`
  );

  assert.deepEqual(before.copy, ['All notes', 'All notes', 'Shared notes']);
  assert.deepEqual(after.copy, ['All notes', 'Shared notes', 'Shared notes']);
  assert.notDeepEqual(before.copy, after.copy, 'a duplicate swap must change the inventory');
  // The set of distinct strings is identical — this is what a Set-backed version saw.
  assert.deepEqual([...new Set(before.copy)].sort(), [...new Set(after.copy)].sort());

  fs.rmSync(dir, { recursive: true, force: true });
});

test('a switch body is inventoried, only the case label is skipped', async () => {
  // Skipping the whole CaseClause dropped every string inside a switch along with the label.
  const { collectFromSource } = await import('./scripts/i18n-copy-inventory.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-gate-'));
  const file = path.join(dir, 'Switch.tsx');
  fs.writeFileSync(
    file,
    `export function C({ state }) {
       switch (state) {
         case 'saved':
           return <p>All changes saved</p>;
         default:
           return null;
       }
     }`
  );
  const { copy, uncertain } = collectFromSource(file);
  assert.ok(copy.includes('All changes saved'), 'copy inside a case body must be recorded');
  assert.ok(![...copy, ...uncertain].includes('saved'), 'the case label itself is structure');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('generated output is ordered independently of host locale', async () => {
  // localeCompare collates per locale, so a contributor and CI on different locales would
  // each see the other's generated file as stale. Both generators use a plain sort now.
  for (const script of ['scripts/i18n-copy-inventory.mjs', 'scripts/i18n-lint-gate.mjs']) {
    const source = fs.readFileSync(new URL(`./${script}`, import.meta.url), 'utf8');
    const code = source.replace(/^\s*\/\/.*$/gm, ''); // ignore the comments explaining this
    assert.ok(!code.includes('localeCompare'), `${script} must not sort with localeCompare`);
  }
});

test('no copy-sounding JSX prop escapes classification (allowlist tripwire)', async () => {
  // COPY_ATTRIBUTES is an allowlist, and an allowlist's incompleteness is invisible — that
  // is how label=/description= stayed outside the gate while it reported green. So make
  // the gap mechanically detectable: every copy-sounding prop the renderer actually uses
  // must be deliberately classified as copy or as data.
  const { KNOWN_NON_COPY_ATTRIBUTES, COPY_SOUNDING_PROP } = await import(
    './scripts/i18n-copy-rules.mjs'
  );
  const srcDir = new URL('./renderer/src/', import.meta.url);

  const names = new Set();
  const walkDir = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walkDir(child);
      else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
        const source = fs.readFileSync(child, 'utf8');
        for (const [, name] of source.matchAll(/\s([a-zA-Z][a-zA-Z0-9]*(?:-[a-z]+)?)=[{"]/g)) {
          names.add(name);
        }
      }
    }
  };
  walkDir(srcDir);

  const unclassified = [...names]
    .filter((name) => COPY_SOUNDING_PROP.test(name))
    .filter((name) => !/^on[A-Z]/.test(name)) // event handlers are never copy
    .filter(
      (name) => !COPY_ATTRIBUTES.includes(name) && !KNOWN_NON_COPY_ATTRIBUTES.includes(name)
    );

  assert.deepEqual(
    unclassified,
    [],
    `copy-sounding prop(s) classified in neither list: ${unclassified.join(', ')}. ` +
      `Add each to COPY_ATTRIBUTES (it shows words to a user) or to ` +
      `KNOWN_NON_COPY_ATTRIBUTES (it carries data), in app/scripts/i18n-copy-rules.mjs.`
  );
});
