# Contributing to the record book

The record book is maintained by four maintainers: shmauk, juffleberry, alistairwilliamtaylor and
shahazmat (`.github/CODEOWNERS`). There is no admin page. Every change, data or code, goes through
a pull request. CI checks it and deploys a preview, and a maintainer merges it. The words used here
are defined in `GLOSSARY.md`.

## No GitHub account? Use the league chat

Message a maintainer in the league chat. They open the issue or pull request for you, so your
GitHub handle and anything you'd type into a form never get linked to the league in public. The
site footer says the same: "Spot a mistake? Tell a maintainer in the league chat or open an issue."

League-mates with a GitHub account can open an issue themselves. Pick the **Correction**,
**New record** or **New award** template.

## Editing hand-kept data

Most data comes from NFL.com and Sleeper and is never edited by hand. The hand-kept tables in
`data/` record what no platform can supply:

| File | What it records |
|---|---|
| `franchises.csv` | Which franchise each NFL.com team and Sleeper roster belongs to. Ids are permanent and never reused |
| `sleeper_aliases.csv` | The franchise behind each Sleeper roster. Every roster needs a row by week 1 |
| `formats.yaml` | Each season's format. Every season needs one, so write next season's down before it starts |
| `shitbowl.csv`, `mediocre_bowl.csv` | NFL.com-era Shit Bowl and Mediocre Bowl winners. Blank means unknown, and `A\|B` means disputed |
| `sleeper_brackets.csv` | Which league bracket (or filler) each Sleeper bracket-week pairing belongs to. Every pairing needs a row once its week is final |
| `sleeper_adjustments.csv` | Why Sleeper's roster season totals differ from the games, to the point |
| `scissors_paper_rock.csv` | Scissors-paper-rock rulings, winner first, for franchises level after every other tiebreak |
| `keepers.csv` | The NFL players each franchise kept, with the draft round each cost. Record them after each draft |
| `division_lineages.csv` | Which division lineage each season's division belongs to. Every division needs a row once its season has games, and a lineage stays within one realignment |
| `emoji.csv` | Each franchise's badge |
| `documents.csv` | Links to the constitution and AGM documents |

Each file's header comment explains its columns. Franchises are always named by their
**franchise name**, the last team name they played under.

1. Edit the file on GitHub (the pencil icon) and choose **Create a new branch and start a pull
   request**. Editing in a clone works too.
2. Fill in the pull request template. If the change records a ruling, tick the box and cite it
   (see below).
3. CI runs `python -m recordbook.validate data` first. A bad row fails it with the file, the line
   and what's wrong, for example
   `data/shitbowl.csv line 39: franchise 'Beer Barons' is not a franchise name (...)`.
   Then the build, the privacy check and the agreement check run (see the README).
4. When CI is green, a comment on the pull request links the Cloudflare preview. Check that the
   pages you changed look right.

Some entries come round every season and have no named owner. The maintainers share them:
next season's format, aliases for new Sleeper rosters, keepers after the draft, and
scissors-paper-rock results. The build fails if the current season has no format, or if a roster
has no alias. Keepers that haven't been recorded don't fail the build. The site shows a "keepers
not yet recorded" note instead, so a late entry never blocks the daily refresh.

Never commit real names, screenshots, pasted chat text or raw sheets that carry them. The privacy
check catches forbidden fields, but it can't catch a name typed into a value.

## Rulings

A **ruling** is a decision the league makes, not one the data records: a franchise identity call,
a scissors-paper-rock result, a settled **disputed** outcome or a season's format.

- **Maintainers record rulings and never make them.** The **commissioner** has the final say. The
  role belongs to the person, not their franchise, and doesn't need maintainer access.
- **Cite the ruling in words, with no names**: who decided, where, when and the gist. For example:
  "Commissioner, league chat, 2026-09-03: same franchise".
- A link is fine only when the source is already public, like the constitution or AGM documents
  the site links to. Never attach screenshots or paste chat text, because they carry real names.
- Reviewers check that a ruling is cited, not whether it was the right call.

## Proposing records and awards

New records and new or changed awards are the maintainers' call. Open an issue (**New record** or
**New award**) and follow it with a pull request. Awards are light-hearted. They can be added or
changed with no league sign-off and no ruling. A changed formula recalculates every season,
including the current award leader. Past results aren't versioned, so git history is the only
record of what an award used to say.

## Reviewing and merging

- **During the build-up (now)**: every change goes through a pull request with green CI and a
  preview. A maintainer may merge their own pull request. Nobody pushes to `main` by hand.
- **Once the site is stable**: once it's live on its custom domain and the golden test against
  ff-data-project is retired, a pull request needs one approval from a maintainer other than its
  author. Any maintainer can switch this on in the branch protection settings.
- In both phases, the scheduled data workflow's bot commits raw platform snapshots straight to
  `main`. That exemption covers only that workflow and the snapshot paths.
