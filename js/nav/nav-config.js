// Loads and resolves the manual's menu structure from nav-config.json (the
// single source of truth — see that file).
import { DEFAULT_LANG, LANGS } from '../theme/brands-config.js';

// Derived from this module's own URL rather than hard-coded, so path
// resolution still works whether the site is deployed at a domain root or a
// sub-path.
export const ROOT_URL = new URL('../../', import.meta.url).href;

export function resolvePath(path) {
  return new URL(path, ROOT_URL).href;
}

let navCache = null;

export async function loadNav() {
  if (navCache) return navCache;
  const res = await fetch(resolvePath('nav-config.json'));
  if (!res.ok) throw new Error(`Could not load nav-config.json (${res.status})`);
  navCache = await res.json();
  return navCache;
}

// Resolves `pages/{lang}/menu1/index.html` against whether `item.langs`
// (declared in nav-config.json, not probed at runtime) actually has that
// language's folder populated, falling back to DEFAULT_LANG otherwise.
export function langPath(item, lang) {
  const supported = lang && (lang === DEFAULT_LANG || (item.langs || []).includes(lang));
  return item.path.replace('{lang}', supported ? lang : DEFAULT_LANG);
}

// Matches the per-language top-level folder in a resolved page path, e.g.
// `/pages/pt/menu1/index.html` -> captures `pt`.
const LANG_SEGMENT_RE = new RegExp(`(/pages/)(${LANGS.join('|')})(/)`);

// Normalizes a live `location.pathname` to its default-language equivalent,
// so a translated page still matches the same nav item as its English
// counterpart. Also tolerates the URL shapes a static host's own routing
// may produce (Cloudflare Pages redirects `/foo.html` -> `/foo` and
// `/dir/index.html` -> `/dir/`).
export function canonicalizePagePath(pathname) {
  let p = pathname;
  if (p.endsWith('/')) {
    p += 'index.html';
  } else if (!/\.[a-z0-9]+$/i.test(p)) {
    p += '.html';
  }
  return p.replace(LANG_SEGMENT_RE, `$1${DEFAULT_LANG}$3`);
}

// Trusts langPath()'s manifest-driven fallback instead of probing-then
// falling-back on a 404 — a failed fetch() still logs a network error even
// when caught, which would spam every page composing the whole manual.
export async function fetchLocalizedHTML(item, lang) {
  const path = langPath(item, lang);
  const res = await fetch(resolvePath(path));
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.text();
}

export function flattenNav(nav) {
  const out = [];
  for (const item of nav) {
    out.push(item);
    if (item.children) out.push(...item.children);
  }
  return out;
}

// True if `pathname` is the page for `item`, regardless of language. Also
// used by js/nav/nav-render.js's active-link highlighting.
export function isSamePage(item, pathname) {
  const target = new URL(resolvePath(langPath(item, DEFAULT_LANG))).pathname;
  return target === canonicalizePagePath(pathname);
}

// Finds which nav item `pathname` is, and its top-level menu ("chapter").
export function findNavContext(nav, pathname) {
  for (const top of nav) {
    if (isSamePage(top, pathname)) return { chapter: top, item: top };
    for (const child of top.children || []) {
      if (isSamePage(child, pathname)) return { chapter: top, item: child };
    }
  }
  return null;
}
