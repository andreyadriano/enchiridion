// Powers layout 5 (continuous scroll): as the visitor scrolls through the
// whole manual (composed by js/continuous-manual.js), highlights whichever
// chapter/submenu is currently in view directly in the main nav tree.
//
// Deliberately NOT based on IntersectionObserver "is this heading's own
// slice of the page intersecting a band" — that leaves a gap with nothing
// active whenever a section's heading has scrolled past the band but its
// content still fills the viewport (the band never touches the *next*
// heading until it arrives). Instead: a heading counts as "reached" once it
// scrolls above a fixed trigger line near the top of the viewport, and the
// active link is always the last heading that was reached — so exactly one
// link is active at every scroll position, with no gaps.
import { flattenNav } from './nav-config.js';

const TRIGGER_LINE = 96; // px from the top of the viewport

let cleanup = null;

export function initNavScrollspy(navRoot, nav) {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }

  const linkByHeadingId = {};
  const headings = [];
  for (const item of flattenNav(nav)) {
    const heading = document.getElementById(item.id);
    const link = navRoot.querySelector(`a[href="#${item.id}"]`);
    if (heading && link) {
      headings.push(heading);
      linkByHeadingId[item.id] = link;
    }
  }
  if (!headings.length) return;

  let activeLink = null;
  let ticking = false;

  function setActive(link) {
    if (link === activeLink) return;
    if (activeLink) {
      activeLink.classList.remove('is-active');
      activeLink.removeAttribute('aria-current');
    }
    if (link) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'true');
    }
    activeLink = link;
  }

  function update() {
    ticking = false;
    // Headings are in document order, so the active one is the last whose
    // top has already scrolled past the trigger line; once we hit one that
    // hasn't, none further down have either.
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= TRIGGER_LINE) {
        current = heading;
      } else {
        break;
      }
    }
    setActive(linkByHeadingId[current.id]);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  cleanup = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}
