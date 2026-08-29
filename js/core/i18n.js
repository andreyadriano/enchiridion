// Loads i18n/<lang>.json and overlays every [data-i18n] element's text on
// top of the HTML's own fallback copy — no page reload.
import { resolvePath } from '../nav/nav-config.js';

const cache = {};
let manualConfigPromise = null;

// manual-config.json holds language-independent facts about the manual
// itself (currently just the document version) — a single value shared by
// every language dict, instead of the same key copied into each one.
function loadManualConfig() {
  if (!manualConfigPromise) {
    manualConfigPromise = fetch(resolvePath('manual-config.json')).then((res) => (res.ok ? res.json() : {}));
  }
  return manualConfigPromise;
}

async function loadDictionary(lang) {
  if (cache[lang]) return cache[lang];
  const [manualConfig, res] = await Promise.all([loadManualConfig(), fetch(resolvePath(`i18n/${lang}.json`))]);
  if (!res.ok) throw new Error(`Could not load i18n/${lang}.json (${res.status})`);
  const langDict = await res.json();
  const dict = { ...manualConfig, ...langDict };
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
