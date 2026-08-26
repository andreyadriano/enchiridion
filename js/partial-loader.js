// Injects the shared header/nav/footer "frame" into every page via fetch().
// Page content itself is NOT loaded this way — it's written natively in each
// pages/**/*.html file so deep links keep working even if this script fails
// (see README.md "Architecture" for why).
//
// Requires an HTTP server (fetch() of local files is blocked by CORS when a
// page is opened directly with file://). Run e.g. `python3 -m http.server`
// from the project root during development.
import { resolvePath } from './nav-config.js';

async function fetchPartial(path) {
  const res = await fetch(resolvePath(path));
  if (!res.ok) throw new Error(`Could not load partial ${path} (${res.status})`);
  return res.text();
}

export async function loadPartials() {
  const [header, nav, footer] = await Promise.all([
    fetchPartial('partials/header.html'),
    fetchPartial('partials/nav.html'),
    fetchPartial('partials/footer.html'),
  ]);

  const headerSlot = document.getElementById('site-header');
  const navSlot = document.getElementById('site-nav');
  const footerSlot = document.getElementById('site-footer');

  if (headerSlot) headerSlot.innerHTML = header;
  if (navSlot) navSlot.innerHTML = nav;
  if (footerSlot) footerSlot.innerHTML = footer;
}
