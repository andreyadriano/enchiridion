// Small "made by" credit for the generator TOOL's own pages only — never a
// generated manual, which keeps its own separate partials/footer.html.
export function renderSiteFooter(root = document.body) {
  const footer = document.createElement('footer');
  footer.className = 'site-credit';
  footer.innerHTML = `<span data-i18n="generator.credit">made by Andrey</span> · <a href="https://andreyrosa.dev" target="_blank" rel="noopener noreferrer">andreyrosa.dev</a>`;
  root.appendChild(footer);
}
