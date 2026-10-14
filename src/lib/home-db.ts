// The current season (#35) from the league database: everything the home
// page shows. Which season is current, and its phase, the Python build decided
// (src/lib/current.ts). Build time only. Only final games have scores; the week being played comes from
// the pairings Sleeper has made, which never carry one.
import { bracketWinners, open, seasonFormats, seasonGames, seasonStandings, type SeasonFranchise } from './db';
import { awardLeaders, awardValue, awards, awardWinners } from './awards';
import { bracketColumns, type BracketSpec, type Pairing, type PlayedGame } from './bracket-columns';
import { buildDate, current } from './current';
import { BRACKET_ORDER, type BracketKey } from './brackets';
import type { HomeData, Matchup, Result } from './home';
import { predictorSeason } from './predictor-db';
import { siteDb } from './records/site';
import { figureText, holders, recordsThisSeason } from './records/held';
import { seasonPicture } from './seeding-db';
import { predictorUrl } from './urls';
import { placeOpeningPairings, type UpcomingPairing } from './seeding';

const ukDate = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(ms),
  );

/** Every franchise of the season by id, with the team name it played under. */
function seasonNames(season: number): Record<number, SeasonFranchise> {
  const rows = open()
    .prepare(
      `select f.id, f.name, t.team_name as teamName from team_names t join franchises f on f.id = t.franchise_id
       where t.season = ?`,
    )
    .all(season) as unknown as SeasonFranchise[];
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

/**
 * The bracket-week pairings still to play in a week, as the build placed them
 * (recordbook/sleeper.py), with a bracket's opening-week pairings placed by
 * seed (the seeding module, ADR 0005). Filler is left out.
 */
function bracketPairings(season: number, week: number, specs: BracketSpec[]): Pairing[] {
  const picture = seasonPicture(season);
  if (!picture) return [];
  const rows = open()
    .prepare(
      `select week, home_franchise_id as home, away_franchise_id as away, bracket, round
       from upcoming_bracket_pairings where season = ? and week = ? order by rowid`,
    )
    .all(season, week) as unknown as UpcomingPairing[];
  return placeOpeningPairings(rows, picture.places, specs);
}

/** A season's brackets as specs, its final bracket games, and all its games. */
function bracketsOf(season: number) {
  const format = seasonFormats().find((f) => f.season === season)!;
  const specs: BracketSpec[] = BRACKET_ORDER.flatMap((key) => {
    const b = format.brackets.find((x) => x.bracket === key);
    return b ? [{ bracket: key, firstWeek: b.firstWeek, lastWeek: b.lastWeek, series: b.series }] : [];
  });
  const games = seasonGames(season);
  const played: PlayedGame[] = games
    .filter((g) => g.phase === 'bracket')
    .map((g) => ({
      bracket: g.bracket!, week: g.week, round: g.round!, home: g.home.id, away: g.away.id,
      homePoints: g.homePoints, awayPoints: g.awayPoints, winner: g.winnerId,
    }));
  return { specs, played, games };
}

/**
 * The current season's weeks still to come (#35), each with its matchups and
 * never a score: the regular-season pairings left and, once the brackets are
 * on, the bracket pairings of the week being played. Empty for any other season.
 */
export function inProgressWeeks(season: number): Map<number, Matchup[]> {
  const now = current();
  const out = new Map<number, Matchup[]>();
  if (!now || now.season !== season || now.phase === 'off-season') return out;
  const names = seasonNames(season);
  const add = (week: number, m: Matchup) => out.set(week, [...(out.get(week) ?? []), m]);
  const upcoming = open()
    .prepare('select week, home_franchise_id as h, away_franchise_id as a from upcoming_games where season = ? order by week, rowid')
    .all(season) as { week: number; h: number; a: number }[];
  for (const r of upcoming) add(r.week, { bracket: null, home: names[r.h], away: names[r.a] });
  if (now.phase === 'brackets' && now.playing !== null) {
    const { specs } = bracketsOf(season);
    for (const p of bracketPairings(season, now.playing, specs))
      add(p.week, { bracket: p.bracket, home: names[p.home], away: names[p.away] });
  }
  return out;
}

/** The home page's content on the build date, or null if no season has started. */
export function homeData(): HomeData | null {
  const now = current();
  if (!now) return null;
  const { season, phase, through, playing } = now;
  const names = seasonNames(season);
  const { specs, played, games } = bracketsOf(season);

  let thisWeek: Matchup[] = [];
  let placed: Pairing[] = [];
  if (playing !== null && phase === 'regular') {
    thisWeek = (
      open()
        .prepare('select home_franchise_id as h, away_franchise_id as a from upcoming_games where season = ? and week = ? order by rowid')
        .all(season, playing) as { h: number; a: number }[]
    ).map((r) => ({ bracket: null, home: names[r.h], away: names[r.a] }));
  } else if (playing !== null && phase === 'brackets') {
    placed = bracketPairings(season, playing, specs);
    thisWeek = placed.map((p) => ({ bracket: p.bracket, home: names[p.home], away: names[p.away] }));
  }

  const lastGames = games.filter((g) => g.week === through && g.homePoints !== null);
  const results: Result[] = lastGames.map((g) => ({
    bracket: g.bracket, home: g.home, away: g.away, homePoints: g.homePoints!, awayPoints: g.awayPoints!, winnerId: g.winnerId,
  }));
  const scores = results
    .flatMap((r) => [{ franchise: r.home, points: r.homePoints }, { franchise: r.away, points: r.awayPoints }])
    .sort((a, b) => b.points - a.points);

  let picture: HomeData['picture'] = null;
  if (phase === 'regular') {
    const seeds = seasonPicture(season);
    const lines = new Map(seasonStandings(season).map((s) => [s.franchise.id, s]));
    picture = (seeds?.places ?? []).flatMap((p) => {
      const s = lines.get(p.franchise);
      if (!s) return [];
      const n = (s.breakdownWins ?? 0) + (s.breakdownLosses ?? 0) + (s.breakdownTies ?? 0);
      return [{
        franchise: s.franchise, bracket: p.bracket, seed: p.seed, shared: p.shared,
        wins: s.wins, losses: s.losses, ties: s.ties,
        breakdown: s.breakdownWins === null || !n ? null : (s.breakdownWins + s.breakdownTies! / 2) / n,
        marks: seeds!.marks[p.franchise] ?? [],
      }];
    });
  }

  const winners = bracketWinners(season);
  const crownOf = (key: BracketKey) => {
    const w = winners.filter((x) => x.bracket === key && x.franchise);
    return w.length === 1 ? w[0].franchise : null;
  };
  const places = phase === 'brackets' ? (seasonPicture(season)?.places ?? []) : [];
  const brackets: HomeData['brackets'] =
    phase === 'brackets'
      ? specs.map((spec) => ({
          key: spec.bracket,
          columns: bracketColumns(spec, places, played, placed),
          winner: crownOf(spec.bracket),
        }))
      : [];

  const list = awards();
  const awarded = phase === 'regular' ? awardLeaders(season) : awardWinners({ season });
  const awardLines = list
    .map((award) => ({ award, won: awarded.filter((w) => w.award === award.slug) }))
    .filter((a) => a.won.length)
    .map(({ award, won }) => ({
      award: { slug: award.slug, name: award.name },
      franchises: won.map((w) => w.franchise),
      value: awardValue(award.unit, won[0].value),
    }));

  const records = recordsThisSeason(siteDb).map((h) => ({
    record: { slug: h.def.slug, name: h.def.name },
    rank: h.rank,
    franchises: holders(h.def, h.entry).map((f) => ({ id: f.id, name: f.name })),
    figure: figureText(h.def, h.entry.value),
  }));

  const predictor = predictorSeason();
  return {
    season,
    phase,
    through,
    playing,
    updated: buildDate().text,
    names,
    thisWeek,
    lastWeek: results.length ? { results, highest: scores[0] ?? null, lowest: scores.at(-1) ?? null } : null,
    picture,
    brackets,
    awards: awardLines,
    records,
    honours:
      phase === 'off-season'
        ? { playoffs: crownOf('playoffs'), shit_bowl: crownOf('shit_bowl'), mediocre_bowl: crownOf('mediocre_bowl') }
        : null,
    next: now.next ? { season: now.next.season, draft: now.next.draftStart === null ? null : ukDate(now.next.draftStart) } : null,
    predictor: predictor === season ? predictorUrl(season) : null,
  };
}
