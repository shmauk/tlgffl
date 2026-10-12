# PROTOTYPE: visual design (throwaway, never merged)

Answers [Visual design: the site's look across records, profiles and Statsguru](https://github.com/shmauk/tlgffl/issues/15).

Open `visual-design-prototype.html` (double-click). Use the bottom bar or ← / → to switch the look, and the bar's page buttons to switch the page:

- `?variant=A` **Scorecard**: Cricinfo-modern. Green top bar, compact sans-serif, zebra rows, coloured pill badges, red markers, a notes box under each table, and a profile with a sidebar
- `?variant=B` **Almanack**: Wisden-style. Serif on paper, one centred column, booktabs rules, small caps, ink-coloured markers with footnotes set like a book, departed franchises in italics, this season in bold, and a profile that opens with prose
- `?variant=C` **Night desk**: a dark data app. Sidebar navigation, cards, monospace figures, in-cell bars, marker chips, glowing "Now" badges, a KPI-tile profile, and a win % chart with hatched † seasons

Pages: `?page=records` (Fewest wins in a season, with a working era filter), `?page=franchise&f=<id>` (defaults to The Dirty Birds, and any franchise link works), and `?page=statsguru` (totals per franchise, with sortable headers).

Prototype liberties: 2025 plays "this season" (the data stops there). The 2022–24 Shit Bowl winners are shown as "recalled" and 2021's two names as "disputed", to exercise the source notes. Championships aren't in the data, so they aren't shown.

Regenerate: `python3 inline.py` (data.json is a copy of the Statsguru prototype's real ff-data-project extract).
