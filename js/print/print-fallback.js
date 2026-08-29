// Ctrl+P only prints the current page's DOM, which in 'sidebar'/'navbar'
// layout only holds one page — so this builds a hidden #print-manual with
// the whole manual composed into it, swapped in for #page-content under
// @media print (see css/print-fallback.css). Built eagerly, not on the
// print event itself, since window.print() gives no way to delay for async
// work; `data-ready="true"` marks completion.
import { BRANDS } from '../theme/brands-config.js';
import { resolvePath } from '../nav/nav-config.js';
import { buildContinuousManual } from '../content/continuous-manual.js';

export async function buildPrintFallback({ activeItemId, reuseHTML, brand, lang, nav }) {
  let container = document.getElementById('print-manual');
  if (!container) {
    container = document.createElement('div');
    container.id = 'print-manual';
    container.className = 'print-manual';
    document.body.appendChild(container);
  }
  container.removeAttribute('data-ready');
  container.innerHTML = '';

  const brandInfo = BRANDS[brand];
  const header = document.createElement('div');
  header.className = 'print-manual-header';
  header.innerHTML = `
    <img data-brand-logo src="${resolvePath(brandInfo.logo)}" alt="${brandInfo.label} logo" class="print-manual-logo">
    <div class="print-manual-title" data-i18n="product.name">Product name</div>
  `;
  // data-brand-logo lets js/theme/theme-switcher.js's applyLogo() keep this in
  // sync on a brand switch without rebuilding the whole fetch-heavy fallback.
  container.appendChild(header);

  await buildContinuousManual(container, nav, { activeItemId, reuseHTML, lang });
  container.setAttribute('data-ready', 'true');
}

export function removePrintFallback() {
  const container = document.getElementById('print-manual');
  if (container) container.remove();
}
