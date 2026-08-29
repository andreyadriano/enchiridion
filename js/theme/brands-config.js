// One entry per brand: which theme CSS + logo + default layout it uses.
// This is the file you edit to add a new white-label brand to the
// multi-brand build (see themes/theme-schema.md for the CSS contract each
// theme file must follow).
export const BRANDS = {
  intelbras: {
    label: 'Intelbras',
    theme: 'themes/theme-intelbras.css',
    logo: 'assets/logos/intelbras.svg',
    favicon: 'assets/favicons/intelbras.png',
    layout: 'sidebar',
  },
  'marca-b': {
    label: 'Marca B',
    theme: 'themes/theme-marca-b.css',
    logo: 'assets/logos/marca-b.svg',
    favicon: 'assets/favicons/marca-b.svg',
    layout: 'navbar',
  },
  generic: {
    label: 'Generic',
    theme: 'themes/theme-generic.css',
    logo: 'assets/logos/generic.svg',
    favicon: 'assets/favicons/generic.svg',
    layout: 'scroll',
  },
};

export const DEFAULT_BRAND = 'generic';

export const LAYOUTS = ['sidebar', 'navbar', 'scroll', 'hybrid'];
export const DEFAULT_LAYOUT = 'sidebar';

export const LANGS = ['en', 'pt', 'es'];
export const DEFAULT_LANG = 'en';

export const LANG_LABELS = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
};
