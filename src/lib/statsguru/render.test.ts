import { describe, expect, test } from 'vitest';
import type { GameRow, GapRow, GroupRow, PerformanceRow, PlayerRow, PositionRow, QueryResult } from './engine';
import { DEFAULT_QUERY, type Query } from './query';
import { renderResults, summary } from './render';

const SERP = { id: 8, name: 'SERPION' };
const CATS = { id: 17, name: 'Not Enough Cooks' };
const CTX = { franchises: [SERP, CATS], seasons: [2012, 2013, 2014, 2015] };
const q = (patch: Partial<Query>): Query => ({ ...DEFAULT_QUERY, ...patch });

const group = (patch: Partial<GroupRow>): GroupRow => ({
  kind: 'group', franchise: SERP, season: null, opponent: null, phase: null,
  gp: 14, w: 12, l: 2, t: 0, pct: 12 / 14, pf: 1464.98, pa: 1258.82, apf: 104.64, apa: 89.92, hi: 138.02, lo: 65.84,
  reported: false, lostScores: 0, partialHighs: false, unchecked: 0, ...patch,
});
const html = (rows: QueryResult['rows'], query = q({}), notes: QueryResult['notes'] = []) =>
  renderResults({ rows, notes }, query);
const cells = (out: string) => [...out.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
const marks = (cell: string) => [...cell.matchAll(/<sup class="mk"[^>]*>(.)<\/sup>/g)].map((m) => m[1]);

describe('the one-line query summary', () => {
  test('says what is counted, in words', () => {
    expect(summary(q({}), CTX)).toBe('All franchises · all seasons · regular season · totals per franchise');
    expect(
      summary(q({ franchises: [8], opponents: [17], seasons: [2012, 2013], phases: ['R', 'P'], weeks: [1, 9], result: 'W', active: true, minGames: 5, view: 'games' }), CTX),
    ).toBe(
      'SERPION · v Not Enough Cooks · seasons 2012–2013 · regular season and Playoffs · weeks 1–9 · won · active franchises only · at least 5 games · game log',
    );
  });
});

describe('the results table', () => {
  test('every column header sorts, the sorted one again flips the order', () => {
    const out = html([group({})], q({ view: 'season' }));
    const heads = [...out.matchAll(/<th[^>]*><a href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(heads).toHaveLength(13);
    // Names sort A-Z first, figures highest first.
    expect(heads[0]).toBe('?view=season&sort=f.asc');
    expect(heads[1]).toBe('?view=season&sort=s.desc');
    expect(heads[6]).toBe('?view=season&sort=pct.desc');
    expect(out).toMatch(/<th class="[^"]*sorted[^"]*"[^>]*><a href="\?view=season&amp;sort=s.desc"/);
  });

  test('rows link to franchise pages and season pages', () => {
    const out = html([group({ season: 2015 })], q({ view: 'season' }));
    expect(out).toContain('<a class="fr" href="/franchises/8/">SERPION</a>');
    expect(out).toContain('<a href="/seasons/2015/">2015</a>');
    const game: GameRow = {
      kind: 'game', season: 2015, week: 3, phase: 'R', franchise: SERP, opponent: CATS, pf: 100, pa: 90.5, result: 'W', margin: 9.5,
    };
    const log = html([game], q({ view: 'games' }));
    expect(log).toContain('<a href="/seasons/2015/#week-3">3</a>');
    expect(log).toContain('<a class="fr" href="/franchises/17/">Not Enough Cooks</a>');
    expect(cells(log)).toContain('+9.50');
  });

  test('a row with nothing to show says so', () => {
    expect(html([])).toMatch(/No games match the query/);
  });
});

describe('gap markers', () => {
  test('† on points when reported totals are included, * on high and low', () => {
    const c = cells(html([group({ reported: true, partialHighs: true })]));
    expect(c.map(marks)).toEqual([[], [], [], [], [], [], ['†'], ['†'], ['†'], ['†'], ['*'], ['*']]);
  });

  test('‡ on points when scores are lost, § on games played when games are left out', () => {
    const c = cells(html([group({ lostScores: 2, unchecked: 5, partialHighs: true })]));
    expect(c.map(marks)).toEqual([[], ['§'], [], [], [], [], ['‡'], ['‡'], ['‡'], ['‡'], ['*'], ['*']]);
  });

  test('no markers on a fully scored row, and no notes', () => {
    const out = html([group({})]);
    expect(marks(out)).toEqual([]);
    expect(out).not.toContain('class="notes"');
  });

  test('the notes explain only the markers used, then the query-level notes', () => {
    const out = html([group({ reported: true, partialHighs: true })], q({ phases: ['C'] }), [
      { kind: 'unrecorded', seasons: [2022, 2023, 2024] },
      { kind: 'mixed' },
    ]);
    const notes = out.split('class="notes"')[1];
    expect([...notes.matchAll(/<span class="g">(.?)<\/span>/g)].map((m) => m[1])).toEqual(['†', '*', '', '']);
    expect(notes).toMatch(/2022–2024/);
    expect(notes).toMatch(/Shit Bowl and Mediocre Bowl/);
  });

  test('a game log marks lost scores ‡, reported weeks † and games left out §', () => {
    const lost: GameRow = {
      kind: 'game', season: 2022, week: 16, phase: 'P', franchise: SERP, opponent: CATS, pf: null, pa: null, result: 'W', margin: null,
    };
    const gap = (kind: GapRow['kind']): GapRow => ({
      kind, season: 2022, weeks: [10, 11, 12, 13, 14], phase: 'R', franchise: SERP, gp: 5,
      w: kind === 'reported' ? 5 : null, l: kind === 'reported' ? 0 : null, t: kind === 'reported' ? 0 : null,
      pf: kind === 'reported' ? 500 : null, pa: kind === 'reported' ? 400 : null,
    });
    const out = html([lost, gap('reported'), gap('unchecked')], q({ view: 'games' }));
    const rows = out.split('<tr').slice(2);
    expect(marks(rows[0])).toEqual(['‡', '‡']);
    expect(rows[1]).toMatch(/weeks 10–14/);
    expect(rows[1]).toMatch(/5-0-0/);
    expect(marks(rows[1])).toEqual(['†']);
    expect(marks(rows[2])).toEqual(['§']);
  });
});

const ALLEN = { id: '4984', name: 'Josh Allen', position: 'QB' };
const UNKNOWN = { id: '999', name: null, position: null };
const position = (patch: Partial<PositionRow>): PositionRow => ({
  kind: 'position', franchise: SERP, pos: 'QB', gp: 14, st: 14, spts: 231.36, ppg: 16.53, avg: 16.53,
  share: 0.18355, rank: 13, bpts: 0, best: 29.36, ...patch,
});
const player = (patch: Partial<PlayerRow>): PlayerRow => ({
  kind: 'player', player: ALLEN, franchise: null, season: null,
  ro: 14, st: 13, spts: 310.02, avg: 23.85, bpts: 0, best: 42.68, nfr: 1, ...patch,
});
const LINEUPS = [{ kind: 'lineups' }] as QueryResult['notes'];

describe('the by-position view', () => {
  test('one row per franchise and position, with its share as a percentage and its league rank', () => {
    const out = html([position({})], q({ view: 'pos' }), LINEUPS);
    expect(cells(out).map((c) => c.replace(/<[^>]+>/g, ''))).toEqual([
      'SERPION', 'QB', '14', '14', '231.36', '16.53', '16.53', '18.4', '13', '0.00', '29.36',
    ]);
    expect(out).toMatch(/<th[^>]*><a[^>]*>Position/);
  });

  test('grouped by lineup slot, the column says so; FLEX has no bench', () => {
    const out = html([position({ pos: 'FLEX', bpts: null })], q({ view: 'pos', grouping: 'slot' }), LINEUPS);
    expect(out).toMatch(/<th[^>]*><a[^>]*>Slot/);
    expect(cells(out)[9]).toBe('');
  });

  test('NFL players of unknown position are a row of their own', () => {
    expect(cells(html([position({ pos: null })], q({ view: 'pos' }), LINEUPS))[1]).toBe('Unknown');
  });
});

describe('the NFL-player subject', () => {
  const pq = (patch: Partial<Query>) => q({ subject: 'player', ...patch });

  test('NFL players link to their own query; one no snapshot knows says so', () => {
    const out = html([player({}), player({ player: UNKNOWN })], pq({}), LINEUPS);
    expect(out).toContain('<a class="pl" href="/statsguru/?sub=player&amp;p=4984">Josh Allen</a>');
    expect(out).toContain('<a class="pl" href="/statsguru/?sub=player&amp;p=999">Unknown NFL player (Sleeper id 999)</a>');
    expect(cells(out).slice(0, 9).map((c) => c.replace(/<[^>]+>/g, ''))).toEqual([
      'Josh Allen', 'QB', '14', '13', '310.02', '23.85', '0.00', '42.68', '1',
    ]);
  });

  test('every column header sorts, within the subject', () => {
    const out = html([player({})], pq({ view: 'fr' }), LINEUPS);
    const heads = [...out.matchAll(/<th[^>]*><a href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(heads[0]).toBe('?sub=player&view=fr&sort=pl.asc');
    expect(heads).toContain('?sub=player&view=fr&sort=best.desc');
  });

  test('a performance log line', () => {
    const line: PerformanceRow = {
      kind: 'performance', season: 2025, week: 5, phase: 'R', player: ALLEN, franchise: SERP, opponent: CATS,
      slot: 'BN', starter: false, points: 20.1,
    };
    const c = cells(html([line], pq({ view: 'log' }), LINEUPS)).map((x) => x.replace(/<[^>]+>/g, ''));
    expect(c).toEqual(['2025', '5', 'Regular season', 'Josh Allen', 'QB', 'SERPION', 'Not Enough Cooks', 'Bench', '20.10']);
  });

  test('the summary says what is counted, in words', () => {
    expect(summary(pq({}), CTX)).toBe('NFL players · all seasons · regular season · totals per NFL player');
    expect(
      summary(pq({ players: ['4984'], positions: ['QB', 'WR'], lineup: 'start', franchises: [8], opponents: [17], minGames: 3, view: 'fr' }), {
        ...CTX,
        players: [ALLEN],
      }),
    ).toBe('Josh Allen · QB, WR · started · rostered by SERPION · v Not Enough Cooks · all seasons · regular season · at least 3 games rostered · per NFL player per franchise');
  });
});

describe('lineups only exist from 2025 (¶)', () => {
  test('every lineup query carries ¶, explained in the notes', () => {
    const out = html([player({})], q({ subject: 'player' }), LINEUPS);
    expect(marks(out.split('class="notes"')[0])).toContain('¶');
    expect(out.split('class="notes"')[1]).toMatch(/<span class="g">¶<\/span>[^<]*2025/);
  });

  test('an NFL.com-era scope explains itself rather than showing an empty table', () => {
    const out = html([], q({ subject: 'player', seasons: [2015] }), [{ kind: 'beforeLineups', firstSeason: 2025 }]);
    expect(out).not.toContain('<table');
    expect(out).toMatch(/NFL player data starts in 2025/);
  });
});
