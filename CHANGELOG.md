# Changelog

## [0.1.0] - 2026-09-14

First release.

- Google Maps link conversion on paste and by command, including `maps.app.goo.gl` short links on desktop. With a Google key, exact pins with rating, opening hours, address, website and photo; a text lookup is only accepted when it lands where the link points.
- Timeline cards fold their notes behind a chevron; the first line stays as the one-line summary. The camera and popups centre on the part of the map not covered by the floating timeline. "All" is the first chip.
- A refused Google request (API not enabled, key restricted) is reported once with Google's message; a **Test key** button in settings makes one Places and one Routes call. A leg whose result is already saved on the stop is never asked again.
- Range headings (`## 2026-09-19 ~ 2026-09-26 東京`) keep several days as one block for a stretch not yet planned day by day: one chip, one section, no weekday checks.
- Map pane beside the note: pins coloured and numbered per day heading, category emoji on pins, lines with arrowheads between a day's stops, click a pin for a card.
- Cursor follow: the map flies to the stop under the cursor and reframes the day; pauses while you drag.
- Timeline column: the day's stops top to bottom with thumbnails, times and notes; a transport picker on each arrow; drag to reorder (the stop's notes move with it); resizable and collapsible.
- Transport is the emoji before the link, written by you or by picking on the arrow in the pane (the pick replaces the emoji in the text, so note and map never disagree). Nothing is guessed.
- Routes between stops from Google Routes when a key is set (walk, bike, drive, transit with line names), drawn along the way with the mode's emoji at the midpoint; distance only otherwise. Late warning when a routed leg cannot fit between two written times.
- Opening-hours check against the written time for the heading's weekday.
- Indented lines under a stop are its notes, shown verbatim.
- Routed times, distances and line names are saved on the stop so companions without a key see them; stale after a reorder, then refetched.
- "Export to Google My Maps (KML)": one folder per day, named after the note, regenerated in full each time.
- `%%wf:{…}%%` metadata shown as a small chip in Live Preview and Reading view.
- "Insert day headings for a trip" command writing `## YYYY-MM-DD 週X` headings.
- Interface in English or Traditional Chinese, following Obsidian by default.
- `skills/wayfarer-plan-trip` skill for AI assistants, with the note format reference.
