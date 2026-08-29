// Hand-maintained manifest of every static file a downloaded manual might
// need — the browser can't list a directory. CORE_FILES ships
// unconditionally; layout/theme/logo/favicon are picked per-download by
// js/generator/package/build-package.js. A manual's own pages/**/*.html files
// aren't listed here — they're derived from nav-config.json instead.
export const CORE_FILES = [
  'print.html',
  'nav-config.json',
  'manual-config.json',

  'css/base.css',
  'css/print.css',
  'css/print-fallback.css',
  'css/responsive.css',

  'js/theme/brands-config.js',
  'js/theme/theme-switcher.js',
  'js/content/continuous-manual.js',
  'js/content/search.js',
  'js/content/search-ui.js',
  'js/core/i18n.js',
  'js/core/page-init.js',
  'js/core/partial-loader.js',
  'js/core/seo.js',
  'js/core/state.js',
  'js/nav/nav-config.js',
  'js/nav/nav-render.js',
  'js/nav/page-trail.js',
  'js/nav/scrollspy.js',
  'js/print/print-builder.js',
  'js/print/print-fallback.js',

  'partials/header.html',
  'partials/footer.html',
  'partials/nav.html',

  'themes/theme-schema.md',

  'assets/example-installation-diagram.svg',
  'assets/example-product-rear.svg',

  'vendor/paged.polyfill.js',
];

// One CSS file per selectable layout — only the chosen layout's file ships.
export const LAYOUT_CSS = {
  sidebar: 'css/layout-sidebar.css',
  navbar: 'css/layout-navbar.css',
  scroll: 'css/layout-scroll.css',
  hybrid: 'css/layout-hybrid.css',
};

// UI-chrome dictionaries, one per selectable language — only en.json (always
// included) plus the extra languages the user checked ship.
export const I18N_FILES = {
  en: 'i18n/en.json',
  pt: 'i18n/pt.json',
  es: 'i18n/es.json',
};

// Used when the user didn't upload their own logo/favicon — written into
// the zip under the same fixed name a real upload would use.
export const FALLBACK_LOGO = 'assets/logos/generic.svg';
export const FALLBACK_FAVICON = 'assets/favicons/generic.svg';
