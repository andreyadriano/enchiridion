// Loads and resolves the manual's menu structure from nav-config.json (the
// single source of truth — see that file). Used by nav-render.js (on-page
// navigation), print-builder.js (PDF table of contents + chapter order),
// continuous-manual.js (scroll layout / print fallback composition), and
// page-init.js (active-item highlighting).
//
// The structure itself lives in a plain JSON file, not here, so adding or
// translating a page never requires editing a `.js` file — just HTML pages
// plus two JSON files (this one and i18n/*.json), the same pattern a
// non-technical maintainer already uses for everything else. See README
// "Adding a page" / "Adding real translated content".
import { DEFAULT_LANG, LANGS } from './brands-config.js';

// `path` (in nav-config.json) is relative to the project root. To make this
// work regardless of where the site is deployed (domain root or a sub-path,
// e.g. GitHub Pages project sites), every path is resolved against
// ROOT_URL below, which is derived from this module's own URL instead of
// being hard-coded.
export const ROOT_URL = new URL('..', import.meta.url).href;

export function resolvePath(path) {
  return new URL(path, ROOT_URL).href;
}

let navCache = null;

// Fetches nav-config.json once and caches it for the rest of the page's
// lifetime (the structure never changes without a page reload anyway).
export async function loadNav() {
  if (navCache) return navCache;
  const res = await fetch(resolvePath('nav-config.json'));
  if (!res.ok) throw new Error(`Could not load nav-config.json (${res.status})`);
  navCache = await res.json();
  return navCache;
}

// A page's content in a non-default language lives in its own sibling file:
// `index.html` (default/English) -> `index.pt.html` (Portuguese), etc. Which
// languages actually have that file is declared per-item via `langs` in
// nav-config.json (not probed at runtime) — that's what lets nav links point
// straight at the right file instead of guessing and risking a 404.
export function langPath(item, lang) {
  if (!lang || lang === DEFAULT_LANG) return item.path;
  if (!item.langs || !item.langs.includes(lang)) return item.path;
  return item.path.replace(/\.html$/, `.${lang}.html`);
}

// Strips a `.{lang}.html` suffix back to the plain `.html` nav path, so a
// loaded translated file (e.g. index.pt.html) still resolves to the same
// nav item/chapter as its default-language counterpart.
export function stripLangSuffix(pathname) {
  for (const lang of LANGS) {
    if (lang === DEFAULT_LANG) continue;
    const suffix = `.${lang}.html`;
    if (pathname.endsWith(suffix)) return `${pathname.slice(0, -suffix.length)}.html`;
  }
  return pathname;
}

// Fetches a nav item's content file in the given language via langPath()
// above — the default-language file if that item's `langs` doesn't list it,
// its own translated file otherwise. Deliberately trusts the manifest
// instead of probing-then-falling-back on a 404: a failed fetch() still
// logs a network error to the console even when the code catches it, so
// requesting a file only ever known not to exist would spam every page
// that composes the whole manual (scroll layout, PDF, print fallback).
export async function fetchLocalizedHTML(item, lang) {
  const path = langPath(item, lang);
  const res = await fetch(resolvePath(path));
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.text();
}

// Flat list, depth-first, in document order — handy for the PDF builder and
// for "prev/next" style navigation if that's ever added.
export function flattenNav(nav) {
  const out = [];
  for (const item of nav) {
    out.push(item);
    if (item.children) out.push(...item.children);
  }
  return out;
}

function samePage(path, pathname) {
  return new URL(resolvePath(path)).pathname === stripLangSuffix(pathname);
}

// Given the current document's pathname, finds which nav item it is and
// which top-level menu ("chapter") it belongs to. Used by layout 5
// (continuous scroll) to merge a chapter's submenus onto one page.
export function findNavContext(nav, pathname) {
  for (const top of nav) {
    if (samePage(top.path, pathname)) return { chapter: top, item: top };
    for (const child of top.children || []) {
      if (samePage(child.path, pathname)) return { chapter: top, item: child };
    }
  }
  return null;
}
