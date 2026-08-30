// Orchestrates generator/editor.html — step 2 of the generator flow
// (structure + block editor on the left, live preview on the right). Reuses
// the exact same iframe-preview mechanism as ui.js/theme/preview.js (step 1)
// and the theme this manual already has, read from ui.js's own save key.
import { DEFAULT_LAYOUT } from '../theme/brands-config.js';
import {
  setPreviewSrc,
  applyCustomTheme,
  applyCustomLogo,
  applyCustomFavicon,
  applyProductName,
  applyCustomFontFaces,
  hidePreviewChromeSelectors,
  waitForPreviewReady,
} from './theme/preview.js';
import { buildManualZip } from './package/build-package.js';
import { applyGeneratorTranslations } from './i18n.js';
import { dataUrlToFile, readFileAsDataUrl, slugify } from '../utils/file-utils.js';
import { CUSTOM_FONT_VALUE, CUSTOM_HEADING_FAMILY, CUSTOM_BODY_FAMILY } from './theme/font-fields.js';
import { loadNav, flattenNav } from '../nav/nav-config.js';
import { rootUrl } from './paths.js';
import { createEditorState } from './content/state.js';
import { addMenu, addSubmenu, renameItem, removeItem, findItem, displayLabel, toNavConfig, collectLabels } from './content/structure.js';
import { renderSiteTree } from '../nav/nav-render.js';
import { renderPage, createDefaultBlock, BLOCK_TYPES, CALLOUT_VARIANTS } from './content/blocks.js';
import { validateManual } from './content/validate.js';
import { sanitizeInlineHtml } from './content/sanitize.js';

// No site-credit footer here (unlike generator/index.html) — this page is
// tight on vertical space already, and the credit already shows up one
// step earlier.
const THEME_SAVE_KEY = 'generator-saved-manual';
const GENERATOR_LANG_KEY = 'generator-lang';

const iframe = document.getElementById('preview-frame');
const structureTreeEl = document.getElementById('structure-tree');
const newMenuInput = document.getElementById('new-menu-input');
const addMenuButton = document.getElementById('add-menu-button');
const pageTitleEl = document.getElementById('editor-page-title');
const langTabsEl = document.getElementById('editor-lang-tabs');
const langHintEl = document.getElementById('editor-lang-hint');
const blockListEl = document.getElementById('block-list');
const insertToolbarEl = document.getElementById('insert-toolbar');
const downloadButton = document.getElementById('download-button');
const statusEl = document.getElementById('status');
const saveStatusEl = document.getElementById('save-status');
const resetContentButton = document.getElementById('reset-content-button');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');

let currentDict = {};
let manualDict = {}; // the manual's own i18n/<lang>.json — resolves built-in labelKeys for tree display
const editor = createEditorState();
let currentItemId = null;
let currentLang = 'en';
let currentPage = null;
let manualLangs = ['en'];
let layout = DEFAULT_LAYOUT;

async function loadManualDict(lang) {
  const res = await fetch(rootUrl(`i18n/${lang}.json`));
  manualDict = res.ok ? await res.json() : {};
}

// ---------------------------------------------------------------------
// Theme state (read-only here — set on generator/index.html, step 1)
// ---------------------------------------------------------------------
async function loadThemeState() {
  const raw = localStorage.getItem(THEME_SAVE_KEY);
  const defaults = {
    productName: 'My Product',
    colors: { primary: '#2b6cb0', secondary: '#edf2f7', text: '#1a202c', bg: '#ffffff' },
    componentColors: {},
    borderRadius: '4px',
    fontHeading: 'system-ui, sans-serif',
    fontBody: 'system-ui, sans-serif',
    layout: DEFAULT_LAYOUT,
    langs: ['en'],
    logoFile: null,
    faviconFile: null,
    logoDataUrl: null,
    faviconDataUrl: null,
    customFonts: { heading: null, body: null },
  };
  if (!raw) return defaults;
  try {
    const data = JSON.parse(raw);
    const fontValue = (value, uploaded, family) => (value === CUSTOM_FONT_VALUE ? (uploaded ? `'${family}', sans-serif` : 'system-ui, sans-serif') : (value || 'system-ui, sans-serif'));
    const customFonts = { heading: null, body: null };
    if (data.customFontHeading) {
      const file = await dataUrlToFile(data.customFontHeading.dataUrl, data.customFontHeading.fileName, data.customFontHeading.mimeType);
      customFonts.heading = { file, dataUrl: data.customFontHeading.dataUrl, family: CUSTOM_HEADING_FAMILY };
    }
    if (data.customFontBody) {
      const file = await dataUrlToFile(data.customFontBody.dataUrl, data.customFontBody.fileName, data.customFontBody.mimeType);
      customFonts.body = { file, dataUrl: data.customFontBody.dataUrl, family: CUSTOM_BODY_FAMILY };
    }
    return {
      productName: data.productName || defaults.productName,
      colors: { ...defaults.colors, ...(data.colors || {}) },
      componentColors: data.componentColors || {},
      borderRadius: data.borderRadius || defaults.borderRadius,
      fontHeading: fontValue(data.fontHeadingValue, customFonts.heading, CUSTOM_HEADING_FAMILY),
      fontBody: fontValue(data.fontBodyValue, customFonts.body, CUSTOM_BODY_FAMILY),
      layout: data.layout || defaults.layout,
      langs: ['en', ...(data.langPt ? ['pt'] : []), ...(data.langEs ? ['es'] : [])],
      logoFile: data.logo ? await dataUrlToFile(data.logo.dataUrl, data.logo.fileName, data.logo.mimeType) : null,
      faviconFile: data.favicon ? await dataUrlToFile(data.favicon.dataUrl, data.favicon.fileName, data.favicon.mimeType) : null,
      logoDataUrl: data.logo ? data.logo.dataUrl : null,
      faviconDataUrl: data.favicon ? data.favicon.dataUrl : null,
      customFonts,
    };
  } catch (err) {
    console.error('Could not read saved theme state', err);
    return defaults;
  }
}

