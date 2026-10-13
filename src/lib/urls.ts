// The site's URL scheme (decided in #14), in one place. Pages link through the
// components in src/components/, which build their hrefs here.

export const franchiseUrl = (id: number) => `/franchises/${id}/`;
export const seasonUrl = (season: number, week?: number) =>
  `/seasons/${season}/${week === undefined ? '' : `#week-${week}`}`;
/** A pair page always puts the lower franchise id first (#14). */
export const headToHeadUrl = (a: number, b: number) => `/head-to-head/${Math.min(a, b)}-${Math.max(a, b)}/`;
export const awardUrl = (slug: string) => `/seasons/awards/${slug}/`;

/** The menu, after the site name (which links home). */
export const MENU = [
  { href: '/records/', label: 'Records' },
  { href: '/franchises/', label: 'Franchises' },
  { href: '/seasons/', label: 'Seasons' },
  { href: '/statsguru/', label: 'Statsguru' },
  { href: '/league/', label: 'League' },
] as const;
