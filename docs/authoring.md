# Authoring guide

Everything a non-technical maintainer needs to edit content, translate
pages, and re-theme a brand — no JavaScript, no build step. For how the
template works internally, see [`architecture.md`](architecture.md).

You never need to know JavaScript, and never need to touch a `.js` file —
everything a maintainer does is an HTML page or a plain JSON file (the same
kind of file, and the same editing pattern, used in three places: page
content, `nav-config.json`, `i18n/*.json`).

## Quick reference

| Task | What to do |
|---|---|
| Change a page's title/text | Edit the `<h1>`/`<h2>`/`<p>` tags directly in that page's `pages/**/*.html` file |
| Rename a menu/sidebar entry, or header/footer text | Edit `i18n/en.json` / `i18n/pt.json` / `i18n/es.json` — the key already tells you where |
| Add a page | Create `pages/en/menuX/new-page.html` (copy an existing page for the boilerplate `<head>`/`<body>` shell and write its content directly), add an entry to `nav-config.json`, add its `nav.*` label to both `i18n/*.json` files |
| Translate a page's content | Copy it to `pages/pt/menuX/name.html` (or `pages/es/menuX/`), translate the text, add the language code to `"langs"` in its entry in `nav-config.json` — see "Adding a translation" below |
| Add a language | Duplicate `i18n/en.json` → `i18n/xx.json`, translate the chrome values, add `'xx'` and its native name to `LANGS`/`LANG_LABELS` in `js/theme/brands-config.js` |
| Change colors (any component) | Edit the one `themes/theme-<brand>.css` file for that brand — every variable is commented in plain English, see `themes/theme-schema.md` |
| Change fonts | Same file, `--font-heading` / `--font-body` |
| Add a brand | New `themes/theme-<brand>.css` (follow `themes/theme-schema.md`), logo in `assets/logos/`, one entry in `BRANDS` |
| Go single-brand | Follow "Single-brand build" below |
| Regenerate the PDF | Open `print.html`, wait for pagination, print → Save as PDF (use "Back to manual" in the toolbar to return) |
| Link in from an external product | Copy the page's URL (+ `#anchor-id` for a specific topic, + `?lang=&brand=` to force those) |

None of this requires a terminal, a build step, or deep JS/CSS knowledge.

## Editing a page

- **Change what a page says.** Open the page under `pages/` (e.g.
  `pages/en/menu1/index.html`) in any text editor and edit the text inside
  the `<h1>`, `<h2>`, and `<p>` tags directly — it's plain HTML, what you
  type is what shows up, nothing overwrites it. Don't remove the `id="..."`
  on headings; those are what deep links (`#menu1-topic1`) point at.
- **Add a specs table or an example image.** `pages/en/menu2/index.html`
  (and its `pt/`/`es/` counterparts) has a working example of both, styled
  and ready to copy: a `<table class="spec-table">` with a `<caption>`, and
  a `<figure class="manual-figure"><img>...<figcaption>...</figcaption></figure>`
  for an image with a manual-style caption. Both classes are defined in
  `css/base.css` and print cleanly (a table/figure never splits across a
  page break — see `css/print.css`).
- **Add a whole new page.** Copy an existing page for the `<head>`/`<body>`
  boilerplate, add one entry to `nav-config.json` (copy an existing entry
  and change `id`/`labelKey`/`path`), and add its `nav.*` label to all three
  `i18n/*.json` files.
