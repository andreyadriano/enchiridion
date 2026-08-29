// Orchestrates index.html, the tool's landing page. Shares its UI language
// with generator/index.html and generator/templates.html via one
// localStorage key.
import { applyGeneratorTranslations } from './i18n.js';
import { renderSiteFooter } from './site-footer.js';
import { findPreset } from './presets.js';

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
await setLang(initialLang);

// ---------- hero visual: 3 stacked "manual preview" cards ----------
// Reuses the swatch mockup built for the Explore page (js/generator/
// explore-page.js) — same .explore-card-swatch inner markup, just wrapped
// in a smaller, rotated .hero-card here instead of a grid card there.
const HERO_PRESET_IDS = ['amethyst', 'nocturne', 'coral'];

function buildHeroCard(presetId, index) {
  const preset = findPreset(presetId);
  const card = document.createElement('div');
  card.className = `hero-card hero-card-${index + 1}`;

  const swatch = document.createElement('div');
  swatch.className = 'explore-card-swatch';
  swatch.style.setProperty('--swatch-primary', preset.colors.primary);
  swatch.style.setProperty('--swatch-secondary', preset.colors.secondary);
  swatch.style.setProperty('--swatch-text', preset.colors.text);
  swatch.style.setProperty('--swatch-bg', preset.colors.bg);
  swatch.style.setProperty('--swatch-font', preset.fontHeading);
  swatch.innerHTML = `
    <div class="explore-swatch-header"></div>
    <div class="explore-swatch-body">
      <div class="explore-swatch-nav">
        <span></span><span></span><span></span>
      </div>
      <div class="explore-swatch-content">
        <span class="explore-swatch-line explore-swatch-line-title"></span>
        <span class="explore-swatch-line"></span>
        <span class="explore-swatch-line"></span>
      </div>
    </div>
  `;

  card.appendChild(swatch);
  return card;
}

const heroVisual = document.getElementById('hero-visual');
HERO_PRESET_IDS.forEach((id, index) => heroVisual.appendChild(buildHeroCard(id, index)));

// ---------- feature grid ----------
const FEATURES = [
  {
    key: 'preview',
    icon: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>',
  },
  {
    key: 'looks',
    icon: '<circle cx="12" cy="7" r="3"/><circle cx="6" cy="15" r="3"/><circle cx="18" cy="15" r="3"/>',
  },
  {
    key: 'layouts',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  },
  {
    key: 'langs',
    icon: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"/>',
  },
  {
    key: 'pdf',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9.5 17.5l2-3 2 3M9.5 13h4"/>',
  },
];

function buildFeatureCard({ key, icon }) {
  const card = document.createElement('div');
  card.className = 'feature-card';
  card.innerHTML = `
    <span class="feature-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
    </span>
    <h3 data-i18n="landing.features.${key}.title"></h3>
    <p data-i18n="landing.features.${key}.desc"></p>
  `;
  return card;
}

const featureGrid = document.getElementById('feature-grid');
FEATURES.forEach((feature) => featureGrid.appendChild(buildFeatureCard(feature)));
await applyGeneratorTranslations(initialLang, featureGrid);
