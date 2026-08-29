// Orchestrator run by every page: resolves brand/lang/layout, loads the
// header/nav/footer partials, wires up the header selectors and search, and
// applies translations — all without a page reload.
import { BRANDS, LANGS, LANG_LABELS, LAYOUTS } from '../theme/brands-config.js';
import { resolveState, persistState } from './state.js';
import { applyBrand, applyLogo, applyFavicon } from '../theme/theme-switcher.js';
import { loadPartials } from './partial-loader.js';
import { renderSiteTree } from '../nav/nav-render.js';
import { initNavScrollspy } from '../nav/scrollspy.js';
import { applyTranslations } from './i18n.js';
import { applySeoMeta } from './seo.js';
import { renderPageTrail } from '../nav/page-trail.js';
import { resolvePath, findNavContext, langPath, loadNav, fetchLocalizedHTML } from '../nav/nav-config.js';
import { buildContinuousManual } from '../content/continuous-manual.js';
import { buildPrintFallback, removePrintFallback } from '../print/print-fallback.js';
import { buildSearchIndex } from '../content/search.js';
import { initSearchUI } from '../content/search-ui.js';

function setLayoutClass(layout) {
  document.body.classList.remove('layout-sidebar', 'layout-navbar', 'layout-scroll', 'layout-hybrid');
  document.body.classList.add(`layout-${layout}`);
}

function populateSelect(select, options, currentValue) {
  if (!select) return;
  select.innerHTML = '';
  for (const [value, label] of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === currentValue) opt.selected = true;
    select.appendChild(opt);
  }
}

