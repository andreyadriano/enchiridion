# UX/UI evaluation

Self-review against objective criteria, used to drive fixes before delivery
(target: ≥ 8/10 overall). Scored against the shipped state after the fixes
in this pass — see `tests/smoke.test.mjs` for the automated checks that back
several of these (layout persistence, no-reload switching, PDF output).

**Re-scored as of round 14** (real Intelbras brand identity + the scroll-
layout space-utilization fix below) — see that section for what changed and
why since the original pass. A new criterion (11, brand fidelity) was added
this round; it didn't exist as a scored dimension before because every brand
was still a placeholder.

| # | Criterion | Score /10 | Notes |
|---|---|---|---|
| 1 | Visual hierarchy & typography | 8 | Clear heading scale, 1.6 line-height, consistent sizing across all 7 pages and 3 brand themes. Unchanged this round. |
| 2 | Color contrast & accessibility | 8 | Default theme colors pass WCAG AA for body text; skip-to-content link, `<header>/<nav>/<main>/<footer>` landmarks, `aria-label` on nav, `aria-current` on active links, native focus rings preserved. Re-checked against the new Intelbras palette specifically: `#2b2b2b` on white (body text) and white-on-`#06cb3f` (active/hover nav) both clear WCAG AA. |
| 3 | Navigation clarity & wayfinding | 9 | Active item highlighted in all 3 layouts; scroll layout adds an "on this page" panel. Only a 2-level hierarchy, so no breadcrumb needed. Scroll layout's scrollspy no longer has dead zones (round 14 bugfix, see below) — previously there were real gaps while scrolling where *nothing* was highlighted, which would have capped this below 9. |
| 4 | Interactive feedback (hover/focus/active) | 9 | Hover states on nav links, scrollspy links, selects, and the header logo/product-name link. Raised from 8: the Intelbras theme's hover/active nav treatment (solid brand-green fill + white text) now matches a real, functioning reference site's own CSS (`manual-unnit.intelbras.com.br`) instead of an invented pastel tint — feedback states are load-bearing *and* on-brand now, not just present. |
| 5 | Consistency across layouts & brands | 8 | Same content/nav model renders uniformly under all 3 layouts × 3 brand themes; verified visually via screenshots. Content-column width was inconsistent across layouts before this round (700/800/800px, no shared logic) — now a deliberate progression (820/900/960 for scroll/sidebar/navbar, widest where there's no competing side column) instead of accidental drift. |
| 6 | Responsiveness | 8 | Fixed a real bug: below 760px the fixed-width sidebar was crushing content into single-word-wide lines with no breakpoint at all. Now a single shared breakpoint collapses all 3 layouts to a clean stacked layout. Re-verified at 375px after this round's width changes — `responsive.css` already resets `max-width`/`margin` on `.layout-shell` and `.page-content` at the breakpoint, so none of the round-14 desktop-width increases leak into mobile. One breakpoint only — no separate tablet tuning. |
| 7 | Information density & whitespace | 8 | Raised from 7 after a real structural fix, not just more placeholder content (see round 14 below): all 3 layouts left large, viewport-dependent dead margins on desktop/wide screens independent of content length — worst in `scroll`, which centered a fixed 1040px block and could leave 400px+ of pure dead space on each side at 1920px, and `sidebar`, which dumped 100% of its slack as one asymmetric gutter on the right instead of framing the content evenly. Fixed with wider, viewport-proportional shell/content caps and (for `sidebar`) a `margin: auto` centering trick. Still capped well short of full-bleed on purpose — text wider than ~90ch hurts readability, and real docs sites (Stripe, MDN, the Intelbras reference sites checked this round) all leave *some* desktop margin by design. |
| 8 | Deep-linking & i18n UX | 9 | Anchor deep-links land correctly after partials/chapter content inject; brand/lang/layout switch with zero reloads and stay synced in the URL and across navigation, in all 3 layouts (the scroll-layout language-switch flash was a separate, later-fixed bug — see round 13). |
| 9 | Print/PDF output quality | 8 | Cover, resolved table of contents with real page numbers, and readable chapter pagination via Paged.js — verified by rendering and inspecting the output. Table/figure styling in the dedicated PDF path fixed in round 12. Unchanged this round (the space-utilization fix is screen-only; print layout has its own fixed page geometry from `css/print.css`, not the flexible `.layout-shell` this round touched). |
| 10 | Maintainability for an HTML-only editor | 9 | Plain CSS (no framework), one concern per file, everything commented at the "why," matches the target maintainer skill level from the brief. |
| 11 | Brand fidelity (new this round) | 9 | Every brand asset for `intelbras` now traces to a real, verifiable source instead of a plausible invention: the logo is the actual current wordmark (extracted from `intelbras.com`'s own favicon vector art, CC-BY-SA-licensed as a Wikimedia sanity check), the favicon is the literal PNG served by `intelbras.com`, the green (`#06cb3f`) and typeface (`Intelbras Sans`, loaded from Intelbras's own font host) come straight from that site's inline CSS custom properties, and the hover/active nav treatment was matched against a real, functioning Intelbras product-manual site's own stylesheet rather than guessed. Not a 10: the neutral chrome gray (`#e2e9ef`) is a reasonable synthesis from a legacy manual site rather than a token pulled from the current corporate design system, and `marca-b`/`generic` remain intentionally-fictional placeholder brands (correct for a white-label *template*, but they cap this criterion's ceiling since it's only fully verified for one of the three brands). |

**Overall: 8.4 / 10** (up from 8.2 — driven by the interactive-feedback, whitespace, and new brand-fidelity work this round; nothing regressed).

## What's intentionally left for manual design polish

Per the original brief, fine visual design is a manual follow-up step, not
this pass's job — this evaluation only exists to catch *usability* defects
(broken navigation, no responsive behavior, missing feedback states), not to
replace that step. Left for later, on purpose:

- Real brand typography/imagery (current logos are placeholder SVG monograms).
- Denser, more opinionated visual rhythm once real (non-lorem-ipsum) content
  fills the page — the sparse desktop whitespace mostly disappears once
  paragraphs are a realistic length.
- Finer responsive tuning between 760px and ~1000px if a design pass wants
  a distinct tablet treatment.

## Round 2 — user-reported issues

After delivery, the user caught three more real problems this evaluation's
first pass missed:

1. **Layout still "changed itself" in sidebar/navbar mode.** The root cause
   was broader than the link-query-string bug fixed in round 1: state lived
   in the URL at all, and nothing ever persisted it to `localStorage`
   despite being read from there. Rather than patch that further, state
   management moved to `js/state.js` — `localStorage`-first, with the URL
   only as an explicit one-time override for external deep links (see
   README "State"). This removes the bug class entirely: nav links are
   plain URLs again, nothing to thread through.
2. **Scroll layout wasn't actually a single page.** Round 1 made it
   continuous within one chapter, but cross-chapter links still navigated
   — contradicting the "single page" brief. `js/continuous-manual.js` now
   composes the *entire* manual (every menu, every submenu) onto whichever
   page was loaded; every nav entry becomes an in-page anchor;
   `js/scrollspy.js` highlights position across chapter boundaries, not
   just within one.
3. **PDF discoverability.** `print.html` already pulled every menu (this
   was verified, not actually broken), but nothing in the UI linked to it —
   worth fixing regardless of the specific report. Added a "Download as
   PDF" link to the footer, and made `print.html` default to the visitor's
   current brand/language via the same `localStorage` state instead of
   requiring query params.

Scores 3 (navigation clarity), 6 (responsiveness — unaffected but re-verified),
and 8 (deep-linking & i18n UX) hold or improve slightly under this design;
no criterion regressed. `tests/smoke.test.mjs` grew from 58 to 65 checks
covering all three fixes, including the specific race conditions and a
malformed test URL found while validating them.

## Round 3 — Ctrl+P only printed the current page in sidebar/navbar

The dedicated `print.html` flow (verified again — still correct, all 7
pages, all 3 menus) was never the problem; a *plain* browser Ctrl+P was.
That only ever prints the current page's DOM, and `#page-content` in
`sidebar`/`navbar` layout only ever holds the one page on screen — so
native print silently produced a 1-menu document, while `scroll` layout
(where `#page-content` is already the whole manual) printed correctly by
coincidence, not by design.

Not a Paged.js/library limitation — it's what "print the current page"
means on any multi-page site by default. Fixed by giving `sidebar`/`navbar`
their own hidden, full-manual content for print media specifically
(`js/print-fallback.js` + `css/print-fallback.css`, reusing
`js/continuous-manual.js`), so an unmodified Ctrl+P is correct regardless
of layout.

**Validation method** (the user specifically asked this not be hand-wavy):
`tests/smoke.test.mjs` now uses `page.emulateMediaType('print')` — the
same rule Chromium's real print pipeline uses to decide what renders, not
a proxy for it — to assert `#page-content` is hidden and the full-manual
fallback shown, for both `sidebar` and `navbar`. On top of that,
`page.pdf()` generates an actual PDF and checks it's well-formed
(`%PDF-` header, non-trivial size). A generated sample was manually
inspected too: 3 pages, all 3 menus and every submenu, correctly
paginated and translated — see the round-3 fix notes below for the
full text. 65 → 81 checks.

## Round 4 — missing branding, misleading print header, one-click download

Three more issues from testing the round-3 print fallback in practice:

1. **Missing logo/product name.** The round-3 fallback composed all the
   content but skipped the branding the dedicated `print.html` cover
   already had. Added a `.print-manual-header` (logo + product name) at
   the top, tagged `data-brand-logo` so it stays in sync on brand switches
   via the same mechanism the header's own logo already uses — no need to
   rebuild the (fetch-heavy) fallback just because the brand changed.
2. **Misleading per-page title in the browser's native print header.**
   `document.title` was left as whichever specific submenu the visitor
   happened to load (e.g. "Product name — Menu 1 Submenu 1"), which the
   browser's own print header/footer (when enabled) then stamped on every
   page of what is now a multi-menu document. Fixed with `beforeprint`/
   `afterprint` listeners that swap to a generic "Product name — User
   Guide" only while actually printing, then restore whatever was showing
   before — captured live at print time so it's still correct after a
   later brand/lang switch, not frozen at page load.
3. **One-click download.** Added a "Download PDF" button fixed in the
   header next to the brand/layout/language selectors. It opens
   `print.html?autoprint=1`, which calls `window.print()` itself once
   pagination is ready — the closest a page can get to "one click" without
   a user gesture at a native Save dialog, which no browser lets a page
   skip, for any site. Answers the user's direct question: not a library
   limitation, a hard platform constraint.

Validated with `page.evaluateOnNewDocument()` to stub `window.print()`
*before* navigation (avoids any race with `print.html`'s own script) for
both the `?autoprint=1` and plain-link cases, `window.open()` interception
to check the header button's URL deterministically (no real popup), and
manual `beforeprint`/`afterprint` event dispatch to verify the title
swap — plus a regenerated sample PDF, visually confirmed to show the
Intelbras logo and "Nome do produto" at the top. 81 → 92 checks.

## Round 5 — maintainability for a non-technical editor, granular colors, print home link

A direct request to raise criterion 10 (maintainability) further: the
brief's "kept by a non-technical editor" bar wasn't fully met yet, and
color theming wasn't granular enough for real per-component branding.

1. **Editing a page's text silently did nothing.** Every page's `<h1>`/`<h2>`/
   `<p>` had `data-i18n`, so `js/i18n.js` overwrote whatever the HTML said
   with the matching `i18n/*.json` value on every load — a non-technical
   editor changing the HTML directly would see their edit vanish, with no
   error to explain why. Removed `data-i18n` (and the corresponding
   `menuX.*.title`/`.body` keys) from all page body content in all 7 pages;
   that content is now plain static HTML, edited directly and safely.
   `i18n/*.json` now holds only UI chrome (header/footer/buttons) and the
   nav/sidebar entry names — both genuinely shared across every page, so a
   single edit point still makes sense there. Trade-off, stated up front in
   the README: page body text no longer switches with the language
   selector (it didn't carry real translations anyway — the two JSON files'
   lorem ipsum bodies were always identical by design).
2. **Colors weren't granular enough for real component-level branding.**
   Added ten optional CSS variables (sidebar background, menu/submenu link
   text+background for normal/hover/selected states, dropdown submenu
   panel background+border, header/footer background) on top of the
   existing base palette — see the expanded table in
   `themes/theme-schema.md`. Every one falls back to the base palette if a
   theme file doesn't set it, so no existing theme broke; `theme-marca-b.css`
   sets several of them as a live, working example rather than only
   documentation. Wired into `css/base.css` and all three `css/layout-*.css`
   files.
3. **No way back from `print.html` except the browser's back button.**
   Added a "Back to manual" link in the print toolbar (hidden under
   `@media print` like the rest of the toolbar).

Validated by extending `tests/smoke.test.mjs`: a language-switch check that
now asserts on a chrome string that actually differs between `en`/`pt`
(`header.language`: "Language"/"Idioma") instead of the removed
`[PT]`-prefix content demo; a check that `#back-to-manual` points at
`index.html`; and computed-style assertions (`getComputedStyle`) that
`theme-marca-b`'s sidebar background and active-nav-link colors resolve to
its actual override values, not a silent fallback to the base palette.
92 → 96 checks.

## Round 6 — real translated page content, not just chrome

A direct follow-up question after round 5 removed `data-i18n` from page
bodies: "how do I write a new menu with content in two languages now?" Fair
— round 5 fixed the editing trap but didn't leave a path to genuine
per-page translation.

**Design chosen (offered as options, this one picked):** one real HTML file
per language, not a return to JSON-driven content. `pages/menu1/index.html`
(default/English) gets a sibling `pages/menu1/index.pt.html`; which pages
have one is declared per-item via `langs: ['pt']` in `js/nav-config.js`
(`pages/menu1/index.pt.html` + that declaration now ship as a real, working
example, not just documentation). This was picked over two alternatives:
reinstating `data-i18n` per page (brings back the round-5 editing trap) or
leaving content untranslatable (real regression for a template whose brief
explicitly asks for `en`/`pt`).

Consequences worked through:

- `js/nav-config.js` gained `langPath(item, lang)` (resolves to the
  translated file only if declared) and `stripLangSuffix(pathname)` (so a
  loaded `index.pt.html` still resolves to the `menu1` nav item/chapter,
  used by `findNavContext`, deep-linking, and active-item highlighting).
- Nav links (`js/nav-render.js`) now point at the current language's actual
  file — the `langs` declaration decides this at render time, no network
  probing, so a link is never generated to a file that doesn't exist.
- The language selector (`js/page-init.js`) now does a real navigation when
  switching to/from a page that has a translated file — unlike brand/layout,
  content is genuinely different HTML, not a re-render. On a page with no
  translation it just re-renders chrome, same as before.
- Every view that composes the *whole* manual together (scroll layout,
  `print.html`'s PDF, the Ctrl+P print fallback) needed to fetch each page
  in the visitor's language too, still working for a manual where only some
  pages are translated. `js/nav-config.js` added `fetchLocalizedHTML(item,
  lang)` for this, used by `continuous-manual.js` and `print-builder.js`.

**A real bug found while validating this:** the first implementation
fetched the translated file speculatively and caught the 404 in JS when it
didn't exist. The catch worked — nothing broke — but Chrome still logs a
failed `fetch()` as a console network error regardless of whether the code
handles it, so every page that composes the whole manual (which mostly
isn't translated yet) started failing the suite's "no console errors"
checks, 22 of them on one run. Fixed by trusting the `langs` manifest
instead of probing: `fetchLocalizedHTML` only ever requests a file the
manifest says exists, so an untranslated page is never actually fetched
under a wrong URL. This is also why `langs` is declared statically instead
of discovered at runtime — it's not just simpler, probing is what caused
the regression.

Validated with `tests/smoke.test.mjs`: one test drives the language
selector on the translated `menu1` page and asserts the URL actually
navigates to `index.pt.html` and the rendered heading/body come from that
file's own Portuguese text, not the English one; another confirms a nav
link to an untranslated page (`menu2`) still points at its plain `.html`
file from a `pt` page; another confirms switching languages on an
untranslated page doesn't navigate at all (nothing to navigate to). The
"no console errors" regression above was caught by the pass/fail of the
existing checks in this same run, not a new one — worth calling out since
it's exactly the kind of failure a passing individual test can hide until
it's run in the fuller suite. 96 → 101 checks.

## Round 7 — complete the translation set, no `.js` edits ever, single-language PDFs

Three direct follow-ups after round 6 shipped the per-file translation
model with only one page (`menu1`) actually translated:

1. **"Faça todas as páginas atuais em ambos os idiomas."** Created the
   remaining 6 `.pt.html` siblings (`menu1/submenu1`, `menu1/submenu2`,
   `menu2/index`, `menu2/submenu1`, `menu3/index`, `menu3/submenu1`) and
   declared `"langs": ["pt"]` for every one in `nav-config.json`. All 7
   pages are now genuinely bilingual, not just the one demo page.
2. **"Se o usuário quiser adicionar mais páginas, vai precisar mexer em
   algo que não seja HTML?"** Honest answer at the time: yes, one `.js`
   file (`js/nav-config.js`'s `NAV` array). Fixed by moving that data out
   of JavaScript entirely into `nav-config.json` — a plain JSON file,
   editable the same way `i18n/*.json` already is. `js/nav-config.js` now
   only holds the *functions* that operate on it (`loadNav`, `langPath`,
   `findNavContext`, etc.), fetched once via `fetch()` like `i18n/*.json`
   already was. Every consumer (`nav-render.js`, `continuous-manual.js`,
   `print-builder.js`, `print-fallback.js`, `scrollspy.js`, `page-init.js`)
   changed from a static `import { NAV }` to receiving the loaded nav data
   as a parameter — mechanical, but touched most of `js/`. After this, a
   maintainer's only two non-HTML files, ever, are the two kinds they
   already use for everything else: `nav-config.json` and `i18n/*.json`.
3. **"Na página do print deve pegar somente o idioma selecionado."** This
   was already mostly true structurally (`fetchLocalizedHTML` always
   resolves one language), but round 6 shipping with only one page
   translated meant a Portuguese PDF would have silently included 6
   English sections via the default-language fallback — a real
   single-document language mix, exactly what was reported. Completing the
   translation set (point 1) removes the fallback path entirely for this
   manual: every page now really does have both languages, so a PDF in
   either language is 100% that language, verified per-chapter, not just
   on the cover.

Validated by extending `tests/smoke.test.mjs`: the PDF test now asserts
every chapter's body text (`#source .chapter p`), not just the cover,
matches the selected language, so a mix would be caught even if only one
page were affected. Two round-6 tests that had depended on `menu2` being
the "untranslated" example no longer had a real fixture to point at (every
page is translated now) — replaced with a direct unit check of `langPath()`
itself (imported straight from the running page via dynamic `import()`) so
the "not-yet-translated page falls back safely" behavior is still verified
even though no page in this template currently exercises it. 101 → 104
checks.

## Round 8 — spec tables and an example figure

Added the content patterns a real product manual/datasheet needs beyond
plain prose paragraphs, as a working example in `pages/menu2/index.html`
(+ its `.pt.html` sibling), not just CSS classes with no demonstration:

- `.spec-table` (`css/base.css`): two examples — a column-header table
  (Connections: connector / type / description, one row per port) and a
  row-header table (Power supply & physical specs: one spec per row, e.g.
  dimensions, weight, operating temperature) — the two shapes datasheet
  tables actually come in. `<caption>` renders above the table per common
  manual convention ("Table 1 — Connections").
- `.manual-figure` (`css/base.css`): an example rear-panel connection
  diagram (`assets/example-product-rear.svg`, drawn generic/neutral-gray so
  it doesn't clash with any brand's theme color) with a
  `<figure>/<figcaption>` caption in the standard "**Figure 1.** Caption
  text." manual format.
- `css/print.css` / `css/print-fallback.css`: `break-inside: avoid` on both
  classes so a table or figure doesn't split awkwardly across a page
  boundary in either PDF path.

Validated visually (screenshot of the rendered page — table/figure/caption
render correctly themed under the `intelbras` brand) and via the existing
test suite, which was already exercising this page's content indirectly
(scroll-layout composition, print fallback, PDF export all fetch this page
too) — the full 104-check suite still passes with the new content included,
confirming `demoteBy()`'s heading-retagging and the PDF/scroll composition
don't choke on a table or figure sitting between headings.

## Round 9 — sidebar/navbar navigation felt like a reload, because it was one

"A troca de página/menu nos modos sidebar e navbar não está suave e
consigo ver a página recarregando todos os elementos." Accurate: clicking
any nav link in those two layouts was, and always had been, a full browser
navigation — the header/nav/footer chrome (`js/partial-loader.js`) is
fetched via JS on every page load, so every click blanked the whole page
and re-fetched identical chrome. `scroll` layout never had this problem
(its nav is all in-page anchors), which is presumably why it wasn't
reported until now.

Fixed with client-side ("soft") navigation for `sidebar`/`navbar`: a
same-origin click to another manual page is intercepted, the target page
is fetched, and only `#page-content` + the URL (`history.pushState`) are
swapped — chrome that's already loaded and identical across every page
stays exactly where it is. `index.html`'s own link now points straight at
`pages/menu1/index.html` (it was a client-side redirector to that same
page, so a real click there used to be two navigations, not one). A CSS
opacity fade (`.page-content.is-transitioning`, `css/base.css`) makes the
swap read as a transition rather than an instant cut, skipped entirely
under `prefers-reduced-motion`. Pages are still real, independently
fetchable files with no change to deep-linking, `file://`-adjacent
resilience, or JS-disabled fallback (a plain click still navigates for
real when this is skipped — external links, new-tab clicks, `print.html`).

**Two bugs found while building this, both timing bugs, not logic bugs:**

1. First version used `document.startViewTransition()` for a nicer
   crossfade. Awaiting its `.finished` promise hung indefinitely in this
   project's headless-Chrome test runner — silently stalling every soft
   navigation forever, caught because `history.pushState` (which came
   *after* that await) never actually ran, so the URL never updated.
2. Removing that await didn't fully fix it: `startViewTransition()`'s
   update callback isn't necessarily run inline — it can be deferred to a
   later frame. That meant the nav-tree rebuild inside it could still be
   *scheduled but not yet applied* when the next line of code (or, in
   testing, Puppeteer's next `page.click()`) ran, occasionally clicking a
   nav link mid-rebuild and getting `Error: Node is either not clickable`.
   Dropped the View Transitions API entirely in favor of a plain,
   synchronous CSS opacity toggle — same smooth feel, no scheduling
   uncertainty: the DOM swap and `history.pushState` both happen inline,
   guaranteed complete before the function returns.

A third correctness bug, found via the "active nav link" test rather than
by symptom: `renderNav()` (which relies on `window.location` to decide
which link gets `.is-active`) was originally called *before*
`history.pushState` — so it was still highlighting the *previous* page
every time. Reordered so the URL updates first.

Validated with a new `tests/smoke.test.mjs` block that goes after the
actual claim, not just a proxy for it: a `window.__marker` set right after
load must survive a nav-link click (a real navigation would reset the JS
realm and wipe it) and survive the browser's Back button too; the URL and
`<h1>` must reflect the clicked page; the clicked link must carry
`.is-active` afterward. A separate direct check confirms the target page's
own HTML is fetched and that nothing under `partials/`, `css/`, or
`themes/` is ever re-requested (a harmless Chrome favicon re-check after
`pushState` is the only other request seen) — the concrete mechanism
behind the fix, not just its visible symptom. 104 → 122 checks.

## Round 10 — soft-nav follow-ups: no fade, right item highlighted, no reload on re-click

Three reports right after round 9 shipped soft navigation:

1. **The fade felt like a delay, and blocked feeling "clickable" for a
   moment.** Removed entirely — `css/base.css`'s `.is-transitioning`
   opacity toggle and the `requestAnimationFrame` pair driving it in
   `js/page-init.js` are gone. The swap is now a plain, instant
   `innerHTML` replace.
2. **Clicking a link sometimes highlighted the previous item instead of
   the one just clicked.** Not actually about highlighting logic (round 9
   already fixed the ordering bug there) — it was a race: click link A,
   then click link B before A's fetch resolves, and if A's response
   happens to land *after* B's (both are near-instant on localhost, so
   ordering isn't guaranteed), A's stale `applyDom` runs last and
   overwrites what B had already rendered. Fixed with a navigation token —
   `softNavigateTo` bumps a counter on entry and checks it's still current
   after every `await` (the fetch, and reading the response body); a
   superseded call quietly discards itself instead of applying stale
   content over newer content.
3. **Clicking the already-selected/active menu item caused a real, abrupt
   full-page reload.** The "same page, nothing to swap" branch returned
   early without calling `preventDefault()`, so the browser's own default
   action ran — and a browser's default action for a link pointing at the
   exact current URL is to reload it for real. Fixed: still exits early for
   an in-page `#hash` (needs the native anchor scroll), but now calls
   `preventDefault()` first when there's no hash at all, so the click is a
   genuine no-op instead of a disguised reload.

Validated by extending the same `tests/smoke.test.mjs` block: no element
ever carries the transition class; two links clicked back-to-back (both
`.click()`-dispatched inside a single `page.evaluate()` so they land in the
same task, ahead of either's fetch resolving — a real double-`page.click()`
call turned out to race Puppeteer's own async click machinery against the
first click's near-instant local response and hit a `Node is detached`
error, which is what pushed the test toward the in-page dispatch instead)
must leave the *last*-clicked page showing and only *its* link highlighted;
a `window.__marker` must survive all of it (still no real reload anywhere,
including re-clicking the current page's own link). 122 → 134 checks.

## Round 11 — logo link ignored the current language

"Ao clicar no ícone da logo, ele está voltando para o index.html ao invés
de voltar para o index do idioma atual." Correct: the header logo/home link
(`js/page-init.js`) was hard-coded to `pages/menu1/index.html` — a leftover
from before round 6 added per-language content files — instead of going
through `langPath()` like every other nav link does. Clicking it from a
Portuguese page silently dropped you back into English. Fixed with the same
`langPath(nav[0], state.lang)` call the rest of the nav tree already uses.
Validated with a direct check: load `menu2/index.html?lang=pt`, read the
home link's `href`, assert it ends in `/pages/menu1/index.pt.html`. 134 →
135 checks.

## Round 12 — spec tables/figures were unstyled in the dedicated PDF export

"Imagens devem ser centralizadas no pdf" / "Corrija a formatação das
tabelas no pdf." Root cause: `.spec-table`/`.manual-figure` (added in
round 8) only exist in `css/base.css` — which every content page loads,
so the Ctrl+P print fallback (which prints the actual page, base.css and
all) already rendered them correctly. `print.html`, the dedicated
Paged.js-paginated PDF flow, never loads `css/base.css` at all — only
`css/print.css` — so its table came out as a bare, unbordered `<table>`
and the figure's image had no centering or border. Fixed by giving
`css/print.css` its own copy of both rules (borders, header shading,
row striping, `break-inside: avoid`, figure centering/caption styling) —
kept in sync by hand with the base.css originals, called out in a comment
on both sides since this template has no CSS bundler to share them via.
Verified against an actual generated PDF (`page.pdf()`, read back page by
page) — Table 1's cells now have visible borders and a shaded header row,
and the rear-panel figure sits centered with its caption underneath.
Validated in `tests/smoke.test.mjs` via computed-style checks on the
`print.html` source (`border-top-width` on a cell, `background-color` on
the header row, `text-align: center` on the figure) so this can't silently
regress if `css/print.css` and `css/base.css` drift apart again.
135 → 138 checks.

## Round 13 — Spanish, native language names, and language switching that never reloads

Four related requests in one round:

1. **"Adicione o idioma espanhol."** Added `es` to `LANGS` in
   `js/brands-config.js`, `i18n/es.json` (chrome strings), a real
   `.es.html` sibling for all 7 pages (not just a demo page — every page is
   now fully trilingual), and `"es"` alongside `"pt"` in every `langs`
   array in `nav-config.json`.
2. **"O valor do dropdown de idiomas não deve ser siglas e sim o nome do
   idioma por extenso e no próprio idioma."** The dropdown showed `EN`/`PT`
   (`lang.toUpperCase()`). Added `LANG_LABELS` (`{ en: 'English', pt:
   'Português', es: 'Español' }`) next to `LANGS` in `brands-config.js`,
   used by both the header's dropdown (`js/page-init.js`) and `print.html`'s
   own brand/language selector.
3. **"A troca de idiomas faz a página recarregar daquela forma brusca."**
   The language selector did a real `window.location.href` navigation to
   the translated file — the same class of bug fixed for nav links in
   round 9, just missed here since content genuinely is a different file
   per language. Rewrote it to reuse `fetchLocalizedHTML()` (already used
   internally for whole-manual composition) to fetch the current page's
   content in the new language and swap it in via `history.pushState`,
   exactly like a nav-link soft nav — chrome (nav/header/footer
   translations) updates in the same pass since `applyTranslations()` was
   already being called regardless.
4. **"No modo scroll a troca de idioma ainda causa a página recarregando de
   forma brusca."** Fixing #3 wasn't enough for `scroll` layout: switching
   languages there needs the *whole* manual recomposed (every chapter),
   which went through `applyLayoutContent()` — and that function cleared
   `#page-content` to blank *before* re-fetching and re-composing every
   other chapter, so even without a real reload, the visible page collapsed
   to empty and rebuilt piece by piece — a real, separate bug from #3, not
   fully explained by "not a real navigation". Fixed by composing into a
   detached, off-screen `<div>` first and swapping it into `#page-content`
   with a single `innerHTML` assignment only once everything is ready — the
   previously-composed page now stays on screen, completely unchanged,
   until the new one is ready to replace it atomically.

### A test-suite rabbit hole, for the record

Adding Spanish's tests exposed a real, reproducible bug in the *test
harness*, not the product: with enough new fetch-heavy tests (the language-
switch tests fetch every one of the 7 pages, twice, to build/rebuild the
print fallback), a full run would reliably hang forever on one unrelated,
much-later test's `page.goto()`. Chased through several wrong turns — a
suspected Chrome resource leak (ruled out: identical hang on a freshly
recycled browser instance), a suspected orphaned-fetch/connection-pool
issue (ruled out: `Connection: close` headers and an explicit
network-idle wait before closing each test's browser context didn't fix
it) — before a raw `curl` issued at the exact moment of the hang, bypassing
Chrome entirely, timed out identically. That proved the *dev server itself*
(a bare `python3 -m http.server`, thread-per-connection) was wedging under
this suite's sustained automated load, not anything Chrome- or
product-side. Fixed by replacing it with a small in-process Node
`http.createServer` static file server for the test suite specifically
(event-loop based, not thread-per-connection — the class of failure doesn't
apply). Three consecutive full clean runs afterward, where it had failed
consistently before. 122 → 150 checks.

## Round 14 — a real brand, scrollspy gaps, and page-space utilization

Three related requests: implement a genuine Intelbras visual identity
(not placeholder colors/logo), fix a scroll-layout scrollspy bug found
along the way, then re-run this whole evaluation and check specifically
whether page space is well used — especially in `scroll` layout.

1. **Real brand identity.** Previously `themes/theme-intelbras.css` and
   `assets/logos/intelbras.svg` were plausible-looking placeholders (a
   generic blue, a hand-drawn monogram) — fine for a template's *only*
   example brand, but not what was asked here. Replaced with assets and
   values traced to real Intelbras sources, not invented:
   - **Logo**: `intelbras.com`'s own `safari-pinned-tab.svg` (a monochrome
     mask svg, standard for that favicon format) contains the actual
     current wordmark as vector paths — cropped to its real bounding box
     and recolored to the brand green. Confirmed against the separate
     Wikimedia Commons `Intelbras_wordmark.svg` (CC BY-SA) as a sanity
     check, then corrected on direct user feedback that the Wikimedia
     version reads "chunkier" than the current mark — the site's own asset
     is the one shipped.
   - **Favicon**: the literal `favicon-32x32.png` served by `intelbras.com`
     itself, not a redrawn approximation.
   - **Colors**: `#06cb3f` (brand green), `#002723` (deep green accent),
     `#2b2b2b`/`#efefed` (text/neutral) — read directly out of
     `intelbras.com`'s own inline `:root` CSS custom properties
     (`--primary-medium-color` etc.), not sampled off a screenshot.
   - **Typography**: `Intelbras Sans`, the brand's own variable webfont,
     loaded from its real public host (`backend.intelbras.com`) via
     `@font-face` in the theme file, with a `system-ui` fallback stack.
   - **Hover/active nav color**: first pass used a light green tint, which
     the user flagged as wrong. Checked the *actual, functioning* CSS at
     `manual-unnit.intelbras.com.br` (a real Intelbras product-manual
     site) — its nav uses a **solid** green fill with white text on both
     hover and active/selected, not a pastel tint. Matched that exactly:
     `--color-nav-link-bg-hover`/`--color-nav-link-bg-active` are now
     `var(--color-primary)` with white text, bold rather than guessed.
   - Chrome (header/sidebar/footer) deliberately stayed a neutral
     blue-gray (`#e2e9ef`, also lifted from that same real reference site)
     rather than brand green — green is reserved for the handful of things
     that should draw the eye, per the user's own explicit instruction not
     to overuse the primary brand color everywhere.
2. **Scrollspy left gaps with nothing highlighted.** Separately reported:
   "enquanto eu scrollo existem intervalos em que nenhum dos menus... está
   selecionado." Root cause: `js/scrollspy.js` used an `IntersectionObserver`
   watching a thin band near the top of the viewport, and only marked a nav
   link active while its *own* heading intersected that band — once a long
   section's heading scrolled past the band, nothing intersected it again
   until the *next* heading arrived, leaving a real gap with zero active
   links for the length of that section. Rewrote with the standard
   scrollspy algorithm instead: a heading counts as "reached" once it
   crosses a fixed trigger line near the top, and the active link is always
   the *last* heading reached — exactly one link active at every scroll
   position, gap or no gap in between headings. Verified by scripting a
   full-page scroll in 150px steps and asserting `.nav-link.is-active`
   count is always exactly 1 — confirmed no gap anywhere in the page.
3. **Page space wasn't well used, especially in `scroll` layout.** Measured
   directly (screenshots at 1440px and 1920px, common laptop/desktop
   widths) rather than eyeballing:
   - `scroll` layout centered a fixed `1040px` shell — at 1920px wide that
     left **~440px of pure dead space on each side**, making the whole
     nav+content block look like a small island floating in empty white.
     Fixed by widening the shell to `1280px` and the content column from
     `700px` to `820px` — at a typical 1366-1440px laptop width this is now
     nearly edge-to-edge; wide desktop monitors still get a sane margin
     (readability, not a bug — text past ~90ch per line is hard to read,
     and every real reference site checked this round, including
     Intelbras's own, caps prose width the same way).
   - `sidebar` layout's content used `flex: 1` with only a `max-width`, no
     centering — so once content hit its cap, **100% of the leftover space
     piled up as one asymmetric gutter on the right**, while the sidebar
     stayed correctly pinned to the true left edge. Fixed with `margin: 0
     auto` on the content flex item, which (per the flexbox spec) absorbs
     leftover main-axis space via auto margins once a flex item's size is
     capped below what `flex: 1` would otherwise give it — splits that same
     leftover space evenly on both sides of the text column instead of
     dumping it all on one side. The sidebar itself was deliberately left
     alone (flush to the viewport edge): centering the *whole* nav+content
     block, the way `scroll` does, would float the sidebar away from the
     edge too, which is not how sidebar-style docs UIs (this template's own
     stated model) are ever built.
   - Bumped the base `.page-content` measure (800px → 900px) and `navbar`'s
     (800px → 960px) at the same time for a consistent, deliberate width
     progression across all 3 layouts, rather than three unrelated numbers
     that happened to drift apart over past rounds.

Re-verified `css/responsive.css` still resets every one of these to
`max-width: none` / `margin: 0` at the existing 760px breakpoint, so none
of these desktop-width increases could leak into the mobile layout — checked
with a 375px-wide screenshot, unchanged from before this round.

This is also the round that added **criterion 11 (brand fidelity)** to the
table above — it wasn't a meaningful scored dimension before, since every
brand was still a placeholder; see that row for the score and reasoning.
150/150 existing checks pass unmodified; no new automated check was added
for the space-utilization change specifically (subjective/visual by nature),
but the scrollspy gap fix and its exactly-one-active-link invariant are the
kind of thing worth locking down — left as a follow-up if this template
grows a visual-regression test setup.

## Round 15 — layout-specific spacing feedback, and a 4th layout

Direct feedback on round 14's space-utilization pass, one complaint per
layout, plus a new layout entirely:

1. **"No modo sidebar ficou muito espaço entre o conteúdo e a sidebar."**
   Round 14 added `margin: 0 auto` to `sidebar`'s content column specifically
   to *balance* leftover space evenly on both sides once content hit its
   max-width — but that meant a real gap now sat directly between the
   sidebar and the content, which read as a mistake rather than "well
   used" space. Reverted: content goes back to hugging the sidebar with
   just its own base padding, and any leftover space on wide viewports
   lands after the content (right edge) instead of before it.
2. **"No modo scroll... o conteúdo com menus e submenus... deveria ficar
   realmente colado à direita."** The nav column was centered as part of
   the whole `.layout-shell` block, not actually pinned to the viewport's
   true right edge. Restructured: the shell is full-bleed again, and
   `margin-left: auto` on the nav column (order:2, so it's last in the flex
   row) is what actually docks it flush right — mirroring how `sidebar`
   docks its own nav flush left. Content stays flush left with its own
   max-width; any gap now legitimately sits *between* content and nav on
   very wide screens, not on the outside where it read as wasted space.
3. **"No navbar eu preferiria os menus mais ao centro."** → then, once
   centered: **"eles ocupam pouco... esticados até pegarem todo o
   comprimento da div de conteúdo?"** → clarified further: **"esticar para
   ocupar todo o espaço"** (the buttons themselves, not just the group).
   Iterated through three states: `justify-content: center` (small cluster
   in the middle) → the nav list capped to `.page-content`'s own max-width
   and centered, `justify-content: space-between` (spread across that
   width, but only 3 small buttons with big gaps) → final: each `.nav-item`
   given `flex: 1` so the buttons themselves stretch to fill an equal share
   of that width, text centered within each. Also fixed a related, smaller
   complaint: the scroll-layout nav column (220px) was wrapping "Menu 1
   Submenu 1" onto 2 lines — widened to 280px, matching `sidebar`'s own nav
   column width for consistency.
4. **A new 4th layout: `hybrid`.** Requested after a design discussion: a
   top bar showing only the top-level menus (no dropdowns), with whichever
   chapter you're currently inside showing its own submenus as a separate,
   contextual sidebar — a cross between `navbar` and `sidebar`. Implemented
   as `css/layout-hybrid.css` + a dedicated `renderHybridTree()` branch in
   `js/nav-render.js`.
   **A real, reproducible rendering bug found while building this, not a
   CSS mistake to tune away:** the first implementation nested both the
   top-bar list and the contextual sidebar inside the one `<nav id=
   "site-nav">` element every page already provides, un-boxing it with
   `display: contents` so its two children could be positioned
   independently by CSS Grid (`grid-area`/`grid-row`/`grid-column`) as if
   they were direct children of `.layout-shell`. Measured (not eyeballed)
   via actual `getBoundingClientRect()` calls: the *position* of each piece
   resolved correctly (right grid line, right row), but an item meant to
   *span both columns* (the top bar) silently collapsed to just its first
   column's width instead — a `display: contents`-grandchild-specific
   sizing bug, confirmed by testing both named (`grid-template-areas`) and
   explicit numeric (`grid-row`/`grid-column`) placement, both bugged
   identically, and confirmed working correctly in a minimal isolated
   reproduction *without* the extra nesting level. Root cause isolated by
   bisection, not guesswork. Fixed by giving up on the shared-`<nav>`
   approach entirely: `js/page-init.js`'s `getHybridSidebarRoot()` creates
   the contextual sidebar as a second, genuinely separate element — a real
   sibling of `#site-nav`/`#page-content` inside `.layout-shell`, not nested
   inside either — so both pieces are true, non-promoted grid items and the
   sizing bug doesn't apply. `#site-nav` itself just *is* the top bar now,
   no wrapper needed.
   Hidden (`display: none`, base.css) by default and only shown when
   `body.layout-hybrid` is active (`css/layout-hybrid.css`), same pattern
   already used for the print fallback's `#print-manual` — created once and
   left inert in the DOM rather than added/removed on every layout switch.

Validated with 9 new checks in `tests/smoke.test.mjs`: the top bar shows
exactly the 3 top-level menus and nothing else; the current chapter is
highlighted in the top bar; the sidebar shows only that chapter's own
submenus; clicking a sidebar link soft-navigates (URL changes, `<h1>`
changes, a `window.__marker` set before the click survives — proving no
real reload) while the *parent* chapter stays highlighted in the top bar;
clicking a *different* top-level chapter swaps the sidebar to that new
chapter's own submenus, still with no reload. 150 → 159 checks. The
layout-specific spacing fixes (points 1-3) were re-verified visually
(screenshots at 1440/1920px) rather than with new automated checks — same
as round 14, this is a subjective/visual class of change.

## Round 16 — scroll-layout margin, sticky footer, brand/layout independence, full-manual search

1. **"No modo scroll... o conteúdo todo colado na esquerda... não me
   parece muito bom."** Round 15 docked the nav column flush to the true
   right edge, which (correctly) left content flush against the *left*
   edge with only the shell's small 1rem padding. Gave the left side more
   room specifically (`padding: 0 1rem 0 3rem` on `.layout-shell`) — kept
   asymmetric on purpose, since the nav column already has its own visual
   boundary (border + background) on the right and doesn't need the same
   breathing room.
2. **"Quando a página é pequena... a div de conteúdo deve ocupar toda a
   página e deixar espaço só para o footer ficar ao fim... sem precisar
   rolar."** → then, after the first attempt: **"o sticky footer não tá
   funcionando legal no layout sidebar. precisa rolar."** Correct — the
   first fix (`body` as a column flexbox, `.layout-shell { flex: 1 0 auto }`
   so it absorbs leftover vertical space) was necessary but not
   sufficient: `sidebar` layout's own `.site-nav` had a hard-coded
   `height: calc(100vh - header-height)`, which forced that much vertical
   space to exist *regardless* of the footer, overflowing the viewport by
   exactly the footer's own height on any short page. Root-caused by
   comparing measured numbers, not guessing: `.site-nav`'s rendered height
   (765px) plus header (64px) plus footer (70px) added up to exactly the
   page's total scroll height (900px viewport + 70px overflow) — proving
   the nav's fixed height was the culprit, not the flex setup. Fixed by
   removing that hard-coded height and switching `.layout-shell`'s
   `align-items` from `flex-start` to `stretch` (the default) instead — the
   nav now fills exactly however tall `.layout-shell` actually resolves to
   (which itself correctly leaves room for the footer via the flex column),
   with no viewport-relative magic number needed at all. `scroll`/`hybrid`'s
   own nav columns already used `max-height` (a cap, not a forced height)
   so they were never actually affected by this specific bug — verified by
   measuring `footerTop`/`scrollHeight` directly (not just eyeballing) on a
   short page in all 4 layouts, and re-checked that a long page (the whole
   manual, or a page with the spec tables) still pushes the footer down
   normally with no overlap.
3. **"Trocar a marca não deve trocar o estilo de layout."** The brand
   selector's change handler forced `state.layout` to that brand's own
   default layout on every switch (`BRANDS[id].layout`), stepping on
   whatever layout the visitor had actually chosen. That field is still
   meaningful as the *first-visit* default (`js/state.js` `resolveState()`
   already falls back to it only when there's nothing in `localStorage`
   yet) — removed only the *later* forcing behavior from the brand
   selector itself, so switching brands now only swaps theme/logo/favicon.
   A round-9-era test asserted the old (now explicitly unwanted) behavior;
   updated it to assert the new one instead of just deleting the coverage.
4. **Full-manual search.** "Tem como fazer... independente do layout?" —
   yes: `js/search.js` builds a small in-memory index by fetching every
   page once (the same `fetchLocalizedHTML()` scroll layout/PDF export
   already use), splitting each page's content into sections by heading
   (reusing each `<h2>`'s own hand-authored id — the same ids scroll
   layout's anchors already use, so a result can link straight to the exact
   spot). A plain case-insensitive substring match over heading + body text
   (including table cells and figure captions — anything in the page's
   text content) ranks heading matches above body-text matches. The
   search box lives in the shared header (`partials/header.html`), so it's
   identical and fully functional in all 4 layouts without any per-layout
   code; clicking a result reuses the exact same soft-navigation
   (`softNavigateTo`) every other in-manual link already goes through in
   `sidebar`/`navbar`/`hybrid` — no reload — and in `scroll` layout (where
   the whole manual is already composed on the page) just scrolls to the
   matched heading instead, since there's nowhere to navigate to.
   **Explicitly not** a precomputed/server-side search index (Lunr-style or
   similar) — this template has no backend and no build step by design
   (see README "Architecture"), and a plain client-side substring search
   over a lazily-fetched, per-language-cached index is the right trade-off
   at the scale of a real product manual (dozens of pages, not thousands);
   documented as a real, deliberate limitation rather than glossed over —
   a manual that outgrows this would need an actual build step to generate
   a real index, which is a bigger architectural change this template
   intentionally doesn't make.
   One real bug caught before shipping: `Element.textContent` on a
   `<table>` runs adjacent cells together with no space
   ("LAN 1-4RJ45..."), since there's no text node between them in the
   source markup — found by actually reading a rendered snippet, not
   assumed away. Fixed with a small custom text-extraction walk that
   inserts a space after every element's own text.

Validated with 10 new checks in `tests/smoke.test.mjs`: a search from one
page finds a match that lives on a *different* page, inside a table cell,
not just the currently-open menu; the result's link and snippet are
correct; clicking it soft-navigates with no reload in `sidebar` layout and
scrolls-in-place with no navigation at all in `scroll` layout; a
no-match query shows an explicit "no results" message rather than an empty
dropdown; brand switching leaves an explicitly different layout
(`navbar`, chosen specifically because it differs from `intelbras`'s own
default `sidebar`) untouched. 159 → 169 checks. Also re-ran the full suite
3 consecutive times end-to-end (not just once) after all of this round's
changes landed, specifically because of the round-13 test-harness
reliability history — all 3 clean.

## Round 17 — real demo content: every telecom-manual pattern, real menu names, no lorem ipsum

Three escalating requests in one round, each one raising the bar on the
last: add examples of every common telecom-manual content pattern → make the
manual's own prose narrate those patterns as a demo (portfolio use) → remove
lorem ipsum entirely, replaced with real, useful content → rename the
menus/submenus themselves too, since "Menu 1"/"Topic 1" no longer fit a
manual that's supposed to read as real.

**Content patterns added**, each demonstrated with real copy, not a bare
class name — see the new "Content patterns" table in `README.md` for the
full list and where each lives: safety/note/tip callouts (`.callout`, four
color-coded variants, intentionally independent of the brand's primary
color so a safety warning stays recognizable regardless of theme), numbered
step-by-step instructions (`.steps`, CSS counters, no JS), a CLI/config
example block (`.cli-block`), a "what's in the box" checklist
(`.contents-list`), an FAQ (`.faq-list`, a plain `<dl>`), an LED-status
table, a glossary, a troubleshooting table, a certifications/compliance
statement, and a document revision-history table (the last four all reusing
the existing `.spec-table` pattern from round 8, rather than inventing new
CSS for shapes that already had a home). A second SVG diagram
(`assets/example-installation-diagram.svg`, same neutral-gray style as
round 8's rear-panel figure) illustrates a typical wall-socket → device →
router topology for the Installation chapter.

**Menu/submenu names, real content instead of "Menu 1 Topic 1."** Once
lorem ipsum was off the table entirely, "Menu 1"/"Topic 1" placeholders
next to real prose read as an obvious inconsistency — the brief's `nav.*`
i18n indirection (built specifically so a rename never touches more than
one JSON file per language) turned out to make this a clean, contained
change: `i18n/{en,pt,es}.json`'s `nav.*` values became real chapter names
(Getting Started/Installation/Initial Setup/Specifications/Compliance/
Support/Advanced Topics, and their pt/es translations), each page's own
`<h1>` was updated to match, and every `<h2>` "Topic N" heading became a
real subheading (e.g. "Package Contents", "LED Indicators"). Nav
IDs/paths/`nav-config.json` structure were untouched — only the *labels*
changed, exactly the axis this template's i18n indirection was built to
absorb without touching code.

The manual now reads as a coherent, cross-linked document for one
fictional product (a dual-band broadband gateway) — chapters reference each
other by name ("see Specifications" links to the actual Specifications
page/anchor), the same way a real manual would, rather than reading as 7
disconnected demo fragments.

**A real, non-trivial mechanical-update surface, done carefully rather than
by search-and-replace alone:** ~20 hardcoded strings across
`tests/smoke.test.mjs` (heading text, nav-label arrays, search-result
assertions) referenced the old "Menu N"/"Menu N Submenu N" names and had to
be updated to match — done with an explicit *longest-string-first* ordered
replacement (`"Menu 1 Submenu 1"` before `"Menu 1"`, etc.) specifically to
avoid the substring-collision bug that order would otherwise cause (a naive
short-to-long replace would have mangled "Menu 1 Submenu 1" into "Getting
Started Submenu 1"). One genuine leftover bug caught by actually running the
suite afterward, not assumed fixed: two language-switch tests still waited
on the old `", em português."` / `", en español."` marker convention from
the lorem-ipsum days (harmless when that text existed, silently timing out
forever once it didn't) — replaced with waits on the real, now-different
translated `<h1>` text per language, which is a more meaningful check
anyway (it confirms the *actual* translated page loaded, not just that some
marker string is still floating around somewhere on it).

**Also found while wiring up the search-term-collision case, worth calling
out on its own:** the existing cross-language "PDF is entirely one
language" check compares chapter paragraph text position-by-position
between two exports rather than checking for a marker string, so it kept
working correctly through this whole rewrite without needing changes —
a case where the *existing* test's design (real per-position comparison,
not a fixture-specific string) already anticipated exactly this kind of
content churn. A different existing check (PDF spec-table styling) did need
a small fix: it queried the *first* `.spec-table` on the Specifications
page assuming it would have a `<thead>`, which broke once a new
`Wireless Specifications` table (no header row, row-label style) became
that first table — fixed to specifically pick a table that has a `<thead>`,
rather than assuming position.

Also fixed, while translating `i18n/es.json`: the earlier round that added
the search feature's `header.searchPlaceholder`/`search.noResults` keys had
only added them to `en.json`/`pt.json`, not `es.json` — a real latent bug
(Spanish search would have shown a blank placeholder and an `undefined`
"no results" message) caught by a key-set diff across all three JSON files
before it ever shipped to a user.

Validated with 2 new checks in `tests/smoke.test.mjs` confirming the new
content patterns are styled correctly in the dedicated PDF export too
(callout border color, numbered-step counter background) — the same
computed-style technique round 12 established for table/figure PDF styling,
not a screenshot (Paged.js's own pagination/rendering pipeline makes a
raw screenshot of a specific page number an unreliable, timing-sensitive
check in practice — confirmed the content and styling were correct via
`getComputedStyle` on the pre-pagination source instead). 169 → 171 checks.
Full suite re-run 3 times consecutively after all content/rename changes
landed, given this round's size — all 3 clean.

## Bugs found and fixed during this pass

1. **Layout silently changed on navigation.** Nav links didn't carry the
   current `?brand=&lang=&layout=` forward, and nothing ever persisted state
   to `localStorage` despite it being read. The next page fell back to the
   default brand (`generic`), whose default layout is `scroll` — so clicking
   any link while in `sidebar` mode looked like it randomly switched to
   `scroll`. Fixed in `js/page-init.js` / `js/nav-render.js`.
2. **Scroll layout wasn't actually continuous.** Each submenu was a full
   separate page load; layout 5 looked identical to the others. Now
   `js/continuous-chapter.js` composes a whole chapter (menu + submenus) on
   one page, and same-chapter nav links become in-page anchors instead of
   navigations.
3. **Scroll layout replaced the whole site menu.** An earlier fix for #2
   swapped the full nav tree for a page-local mini-TOC, making other menus
   unreachable. Now the full tree always stays, with the mini-TOC as an
   addition, not a replacement.
4. **Scroll layout had a ~360px dead gap on the left.** `flex-direction:
   row-reverse` packed the nav+content pair against the right edge instead
   of letting content fill the space; found via measuring actual rendered
   rects, not by eyeballing a screenshot. Fixed with `order` + a centered,
   width-capped `.layout-shell`.
5. **No responsive breakpoint at all.** Below ~760px the sidebar stayed a
   fixed 260px column, squeezing content into single-word-wide lines.
   Added `css/responsive.css`.
6. **Deep-linked anchors drifted out of view.** The browser's native
   "scroll to #hash" ran before the header/nav partials injected (and, in
   scroll layout, before the rest of the chapter composed), shifting the
   page after the initial scroll. Fixed by re-applying the scroll once
   layout settles.
