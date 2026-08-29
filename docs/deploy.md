# Deploy

Fully static — any HTTP host works (GitHub Pages, Netlify, Cloudflare Pages,
or a plain Apache/nginx). No build step; just copy the folder.

## Cloudflare Pages

Recommended when your domain's DNS is already on Cloudflare (a subdomain is
then a couple of clicks with automatic TLS, no separate DNS host to
manage):

1. In the Cloudflare dashboard, create a Pages project from this repo.
   Framework preset: **None**. Build command: **(empty)**. Build output
   directory: **`/`**.
2. Add a custom domain (e.g. `manual.yourdomain.com`) to the Pages project —
   since the domain is already on the same Cloudflare account, the DNS
   record is created for you.
3. `_headers` and `_redirects` at the repo root are Cloudflare Pages' config
   format (long-cache headers for `assets/`/`vendor/`, and 301s for the
   generator tool's old pre-reorg URLs) — both are picked up automatically,
   no build step needed, and neither ships inside a generated manual (see
   `js/generator/package/file-manifest.js`).

**One thing worth knowing:** Cloudflare Pages canonicalizes URLs —
`/foo.html` redirects to `/foo`, and `/dir/index.html` redirects to `/dir/`.
`js/nav/nav-config.js`'s `canonicalizePagePath()` already normalizes both
the `.html` and the trailing-slash form back to the same nav item,
specifically so active-nav-highlighting and the language switch keep
working after that redirect — but it's worth clicking through a page once
after deploying to confirm (nav highlighting, language switch, PDF export)
rather than only trusting local testing, since the local dev/test server
doesn't perform that redirect itself.

## Netlify

A drop-in equivalent if you'd rather not deal with that redirect behavior
at all (it has a `pretty_urls` toggle Pages doesn't) — a `netlify.toml` with
`publish = "."` and no build command works the same way.
