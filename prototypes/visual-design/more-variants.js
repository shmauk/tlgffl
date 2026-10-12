// =====================================================================
// Shared fragments for variants D–I (each variant arranges them its own way)
// =====================================================================
const tbl = (cols, rows, rc = () => '') => `<table class="t"><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.sorted ? 'sorted' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr class="${rc(r)}">${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const rowCls = r => `${r.now ? 'now' : ''} ${r.dep ? 'dep' : ''}`;
const kvTable = kv => `<table class="kv"><tbody>${kv.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>`;
const notesStd = (gs, extra = []) => `<div class="notes">${gs.map(g => `<div><span class="g">${g}</span>${NOTE[g]}</div>`).join('')}${extra.map(e => `<div><span class="g"></span>${e}</div>`).join('')}</div>`;
const theme = (o) => ({
  bd: { now: `<span class="bd now">${o.now}</span>`, dep: `<span class="bd dep">${o.dep}</span>`, act: `<span class="bd act">${o.act}</span>` },
  src: r => r.disputed ? `<span class="src disp" title="Counts for nobody until the league settles it">${o.disp}</span>` : r.recalled ? `<span class="src" title="From memory: no game record exists">${o.rec}</span>` : '',
  sep: o.sep || ' · ', notes: o.notes || notesStd,
});
const navLinks = () => NAV.map(([k, l]) => `<a href="${navHref(k)}" class="${k === page ? 'on' : ''}">${l}</a>`).join('');

function recParts(vm, T) {
  return {
    title: 'Fewest wins in a season', sub: 'Regular season · the ten lowest, plus anyone tied with 10th',
    filters: `<div class="filters">${ERAS.map(([k, l]) => `<a class="${vm.era === k ? 'on' : ''}" href="${url({ era: k === 'all' ? null : k })}">${l}</a>`).join(T.sep)}</div>`,
    table: tbl([
      { h: '#', num: 1, cell: r => (r.tied ? '=' : '') + r.rank },
      { h: 'Team', cell: r => `<a class="fr" href="${fUrl(r.f)}">${esc(r.team)}</a>${r.team !== F[r.f].name ? ` <span class="alias">(${fname(r.f)})</span>` : ''}${r.dep ? T.bd.dep : ''}${r.now ? T.bd.now : ''}` },
      { h: 'W-L-T', num: 1, cell: r => wlt(r) + (r.gap ? mk('†') : '') },
      { h: 'Win %', num: 1, cell: r => pct(r.pct) },
      { h: 'PF/G', num: 1, cell: r => n2(r.ppg) },
      { h: 'Season', num: 1, cell: r => seasonLink(r.s) },
    ], vm.rows, rowCls),
    noteList: [vm.used, ['Season lengths differ (13 or 14 weeks), so wins are raw counts.']],
    more: `<a class="more" href="#">Full list in Statsguru →</a>`,
    top: vm.rows[0],
  };
}

function profParts(vm, T) {
  const c = vm.c, sbOf = s => vm.sb.find(x => x.s === s);
  const gamesTbl = gs => tbl([
    { h: 'Pts', num: 1, cell: g => n2(g.pts) }, { h: 'Opponent', cell: g => `v <a href="${fUrl(g.opp)}">${fname(g.opp)}</a>` }, { h: 'When', num: 1, cell: g => `${g.s} wk ${g.w}` },
  ], gs);
  return {
    name: esc(vm.fr.name), emoji: vm.fr.emoji || '🏈', status: vm.fr.active ? T.bd.act : T.bd.dep,
    meta: `${vm.seasons.length} seasons, ${vm.span}`, sg: `<a class="more" href="${url({ page: 'statsguru', f: vm.id })}">Open in Statsguru →</a>`,
    kv: [['Regular season', wlt(c) + mk('†')], ['Win %', pct(c.pct)], ['PF per game', n2(c.pf / c.gp)], ['PA per game', n2(c.pa / c.gp)], ['Breakdown %', pct(c.bdPct) + mk('*')], ['Playoff appearances', c.po], ['Shit Bowl winner titles', c.sbTitles]],
    seasons: tbl([
      { h: 'Season', cell: o => seasonLink(o.s) + (o.now ? T.bd.now : '') }, { h: 'Team name', cell: o => esc(o.team) },
      { h: 'W-L-T', num: 1, cell: o => wlt(o) + (o.gap ? mk('†') : '') }, { h: 'PF', num: 1, cell: o => n2(o.pf) }, { h: 'PA', num: 1, cell: o => n2(o.pa) },
      { h: 'Breakdown', num: 1, cell: o => o.bd ? wlt(o.bd) : '–' }, { h: 'Luck', num: 1, cell: o => o.bd ? (o.luck > 0 ? '+' : '') + pct(o.luck) : '–' },
      { h: 'Finish', cell: o => (o.po ? 'Playoffs' : '') + (sbOf(o.s) ? 'Shit Bowl' + T.src(sbOf(o.s)) : '') },
    ], vm.seasons, o => o.now ? 'now' : ''),
    bracket: [...vm.sb.map(x => `${seasonLink(x.s)} Shit Bowl winner${T.src(x)}${x.disputed ? ` <span class="alias">with ${x.others.map(fname).join(', ')}</span>` : ''}`),
      ...vm.lost.filter(g => g.ph === 'P').map(g => `${seasonLink(g.s)} Playoffs wk ${g.w} v ${fname(g.opp)}${mk('‡')}`)],
    best: gamesTbl(vm.best), worst: gamesTbl(vm.worst),
    h2h: tbl([
      { h: 'Opponent', cell: o => `<a class="fr" href="${fUrl(o.opp)}">${fname(o.opp)}</a>${o.dep ? T.bd.dep : ''}` }, { h: 'Games', num: 1, cell: o => o.gp },
      { h: 'W-L-T', num: 1, cell: o => wlt(o) }, { h: 'Win %', num: 1, cell: o => pct(o.pct) }, { h: 'Last met', num: 1, cell: o => o.last },
    ], vm.h2h, o => o.dep ? 'dep' : ''),
    players: vm.players.length ? tbl([
      { h: 'NFL player', cell: p => `<a href="#">${esc(p.name)}</a> <span class="alias">${p.pos}</span>` }, { h: 'Starts', num: 1, cell: p => p.starts }, { h: 'Pts', num: 1, cell: p => n2(p.pts) },
    ], vm.players) : '',
    names: vm.seasons.map(o => `${o.s} <i>${esc(o.team)}</i>`).join('; '),
  };
}

function sgParts(vm, T) {
  return {
    query: SGQUERY, edit: '<a class="more" href="#">Edit query</a>',
    table: tbl(SGCOLS.map(([k, l]) => ({
      h: `<a href="${sortUrl(k, vm)}">${l}${k === 'hs' || k === 'ls' ? '*' : ''}${vm.col === k ? (vm.dir === 'desc' ? ' ▾' : ' ▴') : ''}</a>`, num: !(k === 'name' || k === 'span'), sorted: vm.col === k,
      cell: r => k === 'name' ? `<a class="fr" href="${fUrl(r.f)}">${esc(r.name)}</a>${r.gap ? mk('†') : ''}${r.lost ? mk('‡') : ''}${r.dep ? T.bd.dep : ''}` : sgCell(r, k),
    })), vm.rows, r => r.dep ? 'dep' : ''),
    noteList: [['†', '‡', '*'], QNOTES],
  };
}

// =====================================================================
// D: Broadsheet
// =====================================================================
const TD = theme({ now: 'This season', dep: 'dep.', act: 'Active', rec: 'recalled', disp: 'Disputed', sep: ' &nbsp;|&nbsp; ' });
const Dv = {
  shell: body => `<div class="mast"><div class="dateline"><span>Monday 12 October 2026</span><span>The Fantasy League · est. 2012</span><span>Daily edition</span></div>
    <div class="mtitle">The Record Book</div><nav>${navLinks()}</nav></div><main>${body}</main>`,
  records(vm) { const p = recParts(vm, TD);
    return Dv.shell(`<div class="kick">Records · Seasons</div><h1>${p.title}</h1><div class="deck">${p.sub}</div>${p.filters}
      <div class="cols3"><div>${p.table}</div><div><h4>The small print</h4>${TD.notes(...p.noteList)}${p.more}</div></div>`); },
  franchise(vm) { const p = profParts(vm, TD);
    return Dv.shell(`<div class="kick">Franchises ${p.status}</div><h1>${p.emoji} ${p.name}</h1><div class="deck">${p.meta}. ${p.sg}</div>
      <div class="full"><h4>Season by season</h4>${p.seasons}${TD.notes(['†'])}</div>
      <div class="paper"><section><h4>Career</h4>${kvTable(p.kv)}</section><section><h4>Bracket history</h4>${p.bracket.map(b => `<div>${b}</div>`).join('')}</section>
        <section><h4>Best games${mk('*')}</h4>${p.best}</section><section><h4>Worst games${mk('*')}</h4>${p.worst}</section>
        ${p.players ? `<section><h4>Most started${mk('¶')}</h4>${p.players}</section>` : ''}<section><h4>Team names</h4><div style="font-size:13px">${p.names}</div></section></div>
      <div class="full"><h4>Head-to-head</h4>${p.h2h}${TD.notes(['†'], ['Games with scores only.'])}</div>`); },
  statsguru(vm) { const p = sgParts(vm, TD);
    return Dv.shell(`<div class="kick">Statsguru</div><h1>The query</h1><div class="deck">${p.query}. ${p.edit}</div>
      <div class="cols3" style="grid-template-columns:3fr 1fr"><div>${p.table}</div><div><h4>The small print</h4>${TD.notes(...p.noteList)}</div></div>`); },
};

// =====================================================================
// E: Ceefax
// =====================================================================
const TE = theme({ now: 'NEW', dep: 'GONE', act: 'ACTIVE', rec: '(RECALLED)', disp: 'DISPUTED', sep: '' });
const PAGENO = { records: 302, franchise: 315, statsguru: 340 };
const Ev = {
  shell: (title, right, body) => `<div class="scr"><div class="hdr"><span>P${PAGENO[page]}</span><span><b>CEEFAX</b> ${PAGENO[page]}</span><span>Mon 12 Oct <b>21:14/32</b></span></div>
    <div class="band"><h1>${title}</h1><span>${right}</span></div>${body}
    <div class="fast"><a style="color:#f00" href="${navHref('records')}">Records</a><a style="color:#0f0" href="${navHref('franchise')}">Franchises</a><a style="color:#ff0" href="${navHref('statsguru')}">Statsguru</a><a style="color:#0ff" href="#">League</a></div></div>`,
  records(vm) { const p = recParts(vm, TE);
    return Ev.shell('Fewest wins', 'RECORDS', `<div class="sub">${p.sub}</div>${p.filters}${p.table}${TE.notes(...p.noteList)}${p.more}`); },
  franchise(vm) { const p = profParts(vm, TE);
    return Ev.shell(p.name, 'FRANCHISES', `<div class="sub">${p.meta} ${p.status}</div>${kvTable(p.kv)}
      <h2>Season by season</h2>${p.seasons}${TE.notes(['†'])}
      <h2>Bracket history</h2>${p.bracket.map(b => `<div>${b}</div>`).join('')}
      <div class="two"><div><h2>Best games${mk('*')}</h2>${p.best}</div><div><h2>Worst games${mk('*')}</h2>${p.worst}</div></div>
      <h2>Head-to-head</h2>${p.h2h}${p.players ? `<h2>Most started${mk('¶')}</h2>${p.players}` : ''}`); },
  statsguru(vm) { const p = sgParts(vm, TE);
    return Ev.shell('Statsguru', 'RESULTS', `<div class="sub">${p.query}</div>${p.table}${TE.notes(...p.noteList)}${p.edit}`); },
};

// =====================================================================
// F: Swiss
// =====================================================================
const TF = theme({ now: '● This season', dep: 'Departed', act: 'Active', rec: 'recalled', disp: 'Disputed', sep: '' });
const row = (lab, con) => `<div class="row"><div class="lab">${lab}</div><div>${con}</div></div>`;
const Fv = {
  shell: body => `<div class="top"><div class="logo">The Fantasy League</div><nav>${navLinks()}</nav></div><main>${body}</main>`,
  records(vm) { const p = recParts(vm, TF), t = p.top;
    return Fv.shell(row('Records<small>Seasons</small>', `<h1>${p.title}</h1>${p.filters}`) +
      row(`The record<small>${esc(t.team)}, ${t.s}${t.dep ? ' (departed)' : ''}</small>`, `<div class="huge">${t.w}–${t.l}</div>`) +
      row(`Top ten<small>${p.sub}</small>`, p.table + TF.notes(...p.noteList) + p.more)); },
  franchise(vm) { const p = profParts(vm, TF);
    return Fv.shell(row(`Franchise<small>${p.meta}<br>${p.status}</small>`, `<h1>${p.name}</h1>${p.sg}`) +
      row('Career', `<div class="kpis">${p.kv.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>`) +
      row('Season by season', p.seasons + TF.notes(['†'])) +
      row('Bracket history', p.bracket.map(b => `<div>${b}</div>`).join('')) +
      row(`Games<small>Highs and lows only come from games with scores${mk('*')}</small>`, `<div class="two"><div>${p.best}</div><div>${p.worst}</div></div>`) +
      row('Head-to-head', p.h2h + TF.notes(['†'], ['Games with scores only.'])) +
      (p.players ? row(`Most started${mk('¶')}`, p.players) : '')); },
  statsguru(vm) { const p = sgParts(vm, TF);
    return Fv.shell(row('Statsguru<small>Results</small>', `<h1>Totals per franchise</h1><div style="margin-top:10px">${p.query} · ${p.edit}</div>`) + row('Results', p.table + TF.notes(...p.noteList))); },
};

// =====================================================================
// G: Sidenotes (Tufte)
// =====================================================================
const TG = theme({ now: 'this season', dep: 'departed', act: 'in the league', rec: 'recalled', disp: 'disputed', sep: ' · ' });
const side = (gs, extra = []) => `<aside class="side">${gs.map(g => `<div><span class="g">${g}</span>${NOTE[g]}</div>`).join('')}${extra.map(e => `<div>${e}</div>`).join('')}</aside>`;
const sect = (main, notes) => `<div class="sect"><div>${main}</div>${notes}</div>`;
const Gv = {
  shell: body => `<div class="wrap"><div class="site"><a href="${url({ page: 'records' })}">The Fantasy League — a record book</a></div><nav>${navLinks()}</nav>${body}</div>`,
  records(vm) { const p = recParts(vm, TG);
    return Gv.shell(`<h1>${p.title}</h1><div class="sub">${p.sub}</div>${p.filters}` + sect(p.table + p.more, side(...p.noteList))); },
  franchise(vm) { const p = profParts(vm, TG), c = vm.c;
    return Gv.shell(`<h1>${p.name}</h1><div class="sub">${p.meta} · ${p.status}</div>` +
      sect(`<p>${p.name} have won ${c.w} and lost ${c.l} regular-season games${mk('†')}, a win rate of ${pct(c.pct)}%. Playing the whole league every week, they would have won ${pct(c.bdPct)}%${mk('*')}. They have reached the Playoffs ${c.po} times and been crowned Shit Bowl winner ${c.sbTitles} times.</p>${p.sg}`, `<aside class="side">${kvTable(p.kv)}</aside>`) +
      `<h2>Season by season</h2>` + sect(p.seasons, side(['†'], ['Breakdown and luck need every game, so the seasons with gaps are blank.', 'Disputed outcomes count for nobody until the league settles them; recalled ones come from memory.'])) +
      `<h2>Bracket history</h2>` + sect(p.bracket.map(b => `<div>${b}</div>`).join(''), side(['‡'])) +
      `<h2>Best and worst games</h2>` + sect(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">${p.best}${p.worst}</div>`, side(['*'])) +
      `<h2>Head-to-head</h2>` + sect(p.h2h, side(['†'], ['Games with scores only.'])) +
      (p.players ? `<h2>Most started</h2>` + sect(p.players, side(['¶'])) : '')); },
  statsguru(vm) { const p = sgParts(vm, TG);
    return Gv.shell(`<h1>Statsguru</h1><div class="sub">${p.query}. ${p.edit}</div>` + sect(p.table, side(...p.noteList))); },
};

