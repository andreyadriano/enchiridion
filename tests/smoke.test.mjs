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

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        let urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = path.join(ROOT, urlPath);
        if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
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
    server.listen(PORT, () => resolve(server));
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
      '/pages/menu1/index.html',
      '/pages/menu1/submenu1.html',
      '/pages/menu1/submenu2.html',
      '/pages/menu2/index.html',
      '/pages/menu2/submenu1.html',
      '/pages/menu3/index.html',
      '/pages/menu3/submenu1.html',
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
        await page.goto(`${BASE}/pages/menu1/index.html?layout=${layout}&brand=intelbras&lang=pt`, { waitUntil: 'networkidle0' });
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
          await assertTrue(`brand preserved after clicking ${label} (query-less link) [${layout}]`, themeHref.includes('intelbras'), themeHref);
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
        await page.goto(`${BASE}/pages/menu1/index.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#site-nav-tree a');
        await page.evaluate(() => { window.__marker = true; });

        await page.click('#site-nav-tree a[data-i18n="nav.menu2"]');
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Specifications');
        const markerAfterClick = await page.evaluate(() => window.__marker === true);
        await assertTrue(`soft nav survives (no reload) clicking a menu link [${layout}]`, markerAfterClick, markerAfterClick);
        const urlAfterClick = page.url();
        await assertTrue(`soft nav updates the URL to the clicked page [${layout}]`, urlAfterClick.endsWith('/pages/menu2/index.html'), urlAfterClick);
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
        await assertTrue(`Back button restores the previous URL [${layout}]`, urlAfterBack.includes('/pages/menu1/index.html'), urlAfterBack);

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
        await page.goto(`${BASE}/pages/menu1/index.html?layout=${layout}&brand=intelbras&lang=en`, { waitUntil: 'networkidle0' });
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
          requestUrls.includes(`${BASE}/pages/menu2/index.html`),
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
        await page.goto(`${BASE}/pages/menu1/index.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
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
      await page.goto(`${BASE}/pages/menu1/submenu1.html?layout=scroll&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.chapter-section');

      const sectionHeadingIds = await page.$$eval('.chapter-section > h2[id]', (els) => els.map((e) => e.id));
      await assertTrue(
        'all 3 chapters composed on one page, even though we deep-linked into one submenu',
        JSON.stringify(sectionHeadingIds) === JSON.stringify(['menu1', 'menu2', 'menu3']),
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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=sidebar`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = true; });

      // Scoped to #page-content specifically, not just any .chapter-section
      // in the document: starting in 'sidebar' also builds a hidden
      // #print-manual fallback (test 9) with its own 3 .chapter-section
      // copies in the background, which would otherwise coincidentally
      // satisfy a document-wide count === 3 check before the real
      // composition into #page-content even starts.
      //
      // Composing all 3 chapters takes several sequential fetches, so wait
      // for the final count rather than just the first section to appear
      // (waitForSelector would resolve as soon as chapter 1 lands, well
      // before chapters 2-3 finish fetching).
      await page.select('#layout-selector', 'scroll');
      await page.waitForFunction(() => document.querySelectorAll('#page-content .chapter-section').length === 3, { timeout: 10000 });
      let count = await page.$$eval('#page-content .chapter-section', (els) => els.length);
      await assertTrue('scroll layout composes all 3 chapters once', count === 3, `count=${count}`);

      await page.select('#layout-selector', 'navbar');
      await new Promise((r) => setTimeout(r, 300));
      await page.select('#layout-selector', 'scroll');
      await page.waitForFunction(() => document.querySelectorAll('#page-content .chapter-section').length === 3, { timeout: 10000 });
      count = await page.$$eval('#page-content .chapter-section', (els) => els.length);
      await assertTrue('toggling back to scroll does not duplicate sections', count === 3, `count=${count}`);

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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=navbar&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = true; });

      await page.select('#brand-selector', 'intelbras');
      await page.waitForFunction(() => document.getElementById('theme-css').href.includes('intelbras'));
      const layoutAfterBrand = await bodyLayoutClass(page);
      await assertTrue(
        "brand switch does NOT change the visitor's current layout, even though intelbras's own default is 'sidebar'",
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
        await page.goto(`${BASE}/pages/menu1/index.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.evaluate(() => { window.__marker = true; });
        await page.select('#lang-selector', 'pt');
        await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Primeiros Passos');
        await assertTrue(`language switch updates the URL to the translated file [${layout}]`, page.url().endsWith('/pages/menu1/index.pt.html'), page.url());
        const heading = await page.$eval('h1', (el) => el.textContent);
        await assertTrue(`translated file shows its own real Portuguese content [${layout}]`, heading === 'Primeiros Passos', heading);
        const markerSurvived = await page.evaluate(() => window.__marker === true);
        await assertTrue(`language switch never reloads the page [${layout}]`, markerSurvived);

        const menu2Href = await page.$eval('#site-nav-tree a[data-i18n="nav.menu2"]', (a) => a.getAttribute('href'));
        await assertTrue(`nav link to another translated page also points at its .pt.html file [${layout}]`, menu2Href.endsWith('/pages/menu2/index.pt.html'), menu2Href);
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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=scroll&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => { window.__marker = true; });
      await page.select('#lang-selector', 'pt');
      await page.waitForFunction(() => document.querySelector('#page-content')?.textContent.includes('Primeiros Passos'));
      const markerSurvived = await page.evaluate(() => window.__marker === true);
      await assertTrue('language switch in scroll layout never reloads the page', markerSurvived);
      const allChapters = await page.$$eval('#page-content .chapter-section', (els) => els.length);
      await assertTrue('language switch in scroll layout keeps all 3 chapters composed', allChapters === 3, allChapters);
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
      await page.goto(`${BASE}/pages/menu1/index.html`, { waitUntil: 'networkidle0' });
      const result = await page.evaluate(async () => {
        const { langPath } = await import('/js/nav-config.js');
        return {
          untranslated: langPath({ path: 'pages/menuX/index.html' }, 'pt'),
          translated: langPath({ path: 'pages/menu1/index.html', langs: ['pt'] }, 'pt'),
        };
      });
      await assertTrue(
        'langPath falls back to the default file when a translation is not declared',
        result.untranslated === 'pages/menuX/index.html',
        result.untranslated
      );
      await assertTrue(
        'langPath resolves to the translated file when declared',
        result.translated === 'pages/menu1/index.pt.html',
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
      await page.goto(`${BASE}/pages/menu2/index.html?layout=sidebar&brand=generic&lang=pt`, { waitUntil: 'networkidle0' });
      const homeHref = await page.$eval('[data-home-link]', (a) => a.getAttribute('href'));
      await assertTrue(
        'home link points at the current language\'s own index page',
        homeHref.endsWith('/pages/menu1/index.pt.html'),
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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=sidebar&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      const optionLabels = await page.$$eval('#lang-selector option', (opts) => opts.map((o) => o.textContent));
      await assertTrue(
        'language dropdown shows native language names, not codes',
        JSON.stringify(optionLabels) === JSON.stringify(['English', 'Português', 'Español']),
        JSON.stringify(optionLabels)
      );

      await page.select('#lang-selector', 'es');
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Primeros Pasos');
      await assertTrue('language switch also reaches the Spanish translated file', page.url().endsWith('/pages/menu1/index.es.html'), page.url());
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
      await page.goto(`${BASE}/pages/menu2/submenu1.html?layout=sidebar#menu2-submenu1-topic2`, { waitUntil: 'networkidle0' });
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
      await page.goto(`${BASE}/pages/menu1/index.html?brand=marca-b&lang=pt`, { waitUntil: 'networkidle0' });
      const pdfHref = await page.$eval('[data-pdf-link]', (a) => a.getAttribute('href'));
      await assertTrue('footer PDF link exists and points at print.html with no query string', pdfHref.endsWith('/print.html'), pdfHref);

      await page.goto(pdfHref, { waitUntil: 'networkidle0' }); // pdfHref is already absolute (resolvePath())
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Ready'), { timeout: 20000 });
      const brandSelectValue = await page.$eval('#brand-selector', (s) => s.value);
      const cover = await page.evaluate(() => document.querySelector('.cover .product-name')?.textContent);
      await assertTrue('print.html defaults to the brand you were browsing in (via localStorage)', brandSelectValue === 'marca-b', brandSelectValue);
      await assertTrue('PDF cover shows the Portuguese product name (lang carried over too)', cover === 'Nome do produto', cover);
      await assertTrue('no console errors following the footer PDF link', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 8. PDF export covers the ENTIRE manual (all 3 menus), builds without
    //    errors, and produces a resolved table of contents.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/print.html?brand=intelbras&lang=pt`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.getElementById('status').textContent.includes('Ready'), { timeout: 20000 });
      const chapterIds = await page.$$eval('#source .chapter', (els) => els.map((e) => e.id));
      await assertTrue(
        'PDF includes all 7 pages across all 3 menus, not just one',
        JSON.stringify(chapterIds) ===
          JSON.stringify([
            'chapter-menu1', 'chapter-menu1-submenu1', 'chapter-menu1-submenu2',
            'chapter-menu2', 'chapter-menu2-submenu1',
            'chapter-menu3', 'chapter-menu3-submenu1',
          ]),
        JSON.stringify(chapterIds)
      );
      const pageCount = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
      const cover = await page.evaluate(() => document.querySelector('.cover .product-name')?.textContent);
      await assertTrue('PDF pagination produces pages', pageCount > 0, `pages=${pageCount}`);
      await assertTrue('PDF cover shows translated product name', cover === 'Nome do produto', cover);
      const backLinkHref = await page.$eval('#back-to-manual', (a) => a.getAttribute('href'));
      await assertTrue('print.html toolbar has a link back to the manual home', backLinkHref === 'index.html', backLinkHref);

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
      await enPage.goto(`${BASE}/print.html?brand=intelbras&lang=en`, { waitUntil: 'networkidle0' });
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
        await page.goto(`${BASE}/pages/menu1/submenu1.html?layout=${layout}&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => document.querySelector('#print-manual[data-ready="true"]'), { timeout: 15000 });

        const structure = await page.evaluate(() => {
          const chapterIds = Array.from(document.querySelectorAll('#print-manual .chapter-section > h2[id]')).map((e) => e.id);
          const subIds = Array.from(document.querySelectorAll('#print-manual .chapter-subsection > h3[id]')).map((e) => e.id);
          return { chapterIds, subIds };
        });
        await assertTrue(
          `[${layout}] print fallback composes all 3 chapters`,
          JSON.stringify(structure.chapterIds) === JSON.stringify(['menu1', 'menu2', 'menu3']),
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
      await page.goto(`${BASE}/pages/menu1/submenu1.html?layout=scroll&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelectorAll('.chapter-section').length === 3);
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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=sidebar&brand=intelbras&lang=pt`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('#print-manual[data-ready="true"]'));

      const header1 = await page.evaluate(() => ({
        logoSrc: document.querySelector('.print-manual-logo')?.getAttribute('src'),
        title: document.querySelector('.print-manual-title')?.textContent,
      }));
      await assertTrue('print fallback shows the brand logo', header1.logoSrc?.includes('intelbras.svg'), header1.logoSrc);
      await assertTrue('print fallback shows the product name', header1.title === 'Nome do produto', header1.title);

      // Switch brand — the fallback's logo should update without a full
      // rebuild (js/print-fallback.js tags it data-brand-logo so the
      // existing applyLogo() updater covers it).
      await page.select('#brand-selector', 'marca-b');
      await page.waitForFunction(() => document.querySelector('.print-manual-logo')?.getAttribute('src')?.includes('marca-b.svg'));
      const logoAfterSwitch = await page.$eval('.print-manual-logo', (img) => img.getAttribute('src'));
      await assertTrue('print fallback logo updates after a brand switch', logoAfterSwitch.includes('marca-b.svg'), logoAfterSwitch);

      await assertTrue('no console errors', errors.length === 0, errors.join('; '));
    });

    // ------------------------------------------------------------------
    // 11. The native print header/footer shows document.title. Printing a
    //     specific submenu page must not brand the (now multi-menu)
    //     printed document with just that submenu's own title.
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      await page.goto(`${BASE}/pages/menu1/submenu1.html?layout=sidebar&brand=generic&lang=en`, { waitUntil: 'networkidle0' });
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
      await page.goto(`${BASE}/pages/menu1/index.html?brand=intelbras&lang=en`, { waitUntil: 'networkidle0' });
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
      ['with ?autoprint=1', '?autoprint=1&brand=intelbras&lang=en', true],
      ['without autoprint (plain footer link)', '?brand=intelbras&lang=en', false],
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
    // 13. Granular per-component theme colors actually apply. theme-marca-b
    //     sets --color-sidebar-bg / --color-nav-link-bg-active /
    //     --color-nav-link-text-active as a live example — verify the
    //     computed styles pick them up instead of silently falling back to
    //     the base palette (which would mean the variables aren't wired
    //     into base.css/layout-*.css correctly).
    // ------------------------------------------------------------------
    await withPage(browserBox, async (page) => {
      const errors = collectErrors(page);
      await page.goto(`${BASE}/pages/menu1/index.html?layout=sidebar&brand=marca-b&lang=en`, { waitUntil: 'networkidle0' });
      const sidebarBg = await page.$eval('.site-nav', (el) => getComputedStyle(el).backgroundColor);
      await assertTrue('theme-marca-b sidebar background uses --color-sidebar-bg', sidebarBg === 'rgb(250, 247, 252)', sidebarBg);

      const activeLinkStyle = await page.$eval('.nav-link.is-active', (el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color };
      });
      await assertTrue(
        'theme-marca-b active nav link uses --color-nav-link-bg-active/--color-nav-link-text-active',
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
      await page.goto(`${BASE}/pages/menu2/index.html?layout=hybrid&brand=intelbras&lang=en`, { waitUntil: 'networkidle0' });

      const topLabels = await page.$$eval('#site-nav .nav-link', (els) => els.map((e) => e.textContent.trim()));
      await assertTrue(
        'hybrid topbar shows only the 3 top-level menus, no submenus',
        JSON.stringify(topLabels) === JSON.stringify(['Getting Started', 'Specifications', 'Support']),
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
        afterSidebarClick.url.endsWith('/pages/menu2/submenu1.html'),
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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=sidebar&brand=intelbras&lang=en`, { waitUntil: 'networkidle0' });
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
      await assertTrue('search result links straight to that section (page + anchor)', result.href?.endsWith('/pages/menu2/index.html#menu2-topic3'), result.href);

      await page.click('.search-result');
      await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Specifications');
      const afterClick = await page.evaluate(() => ({
        marker: window.__marker,
        url: window.location.href,
        resultsHidden: document.getElementById('search-results').hidden,
      }));
      await assertTrue('clicking a search result does not reload the page', afterClick.marker === 'still-here');
      await assertTrue('clicking a search result navigates to the matched page + anchor', afterClick.url.endsWith('/pages/menu2/index.html#menu2-topic3'), afterClick.url);
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
      await page.goto(`${BASE}/pages/menu1/index.html?layout=scroll&brand=intelbras&lang=en`, { waitUntil: 'networkidle0' });
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
