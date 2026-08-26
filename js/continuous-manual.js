// Composes the ENTIRE manual — every top-level menu and all of its
// submenus, in nav-config order — into a given container. Used two ways:
//
// 1. Layout 5 (continuous scroll): composed directly into the visible
//    `#page-content`, so scrolling moves through the whole manual.
// 2. Every other layout: composed into a hidden `#print-manual` container
//    (see js/print-fallback.js) so that a plain browser Ctrl+P — which can
//    only ever print what's actually in the current page's DOM — still
//    produces the whole manual instead of just whichever one page
//    sidebar/navbar happens to be showing on screen.
//
// Individual pages stay real, independently fetchable files (see README
// "Architecture") — this module only composes them together at render
// time; it doesn't change what's on disk.
import { fetchLocalizedHTML } from './nav-config.js';

async function fetchPageContentHTML(item, lang) {
  const html = await fetchLocalizedHTML(item, lang);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.getElementById('page-content');
  return el ? el.innerHTML : '';
}

function renameTag(el, tagName) {
  const replacement = document.createElement(tagName);
  for (const attr of el.attributes) replacement.setAttribute(attr.name, attr.value);
  replacement.innerHTML = el.innerHTML;
  el.replaceWith(replacement);
  return replacement;
}

// Each page source only ever contains h1 (title) and h2 (its own topics).
// Demoting by 1 reads as "this chapter's own content" (h1->h2, h2->h3);
// demoting by 2 reads as "one level deeper, inside a chapter" (h1->h3,
// h2->h4) — used for submenus, since they sit alongside a chapter's own
// topics as siblings, both children of the chapter.
function demoteBy(container, levels) {
  const map = levels === 2 ? { h1: 'h3', h2: 'h4' } : { h1: 'h2', h2: 'h3' };
  container.querySelectorAll('h2').forEach((h) => renameTag(h, map.h2));
  container.querySelectorAll('h1').forEach((h) => renameTag(h, map.h1));
}

// `activeItemId`/`reuseHTML` are an optional micro-optimization: if the
// caller already has one item's content on hand (the page that was
// actually requested), pass its nav id + HTML to skip re-fetching it.
//
// Appends to `container` rather than clearing it first — callers that need
// a clean slate clear it themselves; this lets js/print-fallback.js prepend
// a logo/title header before calling this.
export async function buildContinuousManual(container, nav, { activeItemId, reuseHTML, lang } = {}) {
  for (const chapter of nav) {
    const introHTML = chapter.id === activeItemId ? reuseHTML : await fetchPageContentHTML(chapter, lang);
    const introWrap = document.createElement('div');
    introWrap.innerHTML = introHTML;
    demoteBy(introWrap, 1);
    const chapterHeading = introWrap.querySelector('h2');
    if (chapterHeading) chapterHeading.id = chapter.id;

    const chapterSection = document.createElement('section');
    chapterSection.className = 'chapter-section';
    while (introWrap.firstChild) chapterSection.appendChild(introWrap.firstChild);

    for (const child of chapter.children || []) {
      const childHTML = child.id === activeItemId ? reuseHTML : await fetchPageContentHTML(child, lang);
      const childWrap = document.createElement('div');
      childWrap.innerHTML = childHTML;
      demoteBy(childWrap, 2);
      const childHeading = childWrap.querySelector('h3');
      if (childHeading) childHeading.id = child.id;

      const subSection = document.createElement('div');
      subSection.className = 'chapter-subsection';
      while (childWrap.firstChild) subSection.appendChild(childWrap.firstChild);
      chapterSection.appendChild(subSection);
    }

    container.appendChild(chapterSection);
  }
}
