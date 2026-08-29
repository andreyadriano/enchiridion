// Mirrors js/theme/brands-config.js's BRANDS. Font values are snapped to
// the closest FONT_STACKS entry (js/generator/theme/font-fields.js).
export const PRESETS = [
  {
    id: 'amethyst',
    labelKey: 'generator.explore.card.amethyst',
    blurbKey: 'generator.explore.blurb.amethyst',
    colors: { primary: '#7a1fa2', secondary: '#f3ecf7', text: '#22192b', bg: '#ffffff' },
    borderRadius: '0px',
    fontHeading: "Georgia, 'Times New Roman', serif",
    fontBody: "'Segoe UI', Helvetica, Arial, sans-serif",
    layout: 'navbar',
  },
  {
    id: 'ember',
    labelKey: 'generator.explore.card.ember',
    blurbKey: 'generator.explore.blurb.ember',
    colors: { primary: '#a3430c', secondary: '#f5ece1', text: '#2b2013', bg: '#ffffff' },
    borderRadius: '8px',
    fontHeading: "'Segoe UI', Helvetica, Arial, sans-serif",
    fontBody: "'Segoe UI', Helvetica, Arial, sans-serif",
    layout: 'hybrid',
  },
  {
    id: 'nocturne',
    labelKey: 'generator.explore.card.nocturne',
    blurbKey: 'generator.explore.blurb.nocturne',
    colors: { primary: '#8ea8ff', secondary: '#1f2230', text: '#e5e7f0', bg: '#14161f' },
    borderRadius: '8px',
    fontHeading: "'Segoe UI', Helvetica, Arial, sans-serif",
    fontBody: "'Segoe UI', Helvetica, Arial, sans-serif",
    layout: 'sidebar',
    // --color-control-bg never falls back to --color-bg (see
    // themes/theme-schema.md), so a dark theme needs these set explicitly.
    componentColors: {
      '--color-header-bg': '#1a1c28',
      '--color-footer-bg': '#1a1c28',
      '--color-sidebar-bg': '#1a1c28',
      '--color-nav-link-bg-active': '#262a44',
      '--color-nav-link-text-active': '#b8c6ff',
      '--color-search-results-bg': '#1a1c28',
      '--color-search-results-border': '#2a2e42',
      '--color-control-bg': '#1f2230',
      '--color-border': '#2a2e42',
      '--color-table-header-bg': '#1f2230',
    },
  },
  {
    id: 'juniper',
    labelKey: 'generator.explore.card.juniper',
    blurbKey: 'generator.explore.blurb.juniper',
    colors: { primary: '#2f7d54', secondary: '#e8f1ec', text: '#1f2b24', bg: '#ffffff' },
    borderRadius: '8px',
    fontHeading: 'system-ui, sans-serif',
    fontBody: 'system-ui, sans-serif',
    layout: 'navbar',
  },
  {
    id: 'coral',
    labelKey: 'generator.explore.card.coral',
    blurbKey: 'generator.explore.blurb.coral',
    colors: { primary: '#c23b5a', secondary: '#fbe9ee', text: '#3a1f26', bg: '#ffffff' },
    borderRadius: '16px',
    fontHeading: 'Helvetica, Arial, sans-serif',
    fontBody: 'Helvetica, Arial, sans-serif',
    layout: 'scroll',
  },
  {
    id: 'generic',
    labelKey: 'generator.explore.card.generic',
    blurbKey: 'generator.explore.blurb.generic',
    colors: { primary: '#2b6cb0', secondary: '#edf2f7', text: '#1a202c', bg: '#ffffff' },
    borderRadius: '4px',
    fontHeading: 'system-ui, sans-serif',
    fontBody: 'system-ui, sans-serif',
    layout: 'scroll',
  },
];

export function findPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}
