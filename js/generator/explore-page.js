import { PRESETS } from './presets.js';
import { applyGeneratorTranslations } from './i18n.js';
import { renderSiteFooter } from './site-footer.js';

const GENERATOR_LANG_KEY = 'generator-lang';

renderSiteFooter();

const grid = document.getElementById('explore-grid');
const langSelector = document.getElementById('generator-lang-selector');

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function liveHref(preset, lang) {
  return `../pages/${lang}/menu1/index.html?brand=${preset.id}&layout=${preset.layout}&lang=${lang}`;
}

function buildCard(preset) {
  const card = document.createElement('article');
  card.className = 'explore-card';
  card.dataset.presetId = preset.id;

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

  const body = document.createElement('div');
  body.className = 'explore-card-body';
  body.innerHTML = `
    <div class="explore-card-heading">
      <h2 data-i18n="${preset.labelKey}"></h2>
      <span class="explore-card-layout-badge">${capitalize(preset.layout)} layout</span>
    </div>
    <p class="explore-card-blurb" data-i18n="${preset.blurbKey}"></p>
    <div class="explore-card-actions">
      <a class="explore-card-cta explore-card-cta-live" data-i18n="generator.explore.cta.live"
         href="${liveHref(preset, 'en')}" target="_blank" rel="noopener">See it live</a>
      <a class="explore-card-cta explore-card-cta-base" data-i18n="generator.explore.cta.useBase"
         href="index.html?preset=${preset.id}">Use as a starting point</a>
    </div>
  `;

  card.appendChild(swatch);
  card.appendChild(body);
  return card;
}

for (const preset of PRESETS) {
  grid.appendChild(buildCard(preset));
}

function updateLiveLinks(lang) {
  for (const preset of PRESETS) {
    const card = grid.querySelector(`[data-preset-id="${preset.id}"]`);
    const link = card && card.querySelector('.explore-card-cta-live');
    if (link) link.setAttribute('href', liveHref(preset, lang));
  }
}

async function setLang(lang) {
  await applyGeneratorTranslations(lang);
  updateLiveLinks(lang);
  localStorage.setItem(GENERATOR_LANG_KEY, lang);
}

langSelector.addEventListener('change', () => setLang(langSelector.value));

const initialLang = localStorage.getItem(GENERATOR_LANG_KEY) || 'en';
langSelector.value = initialLang;
await setLang(initialLang);
