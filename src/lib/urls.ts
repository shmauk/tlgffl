// The site's URL scheme (decided in #14), in one place. Pages link through the
// components in src/components/, which build their hrefs here.
import { DEFAULT_QUERY, encodeQuery, type Query } from './statsguru/query';

export const franchiseUrl = (id: number) => `/franchises/${id}/`;
export const seasonUrl = (season: number, week?: number) =>
  `/seasons/${season}/${week === undefined ? '' : `#week-${week}`}`;
export const awardUrl = (slug: string) => `/seasons/awards/${slug}/`;
/** A prefilled Statsguru query: `{ franchises: [5], opponents: [9] }` -> /statsguru/?f=5&opp=9 */
export const statsguruUrl = (query: Partial<Query> = {}) => {
  const search = encodeQuery({ ...DEFAULT_QUERY, ...query });
  return `/statsguru/${search ? `?${search}` : ''}`;
};

/** The menu, after the site name (which links home). */
export const MENU = [
  { href: '/records/', label: 'Records' },
  { href: '/franchises/', label: 'Franchises' },
  { href: '/seasons/', label: 'Seasons' },
  { href: '/statsguru/', label: 'Statsguru' },
  { href: '/league/', label: 'League' },
] as const;
