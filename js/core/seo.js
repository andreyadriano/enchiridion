// Keeps a page's <head> metadata in sync with whatever is actually showing:
// one hreflang alternate per supported language, a meta description and a
// schema.org/TechArticle block derived from the current heading/paragraph.
// No network calls of its own — everything it needs is already on the page
// or in nav-config.json (already loaded by the caller).
import { resolvePath, langPath } from '../nav/nav-config.js';
import { LANGS } from '../theme/brands-config.js';

function upsertLink(rel, hreflang, href) {
  let link = document.querySelector(`link[rel="${rel}"][hreflang="${hreflang}"]`);
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', rel);
    link.setAttribute('hreflang', hreflang);
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function applyHreflangLinks(item) {
  if (!item) return;
  for (const lang of LANGS) {
    upsertLink('alternate', lang, resolvePath(langPath(item, lang)));
  }
}

function upsertMetaDescription(content) {
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function applyStructuredData({ headline, productName, lang }) {
  let script = document.getElementById('page-structured-data');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'page-structured-data';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: headline || productName,
    about: productName,
    inLanguage: lang,
  });
}

// `item` is the current nav-config entry (from findNavContext), used to
// resolve every language's URL for hreflang — pass null on pages without
// one (there are none today, but this keeps the function safe to call).
export function applySeoMeta({ item, contentRoot, translations, lang }) {
  applyHreflangLinks(item);

  const productName = (translations && translations['product.name']) || '';
  const heading = contentRoot ? (contentRoot.querySelector('h1')?.textContent || '').trim() : '';
  const firstParagraph = contentRoot ? contentRoot.querySelector('p') : null;
  const snippet = firstParagraph ? firstParagraph.textContent.trim().slice(0, 155) : '';

  upsertMetaDescription(snippet || [productName, heading].filter(Boolean).join(' — '));
  applyStructuredData({ headline: heading, productName, lang });
}