// ---------------------------------------------------------------------
// Structure tree
// ---------------------------------------------------------------------
function iconButton(label, title, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'editor-icon-button';
  btn.textContent = label;
  btn.title = title;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function renderStructureTree() {
  structureTreeEl.innerHTML = '';
  structureTreeEl.appendChild(renderTreeList(editor.state.structure, false));
}

function renderTreeList(items, isSubLevel) {
  const ul = document.createElement('ul');
  ul.className = 'editor-tree-list';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'editor-tree-item';

    const row = document.createElement('div');
    row.className = 'editor-tree-row' + (item.id === currentItemId ? ' is-selected' : '');
    // The <li> (not this inner row div) is what actually needs to move
    // among its <ul> siblings — the handle just visually lives in the row.
    row.appendChild(makeDragHandle(li, () => index, (from, to) => {
      if (from === to) return;
      const [moved] = items.splice(from, 1);
      items.splice(to > from ? to - 1 : to, 0, moved);
      renderStructureTree();
      schedulePreviewUpdate();
      scheduleAutosave();
    }));
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'editor-tree-label';
    label.textContent = displayLabel(item, currentLang, manualDict);
    label.addEventListener('click', () => selectItem(item.id));
    row.appendChild(label);

    if (item.custom) {
      row.appendChild(iconButton('✎', currentDict['editor.tree.rename'] || 'Rename', () => {
        const text = window.prompt(currentDict['editor.tree.renamePrompt'] || 'New name:', displayLabel(item, currentLang, manualDict));
        if (text) { renameItem(editor.state.structure, item.id, currentLang, text); renderStructureTree(); renderPageHeader(); schedulePreviewUpdate(); scheduleAutosave(); }
      }));
    }
    row.appendChild(iconButton('×', currentDict['editor.tree.remove'] || 'Remove', () => {
      if (!window.confirm(currentDict['editor.tree.removeConfirm'] || 'Remove this item and its content?')) return;
      removeItem(editor.state.structure, item.id);
      if (currentItemId === item.id) { currentItemId = null; currentPage = null; }
      renderStructureTree();
      renderPageHeader();
      renderBlockList();
      schedulePreviewUpdate();
      scheduleAutosave();
    }));
    li.appendChild(row);

    if (!isSubLevel) {
      const addSub = document.createElement('button');
      addSub.type = 'button';
      addSub.className = 'editor-add-submenu';
      addSub.textContent = currentDict['editor.structure.addSubmenu'] || '+ Submenu';
      addSub.addEventListener('click', () => {
        const text = window.prompt(currentDict['editor.structure.newSubmenuPrompt'] || 'New submenu name:');
        if (!text) return;
        const sub = addSubmenu(editor.state.structure, item.id, { text, lang: currentLang });
        renderStructureTree();
        scheduleAutosave();
        selectItem(sub.id);
      });
      li.appendChild(addSub);
    }

    if (item.children?.length) li.appendChild(renderTreeList(item.children, true));
    ul.appendChild(li);
  });
  return ul;
}

addMenuButton.addEventListener('click', () => {
  const text = newMenuInput.value.trim();
  if (!text) return;
  const item = addMenu(editor.state.structure, { text, lang: currentLang });
  newMenuInput.value = '';
  renderStructureTree();
  scheduleAutosave();
  selectItem(item.id);
});

// ---------------------------------------------------------------------
// Page selection + language tabs
// ---------------------------------------------------------------------
async function selectItem(itemId) {
  currentItemId = itemId;
  currentPage = await editor.getPage(itemId, currentLang);
  renderStructureTree();
  renderPageHeader();
  renderLangTabs();
  renderBlockList();
  schedulePreviewUpdate();
}

function renderPageHeader() {
  if (!currentItemId) {
    pageTitleEl.textContent = currentDict['editor.page.noSelection'] || 'Select a page on the left';
    return;
  }
  const found = findItem(editor.state.structure, currentItemId);
  pageTitleEl.textContent = found ? displayLabel(found.item, currentLang, manualDict) : '';
}

function renderLangTabs() {
  langTabsEl.innerHTML = '';
  for (const lang of manualLangs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-lang-tab' + (lang === currentLang ? ' is-active' : '');
    btn.textContent = lang.toUpperCase();
    btn.addEventListener('click', () => switchLang(lang));
    langTabsEl.appendChild(btn);
  }
}

async function switchLang(lang) {
  currentLang = lang;
  await loadManualDict(lang);
  if (currentItemId) currentPage = await editor.getPage(currentItemId, lang);
  renderStructureTree();
  renderPageHeader();
  renderLangTabs();
  renderBlockList();
  updateLangHint();
  setPreviewSrc(iframe, { brand: 'generic', layout, lang: currentLang });
}

function updateLangHint() {
  const hasContent = Boolean(currentPage && currentPage.blocks.length);
  langHintEl.hidden = currentLang === 'en' || hasContent;
}

// Keeps the structure item's `langs` in sync with which languages actually
// have authored content — see the plan's "Idiomas por item" rule: this is
// exactly what decides whether the page ships for that language.
function trackLangForCurrentItem() {
  if (!currentItemId || currentLang === 'en') return;
  const found = findItem(editor.state.structure, currentItemId);
  if (!found) return;
  const hasContent = currentPage.blocks.length > 0;
  const already = found.item.langs.includes(currentLang);
  if (hasContent && !already) found.item.langs.push(currentLang);
  if (!hasContent && already) found.item.langs = found.item.langs.filter((l) => l !== currentLang);
}

