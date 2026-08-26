// Brand/language/layout are primarily remembered via localStorage, not the
// URL. Earlier this template kept them in `?brand=&lang=&layout=` and
// synced it on every change — but that meant EVERY internal link had to
// carry that query string forward, and it was easy to miss one (that's
// exactly what shipped: nav links didn't carry it, so the next page fell
// back to defaults and silently "changed" the layout on the user). Reading
// from localStorage instead means any link works correctly by construction
// — there's nothing to remember to thread through.
//
// The one case that still needs the URL: an external product linking
// straight into a specific brand/language (see README "Deep-linking"),
// where there is no prior localStorage to read. A query param present on
// load wins for that load and is persisted, so it keeps applying for the
// rest of the visit without repeating it in every link.
import { BRANDS, DEFAULT_BRAND, LAYOUTS, DEFAULT_LAYOUT, LANGS, DEFAULT_LANG } from './brands-config.js';

export const STORAGE_KEYS = { brand: 'manual-brand', lang: 'manual-lang', layout: 'manual-layout' };

function readField(params, key, storageKey, allowed, fallback) {
  const fromUrl = params.get(key);
  if (fromUrl && allowed.includes(fromUrl)) return fromUrl;
  const fromStorage = localStorage.getItem(storageKey);
  if (fromStorage && allowed.includes(fromStorage)) return fromStorage;
  return fallback;
}

export function resolveState(params = new URLSearchParams(window.location.search)) {
  const brand = readField(params, 'brand', STORAGE_KEYS.brand, Object.keys(BRANDS), DEFAULT_BRAND);
  const lang = readField(params, 'lang', STORAGE_KEYS.lang, LANGS, DEFAULT_LANG);
  const layoutFallback = (BRANDS[brand] && BRANDS[brand].layout) || DEFAULT_LAYOUT;
  const layout = readField(params, 'layout', STORAGE_KEYS.layout, LAYOUTS, layoutFallback);
  return { brand, lang, layout };
}

export function persistState(state) {
  localStorage.setItem(STORAGE_KEYS.brand, state.brand);
  localStorage.setItem(STORAGE_KEYS.lang, state.lang);
  localStorage.setItem(STORAGE_KEYS.layout, state.layout);
}
