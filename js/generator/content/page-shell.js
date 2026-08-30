// Builds the boilerplate around a rendered page's #page-content — the
// <head> links, header/nav/footer mounts, and the initPage() bootstrap
// script every file under pages/** already carries verbatim today. Needed
// for any page that doesn't already exist as a real file in the repo (a
// newly-created menu/submenu, or an existing demo page that got edited),
// since build-package.js can't just fetch+rewrite those from disk.
//
// Relative link depth is computed from the actual generated path
// (pages/{lang}/menuX/index.html and pages/{lang}/menuX/submenuY.html are
// both 3 levels deep today) rather than hard-coded, so this keeps working
// if that ever changes.
export function relativePrefix(path) {
  const depth = path.split('/').length - 1;
  return '../'.repeat(depth);
}

// faviconPath is the zip's own already-rewritten favicon path (e.g.
// assets/favicon-custom.svg — see build-package.js's buildManualZip)
// rather than this repo's own generic-brand name, and the theme link
// always points at themes/theme-custom.css for the same reason: a page
// built from blocks only ever ships inside that per-download zip, never
// as a raw repo file.
export function buildPageShell({ path, lang, title, layout, bodyHtml, faviconPath }) {
  const p = relativePrefix(path);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="icon" type="image/svg+xml" id="favicon-link" href="${p}${faviconPath}">
  <link rel="stylesheet" href="${p}css/base.css">
  <link rel="stylesheet" href="${p}css/layout-${layout}.css">
  <link rel="stylesheet" href="${p}css/responsive.css">
  <link rel="stylesheet" href="${p}css/print-fallback.css">
  <link rel="stylesheet" id="theme-css" href="${p}themes/theme-custom.css">
</head>
<body>
  <a class="skip-link" href="#page-content" data-i18n="a11y.skipToContent">Skip to content</a>
  <header id="site-header" class="site-header"></header>
  <div class="layout-shell">
    <nav id="site-nav" class="site-nav" aria-label="Section navigation"></nav>
    <main id="page-content" class="page-content">
${bodyHtml}
    </main>
  </div>
  <footer id="site-footer" class="site-footer"></footer>

  <script type="module">
    import { initPage } from '${p}js/core/page-init.js';
    initPage();
  </script>
</body>
</html>
`;
}
