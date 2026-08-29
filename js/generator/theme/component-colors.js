// Per-component overrides of the theme CSS variables (see
// themes/theme-schema.md). Each row starts on "auto", following
// seedFrom's base color, and is only emitted once unchecked.
export const COMPONENT_COLORS = [
  { id: 'header', cssVar: '--color-header-bg', seedFrom: 'bg', labelKey: 'generator.color.header', hintKey: 'generator.color.header.hint' },
  { id: 'sidebar', cssVar: '--color-sidebar-bg', seedFrom: 'bg', labelKey: 'generator.color.sidebar', hintKey: 'generator.color.sidebar.hint' },
  { id: 'footer', cssVar: '--color-footer-bg', seedFrom: 'bg', labelKey: 'generator.color.footer', hintKey: 'generator.color.footer.hint' },
  { id: 'nav-link-text', cssVar: '--color-nav-link-text', seedFrom: 'text', labelKey: 'generator.color.navLinkText', hintKey: 'generator.color.navLinkText.hint' },
  { id: 'nav-link-bg-hover', cssVar: '--color-nav-link-bg-hover', seedFrom: 'secondary', labelKey: 'generator.color.navLinkBgHover', hintKey: 'generator.color.navLinkBgHover.hint' },
  { id: 'nav-link-text-hover', cssVar: '--color-nav-link-text-hover', seedFrom: 'text', labelKey: 'generator.color.navLinkTextHover', hintKey: 'generator.color.navLinkTextHover.hint' },
  { id: 'nav-link-bg-active', cssVar: '--color-nav-link-bg-active', seedFrom: 'secondary', labelKey: 'generator.color.navLinkBgActive', hintKey: 'generator.color.navLinkBgActive.hint' },
  { id: 'nav-link-text-active', cssVar: '--color-nav-link-text-active', seedFrom: 'primary', labelKey: 'generator.color.navLinkTextActive', hintKey: 'generator.color.navLinkTextActive.hint' },
  { id: 'search-results-bg', cssVar: '--color-search-results-bg', seedFrom: 'bg', labelKey: 'generator.color.searchResultsBg', hintKey: 'generator.color.searchResultsBg.hint' },
  { id: 'search-results-border', cssVar: '--color-search-results-border', seedFrom: 'secondary', labelKey: 'generator.color.searchResultsBorder', hintKey: 'generator.color.searchResultsBorder.hint' },
  { id: 'search-results-hover-bg', cssVar: '--color-search-results-hover-bg', seedFrom: 'secondary', labelKey: 'generator.color.searchResultsHoverBg', hintKey: 'generator.color.searchResultsHoverBg.hint' },
  { id: 'control-bg', cssVar: '--color-control-bg', seedFrom: 'bg', labelKey: 'generator.color.controlBg', hintKey: 'generator.color.controlBg.hint' },
  { id: 'border', cssVar: '--color-border', seedFrom: 'secondary', labelKey: 'generator.color.border', hintKey: 'generator.color.border.hint' },
  { id: 'table-border', cssVar: '--color-table-border', seedFrom: 'secondary', labelKey: 'generator.color.tableBorder', hintKey: 'generator.color.tableBorder.hint' },
  { id: 'table-header-bg', cssVar: '--color-table-header-bg', seedFrom: 'secondary', labelKey: 'generator.color.tableHeaderBg', hintKey: 'generator.color.tableHeaderBg.hint' },
  { id: 'callout-note', cssVar: '--color-callout-note', seedValue: '#2b6cb0', labelKey: 'generator.color.calloutNote', hintKey: 'generator.color.calloutNote.hint' },
  { id: 'callout-tip', cssVar: '--color-callout-tip', seedValue: '#2f855a', labelKey: 'generator.color.calloutTip', hintKey: 'generator.color.calloutTip.hint' },
  { id: 'callout-caution', cssVar: '--color-callout-caution', seedValue: '#8a6512', labelKey: 'generator.color.calloutCaution', hintKey: 'generator.color.calloutCaution.hint' },
  { id: 'callout-warning', cssVar: '--color-callout-warning', seedValue: '#a34e12', labelKey: 'generator.color.calloutWarning', hintKey: 'generator.color.calloutWarning.hint' },
  { id: 'callout-danger', cssVar: '--color-callout-danger', seedValue: '#c53030', labelKey: 'generator.color.calloutDanger', hintKey: 'generator.color.calloutDanger.hint' },
];