// =====================================================================
// H: Ledger
// =====================================================================
const TH = theme({ now: 'This season', dep: 'Gone', act: 'Active', rec: 'from memory', disp: 'Disputed', sep: '' });
const Hv = {
  shell: body => `<div class="page"><div class="tabs">${navLinks()}</div><div class="lt">The Fantasy League — Record Ledger</div>${body}</div>`,
  records(vm) { const p = recParts(vm, TH);
    return Hv.shell(`<h1>Folio 3. ${p.title}</h1><div class="sub">${p.sub}</div>${p.filters}${p.table}${TH.notes(...p.noteList)}${p.more}`); },
  franchise(vm) { const p = profParts(vm, TH);
    return Hv.shell(`<h1>Entry No. ${vm.id}: ${p.name} ${p.status}</h1><div class="sub">${p.meta}. ${p.sg}</div>${kvTable(p.kv)}
      <h2>Season by season</h2>${p.seasons}${TH.notes(['†'])}<h2>Bracket history</h2>${p.bracket.map(b => `<div>${b}</div>`).join('')}
      <div class="two"><div><h2>Best games${mk('*')}</h2>${p.best}</div><div><h2>Worst games${mk('*')}</h2>${p.worst}</div></div>
      <h2>Head-to-head</h2>${p.h2h}${p.players ? `<h2>Most started${mk('¶')}</h2>${p.players}` : ''}`); },
  statsguru(vm) { const p = sgParts(vm, TH);
    return Hv.shell(`<h1>Statsguru</h1><div class="sub">${p.query}. ${p.edit}</div>${p.table}${TH.notes(...p.noteList)}`); },
};

