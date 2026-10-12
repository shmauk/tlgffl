# PROTOTYPE: Statsguru (throwaway, never merged)

Answers [Statsguru prototype: query filters, views and result shapes](https://github.com/shmauk/tlgffl/issues/9).

Open `statsguru-prototype.html` (double-click). Switch variants with the bottom bar or ← / →:

- `?variant=A`: Classic Statsguru form (the chosen layout): submit the form, read a results page, footnote markers for gaps. It now uses C's URL shape, and has an NFL-player subject (2025 on) and clear links
- `?variant=B`: Sentence builder: inline pills, live results, a coverage strip and a plain-language note on what's missing, a `q=` URL
- `?variant=C`: Faceted workbench: facets with counts, view tabs, a season × week coverage heatmap, a head-to-head matrix, a short `&` URL

All three share one query engine over real ff-data-project data (games, plus reported season lines where games are missing, per ADR 0001).

Regenerate the data: `python3 extract.py <path-to-ff-data-project> data.json && python3 inline.py`
