# White-label manual template

Plain HTML/CSS/JS product manual template — no build tool, no backend. One
build can serve several white-label brands with a live theme switcher, four
selectable navigation layouts, instant language switching (no page reload),
deep-linkable pages/sections, full-manual search, and a single PDF export
with a real table of contents and page numbers.

The demo content is a real, working example manual for a fictional telecom
product (a small dual-band broadband gateway) — not lorem ipsum, and not
generic "Menu 1 / Topic 1" placeholders either. Every chapter (Getting
Started, Installation, Initial Setup, Specifications, Compliance, Support,
Advanced Topics) is real, useful prose that also happens to demonstrate
every content pattern common in a telecom hardware manual: safety-warning
callouts, numbered installation/firmware-update steps, a CLI configuration
example, spec/LED/glossary/troubleshooting/revision-history tables, a
package-contents checklist, an FAQ, and two example diagrams. Copy any
individual pattern for your own manual, or treat the whole thing as a
reference for what this template can hold — see "Content patterns" below.
Every page also ships with real Portuguese and Spanish translations, one
per-language folder per page (`pages/**/pt/*.html`, `pages/**/es/*.html`),
not just an English original — see "Adding real translated content". The
language dropdown shows each
language's own name ("English", "Português", "Español"), not a two-letter
code.

## Running it locally

`fetch()` of the local partials/JSON is blocked by CORS when a page is
opened directly with `file://` — double-clicking a page loads the file but
the header/nav/footer and content never show up. Serve the folder over HTTP
instead:

- **VS Code:** install the "Live Server" extension, **File → Open Folder…**
  on the project root itself (not just one file), then right-click any
  `.html` file → "Open with Live Server". That context-menu option only
  appears once the folder is open as the workspace, not for a file browsed
  to from an unrelated window.
- **No VS Code:**
  ```
  python3 -m http.server 8000
  ```
  then open `http://localhost:8000/`.

## Testing

`tests/smoke.test.mjs` is a headless-browser suite (Puppeteer driving real
Chrome) that clicks through the site the way a visitor would — nav links,
brand/lang/layout selectors, deep links, PDF export — across all 4 layouts.
It exists because the bugs this template actually shipped with (layout
silently changing on navigation, layout 5 not being continuous, a dead gap
in its column layout) were all things "does it look right in one
screenshot" wouldn't have caught; see `docs/ux-evaluation.md` for the list
and how they were found.

```
npm install   # once, pulls in puppeteer-core (dev-only, not part of the site)
npm test      # requires Chrome/Chromium; set CHROME_PATH if it's not at a default location
```

This is QA tooling for maintaining the template, not part of the served
site — the site itself still has zero dependencies and no build step.

## Architecture

- **Pages are real files, not injected fragments.** Every `pages/**/*.html`
  file has its own native HTML content (see `pages/en/menu1/submenu1.html`).
  Only the header/nav/footer chrome is injected via `fetch()`
  (`js/core/partial-loader.js`, from `partials/*.html`). This is what makes deep
  links work even before JS runs, or if it fails to load — the URL is a real
  file with real content in it.
- **`nav-config.json`** is the single source of truth for the menu
  structure — a plain JSON file, not JavaScript, so adding or translating a
  page never requires touching a `.js` file (see "Editing content" below).
  `js/nav/nav-config.js` loads and resolves it; it's consumed by on-page
  navigation (`js/nav/nav-render.js`), the PDF builder (`js/print/print-builder.js`),
  and active-item highlighting.
- **`js/core/page-init.js`** is the per-page orchestrator: resolves the active
  brand/lang/layout (`js/core/state.js`), loads the partials, composes the
  content for layout 5 if needed (`js/content/continuous-manual.js`), renders the
  nav, applies translations, and wires up the header's selectors — all
  without reloading the page.

## State: brand/lang/layout live in `localStorage`, not the URL

