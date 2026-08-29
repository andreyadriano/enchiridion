import { rootUrl } from './paths.js';

// Stashes the in-memory custom theme into sessionStorage before opening
// print.html (?generatorPreview=1), so js/print/print-builder.js can build the
// same custom manual instead of falling back to the plain generic brand.
export function openCustomPdf(doc, payload) {
  const langSelect = doc.getElementById('lang-selector');
  sessionStorage.setItem('generator-preview-override', JSON.stringify(payload));
  const url = new URL(rootUrl('print.html'));
  url.searchParams.set('generatorPreview', '1');
  url.searchParams.set('brand', 'generic');
  url.searchParams.set('lang', langSelect ? langSelect.value : 'en');
  url.searchParams.set('autoprint', '1');
  window.open(url.href, '_blank');
}

// Attached in the CAPTURE phase on the document itself (not the button),
// so it runs and can stopPropagation() BEFORE js/core/page-init.js's own
// bubble-phase click handler on that same element gets a chance to
// window.open() the plain, override-less URL first.
export function interceptPdfLinks(doc, buildPayload) {
  doc.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest && e.target.closest('#pdf-download-button, [data-pdf-link]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      openCustomPdf(doc, buildPayload());
    },
    { capture: true }
  );
}
