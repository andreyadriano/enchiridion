// In-memory + localStorage-backed state for generator/editor.html: the
// structure tree plus each edited page's blocks, keyed by "<itemId>::<lang>".
// A page an existing demo item that the user hasn't opened yet doesn't
// have an entry — it's lazily imported from its real file on first open
// (see getPage()) rather than up front, so opening the editor doesn't
// parse all ~13 demo pages just in case.
import { rootUrl } from '../paths.js';
import { langPath } from '../../nav/nav-config.js';
import { parsePageHtml } from './import.js';
import { fromNavConfig, findItem } from './structure.js';

const SAVE_KEY = 'editor-saved-content';

function pageKey(itemId, lang) {
  return `${itemId}::${lang}`;
}

export function createEditorState() {
  const state = {
    structure: [],
    pages: new Map(), // pageKey -> { title, blocks }
  };

  async function initFromNav(nav) {
    state.structure = fromNavConfig(nav);
  }

  function hasPage(itemId, lang) {
    return state.pages.has(pageKey(itemId, lang));
  }

  async function getPage(itemId, lang) {
    const key = pageKey(itemId, lang);
    if (state.pages.has(key)) return state.pages.get(key);

    const found = findItem(state.structure, itemId);
    if (!found) throw new Error(`Unknown page: ${itemId}`);
    const { item } = found;

    if (item.custom) {
      const page = { title: '', blocks: [] };
      state.pages.set(key, page);
      return page;
    }

    // Existing demo page: import its real file the first time it's opened,
    // via the same lang-fallback rule the live site itself uses.
    const path = langPath(item, lang);
    const res = await fetch(rootUrl(path));
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
    const html = await res.text();
    const { title, blocks } = parsePageHtml(html);
    const page = { title, blocks };
    state.pages.set(key, page);
    return page;
  }

  function setPage(itemId, lang, page) {
    state.pages.set(pageKey(itemId, lang), page);
  }

  function serialize() {
    return {
      version: 1,
      structure: state.structure,
      pages: Object.fromEntries(state.pages),
    };
  }

  function restore(data) {
    state.structure = data.structure || [];
    state.pages = new Map(Object.entries(data.pages || {}));
  }

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
  }

  function loadSaved() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      restore(JSON.parse(raw));
      return true;
    } catch (err) {
      console.error('Could not restore saved content', err);
      return false;
    }
  }

  function clearSaved() {
    localStorage.removeItem(SAVE_KEY);
  }

  // "Restore to original" (editor.html's reset button): drops every
  // imported/edited page from memory too, not just localStorage — without
  // this, a page already opened this session would keep showing its old
  // cached parse (e.g. pre-fix "raw" blocks) even after clearSaved().
  function resetAll() {
    state.structure = [];
    state.pages = new Map();
  }

  return {
    state,
    initFromNav,
    hasPage,
    getPage,
    setPage,
    serialize,
    restore,
    save,
    loadSaved,
    clearSaved,
    resetAll,
  };
}
