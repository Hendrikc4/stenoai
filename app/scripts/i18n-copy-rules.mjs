import path from 'node:path';

// Shared definition of "what counts as user-facing copy".
//
// Two tools consume this: the lint gate (renderer/eslint.config.i18n.mjs) which blocks NEW
// hardcoded strings, and the copy inventory (scripts/i18n-copy-inventory.mjs) which records
// the EXISTING English wording so a migration to t() can be proven not to change it.
// They must agree — if the linter and the inventory disagree about what copy is, a string
// can be silently dropped by one and never noticed by the other.

/** Files whose strings are never shown to a user, so never translated. */
export const IGNORED_FILES = [
  'dist/**',
  'node_modules/**',
  // The /dev component showcase (App.tsx routes it at /dev) — demo copy only.
  '**/routes/Sandbox.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
];

/**
 * JSX attributes whose value a user actually reads.
 *
 * Both the DOM ones and this app's own component props: `<SettingRow label="…" />` and
 * `<ConfirmDialog confirmLabel="…" />` are copy every bit as much as `placeholder`, and
 * there are ~170 such sites in the renderer. Leaving them out let new hardcoded copy in
 * through the front door — the gate would go green on it.
 */
export const COPY_ATTRIBUTES = [
  // DOM attributes
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'aria-description',
  // This app's own copy-bearing component props
  'label',
  'description',
  'hint',
  'heading',
  'subtitle',
  'caption',
  'tooltip',
  'emptyText',
  'message',
  'confirmLabel',
  'cancelLabel',
  'submitLabel',
];

/**
 * Normalise a path for comparison against globs and checked-in baselines.
 *
 * `path.relative()` yields backslashes on Windows, so the slash-based ignore patterns stop
 * matching and every baseline key differs from the committed one — both gates would fail on
 * an untouched Windows checkout. CLAUDE.md requires the two platforms to behave the same.
 *
 * `sep` is injectable purely so the Windows behaviour is testable from a POSIX machine,
 * where `path.sep` is already '/' and the function would otherwise be a silent no-op.
 */
export function toPosixPath(relPath, sep = path.sep) {
  return String(relPath).split(sep).join('/');
}

/**
 * Text that looks like a string but is not copy.
 *
 * These MUST be RegExp objects, never strings: eslint-plugin-i18next compiles a string
 * pattern with a bare `new RegExp()` — no `u` flag — so `\p{L}` degrades to a literal `p`
 * and `[^\p{L}]+` then matches ordinary copy such as "All notes". Guarded by
 * i18n-gate.test.mjs.
 */
export const NON_COPY_PATTERNS = [
  // Symbol-, punctuation- and number-only text: separators, counters, glyphs.
  /^[^\p{L}]+$/u,
  // Product and vendor names are not translated.
  /^(Steno|stenoai|Ollama|Whisper|Parakeet|OpenAI|Anthropic|Obsidian|macOS|Windows|GitHub|Zapier|Discord)$/,
];

/** True when `text` is a string a translator would need to see. */
export function isCopy(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  return !NON_COPY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ---------------------------------------------------------------------------
// The inventory needs a WIDER net than the lint gate, and this asymmetry is
// deliberate. The gate BLOCKS, so a false positive costs a contributor real time and
// a noisy rule gets downgraded to `warn` — precision wins. The inventory only WITNESSES,
// so a false positive is a harmless extra line in a generated file while a false negative
// is a string that can be silently reworded — recall wins.
//
// Concretely: the string that started all of this, 'Nothing to process', is a plain
// TypeScript literal assigned to a variable and rendered as {heading}. It is neither JSX
// text nor a JSX attribute, so the linter cannot see it in any mode short of 'all' (which
// would flag every id, key and class name in the codebase). The heuristic below catches it.

/** Strings that are structurally technical: ids, keys, paths, CSS, URLs, class names. */
const TECHNICAL_PATTERNS = [
  /^https?:\/\//i,
  /^[./~]/, // paths and relative imports
  /^--/, // CSS custom properties
  /^[a-z]+([A-Z][a-z0-9]*)+$/, // camelCase identifiers
  /^[A-Z0-9]+(_[A-Z0-9]+)+$/, // SCREAMING_SNAKE_CASE
  /^[a-z0-9]+(-[a-z0-9]+)+$/, // kebab-case / css classes / data attributes
  /^[a-z0-9]+(\.[a-z0-9]+)+$/i, // dotted keys and file names
  /^[a-z]+:/i, // protocol-ish and css shorthand ("var:", "data:")
  /^\d+(\.\d+)*(px|rem|em|%|s|ms)?$/, // numbers and css lengths
];

/** An SVG path payload: a command letter followed by coordinate soup. */
const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz][\d\s,.eE+-]{8,}/;

