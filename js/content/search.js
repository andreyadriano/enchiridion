// Full-manual search: fetches every page once, builds a small in-memory
// index of {heading, text} sections, and does a plain case-insensitive
// substring match. No backend, no precomputed index — the right trade-off
// for a manual with a few dozen pages.
import { resolvePath, langPath, flattenNav } from '../nav/nav-config.js';

// lang -> Promise<records>, not the resolved array, so a search triggered
// while a background warm-up is still in flight awaits the same fetch batch
// instead of starting a redundant one.
const indexCache = {};

async function fetchPageDoc(item, lang) {
  const path = langPath(item, lang);
  const res = await fetch(resolvePath(path));
  if (!res.ok) return null;
  const html = await res.text();
  return new DOMParser().parseFromString(html, 'text/html');
}

// Inserts a space after every element's own text — plain `.textContent`
// runs adjacent table cells/list items together with no space between them.
function extractText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out += child.textContent;
    else if (child.nodeType === 1) out += extractText(child) + ' ';
  }
  return out;
}

// Splits one page's #page-content into searchable sections (the intro, then
// one per h2), reusing each h2's own id so a search result can link
// straight to it — the same ids js/content/continuous-manual.js anchors to.
function extractSections(doc, item) {
  const root = doc.getElementById('page-content');
  if (!root) return [];
  const h1 = root.querySelector('h1');
  const pageTitle = h1 ? h1.textContent.trim() : item.id;

  const sections = [];
  let current = { heading: pageTitle, anchor: null, nodes: [] };
  for (const node of Array.from(root.children)) {
    if (node.tagName === 'H1') continue;
    if (node.tagName === 'H2') {
      if (current.nodes.length) sections.push(current);
      current = { heading: node.textContent.trim(), anchor: node.id || null, nodes: [] };
      continue;
    }
    current.nodes.push(node);
  }
  if (current.nodes.length || sections.length === 0) sections.push(current);

  return sections.map((s) => ({
    pageId: item.id,
    pageTitle,
    anchor: s.anchor,
    heading: s.heading,
    text: s.nodes
      .map((n) => extractText(n))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

export function buildSearchIndex(nav, lang) {
  if (!indexCache[lang]) {
    indexCache[lang] = (async () => {
      const items = flattenNav(nav);
      const perPage = await Promise.all(
        items.map(async (item) => {
          const doc = await fetchPageDoc(item, lang);
          if (!doc) return [];
          const url = resolvePath(langPath(item, lang));
          return extractSections(doc, item).map((section) => ({ ...section, url }));
        })
      );
      return perPage.flat();
    })();
  }
  return indexCache[lang];
}

function makeSnippet(text, idx, matchLen) {
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + matchLen + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// Heading matches rank above body-text matches; results are capped so the
// dropdown stays scannable rather than dumping every match in the manual.
export function searchIndex(records, query, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const rec of records) {
    const headingIdx = rec.heading.toLowerCase().indexOf(q);
    const textIdx = rec.text.toLowerCase().indexOf(q);
    if (headingIdx === -1 && textIdx === -1) continue;
    scored.push({
      ...rec,
      score: headingIdx !== -1 ? 2 : 1,
      snippet: textIdx !== -1 ? makeSnippet(rec.text, textIdx, q.length) : '',
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