`js/core/state.js` is the single place that resolves and persists the current
brand/language/layout. This template used to keep that state in
`?brand=&lang=&layout=` and sync it on every change — but that meant *every*
internal link had to carry the query string forward to the next page, and
it was easy to miss one. (It shipped with exactly that bug: nav links
didn't carry it, so the next page silently fell back to the default
brand's layout.) Reading from `localStorage` instead means any link works
correctly by construction — there's nothing to remember to thread through,
and nav links are just plain URLs again.

The one place the URL still matters: an *external* product linking straight
into a specific brand/language has no prior `localStorage` to read from.
`resolveState()` checks `?brand=&lang=&layout=` first, falls back to
`localStorage`, then to defaults — so a query param on a landing page still
wins for that load, and is immediately persisted so it keeps applying for
the rest of the visit without repeating it in every link afterwards.

## Deep-linking

- A specific page: the file's own URL, e.g. `pages/en/menu1/submenu1.html`.
- A specific section inside a page: an HTML anchor, e.g.
  `pages/en/menu1/submenu1.html#menu1-submenu1-topic2` — the browser scrolls
  there natively, no JS required. (`h1[id]`/`h2[id]`/`h3[id]` get
  `scroll-margin-top` in `css/base.css` so the fixed header doesn't cover
  the heading.)
- Brand/language/layout can be forced from outside with the same query
  params: `pages/en/menu1/submenu1.html?lang=pt&brand=marca-b`. See "State"
  above for how that interacts with `localStorage`.

## Internationalization

Two things translate independently:

1. **UI chrome** — header/footer text, button labels, menu/sidebar entry
   names. `i18n/en.json`, `i18n/pt.json`, and `i18n/es.json` hold these;
   `js/core/i18n.js` fetches the active one and overwrites every `[data-i18n]`
   element's text, no `location.reload()` anywhere. Switching languages
   never triggers a real page load either, in any layout — see "Language
   switching" below.
2. **Page content** — titles and paragraphs — is plain HTML in each
   `pages/**/*.html` file (see "Editing content" below), so it translates by
   creating a second real file, not a JSON entry. See "Adding real
   translated content" just below.

`product.name` is the one i18n key meant to be changed first: it drives the
bold text next to the logo in the header, the `<title>` prefix, and the PDF
cover.

Adding a fourth language: duplicate `i18n/en.json` → `i18n/fr.json`, add
`'fr'` to `LANGS` **and** its native name to `LANG_LABELS` in
`js/theme/brands-config.js` (the header's language dropdown shows each language's
own name — "Português", "Español" — not a country-code abbreviation).
That translates the chrome immediately; translating page content in the
new language is the same per-page opt-in process below.

### Language switching never reloads the page, in any layout

Switching the language dropdown fetches the current page's content in the
new language (its own translated file, or the default-language fallback if
untranslated — see `langPath()`/`fetchLocalizedHTML()` in
`js/nav/nav-config.js`) and swaps it in via the same soft-navigation approach a
nav-link click uses, updating the URL with `history.pushState` — not a real
`window.location` navigation, which is what this used to do. `scroll`
layout needs the *whole* manual recomposed in the new language (every
chapter, not just the current page), so it goes through
`applyLayoutContent()` instead of a plain content swap; that composition
happens in a detached, off-screen element first and gets swapped into
`#page-content` in one atomic step once it's ready, so the previously
composed page stays on screen unchanged the whole time — no flash of blank
content while the other 6 pages are being fetched.

### Adding real translated content for a page

Each page's content is a real file, and a translation is just the same file
in a sibling per-language folder — `pages/en/menu1/index.html` (default
language) has counterparts `pages/pt/menu1/index.html` (Portuguese) and
`pages/es/menu1/index.html` (Spanish). Every page in this template already
has all three — `pages/**/pt/*.html`/`pages/**/es/*.html` are live, working
examples of exactly this, not just documentation of it. `nav-config.json`
declares each page's path once, as a template with a `{lang}` placeholder
(e.g. `"pages/{lang}/menu1/index.html"`), so adding a folder is enough —
nothing else needs to name the new file.

1. Copy the page's folder: `pages/en/menu1/index.html` →
   `pages/pt/menu1/index.html` (or `pages/es/menu1/index.html`, or whichever
   language code you're adding — create the folder if it doesn't exist yet).
2. Open the copy and translate the text inside the `<h1>`/`<h2>`/`<p>` tags —
   keep every `id="..."` unchanged (deep links and the PDF/scroll-layout
   composition depend on them matching the default-language file). Also set
   `<html lang="pt">` (or `"es"`, etc.) at the top, and fix the page's
   in-body links to its own language's sibling pages (e.g. a `pt` page
   should link to `../menu2/index.html`, not the English one).
