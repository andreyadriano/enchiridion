// Orchestrates generator/index.html — the custom-manual builder (form +
// live preview iframe, side by side). Browsing ready-made templates lives
// on its own page (templates.html) so it never touches this one.
import { LAYOUTS, DEFAULT_LAYOUT } from '../theme/brands-config.js';
import {
  setPreviewSrc,
  applyCustomTheme,
  applyCustomLogo,
  applyCustomFavicon,
  applyProductName,
  applyCustomFontFaces,
  hidePreviewChromeSelectors,
  filterPreviewLanguages,
  waitForPreviewReady,
} from './theme/preview.js';
import { buildManualZip } from './package/build-package.js';
import { applyGeneratorTranslations } from './i18n.js';
import { renderSiteFooter } from './site-footer.js';
import { readFileAsDataUrl, dataUrlToFile, slugify } from '../utils/file-utils.js';
import { FONT_STACKS, CUSTOM_FONT_VALUE, CUSTOM_HEADING_FAMILY, CUSTOM_BODY_FAMILY, renderFontSelect, fontCssValue } from './theme/font-fields.js';
import { buildComponentColorRows, reseedAutoComponentColors, currentComponentColors, restoreComponentColors, resetComponentColorsToAuto } from './theme/component-colors.js';
import { contrastRatio, WCAG_AA_TEXT_MIN } from './theme/contrast.js';
import { interceptPdfLinks } from './pdf-export.js';
import { findPreset } from './presets.js';

renderSiteFooter();

const GENERATOR_LANG_KEY = 'generator-lang';
const SAVE_KEY = 'generator-saved-manual';

const DEFAULTS = {
  productName: 'My Product',
  colors: { primary: '#2b6cb0', secondary: '#edf2f7', text: '#1a202c', bg: '#ffffff' },
  borderRadius: '4px',
};

const iframe = document.getElementById('preview-frame');
let currentDict = {};

// ---------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------
const langSelector = document.getElementById('generator-lang-selector');

const fontHeadingSelect = document.getElementById('custom-font-heading');
const fontBodySelect = document.getElementById('custom-font-body');
const fontHeadingFileInput = document.getElementById('custom-font-heading-file');
const fontBodyFileInput = document.getElementById('custom-font-body-file');

const layoutGroup = document.getElementById('custom-layout-group');

const colorInputs = {
  primary: document.getElementById('custom-color-primary'),
  secondary: document.getElementById('custom-color-secondary'),
  text: document.getElementById('custom-color-text'),
  bg: document.getElementById('custom-color-bg'),
};
const borderRadiusSelect = document.getElementById('custom-border-radius');
const contrastWarningEl = document.getElementById('contrast-warning');
const productNameInput = document.getElementById('custom-product-name');
const logoInput = document.getElementById('custom-logo');
const faviconInput = document.getElementById('custom-favicon');
const langPtCheckbox = document.getElementById('custom-lang-pt');
const langEsCheckbox = document.getElementById('custom-lang-es');

const advancedColorsGrid = document.getElementById('advanced-colors-grid');
const componentColors = buildComponentColorRows(advancedColorsGrid, colorInputs, () => refreshPreviewTheme());

const saveButton = document.getElementById('save-progress');
const resetButton = document.getElementById('reset-defaults');
const saveStatusEl = document.getElementById('save-status');

const customForm = document.getElementById('custom-form');
const downloadButton = document.getElementById('custom-download');
const statusEl = document.getElementById('custom-status');

// logoFile/faviconFile back buildManualZip (needs bytes + name); the parallel
// logoDataUrl/faviconDataUrl back the live preview and the PDF export payload.
let customFonts = { heading: null, body: null }; // { file, dataUrl } | null, per slot
let logoFile = null;
let faviconFile = null;
let logoDataUrl = null;
let faviconDataUrl = null;

// Translates this TOOL's own chrome, not the manual being built (which has
// its own separate language checkboxes below).
async function setGeneratorLang(lang, { persist = true } = {}) {
  currentDict = await applyGeneratorTranslations(lang);
  renderFontSelect(fontHeadingSelect, currentDict);
  renderFontSelect(fontBodySelect, currentDict);
  if (persist) localStorage.setItem(GENERATOR_LANG_KEY, lang);
  return currentDict;
}