export async function initPage() {
  const state = resolveState();
  persistState(state);
  const nav = await loadNav();

  applyBrand(state.brand);
  applyFavicon(state.brand);
  setLayoutClass(state.layout);

  await loadPartials();
  applyLogo(state.brand);
  const homeLink = document.querySelector('[data-home-link]');
  // Points at the first manual page directly (skipping index.html's own
  // redirect) in the visitor's current language.
  if (homeLink) homeLink.href = resolvePath(langPath(nav[0], state.lang));
  const pdfLink = document.querySelector('[data-pdf-link]');
  if (pdfLink) pdfLink.href = resolvePath('print.html');

  const pdfDownloadButton = document.getElementById('pdf-download-button');
  if (pdfDownloadButton) {
    pdfDownloadButton.addEventListener('click', () => {
      window.open(`${resolvePath('print.html')}?autoprint=1`, '_blank');
    });
  }

  const navRoot = document.getElementById('site-nav-tree');
  const contentRoot = document.getElementById('page-content');

  // 'hybrid' layout's second nav element isn't in the static per-page HTML
  // (see css/layout-hybrid.css) — created on first use and left in the DOM
  // afterwards, inert under any other layout.
  function getHybridSidebarRoot() {
    if (!contentRoot) return null;
    let el = document.getElementById('hybrid-sidebar');
    if (!el) {
      el = document.createElement('nav');
      el.id = 'hybrid-sidebar';
      el.className = 'hybrid-sidebar';
      el.setAttribute('aria-label', 'Chapter navigation');
      contentRoot.parentNode.insertBefore(el, contentRoot);
    }
    return el;
  }
  // Reassigned by soft navigation and the language switch below, so every
  // reader always sees whichever page is actually showing.
  let ctx = findNavContext(nav, window.location.pathname);
  let activeItemId = ctx ? ctx.item.id : null;
  let originalContentHTML = contentRoot ? contentRoot.innerHTML : '';

  async function applyLayoutContent(layout) {
    if (!contentRoot) return;
    if (layout !== 'scroll') {
      contentRoot.innerHTML = originalContentHTML;
      return;
    }
    // Built off-screen and swapped in with one assignment, so the old
    // content stays visible (no blank flash) while chapters are fetched.
    const build = document.createElement('div');
    await buildContinuousManual(build, nav, { activeItemId, reuseHTML: originalContentHTML, lang: state.lang });
    contentRoot.innerHTML = build.innerHTML;
  }

  // Builds a hidden full-manual fallback so Ctrl+P also works in
  // 'sidebar'/'navbar' layouts, which otherwise only have one page's DOM to
  // print (see js/print/print-fallback.js). Only rebuilt when the language
  // changes — its structure doesn't depend on brand.
  let printFallbackLang = null;
  function syncPrintFallback(layout, lang) {
    if (layout === 'scroll') {
      removePrintFallback();
      printFallbackLang = null;
      return;
    }
    if (document.getElementById('print-manual') && printFallbackLang === lang) return;
    printFallbackLang = lang;
    buildPrintFallback({ activeItemId, reuseHTML: originalContentHTML, brand: state.brand, lang, nav }).then(() =>
      applyTranslations(state.lang)
    );
  }

  function renderNav(layout, translations) {
    if (navRoot) {
      renderSiteTree(navRoot, nav, layout, translations, {
        activeItemId,
        activeChapterId: ctx ? ctx.chapter.id : null,
        lang: state.lang,
        hybridSidebarRoot: layout === 'hybrid' ? getHybridSidebarRoot() : null,
      });
    }
    if (layout === 'scroll' && navRoot) initNavScrollspy(navRoot, nav);
  }

  // Soft (client-side) navigation for 'sidebar'/'navbar' layouts: a
  // same-origin click fetches the target page and swaps #page-content + the
  // URL via history, instead of a full reload that re-fetches the header/
  // nav/footer chrome on every click. Pages remain real, independently
  // fetchable files — a plain click still works without JS.
  function isSoftNavCandidate(a) {
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return false;
    let url;
    try {
      url = new URL(a.href, window.location.href);
    } catch {
      return false;
    }
    if (url.origin !== window.location.origin) return false;
    if (!url.pathname.endsWith('.html')) return false;
    if (url.pathname.endsWith('/print.html')) return false;
    return true;
  }

  // Bumped on every soft-nav attempt so a stale in-flight fetch discards
  // itself instead of clobbering a later, faster-resolving click.
  let navToken = 0;

  async function softNavigateTo(url, { push, hash }) {
    const myToken = ++navToken;
    let res;
    try {
      res = await fetch(url.href);
    } catch {
      if (myToken !== navToken) return;
      window.location.href = url.href;
      return;
    }
    if (myToken !== navToken) return;
    if (!res.ok) {
      window.location.href = url.href;
      return;
    }
    const html = await res.text();
    if (myToken !== navToken) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newContent = doc.getElementById('page-content');
    if (!contentRoot || !newContent) {
      window.location.href = url.href;
      return;
    }

    ctx = findNavContext(nav, url.pathname);
    activeItemId = ctx ? ctx.item.id : null;

    const rawTitle = doc.querySelector('title');
    const productName = (currentTranslations && currentTranslations['product.name']) || '';
    if (rawTitle) {
      document.title = `${productName ? productName + ' — ' : ''}${rawTitle.textContent}`.trim();
    }

    originalContentHTML = newContent.innerHTML;
    contentRoot.innerHTML = originalContentHTML;
    // Before renderNav(): its isCurrentPage() reads window.location.
    if (push) history.pushState(null, '', url.href);
    renderNav(state.layout, currentTranslations || {});
    applySeoMeta({ item: ctx ? ctx.item : null, contentRoot, translations: currentTranslations, lang: state.lang });
    renderPageTrail(contentRoot, nav, ctx, state.layout, currentTranslations, state.lang);

    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) target.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }

  function enableSoftNavigation() {
    if (!contentRoot) return;
    document.addEventListener('click', (e) => {
      if (state.layout === 'scroll') return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest ? e.target.closest('a') : null;
      if (!isSoftNavCandidate(a)) return;
      const url = new URL(a.href, window.location.href);
      const isCurrentPage = url.pathname === window.location.pathname && url.search === window.location.search;
      if (isCurrentPage) {
        // No #hash: swallow the click instead of reloading the same page.
        // With a #hash: let the browser's native anchor scroll handle it.
        if (!url.hash) e.preventDefault();
        return;
      }
      e.preventDefault();
      softNavigateTo(url, { push: true, hash: url.hash });
    });

    window.addEventListener('popstate', () => {
      if (state.layout === 'scroll') return;
      softNavigateTo(new URL(window.location.href), { push: false, hash: window.location.hash });
    });
  }

  // The browser's native print header/footer shows document.title on every
  // page, so swap to a generic title only while actually printing.
  let currentTranslations = null;
  let titleBeforePrint = null;
  window.addEventListener('beforeprint', () => {
    titleBeforePrint = document.title;
    const t = currentTranslations || {};
    document.title = `${t['product.name'] || ''} — ${t['print.subtitle'] || ''}`.trim();
  });
  window.addEventListener('afterprint', () => {
    if (titleBeforePrint !== null) document.title = titleBeforePrint;
  });

  await applyLayoutContent(state.layout);
  const translations = await applyTranslations(state.lang);
  currentTranslations = translations;
  document.title = `${translations['product.name'] || ''} — ${document.title}`.trim();
  renderNav(state.layout, translations);
  applySeoMeta({ item: ctx ? ctx.item : null, contentRoot, translations, lang: state.lang });
  renderPageTrail(contentRoot, nav, ctx, state.layout, translations, state.lang);
  syncPrintFallback(state.layout, state.lang);
  enableSoftNavigation();

  // The browser's native "scroll to #hash on load" runs before the partials
  // above are injected, so re-apply it now. With no #hash in scroll layout,
  // the requested submenu itself is the implicit anchor.
  const initialAnchor = window.location.hash
    ? window.location.hash.slice(1)
    : state.layout === 'scroll'
    ? activeItemId
    : null;
  if (initialAnchor) {
    const target = document.getElementById(initialAnchor);
    if (target) target.scrollIntoView();
  }

  const brandSelect = document.getElementById('brand-selector');
  const langSelect = document.getElementById('lang-selector');
  const layoutSelect = document.getElementById('layout-selector');

  populateSelect(brandSelect, Object.entries(BRANDS).map(([id, b]) => [id, b.label]), state.brand);
  populateSelect(langSelect, LANGS.map((l) => [l, LANG_LABELS[l] || l.toUpperCase()]), state.lang);
  populateSelect(layoutSelect, LAYOUTS.map((l) => [l, l]), state.layout);

  // Nothing to switch between in a single-brand/single-layout build (e.g.
  // one generated by generator/index.html) — hide the selector entirely.
  const brandWrap = document.getElementById('brand-selector-wrap');
  if (brandWrap && Object.keys(BRANDS).length <= 1) brandWrap.hidden = true;
  const layoutWrap = document.getElementById('layout-selector-wrap');
  if (layoutWrap && LAYOUTS.length <= 1) layoutWrap.hidden = true;

  async function refresh(next) {
    Object.assign(state, next);
    persistState(state);
    applyBrand(state.brand);
    applyLogo(state.brand);
    applyFavicon(state.brand);
    setLayoutClass(state.layout);
    await applyLayoutContent(state.layout);
    const t = await applyTranslations(state.lang);
    currentTranslations = t;
    document.title = `${t['product.name'] || ''} — ${document.title.split(' — ').pop()}`.trim();
    renderNav(state.layout, t);
    applySeoMeta({ item: ctx ? ctx.item : null, contentRoot, translations: t, lang: state.lang });
    renderPageTrail(contentRoot, nav, ctx, state.layout, t, state.lang);
    syncPrintFallback(state.layout, state.lang);
  }

  if (brandSelect) {
    // Swaps theme/logo/favicon only — leaves the current layout untouched.
    brandSelect.addEventListener('change', (e) => {
      refresh({ brand: e.target.value });
    });
  }
  if (langSelect) {
    // fetchLocalizedHTML() falls back to the default language for a page
    // not yet translated. 'scroll' layout recomposes the whole manual via
    // applyLayoutContent() instead of swapping just this one page.
    langSelect.addEventListener('change', async (e) => {
      const lang = e.target.value;
      state.lang = lang;
      persistState(state);

      if (contentRoot && ctx) {
        const html = await fetchLocalizedHTML(ctx.item, lang);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newContent = doc.getElementById('page-content');
        if (newContent) {
          originalContentHTML = newContent.innerHTML;
          const newURL = resolvePath(langPath(ctx.item, lang));
          const currentURL = window.location.href.split('#')[0].split('?')[0];
          if (newURL !== currentURL) history.pushState(null, '', newURL + window.location.hash);
          await applyLayoutContent(state.layout);
        }
      }

      const t = await applyTranslations(lang);
      currentTranslations = t;
      document.title = `${t['product.name'] || ''} — ${document.title.split(' — ').pop()}`.trim();
      renderNav(state.layout, t);
      applySeoMeta({ item: ctx ? ctx.item : null, contentRoot, translations: t, lang });
      renderPageTrail(contentRoot, nav, ctx, state.layout, t, lang);
      syncPrintFallback(state.layout, lang);
      buildSearchIndex(nav, lang); // warm the new language's index in the background
    });
  }
  if (layoutSelect) {
    layoutSelect.addEventListener('change', (e) => refresh({ layout: e.target.value }));
  }

  initSearchUI({ nav, state, getTranslations: () => currentTranslations, softNavigateTo });

  return state;
}
