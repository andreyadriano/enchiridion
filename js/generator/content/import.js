// Inverse of blocks.js: turns an existing page's `#page-content` markup
// (the demo pages under pages/**, or any previously-generated manual)
// into editable blocks.
//
// Every text field always comes back editable — never a dead read-only
// "raw" block just because the source had some inline formatting the
// editor doesn't expose a control for (<strong>, <code>, a stray <span>,
// ...). That formatting is simply dropped (flattenToPlainText / the
// sanitizer both discard any tag they don't understand, keeping the
// text) rather than blocking editing — see content/sanitize.js's
// docstring for why paragraph/list-item/callout-body text specifically
// keeps <a href> instead of also flattening it. "raw" is now reserved for
// elements that aren't just formatted text at all — an unrecognized
// top-level element (e.g. the A-Z index block), a callout missing its
// title/body shape, a figure with no <img>, a code block with no <code> —
// content genuinely outside what any block type can represent, still
// preserved read-only rather than silently dropped.
import { slugify, uniqueSlug } from './slug.js';
import { sanitizeInlineHtml } from './sanitize.js';

// Recursively collects text, turning <br> into a newline and discarding
// every other tag (keeping its text) — the plain-text counterpart to
// sanitizeInlineHtml's "keep only <a>, flatten everything else" rule.
function flattenToPlainText(el) {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.data;
    else if (node.nodeType === Node.ELEMENT_NODE) out += node.tagName === 'BR' ? '\n' : flattenToPlainText(node);
  }
  return out;
}

function textWithBreaks(el) {
  return flattenToPlainText(el).replace(/^\n+|\n+$/g, '');
}

// Keeps a plain <a href> as sanitized inline HTML instead of collapsing it
// to plain text — used for the fields allowed to carry a link.
function richTextWithBreaks(el) {
  return sanitizeInlineHtml(el.innerHTML).replace(/^\n+|\n+$/g, '');
}

function rawBlock(el) {
  return { type: 'raw', html: el.outerHTML };
}

function parseHeading(el) {
  return { type: 'heading', level: el.tagName === 'H1' ? 1 : 2, text: textWithBreaks(el), id: el.id || '' };
}

function parseParagraph(el) {
  return { type: 'paragraph', text: richTextWithBreaks(el) };
}

function parseContentTypeLabel(el) {
  return { type: 'contentTypeLabel', text: textWithBreaks(el) };
}

function parseItemList(el, type) {
  const items = Array.from(el.children);
  if (items.some((li) => li.tagName !== 'LI')) return rawBlock(el);
  return { type, items: items.map((li) => richTextWithBreaks(li)) };
}

function parseCallout(el) {
  const variantClass = Array.from(el.classList).find((c) => c.startsWith('callout-'));
  const variant = variantClass ? variantClass.replace('callout-', '') : 'note';
  const title = el.querySelector(':scope > .callout-title');
  const paragraphs = Array.from(el.querySelectorAll(':scope > p:not(.callout-title)'));
  if (!title || paragraphs.length !== 1) return rawBlock(el);
  return { type: 'callout', variant, title: textWithBreaks(title), text: richTextWithBreaks(paragraphs[0]) };
}

function parseTable(el) {
  const caption = el.querySelector(':scope > caption');
  const theadRow = el.querySelector(':scope > thead > tr');
  const bodyRows = Array.from(el.querySelectorAll(':scope > tbody > tr'));
  const headers = theadRow ? Array.from(theadRow.children).map((th) => th.textContent) : [];
  let rowHeaderColumn = false;
  const rows = [];
  for (const tr of bodyRows) {
    const cells = Array.from(tr.children);
    if (cells[0]?.tagName === 'TH') rowHeaderColumn = true;
    rows.push(cells.map((cell) => textWithBreaks(cell)));
  }
  return { type: 'table', caption: caption ? caption.textContent : '', headers, rowHeaderColumn, rows };
}

function parseFigure(el) {
  const img = el.querySelector(':scope > img');
  const figcaption = el.querySelector(':scope > figcaption');
  const legendList = el.querySelector(':scope > .manual-figure-legend');
  if (!img) return rawBlock(el);
  let legend = [];
  if (legendList) {
    const items = Array.from(legendList.children);
    // Structural check only (the numbered marker must exist) — the rest of
    // each item's text is flattened regardless of any inline formatting.
    if (!items.every((li) => li.querySelector(':scope > .legend-number'))) return rawBlock(el);
    legend = items.map((li) => li.textContent.replace(/^\s*\d+\s*/, '').trim());
  }
  return {
    type: 'figure',
    srcDataUrl: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
    caption: figcaption ? textWithBreaks(figcaption) : '',
    legend,
  };
}

function parseAttachment(el) {
  const label = el.querySelector(':scope > span:not(.attachment-link-icon):not(.attachment-link-meta)');
  const meta = el.querySelector(':scope > .attachment-link-meta');
  if (!label) return rawBlock(el);
  return {
    type: 'attachment',
    href: el.getAttribute('href') || '',
    label: textWithBreaks(label),
    meta: meta ? meta.textContent : '',
  };
}

function parseCode(el) {
  const code = el.querySelector(':scope > code');
  if (!code) return rawBlock(el);
  return { type: 'code', text: code.textContent };
}

function parseElement(el) {
  const tag = el.tagName;
  if (tag === 'H1' || tag === 'H2') return parseHeading(el);
  if (tag === 'P') return parseParagraph(el);
  if (tag === 'DIV' && el.classList.contains('content-type-label')) return parseContentTypeLabel(el);
  if (tag === 'UL' && el.classList.contains('contents-list')) return parseItemList(el, 'list');
  if (tag === 'OL' && el.classList.contains('steps')) return parseItemList(el, 'steps');
  if (tag === 'DIV' && el.classList.contains('callout')) return parseCallout(el);
  if (tag === 'TABLE' && el.classList.contains('spec-table')) return parseTable(el);
  if (tag === 'FIGURE' && el.classList.contains('manual-figure')) return parseFigure(el);
  if (tag === 'A' && el.classList.contains('attachment-link')) return parseAttachment(el);
  if (tag === 'PRE' && el.classList.contains('cli-block')) return parseCode(el);
  return rawBlock(el);
}

// Assigns stable, unique ids to any heading missing one (so it can be a
// deep-link/PDF-anchor target) — done as a pass over the whole page so ids
// generated for later headings can see earlier ones and avoid collisions.
function assignHeadingIds(blocks) {
  const used = new Set(blocks.filter((b) => b.type === 'heading' && b.id).map((b) => b.id));
  for (const block of blocks) {
    if (block.type === 'heading' && !block.id) {
      const id = uniqueSlug(slugify(block.text), used, 'section');
      block.id = id;
      used.add(id);
    }
  }
}

export function parsePageHtml(htmlString) {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const main = doc.querySelector('#page-content');
  if (!main) return { title: doc.title || '', blocks: [] };
  const blocks = Array.from(main.children).map(parseElement);
  assignHeadingIds(blocks);
  return { title: doc.title || '', blocks };
}
