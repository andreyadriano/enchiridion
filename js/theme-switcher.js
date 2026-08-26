// ============================================================================
// THEME SWITCHER — multi-brand support.
//
// This whole file is only needed for the multi-brand build (a single build
// serving several white-label brands with a live brand selector). If you are
// forking this template for a single fixed brand, see the "removal" steps in
// README.md section "Single-brand build" — deleting this file is step 1.
// ============================================================================
import { resolvePath } from './nav-config.js';
import { BRANDS } from './brands-config.js';

const THEME_LINK_ID = 'theme-css';
const FAVICON_LINK_ID = 'favicon-link';

export function applyBrand(brandId) {
  const brand = BRANDS[brandId];
  if (!brand) return;
  const link = document.getElementById(THEME_LINK_ID);
  if (link) link.href = resolvePath(brand.theme);
}

export function applyLogo(brandId) {
  const brand = BRANDS[brandId];
  if (!brand) return;
  document.querySelectorAll('[data-brand-logo]').forEach((img) => {
    img.src = resolvePath(brand.logo);
    img.alt = brand.label + ' logo';
  });
}

export function applyFavicon(brandId) {
  const brand = BRANDS[brandId];
  if (!brand || !brand.favicon) return;
  const link = document.getElementById(FAVICON_LINK_ID);
  if (!link) return;
  link.href = resolvePath(brand.favicon);
  link.type = brand.favicon.endsWith('.png')
    ? 'image/png'
    : brand.favicon.endsWith('.ico')
    ? 'image/x-icon'
    : 'image/svg+xml';
}
