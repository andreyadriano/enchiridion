import { buildSearchIndex, searchIndex } from './search.js';

// Full-manual search (js/content/search.js) — searches every page's actual content,
// not just whichever menu/submenu is currently open, and works the same
// way in all 4 layouts.
export function initSearchUI({ nav, state, getTranslations, softNavigateTo }) {
  const searchInput = document.getElementById('search-input');
  const searchResultsEl = document.getElementById('search-results');
  const searchStatusEl = document.getElementById('search-status');
  if (!searchInput || !searchResultsEl) return;

  let searchDebounce = null;

  function closeSearchResults() {
    searchResultsEl.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
  }

  function buildResultLink(result) {
    const a = document.createElement('a');
    a.className = 'search-result';
    a.setAttribute('role', 'option');
    a.href = result.url + (result.anchor ? `#${result.anchor}` : '');

    const pageLabel = document.createElement('span');
    pageLabel.className = 'search-result-page';
    pageLabel.textContent = result.pageTitle;
    a.appendChild(pageLabel);

    if (result.heading !== result.pageTitle) {
      const headingLabel = document.createElement('span');
      headingLabel.className = 'search-result-heading';
      headingLabel.textContent = result.heading;
      a.appendChild(headingLabel);
    }

    if (result.snippet) {
      const snippet = document.createElement('span');
      snippet.className = 'search-result-snippet';
      snippet.textContent = result.snippet;
      a.appendChild(snippet);
    }

    a.addEventListener('click', (e) => {
      e.preventDefault();
      closeSearchResults();
      searchInput.value = '';
      if (state.layout === 'scroll') {
        // The whole manual is already composed on this one page — just
        // scroll to the matched heading, no navigation needed.
        const target = document.getElementById(result.anchor || result.pageId);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      } else {
        softNavigateTo(new URL(a.href), { push: true, hash: result.anchor ? `#${result.anchor}` : '' });
      }
    });
    return a;
  }

  function announceResultCount(count) {
    if (!searchStatusEl) return;
    const t = getTranslations() || {};
    searchStatusEl.textContent = count > 0 ? `${count} ${t['search.resultsFound'] || 'results found'}` : t['search.noResults'] || 'No results found.';
  }

  function renderSearchResults(results, hasQuery) {
    searchResultsEl.innerHTML = '';
    if (!hasQuery) {
      searchResultsEl.hidden = true;
      searchInput.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = (getTranslations() || {})['search.noResults'] || 'No results found.';
      searchResultsEl.appendChild(empty);
      searchResultsEl.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
      announceResultCount(0);
      return;
    }
    for (const result of results) searchResultsEl.appendChild(buildResultLink(result));
    searchResultsEl.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    announceResultCount(results.length);
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const query = searchInput.value;
    searchDebounce = setTimeout(async () => {
      const records = await buildSearchIndex(nav, state.lang);
      renderSearchResults(searchIndex(records, query), query.trim().length > 0);
    }, 150);
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() && searchResultsEl.childElementCount) {
      searchResultsEl.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
    }
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      closeSearchResults();
      searchInput.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-control')) closeSearchResults();
  });

  // Warmed in the background now (not awaited — a visitor who never
  // searches shouldn't wait on it) so the first keystroke usually already
  // has a resolved index to search instead of waiting on a fetch per page.
  buildSearchIndex(nav, state.lang);
}
