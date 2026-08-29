export const CUSTOM_FONT_VALUE = 'custom';
export const CUSTOM_HEADING_FAMILY = 'GeneratorCustomHeading';
export const CUSTOM_BODY_FAMILY = 'GeneratorCustomBody';

// Each stack's own i18n key, not a hardcoded label — renderFontSelect()
// re-renders these on every language switch.
export const FONT_STACKS = [
  { key: 'generator.font.systemUi', value: 'system-ui, sans-serif' },
  { key: 'generator.font.serif', value: "Georgia, 'Times New Roman', serif" },
  { key: 'generator.font.humanistSans', value: "'Segoe UI', Helvetica, Arial, sans-serif" },
  { key: 'generator.font.modernGrotesk', value: 'Helvetica, Arial, sans-serif' },
  { key: 'generator.font.monospace', value: "'Courier New', monospace" },
];

// Renders each stack's option IN that font, so picking one is a preview in
// itself; preserves the current selection across a language switch.
export function renderFontSelect(select, dict) {
  const previous = select.value;
  select.innerHTML = '';
  for (const stack of FONT_STACKS) {
    const opt = new Option(dict[stack.key] || stack.key, stack.value);
    opt.style.fontFamily = stack.value;
    select.appendChild(opt);
  }
  select.appendChild(new Option(dict['generator.font.custom'] || 'Custom…', CUSTOM_FONT_VALUE));
  const stillValid = Array.from(select.options).some((o) => o.value === previous);
  select.value = stillValid ? previous : FONT_STACKS[0].value;
}

export function fontCssValue(select, family, uploaded) {
  if (select.value !== CUSTOM_FONT_VALUE) return select.value;
  return uploaded ? `'${family}', sans-serif` : 'system-ui, sans-serif';
}
