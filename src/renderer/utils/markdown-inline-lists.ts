/**
 * Convert ATX headings (###, ##, #) that appear mid-line into line-start headings
 * so they render correctly. E.g. "From X: ### Architecture Overview" -> "From X:\n### Architecture Overview"
 */
export function normalizeInlineHeadings(text: string): string {
  return text.replace(/\s+(#{1,6})(\s+)/g, "\n$1$2");
}

/**
 * Split inline list items into proper newline-separated markdown list items.
 * Handles LLM output that puts "1. X 2. Y 3. Z" on one line instead of separate lines.
 * Uses [ \t]+ (space/tab only) between items so we don't match across existing newlines.
 * Also converts parenthetical numbers "(1) X (2) Y" into markdown list format.
 */
export function normalizeInlineLists(text: string): string {
  let prev = "";
  let result = text;
  while (result !== prev) {
    prev = result;
    // Numbered: "1. X 2. Y" or "1) X 2) Y" -> separate lines (space/tab between items only)
    result = result.replace(/(\d+[.)]\s+[^\n]+?)[ \t]+(\d+[.)]\s)/g, "$1\n$2");
    // Bullet: "- X - Y" or "• X • Y" -> separate lines
    result = result.replace(/([-*•]\s+[^\n]+?)[ \t]+([-*•]\s)/g, "$1\n$2");
  }
  // Parenthetical: "(1) X (2) Y" or ", (1) X, (2) Y" -> markdown list format
  result = result.replace(/\s+\((\d+)\)\s+/g, "\n$1. ");
  return result;
}

/**
 * Full markdown normalization for collab display: inline headings + inline lists.
 */
export function normalizeMarkdownForCollab(text: string): string {
  return normalizeInlineLists(normalizeInlineHeadings(text));
}
