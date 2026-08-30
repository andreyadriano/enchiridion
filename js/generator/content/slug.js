// Shared by structure.js (menu/submenu ids) and import.js (heading ids) —
// both need the same ascii/kebab-case + collision-avoidance behavior.
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

export function slugify(text) {
  const base = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(COMBINING_MARKS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base;
}

export function uniqueSlug(base, existingIds, fallback = 'item') {
  const root = base || fallback;
  if (!existingIds.has(root)) return root;
  let n = 2;
  let candidate = `${root}-${n}`;
  while (existingIds.has(candidate)) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}
