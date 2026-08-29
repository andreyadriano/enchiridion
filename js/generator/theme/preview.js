// Live preview for both generator modes. The preview iframe is same-origin
// (it loads pages/en/menu1/index.html from this same site), so it's driven
// by touching iframe.contentDocument directly — no postMessage plumbing
// needed.
import { rootUrl } from '../paths.js';

const PREVIEW_STYLE_ID = 'custom-theme-preview';
const FONT_FACE_STYLE_ID = 'custom-font-faces';
const HIDE_CHROME_STYLE_ID = 'generator-preview-chrome';

export function setPreviewSrc(iframe, { brand, layout, lang = 'en' }) {
  const url = new URL(rootUrl('pages/en/menu1/index.html'));
  url.searchParams.set('brand', brand);
  url.searchParams.set('layout', layout);
  url.searchParams.set('lang', lang);
  iframe.src = url.href;
}

// The iframe's 'load' event fires before js/core/page-init.js's own async
// initPage() chain finishes, which would otherwise overwrite our
// logo/product-name override right back to the default. Waits for two
// signals: the nav tree rendered (first applyTranslations() resolved), and
// — since syncPrintFallback() calls applyTranslations() a second time once
// the hidden print fallback finishes building — that fallback's own
// data-ready flag too ('scroll' layout never builds one, so its absence
// there doesn't block).
export function waitForPreviewReady(iframe) {
  return new Promise((resolve) => {
    const check = () => {
      const doc = iframe.contentDocument;
      if (!doc) {
        requestAnimationFrame(check);
        return;
      }
      const navReady = doc.querySelector('#site-nav-tree a');
      const isScroll = doc.body && doc.body.classList.contains('layout-scroll');
      const printFallbackReady = isScroll || doc.querySelector('#print-manual[data-ready="true"]');
      if (navReady && printFallbackReady) {
        resolve(doc);
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

export function applyCustomTheme(iframe, { colors, componentColors = {}, borderRadius, fontHeading, fontBody }) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.head) return;
  let style = doc.getElementById(PREVIEW_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = PREVIEW_STYLE_ID;
    // Appended last so it wins by source order over the theme's own :root.
    doc.head.appendChild(style);
  }
  // Rebuilt from scratch every call so a component color switched back to
  // "auto" (and so absent from componentColors) actually disappears here.
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
}

export function applyCustomLogo(iframe, dataUrl) {
  const doc = iframe.contentDocument;
  if (!doc || !dataUrl) return;
  doc.querySelectorAll('[data-brand-logo]').forEach((img) => {
    img.src = dataUrl;
  });
}

export function applyCustomFavicon(iframe, dataUrl) {
  const doc = iframe.contentDocument;
  if (!doc || !dataUrl) return;
  const link = doc.getElementById('favicon-link');
  if (link) link.href = dataUrl;
}

export function applyProductName(iframe, name) {
  const doc = iframe.contentDocument;
  if (!doc || !name) return;
  doc.querySelectorAll('[data-i18n="product.name"]').forEach((el) => {
    el.textContent = name;
  });
}

// Uploaded custom fonts only exist as in-memory data URLs until download
// time, so previewing them means declaring @font-face here instead of
// linking a file. `faces` is [{ family, dataUrl }].
export function applyCustomFontFaces(iframe, faces) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.head) return;
  let style = doc.getElementById(FONT_FACE_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = FONT_FACE_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = faces
    .filter((f) => f.dataUrl)
    .map((f) => `@font-face { font-family: '${f.family}'; src: url('${f.dataUrl}'); }`)
    .join('\n');
}

// Hides languages not selected in the generator from the previewed
// dropdown; falls back to English (via the select's own 'change' handler)
// if the language currently showing got deselected.
export function filterPreviewLanguages(iframe, langs) {
  const doc = iframe.contentDocument;
  if (!doc) return;
  const select = doc.getElementById('lang-selector');
  if (!select) return;
  Array.from(select.options).forEach((opt) => {
    opt.hidden = !langs.includes(opt.value);
  });
  if (select.value && !langs.includes(select.value)) {
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// The generator's own controls already pick brand/layout, so hide the
// previewed app's own header dropdowns for the same two things.
export function hidePreviewChromeSelectors(iframe) {
  const doc = iframe.contentDocument;
  if (!doc || !doc.head) return;
  let style = doc.getElementById(HIDE_CHROME_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = HIDE_CHROME_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = '#brand-selector-wrap, #layout-selector-wrap { display: none !important; }';
}
