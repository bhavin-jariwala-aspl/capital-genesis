/**
 * The workspace's public pages: what clients and website visitors see without
 * signing in to the CRM. One list, so the Web forms page, the slug-less
 * shortcuts (/site, /portal) and the staff preview bar all agree on the names.
 */
export const PUBLIC_PAGES = [
  {
    key: 'site',
    label: 'Website preview',
    description: 'What your public website shows straight from the CRM: rates, fund prices, products and forms.',
    audience: 'Anyone with the link — no sign-in.',
  },
  {
    key: 'portal',
    label: 'Client & introducer portal',
    description: 'Where clients and introducers sign in with their email to see their records, documents and requests.',
    audience: 'Clients and introducers — they sign in with a one-time code, not a CRM account.',
  },
];

export const publicPage = (key) => PUBLIC_PAGES.find((p) => p.key === key);
export const publicPath = (key, slug) => `/${key}/${slug}`;
export const publicUrl = (key, slug) => `${window.location.origin}${publicPath(key, slug)}`;
