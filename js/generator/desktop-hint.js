// First-visit "this works better on a bigger screen" nudge, shown at most
// once ever per browser.
const DISMISSED_KEY = 'generator-desktop-hint-dismissed';

const modal = document.getElementById('desktop-hint');
const okButton = document.getElementById('desktop-hint-ok');
const backdrop = modal.querySelector('.generator-modal-backdrop');

function dismiss() {
  localStorage.setItem(DISMISSED_KEY, '1');
  modal.hidden = true;
  document.removeEventListener('keydown', onKeydown);
}

function onKeydown(e) {
  if (e.key === 'Escape') dismiss();
}

okButton.addEventListener('click', dismiss);
backdrop.addEventListener('click', dismiss);

// A wide-but-touch tablet still counts as "small" here.
const looksSmall = window.innerWidth < 1024 || window.matchMedia('(pointer: coarse)').matches;

if (!localStorage.getItem(DISMISSED_KEY) && looksSmall) {
  modal.hidden = false;
  document.addEventListener('keydown', onKeydown);
  okButton.focus();
}
