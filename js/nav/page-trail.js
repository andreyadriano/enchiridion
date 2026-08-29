// Renders a breadcrumb trail and prev/next chapter links around the page's
// own content — both derived from the same nav tree already driving the
// sidebar, so they can never drift out of sync with the real menu. Skipped
// in 'scroll' layout: the whole manual is already one continuous page
// there, so neither "where am I" nor "what's next" needs its own control.
import { resolvePath, langPath, flattenNav } from './nav-config.js';

function buildCrumbNode(text, href) {
  if (!href) {
    const span = document.createElement('span');
    span.className = 'breadcrumb-current';
    span.setAttribute('aria-current', 'page');
    span.textContent = text;
    return span;
  }
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

function buildBreadcrumb(nav, ctx, t, lang) {
  const nav_ = document.createElement('nav');
  nav_.id = 'page-breadcrumb';
  nav_.className = 'page-breadcrumb';
  nav_.setAttribute('aria-label', 'Breadcrumb');

  const list = document.createElement('ol');
  list.className = 'breadcrumb-list';

  const onChapterPage = ctx.chapter.id === ctx.item.id;

  const homeLi = document.createElement('li');
  homeLi.appendChild(buildCrumbNode(t['product.name'] || 'Home', resolvePath(langPath(nav[0], lang))));
  list.appendChild(homeLi);

  const chapterLi = document.createElement('li');
  const chapterLabel = t[ctx.chapter.labelKey] || ctx.chapter.labelKey;
  chapterLi.appendChild(buildCrumbNode(chapterLabel, onChapterPage ? null : resolvePath(langPath(ctx.chapter, lang))));
  list.appendChild(chapterLi);

  if (!onChapterPage) {
    const itemLi = document.createElement('li');
    itemLi.appendChild(buildCrumbNode(t[ctx.item.labelKey] || ctx.item.labelKey, null));
    list.appendChild(itemLi);
  }

  nav_.appendChild(list);
  return nav_;
}

function buildPagerLink(item, t, labelKey, fallbackLabel, className, lang) {
  const a = document.createElement('a');
  a.className = `page-pager-link ${className}`;
  a.href = resolvePath(langPath(item, lang));
  const label = document.createElement('span');
  label.className = 'page-pager-label';
  label.textContent = t[labelKey] || fallbackLabel;
  const title = document.createElement('span');
  title.className = 'page-pager-title';
  title.textContent = t[item.labelKey] || item.labelKey;
  a.appendChild(label);
  a.appendChild(title);
  return a;
}

function buildPager(nav, ctx, t, lang) {
  const flat = flattenNav(nav);
  const idx = flat.findIndex((item) => item.id === ctx.item.id);
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx > -1 && idx < flat.length - 1 ? flat[idx + 1] : null;
  if (!prev && !next) return null;

  const pagerNav = document.createElement('nav');
  pagerNav.id = 'page-pager';
  pagerNav.className = 'page-pager';
  pagerNav.setAttribute('aria-label', 'Chapter navigation');

  if (prev) {
    pagerNav.appendChild(buildPagerLink(prev, t, 'pager.prev', 'Previous', 'page-pager-prev', lang));
  } else {
    const spacer = document.createElement('span');
    spacer.className = 'page-pager-spacer';
    pagerNav.appendChild(spacer);
  }
  if (next) pagerNav.appendChild(buildPagerLink(next, t, 'pager.next', 'Next', 'page-pager-next', lang));

  return pagerNav;
}

export function renderPageTrail(contentRoot, nav, ctx, layout, translations, lang) {
  const oldCrumb = document.getElementById('page-breadcrumb');
  if (oldCrumb) oldCrumb.remove();
  const oldPager = document.getElementById('page-pager');
  if (oldPager) oldPager.remove();

  if (!contentRoot || layout === 'scroll' || !ctx) return;

  const t = translations || {};
  contentRoot.insertBefore(buildBreadcrumb(nav, ctx, t, lang), contentRoot.firstChild);
  const pager = buildPager(nav, ctx, t, lang);
  if (pager) contentRoot.appendChild(pager);
}
