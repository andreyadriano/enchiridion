// WCAG 2.1 relative-luminance contrast ratio between two hex colors —
// used by the generator to warn when a chosen text/background pair would
// fail the 4.5:1 minimum for normal-size text (success criterion 1.4.3).
function srgbChannelToLinear(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const int = parseInt(hex.replace('#', ''), 16);
  const r = srgbChannelToLinear((int >> 16) & 255);
  const g = srgbChannelToLinear((int >> 8) & 255);
  const b = srgbChannelToLinear(int & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_TEXT_MIN = 4.5;