// ---------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------
// Word/PowerPoint-style "Insert" toolbar: one button per block type, each
// inserting immediately (no type picker + separate "Add" click).
function renderInsertToolbar() {
  insertToolbarEl.innerHTML = '';
  const addButton = (label, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-insert-button';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    insertToolbarEl.appendChild(btn);
  };
  for (const { type, labelKey } of BLOCK_TYPES) {
    if (type === 'heading') {
      addButton(currentDict['editor.block.heading1'] || 'H1', () => addBlock('heading', { level: 1 }));
      addButton(currentDict['editor.block.heading2'] || 'H2', () => addBlock('heading', { level: 2 }));
      continue;
    }
    addButton(currentDict[labelKey] || type, () => addBlock(type));
  }
}

function onBlockChanged() {
  if (currentItemId) editor.setPage(currentItemId, currentLang, currentPage);
  trackLangForCurrentItem();
  updateLangHint();
  renderStructureTree();
  schedulePreviewUpdate();
  scheduleAutosave();
}

// Drag-and-drop reordering (see makeDragHandle) needs an insert-at-target
// move, not a swap — dropping block 0 onto block 5 should shift 1-5 up by
// one, not just trade places with 5.
function moveBlockTo(from, to) {
  if (from === to) return;
  const blocks = currentPage.blocks;
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to > from ? to - 1 : to, 0, moved);
  renderBlockList();
  onBlockChanged();
}

// A small always-visible "⠿" handle: native HTML5 drag-and-drop, draggable
// only on the handle itself (not the whole row) so dragging never conflicts
// with selecting/editing text in the block's own field. `getIndex` is a
// function, not a captured value, since indices shift as items reorder and
// the handle isn't recreated on every drag.
// A light-gray placeholder bar tracks the cursor's half (top/bottom) of
// whatever row it's over — a preview of where the block will land, not a
// move that already happened (the underlying array is untouched until
// drop). One placeholder per drag, shared across every row in that list
// via its container.
function showDropPlaceholder(rowEl, clientY) {
  const container = rowEl.parentElement;
  let placeholder = container.querySelector(':scope > .editor-drop-placeholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'editor-drop-placeholder';
  }
  const rect = rowEl.getBoundingClientRect();
  const before = clientY < rect.top + rect.height / 2;
  container.insertBefore(placeholder, before ? rowEl : rowEl.nextSibling);
}

function clearDropPlaceholder(container) {
  container?.querySelector(':scope > .editor-drop-placeholder')?.remove();
}

// Index implied by the placeholder's current position among its siblings
// (the dragged row still counts at its original spot, dimmed via
// .is-dragging) — matches the "insert before this position" semantics
// moveBlockTo()/moveItemTo()-style callbacks already expect.
function dropTargetIndex(container) {
  const placeholder = container.querySelector(':scope > .editor-drop-placeholder');
  if (!placeholder) return null;
  return Array.from(container.children).indexOf(placeholder);
}

// Auto-scroll while dragging: a block/item/tree row can be far above or
// below the visible part of its scrolling panel (.editor-page-panel /
// .editor-structure-panel), and native drag-and-drop does not scroll the
// page for you. Runs off a rAF loop (not just the dragover handler) so it
// keeps scrolling smoothly even though dragover only fires when the
// pointer actually moves.
let dragAutoScrollRAF = null;
let dragPointerY = null;
let dragScrollContainer = null;
const AUTO_SCROLL_EDGE = 56;
const AUTO_SCROLL_MAX_SPEED = 16;

function autoScrollStep() {
  if (dragScrollContainer && dragPointerY != null) {
    const rect = dragScrollContainer.getBoundingClientRect();
    if (dragPointerY < rect.top + AUTO_SCROLL_EDGE) {
      const intensity = Math.min(1, (rect.top + AUTO_SCROLL_EDGE - dragPointerY) / AUTO_SCROLL_EDGE);
      dragScrollContainer.scrollTop -= AUTO_SCROLL_MAX_SPEED * intensity;
    } else if (dragPointerY > rect.bottom - AUTO_SCROLL_EDGE) {
      const intensity = Math.min(1, (dragPointerY - (rect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE);
      dragScrollContainer.scrollTop += AUTO_SCROLL_MAX_SPEED * intensity;
    }
  }
  dragAutoScrollRAF = requestAnimationFrame(autoScrollStep);
}

function startAutoScroll(rowEl) {
  dragScrollContainer = rowEl.closest('.editor-page-panel, .editor-structure-panel');
  if (!dragAutoScrollRAF) dragAutoScrollRAF = requestAnimationFrame(autoScrollStep);
}

function stopAutoScroll() {
  if (dragAutoScrollRAF) cancelAnimationFrame(dragAutoScrollRAF);
  dragAutoScrollRAF = null;
  dragPointerY = null;
  dragScrollContainer = null;
}

// `rowEl` is the element that represents one reorderable row for drag
// purposes (dragover/drop target, placeholder positioning) — not
// necessarily the same element the returned handle button visually sits
// inside (the structure tree nests its clickable row div one level below
// the actual <li> sibling that needs to move).
function makeDragHandle(rowEl, getIndex, onDrop) {
  const handle = document.createElement('span');
  handle.className = 'editor-drag-handle';
  handle.draggable = true;
  handle.title = currentDict['editor.block.dragHandle'] || 'Drag to reorder';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(getIndex()));
    rowEl.classList.add('is-dragging');
    startAutoScroll(rowEl);
  });
  handle.addEventListener('dragend', () => {
    rowEl.classList.remove('is-dragging');
    clearDropPlaceholder(rowEl.parentElement);
    stopAutoScroll();
  });
  rowEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragPointerY = e.clientY;
    showDropPlaceholder(rowEl, e.clientY);
  });
  rowEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    const to = dropTargetIndex(rowEl.parentElement);
    clearDropPlaceholder(rowEl.parentElement);
    if (to !== null) onDrop(from, to);
  });
  return handle;
}

