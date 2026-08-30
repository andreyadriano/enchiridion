// Schema + deterministic HTML rendering for editable manual content.
//
// Every block type here maps 1:1 onto a markup pattern that already exists
// and is already styled in css/base.css (mirrored in css/print.css /
// print-fallback.css) — see themes/theme-schema.md and the demo pages under
// pages/**. This file never invents new CSS classes; it only serializes
// user-entered field values into that existing markup, escaping every piece
// of free text so a stray "<" or "&" typed by the user can't break the page
// or inject markup into a manual they'll distribute to other people.
import { escapeHtml } from './escape.js';
import { sanitizeInlineHtml } from './sanitize.js';

export { escapeHtml };

// Turns free-typed multi-line text into safe inline HTML: escape first,
// then treat newlines as <br> (no markdown/HTML interpretation — the user
// never authors markup directly, only plain text per field). Used for
// fields that are never allowed to contain a link (headings, table cells,
// captions, code) — see textToInlineRichHtml() for the fields that are.
export function textToInlineHtml(value) {
  return escapeHtml(value).split('\n').join('<br>');
}

// For paragraph/callout/list-item text: these fields may contain a
// sanitized <a href> (see content/sanitize.js and the editor's inline
// "Insert link" control) alongside plain text — this is the ONLY place in
// the whole editor a field is allowed to carry markup instead of being
// fully escaped, and it's still run through the sanitizer here (not just
// trusted from the editor UI), so a hand-edited localStorage save or a
// future caller can't slip unsafe markup through.
export function textToInlineRichHtml(value) {
  return sanitizeInlineHtml(value).split('\n').join('<br>');
}

export const CALLOUT_VARIANTS = ['note', 'tip', 'caution', 'warning', 'danger'];

function normalizeCalloutVariant(variant) {
  return CALLOUT_VARIANTS.includes(variant) ? variant : 'note';
}

function renderHeading(block) {
  const level = block.level === 1 ? 1 : 2;
  const tag = `h${level}`;
  const idAttr = block.id ? ` id="${escapeHtml(block.id)}"` : '';
  return `<${tag}${idAttr}>${escapeHtml(block.text)}</${tag}>`;
}

function renderParagraph(block) {
  return `<p>${textToInlineRichHtml(block.text)}</p>`;
}

function renderContentTypeLabel(block) {
  return `<div class="content-type-label">${escapeHtml(block.text)}</div>`;
}

function renderList(block) {
  const items = (block.items || []).map((item) => `  <li>${textToInlineRichHtml(item)}</li>`).join('\n');
  return `<ul class="contents-list">\n${items}\n</ul>`;
}

function renderSteps(block) {
  const items = (block.items || []).map((item) => `  <li>${textToInlineRichHtml(item)}</li>`).join('\n');
  return `<ol class="steps">\n${items}\n</ol>`;
}

function renderCallout(block) {
  const variant = normalizeCalloutVariant(block.variant);
  return `<div class="callout callout-${variant}">\n  <p class="callout-title">${escapeHtml(block.title)}</p>\n  <p>${textToInlineRichHtml(block.text)}</p>\n</div>`;
}

// Covers both .spec-table sub-patterns seen across pages/**: a row-label
// column (rowHeaderColumn, no <thead>) and/or a header row (headers[],
// rendered as <thead>). Either, both, or neither can be set.
function renderTable(block) {
  const caption = block.caption ? `  <caption>${escapeHtml(block.caption)}</caption>\n` : '';
  const headers = block.headers || [];
  const thead = headers.length
    ? `  <thead>\n    <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>\n  </thead>\n`
    : '';
  const rows = block.rows || [];
  const bodyRows = rows.map((row) => {
    const cells = row.map((cell, i) => {
      const tag = block.rowHeaderColumn && i === 0 ? 'th' : 'td';
      return `<${tag}>${textToInlineHtml(cell)}</${tag}>`;
    }).join('');
    return `    <tr>${cells}</tr>`;
  }).join('\n');
  return `<table class="spec-table">\n${caption}${thead}  <tbody>\n${bodyRows}\n  </tbody>\n</table>`;
}

