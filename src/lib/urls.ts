// The site's URL scheme (decided in #14), in one place. Pages link through the
// components in src/components/, which build their hrefs here.
import { DEFAULT_QUERY, encodeQuery, type Query } from './statsguru/query';

export const HOME_URL = '/';
export const SEASONS_URL = '/seasons/';
/** Every award (#33). */
export const AWARDS_URL = '/seasons/awards/';
export const franchiseUrl = (id: number) => `/franchises/${id}/`;
export const seasonUrl = (season: number, week?: number) =>
  `/seasons/${season}/${week === undefined ? '' : `#week-${week}`}`;
/** The playoff predictor (#36): only the current season's, during its regular season (see predictorSeason()). */
export const predictorUrl = (season: number) => `/seasons/${season}/predictor/`;
/** A pair page always puts the lower franchise id first (#14). */
export const headToHeadUrl = (a: number, b: number) => `/head-to-head/${Math.min(a, b)}-${Math.max(a, b)}/`;
/** A record's own page, or one of its pre-rendered era and phase variants (#14). */
export const recordUrl = (slug: string, variant?: { era: string; phase: string }) =>
  `/records/${slug}/${variant ? `${variant.era}/${variant.phase}/` : ''}`;
export const awardUrl = (slug: string) => `${AWARDS_URL}${slug}/`;
/** The league database file Statsguru loads (ADR 0002). */
export const dataFileUrl = (name: string) => `/data/${name}`;
/** A prefilled Statsguru query: `{ franchises: [5], opponents: [9] }` -> /statsguru/?f=5&opp=9 */
export const statsguruUrl = (query: Partial<Query> = {}) => {
  const search = encodeQuery({ ...DEFAULT_QUERY, ...query });
  return `/statsguru/${search ? `?${search}` : ''}`;
};
/** There are no NFL-player pages (#14): an NFL player links to their Statsguru query. */
export const nflPlayerUrl = (id: string) => statsguruUrl({ subject: 'player', players: [id] });
/** An NFL player's name, or what is shown when no Sleeper snapshot knows them. */
export const nflPlayerName = (player: { id: string; name: string | null }) =>
  player.name ?? `Unknown NFL player (Sleeper id ${player.id})`;

/** Where a reader reports a mistake (#19, #39): the repo's new-issue page, with its templates. */
export const NEW_ISSUE_URL = 'https://github.com/shmauk/tlgffl/issues/new/choose';

/** The menu, after the site name (which links home). */
export const MENU = [
  { href: '/records/', label: 'Records' },
  { href: '/franchises/', label: 'Franchises' },
  { href: SEASONS_URL, label: 'Seasons' },
  { href: '/statsguru/', label: 'Statsguru' },
  { href: '/league/', label: 'League' },
] as const;
