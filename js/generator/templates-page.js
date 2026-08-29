// Orchestrates templates.html — browsing the ready-made brand/layout
// combinations, in its own tab so the custom-manual builder's form state is
// never touched.
import { BRANDS, DEFAULT_BRAND, LAYOUTS, DEFAULT_LAYOUT } from '../theme/brands-config.js';
import { setPreviewSrc, hidePreviewChromeSelectors } from './theme/preview.js';
import { applyGeneratorTranslations } from './i18n.js';
import { renderSiteFooter } from './site-footer.js';

const GENERATOR_LANG_KEY = 'generator-lang';

renderSiteFooter();

const iframe = document.getElementById('templates-preview-frame');
const brandSelect = document.getElementById('templates-brand');
const layoutSelect = document.getElementById('templates-layout');

for (const [id, brand] of Object.entries(BRANDS)) {
  brandSelect.appendChild(new Option(brand.label, id));
}
for (const layout of LAYOUTS) {
  layoutSelect.appendChild(new Option(layout, layout));
}
brandSelect.value = DEFAULT_BRAND;
layoutSelect.value = DEFAULT_LAYOUT;

function refreshPreview() {
  setPreviewSrc(iframe, { brand: brandSelect.value, layout: layoutSelect.value });
}
brandSelect.addEventListener('change', refreshPreview);
layoutSelect.addEventListener('change', refreshPreview);
iframe.addEventListener('load', () => hidePreviewChromeSelectors(iframe));

refreshPreview();

const initialLang = localStorage.getItem(GENERATOR_LANG_KEY) || 'en';
applyGeneratorTranslations(initialLang);