/** A single token that is markup rather than a word: css class, id fragment, unit, key. */
function isTechnicalToken(token) {
  if (!token) return true;
  if (/[[\]{}()<>/\\|@#$~^*=]/.test(token)) return true; // punctuation only code uses
  if (/\d/.test(token) && !/^\d+([.,]\d+)?$/.test(token)) return true; // px-4, gap-1.5, h-[13px]
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(token)) return true; // kebab-case
  if (/^[a-z]+:[a-z0-9-]+$/.test(token)) return true; // tailwind variants: hover:bg-x
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(token)) return true; // camelCase
  if (/^\p{Lu}\p{Ll}*(\p{Lu}\p{Ll}*)+$/u.test(token)) return true; // PascalCase identifiers
  return false;
}

/**
 * Sentence punctuation, as opposed to punctuation inside a number or a CSS value: the mark
 * must be followed by whitespace or end the string. Without that qualifier the `.` in
 * `text-[11.5px]` reads as a full stop and a className list passes as prose.
 */
const READS_AS_PROSE = /[.!?;:…'’"](\s|$)|,\s/;

/**
 * True when `text` might be copy a user reads, judged generously but not blindly.
 *
 * Recall matters more than precision here (see the note above), but unfiltered recall
 * buries the signal: className strings, CSS values and SVG paths outnumbered real copy
 * in the first version of this heuristic, which would have made a migration diff
 * unreadable — and an unreadable diff proves nothing.
 *
 * A string qualifies when it reads like language: it carries sentence punctuation, or it
 * is a phrase whose words are mostly real words, or it is a single capitalised word.
 */
export function looksLikeCopy(text) {
  const trimmed = String(text ?? '').trim();
  if (!isCopy(trimmed)) return false;
  if (trimmed.length < 2) return false;
  if (TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed))) return false;
  if (SVG_PATH.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) {
    // One word: accept Sentence-case words ("Processing", "Cancelled") and short all-caps
    // acronyms that are real labels ("AI", "PDF") — the nav item `label: 'AI'` is a plain
    // TS literal the linter cannot see either, so dropping it here left it uncovered by
    // both gates. Reject the PascalCase identifiers that look just like sentence-case
    // words ("CardContent", "ArrowDown").
    if (/^\p{Lu}{2,5}$/u.test(trimmed)) return true;
    return /^\p{Lu}\p{Ll}+$/u.test(trimmed);
  }

  const technical = tokens.filter(isTechnicalToken).length;
  if (technical > tokens.length / 2) return false; // a className list, not a sentence

  // Utility-class strings are entirely lower case ("truncate text-[11.5px] italic"), and
  // they mix real words with markup tokens, so a simple majority vote lets them through.
  // Sentence copy in this app essentially always carries a capital somewhere.
  if (technical > 0 && !/\p{Lu}/u.test(trimmed)) return false;

  return READS_AS_PROSE.test(trimmed) || technical === 0;
}

// Minimal glob-to-RegExp for the subset IGNORED_FILES uses.
//
// Substitution goes through sentinels, NOT chained .replace() calls. Expanding a leading
// double-star segment into an optional "any directories" group produces a regex that still
// contains a star; the following pass that turns a single star into "[^/]*" then rewrites
// the star INSIDE that replacement, narrowing it from "any number of path segments" to
// exactly one. The double-star test-file patterns then quietly stopped matching anything
// below renderer/src, and every test file leaked into the inventory.
// Guarded by i18n-gate.test.mjs.
export function globToRegExp(pattern) {
  const GLOBSTAR_SLASH = '\u0000globstarslash\u0000';
  const GLOBSTAR = '\u0000globstar\u0000';
  const STAR = '\u0000star\u0000';
  const source = pattern
    .replace(/\*\*\//g, GLOBSTAR_SLASH)
    .replace(/\*\*/g, GLOBSTAR)
    .replace(/\*/g, STAR)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll(GLOBSTAR_SLASH, '(?:.*/)?')
    .replaceAll(GLOBSTAR, '.*')
    .replaceAll(STAR, '[^/]*');
  return new RegExp(`^${source}$`);
}

/**
 * Decode the HTML entities JSX source may carry.
 *
 * `JsxText` hands back the raw source text, so `Summarisation &amp; Chat` is stored with
 * the entity intact while React renders `Summarisation & Chat`. That breaks the one rule
 * the inventory exists to support: during the migration to locale strings, copy that never
 * changed would show up as changed — and anyone copying the inventory text into a locale
 * file would ship the literal entity to the UI.
 */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  times: '\u00d7',
  middot: '\u00b7',
};

export function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    // `&` is decoded last by construction: a single pass never rewrites its own output.
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : match;
  });
}
