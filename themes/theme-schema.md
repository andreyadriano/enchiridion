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
| `--color-accent` | Optional secondary accent (free for manual tuning) | `#FF6B00` |
| `--color-text` | Body/heading text color | `#1A1A1A` |
| `--color-bg` | Page background | `#FFFFFF` |
| `--font-heading` | `h1`/`h2`/`h3`, product name | `'Montserrat', sans-serif` |
| `--font-body` | Everything else | `'Inter', sans-serif` |
| `--border-radius` | Buttons, selects, active nav item | `8px` |
| `--logo-url` | Optional CSS-level reference to the brand logo (the header/print cover use an `<img>` set via `js/brands-config.js` instead, but this is available for any CSS background-image use) | `url('../assets/logos/intelbras.svg')` |

## Component colors (optional — every one falls back to the base palette above)

These exist so each piece of the navigation can be recolored on its own
without recomputing anything — every one of them defaults to a sensible
combination of the base palette if you leave it out, so a minimal theme file
(just the base palette) still looks correct.

| Variable | Used for | Falls back to |
|---|---|---|
| `--color-header-bg` | Top header bar background | `--color-bg` |
| `--color-footer-bg` | Footer background | `--color-bg` |
| `--color-sidebar-bg` | Sidebar/scroll-layout nav column background | `--color-bg` |
| `--color-nav-link-text` | Menu/submenu link text, normal state | `--color-text` |
| `--color-nav-link-bg-hover` | Menu/submenu link background, on hover | `--color-secondary` |
| `--color-nav-link-text-hover` | Menu/submenu link text, on hover | `--color-text` |
| `--color-nav-link-bg-active` | Menu/submenu link background, selected/current page | `--color-secondary` |
| `--color-nav-link-text-active` | Menu/submenu link text, selected/current page | `--color-primary` |
| `--color-submenu-bg` | Dropdown submenu panel background (navbar layout) | `--color-bg` |
| `--color-submenu-border` | Dropdown submenu panel border (navbar layout) | `--color-secondary` |

## Adding a new brand

1. Copy `themes/theme-generic.css` to `themes/theme-<brand>.css` and fill in
   the base palette above. Add any of the component colors only if you want
   that piece to differ from the fallback.
2. Add an SVG logo to `assets/logos/<brand>.svg`.
3. Add an entry to `js/brands-config.js` (`BRANDS`) pointing at the new theme
   file, logo, and default layout.

No other file needs to change — the brand selector in the header is
populated from `BRANDS` automatically.

## Removing multi-brand support (single-brand build)

See `README.md` → "Single-brand build" for the 3-step removal.
