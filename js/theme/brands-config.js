// One entry per brand: which theme CSS + logo + default layout it uses.
// This is the file you edit to add a new white-label brand to the
// multi-brand build (see themes/theme-schema.md for the CSS contract each
// theme file must follow).
export const BRANDS = {
  amethyst: {
    label: 'Amethyst',
    theme: 'themes/theme-amethyst.css',
    logo: 'assets/logos/amethyst.svg',
    favicon: 'assets/favicons/amethyst.svg',
    layout: 'navbar',
  },
  ember: {
    label: 'Ember',
    theme: 'themes/theme-ember.css',
    logo: 'assets/logos/ember.svg',
    favicon: 'assets/favicons/ember.svg',
    layout: 'hybrid',
  },
  nocturne: {
    label: 'Nocturne',
    theme: 'themes/theme-nocturne.css',
    logo: 'assets/logos/nocturne.svg',
    favicon: 'assets/favicons/nocturne.svg',
    layout: 'sidebar',
  },
  juniper: {
    label: 'Juniper',
    theme: 'themes/theme-juniper.css',
    logo: 'assets/logos/juniper.svg',
    favicon: 'assets/favicons/juniper.svg',
    layout: 'navbar',
  },
  coral: {
    label: 'Coral',
    theme: 'themes/theme-coral.css',
    logo: 'assets/logos/coral.svg',
    favicon: 'assets/favicons/coral.svg',
    layout: 'scroll',
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