function removeBlockAt(index) {
  currentPage.blocks.splice(index, 1);
  renderBlockList();
  onBlockChanged();
}

function addBlock(type, overrides) {
  if (!currentItemId) return;
  const block = Object.assign(createDefaultBlock(type), overrides);
  currentPage.blocks.push(block);
  renderBlockList();
  onBlockChanged();
  focusBlockAt(currentPage.blocks.length - 1);
}

// Notion-style "Enter splits into a new block" — inserted right after
// `index` (not always at the end), so hitting Enter mid-document continues
// naturally instead of jumping content to the bottom of the page.
function insertBlockAfter(index, type = 'paragraph') {
  const block = createDefaultBlock(type);
  currentPage.blocks.splice(index + 1, 0, block);
  renderBlockList();
  onBlockChanged();
  focusBlockAt(index + 1);
}

function focusBlockAt(index) {
  const row = blockListEl.children[index];
  if (!row) return;
  const richEl = row.querySelector('.editor-inline-richtext');
  if (richEl) { focusRichField(row); return; }
  const fieldEl = row.querySelector('textarea, input[type="text"]');
  if (!fieldEl) return;
  fieldEl.focus();
  const end = fieldEl.value.length;
  fieldEl.setSelectionRange?.(end, end);
}

function field(labelText, inputEl) {
  const wrap = document.createElement('label');
  wrap.className = 'generator-field editor-block-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  wrap.appendChild(span);
  wrap.appendChild(inputEl);
  return wrap;
}

function textInput(value, onInput) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// The direct-typing surface for "flow" blocks (heading/paragraph/label):
// looks and behaves like plain text, grows with its content, and — unless
// `multiline` — treats a bare Enter as "done with this block, start the
// next one" (Notion's model) instead of inserting a newline. Shift+Enter
// always falls through to the textarea's normal newline behavior.
function inlineTextField(value, { className = '', placeholder = '', multiline = false, onInput, onEnter } = {}) {
  const el = document.createElement('textarea');
  el.className = `editor-inline-field ${className}`.trim();
  el.rows = 1;
  el.placeholder = placeholder;
  el.value = value || '';
  el.addEventListener('input', () => { onInput(el.value); autoGrow(el); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !multiline) {
      e.preventDefault();
      onEnter && onEnter();
    }
  });
  requestAnimationFrame(() => autoGrow(el));
  return el;
}

// The direct-typing surface for text that may contain a link (paragraph,
// callout body, list/step items) — a contenteditable, not a textarea,
// since a plain <textarea> can't render an inline hyperlink at all. Never
// trusts what the browser leaves in the DOM: every 'input' re-derives the
// value by running the field's current innerHTML through
// sanitizeInlineHtml() (see content/sanitize.js), which keeps only text
// and plain <a href> — so no matter what a paste or a stray browser
// behavior puts in the live DOM, only that sanitized result is ever
// stored or rendered. Enter/Shift+Enter behave the same as
// inlineTextField(); native Enter handling is never allowed to run (it
// tends to insert <div>/<p> wrappers), everything goes through
// insertLineBreak or onEnter instead.
function inlineRichTextField(html, { className = '', placeholder = '', multiline = false, onInput, onEnter } = {}) {
  const el = document.createElement('div');
  el.className = `editor-inline-field editor-inline-richtext ${className}`.trim();
  el.contentEditable = 'true';
  el.dataset.placeholder = placeholder;
  el.innerHTML = sanitizeInlineHtml(html).split('\n').join('<br>');

  const emit = () => onInput(sanitizeInlineHtml(el.innerHTML));

  el.addEventListener('input', emit);
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (multiline || e.shiftKey) {
      document.execCommand('insertLineBreak');
      emit();
    } else {
      onEnter && onEnter();
    }
  });
  return el;
}