3. Tell the site the translation exists: open `nav-config.json` (plain JSON,
   not JavaScript — same file everyone already touches to add a page, see
   below), find that page's entry, and add the language code to its
   `"langs"` array, e.g. `"langs": ["pt", "es"]` (every entry in this
   template already has both — copy the pattern). Without this step the
   page still works fine, it's just treated as not-yet-translated into that
   language.

Once declared, everything else follows automatically: the language
selector fetches the file from that language's folder when you're on that
page and swaps it in (no reload — see "Language switching" above), every
nav link to that page points straight at the right language's file, and the
PDF/scroll-layout/print-fallback views that compose the whole manual
together pick it up too. A page with no `"pt"`/`"es"` entry in `langs` is
simply skipped for that language — the language selector leaves it on its
default-language file rather than 404ing, and every "whole manual" export
just includes the default-language version of that one page.

## Editing content (for a non-technical maintainer)

You never need to know JavaScript, and never need to touch a `.js` file —
everything a maintainer does is an HTML page or a plain JSON file (the same
kind of file, and the same editing pattern, used in three places: page
content, `nav-config.json`, `i18n/*.json`):

- **Change what a page says.** Open the page under `pages/` (e.g.
  `pages/en/menu1/index.html`) in any text editor and edit the text inside the
  `<h1>`, `<h2>`, and `<p>` tags directly — it's plain HTML, what you type is
  what shows up, nothing overwrites it. Don't remove the `id="..."` on
  headings; those are what deep links (`#menu1-topic1`) point at.
- **Add a specs table or an example image.** `pages/en/menu2/index.html` (and
  its `pt/`/`es/` counterparts) has a working example of both, styled and
  ready to copy: a `<table class="spec-table">` with a `<caption>` (used for
  connections and for power/physical specs — one row-header style, one
  column-header style, pick whichever fits), and a
  `<figure class="manual-figure"><img>...<figcaption>...</figcaption></figure>`
  for an image with a manual-style caption. Both classes are defined in
  `css/base.css` and print cleanly (a table/figure never splits across a
  page break — see `css/print.css`).

### Content patterns

Every pattern below has a real, working example already in this manual's own
content (not just documentation of the class name) — find it, copy the HTML,
and rewrite the text. All of them are defined in `css/base.css` (on-screen)
with a matching copy in `css/print.css` (the dedicated PDF export, which
doesn't load `base.css` — see that file's own comment for why).

