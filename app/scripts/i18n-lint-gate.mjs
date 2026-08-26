#!/usr/bin/env node
// i18n lint gate — the ratchet.
//
// Runs `i18next/no-literal-string` (renderer/eslint.config.i18n.mjs) over the renderer
// and compares per-file violation counts against renderer/i18n-lint-baseline.json.
//
// Counts, not line numbers: line numbers churn on every unrelated edit and would turn the
// baseline into a merge-conflict magnet across the many renderer PRs in flight.
//
// Semantics are lockfile-like — ANY divergence from the baseline fails, in both directions:
//   * a count went UP   → new hardcoded copy; use t() (or justify a baseline bump in review)
//   * a count went DOWN → progress; commit it with --update so the burn-down stays honest
// Without the second half the baseline silently drifts above reality and stops binding.
//
//   node scripts/i18n-lint-gate.mjs            # check (CI)
//   node scripts/i18n-lint-gate.mjs --update   # rewrite the baseline
import { ESLint } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(APP_DIR, 'renderer/eslint.config.i18n.mjs');
const BASELINE = path.join(APP_DIR, 'renderer/i18n-lint-baseline.json');
const update = process.argv.includes('--update');

const eslint = new ESLint({ cwd: APP_DIR, overrideConfigFile: CONFIG });
const results = await eslint.lintFiles([path.join(APP_DIR, 'renderer/src')]);

const counts = {};
for (const r of results) {
  const n = r.messages.filter((m) => m.ruleId === 'i18next/no-literal-string').length;
  if (n > 0) counts[path.relative(APP_DIR, r.filePath)] = n;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));

if (update) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ total, files: sorted }, null, 2) + '\n'
  );
  console.log(`i18n gate: baseline updated — ${total} literal(s) in ${Object.keys(sorted).length} file(s).`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error(`i18n gate: no baseline at ${path.relative(APP_DIR, BASELINE)}. Run: npm run lint:i18n:update`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const base = baseline.files ?? {};

const raised = [];
const lowered = [];
for (const file of new Set([...Object.keys(base), ...Object.keys(counts)])) {
  const was = base[file] ?? 0;
  const now = counts[file] ?? 0;
  if (now > was) raised.push({ file, was, now });
  else if (now < was) lowered.push({ file, was, now });
}

if (raised.length === 0 && lowered.length === 0) {
  console.log(`i18n gate: ok — ${total} known literal(s) in ${Object.keys(counts).length} file(s), none added.`);
  process.exit(0);
}

if (raised.length > 0) {
  console.error('\ni18n gate: new hardcoded user-facing string(s).\n');
  for (const { file, was, now } of raised) console.error(`  ${file}: ${was} -> ${now}  (+${now - was})`);
  console.error('\nUse the i18n t() lookup for new copy. If the string is genuinely not user-facing');
  console.error('(a symbol, a brand name, dev-only UI), widen the exclusions in');
  console.error('renderer/eslint.config.i18n.mjs rather than bumping the baseline.\n');
}
if (lowered.length > 0) {
  console.error(`\ni18n gate: ${lowered.length} file(s) improved — commit the new baseline:\n`);
  for (const { file, was, now } of lowered) console.error(`  ${file}: ${was} -> ${now}  (${now - was})`);
  console.error('\n  npm run lint:i18n:update\n');
}
process.exit(1);
