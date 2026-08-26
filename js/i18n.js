// Loads i18n/<lang>.json and swaps every [data-i18n] element's text —
// no page reload, ever. The HTML already contains real lorem-ipsum copy as
// a fallback (so a page still reads fine before this script runs, or if it
// fails to load), this just overlays the translated strings on top.
import { resolvePath } from './nav-config.js';

const cache = {};

async function loadDictionary(lang) {
  if (cache[lang]) return cache[lang];
  const res = await fetch(resolvePath(`i18n/${lang}.json`));
  if (!res.ok) throw new Error(`Could not load i18n/${lang}.json (${res.status})`);
  const dict = await res.json();
  cache[lang] = dict;
  return dict;
}

export async function applyTranslations(lang) {
  const dict = await loadDictionary(lang);
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = dict[key];
    if (value !== undefined) el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    // Format: data-i18n-attr="placeholder:some.key"
    const [attr, key] = el.getAttribute('data-i18n-attr').split(':');
    const value = dict[key];
    if (value !== undefined) el.setAttribute(attr, value);
  });
  document.documentElement.setAttribute('lang', lang);
  return dict;
}
