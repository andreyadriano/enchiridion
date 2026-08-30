// Pre-download checklist (see the plan's "Checklist de validacao antes de
// habilitar Baixar") — run before buildManualZip() ever touches edited
// content, so a malformed table or a menu with no English content fails
// fast with a clear message instead of shipping a broken zip.
import { validateTable } from './blocks.js';

export function validateManual(structure, getPageSync, selectedLangs) {
  const errors = [];
  const warnings = [];

  const walk = (items) => {
    for (const item of items) {
      // Only editor-created items lack a real file to fall back to — an
      // unedited demo page the user never opened in the editor has no
      // entry in `pages` at all, and that's fine: build-package.js ships
      // its real file as-is (see buildManualZip's fetch+rewrite fallback).
      if (item.custom) {
        const enPage = getPageSync(item.id, 'en');
        if (!enPage || !enPage.blocks.length) {
          errors.push(`"${item.id}" has no English content.`);
        }
      }
      for (const lang of selectedLangs) {
        const page = getPageSync(item.id, lang);
        if (!page) continue;
        for (const block of page.blocks) {
          if (block.type === 'table') {
            for (const msg of validateTable(block)) errors.push(`"${item.id}" (${lang}): ${msg}`);
          }
          if (block.type === 'figure' && !block.alt) {
            warnings.push(`"${item.id}" (${lang}): an image has no alt text.`);
          }
        }
      }
      if (item.children?.length) walk(item.children);
    }
  };
  walk(structure);

  return { errors, warnings, ok: errors.length === 0 };
}