| Pattern | Class | Where to find a working example |
|---|---|---|
| Spec table (connections, power, dimensions) | `.spec-table` | Specifications (`pages/en/menu2/index.html`) |
| LED status table | `.spec-table` (reused) | Specifications, "LED Indicators" |
| Glossary / row-label table | `.spec-table` (reused) | Advanced Topics (`pages/en/menu3/submenu1.html`) |
| Troubleshooting table | `.spec-table` (reused) | Support (`pages/en/menu3/index.html`) |
| Revision history table | `.spec-table` (reused) | Compliance (`pages/en/menu2/submenu1.html`) |
| Example figure with caption | `.manual-figure` | Specifications, and Installation's own diagram |
| Safety/note/tip callouts | `.callout` + `.callout-note`/`.callout-tip`/`.callout-warning`/`.callout-danger` | Getting Started, "Safety Warnings" |
| Numbered installation/update steps | `.steps` (a plain `<ol>`, CSS counters, no JS) | Installation, and Advanced Topics' firmware update |
| CLI / config-file example | `.cli-block` (a styled `<pre><code>`) | Initial Setup |
| "What's in the box" / feature checklist | `.contents-list` | Getting Started, "Package Contents" |
| FAQ (question/answer pairs) | `.faq-list` (a plain `<dl>`) | Support, "Frequently Asked Questions" |
- **Rename an entry in the menu/sidebar.** That name is shared across every
  page (so it doesn't have to be edited seven times), so it lives in
  `i18n/en.json` / `i18n/pt.json` / `i18n/es.json` instead — find the `nav.*`
  key that matches (e.g. `"nav.menu1": "Getting Started"`) and change the text after
  the colon. Edit all three files the same way so every language stays in
  sync.
- **Change the header/footer text or button labels.** Same three JSON
  files, the non-`nav.*` keys — each one's own key name says what it's for.
- **Add a whole new page.** Copy an existing page for the `<head>`/`<body>`
  boilerplate, add one entry to `nav-config.json` (plain JSON, copy an
  existing entry and change `id`/`labelKey`/`path`), and add its `nav.*`
  label to all three `i18n/*.json` files. See the "Add a page" row in
  Maintenance below.
- **Add a translation of a page's content.** See "Adding real translated
  content" above — create the file in the `pt/`/`es/` sibling folder, add its
  language code to the `"langs"` array in its `nav-config.json` entry.
- **Change colors or fonts.** See "Multi-brand build" below — it's one CSS
  file per brand, and every variable in it has a plain-English comment.

## Multi-brand build

`js/theme/brands-config.js` maps each brand id to its theme CSS, logo, and default
layout:

```js
export const BRANDS = {
  intelbras: { theme: 'themes/theme-intelbras.css', logo: 'assets/logos/intelbras.svg', layout: 'sidebar' },
  'marca-b':  { theme: 'themes/theme-marca-b.css',  logo: 'assets/logos/marca-b.svg',   layout: 'navbar' },
  generic:    { theme: 'themes/theme-generic.css',  logo: 'assets/logos/generic.svg',   layout: 'scroll' },
};
```

Every theme file implements the same CSS variable contract, documented in
`themes/theme-schema.md`. Adding a brand = a new `theme-*.css` + a logo + one
entry in `BRANDS` — nothing else changes.

Colors are granular: beyond the base palette (`--color-primary`,
`--color-secondary`, `--color-text`, `--color-bg`), each theme file can
optionally set its own color for the sidebar background, menu/submenu link
text and background in each state (normal, hover, selected), the navbar's
dropdown submenu panel, and the header/footer background — see the
"Component colors" table in `themes/theme-schema.md`. Every one of these is
optional and falls back to the base palette if left unset, so a minimal
theme (just the 8 required variables) still looks correct; `theme-marca-b.css`
has a live example of several of them actually set. Every variable, in every
theme file, has an inline comment saying exactly what it controls.

The layout selector in the header lets you override a brand's default
layout manually (handy for comparing all four side by side). `BRANDS[id]
.layout` is only that brand's *default* — used the very first time a
visitor arrives with nothing in `localStorage` yet (see "State" above) —
switching brands afterwards only swaps the theme/logo/favicon and
deliberately leaves whatever layout you already have selected alone.

### Single-brand build

If you're forking this template for one fixed brand, strip the multi-brand
machinery in 3 steps:

1. Delete `js/theme/theme-switcher.js`.
2. Remove the `<!-- INÍCIO: THEME SWITCHER -->…<!-- FIM: THEME SWITCHER -->`
   block from `partials/header.html`.
3. In every page's `<head>`, change
   `<link rel="stylesheet" id="theme-css" href="...themes/theme-generic.css">`
   to point at your one theme file, and delete the rest of the `BRANDS` map
   in `js/theme/brands-config.js` down to a single entry (or hard-code the theme
   path directly and drop `brands-config.js` + the brand bits of
   `page-init.js` altogether).

## Layouts

Layout is a per-brand default (`BRANDS[id].layout`) overridable per-visit
via the header's layout selector or `?layout=`. `js/core/page-init.js` toggles a
`body.layout-{sidebar,navbar,scroll,hybrid}` class; `css/layout-*.css` do
the rest.

- **`sidebar`** — full menu tree fixed on the left, always visible. Best for
  long manuals with deep structure.
- **`navbar`** — top-level menus in a horizontal bar, submenus as dropdowns
  on hover/focus. More "marketing site" than "docs site".

Clicking a menu link in either of these doesn't trigger a real browser
navigation. Pages are still real, separately fetchable files (see
"Architecture"), but `js/core/page-init.js` intercepts a same-origin click,
fetches the target page, and swaps `#page-content` + the URL via
`history.pushState` instead — the header/nav/footer chrome (loaded once via
`js/core/partial-loader.js`) just stays put, since it's identical on every page.
A full browser navigation used to blank and re-fetch that chrome on every
click even though it never actually changes — that visible reload was a
reported usability bug, not how a single-page-feeling manual should behave.
The browser's Back/Forward buttons work the same soft way (`popstate`), and
a plain click still does a real navigation with JS disabled, or for
anything this deliberately skips (an external link, a new-tab click,
`print.html`).
- **`scroll`** — the entire manual, every menu and submenu, reads as one
  continuously-scrolling page. Whichever page you actually loaded is
  composed client-side (`js/content/continuous-manual.js`) with every other page
  fetched and appended around it, in `nav-config.json` order — each chapter
  demoted into a `<section class="chapter-section">`, each submenu nested
  inside it as a `.chapter-subsection`. Every nav entry (top-level and
  submenu) becomes an in-page anchor, so clicking anything just scrolls —
  no navigation, no reload, regardless of which chapter it's in. As you
  scroll, `js/nav/scrollspy.js` highlights whichever chapter/submenu is
  currently in view directly in that same nav tree via
  `IntersectionObserver`, matching the original "sidebar destaca a seção
  visível" brief.
  Every page still keeps its own real URL and stays independently
  deep-linkable — loading `pages/en/menu1/submenu1.html` directly still works;
  it composes the same whole-manual view, scrolled to that submenu (an
  explicit `#topic-id` in the URL wins over that if present).
  As you scroll, `js/nav/scrollspy.js` highlights whichever chapter/submenu is
  currently in view directly in that same nav tree — not by watching for a
  heading to intersect a band near the top (that leaves a real gap with
  nothing highlighted for however long a section's content is taller than
  the band), but by tracking which heading was the last to scroll past a
  fixed trigger line, so exactly one entry is always active, gap or no gap
  between headings.
- **`hybrid`** — a top bar with only the top-level menus (no dropdowns);
  whichever one you're currently "inside" (its own page, or any of its
  submenu pages) shows its own submenus as a separate, contextual sidebar
  below the bar instead. A cross between `navbar` (top-level bar) and
  `sidebar` (a docked "where am I" column) — soft-navigates the same way as
  `sidebar`/`navbar` (no reload, real pages). The top bar and the contextual
  sidebar are two genuinely separate elements (`js/core/page-init.js` creates the
  sidebar one on demand, as a sibling of `#site-nav`/`#page-content`) rather
  than one nested inside the other — nesting them and un-boxing the wrapper
  with `display: contents` looked simpler but silently broke the top bar's
  ability to span both grid columns in testing (a real rendering quirk with
  `display: contents` grandchildren, not something more CSS fixed).