// Selects (or inserts, if the cursor has no selection) the text an
// "Insert link" action should wrap — built with real DOM nodes
// (createElement/textContent), never an HTML string, so nothing here can
// smuggle in markup regardless of what the user typed as the link text.
function insertLinkInField(field) {
  const selection = window.getSelection();
  if (!selection || !field.contains(selection.anchorNode)) {
    window.alert(currentDict['editor.block.link.needFocus'] || 'Click inside the text first, optionally select some words, then try again.');
    return;
  }
  const url = window.prompt(currentDict['editor.block.link.promptUrl'] || 'Link target (a page like ../menu2/index.html, or a full https:// URL):');
  if (!url) return;
  if (!selection.isCollapsed) {
    document.execCommand('createLink', false, url);
  } else {
    const text = window.prompt(currentDict['editor.block.link.promptText'] || 'Link text:');
    if (!text) return;
    const range = selection.getRangeAt(0);
    const a = document.createElement('a');
    a.href = url;
    a.textContent = text;
    range.deleteContents();
    range.insertNode(a);
    range.setStartAfter(a);
    range.setEndAfter(a);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function focusRichField(row) {
  const el = row && row.querySelector('.editor-inline-richtext');
  if (!el) return;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// One row per item (Word/Notion-style bullet list): Enter adds a new item
// right after the current one and focuses it, same spirit as
// insertBlockAfter() for top-level blocks.
// The whole list is one block (one entry in editor.state.pages[...].blocks,
// one ▲▼× in the page flow) — everything in here is item-level add/remove/
// reorder *within* that single block, not separate blocks of their own.
function renderItemsRichList(items, bullet, onChange) {
  const outer = document.createElement('div');
  outer.className = 'editor-list-block';
  const wrap = document.createElement('div');
  wrap.className = 'editor-inline-items-list';
  outer.appendChild(wrap);

  const redraw = () => {
    wrap.innerHTML = '';
    items.forEach((value, i) => {
      const row = document.createElement('div');
      row.className = 'editor-inline-item-row';
      // Handle at the leading edge, delete at the trailing edge — spaced
      // apart on purpose (see the same choice for block rows above) so
      // reaching for one can't accidentally hit the other.
      row.appendChild(makeDragHandle(row, () => i, (from, to) => {
        if (from === to) return;
        const [moved] = items.splice(from, 1);
        items.splice(to > from ? to - 1 : to, 0, moved);
        redraw();
        onChange();
      }));
      const marker = document.createElement('span');
      marker.className = 'editor-inline-item-bullet';
      marker.textContent = bullet(i);
      row.appendChild(marker);
      row.appendChild(inlineRichTextField(value, {
        className: 'editor-inline-paragraph',
        placeholder: currentDict['editor.block.items.itemPlaceholder'] || 'List item',
        onInput: (v) => { items[i] = v; onChange(); },
        onEnter: () => {
          items.splice(i + 1, 0, '');
          redraw();
          onChange();
          focusRichField(wrap.children[i + 1]);
        },
      }));
      const deleteBtn = iconButton('×', currentDict['editor.tree.remove'] || 'Remove', () => {
        items.splice(i, 1);
        if (!items.length) items.push('');
        redraw();
        onChange();
      });
      deleteBtn.classList.add('editor-item-delete');
      row.appendChild(deleteBtn);
      wrap.appendChild(row);
    });
  };
  redraw();

  const addItemButton = document.createElement('button');
  addItemButton.type = 'button';
  addItemButton.className = 'editor-add-item-pill';
  addItemButton.textContent = currentDict['editor.block.addItem'] || '+ Item';
  addItemButton.addEventListener('click', () => {
    items.push('');
    redraw();
    onChange();
    focusRichField(wrap.children[items.length - 1]);
  });
  outer.appendChild(addItemButton);

  return outer;
}

// A rich-text field (see inlineRichTextField) plus a small "Link" button
// that wraps the current selection (or inserts new linked text at the
// cursor) — the only way to add a link in the editor; there is no way to
// type a "<a href>" directly, by design (see insertLinkInField).
function richFieldWithLink(value, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-inline-richtext-wrap';
  const fieldEl = inlineRichTextField(value, opts);
  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'editor-inline-link-button';
  linkBtn.textContent = currentDict['editor.block.link.button'] || 'Link';
  // mousedown (not click) + preventDefault so clicking the button never
  // steals focus/collapses the text selection it's about to act on.
  linkBtn.addEventListener('mousedown', (e) => e.preventDefault());
  linkBtn.addEventListener('click', () => insertLinkInField(fieldEl));
  wrap.appendChild(fieldEl);
  wrap.appendChild(linkBtn);
  return wrap;
}

function renderTableEditor(block, onChange) {
  const wrap = document.createElement('div');
  const redraw = () => {
    wrap.innerHTML = '';
    wrap.appendChild(field(currentDict['editor.block.table.caption'] || 'Caption', textInput(block.caption, (v) => { block.caption = v; onChange(); })));

    const headerRowLabel = document.createElement('label');
    headerRowLabel.className = 'editor-checkbox-field';
    const headerRowCheckbox = document.createElement('input');
    headerRowCheckbox.type = 'checkbox';
    headerRowCheckbox.checked = block.headers.length > 0;
    headerRowCheckbox.addEventListener('change', () => {
      if (headerRowCheckbox.checked) {
        const width = block.rows[0]?.length || 2;
        block.headers = new Array(width).fill('');
      } else {
        block.headers = [];
      }
      redraw();
      onChange();
    });
    headerRowLabel.appendChild(headerRowCheckbox);
    headerRowLabel.appendChild(document.createTextNode(currentDict['editor.block.table.hasHeader'] || 'First row is a header'));
    wrap.appendChild(headerRowLabel);

    const rowHeaderLabel = document.createElement('label');
    rowHeaderLabel.className = 'editor-checkbox-field';
    const rowHeaderCheckbox = document.createElement('input');
    rowHeaderCheckbox.type = 'checkbox';
    rowHeaderCheckbox.checked = Boolean(block.rowHeaderColumn);
    rowHeaderCheckbox.addEventListener('change', () => { block.rowHeaderColumn = rowHeaderCheckbox.checked; onChange(); });
    rowHeaderLabel.appendChild(rowHeaderCheckbox);
    rowHeaderLabel.appendChild(document.createTextNode(currentDict['editor.block.table.hasRowHeader'] || 'First column is a row label'));
    wrap.appendChild(rowHeaderLabel);

    const grid = document.createElement('div');
    grid.className = 'editor-table-grid';
    const width = block.headers.length || block.rows[0]?.length || 2;

    if (block.headers.length) {
      const headRow = document.createElement('div');
      headRow.className = 'editor-table-row editor-table-row-header';
      block.headers.forEach((h, c) => {
        headRow.appendChild(textInput(h, (v) => { block.headers[c] = v; onChange(); }));
      });
      grid.appendChild(headRow);
    }
    block.rows.forEach((row, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'editor-table-row';
      row.forEach((cell, c) => {
        rowEl.appendChild(textInput(cell, (v) => { block.rows[r][c] = v; onChange(); }));
      });
      rowEl.appendChild(iconButton('×', 'Remove row', () => { block.rows.splice(r, 1); redraw(); onChange(); }));
      grid.appendChild(rowEl);
    });
    wrap.appendChild(grid);

    const rowButtons = document.createElement('div');
    rowButtons.className = 'editor-table-buttons';
    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.textContent = currentDict['editor.block.table.addRow'] || '+ Row';
    addRowBtn.addEventListener('click', () => { block.rows.push(new Array(width).fill('')); redraw(); onChange(); });
    const addColBtn = document.createElement('button');
    addColBtn.type = 'button';
    addColBtn.textContent = currentDict['editor.block.table.addColumn'] || '+ Column';
    addColBtn.addEventListener('click', () => {
      if (block.headers.length) block.headers.push('');
      block.rows.forEach((row) => row.push(''));
      redraw();
      onChange();
    });
    rowButtons.appendChild(addRowBtn);
    rowButtons.appendChild(addColBtn);
    wrap.appendChild(rowButtons);
  };
  redraw();
  return wrap;
}

function renderImageEditor(block, onChange) {
  const wrap = document.createElement('div');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  const thumb = document.createElement('img');
  thumb.className = 'editor-image-thumb';
  thumb.hidden = !block.srcDataUrl;
  if (block.srcDataUrl) thumb.src = block.srcDataUrl;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    block.srcDataUrl = await readFileAsDataUrl(file);
    thumb.src = block.srcDataUrl;
    thumb.hidden = false;
    onChange();
  });
  wrap.appendChild(field(currentDict['editor.block.figure.upload'] || 'Image', fileInput));
  wrap.appendChild(thumb);
  wrap.appendChild(field(currentDict['editor.block.figure.alt'] || 'Alt text (required)', textInput(block.alt, (v) => { block.alt = v; onChange(); })));
  wrap.appendChild(field(currentDict['editor.block.figure.caption'] || 'Caption', textInput(block.caption, (v) => { block.caption = v; onChange(); })));
  return wrap;
}

// `index` is only used to know where a bare Enter should insert the next
// block (see insertBlockAfter) — irrelevant for the structured block types
// (table/figure/attachment) that never spawn a sibling this way.
function renderBlockFields(block, onChange, index) {
  const wrap = document.createElement('div');
  switch (block.type) {
    case 'heading':
      wrap.appendChild(inlineTextField(block.text, {
        className: block.level === 1 ? 'editor-inline-h1' : 'editor-inline-h2',
        placeholder: currentDict['editor.block.heading'] || 'Heading',
        onInput: (v) => { block.text = v; onChange(); },
        onEnter: () => insertBlockAfter(index),
      }));
      break;
    case 'paragraph':
      wrap.appendChild(richFieldWithLink(block.text, {
        className: 'editor-inline-paragraph',
        placeholder: currentDict['editor.block.paragraph'] || 'Paragraph — type your text',
        onInput: (v) => { block.text = v; onChange(); },
        onEnter: () => insertBlockAfter(index),
      }));
      break;
    case 'contentTypeLabel':
      wrap.appendChild(inlineTextField(block.text, {
        className: 'editor-inline-label',
        placeholder: currentDict['editor.block.contentTypeLabel.text'] || 'Label (e.g. Tutorial, Reference)',
        onInput: (v) => { block.text = v; onChange(); },
        onEnter: () => insertBlockAfter(index),
      }));
      break;
    case 'list':
      wrap.appendChild(renderItemsRichList(block.items, () => '•', onChange));
      break;
    case 'steps':
      wrap.appendChild(renderItemsRichList(block.items, (i) => `${i + 1}.`, onChange));
      break;
    case 'callout': {
      const variantRow = document.createElement('div');
      variantRow.className = 'editor-callout-variants';
      for (const v of CALLOUT_VARIANTS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `editor-callout-variant-button editor-callout-variant-${v}` + (block.variant === v ? ' is-selected' : '');
        btn.textContent = currentDict[`editor.block.callout.variant.${v}`] || v;
        btn.addEventListener('click', () => { block.variant = v; onChange(); renderBlockList(); });
        variantRow.appendChild(btn);
      }
      wrap.appendChild(variantRow);
      wrap.appendChild(inlineTextField(block.title, {
        className: 'editor-inline-callout-title',
        placeholder: currentDict['editor.block.callout.title'] || 'Title',
        onInput: (v) => { block.title = v; onChange(); },
      }));
      wrap.appendChild(richFieldWithLink(block.text, {
        className: 'editor-inline-paragraph',
        placeholder: currentDict['editor.block.callout.text'] || 'Text',
        multiline: true,
        onInput: (v) => { block.text = v; onChange(); },
      }));
      break;
    }
    case 'table':
      wrap.appendChild(renderTableEditor(block, onChange));
      break;
    case 'figure':
      wrap.appendChild(renderImageEditor(block, onChange));
      break;
    case 'code':
      wrap.appendChild(inlineTextField(block.text, {
        className: 'editor-inline-code',
        placeholder: currentDict['editor.block.code.text'] || 'Code',
        multiline: true,
        onInput: (v) => { block.text = v; onChange(); },
      }));
      break;
    case 'attachment':
      wrap.appendChild(field(currentDict['editor.block.attachment.label'] || 'Link text', textInput(block.label, (v) => { block.label = v; onChange(); })));
      wrap.appendChild(field(currentDict['editor.block.attachment.href'] || 'URL', textInput(block.href, (v) => { block.href = v; onChange(); })));
      break;
    case 'raw': {
      // Never editable as markup — a user must never be able to type
      // arbitrary HTML into their own manual. This only ever comes from
      // import.js re-preserving this project's own existing page content
      // that couldn't be represented as plain-text fields (e.g. a
      // paragraph with an inline link); shown read-only, as plain text,
      // so nothing here can introduce unsafe or broken markup.
      const notice = document.createElement('p');
      notice.className = 'generator-hint';
      notice.textContent = currentDict['editor.block.raw.notice'] || 'Imported content that could not be turned into editable fields — shown read-only. Remove it and recreate it with the toolbar above if you want to change it.';
      wrap.appendChild(notice);
      const preview = document.createElement('div');
      preview.className = 'editor-raw-preview';
      preview.textContent = new DOMParser().parseFromString(block.html, 'text/html').body.textContent.trim();
      wrap.appendChild(preview);
      break;
    }
    default:
      break;
  }
  return wrap;
}

// Notion-style: every block sits directly in the flow, always "expanded" —
// no collapse/expand step. Move/remove controls only reveal on hover (see
// .editor-block-row:hover in generator.css) instead of a permanent header
// bar, so the page reads like a document rather than a stack of cards.
function renderBlockList() {
  blockListEl.innerHTML = '';
  if (!currentPage) return;
  currentPage.blocks.forEach((block, index) => {
    const row = document.createElement('div');
    row.className = `editor-block-row editor-block-row-${block.type}`;

    // Drag handle stays right next to the content (where you'd naturally
    // grab a line to move it); delete sits at the far opposite edge of the
    // row — spaced apart on purpose so a slightly-off click can't hit
    // "delete" while reaching for "drag" (or vice versa).
    row.appendChild(makeDragHandle(row, () => index, moveBlockTo));

    const content = document.createElement('div');
    content.className = 'editor-block-content';
    content.appendChild(renderBlockFields(block, onBlockChanged, index));
    row.appendChild(content);

    const deleteBtn = iconButton('×', 'Remove', () => removeBlockAt(index));
    deleteBtn.classList.add('editor-block-delete');
    row.appendChild(deleteBtn);

    blockListEl.appendChild(row);
  });
}

// ---------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------
let previewDebounce = null;
function schedulePreviewUpdate() {
  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(updatePreviewContent, 250);
}

function activeChapterIdFor(itemId) {
  for (const top of editor.state.structure) {
    if (top.id === itemId) return top.id;
    if ((top.children || []).some((c) => c.id === itemId)) return top.id;
  }
  return null;
}

// Re-renders the previewed nav from the editor's own live structure
// (added/removed/renamed/reordered menus) instead of leaving the iframe
// showing whatever nav-config.json it happened to boot with — same
// renderSiteTree() js/core/page-init.js itself uses, just fed our
// in-memory nav instead of a fetch.
// Nav links normally point at a real pages/**/*.html file — one that
// simply doesn't exist yet for anything authored in the editor (it's only
// ever written for real at download time, see build-package.js). Left
// alone, clicking a previewed nav link for an unsaved/new page would 404.
// Intercepted here so a preview nav click always just switches the
// editor's own selection instead of trying to navigate anywhere.
function interceptLink(a, item) {
  if (!a || !item) return;
  a.addEventListener('click', (e) => {
    e.preventDefault();
    selectItem(item.id);
  });
}

function attachPreviewNavClickHandlers(doc, navRoot, nav) {
  if (layout === 'hybrid') {
    const topLinks = navRoot.querySelectorAll(':scope > ul.nav-list > li > a.nav-link');
    topLinks.forEach((a, i) => interceptLink(a, nav[i]));
    const sidebar = doc.getElementById('hybrid-sidebar');
    if (sidebar) {
      const chapter = nav.find((item) => item.id === activeChapterIdFor(currentItemId));
      sidebar.querySelectorAll('a.nav-link').forEach((a, i) => interceptLink(a, chapter?.children?.[i]));
    }
    return;
  }
  const flat = flattenNav(nav);
  navRoot.querySelectorAll('a.nav-link').forEach((a, i) => interceptLink(a, flat[i]));
}

function updatePreviewNav() {
  const doc = iframe.contentDocument;
  const navRoot = doc && doc.getElementById('site-nav-tree');
  if (!navRoot) return;
  const nav = toNavConfig(editor.state.structure);
  const translations = { ...manualDict, ...(collectLabels(editor.state.structure)[currentLang] || {}) };
  renderSiteTree(navRoot, nav, layout, translations, {
    activeItemId: currentItemId,
    activeChapterId: activeChapterIdFor(currentItemId),
    lang: currentLang,
    hybridSidebarRoot: layout === 'hybrid' ? doc.getElementById('hybrid-sidebar') : null,
  });
  attachPreviewNavClickHandlers(doc, navRoot, nav);
}

function updatePreviewContent() {
  const doc = iframe.contentDocument;
  const main = doc && doc.getElementById('page-content');
  if (!main) return;
  main.innerHTML = currentPage ? renderPage(currentPage.blocks) : '';
  updatePreviewNav();
}

// ---------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------
let autosaveDebounce = null;
function scheduleAutosave() {
  recordHistory();
  clearTimeout(autosaveDebounce);
  autosaveDebounce = setTimeout(() => {
    editor.save();
    saveStatusEl.textContent = currentDict['editor.save.savedStatus'] || 'Saved.';
  }, 400);
}

// ---------------------------------------------------------------------
// Undo / redo — every mutation in the editor already funnels through
// scheduleAutosave() (structure edits, block edits, reordering, image
// uploads…), so recording history there — instead of at each individual
// call site — is enough to cover the whole document with one hook. Rapid
// changes (typing) are coalesced into a single snapshot by the same
// debounce window as autosave, so undo steps roughly one "pause" at a
// time, the way Word/Google Docs group keystrokes.
// ---------------------------------------------------------------------
const HISTORY_LIMIT = 100;
let historyStack = [];
let historyIndex = -1;
let historyDebounce = null;
let isApplyingHistory = false;

function snapshotState() {
  return JSON.stringify(editor.serialize());
}

function pushHistorySnapshot() {
  if (isApplyingHistory) return;
  const snap = snapshotState();
  if (historyStack[historyIndex] === snap) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(snap);
  if (historyStack.length > HISTORY_LIMIT) historyStack.shift();
  historyIndex = historyStack.length - 1;
  updateHistoryButtons();
}

function recordHistory() {
  if (isApplyingHistory) return;
  clearTimeout(historyDebounce);
  historyDebounce = setTimeout(pushHistorySnapshot, 400);
}

function initHistory() {
  historyStack = [snapshotState()];
  historyIndex = 0;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoButton.disabled = historyIndex <= 0;
  redoButton.disabled = historyIndex >= historyStack.length - 1;
}

async function applyHistorySnapshot(snap) {
  isApplyingHistory = true;
  clearTimeout(autosaveDebounce);
  editor.restore(JSON.parse(snap));
  if (currentItemId && !findItem(editor.state.structure, currentItemId)) {
    currentItemId = null;
    currentPage = null;
  } else if (currentItemId) {
    currentPage = await editor.getPage(currentItemId, currentLang);
  }
  renderStructureTree();
  renderPageHeader();
  renderLangTabs();
  renderBlockList();
  updateLangHint();
  schedulePreviewUpdate();
  editor.save();
  saveStatusEl.textContent = currentDict['editor.save.savedStatus'] || 'Saved.';
  isApplyingHistory = false;
  updateHistoryButtons();
}

async function undo() {
  if (historyIndex <= 0) return;
  clearTimeout(historyDebounce);
  historyIndex -= 1;
  await applyHistorySnapshot(historyStack[historyIndex]);
}

async function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  clearTimeout(historyDebounce);
  historyIndex += 1;
  await applyHistorySnapshot(historyStack[historyIndex]);
}

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);