// =====================================================================
// I: Programme
// =====================================================================
const TI = theme({ now: 'This season', dep: 'Departed', act: 'Active', rec: 'recalled', disp: 'Disputed', sep: '' });
const box = (h, b, pad = true) => `<div class="box"><div class="bh">${h}</div>${pad ? `<div class="bi">${b}</div>` : b}</div>`;
const Iv = {
  shell: body => `<header><div class="in"><div class="ttl">The Fantasy League<small>Official record book</small></div><nav>${navLinks()}</nav></div></header><main>${body}</main>`,
  records(vm) { const p = recParts(vm, TI);
    return Iv.shell(`<h1>${p.title}</h1><div class="sub">${p.sub}</div>${p.filters}` + box('Top ten', p.table + TI.notes(...p.noteList) + p.more, false)); },
  franchise(vm) { const p = profParts(vm, TI);
    return Iv.shell(`<div class="hero"><div class="crest">${p.emoji}</div><div><h1>${p.name}</h1><div class="sub">${p.meta} ${p.status}</div>${p.sg}</div></div>
      <div class="two">${box('Career', kvTable(p.kv))}${box('Bracket history', p.bracket.map(b => `<div>${b}</div>`).join(''))}</div>
      ${box('Season by season', p.seasons + TI.notes(['†']), false)}
      <div class="two">${box(`Best games${mk('*')}`, p.best, false)}${box(`Worst games${mk('*')}`, p.worst, false)}</div>
      ${box('Head-to-head', p.h2h + TI.notes(['†'], ['Games with scores only.']), false)}${p.players ? box(`Most started${mk('¶')}`, p.players, false) : ''}`); },
  statsguru(vm) { const p = sgParts(vm, TI);
    return Iv.shell(`<h1>Statsguru</h1><div class="sub">${p.query}. ${p.edit}</div><br>` + box('Results', p.table + TI.notes(...p.noteList), false)); },
};