langSelector.addEventListener('change', () => setGeneratorLang(langSelector.value));

// ---------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------
fontHeadingSelect.addEventListener('change', () => {
  fontHeadingFileInput.hidden = fontHeadingSelect.value !== CUSTOM_FONT_VALUE;
  refreshPreviewTheme();
});
fontBodySelect.addEventListener('change', () => {
  fontBodyFileInput.hidden = fontBodySelect.value !== CUSTOM_FONT_VALUE;
  refreshPreviewTheme();
});
fontHeadingFileInput.addEventListener('change', async () => {
  const file = fontHeadingFileInput.files[0];
  if (!file) return;
  customFonts.heading = { file, dataUrl: await readFileAsDataUrl(file) };
  refreshPreviewTheme();
});
fontBodyFileInput.addEventListener('change', async () => {
  const file = fontBodyFileInput.files[0];
  if (!file) return;
  customFonts.body = { file, dataUrl: await readFileAsDataUrl(file) };
  refreshPreviewTheme();
});

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------
for (const layout of LAYOUTS) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'custom-layout';
  input.value = layout;
  if (layout === DEFAULT_LAYOUT) input.checked = true;
  label.appendChild(input);
  label.appendChild(document.createTextNode(layout));
  layoutGroup.appendChild(label);
}

function currentCustomLayout() {
  const checked = layoutGroup.querySelector('input[name="custom-layout"]:checked');
  return checked ? checked.value : DEFAULT_LAYOUT;
}

function selectLayout(layout) {
  const radio = layoutGroup.querySelector(`input[value="${layout}"]`);
  if (radio) radio.checked = true;
}

// A layout change needs a real reload — the iframe 'load' listener below
// re-applies every other override once it's ready.
layoutGroup.addEventListener('change', () => {
  setPreviewSrc(iframe, { brand: 'generic', layout: currentCustomLayout() });
});

function currentLangs() {
  return ['en', ...(langPtCheckbox.checked ? ['pt'] : []), ...(langEsCheckbox.checked ? ['es'] : [])];
}

function currentTheme() {
  return {
    colors: {
      primary: colorInputs.primary.value,
      secondary: colorInputs.secondary.value,
      text: colorInputs.text.value,
      bg: colorInputs.bg.value,
    },
    componentColors: currentComponentColors(componentColors),
    borderRadius: borderRadiusSelect.value,
    fontHeading: fontCssValue(fontHeadingSelect, CUSTOM_HEADING_FAMILY, customFonts.heading),
    fontBody: fontCssValue(fontBodySelect, CUSTOM_BODY_FAMILY, customFonts.body),
  };
}

function currentFontFaces() {
  return [
    { family: CUSTOM_HEADING_FAMILY, dataUrl: customFonts.heading && customFonts.heading.dataUrl },
    { family: CUSTOM_BODY_FAMILY, dataUrl: customFonts.body && customFonts.body.dataUrl },
  ];
}

function refreshPreviewTheme() {
  applyCustomTheme(iframe, currentTheme());
  applyCustomFontFaces(iframe, currentFontFaces());
}

// Live WCAG check on the two pairings most likely to actually be read as
// text (body copy on the page background, and links/buttons on that same
// background) — not exhaustive, but catches the class of mistake a color
// picker makes easy: a brand color that looks fine as a swatch but is
// unreadable as text.
function checkContrast() {
  const bg = colorInputs.bg.value;
  const pairs = [
    [colorInputs.text.value, 'generator.contrast.textPair', 'Text on Background'],
    [colorInputs.primary.value, 'generator.contrast.primaryPair', 'Primary on Background'],
  ];
  const failing = pairs
    .map(([color, labelKey, fallbackLabel]) => ({ label: currentDict[labelKey] || fallbackLabel, ratio: contrastRatio(color, bg) }))
    .filter(({ ratio }) => ratio < WCAG_AA_TEXT_MIN);

  if (!failing.length) {
    if (!contrastWarningEl.hidden) contrastWarningEl.hidden = true;
    return;
  }
  const prefix = currentDict['generator.contrast.warning'] || 'Low contrast (WCAG AA needs 4.5:1 or higher):';
  const message = `${prefix} ${failing.map((f) => `${f.label} ${f.ratio.toFixed(1)}:1`).join(' · ')}`;
  // Only touch the DOM (and so only re-announce to a screen reader) when the
  // message actually changed — re-setting identical text every 400ms while
  // the user pauses mid-edit would churn the aria-live region for nothing.
  if (contrastWarningEl.textContent !== message) contrastWarningEl.textContent = message;
  if (contrastWarningEl.hidden) contrastWarningEl.hidden = false;
}

