# Enchiridion

Live at [enchiridion.andreyrosa.dev](https://enchiridion.andreyrosa.dev).

Turn a plain HTML/CSS/JS template into your own white-label product
manual — pick colors, logo, layout and languages, and download a
ready-to-serve site. No build step, no backend, no account.

Named after the *Enchiridion*, Epictetus's short Stoic handbook — the word
literally means "what's held in the hand." That's the idea: a manual
people actually keep close and consult, not a document nobody opens.

The demo content is a real working manual for a fictional broadband
gateway — every content pattern a hardware manual needs (safety callouts,
spec tables, a troubleshooting table, an FAQ, an A-Z index, and more) is
already there, in English, Portuguese, and Spanish.

## Features

- **Live generator** — set colors, logo, favicon, fonts, layout and
  languages with an instant preview, then download a `.zip`.
- **4 navigation layouts** — sidebar, navbar, single continuous scroll, or
  a hybrid top-bar-plus-sidebar.
- **Multi-brand theming** — one CSS file per brand, granular per-component
  colors, all with sane fallbacks.
- **3 languages out of the box** — real translated content, not just UI
  chrome; add more by copying a folder.
- **Full-manual search** — client-side, no backend, works in every layout.
- **One-click PDF export** — real cover, table of contents, and page
  numbers, or a plain `Ctrl+P` from anywhere.

## Try it

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/` — the landing page links to the
generator and to Explore, a gallery of the built-in looks you can preview
live or use as a starting point. (Double-clicking a file directly with
`file://` won't work: the header/nav/footer are loaded via `fetch()`,
which browsers block under `file://`.)

## Project structure

```
index.html          landing page (generator + Explore links)
generator/           the manual-generator tool
pages/<menu>/<lang>/ manual content — one real HTML file per page per language
js/, css/            application code and styles
i18n/, themes/       chrome translations, per-brand color contracts
partials/            shared header/footer, injected at runtime
print.html           dedicated PDF export
tests/                headless-browser smoke suite (dev-only)
```

## Testing

```
npm install   # once, pulls in puppeteer-core (dev-only)
npm test      # requires Chrome/Chromium; set CHROME_PATH if needed
```

QA tooling for maintaining the template — not part of the served site,
which stays dependency-free.

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/authoring.md`](docs/authoring.md) | Editing content, translating pages, theming a brand — no code required |
| [`docs/architecture.md`](docs/architecture.md) | How state, deep-linking, layouts, search, and PDF export work internally |
| [`docs/generator.md`](docs/generator.md) | How the generator tool builds a custom `.zip` |
| [`docs/deploy.md`](docs/deploy.md) | Deploying to Cloudflare Pages or Netlify |
| [`themes/theme-schema.md`](themes/theme-schema.md) | The CSS variable contract every brand theme follows |
| [`docs/ux-evaluation.md`](docs/ux-evaluation.md) | Design/UX decision log |

## License

[MIT](LICENSE)

---

Built by [andreyrosa.dev](https://andreyrosa.dev).
