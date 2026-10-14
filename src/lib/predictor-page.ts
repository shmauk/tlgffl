// The playoff predictor's page (#17, #36): a projection (src/lib/predictor.ts)
// as HTML, every choice a link to the URL it makes. Pure, shared by the build
// (the page as it stands, with no picks) and the browser.
import { BRACKET_NAMES } from './brackets';
import { esc } from './html';
import {
  predictorHref,
  sameSet,
  type PredictorData,
  type Projection,
  type RemainingGame,
  type Scenario,
  type Slot,
} from './predictor';
import type { FranchiseId, Mark } from './seeding';
import { franchiseUrl } from './urls';

const ELIMINATED: Mark[] = ['OUT', 'SHIT BOWL'];
/** Level groups this size or smaller can be ordered on the page (every order is a link). */
const ORDERABLE = 4;

const row = (label: string, body: string, sub = '') =>
  `<section class="row"><h2 class="lab">${label}${sub ? `<small>${sub}</small>` : ''}</h2><div class="con">${body}</div></section>`;

const permutations = (list: FranchiseId[]): FranchiseId[][] =>
  list.length <= 1 ? [list] : list.flatMap((f) => permutations(list.filter((g) => g !== f)).map((p) => [f, ...p]));

/**
 * The predictor's content: the stale-pick note, the standings as they would
 * stand, the scissors-paper-rock orders, the projected first rounds and the
 * games left to pick. marks is null while the clinch marks are worked out.
 * Every choice is a link to the URL it makes.
 */
