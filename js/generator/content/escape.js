// Split out of blocks.js so sanitize.js can depend on it without a
// blocks.js <-> sanitize.js import cycle (blocks.js's renderers call into
// sanitize.js for the inline-rich-text fields).
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_RE = /[&<>"']/g;

export function escapeHtml(value) {
  return String(value ?? '').replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}
