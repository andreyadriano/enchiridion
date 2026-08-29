# Architecture

Technical internals of the manual template — state management, deep-linking,
layouts, search, and PDF export. For editing content without touching code,
see [`authoring.md`](authoring.md). For the generator tool, see
[`generator.md`](generator.md).

## Pages are real files, not injected fragments

Every `pages/**/*.html` file has its own native HTML content (see
`pages/en/menu1/submenu1.html`). Only the header/nav/footer chrome is
injected via `fetch()` (`js/core/partial-loader.js`, from `partials/*.html`).
This is what makes deep links work even before JS runs, or if it fails to
load — the URL is a real file with real content in it.

`nav-config.json` is the single source of truth for the menu structure — a
plain JSON file, not JavaScript, so adding or translating a page never
requires touching a `.js` file (see `authoring.md`). `js/nav/nav-config.js`
loads and resolves it; it's consumed by on-page navigation
(`js/nav/nav-render.js`), the PDF builder (`js/print/print-builder.js`), and
active-item highlighting.

`js/core/page-init.js` is the per-page orchestrator: resolves the active
brand/lang/layout (`js/core/state.js`), loads the partials, composes the
content for `scroll` layout if needed (`js/content/continuous-manual.js`),
renders the nav, applies translations, and wires up the header's selectors —
all without reloading the page.

## State: brand/lang/layout live in `localStorage`, not the URL

`js/core/state.js` is the single place that resolves and persists the
current brand/language/layout. This template used to keep that state in
`?brand=&lang=&layout=` and sync it on every change — but that meant *every*
internal link had to carry the query string forward to the next page, and it
was easy to miss one. (It shipped with exactly that bug: nav links didn't
carry it, so the next page silently fell back to the default brand's
layout.) Reading from `localStorage` instead means any link works correctly
by construction — there's nothing to remember to thread through, and nav
links are just plain URLs again.

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
  `scroll-margin-top` in `css/base.css` so the fixed header doesn't cover the
  heading.)
- Brand/language/layout can be forced from outside with the same query
  params: `pages/en/menu1/submenu1.html?lang=pt&brand=marca-b`. See "State"
  above for how that interacts with `localStorage`.

## Layouts

Layout is a per-brand default (`BRANDS[id].layout`) overridable per-visit via
the header's layout selector or `?layout=`. `js/core/page-init.js` toggles a
`body.layout-{sidebar,navbar,scroll,hybrid}` class; `css/layout-*.css` do the
rest.

- **`sidebar`** — full menu tree fixed on the left, always visible. Best for
  long manuals with deep structure.
- **`navbar`** — top-level menus in a horizontal bar, submenus as dropdowns
  on hover/focus. More "marketing site" than "docs site".

Clicking a menu link in either of these doesn't trigger a real browser
navigation. Pages are still real, separately fetchable files (see above),
but `js/core/page-init.js` intercepts a same-origin click, fetches the target
page, and swaps `#page-content` + the URL via `history.pushState` instead —
the header/nav/footer chrome (loaded once via `js/core/partial-loader.js`)
just stays put, since it's identical on every page. A full browser
navigation used to blank and re-fetch that chrome on every click even though
it never actually changes — that visible reload was a reported usability
bug, not how a single-page-feeling manual should behave. The browser's
Back/Forward buttons work the same soft way (`popstate`), and a plain click
still does a real navigation with JS disabled, or for anything this
deliberately skips (an external link, a new-tab click, `print.html`).

- **`scroll`** — the entire manual, every menu and submenu, reads as one
  continuously-scrolling page. Whichever page you actually loaded is
  composed client-side (`js/content/continuous-manual.js`) with every other
  page fetched and appended around it, in `nav-config.json` order — each
  chapter demoted into a `<section class="chapter-section">`, each submenu
  nested inside it as a `.chapter-subsection`. Every nav entry (top-level and
  submenu) becomes an in-page anchor, so clicking anything just scrolls — no
  navigation, no reload, regardless of which chapter it's in. As you scroll,
  `js/nav/scrollspy.js` highlights whichever chapter/submenu is currently in
  view directly in that same nav tree via `IntersectionObserver` — not by
  watching for a heading to intersect a band near the top (that leaves a
  real gap with nothing highlighted for however long a section's content is
  taller than the band), but by tracking which heading was the last to
  scroll past a fixed trigger line, so exactly one entry is always active,
  gap or no gap between headings.

  Every page still keeps its own real URL and stays independently
  deep-linkable — loading `pages/en/menu1/submenu1.html` directly still
  works; it composes the same whole-manual view, scrolled to that submenu
  (an explicit `#topic-id` in the URL wins over that if present).

