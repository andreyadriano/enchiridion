# Generator tool

`index.html` at the repo root is a landing page with two paths: build a
custom manual, or browse the ready-made templates. Neither touches any code.

## Landing page

Two panels, side by side: "Build your own manual" → `generator/index.html`,
"Browse ready-made templates" → `generator/templates.html`. A small language
`<select>` (persisted to `localStorage` under `generator-lang`, shared with
the pages below) switches the tool's own UI language. A footer credit
(`js/generator/site-footer.js`) links back to the author's site.

## Build your own manual

`generator/index.html` — a form on the left, a live preview `<iframe>` on
the right, side by side, no tab to switch into.

- **Basic colors**: the 5 required theme colors
  (`--color-primary/secondary/text/bg`, plus accent), corner radius,
  heading/body font, a logo + favicon upload (both optional — skip either
  and the generated manual falls back to this template's own generic-brand
  logo/favicon), product name, one layout, and which languages to include
  (English is always included; Portuguese/Spanish are optional). Each color
  field has a small ⓘ hint naming which page elements it actually controls.
- **Advanced colors** (`js/generator/theme/component-colors.js`): a
  collapsible section with one row per component (header/topbar background,
  sidebar background, footer background, menu-link text/hover/active,
  submenu background/border). Each row has an "Auto" checkbox, checked by
  default and seeded from the matching base color — unchecking it reveals a
  color input for that one component. Auto rows are omitted from the
  generated CSS, so the existing fallback chain in `themes/theme-schema.md`
  still applies.
- **Contrast check** (`js/generator/theme/contrast.js`): a WCAG
  relative-luminance check runs on every color change (debounced) and warns
  if text-on-background or primary-on-background falls short of the 4.5:1
  AA minimum.
- **Fonts**: each dropdown renders every built-in stack in that actual
  font, plus an "Upload your own font…" option
  (`js/generator/theme/font-fields.js`). An uploaded font is embedded live
  in the preview as a `data:`-URL `@font-face` rule and, at download time,
  as a real font file referenced from `theme-custom.css` — not a data URI in
  the shipped file, so the generated theme stays a plain, readable CSS file.
- **Live preview**: colors and product name apply instantly (no reload, by
  touching `iframe.contentDocument` directly — `js/generator/theme/preview.js`);
  a layout change reloads the preview with the new layout. The previewed
  manual's own brand/layout dropdowns are hidden (the generator's own
  controls already pick both from outside). "Download PDF" inside the
  preview reflects the customization too — clicking it stashes the current
  theme/logo/favicon/product name into `sessionStorage` before opening
  `print.html?generatorPreview=1` in a new tab
  (`js/generator/pdf-export.js`).
- **First-visit hint** (`js/generator/desktop-hint.js`): a dismissible modal
  recommending a larger screen, shown once on a narrow/touch viewport;
  dismissal persists in `localStorage`.
- **Download**: "Download my manual" builds a real `.zip` client-side (via
  `vendor/jszip.min.js`, no server involved) and downloads it.

## Browse ready-made templates

`generator/templates.html` — its own brand/layout `<select>`s driving its
own preview `<iframe>`, full screen, no size constraints to fight. Nothing
to download, just a way to compare the brands/layouts exactly as they ship
today. The custom-manual form's state in the other tab is untouched by it.

## What's in the downloaded `.zip`

A minimal, working copy of this template — only what this particular
download actually needs, not the whole project:

- The always-shipped shared files, listed in
  `js/generator/package/file-manifest.js`'s `CORE_FILES` (**if you add a new
  static file every manual needs, add it there too, or generated manuals
  won't include it**).
- Exactly one layout's CSS (`css/layout-<layout>.css` — the other 3 are
  never even fetched).
- Exactly one theme (`themes/theme-custom.css`, generated from
  `themes/theme-generic.css` with your chosen values filled in — advanced
  colors are appended as a second `:root` block).
- Exactly one logo and one favicon (the file you uploaded, or this
  template's own generic-brand one if you didn't), saved under a fixed
  `assets/logo-custom.<ext>` / `assets/favicon-custom.<ext>` name.
- Only the pages for the languages you picked, derived from
  `nav-config.json` (not hand-listed).
- A regenerated `js/theme/brands-config.js` (a single `custom` brand/layout,
  no theme switcher), `i18n/*.json` filtered to your languages (with
  `product.name` replaced), `nav-config.json`'s `langs` filtered the same
  way, and a regenerated `index.html` that redirects straight to the
  default-language home page.
- Every page's own `<link>` tags rewritten to point at the one
  theme/layout/favicon this zip actually ships, plus a short generated
  `README.md`.

`js/core/page-init.js` hides the header's brand selector when `BRANDS` has
one entry, and the layout selector when `LAYOUTS` has one entry — both
generalizations of logic that already implicitly existed, so they apply to
any hand-edited single-brand fork too (see `authoring.md` → "Single-brand
build").

`generator/`, its own `generator/i18n/<lang>.json` dictionaries, and
`js/generator/*.js` are tooling for producing a manual, not part of any
manual itself — deliberately absent from `file-manifest.js`, so they never
end up inside a generated `.zip`.
