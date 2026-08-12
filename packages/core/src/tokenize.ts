const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it', 'for', 'on',
  'as', 'at', 'be', 'by', 'was', 'are', 'this', 'that', 'with', 'from', 'we',
  'you', 'not', 'but', 'have', 'has', 'had', 'do', 'does', 'did', 'its',
  'their', 'they', 'them', 'so', 'if', 'then', 'than', 'when', 'what',
  'which', 'how', 'why', 'can', 'could', 'should', 'would', 'will', 'may',
  'might', 'must', 'also', 'into', 'over', 'about', 'after', 'before',
  'between', 'during', 'without', 'within', 'through', 'use', 'using', 'used',
]);

/**
 * Tokenizer tuned for prose mixed with code identifiers.
 * "getUserId" -> ["get", "user", "id", "getuserid"] so both the compound
 * and its parts are searchable. snake_case splits the same way. Unicode
 * word characters are kept whole, so non-Latin titles are searchable.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const chunks = text.match(/[\p{L}\p{N}_]+/gu) ?? [];
  for (const chunk of chunks) {
    const parts = chunk
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .toLowerCase()
      .split(/[_\s]+/)
      .filter((p) => p.length >= 2 && !STOPWORDS.has(p));
    out.push(...parts);
    const whole = chunk.toLowerCase().replace(/_/g, '');
    if (parts.length > 1 && whole.length >= 2 && !STOPWORDS.has(whole)) {
      out.push(whole); // compound form, only when it actually split
    }
  }
  return out;
}
