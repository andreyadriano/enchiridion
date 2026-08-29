// Brand/language/layout are remembered via localStorage, not the URL — a
// `?brand=&lang=&layout=` query string would need every internal link to
// carry it forward, and a missed one silently resets it. The one exception:
// a query param present on load (e.g. an external deep link) wins for that
// load and gets persisted, so it applies for the rest of the visit.
import { BRANDS, DEFAULT_BRAND, LAYOUTS, DEFAULT_LAYOUT, LANGS, DEFAULT_LANG } from '../theme/brands-config.js';

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