## Search

The search box in the header (`js/content/search.js`) searches the *entire*
manual's actual content — every page, not just whichever menu/submenu is
currently open — and works identically in all 4 layouts. There's no
backend and no build step in this template (see "Architecture" below), so
there's no precomputed/server-side search index either: on first use it
fetches every page once (the same `fetchLocalizedHTML()` the `scroll`
layout and PDF export already use to compose the whole manual), splits
each page into sections by heading, and does a plain case-insensitive
substring match over heading + body text (this includes table cells and
figure captions — anything in the page's text). It's warmed in the
background shortly after each page loads (and again after a language
switch) so the first real search usually doesn't wait on those fetches,
and is cached per language for the rest of the visit.

This is the right trade-off for a manual with a few dozen pages, not a
shortcut taken to avoid the real thing — a manual with hundreds of pages
would genuinely want a precomputed index (e.g. built at deploy time), which
needs an actual build step this template deliberately doesn't have.

Clicking a result reuses the same soft-navigation every in-manual link
already goes through in `sidebar`/`navbar`/`hybrid` (no reload); in
`scroll` layout, where the whole manual is already on the page, it just
scrolls to the matched heading instead.

## PDF export

Every page has a "Download as PDF" link in the footer (`data-pdf-link`,
wired up in `js/core/page-init.js`) pointing at `print.html` — with no query
string, since `print.html` reads the visitor's current brand/language from
`localStorage` the same way the rest of the site does (see "State" above),
falling back to `?brand=&lang=` if given explicitly. It deliberately never
*writes* to that shared `localStorage` — generating a PDF in a different
brand/language than you're currently browsing in shouldn't change what the
rest of the site remembers.

`js/print/print-builder.js` always builds the whole manual — every menu and
submenu, via `flattenNav()` over `nav-config.json` — regardless of which
page you followed the PDF link from:

1. Builds a cover (logo + `product.name` + subtitle) from the active brand.
2. Builds a table of contents from `nav-config.json`.
3. Fetches every page's `#page-content` **in the currently selected
   language only** — the language dropdown on `print.html` (or whichever
   language you were browsing in when you followed the "Download PDF" link)
   picks one language for the whole document; a page's other language's
   file is never touched during that export, so the PDF never mixes two
   languages. A page not yet translated into the selected language (see
   "Adding real translated content") falls back to the default-language
   file for just that one page rather than mixing in a 404 or blank
   section — every page in this template has both languages, so that case
   doesn't come up here.
   Each fetched page is appended as a `<section class="chapter">`.
4. Runs `js/core/i18n.js` over the assembled document.
5. Hands it to the Paged.js polyfill (`vendor/paged.polyfill.js`, bundled
   locally — no CDN dependency), which paginates it in the browser with real
   page boxes, running footers (`counter(page)`), and TOC page numbers
   resolved via `target-counter()` (see `css/print.css`).

Once the toolbar says "Ready", print with `Ctrl+P`/`Cmd+P` → Save as PDF.

### Plain Ctrl+P also works, from any page, any layout

A browser's native print can only ever print what's actually in the current
page's DOM. In `scroll` layout that's already the whole manual — but in
`sidebar`/`navbar`, `#page-content` normally only holds the one page you're
on, so hitting Ctrl+P there used to just print that single page.
`js/print/print-fallback.js` fixes this: on those two layouts it composes the
whole manual (reusing `js/content/continuous-manual.js`) into a hidden
`#print-manual` container as soon as the page settles, and
`css/print-fallback.css` swaps it in for `#page-content` specifically under
`@media print`. It's built eagerly, not on the print event itself — there's
no reliable way to delay `window.print()` for async work, so by the time
someone actually prints (after reading the page for a moment) it needs to
already be done.

This fallback is intentionally simpler than the `print.html` flow above —
plain CSS page breaks and browser page numbers, no cover, no resolved table
of contents. `print.html` + Paged.js is still the polished, canonical
export; this just means an unmodified Ctrl+P is never wrong, for anyone who
reaches for it instead of the footer link. It also gets its own brand
logo + product name header (`.print-manual-header`), and the browser's
native print header/footer (when enabled) shows a generic
"Product name — User Guide" title instead of whichever specific page you
happened to be on — both handled the same way for `print.html` itself.

### One-click download from the header

Every page also has a "Download PDF" button fixed in the header, next to
the brand/layout/language selectors (`#pdf-download-button`,
`partials/header.html`). Clicking it opens `print.html?autoprint=1` in a
new tab, which automatically calls `window.print()` itself as soon as
pagination is ready — skipping the step of waiting for "Ready" and
pressing Ctrl+P manually. It still ends at the browser's own Save dialog:
no browser lets a page write a file to disk without that, for any site,
by design — `window.print()` is as close to "one click" as it gets. The
footer's "Download as PDF" link is unaffected and still opens a plain,
un-primed preview for anyone who wants to look before printing.

## Maintenance without a build tool

| Task | What to do |
|---|---|
| Change a page's title/text | Edit the `<h1>`/`<h2>`/`<p>` tags directly in that page's `pages/**/*.html` file |
| Rename a menu/sidebar entry, or header/footer text | Edit `i18n/en.json` / `i18n/pt.json` / `i18n/es.json` — the key already tells you where |
| Add a page | Create `pages/en/menuX/new-page.html` (copy an existing page for the boilerplate `<head>`/`<body>` shell and write its content directly), add an entry to `nav-config.json`, add its `nav.*` label to both `i18n/*.json` files |
| Translate a page's content | Copy it to `pages/pt/menuX/name.html` (or `pages/es/menuX/`), translate the text, add the language code to `"langs"` in its entry in `nav-config.json` — see "Adding real translated content" |
| Add a language | Duplicate `i18n/en.json` → `i18n/xx.json`, translate the chrome values, add `'xx'` and its native name to `LANGS`/`LANG_LABELS` in `js/theme/brands-config.js` (page-content translation is per-page, see above) |
| Change colors (any component) | Edit the one `themes/theme-<brand>.css` file for that brand — every variable is commented in plain English, see `themes/theme-schema.md` |
| Change fonts | Same file, `--font-heading` / `--font-body` |
| Add a brand | New `themes/theme-<brand>.css` (follow `themes/theme-schema.md`), logo in `assets/logos/`, one entry in `BRANDS` |
| Go single-brand | Follow "Single-brand build" above |
| Regenerate the PDF | Open `print.html`, wait for pagination, print → Save as PDF (use "Back to manual" in the toolbar to return) |
| Link in from an external product | Copy the page's URL (+ `#anchor-id` for a specific topic, + `?lang=&brand=` to force those) |

None of this requires a terminal, a build step, or deep JS/CSS knowledge.

## Manual generator

`generator/index.html` is a second entry point — a small standalone tool, separate
from the manual itself — for producing a customized copy of this template
without touching any code. Building a custom manual is the whole main
flow — a form on the left and a live preview `<iframe>` on the right, side
by side, no tab to switch into. The generator's own chrome (labels, button
text, status messages — not the manual being built, which has its own
separate language checkboxes) is itself translatable: a language `<select>`
in the header switches it live via `generator/i18n/<lang>.json` +
`js/generator/i18n.js`, and the choice persists to `localStorage` under
`generator-lang`, shared with `generator/templates.html` below.

