/**
 * Which navigation link is "current" for a given pathname.
 *
 * ── The bug this exists to prevent ──────────────────────────────────────────
 * The sidebar decided this inline, per link:
 *
 *     const isActive = (to) => pathname === to || pathname.startsWith(to + '/');
 *
 * That is right for a link whose children are its own detail pages
 * (`/reports` should stay lit on `/reports/42`), and wrong the moment a section
 * has an index route that is also the prefix of its siblings. `/platform` is
 * the prefix of `/platform/tenants`, `/platform/plans` and every other console
 * page, so *Dashboard* matched on every one of them: it was permanently
 * highlighted, and on `/platform/tenants` two links appeared current at once.
 *
 * The fix is to decide against the whole link set rather than one link at a
 * time: a link is current when it matches the path, and no *longer* link in the
 * same set matches it better. That is the standard "most specific route wins"
 * rule — the same thing React Router's `end` prop expresses per link, done once
 * for the group so adding a nested route cannot silently light up its parent.
 */

/** Normalise away a trailing slash so `/platform/` and `/platform` agree. */
function normalise(path) {
  const value = String(path ?? '');
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

/**
 * Does `pathname` sit at or under `to`?
 * Segment-aware, so `/report` is not a prefix match for `/reports`.
 */
export function matchesPath(pathname, to) {
  const path = normalise(pathname);
  const link = normalise(to);
  if (link === '/') return path === '/';
  return path === link || path.startsWith(`${link}/`);
}

/**
 * The most specific link in `links` that `pathname` matches, or null.
 *
 * "Most specific" is the longest matching `to`, so `/platform/tenants` beats
 * `/platform` and only one link is ever current.
 *
 * @param {string} pathname
 * @param {Array<string|{to: string}>} links
 * @returns {string|null} the winning `to`
 */
export function activeLink(pathname, links) {
  let best = null;
  for (const entry of links) {
    const to = typeof entry === 'string' ? entry : entry?.to;
    if (!to || !matchesPath(pathname, to)) continue;
    if (best === null || normalise(to).length > normalise(best).length) best = to;
  }
  return best;
}

/**
 * Build an `isActive(to)` predicate for one group of links.
 *
 * Pass every link in the group — that is what lets it tell an index route from
 * its siblings. Links outside the group are matched on their own, so a lone
 * link (`/settings`) keeps prefix behaviour and stays lit on its detail pages.
 *
 * @param {string} pathname
 * @param {Array<string|{to: string}>} links every link in the group
 * @returns {(to: string) => boolean}
 */
export function makeIsActive(pathname, links) {
  const winner = activeLink(pathname, links);
  return (to) => (winner === null ? matchesPath(pathname, to) : normalise(winner) === normalise(to));
}