// Debounced: this updates an aria-live region, and doing that on every
// single keystroke/drag-tick while a native <input type="color"> popup is
// open has been observed to close the popup early (most reliably on Linux
// with a screen reader running) — so it only actually runs once the user
// pauses, not on every tick.
let contrastCheckDebounce = null;
function scheduleContrastCheck() {
  clearTimeout(contrastCheckDebounce);
  contrastCheckDebounce = setTimeout(checkContrast, 400);
}

for (const input of Object.values(colorInputs)) {
  input.addEventListener('input', () => {
    reseedAutoComponentColors(componentColors, colorInputs);
    refreshPreviewTheme();
    scheduleContrastCheck();
  });
}
borderRadiusSelect.addEventListener('change', refreshPreviewTheme);
productNameInput.addEventListener('input', () => applyProductName(iframe, productNameInput.value));
langPtCheckbox.addEventListener('change', () => filterPreviewLanguages(iframe, currentLangs()));
langEsCheckbox.addEventListener('change', () => filterPreviewLanguages(iframe, currentLangs()));

logoInput.addEventListener('change', async () => {
  const file = logoInput.files[0];
  if (!file) return;
  logoFile = file;
  logoDataUrl = await readFileAsDataUrl(file);
  applyCustomLogo(iframe, logoDataUrl);
});

faviconInput.addEventListener('change', async () => {
  const file = faviconInput.files[0];
  if (!file) return;
  faviconFile = file;
  faviconDataUrl = await readFileAsDataUrl(file);
  applyCustomFavicon(iframe, faviconDataUrl);
});

function buildPreviewOverridePayload() {
  return {
    theme: currentTheme(),
    fontFaces: currentFontFaces().filter((f) => f.dataUrl),
    logoDataUrl,
    faviconDataUrl,
    productName: productNameInput.value.trim() || 'My Product',
  };
}

// waitForPreviewReady() guards against js/core/page-init.js's own async init
// still being mid-flight when 'load' fires, which would otherwise clobber
// the logo/product-name set here.
function applyAllOverrides() {
  const doc = iframe.contentDocument;
  hidePreviewChromeSelectors(iframe);
  interceptPdfLinks(doc, buildPreviewOverridePayload);
  waitForPreviewReady(iframe).then(() => {
    refreshPreviewTheme();
    if (logoDataUrl) applyCustomLogo(iframe, logoDataUrl);
    if (faviconDataUrl) applyCustomFavicon(iframe, faviconDataUrl);
    applyProductName(iframe, productNameInput.value);
    filterPreviewLanguages(iframe, currentLangs());
  });
}

iframe.addEventListener('load', applyAllOverrides);

