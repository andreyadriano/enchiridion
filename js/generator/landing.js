// Orchestrates index.html, the tool's landing page. Shares its UI language
// with generator/index.html and generator/templates.html via one
// localStorage key.
import { applyGeneratorTranslations } from './i18n.js';
import { renderSiteFooter } from './site-footer.js';

const GENERATOR_LANG_KEY = 'generator-lang';

renderSiteFooter();

const langSelector = document.getElementById('generator-lang-selector');

async function setLang(lang) {
  await applyGeneratorTranslations(lang);
  localStorage.setItem(GENERATOR_LANG_KEY, lang);
}

langSelector.addEventListener('change', () => setLang(langSelector.value));

const initialLang = localStorage.getItem(GENERATOR_LANG_KEY) || 'en';
langSelector.value = initialLang;
await applyGeneratorTranslations(initialLang);
