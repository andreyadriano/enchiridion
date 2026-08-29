# Manual generator — implementation plan

## Context

The goal is to turn this template into a web-based "generator": a page where
you can either (a) browse the existing ready-made templates (brands/layouts,
exactly like today) or (b) build a custom manual — colors, logo, favicon,
layout, languages — with a live preview, and download a working `.zip` at the
end. No backend: same philosophy as the rest of the project (plain HTML/CSS/
JS, no build step).

The architecture is already built around exactly these variation points —
`themes/theme-schema.md` (the CSS variable contract each brand theme must
follow), `js/theme/brands-config.js` (`BRANDS`/`LAYOUTS`/`LANGS` — a single config
object read by `page-init.js`), and `nav-config.json` + `i18n/*.json` (menu
structure and per-language translations). None of these core files need to
change shape — the generator only needs to produce customized versions of
them. Decisions already confirmed with the user: the downloaded manual ships
with the **chosen layout only** (no layout selector), and **English is
always the base language** (pt/es are optional add-ons on top).

## New page architecture

New entry point `generator.html` at the repo root (same pattern as
`index.html`/`print.html`), with two modes:

**Mode A — "Ready-made templates":** reuses the real app as-is. An
`<iframe>` loads `pages/en/menu1/index.html?brand=X&layout=Y`; two `<select>`
elements (brand, layout) just reload the iframe's `src` with the right query
params — `js/core/state.js` already resolves `?brand=&layout=` on load. No new
rendering logic needed.

**Mode B — "Custom manual":** a form with:
- The 5 required contract colors (`--color-primary/secondary/accent/text/bg`)
  + `--border-radius` + heading/body font (dropdown of safe font stacks).
  Component-level variables (nav hover/active, etc.) stay out of the form —
  they already fall back automatically per the theme contract.
- Logo and favicon upload (`<input type="file">`, kept as in-memory `File`
  objects; previewed via `FileReader` → data URL).
- Product name (free text → `product.name` in every included language).
- Layout: radio buttons, the 4 existing options.
- Languages: checkboxes — English fixed/checked, pt/es optional.
- Live preview: the same `<iframe>` as Mode A, loading
  `pages/en/menu1/index.html?brand=generic&layout=<chosen>`. Since it's
  same-origin, `iframe.contentDocument` is manipulated directly (no
  postMessage needed): a `<style id="custom-theme-preview">:root{...}</style>`
  is injected/updated in the iframe's `<head>` on every color change (wins by
  source order, same specificity as the theme variables); the iframe's
  `[data-brand-logo]` images and `#favicon-link` get the uploaded data URLs;
  the product name preview uses the same selector `js/core/i18n.js` already uses
  for `product.name`.
- "Download my manual" button → triggers packaging.

## Packaging (100% client-side zip)

- Vendor `vendor/jszip.min.js` (plain UMD script, same pattern as
  `vendor/paged.polyfill.js`).
- File manifest: `js/generator/package/file-manifest.js`, a static array listing
  every static file in the project (css/, js/, partials/, assets/, vendor/,
  pages/**, i18n/*.json, nav-config.json, index.html, print.html).
  Hand-maintained (documented in README: "new file added to the template →
  add it here too") — avoids needing directory listing via fetch, which
  browsers can't do.
- "Copy everything, override what changes" strategy: `fetch()` each file in
  the manifest and add it to the zip as-is, EXCEPT:
  - `pages/**/*.<lang>.html` for languages not selected → excluded.
  - `i18n/*.json` → only `en.json` + the selected extra languages, with
    `product.name` replaced by the typed-in name.
  - `nav-config.json` → each `langs: [...]` filtered down to the
    intersection with the selected extra languages.
  - `js/theme/brands-config.js` → regenerated as a simple template literal: a
    single `BRANDS = { custom: { label, theme: 'themes/theme-custom.css',
    logo: 'assets/logo-custom.<ext>', favicon: 'assets/favicon-custom.<ext>',
    layout: <chosen> } }`, `DEFAULT_BRAND='custom'`, `LAYOUTS=[<chosen>]`,
    `LANGS=['en', ...extras]`.
  - `themes/theme-custom.css` (new) → generated from the
    `themes/theme-generic.css` template, with the chosen values filled in.
  - `assets/logo-custom.<ext>` / `assets/favicon-custom.<ext>` → the actual
    uploaded bytes (Blob/ArrayBuffer), not a fetch.
  - excluded from the zip entirely: `docs/`, `tests/`, `package.json`,
    `package-lock.json`.
  - everything else (all of `css/*.css`, the 3 unused `theme-*.css`
    files/logos, the 3 unused `layout-*.css` files) is copied unmodified —
    simpler and safer than rewriting the `<link>` tags in all 21 static page
    files; they just end up as unreferenced inert files.
  - Generate a short `README.md` inside the zip (product name, what was
    chosen, minimal editing instructions reusing the real README's "Editing
    content" section).
- `zip.generateAsync({type:'blob'})` → `URL.createObjectURL` → a real
  `<a download="manual-<slug>.zip">` click (this is the actual deployed app,
  not a Claude Artifact, so this works normally).

## Small core generalizations (reusable, not generator-only hacks)

In `js/core/page-init.js`, when populating the selectors:
- If `Object.keys(BRANDS).length <= 1`, hide the brand selector field.
- If `LAYOUTS.length <= 1`, hide the layout selector field.

This also makes the README's manual "Single-brand build" removal step
(ripping out the theme-switcher by hand) partially automatic — a nice side
effect, not extra scope: it just generalizes an `if` that already implicitly
exists (`populateSelect` already handles 1 option, it just isn't hidden).

## New/changed files (overview)

- New: `generator.html`, `css/generator.css`, `js/generator/*.js` (`ui.js`,
  `preview.js`, `build-package.js`, `file-manifest.js`),
  `vendor/jszip.min.js`.
- Changed: `js/core/page-init.js` (the 2 selector-hiding ifs), `README.md` (new
  "Manual generator" section), `docs/ux-evaluation.md` (round writeup),
  `tests/smoke.test.mjs` (new checks, see Verification).

## Verification

- `npm test` stays 100% green (the two `page-init.js` generalizations are
  gated on `length <= 1`, so they change nothing with today's 3 brands/4
  layouts).
- New smoke checks (Puppeteer, same pattern as the existing ones):
  1. Open `generator.html`, Mode A: switch brand/layout and confirm the
     iframe's `src` and content change.
  2. Mode B: fill in a primary color + product name, confirm via
     `iframe.contentDocument` that the CSS variable and text changed without
     reloading the iframe.
  3. Call the packaging function directly (`page.evaluate`) with a minimal
     selection (1 extra language, 1 layout) and check the resulting `Blob`
     is non-empty and above a plausible minimum size (no need to test the
     actual download in headless mode).
- Manual test: generate a zip, extract it, serve it with a local static
  server, and browse it checking: custom favicon/logo applied, only 1
  layout (no selector), only the chosen languages in the language selector,
  no console errors.