- **Rename an entry in the menu/sidebar.** That name is shared across every
  page (so it doesn't have to be edited seven times), so it lives in
  `i18n/en.json` / `i18n/pt.json` / `i18n/es.json` instead — find the
  `nav.*` key that matches (e.g. `"nav.menu1": "Getting Started"`) and
  change the text after the colon. Edit all three files the same way so
  every language stays in sync.
- **Change the header/footer text or button labels.** Same three JSON
  files, the non-`nav.*` keys — each one's own key name says what it's for.

## Content patterns

Every pattern below has a real, working example already in this manual's own
content (not just documentation of the class name) — find it, copy the
HTML, and rewrite the text. All of them are defined in `css/base.css`
(on-screen) with a matching copy in `css/print.css` (the dedicated PDF
export, which doesn't load `base.css` — see that file's own comment for
why).

| Pattern | Class | Where to find a working example |
|---|---|---|
| Spec table (connections, power, dimensions) | `.spec-table` | Specifications (`pages/en/menu2/index.html`) |
| LED status table | `.spec-table` (reused) | Specifications, "LED Indicators" |
| Glossary / row-label table | `.spec-table` (reused) | Advanced Topics (`pages/en/menu3/submenu1.html`) |
| Troubleshooting table | `.spec-table` (reused) | Support (`pages/en/menu3/index.html`) |
| Revision history table | `.spec-table` (reused) | Compliance (`pages/en/menu2/submenu1.html`) |
| Numbered-parts figure legend | `.manual-figure-legend` | Specifications, rear-panel diagram |
| Example figure with caption | `.manual-figure` | Specifications, and Installation's own diagram |
| Symbols-used table | `.spec-table` (reused) | Compliance |
| Safety/note/tip/caution callouts | `.callout` + `.callout-note`/`.callout-tip`/`.callout-caution`/`.callout-warning`/`.callout-danger` | Getting Started, "Safety Warnings" |
| Numbered installation/update steps | `.steps` (a plain `<ol>`, CSS counters, no JS) | Installation, and Advanced Topics' firmware update |
| CLI / config-file example | `.cli-block` (a styled `<pre><code>`) | Initial Setup |
| "What's in the box" / feature checklist | `.contents-list` | Getting Started, "Package Contents" |
| FAQ (question/answer pairs) | `.faq-list` (a plain `<dl>`) | Support, "Frequently Asked Questions" |
| Warranty statement | plain paragraphs | Support, "Warranty" |
| A-Z index | `.az-index` | Index page (`pages/en/menu4/index.html`) |

## Internationalization

Two things translate independently:

1. **UI chrome** — header/footer text, button labels, menu/sidebar entry
   names. `i18n/en.json`, `i18n/pt.json`, and `i18n/es.json` hold these;
   `js/core/i18n.js` fetches the active one and overwrites every
   `[data-i18n]` element's text, no `location.reload()` anywhere.
2. **Page content** — titles and paragraphs — is plain HTML in each
   `pages/**/*.html` file, so it translates by creating a second real file,
   not a JSON entry. See "Adding a translation" below.

`product.name` is the one i18n key meant to be changed first: it drives the
bold text next to the logo in the header, the `<title>` prefix, and the PDF
cover. `manual-config.json` (root) holds language-independent manual facts
(currently `product.version`) — anything that shouldn't be duplicated across
three JSON files.

Adding a fourth language: duplicate `i18n/en.json` → `i18n/fr.json`, add
`'fr'` to `LANGS` **and** its native name to `LANG_LABELS` in
`js/theme/brands-config.js` (the header's language dropdown shows each
language's own name — "Português", "Español" — not a country-code
abbreviation). That translates the chrome immediately; translating page
content in the new language is the same per-page opt-in process below.

### Language switching never reloads the page, in any layout

Switching the language dropdown fetches the current page's content in the
new language (its own translated file, or the default-language fallback if
untranslated) and swaps it in via the same soft-navigation approach a
nav-link click uses, updating the URL with `history.pushState`. `scroll`
layout needs the *whole* manual recomposed in the new language (every
chapter, not just the current page), so it goes through
`applyLayoutContent()` instead of a plain content swap; that composition
happens in a detached, off-screen element first and gets swapped into
`#page-content` in one atomic step once it's ready, so the previously
composed page stays on screen unchanged the whole time — no flash of blank
content while the other pages are being fetched.

### Adding a translation of a page's content

Each page's content is a real file, and a translation is just the same file
in a sibling per-language folder — `pages/en/menu1/index.html` (default
language) has counterparts `pages/pt/menu1/index.html` (Portuguese) and
`pages/es/menu1/index.html` (Spanish). Every page in this template already
has all three — live, working examples of exactly this, not just
documentation of it. `nav-config.json` declares each page's path once, as a
template with a `{lang}` placeholder (e.g. `"pages/{lang}/menu1/index.html"`),
so adding a folder is enough — nothing else needs to name the new file.

1. Copy the page's file: `pages/en/menu1/index.html` →
   `pages/pt/menu1/index.html` (or `pages/es/menu1/index.html`, or whichever
   language code you're adding — create the folder if it doesn't exist
   yet).
2. Open the copy and translate the text inside the `<h1>`/`<h2>`/`<p>` tags —
   keep every `id="..."` unchanged (deep links and the PDF/scroll-layout
   composition depend on them matching the default-language file). Also set
   `<html lang="pt">` (or `"es"`, etc.) at the top, and fix the page's
   in-body links to its own language's sibling pages (e.g. a `pt` page
   should link to `../menu2/index.html`, not the English one).