- **`hybrid`** — a top bar with only the top-level menus (no dropdowns);
  whichever one you're currently "inside" (its own page, or any of its
  submenu pages) shows its own submenus as a separate, contextual sidebar
  below the bar instead. A cross between `navbar` (top-level bar) and
  `sidebar` (a docked "where am I" column) — soft-navigates the same way as
  `sidebar`/`navbar` (no reload, real pages). The top bar and the contextual
  sidebar are two genuinely separate elements (`js/core/page-init.js`
  creates the sidebar one on demand, as a sibling of
  `#site-nav`/`#page-content`) rather than one nested inside the other —
  nesting them and un-boxing the wrapper with `display: contents` silently
  broke the top bar's ability to span both grid columns (a real rendering
  quirk with `display: contents` grandchildren, not something more CSS
  fixed).

## Search

The search box in the header (`js/content/search.js`) searches the *entire*
manual's actual content — every page, not just whichever menu/submenu is
currently open — and works identically in all 4 layouts. There's no backend
and no build step in this template, so there's no precomputed/server-side
search index either: on first use it fetches every page once (the same
`fetchLocalizedHTML()` the `scroll` layout and PDF export already use to
compose the whole manual), splits each page into sections by heading, and
does a plain case-insensitive substring match over heading + body text (this
includes table cells and figure captions — anything in the page's text). It's
warmed in the background shortly after each page loads (and again after a
language switch) so the first real search usually doesn't wait on those
fetches, and is cached per language for the rest of the visit.

This is the right trade-off for a manual with a few dozen pages, not a
shortcut taken to avoid the real thing — a manual with hundreds of pages
would genuinely want a precomputed index (e.g. built at deploy time), which
needs an actual build step this template deliberately doesn't have.

Clicking a result reuses the same soft-navigation every in-manual link
already goes through in `sidebar`/`navbar`/`hybrid` (no reload); in `scroll`
layout, where the whole manual is already on the page, it just scrolls to
the matched heading instead.

## PDF export

Every page has a "Download as PDF" link in the footer (`data-pdf-link`,
wired up in `js/core/page-init.js`) pointing at `print.html` — with no query
string, since `print.html` reads the visitor's current brand/language from
`localStorage` the same way the rest of the site does, falling back to
`?brand=&lang=` if given explicitly. It deliberately never *writes* to that
shared `localStorage` — generating a PDF in a different brand/language than
you're currently browsing in shouldn't change what the rest of the site
remembers.

`js/print/print-builder.js` always builds the whole manual — every menu and
submenu, via `flattenNav()` over `nav-config.json` — regardless of which
page you followed the PDF link from:

1. Builds a cover (logo + `product.name` + subtitle) from the active brand.
2. Builds a table of contents from `nav-config.json`.
3. Fetches every page's `#page-content` **in the currently selected language
   only** — the language dropdown on `print.html` (or whichever language you
   were browsing in when you followed the "Download PDF" link) picks one
   language for the whole document; a page's other language's file is never
   touched during that export, so the PDF never mixes two languages. A page
   not yet translated into the selected language falls back to the
   default-language file for just that one page rather than mixing in a 404
   or blank section. Each fetched page is appended as a
   `<section class="chapter">`.
4. Runs `js/core/i18n.js` over the assembled document.
5. Hands it to the Paged.js polyfill (`vendor/paged.polyfill.js`, bundled
   locally — no CDN dependency), which paginates it in the browser with real
   page boxes, running footers (`counter(page)`), and TOC page numbers
   resolved via `target-counter()` (see `css/print.css`).
6. Appends a back-cover quick-reference card (web interface URL, default
   login, factory-reset steps, support contact) as the document's last page.

Once the toolbar says "Ready", print with `Ctrl+P`/`Cmd+P` → Save as PDF.

### Plain Ctrl+P also works, from any page, any layout

A browser's native print can only ever print what's actually in the current
page's DOM. In `scroll` layout that's already the whole manual — but in
`sidebar`/`navbar`, `#page-content` normally only holds the one page you're
on, so hitting Ctrl+P there used to just print that single page.
`js/print/print-fallback.js` fixes this: on those two layouts it composes
the whole manual (reusing `js/content/continuous-manual.js`) into a hidden
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
reaches for it instead of the footer link. It also gets its own brand logo +
product name header (`.print-manual-header`), and the browser's native print
header/footer (when enabled) shows a generic "Product name — User Guide"
title instead of whichever specific page you happened to be on.

### One-click download from the header

Every page also has a "Download PDF" button fixed in the header, next to the
brand/layout/language selectors (`#pdf-download-button`,
`partials/header.html`). Clicking it opens `print.html?autoprint=1` in a new
tab, which automatically calls `window.print()` itself as soon as pagination
is ready — skipping the step of waiting for "Ready" and pressing Ctrl+P
manually. It still ends at the browser's own Save dialog: no browser lets a
page write a file to disk without that, for any site, by design. The
footer's "Download as PDF" link is unaffected and still opens a plain,
un-primed preview for anyone who wants to look before printing.
