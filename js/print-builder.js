// Builds the single "everything in one document" source used by print.html,
// then hands it to the Paged.js polyfill (vendor/paged.polyfill.js) which
// paginates it in the browser with real page numbers and a resolved table
// of contents (see css/print.css, target-counter()). The user then prints /
// "Save as PDF" from the browser once pagination is done.
import { BRANDS } from './brands-config.js';
import { resolveState } from './state.js';
import { applyBrand, applyFavicon } from './theme-switcher.js';
import { applyTranslations } from './i18n.js';
import { loadNav, flattenNav, resolvePath, fetchLocalizedHTML } from './nav-config.js';

async function fetchChapterContent(item, lang) {
  const html = await fetchLocalizedHTML(item, lang);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.getElementById('page-content');
}

function buildTocList(items) {
  const list = document.createElement('ul');
  list.className = 'toc-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'toc-entry';
    const a = document.createElement('a');
    a.href = `#chapter-${item.id}`;
    a.setAttribute('data-i18n', item.labelKey);
    a.textContent = item.labelKey;
    li.appendChild(a);
    if (item.children && item.children.length) {
      const sub = buildTocList(item.children);
      sub.classList.remove('toc-list');
      sub.classList.add('toc-sublist');
      li.appendChild(sub);
    }
    list.appendChild(li);
  }
  return list;
}

export async function buildAndPaginate({ sourceEl, outputEl, statusEl }) {
  // Reads from ?brand=&lang= if present, else falls back to whatever the
  // visitor is currently browsing the manual in (localStorage) — see
  // js/state.js. Deliberately doesn't persist: generating a PDF in a
  // different brand/language than you're currently browsing shouldn't
  // change what the rest of the site remembers.
  const state = resolveState();
  const brand = BRANDS[state.brand];
  applyBrand(state.brand);
  applyFavicon(state.brand);
  const nav = await loadNav();

  sourceEl.innerHTML = '';

  const cover = document.createElement('section');
  cover.className = 'cover';
  cover.innerHTML = `
    <img src="${resolvePath(brand.logo)}" alt="${brand.label} logo">
    <div class="product-name" data-i18n="product.name">Product name</div>
    <div class="cover-subtitle" data-i18n="print.subtitle">User Guide</div>
  `;
  sourceEl.appendChild(cover);

  const toc = document.createElement('section');
  toc.className = 'toc';
  const tocHeading = document.createElement('h1');
  tocHeading.setAttribute('data-i18n', 'print.toc');
  tocHeading.textContent = 'Table of contents';
  toc.appendChild(tocHeading);
  toc.appendChild(buildTocList(nav));
  sourceEl.appendChild(toc);

  for (const item of flattenNav(nav)) {
    const content = await fetchChapterContent(item, state.lang);
    const section = document.createElement('section');
    section.className = 'chapter';
    section.id = `chapter-${item.id}`;
    if (content) section.innerHTML = content.innerHTML;
    sourceEl.appendChild(section);
  }

  const translations = await applyTranslations(state.lang);

  if (statusEl) statusEl.textContent = 'Paginating…';
  await window.PagedPolyfill.preview(sourceEl, [resolvePath('css/print.css')], outputEl);
  sourceEl.hidden = true;
  if (statusEl) statusEl.textContent = 'Ready — press Ctrl+P / Cmd+P and choose "Save as PDF".';
  return translations;
}
