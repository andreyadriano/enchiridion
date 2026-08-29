// UI-chrome translations for the generator TOOL itself — separate from
// js/i18n.js, which translates the manuals the tool produces.
import { rootUrl } from './paths.js';

const cache = {};

async function loadDictionary(lang) {
  if (cache[lang]) return cache[lang];
  const path = `generator/i18n/${lang}.json`;
  const res = await fetch(rootUrl(path));
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  const dict = await res.json();
  cache[lang] = dict;
  return dict;
}

export async function applyGeneratorTranslations(lang, root = document) {
  const dict = await loadDictionary(lang);
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = dict[el.getAttribute('data-i18n')];
    if (value !== undefined) el.textContent = value;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const [attr, key] = el.getAttribute('data-i18n-attr').split(':');
    const value = dict[key];
    if (value !== undefined) el.setAttribute(attr, value);
  });
  if (root === document) document.documentElement.setAttribute('lang', lang);
  return dict;
}
