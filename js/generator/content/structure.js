// Editable menu/submenu tree, shaped like nav-config.json but mutable in
// memory. Every item still resolves through `labelKey` at render time —
// built-in items keep pointing at `nav.menuN`-style keys already in
// i18n/*.json; items the user creates get a synthetic `custom.<id>` key
// instead of a real translation-file entry, plus a `label` object of
// literal per-language text that the build/preview step injects into a
// copy of the i18n dictionary under that same key (see collectLabels()
// below). This reuses js/nav/nav-render.js's existing `t[item.labelKey] ||
// item.labelKey` lookup completely unchanged — no core nav-rendering code
// needs to know custom items exist.
//
// Only two levels deep (menu -> submenu), matching every existing
// nav-config.json entry — no built-in page nests any deeper, so v1 doesn't
// either.
import { slugify, uniqueSlug } from './slug.js';

export function fromNavConfig(nav) {
  return (nav || []).map((item) => cloneItem(item));
}

function cloneItem(item) {
  return {
    id: item.id,
    labelKey: item.labelKey,
    label: item.label ? { ...item.label } : undefined,
    path: item.path,
    langs: [...(item.langs || [])],
    custom: Boolean(item.custom),
    children: (item.children || []).map((child) => cloneItem(child)),
  };
}

export function toNavConfig(structure) {
  return structure.map((item) => serializeItem(item));
}

function serializeItem(item) {
  const out = {
    id: item.id,
    labelKey: item.labelKey,
    path: item.path,
    langs: [...item.langs],
  };
  if (item.children?.length) out.children = item.children.map((child) => serializeItem(child));
  return out;
}

// { [lang]: { [labelKey]: text } } for every custom item that has a label
// in that language — merged into a copy of i18n/<lang>.json at build/
// preview time so nav-render.js's normal labelKey lookup just finds it.
export function collectLabels(structure) {
  const out = {};
  const walk = (items) => {
    for (const item of items) {
      if (item.custom) {
        for (const [lang, text] of Object.entries(item.label || {})) {
          out[lang] = out[lang] || {};
          out[lang][item.labelKey] = text;
        }
      }
      if (item.children?.length) walk(item.children);
    }
  };
  walk(structure);
  return out;
}

// Display text for the structure tree UI itself. Custom items fall back
// across languages so a menu only labeled in "en" still shows something
// while editing "pt"; built-in items resolve their real translated text
// via `manualDict` (the site's own i18n/<lang>.json, not this tool's own
// chrome dictionary) when one is passed, same as the manual itself shows.
export function displayLabel(item, lang, manualDict) {
  if (item.label) return item.label[lang] || item.label.en || Object.values(item.label)[0] || item.id;
  return (manualDict && manualDict[item.labelKey]) || item.labelKey;
}

export function collectIds(structure) {
  const ids = new Set();
  const walk = (items) => {
    for (const item of items) {
      ids.add(item.id);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(structure);
  return ids;
}

function pathFor(id, isSubmenu, parentId) {
  return isSubmenu ? `pages/{lang}/${parentId}/${id}.html` : `pages/{lang}/${id}/index.html`;
}

export function addMenu(structure, { text, lang }) {
  const ids = collectIds(structure);
  const id = uniqueSlug(slugify(text), ids, 'menu');
  const item = {
    id,
    labelKey: `custom.${id}`,
    label: { [lang]: text },
    path: pathFor(id, false),
    langs: [],
    custom: true,
    children: [],
  };
  structure.push(item);
  return item;
}

export function addSubmenu(structure, menuId, { text, lang }) {
  const menu = findItem(structure, menuId)?.item;
  if (!menu) throw new Error(`Menu not found: ${menuId}`);
  const ids = collectIds(structure);
  const id = uniqueSlug(slugify(text), ids, 'submenu');
  const item = {
    id,
    labelKey: `custom.${id}`,
    label: { [lang]: text },
    path: pathFor(id, true, menuId),
    langs: [],
    custom: true,
    children: [],
  };
  menu.children = menu.children || [];
  menu.children.push(item);
  return item;
}

export function renameItem(structure, id, lang, text) {
  const found = findItem(structure, id);
  if (!found) throw new Error(`Item not found: ${id}`);
  if (!found.item.custom) throw new Error(`Cannot rename a built-in item: ${id}`);
  found.item.label = { ...found.item.label, [lang]: text };
}

export function removeItem(structure, id) {
  const found = findItem(structure, id);
  if (!found) return;
  found.siblings.splice(found.index, 1);
}

export function moveItem(structure, id, direction) {
  const found = findItem(structure, id);
  if (!found) return;
  const { siblings, index } = found;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
}

export function findItem(structure, id, siblings = structure) {
  const index = siblings.findIndex((item) => item.id === id);
  if (index !== -1) return { item: siblings[index], siblings, index };
  for (const item of siblings) {
    if (item.children?.length) {
      const found = findItem(structure, id, item.children);
      if (found) return found;
    }
  }
  return null;
}
