# PROTOTYPE: visual design (throwaway, never merged)

Answers [Visual design: the site's look across records, profiles and Statsguru](https://github.com/shmauk/tlgffl/issues/15).

Open `visual-design-prototype.html` (double-click). Use the bottom bar or ← / → to switch the look, and the bar's page buttons to switch the page:

- `?variant=A` **Scorecard**: Cricinfo-modern. Green top bar, compact sans-serif, zebra rows, pill badges, red markers, a notes box, and a profile with a sidebar
- `?variant=B` **Almanack**: Wisden-style. Serif on paper, one centred column, booktabs rules, small caps, footnotes set like a book, departed franchises in italics, this season in bold, and a profile that opens with prose
- `?variant=C` **Night desk**: a dark data app. Sidebar, cards, monospace figures, in-cell bars, marker chips, KPI tiles, and a win % chart with hatched † seasons
- `?variant=D` **Broadsheet**: a newspaper sports page. A heavy masthead, tight agate-type tables, a "small print" column, and a profile set in three newspaper columns
- `?variant=E` **Ceefax**: teletext. Black screen, block colours, double-height titles, a blinking NEW badge and fastext links
- `?variant=F` **Swiss**: Helvetica on an asymmetric grid. A label column on the left, a huge red record figure, and big-number career stats
- `?variant=G` **Sidenotes**: Tufte-style. B's book feel, but every footnote sits in the margin beside the table it explains
- `?variant=H` **Ledger**: a club scorebook. Ruled paper, typewriter type, rubber stamps for badges, and "from memory" in pencil handwriting
- `?variant=I` **Programme**: a vintage match programme. Slab serif, navy and orange, boxed sections, and an emoji crest
- `?variant=J` **Almanack, yellow jacket**: B with a Wisden-yellow masthead and black nav band
- `?variant=K` **Almanack by lamplight**: B in dark mode

Pages: `?page=records` (Fewest wins in a season, with a working era filter), `?page=franchise&f=<id>` (defaults to The Dirty Birds, and any franchise link works), and `?page=statsguru` (totals per franchise, with sortable headers).

Prototype liberties: 2025 plays "this season" (the data stops there). The 2022–24 Shit Bowl winners are shown as "recalled" and 2021's two names as "disputed", to exercise the source notes. Championships aren't in the data, so they aren't shown.

D–K live in `more-variants.css` / `more-variants.js` and are inlined by `inline.py`. Regenerate: `python3 inline.py` (data.json is a copy of the Statsguru prototype's real ff-data-project extract).