// `ctx.resolveImageSrc` lets the same renderer serve two very different
// contexts with the same block data: the live preview (data URL, straight
// from the file the user just picked) and the zip build (a real relative
// path, once build-package.js has written the decoded image into the zip —
// see the plan's "Imagens" section for why data URLs can't ship as-is).
function renderFigure(block, ctx) {
  const src = ctx?.resolveImageSrc ? ctx.resolveImageSrc(block) : (block.srcDataUrl || '');
  const legendItems = block.legend || [];
  const legend = legendItems.length
    ? `\n  <ol class="manual-figure-legend">\n${legendItems.map((item, i) => `    <li><span class="legend-number">${i + 1}</span> ${textToInlineHtml(item)}</li>`).join('\n')}\n  </ol>`
    : '';
  return `<figure class="manual-figure">\n  <img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt || '')}">\n  <figcaption>${textToInlineHtml(block.caption || '')}</figcaption>${legend}\n</figure>`;
}

function renderAttachment(block, ctx) {
  const href = ctx?.resolveAttachmentHref ? ctx.resolveAttachmentHref(block) : (block.href || '#');
  return `<a class="attachment-link" href="${escapeHtml(href)}" download>\n  <span class="attachment-link-icon">↓</span>\n  <span>${textToInlineHtml(block.label)}</span>\n  <span class="attachment-link-meta">${escapeHtml(block.meta || '')}</span>\n</a>`;
}

function renderCode(block) {
  // <pre> preserves whitespace/newlines natively — no <br> conversion here.
  return `<pre class="cli-block"><code>${escapeHtml(block.text)}</code></pre>`;
}

// User-authored blocks always come from one of the renderers above (or the
// "raw" escape hatch from import.js for markup the parser didn't recognize
// — see import.js). "raw" is trusted verbatim because it only ever
// originates from re-serializing this project's own existing page markup,
// never from a free-text field.
function renderRaw(block) {
  return block.html || '';
}

const RENDERERS = {
  heading: renderHeading,
  paragraph: renderParagraph,
  contentTypeLabel: renderContentTypeLabel,
  list: renderList,
  steps: renderSteps,
  callout: renderCallout,
  table: renderTable,
  figure: renderFigure,
  attachment: renderAttachment,
  code: renderCode,
  raw: renderRaw,
};

export function renderBlock(block, ctx) {
  const renderer = RENDERERS[block?.type];
  if (!renderer) throw new Error(`Unknown block type: ${block?.type}`);
  return renderer(block, ctx);
}

export function renderPage(blocks, ctx) {
  return (blocks || []).map((block) => renderBlock(block, ctx)).join('\n\n');
}

// Palette metadata for the editor UI (Phase 4) — one entry per addable
// block type, in the order they should appear in the "+ Add block" menu.
export const BLOCK_TYPES = [
  { type: 'heading', labelKey: 'editor.block.heading' },
  { type: 'paragraph', labelKey: 'editor.block.paragraph' },
  { type: 'list', labelKey: 'editor.block.list' },
  { type: 'steps', labelKey: 'editor.block.steps' },
  { type: 'callout', labelKey: 'editor.block.callout' },
  { type: 'table', labelKey: 'editor.block.table' },
  { type: 'figure', labelKey: 'editor.block.figure' },
  { type: 'code', labelKey: 'editor.block.code' },
  { type: 'attachment', labelKey: 'editor.block.attachment' },
];

const DEFAULT_FACTORIES = {
  heading: () => ({ type: 'heading', level: 2, text: '', id: '' }),
  paragraph: () => ({ type: 'paragraph', text: '' }),
  contentTypeLabel: () => ({ type: 'contentTypeLabel', text: '' }),
  list: () => ({ type: 'list', items: [''] }),
  steps: () => ({ type: 'steps', items: [''] }),
  callout: () => ({ type: 'callout', variant: 'note', title: '', text: '' }),
  table: () => ({ type: 'table', caption: '', headers: [], rowHeaderColumn: false, rows: [['', '']] }),
  figure: () => ({ type: 'figure', srcDataUrl: '', alt: '', caption: '', legend: [] }),
  attachment: () => ({ type: 'attachment', href: '', label: '', meta: '' }),
  code: () => ({ type: 'code', text: '' }),
};

export function createDefaultBlock(type) {
  const factory = DEFAULT_FACTORIES[type];
  if (!factory) throw new Error(`Unknown block type: ${type}`);
  return factory();
}

// Rows with a different cell count than the header row/first row render a
// ragged <table> — flag it so the editor and the pre-download checklist
// (Phase 7) can catch it before it ships.
export function validateTable(block) {
  const errors = [];
  const rows = block.rows || [];
  const width = block.headers?.length || rows[0]?.length || 0;
  rows.forEach((row, i) => {
    if (row.length !== width) errors.push(`Row ${i + 1} has ${row.length} cells, expected ${width}`);
  });
  return errors;
}
