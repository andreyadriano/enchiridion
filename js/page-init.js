// Orchestrator run by every page. Resolves brand/lang/layout (see
// js/state.js for why that's localStorage-first, not URL-first), loads the
// header/nav/footer partials, wires up the selectors in the header, and
// applies translations — all without a page reload.
import { BRANDS, LANGS, LANG_LABELS, LAYOUTS } from './brands-config.js';
import { resolveState, persistState } from './state.js';
import { applyBrand, applyLogo, applyFavicon } from './theme-switcher.js';
import { loadPartials } from './partial-loader.js';
import { renderSiteTree } from './nav-render.js';
import { initNavScrollspy } from './scrollspy.js';
import { applyTranslations } from './i18n.js';
import { resolvePath, findNavContext, langPath, loadNav, fetchLocalizedHTML } from './nav-config.js';
import { buildContinuousManual } from './continuous-manual.js';
import { buildPrintFallback, removePrintFallback } from './print-fallback.js';
import { buildSearchIndex, searchIndex } from './search.js';

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
  // Points straight at the first manual page rather than index.html, which
  // is just a client-side redirector to it — skips a pointless double
  // navigation, and lets the soft-navigation below treat it like any other
  // in-manual link. Goes through langPath() same as every other nav link,
  // so it lands on the current language's own file (e.g. index.pt.html)
  // instead of always the default-language one.
  if (homeLink) homeLink.href = resolvePath(langPath(nav[0], state.lang));
  const pdfLink = document.querySelector('[data-pdf-link]');
  if (pdfLink) pdfLink.href = resolvePath('print.html');

  // Header "download PDF" button: opens the dedicated print.html flow in a
  // new tab and has it auto-trigger window.print() as soon as pagination
  // is ready, instead of making the visitor wait then press Ctrl+P
  // themselves. It still ends at the browser's own Save dialog — there is
  // no way to write a file to disk without that, in any browser, for any
  // site; window.print() is the closest a page can get to "one click".
  const pdfDownloadButton = document.getElementById('pdf-download-button');
  if (pdfDownloadButton) {
    pdfDownloadButton.addEventListener('click', () => {
      window.open(`${resolvePath('print.html')}?autoprint=1`, '_blank');
    });
  }

  const navRoot = document.getElementById('site-nav-tree');
  const contentRoot = document.getElementById('page-content');

  // 'hybrid' layout only: a second nav element, a direct sibling of
  // #site-nav/#page-content inside .layout-shell — not present in the
  // static per-page HTML, created on demand here. See css/layout-hybrid.css
  // for why it can't just be nested inside #site-nav like every other
  // layout's submenu markup. Created once and left in the DOM (inert,
  // empty, no CSS applies to it) when a different layout is active, rather
  // than added/removed on every switch — simpler, and harmless since only
  // `body.layout-hybrid` scoped rules ever give it a box.
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
  // Which nav item this page actually is, and its own native content —
  // constant for the page's lifetime (the URL never changes here), reused
  // both to compose layout 5's on-screen view and the print fallback below
  // instead of re-fetching this one page.
  // `let`, not `const`: soft navigation below (sidebar/navbar layouts)
  // updates all three in place whenever it swaps to a different page,
  // without a real page load — so anything reading them afterwards (brand/
  // layout switches, the print fallback, the language selector) stays
  // correct for whichever page is actually showing, not just the one this
  // script tag originally ran on.
  let ctx = findNavContext(nav, window.location.pathname);
  let activeItemId = ctx ? ctx.item.id : null;
  let originalContentHTML = contentRoot ? contentRoot.innerHTML : '';

  async function applyLayoutContent(layout) {
    if (!contentRoot) return;
    if (layout !== 'scroll') {
      contentRoot.innerHTML = originalContentHTML;
      return;
    }
    // Composed into a detached element first, not the live #page-content —
    // buildContinuousManual awaits a fetch per chapter, so clearing the
    // real content up front (the previous approach) left the page blank
    // for however long those fetches take, then repopulated it piece by
    // piece: a visible flash/rebuild, not the "no reload" feel this is
    // supposed to have (most noticeable switching languages while already
    // in scroll layout, recomposing the whole manual). Building off-screen
    // and swapping in with one `innerHTML` assignment once everything is
    // ready keeps the current (old) content on screen, unchanged, right up
    // until the new one replaces it in a single step.
    const build = document.createElement('div');
    await buildContinuousManual(build, nav, { activeItemId, reuseHTML: originalContentHTML, lang: state.lang });
    contentRoot.innerHTML = build.innerHTML;
  }

  // A plain Ctrl+P can only print what's in the current page's DOM. In
  // 'scroll' layout that's already the whole manual; in 'sidebar'/'navbar'
  // it's normally just this one page — so build a hidden full-manual
  // fallback for print there (see js/print-fallback.js). Not awaited: it
  // composes the other 6 pages in the background so it doesn't delay the
  // visible page, and is realistically ready long before anyone actually
  // hits Ctrl+P.
  // Its HTML structure doesn't depend on brand, only on which pages exist
  // and which language they're fetched in — so it only needs rebuilding
  // when the language actually changes (brand-only refreshes reuse it;
  // js/theme-switcher.js's applyLogo() already keeps its logo in sync).
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

  // Soft (client-side) navigation for 'sidebar'/'navbar' layouts. Pages
  // stay real, independently fetchable files (see README "Architecture") —
  // that never changes, and a plain click still works with JS disabled or
  // on a link this skips. What changes: a same-origin click to another
  // manual page now fetches it and swaps #page-content + the URL via
  // history, instead of forcing a full browser navigation that blanks and
  // re-fetches the header/nav/footer chrome (js/partial-loader.js) on
  // every click even though that chrome never actually changes — that
  // full-page flash was the reported symptom. 'scroll' layout already
  // never navigates on its own nav (every entry is an in-page anchor), so
  // this only ever applies to 'sidebar'/'navbar'.
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

  // Bumped on every soft-nav attempt so a stale, still-in-flight fetch from
  // an earlier click can recognize it's been superseded and discard itself
  // instead of clobbering whatever a later, faster-resolving click already
  // applied — without this, clicking two links in quick succession could
  // have the FIRST click's response land last and "win", making the nav
  // tree highlight the wrong (previous) item.
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
    if (myToken !== navToken) return; // superseded by a newer click while this fetch was in flight
    if (!res.ok) {
      window.location.href = url.href;
      return;
    }
    const html = await res.text();
    if (myToken !== navToken) return; // superseded while reading the response body
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newContent = doc.getElementById('page-content');
    if (!contentRoot || !newContent) {
      // Not a page this template recognizes (shouldn't happen for an
      // in-manual link) — fall back to a real navigation rather than
      // showing a blank/broken content area.
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

    // Instant swap, no fade: an animation here only delayed how quickly the
    // page felt responsive to the next click, for no real benefit.
    originalContentHTML = newContent.innerHTML;
    contentRoot.innerHTML = originalContentHTML;
    // Must happen before renderNav(): nav-render.js's isCurrentPage() reads
    // window.location to decide which link gets `.is-active`, so it needs
    // to already see the new URL.
    if (push) history.pushState(null, '', url.href);
    renderNav(state.layout, currentTranslations || {});

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
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        if (!url.hash) {
          // Clicking the current page's own (already active) link, no
          // #hash involved: there's nothing to navigate to, but letting
          // the browser's default action run would still perform a real,
          // jarring reload of the exact same page. Swallow it.
          e.preventDefault();
        }
        // A #hash on the current page: let the browser's native in-page
        // anchor scroll handle it, untouched.
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

  // The browser's native print header/footer (when enabled) shows
  // document.title on every page — which, left as this page's own specific
  // title (e.g. "Product name — Menu 1 Submenu 1"), would misleadingly
  // label every page of a printed multi-menu document the same way. Swap
  // to a generic title only while actually printing, then restore whatever
  // was showing right before — captured live at print time (not frozen at
  // page load) so it's still correct after a brand/lang switch changes the
  // on-screen title later.
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
  syncPrintFallback(state.layout, state.lang);
  enableSoftNavigation();

  // The browser's native "scroll to #hash on load" runs before the header/
  // nav partials (and, in layout 5, the rest of the manual) are injected
  // above, so the anchor can drift out of view once that content lands.
  // Re-apply it now that layout has settled. An explicit #hash (a specific
  // topic) wins; otherwise, in scroll layout, the page actually requested
  // (e.g. loading submenu1.html directly) acts as an implicit anchor —
  // without this, landing on a submenu with no #hash would silently show
  // chapter 1's intro instead of the submenu you asked for. Only done on
  // the initial load, never while toggling layout/brand/lang afterwards —
  // that shouldn't yank the visitor away from wherever they're reading.
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
    syncPrintFallback(state.layout, state.lang);
  }

  if (brandSelect) {
    // Only swaps theme/logo/favicon — deliberately leaves the current
    // layout choice alone. BRANDS[id].layout is still used as that brand's
    // *default* the very first time a visitor arrives with nothing in
    // localStorage yet (see js/state.js resolveState()); once someone has
    // actually picked a layout, switching brands shouldn't yank it out from
    // under them.
    brandSelect.addEventListener('change', (e) => {
      refresh({ brand: e.target.value });
    });
  }
  if (langSelect) {
    // Page content is a real, separate HTML file per language (see
    // js/nav-config.js langPath/langs), but that doesn't mean switching
    // languages has to be a real page load — fetchLocalizedHTML() gets
    // this page's content in the new language (its own translated file, or
    // the default-language fallback if it's not translated yet) the same
    // way a nav-link soft nav does, updating the URL via history without a
    // reload. 'scroll' layout needs the whole manual recomposed (every
    // chapter in the new language), not just one page swapped, so it goes
    // through applyLayoutContent() instead of a plain innerHTML swap.
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
      syncPrintFallback(state.layout, lang);
      buildSearchIndex(nav, lang); // warm the new language's index in the background
    });
  }
  if (layoutSelect) {
    layoutSelect.addEventListener('change', (e) => refresh({ layout: e.target.value }));
  }

  // Full-manual search (js/search.js) — searches every page's actual
  // content, not just whichever menu/submenu is currently open, and works
  // the same way in all 4 layouts. Warmed in the background now (not
  // awaited — a visitor who never searches shouldn't wait on it) so the
  // first keystroke usually already has a resolved index to search instead
  // of waiting on a fetch per page.
  buildSearchIndex(nav, state.lang);

  const searchInput = document.getElementById('search-input');
  const searchResultsEl = document.getElementById('search-results');
  let searchDebounce = null;

  function closeSearchResults() {
    if (searchResultsEl) searchResultsEl.hidden = true;
  }

  function renderSearchResults(results, hasQuery) {
    if (!searchResultsEl) return;
    searchResultsEl.innerHTML = '';
    if (!hasQuery) {
      searchResultsEl.hidden = true;
      return;
    }
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = (currentTranslations && currentTranslations['search.noResults']) || 'No results found.';
      searchResultsEl.appendChild(empty);
      searchResultsEl.hidden = false;
      return;
    }
    for (const r of results) {
      const a = document.createElement('a');
      a.className = 'search-result';
      a.href = r.url + (r.anchor ? `#${r.anchor}` : '');

      const pageLabel = document.createElement('span');
      pageLabel.className = 'search-result-page';
      pageLabel.textContent = r.pageTitle;
      a.appendChild(pageLabel);

      if (r.heading !== r.pageTitle) {
        const headingLabel = document.createElement('span');
        headingLabel.className = 'search-result-heading';
        headingLabel.textContent = r.heading;
        a.appendChild(headingLabel);
      }

      if (r.snippet) {
        const snippet = document.createElement('span');
        snippet.className = 'search-result-snippet';
        snippet.textContent = r.snippet;
        a.appendChild(snippet);
      }

      a.addEventListener('click', (e) => {
        e.preventDefault();
        closeSearchResults();
        if (searchInput) searchInput.value = '';
        if (state.layout === 'scroll') {
          // The whole manual is already composed on this one page — just
          // scroll to the matched heading, no navigation needed.
          const target = document.getElementById(r.anchor || r.pageId);
          if (target) target.scrollIntoView({ behavior: 'smooth' });
        } else {
          // Same soft-navigation every other in-manual link already uses —
          // no reload, chrome stays put.
          softNavigateTo(new URL(a.href), { push: true, hash: r.anchor ? `#${r.anchor}` : '' });
        }
      });
      searchResultsEl.appendChild(a);
    }
    searchResultsEl.hidden = false;
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      const query = searchInput.value;
      searchDebounce = setTimeout(async () => {
        const records = await buildSearchIndex(nav, state.lang);
        renderSearchResults(searchIndex(records, query), query.trim().length > 0);
      }, 150);
    });
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim() && searchResultsEl && searchResultsEl.childElementCount) {
        searchResultsEl.hidden = false;
      }
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        closeSearchResults();
        searchInput.blur();
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-control')) closeSearchResults();
    });
  }

  return state;
}
