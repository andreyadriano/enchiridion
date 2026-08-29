// Builds the navigation menu DOM from nav-config.json and marks the current
// page's entry active. In 'scroll' layout every entry links to an in-page
// anchor instead of a separate URL (js/content/continuous-manual.js composes the
// whole manual onto one page).
import { resolvePath, langPath, isSamePage } from './nav-config.js';

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
    a.href = resolvePath(langPath(item, lang));
    if (isSamePage(item, window.location.pathname)) {
      a.classList.add('is-active');
      a.setAttribute('aria-current', 'page');
    }
  }
  return a;
}

// 'hybrid' layout: the top bar shows only top-level menus; the active
// chapter's children render into a separate `sidebarRoot` element instead
// (a real DOM node under `.layout-shell`, not nested in `topbarRoot` — CSS
// Grid can't size a `display: contents` grandchild that spans columns).
function renderHybridTree(topbarRoot, sidebarRoot, nav, translations, { activeChapterId, lang }) {
  const topList = document.createElement('ul');
  topList.className = 'nav-list';
  for (const item of nav) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    const link = buildLink(item, translations, { layout: 'hybrid', lang });
    // Active while browsing any of its submenu pages too, not just its own.
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
    const link = buildLink(item, translations, linkOptions);
    li.appendChild(link);

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

      // Only the navbar layout opens this as a hover/focus popup — the
      // other layouts render the sublist inline and always visible, so
      // there's no expanded/collapsed state worth announcing there.
      if (layout === 'navbar') {
        link.setAttribute('aria-haspopup', 'true');
        link.setAttribute('aria-expanded', 'false');
        const open = () => link.setAttribute('aria-expanded', 'true');
        const close = () => link.setAttribute('aria-expanded', 'false');
        li.addEventListener('mouseenter', open);
        li.addEventListener('mouseleave', close);
        li.addEventListener('focusin', open);
        li.addEventListener('focusout', (e) => {
          if (!li.contains(e.relatedTarget)) close();
        });
      }
    }
    list.appendChild(li);
  }
  root.appendChild(list);
}