3. Tell the site the translation exists: open `nav-config.json`, find that
   page's entry, and add the language code to its `"langs"` array, e.g.
   `"langs": ["pt", "es"]` (every entry in this template already has both —
   copy the pattern). Without this step the page still works fine, it's
   just treated as not-yet-translated into that language.

Once declared, everything else follows automatically: the language selector
fetches the file from that language's folder when you're on that page and
swaps it in (no reload), every nav link to that page points straight at the
right language's file, and the PDF/scroll-layout/print-fallback views that
compose the whole manual together pick it up too. A page with no
`"pt"`/`"es"` entry in `langs` is simply skipped for that language — the
language selector leaves it on its default-language file rather than
404ing, and every "whole manual" export just includes the default-language
version of that one page.

## Multi-brand build

`js/theme/brands-config.js` maps each brand id to its theme CSS, logo, and
default layout:

```js
export const BRANDS = {
  intelbras: { theme: 'themes/theme-intelbras.css', logo: 'assets/logos/intelbras.svg', layout: 'sidebar' },
  'marca-b':  { theme: 'themes/theme-marca-b.css',  logo: 'assets/logos/marca-b.svg',   layout: 'navbar' },
  generic:    { theme: 'themes/theme-generic.css',  logo: 'assets/logos/generic.svg',   layout: 'scroll' },
};
```

Every theme file implements the same CSS variable contract, documented in
`themes/theme-schema.md`. Adding a brand = a new `theme-*.css` + a logo +
one entry in `BRANDS` — nothing else changes.

Colors are granular: beyond the base palette (`--color-primary`,
`--color-secondary`, `--color-text`, `--color-bg`), each theme file can
optionally set its own color for the sidebar background, menu/submenu link
text and background in each state (normal, hover, selected), the navbar's
dropdown submenu panel, and the header/footer background — see the
"Component colors" table in `themes/theme-schema.md`. Every one of these is
optional and falls back to the base palette if left unset, so a minimal
theme (just the required variables) still looks correct; `theme-marca-b.css`
has a live example of several of them actually set. Every variable, in every
theme file, has an inline comment saying exactly what it controls.

The layout selector in the header lets you override a brand's default
layout manually (handy for comparing all four side by side). `BRANDS[id]
.layout` is only that brand's *default* — used the very first time a
visitor arrives with nothing in `localStorage` yet (see `architecture.md`
"State") — switching brands afterwards only swaps the theme/logo/favicon
and deliberately leaves whatever layout you already have selected alone.

### Single-brand build

If you're forking this template for one fixed brand, strip the multi-brand
machinery in 3 steps:

1. Delete `js/theme/theme-switcher.js`.
2. Remove the `<!-- INÍCIO: THEME SWITCHER -->…<!-- FIM: THEME SWITCHER -->`
   block from `partials/header.html`.
3. In every page's `<head>`, change
   `<link rel="stylesheet" id="theme-css" href="...themes/theme-generic.css">`
   to point at your one theme file, and delete the rest of the `BRANDS` map
   in `js/theme/brands-config.js` down to a single entry (or hard-code the
   theme path directly and drop `brands-config.js` + the brand bits of
   `page-init.js` altogether).

Or skip all of this and use the [generator tool](generator.md) instead — it
produces exactly this kind of single-brand, single-layout package
automatically.