// A row either derives its "auto" swatch from a base-palette color
// (seedFrom) or, when it has no natural base-color counterpart (like the
// callout accents), from a fixed literal (seedValue) — same default the
// CSS fallback chain already uses, so staying on auto changes nothing.
function seedColorFor(spec, colorInputs) {
  return spec.seedValue !== undefined ? spec.seedValue : colorInputs[spec.seedFrom].value;
}

// Builds one row per COMPONENT_COLORS entry inside `grid`, wires its Auto
// checkbox + color input, and returns the same specs with `.autoCheckbox`/
// `.colorInput` attached for the other helpers below to use.
export function buildComponentColorRows(grid, colorInputs, onChange) {
  const specs = COMPONENT_COLORS.map((spec) => ({ ...spec }));
  for (const spec of specs) {
    const row = document.createElement('label');
    row.className = 'generator-advanced-row';
    row.innerHTML = `
      <input type="checkbox" id="auto-${spec.id}" checked>
      <span class="generator-field-label">
        <span data-i18n="${spec.labelKey}"></span>
        <span class="generator-hint-icon" tabindex="0" data-i18n-attr="title:${spec.hintKey}">ⓘ</span>
      </span>
      <input type="color" id="custom-color-${spec.id}" disabled>
    `;
    grid.appendChild(row);
    spec.autoCheckbox = row.querySelector(`#auto-${spec.id}`);
    spec.colorInput = row.querySelector(`#custom-color-${spec.id}`);
    spec.autoCheckbox.addEventListener('change', () => {
      spec.colorInput.disabled = spec.autoCheckbox.checked;
      if (spec.autoCheckbox.checked) spec.colorInput.value = seedColorFor(spec, colorInputs);
      onChange();
    });
    spec.colorInput.addEventListener('input', onChange);
  }
  return specs;
}

// Re-seeds every still-auto row's swatch from its base color, so the swatch
// shown is never stale even though it isn't actually being emitted yet.
export function reseedAutoComponentColors(specs, colorInputs) {
  for (const spec of specs) {
    if (spec.autoCheckbox.checked) spec.colorInput.value = seedColorFor(spec, colorInputs);
  }
}

// Only non-auto rows are returned — an "auto" row is omitted entirely
// rather than sent with its seeded value, so the generated theme CSS relies
// on the same fallback chain as every other theme file instead of
// hard-coding a value that just happens to match the fallback today.
export function currentComponentColors(specs) {
  const out = {};
  for (const spec of specs) {
    if (!spec.autoCheckbox.checked) out[spec.cssVar] = spec.colorInput.value;
  }
  return out;
}

// A saved cssVar entry means that row was off "auto".
export function restoreComponentColors(specs, saved, colorInputs) {
  for (const spec of specs) {
    const isSaved = Object.prototype.hasOwnProperty.call(saved, spec.cssVar);
    spec.autoCheckbox.checked = !isSaved;
    spec.colorInput.disabled = !isSaved;
    spec.colorInput.value = isSaved ? saved[spec.cssVar] : seedColorFor(spec, colorInputs);
  }
}

export function resetComponentColorsToAuto(specs, colorInputs) {
  for (const spec of specs) {
    spec.autoCheckbox.checked = true;
    spec.colorInput.disabled = true;
    spec.colorInput.value = seedColorFor(spec, colorInputs);
  }
}
