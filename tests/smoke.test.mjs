// Reusable end-to-end smoke suite for the manual template — a real headless
// browser drives the site exactly as a visitor would (clicking nav links,
// switching selectors) so bugs like "clicking a link silently changes your
// layout" get caught before shipping, not after. Requires Chrome/Chromium;
// set CHROME_PATH if it isn't on one of the default paths below.
//
// Run with: npm test   (from the project root)
//
// Brand/lang/layout persist via localStorage (js/state.js), which is
// shared across pages in the same browser context — so each test block
// that cares about a clean starting state runs in its own isolated
// browser context (withPage below), not just a new tab.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8134;
const BASE = `http://localhost:${PORT}`;
const EXTRACTED_MANUAL_PORT = 8135;
const EXTRACTED_MANUAL_DIR = path.join(ROOT, 'tests', '.tmp-extracted-manual');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function assertTrue(name, condition, detail) {
  record(name, !!condition, detail);
}

function findChrome() {
  const fs = require('node:fs');
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chrome/Chromium executable found. Set CHROME_PATH.');
}

// A plain Node static file server, not `python3 -m http.server`. The
// project has zero dependencies at runtime — README's own instructions for
// running it locally still say to use Python — but for the automated
// suite specifically, Python's dev server (thread-per-connection) turned
// out to have a real, reproducible failure mode under this suite's load:
// a full run reliably wedges it into never responding to ANY new
// connection again — confirmed with `ss -tnp` (established, fully idle
// connections that never close) and a raw `curl` issued at the exact
// moment of the hang (which also timed out, with no Chrome involved at
// all, proving it wasn't a Puppeteer/connection-pool issue on the client
// side). Node's server is event-loop based, not thread-per-connection, so
// it doesn't have that failure mode — and using Node here means the test
// harness doesn't depend on Python being installed at all.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// `root`/`port` default to the template's own repo/PORT — pass explicit
// ones to serve a different directory (e.g. an extracted downloaded
// manual) on its own port instead.
function startServer(root = ROOT, port = PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
        // Any trailing-slash path resolves to that directory's index.html —
        // not just the root '/' — so 'generator/templates.html`'s own
        // sibling-relative links (and any future `/generator/`-style URL)
        // work the same way a real static host (Cloudflare Pages, Netlify,
        // GitHub Pages) resolves a directory URL.
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = path.join(root, urlPath);
        if (!filePath.startsWith(root + path.sep) && filePath !== root) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.on('error', reject);
    server.listen(port, () => resolve(server));
  });
}

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function bodyLayoutClass(page) {
  return page.evaluate(() => document.body.className);
}

// One specific navigation in this suite (print.html?autoprint=1, deep into
// a full run) occasionally hangs for 30s+ with no response — confirmed via
// `ss -tnp` and a raw `curl` issued at the exact moment of the hang (it
// timed out identically, with no Chrome involved) that this is the dev
// server (a plain `python -m http.server`, chosen for zero setup, not
// hardened for sustained heavy automated load) stalling transiently, not a
// real leak: thread/fd counts on it stayed completely normal throughout.
// Retrying the navigation once is enough in practice — this is test-
// harness flakiness under load, not a product defect.
async function gotoWithRetry(page, url, opts, attempts = 2) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await page.goto(url, opts);
    } catch (err) {
      if (i === attempts) throw err;
    }
  }
}

// Runs fn(page) in its own incognito-style browser context, so localStorage
// (brand/lang/layout persistence) starts empty and never leaks between
// test blocks. Always tears the context down afterwards.
//
// `browserBox` is a mutable { browser, chromePath, count } holder, not a
// bare Puppeteer Browser, so the whole browser process can be recycled
// periodically on long runs — cheap insurance against general resource
// growth in one long-lived headless Chrome process.
const CONTEXTS_PER_BROWSER = 25;

async function withPage(browserBox, fn) {
  browserBox.count += 1;
  if (browserBox.count > CONTEXTS_PER_BROWSER) {
    await browserBox.browser.close();
    browserBox.browser = await puppeteer.launch({ executablePath: browserBox.chromePath, headless: 'new', args: ['--no-sandbox'] });
    browserBox.count = 1;
  }
  const context = await browserBox.browser.createBrowserContext();
  try {
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await context.close();
  }
}