- A form for the 5 required theme colors
  (`--color-primary/secondary/accent/text/bg`), corner radius, heading/body
  font, a logo + favicon upload (both optional — skip either and the
  generated manual just falls back to this template's own generic-brand
  logo/favicon, every other customization still applies), product name, one
  layout, and which languages to include (English is always included;
  Portuguese/Spanish are optional). Each color field has a small ⓘ hint
  (native `title` tooltip) naming which page elements it actually controls
  (Primary → links/buttons/accents, Secondary → borders, ...) — a swatch
  alone doesn't say that. The preview `<iframe>` updates live as you
  type/pick — colors and product name apply instantly (no reload, done by
  touching `iframe.contentDocument` directly — see
  `js/generator/theme/preview.js`), a layout change reloads the preview with the
  new layout; the previewed manual's own language dropdown is filtered down
  to just the languages you've checked (`filterPreviewLanguages()`), live,
  without a reload. The previewed manual's OWN brand/layout dropdowns are
  hidden inside that iframe (an injected `<style>`, since the generator's
  own controls already pick both from outside — showing the same choice
  twice would just be confusing); it always starts on the generic brand and
  whichever layout the form's own radio group has selected (`sidebar` by
  default). Applying overrides waits on `waitForPreviewReady()` — not just
  the iframe's own 'load' event, which fires before `js/core/page-init.js`'s own
  async chain (and its OWN later re-application of translations once the
  hidden print fallback finishes building) is actually done, or that later
  pass would silently overwrite the custom logo/product name right back to
  the default. "Download PDF" (the header button or the footer link) inside
  this preview also reflects the customization, not just the generic
  brand — clicking it is intercepted (`interceptPdfLinks()`, a
  capture-phase listener so it runs before `js/core/page-init.js`'s own
  click handler) and stashes the current theme/logo/favicon/product name
  into `sessionStorage` before opening `print.html?generatorPreview=1` in a
  new tab, which `js/print/print-builder.js` picks up (a small, purely additive
  `overrides` parameter — `undefined` on every normal PDF export, including
  every one in a generated manual, so this never changes default behavior).
  When you're happy with it, "Download my manual" builds a real `.zip`
  client-side (via `vendor/jszip.min.js`, no server involved) and downloads
  it.
