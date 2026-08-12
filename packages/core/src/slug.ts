/**
 * kebab-case slug from a title; used as node id and filename. Unicode-aware:
 * non-Latin scripts keep their letters (valid filenames and wikilinks
 * everywhere), so an Arabic or CJK title doesn't collapse to the 'note'
 * placeholder and collide.
 */
export function slugify(text: string, maxLen = 60): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // strip combining marks (diacritics)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return slug || 'note';
}