async function main() {
  const chromePath = findChrome();
  console.log(`Using Chrome at ${chromePath}`);
  const serverProc = await startServer();
  const browserBox = {
    browser: await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'] }),
    chromePath,
    count: 0,
  };

  try {
    // ------------------------------------------------------------------
    // 1. Every content page loads clean, in every layout, no console errors.
    // ------------------------------------------------------------------
    const contentPages = [
      '/pages/en/menu1/index.html',
      '/pages/en/menu1/submenu1.html',
      '/pages/en/menu1/submenu2.html',
      '/pages/en/menu2/index.html',
      '/pages/en/menu2/submenu1.html',
      '/pages/en/menu3/index.html',
      '/pages/en/menu3/submenu1.html',
    ];
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      for (const layout of ['sidebar', 'navbar', 'scroll']) {
        for (const p of contentPages) {
          errors.length = 0;
          await page.goto(`${BASE}${p}?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0', timeout: 20000 });
          await page.waitForSelector('#site-nav-tree a');
          await assertTrue(`loads clean: ${p} [${layout}]`, errors.length === 0, errors.join('; '));
        }
      }
    });

    // ------------------------------------------------------------------
    // 2. Regression: state persists via localStorage across navigation
    //    even when the destination link carries NO query string at all.
    //    (This is exactly the bug that shipped: state lived only in the
    //    URL, links didn't carry it, so the next page silently fell back
    //    to defaults.)
    // ------------------------------------------------------------------
    for (const layout of ['sidebar', 'navbar']) {
      await withPage(browserBox, async (page) => {
        const errors = collectErrors(page);
        await page.goto(`${BASE}/pages/en/menu1/index.html?layout=${layout}&brand=amethyst&lang=pt`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#site-nav-tree a');

        for (const label of ['nav.menu1', 'nav.menu2', 'nav.menu3']) {
          const href = await page.$eval(`#site-nav-tree a[data-i18n="${label}"]`, (a) => a.getAttribute('href'));
          await assertTrue(`nav link for ${label} carries no query string [${layout}]`, !href.includes('?'), href);
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click(`#site-nav-tree a[data-i18n="${label}"]`),
          ]);
          const cls = await bodyLayoutClass(page);
          const themeHref = await page.$eval('#theme-css', (l) => l.href);
          await assertTrue(`layout preserved after clicking ${label} (query-less link) [${layout}]`, cls === `layout-${layout}`, cls);
          await assertTrue(`brand preserved after clicking ${label} (query-less link) [${layout}]`, themeHref.includes('amethyst'), themeHref);
        }
        await assertTrue(`no console errors clicking through [${layout}]`, errors.length === 0, errors.join('; '));
      });
    }

    // ------------------------------------------------------------------
    // 2b. Soft navigation: clicking a nav link in sidebar/navbar must NOT
    //     trigger a real page reload — header/nav/footer chrome should
    //     just stay put (they never change page to page) while only
    //     #page-content and the URL update. This is what was reported as
    //     "not smooth, you can see the page reloading all elements":
    //     header/nav/footer are fetched via JS on every real navigation
    //     (js/partial-loader.js), so a full reload blanks and re-fetches
    //     chrome that's identical across every page. Verified two ways: a
    //     `window.__marker` surviving (proof no real navigation happened —
    //     a real load would reset the JS realm and wipe it) and that the
    //     browser's Back button (popstate) correctly restores the previous
    //     page's content the same soft way.
    // ------------------------------------------------------------------
    for (const layout of ['sidebar', 'navbar']) {
      await withPage(browserBox, async (page) => {
        const errors = collectErrors(page);
        await page.goto(`${BASE}/pages/en/menu1/index.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#site-nav-tree a');
        await page.evaluate(() => { window.__marker = true; });

        await page.click('#site-nav-tree a[data-i18n="nav.menu2"]');
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Specifications');
        const markerAfterClick = await page.evaluate(() => window.__marker === true);
        await assertTrue(`soft nav survives (no reload) clicking a menu link [${layout}]`, markerAfterClick, markerAfterClick);
        const urlAfterClick = page.url();
        await assertTrue(`soft nav updates the URL to the clicked page [${layout}]`, urlAfterClick.endsWith('/pages/en/menu2/index.html'), urlAfterClick);
        const headingAfterClick = await page.$eval('h1', (el) => el.textContent);
        await assertTrue(`soft nav swaps in the target page's real content [${layout}]`, headingAfterClick === 'Specifications', headingAfterClick);
        const activeLinkAfterClick = await page.$eval('#site-nav-tree a[data-i18n="nav.menu2"]', (a) => a.classList.contains('is-active'));
        await assertTrue(`soft nav updates nav active-highlighting [${layout}]`, activeLinkAfterClick);

        await page.goBack({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Getting Started');
        const markerAfterBack = await page.evaluate(() => window.__marker === true);
        await assertTrue(`browser Back button also soft-navigates (no reload) [${layout}]`, markerAfterBack, markerAfterBack);
        const urlAfterBack = page.url();
        // Back returns to the very first history entry, which still carries
        // this test's own initial ?layout=&brand=&lang= query string — that
        // query is real browser history, not something soft nav controls.
        await assertTrue(`Back button restores the previous URL [${layout}]`, urlAfterBack.includes('/pages/en/menu1/index.html'), urlAfterBack);

        await assertTrue(`no console errors during soft navigation [${layout}]`, errors.length === 0, errors.join('; '));
      });
    }

    // ------------------------------------------------------------------
    // 2c. The concrete mechanism behind the soft-nav fix, not just its
    //     visible symptom: clicking a nav link must fire exactly one
    //     network request — the target page's own HTML. If partials
    //     (header/nav/footer), CSS, or the theme file were being
    //     re-fetched, that would mean a real navigation snuck back in.
    // ------------------------------------------------------------------
    for (const layout of ['sidebar', 'navbar']) {
      await withPage(browserBox, async (page) => {
        await page.goto(`${BASE}/pages/en/menu1/index.html?layout=${layout}&brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#site-nav-tree a');
        const requestUrls = [];
        page.on('request', (req) => requestUrls.push(req.url()));
        await page.click('#site-nav-tree a[data-i18n="nav.menu2"]');
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Specifications');
        // Chrome may also silently re-check the favicon after
        // history.pushState — harmless and unrelated, so allow it, but
        // nothing from partials/*.html, css/*.css, or themes/*.css should
        // ever be requested again: those are the actual chrome that a real
        // navigation would have wastefully re-fetched.
        await assertTrue(
          'clicking a nav link fetches the target page itself',
          requestUrls.includes(`${BASE}/pages/en/menu2/index.html`),
          JSON.stringify(requestUrls)
        );
        const refetchedChrome = requestUrls.filter((u) => /\/(partials|css|themes)\//.test(u));
        await assertTrue(
          `clicking a nav link never re-fetches header/nav/footer partials or CSS [${layout}]`,
          refetchedChrome.length === 0,
          JSON.stringify(requestUrls)
        );
      });
    }

    // ------------------------------------------------------------------
    // 2d. Three follow-up reports on soft nav: (1) the fade transition
    //     delayed how quickly the page felt clickable again — removed
    //     entirely, so the swap must now be instant, not staged behind a
    //     CSS animation class; (2) clicking a link sometimes highlighted
    //     the PREVIOUS item instead of the one just clicked — root cause
    //     was two in-flight fetches (from clicking two links in quick
    //     succession) resolving out of order, with the stale one applying
    //     last and winning; (3) clicking the ALREADY-active link caused a
    //     real, abrupt page reload, because the same-page early-return
    //     never called preventDefault(), so the browser's own "navigate to
    //     the current URL" behavior ran.
    // ------------------------------------------------------------------
    for (const layout of ['sidebar', 'navbar']) {
      await withPage(browserBox, async (page) => {
        const errors = collectErrors(page);
        await page.goto(`${BASE}/pages/en/menu1/index.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#site-nav-tree a');

        // (1) No transition class is ever applied — the swap is instant.
        const hasTransitionClass = await page.evaluate(() => {
          return document.getElementById('page-content').classList.contains('is-transitioning');
        });
        await assertTrue(`content swap has no transition/fade class [${layout}]`, !hasTransitionClass, hasTransitionClass);

        // (2) Click menu2 then menu3 back-to-back, without waiting between
        // them — the LAST click (menu3) must win, not whichever request
        // happened to resolve first. Dispatched together from inside the
        // page (not two separate Puppeteer page.click() calls) so both
        // clicks land in the same task, before either's fetch can resolve
        // — a faithful simulation of a real double-click, and avoids
        // Puppeteer's own multi-step click() (which re-queries/scrolls
        // asynchronously) racing against the first click's near-instant
        // local response and finding its target node already replaced.
        await page.evaluate(() => { window.__marker = true; });
        await page.evaluate(() => {
          document.querySelector('#site-nav-tree a[data-i18n="nav.menu2"]').click();
          document.querySelector('#site-nav-tree a[data-i18n="nav.menu3"]').click();
        });
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Support');
        await new Promise((r) => setTimeout(r, 150)); // let any stale, slower response also land, if it's going to
        const headingAfterRace = await page.$eval('h1', (el) => el.textContent);
        await assertTrue(`rapid double-click resolves to the LAST link clicked [${layout}]`, headingAfterRace === 'Support', headingAfterRace);
        const activeAfterRace = await page.$$eval('#site-nav-tree a.is-active', (els) => els.map((a) => a.getAttribute('data-i18n')));
        await assertTrue(`rapid double-click highlights only the last-clicked link [${layout}]`, JSON.stringify(activeAfterRace) === JSON.stringify(['nav.menu3']), JSON.stringify(activeAfterRace));
        const markerSurvivedRace = await page.evaluate(() => window.__marker === true);
        await assertTrue(`rapid double-click still never reloads the page [${layout}]`, markerSurvivedRace);

        // (3) Clicking the current page's own (already-active) link must
        // not reload — nothing to navigate to, the click should just be a
        // no-op.
        await page.evaluate(() => { window.__marker2 = true; });
        await page.click('#site-nav-tree a[data-i18n="nav.menu3"]');
        await new Promise((r) => setTimeout(r, 150));
        const markerSurvivedSameClick = await page.evaluate(() => window.__marker2 === true);
        await assertTrue(`clicking the already-active link does not reload the page [${layout}]`, markerSurvivedSameClick);

        await assertTrue(`no console errors during rapid/same-link clicks [${layout}]`, errors.length === 0, errors.join('; '));
      });
    }

    // ------------------------------------------------------------------
    // 3. Scroll layout composes the WHOLE manual (every chapter, not just
    //    the one you landed on); every nav entry — top-level and submenu,
    //    including other chapters — is an in-page anchor; nothing ever
    //    navigates away.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=scroll&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.chapter-section');

      const sectionHeadingIds = await page.$$eval('.chapter-section > h2[id]', (els) => els.map((e) => e.id));
      await assertTrue(
        'all 4 chapters composed on one page, even though we deep-linked into one submenu',
        JSON.stringify(sectionHeadingIds) === JSON.stringify(['menu1', 'menu2', 'menu3', 'menu4']),
        JSON.stringify(sectionHeadingIds)
      );

      const subsectionIds = await page.$$eval('.chapter-subsection > h3[id]', (els) => els.map((e) => e.id));
      await assertTrue(
        'every submenu composed too',
        JSON.stringify(subsectionIds) === JSON.stringify(['menu1-submenu1', 'menu1-submenu2', 'menu2-submenu1', 'menu3-submenu1']),
        JSON.stringify(subsectionIds)
      );

      await new Promise((r) => setTimeout(r, 300)); // let the scrollspy IntersectionObserver settle after the initial scroll
      const activeLink = await page.$eval('#site-nav-tree a.is-active', (a) => a.textContent.trim());
      await assertTrue('deep-linked submenu marked active in nav', activeLink === 'Installation', activeLink);

      const pathBefore = page.url();
      const hrefs = await page.$$eval('#site-nav-tree a', (as) => as.map((a) => a.getAttribute('href')));
      await assertTrue('every nav entry is an in-page anchor in scroll layout', hrefs.every((h) => h.startsWith('#')), hrefs.join(', '));

      // Click a DIFFERENT chapter's link — must only scroll (which does
      // update the URL's #hash — that's just how anchor links work, not a
      // navigation), never actually leave the page.
      await page.click('#site-nav-tree a[data-i18n="nav.menu2"]');
      await new Promise((r) => setTimeout(r, 500));
      const pathnameBefore = new URL(pathBefore).pathname;
      const pathnameAfter = new URL(page.url()).pathname;
      await assertTrue('clicking another chapter does not navigate away', pathnameAfter === pathnameBefore, page.url());
      const scrollY = await page.evaluate(() => window.scrollY);
      await assertTrue('clicking another chapter scrolls the page', scrollY > 0, `scrollY=${scrollY}`);

      await assertTrue('no console errors in scroll layout', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 4. Toggling layouts via the selector doesn't duplicate composed
    //    content and doesn't reload the page.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = true; });

      // Scoped to #page-content specifically, not just any .chapter-section
      // in the document: starting in 'sidebar' also builds a hidden
      // #print-manual fallback (test 9) with its own 4 .chapter-section
      // copies in the background, which would otherwise coincidentally
      // satisfy a document-wide count === 4 check before the real
      // composition into #page-content even starts.
      //
      // Composing all 4 chapters takes several sequential fetches, so wait
      // for the final count rather than just the first section to appear
      // (waitForSelector would resolve as soon as chapter 1 lands, well
      // before the rest finish fetching).
      await page.select('#layout-selector', 'scroll');
      await page.waitForFunction(() => document.querySelectorAll('#page-content .chapter-section').length === 4, { timeout: 10000 });
      let count = await page.$$eval('#page-content .chapter-section', (els) => els.length);
      await assertTrue('scroll layout composes all 4 chapters once', count === 4, `count=${count}`);

      await page.select('#layout-selector', 'navbar');
      await new Promise((r) => setTimeout(r, 300));
      await page.select('#layout-selector', 'scroll');
      await page.waitForFunction(() => document.querySelectorAll('#page-content .chapter-section').length === 4, { timeout: 10000 });
      count = await page.$$eval('#page-content .chapter-section', (els) => els.length);
      await assertTrue('toggling back to scroll does not duplicate sections', count === 4, `count=${count}`);

      const markerSurvived = await page.evaluate(() => window.__marker === true);
      await assertTrue('layout toggling never reloads the page', markerSurvived);
      await assertTrue('no console errors toggling layouts', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 5. Brand switch swaps theme only — it must NOT change whatever
    //    layout the visitor already has selected (a brand's `layout` in
    //    js/brands-config.js is only that brand's *default* the very first
    //    time someone arrives with nothing in localStorage yet — see
    //    js/state.js resolveState() — not something later brand switches
    //    should keep forcing back). Never reloads the page either way.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=navbar&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = true; });

      await page.select('#brand-selector', 'ember');
      await page.waitForFunction(() => document.getElementById('theme-css').href.includes('ember'));
      const layoutAfterBrand = await bodyLayoutClass(page);
      await assertTrue(
        "brand switch does NOT change the visitor's current layout, even though ember's own default is 'hybrid'",
        layoutAfterBrand === 'layout-navbar',
        layoutAfterBrand
      );
      const markerSurvived = await page.evaluate(() => window.__marker === true);
      await assertTrue('brand switch never reloads the page', markerSurvived);
      await assertTrue('no console errors switching brand', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 5b. Language switch on a page that has a translated file (every page
    //     in this template does — see pages/**/*.pt.html/.es.html and
    //     `langs` in nav-config.json) fetches it and swaps #page-content +
    //     the URL via history, the same soft-navigation approach as a nav
    //     link — content is a real, separate file per language, but that
    //     doesn't mean the switch has to be a real, reload-the-whole-page
    //     navigation (it used to be exactly that: window.location.href).
    //     Nav links point at the .pt.html file too, for every menu/submenu.
    // ------------------------------------------------------------------
    for (const layout of ['sidebar', 'navbar']) {
      await withPage(browserBox, async (page) => {
        const errors = collectErrors(page);
        await page.goto(`${BASE}/pages/en/menu1/index.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.evaluate(() => { window.__marker = true; });
        await page.select('#lang-selector', 'pt');
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Primeiros Passos');
        await assertTrue(`language switch updates the URL to the translated file [${layout}]`, page.url().endsWith('/pages/pt/menu1/index.html'), page.url());
        const heading = await page.$eval('h1', (el) => el.textContent);
        await assertTrue(`translated file shows its own real Portuguese content [${layout}]`, heading === 'Primeiros Passos', heading);
        const markerSurvived = await page.evaluate(() => window.__marker === true);
        await assertTrue(`language switch never reloads the page [${layout}]`, markerSurvived);

        const menu2Href = await page.$eval('#site-nav-tree a[data-i18n="nav.menu2"]', (a) => a.getAttribute('href'));
        await assertTrue(`nav link to another translated page also points at its .pt.html file [${layout}]`, menu2Href.endsWith('/pages/pt/menu2/index.html'), menu2Href);
        await assertTrue(`no console errors switching language [${layout}]`, errors.length === 0, errors.join('; '));

        // The language switch also kicks off syncPrintFallback() in the
        // background (unawaited by design — see js/page-init.js), which
        // fetches all 7 pages in the new language to rebuild the Ctrl+P
        // fallback. Wait for it to actually finish before this test's
        // browser context gets torn down: closing the context while those
        // fetches are still in flight was leaving the dev server
        // (tests/smoke.test.mjs's own python -m http.server) with orphaned
        // in-flight connections that reproducibly stalled a LATER,
        // unrelated test's page.goto() for the rest of the run.
        await page.waitForFunction(() => document.getElementById('print-manual')?.getAttribute('data-ready') === 'true', { timeout: 10000 });
      });
    }

    // ------------------------------------------------------------------
    // 5b-ii. Same, but in 'scroll' layout: the whole manual is composed in
    //        one language, so a language switch has to recompose every
    //        chapter, not just swap one page — must also never reload.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=scroll&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = true; });
      await page.select('#lang-selector', 'pt');
      await page.waitForFunction(() => document.querySelector('#page-content')?.textContent.includes('Primeiros Passos'));
      const markerSurvived = await page.evaluate(() => window.__marker === true);
      await assertTrue('language switch in scroll layout never reloads the page', markerSurvived);
      const allChapters = await page.$$eval('#page-content .chapter-section', (els) => els.length);
      await assertTrue('language switch in scroll layout keeps all 4 chapters composed', allChapters === 4, allChapters);
      await assertTrue('no console errors switching language in scroll layout', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 5c. langPath() fallback: a nav item with no `langs` entry for the
    //     requested language must resolve to its own default-language
    //     path, not a guessed/nonexistent translated file — this is what
    //     keeps a not-yet-translated page (in a manual a maintainer is
    //     still working on) from ever 404ing. Every page in THIS template
    //     is translated, so this checks the fallback logic directly rather
    //     than relying on a fixture page that no longer exists.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html`, { waitUntil: 'networkidle0' });
      const result = await page.evaluate(async () => {
        const { langPath } = await import('/js/nav/nav-config.js');
        return {
          untranslated: langPath({ path: 'pages/{lang}/menuX/index.html' }, 'pt'),
          translated: langPath({ path: 'pages/{lang}/menu1/index.html', langs: ['pt'] }, 'pt'),
        };
      });
      await assertTrue(
        'langPath falls back to the default-language file when a translation is not declared',
        result.untranslated === 'pages/en/menuX/index.html',
        result.untranslated
      );
      await assertTrue(
        'langPath resolves to the translated file when declared',
        result.translated === 'pages/pt/menu1/index.html',
        result.translated
      );
    });

    // ------------------------------------------------------------------
    // 5d. The header logo/product-name link ("home") must go through
    //     langPath() like every other nav link — it used to be hard-coded
    //     to the default-language page regardless of the current language,
    //     so clicking it from a Portuguese page landed back on the English
    //     one instead of its own index.pt.html.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu2/index.html?layout=sidebar&brand=generic&lang=pt`, { waitUntil: 'networkidle0' });
      const homeHref = await page.$eval('[data-home-link]', (a) => a.getAttribute('href'));
      await assertTrue(
        'home link points at the current language\'s own index page',
        homeHref.endsWith('/pages/pt/menu1/index.html'),
        homeHref
      );
    });

    // ------------------------------------------------------------------
    // 5e. Spanish is a full third language, not just chrome: a real
    //     .es.html content file exists for this page, per-item `langs` in
    //     nav-config.json declares it, and the language dropdown shows
    //     each language's own native name ("English"/"Português"/
    //     "Español"), not a two-letter code — a dropdown of abbreviations
    //     is harder to scan for a non-technical, possibly non-English
    //     reader than the actual language names.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      const optionLabels = await page.$$eval('#lang-selector option', (opts) => opts.map((o) => o.textContent));
      await assertTrue(
        'language dropdown shows native language names, not codes',
        JSON.stringify(optionLabels) === JSON.stringify(['English', 'Português', 'Español']),
        JSON.stringify(optionLabels)
      );

      await page.select('#lang-selector', 'es');
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Primeros Pasos');
      await assertTrue('language switch also reaches the Spanish translated file', page.url().endsWith('/pages/es/menu1/index.html'), page.url());
      const heading = await page.$eval('h1', (el) => el.textContent);
      await assertTrue('Spanish translated file shows its own real content', heading === 'Primeros Pasos', heading);
      await assertTrue('no console errors switching to Spanish', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 6. Deep link with a #anchor lands the target heading in view even
    //    after header/nav partials inject and shift the layout.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${BASE}/pages/en/menu2/submenu1.html?layout=sidebar#menu2-submenu1-topic2`, { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 300));
      const inView = await page.evaluate(() => {
        const el = document.getElementById('menu2-submenu1-topic2');
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight;
      });
      await assertTrue('deep-linked anchor is scrolled into view', inView);
      await assertTrue('no console errors on deep link', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 7. Footer has a discoverable PDF export link, and print.html picks
    //    up the visitor's current brand/lang from localStorage even with
    //    no query string on the link.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?brand=amethyst&lang=pt`, { waitUntil: 'networkidle0' });
      const pdfHref = await page.$eval('[data-pdf-link]', (a) => a.getAttribute('href'));
      await assertTrue('footer PDF link exists and points at print.html with no query string', pdfHref.endsWith('/print.html'), pdfHref);

      await page.goto(pdfHref, { waitUntil: 'networkidle0' }); // pdfHref is already absolute (resolvePath())
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Ready'), { timeout: 20000 });
      const brandSelectValue = await page.$eval('#brand-selector', (s) => s.value);
      const cover = await page.evaluate(() => document.querySelector('.cover .product-name')?.textContent);
      await assertTrue('print.html defaults to the brand you were browsing in (via localStorage)', brandSelectValue === 'amethyst', brandSelectValue);
      await assertTrue('PDF cover shows the Portuguese product name (lang carried over too)', cover === 'Nome do produto', cover);
      await assertTrue('no console errors following the footer PDF link', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 8. PDF export covers the ENTIRE manual (all 4 menus), builds without
    //    errors, and produces a resolved table of contents.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/print.html?brand=amethyst&lang=pt`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Ready'), { timeout: 20000 });
      const chapterIds = await page.$$eval('#source .chapter', (els) => els.map((e) => e.id));
      await assertTrue(
        'PDF includes all 8 pages across all 4 menus, not just one',
        JSON.stringify(chapterIds) ===
          JSON.stringify([
            'chapter-menu1', 'chapter-menu1-submenu1', 'chapter-menu1-submenu2',
            'chapter-menu2', 'chapter-menu2-submenu1',
            'chapter-menu3', 'chapter-menu3-submenu1',
            'chapter-menu4',
          ]),
        JSON.stringify(chapterIds)
      );
      const pageCount = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
      const cover = await page.evaluate(() => document.querySelector('.cover .product-name')?.textContent);
      await assertTrue('PDF pagination produces pages', pageCount > 0, `pages=${pageCount}`);
      await assertTrue('PDF cover shows translated product name', cover === 'Nome do produto', cover);
      const backLinkHref = await page.$eval('#back-to-manual', (a) => a.getAttribute('href'));
      await assertTrue('print.html toolbar has a link back to the manual home', backLinkHref === 'pages/en/menu1/index.html', backLinkHref);

      // print.html only ever loads css/print.css, not css/base.css — so
      // .spec-table/.manual-figure (defined in base.css for the on-screen
      // site and the Ctrl+P fallback) need their own copy of that styling
      // in print.css too, or the dedicated PDF export renders a bare,
      // unstyled <table> and an uncentered image with no visible caption.
      const tableStyle = await page.evaluate(() => {
        // Not just the first .spec-table on the page: some (e.g. the
        // row-label Wireless Specifications table) have no <thead> at all,
        // so pick specifically one that does, to check the header-shading
        // rule too.
        const table = Array.from(document.querySelectorAll('#source .spec-table')).find((t) => t.querySelector('thead th'));
        const cell = table.querySelector('td');
        return { border: getComputedStyle(cell).borderTopWidth, headerBg: getComputedStyle(table.querySelector('thead th')).backgroundColor };
      });
      await assertTrue('PDF spec-table has visible cell borders', parseFloat(tableStyle.border) > 0, tableStyle.border);
      await assertTrue('PDF spec-table header has a background', tableStyle.headerBg !== 'rgba(0, 0, 0, 0)', tableStyle.headerBg);
      const figureCentered = await page.evaluate(() => {
        const figure = document.querySelector('#source .manual-figure');
        return getComputedStyle(figure).textAlign;
      });
      await assertTrue('PDF figure/image is centered', figureCentered === 'center', figureCentered);

      // The new example content patterns (callouts, numbered steps, CLI
      // blocks, checklists, FAQ) added for the demo manual content also
      // need their own copy of styling in css/print.css, same reason as
      // .spec-table/.manual-figure above — check a couple of them.
      const calloutStyle = await page.evaluate(() => {
        const el = document.querySelector('#source .callout-danger');
        const cs = getComputedStyle(el);
        return { borderLeftWidth: cs.borderLeftWidth, borderLeftColor: cs.borderLeftColor };
      });
      await assertTrue('PDF callout has a visible colored left border', parseFloat(calloutStyle.borderLeftWidth) > 0, JSON.stringify(calloutStyle));
      const stepStyle = await page.evaluate(() => {
        const li = document.querySelector('#source .steps li');
        const before = getComputedStyle(li, '::before');
        return { content: before.content, bg: before.backgroundColor };
      });
      await assertTrue(
        'PDF numbered steps show a counter with a colored background',
        stepStyle.content.includes('counter') && stepStyle.bg !== 'rgba(0, 0, 0, 0)',
        JSON.stringify(stepStyle)
      );

      // The PDF must be single-language: every chapter's body text should
      // be the Portuguese copy, not a silent English fallback mixed in —
      // this is why every page in this template has a .pt.html sibling
      // (see js/nav-config.js fetchLocalizedHTML: it only ever fetches the
      // declared translation, never probes-then-falls-back). Checked by
      // comparing against the same export in English (a separate page in
      // the same context, so the pt page above stays untouched), position
      // by position — a real per-item translation check, not a marker
      // string that only happens to be true for the original placeholder
      // filler text.
      const chapterTextsPt = await page.$$eval('#source .chapter p', (els) => els.map((e) => e.textContent));
      const enPage = await page.browserContext().newPage();
      await enPage.goto(`${BASE}/print.html?brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });
      await enPage.waitForFunction(() => document.getElementById('status').textContent.includes('Ready'), { timeout: 20000 });
      const chapterTextsEn = await enPage.$$eval('#source .chapter p', (els) => els.map((e) => e.textContent));
      await enPage.close();
      const sameLength = chapterTextsPt.length > 0 && chapterTextsPt.length === chapterTextsEn.length;
      const noneMatch = sameLength && chapterTextsPt.every((t, i) => t !== chapterTextsEn[i]);
      await assertTrue(
        'PDF content is entirely in the selected language, no mixed-in fallback text',
        noneMatch,
        JSON.stringify({ pt: chapterTextsPt, en: chapterTextsEn })
      );
      await assertTrue('no console errors building PDF', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 9. Native Ctrl+P (not the dedicated print.html flow) must capture the
    //    WHOLE manual regardless of layout — this was the reported bug:
    //    sidebar/navbar only printed the one page on screen. Validated two
    //    ways: (a) Chrome's actual print-media rendering rules via
    //    page.emulateMediaType('print') — this checks the exact mechanism
    //    a real Ctrl+P uses, not a proxy for it — and (b) generating a real
    //    PDF via page.pdf() and confirming it's a well-formed, non-trivial
    //    file, as a concrete artifact check beyond DOM/CSS state.
    // ------------------------------------------------------------------
    for (const layout of ['sidebar', 'navbar']) {
      await withPage(browserBox, async (page) => {
        const errors = collectErrors(page);
        await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => document.querySelector('#print-manual[data-ready="true"]'), { timeout: 15000 });

        const structure = await page.evaluate(() => {
          const chapterIds = Array.from(document.querySelectorAll('#print-manual .chapter-section > h2[id]')).map((e) => e.id);
          const subIds = Array.from(document.querySelectorAll('#print-manual .chapter-subsection > h3[id]')).map((e) => e.id);
          return { chapterIds, subIds };
        });
        await assertTrue(
          `[${layout}] print fallback composes all 4 chapters`,
          JSON.stringify(structure.chapterIds) === JSON.stringify(['menu1', 'menu2', 'menu3', 'menu4']),
          JSON.stringify(structure.chapterIds)
        );
        await assertTrue(
          `[${layout}] print fallback composes all 4 submenus`,
          JSON.stringify(structure.subIds) === JSON.stringify(['menu1-submenu1', 'menu1-submenu2', 'menu2-submenu1', 'menu3-submenu1']),
          JSON.stringify(structure.subIds)
        );

        await page.emulateMediaType('print');
        const visibility = await page.evaluate(() => ({
          pageContentDisplay: getComputedStyle(document.getElementById('page-content')).display,
          printManualDisplay: getComputedStyle(document.getElementById('print-manual')).display,
          navDisplay: getComputedStyle(document.getElementById('site-nav')).display,
        }));
        await assertTrue(
          `[${layout}] under print media, the single-page content is hidden`,
          visibility.pageContentDisplay === 'none',
          JSON.stringify(visibility)
        );
        await assertTrue(
          `[${layout}] under print media, the full-manual fallback is shown instead`,
          visibility.printManualDisplay === 'block',
          JSON.stringify(visibility)
        );
        await assertTrue(`[${layout}] nav chrome hidden under print media`, visibility.navDisplay === 'none', visibility.navDisplay);

        // page.pdf() returns a Uint8Array (not a Node Buffer) — wrap it to
        // decode the header bytes as text instead of a numeric byte list.
        const pdfBuffer = await page.pdf({ format: 'A4' });
        const pdfHeader = Buffer.from(pdfBuffer.subarray(0, 5)).toString();
        await assertTrue(
          `[${layout}] page.pdf() produces a well-formed, non-trivial PDF`,
          pdfBuffer.length > 3000 && pdfHeader === '%PDF-',
          `bytes=${pdfBuffer.length}, header=${pdfHeader}`
        );

        await assertTrue(`[${layout}] no console errors building print fallback`, errors.length === 0, errors.join('; '));
      });
    }

    // Sanity check the negative case too: scroll layout never builds (or
    // shows) a #print-manual fallback, since #page-content already is the
    // whole manual there — printing it as well would duplicate everything.
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=scroll&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelectorAll('.chapter-section').length === 4);
      const hasPrintManual = await page.evaluate(() => !!document.getElementById('print-manual'));
      await assertTrue('[scroll] no redundant #print-manual fallback is built', !hasPrintManual, hasPrintManual);

      await page.emulateMediaType('print');
      const pageContentDisplay = await page.evaluate(() => getComputedStyle(document.getElementById('page-content')).display);
      await assertTrue('[scroll] the already-complete #page-content stays visible under print media', pageContentDisplay !== 'none', pageContentDisplay);
    });

    // ------------------------------------------------------------------
    // 10. Print fallback shows the brand logo + product name (was missing),
    //     and stays correct if the brand is switched afterwards.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar&brand=amethyst&lang=pt`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('#print-manual[data-ready="true"]'));

      const header1 = await page.evaluate(() => ({
        logoSrc: document.querySelector('.print-manual-logo')?.getAttribute('src'),
        title: document.querySelector('.print-manual-title')?.textContent,
      }));
      await assertTrue('print fallback shows the brand logo', header1.logoSrc?.includes('amethyst.svg'), header1.logoSrc);
      await assertTrue('print fallback shows the product name', header1.title === 'Nome do produto', header1.title);

      // Switch brand — the fallback's logo should update without a full
      // rebuild (js/print-fallback.js tags it data-brand-logo so the
      // existing applyLogo() updater covers it).
      await page.select('#brand-selector', 'ember');
      await page.waitForFunction(() => document.querySelector('.print-manual-logo')?.getAttribute('src')?.includes('ember.svg'));
      const logoAfterSwitch = await page.$eval('.print-manual-logo', (img) => img.getAttribute('src'));
      await assertTrue('print fallback logo updates after a brand switch', logoAfterSwitch.includes('ember.svg'), logoAfterSwitch);

      await assertTrue('no console errors', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 11. The native print header/footer shows document.title. Printing a
    //     specific submenu page must not brand the (now multi-menu)
    //     printed document with just that submenu's own title.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=sidebar&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      const onScreenTitle = await page.evaluate(() => document.title);
      await assertTrue('on-screen tab title is still page-specific', onScreenTitle.includes('Installation'), onScreenTitle);

      const duringPrintTitle = await page.evaluate(() => {
        window.dispatchEvent(new Event('beforeprint'));
        return document.title;
      });
      await assertTrue(
        'print-time title is generic (product name only), not the specific submenu',
        duringPrintTitle === 'Product name — User Guide',
        duringPrintTitle
      );

      const restoredTitle = await page.evaluate(() => {
        window.dispatchEvent(new Event('afterprint'));
        return document.title;
      });
      await assertTrue('title restores to the page-specific one after printing', restoredTitle === onScreenTitle, restoredTitle);
    });

    // ------------------------------------------------------------------
    // 12a. Header "Download PDF" button must ask to open print.html with
    //      ?autoprint=1 — checked by intercepting window.open() directly
    //      (deterministic: no real popup, no race with page load).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html?brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });
      const openedUrl = await page.evaluate(
        () =>
          new Promise((resolve) => {
            window.open = (url) => {
              resolve(url);
              return null;
            };
            document.getElementById('pdf-download-button').click();
          })
      );
      await assertTrue('header button requests print.html', openedUrl.includes('/print.html'), openedUrl);
      await assertTrue('header button requests autoprint=1', openedUrl.includes('autoprint=1'), openedUrl);
    });

    // ------------------------------------------------------------------
    // 12b. print.html itself: with ?autoprint=1, calls window.print() on
    //      its own once pagination is ready. Without it (the plain footer
    //      link's URL), it must NOT auto-print — stays a manual preview.
    //      window.print() is stubbed via evaluateOnNewDocument *before*
    //      navigation, so there's no race with print.html's own script.
    // ------------------------------------------------------------------
    for (const [label, query, shouldAutoPrint] of [
      ['with ?autoprint=1', '?autoprint=1&brand=amethyst&lang=en', true],
      ['without autoprint (plain footer link)', '?brand=amethyst&lang=en', false],
    ]) {
      await withPage(browserBox, async (page) => {
        await page.evaluateOnNewDocument(() => {
          window.__printCalled = false;
          window.print = () => {
            window.__printCalled = true;
          };
        });
        await gotoWithRetry(page, `${BASE}/print.html${query}`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => document.getElementById('status')?.textContent.includes('Ready'), { timeout: 20000 });
        await new Promise((r) => setTimeout(r, 200));
        const called = await page.evaluate(() => window.__printCalled);
        await assertTrue(
          `print.html ${label}: window.print() ${shouldAutoPrint ? 'is' : 'is NOT'} auto-triggered`,
          called === shouldAutoPrint,
          called
        );
      });
    }

    // ------------------------------------------------------------------
    // 13. Granular per-component theme colors actually apply. theme-amethyst
    //     sets --color-sidebar-bg / --color-nav-link-bg-active /
    //     --color-nav-link-text-active as a live example — verify the
    //     computed styles pick them up instead of silently falling back to
    //     the base palette (which would mean the variables aren't wired
    //     into base.css/layout-*.css correctly).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar&brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });
      const sidebarBg = await page.$eval('.site-nav', (el) => getComputedStyle(el).backgroundColor);
      await assertTrue('theme-amethyst sidebar background uses --color-sidebar-bg', sidebarBg === 'rgb(250, 247, 252)', sidebarBg);

      const activeLinkStyle = await page.$eval('.nav-link.is-active', (el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color };
      });
      await assertTrue(
        'theme-amethyst active nav link uses --color-nav-link-bg-active/--color-nav-link-text-active',
        activeLinkStyle.bg === 'rgb(236, 220, 245)' && activeLinkStyle.color === 'rgb(90, 22, 120)',
        JSON.stringify(activeLinkStyle)
      );
      await assertTrue('no console errors checking component colors', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 14. 'hybrid' layout (4th layout): top bar shows only top-level menus,
    //     the active chapter's submenus render as a separate contextual
    //     sidebar. Verifies the two-piece DOM (js/nav-render.js
    //     renderHybridTree() + js/page-init.js getHybridSidebarRoot())
    //     actually renders correctly and soft-navigates without a reload —
    //     not just that the CSS looks right, which a screenshot alone
    //     wouldn't catch (see docs/ux-evaluation.md, round 15).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu2/index.html?layout=hybrid&brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });

      const topLabels = await page.$$eval('#site-nav .nav-link', (els) => els.map((e) => e.textContent.trim()));
      await assertTrue(
        'hybrid topbar shows only the 4 top-level menus, no submenus',
        JSON.stringify(topLabels) === JSON.stringify(['Getting Started', 'Specifications', 'Support', 'Index']),
        JSON.stringify(topLabels)
      );

      const activeTop = await page.$eval('#site-nav .nav-link.is-active', (el) => el.textContent.trim());
      await assertTrue('hybrid topbar highlights the current chapter', activeTop === 'Specifications', activeTop);

      const sidebarLabels = await page.$$eval('#hybrid-sidebar .nav-link', (els) => els.map((e) => e.textContent.trim()));
      await assertTrue(
        "hybrid sidebar shows only Specifications' own submenus",
        JSON.stringify(sidebarLabels) === JSON.stringify(['Compliance']),
        JSON.stringify(sidebarLabels)
      );

      await page.evaluate(() => {
        window.__marker = 'still-here';
      });
      await page.evaluate(() => document.querySelector('#hybrid-sidebar .nav-link').click());
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Compliance');
      const afterSidebarClick = await page.evaluate(() => ({
        marker: window.__marker,
        url: window.location.pathname,
        activeTop: document.querySelector('#site-nav .nav-link.is-active')?.textContent.trim(),
      }));
      await assertTrue('clicking a hybrid-sidebar link does not reload the page', afterSidebarClick.marker === 'still-here');
      await assertTrue(
        'clicking a hybrid-sidebar link soft-navigates to that submenu',
        afterSidebarClick.url.endsWith('/pages/en/menu2/submenu1.html'),
        afterSidebarClick.url
      );
      await assertTrue(
        'the parent chapter stays highlighted in the topbar after navigating to its submenu',
        afterSidebarClick.activeTop === 'Specifications',
        afterSidebarClick.activeTop
      );

      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('#site-nav .nav-link'));
        links.find((a) => a.textContent.trim() === 'Getting Started').click();
      });
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Getting Started');
      const afterTopbarClick = await page.evaluate(() => ({
        marker: window.__marker,
        sidebarLabels: Array.from(document.querySelectorAll('#hybrid-sidebar .nav-link')).map((e) => e.textContent.trim()),
      }));
      await assertTrue('clicking a different topbar chapter does not reload the page either', afterTopbarClick.marker === 'still-here');
      await assertTrue(
        "the sidebar swaps to the newly-selected chapter's own submenus",
        JSON.stringify(afterTopbarClick.sidebarLabels) === JSON.stringify(['Installation', 'Initial Setup']),
        JSON.stringify(afterTopbarClick.sidebarLabels)
      );

      await assertTrue('no console errors in hybrid layout', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 15. Full-manual search (js/search.js): must find a match that lives on
    //     a DIFFERENT page than the one currently open (not just the open
    //     menu/submenu — that was the explicit ask), inside a table cell
    //     (not just heading/paragraph text), and navigate to it correctly
    //     in both a real-page layout (soft nav, no reload) and 'scroll'
    //     (scroll-to-anchor, no navigation at all — the whole manual is
    //     already on the page).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar&brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = 'still-here'; });

      await page.type('#search-input', 'RJ45');
      await page.waitForSelector('.search-result');
      const result = await page.$eval('.search-result', (a) => ({
        page: a.querySelector('.search-result-page')?.textContent,
        heading: a.querySelector('.search-result-heading')?.textContent,
        snippet: a.querySelector('.search-result-snippet')?.textContent,
        href: a.getAttribute('href'),
      }));
      await assertTrue(
        'search finds a match on a different page than the one currently open, inside a table cell',
        result.page === 'Specifications' && result.heading?.includes('Technical Specifications') && result.snippet?.includes('RJ45'),
        JSON.stringify(result)
      );
      await assertTrue('search result links straight to that section (page + anchor)', result.href?.endsWith('/pages/en/menu2/index.html#menu2-topic3'), result.href);

      await page.click('.search-result');
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Specifications');
      const afterClick = await page.evaluate(() => ({
        marker: window.__marker,
        url: window.location.href,
        resultsHidden: document.getElementById('search-results').hidden,
      }));
      await assertTrue('clicking a search result does not reload the page', afterClick.marker === 'still-here');
      await assertTrue('clicking a search result navigates to the matched page + anchor', afterClick.url.endsWith('/pages/en/menu2/index.html#menu2-topic3'), afterClick.url);
      await assertTrue('the results dropdown closes after clicking a result', afterClick.resultsHidden === true);

      await page.evaluate(() => {
        const input = document.getElementById('search-input');
        input.value = '';
        input.dispatchEvent(new Event('input')); // clears the stale 'RJ45' results immediately
      });
      await page.type('#search-input', 'zzzznomatchzzzz');
      await new Promise((r) => setTimeout(r, 400)); // past the 150ms debounce, with margin
      const noResults = await page.evaluate(
        () => !!document.querySelector('.search-empty') && !document.querySelector('.search-result')
      );
      await assertTrue('a query with no matches shows a "no results" message, not an empty dropdown', noResults);

      await assertTrue('no console errors using search', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 15b. Same search, but in 'scroll' layout: the match is already on the
    //      page (whole manual composed), so clicking it should scroll to
    //      the heading, not navigate anywhere.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=scroll&brand=amethyst&lang=en`, { waitUntil: 'networkidle0' });
      const urlBefore = page.url();

      await page.type('#search-input', 'RJ45');
      await page.waitForSelector('.search-result');
      await page.click('.search-result');
      await page
        .waitForFunction(
          () => {
            const el = document.getElementById('menu2-topic3');
            const rect = el.getBoundingClientRect();
            return rect.top >= 0 && rect.top < window.innerHeight;
          },
          { timeout: 3000 }
        )
        .catch(() => {}); // smooth-scroll settle — assertion below reports the real failure either way

      const inView = await page.evaluate(() => {
        const el = document.getElementById('menu2-topic3');
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight;
      });
      await assertTrue('in scroll layout, clicking a search result scrolls the match into view', inView);
      await assertTrue('in scroll layout, clicking a search result does not navigate anywhere', page.url() === urlBefore, page.url());
      await assertTrue('no console errors using search in scroll layout', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 16. Manual generator (generator.html): the custom-manual builder is
    //     the main flow — the preview iframe loads immediately (brand
    //     'generic', layout 'sidebar' by default, matching the form's own
    //     default layout radio), with its OWN brand/layout dropdowns
    //     hidden (they're redundant now that the form's own controls pick
    //     both from outside). Color/product-name edits apply to that SAME
    //     document live, no reload — verified two ways: the injected
    //     #custom-theme-preview style actually carries the new color, and
    //     a marker stashed on the iframe's own window survives every edit
    //     (a reload would wipe it, same technique the soft-nav tests above
    //     use for the top-level page). Also checks the page never grows a
    //     horizontal scrollbar at a narrow width — the reported bug was the
    //     color swatches getting cut off at the viewport edge — and that
    //     the page itself doesn't scroll on desktop (only the two inner
    //     panels do), the other reported layout bug.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.setViewport({ width: 375, height: 900 });
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(
        () => {
          const f = document.getElementById('preview-frame');
          return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
        },
        { timeout: 15000 }
      );

      const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      await assertTrue('generator page never overflows horizontally at a narrow (375px) viewport', noHorizontalOverflow);

      await page.setViewport({ width: 1280, height: 900 });
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(
        () => {
          const f = document.getElementById('preview-frame');
          return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
        },
        { timeout: 15000 }
      );

      const defaults = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        return {
          src: document.getElementById('preview-frame').src,
          bodyClass: doc.body.className,
          brandWrapDisplay: getComputedStyle(doc.getElementById('brand-selector-wrap')).display,
          layoutWrapDisplay: getComputedStyle(doc.getElementById('layout-selector-wrap')).display,
        };
      });
      await assertTrue('generator preview defaults to the generic brand', defaults.src.includes('brand=generic'), defaults.src);
      await assertTrue(
        "generator preview starts on the generator's own default layout (sidebar)",
        defaults.bodyClass.includes('layout-sidebar'),
        defaults.bodyClass
      );
      await assertTrue("generator preview hides the previewed manual's own brand dropdown", defaults.brandWrapDisplay === 'none', defaults.brandWrapDisplay);
      await assertTrue("generator preview hides the previewed manual's own layout dropdown", defaults.layoutWrapDisplay === 'none', defaults.layoutWrapDisplay);

      const pageDoesNotScroll = await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden');
      await assertTrue('generator page itself does not scroll on desktop (only its inner panels do)', pageDoesNotScroll);

      await page.evaluate(() => {
        document.getElementById('preview-frame').contentDocument.defaultView.__marker = 'still-here';
      });

      await page.evaluate(() => {
        const input = document.getElementById('custom-color-primary');
        input.value = '#ff00aa';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(
        () => {
          const doc = document.getElementById('preview-frame').contentDocument;
          const style = doc && doc.getElementById('custom-theme-preview');
          return style && style.textContent.includes('#ff00aa');
        },
        { timeout: 5000 }
      );

      await page.evaluate(() => {
        const input = document.getElementById('custom-product-name');
        input.value = 'Acme Router';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(
        () => {
          const doc = document.getElementById('preview-frame').contentDocument;
          const el = doc && doc.querySelector('[data-i18n="product.name"]');
          return el && el.textContent === 'Acme Router';
        },
        { timeout: 5000 }
      );

      const markerSurvived = await page.evaluate(
        () => document.getElementById('preview-frame').contentDocument.defaultView.__marker === 'still-here'
      );
      await assertTrue(
        'generator: color + product name edits apply to the preview iframe without reloading it',
        markerSurvived
      );
      await assertTrue('no console errors in the generator custom-manual builder', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 17. Manual generator: the tool's OWN chrome (not the manual being
    //     built) can be translated via the language selector — js/generator/
    //     i18n.js applying i18n/generator-<lang>.json — and the choice
    //     persists to localStorage so a reload keeps it. The font dropdowns
    //     re-render with translated labels AND each option renders in its
    //     own font (a quick visual preview of the choice itself).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('#custom-font-heading option'));

      const firstOptionFont = await page.evaluate(
        () => document.querySelector('#custom-font-heading option').style.fontFamily
      );
      await assertTrue(
        'font dropdown options render in their own font-family',
        firstOptionFont.includes('system-ui'),
        firstOptionFont
      );

      const titleBefore = await page.evaluate(() => document.querySelector('h1').textContent);
      await page.select('#generator-lang-selector', 'pt');
      await page.waitForFunction(() => document.querySelector('h1').textContent !== undefined && document.querySelector('h1').textContent.includes('Gerador'));
      const titleAfter = await page.evaluate(() => document.querySelector('h1').textContent);
      await assertTrue('switching the generator language translates its own UI text', titleAfter !== titleBefore && titleAfter.includes('Gerador'), titleAfter);

      const persistedLang = await page.evaluate(() => localStorage.getItem('generator-lang'));
      await assertTrue('generator UI language choice persists to localStorage', persistedLang === 'pt', persistedLang);

      const radiusLabelPt = await page.evaluate(
        () => document.querySelector('#custom-border-radius option[value="4px"]').textContent
      );
      await assertTrue('static data-i18n option labels also translate (corner radius)', radiusLabelPt.includes('Sutil'), radiusLabelPt);

      await page.reload({ waitUntil: 'networkidle0' });
      const langAfterReload = await page.evaluate(() => document.getElementById('generator-lang-selector').value);
      await assertTrue('generator UI language choice survives a reload', langAfterReload === 'pt', langAfterReload);

      await assertTrue('no console errors switching the generator UI language', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 18. templates.html ("Explore"): a card per built-in brand look, each
    //     linking to the real demo (?brand=&layout=) and to the generator
    //     pre-filled with that look (?preset=).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const ctaHref = await page.$eval('#open-templates-page', (a) => ({ href: a.getAttribute('href'), target: a.target }));
      await assertTrue('generator CTA links to templates.html in a new tab', ctaHref.href === 'templates.html' && ctaHref.target === '_blank', JSON.stringify(ctaHref));

      await page.goto(`${BASE}/generator/templates.html`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.explore-card', { timeout: 15000 });

      const cards = await page.$$eval('.explore-card', (nodes) =>
        nodes.map((card) => ({
          liveHref: card.querySelector('.explore-card-cta-live').getAttribute('href'),
          baseHref: card.querySelector('.explore-card-cta-base').getAttribute('href'),
        }))
      );
      await assertTrue('Explore shows one card per built-in brand', cards.length === 7, cards.length);
      for (const { liveHref, baseHref } of cards) {
        await assertTrue(
          '"See it live" points at the real demo with brand+layout+lang forced',
          /^\.\.\/pages\/en\/menu1\/index\.html\?brand=[\w-]+&layout=\w+&lang=en$/.test(liveHref),
          liveHref
        );
        await assertTrue('"Use as a starting point" points at the generator with ?preset=', /^index\.html\?preset=[\w-]+$/.test(baseHref), baseHref);
      }

      const backHref = await page.$eval('.templates-page-back', (a) => a.getAttribute('href'));
      await assertTrue('templates.html has a link back to the generator', backHref === 'index.html', backHref);

      const presetIds = await page.$$eval('.explore-card', (nodes) => nodes.map((n) => n.dataset.presetId));
      const assetChecks = await Promise.all(
        presetIds.map((id) =>
          page.evaluate(
            (pid) =>
              Promise.all([fetch(`../assets/logos/${pid}.svg`), fetch(`../assets/favicons/${pid}.svg`)]).then(
                ([logoRes, faviconRes]) => ({ id: pid, logoOk: logoRes.ok, faviconOk: faviconRes.ok })
              ),
            id
          )
        )
      );
      for (const { id, logoOk, faviconOk } of assetChecks) {
        await assertTrue(`${id} has its own real logo file`, logoOk, id);
        await assertTrue(`${id} has its own real favicon file`, faviconOk, id);
      }

      const enLiveHref = await page.$eval('.explore-card .explore-card-cta-live', (a) => a.getAttribute('href'));
      await page.select('#generator-lang-selector', 'pt');
      await page.waitForFunction(
        () => document.querySelector('.explore-card .explore-card-cta-live')?.getAttribute('href')?.includes('lang=pt'),
        { timeout: 10000 }
      );
      const ptLiveHref = await page.$eval('.explore-card .explore-card-cta-live', (a) => a.getAttribute('href'));
      await assertTrue(
        'switching the Explore language updates "See it live" to the pt demo pages',
        ptLiveHref.startsWith('../pages/pt/menu1/index.html') && ptLiveHref.includes('lang=pt'),
        ptLiveHref
      );
      await assertTrue('"See it live" pointed at the en demo before the switch', enLiveHref.startsWith('../pages/en/menu1/index.html'), enLiveHref);
      const heading = await page.$eval('h1', (el) => el.textContent);
      await assertTrue('Explore page chrome itself retranslates on language switch', heading === 'Explorar', heading);

      await assertTrue('no console errors browsing the Explore page', errors.length === 0, errors.join('; '));
    });

    // "See it live" actually lands on the real demo, styled that way — not
    // a proxy check on the href alone.
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/en/menu1/index.html?brand=ember&layout=hybrid`, { waitUntil: 'networkidle0' });
      const applied = await page.evaluate(() => ({
        themeHref: document.getElementById('theme-css').href,
        layoutClass: document.body.className,
      }));
      await assertTrue('Explore "see it live" deep link applies the right theme', applied.themeHref.includes('theme-ember.css'), applied.themeHref);
      await assertTrue('Explore "see it live" deep link applies the right layout', applied.layoutClass.includes('layout-hybrid'), applied.layoutClass);
      await assertTrue('no console errors following a "see it live" deep link', errors.length === 0, errors.join('; '));
    });

    // "Use as a starting point" actually pre-fills the generator form, not
    // just a query string that goes nowhere.
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html?preset=ember`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.getElementById('custom-color-primary').value.toLowerCase() === '#a3430c', { timeout: 10000 });

      const applied = await page.evaluate(() => ({
        primary: document.getElementById('custom-color-primary').value,
        secondary: document.getElementById('custom-color-secondary').value,
        radius: document.getElementById('custom-border-radius').value,
        layout: document.querySelector('input[name="custom-layout"]:checked').value,
        statusText: document.getElementById('save-status').textContent,
      }));
      await assertTrue('?preset= pre-fills the primary color', applied.primary.toLowerCase() === '#a3430c', applied.primary);
      await assertTrue('?preset= pre-fills the secondary color', applied.secondary.toLowerCase() === '#f5ece1', applied.secondary);
      await assertTrue('?preset= pre-fills the border radius', applied.radius === '8px', applied.radius);
      await assertTrue('?preset= pre-fills the layout', applied.layout === 'hybrid', applied.layout);
      await assertTrue('?preset= shows a status message that a starting point was applied', applied.statusText.length > 0, applied.statusText);

      await page.waitForFunction(
        () => {
          const doc = document.getElementById('preview-frame').contentDocument;
          const style = doc && doc.getElementById('custom-theme-preview');
          return style && style.textContent.includes('#a3430c');
        },
        { timeout: 10000 }
      );

      await assertTrue('no console errors applying a preset via ?preset=', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 19. Manual generator packaging: buildManualZip() (js/generator/
    //     build-package.js) produces a real, working zip Blob for a
    //     selection (1 extra language, 'navbar' layout, uploaded logo/
    //     favicon), embeds an uploaded custom font as a real asset +
    //     @font-face rule, and — the point of the minimal-packaging
    //     rewrite — ships ONLY what this selection actually needs: the one
    //     layout's CSS, the one generated theme, and the two languages
    //     picked, with every page's own <link>s rewritten to match. Nothing
    //     from an unselected layout/theme/language/brand's own logo or
    //     favicon should be fetched into the zip at all.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const result = await page.evaluate(async () => {
        const { buildManualZip } = await import('/js/generator/package/build-package.js');
        const logoFile = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'logo.svg', { type: 'image/svg+xml' });
        const faviconFile = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'favicon.svg', { type: 'image/svg+xml' });
        const fontFile = new File([new Uint8Array([0, 1, 2, 3, 4, 5])], 'MyHeadingFont.woff2', { type: 'font/woff2' });
        const blob = await buildManualZip({
          colors: { primary: '#123456', secondary: '#abcdef', text: '#111111', bg: '#ffffff' },
          componentColors: {},
          borderRadius: '8px',
          fontHeading: "'GeneratorCustomHeading', sans-serif",
          fontBody: 'system-ui, sans-serif',
          logoFile,
          faviconFile,
          productName: 'Acme Router',
          layout: 'navbar',
          langs: ['en', 'pt'],
          customFonts: { heading: { file: fontFile, family: 'GeneratorCustomHeading' }, body: null },
        });
        const zip = await JSZip.loadAsync(blob);
        const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        const themeCss = await zip.file('themes/theme-custom.css').async('string');
        const indexHtml = await zip.file('index.html').async('string');
        const pageHead = (await zip.file('pages/en/menu1/index.html').async('string')).split('</head>')[0];
        return {
          size: blob.size,
          names,
          hasFontAsset: !!zip.file('assets/font-heading-custom.woff2'),
          hasFontFace: themeCss.includes("@font-face") && themeCss.includes('GeneratorCustomHeading') && themeCss.includes("font-heading-custom.woff2"),
          usesFamily: themeCss.includes("--font-heading: 'GeneratorCustomHeading', sans-serif;"),
          indexHtml,
          pageHead,
        };
      });
      await assertTrue('generator packaging produces a non-empty, plausibly-sized zip Blob', result.size > 50000, JSON.stringify({ size: result.size }));
      await assertTrue('generator packaging embeds an uploaded custom font as a real asset file', result.hasFontAsset, JSON.stringify(result));
      await assertTrue('generator packaging writes a matching @font-face rule into theme-custom.css', result.hasFontFace, JSON.stringify(result));
      await assertTrue('generator packaging points --font-heading at the custom font family', result.usesFamily, JSON.stringify(result));

      await assertTrue('zip ships only the selected layout\'s CSS', result.names.includes('css/layout-navbar.css'), result.names.join(', '));
      await assertTrue(
        'zip does NOT ship the other 3 layouts\' CSS',
        !result.names.some((n) => ['css/layout-sidebar.css', 'css/layout-scroll.css', 'css/layout-hybrid.css'].includes(n)),
        result.names.join(', ')
      );
      await assertTrue(
        'zip does NOT ship any of the original brand theme files, only the generated theme-custom.css',
        result.names.includes('themes/theme-custom.css') &&
          !result.names.some((n) =>
            ['themes/theme-generic.css', 'themes/theme-amethyst.css', 'themes/theme-ember.css', 'themes/theme-nocturne.css', 'themes/theme-juniper.css', 'themes/theme-coral.css'].includes(n)
          ),
        result.names.join(', ')
      );
      await assertTrue(
        'zip ships the uploaded logo/favicon under the fixed custom name, not any brand\'s own logos/favicons folder',
        result.names.includes('assets/logo-custom.svg') &&
          result.names.includes('assets/favicon-custom.svg') &&
          !result.names.some((n) => n.startsWith('assets/logos/') || n.startsWith('assets/favicons/') || n === 'assets/favicon.svg'),
        result.names.join(', ')
      );
      await assertTrue(
        'zip only includes pages for the selected languages (en + pt), not es',
        result.names.some((n) => n.startsWith('pages/pt/menu1/')) && !result.names.some((n) => n.startsWith('pages/es/menu1/')),
        result.names.join(', ')
      );
      await assertTrue(
        'zip\'s own index.html is regenerated (not copied), pointing at the default-language home page',
        result.indexHtml.includes("pages/en/menu1/index.html"),
        result.indexHtml
      );
      await assertTrue(
        "a shipped page's <link>s point at the one theme/layout this zip actually has, not the unselected ones",
        result.pageHead.includes('themes/theme-custom.css') &&
          result.pageHead.includes('css/layout-navbar.css') &&
          !result.pageHead.includes('layout-sidebar.css') &&
          !result.pageHead.includes('layout-scroll.css') &&
          !result.pageHead.includes('layout-hybrid.css') &&
          !result.pageHead.includes('theme-generic.css'),
        result.pageHead
      );
      await assertTrue(
        "a shipped page's favicon <link> points at the custom favicon, not the template's shared one",
        result.pageHead.includes('assets/favicon-custom.svg'),
        result.pageHead
      );
    });

    // ------------------------------------------------------------------
    // 19b. Logo/favicon are optional: skipping both must still produce a
    //      working zip, falling back to this template's own generic-brand
    //      logo/favicon — but re-saved under the SAME fixed
    //      assets/logo-custom.<ext> / assets/favicon-custom.<ext> name a
    //      real upload would use, not left under their own
    //      assets/logos/generic.svg name (that file isn't shipped at all
    //      any more — see js/generator/file-manifest.js's FALLBACK_LOGO).
    //      Every other customization (colors here) still applies.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const result = await page.evaluate(async () => {
        const { buildManualZip } = await import('/js/generator/package/build-package.js');
        const blob = await buildManualZip({
          colors: { primary: '#123456', secondary: '#abcdef', text: '#111111', bg: '#ffffff' },
          componentColors: {},
          borderRadius: '8px',
          fontHeading: 'system-ui, sans-serif',
          fontBody: 'system-ui, sans-serif',
          logoFile: undefined,
          faviconFile: undefined,
          productName: 'No Logo Product',
          layout: 'sidebar',
          langs: ['en'],
        });
        const zip = await JSZip.loadAsync(blob);
        const brandsConfig = await zip.file('js/theme/brands-config.js').async('string');
        const themeCss = await zip.file('themes/theme-custom.css').async('string');
        return {
          size: blob.size,
          usesFixedLogoPath: brandsConfig.includes("logo: 'assets/logo-custom.svg'"),
          usesFixedFaviconPath: brandsConfig.includes("favicon: 'assets/favicon-custom.svg'"),
          logoUrlVar: themeCss.includes("--logo-url: url('../assets/logo-custom.svg');"),
          genericBytesSavedUnderFixedName: !!zip.file('assets/logo-custom.svg'),
          genericOwnNameNotShipped: !zip.file('assets/logos/generic.svg'),
          keptOtherCustomization: themeCss.includes('--color-primary: #123456;'),
        };
      });
      await assertTrue('skipping logo/favicon still produces a non-empty zip', result.size > 50000, JSON.stringify({ size: result.size }));
      await assertTrue("brands-config.js points at the fixed custom logo path even though nothing was uploaded", result.usesFixedLogoPath, JSON.stringify(result));
      await assertTrue("brands-config.js points at the fixed custom favicon path even though nothing was uploaded", result.usesFixedFaviconPath, JSON.stringify(result));
      await assertTrue('theme-custom.css --logo-url points at the fixed custom logo path', result.logoUrlVar, JSON.stringify(result));
      await assertTrue('the generic brand\'s own logo bytes are saved under the fixed custom name', result.genericBytesSavedUnderFixedName, JSON.stringify(result));
      await assertTrue('the generic brand\'s own assets/logos/generic.svg is NOT shipped under its original name', result.genericOwnNameNotShipped, JSON.stringify(result));
      await assertTrue('every other customization (colors) still applies with no logo/favicon uploaded', result.keptOtherCustomization, JSON.stringify(result));
    });

    // ------------------------------------------------------------------
    // 20. Regression: switching the preview LAYOUT must not lose the rest
    //     of the customization. Root cause was a race — the iframe's own
    //     'load' event fires before js/page-init.js's async initPage()
    //     chain necessarily finishes, so applying our product-name/logo
    //     override right on 'load' could still get clobbered later by
    //     page-init's own applyTranslations()/applyLogo() calls resolving
    //     afterwards (colors were never affected, since nothing else in
    //     page-init.js ever touches the CSS variables). Fixed by polling
    //     for the nav tree's own links (waitForPreviewReady in
    //     js/generator/preview.js) as a "page-init.js is done" signal
    //     before applying anything.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      // Wait for the INITIAL load to fully settle — including its
      // background #print-manual fallback build (js/print-fallback.js),
      // the same multi-page fetch js/generator/preview.js's own
      // waitForPreviewReady() now waits on — before triggering a SECOND
      // navigation (the layout switch below). Racing a fresh navigation
      // against that fallback's still-in-flight fetches is exactly the
      // dev-server-connection-pressure flakiness this suite's own comments
      // warn about elsewhere (see withPage / section 5b above); it isn't
      // what's actually being regression-tested here.
      await page.waitForFunction(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        return (
          doc &&
          doc.querySelector('#site-nav-tree a') &&
          doc.querySelector('#print-manual[data-ready="true"]')
        );
      });

      await page.evaluate(() => {
        const color = document.getElementById('custom-color-primary');
        color.value = '#ff00aa';
        color.dispatchEvent(new Event('input', { bubbles: true }));
        const name = document.getElementById('custom-product-name');
        name.value = 'Repro Product';
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await page.evaluate(() => {
        const navbar = Array.from(document.querySelectorAll('#custom-layout-group input[type=radio]')).find((r) => r.value === 'navbar');
        navbar.checked = true;
        navbar.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(
        () => {
          // doc.body can be briefly null mid-navigation (see the templates.html
          // test above for why this has to be guarded, not just `doc &&`).
          const doc = document.getElementById('preview-frame').contentDocument;
          return doc && doc.body && doc.body.classList.contains('layout-navbar');
        },
        { timeout: 20000 }
      );
      // Give page-init.js's own async chain (and any race with it) time to
      // fully settle, not just the layout class — the whole point of this
      // regression check.
      await new Promise((r) => setTimeout(r, 400));

      const afterLayoutSwitch = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        return {
          themeStyle: doc.getElementById('custom-theme-preview')?.textContent,
          productName: doc.querySelector('[data-i18n="product.name"]')?.textContent,
        };
      });
      await assertTrue(
        'layout switch keeps the custom color (never actually broke, kept as a baseline)',
        afterLayoutSwitch.themeStyle?.includes('#ff00aa'),
        afterLayoutSwitch.themeStyle
      );
      await assertTrue(
        'layout switch no longer loses the custom product name',
        afterLayoutSwitch.productName === 'Repro Product',
        afterLayoutSwitch.productName
      );
      await assertTrue('no console errors switching layout with a live customization', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 21. The preview's own language dropdown only offers the languages
    //     actually selected in the generator's checkboxes — English alone
    //     by default, and toggling Português/Español live-updates the
    //     available options without reloading the iframe.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => {
        const f = document.getElementById('preview-frame');
        return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
      });
      await new Promise((r) => setTimeout(r, 300)); // let waitForPreviewReady's initial filter pass run

      const visibleLangsDefault = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        return Array.from(doc.getElementById('lang-selector').options)
          .filter((o) => !o.hidden)
          .map((o) => o.value);
      });
      await assertTrue(
        'preview language dropdown only offers English by default',
        JSON.stringify(visibleLangsDefault) === JSON.stringify(['en']),
        JSON.stringify(visibleLangsDefault)
      );

      await page.click('#custom-lang-pt');
      await page.waitForFunction(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        const opt = doc.getElementById('lang-selector').querySelector('option[value="pt"]');
        return opt && !opt.hidden;
      });
      const visibleLangsAfterPt = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        return Array.from(doc.getElementById('lang-selector').options)
          .filter((o) => !o.hidden)
          .map((o) => o.value);
      });
      await assertTrue(
        'checking Português makes it available in the preview language dropdown, live',
        JSON.stringify(visibleLangsAfterPt) === JSON.stringify(['en', 'pt']),
        JSON.stringify(visibleLangsAfterPt)
      );

      await assertTrue('no console errors filtering preview languages', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 22. Each color field has a hint (native title tooltip) explaining
    //     which page elements that color actually applies to — a color
    //     swatch alone doesn't say that on its own.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const primaryHint = await page.$eval('label:has(#custom-color-primary) .generator-hint-icon', (el) => el.title);
      await assertTrue(
        'the primary color field has a hint describing where it applies',
        primaryHint.toLowerCase().includes('link') && primaryHint.toLowerCase().includes('button'),
        primaryHint
      );
      const bgHint = await page.$eval('label:has(#custom-color-bg) .generator-hint-icon', (el) => el.title);
      await assertTrue('the background color field has its own distinct hint', bgHint.toLowerCase().includes('background'), bgHint);
    });

    // ------------------------------------------------------------------
    // 22b. Regression: changing the page "Background" color must only ever
    //      recolor the page/content background — not the header's search
    //      box, its language/layout/brand selects, or the "Download PDF"
    //      button's text. Those used to fall back to the same --color-bg
    //      variable in css/base.css, so a dark/saturated background choice
    //      also silently made the search input and selects match it and
    //      turned the PDF button's white text unreadable.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#preview-frame');

      const result = await page.evaluate(async () => {
        const bgInput = document.getElementById('custom-color-bg');
        bgInput.value = '#ff0000';
        bgInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
        const doc = document.getElementById('preview-frame').contentDocument;
        const styleOf = (sel, prop) => getComputedStyle(doc.querySelector(sel))[prop];
        return {
          bodyBg: styleOf('body', 'backgroundColor'),
          searchInputBg: styleOf('.search-input', 'backgroundColor'),
          selectBg: styleOf('.header-control select', 'backgroundColor'),
          pdfButtonColor: styleOf('.pdf-download-button', 'color'),
        };
      });

      await assertTrue('setting Background actually recolors the page body', result.bodyBg === 'rgb(255, 0, 0)', result.bodyBg);
      await assertTrue(
        'setting Background does NOT recolor the header search input',
        result.searchInputBg === 'rgb(255, 255, 255)',
        result.searchInputBg
      );
      await assertTrue(
        'setting Background does NOT recolor the header selects (language/layout/brand)',
        result.selectBg === 'rgb(255, 255, 255)',
        result.selectBg
      );
      await assertTrue(
        'setting Background does NOT change the "Download PDF" button\'s (white) text color',
        result.pdfButtonColor === 'rgb(255, 255, 255)',
        result.pdfButtonColor
      );
    });

    // ------------------------------------------------------------------
    // 23. Regression: "Download PDF" from inside the live preview (both the
    //     header button and the footer link) must produce a PDF reflecting
    //     the actual customization, not silently fall back to the generic
    //     brand — print.html/js/print-builder.js have no way to know about
    //     an in-memory custom theme on their own, so js/generator/ui.js
    //     stashes it into sessionStorage and opens print.html with
    //     ?generatorPreview=1 right before the click's default action would
    //     otherwise have fired. Also checks the footer link specifically:
    //     before this fix it was a plain in-iframe navigation, so clicking
    //     it used to send the PREVIEW IFRAME ITSELF to print.html instead
    //     of opening a new tab.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => {
        const f = document.getElementById('preview-frame');
        return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
      });
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        const color = document.getElementById('custom-color-primary');
        color.value = '#123abc';
        color.dispatchEvent(new Event('input', { bubbles: true }));
        const name = document.getElementById('custom-product-name');
        name.value = 'PDF Test Product';
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const [popup] = await Promise.all([
        new Promise((resolve) => browserBox.browser.once('targetcreated', async (target) => resolve(await target.page()))),
        page.evaluate(() => {
          document.getElementById('preview-frame').contentDocument.getElementById('pdf-download-button').click();
        }),
      ]);
      await popup.waitForFunction(() => document.getElementById('status')?.textContent.includes('Ready'), { timeout: 20000 });
      const popupInfo = await popup.evaluate(() => ({
        cover: document.querySelector('.cover .product-name')?.textContent,
        themeStyle: document.getElementById('generator-preview-print-theme')?.textContent,
      }));
      await popup.close();
      await assertTrue(
        "PDF opened from the live preview's header button shows the custom product name",
        popupInfo.cover === 'PDF Test Product',
        JSON.stringify(popupInfo)
      );
      await assertTrue(
        "PDF opened from the live preview's header button carries the custom color",
        popupInfo.themeStyle?.includes('#123abc'),
        JSON.stringify(popupInfo)
      );

      // Footer link: must ALSO open a new tab with the override (not
      // navigate the iframe itself away to a plain, generic print.html).
      const iframeUrlBefore = await page.evaluate(() => document.getElementById('preview-frame').src);
      const [popup2] = await Promise.all([
        new Promise((resolve) => browserBox.browser.once('targetcreated', async (target) => resolve(await target.page()))),
        page.evaluate(() => {
          document.getElementById('preview-frame').contentDocument.querySelector('[data-pdf-link]').click();
        }),
      ]);
      await popup2.waitForFunction(() => document.getElementById('status')?.textContent.includes('Ready'), { timeout: 20000 });
      const popup2Cover = await popup2.evaluate(() => document.querySelector('.cover .product-name')?.textContent);
      await popup2.close();
      const iframeUrlAfter = await page.evaluate(() => document.getElementById('preview-frame').src);
      await assertTrue("PDF footer link also shows the custom product name (not the generic default)", popup2Cover === 'PDF Test Product', popup2Cover);
      await assertTrue(
        "PDF footer link opens a new tab instead of navigating the preview iframe itself away",
        iframeUrlAfter === iframeUrlBefore,
        JSON.stringify({ before: iframeUrlBefore, after: iframeUrlAfter })
      );

      await assertTrue('no console errors exporting a PDF from the live preview', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 24. Landing page (index.html): the tool's own entry point, now a
    //     two-panel choice between building a custom manual and browsing
    //     ready-made ones, replacing the old plain redirect-to-the-manual
    //     behavior (that redirect is now generated fresh per download —
    //     see test 19's index.html assertion — not a static root file).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.setViewport({ width: 375, height: 800 });
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });

      const hrefs = await page.$$eval('.landing-panel', (els) => els.map((a) => a.getAttribute('href')));
      await assertTrue(
        'landing page has two panels linking to the generator and the templates browser',
        JSON.stringify(hrefs) === JSON.stringify(['generator/index.html', 'generator/templates.html']),
        JSON.stringify(hrefs)
      );
      const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      await assertTrue('landing page never overflows horizontally at a narrow (375px) viewport', noHorizontalOverflow);

      const creditHref = await page.$eval('.site-credit a', (a) => a.href);
      const creditRel = await page.$eval('.site-credit a', (a) => a.rel);
      await assertTrue('landing page credit link points at andreyrosa.dev and opens a new tab safely', creditHref === 'https://andreyrosa.dev/' && creditRel.includes('noopener'), JSON.stringify({ creditHref, creditRel }));

      await assertTrue('no console errors on the landing page', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 25. canonicalizePagePath() (js/nav-config.js): normalizes the URL
    //     shapes a real static host's own routing can produce — a
    //     '.html'-stripped path and a directory URL with a trailing slash
    //     (both are what Cloudflare Pages redirects a request to) — back to
    //     the same default-language page a plain '.html' URL resolves to,
    //     so active-nav-highlighting and the language switch keep working
    //     after that redirect, not just when loaded via the literal
    //     '.html' path this dev/test server always uses.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html`, { waitUntil: 'networkidle0' });
      const result = await page.evaluate(async () => {
        const { canonicalizePagePath } = await import('/js/nav/nav-config.js');
        return {
          plain: canonicalizePagePath('/pages/en/menu1/index.html'),
          extensionStripped: canonicalizePagePath('/pages/pt/menu1/index'),
          trailingSlash: canonicalizePagePath('/pages/pt/menu1/'),
          nonDefaultLangSubmenu: canonicalizePagePath('/pages/es/menu1/submenu1'),
        };
      });
      await assertTrue('canonicalizePagePath leaves an already-plain .html path unchanged', result.plain === '/pages/en/menu1/index.html', result.plain);
      await assertTrue(
        "canonicalizePagePath normalizes a '.html'-stripped path (Cloudflare Pages' own redirect target) to the same default-language page",
        result.extensionStripped === '/pages/en/menu1/index.html',
        result.extensionStripped
      );
      await assertTrue(
        "canonicalizePagePath normalizes a trailing-slash directory URL to the same default-language page",
        result.trailingSlash === '/pages/en/menu1/index.html',
        result.trailingSlash
      );
      await assertTrue(
        'canonicalizePagePath handles a non-default-language, extension-stripped submenu path too',
        result.nonDefaultLangSubmenu === '/pages/en/menu1/submenu1.html',
        result.nonDefaultLangSubmenu
      );
    });

    // ------------------------------------------------------------------
    // 26. Advanced/per-component colors: each row starts on "auto" (follows
    //     the base palette, no override emitted at all), and turning a
    //     row's auto checkbox off applies its own color live to the preview
    //     — then disappears again from the emitted CSS the moment auto is
    //     re-checked, and the same value ends up in the downloaded zip's
    //     theme-custom.css as a second, separate :root block (not
    //     regex-patched into the template's own commented-out block — see
    //     js/generator/build-package.js's buildThemeCustomCss()).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      const errors = collectErrors(page);
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => {
        const f = document.getElementById('preview-frame');
        return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
      });
      await new Promise((r) => setTimeout(r, 300));

      // The <details> holding the advanced rows starts closed — must be
      // opened before its rows are interactive/visible, same as a real
      // visitor would need to click it open.
      await page.click('.generator-advanced summary');

      const rowCount = await page.$$eval('.generator-advanced-row', (els) => els.length);
      await assertTrue('advanced colors section has one row per component-color variable', rowCount === 20, rowCount);

      await page.click('#auto-sidebar');
      await page.evaluate(() => {
        const input = document.getElementById('custom-color-sidebar');
        input.value = '#ff00ff';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(
        () => {
          const doc = document.getElementById('preview-frame').contentDocument;
          const style = doc && doc.getElementById('custom-theme-preview');
          return style && style.textContent.includes('--color-sidebar-bg: #ff00ff');
        },
        { timeout: 5000 }
      );
      await assertTrue('turning off auto and setting a color applies it live to the preview', true);

      await page.click('#auto-sidebar');
      await page.waitForFunction(
        () => {
          const doc = document.getElementById('preview-frame').contentDocument;
          const style = doc && doc.getElementById('custom-theme-preview');
          return style && !style.textContent.includes('--color-sidebar-bg');
        },
        { timeout: 5000 }
      );
      await assertTrue('re-checking auto removes the override from the live preview entirely', true);

      await page.click('#auto-sidebar');
      await page.evaluate(() => {
        const input = document.getElementById('custom-color-sidebar');
        input.value = '#00ffcc';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 200));
      const zipHasOverride = await page.evaluate(async () => {
        const mod = await import('/js/generator/package/build-package.js');
        const blob = await mod.buildManualZip({
          colors: { primary: '#2b6cb0', secondary: '#edf2f7', text: '#1a202c', bg: '#ffffff' },
          componentColors: { '--color-sidebar-bg': '#00ffcc' },
          borderRadius: '4px',
          fontHeading: 'system-ui, sans-serif',
          fontBody: 'system-ui, sans-serif',
          logoFile: null,
          faviconFile: null,
          productName: 'Advanced Colors Test',
          layout: 'sidebar',
          langs: ['en'],
          customFonts: { heading: null, body: null },
        });
        const zip = await window.JSZip.loadAsync(blob);
        const themeCss = await zip.file('themes/theme-custom.css').async('string');
        return themeCss.includes('--color-sidebar-bg: #00ffcc');
      });
      await assertTrue('a non-auto component color ends up in the downloaded zip\'s theme-custom.css', zipHasOverride);

      await assertTrue('no console errors using advanced/component colors', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 26b. Regression: "Borders", "Table borders" and "Table header
    //      background" are independent rows from each other and from
    //      "Search results panel border" — all four used to share
    //      --color-secondary. Also: "Search box & selects background"
    //      actually recolors the real search input (it used to be
    //      hardcoded white and not exposed at all as a row, so the box a
    //      visitor actually sees never changed no matter what was picked).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => {
        const f = document.getElementById('preview-frame');
        return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
      });
      await page.click('.generator-advanced summary');

      async function setRow(id, hex) {
        await page.click(`#auto-${id}`);
        await page.evaluate(
          (id, hex) => {
            const input = document.getElementById(`custom-color-${id}`);
            input.value = hex;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          },
          id,
          hex
        );
      }

      await setRow('border', '#112233');
      await setRow('table-border', '#445566');
      await setRow('table-header-bg', '#778899');
      await setRow('control-bg', '#ff00aa');
      await setRow('nav-link-bg-hover', '#123456');
      await new Promise((r) => setTimeout(r, 300));

      const result = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        const style = doc.getElementById('custom-theme-preview');
        return {
          styleText: style ? style.textContent : '',
          searchInputBg: getComputedStyle(doc.querySelector('.search-input')).backgroundColor,
        };
      });

      await assertTrue('setting "Borders" emits --color-border on its own', result.styleText.includes('--color-border: #112233'), result.styleText);
      await assertTrue(
        'setting "Table borders" emits --color-table-border independently of --color-border',
        result.styleText.includes('--color-table-border: #445566'),
        result.styleText
      );
      await assertTrue(
        'setting "Table header background" emits --color-table-header-bg on its own',
        result.styleText.includes('--color-table-header-bg: #778899'),
        result.styleText
      );
      await assertTrue(
        '"Search results panel border" stays untouched (still auto, not emitted)',
        !result.styleText.includes('--color-search-results-border'),
        result.styleText
      );
      await assertTrue(
        'setting "Search box & selects background" actually recolors the real search input',
        result.searchInputBg === 'rgb(255, 0, 170)',
        result.searchInputBg
      );
      await assertTrue(
        'setting "Menu link hover background" does not also recolor search result hover',
        !result.styleText.includes('--color-search-results-hover-bg'),
        result.styleText
      );

      await setRow('search-results-hover-bg', '#abcdef');
      const styleTextAfterHover = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        const style = doc.getElementById('custom-theme-preview');
        return style ? style.textContent : '';
      });
      await assertTrue(
        'setting "Search result hover background" emits its own variable, independent of menu link hover',
        styleTextAfterHover.includes('--color-search-results-hover-bg: #abcdef') && styleTextAfterHover.includes('--color-nav-link-bg-hover: #123456'),
        styleTextAfterHover
      );

      await setRow('callout-note', '#ff0000');
      const styleTextAfterCallout = await page.evaluate(() => {
        const doc = document.getElementById('preview-frame').contentDocument;
        const style = doc.getElementById('custom-theme-preview');
        return style ? style.textContent : '';
      });
      await assertTrue(
        'setting "Callout — Note" emits --color-callout-note, leaving the other 4 callout colors on auto',
        styleTextAfterCallout.includes('--color-callout-note: #ff0000') &&
          !styleTextAfterCallout.includes('--color-callout-tip') &&
          !styleTextAfterCallout.includes('--color-callout-caution') &&
          !styleTextAfterCallout.includes('--color-callout-warning') &&
          !styleTextAfterCallout.includes('--color-callout-danger'),
        styleTextAfterCallout
      );
    });

    // ------------------------------------------------------------------
    // 27. First-visit "use a bigger screen" modal (generator/index.html
    //     only): shown once on a narrow/touch viewport with nothing
    //     dismissed yet, never again after dismissal (persisted in
    //     localStorage), and never at all on a wide desktop viewport or on
    //     the other two tool pages.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.setViewport({ width: 375, height: 700 });
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const hiddenInitial = await page.$eval('#desktop-hint', (el) => el.hidden);
      await assertTrue('desktop-hint modal is shown on a fresh, narrow-viewport first visit', hiddenInitial === false, hiddenInitial);

      await page.click('#desktop-hint-ok');
      const hiddenAfterDismiss = await page.$eval('#desktop-hint', (el) => el.hidden);
      const stored = await page.evaluate(() => localStorage.getItem('generator-desktop-hint-dismissed'));
      await assertTrue('dismissing the modal hides it and persists the dismissal', hiddenAfterDismiss === true && stored === '1', JSON.stringify({ hiddenAfterDismiss, stored }));

      await page.reload({ waitUntil: 'networkidle0' });
      const hiddenAfterReload = await page.$eval('#desktop-hint', (el) => el.hidden);
      await assertTrue('the modal stays dismissed across a reload, in the same browser', hiddenAfterReload === true, hiddenAfterReload);
    });
    await withPage(browserBox, async (page) => {
      await page.setViewport({ width: 1400, height: 900 });
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const hiddenDesktop = await page.$eval('#desktop-hint', (el) => el.hidden);
      await assertTrue('desktop-hint modal never shows on a fresh, wide-viewport visit', hiddenDesktop === true, hiddenDesktop);
    });
    await withPage(browserBox, async (page) => {
      await page.setViewport({ width: 375, height: 700 });
      await page.goto(`${BASE}/generator/templates.html`, { waitUntil: 'networkidle0' });
      const modalOnTemplates = await page.$('#desktop-hint');
      await assertTrue('desktop-hint modal markup does not exist on templates.html', modalOnTemplates === null);
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
      const modalOnLanding = await page.$('#desktop-hint');
      await assertTrue('desktop-hint modal markup does not exist on the landing page', modalOnLanding === null);
    });

    // ------------------------------------------------------------------
    // 28. Tool-site credit footer ("made by Andrey · andreyrosa.dev") is
    //     present on all 3 tool pages and — the important negative case —
    //     absent from a real manual's own footer (partials/footer.html,
    //     which ships inside every generated manual): the tool author's
    //     name must never leak into a user's downloaded manual.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      for (const url of [`${BASE}/`, `${BASE}/generator/index.html`, `${BASE}/generator/templates.html`]) {
        await page.goto(url, { waitUntil: 'networkidle0' });
        const text = await page.$eval('.site-credit', (el) => el.textContent).catch(() => null);
        await assertTrue(`site-credit footer is present on ${url}`, !!text && text.includes('andreyrosa.dev'), text);
      }

      await page.goto(`${BASE}/pages/en/menu1/index.html`, { waitUntil: 'networkidle0' });
      const manualFooterHTML = await page.$eval('#site-footer', (el) => el.innerHTML);
      await assertTrue("the manual's own footer partial never mentions the tool author (partials/footer.html ships in every generated manual)", !manualFooterHTML.includes('andreyrosa'), manualFooterHTML);
    });

    // ------------------------------------------------------------------
    // 29. Save / restore / reset: "Save" snapshots the whole form —
    //     including an uploaded logo file, as a data URL — into
    //     localStorage; reloading the page (a stand-in for "visiting again
    //     in the same browser") restores every field automatically, with no
    //     confirmation prompt, and a restored logo survives all the way
    //     through to a real downloaded zip (proving the reconstructed File
    //     object, not just its data-URL preview, actually works).
    //     "Restore default" clears the save and puts every field back to
    //     this page's own hard-coded defaults.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      const errors = collectErrors(page);
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => {
        const f = document.getElementById('preview-frame');
        return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
      });
      await new Promise((r) => setTimeout(r, 300));

      await page.evaluate(() => {
        document.getElementById('custom-product-name').value = 'Saved Router';
        document.getElementById('custom-product-name').dispatchEvent(new Event('input', { bubbles: true }));
        const primary = document.getElementById('custom-color-primary');
        primary.value = '#ff0011';
        primary.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.click('.generator-advanced summary');
      await page.click('#auto-footer');
      await page.evaluate(() => {
        const el = document.getElementById('custom-color-footer');
        el.value = '#00aa33';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.click('#custom-lang-pt');
      await page.evaluate(() => {
        const navbar = Array.from(document.querySelectorAll('#custom-layout-group input[type=radio]')).find((r) => r.value === 'navbar');
        navbar.checked = true;
        navbar.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 400));

      const logoPath = path.join(ROOT, 'tests', '_fixture-logo.svg');
      await fs.writeFile(logoPath, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
      try {
        const fileInput = await page.$('#custom-logo');
        await fileInput.uploadFile(logoPath);
        await new Promise((r) => setTimeout(r, 400));

        await page.click('#save-progress');
        await new Promise((r) => setTimeout(r, 200));
        const saveStatus = await page.$eval('#save-status', (el) => el.textContent);
        await assertTrue('Save button shows a confirmation status message', saveStatus.length > 0, saveStatus);
        const savedRaw = await page.evaluate(() => localStorage.getItem('generator-saved-manual'));
        await assertTrue('Save writes a snapshot to localStorage', !!savedRaw);

        await page.reload({ waitUntil: 'networkidle0' });
        await page.waitForFunction(() => {
          const f = document.getElementById('preview-frame');
          return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
        });
        await new Promise((r) => setTimeout(r, 400));

        const restored = await page.evaluate(() => ({
          productName: document.getElementById('custom-product-name').value,
          primary: document.getElementById('custom-color-primary').value,
          langPt: document.getElementById('custom-lang-pt').checked,
          layout: document.querySelector('#custom-layout-group input:checked').value,
          statusMentionsRestore: document.getElementById('save-status').textContent.length > 0,
        }));
        await assertTrue(
          'reloading (same browser) silently restores every saved field, with no confirmation prompt',
          restored.productName === 'Saved Router' &&
            restored.primary === '#ff0011' &&
            restored.langPt === true &&
            restored.layout === 'navbar' &&
            restored.statusMentionsRestore,
          JSON.stringify(restored)
        );

        await page.click('.generator-advanced summary');
        const footerRow = await page.evaluate(() => ({
          autoChecked: document.getElementById('auto-footer').checked,
          value: document.getElementById('custom-color-footer').value,
        }));
        await assertTrue(
          'a saved non-auto component color is restored too, still off auto',
          footerRow.autoChecked === false && footerRow.value === '#00aa33',
          JSON.stringify(footerRow)
        );

        const downloadResult = await page.evaluate(() => {
          return new Promise((resolve) => {
            const originalCreate = URL.createObjectURL;
            URL.createObjectURL = (blob) => {
              URL.createObjectURL = originalCreate;
              (async () => {
                const zip = await window.JSZip.loadAsync(blob);
                const file = zip.file('assets/logo-custom.svg');
                const logoContent = file ? await file.async('string') : null;
                resolve({ hasCustomLogo: !!file, logoIsOurUpload: !!logoContent && logoContent.includes('width="10" height="10"') });
              })();
              return originalCreate.call(URL, blob);
            };
            document.getElementById('custom-download').click();
          });
        });
        await assertTrue(
          'the restored logo (reconstructed from its saved data URL) survives all the way into a real downloaded zip',
          downloadResult.hasCustomLogo && downloadResult.logoIsOurUpload,
          JSON.stringify(downloadResult)
        );

        page.on('dialog', (dialog) => dialog.accept());
        await page.click('#reset-defaults');
        await new Promise((r) => setTimeout(r, 400));
        const afterReset = await page.evaluate(() => ({
          productName: document.getElementById('custom-product-name').value,
          primary: document.getElementById('custom-color-primary').value,
          langPt: document.getElementById('custom-lang-pt').checked,
          layout: document.querySelector('#custom-layout-group input:checked').value,
          savedRemoved: localStorage.getItem('generator-saved-manual') === null,
        }));
        await assertTrue(
          '"Restore default" puts every field back to this page\'s own hard-coded defaults and clears the save',
          afterReset.productName === 'My Product' &&
            afterReset.primary === '#2b6cb0' &&
            afterReset.langPt === false &&
            afterReset.layout === 'sidebar' &&
            afterReset.savedRemoved,
          JSON.stringify(afterReset)
        );
      } finally {
        await fs.rm(logoPath, { force: true });
      }

      await assertTrue('no console errors in the save/restore/reset flow', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 30. A downloaded manual actually boots when extracted and served
    //     fresh from its own folder — every other packaging test above only
    //     inspects the zip's contents as strings, never proves the result
    //     works in a real browser once unzipped, which is exactly the gap
    //     that let a broken deploy through undetected. Writes the zip's
    //     files to disk for real, serves that directory on its own port
    //     (a stand-in for a live static host or VS Code's Live Server, not
    //     this suite's own BASE server), and checks the header/nav/footer
    //     actually populated — not just present in the DOM, but filled in,
    //     which only happens if every fetch() in the import chain
    //     (partials, nav-config.json, i18n) resolved against the right
    //     paths for this manual's own (reorganized) file layout.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      const files = await page.evaluate(async () => {
        const { buildManualZip } = await import('/js/generator/package/build-package.js');
        const blob = await buildManualZip({
          colors: { primary: '#2b6cb0', secondary: '#edf2f7', text: '#1a202c', bg: '#ffffff' },
          componentColors: {},
          borderRadius: '4px',
          fontHeading: 'system-ui, sans-serif',
          fontBody: 'system-ui, sans-serif',
          logoFile: null,
          faviconFile: null,
          productName: 'Extracted Manual Test',
          layout: 'sidebar',
          langs: ['en'],
          customFonts: { heading: null, body: null },
        });
        const zip = await JSZip.loadAsync(blob);
        const out = [];
        for (const [name, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          out.push({ name, base64: await entry.async('base64') });
        }
        return out;
      });

      await fs.rm(EXTRACTED_MANUAL_DIR, { recursive: true, force: true });
      for (const f of files) {
        const dest = path.join(EXTRACTED_MANUAL_DIR, f.name);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, Buffer.from(f.base64, 'base64'));
      }

      const extractedServer = await startServer(EXTRACTED_MANUAL_DIR, EXTRACTED_MANUAL_PORT);
      try {
        await withPage(browserBox, async (extractedPage) => {
          const errors = collectErrors(extractedPage);
          await extractedPage.goto(`http://localhost:${EXTRACTED_MANUAL_PORT}/index.html`, { waitUntil: 'networkidle0' });
          await extractedPage.waitForSelector('#site-nav-tree a');

          const result = await extractedPage.evaluate(() => ({
            url: window.location.pathname,
            navLabels: Array.from(document.querySelectorAll('#site-nav-tree a')).map((a) => a.textContent.trim()),
            headerBrand: document.querySelector('.header-brand .product-name').textContent.trim(),
            footerHasPdfLink: !!document.querySelector('#site-footer [data-pdf-link]'),
          }));

          await assertTrue(
            'extracted manual: index.html redirects to the first page',
            result.url === '/pages/en/menu1/index.html',
            result.url
          );
          await assertTrue(
            'extracted manual: nav tree actually renders every menu (not just the native page content)',
            result.navLabels.length === 8 && result.navLabels[0] === 'Getting Started',
            JSON.stringify(result.navLabels)
          );
          await assertTrue(
            'extracted manual: header partial rendered with the custom product name',
            result.headerBrand === 'Extracted Manual Test',
            result.headerBrand
          );
          await assertTrue('extracted manual: footer partial rendered', result.footerHasPdfLink, String(result.footerHasPdfLink));
          await assertTrue('extracted manual: no console errors booting from a freshly served extraction', errors.length === 0, errors.join('; '));
        });
      } finally {
        extractedServer.close();
        await fs.rm(EXTRACTED_MANUAL_DIR, { recursive: true, force: true });
      }
    });

    // ------------------------------------------------------------------
    // 31. Fase S improvements: robots.txt, per-page SEO metadata
    //     (hreflang/description/structured data), the document version
    //     field, and the search/navbar accessibility attributes added
    //     alongside them.
    // ------------------------------------------------------------------
    {
      const robotsRes = await fetch(`${BASE}/robots.txt`);
      const robotsBody = await robotsRes.text();
      await assertTrue('robots.txt is served and allows crawling', robotsRes.ok && robotsBody.includes('Allow: /'), robotsBody);
    }

    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#site-nav-tree a');

      const seo = await page.evaluate(() => {
        const hreflangs = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map((l) => l.getAttribute('hreflang'));
        const description = document.querySelector('meta[name="description"]');
        const ld = document.getElementById('page-structured-data');
        let ldType = null;
        try {
          ldType = ld ? JSON.parse(ld.textContent)['@type'] : null;
        } catch {
          ldType = null;
        }
        return {
          hreflangs,
          description: description ? description.getAttribute('content') : null,
          ldType,
          footerVersion: document.querySelector('#site-footer .footer-version')?.textContent.trim(),
        };
      });

      await assertTrue(
        'every supported language gets an hreflang alternate link',
        ['en', 'pt', 'es'].every((l) => seo.hreflangs.includes(l)),
        JSON.stringify(seo.hreflangs)
      );
      await assertTrue('meta description is populated from the page content', !!seo.description && seo.description.length > 0, seo.description);
      await assertTrue('structured data block is a schema.org TechArticle', seo.ldType === 'TechArticle', seo.ldType);
      await assertTrue('footer shows the document version by default', !!seo.footerVersion && seo.footerVersion.includes('1.0.0'), seo.footerVersion);

      const a11y = await page.evaluate(() => {
        const input = document.getElementById('search-input');
        return {
          role: input.getAttribute('role'),
          controls: input.getAttribute('aria-controls'),
          resultsRole: document.getElementById('search-results').getAttribute('role'),
        };
      });
      await assertTrue(
        'search input exposes a combobox role wired to the results listbox',
        a11y.role === 'combobox' && a11y.controls === 'search-results' && a11y.resultsRole === 'listbox',
        JSON.stringify(a11y)
      );

      await page.type('#search-input', 'RJ45');
      await page.waitForSelector('.search-result');
      const status = await page.evaluate(() => ({
        expanded: document.getElementById('search-input').getAttribute('aria-expanded'),
        status: document.getElementById('search-status').textContent,
      }));
      await assertTrue('search sets aria-expanded=true once results are showing', status.expanded === 'true', status.expanded);
      await assertTrue('search announces its result count for screen readers', /\d/.test(status.status), status.status);
    });

    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=navbar`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#site-nav-tree a');

      const before = await page.evaluate(() => document.querySelector('.nav-item [aria-haspopup]')?.getAttribute('aria-expanded'));
      await assertTrue('navbar dropdown starts collapsed (aria-expanded=false)', before === 'false', before);

      await page.hover('.nav-item');
      await page.waitForFunction(() => document.querySelector('.nav-item [aria-haspopup]')?.getAttribute('aria-expanded') === 'true');
      const after = await page.evaluate(() => document.querySelector('.nav-item [aria-haspopup]')?.getAttribute('aria-expanded'));
      await assertTrue('hovering a navbar item with children expands it (aria-expanded=true)', after === 'true', after);
    });

    // ------------------------------------------------------------------
    // 32. Fase M: breadcrumb trail + prev/next chapter pager, rendered
    //     around #page-content's own content by js/nav/page-trail.js.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#page-breadcrumb');

      const trail = await page.evaluate(() => ({
        crumbs: Array.from(document.querySelectorAll('.breadcrumb-list li')).map((li) => li.textContent.trim()),
        homeHref: document.querySelector('.breadcrumb-list a')?.getAttribute('href'),
        prevHref: document.querySelector('.page-pager-prev')?.getAttribute('href'),
        prevTitle: document.querySelector('.page-pager-prev .page-pager-title')?.textContent,
        nextHref: document.querySelector('.page-pager-next')?.getAttribute('href'),
        nextTitle: document.querySelector('.page-pager-next .page-pager-title')?.textContent,
      }));

      await assertTrue(
        'breadcrumb shows Home / chapter / current page',
        trail.crumbs.length === 3 && trail.crumbs[0] === 'Product name' && trail.crumbs[1] === 'Getting Started' && trail.crumbs[2] === 'Installation',
        JSON.stringify(trail.crumbs)
      );
      await assertTrue('breadcrumb home link points at the manual\'s first page', trail.homeHref?.endsWith('/pages/en/menu1/index.html'), trail.homeHref);
      await assertTrue(
        'pager links to the previous and next chapters in reading order',
        trail.prevTitle === 'Getting Started' && trail.prevHref?.endsWith('/pages/en/menu1/index.html') && trail.nextTitle === 'Initial Setup' && trail.nextHref?.endsWith('/pages/en/menu1/submenu2.html'),
        JSON.stringify(trail)
      );

      // Soft-navigating via the pager's "next" link must re-render a fresh
      // breadcrumb/pager for the new page, not leave the old one stale.
      await page.click('.page-pager-next');
      await page.waitForFunction(() => document.querySelector('.breadcrumb-current')?.textContent === 'Initial Setup');
      const afterNav = await page.evaluate(() => ({
        crumbCount: document.querySelectorAll('#page-breadcrumb').length,
        pagerCount: document.querySelectorAll('#page-pager').length,
        current: document.querySelector('.breadcrumb-current')?.textContent,
      }));
      await assertTrue(
        'breadcrumb/pager are replaced (not duplicated) after a soft navigation',
        afterNav.crumbCount === 1 && afterNav.pagerCount === 1 && afterNav.current === 'Initial Setup',
        JSON.stringify(afterNav)
      );
    });

    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=scroll`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('#site-nav-tree a');
      const present = await page.evaluate(() => !!document.getElementById('page-breadcrumb') || !!document.getElementById('page-pager'));
      await assertTrue('breadcrumb/pager are skipped entirely in scroll layout', !present, String(present));
    });

    // ------------------------------------------------------------------
    // 33. Fase M: live WCAG contrast warning in the generator's Colors
    //     fieldset (js/generator/theme/contrast.js).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.evaluateOnNewDocument(() => localStorage.setItem('generator-desktop-hint-dismissed', '1'));
      await page.goto(`${BASE}/generator/index.html`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => {
        const f = document.getElementById('preview-frame');
        return !!(f && f.contentDocument && f.contentDocument.getElementById('site-nav-tree'));
      });

      const initiallyHidden = await page.$eval('#contrast-warning', (el) => el.hidden);
      await assertTrue('contrast warning starts hidden with the default (passing) palette', initiallyHidden, String(initiallyHidden));

      await page.evaluate(() => {
        const input = document.getElementById('custom-color-text');
        input.value = '#f8f8f8';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(() => document.getElementById('contrast-warning').hidden === false);
      const warningText = await page.$eval('#contrast-warning', (el) => el.textContent);
      await assertTrue(
        'setting near-white text on a white background shows a low-contrast warning with the computed ratio',
        warningText.includes('Text on Background') && /\d\.\d:1/.test(warningText),
        warningText
      );

      await page.evaluate(() => {
        const input = document.getElementById('custom-color-text');
        input.value = '#1a202c';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForFunction(() => document.getElementById('contrast-warning').hidden === true);
      await assertTrue('warning clears once contrast is fixed', true);
    });

    // ------------------------------------------------------------------
    // 34. Fase M: the new "Caution" callout (between Warning and Note in
    //     severity) is real, used content — not just a CSS rule nobody
    //     triggers — and reads with a distinct color from Warning/Danger.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const colors = await page.evaluate(() => {
        const colorOf = (sel) => getComputedStyle(document.querySelector(sel)).borderLeftColor;
        return {
          caution: colorOf('.callout-caution'),
          warning: colorOf('.callout-warning'),
          danger: colorOf('.callout-danger'),
          cautionTitle: document.querySelector('.callout-caution .callout-title')?.textContent,
        };
      });
      await assertTrue('a real "Caution" callout is present in the demo content', colors.cautionTitle === 'Caution', colors.cautionTitle);
      await assertTrue(
        'Caution, Warning and Danger each render with their own distinct color',
        colors.caution !== colors.warning && colors.warning !== colors.danger && colors.caution !== colors.danger,
        JSON.stringify(colors)
      );
    });

    // ------------------------------------------------------------------
    // 35. Fase M: accessibility basics on a representative content page
    //     (landmarks, lang, alt text, working skip link) — item 13.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const a11y = await page.evaluate(() => ({
        lang: document.documentElement.getAttribute('lang'),
        hasHeader: !!document.querySelector('header#site-header'),
        hasNav: !!document.querySelector('nav#site-nav'),
        hasMain: !!document.querySelector('main#page-content'),
        hasFooter: !!document.querySelector('footer#site-footer'),
        imagesWithoutAlt: Array.from(document.querySelectorAll('#page-content img')).filter((img) => !img.getAttribute('alt')).length,
        skipLinkHref: document.querySelector('.skip-link')?.getAttribute('href'),
      }));
      await assertTrue('page declares its language via <html lang>', a11y.lang === 'en', a11y.lang);
      await assertTrue(
        'page exposes header/nav/main/footer landmarks',
        a11y.hasHeader && a11y.hasNav && a11y.hasMain && a11y.hasFooter,
        JSON.stringify(a11y)
      );
      await assertTrue('every image in the content has an alt attribute', a11y.imagesWithoutAlt === 0, String(a11y.imagesWithoutAlt));
      await assertTrue('skip link targets the main content region', a11y.skipLinkHref === '#page-content', a11y.skipLinkHref);
    });

    // ------------------------------------------------------------------
    // 36. Fase M: tablet breakpoint (761-1024px) narrows the fixed sidebar
    //     instead of leaving it unchanged from desktop width — item 14.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.site-nav');

      await page.setViewport({ width: 900, height: 800 });
      const tabletWidth = await page.$eval('.site-nav', (el) => getComputedStyle(el).width);
      await assertTrue('sidebar narrows at tablet width (900px)', tabletWidth === '200px', tabletWidth);

      await page.setViewport({ width: 1280, height: 800 });
      const desktopWidth = await page.$eval('.site-nav', (el) => getComputedStyle(el).width);
      await assertTrue('sidebar stays at its normal width above the tablet range', desktopWidth === '260px', desktopWidth);
    });

    // ------------------------------------------------------------------
    // 37. Fase M: downloadable attachment pattern is real content, not
    //     just an unused CSS rule — item 15.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const attachment = await page.evaluate(() => {
        const a = document.querySelector('.attachment-link');
        return a && { href: a.getAttribute('href'), hasDownload: a.hasAttribute('download'), text: a.textContent.trim() };
      });
      await assertTrue(
        'a real downloadable attachment link is present, pointing at a local file with the download attribute',
        !!attachment && attachment.hasDownload && attachment.href.endsWith('.svg'),
        JSON.stringify(attachment)
      );
    });

    // ------------------------------------------------------------------
    // 38. Fase M: Diátaxis content-type labels — page-level on a
    //     single-purpose page, section-level on a mixed one — item 16.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu1/submenu1.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const pageLevel = await page.$eval('#page-content .content-type-label', (el) => el.textContent);
      await assertTrue('a Tutorial-type page (Installation) is labeled at the page level', pageLevel === 'Tutorial', pageLevel);

      await page.goto(`${BASE}/pages/en/menu3/submenu1.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const sectionLevels = await page.$$eval('#page-content .content-type-label', (els) => els.map((el) => el.textContent));
      await assertTrue(
        'a mixed page (Advanced Topics) labels each section independently',
        JSON.stringify(sectionLevels) === JSON.stringify(['How-to', 'How-to', 'Reference', 'Tutorial']),
        JSON.stringify(sectionLevels)
      );
    });

    // ------------------------------------------------------------------
    // 39. Common manual patterns added on request: a numbered-parts figure
    //     legend, a symbols-meaning table, an A-Z index page, and a
    //     warranty section — all real content, not just unused CSS.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu2/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const legend = await page.$$eval('#page-content .manual-figure-legend li', (els) => els.map((el) => el.textContent.trim()));
      await assertTrue(
        'rear-panel figure has a 7-item numbered legend matching the numbers baked into the SVG',
        legend.length === 7 && legend[0].startsWith('1') && legend[6].startsWith('7'),
        JSON.stringify(legend)
      );
    });

    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu2/submenu1.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const symbols = await page.evaluate(() => {
        const heading = document.querySelector('#page-content #menu2-submenu1-topic4');
        const table = heading?.nextElementSibling?.nextElementSibling;
        return table && table.tagName === 'TABLE' ? Array.from(table.querySelectorAll('tbody tr')).length : 0;
      });
      await assertTrue('symbols-used table has one row per symbol (3)', symbols === 3, symbols);
    });

    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu3/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const warrantyText = await page.$eval('#page-content #menu3-topic5', (el) => el.textContent);
      await assertTrue('a Warranty section exists on the Support page', warrantyText === 'Warranty', warrantyText);
    });

    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/en/menu4/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      const index = await page.evaluate(() => {
        const groups = Array.from(document.querySelectorAll('#page-content .az-index-group'));
        const firstLink = document.querySelector('#page-content .az-index-group a');
        return {
          groupCount: groups.length,
          navHasIndex: !!Array.from(document.querySelectorAll('#site-nav-tree a')).find((a) => a.textContent.trim() === 'Index'),
          firstLinkText: firstLink?.textContent.trim(),
        };
      });
      await assertTrue('the Index page is reachable from the nav menu', index.navHasIndex, JSON.stringify(index));
      await assertTrue('the Index page groups terms alphabetically', index.groupCount >= 8, JSON.stringify(index));

      await page.click('#page-content .az-index-group a');
      await page.waitForFunction(() => !window.location.pathname.endsWith('/menu4/index.html'));
      const landedOn = new URL(page.url()).pathname;
      await assertTrue(
        'clicking an index entry soft-navigates away to the real target page',
        landedOn !== '/pages/en/menu4/index.html',
        landedOn
      );
    });

    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/print.html?brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Ready'), { timeout: 20000 });
      const backCover = await page.evaluate(() => {
        const el = document.querySelector('.back-cover');
        return el && { heading: el.querySelector('h1')?.textContent, rowCount: el.querySelectorAll('.quick-ref-list dt').length };
      });
      await assertTrue(
        'PDF ends with a quick-reference back cover',
        !!backCover && backCover.heading === 'Quick Reference' && backCover.rowCount === 4,
        JSON.stringify(backCover)
      );
      await assertTrue('no console errors building the PDF with the new back cover', errors.length === 0, errors.join('; '));
    });
  } finally {
    await browserBox.browser.close();
    serverProc.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