- Each font dropdown (heading/body) renders every built-in stack IN that
  actual font — picking one previews it right there in the list — plus an
  "Upload your own font…" option that reveals a file input; the uploaded
  file is embedded live in the preview via a `data:`-URL `@font-face` rule
  (`applyCustomFontFaces` in `js/generator/theme/preview.js`) and, at download
  time, as a real font file (`assets/font-heading-custom.<ext>` /
  `assets/font-body-custom.<ext>`) referenced from `theme-custom.css` with
  its own `@font-face` block — not a data URI in the shipped file, so the
  generated theme stays a plain, readable/editable CSS file like every
  other one.
- **Ready-made templates** — browsing the brands/layouts exactly as they
  ship today is a secondary path, not equal billing with the form above: a
  "Browse ready-made templates" link in the header's corner opens
  `generator/templates.html` in a new tab — its own brand/layout `<select>`s driving
  its own preview `<iframe>` (same brand/layout-dropdown-hiding as above),
  full screen, no size constraints to fight, and the custom-manual form's
  state in the original tab is completely untouched by it. Nothing to
  download from it, just a way to compare options.

The generated `.zip` is a minimal, working copy of this template — only what
this particular download actually needs, not the whole project. The always-
shipped shared files are listed in `js/generator/package/file-manifest.js`'s
`CORE_FILES` (**if you add a new static file every manual needs, add it
there too, or generated manuals won't include it**); everything else is
selected per-download: exactly one layout's CSS (`css/layout-<layout>.css`
— the other 3 are never even fetched), exactly one theme
(`themes/theme-custom.css`, generated from `themes/theme-generic.css` with
your chosen values filled in — the other brands' theme files are never
fetched), exactly one logo and one favicon (the file you uploaded, or this
template's own generic-brand one if you didn't, either way saved under a
fixed `assets/logo-custom.<ext>` / `assets/favicon-custom.<ext>` name), and
only the pages for the languages you picked (derived from `nav-config.json`,
not hand-listed). `js/theme/brands-config.js` is regenerated as a single `custom`
brand/layout with no theme switcher (the two `js/core/page-init.js` checks below
automatically hide the now-pointless brand/layout selectors), `i18n/*.json`
only includes the languages you picked (with `product.name` replaced),
`nav-config.json`'s `langs` are filtered the same way, and `index.html` is
regenerated to redirect straight to the default-language home page. Every
page's own `<link>` tags are rewritten to match — pointing at the one theme/
layout/favicon this zip actually ships, not the ones it doesn't. It also
gets its own short generated `README.md`.

