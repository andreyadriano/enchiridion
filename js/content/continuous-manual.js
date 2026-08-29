// Composes the entire manual — every top-level menu and its submenus, in
// nav-config order — into a container: directly into #page-content for
// 'scroll' layout, or into a hidden #print-manual for every other layout's
// Ctrl+P fallback (see js/print/print-fallback.js).
import { fetchLocalizedHTML } from '../nav/nav-config.js';

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

// Each page source only ever contains h1/h2. A chapter's own content is
// demoted by 1 (h1->h2, h2->h3); a submenu, one level deeper, by 2
// (h1->h3, h2->h4).
function demoteBy(container, levels) {
  const map = levels === 2 ? { h1: 'h3', h2: 'h4' } : { h1: 'h2', h2: 'h3' };
  container.querySelectorAll('h2').forEach((h) => renameTag(h, map.h2));
  container.querySelectorAll('h1').forEach((h) => renameTag(h, map.h1));
}

// `activeItemId`/`reuseHTML`: pass the already-fetched page's id + HTML to
// skip re-fetching it. Appends to `container` rather than clearing it
// first, so js/print/print-fallback.js can prepend a logo/title header.
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
