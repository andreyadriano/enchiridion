// Resolved against this module's own URL rather than window.location.href,
// so js/generator/* can reference project-root files regardless of which
// page imported them or how deep it sits.
export const ROOT_URL = new URL('../../', import.meta.url).href;

export function rootUrl(path) {
  return new URL(path, ROOT_URL).href;
}