`js/core/page-init.js` hides the header's brand selector when `BRANDS` has one
entry, and the layout selector when `LAYOUTS` has one entry — both
generalizations of logic that already implicitly existed, not
generator-specific hacks, so they apply to any hand-edited single-brand
fork too (see "Single-brand build" above).

`generator/index.html`, `generator/templates.html`, and their own
`generator/i18n/<lang>.json` dictionaries are tooling for producing a
manual, not part of any manual itself — they live in their own
`generator/` folder (alongside `js/generator/*.js`) and are deliberately
absent from `js/generator/package/file-manifest.js`, so they never end up inside a
generated `.zip`.

## Deploy

Fully static — any HTTP host works (GitHub Pages, Netlify, Cloudflare Pages,
or a plain Apache/nginx). No build step; just copy the folder.

### Cloudflare Pages

Recommended when your domain's DNS is already on Cloudflare (a subdomain is
then a couple of clicks with automatic TLS, no separate DNS host to manage):

1. In the Cloudflare dashboard, create a Pages project from this repo.
   Framework preset: **None**. Build command: **(empty)**. Build output
   directory: **`/`**.
2. Add a custom domain (e.g. `manual.yourdomain.com`) to the Pages project —
   since the domain is already on the same Cloudflare account, the DNS
   record is created for you.
3. `_headers` and `_redirects` at the repo root are Cloudflare Pages'
   config format (long-cache headers for `assets/`/`vendor/`, and 301s for
   the generator tool's old pre-reorg URLs) — both are picked up
   automatically, no build step needed, and neither ships inside a
   generated manual (see `js/generator/package/file-manifest.js`).

**One thing worth knowing:** Cloudflare Pages canonicalizes URLs —
`/foo.html` redirects to `/foo`, and `/dir/index.html` redirects to `/dir/`.
`js/nav/nav-config.js`'s `canonicalizePagePath()` already normalizes both the
`.html` and the trailing-slash form back to the same nav item, specifically
so active-nav-highlighting and the language switch keep working after that
redirect — but it's worth clicking through a page once after deploying to
confirm (nav highlighting, language switch, PDF export) rather than only
trusting local testing, since the local dev/test server doesn't perform
that redirect itself.

Netlify is a drop-in equivalent if you'd rather not deal with that
redirect behavior at all (it has a `pretty_urls` toggle Pages doesn't) — a
`netlify.toml` with `publish = "."` and no build command works the same
way.
