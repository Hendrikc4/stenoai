#!/usr/bin/env node
// English copy inventory.
//
// WHY THIS EXISTS. The i18n migration rewrites hundreds of hardcoded strings into t()
// lookups. That edit is supposed to be pure motion — same words, new home. In PR #494 it
// was not: 'Nothing to process' silently became 'Nothing was recorded.', and three e2e
// specs went red for a reason nobody could read off the diff. Roughly two thirds of this
// app's copy is pinned by no test at all, so the same rewrite elsewhere would land unseen.
//
// This script writes every English string the renderer shows into a checked-in file. CI
// regenerates it and fails if it is stale. The review rule for the migration then fits in
// one sentence: the inventory diff must show strings MOVING, never CHANGING. Afterwards it
// keeps working as an ordinary copy changelog — an intentional wording change shows up as
// a one-file diff in the PR that makes it.
//
// It witnesses; it never blocks a legitimate copy edit.
//
//   node scripts/i18n-copy-inventory.mjs           # check (CI) — fails if stale
//   node scripts/i18n-copy-inventory.mjs --update  # rewrite the inventory
//
// SCOPE, honestly stated: this reads JSX text and the copy-bearing JSX attributes listed
// in i18n-copy-rules.mjs. It does NOT see strings assembled at runtime from fragments,
// copy that lives in the Electron main process, or text the Python backend emits. Coverage
// is a floor, not a proof of completeness.
//
// AFTER THE FOUNDATION LANDS: teach `collectFromSource` to also resolve `t('some.key')`
// call sites against locales/en.json and emit the resolved English value. That keeps the
// inventory comparable across the migration boundary, which is the whole point — before
// the migration a file lists its literals, after it the same file lists the same English
// words, now reached through keys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  IGNORED_FILES,
  COPY_ATTRIBUTES,
  isCopy,
  looksLikeCopy,
  globToRegExp,
  decodeEntities,
  toPosixPath,
} from './i18n-copy-rules.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(APP_DIR, 'renderer/src');
const INVENTORY = path.resolve(APP_DIR, '../docs/i18n/copy-inventory.json');
const update = process.argv.includes('--update');

function ignored(relPath) {
  const posix = toPosixPath(relPath);
  return IGNORED_FILES.some((pattern) => globToRegExp(pattern).test(posix));
}

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(APP_DIR, full);
    if (entry.isDirectory()) {
      if (!ignored(rel)) sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !ignored(rel)) {
      acc.push(full);
    }
  }
  return acc;
}

// Record what the user actually sees. JSX collapses whitespace, so the inventory must too
// — otherwise a reflowed line reads as a copy change and the "moved, not changed" rule
// stops meaning anything. Entities are decoded for the same reason: React renders `&amp;`
// as `&`, so storing the entity would make untouched copy look edited during the migration.
const normalize = (text) => decodeEntities(text.replace(/\s+/g, ' ').trim());

function collectFromSource(file) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
  const found = new Set();

  const addLiteral = (node, accept) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = normalize(node.text);
      if (accept(text)) found.add(text);
    }
  };

  // Import specifiers, property keys and the like are strings but never copy; skipping the
  // whole subtree is cheaper and safer than pattern-matching their contents afterwards.
  const isStructural = (node) =>
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isModuleDeclaration(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    (ts.isCallExpression(node) &&
      ['require', 'import'].includes(node.expression.getText(source)));

  const walk = (node) => {
    if (isStructural(node)) return;

    if (ts.isJsxText(node)) {
      const text = normalize(node.text);
      // JSX text is copy by construction — take it on the narrow rule, no heuristic.
      if (isCopy(text)) found.add(text);
    } else if (ts.isJsxAttribute(node) && COPY_ATTRIBUTES.includes(node.name.getText(source))) {
      // Covers both `title="Copy"` and `title={cond ? 'Hide' : 'Show'}` — the ternary form
      // is common here, so walking the whole initializer matters.
      if (node.initializer) {
        const walkAttr = (n) => {
          addLiteral(n, isCopy);
          ts.forEachChild(n, walkAttr);
        };
        walkAttr(node.initializer);
      }
    } else {
      // Everything else: a plain literal anywhere in the file, judged by the wider
      // heuristic. This is what catches `const heading = 'Nothing to process'`.
      addLiteral(node, looksLikeCopy);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);

  return [...found].sort((a, b) => a.localeCompare(b));
}

const inventory = {};
for (const file of sourceFiles(SRC_DIR).sort()) {
  const strings = collectFromSource(file);
  if (strings.length) inventory[toPosixPath(path.relative(APP_DIR, file))] = strings;
}

const total = Object.values(inventory).reduce((sum, list) => sum + list.length, 0);
const rendered =
  JSON.stringify(
    {
      // Read by humans in review; regenerate rather than hand-edit.
      _comment:
        'Generated by app/scripts/i18n-copy-inventory.mjs. In an i18n migration diff, strings must MOVE, never CHANGE.',
      total,
      files: inventory,
    },
    null,
    2
  ) + '\n';

if (update) {
  fs.mkdirSync(path.dirname(INVENTORY), { recursive: true });
  fs.writeFileSync(INVENTORY, rendered);
  console.log(`i18n inventory: written — ${total} string(s) across ${Object.keys(inventory).length} file(s).`);
  process.exit(0);
}

if (!fs.existsSync(INVENTORY)) {
  console.error('i18n inventory: missing. Run: npm run i18n:inventory:update');
  process.exit(1);
}
if (fs.readFileSync(INVENTORY, 'utf8') !== rendered) {
  console.error('\ni18n inventory: stale — the renderer\'s English copy changed.\n');
  console.error('  npm run i18n:inventory:update\n');
  console.error('Then check the diff: a wording change should be intentional and reviewed.');
  console.error('During the i18n migration it must show strings moving, never changing.\n');
  process.exit(1);
}
console.log(`i18n inventory: up to date — ${total} string(s) across ${Object.keys(inventory).length} file(s).`);
