// The one and only place inline "rich" text (a paragraph or list item that
// may contain a link) is allowed to carry markup at all. Every other piece
// of user text in this editor is plain text, fully escaped — see
// blocks.js's escapeHtml(). This sanitizer is what makes that narrow
// exception safe: it strips every element except <a>, strips every
// attribute except a safe href, and re-escapes all text content, so no
// matter what produced the input (a contenteditable field, a pasted
// clipboard, a saved localStorage blob someone hand-edited), the output
// can only ever be plain text plus safe hyperlinks — never a script, an
// event handler, or arbitrary markup.
import { escapeHtml } from './escape.js';

// Deny-list, not allow-list: manuals link to all sorts of legitimate
// things (relative pages, #anchors, http(s), mailto:, tel:) — only the
// schemes that can actually execute code are blocked.
const UNSAFE_HREF_RE = /^\s*(javascript|data|vbscript|file):/i;

function isSafeHref(href) {
  const trimmed = (href || '').trim();
  return Boolean(trimmed) && !UNSAFE_HREF_RE.test(trimmed);
}

function sanitizeNode(node, out) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push(escapeHtml(child.data));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (child.tagName === 'BR') {
      out.push('\n');
      continue;
    }
    if (child.tagName === 'A') {
      const href = child.getAttribute('href') || '';
      const safeHref = isSafeHref(href) ? href : '#';
      out.push(`<a href="${escapeHtml(safeHref)}">`);
      sanitizeNode(child, out);
      out.push('</a>');
      continue;
    }
    // Any other element (div/span/b/script/whatever a paste or a hand-
    // edited save might contain): keep its text, drop the tag itself.
    sanitizeNode(child, out);
  }
}

export function sanitizeInlineHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const out = [];
  sanitizeNode(doc.body.firstChild, out);
  return out.join('');
}
