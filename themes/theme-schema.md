# Theme variable contract

Every `themes/theme-*.css` file must define the same set of CSS custom
properties on `:root`. `css/base.css`, the layout CSS files, and `print.css`
only ever consume these variables (with sane fallbacks) — they never
hard-code a brand color, so a new brand is "just" a new file that fills in
this contract.

**You never need to touch any other CSS or JS file to change a brand's
colors or fonts — only the one `theme-*.css` file.** Every variable below has
a plain-English comment in the theme files themselves, so you can edit them
in any text editor without reading this document first.

## Base palette (required — every theme must set these)

| Variable | Used for | Example |
|---|---|---|
| `--color-primary` | Links, active nav item, product name, accents, buttons | `#0057B8` |
| `--color-secondary` | Borders, subtle backgrounds (hover/active nav bg, table stripes) | `#F2F2F2` |
| `--color-text` | Body/heading text color | `#1A1A1A` |
| `--color-bg` | Page background | `#FFFFFF` |
| `--font-heading` | `h1`/`h2`/`h3`, product name | `'Montserrat', sans-serif` |
| `--font-body` | Everything else | `'Inter', sans-serif` |
| `--border-radius` | Buttons, selects, active nav item | `8px` |
| `--logo-url` | Optional CSS-level reference to the brand logo (the header/print cover use an `<img>` set via `js/theme/brands-config.js` instead, but this is available for any CSS background-image use) | `url('../assets/logos/ember.svg')` |

## Component colors (optional — every one falls back to the base palette above)

These exist so each piece of the navigation can be recolored on its own
without recomputing anything — every one of them defaults to a sensible
combination of the base palette if you leave it out, so a minimal theme file
(just the base palette) still looks correct.

| Variable | Used for | Falls back to |
|---|---|---|
| `--color-scheme` | Tells the browser whether to draw native form-control chrome (select dropdown arrows, scrollbars, focus rings) in light or dark mode — set to `dark` on a dark-background theme, or its native `<select>`/`<input>` edges keep showing light-mode chrome no matter what `--color-control-bg` says. See `themes/theme-nocturne.css` for a live example. | `light` |
| `--color-header-bg` | Top header bar background (also the top "topbar" bar in navbar/hybrid layouts) | `--color-bg` |
| `--color-footer-bg` | Footer background | `--color-bg` |
| `--color-sidebar-bg` | Sidebar/scroll-layout nav column background, and Navbar layout's own dropdown submenu background | `--color-bg` |
| `--color-nav-link-text` | Menu/submenu link text, normal state | `--color-text` |
| `--color-nav-link-bg-hover` | Menu/submenu link background, on hover | `--color-secondary` |
| `--color-nav-link-text-hover` | Menu/submenu link text, on hover | `--color-text` |
| `--color-nav-link-bg-active` | Menu/submenu link background, selected/current page | `--color-secondary` |
| `--color-nav-link-text-active` | Menu/submenu link text, selected/current page | `--color-primary` |
| `--color-search-results-bg` | Header search results panel background | `--color-bg` |
| `--color-search-results-border` | Header search results panel border | `--color-secondary` |
| `--color-search-results-hover-bg` | A search result's highlight on hover/focus | `--color-secondary` |
| `--color-control-bg` | Header search box and selects (language/layout/brand) background — deliberately does **not** fall back to `--color-bg`, so changing the page background never turns these controls the same color | `#FFFFFF` |
| `--color-border` | Thin dividing lines across the page: under the header, above the footer, around form fields/images, between sidebar columns and scroll-layout sections, and Navbar layout's own dropdown submenu | `--color-secondary` |
| `--color-table-border` | Cell borders in spec/comparison tables | `--color-border` |
| `--color-table-header-bg` | Spec/comparison table header row background | `--color-secondary` |
| `--color-callout-note` | Border and title color of a "Note" callout box | `#2b6cb0` |
| `--color-callout-tip` | Border and title color of a "Tip" callout box | `#2f855a` |
| `--color-callout-caution` | Border and title color of a "Caution" callout box | `#8a6512` |
| `--color-callout-warning` | Border and title color of a "Warning" callout box | `#a34e12` |
| `--color-callout-danger` | Border and title color of a "Danger" callout box | `#c53030` |

`--color-callout-caution/warning/danger` map to IEC/IEEE 82079-1's three
personal-injury signal words (CAUTION: minor/moderate injury, WARNING:
death or serious injury, DANGER: imminent death or serious injury) — hence
the gold → orange → red escalation. `--color-callout-note`/`-tip` are
general asides, not part of that signal-word system. The standard's 4th
signal word (NOTICE, property damage only) has no callout of its own here;
add a `.callout-notice` following the same CSS pattern if a manual needs
one.

## Adding a new brand

1. Copy `themes/theme-generic.css` to `themes/theme-<brand>.css` and fill in
   the base palette above. Add any of the component colors only if you want
   that piece to differ from the fallback.
2. Add an SVG logo to `assets/logos/<brand>.svg`.
3. Add an entry to `js/theme/brands-config.js` (`BRANDS`) pointing at the new theme
   file, logo, and default layout.

No other file needs to change — the brand selector in the header is
populated from `BRANDS` automatically.

## Removing multi-brand support (single-brand build)

See `README.md` → "Single-brand build" for the 3-step removal.
