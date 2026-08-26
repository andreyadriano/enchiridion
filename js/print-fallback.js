// A plain browser Ctrl+P only ever prints what's actually in the current
// page's DOM. In 'scroll' layout that's already the whole manual (see
// js/continuous-manual.js), so native print just works. In 'sidebar' and
// 'navbar' layout, #page-content only ever holds the one page you're on —
// so this builds a hidden #print-manual container with the whole manual
// composed into it (reusing the same continuous-manual.js logic), plus a
// brand logo + product name header to match, and css/print-fallback.css
// swaps it in for #page-content specifically under @media print. The
// visible page and its layout are completely unaffected.
//
// Built as soon as the page settles, not lazily on the print event itself:
// window.print()/Ctrl+P give no reliable way to delay printing for async
// work (fetching + composing 6 other pages), so by the time a real user
// prints — after actually reading the page for a moment — this needs to
// already be done. data-ready="true" on the container marks completion
// (also what tests/smoke.test.mjs waits on).
import { BRANDS } from './brands-config.js';
import { resolvePath } from './nav-config.js';
import { buildContinuousManual } from './continuous-manual.js';

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
  // data-brand-logo makes js/theme-switcher.js's applyLogo() keep this in
  // sync on future brand switches, the same way the header's own logo is —
  // no need to rebuild this whole (fetch-heavy) fallback just because the
  // brand changed.
  container.appendChild(header);

  await buildContinuousManual(container, nav, { activeItemId, reuseHTML, lang });
  container.setAttribute('data-ready', 'true');
}

export function removePrintFallback() {
  const container = document.getElementById('print-manual');
  if (container) container.remove();
}