// Global, document-level undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or +Y) —
// like Word/Google Docs, this works regardless of which field has focus,
// not a per-field native undo (which would fight with the sanitize-on-
// every-input rewriting inlineRichTextField already does).
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
  } else if (key === 'z') {
    e.preventDefault();
    undo();
  } else if (key === 'y') {
    e.preventDefault();
    redo();
  }
});

// ---------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------
function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

downloadButton.addEventListener('click', async () => {
  const theme = await loadThemeState();
  const { errors } = validateManual(editor.state.structure, (id, lang) => editor.state.pages.get(`${id}::${lang}`), manualLangs);
  if (errors.length) {
    statusEl.textContent = `${currentDict['editor.download.invalid'] || 'Fix these before downloading:'} ${errors.join(' ')}`;
    return;
  }
  downloadButton.disabled = true;
  statusEl.textContent = currentDict['generator.status.building'] || 'Building your manual…';
  try {
    const blob = await buildManualZip({
      colors: theme.colors,
      componentColors: theme.componentColors,
      borderRadius: theme.borderRadius,
      fontHeading: theme.fontHeading,
      fontBody: theme.fontBody,
      logoFile: theme.logoFile,
      faviconFile: theme.faviconFile,
      productName: theme.productName,
      layout: theme.layout,
      langs: manualLangs,
      customFonts: theme.customFonts,
      content: { structure: editor.state.structure, pages: Object.fromEntries(editor.state.pages) },
    });
    triggerBlobDownload(blob, `manual-${slugify(theme.productName)}.zip`);
    statusEl.textContent = currentDict['generator.status.done'] || 'Done — check your downloads folder.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = `${currentDict['generator.status.errorPrefix'] || 'Something went wrong:'} ${err.message}`;
  } finally {
    downloadButton.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Reset content
// ---------------------------------------------------------------------
async function resetEditorContent() {
  if (!window.confirm(currentDict['editor.reset.confirm'] || 'This erases every content change (structure and blocks) and starts over from the original template. This cannot be undone. Continue?')) return;
  editor.clearSaved();
  editor.resetAll();
  await editor.initFromNav(await loadNav());
  currentItemId = null;
  currentPage = null;
  renderStructureTree();
  renderPageHeader();
  renderLangTabs();
  renderBlockList();
  schedulePreviewUpdate();
  initHistory();
  saveStatusEl.textContent = currentDict['editor.reset.done'] || 'Content reset to the original template.';
}
resetContentButton.addEventListener('click', resetEditorContent);

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
const initialLang = localStorage.getItem(GENERATOR_LANG_KEY) || 'en';
currentDict = await applyGeneratorTranslations(initialLang);
renderInsertToolbar();

const theme = await loadThemeState();
layout = theme.layout;
manualLangs = theme.langs;

const restored = editor.loadSaved();
if (!restored) {
  await editor.initFromNav(await loadNav());
}
await loadManualDict(currentLang);
renderStructureTree();
initHistory();

iframe.addEventListener('load', () => {
  hidePreviewChromeSelectors(iframe);
  waitForPreviewReady(iframe).then(() => {
    applyCustomTheme(iframe, { colors: theme.colors, componentColors: theme.componentColors, borderRadius: theme.borderRadius, fontHeading: theme.fontHeading, fontBody: theme.fontBody });
    applyCustomFontFaces(iframe, [
      { family: CUSTOM_HEADING_FAMILY, dataUrl: theme.customFonts.heading?.dataUrl },
      { family: CUSTOM_BODY_FAMILY, dataUrl: theme.customFonts.body?.dataUrl },
    ]);
    if (theme.logoDataUrl) applyCustomLogo(iframe, theme.logoDataUrl);
    if (theme.faviconDataUrl) applyCustomFavicon(iframe, theme.faviconDataUrl);
    applyProductName(iframe, theme.productName);
    updatePreviewContent();
  });
});
setPreviewSrc(iframe, { brand: 'generic', layout, lang: currentLang });

if (editor.state.structure.length) {
  await selectItem(editor.state.structure[0].id);
}
