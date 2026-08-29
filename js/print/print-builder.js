// Builds the single "everything in one document" source used by print.html,
// then hands it to the Paged.js polyfill to paginate in the browser with
// real page numbers and a resolved table of contents (see css/print.css).
import { BRANDS } from '../theme/brands-config.js';
import { resolveState } from '../core/state.js';
import { applyBrand, applyFavicon } from '../theme/theme-switcher.js';
import { applyTranslations } from '../core/i18n.js';
import { loadNav, flattenNav, resolvePath, fetchLocalizedHTML } from '../nav/nav-config.js';

async function fetchChapterContent(item, lang) {
  const html = await fetchLocalizedHTML(item, lang);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.getElementById('page-content');
}

function buildTocList(items) {
  const list = document.createElement('ul');
  list.className = 'toc-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'toc-entry';
    const a = document.createElement('a');
    a.href = `#chapter-${item.id}`;
    a.setAttribute('data-i18n', item.labelKey);
    a.textContent = item.labelKey;
    li.appendChild(a);
    if (item.children && item.children.length) {
      const sub = buildTocList(item.children);
      sub.classList.remove('toc-list');
      sub.classList.add('toc-sublist');
      li.appendChild(sub);
    }
    list.appendChild(li);
  }
  return list;
}

// Set only by generator/index.html's live preview (?generatorPreview=1, see
// js/generator/pdf-export.js) to reflect in-memory theme/logo/font state
// that was never written to a brand file on disk. Kept self-contained
// rather than importing js/generator/theme/preview.js's near-identical helpers,
// since this file also ships inside every generated manual, which never
// includes js/generator/*. A no-op when `overrides` is undefined.
function applyPrintOverrides(sourceEl, overrides) {
  let style = document.getElementById('generator-preview-print-theme');
  if (!style) {
    style = document.createElement('style');
    style.id = 'generator-preview-print-theme';
    document.head.appendChild(style);
  }
  const { colors, componentColors = {}, borderRadius, fontHeading, fontBody } = overrides.theme;
  const componentLines = Object.entries(componentColors)
    .map(([cssVar, value]) => `  ${cssVar}: ${value};`)
    .join('\n');
  style.textContent = `:root {
  --color-primary: ${colors.primary};
  --color-secondary: ${colors.secondary};
  --color-text: ${colors.text};
  --color-bg: ${colors.bg};
  --border-radius: ${borderRadius};
  --font-heading: ${fontHeading};
  --font-body: ${fontBody};
${componentLines}
}`;

  if (overrides.fontFaces && overrides.fontFaces.length) {
    let faceStyle = document.getElementById('generator-preview-print-fonts');
    if (!faceStyle) {
      faceStyle = document.createElement('style');
      faceStyle.id = 'generator-preview-print-fonts';
      document.head.appendChild(faceStyle);
    }
    faceStyle.textContent = overrides.fontFaces
      .map((f) => `@font-face { font-family: '${f.family}'; src: url('${f.dataUrl}'); }`)
      .join('\n');
  }

  if (overrides.faviconDataUrl) {
    const link = document.getElementById('favicon-link');
    if (link) link.href = overrides.faviconDataUrl;
  }
}

export async function buildAndPaginate({ sourceEl, outputEl, statusEl, overrides }) {
  const state = resolveState();
  const brand = BRANDS[state.brand];
  applyBrand(state.brand);
  applyFavicon(state.brand);
  if (overrides) applyPrintOverrides(sourceEl, overrides);
  const nav = await loadNav();

  sourceEl.innerHTML = '';

  const cover = document.createElement('section');
  cover.className = 'cover';
  cover.innerHTML = `
    <img src="${overrides && overrides.logoDataUrl ? overrides.logoDataUrl : resolvePath(brand.logo)}" alt="${brand.label} logo">
    <div class="product-name" data-i18n="product.name">Product name</div>
    <div class="cover-subtitle" data-i18n="print.subtitle">User Guide</div>
    <div class="cover-version"><span data-i18n="footer.versionLabel">Version</span> <span data-i18n="product.version">1.0.0</span></div>
  `;
  sourceEl.appendChild(cover);

  const toc = document.createElement('section');
  toc.className = 'toc';
  const tocHeading = document.createElement('h1');
  tocHeading.setAttribute('data-i18n', 'print.toc');
  tocHeading.textContent = 'Table of contents';
  toc.appendChild(tocHeading);
  toc.appendChild(buildTocList(nav));
  sourceEl.appendChild(toc);

  for (const item of flattenNav(nav)) {
    const content = await fetchChapterContent(item, state.lang);
    const section = document.createElement('section');
    section.className = 'chapter';
    section.id = `chapter-${item.id}`;
    if (content) section.innerHTML = content.innerHTML;
    sourceEl.appendChild(section);
  }

  // Inside-back-cover quick reference: the handful of facts someone reaches
  // for without wanting to hunt through the whole PDF — full detail on
  // each still lives in its own chapter above.
  const backCover = document.createElement('section');
  backCover.className = 'back-cover';
  backCover.innerHTML = `
    <h1 data-i18n="print.quickRef.title">Quick Reference</h1>
    <dl class="quick-ref-list">
      <dt data-i18n="print.quickRef.webInterface">Web interface</dt>
      <dd>http://192.168.1.1</dd>
      <dt data-i18n="print.quickRef.defaultLogin">Default login</dt>
      <dd data-i18n="print.quickRef.defaultLoginValue">Username admin, password printed on the device label</dd>
      <dt data-i18n="print.quickRef.factoryReset">Factory reset</dt>
      <dd data-i18n="print.quickRef.factoryResetValue">Hold the recessed Reset button for 10 seconds while powered on</dd>
      <dt data-i18n="print.quickRef.needHelp">Need more help?</dt>
      <dd data-i18n="print.quickRef.needHelpValue">See the Support chapter for contact details</dd>
    </dl>
    <div class="cover-version"><span data-i18n="footer.versionLabel">Version</span> <span data-i18n="product.version">1.0.0</span></div>
  `;
  sourceEl.appendChild(backCover);

  const translations = await applyTranslations(state.lang);
  if (overrides && overrides.productName) {
    sourceEl.querySelectorAll('[data-i18n="product.name"]').forEach((el) => {
      el.textContent = overrides.productName;
    });
  }

  if (statusEl) statusEl.textContent = 'Paginating…';
  await window.PagedPolyfill.preview(sourceEl, [resolvePath('css/print.css')], outputEl);
  sourceEl.hidden = true;
  if (statusEl) statusEl.textContent = 'Ready — press Ctrl+P / Cmd+P and choose "Save as PDF".';
  return translations;
}