export function renderPredictor(
  data: PredictorData,
  p: Projection,
  marks: Record<FranchiseId, Mark[]> | null,
  dropped: number,
): string {
  const franchise = new Map(data.franchises.map((f) => [f.id, f]));
  const team = (id: FranchiseId) => esc(franchise.get(id)?.teamName || franchise.get(id)?.name || String(id));
  const link = (id: FranchiseId) => {
    const f = franchise.get(id);
    const shown = f?.teamName || f?.name || String(id);
    return `<a class="fr" href="${franchiseUrl(id)}">${esc(shown)}</a>${f && shown !== f.name ? ` <span class="alias">(${esc(f.name)})</span>` : ''}`;
  };
  const href = (s: Scenario) => esc(predictorHref(data.season, s));
  const parts: string[] = [];

  if (dropped)
    parts.push(
      `<p class="stale">${dropped === 1 ? '1 pick was for a week' : `${dropped} picks were for weeks`} played since, and ${dropped === 1 ? 'was' : 'were'} dropped.</p>`,
    );

  // The standings, by division, sorted by seed.
  const order = new Map(p.places.map((x, i) => [x.franchise, i]));
  const placeOf = new Map(p.places.map((x) => [x.franchise, x]));
  const divisions = [...new Set(data.input.franchises.map((f) => f.division))].sort();
  const tables = divisions.map((d) => {
    const members = data.input.franchises
      .filter((f) => f.division === d)
      .map((f) => f.id)
      .sort((a, b) => order.get(a)! - order.get(b)!);
    const body = members
      .map((id, i) => {
        const x = placeOf.get(id)!;
        const cut = i > 0 && placeOf.get(members[i - 1])!.bracket !== x.bracket;
        const badges = (marks?.[id] ?? [])
          .map((m) => `<span class="bd ${ELIMINATED.includes(m) ? 'dep' : 'now'}">${m}</span>`)
          .join('');
        const [w, l, t] = p.records[id];
        return `<tr${cut ? ' class="cut"' : ''}><td>${link(id)}${badges}</td><td class="num">${w}-${l}-${t}</td><td class="num">${x.level.length ? '=' : ''}${x.seed}</td><td>${BRACKET_NAMES[x.bracket]}</td></tr>`;
      })
      .join('');
    return `<table class="t">${divisions.length > 1 ? `<caption>${esc(d)}</caption>` : ''}<thead><tr><th>Franchise</th><th class="num">W-L-T</th><th class="num">Seed</th><th>Bracket</th></tr></thead><tbody>${body}</tbody></table>`;
  });
  const notes = [
    'Picked games count as played: a win and a loss, with Breakdown at its real value. Unpicked games count as not played.',
    ...(p.groups.some((g) => !g.order) ? ['=: level after every tiebreak but scissors-paper-rock. Pick an order below.'] : []),
    marks === null
      ? 'Working out clinches…'
      : 'Marks hold whatever happens in the games not picked: BYE, DIVISION (a division winner’s seed) and PLAYOFFS are places won, SAFE means out of reach of the Shit Bowl, and OUT and SHIT BOWL are places lost.',
  ];
  parts.push(
    row(
      'Standings',
      `${tables.join('')}<div class="notes">${notes.map((n) => `<p><span class="g"></span>${n}</p>`).join('')}</div>`,
      'As they would stand',
    ),
  );

  // Scissors-paper-rock orders.
  if (p.groups.length) {
    const lines = p.groups.map((g) => {
      const names = g.members.map(team).join(' / ');
      if (g.members.length > ORDERABLE) return `<p>${names}: level after every tiebreak but scissors-paper-rock.</p>`;
      const others = p.scenario.spr.filter((r) => !sameSet(r, g.members));
      const options = permutations(g.members).map((perm) => {
        const chosen = g.order !== null && perm.every((f, i) => g.order![i] === f);
        const to = { ...p.scenario, spr: chosen ? others : [...others, perm] };
        return `<a class="pk" href="${href(to)}" aria-pressed="${chosen}">${perm.map(team).join(', ')}</a>`;
      });
      return `<p>${names}: ${options.join(' · ')}</p>`;
    });
    parts.push(
      row(
        'Scissors-paper-rock',
        `${lines.join('')}<div class="notes"><p><span class="g"></span>Who wins, in order: the winner takes the better place, and in the Shit Bowl the last takes the worse.</p></div>`,
      ),
    );
  }

  // The projected first rounds.
  const slot = (s: Slot) => `<span class="seed">${s.seed}</span> ${s.franchises.map(team).join(' / ')}`;
  const rounds = p.brackets.map((b) => {
    const items = [
      ...b.byes.map((s) => `<li>${slot(s)}: bye</li>`),
      ...b.pairs.map(([x, y]) => `<li>${slot(x)} v ${slot(y)}</li>`),
    ];
    return `<h3>${BRACKET_NAMES[b.bracket]}</h3><ul class="bracket">${items.join('')}</ul>`;
  });
  parts.push(
    row(
      'Brackets',
      `${rounds.join('')}<div class="notes"><p><span class="g"></span>The first round of each bracket. The Shit Bowl’s seed 1 is the worst franchise; the Mediocre Bowl is numbered on from the Playoffs.</p></div>`,
      'First round',
    ),
  );

  // The games left to pick.
  const picked = (week: number, f: FranchiseId) => p.scenario.picks.some((x) => x.week === week && x.winner === f);
  const weeks = [...new Set(data.input.remaining.map((g) => g.week))].sort((a, b) => a - b);
  const choice = (g: RemainingGame, f: FranchiseId) => {
    const other = g.home === f ? g.away : g.home;
    const on = picked(g.week, f);
    const rest = p.scenario.picks.filter((x) => !(x.week === g.week && (x.winner === f || x.winner === other)));
    const picks = on ? rest : [...rest, { week: g.week, winner: f }];
    return `<a class="pk" href="${href({ ...p.scenario, picks })}" aria-pressed="${on}">${team(f)}</a>`;
  };
  const games = weeks.map((w) => {
    const items = data.input.remaining
      .filter((g) => g.week === w)
      .map((g) => `<li>${choice(g, g.home)} v ${choice(g, g.away)}</li>`);
    return `<h3>Week ${w}</h3><ul class="games">${items.join('')}</ul>`;
  });
  const clear =
    p.scenario.picks.length || p.scenario.spr.length
      ? `<p><a class="more" href="${href({ picks: [], spr: [] })}">Clear every pick</a></p>`
      : '';
  parts.push(
    row(
      'Games left',
      `${games.join('')}${clear}<div class="notes"><p><span class="g"></span>Pick the winner of any game; pick it again to unpick it.</p></div>`,
      'Pick the winners',
    ),
  );

  return parts.join('');
}
