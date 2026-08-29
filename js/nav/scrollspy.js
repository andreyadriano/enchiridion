// Powers 'scroll' layout: highlights whichever chapter/submenu is
// currently in view in the main nav tree. Deliberately not
// IntersectionObserver-based — "is this heading's own slice intersecting a
// band" leaves a gap whenever a heading has scrolled past the band but its
// content still fills the viewport. Instead, a heading counts as "reached"
// once it scrolls above a fixed trigger line, and the active link is always
// the last one reached — exactly one active link at every scroll position.
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
