// Builds the navigation menu DOM from nav-config.json (see js/nav-config.js)
// and marks the current page's entry active. Layout ('sidebar' | 'navbar' |
// 'scroll' | 'hybrid') mostly only changes which CSS class is applied to the
// <nav> root — the CSS in css/layout-*.css does the rest (fixed column vs.
// horizontal bar with dropdowns) — except 'hybrid', which needs a genuinely
// different DOM shape (see the dedicated branch below).
//
// In 'scroll' layout, js/continuous-manual.js composes the whole manual
// onto the one page the visitor loaded, so every entry here links to an
// in-page anchor instead of a separate URL — clicking any menu or submenu
// just scrolls, no navigation, no reload.
import { resolvePath, langPath, stripLangSuffix } from './nav-config.js';

function isCurrentPage(path) {
  const target = new URL(resolvePath(path)).pathname;
  const current = stripLangSuffix(window.location.pathname);
  return target === current;
}

function buildLink(item, t, { layout, activeItemId, lang } = {}) {
  const a = document.createElement('a');
  a.textContent = t[item.labelKey] || item.labelKey;
  a.setAttribute('data-i18n', item.labelKey);
  a.className = 'nav-link';

  if (layout === 'scroll') {
    a.href = `#${item.id}`;
    if (item.id === activeItemId) {
      a.classList.add('is-active');
      a.setAttribute('aria-current', 'true');
    }
  } else {
    // Links to the current language's own content file (see
    // js/nav-config.js langPath) so browsing the site always stays on
    // pages matching the selected language, with no extra redirect.
    a.href = resolvePath(langPath(item, lang));
    if (isCurrentPage(item.path)) {
      a.classList.add('is-active');
      a.setAttribute('aria-current', 'page');
    }
  }
  return a;
}

// 'hybrid' layout: the top bar shows only the top-level menus (no dropdown
// submenus), and whichever one the visitor is currently "inside" (its own
// page, or any of its submenu pages) shows its children as a separate
// contextual sidebar instead. These two pieces need to be positioned
// independently by CSS Grid — one full-width above, one a docked column
// beside the main content below — which doesn't work reliably if they're
// both nested inside the one shared `<nav id="site-nav">` element (tried
// first: unboxing it with `display: contents` so its children could be
// grid-placed independently resolved their *position* correctly but not
// their *size* — an item meant to span both columns silently collapsed to
// one, a real rendering quirk with `display: contents` grandchildren, not a
// CSS mistake to tune away). So `sidebarRoot` here is a second, real
// element living directly in `.layout-shell` (created/removed by
// js/page-init.js, not present in the static per-page HTML) — a genuine
// grid item in its own right, no unboxing involved.
function renderHybridTree(topbarRoot, sidebarRoot, nav, translations, { activeChapterId, lang }) {
  const topList = document.createElement('ul');
  topList.className = 'nav-list';
  for (const item of nav) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    const link = buildLink(item, translations, { layout: 'hybrid', lang });
    // A chapter's top-level link should read as "active" while browsing any
    // of its submenu pages too, not only its own exact page — buildLink()'s
    // isCurrentPage() only matches the exact page, so that's added here.
    if (item.id === activeChapterId) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'true');
    }
    li.appendChild(link);
    topList.appendChild(li);
  }
  topbarRoot.appendChild(topList);

  if (!sidebarRoot) return;
  sidebarRoot.innerHTML = '';
  const activeChapter = nav.find((item) => item.id === activeChapterId);
  if (activeChapter && activeChapter.children && activeChapter.children.length) {
    const sublist = document.createElement('ul');
    sublist.className = 'nav-sublist';
    for (const child of activeChapter.children) {
      const subLi = document.createElement('li');
      subLi.className = 'nav-subitem';
      subLi.appendChild(buildLink(child, translations, { layout: 'hybrid', lang }));
      sublist.appendChild(subLi);
    }
    sidebarRoot.appendChild(sublist);
  }
}

export function renderSiteTree(root, nav, layout, translations, navContext) {
  root.innerHTML = '';
  root.className = `nav-tree nav-tree--${layout}`;

  if (layout === 'hybrid') {
    renderHybridTree(root, navContext && navContext.hybridSidebarRoot, nav, translations, {
      activeChapterId: navContext && navContext.activeChapterId,
      lang: navContext && navContext.lang,
    });
    return;
  }

  const list = document.createElement('ul');
  list.className = 'nav-list';
  const linkOptions = {
    layout,
    activeItemId: navContext && navContext.activeItemId,
    lang: navContext && navContext.lang,
  };

  for (const item of nav) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.appendChild(buildLink(item, translations, linkOptions));

    if (item.children && item.children.length) {
      const sublist = document.createElement('ul');
      sublist.className = 'nav-sublist';
      for (const child of item.children) {
        const subLi = document.createElement('li');
        subLi.className = 'nav-subitem';
        subLi.appendChild(buildLink(child, translations, linkOptions));
        sublist.appendChild(subLi);
      }
      li.appendChild(sublist);
    }
    list.appendChild(li);
  }
  root.appendChild(list);
}