// "Save" snapshots every field, including uploaded files as data URLs, into
// localStorage; the initial paint below restores it automatically and
// silently on return. "Restore default" wipes the save and resets the form.
function serializeState() {
  return {
    version: 1,
    productName: productNameInput.value,
    colors: {
      primary: colorInputs.primary.value,
      secondary: colorInputs.secondary.value,
      text: colorInputs.text.value,
      bg: colorInputs.bg.value,
    },
    componentColors: currentComponentColors(componentColors),
    borderRadius: borderRadiusSelect.value,
    fontHeadingValue: fontHeadingSelect.value,
    fontBodyValue: fontBodySelect.value,
    customFontHeading: customFonts.heading
      ? { dataUrl: customFonts.heading.dataUrl, fileName: customFonts.heading.file.name, mimeType: customFonts.heading.file.type }
      : null,
    customFontBody: customFonts.body
      ? { dataUrl: customFonts.body.dataUrl, fileName: customFonts.body.file.name, mimeType: customFonts.body.file.type }
      : null,
    logo: logoFile ? { dataUrl: logoDataUrl, fileName: logoFile.name, mimeType: logoFile.type } : null,
    favicon: faviconFile ? { dataUrl: faviconDataUrl, fileName: faviconFile.name, mimeType: faviconFile.type } : null,
    layout: currentCustomLayout(),
    langPt: langPtCheckbox.checked,
    langEs: langEsCheckbox.checked,
  };
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState()));
    saveStatusEl.textContent = currentDict['generator.save.savedStatus'] || 'Saved.';
  } catch (err) {
    console.error(err);
    saveStatusEl.textContent = currentDict['generator.save.errorStorage'] || 'Could not save.';
  }
}
saveButton.addEventListener('click', saveProgress);

async function restoreState(data) {
  if (data.productName !== undefined) productNameInput.value = data.productName;
  if (data.colors) {
    for (const key of Object.keys(colorInputs)) {
      if (data.colors[key]) colorInputs[key].value = data.colors[key];
    }
  }
  if (data.borderRadius) borderRadiusSelect.value = data.borderRadius;

  if (data.fontHeadingValue) {
    fontHeadingSelect.value = data.fontHeadingValue;
    fontHeadingFileInput.hidden = data.fontHeadingValue !== CUSTOM_FONT_VALUE;
  }
  if (data.fontBodyValue) {
    fontBodySelect.value = data.fontBodyValue;
    fontBodyFileInput.hidden = data.fontBodyValue !== CUSTOM_FONT_VALUE;
  }
  if (data.customFontHeading) {
    const file = await dataUrlToFile(data.customFontHeading.dataUrl, data.customFontHeading.fileName, data.customFontHeading.mimeType);
    customFonts.heading = { file, dataUrl: data.customFontHeading.dataUrl };
  }
  if (data.customFontBody) {
    const file = await dataUrlToFile(data.customFontBody.dataUrl, data.customFontBody.fileName, data.customFontBody.mimeType);
    customFonts.body = { file, dataUrl: data.customFontBody.dataUrl };
  }

  if (data.logo) {
    logoFile = await dataUrlToFile(data.logo.dataUrl, data.logo.fileName, data.logo.mimeType);
    logoDataUrl = data.logo.dataUrl;
  }
  if (data.favicon) {
    faviconFile = await dataUrlToFile(data.favicon.dataUrl, data.favicon.fileName, data.favicon.mimeType);
    faviconDataUrl = data.favicon.dataUrl;
  }

  if (data.layout) selectLayout(data.layout);
  langPtCheckbox.checked = !!data.langPt;
  langEsCheckbox.checked = !!data.langEs;

  if (data.componentColors) restoreComponentColors(componentColors, data.componentColors, colorInputs);
}

function resetToDefaults() {
  if (!window.confirm(currentDict['generator.reset.confirm'] || 'Reset every field to its default value?')) return;
  localStorage.removeItem(SAVE_KEY);

  productNameInput.value = DEFAULTS.productName;
  for (const key of Object.keys(colorInputs)) colorInputs[key].value = DEFAULTS.colors[key];
  borderRadiusSelect.value = DEFAULTS.borderRadius;

  fontHeadingSelect.value = FONT_STACKS[0].value;
  fontBodySelect.value = FONT_STACKS[0].value;
  fontHeadingFileInput.hidden = true;
  fontBodyFileInput.hidden = true;
  fontHeadingFileInput.value = '';
  fontBodyFileInput.value = '';
  customFonts = { heading: null, body: null };

  logoInput.value = '';
  faviconInput.value = '';
  logoFile = null;
  faviconFile = null;
  logoDataUrl = null;
  faviconDataUrl = null;

  langPtCheckbox.checked = false;
  langEsCheckbox.checked = false;
  selectLayout(DEFAULT_LAYOUT);
  resetComponentColorsToAuto(componentColors, colorInputs);

  setPreviewSrc(iframe, { brand: 'generic', layout: DEFAULT_LAYOUT });
  saveStatusEl.textContent = '';
}
resetButton.addEventListener('click', resetToDefaults);

