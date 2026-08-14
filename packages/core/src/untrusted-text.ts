/**
 * Rendering helpers for untrusted stored text.
 *
 * Recalled, imported, and inferred memory content is untrusted data. Stored
 * values are never mutated; these helpers only change how a value is presented
 * at a human-readable rendering boundary so stored bytes cannot forge terminal
 * control sequences, output rows, output columns, or Markdown structure.
 *
 * JSON surfaces keep the original value and rely on JSON string escaping.
 */

const c0End = 0x1f;
const delete_ = 0x7f;
const c1End = 0x9f;
const lineSeparator = 0x2028;
const paragraphSeparator = 0x2029;
const tab = 0x09;
const lineFeed = 0x0a;
const carriageReturn = 0x0d;

const bidiFormattingCodePoints = new Set([
  0x061c, // ARABIC LETTER MARK
  0x200e, // LEFT-TO-RIGHT MARK
  0x200f, // RIGHT-TO-LEFT MARK
  0x202a, // LEFT-TO-RIGHT EMBEDDING
  0x202b, // RIGHT-TO-LEFT EMBEDDING
  0x202c, // POP DIRECTIONAL FORMATTING
  0x202d, // LEFT-TO-RIGHT OVERRIDE
  0x202e, // RIGHT-TO-LEFT OVERRIDE
  0x2066, // LEFT-TO-RIGHT ISOLATE
  0x2067, // RIGHT-TO-LEFT ISOLATE
  0x2068, // FIRST STRONG ISOLATE
  0x2069, // POP DIRECTIONAL ISOLATE
]);

const backtickRuns = /`+/gu;
const minimumFenceLength = 3;

/**
 * C0 controls, DEL, C1 controls, Unicode line/paragraph separators, and
 * bidirectional formatting controls that can visually reorder terminal text.
 *
 * C1 and the separators matter because `JSON.stringify` leaves them raw, so
 * they survive JSON-encoded values that later reach a terminal.
 */
function isControlCodePoint(codePoint: number): boolean {
  return (
    codePoint <= c0End ||
    (codePoint >= delete_ && codePoint <= c1End) ||
    codePoint === lineSeparator ||
    codePoint === paragraphSeparator ||
    bidiFormattingCodePoints.has(codePoint)
  );
}

/**
 * Replace every control character with a visible, deterministic escape.
 *
 * Backslashes are left alone, so this is safe for values that already carry
 * their own escaping, such as compact `JSON.stringify` output, and for
 * filesystem paths.
 */
export function escapeUntrustedControlCharacters(value: string): string {
  return escapeControlCharacters(value, isControlCodePoint);
}

/**
 * Serialize JSON without leaving terminal-active or direction-changing code
 * points raw. JSON.parse reconstructs the original strings exactly.
 */
export function stringifyUntrustedJson(value: unknown, space?: string | number): string {
  const serialized = JSON.stringify(value, null, space);
  if (serialized === undefined) {
    throw new TypeError("Nuzo JSON output requires a serializable root value.");
  }
  return escapeControlCharacters(serialized, isRawJsonUnsafeCodePoint);
}

function isRawJsonUnsafeCodePoint(codePoint: number): boolean {
  // JSON.stringify already escapes C0 controls inside strings. Do not escape
  // pretty-print line feeds outside strings or the JSON document becomes
  // invalid; only neutralize control/format points it leaves raw.
  return (
    (codePoint >= delete_ && codePoint <= c1End) ||
    codePoint === lineSeparator ||
    codePoint === paragraphSeparator ||
    bidiFormattingCodePoints.has(codePoint)
  );
}

/**
 * Render an untrusted value for a single line of human-readable output.
 *
 * Backslashes are escaped first so the escape alphabet stays unambiguous: a
 * rendered line-feed escape always means a stored line feed, and a stored
 * backslash always renders as a doubled backslash. The result contains no
 * control characters, so it cannot forge an additional output row or an
 * additional tab-separated column.
 */
export function renderUntrustedInlineText(value: string): string {
  return escapeUntrustedControlCharacters(value.replaceAll("\\", "\\\\"));
}

/**
 * Render an untrusted value as an inert fenced Markdown block.
 *
 * The fence is always longer than the longest backtick run in the value, so the
 * value cannot close the block early. Inside a fenced block, Markdown does not
 * interpret HTML, headings, lists, tables, links, images, or emphasis.
 *
 * Line feeds are preserved so multi-line content stays readable and cannot
 * escape the fence. Every other control character, including tabs and carriage
 * returns, is escaped so the file is safe to print in a terminal.
 *
 * Backslashes are not escaped here. That keeps human review faithful, but it
 * means a literal escape sequence in stored content is indistinguishable from
 * one this renderer produced. JSON export remains the exact-content format.
 */
export function renderUntrustedMarkdownBlock(value: string): string {
  const escaped = escapeControlCharacters(value, isMarkdownBlockControlCodePoint);
  const fence = "`".repeat(Math.max(minimumFenceLength, longestBacktickRun(escaped) + 1));
  return `${fence}text\n${escaped}\n${fence}`;
}

function isMarkdownBlockControlCodePoint(codePoint: number): boolean {
  if (codePoint === lineFeed) return false;
  return isControlCodePoint(codePoint) || codePoint === carriageReturn;
}

function escapeControlCharacters(
  value: string,
  isControl: (codePoint: number) => boolean,
): string {
  let escaped = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    escaped += isControl(codePoint) ? escapeControlCharacter(codePoint) : character;
  }
  return escaped;
}

function escapeControlCharacter(codePoint: number): string {
  if (codePoint === lineFeed) return "\\n";
  if (codePoint === carriageReturn) return "\\r";
  if (codePoint === tab) return "\\t";
  return `\\u${codePoint.toString(16).padStart(4, "0")}`;
}

function longestBacktickRun(value: string): number {
  let longest = 0;
  for (const match of value.matchAll(backtickRuns)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}
