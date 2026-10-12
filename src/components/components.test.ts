// The shared components every page is built from (#21, design variant F in #15).
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, test } from 'vitest';
import Marker from './Marker.astro';
import Notes from './Notes.astro';
import Badge from './Badge.astro';
import SourceNote from './SourceNote.astro';
import Row from './Row.astro';
import BigFigure from './BigFigure.astro';
import Stats from './Stats.astro';
import FranchiseLink from './FranchiseLink.astro';
import SeasonLink from './SeasonLink.astro';
import AwardLink from './AwardLink.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = (component: any, props = {}, slots: Record<string, string> = {}) =>
  container.renderToString(component, { props, slots });

describe('footnote markers', () => {
  test('render the glyph as a red superscript with its explanation as a tooltip', async () => {
    const html = await render(Marker, { glyph: '†', title: 'Some games have no scores' });
    expect(html).toMatch(/<sup class="mk"[^>]*title="Some games have no scores"[^>]*>†<\/sup>/);
  });

  test('are explained in a notes block, one line per glyph, in the order given', async () => {
    const html = await render(Notes, {
      notes: [
        { glyph: '‡', text: 'Score lost.' },
        { glyph: '†', text: 'As NFL.com reported it.' },
      ],
    });
    expect(html).toMatch(
      /<div class="notes"[^>]*>\s*<p><span class="g">‡<\/span>Score lost\.<\/p>\s*<p><span class="g">†<\/span>As NFL\.com reported it\.<\/p>\s*<\/div>/,
    );
  });
});

describe('badges', () => {
  test('"this season" is red and bold, departed is grey', async () => {
    expect(await render(Badge, { kind: 'this-season' })).toMatch(/<span class="bd now"[^>]*>● This season<\/span>/);
    expect(await render(Badge, { kind: 'departed' })).toMatch(/<span class="bd dep"[^>]*>Departed<\/span>/);
  });

  test('a clinch mark is red, an elimination mark grey, both with the text given', async () => {
    expect(await render(Badge, { kind: 'clinch' }, { default: 'Playoffs' })).toMatch(
      /<span class="bd now"[^>]*>Playoffs<\/span>/,
    );
    expect(await render(Badge, { kind: 'eliminated' }, { default: 'Out' })).toMatch(
      /<span class="bd dep"[^>]*>Out<\/span>/,
    );
  });

  test('source notes: recalled is quiet, disputed is loud', async () => {
    expect(await render(SourceNote, { source: 'recalled' })).toMatch(
      /<span class="src"[^>]*title="From memory: no game record exists"[^>]*>recalled<\/span>/,
    );
    expect(await render(SourceNote, { source: 'disputed' })).toMatch(
      /<span class="src disp"[^>]*title="Counts for nobody until the league settles it"[^>]*>Disputed<\/span>/,
    );
    expect(await render(SourceNote, { source: 'derived' })).toBe('');
  });
});

describe('label-column grid', () => {
  test('a row puts an uppercase label and grey sub-label left of its content', async () => {
    const html = await render(Row, { label: 'Top ten', sub: 'Regular season' }, { default: '<table></table>' });
    expect(html).toMatch(
      /<section class="row"[^>]*>\s*<h2 class="lab"[^>]*>Top ten\s*<small>Regular season<\/small>\s*<\/h2>\s*<div class="con"[^>]*>\s*<table><\/table>\s*<\/div>\s*<\/section>/,
    );
  });

  test('a row without a sub-label has none', async () => {
    const html = await render(Row, { label: 'Career' }, { default: 'x' });
    expect(html).not.toContain('<small>');
  });
});

describe('site-wide links', () => {
  test('a franchise name links to its profile by id', async () => {
    expect(await render(FranchiseLink, { franchise: { id: 5, name: 'Beer Barons' } })).toMatch(
      /<a class="fr" href="\/franchises\/5\/"[^>]*>Beer Barons<\/a>/,
    );
  });

  test('a team name that differs from the franchise name links too, with the franchise name after it', async () => {
    const html = await render(FranchiseLink, { franchise: { id: 5, name: 'Beer Barons' }, teamName: 'Hop Heads' });
    expect(html).toMatch(/<a class="fr" href="\/franchises\/5\/"[^>]*>Hop Heads<\/a>\s*<span class="alias"[^>]*>\(Beer Barons\)<\/span>/);
    const same = await render(FranchiseLink, { franchise: { id: 5, name: 'Beer Barons' }, teamName: 'Beer Barons' });
    expect(same).not.toContain('alias');
  });

  test('a season links to its season page, or to a week on it', async () => {
    expect(await render(SeasonLink, { season: 2016 })).toMatch(/<a href="\/seasons\/2016\/"[^>]*>2016<\/a>/);
    expect(await render(SeasonLink, { season: 2016, week: 3 })).toMatch(
      /<a href="\/seasons\/2016\/#week-3"[^>]*>2016 week 3<\/a>/,
    );
    expect(await render(SeasonLink, { season: 2016 }, { default: 'the 2016 season' })).toMatch(
      /<a href="\/seasons\/2016\/"[^>]*>the 2016 season<\/a>/,
    );
  });

  test('an award name links to its award page', async () => {
    expect(await render(AwardLink, { award: { slug: 'pick-a-lane', name: 'Pick a Lane' } })).toMatch(
      /<a href="\/seasons\/awards\/pick-a-lane\/"[^>]*>Pick a Lane<\/a>/,
    );
  });
});

describe('figures', () => {
  test('the big figure is the record itself, in red', async () => {
    expect(await render(BigFigure, {}, { default: '1–12' })).toMatch(/<div class="huge"[^>]*>1–12<\/div>/);
  });

  test('big-number stats are figures over uppercase captions', async () => {
    const html = await render(Stats, {
      stats: [
        { label: 'Regular season', value: '102-87-1' },
        { label: 'Win %', value: '.540' },
      ],
    });
    expect(html).toMatch(
      /<dl class="kpis"[^>]*>\s*<div><dd>102-87-1<\/dd><dt>Regular season<\/dt><\/div>\s*<div><dd>\.540<\/dd><dt>Win %<\/dt><\/div>\s*<\/dl>/,
    );
  });
});