function applyPreset(preset, { reloadPreview = true } = {}) {
  if (!preset) return;
  for (const key of Object.keys(colorInputs)) colorInputs[key].value = preset.colors[key];
  borderRadiusSelect.value = preset.borderRadius;

  fontHeadingSelect.value = preset.fontHeading;
  fontBodySelect.value = preset.fontBody;
  fontHeadingFileInput.hidden = true;
  fontBodyFileInput.hidden = true;
  fontHeadingFileInput.value = '';
  fontBodyFileInput.value = '';
  customFonts = { heading: null, body: null };

  if (preset.componentColors) {
    restoreComponentColors(componentColors, preset.componentColors, colorInputs);
  } else {
    resetComponentColorsToAuto(componentColors, colorInputs);
  }
  selectLayout(preset.layout);
  if (reloadPreview) setPreviewSrc(iframe, { brand: 'generic', layout: preset.layout });
}

function validateCustomFonts() {
  if (fontHeadingSelect.value === CUSTOM_FONT_VALUE && !customFonts.heading) {
    return currentDict['generator.status.missingFontHeading'] || 'Please upload a heading font file.';
  }
  if (fontBodySelect.value === CUSTOM_FONT_VALUE && !customFonts.body) {
    return currentDict['generator.status.missingFontBody'] || 'Please upload a body font file.';
  }
  return null;
}

function selectedCustomFonts() {
  return {
    heading: fontHeadingSelect.value === CUSTOM_FONT_VALUE && customFonts.heading
      ? { file: customFonts.heading.file, family: CUSTOM_HEADING_FAMILY }
      : null,
    body: fontBodySelect.value === CUSTOM_FONT_VALUE && customFonts.body
      ? { file: customFonts.body.file, family: CUSTOM_BODY_FAMILY }
      : null,
  };
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

customForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fontError = validateCustomFonts();
  if (fontError) {
    statusEl.textContent = fontError;
    return;
  }

  const productName = productNameInput.value.trim() || 'My Product';

  downloadButton.disabled = true;
  statusEl.textContent = currentDict['generator.status.building'] || 'Building your manual…';
  try {
    const blob = await buildManualZip({
      ...currentTheme(),
      logoFile,
      faviconFile,
      productName,
      layout: currentCustomLayout(),
      langs: currentLangs(),
      customFonts: selectedCustomFonts(),
    });
    triggerBlobDownload(blob, `manual-${slugify(productName)}.zip`);
    statusEl.textContent = currentDict['generator.status.done'] || 'Done — check your downloads folder.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = `${currentDict['generator.status.errorPrefix'] || 'Something went wrong:'} ${err.message}`;
  } finally {
    downloadButton.disabled = false;
  }
});

const initialLang = localStorage.getItem(GENERATOR_LANG_KEY) || 'en';
langSelector.value = initialLang;
await setGeneratorLang(initialLang, { persist: false });

let restoredFromSave = false;
const savedRaw = localStorage.getItem(SAVE_KEY);
if (savedRaw) {
  try {
    await restoreState(JSON.parse(savedRaw));
    restoredFromSave = true;
  } catch (err) {
    console.error('Could not restore saved manual', err);
  }
}

const presetFromUrl = findPreset(new URLSearchParams(location.search).get('preset'));
if (presetFromUrl) applyPreset(presetFromUrl, { reloadPreview: false });

setPreviewSrc(iframe, { brand: 'generic', layout: currentCustomLayout() });

if (presetFromUrl) {
  saveStatusEl.textContent = currentDict['generator.preset.appliedStatus'] || 'Starting point applied — tweak anything below.';
} else if (restoredFromSave) {
  saveStatusEl.textContent = currentDict['generator.save.restoredStatus'] || 'Restored your saved customization.';
}
